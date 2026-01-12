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
  bpm: 120,
  looperEnabled: false,
  loopLevel: 50,
  loopNumber: 1, // 1-5
  loopSync: 0,   // 0=None, 1=Beat, 2=Bar

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
    this.bpm = 120;
	this.looperEnabled = false;
    this.loopLevel = 50;
    this.loopNumber = 1;
    this.loopSync = 0;

    
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
// 1. Drum Enable
    const drumEnableEl = document.getElementById('drumEnable');
    if (drumEnableEl) {
      drumEnableEl.addEventListener('change', (e) => {
        this.drumEnabled = e.target.checked;
        this.sendDrumUpdate();
        View.updateStatus(this.drumEnabled ? "Drum ON" : "Drum OFF");
      });
    }

    // 2. Looper Enable (NEW)
    const looperEnableEl = document.getElementById('looperEnable');
    if (looperEnableEl) {
      looperEnableEl.addEventListener('change', (e) => {
        this.looperEnabled = e.target.checked;
        this.sendDrumUpdate();
        View.updateStatus(this.looperEnabled ? "Looper ON" : "Looper OFF");
      });
    }

    // 3. Drum Level Knob
    const drumLevelKnobEl = document.getElementById('drumLevelKnob');
    if (drumLevelKnobEl && !drumLevelKnobEl.knob) {
      const knob = new Knob(drumLevelKnobEl, 0, 100, 50, (val) => {
        View.updateStatus(`Drum Vol: ${Math.round(val)}`);
      });
      knob.onrelease = () => {
        this.drumLevel = knob.value;
        this.sendDrumUpdate();
      };
    }

    // 4. Loop Level Knob (NEW)
    const loopLevelKnobEl = document.getElementById('loopLevelKnob');
    if (loopLevelKnobEl && !loopLevelKnobEl.knob) {
      const knob = new Knob(loopLevelKnobEl, 0, 100, 50, (val) => {
        View.updateStatus(`Loop Vol: ${Math.round(val)}`);
      });
      knob.onrelease = () => {
        this.loopLevel = knob.value;
        this.sendDrumUpdate();
      };
    }

    // 5. Style & Fill Dropdowns
    ['drumStyle', 'drumFill',"loopNum","loopSync"].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', (e) => {
            this[id] = parseInt(e.target.value);
            this.sendDrumUpdate();
        });
    });

    // 6. Loop Number (NEW)
    /*const loopNumEl = document.getElementById('loopNumber');
    if (loopNumEl) {
        loopNumEl.addEventListener('change', (e) => {
            this.loopNumber = parseInt(e.target.value);
            this.sendDrumUpdate();
            View.updateStatus(`Loop Track: ${this.loopNumber}`);
        });
    }

    // 7. Loop Sync (NEW)
    const loopSyncEl = document.getElementById('loopSync');
    if (loopSyncEl) {
        loopSyncEl.addEventListener('change', (e) => {
            this.loopSync = parseInt(e.target.value);
            this.sendDrumUpdate();
            const texts = ["None", "Beat", "Bar"];
            View.updateStatus(`Sync: ${texts[this.loopSync]}`);
        });
    }*/
  },

  // ========================================================
  // Send Drum Update (0x41 command)
  // ========================================================
	sendDrumUpdate() {
		if (this.isUpdatingUI) return;

		const bpmEl = document.getElementById('bpmKnob');
		const currentBPM = bpmEl && bpmEl.knob ? bpmEl.knob.value : this.bpm;

		console.log(`[APP] Drum/Loop Update`);

		const pkt = Protocol.createDrumUpdate(
			this.drumEnabled || false,
			this.drumLevel || 50,
			currentBPM || 120,
			this.drumStyle || 0,
			this.drumFill || 0,
			// New Params
			this.looperEnabled || false,
			this.loopLevel || 50,
			this.loopNumber || 1,
			this.loopSync || 0
		);

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
      for (let i = 0; i < 18; i++) {
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
        if (i < 18 && this.effectStates[i]) {
          this.effectStates[i].enabled = state.effectStates[i].enabled;
          if (state.effectParams[i]) {
            this.effectParams[i] = { ...this.effectParams[i], ...state.effectParams[i] };
          }
        }
      });

      // Load EQ points
	// ✅ NEW CODE (SYNC TO HARDWARE)
	if (state.eqPoints && state.eqPoints.length > 0) {
		this.currentEQPoints = state.eqPoints;

		// Check if IIRDesigner is currently active/visible
		if (this.iirDesigner) {
			this.iirDesigner.loadPoints(this.currentEQPoints);

			// === NEW: SYNC ALL EQ BANDS TO HARDWARE DSP ===
			// loadPoints() updates the UI and infers count,
			// but we also need to send all band data to hardware
			console.log('[APP] Syncing loaded EQ state to hardware DSP...');
			this.iirDesigner.masterPoints.forEach((pt, bandIdx) => {
				// triggerDataChange() will:
				// 1. Find the point in masterPoints
				// 2. Send via Protocol.createEQUpdate()
				// 3. Send to BLEService
				this.iirDesigner.triggerDataChange(bandIdx);
			});
			console.log('[APP] EQ sync complete - all bands sent to DSP');
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
      //const masterKnob = document.getElementById('masterKnob');
      //if (masterKnob && masterKnob.knob) {
      //  masterKnob.knob.value = state.master;
      //}

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

    document.getElementById('btnSavePreset').onclick = () => {
      modal.classList.add('active');
    };
	
	// --------------------------------------------------------
	// ROBUST SAVE MODAL HANDLER (Event Delegation)
	// Works even if the Header/HTML is refreshed dynamically.
	// --------------------------------------------------------
	document.body.addEventListener('click', (e) => {
		
		// 1. OPEN MODAL (Check if clicked element is the Save Button or its icon)
		if (e.target.closest('#btnSavePreset')) {
			const modal = document.getElementById('saveModal');
			if (modal) modal.style.display = 'flex';
		}

		// 2. CLOSE MODAL (Cancel Button)
		if (e.target.closest('#btnCancelSave')) {
			const modal = document.getElementById('saveModal');
			if (modal) modal.style.display = 'none';
		}
	});

    document.getElementById('btnCancelSave').onclick = () => {
      modal.classList.remove('active');
    };
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
      /*(b, en, f, g, q) => {
        if (this.isUpdatingUI) return;
        BLEService.send(Protocol.createEQUpdate(b, en, f, g, q));
      }*/
	  (b, en, f, g, q) => {
        if (this.isUpdatingUI) return;
        
        // Update Internal State immediately so it doesn't get lost on tab switch
        if(!this.currentEQPoints) this.currentEQPoints = [];
        // Ensure array is big enough
        while(this.currentEQPoints.length <= b) this.currentEQPoints.push({freq:100, gain:0, q:1.4, enabled:true});
        
        this.currentEQPoints[b] = { freq: f, gain: g, q: q, enabled: (en === 1 || en === true) };

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
			const overlay = document.querySelector('.solo-effect-overlay');
			const controls = document.getElementById('effectControls');
			const effectsTab = document.getElementById('effects-tab');

			if (overlay) {
				if (controls && effectsTab) {
					effectsTab.appendChild(controls);  // put controls back
				}
				overlay.remove();
			}
			window.soloEffectOpen = false;
		};

		window.showSoloEffect = (name, idx) => {
			// If something is already open, clean it up first
			if (window.soloEffectOpen) {
				window.closeSoloEffect();
			}
			window.soloEffectOpen = true;

			const overlay = document.createElement('div');
			overlay.className = 'solo-effect-overlay';

			const cont = document.createElement('div');
			cont.className = 'solo-effect-container';

			const title = document.createElement('div');
			title.className = 'solo-effect-title';
			title.textContent = name;

			const closeBtn = document.createElement('button');
			closeBtn.className = 'solo-effect-close-btn';
			closeBtn.textContent = 'X';
			closeBtn.addEventListener('click', window.closeSoloEffect);

			cont.appendChild(title);
			cont.appendChild(closeBtn);
			overlay.appendChild(cont);
			document.body.appendChild(overlay);

			const controls = document.getElementById('effectControls');
			if (controls) {
				cont.appendChild(controls);
			}

			if (app.iirDesigner) {
				requestAnimationFrame(() => app.iirDesigner.draw());
			}
		};


		const btnEasyMode = document.getElementById('btnEasyMode');
		if (btnEasyMode) {
			btnEasyMode.onclick = (e) => {
				const tab = document.getElementById('effects-tab');
				if (!tab) return;

				tab.classList.toggle('easy-mode');
				
				// Ensure all effect buttons remain draggable
				document.querySelectorAll('.effect-btn').forEach(btn => {
					btn.draggable = true;
				});
		
		
				const isActive = tab.classList.contains('easy-mode');

				e.target.style.background = isActive
					? 'var(--color-accent)'
					: 'var(--color-bg-surface)';
				e.target.style.color = isActive
					? '#000'
					: 'var(--color-text-primary)';

				window.soloEffectOpen = false;
				View.updateStatus(isActive ? 'Easy Mode Enabled' : 'Easy Mode Disabled');
			};
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

