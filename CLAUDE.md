# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies (Node 22.x — pinned in package.json "engines")
npm start            # run server on http://localhost:3000
npm run init-db      # explicitly run database init (also runs automatically on first server start)
```

No test, lint, or build steps are configured.

The SQLite database (`database/apa.db`) is created and seeded automatically the first time `database/db.js` is required (which happens on every server start). To reset the database, delete `database/apa.db*` and restart.

## Architecture

**Express monolith, no template engine, no frontend framework.** Frontend is static HTML files served via `res.sendFile`; client-side JS uses `fetch` against the `/api/*` routes. The shared header/nav block is duplicated verbatim across each `views/*.html` file — when you add a nav item, update every page.

**Database bootstrap as side effect.** `database/db.js` runs `init()` (apply `schema.sql`) and `seedIfEmpty()` at module load. Importing it anywhere in the app guarantees the DB exists. `server.js` requires it at the top precisely for this reason, then `require('./database/db')` is re-imported in route modules to access the `db` handle.

**Auth is session-based with role gates.** `express-session` stores `{ id, username, email, role }` in `req.session.user`. Admin endpoints check `role === 'admin'` in middleware (see top of `routes/admin.js`). Page routes in `server.js` do the same redirect-on-miss check before serving the HTML.

**Two parallel registration flows:**
- **Full member** (`POST /api/members/register`) creates a user, member, and current-year release row in one transaction. Logs the user in.
- **Guest** (`POST /api/members/guest`) is **member-only**: a logged-in member registers a guest via `views/guest-registration.html` (served at `/guest-registration`, which redirects to `/login?next=…&msg=…` when unauthenticated; the legacy `/guest` path redirects here for any old bookmarks). The "Guest" nav link is hidden for logged-out visitors (toggled in `app.js` via `#nav-guest`) and surfaced on the dashboard. The **sponsoring member is taken from the session, never the client** (the read-only Member Name field is display-only). On the multi-step page (form → summary → payment → confirmation), submitting the form persists a `guests` row + a `Pending`, `purpose='guest'` `payments` row in one transaction (`guest_id` set; `member_id` left NULL so admin confirm — which only acts on `purpose='membership'` — never flips the sponsoring member's status). The card payment step is still an Elavon `TODO` that simulates approval; the write-back to flip the payment to `Paid` is marked in both the page and the route. The new `guests` table is a `releases`-style snapshot (full guest + emergency contact + signature); see `schema.sql`.

**Payment status drives membership status.** Cards go through `lib/elavon.js` (`MODE=mock` auto-approves; live mode is a stub to fill in). On approval the member's `status` flips to `'Paid'` and `sendWelcomeEmail` fires. Cash/check creates a `Pending` payment row; an admin confirms it via `POST /api/admin/payments/:id/confirm`, which performs the same status flip + welcome email. **The welcome email is the only place lockbox/porta-potty codes are revealed** (from `LOCKBOX_CODE` / `PORTAPOTTY_CODE` env vars in `lib/mailer.js`) — so any new payment confirmation path must also call `sendWelcomeEmail`.

**Mailer falls back to console logging when Gmail creds are absent.** `lib/mailer.js` returns `{ mocked: true }` and logs to stdout if `GMAIL_USER`/`GMAIL_APP_PASSWORD` are not set, so the app stays runnable in dev with no SMTP config.

**Renewal prefill is server-driven.** `GET /api/members/renewal-data` returns `{ member, latest_release }`; the dashboard renewal form populates fields from `latest_release` first, falling back to the `members` row. The `releases` table has `UNIQUE (member_id, year)`, so each year's renewal is one new row, never an update.

**Configurable values live in the `settings` table**, not in code. Read with `getSetting(key, fallback)`, write with `setSetting` or `POST /api/admin/settings`. Notably: `non_resident_limit` (enforced in `/api/members/register` before insert), `annual_dues_cents`, `guest_fee_cents`, `card_fee_percent`.

**Policies PDF is generated on demand** via pdfkit at `GET /about/policies.pdf` (inline in `server.js`) — there is no static PDF file.

## Conventions

- Money is stored in **cents** (integer) everywhere; format with `APA.formatMoney(cents)` on the client.
- Digital signatures are base64-encoded PNGs (data URI) in `releases.signature_data`.
- Age is computed both client-side (in form JS) and server-side (`ageFromDob` in `routes/members.js`) — server-side is authoritative.
- API error responses use either `{ error: string }` for single errors or `{ errors: string[] }` for validation lists. Client helper `APA.showErrors` handles both.
- The audience is 50+: keep body text ≥ 18px, click targets ≥ 48×48px, and write error messages in plain English (the CSS already enforces the first two).

## Things to know before changing

- **Default admin password (`admin1234`) is in the seed data and README** — never deploy without changing it.
- The `database/apa.db` file is gitignored along with its `-wal` / `-shm` companions; do not commit them.
- `views/*.html` files have no shared layout — changes to nav, footer, or `<head>` must be applied to every page. The nav is **not byte-identical** across pages, so a blind find/replace will miss or double up: `404.html` has no nav at all, `admin.html`/`dashboard.html` omit the `Join` link, and the `active` class moves per page. Some pages also link to `/register` from the body, not just the nav.
- The CSV export at `/api/admin/export.csv` is the replacement for the legacy Excel-in-Dropbox workflow described in `Docs/APA_Registration_and_Payment_System.docx`; keep the column set stable so board members can reuse spreadsheet templates.
