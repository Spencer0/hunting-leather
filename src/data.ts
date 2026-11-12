// Static game data: species, zones, items, recipes, weapons, perks, contracts.

export type Quality = 0 | 1 | 2; // Poor, Good, Pristine
export const QUALITY_NAMES = ['Poor', 'Good', 'Pristine'] as const;
export const QUALITY_MULT = [0.55, 1, 1.7] as const;

export type Behaviour = 'prey' | 'skittish' | 'defensive' | 'predator' | 'boss';

export interface SpeciesDef {
  id: string;
  name: string;
  model: string; // file in assets/animals
  length: number; // body length in metres (model normalised to this)
  hp: number;
  speed: number; // gallop m/s
  walk: number;
  behaviour: Behaviour;
  damage: number; // per attack
  senses: number; // detection range multiplier
  xp: number;
  hide: string; // item id of hide
  meat: number; // units of meat
  trophy?: [string, number]; // item id, chance
  tint?: number; // multiply colour over model materials
  tintMats?: Record<string, number>; // per-material colour overrides
  pack?: [number, number]; // group size range
  legendary?: boolean;
  blurb: string;
  anim: 'quad' | 'biped';
}

export const SPECIES: Record<string, SpeciesDef> = {
  fox: {
    id: 'fox', name: 'Red Fox', model: 'Fox', length: 1.05, hp: 20, speed: 9.5, walk: 1.6, behaviour: 'skittish', damage: 0,
    senses: 1.15, xp: 14, hide: 'hide_fox', meat: 1, blurb: 'Quick and wary. A small target, but its pelt is prized for trim and hats.', anim: 'quad',
  },
  doe: {
    id: 'doe', name: 'Hollow Doe', model: 'Deer', length: 1.7, hp: 34, speed: 10.5, walk: 1.5, behaviour: 'prey', damage: 0,
    senses: 1, xp: 18, hide: 'hide_deer', meat: 3, trophy: ['sinew', 0.6], blurb: 'Grazes the open meadows in small herds. Supple hide makes fine light leather.', anim: 'quad', pack: [2, 4],
  },
  stag: {
    id: 'stag', name: 'Amber Stag', model: 'Stag', length: 2.0, hp: 62, speed: 11, walk: 1.5, behaviour: 'prey', damage: 14,
    senses: 1.1, xp: 34, hide: 'hide_stag', meat: 4, trophy: ['antler', 0.8], blurb: 'Proud and alert. Will lash out if cornered. Antlers fetch good coin.', anim: 'quad',
  },
  wolf: {
    id: 'wolf', name: 'Grey Wolf', model: 'Wolf', length: 1.55, hp: 55, speed: 10, walk: 1.8, behaviour: 'predator', damage: 12,
    senses: 1.25, xp: 40, hide: 'hide_wolf', meat: 1, trophy: ['fang', 0.7], blurb: 'Hunts in packs and does not wait to be hunted. Thick fur for cloaks.', anim: 'quad', pack: [2, 3],
  },
  aurochs: {
    id: 'aurochs', name: 'Wood Aurochs', model: 'Cow', length: 2.3, hp: 95, speed: 7.5, walk: 1.2, behaviour: 'defensive', damage: 18,
    senses: 0.8, xp: 46, hide: 'hide_aurochs', meat: 6, trophy: ['horn', 0.5], tintMats: { Main: 0x6b4a2e, Main_Light: 0xc9a777 }, blurb: 'Placid until provoked. A tough, sturdy hide for belts and boots.', anim: 'quad', pack: [2, 3],
  },
  vicuna: {
    id: 'vicuna', name: 'Steppe Vicuña', model: 'Alpaca', length: 1.6, hp: 48, speed: 12, walk: 1.6, behaviour: 'skittish', damage: 0,
    senses: 1.35, xp: 44, hide: 'hide_vicuna', meat: 3, trophy: ['sinew', 0.7], tintMats: { Main: 0xd9a05b, Main_Light: 0xf3e3c3, Main_Dark: 0x8a5a2b }, blurb: 'The fastest thing on the steppe, with the softest fleece in the realm.', anim: 'quad', pack: [3, 5],
  },
  jackal: {
    id: 'jackal', name: 'Dust Jackal', model: 'Husky', length: 1.3, hp: 60, speed: 10.5, walk: 1.9, behaviour: 'predator', damage: 14,
    senses: 1.2, xp: 52, hide: 'hide_jackal', meat: 1, trophy: ['fang', 0.7], tint: 0xd8b070, blurb: 'Lean pack hunters of the dry grass. They circle before they strike.', anim: 'quad', pack: [3, 4],
  },
  bison: {
    id: 'bison', name: 'Sunscar Bison', model: 'Bull', length: 2.9, hp: 170, speed: 9, walk: 1.2, behaviour: 'defensive', damage: 30,
    senses: 0.85, xp: 80, hide: 'hide_bison', meat: 8, trophy: ['horn', 0.8], tintMats: { Main: 0x4a3323, Main_Light: 0x7a5a3c }, blurb: 'A wall of muscle. Bring a heavy bolt, and somewhere to run.', anim: 'quad', pack: [2, 4],
  },
  snowwolf: {
    id: 'snowwolf', name: 'Frostfang Wolf', model: 'Wolf', length: 1.85, hp: 110, speed: 11, walk: 1.9, behaviour: 'predator', damage: 22,
    senses: 1.3, xp: 95, hide: 'hide_snowwolf', meat: 2, trophy: ['fang', 0.9], tintMats: { Main: 0xe9eef2, Main_Light: 0xffffff }, blurb: 'Bigger, paler and hungrier than its lowland kin.', anim: 'quad', pack: [2, 4],
  },
  elk: {
    id: 'elk', name: 'Rime Elk', model: 'Stag', length: 2.7, hp: 150, speed: 11.5, walk: 1.5, behaviour: 'prey', damage: 24,
    senses: 1.2, xp: 100, hide: 'hide_elk', meat: 7, trophy: ['antler', 1], tint: 0xbfc9d6, blurb: 'A giant of the high snows. Its heavy hide turns the worst of the cold.', anim: 'quad',
  },
  muskox: {
    id: 'muskox', name: 'Tundra Ox', model: 'Bull', length: 2.6, hp: 220, speed: 8, walk: 1.1, behaviour: 'defensive', damage: 34,
    senses: 0.8, xp: 120, hide: 'hide_muskox', meat: 9, trophy: ['horn', 0.9], tintMats: { Main: 0x8d8f96, Main_Light: 0xdde2e8 }, blurb: 'Shaggy, stubborn and nearly arrow-proof from the front.', anim: 'quad', pack: [2, 3],
  },
  // Legendary beasts
  emberclaw: {
    id: 'emberclaw', name: 'Emberclaw', model: 'Fox', length: 1.9, hp: 150, speed: 11.5, walk: 2, behaviour: 'predator', damage: 14,
    senses: 1.4, xp: 220, hide: 'hide_emberclaw', meat: 2, trophy: ['fang', 1], tintMats: { Main: 0xff5a1f, Main_Light: 0xffe2a8 }, legendary: true,
    blurb: 'The great fox of Greenhollow, said to have outfoxed three generations of trappers.', anim: 'quad',
  },
  monarch: {
    id: 'monarch', name: 'The Amber Monarch', model: 'Stag', length: 3.0, hp: 320, speed: 12.5, walk: 1.6, behaviour: 'defensive', damage: 30,
    senses: 1.4, xp: 420, hide: 'hide_monarch', meat: 8, trophy: ['antler_monarch', 1], tint: 0xfff4dc, legendary: true,
    blurb: 'A white stag crowned in gold. Woodcutters leave offerings where it has walked.', anim: 'quad',
  },
  ironhorn: {
    id: 'ironhorn', name: 'Ironhorn', model: 'Bull', length: 3.9, hp: 560, speed: 10.5, walk: 1.3, behaviour: 'boss', damage: 42,
    senses: 1.1, xp: 700, hide: 'hide_ironhorn', meat: 12, trophy: ['horn_ironhorn', 1], tintMats: { Main: 0x1c1a1e, Main_Light: 0x3a3238, Horns: 0xb8bcc4 }, legendary: true,
    blurb: 'The black bull of the Sunscar. The steppe shakes before you see him.', anim: 'quad',
  },
  oldrime: {
    id: 'oldrime', name: 'Old Rime', model: 'Yeti_glTF', length: 4.2, hp: 900, speed: 8.5, walk: 2, behaviour: 'boss', damage: 48,
    senses: 1.2, xp: 1500, hide: 'hide_oldrime', meat: 10, trophy: ['fang', 1], legendary: true,
    blurb: 'Older than the pass roads. Every hunter in Hollowfrost has a story; none have a trophy.', anim: 'biped',
  },
};

