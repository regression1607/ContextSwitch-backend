const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  // Subscription details
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired', 'trial'],
      default: 'active'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: null
    },
    stripeCustomerId: String,
    stripeSubscriptionId: String
  },
  // Usage tracking
  usage: {
    totalCompressions: {
      type: Number,
      default: 0
    },
    totalContextsSaved: {
      type: Number,
      default: 0
    },
    totalTokensSaved: {
      type: Number,
      default: 0
    },
    totalCharactersCompressed: {
      type: Number,
      default: 0
    },
    monthlyCompressions: {
      type: Number,
      default: 0
    },
    lastCompressionAt: Date,
    lastResetAt: {
      type: Date,
      default: Date.now
    }
  },
  // Subscription limits based on plan
  limits: {
    maxCompressionsPerMonth: {
      type: Number,
      default: 50 // Free plan default
    },
    maxContextsStored: {
      type: Number,
      default: 10 // Free plan default
    }
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('ContextSwitchUser', userSchema);
