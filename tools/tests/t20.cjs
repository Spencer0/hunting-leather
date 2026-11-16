module.exports = async (p) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  console.log(await p.evaluate(() => {
    window.__pause = true;
    const G = window.__G, S = window.__S(), P = G.player, o = [], t = G.zone.terrain;
    const aimAt = (v) => { const c = G.camera.position; const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z; P.camYaw = Math.atan2(-dx, -dz); P.camPitch = Math.atan2(-dy, Math.hypot(dx, dz)); };
    for (const dist of [5, 7, 9]) {
      const r = G.animals.list.filter((a) => a.def.id === 'rabbit' && a.alive && a.state !== 'flee')[0];
      r.state = 'idle'; r.timer = 99; r.meter = 0;
      P.teleport(r.pos.x, r.pos.z + dist, 0); P.crouching = true; S.inv.spear = 6;
      window.__force.aim = true;
      for (let i = 0; i < 3; i++) { r.bones(); aimAt(r.chest); window.__step(6); r.meter = 0; r.state = 'idle'; }
      r.bones(); aimAt(r.chest); window.__step(1);
      window.__force.fireHit = true; window.__step(1); window.__force.fireHit = false; window.__step(70);
      o.push(`rabbit at ${dist} m: ${r.alive ? 'missed' : 'killed'}`);
    }
    // how far does a spear go when aimed at something 30 m off?
    P.teleport(t.home.x + 30, t.home.z + 30, 0); P.camPitch = 0.0; window.__step(10);
    const before = G.shots.pickups.length; window.__force.fireHit = true; window.__step(1); window.__force.fireHit = false; window.__step(120);
    const pk = G.shots.pickups[G.shots.pickups.length - 1];
    o.push('level throw lands at ' + (pk && G.shots.pickups.length > before ? Math.hypot(pk.pos.x - P.pos.x, pk.pos.z - P.pos.z).toFixed(1) + ' m' : 'n/a'));
    return o.join('\n');
  }));
};
