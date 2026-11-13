// Game rules: hunting results, skinning, crafting, trade, contracts, travel, rest, progression.
import * as THREE from 'three';
import { Animal, type HitInfo } from './animals';
import { audio, type Mood } from './audio';
import { G } from './ctx';
import { FISH, GEAR, GOODS_QUALITY, ITEMS, QUALITY_NAMES, RECIPES, SPECIES, TANNING, THROWN_BY_AMMO, TIPS, WEAPONS, ZONES, ZONE_ORDER, type Quality, type RecipeDef } from './data';
import { input, rumble } from './input';
import type { Shot } from './projectiles';
import { S, addItem, addXp, ammoCap, buyPrice, capacity, count, countItem, invKey, maxHp, perk, removeAny, removeItem, sellValue, settings, skinBonus, splitKey, totalWeight, writeSave, zoneIndex, type Contract } from './state';
import { WATER_Y } from './terrain';
import { pick } from './util';
import { Zone, type Station } from './world';

const _v = new THREE.Vector3();

export class Game {
  playing = false;
  private autosaveT = 0;
  private musicT = 0;
  private mood: Mood = 'none';
  private hintT = 0;
  private skinLoop = 0;
  focus: { kind: 'carcass'; animal: Animal } | { kind: 'station'; station: Station } | null = null;
  legend: Animal | null = null;

