// Fishing minigame: wait for the bite, track the fish with the mouse, land it with a key sequence.
// Drawn as a living cross-section of the lake: sky and far bank above, the fish and the bed below.
import { audio } from './audio';
import { ITEMS } from './data';
import { input } from './input';

export interface FishResult { fish: string | null; weight: number; perfect: boolean }
export interface FishOpts {
  fish: [string, string, string]; // common, uncommon, rare
  luck: number; // shifts the odds toward rarer fish
  quick?: boolean; // bites come sooner
  crude?: boolean; // crooked starter rod: slow bites, small ring, no rare fish
  patient?: number; line?: number; // perk ranks
  water?: number; night?: number; // lake colour, 0..1 darkness
  onPhase: (anim: string) => void;
  onDone: (r: FishResult) => void;
}
type Phase = 'wait' | 'bite' | 'track' | 'qte' | 'end';
const W = 720, H = 400, SURF = 98, BED = H - 30;
const KEYS = ['W', 'A', 'S', 'D'] as const;
const TAU = Math.PI * 2;

interface Look { h: number; pat: 'spots' | 'stripes' | 'plain' | 'patches'; whisk?: boolean; long?: boolean }
const LOOKS: Record<string, Look> = {
  f_trout: { h: 0.2, pat: 'spots' }, f_perch: { h: 0.27, pat: 'stripes' }, f_catfish: { h: 0.23, pat: 'plain', whisk: true },
  f_carp: { h: 0.28, pat: 'plain' }, f_pike: { h: 0.13, pat: 'spots', long: true }, f_leafscale: { h: 0.25, pat: 'stripes' },
  f_barbel: { h: 0.18, pat: 'plain', whisk: true }, f_sunfish: { h: 0.34, pat: 'plain' }, f_koi: { h: 0.24, pat: 'patches' },
  f_char: { h: 0.2, pat: 'spots' }, f_salmon: { h: 0.21, pat: 'plain' }, f_sturgeon: { h: 0.14, pat: 'stripes', long: true, whisk: true },
};
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
function mix(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return '#' + ((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0');
}
const RARITY = [['Common', '#bfe0a0'], ['Uncommon', '#8ad0ff'], ['Rare', '#ffd866']] as const;

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
  private fx = -80; private fy = 250; private fvx = 60; private fvy = 0; private fang = 0; private goalX = W / 2; private goalY = 220; private goalT = 0;
  private mx = W / 2; private my = 220;
  private prog = 0.3; private on = false;
  private seq: string[] = []; private qi = 0; private qt = 0; private mistakes = 0; private qMax = 1.3; private wrong = 0;
  private msg = ''; private msgCol = '#fff'; private msgT = 0;
  private result: FishResult = { fish: null, weight: 0, perfect: false };
  private clicked = false;
  private nibble = 0; private nibbleAt = 0.8 + Math.random() * 1.5;
  private water: string; private night: number; private ring: number;
  // little things that make the water feel alive
  private bubbles: { x: number; y: number; r: number; v: number; ph: number }[] = [];
  private motes: { x: number; y: number; ph: number }[] = [];
  private shoal: { x: number; y: number; v: number; s: number }[] = [];
  private drops: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private rings: { x: number; r: number; life: number }[] = [];
  private sparks: { x: number; y: number; vx: number; vy: number; life: number; col: string }[] = [];
  private weeds: { x: number; h: number; ph: number; col: string }[] = [];
  private rocks: { x: number; w: number; h: number }[] = [];
  private onDown = (e: Event) => { this.clicked = true; e.preventDefault(); };
  private onMove = (e: MouseEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.mx = ((e.clientX - r.left) / r.width) * W; this.my = ((e.clientY - r.top) / r.height) * H;
  };

  constructor(private o: FishOpts) {
    this.el = document.createElement('div');
    this.el.id = 'benchmini';
    this.el.className = 'hud-box fishing';
    this.el.innerHTML = `<canvas width="${W * 2}" height="${H * 2}"></canvas><p></p>`;
    this.canvas = this.el.querySelector('canvas') as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(2, 2);
    this.water = hex(o.water ?? 0x3f9fb8); this.night = o.night ?? 0;
    this.ring = o.crude ? 40 : 50;
    setTimeout(() => window.addEventListener('mousedown', this.onDown), 300);
    window.addEventListener('mousemove', this.onMove);
    if (o.quick) this.waitFor *= 0.5;
    if (o.crude) this.waitFor *= 1.45;
    this.waitFor *= 1 - (o.patient ?? 0) * 0.2;
    for (let i = 0; i < 14; i++) this.bubbles.push({ x: Math.random() * W, y: SURF + Math.random() * (H - SURF), r: 1.5 + Math.random() * 3, v: 14 + Math.random() * 22, ph: Math.random() * 6 });
    for (let i = 0; i < 40; i++) this.motes.push({ x: Math.random() * W, y: SURF + 10 + Math.random() * (H - SURF - 20), ph: Math.random() * 6 });
    for (let i = 0; i < 6; i++) this.shoal.push({ x: Math.random() * W, y: SURF + 50 + Math.random() * 190, v: (14 + Math.random() * 20) * (Math.random() < 0.5 ? -1 : 1), s: 0.35 + Math.random() * 0.3 });
    for (let i = 0; i < 17; i++) this.weeds.push({ x: 14 + Math.random() * (W - 28), h: 34 + Math.random() * 78, ph: Math.random() * 6, col: ['#2f7a4a', '#3f8f52', '#256a52', '#4a9a4a'][i % 4] });
    for (let i = 0; i < 9; i++) this.rocks.push({ x: Math.random() * W, w: 26 + Math.random() * 60, h: 10 + Math.random() * 22 });
    o.onPhase('Fishing_Cast');
    audio.play('throw', { volume: 0.5 });
    setTimeout(() => { if (this.phase === 'wait') { o.onPhase('Fishing_Idle'); audio.play('splash', { volume: 0.4 }); this.splash(W / 2, 8); } }, 500);
    this.setHelp();
  }
  destroy() { window.removeEventListener('mousedown', this.onDown); window.removeEventListener('mousemove', this.onMove); this.el.remove(); }
  private setHelp() {
    const k = (s: string) => `<span class="k">${s}</span>`;
    this.el.querySelector('p')!.innerHTML = this.phase === 'wait' || this.phase === 'bite' ? `Wait for the float to go under, then ${k('Space')} or click to strike`
      : this.phase === 'track' ? 'Keep the ring on the fish with the <b>mouse</b> to tire it out'
      : this.phase === 'qte' ? 'Land it! Press each key as it lights up' : '&nbsp;';
  }
  private go(p: Phase) { this.phase = p; this.pt = 0; this.setHelp(); }
  private say(m: string, col = '#fff') { this.msg = m; this.msgCol = col; this.msgT = 1.3; }
  private fail(why: string) {
    this.say(why, '#ffb098');
    this.result = { fish: null, weight: 0, perfect: false };
    audio.play('error');
    this.o.onPhase('Fishing_Idle');
    this.go('end');
  }
  private splash(x: number, n: number) {
    for (let i = 0; i < n; i++) this.drops.push({ x: x + (Math.random() - 0.5) * 16, y: SURF, vx: (Math.random() - 0.5) * 150, vy: -90 - Math.random() * 170, life: 0.9 });
    this.rings.push({ x, r: 6, life: 1 });
  }
  private sparkle(x: number, y: number, n: number, col: string) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 40 + Math.random() * 150; this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, col }); }
  }
  private get fishLen() { return (LOOKS[this.fishId]?.long ? 104 : 82) + this.rarity * 24; }

  tick(dt: number, press: boolean) {
    if (this.done) return;
    this.t += dt; this.pt += dt; this.msgT = Math.max(0, this.msgT - dt); this.wrong = Math.max(0, this.wrong - dt);
    press = press || this.clicked;
    this.clicked = false;
    const hard = this.rarity; // 0,1,2
    const HX = W / 2, HY = SURF + 92;
    switch (this.phase) {
      case 'wait': {
        if (this.pt > this.nibbleAt && this.pt < this.waitFor - 0.5) { this.nibble = 0.4; this.nibbleAt = this.pt + 0.9 + Math.random() * 1.6; audio.play('step_wood', { volume: 0.15, rate: 1.8 }); this.rings.push({ x: HX, r: 6, life: 0.7 }); }
        this.nibble = Math.max(0, this.nibble - dt);
        // a shadow circles the bait, darting in to test it
        const a = this.t * 0.7, close = this.nibble > 0 ? 0.12 : Math.max(0.35, 1 - this.pt / this.waitFor);
        const tx = HX + Math.cos(a) * 190 * close + 26, ty = HY + 14 + Math.sin(a * 1.3) * 46 * close;
        const px = this.fx, py = this.fy;
        this.fx += (tx - this.fx) * Math.min(1, dt * (this.nibble > 0 ? 7 : 2.2)); this.fy += (ty - this.fy) * Math.min(1, dt * 2.5);
        this.fvx = (this.fx - px) / dt; this.fvy = (this.fy - py) / dt;
        if (press && this.pt > 1) {
          this.early++;
          if (this.early >= 2) { this.fail('You scared it off'); break; }
          this.say('Too soon!', '#ffc0a0'); this.waitFor = this.pt + 1.5 + Math.random() * 2; audio.play('error', { volume: 0.5 });
        }
        if (this.pt >= this.waitFor) {
          const r = Math.random() - this.o.luck * 0.12;
          this.rarity = this.o.crude ? (r < 0.12 ? 1 : 0) : r < 0.07 ? 2 : r < 0.35 ? 1 : 0;
          this.fishId = this.o.fish[this.rarity];
          audio.play('splash'); this.o.onPhase('Fishing_Bite');
          this.splash(HX, 16);
          this.go('bite');
        }
        break;
      }
      case 'bite': {
        this.fx += (HX + 20 - this.fx) * Math.min(1, dt * 12); this.fy += (HY + 26 - this.fy) * Math.min(1, dt * 12);
        this.fvx = -40; this.fvy = 30;
        if (press) {
          this.prog = 0.32;
          audio.play('bow_draw', { volume: 0.6 }); this.o.onPhase('Fishing_Reeling');
          this.say('Hooked!', '#ffe070');
          this.sparkle(this.fx, this.fy, 14, '#ffe9a0');
          this.go('track');
        } else if (this.pt > 0.95) this.fail('Too slow — it took the bait');
        break;
      }
      case 'track': {
        // fish wanders between goals; rarer fish are faster and jerkier
        this.goalT -= dt;
        if (this.goalT <= 0 || Math.hypot(this.goalX - this.fx, this.goalY - this.fy) < 24) {
          this.goalT = 0.5 + Math.random() * (1.3 - hard * 0.3);
          this.goalX = 70 + Math.random() * (W - 140); this.goalY = SURF + 44 + Math.random() * (BED - SURF - 100);
        }
        const sp = 165 + hard * 60, dx = this.goalX - this.fx, dy = this.goalY - this.fy, d = Math.hypot(dx, dy) || 1;
        this.fvx += ((dx / d) * sp - this.fvx) * Math.min(1, dt * 3.5); this.fvy += ((dy / d) * sp - this.fvy) * Math.min(1, dt * 3.5);
        this.fx += this.fvx * dt; this.fy += this.fvy * dt;
        // keyboard can steer the ring too
        this.mx = Math.max(10, Math.min(W - 10, this.mx + (input.key('ArrowRight') ? 1 : input.key('ArrowLeft') ? -1 : 0) * 340 * dt));
        this.my = Math.max(SURF + 10, Math.min(H - 10, this.my + (input.key('ArrowDown') ? 1 : input.key('ArrowUp') ? -1 : 0) * 340 * dt));
        this.on = Math.hypot(this.mx - this.fx, this.my - this.fy) < this.ring + 6;
        this.prog += dt * (this.on ? (this.o.crude ? 0.3 : 0.36) - hard * 0.04 : -(0.24 + hard * 0.04) * (1 - (this.o.line ?? 0) * 0.18));
        if (this.on && Math.random() < dt * 14) this.sparks.push({ x: this.mx + (Math.random() - 0.5) * this.ring * 2, y: this.my + (Math.random() - 0.5) * this.ring * 2, vx: 0, vy: -30, life: 0.5, col: '#ffe9a0' });
        if (Math.random() < dt * 9) this.bubbles.push({ x: this.fx, y: this.fy, r: 1.5 + Math.random() * 2.5, v: 40 + Math.random() * 30, ph: Math.random() * 6 });
        if (this.prog >= 1) {
          const n = 3 + hard;
          this.seq = [];
          while (this.seq.length < n) { const k = KEYS[Math.floor(Math.random() * 4)]; if (k !== this.seq[this.seq.length - 1]) this.seq.push(k); }
          this.qi = 0; this.qMax = 1.5 - hard * 0.15; this.qt = this.qMax + 0.4; this.mistakes = 0;
          audio.play('ui_open'); this.o.onPhase('Fishing_Struggling');
          this.splash(W / 2, 14);
          this.go('qte');
        } else if (this.prog <= 0) this.fail('The line went slack');
        break;
      }
      case 'qte': {
        this.qt -= dt;
        this.fx += (W / 2 + Math.sin(this.t * 9) * 46 - this.fx) * Math.min(1, dt * 8); this.fy += (SURF + 16 + Math.cos(this.t * 13) * 8 - this.fy) * Math.min(1, dt * 8);
        this.fvx = Math.cos(this.t * 9) * 200; this.fvy = Math.sin(this.t * 13) * 60;
        if (Math.random() < dt * 10) this.splash(this.fx + (Math.random() - 0.5) * 40, 3);
        const hit = input.keyHit('KeyW') || input.uiUp() ? 'W' : input.keyHit('KeyA') || input.uiLeft() ? 'A' : input.keyHit('KeyS') || input.uiDown() ? 'S' : input.keyHit('KeyD') || input.uiRight() ? 'D' : '';
        if (hit) {
          if (hit === this.seq[this.qi]) {
            const n = this.seq.length, x0 = W / 2 - (n * 76) / 2 + 38;
            this.sparkle(x0 + this.qi * 76, H - 92, 10, '#c8f0a0');
            this.qi++; this.qt = this.qMax; audio.play('ui_select', { rate: 1 + this.qi * 0.12 });
            if (this.qi >= this.seq.length) {
              const it = ITEMS[this.fishId];
              const weight = Math.round(it.weight * (0.7 + Math.random() * 0.9) * 22) / 10;
              this.result = { fish: this.fishId, weight, perfect: this.mistakes === 0 && this.early === 0 };
              audio.play(this.rarity === 2 ? 'levelup' : 'quest'); this.o.onPhase('Fishing_Catch');
              this.splash(this.fx, 26);
              this.go('end');
            }
          } else { this.mistakes++; this.qt -= 0.4; this.wrong = 0.3; this.say('Wrong key!', '#ffc0a0'); audio.play('error', { volume: 0.5 }); }
        }
        if (this.phase === 'qte' && this.qt <= 0) this.fail('It threw the hook');
        break;
      }
      case 'end':
        if (this.result.fish) {
          if (this.pt < dt * 1.5) this.sparkle(W / 2, 190, 30, RARITY[this.rarity][1]);
          if (this.rarity && Math.random() < dt * 16) this.sparkle(W / 2 + (Math.random() - 0.5) * 300, 190 + (Math.random() - 0.5) * 120, 1, RARITY[this.rarity][1]);
        } else { this.fx -= 260 * dt; this.fy += 30 * dt; this.fvx = -260; this.fvy = 30; }
        if (this.pt > (this.result.fish ? 2.6 : 1.5) || (press && this.pt > 0.9)) { this.done = true; this.o.onDone(this.result); }
        break;
    }
    // ambient motion
    const want = Math.atan2(this.fvy, this.fvx);
    let da = (want - this.fang) % TAU; if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU;
    this.fang += da * Math.min(1, dt * 9);
    for (const b of this.bubbles) { b.y -= b.v * dt; b.x += Math.sin(this.t * 2 + b.ph) * 8 * dt; }
    this.bubbles = this.bubbles.filter((b, i) => b.y > SURF + 2 || (i < 14 && ((b.y = H + Math.random() * 30), (b.x = Math.random() * W), true)));
    for (const f of this.shoal) { f.x += f.v * dt; if (f.x < -60) f.x = W + 50; if (f.x > W + 60) f.x = -50; }
    for (const d of this.drops) { d.vy += 520 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt; }
    this.drops = this.drops.filter((d) => d.life > 0 && d.y <= SURF + 2);
    for (const r of this.rings) { r.r += 46 * dt; r.life -= dt * 0.8; }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const s of this.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 1 - 3 * dt; s.vy *= 1 - 3 * dt; s.life -= dt; }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    this.draw();
  }

  // ---------- drawing ----------
  private drawFish(x: number, y: number, ang: number, L: number, id: string, shadow: boolean, alpha = 1) {
    const g = this.g, lk = LOOKS[id] ?? { h: 0.2, pat: 'plain' as const }, col = ITEMS[id]?.color ?? '#88a';
    const hb = L * lk.h, t = this.t, wag = Math.sin(t * 11) * 0.45;
    g.save(); g.translate(x, y); g.rotate(ang); if (Math.cos(ang) < 0) g.scale(1, -1);
    g.globalAlpha = alpha;
    const dark = shadow ? '#06202e' : mix(col, '#101820', 0.55), light = shadow ? '#06202e' : mix(col, '#ffffff', 0.6), fin = shadow ? '#06202e' : mix(col, '#201008', 0.3);
    if (shadow) g.globalAlpha = alpha * 0.55;
    const body = () => {
      g.beginPath(); g.moveTo(L * 0.5, 0);
      g.bezierCurveTo(L * 0.36, -hb * 1.25, -L * 0.18, -hb * 1.05, -L * 0.44, -hb * 0.16);
      g.lineTo(-L * 0.44, hb * 0.16);
      g.bezierCurveTo(-L * 0.18, hb * 1.0, L * 0.34, hb * 1.15, L * 0.5, 0);
      g.closePath();
    };
    // tail
    g.save(); g.translate(-L * 0.42, 0); g.rotate(wag);
    g.fillStyle = fin; g.beginPath(); g.moveTo(L * 0.04, 0); g.quadraticCurveTo(-L * 0.1, -hb * 0.3, -L * 0.26, -hb * 1.25); g.quadraticCurveTo(-L * 0.17, 0, -L * 0.26, hb * 1.25); g.quadraticCurveTo(-L * 0.1, hb * 0.3, L * 0.04, 0); g.fill();
    g.restore();
    // dorsal + belly fins
    g.fillStyle = fin;
    g.beginPath(); g.moveTo(L * 0.16, -hb * 0.9); g.quadraticCurveTo(L * 0.04, -hb * 1.55, -L * 0.2, -hb * 1.3); g.lineTo(-L * 0.16, -hb * 0.7); g.fill();
    g.beginPath(); g.moveTo(-L * 0.08, hb * 0.8); g.lineTo(-L * 0.2, hb * 1.45); g.lineTo(-L * 0.24, hb * 0.6); g.fill();
    // body
    if (!shadow) { const gr = g.createLinearGradient(0, -hb, 0, hb); gr.addColorStop(0, dark); gr.addColorStop(0.45, col); gr.addColorStop(1, light); g.fillStyle = gr; } else g.fillStyle = dark;
    body(); g.fill();
    if (!shadow) {
      g.save(); body(); g.clip();
      g.fillStyle = mix(col, '#000000', 0.45);
      if (lk.pat === 'stripes') for (let i = 0; i < 6; i++) { g.globalAlpha = alpha * 0.4; g.beginPath(); g.ellipse(-L * 0.3 + i * L * 0.12, -hb * 0.4, L * 0.02, hb * 0.9, 0.15, 0, TAU); g.fill(); }
      else if (lk.pat === 'spots') for (let i = 0; i < 16; i++) { g.globalAlpha = alpha * 0.45; g.beginPath(); g.arc(-L * 0.36 + ((i * 37) % 70) / 100 * L, -hb * 0.85 + ((i * 53) % 90) / 100 * hb, L * 0.013 + (i % 3) * 0.6, 0, TAU); g.fill(); }
      else if (lk.pat === 'patches') { g.fillStyle = '#e8742a'; g.globalAlpha = alpha * 0.9; for (const [px, py, r] of [[0.2, -0.5, 0.11], [-0.1, -0.2, 0.14], [-0.3, 0.2, 0.08], [0.32, 0.3, 0.06]]) { g.beginPath(); g.ellipse(L * px, hb * py, L * r, hb * r * 4.4, 0.3, 0, TAU); g.fill(); } }
      else { g.globalAlpha = alpha * 0.16; g.strokeStyle = '#000'; g.lineWidth = 1; for (let i = 0; i < 9; i++) for (let j = -2; j <= 2; j++) { g.beginPath(); g.arc(-L * 0.36 + i * L * 0.08 + (j & 1) * L * 0.04, j * hb * 0.36, L * 0.045, -0.9, 0.9); g.stroke(); } }
      // sheen
      g.globalAlpha = alpha * 0.35; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(L * 0.05, -hb * 0.55, L * 0.3, hb * 0.16, 0, 0, TAU); g.fill();
      g.restore();
      g.globalAlpha = alpha;
      g.strokeStyle = mix(col, '#000000', 0.7); g.lineWidth = 1.6; body(); g.stroke();
      // gill, pectoral fin, eye, mouth
      g.beginPath(); g.arc(L * 0.24, 0, hb * 0.72, -1.0, 1.0); g.stroke();
      g.fillStyle = fin; g.save(); g.translate(L * 0.14, hb * 0.3); g.rotate(0.5 + Math.sin(t * 8) * 0.35); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-L * 0.1, hb * 0.2, -L * 0.17, hb * 0.75); g.quadraticCurveTo(-L * 0.04, hb * 0.5, 0, 0); g.fill(); g.restore();
      const er = Math.max(2.6, hb * 0.2);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(L * 0.36, -hb * 0.26, er, 0, TAU); g.fill();
      g.fillStyle = '#10181c'; g.beginPath(); g.arc(L * 0.365, -hb * 0.26, er * 0.6, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(L * 0.375, -hb * 0.31, er * 0.22, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(L * 0.5, hb * 0.02); g.quadraticCurveTo(L * 0.45, hb * 0.2, L * 0.4, hb * 0.16); g.stroke();
      if (lk.whisk) for (const s of [0.5, 1]) { g.beginPath(); g.moveTo(L * 0.47, hb * 0.14); g.quadraticCurveTo(L * 0.5, hb * (0.7 + s * 0.4), L * (0.42 - s * 0.08), hb * (0.9 + s * 0.5) + Math.sin(t * 5 + s) * 2); g.stroke(); }
    }
    g.restore();
  }
  private keycap(x: number, y: number, s: number, label: string, state: 'todo' | 'cur' | 'done' | 'bad') {
    const g = this.g, top = state === 'done' ? '#b8e078' : state === 'bad' ? '#ff9a80' : state === 'cur' ? '#fffdf2' : '#c9c2ae', side = state === 'done' ? '#6a9a38' : state === 'bad' ? '#b04a30' : state === 'cur' ? '#b8a878' : '#857c66';
    g.globalAlpha = state === 'todo' ? 0.75 : 1;
    g.fillStyle = '#0006'; g.beginPath(); g.roundRect(x - s / 2 + 2, y - s / 2 + 9, s, s, s * 0.2); g.fill();
    g.fillStyle = side; g.beginPath(); g.roundRect(x - s / 2, y - s / 2 + 6, s, s, s * 0.2); g.fill();
    g.fillStyle = top; g.beginPath(); g.roundRect(x - s / 2, y - s / 2, s, s - 2, s * 0.2); g.fill();
    g.fillStyle = '#fff8'; g.beginPath(); g.roundRect(x - s / 2 + 5, y - s / 2 + 4, s - 10, s * 0.28, s * 0.12); g.fill();
    g.fillStyle = '#2a1c10'; g.font = `900 ${s * 0.52}px 'Alegreya Sans'`; g.fillText(state === 'done' ? '✓' : label, x, y + 1);
    g.globalAlpha = 1;
  }

  private draw() {
    const g = this.g, t = this.t, n = this.night;
    g.clearRect(0, 0, W, H);
    g.save(); g.beginPath(); g.roundRect(0, 0, W, H, 18); g.clip();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineCap = 'round'; g.lineJoin = 'round';
    // --- sky and far bank ---
    const sky = g.createLinearGradient(0, 0, 0, SURF);
    sky.addColorStop(0, mix('#6fbcec', '#0a1430', n)); sky.addColorStop(1, mix('#eaf6f4', '#2c4470', n));
    g.fillStyle = sky; g.fillRect(0, 0, W, SURF + 2);
    const sunX = 130, sunY = 40;
    const sg = g.createRadialGradient(sunX, sunY, 2, sunX, sunY, 90);
    sg.addColorStop(0, n > 0.5 ? '#f4f6ffee' : '#fffbe0ee'); sg.addColorStop(0.16, n > 0.5 ? '#dfe6ff55' : '#fff0a866'); sg.addColorStop(1, '#fff0');
    g.fillStyle = sg; g.fillRect(0, 0, W, SURF);
    for (let i = 0; i < 3; i++) { const cx = ((t * (5 + i * 2) + i * 290) % (W + 240)) - 120, cy = 22 + i * 16; g.fillStyle = mix('#ffffff', '#5a6a90', n); g.globalAlpha = 0.75; g.beginPath(); g.ellipse(cx, cy, 46, 9, 0, 0, TAU); g.ellipse(cx + 26, cy - 6, 30, 10, 0, 0, TAU); g.ellipse(cx - 24, cy - 4, 24, 8, 0, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    const hills = (y0: number, amp: number, f: number, col: string, trees: boolean) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, SURF);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 - (Math.sin(x * f + 1) + Math.sin(x * f * 2.3 + 2) * 0.5) * amp);
      g.lineTo(W, SURF); g.fill();
      if (trees) for (let x = 6; x < W; x += 13) { const yy = y0 - (Math.sin(x * f + 1) + Math.sin(x * f * 2.3 + 2) * 0.5) * amp, hh = 9 + ((x * 7) % 9); g.beginPath(); g.moveTo(x - 6, yy + 2); g.lineTo(x, yy - hh); g.lineTo(x + 6, yy + 2); g.fill(); }
    };
    hills(SURF - 26, 9, 0.011, mix(mix('#8fb8a8', this.water, 0.25), '#16243c', n), false);
    hills(SURF - 9, 6, 0.019, mix('#3f7a52', '#0c1a26', n * 0.9), true);
    // --- water body ---
    const wg = g.createLinearGradient(0, SURF, 0, H);
    wg.addColorStop(0, mix(mix(this.water, '#ffffff', 0.3), '#0a2038', n * 0.7)); wg.addColorStop(0.45, mix(this.water, '#06141f', 0.35 + n * 0.3)); wg.addColorStop(1, mix(this.water, '#030a12', 0.82));
    g.fillStyle = wg; g.fillRect(0, SURF, W, H - SURF);
    // light shafts
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 137 + Math.sin(t * 0.3 + i) * 40) % W + W) % W, w = 26 + (i % 3) * 22, lean = 90 + Math.sin(t * 0.4 + i * 2) * 20;
      const lg = g.createLinearGradient(0, SURF, 0, H); lg.addColorStop(0, `rgba(255,255,230,${0.13 * (1 - n * 0.7)})`); lg.addColorStop(1, 'rgba(255,255,230,0)');
      g.fillStyle = lg; g.beginPath(); g.moveTo(x, SURF); g.lineTo(x + w, SURF); g.lineTo(x + w * 2.2 - lean, H); g.lineTo(x - w - lean, H); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // distant shoal
    for (const f of this.shoal) this.drawFish(f.x, f.y + Math.sin(t + f.x * 0.02) * 5, f.v > 0 ? 0 : Math.PI, 44 * f.s, 'f_trout', true, 0.5);
    // bed: sand, rocks, weed
    g.fillStyle = mix('#c8b88a', this.water, 0.55); g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 12) g.lineTo(x, BED + Math.sin(x * 0.021) * 7 + Math.sin(x * 0.067 + 1) * 3);
    g.lineTo(W, H); g.fill();
    for (const r of this.rocks) { const ry = BED + Math.sin(r.x * 0.021) * 7 + 4; const rg = g.createLinearGradient(0, ry - r.h, 0, ry + 4); rg.addColorStop(0, mix('#8a9aa0', this.water, 0.4)); rg.addColorStop(1, mix('#2a3840', this.water, 0.3)); g.fillStyle = rg; g.beginPath(); g.ellipse(r.x, ry, r.w / 2, r.h, 0, Math.PI, 0); g.fill(); }
    for (const w of this.weeds) {
      const by = BED + Math.sin(w.x * 0.021) * 7 + 3, sway = Math.sin(t * 1.2 + w.ph) * 12 + Math.sin(t * 2.7 + w.ph * 2) * 4;
      g.strokeStyle = mix(w.col, this.water, 0.25); g.lineWidth = 5;
      g.beginPath(); g.moveTo(w.x, by); g.bezierCurveTo(w.x - sway * 0.3, by - w.h * 0.4, w.x + sway, by - w.h * 0.7, w.x + sway * 1.5, by - w.h); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.moveTo(w.x + 5, by); g.bezierCurveTo(w.x + 9 + sway * 0.2, by - w.h * 0.3, w.x - 4 + sway * 0.7, by - w.h * 0.5, w.x + 8 + sway, by - w.h * 0.72); g.stroke();
    }
    // motes and bubbles
    g.fillStyle = '#ffffff';
    for (const m of this.motes) { g.globalAlpha = 0.12 + Math.sin(t * 1.5 + m.ph) * 0.08; g.beginPath(); g.arc((m.x + t * 6 + Math.sin(t + m.ph) * 10) % W, m.y + Math.sin(t * 0.7 + m.ph) * 6, 1.3, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    for (const b of this.bubbles) { g.strokeStyle = '#ffffff88'; g.lineWidth = 1.2; g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.stroke(); g.fillStyle = '#ffffff55'; g.beginPath(); g.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, TAU); g.fill(); }

    // --- rod, line, float ---
    const taut = this.phase === 'track' ? 1 - this.prog : this.phase === 'qte' || this.phase === 'bite' ? 1 : 0;
    const tipX = W - 150, tipY = 16 + taut * 22 + Math.sin(t * 30) * (this.phase === 'qte' ? 3 : 0);
    const HX = W / 2, under = this.phase === 'bite';
    const floatY = SURF + Math.sin(t * 2.2) * 2.5 + (this.nibble > 0 ? 5 : 0) + (under ? 26 : 0);
    const reeling = this.phase === 'track' || this.phase === 'qte';
    const mouthX = this.fx + Math.cos(this.fang) * this.fishLen * 0.48, mouthY = this.fy + Math.sin(this.fang) * this.fishLen * 0.48;
    if (this.phase !== 'end') {
      const lx = reeling ? mouthX : HX, ly = reeling ? mouthY : floatY - 10;
      g.strokeStyle = reeling ? mix('#f4f0e0', '#ff5a40', Math.max(0, taut - 0.45) * 1.8) : '#f4f0e0'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(tipX, tipY); g.quadraticCurveTo((tipX + lx) / 2, (tipY + ly) / 2 + (reeling ? Math.sin(t * 40) * taut * 3 : 26), lx, ly); g.stroke();
    }
    // rod: the starter rod is a crooked switch, the proper pole has a reel
    g.strokeStyle = this.o.crude ? '#7a6a48' : '#8a5a2e'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(W + 12, 78);
    if (this.o.crude) g.bezierCurveTo(W - 40, 70, W - 70, 22, tipX + 46, 36 + taut * 10); else g.quadraticCurveTo(W - 60, 40, tipX + 46, 28 + taut * 10);
    g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(tipX + 46, (this.o.crude ? 36 : 28) + taut * 10); g.quadraticCurveTo(tipX + 20, 16 + taut * 16, tipX, tipY); g.stroke();
    if (!this.o.crude) { g.fillStyle = '#55504a'; g.beginPath(); g.arc(W - 22, 66, 9, 0, TAU); g.fill(); g.fillStyle = '#c8c0b0'; g.beginPath(); g.arc(W - 22 + Math.cos(t * (reeling ? 14 : 0)) * 5, 66 + Math.sin(t * (reeling ? 14 : 0)) * 5, 2.5, 0, TAU); g.fill(); }

    // --- the fish ---
    if (this.phase === 'wait' || this.phase === 'bite') {
      // hook and worm under the float
      g.strokeStyle = '#f4f0e088'; g.lineWidth = 1; g.beginPath(); g.moveTo(HX, floatY + 8); g.lineTo(HX, SURF + 84 + (under ? 24 : 0)); g.stroke();
      const hy = SURF + 86 + (under ? 24 : 0);
      g.strokeStyle = '#c8d0d8'; g.lineWidth = 2; g.beginPath(); g.arc(HX + 4, hy, 4.5, 0.2, Math.PI + 0.6); g.stroke();
      g.strokeStyle = '#e88a9a'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(HX, hy + 3); g.quadraticCurveTo(HX - 6 + Math.sin(t * 6) * 3, hy + 9, HX - 1, hy + 14 + Math.sin(t * 7) * 1.5); g.stroke();
      this.drawFish(this.fx, this.fy, this.fang, 78, 'f_trout', true, 0.9);
    } else if (this.phase === 'track' || this.phase === 'qte') {
      this.drawFish(this.fx, this.fy, this.fang, this.fishLen, this.fishId, false);
    } else if (!this.result.fish && this.pt < 1.2) this.drawFish(this.fx, this.fy, this.fang, this.fishLen || 78, this.fishId || 'f_trout', !this.fishId, 1 - this.pt / 1.2);

    // --- surface: waves, ripples, reeds, spray ---
    g.strokeStyle = mix('#ffffff', '#8aa0c8', n); g.lineWidth = 2.5; g.globalAlpha = 0.85;
    g.beginPath(); for (let x = 0; x <= W; x += 6) { const y = SURF + Math.sin(x * 0.045 + t * 1.6) * 1.8 + Math.sin(x * 0.11 - t * 2.1) * 1; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.globalAlpha = 0.25; g.lineWidth = 6; g.beginPath(); for (let x = 0; x <= W; x += 6) { const y = SURF + 5 + Math.sin(x * 0.045 + t * 1.6 + 1) * 2; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.globalAlpha = 1;
    for (const r of this.rings) { g.strokeStyle = `rgba(255,255,255,${r.life * 0.8})`; g.lineWidth = 2; g.beginPath(); g.ellipse(r.x, SURF + 1, r.r, r.r * 0.18, 0, 0, TAU); g.stroke(); }
    for (const sx of [18, 34, 52, W - 20, W - 40]) {
      const sw = Math.sin(t * 1.1 + sx) * 5, top = SURF - 44 - (sx % 17);
      g.strokeStyle = mix('#5a8a3a', '#14261c', n * 0.8); g.lineWidth = 3; g.beginPath(); g.moveTo(sx, SURF + 60); g.quadraticCurveTo(sx, SURF, sx + sw, top); g.stroke();
      g.strokeStyle = mix('#6a4a2a', '#1a1410', n * 0.8); g.lineWidth = 7; g.beginPath(); g.moveTo(sx + sw * 0.8, top + 12); g.lineTo(sx + sw, top + 1); g.stroke();
    }
    if (this.phase === 'wait' || this.phase === 'bite') {
      // float
      g.fillStyle = '#fff'; g.strokeStyle = '#2a1c10'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(HX, floatY, 9, 12, 0, 0, Math.PI); g.fill(); g.stroke();
      g.fillStyle = '#e8402c'; g.beginPath(); g.ellipse(HX, floatY, 9, 12, 0, Math.PI, 0); g.fill(); g.stroke();
      g.strokeStyle = '#2a1c10'; g.lineWidth = 3; g.beginPath(); g.moveTo(HX, floatY - 12); g.lineTo(HX, floatY - 22); g.stroke();
      g.fillStyle = '#fff6'; g.beginPath(); g.ellipse(HX - 3, floatY - 6, 2, 4, 0.3, 0, TAU); g.fill();
    }
    g.fillStyle = '#e8f6ff';
    for (const d of this.drops) { g.globalAlpha = Math.min(1, d.life * 2); g.beginPath(); g.arc(d.x, d.y, 2.2, 0, TAU); g.fill(); }
    g.globalAlpha = 1;

    // --- phase overlays ---
    if (under) {
      const s = 1 + Math.sin(t * 22) * 0.12, bx = HX, by = SURF - 46;
      g.save(); g.translate(bx, by); g.scale(s, s);
      g.fillStyle = '#ffd23a'; g.strokeStyle = '#2a1c10'; g.lineWidth = 4;
      g.beginPath(); for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU + t * 1.5, r = i % 2 ? 26 : 40; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#2a1c10'; g.font = "900 44px 'Cinzel'"; g.fillText('!', 0, 2);
      g.restore();
    }
    if (this.phase === 'track') {
      const on = this.on, R = this.ring;
      g.save(); g.translate(this.mx, this.my);
      if (on) { const gl = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 1.5); gl.addColorStop(0, '#ffe07000'); gl.addColorStop(0.7, '#ffe07044'); gl.addColorStop(1, '#ffe07000'); g.fillStyle = gl; g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill(); }
      g.strokeStyle = '#0008'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
      g.strokeStyle = on ? '#ffe070' : '#ffffffcc'; g.lineWidth = 4; g.setLineDash([14, 9]); g.lineDashOffset = -t * (on ? 60 : 14);
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke(); g.setLineDash([]);
      g.strokeStyle = this.prog > 0.25 ? '#a8e070' : '#ff7a58'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, R + 9, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, Math.min(1, this.prog))); g.stroke();
      g.restore();
    }
    if (this.phase === 'track' || this.phase === 'qte') {
      // tug-of-war meter along the top
      const v = this.phase === 'track' ? Math.max(0, Math.min(1, this.prog)) : Math.max(0, this.qt / this.qMax), bw = 300, bx = W / 2 - bw / 2, by = 18;
      g.fillStyle = '#0a1a24cc'; g.beginPath(); g.roundRect(bx - 4, by - 4, bw + 8, 22, 11); g.fill();
      const mg = g.createLinearGradient(bx, 0, bx + bw, 0);
      if (this.phase === 'track') { mg.addColorStop(0, '#ff7a58'); mg.addColorStop(0.3, '#ffd866'); mg.addColorStop(1, '#a8e070'); } else { mg.addColorStop(0, '#ff9a58'); mg.addColorStop(1, '#ffe070'); }
      g.fillStyle = mg; g.beginPath(); g.roundRect(bx, by, Math.max(14, bw * v), 14, 7); g.fill();
      g.fillStyle = '#fff5'; g.beginPath(); g.roundRect(bx + 3, by + 2, Math.max(8, bw * v - 6), 4, 2); g.fill();
      g.font = "700 12px 'Cinzel'"; g.fillStyle = '#fff'; g.fillText(this.phase === 'track' ? 'TIRE IT OUT' : 'LAND IT!', W / 2, by + 30);
    }
    if (this.phase === 'qte') {
      const cnt = this.seq.length, x0 = W / 2 - (cnt * 76) / 2 + 38, y = H - 92;
      for (let i = 0; i < cnt; i++) {
        const cur = i === this.qi, shake = cur && this.wrong > 0 ? Math.sin(t * 70) * 5 : 0;
        this.keycap(x0 + i * 76 + shake, y - (cur ? 6 + Math.sin(t * 9) * 3 : 0), cur ? 66 : 54, this.seq[i], i < this.qi ? 'done' : cur ? (this.wrong > 0 ? 'bad' : 'cur') : 'todo');
        if (cur) { g.strokeStyle = '#ffe070'; g.lineWidth = 5; g.beginPath(); g.arc(x0 + i * 76, y - 4, 46, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, Math.min(1, this.qt / this.qMax))); g.stroke(); }
      }
    }
    if (this.phase === 'end' && this.result.fish) {
      // the catch card
      const it = ITEMS[this.result.fish], k = Math.min(1, this.pt / 0.35), e = 1 - Math.pow(1 - k, 3), [rn, rc] = RARITY[this.rarity];
      g.fillStyle = `rgba(4,14,22,${0.55 * e})`; g.fillRect(0, 0, W, H);
      g.save(); g.translate(W / 2, 196); g.scale(0.6 + e * 0.4, 0.6 + e * 0.4); g.globalAlpha = e;
      g.globalCompositeOperation = 'lighter';
      const rg = g.createRadialGradient(0, 0, 60, 0, 0, 340); rg.addColorStop(0, rc + (this.rarity ? '66' : '33')); rg.addColorStop(1, rc + '00');
      g.fillStyle = rg;
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + t * 0.35; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 340, a, a + 0.1); g.fill(); }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#0006'; g.beginPath(); g.roundRect(-212, -108, 430, 230, 20); g.fill();
      const pg = g.createLinearGradient(0, -115, 0, 115); pg.addColorStop(0, '#fbf1d8'); pg.addColorStop(1, '#e6d2a4');
      g.fillStyle = pg; g.strokeStyle = rc; g.lineWidth = 5; g.beginPath(); g.roundRect(-215, -115, 430, 230, 20); g.fill(); g.stroke();
      g.strokeStyle = '#8a6a3a55'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(-205, -105, 410, 210, 14); g.stroke();
      g.restore();
      g.globalAlpha = e;
      this.drawFish(W / 2, 168 + Math.sin(t * 3) * 3, -0.12 + Math.sin(t * 5) * 0.05, 190 + this.rarity * 20, this.result.fish, false, e);
      g.fillStyle = '#2a1c10'; g.font = "900 30px 'Cinzel'"; g.fillText(it.name, W / 2, 250);
      g.font = "700 18px 'Alegreya Sans'"; g.fillStyle = '#5a4020'; g.fillText(`${this.result.weight} lb${this.result.perfect ? '  ·  clean catch' : ''}`, W / 2, 280);
      g.fillStyle = '#2a1c10'; g.beginPath(); g.roundRect(W / 2 - 78, 66, 156, 30, 15); g.fill();
      g.fillStyle = rc; g.font = "900 15px 'Cinzel'"; g.fillText(`${'★'.repeat(this.rarity + 1)} ${rn.toUpperCase()}`, W / 2, 82);
      g.globalAlpha = 1;
    }
    for (const s of this.sparks) {
      g.globalAlpha = Math.min(1, s.life * 2.5); g.fillStyle = s.col;
      const r = 2 + s.life * 6;
      g.beginPath(); g.moveTo(s.x, s.y - r); g.quadraticCurveTo(s.x, s.y, s.x + r, s.y); g.quadraticCurveTo(s.x, s.y, s.x, s.y + r); g.quadraticCurveTo(s.x, s.y, s.x - r, s.y); g.quadraticCurveTo(s.x, s.y, s.x, s.y - r); g.fill();
    }
    g.globalAlpha = 1;
    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72); vg.addColorStop(0, '#0000'); vg.addColorStop(1, '#000a');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if ((this.msgT > 0 && this.phase !== 'end') || (this.phase === 'end' && !this.result.fish)) {
      const a = this.phase === 'end' ? 1 : Math.min(1, this.msgT * 3), pop = 1 + Math.max(0, this.msgT - 1.1) * 2.5;
      g.save(); g.translate(W / 2, this.phase === 'end' ? 200 : SURF + 34); g.scale(pop, pop); g.globalAlpha = a;
      g.font = "900 34px 'Cinzel'"; g.fillStyle = this.msgCol; g.strokeStyle = '#0a1a24'; g.lineWidth = 7;
      g.strokeText(this.msg, 0, 0); g.fillText(this.msg, 0, 0);
      g.restore();
    }
    g.restore();
  }
}
