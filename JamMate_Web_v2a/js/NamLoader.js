// /**
//  * NamLoader.js — TONE3000 NAM browser + BLE transfer
//  * Adds download/transfer success details via onDone(..., details) and a DOM event:
//  * window.dispatchEvent(new CustomEvent('nam-transfer-success', { detail: details }))
//  */

// import { BLEService } from './services/BLEService.js';
// import { Protocol } from './services/Protocol.js';

// const T3K_CLIENT_ID = 't3k_pub_UdyZ5sYtaceVAFXOLFwGtuLs4QvwQeLe';
// const T3K_BASE = 'https://www.tone3000.com/api/v1';
// const REDIRECT_URI = window.location.origin + window.location.pathname;

// const CHUNK_SIZE = 200; // bytes of raw float32 weight data per BLE chunk
// const ACK_TIMEOUT = 20000;

// function crc32(buffer) {
//   if (!crc32._t) {
//     crc32._t = new Uint32Array(256);

//     for (let i = 0; i < 256; i++) {
//       let c = i;
//       for (let j = 0; j < 8; j++) {
//         c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
//       }
//       crc32._t[i] = c;
//     }
//   }

//   let crc = 0xFFFFFFFF;

//   new Uint8Array(buffer).forEach((b) => {
//     crc = crc32._t[(crc ^ b) & 0xFF] ^ (crc >>> 8);
//   });

//   return (crc ^ 0xFFFFFFFF) >>> 0;
// }

// async function generatePKCE() {
//   const verifier =
//     crypto.randomUUID().replace(/-/g, '') +
//     crypto.randomUUID().replace(/-/g, '');

//   const hash = await crypto.subtle.digest(
//     'SHA-256',
//     new TextEncoder().encode(verifier)
//   );

//   const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
//     .replace(/\+/g, '-')
//     .replace(/\//g, '_')
//     .replace(/=/g, '');

//   return { verifier, challenge };
// }

// const T = {
//   save(accessToken, refreshToken, expiresIn) {
//     sessionStorage.setItem('t3k_access', accessToken || '');
//     sessionStorage.setItem('t3k_refresh', refreshToken || '');
//     sessionStorage.setItem(
//       't3k_exp',
//       String(Date.now() + Number(expiresIn || 3600) * 1000)
//     );
//   },

//   get() {
//     return sessionStorage.getItem('t3k_access');
//   },

//   expired() {
//     return Date.now() > parseInt(sessionStorage.getItem('t3k_exp') || '0', 10);
//   },

//   clear() {
//     ['t3k_access', 't3k_refresh', 't3k_exp'].forEach((k) => {
//       sessionStorage.removeItem(k);
//     });
//   },
// };

// async function getToken() {
//   if (!T.get()) return null;
//   if (!T.expired()) return T.get();

//   const refreshToken = sessionStorage.getItem('t3k_refresh');

//   if (!refreshToken) {
//     T.clear();
//     return null;
//   }

//   try {
//     const res = await fetch(`${T3K_BASE}/oauth/token`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
//       body: new URLSearchParams({
//         grant_type: 'refresh_token',
//         refresh_token: refreshToken,
//         client_id: T3K_CLIENT_ID,
//       }),
//     });

//     if (!res.ok) {
//       T.clear();
//       return null;
//     }

//     const { access_token, refresh_token, expires_in } = await res.json();
//     T.save(access_token, refresh_token, expires_in);

//     return access_token;
//   } catch {
//     T.clear();
//     return null;
//   }
// }

// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// function sanitizeDownloadName(name) {
//   return String(name || 'model.nam')
//     .replace(/[\\/:*?"<>|]+/g, '_')
//     .replace(/\x00/g, '')
//     .trim() || 'model.nam';
// }

// function saveBlobWithAnchor(blob, name) {
//   const saveUrl = URL.createObjectURL(blob);
//   const a = document.createElement('a');
//   a.href = saveUrl;
//   a.download = sanitizeDownloadName(name);
//   a.style.display = 'none';
//   document.body.appendChild(a);
//   a.click();
//   document.body.removeChild(a);

//   // Keep the object URL alive briefly; some browsers start the transfer
//   // asynchronously after click() returns.
//   setTimeout(() => URL.revokeObjectURL(saveUrl), 5000);
// }


// const NAM_A2_WEIGHT_COUNT = 1871;

// function parseNamWeightsToFloat32Bytes(buffer) {
//   const text = new TextDecoder('utf-8').decode(buffer);
//   let root;
//   try {
//     root = JSON.parse(text);
//   } catch (e) {
//     throw new Error(`Invalid NAM file: JSON parse failed — ${e.message}`);
//   }

//   const arch = (root.architecture || '').toLowerCase();
//   let weights;

//   if (arch === 'slimmablecontainer') {
//     const submodels = root?.config?.submodels;
//     if (!Array.isArray(submodels) || submodels.length === 0) {
//       throw new Error('Invalid NAM file: SlimmableContainer has no submodels');
//     }
//     // Find the submodel whose weights array is exactly the A2 lite size.
//     const match = submodels.find(s => Array.isArray(s?.model?.weights) && s.model.weights.length === NAM_A2_WEIGHT_COUNT);
//     if (!match) {
//       const counts = submodels.map(s => s?.model?.weights?.length ?? 'n/a').join(', ');
//       throw new Error(`No A2 lite submodel (${NAM_A2_WEIGHT_COUNT} weights) found. Submodel weight counts: ${counts}`);
//     }
//     weights = match.model.weights;
//   } else if (arch === 'wavenet') {
//     weights = root?.weights;
//     if (!Array.isArray(weights)) {
//       throw new Error('Invalid NAM file: WaveNet weights array not found');
//     }
//   } else {
//     throw new Error(`Unsupported NAM architecture: ${root.architecture || '(missing)'}`);
//   }

//   if (weights.length !== NAM_A2_WEIGHT_COUNT) {
//     throw new Error(`NAM weight count mismatch: expected ${NAM_A2_WEIGHT_COUNT}, got ${weights.length}`);
//   }

//   const out = new ArrayBuffer(weights.length * 4);
//   const view = new DataView(out);
//   for (let i = 0; i < weights.length; i++) {
//     const v = Number(weights[i]);
//     if (!Number.isFinite(v)) throw new Error(`Non-numeric weight at index ${i}`);
//     view.setFloat32(i * 4, v, true); // little-endian float32
//   }

//   return {
//     weightCount: weights.length,
//     byteLength: out.byteLength,
//     bytes: new Uint8Array(out),
//   };
// }

// function makeTransferDetails(name, totalSize, checksum, totalChunks, source = 'NAM', weightCount = 0, originalSize = 0) {
//   const safeName = name || 'model.nam';

