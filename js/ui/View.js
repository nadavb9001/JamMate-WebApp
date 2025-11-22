import { Knob } from './Knob.js';
import { IIRDesigner } from './IIRDesigner.js';

export const View = {
    init(app) {
        this.app = app;
        this.statusEl = document.getElementById('statusMessage');
        this.ledEl = document.getElementById('statusLed'); 
        this.statusTimer = null; 
    },

    // =========================================================
    // HUD & STATUS
    // =========================================================

    updateStatus(text) {
        if(this.statusEl) {
            this.statusEl.textContent = text;
            this.statusEl.style.opacity = '1'; 
            if (this.statusTimer) clearTimeout(this.statusTimer);
            this.statusTimer = setTimeout(() => { this.statusEl.style.opacity = '0'; }, 1500);
        }
    },

    updateConnectionStatus(status) {
        if (!this.ledEl) this.ledEl = document.getElementById('statusLed');
        if (!this.ledEl) return;
        this.ledEl.classList.remove('connected', 'connecting', 'error');
        switch (status) {
            case 'connected': this.ledEl.classList.add('connected'); this.updateStatus("Connected to JamMate"); break;
            case 'connecting': this.ledEl.classList.add('connecting'); this.updateStatus("Connecting..."); break;
            case 'disconnected': this.updateStatus("Disconnected"); break;
            case 'error': this.ledEl.classList.add('error'); this.updateStatus("Connection Error"); break;
        }
    },

    setButtonActive(id, isActive) {
        const btn = document.getElementById(id);
        if (btn) {
            if (isActive) {
                btn.classList.add('active');
                btn.style.borderColor = 'var(--color-enabled)';
                btn.style.boxShadow = '0 0 10px rgba(0, 255, 0, 0.4)';
            } else {
                btn.classList.remove('active');
                btn.style.borderColor = 'var(--color-border)';
                btn.style.boxShadow = 'none';
            }
        }
    },

    // =========================================================
    // EFFECTS GRID
    // =========================================================

    setupEffectsGrid(config) {
        const grid = document.getElementById('effectsGrid');
        grid.innerHTML = ''; 
        config.tabs.forEach((effect, idx) => {
            const btn = document.createElement('div');
            btn.className = 'effect-btn';
            btn.dataset.index = idx;
            btn.textContent = effect.title;
            let clickTimeout = null;
            let clickCount = 0;
            btn.addEventListener('click', () => {
                const tab = document.getElementById('effects-tab');
                const isEasyMode = tab.classList.contains('easy-mode');
                if(window.soloEffectOpen) { window.closeSoloEffect(); return; }
                clickCount++;
                if (clickCount === 1) {
                    clickTimeout = setTimeout(() => {
                        this.app.selectEffect(idx);
                        if(isEasyMode) window.showSoloEffect(effect.title, idx);
                        clickCount = 0;
                    }, 250);
                } else if (clickCount === 2) {
                    clearTimeout(clickTimeout);
                    this.app.toggleEffectEnabled(idx);
                    clickCount = 0;
                }
            });
            grid.appendChild(btn);
        });
    },

    updateEffectButtons(effectStates) {
        document.querySelectorAll('.effect-btn').forEach((btn, i) => {
            const state = effectStates[i];
            if (state) {
                if (state.selected) btn.classList.add('selected'); else btn.classList.remove('selected');
                if (state.enabled) btn.classList.add('enabled'); else btn.classList.remove('enabled');
                
                // Also update styles for the combined class if needed by CSS specificity
                if (state.selected && state.enabled) btn.classList.add('enabled', 'selected');
            }
        });
    },

    // =========================================================
    // CONTROLS GENERATION
    // =========================================================

    showEffectControls(effect, idx, effectParams, effectStates, onKnobChange, onDropChange, onToggle, onEQChange) {
        const controls = document.getElementById('effectControls');
        
        // 1. Equalizer Special Case
        if (effect.title === 'Equalizer') {
            controls.innerHTML = `
            <div class="iir-designer">
                <div class="effect-title">IIR Parametric Equalizer - 12 Bands</div>
                <canvas class="iir-canvas" id="iirCanvas"></canvas>
                <div class="iir-controls">
                    <div class="iir-controls-row">
                        <div class="knob-container"><div class="knob" id="eqLevelKnob"></div><div class="knob-label">Level</div></div>
                        <div class="knob-container"><div class="knob" id="eqQKnob"></div><div class="knob-label">Q Factor</div></div>
                        <select class="biquad-dropdown" id="biquadCount">
                            <option value="0">LPF/HPF Only</option><option value="1">1 Biquad</option><option value="2">2 Biquads</option>
                            <option value="3">3 Biquads</option><option value="4">4 Biquads</option><option value="5">5 Biquads</option>
                            <option value="6">6 Biquads</option><option value="7">7 Biquads</option><option value="8">8 Biquads</option>
                            <option value="9">9 Biquads</option><option value="10" selected>10 Biquads</option>
                        </select>
                        <button class="btn-reset-small" onclick="document.dispatchEvent(new CustomEvent('eq-reset'))">RESET</button>
                    </div>
                </div>
            </div>`;
            
            // Level Knob
            const savedLevel = effectParams[`knob0`] !== undefined ? effectParams[`knob0`] : 50;
            const levelKnob = new Knob(document.getElementById('eqLevelKnob'), 0, 100, savedLevel, (val) => this.updateStatus(`Level: ${Math.round(val)}`));
            levelKnob.onrelease = () => { if(onKnobChange) onKnobChange(0, levelKnob.value); };

            // Q Knob
            const qKnob = new Knob(document.getElementById('eqQKnob'), 0.1, 10, 1.41, (val) => this.updateStatus(`Q Factor: ${val.toFixed(2)}`));
            
            // IIR Designer
            this.app.iirDesigner = new IIRDesigner(document.getElementById('iirCanvas'), qKnob, 
                (txt) => this.updateStatus(txt),
                (i, f, g, q) => { if(onEQChange) onEQChange(i, f, g, q); }
            );
            
            document.addEventListener('eq-reset', () => this.app.iirDesigner.reset(), { once: true });
            document.getElementById('biquadCount').addEventListener('change', (e) => { this.app.iirDesigner.setBiquadCount(parseInt(e.target.value)); });
            return;
        }

        // 2. Generic Controls
        controls.innerHTML = `
            <div class="effect-controls">
                <div class="effect-title">${effect.title}</div>
                <div class="dropdowns-grid" id="generatedDropdowns"></div>
                <div class="knobs-grid" id="generatedKnobs"></div>
            </div>
        `;

        // Dropdowns
        const dropdownContainer = document.getElementById('generatedDropdowns');
        const dropdownNames = effect.params.dropdowns || [];
        dropdownNames.forEach((name, dIndex) => {
            const wrapper = document.createElement('div');
            const label = document.createElement('label');
            label.className = 'control-label';
            label.textContent = name.replace(/_/g, ' ');
            const select = document.createElement('select');
            const options = this.app.config.dropdowns[name] || [];
            options.forEach((optText, optIdx) => {
                const option = document.createElement('option');
                option.text = optText; option.value = optIdx;
                select.add(option);
            });
            select.selectedIndex = effectParams[`dropdown${dIndex}`] || 0;
            
            select.addEventListener('change', () => { 
                this.updateStatus(`${name.replace(/_/g, ' ')}: ${options[select.selectedIndex]}`);
                if(onDropChange) onDropChange(dIndex, select.selectedIndex);
            });
            wrapper.appendChild(label); wrapper.appendChild(select);
            dropdownContainer.appendChild(wrapper);
        });

        // Knobs
        const knobContainer = document.getElementById('generatedKnobs');
        const knobLabels = effect.params.knobs || [];
        knobLabels.forEach((label, kIndex) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'knob-container';
            const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
            wrapper.innerHTML = `<div class="knob" id="effectKnob${kIndex}"></div><div class="knob-label">${displayLabel}</div>`;
            knobContainer.appendChild(wrapper);

            const savedVal = effectParams[`knob${kIndex}`] !== undefined ? effectParams[`knob${kIndex}`] : 50;
            
            const knob = new Knob(
                document.getElementById(`effectKnob${kIndex}`), 0, 100, savedVal,
                (val) => this.updateStatus(`${displayLabel}: ${Math.round(val)}`)
            );
            
            knob.onrelease = () => { 
                if(onKnobChange) onKnobChange(kIndex, knob.value);
            };
        });
    },

    // =========================================================
    // VISUALIZERS (Drum, Waveform, Spectrum)
    // =========================================================

    setupDrumGrid(drumPattern, updateCallback) {
        const grid = document.getElementById('drumGrid');
        grid.innerHTML = ''; 
        const parts = ["Kick", "Snare", "HiHat", "Cymbal", "Tom1", "Tom2", "Tom3", "Perc1", "Perc2"];
        parts.forEach((part, row) => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'drum-row';
            const label = document.createElement('div');
            label.className = 'drum-label'; label.textContent = part;
            rowDiv.appendChild(label);
            for (let col = 0; col < 16; col++) {
                const cell = document.createElement('div');
                cell.className = 'drum-cell';
                cell.dataset.row = row; cell.dataset.col = col;
                cell.addEventListener('click', () => updateCallback(cell, row, col));
                rowDiv.appendChild(cell);
            }
            grid.appendChild(rowDiv);
        });
    },

    updateDrumCell(cell, velocity) {
        if (velocity > 0) {
            cell.classList.add('active');
            let bar = cell.querySelector('.velocity-bar');
            if (!bar) { bar = document.createElement('div'); bar.className = 'velocity-bar'; cell.appendChild(bar); }
            bar.style.height = (velocity / 127 * 100) + '%';
        } else {
            cell.classList.remove('active');
            const bar = cell.querySelector('.velocity-bar');
            if (bar) bar.remove();
        }
    },
    
    drawWaveform(audioData, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = canvas.offsetHeight;
        ctx.fillStyle = '#333'; ctx.fillRect(0, 0, width, height);
        if (!audioData) return;
        const step = Math.ceil(audioData.length / width);
        const amp = height / 2;
        ctx.strokeStyle = '#00b0b0'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < width; i++) {
            const slice = audioData.slice(i * step, (i + 1) * step);
            const min = slice.reduce((a, b) => Math.min(a, b), 1);
            const max = slice.reduce((a, b) => Math.max(a, b), -1);
            ctx.moveTo(i, (1 + min) * amp); ctx.lineTo(i, (1 + max) * amp);
        }
        ctx.stroke();
    },

    drawSpectrum(audioData, sampleRate, canvasId, cachedFullFFT = null) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = canvas.offsetHeight;
        
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        if (!audioData || !sampleRate) return;
        
        const fft = cachedFullFFT || this.computeFFT(audioData.slice(0, 2048));
        
        const maxMag = Math.max(...fft);
        const maxDb = 20 * Math.log10(maxMag + 1e-10);
        const minDb = maxDb - 80;
        const minFreq = 20;
        const maxFreq = Math.min(20000, sampleRate / 2);
        
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(freq => {
            if (freq <= maxFreq) {
                const t = Math.log10(freq / minFreq) / Math.log10(maxFreq / minFreq);
                const x = t * width;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
                ctx.fillStyle = '#888'; ctx.font = '11px monospace';
                if ([20, 100, 1000, 10000].includes(freq)) {
                    const label = freq >= 1000 ? `${freq/1000}k` : `${freq}`;
                    ctx.fillText(label, x - 15, height - 5);
                }
            }
        });
        
        ctx.strokeStyle = '#0a0'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i < width; i++) {
            const t = i / width;
            const freq = minFreq * Math.pow(maxFreq / minFreq, t);
            const bin = Math.floor(freq / (sampleRate/2) * fft.length);
            if (bin < fft.length) {
                const db = 20 * Math.log10(fft[bin] + 1e-10);
                const dbNorm = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
                const y = height - (dbNorm * height);
                if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
            }
        }
        ctx.stroke();

        const irPointsSelect = document.getElementById('irPoints');
        const selectedPoints = irPointsSelect ? parseInt(irPointsSelect.value) : 512;
        if (selectedPoints <= fft.length) {
            ctx.strokeStyle = '#0ff'; ctx.lineWidth = 2; ctx.beginPath();
            const truncatedAudio = audioData.slice(0, selectedPoints);
            const overlayFFT = this.computeFFT(truncatedAudio);
            
            for (let i = 0; i < width; i++) {
                const t = i / width;
                const freq = minFreq * Math.pow(maxFreq / minFreq, t);
                const bin = Math.floor(freq / (sampleRate/2) * overlayFFT.length);
                
                if (bin < overlayFFT.length) {
                    const db = 20 * Math.log10(overlayFFT[bin] + 1e-10);
                    const dbNorm = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
                    const y = height - (dbNorm * height);
                    if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
                }
            }
            ctx.stroke();
            ctx.fillStyle = '#0a0'; ctx.fillRect(width - 120, 10, 15, 10);
            ctx.fillStyle = '#888'; ctx.fillText('Full FFT', width - 100, 20);
            ctx.fillStyle = '#0ff'; ctx.fillRect(width - 120, 25, 15, 10);
            ctx.fillStyle = '#888'; ctx.fillText(`${selectedPoints} pts`, width - 100, 35);
        }
    },

    computeFFT(data) {
        const maxInput = 4096;
        let inputData = data;
        if (data.length > maxInput) {
            const step = Math.floor(data.length / maxInput);
            inputData = new Float32Array(maxInput);
            for(let i=0; i<maxInput; i++) inputData[i] = data[i*step];
        }
        const N = inputData.length;
        const magnitude = new Array(Math.floor(N / 2)).fill(0);
        for (let k = 0; k < N / 2; k++) {
            let real = 0, imag = 0;
            for (let n = 0; n < N; n++) {
                const angle = -2 * Math.PI * k * n / N;
                real += inputData[n] * Math.cos(angle);
                imag += inputData[n] * Math.sin(angle);
            }
            magnitude[k] = Math.sqrt(real * real + imag * imag) / N;
        }
        return magnitude;
    }
};