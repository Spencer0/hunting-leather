// Zone assembly: terrain, vegetation, grass, water, town, camps, colliders, interactables, NPCs.
import * as THREE from 'three';
import { clips, model, rawModel } from './assets';
import { icon } from './icons';
import type { ZoneDef } from './data';
import { CELL, PLAY, TOWN_R, WATER_Y, WORLD, buildTerrain, edgeDist, type Terrain } from './terrain';
import { Noise, clamp, rng, smooth, weighted } from './util';

export interface Collider { x: number; z: number; r: number; h: number; kind: 'tree' | 'rock' | 'building' | 'prop' }
export type StationKind = 'merchant' | 'fletcher' | 'tanner' | 'inn' | 'wagon' | 'board' | 'campfire' | 'bedroll';
export interface Station { kind: StationKind; pos: THREE.Vector3; radius: number; prompt: string; name: string; npc?: Npc }

const uTime = { value: 0 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

export class Npc {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  private baseRot: number;
  private idle: THREE.AnimationAction;
  private alt: THREE.AnimationAction | null = null;
  private timer = 3 + Math.random() * 5;
  constructor(modelName: string, public pos: THREE.Vector3, rotY: number, public name: string, working = false) {
    this.obj = model('chars/' + modelName);
    this.obj.scale.setScalar(CHAR_SCALE);
    this.obj.position.copy(pos);
    this.obj.rotation.y = rotY;
    this.baseRot = rotY;
    this.mixer = new THREE.AnimationMixer(this.obj);
    const find = (file: string, name: string) => clips('anims/' + file).find((c) => c.name === name)!;
    this.idle = this.mixer.clipAction(find('General', 'Idle_A'));
    this.idle.play();
    const altClip = working ? find('Tools', 'Working_A') : find('General', 'Idle_B');
    if (altClip) this.alt = this.mixer.clipAction(altClip);
    this.mixer.update(Math.random() * 2);
  }
  update(dt: number, player: THREE.Vector3) {
    const d = this.pos.distanceTo(player);
    if (d > 70) return;
    this.mixer.update(dt);
    let target = this.baseRot;
    if (d < 7) target = Math.atan2(player.x - this.pos.x, player.z - this.pos.z);
    let diff = (target - this.obj.rotation.y) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2; else if (diff < -Math.PI) diff += Math.PI * 2;
    this.obj.rotation.y += diff * Math.min(1, dt * 5);
    this.timer -= dt;
    if (this.timer < 0 && this.alt) {
      this.timer = 7 + Math.random() * 8;
      const on = this.alt.isRunning() && this.alt.getEffectiveWeight() > 0.5;
      if (on || d < 7) { this.alt.fadeOut(0.5); this.idle.reset().fadeIn(0.5).play(); }
      else { this.alt.reset().fadeIn(0.5).play(); this.idle.fadeOut(0.5); this.timer = 4; }
    }
  }
}
export const CHAR_SCALE = 0.74;
const TOWN_SCALE = 8.5;

function fireTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 40, 2, 32, 36, 30);
  gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,190,70,0.9)'); gr.addColorStop(0.65, 'rgba(240,90,20,0.45)'); gr.addColorStop(1, 'rgba(200,40,0,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(52, 26, 58, 44, 32, 62); g.bezierCurveTo(6, 44, 12, 26, 32, 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let fireTex: THREE.Texture | null = null;
function bladeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = 6 + r() * 116, lean = (r() - 0.5) * 26, hgt = 26 + r() * 36, w = 3 + r() * 3.5;
    const v = 200 + Math.floor(r() * 55);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.moveTo(x - w, 64); g.quadraticCurveTo(x - w * 0.4 + lean * 0.4, 64 - hgt * 0.6, x + lean, 64 - hgt); g.quadraticCurveTo(x + w * 0.6 + lean * 0.4, 64 - hgt * 0.5, x + w, 64); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  return t;
}
let bladeTex: THREE.Texture | null = null;

export class Zone {
  terrain: Terrain;
  group = new THREE.Group();
  stations: Station[] = [];
  npcs: Npc[] = [];
  fires: { pos: THREE.Vector3; sprites: THREE.Sprite[]; light: THREE.PointLight }[] = [];
  private grid = new Map<number, Collider[]>();
  private grassChunks: THREE.InstancedMesh[] = [];
  private lamps: THREE.PointLight[] = [];
  private markers: THREE.Sprite[] = [];
  private water: THREE.Mesh;
  private disposables: { dispose(): void }[] = [];
  noise: Noise;

  constructor(public def: ZoneDef, quality: number) {
    this.terrain = buildTerrain(def);
    this.noise = new Noise(def.seed + 1000);
    this.group.add(this.terrain.mesh);
    this.disposables.push(this.terrain.mesh.geometry, this.terrain.mesh.material as THREE.Material);
    this.water = this.buildWater();
    this.buildTown();
    this.buildCamps();
    this.buildVegetation(quality);
    this.buildGrass(quality);
  }

  // ---------- colliders ----------
  private key(x: number, z: number) { return (Math.floor(x / 8) + 512) * 1024 + (Math.floor(z / 8) + 512); }
  addCollider(c: Collider) {
    const x0 = Math.floor((c.x - c.r) / 8), x1 = Math.floor((c.x + c.r) / 8), z0 = Math.floor((c.z - c.r) / 8), z1 = Math.floor((c.z + c.r) / 8);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = (x + 512) * 1024 + (z + 512);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(c);
    }
  }
  near(x: number, z: number): Collider[] { return this.grid.get(this.key(x, z)) ?? EMPTY; }
  /** Push a circle out of static colliders. Returns true if it touched something. */
  resolve(pos: THREE.Vector3, radius: number): boolean {
    let hit = false;
    for (const c of this.near(pos.x, pos.z)) {
      const dx = pos.x - c.x, dz = pos.z - c.z, min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && pos.y < this.terrain.height(c.x, c.z) + c.h) {
        const d = Math.sqrt(d2) || 0.001;
        pos.x = c.x + (dx / d) * min; pos.z = c.z + (dz / d) * min;
        hit = true;
      }
    }
    return hit;
  }
  /** Segment test for projectiles against trunks/rocks/buildings. */
  segmentHit(a: THREE.Vector3, b: THREE.Vector3): Collider | null {
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    for (const c of this.near(mx, mz)) {
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((c.x - a.x) * dx + (c.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const px = a.x + dx * t, pz = a.z + dz * t, py = a.y + (b.y - a.y) * t;
      const rr = c.kind === 'tree' ? c.r * 0.75 : c.r * 0.9;
      if ((px - c.x) ** 2 + (pz - c.z) ** 2 < rr * rr && py < this.terrain.height(c.x, c.z) + c.h) return c;
    }
    return null;
  }

  // ---------- instanced scattering ----------
  private scatter(path: string, items: { x: number; y: number; z: number; s: number; ry: number; tilt?: number }[], opt: { tint?: number; leafTint?: number; shadow?: boolean; sway?: boolean; receive?: boolean }) {
    const src = rawModel(path);
    if (!src || !items.length) return;
    src.updateMatrixWorld(true);
    const CH = 90;
    const buckets = new Map<number, typeof items>();
    for (const it of items) {
      const k = Math.floor((it.x + WORLD / 2) / CH) * 32 + Math.floor((it.z + WORLD / 2) / CH);
      let b = buckets.get(k);
      if (!b) buckets.set(k, (b = []));
      b.push(it);
    }
    const mats = new Map<THREE.Material, THREE.Material>();
    src.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const srcMat = mesh.material as THREE.MeshLambertMaterial;
      let mat = mats.get(srcMat) as THREE.MeshLambertMaterial | undefined;
      if (!mat) {
        mat = srcMat.clone();
        const leafy = /lea|flower|petal|grass|plant|fern|bush/i.test(srcMat.name);
        const tint = leafy ? opt.leafTint ?? opt.tint : opt.tint;
        // foliage is recoloured from its luminance so green textures can turn amber, gold or frost-blue
        const recolor = leafy && tint !== undefined && tint !== 0xffffff && /lea|bush|fern|plant/i.test(srcMat.name) ? new THREE.Color(tint) : null;
        if (tint !== undefined && !recolor) mat.color.multiply(new THREE.Color(tint));
        if ((opt.sway && leafy) || recolor) {
          mat.onBeforeCompile = (sh) => {
            sh.uniforms.uTime = uTime;
            if (recolor) {
              sh.uniforms.uTint = { value: recolor };
              sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTint;').replace(
                '#include <map_fragment>',
                '#include <map_fragment>\nfloat lum = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTint * (0.35 + lum * 2.6), 0.88);',
              );
            }
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
               #ifdef USE_INSTANCING
               float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.27;
               float sw = max(transformed.y, 0.0);
               transformed.x += sin(uTime * 1.1 + ph + transformed.y * 0.35) * 0.018 * sw;
               transformed.z += cos(uTime * 0.9 + ph * 1.3 + transformed.x * 0.4) * 0.014 * sw;
               #endif`,
            );
          };
        }
        mats.set(srcMat, mat);
        this.disposables.push(mat);
      }
      for (const b of buckets.values()) {
        const im = new THREE.InstancedMesh(mesh.geometry, mat, b.length);
        for (let i = 0; i < b.length; i++) {
          const it = b[i];
          _e.set(it.tilt ?? 0, it.ry, 0, 'YXZ');
          _m.compose(_p.set(it.x, it.y, it.z), _q.setFromEuler(_e), _s.setScalar(it.s));
          _m.multiply(mesh.matrixWorld);
          im.setMatrixAt(i, _m);
        }
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = opt.shadow !== false;
        im.receiveShadow = !!opt.receive;
        this.group.add(im);
      }
    });
  }

  private buildVegetation(quality: number) {
    const def = this.def, t = this.terrain, r = rng(def.seed * 31 + 7), noise = this.noise;
    const occupied = new Map<number, number>();
    const occKey = (x: number, z: number) => Math.round(x / 3.2) * 4096 + Math.round(z / 3.2);
    const free = (x: number, z: number) => !occupied.has(occKey(x, z));
    const townD = (x: number, z: number) => Math.hypot(x - t.town.x, z - t.town.z);
    const forest = (x: number, z: number) => noise.fbm(x * 0.011 + 3, z * 0.011 - 7, 3);

    // trees
    const want = Math.round(350 * def.treeDensity * (quality === 0 ? 0.7 : 1));
    const lists: { x: number; y: number; z: number; s: number; ry: number; tilt?: number }[][] = def.trees.map(() => []);
    let placed = 0, tries = 0;
    while (placed < want && tries++ < want * 40) {
      const x = (r() - 0.5) * (PLAY * 2 + 110), z = (r() - 0.5) * (PLAY * 2 + 110);
      const e = edgeDist(x, z);
      if (e > 1.22) continue;
      const y = t.height(x, z);
      if (y < WATER_Y + 0.5) continue;
      if (townD(x, z) < TOWN_R + 7) continue;
      if (t.pathAt(x, z) > 0.25) continue;
      if (Math.hypot(x - t.lair.x, z - t.lair.z) < 15) continue;
      if (t.camps.some((c) => Math.hypot(x - c.x, z - c.z) < 7)) continue;
      const f = forest(x, z);
      const dens = e > 0.98 ? 0.85 : smooth(0.4, 0.62, f) * 0.95 + 0.05;
      if (r() > dens) continue;
      if (t.normal(x, z, _p).y < 0.62) continue;
      if (!free(x, z)) continue;
      occupied.set(occKey(x, z), 1);
      const ti = weighted(def.trees, r);
      const base = def.trees[ti][2] ?? 1;
      const s = base * (0.8 + r() * 0.55);
      lists[ti].push({ x, y: y - 0.15, z, s, ry: r() * Math.PI * 2 });
      const big = def.trees[ti][0].startsWith('Twisted');
      this.addCollider({ x, z, r: (big ? 0.95 : 0.42) * s, h: 6 * s, kind: 'tree' });
      placed++;
    }
    def.trees.forEach((tr, i) => this.scatter('nature/' + tr[0], lists[i], { leafTint: def.leafTint, tint: def.barkTint, sway: true }));

    // lair dressing: ring of dead trees + boulders
    const lairTrees: typeof lists[0] = [], lairRocks: typeof lists[0] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.3, d = 17 + r() * 5;
      const x = t.lair.x + Math.cos(a) * d, z = t.lair.z + Math.sin(a) * d;
      if (i % 3 === 0) { lairTrees.push({ x, y: t.height(x, z) - 0.2, z, s: 0.8 + r() * 0.3, ry: r() * 6 }); this.addCollider({ x, z, r: 0.5, h: 6, kind: 'tree' }); }
      else { const s = 0.9 + r() * 0.8; lairRocks.push({ x, y: t.height(x, z) - 0.3 * s, z, s, ry: r() * 6 }); this.addCollider({ x, z, r: 1.25 * s, h: 1.7 * s, kind: 'rock' }); }
    }
    this.scatter('nature/DeadTree_3', lairTrees, { tint: 0x9a9088 });
    this.scatter('nature/Rock_Medium_2', lairRocks, { tint: def.snow ? 0xdde6ee : def.id === 'sunscar' ? 0xd8a888 : 0xffffff, receive: true });

    // rocks
    const rockLists: typeof lists = [[], [], []];
    for (let i = 0, n = 0; n < def.rocks && i < def.rocks * 30; i++) {
      const x = (r() - 0.5) * (PLAY * 2 + 60), z = (r() - 0.5) * (PLAY * 2 + 60);
      if (edgeDist(x, z) > 1.15 || townD(x, z) < TOWN_R + 5 || t.pathAt(x, z) > 0.4 || !free(x, z)) continue;
      const y = t.height(x, z);
      if (y < WATER_Y - 0.6) continue;
      const rockiness = noise.fbm(x * 0.02 - 11, z * 0.02 + 5, 3);
      if (r() > smooth(0.35, 0.7, rockiness) + 0.12) continue;
      const s = 0.3 + Math.pow(r(), 2.2) * 1.25;
      occupied.set(occKey(x, z), 1);
      rockLists[Math.floor(r() * 3)].push({ x, y: y - 0.25 * s, z, s, ry: r() * 6, tilt: (r() - 0.5) * 0.3 });
      if (s > 0.42) this.addCollider({ x, z, r: 1.2 * s, h: 1.6 * s, kind: 'rock' });
      n++;
    }
    const rockTint = def.snow ? 0xdde6ee : def.id === 'sunscar' ? 0xd8a080 : def.id === 'amberwood' ? 0xc8beb0 : 0xffffff;
    rockLists.forEach((l, i) => this.scatter(`nature/Rock_Medium_${i + 1}`, l, { tint: rockTint, receive: true }));

    // bushes & plants
    const bushLists: typeof lists = def.bushes.map(() => []);
    const bwant = Math.round((quality === 0 ? 420 : 760) * (def.snow ? 0.35 : 1));
    for (let i = 0, n = 0; n < bwant && i < bwant * 30; i++) {
      const x = (r() - 0.5) * PLAY * 2.05, z = (r() - 0.5) * PLAY * 2.05;
      if (edgeDist(x, z) > 1.02 || townD(x, z) < TOWN_R + 2 || t.pathAt(x, z) > 0.3 || !free(x, z)) continue;
      const y = t.height(x, z);
      if (y < WATER_Y + 0.25 || t.normal(x, z, _p).y < 0.8) continue;
      const bi = weighted(def.bushes, r);
      const name = def.bushes[bi][0];
      const isBush = name.startsWith('Bush');
      if (isBush && r() > smooth(0.3, 0.6, forest(x, z)) + 0.2) continue;
      const s = (isBush ? 0.75 : name.startsWith('Mush') ? 1.6 : name.startsWith('Pebble') ? 2 : 0.6) * (0.7 + r() * 0.6);
      bushLists[bi].push({ x, y: y - 0.05, z, s, ry: r() * 6 });
      n++;
    }
    def.bushes.forEach((b, i) => this.scatter('nature/' + b[0], bushLists[i], { leafTint: def.bushTint, shadow: b[0].startsWith('Bush'), sway: true }));
  }

  private buildGrass(quality: number) {
    const def = this.def, t = this.terrain;
    if (!bladeTex) bladeTex = bladeTexture();
    const per = Math.round((quality === 0 ? 300 : quality === 1 ? 520 : 760) * def.grassAmount);
    if (per < 10) return;
    // tuft: three crossed quads, vertex colours fade root->tip, normals up so it lights like the ground
    const pos: number[] = [], uv: number[] = [], col: number[] = [], nor: number[] = [], idx: number[] = [];
    const c0 = new THREE.Color(def.grassColor).multiplyScalar(0.55), c1 = new THREE.Color(def.grassTip);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI, dx = Math.cos(a) * 0.5, dz = Math.sin(a) * 0.5, u0 = k * 0.31, b = pos.length / 3;
      pos.push(-dx, 0, -dz, dx, 0, dz, dx, 0.5, dz, -dx, 0.5, -dz);
      uv.push(u0, 0, u0 + 0.38, 0, u0 + 0.38, 1, u0, 1);
      col.push(c0.r, c0.g, c0.b, c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ map: bladeTex, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec3 ip = instanceMatrix[3].xyz;
         float fade = 1.0 - smoothstep(48.0, 74.0, distance(ip, cameraPosition));
         transformed.y *= fade;
         float w = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.28) + sin(uTime * 0.6 + ip.x * 0.08) * 1.4;
         transformed.x += w * 0.07 * uv.y;
         transformed.z += cos(uTime * 1.3 + ip.z * 0.4) * 0.05 * uv.y;`,
      );
    };
    this.disposables.push(geo, mat);
    const CH = 40, r = rng(def.seed * 13 + 1), cc = new THREE.Color();
    const half = Math.ceil((PLAY + 6) / CH);
    for (let cx = -half; cx < half; cx++) for (let cz = -half; cz < half; cz++) {
      const mats: THREE.Matrix4[] = [], cols: number[] = [];
      for (let i = 0; i < per; i++) {
        const x = (cx + r()) * CH, z = (cz + r()) * CH;
        const fi = clamp(Math.round((x + WORLD / 2) / CELL), 0, WORLD / CELL), fj = clamp(Math.round((z + WORLD / 2) / CELL), 0, WORLD / CELL);
        const g = t.splat[(fj * (WORLD / CELL + 1) + fi) * 3];
        if (g < 0.55 || r() > g) continue;
        const y = t.height(x, z);
        if (y < WATER_Y + 0.3 || edgeDist(x, z) > 1.04) continue;
        const patch = this.noise.fbm(x * 0.05, z * 0.05, 2);
        if (patch < 0.34) continue;
        const s = 0.65 + r() * 0.5 + patch * 0.45;
        _m.compose(_p.set(x, y - 0.04, z), _q.setFromEuler(_e.set(0, r() * 6.28, 0)), _s.set(s, s * (0.75 + r() * 0.6), s));
        mats.push(_m.clone());
        const v = 0.8 + r() * 0.4;
        cc.setRGB(v, v * (0.95 + r() * 0.1), v * 0.95);
        cols.push(cc.r, cc.g, cc.b);
      }
      if (!mats.length) continue;
      const im = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols), 3);
      im.computeBoundingSphere();
      im.userData.cx = (cx + 0.5) * CH; im.userData.cz = (cz + 0.5) * CH;
      im.receiveShadow = true;
      this.grassChunks.push(im);
      this.group.add(im);
    }
  }

  private buildWater() {
    const t = this.terrain, seg = 96, size = PLAY * 2 + 60;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, depth = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) depth[i] = WATER_Y - t.height(p.getX(i), p.getZ(i));
    geo.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, fog: true, depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, col: { value: new THREE.Color(this.def.waterColor) }, sky: { value: new THREE.Color(0xffffff) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, light: { value: 1 } }]),
      vertexShader: `attribute float depth; varying float vDepth; varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vDepth = depth; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; uniform vec3 col; uniform vec3 sky; uniform vec3 sunDir; uniform float light; varying float vDepth; varying vec3 vW;
        #include <common>
        #include <fog_pars_fragment>
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          if (vDepth < -0.05) discard;
          vec2 uv = vW.xz;
          float n1 = vn(uv * 0.55 + vec2(uTime * 0.35, uTime * 0.2)); float n2 = vn(uv * 1.3 - vec2(uTime * 0.3, -uTime * 0.25));
          float rip = n1 * 0.6 + n2 * 0.4;
          vec3 n = normalize(vec3((n1 - 0.5) * 0.5, 1.0, (n2 - 0.5) * 0.5));
          vec3 v = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(v, n), 0.0), 3.0);
          vec3 deep = col * 0.55, shallow = col * 1.25 + vec3(0.05, 0.1, 0.08);
          vec3 c = mix(shallow, deep, smoothstep(0.0, 2.2, vDepth));
          c = mix(c, sky, fres * 0.6);
          float spec = pow(max(dot(reflect(-sunDir, n), v), 0.0), 90.0);
          c += spec * 0.9 * light;
          float caust = smoothstep(0.62, 0.9, rip) * 0.16 * (1.0 - smoothstep(0.0, 2.0, vDepth));
          c += caust;
          float foam = smoothstep(0.16, 0.0, vDepth + (rip - 0.5) * 0.12 + sin(uTime * 1.5 + vDepth * 30.0) * 0.02);
          c = mix(c, vec3(0.92, 0.97, 1.0), foam * 0.5);
          c *= light;
          float a = mix(0.55, 0.92, smoothstep(0.0, 1.6, vDepth)); a = max(a, fres * 0.9); a = mix(a, 0.8, foam) * smoothstep(-0.05, 0.08, vDepth);
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = WATER_Y;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
    return mesh;
  }

  private tintCache = new Map<string, THREE.Material>();
  private prop(path: string, x: number, z: number, ry: number, scale: number, collide = 0, yOff = 0, tint?: number) {
    const o = model(path);
    if (tint !== undefined) {
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshLambertMaterial, key = src.uuid + tint;
        let mat = this.tintCache.get(key) as THREE.MeshLambertMaterial | undefined;
        if (!mat) { mat = src.clone(); mat.color.multiply(new THREE.Color(tint)); this.tintCache.set(key, mat); this.disposables.push(mat); }
        mesh.material = mat;
      });
    }
    o.scale.setScalar(scale);
    o.position.set(x, this.terrain.height(x, z) + yOff, z);
    o.rotation.y = ry;
    o.traverse((m) => { (m as THREE.Mesh).receiveShadow = true; });
    this.group.add(o);
    if (collide > 0) this.addCollider({ x, z, r: collide, h: 30, kind: collide > 2 ? 'building' : 'prop' });
    return o;
  }
  private marker(kind: StationKind, pos: THREE.Vector3, h: number) {
    const ic: Record<string, [string, string]> = { merchant: ['coin', '#e0b040'], fletcher: ['bow', '#c8a070'], tanner: ['hide', '#b98a58'], inn: ['bed', '#c86a5a'], wagon: ['wagon', '#99643a'], board: ['scroll', '#e8dcc0'] };
    const def = ic[kind];
    if (!def) return;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      const g = c.getContext('2d')!;
      g.fillStyle = '#2a1c10'; g.beginPath(); g.arc(48, 44, 40, 0, 7); g.fill(); g.beginPath(); g.moveTo(34, 78); g.lineTo(48, 96); g.lineTo(62, 78); g.fill();
      g.fillStyle = '#f5ead0'; g.beginPath(); g.arc(48, 44, 34, 0, 7); g.fill();
      g.drawImage(img, 20, 16, 56, 56);
      tex.needsUpdate = true;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(icon(def[0], def[1], 56));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    s.scale.setScalar(0.85);
    s.position.set(pos.x, pos.y + h, pos.z);
    s.userData.y = pos.y + h;
    s.renderOrder = 6;
    this.markers.push(s);
    this.group.add(s);
    this.disposables.push(tex, s.material);
  }
  private fire(pos: THREE.Vector3) {
    if (!fireTex) fireTex = fireTexture();
    const sprites: THREE.Sprite[] = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      s.position.copy(pos).setY(pos.y + 0.45 + i * 0.16);
      sprites.push(s);
      this.group.add(s);
    }
    const light = new THREE.PointLight(0xff9a40, 0, 16, 1.6);
    light.position.copy(pos).setY(pos.y + 1);
    this.group.add(light);
    this.fires.push({ pos, sprites, light });
  }

  private buildTown() {
    const t = this.terrain, c = t.town, id = this.def.id;
    const at = (deg: number, rad: number): [number, number] => [c.x + Math.sin((deg * Math.PI) / 180) * rad, c.z - Math.cos((deg * Math.PI) / 180) * rad];
    const face = (x: number, z: number) => Math.atan2(c.x - x, c.z - z);
    const building = (name: string, deg: number, rad: number, colR: number, s = TOWN_SCALE) => {
      const [x, z] = at(deg, rad);
      return this.prop('town/building_' + name, x, z, face(x, z), s, colR, -0.05);
    };
    building('tavern_blue', 0, 29, 5.6);
    building('home_A_blue', 40, 30, 3.6);
    building('market_blue', 80, 30, 6.4);
    building('blacksmith_blue', 124, 30, 5.2);
    building('home_B_blue', 157, 31, 3.6);
    building('workshop_blue', -80, 30, 5.2);
    building('stables_blue', -124, 30, 5.4);
    building('home_B_blue', -40, 30, 3.6);
    building('home_A_blue', -157, 31, 3.6);
    const extra = id === 'greenhollow' ? 'windmill_blue' : id === 'amberwood' ? 'lumbermill_blue' : id === 'sunscar' ? 'watchtower_blue' : 'church_blue';
    building(extra, 20, 41, 4.6);
    building(id === 'frostfang' ? 'townhall_blue' : 'home_A_blue', -20, 41, 4);
    this.prop('town/building_well_blue', c.x, c.z, 0, 6, 1.6);

    const npcNames: Record<string, string[]> = {
      greenhollow: ['Maren', 'Tobb', 'Old Garrick', 'Wenna', 'Pike'], amberwood: ['Isolde', 'Brannoc', 'Hesper', 'Odo', 'Sable'],
      sunscar: ['Zahir', 'Kessa', 'Big Dov', 'Amira', 'Rook'], frostfang: ['Yrsa', 'Halvard', 'Bjorn', 'Sigrun', 'Ketil'],
    };
    const nm = npcNames[id];
    const station = (kind: StationKind, deg: number, rad: number, radius: number, prompt: string, name: string, npcModel?: string, npcOff: [number, number] = [0, 0], working = false) => {
      const [x, z] = at(deg, rad);
      const pos = new THREE.Vector3(x, t.height(x, z), z);
      let npc: Npc | undefined;
      if (npcModel) {
        const [nx, nz] = at(deg + npcOff[0], rad + npcOff[1]);
        npc = new Npc(npcModel, new THREE.Vector3(nx, t.height(nx, nz), nz), face(nx, nz), name, working);
        this.npcs.push(npc);
        this.group.add(npc.obj);
        this.addCollider({ x: nx, z: nz, r: 0.45, h: 2, kind: 'prop' });
      }
      const st: Station = { kind, pos, radius, prompt, name, npc };
      this.stations.push(st);
      this.marker(kind, npc ? npc.pos : pos, npc ? 2.5 : 3.1);
      return st;
    };
    // Merchant stall
    {
      const [x, z] = at(80, 19.5);
      this.prop('props/Stall_Empty', x, z, face(x, z), 1.05, 1.2);
      const [bx, bz] = at(88, 19); this.prop('props/Crate_Wooden', bx, bz, 0.4, 1.0, 0.6);
      const [ax, az] = at(72, 19.2); this.prop('props/Barrel_Apples', ax, az, 0, 1.0, 0.5);
      const [sx, sz] = at(91, 20.5); this.prop('props/FarmCrate_Apple', sx, sz, 1, 1.0, 0.5);
      station('merchant', 80, 17.6, 3.2, 'Trade', `${nm[0]} the Merchant`, 'Mage', [0, 2.9]);
    }
    // Fletcher
    {
      const [x, z] = at(118, 20.5);
      this.prop('props/WeaponStand', x, z, face(x, z), 1.1, 0.8);
      const [dx, dz] = at(133, 21); this.prop('props/Dummy', dx, dz, face(dx, dz) + 0.4, 1.0, 0.5);
      const [tx, tz] = at(140, 24); this.prop('town/target', tx, tz, face(tx, tz), 7, 0.8);
      const [bx, bz] = at(111, 21.5); this.prop('town/bucket_arrows', bx, bz, 0, 6, 0.4);
      station('fletcher', 125, 18, 3.2, 'Browse weapons', `${nm[1]} the Fletcher`, 'Knight', [0, 1.6]);
    }
    // Tanner + bench
    {
      const [x, z] = at(-84, 19.5);
      this.prop('props/Workbench', x, z, face(x, z) + Math.PI, 1.05, 1.1);
      const [px, pz] = at(-96, 22); this.prop('props/Peg_Rack', px, pz, face(px, pz), 1.2, 0, 1.2);
      const [cx, cz] = at(-70, 20.5); this.prop('props/Chest_Wood', cx, cz, face(cx, cz), 1.0, 0.6);
      const [kx, kz] = at(-64, 22); this.prop('props/Barrel', kx, kz, 0, 1.0, 0.5);
      station('tanner', -84, 17.6, 3.2, 'Use tanning bench', `${nm[2]} the Tanner`, 'Barbarian', [9, 1.2], true);
    }
    // Inn
    {
      const [bx, bz] = at(-9, 21); this.prop('props/Bench', bx, bz, face(bx, bz), 1.05, 0.8);
      const [tx, tz] = at(10, 21.5); this.prop('props/Table_Large', tx, tz, face(tx, tz), 1.1, 1.1);
      const [sx, sz] = at(15, 20); this.prop('props/Stool', sx, sz, 0, 1.0, 0);
      station('inn', 0, 20, 3.2, 'Talk to the innkeeper', `${nm[3]} the Innkeeper`, 'Druid', [0, 1.6]);
    }
    // Wagon
    {
      const [x, z] = at(-128, 19);
      this.prop('town/cart_merchant', x, z, face(x, z) + 1.2, 7, 1.9);
      const [hx, hz] = at(-140, 22); this.prop('town/haybale', hx, hz, 0.5, 7, 0.9);
      const [qx, qz] = at(-112, 22.5); this.prop('town/trough', qx, qz, face(qx, qz), 7, 0.8);
      station('wagon', -124, 16, 3.2, 'Travel', `${nm[4]} the Wagoner`, 'Rogue_Hooded', [-8, 0.4]);
    }
    // Notice board
    {
      const [x, z] = at(196, 9);
      const g = new THREE.Group();
      const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2e }), paper = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
      const postG = new THREE.BoxGeometry(0.16, 2.4, 0.16);
      const p1 = new THREE.Mesh(postG, wood), p2 = new THREE.Mesh(postG, wood);
      p1.position.set(-0.95, 1.2, 0); p2.position.set(0.95, 1.2, 0);
      const board = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.25, 0.1), wood); board.position.y = 1.55;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.5), wood); roof.position.y = 2.42; roof.rotation.x = 0.15;
      g.add(p1, p2, board, roof);
      const rr = rng(7);
      for (let i = 0; i < 5; i++) {
        const n = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.44), paper);
        n.position.set(-0.75 + i * 0.37, 1.5 + (rr() - 0.5) * 0.3, 0.06); n.rotation.z = (rr() - 0.5) * 0.3;
        g.add(n);
      }
      g.traverse((o) => { o.castShadow = true; });
      g.position.set(x, t.height(x, z), z);
      g.rotation.y = face(x, z);
      this.group.add(g);
      this.disposables.push(wood, paper, postG);
      this.addCollider({ x, z, r: 0.9, h: 3, kind: 'prop' });
      station('board', 196, 7.6, 2.6, 'Read the notice board', 'Notice Board');
    }
    // town campfire
    {
      const [x, z] = at(150, 12);
      this.prop('props/k_campfire-pit', x, z, 0, 5.5, 0.7, 0, 0x9a8a80);
      const pos = new THREE.Vector3(x, t.height(x, z), z);
      this.fire(pos);
      const [lx, lz] = at(163, 13.5); this.prop('props/k_tree-log', lx, lz, 1.2, 3.6, 0.6, 0, 0x8a6a50);
      this.stations.push({ kind: 'campfire', pos, radius: 2.6, prompt: 'Cook at the fire', name: 'Campfire' });
    }
    // dressing
    const flag = `town/flag_${id === 'greenhollow' ? 'green' : id === 'amberwood' ? 'red' : id === 'sunscar' ? 'yellow' : 'blue'}`;
    for (const d of [171, 189]) { const [x, z] = at(d, 34); this.prop(flag, x, z, face(x, z), 9, 0.3); }
    const deco: [string, number, number, number, number][] = [
      ['town/barrel', 30, 22, 7, 0.7], ['town/crate_A_big', 52, 24, 7, 0.9], ['town/sack', 58, 22.5, 7, 0], ['town/wheelbarrow', -52, 24, 7, 0.9], ['town/resource_lumber', -100, 26, 7, 1],
      ['town/crate_long_A', 102, 25, 7, 0.9], ['town/barrel', 146, 26, 7, 0.7], ['town/pallet', -146, 26, 7, 0], ['town/weaponrack', 106, 23, 7, 0.7], ['props/Banner_1', -14, 24.5, 1.2, 0.2], ['props/Banner_2', 14, 24.5, 1.2, 0.2],
    ];
    for (const [p, d, rad, s, col] of deco) { const [x, z] = at(d, rad); this.prop(p, x, z, face(x, z) + (d % 7) * 0.3, s, col); }
    // lamp lights
    for (const d of [0, 120, -120]) {
      const [x, z] = at(d, 12);
      const l = new THREE.PointLight(0xffc070, 0, 26, 1.4);
      l.position.set(x, c.y + 3.2, z);
      this.lamps.push(l);
      this.group.add(l);
      const post = this.prop('props/Torch_Metal', x, z, 0, 1.6, 0.2);
      post.userData.lamp = l;
    }
  }

  /** A simple canvas ridge tent. */
  private tent(x: number, z: number, ry: number) {
    const w = 1.5, h = 1.9, l = 1.7;
    const g = new THREE.BufferGeometry();
    // two sloped sides + back triangle
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      -w, 0, -l, 0, h, -l, 0, h, l, -w, 0, -l, 0, h, l, -w, 0, l,
      w, 0, -l, 0, h, l, 0, h, -l, w, 0, -l, w, 0, l, 0, h, l,
      -w, 0, -l, w, 0, -l, 0, h, -l,
    ], 3));
    g.computeVertexNormals();
    const canvas = new THREE.MeshLambertMaterial({ color: this.def.snow ? 0xb8a890 : 0xd8c49a, side: THREE.DoubleSide });
    const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2e });
    const grp = new THREE.Group();
    const cloth = new THREE.Mesh(g, canvas);
    const poleG = new THREE.CylinderGeometry(0.05, 0.05, h + 0.25, 6);
    const p1 = new THREE.Mesh(poleG, wood), p2 = new THREE.Mesh(poleG, wood);
    p1.position.set(0, (h + 0.25) / 2, l); p2.position.set(0, (h + 0.25) / 2, -l);
    grp.add(cloth, p1, p2);
    grp.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    grp.position.set(x, this.terrain.height(x, z) - 0.03, z);
    grp.rotation.y = ry;
    this.group.add(grp);
    this.disposables.push(g, canvas, wood, poleG);
    this.addCollider({ x, z, r: 1.5, h: 2, kind: 'prop' });
  }

  private buildCamps() {
    const t = this.terrain;
    for (const c of t.camps) {
      this.prop('props/k_campfire-pit', c.x, c.z, 0, 5.5, 0.7, 0, 0x9a8a80);
      this.fire(c.clone());
      this.stations.push({ kind: 'campfire', pos: c.clone(), radius: 2.6, prompt: 'Cook at the fire', name: 'Campfire' });
      this.tent(c.x + 3.8, c.z - 2.4, -0.9);
      const bx = c.x - 2.6, bz = c.z - 2.4;
      this.prop('props/k_bedroll', bx, bz, 0.7, 4.6, 0, 0, 0xb89a80);
      this.stations.push({ kind: 'bedroll', pos: new THREE.Vector3(bx, t.height(bx, bz), bz), radius: 2, prompt: 'Rest until morning', name: 'Bedroll' });
      this.prop('props/k_tree-log', c.x + 0.4, c.z + 3, 0.2, 3.6, 0.6, 0, 0x8a6a50);
    }
  }

  update(dt: number, time: number, cam: THREE.Vector3, player: THREE.Vector3, night: number, sky: THREE.Color, sunDir: THREE.Vector3, sunI: number) {
    uTime.value = time;
    const wu = (this.water.material as THREE.ShaderMaterial).uniforms;
    wu.uTime.value = time;
    (wu.sky.value as THREE.Color).copy(sky);
    (wu.sunDir.value as THREE.Vector3).copy(sunDir);
    wu.light.value = 0.35 + 0.65 * (1 - night);
    for (const g of this.grassChunks) g.visible = Math.hypot(g.userData.cx - cam.x, g.userData.cz - cam.z) < 104;
    for (const n of this.npcs) n.update(dt, player);
    for (const f of this.fires) {
      const d = f.pos.distanceTo(cam);
      const vis = d < 140;
      f.sprites.forEach((s, i) => {
        s.visible = vis;
        const k = 0.75 + Math.sin(time * (9 + i * 3.1) + i * 2 + f.pos.x) * 0.16 + Math.sin(time * 23 + i) * 0.06;
        s.scale.set((1.15 - i * 0.28) * k, (1.5 - i * 0.3) * (1.6 - k * 0.6), 1);
      });
      f.light.intensity = d < 70 ? (14 + Math.sin(time * 11 + f.pos.z) * 3 + Math.sin(time * 27) * 1.5) * (0.35 + night * 0.65) : 0;
    }
    for (const l of this.lamps) l.intensity = night * 26;
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i], d = Math.hypot(m.position.x - player.x, m.position.z - player.z);
      m.visible = d < 46 && d > 3.4;
      m.position.y = m.userData.y + Math.sin(time * 2 + i) * 0.12;
      (m.material as THREE.SpriteMaterial).opacity = Math.min(1, (46 - d) / 10, (d - 3.4) / 2);
    }
  }

  nearestFire(p: THREE.Vector3) {
    let best = 1e9;
    for (const f of this.fires) best = Math.min(best, f.pos.distanceTo(p));
    return best;
  }
  nearestWater(p: THREE.Vector3) {
    let best = 1e9;
    for (const l of this.terrain.lakes) best = Math.min(best, Math.hypot(p.x - l.x, p.z - l.z) - l.r);
    return best;
  }
  inTown(p: THREE.Vector3, margin = 0) { return Math.hypot(p.x - this.terrain.town.x, p.z - this.terrain.town.z) < TOWN_R + margin; }

  dispose() {
    this.group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
const EMPTY: Collider[] = [];
