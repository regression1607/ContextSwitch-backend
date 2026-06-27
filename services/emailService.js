const https = require('https');
const url = require('url');

const GOOGLE_SHEET_WEBHOOK = process.env.GOOGLE_SHEET_WEBHOOK;

const saveToSheet = (data) => {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_SHEET_WEBHOOK) {
      return reject(new Error('GOOGLE_SHEET_WEBHOOK is not configured'));
    }

    const postData = JSON.stringify(data);
    const parsed = new URL(GOOGLE_SHEET_WEBHOOK);

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      // Google Apps Script returns 302 redirect — that's OK
      if (res.statusCode === 302 || res.statusCode === 200) {
        resolve({ success: true });
      } else {
        reject(new Error(`Google Sheet webhook failed: ${res.statusCode}`));
      }
    });

    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
};

const saveContactForm = async ({ name, email, phone, subject, message }) => {
  return saveToSheet({
    type: 'contact',
    name,
    email,
    phone: phone || '',
    subject: subject || 'General Inquiry',
    message,
  });
};

const saveSubscriptionInterest = async ({ name, email, phone, plan, message }) => {
  return saveToSheet({
    type: 'subscription',
    name,
    email,
    phone: phone || '',
    subject: `Subscription Interest - ${plan}`,
    message: message || `User wants to subscribe to ${plan} plan`,
  });
};

module.exports = {
  saveContactForm,
  saveSubscriptionInterest,
};
