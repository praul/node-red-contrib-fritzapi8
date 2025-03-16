"use strict";

const Promise = require("bluebird");
const request = Promise.promisify(require("request"));
const querystring = require("querystring");
const crypto = require('crypto');
const debug = require('debug')('fritzapi');
const { DOMParser } = require('xmldom');

/**
 * Updated FritzAPI implementation for new Fritz!Box API
 */
class Fritz {
    // Bitmasks remain unchanged...
    static get FUNCTION_HANFUN() { return 1; }
    static get FUNCTION_LIGHT() { return 4; }
    static get FUNCTION_ALARM() { return 16; }
    static get FUNCTION_BUTTON() { return 32; }
    static get FUNCTION_THERMOSTAT() { return 64; }
    static get FUNCTION_POWER_METER() { return 128; }
    static get FUNCTION_TEMPERATURE() { return 256; }
    static get FUNCTION_OUTLET() { return 512; }
    static get FUNCTION_HANFUN_UNIT() { return 8192; }
    static get FUNCTION_SWITCHABLE() { return 32768; }
    static get FUNCTION_DIMMABLE() { return 65536; }
    static get FUNCTION_COLORCONTROL() { return 131072; }
    static get FUNCTION_BLIND() { return 262144; }
    static get FUNCTION_HUMIDITY() { return 1048576; }

    /**
     * Get session ID from the FRITZ!Box
     */
    static getSessionID(username, password, options = {}) {
        debug('Authenticating with Fritz!Box at %s', options.url || 'http://fritz.box');
        const fritz = new Fritz(null, options);
        
        return fritz._request({
            url: fritz.baseURL + '/login_sid.lua',
            method: 'GET'
        })
        .then(body => {
            const match = body.match("<SID>(.*?)</SID>");
            const sid = match ? match[1] : null;

            if (sid && sid !== "0000000000000000") {
                debug('Reusing existing session');
                return sid;
            }

            const challenge = body.match("<Challenge>(.*?)</Challenge>");
            if (!challenge) {
                throw new Error("Unable to get challenge from FRITZ!Box");
            }
            debug('Got challenge from Fritz!Box');

            // Create response using challenge-response process
            const response = challenge[1] + '-' + crypto
                .createHash('md5')
                .update(Buffer.from(challenge[1] + '-' + password, 'UTF-16LE'))
                .digest('hex');

            // Login with challenge response
            debug('Attempting login with challenge response');
            return fritz._request({
                url: fritz.baseURL + '/login_sid.lua',
                qs: {
                    username: username || '',
                    response: response
                }
            })
            .then(body => {
                const sid = body.match("<SID>(.*?)</SID>");
                if (!sid || sid[1] === "0000000000000000") {
                    debug('Authentication failed');
                    throw "Invalid credentials";
                }
                debug('Successfully authenticated');
                return sid[1];
            });
        });
    }

    constructor(sid, options) {
        this.sid = sid;
        this.options = options || {};
        this.baseURL = this.options.url || 'http://fritz.box';
        this.path = '/webservices/homeautoswitch.lua';
        this.parser = new DOMParser({
            errorHandler: {
                error: (msg) => debug('XML parse error: %s', msg),
                fatalError: (msg) => debug('XML fatal error: %s', msg)
            }
        });
    }

    // Helper method to make API requests
    _request(options) {
        options.url = options.url || (this.baseURL + this.path);
        if (this.sid && !options.url.includes('login_sid.lua')) {
            options.qs = options.qs || {};
            options.qs.sid = this.sid;
        }
        
        if (!this.options.strictSSL) {
            options.rejectUnauthorized = false;
        }

        debug('Request: %s %s', options.method || 'GET', options.url);
        if (options.qs) debug('Query params: %o', options.qs);

        return request(options).then((response) => {
            if (response.statusCode === 403) {
                debug('Request failed: Invalid session');
                throw new Error("403 Forbidden - Invalid session id");
            }
            if (response.statusCode !== 200) {
                debug('Request failed: %s %s', response.statusCode, response.statusMessage);
                throw new Error(response.statusCode + " " + response.statusMessage);
            }
            debug('Request successful');
            return response.body;
        });
    }

    /**
     * Get a list of all known devices
     */
    getDeviceList() {
        debug('Fetching device list');
        return this._request({
            qs: {
                switchcmd: "getdevicelistinfos"
            }
        }).then((body) => {
            // Parse XML response
            const devices = [];
            const doc = this.parser.parseFromString(body, "text/xml");
            const deviceNodes = doc.getElementsByTagName("device");

            for (let i = 0; i < deviceNodes.length; i++) {
                const device = deviceNodes.item(i);
                const identifier = device.getAttribute("identifier");
                const nameNode = device.getElementsByTagName("name").item(0);
                const name = nameNode ? nameNode.textContent : "";
                const presentNode = device.getElementsByTagName("present").item(0);
                
                debug('Found device: %s (%s)', identifier, name);
                
                devices.push({
                    identifier: identifier,
                    id: device.getAttribute("id"),
                    functionbitmask: parseInt(device.getAttribute("functionbitmask")),
                    fwversion: device.getAttribute("fwversion"),
                    manufacturer: device.getAttribute("manufacturer"),
                    productname: device.getAttribute("productname"),
                    name: name,
                    present: presentNode ? presentNode.textContent === "1" : false
                });
            }

            debug('Retrieved %d devices', devices.length);
            return devices;
        });
    }

    /**
     * Device control methods
     */
    getSwitchState(ain) {
        debug('Getting switch state for device %s', ain);
        return this._request({
            qs: {
                ain: ain,
                switchcmd: "getswitchstate"
            }
        }).then((body) => body === "1" ? 1 : 0);
    }

    setSwitchOn(ain) {
        debug('Setting switch ON for device %s', ain);
        return this._request({
            qs: {
                ain: ain,
                switchcmd: "setswitchon"
            }
        }).then((body) => body === "1");
    }

    setSwitchOff(ain) {
        debug('Setting switch OFF for device %s', ain);
        return this._request({
            qs: {
                ain: ain,
                switchcmd: "setswitchoff"
            }
        }).then((body) => body === "0");
    }

    getTemperature(ain) {
        debug('Getting temperature for device %s', ain);
        return this._request({
            qs: {
                ain: ain,
                switchcmd: "gettemperature"
            }
        }).then((body) => parseFloat(body) / 10);
    }

    getTempTarget(ain) {
        debug('Getting target temperature for device %s', ain);
        return this._request({
            qs: {
                ain: ain,
                switchcmd: "gethkrtsoll"
            }
        }).then((body) => {
            const temp = parseInt(body);
            return temp === 253 ? 0 : // OFF
                   temp === 254 ? 1 : // ON
                   (temp - 16) / 2 + 8; // Convert API value to °C
        });
    }

    setTempTarget(ain, temp) {
        let value;
        if (temp === 0) value = 253; // OFF
        else if (temp === 1) value = 254; // ON
        else value = Math.round((temp - 8) * 2 + 16);

        debug('Setting target temperature for device %s to %d°C (API value: %d)', ain, temp, value);
        return this._request({
            qs: {
                ain: ain,
                switchcmd: "sethkrtsoll",
                param: value
            }
        });
    }
}

module.exports = Fritz;