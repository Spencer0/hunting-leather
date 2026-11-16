// Small game built from a handful of primitives and animated in code: rabbits and squirrels.
import * as THREE from 'three';
import { clamp, damp } from './util';

export interface Critter {
  obj: THREE.Group; // outer: placed by the animal
  body: THREE.Group; // inner: hops, sits up, rolls over
  head: THREE.Group; earL: THREE.Object3D; earR: THREE.Object3D; tail: THREE.Object3D;
  feet: THREE.Object3D[]; // front L, front R, hind L, hind R
  kind: 'rabbit' | 'squirrel';
  phase: number; sit: number; down: number; roll: number; twitch: number; twitchT: number;
}

const mats = new Map<number, THREE.MeshLambertMaterial>();
const mat = (c: number) => { let m = mats.get(c); if (!m) mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c }))); return m; };
const ball = new THREE.SphereGeometry(1, 12, 9);
function blob(parent: THREE.Object3D, color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const m = new THREE.Mesh(ball, mat(color));
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Unit-length animal facing +z, feet on y = 0. */
export function buildCritter(kind: 'rabbit' | 'squirrel'): Critter {
  const obj = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  obj.add(body);
  const rabbit = kind === 'rabbit';
  const fur = rabbit ? 0xa89274 : 0xc2672c, dark = rabbit ? 0x8a7458 : 0x9a4c1e, belly = rabbit ? 0xe6dac4 : 0xf2e2c4;
  // torso + haunches
  blob(body, fur, 0, 0.27, 0.02, 0.2, 0.2, 0.32);
  blob(body, fur, 0, 0.27, -0.17, 0.23, 0.23, 0.24);
  blob(body, belly, 0, 0.19, 0.06, 0.16, 0.13, 0.27);
  // head
  head.position.set(0, rabbit ? 0.43 : 0.4, 0.3);
  body.add(head);
  blob(head, fur, 0, 0, 0, 0.15, 0.14, 0.17);
  blob(head, belly, 0, -0.04, 0.1, 0.09, 0.07, 0.09);
  blob(head, rabbit ? 0xe8a0a0 : 0x3a2418, 0, -0.01, 0.185, 0.025, 0.02, 0.02);
  for (const s of [-1, 1]) { blob(head, 0x1a1210, s * 0.105, 0.04, 0.07, 0.03, 0.035, 0.03); blob(head, 0xffffff, s * 0.118, 0.055, 0.083, 0.01, 0.01, 0.01); }
  const ear = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.07, 0.1, -0.04);
    if (rabbit) { blob(g, fur, 0, 0.17, 0, 0.045, 0.19, 0.07); blob(g, 0xe8b0a8, 0, 0.17, 0.035, 0.025, 0.15, 0.04); g.rotation.set(-0.25, 0, s * -0.16); }
    else { blob(g, dark, 0, 0.05, 0, 0.045, 0.075, 0.035); blob(g, dark, 0, 0.13, 0, 0.012, 0.04, 0.012); g.rotation.z = s * -0.25; }
    head.add(g);
    return g;
  };
  const earL = ear(-1), earR = ear(1);
  // tail
  const tail = new THREE.Group();
  tail.position.set(0, 0.3, -0.38);
  body.add(tail);
  if (rabbit) blob(tail, 0xfaf6ee, 0, 0.02, -0.03, 0.085, 0.085, 0.085);
  else {
    // a fat plume curling up over the back
    blob(tail, fur, 0, 0.08, -0.08, 0.1, 0.15, 0.12);
    blob(tail, fur, 0, 0.27, -0.1, 0.125, 0.17, 0.13);
    blob(tail, dark, 0, 0.45, -0.03, 0.115, 0.15, 0.125);
    blob(tail, 0xf6e6c8, 0, 0.56, 0.05, 0.06, 0.07, 0.075);
  }
  // feet
  const feet: THREE.Object3D[] = [];
  for (const s of [-1, 1]) feet.push(blob(body, dark, s * 0.1, 0.05, 0.24, 0.045, 0.05, 0.08));
  for (const s of [-1, 1]) feet.push(blob(body, dark, s * 0.16, 0.05, -0.1, 0.06, 0.05, rabbit ? 0.17 : 0.12));
  return { obj, body, head, earL, earR, tail, feet, kind, phase: Math.random() * 6, sit: 0, down: 0, roll: 0, twitch: 0, twitchT: 1 + Math.random() * 3 };
}

