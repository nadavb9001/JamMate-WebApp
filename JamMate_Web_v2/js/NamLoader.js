/**
 * NamLoader.js  —  TONE3000 NAM model browser + BLE transfer
 *
 * Flow:
 *   1. User clicks "Browse TONE3000" → OAuth Select flow opens tone3000.com
 *   2. TONE3000 redirects back to the app with ?tone_url=<signed_url>
 *   3. We fetch the tone JSON → extract the nano .nam model_url
 *   4. Download the .nam binary, compute CRC32
 *   5. Send over BLE in 512-byte chunks with header + CRC check
 *
 * BLE packet layout (sent via BLEService.send):
 *   NAM_UPLOAD_START  [0x50] [4-byte total_size LE] [4-byte crc32 LE] [name up to 32 bytes]
 *   NAM_UPLOAD_CHUNK  [0x51] [2-byte chunk_index LE] [payload bytes]
 *   NAM_UPLOAD_END    [0x52]
 *   ESP replies with [0x53 0x01] = ACK OK  or  [0x53 0x00] = NACK (CRC mismatch)
 *
 * TONE3000 Select Flow (no backend needed):
 *   redirect → https://www.tone3000.com/api/v1/select?app_id=APP_ID&redirect_url=<this page>
 *   callback  → current URL gains ?tone_url=<signed>&api_key=<user_key>
 *   fetch tone_url → JSON with models[] array
 */

import { BLEService } from './services/BLEService.js';
import { Protocol }   from './services/Protocol.js';

// ── Config ────────────────────────────────────────────────────────────────────
// Replace with your real TONE3000 publishable key from tone3000.com/account
const T3K_APP_ID     = 'YOUR_TONE3000_PUBLISHABLE_KEY';
const CHUNK_SIZE     = 512;   // bytes per BLE chunk
const NAM_CMD_START  = 0x50;
const NAM_CMD_CHUNK  = 0x51;
const NAM_CMD_END    = 0x52;
const NAM_CMD_ACK    = 0x53;

// ── CRC-32 (standard poly 0xEDB88320) ────────────────────────────────────────
function crc32(buffer) {
  const table = crc32._table || (crc32._table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++)
    crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseModelName(url, fallback) {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || fallback; }
  catch { return fallback; }
}

