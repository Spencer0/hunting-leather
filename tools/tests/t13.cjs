module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; const S = window.__S(); S.flags.hint_move = true; S.flags.hint_sneak = true; S.time = 10.5; });
  // fishing at a lake
  console.log(await p.evaluate(() => {
    const G = window.__G, S = window.__S(), P = G.player, t = G.zone.terrain, out = [];
    S.inv.rod = 1; S.inv.bait = 5;
    const l = t.lakes[0]; let found = null;
    for (let a = 0; a < 6.28 && !found; a += 0.2) for (let r = l.r * 2; r > 2; r -= 0.4) { const x = l.x + Math.cos(a) * r, z = l.z + Math.sin(a) * r; const h = t.height(x, z); if (h < 1.3) { found = [x, z, a]; out.push('h ' + h.toFixed(2)); break; } }
    if (!found) return 'no shore';
    P.teleport(found[0], found[1], 0); P.camYaw = Math.atan2(-(l.x - found[0]), -(l.z - found[1])); window.__step(3);
    const cp = G.game.castPoint(); out.push('cast ' + !!cp);
    if (cp) G.game.fish(cp);
    out.push('mini ' + G.ui.miniActive + ' bait ' + S.inv.bait);
    return out.join(' | ');
  }));
  await frames(3); await shot('fish_wait');
  await p.evaluate(() => { const G = window.__G; const f = G.ui.mg; for (let i = 0; i < 400 && f.phase === 'wait'; i++) f.tick(0.05, false); f.tick(0.05, true); f.tick(0.05, false); f.mx = f.fx; f.my = f.fy; f.tick(0.016, false); });
  await frames(2); await shot('fish_track');
  console.log(await p.evaluate(() => { const G = window.__G, S = window.__S(); const f = G.ui.mg; for (let i = 0; i < 600 && f.phase === 'track'; i++) { f.mx = f.fx; f.my = f.fy; f.tick(0.03, false); } return 'phase ' + f.phase + ' seq ' + f.seq.join(''); }));
  await frames(2); await shot('fish_qte');
  console.log(await p.evaluate(() => { const G = window.__G, S = window.__S(); const f = G.ui.mg; f.qi = f.seq.length - 1; const key = 'Key' + f.seq[f.qi]; window.dispatchEvent(new KeyboardEvent('keydown', { code: key })); f.tick(0.016, false); window.dispatchEvent(new KeyboardEvent('keyup', { code: key })); const ph = f.phase; for (let i = 0; i < 80 && G.ui.miniActive; i++) G.ui.tick(0.05); return 'after ' + ph + ' active ' + G.ui.miniActive + ' fish ' + JSON.stringify(S.fish) + ' cine ' + !!G.player.cine; }));
};
