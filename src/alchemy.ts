// The cauldron: drop herbs in, stir with the mouse, see what comes out.
import { audio } from './audio';
import { ITEMS } from './data';
import { input } from './input';

const W = 440, H = 360, CX = 220, CY = 170, RX = 150, RY = 58;

export class CauldronView {
  el: HTMLCanvasElement;
  herbs: string[] = [];
  private g: CanvasRenderingContext2D;
  private t = 0;
  private stir = 0; private spin = 0; private lastA: number | null = null;
  private mx = CX; private my = CY; private inside = false;
  private msg: string[] = []; private msgT = 0; private msgGood = true;
  private bubbles: { x: number; y: number; r: number; v: number }[] = [];
  private col = [70, 120, 110];
  constructor(private onBrew: (herbs: string[]) => { lines: string[]; good: boolean }, private onChange: () => void) {
    this.el = document.createElement('canvas');
    this.el.width = W * 2; this.el.height = H * 2;
    this.el.className = 'cauldron';
    this.g = this.el.getContext('2d')!;
    this.g.scale(2, 2);
    this.el.addEventListener('mousemove', (e) => {
      const r = this.el.getBoundingClientRect();
      this.mx = ((e.clientX - r.left) / r.width) * W; this.my = ((e.clientY - r.top) / r.height) * H;
      const dx = (this.mx - CX) / RX, dy = (this.my - CY) / RY;
      this.inside = dx * dx + dy * dy < 1.25;
      if (this.inside && this.herbs.length >= 2 && this.msgT <= 0) {
        const a = Math.atan2(dy, dx);
        if (this.lastA !== null) {
          let d = a - this.lastA;
          if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
          this.stir += Math.abs(d) / (Math.PI * 2 * 2.5);
          this.spin += d;
          if (Math.random() < 0.06) audio.play('splash', { volume: 0.12, rate: 1.6 });
        }
        this.lastA = a;
      } else this.lastA = null;
    });
    this.el.addEventListener('mouseleave', () => { this.lastA = null; this.inside = false; });
    this.el.addEventListener('click', () => {
      // click a floating herb to fish it back out
      for (let i = this.herbs.length - 1; i >= 0; i--) { const [x, y] = this.herbPos(i); if (Math.hypot(this.mx - x, this.my - y) < 24) { this.herbs.splice(i, 1); this.stir = 0; audio.play('ui_back'); this.onChange(); return; } }
    });
  }
  add(id: string) { if (this.herbs.length < 3 && this.msgT <= 0) { this.herbs.push(id); this.stir = 0; audio.play('splash', { volume: 0.5 }); this.onChange(); } }
  private herbPos(i: number): [number, number] {
    const a = this.spin + (i / Math.max(1, this.herbs.length)) * Math.PI * 2 + 0.6;
    return [CX + Math.cos(a) * RX * 0.5, CY + Math.sin(a) * RY * 0.5 + Math.sin(this.t * 2 + i) * 2];
  }
  tick(dt: number) {
    this.t += dt;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.onChange(); }
    if (input.key('Space') && this.herbs.length >= 2 && this.msgT <= 0) { this.stir += dt * 0.55; this.spin += dt * 5; }
    if (this.stir >= 1) {
      const r = this.onBrew(this.herbs.slice());
      this.msg = r.lines; this.msgGood = r.good; this.msgT = 3.2;
      this.herbs = []; this.stir = 0;
      for (let i = 0; i < 14; i++) this.bubbles.push({ x: CX + (Math.random() - 0.5) * RX * 1.4, y: CY, r: 3 + Math.random() * 6, v: 60 + Math.random() * 80 });
    }
    // liquid colour drifts toward the blend of what is in the pot
    let target = [70, 120, 110];
    if (this.herbs.length) {
      target = [0, 0, 0];
      for (const h of this.herbs) { const c = parseInt(ITEMS[h].color.slice(1), 16); target[0] += (c >> 16) & 255; target[1] += (c >> 8) & 255; target[2] += c & 255; }
      target = target.map((v) => v / this.herbs.length);
    }
    for (let i = 0; i < 3; i++) this.col[i] += (target[i] - this.col[i]) * Math.min(1, dt * 3);
    if (Math.random() < dt * (3 + this.herbs.length * 3)) this.bubbles.push({ x: CX + (Math.random() - 0.5) * RX * 1.5, y: CY + (Math.random() - 0.5) * RY, r: 2 + Math.random() * 5, v: 14 + Math.random() * 22 });
    for (const b of this.bubbles) b.y -= b.v * dt;
    this.bubbles = this.bubbles.filter((b) => b.y > CY - 70 - b.r * 6);
    this.draw();
  }
  private draw() {
    const g = this.g, [r, gg, b] = this.col.map(Math.round);
    g.clearRect(0, 0, W, H);
    // embers
    for (let i = 0; i < 7; i++) { g.fillStyle = `rgba(255,${120 + ((i * 37) % 80)},40,${0.35 + Math.sin(this.t * 6 + i) * 0.2})`; g.beginPath(); g.ellipse(CX - 90 + i * 30, 338 - (i % 2) * 6, 16, 7, 0, 0, 7); g.fill(); }
    // pot
    g.fillStyle = '#26262c'; g.strokeStyle = '#0c0c10'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(CX - RX - 14, CY); g.bezierCurveTo(CX - RX - 40, CY + 190, CX + RX + 40, CY + 190, CX + RX + 14, CY); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#3a3a42'; g.beginPath(); g.ellipse(CX, CY, RX + 18, RY + 12, 0, 0, 7); g.fill(); g.stroke();
    // liquid
    const lg = g.createRadialGradient(CX - 30, CY - 14, 10, CX, CY, RX);
    lg.addColorStop(0, `rgb(${Math.min(255, r + 50)},${Math.min(255, gg + 50)},${Math.min(255, b + 50)})`); lg.addColorStop(1, `rgb(${Math.round(r * 0.6)},${Math.round(gg * 0.6)},${Math.round(b * 0.6)})`);
    g.fillStyle = lg; g.beginPath(); g.ellipse(CX, CY, RX, RY, 0, 0, 7); g.fill();
    g.save(); g.beginPath(); g.ellipse(CX, CY, RX, RY, 0, 0, 7); g.clip();
    g.strokeStyle = '#ffffff30'; g.lineWidth = 3;
    for (let k = 0; k < 3; k++) { g.beginPath(); for (let a = 0; a < 4.5; a += 0.15) { const rr = 0.2 + a * 0.17, x = CX + Math.cos(a + this.spin + k * 2.1) * RX * rr, y = CY + Math.sin(a + this.spin + k * 2.1) * RY * rr; a ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.restore();
    // floating herbs
    this.herbs.forEach((h, i) => {
      const [x, y] = this.herbPos(i);
      g.fillStyle = ITEMS[h].color; g.strokeStyle = '#2a1c10'; g.lineWidth = 2.5;
      g.save(); g.translate(x, y); g.rotate(this.spin + i);
      g.beginPath(); g.moveTo(-16, 0); g.quadraticCurveTo(0, -14, 16, 0); g.quadraticCurveTo(0, 14, -16, 0); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-12, 0); g.lineTo(12, 0); g.stroke();
      g.restore();
    });
    for (const bb of this.bubbles) { g.strokeStyle = '#ffffff90'; g.lineWidth = 1.5; g.fillStyle = `rgba(${r + 60},${gg + 60},${b + 60},0.5)`; g.beginPath(); g.arc(bb.x, bb.y, bb.r, 0, 7); g.fill(); g.stroke(); }
    // ladle following the mouse
    if (this.inside && this.msgT <= 0) { g.strokeStyle = '#8a5a2e'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(this.mx, this.my); g.lineTo(this.mx + 46, this.my - 120); g.stroke(); g.fillStyle = '#6a4a2e'; g.beginPath(); g.ellipse(this.mx, this.my, 13, 7, 0, 0, 7); g.fill(); }
    // stir progress
    if (this.herbs.length >= 2 && this.msgT <= 0) {
      g.strokeStyle = '#0008'; g.lineWidth = 8; g.beginPath(); g.ellipse(CX, CY, RX + 8, RY + 6, 0, 0, 7); g.stroke();
      g.strokeStyle = '#ffe070'; g.beginPath(); g.ellipse(CX, CY, RX + 8, RY + 6, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.stir)); g.stroke();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (this.msgT > 0) {
      g.globalAlpha = Math.min(1, this.msgT * 2, (3.2 - this.msgT) * 4);
      this.msg.forEach((m, i) => {
        g.font = i === 0 ? "900 24px 'Cinzel'" : "700 16px 'Alegreya Sans'";
        g.fillStyle = i === 0 ? (this.msgGood ? '#ffe070' : '#ff9a80') : '#f6ead0'; g.strokeStyle = '#14100c'; g.lineWidth = 5;
        const y = 44 + i * 26 - (3.2 - this.msgT) * 5;
        g.strokeText(m, CX, y); g.fillText(m, CX, y);
      });
      g.globalAlpha = 1;
    } else {
      g.font = "700 17px 'Alegreya Sans'"; g.fillStyle = '#5a3a1c';
      g.fillText(this.herbs.length < 2 ? `Drop in ${2 - this.herbs.length} more herb${this.herbs.length ? '' : 's'}` : 'Stir — circle the mouse in the pot (or hold Space)', CX, 40);
    }
  }
}
