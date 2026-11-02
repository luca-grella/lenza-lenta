// World — the "Arcipelago di Porto Lento": terrain, water, sky & light, weather, foliage, props, colliders,
// gameplay queries, POIs, interactables and map data.  `import { init } from './world/index.js'`; init(ctx)
// returns the World API (docs/ARCHITECTURE.md "World API" + docs/CHANGES.md [World] lines).
import * as THREE from 'three';
import { clamp, smoothstep, lerp, damp } from '../core/math.js';
import * as L from './layout.js';
import { createWorldUniforms, createMaterials, patchMaterial } from './materials.js';
import { createTerrain } from './terrain.js';
import { createWater } from './water.js';
import { createSky } from './sky.js';
import { createWeather, WEATHER_TYPES } from './weather.js';
import { createFoliage } from './foliage.js';
import { createColliders } from './colliders.js';
import { createInteractables } from './interactables.js';
import { createMinimap } from './minimap.js';
import { buildPlaces } from './props/places.js';
import { createBoat, createBeam, createChest } from './props/dynamic.js';
import * as strings from './strings.js';

const POOL = 4;           // pooled point lights for lanterns/fires at night
const LIGHT_KIND = { fire: [6.5, 9], lantern: [3.2, 7], window: [2.2, 6], string: [3.5, 8], cave: [5, 10], tank: [2.2, 6], lamp: [3, 7] };

