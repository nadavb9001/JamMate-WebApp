import { Knob }        from './Knob.js';
import { IIRDesigner } from './IIRDesigner.js';

export const View = {
    init(app) {
        this.app         = app;
        this.statusEl    = document.getElementById('statusMessage');
        this.ledEl       = document.getElementById('statusLed');
        this.statusTimer = null;
    },

    // =========================================================
    // HUD & STATUS
    // =========================================================

    updateStatus(text) {
        if (this.statusEl) {
            this.statusEl.textContent   = text;
            this.statusEl.style.opacity = '1';
            if (this.statusTimer) clearTimeout(this.statusTimer);
            this.statusTimer = setTimeout(() => {
                this.statusEl.style.opacity = '0';
            }, 1500);
        }
    },

    updateConnectionStatus(status) {
        if (!this.ledEl) this.ledEl = document.getElementById('statusLed');
        if (!this.ledEl) return;
        this.ledEl.classList.remove('connected', 'connecting', 'error');
        switch (status) {
            case 'connected':
                this.ledEl.classList.add('connected');
                this.updateStatus('Connected to JamMate');
                break;
            case 'connecting':
                this.ledEl.classList.add('connecting');
                this.updateStatus('Connecting...');
                break;
            case 'disconnected':
                this.updateStatus('Disconnected');
                break;
            case 'error':
                this.ledEl.classList.add('error');
                this.updateStatus('Connection Error');
                break;
        }
    },

    setButtonActive(id, isActive) {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (isActive) {
            btn.classList.add('active');
            btn.style.borderColor = 'var(--color-enabled)';
            btn.style.boxShadow   = '0 0 10px rgba(0,255,0,0.4)';
        } else {
            btn.classList.remove('active');
            btn.style.borderColor = 'var(--color-border)';
            btn.style.boxShadow   = 'none';
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
            btn.className        = 'effect-btn';
            btn.dataset.index    = idx;
            btn.dataset.effectId = idx;
            btn.draggable        = true;
            btn.textContent      = effect.title;

            // Single click = select (+ open solo panel in easy mode)
            // Double click = toggle enable/disable
            let clickTimeout = null;
            let clickCount   = 0;
            btn.addEventListener('click', () => {
                const isEasyMode = document.getElementById('effects-tab')
                                    .classList.contains('easy-mode');

                // FIX: close the overlay but do NOT return — fall through
                // to select the newly clicked effect and reopen its panel.
                // The old code had `return` here, which meant clicking a
                // different effect while a panel was open would close it
                // but never open the new one (required a second click).
                if (window.soloEffectOpen) window.closeSoloEffect();

                clickCount++;
                if (clickCount === 1) {
                    clickTimeout = setTimeout(() => {
                        this.app.selectEffect(idx);
                        if (isEasyMode) window.showSoloEffect(effect.title, idx);
                        clickCount = 0;
                    }, 250);
                } else if (clickCount >= 2) {
                    clearTimeout(clickTimeout);
                    this.app.toggleEffectEnabled(idx);
                    clickCount = 0;
                }
            });

            // Drag & drop reorder
            btn.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('effectIndex', idx);
                btn.classList.add('dragging');
            });
            btn.addEventListener('dragend', () => {
                btn.classList.remove('dragging');
                document.querySelectorAll('.effect-btn')
                        .forEach(b => b.classList.remove('drag-over'));
            });
            btn.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                btn.classList.add('drag-over');
            });
            btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
            btn.addEventListener('drop', (e) => {
                e.preventDefault(); e.stopPropagation();
                const src = parseInt(e.dataTransfer.getData('effectIndex'));
                if (src !== idx) this.app.reorderEffects(src, idx);
                btn.classList.remove('drag-over');
            });

            grid.appendChild(btn);
        });
    },

    updateEffectButtons(effectStates) {
        document.querySelectorAll('.effect-btn').forEach((btn, i) => {
            const s = effectStates[i];
            if (!s) return;
            btn.classList.toggle('selected', !!s.selected);
            btn.classList.toggle('enabled',  !!s.enabled);
        });
    },

    // =========================================================
    // CONTROLS GENERATION
    //
    // showEffectControls(effect, idx, effectParams, effectStates, onParam, onEQChange)
    //
    // onParam(flatIdx, value)  — single callback for ALL controls
    //   flatIdx 0      → checkbox (enable)     value: 0 | 1
    //   flatIdx 1..K   → knob[flatIdx-1]       value: 0-255
    //   flatIdx K+1..  → dropdown[flatIdx-1-K] value: option index
    //
    // effectParams keys read back:
    //   'knob0'..'knobN'         saved knob positions
    //   'dropdown0'..'dropdownN' saved dropdown selections
    //
    // onEQChange(bandIdx, enabled, freq, gain, q) — EQ bands only
    // =========================================================

    showEffectControls(effect, idx, effectParams, effectStates, onParam, onEQChange) {
        const controls = document.getElementById('effectControls');

        // ── 1. Equalizer special case ─────────────────────────────
        if (effect.title === 'Equalizer') {
            controls.innerHTML = `
            <div class="iir-designer">
                <div class="effect-title">IIR Parametric Equalizer - 12 Bands</div>
                <canvas class="iir-canvas" id="iirCanvas"></canvas>
                <div class="iir-controls">
                    <div class="iir-controls-row">
                        <div class="knob-container">
                            <div class="knob" id="eqLevelKnob"></div>
                            <div class="knob-label">Level</div>
                        </div>
                        <div class="knob-container">
                            <div class="knob" id="eqQKnob"></div>
                            <div class="knob-label">Q Factor</div>
                        </div>
                        <div style="display:flex; flex-direction:column;">
                            <label class="control-label">Active Bands</label>
                            <select class="biquad-dropdown" id="biquadCount">
                                <option value="0">2 (HPF/LPF)</option>
                                <option value="1">3 Bands</option>
                                <option value="2">4 Bands</option>
                                <option value="3">5 Bands</option>
                                <option value="4">6 Bands</option>
                                <option value="5">7 Bands</option>
                                <option value="6">8 Bands</option>
                                <option value="7">9 Bands</option>
                                <option value="8">10 Bands</option>
                                <option value="9">11 Bands</option>
                                <option value="10" selected>12 (Max)</option>
                            </select>
                        </div>
                        <button class="btn-reset-small" id="btnEqReset">RESET</button>
                    </div>
                </div>
            </div>`;

            const savedLevel = effectParams['knob0'] !== undefined ? effectParams['knob0'] : 50;
            const levelKnob  = new Knob(
                document.getElementById('eqLevelKnob'), 0, 100, savedLevel,
                (v) => this.updateStatus(`Level: ${Math.round(v)}`)
            );
            levelKnob.onrelease = () => { if (onParam) onParam(1, levelKnob.value); };

            const qKnob = new Knob(
                document.getElementById('eqQKnob'), 0.1, 10, 1.41,
                (v) => this.updateStatus(`Q Factor: ${v.toFixed(2)}`)
            );

            this.app.iirDesigner = new IIRDesigner(
                document.getElementById('iirCanvas'),
                qKnob,
                (txt) => this.updateStatus(txt),
                (bandIdx, en, f, g, q) => { if (onEQChange) onEQChange(bandIdx, en, f, g, q); }
            );

            if (this.app.currentEQPoints && this.app.currentEQPoints.length === 12) {
                this.app.iirDesigner.loadPoints(this.app.currentEQPoints);
            } else {
                this.app.iirDesigner.reset();
            }

            document.getElementById('btnEqReset').addEventListener('click', () => {
                this.app.iirDesigner.reset();
                document.getElementById('biquadCount').value = '10';
                this.updateStatus('EQ Reset to Default');
            });
            document.getElementById('biquadCount').addEventListener('change', (e) => {
                this.app.iirDesigner.setBiquadCount(parseInt(e.target.value));
            });

            this.app.iirDesigner.draw();
            return;
        }

        // ── 2. Generic effect controls ────────────────────────────
        const K = (effect.params.knobs || []).length;

        controls.innerHTML = `
            <div class="effect-controls">
                <div class="effect-title">${effect.title}</div>
                <label class="checkbox" id="effectEnableRow">
                    <input type="checkbox" id="effectEnableInput">
                    <span>${effect.params.checkbox || 'Enable'}</span>
                </label>
                <div class="dropdowns-grid" id="generatedDropdowns"></div>
                <div class="knobs-grid"     id="generatedKnobs"></div>
            </div>`;

        // ── Enable checkbox — flat index 0 ───────────────────────
        const enableInput  = document.getElementById('effectEnableInput');
        const currentState = effectStates[idx];
        enableInput.checked = !!(currentState && currentState.enabled);
        enableInput.addEventListener('change', () => {
            if (onParam) onParam(0, enableInput.checked ? 1 : 0);
        });

        // ── Dropdowns — flat index K+1 … K+D ────────────────────
        const dropdownContainer = document.getElementById('generatedDropdowns');
        (effect.params.dropdowns || []).forEach((name, dIndex) => {
            const wrapper = document.createElement('div');

            const lbl       = document.createElement('label');
            lbl.className   = 'control-label';
            lbl.textContent = name.replace(/_/g, ' ');

            const select  = document.createElement('select');
            const options = this.app.config.dropdowns[name] || [];
            options.forEach((text, oi) => {
                const opt = document.createElement('option');
                opt.text  = text;
                opt.value = oi;
                select.add(opt);
            });
            select.selectedIndex = effectParams[`dropdown${dIndex}`] || 0;

            select.addEventListener('change', () => {
                this.updateStatus(`${name.replace(/_/g, ' ')}: ${options[select.selectedIndex]}`);
                if (onParam) onParam(1 + K + dIndex, select.selectedIndex);
            });

            wrapper.appendChild(lbl);
            wrapper.appendChild(select);
            dropdownContainer.appendChild(wrapper);
        });

        // ── Knobs — flat index 1 … K ─────────────────────────────
        const knobContainer = document.getElementById('generatedKnobs');
        (effect.params.knobs || []).forEach((labelStr, kIndex) => {
            const wrapper     = document.createElement('div');
            wrapper.className = 'knob-container';
            const display     = labelStr.charAt(0).toUpperCase() + labelStr.slice(1);
            wrapper.innerHTML = `<div class="knob" id="effectKnob${kIndex}"></div>
                                 <div class="knob-label">${display}</div>`;
            knobContainer.appendChild(wrapper);

            const savedVal = effectParams[`knob${kIndex}`] !== undefined
                ? effectParams[`knob${kIndex}`] : 50;

            const knob = new Knob(
                document.getElementById(`effectKnob${kIndex}`),
                0, 100, savedVal,
                (v) => this.updateStatus(`${display}: ${Math.round(v)}`)
            );
            knob.onrelease = () => { if (onParam) onParam(1 + kIndex, knob.value); };
        });
    },

    // =========================================================
    // DRUM GRID
    //
    // Left-click / tap  — cycles velocity: 0 → 42 → 85 → 127 → 0
    // Right-click       — clears cell (velocity = 0)
    // Mouse/touch drag  — paints all cells with velocity from start
    //
    // updateCallback(cell, row, col, newVelocity) called on each change.
    // Pattern array is owned by app.js; View is purely presentational.
    // =========================================================

    setupDrumGrid(drumPattern, updateCallback) {
        const grid = document.getElementById('drumGrid');
        grid.innerHTML = '';

        const VELOCITY_STEPS = [0, 42, 85, 127];
        const parts = ['Kick','Snare','HiHat','Cymbal','Tom1','Tom2','Tom3','Perc1','Perc2'];

        const nextVelocity = (current) => {
            const i = VELOCITY_STEPS.indexOf(current < 0 ? 0 : current);
            return VELOCITY_STEPS[(i < 0 ? 0 : i + 1) % VELOCITY_STEPS.length];
        };

        let dragVelocity = null;
        let lastDragCell = null;
        let didDrag      = false;

        parts.forEach((part, row) => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'drum-row';

            const label       = document.createElement('div');
            label.className   = 'drum-label';
            label.textContent = part;
            rowDiv.appendChild(label);

            for (let col = 0; col < 16; col++) {
                const cell       = document.createElement('div');
                cell.className   = 'drum-cell';
                cell.dataset.row = row;
                cell.dataset.col = col;

                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    didDrag = false;
                    if (e.button === 2) {
                        updateCallback(cell, row, col, 0);
                        dragVelocity = 0;
                    } else {
                        const vel = nextVelocity(drumPattern[row][col]);
                        updateCallback(cell, row, col, vel);
                        dragVelocity = vel;
                    }
                    lastDragCell = cell;
                });

                cell.addEventListener('mouseenter', () => {
                    if (dragVelocity === null || cell === lastDragCell) return;
                    didDrag      = true;
                    lastDragCell = cell;
                    updateCallback(cell, row, col, dragVelocity);
                });

                cell.addEventListener('contextmenu', (e) => e.preventDefault());
                rowDiv.appendChild(cell);
            }
            grid.appendChild(rowDiv);
        });

        document.addEventListener('mouseup', () => {
            dragVelocity = null;
            lastDragCell = null;
            didDrag      = false;
        });

        // ── Touch ────────────────────────────────────────────────
        let touchStartCell = null;
        let touchStartRow  = null;
        let touchStartCol  = null;
        let touchDragVel   = null;
        let touchDidDrag   = false;

        grid.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t  = e.touches[0];
            const el = document.elementFromPoint(t.clientX, t.clientY);
            if (!el || !el.classList.contains('drum-cell')) return;
            touchStartCell = el;
            touchStartRow  = parseInt(el.dataset.row);
            touchStartCol  = parseInt(el.dataset.col);
            touchDragVel   = nextVelocity(drumPattern[touchStartRow][touchStartCol]);
            touchDidDrag   = false;
            lastDragCell   = el;
        }, { passive: false });

        grid.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (touchDragVel === null) return;
            const t  = e.touches[0];
            const el = document.elementFromPoint(t.clientX, t.clientY);
            if (!el || !el.classList.contains('drum-cell') || el === lastDragCell) return;
            if (!touchDidDrag) {
                touchDidDrag = true;
                updateCallback(touchStartCell, touchStartRow, touchStartCol, touchDragVel);
            }
            lastDragCell = el;
            updateCallback(el, parseInt(el.dataset.row), parseInt(el.dataset.col), touchDragVel);
        }, { passive: false });

        grid.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (!touchDidDrag && touchStartCell !== null) {
                updateCallback(touchStartCell, touchStartRow, touchStartCol, touchDragVel);
            }
            touchStartCell = null;
            touchStartRow  = null;
            touchStartCol  = null;
            touchDragVel   = null;
            touchDidDrag   = false;
            lastDragCell   = null;
        }, { passive: false });
    },

    updateDrumCell(cell, velocity) {
        cell.classList.remove('active', 'vel-low', 'vel-med', 'vel-high');
        const bar = cell.querySelector('.velocity-bar');
        if (bar) bar.remove();
        if (velocity <= 0) return;

        cell.classList.add('active');
        if (velocity <= 42)      cell.classList.add('vel-low');
        else if (velocity <= 85) cell.classList.add('vel-med');
        else                     cell.classList.add('vel-high');

        const newBar     = document.createElement('div');
        newBar.className = 'velocity-bar';
        newBar.style.height = Math.round(velocity / 127 * 100) + '%';
        cell.appendChild(newBar);
    },

    // =========================================================
    // WAVEFORM / SPECTRUM
    // =========================================================

    drawWaveform(audioData, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx    = canvas.getContext('2d');
        const width  = canvas.width  = canvas.offsetWidth;
        const height = canvas.height = canvas.offsetHeight;
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, width, height);
        if (!audioData) return;
        const step = Math.ceil(audioData.length / width);
        const amp  = height / 2;
        ctx.strokeStyle = '#00b0b0'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < width; i++) {
            const slice = audioData.slice(i * step, (i + 1) * step);
            const min   = slice.reduce((a, b) => Math.min(a, b),  1);
            const max   = slice.reduce((a, b) => Math.max(a, b), -1);
            ctx.moveTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        ctx.stroke();
    },

    drawSpectrum(audioData, sampleRate, canvasId, cachedFullFFT = null) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx    = canvas.getContext('2d');
        const width  = canvas.width  = canvas.offsetWidth;
        const height = canvas.height = canvas.offsetHeight;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        if (!audioData || !sampleRate) return;

        const fft         = cachedFullFFT || this.computeFFT(audioData.slice(0, 2048));
        const fullFFTSize = fft.length * 2;
        const maxMag      = Math.max(...fft);
        const maxDb       = 20 * Math.log10(maxMag + 1e-10);
        const minDb       = maxDb - 80;
        const minFreq     = 20;
        const maxFreq     = Math.min(20000, sampleRate / 2);

        const getSmoothMag = (frequency, fftData) => {
            const binFloat = (frequency / (sampleRate / 2)) * fftData.length;
            const i        = Math.floor(binFloat);
            const frac     = binFloat - i;
            if (i >= fftData.length - 1) return fftData[fftData.length - 1] || 0;
            if (i < 0)                   return fftData[0] || 0;
            return fftData[i] * (1 - frac) + fftData[i + 1] * frac;
        };

        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(freq => {
            if (freq > maxFreq) return;
            const t = Math.log10(freq / minFreq) / Math.log10(maxFreq / minFreq);
            const x = t * width;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
            ctx.fillStyle = '#888'; ctx.font = '11px monospace';
            if ([20, 100, 1000, 10000].includes(freq)) {
                ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : `${freq}`, x - 15, height - 5);
            }
        });

        ctx.strokeStyle = '#0a0'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i < width; i++) {
            const freq = minFreq * Math.pow(maxFreq / minFreq, i / width);
            const db   = 20 * Math.log10(getSmoothMag(freq, fft) + 1e-10);
            const y    = height - Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb))) * height;
            i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
        }
        ctx.stroke();

        const irSel = document.getElementById('irPoints');
        const pts   = irSel ? parseInt(irSel.value) : 512;
        if (pts <= fft.length * 2) {
            const overlayFFT     = this.computeFFT(audioData.slice(0, pts));
            const gainCorrection = pts / fullFFTSize;
            ctx.strokeStyle = '#0ff'; ctx.lineWidth = 2; ctx.beginPath();
            for (let i = 0; i < width; i++) {
                const freq = minFreq * Math.pow(maxFreq / minFreq, i / width);
                const db   = 20 * Math.log10(getSmoothMag(freq, overlayFFT) * gainCorrection + 1e-10);
                const y    = height - Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb))) * height;
                i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
            }
            ctx.stroke();
            ctx.fillStyle = '#0a0'; ctx.fillRect(width - 120, 10, 15, 10);
            ctx.fillStyle = '#888'; ctx.fillText('Full FFT', width - 100, 20);
            ctx.fillStyle = '#0ff'; ctx.fillRect(width - 120, 25, 15, 10);
            ctx.fillStyle = '#888'; ctx.fillText(`${pts} pts`, width - 100, 35);
        }
    },

    computeFFT(data) {
        const maxInput = 65536;
        let inputData  = data;
        if (data.length > maxInput) {
            const step = Math.floor(data.length / maxInput);
            inputData  = new Float32Array(maxInput);
            for (let i = 0; i < maxInput; i++) inputData[i] = data[i * step];
        }
        const N         = inputData.length;
        const magnitude = new Array(Math.floor(N / 2)).fill(0);
        for (let k = 0; k < N / 2; k++) {
            let re = 0, im = 0;
            for (let n = 0; n < N; n++) {
                const a = -2 * Math.PI * k * n / N;
                re += inputData[n] * Math.cos(a);
                im += inputData[n] * Math.sin(a);
            }
            magnitude[k] = Math.sqrt(re * re + im * im) / N;
        }
        return magnitude;
    },

    // =========================================================
    // TUNER
    // =========================================================

    updateTuner(freq) {
        const noteStrings = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const freqEl   = document.getElementById('freqDisplay');
        const stringEl = document.getElementById('stringDisplay');
        const needleEl = document.getElementById('tunerNeedle');
        const centsEl  = document.getElementById('centsDisplay');
        const targetEl = document.getElementById('targetFreq');

        // FIX: guard ALL elements before touching any of them.
        // The old code only checked freqEl/stringEl, then unconditionally
        // accessed needleEl.style — crashing with TypeError when the tuner
        // tab had not yet rendered (needleEl === null).
        if (!freqEl || !stringEl || !needleEl || !centsEl) return;

        // FIX: added upper bound (8000 Hz). The DSP pitch detector can
        // return garbage values well outside the guitar frequency range.
        if (!freq || freq < 20 || freq > 8000) {
            freqEl.textContent   = '-- Hz';
            stringEl.textContent = '--';
            centsEl.textContent  = '-- cents';
            if (targetEl) targetEl.textContent = '-- Hz';
            needleEl.style.transform       = 'translateX(-50%) rotate(0deg)';
            needleEl.style.backgroundColor = 'var(--color-border)';
            stringEl.style.color           = 'var(--color-text-primary)';
            freqEl.style.color             = 'var(--color-text-primary)';
            return;
        }

        const noteNum    = 12 * Math.log2(freq / 440) + 69;
        const rounded    = Math.round(noteNum);
        const cents      = (noteNum - rounded) * 100;
        const noteIndex  = ((rounded % 12) + 12) % 12;
        // FIX: show octave number (E2, A4, etc.) — far more useful than
        // a bare note name, particularly across the full guitar range.
        const octave     = Math.floor(rounded / 12) - 1;
        const targetFreq = 440 * Math.pow(2, (rounded - 69) / 12);
        const inTune     = Math.abs(cents) < 5;

        freqEl.textContent   = `${freq.toFixed(1)} Hz`;
        stringEl.textContent = `${noteStrings[noteIndex]}${octave}`;
        if (targetEl) targetEl.textContent = `${targetFreq.toFixed(1)} Hz`;
        centsEl.textContent  = `${cents > 0 ? '+' : ''}${cents.toFixed(0)} cents`;

        needleEl.style.transform       = `translateX(-50%) rotate(${Math.max(-45, Math.min(45, cents))}deg)`;
        needleEl.style.backgroundColor = inTune ? '#0f0' : '#f00';
        stringEl.style.color           = inTune ? '#0f0' : 'var(--color-accent)';
        // FIX: colour frequency display green when in tune
        freqEl.style.color             = inTune ? '#0f0' : 'var(--color-text-primary)';
    },
};
