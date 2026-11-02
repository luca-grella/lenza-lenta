// Villagers: built with the same procedural rig as the player, driven by daily routines from src/data/npcs.js
// (a POI + an activity per time phase). They walk between POIs along A* paths planned on a lazy 0.5 m grid of
// dry, walkable, collider-free ground (never through the sea, never against walls), sit on benches, go indoors
// to sleep, idle with small variations, look at the player when near, wave hello, turn and gesture while talking.
// Dialog itself belongs to Gameplay (systems.quests.talkTo) and UI (ui.dialog); this module only offers talk().
import * as THREE from 'three';
import { createCharacter } from './rig/index.js';
import { FALLBACK_NPCS } from './rig/looks.js';

import * as STR from './rig/strings.js';
/** [Fix] POIs where the player fishes: villagers stand behind them, never on them. */
const FISH_SPOTS = new Set(['dock_home', 'dock_village', 'waterfall_pond', 'cave_pool']);
/** Spots up a building: walk to the door, go inside, appear up there (and the other way round). */
const ELEVATED = { lighthouse_top: 'lighthouse_door' };

const WALK_SPEED = 1.35;          // cozy stroll (walk_slow blend)
const LOOK_DIST = 5.5, WAVE_DIST = 6.5, FACE_DIST = 2.8;
const FAR_UPDATE = 4;             // far villagers animate every Nth frame
const UNSEEN = 32;                // farther than this from the player = off screen (may hop instead of walking)

// ------------------------------------------------------------------------------------------------ navigation
/**
 * Lazy navigation grid + A*. A point is "dry" when the world says it is walkable and it is not sea (a deck above
 * the water is fine). A cell is free when its centre and the 4 points a quarter-metre round it are dry and none of
 * them is a step taller than STEP away (no dock edges, no cliffs). [Fix] the clearance used to be half a metre,
 * which closed every 1 m ramp and the narrow shop decks: Gino, Rosa and Tonio could never leave their counters.
 * Cells with less than half a metre of room ("tight") cost more, so paths keep to the middle of lanes and ramps.
 * Plans run as jobs sliced over frames (BUDGET ms per frame) so a phase change never stalls the game.
 */
