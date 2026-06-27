const User = require('../models/User');

/**
 * Middleware to check and auto-downgrade expired subscriptions.
 * Runs after auth middleware. If subscription.endDate has passed,
 * resets user to free plan before the request continues.
 */
const checkSubscription = async (req, res, next) => {
  try {
    const user = req.user;

    // Skip if no user or already on free plan
    if (!user || user.subscription?.plan === 'free') {
      return next();
    }

    const endDate = user.subscription?.endDate;
    if (!endDate) {
      return next();
    }

    // Check if subscription has expired
    if (new Date() > new Date(endDate)) {
      // Auto-downgrade to free plan
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'subscription.plan': 'free',
          'subscription.status': 'expired',
          'limits.maxCompressionsPerMonth': 0,
          'limits.maxContextsStored': 10,
        },
      });

      // Update the request user object so downstream handlers see the change
      user.subscription.plan = 'free';
      user.subscription.status = 'expired';
      user.limits.maxCompressionsPerMonth = 0;
      user.limits.maxContextsStored = 10;

      console.log(`Subscription expired for user ${user._id}, downgraded to free`);
    }

    next();
  } catch (error) {
    console.error('Check subscription error:', error);
    next(); // Don't block the request on error
  }
};

module.exports = checkSubscription;
