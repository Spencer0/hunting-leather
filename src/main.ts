import './style.css';
import * as THREE from 'three';
import { Animals } from './animals';
import { ALL_MODELS, loadModels } from './assets';
import { audio } from './audio';
import { G } from './ctx';
import { ZONES } from './data';
import { Environment } from './env';
import { Fx } from './fx';
import { Game } from './game';
import { endFrame, initInput, input, lockPointer, locked, pollInput } from './input';
import { Player } from './player';
import { Projectiles } from './projectiles';
import { S, addItem, maxHp, newSave, setSave, settings, type Save } from './state';
import { UI } from './ui';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 1700);
G.renderer = renderer; G.scene = scene; G.camera = camera;
window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
initInput(canvas);
const ui = new UI();
G.ui = ui;
const dev = new URLSearchParams(location.search);

async function boot() {
  const load = ui.showLoading();
  let m = 0, a = 0;
  const upd = () => load.progress(m * 0.85 + a * 0.15);
  await Promise.all([loadModels(ALL_MODELS, (d, t) => { m = d / t; upd(); }), audio.init((f) => { a = f; upd(); })]);
  audio.setVolumes(settings.master, settings.music, settings.sfx);

  G.env = new Environment(scene, 2048);
  G.fx = new Fx();
  G.shots = new Projectiles();
  G.animals = new Animals();
  G.player = new Player();
  G.game = new Game();
  scene.add(G.fx.points, G.shots.group, G.animals.group, G.player.obj);
  G.player.obj.traverse((o) => { o.frustumCulled = false; });
  G.game.applyQuality();

  // title backdrop
  setSave(newSave('Hunter'), 0);
  S.time = 17.9;
  G.game.loadZone(dev.get('z') ?? 'greenhollow');
  G.player.obj.visible = false;
  G.player.frozen = true;
  load.done();
  audio.setMusic('title', 'greenhollow');
  if (dev.has('auto')) start(0, null, 'Dev');
  else ui.showTitle(start);
  renderer.setAnimationLoop(frame);
}

async function start(slot: number, save: Save | null, name: string) {
  const fresh = !save;
  await ui.fade(true, 0.6);
  setSave(save ?? newSave(name), slot);
  if (dev.has('auto')) {
    if (dev.get('z')) S.zone = dev.get('z')!;
    if (dev.get('lvl')) S.level = +dev.get('lvl')!;
    if (dev.get('h')) S.time = +dev.get('h')!;
    if (dev.has('rich')) { S.gold = 9999; for (const k of ['hide_deer:1', 'hide_fox:2', 'leather_light', 'leather_sturdy', 'salt', 'thread', 'meat', 'bolt', 'tomahawk']) addItem(k, 12); S.weapons.push('xbow1'); S.slots = ['bow1', 'xbow1', 'thr1']; }
  }
  G.game.loadZone(S.zone);
  S.hp = Math.min(S.hp, maxHp());
  G.player.obj.visible = true;
  G.player.revive();
  G.game.playing = true;
  ui.showHud(true);
  if (fresh && !dev.has('auto')) {
    await ui.fade(true, 0, 'Fernwick, Greenhollow Vale', 'Your father left you three things: an ash shortbow, a chipped knife, and a name the Tanners’ Guild still remembers. Time to earn it back.');
    await new Promise((r) => setTimeout(r, 5200));
  }
  await ui.fade(false, 1.2);
  G.player.frozen = false;
  lockPointer();
  ui.banner(ZONES[S.zone].name, ZONES[S.zone].subtitle, 'zone');
  S.flags['seen_' + S.zone] = true;
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.game?.playing && !ui.isOpen && !ui.blocking && !G.player.dead && !G.player.frozen) ui.open('pause');
});
canvas.addEventListener('click', () => { if (G.game?.playing && !ui.isOpen) { lockPointer(); audio.resume(); } });

window.addEventListener('beforeunload', () => { if (G.game?.playing && !G.player.dead) G.game.save(true); });
const clock = new THREE.Clock();
let titleAng = 0;
const focus = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  pollInput();
  const game = G.game, p = G.player, zone = G.zone;
  if (!game.playing) {
    // slow orbit around the town for the title screen
    titleAng += dt * 0.045;
    const t = zone.terrain;
    camera.position.set(t.town.x + Math.sin(titleAng) * 62, t.town.y + 17, t.town.z + Math.cos(titleAng) * 62);
    focus.set(t.town.x, t.town.y + 5, t.town.z);
    camera.lookAt(focus);
    if (input.anyHit()) ui.titlePress();
    ui.nav();
    if (input.uiBack() && ui.isOpen) ui.close(true), ui.titleMenu();
  } else {
    const menu = ui.isOpen || ui.blocking;
    if (menu) {
      ui.nav();
      if (ui.isOpen && (input.uiBack() || (input.menuHit() && !input.keyHit('KeyI')) || input.keyHit('KeyP'))) ui.close();
      p.update(dt); // frozen: keeps camera + animation alive
    } else {
      if (input.pauseHit()) ui.open('pause');
      else if (input.menuHit()) { audio.play('ui_open'); ui.open('journal'); }
      else if (input.mapHit()) { audio.play('ui_open'); ui.open('journal'); (ui as any).tab = 'Map'; ui.refresh(); }
      if (!(window as any).__pause) {
        p.update(dt);
        G.animals.update(dt);
        G.shots.update(dt);
        game.update(dt);
      }
    }
    focus.copy(p.pos);
    ui.update(dt);
  }
  G.fx.update(dt, camera.position);
  G.env.update(S.time, focus, camera.position, dt);
  zone.update(dt, G.time, camera.position, focus, G.env.night, G.env.fog.color, G.env.sunDir, G.env.sun.intensity);
  audio.setListener(camera.position, p.camYaw);
  audio.update(dt);
  const oc = (window as any).__cam as { pos: number[]; look: number[]; fov?: number } | undefined;
  if (oc) { camera.position.set(oc.pos[0], oc.pos[1], oc.pos[2]); camera.fov = oc.fov ?? 40; camera.updateProjectionMatrix(); camera.lookAt(oc.look[0], oc.look[1], oc.look[2]); }
  renderer.render(scene, camera);
  endFrame();
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
}
(window as any).__G = G;
// headless test hook: advance the simulation without rendering
(window as any).__step = (n: number, dt = 1 / 30) => {
  for (let i = 0; i < n; i++) { G.time += dt; G.player.update(dt); G.animals.update(dt); G.shots.update(dt); G.game.update(dt); (G.renderer.info.render as any).frame++; }
};
(window as any).__S = () => S;
boot();
void locked;
