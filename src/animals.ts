// Wildlife: spawning, senses, behaviour state machines, animation, hit testing.
import * as THREE from 'three';
import { clips, model, uniqueMaterials } from './assets';
import { audio } from './audio';
import { animateCritter, buildCritter, type Critter } from './critters';
import { G } from './ctx';
import { SPECIES, type SpeciesDef } from './data';
import { S, perk } from './state';
import { PLAY, TOWN_R, WATER_Y } from './terrain';
import { angleDiff, clamp, damp, rng } from './util';
import type { Zone } from './world';

type State = 'idle' | 'wander' | 'alert' | 'flee' | 'chase' | 'attack' | 'recover' | 'stagger' | 'dead';
interface Metrics { scalePer: number; nativeH: number; nativeLen: number }
const metricsCache = new Map<string, Metrics>();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _box = new THREE.Box3();

const CLIPS: Record<string, string[]> = {
  idle: ['Idle', 'Idle_2'], look: ['Idle_2', 'Idle'], eat: ['Eating', 'Idle_Headlow', 'Idle_2_HeadLow', 'Duck', 'Idle'], walk: ['Walk'], run: ['Gallop', 'Run'],
  attack: ['Attack_Headbutt', 'Attack', 'Punch', 'Bite_Front'], death: ['Death'], hit: ['Idle_HitReact1', 'HitReact', 'HitRecieve'], hit2: ['Idle_HitReact2', 'HitReact'], kick: ['Attack_Kick', 'Attack', 'Punch'],
};

function measure(def: SpeciesDef): Metrics {
  let m = metricsCache.get(def.model);
  if (m) return m;
  const o = model('animals/' + def.model);
  const mixer = new THREE.AnimationMixer(o);
  const idle = clips('animals/' + def.model).find((c) => c.name === 'Idle');
  if (idle) { mixer.clipAction(idle).play(); mixer.update(0.01); }
  o.updateMatrixWorld(true);
  o.traverse((n) => { const sm = n as THREE.SkinnedMesh; if (sm.isSkinnedMesh) { sm.skeleton.update(); sm.computeBoundingBox(); } });
  _box.setFromObject(o);
  const size = _box.getSize(new THREE.Vector3());
  m = { scalePer: 1, nativeH: size.y, nativeLen: Math.max(size.z, 0.01) };
  metricsCache.set(def.model, m);
  return m;
}

export interface HitInfo { animal: Animal; point: THREE.Vector3; part: 'head' | 'vital' | 'body' }

export class Animal {
  obj: THREE.Object3D;
  pos = new THREE.Vector3();
  yaw = Math.random() * 6.28;
  hp: number;
  state: State = 'idle';
  meter = 0; // awareness 0..1.2
  hits = 0; critKill = false; firstHitUnaware = false; killedBy = '';
  stuck: string[] = []; // ammo ids embedded in the carcass
  stuckObjs: THREE.Object3D[] = [];
  home = new THREE.Vector3();
  group = 0;
  deadT = 0; skinned = false; removed = false;
  height: number; radius: number;
  speed = 0;
  private mixer: THREE.AnimationMixer;
  private acts = new Map<string, THREE.AnimationAction>();
  private cur = '';
  private t = 0; private timer = 1 + Math.random() * 4; private goal = new THREE.Vector2(); private fleeYaw = 0; private probeT = 0;
  private flank = (Math.random() - 0.5) * 1.4; private hitDone = false; private panic = 0; private voiceT = 4 + Math.random() * 20;
  private bHead: THREE.Object3D | null; private bChest: THREE.Object3D | null; private bRear: THREE.Object3D | null;
  private boneFrame = -1; head = new THREE.Vector3(); chest = new THREE.Vector3(); rear = new THREE.Vector3();
  scale: number;
  private pitch = 0; private dustT = 0;
  engaged = false;
  near: [number, number] | null = null; // respawn around this point (the cabin's rabbits)
  private crit: Critter | null = null;

