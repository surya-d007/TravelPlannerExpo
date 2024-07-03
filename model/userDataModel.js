const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  tripData: Object,
  location: String,
});

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  trips: [tripSchema], // Array of trips
});

const User = mongoose.model('User', userSchema);

module.exports = User;
