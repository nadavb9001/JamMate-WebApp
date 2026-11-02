/* Easy Mode parameter popup compatibility layer.
   The existing View.setupEffectsGrid() calls window.showSoloEffect(title, idx)
   after app.selectEffect(idx). This file turns that callback into a modal editor
   by moving the existing #effectControls node into a floating popup, then moving
   it back to its original place on close. This preserves all event listeners,
   knob instances, dropdown handlers and protocol callbacks. */
(function () {
  let overlay = null;
  let shell = null;
  let titleEl = null;
  let bodyEl = null;
  let closeBtn = null;
  let originalParent = null;
  let originalNextSibling = null;

  function ensurePopup() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'easyEffectPopup';
    overlay.className = 'solo-effect-overlay easy-effect-popup';
    overlay.style.display = 'none';

    shell = document.createElement('div');
    shell.className = 'solo-effect-container easy-effect-shell';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'solo-effect-close-btn';
    closeBtn.setAttribute('aria-label', 'Close effect parameters');
    closeBtn.textContent = '×';

    titleEl = document.createElement('div');
    titleEl.className = 'solo-effect-title';

    bodyEl = document.createElement('div');
    bodyEl.className = 'easy-effect-popup-body';

    shell.append(closeBtn, titleEl, bodyEl);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);

    closeBtn.addEventListener('click', window.closeSoloEffect);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) window.closeSoloEffect();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && window.soloEffectOpen) window.closeSoloEffect();
    });
  }

  function rememberHome(node) {
    if (!originalParent) {
      originalParent = node.parentNode;
      originalNextSibling = node.nextSibling;
    }
  }

  function returnControlsHome() {
    const controls = document.getElementById('effectControls');
    if (!controls || !originalParent) return;
    if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
      originalParent.insertBefore(controls, originalNextSibling);
    } else {
      originalParent.appendChild(controls);
    }
  }

  window.showSoloEffect = function showSoloEffect(title) {
    ensurePopup();
    const controls = document.getElementById('effectControls');
    if (!controls) return;

    rememberHome(controls);
    titleEl.textContent = title || 'Effect Parameters';

    bodyEl.innerHTML = '';
    bodyEl.appendChild(controls);

    document.body.classList.add('easy-popup-open');
    overlay.style.display = 'flex';
    window.soloEffectOpen = true;

    // Ensure canvas-based controls settle after being moved into the modal.
    requestAnimationFrame(() => {
      const iir = window.app && window.app.iirDesigner;
      if (iir && typeof iir.draw === 'function') iir.draw();
      shell.focus && shell.focus();
    });
  };

  window.closeSoloEffect = function closeSoloEffect() {
    if (!overlay) return;
    returnControlsHome();
    overlay.style.display = 'none';
    document.body.classList.remove('easy-popup-open');
    window.soloEffectOpen = false;
  };

  window.soloEffectOpen = false;


  window.ensureJamMateEasyMode = function ensureJamMateEasyMode(enabled) {
    const tab = document.getElementById('effects-tab');
    const btn = document.getElementById('btnEasyMode');
    if (!tab) return;
    tab.classList.toggle('easy-mode', !!enabled);
    if (btn) btn.classList.toggle('active', !!enabled);
    if (!enabled && window.closeSoloEffect) window.closeSoloEffect();
  };

  document.addEventListener('DOMContentLoaded', () => {
    ensurePopup();
    const easy = document.getElementById('btnEasyMode');
    const tab = document.getElementById('effects-tab');
    if (tab) {
      const obs = new MutationObserver(() => {
        if (!tab.classList.contains('easy-mode')) window.closeSoloEffect();
      });
      obs.observe(tab, { attributes: true, attributeFilter: ['class'] });
    }
    if (easy) {
      easy.addEventListener('click', () => {
        requestAnimationFrame(() => {
          const tab = document.getElementById('effects-tab');
          if (tab && !tab.classList.contains('easy-mode')) window.closeSoloEffect();
        });
      });
    }
  });
})();

