export class Knob {
    constructor(element, min = 0, max = 100, value = 50, onInteract = null) {
        this.element = element; 
        this.min = min; 
        this.max = max; 
        this.value = value;
        this.onInteract = onInteract; // The connection to the Status Bar
        
        this.isDragging = false; 
        this.startY = 0; 
        this.startValue = 0;
        this.onchange = null; 
        this.onrelease = null;
        
        element.knob = this;
        this.render(); 
        this.bindEvents();
    }
    
    render() {
        const canvas = document.createElement('canvas');
        canvas.className = 'knob-canvas'; canvas.width = 90; canvas.height = 90;
        this.element.innerHTML = ''; this.element.appendChild(canvas);
        this.canvas = canvas; this.draw();
    }
    
    draw() {
        const ctx = this.canvas.getContext('2d');
        const w = this.canvas.width; const h = this.canvas.height;
        const cx = w / 2; const cy = h / 2; const r = 35;
        ctx.clearRect(0, 0, w, h);
        
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, '#666'); grad.addColorStop(1, '#333');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        
        ctx.strokeStyle = '#222'; ctx.lineWidth = 6; ctx.beginPath();
        ctx.arc(cx, cy, r - 8, 0.75 * Math.PI, 2.25 * Math.PI); ctx.stroke();
        
        const angle = 0.75 * Math.PI + ((this.value - this.min) / (this.max - this.min)) * 1.5 * Math.PI;
        ctx.strokeStyle = '#00b0b0'; ctx.lineWidth = 6; ctx.beginPath();
        ctx.arc(cx, cy, r - 8, 0.75 * Math.PI, angle); ctx.stroke();
        
        const needleLength = r - 15;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * needleLength, cy + Math.sin(angle) * needleLength); ctx.stroke();
        
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0'; ctx.font = '16px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const displayValue = (this.max <= 10) ? this.value.toFixed(1) : Math.round(this.value).toString();
        ctx.fillText(displayValue, cx, cy + 20);
    }
    
bindEvents() {
    // ── TOUCH (mobile) ─────────────────────────────────────────
    this.element.addEventListener('touchstart', (e) => {
        this.isDragging = true;
        this.startY = e.touches[0].clientY;
        this.startValue = this.value;
        e.preventDefault();
    }, { passive: false });

    this.element.addEventListener('touchmove', (e) => {
        if (!this.isDragging) return;
        const deltaY = this.startY - e.touches[0].clientY;
        const sensitivity = (this.max <= 10) ? 0.01 : 0.5;
        this.value = Math.max(this.min, Math.min(this.max, this.startValue + deltaY * sensitivity));
        if (this.max <= 10) this.value = Math.round(this.value * 10) / 10;
        this.draw();
        if (this.onchange) this.onchange();
        if (this.onInteract) this.onInteract(this.value);
        e.preventDefault();
    }, { passive: false });

    this.element.addEventListener('touchend', () => {
        if (!this.isDragging) return;
        this.isDragging = false;
        if (this.onrelease) this.onrelease();
    }, { passive: false });

    // ── MOUSE (desktop) — listeners added/removed per drag ─────
    const onMouseMove = (e) => {
        if (!this.isDragging) return;
        const deltaY = this.startY - e.clientY;
        const sensitivity = (this.max <= 10) ? 0.01 : 0.5;
        this.value = Math.max(this.min, Math.min(this.max, this.startValue + deltaY * sensitivity));
        if (this.max <= 10) this.value = Math.round(this.value * 10) / 10;
        this.draw();
        if (this.onchange) this.onchange();
        if (this.onInteract) this.onInteract(this.value);
    };

    const onMouseUp = () => {
        if (!this.isDragging) return;
        this.isDragging = false;
        if (this.onrelease) this.onrelease();
        // Remove listeners — no overhead until next drag
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    this.element.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.startY = e.clientY;
        this.startValue = this.value;
        // Only attach while dragging
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

}

}

