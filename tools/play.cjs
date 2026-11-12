// usage: node tools/play.cjs "<query>" <script.js> ; script exports async (page, shot) => {}
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [query, script] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  p.on('console', (m) => { const t = m.text(); if (!t.includes('[vite]')) console.log('[console]', t.slice(0, 400)); });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 600), (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  const used = new Set(); p.on('request', (r) => { const m = r.url().match(/\/assets\/((animals|chars|anims|weapons|nature|town|props|audio)\/[^?]+)/); if (m) used.add(decodeURIComponent(m[1])); });
  await p.goto((process.env.BASE || 'http://localhost:5173/') + query);
  const S = process.env.SHOTS || '.';
  const shot = async (name) => { await p.screenshot({ path: path.join(S, name + '.png'), timeout: 240000 }); console.log('shot', name); };
  const frames = async (n) => { const f0 = await p.evaluate(() => window.__frames || 0); await p.waitForFunction((t) => (window.__frames || 0) >= t, f0 + n, { timeout: 600000 }); };
  const snap = async (name, cam, look, fov = 40) => {
    await p.evaluate(([cam, look, fov]) => { window.__cam = { pos: cam, look, fov }; }, [cam, look, fov]);
    await frames(2); await shot(name);
    await p.evaluate(() => { window.__cam = undefined; });
  };
  const frames2 = frames;
  try { await require(path.resolve(script))(p, shot, frames, snap); } catch (e) { console.log('SCRIPT ERROR', e.message); }
  if (process.env.USED) require('fs').writeFileSync(process.env.USED, [...used].sort().join('\n'));
  await b.close();
})();
