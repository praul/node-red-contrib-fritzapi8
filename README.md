# node-red-contrib-fritzapi

This fork fixes functionality with Fritz AHA-HTTP Api in Version 8.

I let Cline run widly over the original package and just provided it the pdf with the api changes. Took some fixing and adjusting, but this is working now on my end

Forked from dnknth

Control your smart home DECT devices through an AVM Fritz!Box with node-RED.

These nodes are a simple Node-RED wrapper for [andig's](https://github.com/andig) ever-popular
[fritzapi](https://www.npmjs.com/package/fritzapi), see there a for feature description.

## Installation

1. Clone the repo.
2. npm install ./node-red-contrib-fritzapi

## Configuration

Depending on your FRITZ!Box configuration, a user name may be needed. If your box is configured for password-only
admin access, leave the user name blank and only provide the admin password. Make sure that smart home control is
enabled on the FRITZ!Box.

## Usage

The packages contains `thermostat`, `switch`, `bulb`, `blind` nodes under the `advanced` section in the palette.

Thermostats, switches and blinds expect an actuator identification number `AIN` as `ain` or `topic` on the input message.

If both `ain` and `topic` are provided, `ain` has precedence.

Nodes have an (optional) pre-set action. It can be overriden with the `action` attribute on input messages.
See [fritzapi](https://www.npmjs.com/package/fritzapi) for a list of supported action names.

Any payload is accepted for information retrieval.

- For switch updates, send the desired boolean value
  (on or off).
- For thermostat updates, send the target temperature or adjustment in degrees Celsius. `on` and `off` may also be used to switch thermostats on or off.
  - There are two special cases: `setTempComfort` (Set to day temperature) and `setTempNight` (Set to night temperature)
    do not expect a temperature as payload, because they set the _target_ temperature to the day / night preset.
  - An [example flow](examples/Fritz%20HTTP%20API%20Example%20Flow.json) demonstrates usage of the `thermostat` node.
- Bulbs can be set to a given brightness level, color or color temperature. See the node documenation for details.
- Blinds be set to a desired level, or opened or closed.
  See the node documenation for details.

Adjustments are only made if the desired state differs from the actual state. All updates are logged.

All actions output the requested or updated value.

## Credits

Thanks dnknth for developing.
Kudos to [andig](https://github.com/andig) for [fritzapi](https://www.npmjs.com/package/fritzapi).
Also, substantial parts of the low-level interface were also written by [andig](https://github.com/andig) for
[homebridge-fritz](https://www.npmjs.com/package/homebridge-fritz). Thanks for the wizardry!