  constructor(public def: SpeciesDef, x: number, z: number, private zone: Zone) {
    if (def.proc) this.crit = buildCritter(def.proc);
    const m = this.crit ? { scalePer: 1, nativeH: 0.62, nativeLen: 1 } : measure(def);
    this.obj = this.crit ? this.crit.obj : model('animals/' + def.model);
    this.scale = def.anim === 'biped' ? def.length / m.nativeH : def.length / m.nativeLen;
    this.obj.scale.setScalar(this.scale);
    this.height = m.nativeH * this.scale;
    this.radius = def.anim === 'biped' ? def.length * 0.22 : def.length * 0.2;
    this.hp = def.hp;
    this.pos.set(x, zone.terrain.height(x, z), z);
    this.home.copy(this.pos);
    if (def.tint !== undefined || def.tintMats || def.legendary) {
      const mats = uniqueMaterials(this.obj);
      for (const mat of mats) {
        const o = def.tintMats?.[mat.name];
        if (o !== undefined) mat.color.setHex(o);
        else if (def.tint !== undefined) mat.color.multiply(new THREE.Color(def.tint));
        if (def.legendary && def.anim === 'quad' && /^(Main|Material$)/.test(mat.name)) { mat.emissive = mat.color.clone().multiplyScalar(0.22); }
      }
    }
    this.obj.traverse((o) => { const sm = o as THREE.SkinnedMesh; if (sm.isSkinnedMesh) sm.frustumCulled = false; });
    this.mixer = new THREE.AnimationMixer(this.obj);
    const all = this.crit ? [] : clips('animals/' + def.model);
    for (const key in CLIPS) {
      for (const name of CLIPS[key]) {
        const c = all.find((cl) => cl.name === name);
        if (c) { this.acts.set(key, this.mixer.clipAction(c)); break; }
      }
    }
    this.bHead = this.obj.getObjectByName('Head') ?? null;
    this.bChest = this.obj.getObjectByName('Torso3') ?? this.obj.getObjectByName('Torso2') ?? null;
    this.bRear = this.obj.getObjectByName('Back') ?? this.obj.getObjectByName('Torso') ?? null;
    this.anim('idle', 0);
    this.mixer.update(Math.random() * 2);
    this.place();
  }

