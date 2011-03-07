var http = (function() {
    return {
        LEND: String.fromCharCode(13) + String.fromCharCode(10),

        Request: function(firstLine, headers, body) {
            this.firstLine = firstLine || '';
            this.headers = headers || {};
            this.body = body || [];
            this.resource = '';
        },
        Response: function(firstLine, headers, body) {
            this.firstLine = firstLine || '';
            this.headers = headers || {};
            this.body = body || [];
        },
        parseRequest: function(raw) {
            var req = new http.Request();
            req.raw = raw;

            // split into headers and body
            var h_b = raw.split(http.LEND + http.LEND);
            if (h_b.length > 1) {
                for (var c in h_b[1]) {
                    req.body.push(h_b[1].charCodeAt(c) & 0xFF);
                }
            }
            else if (h_b.length > 0) {
                /*[TODO: assume empty body?]*/
                req.body = [];
            }
            else {
                // invalid request
                return null;
            }

            // split individual headers
            var h = h_b[0];
            var h = h.split(http.LEND);
            for (var i in h) {
                if (i == 0) {
                    req.firstLine = h[i];

                    // first line has method path and protocol
                    var m_p_p = h[i].split(" ");
                    if (m_p_p.length > 2) {
                        req.resource = m_p_p[1];
                    }
                }
                else {
                    // other headers, split into name and value
                    var n_v = h[i].indexOf(": ");
                    if (n_v != -1) {
                        req.headers[h[i].substring(0, n_v).toLowerCase()] = h[i].substring(n_v + 2);
                    }
                }
            }
            return req;
        },
        serializeResponse: function(res) {
            var raw = '';
            if (res.firstLine != '') {
                raw += res.firstLine + http.LEND;
            }
            for (var h in res.headers) {
                raw += h + ": " + res.headers[h] + http.LEND;
            }
            raw += http.LEND;
            for (var c in res.body) {
                raw += res.body[c];
            }

            return raw;
        }
    }
})();

