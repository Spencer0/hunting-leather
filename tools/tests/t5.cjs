module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; });
  const r = await p.evaluate(() => {
    const G = window.__G, S = window.__S(), P = G.player, out = [];
    const log = (...a) => out.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
    try {
      for (const a of G.animals.list) a.update = function () { this.obj.position.copy(this.pos); };
      const aimAt = (t, lift) => { const o = { x: P.pos.x, y: P.pos.y + (P.crouching ? 1.0 : 1.38), z: P.pos.z }; const dx = t.x - o.x, dy = t.y - o.y + lift, dz = t.z - o.z; P.camYaw = Math.atan2(-dx, -dz); P.camPitch = -Math.atan2(dy, Math.hypot(dx, dz)); };
      const test = (id, part, dist, lift) => {
        const an = G.animals.list.find((a) => a.def.id === id && a.alive && a.hits === 0);
        // stand broadside
        const sx = an.pos.x + Math.cos(an.yaw) * dist, sz = an.pos.z - Math.sin(an.yaw) * dist;
        P.teleport(sx, sz, 0); window.__step(1); an.bones();
        const target = part === 'head' ? an.head : part === 'vital' ? an.chest.clone().lerp(an.rear, 0.15) : an.rear.clone().lerp(an.chest, 0.3);
        aimAt(target, lift); window.__force.aim = true; window.__step(6); aimAt(target, lift);
        window.__force.fireHit = true; window.__force.fire = true; window.__step(1); window.__force.fireHit = false; window.__step(34); aimAt(target, lift); window.__step(1);
        window.__force.fire = false; window.__step(1);
        const hp0 = an.hp; window.__step(30);
        log(id, part, dist + 'm', 'hp', hp0, '->', an.hp, 'hits', an.hits, 'state', an.state, 'stuck', an.stuck.length);
        return an;
      };
      test('doe', 'vital', 12, 0.1); test('doe', 'head', 12, 0.1); test('doe', 'body', 25, 0.45); test('fox', 'vital', 10, 0.1); test('stag', 'head', 15, 0.15);
      S.active = 2; window.__step(2);
      const an = G.animals.list.find((a) => a.def.id === 'fox' && a.alive && a.hits === 0);
      P.teleport(an.pos.x + Math.cos(an.yaw) * 6, an.pos.z - Math.sin(an.yaw) * 6, 0); window.__step(1); an.bones();
      aimAt(an.chest, 0.25); window.__force.aim = true; window.__step(4); aimAt(an.chest, 0.25);
      window.__force.fireHit = true; window.__step(1); window.__force.fireHit = false; window.__step(40);
      log('knife fox hp', an.hp, 'hits', an.hits, 'knives', S.inv.knife);
      S.active = 1; window.__step(2);
      const st = G.animals.list.find((a) => a.def.id === 'stag' && a.alive);
      P.teleport(st.pos.x + Math.cos(st.yaw) * 20, st.pos.z - Math.sin(st.yaw) * 20, 0); window.__step(1); st.bones();
      aimAt(st.chest, 0.12); window.__step(4); aimAt(st.chest, 0.12);
      window.__force.fireHit = true; window.__step(1); window.__force.fireHit = false; window.__step(30);
      log('xbow stag hp', st.hp, 'hits', st.hits, 'bolts', S.inv.bolt, 'reload', P.reload.toFixed(2), 'loaded', P.loaded);
      window.__force.aim = false;
      log('xp', S.xp, 'lvl', S.level, 'kills', S.kills, 'stats', S.stats);
    } catch (e) { log('ERR', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')); }
    return out;
  });
  console.log(r.join('\n'));
  // UI screenshots
  await p.evaluate(() => { const G = window.__G; G.ui.open('tanner'); G.ui.tab = 'Craft'; G.ui.refresh(); });
  await frames(1); await shot('ui_craft');
  await p.evaluate(() => { const G = window.__G; G.ui.open('journal'); });
  await frames(1); await shot('ui_pack');
  await p.evaluate(() => { const G = window.__G; G.ui.tab = 'Map'; G.ui.refresh(); });
  await frames(1); await shot('ui_map');
  await p.evaluate(() => { const G = window.__G; G.ui.open('merchant'); });
  await frames(1); await shot('ui_sell');
};
