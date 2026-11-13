module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; const G = window.__G, S = window.__S(); S.gear.pack = 'pack2'; S.flags.hint_move = true; G.player.refreshBack(); window.__step(4); G.ui.open('journal'); });
  await frames(4); await shot('ui_journal');
  await p.evaluate(() => { const G = window.__G; G.ui.open('tanner', 'Tan'); });
  await frames(4); await shot('ui_tan');
  await p.evaluate(() => { document.querySelector('#panel .row .btn').click(); });
  await frames(4); await shot('ui_scrape');
  await p.evaluate(() => { const G = window.__G; for (let i = 0; i < 400 && G.ui.miniActive; i++) { G.ui.tick(0.05); if (i % 9 === 0) window.dispatchEvent(new MouseEvent('mousedown')); } G.ui.close(true); const t = G.zone.terrain; G.player.teleport(t.town.x + 2, t.town.z + 12, Math.PI); window.__step(4); });
  const [x, y, z] = await p.evaluate(() => window.__G.player.pos.toArray());
  await snap('back_view2', [x + 1.0, y + 1.7, z + 3.4], [x, y + 1.0, z]);
};