  private anim(key: string, fade = 0.25, once = false, speed = 1) {
    if (this.crit) { this.cur = key; return; }
    const a = this.acts.get(key);
    if (!a) return;
    if (this.cur === key && !once) { a.timeScale = speed; return; }
    const prev = this.acts.get(this.cur);
    a.reset();
    a.timeScale = speed;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false); else if (fade) a.fadeIn(fade);
    a.play();
    this.cur = key;
  }

  private place() {
    this.obj.position.copy(this.pos);
    this.obj.rotation.set(-this.pitch, this.yaw, 0, 'YXZ');
  }

  bones() {
    if (this.boneFrame === G.renderer.info.render.frame) return;
    this.boneFrame = G.renderer.info.render.frame;
    this.obj.updateMatrixWorld(true);
    const L = this.def.length, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    if (this.bHead && this.bChest && this.bRear) {
      this.bHead.getWorldPosition(this.head); this.bChest.getWorldPosition(this.chest); this.bRear.getWorldPosition(this.rear);
      // nudge the head sphere toward the muzzle
      this.head.x += fx * L * 0.06; this.head.z += fz * L * 0.06;
    } else if (this.crit) {
      this.head.set(this.pos.x + fx * L * 0.3, this.pos.y + L * 0.42, this.pos.z + fz * L * 0.3);
      this.chest.set(this.pos.x + fx * L * 0.14, this.pos.y + L * 0.26, this.pos.z + fz * L * 0.14);
      this.rear.set(this.pos.x - fx * L * 0.2, this.pos.y + L * 0.24, this.pos.z - fz * L * 0.2);
    } else {
      this.head.copy(this.pos).setY(this.pos.y + this.height * 0.86);
      this.chest.copy(this.pos).setY(this.pos.y + this.height * 0.6);
      this.rear.copy(this.pos).setY(this.pos.y + this.height * 0.25);
    }
  }

  get alive() { return this.state !== 'dead'; }
  get unaware() { return this.meter < 0.5 && (this.state === 'idle' || this.state === 'wander'); }

  private ok(x: number, z: number) {
    const t = this.zone.terrain;
    return t.walkable(x, z) && Math.hypot(x - t.town.x, z - t.town.z) > TOWN_R + 14;
  }

  private move(targetYaw: number, speed: number, dt: number, turn: number) {
    const diff = angleDiff(this.yaw, targetYaw);
    this.yaw += clamp(diff, -turn * dt, turn * dt);
    this.speed = damp(this.speed, speed * (Math.abs(diff) > 1.4 ? 0.45 : 1), 3.5, dt);
    const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt, nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
    if (this.ok(nx, nz)) {
      this.pos.x = nx; this.pos.z = nz;
      this.zone.resolve(this.pos, this.radius * 0.8);
      return true;
    }
    this.speed *= 0.6;
    return false;
  }

  private pickEscape(threat: THREE.Vector3) {
    const base = Math.atan2(this.pos.x - threat.x, this.pos.z - threat.z) + (Math.random() - 0.5) * 0.5;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) {
      const y = base + off;
      let fine = true;
      for (const d of [5, 10, 16]) if (!this.ok(this.pos.x + Math.sin(y) * d, this.pos.z + Math.cos(y) * d)) { fine = false; break; }
      if (fine) return y;
    }
    return base + Math.PI * (Math.random() < 0.5 ? 0.5 : -0.5);
  }

  alertGroup(kind: 'flee' | 'chase') {
    for (const o of G.animals.list) {
      if (o === this || !o.alive || o.def.id !== this.def.id || o.pos.distanceTo(this.pos) > 40) continue;
      if (kind === 'flee' && (o.state === 'idle' || o.state === 'wander' || o.state === 'alert')) o.startFlee();
      if (kind === 'chase' && o.state !== 'chase' && o.state !== 'attack' && o.state !== 'recover') o.startChase(false);
    }
  }
  startFlee() {
    this.state = 'flee'; this.t = 0; this.meter = 1.2; this.probeT = 0; this.engaged = false;
    this.fleeYaw = this.pickEscape(G.player.pos);
  }
  startChase(call = true) {
    if (this.state === 'dead') return;
    const was = this.engaged;
    this.state = 'chase'; this.t = 0; this.meter = 1.2; this.engaged = true;
    if (!was) {
      const sfx = this.def.id === 'oldrime' ? 'roar' : this.def.model === 'Bull' || this.def.model === 'Cow' || this.def.model === 'Stag' ? 'bellow' : 'growl';
      audio.play(sfx, { pos: this.pos, volume: this.def.legendary ? 1 : 0.8 });
      if (this.def.legendary) G.game.onLegendEngage(this);
    }
    if (call) this.alertGroup('chase');
  }
  private react(d: number) {
    const b = this.def.behaviour;
    if (b === 'prey' || b === 'skittish') { audio.play('snort', { pos: this.pos, volume: this.def.small ? 0.25 : 0.7, rate: this.def.small ? 2.4 : 1 }); this.startFlee(); this.alertGroup('flee'); }
    else if (b === 'predator') this.startChase();
    else if (b === 'boss') { if (d < 55) this.startChase(); }
    else if (d < 13) this.startChase();
  }

  private staggerT = 0;
  onHit(dmg: number, part: string, unaware: boolean, weaponId: string, stagger = 0.35): boolean {
    if (!this.alive) return false;
    if (this.hits === 0) this.firstHitUnaware = unaware;
    this.hits++;
    this.hp -= dmg;
    this.panic = 5;
    if (this.hp <= 0) {
      this.critKill = part !== 'body';
      this.killedBy = weaponId;
      this.die();
      return true;
    }
    this.anim(Math.random() < 0.5 ? 'hit' : 'hit2', 0.08, true, 1.4);
    this.t = 0;
    const b = this.def.behaviour;
    if (b === 'prey' || b === 'skittish') {
      // cornered stags fight back sometimes
      if (this.def.damage > 0 && this.pos.distanceTo(G.player.pos) < 9 && Math.random() < 0.5) this.startChase(false);
      else { this.startFlee(); this.alertGroup('flee'); }
    } else {
      // aggressive animals flinch before pressing the attack again
      this.startChase();
      if (this.def.behaviour !== 'boss' || stagger > 0.5) { this.state = 'stagger'; this.staggerT = this.def.behaviour === 'boss' ? stagger * 0.5 : stagger; this.t = 0; }
    }
    return false;
  }

  private die() {
    this.state = 'dead'; this.deadT = 0; this.speed = 0; this.engaged = false;
    this.anim('death', 0.12, true);
    audio.play('animal_death', { pos: this.pos, volume: this.def.small ? 0.4 : 1, rate: this.def.small ? 2 : 1 });
    if (this.def.behaviour === 'prey' || this.def.behaviour === 'skittish') this.alertGroup('flee');
    else this.alertGroup('chase');
  }

  update(dt: number) {
    const p = G.player, d = this.pos.distanceTo(p.pos);
    if (this.state === 'dead') {
      this.deadT += dt;
      if (this.crit && d < 140) animateCritter(this.crit, 'dead', 0, this.def.length, G.time, dt);
      if (d < 140) this.mixer.update(dt);
      if (this.skinned) {
        // carcass sinks away after skinning
        if (this.deadT > 1.5) { this.obj.position.y -= dt * 0.35; if (this.deadT > 6) this.removed = true; }
      } else if (this.deadT > 300 && d > 60) this.removed = true;
      return;
    }
    this.obj.visible = d < 230;
    if (d > 190) return; // dormant when far away
    this.t += dt;
    this.panic = Math.max(0, this.panic - dt);

    // ----- senses -----
    const toYaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (d < 95 && !p.dead && !this.zone.inTown(p.pos, 4)) {
      const front = Math.abs(angleDiff(this.yaw, toYaw)) < 1.8;
      const night = G.env.night;
      const see = (p.crouching ? 14 : 34) * this.def.senses * (1 - 0.35 * night) * (front ? 1 : 0.4) * (p.moving ? 1 : 0.75);
      const hear = 24 * p.noise * this.def.senses;
      const range = Math.max(see, hear, 2.6);
      if (d < range) this.meter += dt * (0.12 + 1.5 * (1 - d / range)) * (1 - perk('lightstep') * 0.15);
      else this.meter -= dt * 0.22;
    } else this.meter -= dt * 0.22;
    this.meter = clamp(this.meter, 0, 1.2);

    const wounded = this.hp < this.def.hp * 0.35 ? 0.72 : 1;
    switch (this.state) {
      case 'idle': {
        this.speed = damp(this.speed, 0, 6, dt);
        this.timer -= dt;
        if (this.meter > 0.5) { this.state = 'alert'; this.t = 0; this.anim('look', 0.2); break; }
        if (this.timer <= 0) {
          if (Math.random() < 0.55) {
            this.state = 'wander';
            for (let i = 0; i < 6; i++) {
              const a = Math.random() * 6.28, r = this.def.small ? 3 + Math.random() * 9 : 8 + Math.random() * 26;
              this.goal.set(this.home.x + Math.cos(a) * r, this.home.y * 0 + this.home.z + Math.sin(a) * r);
              if (this.ok(this.goal.x, this.goal.y)) break;
              this.goal.set(this.pos.x, this.pos.z);
            }
            this.timer = 14;
          } else { this.timer = 3 + Math.random() * 6; this.anim(Math.random() < 0.6 ? 'eat' : 'idle', 0.4); }
        }
        break;
      }
      case 'wander': {
        this.timer -= dt;
        const gy = Math.atan2(this.goal.x - this.pos.x, this.goal.y - this.pos.z);
        const moved = this.move(gy, this.def.walk, dt, 2.2);
        this.anim('walk', 0.3, false, clamp(this.speed / this.def.walk, 0.5, 1.4));
        if (this.meter > 0.5) { this.state = 'alert'; this.t = 0; this.anim('look', 0.2); break; }
        if (!moved || this.timer <= 0 || Math.hypot(this.goal.x - this.pos.x, this.goal.y - this.pos.z) < 1.5) {
          this.state = 'idle'; this.timer = 2 + Math.random() * 6; this.anim(Math.random() < 0.6 ? 'eat' : 'idle', 0.4);
        }
        break;
      }
      case 'alert': {
        this.speed = damp(this.speed, 0, 8, dt);
        this.yaw += clamp(angleDiff(this.yaw, toYaw), -2.5 * dt, 2.5 * dt);
        this.anim('look', 0.2);
        if (this.meter >= 1) this.react(d);
        else if (this.meter < 0.3) { this.state = 'idle'; this.timer = 1 + Math.random() * 3; this.anim('idle', 0.3); }
        if (this.state === 'alert' && this.t > 7 && this.def.behaviour === 'defensive') { this.meter = 0.35; this.state = 'idle'; this.timer = 0.2; }
        break;
      }
      case 'flee': {
        this.probeT -= dt;
        if (this.probeT <= 0) { this.probeT = 0.7; this.fleeYaw = this.pickEscape(p.pos); }
        const sp = this.def.speed * wounded * (this.panic > 0 ? 1.08 : 1);
        if (!this.move(this.fleeYaw, sp, dt, 4.5)) this.fleeYaw = this.pickEscape(p.pos);
        this.anim('run', 0.15, false, clamp(this.speed / this.def.speed, 0.6, 1.3) * 1.15);
        if ((d > (this.def.small ? 26 : 85) && this.t > (this.def.small ? 2 : 4)) || this.t > (this.def.small ? 7 : 16)) { this.state = 'idle'; this.timer = 4 + Math.random() * 4; this.meter = 0.4; this.home.copy(this.pos); this.anim('look', 0.4); }
        break;
      }
      case 'chase': {
        const reach = this.def.length * 0.5 + 1.0;
        const far = clamp((d - 4) / 10, 0, 1);
        const ty = toYaw + this.flank * far * 0.6;
        const defensive = this.def.behaviour === 'defensive' || this.def.behaviour === 'prey';
        this.move(ty, this.def.speed * wounded * (this.def.behaviour === 'boss' && d > 12 ? 1.1 : 1), dt, d < 6 ? 5.5 : 3.6);
        this.anim('run', 0.15, false, clamp(this.speed / this.def.speed, 0.6, 1.3) * 1.15);
        if (d < reach && Math.abs(angleDiff(this.yaw, toYaw)) < 0.9 && !p.dead) {
          this.state = 'attack'; this.t = 0; this.hitDone = false;
          this.anim('attack', 0.1, true, 1.0);
        } else if (p.dead || d > 80 || this.t > (defensive ? 9 : 26) || this.zone.inTown(p.pos, 2) || (this.def.legendary && this.pos.distanceTo(this.home) > 120)) {
          this.state = 'wander'; this.goal.set(this.home.x, this.home.z); this.timer = 20; this.meter = 0.3; this.engaged = false;
          if (this.def.legendary) { this.hp = Math.min(this.def.hp, this.hp + this.def.hp * 0.25); G.game.onLegendDisengage(this); }
        }
        break;
      }
      case 'attack': {
        this.speed = damp(this.speed, 0, 5, dt);
        this.yaw += clamp(angleDiff(this.yaw, toYaw), -3 * dt, 3 * dt);
        if (!this.hitDone && this.t > 0.46) {
          this.hitDone = true;
          if (d < this.def.length * 0.5 + 1.7 && Math.abs(angleDiff(this.yaw, toYaw)) < 1.2) p.hurt(this.def.damage, this.pos);
        }
        if (this.t > 1.0) { this.state = 'recover'; this.t = 0; this.fleeYaw = toYaw + Math.PI + (Math.random() < 0.5 ? 0.9 : -0.9); }
        break;
      }
      case 'stagger': {
        // knocked back, open to a follow-up
        const away = toYaw + Math.PI;
        const nx = this.pos.x + Math.sin(away) * 3.2 * dt, nz = this.pos.z + Math.cos(away) * 3.2 * dt;
        if (this.t < 0.25 && this.ok(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
        this.speed = 0;
        if (this.t > this.staggerT) { this.state = 'chase'; this.t = 0; }
        break;
      }
      case 'recover': {
        // back off and circle before coming in again
        this.move(this.fleeYaw, this.def.speed * 0.6, dt, 4);
        this.anim('run', 0.2, false, 0.9);
        if (this.t > (this.def.behaviour === 'boss' ? 1.2 : 2.0)) { this.state = 'chase'; this.t = Math.min(this.t, 0); }
        break;
      }
    }

    // idle chatter
    this.voiceT -= dt;
    if (this.voiceT <= 0) {
      this.voiceT = 25 + Math.random() * 40;
      if (d < 110 && (this.state === 'idle' || this.state === 'wander')) {
        if ((this.def.model === 'Wolf' || this.def.model === 'Husky') && G.env.night > 0.5) audio.play('howl', { pos: this.pos, volume: 0.7 });
      }
    }

    const t = this.zone.terrain;
    this.pos.y = t.height(this.pos.x, this.pos.z);
    if (this.def.anim === 'quad') {
      const L = this.def.length * 0.45, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const target = Math.atan2(t.height(this.pos.x + fx * L, this.pos.z + fz * L) - t.height(this.pos.x - fx * L, this.pos.z - fz * L), L * 2);
      this.pitch = damp(this.pitch, clamp(target, -0.5, 0.5), 8, dt);
    }
    this.place();
    if (this.speed > 5 && d < 70) {
      this.dustT -= dt;
      if (this.dustT <= 0) { this.dustT = this.def.small ? 0.3 : 0.16; G.fx.dust(this.pos); }
    }
    if (this.crit) {
      if (d < 130) animateCritter(this.crit, this.cur === 'eat' ? 'eat' : this.cur === 'look' ? 'look' : this.cur === 'walk' || this.cur === 'run' ? 'move' : 'idle', this.speed, this.def.length, G.time, dt);
    } else if (d < 130) this.mixer.update(dt);
  }
}

function segSegClosest(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3, c1: THREE.Vector3, c2: THREE.Vector3): number {
  // returns parameter t along segment 2 (0..1); writes closest points
  const d1 = _a.subVectors(q1, p1), d2 = _b.subVectors(q2, p2), r = _c.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-8 && e <= 1e-8) { s = 0; t = 0; }
  else if (a <= 1e-8) { t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-8) { s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  c1.copy(p1).addScaledVector(d1, s);
  c2.copy(p2).addScaledVector(d2, t);
  return t;
}

export class Animals {
  list: Animal[] = [];
  group = new THREE.Group();
  private respawns: { id: string; t: number; near: [number, number] | null }[] = [];
  private zone!: Zone;
  private r = rng(1);

  private anchor(minPlayer: number, others: THREE.Vector3[], minOther: number): [number, number] | null {
    const t = this.zone.terrain;
    for (let i = 0; i < 80; i++) {
      const x = (Math.random() - 0.5) * PLAY * 1.8, z = (Math.random() - 0.5) * PLAY * 1.8;
      if (!t.walkable(x, z)) continue;
      if (Math.hypot(x - t.town.x, z - t.town.z) < TOWN_R + 50) continue;
      if (Math.hypot(x - t.lair.x, z - t.lair.z) < 45) continue;
      if (G.player && Math.hypot(x - G.player.pos.x, z - G.player.pos.z) < minPlayer) continue;
      if (others.some((o) => Math.hypot(x - o.x, z - o.z) < minOther)) continue;
      return [x, z];
    }
    return null;
  }
  /** A walkable spot in a ring around a point (used to keep small game around the cabin). */
  private ring(cx: number, cz: number, r0: number, r1: number, minPlayer: number): [number, number] | null {
    const t = this.zone.terrain;
    for (let i = 0; i < 60; i++) {
      const ang = Math.random() * 6.28, rad = r0 + Math.random() * (r1 - r0);
      const x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad;
      if (!t.walkable(x, z) || t.height(x, z) < WATER_Y + 0.3 || Math.hypot(x - t.town.x, z - t.town.z) < TOWN_R + 20) continue;
      if (G.player && Math.hypot(x - G.player.pos.x, z - G.player.pos.z) < minPlayer) continue;
      return [x, z];
    }
    return null;
  }
  private spawnGroup(id: string, minPlayer: number, near: [number, number] | null = null) {
    const def = SPECIES[id], t = this.zone.terrain;
    const others = this.list.filter((a) => a.alive).map((a) => a.home);
    const a = near ? this.ring(near[0], near[1], 16, 52, minPlayer) : this.anchor(def.small ? Math.min(minPlayer, 45) : minPlayer, others, 38) ?? this.anchor(minPlayer, [], 0);
    if (!a) return;
    const n = def.pack ? def.pack[0] + Math.floor(Math.random() * (def.pack[1] - def.pack[0] + 1)) : 1;
    const gid = Math.floor(Math.random() * 1e9);
    for (let i = 0; i < n; i++) {
      let x = a[0], z = a[1];
      for (let k = 0; k < 8 && i > 0; k++) {
        const ang = Math.random() * 6.28, rad = 3 + Math.random() * 7;
        x = a[0] + Math.cos(ang) * rad; z = a[1] + Math.sin(ang) * rad;
        if (t.walkable(x, z)) break;
        x = a[0]; z = a[1];
      }
      const an = new Animal(def, x, z, this.zone);
      an.group = gid; an.near = near;
      this.list.push(an);
      this.group.add(an.obj);
    }
  }
  populate(zone: Zone) {
    this.clear();
    this.zone = zone;
    for (const [id, groups] of zone.def.spawns) for (let g = 0; g < groups; g++) this.spawnGroup(id, 60);
    const h = zone.terrain.home;
    if (h) for (const id of ['rabbit', 'squirrel', 'rabbit', 'squirrel', 'rabbit']) this.spawnGroup(id, 12, [h.x, h.z]);
    if (!S.legends.includes(zone.def.legendary)) {
      const l = zone.terrain.lair;
      const an = new Animal(SPECIES[zone.def.legendary], l.x, l.z, zone);
      this.list.push(an);
      this.group.add(an.obj);
    }
  }
  clear() {
    for (const a of this.list) a.obj.removeFromParent();
    this.list.length = 0;
    this.respawns.length = 0;
  }
  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.update(dt);
      if (a.removed) {
        a.obj.removeFromParent();
        this.list.splice(i, 1);
        if (!a.def.legendary) {
          // respawn the whole group once its last member is gone
          if (!this.list.some((o) => o.group === a.group)) this.respawns.push({ id: a.def.id, t: (a.def.small ? 40 : 70) + Math.random() * 60, near: a.near });
        }
      }
    }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      this.respawns[i].t -= dt;
      if (this.respawns[i].t <= 0) { this.spawnGroup(this.respawns[i].id, this.respawns[i].near ? 30 : 95, this.respawns[i].near); this.respawns.splice(i, 1); }
    }
  }
  /** Highest awareness among nearby living animals (for the HUD eye) and whether any is hunting the player. */
  awareness(): { level: number; hunted: boolean } {
    let level = 0, hunted = false;
    for (const a of this.list) {
      if (!a.alive) continue;
      const d = a.pos.distanceTo(G.player.pos);
      if (d < 90) level = Math.max(level, a.state === 'flee' ? 1 : Math.min(1, a.meter));
      if (a.engaged && d < 70) hunted = true;
    }
    return { level, hunted };
  }
  disturb(p: THREE.Vector3, radius: number, amount: number) {
    for (const a of this.list) if (a.alive && a.pos.distanceTo(p) < radius) a.meter = Math.min(1.2, a.meter + amount);
  }
  hitTest(a: THREE.Vector3, b: THREE.Vector3): HitInfo | null {
    let best: HitInfo | null = null, bestD = 1e9;
    const segLen = a.distanceTo(b);
    for (const an of this.list) {
      if (!an.alive) continue;
      if (an.pos.distanceTo(a) > segLen + an.def.length * 1.6 + 2) continue;
      an.bones();
      const L = an.def.length;
      const biped = an.def.anim === 'biped';
      const small = an.def.small;
      const rHead = small ? 0.17 : biped ? L * 0.14 : L * 0.125, rBody = small ? 0.22 : biped ? L * 0.2 : L * (an.def.model === 'Bull' || an.def.model === 'Cow' ? 0.2 : 0.17);
      // head
      const t1 = clamp(_d.subVectors(an.head, a).dot(_a.subVectors(b, a)) / (segLen * segLen || 1), 0, 1);
      _c.copy(a).addScaledVector(_a.subVectors(b, a), t1);
      if (_c.distanceTo(an.head) < rHead) {
        const dd = _c.distanceTo(a);
        if (dd < bestD) { bestD = dd; best = { animal: an, point: _c.clone(), part: 'head' }; }
        continue;
      }
      const c1 = new THREE.Vector3(), c2 = new THREE.Vector3();
      const tt = segSegClosest(a, b, an.rear, an.chest, c1, c2);
      if (c1.distanceTo(c2) < rBody) {
        const dd = c1.distanceTo(a);
        if (dd < bestD) { bestD = dd; best = { animal: an, point: c1, part: tt > 0.6 ? 'vital' : 'body' }; }
      }
    }
    return best;
  }
  nearestCarcass(p: THREE.Vector3, range: number): Animal | null {
    let best: Animal | null = null, bd = range;
    for (const a of this.list) {
      if (a.alive || a.skinned) continue;
      const d = a.pos.distanceTo(p) - a.def.length * 0.3;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
}
