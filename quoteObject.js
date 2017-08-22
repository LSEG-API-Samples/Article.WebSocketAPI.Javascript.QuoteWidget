// ********************************************************************************************************
// QuoteWidget.js
// The QuoteWidget module is an Angular JS-based client utilizing Thomson Reuters Elektron WebSocket API to
// request and retrieve realtime market data.  The widget provides a interface that is geared towards the 
// display of Equity-based instruments showing updates such as trades and quotes in realtime.  In addition, 
// the widget utlizes Angular JS animation to provide a visual clue when individual fields are updated.
//
// Author:  Nick Zincone
// Version: 1.0
// Date:    August 2017.
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
        wsServer: '<host:port>',        // Address of our Elektron WebSocket server.  Eg: ads:15000
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
        this.needsConfiguration = (config.wsServer === '<host:port>');
        
        // Our Elektron WebSocket interface
        this.quoteController = new TRQuoteController();
       
        // Connect into our realtime server
        if ( !this.needsConfiguration ) {
            widgetStatus.update("Connecting to the WebSocket service on [host:port] " + config.wsServer + "...");
            this.quoteController.connect(config.wsServer, config.wsLogin.user, config.wsLogin.appId, config.wsLogin.position);           
        }
        
        //*******************************************************************************
        // TRQuoteController.onStatus
        //
        // Capture all TRQuoteController status messages.
        //*******************************************************************************        
        this.quoteController.onStatus(function(eventCode, msg) {
            switch (eventCode) {                    
                case this.status.connected:
                    // TRQuoteController first reports success then will automatically attempt to log in to the TR WebSocket server...
                    widgetStatus.update("Connection to server is UP.");
                    widgetStatus.update("Login request with user: [" + config.wsLogin.user + "]");
                    break;
                    
                case this.status.disconnected:
                    widgetStatus.update("Connection to server is Down/Unavailable");
                    break;
                    
                case this.status.loginResponse:
                    self.processLogin(msg);
                    break;
                    
                case this.status.msgStatus:
                    // Report potential issues with our requested market data item
                    self.error = (msg.Key ? msg.Key.Name+":" : "");
                    self.error += msg.State.Text;
                    widgetStatus.update("Status response for item: " + self.error);                
                    break;
                    
                case this.status.processingError:
                    // Report any general controller issues
                    widgetStatus.update(msg);
                    break;
            }
        });
        
        //*********************************************************************************
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
        // If we logged in, submit our initial marketPrice request to our quote controller.
        //*********************************************************************************
        this.processLogin = function (msg) {
            widgetStatus.update("Login state: " + msg.State.Stream + "/" + msg.State.Data + "/" + msg.State.Text);

            if (this.quoteController.loggedIn())
                this.requestMarketPrice(this.requestedRic);  // Send off our initial MarketPrice request
        }; 

        //*******************************************************************************
        // requestItem
        // Based on user input from our widget UI, request for that item from our server.
        //*******************************************************************************
        this.requestItem = function()
        {
            // No need to do anything if current request is the same
            if ( this.requestedRic != this.Ric )
                this.requestMarketPrice(this.requestedRic);
        }
        
        //*******************************************************************************************
        // closeRequest
        //
        //*******************************************************************************************   
        this.closeRequest = function(id) {
            // Only CLOSE if we have something outstanding...
            if ( config.streaming && this.validRequest )
                this.quoteController.closeRequest(id);
        };
        
        //*******************************************************************************************
        // requestMarketPrice
        //
        // Our widget maintains only 1 outstanding streaming request.  As a result, we request for 
        // our new item and also close our current stream.
        //*******************************************************************************************   
        this.requestMarketPrice = function(item) {
            if ( !this.quoteController.loggedIn() )
                return;
                
            widgetStatus.update("MarketPrice request: [" + item + "]");
            
            // Send request
            var id = this.quoteController.requestData(item, config.wsService, config.streaming);
            console.log("Requesting item: " + item + " using ID: " + id);

            // Close our current item we are watching.  We do this after to ensure there is no conflict with ID's.
            this.closeRequest(this.requestID);
            this.requestID = id;
            
            // Request becomes valid when we get a valid response
            this.validRequest = false;
            this.error = "";
        };

        //********************************************************************************************
        // TRQuoteController.onMarketData
        // Capture all TRQuoteController market data messages.
        // After requesting for market data, some form of response (or responses) will be delivered 
        // from the Elektron WebSocket Server.  When a message arrives, we make a distinction based
        // on the following:
        //
        //  - Refresh: Initial image received after requesting data.  All fields are included.
        //  - Update: Realtime update based on market conditions.  Only fields changed are included.
        //********************************************************************************************        
        this.quoteController.onMarketData(function(msg) {
            if ( msg.Type === "Refresh")
                self.processRefresh(msg);
            else
                self.processUpdate(msg);
            
            // Processing of some FIDs common to both Refresh and Update
            if ( msg.Type === "Refresh" || msg.UpdateType === "ClosingRun" ) {
                // Trade Price (modified)
                self.widget.TRDPRC_1 = (msg.Fields.TRDPRC_1 ? msg.Fields.TRDPRC_1 : msg.Fields.HST_CLOSE);

                // Change indicators (modified)
                self.widget.NETCHNG_1 = (msg.Fields.NETCHNG_1 ? msg.Fields.NETCHNG_1 : 0);
                self.widget.PCTCHNG = (msg.Fields.PCTCHNG ? msg.Fields.PCTCHNG : 0);
                self.widget.PriceTick = (msg.Fields.PRCTCK_1 ? msg.Fields.PRCTCK_1.charCodeAt(0) : '');                 
            }
                    
            // Propagate all model changes into the view
            $scope.$apply();
        });
        
        //********************************************************************************************
        // processRefresh
        // A refresh message contains the complete image of our market data item which contains all 
        // the latest values at the time we requested.  It is here we fill out our widget form with
        // the current data.
        //********************************************************************************************
        this.processRefresh = function (msg) {
            // Remember some details upon our initial image
            this.validRequest = true;
            this.Ric = msg.Key.Name;
            this.widget = msg.Fields;
            
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
                this.widget.TRDPRC_5 = this.widget.TRDPRC_4;
                this.widget.TRDPRC_4 = this.widget.TRDPRC_3;
                this.widget.TRDPRC_3 = this.widget.TRDPRC_2;               
                this.widget.TRDPRC_2 = this.widget.TRDPRC_1; 
                
                this.widget.PriceTick = (msg.Fields.PRCTCK_1 ? msg.Fields.PRCTCK_1.charCodeAt(0) : this.widgetPriceTick);
            }
            
            // Copy over the update FIDs - our widget will automatically update with changes
            for (var key in msg.Fields) {
                if (msg.Fields.hasOwnProperty(key))
                    this.widget[key] = msg.Fields[key];
            }
        };
    });
})();
