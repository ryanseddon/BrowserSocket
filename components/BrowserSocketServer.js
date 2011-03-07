Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/* constants */
const Cc = Components.classes;
const Ci = Components.interfaces;

function BrowserSocketServer() {
    this.DEBUG = true;

    this.running = false;

    this.serverSocket = null;
    this.aLoopbackOnly = false;

    this.sockets = null;
    this.connections = null;

    this.lib = null;

    this.wrappedJSObject = this;
}
  
BrowserSocketServer.RESOURCE_PREFIX_PREFIX = '/bs/';
BrowserSocketServer.prototype = {
    classDescription: "BrowserSocket Server Component",
    classID:          Components.ID("{3e3491a0-a6dd-11df-981c-0800200c9a66}"),
    contractID:       "@hiit.fi/browsersocketserver;1",
    QueryInterface: XPCOMUtils.generateQI(),

    /* use a singleton factory to make sure there is one server per browser */
    _xpcom_factory: {
        singleton: null,
        createInstance: function (aOuter, aIID) {
            if (aOuter != null) {
                throw Components.results.NS_ERROR_NO_AGGREGATION;
            }
            if (this.singleton == null) {
                this.singleton = new BrowserSocketServer();
            }
            return this.singleton.QueryInterface(aIID);
        }
    },

    listen: function(HandlerFactory, document) {
        var uid = Math.floor(Math.random() * Math.pow(10, 9));
        var bs = Cc['@hiit.fi/browsersocket;1']
                 .createInstance().wrappedJSObject;
        bs.uid = uid;
        bs.port = this.serverSocket.port;
        bs.resourcePrefix = BrowserSocketServer.RESOURCE_PREFIX_PREFIX + uid + '/';
        

        var that = this;
        bs.stop = function() {
            that.closeSocket(this.uid);
        }

        if (typeof(document.__browsersocket_uid__) == 'undefined') {
            document.__browsersocket_uid__ = this.uid();
        }

        var meta = {
            uid: uid,
            handlerFactory: HandlerFactory,
            sourceDocument: document,
            sourceURI: document.location.toString(),
            ts: (new Date()).getTime(),
            bs: bs
        }

        this.sockets[uid] = meta;
        this.debug("Added socket: " + uid + ', ' + document);

        return bs;
    },

    // implements nsIServerSocketListener
    onSocketAccepted: function(serverSocket, transport) {
        var connection = Cc['@hiit.fi/browsersocketconnection;1']
                         .createInstance().wrappedJSObject;
        connection.init(this, transport);
        this.connections[connection._id] = connection;
        this.debug("Accepted connection: " + connection._id);
    },
    // implements nsIServerSocketListener
    onStopListening: function(serverSocket, status) {
        this.destroy();
        this.debug("stopListening()");
    },


    closeSocket: function(uid) {
        this.debug("closing socket: " + uid);
        // close any associated connections
        for (var c in this.connections) {
            this.debug(c + ": " + this.connections[c]);
            if (this.connections[c].handler) {
                if (this.connections[c].handler.uid == uid) {
                    this.closeConnection(c);
                }
            }
        }
        if (this.sockets[uid]) {
            this.sockets[uid] = null;
            delete this.sockets[uid];
        }
    },
    closeSocketBySourceDocument: function(sourceDocument) {
        if (typeof(sourceDocument) != 'undefined') {
            this.debug('closeSocket: ' + sourceDocument);
            for (var h in this.sockets) {
                if (this.sockets[h].sourceDocument.__browsersocket_uid__ == sourceDocument.__browsersocket_uid__) {
                    this.closeSocket(this.sockets[h].uid);
                }
            }
        }
    },

    destroySocket: function(uid) {
        this.debug("destroying socket: " + uid);
        // close any associated connections
        for (var c in this.connections) {
            if (this.connections[c].handler) {
                if (this.connections[c].handler.uid == uid) {
                    this.destroyConnection(c);
                }
            }
        }
        if (this.sockets[uid]) {
            this.sockets[uid] = null;
            delete this.sockets[uid];
        }
    },
    destroySocketsBySourceDocument: function(sourceDocument) {
        if (typeof(sourceDocument) != 'undefined') {
            this.debug('destroySocketsBySourceDocument: ' + sourceDocument);
            for (var h in this.sockets) {
                if (this.sockets[h].sourceDocument.__browsersocket_uid__ == sourceDocument.__browsersocket_uid__) {
                    this.destroySocket(this.sockets[h].uid);
                }
            }
        }
    },

    closeConnection: function(_id) {
        this.debug("destroying connection: " + _id);
        if (this.connections[_id]) {
            this.connections[_id].handler.close();
            this.connections[_id] = null;
            delete this.connections[_id];
        }
    },
    destroyConnection: function(_id) {
        this.debug("removing connection: " + _id);
        if (this.connections[_id]) {
            this.connections[_id].destroy();
            this.connections[_id] = null;
            delete this.connections[_id];
        }
    },

    start: function() {
        if (this.running) {
            this.debug("Already running, doing nothing");
            return;
        }
        try {
            this.lib = {};
            var loader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
                         .getService(Ci.mozIJSSubScriptLoader);

            // Load in the crypto library.
            /* Note: crypto library expects a 'window' object to exist
               and for it to be the global scope
            */
            this.window = {};
            loader.loadSubScript("chrome://browsersocket/content/2.0.0-crypto.js", this);
            loader.loadSubScript("chrome://browsersocket/content/2.0.0-md5.js", this.window);

            this.lib.Crypto = this.window.Crypto;
            this.debug("Crypto: " + this.lib.Crypto);

            // load in the buffer helper library
            loader.loadSubScript("chrome://browsersocket/content/BrowserSocketBuffer.js", this.lib);
            this.debug("BrowserSocketBuffer: " + typeof(this.lib.BrowserSocketBuffer));

            // load in the http helper library
            loader.loadSubScript("chrome://browsersocket/content/http.js", this.lib);
            this.debug("http: " + this.lib.http);

            // load in the events helper library
            loader.loadSubScript("chrome://browsersocket/content/events.js", this.lib);
            this.debug("events: " + this.lib.events);

            // load in the UTF8 library
            loader.loadSubScript("chrome://browsersocket/content/utf-8.js", this.lib);
            this.debug("UTF8: " + this.lib.UTF8);

            this.serverSocket = Cc["@mozilla.org/network/server-socket;1"]
                                .createInstance(Ci.nsIServerSocket);

            /* port -1 (first param) indicates that a port will be automatically chosen */
            this.serverSocket.init(-1, this.aLoopbackOnly, -1);

            this.serverSocket.asyncListen(this);
            this.debug("serverSocket asyncListen() -> " + this.serverSocket.port);
            
            this.sockets = {};
            this.connections = {};

            this.running = true;
        }
        catch(ex) {
            for (var h in this.sockets) {
                if (this.sockets[h]) {
                    this.sockets[h].dispatchEvent(new this.lib.events.Event('error', e));
                }
            }
            this.error(ex);
        }
    },
    port: function() {
        return this.serverSocket.port;
    },
    stop: function() {
        if (this.serverSocket) {
            this.serverSocket.close();
        }
        this.destroy();
    },
    destroy: function() {
        // clean up members
        for (var r in this.sockets) {
            this.destroySocket(r);
        }
        this.sockets = null;

        // these should have been destroyed by destroySocket()
        for (var c in this.connections) {
            this.destroyConnection(c);
        }
        this.connections = null;

        for (var l in this.lib) {
            this.lib[l] = null;
            delete this.lib[l];
        }
        this.lib = null;

        this.serverSocket = null;
        this.running = false;
    },
    uid: function(s) {
        function uidpart() {
            return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
        }
        return uidpart() + '-' + uidpart() + '-' + uidpart();
    },
    error: function(s) {
        this.log('! ' + s);
    },
    debug: function(s) {
        if (this.DEBUG) {
            this.log('* ' + s);
        }
    },
    log: function(s) {
        Cc["@mozilla.org/consoleservice;1"]
        .getService(Ci.nsIConsoleService)
        .logStringMessage(s);
    }
}

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
if (XPCOMUtils.generateNSGetFactory) {
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([BrowserSocketServer]);
}
else {
    var NSGetModule = XPCOMUtils.generateNSGetModule([BrowserSocketServer]);
}

