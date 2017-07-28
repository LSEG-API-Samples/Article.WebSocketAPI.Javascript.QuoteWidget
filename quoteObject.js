// ********************************************************************************************************
// QuoteWidget.js
// The QuoteWidget module is an Angular JS-based client utilizing Thomson Reuters Eikon WebSocket API to
// request and retrieve realtime market data.  The widget provides a display that is geared towards the 
// display of Equity-based instruments showing updates such as trades and quotes in realtime.  In addition, 
// the widget utlizes Angular JS animation to provide a visual clue when individual fields are updated.
//
// Author:  Nick Zincone
// Version: 1.0
// Date:    July 2017.
// ********************************************************************************************************

// App
// Main Application entry point.  Perform app-specific intialization within our closure
(function() 
{
    // Main application module.  This application depends on the Angular 'ngAnimate' module.
    // As the name implies, 'ngAnimate' provides animation using CSS styles which allows visual 
    // feedback when a field is updated in realtime.
    var app = angular.module('QuoteWidget',['ngAnimate']);
    
    // Configuration
    app.constant('config', {
        wsServer: '10.67.4.99:15000',   // Address of our Eikon WebSocket server.  Format: <ip>:<port>
        wsLogin: {                      // Elektron WebSocket login credentials
            user: 'user',
            appId: '256',
            position: '127.0.0.1',
            id: 500                     // Request ID - used to easily identify login response
        },
        wsService: 'ELEKTRON_EDGE',     // Elektron WebSocket service hosting realtime market data    
        wsInitialRic: 'TRI.N',
        wsStreamingID: 10,              // All MarketPrice streaming requests use the same ID.
        streaming: true                 // We should always be streaming, but for testing we can change
    });
    
    // ****************************************************************
    // Custom filters used when displaying data in our widget
    // ****************************************************************
    
    // substr
    // Enable the manipulation of strings using the native substr() functionality.
    app.filter('substr', function() {
        return( function(input, start, len) {
            if ( input ) return(input.substr(start,len));
        });
    });

    // trDate
    // Filters a TR date field from: [dd mmm yyyy] to [ddmmmyy].
    // Eg: 06 JUN 2017 ==> 06JUN17
    app.filter('trDate', function() {
        return( function(input) {
            if ( input ) return(input.substr(0,2) + input.substr(3,3) + input.substr(9,2));
        });
    });

    //******************************************************************************************
    // Sharable Services
    //
    // widgetStatus - Capture the status messages generated from the Elektron WebSocket server
    //                and display as a pull-down list to see history.
    //******************************************************************************************
    app.factory('widgetStatus', function ($timeout) {
        var statusList = [];

        return ({
            list: function () { return (statusList); },
            update: function (txt) {
                console.log(txt);
                var status = statusList[0];
                if (!status || status.msg != txt) {
                    if (status)
                        statusList[0].id = 1;

                    // Force the callback to always run asynchronously - prevents error:inprog (Already in Progress) error
                    $timeout(function() {
                        statusList.unshift({ id: 0, msg: txt });
                    }, 0);
                }
            }
        });
    });

    //**********************************************************************************************
    // User-defined Directives
    //
    // animateOnChange - Directive to show change in our view.
    //**********************************************************************************************
    app.directive('animateOnChange', function ($animate)
    {
        return (function (scope, elem, attr) {
            scope.$watch(attr.animateOnChange, function(newVal,oldVal)
            {
                if (newVal != oldVal) {
                    $animate.enter(elem, elem.parent(), elem, function () {
                        $animate.leave(elem);
                    });
                }
            })
        });
    });

    // Widget Controller
    // This controller manages all interaction, behavior and display within our application.
    app.controller('widgetController', function ($scope, $rootScope, widgetStatus, config )
    {
        // Some initialization
        var self = this;
        $scope.statusList = widgetStatus.list();
        this.requestedRic = config.wsInitialRic;       
        this.Ric = "";
        this.validRequest = false;
        this.error = "";
        this.requestID = 0;
        this.widget = {};
        this.connected = false;
        this.needsConfiguration = (config.wsServer === '<host:port>');
        
        this.connect = function ()
        {       
            widgetStatus.update("Connecting to the WebSocket service on [host:port] " + config.wsServer + "...");
            
             // Connect into our WebSocket server
            this.ws = new WebSocket("ws://" + config.wsServer+ "/WebSocket", "tr_json2");
            this.ws.onopen = this.onopen;
            this.ws.onmessage = this.onmessage;
            this.ws.onclose = this.onclose;               
            
            return(this);
        };
        
        // Onopen
        // We arrive here upon a valid connection to our Elektron WebSocket server.  Upon a valid connection,
        // we issue a request to login to the server.
        this.onopen = function()
        {
            widgetStatus.update("Connection to server is UP.");

            // Login to our WebSocket server
            self.login(config.wsLogin);
        };

        // onmessage
        // All messages received from our WebSocket server after we have successfully connected are processed here.
        // 
        // Messages received:
        //
        //  Login response: Resulting from our request to login.
        //  Ping request:   The WebSocket Server will periodically send a 'ping' - we respond with a 'pong'
        //  Data message:   Refresh and update market data messages resulting from our item request
        //
        this.onmessage = function (msg)
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
                            self.pong();
                        } else if ( msg.Id === config.wsLogin.id ) { // Did we get our login response?
                            // Yes, process it
                            self.processLogin(msg);
                        } else if ( msg.Type === "Status" ) {
                            // Report potential issues with our requested market data item
                            self.error = msg.Key.Name + ":" + msg.State.Text;
                            widgetStatus.update("Status response for item: " + self.error);
                        }
                       else {
                            // Otherwise, we must have received some kind of market data message
                            self.processMarketData(msg);
                       }
                    }
                }
                catch (e) {
                    widgetStatus.update(e.message);
                }       
            }
        }

        // onclose
        // In the event we could not initially connect or if our endpoint disconnected our connection, the event
        // is captured here.  We simply report and make note.
        this.onclose = function (closeEvent) {
            widgetStatus.update("Connection to server is Down/Unavailable");
            self.connected = false;
        };

        this.send = function (text) {
            if (this.ws)
                this.ws.send(text);
        };
            
        // Connect into our realtime server
        if ( !this.needsConfiguration )
            this.connect();

        // Send data
        $scope.$on('send', function (event, msg) {
            self.send(msg);
        });

        //*******************************************************************************
        // login
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
        //******************************************************************************
        this.login = function (login) {
            widgetStatus.update("Login request with user: [" + login.user + "]");
            
            // send login request message
            var login = {
                Id: login.id,
                Domain:	"Login",
                Key: {
                    Name: login.user,
                    Elements:	{
                        ApplicationId: login.appId,
                        Position: login.position
                    }
                }
            };

            // Submit to server
            this.send(JSON.stringify(login));
        };
        
        //*******************************************************************************
        // pong
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
        this.pong = function () {
            // Send Pong response
            var pong = {
                Type: "Pong"
            };

            // Submit to server
            this.send(JSON.stringify(pong));
        };        
        
        //*******************************************************************************
        // processLogin
        // Determine if we have successfully logged into our WebSocket server.  Within
        // our Login response, we need to check the following stanza:
        //
        // "State": {
        //     "Stream": <stream state>,    "Open" | "Closed"
        //     "Data": <data state>,        "Ok" | "Suspect"
        //     "Text": <reason>
        //  }
        //
        // We simply update the status with our result.
        //
        //*******************************************************************************
        this.processLogin = function (msg) {
            widgetStatus.update("Login state: " + msg.State.Stream + "/" + msg.State.Data + "/" + msg.State.Text);

            self.connected = msg.State.Data === "Ok";
            
            // Send off our initial MarketPrice request
            self.sendMarketPrice(self.requestedRic);
        }; 

        //*******************************************************************************
        // requestItem
        // When a user requests for an item from our widget, we fire off the request to
        // our server.
        //*******************************************************************************
        this.requestItem = function()
        {
            // No need to do anything if current request is the same
            if ( self.requestedRic != self.Ric )
                self.sendMarketPrice(self.requestedRic);
        }
        
        //*******************************************************************************************
        // closeRequest
        //
        // Eg JSON request format:
        // {
        //     "Id": 2,
        //     "Type": "Close"
        // }
        //*******************************************************************************************   
        this.closeRequest = function(item) {
            // Only CLOSE if we have something outstanding...
            if ( config.streaming && self.validRequest ) {
                // send marketPrice request message
                var close = {
                    Id: self.requestID,
                    Type: "Close"
                };

                // Submit to server
                this.send(JSON.stringify(close));               
            }                     
        };
        
        //*******************************************************************************************
        // sendMarketPrice
        //
        // Eg JSON request format:
        // {
        //     "Id": 2,
        //     "Key": {
        //        "Name": "TRI.N",
        //        "Service": "ELEKTRON_EDGE"
        //     }
        // }
        //
        // The 'Id' must be unique for each request for market data.  Because our widget will only
        // maintain one outstanding streaming request, we utilize a simple rolling number system for
        // our ID's.  In addition, whenever we we want to issue a new request, we also CLOSE the 
        // current stream, if one is open, to avoid issues as we eventually reuse ID's during 
        // rollover.
        //*******************************************************************************************   
        this.sendMarketPrice = function(item) {
            if ( !self.connected )
                return;
                
            widgetStatus.update("MarketPrice request: [" + item + "]");
            
            // Close our current item we are watching
            self.closeRequest(self.requestID);
                     
            // Rolling ID
            self.requestID = (self.requestID % 100) + 1;
            
            // send marketPrice request message
            var marketPrice = {
                Id: self.requestID,
                Streaming: config.streaming,
                Key: {
                    Name: item,
                    Service: config.wsService
                }
            };
            
            // Request becomes valid when we get a valid response
            self.validRequest = false;
            self.error = "";

            // Submit to server
            this.send(JSON.stringify(marketPrice));           
        };
        
        //********************************************************************************************
        // processMarketData
        // When requesting for market data, some form of response (or responses) will be
        // delivered from the Elektron WebSocket Server.  Here are the types of messages
        // expected to arrive:
        //
        //  - Refresh: Initial image received after requesting data.  All fields are included.
        //  - Update: Realtime update based on market conditions.  Only fields changed are included.
        //
        //********************************************************************************************
        this.processMarketData = function (msg) {            
            if ( msg.Type === "Refresh")
                self.processRefresh(msg);
            else
                self.processUpdate(msg);
            
            // Processing of some FIDs common to both Refresh and Update
            if ( msg.Type === "Refresh" || msg.UpdateType === "ClosingRun" ) {
                // Trade Price (modified)
                this.widget.TRDPRC_1 = (msg.Fields.TRDPRC_1 ? msg.Fields.TRDPRC_1 : msg.Fields.HST_CLOSE);

                // Change indicators (modified)
                this.widget.NETCHNG_1 = (msg.Fields.NETCHNG_1 ? msg.Fields.NETCHNG_1 : 0);
                this.widget.PCTCHNG = (msg.Fields.PCTCHNG ? msg.Fields.PCTCHNG : 0);
                this.widget.PriceTick = (msg.Fields.PRCTCK_1 ? msg.Fields.PRCTCK_1.charCodeAt(0) : '');                 
            }
                    
            // Propagate all model changes into the view
            $scope.$apply();
        }
        
        //********************************************************************************************
        // processRefresh
        // A refresh message contains the complete image of our market data item which contains all 
        // the latest values at the time we requested.  It is here we fill out our widget form with
        // the current data.
        //********************************************************************************************
        this.processRefresh = function (msg) {
            // Remember some details upon our initial image
            self.validRequest = true;
            self.Ric = msg.Key.Name;
            self.widget = msg.Fields;
            
            console.log(msg);            
        };       

        //********************************************************************************************
        // processUpdate
        // An update message contains only those fields that have been changed due to market conditions
        // such as a new trade or new offer.  Only those fields that have been updated will be
        // updated in our display widget.
        //********************************************************************************************
        this.processUpdate = function (msg) {
            // Recent trades (ripple fields)
            if ( msg.Fields.TRDPRC_1 ) {
                self.widget.TRDPRC_5 = self.widget.TRDPRC_4;
                self.widget.TRDPRC_4 = self.widget.TRDPRC_3;
                self.widget.TRDPRC_3 = self.widget.TRDPRC_2;               
                self.widget.TRDPRC_2 = self.widget.TRDPRC_1; 
                
                this.widget.PriceTick = (msg.Fields.PRCTCK_1 ? msg.Fields.PRCTCK_1.charCodeAt(0) : this.widgetPriceTick);
            }
            
            // Copy over the update FIDs - our widget will automatically update with changes
            for (var key in msg.Fields) {
                if (msg.Fields.hasOwnProperty(key))
                    self.widget[key] = msg.Fields[key];
            }
        };
    });
})();
   