/* v7 responsive Easy Mode grid and wheel-to-horizontal-scroll for Regular Mode. */
(function () {
  function getEffectsTab() { return document.getElementById('effects-tab'); }
  function getGrid() { return document.getElementById('effectsGrid') || document.querySelector('#effects-tab .effects-grid'); }
  function getScroll() { return document.querySelector('#effects-tab .effects-scroll'); }

  function chooseGrid(count, width, height) {
    if (!count || width <= 0 || height <= 0) return { cols: 1, rows: Math.max(1, count || 1), font: 13, gap: 8 };
    const targetAspect = 1.58; // comfortable launch-pad rectangle: wide enough for labels, not too flat.
    let best = null;
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const gap = Math.max(6, Math.min(14, Math.round(Math.min(width, height) * 0.018)));
      const cellW = (width - gap * (cols - 1)) / cols;
      const cellH = (height - gap * (rows - 1)) / rows;
      if (cellW <= 0 || cellH <= 0) continue;
      const aspect = cellW / cellH;
      const area = cellW * cellH;
      const aspectPenalty = Math.abs(Math.log(aspect / targetAspect));
      const score = area - aspectPenalty * 3200 - Math.max(0, 92 - cellH) * 120 - Math.max(0, 112 - cellW) * 80;
      if (!best || score > best.score) best = { cols, rows, cellW, cellH, gap, score };
    }
    if (!best) return { cols: count, rows: 1, font: 12, gap: 8 };
    const font = Math.max(11, Math.min(22, Math.floor(Math.min(best.cellH * 0.20, best.cellW * 0.105))));
    return { cols: best.cols, rows: best.rows, font, gap: best.gap };
  }

  function layoutEasyGrid() {
    const tab = getEffectsTab();
    const grid = getGrid();
    const scroll = getScroll();
    if (!tab || !grid || !scroll || !tab.classList.contains('easy-mode')) return;
    const buttons = Array.from(grid.querySelectorAll('.effect-btn'));
    const rect = scroll.getBoundingClientRect();
    const styles = getComputedStyle(scroll);
    const width = rect.width - parseFloat(styles.paddingLeft || 0) - parseFloat(styles.paddingRight || 0);
    const height = rect.height - parseFloat(styles.paddingTop || 0) - parseFloat(styles.paddingBottom || 0);
    const spec = chooseGrid(buttons.length, width, height);
    grid.style.setProperty('--easy-cols', String(spec.cols));
    grid.style.setProperty('--easy-rows', String(spec.rows));
    grid.style.setProperty('--easy-gap', spec.gap + 'px');
    grid.style.setProperty('--easy-btn-font', spec.font + 'px');
  }

  function installResizeLayout() {
    const tab = getEffectsTab();
    const grid = getGrid();
    const scroll = getScroll();
    if (!tab || !grid || !scroll) return;
    const schedule = () => requestAnimationFrame(layoutEasyGrid);
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(schedule);
      ro.observe(scroll);
      ro.observe(grid);
    }
    const mo = new MutationObserver(schedule);
    mo.observe(tab, { attributes: true, attributeFilter: ['class'] });
    mo.observe(grid, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
  }

  function installHorizontalWheel() {
    const scroll = getScroll();
    const tab = getEffectsTab();
    if (!scroll || !tab || scroll.dataset.wheelHorizontalInstalled === '1') return;
    scroll.dataset.wheelHorizontalInstalled = '1';
    scroll.addEventListener('wheel', (e) => {
      if (!tab.classList.contains('active') || tab.classList.contains('easy-mode')) return;
      const canScroll = scroll.scrollWidth > scroll.clientWidth + 2;
      if (!canScroll) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!delta) return;
      e.preventDefault();
      scroll.scrollLeft += delta;
    }, { passive: false });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // app.init() creates/recreates the effect buttons, so install after initial layout and retry briefly.
    let tries = 0;
    const tick = () => {
      installHorizontalWheel();
      installResizeLayout();
      layoutEasyGrid();
      if (++tries < 16) setTimeout(tick, 80);
    };
    requestAnimationFrame(tick);
  });

  window.layoutJamMateEasyGrid = layoutEasyGrid;
})();
