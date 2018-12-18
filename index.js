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
	
const LaunchRequestHandler = {
	      canHandle(handlerInput) {
	        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
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

const SearchIntentHandler = {
	      canHandle(handlerInput) {
	        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
	          && handlerInput.requestEnvelope.request.intent.name === 'SearchIntent';
	      },
	      async handle(handlerInput) {
	    	  	let search = handlerInput.requestEnvelope.request.intent.slots.Search.value;
	    	  	let search_url = base_url_search + "%22" + encodeURIComponent(search) + "%22&wskey=" + config['wskey'];

		        var request_config = {
		    			  headers: {
		    				  'User-Agent': 'node.js KAC Alexa demo app'
		    			  }
		    			};
		          // call the Search API
		          try {
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
		  	        let location_url = base_url_location + oclcNum + "?location=" + config['zip_code'] + "&wskey=" + config['wskey'] + "&format=json"
		  	        try {
		  		        let location_response = await axios.get(location_url, request_config);
		  		        let location_data = location_response.data;
		  		        let closest_library = location_data['library'][0]
		  		        let closest_library_name = closest_library['institutionName']
		  		        let closest_library_address = closest_library['streetAddress1'] + " " + closest_library['streetAddress2'] + ", " + closest_library['city'] + ", " + closest_library['state'] + ", " + closest_library['postalCode'] + ", " + closest_library['country']
		  		        
		  		        // build speech output and store session attributes
		  		        let speechText = "The closest library where you can find " + title + " by " + author + " is " + closest_library_name + ".\n\nDo you need the library's address?";
		  		        let session_attributes = {
		  		            "title" : title,
		  		            "author" : author,
		  		            "closest_library_name" : closest_library_name,
		  		            "closest_library_address" : closest_library_address,
		  		        }
		  		        await handlerInput.attributesManager.setSessionAttributes(session_attributes);
		  		        // return response
		  		        return handlerInput.responseBuilder
			  	          .speak(speechText)
			  	          .withSimpleCard('Ask WorldCat', speechText)
			  	          .getResponse();
		  	        } catch (Error) {
		  			    console.log(Error, Error.stack);
		  			    let speechText = "I'm sorry, error retrieving libraries with the item."
		  			    	return handlerInput.responseBuilder
				  	          .speak(speechText)
				  	          .withSimpleCard('Ask WorldCat', speechText)
				  	          .getResponse();
		  	        }    
		          } catch (Error) {
		  			    console.log(Error, Error.stack);
		  			    let speechText = "I'm sorry, application search error."
		  			    	return handlerInput.responseBuilder
				  	          .speak(speechText)
				  	          .withSimpleCard('Ask WorldCat', speechText)
				  	          .getResponse();
		          }
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
		        YesIntentHandler,
		        HelpIntentHandler,
		        CancelAndStopIntentHandler,
		        SessionEndedRequestHandler,
		      )
		      .addErrorHandlers(ErrorHandler)
		      .create();
		  }

		  const response = await skill.invoke(event, context);
		  console.log(`RESPONSE++++${JSON.stringify(response)}`);

		  return response;

	} catch (Error){
		console.log(Error, Error.stack);		
	}
};