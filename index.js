'use strict'

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();

const token = "EAAJUVx9UyPwBABMFMIQuPg0ZAOhVzd3gY7DZCarR8IfpDidteitbZCUWHseNTsMkjOfeZCzOZBBmbTfpZC0oZAOJZCgA5HhUHcxOTZBAST4tgHJDPPKywlg82rcmS4r8UuMVjX9SNSVGrWhUufeCGZAYs2ZB5mgbGzJZAXUGS40H5hZArGgZDZD";
var questions = [];
var users = [];

app.set('port', (process.env.PORT || 5000));

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}));

// Process application/json
app.use(bodyParser.json());

// Index route
app.get('/', function (req, res) {
	res.send('Hello world, I am a chat bot');
});

// for Facebook verification
app.get('/webhook/', function (req, res) {
	if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
		res.send(req.query['hub.challenge']);
	}
	res.send('Error, wrong token');
});

// Spin up the server
app.listen(app.get('port'), function() {
	console.log('running on port', app.get('port'));
});

app.post('/webhook/', function (req, res) {
    let messaging_events = req.body.entry[0].messaging
    var current_user;
    var current_answerer;
    var text;
    var original_message;
    var found = false;
    var user_state;
    for (let i = 0; i < messaging_events.length; i++) {
	    let event = req.body.entry[0].messaging[i];
	    let sender = event.sender.id;
	    if (event.postback && event.postback.payload == "GET_STARTED_PAYLOAD") {
	    	sendTextMessage(sender, "Welcome! I will help you ask and answer questions with anyone around the world. How does that sound? :)");
	    }
	    if (event.message && event.message.text) {
	    	
	    	// Find the current user
	    	for (current_user = 0; current_user < users.length; current_user++) {
			    if (users[current_user].person == sender) {
			    	found = true;
			    	user_state = users[current_user].state;
			    	break;
			    }
		   	}

	    	text = event.message.text;
	    	text = text.toLowerCase();
	    	original_message = event.message.text.replace(/[&*;{}~><]/g,""); // Sanitize string 
	    	
	    	// New User
	    	if (!found) {
	    		promptUser(sender, users, current_user);
	    	} else if(found && user_state == "prompted" && (text == "yes" || text == "no")) {
	    		sendTextMessage(sender, "If you want to answer a question, say 'answer'. \n \n If you want to ask a question, say 'ask'");
	    	}
	    	// User has requested to answer a question and is now answering
	    	else if (found && user_state == "answering") {
	    		userAnswering(sender, users, current_user, questions, original_message);
	    	}  
	    	// User has requested to ask a question and is now asking
	    	else if (found && user_state == "asking") {
	    		userAsking(sender, users, current_user, questions, original_message);
	    	} 
	    	// User has typed 'ask' or some variation of that
	    	else if (found && text.includes("ask") && user_state == "prompted"){
	    		userWantsToAsk(sender, users, current_user);
	    	} 
		    // If a user somehow gets here, treat them as new and ask them to ask or answer again
		    else if (found && text.includes("answer") && user_state == "prompted") {
	    		giveUserQuestion(sender, users, current_user, questions);
	    	} else if (found) {
	    		promptUser(sender, users, current_user);
	    	}
	    	else {
		    	console.log("reached the end");
		    }
	    }
    }
    res.sendStatus(200)
});

function sendTextMessage(sender, text) {
    let messageData = { text:text }
    request({
	    url: 'https://graph.facebook.com/v2.9/me/messages',
	    qs: {access_token:token},
	    method: 'POST',
		json: {
		    recipient: {id:sender},
			message: messageData,
		}
	}, function(error, response, body) {
		if (error) {
		    console.log('Error sending messages: ', error)
		} else if (response.body.error) {
		    console.log('Error: ', response.body.error)
	    }
    });
}

// Asks user if they want to answer a question
// Creates a new user
function promptUser(sender, users, current_user) {
	sendTextMessage(sender, "Do you want to ask or answer a question?");
	// remove repeat users
	for (var i = 0; i < users.length; i++) {
		if (users[i].person == sender) {
			users.splice(i, 1);
		}
	}
	users.push({person: sender, answerer: null, state: "prompted"});
}


//Gives the user a question to answer
function giveUserQuestion(sender, users, current_user, questions) {
	// If there are no questions waiting to be answered
	if(!questions[0]) {
		sendTextMessage(sender, "No questions right now. Sorry!");
		promptUser(sender, users, current_user);
	} else { // If there is a question 
		var index = 0;
		while (questions[index] != null) {
			if (questions[index].asker == sender) {
		 		index++;
			} else {
				break;
			}

		}
		if (questions[index] == null) {
	 		sendTextMessage(sender, "No questions right now. Sorry!");
	 		promptUser(sender, users, current_user);
		} else {
			var question = questions[index].question;
			users[current_user].state = "answering";
			questions[index].answerer = sender;
			sendTextMessage(sender, "Please answer the following question: \n\n" + question);
		}
	}
}

// Handles when a user answers a question
function userAnswering(sender, users, current_user, questions, original_message) {
	var current_answerer;
	for (current_answerer = 0; current_answerer < users.length; current_answerer++) {
		if (questions[current_answerer].answerer == sender) {
			// Without a subscription, the bot will get banned if it messages users after 24 hours
			// of interaction. If we find a question that is 24 hours old, it must be removed.
			var cur_date = new Date();
			var question_date = questions[current_answerer].date;
			if ((Math.abs(cur_date - question_date) / 36e5) >= 23.5) { // 36e5 helps convert milliseconds to hours
				questions.splice(current_answerer, 1); // remove the question
				continue;
			} else {
				break;
			}
		}
	}
	// Send message to the asker with an answer
	// It would equal null if it is a repeat question. 
	if(questions[current_answerer].asker != null) {
		sendTextMessage(questions[current_answerer].asker, "You asked: " + questions[current_answerer].question + "\n \nThe answer is: " + original_message);
	}
	// Confirm that your answer was sent.
	sendTextMessage(sender, "I just sent your answer to the asker. Thanks!");
	promptUser(sender, users, current_user);
	users[current_user].state = "prompted";
	var popped_question = questions.shift(); // Remove question from the array
	popped_question.asker = null; // when the question is repeated, don't send an answer twice
	questions.push(popped_question);
}

// Handles when a user wants to ask a question
function userWantsToAsk(sender, users, current_user) {
	sendTextMessage(sender, "Please ask your question.");
	users[current_user].state = "asking";
}

// handles when a user asks a question
function userAsking(sender, users, current_user, questions, original_message) {
	var cur_date = new Date();
	
	if (original_message.slice(-1) != '?') {
		original_message = original_message + "?"; 
	}
	
	questions.push({question: original_message, asker: sender, answerer: null, date: cur_date});
	sendTextMessage(sender, "Thanks, I will get back to you shortly.");
	promptUser(sender, users, current_user);
	users[current_user].state = "prompted";
}