function createNav(ctx) {
  // STEP must stay below the world's own walking limits (src/world/colliders.js WALK: climb 0.62, drop 0.55):
  // [Fix] it was 0.7, so plans stepped off the side of ramps/decks where the movement solver then held them back
  const CELL = 0.5, STEP = 0.42, MAX_NODES = 40000, BUDGET = 2.5, RADIUS = 0.3;
  let dryC = new Map(), freeC = new Map(), tightC = new Map();
  const TIGHT = 0.9;   // extra cost of a cell with < 0.5 m of room
  const W = () => ctx.world;
  const key = (i, j) => (i + 4096) * 8192 + (j + 4096);
  /** Ground height at a point of the half-cell lattice (I, J in CELL/2 units) when dry & walkable, else null (cached). */
  function dryY(I, J) {
    const k = key(I, J);
    let v = dryC.get(k);
    if (v !== undefined) return v;
    const w = W(), x = I * CELL / 2, z = J * CELL / 2;
    v = null;
    if (w?.walkable?.(x, z)) {
      const y = w.groundY(x, z);
      if (!(w.isWater?.(x, z) && !(y > (w.waterLevel ?? 0) + 0.3))) v = y;
    }
    dryC.set(k, v);
    return v;
  }
  /** Ground height of a free cell, or null when blocked. */
  function cellY(i, j) {
    const k = key(i, j);
    let v = freeC.get(k);
    if (v !== undefined) return v;
    v = dryY(2 * i, 2 * j);
    if (v != null) for (const [a, b] of N4) { const y = dryY(2 * i + a, 2 * j + b); if (y == null || Math.abs(y - v) > STEP) { v = null; break; } }
    // [Fix] the villager's whole body must fit: walkable() only tests the point, so gaps between props/rails narrower
    // than a villager were "free" and they pushed against them forever
    if (v != null && pinched(i * CELL, j * CELL, RADIUS - 0.02)) v = null;
    freeC.set(k, v);
    return v;
  }
  /** Does a body of radius r at x,z overlap a collider? (asks the world's own movement solver: it pushes us out) */
  function pinched(x, z, r) {
    const res = W()?.resolveMove?.({ x, z }, { x: x + 0.001, z }, r);
    return !!res?.blocked;
  }
  /** A free cell without half a metre of room all round (next to a wall, a rail, the edge of a ramp). */
  function tight(i, j) {
    const k = key(i, j);
    let v = tightC.get(k);
    if (v !== undefined) return v;
    const y0 = cellY(i, j);
    v = false;
    if (y0 != null) for (const [a, b] of N4) { const y = dryY(2 * (i + a), 2 * (j + b)); if (y == null || Math.abs(y - y0) > STEP) { v = true; break; } }
    if (y0 != null && !v) v = pinched(i * CELL, j * CELL, RADIUS + 0.2);
    tightC.set(k, v);
    return v;
  }
  /** Can a villager step from cell (i,j) to its neighbour (i+di, j+dj)? The midpoint catches thin fences/rails. */
  function edgeOK(i, j, di, dj) {
    const y0 = cellY(i, j), y1 = cellY(i + di, j + dj);
    if (y0 == null || y1 == null || Math.abs(y1 - y0) > STEP) return false;
    const ym = dryY(2 * i + di, 2 * j + dj);
    return ym != null && Math.abs(ym - y0) <= STEP && Math.abs(ym - y1) <= STEP;
  }
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const ci = (x) => Math.round(x / CELL);
  const free = (x, z) => cellY(ci(x), ci(z)) != null;

  /** Nearest free cell centre within r metres (rings outward), or null. */
  function nearestFree(x, z, r = 6) {
    const i0 = ci(x), j0 = ci(z), R = Math.ceil(r / CELL);
    if (cellY(i0, j0) != null) return { x: i0 * CELL, z: j0 * CELL };
    let best = null, bd = Infinity;
    for (let ring = 1; ring <= R; ring++) {
      for (let di = -ring; di <= ring; di++) for (let dj = -ring; dj <= ring; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        if (cellY(i0 + di, j0 + dj) == null) continue;
        const d = Math.hypot((i0 + di) * CELL - x, (j0 + dj) * CELL - z);
        if (d < bd) { bd = d; best = { x: (i0 + di) * CELL, z: (j0 + dj) * CELL }; }
      }
      if (best && bd <= ring * CELL) return best;
    }
    return best;
  }

  /** Straight walk from a to b: free cells all the way, and the world's own movement solver is never blocked. */
  function los(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.25));
    const w = W();
    let px = a.x, pz = a.z;
    for (let k = 1; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
      if (cellY(ci(x), ci(z)) == null) return false;
      const r = w?.resolveMove?.({ x: px, z: pz }, { x, z }, RADIUS);
      if (r && (r.blocked || Math.abs(r.x - x) > 0.02 || Math.abs(r.z - z) > 0.02)) return false;
      px = x; pz = z;
    }
    return true;
  }
  /** Learn from a villager that got blocked here: the cell ahead is not walkable after all. */
  function block(x, z) { freeC.set(key(ci(x), ci(z)), null); tightC.delete(key(ci(x), ci(z))); }

  // binary heap on f
  function heap() {
    const a = [];
    return {
      get size() { return a.length; },
      push(n) { a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
        return top;
      },
    };
  }
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  const neighbours = function* (i, j) {
    for (const [di, dj, c] of NB) {
      if (!edgeOK(i, j, di, dj)) continue;
      // no corner cutting: both orthogonal steps OK, or (narrow diagonal ramps) the ground a quarter-metre along each axis dry
      if (c > 1 && !(edgeOK(i, j, di, 0) && edgeOK(i, j, 0, dj)) && !(dryY(2 * i + di, 2 * j) != null && dryY(2 * i, 2 * j + dj) != null && dryY(2 * (i + di) - di, 2 * (j + dj)) != null && dryY(2 * (i + di), 2 * (j + dj) - dj) != null)) continue;
      yield [i + di, j + dj, tight(i + di, j + dj) ? c + TIGHT : c];
    }
  };

  /** Is the goal cell in a small closed pocket (e.g. a deck with no stairs)? Then A* must not flood the island. */
  function* pocket(gi, gj, si, sj, limit = 2500) {
    const seen = new Set([key(gi, gj)]), q = [[gi, gj]];
    let n = 0;
    while (q.length) {
      const [i, j] = q.shift();
      if (i === si && j === sj) return false;
      if (++n > limit) return false;
      if (n % 200 === 0) yield;
      for (const [a, b] of neighbours(i, j)) { const k = key(a, b); if (!seen.has(k)) { seen.add(k); q.push([a, b]); } }
    }
    return true;
  }

  /**
   * Plan from → to (generator; yields to let the caller slice it over frames).
   * Returns {pts:[{x,z}], reached, end, nodes} (end = where the path really ends) or null.
   * opts.accept: how far from `to` a partial path may end (unreachable goal) — default 8 m.
   */
  function* planGen(from, to, opts = {}) {
    const s = nearestFree(from.x, from.z, 3);
    const g = nearestFree(to.x, to.z, opts.snap ?? 6);
    if (!s || !g) return null;
    const si = ci(s.x), sj = ci(s.z), gi = ci(g.x), gj = ci(g.z);
    const closed = yield* pocket(gi, gj, si, sj);
    const budget = closed ? 6000 : MAX_NODES;
    const H = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)); };
    const open = heap(), nodes = new Map();
    const start = { i: si, j: sj, g: 0, f: H(si, sj), h: H(si, sj), parent: null, closed: false };
    nodes.set(key(si, sj), start); open.push(start);
    let best = start, found = null, count = 0;
    while (open.size && count < budget) {
      const n = open.pop();
      if (n.closed) continue;
      n.closed = true; count++;
      if (count % 150 === 0) yield;
      if (n.h < best.h) best = n;
      if (n.i === gi && n.j === gj) { found = n; break; }
      for (const [i, j, c] of neighbours(n.i, n.j)) {
        const k = key(i, j);
        let m = nodes.get(k);
        const gg = n.g + c;
        if (m && (m.closed || m.g <= gg)) continue;
        if (!m) { m = { i, j, g: gg, h: H(i, j), f: 0, parent: n, closed: false }; nodes.set(k, m); }
        m.g = gg; m.parent = n; m.f = gg + m.h * 1.05;
        open.push(m);
      }
    }
    const end = found || best;
    const reached = !!found;
    const endPt = { x: end.i * CELL, z: end.j * CELL };
    if (!reached && Math.hypot(endPt.x - to.x, endPt.z - to.z) > (opts.accept ?? 8)) return null;
    const raw = [];
    for (let n = end; n; n = n.parent) raw.push({ x: n.i * CELL, z: n.j * CELL });
    raw.reverse();
    // string pulling: keep only the turns (forward, within a 24-cell window, checked with the movement solver)
    const pts = [];
    let a = { x: from.x, z: from.z };
    if (!los(a, raw[0])) { pts.push(raw[0]); a = raw[0]; }
    let k = 0;
    while (k < raw.length - 1) {
      let far = k + 1;
      for (let m = k + 2; m < raw.length && m <= k + 24; m++) { if (los(a, raw[m])) far = m; else if (m - far > 3) break; }
      pts.push(raw[far]); a = raw[far]; k = far;
      yield;
    }
    if (!pts.length) pts.push(raw[raw.length - 1]);
    // finish on the exact goal when it is free and in sight
    if (reached && free(to.x, to.z) && los(pts[pts.length - 1], to)) pts[pts.length - 1] = { x: to.x, z: to.z };
    return { pts, reached, end: pts[pts.length - 1], nodes: count, pocket: closed };
  }
  /** Synchronous plan (tests, short hops). */
  function plan(from, to, opts) {
    const t0 = performance.now();
    const it = planGen(from, to, opts);
    let r; do { r = it.next(); } while (!r.done);
    nav.ms += performance.now() - t0; nav.plans++;
    return r.value;
  }
  // ---- time-sliced jobs ----
  const jobs = [];
  /** Queue a plan; cb(result) is called on a later frame. Returns a cancel function. */
  function request(from, to, opts, cb) {
    const job = { it: planGen({ x: from.x, z: from.z }, { x: to.x, z: to.z }, opts), cb, dead: false, t: 0 };
    jobs.push(job);
    return () => { job.dead = true; };
  }
  function tick() {
    const t0 = performance.now();
    while (jobs.length && performance.now() - t0 < BUDGET) {
      const job = jobs[0];
      if (job.dead) { jobs.shift(); continue; }
      const s = performance.now();
      const r = job.it.next();
      job.t += performance.now() - s;
      if (r.done) { jobs.shift(); nav.ms += job.t; nav.plans++; nav.maxMs = Math.max(nav.maxMs, job.t); try { job.cb(r.value); } catch (e) { console.warn('[npc] plan cb', e); } }
    }
  }

  const nav = { plan, request, tick, block, free, nearestFree, los, cellY, CELL, ms: 0, maxMs: 0, plans: 0, get busy() { return jobs.length; }, clear() { dryC = new Map(); freeC = new Map(); tightC = new Map(); } };
  return nav;
}

