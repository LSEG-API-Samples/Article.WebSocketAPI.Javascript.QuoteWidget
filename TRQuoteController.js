//****************************************************************************************************************************************** 
// TRQuoteController
//
// The TRQuoteController is a generic interface supporting the ability to connect and receive real-time market data quotes from the
// Thomson Reuters Elektron WebSocket interface.  The controller is intentionally designed as a generic interface allowing appplication
// usage to work with any Javascript framework.
//
// Interface:
//
//      TRQuoteController()
//      TRQuoteController.connect(server, user, appId="256", position="127.0.0.1");
//      TRQuoteController.requestData(ric, serviceName, streaming=true);
//      TRQuoteController.closeRequest(id)
//      TRQuoteController.loggedIn()
//      TRQuoteController.onStatus(eventFn)
//      TRQuoteController.onMarketData(eventFn)
//
// Status Events:
//      TRQuoteController.status
//
// Author:  Nick Zincone
// Version: 1.0
// Date:    August 2017.
//****************************************************************************************************************************************** 



//
// TRQuoteController()
// Quote controller instance managing connection, login and message interaction to a TR Elektron WebSocket service.
//
function TRQuoteController() {  
    this._loggedIn = false;
    this._statusCb = null;
    this._marketDataCb = null;
    this._loginParams = {
        user: "",
        appID: "",
        position: ""
    };
    
    // Manage our Request ID's required by the Elektron WebSocket interface
    var  _requestIDs = [];
    
    // Retrieve the next available ID from our ID table
    this.getID = function() {
        for (var i in _requestIDs) {
            if (!_requestIDs[i]) {
                _requestIDs[i] = true;
                return(parseInt(i));
            }
        }
     
        _requestIDs[_requestIDs.length] = true;
        return(_requestIDs.length-1);
    }

    // Flag the request ID to be removed (available)
    this.removeID = function(id) {
        if ( _requestIDs[id] ) {
            _requestIDs[id] = false;
            return(true);
        }
        return(false);
    }
}

//
// Status events
TRQuoteController.prototype.status = {
    processingError: 0,
    connected: 1,
    disconnected: 2,
    loginResponse: 3,
    msgStatus: 4
};

//
// TRQuoteController.connect(server, user, appId="256", position="127.0.0.1")
// Initiate an asynchronous connection request to the specified server.  Upon successful connection, issue a login to our server
// using the supplied user/appId/position login parameters.
//
// Parameters:
//      server      Address of the Elektron WebSocket server.  Format: hostname:port.  Required.
//      user        DACs user ID.  Required.
//      appId       DACs application ID.  Optional.  Default: '256'.
//      position    DACs position.  Optional.  Default: '127.0.0.1'.
//
TRQuoteController.prototype.connect = function(server, user, appId="256", position="127.0.0.1") { 
    // Connect into our WebSocket server
    this.ws = new WebSocket("ws://" + server + "/WebSocket", "tr_json2");
    this.ws.onopen = this._onOpen.bind(this);
    this.ws.onmessage = this._onMessage.bind(this);
    this.ws.onclose = this._onClose.bind(this);
    this._loginParams.user = user;
    this._loginParams.appId = appId;
    this._loginParams.position = position;
}

//
// TRQuoteController.requestData(ric, serviceName, streaming=true)
// Request the market data from our WebSocket server.
//
// Parameters:
//      ric          Reuters Instrument Code defining the market data item.  Eg: AAPL.O 
//      serviceName  Name of service where market data is collected
//      streaming    Streaming-based (subscription) or Non-streaming (snapshot).  Default: streaming.
//
// Returns: ID of request.  This ID is used to close streaming requests only.  Closing a non-streaming request has no effect.
// 
TRQuoteController.prototype.requestData = function(ric, serviceName, streaming=true)
{
    if ( !this._loggedIn )
        return(0);
    
    // Rolling ID
    var id = this.getID();
    
    // send marketPrice request message
    var marketPrice = {
        Id: id,
        Streaming: streaming,
        Key: {
            Name: ric,
            Service: serviceName
        }
    };

    // Submit to server
    this._send(JSON.stringify(marketPrice)); 

    return(id);
};

// TRQuoteController.closeRequest(id)
//
// Close the open stream based on the 'id' returned when you requested the streaming data.
//   
TRQuoteController.prototype.closeRequest = function(id) 
{
    // Dend Close request message
    var close = {
        Id: id,
        Type: "Close"
    };

    // Submit to server
    this._send(JSON.stringify(close));
    
    // Cleanup our ID table
    this.removeID(id);
};

//
// onStatus
// Capture all status events related to connections, logins and general message status.  
//
// Parameters:
//      status {
//          statusCode: code,
//          statusMsg:  msg   
//      }
//
//      where code/msg is:
//          0 - processingError
//              msg contains text of error.
//          1 - connected
//              msg not defined.
//          2 - disconnected
//              msg not defined.
//          3 - login response
//              msg contains Elektron login response - see Elektron WebSocket API for details.
//          4 - msg status
//              msg contains Elektron status message - see Elektron WebSocket API for details.
TRQuoteController.prototype.onStatus = function(f) {
    if ( this.isCallback(f) ) this._statusCb = f;
}

