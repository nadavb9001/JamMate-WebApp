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
const DRUM_FX_ID = 18;

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
  effectOrder: null,
  // Drum state
  drumEnabled: false,
  drumLevel: 50,
  drumStyle: 0,
  drumFill: 0,
  drumNumber: 1,
  bpm: 120,
  looperEnabled: false,
  loopLevel: 50,
  loopNumber: 1, // legacy kept for compat
  loopSync: 0,   // 0=None, 1=Bar, 2=Beat
  loopArm: 0,    // 0=None, 1=Low, 2=High
  loopLength: 0, // 0=Custom, 4/8/12/16=bars
  loopTracks: 1,

  // ========================================================
  // Init (FIXED - Initialize all 17 effects)
  // ========================================================
  init() {
    console.log("JamMate v3.1 Controller Starting...");
	
	// ============================================================
    // CRITICAL: Initialize ALL effect states FIRST
    // ============================================================
    const effectCount = this.config.tabs.length;
    console.log(`[APP] Initializing ${effectCount} effects`);
    
    // Initialize effectStates for ALL indices
    this.effectStates = {};
    for (let i = 0; i < effectCount; i++) {
        this.effectStates[i] = {
            enabled: false,
            selected: false
        };
    }
    
    // Initialize effectParams for ALL indices
    this.effectParams = {};
    for (let i = 0; i < effectCount; i++) {
        this.effectParams[i] = {};
    }
    
    // Initialize effectOrder
    this.effectOrder = [];
    for (let i = 0; i < effectCount; i++) {
        this.effectOrder.push(i);
    }
    console.log(`[APP] Initialized: ${Object.keys(this.effectStates).length} effects`);
	
    // Initialize drum state
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

    
    // Initialize View and pass app reference
    View.init(this);
    
	

    // Setup BLE callbacks
    BLEService.onStatusChange = (status) => {
      View.updateConnectionStatus(status);
    };

    /*BLEService.onDataReceived = (packet) => {
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
		if (cmd === Protocol.CMD.NAM_LIST_DATA) {
			const index = dataView.getUint8(0);
			
			// Index 255 means "CLEAR LIST" (Start of new scan)
			if (index === 255) {
				console.log("[NAM] Clearing Model List");
				this.clearNamModels();
				return;
			}

			// Decode Name
			const nameBytes = new Uint8Array(dataView.buffer.slice(1));
			const name = new TextDecoder().decode(nameBytes);
			
			console.log(`[NAM] File ${index}: ${name}`);
			this.addNamModel(index, name);
		}
      }
      else if (packet instanceof DataView) {
        const cmd = packet.getUint8(0);
        if (cmd === 0x35) {
          const freq = packet.getFloat32(3, true);
          View.updateTuner(freq);
        }
      }
	  
    };*/
	
	BLEService.onDataReceived = (packet) => {
      // ---------------------------------------------------------
      // CASE A: Reassembled Packet (from BLEService._finalizePacket)
      // Object format: { cmd: 0xXX, dataView: DataView }
      // ---------------------------------------------------------
      if (packet && typeof packet === 'object' && packet.cmd !== undefined) {
        const cmd = packet.cmd;
        const dataView = packet.dataView;

        if (cmd === 0x31 || cmd === 0x34) {
          console.log(`[BLE] Received Preset Data (cmd: 0x${cmd.toString(16)})`);
          this.loadStateFromBlob(dataView.buffer);
        } 
      }
      
      // ---------------------------------------------------------
      // CASE B: Single Packet (Raw DataView)
      // ---------------------------------------------------------
      else if (packet instanceof DataView) {
        const cmd = packet.getUint8(0);

        // --- TUNER ---
        if (cmd === 0x35) {
          const freq = packet.getFloat32(3, true);
          View.updateTuner(freq);
        }

        // --- FIX: ADD NAM LIST HANDLER HERE ---
        if (cmd === Protocol.CMD.NAM_LIST_DATA) { // 0x45
            const index = packet.getUint8(1); // Byte 1 is index
            
            // Index 255 means "CLEAR LIST"
            if (index === 255) {
                console.log("[NAM] Clearing Model List");
                this.clearNamModels();
                return;
            }

            // Decode Name (Start at byte 2)
            // Packet: [0x45, Index, Char, Char, ...]
            const nameBytes = new Uint8Array(packet.buffer.slice(2));
            const name = new TextDecoder().decode(nameBytes);
            
            console.log(`[NAM] File ${index}: ${name}`);
            this.addNamModel(index, name);
        }
		
		if (cmd === Protocol.CMD.IR_LIST_DATA) { // Ensure this is defined as 0x46 in Protocol.js
			const index = packet.getUint8(1);
			
			// Index 255 means "Clear List"
			if (index === 255) {
				console.log("[IR] Clearing IR List");
				this.clearIrFiles();
				return;
			}

			// Decode Name
			const nameBytes = new Uint8Array(packet.buffer.slice(2));
			const name = new TextDecoder().decode(nameBytes);
			
			console.log(`[IR] File ${index}: ${name}`);
			this.addIrFile(index, name);
		}
		

      }
    };

    this.setupTabs();
    View.setupEffectsGrid(this.config);

    // Setup Drum Grid — velocity cycles Off→42→85→127→Off on click
    View.setupDrumGrid(this.drumPattern, (cell, row, col, newVelocity) => {
      this.drumPattern[row][col] = newVelocity;
      View.updateDrumCell(cell, newVelocity);
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
  // Setup Drum Controls — wires all drum + looper UI
  // ========================================================
  setupDrumControls() {
    // 1. Drum Enable
    const drumEnableEl = document.getElementById('drumEnable');
    if (drumEnableEl) {
      drumEnableEl.addEventListener('change', (e) => {
        this.drumEnabled = e.target.checked;
        this.sendDrumUpdate();
        View.updateStatus(this.drumEnabled ? 'Drum ON' : 'Drum OFF');
      });
    }

    // 2. Looper Enable
    const looperEnableEl = document.getElementById('looperEnable');
    if (looperEnableEl) {
      looperEnableEl.addEventListener('change', (e) => {
        this.looperEnabled = e.target.checked;
        this.sendDrumUpdate();
        View.updateStatus(this.looperEnabled ? 'Looper ON' : 'Looper OFF');
      });
    }

    // 3. Drum Level Knob
    const drumLevelEl = document.getElementById('drumLevelKnob');
    if (drumLevelEl && !drumLevelEl._knobInit) {
      drumLevelEl._knobInit = true;
      const knob = new Knob(drumLevelEl, 0, 100, this.drumLevel, (v) => {
        View.updateStatus(`Drum Vol: ${Math.round(v)}`);
      });
      knob.onrelease = () => { this.drumLevel = knob.value; this.sendDrumUpdate(); };
    }

    // 4. Loop Level Knob
    const loopLevelEl = document.getElementById('loopLevelKnob');
    if (loopLevelEl && !loopLevelEl._knobInit) {
      loopLevelEl._knobInit = true;
      const knob = new Knob(loopLevelEl, 0, 100, this.loopLevel, (v) => {
        View.updateStatus(`Loop Vol: ${Math.round(v)}`);
      });
      knob.onrelease = () => { this.loopLevel = knob.value; this.sendDrumUpdate(); };
    }

    // 5. Drum dropdowns: style, fill, number
    [
      ['drumStyle',  'style'],
      ['drumFill',   'fill'],
      ['drumNumber', 'drumNumber'],
    ].forEach(([id, prop]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', (e) => {
        this[prop] = parseInt(e.target.value);
        this.sendDrumUpdate();
        View.updateStatus(`${id}: ${e.target.value}`);
      });
    });

    // 6. Looper dropdowns: sync, arm, loopLength, loopTracks
    [
      ['loopSync',   'loopSync'],
      ['loopArm',    'loopArm'],
      ['loopLength', 'loopLength'],
      ['loopTracks', 'loopTracks'],
    ].forEach(([id, prop]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', (e) => {
        this[prop] = parseInt(e.target.value);
        this.sendDrumUpdate();
        View.updateStatus(`${id}: ${e.target.value}`);
      });
    });

    // 7. Save to SD
    const btnSaveToSD = document.getElementById('btnSaveToSD');
    if (btnSaveToSD) {
      btnSaveToSD.addEventListener('click', () => {
        const pkt = Protocol.createSaveToSD();
        BLEService.send(pkt);
        View.updateStatus('Saving to SD…');
      });
    }
  },

  // ========================================================
  // Send Drum + Looper state to ESP (CMD 0x41)
  // Packet carries: drum enable/level/bpm/style/fill/number
  //                 looper enable/level/sync/arm/loopLength/tracks
  // ========================================================
  sendDrumUpdate() {
    if (this.isUpdatingUI) return;
    const bpmEl = document.getElementById('bpmKnob');
    const currentBPM = bpmEl && bpmEl.knob ? bpmEl.knob.value : this.bpm;

    const pkt = Protocol.createDrumUpdate(
      this.drumEnabled  || false,
      this.drumLevel    || 50,
      currentBPM        || 120,
      this.drumStyle    || 0,
      this.drumFill     || 0,
      this.drumNumber   || 1,
      this.looperEnabled || false,
      this.loopLevel    || 50,
      this.loopSync     || 0,
      this.loopArm      || 0,
      this.loopLength   || 0,
      this.loopTracks   || 1
    );
    BLEService.send(pkt);
  },

  // ========================================================
  // Load State from Blob
  // Deserializes and populates effectParams using flat keys (p0, p1...)
  // p0 = checkbox/enable, p1..pK = knobs, pK+1..pK+D = dropdowns
  // ========================================================
  loadStateFromBlob(blob) {
    this.isUpdatingUI = true;

    try {
      const state = Protocol.deserializeState(blob);

      // Ensure all effectStates initialized
      for (let i = 0; i < 18; i++) {
        if (!this.effectStates[i]) {
          this.effectStates[i] = { enabled: false, selected: false };
        }
        if (!this.effectParams[i]) {
          this.effectParams[i] = {};
        }
      }

      // Populate effectParams using flat keys
      Object.keys(state.effectStates).forEach(idx => {
        const i = parseInt(idx);
        if (i >= 18) return;
        const config = this.config.tabs[i];
        if (!config) return;

        // p0 = checkbox
        const enabled = state.effectStates[i].enabled;
        this.effectStates[i].enabled = enabled;
        this.effectParams[i].p0 = enabled ? 1 : 0;

        // p1..pK = knobs
        const kCount = config.params.knobs.length;
        for (let k = 0; k < kCount; k++) {
          const v = state.effectParams[i] ? state.effectParams[i][`knob${k}`] : undefined;
          this.effectParams[i][`p${1 + k}`] = v !== undefined ? v : 50;
        }

        // pK+1..pK+D = dropdowns
        const dCount = config.params.dropdowns.length;
        for (let d = 0; d < dCount; d++) {
          const v = state.effectParams[i] ? state.effectParams[i][`dropdown${d}`] : undefined;
          this.effectParams[i][`p${1 + kCount + d}`] = v !== undefined ? v : 0;
        }
      });

      // Load EQ points
      if (state.eqPoints && state.eqPoints.length > 0) {
        this.currentEQPoints = state.eqPoints;
        if (this.iirDesigner) {
          this.iirDesigner.loadPoints(this.currentEQPoints);
          this.iirDesigner.masterPoints.forEach((pt, bandIdx) => {
            this.iirDesigner.triggerDataChange(bandIdx);
          });
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

      View.updateStatus(`Loaded: ${state.name}`);
    } catch (e) {
      console.error("Load Failed:", e);
      View.updateStatus("Load failed - see console");
    }

    setTimeout(() => {
      this.isUpdatingUI = false;
    }, 100);
  },
  
  // Helper functions in app object
	clearNamModels() {
		// 1. Find the NAM effect in Config (usually ID 15, "NAM")
		const namFx = this.config.tabs.find(t => t.short_name.includes("NAM") || t.short_name.includes("Nam"));
		if (namFx) {
			// Reset the "dropdowns" config source
			// Assuming NAM has 1 dropdown (Model) at index 0 of dropdowns array
			// We modify the 'config.js' structure dynamically
			if (!this.namModelsArray) this.namModelsArray = [];
			this.namModelsArray = []; 
		}
	},

	addNamModel(index, name) {
      // 1. Update Internal Array
      if (!this.namModelsArray) this.namModelsArray = [];
      this.namModelsArray[index] = name;

      // 2. Update the Config Source of Truth
      // Find the NAM effect configuration
      const namFx = this.config.tabs.find(t => t.short_name.includes("NAM") || t.title === "NAM");
      
      if (namFx) {
          // Identify the dropdown key used by NAM (e.g., "NAM Models")
          // We assume the first dropdown defined in the NAM effect is the model selector
          const dropdownName = namFx.params.dropdowns[0]; 
          
          if (dropdownName) {
              // Ensure the dropdown array exists in global config
              if (!this.config.dropdowns[dropdownName]) {
                  this.config.dropdowns[dropdownName] = [];
              }
              // Update the global config
              this.config.dropdowns[dropdownName][index] = name;
          }
      }

      // 3. Live DOM Update (Only if the user is currently looking at it)
      // (This matches the ID generated by View.js: "dropdown0" for the first dropdown)
      // Note: We need to find the ID of the NAM effect to target the correct select element
      const namFxIdx = this.config.tabs.findIndex(t => t.short_name.includes("NAM") || t.title === "NAM");
      
      if (namFxIdx !== -1 && this.currentEffect === namFxIdx) {
          // Re-render controls to reflect the new list safely
          // Or verify specific selector:
          // In View.js, dropdowns are not given IDs based on FX ID easily. 
          // It's safer to just refresh the view if we are on the active tab:
          this.selectEffect(this.currentEffect);
      }
	},
	
	clearIrFiles() {
		// 1. Update Internal Array (Optional, if you want to store it)
		this.irFilesArray = [];

		// 2. Find the Amp/Cab effect in Config (Short name "_FIR")
		const irFx = this.config.tabs.find(t => t.short_name === "_FIR");
		if (irFx) {
			// We need to clear the specific dropdown for "ir_file"
			// In your config, "ir_file" is likely the 5th item (index 4) based on your provided JSON
			// "dropdowns": ["amp_type", "tone_type", "ir_points", "ir_type","ir_file"] 
			
			if (!this.config.dropdowns["ir_file"]) this.config.dropdowns["ir_file"] = [];
			this.config.dropdowns["ir_file"] = [];
		}
	},

	addIrFile(index, name) {
		// 1. Update Global Config
		if (!this.config.dropdowns["ir_file"]) this.config.dropdowns["ir_file"] = [];
		this.config.dropdowns["ir_file"][index] = name;

		// 2. Live Update (If the user is currently looking at the Amp/Cab tab)
		const irFxIdx = this.config.tabs.findIndex(t => t.short_name === "_FIR");
		
		// Check if we are currently viewing the Amp/Cab effect
		if (irFxIdx !== -1 && this.currentEffect === irFxIdx) {
			// Find the specific dropdown element for "ir_file"
			// Based on your config, "ir_file" is the last dropdown (index 4)
			const dropdownEl = document.querySelector(`select[data-param="dropdown4"][data-fx-id="${irFxIdx}"]`);
			
			if (dropdownEl) {
				// If clearing (index 0 implies start of new list usually), clear options
				if (index === 0) dropdownEl.innerHTML = "";
				
				const option = document.createElement("option");
				option.value = index;
				option.text = name;
				dropdownEl.appendChild(option);
			}
		}
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
	// Function to handle Flash Button Click
	
    const modal = document.getElementById('saveModal');

    // Single open handler — works even in easy mode
    document.getElementById('btnSavePreset').addEventListener('click', (e) => {
      e.stopPropagation();
      modal.classList.add('active');
      modal.style.display = 'flex';
    });

	// --------------------------------------------------------
	// SAVE MODAL — confirm / cancel
	// --------------------------------------------------------
	document.getElementById('btnCancelSave').addEventListener('click', () => {
      modal.classList.remove('active');
      modal.style.display = '';
    });

	// Close on backdrop click
	modal.addEventListener('click', (e) => {
	  if (e.target === modal) {
	    modal.classList.remove('active');
	    modal.style.display = '';
	  }
	});
	document.getElementById('flash-btn').addEventListener('click', () => {
		if (confirm("Enter Bootloader Mode? The DSP will stop audio.")) {
			console.log("[APP] Sending FLSH command...");
			const packet = Protocol.createSystemPacket(Protocol.CMD.FLASH_DSP);
			BLEService.send(packet);
		}
	});

	// Function to handle Reset Button Click
	document.getElementById('reset-btn').addEventListener('click', () => {
		console.log("[APP] Sending RSTD command...");
		const packet = Protocol.createSystemPacket(Protocol.CMD.RESET_DSP);
		BLEService.send(packet);
	});

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
      modal.style.display = '';
    };
  },

  // ========================================================
  // Select Effect
  //
  // All three param types (checkbox, knobs, dropdowns) are now
  // addressed by a single flat index via Protocol.toFlatIdx().
  //   flatIdx 0        → checkbox (enable/disable)
  //   flatIdx 1..K     → knobs
  //   flatIdx K+1..K+D → dropdowns
  //
  // effectParams[idx] stores values by flat index:
  //   effectParams[idx].p0  = checkbox value (0|1)
  //   effectParams[idx].p1  = knob0 value
  //   effectParams[idx].p2  = knob1 value  … etc.
  // effectStates[idx].enabled mirrors p0 for the UI grid buttons.
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
      // ── Unified param callback (knobs, dropdowns, checkbox) ──────
      // type: 'knob' | 'dropdown' | 'checkbox', subIdx: 0-based within type
      (type, subIdx, val) => {
        if (this.isUpdatingUI) return;
        const flatIdx = Protocol.toFlatIdx(idx, type, subIdx);

        // Store in effectParams by flat key
        this.effectParams[idx][`p${flatIdx}`] = val;

        // Mirror enable state to effectStates for the grid buttons
        if (type === 'checkbox') {
          this.effectStates[idx].enabled = (val !== 0);
          View.updateEffectButtons(this.effectStates);
        }

        BLEService.send(Protocol.createParamUpdate(idx, flatIdx, val));
      },
      // ── EQ callback (unchanged) ────────────────────────────────
      (b, en, f, g, q) => {
        if (this.isUpdatingUI) return;
        if (!this.currentEQPoints) this.currentEQPoints = [];
        while (this.currentEQPoints.length <= b) {
          this.currentEQPoints.push({ freq: 100, gain: 0, q: 1.4, enabled: true });
        }
        this.currentEQPoints[b] = { freq: f, gain: g, q: q, enabled: (en === 1 || en === true) };
        BLEService.send(Protocol.createEQUpdate(b, en, f, g, q));
      }
    );
  },

  // ========================================================
  // Toggle Effect Enabled (from grid button double-click)
  // flatParamIdx 0 = checkbox — uses unified createParamUpdate
  // ========================================================
  toggleEffectEnabled(idx) {
    if (this.isUpdatingUI) return;
    const newState = !this.effectStates[idx].enabled;
    this.effectStates[idx].enabled = newState;
    this.effectParams[idx] = this.effectParams[idx] || {};
    this.effectParams[idx].p0 = newState ? 1 : 0;
    View.updateEffectButtons(this.effectStates);
    BLEService.send(Protocol.createParamUpdate(idx, 0, newState ? 1 : 0));
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
      if (this.drumEnabled) {
		  this.sendDrumUpdate();  // only when drum is enabled
		}
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
  
  // --- INSERT YOUR NEW FUNCTION HERE ---
  sendTunerUpdate(isEnabled) {
      // We reuse the UTIL command (0x23). 
      // Type 0 = Noise, Type 1 = Tone. Let's use Type 2 for Tuner.
      const packet = Protocol.createUtilUpdate(2, isEnabled, 0, 0);
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
  // Send Config Upload (CMD 0x50)
  // Pushes a compact JSON layout table to ESP LittleFS so the
  // ESP can split flat param indices without being reflashed.
  // ========================================================
  sendConfigUpdate() {
    console.log("[APP] Uploading config to ESP LittleFS...");
    View.updateStatus("Uploading config...");
    const packet = Protocol.createConfigUpload();
    BLEService.send(packet);
    View.updateStatus("Config upload sent");
  },

  // ========================================================
  // Setup Global Listeners
  // ========================================================
	setupGlobalListeners() {
		const appRef = this; // capture for use in globals

		const btnTheme = document.getElementById('btnTheme');
		if (btnTheme) {
			btnTheme.onclick = () => {
				document.body.classList.toggle('light-theme');
				if (this.iirDesigner) this.iirDesigner.draw();
			};
		}

		// SD Card Read Button Handler
		const btnReadSDCard = document.getElementById('btnReadSDCard');
		if (btnReadSDCard) {
		    btnReadSDCard.onclick = () => {
		        console.log("[APP] Sending SD Card Read command...");
		        BLEService.send(Protocol.createSDCardReadCommand());
		        View.updateStatus("SD Card Read command sent");
		    };
		}

		// Update Config Button — pushes config.js layout to ESP LittleFS
		const btnUpdateConfig = document.getElementById('btnUpdateConfig');
		if (btnUpdateConfig) {
		    btnUpdateConfig.onclick = () => {
		        if (!BLEService.isConnected) {
		            View.updateStatus("Not connected — connect first");
		            return;
		        }
		        if (confirm("Upload current config.js to ESP? The device will use new param counts immediately.")) {
		            this.sendConfigUpdate();
		        }
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

		const setupDoubleClickHandler = (id, onToggle) => {
			const btn = document.getElementById(id);
			if (!btn) return;
			let clickCount = 0;
			let clickTimeout = null;

			btn.addEventListener('click', () => {
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

		// === Easy Mode / Solo Effect overlay ===
	

		// Solo effect handler
		window.soloEffectOpen = false;

		window.closeSoloEffect = () => {
			// Only remove overlays that are actual solo-effect popups,
			// NOT the save modal (which also has solo-effect-overlay class).
			const overlay = document.querySelector('.solo-effect-overlay:not(#saveModal)');
			if (overlay) {
				// Move #effectControls back into the effects-tab before removing the overlay
				const controls   = document.getElementById('effectControls');
				const effectsTab = document.getElementById('effects-tab');
				if (controls && effectsTab && overlay.contains(controls)) {
					// Re-hide it — in easy mode we don't show inline controls
					controls.style.display = 'none';
					effectsTab.appendChild(controls);
				}
				overlay.remove();
			}
			window.soloEffectOpen = false;
		};

		window.showSoloEffect = (name, idx) => {
			if (window.soloEffectOpen) window.closeSoloEffect();
			window.soloEffectOpen = true;

			const overlay = document.createElement('div');
			overlay.className = 'solo-effect-overlay';

			const cont = document.createElement('div');
			cont.className = 'solo-effect-container';

			const title = document.createElement('div');
			title.className   = 'solo-effect-title';
			title.textContent = name;

			const closeBtn = document.createElement('button');
			closeBtn.className   = 'solo-effect-close-btn';
			closeBtn.textContent = '✕';
			closeBtn.addEventListener('click', window.closeSoloEffect);

			// Close on backdrop click
			overlay.addEventListener('click', (e) => {
				if (e.target === overlay) window.closeSoloEffect();
			});

			cont.appendChild(title);
			cont.appendChild(closeBtn);
			overlay.appendChild(cont);
			document.body.appendChild(overlay);

			// Move #effectControls into popup and make it visible
			const controls = document.getElementById('effectControls');
			if (controls) {
				controls.style.display = '';
				cont.appendChild(controls);
			}

			if (app.iirDesigner) requestAnimationFrame(() => app.iirDesigner.draw());
		};


		const btnEasyMode = document.getElementById('btnEasyMode');
		if (btnEasyMode) {
			// ── Measure & fit buttons to fill the panel ────────────
			const resizeEasyMode = () => {
				const tab   = document.getElementById('effects-tab');
				if (!tab || !tab.classList.contains('easy-mode')) return;

				const scroll = tab.querySelector('.effects-scroll');
				const grid   = tab.querySelector('.effects-grid');
				const btns   = grid ? grid.querySelectorAll('.effect-btn') : [];
				const n      = btns.length;
				if (!scroll || !grid || n === 0) return;

				// Available space (scroll container)
				const W = scroll.clientWidth  - 8;   // 4px padding each side
				const H = scroll.clientHeight - 8;

				// Find cols that produces squarish cells filling the space best.
				// Score = how close aspect ratio of a cell is to square (1:1).
				let bestCols = 1, bestScore = Infinity;
				for (let cols = 1; cols <= n; cols++) {
					const rows  = Math.ceil(n / cols);
					const gap   = 4;
					const cellW = (W - gap * (cols - 1)) / cols;
					const cellH = (H - gap * (rows - 1)) / rows;
					if (cellW < 44 || cellH < 36) continue;  // too small to tap
					const ratio = Math.max(cellW, cellH) / Math.min(cellW, cellH);
					// Prefer ratios close to 1 (square), penalise very narrow/tall
					const score = Math.abs(ratio - 1.15); // slight vertical preferred
					if (score < bestScore) { bestScore = score; bestCols = cols; }
				}

				const cols   = bestCols;
				const rows   = Math.ceil(n / cols);
				const gap    = 4;
				const cellW  = Math.floor((W - gap * (cols - 1)) / cols);
				const cellH  = Math.floor((H - gap * (rows - 1)) / rows);

				grid.style.gridTemplateColumns = `repeat(${cols}, ${cellW}px)`;
				grid.style.gridTemplateRows    = `repeat(${rows}, ${cellH}px)`;
				grid.style.gap                 = `${gap}px`;
			};

			// Store so we can call it on window resize
			this._resizeEasyMode = resizeEasyMode;

			btnEasyMode.onclick = (e) => {
				const tab = document.getElementById('effects-tab');
				if (!tab) return;

				tab.classList.toggle('easy-mode');

				// Ensure all effect buttons remain draggable
				document.querySelectorAll('.effect-btn').forEach(btn => {
					btn.draggable = true;
				});

				const isActive = tab.classList.contains('easy-mode');

				e.target.style.background = isActive ? 'var(--color-accent)' : 'var(--color-bg-surface)';
				e.target.style.color      = isActive ? '#000' : 'var(--color-text-primary)';

				window.soloEffectOpen = false;
				View.updateStatus(isActive ? 'Easy Mode Enabled' : 'Easy Mode Disabled');

				if (isActive) {
					// Wait one frame for layout to settle before measuring
					requestAnimationFrame(() => requestAnimationFrame(resizeEasyMode));
				}
			};

			// Re-fit on every resize / orientation change
			window.addEventListener('resize', () => {
				requestAnimationFrame(() => this._resizeEasyMode && this._resizeEasyMode());
			});
		}
		const tunerEnable = document.getElementById('tunerEnable');
		if (tunerEnable) {
			tunerEnable.addEventListener('change', (e) => {
				const isEnabled = e.target.checked;
				this.sendTunerUpdate(isEnabled);
				View.updateStatus(isEnabled ? "Tuner ON" : "Tuner OFF");
			});
		}
		
		
		
			
	},
	
	/**
	 * Reorder effects by swapping their positions
	 * @param {number} fromIdx - Source effect index
	 * @param {number} toIdx - Target effect index
	 */
	reorderEffects(fromIdx, toIdx) {
		console.log(`[APP] Before swap - order: ${this.effectOrder.join(',')}`);
		
		// Swap states
		const tempStates = this.effectStates[fromIdx];
		this.effectStates[fromIdx] = this.effectStates[toIdx];
		this.effectStates[toIdx] = tempStates;
		
		const tempParams = this.effectParams[fromIdx];
		this.effectParams[fromIdx] = this.effectParams[toIdx];
		this.effectParams[toIdx] = tempParams;
		
		// NEW: Swap order array
		const tempOrder = this.effectOrder[fromIdx];
		this.effectOrder[fromIdx] = this.effectOrder[toIdx];
		this.effectOrder[toIdx] = tempOrder;
		
		console.log(`[APP] After swap - order: ${this.effectOrder.join(',')}`);
		
		// Rebuild UI with new order
		this.rebuildEffectsUI();
		
		// Feedback
		const fromName = this.config.tabs[fromIdx]?.title || 'Effect';
		const toName = this.config.tabs[toIdx]?.title || 'Effect';
		View.updateStatus(`Reordered: ${fromName} ↔ ${toName}`);
	},
	
	rebuildEffectsUI() {
		const grid = document.getElementById('effectsGrid');
		grid.innerHTML = '';
		
		this.effectOrder.forEach((idx) => {
			// Safety: Create state if missing
			if (!this.effectStates[idx]) {
				this.effectStates[idx] = {
					enabled: false,
					selected: false
				};
			}
			
			const effect = this.config.tabs[idx];
			const state = this.effectStates[idx];  // Now guaranteed to exist
			
			const btn = document.createElement('div');
			btn.className = 'effect-btn';
			btn.dataset.index = idx;
			btn.draggable = true;
			btn.textContent = effect.title;
			
			if (state.selected) btn.classList.add('selected');
			if (state.enabled) btn.classList.add('enabled');
			
			btn.addEventListener('click', () => {
				this.selectEffect(idx);
			});
			
			grid.appendChild(btn);
		});
		
		this.setupDragDropListeners();
	},

	setupDragDropListeners() {
		const buttons = document.querySelectorAll('.effect-btn');
		
		buttons.forEach((btn) => {
			const idx = parseInt(btn.dataset.index);
			
			btn.addEventListener('dragstart', (e) => {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('effectIndex', idx);
				btn.classList.add('dragging');
			});
			
			btn.addEventListener('dragend', (e) => {
				btn.classList.remove('dragging');
				document.querySelectorAll('.effect-btn').forEach(b => {
					b.classList.remove('drag-over');
				});
			});
			
			btn.addEventListener('dragover', (e) => {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				btn.classList.add('drag-over');
			});
			
			btn.addEventListener('dragleave', (e) => {
				btn.classList.remove('drag-over');
			});
			
			btn.addEventListener('drop', (e) => {
				e.preventDefault();
				e.stopPropagation();
				btn.classList.remove('drag-over');
				
				const sourceIdx = parseInt(e.dataTransfer.getData('effectIndex'));
				if (sourceIdx !== idx) {
					this.reorderEffects(sourceIdx, idx);
				}
			});
		});
	}


	

};

