// Persistent player state, inventory helpers and save slots.
import { GEAR, GOODS_MULT, ITEMS, MAX_LEVEL, PERKS, QUALITY_MULT, WEAPONS, ZONES, ZONE_ORDER, xpForLevel, type GearSlot, type Quality } from './data';

export interface Contract {
  id: number; zone: string; kind: 'hide' | 'goods' | 'hunt';
  item: string; qty: number; minQ: Quality; have: number; // for hunt: have = kills so far
  gold: number; xp: number; text: string; giver: string;
}

export interface Save {
  v: number;
  name: string;
  zone: string;
  level: number; xp: number; perkPoints: number; perks: Record<string, number>;
  gold: number; hp: number;
  inv: Record<string, number>; // key: itemId or itemId:quality for hides
  gear: Record<GearSlot, string>;
  weapons: string[]; // owned bow/crossbow ids
  slots: [string, string, string]; // equipped bow, crossbow, thrown ('' if none)
  active: number;
  time: number; // hours 0..24
  day: number;
  kills: Record<string, number>;
  fish?: Record<string, number>;
  buffs?: Record<string, number>; // essence -> seconds left
  lore?: Record<string, string[]>; // herb -> discovered essences
  brewed?: Record<string, number>; // potion -> times brewed
  picked?: Record<string, { day: number; idx: number[] }>;
  hotbar?: string[]; // 'w0'|'w1'|'w2' (weapon slots) or an item key
  bounty?: Record<string, number>;
  legends: string[];
  contracts: Contract[]; contractSeq: number; boardDay: Record<string, number>;
  board: Record<string, Contract[]>;
  flags: Record<string, boolean>;
  stats: { earned: number; crafted: number; skinned: number; shots: number; hits: number; playtime: number; deaths: number };
  settings?: never;
}

