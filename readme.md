BrowserSocket
=============

A Firefox plugin to create a socket server in the browser that other browser can connect to using the WebSocket API
-------------------------------------------------------------------------------------------------------------------

BrowserSocket API
-----------------

### Server (Really just firefox with the BrowserSocket plugin)

Once the extension is installed it will expose the <code>BrowserSocket()</code> constructor, which works very similar to the WebSocket constructor.

	var bs = new BrowserSocket(handler);
	
The handler function should return a new function instance.

	var bsConnection;

	function handler() {
		return new function() {
		  bsConnection = this;
			  
		  bsConnection.onmessage = function(msg) {
			// Run code when a message is received
		  }
		  bsConnection.onopen = function() {
			// Run code on socket opening
		  }
		  bsConnection.onclose = function(e) {
			// Run code on socket closing
		  }
		}
	}
  
To send messages to the BrowserSocket you use the <code>send</code> method.

	bs.send("message to send");
  
### Client

The client has to be a WebSocket supporting browser in order to connect and communicate with the BrowserSocket.

	var ws = new WebSocket("ws://127.0.0.1:12345/bs/1234567/");
  
The communication is done using the standard [WebSocket API](http://dev.w3.org/html5/websockets/).

A compelling reason to use it now
---------------------------------

If you want a compelling usecase to see why this extension is completely revolutionary, take a look at [my article](http://www.thecssninja.com/javascript/remote-debug) on using it for remote debugging.

Install it in either Firefox 3.6 or 4, you can grab the [latest build](https://github.com/ryanseddon/BrowserSocket/archives/master) on the download page.

Once installed run my jsconsole fork in Firefox and create a BrowserSocket instance by using <code>:createServer</code> command. This will generate a socket that you can connect to and give you the address to use.

### Connecting the client to a BrowserSocket

To connect to the BrowserSocket make sure your device is on the same network and it supports WebSockets. Load the remote debug bookmarklet, enter the socket address and your off.

	javascript:(function(doc)%20{var%20script%20=%20document.createElement('script');script.src%20=%20'http://labs.thecssninja.com/jsconsole/client.js';doc.body.appendChild(script);})(this.document);

### More info

In the mean time check out [browsersocket.org](http://browsersocket.org/). 

Plugin was created by two very smart people [Toni Ruottu](http://www.cs.helsinki.fi/u/twruottu/) and [Konrad Markus](http://konradmarkus.com/).