/* -*- coding: utf-8 -*-

 BrowserSocket Firefox extension: chrome/content/browsersocket.js

 Bootstraps the extension into the overlay, and provides general utility services and constants.

 Copyright 2010 Helsinki Institute for Information Technology
 and the authors.

 Authors:
       Toni Ruottu <toni.ruottu@iki.fi>
       Konrad Markus <konrad.markus@hiit.fi>

*/

/* constants */
var Cc = Components.classes;
var Ci = Components.interfaces;


var browsersocket = function() {
    return {
        init: function() {
            try {
                browsersocket.ui.setStatusText('Initing...');
                browsersocket.server.init();

                document.addEventListener('DOMContentLoaded', function(evt) {
                    // bridge the extension-javascript gap
                    if (evt.target instanceof HTMLDocument) {
                        var loader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
                                     .getService(Ci.mozIJSSubScriptLoader);

                        evt.target.wrappedJSObject.defaultView.__BrowserSocket = function(HandlerFactory) {
                            return browsersocket.server.server.listen(HandlerFactory, evt.target.wrappedJSObject);
                        }

                        /* use the script loader to insert the BrowserSocket function in to the document */
                        loader.loadSubScript("chrome://browsersocket/content/insertBS.js", evt.target.defaultView.wrappedJSObject);
                        
                    }
                }, false);

                //[TODO: handle close tab event?]
                gBrowser.addTabsProgressListener(browsersocket.events);
                gBrowser.tabContainer.addEventListener('TabClose', browsersocket.events.tabClose, false);
                
                // NOTE: useCapture must be true for this one
                document.addEventListener('beforeunload', browsersocket.events.beforeunload, true);
            }
            catch(ex) {
                browsersocket.server.server.debug(ex);
            }
        },
        server: {
            server: null,

            init: function() {
                try {
                    /* start the server */
                    browsersocket.server.server = Cc['@hiit.fi/browsersocketserver;1']
                                                .getService().wrappedJSObject;
                    
                    browsersocket.server.server.start();
                    browsersocket.ui.setStatusText('Started');
                }
                catch(ex) {
                    browsersocket.server.server.debug(ex);
                    browsersocket.ui.setStatusText('Error');
                }
            }
        },
        events: {
            STATE_START: 0x00000001, // from nsIWebProgressListener
        
            load: function(evt) {
                /* fired when a new window is opened,
                   not when a new tab is opened 
                */
                browsersocket.init();
                return true;
            },
            beforeunload: function(evt) {
                /* fired when a window is closed,
                   even if that is a result of closing the last tab */
                if (evt.target) {
                    browsersocket.server.server.destroySocketsBySourceDocument(evt.target.wrappedJSObject);
                }
                return true;
            },
            // blank funcs to implement nsIWebProgressListener
            onSecurityChange: function() {},
            onProgressChange: function() {},
            onStatusChange: function() {},
            onLocationChange: function() {},
            onStateChange: function(aBrowser, aWebProgress, aRequest, aStateFlags, aStatus) {
                if (aStateFlags & browsersocket.events.STATE_START) {
                    /* if this is the start of a request,
                       remove any sockets associated with the currentURI */
                    browsersocket.server.server.destroySocketsBySourceDocument(aBrowser.contentDocument.wrappedJSObject);
                }
                return true;
            },
            tabClose: function(evt) {
                /* fired when a tab is closed,
                   (as opposed to a window) */
                browsersocket.server.server.destroySocketsBySourceDocument(gBrowser.getBrowserForTab(evt.target).contentDocument.wrappedJSObject);
                return true;
            }
        },
        ui: {
            setStatusText: function(s) {
                var bsTextPanel = document.getElementById('bsTextPanel');
                if (bsTextPanel) {
                    var sText = '';
                    if (s != '') {
                        var sText = ': ' + s;
                    }
                    bsTextPanel.setAttribute('label', 'BrowserSocket'+ sText);
                    bsTextPanel.setAttribute('tooltiptext', 'BrowserSocket'+ sText);
                }
            }
        },
        tools: {
            /*----- Tools menu control panel -----*/
            win: null,

            init: function() {
                browsersocket.tools.ui.draw();
            },
            open: function(evt) {
                browsersocket.tools.win = window.open(
                    'chrome://browsersocket/content/browsersocketTools.xul',
                    'browsersocketToolsWin',
                    'width=650,height=434,resizable=yes,menubar=no'
                );
                if (browsersocket.tools.win) {
                    browsersocket.tools.win.focus();
                }
            },
            close: function(evt) {
                window.close();
                browsersocket.tools.win = null;
            },
            closeConnection: function(evt) {
                if (confirm('Are you sure you want to close this connection?')) {
                    var e = document.getElementById('connectionsTree');
                    if (e) {
                        var _id = browsersocket.tools.ui.connectionsView.index[e.currentIndex];
                        browsersocket.server.server.closeConnection(_id);
                    }
                    else {
                        browsersocket.server.server.debug('Could not find tree');
                    }
                }
            },
            destroyConnection: function(evt) {
                if (confirm('Are you sure you want to destroy this connection?')) {
                    var e = document.getElementById('connectionsTree');
                    if (e) {
                        var _id = browsersocket.tools.ui.connectionsView.index[e.currentIndex];
                        browsersocket.server.server.destroyConnection(_id);
                    }
                    else {
                        browsersocket.server.server.debug('Could not find tree');
                    }
                }
            },
            closeSocket: function(evt) {
                if (confirm('Are you sure you want to remove this handler and close all associated connections?')) {
                    var e = document.getElementById('socketsTree');
                    if (e) {
                        var uid = browsersocket.tools.ui.socketsView.index[e.currentIndex];
                        browsersocket.server.server.closeSocket(uid);
                    }
                    else {
                        browsersocket.server.server.debug('Could not find tree');
                    }
                }
            },
            destroySocket: function(evt) {
                if (confirm('Are you sure you want to destroy this handler and destroy all associated connections?')) {
                    var e = document.getElementById('socketsTree');
                    if (e) {
                        var uid = browsersocket.tools.ui.socketsView.index[e.currentIndex];
                        browsersocket.server.server.destroySocket(uid);
                    }
                    else {
                        browsersocket.server.server.debug('Could not find tree');
                    }
                }
            },
            toggleDebug: function(evt) {
                var e = document.getElementById('bsToolsDebugCheckbox');
                if (e) {
                    if (e.checked) {
                        browsersocket.server.server.DEBUG = true;
                    }
                    else {
                        browsersocket.server.server.DEBUG = false;
                    }
                }
            },
            toggleServer: function(evt) {
                if (browsersocket.server.server.running) {
                    browsersocket.server.server.stop();
                    browsersocket.ui.setStatusText('Stopped');
                }
                else {
                    browsersocket.server.server.start();
                    browsersocket.ui.setStatusText('Started');
                }
                browsersocket.tools.ui.draw();
            },
            ui: {
                INTERVAL_MS: 1000,

                draw: function() {
                    // status
                    var e0 = document.getElementById('bsToolsStatusLabel');
                    var e1 = document.getElementById('bsToolsPortLabel');
                    if (e0 && e1) {
                        if (browsersocket.server.server.running) {
                            e0.setAttribute('value', 'BrowserSocket server listening on port: ');
                            e1.setAttribute('value', browsersocket.server.server.port());

                            e0 = document.getElementById('bsToolsToggleServerButton');
                            if (e0) {
                                e0.setAttribute('label', 'Stop');
                            }

                            e0 = document.getElementById('bsToolsStatusIcon');
                            if (e0) {
                                e0.setAttribute('src', 'chrome://browsersocket/content/checkmark_32.png');
                            }
                        }
                        else {
                            e0.setAttribute('value', 'BrowserSocket server stopped');
                            e1.setAttribute('value', '');

                            e0 = document.getElementById('bsToolsToggleServerButton');
                            if (e0) {
                                e0.setAttribute('label', 'Start');
                            }

                            e0 = document.getElementById('bsToolsStatusIcon');
                            if (e0) {
                                e0.setAttribute('src', 'chrome://browsersocket/content/warning_32.png');
                            }
                        }
                    }

                    // debug
                    e0 = document.getElementById('bsToolsDebugCheckbox');
                    if (e0) {
                        if (browsersocket.server.server.DEBUG) {
                            e0.setAttribute('checked', true);
                        }
                        else {
                            e0.setAttribute('checked', false);
                        }
                    }

                    // sockets
                    e0 = document.getElementById('socketsTree');
                    if (e0) {
                        browsersocket.tools.ui.socketsView.init();
                        e0.view = browsersocket.tools.ui.socketsView;
                        if (browsersocket.tools.ui.socketsView.index.length > 0) {
                            e0.disabled = false;

                            // also enable the associated button
                            e0 = document.getElementById('bsToolsStopSocketButton');
                            if (e0) {
                                e0.disabled = false;
                            }
                        }
                        else {
                            e0.disabled = true;

                            // also disable the associated button
                            e0 = document.getElementById('bsToolsStopSocketButton');
                            if (e0) {
                                e0.disabled = true;
                            }
                        }
                    }

                    // connections
                    e0 = document.getElementById('connectionsTree');
                    if (e0) {
                        browsersocket.tools.ui.connectionsView.init();
                        e0.view = browsersocket.tools.ui.connectionsView;
                        if (browsersocket.tools.ui.connectionsView.index.length > 0) {
                            e0.disabled = false;

                            // also enable the associated button
                            e0 = document.getElementById('bsToolsCloseConnectionButton');
                            if (e0) {
                                e0.disabled = false;
                            }
                        }
                        else {
                            e0.disabled = true;

                            // also disable the associated button
                            e0 = document.getElementById('bsToolsCloseConnectionButton');
                            if (e0) {
                                e0.disabled = true;
                            }
                        }
                    }
                },
                socketsView: {
                    index: [],
                    init: function() {
                        browsersocket.tools.ui.socketsView.rowCount = 0;
                        browsersocket.tools.ui.socketsView.index = [];
                        for (var h in browsersocket.server.server.sockets) {
                            if (browsersocket.server.server.sockets.hasOwnProperty(h)) {
                                browsersocket.tools.ui.socketsView.index.push(h);
                                browsersocket.tools.ui.socketsView.rowCount++;
                            }
                        }
                    },
                    rowCount: 0,  
                    getCellText: function(row, col) {
                        try {
                            var uid = browsersocket.tools.ui.socketsView.index[row];
                            if (typeof(browsersocket.server.server.sockets[uid]) == 'undefined') {
                                return '';
                            }
                            else {
                                if (col.id == 'handlerCol') {
                                    return browsersocket.server.server.sockets[uid].bs.resourcePrefix;
                                }
                                else if (col.id == 'urlCol') {
                                    return browsersocket.server.server.sockets[uid].sourceURI;
                                }
                                else if (col.id == 'registeredCol') {
                                    return new Date(parseInt(browsersocket.server.server.sockets[uid].ts));
                                }
                            }
                        }
                        catch (ex) {
                            browsersocket.server.server.debug(ex);
                            return '';
                        }
                    },
                    setTree: function(treebox) { this.treebox = treebox; },
                    isContainer: function(row) { return false; },
                    isSeparator: function(row) { return false; },
                    isSorted: function() { return false; },
                    getLevel: function(row) { return 0; },
                    getImageSrc: function(row,col) { return null; },
                    getRowProperties: function(row,props) {},
                    getCellProperties: function(row,col,props) {},
                    getColumnProperties: function(colid,col,props) {}
                },
                connectionsView: {
                    index: [],
                    init: function() {
                        browsersocket.tools.ui.connectionsView.rowCount = 0;
                        browsersocket.tools.ui.connectionsView.index = [];
                        for (var c in browsersocket.server.server.connections) {
                            if (browsersocket.server.server.connections.hasOwnProperty(c)) {
                                if (browsersocket.server.server.connections[c]._active) {
                                    browsersocket.tools.ui.connectionsView.index.push(c);
                                    browsersocket.tools.ui.connectionsView.rowCount++;
                                }
                            }
                        }
                    },
                    rowCount: 0,  
                    getCellText: function(row, col) {
                        try {
                            var _id = browsersocket.tools.ui.connectionsView.index[row];
                            if (typeof(browsersocket.server.server.connections[_id]) == 'undefined') {
                                return '';
                            }
                            else {
                                if (col.id == 'connectionCol') {
                                    return new Date(parseInt(browsersocket.server.server.connections[_id].ts)).toString();
                                }
                                else if (col.id == 'hostCol') {
                                    return browsersocket.server.server.connections[_id].host;
                                }
                                else if (col.id == 'portCol') {
                                    return browsersocket.server.server.connections[_id].port;
                                }
                                else if (col.id == 'handlerCol') {
                                    var uid = browsersocket.server.server.connections[_id].handler.uid;
                                    return browsersocket.server.server.sockets[uid].bs.resourcePrefix;
                                }
                            }
                        }
                        catch (ex) {
                            browsersocket.server.server.debug(ex);
                            return '';
                        }
                    },
                    setTree: function(treebox) { this.treebox = treebox; },
                    isContainer: function(row) { return false; },
                    isSeparator: function(row) { return false; },
                    isSorted: function() { return false; },
                    getLevel: function(row) { return 0; },
                    getImageSrc: function(row,col) { return null; },
                    getRowProperties: function(row,props) {},
                    getCellProperties: function(row,col,props) {},
                    getColumnProperties: function(colid,col,props) {}
                }
            }
        },
        utils: {
            getPrefs: function() {
                return Cc["@mozilla.org/preferences-service;1"]
                       .getService(Ci.nsIPrefBranch);
            }
        }
    }
}();

/* [TODO: say something about this] */
window.addEventListener("load", browsersocket.events.load, false);