export interface ZoneDef {
  id: string;
  name: string;
  town: string;
  rank: number; // required hunter rank
  fare: number;
  subtitle: string;
  seed: number;
  spawns: [string, number][]; // species id, group count
  legendary: string;
  // look
  trees: [string, number, number?][]; // model, weight, scale
  treeDensity: number;
  leafTint: number;
  barkTint: number;
  grassColor: number;
  grassTip: number;
  ground: [string, string, string]; // texture keys: base, path, steep
  groundTint: number;
  bushes: [string, number][];
  bushTint: number;
  rocks: number;
  fogDay: number;
  fogDensity: number;
  skyTop: number;
  hillAmp: number;
  water: number; // water level (relative), lower = less water
  waterColor: number;
  snow: boolean;
  grassAmount: number;
  step: 'grass' | 'snow' | 'dirt';
  music: number; // root midi note
  scale: number[]; // scale intervals
  priceBias: Record<string, number>; // category multipliers at this town's market
}

export const ZONES: Record<string, ZoneDef> = {
  greenhollow: {
    id: 'greenhollow', name: 'Greenhollow Vale', town: 'Fernwick', rank: 1, fare: 0, subtitle: 'Soft meadows and birch-lined streams', seed: 11,
    spawns: [['doe', 5], ['fox', 5], ['stag', 1]], legendary: 'emberclaw',
    trees: [['CommonTree_1', 3], ['CommonTree_2', 3], ['CommonTree_3', 2], ['CommonTree_5', 2], ['Pine_1', 1]], treeDensity: 1, leafTint: 0xffffff, barkTint: 0xffffff,
    grassColor: 0x4f8f2f, grassTip: 0xb7d94c, ground: ['grass', 'dirt', 'rock'], groundTint: 0xffffff,
    bushes: [['Bush_Common_Flowers', 3], ['Bush_Common', 3], ['Fern_1', 3], ['Flower_3_Group', 3], ['Flower_4_Group', 3], ['Plant_1_Big', 2], ['Mushroom_Common', 1]], bushTint: 0xffffff, rocks: 50,
    fogDay: 0xbfe3f2, fogDensity: 0.0052, skyTop: 0x3f8fe0, hillAmp: 9, water: -2.2, waterColor: 0x3f9fb8, snow: false, grassAmount: 1, step: 'grass',
    music: 60, scale: [0, 2, 4, 7, 9], priceBias: { fur: 0.9, leather: 1, goods: 1, trophy: 1, meat: 1.1 },
  },
  amberwood: {
    id: 'amberwood', name: 'Amberwood', town: 'Rusthaven', rank: 4, fare: 40, subtitle: 'An old forest that never left autumn', seed: 23,
    spawns: [['stag', 4], ['wolf', 3], ['aurochs', 3], ['fox', 2], ['doe', 2]], legendary: 'monarch',
    trees: [['TwistedTree_1', 1, 0.55], ['TwistedTree_3', 1, 0.55], ['CommonTree_2', 3], ['CommonTree_4', 3], ['CommonTree_3', 2], ['DeadTree_2', 1, 0.8]], treeDensity: 1.35, leafTint: 0xe8902a, barkTint: 0xd8c0a8,
    grassColor: 0x8a7a2c, grassTip: 0xe0b040, ground: ['leaves', 'dirt', 'rock'], groundTint: 0xffffff,
    bushes: [['Bush_Common', 4], ['Fern_1', 4], ['Mushroom_Laetiporus', 2], ['Mushroom_Common', 3], ['Plant_7_Big', 2]], bushTint: 0xd8a040, rocks: 70,
    fogDay: 0xe8cfa0, fogDensity: 0.0075, skyTop: 0x5a8fc8, hillAmp: 12, water: -3.4, waterColor: 0x4a7f86, snow: false, grassAmount: 0.7, step: 'grass',
    music: 57, scale: [0, 2, 3, 7, 9], priceBias: { fur: 1.1, leather: 0.9, goods: 1.1, trophy: 0.9, meat: 1 },
  },
  sunscar: {
    id: 'sunscar', name: 'Sunscar Steppe', town: 'Dunmarch', rank: 8, fare: 120, subtitle: 'Gold grass, red stone, long horizons', seed: 37,
    spawns: [['bison', 4], ['vicuna', 4], ['jackal', 3]], legendary: 'ironhorn',
    trees: [['DeadTree_1', 2, 0.7], ['DeadTree_3', 2, 0.7], ['DeadTree_5', 1, 0.7], ['CommonTree_5', 1, 0.8]], treeDensity: 0.22, leafTint: 0xb8a850, barkTint: 0xe0c8a8,
    grassColor: 0xa8842c, grassTip: 0xf0d878, ground: ['drygrass', 'sand', 'redrock'], groundTint: 0xffffff,
    bushes: [['Bush_Common', 3], ['Plant_7', 2], ['Grass_Wispy_Tall', 6]], bushTint: 0xb8a04c, rocks: 150,
    fogDay: 0xf2dcb0, fogDensity: 0.0038, skyTop: 0x3a86d8, hillAmp: 6, water: -5, waterColor: 0x5aa0a0, snow: false, grassAmount: 1.3, step: 'dirt',
    music: 62, scale: [0, 1, 4, 5, 7, 8, 10], priceBias: { fur: 1.45, leather: 1.15, goods: 1.2, trophy: 1.1, meat: 0.9 },
  },
  frostfang: {
    id: 'frostfang', name: 'Frostfang Peaks', town: 'Hollowfrost', rank: 12, fare: 300, subtitle: 'Where the snow keeps what it catches', seed: 53,
    spawns: [['snowwolf', 4], ['elk', 4], ['muskox', 3]], legendary: 'oldrime',
    trees: [['Pine_1', 3], ['Pine_2', 3], ['Pine_3', 3], ['Pine_4', 2], ['Pine_5', 2], ['DeadTree_4', 1, 0.7]], treeDensity: 0.9, leafTint: 0x6f9a8c, barkTint: 0xbfc8d0,
    grassColor: 0xc8d8dc, grassTip: 0xf6fbff, ground: ['snow', 'packedsnow', 'rock'], groundTint: 0xffffff,
    bushes: [['Bush_Common', 2], ['Pebble_Round_3', 2]], bushTint: 0x9ab8b0, rocks: 110,
    fogDay: 0xdce8f2, fogDensity: 0.0085, skyTop: 0x6a9fd0, hillAmp: 16, water: -4.2, waterColor: 0x6fb4c8, snow: true, grassAmount: 0.25, step: 'snow',
    music: 55, scale: [0, 2, 3, 5, 7, 8, 10], priceBias: { fur: 0.8, leather: 1.25, goods: 1.3, trophy: 1.25, meat: 1.3 },
  },
};
export const ZONE_ORDER = ['greenhollow', 'amberwood', 'sunscar', 'frostfang'];

