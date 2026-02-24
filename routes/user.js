const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Context = require('../models/Context');

const router = express.Router();

// Get user profile with stats
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get context stats from Context collection
    const contextStats = await Context.getUserStats(req.user._id);
    
    // Get recent activity
    const recentActivity = await Context.getRecentActivity(req.user._id, 10);

    // Check if monthly reset needed (reset on 1st of each month)
    const now = new Date();
    const lastReset = user.usage.lastResetAt ? new Date(user.usage.lastResetAt) : new Date(0);
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
      user.usage.monthlyCompressions = 0;
      user.usage.lastResetAt = now;
      await user.save();
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt
        },
        subscription: user.subscription,
        usage: user.usage,
        limits: user.limits,
        contextStats,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user stats summary (lightweight endpoint)
router.get('/stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('usage subscription limits');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        usage: user.usage,
        subscription: user.subscription,
        limits: user.limits
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user's compression history
router.get('/history', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const contexts = await Context.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('projectName platform original compressed status createdAt');

    const total = await Context.countDocuments({ user: req.user._id });

    res.json({
      success: true,
      data: {
        contexts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name } = req.body;
    
    const updates = {};
    if (name) updates.name = name;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
