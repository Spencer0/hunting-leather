// Small math / random helpers.
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dampAngle = (a: number, b: number, lambda: number, dt: number) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T>(arr: T[], r: () => number = Math.random) => arr[Math.floor(r() * arr.length)];
export function weighted<T>(items: [T, number, ...unknown[]][], r: () => number): number {
  let total = 0;
  for (const it of items) total += it[1];
  let v = r() * total;
  for (let i = 0; i < items.length; i++) {
    v -= items[i][1];
    if (v <= 0) return i;
  }
  return items.length - 1;
}

/** Seeded 2D value noise with smooth interpolation, plus fbm. */
export class Noise {
  private p = new Uint8Array(512);
  private g = new Float32Array(256);
  constructor(seed: number) {
    const r = rng(seed);
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    for (let i = 0; i < 256; i++) this.g[i] = r();
  }
  /** 0..1 */
  n(x: number, y: number) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const X = xi & 255, Y = yi & 255;
    const p = this.p, g = this.g;
    const a = g[p[p[X] + Y]], b = g[p[p[X + 1] + Y]], c = g[p[p[X] + Y + 1]], d = g[p[p[X + 1] + Y + 1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  /** fbm, roughly 0..1 */
  fbm(x: number, y: number, oct = 4, lac = 2.03, gain = 0.5) {
    let amp = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * this.n(x * f + i * 17.3, y * f - i * 9.1);
      norm += amp;
      amp *= gain;
      f *= lac;
    }
    return sum / norm;
  }
}

export function fmtTime(h: number) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
