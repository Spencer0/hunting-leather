// Third-person hunter: movement, camera, layered animation, weapons.
import * as THREE from 'three';
import { clips, model } from './assets';
import { audio } from './audio';
import { G } from './ctx';
import { WEAPONS, type WeaponDef } from './data';
import { input } from './input';
import { S, activeWeapon, capacity, count, defense, drawMult, gear, maxHp, maxStamina, perk, settings, stealthMult, totalWeight } from './state';
import { WATER_Y, edgeDist } from './terrain';
import { clamp, damp, dampAngle, lerp } from './util';
import { CHAR_SCALE } from './world';

const LOWER = /^(root|hips|upperleg|lowerleg|foot|toes)/;
type Chan = { cur: THREE.AnimationAction | null; name: string };

const _f = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _n = new THREE.Vector3();

export class Player {
  obj: THREE.Object3D;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  camYaw = 0;
  camPitch = 0.12;
  crouching = false;
  grounded = true;
  stamina = 100;
  noise = 0; // how loud we are right now
  aiming = false;
  draw = 0; // 0..1 bow draw power
  drawing = false;
  reload = 0; // crossbow reload seconds remaining
  loaded = true;
  throwT = -1;
  busy: { t: number; dur: number; label: string; done: () => void; cancel?: () => void } | null = null;
  dead = false;
  iframes = 0;
  sway = 0;
  frozen = false; // menus / cutscenes
  moving = false;
  private mixer: THREE.AnimationMixer;
  private upper: Chan = { cur: null, name: '' };
  private lower: Chan = { cur: null, name: '' };
  private acts = new Map<string, THREE.AnimationAction>();
  private handL: THREE.Object3D; private handR: THREE.Object3D; private chest: THREE.Object3D; private head: THREE.Object3D;
  private weaponObj: THREE.Object3D | null = null;
  private weaponId = '';
  private nocked: THREE.Object3D | null = null;
  private camDist = 4.4; private camSide = 0.55; private fov = 58;
  private stepT = 0; private holdT = 0; private shotLock = 0; private upperHold = 0;
  private camPos = new THREE.Vector3();
  private landT = 0;

  constructor() {
    this.obj = model('chars/Ranger');
    this.obj.scale.setScalar(CHAR_SCALE);
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.handL = this.obj.getObjectByName('handslotl') ?? this.obj;
    this.handR = this.obj.getObjectByName('handslotr') ?? this.obj;
    this.chest = this.obj.getObjectByName('chest') ?? this.obj;
    this.head = this.obj.getObjectByName('head') ?? this.obj;
    for (const file of ['General', 'MovementBasic', 'MovementAdvanced', 'CombatRanged', 'Tools']) {
      for (const c of clips('anims/' + file)) {
        if (this.acts.has(c.name + '_U')) continue;
        const up = new THREE.AnimationClip(c.name + '_U', c.duration, c.tracks.filter((t) => !LOWER.test(t.name)));
        const lo = new THREE.AnimationClip(c.name + '_L', c.duration, c.tracks.filter((t) => LOWER.test(t.name)));
        this.acts.set(c.name + '_U', this.mixer.clipAction(up));
        this.acts.set(c.name + '_L', this.mixer.clipAction(lo));
      }
    }
    this.play(this.upper, 'Idle_A_U', 0);
    this.play(this.lower, 'Idle_A_L', 0);
  }

  private play(ch: Chan, name: string, fade = 0.18, once = false, speed = 1) {
    if (ch.name === name && !once) { if (ch.cur) ch.cur.timeScale = speed; return; }
    const a = this.acts.get(name);
    if (!a) return;
    a.reset();
    a.timeScale = speed;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.setEffectiveWeight(1);
    if (ch.cur && ch.cur !== a) { a.crossFadeFrom(ch.cur, fade, false); }
    else if (fade > 0) a.fadeIn(fade);
    a.play();
    ch.cur = a; ch.name = name;
  }

