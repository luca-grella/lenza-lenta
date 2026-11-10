// Serves the repo under two folders like GitHub Pages (/lenza-lenta/ and /lenza-lenta-v2/), opens both, checks that
// each service worker installs its own cache and that /lenza-lenta/archivio/v1/ shows the "archived" page.
//   node tools/check-sw.mjs        (npm install in tools/ first)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const m = decodeURIComponent(req.url.split('?')[0]).match(/^\/lenza-lenta(?:-v2)?(\/.*)$/);
  if (!m) { res.writeHead(404); return res.end(); }
  let f = path.join(ROOT, m[1]); if (f.endsWith('/')) f += 'index.html';
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', timeout: 120000 });
const page = await browser.newPage();
let ok = true;
for (const dir of ['lenza-lenta', 'lenza-lenta-v2']) {
  await page.goto(`http://localhost:${port}/${dir}/?sw`, { waitUntil: 'load', timeout: 120000 });
  const r = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; await new Promise(r => setTimeout(r, 4000)); return { scope: reg.scope, title: document.title, caches: await caches.keys() }; });
  console.log(dir, JSON.stringify(r));
}
const keys = await page.evaluate(() => caches.keys());
const want = ['/lenza-lenta/', '/lenza-lenta-v2/'];
for (const w of want) if (!keys.some(k => k.endsWith(w))) { ok = false; console.log('MISSING cache for', w); }
await page.goto(`http://localhost:${port}/lenza-lenta/archivio/v1/`, { waitUntil: 'load' });
const v1 = await page.evaluate(() => document.body?.innerText.trim());
console.log('v1:', JSON.stringify(v1));
if (!/archivio/.test(v1 || '')) ok = false;
await browser.close(); server.close();
console.log(ok ? 'SW OK' : 'SW PROBLEMS'); process.exit(ok ? 0 : 1);
