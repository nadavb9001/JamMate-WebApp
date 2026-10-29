/** Small theme-matched dropdowns with a capped scrollable list.
 * Keeps each native <select> in the DOM as the data source, so the existing
 * app/ESP/BLE change listeners and flat parameter values are not modified.
 * Call upgradeSelects() on dynamic content and disposeSelects() before removing it.
 */
const instances = new WeakMap();
let active = null;
let bound = false;
let serial = 0;
const SAFE = 8;
const MAX_PANEL_HEIGHT = 208;

function viewport() {
  const vv = window.visualViewport;
  return {left: vv?.offsetLeft ?? 0, top: vv?.offsetTop ?? 0,
          width: vv?.width ?? innerWidth, height: vv?.height ?? innerHeight};
}
function closeActive() {
  if (!active) return;
  active.panel.classList.remove('csel-panel--open');
  active.trigger.classList.remove('csel-trigger--open');
  active.trigger.setAttribute('aria-expanded','false');
  active = null;
}
function ensureGlobalHandlers() {
  if (bound) return;
  bound = true;
  document.addEventListener('pointerdown', e => {
    if (active && !active.panel.contains(e.target) && !active.trigger.contains(e.target)) closeActive();
  }, true);
  document.addEventListener('keydown', e => {
    if (!active) return;
    const state = active;
    if (e.key === 'Escape' || e.key === 'Tab') {closeActive(); if(e.key==='Escape'){e.preventDefault();state.trigger.focus();}return;}
    const count = state.select.options.length;
    if (!count) return;
    const index = state.highlight;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      state.highlight = e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 :
        Math.max(0, Math.min(count - 1, index + (e.key === 'ArrowDown' ? 1 : -1)));
      highlight(state);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();choose(state,state.highlight);
    }
  });
  const reposition = () => {if(active) active.select.isConnected ? place(active) : closeActive();};
  window.addEventListener('resize',reposition);
  window.addEventListener('scroll',reposition,true);
  window.visualViewport?.addEventListener('resize',reposition);
  window.visualViewport?.addEventListener('scroll',reposition);
}
function sync(state) {
  const opt = state.select.options[state.select.selectedIndex];
  state.label.textContent = opt?.textContent ?? '';
  state.trigger.setAttribute('aria-label', `${state.select.getAttribute('aria-label') || 'Choose option'}: ${opt?.textContent ?? ''}`);
}
function highlight(state) {
  for (const [i, node] of Array.from(state.panel.children).entries()) {
    node.classList.toggle('csel-item--active', i===state.highlight);
    node.setAttribute('aria-selected', String(i===state.highlight));
  }
  const node = state.panel.children[state.highlight];
  if (node) {
    if(node.offsetTop < state.panel.scrollTop) state.panel.scrollTop=node.offsetTop;
    else if(node.offsetTop + node.offsetHeight > state.panel.scrollTop + state.panel.clientHeight)
      state.panel.scrollTop=node.offsetTop + node.offsetHeight - state.panel.clientHeight;
    state.trigger.setAttribute('aria-activedescendant',node.id);
  }
}
function choose(state,index) {
  const opt=state.select.options[index];
  if(!opt || opt.disabled) return;
  state.select.selectedIndex=index;
  sync(state);
  closeActive();
  state.select.dispatchEvent(new Event('change',{bubbles:true}));
  // Prevent Safari's delayed synthetic tap from activating controls beneath
  // the just-dismissed popup (particularly important near REC / DSP Reset).
  const absorb = e => {e.stopPropagation();e.preventDefault();document.removeEventListener('click',absorb,true);};
  document.addEventListener('click',absorb,true);
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.removeEventListener('click',absorb,true)));
  if (state.trigger.isConnected) state.trigger.focus({preventScroll:true});
}
function build(state) {
  state.panel.replaceChildren();
  for (const [i,opt] of Array.from(state.select.options).entries()) {
    const item=document.createElement('div');
    item.id=`csel-${state.uid}-${i}`;
    item.className='csel-item';
    item.setAttribute('role','option');
    item.setAttribute('aria-selected',String(i===state.select.selectedIndex));
    item.textContent=opt.textContent;
    if(opt.disabled){item.classList.add('csel-disabled');item.setAttribute('aria-disabled','true');}
    else item.addEventListener('click',e=>{e.stopPropagation();choose(state,i);});
    state.panel.appendChild(item);
  }
  state.highlight=Math.max(0,state.select.selectedIndex);
}
function place(state) {
  const r=state.trigger.getBoundingClientRect(), v=viewport();
  const right=v.left+v.width, bottom=v.top+v.height;
  const width=Math.min(Math.max(r.width,150),Math.max(120,v.width-2*SAFE));
  const x=Math.max(v.left+SAFE,Math.min(r.left,right-SAFE-width));
  const spaceBelow=bottom-r.bottom-SAFE, spaceAbove=r.top-v.top-SAFE;
  const up=spaceBelow<126 && spaceAbove>spaceBelow;
  const available=(up?spaceAbove:spaceBelow)-4;
  const height=Math.max(48,Math.min(MAX_PANEL_HEIGHT,v.height*.37,available));
  state.panel.style.width=`${width}px`;
  state.panel.style.maxHeight=`${height}px`;
  state.panel.style.left=`${x}px`;
  state.panel.style.top=up?`${Math.max(v.top+SAFE,r.top-height-4)}px`:`${Math.min(bottom-SAFE-height,r.bottom+4)}px`;
  state.panel.classList.toggle('csel-panel--up',up);
}
function open(state) {
  closeActive();
  active=state;
  build(state);
  state.trigger.setAttribute('aria-expanded','true');
  state.trigger.classList.add('csel-trigger--open');
  state.panel.classList.add('csel-panel--open');
  place(state);
  highlight(state);
}
function init(select) {
  if (instances.has(select)) return;
  ensureGlobalHandlers();
  const uid=++serial, originalStyle=select.getAttribute('style');
  const wrapper=document.createElement('div'); wrapper.className='csel';
  select.parentNode.insertBefore(wrapper,select);wrapper.appendChild(select);
  select.dataset.csUpgraded='1';
  select.style.cssText='position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;overflow:hidden!important;';
  select.setAttribute('tabindex','-1');
  const trigger=document.createElement('button');trigger.type='button';trigger.className='csel-trigger';
  trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');
  trigger.setAttribute('aria-expanded','false');
  const label=document.createElement('span');label.className='csel-label';
  trigger.append(label);
  const arrow=document.createElement('span');arrow.className='csel-arrow';arrow.setAttribute('aria-hidden','true');
  trigger.append(arrow);wrapper.append(trigger);
  const panel=document.createElement('div');panel.id=`csel-list-${uid}`;
  panel.className='csel-panel';panel.setAttribute('role','listbox');
  if(select.closest('#jmMobile'))panel.classList.add('csel-panel--mobile');
  trigger.setAttribute('aria-controls',panel.id);
  document.body.append(panel);
  const state={uid,select,trigger,panel,label,wrapper,originalStyle,highlight:0,observer:null};
  instances.set(select,state);
  const proto=Object.getPrototypeOf(select);
  for(const prop of ['value','selectedIndex']) {
    const descriptor=Object.getOwnPropertyDescriptor(proto,prop);
    if (descriptor?.get && descriptor?.set) Object.defineProperty(select,prop,{
      configurable:true,
      get:()=>descriptor.get.call(select),
      set:value=>{descriptor.set.call(select,value);sync(state);}
    });
  }
  select.addEventListener('change',state.onChange=()=>sync(state));
  state.observer=new MutationObserver(()=>sync(state));
  state.observer.observe(select,{childList:true,subtree:true,characterData:true});
  trigger.addEventListener('click',e=>{e.stopPropagation();active===state?closeActive():open(state);});
  trigger.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();if(active!==state)open(state);
      else {state.highlight=Math.max(0,Math.min(select.options.length-1,state.highlight+(e.key==='ArrowDown'?1:-1)));highlight(state);}
    }
  });
  sync(state);
}
export function upgradeSelects(root=document) {
  const host=root?.querySelectorAll?root:document;
  host.querySelectorAll('select:not([data-cs-upgraded])').forEach(init);
}
export function disposeSelects(root) {
  if(!root?.querySelectorAll)return;
  const selects=[...(root.matches?.('select[data-cs-upgraded]')?[root]:[]),
    ...root.querySelectorAll('select[data-cs-upgraded]')];
  for (const select of selects) {
    const state=instances.get(select);if(!state)continue;
    if(active===state)closeActive();
    state.observer.disconnect();select.removeEventListener('change',state.onChange);
    state.panel.remove();
    delete select.value;delete select.selectedIndex;
    if(state.originalStyle===null)select.removeAttribute('style');else select.setAttribute('style',state.originalStyle);
    select.removeAttribute('data-cs-upgraded');select.removeAttribute('tabindex');
    if(state.wrapper.parentNode)state.wrapper.replaceWith(select);
    instances.delete(select);
  }
}
