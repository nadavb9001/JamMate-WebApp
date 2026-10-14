/**
 * NamAppHotfix.js
 *
 * Load BEFORE app.js.
 * Fixes: "NAM error: this._namSetProgress is not a function"
 *
 * Why: app.js handles the TONE3000 OAuth callback before it creates
 * _namSetProgress/_namHandleDone on the app object. This file provides
 * safe fallback methods early, so the callback cannot crash.
 */
(function () {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function setProgress(pct, msg) {
    const safePct = Math.max(0, Math.min(100, Number(pct) || 0));
    const panel = byId('namProgressPanel');
    const bar = byId('namProgressBar');
    const msgEl = byId('namProgressMsg');
    const title = byId('namProgressTitle');

    if (panel) panel.style.display = 'block';
    if (bar) bar.style.width = safePct + '%';
    if (msgEl) msgEl.textContent = msg || '';
    if (title) {
      title.textContent = safePct >= 100 ? '✓ Done' : (safePct === 0 ? '✗ Error' : 'Transferring…');
    }

    const status = byId('statusText') || document.querySelector('.status-text') || document.querySelector('.status');
    if (status && msg) status.textContent = msg;

    if (safePct >= 100 && panel) setTimeout(() => { panel.style.display = 'none'; }, 3000);
  }

  function handleDone(ok, msg, details) {
    const text = ok ? `✓ ${msg || 'Done'}` : `✗ ${msg || 'NAM failed'}`;
    setProgress(ok ? 100 : 0, text);

    const status = byId('statusText') || document.querySelector('.status-text') || document.querySelector('.status');
    if (status) status.textContent = ok ? `NAM: ${msg || 'Done'}` : `NAM error: ${msg || 'Failed'}`;

    if (ok) {
      const name = details?.name || details?.fileName || msg;
      const device = byId('namDeviceName');
      if (device && name && name !== 'logged_in') device.textContent = name;

      try {
        window.dispatchEvent(new CustomEvent('nam-transfer-success', { detail: details || { name } }));
      } catch (_) {}
    } else {
      console.error('[NAM]', msg);
    }
  }

  function refreshAuthUI() {
    const token = sessionStorage.getItem('t3k_access');
    const btn = byId('btnNamLogin');
    if (btn) {
      btn.textContent = token ? '✓ Signed in' : 'Sign in to TONE3000';
      btn.disabled = !!token;
    }
  }

  function updateDevice(name) {
    const el = byId('namDeviceName');
    if (el) el.textContent = name || '—';
  }

  function defineFallback(name, fn) {
    if (Object.prototype[name]) return;
    Object.defineProperty(Object.prototype, name, {
      configurable: true,
      writable: true,
      enumerable: false,
      value: fn,
    });
  }

  defineFallback('_namSetProgress', setProgress);
  defineFallback('_namHandleDone', handleDone);
  defineFallback('_namRefreshAuthUI', refreshAuthUI);
  defineFallback('_namUpdateDevice', updateDevice);

  window.JamMateNamHotfixLoaded = true;
})();
