const mongoose = require('mongoose');

const financialRecordSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },
  category: {
    type: String,
    enum: [
      // Income categories
      'booking-revenue', 'cleaning-fee', 'security-deposit', 'late-fee',
      // Expense categories
      'cleaning', 'maintenance', 'supplies', 'utilities', 'insurance', 
      'platform-fees', 'marketing', 'other'
    ],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'ZAR'
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank-transfer', 'credit-card', 'platform-payout', 'other']
  },
  receiptNumber: {
    type: String,
    trim: true
  },
  vendor: {
    name: String,
    contact: String
  },
  taxInfo: {
    vatRate: { type: Number, default: 0 },
    vatAmount: { type: Number, default: 0 },
    isDeductible: { type: Boolean, default: false }
  },
  attachments: [{
    filename: String,
    url: String,
    fileType: String
  }],
  reconciled: {
    type: Boolean,
    default: false
  },
  reconciledDate: {
    type: Date
  },
  reconciledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for financial reporting
financialRecordSchema.index({ date: 1, type: 1, category: 1 });
financialRecordSchema.index({ property: 1, date: 1 });

module.exports = mongoose.model('FinancialRecord', financialRecordSchema);
