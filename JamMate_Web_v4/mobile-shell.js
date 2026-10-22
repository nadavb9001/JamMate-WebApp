/** JamMate mobile-first shell. Legacy application remains mounted (and owns BLE/protocol/state).
 * No synthetic timing: graphical ring/beacon are placeholders until transport telemetry is wired. */
export const FX_ORDER = [0,1,2,3,4,15,5,6,7,8,9,10,11,12,13,14,16,17];
const FX_NAMES = ['Gate','Comp','Wah','OvrDrv','Dist','NAM','EQ','Harm','Vibr','Chor','Octv','Flng','Phsr','Trem','Amp','Dely','Rvrb','Gnrc'];
const FX_GLYPHS = ['▥','∿','◁','≋','ϟ','▥','▤','◉','∿','≈','◫','≋','◎','∿','▣','◉','◌','⬡'];
const FX_COLORS = ['#db43ff','#ffbc13','#11dfff','#ff8e20','#ff3156','#f246ed','#00b7ff','#b778ff','#19edc9','#008cff','#ffe018','#ac65ff','#ff4263','#ffe732','#ffbe20','#10e5f5','#a76aff','#b7c8ee'];
export const BANKS=['Clean','Crunch','Overdrive','Distortion','Modulated','Custom1','Custom2'];
const MENU=[['fx','FX','▥','#e43aff'],['looper','LOOPER','▢','#00f58b'],['drums','DRUMS','◉','#ff3456'],['tuner','TUNER','♩','#12afff'],['nam','NAM','≋','#f0a221'],['files','FILES','▤','#ffe627'],['setup','SETUP','⚙','#b9caff']];
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export function installMobileShell(app){
 const root=document.createElement('div'); root.id='jmMobile';
 root.innerHTML=`<header class="jm-head"><button id="jmBack" aria-label="Back" class="jm-icon">☰</button><strong>JAMMATE</strong><button id="jmConnect" class="jm-connect" aria-label="Connect to JamMate">⌁</button></header><div id="jmPage" class="jm-scroll"></div><footer class="jm-foot"><span id="jmCpu">CPU --</span><span class="jm-foot-meter"><i></i></span><span id="jmBeatText">BEAT</span><span id="jmBeatLed" class="jm-beat" aria-label="Awaiting DSP beat"></span></footer><div id="jmOverlay" class="jm-overlay" hidden><div class="jm-sheet" role="dialog" aria-modal="true"><div class="jm-sheet-head"><strong id="jmModalTitle">SETTINGS</strong><button id="jmClose" aria-label="Close">✕</button></div><div id="jmModalBody" class="jm-sheet-body"></div></div></div><div id="jmHud" class="jm-hud" role="status" aria-live="polite"></div>`;
 document.body.appendChild(root); document.body.classList.add('jm-mobile-active');
 const page=$('jmPage'), modal=$('jmOverlay'), mb=$('jmModalBody');
 let active='home', easy=false, currentFX=0, hudTimeout=null, beatOffTimeout=null, mountedTab=null, previousParent=null, previousNext=null;
 const legacy={master:$('masterKnob'),bpm:$('bpmKnob')};
 const connLed=$('statusLed');if(connLed){const updateConnection=()=>{const online=connLed.classList.contains('connected');$('jmConnect').classList.toggle('is-connected',online);$('jmConnect').setAttribute('aria-label',online?'JamMate connected':'Connect JamMate');}; new MutationObserver(updateConnection).observe(connLed,{attributes:true,attributeFilter:['class']});updateConnection();}
 const knobVal=(name,fallback)=>Math.round(legacy[name]?.knob?.value??fallback);
 const popup=(title,renderer)=>{closeModal();$('jmModalTitle').textContent=title; modal.hidden=false; document.body.classList.add('jm-modal-open'); renderer(mb);};
 function restoreMounted(){if(!mountedTab)return;mountedTab.classList.remove('jm-embedded-tab'); if(previousParent){if(previousNext?.parentNode===previousParent)previousParent.insertBefore(mountedTab,previousNext);else previousParent.appendChild(mountedTab);}mountedTab=null;}
 function closeModal(){restoreMounted();modal.hidden=true;mb.replaceChildren();document.body.classList.remove('jm-modal-open');}
 function hud(msg){$('jmHud').textContent=msg; $('jmHud').classList.add('is-visible');clearTimeout(hudTimeout); hudTimeout=setTimeout(()=>$('jmHud').classList.remove('is-visible'),1600);}
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
   if(which==='bpm'){app.bpm=k.value;if(app.drumEnabled)app.sendDrumUpdate();}
   app.sendGlobalUpdate(); syncGlobal();
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
 function globals(){return `<div class="jm-globals"><label class="jm-data jm-bpm" for="jmTempoRange"><span>BPM</span><strong data-jm-bpm>120</strong><input id="jmTempoRange" data-jm-global-slider="bpm" type="range" min="0" max="255" step="1" value="120" aria-label="Tempo in beats per minute"></label><label class="jm-data jm-vol" for="jmVolRange"><span>VOLUME</span><strong data-jm-vol>75</strong><input id="jmVolRange" data-jm-global-slider="master" type="range" min="0" max="100" step="1" value="75" aria-label="Master volume percent"></label></div>`;}
 function navTiles(compact=easy){return `<div class="jm-menu ${compact?'jm-menu-easy':''}">${MENU.map(([id,label,icon,color])=>`<button class="jm-menu-tile" style="--tone:${color}" data-screen="${id}" aria-label="Open ${label}"><b class="jm-symbol">${icon}</b><span>${compact?({looper:'LOOP',drums:'DRUM',tuner:'TUNE',files:'FILE',setup:'SET'}[id]||label):label}</span></button>`).join('')}</div>`;}
 function save(){return `<button class="jm-save" data-action="save">⇩ &nbsp; SAVE PRESET</button>`;}
 function tiles(compact=false){return `<div class="jm-effects ${compact?'jm-effects-easy':''}">${FX_ORDER.map((idx,i)=>{let on=!!app.effectStates[idx]?.enabled;return `<div class="jm-effect" data-fx="${idx}" style="--tone:${FX_COLORS[i]}"><button class="jm-effect-open" data-open-fx="${idx}" aria-label="Edit ${FX_NAMES[i]}" ><span class="jm-effect-glyph">${FX_GLYPHS[i]}</span><b>${FX_NAMES[i]}</b></button><button class="jm-effect-toggle ${on?'on':''}" data-toggle-fx="${idx}" aria-label="Toggle ${FX_NAMES[i]}" aria-pressed="${on}">${on?'ON':'OFF'}</button></div>`;}).join('')}</div>`;}
 function refreshFX(){for(const b of root.querySelectorAll('[data-toggle-fx]')){const on=!!app.effectStates[+b.dataset.toggleFx]?.enabled;b.classList.toggle('on',on);b.textContent=on?'ON':'OFF';b.setAttribute('aria-pressed',String(on));}const en=$('jmFxOn');if(en) en.checked=!!app.effectStates[currentFX]?.enabled;}
 function renderHome(){page.scrollTop=0;page.innerHTML=`<div class="jm-home">${preset()}${globals()}${navTiles()}${easy?`<div class="jm-section-cap"><strong>ALL EFFECTS</strong><span>Tap an effect to edit</span></div>${tiles(true)}`:''}${save()}</div>`;syncGlobal();setPresetText();refreshFX();}
 function showScreen(name){closeModal();active=name; $('jmBack').textContent=name==='home'?'☰':'❮'; if(name==='home'){renderHome();return;} if(name==='fx'){page.innerHTML=`<div class="jm-title">FX</div><div class="jm-section-cap">18 EFFECTS · TOUCH TO EDIT</div>${tiles()}`;refreshFX();return;} if(name==='params'){renderParam(page,currentFX);return;} if(name==='looper'){renderLooper(page);return;} if(name==='drums'){renderDrums(page);return;} if(name==='tuner'||name==='setup'||name==='nam'||name==='files'){page.replaceChildren();mountLegacy(name,page);return;} }
 function go(name){if(easy&&name!=='home'){popup(MENU.find(x=>x[0]===name)?.[1]||name.toUpperCase(),target=>{if(name==='fx') target.innerHTML=`${tiles(true)}`;else if(name==='looper')renderLooper(target);else if(name==='drums')renderDrums(target);else mountLegacy(name,target);refreshFX();});return;}showScreen(name);}
 function paramTile(fx,p,k,type,options){const label=esc(p.replaceAll('_',' '));if(type==='slider'){const v=app.effectParams[fx]?.[`knob${k}`]??50;return `<label class="jm-param" style="--tone:#11ddf5"><span>${label}</span><strong data-param-value="${k}">${v}</strong><input data-knob="${k}" type="range" min="0" max="100" value="${v}" aria-label="${label}"></label>`;}const v=app.effectParams[fx]?.[`dropdown${k}`]??0;return `<label class="jm-param jm-choice"><span>${label}</span><select data-dropdown="${k}" aria-label="${label}">${options.map((o,i)=>`<option value="${i}" ${i===v?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;}
 function renderParam(target,fx){const effect=app.config.tabs[fx];if(!effect)return; const pos=FX_ORDER.indexOf(fx),color=FX_COLORS[pos]||'#18e9f4'; target.innerHTML=`<div class="jm-param-screen" style="--param-tone:${color}"><div class="jm-param-head"><div><span>FX PARAMETERS</span><h2>${esc(effect.title)}</h2></div><label class="jm-param-enable">ON <input id="jmFxOn" type="checkbox" ${app.effectStates[fx]?.enabled?'checked':''}/></label></div><div class="jm-param-list">${effect.params.knobs.map((p,k)=>paramTile(fx,p,k,'slider')).join('')}${effect.params.dropdowns.map((p,k)=>paramTile(fx,p,k,'dropdown',app.config.dropdowns[p]||[])).join('')}</div></div>`;target.querySelectorAll('[data-knob]').forEach(el=>{el.addEventListener('input',()=>{target.querySelector(`[data-param-value="${el.dataset.knob}"]`).textContent=el.value;});el.addEventListener('change',()=>app.onEffectParamChanged(fx,1+ +el.dataset.knob,+el.value));});target.querySelectorAll('[data-dropdown]').forEach(el=>el.addEventListener('change',()=>app.onEffectParamChanged(fx,1+effect.params.knobs.length+ +el.dataset.dropdown,+el.value)));target.querySelector('#jmFxOn').addEventListener('change',e=>{app.onEffectParamChanged(fx,0,e.target.checked?1:0);refreshFX();});}
 function editFX(idx){currentFX=idx; app.currentEffect=idx; if(easy){popup(app.config.tabs[idx]?.title||'EFFECT', t=>renderParam(t,idx));}else{active='params';$('jmBack').textContent='❮';renderParam(page,idx);}}
 function bridgeClick(id){const el=$(id);if(el)el.click();else hud('Unavailable');}
 function bridgeSelect(id,val){const el=$(id);if(!el)return;el.value=String(val);el.dispatchEvent(new Event('change',{bubbles:true}));}
 function ring(klass){return `<div class="jm-ring ${klass}" aria-label="DSP transport timing pending"><div class="jm-ring-inner"><small id="jmRingState">${klass==='drum'?'BEAT':'LOOPER'}</small><strong class="jm-ring-beat">—/4</strong><span class="jm-ring-caption">WAITING FOR DSP</span></div></div>`;}
 function renderLooper(target){target.innerHTML=`<div class="jm-title">LOOPER</div>${ring('looper')}<div class="jm-metric-row"><div>BARS <b>—</b></div><div>BEAT <b>—/4</b></div><div>LAYER <b>—</b></div></div><div class="jm-three-actions"><button class="red" data-proxy="loopBtn_rec">● REC</button><button class="green" data-proxy="loopBtn_stop">■ STOP</button><button class="blue" data-proxy="loopBtn_undo">↶ UNDO</button></div><div class="jm-edit-list"><label>TRACK<select data-bind="trackSelect">${[0,1,2,3].map(i=>`<option value="${i}">Track ${i+1}</option>`).join('')}</select></label><label>SYNC<select data-bind="loopSync"><option value="0">None</option><option value="1">Beat</option><option value="2">Bar</option><option value="3">Drum Start</option></select></label><label>LENGTH<select data-bind="loopLength"><option value="0">Free</option><option value="4">4 Bars</option><option value="8">8 Bars</option><option value="12">12 Bars</option><option value="16">16 Bars</option></select></label><label>AUTO ARM<input data-check="autoArm" type="checkbox"></label><label>PLAYBACK<select data-bind="playbackMode"><option value="0">Parallel</option><option value="1">Series</option></select></label><label>BOUNCE<input data-check="bounceMode" type="checkbox"></label></div><div class="jm-secondary-actions"><button data-proxy="loopBtn_redo">REDO</button><button data-proxy="loopBtn_clear">CLEAR</button><button data-proxy="loopBtn_stopAll">STOP ALL</button></div>`;syncBindings(target);}
 function renderDrums(target){target.innerHTML=`<div class="jm-title">DRUMS</div>${ring('drum')}<div class="jm-drum-settings"><label>STYLE<select data-bind="drumStyle">${Array.from($('drumStyle')?.options||[]).map(o=>`<option value="${esc(o.value)}">${esc(o.textContent)}</option>`).join('')}</select></label><label>LEVEL<input type="range" data-drum-level min="0" max="100" value="${app.drumLevel}"></label><label>BPM <strong data-jm-bpm>${knobVal('bpm',120)}</strong><input data-jm-global-slider="bpm" type="range" min="0" max="255" step="1" value="${knobVal('bpm',120)}" aria-label="Drum tempo"></label></div><div class="jm-three-actions"><button class="green" data-drum-toggle="1">▶ START</button><button class="red" data-drum-toggle="0">■ STOP</button></div><small class="jm-note">Beat graphic reserved for DSP → ESP → web telemetry; not locally generated.</small>`;syncBindings(target);syncGlobal();}
 function syncBindings(target){target.querySelectorAll('[data-bind]').forEach(sel=>{const src=$(sel.dataset.bind);if(src){sel.value=src.value;sel.addEventListener('change',()=>bridgeSelect(sel.dataset.bind,sel.value));}});target.querySelectorAll('[data-check]').forEach(el=>{const src=$(el.dataset.check);if(src){el.checked=src.checked;el.addEventListener('change',()=>{src.checked=el.checked;src.dispatchEvent(new Event('change',{bubbles:true}));});}});target.querySelectorAll('[data-drum-level]').forEach(el=>el.addEventListener('change',()=>{app.drumLevel=Number(el.value);const k=$('drumLevelKnob')?.knob;if(k){k.value=app.drumLevel;k.draw();}app.sendDrumUpdate();}));}
 function mountLegacy(name,target){const id={tuner:'tuner-tab',setup:'setup-tab',files:'loader-tab',nam:'nam-tab'}[name];const section=$(id);if(!section){target.textContent='Unavailable';return;}restoreMounted();previousParent=section.parentNode;previousNext=section.nextSibling;mountedTab=section;target.append(section);section.classList.add('jm-embedded-tab','active');const heading=document.createElement('h2');heading.className='jm-title jm-mounted-title';heading.textContent={tuner:'TUNER',setup:'SETUP',files:'FILES',nam:'NAM'}[name];target.prepend(heading);
  if(name==='setup'){
    const tools=document.createElement('section');
    tools.className='jm-setup-display';
    tools.innerHTML=`<div class="jm-setup-display-title">DISPLAY</div><div class="jm-setup-choices"><button type="button" class="jm-easy-setting ${easy?'active':''}" data-action="easy" aria-pressed="${easy}"><span>EASY MODE</span><span class="jm-easy-setting-state">${easy?'ON':'OFF'}</span></button><button type="button" class="jm-fullscreen-btn" data-action="fullscreen">${isFullScreen()?'EXIT FULLSCREEN':'FULL SCREEN'}</button></div>`;
    heading.after(tools);
  }
 }
 // single delegated handler so newly rendered screens use identical callbacks.
 root.addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return; if(b.dataset.screen){go(b.dataset.screen);return;}if(b.dataset.openFx!==undefined){editFX(+b.dataset.openFx);return;}if(b.dataset.toggleFx!==undefined){app.toggleEffectEnabled(+b.dataset.toggleFx);refreshFX();return;}if(b.dataset.proxy){bridgeClick(b.dataset.proxy);return;}if(b.dataset.drumToggle!==undefined){const v=b.dataset.drumToggle==='1';const el=$('drumEnable');if(el){el.checked=v;el.dispatchEvent(new Event('change',{bubbles:true}));}app.drumEnabled=v;hud(v?'Drums On':'Drums Off');return;}const a=b.dataset.action; if(a==='save'){bridgeClick('btnSavePreset');return;}if(a==='fullscreen'){toggleFullScreen();return;}if(a==='easy'){easy=!easy;showScreen('home');hud(easy?'Easy Mode enabled':'Easy Mode disabled');return;}});
 root.addEventListener('input',ev=>{
   const slider=ev.target.closest('[data-jm-global-slider]');if(!slider)return;
   const kind=slider.dataset.jmGlobalSlider;
   const value=Number(slider.value);
   slider.style.setProperty('--value-progress',`${Math.round(value/Math.max(1,+slider.max)*100)}%`);
   root.querySelectorAll(kind==='bpm'?'[data-jm-bpm]':'[data-jm-vol]').forEach(el=>el.textContent=Math.round(value));
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
     setPresetText();
   }
 });
 $('jmBack').addEventListener('click',()=>{if(active==='params')showScreen('fx');else if(active==='home')popup('CONNECTION',t=>t.innerHTML=`<div class="jm-mode-list"><button data-action="connect">Connect JamMate</button><button data-screen="setup">Setup and Display</button></div>`);else showScreen('home');});
 $('jmConnect').addEventListener('click',()=>bridgeClick('btnConnect'));
 $('jmClose').addEventListener('click',closeModal);modal.addEventListener('click',e=>{if(e.target===modal)closeModal();}); document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!modal.hidden)closeModal();else if(active!=='home')showScreen('home');}});
 // Explicit main menu action handlers inside modal are routed through delegation.
 root.addEventListener('click',ev=>{const b=ev.target.closest('[data-action="connect"]');if(b){closeModal();bridgeClick('btnConnect');}});
 // Broadcast real changes to the mobile widgets; do not fake CPU, transport, or beat telemetry.
 for(const method of ['toggleEffectEnabled','onEffectParamChanged','loadStateFromBlob']){const original=app[method];if(typeof original==='function'){app[method]=function(...args){const result=original.apply(this,args);queueMicrotask(()=>{refreshFX();setPresetText();syncGlobal();});return result;};}}
 window.jmMobileHUD=hud;
 document.addEventListener('change',e=>{if(e.target.id==='presetBank'||e.target.id==='presetNum')setPresetText();});
 // Easy Mode is configured exclusively in Setup; ordinary Home has no mode button.
 showScreen('home');
 return {showScreen,renderHome,refreshFX,closeModal, setTelemetry({cpu,beat,beatsPerBar,downbeat,bar,loopPhase,looperState,layers}={}){if(Number.isFinite(cpu)){ $('jmCpu').textContent='CPU '+Math.round(cpu)+'%';$('jmMobile').querySelector('.jm-foot-meter i').style.width=clamp(cpu,0,100)+'%';} if(Number.isInteger(beat)&&Number.isInteger(beatsPerBar)&&beatsPerBar>0){const fraction=(beat+1)+'/'+beatsPerBar;$('jmBeatText').textContent=fraction;root.querySelectorAll('.jm-ring-beat').forEach(el=>el.textContent=fraction);root.querySelectorAll('.jm-ring-caption').forEach(el=>el.textContent=Number.isInteger(bar)?'BAR '+(bar+1):'BEAT');$('jmBeatLed').classList.add('is-on');$('jmBeatLed').classList.toggle('is-downbeat',!!downbeat);clearTimeout(beatOffTimeout);beatOffTimeout=setTimeout(()=>$('jmBeatLed').classList.remove('is-on','is-downbeat'),125);}if(Number.isFinite(loopPhase))root.querySelectorAll('.jm-ring.looper').forEach(el=>el.style.setProperty('--ring-progress',Math.round(clamp(loopPhase,0,1)*100)+'%'));if(looperState)root.querySelectorAll('.jm-ring.looper #jmRingState').forEach(el=>el.textContent=String(looperState).toUpperCase());if(Number.isInteger(layers))root.querySelectorAll('.jm-ring.looper .jm-ring-caption').forEach(el=>el.textContent='LAYER '+layers);},setEasy(value){easy=!!value;showScreen('home');},hud};
}
