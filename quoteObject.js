// **********************************************************************************************************
// QuoteWidget.js
// The QuoteWidget module is an Angular JS-based client application utilizing streaming services provided 
// by Elektron RealTime (ERT) to request and retrieve realtime market data.  The interface provides the 
// ability to connect to the streaming services via the TREP (ADS) local installation or via the ERT 
// (Elektron Real Time) in the Cloud.   
//
// The widget provides an interface that is geared towards the display of Equity-based instruments showing 
// updates such as trades and quotes in realtime.  In addition, the widget utlizes Angular JS animation to 
// provide visual feedback when individual fields are updated.
//
// Note: When requesting for streaming services from EDP/ERT, applications must be authenticated using 
//       the HTTP EDP authentication services prior to connecting into the ERT services over WebSockets. 
//       To adhere to the "Same Origin" security policies, a simple server-side application (provided) 
//       will act as an application proxy managing EDP authentication.  Refer to the instructions for setup.       
//
// Authors: Nick Zincone, Wasin Waeosri
// Version: 2.0
// Date:    October 2018.
// **********************************************************************************************************

// App
// Main Application entry point.  Perform app-specific intialization within our closure
(function() 
{
    // Main application module.  This application depends on the Angular 'ngAnimate' module.
    // As the name implies, 'ngAnimate' provides animation using CSS styles which allows visual 
    // feedback when a field is updated in realtime.
    let app = angular.module('QuoteWidget',['ngAnimate']);
    
    // Application session configuration
    // Define the session (TREP, EDP/ERT) you wish to use to access streaming services.  To define your session,
    // update the following setting:
    //      session: undefined
    //
    // Eg:  session: 'EDP'     // EDP/ERT Session
    //      session: 'ADS'     // TREP/ADS Session
    app.constant('config', {
        session: undefined,         // 'ADS' or 'EDP'.
        
        // TREP (ADS) session.
        // This section defines the connection and authentication requirements to connect directly into the 
        // streaming services from your locally installed TREP installation.
        // Load this example directly within your browswer.
        adsSession: {
            wsServer: 'ewa',               // Address of our ADS Elektron WebSocket server.  Eg: 'elektron'
            wsPort: '15000',               // Address port of our ADS Elektron Websccket server. Eg: 15000
            wsLogin: {                     // Elektron WebSocket login credentials
                user: 'user',              // User name.  Optional.  Default: desktop login.
                appId: '256',              // AppID. Optional.  Default: '256'
                position: '127.0.0.1',     // Position.  Optional. Default: '127.0.0.1'
            }       
        },
        
        // ERT (Elektron Real Time) in Cloud session.
        // This section defines authenticastion to access EDP (Elektron Data Platform)/ERT.
        // Start the local HTTP server (provided) and within your browser, specify the URL: http://localhost:8080/quoteObject.html
        edpSession: {
            wsLogin: {
                user: undefined,
                password: undefined,
                clientId: undefined
            },
            restAuthHostName: 'https://api.refinitiv.com/auth/oauth2/v1/token',
            restServiceDiscovery: 'https://api.refinitiv.com/streaming/pricing/v1/',
            wsLocation: 'us-east-1a',
            wstransport: 'websocket',
            wsdataformat: 'tr_json2'
        },  
        //wsService: 'ELEKTRON_EDGE',   // Optional. Elektron WebSocket service hosting realtime market data
        wsInitialRic: 'AAPL.O'
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
            update: function (txt,msg) {
                (msg != null ? console.log(txt,msg) : console.log(txt));
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
        this.needsConfiguration = (config.session === undefined);
        
        // Define the WebSocket interface to manage our streaming services
        this.ertController = new ERTWebSocketController();
        
        // EDP Authentication
        // Only applicable if a user chooses an ERT Session.
        this.edpController = new ERTRESTController();
       
        // Initialize our session
        switch (config.session) {
            case 'ADS':
                widgetStatus.update("Connecting to the WebSocket streaming service on ["+ config.adsSession.wsServer + ":" + config.adsSession.wsPort + "]");
                this.ertController.connectADS(config.adsSession.wsServer, config.adsSession.wsPort, config.adsSession.wsLogin.user, 
                                                config.adsSession.wsLogin.appId, config.adsSession.wsLogin.position);
                break;
            case 'EDP':
                widgetStatus.update("Authenticating with EDP using " + config.edpSession.restAuthHostName + "...");
                this.edpController.get_access_token({
                    'username': config.edpSession.wsLogin.user,
                    'password': config.edpSession.wsLogin.password,
                    'clientId': config.edpSession.wsLogin.clientId
                });            
                break;
        }

        //***********************************************************************************
        // ERTRESTController.onStatus
        //
        // Capture all ERTRESTController status messages.
        // EDP/ERT uses OAuth 2.0 authentication and requires clients to use access tokens to 
        // retrieve streaming content.  In addition, EDP/ERT requires clients to continuously 
        // refresh the access token to continue uninterrupted service.  
        //
        // The following callback will capture the events related to retrieving and 
        // continuously updating the tokens in order to provide the streaming interface these
        // details to maintain uninterrupted service. 
        //***********************************************************************************
        this.edpController.onStatus((eventCode, msg) => {
            let status = this.edpController.status;

            switch (eventCode) {
                case status.getRefreshToken: // Get Access token form EDP (re-refresh Token case)
                    this.auth_obj = msg;
                    widgetStatus.update("EDP Authentication Refresh success.  Refreshing ERT stream...");                    
                    this.ertController.refreshERT(msg);
                    break;
                case status.getService: // Get Service Discovery information form EDP
                    // Connect into ERT in Cloud Elektron WebSocket server
                    this.ertController.connectERT(msg.hostList, msg.portList, msg.access_token, config.edpSession.appId, config.edpSession.position);
                    break;
                case status.authenError: // Get Authentication fail error form EDP
                    widgetStatus.update("Elektron Real Time in Cloud authentication failed.  See console.", msg);                    
                    break;
                case status.getServiceError: // Get Service Discovery fail error form EDP
                    widgetStatus.update("Elektron Real Time in Cloud Service Discovery failed.  See console.", msg);
                    break;
            }
        });        
        
        //*******************************************************************************
        // ERTWebSocketController.onStatus
        //
        // Capture all ERTWebSocketController status messages.
        //*******************************************************************************        
        this.ertController.onStatus((eventCode, msg) => {
            let status = this.ertController.status;
            
            switch (eventCode) {                    
                case status.connected:
                    // ERTWebSocketController first reports success then will automatically 
                    // attempt to log in to the ERT WebSocket server...
                    console.log(`Successfully connected into the ERT WebSocket server: ${msg.server}:${msg.port}`);                    
                    break;
                    
                case status.disconnected:
                    widgetStatus.update(`Connection to ERT streaming server: ${msg.server}:${msg.port} is down/unavailable`);
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
                    
                case status.tokenExpire:
                    widgetStatus.update("Elektron Data Platform Authentication Expired");
                    break;

                case status.refreshSuccess:
                    widgetStatus.update("Elektron Data Platform Authentication Refresh success")
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

            if (this.ertController.loggedIn())
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
                this.ertController.closeRequest(ric);
        };
        
        //*******************************************************************************************
        // requestMarketPrice
        //
        // Our widget maintains only 1 outstanding streaming request.  As a result, we request for 
        // our new item and also close our current stream.
        //*******************************************************************************************   
        this.requestMarketPrice = function(item) {
            // Send request
            this.ertController.requestData(item, {Service: config.wsService});
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
        // ERTWebSocketController.onMarketData
        //
        // All our market data messages are captured here.  The main goal is to populate our data 
        // model.  This will trigger our view to update the display.
        //********************************************************************************************        
        this.ertController.onMarketData(msg => {
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
