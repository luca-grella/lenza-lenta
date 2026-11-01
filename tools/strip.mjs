// Contact sheet of an animation: renders N frames deterministically (window.__lenza.step) and tiles them.
//   node tools/strip.mjs <url> <out.png> [--script setup.js] [--frames 12] [--every 5] [--cols 6] [--cell 300]
//                        [--focus] [--crop-size 0.55] [--crop x,y,w,h] [--frame-script per-frame.js] [--mobile] [--w N --h N]
// --script        runs once after load (same helpers as shot.mjs: L, sleep, waitFor, shot). Set up the pose/animation here.
// --frame-script  runs before every frame with `i` (frame index) in scope (e.g. L.ctx.player.play('cast_release') at i==0).
//                 Alternatively the setup script can define window.__stripFrame = (i) => {...}.
// --every         simulation steps (1/60 s each) between captured frames (default 5 → 12 fps).
// --focus         crop a square around the camera's followed object (player/dummy); --crop-size = fraction of the canvas height.
// --crop          explicit crop in canvas CSS pixels.
// Each cell is labelled with the frame index and simulated time. The page must be opened with ?debug (or call createCore({debug:true})).
import fs from 'node:fs';
import { parseArgs, launch, openPage, runScenario, PRELUDE } from './lib.mjs';

const { pos: [url, out], opt } = parseArgs(process.argv);
if (!url || !out) { console.log('usage: node tools/strip.mjs <url> <out.png> [--script setup.js] [--frames 12] [--every 5] [--cols 6] [--cell 300] [--focus] [--crop x,y,w,h] [--frame-script f.js]'); process.exit(2); }
let w = +(opt('w') || 1280), h = +(opt('h') || 800); const mobile = !!opt('mobile');
if (mobile) { w = 390; h = 844; }
const frames = +(opt('frames') || 12), every = +(opt('every') || 5), cols = +(opt('cols') || Math.min(6, frames)), cell = +(opt('cell') || 300);
const crop = typeof opt('crop') === 'string' ? opt('crop').split(',').map(Number) : null;
const focus = !!opt('focus'), cropSize = +(opt('crop-size') || 0.55);
const frameSrc = typeof opt('frame-script') === 'string' ? fs.readFileSync(opt('frame-script'), 'utf8') : '';

const browser = await launch();
let errors = 0;
try {
  const { page, report, errors: errs } = await openPage(browser, url, { w, h, mobile, wait: +(opt('wait') || 2500) });
  if (opt('script')) { const r = await runScenario(page, opt('script')); if (r !== undefined) console.log('setup result:', JSON.stringify(r)); }
  const cfg = JSON.stringify({ frames, every, cols, cell, crop, focus, cropSize });
  const dataUrl = await page.evaluate(`(async()=>{ ${PRELUDE}
    const C = ${cfg};
    if (!L) throw new Error('window.__lenza missing: open the page with ?debug');
    L.freeze();
    const src = L.ctx.renderer.domElement, dpr = src.width / src.clientWidth;
    const rows = Math.ceil(C.frames / C.cols);
    const aspect = C.crop ? C.crop[2] / C.crop[3] : C.focus ? 1 : src.width / src.height;
    const cw = C.cell, ch = Math.round(C.cell / aspect);
    const sheet = document.createElement('canvas'); sheet.width = cw * C.cols; sheet.height = ch * rows;
    const g = sheet.getContext('2d'); g.fillStyle = '#20303a'; g.fillRect(0, 0, sheet.width, sheet.height);
    const perFrame = async (i) => { ${frameSrc}\n if (window.__stripFrame) await window.__stripFrame(i); };
    for (let i = 0; i < C.frames; i++) {
      await perFrame(i);
      L.step(i === 0 ? 1 : C.every);
      let sx = 0, sy = 0, sw = src.width, sh = src.height;
      if (C.crop) { [sx, sy, sw, sh] = C.crop.map(v => v * dpr); }
      else if (C.focus && L.ctx.cameraRig.followed) {
        const p = L.ctx.cameraRig.followPos.clone(); p.y += 0.9;
        const s = L.ctx.cameraRig.toScreen(p); sh = sw = src.height * C.cropSize;
        sx = s.x * src.width - sw / 2; sy = s.y * src.height - sh / 2;
      }
      const x = (i % C.cols) * cw, y = Math.floor(i / C.cols) * ch;
      g.drawImage(src, sx, sy, sw, sh, x, y, cw, ch);
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y, 96, 18);
      g.fillStyle = '#fff'; g.font = '12px system-ui, sans-serif';
      g.fillText('#' + i + '  t=' + L.ctx.loop.t.toFixed(2) + 's', x + 5, y + 13);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
    }
    return sheet.toDataURL('image/png');
  })()`);
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`saved ${out} (${frames} frames, every ${every} steps, ${cols} cols)`);
  report(); errors = errs();
} catch (e) { console.log('[harness] ' + e.message); errors++; }
finally { await browser.close(); }
process.exit(errors ? 1 : 0);
