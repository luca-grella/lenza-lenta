// Swimming fish near the player (real species models seen through the water) and aquarium tanks.
//
// Population: per habitat around the player (counts from data.fishShadows), species picked by habitat/time/
// weather/rarity; small fish school (boids), big ones cruise slowly. Fishing hooks: nearestFish/attract/release
// + bus events (fishing:cast → a curious fish approaches the bobber, fishing:bite → it lunges and vanishes,
// fishing:escape → it bolts away, fishing:catch → gone).
// Rendering trick: water surfaces are opaque, so fish are drawn just above the surface, flattened, tinted
// toward the water colour and semi-transparent: from the 3/4 camera they read as fish seen through the water.
import * as THREE from 'three';

const TINT = { pond: '#3f8a66', river: '#3f9688', shore: '#38b4b8', harbor: '#357f98', deep: '#1f5f8c', reef: '#38c0c4', cave: '#2a4f78' };
const RARITY_W = { common: 100, uncommon: 34, rare: 8, epic: 2, legendary: 0 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color();

/**
 * @param {any} ctx @param {any} env @param {THREE.Object3D} root @param {any} fx
 */
export function createFishPopulation(ctx, env, root, fx) {
  const group = new THREE.Group(); group.name = 'FishPopulation'; root.add(group);
  /** @type {any[]} */
  const fishes = [];
  let scanT = 0, engaged = null, castPoint = null, castHabitat = null, castT = -1;
  const R = Math.random;
  const visualScale = 1.3; // a touch bigger than life so they read from the camera

  const counts = () => ctx.data?.fishShadows || { pond: 6, river: 6, shore: 8, harbor: 8, deep: 7, reef: 12, cave: 5 };
  const qMul = () => (ctx.quality?.particles ?? 1);

  function speciesFor(habitat) {
    const fishList = ctx.data?.fish || [];
    const phase = env.phase, weather = env.weather;
    const c = [];
    for (const f of fishList) {
      if (!f.habitats?.includes(habitat)) continue;
      const shape = f.model?.shape;
      if (shape === 'crab' || f.rarity === 'legendary') continue;
      if (f.times && !f.times.includes(phase)) continue;
      if (f.weather && f.weather[weather] === 0) continue;
      if (!ctx.fishModels?.has?.(f.id)) continue;
      c.push([f, (RARITY_W[f.rarity] ?? 10) * (f.weather?.[weather] ?? 1)]);
    }
    if (!c.length) return null;
    let tot = c.reduce((s, e) => s + e[1], 0), r = R() * tot;
    for (const [f, w] of c) { r -= w; if (r <= 0) return f; }
    return c[c.length - 1][0];
  }

  function spawn(sp, x, z, habitat, o = {}) {
    if (!ctx.fishModels) return null;
    const sizeCm = sp.size ? sp.size[0] + (sp.size[1] - sp.size[0]) * (0.25 + R() * 0.5) : 30;
    const inst = ctx.fishModels.create(sp.id, { lod: 1, size: sizeCm, shadow: false });
    if (!inst) return null;
    const small = sizeCm < 26;
    const f = {
      inst, id: sp.id, habitat, small, size: sizeCm / 100, school: o.school || null,
      pos: new THREE.Vector3(x, 0, z), heading: o.heading ?? R() * Math.PI * 2, speed: 0, cruise: small ? 0.9 + R() * 0.5 : 0.45 + R() * 0.35,
      target: null, state: 'swim', stateT: 0, fade: 0, depth: 0.4 + R() * 0.5, turn: 0, wobble: R() * 10, alive: true,
      mode: ctx.fishModels.swimMode?.(sp.id) || 'swim',
    };
    inst.object.scale.multiplyScalar(visualScale);
    inst.object.scale.y *= f.mode === 'upright' ? 0.6 : 0.42;
    inst.setSubmerged({ tint: TINT[habitat] || TINT.shore, murk: 0.5, alpha: 0 });
    group.add(inst.object);
    fishes.push(f);
    return f;
  }

  function remove(f) { f.alive = false; f.inst.dispose(); const i = fishes.indexOf(f); if (i >= 0) fishes.splice(i, 1); if (engaged === f) engaged = null; }

  function okWater(x, z, habitat, minDepth = 0.35) {
    if (!env.isWater(x, z) || env.depth(x, z) < minDepth) return false;
    if (habitat && env.habitat(x, z) !== habitat) return false;
    return true;
  }

  function pickTarget(f) {
    const s = env.findSpot(f.pos.x, f.pos.z, 2, f.small ? 6 : 9, (x, z) => okWater(x, z, f.habitat, 0.45));
    f.target = s ? new THREE.Vector3(s.x, 0, s.z) : null;
  }

  // ---- population management ----
  function scan(player) {
    const near = {};
    const rnd = Math.random;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, r = 4 + (i % 4) * 4;
      const x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
      if (!env.isWater(x, z) || env.depth(x, z) < 0.35) continue;
      const h = env.habitat(x, z); if (h) near[h] = (near[h] || 0) + 1;
    }
    // despawn far / wrong ones
    for (const f of fishes.slice()) {
      const d = Math.hypot(f.pos.x - player.x, f.pos.z - player.z);
      if (f !== engaged && (d > 30 || (d > 18 && !near[f.habitat]))) f.state = 'leave';
    }
    // spawn to reach the desired counts
    const C = counts();
    for (const h in near) {
      const want = Math.max(1, Math.round((C[h] ?? 5) * qMul() * Math.min(1, near[h] / 6)));
      let have = fishes.filter(f => f.habitat === h && f.state !== 'leave').length;
      let guard = 0;
      while (have < want && guard++ < 6) {
        const s = env.findSpot(player.x, player.z, 7, 18, (x, z) => okWater(x, z, h, 0.5), rnd, 20);
        if (!s) break;
        const sp = speciesFor(h); if (!sp) break;
        const sizeMax = sp.size?.[1] ?? 30;
        if (sizeMax <= 26 && have + 2 < want) {
          const n = Math.min(want - have, 3 + Math.floor(R() * 3));
          const school = { id: R(), heading: R() * Math.PI * 2 };
          for (let k = 0; k < n; k++) if (spawn(sp, s.x + (R() - 0.5) * 1.2, s.z + (R() - 0.5) * 1.2, h, { school, heading: school.heading })) have++;
        } else if (spawn(sp, s.x, s.z, h)) have++;
      }
    }
  }

  // ---- steering ----
  function steer(f, dt, player) {
    f.stateT += dt;
    let goal = null, spd = f.cruise;
    if (f.state === 'curious' && castPoint) {
      const d = Math.hypot(castPoint.x - f.pos.x, castPoint.z - f.pos.z);
      // approach, then circle slowly around the bobber with little nibbles
      const ang = Math.atan2(f.pos.x - castPoint.x, f.pos.z - castPoint.z) + dt * 0.4;
      const ring = 0.55 + 0.25 * Math.sin(f.stateT * 0.9);
      goal = _v.set(castPoint.x + Math.sin(ang) * ring, 0, castPoint.z + Math.cos(ang) * ring);
      spd = d > 2 ? 0.8 : 0.3 + 0.2 * Math.max(0, Math.sin(f.stateT * 2.3));
      f.depth += (0.15 - f.depth) * Math.min(1, dt);
      if (f.stateT > 45) { f.state = 'swim'; }
    } else if (f.state === 'lunge' && castPoint) {
      goal = _v.set(castPoint.x, 0, castPoint.z); spd = 2.6;
      if (Math.hypot(castPoint.x - f.pos.x, castPoint.z - f.pos.z) < 0.25 || f.stateT > 1) { f.state = 'hooked'; f.stateT = 0; fx.ripple(castPoint, 0.5); }
    } else if (f.state === 'flee') {
      const away = f.fleeFrom || player;
      goal = _v.set(f.pos.x + (f.pos.x - away.x), 0, f.pos.z + (f.pos.z - away.z));
      spd = 3.2; f.depth += (1 - f.depth) * Math.min(1, dt * 1.5);
      if (f.stateT > 1.6) f.state = 'leave';
    } else if (f.state === 'leave') {
      spd = f.cruise; f.depth += (1.2 - f.depth) * Math.min(1, dt * 0.8);
    } else {
      // schooling: follow the school heading with separation; loners wander between targets
      if (f.school) {
        const mates = fishes.filter(o => o.school === f.school && o !== f && o.state === 'swim');
        _w.set(0, 0, 0); let n = 0;
        for (const o of mates) { _w.x += o.pos.x; _w.z += o.pos.z; n++; }
        if (!f.target || Math.hypot(f.target.x - f.pos.x, f.target.z - f.pos.z) < 0.8 || f.stateT > 9) { pickTarget(f); f.stateT = 0; if (f.target) for (const o of mates) o.target = f.target; }
        goal = _v.copy(f.target || f.pos);
        if (n) { goal.x += ((_w.x / n) - f.pos.x) * 0.6; goal.z += ((_w.z / n) - f.pos.z) * 0.6; }
        for (const o of mates) { const dx = f.pos.x - o.pos.x, dz = f.pos.z - o.pos.z, d2 = dx * dx + dz * dz; if (d2 < 0.16) { goal.x += dx * 2; goal.z += dz * 2; } }
      } else {
        if (!f.target || Math.hypot(f.target.x - f.pos.x, f.target.z - f.pos.z) < 0.6 || f.stateT > 14) { pickTarget(f); f.stateT = 0; f.pause = R() < 0.35 ? 1 + R() * 2.5 : 0; }
        goal = f.target ? _v.copy(f.target) : null;
        if (f.pause > 0) { f.pause -= dt; spd = 0.08; }
      }
      // shy: drift away from a walking player standing in the shallows
      const pd = Math.hypot(player.x - f.pos.x, player.z - f.pos.z);
      if (pd < 1.6) { goal = _v.set(f.pos.x * 2 - player.x, 0, f.pos.z * 2 - player.z); spd = 1.6; }
      f.depth += (0.45 + 0.25 * Math.sin(f.wobble + f.stateT * 0.2) - f.depth) * Math.min(1, dt * 0.5);
    }
    // turn toward the goal, avoid shallows ahead
    if (goal) {
      const want = Math.atan2(goal.x - f.pos.x, goal.z - f.pos.z);
      let da = THREE.MathUtils.euclideanModulo(want - f.heading + Math.PI, Math.PI * 2) - Math.PI;
      const ax = f.pos.x + Math.sin(f.heading) * 1.2, az = f.pos.z + Math.cos(f.heading) * 1.2;
      if (f.state !== 'lunge' && f.state !== 'curious' && !okWater(ax, az, null, 0.3)) da += 1.6;
      const rate = f.small ? 3.2 : 1.6;
      const turn = THREE.MathUtils.clamp(da, -rate * dt, rate * dt);
      f.heading += turn;
      f.turn += ((turn / Math.max(dt, 1e-3)) / rate - f.turn) * Math.min(1, dt * 5);
    }
    f.speed += (spd - f.speed) * Math.min(1, dt * (f.state === 'lunge' || f.state === 'flee' ? 6 : 1.5));
    const nx = f.pos.x + Math.sin(f.heading) * f.speed * dt, nz = f.pos.z + Math.cos(f.heading) * f.speed * dt;
    if (f.state === 'lunge' || f.state === 'curious' || okWater(nx, nz, null, 0.25)) { f.pos.x = nx; f.pos.z = nz; }
    else f.heading += Math.PI * dt;
  }

  function visual(f, dt, tintLight) {
    const o = f.inst.object;
    const wl = env.waterLevel;
    const want = f.state === 'leave' || f.state === 'hooked' ? 0 : 1;
    f.fade += (want - f.fade) * Math.min(1, dt * (want ? 0.9 : 2.2));
    o.position.set(f.pos.x, wl + 0.035 + (1 - Math.min(1, f.depth)) * 0.01, f.pos.z);
    o.rotation.set(0, f.heading, 0);
    if (f.mode === 'upright') o.rotation.y += Math.sin(f.wobble + f.stateT) * 0.3;
    const murk = THREE.MathUtils.clamp(0.25 + f.depth * 0.45, 0.15, 0.85);
    _c.set(TINT[f.habitat] || TINT.shore).multiplyScalar(tintLight);
    f.inst.uniforms.uTint.value.copy(_c);
    f.inst.uniforms.uMurk.value = murk;
    f.inst.uniforms.uAlpha.value = f.fade * THREE.MathUtils.clamp(1.05 - f.depth * 0.45, 0.35, 0.9);
    o.visible = f.fade > 0.01;
    const swim = THREE.MathUtils.clamp(f.speed / Math.max(0.3, f.cruise), 0, 2.2);
    f.inst.animate(dt, swim, -f.turn * 0.7);
  }

  const api = {
    group,
    get list() { return fishes; },
    /** Nearest visible fish to a point (optionally of a habitat) within radius, or null. */
    nearestFish(point, habitat = null, radius = 6) {
      let best = null, bd = radius;
      for (const f of fishes) {
        if (f.state !== 'swim' && f.state !== 'curious') continue;
        if (habitat && f.habitat !== habitat) continue;
        const d = Math.hypot(f.pos.x - point.x, f.pos.z - point.z);
        if (d < bd) { bd = d; best = f; }
      }
      return best;
    },
    /** Make a fish curious about a point (the bobber): it swims over and circles it. */
    attract(f, point) {
      if (!f) return null;
      castPoint = castPoint || new THREE.Vector3(); castPoint.set(point.x, 0, point.z);
      if (engaged && engaged !== f && engaged.state === 'curious') engaged.state = 'swim';
      engaged = f; f.state = 'curious'; f.stateT = 0; f.school = null;
      return f;
    },
    /** Let an attracted fish go back to swimming. */
    release(f = engaged) { if (f && (f.state === 'curious' || f.state === 'lunge')) { f.state = 'swim'; f.stateT = 0; } if (f === engaged) engaged = null; },
    /** The curious fish lunges at the bobber and disappears under it (hooked). */
    bite(f = engaged) { if (!f) return; f.state = 'lunge'; f.stateT = 0; },
    /** Everything near a point darts away. */
    flee(point, radius = 5) {
      for (const f of fishes) if (Math.hypot(f.pos.x - point.x, f.pos.z - point.z) < radius && f.state !== 'hooked') { f.state = 'flee'; f.stateT = 0; f.fleeFrom = new THREE.Vector3(point.x, 0, point.z); }
    },
    /** Spawn a specific species swimming at a point (e.g. to show the hooked fish escaping). */
    spawnAt(point, speciesId, habitat = null) {
      const sp = ctx.data?.fishById?.[speciesId] || ctx.data?.fish?.find(f => f.id === speciesId); if (!sp) return null;
      return spawn(sp, point.x, point.z, habitat || env.habitat(point.x, point.z) || sp.habitats?.[0] || 'shore');
    },
    /** The fish currently engaged with the bobber (or null). */
    get engaged() { return engaged; },
    update(dt, t, info) {
      const p = info.player;
      scanT -= dt;
      if (scanT <= 0) { scanT = 0.6; scan(p); }
      // a cast attracts the nearest fish after a short calm wait (or brings one in from further away)
      if (castT >= 0) {
        castT -= dt;
        if (castT < 0 && castPoint && !engaged) {
          let f = api.nearestFish(castPoint, castHabitat, 9);
          if (!f && castHabitat) {
            const s = env.findSpot(castPoint.x, castPoint.z, 5, 8, (x, z) => okWater(x, z, castHabitat, 0.4));
            const sp = s && speciesFor(castHabitat);
            if (sp) f = spawn(sp, s.x, s.z, castHabitat);
          }
          if (f) api.attract(f, castPoint);
        }
      }
      const L = env.lighting();
      const tintLight = 0.28 + 0.72 * Math.min(1, L.sunIntensity / 2.6 * 0.8 + L.hemiIntensity * 0.25);
      for (const f of fishes.slice()) {
        steer(f, dt, p);
        visual(f, dt, tintLight);
        if ((f.state === 'leave' && f.fade < 0.02) || (f.state === 'hooked' && f.fade < 0.02 && f !== engaged)) remove(f);
      }
    },
    onCast(point, habitat) { castPoint = new THREE.Vector3(point.x, 0, point.z); castHabitat = habitat || env.habitat(point.x, point.z); castT = 1.5 + R() * 2.5; if (engaged) api.release(engaged); },
    onBite() { if (engaged) api.bite(engaged); },
    onEscape() {
      if (engaged) { engaged.state = 'flee'; engaged.stateT = 0; engaged.depth = 0.2; engaged.fade = 1; engaged.fleeFrom = new THREE.Vector3(env.player().x, 0, env.player().z); }
      if (castPoint) { fx.splash(castPoint, 0.35); api.flee(castPoint, 3); }
      engaged = null; castPoint = null; castT = -1;
    },
    onCatch() { if (engaged) { engaged.state = 'hooked'; engaged.fade = 0; } engaged = null; castPoint = null; castT = -1; },
    onCancel() { if (engaged) api.release(engaged); castPoint = null; castT = -1; },
    clear() { for (const f of fishes.slice()) remove(f); },
  };
  return api;
}

