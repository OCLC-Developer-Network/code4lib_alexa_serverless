const alexa = require('ask-sdk-core');
const aws = require('aws-sdk');
const axios = require("axios");
const dom = require('xmldom').DOMParser;
const fs = require('fs');
const xpath = require('xpath');
const yaml = require('js-yaml');

global.config = "";
const s3 = new aws.S3();

const kms = new aws.KMS({'region': 'us-east-1'});
let environment = 'prod';

let base_url_search = "http://www.worldcat.org/webservices/catalog/search/worldcat/opensearch?q="
let base_url_location = "http://www.worldcat.org/webservices/catalog/content/libraries/"
let base_url_find_libraries = "http://www.worldcat.org/webservices/catalog/content/libraries?"

async function getLocation(requestEnvelope, serviceClientFactory) {
  	const { deviceId } = requestEnvelope.context.System.device;
  	const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();
  	const address = await deviceAddressServiceClient.getCountryAndPostalCode(deviceId);
  	
  	if (isGeoSupported & requestEnvelope.context.Geolocation.coordinate){
  		let geocoordinates = requestEnvelope.context.Geolocation.coordinate
  		let location = {"lat": geocoordinates.latitudeInDegrees, "lon": geocoordinates.longitudeInDegrees};
  	} else {
  		let location = {"postalCode": address.postalCode};
  	}
  	return location;
}	
	
const LaunchRequestHandler = {
	      canHandle(handlerInput) {
	        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
	      },
	      async handle(handlerInput) {
	    	    const { requestEnvelope, serviceClientFactory, responseBuilder } = handlerInput;
	    		const addressConsent = requestEnvelope.context.System.user.permissions.scopes['read::alexa:device:all:address:country_and_postal_code'];
	    	    if (!addressConsent || addressConsent == 'DENIED') {
	    	      return responseBuilder
	    	        .speak('Please enable Location permissions in the Amazon Alexa app.')
	    	        .withAskForPermissionsConsentCard(['read::alexa:device:all:address:country_and_postal_code'])
	    	        .getResponse();
	    	    }
	    	    const isGeoSupported = requestEnvelope.context.System.device.supportedInterfaces.Geolocation;
	    	    const geolocationConsent = requestEnvelope.context.System.user.permissions.scopes['alexa::devices:all:geolocation:read.status']
	    	    if (isGeoSupported & geolocationConsent == 'DENIED') {
	    		      return responseBuilder
	    		        .speak('Please enable Geolocation permissions in the Amazon Alexa app.')
	    		        .withAskForPermissionsConsentCard(['alexa::devices:all:geolocation:read'])
	    		        .getResponse();
	    		}
	    	    let location = await getLocation(requestEnvelope, serviceClientFactory, responseBuilder);
	    	    let session_attributes = {
	    	  	          "location" : location
	    	    }
  		    await handlerInput.attributesManager.setSessionAttributes(session_attributes);
	    	  	const speechText = "Welcome to the Alexa Ask WorldCat service. Ask me to find a book for you. For example, you can say, \"Where can I find 'On the Road.'\"";
	        const reprompt = "Ask me to find a book for you. For example, you can say, \"Where can I find 'On the Road.'\"";
	        return responseBuilder
	          .speak(speechText)
	          .reprompt(reprompt)
	          .withSimpleCard('Ask WorldCat', speechText)
	          .getResponse();
	      }
	    };

