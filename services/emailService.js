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

const sendRenewalReminderEmail = async ({ name, email, plan, daysRemaining, renewUrl }) => {
  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: email,
    subject: `ContextSwitch - Your ${plan} plan expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0a0a; color: #fff; border-radius: 12px;">
        <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
          <h1 style="color: #c8f542; margin: 0;">ContextSwitch</h1>
        </div>
        
        <div style="padding: 30px 20px; text-align: center;">
          <h2 style="color: #fff; margin-bottom: 10px;">Hey ${name},</h2>
          <p style="color: rgba(255,255,255,0.7); font-size: 16px; line-height: 1.6;">
            Your <strong style="color: #c8f542;">${plan}</strong> plan expires in 
            <strong style="color: #f59e0b;">${daysRemaining} day${daysRemaining === 1 ? '' : 's'}</strong>.
          </p>
          <p style="color: rgba(255,255,255,0.5); font-size: 14px;">
            Renew now to keep your compression power and saved contexts.
          </p>
          
          <a href="${renewUrl || 'https://www.context-switch.dev/profile'}" 
             style="display: inline-block; margin-top: 20px; padding: 14px 32px; background: #c8f542; color: #0a0a0a; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Renew Now
          </a>
        </div>
        
        <div style="padding: 15px 20px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;">
          <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin: 0;">
            If you don't renew, your account will be downgraded to the Free plan automatically.
          </p>
        </div>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  saveContactForm,
  saveSubscriptionInterest,
};
