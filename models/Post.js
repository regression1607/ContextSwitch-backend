const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContextSwitchUser',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    maxlength: 10000
  },
  // Post category
  category: {
    type: String,
    enum: ['prompt', 'ai-news', 'ai-update', 'discussion', 'tutorial', 'showcase'],
    default: 'prompt'
  },
  // Display template for shareable page
  template: {
    type: String,
    enum: ['minimal', 'card', 'magazine', 'terminal', 'neon'],
    default: 'minimal'
  },
  // Prompt text (the main shareable prompt)
  prompt: {
    type: String,
    default: null,
    maxlength: 5000
  },
  // Tags
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  // Platform the prompt is for
  platform: {
    type: String,
    enum: ['chatgpt', 'claude', 'gemini', 'midjourney', 'dalle', 'general', 'other'],
    default: 'general'
  },
  // Images stored as base64 in MongoDB (max 3 images)
  images: [{
    data: {
      type: String,
      required: true
    },
    contentType: {
      type: String,
      required: true
    },
    filename: {
      type: String,
      default: 'image'
    }
  }],
  // Engagement
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContextSwitchUser'
  }],
  likesCount: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  // Status
  status: {
    type: String,
    enum: ['published', 'draft', 'hidden'],
    default: 'published'
  }
}, { timestamps: true });

// Indexes for efficient queries
postSchema.index({ createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ platform: 1 });
postSchema.index({ category: 1 });
postSchema.index({ likesCount: -1 });

// Virtual for like count
postSchema.methods.isLikedBy = function(userId) {
  return this.likes.some(id => id.toString() === userId.toString());
};

module.exports = mongoose.model('Post', postSchema);
