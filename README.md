
# Real-time Quote Widget example
Created by Platform Services GitHub tool on Wed Aug 16 2017

## Table of Content

* [Overview](#overview)

* [Disclaimer](#disclaimer)

* [Prerequisites](#prerequisites)

* [Package](#package)

## <a id="overview"></a>Overview
The Real-time quote widget is a lightweight web-based interface utilizing capabilities offered within the Thomson Reuters Elektron WebSocket API to deliver real-time market data quotes to the browser.  Utilizing popular web technologies such as Angular JS and Twitter Bootstrap, the widget displays a simple equity quote interface showing updates in real-time.  

Details and concepts are explained in the [Building a Real-time Quote widget]() article published on the [Thomson Reuters Developer Community portal](https://developers.thomsonreuters.com).

![image](images/quote.gif)

For any question related to this article please use the Developer Community [Q&A Forum](https://community.developers.thomsonreuters.com).

***Note:** To be able to ask questions and to benefit from the full content available on the [TR Developer Community portal](https://developers.thomsonreuters.com) we recommend you to [register here]( https://developers.thomsonreuters.com/iam/register) or [login here]( https://developers.thomsonreuters.com/iam/login?destination_path=Lw%3D%3D).*

## <a id="disclaimer"></a>Disclaimer
The source code presented in this project has been written by Thomson Reuters only for the purpose of illustrating the concepts of building a simple real-time quote widget.  It has not been tested for a usage in production environments.

## <a id="prerequisites"></a>Prerequisites

Software components used:

* [Elektron WebSocket API](https://developers.thomsonreuters.com/elektron/websocket-api-early-access) - Thomson Reuters interface to access Elektron real-time market data.
* [Angular JS](https://angularjs.org/) (v1.6.5)- Googles Client-side JavaScript framework to build rich HTML applications.  Not only provides an easy and intuitive capability to binding our content within our pages but also animated visual feedback of real-time updates.
* [Bootstrap](http://getbootstrap.com/css/) (v3.3.7) - CSS templates providing useful styles for our display.
* Access to the Thomson Reuters Advanced Distribution Server (ADS) version 3 with an enabled WebSocket service. 

## <a id="package"></a>Package

If you have access to an ADS that is enabled to deliver market data via the Elektron WebSocket API, you can attempt to run within your own setup and reference the source code that is [available within GitHub](https://github.com/TR-API-Samples/Article.WebSocketAPI.Javascript.QuoteWidget).

The application package includes the following:
* **TRWebSocketController/TRWebSocketController.js**

  The TRWebSocketController is a generic interface used to manage all communication to the Elektron WebSocket server.  This design was intentional allowing the use of any Javascript framework to implement the desired solution.  Although a number of frameworks were possible, in this implementation, we chose Angular JS to build our widget.
 
* **quoteObject.html, quoteObject.js**
  
  HTML/JavaScript utilizing the Angular JS framework to build our widget..

* **css / fonts / js**
  
  Supporting technologies: Angular JS, Bootstrap.

To run the package, simply load up the **`quoteObject.html`** within your browser and follow the instructions.  You will need to provide the **server** information for your ADS.

### <a id="contributing"></a>Contributing

Please read [CONTRIBUTING.md](https://gist.github.com/PurpleBooth/b24679402957c63ec426) for details on our code of conduct, and the process for submitting pull requests to us.

### <a id="authors"></a>Authors

* **Nick Zincone** - Release 1.0.  *Initial version*

### <a id="license"></a>License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