/** mode: what the animal is doing; speed in m/s; len: body length in metres (for hop cadence). */
export function animateCritter(c: Critter, mode: 'idle' | 'eat' | 'look' | 'move' | 'dead', speed: number, len: number, t: number, dt: number) {
  const rabbit = c.kind === 'rabbit';
  if (mode === 'dead') {
    c.roll = damp(c.roll, 1, 9, dt);
    c.body.rotation.set(0, 0, c.roll * 1.45);
    c.body.position.y = damp(c.body.position.y, 0.2 * c.roll, 10, dt);
    c.head.rotation.x = damp(c.head.rotation.x, 0.4, 6, dt);
    c.earL.rotation.x = c.earR.rotation.x = damp(c.earL.rotation.x, -1.3, 6, dt);
    return;
  }
  const moving = mode === 'move' && speed > 0.15;
  const run = clamp(speed / 4, 0, 1);
  if (moving) c.phase += dt * (5.5 + speed * 1.5);
  const hop = moving ? Math.abs(Math.sin(c.phase)) : 0, lift = moving ? Math.cos(c.phase) * Math.sign(Math.sin(c.phase)) : 0;
  c.sit = damp(c.sit, mode === 'look' ? 1 : 0, 7, dt);
  c.down = damp(c.down, mode === 'eat' ? 1 : 0, 5, dt);
  c.body.position.y = hop * (0.1 + run * 0.16) + c.sit * 0.05;
  // nose up on take-off, down on landing; sit bolt upright when alarmed
  c.body.rotation.set(-lift * (0.18 + run * 0.14) - c.sit * (rabbit ? 0.75 : 0.95), 0, 0);
  c.head.rotation.x = c.sit * (rabbit ? 0.6 : 0.8) + c.down * (0.75 + Math.sin(t * 13) * 0.08) + Math.sin(t * 1.7 + c.phase) * 0.04;
  c.head.rotation.y = mode === 'idle' ? Math.sin(t * 0.9 + c.phase) * 0.35 : c.sit ? Math.sin(t * 2.6) * 0.25 * c.sit : 0;
  // ears: back when running, up when alert, with the odd twitch
  c.twitchT -= dt;
  if (c.twitchT <= 0) { c.twitchT = 1.2 + Math.random() * 3.5; c.twitch = 1; }
  c.twitch = Math.max(0, c.twitch - dt * 6);
  const earX = (rabbit ? -0.25 : 0) - run * (moving ? 0.9 : 0) + c.sit * 0.2;
  c.earL.rotation.x = earX + c.twitch * 0.35; c.earR.rotation.x = earX - c.twitch * 0.2;
  // tail
  if (rabbit) c.tail.scale.setScalar(1 + c.twitch * 0.25);
  else { c.tail.rotation.x = -c.sit * 0.5 + (moving ? -0.9 + hop * 0.5 : Math.sin(t * 2.2 + c.phase) * 0.08) + c.twitch * 0.3; c.tail.rotation.z = Math.sin(t * 3.1 + c.phase) * 0.06; }
  // feet reach forward and kick back through each bound
  const reach = moving ? Math.sin(c.phase * 1 + 0.6) * 0.07 : 0;
  c.feet[0].position.z = c.feet[1].position.z = 0.24 + reach - c.sit * 0.05;
  c.feet[0].position.y = c.feet[1].position.y = 0.05 + c.sit * 0.2 + hop * 0.02;
  c.feet[2].position.z = c.feet[3].position.z = -0.1 - reach * 1.3;
  void len;
}
