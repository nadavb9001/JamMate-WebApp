/**
 * NamLoader.js  —  TONE3000 NAM browser + BLE transfer  (v2, corrected)
 *
 * ── What changed from v1 ────────────────────────────────────────────────────
 *  • Search endpoint: /api/v1/tones/search  (not /api/v1/tones)
 *  • Search requires Bearer token  → full PKCE OAuth flow before search
 *  • Select flow callback returns ?code=&state=&tone_id=  (not ?tone_url=)
 *  • Token exchange added (POST /api/v1/oauth/token)
 *  • Token stored in sessionStorage, refreshed automatically
 *  • browseT3K() now generates proper PKCE params
 *
 * ── OAuth flow (Select) ──────────────────────────────────────────────────────
 *  1. NamLoader.startAuth()   → generates PKCE, stores verifier, redirects
 *  2. TONE3000 user signs in, picks a nano NAM tone
 *  3. TONE3000 redirects back with ?code=&state=&tone_id=
 *  4. NamLoader.handleCallback() → exchanges code for token → fetches models
 *  5. Finds nano model_url → downloads → BLE transfer
 *
 * ── BLE packet layout ────────────────────────────────────────────────────────
 *  NAM_UPLOAD_START [0x50] [u32 total_size LE] [u32 crc32 LE] [name up to 32b]
 *  NAM_UPLOAD_CHUNK [0x51] [u16 chunk_index LE] [payload]
 *  NAM_UPLOAD_END   [0x52]
 *  ESP ACK          [0x53] [0x01=OK | 0x00=NACK]
 *  NAM_EJECT        [0x54]
 */

import { BLEService } from './services/BLEService.js';

// ── Config ────────────────────────────────────────────────────────────────────
const T3K_CLIENT_ID = 't3k_pub_UdyZ5sYtaceVAFXOLFwGtuLs4QvwQeLe';
const T3K_BASE      = 'https://www.tone3000.com/api/v1';
const REDIRECT_URI  = window.location.origin + window.location.pathname;
const CHUNK_SIZE    = 512;
const ACK_TIMEOUT   = 20000;
const CMD_START = 0x50, CMD_CHUNK = 0x51, CMD_END = 0x52;

