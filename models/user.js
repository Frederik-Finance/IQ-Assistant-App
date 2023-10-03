const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    userEmail: {
        type: String,
        required: true,
        unique: true
    },
    availableQuestions: {
        type: Number,
        default: 0
    },
    history: [{
        question: {
            type: String,
            required: true
        },
        answer: {
            type: String,
            required: true
        }
    }]
});

const User = mongoose.model('User', userSchema);

module.exports = User;
