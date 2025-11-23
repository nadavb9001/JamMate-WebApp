import { APP_CONFIG } from './config.js';
import { View } from './ui/View.js';
import { Knob } from './ui/Knob.js';
import { BLEService } from './services/BLEService.js';
import { Protocol } from './services/Protocol.js';

// =========================================================
// DEVELOPMENT FLAG: Set to true when done tuning to lock Factory Banks
const PRESETS_LOCKED = false; 
// =========================================================

const app = {
    config: APP_CONFIG,
    currentEffect: null,
    drumPattern: Array(9).fill(null).map(() => Array(16).fill(0)),
    
    // State Data
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

    init() {
        console.log("JamMate v3.0 Controller Starting...");
        
        // 1. Init Data
        this.config.tabs.forEach((_, idx) => {
            this.effectParams[idx] = {};
            this.effectStates[idx] = { enabled: false, selected: false };
        });

        // 2. Init View
        View.init(this);
        
        // 3. BLE Callbacks
        BLEService.onStatusChange = (status) => {
            View.updateConnectionStatus(status);
        };
        
        BLEService.onDataReceived = (dataView) => {
            const cmd = dataView.getUint8(0);
            // 0x31 (Initial State) OR 0x34 (Preset Data)
            if (cmd === 0x31 || cmd === 0x34) {
                console.log(`[BLE] Received Preset Data (Cmd: 0x${cmd.toString(16)})`);
                const blob = dataView.buffer.slice(3);
                this.loadStateFromBlob(blob);
            } 
			// NEW: Tuner Data (0x35)
            if (cmd === 0x35) {
                // Payload is Float32 (Little Endian) starting at byte 3
                const freq = dataView.getFloat32(3, true); // true for Little Endian
                View.updateTuner(freq);
            }
            else {
                console.log(`[BLE] Unknown Cmd: 0x${cmd.toString(16)}, Len: ${dataView.byteLength}`);
            }
        };

        // 4. Setup UI
        this.setupTabs();
        View.setupEffectsGrid(this.config);
        
        View.setupDrumGrid(this.drumPattern, (cell, r, c) => {
            const cur = this.drumPattern[r][c];
            this.drumPattern[r][c] = cur > 0 ? 0 : 127;
            View.updateDrumCell(cell, this.drumPattern[r][c]);
        });

        this.setupStaticKnobs();
        this.setupFileUpload();
        this.setupGlobalListeners();
        this.setupPresetListeners();
    },

    loadStateFromBlob(blob) {
        this.isUpdatingUI = true; 
        console.log("[APP] deserializing state...");

        try {
            const state = Protocol.deserializeState(blob);
            
            // 1. Restore Effects
            Object.keys(state.effectStates).forEach(idx => {
                const i = parseInt(idx);
                this.effectStates[i].enabled = state.effectStates[i].enabled;
                if (state.effectParams[i]) {
                    this.effectParams[i] = { ...this.effectParams[i], ...state.effectParams[i] };
                }
            });

            // 2. Restore EQ
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

            // 3. Update UI
            View.updateEffectButtons(this.effectStates);
            if (this.currentEffect !== null) {
                this.selectEffect(this.currentEffect); 
            }
            
            // 4. Update Globals
            if (document.getElementById('bpmKnob') && document.getElementById('bpmKnob').knob) {
                document.getElementById('bpmKnob').knob.value = state.bpm;
                document.getElementById('bpmKnob').knob.draw();
            }
            if (document.getElementById('masterKnob') && document.getElementById('masterKnob').knob) {
                document.getElementById('masterKnob').knob.value = state.master;
                document.getElementById('masterKnob').knob.draw();
            }
            
            View.updateStatus(`Loaded: ${state.name}`);
            console.log(`[APP] Successfully loaded: ${state.name}`);

        } catch (e) {
            console.error("Load Failed:", e);
            View.updateStatus("Load Failed (Data Error)");
        }
        
        setTimeout(() => { this.isUpdatingUI = false; }, 100);
    },

    getCurrentState() {
        let eqData = [];
        if (this.iirDesigner) {
            eqData = this.iirDesigner.points.map(pt => ({
                freq: pt.freq, gain: pt.gain, q: pt.q
            }));
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
            
            console.log(`[APP] Requesting Bank ${bankIndex} Slot ${slotIndex}`);
            View.updateStatus(`Loading B${bankIndex}:P${slotIndex}...`);
            BLEService.send(Protocol.createLoadReq(bankIndex, slotIndex));
        };

        document.getElementById('presetBank').addEventListener('change', onPresetSelect);
        document.getElementById('presetNum').addEventListener('change', onPresetSelect);

        // UPDATED SAVE LOGIC
        document.getElementById('btnSavePreset').onclick = () => {
            const bankIndex = document.getElementById('presetBank').selectedIndex;
            const slotIndex = document.getElementById('presetNum').selectedIndex;
            
            // Lock Check
            if (PRESETS_LOCKED && bankIndex < 5) {
                View.updateStatus("Factory Banks Locked!");
                return;
            }

            console.log(`[APP] Saving to Bank ${bankIndex} Slot ${slotIndex}`);
            View.updateStatus("Saving...");
            
            const state = this.getCurrentState();
            const packet = Protocol.createSavePreset(bankIndex, slotIndex, state);
            BLEService.send(packet);
        };
    },

    // =========================================================
    // LIVE CONTROL LOGIC
    // =========================================================

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

    selectEffect(idx) {
        this.currentEffect = idx;
        Object.keys(this.effectStates).forEach(i => {
            this.effectStates[i].selected = (parseInt(i) === idx);
        });
        View.updateEffectButtons(this.effectStates);
        
        View.showEffectControls(
            this.config.tabs[idx], idx, this.effectParams[idx], this.effectStates,
            (paramId, value) => { 
                if(this.isUpdatingUI) return;
                this.effectParams[idx][`knob${paramId}`] = value; 
                BLEService.send(Protocol.createParamUpdate(idx, paramId, value)); 
            },
            (paramId, value) => { 
                if(this.isUpdatingUI) return; 
                const offsetId = 10 + paramId; 
                this.effectParams[idx][`dropdown${paramId}`] = value; 
                BLEService.send(Protocol.createParamUpdate(idx, offsetId, value)); 
            },
            (en) => { 
                if(this.isUpdatingUI) return;
                this.effectStates[idx].enabled = en; 
                View.updateEffectButtons(this.effectStates); 
                BLEService.send(Protocol.createToggleUpdate(idx, en)); 
            },
            (bandIdx, enabled, freq, gain, q) => { 
                if(this.isUpdatingUI) return;
                // console.log(`[APP] Sending EQ: Q=${q}`);
                BLEService.send(Protocol.createEQUpdate(bandIdx, enabled, freq, gain, q)); 
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
        createKnob('masterKnob', 'Master Vol', 100, 50, () => {});
        createKnob('bpmKnob', 'BPM', 255, 120, () => {});
        createKnob('blVolKnob', 'BT Vol', 100, 50, () => {});
        createKnob('drumLevelKnob', 'Drum Level', 100, 50, () => {});
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
		document.getElementById('tunerEnable').addEventListener('change', (e) => {
            const enabled = e.target.checked;
            // Send "Tune" command logic via UTIL or TOGGLE?
            // Assuming Tuner is treated as a Utility (like Noise) or special state.
            // Let's reuse the UTIL command (Type 2 for Tuner maybe?)
            // OR create a specific Toggle for Tuner if it's an effect.
            
            // If Tuner is just another effect in your list (Tab 2), selectEffect logic handles it.
            // BUT if it's a global mode, we send a special packet.
            
            // Protocol v3 doesn't have explicit Tuner cmd, but we can use SET_UTIL (0x23) with Type 2.
            // Packet: [0x23][Len][Type=2][En][0][0]
             const packet = Protocol.createUtilUpdate(2, enabled, 0, 0);
             BLEService.send(packet);
             
             if(enabled) View.updateStatus("Tuner ON");
             else View.updateStatus("Tuner OFF");
        });

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
            cont.innerHTML = `
                <div class="solo-effect-title">${name}</div>
                <button class="solo-effect-close-btn" onclick="window.closeSoloEffect()">X</button>
            `;
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
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());