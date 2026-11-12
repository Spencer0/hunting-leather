// WebAudio: sample SFX, synthesised SFX, procedural music and ambience.
import { ZONES } from './data';

export type Mood = 'none' | 'title' | 'town' | 'wild' | 'night' | 'danger';
type P3 = { x: number; y: number; z: number };
interface PlayOpts { volume?: number; rate?: number; pos?: P3; delay?: number }
interface Ambience { night: number; water: number; fire: number; wind: number; snow: boolean; town: number; birds: number }

const seq = (prefix: string, n: number, start = 0, pad = 3) =>
  Array.from({ length: n }, (_, i) => prefix + String(i + start).padStart(pad, '0'));
const num = (prefix: string, ids: number[]) => ids.map((i) => prefix + i);

// sfx name -> [files, volume, pitch variation]
const SAMPLES: Record<string, [string[], number, number]> = {
  step_grass: [seq('footstep_grass_', 5), 0.5, 0.12],
  step_snow: [seq('footstep_snow_', 5), 0.55, 0.1],
  step_wood: [seq('footstep_wood_', 5), 0.5, 0.1],
  step_dirt: [[...seq('footstep_concrete_', 5), ...seq('footstep', 5, 0, 2)], 0.4, 0.12],
  bow_draw: [num('creak', [1, 2, 3]), 0.35, 0.1],
  throw: [num('woosh', [1, 2, 3, 4, 5, 6, 7, 8]), 0.6, 0.12],
  hit_flesh: [[...seq('impactSoft_heavy_', 5), ...seq('impactPunch_medium_', 5)], 0.9, 0.1],
  hit_wood: [seq('impactWood_medium_', 5), 0.8, 0.1],
  hit_ground: [[...seq('impactSoft_medium_', 5), ...seq('impactPlank_medium_', 3)], 0.6, 0.12],
  skin: [['knifeSlice', 'knifeSlice2', 'cloth1', 'cloth2', 'cloth3', 'cloth4'], 0.7, 0.1],
  draw_knife: [num('drawKnife', [1, 2, 3]), 0.6, 0.05],
  craft: [['handleSmallLeather', 'handleSmallLeather2', 'beltHandle1', 'beltHandle2', 'chop'], 0.8, 0.08],
  tan: [['dropLeather', 'cloth1', 'cloth3'], 0.8, 0.08],
  coins: [['handleCoins', 'handleCoins2'], 0.8, 0.05],
  ui_move: [num('rollover', [1, 2, 3, 4, 5, 6]), 0.25, 0.04],
  ui_select: [num('click', [1, 2, 3, 4, 5]), 0.5, 0.04],
  ui_back: [num('switch', [2, 3, 4]), 0.4, 0.04],
  ui_open: [['bookOpen'], 0.7, 0],
  ui_close: [['bookClose'], 0.7, 0],
  ui_page: [num('bookFlip', [1, 2, 3]), 0.6, 0.05],
  pickup: [num('pickup', [1, 2, 3, 4]), 0.6, 0.06],
  equip: [['clothBelt', 'clothBelt2'], 0.7, 0.05],
  door: [['doorOpen_1', 'doorOpen_2'], 0.6, 0.05],
  // helpers used by composite sounds
  _click: [['metalClick'], 0.6, 0.05],
  _latch: [['metalLatch'], 0.7, 0.05],
  _punch: [seq('impactPunch_heavy_', 5), 0.9, 0.08],
  _woosh: [num('woosh', [2, 4, 6]), 0.5, 0.1],
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

class AudioSys {
  private ctx: AudioContext | null = null;
  private master!: GainNode; private sfxBus!: GainNode; private musicBus!: GainNode; private ambBus!: GainNode;
  private musicDuck!: GainNode; private reverb!: GainNode; private noise!: AudioBuffer;
  private buffers = new Map<string, AudioBuffer>();
  private vol = { master: 0.8, music: 0.6, sfx: 0.9 };
  private lp: P3 = { x: 0, y: 0, z: 0 }; private yaw = 0;
  private voices = 0;
  private lastPlayed = new Map<string, number>();
  // music
  private mood: Mood = 'none'; private zone = 'greenhollow';
  private moodGain: GainNode | null = null;
  private nextStep = 0; private step = 0; private motif: number[] = []; private melDeg = 4; private prog: number[] = [0, 3, 4, 0];
  private duckAmt = 0;
  // ambience
  private amb: Ambience = { night: 0, water: 0, fire: 0, wind: 0.2, snow: false, town: 0, birds: 0 };
  private windG!: GainNode; private windF!: BiquadFilterNode; private waterG!: GainNode; private townG!: GainNode;
  private tBird = 2; private tCricket = 1; private tOwl = 20; private tFire = 0; private tGust = 0;

  async init(onProgress?: (f: number) => void): Promise<void> {
    try {
      if (!this.ctx) this.setup();
    } catch { return; }
    const ctx = this.ctx!;
    const files = [...new Set(Object.values(SAMPLES).flatMap((s) => s[0]))];
    let done = 0;
    await Promise.all(files.map(async (f) => {
      try {
        const res = await fetch(new URL(`assets/audio/${f}.ogg`, document.baseURI).href);
        if (res.ok) this.buffers.set(f, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch { /* skipped */ }
      onProgress?.(++done / files.length);
    }));
  }

  private setup() {
    const AC: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = (this.ctx = new AC());
    const g = (v: number, to: AudioNode) => { const n = ctx.createGain(); n.gain.value = v; n.connect(to); return n; };
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.connect(ctx.destination);
    this.master = g(this.vol.master, comp);
    this.sfxBus = g(this.vol.sfx, this.master);
    this.musicBus = g(this.vol.music * 0.5, this.master);
    this.ambBus = g(this.vol.sfx * 0.6, this.master);
    this.musicDuck = g(1, this.musicBus);
    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // reverb: generated impulse
    const conv = ctx.createConvolver();
    const il = (ctx.sampleRate * 2.6) | 0;
    const imp = ctx.createBuffer(2, il, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = imp.getChannelData(c);
      for (let i = 0; i < il; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / il, 2.8);
    }
    conv.buffer = imp;
    const wet = g(0.5, this.master);
    conv.connect(wet);
    this.reverb = ctx.createGain(); this.reverb.connect(conv);
    // continuous ambience beds
    const bed = (type: BiquadFilterType, freq: number, q: number, rate: number) => {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = rate;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const gn = g(0, this.ambBus);
      src.connect(f); f.connect(gn); src.start();
      return [gn, f] as const;
    };
    [this.windG, this.windF] = bed('bandpass', 420, 0.7, 0.7);
    const [wg, wf] = bed('bandpass', 1500, 1.2, 1.3);
    this.waterG = wg;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 3.1;
    const lg = ctx.createGain(); lg.gain.value = 500; lfo.connect(lg); lg.connect(wf.frequency); lfo.start();
    [this.townG] = bed('lowpass', 320, 0.5, 0.45);
  }

  resume() {
    try {
      if (!this.ctx) this.setup();
      if (this.ctx!.state !== 'running') void this.ctx!.resume();
    } catch { /* no audio */ }
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.vol = { master, music, sfx };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(music * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(sfx * 0.6, t, 0.05);
  }

  setListener(pos: P3, yaw: number) { this.lp = { x: pos.x, y: pos.y, z: pos.z }; this.yaw = yaw; }

  duck(amount: number) { this.duckAmt = Math.max(this.duckAmt, clamp01(amount)); }

  // ---------- SFX ----------
  private spatial(pos?: P3): [number, number] {
    if (!pos) return [1, 0];
    const dx = pos.x - this.lp.x, dy = pos.y - this.lp.y, dz = pos.z - this.lp.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 90) return [0, 0];
    const att = Math.min(1, 6 / Math.max(6, d)) * (1 - d / 90);
    // right vector of a camera with this yaw (three.js convention: forward = (-sin, 0, -cos))
    const pan = d < 0.5 ? 0 : Math.max(-1, Math.min(1, ((dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw)) / d) * 0.8));
    return [att, pan];
  }

  /** Output node for a one-shot; returns null when inaudible. */
  private out(vol: number, pos?: P3, bus: AudioNode = this.sfxBus, rev = 0): GainNode | null {
    const ctx = this.ctx!;
    const [att, pan] = this.spatial(pos);
    if (att * vol < 0.004) return null;
    const gn = ctx.createGain(); gn.gain.value = vol * att;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan; gn.connect(p); p.connect(bus);
    } else gn.connect(bus);
    if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; gn.connect(s); s.connect(this.reverb); }
    return gn;
  }

  private sample(name: string, o: PlayOpts = {}) {
    const def = SAMPLES[name];
    if (!def || this.voices > 28) return;
    const buf = this.buffers.get(pick(def[0]));
    if (!buf) return;
    const dst = this.out(def[1] * (o.volume ?? 1), o.pos);
    if (!dst) return;
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (o.rate ?? 1) * (1 + rnd(def[2], -def[2]));
    src.connect(dst);
    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(this.ctx!.currentTime + (o.delay ?? 0));
  }

  /** Oscillator voice with a pitch envelope and AD gain envelope. */
  private tone(dst: AudioNode, type: OscillatorType, t: number, dur: number, freqs: [number, number][], vol: number, attack = 0.01, vib = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freqs[0][1], t);
    for (const [ft, f] of freqs.slice(1)) o.frequency.exponentialRampToValueAtTime(Math.max(1, f), t + ft * dur);
    if (vib > 0) {
      const l = ctx.createOscillator(); l.frequency.value = 5.5 + rnd(1.5);
      const lg = ctx.createGain(); lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dst);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Filtered noise burst with filter sweep. */
  private burst(dst: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, attack = 0.01) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dst);
    src.start(t, rnd(1.5)); src.stop(t + dur + 0.05);
  }

  private bell(dst: AudioNode, t: number, midi: number, vol: number, dur = 1.4) {
    const f = mtof(midi);
    this.tone(dst, 'sine', t, dur, [[0, f]], vol, 0.005);
    this.tone(dst, 'sine', t, dur * 0.5, [[0, f * 2.01]], vol * 0.35, 0.005);
    this.tone(dst, 'triangle', t, dur * 0.25, [[0, f * 3]], vol * 0.12, 0.003);
  }

  private arp(notes: number[], gap: number, vol: number, dur: number, rev = 0.5) {
    const dst = this.out(vol, undefined, this.sfxBus, rev);
    if (!dst) return;
    const t = this.ctx!.currentTime + 0.02;
    notes.forEach((n, i) => this.bell(dst, t + i * gap, n, 0.5, dur));
  }

  play(name: string, o: PlayOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    try {
      // throttle identical UI/step spam
      const now = ctx.currentTime, last = this.lastPlayed.get(name) ?? -1;
      if (now - last < 0.03) return;
      this.lastPlayed.set(name, now);
      if (SAMPLES[name] && !name.startsWith('_')) { this.sample(name, o); return; }
      if (this.voices > 40) return;
      const v = o.volume ?? 1, t = now + (o.delay ?? 0) + 0.005, r = o.rate ?? 1;
      const dst = (vol: number, rev = 0) => this.out(vol * v, o.pos, this.sfxBus, rev);
      let d: GainNode | null;
      switch (name) {
        case 'bow_release':
          if ((d = dst(0.7))) {
            this.tone(d, 'triangle', t, 0.22, [[0, 240 * r], [1, 110 * r]], 0.6, 0.002);
            this.tone(d, 'sine', t, 0.12, [[0, 720 * r], [1, 360 * r]], 0.2, 0.002);
          }
          this.sample('_woosh', { ...o, volume: v * 0.7, rate: 1.3 });
          break;
        case 'xbow_fire':
          if ((d = dst(0.9))) {
            this.tone(d, 'sine', t, 0.16, [[0, 150], [1, 50]], 0.9, 0.002);
            this.burst(d, t, 0.09, 'bandpass', 1800, 500, 1, 0.5, 0.002);
          }
          this.sample('_click', o);
          this.sample('_woosh', { ...o, volume: v * 0.8, rate: 1.5 });
          break;
        case 'xbow_reload':
          this.sample('bow_draw', { ...o, rate: 0.8 });
          this.sample('_click', { ...o, delay: (o.delay ?? 0) + 0.35 });
          this.sample('_latch', { ...o, delay: (o.delay ?? 0) + 0.7 });
          break;
        case 'equip':
          this.sample('equip', o); break;
        case 'error':
          if ((d = dst(0.25))) {
            this.tone(d, 'square', t, 0.12, [[0, 130]], 0.4, 0.01);
            this.tone(d, 'square', t + 0.13, 0.16, [[0, 98]], 0.4, 0.01);
          }
          break;
        case 'levelup': this.arp([60, 64, 67, 72, 76, 79, 84], 0.085, 0.5 * v, 1.6); break;
        case 'quest': this.arp([67, 72, 76], 0.1, 0.4 * v, 1.1); break;
        case 'legendary':
          this.arp([48, 55, 60, 64, 67, 72, 76, 79, 84, 88], 0.11, 0.55 * v, 2.4, 0.8);
          if ((d = dst(0.35, 0.8))) for (const n of [48, 55, 64]) this.tone(d, 'sawtooth', t, 2.6, [[0, mtof(n)]], 0.16, 0.5);
          break;
        case 'sleep': this.arp([79, 76, 72, 67, 64, 60], 0.32, 0.3 * v, 2.2, 0.9); break;
        case 'hurt':
          this.sample('_punch', o);
          if ((d = dst(0.6))) this.tone(d, 'sine', t, 0.22, [[0, 160], [1, 55]], 0.8, 0.004);
          break;
        case 'death':
          if ((d = dst(0.7, 0.7))) {
            this.tone(d, 'sawtooth', t, 2.4, [[0, 73], [1, 49]], 0.3, 0.05);
            this.tone(d, 'sine', t, 2.6, [[0, 55], [1, 36]], 0.7, 0.02);
            this.burst(d, t, 1.2, 'lowpass', 600, 80, 0.5, 0.3, 0.01);
          }
          break;
        case 'growl':
          if ((d = dst(0.7, 0.1))) {
            this.tone(d, 'sawtooth', t, 0.75, [[0, 85 * r], [0.4, 105 * r], [1, 70 * r]], 0.32, 0.08, 9);
            this.burst(d, t, 0.75, 'bandpass', 450, 300, 2, 0.5, 0.1);
          }
          break;
        case 'snort':
          if ((d = dst(0.5))) {
            this.burst(d, t, 0.16, 'bandpass', 1300 * r, 600 * r, 1.5, 0.8, 0.01);
            this.burst(d, t + 0.2, 0.22, 'bandpass', 1000 * r, 500 * r, 1.5, 0.5, 0.02);
          }
          break;
        case 'howl':
          if ((d = dst(0.5, 0.9))) {
            const b = 330 * r * rnd(1.08, 0.94);
            this.tone(d, 'sine', t, 1.7, [[0, b * 0.75], [0.25, b * 1.25], [0.7, b * 1.2], [1, b * 0.8]], 0.5, 0.25, 5);
            this.tone(d, 'triangle', t, 1.7, [[0, b * 1.5], [0.25, b * 2.5], [0.7, b * 2.4], [1, b * 1.6]], 0.08, 0.3, 8);
          }
          break;
        case 'bellow':
          if ((d = dst(0.8, 0.3))) {
            this.tone(d, 'sawtooth', t, 1.0, [[0, 70 * r], [0.3, 105 * r], [1, 62 * r]], 0.4, 0.1, 4);
            this.tone(d, 'square', t, 1.0, [[0, 140 * r], [0.3, 210 * r], [1, 124 * r]], 0.1, 0.12, 6);
            this.burst(d, t, 0.9, 'bandpass', 500, 250, 1, 0.25, 0.1);
          }
          break;
        case 'roar':
          if ((d = dst(1, 0.6))) {
            this.tone(d, 'sawtooth', t, 1.6, [[0, 60], [0.2, 95], [1, 42]], 0.45, 0.08, 7);
            this.tone(d, 'sawtooth', t, 1.6, [[0, 91], [0.2, 140], [1, 60]], 0.3, 0.1, 11);
            this.burst(d, t, 1.6, 'bandpass', 900, 250, 0.8, 0.8, 0.12);
            this.burst(d, t, 1.4, 'lowpass', 300, 90, 0.5, 0.6, 0.05);
          }
          break;
        case 'animal_death':
          if ((d = dst(0.5, 0.2))) {
            this.tone(d, 'triangle', t, 0.5, [[0, 520 * r], [1, 180 * r]], 0.35, 0.03, 12);
            this.burst(d, t + 0.1, 0.6, 'bandpass', 900, 300, 1, 0.4, 0.08);
          }
          break;
        case 'splash':
          if ((d = dst(0.7))) {
            this.burst(d, t, 0.5, 'bandpass', 600, 2600, 0.8, 0.9, 0.01);
            this.burst(d, t + 0.05, 0.8, 'highpass', 2500, 5000, 0.5, 0.25, 0.1);
          }
          break;
        default: break; // unknown: silent
      }
    } catch { /* never throw from audio */ }
  }

  // ---------- Music ----------
  setMusic(mood: Mood, zoneId?: string) {
    const z = zoneId && ZONES[zoneId] ? zoneId : this.zone;
    if (mood === this.mood && z === this.zone) return;
    this.mood = mood; this.zone = z;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.moodGain) {
      const old = this.moodGain;
      old.gain.cancelScheduledValues(t);
      old.gain.setTargetAtTime(0, t, 0.8);
      setTimeout(() => { try { old.disconnect(); } catch { /* gone */ } }, 6000);
    }
    this.moodGain = null;
    if (mood === 'none') return;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(1, t, 0.9);
    g.connect(this.musicDuck);
    const send = ctx.createGain(); send.gain.value = mood === 'danger' ? 0.25 : 0.6; g.connect(send); send.connect(this.reverb);
    this.moodGain = g;
    this.step = 0; this.nextStep = t + 0.3; this.motif = []; this.melDeg = 4;
    this.prog = pick(mood === 'danger' ? [[0, 0, 5, 4], [0, 6, 0, 4]] : [[0, 3, 4, 0], [0, 5, 3, 4], [0, 4, 5, 3], [0, 2, 3, 4]]);
  }

  /** Scale degree (may exceed one octave) -> midi. */
  private deg(d: number, oct = 0): number {
    const z = ZONES[this.zone] ?? ZONES.greenhollow;
    const sc = this.mood === 'danger' ? [0, 2, 3, 5, 7, 8, 10] : z.scale;
    const n = sc.length, o = Math.floor(d / n);
    return z.music + sc[((d % n) + n) % n] + 12 * (o + oct);
  }

  private chord(root: number): number[] { return [root, root + 2, root + 4]; }

  private pluck(t: number, midi: number, vol: number, dur = 1.1) {
    const g = this.moodGain!; const f = mtof(midi);
    this.tone(g, 'triangle', t, dur, [[0, f]], vol, 0.004);
    this.tone(g, 'sine', t, dur * 0.6, [[0, f * 2.003]], vol * 0.3, 0.004);
  }

  private pad(t: number, notes: number[], dur: number, vol: number, cutoff: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.4;
    const g = ctx.createGain();
    const a = Math.min(dur * 0.4, 1.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + dur - a * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
    f.connect(g); g.connect(this.moodGain!);
    for (const n of notes) for (const det of [-6, 5]) {
      const o = ctx.createOscillator(); o.type = det < 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = mtof(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 1.3);
    }
  }

  private flute(t: number, midi: number, dur: number, vol: number) {
    const g = this.moodGain!; const f = mtof(midi);
    this.tone(g, 'sine', t, dur, [[0, f * 0.985], [0.08, f], [1, f]], vol, 0.06, f * 0.006);
    this.tone(g, 'triangle', t, dur, [[0, f * 2]], vol * 0.08, 0.08);
    this.burst(g, t, Math.min(dur, 0.25), 'bandpass', f * 2, f * 2, 3, vol * 0.25, 0.03);
  }

  private drum(t: number, vol: number, low = true) {
    const g = this.moodGain!;
    if (low) this.tone(g, 'sine', t, 0.28, [[0, 110], [1, 48]], vol, 0.003);
    else this.burst(g, t, 0.07, 'bandpass', 2400, 1400, 1.5, vol * 0.6, 0.002);
  }

  private scheduleStep(t: number, s: number) {
    const m = this.mood;
    const bar = Math.floor(s / 16), b = s % 16;
    const root = this.prog[bar % 4];
    const ch = this.chord(root);
    const phrase = Math.floor(bar / 4);
    // melody motif: regenerate every 8 bars, vary answer phrases slightly
    const melody = (every: number, oct: number, len: number, vol: number, inst: 'flute' | 'pluck' | 'bell', stepDur: number) => {
      if (b % every !== 0) return;
      const idx = (bar % 2) * (16 / every) + b / every;
      if (this.motif.length === 0 || (s % 128 === 0 && b === 0)) {
        this.motif = [];
        let d = this.melDeg;
        for (let i = 0; i < 32; i++) {
          d = Math.max(0, Math.min(9, d + pick([-2, -1, -1, 0, 1, 1, 2])));
          this.motif.push(Math.random() < 0.3 ? -99 : d);
        }
        this.melDeg = d;
      }
      let d = this.motif[idx % this.motif.length];
      if (d === -99) return;
      if (phrase % 2 === 1 && bar % 4 === 3) d = b >= 8 ? root : d - 1; // cadence on answer phrase
      const n = this.deg(d, oct);
      if (inst === 'flute') this.flute(t, n, stepDur * len, vol);
      else if (inst === 'bell') this.bell(this.moodGain!, t, n, vol, 2.5);
      else this.pluck(t, n, vol, 1.4);
    };
    const spb = this.stepDur();
    if (m === 'title') {
      if (b === 0) this.pad(t, [this.deg(ch[0], -1), this.deg(ch[1], 0), this.deg(ch[2], 0), this.deg(ch[0], 1)], spb * 16, 0.035, 1100);
      if (b % 2 === 0) { const a = [ch[0], ch[2], ch[1] + 5, ch[2], ch[0] + 5, ch[2], ch[1] + 5, ch[2]]; this.pluck(t, this.deg(a[b / 2], 0), 0.1, 1.6); }
      if (bar >= 4) melody(4, 1, 3.5, 0.07, 'flute', spb);
    } else if (m === 'town') {
      if (b === 0) this.pad(t, [this.deg(ch[0], -1), this.deg(ch[2], -1), this.deg(ch[1], 0)], spb * 16, 0.02, 900);
      if (b === 0 || b === 6 || b === 10) for (const c of ch) this.pluck(t + rnd(0.02), this.deg(c, 0), 0.07, 0.9);
      if (b % 4 === 2 && b !== 6 && b !== 10) this.pluck(t, this.deg(ch[b % 3], 0), 0.05, 0.6);
      if (b % 8 === 0) this.pluck(t, this.deg(ch[0], -1), 0.12, 0.8);
      if (b % 8 === 0) this.drum(t, 0.16); if (b % 8 === 4 || b === 14) this.drum(t, 0.1, false);
      if (bar % 8 >= 2) melody(2, 1, 1.8, 0.075, 'flute', spb);
    } else if (m === 'wild') {
      if (b === 0 && bar % 2 === 0) this.pad(t, [this.deg(ch[0], -1), this.deg(ch[2], -1), this.deg(ch[1], 0)], spb * 30, 0.028, 750);
      if (bar % 4 < 2) melody(2, 0, 1, 0.1, 'pluck', spb);
      else if (b === 0 && bar % 4 === 2) this.pluck(t, this.deg(ch[0], -1), 0.1, 2.2);
      if (bar % 8 === 6) melody(4, 1, 3.6, 0.045, 'flute', spb);
    } else if (m === 'night') {
      if (b === 0 && bar % 2 === 0) this.pad(t, [this.deg(ch[0], -2), this.deg(ch[2], -1), this.deg(ch[1], -1)], spb * 32, 0.035, 480);
      if ((b === 0 || b === 10) && bar % 2 === 1 && Math.random() < 0.8) melody(2, 1, 1, 0.07, 'bell', spb);
    } else if (m === 'danger') {
      const pat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0];
      if (pat[b]) this.drum(t, b === 0 ? 0.4 : 0.26);
      if (b % 4 === 2) this.drum(t, 0.14, false);
      if (b === 0) this.pad(t, [this.deg(ch[0], -2), this.deg(ch[0], -1), this.deg(ch[2], -1)], spb * 16, 0.04, 600);
      if (b === 0 || b === 6 || (b === 12 && bar % 2 === 1)) for (const c of ch) this.pluck(t, this.deg(c, -1), 0.09, 0.35);
      if (bar % 4 === 3 && b >= 8 && b % 2 === 0) this.pluck(t, this.deg(root + b / 2, 0), 0.07, 0.3);
    }
  }

  private stepDur(): number { // 16th-note length
    const bpm = { none: 60, title: 62, town: 100, wild: 70, night: 52, danger: 132 }[this.mood];
    return 60 / bpm / 4;
  }

  // ---------- Ambience ----------
  setAmbience(a: Ambience) { this.amb = { ...a }; }

  private chirp() {
    const d = this.out(rnd(0.16, 0.05) * this.amb.birds, undefined, this.ambBus, 0.4);
    if (!d) return;
    const ctx = this.ctx!;
    let t = ctx.currentTime + 0.02;
    const base = rnd(4200, 2200), n = 1 + ((Math.random() * 5) | 0), kind = Math.random();
    for (let i = 0; i < n; i++) {
      const dur = rnd(0.12, 0.05);
      const f0 = base * rnd(1.1, 0.9), f1 = kind < 0.5 ? f0 * rnd(1.5, 1.15) : f0 * rnd(0.85, 0.6);
      this.tone(d, 'sine', t, dur, [[0, f0], [1, f1]], 0.6, 0.01, kind > 0.8 ? 120 : 0);
      t += dur + rnd(0.09, 0.02);
    }
  }

  private cricket() {
    const d = this.out(0.05 * this.amb.night, undefined, this.ambBus);
    if (!d) return;
    const t = this.ctx!.currentTime + 0.02, f = rnd(4900, 4100), n = 3 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) this.tone(d, 'sine', t + i * 0.16 + k * 0.022, 0.02, [[0, f]], 0.5, 0.004);
  }

  private owl() {
    const d = this.out(0.1, undefined, this.ambBus, 0.9);
    if (!d) return;
    const t = this.ctx!.currentTime + 0.02;
    [0, 0.5, 0.75, 1.3].forEach((o, i) => this.tone(d, 'sine', t + o, i === 3 ? 0.6 : 0.25, [[0, 370], [1, 330]], 0.6, 0.05));
  }

  update(dt: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime, a = this.amb;
      // music duck recovery
      this.duckAmt = Math.max(0, this.duckAmt - dt * 0.5);
      this.musicDuck.gain.setTargetAtTime(1 - this.duckAmt * 0.8, now, 0.1);
      // sequencer
      if (this.moodGain && this.mood !== 'none') {
        if (this.nextStep < now - 0.5) this.nextStep = now + 0.05; // tab was hidden
        let guard = 0;
        while (this.nextStep < now + 0.25 && guard++ < 16) {
          this.scheduleStep(this.nextStep, this.step++);
          this.nextStep += this.stepDur();
        }
      }
      // beds
      this.tGust += dt;
      const gust = 0.75 + 0.25 * Math.sin(this.tGust * 0.37) * Math.sin(this.tGust * 0.13 + 1);
      this.windG.gain.setTargetAtTime(a.wind * gust * (a.snow ? 0.5 : 0.3), now, 0.4);
      this.windF.frequency.setTargetAtTime((a.snow ? 750 : 400) + gust * (a.snow ? 500 : 200), now, 0.6);
      this.windF.Q.setTargetAtTime(a.snow ? 2.2 : 0.7, now, 0.5);
      this.waterG.gain.setTargetAtTime(a.water * 0.22, now, 0.4);
      this.townG.gain.setTargetAtTime(a.town * 0.05, now, 0.6);
      // one-shots
      const day = 1 - a.night;
      if (a.birds * day > 0.05 && (this.tBird -= dt) <= 0) { this.chirp(); this.tBird = rnd(5, 0.6) / (a.birds * day); }
      if (a.night > 0.3 && !a.snow && (this.tCricket -= dt) <= 0) { this.cricket(); this.tCricket = rnd(1.6, 0.4) / a.night; }
      if (a.night > 0.6 && (this.tOwl -= dt) <= 0) { this.owl(); this.tOwl = rnd(70, 25); }
      if (a.fire > 0.05 && (this.tFire -= dt) <= 0) {
        const d = this.out(a.fire * rnd(0.3, 0.08), undefined, this.ambBus);
        if (d) this.burst(d, now + 0.01, rnd(0.05, 0.015), 'bandpass', rnd(3500, 900), 700, 1.5, 0.9, 0.001);
        this.tFire = rnd(0.16, 0.02);
      }
    } catch { /* ignore */ }
  }
}

export const audio = new AudioSys();
