export class IIRDesigner {
    constructor(canvas, qKnob, onInteract = null, onDataChange = null) {
        // ... (Constructor setup same as before) ...
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width = canvas.offsetWidth;
        this.height = canvas.height = canvas.offsetHeight;
        this.qKnob = qKnob;
        this.onInteract = onInteract; 
        this.onDataChange = onDataChange; 
        this.selectedIndex = null;
        this.dragging = null;
        this.hoverIndex = null;
        this.lastClickTime = 0;
        this.lastClickIndex = null;

        if (this.qKnob) {
            this.qKnob.onchange = () => {
                if (this.selectedIndex !== null) {
                    this.points[this.selectedIndex].q = this.qKnob.value;
                    this.draw();
                }
            };
            this.qKnob.onrelease = () => {
                if (this.selectedIndex !== null) this.triggerDataChange(this.selectedIndex);
            };
        }

        this.masterPoints = [
            { freq: 80, gain: 0, enabled: true, type: 'hpf', color: '#0f0', q: 0.707 },
            { freq: 160, gain: 0, enabled: true, type: 'peak', color: '#f00', q: 1.41 },
            { freq: 240, gain: 0, enabled: true, type: 'peak', color: '#f00', q: 1.41 },
            { freq: 500, gain: 0, enabled: true, type: 'peak', color: '#f00', q: 1.41 },
            { freq: 800, gain: 0, enabled: true, type: 'peak', color: '#f00', q: 1.41 },
            { freq: 1000, gain: 0, enabled: true, type: 'peak', color: '#f00', q: 1.41 },
            { freq: 1600, gain: 0, enabled: true, type: 'peak', color: '#f00', q: 1.41 },
            { freq: 2400, gain: 0, enabled: true, type: 'peak', color: '#f00', q: 1.41 },
            { freq: 3200, gain: 0, enabled: true, type: 'peak', color: '#f00', q: 1.41 },
            { freq: 4000, gain: 0, enabled: true, type: 'peak', color: '#f00', q: 1.41 },
            { freq: 6000, gain: 0, enabled: true, type: 'peak', color: '#f00', q: 1.41 },
            { freq: 8000, gain: 0, enabled: true, type: 'lpf', color: '#00f', q: 0.707 }
        ];
        this.points = [...this.masterPoints];

        this.bindEvents();
        requestAnimationFrame(() => this.draw());
    }

    triggerDataChange(idx, overridePt = null) {
        if(this.onDataChange) {
            // Find the point. 'idx' is the index in masterPoints (0-11) to keep ID consistent
            // If we are iterating masterPoints, we pass overridePt.
            // If interacting with UI 'this.points', we need to map back to master index if the arrays differ,
            // BUT for simplicity, 'idx' here always refers to the point's ID.
            
            // However, the UI interactions pass the index in 'this.points'. 
            // If 'this.points' is a subset, we must be careful.
            // FORTUNATELY, 'setBiquadCount' creates a subset but they are references to masterPoints objects.
            // We need to know the true index (0-11) for the Protocol.
            
            const pt = overridePt || this.points[idx];
            if (!pt) return;
            
            // Find true index in master list for the Protocol
            const trueIdx = this.masterPoints.indexOf(pt);
            
            if (trueIdx !== -1) {
                console.log(`[IIR] Sending Band ${trueIdx}: En=${pt.enabled}, G=${pt.gain}`);
                this.onDataChange(trueIdx, pt.enabled, pt.freq, pt.gain, pt.q);
            }
        }
    }

    reportStatus(idx) {
        if(idx === null || !this.points[idx] || !this.onInteract) return;
        const pt = this.points[idx];
        let text = `Freq: ${Math.round(pt.freq)} Hz`;
        if (pt.type !== 'hpf' && pt.type !== 'lpf') {
            text += `\nGain: ${pt.gain.toFixed(1)} dB`;
        } else {
            text += `\nGain: --`;
        }
        text += `\nQ: ${pt.q.toFixed(2)}`;
        this.onInteract(text);
    }

    setBiquadCount(count) {
        const newPoints = [this.masterPoints[0]]; // Always keep HPF
        
        // Iterate through all Peaking bands (Indices 1 to 10)
        for (let i = 1; i <= 10; i++) {
            const pt = this.masterPoints[i];
            if (i <= count) {
                // This band is active in the UI
                newPoints.push(pt);
            } else {
                // This band is HIDDEN. Disable it on the DSP.
                if (pt.enabled) {
                    pt.enabled = false;
                    // Force update to DSP to turn it off
                    this.triggerDataChange(null, pt);
                }
            }
        }
        
        newPoints.push(this.masterPoints[11]); // Always keep LPF
        this.points = newPoints;
        this.selectedIndex = null;
        this.draw();
    }
	
