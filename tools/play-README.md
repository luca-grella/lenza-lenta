# play.mjs — real-touch playtest harness

Plays Lenza Lenta the way Luca does on his iPhone: an emulated iPhone (390x844 portrait or 844x390 landscape, DPR 2,
iOS Safari user agent, touch, `pointer: coarse`), and **every input is a real touch** sent with CDP
`Input.dispatchTouchEvent` on the real UI — the floating joystick, the action button, buttons, the dialog box.
The browser turns those touches into the same `pointerdown/move/up` events a phone produces, so anything that
covers a control, swallows a tap or ignores a finger shows up exactly as it would on the phone.

The debug hooks (`?debug`, `window.__lenza`) are used only to
- advance the simulation (`__lenza.advance`) — headless Chrome does not run `requestAnimationFrame` reliably, so the
  loop is frozen at load and the harness steps it, 60 steps per second of input, pacing wall time to game time so
  UI `setTimeout`s and CSS transitions line up as on a phone;
- read state (player position, zone, UI classes, sheets, dialogs, interact label, fishing state…);
- optionally set up a scenario near the place under test (e.g. `L.setTime(18)`, `L.give('coins', 50)`).
  If you teleport to start near something, the **action under test must still be done by touch**, and anything about
  movement must be walked with the stick.

## Run
```
node tools/serve.mjs 8810 &                 # one port per agent (--port N on play.mjs)
node tools/play.mjs tools/scenarios/walk-village-dock.mjs                 # spawn → village dock → onto it → its end
node tools/play.mjs tools/scenarios/fish-home-dock.mjs --landscape        # intro by touch, fish once from the home dock
node tools/play.mjs tools/scenarios/approach-village.mjs                  # walk up to every shop counter + 2 villagers
```
Put your own scenarios in `tmp/<area>/` (git-ignored) and pass `--out tmp/<area>/<name>` so screenshots stay yours.

Flags (a scenario can also `export const options = { ... }` with the same keys; CLI wins):

| flag | default | what |
|---|---|---|
| `--landscape` | off | 844x390 instead of 390x844 |
| `--port N` | 8810 | server port (URL = `http://localhost:N/index.html?<params>`) |
| `--url URL` | | full URL instead (e.g. a sandbox page; it must expose `__lenza` and emit `game:ready`) |
| `--params "…"` | `debug&intro&tips` | query string. `intro` shows the language/title screens like a real first launch (debug skips them otherwise), `tips` shows the onboarding tips like for a player |
| `--quality low\|mid\|high` | `high` (debug default) | forces a quality tier |
| `--speed N` | 1 | pacing: 1 = real time, 2 = twice as fast, 0 = no pacing (fastest; UI timers then lag behind game time) |
| `--out dir` | `tmp/play/<scenario>[-land]` | screenshots, `log.txt`, `console.txt` |
| `--strictThumb` | off | see "findings" below |
| `--headful` | off | show the browser window |

Exit code 0 only if: no scenario exception, no uncaught page error, every `play.expect` passed. The run ends with a
JSON summary: checks, failed checks, **issues** (findings, see below), page errors, console lines, output folder.
Each fresh run is a brand-new browser profile = a brand-new save.

## Scenario
```js
// tmp/<area>/my-test.mjs
export const options = { landscape: false };        // optional
export default async function (play) {
  await play.onboard({ lang: 'it' });               // language → Inizia → taps through grandpa's letter
  const r = await play.goTo(46.5, 50);              // plan on walkable ground, walk it with the joystick
  await play.expect(r.ok, 'reach the bottega', r);
  await play.shot('bottega');
  await play.tapSel('.act');                        // tap the action button
  await play.waitFor(L => L.ctx.ui.currentSheet === 'shop', { timeout: 3 });
  await play.tapText('Esca');                       // tap a button by its visible text
}
```

## API (`play`)
**Time**
- `step(n, {render})` advance n frames (1/60 s each). `wait(seconds)`.
- `waitFor(pred, {timeout=10, every=6, arg})` — steps until `pred(L, arg)` (evaluated **in the page**, `L` = `window.__lenza`) is truthy; returns the value or `null` after `timeout` game seconds. Example: `await play.waitFor(L => L.ctx.systems.fishing.state === 'bite', { timeout: 60 })`.

