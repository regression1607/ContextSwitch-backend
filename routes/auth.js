const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const router = express.Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Google Sign-In
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ success: false, message: 'Google credential is required' });
    }

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email not provided by Google' });
    }

    // Find existing user or create new one
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // Update Google info if not set
      if (!user.googleId) user.googleId = googleId;
      if (!user.profilePicture && picture) user.profilePicture = picture;
      if (picture) user.profilePicture = picture;
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        name,
        email: email.toLowerCase(),
        googleId,
        profilePicture: picture || null,
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        subscription: user.subscription,
        usage: user.usage,
        limits: user.limits
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    if (error.message?.includes('Token used too late') || error.message?.includes('Invalid token')) {
      return res.status(401).json({ success: false, message: 'Google sign-in expired. Please try again.' });
    }
    res.status(500).json({ success: false, message: 'Google authentication failed' });
  }
});

module.exports = router;
