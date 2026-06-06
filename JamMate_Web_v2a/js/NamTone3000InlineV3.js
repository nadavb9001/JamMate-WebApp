/**
 * NamTone3000InlineV3.js
 *
 * Drop-in override for the NAM tab.
 * - Does NOT import app.js, so it cannot be broken by old app.js NAM handlers.
 * - Captures Browse/Search clicks before the old handlers.
 * - Uses TONE3000 API search inside JamMate.
 * - Renders its own cards with Send to Device.
 * - Shows visible debug/error messages instead of silently doing nothing.
 *
 * Install after app.js:
 * <script type="module" src="./js/NamSuccess.js"></script>
 * <script type="module" src="./js/NamTone3000InlineV3.js"></script>
 */
import { NamLoader } from './NamLoader.js';

const STYLE_ID = 'nam-inline-v3-style';
const PAGE_SIZE = 20;
let state = {
  page: 1,
  total: 0,
  query: '',
  sort: 'downloads-all-time',
};

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[c]));
}

function $(id) {
  return document.getElementById(id);
}

function injectStyle() {
  if ($(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .nam-v3-panel {
      margin: 10px 0 12px;
      padding: 10px 12px;
      border: 1px solid rgba(120,160,255,.38);
      border-radius: 12px;
      background: rgba(80,120,255,.12);
      color: var(--color-text-primary, #fff);
      font-size: 13px;
      line-height: 1.35;
    }
    .nam-v3-panel strong { font-weight: 800; }
    .nam-v3-panel small {
      display: block;
      margin-top: 4px;
      color: var(--color-text-secondary, #aaa);
    }
    .nam-v3-error {
      border-color: rgba(255,100,100,.55);
      background: rgba(255,70,70,.13);
    }
    .nam-v3-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .nam-v3-card {
      padding: 12px;
      border: 1px solid var(--color-border, rgba(255,255,255,.14));
      border-radius: 12px;
      background: rgba(0,0,0,.16);
      min-width: 0;
    }
    .nam-v3-card-title {
      font-weight: 800;
      margin-bottom: 5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .nam-v3-meta {
      color: var(--color-text-secondary, #aaa);
      font-size: 12px;
      margin-bottom: 10px;
    }
    .nam-v3-send {
      width: 100%;
      min-height: 34px;
      border-radius: 9px;
      cursor: pointer;
    }
    .nam-v3-send[disabled] { opacity: .6; cursor: wait; }
  `;
  document.head.appendChild(style);
}

function updateStatus(msg) {
  const statusEl = $('statusText') || document.querySelector('.status-text') || document.querySelector('.status');
  if (statusEl) statusEl.textContent = msg;
  console.log('[NAM v3]', msg);
}

function ensurePanel() {
  injectStyle();
  let panel = $('namV3Panel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'namV3Panel';
  panel.className = 'nam-v3-panel';
  panel.innerHTML = '<strong>NAM TONE3000 browser ready.</strong><small>Browse/Search runs inside JamMate. Use the JamMate “Send to Device” button, not TONE3000 website download buttons.</small>';

  const grid = $('namGrid');
  if (grid?.parentNode) grid.parentNode.insertBefore(panel, grid);
  else $('nam-tab')?.prepend(panel);
  return panel;
}

function showInfo(html) {
  const panel = ensurePanel();
  panel.className = 'nam-v3-panel';
  panel.innerHTML = html;
}

function showError(message, detail = '') {
  const panel = ensurePanel();
  panel.className = 'nam-v3-panel nam-v3-error';
  panel.innerHTML = `<strong>NAM error:</strong> ${esc(message)}${detail ? `<small>${esc(detail)}</small>` : ''}`;
  updateStatus(`NAM error: ${message}`);
}

function setProgress(pct, msg) {
  const panel = $('namProgressPanel');
  const bar = $('namProgressBar');
  const msgEl = $('namProgressMsg');
  const title = $('namProgressTitle');
  if (panel) panel.style.display = 'block';
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (msgEl) msgEl.textContent = msg;
  if (title) title.textContent = pct >= 100 ? '✓ Done' : (pct === 0 ? '✗ Error' : 'Transferring…');
  updateStatus(msg);
}

function setDeviceName(name) {
  const el = $('namDeviceName');
  if (el) el.textContent = name || '—';
}

function normalizeTones(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.tones)) return data.tones;
  return [];
}

function getToneTitle(tone) {
  return tone.title || tone.name || `Tone #${tone.id}`;
}

function getAuthor(tone) {
  return tone.user?.username || tone.author_username || tone.username || '';
}

function renderEmpty(message) {
  const grid = $('namGrid');
  if (grid) grid.innerHTML = `<div class="empty-state">${esc(message)}</div>`;
}

function renderCards(tones) {
  const grid = $('namGrid');
  if (!grid) {
    showError('Cannot find #namGrid in index.html');
    return;
  }

  if (!tones.length) {
    renderEmpty('No NAM models found. Try another search term or disable Nano only.');
    return;
  }

  grid.classList.add('nam-v3-grid');
  grid.innerHTML = '';

  for (const tone of tones) {
    const id = tone.id;
    const title = getToneTitle(tone);
    const author = getAuthor(tone);
    const sizes = Array.isArray(tone.sizes) ? tone.sizes.join(', ') : 'nano';
    const downloads = tone.downloads_count ?? tone.downloads ?? tone.download_count ?? 0;
    const gear = tone.gear || '';

    const card = document.createElement('div');
    card.className = 'nam-v3-card';
    card.innerHTML = `
      <div class="nam-v3-card-title" title="${esc(title)}">${esc(title)}</div>
      <div class="nam-v3-meta">
        ${author ? `@${esc(author)} · ` : ''}${esc(gear)} · ${esc(sizes)} · ⬇ ${Number(downloads || 0).toLocaleString()}
      </div>
      <button type="button" class="nam-v3-send">Send to Device</button>
    `;

    card.querySelector('.nam-v3-send').addEventListener('click', async () => {
      const btn = card.querySelector('.nam-v3-send');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        await NamLoader.sendTone(
          id,
          title,
          setProgress,
          (ok, msg, details) => {
            if (ok) {
              const name = details?.name || msg || title;
              setDeviceName(name);
              setProgress(100, `✓ ${name} loaded`);
              showInfo(`<strong>Loaded successfully:</strong> ${esc(name)}<small>Size: ${details?.sizeKB ?? '—'} KB · Chunks: ${details?.chunks ?? '—'} · CRC32: ${details?.crc32 ?? '—'}</small>`);
            } else {
              setProgress(0, `✗ ${msg}`);
              showError(msg || 'Transfer failed');
            }
          }
        );
      } catch (err) {
        setProgress(0, `✗ ${err.message}`);
        showError(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send to Device';
      }
    });

    grid.appendChild(card);
  }
}

function syncControls() {
  state.query = $('namSearchInput')?.value?.trim() || '';
  state.sort = $('namSort')?.value || 'downloads-all-time';
}

async function doSearch(page = 1) {
  ensurePanel();
  syncControls();

  if (!NamLoader.isAuthed()) {
    showInfo('<strong>Sign in required.</strong><small>Opening TONE3000 sign-in. After it returns to JamMate, press Browse/Search again.</small>');
    updateStatus('Opening TONE3000 sign-in…');
    await NamLoader.startLogin();
    return;
  }

  state.page = page;

  renderEmpty('Searching TONE3000…');
  showInfo(`<strong>Searching TONE3000 NAM models…</strong><small>${esc(state.query || 'Popular models')} · page ${page}</small>`);

  try {
    const data = await NamLoader.search(state.query, page, state.sort);
    const tones = normalizeTones(data);
    state.total = Number(data?.total ?? tones.length ?? 0);

    const countEl = $('namResultCount');
    if (countEl) countEl.textContent = `${state.total.toLocaleString()} models`;

    const totalPages = Number(data?.total_pages || Math.max(1, Math.ceil(state.total / PAGE_SIZE)));
    const pagEl = $('namPagination');
    if (pagEl) pagEl.style.display = totalPages > 1 ? 'flex' : 'none';
    const pageLabel = $('namPageLabel');
    if (pageLabel) pageLabel.textContent = `Page ${page} / ${totalPages}`;
    const prev = $('btnNamPrev');
    const next = $('btnNamNext');
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;

    renderCards(tones);
    showInfo(`<strong>Choose a NAM model below.</strong><small>Press JamMate “Send to Device”. Do not use any TONE3000 website download button.</small>`);
  } catch (err) {
    if (err.message === 'NOT_AUTHED') {
      showInfo('<strong>TONE3000 session expired.</strong><small>Opening sign-in again. After returning, press Browse/Search again.</small>');
      await NamLoader.startLogin();
    } else {
      renderEmpty('Search failed. See error above.');
      showError(err.message || 'Search failed', 'Open DevTools Console for the full stack trace.');
      console.error('[NAM v3 search]', err);
    }
  }
}

function patchButton(id, handler) {
  const btn = $(id);
  if (!btn || btn.dataset.namV3Patched === '1') return;
  btn.dataset.namV3Patched = '1';
  btn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handler(event);
  }, true);
}

function patchAll() {
  ensurePanel();

  const browse = $('btnNamBrowseT3K');
  if (browse) {
    browse.textContent = 'Browse TONE3000 NAMs';
    browse.title = 'Search TONE3000 inside JamMate';
  }

  patchButton('btnNamBrowseT3K', () => doSearch(1));
  patchButton('btnNamSearch', () => doSearch(1));
  patchButton('btnNamPrev', () => doSearch(Math.max(1, state.page - 1)));
  patchButton('btnNamNext', () => doSearch(state.page + 1));

  const input = $('namSearchInput');
  if (input && input.dataset.namV3KeyPatched !== '1') {
    input.dataset.namV3KeyPatched = '1';
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        doSearch(1);
      }
    });
  }

  const login = $('btnNamLogin');
  if (login && login.dataset.namV3LoginPatched !== '1') {
    login.dataset.namV3LoginPatched = '1';
    login.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      NamLoader.startLogin().catch(err => showError(err.message));
    }, true);
  }
}

function boot() {
  injectStyle();
  patchAll();

  window.addEventListener('error', event => {
    if (String(event.message || '').toLowerCase().includes('nam')) showError(event.message);
  });
  window.addEventListener('unhandledrejection', event => {
    const msg = event.reason?.message || String(event.reason || 'Unhandled promise rejection');
    if (msg.toLowerCase().includes('nam') || msg.toLowerCase().includes('tone')) showError(msg);
  });

  // In case the NAM tab is rebuilt or app.js wires handlers late.
  setTimeout(patchAll, 100);
  setTimeout(patchAll, 500);
  setTimeout(patchAll, 1200);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