const SearchIntentHandler = {
	      canHandle(handlerInput) {
	        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
	          && handlerInput.requestEnvelope.request.intent.name === 'SearchIntent';
	      },
	      async handle(handlerInput) {
	    	  	let attributes = await handlerInput.attributesManager.getSessionAttributes();
	    	  	let search = handlerInput.requestEnvelope.request.intent.slots.Search.value;
	    	  	let search_url = base_url_search + "%22" + encodeURIComponent(search) + "%22&wskey=" + config['wskey'];

	        var request_config = {
	    			  headers: {
	    				  'User-Agent': 'node.js KAC Alexa demo app'
	    			  }
	    			};
	        
	        // call the Search API
        		let request_response = await axios.get(search_url, request_config);
        		let doc = new dom().parseFromString(request_response.data);  			
        		let entries = doc.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'entry');
          
  	        // check for empty result set
  	        if (entries.length == 0){
  	            let speechText = "I'm sorry, I couldn't find anything matching your search."
  		        return handlerInput.responseBuilder
	  	          .speak(speechText)
	  	          .withSimpleCard('Ask WorldCat', speechText)
	  	          .getResponse();
  	        }
  	        // store pertinent metadata
  	        let entry = entries[0]
  	        let title = entry.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'title')[0].firstChild.data
  	        let authorName = entry.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'author')[0]
  	        let author = authorName.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'name')[0].firstChild.data
  	        let oclcNum = entry.getElementsByTagNameNS('http://purl.org/oclc/terms/', 'recordIdentifier')[0].firstChild.data
  	        
  	        // get library location info from Search API
  	        let location_url = base_url_location + oclcNum + "?wskey=" + config['wskey'] + "&format=json"
  	        if (attributes.location.postalCode) {
  	        		location_url += "&location=" + attributes.location.postalCode
  	        } else {
  	        		location_url += "&lat=" + attributes.location.lat + "lon=" + attributes.location.lon;
  	        }
	        let location_response = await axios.get(location_url, request_config);
	        let location_data = location_response.data;
	        let closest_library = location_data['library'][0]
	        let closest_library_name = closest_library['institutionName']
	        let closest_library_address = closest_library['streetAddress1'] + " " + closest_library['streetAddress2'] + ", " + closest_library['city'] + ", " + closest_library['state'] + ", " + closest_library['postalCode'] + ", " + closest_library['country']
	        
	        // build speech output and store session attributes
	        let speechText = "The closest library where you can find " + title + " by " + author + " is " + closest_library_name;
	        let reprompt = "Do you need the library's address?"; 
	        let session_attributes = {
	            "title" : title,
	            "author" : author,
	            "closest_library_name" : closest_library_name,
	            "closest_library_address" : closest_library_address,
	        }
	        await handlerInput.attributesManager.setSessionAttributes(session_attributes);
	        // return response
	        return handlerInput.responseBuilder
  	          .speak(speechText + reprompt)
  	          .reprompt(reprompt)
  	          .withSimpleCard('Ask WorldCat', speechText + reprompt)
  	          .getResponse();

	      }
	    };

const YesIntentHandler = {
      canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
          && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent';
      },
      async handle(handlerInput) {    	    
    	    let attributes = await handlerInput.attributesManager.getSessionAttributes();
    	    // pull needed metadata from session attributes
    	    let title = attributes.title;
    	    let author = attributes.author;
    	    let closest_library_name = attributes.closest_library_name;
    	    let closest_library_address = attributes.closest_library_address;
    	    
    	    let speechText = "I've sent the address to your device."
    	    
    	    // build card text
    	    let card_text = closest_library_name + "\n\n" + closest_library_address;

        return handlerInput.responseBuilder
          .speak(speechText)
          .withSimpleCard('Ask WorldCat', card_text)
          .getResponse();
      }
    };

const LibrarySearchIntentHandler = {
	      canHandle(handlerInput) {
	        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
	          && handlerInput.requestEnvelope.request.intent.name === 'LibrarySearchIntent';
	      },
	      async handle(handlerInput) {
	    	  	let attributes = await handlerInput.attributesManager.getSessionAttributes();
	    	  	let library_search_url = base_url_find_libraries + "libtype=2&wskey=" + config['wskey'] + "&format=json";
	  	    if (attributes.location.postalCode) {
	  	    		library_search_url += "&location=" + attributes.location.postalCode
  	        } else {
  	        		library_search_url += "&lat=" + attributes.location.lat + "lon=" + attributes.location.lon;
  	        }
	  		var request_config = {
	  				  headers: {
	  					  'User-Agent': 'node.js KAC Alexa demo app'
	  		  }
	  		};
	  		// call the WorldCat Search API libraries endpoint
  			let library_response = await axios.get(library_search_url, request_config);		
  			let location_data = library_response.data;
  	        let closest_library = location_data['library'][0]
  	        let closest_library_name = closest_library['institutionName']
  	        let closest_library_address = closest_library['streetAddress1'] + closest_library['streetAddress2'] + ", " + closest_library['city'] + ", " + closest_library['state'] + ", " + closest_library['postalCode'] + ", " + closest_library['country']
  	        let speech_output = "The closest public library is " + closest_library_name + ".\n\nIt is located at " + closest_library_address;
  	        return handlerInput.responseBuilder
	            .speak(speech_output)
	            .withSimpleCard('Ask WorldCat', speech_output)
	            .getResponse();
	      }
	    };
	    
