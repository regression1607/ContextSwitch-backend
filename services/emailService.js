const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendContactEmail = async ({ name, email, phone, subject, message, plan }) => {
  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: process.env.SMTP_USER,
    subject: `ContextSwitch - ${subject || 'New Contact Form Submission'}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #c8f542; background: #0a0a0a; padding: 20px; border-radius: 8px;">
          New Contact Form Submission
        </h2>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-top: 20px;">
          <h3 style="margin-top: 0;">Contact Details</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
          ${plan ? `<p><strong>Interested Plan:</strong> ${plan}</p>` : ''}
        </div>
        
        <div style="background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px; margin-top: 20px;">
          <h3 style="margin-top: 0;">Message</h3>
          <p>${message}</p>
        </div>
        
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          This email was sent from ContextSwitch website contact form.
        </p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

const sendSubscriptionInterestEmail = async ({ name, email, phone, plan, message }) => {
  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: process.env.SMTP_USER,
    subject: `ContextSwitch - New ${plan} Plan Interest`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0a0a0a; background: #c8f542; padding: 20px; border-radius: 8px;">
          🎉 New Subscription Interest - ${plan} Plan
        </h2>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-top: 20px;">
          <h3 style="margin-top: 0;">User Details</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
          <p><strong>Interested Plan:</strong> <span style="color: #c8f542; background: #0a0a0a; padding: 4px 12px; border-radius: 4px;">${plan}</span></p>
        </div>
        
        ${message ? `
        <div style="background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px; margin-top: 20px;">
          <h3 style="margin-top: 0;">Additional Message</h3>
          <p>${message}</p>
        </div>
        ` : ''}
        
        <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-top: 20px;">
          <p style="margin: 0;"><strong>Action Required:</strong> Contact this user to complete their subscription.</p>
        </div>
        
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          This email was sent from ContextSwitch website pricing section.
        </p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  sendContactEmail,
  sendSubscriptionInterestEmail,
};
