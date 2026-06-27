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
  sendContactEmail,
  sendSubscriptionInterestEmail,
  sendRenewalReminderEmail,
};
