/**
 * CustomSelect.js — replaces native <select> with a styled floating panel.
 *
 * Usage:
 *   upgradeSelects()           — upgrade all selects in document
 *   upgradeSelects(container)  — upgrade selects inside a specific element
 *
 * The native <select> stays in the DOM (hidden), so all existing
 * addEventListener('change') handlers and .value / .selectedIndex
 * reads continue to work without any changes in the rest of the app.
 */

// ── One panel open at a time ─────────────────────────────────────────────────
let _closeActive = null;
function closeAll() {
  if (_closeActive) { _closeActive(); _closeActive = null; }
}

// ─────────────────────────────────────────────────────────────────────────────
export function upgradeSelects(root = document) {
  const host = (root && root.querySelectorAll) ? root : document;
  host.querySelectorAll('select:not([data-cs-upgraded])').forEach(initCustomSelect);
}

// ─────────────────────────────────────────────────────────────────────────────
function initCustomSelect(select) {
  select.setAttribute('data-cs-upgraded', '1');

  // Hide the native select but keep it reachable via getElementById
  select.style.cssText =
    'position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;overflow:hidden;';

  // ── Wrapper (sits in the original place) ──────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'csel';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  // ── Trigger button ────────────────────────────────────────────────────────
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'csel-trigger';

  const labelEl = document.createElement('span');
  labelEl.className = 'csel-label';

  const arrowEl = document.createElement('span');
  arrowEl.className = 'csel-arrow';
  arrowEl.innerHTML =
    `<svg viewBox="0 0 10 6" width="10" height="6" fill="none">
       <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round"/>
     </svg>`;

  trigger.append(labelEl, arrowEl);
  wrapper.appendChild(trigger);

  // ── Panel (appended to <body> so it is never clipped) ────────────────────
  const panel = document.createElement('div');
  panel.className = 'csel-panel';
  document.body.appendChild(panel);

  // ── Label sync ────────────────────────────────────────────────────────────
  const syncLabel = () => {
    const opt = select.options[select.selectedIndex];
    labelEl.textContent = opt ? opt.text : '';
  };

  // ── Intercept programmatic .value / .selectedIndex setters ───────────────
  // This ensures the trigger label updates when code does: el.value = 'x'
  const proto = Object.getPrototypeOf(select);
  const vDesc = Object.getOwnPropertyDescriptor(proto, 'value');
  const iDesc = Object.getOwnPropertyDescriptor(proto, 'selectedIndex');

  Object.defineProperty(select, 'value', {
    get: ()  => vDesc.get.call(select),
    set: (v) => { vDesc.set.call(select, v); syncLabel(); },
    configurable: true,
  });
  Object.defineProperty(select, 'selectedIndex', {
    get: ()  => iDesc.get.call(select),
    set: (v) => { iDesc.set.call(select, v); syncLabel(); },
    configurable: true,
  });

  syncLabel();

  // ── Build panel items ─────────────────────────────────────────────────────
  const buildItems = () => {
    panel.innerHTML = '';
    Array.from(select.options).forEach((opt, i) => {
      const item = document.createElement('div');
      item.className = 'csel-item' + (i === select.selectedIndex ? ' csel-item--active' : '');
      item.textContent = opt.text;

      item.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // prevent trigger-blur before our handler fires
        select.selectedIndex = i; // triggers our setter → syncLabel
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close();
      });

      panel.appendChild(item);
    });
  };

  // ── Position the fixed panel under (or above) the trigger ────────────────
  const positionPanel = () => {
    const r      = trigger.getBoundingClientRect();
    const below  = window.innerHeight - r.bottom;
    const goUp   = below < 230 && r.top > below;

    panel.style.left  = r.left + 'px';
    panel.style.width = r.width + 'px';

    if (goUp) {
      panel.style.top    = '';
      panel.style.bottom = (window.innerHeight - r.top) + 'px';
      panel.classList.add('csel-panel--up');
    } else {
      panel.style.top    = r.bottom + 2 + 'px';
      panel.style.bottom = '';
      panel.classList.remove('csel-panel--up');
    }
  };

  // ── Open / Close ──────────────────────────────────────────────────────────
  let isOpen = false;

  const open = () => {
    closeAll();
    isOpen = true;
    _closeActive = close;
    buildItems();
    positionPanel();
    panel.classList.add('csel-panel--open');
    trigger.classList.add('csel-trigger--open');
    const active = panel.querySelector('.csel-item--active');
    if (active) requestAnimationFrame(() => active.scrollIntoView({ block: 'nearest' }));
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    if (_closeActive === close) _closeActive = null;
    panel.classList.remove('csel-panel--open');
    trigger.classList.remove('csel-trigger--open');
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen ? close() : open();
  });

  document.addEventListener('click',   (e) => { if (isOpen && !panel.contains(e.target) && e.target !== trigger) close(); });
  document.addEventListener('keydown',  (e) => { if (isOpen && e.key === 'Escape') close(); });
  window.addEventListener('resize',    ()  => { if (isOpen) positionPanel(); });
  window.addEventListener('scroll',    ()  => { if (isOpen) positionPanel(); }, true);

  // Keep label in sync when options list is mutated (e.g. NAM model names)
  select.addEventListener('change', syncLabel);
  new MutationObserver(syncLabel).observe(select, { childList: true, subtree: true });
}
