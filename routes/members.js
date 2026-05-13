const express = require('express');
const bcrypt = require('bcrypt');
const { db, getSetting } = require('../database/db');
const { sendWelcomeEmail } = require('../lib/mailer');

const router = express.Router();

function ageFromDob(dob) {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return -1;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

const REQUIRED_FIELDS = [
  'username', 'password', 'full_name', 'date_of_birth',
  'street', 'city', 'state', 'zip', 'residency',
  'phone', 'email', 'emergency_contact_name', 'emergency_contact_phone',
  'signature_data', 'signed_date',
];

function validateRelease(body, { requireCredentials }) {
  const errors = [];
  const fields = requireCredentials
    ? REQUIRED_FIELDS
    : REQUIRED_FIELDS.filter(f => f !== 'username' && f !== 'password');
  for (const f of fields) {
    if (!body[f] || String(body[f]).trim() === '') {
      errors.push(`Please fill in ${f.replace(/_/g, ' ')}.`);
    }
  }
  if (body.residency && !['Resident', 'Non-Resident'].includes(body.residency)) {
    errors.push('Residency must be Resident or Non-Resident.');
  }
  if (body.date_of_birth) {
    const age = ageFromDob(body.date_of_birth);
    if (age < 0) errors.push('Date of birth is not a valid date.');
    else if (age < 50) errors.push('Applicants must be at least 50 years old.');
  }
  if (body.signature_data && !String(body.signature_data).startsWith('data:image/')) {
    errors.push('Digital signature is missing or invalid.');
  }
  return errors;
}

router.post('/register', (req, res) => {
  const b = req.body || {};
  const errors = validateRelease(b, { requireCredentials: true });
  if (errors.length) return res.status(400).json({ errors });

  // Enforce non-resident cap
  if (b.residency === 'Non-Resident') {
    const limit = parseInt(getSetting('non_resident_limit', '25'), 10);
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM members WHERE residency = 'Non-Resident'")
      .get().c;
    if (count >= limit) {
      return res.status(400).json({
        errors: [`Non-resident membership is full (${count}/${limit}). Please contact us to be added to the waitlist.`],
      });
    }
  }

  const existing = db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(b.username, b.email);
  if (existing) {
    return res.status(400).json({ errors: ['That username or email is already registered.'] });
  }

  const hash = bcrypt.hashSync(b.password, 10);
  const year = new Date().getFullYear();

  const result = db.transaction(() => {
    const uid = db
      .prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(b.username, b.email, hash, 'member').lastInsertRowid;
    const mid = db
      .prepare(`INSERT INTO members
        (user_id, full_name, date_of_birth, street, city, state, zip, residency,
         phone, emergency_contact_name, emergency_contact_phone, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`)
      .run(
        uid, b.full_name, b.date_of_birth, b.street, b.city, b.state, b.zip, b.residency,
        b.phone, b.emergency_contact_name, b.emergency_contact_phone
      ).lastInsertRowid;
    db.prepare(`INSERT INTO releases
        (member_id, year, full_name, date_of_birth, street, city, state, zip, residency,
         phone, email, emergency_contact_name, emergency_contact_phone, signature_data, signed_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        mid, year, b.full_name, b.date_of_birth, b.street, b.city, b.state, b.zip, b.residency,
        b.phone, b.email, b.emergency_contact_name, b.emergency_contact_phone,
        b.signature_data, b.signed_date
      );
    return { uid, mid };
  })();

  req.session.user = { id: result.uid, username: b.username, email: b.email, role: 'member' };
  res.json({
    ok: true,
    member_id: result.mid,
    message: 'Registration received. Please complete payment to activate your membership.',
  });
});

// Renewal - prepopulate from latest release
router.get('/renewal-data', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in.' });
  const member = db
    .prepare('SELECT * FROM members WHERE user_id = ?')
    .get(req.session.user.id);
  if (!member) return res.status(404).json({ error: 'Member record not found.' });
  const latest = db
    .prepare('SELECT * FROM releases WHERE member_id = ? ORDER BY year DESC LIMIT 1')
    .get(member.id);
  res.json({ member, latest_release: latest });
});

router.post('/renew', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in.' });
  const b = req.body || {};
  const errors = validateRelease(b, { requireCredentials: false });
  if (errors.length) return res.status(400).json({ errors });

  const member = db
    .prepare('SELECT * FROM members WHERE user_id = ?')
    .get(req.session.user.id);
  if (!member) return res.status(404).json({ error: 'Member record not found.' });

  const year = new Date().getFullYear();
  const existing = db
    .prepare('SELECT id FROM releases WHERE member_id = ? AND year = ?')
    .get(member.id, year);
  if (existing) {
    return res.status(400).json({ errors: ['You have already submitted this year\'s release.'] });
  }

  db.transaction(() => {
    db.prepare(`UPDATE members SET
        full_name=?, date_of_birth=?, street=?, city=?, state=?, zip=?, residency=?,
        phone=?, emergency_contact_name=?, emergency_contact_phone=?, status='Pending'
      WHERE id=?`)
      .run(
        b.full_name, b.date_of_birth, b.street, b.city, b.state, b.zip, b.residency,
        b.phone, b.emergency_contact_name, b.emergency_contact_phone, member.id
      );
    db.prepare(`INSERT INTO releases
        (member_id, year, full_name, date_of_birth, street, city, state, zip, residency,
         phone, email, emergency_contact_name, emergency_contact_phone, signature_data, signed_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        member.id, year, b.full_name, b.date_of_birth, b.street, b.city, b.state, b.zip, b.residency,
        b.phone, b.email, b.emergency_contact_name, b.emergency_contact_phone,
        b.signature_data, b.signed_date
      );
  })();

  res.json({ ok: true, message: 'Renewal received. Please complete payment to activate.' });
});

// Guest registration - simplified
router.post('/guest', (req, res) => {
  const b = req.body || {};
  const required = ['full_name', 'date_of_birth', 'phone', 'email',
                    'emergency_contact_name', 'emergency_contact_phone',
                    'signature_data', 'signed_date'];
  const errors = [];
  for (const f of required) {
    if (!b[f] || String(b[f]).trim() === '') {
      errors.push(`Please fill in ${f.replace(/_/g, ' ')}.`);
    }
  }
  const age = ageFromDob(b.date_of_birth);
  if (age < 0) errors.push('Date of birth is not a valid date.');
  else if (age < 50) errors.push('Guests must be at least 50 years old.');
  if (errors.length) return res.status(400).json({ errors });

  // Guests are recorded as a payment row with guest_name; no user account
  const guestFee = parseInt(getSetting('guest_fee_cents', '1000'), 10);
  const payId = db
    .prepare(`INSERT INTO payments (guest_name, amount_cents, purpose, method, status)
              VALUES (?, ?, 'guest', 'cash', 'Pending')`)
    .run(b.full_name, guestFee).lastInsertRowid;

  res.json({ ok: true, payment_id: payId, message: 'Guest registration received. Please complete payment.' });
});

// Self-service: my profile
router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in.' });
  const member = db
    .prepare('SELECT * FROM members WHERE user_id = ?')
    .get(req.session.user.id);
  res.json({ user: req.session.user, member });
});

module.exports = router;
