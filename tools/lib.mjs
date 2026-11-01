// Shared helpers for the headless tools (shot.mjs, strip.mjs).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

export const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Parse "--key value" / "--flag" options. */
export function parseArgs(argv) {
  const a = argv.slice(2);
  const pos = [];
  for (let i = 0; i < a.length; i++) { if (a[i].startsWith('--')) { if (a[i + 1] && !a[i + 1].startsWith('--')) i++; } else pos.push(a[i]); }
  const opt = k => { const i = a.indexOf('--' + k); return i < 0 ? null : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true); };
  return { pos, opt };
}

/** Helpers injected before every scenario script (see tools/README.md). */
export const PRELUDE = `
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(50); } return null; };
  const __getL = async () => { const l = window.__lenza || await waitFor(() => window.__lenza, 3000); if (!l) return null;
    const ok = await Promise.race([l.ready.then(() => true), sleep(20000).then(() => false)]); if (!ok) console.warn('[tools] __lenza.ready timed out after 20 s'); return l; };
  const L = await __getL();
  const shot = name => window.__shot ? window.__shot(String(name)) : Promise.resolve(false);
`;

export async function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required'] });
}

/** Open a page with viewport + log capture. Returns {page, logs, report()}. */
export async function openPage(browser, url, { w = 1280, h = 800, mobile = false, wait = 2500 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const logs = [], notFound = new Set(); let pageErrors = 0;
  page.on('response', r => { if (r.status() === 404) notFound.add(r.url()); });
  page.on('console', m => {
    if (!['error', 'warning', 'warn'].includes(m.type())) return;
    const t = m.text();
    if (/Failed to load resource: .*404/.test(t)) return;   // summarised below
    if (/^\[boot\] .* not present yet/.test(t)) return;       // expected while modules are being built
    if (/GL Driver Message .*ReadPixels/.test(t)) return;     // SwiftShader noise caused by the screenshot itself
    logs.push(`[${m.type()}] ${t}`);
  });
  page.on('pageerror', e => { pageErrors++; logs.push(`[pageerror] ${e.message}`); });
  page.on('requestfailed', r => { if (!notFound.has(r.url()) && !/ERR_ABORTED/.test(r.failure()?.errorText || '')) logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`); });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, wait));
  const report = () => {
    const missing = [];
    for (const u of notFound) { const p = new URL(u).pathname; if (/\/src\//.test(p)) missing.push(p); else logs.push(`[404] ${p}`); }
    if (missing.length) console.log(`[info] optional modules not present yet: ${missing.join(', ')}`);
    if (logs.length) console.log(logs.join('\n'));
    return pageErrors;
  };
  return { page, logs, report, errors: () => pageErrors };
}

/** Evaluate a scenario file (with PRELUDE) in the page. Returns its result. */
export async function runScenario(page, file, extra = '') {
  const src = fs.readFileSync(file, 'utf8');
  return page.evaluate(`(async()=>{ ${PRELUDE}\n${extra}\n${src}\n})()`);
}
