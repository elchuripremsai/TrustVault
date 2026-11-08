const { clientOrigin } = require('./config');

class EmailDeliveryError extends Error {
  constructor() {
    super('Verification email delivery failed.');
    this.name = 'EmailDeliveryError';
  }
}

async function sendVerificationEmail({ email, name, token }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error('Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.');
  }

  const verificationUrl = new URL('/verify-email', clientOrigin);
  verificationUrl.hash = new URLSearchParams({ token }).toString();
  const safeName = name.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const url = verificationUrl.toString();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Verify your TrustVault email address',
      text: `Hello ${name},\n\nVerify your email address to activate your TrustVault account:\n${url}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this email.`,
      html: `<p>Hello ${safeName},</p><p>Verify your email address to activate your TrustVault account:</p><p><a href="${url}">Verify email address</a></p><p>This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider rejected the verification email (HTTP ${response.status}).`);
  }
}

module.exports = { sendVerificationEmail, EmailDeliveryError };