  teleport(x: number, z: number, yaw = 0) {
    this.pos.set(x, G.zone.terrain.height(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.camYaw = yaw + Math.PI; this.camPitch = 0.14;
    this.obj.position.copy(this.pos);
    this.camPos.set(0, 0, 0);
  }

  refreshWeapon() {
    const w = activeWeapon();
    const id = w ? w.id : '';
    if (id === this.weaponId) return;
    this.weaponId = id;
    this.weaponObj?.removeFromParent();
    this.nocked?.removeFromParent();
    this.weaponObj = null; this.nocked = null;
    this.drawing = false; this.draw = 0; this.throwT = -1;
    if (!w) return;
    const o = model('weapons/' + w.model);
    const inv = 1; // hand slots inherit the character scale
    if (w.kind === 'bow') {
      if (w.model !== 'bow_withString') o.rotation.y = Math.PI / 2;
      o.scale.setScalar(inv * (w.tier >= 3 ? 1.12 : 1));
      this.handL.add(o);
      const a = model('weapons/arrow_bow');
      a.visible = false;
      this.handR.add(a);
      this.nocked = a;
    } else if (w.kind === 'crossbow') {
      o.scale.setScalar(inv * (w.modelScale ?? 1));
      this.handR.add(o);
    } else {
      o.scale.setScalar(inv * (w.id === 'thr3' ? 0.7 : 0.8));
      this.handR.add(o);
    }
    this.weaponObj = o;
    if (w.kind === 'crossbow') this.loaded = S.flags['xl_' + w.id] !== false;
  }

  hurt(dmg: number, from: THREE.Vector3) {
    if (this.dead || this.iframes > 0) return;
    const d = Math.max(1, Math.round(dmg * (1 - defense())));
    S.hp = Math.max(0, S.hp - d);
    this.iframes = 0.9;
    G.shake = Math.min(1, G.shake + 0.7);
    _v.copy(this.pos).sub(from).setY(0).normalize();
    this.vel.x += _v.x * 7; this.vel.z += _v.z * 7;
    audio.play('hurt');
    G.ui.hurtFlash();
    this.drawing = false; this.draw = 0;
    if (this.busy) { this.busy.cancel?.(); this.busy = null; }
    if (S.hp <= 0) {
      this.dead = true;
      this.play(this.upper, 'Death_A_U', 0.1, true);
      this.play(this.lower, 'Death_A_L', 0.1, true);
      audio.play('death');
      G.game.onPlayerDeath();
    } else {
      this.upperHold = 0.45;
      this.play(this.upper, 'Hit_A_U', 0.06, true);
    }
  }
  revive() {
    this.dead = false; this.iframes = 2;
    this.upper.name = ''; this.lower.name = '';
    this.mixer.stopAllAction();
    this.upper.cur = null; this.lower.cur = null;
    this.play(this.upper, 'Idle_A_U', 0);
    this.play(this.lower, 'Idle_A_L', 0);
  }

  startBusy(dur: number, label: string, done: () => void, cancel?: () => void) {
    this.busy = { t: 0, dur, label, done, cancel };
    this.drawing = false; this.draw = 0;
  }

  /** World-space origin + direction for a shot fired now. */
  private aimRay(origin: THREE.Vector3, dir: THREE.Vector3) {
    const cam = G.camera;
    cam.getWorldDirection(dir);
    const target = _v2.copy(cam.position).addScaledVector(dir, 70);
    // closer aim point if the camera ray meets terrain sooner
    const t = G.zone.terrain;
    for (let d = 4; d < 70; d += 3) {
      _v.copy(cam.position).addScaledVector(dir, d);
      if (_v.y < t.height(_v.x, _v.z)) { target.copy(_v); break; }
    }
    const right = _v.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    origin.copy(this.pos).addScaledVector(right, -0.28);
    origin.y += this.crouching ? 1.0 : 1.38;
    origin.addScaledVector(dir, 0.55);
    dir.copy(target).sub(origin).normalize();
  }

  update(dt: number) {
    const t = G.zone.terrain;
    const w = activeWeapon();
    this.iframes = Math.max(0, this.iframes - dt);
    this.shotLock = Math.max(0, this.shotLock - dt);
    this.upperHold = Math.max(0, this.upperHold - dt);

    // ----- camera look -----
    const control = !this.frozen && !this.dead;
    if (control) {
      this.camYaw -= input.lookX(dt);
      this.camPitch = clamp(this.camPitch + input.lookY(dt), -1.1, 1.25);
    }

    // ----- weapon switching -----
    if (control && !this.busy && !this.drawing && this.throwT < 0) {
      let sl = input.slot();
      if (input.nextWeapon() || input.prevWeapon()) {
        const dirn = input.prevWeapon() ? -1 : 1;
        for (let k = 1; k <= 3; k++) { const c = (S.active + dirn * k + 3) % 3; if (S.slots[c]) { sl = c; break; } }
      }
      if (sl >= 0 && sl !== S.active && S.slots[sl]) { S.active = sl; audio.play('equip'); this.reload = 0; }
      if (input.crouchHit()) this.crouching = !this.crouching;
      if (input.tonicHit()) G.game.useTonic();
    }
    this.refreshWeapon();

    // ----- movement -----
    let mx = control && !this.busy ? input.moveX() : 0, my = control && !this.busy ? input.moveY() : 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    this.moving = ml > 0.1;
    const wantAim = control && !this.busy && !!w && (input.aim() || this.drawing || this.throwT >= 0);
    this.aiming = wantAim;
    const over = totalWeight() > capacity();
    const depth = WATER_Y - t.height(this.pos.x, this.pos.z);
    let speed = 5.0;
    const sprinting = control && input.sprint() && this.moving && !this.crouching && !wantAim && this.stamina > 1 && !over && this.reload <= 0 && my > -0.2;
    if (sprinting) { speed = 7.6; this.stamina -= dt * 13 * (1 - (gear('boots').stamina ?? 0)); }
    else this.stamina = Math.min(maxStamina(), this.stamina + dt * (this.drawing ? 0 : this.moving ? 9 : 16));
    if (this.crouching) speed = 2.0;
    else if (wantAim || this.reload > 0) speed = 2.3;
    if (over) speed *= 0.5;
    if (depth > 0.25) speed *= lerp(1, 0.5, clamp(depth / 1.0, 0, 1));
    if (this.crouching && sprinting) this.crouching = false;

    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw); // camera forward on ground
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    const wx = (fx * my + rx * mx) * speed, wz = (fz * my + rz * mx) * speed;
    const acc = this.grounded ? 12 : 3;
    this.vel.x = damp(this.vel.x, wx, acc, dt);
    this.vel.z = damp(this.vel.z, wz, acc, dt);
    if (control && !this.busy && this.grounded && input.jumpHit() && this.stamina > 8 && !over) {
      this.vel.y = 6.4; this.grounded = false; this.stamina -= 8; this.crouching = false;
    }
    this.vel.y -= 19 * dt;

    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const hNew = t.height(nx, nz), hOld = t.height(this.pos.x, this.pos.z);
    let allow = true;
    if (edgeDist(nx, nz) > 0.985 && edgeDist(nx, nz) > edgeDist(this.pos.x, this.pos.z)) allow = false;
    if (WATER_Y - hNew > 1.15 && hNew < hOld) allow = false;
    if (hNew > hOld && t.normal(nx, nz, _n).y < 0.6 && this.grounded) allow = false;
    if (allow) { this.pos.x = nx; this.pos.z = nz; }
    else { this.vel.x *= 0.2; this.vel.z *= 0.2; }
    G.zone.resolve(this.pos, 0.38);
    this.pos.y += this.vel.y * dt;
    const ground = t.height(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) {
      if (!this.grounded && this.vel.y < -6) { audio.play(this.stepSound(), { volume: 0.9 }); this.landT = 0.18; }
      this.pos.y = ground; this.vel.y = 0; this.grounded = true;
    } else if (this.pos.y > ground + 0.12) this.grounded = false;
    else { this.pos.y = ground; this.vel.y = 0; this.grounded = true; }

    // facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (wantAim) this.yaw = dampAngle(this.yaw, this.camYaw + Math.PI, 18, dt);
    else if (hs > 0.4 && this.moving) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 12, dt);

    // noise / stealth
    const base = !this.moving || hs < 0.3 ? (this.crouching ? 0.05 : 0.22) : this.crouching ? 0.3 : sprinting ? 1.7 : wantAim ? 0.55 : 1;
    this.noise = damp(this.noise, base * stealthMult(), 6, dt);

    // footsteps
    if (this.grounded && hs > 0.8) {
      this.stepT -= dt * (hs / 2.6 + 0.6);
      if (this.stepT <= 0) {
        this.stepT = 1;
        audio.play(depth > 0.1 ? 'splash' : this.stepSound(), { volume: (this.crouching ? 0.18 : sprinting ? 0.6 : 0.4) * (depth > 0.1 ? 0.35 : 1), rate: 0.9 + Math.random() * 0.25 });
        if (depth > 0.1) G.fx.splash(this.pos.x, this.pos.z);
        else if (sprinting) G.fx.dust(this.pos);
      }
    }

    // ----- weapons -----
    if (control && !this.busy && w) this.updateWeapon(dt, w);
    else { this.drawing = false; this.draw = 0; }
    if (this.reload > 0 && w?.kind === 'crossbow') {
      this.reload -= dt;
      if (this.reload <= 0) { this.loaded = true; S.flags['xl_' + w.id] = true; audio.play('equip', { volume: 0.5 }); }
    }

    // ----- busy action (skinning etc.) -----
    if (this.busy) {
      this.busy.t += dt;
      const moved = control && (Math.hypot(input.moveX(), input.moveY()) > 0.5 || input.jumpHit());
      if (moved && this.busy.t > 0.25) { this.busy.cancel?.(); this.busy = null; }
      else if (this.busy.t >= this.busy.dur) { const b = this.busy; this.busy = null; b.done(); }
    }

    // ----- animation -----
    if (!this.dead) this.animate(hs, sprinting, w);
    this.mixer.update(dt);
    this.obj.position.copy(this.pos);
    if (this.landT > 0) { this.landT -= dt; this.obj.position.y -= Math.sin((this.landT / 0.18) * Math.PI) * 0.06; }
    this.obj.rotation.y = this.yaw;
    // lean the torso with the aim pitch
    if (this.aiming && !this.dead && w && w.kind !== 'thrown') {
      this.chest.parent!.updateWorldMatrix(true, false);
      this.chest.parent!.getWorldQuaternion(_q);
      const right = _v.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      _q2.setFromAxisAngle(right, clamp(-this.camPitch + 0.08, -0.7, 0.7) * 0.8);
      this.chest.quaternion.premultiply(_q.clone().invert().multiply(_q2).multiply(_q));
    }
    if (this.nocked) this.nocked.visible = this.drawing && w?.kind === 'bow';

    this.updateCamera(dt, w);
  }

