const express = require('express');
const router = express.Router();
const { requiresAuth } = require('express-openid-connect');
const multer = require('multer');
const vision = require('@google-cloud/vision');
const User = require('../models/user.js');
const { OpenAI } = require('openai');
const mongoose = require('mongoose');
let fetch;
import('node-fetch').then(module => {
    fetch = module.default;
}); require('dotenv').config();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configure MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});


const API_KEY_VISION = process.env.API_KEY_VISION;
const API_KEY_GPT4 = process.env.API_KEY_GPT4;
const VISION_API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY_VISION}`;



// PAYPAL
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const base = "https://api-m.sandbox.paypal.com";

// Configure OpenAI API
const openai = new OpenAI({
    apiKey: API_KEY_GPT4
})


const incrementUserQuestions = async (userEmail, amount = 1) => {
    try {
        const updatedUser = await User.findOneAndUpdate(
            { userEmail: userEmail },
            { $inc: { availableQuestions: amount } },
            { new: true, runValidators: true }  // 'new' option returns the updated document
        );

        if (!updatedUser) {
            throw new Error('User not found.');
        }

        return updatedUser;
    } catch (err) {
        throw err;
    }
};


/**
 * Decrements the available questions of a user by a given amount.
 * @param {string} userEmail - The email of the user.
 * @param {number} amount - The amount to decrement by (default is 1).
 * @returns {Promise} - Resolves with the updated user document or rejects with an error.
 */
const decrementUserQuestions = async (userEmail, amount = 1) => {
    try {
        const updatedUser = await User.findOneAndUpdate(
            { userEmail: userEmail },
            { $inc: { availableQuestions: -amount } },
            { new: true, runValidators: true }  // 'new' option returns the updated document
        );

        if (!updatedUser) {
            throw new Error('User not found.');
        }

        return updatedUser;
    } catch (err) {
        throw err;
    }
};


/**
 * Checks if a user is already in the database. If not, creates a new user with questions set to 0.
 * @param {string} userEmail - The email of the user.
 * @returns {Promise} - Resolves with the user document (either existing or newly created), or rejects with an error.
 */
const findOrCreateUser = async (userEmail) => {
    try {
        let user = await User.findOne({ userEmail: userEmail });

        // If user doesn't exist, create a new one with 0 questions
        if (!user) {
            user = new User({
                userEmail: userEmail,
                availableQuestions: 0
            });
            await user.save();
        }

        return user;
    } catch (err) {
        throw err;
    }
};



router.get('/', function (req, res, next) {
    res.render('index', {
        title: 'Auth0 Webapp sample Nodejs',
        isAuthenticated: req.oidc.isAuthenticated()
    });
});

router.get('/profile', requiresAuth(), function (req, res, next) {
    res.render('profile', {
        userProfile: JSON.stringify(req.oidc.user, null, 2),
        title: 'Profile page'
    });
});


async function getAvailableQuestions(userEmail) {
    try {
        if (!userEmail) {
            throw new Error('userEmail parameter is required.');
        }

        const user = await User.findOne({ userEmail: userEmail });

        if (!user) {
            throw new Error('User not found.');
        }

        return user.availableQuestions;
    } catch (err) {
        console.error('Error:', err.message);
        return -1;  // Returning -1 or any other sentinel value to indicate an error.
    }
}

router.get('/get-questions', requiresAuth(), async (req, res) => {
    const userEmail = req.oidc.user.email;
    const availableQuestions = await getAvailableQuestions(userEmail);

    if (availableQuestions === -1) {
        return res.status(500).json({ message: 'Internal Server Error' });
    }

    return res.json({ userEmail: userEmail, availableQuestions: availableQuestions });
});


router.post('/create-user', requiresAuth(), async (req, res) => {
    try {
        // Assuming req.oidc.user.email is populated by your authentication middleware
        const userEmail = req.oidc.user.email;

        const user = await findOrCreateUser(userEmail);

        return res.json({ message: 'User checked and created if not existent.', user: user });
    } catch (error) {
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});



const detectText = async (screenshot) => {
    const encodedImage = screenshot.buffer.toString('base64');

    const body = {
        requests: [
            {
                image: { content: encodedImage },
                features: [{ type: 'TEXT_DETECTION' }]
            }
        ]
    };

    const response = await fetch(VISION_API_URL, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });


    const data = await response.json();
    const results = data.responses?.[0]?.textAnnotations || [];
    return results[0]?.description || '';
};


async function sendToOpenAI(fullText) {
    try {
        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-4",  // Update model from "gpt-4" to "gpt-3.5-turbo" or keep as "gpt-4" if it's available
            messages: [
                {
                    "role": "system",
                    // "content": "You are tasked with answering a Cognitive Aptitude Test question that assesses problem-solving, comprehension, application of information, and mathematical reasoning and critical thinking. Provide the best and most logical answer based on the given information."
                    "content": "Your challenge is to address a question from a Cognitive Aptitude Test, designed to evaluate problem-solving capabilities, comprehension, application of knowledge, along with mathematical reasoning and critical thinking skills. Offer the most logical and compelling answer using the information provided. If an answer isn't discernible, please return 'no answer'."

                },
                {
                    "role": "user",
                    "content": fullText
                }
            ],
            max_tokens: 2000
        });

        const generatedText = chatCompletion.choices[0].message['content'].trim();
        return generatedText

    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}


async function appendHistory(userEmail, question, answer) {
    try {
        const updateResult = await User.findOneAndUpdate(
            { userEmail: userEmail },
            { $push: { history: { question: question, answer: answer } } },
            { new: true } // This option returns the modified document rather than the original
        );

        if (!updateResult) {
            console.log(`User with email ${userEmail} not found.`);
            return null;
        }

        return updateResult;
    } catch (error) {
        console.error("Error updating user history:", error);
        throw error;
    }
}

router.post('/submit-images', upload.array('screenshots'), requiresAuth(), async (req, res, next) => {
    try {
        const userEmail = req.oidc.user.email;
        const availableQuestions = await getAvailableQuestions(userEmail);

        const numImages = req.files.length;
        if (availableQuestions < numImages) {
            return res.status(400).json({
                success: false,
                message: 'Not enough questions available',
                availableQuestions: availableQuestions,
                requiredQuestions: numImages
            });
        }

        let fullText = '';
        let userDeductions = 0;

        // Iterate over each image and extract text
        for (const image of req.files) {
            const detectedText = await detectText(image);
            fullText += detectedText + '\n';
            userDeductions++;
        }

        console.log(fullText);

        const generatedText = await sendToOpenAI(fullText);
        console.log(generatedText);

        // If it was successful, decrement the user questions
        decrementUserQuestions(userEmail, userDeductions);
        appendHistory(userEmail, fullText, generatedText);

        res.status(200).json({ success: true, answer: generatedText });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});


// PAYPAL PAYMENTS
const generateAccessToken = async () => {
    try {
        if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
            throw new Error("MISSING_API_CREDENTIALS");
        }
        const auth = Buffer.from(
            PAYPAL_CLIENT_ID + ":" + PAYPAL_CLIENT_SECRET,
        ).toString("base64");
        const response = await fetch(`${base}/v1/oauth2/token`, {
            method: "POST",
            body: "grant_type=client_credentials",
            headers: {
                Authorization: `Basic ${auth}`,
            },
        });

        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error("Failed to generate Access Token:", error);
    }
};

/**
* Create an order to start the transaction.
* @see https://developer.paypal.com/docs/api/orders/v2/#orders_create
*/

const createOrder = async (cartDetails) => {
    console.log(
        "shopping cart information passed from the frontend createOrder() callback:",
        cartDetails,
    );

    const accessToken = await generateAccessToken();
    const url = `${base}/v2/checkout/orders`;
    const payload = {
        intent: "CAPTURE",
        purchase_units: [{
            amount: cartDetails.amount
        }]
    };

    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            // Uncomment one of these to force an error for negative testing (in sandbox mode only). Documentation:
            // https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/
            // "PayPal-Mock-Response": '{"mock_application_codes": "MISSING_REQUIRED_PARAMETER"}'
            // "PayPal-Mock-Response": '{"mock_application_codes": "PERMISSION_DENIED"}'
            // "PayPal-Mock-Response": '{"mock_application_codes": "INTERNAL_SERVER_ERROR"}'
        },
        method: "POST",
        body: JSON.stringify(payload),
    });

    return handleResponse(response);
};


async function handleResponse(response) {
    try {
        const jsonResponse = await response.json();
        return {
            jsonResponse,
            httpStatusCode: response.status,
        };
    } catch (err) {
        const errorMessage = await response.text();
        throw new Error(errorMessage);
    }
}


const captureOrder = async (orderID, userEmail, questionCount) => {
    const accessToken = await generateAccessToken();
    const url = `${base}/v2/checkout/orders/${orderID}/capture`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            // Uncomment one of these to force an error for negative testing (in sandbox mode only). Documentation:
            // https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/
            // "PayPal-Mock-Response": '{"mock_application_codes": "INSTRUMENT_DECLINED"}'
            // "PayPal-Mock-Response": '{"mock_application_codes": "TRANSACTION_REFUSED"}'
            // "PayPal-Mock-Response": '{"mock_application_codes": "INTERNAL_SERVER_ERROR"}'
        },
    });

    const result = await handleResponse(response);

    if (result.httpStatusCode === 201 && userEmail && questionCount) {
        // If the order capture was successful, increment the user's question count
        await incrementUserQuestions(userEmail, questionCount);
    }

    return result;
};


router.post("/api/orders", async (req, res) => {
    try {
        // Extract the quantity of questions from the cart passed from the frontend
        const quantity = parseInt(req.body.cart[0].quantity, 10);

        // Calculate the total price
        const totalPrice = calculatePrice(quantity);

        const cartDetails = {
            id: "Questions",
            amount: {
                currency_code: "EUR",
                value: totalPrice.toString()
            }
        };

        const { jsonResponse, httpStatusCode } = await createOrder(cartDetails);
        res.status(httpStatusCode).json(jsonResponse);
    } catch (error) {
        console.error("Failed to create order:", error);
        res.status(500).json({ error: "Failed to create order." });
    }
});

function calculatePrice(quantity) {
    let price = 1; // default price for 1 question

    if (quantity >= 10 && quantity <= 19) {
        price = 1 - 0.05; // 5% discount
    } else if (quantity >= 20 && quantity <= 29) {
        price = 1 - 0.10; // 10% discount
    } else if (quantity >= 30 && quantity <= 39) {
        price = 1 - 0.15; // 15% discount
    } else if (quantity >= 40 && quantity <= 49) {
        price = 1 - 0.17; // 17% discount
    } else if (quantity >= 50) {
        price = 1 - 0.20; // 20% discount
    }

    return price * quantity;
}


router.post("/api/orders/:orderID/capture", requiresAuth(), async (req, res) => {
    try {
        const { orderID } = req.params;
        const userEmail = req.oidc.user.email;
        // Assuming the frontend sends the number of questions the user has purchased
        const questionCount = req.body.quantity;
        console.log(questionCount)


        const { jsonResponse, httpStatusCode } = await captureOrder(orderID, userEmail, questionCount);
        res.status(httpStatusCode).json(jsonResponse);
    } catch (error) {
        console.error("Failed to capture order:", error);
        res.status(500).json({ error: "Failed to capture order." });
    }
});




module.exports = router;
