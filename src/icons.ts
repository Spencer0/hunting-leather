// Hand-authored inline SVG icons for inventory / HUD. viewBox 0 0 48 48.

const OUT = '#2a1c10';
const WOOD = '#8a5a34';
const STEEL = '#c8d0d8';
const GOLD = '#e8b830';
const BONE = '#f4ead8';

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
function parse(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [160, 128, 96];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');
}
/** Darken a colour towards black by `amt` (0..1). */
export function shade(hex: string, amt = 0.35): string {
  const [r, g, b] = parse(hex);
  return toHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
/** Lighten a colour towards white by `amt` (0..1). */
export function tint(hex: string, amt = 0.3): string {
  const [r, g, b] = parse(hex);
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}

// ---- drawing helpers -------------------------------------------------------
/** Filled, outlined path. */
function P(d: string, fill: string, extra = ''): string {
  return `<path d="${d}" fill="${fill}" ${extra}/>`;
}
/** Filled path without outline (highlights / inner detail). */
function F(d: string, fill: string, extra = ''): string {
  return `<path d="${d}" fill="${fill}" stroke="none" ${extra}/>`;
}
/** Thin detail stroke, no fill. */
function S(d: string, col: string = OUT, w = 1.8, extra = ''): string {
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" ${extra}/>`;
}
/** Thick coloured strokes with a dark outline (for shafts, cords, limbs). */
function L(ds: string | string[], w: number, col: string): string {
  const arr = Array.isArray(ds) ? ds : [ds];
  return (
    arr.map((d) => `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${w + 4}"/>`).join('') +
    arr.map((d) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/>`).join('')
  );
}
function C(cx: number, cy: number, r: number, fill: string, extra = ''): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
}
function E(cx: number, cy: number, rx: number, ry: number, fill: string, extra = ''): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
}
function R(x: number, y: number, w: number, h: number, fill: string, rx = 0, extra = ''): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
}
const NS = 'stroke="none"';

function starPath(cx: number, cy: number, ro: number, ri: number, n: number): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    d += (i === 0 ? 'M' : 'L') + (cx + Math.cos(a) * r).toFixed(1) + ' ' + (cy + Math.sin(a) * r).toFixed(1);
  }
  return d + 'Z';
}

type Draw = (c: string, d: string, l: string) => string;

const DEFAULTS: Record<string, string> = {
  target: '#d8483a', coin: GOLD, heart: '#e0484a', star: '#f2c838', lock: '#b88a3a', map: '#e8d4a0', eye: '#4a9a5a',
  eye_closed: '#c8b890', paw: '#b98a58', skull: '#efe8d6', moon: '#dfe6f4', sun: '#f6c63a', campfire: '#f08a2a',
  scroll: '#ecdcb0', check: '#6cc04a', bed: '#b8483a', wagon: '#a8743e', hammer: '#aab2bb', bow: '#b08050',
  crossbow: '#8a5a34', meat: '#c0504a', tonic: '#e05858',
};

const ICONS: Record<string, Draw> = {
  herb: (c, d, l) =>
    L('M24 44Q23 30 25 20', 3.5, d) +
    P('M25 22Q10 20 8 6Q24 6 25 22Z', c) + P('M25 26Q40 22 42 9Q27 10 25 26Z', c) + P('M24 34Q12 36 7 27Q18 22 24 34Z', l) +
    L(['M24 20Q17 14 12 9', 'M26 24Q33 18 38 13'], 1.6, d),
  mushroom: (c, d, l) =>
    P('M19 26L18 42Q24 46 30 42L29 26Z', '#f0e6d0') +
    P('M5 27Q6 7 24 6Q42 7 43 27Q24 33 5 27Z', c) +
    C(16, 17, 3.2, l) + C(29, 13, 2.6, l) + C(33, 22, 2, l),
  fish: (c, d, l) =>
    P('M6 24Q16 9 31 15L42 8L40 24L42 40L31 33Q16 39 6 24Z', c) +
    F('M10 24Q18 14 29 18Q20 20 10 24Z', l) +
    L('M24 17Q27 24 24 31', 2, d) +
    C(13.5, 22, 2.2, '#2a1c10'),
  rod: (c, d, l) =>
    L('M8 42L38 6', 4.5, c) +
    L('M38 6Q44 18 36 28', 1.6, '#e8e0d0') +
    C(36, 31, 3.6, '#d84a3a') +
    C(15, 34, 4.5, d) +
    L('M6 44L12 37', 6, d),
  bait: (c, d, l) =>
    L('M12 36Q8 24 18 22Q28 20 24 12Q22 6 30 8Q40 10 36 22', 6.5, c) +
    L('M14 33Q12 26 18 25', 2, l) +
    C(33, 11, 1.6, '#2a1c10'),
  pelt: (c, d, l) =>
    P('M20 5L28 5L30 11L40 7L43 15L34 19L35 27L43 32L40 39L30 34L27 36L26 45L22 45L21 36L18 34L8 39L5 32L13 27L14 19L5 15L8 7L18 11Z', c) +
    F('M24 11Q29 20 27 32L24 35L21 32Q19 20 24 11Z', l) +
    S('M11 12l3 2M37 12l-3 2M10 33l3-1M38 33l-3-1M18 22l2 2M30 22l-2 2M18 28l2 1M30 28l-2 1', d, 2),
  hide: (c, d, l) =>
    P('M16 6Q24 10 32 6L34 12L43 9L44 18L37 21Q39 25 37 29L44 33L42 42L33 38Q24 43 15 38L6 42L4 33L11 29Q9 25 11 21L4 18L5 9L14 12Z', c) +
    F('M24 14Q31 18 30 26Q29 33 24 35Q19 33 18 26Q17 18 24 14Z', l) +
    S('M24 14L24 35', d, 1.6, 'stroke-dasharray="3 3"'),
  leather: (c, d, l) =>
    P('M10 33L4 41L30 41L37 33Z', d) +
    P('M12 13L36 13A6 10.5 0 0 1 36 34L12 34A6 10.5 0 0 1 12 13Z', c) +
    R(17, 13, 5, 21, d) +
    E(36, 23.5, 6, 10.5, l) +
    S('M36 17.5a3.6 6 0 1 1-1 11.5a2 3.4 0 1 1 1.4-5.6', OUT, 1.8),
  fur: (c, d, l) =>
    P('M10 29L5 21L11 22L9 12L16 17L18 7L24 15L30 7L32 17L39 12L37 22L43 21L38 29L43 39L34 36L30 44L24 38L18 44L14 36L5 39Z', c) +
    F('M24 15L27 11L28 19L33 16L31 23L17 23L15 16L20 19Z', l) +
    P('M9 25L39 25L40 31L8 31Z', d) +
    S('M16 35l1 3M24 33l0 3M32 35l-1 3', d, 2),
  sinew: (c, d) =>
    L('M35 32Q43 36 40 45', 4, c) +
    C(23, 23, 16, c) +
    C(23, 23, 10.5, 'none') +
    C(23, 23, 5, d) +
    S('M12 16l5 4M33 15l-5 4M13 31l5-3M31 32l-4-4', d, 1.8),
  antler: (c) => L(['M17 45Q11 30 19 15Q22 9 19 4', 'M15 31Q7 27 6 16', 'M17 20Q28 21 31 8', 'M24 18Q34 23 43 14'], 4.5, c),
  fang: (c, d, l) =>
    P('M12 11Q24 2 36 11Q38 28 19 45Q24 30 12 11Z', c) +
    P('M12 11Q24 2 36 11Q31 18 24 16Q16 17 12 11Z', d) +
    S('M31 18Q32 28 25 36', l, 2.4),
  horn: (c, d, l) =>
    P('M5 33Q10 16 42 4Q38 28 20 43Z', c) +
    F('M14 22Q26 12 38 8Q30 14 20 26Z', l) +
    S('M17 21l7 8M24 16l7 7M31 12l5 5', d, 2) +
    E(12.5, 38, 9, 5.5, d, 'transform="rotate(38 12.5 38)"'),
  meat: (c, d, l) =>
    L('M28 28L39 39', 5, BONE) +
    C(41, 36.5, 3.6, BONE) +
    C(36.5, 41, 3.6, BONE) +
    P('M6 20Q6 6 20 6Q34 6 34 20Q34 31 26 34Q10 36 6 20Z', c) +
    F('M11 18Q11 11 19 10Q14 14 14 21Z', l) +
    S('M17 28Q26 28 29 20', d, 2.2),
  arrow: (c, d, l) =>
    L('M10 38L36 12', 3, c) +
    P('M43 5L39 19L29 9Z', STEEL) +
    P('M8 40L4 32L11 25L17 31Z', l) +
    P('M8 40L16 44L23 37L17 31Z', d),
  bolt: (c, d) =>
    L('M13 35L31 17', 6.5, c) +
    P('M44 4L39 24L24 9Z', STEEL) +
    S('M41 7L31 17', '#8a9098', 2) +
    P('M10 38L5 30L11 24L17 30Z', d) +
    P('M10 38L18 43L24 37L18 31Z', d),
  knife: (c, d, l) =>
    L('M18 30L8 40', 6, WOOD) +
    P('M41 4Q43 21 25 31L17 23Q26 8 41 4Z', c) +
    F('M38 8Q30 12 22 23L20 22Q27 11 38 8Z', l) +
    L('M14 20L28 34', 3.5, d),
  axe: (c, d, l) =>
    L('M11 43L31 11', 4.5, WOOD) +
    P('M21 14L29 4Q44 7 46 25Q37 20 29 23Z', c) +
    F('M36 9Q42 13 43 20Q39 17 35 16Z', l) +
    S('M29 4Q33 13 29 23', d, 2),
  spear: (c, d) =>
    L('M7 43L33 15', 3.5, c) +
    P('M44 4L41 21L34 14L27 7Z', STEEL) +
    S('M43 5L34 14', '#8a9098', 2) +
    L('M29 14L34 19', 3, d),
  salt: (c, d, l) =>
    P('M16 13L13 5L24 9L35 5L32 13Z', c) +
    P('M12 20Q6 40 14 43L34 43Q42 40 36 20Q31 17 31 13L17 13Q17 17 12 20Z', c) +
    F('M14 24Q11 36 15 40L20 40Q15 34 17 23Z', l) +
    L('M16 14L32 14', 2.5, d) +
    P('M29 34l4.5-6l4.5 6l-4.5 6z', '#bfe6ff') +
    P('M21 39l3-4l3 4l-3 4z', '#dff3ff'),
  thread: (c, d, l) =>
    L('M33 29Q43 31 40 43', 2.5, c) +
    R(15, 12, 18, 24, c) +
    F('M17 14L21 14L21 34L17 34Z', l) +
    S('M15 19L33 16M15 24L33 21M15 29L33 26M15 34L33 31', d, 1.8) +
    R(10, 6, 28, 7, WOOD, 2.5) +
    R(10, 35, 28, 7, WOOD, 2.5),
  rivet: (c, d, l) =>
    [
      [15, 16],
      [34, 17],
      [24, 34],
    ]
      .map(([x, y]) => C(x, y, 8, d) + C(x, y - 1, 5.5, c, NS) + C(x - 2, y - 3, 2, l, NS))
      .join(''),
  tonic: (c, d, l) =>
    R(19, 4, 10, 7, '#b98a58', 1.5) +
    R(20, 10, 8, 10, '#dfeef2') +
    C(24, 31, 13, '#dfeef2') +
    F('M11.6 29L36.4 29A12.6 12.6 0 1 1 11.6 29Z', c) +
    S('M11.6 29L36.4 29', d, 1.8) +
    C(24, 31, 13, 'none') +
    S('M16 34Q16 39 21 41', l, 2.4) +
    C(29, 35, 1.6, l, NS),
  pouch: (c, d, l) =>
    P('M14 18Q3 40 16 43L32 43Q45 40 34 18Z', c) +
    F('M15 22Q9 36 16 40L20 40Q14 34 19 22Z', l) +
    P('M14 18L10 8L18 12L24 7L30 12L38 8L34 18Z', l) +
    L('M13 18L35 18', 2.5, d) +
    L('M30 19Q36 24 33 30', 2, d),
  glove: (c, d, l) =>
    P('M14 44L14 27L10 15Q9 11 12 10Q15 9.5 16 13L18.5 20L18.5 8Q18.5 4.5 21.5 4.5Q24.5 4.5 24.5 8L24.5 19L25.5 7Q26 4 28.7 4.4Q31.5 5 31.2 8L30.2 20L32.5 12Q33.4 9 35.8 9.6Q38.4 10.5 37.6 13.5L34 30L34 44Z', c) +
    F('M16 28L20 28L20 36L16 36Z', l) +
    P('M12 36L36 36L36 45L12 45Z', d) +
    S('M18.5 20L19 26M24.5 19L24.5 26M30.2 20L29.5 26', d, 1.8),
  hat: (c, d, l) =>
    P('M10 30Q9 8 24 8Q39 8 38 30Z', c) +
    F('M15 26Q14 13 23 11Q18 16 19 26Z', l) +
    S('M24 8L24 26', d, 1.8) +
    P('M5 31Q5 24 12 26Q15 22 20 25Q24 21 28 25Q33 22 36 26Q43 24 43 31Q45 39 38 39Q34 42 29 39Q24 42 19 39Q14 42 10 39Q3 39 5 31Z', l) +
    S('M12 31l1 4M20 30l0 5M28 30l0 5M36 31l-1 4', d, 1.8),
  belt: (c, d, l) =>
    P('M22 8a15.5 15.5 0 1 0 0.01 0ZM22 16a7.5 7.5 0 1 0 0.01 0Z', c, 'fill-rule="evenodd"') +
    S('M22 12a11.5 11.5 0 1 0 0.01 0Z', d, 1.6, 'stroke-dasharray="2 3"') +
    P('M27 18L45 18L45 30L27 30Z', GOLD) +
    R(31, 21.5, 10, 5, l, 0, 'stroke-width="1.8"') +
    S('M27 24L38 24', OUT, 2.2),
  boot: (c, d, l) =>
    P('M15 5L30 5L30 25Q42 27 43 35L43 41L11 41L11 36Q16 30 15 22Z', c) +
    F('M18 12L21 12L22 30Q18 33 15 37L14 37Q19 30 18 22Z', l) +
    P('M10 40L44 40L44 45L10 45Z', d) +
    P('M14 4L31 4L31 11L14 11Z', l) +
    S('M30 25Q25 26 22 30', d, 2),
  bag: (c, d, l) =>
    L('M17 13Q24 2 31 13', 3, d) +
    R(9, 13, 30, 30, c, 6) +
    P('M9 21Q9 12 17 12L31 12Q39 12 39 21L39 26Q24 33 9 26Z', l) +
    R(20.5, 25, 7, 8, GOLD, 1.5) +
    S('M13 36L35 36', d, 2),
  cloak: (c, d, l) =>
    P('M24 6Q30 6 32 10Q43 24 43 43Q33 38 24 44Q15 38 5 43Q5 24 16 10Q18 6 24 6Z', c) +
    F('M12 22Q8 32 8 39Q12 37 15 38Q13 30 16 20Z', l) +
    S('M24 16L24 43M32 22Q36 32 36 40', d, 2) +
    P('M13 13Q24 3 35 13Q30 20 24 16Q18 20 13 13Z', l) +
    C(24, 17.5, 2.8, GOLD),
  saddle: (c, d, l) =>
    P('M13 27L35 27L33 42Q24 46 15 42Z', d) +
    P('M5 20Q9 10 16 17Q24 24 32 17Q38 8 44 15Q43 28 34 30L14 30Q6 28 5 20Z', c) +
    F('M9 19Q11 15 14 18Q19 23 24 23Q16 26 9 19Z', l) +
    L('M24 31L24 37', 2, l) +
    R(20.5, 36, 7, 6, 'none', 2, `stroke="${OUT}"`) +
    S('M21 37.5L27 37.5', STEEL, 2),
  drum: (c, d, l) =>
    P('M7 15L7 34A17 7 0 0 0 41 34L41 15Z', c) +
    S('M7 21L13 38L19 23L25 41L31 23L36 38L41 21', l, 2) +
    E(24, 15, 17, 7, '#ecdcb8') +
    E(24, 15, 11, 4, '#f8eed4', NS) +
    S('M7 34A17 7 0 0 0 41 34', d, 0.01),
  quiver: (c, d, l) =>
    `<g transform="rotate(18 24 26)">` +
    L(['M19 16L18 5', 'M24 16L24 3', 'M29 16L30 5'], 2, '#d8c8a0') +
    E(18, 6, 2.8, 4.5, '#d04a3a') +
    E(24, 4.5, 2.8, 4.5, '#e8e0c8') +
    E(30, 6, 2.8, 4.5, '#d04a3a') +
    P('M15 16L33 16L31 42Q24 46 17 42Z', c) +
    F('M18 20L21 20L21 41L19 40Z', l) +
    R(14, 14, 20, 6, d, 2) +
    S('M17 33L31 33', d, 2) +
    `</g>`,
  armor: (c, d, l) =>
    P('M15 5L20 5Q24 10 28 5L33 5L43 11L40 21L34 19L34 43L14 43L14 19L8 21L5 11Z', c) +
    F('M15 7L19 7L17 13L9 17L8 12Z', l) +
    F('M33 7L29 7L31 13L39 17L40 12Z', l) +
    S('M24 10L24 31M21 14l6 3M21 20l6 3M21 26l6 3', d, 1.8) +
    P('M13 31L35 31L35 37L13 37Z', d) +
    R(21, 30.5, 6, 7, GOLD, 1, 'stroke-width="1.8"'),
  bow: (c, d) =>
    S('M13 5L13 43', '#f0e8d0', 1.6) +
    L('M13 5Q24 8 33 18Q37 24 33 30Q24 40 13 43', 4, c) +
    L('M33.5 19Q36 24 33.5 29', 6, d) +
    L('M13 24L43 24', 1.6, '#d8c8a0') +
    P('M46 24L39 20L39 28Z', STEEL, 'stroke-width="1.8"'),
  crossbow: (c, d, l) =>
    S('M5 22L24 30L43 22', '#f0e8d0', 1.6) +
    L('M5 22Q12 10 24 11Q36 10 43 22', 4, '#8a9098') +
    L('M24 8L24 43', 6.5, c) +
    S('M22.5 13L22.5 40', l, 1.6) +
    P('M24 3L28 12L20 12Z', STEEL, 'stroke-width="1.8"') +
    L('M20 37L28 37', 2.5, d),
  target: (c) => C(24, 24, 19, '#f6f0e0') + C(24, 24, 13.5, c) + C(24, 24, 8, '#f6f0e0') + C(24, 24, 3.2, c),
  coin: (c, d, l) =>
    C(24, 25.5, 17, d) +
    C(24, 23, 17, c) +
    C(24, 23, 12, 'none', `stroke="${d}" stroke-width="2"`) +
    F('M13 18Q16 11 23 10Q16 14 15 21Z', l) +
    P(starPath(24, 23.5, 7, 3.2, 5), l, `stroke="${d}" stroke-width="1.5"`),
  heart: (c, d, l) =>
    P('M24 43Q2 27 6 14Q10 4 19 8Q23 10 24 14Q25 10 29 8Q38 4 42 14Q46 27 24 43Z', c) +
    F('M10 16Q11 10 17 11Q13 14 13 20Z', l) +
    S('M36 26Q32 32 26 37', d, 2.2),
  star: (c, d, l) => P(starPath(24, 25, 20, 8.5, 5), c) + F(starPath(22, 22, 8, 3.5, 5), l),
  lock: (c, d, l) =>
    L('M16 22L16 15Q16 6 24 6Q32 6 32 15L32 22', 4, STEEL) +
    R(10, 21, 28, 22, c, 4) +
    F('M13 24L17 24L17 40L13 40Z', l) +
    C(24, 29.5, 3.6, OUT, NS) +
    F('M22.4 30L25.6 30L26.6 37L21.4 37Z', OUT) +
    S('M10 38L38 38', d, 0.01),
  map: (c, d) =>
    P('M5 12L18 7L30 12L43 7L43 36L30 41L18 36L5 41Z', c) +
    F('M18 8.5L30 13.5L30 39.5L18 34.5Z', d, 'opacity="0.45"') +
    S('M18 7L18 36M30 12L30 41', OUT, 1.6) +
    S('M10 33Q14 24 21 26Q27 28 33 20', '#b8483a', 2.2, 'stroke-dasharray="3 3.5"') +
    S('M33 14l6 6M39 14l-6 6', '#b8483a', 2.8),
  eye: (c, d, l) =>
    P('M3 24Q24 5 45 24Q24 43 3 24Z', '#f8f4e8') +
    C(24, 24, 9, c) +
    C(24, 24, 4, OUT, NS) +
    C(27, 20.5, 2.2, '#ffffff', NS) +
    S('M17 24a7 7 0 0 0 7 7', d, 1.8) +
    S('M3 24Q24 5 45 24', OUT, 3.4),
  eye_closed: (c) => L(['M4 21Q24 39 44 21', 'M11 29L7 35', 'M24 33L24 40', 'M37 29L41 35', 'M17.5 32L15.5 38', 'M30.5 32L32.5 38'], 3, c),
  paw: (c, d, l) =>
    P('M24 23Q35 23 37 34Q38 43 30 41Q24 39 18 41Q10 43 11 34Q13 23 24 23Z', c) +
    F('M18 28Q22 26 26 27Q19 30 16 36Q15 31 18 28Z', l) +
    E(9.5, 22, 4.6, 6.2, c, 'transform="rotate(-18 9.5 22)"') +
    E(19, 12, 4.8, 6.6, c) +
    E(29, 12, 4.8, 6.6, c) +
    E(38.5, 22, 4.6, 6.2, c, 'transform="rotate(18 38.5 22)"'),
  skull: (c, d, l) =>
    P('M7 22Q7 5 24 5Q41 5 41 22Q41 30 35 33L35 42L13 42L13 33Q7 30 7 22Z', c) +
    F('M11 20Q11 10 21 8Q15 13 15 22Z', l) +
    E(17, 22.5, 5, 5.6, OUT, NS) +
    E(31, 22.5, 5, 5.6, OUT, NS) +
    F('M24 27L27 33L21 33Z', OUT) +
    S('M18.5 36L18.5 42M24 36L24 42M29.5 36L29.5 42M13 36L35 36', d, 1.8),
  moon: (c, d, l) =>
    P('M29 5A19 19 0 1 0 43 31A15.5 15.5 0 0 1 29 5Z', c) +
    C(15, 27, 2.6, d, NS + ' opacity="0.35"') +
    C(22, 36, 2, d, NS + ' opacity="0.35"') +
    S('M12 17Q14 12 19 9', l, 2.2),
  sun: (c, d, l) => {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const p = (r: number, off: number) => (24 + Math.cos(a + off) * r).toFixed(1) + ' ' + (24 + Math.sin(a + off) * r).toFixed(1);
      rays += P(`M${p(21.5, 0)}L${p(13.5, 0.24)}L${p(13.5, -0.24)}Z`, c);
    }
    return rays + C(24, 24, 10.5, c) + F('M17 22Q18 17 23 16Q19 19 19 24Z', l) + S('M30 27Q28 31 24 31', d, 1.8);
  },
  campfire: (c, d, l) =>
    P('M24 3Q37 18 34 28Q32 37 24 37Q16 37 14 28Q12 20 20 13Q19 20 23 21Q21 12 24 3Z', c) +
    F('M24 20Q30 26 28 31Q26 35 24 35Q21 35 20 31Q19 27 24 20Z', '#ffe27a') +
    L(['M6 41L42 34', 'M6 34L42 41'], 5, WOOD) +
    S('M9 34.5l4 0.8M35 34.5l4-0.8', tint(WOOD, 0.4), 1.6),
  scroll: (c, d, l) =>
    P('M12 9L36 9L36 39L12 39Z', c) +
    S('M17 17L31 17M17 22L31 22M17 27L27 27M17 32L30 32', d, 1.8) +
    R(7, 4, 34, 8, l, 4) +
    R(7, 36, 34, 8, l, 4) +
    S('M11 8L37 8M11 40L37 40', d, 1.5),
  check: (c) => L('M8 26L19 37L40 11', 6.5, c),
  bed: (c, d, l) =>
    R(4, 10, 6, 32, WOOD, 1.5) +
    R(38, 22, 6, 20, WOOD, 1.5) +
    R(9, 29, 30, 8, shade(WOOD, 0.2)) +
    P('M10 21L38 21L38 30L10 30Z', c) +
    F('M24 22.5L36.5 22.5L36.5 25L24 25Z', l) +
    R(11, 15, 12, 8, '#f6f0e0', 3.5) +
    S('M24 21L24 30', d, 1.8),
  wagon: (c, d, l) =>
    L('M40 27L46 22', 2.5, WOOD) +
    P('M8 20Q10 5 24 5Q38 5 40 20Z', '#ecdcb8') +
    S('M17 7Q14 12 14 20M31 7Q34 12 34 20M24 5L24 20', shade('#ecdcb8', 0.25), 1.8) +
    P('M5 19L43 19L40 31L8 31Z', c) +
    F('M8 21L40 21L39.4 23.5L8.6 23.5Z', l) +
    C(14, 36, 7.5, d) +
    C(14, 36, 2.4, l, 'stroke-width="1.5"') +
    C(34, 36, 7.5, d) +
    C(34, 36, 2.4, l, 'stroke-width="1.5"'),
  hammer: (c, d, l) =>
    L('M10 43L28 16', 4.5, WOOD) +
    `<g transform="rotate(34 29 14)">` +
    R(15, 7, 28, 14, c, 2.5) +
    F('M17 9L41 9L41 12L17 12Z', l) +
    S('M22 7L22 21M36 7L36 21', d, 1.8) +
    `</g>`,
  box: (c, d, l) =>
    P('M6 16L24 8L42 16L42 34L24 43L6 34Z', c) +
    F('M6 16L24 24L24 43L6 34Z', d) +
    P('M6 16L24 8L42 16L24 24Z', l) +
    S('M24 24L24 43', OUT, 2.5),
};

export const ICON_NAMES: string[] = Object.keys(ICONS).filter((n) => n !== 'box');

/** Returns an inline `<svg>` string for the named icon. Unknown names fall back to a crate. */
export function icon(name: string, color?: string, size = 40): string {
  const draw = ICONS[name] ?? ICONS.box;
  const c = color ?? DEFAULTS[name] ?? '#b98a58';
  const body = draw(c, shade(c, 0.35), tint(c, 0.3));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-${name}" viewBox="0 0 48 48" width="${size}" height="${size}">` +
    `<g stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`
  );
}
