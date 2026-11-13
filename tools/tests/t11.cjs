module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; });
  const r = await p.evaluate(() => {
    const G = window.__G, S = window.__S(), P = G.player, out = [];
    const log = (...a) => out.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
    try {
      const upd = new Map();
      for (const a of G.animals.list) { upd.set(a, a.update); a.update = function () { this.obj.position.copy(this.pos); }; }
      // aim straight at the target with NO manual lift: the solver should land it
      const aimAt = (t) => { G.camera.updateMatrixWorld(); const c = G.camera.position; const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z; P.camYaw += 0; };
      const test = (id, part, dist) => {
        const an = G.animals.list.find((a) => a.def.id === id && a.alive && a.hits === 0);
        P.teleport(an.pos.x + Math.cos(an.yaw) * dist, an.pos.z - Math.sin(an.yaw) * dist, 0); window.__force.aim = true;
        for (let k = 0; k < 14; k++) { // iterate: point the real camera at the target
          window.__step(2); an.bones(); const t = part === 'head' ? an.head : an.chest.clone().lerp(an.rear, 0.2);
          const c = G.camera.position, dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z; P.camYaw = Math.atan2(-dx, -dz); P.camPitch = -Math.atan2(dy, Math.hypot(dx, dz));
        }
        window.__force.fireHit = true; window.__force.fire = true; window.__step(1); window.__force.fireHit = false; window.__step(34);
        window.__force.fire = false; window.__step(1);
        const hp0 = an.hp; window.__step(45);
        log(id, part, dist + 'm', 'hp', hp0, '->', an.hp, 'hits', an.hits);
      };
      test('doe', 'body', 8); test('doe', 'body', 20); test('doe', 'body', 38); test('fox', 'body', 14); test('stag', 'head', 22);
      S.active = 2; window.__step(3); test('fox', 'body', 9);
      S.active = 0; window.__force.aim = false; window.__step(3);
      // melee vs wolf
      G.game.loadZone('amberwood');
      const wolf = G.animals.list.find((a) => a.def.id === 'wolf');
      P.teleport(wolf.pos.x + 9, wolf.pos.z, 0); P.iframes = 0;
      let swings = 0;
      for (let k = 0; k < 600 && wolf.alive && !P.dead; k++) {
        const d = wolf.pos.distanceTo(P.pos);
        if (d < 3.2 && P.meleeT < 0 && P.stamina > 10) { window.__force.melee = true; swings++; }
        window.__step(1); window.__force.melee = false;
      }
      log('melee: wolf alive', wolf.alive, 'hp', wolf.hp, 'swings', swings, 'player hp', S.hp, 'kills', S.kills);
      // tan + craft with scores
      G.game.loadZone('greenhollow');
      const before = S.inv.leather_light || 0; G.game.tan('hide_deer:1', 1, 1, 'salt'); log('tan perfect yield', (S.inv.leather_light || 0) - before);
      const rp = (id) => { const R = G.ui.constructor; return null; };
      log('thread', S.inv.thread, 'light', S.inv.leather_light);
    } catch (e) { log('ERR', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')); }
    return out;
  });
  console.log(r.join('\n'));
  await p.evaluate(() => { const G = window.__G, S = window.__S(); S.gear.pack = 'pack2'; S.active = 0; G.player.refreshBack(); const t = G.zone.terrain; G.player.teleport(t.town.x + 2, t.town.z + 12, Math.PI); S.time = 10; window.__step(4); });
  const [x, y, z] = await p.evaluate(() => window.__G.player.pos.toArray());
  await snap('back_view', [x + 1.2, y + 1.7, z + 3.2], [x, y + 1.0, z]);
  await snap('back_side', [x + 3.0, y + 1.5, z + 0.6], [x, y + 1.0, z]);
  await p.evaluate(() => { const G = window.__G; G.ui.open('tanner', 'Craft'); document.querySelectorAll('.rec')[0].click(); });
  await frames(1); await shot('ui_bench');
  await p.evaluate(() => { const G = window.__G; document.querySelector('.cout .btn').click(); });
  await frames(3); await shot('ui_mini');
  await p.evaluate(() => { const G = window.__G; for (let i = 0; i < 400 && G.ui.miniActive; i++) G.ui.tick(0.05, false), (i % 9 === 0) && window.dispatchEvent(new MouseEvent('mousedown')); });
  console.log(await p.evaluate(() => JSON.stringify({ mini: window.__G.ui.miniActive, inv: Object.keys(window.__S().inv).filter((k) => k.startsWith('g_')) })));
  await p.evaluate(() => { const G = window.__G; G.ui.open('journal'); });
  await frames(1); await shot('ui_journal');
  await p.evaluate(() => { const G = window.__G; G.ui.close(true); });
  await frames(2); await shot('hud_new');
};