  private stepSound() {
    const z = G.zone;
    if (z.inTown(this.pos, -8) || z.terrain.pathAt(this.pos.x, this.pos.z) > 0.6) return z.def.snow ? 'step_snow' : 'step_dirt';
    return 'step_' + z.def.step;
  }

  private ammoFor(w: WeaponDef) { return count(w.ammo); }

  private updateWeapon(dt: number, w: WeaponDef) {
    const dm = drawMult();
    if (w.kind === 'bow') {
      if (!this.drawing && input.fireHit() && this.shotLock <= 0) {
        if (this.ammoFor(w) <= 0) { G.ui.toast('No arrows!', 'warn'); audio.play('error'); }
        else { this.drawing = true; this.draw = 0; this.holdT = 0; audio.play('bow_draw', { volume: 0.5 }); this.play(this.upper, 'Ranged_Bow_Draw_U', 0.1, true, 1.3 / (w.time * dm)); }
      }
      if (this.drawing) {
        this.draw = Math.min(1, this.draw + dt / (w.time * dm));
        if (this.draw >= 1) {
          this.holdT += dt;
          const hold = 2.2 * (1 + perk('steady') * 0.3);
          this.stamina -= dt * 7;
          this.sway = damp(this.sway, clamp((this.holdT - hold) / 2, 0, 1) + (this.stamina < 5 ? 1 : 0), 3, dt);
        }
        if (!input.fire()) {
          this.drawing = false;
          if (this.draw > 0.3) this.shoot(w, 0.45 + 0.55 * this.draw);
          this.draw = 0; this.sway = 0;
        }
      } else this.sway = damp(this.sway, 0, 4, dt);
    } else if (w.kind === 'crossbow') {
      if (input.fireHit() && this.shotLock <= 0 && this.reload <= 0) {
        if (!this.loaded) {
          if (this.ammoFor(w) <= 0) { G.ui.toast('No bolts!', 'warn'); audio.play('error'); }
          else this.beginReload(w);
        } else {
          this.loaded = false; S.flags['xl_' + w.id] = false;
          this.shoot(w, 1);
          if (this.ammoFor(w) > 0) this.beginReload(w, 0.35);
        }
      }
      if (!this.loaded && this.reload <= 0 && input.keyHit('KeyR') && this.ammoFor(w) > 0) this.beginReload(w);
    } else {
      if (this.throwT < 0 && input.fireHit() && this.shotLock <= 0) {
        if (this.ammoFor(w) <= 0) { G.ui.toast(`No ${w.name.toLowerCase()}!`, 'warn'); audio.play('error'); }
        else { this.throwT = 0; this.upperHold = w.time + 0.45; this.play(this.upper, 'Throw_U', 0.06, true, 0.55 / w.time); }
      }
      if (this.throwT >= 0) {
        this.throwT += dt;
        if (this.throwT >= w.time) { this.throwT = -1; this.shoot(w, 1); }
      }
    }
  }
  private beginReload(w: WeaponDef, delay = 0) {
    this.reload = w.time * drawMult() + delay;
    audio.play('xbow_reload', { delay });
  }