export type ItemCat = 'hide' | 'leather' | 'fur' | 'goods' | 'trophy' | 'meat' | 'ammo' | 'supply' | 'gear' | 'weapon';
export interface ItemDef {
  id: string;
  name: string;
  cat: ItemCat;
  value: number; // base sell value (Good quality for hides)
  weight: number;
  icon: string;
  color: string;
  desc: string;
  buy?: number; // price if sold by merchants
  minZone?: number; // merchants stock it from this zone index
}

const I: Record<string, ItemDef> = {};
function item(id: string, name: string, cat: ItemCat, value: number, weight: number, icon: string, color: string, desc: string, buy?: number, minZone?: number) {
  I[id] = { id, name, cat, value, weight, icon, color, desc, buy, minZone };
}
// Hides
item('hide_fox', 'Fox Pelt', 'hide', 16, 1, 'pelt', '#d9773a', 'A soft russet pelt. Tans into soft fur.');
item('hide_deer', 'Deer Hide', 'hide', 20, 2, 'hide', '#b98a58', 'Thin and supple. Tans into light leather.');
item('hide_stag', 'Stag Hide', 'hide', 38, 3, 'hide', '#9a6a3c', 'Broad and even. Tans into sturdy leather.');
item('hide_wolf', 'Wolf Pelt', 'hide', 44, 2.5, 'pelt', '#8d9299', 'Dense grey fur. Tans into thick fur.');
item('hide_aurochs', 'Aurochs Hide', 'hide', 50, 4, 'hide', '#6b4a2e', 'Tough as old boots, and soon to be some.');
item('hide_vicuna', 'Vicuña Fleece', 'hide', 58, 2, 'pelt', '#e8c68a', 'Impossibly fine. Tans into soft fur.');
item('hide_jackal', 'Jackal Pelt', 'hide', 54, 2, 'pelt', '#d8b070', 'Short, sandy fur with a light skin.');
item('hide_bison', 'Bison Hide', 'hide', 92, 6, 'hide', '#4a3323', 'Heavy enough to stop a blade. Tans into heavy leather.');
item('hide_snowwolf', 'Frostfang Pelt', 'hide', 110, 3, 'pelt', '#eef3f7', 'Snow-white and thick as a quilt.');
item('hide_elk', 'Elk Hide', 'hide', 120, 5, 'hide', '#bfc9d6', 'A vast pale hide. Tans into heavy leather.');
item('hide_muskox', 'Ox Hide', 'hide', 135, 7, 'hide', '#8d8f96', 'Shaggy and weatherproof.');
item('hide_emberclaw', "Emberclaw's Pelt", 'hide', 400, 2, 'pelt', '#ff5a1f', 'It seems to glow at dusk. Priceless to the right buyer.');
item('hide_monarch', "Monarch's Hide", 'hide', 800, 4, 'hide', '#fff4dc', 'White as birch bark, flecked with gold.');
item('hide_ironhorn', "Ironhorn's Hide", 'hide', 1500, 8, 'hide', '#2a262c', 'Black, scarred and nearly an inch thick.');
item('hide_oldrime', "Old Rime's Pelt", 'hide', 3000, 8, 'pelt', '#f4fbff', 'Proof that the stories were true.');
// Materials
item('leather_light', 'Light Leather', 'leather', 26, 1, 'leather', '#d2a56b', 'Soft tanned leather for pouches and gloves.');
item('leather_sturdy', 'Sturdy Leather', 'leather', 52, 1.5, 'leather', '#99643a', 'Firm tanned leather for boots, belts and packs.');
item('leather_heavy', 'Heavy Leather', 'leather', 120, 2, 'leather', '#5a3a26', 'Thick tanned leather for armour and saddles.');
item('fur_soft', 'Soft Fur', 'fur', 34, 0.8, 'fur', '#e8a868', 'Dressed fur for trim, hats and linings.');
item('fur_thick', 'Thick Fur', 'fur', 82, 1.2, 'fur', '#aab2bb', 'Heavy dressed fur for cloaks and mantles.');
// Trophies & meat
item('sinew', 'Sinew', 'trophy', 12, 0.2, 'sinew', '#e8d8c0', 'Strong cord for stitching and bowstrings.');
item('antler', 'Antler', 'trophy', 45, 1.5, 'antler', '#e0cfa8', 'Carves into handles, toggles and bow tips.');
item('fang', 'Fang', 'trophy', 30, 0.1, 'fang', '#f4f0e0', 'Popular with charm-makers.');
item('horn', 'Horn', 'trophy', 70, 2, 'horn', '#c9b891', 'Laminates into the strongest bows.');
item('antler_monarch', "Monarch's Crown", 'trophy', 1200, 4, 'antler', '#ffd866', 'A rack of gilded antlers. A bowyer would weep.');
item('horn_ironhorn', "Ironhorn's Horn", 'trophy', 2000, 5, 'horn', '#b8bcc4', 'Cold and grey like forged steel.');
item('meat', 'Game Meat', 'meat', 7, 1, 'meat', '#c0504a', 'Fresh cuts. Sells anywhere; roast at a campfire to heal.');
// Supplies
item('arrow', 'Arrow', 'ammo', 1, 0.05, 'arrow', '#d8c8a0', 'A fletched hunting arrow.', 3);
item('bolt', 'Bolt', 'ammo', 2, 0.08, 'bolt', '#b8b8c0', 'A short, heavy crossbow bolt.', 5);
item('knife', 'Throwing Knife', 'ammo', 4, 0.2, 'knife', '#c8d0d8', 'Balanced for the throw. Quiet and quick.', 9);
item('tomahawk', 'Tomahawk', 'ammo', 10, 0.6, 'axe', '#a8b0b8', 'A hatchet weighted to bite deep.', 24, 1);
item('javelin', 'Javelin', 'ammo', 18, 1, 'spear', '#c8b088', 'A long throwing spear for big game.', 42, 2);
item('salt', 'Tanning Salts', 'supply', 3, 0.2, 'salt', '#f0f0f0', 'Needed to tan any hide.', 6);
item('thread', 'Waxed Thread', 'supply', 2, 0.05, 'thread', '#e8d090', 'Holds leatherwork together.', 5);
item('rivets', 'Brass Rivets', 'supply', 6, 0.1, 'rivet', '#e0b040', 'For work that has to last.', 14, 1);
item('tonic', 'Hunter’s Tonic', 'supply', 12, 0.3, 'tonic', '#e05858', 'Restores 60 health. Tastes like regret.', 30);
// Trade goods (crafted, for sale)
item('g_pouch', 'Coin Pouch', 'goods', 78, 0.3, 'pouch', '#d2a56b', 'Every town needs these.');
item('g_gloves', 'Kid Gloves', 'goods', 118, 0.3, 'glove', '#d2a56b', 'Fine light-leather gloves.');
item('g_hat', 'Fur Hat', 'goods', 132, 0.4, 'hat', '#e8a868', 'Warm, and briefly fashionable everywhere.');
item('g_belt', 'Tooled Belt', 'goods', 150, 0.5, 'belt', '#99643a', 'Sturdy leather with a brass buckle.');
item('g_boots', 'Riding Boots', 'goods', 265, 1.2, 'boot', '#99643a', 'Cut for the stirrup. Always in demand.');
item('g_satchel', 'Courier Satchel', 'goods', 330, 1, 'bag', '#99643a', 'Stitched double and riveted.');
item('g_cloak', 'Fur Cloak', 'goods', 520, 2, 'cloak', '#aab2bb', 'Thick-fur cloak with a soft lining.');
item('g_saddle', 'Steppe Saddle', 'goods', 940, 6, 'saddle', '#5a3a26', 'Heavy-leather saddle. A season’s wages for a rider.');
item('g_drum', 'War Drum', 'goods', 700, 4, 'drum', '#5a3a26', 'Stretched heavy hide over a horn-pegged frame.');
item('g_mantle', 'Royal Mantle', 'goods', 1500, 3, 'cloak', '#f4fbff', 'Fit for a throne room. Almost a shame to sell.');
export const ITEMS = I;

