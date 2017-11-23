// ********************************************************************************************************
// QuoteWidget.js
// The QuoteWidget module is an Angular JS-based client utilizing Thomson Reuters Elektron WebSocket API to
// request and retrieve realtime market data.  The widget provides a interface that is geared towards the 
// display of Equity-based instruments showing updates such as trades and quotes in realtime.  In addition, 
// the widget utlizes Angular JS animation to provide visual feedback when individual fields are updated.
//
// Author:  Nick Zincone
// Version: 1.0
// Date:    November 2017.
// ********************************************************************************************************

// App
// Main Application entry point.  Perform app-specific intialization within our closure
(function() 
{
    // Main application module.  This application depends on the Angular 'ngAnimate' module.
    // As the name implies, 'ngAnimate' provides animation using CSS styles which allows visual 
    // feedback when a field is updated in realtime.
    let app = angular.module('QuoteWidget',['ngAnimate']);
    
    // Configuration
    app.constant('config', {
        wsServer: '<host:port>',        // Address of our Elektron WebSocket server.  Eg: ads:15000
        wsLogin: {                      // Elektron WebSocket login credentials
            user: 'user',
            appId: '256',
            position: '127.0.0.1',
        },
        //wsService: 'ELEKTRON_EDGE',   // Optional. Elektron WebSocket service hosting realtime market data    
        wsInitialRic: 'TRI.N',
    });

    //******************************************************************************************
    // Sharable Services
    //
    // widgetStatus - Capture the status messages generated from the Elektron WebSocket server
    //                and display as a pull-down list to see history.
    //******************************************************************************************
    app.factory('widgetStatus', $timeout => {
        let statusList = [];

        return ({
            list: function () { return (statusList); },
            update: function (txt) {
                console.log(txt);
                let status = statusList[0];
                if (!status || status.msg != txt) {
                    if (status)
                        statusList[0].id = 1;

                    // Force the callback to always run asynchronously - prevents error:inprog (Already in Progress) error
                    $timeout(() => {statusList.unshift({ id: 0, msg: txt })}, 0);
                }
            }
        });
    });

    //**********************************************************************************************
    // User-defined Directives
    //
    // animateOnChange - Directive to show change in our view.
    //**********************************************************************************************
    app.directive('animateOnChange', $animate => {
        return ((scope, elem, attr) => {
            scope.$watch(attr.animateOnChange, (newVal, oldVal) => {
                if (newVal != oldVal) {
                    $animate.enter(elem, elem.parent(), elem, () => $animate.leave(elem));
                }
            })
        });
    });

    // Widget Controller
    // The AngularJS controller manages all interaction, behavior and display within our application.
    app.controller('widgetController', function ($scope, $rootScope, widgetStatus, config )
    {
        // Some initialization
        $scope.statusList = widgetStatus.list();
        this.requestedRic = config.wsInitialRic;       
        this.Ric = "";
        this.validRequest = false;
        this.error = "";
        this.widget = {};
        this.needsConfiguration = (config.wsServer === '<host:port>');
        
        // Our Elektron WebSocket interface
        this.quoteController = new TRWebSocketController();
       
        // Connect into our realtime server
        if ( !this.needsConfiguration ) {
            widgetStatus.update("Connecting to the WebSocket service on [host:port] " + config.wsServer + "...");
            this.quoteController.connect(config.wsServer, config.wsLogin.user, config.wsLogin.appId, config.wsLogin.position);           
        }
        
        //*******************************************************************************
        // TRWebSocketController.onStatus
        //
        // Capture all TRWebSocketController status messages.
        //*******************************************************************************        
        this.quoteController.onStatus((eventCode, msg) => {
            let status = this.quoteController.status;
            
            switch (eventCode) {                    
                case status.connected:
                    // TRWebSocketController first reports success then will automatically 
                    // attempt to log in to the TR WebSocket server...
                    widgetStatus.update("Connection to server is UP.");
                    widgetStatus.update(`Login request with user: [${config.wsLogin.user}]`);
                    break;
                    
                case status.disconnected:
                    widgetStatus.update("Connection to server is Down/Unavailable");
                    break;
                    
                case status.loginResponse:
                    this.processLogin(msg);
                    break;
                    
                case status.msgStatus:
                    // Report potential issues with our requested market data item
                    this.error = (msg.Key ? msg.Key.Name+":" : "");
                    this.error += msg.State.Text;
                    widgetStatus.update("Status response for item: " + this.error);                
                    break;
                    
                case status.msgError:
                    // Report invalid usage errors
                    widgetStatus.update(`Invalid usage: ${msg.Text}. ${msg.Debug.Message}`);
                    break;
                    
                case status.processingError:
                    // Report any general application-specific issues
                    widgetStatus.update(msg);
                    break;
            }
        });
        
        //*********************************************************************************
        // processLogin
        //
        // Determine if we have successfully logged into our WebSocket server.  If so, 
        // submit our initial marketPrice request to our quote controller.
        //*********************************************************************************
        this.processLogin = function (msg) {
            widgetStatus.update(`Login state: ${msg.State.Stream}/${msg.State.Data}/${msg.State.Text}`);

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
        // Close the current streaming request.
        //*******************************************************************************************   
        this.closeRequest = function(ric) {
            // Only CLOSE if we have something outstanding...
            if ( this.validRequest )
                this.quoteController.closeRequest(ric);
        };
        
        //*******************************************************************************************
        // requestMarketPrice
        //
        // Our widget maintains only 1 outstanding streaming request.  As a result, we request for 
        // our new item and also close our current stream.
        //*******************************************************************************************   
        this.requestMarketPrice = function(item) {
            // Send request
            this.quoteController.requestData(item, {Service: config.wsService});
            widgetStatus.update(`MarketPrice request: [${item}]`);

            // Close our current item we are watching.  We do this after to ensure there is no conflict with ID's.
            this.closeRequest(this.Ric);
            
            // Request becomes valid when we get a valid response
            this.validRequest = false;
            this.error = "";
            
            // Clean up data model
            this.widget = {};
        };

        //********************************************************************************************
        // TRWebSocketController.onMarketData
        //
        // All our market data messages are captured here.  The main goal is to populate our data 
        // model.  This will trigger our view to update the display.
        //********************************************************************************************        
        this.quoteController.onMarketData(msg => {
            $scope.$apply( () => {             
                if ( msg.Type === "Refresh")
                    this.processRefresh(msg);
                else
                    this.processUpdate(msg);
                
                // Populate our data model
                Object.assign(this.widget, msg.Fields);                
                
                // Processing of some FIDs common to both Refresh and Update
                if ( msg.Type === "Refresh" || msg.UpdateType === "ClosingRun" ) {
                    // Trade Price (modified)
                    this.widget.TRDPRC_1 = (msg.Fields.TRDPRC_1 ? msg.Fields.TRDPRC_1 : msg.Fields.HST_CLOSE);

                    // Change indicators (modified)
                    this.widget.NETCHNG_1 = (msg.Fields.NETCHNG_1 ? msg.Fields.NETCHNG_1 : 0);
                    this.widget.PCTCHNG = (msg.Fields.PCTCHNG ? msg.Fields.PCTCHNG : 0);
                    this.widget.PriceTick = (msg.Fields.PRCTCK_1 ? msg.Fields.PRCTCK_1.charCodeAt(0) : '');                 
                }
            });
        });
        
        //********************************************************************************************
        // processRefresh
        //********************************************************************************************
        this.processRefresh = function (msg) {
            // Remember some details upon our initial image
            this.validRequest = true;
            this.Ric = msg.Key.Name;
        };       

        //********************************************************************************************
        // processUpdate
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
        };
    });
})();
