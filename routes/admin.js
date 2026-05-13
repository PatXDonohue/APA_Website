const express = require('express');
const { db, getSetting, setSetting } = require('../database/db');
const { sendMail, sendWelcomeEmail } = require('../lib/mailer');

const router = express.Router();

router.use((req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
});

router.get('/overview', (req, res) => {
  const members = db.prepare(`
    SELECT m.id, m.full_name, m.residency, m.status, m.challenge_play, u.email, u.username
    FROM members m JOIN users u ON u.id = m.user_id
    ORDER BY m.full_name
  `).all();
  const pendingPayments = db.prepare(`
    SELECT p.*, m.full_name AS member_name
    FROM payments p LEFT JOIN members m ON m.id = p.member_id
    WHERE p.status = 'Pending'
    ORDER BY p.created_at DESC
  `).all();
  const nonResidentCount = db.prepare(
    "SELECT COUNT(*) AS c FROM members WHERE residency = 'Non-Resident'"
  ).get().c;
  const nonResidentLimit = parseInt(getSetting('non_resident_limit', '25'), 10);
  res.json({ members, pendingPayments, nonResidentCount, nonResidentLimit });
});

router.post('/payments/:id/confirm', async (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });
  db.prepare(`UPDATE payments SET status='Paid', confirmed_by=?, confirmed_at=datetime('now') WHERE id=?`)
    .run(req.session.user.id, payment.id);

  if (payment.purpose === 'membership' && payment.member_id) {
    db.prepare("UPDATE members SET status='Paid' WHERE id=?").run(payment.member_id);
    const row = db.prepare(`
      SELECT m.full_name, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = ?
    `).get(payment.member_id);
    if (row) await sendWelcomeEmail({ to: row.email, name: row.full_name, isRenewal: false });
  }
  res.json({ ok: true });
});

router.post('/members/:id/challenge', (req, res) => {
  const flag = req.body && req.body.challenge_play ? 1 : 0;
  db.prepare('UPDATE members SET challenge_play = ? WHERE id = ?').run(flag, req.params.id);
  res.json({ ok: true });
});

router.get('/releases', (req, res) => {
  const releases = db.prepare(`
    SELECT r.*, m.full_name AS member_full_name
    FROM releases r JOIN members m ON m.id = r.member_id
    ORDER BY r.submitted_at DESC
  `).all();
  res.json({ releases });
});

router.get('/export.csv', (req, res) => {
  const rows = db.prepare(`
    SELECT m.id, m.full_name, u.email, m.phone, m.street, m.city, m.state, m.zip,
           m.residency, m.status, m.challenge_play, m.date_of_birth, m.created_at
    FROM members m JOIN users u ON u.id = m.user_id
    ORDER BY m.full_name
  `).all();
  const header = ['id','full_name','email','phone','street','city','state','zip','residency','status','challenge_play','date_of_birth','created_at'];
  const escape = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [header.join(',')].concat(rows.map(r => header.map(k => escape(r[k])).join(',')));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="apa-members.csv"');
  res.send(lines.join('\n'));
});

router.post('/broadcast', async (req, res) => {
  const { subject, body } = req.body || {};
  if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });
  const recipients = db.prepare('SELECT email FROM users WHERE role = ?').all('member').map(r => r.email);
  for (const to of recipients) {
    await sendMail({ to, subject, text: body });
  }
  res.json({ ok: true, sent: recipients.length });
});

router.get('/event-registrations', (req, res) => {
  const regs = db.prepare(`
    SELECT er.id, er.registered_at, e.name AS event_name, e.event_date,
           COALESCE(m.full_name, er.guest_name) AS attendee_name,
           p.status AS payment_status, p.method AS payment_method, p.amount_cents
    FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    LEFT JOIN members m ON m.id = er.member_id
    LEFT JOIN payments p ON p.id = er.payment_id
    ORDER BY er.registered_at DESC
  `).all();
  res.json({ registrations: regs });
});

router.post('/settings', (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Setting key required.' });
  setSetting(key, value);
  res.json({ ok: true });
});

module.exports = router;
