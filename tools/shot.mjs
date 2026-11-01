// Headless screenshot + console capture using the installed Google Chrome (SwiftShader WebGL).
//   node tools/shot.mjs <url> <out.png> [--w 1280 --h 800] [--mobile] [--landscape] [--wait 2500] [--script scenario.js] [--full]
// --mobile emulates an iPhone (390x844, touch). --landscape swaps width/height.
// --script: JS run in the page after load (inside an async function) with helpers in scope:
//   L (window.__lenza, awaited ready), sleep(ms), waitFor(fn, ms), shot(name) → extra <out>-<name>.png.
// The script's return value is printed as JSON. Exits non-zero on uncaught page errors. See tools/README.md.
import path from 'node:path';
import { parseArgs, launch, openPage, runScenario } from './lib.mjs';

const { pos: [url, out], opt } = parseArgs(process.argv);
if (!url || !out) { console.log('usage: node tools/shot.mjs <url> <out.png> [--mobile] [--landscape] [--w N --h N] [--wait ms] [--script file.js] [--full]'); process.exit(2); }
let w = +(opt('w') || 1280), h = +(opt('h') || 800); const mobile = !!opt('mobile');
if (mobile) { w = 390; h = 844; } if (opt('landscape')) [w, h] = [Math.max(w, h), Math.min(w, h)];

const browser = await launch();
let errors = 0;
try {
  const ext = path.extname(out) || '.png', base = out.slice(0, out.length - ext.length), type = ext === '.jpg' ? 'jpeg' : 'png';
  const { page, report, errors: errs } = await openPage(browser, url, { w, h, mobile, wait: +(opt('wait') || 2500) });
  await page.exposeFunction('__shot', async name => { const p = `${base}-${name}${ext}`; await page.screenshot({ path: p, type }); console.log('saved ' + p); return true; });
  if (opt('script')) {
    const res = await runScenario(page, opt('script'));
    if (res !== undefined) console.log('script result:', JSON.stringify(res));
    await new Promise(r => setTimeout(r, 300));
  }
  await page.screenshot({ path: out, type, fullPage: !!opt('full') });
  console.log(`saved ${out} (${w}x${h})`);
  report(); errors = errs();
} catch (e) { console.log('[harness] ' + e.message); errors++; }
finally { await browser.close(); }
process.exit(errors ? 1 : 0);
