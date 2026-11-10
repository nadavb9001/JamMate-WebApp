/**
 * JamMate Multi-Effect Controller — app.js
 *
 * effectParams[i] key contract (must match View.js reads):
 *   effectParams[i]['knob0']     = knob 0 value  (0–255)
 *   effectParams[i]['knob1']     = knob 1 value  …
 *   effectParams[i]['dropdown0'] = dropdown 0 selectedIndex
 *   effectParams[i]['dropdown1'] = dropdown 1 selectedIndex …
 *
 * onParam callback (fired by View.showEffectControls):
 *   onParam(flatIdx, value)
 *     flatIdx 0      → checkbox   value: 0|1
 *     flatIdx 1..K   → knob k-1   value: 0–255
 *     flatIdx K+1..  → dropdown d value: selectedIndex
 */
import { NamLoader } from './NamLoader.js?v=8.7.1';
import { NamBrowserV2b } from './ui/NamBrowserV2b.js?v=8.7.1';
import { APP_CONFIG } from './config.js?v=8.7.1';
import { View } from './ui/View.js?v=8.7.1';
import { Knob } from './ui/Knob.js?v=8.7.1';
import { BLEService } from './services/BLEService.js?v=8.7.1';
import { Protocol } from './services/Protocol.js?v=8.7.1';
import { upgradeSelects } from './ui/CustomSelect.js?v=8.7.1';
import { installThemeManager } from './ui/ThemeManager.js?v=8.7.1';

import { defaultEffectOrder, wireOrder, mergeDspOrder, insertEffect } from './services/EffectOrder.js?v=8.7.1';

const PRESETS_LOCKED = false;