const HelpIntentHandler = {
	      canHandle(handlerInput) {
	        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
	          && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
	      },
	      handle(handlerInput) {
		    const speechText = "Welcome to the Alexa Ask WorldCat service. Ask me to find a book for you. For example, you can say, \"Where can I find 'On the Road.'\"";
		    const reprompt = "Ask me to find a book for you. For example, you can say, \"Where can I find 'On the Road.'\"";

	        return handlerInput.responseBuilder
	          .speak(speechText)
	          .reprompt(reprompt)
	          .withSimpleCard('Ask WorldCat', speechText)
	          .getResponse();
	      }
	    };

const CancelAndStopIntentHandler = {
	      canHandle(handlerInput) {
	        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
	          && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent'
	            || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent');
	      },
	      handle(handlerInput) {
	        const speechText = 'Goodbye!';

	        return handlerInput.responseBuilder
	          .speak(speechText)
	          .withSimpleCard('Ask WorldCat', speechText)
	          .getResponse();
	      }
	    };

const SessionEndedRequestHandler = {
	      canHandle(handlerInput) {
	        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
	      },
	      handle(handlerInput) {
	        //any cleanup logic goes here
	        return handlerInput.responseBuilder.getResponse();
	      }
	    };

const addressErrorHandler = {
	      canHandle(handlerInput, error) {
	        return error.name.startsWith('ServiceError');
	      },
	      handle(handlerInput, error) {
      		console.log(error, error.stack);	      		
      		let speechText = "I'm sorry, error retrieving your address."
    	        return handlerInput.responseBuilder
  	          .speak(speechText)
  	          .withSimpleCard('Ask WorldCat', speechText)
  	          .getResponse();
	      }
	    };

const apiErrorHandler = {
	      canHandle(handlerInput, error) {
	        return error.response;
	      },
	      handle(handlerInput, error) {
	    	  	console.log(error.message, error.config.url);
		    let speechText = "I'm sorry, application search error."
		    	return handlerInput.responseBuilder
	  	          .speak(speechText)
	  	          .withSimpleCard('Ask WorldCat', speechText)
	  	          .getResponse();    		
	      }
	    };

const ErrorHandler = {
	      canHandle() {
	        return true;
	      },
	      handle(handlerInput, error) {
	        console.log(`Error handled: ${error.message}`);

	        return handlerInput.responseBuilder
	          .speak('Sorry, I can\'t understand the command. Please say again.')
	          .reprompt('Sorry, I can\'t understand the command. Please say again.')
	          .getResponse();
	      },
	    };

let skill;

exports.handler = async function (event, context) {
	try {
		let data = await kms.decrypt({CiphertextBlob: fs.readFileSync(environment + "_config_encrypted.txt")}).promise();		
		
		global.config = yaml.load(data['Plaintext'].toString());
		
		console.log(`REQUEST++++${JSON.stringify(event)}`);
		  if (!skill) {
		    skill = alexa.SkillBuilders.custom()
		      .addRequestHandlers(
		        LaunchRequestHandler,
		        SearchIntentHandler,
		        LibrarySearchIntentHandler,
		        YesIntentHandler,
		        HelpIntentHandler,
		        CancelAndStopIntentHandler,
		        SessionEndedRequestHandler,
		      )
		      .addErrorHandlers(
		    		addressErrorHandler,
		    		apiErrorHandler,
		    		ErrorHandler
		      )
		      .withApiClient(new alexa.DefaultApiClient())
		      .create();
		  }

		  const response = await skill.invoke(event, context);
		  console.log(`RESPONSE++++${JSON.stringify(response)}`);

		  return response;

	} catch (Error){
		console.log(Error, Error.stack);		
	}
};