//   return {
//     name: safeName,
//     fileName: safeName,
//     source,
//     sizeBytes: totalSize,
//     originalSizeBytes: originalSize || totalSize,
//     weightCount,
//     sizeKB: Math.round(totalSize / 1024),
//     sizeMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
//     chunks: totalChunks,
//     chunkSize: CHUNK_SIZE,
//     crc32: checksum.toString(16).toUpperCase().padStart(8, '0'),
//     completedAt: new Date().toISOString(),
//   };
// }

// function emitSuccess(details) {
//   try {
//     sessionStorage.setItem('nam_last_success', JSON.stringify(details));
//   } catch {
//     // Ignore storage errors.
//   }

//   window.dispatchEvent(
//     new CustomEvent('nam-transfer-success', {
//       detail: details,
//     })
//   );
// }

// function normalizeModelsPayload(payload) {
//   if (Array.isArray(payload)) return payload;
//   if (Array.isArray(payload?.data)) return payload.data;
//   if (Array.isArray(payload?.models)) return payload.models;
//   return [];
// }

// function getModelUrl(model) {
//   return model?.model_url || model?.download_url || model?.url || '';
// }

// function getModelPlatform(model) {
//   return String(
//     model?.platform ||
//     model?.model_platform ||
//     model?.type ||
//     model?.format ||
//     ''
//   ).toLowerCase();
// }

// function isNamModel(model) {
//   const platform = getModelPlatform(model);
//   const url = String(getModelUrl(model)).toLowerCase();
//   const filename = String(model?.filename || model?.name || '').toLowerCase();

//   return (
//     platform === 'nam' ||
//     platform.includes('nam') ||
//     url.includes('.nam') ||
//     filename.endsWith('.nam')
//   );
// }

// function describeAvailableModels(models) {
//   if (!models?.length) return '';

//   return models
//     .map((model) => {
//       const platform =
//         model?.platform ||
//         model?.model_platform ||
//         model?.type ||
//         model?.format ||
//         'unknown-platform';

//       const size =
//         model?.size ||
//         model?.model_size ||
//         model?.variant ||
//         'unknown-size';

//       const hasUrl = getModelUrl(model) ? 'downloadable' : 'no-url';

//       return `${platform}/${size}/${hasUrl}`;
//     })
//     .join(', ');
// }

// function getModelArchitecture(model) {
//   return String(
//     model?.architecture_version ??
//     model?.architecture ??
//     model?.arch ??
//     ''
//   ).toLowerCase();
// }

// function isA2Model(model) {
//   const arch = getModelArchitecture(model);
//   return arch === '2' || arch === 'a2';
// }

// function pickBestNamModel(models) {
//   const list = models || [];

//   const a2Lite = list.find((model) =>
//     !!getModelUrl(model) &&
//     isA2Model(model) &&
//     String(model?.size || '').toLowerCase() === 'lite'
//   );

//   if (a2Lite) return a2Lite;

//   const a2Any = list.find((model) =>
//     !!getModelUrl(model) &&
//     isA2Model(model)
//   );

//   return a2Any || null;
// }

// function makeModelFileName(toneId, selectedModel, fallbackName) {
//   const modelName =
//     selectedModel?.name ||
//     selectedModel?.filename ||
//     selectedModel?.file_name ||
//     fallbackName ||
//     `tone_${toneId}.nam`;

//   return String(modelName).replace(/\.nam$/i, '') + '.nam';
// }

// export const NamLoader = {
//   _pendingAck: null,
//   _state: {
//     page: 1,
//     total: 0,
//     query: '',
//     sort: 'downloads-all-time',
//   },
//   _options: {},

//   isAuthed() { return !!T.get(); },

//   handleAck(cmdOrOk, status = 0, index = null) {
//     if (!this._pendingAck) return;

//     // Back-compat: older callers passed true/false only.
//     if (typeof cmdOrOk === 'boolean') {
//       const { resolve, reject } = this._pendingAck;
//       this._pendingAck = null;
//       cmdOrOk ? resolve() : reject(new Error('ESP NAM transfer rejected'));
//       return;
//     }

//     const { expectedCmd, expectedIndex, resolve, reject } = this._pendingAck;

//     // Ignore stale/out-of-phase ACKs. This prevents a late chunk ACK from
//     // accidentally satisfying the header or final transfer wait.
//     if (cmdOrOk !== expectedCmd) return;
//     if (expectedIndex !== null && index !== expectedIndex) return;

//     this._pendingAck = null;

//     if (status === 0) {
//       resolve();
//     } else {
//       reject(new Error(`ESP NAM transfer rejected: cmd=0x${cmdOrOk.toString(16)}, status=${status}`));
//     }
//   },

//   async _waitForAck(expectedCmd, expectedIndex = null, timeoutMs = ACK_TIMEOUT) {
//     return new Promise((resolve, reject) => {
//       this._pendingAck = { expectedCmd, expectedIndex, resolve, reject };
//       setTimeout(() => {
//         if (this._pendingAck && this._pendingAck.resolve === resolve) {
//           this._pendingAck = null;
//           const suffix = expectedIndex !== null ? ` index=${expectedIndex}` : '';
//           reject(new Error(`ACK timeout for cmd=0x${expectedCmd.toString(16)}${suffix}`));
//         }
//       }, timeoutMs);
//     });
//   },

//   // ── UI Integration ──────────────────────────────────────────
//   init(options = {}) {
//     this._options = options;
//     this._injectStyle();
//     this._patchControls();

//     // Check for OAuth callback
//     const params = new URLSearchParams(window.location.search);
//     if (params.get('code') || params.get('error') || params.get('canceled')) {
//       this.handleCallback(params, 
//         (p, m) => this._updateUIProgress(p, m), 
//         (ok, msg, d) => this._handleDone(ok, msg, d)
//       );
//     }

//     this._refreshAuthUI();
//     if (this.isAuthed()) this._doSearch(1);
//   },

//   _injectStyle() {
//     if (document.getElementById('nam-loader-style')) return;
//     const style = document.createElement('style');
//     style.id = 'nam-loader-style';
//     style.textContent = `
//       .nam-v3-card { padding: 12px; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; background: rgba(0,0,0,.2); }
//       .nam-v3-card-title { font-weight: 800; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
//       .nam-v3-meta { color: #aaa; font-size: 11px; margin-bottom: 10px; }
//       .nam-card--loading { opacity: 0.5; pointer-events: none; }
//       .nam-progress-panel {
//         position: fixed !important;
//         top: 50% !important;
//         left: 50% !important;
//         transform: translate(-50%, -50%) !important;
//         z-index: 10001 !important;
//         width: 85% !important;
//         max-width: 320px !important;
//         background: var(--color-bg-elevated, #151515) !important;
//         border: 2px solid var(--color-accent, #0af) !important;
//         border-radius: 16px !important;
//         padding: 24px !important;
//         box-shadow: 0 0 0 5000px rgba(0,0,0,0.7), 0 20px 60px rgba(0,0,0,0.8) !important;
//       }
//       .nam-success-panel { margin-top: 12px; padding: 12px; border: 1px solid rgba(0, 255, 160, 0.3); border-radius: 12px; background: rgba(0, 160, 100, 0.1); }
//       .nam-success-details { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 11px; }
//     `;
//     document.head.appendChild(style);
//   },

