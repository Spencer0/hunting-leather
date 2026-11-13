// Fishing minigame: wait for the bite, track the fish with the mouse, land it with a key sequence.
import { audio } from './audio';
import { ITEMS } from './data';
import { input } from './input';

export interface FishResult { fish: string | null; weight: number; perfect: boolean }
export interface FishOpts {
  fish: [string, string, string]; // common, uncommon, rare
  luck: number; // 0..1 shifts the odds toward rarer fish
  onPhase: (anim: string) => void;
  onDone: (r: FishResult) => void;
}
type Phase = 'wait' | 'bite' | 'track' | 'qte' | 'end';
const W = 600, H = 240;
const KEYS = ['W', 'A', 'S', 'D'] as const;

export class Fishing {
  el: HTMLElement;
  done = false;
  private g: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private phase: Phase = 'wait';
  private t = 0; private pt = 0; // total time, time in phase
  private waitFor = 2 + Math.random() * 3.2;
  private early = 0;
  private rarity = 0; private fishId = '';
  private fx = W / 2; private fy = 120; private fvx = 0; private fvy = 0; private goalX = W / 2; private goalY = 120; private goalT = 0;
  private mx = W / 2; private my = 120;
  private prog = 0.3;
  private seq: string[] = []; private qi = 0; private qt = 0; private mistakes = 0; private qMax = 1.3;
  private msg = ''; private msgCol = '#fff'; private msgT = 0;
  private result: FishResult = { fish: null, weight: 0, perfect: false };
  private clicked = false;
  private nibble = 0; private nibbleAt = 0.8 + Math.random() * 1.5;
  private onDown = (e: Event) => { this.clicked = true; e.preventDefault(); };
  private onMove = (e: MouseEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.mx = ((e.clientX - r.left) / r.width) * W; this.my = ((e.clientY - r.top) / r.height) * H;
  };

  constructor(private o: FishOpts) {
    this.el = document.createElement('div');
    this.el.id = 'benchmini';
    this.el.className = 'hud-box fishing';
    this.el.innerHTML = `<h3 class="cz">Fishing</h3><canvas width="${W * 2}" height="${H * 2}"></canvas><p></p>`;
    this.canvas = this.el.querySelector('canvas') as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(2, 2);
    setTimeout(() => window.addEventListener('mousedown', this.onDown), 300);
    window.addEventListener('mousemove', this.onMove);
    o.onPhase('Fishing_Cast');
    audio.play('throw', { volume: 0.5 });
    setTimeout(() => { if (this.phase === 'wait') { o.onPhase('Fishing_Idle'); audio.play('splash', { volume: 0.4 }); } }, 900);
    this.setHelp();
  }
  destroy() { window.removeEventListener('mousedown', this.onDown); window.removeEventListener('mousemove', this.onMove); this.el.remove(); }
  private setHelp() {
    const k = (s: string) => `<span class="k">${s}</span>`;
    this.el.querySelector('p')!.innerHTML = this.phase === 'wait' || this.phase === 'bite' ? `Wait for the bobber to go under, then ${k('Space')} or click to strike`
      : this.phase === 'track' ? 'Keep the ring on the fish with the <b>mouse</b> to tire it out'
      : this.phase === 'qte' ? 'Land it! Press each key as it lights up' : '&nbsp;';
  }
  private go(p: Phase) { this.phase = p; this.pt = 0; this.setHelp(); }
  private say(m: string, col = '#fff') { this.msg = m; this.msgCol = col; this.msgT = 1.2; }
  private fail(why: string) {
    this.say(why, '#ff9a80');
    this.result = { fish: null, weight: 0, perfect: false };
    audio.play('error');
    this.o.onPhase('Fishing_Idle');
    this.go('end');
  }

