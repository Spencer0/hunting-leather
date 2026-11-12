import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, GLTF>();
const matCache = new Map<THREE.Material, THREE.Material>();

export const BASE = new URL('assets/', document.baseURI).href;

/** Convert glTF PBR materials to cheap Lambert materials for a consistent, era-appropriate lit look. */
function toLambert(m: THREE.Material): THREE.Material {
  const hit = matCache.get(m);
  if (hit) return hit;
  const s = m as THREE.MeshStandardMaterial;
  const l = new THREE.MeshLambertMaterial({
    name: s.name,
    color: s.color ? s.color.clone() : new THREE.Color(0xffffff),
    map: s.map ?? null,
    vertexColors: s.vertexColors,
    side: s.side,
    transparent: false,
  });
  if (s.alphaTest > 0 || s.transparent) {
    l.alphaTest = 0.5;
    l.side = THREE.DoubleSide;
  }
  if (l.map) {
    l.map.colorSpace = THREE.SRGBColorSpace;
    l.map.anisotropy = 4;
  }
  if (s.emissive && (s.emissive.r > 0 || s.emissive.g > 0 || s.emissive.b > 0)) {
    l.emissive = s.emissive.clone();
    l.emissiveMap = s.emissiveMap ?? null;
  }
  matCache.set(m, l);
  return l;
}

function prepare(g: GLTF) {
  g.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toLambert) : toLambert(mesh.material);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    }
  });
}

export async function loadModels(paths: string[], onProgress: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  const queue = paths.filter((p) => !cache.has(p));
  const total = queue.length;
  const worker = async () => {
    while (queue.length) {
      const p = queue.pop()!;
      try {
        const g = await loader.loadAsync(BASE + p + '.glb');
        prepare(g);
        cache.set(p, g);
      } catch (e) {
        console.warn('asset failed', p, e);
      }
      onProgress(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

export function hasModel(path: string) {
  return cache.has(path);
}

/** Clone of a model's scene (skeleton-safe). */
export function model(path: string): THREE.Object3D {
  const g = cache.get(path);
  if (!g) {
    console.warn('missing model', path);
    return new THREE.Group();
  }
  return SkeletonUtils.clone(g.scene);
}

/** Raw (shared, do not mutate) scene for instancing. */
export function rawModel(path: string): THREE.Object3D | null {
  return cache.get(path)?.scene ?? null;
}

export function clips(path: string): THREE.AnimationClip[] {
  return cache.get(path)?.animations ?? [];
}

/** Clone the materials of an object so it can be tinted independently. */
export function uniqueMaterials(obj: THREE.Object3D) {
  const map = new Map<THREE.Material, THREE.Material>();
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const conv = (m: THREE.Material) => {
      let c = map.get(m);
      if (!c) {
        c = m.clone();
        map.set(m, c);
      }
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
  });
  return [...map.values()] as THREE.MeshLambertMaterial[];
}

export const MODEL_MANIFEST = {
  animals: ['Deer', 'Stag', 'Fox', 'Wolf', 'Bull', 'Cow', 'Alpaca', 'Husky', 'Yeti_glTF'].map((n) => 'animals/' + n),
  chars: ['Ranger', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded', 'Knight', 'Druid', 'Engineer'].map((n) => 'chars/' + n),
  anims: ['General', 'MovementBasic', 'MovementAdvanced', 'CombatRanged', 'Simulation', 'Tools'].map((n) => 'anims/' + n),
  weapons: ['bow_withString', 'bow_A_withString', 'bow_B_withString', 'bow_C_withString', 'crossbow_1handed', 'crossbow_2handed', 'arrow_bow', 'arrow_crossbow', 'dagger', 'axe_1handed', 'spear_A', 'quiver'].map((n) => 'weapons/' + n),
  nature: [
    'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5',
    'TwistedTree_1', 'TwistedTree_3', 'DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5',
    'Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Flower_3_Group', 'Flower_4_Group', 'Plant_1_Big', 'Plant_7', 'Plant_7_Big', 'Mushroom_Common', 'Mushroom_Laetiporus',
    'Grass_Wispy_Tall', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Pebble_Round_3',
  ].map((n) => 'nature/' + n),
  town: [
    'building_home_A_blue', 'building_home_B_blue', 'building_market_blue', 'building_blacksmith_blue', 'building_tavern_blue', 'building_workshop_blue', 'building_well_blue',
    'building_stables_blue', 'building_windmill_blue', 'building_watchtower_blue', 'building_lumbermill_blue', 'building_archeryrange_blue', 'building_church_blue', 'building_townhall_blue',
    'barrel', 'crate_A_big', 'crate_B_small', 'crate_long_A', 'haybale', 'sack', 'target', 'weaponrack', 'wheelbarrow', 'trough', 'flag_blue', 'flag_red', 'flag_green', 'flag_yellow', 'cart_merchant', 'cart', 'bucket_arrows', 'resource_lumber', 'fence_wood_straight', 'pallet',
  ].map((n) => 'town/' + n),
  props: ['Stall_Empty', 'Stall_Cart_Empty', 'Workbench', 'Workbench_Drawers', 'Anvil_Log', 'Barrel', 'Barrel_Apples', 'Crate_Wooden', 'Banner_1', 'Banner_2', 'Dummy', 'Bag', 'Chest_Wood', 'Bench', 'Table_Large', 'WeaponStand', 'Peg_Rack', 'Stool', 'FarmCrate_Apple', 'Torch_Metal', 'k_campfire-pit', 'k_tent', 'k_bedroll', 'k_signpost', 'k_tree-log'].map((n) => 'props/' + n),
};
export const ALL_MODELS = Object.values(MODEL_MANIFEST).flat();
