// Membership renewal window logic.
//
// The renewal form on the My Account page is only available during a configurable
// window. The window is stored in the `settings` table (so it survives restarts):
//   renewal_start_md  -- "MM-DD" e.g. "11-01"
//   renewal_end_md    -- "MM-DD" e.g. "01-31"
//   renewal_override  -- "auto" | "on" | "off"
//
// Windows are month/day based (no year) so they recur every year, and they may
// span the calendar year end (e.g. Nov 1 -> Jan 31). The override lets an admin
// force the form open (extensions) or closed (early close) regardless of dates.

const { getSetting } = require('../database/db');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Sensible defaults if the settings have never been saved.
const DEFAULTS = { start: '11-01', end: '01-31', override: 'auto' };

// Parse "MM-DD" into { month, day } (1-based month). Returns null when invalid.
function parseMd(value) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(value == null ? '' : value).trim());
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

// A comparable number for a month/day pair (month-major), so Mar 5 -> 305.
function mdNumber(md) {
  return md.month * 100 + md.day;
}

function labelMd(md) {
  return `${MONTHS[md.month - 1]} ${md.day}`;
}

// ISO date for the next time `md` occurs on/after `today`, with the year resolved.
function nextOccurrenceIso(md, today) {
  const todayNum = (today.getMonth() + 1) * 100 + today.getDate();
  const year = todayNum <= mdNumber(md) ? today.getFullYear() : today.getFullYear() + 1;
  const mm = String(md.month).padStart(2, '0');
  const dd = String(md.day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// A friendly "November 1, 2026" label for the next opening date.
function nextOccurrenceLabel(md, today) {
  const iso = nextOccurrenceIso(md, today);
  const year = iso.slice(0, 4);
  return `${labelMd(md)}, ${year}`;
}

// Raw stored config (with defaults filled in).
function getRenewalConfig() {
  return {
    start: getSetting('renewal_start_md', DEFAULTS.start),
    end: getSetting('renewal_end_md', DEFAULTS.end),
    override: getSetting('renewal_override', DEFAULTS.override),
  };
}

// Full status for a given day (defaults to now). `open` is the single source of
// truth for whether the renewal form should be shown / accepted.
function getRenewalStatus(today = new Date()) {
  const cfg = getRenewalConfig();
  const start = parseMd(cfg.start) || parseMd(DEFAULTS.start);
  const end = parseMd(cfg.end) || parseMd(DEFAULTS.end);
  const override = ['on', 'off', 'auto'].includes(cfg.override) ? cfg.override : 'auto';

  const todayNum = (today.getMonth() + 1) * 100 + today.getDate();
  const s = mdNumber(start);
  const e = mdNumber(end);
  // Same-year window vs. one that wraps past Dec 31.
  const withinDates = s <= e
    ? todayNum >= s && todayNum <= e
    : todayNum >= s || todayNum <= e;

  let open;
  if (override === 'on') open = true;
  else if (override === 'off') open = false;
  else open = withinDates;

  return {
    open,
    override,
    within_dates: withinDates,
    start: cfg.start,
    end: cfg.end,
    start_label: labelMd(start),
    end_label: labelMd(end),
    next_open_label: nextOccurrenceLabel(start, today),
    next_open_date: nextOccurrenceIso(start, today),
  };
}

module.exports = { getRenewalStatus, getRenewalConfig, parseMd, DEFAULTS };
