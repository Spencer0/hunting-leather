// Timing minigame used at the tanner's bench: scraping a hide, stitching a seam.
import { audio } from './audio';

export interface MiniOpts {
  title: string;
  kind: 'scrape' | 'stitch';
  strokes: number;
  speed: number; // marker sweeps per second
  color: string; // material colour
  onDone: (score: number) => void;
}

const W = 600, H = 170;

export class Minigame {
  el: HTMLElement;
  done = false;
  private g: CanvasRenderingContext2D;
  private i = 0;
  private pos = 0.1;
  private dir = 1;
  private zone = 0.5;
  private results: number[] = [];
  private endT = -1;
  private flash = 0; private flashText = ''; private flashCol = '#fff';
  private clicked = false;
  private t = 0;
  private onDown = (e: Event) => { this.clicked = true; e.preventDefault(); };

  constructor(private o: MiniOpts) {
    this.el = document.createElement('div');
    this.el.id = 'benchmini';
    this.el.className = 'hud-box';
    this.el.innerHTML = `<h3 class="cz">${o.title}</h3><canvas width="${W * 2}" height="${H * 2}"></canvas><p><span class="k">Space</span> or click when the marker is in the gold</p>`;
    this.g = (this.el.querySelector('canvas') as HTMLCanvasElement).getContext('2d')!;
    this.g.scale(2, 2);
    this.newZone();
    setTimeout(() => window.addEventListener('mousedown', this.onDown), 250);
  }
  private half() { return Math.max(0.07, 0.13 - this.i * 0.015); }
  private newZone() { this.zone = 0.2 + Math.random() * 0.6; }
  destroy() { window.removeEventListener('mousedown', this.onDown); this.el.remove(); }

