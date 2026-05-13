const express = require('express');
const { db, getSetting } = require('../database/db');
const { charge, MODE: ELAVON_MODE } = require('../lib/elavon');
const { sendWelcomeEmail } = require('../lib/mailer');

const router = express.Router();

function requireMember(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in.' });
  next();
}

router.get('/pricing', (req, res) => {
  res.json({
    annual_dues_cents: parseInt(getSetting('annual_dues_cents', '5000'), 10),
    guest_fee_cents: parseInt(getSetting('guest_fee_cents', '1000'), 10),
    card_fee_percent: parseFloat(getSetting('card_fee_percent', '3')),
    elavon_mode: ELAVON_MODE,
  });
});

// Card payment via mock Elavon
router.post('/card', requireMember, async (req, res) => {
  const { purpose, event_id, card_number, name_on_card } = req.body || {};
  const amount = computeAmount(purpose, event_id);
  if (!amount) return res.status(400).json({ error: 'Unable to determine amount for this payment.' });
  if (!card_number || String(card_number).replace(/\s+/g, '').length < 12) {
    return res.status(400).json({ error: 'Please enter a valid card number.' });
  }

  const last4 = String(card_number).replace(/\s+/g, '').slice(-4);
  let result;
  try {
    result = await charge({ amountCents: amount, last4, name: name_on_card });
  } catch (err) {
    return res.status(502).json({ error: 'Payment processor error. Please try again or pay by check.' });
  }
  if (!result.approved) {
    return res.status(402).json({ error: 'Card was declined. Please try a different card or pay by check.' });
  }

  const member = db.prepare('SELECT * FROM members WHERE user_id = ?').get(req.session.user.id);
  const payId = db
    .prepare(`INSERT INTO payments
        (member_id, amount_cents, purpose, method, status, reference, event_id, confirmed_at)
        VALUES (?, ?, ?, 'card', 'Paid', ?, ?, datetime('now'))`)
    .run(member ? member.id : null, amount, purpose, result.reference, event_id || null).lastInsertRowid;

  if (purpose === 'membership' && member) {
    db.prepare("UPDATE members SET status = 'Paid' WHERE id = ?").run(member.id);
    await sendWelcomeEmail({ to: req.session.user.email, name: member.full_name, isRenewal: false });
  }

  res.json({ ok: true, payment_id: payId, reference: result.reference, mode: ELAVON_MODE });
});

// Cash / check - records as pending, admin confirms later
router.post('/cash-check', requireMember, (req, res) => {
  const { purpose, method, event_id, check_number } = req.body || {};
  if (!['cash', 'check'].includes(method)) {
    return res.status(400).json({ error: 'Method must be cash or check.' });
  }
  const amount = computeAmount(purpose, event_id);
  if (!amount) return res.status(400).json({ error: 'Unable to determine amount for this payment.' });

  const member = db.prepare('SELECT * FROM members WHERE user_id = ?').get(req.session.user.id);
  const payId = db
    .prepare(`INSERT INTO payments
        (member_id, amount_cents, purpose, method, status, reference, event_id)
        VALUES (?, ?, ?, ?, 'Pending', ?, ?)`)
    .run(member ? member.id : null, amount, purpose, method, check_number || null, event_id || null).lastInsertRowid;
  res.json({
    ok: true,
    payment_id: payId,
    message: 'Payment recorded as pending. Please mail to the APA PO Box, deliver in person, or leave in the shed mailbox. An admin will confirm receipt.',
  });
});

function computeAmount(purpose, eventId) {
  if (purpose === 'membership') return parseInt(getSetting('annual_dues_cents', '5000'), 10);
  if (purpose === 'guest') return parseInt(getSetting('guest_fee_cents', '1000'), 10);
  if (purpose === 'tournament' || purpose === 'social') {
    if (!eventId) return null;
    const ev = db.prepare('SELECT cost_cents FROM events WHERE id = ?').get(eventId);
    return ev ? ev.cost_cents : null;
  }
  return null;
}

module.exports = router;
