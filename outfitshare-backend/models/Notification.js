const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: String, required: true },
  sender: { type: String, required: true },
  type: { type: String, enum: ['like', 'comment', 'follow'], required: true },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
  
});

module.exports = mongoose.model('Notification', notificationSchema);