// ── CRC-32 ────────────────────────────────────────────────────────────────────
function crc32(buffer) {
  if (!crc32._t) {
    crc32._t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crc32._t[i] = c;
    }
  }
  let crc = 0xFFFFFFFF;
  new Uint8Array(buffer).forEach(b => { crc = crc32._t[(crc ^ b) & 0xFF] ^ (crc >>> 8); });
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PKCE ──────────────────────────────────────────────────────────────────────
async function generatePKCE() {
  const v = crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'');
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  const c = btoa(String.fromCharCode(...new Uint8Array(h)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  return { verifier: v, challenge: c };
}

// ── Token helpers ─────────────────────────────────────────────────────────────
const T = {
  save(a, r, e) {
    sessionStorage.setItem('t3k_access',  a);
    sessionStorage.setItem('t3k_refresh', r);
    sessionStorage.setItem('t3k_exp',     String(Date.now() + e * 1000));
  },
  get()      { return sessionStorage.getItem('t3k_access'); },
  expired()  { return Date.now() > parseInt(sessionStorage.getItem('t3k_exp') || '0'); },
  clear()    { ['t3k_access','t3k_refresh','t3k_exp'].forEach(k => sessionStorage.removeItem(k)); },
};

async function getToken() {
  if (!T.get()) return null;
  if (!T.expired()) return T.get();
  const rf = sessionStorage.getItem('t3k_refresh');
  if (!rf) { T.clear(); return null; }
  try {
    const r = await fetch(`${T3K_BASE}/oauth/token`, {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({ grant_type:'refresh_token', refresh_token:rf, client_id:T3K_CLIENT_ID }),
    });
    if (!r.ok) { T.clear(); return null; }
    const { access_token:a, refresh_token:rv, expires_in:e } = await r.json();
    T.save(a, rv, e);
    return a;
  } catch { T.clear(); return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── NamLoader ─────────────────────────────────────────────────────────────────
export const NamLoader = {
  _pendingAck: null,
  isAuthed() { return !!T.get(); },

  // Called by app.js BLE receive handler for CMD 0x53
  handleAck(ok) {
    if (!this._pendingAck) return;
    const { resolve, reject } = this._pendingAck;
    this._pendingAck = null;
    ok ? resolve() : reject(new Error('ESP CRC mismatch'));
  },

  // ── Auth: login only (no tone select) ──────────────────────────────────
  async startLogin() {
    const { verifier, challenge } = await generatePKCE();
    const state = crypto.randomUUID();
    sessionStorage.setItem('t3k_verifier', verifier);
    sessionStorage.setItem('t3k_state',    state);
    const p = new URLSearchParams({
      client_id: T3K_CLIENT_ID, redirect_uri: REDIRECT_URI,
      response_type:'code', code_challenge:challenge,
      code_challenge_method:'S256', state,
    });
    window.location.href = `${T3K_BASE}/oauth/authorize?${p}`;
  },

  // ── Select flow: login + tone picker in one step ────────────────────────
  async startSelect() {
    const { verifier, challenge } = await generatePKCE();
    const state = crypto.randomUUID();
    sessionStorage.setItem('t3k_verifier', verifier);
    sessionStorage.setItem('t3k_state',    state);
    const p = new URLSearchParams({
      client_id: T3K_CLIENT_ID, redirect_uri: REDIRECT_URI,
      response_type:'code', code_challenge:challenge,
      code_challenge_method:'S256', state,
      prompt:'select_tone', platform:'nam', menubar:'true',
    });
    window.location.href = `${T3K_BASE}/oauth/authorize?${p}`;
  },

  // ── Handle OAuth callback — returns true if it consumed the URL params ──
  async handleCallback(searchParams, onProgress, onDone) {
    const code     = searchParams.get('code');
    const state    = searchParams.get('state');
    const toneId   = searchParams.get('tone_id');
    const error    = searchParams.get('error');
    const canceled = searchParams.get('canceled') === 'true';

    if (!code && !error && !canceled) return false;  // not our redirect

    window.history.replaceState({}, '', window.location.pathname);  // clean URL

    if (canceled) { onDone(false, 'Canceled'); return true; }
    if (error)    { onDone(false, `Auth error: ${error}`); return true; }

    if (state !== sessionStorage.getItem('t3k_state')) {
      onDone(false, 'State mismatch'); return true;
    }

    onProgress(5, 'Signing in…');
    try {
      const r = await fetch(`${T3K_BASE}/oauth/token`, {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
          grant_type:'authorization_code', code,
          code_verifier: sessionStorage.getItem('t3k_verifier') || '',
          redirect_uri: REDIRECT_URI, client_id: T3K_CLIENT_ID,
        }),
      });
      if (!r.ok) throw new Error(`Token exchange ${r.status}: ${await r.text()}`);
      const { access_token:a, refresh_token:rv, expires_in:e } = await r.json();
      T.save(a, rv, e);

      if (toneId) {
        await this._fetchAndSend(toneId, onProgress, onDone);
      } else {
        onDone(true, 'logged_in');  // auth-only callback; UI will re-render
      }
    } catch (err) { onDone(false, err.message); }
    return true;
  },

  // ── Search (Bearer required) ────────────────────────────────────────────
  async search(query = '', page = 1, sort = 'downloads-all-time', sizes = 'nano') {
    const token = await getToken();
    if (!token) throw new Error('NOT_AUTHED');

    const p = new URLSearchParams({ page, page_size: 20, sort });
    if (query) p.set('query', query);
    if (sizes) p.set('sizes', sizes);

    const r = await fetch(`${T3K_BASE}/tones/search?${p}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 401) { T.clear(); throw new Error('NOT_AUTHED'); }
    if (!r.ok) throw new Error(`Search ${r.status}: ${await r.text()}`);
    return r.json();  // { data: Tone[], total, page, page_size }
  },

  // ── Fetch models for tone_id and send to ESP ────────────────────────────
  async _fetchAndSend(toneId, onProgress, onDone) {
    const token = await getToken();
    if (!token) { onDone(false, 'Not authenticated'); return; }

    onProgress(12, 'Fetching model list…');
    const mr = await fetch(`${T3K_BASE}/models?tone_id=${toneId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mr.ok) throw new Error(`Models fetch ${mr.status}`);
    const { data: models } = await mr.json();

    // Get tone name
    let name = `tone_${toneId}.nam`;
    try {
      const tr = await fetch(`${T3K_BASE}/tones/${toneId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (tr.ok) { const t = await tr.json(); name = (t.name || name).replace(/\.nam$/i,'') + '.nam'; }
    } catch { /**/ }

    const nano = (models || []).find(m => m.platform === 'nam' && m.size === 'nano' && m.model_url);
    if (!nano) throw new Error('No downloadable nano NAM model for this tone');

    await this._downloadAndSend(nano.model_url, name, token, onProgress, onDone);
  },

  // Public: send a tone by ID (called from search result cards)
  async sendTone(toneId, fallbackName, onProgress, onDone) {
    try { await this._fetchAndSend(toneId, onProgress, onDone); }
    catch (err) { onDone(false, err.message); }
  },

  // Load local file
  async loadFromFile(file, onProgress, onDone) {
    try {
      onProgress(2, `Reading ${file.name}…`);
      await this._sendBuffer(await file.arrayBuffer(), file.name, onProgress, onDone);
    } catch (err) { onDone(false, err.message); }
  },

  async _downloadAndSend(url, name, token, onProgress, onDone) {
    onProgress(18, `Downloading ${name}…`);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Download ${r.status}`);
    const total = parseInt(r.headers.get('content-length') || '0');
    const reader = r.body.getReader();
    const chunks = []; let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); loaded += value.length;
      if (total) onProgress(18 + Math.round(loaded/total*22), `Downloading… ${Math.round(loaded/1024)}KB`);
    }
    await this._sendBuffer(await new Blob(chunks).arrayBuffer(), name, onProgress, onDone);
  },

  async _sendBuffer(buffer, name, onProgress, onDone) {
    const bytes = new Uint8Array(buffer);
    const total = bytes.length;
    const csum  = crc32(buffer);
    const nchunks = Math.ceil(total / CHUNK_SIZE);
    const nameB   = new TextEncoder().encode(name.slice(0, 32));

    onProgress(42, `Sending ${Math.round(total/1024)}KB…`);

    // START packet
    const start = new Uint8Array(9 + nameB.length);
    start[0] = CMD_START;
    new DataView(start.buffer).setUint32(1, total, true);
    new DataView(start.buffer).setUint32(5, csum,  true);
    start.set(nameB, 9);
    BLEService.send(start);
    await sleep(60);

    // CHUNK packets
    for (let i = 0; i < nchunks; i++) {
      const slice = bytes.slice(i * CHUNK_SIZE, (i+1) * CHUNK_SIZE);
      const pkt   = new Uint8Array(3 + slice.length);
      pkt[0] = CMD_CHUNK;
      new DataView(pkt.buffer).setUint16(1, i, true);
      pkt.set(slice, 3);
      BLEService.send(pkt);
      onProgress(42 + Math.round((i+1)/nchunks * 50), `Chunk ${i+1}/${nchunks}`);
      if ((i+1) % 8 === 0) await sleep(20);
    }

    // END + wait for ACK
    BLEService.send(new Uint8Array([CMD_END]));
    onProgress(94, 'Waiting for device CRC…');
    await new Promise((resolve, reject) => {
      this._pendingAck = { resolve, reject };
      setTimeout(() => {
        if (this._pendingAck) { this._pendingAck = null; reject(new Error('ACK timeout')); }
      }, ACK_TIMEOUT);
    });

    onProgress(100, `✓ ${name} loaded`);
    onDone(true, name);
  },
};