/** @param {any} ctx */
export async function init(ctx) {
  const t0 = performance.now();
  ctx.i18n.addStrings(strings.it, strings.en);
  const { scene } = ctx;
  const root = new THREE.Group(); root.name = 'World';
  scene.add(root);
  const U = createWorldUniforms();
  const materials = createMaterials(U);
  const extraMats = {
    glass: materials.world(new THREE.MeshStandardMaterial({ color: 0xcff2f6, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false })),
    tank: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x2a8a98, emissiveIntensity: 0.55, roughness: 0.2, transparent: true, opacity: 0.82 }),
    lamp: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffd890, emissiveIntensity: 0, roughness: 0.3 }),
    crystal: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x7fe8ff, emissiveIntensity: 0.15, roughness: 0.25, flatShading: true }),
  };

  // ---------------------------------------------------------------- terrain + queries
  const terrain = createTerrain(ctx, U);
  root.add(terrain.group);
  const H = terrain.heightAt;
  const q = {};

  /** Water surface height at x,z (sea 0, pond, river, creek) or null on dry land. */
  function waterSurfaceAt(x, z) {
    const h = H(x, z);
    const dp = Math.hypot(x - L.POND.x, z - L.POND.z);
    if (dp < L.POND.r + 1.6 && h < L.POND.level) return L.POND.level;
    L.RIVER.query(x, z, 8, q);
    if (q.d < 8) { const w = L.RIVER.at(q.s, 3), lvl = L.RIVER.at(q.s, 2); if (q.d < w + 1.8 && lvl > 0.03 && h < lvl) return lvl; }
    L.CREEK.query(x, z, 4, q);
    if (q.d < 4) { const w = L.CREEK.at(q.s, 3), lvl = L.CREEK.at(q.s, 2); if (q.d < w + 1.1 && h < lvl) return lvl; }
    if (h < 0) return 0;
    return null;
  }
  const waterDepth = (x, z) => { const w = waterSurfaceAt(x, z); return w == null ? 0 : Math.max(0, w - H(x, z)); };
  const isWater = (x, z) => waterDepth(x, z) > 0.05;
  function habitatAt(x, z) {
    const ws = waterSurfaceAt(x, z);
    if (ws == null) return null;
    const depth = ws - H(x, z);
    if (depth < 0.05) return null;
    if (Math.hypot(x - L.CAVE.x, z - L.CAVE.z) < L.CAVE.r + 1.2) return 'cave';
    if (ws === L.POND.level && Math.hypot(x - L.POND.x, z - L.POND.z) < L.POND.r + 1.6) return 'pond';
    if (ws > 0.02) return 'river';
    if (Math.hypot(x - L.BAY.x, z - L.BAY.z) < L.BAY.r + 5 || (Math.abs(x - L.VILLAGE.dock.x) < 10 && z > L.VILLAGE.dock.z0 - 2 && z < L.VILLAGE.dock.z1 + 16)) return 'harbor';  // [Fix] covers every cast from the dock end
    const dr = Math.hypot((x - L.ISLANDS.palm.cx) / 1.2, z - L.ISLANDS.palm.cz);
    if (dr > 13 && dr < 36 && depth < 4.5) return 'reef';
    if (depth > 3) return 'deep';
    return 'shore';
  }

  // ---------------------------------------------------------------- places (buildings, props) + colliders
  const places = buildPlaces(ctx, { terrain, materials, U, extraMats, waterSurfaceAt });
  root.add(places.group);
  const colliders = createColliders({ heightAt: H, slopeAt: terrain.slopeAt, waterSurfaceAt, bound: L.HALF - 3 });
  for (const c of places.colliders) colliders.add(c);
  for (const s of places.surfaces) colliders.addSurface(s);
  // home tiers: all built, only one visible
  for (const t of places.homeTiers) {
    root.add(t.group);
    t.cols = t.colliders.map(c => colliders.add({ ...c }));
    t.surfs = t.surfaces.map(s => colliders.addSurface({ ...s }));
  }

  // ---------------------------------------------------------------- water, sky, weather
  const water = createWater(ctx, U, terrain);
  root.add(water.group);
  water.setRiverRocks(places.riverRocks);
  const sky = createSky(ctx, U);
  root.add(sky.group);
  const groundY = (x, z) => colliders.groundY(x, z);
  const weather = createWeather(ctx, U, { heightAt: H, waterSurfaceAt, groundY });
  root.add(weather.group);

  // ---------------------------------------------------------------- foliage (after places: exclusions)
  const foliage = createFoliage(ctx, U, { terrain, exclusions: places.exclusions });
  root.add(foliage.group);
  for (const c of foliage.colliders()) colliders.add(c);

  // ---------------------------------------------------------------- dynamic objects
  const dyn = places.dyn;
  if (dyn.flames) root.add(dyn.flames);
  if (dyn.sailsPivot) root.add(dyn.sailsPivot);
  const beam = createBeam();
  if (dyn.lighthouse) { beam.position.copy(dyn.lighthouse.lamp); root.add(beam); }
  const chestMat = materials.world(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  const chest = createChest(chestMat);
  if (dyn.treasurePos) { chest.object.position.copy(dyn.treasurePos); chest.object.rotation.y = 0.3; root.add(chest.object); colliders.add({ type: 'circle', x: dyn.treasurePos.x, z: dyn.treasurePos.z, r: 0.6 }); }

  // pooled point lights
  const glows = [...places.glows];
  const lights = Array.from({ length: POOL }, () => { const l = new THREE.PointLight(0xffb060, 0, 8, 2); l.castShadow = false; root.add(l); return { light: l, src: null, cur: 0 }; });

  // ---------------------------------------------------------------- POIs, interactables
  const pois = places.pois;
  const interactables = createInteractables();
  const homeState = { tier: -1 };
  function setHomeTier(tier) {
    tier = clamp(tier | 0, 0, places.homeTiers.length - 1);
    if (tier === homeState.tier) return;
    homeState.tier = tier;
    for (const t of places.homeTiers) {
      const on = t.tier === tier;
      t.group.visible = on;
      for (const c of t.cols) c.off = !on;
      for (const s of t.surfs) s.off = !on;
    }
    const cur = places.homeTiers[tier];
    pois.home_bed = { id: 'home_bed', x: cur.bed.x, y: cur.bed.y, z: cur.bed.z, facing: L.HOME.rot, zone: 'home_beach' };
    pois.home_door = { id: 'home_door', x: cur.door.x, y: groundY(cur.door.x, cur.door.z), z: cur.door.z, facing: L.HOME.rot, zone: 'home_beach' };
    activeGlows = [...glows, ...cur.glows];
  }
  let activeGlows = glows;
  setHomeTier(ctx.save.state.home?.tier ?? 0);
  // Fallback "sit" actions for sandboxes: in the game Systems' interact owns benches (bench_* POIs) and its own
  // sitting state (stand-up button), so these stay disabled there to never seat the player behind its back.
  for (const p of Object.values(pois)) {
    if (!p.id.startsWith('bench_') || (p.kind !== 'bench' && p.kind !== 'edge')) continue;
    interactables.register({
      id: 'sit_' + p.id, pos: p, radius: 1.5, kind: 'sit', labelKey: p.kind === 'edge' ? 'world.sit_edge' : 'world.sit', icon: 'sit',
      enabled: () => !ctx.systems?.interact && !!ctx.player?.sitAt && !['boat', 'sit', 'fishing', 'sleep', 'cutscene'].includes(ctx.player.state),
      onInteract: () => ctx.player?.sitAt?.(p),
    });
  }

  // [Fix] From the cabin/cottage tiers the bed is deep inside the house (the house is solid), out of the 2.4 m reach of
  // the bed action: the front door offers the same sleep/nap action. Tier 0 (tent) keeps the bed itself.
  interactables.register({
    id: 'home_sleep_door', get pos() { return pois.home_door; }, radius: 1.9, kind: 'sleep', icon: 'sleep', priority: 2,
    get labelKey() { return ctx.systems?.home?.sleepKind?.() === 'nap' ? 'sys.act.nap' : 'sys.act.sleep'; },
    enabled: () => homeState.tier >= 1 && !!ctx.systems?.home?.sleep && !ctx.systems.home.sleeping && !['boat', 'sit', 'fishing', 'sleep', 'cutscene'].includes(ctx.player?.state),
    onInteract: () => ctx.systems?.home?.sleep?.(),
  });

  // ---------------------------------------------------------------- state & helpers
  const _focus = new THREE.Vector3();
  function focusPoint() {
    const o = ctx.player?.object || ctx.cameraRig?.followed;
    if (o) return o.getWorldPosition(_focus);
    return _focus.copy(ctx.cameraRig?.lookTarget || ctx.camera.position);
  }
  let lighthouseForced = null;
  let curZone = null, zoneTimer = 0, audioTimer = 0, lightTimer = 0;
  const amb = { waves: -1, waterfall: -1, river: -1 };
  const tmpC = new THREE.Color();

  function seaDistance(x, z) {
    if (H(x, z) < 0) return 0;
    for (const r of [3, 6, 10, 15, 22, 30]) for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; if (H(x + Math.cos(a) * r, z + Math.sin(a) * r) < -0.2) return r; }
    return 40;
  }

  function updateAudio(p) {
    const a = ctx.audio;
    if (!a?.setAmbient) return;
    const set = (k, v) => { v = clamp(v, 0, 1); if (Math.abs(amb[k] - v) > 0.02) { amb[k] = v; a.setAmbient(k, v); } };
    set('waves', 0.75 * (1 - smoothstep(2, 30, seaDistance(p.x, p.z))));
    const dw = Math.hypot(p.x - L.WATERFALL.x, p.z - L.WATERFALL.zBottom);
    set('waterfall', 0.9 * (1 - smoothstep(5, 42, dw)));
    L.RIVER.query(p.x, p.z, 30, q);
    const dr = Math.min(q.d, 30);
    set('river', 0.6 * (1 - smoothstep(2, 22, dr)));
  }

  function updateLights(Lt, nightGlow, p) {
    // pick the closest light sources to the focus point
    const cand = [];
    for (const g of activeGlows) {
      if (g.kind === 'cave' && Lt.night < 0.3) continue;
      const d = (g.x - p.x) ** 2 + (g.z - p.z) ** 2;
      if (d < 40 * 40) cand.push([d, g]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < POOL; i++) lights[i].src = cand[i]?.[1] || null;
  }

  // ---------------------------------------------------------------- world API
  const world = {
    root, terrain, water, sky, weatherSystem: weather, foliage, colliders, places,
    materials: { wind: materials.wind, world: materials.world, U, patch: (m, o) => patchMaterial(m, U, o) },
    /** Sea level. */
    waterLevel: 0,
    /** Player start: in front of the home, facing the sea. */
    spawn: { x: L.SPAWN.x, z: L.SPAWN.z, facing: L.SPAWN.facing },
    sun: sky.sun, hemi: sky.hemi,
    bounds: { minX: -L.HALF, maxX: L.HALF, minZ: -L.HALF, maxZ: L.HALF },
    zones: Object.entries(L.ZONE_CENTERS).map(([id, c]) => ({ id, x: c.x, z: c.z })),
    /** Glass tanks inside the aquarium building (world space centre + size), for Creatures to fill with fish. */
    aquariumTanks: places.aquariumTanks,

    heightAt: H,
    groundY,
    slopeAt: terrain.slopeAt,
    normalAt: terrain.normalAt,
    waterSurfaceAt,
    isWater,
    waterDepth,
    habitatAt,
    zoneAt: L.zoneAt,
    walkable: (x, z) => colliders.walkable(x, z),
    resolveMove: (from, to, radius = 0.35, opts) => colliders.resolveMove(from, to, radius, opts),
    /** Deep enough to row (≥ 0.65 m of sea). */
    boatWaterOK: (x, z) => colliders.boatOK(x, z),
    /**
     * First (or farthest) fishable water point from origin along dir (xz) within maxDist.
     * @param {{x:number,z:number}} origin @param {{x:number,z:number}} dir
     * @param {number} [maxDist=12] @param {{minDepth?:number, far?:boolean, step?:number, minDist?:number}} [o]
     * @returns {{point:THREE.Vector3, habitat:string, dist:number, depth:number}|null}
     */
    nearestWaterAlong(origin, dir, maxDist = 12, o = {}) {
      const len = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / len, dz = dir.z / len;
      const step = o.step || 0.35, minDepth = o.minDepth ?? 0.25;
      let found = null;
      for (let d = o.minDist ?? 0.6; d <= maxDist + 1e-6; d += step) {
        const x = origin.x + dx * d, z = origin.z + dz * d;
        const ws = waterSurfaceAt(x, z);
        if (ws == null) continue;
        const depth = ws - H(x, z);
        if (depth < minDepth) continue;
        if (colliders.surfaceAt(x, z) != null) continue; // under a dock
        found = { point: new THREE.Vector3(x, ws, z), habitat: habitatAt(x, z), dist: d, depth };
        if (!o.far) return found;
      }
      return found;
    },

    /** Named point {id, x, y, z, facing, zone, kind?} or null. */
    poi(id) { return pois[id] || null; },
    /** All POIs whose id starts with prefix (e.g. 'bench_', 'forage_pine_forest'). */
    poiList(prefix = '') { return Object.values(pois).filter(p => p.id.startsWith(prefix)); },
    /**
     * Dock-edge sit spots: [{id:'edge_<dock>_<n>', x, y (deck height), z, facing (toward the water), kind:'dock_edge',
     * seat:'edge', dock:'home'|'village'|'pond'|'palm', zone}] — also POIs, so ctx.player.sitAt(spot or id) works (any
     * kind but 'bench' sits as an edge). Not interactables and not kind 'edge' on purpose: Gameplay decides when to offer
     * them (along the dock sides they must not steal the Cast button).
     */
    sitSpots: places.sitSpots,
    /** Nearest dock-edge sit spot within maxDist (xz) of pos, or null. o.dock filters by dock. */
    nearestSitSpot(pos, maxDist = 1.6, o = {}) {
      let best = null, bd = maxDist;
      for (const s of places.sitSpots) { if (o.dock && s.dock !== o.dock) continue; const d = Math.hypot(s.x - pos.x, s.z - pos.z); if (d <= bd) { bd = d; best = s; } }
      return best;
    },
    /** Ramps/gangways/steps added so every deck is reachable: [{x0,z0,y0 (land end), x1,z1,y1 (deck end), hw, tag}]. */
    ramps: places.ramps,
    interactables,
    minimap: null,

    /** Live weather state {type, intensity, wind:{x,z,strength}, rain, fog, cloud, overcast}. */
    get weather() { return weather.state; },
    /** Change weather (smooth by default). opts {instant, duration (game hours)}. */
    setWeather(type, opts = {}) { if (!WEATHER_TYPES.includes(type)) { console.warn('[world] weather?', type); return; } weather.set(type, opts); },

    /** Rowboat for the Gameplay boat system (see props/dynamic.js createBoat). */
    createBoat: opts => createBoat(world, opts),
    /** Home tier 0 tent, 1 cabin, 2 cottage (also follows bus 'home:upgrade' and save.home.tier). */
    setHomeTier,
    get homeTier() { return homeState.tier; },
    /** Force the lighthouse lamp on/off (null = follow save.state.flags.lighthouse_lit). */
    setLighthouse(v) { lighthouseForced = v; },
    get lighthouseLit() { return lighthouseForced ?? !!ctx.save.state.flags?.lighthouse_lit; },
    /** Treasure chest on Turtle Isle: {object, setOpen(bool, instant), open}. */
    treasure: chest,
    /** Windmill sails Object3D, campfire flames, lighthouse beam (for cutscenes). */
    objects: { sails: dyn.sailsPivot, flames: dyn.flames, beam, chest: chest.object },

    update(dt, t) {
      U.uTime.value = t;
      const p = focusPoint();
      weather.update(dt, t, p);
      const Lt = ctx.time.lighting({ overcast: weather.env.overcast });
      U.uNight.value = Lt.night;
      sky.update(dt, Lt, weather.env);
      // cave glow at night (and a little by day)
      weather.env.caveGlow = lerp(0.12, 1, smoothstep(0.2, 0.8, Lt.night));
      water.update(dt, t, Lt, weather.env);

      // night glow: windows, lanterns, campfire
      const nightGlow = clamp(smoothstep(0.08, 0.75, Lt.night + (1 - Lt.daylight) * 0.5) + weather.env.overcast * 0.25 + weather.env.fog * 0.3, 0, 1);
      const gm = materials.glow();
      gm.color.copy(gm.userData.dayColor).lerp(gm.userData.nightColor, nightGlow);
      const lit = world.lighthouseLit;
      extraMats.lamp.emissiveIntensity = lit ? lerp(0.6, 3.2, nightGlow) : 0.05;
      extraMats.crystal.emissiveIntensity = lerp(0.12, 2.0, smoothstep(0.3, 0.9, Lt.night));
      extraMats.tank.emissiveIntensity = lerp(0.35, 1.1, nightGlow);
      if (dyn.flames) { dyn.flames.material.uniforms.uTime.value = t; dyn.flames.material.uniforms.uBright.value = lerp(1.0, 2.0, nightGlow) * (1 - weather.env.rain * 0.4); }
      if (dyn.sails) dyn.sails.rotation.z -= dt * (0.25 + weather.env.wind * 0.7);
      beam.visible = lit && nightGlow > 0.05;
      if (beam.visible) { beam.rotation.y = t * 0.55; beam.userData.mat.uniforms.uI.value = smoothstep(0.05, 0.6, nightGlow) * (0.8 + weather.env.fog * 0.6); }
      chest.update(dt);

      lightTimer -= dt;
      if (lightTimer <= 0) { lightTimer = 0.35; updateLights(Lt, nightGlow, p); }
      let gi = 0;
      for (const L2 of lights) {
        const s = L2.src;
        const k = s ? LIGHT_KIND[s.kind] || LIGHT_KIND.lantern : null;
        let target = 0;
        if (s) {
          target = k[0] * s.intensity * (s.kind === 'cave' ? smoothstep(0.3, 0.9, Lt.night) : nightGlow);
          if (s.kind === 'fire') target *= 0.85 + 0.15 * Math.sin(t * 13 + Math.sin(t * 7.3) * 2) + 0.25 * (1 - nightGlow);
          L2.light.position.set(s.x, s.y, s.z); L2.light.color.copy(s.color); L2.light.distance = k[1];
        }
        L2.cur = damp(L2.cur, target, 4, dt);
        L2.light.intensity = L2.cur;
        L2.light.visible = true;
        // water reflections of the same lights
        if (gi < water.glowPos.length) {
          if (s && L2.cur > 0.05) { water.glowPos[gi].set(s.x, s.y, s.z); tmpC.copy(s.color).multiplyScalar(L2.cur / k[0] * 0.9); water.glowCol[gi].set(tmpC.r, tmpC.g, tmpC.b); }
          else { water.glowPos[gi].set(0, -100, 0); water.glowCol[gi].set(0, 0, 0); }
          gi++;
        }
      }

      foliage.update(dt, p);

      // zone + ambient audio
      zoneTimer -= dt;
      if (zoneTimer <= 0) {
        zoneTimer = 0.3;
        const z = L.zoneAt(p.x, p.z);
        if (z !== curZone) { const prev = curZone; curZone = z; ctx.bus.emit('zone:enter', { zone: z, prev }); }
      }
      audioTimer -= dt;
      if (audioTimer <= 0) { audioTimer = 0.4; updateAudio(p); }
    },
    get zone() { return curZone; },
    stats: null,
  };
  world.minimap = createMinimap(world, terrain);

  // ---------------------------------------------------------------- bus wiring
  ctx.bus.on('home:upgrade', e => setHomeTier(e?.tier ?? (ctx.save.state.home?.tier ?? 0)));
  ctx.bus.on('save:loaded', () => {
    setHomeTier(ctx.save.state.home?.tier ?? 0);
    if (ctx.save.state.flags?.treasure_open) chest.setOpen(true, true);
    weather.set(ctx.save.state.weather?.type || 'clear', { instant: true, duration: Math.max(1, (ctx.save.state.weather?.until ?? 0) - (ctx.time.day * 24 + ctx.time.hours)) });
  });
  ctx.bus.on('save:reset', () => { setHomeTier(0); chest.setOpen(false, true); });
  ctx.bus.on('treasure:open', () => chest.setOpen(true));
  let lastAutoType = weather.type;
  ctx.bus.on('time:hour', e => {
    if (e?.skipping) return;
    weather.tick();
    if (weather.type !== lastAutoType) { ctx.ui?.toast?.(`world.weather.change.${weather.type}`); }
    lastAutoType = weather.type;
  });
  ctx.bus.on('weather:change', e => { lastAutoType = e?.type; });
  ctx.bus.on('quality:change', () => { sky.sun.castShadow = ctx.quality.shadows; foliage.invalidate(); });
  sky.sun.castShadow = ctx.quality?.shadows ?? true;

  ctx.loop.add(world.update, ctx.ORDER?.world ?? 30);
  // first frame state
  world.update(0, ctx.loop.t || 0);
  world.stats = { ...terrain.stats, initMs: Math.round(performance.now() - t0), foliage: foliage.counts, colliders: colliders.all.length, surfaces: colliders.surfaces.length, pois: Object.keys(pois).length };
  if (ctx.isDebug) console.info('[world] ready', world.stats);
  return world;
}

export default { init };
