// Shared client helpers

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'same-origin',
    ...opts,
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { ok: res.ok, status: res.status, data };
}

function showErrors(containerId, errors) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!errors || (Array.isArray(errors) && errors.length === 0)) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const list = Array.isArray(errors) ? errors : [errors];
  el.innerHTML = '<strong>Please fix the following:</strong><ul>' +
    list.map(e => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>';
  el.style.display = 'block';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatMoney(cents) {
  return '$' + (cents / 100).toFixed(2);
}

// ---- Phone number helpers ----
// US phone numbers are stored/submitted as 10 raw digits and displayed as (XXX) XXX-XXXX.

// Strip everything but digits and cap at 10 (the US national number length).
function phoneDigits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '').slice(0, 10);
}

// Progressively format whatever has been typed so far into (XXX) XXX-XXXX.
function formatPhone(value) {
  const d = phoneDigits(value);
  if (d.length === 0) return '';
  if (d.length < 4) return '(' + d;
  if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
  return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
}

// Valid only when exactly 10 digits are present (min 10, max 10).
function isValidPhone(value) {
  return phoneDigits(value).length === 10;
}

// Show / clear an inline error message directly beneath a phone input.
function setPhoneError(input, msg) {
  const err = input.parentNode && input.parentNode.querySelector('.phone-error');
  if (!err) return;
  if (msg) {
    err.textContent = msg;
    err.style.display = 'block';
    input.setAttribute('aria-invalid', 'true');
  } else {
    err.textContent = '';
    err.style.display = 'none';
    input.removeAttribute('aria-invalid');
  }
}

// Wire up one phone field: numeric-only entry, live formatting, and a blur check.
function attachPhone(input) {
  if (!input || input.dataset.phoneBound) return;
  input.dataset.phoneBound = '1';
  input.type = 'tel';
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', input.getAttribute('autocomplete') || 'tel');
  input.setAttribute('maxlength', '14'); // "(XXX) XXX-XXXX" is 14 characters
  if (!input.placeholder) input.placeholder = '(555) 123-4567';

  // Create the inline error holder once, right after the input inside its .field wrapper.
  if (input.parentNode && !input.parentNode.querySelector('.phone-error')) {
    const err = document.createElement('div');
    err.className = 'phone-error';
    err.setAttribute('role', 'alert');
    err.style.display = 'none';
    err.style.color = '#b00020';
    err.style.marginTop = '4px';
    input.insertAdjacentElement('afterend', err);
  }

  // Reformat as the user types while keeping the caret in a sensible spot.
  input.addEventListener('input', () => {
    const caret = input.selectionStart || input.value.length;
    const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, '').length;
    input.value = formatPhone(input.value);
    let pos = 0, seen = 0;
    while (pos < input.value.length && seen < digitsBeforeCaret) {
      if (/\d/.test(input.value[pos])) seen++;
      pos++;
    }
    try { input.setSelectionRange(pos, pos); } catch (_) {}
    if (isValidPhone(input.value)) setPhoneError(input, null);
  });

  // Flag an incomplete (started-but-not-finished) number when the user leaves the field.
  input.addEventListener('blur', () => {
    if (input.value.trim() && !isValidPhone(input.value)) {
      setPhoneError(input, 'Please enter a complete 10-digit phone number, e.g. (555) 123-4567.');
    } else {
      setPhoneError(input, null);
    }
  });

  // Format any value that was pre-filled (e.g. server-supplied) on the way in.
  if (input.value.trim()) input.value = formatPhone(input.value);
}

// Attach phone behavior to every phone field within a root element.
function initPhones(root) {
  (root || document).querySelectorAll('input[type="tel"], input[data-phone]').forEach(attachPhone);
}

// Validate every phone field in a form before submit. Sets inline messages and
// returns a list of plain-English errors for the form-level summary.
function validatePhones(form) {
  const errors = [];
  form.querySelectorAll('input[type="tel"], input[data-phone]').forEach((input) => {
    const labelEl = input.id && form.querySelector('label[for="' + input.id + '"]');
    const label = (labelEl ? labelEl.textContent : input.name || 'phone number').trim().toLowerCase();
    if (!input.value.trim()) {
      // Empty is reported by the form's own required-field check; flag it inline too.
      setPhoneError(input, 'This field is required.');
    } else if (!isValidPhone(input.value)) {
      setPhoneError(input, 'Please enter a complete 10-digit phone number, e.g. (555) 123-4567.');
      errors.push('Please enter a valid ' + label + '.');
    } else {
      setPhoneError(input, null);
    }
  });
  return errors;
}

async function updateNavForSession() {
  const { data } = await apiFetch('/api/session');
  const loginLink = document.getElementById('nav-login');
  const dashLink = document.getElementById('nav-dashboard');
  const adminLink = document.getElementById('nav-admin');
  const logoutBtn = document.getElementById('nav-logout');
  const guestLink = document.getElementById('nav-guest'); // guest registration is member-only
  if (!data) return;
  if (data.user) {
    if (loginLink) loginLink.style.display = 'none';
    if (dashLink)  dashLink.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (guestLink) guestLink.style.display = 'block';
    if (adminLink && data.user.role === 'admin') adminLink.style.display = 'block';
  } else {
    if (dashLink) dashLink.style.display = 'none';
    if (adminLink) adminLink.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (guestLink) guestLink.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNavForSession();
  initPhones(); // wire up any phone fields present on this page
  const logoutBtn = document.getElementById('nav-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await apiFetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    });
  }
});

window.APA = {
  apiFetch, showErrors, escapeHtml, formatMoney,
  phoneDigits, formatPhone, isValidPhone, attachPhone, initPhones, validatePhones, setPhoneError,
};
