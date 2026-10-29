const mongoose = require('mongoose');

const loyaltySettingsSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: 'storefront'
  },
  custardFruitSaladAvailable: {
    type: Boolean,
    default: true
  },
  shopAddress: {
    type: String,
    default: 'Teppakulam, Madurai, Tamil Nadu 625009',
    trim: true,
    maxlength: 180
  },
  shopMapsUrl: {
    type: String,
    default: 'https://www.google.com/maps/place/9%C2%B054\'42.2%22N+78%C2%B008\'53.1%22E/@9.9117149,78.1471646,18z/data=!3m1!4b1!4m13!1m8!3m7!1s0x3b00c50726b72ae3:0xe013610ff6d4b0d6!2sTeppakulam,+Madurai,+Tamil+Nadu+625009!3b1!8m2!3d9.9114761!4d78.1498516!16s%2Fg%2F11gjw_8qy3!3m3!8m2!3d9.911713!4d78.148075?entry=ttu&g_ep=EgoyMDI2MTAyMC4wIKXMDSoASAFQAw%3D%3D',
    trim: true,
    maxlength: 2000
  }
}, { timestamps: true });

module.exports = mongoose.model('LoyaltySettings', loyaltySettingsSchema);
