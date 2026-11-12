module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && window.__G.game.playing && !window.__G.player.frozen, null, { timeout: 300000 });
  await p.evaluate(() => { window.__pause = true; });
  await p.evaluate(() => { const G = window.__G, S = window.__S(), P = G.player; S.time = 9; S.gold = 140; S.inv = { arrow: 20, knife: 6, salt: 4, thread: 4, tonic: 1 }; S.flags.hint_move = true; S.flags.hint_sneak = true; const d = G.animals.list.find((a) => a.def.id === 'doe'); for (const a of G.animals.list) a.update = function () { this.obj.position.copy(this.pos); };
    P.teleport(d.pos.x + Math.cos(d.yaw) * 15, d.pos.z - Math.sin(d.yaw) * 15, 0); d.bones(); const dx = d.chest.x - P.pos.x, dz = d.chest.z - P.pos.z; P.camYaw = Math.atan2(-dx, -dz); P.camPitch = 0.02; P.crouching = true; window.__force.aim = true; window.__force.fire = true; window.__force.fireHit = true; window.__step(1); window.__force.fireHit = false; window.__step(40); G.ui.hintEl.classList.add('off'); });
  await frames(2); await shot('final_aim');
};
