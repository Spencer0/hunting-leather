module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; });
  console.log(await p.evaluate(() => {
    const G = window.__G, S = window.__S(), P = G.player; S.time = 11;
    const w = G.animals.list.find((a) => a.def.id === 'wolf');
    const yaw = Math.atan2(w.pos.x - 0, w.pos.z - 0);
    P.teleport(w.pos.x - Math.sin(yaw) * 16, w.pos.z - Math.cos(yaw) * 16, yaw); P.camYaw = yaw + Math.PI; P.camPitch = 0.12;
    window.__step(55);
    return 'wolves: ' + G.animals.list.filter((a) => a.def.id === 'wolf').map((a) => a.state + '@' + a.pos.distanceTo(P.pos).toFixed(1)).join(' ') + ' hp ' + S.hp;
  }));
  await frames(2); await shot('act_wolves');
  console.log(await p.evaluate(() => {
    const G = window.__G, S = window.__S(), P = G.player;
    const d = G.animals.list.find((a) => a.def.id === 'stag' && a.alive);
    const yaw = Math.atan2(d.pos.x, d.pos.z);
    P.teleport(d.pos.x - Math.sin(yaw) * 9, d.pos.z - Math.cos(yaw) * 9, yaw); P.camYaw = yaw + Math.PI; P.camPitch = 0.1; P.iframes = 99;
    window.__step(50);
    return 'stag: ' + d.state + '@' + d.pos.distanceTo(P.pos).toFixed(1) + ' speed ' + d.speed.toFixed(1);
  }));
  await frames(2); await shot('act_stag');
  await p.evaluate(() => { const G = window.__G; const t = G.zone.terrain; const c = t.camps[0]; G.player.teleport(c.x - 5, c.z + 6, 0); G.player.camYaw = Math.atan2(-(c.x - G.player.pos.x), -(c.z - G.player.pos.z)); window.__S().time = 19.3; window.__step(3); });
  await frames(2); await shot('act_camp');
};