// Tanning: hide -> material, base yield at Good quality
export const TANNING: Record<string, [string, number]> = {
  hide_fox: ['fur_soft', 1], hide_deer: ['leather_light', 2], hide_stag: ['leather_sturdy', 2], hide_wolf: ['fur_thick', 1],
  hide_aurochs: ['leather_sturdy', 3], hide_vicuna: ['fur_soft', 3], hide_jackal: ['leather_light', 3], hide_bison: ['leather_heavy', 2],
  hide_snowwolf: ['fur_thick', 2], hide_elk: ['leather_heavy', 3], hide_muskox: ['leather_heavy', 3],
};

export type GearSlot = 'pack' | 'quiver' | 'armor' | 'boots' | 'bracer' | 'knife';
export interface GearDef {
  id: string; name: string; slot: GearSlot; tier: number; desc: string; icon: string; color: string;
  capacity?: number; ammo?: number; defense?: number; stealth?: number; stamina?: number; draw?: number; skin?: number; cold?: boolean;
}
export const GEAR: Record<string, GearDef> = {
  pack0: { id: 'pack0', name: 'Belt Loops', slot: 'pack', tier: 0, capacity: 28, desc: 'What you can tie to your belt.', icon: 'bag', color: '#a08060' },
  pack1: { id: 'pack1', name: 'Hide Satchel', slot: 'pack', tier: 1, capacity: 45, desc: 'Carry up to 45 weight.', icon: 'bag', color: '#d2a56b' },
  pack2: { id: 'pack2', name: "Trapper's Pack", slot: 'pack', tier: 2, capacity: 70, desc: 'Carry up to 70 weight.', icon: 'bag', color: '#99643a' },
  pack3: { id: 'pack3', name: 'Expedition Frame', slot: 'pack', tier: 3, capacity: 110, desc: 'Carry up to 110 weight.', icon: 'bag', color: '#5a3a26' },
  quiver0: { id: 'quiver0', name: 'Bark Quiver', slot: 'quiver', tier: 0, ammo: 20, desc: 'Holds 20 arrows or bolts.', icon: 'quiver', color: '#a08060' },
  quiver1: { id: 'quiver1', name: 'Leather Quiver', slot: 'quiver', tier: 1, ammo: 35, desc: 'Holds 35 arrows or bolts.', icon: 'quiver', color: '#d2a56b' },
  quiver2: { id: 'quiver2', name: 'Wolfhide Quiver', slot: 'quiver', tier: 2, ammo: 55, desc: 'Holds 55 arrows or bolts.', icon: 'quiver', color: '#aab2bb' },
  armor0: { id: 'armor0', name: 'Woollen Tunic', slot: 'armor', tier: 0, defense: 0, desc: 'Keeps the wind off. Nothing else.', icon: 'armor', color: '#7a8a5a' },
  armor1: { id: 'armor1', name: 'Leather Jerkin', slot: 'armor', tier: 1, defense: 0.18, desc: 'Reduces damage taken by 18%.', icon: 'armor', color: '#d2a56b' },
  armor2: { id: 'armor2', name: 'Studded Hide', slot: 'armor', tier: 2, defense: 0.34, desc: 'Reduces damage taken by 34%.', icon: 'armor', color: '#99643a' },
  armor3: { id: 'armor3', name: 'Frostfur Harness', slot: 'armor', tier: 3, defense: 0.5, cold: true, desc: 'Reduces damage taken by 50%.', icon: 'armor', color: '#dfe8ee' },
  boots0: { id: 'boots0', name: 'Worn Shoes', slot: 'boots', tier: 0, stealth: 0, stamina: 0, desc: 'They have seen better roads.', icon: 'boot', color: '#a08060' },
  boots1: { id: 'boots1', name: 'Soft-sole Boots', slot: 'boots', tier: 1, stealth: 0.2, stamina: 0.15, desc: '20% quieter. Sprinting costs less.', icon: 'boot', color: '#d2a56b' },
  boots2: { id: 'boots2', name: 'Stalker Boots', slot: 'boots', tier: 2, stealth: 0.4, stamina: 0.3, desc: '40% quieter. Sprinting costs much less.', icon: 'boot', color: '#99643a' },
  bracer0: { id: 'bracer0', name: 'Bare Wrists', slot: 'bracer', tier: 0, draw: 0, desc: 'The string stings.', icon: 'glove', color: '#a08060' },
  bracer1: { id: 'bracer1', name: "Archer's Bracer", slot: 'bracer', tier: 1, draw: 0.15, desc: 'Draw and reload 15% faster.', icon: 'glove', color: '#d2a56b' },
  bracer2: { id: 'bracer2', name: 'Sinew-bound Bracer', slot: 'bracer', tier: 2, draw: 0.3, desc: 'Draw and reload 30% faster.', icon: 'glove', color: '#99643a' },
  knife0: { id: 'knife0', name: 'Chipped Knife', slot: 'knife', tier: 0, skin: 0, desc: 'Gets the hide off. Eventually.', icon: 'knife', color: '#a0a0a0' },
  knife1: { id: 'knife1', name: 'Skinning Knife', slot: 'knife', tier: 1, skin: 0.2, desc: 'Cleaner cuts: better hide quality, faster skinning.', icon: 'knife', color: '#c8d0d8' },
  knife2: { id: 'knife2', name: 'Antler-grip Flenser', slot: 'knife', tier: 2, skin: 0.45, desc: 'A master’s tool. Hides come away whole.', icon: 'knife', color: '#e8e0c0' },
};

