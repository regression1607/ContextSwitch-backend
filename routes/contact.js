const express = require('express');
const { sendContactEmail, sendSubscriptionInterestEmail } = require('../services/emailService');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, and message are required' 
      });
    }

    await sendContactEmail({ name, email, phone, subject, message });

    res.json({ 
      success: true, 
      message: 'Your message has been sent successfully. We will get back to you soon!' 
    });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send message. Please try again later.' 
    });
  }
});

router.post('/subscription', async (req, res) => {
  try {
    const { name, email, phone, plan, message } = req.body;

    if (!name || !email || !plan) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, and plan are required' 
      });
    }

    await sendSubscriptionInterestEmail({ name, email, phone, plan, message });

    res.json({ 
      success: true, 
      message: 'Thank you for your interest! We will contact you shortly to complete your subscription.' 
    });
  } catch (error) {
    console.error('Subscription interest error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send request. Please try again later.' 
    });
  }
});

module.exports = router;