  private shoot(w: WeaponDef, power: number) {
    const origin = new THREE.Vector3(), dir = new THREE.Vector3();
    this.aimRay(origin, dir);
    if (this.sway > 0.02) {
      dir.x += (Math.random() - 0.5) * 0.05 * this.sway; dir.y += (Math.random() - 0.5) * 0.05 * this.sway; dir.normalize();
    }
    G.shots.fire(origin, dir, w, power);
    this.shotLock = w.kind === 'bow' ? 0.35 : 0.3;
    if (w.kind === 'bow') { audio.play('bow_release', { volume: 0.5 + power * 0.4 }); this.upperHold = 0.35; this.play(this.upper, 'Ranged_Bow_Release_U', 0.04, true, 1.4); }
    else if (w.kind === 'crossbow') { audio.play('xbow_fire'); this.upperHold = 0.3; this.play(this.upper, 'Ranged_2H_Shoot_U', 0.04, true, 1.3); G.shake = Math.min(1, G.shake + 0.25); }
    else audio.play('throw', { volume: 0.7 });
    this.noise = Math.max(this.noise, w.kind === 'crossbow' ? 1.2 : w.kind === 'bow' ? 0.7 : 0.4);
  }

  private animate(hs: number, sprinting: boolean, w: WeaponDef | null) {
    // lower body
    let lo = 'Idle_A', ls = 1;
    if (!this.grounded && Math.abs(this.vel.y) > 2.5) lo = 'Jump_Idle';
    else if (this.busy) lo = 'Crouching';
    else if (this.crouching) { lo = hs > 0.4 ? 'Sneaking' : 'Crouching'; ls = hs > 0.4 ? clamp(hs / 1.6, 0.6, 1.6) : 1; }
    else if (hs > 3.4) { lo = 'Running_A'; ls = clamp(hs / 5.4, 0.85, 1.5); }
    else if (hs > 0.4) {
      // walking; pick backwards when moving away from facing
      const back = Math.sin(this.yaw) * this.vel.x + Math.cos(this.yaw) * this.vel.z < -0.3;
      lo = back ? 'Walking_Backwards' : 'Walking_A'; ls = clamp(hs / 1.9, 0.7, 1.5);
    }
    this.play(this.lower, lo + '_L', 0.16, false, ls);
    // upper body
    if (this.upperHold > 0) return;
    let up = lo, us = ls;
    if (this.busy) up = 'Working_A';
    else if (w?.kind === 'bow' && this.drawing) { if (this.draw >= 1) up = 'Ranged_Bow_Aiming_Idle'; else return; }
    else if (w?.kind === 'bow' && this.aiming) up = 'Ranged_Bow_Idle';
    else if (w?.kind === 'crossbow' && this.reload > 0) { up = 'Ranged_2H_Reload'; us = 1; }
    else if (w?.kind === 'crossbow' && this.aiming) up = 'Ranged_2H_Aiming';
    else if (w?.kind === 'thrown' && this.throwT >= 0) return;
    if (up !== lo) us = 1;
    this.play(this.upper, up + '_U', 0.14, false, us);
  }