**Touch** (all real `Input.dispatchTouchEvent`, multi-finger OK)
- `tap(x, y, {hold=0.08, after=0.15})` CSS px; returns what the finger hit.
- `tapText(text, {exact, index, optional})` — visible element containing that text (case-insensitive; the smallest match, then its closest button/dialog/banner). Throws with the list of visible buttons if nothing matches (unless `optional`).
- `tapSel(css, {index, optional, hold, after})`.
- `press(target='action')` → finger id (kept down); `release(id)`. `hold(target='action', seconds)`. `target` = `'action'` (the big button), a CSS selector or a text.
- `joy(dx, dy, seconds)` drags the floating joystick: dx/dy in -1..1 of the knob travel, **screen axes: dx>0 right, dy>0 down**. Low level: `joyDown()`, `joyMove(dx, dy)`, `joyUp()` (combine with `press()` to steer while charging a cast).
- `touchStart(x, y)` → id, `touchMove(id, x, y)`, `touchEnd(id)`, `releaseAll()`.
- `hitAt(x, y)` what is on top at that point.

**Walking (joystick only)**
- `walkTo(x, z, {tolerance=0.6, timeout=40, avoid=false, slow=1.8, stuckTime=1.5, from, y})` — closed loop: every 3 frames it reads the player position, projects player and aim point through the **real camera** to get the screen direction, and moves the thumb there. With `from:[ax,az]` it follows the segment from→target (pure pursuit: aims at a point 0.7 u ahead on the line, so it does not cut corners); with `y` it only counts as arrived at that height (on the ramp, not beside it). Returns `{ok, reason: 'arrived'|'stuck'|'timeout'|'ui-blocked', pos:[x,z,y], dist, time, path:[[x,z,y,'wet'|'over-water']…], wetSamples, zones, sidesteps}`. `stuck` = no 0.25 u of progress for `stuckTime` s. `avoid:true` tries short sidesteps (`maxSidesteps`, 6) before giving up. `ui-blocked` = a dialog/sheet took the input (`tapDialogs:true` taps through a dialogue that opens on the way and keeps walking). `wetSamples` counts path samples with the feet in the sea (not on a dock).
- `walkPath([[x,z,y?], …], opts)` — waypoints (each leg follows the segment from the previous one), stops at the first failed leg.
- **`goTo(x, z, opts)`** — the one to use for "walk over there". Plans a route, then walks it with the stick:
  - the planner (A*, planning only) tests every grid edge and every shortcut with the game's own movement solver
    `world.resolveMove` (buildings and props, the shore line, wading depth, climb/drop step rules of docks, decks and ramps)
    with a body fatter than the player, and keeps shortcuts only if they also hold 0.2 u to either side. It tries
    1 u cells / 0.5 u body first, then 0.5 u cells / 0.42 u, then 0.5 u / 0.37 u (narrow ramps onto the stilt decks);
  - a leg that gets stuck sidesteps twice, then the route is **re-planned** from where the player is (`replans`, 2);
  - if no route exists under the game's rules, it logs `planner found no route` with the closest reachable point (that is a
    finding: e.g. a dock nobody can step onto) and tries a straight walk anyway, so you see where the player stops.
  - returns the `walkPath` result + `{plan, legs, replans, wetSamples}`. `plan(x, z, {step, clearance, goalSlack})` only plans.
- **`approach(target, {expect, reach, ...goTo opts})`** — walk up to something like a player does, then check that the
  action button offers it. `target` = `'npc:rosa'` (a villager, re-planned if it walks away), a POI id
  (`'village_bottega'`, `'bench_…'`, `'dock_village'`…), a world interactable id, or `{x, z, radius}`. If the button offers
  something else (typically casting when facing the sea) it turns toward the target with `face()` first, as a thumb would.
  Returns the goTo result + `{target, interact, action, reached}`; `expect` (string/RegExp on interact id + label) tightens `reached`.
  Nothing is tapped: then `tapSel('.act')` / `hold('action', s)` yourself.
