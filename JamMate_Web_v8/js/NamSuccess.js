/**
 * NamSuccess.js — drop-in NAM download/transfer success card.
 * Add after your main app module script:
 * <script type="module" src="./js/NamSuccess.js"></script>
 */
const STYLE_ID = 'nam-success-dropin-style';
const PANEL_ID = 'namSuccessPanel';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .nam-success-panel {
      margin-top: 12px;
      padding: 12px;
      border: 1px solid rgba(0, 255, 160, 0.35);
      border-radius: 12px;
      background: rgba(0, 160, 100, 0.14);
      box-shadow: 0 0 18px rgba(0, 180, 120, 0.12);
    }
    .nam-success-head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .nam-success-icon {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--color-enabled, #18b26b);
      color: #fff;
      font-weight: 900;
      font-size: 20px;
      flex-shrink: 0;
    }
    .nam-success-title {
      font-weight: 800;
      color: var(--color-text-primary, #fff);
    }
    .nam-success-sub {
      font-size: 12px;
      color: var(--color-text-secondary, #aaa);
      margin-top: 2px;
    }
    .nam-success-details {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .nam-success-details div {
      background: rgba(0, 0, 0, 0.16);
      border: 1px solid var(--color-border, rgba(255,255,255,0.15));
      border-radius: 8px;
      padding: 8px;
      min-width: 0;
    }
    .nam-success-details span {
      display: block;
      font-size: 11px;
      color: var(--color-text-secondary, #aaa);
      margin-bottom: 3px;
    }
    .nam-success-details strong {
      display: block;
      font-size: 13px;
      color: var(--color-text-primary, #fff);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    body.light-theme .nam-success-details div {
      background: rgba(255, 255, 255, 0.55);
    }
    @media (max-width: 520px) {
      .nam-success-details { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);
}

function panelHtml() {
  return `
    <div class="nam-success-head">
      <span class="nam-success-icon">✓</span>
      <div>
        <div class="nam-success-title">NAM loaded successfully</div>
        <div id="namSuccessSub" class="nam-success-sub">Downloaded and transferred to JamMate</div>
      </div>
    </div>
    <div class="nam-success-details">
      <div><span>File</span><strong id="namSuccessName">—</strong></div>
      <div><span>Size</span><strong id="namSuccessSize">—</strong></div>
      <div><span>Chunks</span><strong id="namSuccessChunks">—</strong></div>
      <div><span>CRC32</span><strong id="namSuccessCrc">—</strong></div>
    </div>
  `;
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'nam-success-panel';
  panel.style.display = 'none';
  panel.innerHTML = panelHtml();

  const progressPanel = document.getElementById('namProgressPanel');
  if (progressPanel?.parentNode) {
    progressPanel.parentNode.insertBefore(panel, progressPanel.nextSibling);
    return panel;
  }

  const namDeviceName = document.getElementById('namDeviceName');
  const deviceBox = namDeviceName?.closest('.nam-loaded, .nam-device, .file-row, .setting-row, div');
  if (deviceBox?.parentNode) {
    deviceBox.parentNode.insertBefore(panel, deviceBox.nextSibling);
    return panel;
  }

  const namTab = document.getElementById('nam-tab');
  if (namTab) namTab.appendChild(panel);
  return panel;
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showSuccess(details = {}) {
  injectStyle();
  const panel = ensurePanel();
  if (!panel) return;

  setText('namSuccessName', details.name || details.fileName || 'model.nam');
  setText('namSuccessSize', formatBytes(details.sizeBytes));
  setText('namSuccessChunks', details.chunks ? Number(details.chunks).toLocaleString() : '—');
  setText('namSuccessCrc', details.crc32 ? `0x${details.crc32}` : '—');
  setText('namSuccessSub', `${details.source || 'NAM'} · downloaded and transferred to JamMate`);

  panel.style.display = 'block';
}

function hideSuccess() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.style.display = 'none';
}

function boot() {
  injectStyle();
  ensurePanel();

  window.addEventListener('nam-transfer-success', event => showSuccess(event.detail || {}));

  document.getElementById('btnNamEject')?.addEventListener('click', hideSuccess);

  try {
    const last = JSON.parse(sessionStorage.getItem('nam_last_success') || 'null');
    if (last?.name) showSuccess(last);
  } catch { /* ignore invalid storage */ }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