export type WeaponKind = 'bow' | 'crossbow' | 'thrown';
export interface WeaponDef {
  id: string; name: string; kind: WeaponKind; tier: number; damage: number; speed: number; // projectile m/s
  time: number; // draw / reload / wind-up seconds
  ammo: string; model: string; price: number; zone: number; // sold from zone index
  desc: string; color: string; craft?: [string, number][]; modelScale?: number;
}
export const WEAPONS: Record<string, WeaponDef> = {
  bow1: { id: 'bow1', name: 'Ash Shortbow', kind: 'bow', tier: 1, damage: 24, speed: 52, time: 0.8, ammo: 'arrow', model: 'bow_withString', price: 0, zone: 0, desc: 'Your father’s bow. Light draw, short reach.', color: '#c8a070' },
  bow2: { id: 'bow2', name: "Hunter's Recurve", kind: 'bow', tier: 2, damage: 38, speed: 62, time: 0.85, ammo: 'arrow', model: 'bow_A_withString', price: 160, zone: 0, desc: 'A proper working bow.', color: '#b08050' },
  bow3: { id: 'bow3', name: 'Yew Longbow', kind: 'bow', tier: 3, damage: 58, speed: 74, time: 1.0, ammo: 'arrow', model: 'bow_B_withString', price: 620, zone: 1, desc: 'Long reach and a heavy hit.', color: '#8a6038' },
  bow4: { id: 'bow4', name: 'Horn Composite Bow', kind: 'bow', tier: 4, damage: 84, speed: 86, time: 1.0, ammo: 'arrow', model: 'bow_C_withString', price: 1900, zone: 2, desc: 'Steppe-made. Punches far above its size.', color: '#e0c890' },
  bow5: { id: 'bow5', name: "Monarch's Antler Bow", kind: 'bow', tier: 5, damage: 120, speed: 96, time: 0.9, ammo: 'arrow', model: 'bow_C_withString', price: 0, zone: 9, desc: 'Strung with gold-flecked sinew. There is no finer bow.', color: '#ffd866', craft: [['antler_monarch', 1], ['horn', 4], ['sinew', 6], ['leather_heavy', 2]] },
  xbow1: { id: 'xbow1', name: 'Light Crossbow', kind: 'crossbow', tier: 1, damage: 52, speed: 80, time: 2.3, ammo: 'bolt', model: 'crossbow_1handed', price: 280, zone: 0, desc: 'Flat, hard-hitting and slow to span.', color: '#a08060', modelScale: 1.25 },
  xbow2: { id: 'xbow2', name: 'Heavy Crossbow', kind: 'crossbow', tier: 2, damage: 96, speed: 95, time: 2.9, ammo: 'bolt', model: 'crossbow_2handed', price: 1100, zone: 1, desc: 'Drops a stag where it stands.', color: '#806040' },
  xbow3: { id: 'xbow3', name: 'Siege Arbalest', kind: 'crossbow', tier: 3, damage: 165, speed: 110, time: 3.5, ammo: 'bolt', model: 'crossbow_2handed', price: 3200, zone: 2, desc: 'Steel prod, windlass, and no mercy.', color: '#6a7078', modelScale: 1.2 },
  xbow4: { id: 'xbow4', name: 'Ironhorn Arbalest', kind: 'crossbow', tier: 4, damage: 240, speed: 120, time: 3.2, ammo: 'bolt', model: 'crossbow_2handed', price: 0, zone: 9, desc: 'The prod is a single grey horn. It hums when spanned.', color: '#b8bcc4', craft: [['horn_ironhorn', 1], ['leather_heavy', 4], ['rivets', 10]], modelScale: 1.25 },
  thr1: { id: 'thr1', name: 'Throwing Knives', kind: 'thrown', tier: 1, damage: 18, speed: 30, time: 0.3, ammo: 'knife', model: 'dagger', price: 0, zone: 0, desc: 'Silent. Triple damage on unaware prey.', color: '#c8d0d8' },
  thr2: { id: 'thr2', name: 'Tomahawks', kind: 'thrown', tier: 2, damage: 46, speed: 28, time: 0.42, ammo: 'tomahawk', model: 'axe_1handed', price: 0, zone: 1, desc: 'Heavy, spinning, decisive.', color: '#a8b0b8' },
  thr3: { id: 'thr3', name: 'Javelins', kind: 'thrown', tier: 3, damage: 92, speed: 34, time: 0.55, ammo: 'javelin', model: 'spear_A', price: 0, zone: 2, desc: 'For game that does not notice knives.', color: '#c8b088' },
};
// thrown weapons are unlocked by owning their ammo
export const THROWN_BY_AMMO: Record<string, string> = { knife: 'thr1', tomahawk: 'thr2', javelin: 'thr3' };

