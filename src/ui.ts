// DOM user interface: HUD, menus, shops, journal, title, banners.
import * as THREE from 'three';
import type { Animal } from './animals';
import { audio } from './audio';
import { G } from './ctx';
import { GEAR, GOODS_QUALITY, ITEMS, MAX_LEVEL, PERKS, QUALITY_NAMES, RECIPES, SPECIES, TANNING, TIPS, WEAPONS, ZONES, ZONE_ORDER, gridKey, patternCells, xpForLevel, type GearSlot, type RecipeDef, type WeaponDef } from './data';
import { Minigame, type MiniOpts } from './minigame';
import { icon } from './icons';
import { input, lockPointer, locked, unlockPointer, usingPad } from './input';
import { RANK_TITLES, S, activeWeapon, addItem, ammoCap, buyPrice, canBuyPerk, capacity, count, countItem, deleteSlot, maxHp, maxStamina, perk, readSlot, saveSettings, sellValue, settings, splitKey, totalWeight, zoneIndex, type Save } from './state';
import { MAP_SPAN } from './terrain';
import { clamp, fmtTime, pick } from './util';
import type { StationKind } from './world';

type PanelKind = StationKind | 'journal' | 'pause' | 'options' | 'controls' | 'mini';
const $ = (html: string): HTMLElement => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };
const coin = (n: number) => `${icon('coin', '#e0b040', 18)}${n}`;
const itemIcon = (key: string, size = 36) => { const it = ITEMS[splitKey(key)[0]]; return it ? icon(it.icon, it.color, size) : ''; };
const qTag = (q: number, goods = false) => (q === 1 ? '' : `<span class="tag q${q}">${goods ? GOODS_QUALITY[q] : QUALITY_NAMES[q]}</span>`);
const keyTag = (key: string) => { const [id, q] = splitKey(key); const c = ITEMS[id]?.cat; return c === 'hide' || c === 'goods' ? qTag(q, c === 'goods') : ''; };
const _v = new THREE.Vector3();

export class UI {
  root = document.getElementById('ui')!;
  isOpen = false;
  private hud: HTMLElement; private panel: HTMLElement | null = null; private kind: PanelKind | null = null;
  private tab = ''; private sel = ''; private fadeEl: HTMLElement; private promptEl: HTMLElement; private hintEl: HTMLElement; private bannerEl: HTMLElement;
  private toastsEl: HTMLElement; private dmgEl: HTMLElement; private bossEl: HTMLElement; private bossAnimal: Animal | null = null;
  private mini: CanvasRenderingContext2D; private comp: CanvasRenderingContext2D; private cross: CanvasRenderingContext2D;
  private cache: Record<string, string | number> = {};
  private hintT = 0; private focusIdx = -1; private promptKey = ''; private onClose: (() => void) | null = null;
  private els: Record<string, HTMLElement> = {};

  constructor() {
    this.hud = $(`<div id="hud" class="off">
      <div id="vig"></div><div id="lowhp"></div><div id="hurt"></div>
      <div id="objective" class="hud-box"><span></span></div>
      <div id="compass" class="hud-box"><canvas width="840" height="68"></canvas></div>
      <div id="eye" class="hud-box"><span></span><div class="fill"><i></i></div></div>
      <div id="boss" class="hidden"><h3 class="cz"></h3><div class="bar"><i></i></div></div>
      <div id="mini"><canvas width="328" height="328"></canvas><div id="clock" class="hud-box"></div></div>
      <div id="status" class="hud-box"><div id="rank">1<small>Greenhorn</small></div><div class="bars">
        <div class="statline"><span id="hpt"></span><span class="wt" id="wt"></span><span class="coin" id="gold"></span></div>
        <div class="bar hp"><i></i></div><div class="bar st"><i></i></div><div class="bar xp"><i></i></div></div></div>
      <div id="weapons" class="hud-box"></div>
      <canvas id="cross" width="160" height="160"></canvas><div id="hitm"></div>
      <div id="clicker" class="hud-box hidden">Click to look around</div>
      <div id="prompt" class="hud-box hidden"></div><div id="toasts"></div><div id="hint" class="hud-box off"></div>
      <div id="dmg"></div><div id="banner"><h1></h1><div class="rule"></div><p></p></div></div>`);
    this.root.append(this.hud);
    this.fadeEl = $('<div id="fade"><div><h2 class="cz"></h2><p></p></div></div>');
    this.root.append(this.fadeEl);
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    this.promptEl = q('#prompt'); this.hintEl = q('#hint'); this.bannerEl = q('#banner'); this.toastsEl = q('#toasts'); this.dmgEl = q('#dmg'); this.bossEl = q('#boss');
    for (const id of ['clicker', 'objective', 'eye', 'rank', 'hpt', 'gold', 'wt', 'weapons', 'clock', 'lowhp', 'hurt', 'hitm', 'cross']) this.els[id] = q('#' + id);
    this.mini = (q('#mini canvas') as HTMLCanvasElement).getContext('2d')!;
    this.comp = (q('#compass canvas') as HTMLCanvasElement).getContext('2d')!;
    this.cross = (q('#cross') as HTMLCanvasElement).getContext('2d')!;
    this.root.addEventListener('mouseover', (e) => { const b = (e.target as HTMLElement).closest?.('button'); if (b && !(b as HTMLButtonElement).disabled && b !== this.lastHover) { this.lastHover = b; audio.play('ui_move', { volume: 0.25 }); } });
  }
  private lastHover: Element | null = null;

  showHud(on: boolean) { this.hud.classList.toggle('off', !on); }

  // ---------- transient feedback ----------
  toast(text: string, kind: 'item' | 'good' | 'warn' | 'rare' = 'item', ic?: string) {
    const it = ic ? ITEMS[ic] : null;
    const svg = it ? icon(it.icon, it.color, 26) : ic ? icon(ic, kind === 'warn' ? '#e07060' : '#e0b040', 26) : '';
    const el = $(`<div class="toast hud-box ${kind}">${svg}<span>${text}</span></div>`);
    this.toastsEl.prepend(el);
    while (this.toastsEl.children.length > 6) this.toastsEl.lastElementChild!.remove();
    setTimeout(() => el.remove(), 3900);
  }
  hint(html: string, seconds = 8) { this.hintEl.innerHTML = html; this.hintEl.classList.remove('off'); this.hintT = seconds; }
  banner(title: string, sub: string, kind: 'zone' | 'level' | 'legend') {
    this.bannerEl.className = '';
    void this.bannerEl.offsetWidth;
    this.bannerEl.querySelector('h1')!.textContent = title;
    this.bannerEl.querySelector('p')!.textContent = sub;
    this.bannerEl.className = 'go ' + kind;
  }
  hurtFlash() { const h = this.els.hurt; h.classList.add('go'); requestAnimationFrame(() => requestAnimationFrame(() => h.classList.remove('go'))); }
  hitMarker(kind: 'hit' | 'crit' | 'kill') {
    const h = this.els.hitm;
    h.style.color = kind === 'kill' ? '#ff5a40' : kind === 'crit' ? '#ffd04a' : '#fff';
    h.classList.remove('go'); void h.offsetWidth; h.classList.add('go');
  }
  damage(p: THREE.Vector3, n: number, crit: boolean, label: string) {
    _v.copy(p).project(G.camera);
    if (_v.z > 1) return;
    const el = $(`<div class="dn ${crit ? 'crit' : ''}">${label ? `<small>${label}</small>` : ''}${n}</div>`);
    el.style.left = `${(_v.x * 0.5 + 0.5) * 100}%`; el.style.top = `${(-_v.y * 0.5 + 0.5) * 100 - 4}%`;
    this.dmgEl.append(el);
    setTimeout(() => el.remove(), 1000);
  }
  setPrompt(text: string | null, progress = -1, key = '', sub = '') {
    const k = text === null ? '' : `${text}|${key}|${sub}|${progress >= 0 ? 'p' : ''}`;
    if (k !== this.promptKey) {
      this.promptKey = k;
      this.promptEl.classList.toggle('hidden', text === null);
      if (text !== null) this.promptEl.innerHTML = `${key ? `<span class="k">${usingPad && key === 'E' ? 'X' : key}</span>` : icon('knife', '#c8d0d8', 28)}<span>${sub ? `<small>${sub}</small>` : ''}${text}</span>${progress >= 0 ? '<div class="pb"><i></i></div>' : ''}`;
    }
    if (progress >= 0) { const i = this.promptEl.querySelector('.pb i') as HTMLElement | null; if (i) i.style.width = `${progress * 100}%`; }
  }
  boss(a: Animal | null) {
    this.bossAnimal = a;
    this.bossEl.classList.toggle('hidden', !a);
    if (a) this.bossEl.querySelector('h3')!.textContent = a.def.name;
  }
  fade(on: boolean, dur: number, title = '', sub = ''): Promise<void> {
    const f = this.fadeEl;
    f.querySelector('h2')!.textContent = title; f.querySelector('p')!.textContent = sub;
    f.classList.toggle('on', on);
    f.style.transition = `opacity ${dur}s`;
    f.style.opacity = on ? '1' : '0';
    return new Promise((r) => setTimeout(r, dur * 1000 + 30));
  }

