export class Knob {
  constructor(element, min = 0, max = 100, value = 50, onInteract = null) {
    this.element = element;
    this.min = min;
    this.max = max;
    this.value = value;
    this.onInteract = onInteract;
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
    canvas.className = 'knob-canvas jm-knob-modern';
    canvas.width = 90;
    canvas.height = 90;
    this.element.innerHTML = '';
    this.element.appendChild(canvas);
    this.canvas = canvas;
    this.draw();
  }

  draw() {
    const ctx = this.canvas.getContext('2d');
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const outer = 38;
    const inner = 27;
    const t = (this.value - this.min) / (this.max - this.min || 1);
    const start = 0.74 * Math.PI;
    const sweep = 1.52 * Math.PI;
    const angle = start + t * sweep;

    const cs = getComputedStyle(document.body);
    const arcA    = cs.getPropertyValue('--knob-arc-a').trim()    || '#bf7dff';
    const arcB    = cs.getPropertyValue('--knob-arc-b').trim()    || '#7cf7ff';
    const arcC    = cs.getPropertyValue('--knob-arc-c').trim()    || '#72ff98';
    const glow    = cs.getPropertyValue('--knob-glow').trim()     || 'rgba(124,247,255,.65)';
    const haloA   = cs.getPropertyValue('--knob-halo-a').trim()   || 'rgba(124,247,255,.16)';
    const haloB   = cs.getPropertyValue('--knob-halo-b').trim()   || 'rgba(191,125,255,.07)';
    const bezelHi = cs.getPropertyValue('--knob-bezel-hi').trim() || '#89a8bd';
    const faceHi  = cs.getPropertyValue('--knob-face-hi').trim()  || '#d8edf0';

    ctx.clearRect(0, 0, w, h);

    // halo / shadow
    const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, 44);
    halo.addColorStop(0, haloA);
    halo.addColorStop(0.62, haloB);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.fill();

    // outer bezel
    const bezel = ctx.createLinearGradient(cx - outer, cy - outer, cx + outer, cy + outer);
    bezel.addColorStop(0, '#33465c');
    bezel.addColorStop(0.16, bezelHi);
    bezel.addColorStop(0.34, '#182332');
    bezel.addColorStop(0.7, '#070b11');
    bezel.addColorStop(1, '#3b4b5f');
    ctx.fillStyle = bezel;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.fill();

    // face
    const face = ctx.createRadialGradient(cx - 11, cy - 13, 3, cx, cy, inner + 8);
    face.addColorStop(0, faceHi);
    face.addColorStop(0.08, '#6e8797');
    face.addColorStop(0.38, '#1d2b39');
    face.addColorStop(0.72, '#0d141d');
    face.addColorStop(1, '#030507');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, cy, inner + 7, 0, Math.PI * 2);
    ctx.fill();

    // track
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(164,190,210,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, inner, start, start + sweep);
    ctx.stroke();

    // value arc
    const arc = ctx.createLinearGradient(cx - 35, cy + 30, cx + 35, cy - 32);
    arc.addColorStop(0, arcA);
    arc.addColorStop(0.45, arcB);
    arc.addColorStop(1, arcC);
    ctx.strokeStyle = arc;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, inner, start, angle);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // marker groove
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * 9, cy + Math.sin(angle) * 9);
    ctx.lineTo(cx + Math.cos(angle) * 24, cy + Math.sin(angle) * 24);
    ctx.stroke();

    // center cap
    const cap = ctx.createRadialGradient(cx - 4, cy - 5, 1, cx, cy, 11);
    cap.addColorStop(0, '#ffffff');
    cap.addColorStop(0.2, faceHi);
    cap.addColorStop(1, '#192533');
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();

    // value badge
    const displayValue = this.max <= 10 ? this.value.toFixed(1) : Math.round(this.value).toString();
    ctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(displayValue);
    const bw = Math.max(22, metrics.width + 10);
    const bx = cx - bw / 2;
    const by = cy + 22;
    ctx.fillStyle = 'rgba(5,9,14,0.84)';
    this.roundRect(ctx, bx, by, bw, 17, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(124,247,255,0.35)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, bx, by, bw, 17, 7);
    ctx.stroke();
    ctx.fillStyle = '#f4fbff';
    ctx.fillText(displayValue, cx, by + 8.5);
  }

  roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  bindEvents() {
    const onStart = (e) => {
      this.isDragging = true;
      this.startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
      this.startValue = this.value;
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!this.isDragging) return;
      const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
      const deltaY = this.startY - currentY;
      const sensitivity = this.max <= 10 ? 0.01 : 0.5;
      let newValue = this.startValue + deltaY * sensitivity;
      this.value = Math.max(this.min, Math.min(this.max, newValue));
      if (this.max <= 10) this.value = Math.round(this.value * 10) / 10;
      this.draw();
      if (this.onchange) this.onchange();
      if (this.onInteract) this.onInteract(this.value);
      e.preventDefault();
    };
    const onEnd = () => {
      if (this.isDragging && this.onrelease) this.onrelease();
      this.isDragging = false;
    };
    this.element.addEventListener('mousedown', onStart);
    this.element.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  }
}
