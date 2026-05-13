const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  bio: { type: String, default: '' },
  followers: [{ type: String }],
  following: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);