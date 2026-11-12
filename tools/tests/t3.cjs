module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__G.renderer.setAnimationLoop(null); });
  const mem = async (tag) => console.log(tag, await p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6) + 'MB'));
  await mem('start');
  await p.evaluate(() => { window.__step(1); }); await mem('step1');
  await p.evaluate(() => { window.__step(10); }); await mem('step10');
  await p.evaluate(() => { const G = window.__G; for (let i = 0; i < 10; i++) G.player.update(1/30); }); await mem('player10');
  await p.evaluate(() => { const G = window.__G; for (let i = 0; i < 10; i++) G.animals.update(1/30); }); await mem('animals10');
  await p.evaluate(() => { const G = window.__G; for (let i = 0; i < 10; i++) G.game.update(1/30); }); await mem('game10');
  await snap('a', [0, 30, 150], [0, 15, 120]); await mem('snap1');
  await snap('b', [0, 30, 150], [0, 15, 120]); await mem('snap2');
};
