// Real-touch playtest harness: plays Lenza Lenta like a person on an iPhone.
//   node tools/play.mjs <scenario.mjs> [--landscape] [--port 8810 | --url URL] [--params "debug&intro&tips"]
//                       [--out tmp/play/<name>] [--speed 1] [--quality high] [--lang it] [--headful]
// A scenario is an ES module: `export default async function (play) { ... }` (optional `export const options = {...}`
// with the same keys as the CLI flags). Every input goes through CDP Input.dispatchTouchEvent on the real UI
// (virtual joystick, action button, buttons, dialog box); the debug hooks are only used to advance the simulation
// (headless rAF is not reliable) and to read state. See tools/play-README.md.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { CHROME } from './lib.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const FPS = 60;
const JOY_R = 54;            // knob travel in px (src/ui/controls.js R)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ───────────────────────────── in-page helpers (serialised into the page as window.__play) ─────────────────────────────
function installHelpers() {
  const CLICKABLE = 'button, a, [role=button], .btn, .dlg-choice, .lang-btn, .pop-row, .toast.tappable, .banner, .dialog, .tip-ok, .goal, .pill';
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = el => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    return el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
  };
  const desc = el => {
    if (!el) return null;
    if (el.nodeType !== 1) el = el.parentElement;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
    const txt = norm(el.innerText || el.textContent).slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
  };
  const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
  const L = () => window.__lenza;
  const P = {
    describeAt(x, y) { return desc(document.elementFromPoint(x, y)); },
    /** True when the element on top at x,y is `sel` or inside it. */
    hits(x, y, sel) { const e = document.elementFromPoint(x, y); return !!(e && e.closest(sel)); },
    find(q, o = {}) {
      let el = null, n = 0;
      if (o.sel) {
        const all = [...document.querySelectorAll(q)].filter(visible); n = all.length;
        el = all[o.index || 0] || null;
      } else {
        const want = norm(q).toLowerCase();
        const all = [...document.body.querySelectorAll('*')].filter(e => {
          if (e.closest('canvas, svg, script, style')) return false;
          const t = norm(e.innerText).toLowerCase();
          return (o.exact ? t === want : t.includes(want)) && visible(e);
        });
        n = all.length;
        all.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return ra.width * ra.height - rb.width * rb.height; });
        el = all[o.index || 0] || null;
        if (el) el = el.closest(CLICKABLE) || el;
      }
      if (!el) return null;
      const c = center(el);
      return { ...c, desc: desc(el), matches: n, top: desc(document.elementFromPoint(c.x, c.y)), covered: !el.contains(document.elementFromPoint(c.x, c.y)) };
    },
    buttons() { return [...document.querySelectorAll('button, .btn, [role=button]')].filter(visible).map(e => norm(e.innerText) || e.getAttribute('aria-label') || desc(e)).slice(0, 40); },
    /** A finger spot inside the joystick zone (bottom-left thumb), clamped so the floating base is not clamped. */
    /** Candidate thumb spots: the joystick ghost (where the game invites the thumb), then spots spread over the zone. */
    thumbs(fx, fy) {
      const z = document.querySelector('.joy-zone');
      if (!z || !visible(z)) return null;
      const r = z.getBoundingClientRect(), m = 54 + 10;
      const cl = (x, y) => ({ x: Math.max(r.left + m, Math.min(r.right - m, x)), y: Math.max(r.top + m, Math.min(r.bottom - m, y)) });
      const out = [];
      // the dashed ghost stick shows where to put the thumb; it fades out after the first use but keeps its box
      const g = document.querySelector('.joy-ghost');
      if (g && g.getBoundingClientRect().width > 0) { const c = center(g); out.push({ ...cl(c.x, c.y), src: 'ghost spot' }); }
      for (const [a, b] of [[fx, fy], [fx, 0.9], [0.3, 0.95], [0.6, 0.85], [fx, 0.55], [0.7, 0.4]]) out.push({ ...cl(r.left + r.width * a, r.top + r.height * b), src: `zone ${a},${b}` });
      return out.map(p => ({ ...p, top: desc(document.elementFromPoint(p.x, p.y)), ok: !!document.elementFromPoint(p.x, p.y)?.closest('.joy-zone') }));
    },
    /** World point → CSS px on screen, through the real camera. */
    project(x, y, z) {
      const c = L().ctx, v = new (L().THREE.Vector3)(x, y, z);
      c.camera.updateMatrixWorld(); v.project(c.camera);
      const r = c.renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, behind: v.z > 1 };
    },
    /** Player position + the unit screen direction (px, y down) that moves it toward x,z (via the camera). */
    walkProbe(tx, tz, seg) {
      const c = L().ctx, p = c.player.position, w = c.world;
      const dist = Math.hypot(tx - p.x, tz - p.z);
      // steer at the target, or (seg = [ax, az, lookahead]) at a carrot on the planned segment A→target:
      // pure pursuit keeps the walker on the planned line (narrow ramps, gangways) instead of cutting corners
      let ax = tx, az = tz;
      if (seg) {
        const [sx0, sz0, look] = seg, Lx = tx - sx0, Lz = tz - sz0, LL = Math.hypot(Lx, Lz);
        if (LL > 1e-3) {
          const t = ((p.x - sx0) * Lx + (p.z - sz0) * Lz) / LL, along = Math.min(LL, Math.max(0, t) + look);
          ax = sx0 + Lx / LL * along; az = sz0 + Lz / LL * along;
        }
      }
      const dx = ax - p.x, dz = az - p.z, dd = Math.hypot(dx, dz);
      let sx = 0, sy = 0;
      if (dd > 1e-3) {
        const k = 1.5 / dd;
        const a = P.project(p.x, p.y, p.z), b = P.project(p.x + dx * k, p.y, p.z + dz * k);
        const m = Math.hypot(b.x - a.x, b.y - a.y) || 1; sx = (b.x - a.x) / m; sy = (b.y - a.y) / m;
      }
      const water = !!w?.isWater?.(p.x, p.z), gy = w?.groundY?.(p.x, p.z);
      return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), dist, sx, sy, water, wet: water && p.y < (w?.waterLevel ?? 0) + 0.25, groundY: Number.isFinite(gy) ? +gy.toFixed(2) : null,
        zone: w?.zoneAt?.(p.x, p.z) ?? null, enabled: c.input.enabled, pstate: c.player.state, joy: { x: +c.input.moveScreen.x.toFixed(2), y: +c.input.moveScreen.y.toFixed(2) } };
    },
    /**
     * Can a walker go in a straight line from a to b? Simulated with the game's own movement solver
     * (world.resolveMove: colliders, wading, climb/drop step rules) in small steps, with a fatter body than the
     * player (clearance) so a thumb that drifts a little still gets through. Never moves anything.
     */
    segOK(ax, az, bx, bz, rad = 0.5, allowWater = false) {
      const w = L().ctx.world, wl = w.waterLevel ?? 0, d = Math.hypot(bx - ax, bz - az);
      if (d < 1e-6) return true;
      const n = Math.max(1, Math.ceil(d / 0.15)), ux = (bx - ax) / d, uz = (bz - az) / d, seg = d / n;
      let x = ax, z = az;
      for (let i = 1; i <= n; i++) {
        const tx = ax + ux * seg * i, tz = az + uz * seg * i;
        const r = w.resolveMove({ x, z }, { x: tx, z: tz }, rad);
        if (!r || r.blocked || Math.hypot(r.x - tx, r.z - tz) > 0.02) return false;
        // shallow sea (under WALK.WADE) is "walkable" for the solver; a planned route stays dry unless allowWater
        if (!allowWater && w.isWater(tx, tz) && w.groundY(tx, tz) <= wl + 0.3) return false;
        x = tx; z = tz;
      }
      return true;
    },
    /**
     * Route planner (planning only: the walking is done by touch). A* on a grid whose edges are tested with
     * segOK (the real movement solver), so buildings, props, the shore line and dock steps/ramps are respected,
     * then shortened by line of sight (also through the solver). o: step (cell, 1 u), clearance (0.5), margin (24),
     * allowWater. Returns {ok, points:[[x,z]...], length, goalMoved} or {ok:false, reason, closest:[x,z]}.
     */
    plan(sx, sz, gx, gz, o = {}) {
      const step = o.step || 1, rad = o.clearance ?? 0.5, margin = o.margin ?? 24, aw = !!o.allowWater;
      const seg = (a, b) => P.segOK(a[0], a[1], b[0], b[1], rad, aw);
      const x0 = Math.min(sx, gx) - margin, z0 = Math.min(sz, gz) - margin;
      const W = Math.ceil((Math.max(sx, gx) + margin - x0) / step) + 1, H = Math.ceil((Math.max(sz, gz) + margin - z0) / step) + 1;
      const N = W * H, cx = k => x0 + (k % W) * step, cz = k => z0 + Math.floor(k / W) * step;
      const cellOf = (x, z) => { const i = Math.round((x - x0) / step), j = Math.round((z - z0) / step); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
      const START = N, GOAL = N + 1;   // virtual nodes for the exact start/goal points
      const pos = k => (k === START ? [sx, sz] : k === GOAL ? [gx, gz] : [cx(k), cz(k)]);
      const gS = new Float64Array(N + 2).fill(Infinity), from = new Int32Array(N + 2).fill(-1), closed = new Uint8Array(N + 2);
      // binary heap of [f, node]
      const heap = [];
      const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
      const hh = k => { const p = pos(k); return Math.hypot(p[0] - gx, p[1] - gz); };
      // goal: reachable from the cells around it (the exact point may be inside a prop: then the nearest cell that
      // connects is used and goalMoved is set)
      const gc = cellOf(gx, gz), goalLinks = new Map();
      if (gc >= 0) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const k = gc + dj * W + di; if (k < 0 || k >= N) continue;
        const p = pos(k); if (Math.hypot(p[0] - gx, p[1] - gz) <= 2.2 * step && seg(p, [gx, gz])) goalLinks.set(k, Math.hypot(p[0] - gx, p[1] - gz));
      }
      gS[START] = 0; push(hh(START), START);
      let found = -1, iter = 0, bestK = START, bestH = hh(START);
      const sc = cellOf(sx, sz);
      while (heap.length && iter++ < (o.maxIter || 120000)) {
        const [, k] = pop();
        if (closed[k]) continue; closed[k] = 1;
        if (k === GOAL) { found = GOAL; break; }
        const hk = hh(k); if (hk < bestH) { bestH = hk; bestK = k; }
        const p = pos(k), nb = [];
        if (k === START) { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const n = sc + dj * W + di; if (sc >= 0 && n >= 0 && n < N) nb.push(n); } }
        else {
          const i = k % W;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ii = i + di, n = k + dj * W + di; if (ii >= 0 && ii < W && n >= 0 && n < N) nb.push(n); }
          if (goalLinks.has(k)) nb.push(GOAL);
        }
        if (k === START && Math.hypot(sx - gx, sz - gz) < 2.5 * step) nb.push(GOAL);
        for (const n of nb) {
          if (closed[n]) continue;
          const q = pos(n), c = Math.hypot(q[0] - p[0], q[1] - p[1]);
          const ng = gS[k] + c;
          if (ng >= gS[n]) continue;
          if (!seg(p, q)) continue;
          gS[n] = ng; from[n] = k; push(ng + hh(n), n);
        }
      }
      const chain = end => { const out = []; for (let k = end; k >= 0; k = from[k]) out.push(pos(k)); return out.reverse(); };
      let goalMoved = false, end = found;
      if (found < 0 && bestK !== START && bestH <= (o.goalSlack ?? 1.2)) { end = bestK; goalMoved = true; }   // goal inside a prop: stop next to it
      else if (found < 0) {
        // the goal itself is not reachable: say so, with the closest point the solver could reach
        const c = pos(bestK);
        return { ok: false, reason: iter >= (o.maxIter || 120000) ? 'search too large (raise maxIter/step?)' : 'no walkable path (with the game movement rules)', closest: [+c[0].toFixed(2), +c[1].toFixed(2)], closestDist: +bestH.toFixed(2), explored: iter };
      }
      const cells = chain(end);
      // line-of-sight shortening, through the solver too
      // a shortcut must also hold for a walker 0.2 u to either side of it (a thumb never tracks a line exactly):
      // otherwise the route keeps the corner cells (narrow ramps and gangways are approached square-on)
      const wide = (a, b) => {
        if (!seg(a, b)) return false;
        const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1, nx = -dz / d * 0.2, nz = dx / d * 0.2;
        return seg([a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz]) && seg([a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz]);
      };
      const pts = [cells[0]];
      let a = cells[0];
      for (let k = 2; k < cells.length; k++) if (!wide(a, cells[k])) { a = cells[k - 1]; pts.push(a); }
      pts.push(cells[cells.length - 1]);
      const w = L().ctx.world;
      return { ok: true, points: pts.slice(1).map(p => [+p[0].toFixed(2), +p[1].toFixed(2), +w.groundY(p[0], p[1]).toFixed(2)]), length: +gS[end].toFixed(1), goalMoved, explored: iter };
    },
    state() {
      const c = L()?.ctx; if (!c) return { ready: false };
      const root = document.getElementById('ui');
      const p = c.player?.position, w = c.world, cur = c.systems?.interact?.current;
      const texts = sel => [...document.querySelectorAll(sel)].filter(visible).map(e => norm(e.innerText)).filter(Boolean);
      const dlgEl = document.querySelector('.dialog-host .dialog:not(.bye)');
      return {
        t: +c.loop.t.toFixed(2), frame: c.loop.frame, time: c.time?.format?.(), lang: c.i18n?.lang,
        player: p ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), facing: +(c.player.facing ?? 0).toFixed(2), state: c.player.state } : null,
        zone: p ? w?.zoneAt?.(p.x, p.z) ?? null : null,
        // isWater() is also true under a dock: overWater = sea below, inWater = feet actually in the sea (no deck under them)
        overWater: p ? !!w?.isWater?.(p.x, p.z) : null,
        inWater: p ? !!w?.isWater?.(p.x, p.z) && p.y < (w?.waterLevel ?? 0) + 0.25 : null,
        groundY: p && Number.isFinite(w?.groundY?.(p.x, p.z)) ? +w.groundY(p.x, p.z).toFixed(2) : null,
        ui: root ? root.className : null,
        intro: !!c.ui?.intro?.open, sheet: c.ui?.currentSheet || null,
        dialog: dlgEl ? { name: norm(dlgEl.querySelector('.dlg-name')?.innerText), text: norm(dlgEl.querySelector('.dlg-text')?.innerText), choices: texts('.dlg-choice'), visible: visible(dlgEl) && dlgEl.classList.contains('in') } : null,
        camera: c.cameraRig?.mode, inputEnabled: c.input?.enabled, isTouch: c.input?.isTouch,
        interact: cur ? { kind: cur.kind, label: cur.label || (cur.labelKey ? c.i18n.t(cur.labelKey, cur.labelVars) : ''), id: cur.id } : null,
        action: { label: norm(document.querySelector('.act-label')?.innerText), shown: !!document.querySelector('.act:not(.idle)') },
        fishing: c.systems?.fishing ? { state: c.systems.fishing.state, tension: c.systems.fishing.reel ? +(+c.systems.fishing.reel.tensionN || 0).toFixed(2) : null, progress: c.systems.fishing.reel ? +(+c.systems.fishing.reel.progress || 0).toFixed(2) : null } : null,
        toasts: texts('.toast'), banners: texts('.banner'), zoneTitle: texts('.zone-title').join(' ') || null, tips: texts('.tip'),
        goal: texts('.goal').join(' ') || null, coins: c.save?.state?.coins, basket: (c.save?.state?.basket || []).length,
        errors: L().errors.length,
      };
    },
    /** Visible leaf text boxes and the pairs that overlap (different components). */
    overlaps(minArea = 30) {
      const boxes = [];
      for (const e of document.querySelectorAll('#ui *')) {
        if (!visible(e) || e.children.length && [...e.childNodes].every(n => n.nodeType !== 3 || !n.textContent.trim())) continue;
        if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const comp = e.closest('.toast, .banner, .zone-title, .tip, .goal, .dialog, .sheet, .reel, .act-wrap, .pill, .wl, .intro, .hud-right, .hud-left') || e;
        const r = e.getBoundingClientRect();
        boxes.push({ e, comp, r, text: norm(e.innerText).slice(0, 40) });
      }
      const out = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.comp === b.comp || a.comp.contains(b.comp) || b.comp.contains(a.comp)) continue;
        // intersection clipped to the screen (labels half off-screen only count where they are visible)
        const w = Math.min(a.r.right, b.r.right, innerWidth) - Math.max(a.r.left, b.r.left, 0), h = Math.min(a.r.bottom, b.r.bottom, innerHeight) - Math.max(a.r.top, b.r.top, 0);
        if (w > 0 && h > 0 && w * h >= minArea) out.push({ a: desc(a.comp) + ' :: ' + a.text, b: desc(b.comp) + ' :: ' + b.text, area: Math.round(w * h) });
      }
      return out;
    },
  };
  window.__play = P;
  return true;
}

