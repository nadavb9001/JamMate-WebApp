/**
 * JamMate Web v2b NAM browser.
 * TONE3000-inspired selection UX: real tone thumbnails, pack details and
 * explicit A2 model selection. NamLoader retains OAuth, BLE and validation.
 */
import { BLEService } from '../services/BLEService.js';

const $ = id => document.getElementById(id);
const txt = (el, value) => { if (el) el.textContent = String(value ?? ''); return el; };
const fmtCount = n => Number(n || 0).toLocaleString();
const gearNames = { 'amp': 'Amplifier', 'amp-cab': 'Amp + cabinet', 'pedal': 'Pedal', 'preamp': 'Preamp', 'outboard': 'Outboard', 'cab': 'Cabinet' };
const titleOf = tone => tone.title || tone.name || `Tone #${tone.id}`;
const authorOf = tone => tone.user?.display_name || tone.user?.username || tone.username || 'Unknown creator';
const safeURL = value => {
  try {
    const u = new URL(String(value || ''), window.location.href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch { return ''; }
};
const imageOf = tone => {
  const images = tone.images;
  const candidate = Array.isArray(images) ? images[0] : images;
  return safeURL((typeof candidate === 'string' ? candidate : candidate?.url) || tone.image_url || tone.thumbnail_url || '');
};
const node = (tag, className, content) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content !== undefined) el.textContent = String(content);
  return el;
};
const button = (label, className, onClick) => {
  const el = node('button', className, label);
  el.type = 'button';
  el.addEventListener('click', onClick);
  return el;
};
function makeArt(tone, className) {
  const root = node('span', `nam-art ${className || ''}`);
  const src = imageOf(tone);
  const fallback = node('span', 'nam-art-placeholder');
  fallback.setAttribute('aria-hidden', 'true');
  fallback.innerHTML = '<span class="nam-amp-handle"></span><span class="nam-amp-head"><span></span><span></span><span></span></span><span class="nam-amp-grille"></span>';
  root.append(fallback);
  if (src) {
    const img = node('img', 'nam-art-photo');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = `Artwork for ${titleOf(tone)}`;
    img.referrerPolicy = 'no-referrer';
    img.src = src;
    img.addEventListener('load', () => { fallback.hidden = true; });
    img.addEventListener('error', () => { img.remove(); fallback.hidden = false; });
    root.append(img);
  }
  return root;
}

