# Lenza Lenta — Architecture & module contracts

Read docs/GDD.md first. This file is the contract between modules built in parallel by
different people/agents. If you must deviate, keep the public names below working and write
the change in docs/CHANGES.md (append-only, one line per change, prefixed by your area).

## Tech
- Static site, **no build step**, native ES modules. Hosted on GitHub Pages at
  `https://luca-grella.github.io/lenza-lenta-v2/` → **all URLs must be relative** (no leading `/`).
- three.js r160 vendored in `vendor/` and mapped with an import map in `index.html`:
  `"three": "./vendor/three.module.min.js"`, `"three/addons/": "./vendor/addons/"`.
  Available addons: postprocessing/{EffectComposer,RenderPass,ShaderPass,UnrealBloomPass,OutputPass},
  shaders/{CopyShader,LuminosityHighPassShader,OutputShader}, utils/{BufferGeometryUtils,SkeletonUtils}.
  Need another addon? Download the same r160 file from `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/...`
  into `vendor/addons/` and note it in CHANGES.md.
- No external runtime requests at all (fonts included: use system fonts or a font file vendored
  in `assets/fonts/`). Everything must work offline once cached.
- Plain JavaScript (no TypeScript), JSDoc where useful. Short comments, only where non-obvious.
- No `Math.random()` for world generation: use the seeded RNG from `src/core/math.js` so the world
  is identical on every load. Gameplay randomness may use `Math.random()`.

## Directory ownership (only edit files in your area; read anything)
| Area | Owns |
|---|---|
| Core | `src/core/**`, `src/main.js` (initial version), `tools/**`, `sandbox/core.html` |
| World | `src/world/**`, `sandbox/world.html` |
| Characters | `src/actors/rig/**`, `src/actors/player.js`, `src/actors/npc.js`, `sandbox/characters.html` |
| Creatures | `src/actors/creatures/**`, `src/actors/fishModels.js`, `sandbox/creatures.html` |
| Gameplay | `src/systems/**`, `sandbox/gameplay.html` |
| Content | `src/data/**`, `src/i18n/**` |
| App & UI | `index.html`, `css/**`, `src/ui/**`, `manifest.webmanifest`, `sw.js`, `icons/**`, `assets/**`, `sandbox/ui.html` |
| Integration (later) | everything, mainly `src/main.js` |

Sandbox pages (`sandbox/<area>.html`) are your private test benches: boot the core, load your
module (and stubs of others if needed) and expose debug hooks. They are not shipped in the SW cache.

## Boot sequence (src/main.js)
```js
const ctx = await createCore({ canvasParent, debug })     // core: renderer, scene, camera, loop, bus, input, save, i18n, audio, time, quality, post
await loadData(ctx)            // content: ctx.data = { fish, junk, baits, rods, reels, lines, upgrades, recipes, ingredients, quests, npcs, zones, creatures, shopStock }
ctx.i18n.addStrings(it, en)    // content: src/i18n/it.js + en.js (export default flat objects)
ctx.world   = await World.init(ctx)        // terrain, water, sky, weather, foliage, props, colliders, interactables
ctx.fishModels = FishModels.init(ctx)      // creatures: mesh factory for every species
ctx.player  = Player.init(ctx)             // characters: rig + controller + animations
ctx.npcs    = Npcs.init(ctx)
ctx.creatures = Creatures.init(ctx)        // ambient animals + swimming fish population
ctx.systems = Systems.init(ctx)            // fishing, inventory, economy, shops, quests, aquarium, cooking, foraging, boat, home, cat
ctx.ui      = UI.init(ctx)                 // HUD, sheets, menus, onboarding, settings, language
ctx.loop.start()
```
Every module exports `init(ctx)` (sync or async) and returns its API object; modules must only
touch other modules **through `ctx` at runtime** (inside update/handlers), never at import time,
so init order mistakes don't crash. Missing optional APIs must be tolerated (`ctx.ui?.toast?.(...)`).

## Core API (`ctx`)
- `ctx.THREE` — the three namespace. `ctx.renderer`, `ctx.scene`, `ctx.camera`.
- `ctx.loop` — `add(fn, order=0)` / `remove(fn)`; `fn(dt, t)` with `dt` in seconds (clamped ≤ 0.05),
  `t` = elapsed seconds. Lower order runs first: input 0, systems 10, actors 20, world 30, camera 40, ui 50.
  `loop.start()`, `loop.pause(bool)`, `loop.paused`; pauses on `visibilitychange` hidden.
