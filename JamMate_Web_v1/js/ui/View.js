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
			btn.className = 'effect-btn';
			btn.dataset.index = idx;
			btn.dataset.effectId = idx;
			btn.draggable = true;  // ← Enable dragging
			btn.textContent = effect.title;

			// Drag start - show as dragging
			btn.addEventListener('dragstart', (e) => {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('effectIndex', idx);
				btn.classList.add('dragging');
			});

			// Drag end - cleanup
			btn.addEventListener('dragend', (e) => {
				btn.classList.remove('dragging');
				document.querySelectorAll('.effect-btn').forEach(b => {
					b.classList.remove('drag-over');
				});
			});

			// Drag over - show drop zone
			btn.addEventListener('dragover', (e) => {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				btn.classList.add('drag-over');
			});

			// Drag leave - remove highlight
			btn.addEventListener('dragleave', (e) => {
				btn.classList.remove('drag-over');
			});

			// Drop - perform reorder
			btn.addEventListener('drop', (e) => {
				e.preventDefault();
				e.stopPropagation();
				
				const sourceIdx = parseInt(e.dataTransfer.getData('effectIndex'));
				if (sourceIdx !== idx) {
					this.app.reorderEffects(sourceIdx, idx);
				}
				
				btn.classList.remove('drag-over');
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
			
			// Level Knob
			const savedLevel = effectParams[`knob0`] !== undefined ? effectParams[`knob0`] : 50;
			const levelKnob = new Knob(document.getElementById('eqLevelKnob'), 0, 100, savedLevel, (val) => this.updateStatus(`Level: ${Math.round(val)}`));
			levelKnob.onrelease = () => { if(onKnobChange) onKnobChange(0, levelKnob.value); };

			// Q Knob
			const qKnob = new Knob(document.getElementById('eqQKnob'), 0.1, 10, 1.41, (val) => this.updateStatus(`Q Factor: ${val.toFixed(2)}`));
			
			// Initialize Designer
			this.app.iirDesigner = new IIRDesigner(
				document.getElementById('iirCanvas'), 
				qKnob, 
				(txt) => this.updateStatus(txt),
				(idx, en, f, g, q) => { 
					if(onEQChange) onEQChange(idx, en, f, g, q); 
				}
			);

			// --- LOAD EXISTING DATA ---
			// We must check if app has data, otherwise default
			if (this.app.currentEQPoints && this.app.currentEQPoints.length === 12) {
				this.app.iirDesigner.loadPoints(this.app.currentEQPoints);
			} else {
				this.app.iirDesigner.reset(); // Force default structure
			}

			// --- FIX: RESET BUTTON LISTENER ---
			// Removed { once: true } and attached directly to ID
			document.getElementById('btnEqReset').addEventListener('click', () => {
				this.app.iirDesigner.reset();
				// Sync dropdown visual to 12 (default)
				document.getElementById('biquadCount').value = "10";
				this.updateStatus("EQ Reset to Default");
			});

			// --- FIX: DROPDOWN LISTENER ---
			document.getElementById('biquadCount').addEventListener('change', (e) => {
				const count = parseInt(e.target.value); // 0 to 10
				this.app.iirDesigner.setBiquadCount(count);
			});
			
			// Initial Draw
			this.app.iirDesigner.draw();
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
		// Enable checkbox
		const drumEnable = document.getElementById('drumEnable');
		drumEnable.addEventListener('change', (e) => {
		this.app.onDrumToggle(e.target.checked);
		});

		// Style dropdown
		const drumStyle = document.getElementById('drumStyle');
		drumStyle.addEventListener('change', (e) => {
		this.app.onDrumStyle(parseInt(e.target.value));
		});

		// Fill dropdown  
		const drumFill = document.getElementById('drumFill');
		drumFill.addEventListener('change', (e) => {
		this.app.onDrumFill(parseInt(e.target.value));
		});

		// Level knob (if you have one)
		const drumLevelKnobEl = document.getElementById('drumLevelKnob');
		if (drumLevelKnobEl) {
		const drumLevelKnob = new Knob(drumLevelKnobEl, 0, 100, 50, (val) => {
		  this.app.onDrumLevel(val);
		});
		}		
		
    },

    // =========================================================
    // VISUALIZERS (Drum, Waveform, Spectrum)
    // =========================================================

	setupDrumGrid(drumPattern, updateCallback) {
	  const grid = document.getElementById('drumGrid');
	  if (!grid) return;

	  grid.innerHTML = '';

	  const parts = ['Kick', 'Snare', 'HiHat', 'Cymbal', 'Tom1', 'Tom2', 'Tom3', 'Perc1', 'Perc2'];

	  parts.forEach((part, row) => {
		const rowDiv = document.createElement('div');
		rowDiv.className = 'drum-row';

		const label = document.createElement('div');
		label.className = 'drum-label';
		label.textContent = part;
		rowDiv.appendChild(label);

		for (let col = 0; col < 16; col++) {
		  const cell = document.createElement('div');
		  cell.className = 'drum-cell';
		  cell.dataset.row = row;
		  cell.dataset.col = col;

		  // Initialize with current pattern value
		  const velocity = drumPattern[row][col] || 0;
		  if (velocity > 0) {
			cell.classList.add('active');
			const bar = document.createElement('div');
			bar.className = 'velocity-bar';
			bar.style.height = `${(velocity / 127) * 100}%`;

			if (velocity < 40) {
			  bar.style.backgroundColor = '#0a0';
			} else if (velocity < 90) {
			  bar.style.backgroundColor = '#0d0';
			} else {
			  bar.style.backgroundColor = '#0f0';
			}

			cell.appendChild(bar);
		  }

		  // Click handler
		  cell.addEventListener('click', () => {
			updateCallback(cell, row, col);
		  });

		  rowDiv.appendChild(cell);
		}

		grid.appendChild(rowDiv);
	  });
	},

	updateDrumCell(cell, velocity) {
	  if (velocity === 0) {
		cell.classList.remove('active');
		const bar = cell.querySelector('.velocity-bar');
		if (bar) bar.remove();
	  } else {
		cell.classList.add('active');

		let bar = cell.querySelector('.velocity-bar');
		if (!bar) {
		  bar = document.createElement('div');
		  bar.className = 'velocity-bar';
		  cell.appendChild(bar);
		}

		// Scale velocity (0-127) to percentage
		const heightPercent = (velocity / 127) * 100;
		bar.style.height = `${heightPercent}%`;

		// Color coding for velocity levels
		if (velocity < 40) {
		  bar.style.backgroundColor = '#0a0'; // Soft green
		} else if (velocity < 90) {
		  bar.style.backgroundColor = '#0d0'; // Medium green
		} else {
		  bar.style.backgroundColor = '#0f0'; // Bright green
		}
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
        
        // 1. Prepare Data
        const fft = cachedFullFFT || this.computeFFT(audioData.slice(0, 2048));
        const fullFFTSize = fft.length * 2; // Used for normalization

        const maxMag = Math.max(...fft);
        // Safety against -Infinity
        const maxDb = 20 * Math.log10(maxMag + 1e-10);
        const minDb = maxDb - 80;
        const minFreq = 20;
        const maxFreq = Math.min(20000, sampleRate / 2);

        // Helper: Interpolated Magnitude Lookup
        const getSmoothMag = (frequency, fftData) => {
            const nyquist = sampleRate / 2;
            // Float index representing the exact position in the array
            const binFloat = (frequency / nyquist) * fftData.length;
            
            const idx = Math.floor(binFloat);
            const frac = binFloat - idx;

            // Safety check for bounds
            if (idx >= fftData.length - 1) return fftData[fftData.length - 1] || 0;
            if (idx < 0) return fftData[0] || 0;

            const val1 = fftData[idx];
            const val2 = fftData[idx + 1];

            // Linear Interpolation: (1 - t) * v1 + t * v2
            return val1 * (1 - frac) + val2 * frac;
        };
        
        // 2. Draw Grid (Unchanged)
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(freq => {
            if (freq <= maxFreq) {
                const t = Math.log10(freq / minFreq) / Math.log10(maxFreq / minFreq);
                const x = t * width;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
                
                // Labels
                ctx.fillStyle = '#888'; ctx.font = '11px monospace';
                if ([20, 100, 1000, 10000].includes(freq)) {
                    const label = freq >= 1000 ? `${freq/1000}k` : `${freq}`;
                    ctx.fillText(label, x - 15, height - 5);
                }
            }
        });

        // 3. Draw Main (Green) Curve with Smoothing
        ctx.strokeStyle = '#0a0'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i < width; i++) {
            const t = i / width;
            const freq = minFreq * Math.pow(maxFreq / minFreq, t);
            
            // Use Interpolated Helper
            const mag = getSmoothMag(freq, fft);
            
            const db = 20 * Math.log10(mag + 1e-10);
            const dbNorm = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
            const y = height - (dbNorm * height);
            
            if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
        }
        ctx.stroke();

        // 4. Draw Subset (Cyan) Curve
        const irPointsSelect = document.getElementById('irPoints');
        const selectedPoints = irPointsSelect ? parseInt(irPointsSelect.value) : 512;
        
        if (selectedPoints <= fft.length * 2) {
            ctx.strokeStyle = '#0ff'; ctx.lineWidth = 2; ctx.beginPath();
            const truncatedAudio = audioData.slice(0, selectedPoints);
            const overlayFFT = this.computeFFT(truncatedAudio);
            
            // Apply Normalization Correction (from previous fix)
            const gainCorrection = selectedPoints / fullFFTSize;

            for (let i = 0; i < width; i++) {
                const t = i / width;
                const freq = minFreq * Math.pow(maxFreq / minFreq, t);
                
                // Use Interpolated Helper
                let mag = getSmoothMag(freq, overlayFFT);
                
                // Apply Gain Correction
                mag *= gainCorrection;

                const db = 20 * Math.log10(mag + 1e-10);
                const dbNorm = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
                const y = height - (dbNorm * height);
                
                if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
            }
            ctx.stroke();

            // Legend
            ctx.fillStyle = '#0a0'; ctx.fillRect(width - 120, 10, 15, 10);
            ctx.fillStyle = '#888'; ctx.fillText('Full FFT', width - 100, 20);
            ctx.fillStyle = '#0ff'; ctx.fillRect(width - 120, 25, 15, 10);
            ctx.fillStyle = '#888'; ctx.fillText(`${selectedPoints} pts`, width - 100, 35);
        }
    },
	
    computeFFT(data) {
        const maxInput = 65536;
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
    },
	
	updateTuner(freq) {
        const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const freqEl = document.getElementById('freqDisplay');
        const stringEl = document.getElementById('stringDisplay');
        const needleEl = document.getElementById('tunerNeedle');
        const centsEl = document.getElementById('centsDisplay');
        const targetEl = document.getElementById('targetFreq');

        if (!freqEl || !stringEl) return;

        if (freq < 20) {
            freqEl.textContent = "-- Hz"; stringEl.textContent = "--"; centsEl.textContent = "-- cents";
            needleEl.style.transform = "translateX(-50%) rotate(0deg)";
            return;
        }

        const noteNum = 12 * Math.log2(freq / 440) + 69;
        const roundedNote = Math.round(noteNum);
        const diff = noteNum - roundedNote; 
        const cents = diff * 100;
        const noteIndex = roundedNote % 12;
        const noteName = noteStrings[noteIndex < 0 ? noteIndex + 12 : noteIndex]; 
        const targetFreq = 440 * Math.pow(2, (roundedNote - 69) / 12);

        freqEl.textContent = `${freq.toFixed(1)} Hz`;
        stringEl.textContent = noteName;
        targetEl.textContent = `${targetFreq.toFixed(1)} Hz`;
        centsEl.textContent = `${cents > 0 ? '+' : ''}${cents.toFixed(0)} cents`;
        
        const rotation = Math.max(-45, Math.min(45, cents));
        needleEl.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
        
        if (Math.abs(cents) < 5) {
            stringEl.style.color = "#0f0"; needleEl.style.backgroundColor = "#0f0";
        } else {
            stringEl.style.color = "var(--color-accent)"; needleEl.style.backgroundColor = "#f00";
        }
    }
};