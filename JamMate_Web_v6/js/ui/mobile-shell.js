/** JamMate mobile-first shell. Legacy application remains mounted (and owns BLE/protocol/state).
 * No synthetic timing: graphical ring/beacon are placeholders until transport telemetry is wired. */
import { upgradeSelects, disposeSelects } from './CustomSelect.js';
import { currentJamMateTheme } from './ThemeManager.js';
export const FX_ORDER = [0,1,2,3,4,15,5,6,7,8,9,10,11,12,13,14,16,17];
const FX_NAMES = ['Gate','Comp','Wah','OvrDrv','Dist','NAM','EQ','Harm','Vibr','Chor','Octv','Flng','Phsr','Trem','Amp','Dely','Rvrb','Gnrc'];
// Crisp inline SVGs: no icon font, emoji fallback, network dependency or bitmap scaling.
// Shared 24px coordinate system; meaningful silhouettes remain sharp at 20–36px.
const ICON_SHAPES = {
  fx: '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="19" r="2" fill="currentColor" stroke="none"/>',
  looper: '<path d="M4 10a8 8 0 0 1 14-4l2 2m0-4v4h-4M20 14a8 8 0 0 1-14 4l-2-2m0 4v-4h4"/>',
  drums: '<path d="M4 12h16v6c0 3-16 3-16 0zM4 12c0-3 16-3 16 0M7 19v2m10-2v2M4 4l5 5m11-5-5 5M3 3l3 3m15-3-3 3"/>',
  tuner: '<path d="M7 3v8a5 5 0 0 0 10 0V3M12 16v5M7 3h0m10 0h0"/>',
  nam: '<path d="M2 12h3l2-7 4 14 3-10 2 5h6"/>',
  files: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18"/>',
  setup: '<path d="M10 2h4l.7 2.5 2 1.1 2.5-.7 2 3.5-1.8 1.8v2.5l1.8 1.8-2 3.5-2.5-.7-2 1.1L14 21h-4l-.7-2.5-2-1.1-2.5.7-2-3.5 1.8-1.8v-2.5L2.8 8.4l2-3.5 2.5.7 2-1.1z"/><circle cx="12" cy="11.5" r="3"/>',
  gate: '<path d="M3 20V4h5l4 8-4 8H3m13-16v16m4-16v16"/>',
  comp: '<path d="M2 13h4l2-5 3 9 3-12 3 8h5"/><path d="M3 3h18v18H3z"/>',
  wah: '<path d="M3 18h18L17 7H7zM8 12h8"/>',
  ovrd: '<path d="M12 22c5 0 8-3.4 8-8 0-4-2.6-7-5-9 .3 3-1.3 5-2.4 5.8C12 8.5 10 6.4 8 5c.4 4-4 6.3-4 10a8 8 0 0 0 8 7zM12 22c2.1 0 4-1.6 4-4 0-2-1.5-3-2.4-4-.3 1.6-1.4 2.7-2.4 3.2-.2-1-1-1.9-1.8-2.6-2 2.1-1.6 7.4 2.6 7.4"/>',
  dist: '<path d="M2 12h3l2-7 3 15 4-15 3 12 2-5h3"/>',
  eq: '<path d="M4 21V9m0-4v-2M10 21V5m0-2v0M16 21v-9m0-4V3M22 21v-4m0-4V3"/><path d="M2 9h4m2-4h4m2 7h4m2 5h4"/>',
  harm: '<path d="M4 4v13a3 3 0 1 0 2 2V8l13-3v8a3 3 0 1 0 2 2V2z"/>',
  vibr: '<path d="M1 12c3.5 0 3.5-7 7-7s3.5 14 7 14 3.5-7 8-7"/>',
  chor: '<path d="M2 8c4-6 6 6 10 0s6 6 10 0M2 16c4-6 6 6 10 0s6 6 10 0"/>',
  octv: '<path d="M8 18V4m0 0L4 8m4-4 4 4M16 6v14m0 0-4-4m4 4 4-4"/>',
  flng: '<path d="M2 7c4-5 6 5 10 0s6 5 10 0M2 12c4-5 6 5 10 0s6 5 10 0M2 17c4-5 6 5 10 0s6 5 10 0"/>',
  phsr: '<circle cx="12" cy="12" r="8"/><path d="M5 14c3-10 12-10 14-5M6 17c8 2 11-4 10-8"/>',
  trem: '<path d="M2 15l5-10 5 14 5-13 5 9"/>',
  amp: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M7 7h.01M11 7h.01M15 7h.01M7 15h10M7 18h10"/>',
  dely: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3M4 3l-2 4"/>',
  rvrb: '<path d="M3 18a9 9 0 0 1 18 0M6 18a6 6 0 0 1 12 0M9 18a3 3 0 0 1 6 0"/>',
  gnrc: '<path d="M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  back: '<path d="M15 4 7 12l8 8"/>',
  connect: '<path d="M8 5h8a4 4 0 0 1 0 8h-2M16 19H8a4 4 0 0 1 0-8h2M9 12h6"/>',
  save: '<path d="M4 3h14l3 3v15H3V3zM7 3v6h10V3M7 21v-9h10v9"/>',
  rec: '<circle cx="12" cy="12" r="8" fill="currentColor" stroke="none"/>',
  play: '<path d="M7 4 20 12 7 20z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="1.5" fill="currentColor" stroke="none"/>',
  undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
};
const svgIcon = (name, cssClass='jm-svg-icon') => `<svg class="${cssClass}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_SHAPES[name] || ICON_SHAPES.fx}</svg>`;
const FX_ICON_KEYS = ['gate','comp','wah','ovrd','dist','nam','eq','harm','vibr','chor','octv','flng','phsr','trem','amp','dely','rvrb','gnrc'];
const FX_COLORS = ['#db43ff','#ffbc13','#11dfff','#ff8e20','#ff3156','#f246ed','#00b7ff','#b778ff','#19edc9','#008cff','#ffe018','#ac65ff','#ff4263','#ffe732','#ffbe20','#10e5f5','#a76aff','#b7c8ee'];
export const BANKS=['Clean','Crunch','Overdrive','Distortion','Modulated','Custom1','Custom2'];
const MENU=[['fx','FX','fx','#e43aff'],['looper','LOOPER','looper','#00f58b'],['drums','DRUMS','drums','#ff3456'],['tuner','TUNER','tuner','#12afff'],['nam','NAM','nam','#f0a221'],['files','FILES','files','#ffe627'],['setup','SETUP','setup','#b9caff']];
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export function installMobileShell(app){
 const root=document.createElement('div'); root.id='jmMobile';
 root.innerHTML=`<header class="jm-head"><button id="jmBack" aria-label="Back" class="jm-icon">${svgIcon('menu')}</button><strong>JAMMATE</strong><button id="jmConnect" class="jm-connect" aria-label="Connect to JamMate">${svgIcon('connect')}</button></header><div id="jmPage" class="jm-scroll"></div><footer class="jm-foot"><span id="jmCpu">CPU --</span><span class="jm-foot-meter"><i></i></span><span id="jmBeatText">BEAT</span><span id="jmBeatLed" class="jm-beat" aria-label="Awaiting DSP beat"></span></footer><div id="jmOverlay" class="jm-overlay" hidden><div class="jm-sheet" role="dialog" aria-modal="true"><div class="jm-sheet-head"><strong id="jmModalTitle">SETTINGS</strong><button id="jmClose" aria-label="Close">${svgIcon('close')}</button></div><div id="jmModalBody" class="jm-sheet-body"></div></div></div><div id="jmHud" class="jm-hud" role="status" aria-live="polite"></div>`;
 document.body.appendChild(root); document.body.classList.add('jm-mobile-active');
 const page=$('jmPage'), modal=$('jmOverlay'), mb=$('jmModalBody');
 let active='home', easy=false, currentFX=0, hudTimeout=null, beatOffTimeout=null, mountedTab=null, previousParent=null, previousNext=null;
 let eqMounted=false, eqParent=null, eqNext=null;
 const legacy={master:$('masterKnob'),bpm:$('bpmKnob')};
 const connLed=$('statusLed');if(connLed){const updateConnection=()=>{const online=connLed.classList.contains('connected');$('jmConnect').classList.toggle('is-connected',online);$('jmConnect').setAttribute('aria-label',online?'JamMate connected':'Connect JamMate');}; new MutationObserver(updateConnection).observe(connLed,{attributes:true,attributeFilter:['class']});updateConnection();}
 const knobVal=(name,fallback)=>Math.round(legacy[name]?.knob?.value??fallback);
 const popup=(title,renderer)=>{closeModal();$('jmModalTitle').textContent=title; modal.hidden=false; document.body.classList.add('jm-modal-open'); renderer(mb);upgradeSelects(mb);};
 function restoreEQ(){
   if(!eqMounted) return;
   const el=$('effectControls');
   if(el&&eqParent){
     if(eqNext?.parentNode===eqParent)eqParent.insertBefore(el,eqNext);
     else eqParent.append(el);
     el.classList.remove('jm-eq-embedded');
   }
   eqMounted=false;eqParent=null;eqNext=null;
 }
 // Reuse the *original* 12-band IIR editor and existing BLE EQ update callback.
 // This preserves point editing, active-band count, Q factor and preset storage.
 function renderEQ(target){
   restoreEQ();
   const el=$('effectControls');
   if(!el){target.textContent='EQ editor unavailable';return;}
   app.selectEffect(5); // original View.showEffectControls builds the IIR graph
   eqParent=el.parentNode;eqNext=el.nextSibling;
   target.innerHTML='<section class="jm-eq-mobile"><h2>12-BAND PARAMETRIC EQ</h2><p>Drag the bands to change frequency and gain. Select a point to edit Q.</p></section>';
   target.querySelector('.jm-eq-mobile').append(el);
   el.classList.add('jm-eq-embedded');eqMounted=true;
   requestAnimationFrame(()=>app.iirDesigner?.draw());
 }
 function restoreMounted(){if(!mountedTab)return;mountedTab.classList.remove('jm-embedded-tab');mountedTab.querySelectorAll('.jm-utility-legacy-hidden').forEach(el=>el.classList.remove('jm-utility-legacy-hidden'));  if(previousParent){if(previousNext?.parentNode===previousParent)previousParent.insertBefore(mountedTab,previousNext);else previousParent.appendChild(mountedTab);}mountedTab=null;}
 function closeModal(){restoreEQ();restoreMounted();disposeSelects(mb);modal.hidden=true;mb.replaceChildren();document.body.classList.remove('jm-modal-open');}
 function hud(msg, value){
   // One prominent HUD for mobile controls and legacy BLE status notifications.
   const element=$('jmHud');
   const text=String(msg??'').trim();
   const sep=value===undefined?text.lastIndexOf(':'):-1;
   const title=value!==undefined?text:(sep>0&&sep<text.length-1?text.slice(0,sep):'JAMMATE');
   const detail=value!==undefined?String(value):(sep>0&&sep<text.length-1?text.slice(sep+1).trim():text);
   element.replaceChildren();
   const heading=document.createElement('span');heading.className='jm-hud-title';heading.textContent=title;
   const body=document.createElement('strong');body.className='jm-hud-value';body.textContent=detail;
   element.append(heading,body);element.classList.add('is-visible');
   clearTimeout(hudTimeout);hudTimeout=setTimeout(()=>element.classList.remove('is-visible'),800);
 }
 function syncGlobal(){
   const bpm=knobVal('bpm',120), vol=knobVal('master',50);
   document.querySelectorAll('[data-jm-bpm]').forEach(el=>el.textContent=bpm);
   document.querySelectorAll('[data-jm-vol]').forEach(el=>el.textContent=vol);
   document.querySelectorAll('[data-jm-global-slider]').forEach(el=>{
     const kind=el.dataset.jmGlobalSlider;
     const value=kind==='bpm'?bpm:vol;
     if(document.activeElement!==el)el.value=String(value);
     el.style.setProperty('--value-progress',`${Math.round(100*value/Math.max(1,+el.max))}%`);
   });
 }
 function commitGlobal(which,value){
   const k=legacy[which]?.knob;if(!k)return;
   k.value=clamp(Math.round(value),k.min,k.max);k.draw();
   if(which==='bpm') app.bpm=k.value; // BPM is forwarded by ESP 0x25 -> TCTL op 1; do not overwrite drum/looper state.
   app.sendGlobalUpdate(); syncGlobal();hud(which==='bpm'?'BPM':'MASTER VOLUME',String(k.value)+(which==='bpm'?'':'%'));
 }
 function setPresetText(){
   const bank=$('presetBank'),num=$('presetNum');
   const index=bank?.selectedIndex??0,slot=num?.selectedIndex??0;
   const name=`${BANKS[index]||'Clean'} ${slot+1}`;
   document.querySelectorAll('[data-jm-preset]').forEach(e=>e.textContent=name);
   document.querySelectorAll('[data-jm-bank-select]').forEach(el=>{if(document.activeElement!==el)el.value=String(index);});
   document.querySelectorAll('[data-jm-slot-select]').forEach(el=>{if(document.activeElement!==el)el.value=String(slot);});
 }
 function isFullScreen(){return !!document.fullscreenElement || window.matchMedia('(display-mode: fullscreen)').matches;}
 async function toggleFullScreen(){
   try {
     if(document.fullscreenElement){await document.exitFullscreen();hud('Fullscreen off');}
     else if(document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen({navigationUI:'hide'});hud('Fullscreen on');}
     else {hud('Install JamMate on your home screen for fullscreen');}
   }catch(err){hud('Install JamMate on your home screen for fullscreen');}
   root.querySelectorAll('[data-action="fullscreen"]').forEach(b=>b.textContent=isFullScreen()?'EXIT FULLSCREEN':'FULL SCREEN');
 }
 function preset(){return `<section class="jm-preset" aria-label="Choose preset"><div class="jm-preset-fields"><label>BANK<select data-jm-bank-select aria-label="Preset bank">${BANKS.map((bank,i)=>`<option value="${i}">${esc(bank)}</option>`).join('')}</select></label><label>NUMBER<select data-jm-slot-select aria-label="Preset number">${[1,2,3,4,5].map((n,i)=>`<option value="${i}">${n}</option>`).join('')}</select></label></div><div class="jm-wave" aria-hidden="true"></div></section>`;}
 function globals(){return `<div class="jm-globals"><label class="jm-data jm-bpm" for="jmTempoRange"><span>BPM</span><strong data-jm-bpm>120</strong><input id="jmTempoRange" data-jm-global-slider="bpm" type="range" min="20" max="250" step="1" value="120" aria-label="Tempo in beats per minute"></label><label class="jm-data jm-vol" for="jmVolRange"><span>VOLUME</span><strong data-jm-vol>75</strong><input id="jmVolRange" data-jm-global-slider="master" type="range" min="0" max="100" step="1" value="75" aria-label="Master volume percent"></label></div>`;}
 function navTiles(compact=easy){return `<div class="jm-menu ${compact?'jm-menu-easy':''}">${MENU.map(([id,label,icon,color])=>`<button class="jm-menu-tile" style="--tone:${color}" data-screen="${id}" aria-label="Open ${label}"><b class="jm-symbol">${svgIcon(icon)}</b><span>${compact?({looper:'LOOP',drums:'DRUM',tuner:'TUNE',files:'FILE',setup:'SET'}[id]||label):label}</span></button>`).join('')}</div>`;}
 function save(){return `<button class="jm-save" data-action="save">${svgIcon('save')} SAVE PRESET</button>`;}
 function tiles(compact=false){return `<div class="jm-effects ${compact?'jm-effects-easy':''}">${FX_ORDER.map((idx,i)=>{let on=!!app.effectStates[idx]?.enabled;return `<div class="jm-effect" data-fx="${idx}" style="--tone:${FX_COLORS[i]}"><button class="jm-effect-open" data-open-fx="${idx}" aria-label="Edit ${FX_NAMES[i]}" ><span class="jm-effect-glyph">${svgIcon(FX_ICON_KEYS[i])}</span><b>${FX_NAMES[i]}</b></button><button class="jm-effect-toggle ${on?'on':''}" data-toggle-fx="${idx}" aria-label="Toggle ${FX_NAMES[i]}" aria-pressed="${on}">${on?'ON':'OFF'}</button></div>`;}).join('')}</div>`;}
 function refreshFX(){for(const b of root.querySelectorAll('[data-toggle-fx]')){const on=!!app.effectStates[+b.dataset.toggleFx]?.enabled;b.classList.toggle('on',on);b.textContent=on?'ON':'OFF';b.setAttribute('aria-pressed',String(on));}const en=$('jmFxOn');if(en) en.checked=!!app.effectStates[currentFX]?.enabled;}
 function renderHome(){disposeSelects(page);page.scrollTop=0;page.innerHTML=`<div class="jm-home">${preset()}${globals()}${navTiles()}${easy?`<div class="jm-section-cap"><strong>ALL EFFECTS</strong><span>Tap an effect to edit</span></div>${tiles(true)}`:''}${save()}</div>`;syncGlobal();setPresetText();refreshFX();upgradeSelects(page);}
 function showScreen(name){restoreEQ();closeModal();restoreMounted();disposeSelects(page);active=name;page.dataset.view=name; $('jmBack').innerHTML=svgIcon(name==='home'?'menu':'back'); if(name==='home'){renderHome();return;} if(name==='fx'){page.innerHTML=`<section class="jm-fx-page"><h1 class="jm-title">FX</h1>${tiles()}</section>`;page.querySelector('.jm-effects').classList.add('jm-effects-fit');refreshFX();return;} if(name==='params'){renderParam(page,currentFX);return;} if(name==='looper'){renderLooper(page);return;} if(name==='drums'){renderDrums(page);return;} if(name==='tuner'||name==='setup'||name==='nam'||name==='files'){page.replaceChildren();mountLegacy(name,page);upgradeSelects(page);return;} }
 function go(name){if(easy&&name!=='home'){popup(MENU.find(x=>x[0]===name)?.[1]||name.toUpperCase(),target=>{if(name==='fx') target.innerHTML=`${tiles(true)}`;else if(name==='looper')renderLooper(target);else if(name==='drums')renderDrums(target);else mountLegacy(name,target);refreshFX();});return;}showScreen(name);}
 function paramTile(fx,p,k,type,options){const label=esc(p.replaceAll('_',' '));if(type==='slider'){const v=app.effectParams[fx]?.[`knob${k}`]??50;return `<label class="jm-param" style="--tone:#11ddf5"><span>${label}</span><strong data-param-value="${k}">${v}</strong><input data-knob="${k}" type="range" min="0" max="100" value="${v}" aria-label="${label}"></label>`;}const v=app.effectParams[fx]?.[`dropdown${k}`]??0;return `<label class="jm-param jm-choice"><span>${label}</span><select data-dropdown="${k}" aria-label="${label}">${options.map((o,i)=>`<option value="${i}" ${i===v?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;}
 function renderParam(target,fx){disposeSelects(target);if(fx===5){renderEQ(target);return;}const effect=app.config.tabs[fx];if(!effect)return; const pos=FX_ORDER.indexOf(fx),color=FX_COLORS[pos]||'#18e9f4'; target.innerHTML=`<div class="jm-param-screen" style="--param-tone:${color}"><div class="jm-param-head"><div><span>FX PARAMETERS</span><h2>${esc(effect.title)}</h2></div><label class="jm-param-enable">ON <input id="jmFxOn" type="checkbox" ${app.effectStates[fx]?.enabled?'checked':''}/></label></div><div class="jm-param-list">${effect.params.knobs.map((p,k)=>paramTile(fx,p,k,'slider')).join('')}${effect.params.dropdowns.map((p,k)=>paramTile(fx,p,k,'dropdown',app.config.dropdowns[p]||[])).join('')}</div></div>`;target.querySelectorAll('[data-knob]').forEach(el=>{el.addEventListener('input',()=>{target.querySelector(`[data-param-value="${el.dataset.knob}"]`).textContent=el.value;hud(`${effect.title} · ${effect.params.knobs[+el.dataset.knob].replaceAll('_',' ')}`,el.value);});el.addEventListener('change',()=>app.onEffectParamChanged(fx,1+ +el.dataset.knob,+el.value));});target.querySelectorAll('[data-dropdown]').forEach(el=>el.addEventListener('change',()=>app.onEffectParamChanged(fx,1+effect.params.knobs.length+ +el.dataset.dropdown,+el.value)));target.querySelector('#jmFxOn').addEventListener('change',e=>{app.onEffectParamChanged(fx,0,e.target.checked?1:0);refreshFX();});upgradeSelects(target);}
 function editFX(idx){currentFX=idx; app.currentEffect=idx; if(easy){popup(app.config.tabs[idx]?.title||'EFFECT', t=>renderParam(t,idx));mb.scrollTop=0;}else{showScreen('params');page.scrollTop=0;}}
 function bridgeClick(id){const el=$(id);if(el)el.click();else hud('Unavailable');}
 function bridgeSelect(id,val){const el=$(id);if(!el)return;el.value=String(val);el.dispatchEvent(new Event('change',{bubbles:true}));}
 function ring(klass){return `<div class="jm-ring ${klass}" aria-label="DSP transport timing pending"><div class="jm-ring-inner"><small id="jmRingState">${klass==='drum'?'BEAT':'LOOPER'}</small><strong class="jm-ring-beat">—/4</strong><span class="jm-ring-caption">WAITING FOR DSP</span></div></div>`;}
 function renderLooper(target){
   disposeSelects(target);
   target.innerHTML=`<div class="jm-title">LOOPER</div>${ring('looper')}
     <div class="jm-metric-row"><div>BARS <b>—</b></div><div>BEAT <b>—/4</b></div><div>LAYER <b>—</b></div></div>
     <div class="jm-three-actions"><button class="red" data-proxy="loopBtn_rec">${svgIcon('rec')} REC</button><button class="green" data-proxy="loopBtn_stop">${svgIcon('stop')} STOP</button><button class="blue" data-proxy="loopBtn_undo">${svgIcon('undo')} UNDO</button></div>
     <div class="jm-loop-audio"><label class="jm-loop-enable">LOOPER <input data-check="looperEnable" type="checkbox"></label>
       <label class="jm-loop-level"><span>LOOP LEVEL <strong data-loop-level-value>${Math.round(app.loopLevel ?? 50)}%</strong></span><div class="jm-loop-level-controls"><div class="jm-loop-dial" data-loop-dial tabindex="0" role="slider" aria-label="Looper playback level knob" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(app.loopLevel ?? 50)}"><i></i></div><input data-loop-level type="range" min="0" max="100" value="${Math.round(app.loopLevel ?? 50)}" aria-label="Looper playback level"></div></label></div>
     <div class="jm-edit-list"><label>TRACK<select data-bind="trackSelect">${[0,1,2,3].map(i=>`<option value="${i}">Track ${i+1}</option>`).join('')}</select></label>
       <label>SYNC<select data-bind="loopSync"><option value="0">Manual (free)</option><option value="1">Beat</option><option value="2">Bar</option><option value="3">Drum Start</option></select></label>
       <label>LENGTH<select data-bind="loopLength"><option value="0">Free / Stop manually</option><option value="1">1 Bar</option><option value="2">2 Bars</option><option value="4">4 Bars</option><option value="8">8 Bars</option><option value="12">12 Bars</option><option value="16">16 Bars</option></select></label>
       <label>AUTO ARM<input data-check="autoArm" type="checkbox"></label>
       <label>PLAYBACK<select data-bind="playbackMode"><option value="0">Parallel</option><option value="1">Series</option></select></label>
       <label>BOUNCE<input data-check="bounceMode" type="checkbox"></label></div>
     <div class="jm-secondary-actions"><button data-proxy="loopBtn_redo">REDO</button><button data-proxy="loopBtn_clear">CLEAR</button><button data-proxy="loopBtn_stopAll">STOP ALL</button></div>
     <small class="jm-loop-hint">MANUAL + Auto Arm OFF: record immediately. BAR + Auto Arm ON: wait for input, then next bar. DRUM START: first input can launch drums and recording together.</small>`;
   syncBindings(target);upgradeSelects(target);
   const lvl=target.querySelector('[data-loop-level]'),dial=target.querySelector('[data-loop-dial]');
   const updateLevel=(value,commit=false)=>{
     const v=Math.round(clamp(value,0,100));
     lvl.value=String(v);
     dial.setAttribute('aria-valuenow',String(v));
     dial.style.setProperty('--loop-turn',`${-135+270*v/100}deg`);
     dial.style.setProperty('--loop-fill',`${Math.round(75*v/100)}%`);
     target.querySelector('[data-loop-level-value]').textContent=v+'%';
     if(commit){app.loopLevel=v;const k=$('loopLevelKnob')?.knob;if(k){k.value=v;k.draw();}app.sendLoopConfig();}
     hud('LOOP LEVEL',v+'%');
   };
   dial.style.setProperty('--loop-turn',`${-135+270*Number(lvl.value)/100}deg`);
   dial.style.setProperty('--loop-fill',`${Math.round(75*Number(lvl.value)/100)}%`);
   lvl.addEventListener('input',()=>updateLevel(+lvl.value));
   lvl.addEventListener('change',()=>updateLevel(+lvl.value,true));
   let dialStart=null;
   dial.addEventListener('pointerdown',ev=>{
      dialStart={y:ev.clientY,value:+lvl.value};dial.setPointerCapture(ev.pointerId);ev.preventDefault();
   });
   dial.addEventListener('pointermove',ev=>{
      if(!dialStart)return;updateLevel(dialStart.value+(dialStart.y-ev.clientY)*0.75);
   });
   dial.addEventListener('pointerup',()=>{if(dialStart){dialStart=null;updateLevel(+lvl.value,true);}});
   dial.addEventListener('pointercancel',()=>{dialStart=null;});
   dial.addEventListener('keydown',ev=>{
      if(!['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(ev.key))return;
      ev.preventDefault();const dir=ev.key==='Home'?-100:ev.key==='End'?100:ev.key==='ArrowLeft'||ev.key==='ArrowDown'?-1:1;
      updateLevel(ev.key==='Home'?0:ev.key==='End'?100:+lvl.value+dir,true);
   });
 }
 function renderDrums(target){disposeSelects(target);target.innerHTML=`<div class="jm-title">DRUMS</div>${ring('drum')}<div class="jm-drum-settings"><label>STYLE<select data-bind="drumStyle">${Array.from($('drumStyle')?.options||[]).map(o=>`<option value="${esc(o.value)}">${esc(o.textContent)}</option>`).join('')}</select></label><label>LEVEL<input type="range" data-drum-level min="0" max="100" value="${app.drumLevel}"></label><label>BPM <strong data-jm-bpm>${knobVal('bpm',120)}</strong><input data-jm-global-slider="bpm" type="range" min="20" max="250" step="1" value="${knobVal('bpm',120)}" aria-label="Drum tempo"></label></div><div class="jm-three-actions"><button class="green" data-drum-toggle="1">${svgIcon('play')} START</button><button class="red" data-drum-toggle="0">${svgIcon('stop')} STOP</button></div><small class="jm-note">Beat graphic reserved for DSP → ESP → web telemetry; not locally generated.</small>`;syncBindings(target);syncGlobal();upgradeSelects(target);}
 function syncBindings(target){target.querySelectorAll('[data-bind]').forEach(sel=>{const src=$(sel.dataset.bind);if(src){sel.value=src.value;sel.addEventListener('change',()=>{
        if(sel.dataset.bind==='loopSync'&&sel.value==='0'){
          // Manual means immediate REC unless the user explicitly arms again.
          const arm=$('autoArm');if(arm)arm.checked=false;
          const armUI=target.querySelector('[data-check="autoArm"]');if(armUI)armUI.checked=false;
          app.autoArm=false;
        }
        bridgeSelect(sel.dataset.bind,sel.value);
        hud((sel.closest('label')?.textContent||sel.dataset.bind).split('\n')[0].trim(),sel.selectedOptions?.[0]?.textContent||sel.value);
      });}});target.querySelectorAll('[data-check]').forEach(el=>{const src=$(el.dataset.check);if(src){el.checked=src.checked;el.addEventListener('change',()=>{src.checked=el.checked;
       if(el.dataset.check==='looperEnable')app.sendLooperEnable(el.checked);
       else src.dispatchEvent(new Event('change',{bubbles:true}));
       hud(el.closest('label')?.textContent.trim()||el.dataset.check,el.checked?'ON':'OFF');});}});target.querySelectorAll('[data-drum-level]').forEach(el=>el.addEventListener('change',()=>{app.drumLevel=Number(el.value);const k=$('drumLevelKnob')?.knob;if(k){k.value=app.drumLevel;k.draw();}app.sendDrumUpdate();hud('DRUM LEVEL',app.drumLevel+'%');}));}
 function mountLegacy(name,target){const id={tuner:'tuner-tab',setup:'setup-tab',files:'loader-tab',nam:'nam-tab'}[name];const section=$(id);if(!section){target.textContent='Unavailable';return;}restoreMounted();previousParent=section.parentNode;previousNext=section.nextSibling;mountedTab=section;target.append(section);section.classList.add('jm-embedded-tab','active');const heading=document.createElement('h2');heading.className='jm-title jm-mounted-title';heading.textContent={tuner:'TUNER',setup:'SETUP',files:'FILES',nam:'NAM'}[name];target.prepend(heading);
  if(name==='setup'){
    const tools=document.createElement('section');
    tools.className='jm-setup-display';
    tools.innerHTML=`<div class="jm-setup-display-title">DISPLAY</div><div class="jm-setup-choices"><button type="button" class="jm-easy-setting ${easy?'active':''}" data-action="easy" aria-pressed="${easy}"><span>EASY MODE</span><span class="jm-easy-setting-state">${easy?'ON':'OFF'}</span></button><button type="button" class="jm-fullscreen-btn" data-action="fullscreen">${isFullScreen()?'EXIT FULLSCREEN':'FULL SCREEN'}</button></div><label class="jm-theme-mobile-label">THEME<select data-jm-theme-select aria-label="Interface theme"><option value="neon" ${currentJamMateTheme()==='neon'?'selected':''}>Neon</option><option value="metal" ${currentJamMateTheme()==='metal'?'selected':''}>Ultra Modern Metal</option><option value="medieval" ${currentJamMateTheme()==='medieval'?'selected':''}>Medieval</option></select></label>`;
    heading.after(tools);
    // New touch-sized sliders replace only the *visual* legacy knobs. The
    // original nodes remain mounted (and hidden) for their BLE handlers.
    const originalNoise=$('whiteNoiseBtn')?.closest('.panel');
    if(originalNoise&&section.contains(originalNoise)) originalNoise.classList.add('jm-utility-legacy-hidden');
    const util=document.createElement('section');util.className='jm-util-sliders';
    const noise=app.utilState.noise,tone=app.utilState.tone;
    const freqPos=Math.round(1000*Math.log((tone.freq||670)/20)/Math.log(1000));
    util.innerHTML=`<h3>NOISE & TEST TONE</h3>
      <label class="jm-util-toggle">WHITE NOISE <input type="checkbox" data-util-enable="noise" ${noise.enabled?'checked':''}></label>
      <label>NOISE LEVEL <strong data-util-output="noiseLevel">${Math.round(noise.level)}%</strong><input type="range" min="0" max="100" value="${Math.round(noise.level)}" data-util-slider="noiseLevel"></label>
      <label class="jm-util-toggle">TEST TONE <input type="checkbox" data-util-enable="tone" ${tone.enabled?'checked':''}></label>
      <label>TONE LEVEL <strong data-util-output="toneLevel">${Math.round(tone.level)}%</strong><input type="range" min="0" max="100" value="${Math.round(tone.level)}" data-util-slider="toneLevel"></label>
      <label>TONE FREQUENCY <strong data-util-output="toneFreq">${tone.freq} Hz</strong><input type="range" min="0" max="1000" step="1" value="${clamp(freqPos,0,1000)}" data-util-slider="toneFreq"></label>`;
    tools.after(util);
  }
 }
 // Presentation-only feedback for legacy actions. These indicate a command being
 // requested, never successful completion of a DSP operation.
 root.addEventListener('click',ev=>{
   const b=ev.target.closest('button');if(!b)return;
   const ids={
     'reset-btn':['DSP RESET','Requested'],
     'flash-btn':['DSP FLASH','Confirmation required'],
     'btnReadSDCard':['SD CARD','Read requested'],
     'btnUpdateConfig':['CONFIG','Upload requested'],
     'btnSaveToSD':['SD CARD','Save requested'],
     'btnSendIR':['IR','Transfer requested'],
     'btnNamLogin':['NAM','Sign-in requested'],
     'btnNamSearch':['NAM','Searching'],
     'btnNamEject':['NAM','Unload requested'],
     'btnConfirmSave':['PRESET','Save requested'],
     'btnToggleUART':['UART','Toggle requested']
   };
   const info=ids[b.id];if(info)hud(...info);
 },true);
 root.addEventListener('change',ev=>{
   if(ev.target.matches('[data-jm-theme-select]')) {hud('DISPLAY THEME',ev.target.selectedOptions?.[0]?.textContent||ev.target.value);return;}
   const el=ev.target;
   if(!el.closest('.jm-embedded-tab'))return;
   if(!el.matches('input,select'))return;
   if(el.type==='file')hud('FILE',el.files?.[0]?.name||'Selected');
   else if(el.type==='checkbox')hud((el.closest('label')?.textContent||el.id).trim(),el.checked?'ON':'OFF');
   else if(el.type==='range'||el.type==='number'||el.tagName==='SELECT')hud((el.closest('label')?.querySelector('span')?.textContent||el.getAttribute('aria-label')||el.id),el.selectedOptions?.[0]?.textContent||el.value);
 });
 // single delegated handler so newly rendered screens use identical callbacks.
 const utilFreq=step=>Math.round(20*Math.pow(1000,Number(step)/1000));
 root.addEventListener('input',ev=>{
   const el=ev.target.closest('[data-util-slider]');if(!el)return;
   const key=el.dataset.utilSlider;
   const value=key==='toneFreq'?utilFreq(el.value):Number(el.value);
   const output=root.querySelector(`[data-util-output="${key}"]`);
   if(output)output.textContent=value+(key==='toneFreq'?' Hz':'%');
   hud(key==='noiseLevel'?'NOISE LEVEL':key==='toneLevel'?'TONE LEVEL':'TONE FREQUENCY',value+(key==='toneFreq'?' Hz':'%'));
 });
 root.addEventListener('change',ev=>{
   const en=ev.target.closest('[data-util-enable]');
   if(en){app.utilState[en.dataset.utilEnable].enabled=en.checked;app.sendUtilUpdate(en.dataset.utilEnable==='noise'?0:1);hud(en.dataset.utilEnable.toUpperCase(),en.checked?'ON':'OFF');return;}
   const slider=ev.target.closest('[data-util-slider]');if(!slider)return;
   const key=slider.dataset.utilSlider,value=key==='toneFreq'?utilFreq(slider.value):Number(slider.value);
   if(key==='noiseLevel')app.utilState.noise.level=value;
   else if(key==='toneLevel')app.utilState.tone.level=value;
   else app.utilState.tone.freq=value;
   const legacyId=key==='noiseLevel'?'whiteNoiseLevelKnob':key==='toneLevel'?'toneLevelKnob':'toneFreqInput';
   const original=$(legacyId);if(original?.knob){original.knob.value=value;original.knob.draw();}else if(original)original.value=value;
   app.sendUtilUpdate(key==='noiseLevel'?0:1);
 });
 root.addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return; if(b.dataset.screen){go(b.dataset.screen);return;}if(b.dataset.openFx!==undefined){editFX(+b.dataset.openFx);return;}if(b.dataset.toggleFx!==undefined){app.toggleEffectEnabled(+b.dataset.toggleFx);refreshFX();return;}if(b.dataset.proxy){if(b.dataset.proxy.startsWith('loopBtn_'))app.sendLoopButton(b.dataset.proxy.slice(8));else bridgeClick(b.dataset.proxy);return;}if(b.dataset.drumToggle!==undefined){const v=b.dataset.drumToggle==='1';const el=$('drumEnable');if(el){el.checked=v;el.dispatchEvent(new Event('change',{bubbles:true}));}app.drumEnabled=v;hud(v?'Drums On':'Drums Off');return;}const a=b.dataset.action; if(a==='save'){bridgeClick('btnSavePreset');return;}if(a==='fullscreen'){toggleFullScreen();return;}if(a==='easy'){easy=!easy;showScreen('home');hud(easy?'Easy Mode enabled':'Easy Mode disabled');return;}});
 root.addEventListener('input',ev=>{
   const drum=ev.target.closest('[data-drum-level]');
   if(drum){hud('DRUM LEVEL',drum.value+'%');return;}
   const slider=ev.target.closest('[data-jm-global-slider]');if(!slider)return;
   const kind=slider.dataset.jmGlobalSlider;
   const value=Number(slider.value);
   slider.style.setProperty('--value-progress',`${Math.round(value/Math.max(1,+slider.max)*100)}%`);
   root.querySelectorAll(kind==='bpm'?'[data-jm-bpm]':'[data-jm-vol]').forEach(el=>el.textContent=Math.round(value));
   hud(kind==='bpm'?'BPM':'MASTER VOLUME',String(Math.round(value))+(kind==='bpm'?'':'%'));
 });
 root.addEventListener('change',ev=>{
   const slider=ev.target.closest('[data-jm-global-slider]');
   if(slider){commitGlobal(slider.dataset.jmGlobalSlider,Number(slider.value));return;}
   if(ev.target.matches('[data-jm-bank-select],[data-jm-slot-select]')){
     const src=$(ev.target.matches('[data-jm-bank-select]')?'presetBank':'presetNum');
     if(!src)return;
     src.selectedIndex=clamp(Number(ev.target.value)||0,0,src.options.length-1);
     // Exactly one load request for the chosen (bank, slot) pair.
     src.dispatchEvent(new Event('change',{bubbles:true}));
     setPresetText();hud('PRESET',`${BANKS[$('presetBank').selectedIndex]||'Clean'} ${$('presetNum').selectedIndex+1}`);
   }
 });
 // Save dialog lives outside the mobile shell. Preserve its original behavior
 // and report requests without claiming successful persistence.
 document.addEventListener('click',e=>{
   const id=e.target.closest('button')?.id;
   if(id==='btnConfirmSave')hud('PRESET','Save requested');
   else if(id==='btnCancelSave')hud('PRESET','Save cancelled');
   else if(id==='whiteNoiseBtn'||id==='toneBtn'){
     queueMicrotask(()=>hud(id==='whiteNoiseBtn'?'WHITE NOISE':'TEST TONE',
       id==='whiteNoiseBtn'?(app.utilState?.noise?.enabled?'ON':'OFF'):(app.utilState?.tone?.enabled?'ON':'OFF')));
   }
 },true);
 $('jmBack').addEventListener('click',()=>{if(active==='params')showScreen('fx');else if(active==='home')popup('CONNECTION',t=>t.innerHTML=`<div class="jm-mode-list"><button data-action="connect">Connect JamMate</button><button data-screen="setup">Setup and Display</button></div>`);else showScreen('home');});
 $('jmConnect').addEventListener('click',()=>bridgeClick('btnConnect'));
 $('jmClose').addEventListener('click',closeModal);modal.addEventListener('click',e=>{if(e.target===modal)closeModal();}); document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!modal.hidden)closeModal();else if(active!=='home')showScreen('home');}});
 // Explicit main menu action handlers inside modal are routed through delegation.
 root.addEventListener('click',ev=>{const b=ev.target.closest('[data-action="connect"]');if(b){closeModal();bridgeClick('btnConnect');}});
 // Broadcast real changes to the mobile widgets; do not fake CPU, transport, or beat telemetry.
 for(const method of ['toggleEffectEnabled','onEffectParamChanged','loadStateFromBlob']){
   const original=app[method];if(typeof original!=='function')continue;
   app[method]=function(...args){
     const result=original.apply(this,args);
     if(method==='toggleEffectEnabled'){
       const fx=args[0];hud(app.config.tabs[fx]?.title||'Effect',this.effectStates[fx]?.enabled?'ON':'OFF');
     }else if(method==='onEffectParamChanged'){
       const [fx,index,value]=args,tab=app.config.tabs[fx],K=tab?.params.knobs.length??0;
       const label=index===0?'POWER':index<=K?tab.params.knobs[index-1]:tab.params.dropdowns[index-K-1];
       const choices=index>K?app.config.dropdowns[label]:null;
       const formatted=index===0?(value?'ON':'OFF'):choices?.[value]??String(value);
       hud(`${tab?.title||'FX'} · ${String(label||'PARAM').replaceAll('_',' ')}`,formatted);
     }else if(method==='loadStateFromBlob')hud('PRESET','Loaded');
     queueMicrotask(()=>{refreshFX();setPresetText();syncGlobal();});
     return result;
   };
 }
 window.jmMobileHUD=hud;
 document.addEventListener('change',e=>{if(e.target.id==='presetBank'||e.target.id==='presetNum')setPresetText();});
 // Easy Mode is configured exclusively in Setup; ordinary Home has no mode button.
 showScreen('home');
 return {showScreen,renderHome,refreshFX,closeModal, setTelemetry({cpu,beat,beatsPerBar,downbeat,bar,loopPhase,looperState,layers}={}){if(Number.isFinite(cpu)){ $('jmCpu').textContent='CPU '+Math.round(cpu)+'%';$('jmMobile').querySelector('.jm-foot-meter i').style.width=clamp(cpu,0,100)+'%';} if(Number.isInteger(beat)&&Number.isInteger(beatsPerBar)&&beatsPerBar>0){const fraction=(beat+1)+'/'+beatsPerBar;$('jmBeatText').textContent=fraction;root.querySelectorAll('.jm-ring-beat').forEach(el=>el.textContent=fraction);root.querySelectorAll('.jm-ring-caption').forEach(el=>el.textContent=Number.isInteger(bar)?'BAR '+(bar+1):'BEAT');$('jmBeatLed').classList.add('is-on');$('jmBeatLed').classList.toggle('is-downbeat',!!downbeat);clearTimeout(beatOffTimeout);beatOffTimeout=setTimeout(()=>$('jmBeatLed').classList.remove('is-on','is-downbeat'),125);}if(Number.isFinite(loopPhase))root.querySelectorAll('.jm-ring.looper').forEach(el=>el.style.setProperty('--ring-progress',Math.round(clamp(loopPhase,0,1)*100)+'%'));if(looperState)root.querySelectorAll('.jm-ring.looper #jmRingState').forEach(el=>el.textContent=String(looperState).toUpperCase());if(Number.isInteger(layers))root.querySelectorAll('.jm-ring.looper .jm-ring-caption').forEach(el=>el.textContent='LAYER '+layers);},setEasy(value){easy=!!value;showScreen('home');},hud};
}
