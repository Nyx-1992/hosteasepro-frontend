const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['procedures', 'troubleshooting', 'maintenance', 'guest-info', 'emergency', 'other'],
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  attachments: [{
    filename: String,
    url: String,
    fileType: String,
    size: Number
  }],
  views: {
    type: Number,
    default: 0
  },
  lastViewed: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for search functionality
knowledgeBaseSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
