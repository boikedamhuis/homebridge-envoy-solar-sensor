Homebridge Envoy Solar Sensor

Homebridge Envoy Solar Sensor is a Homebridge platform plugin that reads real time solar production data from an Enphase Envoy and exposes it to Apple HomeKit as a sensor.

By converting photovoltaic production into a simple active or inactive state, HomeKit automations can react to actual daylight conditions instead of fixed schedules or unreliable ambient light sensors. This makes it ideal for switching outdoor lighting, garden lights or other devices based on real solar output.

How it works

The plugin periodically polls the local Enphase Envoy for current solar production measured in watts.

When production rises above a configurable on threshold, the HomeKit sensor becomes active.
When production falls below a configurable off threshold, the sensor becomes inactive again.

Using two separate thresholds creates hysteresis, preventing rapid switching during clouds, shade or twilight conditions.

In HomeKit the sensor is exposed as a Contact Sensor.
Active solar production is represented as an open contact.
Low or no production is represented as a closed contact.

Supported Envoy endpoints

The plugin supports the most commonly available local Envoy endpoints.

Older Envoy firmware using the production.json endpoint.
Newer Envoy firmware using the api v1 production endpoint.

The correct endpoint can be selected directly in the Homebridge UI.

Installation

Install Homebridge if it is not already installed on your system.

Install the plugin using npm.

npm install homebridge-envoy-solar-sensor


Restart Homebridge after installation to load the plugin.

Configuration using Homebridge UI

This plugin is fully configurable using the Homebridge web interface.

Open the Homebridge UI and navigate to the plugin settings for Homebridge Envoy Solar Sensor.
All configuration options are presented as form fields and no manual editing of config.json is required.

The Envoy IP Address field should contain the local IP address or hostname of your Enphase Envoy.

The Protocol option allows selecting HTTP or HTTPS depending on your Envoy configuration.

The Envoy API Mode setting determines which endpoint is used to read production data.

The Poll Interval defines how often the Envoy is queried for new production values.

The On Threshold specifies the production level in watts above which the sensor becomes active.

The Off Threshold specifies the production level in watts below which the sensor becomes inactive again.

An optional authentication token can be provided for secured Envoy installations.

Example Homebridge configuration

When configured through the UI, Homebridge generates the following configuration internally.

{
  "platform": "EnvoySolarSensor",
  "name": "Solar Production",
  "host": "192.168.1.50",
  "protocol": "http",
  "mode": "productionJson",
  "pollIntervalSeconds": 10,
  "onThresholdW": 80,
  "offThresholdW": 30
}

HomeKit automations

Once the plugin is running, a Contact Sensor named Solar Production appears in the Home app.

Typical automations include turning outdoor lights off when solar production becomes active and turning outdoor lights on when solar production becomes inactive.

Because the automation is based on real solar output, lighting behavior naturally adapts to seasons, weather and cloud cover.

Error handling and reliability

If the Envoy cannot be reached or returns invalid data, the sensor reports a fault state in HomeKit.
Once communication is restored, the fault state is cleared automatically.

Polling is fully local and does not rely on cloud services.

Requirements

Node.js version 18 or higher is required.
Homebridge version 1.6 or higher is required.
An Enphase Envoy accessible on the local network is required.

License

This project is licensed under the MIT License.

Contributing

Contributions, improvements and feature requests are welcome.
Please open an issue or pull request on GitHub.