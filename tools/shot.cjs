// usage: node tools/shot.mjs out.png "query" [waitMs] [w] [h]
const { chromium } = require('playwright');
(async () => {
const [out, query = '', wait = '4000', w = '800', h = '450'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
p.on('console', (m) => console.log('[console]', m.text().slice(0, 300)));
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 400)));
await p.goto('http://localhost:5173/' + query);
await p.waitForFunction(() => window.__frames > 3, null, { timeout: 120000 }).catch((e) => console.log('wait fail', e.message));
await p.waitForTimeout(+wait);
const t0 = Date.now(); const f0 = await p.evaluate(() => window.__frames); await p.screenshot({ path: out, timeout: 180000 }); console.log('fps~', ((await p.evaluate(() => window.__frames)) - f0) / ((Date.now() - t0) / 1000));
console.log('frames', await p.evaluate(() => window.__frames));
await b.close();
})();
