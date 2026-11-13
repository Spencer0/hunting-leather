// Keyboard, mouse (pointer lock) and gamepad input, unified into a per-frame snapshot.
import { settings } from './state';

const keys = new Set<string>();
const pressed = new Set<string>();
let mdx = 0, mdy = 0, wheel = 0;
const mouse = [false, false, false];
const mousePressed = [false, false, false];
const mouseReleased = [false, false, false];
let padPrev: boolean[] = [];
let padNow: boolean[] = [];
let padAxes = [0, 0, 0, 0];
export let usingPad = false;
export let locked = false;
let canvas: HTMLCanvasElement;

export function initInput(c: HTMLCanvasElement) {
  canvas = c;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
    usingPad = false;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.fill(false); });
  document.addEventListener('mousemove', (e) => {
    if (locked) { mdx += e.movementX; mdy += e.movementY; usingPad = false; }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!locked) return;
    mouse[e.button] = true; mousePressed[e.button] = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (mouse[e.button]) mouseReleased[e.button] = true;
    mouse[e.button] = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => { if (locked) wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) { mouse.fill(false); }
  });
}
export function lockPointer() {
  if (!locked) {
    try { const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined; p?.catch?.(() => {}); } catch { /* ignore */ }
  }
}
export function unlockPointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);

export function pollInput() {
  padPrev = padNow;
  padNow = [];
  padAxes = [0, 0, 0, 0];
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    padNow = p.buttons.map((b) => b.pressed || b.value > 0.5);
    padAxes = [dz(p.axes[0] ?? 0), dz(p.axes[1] ?? 0), dz(p.axes[2] ?? 0), dz(p.axes[3] ?? 0)];
    if (padNow.some(Boolean) || padAxes.some((a) => a !== 0)) usingPad = true;
    break;
  }
}
export function rumble(strong: number, ms: number) {
  try {
    for (const p of navigator.getGamepads?.() ?? []) {
      const act = (p as unknown as { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } } | null)?.vibrationActuator;
      act?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 })?.catch?.(() => {});
    }
  } catch { /* unsupported */ }
}
export function endFrame() {
  pressed.clear();
  mdx = 0; mdy = 0; wheel = 0;
  mousePressed.fill(false); mouseReleased.fill(false);
}

const pad = (i: number) => !!padNow[i];
const padHit = (i: number) => !!padNow[i] && !padPrev[i];
const padUp = (i: number) => !padNow[i] && !!padPrev[i];

// Standard gamepad mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 10 LS, 11 RS, 12-15 dpad U D L R
export const force: { aim?: boolean; fire?: boolean; fireHit?: boolean; my?: number; melee?: boolean } = {};
(window as any).__force = force;
export const input = {
  moveX: () => { let v = padAxes[0]; if (keys.has('KeyD') || keys.has('ArrowRight')) v += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) v -= 1; return Math.max(-1, Math.min(1, v)); },
  moveY: () => { let v = -padAxes[1]; if (keys.has('KeyW') || keys.has('ArrowUp')) v += 1; if (force.my) v += force.my; if (keys.has('KeyS') || keys.has('ArrowDown')) v -= 1; return Math.max(-1, Math.min(1, v)); },
  lookX: (dt: number) => mdx * 0.0023 * settings.sens + padAxes[2] * 2.6 * dt * settings.sens,
  lookY: (dt: number) => (mdy * 0.0023 * settings.sens + padAxes[3] * 1.8 * dt * settings.sens) * (settings.invertY ? -1 : 1),
  sprint: () => keys.has('ShiftLeft') || keys.has('ShiftRight') || pad(10) || pad(1),
  crouchHit: () => pressed.has('KeyC') || padHit(11),
  jumpHit: () => pressed.has('Space') || padHit(0),
  aim: () => mouse[2] || pad(6) || !!force.aim,
  fire: () => mouse[0] || pad(7) || !!force.fire,
  fireHit: () => mousePressed[0] || padHit(7) || !!force.fireHit,
  fireUp: () => mouseReleased[0] || padUp(7),
  meleeHit: () => pressed.has('KeyF') || mousePressed[1] || padHit(3) || !!force.melee,
  interactHit: () => pressed.has('KeyE') || padHit(2),
  interact: () => keys.has('KeyE') || pad(2),
  nextWeapon: () => wheel > 0 || padHit(5) || pressed.has('KeyQ'),
  prevWeapon: () => wheel < 0 || padHit(4),
  slot: () => (pressed.has('Digit1') ? 0 : pressed.has('Digit2') ? 1 : pressed.has('Digit3') ? 2 : -1),
  tonicHit: () => pressed.has('KeyH') || padHit(12),
  menuHit: () => pressed.has('Tab') || pressed.has('KeyI') || padHit(8),
  mapHit: () => pressed.has('KeyM'),
  pauseHit: () => pressed.has('Escape') || pressed.has('KeyP') || padHit(9),
  // menu navigation
  uiUp: () => pressed.has('ArrowUp') || padHit(12),
  uiDown: () => pressed.has('ArrowDown') || padHit(13),
  uiLeft: () => pressed.has('ArrowLeft') || padHit(14) || padHit(4),
  uiRight: () => pressed.has('ArrowRight') || padHit(15) || padHit(5),
  uiAccept: () => pressed.has('Enter') || padHit(0),
  uiBack: () => pressed.has('Escape') || pressed.has('Backspace') || padHit(1),
  anyHit: () => pressed.size > 0 || padNow.some((b, i) => b && !padPrev[i]),
  key: (code: string) => keys.has(code),
  keyHit: (code: string) => pressed.has(code),
};
