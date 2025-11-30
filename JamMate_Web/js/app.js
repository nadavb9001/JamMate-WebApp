/**
 * JamMate Multi-Effect Controller - app.js (FIXED - All JavaScript Errors)
 * Fixes:
 * 1. Initialize all 17 effectStates before use
 * 2. Safety checks in loadStateFromBlob()
 * 3. Drum controls properly integrated
 */

import { APP_CONFIG } from './config.js';
import { View } from './ui/View.js';
import { Knob } from './ui/Knob.js';
import { BLEService } from './services/BLEService.js';
import { Protocol } from './services/Protocol.js';

const PRESETS_LOCKED = false;
const DRUM_FX_ID = 17;

export const app = {
  config: APP_CONFIG,
  currentEffect: null,
  drumPattern: Array(9).fill(null).map(() => Array(16).fill(0)),
  effectStates: {},     // Will be initialized in init()
  effectParams: {},     // Will be initialized in init()
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

  // Drum state
  drumEnabled: false,
  drumLevel: 50,
  drumStyle: 0,
  drumFill: 0,
  bpm: 120,

  // ========================================================
  // Init (FIXED - Initialize all 17 effects)
  // ========================================================
  init() {
    console.log("JamMate v3.1 Controller Starting...");

    // Initialize drum state
    this.drumEnabled = false;
    this.drumLevel = 50;
    this.drumStyle = 0;
    this.drumFill = 0;
    this.bpm = 120;

    // CRITICAL FIX: Initialize ALL 17 effect states FIRST
    // This prevents "Cannot set properties of undefined" errors
    for (let i = 0; i < 17; i++) {
      this.effectStates[i] = { enabled: false, selected: false };
      this.effectParams[i] = {};
    }

    // Initialize View and pass app reference
    View.init(this);
    

    // Setup BLE callbacks
    BLEService.onStatusChange = (status) => {
      View.updateConnectionStatus(status);
    };

    BLEService.onDataReceived = (packet) => {
      if (packet && typeof packet === 'object' && packet.cmd !== undefined) {
        const cmd = packet.cmd;
        const dataView = packet.dataView;

        if (cmd === 0x31 || cmd === 0x34) {
          console.log(`[BLE] Received Preset Data (cmd: 0x${cmd.toString(16)})`);
          this.loadStateFromBlob(dataView.buffer);
        } else if (cmd === 0x35) {
          const freq = dataView.getFloat32(0, true);
          View.updateTuner(freq);
        }
      }
      else if (packet instanceof DataView) {
        const cmd = packet.getUint8(0);
        if (cmd === 0x35) {
          const freq = packet.getFloat32(3, true);
          View.updateTuner(freq);
        }
      }
    };

    this.setupTabs();
    View.setupEffectsGrid(this.config);

    // Setup Drum Grid
    View.setupDrumGrid(this.drumPattern, (cell, row, col) => {
      const currentVal = this.drumPattern[row][col];
      const newVal = currentVal > 0 ? 0 : 100;
      this.drumPattern[row][col] = newVal;
      View.updateDrumCell(cell, newVal);

      console.log("[APP] Sending Drum Pattern...");
      const packet = Protocol.createDrumPatternPacket(this.drumPattern);
      BLEService.send(packet);
    });

    this.setupStaticKnobs();
    this.setupFileUpload();
    this.setupGlobalListeners();
    this.setupPresetListeners();
    this.setupDrumControls();  // ← Setup drum controls (all event listeners)
  },

  // ========================================================
  // Setup Drum Controls (FIXED - use sendDrumUpdate)
  // ========================================================
  setupDrumControls() {
    // Enable Checkbox
    const drumEnableEl = document.getElementById('drumEnable');
    if (drumEnableEl) {
      drumEnableEl.addEventListener('change', (e) => {
        this.drumEnabled = e.target.checked;
        this.sendDrumUpdate();
        View.updateStatus(this.drumEnabled ? "Drum ON" : "Drum OFF");
      });
    }

    // Level Knob
    const drumLevelKnobEl = document.getElementById('drumLevelKnob');
    if (drumLevelKnobEl && !drumLevelKnobEl.knob) {
      const knob = new Knob(drumLevelKnobEl, 0, 100, 50, (val) => {
        View.updateStatus(`Drum Level: ${Math.round(val)}`);
      });
      knob.onrelease = () => {
        this.drumLevel = knob.value;
        this.sendDrumUpdate();
      };
    }

    // Style Dropdown
    const drumStyleEl = document.getElementById('drumStyle');
    if (drumStyleEl) {
      drumStyleEl.addEventListener('change', (e) => {
        this.drumStyle = parseInt(e.target.value);
        this.sendDrumUpdate();
        View.updateStatus(`Drum Style: ${e.target.options[e.target.selectedIndex].text}`);
      });
    }

    // Fill Dropdown
    const drumFillEl = document.getElementById('drumFill');
    if (drumFillEl) {
      drumFillEl.addEventListener('change', (e) => {
        this.drumFill = parseInt(e.target.value);
        this.sendDrumUpdate();
        View.updateStatus(`Drum Fill: ${e.target.options[e.target.selectedIndex].text}`);
      });
    }
  },

  // ========================================================
  // Send Drum Update (0x41 command)
  // ========================================================
  sendDrumUpdate() {
    if (this.isUpdatingUI) return;

    const bpmEl = document.getElementById('bpmKnob');
    const currentBPM = bpmEl && bpmEl.knob ? bpmEl.knob.value : this.bpm;

    console.log(`[APP] Drum Update: En=${this.drumEnabled} Lvl=${this.drumLevel} BPM=${currentBPM} Style=${this.drumStyle} Fill=${this.drumFill}`);

    const pkt = Protocol.createDrumUpdate(
        this.drumEnabled || false,
        this.drumLevel || 50,
        currentBPM || 120,
        this.drumStyle || 0,
        this.drumFill || 0
    );

    // Log packet content
    const bytes = pkt instanceof ArrayBuffer ? new Uint8Array(pkt)
               : pkt.buffer instanceof ArrayBuffer ? new Uint8Array(pkt.buffer)
               : new Uint8Array();
    console.log('[APP] Drum packet bytes:', pkt);

    BLEService.send(pkt);
  },

  // ========================================================
  // Load State from Blob (FIXED - with safety checks)
  // ========================================================
  loadStateFromBlob(blob) {
    this.isUpdatingUI = true;

    try {
      const state = Protocol.deserializeState(blob);

      // Ensure all effectStates initialized (safety check)
      for (let i = 0; i < 17; i++) {
        if (!this.effectStates[i]) {
          this.effectStates[i] = { enabled: false, selected: false };
        }
        if (!this.effectParams[i]) {
          this.effectParams[i] = {};
        }
      }

      // Now safe to update from loaded state
      Object.keys(state.effectStates).forEach(idx => {
        const i = parseInt(idx);
        if (i < 17 && this.effectStates[i]) {
          this.effectStates[i].enabled = state.effectStates[i].enabled;
          if (state.effectParams[i]) {
            this.effectParams[i] = { ...this.effectParams[i], ...state.effectParams[i] };
          }
        }
      });

      // Load EQ points
      if (state.eqPoints && state.eqPoints.length > 0) {
        this.currentEQPoints = state.eqPoints;
        if (this.iirDesigner) {
          this.iirDesigner.points.forEach((pt, i) => {
            if (state.eqPoints[i]) {
              pt.freq = state.eqPoints[i].freq;
              pt.gain = state.eqPoints[i].gain;
              pt.q = state.eqPoints[i].q;
              pt.enabled = true;
            }
          });
          this.iirDesigner.draw();
        }
      }

      View.updateEffectButtons(this.effectStates);

      if (this.currentEffect !== null) {
        this.selectEffect(this.currentEffect);
      }

      // Update BPM knob
      const bpmKnob = document.getElementById('bpmKnob');
      if (bpmKnob && bpmKnob.knob) {
        bpmKnob.knob.value = state.bpm;
        this.bpm = state.bpm;
      }

      // Update Master knob
      const masterKnob = document.getElementById('masterKnob');
      if (masterKnob && masterKnob.knob) {
        masterKnob.knob.value = state.master;
      }

      View.updateStatus(`Loaded: ${state.name}`);
    } catch (e) {
      console.error("Load Failed:", e);
      View.updateStatus("Load failed - see console");
    }

    setTimeout(() => {
      this.isUpdatingUI = false;
    }, 100);
  },

  // ========================================================
  // Get Current State for Save
  // ========================================================
  getCurrentState() {
    let eqData = [];

    if (this.iirDesigner) {
      eqData = this.iirDesigner.points.map(pt => ({
        freq: pt.freq,
        gain: pt.gain,
        q: pt.q,
        enabled: pt.enabled !== false
      }));
    } else if (this.currentEQPoints) {
      eqData = this.currentEQPoints;
    }

    const bpmEl = document.getElementById('bpmKnob');
    const masterEl = document.getElementById('masterKnob');

    return {
      bpm: bpmEl && bpmEl.knob ? bpmEl.knob.value : 120,
      master: masterEl && masterEl.knob ? masterEl.knob.value : 50,
      name: `User Preset`,
      effectStates: this.effectStates,
      effectParams: this.effectParams,
      eqPoints: eqData
    };
  },

  // ========================================================
  // Preset Listeners
  // ========================================================
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

    document.getElementById('btnSavePreset').onclick = () => {
      modal.classList.add('active');
    };

    document.getElementById('btnCancelSave').onclick = () => {
      modal.classList.remove('active');
    };

    document.getElementById('btnConfirmSave').onclick = () => {
      const bankIndex = document.getElementById('saveBankSelect').selectedIndex;
      const slotIndex = document.getElementById('saveNumSelect').selectedIndex;

      if (PRESETS_LOCKED && bankIndex < 5) {
        View.updateStatus("Factory Banks Locked!");
        return;
      }

      console.log(`[APP] Saving to Bank ${bankIndex} Slot ${slotIndex}`);
      View.updateStatus("Saving...");

      const state = this.getCurrentState();
      const packet = Protocol.createSavePreset(bankIndex, slotIndex, state);
      BLEService.send(packet);

      modal.classList.remove('active');
    };
  },

  // ========================================================
  // Select Effect
  // ========================================================
  selectEffect(idx) {
    this.currentEffect = idx;

    Object.keys(this.effectStates).forEach(i => {
      this.effectStates[i].selected = (parseInt(i) === idx);
    });

    View.updateEffectButtons(this.effectStates);

    View.showEffectControls(
      this.config.tabs[idx],
      idx,
      this.effectParams[idx],
      this.effectStates,
      // Knob Callback
      (pid, val) => {
        if (this.isUpdatingUI) return;
        this.effectParams[idx][`knob${pid}`] = val;
        BLEService.send(Protocol.createParamUpdate(idx, pid, val));
      },
      // Dropdown Callback
      (pid, val) => {
        if (this.isUpdatingUI) return;
        const knobCount = this.config.tabs[idx].params.knobs.length;
        const paramId = knobCount + pid;
        this.effectParams[idx][`dropdown${pid}`] = val;
        BLEService.send(Protocol.createParamUpdate(idx, paramId, val));
      },
      // Toggle Callback
      (en) => {
        if (this.isUpdatingUI) return;
        this.effectStates[idx].enabled = en;
        View.updateEffectButtons(this.effectStates);
        BLEService.send(Protocol.createToggleUpdate(idx, en));
      },
      // EQ Callback
      (b, en, f, g, q) => {
        if (this.isUpdatingUI) return;
        BLEService.send(Protocol.createEQUpdate(b, en, f, g, q));
      }
    );
  },

  // ========================================================
  // Toggle Effect Enabled
  // ========================================================
  toggleEffectEnabled(idx) {
    if (this.isUpdatingUI) return;
    const newState = !this.effectStates[idx].enabled;
    this.effectStates[idx].enabled = newState;
    View.updateEffectButtons(this.effectStates);
    BLEService.send(Protocol.createToggleUpdate(idx, newState));
  },

  // ========================================================
  // Setup Tabs
  // ========================================================
  setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tabName + '-tab').classList.add('active');
      });
    });
  },

  // ========================================================
  // Setup Static Knobs
  // ========================================================
  setupStaticKnobs() {
    const createKnob = (id, name, max, initial, onChange) => {
      const el = document.getElementById(id);
      if (el) {
        const knob = new Knob(el, 0, max, initial, (val) => {
          View.updateStatus(`${name}: ${Math.round(val)}`);
        });
        el.knob = knob;
        knob.onrelease = () => onChange(knob.value);
      }
    };

    createKnob('whiteNoiseLevelKnob', 'Noise Level', 100, 0, (val) => {
      this.utilState.noise.level = val;
      this.sendUtilUpdate(0);
    });

    createKnob('toneLevelKnob', 'Tone Level', 100, 0, (val) => {
      this.utilState.tone.level = val;
      this.sendUtilUpdate(1);
    });

    createKnob('masterKnob', 'Master Vol', 100, 50, () => {
      this.sendGlobalUpdate();
    });

    createKnob('bpmKnob', 'BPM', 255, 120, () => {
      const bpmEl = document.getElementById('bpmKnob');
      if (bpmEl && bpmEl.knob) {
        this.bpm = bpmEl.knob.value;
      }
      this.sendDrumUpdate(); 
	  this.sendGlobalUpdate();
      
    });

    createKnob('blVolKnob', 'BT Vol', 100, 50, () => {
      this.sendGlobalUpdate();
    });

    createKnob('drumLevelKnob', 'Drum Level', 100, 50, (val) => {
      this.drumLevel = val;
      this.sendDrumUpdate();
    });
  },

  // ========================================================
  // Send Util Update
  // ========================================================
  sendUtilUpdate(type) {
    if (this.isUpdatingUI) return;

    let packet;
    if (type === 0) {
      const s = this.utilState.noise;
      packet = Protocol.createUtilUpdate(0, s.enabled, s.level, 0);
    } else {
      const s = this.utilState.tone;
      packet = Protocol.createUtilUpdate(1, s.enabled, s.level, s.freq);
    }

    BLEService.send(packet);
  },

  // ========================================================
  // Setup File Upload
  // ========================================================
  setupFileUpload() {
    const input = document.getElementById('fileInput');
    if (!input) return;

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      this.audioData = audioBuffer.getChannelData(0);
      this.sampleRate = audioBuffer.sampleRate;

      const previewData = this.audioData.slice(0, 16384);
      this.fullFFT = View.computeFFT(previewData);

      View.drawWaveform(this.audioData, 'waveformCanvas');
      View.drawSpectrum(this.audioData, this.sampleRate, 'spectrumCanvas', this.fullFFT);

      const btnSendIR = document.getElementById('btnSendIR');
      if (btnSendIR) btnSendIR.disabled = false;
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

  // ========================================================
  // Send Global Update
  // ========================================================
  sendGlobalUpdate(flash = false, reset = false) {
    if (this.isUpdatingUI) return;

    const masterEl = document.getElementById('masterKnob');
    const btVolEl = document.getElementById('blVolKnob');
    const bpmEl = document.getElementById('bpmKnob');

    const master = masterEl && masterEl.knob ? masterEl.knob.value : 50;
    const btVol = btVolEl && btVolEl.knob ? btVolEl.knob.value : 50;
    const bpm = bpmEl && bpmEl.knob ? bpmEl.knob.value : 120;

    const btEnable = document.getElementById('btEnableCheck') ? document.getElementById('btEnableCheck').checked : true;
    const bleEnable = document.getElementById('bleEnableCheck') ? document.getElementById('bleEnableCheck').checked : true;

    const packet = Protocol.createGlobalUpdate(master, btVol, bpm, btEnable, bleEnable, flash, reset);
    BLEService.send(packet);

    if (flash) View.updateStatus("Sending Flash Command...");
    if (reset) View.updateStatus("Sending Reset Command...");
  },

  // ========================================================
  // Setup Global Listeners
  // ========================================================
  setupGlobalListeners() {
    const btnTheme = document.getElementById('btnTheme');
    if (btnTheme) {
      btnTheme.onclick = () => {
        document.body.classList.toggle('light-theme');
        if (this.iirDesigner) this.iirDesigner.draw();
      };
    }

    const btnFullscreen = document.getElementById('btnFullscreen');
    if (btnFullscreen) {
      btnFullscreen.onclick = () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
      };
    }

    const btnConnect = document.getElementById('btnConnect');
    if (btnConnect) {
      btnConnect.onclick = () => {
        if (BLEService.isConnected) {
          BLEService.disconnect();
        } else {
          BLEService.connect();
        }
      };
    }

    // Double-click handlers for toggles
    const setupDoubleClickHandler = (id, onToggle) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      let clickCount = 0;
      let clickTimeout = null;

      btn.addEventListener('click', (e) => {
        clickCount++;
        if (clickCount === 1) {
          clickTimeout = setTimeout(() => {
            clickCount = 0;
          }, 250);
        } else if (clickCount === 2) {
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

    // Solo effect handler
    window.soloEffectOpen = false;
    window.showSoloEffect = function(name, idx) {
      // Implementation would go here
    };

    window.closeSoloEffect = function() {
      window.soloEffectOpen = false;
    };
  }
};