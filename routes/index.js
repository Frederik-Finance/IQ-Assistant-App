var router = require('express').Router();
const { requiresAuth } = require('express-openid-connect');
const multer = require('multer');
const upload = multer();

const vision = require('@google-cloud/vision');
const openai = require('openai');
const User = require('../models/user.js')

require('dotenv').config();

const mongoose = require('mongoose');


mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});


const API_KEY_VISION = process.env.API_KEY_VISION;
const API_KEY_GPT4 = process.env.API_KEY_GPT4;
const VISION_API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY_VISION}`;

const client = new vision.ImageAnnotatorClient();

openai.apiKey = API_KEY_GPT4;


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


router.get('/get-questions', requiresAuth(), async (req, res) => {
    try {
        const userEmail = req.oidc.user.email;

        if (!userEmail) {
            return res.status(400).json({ message: 'userEmail query parameter is required.' });
        }

        const user = await User.findOne({ userEmail: userEmail });

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        return res.json({ userEmail: user.userEmail, availableQuestions: user.availableQuestions });
    } catch (err) {
        return res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
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




router.post('/submit-images', upload.array('screenshots'), requiresAuth(), async (req, res, next) => {

    try {
        const userEmail = req.oidc.user.email

        // console.log(userEmail)
        let fullText = '';
        let userDeductions = 0

        // Iterate over each image and extract text
        console.log(req.files.screenshots)

        for (const image of req.files.screenshots) {
            const [result] = await client.textDetection(image.data);
            const detections = result.textAnnotations;
            const detectedText = detections.length ? detections[0].description : "";
            fullText += detectedText + '\n';
            userDeductions++

        }

        // Send the concatenated text to ChatGPT
        const response = await openai.ChatCompletion.create({
            model: "gpt-4",
            messages: [
                {
                    "role": "system",
                    "content": "You are tasked with answering a Cognitive Aptitude Test (CCAT) question that assesses problem-solving, comprehension, application of information, and critical thinking. Provide the best and most logical answer based on the given information."
                },
                {
                    "role": "user",
                    "content": fullText
                }
            ],
            max_tokens: 2000
        });

        const generated_text = response.choices[0].message['content'].trim();

        // if it was successful decrement the user questions
        decrementUserQuestions(userEmail, userDeductions)

        res.status(200).json({ success: true, answer: generated_text });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});



module.exports = router;
