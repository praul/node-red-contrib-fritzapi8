const Fritz = require("./lib/fritzapi"),
    Promise = require("bluebird");

module.exports = function(RED) {
    function Fritzbox(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        if (!/^https?:\/\//.test(config.host)) {
            config.host = "http://" + config.host;
        }
        node.options = {
            strictSSL: config.strictSSL,
            url: config.host
        };

        node.init = function() {
            node.deviceList = [];
            node.login().then(function() {
                node.updateDeviceList();
            })
            .catch(function(error) {
                node.error(error);
            });
        };

        node.statusFlag = function(othernode) {
            node.login().then(function() {
                othernode.status({fill: "green", shape: "dot", text: "connected"});
            })
            .catch(function(error) {
                othernode.status({fill: "red", shape: "ring", text: "login failed"});
            });
        };

        node.updateDeviceList = function() {
            node.log("Updating devices");
            if (!node.fritzInstance) {
                node.fritzInstance = new Fritz(node.sid, node.options);
            }
            return node.fritzInstance.getDeviceList().then(function(devices) {
                node.deviceList = devices;
                node.ready = true;
                devices.forEach(function(device) {
                    node.log(`Found: ${device.identifier} (${device.name})`);
                });
            });
        };

        node.isReady = function() {
            return node.ready;
        };

        node.checkDevice = function(othernode, msg, flags) {
            if (!node.isReady()) {
                node.warn("Device not ready");
                return;
            }

            const ain = msg.ain || msg.topic;
            const device = node.deviceList.find(function(device) {
                // Handle both HAN-FUN and Zigbee identifiers
                return device.identifier === ain || 
                       device.identifier.replace(/\s/g, '') === ain;
            });
            if (device) return device;

            othernode.warn("unknown device: " + ain);

            if (node.deviceList.length > 0) {
                let res = {};
                node.deviceList.forEach(function(device) {
                    if (((+device.functionbitmask) & flags) == flags) {
                        res[device.name] = device.identifier;
                    }
                });
                othernode.warn({ 'Valid devices' : res});
            }
        };

        node.fritz = function(func) {
            const args = Array.prototype.slice.call(arguments, 1);

            // api call tracking
            if ((this.promise || Promise.resolve()).isPending()) {
                this.pending++;
                this.debug('%s pending api calls', this.pending);
            }

            this.promise = (this.promise || Promise.resolve()).reflect().then(() => {
                node.pending = Math.max(node.pending-1, 0);
                
                if (!node.fritzInstance || !node.sid) {
                    return node.login().then(() => {
                        node.fritzInstance = new Fritz(node.sid, node.options);
                        return node.fritzInstance[func].apply(node.fritzInstance, args);
                    });
                }
                
                return node.fritzInstance[func].apply(node.fritzInstance, args)
                .catch(function(error) {
                    if (error.message.includes("403")) {
                        return node.login().then(function() {
                            node.log("Fritz!Box session renewed");
                            node.fritzInstance = new Fritz(node.sid, node.options);
                            return node.fritzInstance[func].apply(node.fritzInstance, args);
                        })
                        .catch(function(error) {
                            node.error("Fritz!Box session renewal failed");
                            throw error === "0000000000000000"
                                ? "Invalid session id"
                                : error;
                        });
                    }
                    throw error;
                });
            })
            .catch(function(error) {
                node.warn(func + " failed");
                node.error(JSON.stringify(error));
                node.promise = null;
                return Promise.reject(func + " failed");
            });

            this.promise.then(function(res) {
                node.debug(func, JSON.stringify(res));
                return res;
            });

            return this.promise;
        };

        node.login = function() {
            return Fritz.getSessionID(
                node.credentials.username || "", 
                node.credentials.password, 
                node.options
            ).then(function(sid) {
                node.sid = sid;
                return sid;
            });
        }

        node.init();
    }

    RED.nodes.registerType("fritz-api", Fritzbox, {
        credentials: {
            username: {type: "text"},
            password: {type: "password"}
        }
    });

    // Re-export Fritz class constants for the node implementations
    Object.keys(Fritz).forEach(key => {
        if (key.startsWith('FUNCTION_')) {
            module.exports[key] = Fritz[key];
        }
    });

    function Thermostat(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.config = config;
        node.connection = RED.nodes.getNode(config.connection);

        node.on('input', function(msg) {
            const action = msg.action || node.config.action;
            if (!node.connection.isReady()) {
                setTimeout(() => node.emit('input', msg), 1000);
                return;
            }
            if (!node.connection.checkDevice(node, msg, Fritz.FUNCTION_THERMOSTAT)) return;

            node.connection.fritz(action, msg.ain || msg.topic, msg.payload).then(function(result) {
                msg.payload = result;
                node.send(msg);
            }).catch(function(error) {
                node.error(error);
            });
        });

        node.connection.statusFlag(node);
    }
    RED.nodes.registerType("fritz-thermostat", Thermostat);

    function Outlet(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.config = config;
        node.connection = RED.nodes.getNode(config.connection);

        node.on('input', function(msg) {
            const action = msg.action || node.config.action;
            if (!node.connection.isReady()) {
                setTimeout(() => node.emit('input', msg), 1000);
                return;
            }
            if (!node.connection.checkDevice(node, msg, Fritz.FUNCTION_OUTLET)) return;

            node.connection.fritz(action, msg.ain || msg.topic, msg.payload).then(function(result) {
                msg.payload = result;
                node.send(msg);
            }).catch(function(error) {
                node.error(error);
            });
        });

        node.connection.statusFlag(node);
    }
    RED.nodes.registerType("fritz-outlet", Outlet);

    function Bulb(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.config = config;
        node.connection = RED.nodes.getNode(config.connection);

        node.on('input', function(msg) {
            const action = msg.action || node.config.action;
            if (!node.connection.isReady()) {
                setTimeout(() => node.emit('input', msg), 1000);
                return;
            }
            if (!node.connection.checkDevice(node, msg, Fritz.FUNCTION_LIGHT)) return;

            node.connection.fritz(action, msg.ain || msg.topic, msg.payload).then(function(result) {
                msg.payload = result;
                node.send(msg);
            }).catch(function(error) {
                node.error(error);
            });
        });

        node.connection.statusFlag(node);
    }
    RED.nodes.registerType("fritz-bulb", Bulb);

    function Blind(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.config = config;
        node.connection = RED.nodes.getNode(config.connection);

        node.on('input', function(msg) {
            const action = msg.action || node.config.action;
            if (!node.connection.isReady()) {
                setTimeout(() => node.emit('input', msg), 1000);
                return;
            }
            if (!node.connection.checkDevice(node, msg, Fritz.FUNCTION_BLIND)) return;

            node.connection.fritz(action, msg.ain || msg.topic, msg.payload).then(function(result) {
                msg.payload = result;
                node.send(msg);
            }).catch(function(error) {
                node.error(error);
            });
        });

        node.connection.statusFlag(node);
    }
    RED.nodes.registerType("fritz-blind", Blind);
};