// ── NamLoader singleton ───────────────────────────────────────────────────────
export const NamLoader = {
  _onProgress: null,   // (pct, msg) => void
  _onDone:     null,   // (ok, msg)  => void
  _pendingAck: null,   // resolve/reject for BLE ACK

  // ── called by app.js when BLE receives a NAM ACK packet ──────────────────
  handleAck(ok) {
    if (this._pendingAck) {
      const { resolve, reject } = this._pendingAck;
      this._pendingAck = null;
      ok ? resolve() : reject(new Error('ESP CRC mismatch'));
    }
  },

  // ── 1. Kick off TONE3000 Select flow ─────────────────────────────────────
  browseT3K() {
    const redirectUrl = encodeURIComponent(window.location.href.split('?')[0] + '?t3k_callback=1');
    window.location.href =
      `https://www.tone3000.com/api/v1/select?app_id=${T3K_APP_ID}&redirect_url=${redirectUrl}`;
  },

  // ── 2. Handle redirect callback — returns true if it consumed the params ──
  async handleCallback(searchParams, onProgress, onDone) {
    if (!searchParams.get('t3k_callback')) return false;
    const toneUrl = searchParams.get('tone_url');
    if (!toneUrl) { onDone(false, 'No tone_url in callback'); return true; }
    await this.loadFromToneUrl(toneUrl, onProgress, onDone);
    return true;
  },

  // ── 3. Fetch tone JSON, pick nano .nam model, download + send ─────────────
  async loadFromToneUrl(toneUrl, onProgress, onDone) {
    this._onProgress = onProgress;
    this._onDone     = onDone;
    try {
      onProgress(0, 'Fetching tone info…');
      const res = await fetch(toneUrl);
      if (!res.ok) throw new Error(`Tone fetch failed: ${res.status}`);
      const tone = await res.json();

      // Find nano NAM model
      const models = tone.models || [];
      const nano = models.find(m =>
        m.platform === 'nam' && m.size === 'nano' && m.model_url
      );
      if (!nano) throw new Error('No nano NAM model found in this tone');

      await this._downloadAndSend(nano.model_url, nano.name || tone.name || 'model.nam', onProgress, onDone);
    } catch (err) {
      onDone(false, err.message);
    }
  },

  // ── 4. User picked a local .nam file ──────────────────────────────────────
  async loadFromFile(file, onProgress, onDone) {
    this._onProgress = onProgress;
    this._onDone     = onDone;
    try {
      onProgress(0, `Reading ${file.name}…`);
      const buffer = await file.arrayBuffer();
      await this._sendBuffer(buffer, file.name, onProgress, onDone);
    } catch (err) {
      onDone(false, err.message);
    }
  },

  // ── 5. Download binary ────────────────────────────────────────────────────
  async _downloadAndSend(url, name, onProgress, onDone) {
    onProgress(5, `Downloading ${name}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const total = parseInt(res.headers.get('content-length') || '0');
    let loaded = 0;
    const reader = res.body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (total) onProgress(5 + Math.round((loaded / total) * 30), `Downloading… ${Math.round(loaded/1024)}KB`);
    }
    const buffer = await new Blob(chunks).arrayBuffer();
    await this._sendBuffer(buffer, name, onProgress, onDone);
  },

  // ── 6. CRC + chunked BLE transfer ────────────────────────────────────────
  async _sendBuffer(buffer, name, onProgress, onDone) {
    const bytes      = new Uint8Array(buffer);
    const totalSize  = bytes.length;
    const checksum   = crc32(buffer);
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    const nameBytes  = new TextEncoder().encode(name.slice(0, 32));

    onProgress(36, `Sending ${Math.round(totalSize/1024)}KB to device…`);

    // START packet: [CMD][u32 size LE][u32 crc LE][name]
    const startPkt = new Uint8Array(1 + 4 + 4 + nameBytes.length);
    const sv = new DataView(startPkt.buffer);
    startPkt[0] = NAM_CMD_START;
    sv.setUint32(1, totalSize, true);
    sv.setUint32(5, checksum,  true);
    startPkt.set(nameBytes, 9);
    BLEService.send(startPkt);
    await sleep(50);

    // CHUNK packets
    for (let i = 0; i < totalChunks; i++) {
      const slice   = bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const pkt     = new Uint8Array(3 + slice.length);
      const cv      = new DataView(pkt.buffer);
      pkt[0]        = NAM_CMD_CHUNK;
      cv.setUint16(1, i, true);
      pkt.set(slice, 3);
      BLEService.send(pkt);

      const pct = 36 + Math.round(((i + 1) / totalChunks) * 58);
      onProgress(pct, `Chunk ${i + 1}/${totalChunks}`);

      // Throttle — give ESP breathing room every 8 chunks
      if ((i + 1) % 8 === 0) await sleep(20);
    }

    // END packet + wait for ACK
    BLEService.send(new Uint8Array([NAM_CMD_END]));
    onProgress(95, 'Waiting for CRC confirmation…');

    await new Promise((resolve, reject) => {
      this._pendingAck = { resolve, reject };
      setTimeout(() => {
        if (this._pendingAck) {
          this._pendingAck = null;
          reject(new Error('ACK timeout — check BLE connection'));
        }
      }, 15000);
    });

    onProgress(100, '✓ Model loaded successfully');
    onDone(true, `${name} sent to device`);
  },

  // ── 7. Public search — returns array of {id, name, author, downloads, url} ─
  // Uses public search endpoint (no auth required for listing)
  async searchPublic(query = '', page = 1) {
    const q = encodeURIComponent(query);
    const url = `https://www.tone3000.com/api/v1/tones?platform=nam&size=nano&sort=downloads-all-time&search=${q}&page=${page}&page_size=20`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    return res.json();
  },
};