// ------------------------------------------------------------------------------------------------
// Aquarium tanks
// ------------------------------------------------------------------------------------------------
const FRESH = new Set(['pond', 'river']);

/** Simple glass tank (used when World has no tank POIs, and by the sandbox). */
export function makeTank(w = 2.2, h = 1.2, d = 1.0, o = {}) {
  const g = new THREE.Group(); g.name = 'AquariumTank';
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0xbfe9f0, transparent: true, opacity: 0.18, roughness: 0.08, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.y = h / 2; glass.renderOrder = 4; g.add(glass);
  const water = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, h * 0.86, d * 0.96), new THREE.MeshStandardMaterial({ color: o.fresh ? 0x5fb89a : 0x4cc0d4, transparent: true, opacity: 0.22, roughness: 0.3, depthWrite: false }));
  water.position.y = h * 0.45; water.renderOrder = 3; g.add(water);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x7a4b2c, roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.12, d + 0.12), frameMat); base.position.y = -0.04; g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.06, d + 0.1), frameMat); top.position.y = h + 0.02; g.add(top);
  const sand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.97, 0.08, d * 0.95), new THREE.MeshStandardMaterial({ color: 0xe8d39c, roughness: 1 })); sand.position.y = 0.05; g.add(sand);
  // a few plants and stones
  const plantMat = new THREE.MeshStandardMaterial({ color: o.fresh ? 0x4f9a3a : 0x3aa088, roughness: 0.8, side: THREE.DoubleSide });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const x = (i / 6 - 0.5) * w * 0.85, z = (i % 2 ? 0.25 : -0.25) * d;
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.35 + (i % 3) * 0.15, 1, 4), plantMat);
    leaf.geometry.translate(0, leaf.geometry.parameters.height / 2, 0); leaf.position.set(x, 0.08, z); leaf.rotation.y = i; leaf.userData.sway = i;
    g.add(leaf);
  }
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08 + i * 0.03, 0), stoneMat); s.position.set((i - 1) * w * 0.3, 0.1, d * 0.2 * (i - 1)); s.scale.y = 0.6; g.add(s); }
  g.userData.dims = { w, h, d };
  return g;
}

