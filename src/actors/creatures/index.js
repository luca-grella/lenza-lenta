// Creatures area entry: ambient animals + swimming fish + aquarium tanks.  ctx.creatures = await init(ctx)
//
// API (ctx.creatures):
//   fishShadows      swimming fish near the player: nearestFish(point, habitat, radius), attract(fish, point),
//                    release(fish), bite(fish), flee(point, r), spawnAt(point, speciesId), list, engaged
//   nearestFish / attract / release   aliases of the above
//   cat              befriend(), follow(bool), sitNear(pos|null), feed(speciesId), pet(), meow(), position, state, befriended
//   aquarium         tanks (World POIs aquarium_tank_*), refresh()
//   seagulls, crabs, turtles, frogs, butterflies, fireflies, dolphins, rabbits, jellyfish   species controllers
//   species          id → controller; setEnabled(id, bool); active() → ids active now; fx (hearts, splash…)
// Spawning by zone/time/weather from data/creatures.js (count scaled by quality.particles), culled by distance.
import * as THREE from 'three';
import { createEnv } from './env.js';
import { createFx } from './fx.js';
import { createCat } from './cat.js';
import { createFishPopulation, createAquarium } from './fish.js';
import { createGulls } from './birds.js';
import { createCrabs, createFrogs, createRabbits, createTurtles } from './critters.js';
import { createButterflies, createFireflies } from './swarms.js';
import { createDolphins, createJellyfish } from './sea.js';
import { it, en } from './strings.js';

/** Defaults used when src/data/creatures.js is missing (same shape). */
const DEFAULTS = [
  { id: 'cat', zones: ['home_beach', 'village'], spot: 'village_trattoria', times: ['dawn', 'day', 'dusk', 'night'], weather: {}, count: 1, look: {} },
  { id: 'seagull', zones: ['village', 'home_beach', 'lighthouse', 'palm_islet', 'turtle_isle'], times: ['dawn', 'day', 'dusk'], weather: { storm: 0.3, rain: 0.6 }, count: 6, look: {} },
  { id: 'crab', zones: ['home_beach', 'palm_islet', 'turtle_isle', 'lighthouse'], times: ['dawn', 'dusk', 'night'], weather: { rain: 1.3 }, count: 6, look: {} },
  { id: 'turtle', zones: ['turtle_isle'], spot: 'turtle_isle_beach', times: ['dawn', 'day', 'dusk'], weather: { rain: 0.5 }, count: 4, look: {} },
  { id: 'frog', zones: ['waterfall', 'meadow'], spot: 'waterfall_pond', times: ['dusk', 'night', 'dawn'], weather: { rain: 1.6 }, count: 5, look: {} },
  { id: 'butterfly', zones: ['meadow', 'pine_forest', 'home_beach', 'village', 'waterfall'], times: ['day'], weather: { rain: 0, storm: 0, fog: 0.4 }, count: 12, look: {} },
  { id: 'firefly', zones: ['meadow', 'pine_forest', 'waterfall', 'home_beach'], times: ['dusk', 'night'], weather: { rain: 0.2, storm: 0 }, count: 40, look: {} },
  { id: 'dolphin', zones: ['lighthouse', 'palm_islet', 'turtle_isle'], times: ['dawn', 'day'], weather: { storm: 0 }, count: 3, chance: 0.15, look: {} },
  { id: 'rabbit', zones: ['meadow', 'pine_forest'], times: ['dawn', 'dusk'], weather: { rain: 0.3 }, count: 4, look: {} },
  { id: 'jellyfish', zones: ['sea_cave'], spot: 'cave_pool', times: ['dawn', 'day', 'dusk', 'night'], weather: {}, count: 8, look: {} },
];

