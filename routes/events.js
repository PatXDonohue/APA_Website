const express = require('express');
const { db } = require('../database/db');

const router = express.Router();

router.get('/', (req, res) => {
  const events = db
    .prepare('SELECT id, name, event_date, cost_cents, description FROM events ORDER BY event_date ASC')
    .all();
  res.json({ events });
});

router.post('/:id/register', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  let memberId = null;
  let guestName = null, guestEmail = null;
  if (req.session.user) {
    const m = db.prepare('SELECT id FROM members WHERE user_id = ?').get(req.session.user.id);
    memberId = m ? m.id : null;
  } else {
    guestName = (req.body && req.body.guest_name) || null;
    guestEmail = (req.body && req.body.guest_email) || null;
    if (!guestName || !guestEmail) {
      return res.status(400).json({ error: 'Please provide your name and email to register.' });
    }
  }
  const id = db
    .prepare(`INSERT INTO event_registrations (event_id, member_id, guest_name, guest_email)
              VALUES (?, ?, ?, ?)`)
    .run(event.id, memberId, guestName, guestEmail).lastInsertRowid;
  res.json({ ok: true, registration_id: id, event });
});

module.exports = router;
