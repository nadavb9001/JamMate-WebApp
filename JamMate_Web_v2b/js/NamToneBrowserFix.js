/**
 * NamToneBrowserFix.js — forces JamMate to browse/send TONE3000 tones inside JamMate.
 *
 * Why this exists:
 * TONE3000's external Select UI can show normal website download controls such as
 * "Download all models". Those controls download to the browser and do not transfer
 * a NAM to JamMate/ESP. This patch makes the JamMate "Browse tones" button use the
 * authenticated API search grid already built into app.js, where every result has
 * JamMate's own "Send to Device" button.
 *
 * Install after app.js and after NamSuccess.js:
 * <script type="module" src="./js/NamSuccess.js"></script>
 * <script type="module" src="./js/NamToneBrowserFix.js"></script>
 */
import { app } from './app.js';
import { NamLoader } from './NamLoader.js';

const FIX_ID = 'nam-tone-browser-fix-style';

function injectStyle() {
  if (document.getElementById(FIX_ID)) return;
  const style = document.createElement('style');
  style.id = FIX_ID;
  style.textContent = `
    .nam-inline-hint {
      margin: 10px 0;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(120,160,255,.35);
      background: rgba(80,120,255,.12);
      color: var(--color-text-primary, #fff);
      font-size: 13px;
      line-height: 1.35;
    }
    .nam-inline-hint strong { font-weight: 800; }
    .nam-inline-hint small {
      display: block;
      margin-top: 4px;
      color: var(--color-text-secondary, #aaa);
    }
  `;
  document.head.appendChild(style);
}

function status(msg) {
  try {
    if (app?.View?.updateStatus) app.View.updateStatus(msg);
  } catch { /* ignore */ }
  const statusEl = document.getElementById('statusText') || document.querySelector('.status-text');
  if (statusEl) statusEl.textContent = msg;
}

function ensureHint() {
  injectStyle();
  let hint = document.getElementById('namInlineBrowserHint');
  if (hint) return hint;

  hint = document.createElement('div');
  hint.id = 'namInlineBrowserHint';
  hint.className = 'nam-inline-hint';
  hint.innerHTML = `
    <strong>TONE3000 browse mode is inside JamMate now.</strong>
    <small>Do not use TONE3000's website “Download all models” button. Use JamMate's “Send to Device” button on a model card.</small>
  `;

  const grid = document.getElementById('namGrid');
  if (grid?.parentNode) {
    grid.parentNode.insertBefore(hint, grid);
    return hint;
  }

  const namTab = document.getElementById('nam-tab');
  if (namTab) namTab.prepend(hint);
  return hint;
}

async function showJamMateToneGrid() {
  ensureHint();

  if (!NamLoader.isAuthed()) {
    status('Sign in to TONE3000 first. After login, press Browse tones again.');
    await NamLoader.startLogin();
    return;
  }

  status('Loading TONE3000 NAM models inside JamMate…');

  if (typeof app._namRefreshAuthUI === 'function') app._namRefreshAuthUI();

  if (typeof app._namDoSearch === 'function') {
    await app._namDoSearch(1);
    status('Choose a NAM model, then press JamMate “Send to Device”.');
    return;
  }

  const grid = document.getElementById('namGrid');
  if (grid) {
    grid.innerHTML = '<div class="empty-state">Reload the page, then open the NAM tab again.</div>';
  }
  status('NAM search UI was not ready. Reload the page and try again.');
}

function patchBrowseButton() {
  const btn = document.getElementById('btnNamBrowseT3K');
  if (!btn || btn.dataset.jammateInlinePatched === '1') return;

  btn.dataset.jammateInlinePatched = '1';
  btn.textContent = 'Browse TONE3000 NAMs';
  btn.title = 'Show TONE3000 NAM models inside JamMate, then use Send to Device.';

  // Capture phase + stopImmediatePropagation prevents the older handler from
  // redirecting to the external TONE3000 Select website.
  btn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showJamMateToneGrid();
  }, true);
}

function patchSearchButton() {
  const btn = document.getElementById('btnNamSearch');
  if (!btn || btn.dataset.jammateInlinePatched === '1') return;
  btn.dataset.jammateInlinePatched = '1';

  btn.addEventListener('click', event => {
    if (!NamLoader.isAuthed()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showJamMateToneGrid();
    }
  }, true);
}

function boot() {
  injectStyle();
  ensureHint();
  patchBrowseButton();
  patchSearchButton();

  // DOM may be rebuilt by tab initialization, so re-apply lightly.
  setTimeout(() => { patchBrowseButton(); patchSearchButton(); ensureHint(); }, 250);
  setTimeout(() => { patchBrowseButton(); patchSearchButton(); ensureHint(); }, 1000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
