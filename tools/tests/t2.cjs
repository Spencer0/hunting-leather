module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; });
  const around = async (tag) => {
    const [x, y, z, yaw] = await p.evaluate(() => { const P = window.__G.player; return [P.pos.x, P.pos.y, P.pos.z, P.yaw]; });
    const f = [Math.sin(yaw), Math.cos(yaw)], r = [Math.cos(yaw), -Math.sin(yaw)];
    await snap(tag + '_front', [x + f[0] * 3 + r[0] * 1.2, y + 1.6, z + f[1] * 3 + r[1] * 1.2], [x, y + 1.0, z]);
    await snap(tag + '_side', [x + r[0] * 3.2, y + 1.4, z + r[1] * 3.2], [x, y + 1.0, z]);
  };
  await p.evaluate(() => { window.__step(10); });
  await around('idle');
  await p.evaluate(() => { window.__force.fireHit = true; window.__force.fire = true; window.__step(1); window.__force.fireHit = false; window.__step(40); });
  await around('bowdraw');
  await p.evaluate(() => { window.__force.fire = false; window.__step(3); });
  await around('bowrelease');
  console.log(await p.evaluate(() => JSON.stringify({ shots: window.__G.shots.shots.length, arrows: window.__S().inv.arrow })));
  await p.evaluate(() => { window.__step(20); const S = window.__S(); S.active = 1; window.__force.aim = true; window.__step(20); });
  await around('xbow');
  await p.evaluate(() => { const S = window.__S(); S.active = 2; window.__step(20); });
  await around('knife');
  await p.evaluate(() => { window.__force.aim = false; window.__force.my = 1; window.__step(30); });
  await around('run');
};
