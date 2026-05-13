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

async function updateNavForSession() {
  const { data } = await apiFetch('/api/session');
  const loginLink = document.getElementById('nav-login');
  const dashLink = document.getElementById('nav-dashboard');
  const adminLink = document.getElementById('nav-admin');
  const logoutBtn = document.getElementById('nav-logout');
  if (!data) return;
  if (data.user) {
    if (loginLink) loginLink.style.display = 'none';
    if (dashLink)  dashLink.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (adminLink && data.user.role === 'admin') adminLink.style.display = 'block';
  } else {
    if (dashLink) dashLink.style.display = 'none';
    if (adminLink) adminLink.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNavForSession();
  const logoutBtn = document.getElementById('nav-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await apiFetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    });
  }
});

window.APA = { apiFetch, showErrors, escapeHtml, formatMoney };
