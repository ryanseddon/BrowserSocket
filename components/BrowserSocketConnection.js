Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/* constants */
const Cc = Components.classes;
const Ci = Components.interfaces;

function BrowserSocketConnection() {
    this._id = (new Date()).getTime() + ':' + (Math.ceil(Math.random() * 10000));

    this.server = null;
    this.transport = null;
    this.handler = null;

    this.host;
    this.port;

    this.ts = (new Date()).getTime();

    this._buffer = null;
    this._handshook = false;

    this._alive = false;
    this._active = false;

    this.wrappedJSObject = this;
}
  
BrowserSocketConnection.prototype = {
    classDescription: "BrowserSocket Connection Component",
    classID:          Components.ID("{e62ad13e-c25e-11df-892e-6d54dfd72085}"),
    contractID:       "@hiit.fi/browsersocketconnection;1",
    QueryInterface: XPCOMUtils.generateQI(),

    HS_RE: null,

    init: function(server, transport) {
        this.server = server;
        this.transport = transport;

        this.host = transport.host;
        this.port = transport.port;

        // instantiate a buffer
        this._buffer = new this.server.lib.BrowserSocketBuffer();

        // Regular expression to test for a complete websockets handshake request.
        // Match two new lines, followed by 8 further bytes
        this.HS_RE = new RegExp(this.server.lib.http.LEND + this.server.lib.http.LEND + "[\\x00-\\xFF]{8}");

        if (this.transport) {
            // set up the input stream
            this.tis = this.transport.openInputStream(0, 0, 0);
            this.is = Cc["@mozilla.org/binaryinputstream;1"]
                      .createInstance(Ci.nsIBinaryInputStream);
            this.is.setInputStream(this.tis);

            // set up the output stream
            this.tos = this.transport.openOutputStream(1, 0, 0);
            this.os = Cc["@mozilla.org/binaryoutputstream;1"]
                      .createInstance(Ci.nsIBinaryOutputStream);
            this.os.setOutputStream(this.tos);
      
            // set up the data pump for async reads
            this.dataPump = Cc["@mozilla.org/network/input-stream-pump;1"]
                            .createInstance(Ci.nsIInputStreamPump);
            this.dataPump.init(this.tis, -1, -1, 0, 0, false);
            this.dataPump.asyncRead(this, null);
        }
        this._alive = true;
    },
    destroy: function() {
        this.server.debug("connection destroy()");
        if (!this._alive) {
            this.server.debug("destroy() called when init false");
        }
        this._alive = false;
        if (this.is) {
            this.is.close();
        }
        this.is = null;
        if (this.os) {
            this.os.close();
        }
        this.os = null;

        this.dataPump = null;
        this.handler = null;
        this._buffer = null;
        this.transport = null;
        this.server = null;
    },
    // implements nsIStreamListener
    onDataAvailable: function(request, context, inputStream, offset, count) {
        if (!this._alive) {
            this.rawLog("onDataAvailable() but not alive, aborting.");
            return;
        }
        this.server.debug("onDataAvailable()");
        while (this._alive && this.is && this.is.available() > 0) {
            var raw = this.is.readBytes(this.is.available());
            this._buffer.addChunk(raw);

            try {
                this._processBuffer();
            }
            catch (e) {
                if (this.server) {
                    this.server.error(e);
                    if (typeof(this.handler.onerror) == 'function') {
                        this.handler.onerror.call(this.handler);
                    }
                    this.handler.dispatchEvent(new this.server.lib.events.Event('error', e));
                }
                else {
                    throw e;
                }
            }
        }
    },
    _processBuffer: function() {
        this.server.debug("\t_processBuffer()");
        if (this._handshook) {
            while (this._alive) {
                if (!this._processWSBuffer()) {
                    break;
                }
           }
        }
        else {
            this._processHSBuffer();
        }
    },
    _processHSBuffer: function() {
        this.server.debug("\t\t_processHSBuffer()");

        // expecting a websockets handshake request.
        // ensure that it has completely arrived.
        var raw = this._buffer.getAll();
        if (!this._isCompleteHS(raw)) {
            return;
        }

        // instantiate a request object and test validity
        var req = new this.server.lib.http.parseRequest(raw);
        if (!req) {
            this.server.error("Could not parse http request: " + raw);
            return;
        }
        if (req.resource == '') {
            this.server.error("Could not find resource");
            return;
        }

        var uid = req.resource.match(/bs\/([^/]+)\//);
        if (uid) {
            uid = uid[1];
        }
        else {
            this.server.error("Could not find uid from: [" + req.resource + "]");
            return;
        }

        // use the factory to create a handler from the given uid
        var meta = this.server.sockets[uid];
        if (meta && meta.handlerFactory) {
            this.handler = meta.handlerFactory.call(this, req)
            this.handler.uid = uid;

            // merge in the EventTarget stuff
            //[FIXME: this has been removed from the spec?]
            this.server.lib.events.merge(this.handler, this.server.lib.events.EventTarget);

            this.server.debug("\t\t\tcreated handler instance for: " + uid);
            var that = this;

            // this can be overidden by handler, so don't clobber an existing function
            if (typeof(this.handler.handshakeResponseLoop) != 'function') {
                this.handler.handshakeResponseLoop = function(interceptedResponse) {
                    that.server.debug('using default handler handshake response');
                    return interceptedResponse;
                }
            }

            // provide the response
            var response = this.computeHandshake(req);
            if (response != null) { 
                // give the handler a chance to provide a custom response
                var loopResponse = this.handler.handshakeResponseLoop.call(this.handler, response);

                if (typeof(loopResponse) != 'undefined') {
                    if (loopResponse === null) {
                        // close the connection, but by-pass the onclose event disptch
                        this.server.debug('\thandshakeResponseLoop() returned null - closing.');
                        this.server.destroyConnection(this._id);
                        return;
                    }
                    this.server.debug('\tusing results of handshakeResponseLoop()');
                    response = loopResponse;
                }
                else {
                    this.server.debug('handshakeLoop() returned undefined, using default response');
                }

                // serialize to string
                response = this.server.lib.http.serializeResponse(response)

                // clear the buffer
                this._buffer.removeAll();

                // write to client
                this.os.write(response, response.length);
                this.os.flush();
                this._handshook = true;
                this._active = true;

                // attach "automatically avaliable" functions
                this.handler.send = function(data) {
                    if (typeof(data) == 'undefined' ) {
                        return;
                    }

                    that.server.debug('sending data: ' + data.length);

                    // make sure that the data is UTF8 encoded and correctly framed
                    data = that.server.lib.UTF8.encode(data);
                    that.os.write8(0x00);
                    that.os.write(data, data.length);
                    that.os.write8(0xFF);
                    that.os.flush();
                }
                this.handler.close = function() {
                    that.server.debug('!!! closing handler: ' + that._id);
                    that.os.write8(0xFF);
                    that.os.write8(0x00);
                    that.os.flush();
                    that.close();
                }

                // fire the onopen event on the handler
                if (typeof(this.handler.onopen) == 'function') {
                    this.handler.onopen.call(this.handler);
                }
                this.handler.dispatchEvent(new this.server.lib.events.Event('open'));
            }
            else {
                this.server.error('Could not perform handshake.');
                this._active = false;
                this.server.destroyConnection(this._id);
            }
        }
        else {
            this.server.error("No handler type for uid: " + uid);
            this._active = false;
            this.server.destroyConnection(this._id);
            return;
        }
    },
    _isCompleteHS: function(raw) {
        return (raw && raw.match(this.HS_RE));
    },
    _processWSBuffer: function() {
        this.server.debug("\t\t_processWSBuffer()");
        var data = '';
        var b = this._buffer.byteAt(0);
        if (b == null) {
            // buffer is empty
            return false;
        }
        else if (b == 0x00) {
            // text data, read until next 0xFF
            var i = 1;
            while (true) {
                b = this._buffer.byteAt(i);
                if (b == 0xFF) {
                    break;
                }
                if (b == null) {
                    // wait for next chunk
                    return false;
                }
                ++i;
            }

            // fetch the data and remove it from the buffer
            data = this._buffer.get(i+1);
            this._buffer.remove(i+1);

            // remove the framing bytes from the data
            data = data.slice(1, -1);

            // convert data to UTF-8 from a byte string
            var messageEvent = new this.server.lib.events.Event('message', this.server.lib.UTF8.decode(data));

            // invoke the handler
            if (typeof(this.handler.onmessage) == 'function') {
                this.handler.onmessage.call(this.handler, messageEvent);
            }
            if (this._alive) {
                this.handler.dispatchEvent(messageEvent);
            }
            return true;
        }
        else if (b == 0xFF) {
            b = this._buffer.byteAt(1);
            if (b == 0x00) {
                // close signal
                this.server.debug('Close signal received');
                this.close();
                return true;
            }
            else {
                // Invalid close frame
                this.server.error('Invalid close frame');
                if (typeof(this.handler.onerror) == 'function') {
                    this.handler.onerror.call(this.handler);
                }
                if (this._alive) {
                    this.handler.dispatchEvent(new this.server.lib.events.Event('error', 'Invalid close frame'));
                }
                return false;
            }
        }
        // unsupported frame
        this.server.error('Unsupported frame: [' + b + ']');
        if (typeof(this.handler.onerror) == 'function') {
            this.handler.onerror.call(this.handler);
        }
        if (this._alive) {
            this.handler.dispatchEvent(new this.server.lib.events.Event('error', 'Unsupported frame: [' + b + ']'));
        }
        return false;
    },

    close: function() {
        this.server.debug('\tclose()');
        if (this.handler) {
            if (this.handler && typeof(this.handler.onclose) == 'function') {
                this.handler.onclose.call(this.handler);
            }
            if (this._alive) {
                this.handler.dispatchEvent(new this.server.lib.events.Event('close'));
                this.server.destroyConnection(this._id);
            }
        }
    },

    computeHandshake: function(req) {
        this.server.debug("\t\t\tcomputeHandshake()");
        //TODO: serious validation

        var key1 = req.headers['sec-websocket-key1'];
        var key2 = req.headers['sec-websocket-key2'];
        var body = req.body;
        var solution = this.solve(key1, key2, body);

        var host = req.headers['host'];
        var resource = req.resource;
        var origin = req.headers['origin'];
        var protocol = req.headers['sec-websocket-protocol'];

        /* formulate the response */
        var res = new this.server.lib.http.Response();
        res.body = solution;
        res.firstLine = 'HTTP/1.1 101 WebSocket Protocol Handshake';
     
        res.headers['Upgrade'] = 'WebSocket';
        res.headers['Connection'] = 'Upgrade';
     
        res.headers['Sec-WebSocket-Location'] = "ws://" + host + resource;
        res.headers['Sec-WebSocket-Origin'] = origin;
     
        /* //[If the server wants to implement this, it must override the handshakeResponseLoop]
        if (req.headers['sec-websocket-protocol']) {
            res.headers['Sec-WebSocket-Protocol'] = protocol;
        }
        */
     
        return res;
    },
    solve: function(key1, key2, body) {
        this.server.debug("\t\t\tsolve()");
        var key_number_1 = this.extractDigits(key1);
        var key_number_2 = this.extractDigits(key2);
     
        var spaces_1 = this.numSpaces(key1);
        var spaces_2 = this.numSpaces(key2);
      
        var part_1 = key_number_1 / spaces_1;
        var part_2 = key_number_2 / spaces_2;
      
        // convert numbers to byte arrays
        var pp1 = this.packToArray(part_1);
        var pp2 = this.packToArray(part_2);
        var pp3 = body;
      
        // join the byte arrays and calculate md5 hash
        var challenge = pp1.concat(pp2, pp3);
        return this.server.lib.Crypto.MD5(challenge, {asString: true});
    },
    numSpaces: function(s) {
        var ret = 0;
        for (var i=0; i<s.length; i++) {
            if (s[i] == ' ') {
                ++ret;
            }
        }
        return ret;
    },
    extractDigits: function(s) {
        var digits = "0123456789";
        var ret = [];
        for (var i=0; i<s.length; i++) {
            if (digits.indexOf(s[i]) != -1) {
                ret.push(s[i]);
            }
        }
        return ret.join('');
    },
    packToArray: function(n) {
        var ret = n.toString(16);
        var p = (8 - ret.length);
        for (var i=0; i<p; i++) {
            ret = ('0' + ret);
        }
        return this.server.lib.Crypto.util.hexToBytes(ret);
    },

    // implements nsIRequestObserver
    onStartRequest: function(aRequest, aContext) {
        this.server.debug("+++BrowserSocketConnection.onStartRequest()");
    },
    // implements nsIRequestObserver
    onStopRequest: function(aRequest, aContext, aStatusCode) {
        if (this.server) {
            this.server.debug("+++BrowserSocketConnection.onStopRequest()");
            this.close();
        }
    },
    rawLog: function(s) {
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
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([BrowserSocketConnection]);
}
else {
    var NSGetModule = XPCOMUtils.generateNSGetModule([BrowserSocketConnection]);
}