export function createAquarium(ctx, env, root) {
  const group = new THREE.Group(); group.name = 'AquariumFish'; root.add(group);
  const tanks = [];   // {object, w, h, d, fresh, fish: []}
  let built = false, dirty = true;
  const R = Math.random;

  function buildTanks() {
    built = true;
    for (const t of tanks) { for (const f of t.fish) f.inst.dispose(); if (t.own) t.object.removeFromParent(); }
    tanks.length = 0;
    const ids = env.poisWithPrefix('aquarium_tank_');
    for (const id of ids) {
      const p = env.poi(id);
      const w = p.w ?? 2.2, h = p.h ?? 1.1, d = p.d ?? 1.0;
      const holder = new THREE.Group(); holder.position.set(p.x, p.y ?? env.ground(p.x, p.z), p.z); holder.rotation.y = p.facing ?? 0;
      group.add(holder);
      tanks.push({ id, object: holder, w, h, d, fresh: p.habitat ? FRESH.has(p.habitat) : /fresh|pond|river/.test(id) || tanks.length % 2 === 0, fish: [], own: false, y0: p.floor ?? 0.12 });
    }
    if (!tanks.length) {
      // fallback: two glass tanks beside the aquarium building's door (until World places real ones)
      const a = env.poi('village_aquarium');
      if (a) {
        for (let i = 0; i < 2; i++) {
          const t = makeTank(2.0, 1.1, 0.9, { fresh: i === 0 });
          t.position.set(a.x + (i ? 1.6 : -1.6), env.ground(a.x, a.z), a.z + 2.4); t.rotation.y = a.facing ?? 0;
          group.add(t);
          tanks.push({ id: 'fallback_' + i, object: t, w: 2.0, h: 1.1, d: 0.9, fresh: i === 0, fish: [], own: true, y0: 0.12 });
        }
      }
    }
  }

  function donated() { return Object.keys(ctx.save?.state?.aquarium || {}).filter(id => ctx.save.state.aquarium[id] && ctx.fishModels?.has?.(id)); }

  function fill() {
    dirty = false;
    if (!built) buildTanks();
    for (const t of tanks) { for (const f of t.fish) f.inst.dispose(); t.fish = []; }
    if (!tanks.length || !ctx.fishModels) return;
    const list = donated();
    for (const id of list) {
      const sp = ctx.data?.fishById?.[id] || ctx.data?.fish?.find(f => f.id === id) || ctx.data?.junk?.find(f => f.id === id);
      if (!sp || sp.junk) continue;
      const fresh = sp.habitats?.some(h => FRESH.has(h));
      let cands = tanks.filter(t => t.fresh === !!fresh); if (!cands.length) cands = tanks;
      const t = cands.reduce((a, b) => (a.fish.length <= b.fish.length ? a : b));
      const len = Math.min((sp.size ? (sp.size[0] + sp.size[1]) / 200 : 0.3), t.w * 0.32, t.h * 0.45);
      const inst = ctx.fishModels.create(id, { lod: 1, scale: Math.max(0.12, len), shadow: false });
      if (!inst) continue;
      const mode = ctx.fishModels.swimMode?.(id) || 'swim';
      const f = { inst, mode, pos: new THREE.Vector3((R() - 0.5) * t.w * 0.6, t.y0 + 0.15 + R() * t.h * 0.55, (R() - 0.5) * t.d * 0.4), heading: R() * 6.28, target: new THREE.Vector3(), speed: 0.15, turn: 0, t: R() * 10 };
      f.target.copy(f.pos);
      if (mode === 'crawl') f.pos.y = t.y0 + 0.02 + inst.length * 0.15;
      t.object.add(inst.object);
      t.fish.push(f);
    }
  }

  const api = {
    group, tanks,
    /** Rebuild the tanks from POIs and refill with the donated species. */
    refresh() { built = false; dirty = true; },
    update(dt, t, info) {
      if (dirty) fill();
      for (const tk of tanks) {
        const wp = tk.object.getWorldPosition(_v);
        const near = Math.hypot(wp.x - info.player.x, wp.z - info.player.z) < 30;
        tk.object.visible = near;
        if (!near) continue;
        if (tk.own) tk.object.traverse(o => { if (o.userData.sway !== undefined) o.rotation.z = Math.sin(t * 1.2 + o.userData.sway) * 0.12; });
        for (const f of tk.fish) {
          f.t += dt;
          const lim = { x: tk.w * 0.38, y0: tk.y0 + 0.12, y1: tk.y0 + tk.h * 0.7, z: tk.d * 0.3 };
          if (f.pos.distanceTo(f.target) < 0.12 || f.t > 7) {
            f.t = 0;
            f.target.set((R() * 2 - 1) * lim.x, f.mode === 'crawl' ? f.pos.y : lim.y0 + R() * (lim.y1 - lim.y0), (R() * 2 - 1) * lim.z);
          }
          const want = Math.atan2(f.target.x - f.pos.x, f.target.z - f.pos.z);
          const da = THREE.MathUtils.euclideanModulo(want - f.heading + Math.PI, Math.PI * 2) - Math.PI;
          const turn = THREE.MathUtils.clamp(da, -1.5 * dt, 1.5 * dt);
          f.heading += turn; f.turn += (turn / Math.max(dt, 1e-3) / 1.5 - f.turn) * Math.min(1, dt * 4);
          const spd = f.mode === 'crawl' ? 0.06 : f.mode === 'upright' ? 0.05 : 0.16;
          f.pos.x += Math.sin(f.heading) * spd * dt; f.pos.z += Math.cos(f.heading) * spd * dt;
          f.pos.y += (f.target.y - f.pos.y) * Math.min(1, dt * 0.4);
          f.pos.x = THREE.MathUtils.clamp(f.pos.x, -lim.x, lim.x); f.pos.z = THREE.MathUtils.clamp(f.pos.z, -lim.z, lim.z);
          f.inst.object.position.copy(f.pos);
          f.inst.object.rotation.y = f.heading;
          f.inst.animate(dt, 0.7, -f.turn * 0.6);
        }
      }
    },
  };
  ctx.bus?.on('aquarium:donate', () => { dirty = true; });
  ctx.bus?.on('save:loaded', () => { dirty = true; });
  ctx.bus?.on('save:reset', () => { dirty = true; });
  return api;
}