  tick(dt: number, press: boolean) {
    if (this.done) return;
    this.t += dt; this.pt += dt; this.msgT = Math.max(0, this.msgT - dt);
    press = press || this.clicked;
    this.clicked = false;
    const hard = this.rarity; // 0,1,2
    switch (this.phase) {
      case 'wait': {
        if (this.pt > this.nibbleAt && this.pt < this.waitFor - 0.5) { this.nibble = 0.35; this.nibbleAt = this.pt + 0.9 + Math.random() * 1.6; audio.play('step_wood', { volume: 0.15, rate: 1.8 }); }
        this.nibble = Math.max(0, this.nibble - dt);
        if (press && this.pt > 1) {
          this.early++;
          if (this.early >= 2) { this.fail('You scared it off'); break; }
          this.say('Too soon!', '#ffc0a0'); this.waitFor = this.pt + 1.5 + Math.random() * 2; audio.play('error', { volume: 0.5 });
        }
        if (this.pt >= this.waitFor) {
          const r = Math.random() - this.o.luck * 0.12;
          this.rarity = r < 0.07 ? 2 : r < 0.35 ? 1 : 0;
          this.fishId = this.o.fish[this.rarity];
          audio.play('splash'); this.o.onPhase('Fishing_Bite');
          this.go('bite');
        }
        break;
      }
      case 'bite': {
        if (press) {
          this.fx = W / 2; this.fy = 120; this.prog = 0.32;
          audio.play('bow_draw', { volume: 0.6 }); this.o.onPhase('Fishing_Reeling');
          this.say('Hooked!', '#ffe070');
          this.go('track');
        } else if (this.pt > 0.95) this.fail('Too slow — it took the bait');
        break;
      }
      case 'track': {
        // fish wanders between goals; rarer fish are faster and jerkier
        this.goalT -= dt;
        if (this.goalT <= 0 || Math.hypot(this.goalX - this.fx, this.goalY - this.fy) < 20) {
          this.goalT = 0.5 + Math.random() * (1.3 - hard * 0.3);
          this.goalX = 60 + Math.random() * (W - 120); this.goalY = 50 + Math.random() * 130;
        }
        const sp = 150 + hard * 55, dx = this.goalX - this.fx, dy = this.goalY - this.fy, d = Math.hypot(dx, dy) || 1;
        this.fvx += ((dx / d) * sp - this.fvx) * Math.min(1, dt * 3.5); this.fvy += ((dy / d) * sp - this.fvy) * Math.min(1, dt * 3.5);
        this.fx += this.fvx * dt; this.fy += this.fvy * dt;
        // keyboard / stick can steer the ring too
        this.mx = Math.max(10, Math.min(W - 10, this.mx + input.lookX(dt) * 0 + (input.key('ArrowRight') ? 1 : input.key('ArrowLeft') ? -1 : 0) * 300 * dt));
        this.my = Math.max(30, Math.min(200, this.my + (input.key('ArrowDown') ? 1 : input.key('ArrowUp') ? -1 : 0) * 300 * dt));
        const on = Math.hypot(this.mx - this.fx, this.my - this.fy) < 44;
        this.prog += dt * (on ? 0.34 - hard * 0.04 : -0.24 - hard * 0.04);
        if (this.prog >= 1) {
          const n = 3 + hard;
          this.seq = [];
          while (this.seq.length < n) { const k = KEYS[Math.floor(Math.random() * 4)]; if (k !== this.seq[this.seq.length - 1]) this.seq.push(k); }
          this.qi = 0; this.qMax = 1.5 - hard * 0.15; this.qt = this.qMax + 0.4; this.mistakes = 0;
          audio.play('ui_open'); this.o.onPhase('Fishing_Struggling');
          this.go('qte');
        } else if (this.prog <= 0) this.fail('The line went slack');
        break;
      }
      case 'qte': {
        this.qt -= dt;
        const hit = input.keyHit('KeyW') || input.uiUp() ? 'W' : input.keyHit('KeyA') || input.uiLeft() ? 'A' : input.keyHit('KeyS') || input.uiDown() ? 'S' : input.keyHit('KeyD') || input.uiRight() ? 'D' : '';
        if (hit) {
          if (hit === this.seq[this.qi]) {
            this.qi++; this.qt = this.qMax; audio.play('ui_select', { rate: 1 + this.qi * 0.12 });
            if (this.qi >= this.seq.length) {
              const it = ITEMS[this.fishId];
              const weight = Math.round(it.weight * (0.7 + Math.random() * 0.9) * 22) / 10;
              this.result = { fish: this.fishId, weight, perfect: this.mistakes === 0 && this.early === 0 };
              this.say(`${it.name} — ${weight} lb`, this.rarity === 2 ? '#ffe070' : '#c8f0a0');
              audio.play(this.rarity === 2 ? 'levelup' : 'quest'); this.o.onPhase('Fishing_Catch');
              this.go('end');
            }
          } else { this.mistakes++; this.qt -= 0.4; this.say('Wrong way!', '#ffc0a0'); audio.play('error', { volume: 0.5 }); }
        }
        if (this.phase === 'qte' && this.qt <= 0) this.fail('It threw the hook');
        break;
      }
      case 'end':
        if (this.pt > 1.5) { this.done = true; this.o.onDone(this.result); }
        break;
    }
    this.draw();
  }

  private fishShape(x: number, y: number, ang: number, s: number, col: string) {
    const g = this.g;
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
    g.fillStyle = col; g.strokeStyle = '#0a2a3a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(22, 0); g.quadraticCurveTo(6, -13, -12, -4); g.lineTo(-24, -12); g.lineTo(-20, 0); g.lineTo(-24, 12); g.lineTo(-12, 4); g.quadraticCurveTo(6, 13, 22, 0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#0a2a3a'; g.beginPath(); g.arc(13, -2, 1.8, 0, 7); g.fill();
    g.restore();
  }

