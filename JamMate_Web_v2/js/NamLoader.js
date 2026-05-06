/**
 * NamLoader.js — TONE3000 NAM browser + BLE transfer
 * Adds download/transfer success details via onDone(..., details) and a DOM event:
 * window.dispatchEvent(new CustomEvent('nam-transfer-success', { detail: details }))
 *
 * Model selection behavior:
 * - Prefer NAM nano
 * - Fallback to feather, lite, then standard
 * - If no NAM model is found, report available model platform/size entries
 */

import { BLEService } from './services/BLEService.js';

const T3K_CLIENT_ID = 't3k_pub_UdyZ5sYtaceVAFXOLFwGtuLs4QvwQeLe';
const T3K_BASE = 'https://www.tone3000.com/api/v1';
const REDIRECT_URI = window.location.origin + window.location.pathname;

const CHUNK_SIZE = 512;
const ACK_TIMEOUT = 20000;

const CMD_START = 0x50;
const CMD_CHUNK = 0x51;
const CMD_END = 0x52;

function crc32(buffer) {
  if (!crc32._t) {
    crc32._t = new Uint32Array(256);

    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crc32._t[i] = c;
    }
  }

  let crc = 0xFFFFFFFF;

  new Uint8Array(buffer).forEach((b) => {
    crc = crc32._t[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  });

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

async function generatePKCE() {
  const verifier =
    crypto.randomUUID().replace(/-/g, '') +
    crypto.randomUUID().replace(/-/g, '');

  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );

  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { verifier, challenge };
}

const T = {
  save(accessToken, refreshToken, expiresIn) {
    sessionStorage.setItem('t3k_access', accessToken || '');
    sessionStorage.setItem('t3k_refresh', refreshToken || '');
    sessionStorage.setItem(
      't3k_exp',
      String(Date.now() + Number(expiresIn || 3600) * 1000)
    );
  },

  get() {
    return sessionStorage.getItem('t3k_access');
  },

  expired() {
    return Date.now() > parseInt(sessionStorage.getItem('t3k_exp') || '0', 10);
  },

  clear() {
    ['t3k_access', 't3k_refresh', 't3k_exp'].forEach((k) => {
      sessionStorage.removeItem(k);
    });
  },
};

