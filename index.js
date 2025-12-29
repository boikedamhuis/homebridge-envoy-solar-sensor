'use strict';

const { Agent } = require('undici');

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

    this.api.on('didFinishLaunching', () => {
      this.log.info('Platform gestart');
      this.setupAccessory();
      this.startPolling();
    });
  }

  configureAccessory(accessory) {
    this.accessory = accessory;
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

    const service = this.accessory.getService(this.Service.ContactSensor)
      || this.accessory.addService(this.Service.ContactSensor, 'Production Active', 'production-active');

    service.setCharacteristic(this.Characteristic.Name, 'Production Active');

    if (service.testCharacteristic(this.Characteristic.StatusActive)) {
      service.updateCharacteristic(this.Characteristic.StatusActive, true);
    }

    if (service.testCharacteristic(this.Characteristic.StatusFault)) {
      service.updateCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
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
        this.updateState(watts);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        this.log.warn(`Uitlezen mislukt: ${msg}`);
        this.markFault();
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

  markFault() {
    if (!this.accessory) return;
    const service = this.accessory.getService(this.Service.ContactSensor);
    if (!service) return;

    if (service.testCharacteristic(this.Characteristic.StatusFault)) {
      service.updateCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.GENERAL_FAULT);
    }
  }

  clearFault() {
    if (!this.accessory) return;
    const service = this.accessory.getService(this.Service.ContactSensor);
    if (!service) return;

    if (service.testCharacteristic(this.Characteristic.StatusFault)) {
      service.updateCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
    }
  }

  updateState(productionWatts) {
    if (!this.accessory) return;

    const service = this.accessory.getService(this.Service.ContactSensor);
    if (!service) return;

    const { onT, offT } = this.getThresholds();

    const current = service.getCharacteristic(this.Characteristic.ContactSensorState).value;
    const isOpenNow = current === this.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

    let shouldBeOpen = isOpenNow;

    if (!isOpenNow && productionWatts >= onT) {
      shouldBeOpen = true;
    }

    if (isOpenNow && productionWatts <= offT) {
      shouldBeOpen = false;
    }

    const nextValue = shouldBeOpen
      ? this.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
      : this.Characteristic.ContactSensorState.CONTACT_DETECTED;

    service.updateCharacteristic(this.Characteristic.ContactSensorState, nextValue);
    this.clearFault();

    this.log.debug(`Productie ${productionWatts} W, aan ${onT} W, uit ${offT} W, actief ${shouldBeOpen}`);
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

    if (typeof wNow !== 'number') {
      throw new Error('production.json mist wNow in production items');
    }

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

    const res = await fetch(url, { headers, dispatcher });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} op ${url} ${text}`);
    }

    return await res.json();
  }
}