  private draw() {
    const g = this.g, t = this.t;
    g.clearRect(0, 0, W, H);
    // water
    const wg = g.createLinearGradient(0, 20, 0, 210);
    wg.addColorStop(0, '#3f9fb8'); wg.addColorStop(1, '#1f5f7a');
    g.fillStyle = wg; g.beginPath(); g.roundRect(4, 20, W - 8, 190, 14); g.fill();
    g.save(); g.beginPath(); g.roundRect(4, 20, W - 8, 190, 14); g.clip();
    g.strokeStyle = '#ffffff22'; g.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const y = 36 + i * 21, o = Math.sin(t * 0.8 + i) * 16; g.beginPath(); g.moveTo(30 + o + (i % 3) * 120, y); g.quadraticCurveTo(80 + o + (i % 3) * 120, y - 5, 130 + o + (i % 3) * 120, y); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (this.phase === 'wait' || this.phase === 'bite') {
      const under = this.phase === 'bite';
      const by = 110 + Math.sin(t * 2.2) * 3 + (this.nibble > 0 ? 5 : 0) + (under ? 16 : 0);
      // ripples
      g.strokeStyle = '#ffffff66'; g.lineWidth = 2;
      for (let k = 0; k < (under ? 3 : 1); k++) { const r = 14 + ((t * (under ? 60 : 14) + k * 22) % 60); g.globalAlpha = 1 - r / 74; g.beginPath(); g.ellipse(W / 2, 118, r, r * 0.4, 0, 0, 7); g.stroke(); }
      g.globalAlpha = 1;
      g.strokeStyle = '#f4f0e0'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2, by - 12); g.lineTo(W / 2 + 60, 14); g.stroke();
      g.fillStyle = '#fff'; g.strokeStyle = '#2a1c10'; g.lineWidth = 2;
      g.beginPath(); g.arc(W / 2, by, 11, 0, Math.PI); g.fill(); g.stroke();
      g.fillStyle = '#e04a3a'; g.beginPath(); g.arc(W / 2, by, 11, Math.PI, 0); g.fill(); g.stroke();
      if (under) { g.font = "900 54px 'Cinzel'"; g.fillStyle = '#ffe070'; g.strokeStyle = '#2a1c10'; g.lineWidth = 5; g.strokeText('!', W / 2, 62); g.fillText('!', W / 2, 62); }
      else { g.font = "700 17px 'Alegreya Sans'"; g.fillStyle = '#ffffffaa'; g.fillText('…', W / 2, 62); }
    } else if (this.phase === 'track') {
      const on = Math.hypot(this.mx - this.fx, this.my - this.fy) < 44;
      this.fishShape(this.fx, this.fy, Math.atan2(this.fvy, this.fvx), 1.25 + this.rarity * 0.3, '#12384a');
      g.strokeStyle = on ? '#ffe070' : '#ffffffaa'; g.lineWidth = 4; g.beginPath(); g.arc(this.mx, this.my, 36, 0, 7); g.stroke();
      g.strokeStyle = '#f4f0e0aa'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(this.fx, this.fy); g.lineTo(W / 2 + 60, 14); g.stroke();
    } else if (this.phase === 'qte') {
      this.fishShape(W / 2 + Math.sin(t * 22) * 6, 78 + Math.cos(t * 17) * 4, Math.sin(t * 14) * 0.5, 1.6 + this.rarity * 0.3, ITEMS[this.fishId].color);
      const n = this.seq.length, x0 = W / 2 - (n * 58) / 2 + 29;
      for (let i = 0; i < n; i++) {
        const cur = i === this.qi, donek = i < this.qi;
        g.fillStyle = donek ? '#a8d870' : cur ? '#fff' : '#ffffff55'; g.strokeStyle = '#2a1c10'; g.lineWidth = 3;
        const s = cur ? 50 : 42;
        g.beginPath(); g.roundRect(x0 + i * 58 - s / 2, 158 - s / 2, s, s, 9); g.fill(); g.stroke();
        g.fillStyle = '#2a1c10'; g.font = `900 ${cur ? 28 : 22}px 'Alegreya Sans'`; g.fillText(donek ? '✓' : this.seq[i], x0 + i * 58, 159);
      }
    } else if (this.result.fish) {
      this.fishShape(W / 2, 100, -0.25, 2.4, ITEMS[this.result.fish].color);
    }
    g.restore();
    // meters
    if (this.phase === 'track' || this.phase === 'qte') {
      const v = this.phase === 'track' ? this.prog : Math.max(0, this.qt / this.qMax);
      g.fillStyle = '#0009'; g.beginPath(); g.roundRect(4, 216, W - 8, 16, 8); g.fill();
      g.fillStyle = this.phase === 'track' ? (v > 0.25 ? '#a8d870' : '#e06a50') : '#ffe070';
      g.beginPath(); g.roundRect(6, 218, Math.max(8, (W - 12) * Math.min(1, v)), 12, 6); g.fill();
    }
    if (this.msgT > 0 || this.phase === 'end') {
      g.globalAlpha = this.phase === 'end' ? 1 : Math.min(1, this.msgT * 3);
      g.font = "900 26px 'Cinzel'"; g.fillStyle = this.msgCol; g.strokeStyle = '#0a1a24'; g.lineWidth = 5;
      const y = this.phase === 'end' ? 176 : 40;
      g.strokeText(this.msg, W / 2, y); g.fillText(this.msg, W / 2, y);
      g.globalAlpha = 1;
    }
  }
}
