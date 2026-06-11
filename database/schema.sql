-- Abington Pickleball Association schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL, -- intentionally NOT unique: members (e.g. a couple) may share an email; login is by username
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'member' | 'admin'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  residency TEXT NOT NULL CHECK (residency IN ('Resident','Non-Resident')),
  phone TEXT NOT NULL,
  emergency_contact_name TEXT NOT NULL,
  emergency_contact_phone TEXT NOT NULL,
  challenge_play INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Paid' | 'Pending' | 'Expired'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  residency TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  emergency_contact_name TEXT NOT NULL,
  emergency_contact_phone TEXT NOT NULL,
  signature_data TEXT NOT NULL, -- base64 PNG from signature_pad
  signed_date TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_id, year)
);

-- Guests are registered by a logged-in member; one row per guest registration (snapshot, like releases)
CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sponsoring_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  sponsoring_member_name TEXT NOT NULL, -- snapshot of the member's name at registration time
  full_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  emergency_contact_name TEXT NOT NULL,
  emergency_contact_relationship TEXT NOT NULL,
  emergency_contact_address TEXT NOT NULL,
  emergency_contact_phone TEXT NOT NULL,
  signature_data TEXT NOT NULL, -- base64 PNG data URI; the waiver acceptance proof
  signed_date TEXT NOT NULL,
  waiver_accepted INTEGER NOT NULL DEFAULT 0, -- set to 1 once the release is signed
  created_at TEXT NOT NULL DEFAULT (datetime('now')) -- registration date
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL, -- links a guest-fee payment to its guest record
  guest_name TEXT, -- for guest payments without a member account
  amount_cents INTEGER NOT NULL,
  purpose TEXT NOT NULL, -- 'membership' | 'guest' | 'tournament' | 'social'
  method TEXT NOT NULL, -- 'card' | 'cash' | 'check'
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending' | 'Paid' | 'Failed'
  reference TEXT, -- card txn id or check number
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  guest_name TEXT,
  guest_email TEXT,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  posted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
