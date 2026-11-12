// Sky dome, sun/moon, stars, clouds, fog and time-of-day lighting.
import * as THREE from 'three';
import type { ZoneDef } from './data';
import { clamp, rng, smooth } from './util';

interface Key { h: number; top: number; hor: number; sun: number; sunI: number; hemiS: number; hemiG: number; hemiI: number }

function softTex(size: number, stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function cloudTex(seed: number) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = 50 + r() * 156, y = 58 + (r() - 0.5) * 36, rad = 18 + r() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, rad * 1.5, rad * 0.7, 0, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Environment {
  group = new THREE.Group();
  sun = new THREE.DirectionalLight(0xffffff, 2);
  hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  fog = new THREE.FogExp2(0xffffff, 0.006);
  sunDir = new THREE.Vector3(0, 1, 0);
  night = 0; // 0 day .. 1 night
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private sunSprite: THREE.Sprite;
  private moonSprite: THREE.Sprite;
  private stars: THREE.Points;
  private clouds: THREE.Mesh[] = [];
  private keys: Key[] = [];
  private cTop = new THREE.Color(); private cHor = new THREE.Color(); private cA = new THREE.Color(); private cB = new THREE.Color();
  private density = 0.006;
  private birds: THREE.Mesh[] = [];
  private birdC = new THREE.Vector3();
  private birdOn = true;

  constructor(private scene: THREE.Scene, shadowSize: number) {
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, glow: { value: 1 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = (projectionMatrix * p).xyww; }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float t = pow(clamp(d.y * 1.15 + 0.02, 0.0, 1.0), 0.55);
          vec3 c = mix(hor, top, t); float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (pow(s, 6.0) * 0.22 + pow(s, 60.0) * 0.35) * glow * (1.0 - t * 0.5);
          c = mix(c, hor, smoothstep(0.0, -0.25, d.y) );
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const sunTex = softTex(128, [[0, 'rgba(255,255,255,1)'], [0.16, 'rgba(255,250,225,1)'], [0.22, 'rgba(255,235,170,0.45)'], [1, 'rgba(255,220,150,0)']]);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false, transparent: true }));
    this.sunSprite.scale.setScalar(190);
    this.sunSprite.renderOrder = -9;
    const moonTex = softTex(128, [[0, 'rgba(240,245,255,1)'], [0.2, 'rgba(225,235,255,1)'], [0.24, 'rgba(180,200,255,0.25)'], [1, 'rgba(150,180,255,0)']]);
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, depthWrite: false, fog: false, transparent: true }));
    this.moonSprite.scale.setScalar(110);
    this.moonSprite.renderOrder = -9;
    this.group.add(this.sunSprite, this.moonSprite);

    const r = rng(99);
    const sp = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const u = r() * Math.PI * 2, v = Math.acos(r() * 0.98);
      sp[i * 3] = Math.sin(v) * Math.cos(u) * 760; sp[i * 3 + 1] = Math.cos(v) * 760 + 5; sp[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 760;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: cloudTex(i + 3), transparent: true, depthWrite: false, fog: false, opacity: 0.9, side: THREE.DoubleSide }),
      );
      const a = r() * Math.PI * 2, d = 150 + r() * 520;
      m.position.set(Math.cos(a) * d, 150 + r() * 90, Math.sin(a) * d);
      const s = 220 + r() * 260;
      m.scale.set(s, s * 0.5, 1);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = r() * 6;
      m.renderOrder = -8;
      this.clouds.push(m);
      this.group.add(m);
    }

    // a distant flock circling overhead
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0, -0.5, 1.6, 0.25, -0.1, 0, 0, 0.5, -1.6, 0.25, -0.1, 0, 0, -0.5], 3));
    const bm = new THREE.MeshBasicMaterial({ color: 0x20242c, side: THREE.DoubleSide, fog: true });
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(bg, bm);
      b.userData = { a: r() * 6.28, rad: 14 + r() * 26, h: r() * 10, sp: 0.25 + r() * 0.2, ph: r() * 6 };
      b.frustumCulled = false;
      this.birds.push(b);
      scene.add(b);
    }
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.group, this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
  }

  setZone(z: ZoneDef) {
    this.density = z.fogDensity;
    this.birdOn = !z.snow;
    const snow = z.snow;
    this.keys = [
      { h: 0, top: 0x060b1c, hor: 0x121c33, sun: 0x8fa8e8, sunI: 0.55, hemiS: 0x4a5f9a, hemiG: 0x1c2233, hemiI: 0.75 },
      { h: 4.6, top: 0x060b1c, hor: 0x121c33, sun: 0x8fa8e8, sunI: 0.55, hemiS: 0x4a5f9a, hemiG: 0x1c2233, hemiI: 0.75 },
      { h: 6.2, top: 0x4a6aa8, hor: 0xf0a878, sun: 0xffb070, sunI: 1.5, hemiS: 0x9aa4c8, hemiG: 0x5a4a40, hemiI: 0.95 },
      { h: 8.2, top: z.skyTop, hor: z.fogDay, sun: 0xfff0d8, sunI: 2.6, hemiS: 0xcfe4ff, hemiG: snow ? 0x9aa6b4 : 0x6a6a48, hemiI: 1.25 },
      { h: 16.5, top: z.skyTop, hor: z.fogDay, sun: 0xfff0d8, sunI: 2.6, hemiS: 0xcfe4ff, hemiG: snow ? 0x9aa6b4 : 0x6a6a48, hemiI: 1.25 },
      { h: 18.8, top: 0x4a5a9a, hor: 0xf09060, sun: 0xff9a58, sunI: 1.6, hemiS: 0xa89ab8, hemiG: 0x5a4438, hemiI: 0.95 },
      { h: 20.4, top: 0x060b1c, hor: 0x121c33, sun: 0x8fa8e8, sunI: 0.55, hemiS: 0x4a5f9a, hemiG: 0x1c2233, hemiI: 0.75 },
      { h: 24, top: 0x060b1c, hor: 0x121c33, sun: 0x8fa8e8, sunI: 0.55, hemiS: 0x4a5f9a, hemiG: 0x1c2233, hemiI: 0.75 },
    ];
  }

  update(hour: number, focus: THREE.Vector3, camPos: THREE.Vector3, dt: number) {
    const keys = this.keys;
    let i = 0;
    while (i < keys.length - 2 && hour >= keys[i + 1].h) i++;
    const a = keys[i], b = keys[i + 1];
    const t = clamp((hour - a.h) / (b.h - a.h), 0, 1);
    const mix = (x: number, y: number, out: THREE.Color) => out.copy(this.cA.setHex(x)).lerp(this.cB.setHex(y), t);
    mix(a.top, b.top, this.cTop);
    mix(a.hor, b.hor, this.cHor);
    this.fog.color.copy(this.cHor);
    this.night = 1 - smooth(4.8, 7, hour) * (1 - smooth(18.6, 20.4, hour));
    this.fog.density = this.density * (1 + this.night * 0.35);
    (this.domeMat.uniforms.top.value as THREE.Color).copy(this.cTop);
    (this.domeMat.uniforms.hor.value as THREE.Color).copy(this.cHor);
    mix(a.sun, b.sun, this.sun.color);
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    mix(a.hemiS, b.hemiS, this.hemi.color);
    mix(a.hemiG, b.hemiG, this.hemi.groundColor);
    this.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * t;

    // sun path: rises 5.5, sets 19.5; moon takes over at night
    const dayT = (hour - 5.5) / 14;
    const sunAng = dayT * Math.PI;
    const sunPos = new THREE.Vector3(Math.cos(sunAng), Math.sin(sunAng) * 0.92 + 0.02, 0.38).normalize();
    const nightT = ((hour + 24 - 19.5) % 24) / 10;
    const moonAng = nightT * Math.PI;
    const moonPos = new THREE.Vector3(-Math.cos(moonAng), Math.sin(moonAng) * 0.8 + 0.05, -0.3).normalize();
    const useMoon = sunPos.y < 0.06;
    this.sunDir.copy(useMoon ? moonPos : sunPos);
    if (this.sunDir.y < 0.12) { this.sunDir.y = 0.12; this.sunDir.normalize(); }
    // fade light near the horizon hand-over to avoid popping
    const hand = useMoon ? smooth(0.02, 0.2, moonPos.y) : smooth(0.06, 0.2, sunPos.y);
    this.sun.intensity *= 0.06 + 0.94 * hand;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 120);

    this.group.position.copy(camPos);
    this.sunSprite.position.copy(sunPos).multiplyScalar(700);
    this.sunSprite.visible = sunPos.y > -0.12;
    this.moonSprite.position.copy(moonPos).multiplyScalar(700);
    this.moonSprite.visible = moonPos.y > -0.1 && this.night > 0.2;
    (this.moonSprite.material as THREE.SpriteMaterial).opacity = this.night;
    (this.domeMat.uniforms.sunDir.value as THREE.Vector3).copy(sunPos);
    (this.domeMat.uniforms.sunCol.value as THREE.Color).copy(this.sun.color);
    this.domeMat.uniforms.glow.value = (1 - this.night) * 1.6;
    (this.stars.material as THREE.PointsMaterial).opacity = smooth(0.5, 1, this.night) * 0.9;
    this.stars.rotation.y += dt * 0.003;
    if (this.birdC.distanceTo(camPos) > 260) this.birdC.set(camPos.x + 60, 0, camPos.z - 40);
    for (const b of this.birds) {
      const u = b.userData;
      b.visible = this.birdOn && this.night < 0.5;
      u.a += dt * u.sp;
      b.position.set(this.birdC.x + Math.cos(u.a) * u.rad, focus.y + 38 + u.h + Math.sin(u.a * 2 + u.ph) * 2, this.birdC.z + Math.sin(u.a) * u.rad);
      b.rotation.y = -u.a;
      b.scale.set(1, 1 + Math.sin(dt * 0 + u.a * 34 + u.ph) * 2.2, 1);
    }
    for (const c of this.clouds) {
      c.position.x += dt * 2.2;
      if (c.position.x > 700) c.position.x = -700;
      const m = c.material as THREE.MeshBasicMaterial;
      m.color.copy(this.cHor).lerp(this.cA.setHex(0xffffff), 0.55 * (1 - this.night)).multiplyScalar(1 - this.night * 0.55);
      m.opacity = 0.85 - this.night * 0.45;
    }
  }
}
