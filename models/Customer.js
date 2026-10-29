const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    default: 'Valued Guest'
  },
  walletOpens: {
    type: Number,
    default: 0,
    min: 0
  },
  lastWalletOpenedAt: Date,
  activePoints: {
    type: Number,
    default: 0,
    min: 0
  },
  rewardsAvailable: {
    type: Number,
    default: 0,
    min: 0
  },
  totalLifetimeVisits: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  ratingFeedback: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  ratingUpdatedAt: Date,
  history: [{
    action: {
      type: String,
      enum: ['EARN', 'REDEEM']
    },
    amount: Number,
    items: {
      type: String,
      default: ''
    },
    date: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
