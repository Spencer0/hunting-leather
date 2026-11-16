// Charming markers for things worth picking up: butterflies and a soft glow over herbs,
// a twinkling star and light beam over dropped ammunition.
import * as THREE from 'three';

function tex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let T: { halo: THREE.Texture; star: THREE.Texture; wing: THREE.Texture; beam: THREE.Texture } | null = null;
function textures() {
  if (T) return T;
  T = {
    halo: tex(128, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }),
    star: tex(128, (g, s) => {
      const c = s / 2;
      const gr = g.createRadialGradient(c, c, 0, c, c, c);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      g.fillStyle = '#fff';
      g.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? c * 0.13 : c * 0.98; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
      g.closePath(); g.fill();
    }),
    wing: tex(64, (g, s) => {
      // one wing, hinge on the left edge
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(0, s * 0.5); g.bezierCurveTo(s * 0.2, -s * 0.1, s * 1.05, -s * 0.05, s * 0.95, s * 0.42); g.bezierCurveTo(s * 0.9, s * 0.6, s * 0.3, s * 0.55, 0, s * 0.5); g.fill();
      g.beginPath(); g.moveTo(0, s * 0.5); g.bezierCurveTo(s * 0.4, s * 0.5, s * 0.85, s * 0.6, s * 0.7, s * 0.9); g.bezierCurveTo(s * 0.5, s * 1.05, s * 0.15, s * 0.8, 0, s * 0.5); g.fill();
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(s * 0.7, s * 0.22, s * 0.1, 0, 7); g.arc(s * 0.55, s * 0.78, s * 0.07, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3; g.strokeRect(-2, -2, s + 4, s + 4);
    }),
    beam: tex(64, (g, s) => {
      const gr = g.createLinearGradient(0, s, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      const gx = g.createLinearGradient(0, 0, s, 0);
      gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, s, s);
    }),
  };
  return T;
}
const haloGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const wingGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0).rotateX(-Math.PI / 2); // flat, hinge along z through the origin

interface Fly { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; ph: number; rad: number; sp: number; h: number }

export class Lure {
  group = new THREE.Group();
  private halo: THREE.Mesh; private haloMat: THREE.MeshBasicMaterial;
  private star: THREE.Sprite | null = null; private beam: THREE.Sprite | null = null;
  private flies: Fly[] = [];
  private mats: THREE.Material[] = [];
  private seed = Math.random() * 10;
  private leave = -1; // seconds since released (butterflies scatter)
  gone = false;

  constructor(color: number, private kind: 'herb' | 'drop') {
    const t = textures();
    const col = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35);
    this.haloMat = new THREE.MeshBasicMaterial({ map: t.halo, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.halo = new THREE.Mesh(haloGeo, this.haloMat);
    this.halo.position.y = 0.06; this.halo.renderOrder = 4;
    this.group.add(this.halo);
    this.mats.push(this.haloMat);
    if (kind === 'drop') {
      const sm = new THREE.SpriteMaterial({ map: t.star, color: 0xfff2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      this.star = new THREE.Sprite(sm);
      const bm = new THREE.SpriteMaterial({ map: t.beam, color: 0xffe9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.5 });
      this.beam = new THREE.Sprite(bm);
      this.beam.center.set(0.5, 0); this.beam.scale.set(0.5, 2.6, 1);
      this.group.add(this.beam, this.star);
      this.mats.push(sm, bm);
    } else {
      const wcol = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25);
      const wm = new THREE.MeshBasicMaterial({ map: t.wing, color: wcol, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, fog: true });
      this.mats.push(wm);
      for (let i = 0; i < 2; i++) {
        const g = new THREE.Group(), l = new THREE.Mesh(wingGeo, wm), r = new THREE.Mesh(wingGeo, wm);
        r.scale.x = -1;
        g.add(l, r);
        g.scale.setScalar(0.17 + Math.random() * 0.05);
        this.group.add(g);
        this.flies.push({ g, l, r, ph: Math.random() * 6.28, rad: 0.55 + Math.random() * 0.5, sp: (0.7 + Math.random() * 0.5) * (i ? -1 : 1), h: 0.7 + Math.random() * 0.5 });
      }
    }
  }
  /** Something took it: herbs' butterflies fly off, everything else winks out. */
  release() { if (this.leave < 0) this.leave = 0; }
  update(time: number, dist: number, dt: number) {
    const vis = dist < 55 && !this.gone;
    this.group.visible = vis;
    if (!vis) return;
    if (this.leave >= 0) { this.leave += dt; if (this.leave > 1.6) { this.gone = true; this.group.visible = false; return; } }
    const out = this.leave >= 0 ? Math.max(0, 1 - this.leave / (this.kind === 'herb' ? 1.6 : 0.3)) : 1;
    const near = Math.max(0, 1 - dist / 6); // perks up as you approach
    const far = Math.min(1, (55 - dist) / 12);
    const t = time + this.seed;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    const hs = (this.kind === 'herb' ? 1.5 : 1.1) * (0.85 + pulse * 0.25 + near * 0.35);
    this.halo.scale.set(hs, 1, hs);
    this.halo.rotation.y = t * 0.4;
    this.haloMat.opacity = (0.28 + pulse * 0.22 + near * 0.3) * far * (this.leave >= 0 ? Math.max(0, 1 - this.leave * 4) : 1);
    if (this.star && this.beam) {
      const tw = Math.pow(Math.max(0, Math.sin(t * 1.9)), 6); // a slow breath with a sharp twinkle
      const s = 0.32 + pulse * 0.08 + tw * 0.3 + near * 0.12;
      this.star.scale.set(s, s, 1);
      this.star.position.y = 1.05 + Math.sin(t * 1.6) * 0.12;
      (this.star.material as THREE.SpriteMaterial).rotation = t * 0.7;
      (this.star.material as THREE.SpriteMaterial).opacity = far * out;
      (this.beam.material as THREE.SpriteMaterial).opacity = (0.28 + pulse * 0.2) * far * out;
    }
    for (const f of this.flies) {
      // lazy figure-of-eight around the plant; rise and scatter when it is picked
      const a = t * f.sp + f.ph, rad = f.rad * (1 + (this.leave >= 0 ? this.leave * 2.2 : 0));
      const x = Math.sin(a) * rad, z = Math.sin(a * 2) * rad * 0.55;
      const y = f.h + Math.sin(t * 2.3 + f.ph) * 0.16 + (this.leave >= 0 ? this.leave * this.leave * 2.6 : 0);
      f.g.rotation.y = Math.atan2(x - f.g.position.x, z - f.g.position.z);
      f.g.position.set(x, y, z);
      const flap = 0.15 + Math.abs(Math.sin(t * 17 + f.ph)) * 1.15;
      f.l.rotation.z = flap; f.r.rotation.z = -flap;
      f.g.visible = dist < 42;
    }
  }
  dispose() { this.group.removeFromParent(); for (const m of this.mats) m.dispose(); }
}