  // ---------- HUD ----------
  private set(key: string, val: string | number, fn: (v: string) => void) { if (this.cache[key] !== val) { this.cache[key] = val; fn(String(val)); } }
  update(dt: number) {
    const p = G.player, e = this.els;
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hintEl.classList.add('off'); }
    this.set('lock', locked || usingPad || this.isOpen || p.frozen ? 0 : 1, (v) => e.clicker.classList.toggle('hidden', v === '0'));
    const hp = Math.ceil(S.hp), mh = maxHp();
    this.set('hp', `${hp}/${mh}`, (v) => { e.hpt.textContent = `♥ ${v}`; (this.hud.querySelector('.bar.hp i') as HTMLElement).style.width = `${(hp / mh) * 100}%`; });
    this.set('st', Math.round((p.stamina / maxStamina()) * 50), (v) => { (this.hud.querySelector('.bar.st i') as HTMLElement).style.width = `${+v * 2}%`; });
    const need = xpForLevel(S.level);
    this.set('xp', `${S.level}:${S.xp}`, () => {
      (this.hud.querySelector('.bar.xp i') as HTMLElement).style.width = S.level >= MAX_LEVEL ? '100%' : `${(S.xp / need) * 100}%`;
      e.rank.innerHTML = `${S.level}<small>${RANK_TITLES[S.level]}</small>`;
    });
    this.set('gold', S.gold, (v) => { e.gold.innerHTML = coin(+v); });
    const w = totalWeight(), cap = capacity();
    this.set('wt', `${w}/${cap}`, (v) => { e.wt.textContent = w > cap * 0.7 ? `Pack ${v}` : ''; e.wt.classList.toggle('over', w > cap); });
    this.set('obj', G.game.objective() + (S.perkPoints ? `|${S.perkPoints}` : ''), () => { e.objective.querySelector('span')!.innerHTML = G.game.objective() + (S.perkPoints ? `<br><span style="color:#ffe070">★ Skill point ready — Tab</span>` : ''); });
    this.set('clock', `${Math.floor(S.time * 6)}|${G.env.night > 0.5}`, () => { e.clock.innerHTML = `${icon(G.env.night > 0.5 ? 'moon' : 'sun', '#ffd866', 18)} ${fmtTime(S.time)}`; });
    e.lowhp.style.opacity = String(hp < mh * 0.3 ? 0.5 + Math.sin(G.time * 5) * 0.3 : 0);
    // weapons
    const act = activeWeapon();
    const wkey = S.slots.map((id, i) => `${id}:${id ? count(WEAPONS[id].ammo) : 0}:${i === S.active}`).join('|') + (act?.kind === 'crossbow' ? (p.loaded ? 'L' : 'U') : '');
    this.set('weap', wkey, () => {
      e.weapons.innerHTML = S.slots.map((id, i) => {
        if (!id) return `<div class="wslot empty"><span class="key">${i + 1}</span>${icon(['bow', 'crossbow', 'knife'][i], '#888', 44)}</div>`;
        const wd = WEAPONS[id], n = count(wd.ammo);
        return `<div class="wslot ${i === S.active ? 'on' : ''}"><span class="key">${i + 1}</span>${icon(wd.kind === 'bow' ? 'bow' : wd.kind === 'crossbow' ? 'crossbow' : ITEMS[wd.ammo].icon, wd.color, 48)}<span class="ammo ${n <= 3 ? 'low' : ''}">${n}</span>${wd.kind === 'crossbow' && i === S.active ? '<div class="rl"><i></i></div>' : ''}</div>`;
      }).join('');
    });
    if (act?.kind === 'crossbow') { const rl = e.weapons.querySelector('.rl i') as HTMLElement | null; if (rl) rl.style.width = p.loaded ? '100%' : p.reload > 0 ? `${(1 - p.reload / (act.time + 0.35)) * 100}%` : '0%'; }
    // crosshair
    const showCross = p.aiming && !this.isOpen;
    e.cross.classList.toggle('on', showCross);
    if (showCross) {
      const c = this.cross;
      c.clearRect(0, 0, 160, 160);
      c.lineCap = 'round';
      const gap = 10 + (act?.kind === 'bow' ? (1 - p.draw) * 26 : 6) + p.sway * 20;
      c.strokeStyle = '#000a'; c.lineWidth = 7;
      const seg = () => { for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; c.beginPath(); c.moveTo(80 + Math.cos(a) * gap, 80 + Math.sin(a) * gap); c.lineTo(80 + Math.cos(a) * (gap + 12), 80 + Math.sin(a) * (gap + 12)); c.stroke(); } };
      seg(); c.strokeStyle = p.draw >= 1 || act?.kind !== 'bow' ? '#ffe070' : '#fff'; c.lineWidth = 3.5; seg();
      c.fillStyle = '#000a'; c.beginPath(); c.arc(80, 80, 4, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(80, 80, 2.2, 0, 7); c.fill();
      if (act?.kind === 'bow' && p.draw > 0) { c.strokeStyle = '#ffe070'; c.lineWidth = 4; c.beginPath(); c.arc(80, 80, 58, Math.PI * 0.5 - p.draw * Math.PI * 0.45, Math.PI * 0.5 + p.draw * Math.PI * 0.45); c.stroke(); }
    }
    // awareness eye
    const aw = G.animals.awareness();
    e.eye.style.opacity = aw.level > 0.04 || aw.hunted ? '1' : '0';
    this.set('eye', `${Math.round(aw.level * 20)}${aw.hunted}`, () => {
      const hot = aw.hunted || aw.level >= 1;
      e.eye.classList.toggle('hot', hot);
      e.eye.querySelector('span')!.innerHTML = icon(aw.level > 0.5 || aw.hunted ? 'eye' : 'eye_closed', hot ? '#ff5a40' : '#ffe070', 26);
      (e.eye.querySelector('.fill i') as HTMLElement).style.width = `${Math.min(1, aw.level) * 100}%`;
    });
    if (this.bossAnimal) (this.bossEl.querySelector('.bar i') as HTMLElement).style.width = `${clamp(this.bossAnimal.hp / this.bossAnimal.def.hp, 0, 1) * 100}%`;
    this.drawCompass();
    this.drawMini(this.mini, 328, 62, true);
  }

  private drawCompass() {
    const c = this.comp, W = 840, H = 68, p = G.player, t = G.zone.terrain;
    c.clearRect(0, 0, W, H);
    const heading = -p.camYaw; // clockwise from north
    const span = 1.9; // radians visible
    const put = (bearing: number, draw: (x: number, a: number) => void) => {
      let d = (bearing - heading) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < span / 2) draw(W / 2 + (d / (span / 2)) * (W / 2 - 30), 1 - Math.abs(d) / (span / 2) * 0.6);
    };
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 24; i++) {
      put((i / 24) * Math.PI * 2, (x, a) => {
        c.globalAlpha = a;
        if (i % 6 === 0) { c.fillStyle = i === 0 ? '#ff8a70' : '#ffe9a0'; c.font = "900 36px 'Cinzel'"; c.fillText('NESW'[i / 6], x, 36); }
        else { c.fillStyle = '#f6ead0'; c.fillRect(x - 1.5, i % 3 === 0 ? 20 : 27, 3, i % 3 === 0 ? 28 : 14); }
      });
    }
    const mark = (wx: number, wz: number, col: string, shape: 'home' | 'dot' | 'skull') => put(Math.atan2(wx - p.pos.x, -(wz - p.pos.z)), (x) => {
      c.globalAlpha = 1; c.fillStyle = col; c.strokeStyle = '#2a1c10'; c.lineWidth = 3;
      c.beginPath();
      if (shape === 'home') { c.moveTo(x, 4); c.lineTo(x + 13, 16); c.lineTo(x + 9, 16); c.lineTo(x + 9, 26); c.lineTo(x - 9, 26); c.lineTo(x - 9, 16); c.lineTo(x - 13, 16); c.closePath(); }
      else if (shape === 'skull') { c.moveTo(x, 4); c.lineTo(x + 11, 15); c.lineTo(x, 26); c.lineTo(x - 11, 15); c.closePath(); }
      else c.arc(x, 15, 8, 0, 7);
      c.fill(); c.stroke();
    });
    mark(t.town.x, t.town.z, '#ffe070', 'home');
    for (const a of G.animals.list) if (!a.alive && !a.skinned) mark(a.pos.x, a.pos.z, '#ff8a70', 'dot');
    if (!S.legends.includes(G.zone.def.legendary) && S.level >= G.zone.def.rank + 2) mark(t.lair.x, t.lair.z, '#d070ff', 'skull');
    c.globalAlpha = 1; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(W / 2 - 9, 0); c.lineTo(W / 2 + 9, 0); c.lineTo(W / 2, 12); c.fill();
  }

  private drawMini(c: CanvasRenderingContext2D, size: number, radius: number, follow: boolean) {
    const t = G.zone.terrain, p = G.player, map = t.mapCanvas;
    const ppm = map.width / MAP_SPAN; // map px per metre
    c.save();
    c.clearRect(0, 0, size, size);
    const scale = follow ? size / (radius * 2) : size / MAP_SPAN;
    const cx = follow ? p.pos.x : 0, cz = follow ? p.pos.z : 0;
    c.imageSmoothingEnabled = true;
    const sw = (size / scale) * ppm;
    c.drawImage(map, (cx + MAP_SPAN / 2) * ppm - sw / 2, (cz + MAP_SPAN / 2) * ppm - sw / 2, sw, sw, 0, 0, size, size);
    const X = (wx: number) => size / 2 + (wx - cx) * scale, Y = (wz: number) => size / 2 + (wz - cz) * scale;
    const dot = (wx: number, wz: number, r: number, col: string, stroke = '#2a1c10') => {
      let x = X(wx), y = Y(wz);
      if (follow) { const dx = x - size / 2, dy = y - size / 2, d = Math.hypot(dx, dy), m = size / 2 - 12; if (d > m) { x = size / 2 + (dx / d) * m; y = size / 2 + (dy / d) * m; } }
      c.fillStyle = col; c.strokeStyle = stroke; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke();
    };
    // roads
    c.strokeStyle = '#f6e2b088'; c.lineWidth = follow ? 5 : 3; c.lineCap = 'round'; c.setLineDash([2, 9]);
    for (const road of t.roads) { c.beginPath(); road.forEach((pt, i) => (i ? c.lineTo(X(pt[0]), Y(pt[1])) : c.moveTo(X(pt[0]), Y(pt[1])))); c.stroke(); }
    c.setLineDash([]);
    for (const cp of t.camps) dot(cp.x, cp.z, follow ? 8 : 6, '#ff9a40');
    dot(t.town.x, t.town.z, follow ? 13 : 9, '#ffe070');
    for (const a of G.animals.list) {
      if (!a.alive && !a.skinned) dot(a.pos.x, a.pos.z, follow ? 7 : 5, '#ff8a70');
      else if (a.alive && a.engaged && follow) dot(a.pos.x, a.pos.z, 7, '#e02818');
    }
    if (!S.legends.includes(G.zone.def.legendary) && (S.level >= G.zone.def.rank + 2 || !follow)) dot(t.lair.x, t.lair.z, follow ? 10 : 8, '#d070ff');
    // player arrow
    c.translate(X(p.pos.x), Y(p.pos.z));
    c.rotate(-p.camYaw);
    c.fillStyle = '#fff'; c.strokeStyle = '#2a1c10'; c.lineWidth = 3;
    const s = follow ? 1.5 : 1;
    c.beginPath(); c.moveTo(0, -11 * s); c.lineTo(8 * s, 9 * s); c.lineTo(0, 4 * s); c.lineTo(-8 * s, 9 * s); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }

  // ---------- panels ----------
  private mg: Minigame | null = null;
  get miniActive() { return !!this.mg; }
  /** Run a bench minigame with the camera circling the hunter at work. */
  startMini(o: MiniOpts, anim: 'Working_A' | 'Hammering') {
    this.close(true);
    this.kind = 'mini'; this.isOpen = true;
    G.player.frozen = true;
    G.game.benchScene(true, anim);
    this.showHud(false);
    const done = o.onDone;
    this.mg = new Minigame({ ...o, onDone: (score) => {
      this.mg?.destroy(); this.mg = null; this.panel = null; this.kind = null; this.isOpen = false;
      G.game.benchScene(false);
      this.showHud(true);
      done(score);
    } });
    this.panel = this.mg.el;
    this.root.append(this.mg.el);
  }
  tick(dt: number) { this.mg?.tick(dt, input.uiAccept() || input.keyHit('Space') || input.keyHit('KeyE')); }
  open(kind: PanelKind, tab = '') {
    this.close(true);
    this.kind = kind; this.isOpen = true; this.onClose = null;
    this.tab = tab; this.sel = ''; this.focusIdx = -1;
    G.player.frozen = true;
    unlockPointer();
    this.render();
  }
  close(silent = false) {
    if (!this.panel || this.mg) return;
    this.panel.remove(); this.panel = null; this.kind = null; this.isOpen = false;
    if (G.player) G.player.frozen = false;
    if (!silent) { audio.play('ui_close'); if (G.game.playing) lockPointer(); }
    const cb = this.onClose; this.onClose = null;
    if (!silent) cb?.();
  }
  refresh() { if (this.kind) this.render(); }

  private frame(title: string, tabs: string[], small = false): { win: HTMLElement; body: HTMLElement } {
    const scroll = this.panel?.querySelector('.col')?.scrollTop ?? 0;
    this.panel?.remove();
    if (tabs.length && !tabs.includes(this.tab)) this.tab = tabs[0];
    this.panel = $(`<div id="panel"><div class="win ${small ? 'small' : ''}"><header><h2>${title}</h2><span class="gold">${coin(S.gold)}</span><button class="btn x alt" data-close>✕</button></header>
      ${tabs.length ? `<div class="tabs">${tabs.map((t) => `<button class="tab ${t === this.tab ? 'on' : ''}" data-tab="${t}">${t}</button>`).join('')}</div>` : ''}<div class="body"></div></div></div>`);
    this.root.append(this.panel);
    this.panel.querySelector('[data-close]')!.addEventListener('click', () => this.back());
    this.panel.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = (b as HTMLElement).dataset.tab!; this.sel = ''; audio.play('ui_page'); this.render(); }));
    this.panel.addEventListener('mousedown', (e) => { if (e.target === this.panel) this.back(); });
    requestAnimationFrame(() => { const c = this.panel?.querySelector('.col'); if (c) c.scrollTop = scroll; });
    return { win: this.panel.firstElementChild as HTMLElement, body: this.panel.querySelector('.body') as HTMLElement };
  }
  private back() {
    if (this.kind === 'options' || this.kind === 'controls') { if (G.game.playing) this.open('pause'); else { this.close(true); this.titleMenu(); } audio.play('ui_back'); return; }
    this.close();
  }
  private btn(label: string, fn: () => void, cls = '', disabled = false): HTMLButtonElement {
    const b = $(`<button class="btn ${cls}" ${disabled ? 'disabled' : ''}>${label}</button>`) as HTMLButtonElement;
    b.addEventListener('click', () => { audio.play('ui_select', { volume: 0.5 }); fn(); });
    return b;
  }
  private rowEl(ic: string, name: string, sub: string, right: string, buttons: HTMLElement[]): HTMLElement {
    const r = $(`<div class="row"><div class="ic">${ic}</div><div class="nm">${name}<small>${sub}</small></div><div class="pr">${right}</div></div>`);
    r.append(...buttons);
    return r;
  }

  private render() {
    switch (this.kind) {
      case 'merchant': return this.renderMerchant();
      case 'fletcher': return this.renderFletcher();
      case 'tanner': return this.renderTanner();
      case 'inn': return this.renderInn();
      case 'board': return this.renderBoard();
      case 'wagon': return this.renderWagon();
      case 'campfire': return this.renderCamp();
      case 'bedroll': return this.renderBedroll();
      case 'journal': return this.renderJournal();
      case 'pause': return this.renderPause();
      case 'options': return this.renderOptions();
      case 'controls': return this.renderControls();
    }
  }
  private npcName(kind: StationKind) { return G.zone.stations.find((s) => s.kind === kind)?.name ?? ''; }

  private renderMerchant() {
    const { body } = this.frame(this.npcName('merchant'), ['Sell', 'Buy']);
    const col = $('<div class="col"></div>');
    body.append(col);
    const bias = ZONES[S.zone].priceBias;
    if (this.tab === 'Sell') {
      const keys = Object.keys(S.inv).filter((k) => { const c = ITEMS[splitKey(k)[0]]?.cat; return c && c !== 'ammo' && c !== 'supply'; });
      const order = ['goods', 'leather', 'fur', 'hide', 'trophy', 'meat'];
      keys.sort((a, b) => order.indexOf(ITEMS[splitKey(a)[0]].cat) - order.indexOf(ITEMS[splitKey(b)[0]].cat) || sellValue(b, S.zone) - sellValue(a, S.zone));
      const goods = keys.filter((k) => ITEMS[splitKey(k)[0]].cat === 'goods');
      const top = $(`<div class="row" style="background:none"><div class="nm"><small>${Object.entries(bias).filter(([, v]) => v !== 1).map(([k, v]) => `${k} ${v > 1 ? '▲' : '▼'}${Math.round(Math.abs(v - 1) * 100)}%`).join(' · ') || 'Fair prices'}</small></div></div>`);
      top.append(this.btn(`Sell all goods (${coin(goods.reduce((s, k) => s + sellValue(k, S.zone) * count(k), 0))})`, () => { goods.forEach((k) => G.game.sell(k, count(k))); this.render(); }, '', !goods.length));
      col.append(top);
      if (!keys.length) col.append($('<p class="muted">Nothing to sell.</p>'));
      for (const k of keys) {
        const [id] = splitKey(k), it = ITEMS[id], n = count(k), v = sellValue(k, S.zone);
        const b = bias[it.cat] ?? 1;
        const tag = it.cat === 'hide' ? '<span class="tag down">raw</span>' : b > 1.05 ? '<span class="tag up">in demand</span>' : b < 0.95 ? '<span class="tag down">glut</span>' : '';
        col.append(this.rowEl(itemIcon(k), `${it.name} ${keyTag(k)} ${tag}`, `×${n}`, coin(v), [
          this.btn('Sell 1', () => { G.game.sell(k, 1); this.render(); }, 'alt'), this.btn(`All`, () => { G.game.sell(k, n); this.render(); }, '', n < 2)]));
      }
    } else {
      for (const id of G.game.shopStock('merchant')) {
        const it = ITEMS[id], pr = buyPrice(id);
        col.append(this.rowEl(itemIcon(id), it.name, `${it.desc} · have ${count(id)}`, coin(pr), [
          this.btn('Buy 1', () => { G.game.buy(id, 1); this.render(); }, 'alt', S.gold < pr), this.btn('Buy 5', () => { G.game.buy(id, 5); this.render(); }, '', S.gold < pr * 5)]));
      }
    }
  }

  private weaponStats(w: WeaponDef) {
    const cur = WEAPONS[S.slots[w.kind === 'bow' ? 0 : w.kind === 'crossbow' ? 1 : 2]];
    const d = cur && cur !== w ? w.damage - cur.damage : 0;
    return `Damage ${w.damage}${d ? ` <span style="color:${d > 0 ? '#3a8a2a' : '#b03020'}">(${d > 0 ? '+' : ''}${d})</span>` : ''} · ${w.kind === 'bow' ? 'draw' : w.kind === 'crossbow' ? 'reload' : 'throw'} ${w.time}s`;
  }
  private renderFletcher() {
    const { body } = this.frame(this.npcName('fletcher'), []);
    const col = $('<div class="col"></div>');
    body.append(col);
    const stock = G.game.weaponStock().filter((id) => !S.weapons.includes(id));
    if (stock.length) col.append($('<h3 class="sec">Weapons</h3>'));
    for (const id of stock) {
      const w = WEAPONS[id];
      col.append(this.rowEl(icon(w.kind === 'bow' ? 'bow' : 'crossbow', w.color, 38), w.name, this.weaponStats(w), coin(w.price), [this.btn('Buy', () => { G.game.buyWeapon(id); this.render(); }, '', S.gold < w.price)]));
    }
    col.append($(`<h3 class="sec">Ammunition <span class="muted" style="float:right;letter-spacing:0;text-transform:none">quiver holds ${ammoCap()}</span></h3>`));
    for (const id of G.game.shopStock('fletcher')) {
      const it = ITEMS[id], pr = buyPrice(id), quiver = id === 'arrow' || id === 'bolt';
      const full = quiver && count(id) >= ammoCap();
      col.append(this.rowEl(itemIcon(id), it.name, `have ${count(id)}${quiver ? ` / ${ammoCap()}` : ''}`, coin(pr), [
        this.btn('Buy 1', () => { G.game.buy(id, 1); this.render(); }, 'alt', S.gold < pr || full), this.btn('Buy 10', () => { G.game.buy(id, 10); this.render(); }, '', S.gold < pr * 2 || full)]));
    }
  }

  private grid: string[] = Array<string>(9).fill('');
  private hand = '';
  private recipeSel: RecipeDef | null = null;
  private renderTanner() {
    const { body } = this.frame('Tanning Bench', ['Tan', 'Craft']);
    if (this.tab === 'Tan') {
      const col = $('<div class="col"></div>');
      body.append(col);
      const keys = Object.keys(S.inv).filter((k) => TANNING[splitKey(k)[0]]);
      col.append($(`<div class="row" style="background:none"><div class="nm"><small>${itemIcon('salt', 20)} Salts ${count('salt')} &nbsp; ${itemIcon('bark', 20)} Bark liquor ${count('bark')} (+1 leather) &nbsp;·&nbsp; time the scraping well for a bonus</small></div></div>`));
      if (!keys.length) col.append($('<p class="muted">No hides to tan.</p>'));
      for (const k of keys) {
        const [id, q] = splitKey(k), it = ITEMS[id], rule = TANNING[id], n = count(k);
        const out = Math.max(1, rule[1] + (q === 2 ? 1 : q === 0 ? -1 : 0));
        const go = (agent: 'salt' | 'bark') => this.startMini({ title: `Scraping the ${it.name.toLowerCase()}`, kind: 'scrape', strokes: 4, speed: 0.55 + (q === 2 ? 0.08 : 0), color: ITEMS[rule[0]].color,
          onDone: (score) => { G.game.tan(k, 1, score, agent); this.open('tanner', 'Tan'); } }, 'Working_A');
        col.append(this.rowEl(itemIcon(k), `${it.name} ${qTag(q)}`, `×${n} → ${itemIcon(rule[0], 18)} ${out}+`, '', [
          this.btn('Tan', () => go('salt'), '', !count('salt')), this.btn('Bark tan', () => go('bark'), 'alt', !count('bark')),
          this.btn(`Quick ×${Math.min(n, count('salt'))}`, () => { G.game.tan(k, n); this.render(); }, 'alt', !count('salt'))]));
      }
      return;
    }
    // ----- Craft: recipe book | 3x3 bench | materials -----
    body.classList.add('bench');
    const book = $('<div class="col book"></div>'), mid = $('<div class="benchmid"></div>');
    body.append(book, mid);
    let last = '';
    for (const r of RECIPES) {
      if (r.rank > S.level + 2) continue;
      if (r.section !== last) { last = r.section; book.append($(`<h3 class="sec">${r.section}</h3>`)); }
      const owned = (r.out.gear && G.game.ownsGear(r.out.gear)) || (r.out.weapon && S.weapons.includes(r.out.weapon));
      const locked = S.level < r.rank, can = G.game.canCraft(r);
      const ic = r.out.item ? itemIcon(r.out.item, 30) : r.out.gear ? icon(GEAR[r.out.gear].icon, GEAR[r.out.gear].color, 30) : icon(WEAPONS[r.out.weapon!].kind === 'bow' ? 'bow' : 'crossbow', WEAPONS[r.out.weapon!].color, 30);
      const b = $(`<button class="rec ${this.recipeSel === r ? 'sel' : ''} ${can ? 'can' : ''} ${owned || locked ? 'dim' : ''}">${ic}<span>${r.name}</span><em>${owned ? '✓' : locked ? `Rank ${r.rank}` : can ? '●' : ''}</em></button>`);
      b.addEventListener('click', () => { this.recipeSel = r; this.grid = patternCells(r.pattern); audio.play('ui_page'); this.render(); });
      book.append(b);
    }
    const match = RECIPES.find((r) => r.key === gridKey(this.grid)) ?? null;
    const used: Record<string, number> = {};
    const gridEl = $('<div class="cgrid"></div>');
    this.grid.forEach((id, i) => {
      if (id) used[id] = (used[id] ?? 0) + 1;
      const lack = id && used[id] > count(id);
      const c = $(`<button class="cell ${lack ? 'lack' : ''}">${id ? itemIcon(id, 44) : ''}</button>`);
      c.addEventListener('click', () => { this.grid[i] = this.grid[i] === this.hand || !this.hand ? '' : this.hand; this.recipeSel = null; audio.play('ui_move'); this.render(); });
      c.addEventListener('contextmenu', (e) => { e.preventDefault(); this.grid[i] = ''; this.render(); });
      gridEl.append(c);
    });
    const outEl = $('<div class="cout"></div>');
    if (match) {
      const o = match.out, ic = o.item ? itemIcon(o.item, 60) : o.gear ? icon(GEAR[o.gear].icon, GEAR[o.gear].color, 60) : icon(WEAPONS[o.weapon!].kind === 'bow' ? 'bow' : 'crossbow', WEAPONS[o.weapon!].color, 60);
      const desc = o.item ? `Sells for ${coin(sellValue(o.item + ':1', S.zone))}` : o.gear ? GEAR[o.gear].desc : this.weaponStats(WEAPONS[o.weapon!]);
      const why = S.level < match.rank ? `Needs Rank ${match.rank}` : (o.gear && G.game.ownsGear(o.gear)) || (o.weapon && S.weapons.includes(o.weapon)) ? 'Already owned' : !G.game.canCraft(match) ? 'Missing materials' : '';
      outEl.innerHTML = `<div class="cell big">${ic}</div><b>${match.name}</b><small>${why ? `<span style="color:#b03020">${why}</span>` : desc}</small>`;
      const r = match;
      outEl.append(this.btn('Craft', () => this.startMini({ title: `Stitching the ${r.name.toLowerCase()}`, kind: 'stitch', strokes: 4, speed: 0.6 + r.rank * 0.02, color: ITEMS[r.needs[0][0]].color,
        onDone: (score) => { G.game.craft(r, score); this.open('tanner', 'Craft'); } }, 'Hammering'), '', !G.game.canCraft(r)));
    } else outEl.innerHTML = `<div class="cell big"></div><small class="muted">${this.grid.some(Boolean) ? 'No such pattern' : 'Pick a recipe, or lay out materials'}</small>`;
    const bench = $('<div class="cbench"></div>');
    bench.append(gridEl, $('<div class="carrow">➜</div>'), outEl);
    const pal = $('<div class="cpal"></div>');
    const mats = ['leather_light', 'leather_sturdy', 'leather_heavy', 'fur_soft', 'fur_thick', 'thread', 'rivets', 'sinew', 'antler', 'fang', 'horn', 'antler_monarch', 'horn_ironhorn'].filter((id) => count(id) > 0);
    if (!mats.includes(this.hand)) this.hand = '';
    for (const id of mats) {
      const left = count(id) - (used[id] ?? 0);
      const c = $(`<button class="cell ${this.hand === id ? 'sel' : ''}" title="${ITEMS[id].name}">${itemIcon(id, 40)}<span class="n">${left}</span></button>`);
      c.addEventListener('click', () => { this.hand = this.hand === id ? '' : id; audio.play('ui_move'); this.render(); });
      pal.append(c);
    }
    if (!mats.length) pal.append($('<small class="muted">No materials yet — tan some hides, buy thread from the merchant.</small>'));
    pal.append(this.btn('Clear', () => { this.grid.fill(''); this.recipeSel = null; this.render(); }, 'alt x', !this.grid.some(Boolean)));
    mid.append(bench, pal);
  }

  private renderInn() {
    const { body } = this.frame(this.npcName('inn'), [], true);
    const zi = zoneIndex(S.zone), cost = 4 + zi * 6;
    const leg = SPECIES[G.zone.def.legendary];
    const rumour = !S.legends.includes(leg.id) && Math.random() < 0.5 ? `They say ${leg.name} keeps to the far ${G.zone.terrain.lair.x < 0 ? 'north-west' : 'north-east'}, where the dead trees stand in a ring. ${leg.blurb}` : pick(TIPS);
    const st = $(`<div class="stack" style="flex:1"><div class="say"><b>${this.npcName('inn')}</b>${this.sel || `A bed is ${cost} coin. Sleeping heals you and saves the game.`}</div></div>`);
    st.append(this.btn(`Sleep until morning — ${coin(cost)}`, () => G.game.sleep(cost), '', S.gold < cost),
      this.btn('Hear a rumour', () => { this.sel = rumour; this.render(); }, 'alt'), this.btn('Save game', () => { G.game.save(); }, 'alt'), this.btn('Leave', () => this.close(), 'alt'));
    body.append(st);
  }
  private renderBedroll() {
    const { body } = this.frame('Bedroll', [], true);
    const st = $('<div class="stack" style="flex:1"><div class="say">Sleeping heals you and saves the game.</div></div>');
    st.append(this.btn('Rest until morning', () => G.game.sleep(0)), this.btn('Leave', () => this.close(), 'alt'));
    body.append(st);
  }
  private renderCamp() {
    const { body } = this.frame('Campfire', [], true);
    const n = count('meat');
    const st = $(`<div class="stack" style="flex:1"><div class="say">${n} game meat · each cut restores 14 health · ${Math.ceil(S.hp)} / ${maxHp()}</div></div>`);
    st.append(this.btn('Roast 1 cut', () => { G.game.cook(1); this.render(); }, '', !n || S.hp >= maxHp()),
      this.btn('Roast until healed', () => { G.game.cook(Math.ceil((maxHp() - S.hp) / 14)); this.render(); }, '', !n || S.hp >= maxHp()), this.btn('Leave', () => this.close(), 'alt'));
    body.append(st);
  }

  private renderBoard() {
    const { body } = this.frame('Notice Board', []);
    const col = $('<div class="col"></div>');
    body.append(col);
    const line = (c: (typeof S.contracts)[0]) => {
      const have = c.kind === 'hunt' ? c.have : countItem(c.item, c.minQ);
      return { ic: c.kind === 'hunt' ? icon('target', '#c8483a', 36) : itemIcon(c.item), name: c.text, sub: `${Math.min(have, c.qty)}/${c.qty}${c.zone !== S.zone ? ` · deliver in ${ZONES[c.zone].town}` : ''}`, right: `${coin(c.gold)}` };
    };
    if (S.contracts.length) col.append($('<h3 class="sec">Your contracts</h3>'));
    for (const c of S.contracts) {
      const l = line(c), ready = G.game.contractReady(c) && c.kind !== 'hunt' && c.zone === S.zone;
      col.append(this.rowEl(l.ic, l.name, l.sub, l.right, [this.btn('Deliver', () => { G.game.completeContract(c); this.render(); }, '', !ready), this.btn('Drop', () => { G.game.abandonContract(c); this.render(); }, 'red')]));
    }
    col.append($('<h3 class="sec">Notices</h3>'));
    const offers = S.board[S.zone] ?? [];
    if (!offers.length) col.append($('<p class="muted">Nothing new. Fresh notices go up each morning.</p>'));
    for (const c of offers) { const l = line(c); col.append(this.rowEl(l.ic, l.name, c.kind === 'hunt' ? 'pays on the last kill' : 'deliver here', l.right, [this.btn('Accept', () => { G.game.acceptContract(c); this.render(); })])); }
  }

  private renderWagon() {
    const { body } = this.frame(this.npcName('wagon'), [], false);
    const col = $('<div class="col"></div>');
    body.append(col);
        for (const id of ZONE_ORDER) {
      const z = ZONES[id], here = id === S.zone, locked = S.level < z.rank;
      const animals = z.spawns.map((s) => SPECIES[s[0]].name).join(', ');
      col.append(this.rowEl(icon(here ? 'map' : locked ? 'lock' : 'wagon', locked ? '#8a7a6a' : '#99643a', 38), `${z.name} <span class="tag">${z.town}</span>`, animals,
        here ? '<span class="tag up">you are here</span>' : locked ? `Rank ${z.rank}` : z.fare ? coin(z.fare) : 'Free', [this.btn('Travel', () => G.game.travel(id), '', here || locked || S.gold < z.fare)]));
    }
  }

  private renderJournal() {
    const { body } = this.frame('Journal', ['Pack', 'Skills', 'Map']);
    const col = $('<div class="col"></div>');
    body.append(col);
    if (this.tab === 'Pack') {
      const side = $('<div class="col side detail"></div>');
      // loadout strip: weapons (click to cycle) + worn gear
      const load = $('<div class="grid" style="margin-bottom:12px"></div>');
      (['bow', 'crossbow', 'thrown'] as const).forEach((kind, i) => {
        const owned = kind === 'thrown' ? Object.values(WEAPONS).filter((w) => w.kind === 'thrown' && count(w.ammo) > 0).map((w) => w.id) : S.weapons.filter((id) => WEAPONS[id].kind === kind);
        const cur = S.slots[i] ? WEAPONS[S.slots[i]] : null;
        const c = $(`<button class="cell load ${this.sel === 'w' + i ? 'sel' : ''}">${cur ? icon(kind === 'thrown' ? ITEMS[cur.ammo].icon : kind, cur.color, 46) : icon(kind === 'thrown' ? 'knife' : kind, '#bbb', 46)}<span class="n">${i + 1}</span></button>`);
        c.addEventListener('click', () => {
          if (this.sel === 'w' + i && owned.length > 1) G.game.equipWeapon(owned[(owned.indexOf(S.slots[i]) + 1) % owned.length]);
          this.sel = 'w' + i; audio.play('ui_move'); this.render();
        });
        load.append(c);
      });
      for (const slot of ['pack', 'quiver', 'armor', 'boots', 'bracer', 'knife'] as GearSlot[]) {
        const g = GEAR[S.gear[slot]];
        const c = $(`<button class="cell load ${this.sel === 'g' + slot ? 'sel' : ''} ${g.tier ? '' : 'dim'}">${icon(g.icon, g.color, 44)}</button>`);
        c.addEventListener('click', () => { this.sel = 'g' + slot; audio.play('ui_move'); this.render(); });
        load.append(c);
      }
      const grid = $('<div class="grid"></div>');
      const keys = Object.keys(S.inv);
      const order = ['goods', 'leather', 'fur', 'hide', 'trophy', 'meat', 'ammo', 'supply'];
      keys.sort((a, b) => order.indexOf(ITEMS[splitKey(a)[0]].cat) - order.indexOf(ITEMS[splitKey(b)[0]].cat));
      if (!this.sel) this.sel = keys[0] ?? '';
      for (const k of keys) {
        const [id, q] = splitKey(k), cat = ITEMS[id].cat;
        const c = $(`<button class="cell ${k === this.sel ? 'sel' : ''}">${itemIcon(k, 46)}${(cat === 'hide' || cat === 'goods') && q !== 1 ? `<i class="qp q${q}"></i>` : ''}<span class="n">${count(k)}</span></button>`);
        c.addEventListener('click', () => { this.sel = k; audio.play('ui_move'); this.render(); });
        grid.append(c);
      }
      col.append(load, $(`<h3 class="sec">Pack ${totalWeight()} / ${capacity()}</h3>`), grid);
      const sel = this.sel;
      if (sel[0] === 'w' && sel.length === 2) {
        const w = S.slots[+sel[1]] ? WEAPONS[S.slots[+sel[1]]] : null;
        side.innerHTML = w ? `<h3>${w.name}</h3><p>${this.weaponStats(w)}</p><p class="muted">${w.desc}</p><p class="muted">Click the slot again to swap weapons.</p>` : '<p class="muted">Empty slot. The fletcher sells weapons.</p>';
      } else if (sel[0] === 'g' && GEAR[S.gear[sel.slice(1) as GearSlot]]) {
        const g = GEAR[S.gear[sel.slice(1) as GearSlot]];
        side.innerHTML = `<h3>${g.name}</h3><p>${g.desc}</p><p class="muted">Craft upgrades at a tanning bench.</p>`;
      } else if (S.inv[sel]) {
        const [id] = splitKey(sel), it = ITEMS[id];
        side.innerHTML = `<div style="display:flex;gap:10px;align-items:center">${itemIcon(sel, 52)}<h3>${it.name}</h3></div><p>${keyTag(sel)}</p><p>${it.desc}</p>
          <div class="kv"><span>Carried</span><span>${count(sel)}</span></div><div class="kv"><span>Worth here</span><span>${coin(sellValue(sel, S.zone))}</span></div><p></p>`;
        if (id === 'tonic') side.append(this.btn('Drink', () => { G.game.useTonic(); this.render(); }, '', S.hp >= maxHp()));
        if (it.cat !== 'ammo') side.append(this.btn('Discard', () => { addItem(sel, -1); this.render(); }, 'red'));
      } else side.innerHTML = '<p class="muted">Your pack is empty.</p>';
      body.append(side);
    } else if (this.tab === 'Skills') {
      col.append($(`<h3 class="sec">${S.perkPoints} skill point${S.perkPoints === 1 ? '' : 's'} · Rank ${S.level} ${RANK_TITLES[S.level]}</h3>`));
      for (const p of PERKS) {
        const n = perk(p.id);
        const row = $(`<div class="perk"><div class="ic">${icon(p.icon, '#c79a3c', 36)}</div><div class="nm" style="flex:1"><b>${p.name}</b><br><span class="muted">${p.desc(Math.max(1, Math.min(p.max, n + (n < p.max ? 1 : 0))))}</span></div><div class="pips">${Array.from({ length: p.max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div></div>`);
        row.append(this.btn(n >= p.max ? 'Max' : 'Learn', () => { if (canBuyPerk(p.id)) { S.perks[p.id] = n + 1; S.perkPoints--; audio.play('quest'); this.render(); } }, '', !canBuyPerk(p.id)));
        col.append(row);
      }
    } else {
      col.style.display = 'flex'; col.style.gap = '18px';
      const wrap = $('<div class="mapwrap"><canvas width="940" height="940"></canvas></div>');
      col.append(wrap);
      this.drawMini((wrap.firstElementChild as HTMLCanvasElement).getContext('2d')!, 940, 0, false);
      const z = G.zone.def;
      const side = $(`<div class="detail" style="flex:1;overflow:auto"><h3>${z.name}</h3><p class="muted" style="margin:2px 0 8px">${G.game.objective()}</p></div>`);
      if (S.contracts.length) side.append($('<h3 class="sec">Contracts</h3>'));
      for (const c of S.contracts) { const have = c.kind === 'hunt' ? c.have : countItem(c.item, c.minQ); side.append($(`<div class="kv"><span>${c.text}</span><span>${Math.min(have, c.qty)}/${c.qty}</span></div>`)); }
      side.append($('<h3 class="sec">Game here</h3>'));
      for (const id of [...new Set(z.spawns.map((s) => s[0])), z.legendary]) { const sp = SPECIES[id]; side.append($(`<div class="kv"><span>${sp.legendary ? '★ ' : ''}${sp.name}</span><span>${S.kills[id] ?? 0} taken</span></div>`)); }
      side.append($('<h3 class="sec">Regions</h3>'));
      for (const id of ZONE_ORDER) side.append($(`<div class="kv"><span>${ZONES[id].name}</span><span>${S.level >= ZONES[id].rank ? (S.legends.includes(ZONES[id].legendary) ? '★' : 'open') : `Rank ${ZONES[id].rank}`}</span></div>`));
      col.append(side);
    }
  }

  private renderPause() {
    const { body } = this.frame('Paused', [], true);
    const st = $('<div class="stack" style="flex:1;align-items:center"></div>');
    st.append(this.btn('Resume', () => this.close(), 'big'), this.btn('Options', () => this.open('options'), 'big alt'), this.btn('Controls', () => this.open('controls'), 'big alt'),
      this.btn('Save & Quit to Title', () => { G.game.save(true); location.reload(); }, 'big red'));
    body.append(st);
  }
  private renderOptions() {
    const { body } = this.frame('Options', [], true);
    const col = $('<div class="col"></div>');
    const slider = (label: string, key: 'master' | 'music' | 'sfx' | 'sens', min: number, max: number) => {
      const r = $(`<div class="opt"><span>${label}</span><input type="range" min="${min}" max="${max}" step="0.05" value="${settings[key]}"></div>`);
      r.querySelector('input')!.addEventListener('input', (e) => { settings[key] = +(e.target as HTMLInputElement).value; audio.setVolumes(settings.master, settings.music, settings.sfx); saveSettings(); });
      return r;
    };
    const toggle = (label: string, get: () => string, fn: () => void) => { const r = $(`<div class="opt"><span>${label}</span></div>`); r.append(this.btn(get(), () => { fn(); saveSettings(); this.render(); }, 'alt')); return r; };
    col.append(slider('Master volume', 'master', 0, 1), slider('Music', 'music', 0, 1), slider('Sound effects', 'sfx', 0, 1), slider('Look sensitivity', 'sens', 0.3, 2.5),
      toggle('Invert vertical look', () => (settings.invertY ? 'On' : 'Off'), () => { settings.invertY = !settings.invertY; }),
      toggle('Screen shake', () => (settings.shake ? 'On' : 'Off'), () => { settings.shake = !settings.shake; }),
      toggle('Graphics quality', () => ['Low', 'Medium', 'High'][settings.quality], () => { settings.quality = (settings.quality + 1) % 3; G.game.applyQuality(); }),
      $('<p class="muted">Foliage density changes apply the next time a region loads.</p>'));
    body.append(col);
  }
  private renderControls() {
    const { body } = this.frame('Controls', [], true);
    const rows: [string, string, string][] = [['W A S D', 'Left stick', 'Move'], ['Mouse', 'Right stick', 'Look'], ['Shift', 'L3 / B', 'Sprint'], ['C', 'R3', 'Crouch / sneak'], ['Space', 'A', 'Jump'],
      ['Right mouse', 'LT', 'Aim'], ['Left mouse', 'RT', 'Draw & loose / fire / throw'], ['1 2 3 · wheel', 'LB / RB', 'Bow · crossbow · thrown'], ['R', '—', 'Span crossbow'], ['F', 'Y', 'Knife slash'], ['E', 'X', 'Interact / skin'], ['H', 'D-pad up', 'Drink tonic'], ['Tab', 'Back', 'Journal'], ['Esc', 'Start', 'Pause']];
    body.append($(`<div class="col"><div class="keys" style="grid-template-columns:auto auto 1fr"><b>Keyboard</b><b>Gamepad</b><b></b>${rows.map(([k, g, d]) => `<kbd>${k}</kbd><kbd>${g}</kbd><span>${d}</span>`).join('')}</div></div>`));
  }

  // ---------- menu navigation (keyboard / gamepad) ----------
  nav() {
    const rootEl = this.panel ?? this.titleEl ?? this.overlay;
    if (!rootEl || this.mg) return;
    const btns = [...rootEl.querySelectorAll('button:not(:disabled)')] as HTMLElement[];
    if (!btns.length) return;
    const dx = (input.uiRight() ? 1 : 0) - (input.uiLeft() ? 1 : 0), dy = (input.uiDown() ? 1 : 0) - (input.uiUp() ? 1 : 0);
    let cur = btns.findIndex((b) => b.classList.contains('focus'));
    if (dx || dy) {
      if (cur < 0) cur = 0;
      else {
        const r = btns[cur].getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let best = -1, bs = 1e9;
        btns.forEach((b, i) => {
          if (i === cur) return;
          const q = b.getBoundingClientRect(), ox = q.left + q.width / 2 - cx, oy = q.top + q.height / 2 - cy;
          const along = ox * dx + oy * dy, across = Math.abs(ox * dy) + Math.abs(oy * dx);
          if (along < 4) return;
          const score = along + across * 2.5;
          if (score < bs) { bs = score; best = i; }
        });
        if (best >= 0) cur = best;
      }
      btns.forEach((b, i) => b.classList.toggle('focus', i === cur));
      btns[cur].scrollIntoView({ block: 'nearest' });
      audio.play('ui_move', { volume: 0.3 });
    }
    if (input.uiAccept() && cur >= 0) btns[cur].click();
  }

  // ---------- title / file select / overlays ----------
  private titleEl: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private startCb: ((slot: number, save: Save | null, name: string) => void) | null = null;
  showLoading() {
    const el = $(`<div id="loading"><div><h1>HIDEBOUND</h1><div class="lb"><i></i></div><p>${pick(TIPS)}</p></div></div>`);
    this.root.append(el);
    return { progress: (f: number) => { (el.querySelector('i') as HTMLElement).style.width = `${f * 100}%`; }, done: () => el.remove() };
  }
  showTitle(onStart: (slot: number, save: Save | null, name: string) => void) {
    this.startCb = onStart;
    this.titleEl = $(`<div id="title"><div class="logo"><h1>HIDEBOUND</h1><p>A HUNTER’S TRADE</p></div><div class="menu"><div class="press">PRESS ANY KEY</div></div><div class="foot">Models by Quaternius, Kay Lousberg &amp; Kenney (CC0) · Best played with a mouse, or a gamepad</div></div>`);
    this.root.append(this.titleEl);
    const go = () => { window.removeEventListener('keydown', go); window.removeEventListener('mousedown', go); audio.resume(); audio.play('ui_open'); this.titleMenu(); };
    window.addEventListener('keydown', go); window.addEventListener('mousedown', go);
    this.titleGo = () => { this.titleGo = null; go(); };
  }
  private titleGo: (() => void) | null = null;
  titlePress() { if (this.titleGo && this.titleEl?.querySelector('.press')) this.titleGo(); }
  titleMenu() {
    if (!this.titleEl) return;
    const m = this.titleEl.querySelector('.menu') as HTMLElement;
    m.innerHTML = '';
    const st = $('<div class="stack" style="align-items:center"></div>');
    const any = [0, 1, 2].some((i) => readSlot(i));
    st.append(this.btn(any ? 'Continue' : 'New Game', () => this.fileSelect(), 'big'), this.btn('Options', () => { this.open('options'); }, 'big alt'), this.btn('Controls', () => { this.open('controls'); }, 'big alt'), this.btn('Credits', () => this.showCredits(), 'big alt'));
    m.append(st);
  }
  private fileSelect() {
    this.overlay?.remove();
    const el = $('<div id="panel"><div class="win small"><header><h2>Choose a Journal</h2><button class="btn x alt">✕</button></header><div class="body"><div class="stack" style="flex:1"></div></div></div></div>');
    this.overlay = el;
    el.querySelector('header .btn')!.addEventListener('click', () => { el.remove(); this.overlay = null; audio.play('ui_back'); });
    const st = el.querySelector('.stack')!;
    for (let i = 0; i < 3; i++) {
      const s = readSlot(i);
      const row = $(`<div class="slot">${icon(s ? 'scroll' : 'star', '#c79a3c', 44)}<div class="info"><b>${s ? s.name : `Empty journal ${i + 1}`}</b>${s ? `Rank ${s.level} ${RANK_TITLES[s.level]} · ${ZONES[s.zone].town} · Day ${s.day} · ${s.gold} coin · ${Math.floor(s.stats.playtime / 60)} min` : 'Begin a new hunt'}</div></div>`);
      row.append(this.btn(s ? 'Continue' : 'New Game', () => { el.remove(); this.overlay = null; this.titleEl?.remove(); this.titleEl = null; this.startCb?.(i, s, ['Wren', 'Ash', 'Rowan'][i]); }));
      if (s) row.append(this.btn('Erase', () => { if (confirm(`Erase ${s.name}'s journal? This cannot be undone.`)) { deleteSlot(i); this.fileSelect(); } }, 'red'));
      st.append(row);
    }
    this.root.append(el);
  }
  showDeath(lost: number, onContinue: () => void) {
    const el = $(`<div id="panel" style="background:#200806c0"><div class="win small"><header><h2>You were mauled</h2></header><div class="body"><div class="stack" style="flex:1"><div class="say">Hunters from ${ZONES[S.zone].town} carried you back at dawn.${lost ? ` Their fee came out of your purse: <b style="display:inline;font-size:inherit">${lost} coin</b>.` : ''} Your pack is as you left it.</div></div></div></div></div>`);
    this.overlay = el;
    unlockPointer();
    el.querySelector('.stack')!.append(this.btn('Get up', () => { el.remove(); this.overlay = null; lockPointer(); onContinue(); }, 'big'));
    this.root.append(el);
  }
  showCredits() {
    document.getElementById('credits')?.remove();
    const ending = S.flags.ending && G.game.playing;
    const el = $(`<div id="credits"><div class="roll">${ending ? '<p style="font-size:24px;font-style:italic;max-width:640px;margin:0 auto 60px">Old Rime’s pelt hangs in the hall at Hollowfrost now. They do not tell stories about the beast any more. They tell them about you.</p>' : ''}
      <h1>HIDEBOUND</h1><p><i>A Hunter’s Trade</i></p>
      <h3>GAME DESIGN · PROGRAMMING · MUSIC</h3><p>Built with Claude</p>
      <h3>ANIMALS · NATURE · PROPS</h3><p>Quaternius — Ultimate Animated Animals, Stylized Nature, Fantasy Props, Ultimate Monsters</p>
      <h3>CHARACTERS · ANIMATION · WEAPONS · BUILDINGS</h3><p>Kay Lousberg — KayKit Adventurers, Character Animations, Fantasy Weapons, Medieval Hexagon</p>
      <h3>CAMP PROPS · SOUND EFFECTS</h3><p>Kenney — Survival Kit, RPG Audio, Impact Sounds, Foley Sounds, UI Audio</p>
      <h3>TYPE</h3><p>Cinzel by Natanael Gama · Alegreya Sans by Juan Pablo del Peral</p>
      <h3>ENGINE</h3><p>three.js</p>
      <h3>WITH THANKS</h3><p>All art and audio above is released under CC0. Thank you for making games possible.</p>
      <p style="margin-top:120px;font-size:26px" class="cz">${ending ? 'The hunt goes on.' : 'Good hunting.'}</p><div style="height:40vh"></div></div></div>`);
    unlockPointer();
    const done = () => { el.remove(); if (G.game.playing && !this.isOpen) lockPointer(); };
    el.append(this.btn(ending ? 'Keep hunting' : 'Back', done));
    el.querySelector('.roll')!.addEventListener('animationend', done);
    this.root.append(el);
  }
  get blocking() { return !!this.overlay || !!document.getElementById('credits'); }
}
