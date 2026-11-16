module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; const S = window.__S(); S.time = 10; });
  console.log(await p.evaluate(() => {
    const G = window.__G, S = window.__S(), P = G.player, o = [], t = G.zone.terrain;
    const log = (...a) => o.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
    try {
      log('home', t.home.x.toFixed(0), t.home.z.toFixed(0), 'town', t.town.x.toFixed(0), t.town.z.toFixed(0), 'player', P.pos.x.toFixed(0), P.pos.z.toFixed(0), 'pond', t.lakes[0]);
      log('inv', S.inv, 'slots', S.slots, 'active', S.active, 'gold', S.gold, 'obj', G.game.objective());
      const small = G.animals.list.filter((a) => a.def.small);
      log('small game', small.length, 'within 60 of home', small.filter((a) => Math.hypot(a.pos.x - t.home.x, a.pos.z - t.home.z) < 60).length, 'total animals', G.animals.list.length);
      log('stations', G.zone.stations.map((s) => s.kind).join(','));
      // hunt: stand 7 m from a rabbit, crouched, and throw
      const r = small.filter((a) => a.def.id === 'rabbit').sort((a, b) => a.pos.distanceTo(t.home) - b.pos.distanceTo(t.home))[0];
      P.teleport(r.pos.x, r.pos.z + 7, 0); P.crouching = true;
      P.camYaw = Math.atan2(-(r.pos.x - P.pos.x), -(r.pos.z - P.pos.z)); P.camPitch = 0.1;
      window.__step(3);
      window.__r = r;
    } catch (e) { log('ERR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')); }
    return o.join('\n');
  }));
  await frames(2); await shot('rabbit');
  console.log(await p.evaluate(() => {
    const G = window.__G, S = window.__S(), P = G.player, o = [], r = window.__r, t = G.zone.terrain;
    const log = (...a) => o.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
    try {
      // aim at the rabbit's chest with the camera, throw
      let killed = false;
      for (let tries = 0; tries < 6 && r.alive; tries++) {
        r.bones();
        const cam = G.camera.position; const dx = r.chest.x - cam.x, dy = r.chest.y - cam.y, dz = r.chest.z - cam.z;
        P.camYaw = Math.atan2(-dx, -dz); P.camPitch = Math.atan2(-dy, Math.hypot(dx, dz));
        window.__force.aim = true; window.__step(12);
        const c2 = G.camera.position; const ex = r.chest.x - c2.x, ey = r.chest.y - c2.y, ez = r.chest.z - c2.z;
        P.camYaw = Math.atan2(-ex, -ez); P.camPitch = Math.atan2(-ey, Math.hypot(ex, ez));
        window.__step(2);
        window.__force.fireHit = true; window.__step(1); window.__force.fireHit = false; window.__step(50);
      }
      window.__force.aim = false;
      log('rabbit alive', r.alive, 'state', r.state, 'hp', r.hp, 'spears', S.inv.spear, 'kills', S.kills, 'hunting', S.skills.hunting, 'pickups', G.shots.pickups.length);
      if (r.alive) { r.onHit(99, 'body', true, 'thr0'); G.game.onKill(r, 5); }
      P.teleport(r.pos.x + 0.6, r.pos.z, 0); window.__step(2);
      log('focus', G.game.focus && G.game.focus.kind);
      G.game.skin(r); window.__step(150);
      log('after skin inv', S.inv, 'hunting', S.skills.hunting, 'obj', G.game.objective());
      // doe with spear
      const doe = G.animals.list.find((a) => a.def.id === 'doe');
      G.game.onShotHit({ weapon: { ...{ id: 'thr0', damage: 10, kind: 'thrown', weak: true } }, power: 1, dist: 5 }, { animal: doe, point: doe.pos.clone(), part: 'head' });
      log('doe hp after ambush head spear', doe.hp, '/', doe.def.hp);
      const k = Object.keys(S.inv).find((x) => x.startsWith('hide_rabbit'));
      G.game.sellPelt(k, 1); log('gold after pelt', S.gold, 'obj', G.game.objective());
      S.gold += 10; G.game.buy('bait', 3); log('bait', S.inv.bait, 'gold', S.gold, 'obj', G.game.objective());
    } catch (e) { log('ERR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')); }
    return o.join('\n');
  }));
  // home yard
  await p.evaluate(() => { const G = window.__G, t = G.zone.terrain; G.player.teleport(t.home.x, t.home.z, 0); const a = Math.atan2(t.town.x - t.home.x, t.town.z - t.home.z); G.player.camYaw = a + 0.5; G.player.camPitch = 0.2; window.__step(3); });
  await frames(2); await shot('home1');
  const h = await p.evaluate(() => { const t = window.__G.zone.terrain; return [t.home.x, t.home.y, t.home.z, t.town.x, t.town.z, t.lakes[0].x, t.lakes[0].z]; });
  const a = Math.atan2(h[3] - h[0], h[4] - h[2]);
  await snap('home_air', [h[0] + Math.sin(a) * 26, h[1] + 16, h[2] + Math.cos(a) * 26], [h[0], h[1] + 1, h[2]], 50);
  await snap('home_air2', [h[0] + Math.sin(a + 2) * 30, h[1] + 22, h[2] + Math.cos(a + 2) * 30], [(h[0] + h[5]) / 2, h[1], (h[2] + h[6]) / 2], 55);
  await p.evaluate(() => { const G = window.__G; G.ui.open('trapper'); });
  await frames(3); await shot('ui_trapper');
  await p.evaluate(() => { const G = window.__G; G.ui.close(true); G.game.gainXp('fishing', 30); G.game.gainXp('hunting', 400); });
  await frames(6); await shot('xp');
  await p.evaluate(() => { const G = window.__G; G.ui.open('journal', 'Skills'); });
  await frames(3); await shot('ui_skills');
  // fishing at the pond
  console.log(await p.evaluate(() => {
    const G = window.__G, P = G.player, t = G.zone.terrain, l = t.lakes[0]; G.ui.close(true);
    const a = Math.atan2(t.home.x - l.x, t.home.z - l.z);
    for (let d = l.r + 6; d > 2; d -= 0.25) { const x = l.x + Math.sin(a) * d, z = l.z + Math.cos(a) * d; if (t.height(x, z) < 1.25) { P.teleport(x, z, 0); break; } }
    P.camYaw = Math.atan2(-(l.x - P.pos.x), -(l.z - P.pos.z)); window.__step(3);
    const c = G.game.castPoint(); if (c) G.game.fish(c);
    return 'cast ' + !!c + ' depth ' + (1 - t.height(l.x, l.z)).toFixed(1);
  }));
  const tick = (n) => p.evaluate((n) => { for (let i = 0; i < n; i++) window.__G.ui.tick(0.05); }, n);
  await tick(30); await frames(2); await shot('fish_wait');
  await p.evaluate(() => { const m = window.__G.ui.mg; m.pt = m.waitFor; }); await tick(3); await frames(2); await shot('fish_bite');
  await p.evaluate(() => { const m = window.__G.ui.mg; m.clicked = true; }); await tick(12);
  await p.evaluate(() => { const m = window.__G.ui.mg; m.mx = m.fx + 10; m.my = m.fy + 5; }); await tick(1); await frames(2); await shot('fish_track');
  await p.evaluate(() => { const m = window.__G.ui.mg; m.prog = 0.99; m.mx = m.fx; m.my = m.fy; }); await tick(10); await frames(2); await shot('fish_qte');
  await p.evaluate(() => { const m = window.__G.ui.mg; m.rarity = 1; m.fishId = 'f_perch'; m.result = { fish: 'f_perch', weight: 1.8, perfect: true }; m.go('end'); }); await tick(14); await frames(2); await shot('fish_end');
  await tick(60);
  console.log(await p.evaluate(() => JSON.stringify(window.__S().skills)));
};
