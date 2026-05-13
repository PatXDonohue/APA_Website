// Minimal mailer wrapper. In production set GMAIL_USER + GMAIL_APP_PASSWORD env vars.
// In dev (no creds), we log the email payload to the console instead of sending.

let transporter = null;

function getTransporter() {
  if (transporter !== null) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    transporter = false; // sentinel: log mode
    return transporter;
  }
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.log('\n[mailer:dev] ----- email (not sent, no SMTP creds) -----');
    console.log('  to:     ', to);
    console.log('  subject:', subject);
    console.log('  body:   ', text || html);
    console.log('[mailer:dev] -----------------------------------------\n');
    return { mocked: true };
  }
  return t.sendMail({
    from: `"Abington Pickleball Association" <${process.env.GMAIL_USER}>`,
    to, subject, text, html,
  });
}

function welcomeBody({ name, isRenewal }) {
  const lockbox = process.env.LOCKBOX_CODE || '(set LOCKBOX_CODE in env)';
  const potty = process.env.PORTAPOTTY_CODE || '(set PORTAPOTTY_CODE in env)';
  const greeting = isRenewal ? 'Thanks for renewing' : 'Welcome to the Abington Pickleball Association';
  return `${greeting}, ${name}!

Your payment has been received and your membership is now active.

Please keep the following confidential codes for your reference:
  Lockbox passcode:     ${lockbox}
  Porta potty passcode: ${potty}

Questions? Reply to this email or reach us at our APA Gmail account.

See you on the courts,
The APA Board`;
}

async function sendWelcomeEmail({ to, name, isRenewal = false }) {
  return sendMail({
    to,
    subject: isRenewal ? 'APA Membership Renewed' : 'Welcome to the APA',
    text: welcomeBody({ name, isRenewal }),
  });
}

module.exports = { sendMail, sendWelcomeEmail };
