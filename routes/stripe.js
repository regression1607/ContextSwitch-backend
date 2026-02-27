const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const auth = require('../middleware/auth');
const User = require('../models/User');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Price IDs - Set these in Stripe Dashboard and update here
const PRICE_IDS = {
  pro_monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  pro_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
  enterprise_monthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
  enterprise_yearly: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID
};

// Plan limits configuration
const PLAN_LIMITS = {
  free: {
    maxCompressionsPerMonth: 50,
    maxContextsStored: 10
  },
  pro: {
    maxCompressionsPerMonth: 500,
    maxContextsStored: 100
  },
  enterprise: {
    maxCompressionsPerMonth: -1, // Unlimited
    maxContextsStored: -1 // Unlimited
  }
};

// Create checkout session
router.post('/create-checkout-session', auth, async (req, res) => {
  try {
    const { priceId, planType } = req.body;
    const user = req.user;

    if (!priceId) {
      return res.status(400).json({ success: false, message: 'Price ID is required' });
    }

    // Create or get Stripe customer
    let customerId = user.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString()
        }
      });
      customerId = customer.id;

      // Save customer ID to user
      await User.findByIdAndUpdate(user._id, {
        'subscription.stripeCustomerId': customerId
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/profile?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?canceled=true`,
      metadata: {
        userId: user._id.toString(),
        planType: planType || 'pro'
      },
      subscription_data: {
        metadata: {
          userId: user._id.toString(),
          planType: planType || 'pro'
        }
      },
      allow_promotion_codes: true
    });

    res.json({ success: true, sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create customer portal session
router.post('/create-portal-session', auth, async (req, res) => {
  try {
    const user = req.user;
    const customerId = user.subscription?.stripeCustomerId;

    if (!customerId) {
      return res.status(400).json({ success: false, message: 'No subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL}/profile`
    });

    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error('Create portal session error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get subscription status
router.get('/subscription-status', auth, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      success: true,
      subscription: {
        plan: user.subscription?.plan || 'free',
        status: user.subscription?.status || 'active',
        startDate: user.subscription?.startDate,
        endDate: user.subscription?.endDate
      },
      usage: user.usage,
      limits: user.limits
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await handleCheckoutCompleted(session);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      await handleSubscriptionUpdate(subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      await handleSubscriptionCancelled(subscription);
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      await handleInvoicePaid(invoice);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      await handlePaymentFailed(invoice);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// Helper functions for webhook handlers
async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.userId;
  const planType = session.metadata?.planType || 'pro';

  if (userId) {
    const limits = PLAN_LIMITS[planType] || PLAN_LIMITS.pro;
    
    await User.findByIdAndUpdate(userId, {
      'subscription.plan': planType,
      'subscription.status': 'active',
      'subscription.stripeSubscriptionId': session.subscription,
      'subscription.startDate': new Date(),
      'limits.maxCompressionsPerMonth': limits.maxCompressionsPerMonth,
      'limits.maxContextsStored': limits.maxContextsStored
    });

    console.log(`User ${userId} upgraded to ${planType} plan`);
  }
}

async function handleSubscriptionUpdate(subscription) {
  const userId = subscription.metadata?.userId;
  
  if (userId) {
    const status = subscription.status === 'active' ? 'active' : 
                   subscription.status === 'trialing' ? 'trial' :
                   subscription.status === 'canceled' ? 'cancelled' : 'expired';

    await User.findByIdAndUpdate(userId, {
      'subscription.status': status,
      'subscription.endDate': subscription.current_period_end 
        ? new Date(subscription.current_period_end * 1000) 
        : null
    });

    console.log(`Subscription updated for user ${userId}: ${status}`);
  }
}

async function handleSubscriptionCancelled(subscription) {
  const userId = subscription.metadata?.userId;
  
  if (userId) {
    await User.findByIdAndUpdate(userId, {
      'subscription.plan': 'free',
      'subscription.status': 'cancelled',
      'subscription.stripeSubscriptionId': null,
      'limits.maxCompressionsPerMonth': PLAN_LIMITS.free.maxCompressionsPerMonth,
      'limits.maxContextsStored': PLAN_LIMITS.free.maxContextsStored
    });

    console.log(`Subscription cancelled for user ${userId}`);
  }
}

async function handleInvoicePaid(invoice) {
  const customerId = invoice.customer;
  
  const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });
  if (user) {
    // Reset monthly usage on successful payment
    await User.findByIdAndUpdate(user._id, {
      'usage.monthlyCompressions': 0,
      'usage.lastResetAt': new Date()
    });

    console.log(`Invoice paid for user ${user._id}`);
  }
}

async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  
  const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });
  if (user) {
    // You could send an email notification here
    console.log(`Payment failed for user ${user._id}`);
  }
}

// Get available plans/prices
router.get('/plans', async (req, res) => {
  try {
    res.json({
      success: true,
      plans: {
        pro: {
          monthly: {
            priceId: PRICE_IDS.pro_monthly,
            price: 9.99,
            currency: 'usd'
          },
          yearly: {
            priceId: PRICE_IDS.pro_yearly,
            price: 99.99,
            currency: 'usd'
          },
          features: [
            '500 compressions/month',
            '100 saved contexts',
            'Priority support',
            'Advanced compression'
          ]
        },
        enterprise: {
          monthly: {
            priceId: PRICE_IDS.enterprise_monthly,
            price: 29.99,
            currency: 'usd'
          },
          yearly: {
            priceId: PRICE_IDS.enterprise_yearly,
            price: 299.99,
            currency: 'usd'
          },
          features: [
            'Unlimited compressions',
            'Unlimited saved contexts',
            '24/7 Priority support',
            'Team features',
            'API access'
          ]
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
