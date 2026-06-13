// Non-Resident membership cap logic.
//
// The number of Non-Resident members is capped. The cap and an optional manual
// override live in the `settings` table (so they persist across restarts):
//   non_resident_limit     -- integer, max Non-Resident members allowed
//   non_resident_override  -- 'auto' | 'on' | 'off'
//       auto -> enforce the cap (block once count >= limit)
//       on   -> force Non-Resident registration OPEN regardless of count
//       off  -> force Non-Resident registration CLOSED regardless of count
//
// The count is ALWAYS read live from the members table (never a stored counter),
// so it stays accurate even if member records are added, removed, or edited
// directly in the database.

const { db, getSetting } = require('../database/db');

const DEFAULTS = { limit: 25, override: 'auto' };

// Friendly message shown both on the registration page and on a rejected submit.
const FULL_MESSAGE =
  "We're sorry, Non-Resident membership is currently full. Please check back during the next renewal period.";

// Live count of active Non-Resident members, straight from the members table.
function getNonResidentCount() {
  return db
    .prepare("SELECT COUNT(*) AS c FROM members WHERE residency = 'Non-Resident'")
    .get().c;
}

// Full cap status. `open` is the single source of truth for whether a
// Non-Resident may currently register.
function getNonResidentStatus() {
  const parsedLimit = parseInt(getSetting('non_resident_limit', String(DEFAULTS.limit)), 10);
  const limit = Number.isInteger(parsedLimit) && parsedLimit >= 0 ? parsedLimit : DEFAULTS.limit;

  const rawOverride = getSetting('non_resident_override', DEFAULTS.override);
  const override = ['auto', 'on', 'off'].includes(rawOverride) ? rawOverride : 'auto';

  const count = getNonResidentCount();
  const remaining = Math.max(0, limit - count);

  let open;
  if (override === 'on') open = true;
  else if (override === 'off') open = false;
  else open = count < limit;

  return { count, limit, remaining, override, open };
}

module.exports = { getNonResidentStatus, getNonResidentCount, FULL_MESSAGE, DEFAULTS };