- `face(x, z, {seconds=0.2, mag=0.3})` — a short light push of the stick toward a point (turn to face it; may shuffle a few cm).
- `pois(prefix)`, `npcs()`, `interactables(kind)` — where things are (`{id, x, z, …}`), to pick targets.
- `project(x, y, z)` world → screen px.

**Reading**
- `state()` → `{t, time, lang, player:{x,y,z,facing,state}, zone, overWater (sea below, also on a dock), inWater (feet in the sea), groundY, ui (classes of #ui), intro, sheet, dialog:{name,text,choices}, camera, inputEnabled, isTouch, interact:{kind,label,id}, action:{label,shown}, fishing:{state,tension,progress}, toasts, banners, zoneTitle, tips, goal, coins, basket, errors}`
- `overlaps(minArea=30)` — visible text boxes of different UI components that overlap (e.g. zone title over the goal card).
- `shot(name)` renders the scene and saves `NN-name.png` with the HUD. **Look at it with Read.**
- `log(...)`, `expect(cond, msg, extra)`, `issue(text)`, `eval(fn, ...args)` (raw `page.evaluate`), `page`, `cdp`.
- `onboard({lang})` — language, title Start, then `tapThroughDialogs()`.
- `tapThroughDialogs({firstWait=2, choice})` — waits for a dialog box to finish appearing, taps it (a choice: the first one, or the one whose text contains `choice`), repeats until no dialogue is left; returns the number of taps.

**Findings ("issues")** — things a player would hit, reported in the summary without failing the run:
a tapped/pressed element covered by something else, or the joystick spot covered (e.g. by an onboarding tip with
`pointer-events: auto`). For the joystick the harness first tries the spot a player uses (the dashed ghost stick),
logs the issue if it is covered, then moves the thumb to a free spot of the zone like a player would; `--strictThumb`
keeps the finger on the covered spot instead (to reproduce a "dead stick").

## Known limits
- Headless Chrome + SwiftShader: no real GPU, no `env(safe-area-inset-*)` (notch/home bar insets are 0), no haptics,
  no audio output. Layout follows the emulated viewport only.
- Time: the rAF loop is frozen; `step()` calls `__lenza.advance()` (simulation without rendering, 6 frames per call) and
  `shot()` renders once before the screenshot. Real-time pacing (`--speed 1`) keeps UI `setTimeout`s/CSS transitions in
  step with game time; with `--speed 0` they lag behind (fine for long walks, not for dialog/toast timing tests).
- Speed: on an idle Mac a run loads in ~10 s and a screenshot takes ~1 s; with other headless Chromes running the load
  takes 30-60 s (seen 2 Nov: 32-60 s) and a screenshot up to a minute (timeouts are generous on purpose). Take few screenshots.
- `walkTo` alone steers in a straight line: use `goTo` / `approach` around buildings and onto docks/decks.
- `tapText` matches the visible text of the *current language*: pass the Italian text after `onboard({lang:'it'})`.
- `?debug` without `intro` skips the language/title screens but grandpa's letter still opens: call `onboard()` anyway
  (it handles both), or the stick is "not visible (UI busy)".
- Debug teleports (`__lenza.teleport`) are for diagnosis or to start next to the thing under test; anything about
  movement must be walked (`goTo`/`approach`).

## Reliability (2 Nov 2026, this machine, load avg 10-35)
- walk-village-dock: 4/4 portrait and landscape (3 runs, ~70 u route + up the ramp + to the dock end).
- fish-home-dock: 8/8 portrait and landscape (onboarding, cast, bite, strike, reel, catch card, Tieni, letter).
- approach-village: 7/7 (5 shop counters + Rosa + Gino, stilt-deck ramps included), 0 re-plans on the last run.
- Before the movement-solver planner, the old planner (world.walkable points only) routed through the bottega and got
  stuck against it; and cutting corners at the pescheria ramp got stuck beside it. Both fixed (see above).
