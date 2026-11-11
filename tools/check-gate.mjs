// Phone browsers get the install page, desktop browsers and installed apps get the game.
//   node tools/check-gate.mjs [port]      (node tools/serve.mjs <port> first)
import puppeteer from 'puppeteer-core';
const port = process.argv[2] || 8843, base = `http://localhost:${port}/index.html`;
import { CHROME } from './lib.mjs';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const AND = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', timeout: 120000, protocolTimeout: 120000 });
let ok = true;
const run = async (name, ua, url, wantGate, shot) => {
  const p = await b.newPage();
  if (ua) await p.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: ua });
  else await p.setViewport({ width: 1280, height: 800 });
  await p.goto(url, { waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2500));
  const r = await p.evaluate(() => ({ gate: !!document.querySelector('.ig'), first: document.querySelector('.ig-card h2')?.textContent, boot: !!document.getElementById('boot') }));
  const pass = r.gate === wantGate;
  if (!pass) ok = false;
  console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(r));
  if (shot) await p.screenshot({ path: shot, fullPage: true });
  await p.close();
};
await run('iPhone Safari', IOS, base, true, process.env.SHOT || null);
await run('Android Chrome', AND, base, true, null);
await run('iPhone with ?debug', IOS, base + '?debug', false, null);
await run('desktop', null, base, false, null);
await b.close();
console.log(ok ? 'GATE OK' : 'GATE PROBLEMS'); process.exit(ok ? 0 : 1);
