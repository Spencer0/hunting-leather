module.exports = async (p, shot, frames) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing, null, { timeout: 300000 });
  await frames(6);
  await shot('g1_start');
  const info = await p.evaluate(() => { const G = window.__G; return { animals: G.animals.list.length, pos: G.player.pos.toArray().map((v) => +v.toFixed(1)), stations: G.zone.stations.map((s) => s.kind), tris: G.renderer.info.render.triangles, calls: G.renderer.info.render.calls }; });
  console.log(JSON.stringify(info));
};
