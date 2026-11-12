// logic test: hunt, skin, tan, craft, sell
module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; });
  const r = await p.evaluate(() => {
    const G = window.__G, S = window.__S(), P = G.player, out = [];
    const log = (...a) => out.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
    try {
      const doe = G.animals.list.find((a) => a.def.id === 'doe');
      log('doe at', doe.pos.toArray().map((v) => v.toFixed(1)), 'h', doe.height.toFixed(2), 'scale', doe.scale.toFixed(3));
      // stand 14 m to the side of the doe, face it
      const sx = doe.pos.x + 14, sz = doe.pos.z;
      P.teleport(sx, sz, 0);
      P.crouching = true;
      window.__step(2);
      doe.bones();
      log('bones head', doe.head.toArray().map((v) => v.toFixed(2)), 'chest', doe.chest.toArray().map((v) => v.toFixed(2)), 'rear', doe.rear.toArray().map((v) => v.toFixed(2)), 'pos', doe.pos.toArray().map((v) => v.toFixed(2)));
      // aim camera at chest
      const aimAt = (t) => { const hx = P.pos.x, hy = P.pos.y + 1.2, hz = P.pos.z; const dx = t.x - hx, dy = t.y - hy, dz = t.z - hz; P.camYaw = Math.atan2(-dx, -dz); P.camPitch = -Math.atan2(dy + 0.35, Math.hypot(dx, dz)); };
      let kills = 0;
      for (let shotN = 0; shotN < 6 && doe.alive; shotN++) {
        doe.bones(); aimAt(doe.chest);
        window.__force.aim = true; window.__step(8);
        doe.bones(); aimAt(doe.chest); window.__step(2);
        window.__force.fireHit = true; window.__force.fire = true; window.__step(1); window.__force.fireHit = false; window.__step(32);
        doe.bones(); aimAt(doe.chest); window.__step(1);
        window.__force.fire = false; window.__step(1);
        const sh = G.shots.shots[0];
        log('shot', shotN, 'fired', G.shots.shots.length, sh ? sh.vel.toArray().map((v) => v.toFixed(1)) : '', 'doe state', doe.state, 'meter', doe.meter.toFixed(2), 'dist', doe.pos.distanceTo(P.pos).toFixed(1));
        window.__step(40);
        log(' -> hp', doe.hp, 'state', doe.state, 'hits', doe.hits, 'pickups', G.shots.pickups.length, 'arrows', S.inv.arrow);
      }
      if (doe.alive) { doe.onHit(999, 'vital', true, 'bow1'); log('forced kill'); }
      log('xp', S.xp, 'lvl', S.level, 'kills', S.kills);
      window.__force.aim = false;
      P.crouching = false;
      P.teleport(doe.pos.x + 1.2, doe.pos.z, 0);
      window.__step(3);
      log('focus', G.game.focus && G.game.focus.kind);
      G.game['skin'](doe);
      window.__step(200);
      log('inv after skin', S.inv, 'flags', Object.keys(S.flags));
      const hideKey = Object.keys(S.inv).find((k) => k.startsWith('hide_deer'));
      G.game.tan(hideKey, 1);
      log('after tan', S.inv.leather_light, 'salt', S.inv.salt);
      const R = (id) => G.game.canCraft ? id : id;
      G.ui.open('tanner'); G.ui.tab = 'Craft'; G.ui.refresh();
      const btns = [...document.querySelectorAll('#panel .row')].map((r) => r.querySelector('.nm').textContent.slice(0, 30) + ':' + !r.querySelector('button').disabled);
      log('craft rows', btns.slice(0, 6));
      [...document.querySelectorAll('#panel .row')].find((r) => r.textContent.includes('Coin Pouch')).querySelector('button').click();
      log('pouch', S.inv.g_pouch, 'gold', S.gold);
      G.ui.open('merchant');
      const sellRow = [...document.querySelectorAll('#panel .row')].find((r) => r.textContent.includes('Coin Pouch'));
      sellRow.querySelectorAll('button')[0].click();
      log('sold: gold', S.gold, 'pouch', S.inv.g_pouch, 'xp', S.xp, 'obj', G.game.objective());
      for (const k of ['fletcher', 'inn', 'board', 'wagon', 'campfire', 'bedroll', 'journal', 'pause', 'options', 'controls']) { G.ui.open(k); if (k === 'journal') for (const t of ['Gear', 'Skills', 'Contracts', 'Bestiary', 'Map']) { G.ui.tab = t; G.ui.refresh(); } if (k === 'board') { G.ui.tab = 'My Contracts'; G.ui.refresh(); } }
      G.ui.close();
      log('panels ok');
      // predator test
      G.game.loadZone('amberwood');
      const wolf = G.animals.list.find((a) => a.def.id === 'wolf');
      P.teleport(wolf.pos.x + 12, wolf.pos.z, 0);
      const hp0 = S.hp; window.__step(400);
      log('wolf state', wolf.state, 'dist', wolf.pos.distanceTo(P.pos).toFixed(1), 'hp', hp0, '->', S.hp, 'dead', P.dead);
    } catch (e) { log('ERR', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')); }
    return out;
  });
  console.log(r.join('\n'));
};
