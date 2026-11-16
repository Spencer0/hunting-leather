module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; const S = window.__S(); S.time = 10; S.flags.hint_move = S.flags.hint_sneak = true; window.__step(60); });
  await frames(2); await shot('start');
  await p.evaluate(() => { const G = window.__G; const st = window.setTimeout; window.setTimeout = () => 0; G.game.gainXp('fishing', 23); G.game.gainXp('hunting', 9); window.setTimeout = st; });
  await frames(3); await shot('xp');
  const h = await p.evaluate(() => { const t = window.__G.zone.terrain; return [t.home.x, t.home.y, t.home.z, t.lakes[0].x, t.lakes[0].z]; });
  const a = Math.atan2(h[3] - h[0], h[4] - h[2]);
  await snap('home_air', [h[0] - Math.sin(a - 0.6) * 30, h[1] + 20, h[2] - Math.cos(a - 0.6) * 30], [h[0] + Math.sin(a) * 10, h[1] + 1, h[2] + Math.cos(a) * 10], 60);
};
