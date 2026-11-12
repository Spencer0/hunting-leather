module.exports = async (p, shot, frames, snap) => {
  await p.waitForFunction(() => window.__G && window.__G.game && document.querySelector('#title .press'), null, { timeout: 300000 });
  await frames(3); await shot('title');
  await p.keyboard.press('Enter'); await frames(1); await shot('title_menu');
  await p.click('text=New Game'); await frames(1); await shot('title_files');
};
