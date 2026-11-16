module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; const S = window.__S(); S.time = 10; S.flags.hint_move = S.flags.hint_sneak = true; window.__step(60); });
  await frames(2); await shot('start');
  await p.evaluate(() => { const G = window.__G; const st = window.setTimeout; window.setTimeout = () => 0; G.game.gainXp('fishing', 23); G.game.gainXp('hunting', 9); window.setTimeout = st; });
  await shot('xp');
  await p.evaluate(() => { const G = window.__G, S = window.__S(); S.inv.bait = 3; document.querySelectorAll('.xpcard').forEach((e) => e.remove());
    const P = G.player, t = G.zone.terrain, l = t.lakes[0]; const a = Math.atan2(t.home.x - l.x, t.home.z - l.z);
    for (let d = l.r + 6; d > 2; d -= 0.25) { const x = l.x + Math.sin(a) * d, z = l.z + Math.cos(a) * d; if (t.height(x, z) < 1.25) { P.teleport(x, z, 0); break; } }
    P.camYaw = Math.atan2(-(l.x - P.pos.x), -(l.z - P.pos.z)); window.__step(3); G.game.fish(G.game.castPoint()); });
  const tick = (n) => p.evaluate((n) => { for (let i = 0; i < n; i++) window.__G.ui.tick(0.05); }, n);
  await tick(40); await frames(3); await shot('fish_wait');
  await p.evaluate(() => { const m = window.__G.ui.mg; m.pt = m.waitFor; }); await tick(3);
  await p.evaluate(() => { const m = window.__G.ui.mg; m.clicked = true; }); await tick(30);
  await p.evaluate(() => { const m = window.__G.ui.mg; m.mx = m.fx + 10; m.my = m.fy + 5; m.prog = 0.6; }); await tick(1); await frames(2); await shot('fish_track');
  await p.evaluate(() => { const m = window.__G.ui.mg; m.rarity = 2; m.fishId = 'f_catfish'; m.result = { fish: 'f_catfish', weight: 6.1, perfect: false }; m.go('end'); }); await tick(14); await frames(2); await shot('fish_end');
};
