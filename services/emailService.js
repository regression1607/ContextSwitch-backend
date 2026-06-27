const GOOGLE_SHEET_WEBHOOK = process.env.GOOGLE_SHEET_WEBHOOK;

const saveToSheet = async (data) => {
  if (!GOOGLE_SHEET_WEBHOOK) {
    throw new Error('GOOGLE_SHEET_WEBHOOK is not configured');
  }

  const response = await fetch(GOOGLE_SHEET_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  // Google Apps Script redirects on POST, so follow the redirect
  if (!response.ok && response.status !== 302) {
    throw new Error(`Google Sheet webhook failed: ${response.status}`);
  }

  return { success: true };
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