	// UPDATED: Logic to reset and sync all bands
    reset() {
        this.masterPoints.forEach((pt, i) => {
            pt.gain = 0;
            pt.enabled = true;
            pt.q = (pt.type === 'peak') ? 1.41 : 0.707;
            // Send update for EVERY point to ensure DSP is flat
            this.triggerDataChange(null, pt);
        });
        this.draw();
    }

    bindEvents() {
        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
            return { x: (e.touches ? e.touches[0].clientX : e.clientX) - rect.left, y: (e.touches ? e.touches[0].clientY : e.clientY) - rect.top };
        };

        this.canvas.addEventListener('mousemove', (e) => {
            const pos = getPos(e);
            if (this.dragging !== null && this.points[this.dragging].enabled) {
                this.updatePoint(this.dragging, pos.x, pos.y);
            } else {
                this.hoverIndex = this.findPoint(pos.x, pos.y);
            }
            this.draw();
        });

       this.canvas.addEventListener('wheel', (e) => {
            if (this.hoverIndex !== null && this.points[this.hoverIndex].enabled) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                let newQ = this.points[this.hoverIndex].q + delta;
                newQ = Math.round(newQ * 10) / 10; 
                this.points[this.hoverIndex].q = Math.max(0.1, Math.min(10, newQ));
                if (this.selectedIndex === this.hoverIndex && this.qKnob) {
                    this.qKnob.value = this.points[this.hoverIndex].q;
                    this.qKnob.draw();
                }
                this.reportStatus(this.hoverIndex);
                this.triggerDataChange(this.hoverIndex);
                this.draw();
            }
        }, {passive: false});

        const onStart = (e) => {
            const pos = getPos(e);
            const idx = this.findPoint(pos.x, pos.y);
            const currentTime = Date.now();
            if (idx !== null) {
                if (this.lastClickIndex === idx && (currentTime - this.lastClickTime) < 300) {
                    this.points[idx].enabled = !this.points[idx].enabled;
                    this.lastClickTime = 0; this.lastClickIndex = null;
                    if(this.onInteract) this.onInteract(this.points[idx].enabled ? "Band Enabled" : "Band Disabled");
                    this.triggerDataChange(idx); // Toggle Send
                } else {
                    this.selectedIndex = idx;
                    if (this.qKnob) { this.qKnob.value = this.points[idx].q; this.qKnob.draw(); }
                    if (this.points[idx].enabled) { this.dragging = idx; this.reportStatus(idx); }
                    this.lastClickTime = currentTime; this.lastClickIndex = idx;
                }
                this.draw();
            }
            if (e.type === 'touchstart') e.preventDefault();
        };

        const onEnd = () => { 
            if (this.dragging !== null) this.triggerDataChange(this.dragging);
            this.dragging = null; 
        };

        this.canvas.addEventListener('mousedown', onStart);
        this.canvas.addEventListener('touchstart', onStart, {passive: false});
        this.canvas.addEventListener('touchmove', (e) => {
            if (this.dragging !== null && this.points[this.dragging].enabled) {
                const pos = getPos(e);
                this.updatePoint(this.dragging, pos.x, pos.y);
                e.preventDefault();
            }
        }, {passive: false});
        this.canvas.addEventListener('mouseup', onEnd);
        this.canvas.addEventListener('touchend', onEnd);
        this.canvas.addEventListener('mouseleave', onEnd);
    }

    findPoint(x, y) {
        for (let i = 0; i < this.points.length; i++) {
            const px = this.freqToX(this.points[i].freq);
            const py = this.gainToY(this.points[i].gain);
            if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) < 20) return i;
        }
        return null;
    }

    updatePoint(idx, x, y) {
        const pt = this.points[idx];
        if (pt.type === 'hpf' || pt.type === 'lpf') {
            pt.freq = this.xToFreq(x);
            pt.gain = 0;
        } else {
            pt.freq = Math.max(60, Math.min(15000, this.xToFreq(x)));
            pt.gain = Math.max(-20, Math.min(20, this.yToGain(y)));
        }
        this.reportStatus(idx);
        this.draw();
    }

    freqToX(freq) {
        const logMin = Math.log10(20);
        const logMax = Math.log10(20000);
        return (Math.log10(freq) - logMin) / (logMax - logMin) * this.width;
    }

    xToFreq(x) {
        const logMin = Math.log10(20);
        const logMax = Math.log10(20000);
        return Math.pow(10, logMin + (x / this.width) * (logMax - logMin));
    }

    gainToY(gain) {
        const t = (20 - gain) / 40;
        return t * this.height;
    }

    yToGain(y) {
        const t = y / this.height;
        return 20 - t * 40;
    }

    draw() {
        if (this.canvas.offsetWidth > 0 && this.canvas.offsetHeight > 0) {
             if (this.canvas.width !== this.canvas.offsetWidth || this.canvas.height !== this.canvas.offsetHeight) {
                 this.width = this.canvas.width = this.canvas.offsetWidth;
                 this.height = this.canvas.height = this.canvas.offsetHeight;
             }
        }

        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.ctx.strokeStyle = '#999';
        this.ctx.lineWidth = 1;

        // Grid
        [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(freq => {
            const x = this.freqToX(freq);
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.height); this.ctx.stroke();
            this.ctx.fillStyle = '#999'; this.ctx.font = '10px monospace';
            const label = freq >= 1000 ? `${freq/1000}k` : `${freq}`;
            this.ctx.fillText(label, x + 3, this.height - 5);
        });

        for (let db = -20; db <= 20; db += 5) {
            const y = this.gainToY(db);
            this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(this.width, y); this.ctx.stroke();
            this.ctx.fillStyle = '#999'; this.ctx.font = '10px monospace';
            this.ctx.fillText(`${db}dB`, 5, y - 3);
        }
        
        const y0 = this.gainToY(0);
        this.ctx.strokeStyle = '#999'; this.ctx.lineWidth = 2;
        this.ctx.beginPath(); this.ctx.moveTo(0, y0); this.ctx.lineTo(this.width, y0); this.ctx.stroke();

        // Curve
        this.ctx.strokeStyle = '#0f0';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();

        const fs = 48000;
        const numPoints = this.width; 
        
        for (let x = 0; x < numPoints; x++) {
            const freq = this.xToFreq(x);
            const w = 2 * Math.PI * freq / fs;
            let totalMag = 1.0;

            this.points.forEach(pt => {
                if (pt.enabled) {
                    // === FIXED: Common variables declared here ===
                    const w0 = 2 * Math.PI * pt.freq / fs;
                    const alpha = Math.sin(w0) / (2 * pt.q);
                    const A = Math.pow(10, pt.gain / 40.0);
                    const cosw0 = Math.cos(w0);
                    
                    let b0, b1, b2, a0, a1, a2;
                    
                    if (pt.type === 'peak') {
                        b0 = 1 + alpha * A; b1 = -2 * cosw0; b2 = 1 - alpha * A;
                        a0 = 1 + alpha / A; a1 = -2 * cosw0; a2 = 1 - alpha / A;
                    } else if (pt.type === 'hpf') {
                        b0 = (1 + cosw0) / 2; b1 = -(1 + cosw0); b2 = (1 + cosw0) / 2;
                        a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
                    } else { 
                        b0 = (1 - cosw0) / 2; b1 = 1 - cosw0; b2 = (1 - cosw0) / 2;
                        a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
                    }
                    
                    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
                    
                    const numSq = b0*b0 + b1*b1 + b2*b2 + 2*(b0*b1 + b1*b2)*Math.cos(w) + 2*b0*b2*Math.cos(2*w);
                    const denSq = 1 + a1*a1 + a2*a2 + 2*(a1 + a1*a2)*Math.cos(w) + 2*a2*Math.cos(2*w);
                    totalMag *= Math.sqrt(numSq / denSq);
                }
            });

            const totalGainDb = 20 * Math.log10(totalMag + 1e-10);
            const y = this.gainToY(totalGainDb);
            
            if (x === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();

        // Points & Labels
        this.points.forEach((pt, idx) => {
            const x = this.freqToX(pt.freq);
            const y = this.gainToY(pt.gain);
            const isSel = (idx === this.selectedIndex);
            const isHov = (idx === this.hoverIndex);
            const isRightEdge = (x > this.width - 60);

            this.ctx.fillStyle = pt.enabled ? pt.color : '#555';
            this.ctx.beginPath();
            this.ctx.arc(x, y, (isSel || isHov) ? 10 : 8, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = isSel ? '#f0f' : (isHov ? '#ff0' : '#fff');
            this.ctx.lineWidth = (isSel || isHov) ? 3 : 2;
            this.ctx.stroke();
            
            this.ctx.fillStyle = pt.enabled ? '#0f0' : '#888';
            this.ctx.font = '10px monospace';
            this.ctx.textAlign = isRightEdge ? 'right' : 'left';
            const textX = isRightEdge ? x - 12 : x + 12;
            
            this.ctx.fillText(`${Math.round(pt.freq)}Hz`, textX, y - 8);
            if (pt.type !== 'hpf' && pt.type !== 'lpf') {
                this.ctx.fillText(`${pt.gain.toFixed(1)}dB`, textX, y + 4);
            }
            this.ctx.fillText(`Q:${pt.q.toFixed(2)}`, textX, y + 14);
            this.ctx.textAlign = 'left';
        });
    }

    
}