/**
 * @param {any} ctx
 * @param {{sandbox?:boolean}} [opts]  sandbox: line villagers up near the origin (no POIs needed)
 */
export function init(ctx, opts = {}) {
  ctx.i18n?.addStrings?.(STR.it, STR.en);
  const records = (Array.isArray(ctx.data?.npcs) && ctx.data.npcs.length) ? ctx.data.npcs : FALLBACK_NPCS;
  const list = [];
  const byId = {};
  const head = new THREE.Vector3();
  let frame = 0, interactChecked = false;
  const nav = createNav(ctx);
  /** Debug/test switches: noHop = always walk (never hop while off screen). */
  const debug = { noHop: false, log: [] };

  const groundY = (x, z) => {
    const w = ctx.world;
    const y = w?.groundY?.(x, z) ?? w?.heightAt?.(x, z) ?? ctx.stage?.heightAt?.(x, z) ?? 0;
    return Number.isFinite(y) ? y : 0;
  };
  const poiOf = (id) => { if (!id) return null; try { return ctx.world?.poi?.(id) || null; } catch { return null; } };
  const phase = () => ctx.time?.phase || 'day';
  const playerObj = () => ctx.player?.object || null;
  const hasWorld = () => !!ctx.world?.walkable && !opts.sandbox;

  records.forEach((rec, i) => {
    let ch;
    try { ch = createCharacter(ctx, rec.look || {}, { id: rec.id }); } catch (e) { console.warn('[npc] could not build', rec.id, e); return; }
    const obj = ch.object;
    obj.name = `NPC:${rec.id}`;
    ctx.scene.add(obj);
    const n = makeNpc(rec, ch, i);
    list.push(n); byId[rec.id] = n;
  });

  function makeNpc(rec, ch, index) {
    const obj = ch.object;
    const rng = ctx.math?.rng ? ctx.math.rng('npc:' + rec.id) : Math.random;
    const rand = (a, b) => a + (typeof rng === 'function' ? rng() : Math.random()) * (b - a);
    const st = {
      facing: 0, facingGoal: 0, speed: 0, act: 'idle', seated: false, asleep: false,
      idleT: rand(3, 8), wanderT: rand(2, 5), waveCd: rand(0, 4), talkT: 0, acc: 0,
      lookOverride: null, home: null,
      // walking
      path: null, wp: 0, goal: null, planning: null, watchT: 0, watchD: Infinity, replans: 0, gaveUp: 0, retryT: 0, yieldT: 0, passT: 0,
      // seats / indoors / up the lighthouse
      seat: null, seatMove: null, rising: 0, away: 0, awayThen: null, fixedY: null,
      lastMove: null,
    };
    const stats = { trips: 0, stuck: 0, replans: 0, giveUps: 0, hops: 0, unreachable: [], wet: 0, onFishSpot: 0, jitter: 0, maxBlocked: 0, walked: 0 };
    const n = {
      id: rec.id, data: rec, object: obj, character: ch, stats,
      get position() { return obj.position; },
      get facing() { return st.facing; },
      get state() { return st.asleep ? 'sleep' : st.talkT > 0 ? 'talk' : st.seated ? 'sit' : st.speed > 0.1 ? 'walk' : st.act; },
      get awake() { return !st.asleep; },
      /** Where the villager is heading ({x,z} or null) and the remaining path. */
      get goal() { return st.goal; },
      get path() { return st.path ? st.path.slice(st.wp) : null; },
      /** True while a route is being planned (time-sliced A*). */
      get planning() { return !!st.planning; },
      headObject: ch.bones?.head || null,
      /** Play a clip. 'talk' / 'idle' from the dialog flow start / end the talking state (never left looping). */
      play(name, o = {}) {
        if (name === 'talk' && !o.layer) { beginTalk(); return Promise.resolve(true); }
        if (name === 'idle') { if (st.talkT > 0) endTalk(); else if (!st.seated) ch.play('locomotion', { fade: o.fade ?? 0.3 }); return Promise.resolve(true); }
        return ch.play(name, o);
      },
      /** Look at a point / Object3D (null = automatic: the player when near). */
      lookAt(target) { st.lookOverride = target || null; },
      /** Start a conversation: Gameplay's quest/dialog flow if present, else the UI dialog, else just the bus event. */
      talk() {
        if (st.asleep) { ctx.ui?.toast?.('char.npc.asleep', { name: nameOf() }); return Promise.resolve(); }
        const q = ctx.systems?.quests;
        if (q?.talkTo) return Promise.resolve(q.talkTo(rec.id));
        ctx.bus?.emit('npc:talk', { npcId: rec.id });
        const keys = rec.dialogKeys?.hello?.length ? [rec.dialogKeys.hello[Math.floor(Math.random() * rec.dialogKeys.hello.length)]] : ['char.npc.hello_fallback'];
        return Promise.resolve(ctx.ui?.dialog?.(rec.id, keys)).finally(() => endTalk());
      },
      /** Called when a dialog starts / ends (also driven by the bus). */
      beginTalk, endTalk,
      /** The UI dialog with this villager opened/closed: talk for as long as it stays open. */
      dialog(open) { if (open) { st.dialog = true; beginTalk(); } else endTalk(); },
      /** Move to this phase's routine spot now (teleport = true skips the walk). */
      goRoutine(teleport = false) { applyRoutine(teleport); },
      update,
    };
    const nameOf = () => (rec.nameKey ? ctx.i18n.t(rec.nameKey) : rec.id);
    const log = (msg) => { if (debug.log.length < 400) debug.log.push(`[${ctx.time?.format?.() || ''}] ${rec.id}: ${msg}`); };

    // ---------------------------------------------------------------- where to be
    function routineSpot() {
      const r = rec.routine?.[phase()] || {};
      if (opts.sandbox) {
        const x = -2.6 + index * 5.2 * (index % 2 ? 1 : -0.5), z = -1.5 - index * 0.5;
        return { x, z, facing: 0, act: r.act === 'sleep' ? 'idle' : (r.act || 'idle'), talk: true };
      }
      const ids = [r.poi, r.fallback, rec.home, rec.fallback];
      const pid = ids.find(id => poiOf(id));
      const p = poiOf(pid);
      if (!p) {
        const s = ctx.world?.spawn || { x: 0, z: 0 };
        return { x: s.x + 3 + index * 1.7, z: s.z - 2 - (index % 2) * 1.5, facing: null, act: r.act === 'sleep' ? 'idle' : (r.act || 'idle'), talk: r.talk !== false };
      }
      const f = p.facing ?? p.rot ?? null;
      const act = r.act || 'idle', talk = r.talk !== false;
      const spot = { x: p.x, z: p.z, facing: f, act, talk, poi: pid };
      if (act === 'sleep' && !talk) { spot.indoor = true; spot.act = 'idle'; return snap(spot, 5); }       // walk to the door, go in
      if (ELEVATED[pid] && poiOf(ELEVATED[pid])) {
        const d = poiOf(ELEVATED[pid]);
        return snap({ ...spot, x: d.x, z: d.z, elevated: { x: p.x, y: p.y, z: p.z, facing: f } }, 5);
      }
      // [Fix] never park on a fishing spot: queue up behind it (away from the water) so the player can still cast there
      if (FISH_SPOTS.has(pid) && f != null) {
        const back = 2.6 + (index % 3) * 1.1;
        return snap({ ...spot, x: p.x - Math.sin(f) * back, z: p.z - Math.cos(f) * back, act: act === 'fish' ? 'watch' : act }, 6);
      }
      // benches (and dock edges): stand in front, then sit down onto the seat
      if ((p.kind === 'bench' || p.kind === 'edge') && f != null && ['sit', 'fish', 'watch', 'idle'].includes(act)) {
        const k = p.kind === 'bench' ? 0.75 : -0.6;
        const seat = { x: p.x, z: p.z, y: Number.isFinite(p.y) ? p.y : groundY(p.x, p.z) + 0.42, facing: f, k };
        return snap({ ...spot, x: p.x + Math.sin(f) * k, z: p.z + Math.cos(f) * k, seat }, 3);
      }
      // villagers sharing this POI now stand side by side (never inside each other)
      const sharing = list.filter(o => { const rr = o.data.routine?.[phase()]; return rr && [rr.poi, rr.fallback].find(id => poiOf(id)) === pid; });
      const m = Math.max(1, sharing.length), slot = Math.max(0, sharing.findIndex(o => o.id === rec.id));
      if (m > 1 && f != null) {
        const off = (slot - (m - 1) / 2) * 1.2;
        spot.x += Math.cos(f) * off; spot.z -= Math.sin(f) * off;
      }
      return snap(spot, 6);
    }
    /** Move a spot onto free, dry ground (never the sea, never inside a wall). */
    function snap(spot, r) {
      if (!hasWorld()) return spot;
      const q = nav.nearestFree(spot.x, spot.z, r);
      if (q) { spot.x = q.x; spot.z = q.z; } else spot.bad = true;
      return spot;
    }

    function applyRoutine(teleport) {
      const spot = routineSpot();
      // already up the lighthouse and staying there (Ettore, dusk → night): don't walk down and up again
      const e0 = st.home?.elevated, e1 = spot.elevated;
      if (!teleport && st.fixedY != null && e0 && e1 && Math.hypot(e0.x - e1.x, e0.z - e1.z) < 0.1) { st.home = { ...spot }; st.act = spot.act; return; }
      st.home = spot;
      st.planning?.(); st.planning = null;
      st.retryT = 0; st.replans = 0; st.gaveUp = 0;
      if (st.away > 0 || st.asleep || st.fixedY != null) {
        // inside a house / up the lighthouse: come out of the door first
        const wasUp = st.fixedY != null;
        st.asleep = false;
        if (teleport) { obj.visible = true; st.fixedY = null; st.away = 0; }
        else if (wasUp) { obj.visible = false; st.away = 2.5; st.awayThen = 'door'; return; }
        else { comeOut(); }
      }
      if (st.seated && !teleport) { standUp(() => go(spot)); return; }
      st.seated = false; st.seat = null; st.seatMove = null;
      if (teleport) { place(spot.x, spot.z); st.path = null; arrive(); return; }
      go(spot);
    }
    function comeOut() {
      st.away = 0; st.awayThen = null; st.fixedY = null; obj.visible = true;
      const d = st.doorAt || st.home;
      if (d) place(d.x, d.z);
      ch.play('locomotion', { fade: 0.2 });
    }
    function place(x, z) { obj.position.set(x, groundY(x, z), z); ch.resetSprings?.(); }

    const unseen = (x, z) => {
      const p = playerObj();
      if (!p) return true;
      const a = Math.hypot(p.position.x - obj.position.x, p.position.z - obj.position.z);
      const b = Math.hypot(p.position.x - x, p.position.z - z);
      return a > UNSEEN && b > UNSEEN;
    };

    /** Plan and start walking to the spot (or hop when nobody can see). */
    function go(spot) {
      st.planning?.(); st.planning = null;
      st.goal = { x: spot.x, z: spot.z };
      const d = Math.hypot(spot.x - obj.position.x, spot.z - obj.position.z);
      if (d < 0.3) { arrive(); return; }
      if (!debug.noHop && d > 20 && unseen(spot.x, spot.z)) { hop(spot, 'off screen'); return; }
      if (!hasWorld()) { st.path = [{ x: spot.x, z: spot.z }]; st.wp = 0; startWalk(); return; }
      st.path = null;
      st.planning = nav.request(obj.position, spot, { accept: 8 }, pl => { st.planning = null; onPlan(spot, pl); });
    }
    function onPlan(spot, pl) {
      if (!pl) {
        stats.unreachable.push(`${phase()}:${spot.poi || '?'}`);
        const work = poiOf(rec.fallback);
        if (spot.indoor && work && Math.hypot(obj.position.x - work.x, obj.position.z - work.z) < 6) {
          log(`home ${spot.poi} out of reach: sleeps at the shop`);
          st.home = { ...spot, x: obj.position.x, z: obj.position.z }; arrive(); return;
        }
        giveUp('no path'); return;
      }
      if (!pl.reached) {
        stats.unreachable.push(`${phase()}:${spot.poi || '?'}`);
        log(`spot ${spot.poi} not reachable, stopping ${Math.hypot(pl.end.x - spot.x, pl.end.z - spot.z).toFixed(1)} m short`);
        const near = Math.hypot(pl.end.x - spot.x, pl.end.z - spot.z) < 2.5;
        // home out of reach at bedtime: a shopkeeper still at the shop sleeps in its back room instead
        const work = poiOf(rec.fallback);
        const atWork = !!work && Math.hypot(pl.end.x - work.x, pl.end.z - work.z) < 6;
        st.home = { ...spot, x: pl.end.x, z: pl.end.z, seat: near ? spot.seat : null, elevated: null, indoor: spot.indoor && (near || atWork) };
        if (st.home.seat && Math.hypot(st.home.seat.x - pl.end.x, st.home.seat.z - pl.end.z) > 1.4) st.home.seat = null;
        st.goal = { x: pl.end.x, z: pl.end.z };
      }
      st.path = pl.pts; st.wp = 0;
      startWalk();
    }
    function startWalk() {
      st.watchT = 0; st.watchD = Infinity; st.yieldT = 0;
      if (ch.animator.current !== 'locomotion') ch.play('locomotion', { fade: 0.25 });
    }
    function hop(spot, why) {
      stats.hops++; log(`hop (${why})`);
      place(spot.x, spot.z); st.path = null; arrive();
    }
    /** Blocked for good: settle down here (on free ground) and try again later. */
    function giveUp(why, retry = why === 'blocked' ? 20 : 150) {
      stats.giveUps++; st.gaveUp++; log(`give up: ${why}${st.gaveUp >= 3 ? ' (stays here until the next phase)' : ''}`);
      if (st.gaveUp >= 3) retry = Infinity;
      st.path = null; st.speed = 0;
      const g = st.goal;
      if (g && !debug.noHop && unseen(g.x, g.z) && st.home) { hop(st.home, 'after give up'); return; }
      if (hasWorld() && !nav.free(obj.position.x, obj.position.z)) {
        const q = nav.nearestFree(obj.position.x, obj.position.z, 3);
        if (q) { st.path = [q]; st.wp = 0; st.goal = null; st.retryT = retry; startWalk(); return; }
      }
      st.retryT = retry + rand(0, 10);
      st.act = 'idle'; st.goal = null;   // not heading anywhere until the retry
      if (ch.animator.current !== 'locomotion') ch.play('locomotion', { fade: 0.3 });
    }

    function arrive() {
      const s = st.home; st.path = null; st.goal = null; st.act = s.act; st.replans = 0;
      stats.trips++;
      if (s.facing != null) st.facingGoal = s.facing;
      if (s.indoor) { st.doorAt = { x: obj.position.x, z: obj.position.z }; st.asleep = true; obj.visible = false; return; }  // indoors for the night
      if (s.elevated) { st.doorAt = { x: obj.position.x, z: obj.position.z }; obj.visible = false; st.away = 2.5; st.awayThen = 'up'; return; }
      if (s.seat) { sitOn(s.seat); return; }
      if (ch.animator.current !== 'locomotion') ch.play('locomotion', { fade: 0.3 });
    }
    function sitOn(seat) {
      st.seated = true; st.seat = seat; st.speed = 0;
      st.seatMove = { from: { x: obj.position.x, y: obj.position.y, z: obj.position.z }, to: seat, t: 0, dur: 0.55 };
      st.facingGoal = seat.facing;
      ch.play('sit_down', { fade: 0.25, next: 'sit_idle' });
    }
    function standUp(then) {
      const s = st.seat; st.seat = null;
      ch.animator.stopUpper?.(0.2);
      ch.play('stand_up', { fade: 0.2 });
      st.rising = 1.2;
      const back = s ? { x: obj.position.x + Math.sin(s.facing) * (s.k ?? 0.75), z: obj.position.z + Math.cos(s.facing) * (s.k ?? 0.75) } : null;
      const to = back && hasWorld() ? (nav.nearestFree(back.x, back.z, 2) || back) : back;
      st.seatMove = to ? { from: { x: obj.position.x, y: obj.position.y, z: obj.position.z }, to: { x: to.x, z: to.z, y: groundY(to.x, to.z) }, t: 0, dur: 1.0 } : null;
      st.afterRise = () => { st.seated = false; st.seatMove = null; then?.(); };
    }

    function beginTalk() {
      if (st.talkT > 0 && ch.animator.current === 'talk') { st.talkT = Math.max(st.talkT, 6); return; }
      st.talkT = 6;
      if (!st.seated) ch.play('talk', { fade: 0.3 });
      else ch.play('talk', { fade: 0.3, layer: 'upper' });
      ch.setSpeaking(true);
    }
    function endTalk() {
      if (st.talkT <= 0) return;
      st.talkT = 0; st.dialog = false; ch.setSpeaking(false);
      if (st.seated) ch.animator.stopUpper(0.3); else ch.play('locomotion', { fade: 0.35 });
    }

    // ---------------------------------------------------------------- per frame
    function update(dt) {
      // hidden: asleep indoors, or walking up/down the lighthouse stairs
      if (st.asleep) return;
      if (st.away > 0) {
        st.away -= dt;
        if (st.away <= 0) {
          if (st.awayThen === 'up' && st.home?.elevated) {
            const e = st.home.elevated;
            obj.position.set(e.x, e.y, e.z); st.fixedY = e.y; obj.visible = true;
            if (e.facing != null) { st.facing = st.facingGoal = e.facing; obj.rotation.y = e.facing; }
            st.away = 0; st.awayThen = null; ch.play('locomotion', { fade: 0.1 });
          } else { comeOut(); go(st.home); }
        }
        return;
      }
      const p = playerObj();
      const dp = p ? Math.hypot(p.position.x - obj.position.x, p.position.z - obj.position.z) : 999;
      const far = dp > (ctx.quality?.foliageDistance ?? 55);
      st.acc += dt;
      if (far && (frame + index) % FAR_UPDATE !== 0) return;
      const step = st.acc; st.acc = 0;
      const talking = st.talkT > 0;

      // ---- getting on / off a seat ----
      if (st.seatMove) {
        const m = st.seatMove; m.t += step;
        const k = THREE.MathUtils.smoothstep(Math.min(1, m.t / m.dur), 0, 1);
        obj.position.set(m.from.x + (m.to.x - m.from.x) * k, m.from.y + (m.to.y - m.from.y) * k, m.from.z + (m.to.z - m.from.z) * k);
        if (m.t >= m.dur && !st.rising) st.seatMove = null;
      }
      if (st.rising > 0) { st.rising -= step; if (st.rising <= 0) { st.rising = 0; const f = st.afterRise; st.afterRise = null; f?.(); } }

      // ---- walking along the planned path ----
      let want = 0;
      if (st.path && !st.seated && !st.rising) {
        let wpt = st.path[st.wp];
        let d = Math.hypot(wpt.x - obj.position.x, wpt.z - obj.position.z);
        const last = st.wp >= st.path.length - 1;
        if (!last && d < 0.45) { st.wp++; wpt = st.path[st.wp]; d = Math.hypot(wpt.x - obj.position.x, wpt.z - obj.position.z); st.watchD = Infinity; }
        if (st.wp >= st.path.length - 1 && d < 0.22) {
          if (st.home && st.goal) arrive(); else { st.path = null; st.goal = null; }
        } else if (!talking) {
          st.facingGoal = Math.atan2(wpt.x - obj.position.x, wpt.z - obj.position.z);
          const remaining = st.wp >= st.path.length - 1 ? d : Infinity;
          want = remaining < 1.2 ? WALK_SPEED * Math.max(0.35, remaining / 1.2) : WALK_SPEED;
          // let the player pass: stop if they stand right in front of us
          if (p && dp < 0.95 && st.passT <= 0) {
            const fx = Math.sin(st.facing), fz = Math.cos(st.facing);
            if (((p.position.x - obj.position.x) * fx + (p.position.z - obj.position.z) * fz) / Math.max(dp, 1e-3) > 0.35) {
              want = 0; st.yieldT += step;
              if (st.yieldT > 2.5) { st.passT = 2.5; st.yieldT = 0; }
            }
          } else st.yieldT = 0;
          st.passT -= step;
          // progress watchdog (paused while yielding or turning on the spot)
          const turning = Math.abs(Math.atan2(Math.sin(st.facingGoal - st.facing), Math.cos(st.facingGoal - st.facing))) > 1.0;
          if (want > 0 && !turning) {
            if (d < st.watchD - 0.15) { st.watchD = d; st.watchT = 0; } else st.watchT += step;
            stats.maxBlocked = Math.max(stats.maxBlocked, st.watchT);
            if (st.watchT > 1.6) {
              stats.stuck++; st.watchT = 0; st.watchD = Infinity; st.replans++; stats.replans++;
              if (hasWorld()) nav.block(obj.position.x + Math.sin(st.facing) * 0.5, obj.position.z + Math.cos(st.facing) * 0.5);
              log(`blocked near ${obj.position.x.toFixed(1)},${obj.position.z.toFixed(1)} → wp ${wpt.x},${wpt.z} (try ${st.replans})`);
              if (st.replans > 2 || !hasWorld()) giveUp('blocked');
              else {
                const g = st.goal || st.path[st.path.length - 1];
                const wander = !st.goal;
                st.path = null;
                st.planning = nav.request(obj.position, g, { accept: 8 }, pl => {
                  st.planning = null;
                  if (pl) { st.path = pl.pts; st.wp = 0; startWalk(); } else if (!wander) giveUp('no path after block'); else st.retryT = 0;
                });
              }
            }
          }
        }
        if (talking) want = 0;
      } else if (!st.seated && !talking && !st.path && !st.planning && st.home) {
        if (st.retryT > 0) { st.retryT -= step; if (st.retryT <= 0) go(st.home); }
        else if (st.act === 'walk') {
          // strolling around the POI with pauses (only to free, dry ground off the fishing spots)
          st.wanderT -= step;
          if (st.wanderT <= 0) {
            st.wanderT = rand(6, 11);
            for (let k = 0; k < 6; k++) {
              const a = rand(0, Math.PI * 2), r = rand(0.8, 3.2);
              const x = st.home.x + Math.cos(a) * r, z = st.home.z + Math.sin(a) * r;
              if (hasWorld() && (!nav.free(x, z) || nearFishSpot(x, z) || !nav.los(obj.position, { x, z }))) continue;
              st.path = [{ x, z }]; st.wp = 0; st.goal = null; startWalk();
              break;
            }
          }
        }
      }
      st.speed += (want - st.speed) * (1 - Math.exp(-(want > st.speed ? 4 : 6) * step));
      if (want === 0 && st.speed < 0.03) st.speed = 0;
      if (st.speed > 0.02 && !st.seated && !st.rising) {
        if (ch.animator.current !== 'locomotion' && !talking) ch.play('locomotion', { fade: 0.2 });  // never slide in an idle clip
        const nx = obj.position.x + Math.sin(st.facing) * st.speed * step, nz = obj.position.z + Math.cos(st.facing) * st.speed * step;
        const r = ctx.world?.resolveMove?.(obj.position, { x: nx, z: nz }, 0.3) || { x: nx, z: nz };  // = nav RADIUS
        const mx = r.x - obj.position.x, mz = r.z - obj.position.z, ml = Math.hypot(mx, mz);
        if (ml > 1e-4) {
          if (st.lastMove && (mx * st.lastMove.x + mz * st.lastMove.z) / ml < -0.3) stats.jitter++;
          st.lastMove = { x: mx / ml, z: mz / ml };
          stats.walked += ml;
        }
        obj.position.x = r.x; obj.position.z = r.z;
        obj.position.y = Number.isFinite(r.y) ? r.y : groundY(r.x, r.z);
      } else if (!st.seated && !st.rising) {
        const gy = st.fixedY ?? groundY(obj.position.x, obj.position.z);
        obj.position.y += (gy - obj.position.y) * (1 - Math.exp(-10 * step));
      }

      // ---- bookkeeping for the day test ----
      if (hasWorld() && obj.visible && !st.seated) {
        const w = ctx.world;
        if (st.fixedY == null && w.isWater?.(obj.position.x, obj.position.z) && !(groundY(obj.position.x, obj.position.z) > 0.3)) stats.wet += step;
        if (st.speed < 0.05 && nearFishSpot(obj.position.x, obj.position.z, 1.4)) stats.onFishSpot += step;
      }

      // ---- social: face / look at / wave at the player ----
      st.waveCd -= step;
      const awakeIdle = !st.seated && st.speed < 0.2 && !st.path && !st.planning && !st.rising;
      if (p && dp < FACE_DIST && (awakeIdle || talking) && !st.seated) st.facingGoal = Math.atan2(p.position.x - obj.position.x, p.position.z - obj.position.z);
      if (p && dp < WAVE_DIST && dp > 2.2 && st.waveCd <= 0 && !talking && !st.rising && obj.visible) {
        st.waveCd = rand(50, 90);
        const moving = st.speed > 0.05 || !!st.path;
        if (st.seated || moving) ch.play('wave', { fade: 0.25, layer: 'upper' });
        else ch.play('wave', { fade: 0.25 });
      }
      if (st.lookOverride) ch.setLook(st.lookOverride, 1);
      else if (p && dp < LOOK_DIST) { p.getWorldPosition(head); head.y += 1.3; ch.setLook(head, 1); }
      else ch.setLook(null);

      // ---- idle flavour ----
      if (awakeIdle && !talking && ch.animator.current === 'locomotion') {
        st.idleT -= step;
        if (st.idleT <= 0) {
          st.idleT = rand(7, 14);
          const pick = st.act === 'forage' ? 'crouch_pick' : st.act === 'sweep' || st.act === 'work' || st.act === 'cook' ? (Math.random() < 0.5 ? 'idle_hat' : 'idle_look')
            : phase() === 'night' && Math.random() < 0.4 ? 'idle_yawn' : Math.random() < 0.5 ? 'idle_look' : 'idle_hat';
          ch.play(pick, { fade: 0.35 });
        }
      }
      if (st.talkT > 0) { if (!st.dialog) st.talkT -= step; if (st.talkT <= 0) { st.talkT = 0.001; endTalk(); } }
      // safety net: a talk loop never outlives the conversation
      else if (ch.animator.current === 'talk' && !st.seated) ch.play('locomotion', { fade: 0.35 });

      // ---- turn & animate ----
      const da = Math.atan2(Math.sin(st.facingGoal - st.facing), Math.cos(st.facingGoal - st.facing));
      const turn = da * (1 - Math.exp(-(st.speed > 0.2 ? 6 : 4) * step));
      st.facing += turn;
      obj.rotation.y = st.facing;
      ch.animator.setSpeed(st.seated || st.rising ? 0 : st.speed);
      const ground = st.seated || st.rising ? null : st.fixedY != null ? () => st.fixedY : groundY;
      ch.update(step, { ground, speed: st.speed, turnRate: step > 0 ? turn / step : 0, accel: 0 });
    }

    // initial placement
    applyRoutine(true);
    st.facing = st.facingGoal = st.home?.facing ?? (index * 1.3) % (Math.PI * 2);
    obj.rotation.y = st.facing;
    return n;
  }

  function nearFishSpot(x, z, r = 2.4) {
    for (const id of FISH_SPOTS) { const p = poiOf(id); if (p && Math.hypot(p.x - x, p.z - z) < r) return true; }
    return false;
  }

  // ---- bus wiring ----
  const offs = [];
  const on = (e, f) => { const off = ctx.bus?.on?.(e, f); if (off) offs.push(off); };
  // stagger the re-planning over a few frames (A* is cheap but not free)
  let pending = [];
  on('time:phase', () => { pending = list.slice(); });
  on('home:upgrade', () => nav.clear());
  on('npc:talk', ({ npcId } = {}) => { const n = byId[npcId]; if (n && n.awake) n.beginTalk(); });
  on('ui:dialog', ({ npcId, open } = {}) => { const n = byId[npcId]; if (n && n.awake) n.dialog(!!open); });
  for (const e of ['dialog:close', 'dialog:end', 'ui:dialog:close']) on(e, (d = {}) => { for (const n of list) if (!d.npcId || d.npcId === n.id) n.endTalk(); });

  // fallback interactables (only when Gameplay's interact system is missing, e.g. in the sandbox)
  function ensureInteract() {
    interactChecked = true;
    if (ctx.systems?.interact) return;
    const reg = ctx.world?.interactables?.register;
    if (!reg) return;
    for (const n of list) {
      reg.call(ctx.world.interactables, {
        id: 'npc:' + n.id, pos: n.object.position, radius: 2.4, kind: 'talk', labelKey: 'char.act.talk', icon: 'talk', priority: 3,
        enabled: () => n.awake && n.object.visible, onInteract: () => n.talk(),
      });
    }
  }

  const tick = (dt) => {
    frame++;
    if (!interactChecked && frame > 2) ensureInteract();
    nav.tick();
    if (pending.length) { const n = pending.shift(); try { n.goRoutine(false); } catch (e) { console.warn('[npc] routine', n.id, e); } }
    for (const n of list) { try { n.update(dt); } catch (e) { console.warn('[npc] update', n.id, e); } }
  };
  const removeLoop = ctx.loop?.add?.(tick, ctx.ORDER?.actors ?? 20);

  return {
    list, byId, nav, debug,
    get: (id) => byId[id] || null,
    /** Nearest awake villager within maxDist of a point. */
    nearest(pos, maxDist = 3) {
      let best = null, bd = maxDist;
      for (const n of list) { if (!n.awake) continue; const d = Math.hypot(n.object.position.x - pos.x, n.object.position.z - pos.z); if (d < bd) { bd = d; best = n; } }
      return best;
    },
    /** Per-villager walking stats (trips, stuck events, re-plans, give-ups, hops, seconds in water / on fishing spots). */
    stats() { const o = {}; for (const n of list) o[n.id] = { ...n.stats, unreachable: [...n.stats.unreachable] }; return o; },
    update: tick,
    dispose() { removeLoop?.(); offs.forEach(f => f()); for (const n of list) n.character.dispose(); list.length = 0; },
  };
}

export default { init };
