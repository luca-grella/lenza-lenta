// Headless screenshot + console capture using the installed Google Chrome.
// node tools/shot.mjs <url> <out.png> [--w 1280 --h 800 --mobile --landscape --wait 3000 --script scenario.js]
// --mobile emulates an iPhone (390x844, DPR 3, touch). --script: JS file evaluated in the page after load
// (it may be async and may use window.__lenza debug hooks). Prints console errors/warnings and exits non-zero on page errors.
import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const a = process.argv.slice(2); const url = a[0], out = a[1];
const opt = k => { const i = a.indexOf('--' + k); return i < 0 ? null : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true); };
let w = +(opt('w') || 1280), h = +(opt('h') || 800); const mobile = !!opt('mobile');
if (mobile) { w = 390; h = 844; } if (opt('landscape')) [w, h] = [Math.max(w, h), Math.min(w, h)];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check'] });
const logs = []; let pageErrors = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => { pageErrors++; logs.push(`[pageerror] ${e.message}`); });
  page.on('requestfailed', r => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, +(opt('wait') || 2500)));
  const sc = opt('script');
  if (sc) { const res = await page.evaluate(`(async()=>{ ${fs.readFileSync(sc, 'utf8')} })()`); if (res !== undefined) console.log('script result:', JSON.stringify(res)); await new Promise(r => setTimeout(r, 800)); }
  await page.screenshot({ path: out, type: out.endsWith('.jpg') ? 'jpeg' : 'png' });
  console.log(`saved ${out} (${w}x${h})`);
} catch (e) { logs.push('[harness] ' + e.message); pageErrors++; }
finally { await browser.close(); }
if (logs.length) console.log(logs.join('\n'));
process.exit(pageErrors ? 1 : 0);