export interface Settings { master: number; music: number; sfx: number; sens: number; invertY: boolean; quality: number; shake: boolean; hotkeys: string[] }
export const settings: Settings = { master: 0.8, music: 0.6, sfx: 0.9, sens: 1, invertY: false, quality: 2, shake: true, hotkeys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'] };

const SKEY = 'hidebound.settings';
const SAVEKEY = (i: number) => `hidebound.save.${i}`;
try {
  const s = localStorage.getItem(SKEY);
  if (s) Object.assign(settings, JSON.parse(s));
} catch { /* storage unavailable */ }
export function saveSettings() {
  try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

export function newSave(name: string): Save {
  return {
    v: 1, name, zone: 'greenhollow', level: 1, xp: 0, perkPoints: 0, perks: {}, gold: 25, hp: 100,
    inv: { arrow: 20, knife: 6, salt: 4, thread: 4, tonic: 1, jerky: 2 },
    hotbar: ['w0', 'w1', 'w2', 'tonic', 'jerky'], buffs: {}, lore: {}, brewed: {}, picked: {},
    gear: { pack: 'pack0', quiver: 'quiver0', armor: 'armor0', boots: 'boots0', bracer: 'bracer0', knife: 'knife0' },
    weapons: ['bow1'], slots: ['bow1', '', 'thr1'], active: 0, time: 8, day: 1, kills: {}, legends: [],
    contracts: [], contractSeq: 1, boardDay: {}, board: {}, flags: {},
    stats: { earned: 0, crafted: 0, skinned: 0, shots: 0, hits: 0, playtime: 0, deaths: 0 },
  };
}

export let S: Save = newSave('Hunter');
export let slotIndex = 0;
export function setSave(s: Save, slot: number) { S = s; slotIndex = slot; }

export function readSlot(i: number): Save | null {
  try {
    const raw = localStorage.getItem(SAVEKEY(i));
    if (!raw) return null;
    const s = JSON.parse(raw) as Save;
    if (s.v !== 1) return null;
    s.hotbar = s.hotbar ?? ['w0', 'w1', 'w2', 'tonic', ''];
    // older saves stored crafted goods without a grade
    for (const k of Object.keys(s.inv)) if (!k.includes(':') && ITEMS[k]?.cat === 'goods') { s.inv[k + ':1'] = (s.inv[k + ':1'] ?? 0) + s.inv[k]; delete s.inv[k]; }
    return s;
  } catch { return null; }
}
export function writeSave(): boolean {
  try { localStorage.setItem(SAVEKEY(slotIndex), JSON.stringify(S)); return true; } catch { return false; }
}
export function deleteSlot(i: number) {
  try { localStorage.removeItem(SAVEKEY(i)); } catch { /* ignore */ }
}

// ---------- derived stats ----------
export const perk = (id: string) => S.perks[id] ?? 0;
export const gear = (slot: GearSlot) => GEAR[S.gear[slot]];
export const maxHp = () => 100 + (S.level - 1) * 6 + perk('hardy') * 20;
export const maxStamina = () => 100 + (S.level - 1) * 3 + perk('hardy') * 12;
export const capacity = () => (gear('pack').capacity ?? 28) + perk('mule') * 12;
export const ammoCap = () => gear('quiver').ammo ?? 20;
export const buff = (e: string) => (S.buffs?.[e] ?? 0) > 0;
export const defense = () => Math.min(0.8, (gear('armor').defense ?? 0) + (buff('ironhide') ? 0.25 : 0));
export const stealthMult = () => (1 - (gear('boots').stealth ?? 0)) * (1 - perk('lightstep') * 0.15) * (buff('stillness') ? 0.5 : 1);
export const drawMult = () => 1 / (1 + (gear('bracer').draw ?? 0));
export const skinBonus = () => (gear('knife').skin ?? 0) + perk('skinner') * 0.12;
export const sellMult = () => 1 + perk('haggler') * 0.06;
export const buyMult = () => 1 - perk('haggler') * 0.04;

// ---------- inventory ----------
export function splitKey(key: string): [string, Quality] {
  const i = key.indexOf(':');
  return i < 0 ? [key, 1] : [key.slice(0, i), Number(key.slice(i + 1)) as Quality];
}
export const graded = (id: string) => { const c = ITEMS[id]?.cat; return c === 'hide' || c === 'goods'; };
export const invKey = (id: string, q?: Quality) => (graded(id) ? `${id}:${q ?? 1}` : id);
export const count = (key: string) => S.inv[key] ?? 0;
/** Count across qualities for hides at or above min quality. */
export function countItem(id: string, minQ: Quality = 0): number {
  if (!graded(id)) return count(id);
  let n = 0;
  for (let q = minQ; q <= 2; q++) n += count(`${id}:${q}`);
  return n;
}
export function weightOf(key: string) { return (ITEMS[splitKey(key)[0]]?.weight ?? 0) * count(key); }
export function totalWeight(): number {
  let w = 0;
  for (const k in S.inv) {
    const [id] = splitKey(k);
    const it = ITEMS[id];
    if (!it || it.cat === 'ammo') continue; // ammunition rides in the quiver/belt
    w += it.weight * S.inv[k];
  }
  return Math.round(w * 10) / 10;
}
export function addItem(key: string, n = 1) {
  S.inv[key] = (S.inv[key] ?? 0) + n;
  if (S.inv[key] <= 0) delete S.inv[key];
}
export function removeItem(key: string, n = 1): boolean {
  if (count(key) < n) return false;
  addItem(key, -n);
  return true;
}
/** Remove n of a hide starting with the lowest quality >= minQ. Non-hides behave like removeItem. */
export function removeAny(id: string, n: number, minQ: Quality = 0): boolean {
  if (!graded(id)) return removeItem(id, n);
  if (countItem(id, minQ) < n) return false;
  for (let q = minQ; q <= 2 && n > 0; q++) {
    const k = `${id}:${q}`;
    const take = Math.min(n, count(k));
    if (take) { addItem(k, -take); n -= take; }
  }
  return true;
}
export function sellValue(key: string, zoneId: string): number {
  const [id, q] = splitKey(key);
  const it = ITEMS[id];
  if (!it) return 0;
  const bias = ZONES[zoneId].priceBias[it.cat] ?? (it.cat === 'hide' ? 0.6 : 1);
  let v = it.value * bias;
  if (it.cat === 'hide') v *= QUALITY_MULT[q] * (id.match(/emberclaw|monarch|ironhorn|oldrime/) ? 1 / 0.6 : 1);
  if (it.cat === 'goods') v *= GOODS_MULT[q];
  if (it.cat === 'ammo' || it.cat === 'supply') v = it.value;
  return Math.max(1, Math.round(v * sellMult()));
}
export function buyPrice(id: string): number {
  return Math.max(1, Math.round((ITEMS[id].buy ?? ITEMS[id].value * 2) * buyMult()));
}
export const hotbar = () => (S.hotbar ??= ['w0', 'w1', 'w2', 'tonic', '']);
export const usable = (key: string) => /^w[012]$/.test(key) || key === 'tonic' || key === 'jerky' || ITEMS[key]?.cat === 'potion';
export const keyLabel = (code: string) => code.replace(/^Digit|^Key|^Numpad/, '').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→');
export const zoneIndex = (z: string) => ZONE_ORDER.indexOf(z);

/** Returns number of levels gained. */
export function addXp(n: number): number {
  let gained = 0;
  S.xp += Math.round(n);
  while (S.level < MAX_LEVEL && S.xp >= xpForLevel(S.level)) {
    S.xp -= xpForLevel(S.level);
    S.level++;
    S.perkPoints++;
    gained++;
  }
  if (S.level >= MAX_LEVEL) S.xp = Math.min(S.xp, xpForLevel(MAX_LEVEL));
  return gained;
}
export function canBuyPerk(id: string) {
  const p = PERKS.find((x) => x.id === id)!;
  return S.perkPoints > 0 && perk(id) < p.max;
}
export function activeWeapon() {
  const id = S.slots[S.active];
  return id ? WEAPONS[id] : null;
}
export const RANK_TITLES = ['Greenhorn', 'Greenhorn', 'Tracker', 'Tracker', 'Trapper', 'Trapper', 'Woodsman', 'Woodsman', 'Stalker', 'Stalker', 'Pathfinder', 'Pathfinder', 'Master Hunter', 'Master Hunter', 'Master Hunter', 'Beastbane', 'Beastbane', 'Beastbane', 'Legend', 'Legend', 'Legend'];
