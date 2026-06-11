const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);

const { db } = require('./database/db'); // initializes + seeds

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const eventRoutes = require('./routes/events');

const PORT = process.env.PORT || 3000;

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new SqliteStore({
      client: db,
      // prune expired rows hourly so the sessions table doesn't grow unbounded
      expired: { clear: true, intervalMs: 1000 * 60 * 60 },
    }),
    secret: process.env.SESSION_SECRET || 'apa-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
  })
);

// Inject session user for templates / API status checks
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

function sendView(viewName) {
  return (req, res) => {
    const file = path.join(__dirname, 'views', viewName);
    if (!fs.existsSync(file)) return res.status(404).send('Not found');
    res.sendFile(file);
  };
}

// Public pages
app.get('/', sendView('home.html'));
app.get('/about', sendView('about.html'));

// Policies PDF (generated on demand)
app.get('/about/policies.pdf', (req, res) => {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'LETTER', margin: 60 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="APA-Policies.pdf"');
  doc.pipe(res);
  doc.fontSize(22).text('Abington Pickleball Association', { align: 'center' });
  doc.fontSize(16).text('Policies and Procedures', { align: 'center' });
  doc.moveDown();
  const sections = [
    ['Membership', 'Members must be 50 years of age or older. Annual membership runs January 1 through December 31. Non-resident membership is capped; once full, applicants are added to a waitlist.'],
    ['Court Use', 'Courts are open to members during posted hours. Observe court etiquette and rotation; yield to organized play when scheduled.'],
    ['Guests', 'Guests must be 50+, sign the release waiver, and pay the guest fee before playing. Members are limited in how often they may bring the same guest in a season.'],
    ['Conduct', 'Courteous, respectful behavior is expected at all times. Violations may be reviewed by the board.'],
    ['Challenge Play', 'Members meeting the skill criteria may participate in Challenge Play. Contact a board member to be evaluated.'],
  ];
  for (const [h, p] of sections) {
    doc.moveDown().fontSize(14).text(h, { underline: true });
    doc.fontSize(12).text(p);
  }
  doc.end();
});
app.get('/register', sendView('register.html'));
app.get('/login', sendView('login.html'));
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});
// Guest registration is member-only: a logged-in member registers a guest.
app.get('/guest-registration', (req, res) => {
  if (!req.session.user) {
    const msg = encodeURIComponent('Please log in to register a guest.');
    return res.redirect(`/login?next=/guest-registration&msg=${msg}`);
  }
  res.sendFile(path.join(__dirname, 'views', 'guest-registration.html'));
});
// Old simplified guest form is superseded by /guest-registration; keep the path working.
app.get('/guest', (req, res) => res.redirect('/guest-registration'));
app.get('/payments', sendView('payments.html'));
app.get('/events', sendView('events.html'));
app.get('/admin', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login?next=/admin');
  }
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// API
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventRoutes);

// Lightweight session status endpoint for client JS
app.get('/api/session', (req, res) => {
  res.json({ user: req.session.user || null });
});

// Announcements (read-only) for the homepage
app.get('/api/announcements', (req, res) => {
  const rows = db.prepare('SELECT id, title, body, posted_at FROM announcements ORDER BY posted_at DESC LIMIT 10').all();
  res.json({ announcements: rows });
});

// 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`APA site listening on http://localhost:${PORT}`);
});
