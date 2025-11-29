import { APP_CONFIG } from './config.js';
import { View } from './ui/View.js';
import { Knob } from './ui/Knob.js';
import { BLEService } from './services/BLEService.js';
import { Protocol } from './services/Protocol.js';

// =========================================================
// DEVELOPMENT FLAG
const PRESETS_LOCKED = false; 
// =========================================================

// FX ID for the Drum Machine (Virtual Effect)
const DRUM_FX_ID = 17;

const app = {
    config: APP_CONFIG,
    currentEffect: null,
    drumPattern: Array(9).fill(null).map(() => Array(16).fill(0)),
    effectStates: {},
    effectParams: {},
    currentEQPoints: null, 
    utilState: { noise: { enabled: false, level: 0 }, tone: { enabled: false, level: 0, freq: 670 } },
    audioData: null, sampleRate: null, fullFFT: null, iirDesigner: null, 
    isUpdatingUI: false, 

    init() {
        console.log("JamMate v3.1 Controller Starting...");
        
        this.config.tabs.forEach((_, idx) => {
            this.effectParams[idx] = {};
            this.effectStates[idx] = { enabled: false, selected: false };
        });

        View.init(this);
        
        BLEService.onStatusChange = (status) => { View.updateConnectionStatus(status); };
        
        BLEService.onDataReceived = (packet) => {
            // Check if this is a multi-packet command (object with cmd and dataView)
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
            // Handle single-packet commands (direct DataView)
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
        
        // Setup Drum Grid and Pattern Sender
        View.setupDrumGrid(this.drumPattern, (cell, row, col) => { 
            // 1. Toggle UI
            const currentVal = this.drumPattern[row][col];
            const newVal = currentVal > 0 ? 0 : 100; // Toggle 0 or 100 velocity
            this.drumPattern[row][col] = newVal;
            View.updateDrumCell(cell, newVal);

            // 2. Send Packet to Device
            console.log("Sending Drum Pattern...");
            const packet = Protocol.createDrumPatternPacket(this.drumPattern);
            BLEService.send(packet);
        });

        this.setupStaticKnobs();
        this.setupFileUpload();
        this.setupGlobalListeners();
        this.setupPresetListeners();
        this.setupDrumControls(); // NEW
    },

    setupDrumControls() {
        // Enable Checkbox
        document.getElementById('drumEnable').addEventListener('change', (e) => {
            const enabled = e.target.checked;
            // Send as Toggle for FX ID 17
            BLEService.send(Protocol.createToggleUpdate(DRUM_FX_ID, enabled));
            View.updateStatus(enabled ? "Drum ON" : "Drum OFF");
        });

        // Style Dropdown (Param 1)
        document.getElementById('drumStyle').addEventListener('change', (e) => {
            const val = e.target.selectedIndex;
            BLEService.send(Protocol.createParamUpdate(DRUM_FX_ID, 1, val));
            View.updateStatus(`Drum Style: ${val}`);
        });

        // Fill Dropdown (Param 2)
        document.getElementById('drumFill').addEventListener('change', (e) => {
            const val = e.target.selectedIndex;
            BLEService.send(Protocol.createParamUpdate(DRUM_FX_ID, 2, val));
            View.updateStatus(`Drum Fill: ${val}`);
        });
    },

    loadStateFromBlob(blob) {
        this.isUpdatingUI = true; 
        try {
            const state = Protocol.deserializeState(blob);
            
            Object.keys(state.effectStates).forEach(idx => {
                const i = parseInt(idx);
                this.effectStates[i].enabled = state.effectStates[i].enabled;
                if (state.effectParams[i]) this.effectParams[i] = { ...this.effectParams[i], ...state.effectParams[i] };
            });

            if (state.eqPoints && state.eqPoints.length > 0) {
                this.currentEQPoints = state.eqPoints;
                if (this.iirDesigner) {
                    this.iirDesigner.points.forEach((pt, i) => {
                        if (state.eqPoints[i]) {
                            pt.freq = state.eqPoints[i].freq; pt.gain = state.eqPoints[i].gain; pt.q = state.eqPoints[i].q; pt.enabled = true;
                        }
                    });
                    this.iirDesigner.draw();
                }
            }

            View.updateEffectButtons(this.effectStates);
            if (this.currentEffect !== null) this.selectEffect(this.currentEffect); 
            
            if (document.getElementById('bpmKnob')) document.getElementById('bpmKnob').knob.value = state.bpm;
            if (document.getElementById('masterKnob')) document.getElementById('masterKnob').knob.value = state.master;
            
            View.updateStatus(`Loaded: ${state.name}`);
        } catch (e) {
            console.error("Load Failed:", e);
        }
        setTimeout(() => { this.isUpdatingUI = false; }, 100);
    },
	


    getCurrentState() {
        let eqData = [];
        if (this.iirDesigner) {
            eqData = this.iirDesigner.points.map(pt => ({ freq: pt.freq, gain: pt.gain, q: pt.q }));
        } else if (this.currentEQPoints) {
            eqData = this.currentEQPoints;
        }
        return {
            bpm: document.getElementById('bpmKnob').knob.value,
            master: document.getElementById('masterKnob').knob.value,
            name: `User Preset`, 
            effectStates: this.effectStates,
            effectParams: this.effectParams,
            eqPoints: eqData
        };
    },

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

    // In app.js
		
	selectEffect(idx) {
		this.currentEffect = idx;
		Object.keys(this.effectStates).forEach(i => { this.effectStates[i].selected = (parseInt(i) === idx); });
		View.updateEffectButtons(this.effectStates);
		
		View.showEffectControls(
			this.config.tabs[idx], idx, this.effectParams[idx], this.effectStates,
			// Knob Callback (Correct)
			(pid, val) => { 
				if(this.isUpdatingUI) return;
				this.effectParams[idx][`knob${pid}`] = val; 
				BLEService.send(Protocol.createParamUpdate(idx, pid, val)); 
			},
			// Dropdown Callback (ERROR IS HERE)
			(pid, val) => { 
				if(this.isUpdatingUI) return; 
				const offsetId = 10 + pid; 
				this.effectParams[idx][`dropdown${pid}`] = val; 
				
				// CHANGE 'value' TO 'val'
				// BLEService.send(Protocol.createParamUpdate(idx, offsetId, value)); // <--- ERROR
				BLEService.send(Protocol.createParamUpdate(idx, offsetId, val));      // <--- FIXED
			},
			// Toggle Callback (Correct)
			(en) => { 
				if(this.isUpdatingUI) return;
				this.effectStates[idx].enabled = en; 
				View.updateEffectButtons(this.effectStates); 
				BLEService.send(Protocol.createToggleUpdate(idx, en)); 
			},
			// EQ Callback (Correct)
			(b, en, f, g, q) => { 
				if(this.isUpdatingUI) return;
				BLEService.send(Protocol.createEQUpdate(b, en, f, g, q)); 
			}
		);
	},

    toggleEffectEnabled(idx) {
        if(this.isUpdatingUI) return;
        const newState = !this.effectStates[idx].enabled;
        this.effectStates[idx].enabled = newState;
        View.updateEffectButtons(this.effectStates);
        BLEService.send(Protocol.createToggleUpdate(idx, newState));
    },

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

    setupStaticKnobs() {
        const createKnob = (id, name, max, initial, onChange) => {
            const el = document.getElementById(id);
            if(el) {
                new Knob(el, 0, max, initial, (val) => {
                    View.updateStatus(`${name}: ${Math.round(val)}`);
                }).onrelease = () => onChange(el.knob.value);
            }
        };
        createKnob('whiteNoiseLevelKnob', 'Noise Level', 100, 0, (val) => { this.utilState.noise.level = val; this.sendUtilUpdate(0); });
        createKnob('toneLevelKnob', 'Tone Level', 100, 0, (val) => { this.utilState.tone.level = val; this.sendUtilUpdate(1); });
        // UPDATE: Master Knob now triggers Global Update
        createKnob('masterKnob', 'Master Vol', 100, 50, () => this.sendGlobalUpdate());

        // UPDATE: BPM Knob now triggers Global Update
        createKnob('bpmKnob', 'BPM', 255, 120, () => this.sendGlobalUpdate());

        // UPDATE: BT Volume Knob now triggers Global Update
        createKnob('blVolKnob', 'BT Vol', 100, 50, () => this.sendGlobalUpdate());
        

        
        
        // Drum Level (Param 0 of Virtual Effect)
        createKnob('drumLevelKnob', 'Drum Level', 100, 50, (val) => {
            BLEService.send(Protocol.createParamUpdate(DRUM_FX_ID, 0, val));
        });
    },

    sendUtilUpdate(type) {
        if (this.isUpdatingUI) return;
        let packet;
        if (type === 0) { 
            const s = this.utilState.noise; packet = Protocol.createUtilUpdate(0, s.enabled, s.level, 0);
        } else { 
            const s = this.utilState.tone; packet = Protocol.createUtilUpdate(1, s.enabled, s.level, s.freq);
        }
        BLEService.send(packet);
    },

    setupFileUpload() {
        const input = document.getElementById('fileInput');
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
            document.getElementById('btnSendIR').disabled = false;
        });
        const irPointsSelect = document.getElementById('irPoints');
        if(irPointsSelect) {
            irPointsSelect.addEventListener('change', () => {
                if(this.audioData && this.fullFFT) {
                    View.drawSpectrum(this.audioData, this.sampleRate, 'spectrumCanvas', this.fullFFT);
                }
            });
        }
    },
	
	sendGlobalUpdate(flash = false, reset = false) {
        if(this.isUpdatingUI) return;

        const master = document.getElementById('masterKnob').knob.value;
        const btVol = document.getElementById('blVolKnob').knob.value;
        const bpm = document.getElementById('bpmKnob').knob.value;
        
        // Assuming you have checkboxes with these IDs (based on your prompt)
        // If they don't exist in DOM yet, ensure they are created in HTML
        const btEnable = document.getElementById('btEnableCheck') ? document.getElementById('btEnableCheck').checked : true;
        const bleEnable = document.getElementById('bleEnableCheck') ? document.getElementById('bleEnableCheck').checked : true;

        // Send Packet
        const packet = Protocol.createGlobalUpdate(master, btVol, bpm, btEnable, bleEnable, flash, reset);
        BLEService.send(packet);
        
        if(flash) View.updateStatus("Sending Flash Command...");
        if(reset) View.updateStatus("Sending Reset Command...");
    },

    setupGlobalListeners() {
        document.getElementById('btnTheme').onclick = () => {
             document.body.classList.toggle('light-theme');
             if(this.iirDesigner) this.iirDesigner.draw();
        };
        document.getElementById('btnFullscreen').onclick = () => {
            !document.fullscreenElement ? document.documentElement.requestFullscreen() : document.exitFullscreen();
        };
        document.getElementById('btnConnect').onclick = () => {
            if(BLEService.isConnected) BLEService.disconnect(); else BLEService.connect();
        };
        const setupDoubleClickHandler = (id, onToggle) => {
            const btn = document.getElementById(id);
            if(!btn) return;
            let clickCount = 0; let clickTimeout = null;
            btn.addEventListener('click', (e) => {
                clickCount++;
                if (clickCount === 1) { clickTimeout = setTimeout(() => { clickCount = 0; }, 250); }
                else if (clickCount === 2) { clearTimeout(clickTimeout); clickCount = 0; onToggle(); }
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
        if(toneInput) {
            toneInput.addEventListener('change', (e) => {
                let val = parseInt(e.target.value);
                if(isNaN(val)) val = 670;
                this.utilState.tone.freq = val;
                this.sendUtilUpdate(1);
            });
        }
        window.soloEffectOpen = false;
        window.showSoloEffect = function(name, idx) {
            window.soloEffectOpen = true;
            const overlay = document.createElement('div'); overlay.className = 'solo-effect-overlay';
            const cont = document.createElement('div'); cont.className = 'solo-effect-container';
            cont.innerHTML = `<div class="solo-effect-title">${name}</div><button class="solo-effect-close-btn" onclick="window.closeSoloEffect()">X</button>`;
            overlay.appendChild(cont); document.body.appendChild(overlay);
            const controls = document.getElementById('effectControls');
            cont.appendChild(controls);
            if(app.iirDesigner) requestAnimationFrame(() => app.iirDesigner.draw());
        };
        window.closeSoloEffect = function() {
            const ov = document.querySelector('.solo-effect-overlay');
            if(ov) {
                const controls = document.getElementById('effectControls');
                document.getElementById('effects-tab').appendChild(controls);
                ov.remove();
            }
            window.soloEffectOpen = false;
        };
        document.getElementById('btnEasyMode').onclick = (e) => {
            const tab = document.getElementById('effects-tab');
            tab.classList.toggle('easy-mode');
            const isActive = tab.classList.contains('easy-mode');
            e.target.style.background = isActive ? 'var(--color-accent)' : 'var(--color-bg-surface)';
            e.target.style.color = isActive ? '#000' : 'var(--color-text-primary)';
            View.updateStatus(isActive ? "Easy Mode Enabled" : "Easy Mode Disabled");
        };
        
        const tunerCheck = document.getElementById('tunerEnable');
        if(tunerCheck) {
            tunerCheck.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                const packet = Protocol.createUtilUpdate(2, enabled, 0, 0);
                BLEService.send(packet);
                View.updateStatus(enabled ? "Tuner ON" : "Tuner OFF");
            });
        }
		const bindChange = (id) => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('change', () => this.sendGlobalUpdate());
        };
        
        bindChange('btEnableCheck');  // Enable A2DP/BT
        bindChange('bleEnableCheck'); // Enable BLE

        const bindClick = (id, isFlash, isReset) => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('click', () => this.sendGlobalUpdate(isFlash, isReset));
        };

        bindClick('btnFlashDaisy', true, false);
        bindClick('btnResetDaisy', false, true);
    
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());