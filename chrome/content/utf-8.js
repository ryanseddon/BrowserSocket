var UTF8 = (function() {
    return {
        encode: function(s) {
            return unescape(encodeURIComponent(s));
        },
        decode: function(s) {
            return decodeURIComponent(escape(s));
        }
    }
})();
