function BrowserSocketBuffer() {
    this.rep = [];
}
BrowserSocketBuffer.prototype = {  
    addChunk: function(chunk) {
        this.rep.push(chunk);
    },
    byteAt: function(x) {
        for (var c=0; c<this.rep.length; c++) {
            if (x < this.rep[c].length) {
                return this.rep[c].charCodeAt(x) & 0xFF;
            }
            else {
                x -= this.rep[c].length;
            }
        }
        return null;
    },
    length: function() {
        var ret = 0;
        for (var c=0; c<this.rep.length; c++) {
            ret += this.rep[c].length;
        }
        return ret;
    },
    getAll: function() {
        return this.get(this.length());
    },
    get: function(bytes) {
        var ret = '';
        for (var c=0; c<this.rep.length; c++) {
            if (bytes <= this.rep[c].length) {
                for (var j=0; j<c; j++) {
                    ret += this.rep[j];
                }
                ret += this.rep[c].substr(0, bytes);
                return ret;
            }
            else {
                bytes -= this.rep[c].length;
            }
        }
        return null;
    },
    removeAll: function() {
        this.remove(this.length());
    },
    remove: function(bytes) {
        for (var c=0; c<this.rep.length; c++) {
            if (bytes <= this.rep[c].length) {
                if (c == (this.rep.length - 1) && bytes == this.rep[c].length) {
                    this.rep = [];
                }
                else {
                    this.rep[c] = this.rep[c].slice(bytes);
                    this.rep = this.rep.slice(c);
                }
                return;
            }
            else {
                bytes -= this.rep[c].length;
            }
        }
    },
    toString: function() {
        var ret = 'BrowserSocketBuffer[';
        for (var c=0; c<this.rep.length; c++) {
            ret += c + ' -> ';
            for (var b in this.rep[c]) {
                ret += this.rep[c].charCodeAt(b) + '|';
            }
            if (c != this.rep.length) {
                ret += ", ";
            }
        }
        ret += ']';
        return ret;
    }
}