//   _patchControls() {
//     const $ = (id) => document.getElementById(id);
//     const on = (id, ev, fn) => {
//       const el = $(id);
//       if (el) el.addEventListener(ev, fn);
//     };

//     on('btnNamLogin', 'click', (e) => { e.preventDefault(); this.startLogin(); });
//     //on('btnNamBrowseT3K', 'click', (e) => { e.preventDefault(); this._doSearch(1); });
//     on('btnNamBrowseT3K', 'click', (e) => { e.preventDefault(); this.startSelect();  });
//     on('btnNamSearch', 'click', (e) => { e.preventDefault(); this._doSearch(1); });
//     on('namSearch', 'keydown', (e) => { if (e.key === 'Enter') this._doSearch(1); });
//     on('namSort', 'change', () => this._doSearch(1));
//     on('btnNamPrev', 'click', () => this._doSearch(Math.max(1, this._state.page - 1)));
//     on('btnNamNext', 'click', () => this._doSearch(this._state.page + 1));
//     on('btnNamEject', 'click', (e) => {
//       e.preventDefault();
//       BLEService.send(Protocol.createNamEject());
//       this._updateDeviceName(null);
//       if (this._options.onStatus) this._options.onStatus('NAM model unloaded');
//       this._hideSuccess();
//     });

//     on('namFileInput', 'change', (e) => {
//       const file = e.target.files?.[0];
//       if (!file) return;
//       const nameEl = $('namFileName');
//       if (nameEl) nameEl.textContent = file.name;
//       if (!BLEService.isConnected) { alert('Connect BLE first'); return; }
//       this.loadFromFile(file, (p, m) => this._updateUIProgress(p, m), (ok, msg, d) => this._handleDone(ok, msg, d));
//     });
//   },

//   async _doSearch(page = 1) {
//     if (!this.isAuthed()) {
//       console.log('[NAM] Not authenticated, starting login...');
//       await this.startLogin();
//       return;
//     }
//     this._state.page = page;
//     this._state.query = document.getElementById('namSearch')?.value || '';
//     const sort = document.getElementById('namSort')?.value || 'downloads-all-time';

//     const grid = document.getElementById('namGrid');
//     if (grid) grid.innerHTML = '<div class="nam-placeholder">Searching TONE3000…</div>';

//     try {
//       const data = await this.search(this._state.query, page, sort);
//       const tones = normalizeModelsPayload(data);
//       this._state.total = data.total || tones.length;
      
//       this._renderGrid(tones);
//       this._updatePagination(Math.ceil(this._state.total / 20));
      
//       const countEl = document.getElementById('namResultCount');
//       if (countEl) countEl.textContent = `${this._state.total.toLocaleString()} models`;
//     } catch (err) {
//       if (err.message === 'NOT_AUTHED') {
//         console.log('[NAM] Session expired, re-authenticating...');
//         await this.startLogin();
//         return;
//       }
//       if (grid) grid.innerHTML = `<div class="nam-placeholder">Error: ${err.message}</div>`;
//     }
//   },

//   _renderGrid(tones) {
//     const grid = document.getElementById('namGrid');
//     if (!grid) return;
//     grid.innerHTML = '';

//     if (!tones.length) {
//       grid.innerHTML = '<div class="nam-placeholder">No models found</div>';
//       return;
//     }

//     tones.forEach(tone => {
//       const card = document.createElement('div');
//       card.className = 'nam-v3-card';
//       const author = tone.user?.username || tone.author_username || '';
//       const dl = (tone.downloads || tone.download_count || 0).toLocaleString();
//       card.innerHTML = `
//         <div class="nam-v3-card-title">${tone.title || tone.name || 'Unnamed'}</div>
//         <div class="nam-v3-meta">@${author} · ⬇ ${dl}</div>
//         <button class="btn-nam-action" style="width:100%">Send to Device</button>
//       `;
//       card.querySelector('button').addEventListener('click', async () => {
//         if (!BLEService.isConnected) { alert('Connect BLE first'); return; }
//         card.classList.add('nam-card--loading');
//         await this.sendTone(tone.id, tone.name, (p, m) => this._updateUIProgress(p, m), (ok, msg, d) => {
//           this._handleDone(ok, msg, d);
//           card.classList.remove('nam-card--loading');
//         });
//       });
//       grid.appendChild(card);
//     });
//   },

//   _updatePagination(total) {
//     const pag = document.getElementById('namPagination');
//     if (pag) pag.style.display = total > 1 ? 'flex' : 'none';
//     const lbl = document.getElementById('namPageLabel');
//     if (lbl) lbl.textContent = `Page ${this._state.page} / ${total}`;
//   },

//   _updateUIProgress(pct, msg) {
//     const panel = document.getElementById('namProgressPanel');
//     const bar = document.getElementById('namProgressBar');
//     const msgEl = document.getElementById('namProgressMsg');
//     if (panel) panel.style.display = 'block';
//     if (bar) bar.style.width = pct + '%';
//     if (msgEl) msgEl.textContent = msg;
//     if (this._options.onProgress) this._options.onProgress(pct, msg);
//     if (pct >= 100) setTimeout(() => { if (panel) panel.style.display = 'none'; }, 1500);
//   },

//   _handleDone(ok, msg, details) {
//     this._updateUIProgress(ok ? 100 : 0, ok ? `✓ ${msg}` : `✗ ${msg}`);
//     if (ok && details && details !== 'logged_in') {
//       this._updateDeviceName(details.name);
//       this._showSuccess(details);
//     }
//     if (ok && msg === 'logged_in') this._doSearch(1);
//     this._refreshAuthUI();
//   },

//   _updateDeviceName(name) {
//     const el = document.getElementById('namDeviceName');
//     if (el) el.textContent = name || '—';
//   },

//   _refreshAuthUI() {
//     const btn = document.getElementById('btnNamLogin');
//     if (btn) {
//       const authed = this.isAuthed();
//       btn.textContent = authed ? '✓ Signed in' : 'Sign in to TONE3000';
//       btn.disabled = authed;
//     }
//   },