// ───────────────────────────── Play ─────────────────────────────
export async function createPlay(o = {}) {
  const landscape = !!o.landscape;
  const W = landscape ? 844 : 390, H = landscape ? 390 : 844;
  const port = o.port || 8810;
  let params = o.params ?? 'debug&intro&tips';
  if (o.quality) params += `&quality=${o.quality}`;
  const target = o.url || `http://localhost:${port}/index.html?${params}`;
  const out = path.resolve(o.out || path.join(ROOT, 'tmp/play/run'));
  fs.mkdirSync(out, { recursive: true });
  let speed = o.speed === undefined ? 1 : +o.speed;   // 1 = real time pacing; 0/Infinity = as fast as possible

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: o.headful ? false : 'new',
    protocolTimeout: 900000,   // the machine may be shared by several headless Chromes: a SwiftShader screenshot can take a minute
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--disable-frame-rate-limit', `--window-size=${W},${H + 120}`],
  });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: landscape }, userAgent: IOS_UA });

  const consoleLog = [], logLines = [];
  let pageErrors = 0;
  page.on('console', m => {
    const ty = m.type(); if (!['error', 'warning', 'warn'].includes(ty)) return;
    const t = m.text();
    if (/GL Driver Message .*ReadPixels/.test(t) || /GPU stall due to ReadPixels/.test(t)) return;
    consoleLog.push(`[${ty}] ${t}`);
  });
  page.on('pageerror', e => { pageErrors++; consoleLog.push(`[pageerror] ${e.message}`); });
  page.on('requestfailed', r => { const e = r.failure()?.errorText || ''; if (!/ERR_ABORTED/.test(e)) consoleLog.push(`[requestfailed] ${r.url()} ${e}`); });
  page.on('response', r => { if (r.status() >= 400) consoleLog.push(`[http ${r.status()}] ${new URL(r.url()).pathname}`); });

  const t0 = Date.now();
  await page.goto(target, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__lenza && window.__lenza.isReady, { timeout: 300000, polling: 250 });
  await page.evaluate(() => window.__lenza.freeze(true));
  await page.evaluate(installHelpers);
  const cdp = await page.target().createCDPSession();

  const active = new Map(); // touch id -> {x, y}
  let nextId = 1, shotN = 0;
  const checks = [], issues = new Map(); // issue text -> count
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const P = (name, ...a) => page.evaluate((n, args) => window.__play[n](...args), name, a);
  const simT = () => page.evaluate(() => window.__lenza.ctx.loop.t);

  const play = {
    page, cdp, browser, out, url: target, landscape, width: W, height: H, checks, issues,
    /** Default language for onboard() (--lang, 'it'). */
    lang: o.lang === 'en' ? 'en' : 'it',
    /** strictThumb: never move the thumb away from a covered joystick spot (reproduce the "dead stick" exactly). */
    strictThumb: !!o.strictThumb,
    /** Record a finding seen while playing (deduplicated, listed in the summary). Not a failure by itself. */
    async issue(text) {
      const n = issues.get(text) || 0; issues.set(text, n + 1);
      if (!n) await play.log('[issue] ' + text);
    },

    /** Print (and keep in log.txt) with the simulation time. */
    async log(...a) {
      const t = await simT().catch(() => 0);
      const line = `[t=${t.toFixed(2)}] ` + a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
      console.log(line); logLines.push(line);
    },
    /** Record a check (does not throw). The run fails (exit 1) if any check fails. */
    async expect(cond, msg, extra) {
      checks.push({ ok: !!cond, msg, extra });
      await play.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`, ...(extra !== undefined ? [extra] : []));
      return !!cond;
    },
    /** Evaluate a function in the page (window.__lenza = L available as window.__lenza). */
    eval: ev,

    // ── time ──
    /**
     * Advance the game n frames of 1/60 s (no render), in chunks, sleeping so wall time ≈ game time
     * (UI setTimeouts, CSS transitions and rAF callbacks then line up as on a phone). opts.render renders at the end.
     */
    async step(n = 1, opts = {}) {
      const chunk = opts.chunk || 6;
      while (n > 0) {
        const k = Math.min(chunk, n); n -= k;
        const w0 = Date.now();
        await page.evaluate(k => window.__lenza.advance(k), k);
        if (speed > 0 && Number.isFinite(speed)) { const left = (k / FPS) * 1000 / speed - (Date.now() - w0); if (left > 1) await sleep(left); }
      }
      if (opts.render) await page.evaluate(() => window.__lenza.render());
    },
    /** Change the pacing mid-run (e.g. 0 for a long walk, back to 1 before a timed UI check). */
    setSpeed(v) { speed = +v; },
    /** Advance s seconds of game time. */
    wait(s) { return play.step(Math.round(s * FPS)); },
    /**
     * Step until pred() (a function evaluated in the page, gets L = window.__lenza) is truthy.
     * Returns the value, or null after timeout seconds of game time.
     */
    async waitFor(pred, { timeout = 10, every = 6, arg } = {}) {
      const src = typeof pred === 'function' ? pred.toString() : `() => (${pred})`;
      for (let f = 0; f <= timeout * FPS; f += every) {
        const v = await page.evaluate(`(${src})(window.__lenza, ${JSON.stringify(arg ?? null)})`);
        if (v) return v;
        await play.step(every);
      }
      return null;
    },

    // ── raw touch (CDP Input.dispatchTouchEvent; several fingers supported) ──
    async touchStart(x, y) {
      const id = nextId++; active.set(id, { x, y });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...active].map(([i, p]) => ({ x: p.x, y: p.y, id: i, radiusX: 8, radiusY: 8, force: 1 })) });
      return id;
    },
    async touchMove(id, x, y) {
      if (!active.has(id)) return;
      active.set(id, { x, y });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...active].map(([i, p]) => ({ x: p.x, y: p.y, id: i, radiusX: 8, radiusY: 8, force: 1 })) });
    },
    async touchEnd(id) {
      const p = active.get(id); if (!p) return;
      active.delete(id);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p.x, y: p.y, id }] });  // releases only this finger
    },
    async releaseAll() { for (const id of [...active.keys()]) await play.touchEnd(id); },

    /** What element is on top at x,y (what a finger would hit). */
    hitAt: (x, y) => P('describeAt', x, y),

    // ── taps ──
    /** Real tap at CSS px x,y. Returns the element description that received it. */
    async tap(x, y, { hold = 0.08, after = 0.15 } = {}) {
      const hit = await play.hitAt(x, y);
      const id = await play.touchStart(x, y);
      await play.step(Math.max(1, Math.round(hold * FPS)));
      await play.touchEnd(id);
      await play.step(Math.max(1, Math.round(after * FPS)));
      if (play.verbose) await play.log(`tap ${Math.round(x)},${Math.round(y)} → ${hit}`);
      return hit;
    },
    /** Locate a visible element by its text (case-insensitive substring; {exact:true} for whole text). */
    findText: (text, o = {}) => P('find', text, { exact: !!o.exact, index: o.index }),
    findSel: (sel, o = {}) => P('find', sel, { sel: true, index: o.index }),
    async _tapFound(found, what, o) {
      if (!found) {
        if (o.optional) return null;
        const btns = await P('buttons');
        throw new Error(`tap: nothing visible matches ${what}. Visible buttons: ${JSON.stringify(btns)}`);
      }
      if (found.covered) await play.issue(`${what} (${found.desc}) is covered by ${found.top} — tapped anyway, as a finger would`);
      const hit = await play.tap(found.x, found.y, o);
      await play.log(`tap ${what} → ${hit}`);
      return found;
    },
    /** Tap the visible element whose text contains `text` (buttons preferred). Throws if none unless {optional:true}. */
    async tapText(text, o = {}) { return play._tapFound(await play.findText(text, o), JSON.stringify(text), o); },
    /** Tap the first visible element matching a CSS selector. */
    async tapSel(sel, o = {}) { return play._tapFound(await play.findSel(sel, o), sel, o); },

    // ── action button / any element held down ──
    async _locate(t) {
      if (!t || t === 'action') return play.findSel('.act');
      if (/^[.#[]|^[a-z]+[.#[ >]|^[a-z]+$/i.test(t) && !/\s{2}/.test(t)) { const s = await play.findSel(t).catch(() => null); if (s) return s; }
      return play.findText(t);
    },
    /** Put a finger down on the action button (or a selector/text) and keep it there. Returns the touch id. */
    async press(t = 'action') {
      const f = await play._locate(t);
      if (!f) throw new Error(`press: ${t} not visible (buttons: ${JSON.stringify(await P('buttons'))})`);
      if (f.covered) await play.issue(`press ${t} (${f.desc}): covered by ${f.top}`);
      return play.touchStart(f.x, f.y);
    },
    release: id => play.touchEnd(id),
    /** Hold the action button (or selector/text) for `seconds` of game time, then lift the finger. */
    async hold(t = 'action', seconds = 1) {
      const id = await play.press(t);
      await play.step(Math.max(1, Math.round(seconds * FPS)));
      await play.touchEnd(id);
      await play.step(2);
    },

    // ── joystick ──
    thumbAt: landscape ? [0.3, 0.62] : [0.38, 0.72],
    /** Finger down in the joystick zone. Returns {id, x, y} (the stick base). */
    async joyDown() {
      const cands = await P('thumbs', ...play.thumbAt);
      if (!cands) throw new Error('joystick zone not visible (UI busy or HUD hidden?) state=' + JSON.stringify(await play.state()));
      let th = cands.find(c => c.ok);
      if (!cands[0].ok) {
        // a real thumb would land on whatever covers the stick: report it as a finding, then move the thumb (as a player would)
        await play.issue(`joystick spot (${cands[0].src}) at ${Math.round(cands[0].x)},${Math.round(cands[0].y)} is covered by ${cands[0].top}`);
        if (play.strictThumb || !th) th = cands[0];
      }
      const id = await play.touchStart(th.x, th.y);
      play._joy = { id, x: th.x, y: th.y };
      return play._joy;
    },
    /** Move the held stick: dx, dy in -1..1 of the knob travel, screen axes (dx>0 right, dy>0 DOWN the screen). */
    async joyMove(dx, dy) {
      const j = play._joy; if (!j) return;
      const m = Math.hypot(dx, dy), k = m > 1 ? 1 / m : 1;
      await play.touchMove(j.id, j.x + dx * k * JOY_R, j.y + dy * k * JOY_R);
    },
    async joyUp() { const j = play._joy; if (!j) return; play._joy = null; await play.touchEnd(j.id); },
    /** Drag the floating joystick toward (dx, dy) for `seconds`, then release. */
    async joy(dx, dy, seconds = 1) {
      await play.joyDown();
      // a thumb slides out over a few frames
      for (const f of [0.35, 0.7, 1]) { await play.joyMove(dx * f, dy * f); await play.step(1); }
      await play.step(Math.max(0, Math.round(seconds * FPS) - 3));
      await play.joyUp();
      await play.step(2);
    },

    /**
     * Walk to world x,z using ONLY the joystick (closed loop through the real camera projection).
     * opts: tolerance (u, 0.6), timeout (game s, 40), avoid (sidestep when stuck, false), slow (start easing at this distance, 1.8),
     *       tapDialogs (tap through a dialogue that opens on the way instead of stopping, false),
     *       stuckTime (s without 0.25 u of progress, 1.5), sample (path sample period s, 0.5), label.
     * Returns {ok, reason:'arrived'|'stuck'|'timeout'|'ui-blocked', pos, dist, time, path:[[x,z,y,flag]], wetSamples, zones}.
     */
    async walkTo(x, z, o = {}) {
      const tol = o.tolerance ?? 0.6, timeout = o.timeout ?? 40, slow = o.slow ?? 1.8, stuckTime = o.stuckTime ?? 1.5, every = 3;
      const path = [], zones = [];
      const seg = o.from ? [o.from[0], o.from[1], o.lookahead ?? 0.7] : null;
      let s = await P('walkProbe', x, z, seg);
      const t0 = s && (await simT());
      let t = 0, lastSample = -1, best = s.dist, bestT = 0, sidesteps = 0, dialogsSeen = 0, reason = 'timeout', side = null, sideUntil = 0, wet = 0;
      const rec = st => { const fl = st.wet ? 'wet' : st.water ? 'over-water' : ''; path.push([st.x, st.z, st.y, fl].filter(v => v !== '')); if (st.wet) wet++; if (st.zone && zones[zones.length - 1] !== st.zone) zones.push(st.zone); };
      rec(s);
      await play.joyDown();
      try {
        while (t < timeout) {
          // arrived = close enough AND at the planned height (on the ramp, not beside/under it)
          if (s.dist <= tol && (o.y == null || Math.abs(s.y - o.y) < 0.35)) { reason = 'arrived'; break; }
          if (!s.enabled) {
            // a dialogue popped up mid-walk (quest, villager…): with {tapDialogs:true} tap through it and keep walking
            if (o.tapDialogs && dialogsSeen < 3) {
              dialogsSeen++; await play.joyUp();
              await play.log(`walkTo: dialogue on the way: ${JSON.stringify((await play.state()).dialog)}`);
              await play.tapThroughDialogs({ firstWait: 1 });
              await play.joyDown(); s = await P('walkProbe', x, z, seg); bestT = t; continue;
            }
            reason = 'ui-blocked'; break;
          }
          let dx = s.sx, dy = s.sy;
          const mag = clamp(s.dist / slow, o.minMag ?? 0.5, 1);
          if (side && t < sideUntil) { dx = -s.sy * side; dy = s.sx * side; }
          else side = null;
          await play.joyMove(dx * (side ? 1 : mag), dy * (side ? 1 : mag));
          await play.step(every);
          t += every / FPS;
          s = await P('walkProbe', x, z, seg);
          if (t - lastSample >= (o.sample ?? 0.5)) { lastSample = t; rec(s); }
          if (s.dist < best - 0.25) { best = s.dist; bestT = t; }
          else if (t - bestT > stuckTime && !side) {
            if (o.avoid && sidesteps < (o.maxSidesteps ?? 6)) { sidesteps++; side = sidesteps % 2 ? 1 : -1; sideUntil = t + 0.4 + 0.2 * sidesteps; bestT = t; }
            else { reason = 'stuck'; break; }
          }
        }
      } finally { await play.joyUp(); }
      await play.step(12);   // let the player decelerate
      s = await P('walkProbe', x, z, seg);
      rec(s);
      if (reason === 'timeout' && s.dist <= tol && (o.y == null || Math.abs(s.y - o.y) < 0.35)) reason = 'arrived';
      const r = { ok: reason === 'arrived', reason, target: [x, z], pos: [s.x, s.z, s.y], dist: +s.dist.toFixed(2), time: +((await simT()) - t0).toFixed(2), wetSamples: wet, zones, sidesteps, path };
      await play.log(`walkTo ${o.label ? o.label + ' ' : ''}(${x}, ${z}) → ${r.reason} at (${s.x}, ${s.z}) y=${s.y} dist ${r.dist} in ${r.time}s${wet ? ` [in water ${wet} samples]` : ''} zones ${zones.join('>')}`);
      return r;
    },
    /**
     * Turn the player toward world x,z with a short, light push of the stick (what a thumb does to face a villager,
     * the sea, a bench). o: seconds (0.2), mag (0.3 of the knob travel). The player may shuffle a few cm.
     */
    async face(x, z, o = {}) {
      const s = await P('walkProbe', x, z);
      if (s.dist < 0.05) return s;
      await play.joy(s.sx * (o.mag ?? 0.3), s.sy * (o.mag ?? 0.3), o.seconds ?? 0.2);
      await play.step(6);
      return P('walkProbe', x, z);
    },
    /** Walk through waypoints [[x,z], ...] with the joystick. Stops at the first failure. */
    async walkPath(points, o = {}) {
      const legs = [];
      for (let i = 0; i < points.length; i++) {
        const last = i === points.length - 1;
        const r = await play.walkTo(points[i][0], points[i][1], { ...o, y: points[i][2], from: i ? points[i - 1] : o.from, tolerance: last ? (o.tolerance ?? 0.6) : (o.waypointTolerance ?? 0.5), slow: last ? o.slow : 0.01, label: `${o.label || 'path'} ${i + 1}/${points.length}` });
        legs.push(r);
        if (!r.ok) return { ok: false, reason: r.reason, failedAt: i, legs, pos: r.pos, wetSamples: legs.reduce((a, l) => a + l.wetSamples, 0) };
      }
      const lastLeg = legs[legs.length - 1];
      return { ok: true, reason: 'arrived', legs, pos: lastLeg?.pos, wetSamples: legs.reduce((a, l) => a + l.wetSamples, 0) };
    },
    /** Plan a route on world.walkable (A*, planning only) and walk it with the joystick. */
    async goTo(x, z, o = {}) {
      // coarse and roomy first (1 u cells, body 0.5 u: easy to follow with a thumb), then finer for narrow ramps,
      // gangways and decks (0.5 u cells, body down to 0.37 u = the player's 0.35 + a hair). o.plan pins one setting.
      const tiers = o.plan?.step || o.plan?.clearance ? [o.plan] : [{ step: 1, clearance: 0.5 }, { step: 0.5, clearance: 0.42 }, { step: 0.5, clearance: 0.37 }];
      const legs = [];
      let r = null, pl = null, wet = 0;
      // a leg that gets stuck is re-planned from where the player is (a player backs off and tries again), o.replans times
      for (let attempt = 0; attempt <= (o.replans ?? 2); attempt++) {
        const st = await play.state();
        for (const tier of tiers) {
          pl = await P('plan', st.player.x, st.player.z, x, z, { ...(o.plan || {}), ...tier });
          pl.tier = tier;
          if (pl.ok) break;
        }
        if (!pl.ok) {
          // no route under the game's own movement rules: that is a finding in itself (e.g. a dock nobody can step onto)
          await play.log(`goTo (${x}, ${z}): planner found no route: ${pl.reason}; closest reachable ${JSON.stringify(pl.closest)} (${pl.closestDist} u from the goal) — trying a straight walk`);
          r = await play.walkTo(x, z, { avoid: true, ...o });
          return { ...r, plan: pl, replans: attempt, wetSamples: wet + r.wetSamples };
        }
        await play.log(`goTo (${x}, ${z})${attempt ? ` re-plan ${attempt}` : ''}: ${pl.points.length} waypoints, ~${pl.length} u (cells ${pl.tier.step} u, body ${pl.tier.clearance} u)${pl.goalMoved ? ' (goal not walkable: nearest walkable cell used)' : ''}`);
        // fine routes (narrow ramps, gangways) are followed more tightly; a stuck leg sidesteps twice, then re-plans
        const fine = pl.tier.step < 1;
        r = await play.walkPath(pl.points, { avoid: true, maxSidesteps: 2, waypointTolerance: fine ? 0.3 : 0.5, lookahead: fine ? 0.45 : 0.7, ...o, from: [st.player.x, st.player.z], label: o.label || 'goTo' });
        legs.push(...r.legs); wet += r.wetSamples || 0;
        if (r.ok || r.reason === 'ui-blocked') break;
      }
      return { ...r, legs, wetSamples: wet, plan: pl, replans: Math.max(0, legs.filter(l => !l.ok).length) };
    },
    plan: (x, z, o = {}) => play.state().then(st => P('plan', st.player.x, st.player.z, x, z, o)),
    /** Interactables registered in the world ({id, kind, x, z, radius}), optionally of one kind ('shop', 'talk', 'sit'…). */
    interactables: kind => ev(k => window.__lenza.ctx.world.interactables.list(k || undefined)
      .map(i => ({ id: i.id, kind: i.kind, x: +i.pos.x.toFixed(2), z: +i.pos.z.toFixed(2), radius: i.radius })), kind || null),
    /** Where things are: world POIs ({id, x, z, kind}) whose id starts with prefix ('village_', 'bench_', 'dock_'…). */
    pois: (prefix = '') => ev(pre => window.__lenza.ctx.world.poiList(pre).map(p => ({ id: p.id, kind: p.kind || null, x: +p.x.toFixed(2), z: +p.z.toFixed(2) })), prefix),
    /** Villagers right now ({id, x, z, state}). */
    npcs: () => ev(() => { const n = window.__lenza.ctx.npcs, l = Array.isArray(n) ? n : Array.isArray(n?.list) ? n.list : typeof n?.list === 'function' ? n.list() : n?.all || [];
      return l.filter(v => v.object).map(v => ({ id: v.id || v.data?.id, x: +v.object.position.x.toFixed(2), z: +v.object.position.z.toFixed(2), state: v.state ?? null })); }),
    /**
     * Walk (planned route, joystick only) up to something, like a player walking to a shop counter, a villager, a bench.
     * target: 'npc:<id>' (a villager, followed if it moves), an interactable id (world.interactables), a POI id
     * (world.poi: 'village_bottega', 'bench_…', 'dock_village'…) or {x, z, radius}. o: goTo options + reach (stop
     * distance, default from the thing) + expect (string/RegExp tested on systems.interact.current id + label).
     * Returns the goTo result + {target, interact (what the action button offers now), action, reached}.
     * reached = the action button offers something other than casting (and matches o.expect if given).
     * Nothing is tapped: tap/hold the action button yourself.
     */
    async approach(target, o = {}) {
      const where = () => ev(tg => {
        const c = window.__lenza.ctx, w = c.world;
        if (tg && typeof tg === 'object') return { id: 'point', kind: 'point', x: tg.x, z: tg.z, radius: tg.radius ?? 1.4 };
        if (tg.startsWith('npc:')) {
          const id = tg.slice(4), n = c.npcs, l = Array.isArray(n) ? n : Array.isArray(n?.list) ? n.list : typeof n?.list === 'function' ? n.list() : n?.all || [];
          const v = n?.get?.(id) || l.find(e => (e.id || e.data?.id) === id);
          return v?.object ? { id: tg, kind: 'talk', x: v.object.position.x, z: v.object.position.z, radius: 2.0 } : null;
        }
        const i = w.interactables.get(tg);
        if (i) return { id: i.id, kind: i.kind, x: i.pos.x, z: i.pos.z, radius: i.radius };
        const p = w.poi(tg);
        if (p) return { id: p.id, kind: p.kind || 'poi', x: p.x, z: p.z, radius: /^village_/.test(p.id) ? 2.6 : 1.8 };
        return null;
      }, target);
      let it = await where();
      if (!it) throw new Error(`approach: nothing called ${JSON.stringify(target)} (see play.interactables(), play.pois(), play.npcs())`);
      const reach = o.reach ?? it.radius * 0.6;
      const test = st => { const c = st.interact; if (!c || c.kind === 'cast') return false; if (!o.expect) return true; const s = `${c.id} ${c.label}`; return o.expect instanceof RegExp ? o.expect.test(s) : s.includes(o.expect); };
      let r = null;
      for (let tries = 0; tries < (it.kind === 'talk' ? 3 : 1); tries++) {   // a walking villager: re-plan toward where it is now
        r = await play.goTo(it.x, it.z, { tolerance: reach, label: `approach ${it.id}`, ...o, plan: { goalSlack: it.radius * 0.9, ...(o.plan || {}) } });
        await play.step(10);
        if (test(await play.state())) break;
        // in reach but the button offers something else (e.g. casting, facing the sea): turn toward it, as a player would
        await play.face(it.x, it.z);
        if (test(await play.state())) break;
        it = (await where()) || it;
      }
      const st = await play.state();
      const out = { ...r, target: it, interact: st.interact, action: st.action, reached: test(st) };
      await play.log(`approach ${it.id} (${it.kind}) → ${out.reached ? 'in reach' : 'NOT in reach'}; action button: ${JSON.stringify(st.action)} interact ${JSON.stringify(st.interact)}`);
      return out;
    },
    /** World point → screen CSS px. */
    project: (x, y, z) => P('project', x, y, z),

    // ── reading ──
    state: () => P('state'),
    overlaps: (minArea) => P('overlaps', minArea),
    /** Render the scene and save a screenshot (with the HUD) as <out>/<NN>-<name>.png. */
    async shot(name = 'shot') {
      await page.evaluate(() => window.__lenza.render());
      await sleep(30);
      const file = path.join(out, `${String(++shotN).padStart(2, '0')}-${name.replace(/[^\w.-]+/g, '_')}.png`);
      await page.screenshot({ path: file });
      await play.log(`shot ${path.relative(ROOT, file)}`);
      return file;
    },

    /**
     * Tap the dialog box until no dialogue is left (a choice: taps the first one, or {choice: 'text'}).
     * Waits up to firstWait game seconds for the first box, then 1.5 s for each following one. Returns the number of taps.
     */
    async tapThroughDialogs({ maxTaps = 60, firstWait = 2, choice = null } = {}) {
      let taps = 0;
      for (; taps < maxTaps; taps++) {
        // wait (in game time) for a dialog box that has finished appearing, like a player would
        const shown = await play.waitFor(() => { const e = document.querySelector('.dialog-host .dialog:not(.bye)'); return !!(e && e.classList.contains('in')); }, { timeout: taps ? 1.5 : firstWait, every: 3 });
        if (!shown) break;
        await play.step(6);
        const st = await play.state();
        if (!st.dialog) continue;
        if (st.dialog.choices?.length) { if (choice) await play.tapText(choice); else await play.tapSel('.dlg-choice'); }
        else { const d = await play.findSel('.dialog-host .dialog'); if (d) await play.tap(d.x, d.y + d.h * 0.2); }
        await play.step(8);
      }
      return taps;
    },
    /** Tap through: language → title Start → every dialog line (grandpa's letter). Real taps only. */
    async onboard({ lang = play.lang, maxTaps = 60, name = 'Nico' } = {}) {
      await play.step(30);
      let st = await play.state();
      if (st.intro && await play.findSel('.lang-btn')) { await play.tapText(lang === 'en' ? 'English' : 'Italiano'); await play.step(40); }
      if ((await play.state()).intro) { await play.tapSel('.title-start'); await play.step(30); }
      // [9 nov] the "what's your name?" card (new game): type a name like a player, then Confirm
      if (await play.findSel('.name-input')) {
        await play.tapSel('.name-input'); await play.page.keyboard.type(name, { delay: 30 }); await play.step(10);
        await play.tapSel('.name-ok'); await play.step(30);
      }
      // the letter (and any queued dialogue) shows up a moment after the title closes
      const taps = await play.tapThroughDialogs({ maxTaps, firstWait: 4 });
      st = await play.state();
      await play.log(`onboard done: ${taps} dialog taps, ui="${st.ui}", goal="${st.goal || ''}"`);
      if (/\bbusy\b/.test(st.ui || '')) await play.issue(`onboard: the UI is still busy after ${taps} dialog taps (${st.ui})`);
      return st;
    },

    async close() {
      try { await play.releaseAll(); } catch { /* ignore */ }
      fs.writeFileSync(path.join(out, 'console.txt'), consoleLog.join('\n') + '\n');
      fs.writeFileSync(path.join(out, 'log.txt'), logLines.join('\n') + '\n');
      await browser.close();
    },
    get consoleLog() { return consoleLog; },
    get pageErrors() { return pageErrors; },
    loadMs: Date.now() - t0,
  };
  return play;
}

// ───────────────────────────── CLI ─────────────────────────────
function parseCli(argv) {
  const a = argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) { pos.push(a[i]); continue; }
    const k = a[i].slice(2), v = a[i + 1];
    if (v !== undefined && !v.startsWith('--')) { o[k] = v; i++; } else o[k] = true;
  }
  return { pos, o };
}

async function main() {
  const { pos: [file], o } = parseCli(process.argv);
  if (!file) {
    console.log('usage: node tools/play.mjs <scenario.mjs> [--landscape] [--port 8810|--url URL] [--params "debug&intro&tips"] [--out dir] [--speed 1] [--quality high] [--lang it] [--headful]');
    process.exit(2);
  }
  const abs = path.resolve(file);
  const mod = await import(url.pathToFileURL(abs).href);
  const opts = { ...(mod.options || {}), ...o };
  const name = path.basename(abs).replace(/\.m?js$/, '') + (opts.landscape ? '-land' : '');
  opts.out = opts.out || path.join(ROOT, 'tmp/play', name);
  const T0 = Date.now();
  let play, failed = null;
  try {
    play = await createPlay(opts);
    await play.log(`loaded ${play.url} (${play.width}x${play.height}${play.landscape ? ' landscape' : ''}) in ${play.loadMs} ms; out ${path.relative(ROOT, play.out)}`);
    await mod.default(play, opts);
  } catch (e) {
    failed = e;
    console.log('[scenario error] ' + (e.stack || e.message));
    if (play) { try { await play.shot('error'); console.log(JSON.stringify(await play.state())); } catch { /* ignore */ } }
  }
  let errs = 0, logCount = 0, fails = [], issues = [];
  if (play) {
    errs = play.pageErrors; logCount = play.consoleLog.length;
    fails = play.checks.filter(c => !c.ok);
    issues = [...play.issues].map(([t, n]) => (n > 1 ? `${t} (x${n})` : t));
    if (play.consoleLog.length) console.log('── console ──\n' + play.consoleLog.slice(0, 60).join('\n') + (play.consoleLog.length > 60 ? `\n… ${play.consoleLog.length - 60} more (console.txt)` : ''));
    await play.close();
  }
  const summary = { scenario: path.relative(ROOT, abs), ok: !failed && !errs && !fails.length, checks: play ? `${play.checks.length - fails.length}/${play.checks.length} passed` : '0/0', failed: fails.map(f => f.msg), issues, scenarioError: failed ? failed.message : null, pageErrors: errs, consoleLines: logCount, out: play ? path.relative(ROOT, play.out) : null, seconds: Math.round((Date.now() - T0) / 1000) };
  console.log('── summary ──\n' + JSON.stringify(summary, null, 1));
  process.exit(summary.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) main();
