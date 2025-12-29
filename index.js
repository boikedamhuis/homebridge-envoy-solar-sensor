'use strict';

const { Agent, request } = require('undici');

const PLUGIN_NAME = 'homebridge-envoy-solar-sensor';
const PLATFORM_NAME = 'EnvoySolarSensor';

module.exports = (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, EnvoySolarPlatform);
};

class EnvoySolarPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;

    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.accessory = null;
    this.pollTimer = null;

    this.learnedExpectedInverters = 0;
    this.lastLeakState = null;

    this.lastInverterDebug = {
      source: 'none',
      onlineCount: 0,
      expected: 0,
      serialsSeen: [],
      lastError: '',
    };

    this.api.on('didFinishLaunching', () => {
      this.log.info('Platform gestart');
      this.setupAccessory();
      this.startPolling();
    });
  }

  configureAccessory(accessory) {
    this.accessory = accessory;
  }

  isInverterLeakEnabled() {
    return this.config.enableInverterLeakSensor !== false;
  }

  setupAccessory() {
    const name = this.config.name || 'Solar Production';
    const host = this.config.host;

    if (!host) {
      this.log.error('Config mist host. Voorbeeld host: "envoy.local" of "192.168.1.50"');
      return;
    }

    const uuid = this.api.hap.uuid.generate(`envoy-solar-sensor:${host}`);

    if (!this.accessory) {
      this.accessory = new this.api.platformAccessory(name, uuid);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
    } else {
      this.accessory.displayName = name;
    }

    const info = this.accessory.getService(this.Service.AccessoryInformation)
      || this.accessory.addService(this.Service.AccessoryInformation);

    info
      .setCharacteristic(this.Characteristic.Manufacturer, 'Enphase')
      .setCharacteristic(this.Characteristic.Model, 'Envoy')
      .setCharacteristic(this.Characteristic.SerialNumber, String(host));

    const productionService = this.accessory.getService(this.Service.ContactSensor)
      || this.accessory.addService(this.Service.ContactSensor, 'Production Active', 'production-active');

    productionService.setCharacteristic(this.Characteristic.Name, 'Production Active');

    if (productionService.testCharacteristic(this.Characteristic.StatusActive)) {
      productionService.updateCharacteristic(this.Characteristic.StatusActive, true);
    }

    if (productionService.testCharacteristic(this.Characteristic.StatusFault)) {
      productionService.updateCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
    }

    if (this.isInverterLeakEnabled()) {
      const inverterLeak = this.accessory.getService(this.Service.LeakSensor)
        || this.accessory.addService(this.Service.LeakSensor, 'Inverter Alert', 'inverter-alert');

      inverterLeak.setCharacteristic(this.Characteristic.Name, 'Inverter Alert');

      if (inverterLeak.testCharacteristic(this.Characteristic.StatusActive)) {
        inverterLeak.updateCharacteristic(this.Characteristic.StatusActive, true);
      }

      if (inverterLeak.testCharacteristic(this.Characteristic.StatusFault)) {
        inverterLeak.updateCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
      }

      inverterLeak.updateCharacteristic(
        this.Characteristic.LeakDetected,
        this.Characteristic.LeakDetected.LEAK_NOT_DETECTED
      );

      this.lastLeakState = this.Characteristic.LeakDetected.LEAK_NOT_DETECTED;
    } else {
      const existing = this.accessory.getService(this.Service.LeakSensor);
      if (existing) {
        this.accessory.removeService(existing);
        this.log.info('Inverter Alert Leak Sensor is disabled and has been removed');
      }
    }

    this.log.info(`Accessoire klaar: ${name} op host ${host}`);
  }

  startPolling() {
    if (!this.accessory) return;

    const interval = Math.max(5, Number(this.config.pollIntervalSeconds ?? 10));
    this.log.info(`Poll interval: ${interval} seconden`);

    const tick = async () => {
      try {
        const watts = await this.readProductionWatts();
        this.logWatts(watts);
        this.updateProductionState(watts);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        this.log.warn(`Uitlezen productie mislukt: ${msg}`);
        this.markProductionFault();
      }

      if (!this.isInverterLeakEnabled()) return;

      try {
        await this.checkInvertersAndUpdateLeak();
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        this.log.warn(`Uitlezen omvormers mislukt: ${msg}`);
        this.markInverterFault();
      }
    };

    tick();
    this.pollTimer = setInterval(tick, interval * 1000);
  }

  getThresholds() {
    const onT = Number(this.config.onThresholdW ?? 80);
    const offT = Number(this.config.offThresholdW ?? 30);
    return { onT, offT };
  }

  getMode() {
    return this.config.mode || 'productionJson';
  }

  getHost() {
    return this.config.host;
  }

  getToken() {
    const t = this.config.token;
    if (!t) return '';
    return String(t).trim();
  }

  getBaseUrl() {
    const protocol = this.config.protocol || 'https';
    return `${protocol}://${this.getHost()}`;
  }

  isInsecureTLSEnabled() {
    return Boolean(this.config.allowInsecureTLS);
  }

  isDebugLoggingEnabled() {
    return Boolean(this.config.debugLogging);
  }

  isInverterDebugEnabled() {
    return Boolean(this.config.inverterDebug);
  }

  getDebugBurstCount() {
    const n = Number(this.config.debugBurstCount ?? 0);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  consumeDebugBurst() {
    const n = this.getDebugBurstCount();
    if (n <= 0) return 0;
    this.config.debugBurstCount = n - 1;
    return n;
  }

  logWatts(productionWatts) {
    const burst = this.getDebugBurstCount();
    const debugEnabled = this.isDebugLoggingEnabled();

    if (burst > 0) {
      const before = this.consumeDebugBurst();
      this.log.info(`Envoy production: ${productionWatts} W (debug burst remaining: ${before - 1})`);
      return;
    }

    if (debugEnabled) {
      this.log.debug(`Envoy production: ${productionWatts} W`);
    }
  }

  getExpectedInverters() {
    const n = Number(this.config.expectedInverters ?? 0);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  markProductionFault() {
    if (!this.accessory) return;
    const service = this.accessory.getService(this.Service.ContactSensor);
    if (!service) return;

    if (service.testCharacteristic(this.Characteristic.StatusFault)) {
      service.updateCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.GENERAL_FAULT);
    }
  }

  clearProductionFault() {
    if (!this.accessory) return;
    const service = this.accessory.getService(this.Service.ContactSensor);
    if (!service) return;

    if (service.testCharacteristic(this.Characteristic.StatusFault)) {
      service.updateCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
    }
  }

  markInverterFault() {
    if (!this.accessory) return;
    const service = this.accessory.getService(this.Service.LeakSensor);
    if (!service) return;

    if (service.testCharacteristic(this.Characteristic.StatusFault)) {
      service.updateCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.GENERAL_FAULT);
    }
  }

  clearInverterFault() {
    if (!this.accessory) return;
    const service = this.accessory.getService(this.Service.LeakSensor);
    if (!service) return;

    if (service.testCharacteristic(this.Characteristic.StatusFault)) {
      service.updateCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
    }
  }

  updateProductionState(productionWatts) {
    if (!this.accessory) return;

    const service = this.accessory.getService(this.Service.ContactSensor);
    if (!service) return;

    const { onT, offT } = this.getThresholds();

    const current = service.getCharacteristic(this.Characteristic.ContactSensorState).value;
    const isOpenNow = current === this.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

    let shouldBeOpen = isOpenNow;

    if (!isOpenNow && productionWatts >= onT) shouldBeOpen = true;
    if (isOpenNow && productionWatts <= offT) shouldBeOpen = false;

    const nextValue = shouldBeOpen
      ? this.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.Characteristic.ContactSensorState.CONTACT_DETECTED;

    service.updateCharacteristic(this.Characteristic.ContactSensorState, nextValue);
    this.clearProductionFault();

    this.log.debug(`Productie ${productionWatts} W, aan ${onT} W, uit ${offT} W, actief ${shouldBeOpen}`);
  }

  async checkInvertersAndUpdateLeak() {
    if (!this.accessory) return;

    const leakService = this.accessory.getService(this.Service.LeakSensor);
    if (!leakService) return;

    const inverterInfo = await this.readInverterInfo();

    const configuredExpected = this.getExpectedInverters();
    if (configuredExpected <= 0 && this.learnedExpectedInverters <= 0) {
      this.learnedExpectedInverters = inverterInfo.onlineCount;
      this.log.info(`Expected inverter count learned: ${this.learnedExpectedInverters}`);
    }

    const expected = configuredExpected > 0 ? configuredExpected : this.learnedExpectedInverters;

    this.lastInverterDebug = {
      ...inverterInfo,
      expected,
    };

    const missing = inverterInfo.onlineCount < expected;

    const nextLeakState = missing
      ? this.Characteristic.LeakDetected.LEAK_DETECTED
      : this.Characteristic.LeakDetected.LEAK_NOT_DETECTED;

    leakService.updateCharacteristic(this.Characteristic.LeakDetected, nextLeakState);
    this.clearInverterFault();

    if (this.isInverterDebugEnabled()) {
      const src = inverterInfo.source;
      const online = inverterInfo.onlineCount;
      const exp = expected;
      const err = inverterInfo.lastError ? ` error=${inverterInfo.lastError}` : '';
      const serialInfo = inverterInfo.serialsSeen.length > 0 ? ` serials=${inverterInfo.serialsSeen.length}` : '';
      this.log.info(`Inverter debug: source=${src} online=${online} expected=${exp}${serialInfo}${err}`);
    } else {
      this.log.debug(`Inverters: online ${inverterInfo.onlineCount}, expected ${expected}`);
    }

    if (this.lastLeakState !== nextLeakState) {
      this.lastLeakState = nextLeakState;

      if (missing) {
        this.log.warn(`Inverter Alert: online ${inverterInfo.onlineCount}, expected ${expected}`);
        if (this.isInverterDebugEnabled() && inverterInfo.serialsSeen.length > 0) {
          this.log.warn(`Inverter serials seen: ${inverterInfo.serialsSeen.slice(0, 25).join(', ')}`);
        }
      } else {
        this.log.info(`Inverter Alert cleared: online ${inverterInfo.onlineCount}, expected ${expected}`);
      }
    }
  }

  async readInverterInfo() {
    const base = this.getBaseUrl();

    const info = {
      source: 'none',
      onlineCount: 0,
      serialsSeen: [],
      lastError: '',
    };

    try {
      const url = `${base}/api/v1/production/inverters`;
      const data = await this.fetchJson(url);

      if (Array.isArray(data)) {
        const serials = [];
        const online = data.filter((x) => {
          if (!x) return false;
          const wNow = x.wNow ?? x.lastReportWatts ?? x.wattsNow;
          const ok = typeof wNow === 'number';
          if (ok) {
            const s = x.serialNumber ?? x.serial ?? x.sn;
            if (s) serials.push(String(s));
          }
          return ok;
        });

        info.source = 'api/v1/production/inverters';
        info.onlineCount = online.length > 0 ? online.length : data.length;
        info.serialsSeen = serials;
        return info;
      }
    } catch (e) {
      info.lastError = e && e.message ? e.message : String(e);
    }

    const url = `${base}/production.json`;
    const data = await this.fetchJson(url);

    const productionArray = data && data.production;
    if (!Array.isArray(productionArray)) throw new Error('production.json mist production array');

    const inv = productionArray.find((x) => x && x.type === 'inverters');
    const activeCount = inv && inv.activeCount;

    if (typeof activeCount !== 'number') throw new Error('production.json mist activeCount voor type inverters');

    info.source = 'production.json';
    info.onlineCount = Math.max(0, activeCount);
    return info;
  }

  async readProductionWatts() {
    const mode = this.getMode();
    const base = this.getBaseUrl();

    let url = '';
    if (mode === 'productionJson') url = `${base}/production.json`;
    else if (mode === 'v1Production') url = `${base}/api/v1/production`;
    else throw new Error(`Onbekende mode: ${mode}`);

    const data = await this.fetchJson(url);

    if (mode === 'productionJson') return this.extractWattsFromProductionJson(data);
    return this.extractWattsFromV1Production(data);
  }

  extractWattsFromProductionJson(data) {
    const productionArray = data && data.production;
    if (!Array.isArray(productionArray)) throw new Error('production.json mist production array');

    const byType = (t) => productionArray.find((x) => x && x.type === t);

    const eim = byType('eim');
    const inverters = byType('inverters');
    const production = byType('production');

    const candidate = eim || production || inverters || productionArray[0];
    const wNow = candidate && candidate.wNow;

    if (typeof wNow !== 'number') throw new Error('production.json mist wNow in production items');
    return Math.max(0, wNow);
  }

  extractWattsFromV1Production(data) {
    const wattsNow = data && (data.wattsNow ?? data.watts_now);
    if (typeof wattsNow === 'number') return Math.max(0, wattsNow);

    const wNow = data && data.production && Array.isArray(data.production) ? data.production?.[0]?.wNow : undefined;
    if (typeof wNow !== 'number') throw new Error('api/v1/production mist wattsNow of production[0].wNow');

    return Math.max(0, wNow);
  }

  async fetchJson(url) {
    const headers = { Accept: 'application/json' };

    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const allowInsecureTLS = this.isInsecureTLSEnabled();

    const dispatcher = url.startsWith('https://')
      ? new Agent({ connect: { rejectUnauthorized: !allowInsecureTLS } })
      : undefined;

    const res = await request(url, { method: 'GET', headers, dispatcher });

    if (res.statusCode === 401 || res.statusCode === 403) {
      throw new Error(`HTTP ${res.statusCode} unauthorized. Check token and that you pasted token only without Bearer.`);
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const body = await res.body.text().catch(() => '');
      throw new Error(`HTTP ${res.statusCode} on ${url} ${body}`);
    }

    const text = await res.body.text();
    return JSON.parse(text);
  }
}
