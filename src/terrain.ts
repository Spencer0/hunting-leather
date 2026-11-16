// Heightfield terrain: generation, queries, mesh, procedural ground textures, minimap image.
import * as THREE from 'three';
import type { ZoneDef } from './data';
import { Noise, clamp, lerp, rng, smooth } from './util';

export const WORLD = 520; // total mesh extent (m)
export const PLAY = 196; // playable radius-ish (squircle half extent)
export const CELL = 2.5;
export const N = WORLD / CELL; // cells per side
export const WATER_Y = 1;
export const TOWN_R = 36;

export interface Terrain {
  zone: ZoneDef;
  h: Float32Array; // (N+1)^2 heights
  splat: Float32Array; // (N+1)^2 * 3
  town: THREE.Vector3;
  home?: THREE.Vector3; // the hunter's cabin (Greenhollow only)
  lair: THREE.Vector3;
  lakes: { x: number; z: number; r: number }[];
  roads: [number, number][][];
  camps: THREE.Vector3[];
  mesh: THREE.Mesh;
  height(x: number, z: number): number;
  normal(x: number, z: number, out: THREE.Vector3): THREE.Vector3;
  pathAt(x: number, z: number): number;
  /** true if a point is somewhere a creature can stand */
  walkable(x: number, z: number): boolean;
  mapCanvas: HTMLCanvasElement;
}

function distToSeg(px: number, pz: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

/** Squircle distance from centre in units of PLAY (1 = boundary). */
export const edgeDist = (x: number, z: number) => Math.pow(Math.pow(Math.abs(x) / PLAY, 4) + Math.pow(Math.abs(z) / PLAY, 4), 0.25);

// ---------- procedural tiling ground textures ----------
const texCache = new Map<string, THREE.Texture>();
export function groundTexture(kind: string): THREE.Texture {
  const hit = texCache.get(kind);
  if (hit) return hit;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rng(kind.length * 977 + kind.charCodeAt(0) * 31 + kind.charCodeAt(1));
  const wrap = (fn: (x: number, y: number) => void, x: number, y: number) => {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) fn(x + ox * S, y + oy * S);
  };
  const fill = (col: string) => { g.fillStyle = col; g.fillRect(0, 0, S, S); };
  const blobs = (n: number, cols: string[], rmin: number, rmax: number, alpha: number) => {
    for (let i = 0; i < n; i++) {
      const x = r() * S, y = r() * S, rad = lerp(rmin, rmax, r());
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.globalAlpha = alpha * (0.5 + r() * 0.5);
      wrap((px, py) => { g.beginPath(); g.ellipse(px, py, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, 7); g.fill(); }, x, y);
    }
    g.globalAlpha = 1;
  };
  const strokes = (n: number, cols: string[], len: number, width: number, alpha: number, upBias = 0.5) => {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = r() * S, y = r() * S, a = -Math.PI / 2 + (r() - 0.5) * Math.PI * (1 - upBias) * 2, l = len * (0.5 + r());
      g.strokeStyle = cols[Math.floor(r() * cols.length)];
      g.globalAlpha = alpha * (0.5 + r() * 0.5);
      g.lineWidth = width * (0.6 + r() * 0.8);
      wrap((px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); }, x, y);
    }
    g.globalAlpha = 1;
  };
  switch (kind) {
    case 'grass':
      fill('#5a8a36'); blobs(60, ['#4c7a2e', '#6a9a3c', '#527f30'], 14, 40, 0.5);
      strokes(2600, ['#6fa83e', '#4a7a2a', '#86b848', '#3f6c26', '#9cc456'], 7, 1.6, 0.8, 0.75); break;
    case 'leaves':
      fill('#6e5a30'); blobs(50, ['#5c4a26', '#7a6434', '#665028'], 14, 40, 0.5);
      strokes(900, ['#6f8a36', '#5a6c2a'], 6, 1.5, 0.5, 0.7);
      blobs(700, ['#c8742a', '#d89a3a', '#a85424', '#e0b04a', '#8a4a20', '#b8642a'], 2, 4.5, 0.95); break;
    case 'drygrass':
      fill('#b0934a'); blobs(60, ['#a08440', '#c0a458', '#9a7c3c'], 14, 40, 0.5);
      strokes(2600, ['#d8c070', '#a88a40', '#e6d288', '#8f7436', '#c4a850'], 8, 1.5, 0.8, 0.75); break;
    case 'dirt':
      fill('#8a6a48'); blobs(70, ['#7a5c3c', '#96744e', '#806040'], 10, 34, 0.55);
      blobs(500, ['#6c5034', '#a08058', '#5e452c'], 0.8, 2.6, 0.8); blobs(40, ['#9a9084', '#b0a698'], 2, 4, 0.9); break;
    case 'sand':
      fill('#d2b47c'); blobs(70, ['#c4a66e', '#dcc088', '#c8aa74'], 10, 34, 0.5);
      blobs(600, ['#b89860', '#e4cc98'], 0.6, 1.6, 0.7); break;
    case 'rock':
      fill('#84847e'); blobs(60, ['#74746e', '#94948c', '#6a6a66', '#8c8a80'], 10, 36, 0.6);
      strokes(160, ['#52524e', '#5c5a56'], 22, 1.4, 0.7, 0); blobs(300, ['#a0a098', '#62625e'], 0.8, 2.4, 0.7); break;
    case 'redrock':
      fill('#a8623c'); blobs(60, ['#96522e', '#b8724a', '#8a4a2a', '#c08058'], 10, 36, 0.6);
      strokes(160, ['#6e3a20', '#7a4226'], 26, 1.6, 0.7, 0); blobs(300, ['#c88a60', '#7e4426'], 0.8, 2.4, 0.7); break;
    case 'snow':
      fill('#eef4fa'); blobs(70, ['#e2ecf6', '#f8fbff', '#dce8f4'], 12, 40, 0.6); blobs(300, ['#ffffff', '#d4e2f0'], 0.6, 1.8, 0.7); break;
    case 'packedsnow':
      fill('#cfdbe8'); blobs(70, ['#c0cedd', '#dbe5ef', '#b8c8d8'], 10, 30, 0.6); blobs(260, ['#a8b8ca', '#e8f0f8'], 1, 3, 0.7); break;
    default:
      fill('#888');
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(kind, t);
  return t;
}
const MAP_COLORS: Record<string, [number, number, number]> = {
  grass: [96, 148, 62], leaves: [150, 112, 56], drygrass: [190, 162, 90], dirt: [150, 118, 82], sand: [214, 186, 132], rock: [136, 136, 130],
  redrock: [172, 104, 68], snow: [236, 242, 248], packedsnow: [205, 218, 232],
};

