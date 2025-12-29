# Homebridge Envoy Solar Sensor

Homebridge Envoy Solar Sensor is a Homebridge platform plugin that reads real time solar production data from an Enphase Envoy and exposes it to Apple HomeKit as a sensor.

By converting photovoltaic production into a simple active or inactive state, HomeKit automations can react to actual daylight conditions instead of fixed schedules or unreliable ambient light sensors. This makes the plugin ideal for switching outdoor lighting, garden lights or other devices based on actual solar output.

## How it works

The plugin periodically polls the local Enphase Envoy for current solar production measured in watts.

When production rises above a configurable on threshold, the HomeKit sensor becomes active.
When production falls below a configurable off threshold, the sensor becomes inactive again.

Using two separate thresholds creates hysteresis, preventing rapid switching during clouds, shade or twilight conditions.

In HomeKit the sensor is exposed as a Contact Sensor.

An open contact represents active solar production.
A closed contact represents low or no solar production.

## Supported Envoy endpoints

The plugin supports the most common local Envoy endpoints.

production.json for older and many current Envoy firmware versions
api/v1/production for newer firmware versions

The correct endpoint can be selected directly in the Homebridge UI.

## Authentication token

Some Enphase Envoy installations require authentication to access local production data.

To obtain an access token, visit:

https://entrez.enphaseenergy.com/

Log in with your Enphase account and generate a bearer token.

Paste only the token value into the Authentication Token field in the Homebridge UI.
Do not include the word Bearer.

The token is used only for local communication with the Envoy and is never sent to external services.

## HTTPS and self signed certificates

Many Enphase Envoy devices use a self signed HTTPS certificate.

If HTTPS requests fail, enable Allow Insecure TLS in the Homebridge UI.
This allows Homebridge to connect securely to the Envoy without certificate validation errors.

## Installation

Install Homebridge if it is not already installed on your system.

Install the plugin using npm.

```bash
npm install homebridge-envoy-solar-sensor
```

Restart Homebridge after installation.

## Configuration using Homebridge UI

This plugin is fully configurable using the Homebridge web interface.

Open the Homebridge UI and navigate to the plugin settings for Homebridge Envoy Solar Sensor.
All configuration options are presented as form fields and no manual editing of config.json is required.

## Debugging and logging

Debug Logging enables continuous logging of production watts at debug level.

Debug Burst Count logs the next configured number of polls at info level and then automatically stops.
This is useful for short term diagnostics without flooding the logs.