  tick(dt: number, press: boolean) {
    if (this.done) return;
    this.t += dt;
    press = press || this.clicked;
    this.clicked = false;
    this.flash = Math.max(0, this.flash - dt);
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.endT > 1.1) { this.done = true; this.o.onDone(this.score()); }
    } else {
      this.pos += this.dir * dt * this.o.speed * (1 + this.i * 0.18) * 2;
      if (this.pos > 1) { this.pos = 2 - this.pos; this.dir = -1; } else if (this.pos < 0) { this.pos = -this.pos; this.dir = 1; }
      if (press && this.t > 0.3) {
        const d = Math.abs(this.pos - this.zone), hw = this.half();
        const r = d < hw / 2.4 ? 1 : d < hw ? 0.6 : 0;
        this.results.push(r);
        this.flash = 0.6; this.flashText = r === 1 ? 'Perfect!' : r > 0 ? 'Good' : 'Slipped'; this.flashCol = r === 1 ? '#ffe070' : r > 0 ? '#c8f0a0' : '#ff8a70';
        audio.play(r > 0 ? (this.o.kind === 'scrape' ? 'skin' : 'craft') : 'error', { volume: 0.8 });
        this.i++;
        if (this.i >= this.o.strokes) { this.endT = 0; audio.play(this.score() >= 0.85 ? 'quest' : 'pickup'); } else this.newZone();
      }
    }
    this.draw();
  }
  score() { return this.results.length ? this.results.reduce((a, b) => a + b, 0) / this.o.strokes : 0; }

  private draw() {
    const g = this.g, o = this.o, n = o.strokes;
    g.clearRect(0, 0, W, H);
    // ---- art ----
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (o.kind === 'scrape') {
      // stretching frame
      g.strokeStyle = '#7a5230'; g.lineWidth = 9; g.strokeRect(14, 12, 146, 146);
      g.strokeStyle = '#e8d8b0'; g.lineWidth = 1.5;
      const hide: [number, number][] = [[40, 30], [70, 38], [104, 38], [134, 30], [126, 62], [140, 96], [128, 140], [100, 128], [74, 128], [46, 140], [34, 96], [48, 62]];
      for (const [x, y] of [hide[0], hide[3], hide[6], hide[9]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x < 87 ? 16 : 158, y < 85 ? 14 : 156); g.stroke(); }
      g.save();
      g.beginPath(); hide.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fillStyle = '#7a4a3a'; g.fill();
      g.clip();
      // cleaned strips
      for (let k = 0; k < this.results.length; k++) {
        const x0 = 30 + (k / n) * 114, w = 114 / n + 1;
        g.fillStyle = this.results[k] > 0 ? o.color : '#9a6a50';
        g.globalAlpha = this.results[k] === 1 ? 1 : 0.8;
        g.fillRect(x0, 0, w, H);
        if (this.results[k] === 0) { g.strokeStyle = '#5a3020'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 4, 60); g.lineTo(x0 + w - 4, 78); g.lineTo(x0 + 6, 96); g.stroke(); }
      }
      g.globalAlpha = 1;
      // fur flecks on the raw part
      g.fillStyle = '#5a3428';
      for (let k = 0; k < 60; k++) { const x = 30 + ((k * 37) % 114), y = 30 + ((k * 53) % 110); if (x > 30 + (this.results.length / n) * 114) g.fillRect(x, y, 2, 4); }
      g.restore();
      g.strokeStyle = '#2a1c10'; g.lineWidth = 3; g.beginPath(); hide.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
      // scraper
      if (this.endT < 0) {
        const x = 30 + ((this.i + 0.5) / n) * 114, y = 40 + this.pos * 90;
        g.fillStyle = '#c8d0d8'; g.strokeStyle = '#2a1c10'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x - 12, y); g.quadraticCurveTo(x, y + 9, x + 12, y); g.lineTo(x + 12, y - 4); g.lineTo(x - 12, y - 4); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#7a5230'; g.fillRect(x - 15, y - 10, 30, 7); g.strokeRect(x - 15, y - 10, 30, 7);
      }
    } else {
      // two panels and a seam
      g.fillStyle = o.color; g.strokeStyle = '#2a1c10'; g.lineWidth = 3;
      g.beginPath(); g.roundRect(18, 20, 66, 130, 10); g.fill(); g.stroke();
      g.beginPath(); g.roundRect(90, 20, 66, 130, 10); g.fill(); g.stroke();
      g.fillStyle = '#00000022'; g.fillRect(84, 22, 6, 126);
      for (let k = 0; k < n; k++) {
        const y = 36 + (k / (n - 1 || 1)) * 98;
        g.fillStyle = '#2a1c10'; g.beginPath(); g.arc(78, y, 2, 0, 7); g.arc(96, y, 2, 0, 7); g.fill();
        if (k < this.results.length) {
          const r = this.results[k];
          g.strokeStyle = r === 1 ? '#ffe9a0' : r > 0 ? '#e8d090' : '#b06a50'; g.lineWidth = 3.5;
          g.beginPath(); g.moveTo(78, y); g.lineTo(96, y + (r === 0 ? 9 : 0)); g.stroke();
        }
      }
      if (this.endT < 0) {
        const y = 36 + (this.i / (n - 1 || 1)) * 98, x = 100 + this.pos * 30;
        g.strokeStyle = '#d8dce0'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 34, y - 20); g.stroke();
        g.strokeStyle = '#e8d090'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 34, y - 20); g.quadraticCurveTo(x + 50, y, x + 44, y + 24); g.stroke();
      }
    }
    // ---- timing bar ----
    const bx = 196, bw = 384, by = 66, bh = 30;
    g.fillStyle = '#0009'; g.strokeStyle = '#c79a3c'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(bx, by, bw, bh, 10); g.fill(); g.stroke();
    if (this.endT < 0) {
      const hw = this.half();
      g.fillStyle = '#e0b040aa'; g.beginPath(); g.roundRect(bx + (this.zone - hw) * bw, by + 3, hw * 2 * bw, bh - 6, 6); g.fill();
      g.fillStyle = '#ffe9a0'; g.beginPath(); g.roundRect(bx + (this.zone - hw / 2.4) * bw, by + 3, (hw / 1.2) * bw, bh - 6, 5); g.fill();
      const mx = bx + this.pos * bw;
      g.fillStyle = '#fff'; g.strokeStyle = '#2a1c10'; g.lineWidth = 2;
      g.beginPath(); g.roundRect(mx - 4, by - 7, 8, bh + 14, 4); g.fill(); g.stroke();
    }
    // stroke pips
    for (let k = 0; k < n; k++) {
      const r = this.results[k];
      g.fillStyle = r === undefined ? '#ffffff30' : r === 1 ? '#ffe070' : r > 0 ? '#a8d870' : '#e06a50';
      g.beginPath(); g.arc(bx + 12 + k * 26, by + bh + 26, 8, 0, 7); g.fill();
      if (k === this.i && this.endT < 0) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (this.endT >= 0) {
      const s = this.score();
      g.font = "900 26px 'Cinzel'"; g.fillStyle = s >= 0.85 ? '#ffe070' : s >= 0.35 ? '#f6ead0' : '#ff9a80';
      const good = o.kind === 'scrape' ? ['Ragged work', 'A clean hide', 'Perfect tan!'] : ['Rough stitching', 'Solid work', 'Fine craftsmanship!'];
      g.fillText(good[s >= 0.85 ? 2 : s >= 0.35 ? 1 : 0], bx + bw / 2, by + bh / 2);
    } else if (this.flash > 0) {
      g.globalAlpha = Math.min(1, this.flash * 3);
      g.font = "900 22px 'Cinzel'"; g.fillStyle = this.flashCol;
      g.fillText(this.flashText, bx + bw / 2, by - 26 - (0.6 - this.flash) * 14);
      g.globalAlpha = 1;
    }
  }
}