export function buildTerrain(zone: ZoneDef): Terrain {
  const noise = new Noise(zone.seed);
  const r = rng(zone.seed * 7919);
  const V = N + 1;
  const h = new Float32Array(V * V);
  const splat = new Float32Array(V * V * 3);

  // --- layout ---
  const town = new THREE.Vector3((r() - 0.5) * 60, 0, 118);
  const lairAng = r() < 0.5 ? -1 : 1;
  const lair = new THREE.Vector3(lairAng * (95 + r() * 40), 0, -128 - r() * 25);
  const lakes: Terrain['lakes'] = [];
  // Greenhollow: the hunter's cabin stands off to one side of town, with its own pond
  let home: THREE.Vector3 | undefined;
  if (zone.id === 'greenhollow') {
    const side = town.x > 0 ? -1 : 1;
    home = new THREE.Vector3(town.x + side * 104, 0, town.z - 34);
    lakes.push({ x: home.x + side * 20, z: home.z - 36, r: 12 });
  }
  const nLakes = zone.id === 'greenhollow' ? 4 : zone.id === 'sunscar' ? 1 : 2;
  let guard = 0;
  while (lakes.length < nLakes && guard++ < 200) {
    const x = (r() - 0.5) * 300, z = -150 + r() * 220, rad = (zone.id === 'sunscar' ? 14 : 18) + r() * 14;
    if (Math.hypot(x - town.x, z - town.z) < TOWN_R + rad + 40) continue;
    if (Math.hypot(x - lair.x, z - lair.z) < rad + 36) continue;
    if (home && Math.hypot(x - home.x, z - home.z) < rad + 44) continue;
    if (lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + rad + 30)) continue;
    lakes.push({ x, z, r: rad });
  }
  // roads: town -> north fork -> lair, and -> each lake shore
  const wob = (p: [number, number], q: [number, number], k: number): [number, number][] => {
    const pts: [number, number][] = [];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const steps = Math.max(2, Math.round(len / 14));
    const nx = -(q[1] - p[1]) / len, nz = (q[0] - p[0]) / len;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const o = (noise.n(p[0] * 0.02 + t * 3 + k * 7, p[1] * 0.02 + k * 3) - 0.5) * 2 * Math.sin(t * Math.PI) * Math.min(34, len * 0.25);
      pts.push([lerp(p[0], q[0], t) + nx * o, lerp(p[1], q[1], t) + nz * o]);
    }
    return pts;
  };
  const hub: [number, number] = [town.x * 0.3 + (r() - 0.5) * 30, 10 + r() * 20];
  const roads: [number, number][][] = [
    wob([town.x, town.z + TOWN_R + 60], [town.x, town.z], 0),
    wob([town.x, town.z], hub, 1),
    wob(hub, [lair.x * 0.75, lair.z + 26], 2),
    wob(hub, [-lair.x * 0.8, -110], 3),
  ];
  if (home) {
    const pond = lakes[0], pd = Math.hypot(pond.x - home.x, pond.z - home.z);
    roads.push(wob([home.x, home.z], [town.x, town.z], 8));
    roads.push([[home.x, home.z], [home.x + ((pond.x - home.x) / pd) * (pd - pond.r - 2), home.z + ((pond.z - home.z) / pd) * (pd - pond.r - 2)]]);
  }
  lakes.slice(home ? 1 : 0, home ? 3 : 2).forEach((l, i) => {
    const d = Math.hypot(l.x - hub[0], l.z - hub[1]);
    roads.push(wob(hub, [l.x + ((hub[0] - l.x) / d) * (l.r + 4), l.z + ((hub[1] - l.z) / d) * (l.r + 4)], 4 + i));
  });
  const pathDist = (x: number, z: number) => {
    let d = 1e9;
    for (const road of roads) for (let i = 0; i < road.length - 1; i++) d = Math.min(d, distToSeg(x, z, road[i], road[i + 1]));
    return d;
  };

  // --- heights ---
  const base = WATER_Y + 1.6;
  const rawH = (x: number, z: number) => {
    const a = noise.fbm(x * 0.0065, z * 0.0065, 5);
    const ridge = 1 - Math.abs(noise.fbm(x * 0.011 + 40, z * 0.011 - 12, 3) * 2 - 1);
    let y = base + (Math.pow(a, 1.6) * 2.4 + ridge * ridge * 0.35) * zone.hillAmp + noise.n(x * 0.09, z * 0.09) * 0.5;
    // lakes
    for (const l of lakes) {
      const d = Math.hypot(x - l.x, z - l.z) / l.r;
      if (d < 2.2) {
        // level the basin completely, then scoop it out so every lake is properly deep
        y = lerp(y, base - 0.2, smooth(2.2, 1.2, d));
        y -= smooth(1.1, 0.25, d) * 3.4;
      }
    }
    return y;
  };
  const townY = Math.max(base + 1.2, rawH(town.x, town.z));
  town.y = townY;
  const homeY = home ? Math.max(base + 1.0, rawH(home.x, home.z)) : 0;
  if (home) home.y = homeY;
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const x = -WORLD / 2 + i * CELL, z = -WORLD / 2 + j * CELL;
      let y = rawH(x, z);
      // road flattening (gentle)
      const pd = pathDist(x, z);
      if (pd < 9) y = lerp(y, y - 0.25, smooth(9, 1.5, pd));
      // town plateau
      const td = Math.hypot(x - town.x, z - town.z);
      y = lerp(y, townY, smooth(TOWN_R + 34, TOWN_R + 4, td));
      if (home) y = lerp(y, homeY, smooth(24, 9, Math.hypot(x - home.x, z - home.z)));
      // lair clearing
      const ld = Math.hypot(x - lair.x, z - lair.z);
      if (ld < 40) y = lerp(y, rawH(lair.x, lair.z) + 1, smooth(40, 14, ld) * 0.8);
      // boundary mountains
      const e = edgeDist(x, z);
      if (e > 0.9) {
        const m = smooth(0.9, 1.32, e);
        y += m * m * (58 + noise.fbm(x * 0.02, z * 0.02, 3) * 60) + m * 6;
      }
      h[j * V + i] = y;
    }
  }
  const hAt = (i: number, j: number) => h[clamp(j, 0, N) * V + clamp(i, 0, N)];
  const height = (x: number, z: number) => {
    const fx = (x + WORLD / 2) / CELL, fz = (z + WORLD / 2) / CELL;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    // match the triangle split used by the mesh (diagonal from (i,j+1) to (i+1,j))
    const h00 = hAt(i, j), h10 = hAt(i + 1, j), h01 = hAt(i, j + 1), h11 = hAt(i + 1, j + 1);
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  };
  const normal = (x: number, z: number, out: THREE.Vector3) => {
    const e = 1.2;
    return out.set(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize();
  };

  // --- splat weights + vertex colours ---
  const colors = new Float32Array(V * V * 3);
  const pos = new Float32Array(V * V * 3);
  const tmp = new THREE.Vector3();
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const k = j * V + i;
      const x = -WORLD / 2 + i * CELL, z = -WORLD / 2 + j * CELL, y = h[k];
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      const sx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * CELL), sz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * CELL);
      const slope = Math.hypot(sx, sz);
      let rock = smooth(0.55, 0.95, slope);
      const pd = pathDist(x, z);
      const td = Math.hypot(x - town.x, z - town.z);
      let path = Math.max(smooth(3.4, 1.2, pd + (noise.n(x * 0.3, z * 0.3) - 0.5) * 1.6), smooth(TOWN_R - 6, TOWN_R - 14, td + (noise.n(x * 0.2, z * 0.2) - 0.5) * 8) * 0.95);
      if (home) path = Math.max(path, smooth(15, 9, Math.hypot(x - home.x, z - home.z) + (noise.n(x * 0.25, z * 0.25) - 0.5) * 4) * 0.9);
      // shoreline mud / beach
      const shore = smooth(WATER_Y + 0.7, WATER_Y + 0.15, y);
      path = Math.max(path, shore);
      // patchy bare ground
      path = Math.max(path, smooth(0.72, 0.85, noise.fbm(x * 0.03 + 9, z * 0.03 + 3, 3)) * 0.7);
      if (zone.snow) rock = Math.max(rock, smooth(0.62, 0.74, noise.fbm(x * 0.05, z * 0.05, 2)) * 0.5);
      path *= 1 - rock;
      const grass = Math.max(0, 1 - path - rock);
      splat[k * 3] = grass; splat[k * 3 + 1] = path; splat[k * 3 + 2] = rock;
      // macro tint: broad light/dark patches + darker when wet/deep + ambient occlusion in valleys
      const macro = 0.82 + noise.fbm(x * 0.012 + 5, z * 0.012 - 8, 3) * 0.36;
      const under = smooth(WATER_Y, WATER_Y - 2.5, y);
      const m = macro * (1 - under * 0.45);
      colors[k * 3] = m * (1 - under * 0.2); colors[k * 3 + 1] = m; colors[k * 3 + 2] = m * (1 + under * 0.15);
    }
  }
  const idx = new Uint32Array(N * N * 6);
  let q = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b;
      idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: zone.groundTint });
  const [ta, tb, tc] = zone.ground.map(groundTexture);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tA = { value: ta }; sh.uniforms.tB = { value: tb }; sh.uniforms.tC = { value: tc };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec2 vTUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvTUv = position.xz * 0.22;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tA;\nuniform sampler2D tB;\nuniform sampler2D tC;\nvarying vec3 vSplat;\nvarying vec2 vTUv;')
      .replace(
        '#include <map_fragment>',
        `vec3 cA = mix(texture2D(tA, vTUv).rgb, texture2D(tA, vTUv * 0.27 + 0.37).rgb, 0.4);
         vec3 cB = mix(texture2D(tB, vTUv).rgb, texture2D(tB, vTUv * 0.31 + 0.11).rgb, 0.3);
         vec3 cC = mix(texture2D(tC, vTUv * 0.45).rgb, texture2D(tC, vTUv * 0.13 + 0.5).rgb, 0.35);
         vec3 sw = vSplat;
         // sharpen transitions using texture luminance as a height hint
         sw.x *= 0.6 + cA.g; sw.y *= 0.6 + cB.r; sw.z *= 0.8 + cC.r;
         sw = pow(sw, vec3(1.6));
         sw /= (sw.x + sw.y + sw.z + 1e-4);
         diffuseColor.rgb *= cA * sw.x + cB * sw.y + cC * sw.z;`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  const walkable = (x: number, z: number) => {
    if (edgeDist(x, z) > 0.97) return false;
    if (height(x, z) < WATER_Y - 0.35) return false;
    normal(x, z, tmp);
    return tmp.y > 0.72;
  };

  // wilderness camps: spots near a road, far from town
  const camps: THREE.Vector3[] = [];
  guard = 0;
  while (camps.length < 2 && guard++ < 400) {
    const x = (r() - 0.5) * 320, z = -170 + r() * 230;
    const pd = pathDist(x, z);
    if (pd < 6 || pd > 16 || !walkable(x, z)) continue;
    if (Math.hypot(x - town.x, z - town.z) < 110 || Math.hypot(x - lair.x, z - lair.z) < 60) continue;
    if (home && Math.hypot(x - home.x, z - home.z) < 80) continue;
    if (camps.some((c) => c.distanceTo(new THREE.Vector3(x, c.y, z)) < 120)) continue;
    normal(x, z, tmp);
    if (tmp.y < 0.97) continue;
    camps.push(new THREE.Vector3(x, height(x, z), z));
  }
  lair.y = height(lair.x, lair.z);

  // --- map image ---
  const MS = 384;
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = mapCanvas.height = MS;
  const mg = mapCanvas.getContext('2d')!;
  const img = mg.createImageData(MS, MS);
  const cols = zone.ground.map((kname) => MAP_COLORS[kname] ?? [128, 128, 128]);
  const span = PLAY * 2 + 24;
  for (let py = 0; py < MS; py++) {
    for (let px = 0; px < MS; px++) {
      const x = (px / MS - 0.5) * span, z = (py / MS - 0.5) * span;
      const fi = clamp(Math.round((x + WORLD / 2) / CELL), 0, N), fj = clamp(Math.round((z + WORLD / 2) / CELL), 0, N);
      const k = fj * V + fi;
      const y = h[k];
      let cr = 0, cg = 0, cb = 0;
      for (let s = 0; s < 3; s++) { const w = splat[k * 3 + s]; cr += cols[s][0] * w; cg += cols[s][1] * w; cb += cols[s][2] * w; }
      const shade = clamp(1 + (hAt(fi - 1, fj - 1) - hAt(fi + 1, fj + 1)) * 0.09, 0.55, 1.35);
      cr *= shade; cg *= shade; cb *= shade;
      if (y < WATER_Y) { const d = clamp((WATER_Y - y) / 2.5, 0, 1); cr = lerp(120, 60, d); cg = lerp(190, 140, d); cb = lerp(205, 180, d); }
      if (edgeDist(x, z) > 1) { cr = cr * 0.5 + 40; cg = cg * 0.5 + 38; cb = cb * 0.5 + 36; }
      const o = (py * MS + px) * 4;
      img.data[o] = cr; img.data[o + 1] = cg; img.data[o + 2] = cb; img.data[o + 3] = 255;
    }
  }
  mg.putImageData(img, 0, 0);

  const pathAt = (x: number, z: number) => {
    const fi = clamp(Math.round((x + WORLD / 2) / CELL), 0, N), fj = clamp(Math.round((z + WORLD / 2) / CELL), 0, N);
    return splat[(fj * V + fi) * 3 + 1];
  };
  return { zone, h, splat, town, home, lair, lakes, roads, camps, mesh, height, normal, pathAt, walkable, mapCanvas };
}
export const MAP_SPAN = PLAY * 2 + 24;
