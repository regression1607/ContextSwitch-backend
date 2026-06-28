const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Plan configuration with pricing (amounts in paise/cents)
const PLANS = {
  pro: {
    name: 'Pro',
    INR: {
      monthly: { amount: 6900, display: '₹69', period: 'month' },
      yearly: { amount: 69900, display: '₹699', period: 'year' },
    },
    USD: {
      monthly: { amount: 399, display: '$3.99', period: 'month' },
      yearly: { amount: 3900, display: '$39', period: 'year' },
    },
    limits: { maxCompressionsPerMonth: 500, maxContextsStored: 100 },
  },
  enterprise: {
    name: 'Enterprise',
    INR: {
      monthly: { amount: 36900, display: '₹369', period: 'month' },
      yearly: { amount: 369900, display: '₹3,699', period: 'year' },
    },
    USD: {
      monthly: { amount: 999, display: '$9.99', period: 'month' },
      yearly: { amount: 9900, display: '$99', period: 'year' },
    },
    limits: { maxCompressionsPerMonth: 9999, maxContextsStored: 9999 },
  },
};

// GET /api/payment/plans - Get available plans
router.get('/plans', (req, res) => {
  const currency = req.query.currency || 'INR';
  const plans = Object.entries(PLANS).map(([key, plan]) => ({
    id: key,
    name: plan.name,
    pricing: plan[currency] || plan.INR,
    limits: plan.limits,
  }));
  res.json({ success: true, data: { plans } });
});

// POST /api/payment/create-order - Create a Razorpay order
router.post('/create-order', auth, async (req, res) => {
  try {
    const { plan, billingCycle, currency } = req.body;

    if (!plan || !billingCycle) {
      return res.status(400).json({ success: false, message: 'Plan and billing cycle are required' });
    }

    const planConfig = PLANS[plan];
    if (!planConfig) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }

    const curr = currency === 'USD' ? 'USD' : 'INR';
    const priceConfig = planConfig[curr]?.[billingCycle];
    if (!priceConfig) {
      return res.status(400).json({ success: false, message: 'Invalid billing cycle' });
    }

    // Validate minimum amount (100 paise / cents)
    if (priceConfig.amount < 100) {
      return res.status(400).json({ success: false, message: 'Amount must be at least 100 paise' });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: priceConfig.amount, // Amount in paise (INR) or cents (USD)
      currency: curr,
      receipt: `cs_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        plan: plan,
        billingCycle: billingCycle,
        userName: req.user.name,
        userEmail: req.user.email,
      },
    });

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        plan: plan,
        billingCycle: billingCycle,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment order' });
  }
});

// POST /api/payment/verify - Verify payment and activate subscription
router.post('/verify', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, billingCycle } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification data is required' });
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // Verify the plan
    const planConfig = PLANS[plan];
    if (!planConfig) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }

    // Calculate subscription end date
    const now = new Date();
    let endDate;
    if (billingCycle === 'yearly') {
      endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    } else {
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }

    // Update user subscription
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          'subscription.plan': plan,
          'subscription.status': 'active',
          'subscription.startDate': now,
          'subscription.endDate': endDate,
          'subscription.razorpayPaymentId': razorpay_payment_id,
          'subscription.razorpayOrderId': razorpay_order_id,
          'subscription.billingCycle': billingCycle,
          'limits.maxCompressionsPerMonth': planConfig.limits.maxCompressionsPerMonth,
          'limits.maxContextsStored': planConfig.limits.maxContextsStored,
        },
      },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: `Successfully upgraded to ${planConfig.name} plan!`,
      data: {
        subscription: user.subscription,
        limits: user.limits,
      },
    });
  } catch (error) {
    console.error('Payment verify error:', error);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
});

// POST /api/payment/webhook - Handle Razorpay webhooks
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify webhook signature
    if (webhookSecret) {
      const signature = req.headers['x-razorpay-signature'];
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('Webhook signature mismatch');
        return res.status(400).json({ success: false });
      }
    }

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { event: eventType, payload } = event;

    console.log('Razorpay webhook event:', eventType);

    switch (eventType) {
      case 'payment.captured': {
        // Payment was successfully captured
        const payment = payload.payment.entity;
        const userId = payment.notes?.userId;

        if (userId) {
          console.log(`Payment captured for user ${userId}: ${payment.id}`);
        }
        break;
      }

      case 'payment.failed': {
        // Payment failed
        const payment = payload.payment.entity;
        const userId = payment.notes?.userId;

        if (userId) {
          console.log(`Payment failed for user ${userId}: ${payment.id}`);
        }
        break;
      }

      case 'order.paid': {
        // Order was paid - update subscription as backup
        const order = payload.order.entity;
        const userId = order.notes?.userId;
        const plan = order.notes?.plan;
        const billingCycle = order.notes?.billingCycle;

        if (userId && plan) {
          const planConfig = PLANS[plan];
          if (planConfig) {
            const now = new Date();
            let endDate;
            if (billingCycle === 'yearly') {
              endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
            } else {
              endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
            }

            await User.findByIdAndUpdate(userId, {
              $set: {
                'subscription.plan': plan,
                'subscription.status': 'active',
                'subscription.startDate': now,
                'subscription.endDate': endDate,
                'limits.maxCompressionsPerMonth': planConfig.limits.maxCompressionsPerMonth,
                'limits.maxContextsStored': planConfig.limits.maxContextsStored,
              },
            });
            console.log(`Subscription activated via webhook for user ${userId}`);
          }
        }
        break;
      }

      default:
        console.log('Unhandled webhook event:', eventType);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false });
  }
});

// GET /api/payment/check-renewals - Cron endpoint to send renewal reminders
// Call daily via Vercel Cron or external cron service
router.get('/check-renewals', async (req, res) => {
  try {
    // Optional: protect with a secret key
    const cronSecret = req.query.secret;
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { sendRenewalReminderEmail } = require('../services/emailService');
    const now = new Date();

    // Find users whose subscription expires in 3 days or 1 day
    const reminderDays = [3, 1];
    let emailsSent = 0;

    for (const days of reminderDays) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);

      // Find users expiring on that day (same calendar date)
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const expiringUsers = await User.find({
        'subscription.plan': { $ne: 'free' },
        'subscription.status': 'active',
        'subscription.endDate': { $gte: startOfDay, $lt: endOfDay },
      }).select('name email subscription');

      for (const user of expiringUsers) {
        try {
          await sendRenewalReminderEmail({
            name: user.name,
            email: user.email,
            plan: user.subscription.plan,
            daysRemaining: days,
          });
          emailsSent++;
          console.log(`Renewal reminder sent to ${user.email} (${days} days)`);
        } catch (emailErr) {
          console.error(`Failed to send reminder to ${user.email}:`, emailErr.message);
        }
      }
    }

    res.json({ success: true, emailsSent });
  } catch (error) {
    console.error('Check renewals error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