  private updateCamera(dt: number, w: WeaponDef | null) {
    const cam = G.camera, t = G.zone.terrain;
    const aim = this.aiming;
    this.camDist = damp(this.camDist, aim ? 2.1 : this.crouching ? 3.6 : 4.5, 8, dt);
    this.camSide = damp(this.camSide, aim ? 0.62 : 0.35, 8, dt);
    const zoom = aim ? (w?.kind === 'crossbow' ? 36 : w?.kind === 'bow' ? 44 - this.draw * 6 : 50) : 58;
    this.fov = damp(this.fov, zoom, 9, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    const sw = this.sway * (1 - perk('steady') * 0.25);
    const yaw = this.camYaw + Math.sin(G.time * 2.3) * 0.012 * sw, pitch = this.camPitch + Math.sin(G.time * 3.1 + 1) * 0.014 * sw;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fwd = _f.set(-Math.sin(yaw) * cp, -sp, -Math.cos(yaw) * cp);
    const target = _v2.copy(this.pos);
    target.y += (this.crouching ? 1.05 : 1.5) + (this.dead ? -0.6 : 0);
    target.x += Math.cos(yaw) * this.camSide; target.z += -Math.sin(yaw) * this.camSide;
    // pull the camera in if terrain blocks it
    let dist = this.camDist;
    for (let d = 0.8; d <= this.camDist; d += 0.4) {
      const px = target.x - fwd.x * d, pz = target.z - fwd.z * d, py = target.y - fwd.y * d;
      if (py < t.height(px, pz) + 0.3) { dist = Math.max(0.6, d - 0.4); break; }
    }
    const want = _n.copy(target).addScaledVector(fwd, -dist);
    const gy = t.height(want.x, want.z) + 0.3;
    if (want.y < gy) want.y = gy;
    if (this.camPos.lengthSq() === 0) this.camPos.copy(want);
    this.camPos.lerp(want, 1 - Math.exp(-28 * dt));
    cam.position.copy(this.camPos);
    if (G.shake > 0.001 && settings.shake) {
      cam.position.x += (Math.random() - 0.5) * 0.25 * G.shake; cam.position.y += (Math.random() - 0.5) * 0.25 * G.shake;
    }
    G.shake = damp(G.shake, 0, 7, dt);
    cam.lookAt(_v.copy(cam.position).add(fwd));
  }

  headPos(out: THREE.Vector3) { return out.copy(this.pos).setY(this.pos.y + (this.crouching ? 1.0 : 1.5)); }
}
export { WEAPONS, maxHp };
