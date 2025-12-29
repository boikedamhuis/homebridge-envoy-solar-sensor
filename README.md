# Homebridge Envoy Solar Sensor

[![npm version](https://img.shields.io/npm/v/homebridge-envoy-solar-sensor)](https://www.npmjs.com/package/homebridge-envoy-solar-sensor)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-envoy-solar-sensor)](https://www.npmjs.com/package/homebridge-envoy-solar-sensor)
[![license](https://img.shields.io/npm/l/homebridge-envoy-solar-sensor)](https://github.com/boikedamhuis/homebridge-envoy-solar-sensor/blob/main/LICENSE)
[![homebridge](https://img.shields.io/badge/homebridge-%3E%3D1.6.0-blue)](https://homebridge.io/)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

Homebridge Envoy Solar Sensor is a Homebridge platform plugin that reads real-time solar production data from an Enphase Envoy and exposes it to Apple HomeKit as sensors.

The plugin allows HomeKit automations to respond to actual solar production instead of fixed schedules, making it ideal for controlling outdoor lighting, garden lights, or detecting inverter failures.

## Features

- Solar production exposed as a Contact Sensor
- Automatic day/night detection based on real PV output
- Inverter failure detection exposed as a Leak Sensor
- Local Envoy communication only, no cloud dependency
- Supports self-signed HTTPS certificates
- Optional authentication token support
- Built-in debugging and diagnostic logging

## How it works

The plugin periodically polls the local Enphase Envoy for current solar production measured in watts.

When production rises above the configured ON threshold, the Production Active sensor becomes active.
When production falls below the configured OFF threshold, the sensor becomes inactive again.

Using two separate thresholds prevents rapid switching during clouds or twilight.

## Inverter failure monitoring

The plugin can monitor the online status of all inverters connected to the Envoy.

If one or more inverters go offline, a HomeKit Leak Sensor called "Inverter Alert" is triggered.
Leak Sensors generate high-priority notifications in the Apple Home app and are well suited for critical alerts.

The inverter check uses the following strategy:

- Primary: api/v1/production/inverters
- Fallback: production.json activeCount

The expected inverter count can be configured manually or automatically learned on first successful poll.

## Supported Envoy endpoints

- production.json (most Envoy systems)
- api/v1/production (newer firmware)
- api/v1/production/inverters (inverter monitoring)

## Authentication token

Some Enphase Envoy installations require authentication to access local production data.

To obtain an access token, visit:

https://entrez.enphaseenergy.com/

Generate a bearer token and paste only the token value into the Homebridge UI.
Do not include the word "Bearer".

The token is used only for local communication with the Envoy.

## HTTPS and self-signed certificates

Most Envoy devices use a self-signed HTTPS certificate.

Enable "Allow Self-Signed HTTPS Certificate" in the Homebridge UI to prevent TLS errors.

## Installation

```bash
npm install homebridge-envoy-solar-sensor
```

Restart Homebridge after installation.

## Configuration using Homebridge UI

All configuration is done through the Homebridge web interface.

Key options:

- Envoy Address: IP address or hostname of the Envoy
- Protocol: HTTP or HTTPS (HTTPS recommended)
- Polling Interval: How often data is refreshed
- Production ON/OFF Thresholds: Control when production is considered active
- Enable Inverter Failure Monitoring: Toggle the Leak Sensor
- Expected Number of Inverters: Manual or automatic detection
- Debug options for troubleshooting

No manual editing of config.json is required.

## Debugging and diagnostics

- Production Debug Logging: Logs solar production every poll
- Inverter Debug Logging: Logs inverter data source and counts
- Temporary Debug Burst: Logs the next N polls at INFO level and stops automatically

## HomeKit sensors created

- Production Active (Contact Sensor)
- Inverter Alert (Leak Sensor, optional)

Enable notifications in the Apple Home app for the Inverter Alert sensor to receive immediate alerts when an inverter goes offline.

## License

MIT