export const NamBrowserV2b = {
  loader: null,
  page: 1,
  totalPages: 1,
  busy: false,
  searchSerial: 0,
  detailSerial: 0,
  tone: null,
  models: [],
  selectedModel: null,
  transferBusy: false,
  selectedCard: null,
  detailPanel: null,

  init(loader) {
    this.loader = loader;
    this.detailPanel = $('namDetailPanel');
    // A card is one grid column on phones and two columns on desktop.
    // Keep the open panel immediately below the selected card's current row.
    window.addEventListener('resize', () => {
      if (this.selectedCard?.isConnected && this.tone) this.positionDetails(this.selectedCard);
    });
    this.updateAuth();
    $('btnNamSearch')?.addEventListener('click', () => this.search(1));
    $('namSearch')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.search(1); }
    });
    $('namGear')?.addEventListener('change', () => this.search(1));
    $('namSort')?.addEventListener('change', () => this.search(1));
    $('btnNamPrev')?.addEventListener('click', () => this.search(Math.max(1, this.page - 1)));
    $('btnNamNext')?.addEventListener('click', () => this.search(Math.min(this.totalPages, this.page + 1)));
    $('btnNamBrowseT3K')?.addEventListener('click', () => this.loader.startSelect().catch(e => this.showError(e.message)));
    $('btnNamLogin')?.addEventListener('click', () => this.loader.startLogin().catch(e => this.showError(e.message)));
    if (loader.isAuthed()) this.search(1);
  },

  updateAuth() {
    const isAuthed = this.loader?.isAuthed();
    txt($('namAuthStatus'), isAuthed ? '● TONE3000 connected' : '○ Sign in to browse');
    $('namAuthStatus')?.classList.toggle('is-authenticated', !!isAuthed);
    txt($('btnNamLogin'), isAuthed ? '✓ Signed in' : 'Connect TONE3000');
    if ($('btnNamLogin')) $('btnNamLogin').disabled = !!isAuthed;
  },

  showMessage(message, mode = 'info') {
    const grid = $('namGrid');
    if (!grid) return;
    grid.replaceChildren();
    const wrap = node('div', `nam-welcome ${mode === 'error' ? 'nam-welcome-error' : ''}`);
    wrap.append(node('div', 'nam-welcome-glyph', mode === 'error' ? '!' : '▦'));
    wrap.append(node('strong', '', mode === 'error' ? 'Unable to load tones' : 'Tone library'));
    wrap.append(node('span', '', message));
    if (mode === 'auth') wrap.append(button('Connect TONE3000', 'nam-detail-send', () => this.loader.startLogin().catch(e => this.showError(e.message))));
    grid.append(wrap);
  },

  showError(message) { this.showMessage(String(message || 'Unknown error'), 'error'); },

  async search(page = 1) {
    this.updateAuth();
    if (!this.loader.isAuthed()) {
      this.showMessage('Connect your TONE3000 account to search capture packs, or choose a local .nam file below.', 'auth');
      return;
    }
    const serial = ++this.searchSerial;
    this.page = Math.max(1, page);
    this.closeDetails();
    this.showMessage('Searching compatible NAM A2 capture packs…');
    txt($('namResultCount'), 'Searching…');
    try {
      const result = await this.loader.search(
        $('namSearch')?.value.trim() || '',
        this.page,
        $('namSort')?.value || 'downloads-all-time',
        { gear: $('namGear')?.value || '' }
      );
      if (serial !== this.searchSerial) return;
      const tones = Array.isArray(result) ? result : (result.data || result.tones || []);
      const total = Number(result.total ?? tones.length);
      this.totalPages = Math.max(1, Number(result.total_pages) || Math.ceil(total / 20));
      txt($('namResultCount'), `${fmtCount(total)} tone packs`);
      txt($('namPageLabel'), `Page ${this.page} of ${this.totalPages}`);
      if ($('namPagination')) $('namPagination').style.display = this.totalPages > 1 ? 'flex' : 'none';
      if ($('btnNamPrev')) $('btnNamPrev').disabled = this.page <= 1;
      if ($('btnNamNext')) $('btnNamNext').disabled = this.page >= this.totalPages;
      this.renderCards(tones.filter(t => (t.format || 'nam') === 'nam'));
    } catch(e) {
      if (serial !== this.searchSerial) return;
      this.updateAuth();
      if (e.message === 'NOT_AUTHED') this.showMessage('Your TONE3000 session has expired. Sign in again to browse.', 'auth');
      else this.showError(e.message);
      txt($('namResultCount'), '');
    }
  },

  renderCards(tones) {
    const grid = $('namGrid');
    if (!grid) return;
    grid.replaceChildren();
    grid.classList.remove('nam-v3-grid');
    grid.classList.add('nam-v2b-grid');
    if (!tones.length) { this.showMessage('No compatible NAM A2 tones found. Try another search or gear filter.'); return; }
    for (const tone of tones) {
      const card = button('', 'nam-tone-card', () => this.openDetails(tone, card));
      card.dataset.toneId = String(tone.id);
      card.setAttribute('aria-label', `Show models for ${titleOf(tone)}`);
      card.setAttribute('aria-controls', 'namDetailPanel');
      card.setAttribute('aria-expanded', 'false');
      card.append(makeArt(tone, 'nam-card-art'));
      const body = node('span', 'nam-tone-body');
      const meta = node('span', 'nam-tone-format');
      meta.append(node('span', 'nam-format-badge', 'NAM A2'));
      meta.append(node('span', '', gearNames[tone.gear] || tone.gear || 'Capture'));
      body.append(meta);
      const h = node('span', 'nam-tone-title', titleOf(tone));
      h.title = titleOf(tone);
      body.append(h);
      body.append(node('span', 'nam-tone-author', `by ${authorOf(tone)}`));
      body.append(node('span', 'nam-tone-stats', `${fmtCount(tone.downloads_count ?? tone.downloads ?? tone.download_count)} downloads  ·  ${Number(tone.a2_models_count ?? tone.models_count ?? 1)} models`));
      card.append(body);
      card.append(node('span', 'nam-tone-chevron', '›'));
      grid.append(card);
    }
  },

  closeDetails() {
    // Keep the panel connected to the DOM when the result grid is replaced by
    // a new search. Otherwise getElementById('namDetailPanel') disappears.
    ++this.detailSerial;
    this.tone = null;
    this.models = [];
    this.selectedModel = null;
    this.selectedCard = null;
    const panel = this.detailPanel || $('namDetailPanel');
    if (panel) {
      panel.hidden = true;
      panel.replaceChildren();
      const grid = $('namGrid');
      if (grid && panel.parentElement === grid) grid.before(panel);
    }
    document.querySelectorAll('#namGrid > .nam-tone-card.is-selected').forEach(el => {
      el.classList.remove('is-selected');
      el.setAttribute('aria-expanded', 'false');
    });
  },

  positionDetails(card) {
    const grid = $('namGrid');
    const panel = this.detailPanel || $('namDetailPanel');
    if (!grid || !panel || !card || card.parentElement !== grid) return;

    // First remove the old expansion from the grid so previous selections do
    // not distort row positions. Then find the last card on the selected row.
    // This works for both the two-column desktop and one-column mobile grid.
    if (panel.parentElement === grid) grid.before(panel);
    const rowTop = card.getBoundingClientRect().top;
    let rowEnd = card;
    while (rowEnd.nextElementSibling?.classList.contains('nam-tone-card') &&
           Math.abs(rowEnd.nextElementSibling.getBoundingClientRect().top - rowTop) < 3) {
      rowEnd = rowEnd.nextElementSibling;
    }
    rowEnd.after(panel);
  },

  async openDetails(tone, card = null) {
    const grid = $('namGrid');
    if (!card) card = Array.from(grid?.querySelectorAll('.nam-tone-card') || [])
      .find(el => el.dataset.toneId === String(tone.id));
    if (!card || card.parentElement !== grid) return;
    // Clicking the open card collapses it; clicking another swaps the panel.
    if (this.selectedCard === card && this.tone) {
      this.closeDetails();
      return;
    }
    const id = ++this.detailSerial;
    this.tone = tone;
    this.models = [];
    this.selectedModel = null;
    this.selectedCard = card;
    grid.querySelectorAll('.nam-tone-card').forEach(el => {
      const selected = el === card;
      el.classList.toggle('is-selected', selected);
      el.setAttribute('aria-expanded', selected ? 'true' : 'false');
    });
    this.positionDetails(card);
    this.renderDetails('loading');
    try {
      const models = await this.loader.listToneModels(tone.id);
      if (id !== this.detailSerial) return;
      this.models = models;
      this.selectedModel = models[0] || null;
      this.renderDetails('ready');
    } catch(e) {
      if (id !== this.detailSerial) return;
      this.renderDetails('error', e.message);
    }
  },

  renderDetails(status, errorMessage = '') {
    const panel = this.detailPanel || $('namDetailPanel');
    if (!panel || !this.tone) return;
    const tone = this.tone;
    panel.hidden = false;
    panel.replaceChildren();
    const top = node('div', 'nam-detail-top');
    top.append(button('× Close details', 'nam-detail-back', () => this.closeDetails()));
    top.append(node('span', 'nam-detail-eyebrow', 'TONE PACK / MODEL SELECTION'));
    panel.append(top);
    const content = node('div', 'nam-detail-content');
    content.append(makeArt(tone, 'nam-detail-art'));
    const info = node('div', 'nam-detail-info');
    info.append(node('span', 'nam-section-eyebrow', `${gearNames[tone.gear] || tone.gear || 'Amplifier'} · NAM · TONE3000`));
    const detailTitle = node('h3', 'nam-detail-title', titleOf(tone));
    detailTitle.id = 'namInlineDetailTitle';
    info.append(detailTitle);
    info.append(node('p', 'nam-detail-by', `Captured by ${authorOf(tone)}`));
    if (tone.description) info.append(node('p', 'nam-detail-description', tone.description));
    const bottom = node('div', 'nam-detail-picker');
    if (status === 'loading') bottom.append(node('p', 'nam-model-state', 'Checking available A2 models…'));
    else if (status === 'error') bottom.append(node('p', 'nam-model-state nam-model-error', `Could not read models: ${errorMessage}`));
    else if (!this.models.length) bottom.append(node('p', 'nam-model-state nam-model-error', 'No downloadable A2 models in this tone pack. JamMate cannot load A1 or IR files.'));
    else {
      const lab = node('label', 'nam-model-label', 'CHOOSE A MODEL');
      lab.htmlFor = 'namModelSelect';
      bottom.append(lab);
      const row = node('div', 'nam-model-actions');
      const select = node('select', 'nam-model-select');
      select.id = 'namModelSelect';
      this.models.forEach((m,i) => {
        const name = m.name || `Model ${i + 1}`;
        const opt = node('option', '', `${name}  ·  ${String(m.size || 'A2').toUpperCase()}`);
        opt.value = String(i);
        select.append(opt);
      });
      select.addEventListener('change', () => { this.selectedModel = this.models[Number(select.value)]; });
      const send = button('Send to JamMate →', 'nam-detail-send', async () => {
        if (this.transferBusy) return;
        if (!BLEService.isConnected) {
          this.setDetailNotice('Connect JamMate over BLE before sending a model.', true);
          return;
        }
        if (!this.selectedModel) return;
        const chosen = this.selectedModel;
        this.transferBusy = true;
        send.disabled = true;
        select.disabled = true;
        txt(send, 'Transferring…');
        try {
          await this.loader.sendSelectedModel(
            chosen, titleOf(tone),
            (pct,msg) => this.loader._updateUIProgress(pct,msg),
            (ok,msg,details) => {
              this.loader._handleDone(ok,msg,details);
              this.setDetailNotice(ok ? `${details?.name || chosen.name} loaded on JamMate` : (msg || 'Transfer failed'), !ok);
            }
          );
        } finally {
          this.transferBusy = false;
          send.disabled = false;
          select.disabled = false;
          txt(send, 'Send to JamMate →');
        }
      });
      row.append(select, send);
      bottom.append(row);
      bottom.append(node('p', 'nam-model-hint', 'A2 captures only. JamMate validates compatible weights before BLE transfer.'));
    }
    const notice = node('p', 'nam-model-notice'); notice.id = 'namModelNotice'; notice.setAttribute('role','status'); bottom.append(notice);
    info.append(bottom); content.append(info); panel.append(content);
  },

  setDetailNotice(message, error = false) {
    const el = $('namModelNotice');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.toggle('is-error', !!error);
  }
};
