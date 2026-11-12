module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; });
  await p.evaluate(() => { const G = window.__G; const t = G.zone.terrain; const c = t.camps[0]; G.player.teleport(c.x - 6, c.z + 3, 0); G.player.camYaw = Math.atan2(-(c.x + 1 - G.player.pos.x), -(c.z - 1 - G.player.pos.z)) + 0.35; window.__S().time = 19.6; window.__step(3); });
  await frames(2); await shot('camp2');
  await p.evaluate(() => { const G = window.__G, S = window.__S(), P = G.player; S.time = 9; const d = G.animals.list.find((a) => a.def.id === 'doe'); for (const a of G.animals.list) a.update = function () { this.obj.position.copy(this.pos); };
    P.teleport(d.pos.x + Math.cos(d.yaw) * 13, d.pos.z - Math.sin(d.yaw) * 13, 0); d.bones(); const dx = d.chest.x - P.pos.x, dz = d.chest.z - P.pos.z; P.camYaw = Math.atan2(-dx, -dz); P.camPitch = 0.02; window.__force.aim = true; window.__force.fire = true; window.__force.fireHit = true; window.__step(1); window.__force.fireHit = false; window.__step(40); });
  await frames(2); await shot('aim2');
};