async function getToken() {
  if (!T.get()) return null;
  if (!T.expired()) return T.get();

  const refreshToken = sessionStorage.getItem('t3k_refresh');

  if (!refreshToken) {
    T.clear();
    return null;
  }

  try {
    const res = await fetch(`${T3K_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: T3K_CLIENT_ID,
      }),
    });

    if (!res.ok) {
      T.clear();
      return null;
    }

    const { access_token, refresh_token, expires_in } = await res.json();
    T.save(access_token, refresh_token, expires_in);

    return access_token;
  } catch {
    T.clear();
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeTransferDetails(name, totalSize, checksum, totalChunks, source = 'NAM') {
  const safeName = name || 'model.nam';

  return {
    name: safeName,
    fileName: safeName,
    source,
    sizeBytes: totalSize,
    sizeKB: Math.round(totalSize / 1024),
    sizeMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
    chunks: totalChunks,
    chunkSize: CHUNK_SIZE,
    crc32: checksum.toString(16).toUpperCase().padStart(8, '0'),
    completedAt: new Date().toISOString(),
  };
}

function emitSuccess(details) {
  try {
    sessionStorage.setItem('nam_last_success', JSON.stringify(details));
  } catch {
    // Ignore storage errors.
  }

  window.dispatchEvent(
    new CustomEvent('nam-transfer-success', {
      detail: details,
    })
  );
}

function normalizeModelsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.models)) return payload.models;
  return [];
}

function getModelUrl(model) {
  return model?.model_url || model?.download_url || model?.url || '';
}

function getModelPlatform(model) {
  return String(
    model?.platform ||
    model?.model_platform ||
    model?.type ||
    model?.format ||
    ''
  ).toLowerCase();
}

function getModelSize(model) {
  return String(
    model?.size ||
    model?.model_size ||
    model?.variant ||
    ''
  ).toLowerCase();
}

function isNamModel(model) {
  const platform = getModelPlatform(model);
  const url = String(getModelUrl(model)).toLowerCase();
  const filename = String(model?.filename || model?.name || '').toLowerCase();

  return (
    platform === 'nam' ||
    platform.includes('nam') ||
    url.includes('.nam') ||
    filename.endsWith('.nam')
  );
}

function describeAvailableModels(models) {
  if (!models?.length) return '';

  return models
    .map((model) => {
      const platform =
        model?.platform ||
        model?.model_platform ||
        model?.type ||
        model?.format ||
        'unknown-platform';

      const size =
        model?.size ||
        model?.model_size ||
        model?.variant ||
        'unknown-size';

      const hasUrl = getModelUrl(model) ? 'downloadable' : 'no-url';

      return `${platform}/${size}/${hasUrl}`;
    })
    .join(', ');
}

function pickBestNamModel(models) {
  const downloadableNamModels = (models || []).filter((model) => {
    return isNamModel(model) && !!getModelUrl(model);
  });

  const sizeRank = {
    nano: 0,
    feather: 1,
    lite: 2,
    standard: 3,
  };

  return downloadableNamModels
    .slice()
    .sort((a, b) => {
      const aSize = getModelSize(a);
      const bSize = getModelSize(b);

      return (sizeRank[aSize] ?? 99) - (sizeRank[bSize] ?? 99);
    })[0] || null;
}

function makeModelFileName(toneId, selectedModel, fallbackName) {
  const modelName =
    selectedModel?.name ||
    selectedModel?.filename ||
    selectedModel?.file_name ||
    fallbackName ||
    `tone_${toneId}.nam`;

  return String(modelName).replace(/\.nam$/i, '') + '.nam';
}

export const NamLoader = {
  _pendingAck: null,

  isAuthed() {
    return !!T.get();
  },

  handleAck(ok) {
    if (!this._pendingAck) return;

    const { resolve, reject } = this._pendingAck;
    this._pendingAck = null;

    ok ? resolve() : reject(new Error('ESP CRC mismatch'));
  },

  async startLogin() {
    const { verifier, challenge } = await generatePKCE();
    const state = crypto.randomUUID();

    sessionStorage.setItem('t3k_verifier', verifier);
    sessionStorage.setItem('t3k_state', state);

    const params = new URLSearchParams({
      client_id: T3K_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });

    window.location.href = `${T3K_BASE}/oauth/authorize?${params}`;
  },

  async startSelect() {
    const { verifier, challenge } = await generatePKCE();
    const state = crypto.randomUUID();

    sessionStorage.setItem('t3k_verifier', verifier);
    sessionStorage.setItem('t3k_state', state);

    const params = new URLSearchParams({
      client_id: T3K_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      prompt: 'select_tone',
      platform: 'nam',
      gears: 'amp_full-rig',
      menubar: 'false',
    });

    window.location.href = `${T3K_BASE}/oauth/authorize?${params}`;
  },

  async handleCallback(searchParams, onProgress, onDone) {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const toneId = searchParams.get('tone_id');
    const error = searchParams.get('error');
    const canceled = searchParams.get('canceled') === 'true';

    if (!code && !error && !canceled) return false;

    window.history.replaceState({}, '', window.location.pathname);

    if (canceled) {
      onDone(false, 'Canceled');
      return true;
    }

    if (error) {
      onDone(false, `Auth error: ${error}`);
      return true;
    }

    if (state !== sessionStorage.getItem('t3k_state')) {
      onDone(false, 'State mismatch');
      return true;
    }

    onProgress(5, 'Signing in…');

    try {
      const res = await fetch(`${T3K_BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: sessionStorage.getItem('t3k_verifier') || '',
          redirect_uri: REDIRECT_URI,
          client_id: T3K_CLIENT_ID,
        }),
      });

      if (!res.ok) {
        throw new Error(`Token exchange ${res.status}: ${await res.text()}`);
      }

      const { access_token, refresh_token, expires_in } = await res.json();
      T.save(access_token, refresh_token, expires_in);

      if (toneId) {
        onProgress(8, `Selected TONE3000 tone #${toneId}`);
        await this._fetchAndSend(toneId, onProgress, onDone);
      } else {
        onDone(true, 'logged_in');
      }
    } catch (err) {
      onDone(false, err.message);
    }

    return true;
  },

  async search(query = '', page = 1, sort = 'downloads-all-time', sizes = '') {
    const token = await getToken();

    if (!token) {
      throw new Error('NOT_AUTHED');
    }

    const params = new URLSearchParams({
      page,
      page_size: 20,
      sort,
    });

    if (query) params.set('query', query);

    // Leave sizes empty by default so search results are not limited to nano-only.
    // The actual transfer still prefers nano first during model selection.
    if (sizes) params.set('sizes', sizes);

    const res = await fetch(`${T3K_BASE}/tones/search?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401) {
      T.clear();
      throw new Error('NOT_AUTHED');
    }

    if (!res.ok) {
      throw new Error(`Search ${res.status}: ${await res.text()}`);
    }

    return res.json();
  },

  async _fetchToneName(toneId, token) {
    let name = `tone_${toneId}.nam`;

    try {
      const toneRes = await fetch(`${T3K_BASE}/tones/${encodeURIComponent(toneId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (toneRes.ok) {
        const tone = await toneRes.json();
        name = (tone.name || name).replace(/\.nam$/i, '') + '.nam';
      }
    } catch {
      // Tone name is optional.
    }

    return name;
  },

  async _fetchAndSend(toneId, onProgress, onDone) {
    const token = await getToken();

    if (!token) {
      onDone(false, 'Not authenticated');
      return;
    }

    onProgress(12, 'Fetching model list…');

    const modelsRes = await fetch(
      `${T3K_BASE}/models?tone_id=${encodeURIComponent(toneId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!modelsRes.ok) {
      throw new Error(`Models fetch ${modelsRes.status}: ${await modelsRes.text()}`);
    }

    const modelsPayload = await modelsRes.json();
    const models = normalizeModelsPayload(modelsPayload);

    const fallbackToneName = await this._fetchToneName(toneId, token);
    const selectedModel = pickBestNamModel(models);

    if (!selectedModel) {
      const available = describeAvailableModels(models);

      throw new Error(
        available
          ? `No downloadable NAM model found for this tone. Available models: ${available}`
          : 'No downloadable models found for this tone.'
      );
    }

    const selectedSize = getModelSize(selectedModel) || 'unknown';
    const selectedUrl = getModelUrl(selectedModel);
    const name = makeModelFileName(toneId, selectedModel, fallbackToneName);

    if (selectedSize !== 'nano') {
      console.warn(`[NAM] No nano model found; using ${selectedSize} instead.`);
      onProgress(14, `No nano version found; using ${selectedSize} NAM model`);
    } else {
      onProgress(14, 'Using nano NAM model');
    }

    await this._downloadAndSend(selectedUrl, name, token, onProgress, onDone);
  },

  async sendTone(toneId, fallbackName, onProgress, onDone) {
    try {
      await this._fetchAndSend(toneId, onProgress, onDone);
    } catch (err) {
      onDone(false, err.message);
    }
  },

  async loadFromFile(file, onProgress, onDone) {
    try {
      onProgress(2, `Reading ${file.name}…`);

      const buffer = await file.arrayBuffer();

      await this._sendBuffer(
        buffer,
        file.name,
        onProgress,
        onDone,
        'Local file'
      );
    } catch (err) {
      onDone(false, err.message);
    }
  },

  async _downloadAndSend(url, name, token, onProgress, onDone) {
    onProgress(18, `Downloading ${name}…`);

    const headers = token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {};

    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`Download ${res.status}: ${await res.text()}`);
    }

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    const reader = res.body.getReader();

    const chunks = [];
    let loaded = 0;

    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      loaded += value.length;

      if (total) {
        onProgress(
          18 + Math.round((loaded / total) * 22),
          `Downloading… ${Math.round(loaded / 1024)}KB`
        );
      } else {
        onProgress(
          22,
          `Downloading… ${Math.round(loaded / 1024)}KB`
        );
      }
    }

    const buffer = await new Blob(chunks).arrayBuffer();

    await this._sendBuffer(
      buffer,
      name,
      onProgress,
      onDone,
      'TONE3000'
    );
  },

  async _sendBuffer(buffer, name, onProgress, onDone, source = 'NAM') {
    const bytes = new Uint8Array(buffer);
    const total = bytes.length;
    const csum = crc32(buffer);
    const nchunks = Math.ceil(total / CHUNK_SIZE);
    const nameBytes = new TextEncoder().encode((name || 'model.nam').slice(0, 32));

    onProgress(42, `Sending ${Math.round(total / 1024)}KB…`);

    const start = new Uint8Array(9 + nameBytes.length);
    const startView = new DataView(start.buffer);

    start[0] = CMD_START;
    startView.setUint32(1, total, true);
    startView.setUint32(5, csum, true);
    start.set(nameBytes, 9);

    BLEService.send(start);

    await sleep(60);

    for (let i = 0; i < nchunks; i++) {
      const slice = bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const pkt = new Uint8Array(3 + slice.length);
      const pktView = new DataView(pkt.buffer);

      pkt[0] = CMD_CHUNK;
      pktView.setUint16(1, i, true);
      pkt.set(slice, 3);

      BLEService.send(pkt);

      onProgress(
        42 + Math.round(((i + 1) / nchunks) * 50),
        `Chunk ${i + 1}/${nchunks}`
      );

      if ((i + 1) % 8 === 0) {
        await sleep(20);
      }
    }

    BLEService.send(new Uint8Array([CMD_END]));
    onProgress(94, 'Waiting for device CRC…');

    await new Promise((resolve, reject) => {
      this._pendingAck = { resolve, reject };

      setTimeout(() => {
        if (this._pendingAck) {
          this._pendingAck = null;
          reject(new Error('ACK timeout'));
        }
      }, ACK_TIMEOUT);
    });

    const details = makeTransferDetails(name, total, csum, nchunks, source);

    emitSuccess(details);

    onProgress(100, `✓ ${details.name} loaded`);
    onDone(true, details.name, details);
  },
};
