// Arrows, bolts and thrown weapons: ballistic flight, collision, sticking, retrieval.
import * as THREE from 'three';
import { model } from './assets';
import { audio } from './audio';
import { G } from './ctx';
import { ITEMS, type WeaponDef } from './data';
import { S, addItem, ammoCap, count, perk } from './state';
import { WATER_Y } from './terrain';
import { CHAR_SCALE } from './world';
import type { Animal } from './animals';

export interface Shot {
  obj: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; weapon: WeaponDef; power: number; age: number; spin: number; unaware: boolean; dist: number;
}
interface Pickup { obj: THREE.Object3D; ammo: string; pos: THREE.Vector3; t: number; broken: boolean }

export const GRAV = 7.5;
const FWD_Z = new THREE.Vector3(0, 0, 1), FWD_Y = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _dir = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _x = new THREE.Vector3(1, 0, 0);
const AMMO_MODEL: Record<string, string> = { arrow: 'arrow_bow', bolt: 'arrow_crossbow', knife: 'dagger', tomahawk: 'axe_1handed', javelin: 'spear_A' };
const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
const streakGeo = new THREE.PlaneGeometry(0.03, 2.2);

export class Projectiles {
  group = new THREE.Group();
  shots: Shot[] = [];
  pickups: Pickup[] = [];

  private make(ammo: string) {
    const o = model('weapons/' + AMMO_MODEL[ammo]);
    o.scale.setScalar(CHAR_SCALE * (ammo === 'javelin' ? 0.72 : ammo === 'tomahawk' ? 0.8 : 1));
    return o;
  }
  private orient(o: THREE.Object3D, dir: THREE.Vector3, ammo: string, spin = 0) {
    if (ammo === 'arrow' || ammo === 'bolt') o.quaternion.setFromUnitVectors(FWD_Z, dir);
    else {
      o.quaternion.setFromUnitVectors(FWD_Y, dir);
      if (spin) o.quaternion.multiply(_q2.setFromAxisAngle(_x, spin));
    }
  }

  /** Launch speed for a weapon at a given draw power. */
  static speed(w: WeaponDef, power: number) { return w.speed * (w.kind === 'bow' ? 0.55 + 0.45 * power : 1); }
  fire(origin: THREE.Vector3, dir: THREE.Vector3, w: WeaponDef, power: number) {
    if (count(w.ammo) <= 0) return;
    addItem(w.ammo, -1);
    S.stats.shots++;
    const obj = this.make(w.ammo);
    const holder = new THREE.Group();
    holder.add(obj);
    if (w.kind !== 'thrown') {
      const s = new THREE.Mesh(streakGeo, streakMat);
      s.rotation.x = Math.PI / 2; s.position.z = -1.3;
      const s2 = s.clone(); s2.rotation.z = Math.PI / 2;
      const sg = new THREE.Group(); sg.add(s, s2); sg.name = 'streak';
      holder.add(sg);
    }
    holder.position.copy(origin);
    this.group.add(holder);
    // was any animal near the line of fire unaware? (decided on impact per animal, but remember the moment of release)
    this.shots.push({ obj: holder, pos: origin.clone(), vel: dir.clone().multiplyScalar(Projectiles.speed(w, power)), weapon: w, power, age: 0, spin: 0, unaware: true, dist: 0 });
  }

  private stick(s: Shot, point: THREE.Vector3, kind: 'ground' | 'wood' | 'water') {
    const ammo = s.weapon.ammo;
    s.obj.getObjectByName('streak')?.removeFromParent();
    if (kind === 'water') {
      G.fx.splash(point.x, point.z);
      audio.play('splash', { pos: point, volume: 0.6 });
      s.obj.removeFromParent();
      return;
    }
    const breakChance = (kind === 'wood' ? 0.4 : 0.12) * (1 - perk('fletcher') * 0.15) * (s.weapon.kind === 'thrown' ? 0.3 : 1);
    const broken = Math.random() < breakChance;
    _dir.copy(s.vel).normalize();
    s.obj.position.copy(point).addScaledVector(_dir, s.weapon.kind === 'thrown' ? -0.25 : -0.3);
    this.orient(s.obj.children[0], FWD_Z, ammo); // reset child orientation, orient holder instead
    s.obj.children[0].quaternion.identity();
    if (ammo === 'arrow' || ammo === 'bolt') s.obj.quaternion.setFromUnitVectors(FWD_Z, _dir);
    else s.obj.quaternion.setFromUnitVectors(FWD_Y, _dir);
    audio.play(kind === 'wood' ? 'hit_wood' : 'hit_ground', { pos: point, volume: 0.7 });
    G.fx.burst(point, kind === 'wood' ? 0x8a6a48 : G.zone.def.snow ? 0xffffff : 0x9a8a60, 6, 1.6, 0.09, 0.4);
    this.pickups.push({ obj: s.obj, ammo, pos: point.clone(), t: broken ? 12 : 240, broken });
    G.animals.disturb(point, 14, 0.45);
  }

