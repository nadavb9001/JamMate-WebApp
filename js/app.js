import { APP_CONFIG } from './config.js';
import { View } from './ui/View.js';
import { Knob } from './ui/Knob.js';

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
        
        this.config.tabs.forEach((_, idx) => {
            this.effectParams[idx] = {};
            this.effectStates[idx] = { enabled: false, selected: false };
        });

        View.init(this);
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

    selectEffect(idx) {
        this.currentEffect = idx;
        Object.keys(this.effectStates).forEach(i => {
            this.effectStates[i].selected = (parseInt(i) === idx);
        });
        View.updateEffectButtons(this.effectStates);
        View.showEffectControls(this.config.tabs[idx], idx, this.effectParams[idx], this.effectStates);
    },

    toggleEffectEnabled(idx) {
        this.effectStates[idx].enabled = !this.effectStates[idx].enabled;
        View.updateEffectButtons(this.effectStates);
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

        window.soloEffectOpen = false;
        window.showSoloEffect = function(name, idx) {
            window.soloEffectOpen = true;
            const overlay = document.createElement('div'); overlay.className = 'solo-effect-overlay';
            const cont = document.createElement('div'); cont.className = 'solo-effect-container';
            
            // RESTORED: Popup Title (CSS will hide duplicate inner title)
            cont.innerHTML = `
                <div class="solo-effect-title">${name}</div>
                <button class="solo-effect-close-btn" onclick="window.closeSoloEffect()">X</button>
            `;
            
            overlay.appendChild(cont); document.body.appendChild(overlay);
            
            const controls = document.getElementById('effectControls');
            cont.appendChild(controls);
            
            if(app.iirDesigner) {
                requestAnimationFrame(() => app.iirDesigner.draw());
            }
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
            e.target.style.background = tab.classList.contains('easy-mode') ? 'var(--color-accent)' : 'var(--color-bg-surface)';
        };
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());