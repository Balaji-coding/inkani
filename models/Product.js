const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    max: 100000
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  offer: {
    type: String,
    trim: true,
    maxlength: 40,
    default: ''
  },
  imagePath: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  imageAlt: {
    type: String,
    trim: true,
    maxlength: 160,
    default: ''
  },
  imagePublicId: {
    type: String,
    trim: true,
    maxlength: 255,
    default: '',
    select: false
  },
  available: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
