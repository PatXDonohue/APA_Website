# Abington Pickleball Association (APA) Website

A simple, accessible website for the Abington Pickleball Association — a community
organization for players aged 50+. Built with vanilla HTML/CSS/JS on the frontend
and Node.js + Express + SQLite on the backend.

## Features

- Public pages: Home, About / Policies (with PDF download), Events
- Member registration with electronic Release form and digital signature
- Age 50+ validation, configurable non-resident member cap
- Returning member login, dashboard, and renewal (pre-populated from prior year)
- Member-only guest registration: a logged-in member registers a 50+ guest (full Release + signature, $10 fee), recorded in the database
- Payments: credit/debit via Elavon (mock by default), or cash/check (admin-confirmed)
- Confirmation email with lockbox / porta-potty codes after payment
- Admin dashboard: confirm payments, CSV export, broadcast emails, view releases,
  Challenge Play flag, non-resident count vs. limit, event registrations

## Tech Stack

- **Frontend:** HTML5, CSS3, vanilla JavaScript, [signature_pad](https://github.com/szimek/signature_pad) (CDN)
- **Backend:** Node.js, Express
- **DB:** SQLite via `better-sqlite3`
- **Email:** Nodemailer (Gmail SMTP)
- **PDF:** pdfkit
- **Auth:** bcrypt + express-session

## Setup

```bash
# 1. Install dependencies (requires Node 22.x — pinned in package.json "engines")
npm install

# 2. Copy env template (optional — defaults work for dev)
cp .env.example .env
# edit values, especially GMAIL_USER / GMAIL_APP_PASSWORD if you want real email

# 3. Start the server
npm start
```

Open http://localhost:3000

The database (`database/apa.db`) is created and seeded automatically on first run.

## Default accounts (seeded)

| Username  | Password     | Role   |
|-----------|--------------|--------|
| `admin`   | `admin1234`  | admin  |
| `jsmith`  | `member1234` | member |
| `mjones`  | `member1234` | member |
| `rbrown`  | `member1234` | member |
| `lwilson` | `member1234` | member |

**Change the admin password immediately in any real deployment.**

## Email (Nodemailer / Gmail)

Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env` to send real email. Without
these, emails are logged to the console (dev mode).

To get an app password: enable 2FA on the Gmail account, then create an app
password at https://myaccount.google.com/apppasswords and paste it in `.env`.

## Swapping in live Elavon credentials

The payment gateway lives in `lib/elavon.js`. By default `ELAVON_MODE=mock`,
which auto-approves charges for development.

To go live:
1. Set in `.env`:
   ```
   ELAVON_MODE=live
   ELAVON_MERCHANT_ID=...
   ELAVON_USER_ID=...
   ELAVON_PIN=...
   ```
2. Replace the live-mode block in `lib/elavon.js` with a real Elavon Converge
   API call. The function must return `{ ok, approved, reference }`.
3. Restart the server.

The rest of the payment flow (status updates, welcome email trigger) requires
no changes.

## Configuration via the database

Some values live in the `settings` table and can be tweaked via SQL or the
`/api/admin/settings` endpoint:

| Key                  | Default | Notes                                      |
|----------------------|---------|--------------------------------------------|
| `non_resident_limit` | 25      | Max number of non-resident memberships     |
| `annual_dues_cents`  | 5000    | $50.00                                     |
| `guest_fee_cents`    | 1000    | $10.00                                     |
| `card_fee_percent`   | 3       | Used for the displayed processing notice   |

## Project structure

```
APA_Website/
├── server.js              # Express app entry point
├── package.json
├── .env.example
├── database/
│   ├── schema.sql
│   ├── db.js              # DB init + seed
│   └── apa.db             # generated at runtime
├── lib/
│   ├── mailer.js          # Nodemailer wrapper (dev = console log)
│   └── elavon.js          # Elavon adapter (mock by default)
├── routes/
│   ├── auth.js
│   ├── members.js
│   ├── payments.js
│   ├── admin.js
│   └── events.js
├── public/
│   ├── css/styles.css
│   ├── js/app.js
│   └── images/
└── views/
    ├── home.html
    ├── about.html
    ├── register.html
    ├── login.html
    ├── dashboard.html
    ├── guest-registration.html
    ├── payments.html
    ├── events.html
    ├── admin.html
    └── 404.html
```

## Notes

- Lockbox / porta-potty passcodes are read from env vars (`LOCKBOX_CODE`,
  `PORTAPOTTY_CODE`) and only sent in the welcome email *after* payment is
  confirmed.
- Signatures are stored as base64 PNG in the `releases` table (members) and the `guests` table (guests).
- The admin CSV export replaces the previous Excel spreadsheet workflow.