  applyQuality() {
    const q = settings.quality;
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, [1, 1.5, 2][q]));
    G.renderer.shadowMap.enabled = true;
    const size = [1024, 2048, 2048][q];
    if (G.env.sun.shadow.mapSize.x !== size) { G.env.sun.shadow.mapSize.set(size, size); G.env.sun.shadow.map?.dispose(); G.env.sun.shadow.map = null; }
  }

  // ---------- zone flow ----------
  loadZone(id: string) {
    const def = ZONES[id];
    G.zone?.dispose();
    G.shots.clear();
    G.fx.clear();
    G.zone = new Zone(def, settings.quality);
    G.scene.add(G.zone.group);
    G.env.setZone(def);
    S.zone = id;
    const t = G.zone.terrain;
    G.player.teleport(t.town.x + 1.5, t.town.z + 24, Math.PI);
    G.player.cine = null;
    G.player.refreshBack();
    G.animals.populate(G.zone);
    this.legend = null;
    G.ui.boss(null);
    this.ensureBoard(id);
    this.mood = 'none';
  }
  async travel(id: string) {
    const def = ZONES[id];
    if (S.level < def.rank || S.gold < def.fare) return;
    S.gold -= def.fare;
    G.ui.close();
    G.player.frozen = true;
    audio.play('door');
    await G.ui.fade(true, 0.7, `${def.name}`, pick(TIPS));
    S.time = (S.time + 3) % 24;
    this.loadZone(id);
    S.flags['seen_' + id] = true;
    this.save(true);
    await new Promise((r) => setTimeout(r, 500));
    await G.ui.fade(false, 0.9);
    G.player.frozen = false;
    G.ui.banner(def.name, def.subtitle, 'zone');
  }

  save(silent = false) {
    const ok = writeSave();
    if (!silent) G.ui.toast(ok ? 'Game saved' : 'Could not save', ok ? 'good' : 'warn', 'scroll');
  }

  // ---------- progression helpers ----------
  gainXp(n: number, why?: string) {
    const lv = addXp(n);
    if (lv > 0) {
      S.hp = maxHp();
      audio.play('levelup');
      G.ui.banner(`Hunter Rank ${S.level}`, `Skill point earned${ZONE_ORDER.some((z) => ZONES[z].rank === S.level) ? ' — a new region is open to you' : ''}`, 'level');
      if (!S.flags.hint_perk) { S.flags.hint_perk = true; G.ui.hint('Open your journal with <b>Tab</b> to spend skill points.', 9); }
    }
  }
  objective(): string {
    const f = S.flags;
    if (!f.kill) return 'Hunt an animal in the meadows north of Fernwick';
    if (!f.skin) return 'Skin your kill — hold E beside it';
    if (!f.tan) return 'Tan the hide at the tanning bench in town';
    if (!f.craft) return 'Craft something at the tanning bench';
    if (!f.sold) return 'Sell your goods to the merchant';
    for (const z of ZONE_ORDER) if (!f['seen_' + z] && z !== 'greenhollow') return S.level >= ZONES[z].rank ? `Take the wagon to ${ZONES[z].name}` : `Reach Hunter Rank ${ZONES[z].rank} to open the road to ${ZONES[z].name}`;
    if (!S.legends.includes('oldrime')) return 'Find Old Rime in the high snows of Frostfang';
    return 'You are a legend. The hunt goes on.';
  }

  // ---------- combat results ----------
  onShotHit(s: Shot, info: HitInfo) {
    const a = info.animal, w = s.weapon;
    const unaware = a.unaware;
    let dmg = w.damage * s.power;
    const dead = perk('deadeye') * 0.2;
    if (info.part === 'head') dmg *= 2.2 + dead;
    else if (info.part === 'vital') dmg *= 1.5 + dead;
    if (unaware) dmg *= w.kind === 'thrown' ? 3 : 1.5;
    // the tundra ox shrugs off frontal body hits
    dmg = Math.round(dmg);
    S.stats.hits++;
    const killed = a.onHit(dmg, info.part, unaware, w.id);
    const crit = info.part !== 'body' || unaware;
    audio.play('hit_flesh', { pos: info.point, volume: 1 });
    G.fx.burst(info.point, 0xb04a3a, crit ? 10 : 6, 2.2, 0.1, 0.45);
    G.fx.burst(info.point, 0xe8dcc8, 5, 1.5, 0.12, 0.6, 2);
    G.ui.hitMarker(killed ? 'kill' : crit ? 'crit' : 'hit');
    G.ui.damage(info.point, dmg, crit, info.part === 'head' ? 'Headshot' : info.part === 'vital' ? 'Vital' : unaware ? 'Ambush' : '');
    if (killed) { rumble(0.6, 180); this.onKill(a, s.dist); }
    else if (a.def.legendary) this.onLegendEngage(a);
  }
  private onKill(a: Animal, dist: number) {
    const d = a.def;
    S.kills[d.id] = (S.kills[d.id] ?? 0) + 1;
    S.flags.kill = true;
    const clean = a.hits === 1;
    this.gainXp(d.xp * (clean ? 1.25 : 1));
    G.ui.toast(`${d.name} down${clean ? ' — clean kill' : ''}${dist > 45 ? ` (${Math.round(dist)} m)` : ''}`, 'good', 'target');
    for (const c of S.contracts) {
      if (c.kind === 'hunt' && c.item === d.id && c.have < c.qty) {
        c.have++;
        if (c.have >= c.qty) this.completeContract(c);
      }
    }
    if (d.legendary) {
      S.legends.push(d.id);
      audio.play('legendary');
      G.ui.banner(`${d.name} has fallen`, 'A legend ends. Another begins.', 'legend');
      this.legend = null;
      G.ui.boss(null);
    }
    if (!S.flags.hint_skin) { S.flags.hint_skin = true; G.ui.hint('Walk up to your kill and hold <b>E</b> to skin it.', 10); }
  }
  onLegendEngage(a: Animal) {
    if (this.legend === a) return;
    this.legend = a;
    G.ui.boss(a);
  }
  onLegendDisengage(a: Animal) {
    if (this.legend === a) { this.legend = null; G.ui.boss(null); }
  }
  onPlayerDeath() {
    S.stats.deaths++;
    const lost = Math.floor(S.gold * 0.15);
    setTimeout(async () => {
      await G.ui.fade(true, 1.4);
      S.gold -= lost;
      S.hp = maxHp();
      S.time = 7.5; S.day++;
      this.loadZone(S.zone);
      G.player.revive();
      this.save(true);
      G.ui.showDeath(lost, async () => { await G.ui.fade(false, 1); });
    }, 2200);
  }

  // ---------- skinning ----------
  private skin(a: Animal) {
    const d = a.def;
    const dur = Math.max(1.2, (1.6 + d.length * 0.9) * (1 - perk('skinner') * 0.2) * (1 - (GEAR[S.gear.knife].skin ?? 0) * 0.5));
    audio.play('draw_knife');
    this.skinLoop = 0;
    G.player.yaw = Math.atan2(a.pos.x - G.player.pos.x, a.pos.z - G.player.pos.z);
    G.player.startBusy(dur, `Skinning ${d.name}`, () => {
      let score = 0.42 + skinBonus() + (Math.random() - 0.5) * 0.2;
      if (a.critKill) score += 0.22;
      if (a.hits === 1) score += 0.28; else if (a.hits === 2) score += 0.08; else score -= 0.14 * (a.hits - 2);
      if (a.firstHitUnaware) score += 0.08;
      const q: Quality = score >= 0.98 ? 2 : score >= 0.55 ? 1 : 0;
      a.skinned = true; a.deadT = 0;
      addItem(invKey(d.hide, q), 1);
      G.ui.toast(`${QUALITY_NAMES[q]} ${ITEMS[d.hide].name}`, q === 2 ? 'rare' : 'item', d.hide);
      if (d.meat) { addItem('meat', d.meat); G.ui.toast(`+${d.meat} Game Meat`, 'item', 'meat'); }
      if (d.trophy && Math.random() < d.trophy[1] + skinBonus() * 0.3) { addItem(d.trophy[0], 1); G.ui.toast(`+1 ${ITEMS[d.trophy[0]].name}`, 'item', d.trophy[0]); }
      // recover embedded ammunition
      const back: Record<string, number> = {};
      for (const am of a.stuck) if (Math.random() < 0.7 + perk('fletcher') * 0.1) back[am] = (back[am] ?? 0) + 1;
      for (const am in back) { addItem(am, back[am]); G.ui.toast(`Recovered ${back[am]} ${ITEMS[am].name}${back[am] > 1 ? 's' : ''}`, 'item', am); }
      for (const o of a.stuckObjs) o.removeFromParent();
      S.stats.skinned++;
      S.flags.skin = true;
      audio.play('pickup');
      this.gainXp(Math.round(d.xp * 0.3) + q * 4);
      if (d.id === 'oldrime' && !S.flags.ending) { S.flags.ending = true; setTimeout(() => G.ui.showCredits(), 2500); }
      if (totalWeight() > capacity()) G.ui.hint('You are <b>overburdened</b>. Sell or craft a bigger pack to move freely.', 7);
      else if (!S.flags.hint_tan) { S.flags.hint_tan = true; G.ui.hint('Bring hides to the <b>tanning bench</b> in town to turn them into leather.', 10); }
    });
  }

  useTonic() {
    if (S.hp >= maxHp()) return;
    if (!removeItem('tonic', 1)) { G.ui.toast('No tonics', 'warn'); return; }
    S.hp = Math.min(maxHp(), S.hp + 60);
    audio.play('pickup');
    G.ui.toast('Drank a tonic (+60)', 'good', 'tonic');
  }

  // ---------- trade ----------
  shopStock(kind: 'merchant' | 'fletcher' | 'fishmonger'): string[] {
    if (kind === 'fishmonger') return ['rod', 'bait'];
    const zi = zoneIndex(S.zone);
    const ids = kind === 'merchant' ? ['salt', 'bark', 'thread', 'rivets', 'tonic', 'rod', 'bait'] : ['arrow', 'bolt', 'knife', 'tomahawk', 'javelin'];
    return ids.filter((id) => (ITEMS[id].minZone ?? 0) <= zi);
  }
  weaponStock(): string[] {
    const zi = zoneIndex(S.zone);
    return Object.values(WEAPONS).filter((w) => w.kind !== 'thrown' && w.price > 0 && w.zone <= zi).map((w) => w.id);
  }
  buy(id: string, n: number): boolean {
    const it = ITEMS[id];
    if (id === 'rod' && count('rod') > 0) { G.ui.toast('You already have a pole', 'warn'); audio.play('error'); return false; }
    if (id === 'rod') n = 1;
    if ((id === 'arrow' || id === 'bolt') && count(id) + n > ammoCap()) n = ammoCap() - count(id);
    if (n <= 0) { G.ui.toast('Your quiver is full', 'warn'); audio.play('error'); return false; }
    const cost = buyPrice(id) * n;
    if (S.gold < cost) { G.ui.toast('Not enough coin', 'warn'); audio.play('error'); return false; }
    S.gold -= cost;
    addItem(id, n);
    audio.play('coins');
    const thr = THROWN_BY_AMMO[id];
    if (thr && (!S.slots[2] || WEAPONS[thr].tier > WEAPONS[S.slots[2]].tier)) S.slots[2] = thr;
    return true;
  }
  buyWeapon(id: string): boolean {
    const w = WEAPONS[id];
    if (S.weapons.includes(id)) return false;
    const cost = Math.round(w.price * (1 - perk('haggler') * 0.04));
    if (S.gold < cost) { G.ui.toast('Not enough coin', 'warn'); audio.play('error'); return false; }
    S.gold -= cost;
    S.weapons.push(id);
    this.equipWeapon(id);
    audio.play('coins');
    G.ui.toast(`Bought ${w.name}`, 'good', w.kind === 'bow' ? 'bow' : 'crossbow');
    return true;
  }
  equipWeapon(id: string) {
    const w = WEAPONS[id];
    const slot = w.kind === 'bow' ? 0 : w.kind === 'crossbow' ? 1 : 2;
    S.slots[slot] = id;
    if (w.kind === 'crossbow') S.flags['xl_' + id] = S.flags['xl_' + id] ?? true;
    audio.play('equip');
  }
  sell(key: string, n: number, mult = 1) {
    n = Math.min(n, count(key));
    if (n <= 0) return;
    const v = Math.round(sellValue(key, S.zone) * mult) * n;
    addItem(key, -n);
    S.gold += v;
    S.stats.earned += v;
    const [id] = splitKey(key);
    if (ITEMS[id].cat === 'goods') { S.flags.sold = true; this.gainXp(Math.round(v * 0.04)); }
    audio.play('coins');
  }

  /** Huntmaster's standing bounty on the region's predators: [species, unclaimed kills, coin each]. */
  bounties(): [string, number, number][] {
    const ids = [...new Set(G.zone.def.spawns.map((s) => s[0]))].filter((id) => SPECIES[id].behaviour === 'predator');
    return ids.map((id) => [id, (S.kills[id] ?? 0) - (S.bounty?.[id] ?? 0), Math.round(SPECIES[id].xp * 0.6)]);
  }
  claimBounties() {
    let total = 0;
    S.bounty = S.bounty ?? {};
    for (const [id, n, each] of this.bounties()) { total += n * each; S.bounty[id] = S.kills[id] ?? 0; }
    if (!total) return;
    S.gold += total; S.stats.earned += total;
    audio.play('quest');
    G.ui.toast(`Bounty paid: +${total} coin`, 'rare', 'coin');
    this.gainXp(Math.round(total * 0.15));
  }

  // ---------- crafting ----------
  /** Tan n hides. score 0..1 comes from the scraping minigame (quick tanning passes 0.6). */
  tan(key: string, n: number, score = 0.6, agent: 'salt' | 'bark' = 'salt'): number {
    const [id, q] = splitKey(key);
    const rule = TANNING[id];
    if (!rule) return 0;
    n = Math.min(n, count(key), count(agent));
    if (n <= 0) { G.ui.toast(`You need ${ITEMS[agent].name}`, 'warn'); audio.play('error'); return 0; }
    let out = 0;
    for (let i = 0; i < n; i++) {
      let y = rule[1] + (q === 2 ? 1 : q === 0 ? -1 : 0) + (agent === 'bark' ? 1 : 0);
      if (score >= 0.85) y++; else if (score < 0.35) y--;
      if (Math.random() < perk('tanner') * 0.15) y++;
      out += Math.max(1, y);
    }
    addItem(key, -n);
    addItem(agent, -n);
    addItem(rule[0], out);
    S.flags.tan = true;
    audio.play('tan');
    G.ui.toast(`${score >= 0.85 ? 'Perfect tan! ' : ''}+${out} ${ITEMS[rule[0]].name}`, score >= 0.85 ? 'rare' : 'item', rule[0]);
    this.gainXp(4 * n + (score >= 0.85 ? 4 : 0));
    return out;
  }
  canCraft(r: RecipeDef): boolean {
    if (S.level < r.rank) return false;
    if (r.out.gear && this.ownsGear(r.out.gear)) return false;
    if (r.out.weapon && S.weapons.includes(r.out.weapon)) return false;
    return r.needs.every(([id, n]) => countItem(id) >= n);
  }
  ownsGear(id: string) {
    const g = GEAR[id];
    return GEAR[S.gear[g.slot]].tier >= g.tier;
  }
  /** score 0..1 from the stitching minigame decides Rough / plain / Fine for trade goods. */
  craft(r: RecipeDef, score = 0.6) {
    if (!this.canCraft(r)) { audio.play('error'); return; }
    for (const [id, n] of r.needs) removeAny(id, n);
    const fine = score >= 0.85, rough = score < 0.35;
    if (r.out.item) {
      const q: Quality = fine ? 2 : rough ? 0 : 1;
      addItem(invKey(r.out.item, q), 1);
      G.ui.toast(`Crafted ${q === 1 ? '' : GOODS_QUALITY[q] + ' '}${ITEMS[r.out.item].name}`, fine ? 'rare' : 'good', r.out.item);
    }
    if (r.out.gear) { const g = GEAR[r.out.gear]; S.gear[g.slot] = g.id; G.ui.toast(`Equipped ${g.name}`, 'rare'); audio.play('equip'); }
    if (r.out.weapon) { S.weapons.push(r.out.weapon); this.equipWeapon(r.out.weapon); G.ui.toast(`Forged ${WEAPONS[r.out.weapon].name}`, 'rare'); }
    S.stats.crafted++;
    S.flags.craft = true;
    audio.play('craft');
    this.gainXp(Math.round(r.xp * (fine ? 1.3 : 1)));
    G.player.refreshBack();
  }
  /** Bench cutscene: stand the hunter at the tanner's bench and let the camera circle. */
  benchScene(on: boolean, anim: 'Working_A' | 'Hammering' = 'Working_A') {
    const p = G.player;
    if (!on) { p.cine = null; return; }
    const st = G.zone.stations.find((x) => x.kind === 'tanner');
    if (!st) return;
    const t = G.zone.terrain.town;
    const out = Math.atan2(st.pos.x - t.x, st.pos.z - t.z);
    p.pos.set(st.pos.x + Math.sin(out) * 0.7, st.pos.y, st.pos.z + Math.cos(out) * 0.7);
    p.yaw = out;
    p.crouching = false;
    p.cine = { angle: out + Math.PI * 0.72, anim };
  }
  /** Knife slash landed on an animal. */
  onMeleeHit(a: Animal, dmg: number) {
    const unaware = a.unaware;
    if (unaware) dmg *= 3;
    dmg = Math.round(dmg);
    a.bones();
    const killed = a.onHit(dmg, unaware ? 'vital' : 'body', unaware, 'knife', 0.6);
    audio.play('hit_flesh', { pos: a.pos });
    G.fx.burst(a.chest, 0xb04a3a, 8, 2.4, 0.1, 0.45);
    G.ui.hitMarker(killed ? 'kill' : unaware ? 'crit' : 'hit');
    G.ui.damage(a.chest, dmg, unaware, unaware ? 'Ambush' : '');
    rumble(0.5, 120);
    G.shake = Math.min(1, G.shake + 0.3);
    if (killed) this.onKill(a, 0);
    else if (a.def.legendary) this.onLegendEngage(a);
  }
  cook(n: number) {
    n = Math.min(n, count('meat'));
    if (n <= 0) return;
    addItem('meat', -n);
    S.hp = Math.min(maxHp(), S.hp + 14 * n);
    audio.play('pickup');
    G.ui.toast(`Roasted ${n} meat (+${14 * n} health)`, 'good', 'meat');
  }

  cheapestFish(): string | null {
    let best: string | null = null;
    for (const k in S.inv) if (ITEMS[k]?.cat === 'fish' && (!best || ITEMS[k].value < ITEMS[best].value)) best = k;
    return best;
  }
  cookFish() {
    const k = this.cheapestFish();
    if (!k) return;
    addItem(k, -1);
    S.hp = Math.min(maxHp(), S.hp + 24);
    audio.play('pickup');
    G.ui.toast(`Grilled ${ITEMS[k].name} (+24 health)`, 'good', k);
  }

  // ---------- fishing ----------
  /** A point on open water a short cast ahead of the hunter, or null if not at a shore. */
  private castPoint(): THREE.Vector3 | null {
    const p = G.player, t = G.zone.terrain;
    if (!p.grounded || WATER_Y - t.height(p.pos.x, p.pos.z) > 0.5) return null;
    const fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw);
    for (const d of [2.5, 4, 5.5, 7, 8.5, 10]) {
      const x = p.pos.x + fx * d, z = p.pos.z + fz * d;
      if (WATER_Y - t.height(x, z) > 0.18) {
        const far = WATER_Y - t.height(x + fx * 2.5, z + fz * 2.5) > 0.18 ? 2.5 : 0.6;
        return new THREE.Vector3(x + fx * far, WATER_Y, z + fz * far);
      }
    }
    return null;
  }
  private fish(at: THREE.Vector3) {
    const p = G.player;
    if (!removeItem('bait', 1)) { G.ui.toast('No bait — merchants sell it', 'warn', 'bait'); audio.play('error'); return; }
    p.yaw = Math.atan2(at.x - p.pos.x, at.z - p.pos.z);
    p.crouching = false;
    p.cine = { angle: p.yaw + 2.5, anim: 'Fishing_Cast', dist: 4.6, bobber: at };
    G.ui.startFishing({
      fish: FISH[S.zone], luck: Math.min(1, S.level / 14),
      onPhase: (anim) => { if (p.cine) p.cine.anim = anim; },
      onDone: (r) => {
        p.cine = null;
        if (!r.fish) return;
        const it = ITEMS[r.fish];
        addItem(r.fish, 1);
        S.fish = S.fish ?? {};
        S.fish[r.fish] = (S.fish[r.fish] ?? 0) + 1;
        G.ui.toast(`${it.name} · ${r.weight} lb`, it.value > 100 ? 'rare' : 'item', r.fish);
        if (r.perfect && Math.random() < 0.5) { addItem('bait', 1); G.ui.toast('Clean catch — bait saved', 'good', 'bait'); }
        this.gainXp(Math.round(6 + it.value * 0.18));
      },
    });
  }

  // ---------- rest ----------
  async sleep(cost: number) {
    if (S.gold < cost) { G.ui.toast('Not enough coin', 'warn'); audio.play('error'); return; }
    S.gold -= cost;
    G.ui.close();
    G.player.frozen = true;
    audio.play('sleep');
    await G.ui.fade(true, 1.2, 'Resting…', pick(TIPS));
    if (S.time > 6.5) S.day++;
    S.time = 6.6;
    S.hp = maxHp();
    G.player.stamina = 999;
    this.ensureBoard(S.zone);
    this.save(true);
    await new Promise((r) => setTimeout(r, 1300));
    await G.ui.fade(false, 1.2);
    G.player.frozen = false;
    G.ui.toast(`Day ${S.day} — game saved`, 'good', 'sun');
  }

  // ---------- contracts ----------
  ensureBoard(zone: string) {
    if (S.boardDay[zone] === S.day && S.board[zone]?.length) return;
    S.boardDay[zone] = S.day;
    const def = ZONES[zone];
    const species = def.spawns.map((s) => SPECIES[s[0]]);
    const giver = ['the Tanners’ Guild', 'a travelling tailor', 'the garrison quartermaster', 'a cobbler', 'the town council', 'a wealthy widow', 'a caravan master'];
    const list: Contract[] = [];
    const goods = RECIPES.filter((r) => r.section === 'Trade Goods' && r.rank <= S.level + 2);
    for (let i = 0; i < 4; i++) {
      const roll = Math.random();
      const sp = pick(species);
      let c: Contract;
      if (roll < 0.4) {
        const minQ = (Math.random() < 0.2 ? 2 : Math.random() < 0.6 ? 1 : 0) as Quality;
        const qty = minQ === 2 ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3);
        const v = ITEMS[sp.hide].value;
        c = { id: 0, zone, kind: 'hide', item: sp.hide, qty, minQ, have: 0, gold: Math.round(v * qty * [1.7, 2.3, 3.6][minQ] + 12), xp: Math.round(sp.xp * qty * 0.6), giver: pick(giver),
          text: `${qty} × ${minQ > 0 ? QUALITY_NAMES[minQ] + ' or better ' : ''}${ITEMS[sp.hide].name}` };
      } else if (roll < 0.7 || !goods.length) {
        const qty = 2 + Math.floor(Math.random() * 3);
        c = { id: 0, zone, kind: 'hunt', item: sp.id, qty, minQ: 0, have: 0, gold: Math.round(sp.xp * qty * 1.2 + 10), xp: Math.round(sp.xp * qty * 0.5), giver: pick(['worried farmers', 'the town council', 'a shepherd', 'the road wardens']),
          text: `Cull ${qty} ${sp.name}${qty > 1 ? 's' : ''}` };
      } else {
        const r = pick(goods);
        const qty = 1 + Math.floor(Math.random() * 3);
        const it = ITEMS[r.out.item!];
        c = { id: 0, zone, kind: 'goods', item: it.id, qty, minQ: 0, have: 0, gold: Math.round(it.value * qty * 1.5), xp: Math.round(r.xp * qty * 0.8 + 20), giver: pick(giver), text: `${qty} × ${it.name}` };
      }
      if (list.some((o) => o.item === c.item && o.kind === c.kind)) continue;
      list.push(c);
    }
    S.board[zone] = list;
  }
  acceptContract(c: Contract) {
    if (S.contracts.length >= 4) { G.ui.toast('You can hold four contracts', 'warn'); audio.play('error'); return; }
    S.board[c.zone] = S.board[c.zone].filter((o) => o !== c);
    c.id = S.contractSeq++;
    S.contracts.push(c);
    audio.play('ui_page');
    G.ui.toast('Contract accepted', 'good', 'scroll');
  }
  contractReady(c: Contract) { return c.kind === 'hunt' ? c.have >= c.qty : countItem(c.item, c.minQ) >= c.qty; }
  completeContract(c: Contract) {
    if (c.kind !== 'hunt') { if (!removeAny(c.item, c.qty, c.minQ)) return; }
    S.contracts = S.contracts.filter((o) => o !== c);
    S.gold += c.gold;
    S.stats.earned += c.gold;
    audio.play('quest');
    G.ui.toast(`Contract complete: +${c.gold} coin`, 'rare', 'coin');
    this.gainXp(c.xp);
  }
  abandonContract(c: Contract) { S.contracts = S.contracts.filter((o) => o !== c); }

  // ---------- per-frame ----------
  update(dt: number) {
    const p = G.player, z = G.zone;
    S.stats.playtime += dt;
    if (!G.ui.isOpen) S.time = (S.time + dt / 55) % 24;

    // interaction focus
    this.focus = null;
    if (!G.ui.isOpen && !p.dead && !p.frozen) {
      const car = G.animals.nearestCarcass(p.pos, 2.4);
      if (car) this.focus = { kind: 'carcass', animal: car };
      else {
        let best: Station | null = null, bd = 1e9;
        for (const st of z.stations) {
          const d = Math.hypot(st.pos.x - p.pos.x, st.pos.z - p.pos.z);
          if (d < st.radius && d < bd) { bd = d; best = st; }
        }
        if (best) this.focus = { kind: 'station', station: best };
      }
      if (p.busy) G.ui.setPrompt(p.busy.label, p.busy.t / p.busy.dur);
      else if (this.focus?.kind === 'carcass') {
        G.ui.setPrompt(`Skin ${this.focus.animal.def.name}`, -1, 'E');
        if (input.interactHit() && p.grounded) this.skin(this.focus.animal);
      } else if (this.focus?.kind === 'station') {
        const st = this.focus.station;
        G.ui.setPrompt(st.prompt, -1, 'E', st.name);
        if (input.interactHit()) {
          audio.play('ui_open');
          if (st.kind === 'talk') G.ui.hint(`<b>${st.name}:</b> ${st.line ?? '…'}`, 8);
          else G.ui.open(st.kind);
        }
      } else {
        const cast = count('rod') > 0 || !S.flags.hint_rod ? this.castPoint() : null;
        if (cast && count('rod') > 0) {
          G.ui.setPrompt(count('bait') ? 'Cast a line' : 'Cast a line (no bait)', -1, 'E', 'Fishing');
          if (input.interactHit()) this.fish(cast);
        } else {
          if (cast && !S.flags.hint_rod) { S.flags.hint_rod = true; G.ui.hint('Fish are rising. Buy a <b>fishing pole</b> and <b>bait</b> from a merchant to cast from the shore.', 9); }
          G.ui.setPrompt(null);
        }
      }
      if (p.busy) {
        this.skinLoop -= dt;
        if (this.skinLoop <= 0) { this.skinLoop = 0.55; audio.play('skin', { volume: 0.7 }); }
      }
    } else G.ui.setPrompt(null);

    // contextual hints
    this.hintT -= dt;
    if (this.hintT <= 0) {
      this.hintT = 1;
      if (!S.flags.hint_sneak) {
        for (const a of G.animals.list) if (a.alive && a.pos.distanceTo(p.pos) < 55) { S.flags.hint_sneak = true; G.ui.hint('Game nearby. Press <b>C</b> to crouch and stalk closer. Hold <b>Left Mouse</b> to draw, release to loose. <b>F</b> slashes with your knife.', 12); break; }
      }
      if (!S.flags.hint_move && S.stats.playtime > 2) { S.flags.hint_move = true; G.ui.hint('<b>WASD</b> to move, <b>Shift</b> to sprint, mouse to look. The hunting grounds lie north, past the well.', 10); }
    }

    // music + ambience
    this.musicT -= dt;
    if (this.musicT <= 0) {
      this.musicT = 0.5;
      const aw = G.animals.awareness();
      let mood: Mood = 'wild';
      if (aw.hunted || this.legend) mood = 'danger';
      else if (z.inTown(p.pos, 6)) mood = 'town';
      else if (G.env.night > 0.6) mood = 'night';
      if (mood !== this.mood) { this.mood = mood; audio.setMusic(mood, z.def.id); }
      const water = z.nearestWater(p.pos), fire = z.nearestFire(p.pos);
      audio.setAmbience({
        night: G.env.night, water: Math.max(0, 1 - Math.max(0, water) / 22), fire: Math.max(0, 1 - fire / 12), wind: z.def.snow ? 0.8 : z.def.id === 'sunscar' ? 0.55 : 0.3,
        snow: z.def.snow, town: z.inTown(p.pos) ? 1 : 0, birds: z.def.snow ? 0.15 : z.def.id === 'sunscar' ? 0.3 : 1,
      });
    }

    // autosave while safe
    this.autosaveT += dt;
    if (this.autosaveT > 90 && !p.dead && !G.animals.awareness().hunted) { this.autosaveT = 0; writeSave(); }
    _v.copy(p.pos);
  }
}