  private stickAnimal(s: Shot, a: Animal, point: THREE.Vector3) {
    s.obj.getObjectByName('streak')?.removeFromParent();
    _dir.copy(s.vel).normalize();
    s.obj.children[0].quaternion.identity();
    if (s.weapon.ammo === 'arrow' || s.weapon.ammo === 'bolt') s.obj.quaternion.setFromUnitVectors(FWD_Z, _dir);
    else s.obj.quaternion.setFromUnitVectors(FWD_Y, _dir);
    s.obj.position.copy(point).addScaledVector(_dir, 0.05);
    // re-parent into the animal's local frame so it travels with it
    a.obj.updateMatrixWorld(true);
    a.obj.attach(s.obj);
    a.stuck.push(s.weapon.ammo);
    a.stuckObjs.push(s.obj);
  }

  update(dt: number) {
    const t = G.zone.terrain;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.age += dt;
      let remaining = dt, done = false;
      // sub-step so fast bolts cannot tunnel
      while (remaining > 0 && !done) {
        const step = Math.min(remaining, 0.008);
        remaining -= step;
        s.vel.y -= GRAV * step;
        _p.copy(s.pos).addScaledVector(s.vel, step);
        const hit = G.animals.hitTest(s.pos, _p);
        if (hit) {
          G.game.onShotHit(s, hit);
          this.stickAnimal(s, hit.animal, hit.point);
          done = true; break;
        }
        const col = G.zone.segmentHit(s.pos, _p);
        if (col) { this.stick(s, _p.clone(), 'wood'); done = true; break; }
        const gy = t.height(_p.x, _p.z);
        if (_p.y <= gy) { _p.y = gy; this.stick(s, _p.clone(), gy < WATER_Y - 0.05 ? 'water' : 'ground'); done = true; break; }
        if (_p.y < WATER_Y && gy < WATER_Y) { this.stick(s, _p.clone().setY(WATER_Y), 'water'); done = true; break; }
        s.dist += s.pos.distanceTo(_p);
        s.pos.copy(_p);
      }
      if (done || s.age > 8) {
        if (!done) s.obj.removeFromParent();
        this.shots.splice(i, 1);
        continue;
      }
      s.obj.position.copy(s.pos);
      _dir.copy(s.vel).normalize();
      if (s.weapon.kind === 'thrown' && s.weapon.ammo !== 'javelin') {
        s.spin += dt * 22;
        s.obj.quaternion.setFromUnitVectors(FWD_Z, _dir);
        s.obj.children[0].quaternion.setFromAxisAngle(_x, s.spin + Math.PI / 2);
      } else if (s.weapon.kind === 'thrown') {
        s.obj.quaternion.setFromUnitVectors(FWD_Y, _dir);
      } else s.obj.quaternion.setFromUnitVectors(FWD_Z, _dir);
    }
    // pickups
    const pp = G.player.pos;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t -= dt;
      if (p.t <= 0) { p.obj.removeFromParent(); this.pickups.splice(i, 1); continue; }
      if (!p.broken && Math.random() < dt * 1.2 && Math.hypot(p.pos.x - pp.x, p.pos.z - pp.z) < 45) G.fx.emit(p.pos.x, p.pos.y + 0.5, p.pos.z, 0, 0.5, 0, 0.9, 0.14, 0xfff0a0, 0.9, 0);
      if (!p.broken && Math.hypot(p.pos.x - pp.x, p.pos.z - pp.z) < 1.5 && Math.abs(p.pos.y - pp.y) < 2.6) {
        const capped = (p.ammo === 'arrow' || p.ammo === 'bolt') && count(p.ammo) >= ammoCap();
        if (capped) continue;
        addItem(p.ammo, 1);
        audio.play('pickup', { volume: 0.5 });
        G.ui.toast(`+1 ${ITEMS[p.ammo].name}`, 'item', p.ammo);
        p.obj.removeFromParent();
        this.pickups.splice(i, 1);
      }
    }
  }
  clear() {
    for (const s of this.shots) s.obj.removeFromParent();
    for (const p of this.pickups) p.obj.removeFromParent();
    this.shots.length = 0; this.pickups.length = 0;
  }
}
