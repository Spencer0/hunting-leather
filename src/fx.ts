// CPU particle pool rendered as soft points: hit puffs, dust, splashes, ambient weather.
import * as THREE from 'three';
import { G } from './ctx';
import { WATER_Y } from './terrain';

const MAX = 1400;
export class Fx {
  points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 4);
  private size = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private max = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private base = new Float32Array(MAX);
  private next = 0;
  private ambT = 0;
  private c = new THREE.Color();

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute vec4 pcolor; attribute float psize; varying vec4 vC; uniform float scale;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = psize * scale / max(-mv.z, 0.1); }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(d)); if (a * vC.a < 0.01) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); 
        #include <colorspace_fragment>
      }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, alpha = 1, gravity = 0) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grav[i] = gravity; this.base[i] = alpha;
    this.c.setHex(color);
    this.col[i * 4] = this.c.r; this.col[i * 4 + 1] = this.c.g; this.col[i * 4 + 2] = this.c.b; this.col[i * 4 + 3] = alpha;
  }
  burst(p: THREE.Vector3, color: number, n: number, speed: number, size = 0.12, life = 0.6, gravity = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, u = Math.random() * 2 - 0.4, s = speed * (0.4 + Math.random() * 0.8);
      this.emit(p.x, p.y, p.z, Math.cos(a) * s, u * s * 0.7 + speed * 0.4, Math.sin(a) * s, life * (0.6 + Math.random() * 0.7), size * (0.6 + Math.random() * 0.9), color, 0.95, gravity);
    }
  }
  dust(p: THREE.Vector3) {
    const snow = G.zone.def.snow;
    for (let i = 0; i < 3; i++) this.emit(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.08, p.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6, 0.7, 0.3, snow ? 0xffffff : 0xb8a888, 0.35, -0.3);
  }
  splash(x: number, z: number) {
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; this.emit(x, WATER_Y + 0.05, z, Math.cos(a) * 1.3, 1.8 + Math.random() * 1.6, Math.sin(a) * 1.3, 0.5, 0.1, 0xe8f6ff, 0.8, 9); }
  }

  update(dt: number, cam: THREE.Vector3) {
    // ambient: pollen / falling leaves / snow / dust depending on zone
    const z = G.zone;
    if (z) {
      this.ambT += dt;
      const id = z.def.id, night = G.env.night;
      const rate = id === 'frostfang' ? 0.012 : id === 'amberwood' ? 0.06 : 0.05;
      while (this.ambT > rate) {
        this.ambT -= rate;
        const x = cam.x + (Math.random() - 0.5) * 44, zz = cam.z + (Math.random() - 0.5) * 44, gy = z.terrain.height(x, zz);
        if (id === 'frostfang') this.emit(x, cam.y + 4 + Math.random() * 9, zz, 1.2 + Math.random(), -1.6 - Math.random(), 0.4, 5, 0.07 + Math.random() * 0.05, 0xffffff, 0.85, 0);
        else if (id === 'amberwood') this.emit(x, gy + 5 + Math.random() * 7, zz, 0.6 + Math.random() * 0.6, -0.9 - Math.random() * 0.5, (Math.random() - 0.5) * 0.8, 7, 0.11, [0xe08a2a, 0xd0a030, 0xb85a20][Math.floor(Math.random() * 3)], 0.9, 0);
        else if (id === 'sunscar') this.emit(x, gy + 0.3 + Math.random() * 1.5, zz, 2.2 + Math.random() * 1.5, 0.1, 0.5, 3.5, 0.09, 0xe8d0a0, 0.3, 0);
        else if (night > 0.6) this.emit(x, gy + 0.5 + Math.random() * 1.8, zz, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5, 4, 0.09, 0xd8ff70, 0.9, 0);
        else this.emit(x, gy + 0.6 + Math.random() * 3, zz, 0.3 + Math.random() * 0.3, 0.05, (Math.random() - 0.5) * 0.3, 5, 0.06, 0xfff8d0, 0.4, 0);
      }
    }
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = this.life[i] / this.max[i];
      this.col[i * 4 + 3] = this.base[i] * Math.min(1, k * 3) * Math.min(1, (1 - k) * 8 + 0.2);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.pcolor.needsUpdate = true; g.attributes.psize.needsUpdate = true;
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = G.renderer.domElement.height * 0.9;
  }
  clear() { this.life.fill(0); this.col.fill(0); }
}