export interface RecipeDef {
  id: string; name: string; section: 'Trade Goods' | 'Gear' | 'Weapons';
  out: { item?: string; gear?: string; weapon?: string; qty?: number };
  needs: [string, number][]; rank: number; xp: number;
}
export const RECIPES: RecipeDef[] = [
  { id: 'r_pouch', name: 'Coin Pouch', section: 'Trade Goods', out: { item: 'g_pouch' }, needs: [['leather_light', 2], ['thread', 1]], rank: 1, xp: 10 },
  { id: 'r_gloves', name: 'Kid Gloves', section: 'Trade Goods', out: { item: 'g_gloves' }, needs: [['leather_light', 3], ['thread', 2]], rank: 2, xp: 16 },
  { id: 'r_hat', name: 'Fur Hat', section: 'Trade Goods', out: { item: 'g_hat' }, needs: [['fur_soft', 2], ['leather_light', 1], ['thread', 1]], rank: 2, xp: 18 },
  { id: 'r_belt', name: 'Tooled Belt', section: 'Trade Goods', out: { item: 'g_belt' }, needs: [['leather_sturdy', 2], ['rivets', 1]], rank: 4, xp: 24 },
  { id: 'r_boots', name: 'Riding Boots', section: 'Trade Goods', out: { item: 'g_boots' }, needs: [['leather_sturdy', 3], ['sinew', 2], ['thread', 2]], rank: 5, xp: 34 },
  { id: 'r_satchel', name: 'Courier Satchel', section: 'Trade Goods', out: { item: 'g_satchel' }, needs: [['leather_sturdy', 4], ['rivets', 2], ['thread', 2]], rank: 6, xp: 44 },
  { id: 'r_cloak', name: 'Fur Cloak', section: 'Trade Goods', out: { item: 'g_cloak' }, needs: [['fur_thick', 4], ['fur_soft', 2], ['thread', 3]], rank: 7, xp: 60 },
  { id: 'r_drum', name: 'War Drum', section: 'Trade Goods', out: { item: 'g_drum' }, needs: [['leather_heavy', 3], ['horn', 2], ['sinew', 4]], rank: 9, xp: 80 },
  { id: 'r_saddle', name: 'Steppe Saddle', section: 'Trade Goods', out: { item: 'g_saddle' }, needs: [['leather_heavy', 5], ['leather_sturdy', 2], ['rivets', 4]], rank: 10, xp: 100 },
  { id: 'r_mantle', name: 'Royal Mantle', section: 'Trade Goods', out: { item: 'g_mantle' }, needs: [['fur_thick', 6], ['fur_soft', 6], ['fang', 6], ['thread', 6]], rank: 13, xp: 160 },
  { id: 'r_pack1', name: 'Hide Satchel', section: 'Gear', out: { gear: 'pack1' }, needs: [['leather_light', 4], ['thread', 2]], rank: 1, xp: 30 },
  { id: 'r_quiver1', name: 'Leather Quiver', section: 'Gear', out: { gear: 'quiver1' }, needs: [['leather_light', 3], ['sinew', 1]], rank: 2, xp: 30 },
  { id: 'r_knife1', name: 'Skinning Knife', section: 'Gear', out: { gear: 'knife1' }, needs: [['antler', 1], ['leather_light', 1], ['sinew', 1]], rank: 3, xp: 40 },
  { id: 'r_boots1', name: 'Soft-sole Boots', section: 'Gear', out: { gear: 'boots1' }, needs: [['leather_light', 3], ['fur_soft', 2], ['thread', 2]], rank: 3, xp: 40 },
  { id: 'r_bracer1', name: "Archer's Bracer", section: 'Gear', out: { gear: 'bracer1' }, needs: [['leather_sturdy', 2], ['sinew', 2]], rank: 4, xp: 45 },
  { id: 'r_armor1', name: 'Leather Jerkin', section: 'Gear', out: { gear: 'armor1' }, needs: [['leather_sturdy', 4], ['leather_light', 2], ['thread', 3]], rank: 4, xp: 60 },
  { id: 'r_pack2', name: "Trapper's Pack", section: 'Gear', out: { gear: 'pack2' }, needs: [['leather_sturdy', 5], ['rivets', 3], ['thread', 3]], rank: 6, xp: 70 },
  { id: 'r_quiver2', name: 'Wolfhide Quiver', section: 'Gear', out: { gear: 'quiver2' }, needs: [['fur_thick', 2], ['leather_sturdy', 2], ['fang', 2]], rank: 7, xp: 70 },
  { id: 'r_armor2', name: 'Studded Hide', section: 'Gear', out: { gear: 'armor2' }, needs: [['leather_heavy', 3], ['leather_sturdy', 3], ['rivets', 6]], rank: 8, xp: 110 },
  { id: 'r_boots2', name: 'Stalker Boots', section: 'Gear', out: { gear: 'boots2' }, needs: [['leather_sturdy', 3], ['fur_thick', 2], ['sinew', 3]], rank: 8, xp: 90 },
  { id: 'r_knife2', name: 'Antler-grip Flenser', section: 'Gear', out: { gear: 'knife2' }, needs: [['antler', 3], ['horn', 1], ['leather_sturdy', 1]], rank: 9, xp: 100 },
  { id: 'r_bracer2', name: 'Sinew-bound Bracer', section: 'Gear', out: { gear: 'bracer2' }, needs: [['leather_heavy', 2], ['sinew', 6], ['fang', 2]], rank: 10, xp: 110 },
  { id: 'r_pack3', name: 'Expedition Frame', section: 'Gear', out: { gear: 'pack3' }, needs: [['leather_heavy', 5], ['antler', 2], ['rivets', 6]], rank: 11, xp: 150 },
  { id: 'r_armor3', name: 'Frostfur Harness', section: 'Gear', out: { gear: 'armor3' }, needs: [['leather_heavy', 5], ['fur_thick', 5], ['rivets', 8]], rank: 13, xp: 200 },
  { id: 'r_bow5', name: "Monarch's Antler Bow", section: 'Weapons', out: { weapon: 'bow5' }, needs: WEAPONS.bow5.craft!, rank: 8, xp: 300 },
  { id: 'r_xbow4', name: 'Ironhorn Arbalest', section: 'Weapons', out: { weapon: 'xbow4' }, needs: WEAPONS.xbow4.craft!, rank: 11, xp: 400 },
];

