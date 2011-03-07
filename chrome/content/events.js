/** events.js

    Provide basic event listening/dispatching

    Konrad Markus <konker@gmail.com>
*/

if (typeof(events) != 'object') {
    var events = {};
}

events.mixin = function(that, m) {
    for (var p in m.prototype) {
        if (m.prototype.hasOwnProperty(p)) {
            that.prototype[p] = m.prototype[p];
        }
    }
    return that;
}
events.merge = function(that, m) {
    for (var p in m.prototype) {
        if (m.prototype.hasOwnProperty(p)) {
            that[p] = m.prototype[p];
        }
    }
    return that;
}

/*
if (typeof(Function.prototype.mixin) != 'function') {
    Function.prototype.mixin = events.mixin;
}
*/
events.EventTarget = function() { }
events.EventTarget.prototype._eventTarget_event_registry = {};
events.EventTarget.prototype.addEventListener = function(type, listener) {
    if (typeof(listener) == 'function') {
        if (!this._eventTarget_event_registry[type]) {
            this._eventTarget_event_registry[type] = [];
        }
        this._eventTarget_event_registry[type].push(listener);
    }
}
events.EventTarget.prototype.removeEventListener = function(type, listener) {
    if (this._eventTarget_event_registry[type]) {
        for (var l in this._eventTarget_event_registry) {
            if (this._eventTarget_event_registry[type][l] == listener) {
                delete this._eventTarget_event_registry[type][l];
            }
        }
    }
}
events.EventTarget.prototype.dispatchEvent = function(e) {
    if (this._eventTarget_event_registry[e.type]) {
        for (var l in this._eventTarget_event_registry[e.type]) {
            this._eventTarget_event_registry[e.type][l](e);
        }
    }
}

events.Event = function(type, data) {
    this.type = type;
    this.data = data || null;
}
