const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    province: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true, default: 'South Africa' }
  },
  propertyType: {
    type: String,
    enum: ['apartment', 'house', 'studio', 'villa', 'other'],
    required: true
  },
  bedrooms: {
    type: Number,
    required: true,
    min: 0
  },
  bathrooms: {
    type: Number,
    required: true,
    min: 0
  },
  maxGuests: {
    type: Number,
    required: true,
    min: 1
  },
  amenities: [{
    type: String
  }],
  images: [{
    url: String,
    caption: String
  }],
  pricing: {
    basePrice: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'ZAR'
    },
    cleaningFee: {
      type: Number,
      default: 0
    },
    securityDeposit: {
      type: Number,
      default: 0
    }
  },
  platformIntegrations: {
    bookingCom: {
      icalUrl: String,
      propertyId: String,
      isActive: { type: Boolean, default: false }
    },
    lekkeSlaap: {
      icalUrl: String,
      propertyId: String,
      isActive: { type: Boolean, default: false }
    },
    fewo: {
      icalUrl: String,
      propertyId: String,
      isActive: { type: Boolean, default: false }
    },
    airbnb: {
      icalUrl: String,
      propertyId: String,
      isActive: { type: Boolean, default: false }
    }
  },
  checkInInfo: {
    checkInTime: { type: String, default: '15:00' },
    checkOutTime: { type: String, default: '11:00' },
    instructions: String,
    keyLocation: String,
    wifiPassword: String,
    emergencyContact: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Property', propertySchema);