//   _showSuccess(details) {
//     let panel = document.getElementById('namSuccessPanel');
//     if (!panel) {
//       panel = document.createElement('div');
//       panel.id = 'namSuccessPanel';
//       panel.className = 'nam-success-panel';
//       document.getElementById('namProgressPanel')?.insertAdjacentElement('afterend', panel);
//     }
//     panel.style.display = 'block';
//     panel.innerHTML = `
//       <strong>✓ ${details.name} loaded</strong>
//       <div class="nam-success-details">
//         <span>Size: ${details.sizeKB}KB</span>
//         <span>CRC: ${details.crc32}</span>
//       </div>
//     `;
//   },

//   _hideSuccess() {
//     const panel = document.getElementById('namSuccessPanel');
//     if (panel) panel.style.display = 'none';
//   },

//   async _waitForUserAfterFallbackDownload(name) {
//     return new Promise((resolve) => {
//       const overlay = document.createElement('div');
//       overlay.style.cssText = [
//         'position:fixed',
//         'inset:0',
//         'z-index:999999',
//         'display:flex',
//         'align-items:center',
//         'justify-content:center',
//         'background:rgba(0,0,0,0.62)',
//         'backdrop-filter:blur(3px)'
//       ].join(';');

//       const box = document.createElement('div');
//       box.style.cssText = [
//         'max-width:420px',
//         'padding:18px',
//         'border-radius:14px',
//         'background:#151515',
//         'color:#fff',
//         'box-shadow:0 20px 70px rgba(0,0,0,0.45)',
//         'font-family:system-ui,-apple-system,Segoe UI,sans-serif'
//       ].join(';');

//       box.innerHTML = `
//         <div style="font-weight:800;font-size:16px;margin-bottom:8px">Save before transfer</div>
//         <div style="font-size:13px;line-height:1.45;color:#ddd;margin-bottom:14px">
//           The browser download/save dialog was opened for:<br>
//           <strong>${sanitizeDownloadName(name)}</strong><br><br>
//           Finish saving the file first, then start the BLE transfer.
//         </div>
//         <button type="button" style="width:100%;padding:10px 12px;border:0;border-radius:10px;font-weight:800;cursor:pointer">
//           Start BLE transfer
//         </button>
//       `;

//       overlay.appendChild(box);
//       document.body.appendChild(overlay);
//       box.querySelector('button').addEventListener('click', () => {
//         overlay.remove();
//         resolve();
//       }, { once: true });
//     });
//   },

//   async _saveBlobBeforeTransfer(blob, name, onProgress) {
//     const safeName = sanitizeDownloadName(name);
//     onProgress(40, `Saving ${safeName} locally…`);

//     // Best path: File System Access API. This actually waits until the file is
//     // written and closed before BLE chunking starts, so the save dialog cannot
//     // interrupt the transfer.
//     if (window.showSaveFilePicker) {
//       try {
//         const handle = await window.showSaveFilePicker({
//           suggestedName: safeName,
//           types: [{
//             description: 'NAM model',
//             accept: { 'application/octet-stream': ['.nam'] },
//           }],
//         });
//         const writable = await handle.createWritable();
//         await writable.write(blob);
//         await writable.close();
//         onProgress(41, 'Saved locally. Starting BLE transfer…');
//         return;
//       } catch (err) {
//         if (err && err.name === 'AbortError') {
//           throw new Error('Save canceled');
//         }
//         console.warn('[NAM] showSaveFilePicker failed; falling back to browser download:', err);
//       }
//     }

//     // Fallback path: standard browser download. Browsers do not expose an event
//     // for "save dialog completed", so require an explicit user click before
//     // opening the BLE chunk stream.
//     saveBlobWithAnchor(blob, safeName);
//     onProgress(41, 'Finish the save dialog, then start BLE transfer…');
//     await this._waitForUserAfterFallbackDownload(safeName);
//   },

//   async startLogin() {
//     const { verifier, challenge } = await generatePKCE();
//     const state = crypto.randomUUID();

//     sessionStorage.setItem('t3k_verifier', verifier);
//     sessionStorage.setItem('t3k_state', state);

//     const params = new URLSearchParams({
//       client_id: T3K_CLIENT_ID,
//       redirect_uri: REDIRECT_URI,
//       response_type: 'code',
//       code_challenge: challenge,
//       code_challenge_method: 'S256',
//       state,
//     });

//     window.location.href = `${T3K_BASE}/oauth/authorize?${params}`;
//   },

//   async startSelect() {
//     const { verifier, challenge } = await generatePKCE();
//     const state = crypto.randomUUID();

//     sessionStorage.setItem('t3k_verifier', verifier);
//     sessionStorage.setItem('t3k_state', state);

//     const params = new URLSearchParams({
//       client_id: T3K_CLIENT_ID,
//       redirect_uri: REDIRECT_URI,
//       response_type: 'code',
//       code_challenge: challenge,
//       code_challenge_method: 'S256',
//       state,
//       prompt: 'select_tone',
//       platform: 'nam',
//       architecture: '2',
//       gears: 'amp_full-rig',
//       menubar: 'false',
//     });

//     window.location.href = `${T3K_BASE}/oauth/authorize?${params}`;
//   },

//   async handleCallback(searchParams, onProgress, onDone) {
//     const code = searchParams.get('code');
//     const state = searchParams.get('state');
//     const toneId = searchParams.get('tone_id');
//     const error = searchParams.get('error');
//     const canceled = searchParams.get('canceled') === 'true';

//     if (!code && !error && !canceled) return false;

//     window.history.replaceState({}, '', window.location.pathname);

//     if (canceled) {
//       onDone(false, 'Canceled');
//       return true;
//     }

//     if (error) {
//       onDone(false, `Auth error: ${error}`);
//       return true;
//     }

//     if (state !== sessionStorage.getItem('t3k_state')) {
//       onDone(false, 'State mismatch');
//       return true;
//     }

//     onProgress(5, 'Signing in…');

//     try {
//       const res = await fetch(`${T3K_BASE}/oauth/token`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
//         body: new URLSearchParams({
//           grant_type: 'authorization_code',
//           code,
//           code_verifier: sessionStorage.getItem('t3k_verifier') || '',
//           redirect_uri: REDIRECT_URI,
//           client_id: T3K_CLIENT_ID,
//         }),
//       });

//       if (!res.ok) {
//         throw new Error(`Token exchange ${res.status}: ${await res.text()}`);
//       }

//       const { access_token, refresh_token, expires_in } = await res.json();
//       T.save(access_token, refresh_token, expires_in);