export interface PerkDef { id: string; name: string; max: number; desc: (n: number) => string; icon: string }
export const PERKS: PerkDef[] = [
  { id: 'steady', name: 'Steady Hands', max: 3, icon: 'bow', desc: (n) => `Aim sways ${n * 25}% less and holds ${n * 30}% longer.` },
  { id: 'deadeye', name: 'Deadeye', max: 3, icon: 'target', desc: (n) => `Head and heart shots deal ${n * 20}% more damage.` },
  { id: 'lightstep', name: 'Light Step', max: 3, icon: 'boot', desc: (n) => `Animals notice you ${n * 15}% more slowly.` },
  { id: 'skinner', name: 'Clean Cuts', max: 3, icon: 'knife', desc: (n) => `Hide quality improves. Skinning is ${n * 20}% faster.` },
  { id: 'tanner', name: 'Master Tanner', max: 3, icon: 'leather', desc: (n) => `${n * 15}% chance of a bonus leather when tanning.` },
  { id: 'haggler', name: 'Silver Tongue', max: 3, icon: 'coin', desc: (n) => `Sell for ${n * 6}% more. Buy for ${n * 4}% less.` },
  { id: 'mule', name: 'Pack Mule', max: 3, icon: 'bag', desc: (n) => `Carry ${n * 12} more weight.` },
  { id: 'hardy', name: 'Hardy', max: 3, icon: 'heart', desc: (n) => `+${n * 20} maximum health, +${n * 12} stamina.` },
  { id: 'fletcher', name: 'Scavenger', max: 3, icon: 'arrow', desc: (n) => `${n * 15}% more ammunition survives a shot.` },
];

export const MAX_LEVEL = 20;
export function xpForLevel(level: number): number {
  // xp needed to go from `level` to `level+1`
  return Math.round(60 + 40 * (level - 1) + 9 * (level - 1) * (level - 1));
}

export const TIPS = [
  'Crouch to move quietly. An animal that has not noticed you takes far more damage.',
  'Aim for the head or just behind the shoulder. A clean kill means a better hide.',
  'Every extra arrow you put in an animal ruins a little more of its hide.',
  'Throwing knives deal triple damage to unaware prey.',
  'Crossbows hit hard and fly flat, but take a long time to span.',
  'Raw hides sell poorly. Tan them, craft them, then sell where the price is best.',
  'Furs sell best where it is hot and nobody has any. Ask a steppe merchant.',
  'Sleep at the inn to heal, pass the night and save your game.',
  'Wolves hunt in packs. If you see one, the others have already seen you.',
  'Retrieve your arrows from the ground and from your kills.',
  'Legendary beasts leave signs. Check the notice board for rumours.',
  'Roast game meat at any campfire to restore health in the field.',
  'A heavier pack lets you stay out longer. Craft one at the tanner’s bench.',
];
