const mongoose = require('mongoose');

const contextSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContextSwitchUser',
    required: true,
    index: true
  },
  projectName: {
    type: String,
    required: true,
    trim: true
  },
  platform: {
    type: String,
    enum: ['chatgpt', 'claude', 'gemini', 'other'],
    default: 'other'
  },
  // Original context details
  original: {
    messageCount: {
      type: Number,
      default: 0
    },
    characterCount: {
      type: Number,
      default: 0
    },
    tokenEstimate: {
      type: Number,
      default: 0
    }
  },
  // Compressed context details
  compressed: {
    characterCount: {
      type: Number,
      default: 0
    },
    tokenEstimate: {
      type: Number,
      default: 0
    },
    compressionRatio: {
      type: Number,
      default: 0
    }
  },
  // Storage (optional - can store compressed context in DB)
  compressedContext: {
    type: String,
    default: null
  },
  // Metadata
  status: {
    type: String,
    enum: ['saved', 'compressed', 'deleted'],
    default: 'saved'
  }
}, { timestamps: true });

// Index for efficient queries
contextSchema.index({ user: 1, createdAt: -1 });
contextSchema.index({ user: 1, platform: 1 });

// Static method to get user stats
contextSchema.statics.getUserStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalContexts: { $sum: 1 },
        totalCompressions: {
          $sum: { $cond: [{ $eq: ['$status', 'compressed'] }, 1, 0] }
        },
        totalOriginalChars: { $sum: '$original.characterCount' },
        totalCompressedChars: { $sum: '$compressed.characterCount' },
        totalTokensSaved: {
          $sum: {
            $subtract: ['$original.tokenEstimate', '$compressed.tokenEstimate']
          }
        },
        avgCompressionRatio: { $avg: '$compressed.compressionRatio' },
        platformBreakdown: { $push: '$platform' }
      }
    }
  ]);

  return stats[0] || {
    totalContexts: 0,
    totalCompressions: 0,
    totalOriginalChars: 0,
    totalCompressedChars: 0,
    totalTokensSaved: 0,
    avgCompressionRatio: 0
  };
};

// Static method to get recent activity
contextSchema.statics.getRecentActivity = async function(userId, limit = 10) {
  return this.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('projectName platform original compressed status createdAt');
};

module.exports = mongoose.model('Context', contextSchema);
