Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/* constants */
const Cc = Components.classes;
const Ci = Components.interfaces;

function BrowserSocket() {
    this.uid = null;
    this.hosts = null;
    this.port = null;
    this.resourcePrefix = null;
    this.onerror = null;

    this.eventListeners = {};

    this.wrappedJSObject = this;
}

/* //[moved to server]
BrowserSocket.RESOURCE_PREFIX = '/bs/';
*/
BrowserSocket.prototype = {
    classDescription: "BrowserSocket Component",
    classID:          Components.ID("{e289069e-c25a-11df-a4c5-c14edfd72085}"),
    contractID:       "@hiit.fi/browsersocket;1",
    QueryInterface: XPCOMUtils.generateQI(),

    EVENT_TYPES: ['error', 'close'],

    stop: function() { /* added dynamically */ }
}
/* For EventTarget emulation */
BrowserSocket.prototype.addEventListener = function(type, listener, useCapture) {
    if (type in BrowserSocket.prototype.EVENT_TYPES) {
        if (typeof(this.eventListeners[type]) == 'undefined') {
            this.eventListeners[type] = [];
        }
        if (typeof(listener) == 'function') {
            this.eventListeners[type].push(listener);
        }
        /* NOTE: ignoring useCapture */
    }
}
BrowserSocket.prototype.removeEventListener = function(type, listener, useCapture) {
    if (typeof(this.eventListeners[type]) != 'undefined') {
        if (typeof(listener) == 'function') {
            for (var l in this.eventListeners[type]) {
                if (this.eventListeners[type][l] == listener) {
                    delete this.eventListeners[type][l];
                }
            }
        }
    }
}
BrowserSocket.prototype.dispatchEvent = function(evt) {
    if (typeof(this.eventListeners[evt.type]) != 'undefined') {
        for (var l in this.eventListeners[evt.type]) {
            this.eventListeners[evt.type][l](evt);
        }
    }
}

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
if (XPCOMUtils.generateNSGetFactory) {
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([BrowserSocket]);
}
else {
    var NSGetModule = XPCOMUtils.generateNSGetModule([BrowserSocket]);
}
