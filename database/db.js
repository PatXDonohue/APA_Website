const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'apa.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
}

function seedIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return;

  const insertUser = db.prepare(
    'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
  );
  const insertMember = db.prepare(`
    INSERT INTO members
      (user_id, full_name, date_of_birth, street, city, state, zip, residency,
       phone, emergency_contact_name, emergency_contact_phone, challenge_play, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRelease = db.prepare(`
    INSERT INTO releases
      (member_id, year, full_name, date_of_birth, street, city, state, zip, residency,
       phone, email, emergency_contact_name, emergency_contact_phone, signature_data, signed_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(
    'INSERT INTO events (name, event_date, cost_cents, description) VALUES (?, ?, ?, ?)'
  );
  const insertSetting = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  );
  const insertAnnouncement = db.prepare(
    'INSERT INTO announcements (title, body) VALUES (?, ?)'
  );

  const adminHash = bcrypt.hashSync('admin1234', 10);
  const memberHash = bcrypt.hashSync('member1234', 10);

  const adminId = insertUser.run('admin', 'admin@abingtonpickleball.org', adminHash, 'admin').lastInsertRowid;

  const sampleMembers = [
    { u: 'jsmith',  e: 'jsmith@example.com',  n: 'John Smith',     dob: '1965-04-12', city: 'Abington', res: 'Resident',     status: 'Paid',    challenge: 1 },
    { u: 'mjones',  e: 'mjones@example.com',  n: 'Mary Jones',     dob: '1970-09-23', city: 'Abington', res: 'Resident',     status: 'Paid',    challenge: 0 },
    { u: 'rbrown',  e: 'rbrown@example.com',  n: 'Robert Brown',   dob: '1958-01-30', city: 'Whitman',  res: 'Non-Resident', status: 'Paid',    challenge: 1 },
    { u: 'lwilson', e: 'lwilson@example.com', n: 'Linda Wilson',   dob: '1972-07-08', city: 'Abington', res: 'Resident',     status: 'Pending', challenge: 0 },
  ];

  const currentYear = new Date().getFullYear();
  for (const m of sampleMembers) {
    const uid = insertUser.run(m.u, m.e, memberHash, 'member').lastInsertRowid;
    const memberId = insertMember.run(
      uid, m.n, m.dob, '123 Court Way', m.city, 'MA', '02351',
      m.res, '781-555-0100', 'Emergency Contact', '781-555-0199', m.challenge, m.status
    ).lastInsertRowid;
    insertRelease.run(
      memberId, currentYear, m.n, m.dob, '123 Court Way', m.city, 'MA', '02351',
      m.res, '781-555-0100', m.e, 'Emergency Contact', '781-555-0199',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
      new Date().toISOString().slice(0, 10)
    );
  }

  insertEvent.run(
    'Summer Round Robin Tournament',
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    2500,
    'Doubles round robin. Snacks and water provided. All skill levels welcome.'
  );
  insertEvent.run(
    'End of Season Cookout',
    new Date(Date.now() + 75 * 86400000).toISOString().slice(0, 10),
    1500,
    'Social cookout to wrap up the season. Bring a side or dessert to share.'
  );

  insertSetting.run('non_resident_limit', '25');
  insertSetting.run('annual_dues_cents', '5000');
  insertSetting.run('guest_fee_cents', '1000');
  insertSetting.run('card_fee_percent', '3');

  insertAnnouncement.run(
    'Welcome to the new APA website!',
    'You can now register, renew, and pay your dues online. Reach out via our Gmail with any questions.'
  );
  insertAnnouncement.run(
    'Court maintenance scheduled',
    'Courts will be resurfaced the first week of June. Watch for posted updates.'
  );
}

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

init();
seedIfEmpty();

module.exports = { db, getSetting, setSetting };

if (require.main === module && process.argv.includes('--init')) {
  console.log('Database initialized at', DB_PATH);
}