//
// onMarketData
// Presents the market data refresh/update messages.  
//
// Parameters:
//      msg - Elektron WebSocket market data message.  Refer to the Elektron WebSocket API documentation for details.
//
TRQuoteController.prototype.onMarketData = function(f) {
    if ( this.isCallback(f) ) this._marketDataCb = f;
}

//
// loggedIn
// Returns true if we are successfully logged into the Elektron WebSocket server.
//
TRQuoteController.prototype.loggedIn = function() {
    return(this._loggedIn);
}






//*********************************************************************************************************     
// _onOpen (WebSocket interface)
// We arrive here upon a valid connection to our Elektron WebSocket server.  Upon a valid connection,
// we issue a request to login to the server.
//*********************************************************************************************************   
TRQuoteController.prototype._onOpen = function() {
    // Report to our application interface
    if ( this.isCallback(this._statusCb) ) this._statusCb(this.status.connected);

    // Login to our WebSocket server
    this._login();
};

//*********************************************************************************************************  
// _onClose (WebSocket interface)
// In the event we could not initially connect or if our endpoint disconnected our connection, the event
// is captured here.  We simply report and make note.
//*********************************************************************************************************
TRQuoteController.prototype._onClose = function (closeEvent) {
    this._loggedIn = false; 
    
    // Report to our application interface
    if ( this.isCallback(this._statusCb) ) this._statusCb(this.status.disconnected);
};

//*********************************************************************************************************      
// _onMessage (WebSocket interface)
// All messages received from our TR WebSocket server after we have successfully connected are processed 
// here.
// 
// Messages received:
//
//  Login response: Resulting from our request to login.
//  Ping request:   The WebSocket Server will periodically send a 'ping' - we respond with a 'pong'
//  Data message:   Refresh and update market data messages resulting from our item request
//*********************************************************************************************************  
TRQuoteController.prototype._onMessage = function (msg) 
{
    // Ensure we have a valid message
    if (typeof (msg.data) === 'string' && msg.data.length > 0)
    {
        try {
            // Parse the contents into a JSON structure for easy access
            var result = JSON.parse(msg.data);

            // Our messages are packed within arrays - iterate
            var size = result.length;
            var msg = {}
            for (var i=0; i < size; i++) {
                msg = result[i];
                
                // Did we encounter a PING?
                if ( msg.Type === "Ping" ) {
                    // Yes, so send a Pong to keep the channel alive
                    this._pong();
                } else if ( msg.Domain === "Login" ) { // Did we get our login response?
                    // Yes, process it. Report to our application interface
                    this._loggedIn = msg.State.Data === "Ok";
                    if ( this.isCallback(this._statusCb) ) this._statusCb(this.status.loginResponse, msg);
                } else if ( msg.Type === "Status" ) {
                    // Issue on our message stream.  Make our ID available is stream is closed.
                    if ( msg.State.Stream == "Closed") this.removeID(msg.Id);
                    
                    // Report potential issues with our requested market data item
                    if ( this.isCallback(this._statusCb) ) this._statusCb(this.status.msgStatus, msg);                        
                }
               else {
                    // Otherwise, we must have received some kind of market data message.  
                    // First update our ID table based on the refresh
                    if ( msg.Type === "Refresh" && msg.State.Stream === "NonStreaming" ) this.removeID(msg.Id);
                    
                    // Allow the application to process message
                    if ( this.isCallback(this._marketDataCb) ) this._marketDataCb(msg);
               }
            }
        }
        catch (e) {
            // Processing error.  Report to our application interface
            if ( this.isCallback(this._statusCb) ) this._statusCb(this.status.processingError, e.message);
        }       
    }
}

//********************************************************************************************************* 
// _login
// Once we connect into our Elektron WebSocket server, issue a login request as: 
//
// Eg JSON request format:
// {
//     "Domain": "Login",
//     "Id": 1,
//     "Key": {
//        "Name": "user",
//        "Elements": {
//           "ApplicationId": "256",
//           "Position": "127.0.0.1"
//     }
// }
//
// The supplied 'login' parameter contains our login configuration details.
//********************************************************************************************************* 
TRQuoteController.prototype._login = function () 
{
    // send login request message
    var login = {
        Id: this.getID(),
        Domain:	"Login",
        Key: {
            Name: this._loginParams.user,
            Elements:	{
                ApplicationId: this._loginParams.appId,
                Position: this._loginParams.position
            }
        }
    };

    // Submit to server
    this._send(JSON.stringify(login));
};

//*******************************************************************************
// _pong
// To keep the Elektron WebSocket connection active, we must periodically send a
// notification to the server.  The WebSocket server sends a 'Ping' message and 
// once received, our application acknowldges and sends a 'Pong'. 
//
// JSON request format:
// {
//     "Type": "Pong"
// }
//
//**************************************************************
TRQuoteController.prototype._pong = function () 
{
    // Send Pong response
    var pong = {
        Type: "Pong"
    };

    // Submit to server
    this._send(JSON.stringify(pong));
};      

//********************************************************************************************************* 
// _send
// Send a packet of data down our connected WebSocket channel.
//*********************************************************************************************************    
TRQuoteController.prototype._send = function (text) 
{
    if (this.ws)
        this.ws.send(text);
};

TRQuoteController.prototype.isCallback = function(methodName) { 
    return( (typeof methodName) == "function" ); 
}
