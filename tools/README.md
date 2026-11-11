# Tools

Node helpers for local testing. One-time setup: `cd tools && npm install` (installs `puppeteer-core`;
the tools drive the installed Google Chrome Beta headless with SwiftShader WebGL — set `CHROME_PATH` to override;
never point it at regular Google Chrome, which is the owner's everyday browser).

## play.mjs — real-touch playtest harness
Plays the game like a person on an iPhone (real touch events on the joystick, action button, buttons and dialogs,
walking with the stick). **Use it to verify anything a player does.** See [play-README.md](play-README.md).
```
node tools/play.mjs tools/scenarios/fish-home-dock.mjs [--landscape]
```

## serve.mjs — static server
```
node tools/serve.mjs 8790        # serves the repo root, no caching
```
Run it in the background, one port per agent/area, and kill it when you are done.

## shot.mjs — screenshot + console check
```
node tools/shot.mjs <url> <out.png> [--mobile] [--landscape] [--w 1280 --h 800] [--wait 2500] [--script scenario.js] [--full]
```
- `--mobile` = iPhone-ish 390x844 touch viewport (DPR 2); add `--landscape` for 844x390.
- Prints console errors and warnings, uncaught page errors (exit code 1) and failed requests.
  404s of optional game modules under `src/` are summarised on one `[info]` line (expected while areas are being built).
- `--script` runs a scenario in the page after load (see below). Its return value is printed as `script result: {...}`.

## strip.mjs — animation contact sheet
```
node tools/strip.mjs <url> <out.png> [--script setup.js] [--frames 12] [--every 5] [--cols 6] [--cell 300]
                     [--focus] [--crop-size 0.55] [--crop x,y,w,h] [--frame-script per-frame.js]
```
Freezes the rAF loop, then for each frame: runs the per-frame hook, advances `--every` simulation steps of 1/60 s
(`__lenza.step`), and copies the canvas (or a crop) into a labelled grid cell (`#i  t=…s`).
- `--focus` crops a square around the object the camera follows (player or placeholder dummy) — ideal for reviewing a
  character or creature animation. `--crop-size` is the square's size as a fraction of the canvas height.
- Per-frame logic: `--frame-script f.js` (has `i`, `L` in scope) or define `window.__stripFrame = i => {...}` in the setup script.
- Tip: in the setup script, `L.ctx.post.setEnabled(false)` removes tilt-shift/bloom when you want a neutral look,
  `L.ctx.time.paused = true; L.setTime(13)` fixes the light, `L.ctx.cameraRig.setMode('dialog')` frames closer.

Example (characters):
```js
// tmp/characters/cast.js  (setup)
L.ctx.time.paused = true; L.setTime(11);
L.ctx.cameraRig.setMode('dialog');
L.ctx.player.play('cast_windup');
window.__stripFrame = i => { if (i === 6) L.ctx.player.play('cast_release'); };
```
`node tools/strip.mjs "http://localhost:8792/sandbox/characters.html" tmp/characters/cast.png --script tmp/characters/cast.js --frames 18 --every 3 --focus`

## Scenario scripts (shot.mjs --script, strip.mjs --script)
A scenario is the body of an async function evaluated in the page. These helpers are in scope:

| name | what |
|---|---|
| `L` | `window.__lenza`, already awaited `ready` (resolves on bus `game:ready`; 20 s timeout). `null` if the page isn't in debug mode. |
| `sleep(ms)` | real-time wait |
| `waitFor(fn, ms=10000)` | poll until `fn()` is truthy, returns the value (or null on timeout) |
| `shot(name)` | `await shot('dusk')` saves an extra screenshot `<out>-dusk.png` right now (shot.mjs only) |

The page must expose the debug hooks: `index.html?debug`, or a sandbox that calls `createCore({ debug: true })` and
emits `ctx.bus.emit('game:ready')` (or calls `ctx.debug.markReady()`) once it is set up.

`window.__lenza` (= `ctx.debug`):

| hook | what |
|---|---|
| `ctx` | the whole core context |
| `freeze(v=true)` | stop the rAF loop so only `step()` advances time — do this first for deterministic captures |
| `step(n=1, dt=1/60)` | run n simulation frames synchronously, render once at the end; returns `loop.t` |
| `advance(n=1, dt)` | like step but never renders |
| `render()` | render one frame now |
| `teleport(x, z)` | move player (or the followed dummy) onto the ground at x,z and snap the camera |
| `setTime(h, day?)` | set the clock (also updates auto music/ambient) |
| `setWeather(type)` | `clear|cloudy|rain|fog|storm` (World), otherwise emits `weather:change` |
| `give(id, n)` | `give('coins', 50)`, `give('bait_shrimp', 5)` (Systems) |
| `quality(tier)` | force `low|mid|high|auto` without saving |
| `snapshot()` | PNG data URL of the canvas |
| `sfx(name, o)`, `music(mood)` | unlock audio and play |
| `logEvents(v=true)` | log every bus event |
| `info()` | `{tier, pixelRatio, time, phase, day, calls, triangles, geometries, textures, loopT, frame, viewport, errors, modules}` |
| `errors` | uncaught errors captured since load |

Typical scenario:
```js
L.freeze();                       // deterministic from here on
L.ctx.time.paused = true;
L.setTime(18.6);                  // golden hour
L.teleport(10, 4);
L.step(90);                       // 1.5 s of simulation, then render
await shot('dusk');
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));   // walk "up" the screen
L.step(60);
window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
return L.info();
```
Programmatic input without the keyboard: `L.ctx.input.setJoystick(0, 1)`, `L.ctx.input.setAction(true)` /
`setAction(false)`, `L.ctx.input.press('journal')`.

Headless notes: requestAnimationFrame is unreliable headless, so always drive time with `step()`. The quality tier in
`?debug` defaults to `high` even on the software renderer (and the FPS watchdog is off) so screenshots show the real look;
force another tier with `&quality=mid` or `L.quality('low')`.
