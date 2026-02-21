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

import { APP_CONFIG } from './config.js';
import { View } from './ui/View.js';
import { Knob } from './ui/Knob.js';
import { BLEService } from './services/BLEService.js';
import { Protocol } from './services/Protocol.js';

const PRESETS_LOCKED = false;

export const app = {
  config: APP_CONFIG,
  currentEffect: null,
  drumPattern: Array(9).fill(null).map(() => Array(16).fill(0)),
  effectStates: {},
  effectParams: {},
  currentEQPoints: null,
  utilState: {
    noise: { enabled: false, level: 0 },
    tone: { enabled: false, level: 0, freq: 670 }
  },
  audioData: null,
  sampleRate: null,
  fullFFT: null,
  iirDesigner: null,
  isUpdatingUI: false,
  effectOrder: null,
  tunerEnabled: false,

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
    this.effectOrder = [];
    for (let i = 0; i < effectCount; i++) {
      this.effectStates[i] = { enabled: false, selected: false };
      this.effectParams[i] = {};
      this.effectOrder.push(i);
    }

    // Drum state defaults
    this.drumEnabled = false;
    this.drumLevel = 50;
    this.drumStyle = 0;
    this.drumFill = 0;
    this.drumNumber = 1;
    this.bpm = 120;
    this.looperEnabled = false;
    this.loopLevel = 50;
    this.loopNumber = 1;
    this.loopSync = 0;
    this.loopArm = 0;
    this.loopLength = 0;
    this.loopTracks = 1;

    View.init(this);

    // BLE status
    BLEService.onStatusChange = (status) => {
      View.updateConnectionStatus(status);
    };

    // ── BLE data received ────────────────────────────────────────
    // Tuner rate-limit: max one View.updateTuner per animation frame.
    // ESP wire format: [0x35][0x04][0x00][float32 LE] = 7 bytes total.
    // Case A (reassembled): dataView is payload-only  → float at byte 0.
    // Case B (raw DataView): full frame               → float at byte 3.
    let _tunerPending = false;
    let _tunerFreq = 0;
    const _scheduleTuner = (freq) => {
      _tunerFreq = freq;
      if (_tunerPending) return;
      _tunerPending = true;
      requestAnimationFrame(() => {
        _tunerPending = false;
        const tunerTab = document.getElementById('tuner-tab');
        if (tunerTab && tunerTab.classList.contains('active')) {
          View.updateTuner(_tunerFreq);
        }
      });
    };
    const _handleTuner = (dv, payloadOnly) => {
      try {
        _scheduleTuner(payloadOnly ? dv.getFloat32(0, true)
          : dv.getFloat32(3, true));
      } catch (_) { /* malformed — ignore */ }
    };

    BLEService.onDataReceived = (packet) => {
      // CASE A: reassembled { cmd, dataView }
      if (packet && typeof packet === 'object' && packet.cmd !== undefined) {
        const { cmd, dataView } = packet;

        if (cmd === 0x31 || cmd === 0x34) {
          console.log(`[BLE] Preset data cmd=0x${cmd.toString(16)}`);
          this.loadStateFromBlob(dataView.buffer);
          return;
        }
        if (cmd === 0x35) {
          _handleTuner(dataView, true);
          return;
        }
        if (cmd === Protocol.CMD.NAM_LIST_DATA) {
          const index = dataView.getUint8(0);
          if (index === 255) { this.clearNamModels(); return; }
          const name = new TextDecoder().decode(
            new Uint8Array(dataView.buffer, dataView.byteOffset + 1));
          this.addNamModel(index, name);
          return;
        }
        if (cmd === Protocol.CMD.IR_LIST_DATA) {
          const index = dataView.getUint8(0);
          if (index === 255) { this.clearIrFiles(); return; }
          const name = new TextDecoder().decode(
            new Uint8Array(dataView.buffer, dataView.byteOffset + 1));
          this.addIrFile(index, name);
          return;
        }
        return;
      }

      // CASE B: raw DataView (full frame)
      if (packet instanceof DataView) {
        const cmd = packet.getUint8(0);

        if (cmd === 0x31 || cmd === 0x34) {
          this.loadStateFromBlob(packet.buffer);
          return;
        }
        if (cmd === 0x35) {
          _handleTuner(packet, false);
          return;
        }
        if (cmd === Protocol.CMD.NAM_LIST_DATA) {
          const index = packet.getUint8(1);
          if (index === 255) { this.clearNamModels(); return; }
          const name = new TextDecoder().decode(new Uint8Array(packet.buffer.slice(2)));
          this.addNamModel(index, name);
          return;
        }
        if (cmd === Protocol.CMD.IR_LIST_DATA) {
          const index = packet.getUint8(1);
          if (index === 255) { this.clearIrFiles(); return; }
          const name = new TextDecoder().decode(new Uint8Array(packet.buffer.slice(2)));
          this.addIrFile(index, name);
          return;
        }
      }
    };

    this.setupTabs();
    View.setupEffectsGrid(this.config);

    View.setupDrumGrid(this.drumPattern, (cell, row, col, newVelocity) => {
      this.drumPattern[row][col] = newVelocity;
      View.updateDrumCell(cell, newVelocity);
      BLEService.send(Protocol.createDrumPatternPacket(this.drumPattern));
    });

    this.setupStaticKnobs();
    this.setupFileUpload();
    this.setupGlobalListeners();
    this.setupPresetListeners();
    this.setupDrumControls();
  },

  // ============================================================
  // setupDrumControls
  // ============================================================
  setupDrumControls() {
    const wire = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', handler);
    };

    wire('drumEnable', (e) => {
      this.drumEnabled = e.target.checked;
      this.sendDrumUpdate();
      View.updateStatus(this.drumEnabled ? 'Drum ON' : 'Drum OFF');
    });

    wire('looperEnable', (e) => {
      this.looperEnabled = e.target.checked;
      this.sendDrumUpdate();
      View.updateStatus(this.looperEnabled ? 'Looper ON' : 'Looper OFF');
    });

    // Level knobs (guard against double-init from setupStaticKnobs)
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
      ['drumStyle', 'drumStyle'],
      ['drumFill', 'drumFill'],
      ['drumNumber', 'drumNumber'],
      ['loopSync', 'loopSync'],
      ['loopArm', 'loopArm'],
      ['loopLength', 'loopLength'],
      ['loopTracks', 'loopTracks'],
    ].forEach(([id, prop]) => {
      wire(id, (e) => { this[prop] = parseInt(e.target.value); this.sendDrumUpdate(); });
    });

    const btnSaveToSD = document.getElementById('btnSaveToSD');
    if (btnSaveToSD) {
      btnSaveToSD.addEventListener('click', () => {
        BLEService.send(Protocol.createSaveToSD());
        View.updateStatus('Saving to SD...');
      });
    }
  },

  // ============================================================
  // sendDrumUpdate
  // ============================================================
  sendDrumUpdate() {
    if (this.isUpdatingUI) return;
    const bpmEl = document.getElementById('bpmKnob');
    const currentBPM = bpmEl && bpmEl.knob ? bpmEl.knob.value : this.bpm;
    BLEService.send(Protocol.createDrumUpdate(
      this.drumEnabled || false,
      this.drumLevel || 50,
      currentBPM || 120,
      this.drumStyle || 0,
      this.drumFill || 0,
      this.drumNumber || 1,
      this.looperEnabled || false,
      this.loopLevel || 50,
      this.loopSync || 0,
      this.loopArm || 0,
      this.loopLength || 0,
      this.loopTracks || 1
    ));
  },

  // ============================================================
  // loadStateFromBlob
  //
  // FIX: store values as 'knob0','dropdown0' keys — this is what
  // View.showEffectControls reads back to restore control values.
  // The old code stored 'p0','p1'... which View never reads,
  // causing blank knobs/dropdowns after every preset load.
  // ============================================================
  loadStateFromBlob(blob) {
    this.isUpdatingUI = true;
    try {
      const state = Protocol.deserializeState(blob);

      for (let i = 0; i < 18; i++) {
        if (!this.effectStates[i]) this.effectStates[i] = { enabled: false, selected: false };
        if (!this.effectParams[i]) this.effectParams[i] = {};
      }

      Object.keys(state.effectStates).forEach(idx => {
        const i = parseInt(idx);
        if (i >= 18) return;
        const config = this.config.tabs[i];
        if (!config) return;

        // Enable state
        this.effectStates[i].enabled = state.effectStates[i].enabled;

        // Knobs → 'knob0', 'knob1', …
        const kCount = (config.params.knobs || []).length;
        for (let k = 0; k < kCount; k++) {
          const v = state.effectParams[i] ? state.effectParams[i][`knob${k}`] : undefined;
          this.effectParams[i][`knob${k}`] = v !== undefined ? v : 50;
        }

        // Dropdowns → 'dropdown0', 'dropdown1', …
        const dCount = (config.params.dropdowns || []).length;
        for (let d = 0; d < dCount; d++) {
          const v = state.effectParams[i] ? state.effectParams[i][`dropdown${d}`] : undefined;
          this.effectParams[i][`dropdown${d}`] = v !== undefined ? v : 0;
        }
      });

      // EQ points
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

      if (this.currentEffect !== null) {
        this.selectEffect(this.currentEffect);
      }

      const bpmKnob = document.getElementById('bpmKnob');
      if (bpmKnob && bpmKnob.knob) {
        bpmKnob.knob.value = state.bpm;
        this.bpm = state.bpm;
      }

      View.updateStatus(`Loaded: ${state.name}`);
    } catch (e) {
      console.error('Load Failed:', e);
      View.updateStatus('Load failed — see console');
    }
    setTimeout(() => { this.isUpdatingUI = false; }, 100);
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
      eqData = this.iirDesigner.points.map(pt => ({
        freq: pt.freq, gain: pt.gain, q: pt.q, enabled: pt.enabled !== false
      }));
    } else if (this.currentEQPoints) {
      eqData = this.currentEQPoints;
    }
    const bpmEl = document.getElementById('bpmKnob');
    const masterEl = document.getElementById('masterKnob');
    return {
      bpm: bpmEl && bpmEl.knob ? bpmEl.knob.value : 120,
      master: masterEl && masterEl.knob ? masterEl.knob.value : 50,
      name: 'User Preset',
      effectStates: this.effectStates,
      effectParams: this.effectParams,
      eqPoints: eqData
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
      BLEService.send(Protocol.createLoadReq(bankIndex, slotIndex));
    };
    document.getElementById('presetBank').addEventListener('change', onPresetSelect);
    document.getElementById('presetNum').addEventListener('change', onPresetSelect);

    const modal = document.getElementById('saveModal');

    document.getElementById('btnSavePreset').addEventListener('click', (e) => {
      e.stopPropagation();
      // FIX: In easy mode the solo-effect overlay is position:fixed and full-screen.
      // If it is open it sits above the modal, intercepting clicks on confirm/cancel.
      // Always close it before opening the save modal.
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
        BLEService.send(Protocol.createSystemPacket(Protocol.CMD.FLASH_DSP));
      }
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
      BLEService.send(Protocol.createSystemPacket(Protocol.CMD.RESET_DSP));
    });

    document.getElementById('btnConfirmSave').onclick = () => {
      const bankIndex = document.getElementById('saveBankSelect').selectedIndex;
      const slotIndex = document.getElementById('saveNumSelect').selectedIndex;

      // DEBUG — remove after fix
      const state = this.getCurrentState();
      console.log('[SAVE] effectStates at save time:');
      Object.keys(state.effectStates).forEach(i => {
        if (state.effectStates[i].enabled)
          console.log(`  FX[${i}] ENABLED`);
      });

      BLEService.send(Protocol.createSavePreset(bankIndex, slotIndex, state));
      modal.classList.remove('active');
      modal.style.display = '';
    };
  },

  // ============================================================
  // selectEffect
  //
  // FIX: onParam signature matches View.js: (flatIdx, value).
  // The old code used (type, subIdx, val) + Protocol.toFlatIdx()
  // which doesn't exist in the View.js callback contract.
  //
  // Also stores values under 'knob${k}' / 'dropdown${d}' keys
  // so they survive a selectEffect() re-render correctly.
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
      tabConfig,
      idx,
      this.effectParams[idx],
      this.effectStates,

      // Unified param callback — View fires onParam(flatIdx, value)
      (flatIdx, value) => {
        if (this.isUpdatingUI) return;

        if (flatIdx === 0) {
          // Checkbox
          this.effectStates[idx].enabled = (value !== 0);
          View.updateEffectButtons(this.effectStates);
        } else if (flatIdx <= K) {
          // Knob k-1
          this.effectParams[idx][`knob${flatIdx - 1}`] = value;
        } else {
          // Dropdown d
          this.effectParams[idx][`dropdown${flatIdx - 1 - K}`] = value;
        }

        BLEService.send(Protocol.createParamUpdate(idx, flatIdx, value));
      },

      // EQ callback (unchanged)
      (b, en, f, g, q) => {
        if (this.isUpdatingUI) return;
        if (!this.currentEQPoints) this.currentEQPoints = [];
        while (this.currentEQPoints.length <= b) {
          this.currentEQPoints.push({ freq: 100, gain: 0, q: 1.4, enabled: true });
        }
        this.currentEQPoints[b] = {
          freq: f, gain: g, q: q,
          enabled: (en === 1 || en === true)
        };
        BLEService.send(Protocol.createEQUpdate(b, en, f, g, q));
      }
    );
  },

  // ============================================================
  // toggleEffectEnabled (double-click from grid button)
  // ============================================================
  toggleEffectEnabled(idx) {
    if (this.isUpdatingUI) return;
    const newState = !this.effectStates[idx].enabled;
    this.effectStates[idx].enabled = newState;
    if (!this.effectParams[idx]) this.effectParams[idx] = {};
    View.updateEffectButtons(this.effectStates);
    BLEService.send(Protocol.createParamUpdate(idx, 0, newState ? 1 : 0));
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
    createKnob('masterKnob', 'Master Vol', 100, 50, () => {
      this.sendGlobalUpdate();
    });
    createKnob('bpmKnob', 'BPM', 255, 120, () => {
      const el = document.getElementById('bpmKnob');
      if (el && el.knob) this.bpm = el.knob.value;
      if (this.drumEnabled) this.sendDrumUpdate();
      this.sendGlobalUpdate();
    });
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
    BLEService.send(type === 0
      ? Protocol.createUtilUpdate(0, s.enabled, s.level, 0)
      : Protocol.createUtilUpdate(1, s.enabled, s.level, s.freq));
  },

  // ============================================================
  // sendTunerUpdate  (CMD 0x23, type=2)
  // ============================================================
  sendTunerUpdate(isEnabled) {
    this.tunerEnabled = isEnabled;
    BLEService.send(Protocol.createUtilUpdate(2, isEnabled ? 1 : 0, 0, 0));
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
      const audioBuffer = await audioContext.decodeAudioData(buf);
      this.audioData = audioBuffer.getChannelData(0);
      this.sampleRate = audioBuffer.sampleRate;
      this.fullFFT = View.computeFFT(this.audioData.slice(0, 16384));
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
  sendGlobalUpdate(flash = false, reset = false) {
    if (this.isUpdatingUI) return;
    const masterEl = document.getElementById('masterKnob');
    const btVolEl = document.getElementById('blVolKnob');
    const bpmEl = document.getElementById('bpmKnob');
    const master = masterEl && masterEl.knob ? masterEl.knob.value : 50;
    const btVol = btVolEl && btVolEl.knob ? btVolEl.knob.value : 50;
    const bpm = bpmEl && bpmEl.knob ? bpmEl.knob.value : 120;
    const btEnable = document.getElementById('btEnableCheck')
      ? document.getElementById('btEnableCheck').checked : true;
    const bleEnable = document.getElementById('bleEnableCheck')
      ? document.getElementById('bleEnableCheck').checked : true;
    BLEService.send(Protocol.createGlobalUpdate(master, btVol, bpm, btEnable, bleEnable, flash, reset));
    if (flash) View.updateStatus('Sending Flash Command...');
    if (reset) View.updateStatus('Sending Reset Command...');
  },

  // ============================================================
  // sendConfigUpdate
  // ============================================================
  sendConfigUpdate() {
    View.updateStatus('Uploading config...');
    BLEService.send(Protocol.createConfigUpload(this.config));  // pass live config
    View.updateStatus('Config upload sent');
  },

  // ============================================================
  // setupGlobalListeners
  // ============================================================
  setupGlobalListeners() {
    const btnTheme = document.getElementById('btnTheme');
    if (btnTheme) {
      btnTheme.onclick = () => {
        document.body.classList.toggle('light-theme');
        if (this.iirDesigner) this.iirDesigner.draw();
      };
    }

    const btnReadSDCard = document.getElementById('btnReadSDCard');
    if (btnReadSDCard) {
      btnReadSDCard.onclick = () => {
        BLEService.send(Protocol.createSDCardReadCommand());
        View.updateStatus('SD Card Read command sent');
      };
    }

    const btnUpdateConfig = document.getElementById('btnUpdateConfig');
    if (btnUpdateConfig) {
      btnUpdateConfig.onclick = () => {
        if (!BLEService.isConnected) {
          View.updateStatus('Not connected — connect first');
          return;
        }
        if (confirm('Upload current config.js to ESP?')) this.sendConfigUpdate();
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
      btnConnect.onclick = () => {
        if (BLEService.isConnected) BLEService.disconnect();
        else BLEService.connect();
      };
    }

    // Double-click handler for Noise / Tone utility toggle buttons
    // FIX: The document version had the effect-btn click handler pasted in
    // here instead, with a `...` syntax error and out-of-scope variables.
    const setupDoubleClickHandler = (id, onToggle) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      let clickCount = 0;
      let clickTimeout = null;
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

    // ── Solo effect overlay ──────────────────────────────────────
    window.soloEffectOpen = false;

    // FIX: use a unique ID instead of class — the save modal also
    // has class 'solo-effect-overlay' and querySelector('.solo-effect-overlay')
    // could match it, corrupting both the modal and the controls.
    //
    // FIX: restore controls unconditionally — if the overlay was removed
    // by some other path, #effectControls still gets returned to the tab.
    window.closeSoloEffect = () => {
      const overlay = document.getElementById('soloEffectOverlay');
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
      overlay.id = 'soloEffectOverlay';   // unique ID, not just class
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

    // ── Easy Mode button ─────────────────────────────────────────
    const btnEasyMode = document.getElementById('btnEasyMode');
    if (btnEasyMode) {
      const resizeEasyMode = () => {
        const tab = document.getElementById('effects-tab');
        if (!tab || !tab.classList.contains('easy-mode')) return;
        const scroll = tab.querySelector('.effects-scroll');
        const grid = tab.querySelector('.effects-grid');
        const btns = grid ? grid.querySelectorAll('.effect-btn') : [];
        const n = btns.length;
        if (!scroll || !grid || n === 0) return;

        const W = scroll.clientWidth - 8;
        const H = scroll.clientHeight - 8;
        let bestCols = 1, bestScore = Infinity;
        for (let cols = 1; cols <= n; cols++) {
          const rows = Math.ceil(n / cols);
          const gap = 4;
          const cellW = (W - gap * (cols - 1)) / cols;
          const cellH = (H - gap * (rows - 1)) / rows;
          if (cellW < 44 || cellH < 36) continue;
          const ratio = Math.max(cellW, cellH) / Math.min(cellW, cellH);
          const score = Math.abs(ratio - 1.15);
          if (score < bestScore) { bestScore = score; bestCols = cols; }
        }
        const cols = bestCols;
        const rows = Math.ceil(n / cols);
        const gap = 4;
        const cellW = Math.floor((W - gap * (cols - 1)) / cols);
        const cellH = Math.floor((H - gap * (rows - 1)) / rows);
        grid.style.gridTemplateColumns = `repeat(${cols}, ${cellW}px)`;
        grid.style.gridTemplateRows = `repeat(${rows}, ${cellH}px)`;
        grid.style.gap = `${gap}px`;
      };
      this._resizeEasyMode = resizeEasyMode;

      btnEasyMode.onclick = (e) => {
        // FIX: always close the overlay before toggling mode.
        // Without this, if a solo panel is open when the user clicks
        // "Easy Mode OFF", #effectControls stays stranded inside the
        // now-orphaned overlay div and never returns to the effects tab.
        if (window.closeSoloEffect) window.closeSoloEffect();

        const tab = document.getElementById('effects-tab');
        if (!tab) return;
        tab.classList.toggle('easy-mode');

        document.querySelectorAll('.effect-btn').forEach(btn => {
          btn.draggable = true;
        });

        const isActive = tab.classList.contains('easy-mode');
        e.target.style.background = isActive ? 'var(--color-accent)' : 'var(--color-bg-surface)';
        e.target.style.color = isActive ? '#000' : 'var(--color-text-primary)';
        View.updateStatus(isActive ? 'Easy Mode Enabled' : 'Easy Mode Disabled');

        if (isActive) {
          requestAnimationFrame(() => requestAnimationFrame(resizeEasyMode));
        }
      };

      window.addEventListener('resize', () => {
        requestAnimationFrame(() => this._resizeEasyMode && this._resizeEasyMode());
      });
    }

    // Tuner enable
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
  reorderEffects(fromIdx, toIdx) {
    console.log(`[APP] Before swap: ${this.effectOrder.join(',')}`);
    [this.effectStates, this.effectParams, this.effectOrder].forEach(obj => {
      const tmp = obj[fromIdx];
      obj[fromIdx] = obj[toIdx];
      obj[toIdx] = tmp;
    });
    console.log(`[APP] After swap: ${this.effectOrder.join(',')}`);
    this.rebuildEffectsUI();
    const fromName = this.config.tabs[fromIdx]?.title || 'Effect';
    const toName = this.config.tabs[toIdx]?.title || 'Effect';
    View.updateStatus(`Reordered: ${fromName} ↔ ${toName}`);
  },

  // ============================================================
  // rebuildEffectsUI — called after drag-drop reorder
  //
  // FIX: includes full single/double-click + easy-mode support
  // matching View.setupEffectsGrid (the original only called
  // selectEffect with no easy-mode or double-click handling).
  // ============================================================
  rebuildEffectsUI() {
    const grid = document.getElementById('effectsGrid');
    grid.innerHTML = '';

    this.effectOrder.forEach((idx) => {
      if (!this.effectStates[idx]) {
        this.effectStates[idx] = { enabled: false, selected: false };
      }

      const effect = this.config.tabs[idx];
      const state = this.effectStates[idx];

      const btn = document.createElement('div');
      btn.className = 'effect-btn';
      btn.dataset.index = idx;
      btn.dataset.effectId = idx;
      btn.draggable = true;
      btn.textContent = effect.title;
      if (state.selected) btn.classList.add('selected');
      if (state.enabled) btn.classList.add('enabled');

      let clickCount = 0;
      let clickTimeout = null;
      btn.addEventListener('click', () => {
        const isEasyMode = document.getElementById('effects-tab')
          .classList.contains('easy-mode');
        // Close any open overlay but do NOT return — fall through to
        // select and (re)open the panel for the newly clicked effect.
        if (window.soloEffectOpen) window.closeSoloEffect();

        clickCount++;
        if (clickCount === 1) {
          clickTimeout = setTimeout(() => {
            this.selectEffect(idx);
            if (isEasyMode) window.showSoloEffect(effect.title, idx);
            clickCount = 0;
          }, 250);
        } else if (clickCount >= 2) {
          clearTimeout(clickTimeout);
          this.toggleEffectEnabled(idx);
          clickCount = 0;
        }
      });

      btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('effectIndex', idx);
        btn.classList.add('dragging');
      });
      btn.addEventListener('dragend', () => {
        btn.classList.remove('dragging');
        document.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('drag-over'));
      });
      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        btn.classList.add('drag-over');
      });
      btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
      btn.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.classList.remove('drag-over');
        const src = parseInt(e.dataTransfer.getData('effectIndex'));
        if (src !== idx) this.reorderEffects(src, idx);
      });

      grid.appendChild(btn);
    });
  },
};