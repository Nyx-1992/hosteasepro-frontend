const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  guest: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    numberOfGuests: { type: Number, required: true, min: 1 },
    specialRequests: String
  },
  dates: {
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    nights: { type: Number, required: true }
  },
  pricing: {
    baseAmount: { type: Number, required: true },
    cleaningFee: { type: Number, default: 0 },
    securityDeposit: { type: Number, default: 0 },
    taxes: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: 'ZAR' }
  },
  platform: {
    name: { 
      type: String, 
      enum: ['booking.com', 'lekkeslaap', 'fewo', 'airbnb', 'domestic', 'direct'],
      required: true 
    },
    bookingId: String,
    confirmationNumber: String
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show'],
    default: 'pending'
  },
  checkIn: {
    actualTime: Date,
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    damages: String,
    keyHandedOver: { type: Boolean, default: false }
  },
  checkOut: {
    actualTime: Date,
    checkedOutBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    damages: String,
    cleaningNotes: String,
    keyReturned: { type: Boolean, default: false }
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'refunded'],
    default: 'pending'
  },
  communications: [{
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['email', 'sms', 'call', 'platform'] },
    message: String,
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  icalSource: {
    lastSync: Date,
    eventId: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
bookingSchema.index({ 'dates.checkIn': 1, 'dates.checkOut': 1 });
bookingSchema.index({ property: 1, status: 1 });
bookingSchema.index({ 'platform.name': 1 });

module.exports = mongoose.model('Booking', bookingSchema);