- `ctx.bus` — `on(evt, fn) → off fn`, `once`, `emit(evt, payload)`. Event names in the table below.
- `ctx.input` — `move` `{x, z, mag}` camera-relative (world space, already rotated, mag 0..1);
  `action` `{down, held, up}` edge flags for the frame (set by keyboard Space, the UI action
  button, or `input.setAction(bool)`); `pressed(name)` one-frame edges for `interact` (E),
  `bait` (B), `journal` (J), `map` (M), `menu` (Esc); `setJoystick(x, y)` used by the UI joystick;
  `enabled` (false while a sheet is open); `isTouch`.
- `ctx.cameraRig` — `follow(object3D)`, `setFocus(vec3|null)` (look between player and focus, e.g. bobber),
  `zoom` (0.7..1.6, default 1), `setMode('explore'|'fishing'|'boat'|'dialog'|'cinematic')`,
  `shake(amount)`, `update(dt)`; gentle damping, portrait screens get a slightly higher camera.
  Angle: three-quarter top-down like the video (~50-55° pitch), fixed yaw.
- `ctx.post` — post-processing pipeline: `render()`, `setEnabled(bool)`, `tiltShift(strength)`,
  `grade({warmth, saturation, vignette, exposure})`, `bloom(strength)`. Disabled on quality `low`.
- `ctx.quality` — `{tier:'low'|'mid'|'high', pixelRatio, shadows, shadowMapSize, grassDensity, post}`;
  `set(tier|'auto')`; emits `quality:change`.
- `ctx.save` — `state` (plain object, persisted to localStorage key `lenza-lenta-v2`), `commit()`
  (debounced write), `flush()`, `reset()`. Schema below. Each module owns its sub-object.
- `ctx.i18n` — `t(key, vars)` (missing key → returns key and warns once), `lang`, `setLang('it'|'en')`,
  `addStrings(itObj, enObj)`, `onChange(fn)`. Default lang: saved value, else `navigator.language`.
- `ctx.audio` — WebAudio, all procedural (no files): `unlock()` (call from first gesture),
  `sfx(name, {vol, pitch, pos})`, `setMusic(mood)` (`day`|`dusk`|`night`|`rain`|`cave`|`off`),
  `setAmbient(layer, volume)` (`waves`, `birds`, `crickets`, `rain`, `wind`, `waterfall`, `river`),
  `setVolumes({music, sfx})`. SFX names: `splash_small`, `splash_big`, `cast_whoosh`, `reel_click`,
  `bite`, `line_snap`, `catch_jingle`, `rare_jingle`, `coin`, `ui_tap`, `ui_open`, `ui_close`,
  `footstep_sand`, `footstep_grass`, `footstep_wood`, `row`, `pickup`, `cat_meow`, `gull`,
  `frog`, `door`, `eat`, `quest_done`, `page_turn`.
- `ctx.time` — `hours` (0..24 float), `day` (int), `phase` (`dawn|day|dusk|night`), `scale`
  (real seconds per game hour, default 60), `skipTo(hours)`, `paused`. Emits `time:phase`, `time:day`.
- `ctx.math` — `rng(seed)`, `noise2(x,y)`, `fbm(x,y,oct)`, `clamp`, `lerp`, `smoothstep`, `damp(a,b,lambda,dt)`, `angleLerp`.
- `ctx.debug` — also exposed as `window.__lenza` when `?debug` is in the URL: `step(n)` advances n
  frames of 1/60 s synchronously **without rendering** (except the last), `render()`, `ctx`,
  `teleport(x, z)`, `setTime(h)`, `setWeather(w)`, `give(itemId, n)`. Needed because headless
  tests and hidden tabs don't run requestAnimationFrame reliably.

## World API (`ctx.world`)
`heightAt(x,z)` terrain height; `groundY(x,z)` walkable surface height incl. docks/decks/bridges;
`waterLevel` (0); `isWater(x,z)`; `waterDepth(x,z)`; `habitatAt(x,z)` → habitat id or null;
`zoneAt(x,z)` → zone id; `walkable(x,z)`; `resolveMove(from, to, radius)` → corrected position
(slides along colliders); `nearestWaterAlong(origin, dir, maxDist)` → `{point, habitat}|null`;
`spawn` → `{x, z, facing}`; `poi(id)` → named points (`home_bed`, `home_campfire`,
`village_bottega`, `village_pescheria`, `village_falegname`, `village_trattoria`, `village_aquarium`,
`dock_home`, `dock_village`, `boat_mooring_home`, `boat_mooring_village`, `lighthouse_top`,
`cave_entrance`, `cave_pool`, `waterfall_pond`, `river_bridge`, `palm_islet_beach`,
`turtle_isle_beach`, `treasure`, benches `bench_*`, forage spots `forage_*`, npc homes `npc_*`);
`interactables` registry: `register({id, pos, radius, kind, labelKey, enabled(), onInteract()})`,
`nearest(pos)`; `weather` → `{type, intensity, wind:{x,z,strength}}`; `setWeather(type)`;
`sun` (DirectionalLight), `update(dt,t)` registered on the loop by the module itself;
`minimap()` → canvas or data needed by the UI Map (heightmap colors + zone labels + POIs);
`boatWaterOK(x,z)` (deep enough to row). Also exports shared materials helper
`world.materials.wind(material)` to add wind sway to any material (used by creatures/props).

