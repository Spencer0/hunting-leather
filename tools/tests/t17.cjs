module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await frames(2); await shot('start');
  await p.evaluate(() => { window.__pause = true; const S = window.__S(); S.time = 10; S.flags.hint_move = S.flags.hint_sneak = true; });
  const h = await p.evaluate(() => { const t = window.__G.zone.terrain; return [t.home.x, t.home.y, t.home.z, t.lakes[0].x, t.lakes[0].z]; });
  const a = Math.atan2(h[3] - h[0], h[4] - h[2]);
  await snap('home_air', [h[0] - Math.sin(a - 0.5) * 24, h[1] + 15, h[2] - Math.cos(a - 0.5) * 24], [h[0] + Math.sin(a) * 8, h[1] + 1, h[2] + Math.cos(a) * 8], 55);
  // critters close up
  for (const id of ['rabbit', 'squirrel']) {
    const c = await p.evaluate((id) => { const G = window.__G; const an = G.animals.list.find((x) => x.def.id === id); an.cur = id === 'rabbit' ? 'look' : 'eat'; an.state = 'idle'; an.timer = 99; window.__step(20); G.player.teleport(an.pos.x + 30, an.pos.z + 30); return [an.pos.x, an.pos.y, an.pos.z, an.yaw]; }, id);
    await snap(id, [c[0] + Math.sin(c[3] + 0.9) * 1.5, c[1] + 0.55, c[2] + Math.cos(c[3] + 0.9) * 1.5], [c[0], c[1] + 0.2, c[2]], 40);
  }
  // herb lure + a dropped spear
  const hb = await p.evaluate(() => { const G = window.__G, P = G.player; const hh = G.zone.herbs.find((x) => x.id === 'h_fox'); P.teleport(hh.pos.x + 3, hh.pos.z + 3, 0);
    const pt = hh.pos.clone(); pt.x += 1.6; pt.y = G.zone.terrain.height(pt.x, pt.z);
    G.shots.fire(pt.clone().setY(pt.y + 2), new (pt.constructor)(0.2, -1, 0.1).normalize(), { id: 'thr0', kind: 'thrown', ammo: 'spear', speed: 20, damage: 1 }, 1);
    window.__step(30); return [hh.pos.x, hh.pos.y, hh.pos.z, G.shots.pickups.length]; });
  console.log('pickups', hb[3]);
  await snap('lure', [hb[0] + 3.2, hb[1] + 1.5, hb[2] + 2.6], [hb[0] + 0.7, hb[1] + 0.6, hb[2]], 45);
  // xp card (freeze removal timers)
  await p.evaluate(() => { const G = window.__G, P = G.player, t = G.zone.terrain; P.teleport(t.home.x, t.home.z, 0); window.__step(2); const st = window.setTimeout; window.setTimeout = () => 0; G.game.gainXp('fishing', 23); G.game.gainXp('hunting', 9); window.setTimeout = st;
    const s = document.createElement('style'); s.textContent = '.xpcard, .xpcard * , #banner { animation: none !important } #banner { opacity: 1 !important }'; document.head.append(s); });
  await frames(1); await shot('xp');
  await p.evaluate(() => { const G = window.__G; G.ui.open('trapper'); });
  await frames(2); await shot('ui_trapper');
  await p.evaluate(() => { const G = window.__G, S = window.__S(); G.ui.close(true); S.flags.bait = true; S.inv.bait = 3;
    const P = G.player, t = G.zone.terrain, l = t.lakes[0]; const a = Math.atan2(t.home.x - l.x, t.home.z - l.z);
    for (let d = l.r + 6; d > 2; d -= 0.25) { const x = l.x + Math.sin(a) * d, z = l.z + Math.cos(a) * d; if (t.height(x, z) < 1.25) { P.teleport(x, z, 0); break; } }
    P.camYaw = Math.atan2(-(l.x - P.pos.x), -(l.z - P.pos.z)); window.__step(3); G.game.fish(G.game.castPoint()); });
  const tick = (n) => p.evaluate((n) => { for (let i = 0; i < n; i++) window.__G.ui.tick(0.05); }, n);
  await tick(40); await frames(2); await shot('fish_wait');
  await p.evaluate(() => { const m = window.__G.ui.mg; m.rarity = 0; m.fishId = 'f_trout'; m.result = { fish: 'f_trout', weight: 1.1, perfect: false }; m.go('end'); }); await tick(14); await frames(2); await shot('fish_end');
};
