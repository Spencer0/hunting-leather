// Shared mutable game context (filled in by main.ts). Type-only imports keep this cycle-free at runtime.
import type * as THREE from 'three';
import type { Animals } from './animals';
import type { Environment } from './env';
import type { Fx } from './fx';
import type { Game } from './game';
import type { Player } from './player';
import type { Projectiles } from './projectiles';
import type { UI } from './ui';
import type { Zone } from './world';

export const G = {
  renderer: null! as THREE.WebGLRenderer,
  scene: null! as THREE.Scene,
  camera: null! as THREE.PerspectiveCamera,
  env: null! as Environment,
  zone: null! as Zone,
  player: null! as Player,
  animals: null! as Animals,
  shots: null! as Projectiles,
  fx: null! as Fx,
  ui: null! as UI,
  game: null! as Game,
  time: 0,
  shake: 0,
};
