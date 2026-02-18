export class Knob {
    constructor(element, min = 0, max = 100, value = 50, onInteract = null) {
        this.element    = element;
        this.min        = min;
        this.max        = max;
        this.value      = value;
        this.onInteract = onInteract;
        this.isDragging = false;
        this.startY     = 0;
        this.startValue = 0;
        this.onchange   = null;
        this.onrelease  = null;
        this._rafPending = false;
        this.dpr        = window.devicePixelRatio || 1;

        element.knob = this;
        this.render();
        this.bindEvents();
    }

render() {
    const canvas = document.createElement('canvas');
    canvas.className = 'knob-canvas';

    const dpr  = this.dpr;
    // Use the element's actual CSS size, fall back to 70
    const size = this.element.offsetWidth || 70;

    canvas.width        = size * dpr;
    canvas.height       = size * dpr;
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';

    this.element.innerHTML = '';
    this.element.appendChild(canvas);
    this.canvas = canvas;
    this.size   = size;  // store for draw()
    this.draw();
},

    draw() {
    const ctx  = this.canvas.getContext('2d');
    const dpr  = this.dpr;
    const size = this.size || 70;
    const cx   = size / 2;
    const cy   = size / 2;
    const r    = size * 0.38;   // proportional radius

    ctx.clearRect(0, 0, size * dpr, size * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Body
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, '#666');
    grad.addColorStop(1, '#333');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Track
    ctx.strokeStyle = '#222';
    ctx.lineWidth   = size * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.78, 0.75 * Math.PI, 2.25 * Math.PI);
    ctx.stroke();

    // Value arc
    const angle = 0.75 * Math.PI + ((this.value - this.min) / (this.max - this.min)) * 1.5 * Math.PI;
    ctx.strokeStyle = '#00b0b0';
    ctx.lineWidth   = size * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.78, 0.75 * Math.PI, angle);
    ctx.stroke();

    // Needle
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = size * 0.035;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * r * 0.6, cy + Math.sin(angle) * r * 0.6);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Value label
    ctx.fillStyle    = '#fff';
    ctx.font         = `${Math.round(size * 0.18)}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const displayValue = (this.max <= 10)
        ? this.value.toFixed(1)
        : Math.round(this.value).toString();
    ctx.fillText(displayValue, cx, cy + r * 0.52);

    ctx.restore();
}

    _scheduleDraw() {
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(() => {
            this._rafPending = false;
            this.draw();
        });
    }

    _applyDelta(deltaY) {
        const sensitivity = (this.max <= 10) ? 0.01 : 0.5;
        let newValue = this.startValue + deltaY * sensitivity;
        this.value = Math.max(this.min, Math.min(this.max, newValue));
        if (this.max <= 10) this.value = Math.round(this.value * 10) / 10;
        this._scheduleDraw();
        if (this.onchange)   this.onchange();
        if (this.onInteract) this.onInteract(this.value);
    }

    bindEvents() {
        // ── TOUCH (mobile) — all on element so touchend is never missed ──
        this.element.addEventListener('touchstart', (e) => {
            this.isDragging = true;
            this.startY     = e.touches[0].clientY;
            this.startValue = this.value;
            e.preventDefault();
        }, { passive: false });

        this.element.addEventListener('touchmove', (e) => {
            if (!this.isDragging) return;
            this._applyDelta(this.startY - e.touches[0].clientY);
            e.preventDefault();
        }, { passive: false });

        this.element.addEventListener('touchend', () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            if (this.onrelease) this.onrelease();
        }, { passive: false });

        // ── MOUSE (desktop) — listeners added/removed per drag ──────────
        const onMouseMove = (e) => {
            if (!this.isDragging) return;
            this._applyDelta(this.startY - e.clientY);
        };

        const onMouseUp = () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            if (this.onrelease) this.onrelease();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup',   onMouseUp);
        };

        this.element.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.startY     = e.clientY;
            this.startValue = this.value;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup',   onMouseUp);
        });
    }
}