/** @param {any} ctx */
export async function init(ctx) {
  ctx.i18n?.addStrings?.(it, en);
  const env = createEnv(ctx);
  const root = new THREE.Group(); root.name = 'Creatures';
  ctx.scene.add(root);
  const fx = createFx(ctx, root);
  const defs = new Map((ctx.data?.creatures?.length ? ctx.data.creatures : DEFAULTS).map(d => [d.id, d]));
  const def = id => defs.get(id) || DEFAULTS.find(d => d.id === id) || { id, zones: [], times: [], weather: {}, count: 1, look: {} };

  // ---- controllers ----
  const fishShadows = createFishPopulation(ctx, env, root, fx);
  const aquarium = createAquarium(ctx, env, root);
  const cat = createCat(ctx, env, root, fx, def('cat'));
  const species = {
    seagull: createGulls(ctx, env, root, fx, def('seagull')),
    crab: createCrabs(ctx, env, root, fx, def('crab')),
    turtle: createTurtles(ctx, env, root, fx, def('turtle')),
    frog: createFrogs(ctx, env, root, fx, def('frog')),
    butterfly: createButterflies(ctx, env, root, fx, def('butterfly')),
    firefly: createFireflies(ctx, env, root, fx, def('firefly')),
    dolphin: createDolphins(ctx, env, root, fx, def('dolphin')),
    rabbit: createRabbits(ctx, env, root, fx, def('rabbit')),
    jellyfish: createJellyfish(ctx, env, root, fx, def('jellyfish')),
  };
  const disabled = new Set();
  const forced = new Set(); // sandbox/debug: active regardless of zone/time

  // ---- activation: zone (or near the species' spot), time phase, weather ----
  const _p = new THREE.Vector3();
  const info = { player: _p, zone: null, phase: 'day', weather: 'clear', night: 0, playerState: 'idle', quality: 1, cull: 70 };
  function wanted(id) {
    if (disabled.has(id)) return 0;
    if (forced.has(id)) return 1;
    const d = def(id);
    if (d.times?.length && !d.times.includes(info.phase)) return 0;
    const wm = d.weather?.[info.weather] ?? 1;
    if (wm <= 0) return 0;
    let inZone = !d.zones?.length || d.zones.includes(info.zone);
    if (!inZone && d.spot) { const s = env.poi(d.spot); if (s && Math.hypot(s.x - _p.x, s.z - _p.z) < 45) inZone = true; }
    return inZone ? Math.min(1.6, wm) : 0;
  }
  let evalT = 0;
  const active = {};
  function evaluate() {
    info.zone = env.zone(_p.x, _p.z);
    for (const id in species) {
      const w = wanted(id);
      const c = species[id];
      const n = Math.round((def(id).count ?? 1) * w * info.quality);
      if (w > 0 && n > 0) { if (!active[id]) { active[id] = true; c.setActive?.(true, info, n); } else c.setCount?.(n, info); }
      else if (active[id]) { active[id] = false; c.setActive?.(false, info, 0); }
    }
  }

  let lastZone = null;
  function update(dt, t) {
    env.tick(dt);
    env.player(_p);
    info.phase = env.phase; info.weather = env.weather;
    const L = env.lighting(); info.night = L.night; info.daylight = L.daylight;
    info.playerState = env.playerState();
    info.quality = ctx.quality?.particles ?? 1;
    info.cull = 70 * (ctx.quality?.drawDistance ?? 1);
    evalT -= dt;
    if (evalT <= 0) { evalT = 0.5; evaluate(); if (info.zone !== lastZone) { lastZone = info.zone; } }
    fishShadows.update(dt, t, info);
    aquarium.update(dt, t, info);
    cat.update(dt, t, info);
    for (const id in species) species[id].update?.(dt, t, info);
    fx.update(dt);
  }
  ctx.loop.add(update, ctx.ORDER?.actors ?? 20);

  // ---- bus wiring: fishing → fish population ----
  const offs = [
    ctx.bus.on('fishing:cast', e => { if (e?.point) fishShadows.onCast(e.point, e.habitat); }),
    ctx.bus.on('fishing:bite', () => fishShadows.onBite()),
    ctx.bus.on('fishing:escape', () => fishShadows.onEscape()),
    ctx.bus.on('fishing:catch', () => fishShadows.onCatch()),
    ctx.bus.on('fishing:cancel', () => fishShadows.onCancel()),
    ctx.bus.on('time:hour', e => { if (!e?.skipping) species.dolphin.onHour?.(info, wanted('dolphin') > 0); }),
    ctx.bus.on('quality:change', () => { evalT = 0; }),
  ];

  // ---- interactables (pet the cat) ----
  let catReg = null;
  const registerCat = () => {
    const reg = ctx.world?.interactables?.register;
    if (!reg || catReg) return;
    try {
      catReg = ctx.world.interactables.register({
        id: 'cat', pos: cat.position, radius: 1.4, kind: 'pet', labelKey: 'creatures.cat.pet', icon: 'paw',
        enabled: () => cat.object.visible && cat.state !== 'eat',
        onInteract: () => { ctx.player?.play?.('pet', { fade: 0.25 }); cat.pet(); },
      });
    } catch (e) { console.warn('[creatures] could not register the cat interactable', e); }
  };
  registerCat();
  ctx.bus.on('game:ready', registerCat);

  const api = {
    root, env, fx, species, aquarium, cat, fishShadows,
    nearestFish: (...a) => fishShadows.nearestFish(...a),
    attract: (...a) => fishShadows.attract(...a),
    release: (...a) => fishShadows.release(...a),
    seagulls: species.seagull, crabs: species.crab, turtles: species.turtle, frogs: species.frog,
    butterflies: species.butterfly, fireflies: species.firefly, dolphins: species.dolphin, rabbits: species.rabbit, jellyfish: species.jellyfish,
    /** Turn a species on/off regardless of data (null = back to automatic). */
    setEnabled(id, v) { if (v === false) { disabled.add(id); forced.delete(id); } else if (v === true) { forced.add(id); disabled.delete(id); } else { forced.delete(id); disabled.delete(id); } evalT = 0; },
    /** Ids of the species currently active. */
    active: () => Object.keys(active).filter(k => active[k]),
    info,
    update,
    dispose() { ctx.loop.remove(update); offs.forEach(o => o?.()); root.removeFromParent(); },
  };
  return api;
}

export default { init };
