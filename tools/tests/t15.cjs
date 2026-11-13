module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; const S = window.__S(); S.flags.hint_move = true; S.flags.hint_sneak = true; S.time = 10; });
  console.log(await p.evaluate(() => {
    const G = window.__G, S = window.__S(), P = G.player, o = [];
    const log = (...a) => o.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '));
    try {
      log('herbs', G.zone.herbs.length, [...new Set(G.zone.herbs.map((h) => h.id))].join(','), 'stations', G.zone.stations.map((s) => s.kind).join(','));
      const h = G.zone.herbs[0]; P.teleport(h.pos.x + 0.8, h.pos.z, 0); window.__step(2);
      log('nearHerb', G.game.nearHerb()); G.game.gather(G.game.nearHerb()); log('inv', S.inv[h.id], 'picked', S.picked);
      for (const id of ['h_mint', 'h_hart', 'h_fox', 'h_cress']) S.inv[id] = 6;
      log('preview before', G.game.brewPreview(['h_mint', 'h_hart']));
      log('brew mint+hart', G.game.brew(['h_mint', 'h_hart']));
      log('brew fox+cress', G.game.brew(['h_fox', 'h_cress']));
      log('brew mint+hart+cress', G.game.brew(['h_mint', 'h_hart', 'h_cress']));
      log('preview after', G.game.brewPreview(['h_mint', 'h_hart']), 'lore', S.lore);
      // stamina
      P.stamina = 5; window.__step(60); const s1 = P.stamina; P.stamina = 5; P.crouching = true; window.__step(60); const s2 = P.stamina; P.crouching = false;
      log('stamina after 2s idle', s1.toFixed(0), 'crouched', s2.toFixed(0));
      P.stamina = 5; G.game.useItem('p_vigor'); log('vigor ->', P.stamina.toFixed(0), 'buffs', S.buffs);
      S.hotbar = ['w0', 'w1', 'w2', 'p_mending', 'jerky']; S.hp = 40;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4' })); window.__step(1); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit4' }));
      window.__step(90); log('hp after mending 3s', S.hp.toFixed(0), 'mending left', S.inv.p_mending, 'buffs', Object.keys(S.buffs));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' })); window.__step(1); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2' })); log('active after key 2', S.active);
    } catch (e) { log('ERR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')); }
    return o.join('\n');
  }));
  await p.evaluate(() => { const G = window.__G; const h = G.zone.herbs.find((x) => !x.taken); G.player.teleport(h.pos.x + 2.2, h.pos.z + 1.5, 0); G.player.camYaw = Math.atan2(-(h.pos.x - G.player.pos.x), -(h.pos.z - G.player.pos.z)); G.player.camPitch = 0.25; window.__step(3); });
  await frames(2); await shot('herb_world');
  await p.evaluate(() => { const G = window.__G; G.ui.open('cauldron'); G.ui.cv.add('h_fox'); G.ui.cv.add('h_hart'); for (let i = 0; i < 20; i++) G.ui.tick(0.05); });
  await frames(3); await shot('ui_cauldron');
  console.log(await p.evaluate(() => { const G = window.__G, S = window.__S(); G.ui.cv.stir = 1; G.ui.tick(0.05); for (let i = 0; i < 6; i++) G.ui.tick(0.05); return 'keen ' + S.inv.p_keen + ' lore ' + JSON.stringify(S.lore.h_fox); }));
  await frames(2); await shot('ui_cauldron2');
  await p.evaluate(() => { const G = window.__G; G.ui.open('journal', 'Codex'); G.ui.codexCat = 'Herbs'; G.ui.render(); });
  await frames(4); await shot('ui_codex');
  await p.evaluate(() => { const G = window.__G; G.ui.open('journal', 'Pack'); });
  await frames(4); await shot('ui_pack2');
  await p.evaluate(() => { const G = window.__G; G.ui.open('controls'); });
  await frames(4); await shot('ui_controls');
  await p.evaluate(() => { const G = window.__G; G.ui.close(true); const t = G.zone.terrain; const st = G.zone.stations.find((s) => s.kind === 'cauldron'); G.player.teleport(st.pos.x + 2.5, st.pos.z + 3, 0); G.player.camYaw = Math.atan2(-(st.pos.x - G.player.pos.x), -(st.pos.z - G.player.pos.z)); window.__step(3); });
  await frames(3); await shot('cauldron_world');
};
