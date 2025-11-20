import { APP_CONFIG } from './config.js';
import { View } from './ui/View.js';
import { Knob } from './ui/Knob.js';
import { BLEService } from './services/BLEService.js';
import { Protocol } from './services/Protocol.js';

const app = {
    config: APP_CONFIG,
    currentEffect: null,
    drumPattern: Array(9).fill(null).map(() => Array(16).fill(0)),
    effectStates: {},
    effectParams: {},
    audioData: null,
    sampleRate: null,
    iirDesigner: null, 

    init() {
        console.log("JamMate Visual Controller Starting...");
        
        // Init Data
        this.config.tabs.forEach((_, idx) => {
            this.effectParams[idx] = {};
            this.effectStates[idx] = { enabled: false, selected: false };
        });

        // Init View
        View.init(this);
        
        // BLE Callbacks
        BLEService.onStatusChange = (status) => {
            View.updateConnectionStatus(status);
        };
        BLEService.onDataReceived = (dataView) => {
            console.log("[BLE RX] Bytes:", dataView.byteLength);
            // TODO: Handle incoming state (0x31)
        };

        // Setup UI Components
        this.setupTabs();
        View.setupEffectsGrid(this.config);
        
        View.setupDrumGrid(this.drumPattern, (cell, r, c) => {
            const cur = this.drumPattern[r][c];
            this.drumPattern[r][c] = cur > 0 ? 0 : 127;
            View.updateDrumCell(cell, this.drumPattern[r][c]);
        });

        this.setupStaticKnobs(); // <--- This was missing in previous partial snippet
        this.setupFileUpload();
        this.setupGlobalListeners();
    },

    // =========================================================
    // LOGIC & ACTIONS
    // =========================================================

    selectEffect(idx) {
        this.currentEffect = idx;
        Object.keys(this.effectStates).forEach(i => {
            this.effectStates[i].selected = (parseInt(i) === idx);
        });
        View.updateEffectButtons(this.effectStates);
        
        // Pass Callbacks to View for Protocol v3
        View.showEffectControls(
            this.config.tabs[idx], 
            idx, 
            this.effectParams[idx], 
            this.effectStates,
            
            // 1. On Knob Change
            (paramId, value) => {
                this.effectParams[idx][`knob${paramId}`] = value;
                const packet = Protocol.createParamUpdate(idx, paramId, value);
                BLEService.send(packet);
            },

            // 2. On Dropdown Change
            (paramId, value) => {
                const offsetId = 10 + paramId; // Dropdowns start at 10
                this.effectParams[idx][`dropdown${paramId}`] = value;
                const packet = Protocol.createParamUpdate(idx, offsetId, value);
                BLEService.send(packet);
            },

            // 3. On Toggle
            (enabled) => {
                this.effectStates[idx].enabled = enabled;
                View.updateEffectButtons(this.effectStates);
                const packet = Protocol.createToggleUpdate(idx, enabled);
                BLEService.send(packet);
            },

            // 4. On EQ Change
            (bandIdx, freq, gain, q) => {
                console.log(`[APP] EQ Change -> Band: ${bandIdx}, F: ${freq}, G: ${gain}, Q: ${q}`);
                const packet = Protocol.createEQUpdate(bandIdx, freq, gain, q);
                BLEService.send(packet);
            }
        );
    },

    toggleEffectEnabled(idx) {
        const newState = !this.effectStates[idx].enabled;
        this.effectStates[idx].enabled = newState;
        View.updateEffectButtons(this.effectStates);
        
        const packet = Protocol.createToggleUpdate(idx, newState);
        BLEService.send(packet);
    },

    // =========================================================
    // SETUP HELPERS
    // =========================================================

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
        const createKnob = (id, name, max=100) => {
            const el = document.getElementById(id);
            if(el) {
                new Knob(el, 0, max, (max===255?120:0), (val) => View.updateStatus(`${name}: ${Math.round(val)}`));
            }
        };

        createKnob('whiteNoiseLevelKnob', 'White Noise');
        createKnob('toneLevelKnob', 'Tone Level');
        createKnob('masterKnob', 'Master Vol');
        createKnob('bpmKnob', 'BPM', 255);
        createKnob('blVolKnob', 'BT Vol');
        createKnob('drumLevelKnob', 'Drum Level');
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
            View.drawWaveform(this.audioData, 'waveformCanvas');
            View.drawSpectrum(this.audioData, this.sampleRate, 'spectrumCanvas');
            document.getElementById('btnSendIR').disabled = false;
        });
        const irPointsSelect = document.getElementById('irPoints');
        if(irPointsSelect) {
            irPointsSelect.addEventListener('change', () => {
                if(this.audioData) View.drawSpectrum(this.audioData, this.sampleRate, 'spectrumCanvas');
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
        
        document.getElementById('btnSavePreset').onclick = () => {
            View.updateStatus('Preset Saved! (Simulation)');
        };
        
        document.getElementById('btnConnect').onclick = () => {
            if(BLEService.isConnected) {
                BLEService.disconnect();
            } else {
                BLEService.connect();
            }
        };

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