## Actors
`ctx.player` — `object` (THREE.Group), `position`, `facing` (radians, 0 = +z), `state`
(`idle|walk|fishing|boat|sit|forage|talk|sleep|eat|pet|cutscene`), `rod` (`tipWorld(vec3)`),
`play(animName, {loop, fade, speed, onEnd})`, `setControl(bool)`, `sitAt(poi)`, `standUp()`,
`board(boat)`, `leaveBoat()`, `holdFish(mesh|null)`, `setOutfit({hat, shirt, ...})`, `update(dt)`.
Animation names (at minimum): `idle`, `idle_look`, `idle_yawn`, `idle_hat`, `walk`, `walk_slow`,
`cast_windup` (holds while charging), `cast_release`, `fish_wait` (loop with rod sway),
`strike`, `reel` (loop), `reel_struggle` (lean back, loop), `catch_show` (lift fish overhead),
`catch_happy` (jump for rare), `fail_shrug`, `sit_down`, `sit_idle` (legs dangle), `stand_up`,
`row` (loop), `crouch_pick`, `pet`, `eat`, `wave`, `talk`, `sleep`, `wake`.
Movement: smooth acceleration, cozy speeds (walk ≈ 3 u/s, slow walk when joystick half-way),
feet planted on terrain (IK or raycast foot offset), hat/vest secondary motion, look-at towards bobber/NPC.
`ctx.npcs` — list of villagers built with the same rig; `get(id)`; each has `object`, `play`, `lookAt`,
daily routine (positions by time phase), `talk()` → opens dialog via `ctx.ui.dialog(...)`.
`ctx.fishModels` — `create(speciesId, {lod})` → `{object, animate(dt, swimSpeed, bend)}`,
`thumbnail(speciesId, size)` → dataURL (rendered offscreen once, cached), `silhouette(speciesId)`.
`ctx.creatures` — ambient population: `fishShadows` (swimming fish near the player, per habitat,
used by fishing: `nearestFish(point, habitat, radius)`, `attract(fish, point)`, `release(fish)`),
`cat` (`befriend()`, `follow(bool)`, `sitNear(pos)`, `feed()`), seagulls, crabs, turtles, frogs,
butterflies, fireflies, dolphins, rabbits, jellyfish.

## Systems (`ctx.systems`)
`fishing` (state machine: `idle|aim|charge|cast|wait|bite|reel|landed|cancel`, uses world/creatures/player/
cameraRig/ui), `inventory` (`add(id, n)`, `remove`, `count`, `basket` list with size/price),
`economy` (`coins`, `earn`, `spend`), `shops` (`open(shopId)` data for UI, `buy(itemId)`, `sell(...)`),
`quests` (story chain + dailies; `active()`, `progress`, listens to bus events), `aquarium`
(`donate(speciesId)`, `donated`), `cooking` (`recipes`, `canCook`, `cook(recipeId)`, `eat(dishId)` → buff),
`buffs` (`active`, `mult(stat)`), `foraging` (spots, respawn per day), `boat` (`unlocked`, `board`,
`leave`, `update` rowing physics), `home` (`tier`, `upgrade`, `sleep()`), `journal` (`record(catch)`, `entries`),
`interact` (chooses the context action shown on the action button each frame:
`ctx.systems.interact.current` → `{labelKey, icon, run()}`).

## UI (`ctx.ui`)
`toast(textOrKey, vars)`, `banner(titleKey, subKey)` (big cozy announcement), `dialog(npcId, lines[], choices)` → Promise,
`sheet(name, data)` / `closeSheet()` for: `journal`, `aquarium`, `inventory`, `quests`, `map`, `settings`,
`shop` (with shopId), `cook`, `catch` (catch card), `language`; `hud` (updates itself from bus events and
`ctx.systems` each frame at low frequency), `actionButton` (label/icon from `systems.interact.current`,
hold support for fishing), `worldLabel(id, pos3, textOrKey)` / `removeWorldLabel(id)` (anchored tags),
`meter('reel', {tension, progress, hint})`, `onboarding` (contextual tips), `isOpen()`.

