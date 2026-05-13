const express = require('express');
const bcrypt = require('bcrypt');
const { db } = require('../database/db');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Please enter your username and password.' });
  }
  const user = db
    .prepare('SELECT id, username, email, password_hash, role FROM users WHERE username = ?')
    .get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Username or password is incorrect.' });
  }
  req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
  res.json({ user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