export const app = {
  config: JSON.parse(JSON.stringify(APP_CONFIG)),
  bundledConfig: JSON.parse(JSON.stringify(APP_CONFIG)),
  sendDevice(packet){
    return BLEService.send(packet).catch(e=>{View.updateStatus(e.message);return false;});
  },
  currentEffect: null,
  drumPattern: Array(9).fill(null).map(() => Array(16).fill(0)),
  effectStates: {},
  effectParams: {},
  currentEQPoints: null,
  utilState: {
    noise: { enabled: false, level: 0 },
    tone:  { enabled: false, level: 0, freq: 670 }
  },
  audioData: null,
  sampleRate: null,
  fullFFT: null,
  iirDesigner: null,
  isUpdatingUI: false,
  effectOrder: null,
  tunerEnabled: false,
  bypassEnabled: false,

  // Drum / looper state
  drumEnabled: false,
  drumLevel: 50,
  drumStyle: 0,
  drumFill: 0,
  drumNumber: 1,
  bpm: 120,
  looperEnabled: false,
  loopLevel: 50,
  loopNumber: 1,
  loopSync: 0,
  loopArm: 0,
  loopLength: 0,
  loopTracks: 1,

  // ============================================================
  // init
  // ============================================================
  init() {
    console.log('JamMate Controller Starting...');

    const effectCount = this.config.tabs.length;
    console.log(`[APP] Initializing ${effectCount} effects`);
    this.effectStates = {};
    this.effectParams = {};
    this.effectOrder  = [];
    for (let i = 0; i < effectCount; i++) {
      this.effectStates[i] = { enabled: false, selected: false };
      this.effectParams[i] = {};
      this.effectOrder.push(i);
    }

    this.effectOrder = defaultEffectOrder(this.config.tabs);

    // Drum state defaults
    this.drumEnabled  = false;
    this.drumLevel    = 50;
    this.drumStyle    = 0;
    this.drumFill     = 0;
    this.drumNumber   = 1;
    this.bpm          = 120;
    this.looperEnabled = false;
    this.loopLevel    = 50;
    this.loopNumber   = 1;
    this.loopSync     = 0;
    this.loopArm      = 0;
    this.loopLength   = 0;
    this.loopTracks   = 1;

    console.info("[JamMate] Web build v8.7.1");
    View.init(this);
    BLEService.onStatusChange=status=>{
      this.connectionError=BLEService.lastError||null;View.updateConnectionStatus(status);
      if(status==='connected')this.syncEffectOrder();
      if(status==='disconnected'||status==='reconnecting'){
        window.JamMateMobile?.setTelemetry({cpu:null});View.updateTuner(0);
      }
    };

    BLEService.onSyncError=message=>{console.warn('[SYNC]',message);View.updateStatus(message);};
    BLEService.onSnapshot=bytes=>{
      if(bytes.length<42||bytes[0]>6||bytes[1]>4)throw Error('Invalid active preset');
      const layout=Array.from({length:18},(_,i)=>[bytes[2+2*i],bytes[3+2*i]]);
      if(layout.some(([k,d])=>k>16||d>10))throw Error('Invalid active preset layout');
      document.getElementById('presetBank').selectedIndex=bytes[0];document.getElementById('presetNum').selectedIndex=bytes[1];
      this.loadStateFromBlob(bytes.slice(38).buffer,true,layout);
      if(this.currentEffect!==null){
        const fx=this.currentEffect,tab=this.config.tabs[fx],params=this.effectParams[fx]||{};
        tab.params.knobs.forEach((_,i)=>window.JamMateMobile?.syncParam?.(fx,1+i,params['knob'+i]));
        tab.params.dropdowns.forEach((_,i)=>window.JamMateMobile?.syncParam?.(fx,1+tab.params.knobs.length+i,params['dropdown'+i]));
      }
      window.dispatchEvent(new Event('jammate:remote-state'));
    };
    BLEService.onDelta=p=>{
      if(p.fx===0xfe&&p.kind===3){if(p.index===0)this.syncMasterVolume(p.value);else if(p.index===1)this.syncRemoteBpm(p.value);return;}
      if(p.fx===0xfd&&p.kind===4&&p.index<12&&p.bytes.length===5){
        const b=p.bytes;this.currentEQPoints[p.index]={enabled:!!b[0],freq:b[1]|b[2]<<8,gain:b[3]>127?b[3]-256:b[3],q:b[4]/10};
        this.isUpdatingUI=true;try{this.iirDesigner?.loadPoints(this.currentEQPoints);}finally{this.isUpdatingUI=false;}return;
      }
      const tab=this.config.tabs[p.fx];if(!tab)return;const k=tab.params.knobs.length,d=tab.params.dropdowns.length;
      if(p.kind===0&&p.index===0)this.syncRemoteEffectParam(p.fx,0,p.value);
      else if(p.kind===1&&p.index<k)this.syncRemoteEffectParam(p.fx,1+p.index,p.value);
      else if(p.kind===2&&p.index<d)this.syncRemoteEffectParam(p.fx,1+k+p.index,p.value);
    };

    this.setupTabs();
    View.setupEffectsGrid(this.config);

    View.setupDrumGrid(this.drumPattern, (cell, row, col, newVelocity) => {
      this.drumPattern[row][col] = newVelocity;
      View.updateDrumCell(cell, newVelocity);
      this.sendDevice(Protocol.createDrumPatternPacket(this.drumPattern));
    });

    this.setupStaticKnobs();
    this.setupFileUpload();
    this.setupGlobalListeners();
    this.setupNamTab();          // ← NAM tab (v2, correct)
    this.setupPresetListeners();
    this.setupDrumControls();
    upgradeSelects();

    // Default to Easy Mode button state
    const btnEasyMode = document.getElementById('btnEasyMode');
    if (btnEasyMode && document.getElementById('effects-tab').classList.contains('easy-mode')) {
      btnEasyMode.style.background = 'var(--color-accent)';
      btnEasyMode.style.color = '#000';
      if (this._resizeEasyMode) {
        requestAnimationFrame(() => this._resizeEasyMode());
      }
    }
  },

  // ============================================================
  // setupNamTab  (v2 — TONE3000 OAuth + search + BLE transfer)
  // ============================================================
  setupNamTab() {
    NamLoader.init({
      managedBrowser: true,
      onStatus: (msg) => View.updateStatus(msg),
      onProgress: (pct, msg) => View.updateStatus(`NAM: ${msg} (${pct}%)`),
      onAuthComplete: () => NamBrowserV2b.search(1)
    });
    NamBrowserV2b.init(NamLoader);
  },

  // ============================================================
  // setupDrumControls
  // ============================================================
  setupDrumControls() {
    const wire = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', handler);
    };

    wire('drumEnable',   (e) => { this.drumEnabled   = e.target.checked; this.sendDrumUpdate(); });
    wire('looperEnable', (e) => { this.looperEnabled = e.target.checked; this.sendDrumUpdate(); });

    const wireKnob = (id, prop, label) => {
      const el = document.getElementById(id);
      if (!el || el._knobInit) return;
      el._knobInit = true;
      const knob = new Knob(el, 0, 100, this[prop],
        (v) => View.updateStatus(`${label}: ${Math.round(v)}`));
      knob.onrelease = () => { this[prop] = knob.value; this.sendDrumUpdate(); };
    };
    wireKnob('drumLevelKnob', 'drumLevel', 'Drum Vol');
    wireKnob('loopLevelKnob', 'loopLevel', 'Loop Vol');

    [
      ['drumStyle',  'drumStyle'],
      ['drumFill',   'drumFill'],
      ['drumNumber', 'drumNumber'],
    ].forEach(([id, prop]) => {
      wire(id, (e) => { this[prop] = parseInt(e.target.value); this.sendDrumUpdate(); });
    });

    ['loopSync', 'loopLength'].forEach(id => {
      wire(id, (e) => { this[id] = parseInt(e.target.value); this.sendLoopConfig(); });
    });
    wire('trackSelect', (e) => { this.trackSelect = parseInt(e.target.value); this.sendLoopConfig(); });

    const wireCheck = (id, prop, sendFn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', (e) => { this[prop] = e.target.checked; sendFn.call(this); });
    };
    wireCheck('autoArm',    'autoArm',    this.sendLoopConfig);
    wireCheck('bounceMode', 'bounceMode', this.sendLoopConfig);

    wire('playbackMode', (e) => { this.playbackMode = parseInt(e.target.value); this.sendLoopConfig(); });
    wire('muteMask',     (e) => { this.muteMask     = parseInt(e.target.value); this.sendLoopConfig(); });
    wire('soloMask',     (e) => { this.soloMask     = parseInt(e.target.value); this.sendLoopConfig(); });

    ['rec', 'stop', 'clear', 'undo', 'redo', 'stopAll', 'clearAll'].forEach(btn => {
      const el = document.getElementById(`loopBtn_${btn}`);
      if (el) el.addEventListener('click', () => this.sendLoopButton(btn));
    });

    wire('usbMode', (e) => this.sendUSBMode(parseInt(e.target.value)));
    wireCheck('uartEnable', 'uartEnabled', function() { this.sendUARTControl(this.uartEnabled); });

    const btnSaveToSD = document.getElementById('btnSaveToSD');
    if (btnSaveToSD) {
      btnSaveToSD.addEventListener('click', () => {
        this.sendDevice(Protocol.createSaveToSD());
        View.updateStatus('Saving to SD...');
      });
    }

    const midiFileInput = document.getElementById('drumMidiFile');
    const btnLoadMidi   = document.getElementById('btnLoadDrumMidi');
    if (btnLoadMidi && midiFileInput) {
      btnLoadMidi.addEventListener('click', () => midiFileInput.click());
      midiFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        midiFileInput.value = '';
        const reader = new FileReader();
        reader.onload = (ev) => this.streamMidiToESP(file.name, ev.target.result);
        reader.readAsArrayBuffer(file);
      });
    }
  },

  // ============================================================
  // streamMidiToESP — sends raw MIDI bytes to ESP in BLE chunks
  // ============================================================
  async streamMidiToESP(name, buffer) {
    View.updateStatus(`MIDI: sending ${name}…`);
    try{
      await BLEService.uploadResource('midi',new Uint8Array(buffer),name,{onProgress:(done,total)=>View.updateStatus(`MIDI: ${done}/${total} bytes`)});
      View.updateStatus(`MIDI sent to ESP: ${name}`);
    }catch(e){View.updateStatus('MIDI transfer failed: '+e.message);}

  },

  // ============================================================
  // Audio-engine control sends: serialize DRUM/LOOP over one BLE queue.
  // The DSP only renders loops when its looper enable flag is set by DRUM.
  // Do not allow a one-shot REC to overtake the enable/config packet.
  // ============================================================
  _sendTransportOrdered(packets) {
    const sequence = this._transportSendTail || Promise.resolve();
    const next = sequence.catch(() => {}).then(async () => {
      for (const packet of packets) await BLEService.send(packet);
    });
    this._transportSendTail = next;
    next.catch(e => View.updateStatus(`Transport send failed: ${e.message}`));
    return next;
  },
  _drumPacket() {
    const k = document.getElementById('bpmKnob')?.knob;
    return Protocol.createDrumUpdate(
      this.drumEnabled, this.drumLevel ?? 50, k?.value ?? this.bpm ?? 120,
      this.drumStyle ?? 0, this.drumFill ?? 0, this.drumNumber ?? 1,
      this.looperEnabled, this.loopLevel ?? 50, this.loopSync ?? 0,
      this.autoArm ?? false, this.loopLength ?? 0, this.trackSelect ?? 0
    );
  },
  _loopPacket(btn) {
    // LOOP byte 15 is 0..127, whereas the UI's level is 0..100.
    // The DRUM mirror uses 0..100; conversion here prevents changes in loudness
    // whenever a looper button or config packet is sent.
    return Protocol.createLoopButtons(
      this.trackSelect ?? 0,
      btn === 'rec', btn === 'stop', btn === 'clear', btn === 'undo',
      btn === 'redo', btn === 'stopAll', btn === 'clearAll',
      this.loopSync ?? 0, this.playbackMode ?? 0, this.loopLength ?? 0,
      this.autoArm ?? false, this.bounceMode ?? false,
      this.muteMask ?? 0, this.soloMask ?? 0,
      Math.round(Math.max(0, Math.min(100, this.loopLevel ?? 50)) * 127 / 100)
    );
  },
  _enableLooperForCommand() {
    if (this.looperEnabled) return false;
    this.looperEnabled = true;
    const input = document.getElementById('looperEnable');
    if (input) input.checked = true;
    return true;
  },
  sendDrumUpdate() {
    if (this.isUpdatingUI) return Promise.resolve();
    return this._sendTransportOrdered([this._drumPacket()]);
  },
  sendLoopButton(btn) {
    if (this.isUpdatingUI) return Promise.resolve();
    const enabledNow = btn === 'rec' && this._enableLooperForCommand();
    const packets = enabledNow ? [Protocol.createLooperEnable(true)] : [];
    packets.push(this._loopPacket(btn));
    const sync = ['Manual', 'Beat', 'Bar', 'Drum Start'][this.loopSync ?? 0] || 'Manual';
    View.updateStatus(`Looper ${String(btn).toUpperCase()} requested (${sync})`);
    return this._sendTransportOrdered(packets);
  },
  sendLooperEnable(enabled) {
    if (this.isUpdatingUI) return Promise.resolve();
    this.looperEnabled=!!enabled;
    const input=document.getElementById('looperEnable');if(input)input.checked=!!enabled;
    View.updateStatus(`Looper ${enabled?'enabled':'disabled'} (requested)`);
    return this._sendTransportOrdered([Protocol.createLooperEnable(!!enabled)]);
  },
  sendLoopConfig() {
    if (this.isUpdatingUI) return Promise.resolve();
    // LOOP settings do not need to change the drum engine's running state.
    // REC independently enables the looper when necessary (cmd 0x47).
    const packets = [this._loopPacket(null)];
    return this._sendTransportOrdered(packets);
  },

  // ============================================================
  // sendUSBMode
  // ============================================================
  sendUSBMode(mode) {
    this.usbMode = mode;
    const names = ['USB Off', 'USB Serial', 'USB Audio', 'USB MIDI Host'];
    View.updateStatus(names[mode] || `USB mode ${mode}`);
    this.sendDevice(Protocol.createUSBMode(mode));
  },

  // ============================================================
  // sendUARTControl
  // ============================================================
  sendUARTControl(enable) {
    this.uartEnabled = enable;
    View.updateStatus(enable ? 'UART Link ON' : 'UART Link OFF');
    this.sendDevice(Protocol.createUARTControl(enable));
  },

  // ============================================================
  // loadStateFromBlob
  // ============================================================
  // State handshake is authoritative for the global master level.
  // Preset-load replies are NOT: only explicit volume updates affect it.
  syncRemoteBpm(value){
    if(!Number.isFinite(value)||value<20||value>250)return;
    if(this.bpm===Math.round(value))return;
    this.bpm=Math.round(value);
    const knob=document.getElementById('bpmKnob')?.knob;
    if(knob){knob.value=this.bpm;knob.draw();}
    document.querySelectorAll('[data-jm-bpm]').forEach(el=>el.textContent=String(this.bpm));
    document.querySelectorAll('[data-jm-global-slider="bpm"]').forEach(el=>{
      if(document.activeElement!==el)el.value=String(this.bpm);
    });
  },
  syncRemoteEffectParam(fx,flat,value){
    if(!Number.isInteger(fx)||fx<0||fx>=18||!this.config.tabs[fx])return;
    if(!Number.isInteger(flat)||!Number.isInteger(value))return;
    const cfg=this.config.tabs[fx],K=cfg.params.knobs.length,D=cfg.params.dropdowns.length;
    if(flat>K+D)return;
    if(!this.effectParams[fx])this.effectParams[fx]={};
    if(!this.effectStates[fx])this.effectStates[fx]={enabled:false,selected:false};
    if(flat===0)this.effectStates[fx].enabled=!!value;
    else if(flat<=K)this.effectParams[fx][`knob${flat-1}`]=value;
    else this.effectParams[fx][`dropdown${flat-K-1}`]=value;
    View.updateEffectButtons(this.effectStates);
    window.JamMateMobile?.syncParam?.(fx,flat,value);
    if(this.currentEffect===fx && flat!==0&&!document.body?.classList.contains('jm-mobile-active')){
      const legacy=document.querySelector('#effectControls');
      // Control widgets are rebuilt only after dragging ends; don't steal focus.
      if(legacy && !legacy.contains(document.activeElement)){
        const previous=this.isUpdatingUI;this.isUpdatingUI=true;
        try{this.selectEffect(fx);}finally{this.isUpdatingUI=previous;}
      }
    }
  },
  syncRemoteControl(raw){
    // raw: drumEnable, drumLevel, style, pattern, drumBpm,
    //      loopEnable, rawLevel(0..127), sync, arm, bars, track, playMode
    const [drumEnabled,drumLevel,drumStyle,drumNumber,drumBpm,
       looperEnabled,loopRaw,loopSync,loopArm,loopLength,trackSelect,playbackMode,
      bounceMode=0,muteMask=0,soloMask=0,drumFill=0,tunerEnabled=0,bypassEnabled=0]=raw;
    Object.assign(this,{drumEnabled:!!drumEnabled,drumLevel,drumStyle,drumNumber,
      looperEnabled:!!looperEnabled,loopLevel:Math.round(loopRaw*100/127),
      loopSync,loopArm,autoArm:!!loopArm,loopLength,trackSelect,playbackMode,
      bounceMode:!!bounceMode,muteMask,soloMask,drumFill,tunerEnabled:!!tunerEnabled,bypassEnabled:!!bypassEnabled});
    this.syncRemoteBpm(drumBpm);
    // Update original fields silently: dispatching change would resend to DSP.
    const fields={drumStyle,drumLevel,drumNumber,drumFill,loopSync,loopLength,trackSelect,playbackMode,muteMask,soloMask};
    for(const [id,value] of Object.entries(fields)){
      const el=document.getElementById(id);if(el&&document.activeElement!==el)el.value=String(value);
    }
    for(const [id,value]of Object.entries({drumEnable:drumEnabled,looperEnable:looperEnabled,autoArm:loopArm,bounceMode,tunerEnable:tunerEnabled})){
      const el=document.getElementById(id);if(el)el.checked=!!value;
    }
    for(const [id,value]of [['drumLevelKnob',drumLevel],['loopLevelKnob',this.loopLevel]]){const knob=document.getElementById(id)?.knob;if(knob){knob.value=value;knob.draw();}}
    window.JamMateMobile?.syncControls?.(this);
  },
  syncMasterVolume(value) {
    if (!Number.isFinite(value) || value < 0 || value > 100) return;
    const masterEl = document.getElementById('masterKnob');
    if (masterEl?.knob) {
      masterEl.knob.value = Math.round(value);
      masterEl.knob.draw();
    }
    window.dispatchEvent(new Event('jammate:master-volume'));
  },

  loadStateFromBlob(blob, syncMaster = false,layout=null) {
    this.isUpdatingUI = true;
    try {
      const state = Protocol.deserializeState(blob,layout);
      if (syncMaster) this.syncMasterVolume(state.master);

      for (let i = 0; i < 18; i++) {
        if (!this.effectStates[i]) this.effectStates[i] = { enabled: false, selected: false };
        if (!this.effectParams[i]) this.effectParams[i] = {};
      }

      Object.keys(state.effectStates).forEach(idx => {
        const i = parseInt(idx);
        if (i >= 18) return;
        const config = this.config.tabs[i];
        if (!config) return;

        this.effectStates[i].enabled = state.effectStates[i].enabled;

        const kCount = (config.params.knobs || []).length;
        for (let k = 0; k < kCount; k++) {
          const v = state.effectParams[i] ? state.effectParams[i][`knob${k}`] : undefined;
          this.effectParams[i][`knob${k}`] = v !== undefined ? v : 50;
        }

        const dCount = (config.params.dropdowns || []).length;
        for (let d = 0; d < dCount; d++) {
          const v = state.effectParams[i] ? state.effectParams[i][`dropdown${d}`] : undefined;
          this.effectParams[i][`dropdown${d}`] = v !== undefined ? v : 0;
        }
      });

      if (state.eqPoints && state.eqPoints.length > 0) {
        this.currentEQPoints = state.eqPoints;
        if (this.iirDesigner) {
          this.iirDesigner.loadPoints(this.currentEQPoints);
          this.iirDesigner.masterPoints.forEach((_, bandIdx) => {
            this.iirDesigner.triggerDataChange(bandIdx);
          });
        }
      }

      View.updateEffectButtons(this.effectStates);
      if (this.currentEffect !== null) this.selectEffect(this.currentEffect);

      this.syncRemoteBpm(state.bpm);

      this.presetName=state.name;
      View.updateStatus(`Loaded: ${state.name}`);
    } catch (e) {
      console.error('Load Failed:', e);
      View.updateStatus('Load failed — see console');
    }
    this.isUpdatingUI = false;
  },

  // ============================================================
  // NAM / IR helpers
  // ============================================================
  clearNamModels() {
    this.namModelsArray = [];
    const namFx = this.config.tabs.find(t =>
      t.short_name && (t.short_name.includes('NAM') || t.short_name.includes('Nam')));
    if (namFx) {
      const key = namFx.params.dropdowns[0];
      if (key) this.config.dropdowns[key] = [];
    }
  },

  addNamModel(index, name) {
    if (!this.namModelsArray) this.namModelsArray = [];
    this.namModelsArray[index] = name;
    const namFx = this.config.tabs.find(t =>
      t.short_name && (t.short_name.includes('NAM') || t.title === 'NAM'));
    if (namFx) {
      const key = namFx.params.dropdowns[0];
      if (key) {
        if (!this.config.dropdowns[key]) this.config.dropdowns[key] = [];
        this.config.dropdowns[key][index] = name;
      }
    }
    const namFxIdx = this.config.tabs.findIndex(t =>
      t.short_name && (t.short_name.includes('NAM') || t.title === 'NAM'));
    if (namFxIdx !== -1 && this.currentEffect === namFxIdx) {
      this.selectEffect(this.currentEffect);
    }
  },

  clearIrFiles() {
    this.irFilesArray = [];
    this.config.dropdowns['ir_file'] = [];
  },

  addIrFile(index, name) {
    if (!this.config.dropdowns['ir_file']) this.config.dropdowns['ir_file'] = [];
    this.config.dropdowns['ir_file'][index] = name;
    const irFxIdx = this.config.tabs.findIndex(t => t.short_name === '_FIR');
    if (irFxIdx !== -1 && this.currentEffect === irFxIdx) {
      this.selectEffect(this.currentEffect);
    }
  },

  // ============================================================
  // getCurrentState
  // ============================================================
  getCurrentState() {
    let eqData = [];
    if (this.iirDesigner) {
      eqData = this.iirDesigner.masterPoints.map(pt => ({
        freq: pt.freq, gain: pt.gain, q: pt.q, enabled: pt.enabled !== false
      }));
    } else if (this.currentEQPoints) {
      eqData = this.currentEQPoints;
    }
    const bpmEl    = document.getElementById('bpmKnob');
    const masterEl = document.getElementById('masterKnob');
    return {
      bpm:          bpmEl    && bpmEl.knob    ? bpmEl.knob.value    : 120,
      master:       masterEl && masterEl.knob ? masterEl.knob.value : 20,
      name:         this.presetName || 'User Preset',
      effectStates: this.effectStates,
      effectParams: this.effectParams,
      eqPoints:     eqData
    };
  },

  // ============================================================
  // setupPresetListeners
  // ============================================================
  setupPresetListeners() {
    const onPresetSelect = () => {
      const bankIndex = document.getElementById('presetBank').selectedIndex;
      const slotIndex = document.getElementById('presetNum').selectedIndex;
      View.updateStatus(`Loading B${bankIndex}:P${slotIndex}...`);
      BLEService.send(Protocol.createLoadReq(bankIndex,slotIndex))
        .then(()=>View.updateStatus('Preset load request sent'))
        .catch(e=>View.updateStatus('Preset load send failed: '+e.message));
    };
    document.getElementById('presetBank').addEventListener('change', onPresetSelect);
    document.getElementById('presetNum').addEventListener('change', onPresetSelect);

    const modal = document.getElementById('saveModal');

    document.getElementById('btnSavePreset').addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.soloEffectOpen && window.closeSoloEffect) window.closeSoloEffect();
      modal.classList.add('active');
      modal.style.display = 'flex';
    });

    document.getElementById('btnCancelSave').addEventListener('click', () => {
      modal.classList.remove('active');
      modal.style.display = '';
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        modal.style.display = '';
      }
    });

    document.getElementById('flash-btn').addEventListener('click', () => {
      if (confirm('Enter Bootloader Mode? The DSP will stop audio.')) {
        this.sendDevice(Protocol.createSystemPacket(Protocol.CMD.FLASH_DSP));
      }
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
      this.sendDevice(Protocol.createSystemPacket(Protocol.CMD.RESET_DSP));
    });

    document.getElementById('btnConfirmSave').onclick = async () => {
      const bankIndex = document.getElementById('saveBankSelect').selectedIndex;
      const slotIndex = document.getElementById('saveNumSelect').selectedIndex;
      const state = this.getCurrentState();
      console.log('[SAVE] effectStates at save time:');
      Object.keys(state.effectStates).forEach(i => {
        if (state.effectStates[i].enabled) console.log(`  FX[${i}] ENABLED`);
      });
      try{
        await BLEService.send(Protocol.createSavePreset(bankIndex,slotIndex,state));
        View.updateStatus('Preset save request sent');
      }catch(e){View.updateStatus('Preset save failed: '+e.message);return;}
      modal.classList.remove('active');
      modal.style.display = '';
    };
  },

  // ============================================================
  // selectEffect
  // ============================================================
  selectEffect(idx) {
    this.currentEffect = idx;

    Object.keys(this.effectStates).forEach(i => {
      this.effectStates[i].selected = (parseInt(i) === idx);
    });
    View.updateEffectButtons(this.effectStates);

    const tabConfig = this.config.tabs[idx];
    const K = (tabConfig.params.knobs || []).length;

    View.showEffectControls(
      tabConfig, idx, this.effectParams[idx], this.effectStates,

      (flatIdx, value) => {
        if (this.isUpdatingUI) return;
        this.onEffectParamChanged(idx, flatIdx, value);
      },

      (b, en, f, g, q) => {
        if (this.isUpdatingUI) return;
        if (!this.currentEQPoints) this.currentEQPoints = [];
        while (this.currentEQPoints.length <= b) {
          this.currentEQPoints.push({ freq: 100, gain: 0, q: 1.4, enabled: true });
        }
        this.currentEQPoints[b] = { freq: f, gain: g, q: q, enabled: (en === 1 || en === true) };
        if(!this.isUpdatingUI&&BLEService.isConnected) BLEService.send(Protocol.createEQUpdate(b, en, f, g, q)).catch(e=>View.updateStatus(e.message));
      }
    );
  },

  // ============================================================
  // toggleEffectEnabled
  // ============================================================
  toggleEffectEnabled(idx) {
    if (this.isUpdatingUI) return;
    const newState = !this.effectStates[idx].enabled;
    this.effectStates[idx].enabled = newState;
    if (!this.effectParams[idx]) this.effectParams[idx] = {};
    View.updateEffectButtons(this.effectStates);
    this.sendDevice(Protocol.createParamUpdate(idx, 0, newState ? 1 : 0));
  },

  // ============================================================
  // onEffectParamChanged — central handler for all effect param changes
  // ============================================================
  onEffectParamChanged(fxId, flatIdx, value) {
    const tab = this.config.tabs[fxId];
    const K   = tab.params.knobs.length;
    if (!this.effectParams[fxId]) this.effectParams[fxId] = {};

    // Enable checkbox
    if (flatIdx === 0) {
      this.effectStates[fxId].enabled = value !== 0;
      View.updateEffectButtons(this.effectStates);
      this.sendDevice(Protocol.createParamUpdate(fxId, flatIdx, value));
      return;
    }

    // Knob
    if (flatIdx <= K) {
      const kIndex = flatIdx - 1;
      this.effectParams[fxId][`knob${kIndex}`] = value;
      this.sendDevice(Protocol.createParamUpdate(fxId, flatIdx, value));
      return;
    }

    // Dropdown
    const dIndex = flatIdx - 1 - K;
    this.effectParams[fxId][`dropdown${dIndex}`] = value;
    this.sendDevice(Protocol.createParamUpdate(fxId, flatIdx, value));
  },

  sendEffectParams(fxId) {
    const tab    = this.config.tabs[fxId];
    const params = this.effectParams[fxId] || {};
    const state  = this.effectStates[fxId] || { enabled: false };
    const K      = tab.params.knobs.length;
    const D      = tab.params.dropdowns.length;

    const flatValues = [state.enabled ? 1 : 0];
    for (let k = 0; k < K; k++)
      flatValues.push(params[`knob${k}`] !== undefined ? params[`knob${k}`] : 50);
    for (let d = 0; d < D; d++)
      flatValues.push(params[`dropdown${d}`] !== undefined ? params[`dropdown${d}`] : 0);

    flatValues.forEach((value, flatIdx) => {
      this.sendDevice(Protocol.createParamUpdate(fxId, flatIdx, value));
    });
  },

  // ============================================================
  // setupTabs
  // ============================================================
  setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(name + '-tab').classList.add('active');
      });
    });
  },

  // ============================================================
  // setupStaticKnobs
  // ============================================================
  setupStaticKnobs() {
    const createKnob = (id, name, max, initial, onChange) => {
      const el = document.getElementById(id);
      if (!el) return;
      const knob = new Knob(el, 0, max, initial,
        (val) => View.updateStatus(`${name}: ${Math.round(val)}`));
      el.knob = knob;
      knob.onrelease = () => onChange(knob.value);
    };

    createKnob('whiteNoiseLevelKnob', 'Noise Level', 100, 0, (val) => {
      this.utilState.noise.level = val; this.sendUtilUpdate(0);
    });
    createKnob('toneLevelKnob', 'Tone Level', 100, 0, (val) => {
      this.utilState.tone.level = val; this.sendUtilUpdate(1);
    });
    createKnob('masterKnob', 'Master Vol', 100, 20, () => {
      this.sendMasterVolumeUpdate();
    });
    createKnob('bpmKnob', 'BPM', 250, 120, () => {
      const el = document.getElementById('bpmKnob');
      if (el && el.knob) this.bpm = el.knob.value;
      // ESP SET_GLOBAL 0x25 forwards tempo to DSP TCTL independently of drums.
      this.sendGlobalUpdate();
    });
    const tempo=document.getElementById('bpmKnob')?.knob;if(tempo)tempo.min=20;
    createKnob('blVolKnob', 'BT Vol', 100, 50, () => {
      this.sendGlobalUpdate();
    });
    createKnob('drumLevelKnob', 'Drum Level', 100, 50, (val) => {
      this.drumLevel = val; this.sendDrumUpdate();
    });
  },

  // ============================================================
  // sendUtilUpdate
  // ============================================================
  sendUtilUpdate(type) {
    if (this.isUpdatingUI) return;
    const s = type === 0 ? this.utilState.noise : this.utilState.tone;
    this.sendDevice(type === 0
      ? Protocol.createUtilUpdate(0, s.enabled, s.level, 0)
      : Protocol.createUtilUpdate(1, s.enabled, s.level, s.freq));
  },

  // ============================================================
  // sendTunerUpdate
  // ============================================================
  sendTunerUpdate(isEnabled) {
    this.tunerEnabled = isEnabled;
    this.sendDevice(Protocol.createUtilUpdate(2, isEnabled ? 1 : 0, 0, 0));
    if (!isEnabled) View.updateTuner(0);
  },

  // ============================================================
  // setupFileUpload
  // ============================================================
  setupFileUpload() {
    const input = document.getElementById('fileInput');
    if (!input) return;
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const buf = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer  = await audioContext.decodeAudioData(buf);
      this.audioData  = audioBuffer.getChannelData(0);
      this.sampleRate = audioBuffer.sampleRate;
      this.fullFFT    = View.computeFFT(this.audioData.slice(0, 16384));
      View.drawWaveform(this.audioData, 'waveformCanvas');
      View.drawSpectrum(this.audioData, this.sampleRate, 'spectrumCanvas', this.fullFFT);
      const btn = document.getElementById('btnSendIR');
      if (btn) btn.disabled = false;
    });
    const irPointsSelect = document.getElementById('irPoints');
    if (irPointsSelect) {
      irPointsSelect.addEventListener('change', () => {
        if (this.audioData && this.fullFFT) {
          View.drawSpectrum(this.audioData, this.sampleRate, 'spectrumCanvas', this.fullFFT);
        }
      });
    }
  },

  // ============================================================
  // sendGlobalUpdate
  // ============================================================
  sendMasterVolumeUpdate(requestedValue) {
    // Mobile range input supplies its value directly. Do not look up an old
    // hidden knob value or wait for a second change event to commit volume.
    if (this.isUpdatingUI) return Promise.resolve();
    const masterEl = document.getElementById('masterKnob');
    const level = Math.round(Math.max(0, Math.min(100,
      Number(requestedValue ?? masterEl?.knob?.value ?? 20))));
    if (masterEl?.knob) {
      masterEl.knob.value = level;
      masterEl.knob.draw();
    }
    // Rejects must be surfaced: showing a new slider number does NOT mean
    // the ESP accepted a BLE write (e.g. link disconnected or NAM transfer).
    let write;
    try { write = BLEService.send(Protocol.createMasterVolumeUpdate(level)); }
    catch (err) { write = Promise.reject(err); }
    return Promise.resolve(write).catch(err => {
      View.updateStatus(`Master volume not sent: ${err.message || err}`);
      window.dispatchEvent(new CustomEvent('jammate:volume-error', {detail: String(err.message || err)}));
      return false;
    });
  },

  sendGlobalUpdate(flash = false, reset = false) {
    if (this.isUpdatingUI) return;
    const btVolEl   = document.getElementById('blVolKnob');
    const bpmEl     = document.getElementById('bpmKnob');
    const btVol     = btVolEl  && btVolEl.knob  ? btVolEl.knob.value  : 50;
    const bpm       = bpmEl    && bpmEl.knob    ? bpmEl.knob.value    : 120;
    const btEnable  = document.getElementById('btEnableCheck')  ? document.getElementById('btEnableCheck').checked  : true;
    const bleEnable = document.getElementById('bleEnableCheck') ? document.getElementById('bleEnableCheck').checked : true;
    this.sendDevice(Protocol.createGlobalUpdate(btVol, bpm, btEnable, bleEnable, flash, reset));
    if (flash) View.updateStatus('Sending Flash Command...');
    if (reset) View.updateStatus('Sending Reset Command...');
  },

  // ============================================================
  // sendConfigUpdate — chunked full-name config upload (0x52 packets)
  // ============================================================
  async sendConfigUpdate() {
    if(this._configUploadPromise)return this._configUploadPromise;
    this._configUploadPromise=this._uploadBundledConfig();
    try{return await this._configUploadPromise;}finally{this._configUploadPromise=null;}
  },
  async _uploadBundledConfig(){
    if(!BLEService.isConnected)throw Error('Connect first');
    const bytes=new TextEncoder().encode(Protocol.buildConfigText(this.bundledConfig)),packets=[];
    for(let offset=0,index=0;offset<bytes.length;index++){
      const chunk=Protocol.createConfigChunk(bytes,index,offset,160);packets.push(chunk.packet);offset=chunk.nextOffset;
    }
    View.updateStatus('Sending bundled config.js...');
    await BLEService.sendBatch(packets,(done,total)=>View.updateStatus(`Sending config: ${done}/${total}`));
    View.updateStatus('Configuration sent to ESP; check the ESP for the result');
  },

  // ============================================================
  // setupGlobalListeners
  // ============================================================
  setupGlobalListeners() {
    // Three persistent styles; replace the previous Dark/Light/Vintage/Color cycle.
    installThemeManager(() => {
      document.querySelectorAll('.knob').forEach(el => el.knob?.draw());
      this.iirDesigner?.draw?.();
    });

    const btnReadSDCard = document.getElementById('btnReadSDCard');
    if (btnReadSDCard) {
      btnReadSDCard.onclick = () => {
        this.sendDevice(Protocol.createSDCardReadCommand());
        View.updateStatus('SD Card Read command sent');
      };
    }

    const btnUpdateConfig = document.getElementById('btnUpdateConfig');
    if (btnUpdateConfig) {
      btnUpdateConfig.onclick = async () => {
        if (!BLEService.isConnected) { View.updateStatus('Not connected — connect first'); return; }
        if (confirm('Send bundled config.js to ESP?')) {try{await this.sendConfigUpdate();}catch(e){console.warn(e);}}
      };
    }

    const btnBypass = document.getElementById('btnBypass');
    if (btnBypass) {
      btnBypass.classList.add('bypass-active');
      btnBypass.onclick = () => {
        this.bypassEnabled = !this.bypassEnabled;
        btnBypass.classList.toggle('bypass-active',  !this.bypassEnabled);
        btnBypass.classList.toggle('bypass-blinking', this.bypassEnabled);
        this.sendDevice(Protocol.createBypassPacket(this.bypassEnabled));
        View.updateStatus(this.bypassEnabled ? 'Bypass ON' : 'Bypass OFF');
      };
    }

    const btnFullscreen = document.getElementById('btnFullscreen');
    if (btnFullscreen) {
      btnFullscreen.onclick = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      };
    }

    const btnConnect = document.getElementById('btnConnect');
    if (btnConnect) {
      btnConnect.onclick = async () => {
        try{if(BLEService.isConnected)await BLEService.disconnect();else await BLEService.connect();}
        catch(e){View.updateStatus(e.message);console.warn('[BLE]',e.message);}
      };
    }

    const setupDoubleClickHandler = (id, onToggle) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      let clickCount = 0, clickTimeout = null;
      btn.addEventListener('click', () => {
        clickCount++;
        if (clickCount === 1) {
          clickTimeout = setTimeout(() => { clickCount = 0; }, 250);
        } else if (clickCount >= 2) {
          clearTimeout(clickTimeout);
          clickCount = 0;
          onToggle();
        }
      });
    };

    setupDoubleClickHandler('whiteNoiseBtn', () => {
      this.utilState.noise.enabled = !this.utilState.noise.enabled;
      View.setButtonActive('whiteNoiseBtn', this.utilState.noise.enabled);
      this.sendUtilUpdate(0);
    });

    setupDoubleClickHandler('toneBtn', () => {
      this.utilState.tone.enabled = !this.utilState.tone.enabled;
      View.setButtonActive('toneBtn', this.utilState.tone.enabled);
      this.sendUtilUpdate(1);
    });

    const toneInput = document.getElementById('toneFreqInput');
    if (toneInput) {
      toneInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val)) val = 670;
        this.utilState.tone.freq = val;
        this.sendUtilUpdate(1);
      });
    }

    // ── Solo effect overlay ──────────────────────────────────
    window.soloEffectOpen = false;

    window.closeSoloEffect = () => {
      const overlay  = document.getElementById('soloEffectOverlay');
      const controls = document.getElementById('effectControls');
      const effectsTab = document.getElementById('effects-tab');
      if (controls && effectsTab && !effectsTab.contains(controls)) {
        effectsTab.appendChild(controls);
      }
      if (overlay) overlay.remove();
      window.soloEffectOpen = false;
    };

    window.showSoloEffect = (name, idx) => {
      if (window.soloEffectOpen) window.closeSoloEffect();
      window.soloEffectOpen = true;

      const overlay = document.createElement('div');
      overlay.id = 'soloEffectOverlay';
      overlay.className = 'solo-effect-overlay';

      const cont = document.createElement('div');
      cont.className = 'solo-effect-container';

      const title = document.createElement('div');
      title.className = 'solo-effect-title';
      title.textContent = name;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'solo-effect-close-btn';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', window.closeSoloEffect);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) window.closeSoloEffect();
      });

      cont.appendChild(title);
      cont.appendChild(closeBtn);
      overlay.appendChild(cont);
      document.body.appendChild(overlay);

      const controls = document.getElementById('effectControls');
      if (controls) {
        controls.style.display = '';
        cont.appendChild(controls);
      }

      if (app.iirDesigner) requestAnimationFrame(() => app.iirDesigner.draw());
    };

    // ── Easy Mode ────────────────────────────────────────────
    const btnEasyMode = document.getElementById('btnEasyMode');
    if (btnEasyMode) {
      const resizeEasyMode = () => {
        const tab = document.getElementById('effects-tab');
        if (!tab || !tab.classList.contains('easy-mode')) return;
        const scroll = tab.querySelector('.effects-scroll');
        const grid   = tab.querySelector('.effects-grid');
        const btns   = grid ? grid.querySelectorAll('.effect-btn') : [];
        const n = btns.length;
        if (!scroll || !grid || n === 0) return;

        const W = scroll.clientWidth  - 8;
        const H = scroll.clientHeight - 8;
        let bestCols = 1, bestScore = Infinity;
        for (let cols = 1; cols <= n; cols++) {
          const rows  = Math.ceil(n / cols);
          const gap   = 4;
          const cellW = (W - gap * (cols - 1)) / cols;
          const cellH = (H - gap * (rows - 1)) / rows;
          if (cellW < 44 || cellH < 36) continue;
          const ratio = Math.max(cellW, cellH) / Math.min(cellW, cellH);
          const score = Math.abs(ratio - 1.15);
          if (score < bestScore) { bestScore = score; bestCols = cols; }
        }
        const cols  = bestCols;
        const rows  = Math.ceil(n / cols);
        const gap   = 4;
        const cellW = Math.floor((W - gap * (cols - 1)) / cols);
        const cellH = Math.floor((H - gap * (rows - 1)) / rows);
        grid.style.gridTemplateColumns = `repeat(${cols}, ${cellW}px)`;
        grid.style.gridTemplateRows    = `repeat(${rows}, ${cellH}px)`;
        grid.style.gap = `${gap}px`;
      };
      this._resizeEasyMode = resizeEasyMode;

      btnEasyMode.onclick = (e) => {
        if (window.closeSoloEffect) window.closeSoloEffect();
        const tab = document.getElementById('effects-tab');
        if (!tab) return;
        tab.classList.toggle('easy-mode');
        document.querySelectorAll('.effect-btn').forEach(btn => { btn.draggable = true; });
        const isActive = tab.classList.contains('easy-mode');
        e.target.style.background = isActive ? 'var(--color-accent)'     : 'var(--color-bg-surface)';
        e.target.style.color      = isActive ? '#000'                     : 'var(--color-text-primary)';
        View.updateStatus(isActive ? 'Easy Mode Enabled' : 'Easy Mode Disabled');
        if (isActive) requestAnimationFrame(() => requestAnimationFrame(resizeEasyMode));
      };

      window.addEventListener('resize', () => {
        requestAnimationFrame(() => this._resizeEasyMode && this._resizeEasyMode());
      });
    }

    // ── Tuner enable ─────────────────────────────────────────
    const tunerEnable = document.getElementById('tunerEnable');
    if (tunerEnable) {
      tunerEnable.checked = !!this.tunerEnabled;
      tunerEnable.addEventListener('change', (e) => {
        this.sendTunerUpdate(e.target.checked);
        View.updateStatus(e.target.checked ? 'Tuner ON' : 'Tuner OFF');
      });
    }
  },

  // ============================================================
  // reorderEffects
  // ============================================================
  reorderEffects(fromId, beforeId) {
    return this.setEffectOrder(insertEffect(this.effectOrder,fromId,beforeId));
  },
  notifyEffectOrder() {
    this.rebuildEffectsUI();
    window.dispatchEvent(new Event('jammate:effect-order'));
  },
  async setEffectOrder(next) {
    let ids;
    try{ids=wireOrder(this.config.tabs,next);}catch(e){View.updateStatus(e.message);this.notifyEffectOrder();return false;}
    if(this._orderPending){View.updateStatus('Wait for DSP order confirmation');this.notifyEffectOrder();return false;}
    if(next.every((v,i)=>v===this.effectOrder[i]))return true;
    const previous=this.effectOrder.slice();
    this.effectOrder=next.slice();this.notifyEffectOrder();
    if(!BLEService.isConnected){this._orderDirty=true;View.updateStatus('Order preview: connect to apply to DSP');return true;}
    this._orderPending=true;
    View.updateStatus('Applying effect order...');
    try{
      const result=await BLEService.setEffectOrder(ids);
      if(result.ids.some((v,i)=>v!==ids[i])){const e=Error('DSP reported a different order');e.ids=result.ids;throw e;}
      this.effectOrder=mergeDspOrder(this.config.tabs,this.effectOrder,result.ids);
      this._orderDirty=false;View.updateStatus('Effect order confirmed by DSP');return true;
    }catch(e){
      this.effectOrder=e.ids?mergeDspOrder(this.config.tabs,previous,e.ids):previous;
      View.updateStatus('Order not confirmed: '+e.message);return false;
    }finally{this._orderPending=false;this.notifyEffectOrder();}
  },
  async syncEffectOrder() {
    if(this._orderPending||!BLEService.isConnected)return;
    const dirty=this._orderDirty,desired=this.effectOrder.slice();this._orderPending=true;
    try{
      const result=await (dirty?BLEService.setEffectOrder(wireOrder(this.config.tabs,desired)):BLEService.getEffectOrder());
      this.effectOrder=mergeDspOrder(this.config.tabs,desired,result.ids);this._orderDirty=false;
    }catch(e){View.updateStatus('DSP order unavailable: '+e.message);}
    finally{this._orderPending=false;this.notifyEffectOrder();}
  },
  rebuildEffectsUI() {
    View.setupEffectsGrid(this.config);
  },
};

// XSS guard used in NAM card rendering
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