## Events (bus)
`game:ready`, `save:loaded`, `lang:change`, `quality:change`, `time:phase` {phase}, `time:day` {day},
`weather:change` {type}, `zone:enter` {zone}, `fishing:cast` {point, habitat}, `fishing:bite`,
`fishing:strike`, `fishing:escape` {reason}, `fishing:catch` {speciesId, size, price, habitat, isNew, isRecord},
`inventory:change`, `coins:change` {coins, delta}, `shop:buy` {itemId}, `shop:sell` {count, total},
`quest:progress` {id}, `quest:complete` {id}, `aquarium:donate` {speciesId}, `cook:done` {recipeId},
`buff:start`/`buff:end`, `forage:pick` {itemId}, `boat:board`/`boat:leave`, `npc:talk` {npcId},
`home:upgrade` {tier}, `cat:befriend`, `ui:sheet` {name, open}.

## Save schema (`ctx.save.state`)
```js
{ v: 1, lang: 'it', settings: { music: .7, sfx: .8, quality: 'auto', haptics: true },
  player: { x, z, facing, outfit: {} }, time: { hours, day }, weather: { type },
  coins: 0, basket: [{ id, size, price }], items: { bait_corn: 0, ... }, equip: { rod, reel, line, bait },
  owned: { rod_bamboo: true, ... }, journal: { [speciesId]: { n, best, firstDay } },
  aquarium: { [speciesId]: true }, quests: { story: 0, progress: {}, dailies: [...], done: {} },
  home: { tier: 0, decor: {} }, boat: { repaired: false, level: 0, at: 'home' },
  cat: { friend: 0, following: false }, forage: { day, picked: {} }, buffs: [], stats: {} }
```

## Data formats (src/data, all `export default`)
- `fish.js`: `[{ id, rarity, habitats:[], baits:[], times:[], weather:{rain:1.5,...}, size:[min,max],
  price, behavior, difficulty: 0..1, zones?:[], model: { shape:'torpedo|round|flat|long|tall|crab|ray|eel|squid|turtle?|junk_*',
  length, height, palette:{back, belly, fin, accent}, pattern:'none|stripes|spots|bands|gradient|rainbow|clown|dots|lines', glow? } }]`
  Names/descriptions live in i18n as `fish.<id>.name` / `fish.<id>.desc`.
- `junk.js` (same shape, `junk: true`), `baits.js`, `gear.js` (rods/reels/lines/basket/lantern with stats + price),
  `recipes.js`, `ingredients.js`, `quests.js` (story steps: `{id, goal:{event, filter, count}, reward, npc, dialogKeys}`),
  `dailies.js`, `npcs.js` (`{id, look:{skin, shirt, pants, hat, hair, beard?}, home poi, routine, dialogKeys}`),
  `creatures.js`, `shops.js`, `zones.js` (labels, music mood), `decor.js`, `home.js` (tiers).
- i18n keys: dot-separated, flat objects, both languages complete. Italian is the primary voice:
  warm, simple, a bit playful; English equivalent tone.

## Visual direction
- Palette: turquoise shallows `#3fd0c9` → deep `#1d6f9a`; sand `#ecd59a`; grass `#6fb548`/`#86c454`;
  pines `#2f7d46`; wood `#b07a4a`/`#8a5532`; hut red `#b8623b`; roofs `#7d3d24`; rock `#a39e94`;
  sky day `#a9e4f2`, dusk `#f6a77a`, night `#1d2a4a`. Warm sun, cool shadows.
- Flat-ish shading with soft light: `MeshLambertMaterial`/`MeshStandardMaterial` (roughness 0.9) with
  vertex colors; avoid harsh flatShading on characters (smooth, chunky, rounded).
- Characters: chunky proportions (big head ~1/3 height, big hands/feet), smooth low-poly, readable
  silhouettes from a top-down camera, big hats.

## Performance budget (iPhone 12+ at 60 fps on `high`, older devices fall back)
≤ 150 draw calls (instancing + merged static geometry), ≤ 400k triangles visible, shadow map 2048 (high)/
1024 (mid)/off (low), pixel ratio cap 2 (high) / 1.5 / 1, post on mid/high only. Terrain chunks with
frustum culling; foliage via InstancedMesh with distance culling around the player.

## Testing
`node tools/serve.mjs 8790` serves the repo; `node tools/shot.mjs <url> out.png [--mobile] [--landscape]
[--script file.js] [--wait ms]` takes a headless Chrome screenshot (SwiftShader WebGL) and prints console
errors. Use `?debug` + `window.__lenza.step(n)` in scenario scripts to advance time deterministically.
**Look at your screenshots** (Read the PNG) and iterate until it looks good. Fix every console error.