//       if (toneId) {
//         onProgress(8, `Selected TONE3000 tone #${toneId}`);
//         await this._fetchAndSend(toneId, onProgress, onDone);
//       } else {
//         onDone(true, 'logged_in');
//       }
//     } catch (err) {
//       onDone(false, err.message);
//     }

//     return true;
//   },

//   async search(query = '', page = 1, sort = 'downloads-all-time') {
//     const token = await getToken();

//     if (!token) {
//       throw new Error('NOT_AUTHED');
//     }

//     const params = new URLSearchParams({
//       page,
//       page_size: 20,
//       sort,
//       platform: 'nam',
//       architecture: '2',
//     });

//     if (query) params.set('query', query);

//     const res = await fetch(`${T3K_BASE}/tones/search?${params}`, {
//       headers: {
//         Authorization: `Bearer ${token}`,
//       },
//     });

//     if (res.status === 401) {
//       T.clear();
//       throw new Error('NOT_AUTHED');
//     }

//     if (!res.ok) {
//       throw new Error(`Search ${res.status}: ${await res.text()}`);
//     }

//     return res.json();
//   },

//   async _fetchToneName(toneId, token) {
//     let name = `tone_${toneId}.nam`;

//     try {
//       const toneRes = await fetch(
//         `${T3K_BASE}/tones/${encodeURIComponent(toneId)}?architecture=2`,
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//           },
//         }
//       );

//       if (toneRes.ok) {
//         const tone = await toneRes.json();
//         name = (tone.name || name).replace(/\.nam$/i, '') + '.nam';
//       }
//     } catch {
//       // Tone name is optional.
//     }

//     return name;
//   },

//   async _fetchAndSend(toneId, onProgress, onDone) {
//     const token = await getToken();

//     if (!token) {
//       onDone(false, 'Not authenticated');
//       return;
//     }

//     onProgress(12, 'Fetching model list…');

//     const modelsRes = await fetch(
//       `${T3K_BASE}/models?tone_id=${encodeURIComponent(toneId)}&architecture=2&page_size=100`,
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//       }
//     );

//     if (!modelsRes.ok) {
//       throw new Error(`Models fetch ${modelsRes.status}: ${await modelsRes.text()}`);
//     }

//     const modelsPayload = await modelsRes.json();
//     const models = normalizeModelsPayload(modelsPayload);

//     const fallbackToneName = await this._fetchToneName(toneId, token);
//     const selectedModel = pickBestNamModel(models);

//     if (!selectedModel) {
//       const available = models.map(m =>
//         `id=${m?.id ?? '?'} arch=${m?.architecture_version ?? m?.architecture ?? '?'} size=${m?.size ?? '?'} url=${getModelUrl(m) ? 'yes' : 'no'}`
//       ).join(' | ') || 'none';
//       throw new Error(`No downloadable A2 model found. Available: ${available}`);
//     }

//     if (String(selectedModel?.size || '').toLowerCase() !== 'lite') {
//       throw new Error(
//         `A2 model found, but it is size=${selectedModel.size}. Device expects A2-lite ${NAM_A2_WEIGHT_COUNT} weights.`
//       );
//     }

//     const selectedUrl = getModelUrl(selectedModel);
//     const name = makeModelFileName(toneId, selectedModel, fallbackToneName);

//     onProgress(14, `A2 lite model found: ${name}`);
//     await this._downloadAndSend(selectedUrl, name, token, onProgress, onDone);
//   },

//   async sendTone(toneId, fallbackName, onProgress, onDone) {
//     try {
//       await this._fetchAndSend(toneId, onProgress, onDone);
//     } catch (err) {
//       onDone(false, err.message);
//     }
//   },

//   async loadFromFile(file, onProgress, onDone) {
//     try {
//       onProgress(2, `Reading ${file.name}…`);

//       const buffer = await file.arrayBuffer();

//       await this._sendBuffer(
//         buffer,
//         file.name,
//         onProgress,
//         onDone,
//         'Local file'
//       );
//     } catch (err) {
//       onDone(false, err.message);
//     }
//   },

//   async _downloadAndSend(url, name, token, onProgress, onDone) {
//     onProgress(18, `Downloading ${name}…`);

//     const headers = token
//       ? {
//           Authorization: `Bearer ${token}`,
//         }
//       : {};

//     const res = await fetch(url, { headers });

//     if (!res.ok) {
//       throw new Error(`Download ${res.status}: ${await res.text()}`);
//     }

//     const total = parseInt(res.headers.get('content-length') || '0', 10);
//     const reader = res.body.getReader();

//     const chunks = [];
//     let loaded = 0;

//     for (;;) {
//       const { done, value } = await reader.read();

//       if (done) break;

//       chunks.push(value);
//       loaded += value.length;

//       if (total) {
//         onProgress(
//           18 + Math.round((loaded / total) * 22),
//           `Downloading… ${Math.round(loaded / 1024)}KB`
//         );
//       } else {
//         onProgress(
//           22,
//           `Downloading… ${Math.round(loaded / 1024)}KB`
//         );
//       }
//     }

//     const blob = new Blob(chunks, { type: 'application/octet-stream' });

//     // Save/download must complete before BLE chunking starts. A native save
//     // dialog can pause the page and otherwise interrupt the chunk/ACK loop.
//     await this._saveBlobBeforeTransfer(blob, name, onProgress);

//     const buffer = await blob.arrayBuffer();
//     await this._sendBuffer(buffer, name, onProgress, onDone, 'TONE3000');
//   },

//   async _sendBuffer(buffer, name, onProgress, onDone, source = 'NAM') {
//     onProgress(40, 'Parsing NAM weights…');

//     const parsed = parseNamWeightsToFloat32Bytes(buffer);
//     const bytes = parsed.bytes;                    // raw little-endian float32 weights only
//     const total = bytes.length;                    // expected ESP byte count = weightCount * 4
//     const weightCount = parsed.weightCount;
//     const csum = crc32(bytes.buffer);              // CRC over weight bytes only
//     const nchunks = Math.ceil(total / CHUNK_SIZE);

//     onProgress(
//       42,
//       `Transferring ${weightCount} weights (${Math.round(total / 1024)}KB)…`
//     );

//     let ackWait = this._waitForAck(Protocol.CMD.NAM_HEADER_ACK);
//     await BLEService.send(Protocol.createNamStart(weightCount, csum, name));
//     await ackWait;

//     for (let i = 0; i < nchunks; i++) {
//       const slice = bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

//       // Arm ACK before the write, then await the write. This avoids losing a
//       // fast ESP notification and keeps the browser BLE queue flow-controlled.
//       ackWait = this._waitForAck(Protocol.CMD.NAM_CHUNK_ACK, i);
//       await BLEService.send(Protocol.createNamChunk(i, slice));
//       await ackWait;

