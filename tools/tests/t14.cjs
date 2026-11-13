module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; });
  console.log(await p.evaluate(() => {
    const G = window.__G, P = G.player, t = G.zone.terrain, out = [];
    for (const l of t.lakes) { const hs = []; for (let r = 0; r <= l.r * 2; r += l.r / 5) hs.push(t.height(l.x + r, l.z).toFixed(2)); out.push('lake r=' + l.r.toFixed(0) + ' heights ' + hs.join(' ')); }
    out.push('grounded ' + P.grounded + ' pos ' + P.pos.toArray().map((v) => v.toFixed(1)));
    return out.join('\n');
  }));
};
