module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; });
  const setup = (zone, hour, ids) => p.evaluate(([zone, hour, ids]) => {
    const G = window.__G, S = window.__S(), P = G.player, out = [];
    try {
      if (zone !== S.zone) G.game.loadZone(zone);
      S.time = hour;
      // gather one of each species in front of the player in a meadow spot
      const t = G.zone.terrain;
      let spot = null;
      for (let i = 0; i < 400 && !spot; i++) { const x = (Math.random() - 0.5) * 240, z = -120 + Math.random() * 160; let ok = true; for (let dx = -12; dx <= 12; dx += 6) for (let dz = -22; dz <= 4; dz += 6) if (!t.walkable(x + dx, z + dz) || t.pathAt(x + dx, z + dz) > 0.5) ok = false; if (ok && Math.abs(t.height(x, z - 14) - t.height(x, z)) < 1.2) spot = [x, z]; }
      if (!spot) spot = [0, -20];
      P.teleport(spot[0], spot[1], Math.PI); P.camYaw = 0; P.camPitch = 0.1;
      const seen = new Set(); let k = 0;
      for (const a of G.animals.list) {
        a.update = function () { this.obj.position.copy(this.pos); this.obj.visible = true; };
        if (seen.has(a.def.id)) continue; seen.add(a.def.id);
        const n = ids.length || 5;
        const px = spot[0] - 7 + (k % 5) * 3.6, pz = spot[1] - 9 - Math.floor(k / 5) * 5; k++;
        a.pos.set(px, t.height(px, pz), pz); a.yaw = Math.PI / 2 + (k % 2) * 0.5; a.obj.rotation.set(0, a.yaw, 0); a.obj.position.copy(a.pos);
        out.push(a.def.id + ' h=' + a.height.toFixed(2));
      }
      window.__force.aim = false;
      window.__step(3);
    } catch (e) { out.push('ERR ' + e.message); }
    return out.join(', ');
  }, [zone, hour, ids]);
  console.log(await setup('greenhollow', 10, []));
  await frames(2); await shot('z1_wild');
  // knife debug
  console.log(await p.evaluate(() => { const G = window.__G, S = window.__S(), P = G.player; S.active = 2; window.__step(2); const o = []; window.__force.fireHit = true; window.__step(1); o.push('throwT ' + P.throwT); window.__force.fireHit = false; window.__step(5); o.push('throwT ' + P.throwT + ' knives ' + S.inv.knife); window.__step(20); o.push('throwT ' + P.throwT + ' knives ' + S.inv.knife + ' shots ' + G.shots.shots.length + ' pick ' + G.shots.pickups.length); S.active = 0; window.__force.aim = true; window.__force.fire = true; window.__force.fireHit = true; window.__step(1); window.__force.fireHit = false; window.__step(40); return o.join(' | '); }));
  await frames(2); await shot('z1_aim');
  await p.evaluate(() => { window.__force.fire = false; window.__force.aim = false; window.__step(2); });
  console.log(await setup('amberwood', 17.6, []));
  await frames(2); await shot('z2_wild');
  console.log(await setup('sunscar', 13, []));
  await frames(2); await shot('z3_wild');
  console.log(await setup('frostfang', 9, []));
  await frames(2); await shot('z4_wild');
  await p.evaluate(() => { const G = window.__G, S = window.__S(); S.time = 22; const t = G.zone.terrain; G.player.teleport(t.town.x + 2, t.town.z + 20, Math.PI); window.__step(2); });
  await frames(2); await shot('z4_town_night');
};