//       onProgress(
//         42 + Math.round(((i + 1) / nchunks) * 50),
//         `Weights chunk ${i + 1}/${nchunks}`
//       );

//       await sleep(8);
//     }

//     ackWait = this._waitForAck(Protocol.CMD.NAM_DONE_ACK);
//     await BLEService.send(Protocol.createNamEnd());
//     onProgress(94, 'Waiting for device CRC…');
//     await ackWait;

//     const details = makeTransferDetails(
//       name,
//       total,
//       csum,
//       nchunks,
//       source,
//       weightCount,
//       buffer.byteLength
//     );

//     emitSuccess(details);

//     onProgress(100, `✓ ${details.name} loaded (${weightCount} weights)`);
//     onDone(true, details.name, details);
//   },
// };


/**
 * NamLoader.js — TONE3000 NAM browser + BLE transfer
 * Adds download/transfer success details via onDone(..., details) and a DOM event:
 * window.dispatchEvent(new CustomEvent('nam-transfer-success', { detail: details }))
 */

import { BLEService } from './services/BLEService.js';
import { Protocol } from './services/Protocol.js';

const T3K_CLIENT_ID = 't3k_pub_UdyZ5sYtaceVAFXOLFwGtuLs4QvwQeLe';
const T3K_BASE = 'https://www.tone3000.com/api/v1';
const REDIRECT_URI = window.location.origin + window.location.pathname;

const CHUNK_SIZE = 200; // bytes of raw float32 weight data per BLE chunk
const ACK_TIMEOUT = 20000;

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

function sanitizeDownloadName(name) {
  return String(name || 'model.nam')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\x00/g, '')
    .trim() || 'model.nam';
}

function saveBlobWithAnchor(blob, name) {
  const saveUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = saveUrl;
  a.download = sanitizeDownloadName(name);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Keep the object URL alive briefly; some browsers start the transfer
  // asynchronously after click() returns.
  setTimeout(() => URL.revokeObjectURL(saveUrl), 5000);
}


const NAM_A2_WEIGHT_COUNT = 1871;

function parseNamWeightsToFloat32Bytes(buffer) {
  const text = new TextDecoder('utf-8').decode(buffer);
  let root;
  try {
    root = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid NAM file: JSON parse failed — ${e.message}`);
  }

  const arch = (root.architecture || '').toLowerCase();
  let weights;

  if (arch === 'slimmablecontainer') {
    const submodels = root?.config?.submodels;
    if (!Array.isArray(submodels) || submodels.length === 0) {
      throw new Error('Invalid NAM file: SlimmableContainer has no submodels');
    }
    // Find the submodel whose weights array is exactly the A2 lite size.
    const match = submodels.find(s => Array.isArray(s?.model?.weights) && s.model.weights.length === NAM_A2_WEIGHT_COUNT);
    if (!match) {
      const counts = submodels.map(s => s?.model?.weights?.length ?? 'n/a').join(', ');
      throw new Error(`No A2 lite submodel (${NAM_A2_WEIGHT_COUNT} weights) found. Submodel weight counts: ${counts}`);
    }
    weights = match.model.weights;
  } else if (arch === 'wavenet') {
    weights = root?.weights;
    if (!Array.isArray(weights)) {
      throw new Error('Invalid NAM file: WaveNet weights array not found');
    }
  } else {
    throw new Error(`Unsupported NAM architecture: ${root.architecture || '(missing)'}`);
  }

  if (weights.length !== NAM_A2_WEIGHT_COUNT) {
    throw new Error(`NAM weight count mismatch: expected ${NAM_A2_WEIGHT_COUNT}, got ${weights.length}`);
  }

  const out = new ArrayBuffer(weights.length * 4);
  const view = new DataView(out);
  for (let i = 0; i < weights.length; i++) {
    const v = Number(weights[i]);
    if (!Number.isFinite(v)) throw new Error(`Non-numeric weight at index ${i}`);
    view.setFloat32(i * 4, v, true); // little-endian float32
  }

  return {
    weightCount: weights.length,
    byteLength: out.byteLength,
    bytes: new Uint8Array(out),
  };
}

function makeTransferDetails(name, totalSize, checksum, totalChunks, source = 'NAM', weightCount = 0, originalSize = 0) {
  const safeName = name || 'model.nam';

  return {
    name: safeName,
    fileName: safeName,
    source,
    sizeBytes: totalSize,
    originalSizeBytes: originalSize || totalSize,
    weightCount,
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
  const candidates = (models || []).filter(m => isNamModel(m) && !!getModelUrl(m));

  // Primary: architecture_version === '2'  (T3K Model field; A2 models are excluded
  // from the /models response unless &architecture=2 is passed, so this is belt-and-braces)
  const byArch = candidates.find(m => String(m?.architecture_version ?? '').trim() === '2');
  if (byArch) return byArch;

  // Legacy fallback: size === 'lite' (pre-architecture_version field era)
  const bySize = candidates.find(m => (m?.size || '').toLowerCase() === 'lite');
  if (bySize) return bySize;

  return null;
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
  _state: {
    page: 1,
    total: 0,
    query: '',
    sort: 'downloads-all-time',
  },
  _options: {},

  isAuthed() { return !!T.get(); },

  handleAck(cmdOrOk, status = 0, index = null) {
    if (!this._pendingAck) return;

    // Back-compat: older callers passed true/false only.
    if (typeof cmdOrOk === 'boolean') {
      const { resolve, reject } = this._pendingAck;
      this._pendingAck = null;
      cmdOrOk ? resolve() : reject(new Error('ESP NAM transfer rejected'));
      return;
    }

    const { expectedCmd, expectedIndex, resolve, reject } = this._pendingAck;

    // Ignore stale/out-of-phase ACKs. This prevents a late chunk ACK from
    // accidentally satisfying the header or final transfer wait.
    if (cmdOrOk !== expectedCmd) return;
    if (expectedIndex !== null && index !== expectedIndex) return;

    this._pendingAck = null;

    if (status === 0) {
      resolve();
    } else {
      reject(new Error(`ESP NAM transfer rejected: cmd=0x${cmdOrOk.toString(16)}, status=${status}`));
    }
  },

  async _waitForAck(expectedCmd, expectedIndex = null, timeoutMs = ACK_TIMEOUT) {
    return new Promise((resolve, reject) => {
      this._pendingAck = { expectedCmd, expectedIndex, resolve, reject };
      setTimeout(() => {
        if (this._pendingAck && this._pendingAck.resolve === resolve) {
          this._pendingAck = null;
          const suffix = expectedIndex !== null ? ` index=${expectedIndex}` : '';
          reject(new Error(`ACK timeout for cmd=0x${expectedCmd.toString(16)}${suffix}`));
        }
      }, timeoutMs);
    });
  },

  // ── UI Integration ──────────────────────────────────────────
  init(options = {}) {
    this._options = options;
    this._injectStyle();
    this._patchControls();

    // Check for OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('code') || params.get('error') || params.get('canceled')) {
      this.handleCallback(params, 
        (p, m) => this._updateUIProgress(p, m), 
        (ok, msg, d) => this._handleDone(ok, msg, d)
      );
    }

    this._refreshAuthUI();
    if (this.isAuthed()) this._doSearch(1);
  },

  _injectStyle() {
    if (document.getElementById('nam-loader-style')) return;
    const style = document.createElement('style');
    style.id = 'nam-loader-style';
    style.textContent = `
      .nam-v3-card { padding: 12px; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; background: rgba(0,0,0,.2); }
      .nam-v3-card-title { font-weight: 800; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nam-v3-meta { color: #aaa; font-size: 11px; margin-bottom: 10px; }
      .nam-card--loading { opacity: 0.5; pointer-events: none; }
      .nam-progress-panel {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        z-index: 10001 !important;
        width: 85% !important;
        max-width: 320px !important;
        background: var(--color-bg-elevated, #151515) !important;
        border: 2px solid var(--color-accent, #0af) !important;
        border-radius: 16px !important;
        padding: 24px !important;
        box-shadow: 0 0 0 5000px rgba(0,0,0,0.7), 0 20px 60px rgba(0,0,0,0.8) !important;
      }
      .nam-success-panel { margin-top: 12px; padding: 12px; border: 1px solid rgba(0, 255, 160, 0.3); border-radius: 12px; background: rgba(0, 160, 100, 0.1); }
      .nam-success-details { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 11px; }
    `;
    document.head.appendChild(style);
  },

  _patchControls() {
    const $ = (id) => document.getElementById(id);
    const on = (id, ev, fn) => {
      const el = $(id);
      if (el) el.addEventListener(ev, fn);
    };

    on('btnNamLogin', 'click', (e) => { e.preventDefault(); this.startLogin(); });
    //on('btnNamBrowseT3K', 'click', (e) => { e.preventDefault(); this._doSearch(1); });
    on('btnNamBrowseT3K', 'click', (e) => { e.preventDefault(); this.startSelect();  });
    on('btnNamSearch', 'click', (e) => { e.preventDefault(); this._doSearch(1); });
    on('namSearch', 'keydown', (e) => { if (e.key === 'Enter') this._doSearch(1); });
    on('namSort', 'change', () => this._doSearch(1));
    on('btnNamPrev', 'click', () => this._doSearch(Math.max(1, this._state.page - 1)));
    on('btnNamNext', 'click', () => this._doSearch(this._state.page + 1));
    on('btnNamEject', 'click', (e) => {
      e.preventDefault();
      BLEService.send(Protocol.createNamEject());
      this._updateDeviceName(null);
      if (this._options.onStatus) this._options.onStatus('NAM model unloaded');
      this._hideSuccess();
    });

    on('namFileInput', 'change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const nameEl = $('namFileName');
      if (nameEl) nameEl.textContent = file.name;
      if (!BLEService.isConnected) { alert('Connect BLE first'); return; }
      this.loadFromFile(file, (p, m) => this._updateUIProgress(p, m), (ok, msg, d) => this._handleDone(ok, msg, d));
    });
  },

  async _doSearch(page = 1) {
    if (!this.isAuthed()) {
      console.log('[NAM] Not authenticated, starting login...');
      await this.startLogin();
      return;
    }
    this._state.page = page;
    this._state.query = document.getElementById('namSearch')?.value || '';
    const sort = document.getElementById('namSort')?.value || 'downloads-all-time';

    const grid = document.getElementById('namGrid');
    if (grid) grid.innerHTML = '<div class="nam-placeholder">Searching TONE3000…</div>';

    try {
      const data = await this.search(this._state.query, page, sort);
      const tones = normalizeModelsPayload(data);
      this._state.total = data.total || tones.length;
      
      this._renderGrid(tones);
      this._updatePagination(Math.ceil(this._state.total / 20));
      
      const countEl = document.getElementById('namResultCount');
      if (countEl) countEl.textContent = `${this._state.total.toLocaleString()} models`;
    } catch (err) {
      if (err.message === 'NOT_AUTHED') {
        console.log('[NAM] Session expired, re-authenticating...');
        await this.startLogin();
        return;
      }
      if (grid) grid.innerHTML = `<div class="nam-placeholder">Error: ${err.message}</div>`;
    }
  },

  _renderGrid(tones) {
    const grid = document.getElementById('namGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!tones.length) {
      grid.innerHTML = '<div class="nam-placeholder">No models found</div>';
      return;
    }

    tones.forEach(tone => {
      const card = document.createElement('div');
      card.className = 'nam-v3-card';
      const author = tone.user?.username || tone.author_username || '';
      const dl = (tone.downloads || tone.download_count || 0).toLocaleString();
      card.innerHTML = `
        <div class="nam-v3-card-title">${tone.title || tone.name || 'Unnamed'}</div>
        <div class="nam-v3-meta">@${author} · ⬇ ${dl}</div>
        <button class="btn-nam-action" style="width:100%">Send to Device</button>
      `;
      card.querySelector('button').addEventListener('click', async () => {
        if (!BLEService.isConnected) { alert('Connect BLE first'); return; }
        card.classList.add('nam-card--loading');
        await this.sendTone(tone.id, tone.name, (p, m) => this._updateUIProgress(p, m), (ok, msg, d) => {
          this._handleDone(ok, msg, d);
          card.classList.remove('nam-card--loading');
        });
      });
      grid.appendChild(card);
    });
  },

  _updatePagination(total) {
    const pag = document.getElementById('namPagination');
    if (pag) pag.style.display = total > 1 ? 'flex' : 'none';
    const lbl = document.getElementById('namPageLabel');
    if (lbl) lbl.textContent = `Page ${this._state.page} / ${total}`;
  },

  _updateUIProgress(pct, msg) {
    const panel = document.getElementById('namProgressPanel');
    const bar = document.getElementById('namProgressBar');
    const msgEl = document.getElementById('namProgressMsg');
    if (panel) panel.style.display = 'block';
    if (bar) bar.style.width = pct + '%';
    if (msgEl) msgEl.textContent = msg;
    if (this._options.onProgress) this._options.onProgress(pct, msg);
    if (pct >= 100) setTimeout(() => { if (panel) panel.style.display = 'none'; }, 1500);
  },

  _handleDone(ok, msg, details) {
    this._updateUIProgress(ok ? 100 : 0, ok ? `✓ ${msg}` : `✗ ${msg}`);
    if (ok && details && details !== 'logged_in') {
      this._updateDeviceName(details.name);
      this._showSuccess(details);
    }
    if (ok && msg === 'logged_in') this._doSearch(1);
    this._refreshAuthUI();
  },

  _updateDeviceName(name) {
    const el = document.getElementById('namDeviceName');
    if (el) el.textContent = name || '—';
  },

  _refreshAuthUI() {
    const btn = document.getElementById('btnNamLogin');
    if (btn) {
      const authed = this.isAuthed();
      btn.textContent = authed ? '✓ Signed in' : 'Sign in to TONE3000';
      btn.disabled = authed;
    }
  },

  _showSuccess(details) {
    let panel = document.getElementById('namSuccessPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'namSuccessPanel';
      panel.className = 'nam-success-panel';
      document.getElementById('namProgressPanel')?.insertAdjacentElement('afterend', panel);
    }
    panel.style.display = 'block';
    panel.innerHTML = `
      <strong>✓ ${details.name} loaded</strong>
      <div class="nam-success-details">
        <span>Size: ${details.sizeKB}KB</span>
        <span>CRC: ${details.crc32}</span>
      </div>
    `;
  },

  _hideSuccess() {
    const panel = document.getElementById('namSuccessPanel');
    if (panel) panel.style.display = 'none';
  },

  async _waitForUserAfterFallbackDownload(name) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:999999',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'background:rgba(0,0,0,0.62)',
        'backdrop-filter:blur(3px)'
      ].join(';');

      const box = document.createElement('div');
      box.style.cssText = [
        'max-width:420px',
        'padding:18px',
        'border-radius:14px',
        'background:#151515',
        'color:#fff',
        'box-shadow:0 20px 70px rgba(0,0,0,0.45)',
        'font-family:system-ui,-apple-system,Segoe UI,sans-serif'
      ].join(';');

      box.innerHTML = `
        <div style="font-weight:800;font-size:16px;margin-bottom:8px">Save before transfer</div>
        <div style="font-size:13px;line-height:1.45;color:#ddd;margin-bottom:14px">
          The browser download/save dialog was opened for:<br>
          <strong>${sanitizeDownloadName(name)}</strong><br><br>
          Finish saving the file first, then start the BLE transfer.
        </div>
        <button type="button" style="width:100%;padding:10px 12px;border:0;border-radius:10px;font-weight:800;cursor:pointer">
          Start BLE transfer
        </button>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);
      box.querySelector('button').addEventListener('click', () => {
        overlay.remove();
        resolve();
      }, { once: true });
    });
  },

  async _saveBlobBeforeTransfer(blob, name, onProgress) {
    const safeName = sanitizeDownloadName(name);
    onProgress(40, `Saving ${safeName} locally…`);

    // Best path: File System Access API. This actually waits until the file is
    // written and closed before BLE chunking starts, so the save dialog cannot
    // interrupt the transfer.
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: safeName,
          types: [{
            description: 'NAM model',
            accept: { 'application/octet-stream': ['.nam'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        onProgress(41, 'Saved locally. Starting BLE transfer…');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') {
          throw new Error('Save canceled');
        }
        console.warn('[NAM] showSaveFilePicker failed; falling back to browser download:', err);
      }
    }

    // Fallback path: standard browser download. Browsers do not expose an event
    // for "save dialog completed", so require an explicit user click before
    // opening the BLE chunk stream.
    saveBlobWithAnchor(blob, safeName);
    onProgress(41, 'Finish the save dialog, then start BLE transfer…');
    await this._waitForUserAfterFallbackDownload(safeName);
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
      architecture: '2',
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

  async search(query = '', page = 1, sort = 'downloads-all-time') {
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
      `${T3K_BASE}/models?tone_id=${encodeURIComponent(toneId)}&architecture=2`,
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
      const sizes = models.map(m => m?.size || '?').join(', ') || 'none';
      throw new Error(`This tone has no A2 lite NAM model. Available sizes: ${sizes}`);
    }

    const selectedUrl = getModelUrl(selectedModel);
    const name = makeModelFileName(toneId, selectedModel, fallbackToneName);

    onProgress(14, `A2 lite model found: ${name}`);
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

    const blob = new Blob(chunks, { type: 'application/octet-stream' });

    // Save/download must complete before BLE chunking starts. A native save
    // dialog can pause the page and otherwise interrupt the chunk/ACK loop.
    await this._saveBlobBeforeTransfer(blob, name, onProgress);

    const buffer = await blob.arrayBuffer();
    await this._sendBuffer(buffer, name, onProgress, onDone, 'TONE3000');
  },

  async _sendBuffer(buffer, name, onProgress, onDone, source = 'NAM') {
    onProgress(40, 'Parsing NAM weights…');

    const parsed = parseNamWeightsToFloat32Bytes(buffer);
    const bytes = parsed.bytes;                    // raw little-endian float32 weights only
    const total = bytes.length;                    // expected ESP byte count = weightCount * 4
    const weightCount = parsed.weightCount;
    const csum = crc32(bytes.buffer);              // CRC over weight bytes only
    const nchunks = Math.ceil(total / CHUNK_SIZE);

    onProgress(
      42,
      `Transferring ${weightCount} weights (${Math.round(total / 1024)}KB)…`
    );

    let ackWait = this._waitForAck(Protocol.CMD.NAM_HEADER_ACK);
    await BLEService.send(Protocol.createNamStart(weightCount, csum, name));
    await ackWait;

    for (let i = 0; i < nchunks; i++) {
      const slice = bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

      // Arm ACK before the write, then await the write. This avoids losing a
      // fast ESP notification and keeps the browser BLE queue flow-controlled.
      ackWait = this._waitForAck(Protocol.CMD.NAM_CHUNK_ACK, i);
      await BLEService.send(Protocol.createNamChunk(i, slice));
      await ackWait;

      onProgress(
        42 + Math.round(((i + 1) / nchunks) * 50),
        `Weights chunk ${i + 1}/${nchunks}`
      );

      await sleep(8);
    }

    ackWait = this._waitForAck(Protocol.CMD.NAM_DONE_ACK);
    await BLEService.send(Protocol.createNamEnd());
    onProgress(94, 'Waiting for device CRC…');
    await ackWait;

    const details = makeTransferDetails(
      name,
      total,
      csum,
      nchunks,
      source,
      weightCount,
      buffer.byteLength
    );

    emitSuccess(details);

    onProgress(100, `✓ ${details.name} loaded (${weightCount} weights)`);
    onDone(true, details.name, details);
  },
};