// Places every landmark, building and prop of the archipelago (from layout.js) into Builders, and collects
// POIs, foliage exclusions, colliders, walkable surfaces, night-light sources and the dynamic objects.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, lerp, smoothstep } from '../../core/math.js';
import * as L from '../layout.js';
import { Builder } from '../builder.js';
import { P, crate, barrel, lanternPost, lanternBox, bench, signpost, fence, ropeCoil, buoy, netPile, hangingNet, planter, tableSet, woodpile, bollard, fishIcon } from './common.js';
import { stiltHut, house, homeTent, homeCabin, homeCottage, aquarium, lighthouse, windmill, windmillSails, deckPlanks, gableRoof } from './buildings.js';
import { boatGeometry, createFlames, createBeam, createChest } from './dynamic.js';

const facingTo = (dx, dz) => Math.atan2(dx, dz);

/**
 * @param {any} ctx
 * @param {{terrain:any, materials:any, U:any}} env
 */
export function buildPlaces(ctx, env) {
  const { terrain, materials } = env;
  const H = terrain.heightAt;
  const R = rng(L.SEED + '-places');
  const surfaceHint = [];
  const groundAt = (x, z) => { let y = Math.max(H(x, z), -0.6); for (const s of surfaceHint) if (Math.abs(x - s.x) < s.r && Math.abs(z - s.z) < s.r) y = Math.max(y, s.y); return y; };
  const B = new Builder({ seed: 'places', groundAt });
  const pois = {};
  const exclusions = [];
  const dyn = { updates: [] };
  const ex = (x, z, r) => exclusions.push({ x, z, r });
  const poi = (id, x, y, z, facing = 0, extra = {}) => { pois[id] = { id, x, y, z, facing, zone: L.zoneAt(x, z), ...extra }; return pois[id]; };
  const W = (b, x, y, z) => b.world(x, y, z);
  /** Highest ground under a footprint (so buildings never sink). */
  const footY = (x, z, r) => { let m = -Infinity, n = Infinity; for (const [a, b] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]) { const h = H(x + a, z + b); m = Math.max(m, h); n = Math.min(n, h); } return { top: m, low: n }; };
  /** Stone/earth plinth under a building on uneven ground. */
  const plinth = (b, w, d, drop, color = P.stoneDark) => { if (drop > 0.08) b.box(w, drop + 0.4, d, 0, -drop / 2 - 0.05, 0, color, { round: 0.05 }); };

  // ------------------------------------------------------------------ ramps & steps: every deck reachable from land
  const wet = (x, z) => { const w = env.waterSurfaceAt?.(x, z); return w != null && w - H(x, z) > 0.03; };
  const hitCol = (c, x, z, r) => {
    if (c.type === 'circle') return (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2;
    const co = Math.cos(c.rot || 0), si = Math.sin(c.rot || 0), dx = x - c.x, dz = z - c.z;
    return Math.abs(dx * co - dz * si) < c.hw + r && Math.abs(dx * si + dz * co) < c.hd + r;
  };
  /** Solid (walker-blocking) collider already placed at x,z (within r)? */
  const solidAt = (x, z, r = 0) => B.colliders.some(c => c.layer !== 'boat' && hitCol(c, x, z, r));
  const ramps = [];
  /** Tag the deck surface deckPlanks just added as part of a dock (for the dock-edge sit spots). */
  const markDock = name => { const sf = B.surfaces[B.surfaces.length - 1]; if (sf) sf.dock = name; };
  /**
   * Find the shortest ramp from a deck edge point (x, z at deck height y) going out along (ux, uz) down to dry,
   * free land. Returns a plan for buildRamp or null.
   */
  function planRamp(x, z, y, ux, uz, { hw = 0.8, maxSlope = 0.24, maxLen = 12, inner = 0.9, minLen = 0.6, spread = 0.8 } = {}) {
    const px = -uz, pz = ux;   // across the ramp
    for (let k = 0.25; k <= inner; k += 0.3) for (const sd of [-spread, 0, spread]) if (solidAt(x - ux * k + px * sd * hw, z - uz * k + pz * sd * hw, 0.3)) return null;
    for (let d = minLen; d <= maxLen; d += 0.2) {
      const lx = x + ux * d, lz = z + uz * d, h = H(lx, lz);
      if (wet(lx, lz) || wet(lx + ux * 0.7, lz + uz * 0.7)) continue;
      const y0 = h + 0.03;
      if (y0 > y + 0.08) return null;                       // land as high as the deck: nothing to bridge
      if ((y - y0) / d > maxSlope) continue;
      let ok = true;
      for (let t = 0; t <= d + 0.01 && ok; t += 0.25) {
        const cx = x + ux * t, cz = z + uz * t, ry = y + (y0 - y) * t / d;
        for (const sd of [-1, 0, 1]) { const qx = cx + px * sd * hw, qz = cz + pz * sd * hw; if (solidAt(qx, qz, 0.05) || H(qx, qz) > ry + 0.3) ok = false; }
      }
      if (ok && (solidAt(lx + ux * 0.6, lz + uz * 0.6, 0.45) || terrain.slopeAt(lx + ux * 0.5, lz + uz * 0.5) > 0.75 || wet(lx + ux * 1.2, lz + uz * 1.2))) ok = false;
      if (ok) return { x, z, y, ux, uz, d, y0, hw };
    }
    return null;
  }
  /** Build a planned ramp: walkable span surface + planks (or treads) + stringers + posts; keeps foliage off it. */
  function buildRamp(r, { color = P.wood, color2 = P.woodLight, stairs = false, tag = 'ramp' } = {}) {
    const { x, z, y, ux, uz, d, y0, hw } = r;
    const ext = 0.3;                                        // runs a little into the land so the joint is flush
    const slope = (y - y0) / d;
    const lx = x + ux * (d + ext), lz = z + uz * (d + ext), ly = y0 - slope * ext;
    const L = d + ext, dx = -ux, dz = -uz, yaw = Math.atan2(dx, dz);
    B.surfaces.push({ type: 'span', x0: lx, z0: lz, x1: x, z1: z, hw, y0: ly, y1: y, arch: 0, tag });
    B.at((x + lx) / 2, (z + lz) / 2);
    const at = t => [lx + dx * L * t, ly + (y - ly) * t, lz + dz * L * t];
    if (stairs) {
      const n = Math.max(2, Math.ceil((y - ly) / 0.17));
      for (let i = 0; i < n; i++) {
        const [cx, cy, cz] = at((i + 0.5) / n), top = ly + (y - ly) * (i + 1) / n;
        const hgt = Math.max(0.12, top - H(cx, cz) + 0.1);
        B.box(hw * 2, hgt, L / n + 0.02, cx, top - hgt / 2, cz, i % 2 ? color : color2, { ry: yaw, round: 0.03 });
      }
    } else {
      const n = Math.max(2, Math.round(L / 0.33));
      for (let i = 0; i < n; i++) {
        const [cx, cy, cz] = at((i + 0.5) / n);
        B.box(hw * 2 + (i % 2 ? 0.06 : -0.04), 0.09, L / n - 0.04, cx, cy - 0.05, cz, i % 3 === 0 ? color2 : i % 3 === 1 ? color : P.woodGrey, { ry: yaw + (B.R() - 0.5) * 0.02, rx: -Math.atan(slope) });
      }
      for (const sd of [-1, 1]) {
        const ox = -dz * sd * (hw - 0.12), oz = dx * sd * (hw - 0.12);
        const a = at(0), b = at(1);
        B.beam(new THREE.Vector3(a[0] + ox, a[1] - 0.16, a[2] + oz), new THREE.Vector3(b[0] + ox, b[1] - 0.16, b[2] + oz), 0.06, P.woodDark);
        for (const t of [0.5, 1]) {
          const [cx, cy, cz] = at(t), px = cx + ox, pz = cz + oz, g = H(px, pz);
          if (cy - g > 0.25) B.cyl(0.09, 0.11, cy - g + 0.5, px, (cy + g - 0.5) / 2 - 0.05, pz, P.woodDeep, { seg: 6 });
        }
      }
    }
    B.free();
    for (let t = 0; t <= L; t += 1.5) ex(lx + dx * t, lz + dz * t, hw + 0.9);
    ramps.push({ x0: lx, z0: lz, x1: x, z1: z, y0: ly, y1: y, hw, tag });
    return r;
  }
  /** Try several deck-edge exits (in order of preference) and build the shortest ramp found (or up to `count`). */
  function connectDeck(exits, o = {}) {
    const plans = exits.map(e => planRamp(e.x, e.z, e.y, e.ux, e.uz, { ...o, ...e.o })).filter(Boolean).sort((a, b) => a.d - b.d);
    const made = [];
    for (const p of plans) {
      if (made.length >= (o.count || 1)) break;
      if (made.some(m => Math.hypot(m.x - p.x, m.z - p.z) < 3)) continue;
      made.push(buildRamp(p, o));
    }
    if (!made.length && ctx.isDebug) console.warn('[world] no ramp for deck', o.tag, exits[0]);
    return made;
  }
  /**
   * Little wooden side stairs from the dry beach up to a dock that runs over the sand (south-running dock D {x, z0, z1,
   * w, y}): a player walking on the sand beside the planks met a waist-high wall and had to go back round to the root.
   * One stair per side at most, where the sand is dry and ≥ 0.35 m below the planks.
   */
  function dockSideStairs(D, tag) {
    for (const s of [-1, 1]) {
      const exits = [];
      for (let zz = D.z0 + 1.5; zz < D.z1 - 1; zz += 0.75) {
        const ex0 = D.x + s * D.w / 2, gy = H(ex0 + s * 0.8, zz);
        if (D.y - gy < 0.35 || wet(ex0 + s * 0.8, zz) || wet(ex0 + s * 2.5, zz)) continue;
        exits.push({ x: ex0, z: zz, y: D.y, ux: s, uz: 0 });
      }
      // the middle of the dry stretch (where someone walking along the beach beside the planks meets the dock)
      const o = { hw: 0.55, maxSlope: 0.62, minLen: 0.5, maxLen: 3.2, inner: 0.6, spread: 0.6 };
      const plans = exits.map(e => planRamp(e.x, e.z, e.y, e.ux, e.uz, o)).filter(Boolean);
      if (plans.length) buildRamp(plans[Math.floor(plans.length / 2)], { stairs: true, tag: `${tag}_${s < 0 ? 'w' : 'e'}` });
    }
  }
  /** Deck-local point (deck centre cx,cz, yaw rot) → world {x, z} and a local direction → world. */
  const loc = (cx, cz, rot, lx, lz) => ({ x: cx + lx * Math.cos(rot) + lz * Math.sin(rot), z: cz - lx * Math.sin(rot) + lz * Math.cos(rot) });

  // ================================================================== HOME BEACH
  const homeTiers = [];
  {
    const { x, z, rot } = L.HOME;
    const f = footY(x, z, 3.6);
    const y = f.top;
    const makers = [homeTent, homeCabin, homeCottage];
    makers.forEach((make, tier) => {
      const BT = new Builder({ seed: 'home' + tier, groundAt });
      BT.push(x, y, z, rot);
      plinth(BT, tier === 0 ? 3.2 : tier === 1 ? 5.6 : 7.2, tier === 0 ? 3.3 : 5.0, y - f.low, P.stoneDark);
      const r = make(BT);
      BT.pop();
      BT.push(x, y, z, rot);
      const bed = BT.world(r.bed.x, r.bed.y, r.bed.z), door = BT.world(r.door.x, r.door.y, r.door.z);
      BT.pop();
      const group = BT.build({ solid: materials.solid(), glow: materials.glow() }, { name: 'home_tier_' + tier });
      homeTiers.push({ group, colliders: BT.colliders, surfaces: BT.surfaces, glows: BT.glows, bed, door, tier });
    });
    ex(x, z + 1, 7.5);
    // garden: fence, mailbox, flower patch, clothesline
    B.at(x, z);
    B.push(x, 0, z, rot);
    fence(B, -5.2, -4.5, -5.2, 4.5, groundAt);
    fence(B, -5.2, -4.5, 3.5, -4.5, groundAt);
    B.pop();
    const mx = x + 6.5, mz = z + 6.5, my = groundAt(mx, mz);
    B.push(mx, my, mz, -0.4);
    B.box(0.1, 1.1, 0.1, 0, 0.55, 0, P.woodDark);
    B.box(0.42, 0.32, 0.6, 0, 1.25, 0, P.trimRed, { round: 0.08 });
    B.box(0.05, 0.2, 0.05, 0.24, 1.4, 0.15, P.clothRed);
    B.circle(0, 0, 0.25);
    B.pop();
    poi('home_mailbox', mx, my, mz + 0.8, Math.PI);
    // clothesline between two posts with a few cloths
    const c0 = B.world(0, 0, 0);
    const clx = x - 7, clz = z + 2;
    for (const dz of [-2, 2]) { const yy = groundAt(clx, clz + dz); B.push(clx, yy, clz + dz); B.cyl(0.05, 0.06, 2.0, 0, 1.0, 0, P.woodDark, { seg: 5 }); B.circle(0, 0, 0.12); B.pop(); }
    const cly = groundAt(clx, clz) + 1.9;
    B.box(0.02, 0.02, 4, clx, cly, clz, P.rope);
    [[P.clothBlue, -1.2], [P.cloth, -0.2], [P.clothRed, 0.8], [P.trimTeal, 1.5]].forEach(([c, dz], i) => B.box(0.04, 0.6 - i * 0.05, 0.5, clx, cly - 0.32, clz + dz, c, { ry: (i - 1.5) * 0.08 }));
    B.free();
  }
  // campfire
  {
    const { x, z } = L.CAMPFIRE;
    const y = groundAt(x, z);
    B.at(x, z);
    B.push(x, y, z);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; B.rock(0.28, Math.cos(a) * 0.75, 0.08, Math.sin(a) * 0.75, i % 2 ? P.stone : P.stoneDark, { variant: i % 6, sy: 0.7 }); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; B.cyl(0.09, 0.11, 1.0, Math.cos(a) * 0.22, 0.22, Math.sin(a) * 0.22, i % 2 ? P.woodDark : P.woodDeep, { seg: 6, rz: Math.cos(a) * 1.1, rx: -Math.sin(a) * 1.1 }); }
    B.cyl(0.5, 0.55, 0.05, 0, 0.03, 0, 0x3a2a22, { seg: 10 });
    // log seats
    B.cyl(0.24, 0.26, 1.7, 0, 0.24, -2.1, P.wood, { seg: 8, rz: Math.PI / 2 });
    B.cyl(0.21, 0.21, 0.01, 0.86, 0.24, -2.1, P.woodLight, { seg: 8, rz: Math.PI / 2 });
    B.circle(-0.5, -2.1, 0.3); B.circle(0.5, -2.1, 0.3);
    B.cyl(0.24, 0.26, 1.5, 2.1, 0.24, 0.2, P.wood, { seg: 8, rx: Math.PI / 2, ry: 0.3 });
    B.circle(2.1, 0.2, 0.4);
    // cooking pot on a tripod
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; B.beam(new THREE.Vector3(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75), new THREE.Vector3(0, 1.45, 0), 0.03, P.woodDark); }
    B.cyl(0.005, 0.005, 0.45, 0, 1.2, 0, P.metal, { seg: 3 });
    B.cyl(0.2, 0.16, 0.24, 0, 0.92, 0, P.metal, { seg: 10 });
    B.circle(0, 0, 0.95, 'fire');   // [Fix] the fire ring + tripod were walk-through
    B.pop();
    bench(B, x - 2.4, groundAt(x - 2.4, z), z + 0.2, Math.PI / 2);
    B.free();
    B.glow(x, y + 0.6, z, 0xff8a3a, 1.6, 'fire');
    const flames = createFlames();
    flames.position.set(x, y + 0.05, z);
    dyn.flames = flames;
    poi('home_campfire', x, y, z + 1.7, Math.PI);
    poi('bench_home', x - 2.4 + 0.15, groundAt(x - 2.4, z) + 0.46, z + 0.2, Math.PI / 2, { kind: 'bench' });
    ex(x, z, 3.2);
  }
  // home dock
  {
    const D = L.HOME_DOCK, len = D.z1 - D.z0, cz = (D.z0 + D.z1) / 2;
    B.at(D.x, cz);
    B.push(D.x, 0, cz);
    deckPlanks(B, D.w, len, D.y, { postDepth: 3.5, step: 2.2, along: 'x' });
    markDock('home');
    B.pop();
    B.colliders.push({ type: 'box', x: D.x, z: cz, hw: D.w / 2 + 0.2, hd: len / 2, rot: 0, layer: 'boat', tag: 'dock' });
    surfaceHint.push({ x: D.x, z: cz, r: len / 2, y: D.y });
    // end platform
    B.push(D.x + 0.9, 0, D.z1 + 1.2);
    deckPlanks(B, 4.2, 2.8, D.y, { postDepth: 3.5, step: 2.0 });
    markDock('home');
    B.pop();
    B.colliders.push({ type: 'box', x: D.x + 0.9, z: D.z1 + 1.2, hw: 2.3, hd: 1.5, rot: 0, layer: 'boat', tag: 'dock' });
    // steps from the sand
    for (let i = 0; i < 3; i++) { const sz = D.z0 - 0.4 - i * 0.5, gy = groundAt(D.x, sz); const sy = lerp(D.y - 0.25, gy, (i + 1) / 4); if (sy > gy + 0.05) { B.box(D.w - 0.2, Math.max(0.1, sy - gy + 0.1), 0.48, D.x, (sy + gy) / 2, sz, P.wood); B.surfaces.push({ type: 'box', x: D.x, z: sz, hw: D.w / 2 - 0.1, hd: 0.25, rot: 0, y: sy }); } }
    const ey = D.y;
    lanternPost(B, D.x + 2.7, ey, D.z1 + 2.4, 2.0, Math.PI);
    bollard(B, D.x - 1.0, ey, D.z1 - 4.5);
    bollard(B, D.x + 2.8, ey, D.z1);
    crate(B, D.x - 0.7, ey, D.z0 + 4, 0.85, 0.3);
    barrel(B, D.x - 0.65, ey, D.z0 + 5.0, 0.85);
    ropeCoil(B, D.x + 0.6, ey, D.z1 - 2.0);
    B.free();
    dockSideStairs(D, 'stairs_home_dock');
    poi('dock_home', D.x + 0.9, ey, D.z1 + 2.2, 0);
    poi('boat_mooring_home', D.x - 2.6, 0, D.z1 - 1.5, 0);
    poi('bench_dock_home', D.x + 0.9 - 1.2, ey, D.z1 + 2.55, 0, { kind: 'edge' });
    for (let zz = D.z0; zz < D.z1 + 3; zz += 3) ex(D.x, zz, 2.6);
    // beach umbrella + towel
    const ux = D.x - 8, uz = D.z0 + 4, uy = groundAt(ux, uz);
    B.at(ux, uz); B.push(ux, uy, uz);
    B.cyl(0.035, 0.035, 2.3, 0, 1.15, 0, P.trimWhite, { seg: 5, rz: 0.12 });
    for (let i = 0; i < 8; i++) B.cone(1.3, 0.45, 0.14, 2.25, 0, i % 2 ? P.clothRed : P.trimWhite, { seg: 8, ry: i * Math.PI / 4, sx: 0.4, sz: 1 });
    B.cone(1.32, 0.46, 0.14, 2.25, 0, P.clothRed, { seg: 16 });
    B.box(0.9, 0.02, 1.8, 0.9, 0.02, 0.6, P.trimTeal, { ry: 0.3 });
    B.box(0.9, 0.025, 0.25, 0.9, 0.03, 0.6, P.trimWhite, { ry: 0.3 });
    B.pop(); B.free();
    B.circle(ux, uz, 0.15);
    ex(ux, uz, 1.8);
  }

  // ================================================================== VILLAGE
  const V = L.VILLAGE;
  const shopFront = {};
  for (const [kind, s] of Object.entries(V.shops)) {
    if (kind === 'aquarium') continue;
    const f = footY(s.x, s.z, 3.5);
    let deckY, baseY = 0;
    if (s.stilts) { deckY = Math.max(1.55, f.top + 0.45); baseY = 0; }
    else { baseY = f.top; deckY = 0.5; }
    B.at(s.x, s.z);
    B.push(s.x, baseY, s.z, s.rot);
    if (!s.stilts) plinth(B, 7.2, 7.0, f.top - f.low);
    const roofs = { bottega: [P.roofRed, P.roofRedDark], pescheria: [P.roofBlue, 0x3a6488], falegname: [P.roofBrown, P.roofBrownDark], trattoria: [P.roofRed, P.roofRedDark] };
    const walls = { bottega: [P.woodLight, P.wood, 0xd8a870], pescheria: [P.woodGrey, 0xb8a888, P.woodLight], falegname: [P.wood, P.woodDark, P.woodLight], trattoria: [0xf0dcb8, 0xe8d0a8, 0xf6e6c8] };
    const r = stiltHut(B, kind, { deckY, stilts: s.stilts, roof: roofs[kind], wall: walls[kind] });
    const fw = B.world(r.front.x, r.front.y, r.front.z);
    B.pop();
    surfaceHint.push({ x: s.x, z: s.z, r: 4.2, y: baseY + deckY });
    shopFront[kind] = fw;
    poi('village_' + kind, fw.x, fw.y, fw.z, s.rot + Math.PI);
    ex(s.x, s.z, 6);
    B.free();
    // [Fix] a ramp from the land up to the counter deck (stilt decks stood 1-1.5 m above the beach with no way up).
    // Exits: beside the counter at the front edge, or the two sides of the front area (never the railed back).
    // Exits (deck-local): the front edge beside the counter, the sides of the front area, the open back corners
    // (straight back or angled out) and the sides behind the hut. The shortest ramp to dry land wins.
    const dy = baseY + deckY, exits = [];
    const ex2 = (lx, lz, dx, dz, o) => { const p = loc(s.x, s.z, s.rot, lx, lz), l = Math.hypot(dx, dz); exits.push({ ...p, y: dy, ux: (dx * Math.cos(s.rot) + dz * Math.sin(s.rot)) / l, uz: (-dx * Math.sin(s.rot) + dz * Math.cos(s.rot)) / l, o }); };
    for (const sx of [-1, 1]) {
      ex2(sx * 2.45, 3.9, 0, 1);
      ex2(sx * 3.5, 2.95, sx, 0);
      ex2(sx * 3.5, -2.0, sx, 0, { spread: 0.4 });
      for (const a of [0, 0.6, 1.0]) ex2(sx * 3.0, -2.9, sx * Math.sin(a), -Math.cos(a), { hw: 0.5, spread: 0 });
    }
    connectDeck(exits, { hw: 0.75, maxSlope: 0.3, tag: 'ramp_' + kind });
  }
  // trattoria terrace: tables + string lights
  {
    const s = V.shops.trattoria, y0 = footY(s.x, s.z, 3.5).top;
    B.at(s.x, s.z);
    B.push(s.x, 0, s.z, s.rot);
    const pts = [[-3.2, 6.2], [0.3, 7.0], [3.4, 6.0]];
    for (const [lx, lz] of pts) { const w = B.world(lx, 0, lz); const gy = groundAt(w.x, w.z); B.push(lx, gy, lz); tableSet(B, 0, 0, 0, R() * 3, [P.clothRed, P.trimTeal, P.trimWhite][Math.floor(R() * 3)]); B.pop(); }
    // posts + strings of bulbs
    const posts = [[-4.8, 4.0], [-4.8, 8.4], [4.8, 8.4], [4.8, 4.0]];
    const gy = groundAt(s.x, s.z + 6);
    for (const [lx, lz] of posts) { B.cyl(0.07, 0.08, 3.0, lx, gy + 1.5, lz, P.woodDark, { seg: 6 }); B.circle(lx, lz, 0.12); }
    for (let k = 0; k < posts.length; k++) {
      const a = posts[k], b = posts[(k + 1) % posts.length];
      if (k === 3) continue;
      for (let i = 1; i < 8; i++) { const t = i / 8; const sag = Math.sin(t * Math.PI) * 0.45; B.sphere(0.07, lerp(a[0], b[0], t), gy + 2.9 - sag, lerp(a[1], b[1], t), 0xffe2a0, { mat: 'glow', detail: 0 }); }
    }
    B.glow(0, gy + 2.6, 6.2, 0xffc878, 1.2, 'string');
    B.pop();
    ex(s.x, s.z + 6, 5);
    B.free();
  }
  // carpenter yard: boat on trestles, planks, sawhorse
  {
    const s = V.shops.falegname;
    B.at(s.x, s.z);
    B.push(s.x, 0, s.z, s.rot);
    const gy = (lx, lz) => { const w = B.world(lx, 0, lz); return groundAt(w.x, w.z); };
    const bx = 4.6, bz = 3.0, by = gy(bx, bz);
    for (const dz of [-1, 1]) { B.box(1.4, 0.08, 0.12, bx, by + 0.6, bz + dz, P.woodDark); for (const dx of [-0.6, 0.6]) B.box(0.08, 0.62, 0.08, bx + dx, by + 0.3, bz + dz, P.woodDark, { rz: dx * 0.3 }); }
    const bg = boatGeometry({ paint: 0xe8dcc8, stripe: P.trimRed });
    B.addRaw(bg.hull, { x: bx, y: by + 0.95, z: bz, rz: 0.06, ry: 0.15 });
    B.rect(bx, bz, 0.8, 1.9);
    // plank stack
    for (let i = 0; i < 6; i++) B.box(0.3, 0.08, 3.2, -4.4 + (i % 3) * 0.32, gy(-4.4, 2.4) + 0.1 + Math.floor(i / 3) * 0.09, 2.4, i % 2 ? P.woodLight : P.wood);
    B.rect(-4.1, 2.4, 0.6, 1.7);
    woodpile(B, -4.2, gy(-4.2, -1.5), -1.5, 0.2);
    barrel(B, 3.8, gy(3.8, -1.2), -1.2);
    B.pop();
    ex(s.x + 3, s.z + 2, 5);
    B.free();
  }
  // aquarium
  let aquariumTanks = [];
  {
    const s = V.shops.aquarium, f = footY(s.x, s.z, 5);
    B.at(s.x, s.z);
    B.push(s.x, f.top, s.z, s.rot);
    plinth(B, 10, 7, f.top - f.low);
    const r = aquarium(B);
    aquariumTanks = r.tanks.map(t => { const w = B.world(t.x, t.y, t.z); return { x: w.x, y: w.y, z: w.z, w: t.w, h: t.h, d: t.d, rot: s.rot }; });
    // [Fix] the hall sits on a plinth up to ~1 m above the square: a stone landing + steps down to the ground
    B.box(2.6, 0.22, 0.9, 0, 0.11, 3.75, P.stone, { round: 0.04 });
    B.deck(0, 3.75, 1.3, 0.45, 0.2, 0, 'landing');
    const d = B.world(0, 0, 3.85);
    B.pop();
    { const e = loc(s.x, s.z, s.rot, 0, 4.2); const pl = planRamp(e.x, e.z, f.top + 0.2, Math.sin(s.rot), Math.cos(s.rot), { hw: 1.1, maxSlope: 0.6, minLen: 0.4, inner: 0 }); if (pl) buildRamp(pl, { stairs: true, color: P.stone, color2: P.stoneWarm, tag: 'steps_aquarium' }); }
    poi('village_aquarium', d.x, f.top + 0.2, d.z, s.rot);
    ex(s.x, s.z, 7);
    B.free();
  }
  // houses (NPC homes)
  for (const h of V.houses) {
    const f = footY(h.x, h.z, 3);
    B.at(h.x, h.z);
    B.push(h.x, f.top, h.z, h.rot);
    plinth(B, 5, 4.4, f.top - f.low, P.stone);
    const door = house(B, h.style);
    const d = B.world(door.x, 0, door.z);
    // garden bits
    planter(B, 2.6, 0, 2.4, 0.2, 1.0);
    if (h.style % 2) barrel(B, -2.9, 0, 1.6, 0.85); else crate(B, -2.9, 0, 1.4, 0.8, 0.4);
    B.pop();
    poi('npc_' + h.id, d.x, groundAt(d.x, d.z), d.z, h.rot);
    ex(h.x, h.z, 5);
    B.free();
  }
  // square: well, market stall, benches, lamps, notice board, bunting
  {
    const { x, z } = V.square;
    const y = groundAt(x, z);
    B.at(x, z);
    B.push(x, y, z);
    // well
    B.cyl(1.0, 1.05, 0.8, 0, 0.4, 0, P.stone, { seg: 12 });
    B.cyl(0.85, 0.85, 0.82, 0, 0.42, 0, 0x2a4a52, { seg: 12 });
    B.torus(0.95, 0.12, 0, 0.82, 0, P.stoneWarm, { rx: Math.PI / 2 });
    for (const s of [-1, 1]) B.box(0.14, 1.8, 0.14, s * 0.9, 1.6, 0, P.woodDark);
    B.cyl(0.08, 0.08, 2.0, 0, 2.2, 0, P.wood, { seg: 6, rz: Math.PI / 2 });
    B.box(2.4, 0.08, 1.0, 0, 2.62, 0.32, P.roofRed, { rx: 0.5 }); B.box(2.4, 0.08, 1.0, 0, 2.62, -0.32, P.roofRedDark, { rx: -0.5 });
    B.cyl(0.18, 0.15, 0.3, 0.2, 1.4, 0, P.wood, { seg: 8 });
    B.circle(0, 0, 1.15);
    // market stall
    B.push(-5.5, 0, -2.5, 0.35);
    B.box(2.6, 0.9, 1.0, 0, 0.45, 0, P.wood, { round: 0.03 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(0.1, 2.3, 0.1, sx * 1.25, 1.15, sz * 0.45, P.woodDark);
    for (let i = 0; i < 6; i++) B.box(0.46, 0.05, 1.6, -1.15 + i * 0.46, 2.35, 0.2, i % 2 ? P.trimWhite : P.trimTeal, { rx: 0.25 });
    for (let i = 0; i < 3; i++) { crate(B, -0.8 + i * 0.8, 0.9, 0.05, 0.6, 0); for (let k = 0; k < 4; k++) B.sphere(0.1, -0.8 + i * 0.8 + (k % 2 - 0.5) * 0.18, 1.35, (k > 1 ? 0.1 : -0.1), [0xf2a03a, 0xe84a3a, 0x9ad04a][i], { detail: 0 }); }
    B.rect(0, 0, 1.4, 0.6);
    B.pop();
    // notice board
    B.push(4.6, 0, -3.5, -0.4);
    for (const s of [-1, 1]) B.box(0.12, 2.0, 0.12, s * 0.8, 1.0, 0, P.woodDark);
    B.box(1.7, 1.1, 0.08, 0, 1.35, 0, P.woodLight, { round: 0.03 });
    [[0xfff6e6, -0.4, 1.5], [0xf8e8b8, 0.25, 1.55], [0xf6d6d0, 0.5, 1.15], [0xe8f0f8, -0.2, 1.1]].forEach(([c, px, py]) => B.box(0.42, 0.34, 0.02, px, py, 0.05, c, { rz: (px * 7 % 1) * 0.2 - 0.1 }));
    B.box(1.9, 0.1, 0.3, 0, 1.95, 0, P.roofRed);
    B.rect(0, 0, 0.9, 0.15);
    B.pop();
    // planters & barrels
    planter(B, -3.2, 0, 4.3, 0, 1.4); planter(B, 3.3, 0, 4.4, 0, 1.4);
    barrel(B, 6.4, 0, 0.8); barrel(B, 6.9, 0, 1.6, 0.9); crate(B, 6.2, 0, 2.6, 0.9, 0.3);
    B.pop();
    // lamp posts around the square
    for (const [dx, dz] of [[-6, 4], [6, 4], [-6, -5.5], [6.5, -5]]) lanternPost(B, x + dx, groundAt(x + dx, z + dz), z + dz, 2.3, Math.atan2(-dx, -dz) + Math.PI / 2);
    // benches
    bench(B, x - 2.6, groundAt(x - 2.6, z + 3.4), z + 3.4, Math.PI, 1.7);
    poi('bench_village', x - 2.6, groundAt(x - 2.6, z + 3.4) + 0.46, z + 3.4 - 0.05, Math.PI, { kind: 'bench' });
    bench(B, x + 2.8, groundAt(x + 2.8, z + 3.4), z + 3.4, Math.PI, 1.7);
    poi('bench_village_2', x + 2.8, groundAt(x + 2.8, z + 3.4) + 0.46, z + 3.4 - 0.05, Math.PI, { kind: 'bench' });
    // bunting across the square (two strings)
    for (const [ax, az, bx, bz] of [[-6, 4, 6, -5], [-6, -5.5, 6, 4]]) {
      const ay = groundAt(x + ax, z + az) + 2.25, by = groundAt(x + bx, z + bz) + 2.25;
      for (let i = 1; i < 14; i++) {
        const t = i / 14, sag = Math.sin(t * Math.PI) * 0.6;
        const px = x + lerp(ax, bx, t), pz = z + lerp(az, bz, t), py = lerp(ay, by, t) - sag;
        B.cone(0.13, 0.32, px, py - 0.14, pz, [P.clothRed, P.flowerYellow, P.trimTeal, P.trimWhite, P.flowerPink][i % 5], { seg: 3, rx: Math.PI, ry: Math.atan2(bx - ax, bz - az), sz: 0.15 });
      }
    }
    ex(x, z, 7.5);
    B.free();
  }
  // village dock with T end + moored boats + sailboat
  {
    const D = V.dock, len = D.z1 - D.z0, cz = (D.z0 + D.z1) / 2;
    B.at(D.x, cz);
    B.push(D.x, 0, cz);
    deckPlanks(B, D.w, len, D.y, { postDepth: 4, step: 2.2 });
    markDock('village');
    B.pop();
    B.colliders.push({ type: 'box', x: D.x, z: cz, hw: D.w / 2 + 0.2, hd: len / 2, rot: 0, layer: 'boat', tag: 'dock' });
    surfaceHint.push({ x: D.x, z: cz, r: len / 2, y: D.y });
    B.push(D.x, 0, D.z1 + 1.4);
    deckPlanks(B, 8, 2.8, D.y, { postDepth: 4, step: 2.0 });
    markDock('village');
    B.pop();
    B.colliders.push({ type: 'box', x: D.x, z: D.z1 + 1.4, hw: 4.2, hd: 1.5, rot: 0, layer: 'boat', tag: 'dock' });
    // [Fix] gangway from the beach up to the planks (the dock started 1.2 m above the sand: nobody could get on)
    connectDeck([{ x: D.x, z: D.z0, y: D.y, ux: 0, uz: -1 }], { hw: 1.05, maxSlope: 0.2, tag: 'ramp_village_dock' });
    for (let i = 0; i < 4; i++) bollard(B, D.x + (i % 2 ? 1.25 : -1.25), D.y, D.z0 + 4 + i * 4.5);
    lanternPost(B, D.x - 1.35, D.y, D.z0 + 8, 2.2, 0);
    lanternPost(B, D.x + 1.35, D.y, D.z0 + 16, 2.2, Math.PI);
    lanternPost(B, D.x + 3.8, D.y, D.z1 + 2.6, 2.2, Math.PI);
    crate(B, D.x - 3.2, D.y, D.z1 + 0.8, 0.9, 0.2); crate(B, D.x - 3.3, D.y + 0.55, D.z1 + 0.85, 0.7, 0.6); barrel(B, D.x - 2.3, D.y, D.z1 + 0.6);
    netPile(B, D.x + 2.6, D.y, D.z1 + 0.6);
    hangingNet(B, D.x - 1.6, D.y, D.z0 + 2.4, Math.PI / 2, 2.0, 1.2);
    for (let i = 0; i < 4; i++) buoy(B, D.x + (i % 2 ? 1.45 : -1.45), D.y - 0.35, D.z0 + 6 + i * 3.6, i % 2 ? P.clothRed : P.trimWhite);
    B.free();
    dockSideStairs(D, 'stairs_village_dock');
    poi('dock_village', D.x, D.y, D.z1 + 2.3, 0);
    poi('boat_mooring_village', D.x + 2.7, 0, D.z0 + 13, 0);
    poi('bench_harbor', D.x + 2.5, D.y, D.z1 + 2.65, 0, { kind: 'edge' });
    // moored decorative boats (static)
    const boats = [[D.x - 2.6, D.z0 + 9, 0.1, 0x9ad0e0, P.trimRed], [D.x - 2.7, D.z0 + 15.5, -0.06, 0xf2d68e, P.trimTeal], [D.x + 2.8, D.z0 + 19.5, 0.12, 0xf4f0e6, P.roofBlue]];
    for (const [bx, bz, ry, paint, stripe] of boats) {
      const g = boatGeometry({ paint, stripe });
      B.at(bx, bz); B.addRaw(g.hull, { x: bx, y: 0.02, z: bz, ry }); B.free();
      B.colliders.push({ type: 'box', x: bx, z: bz, hw: 0.7, hd: 1.8, rot: ry, layer: 'boat' });
      dyn.updates.push(null);
    }
    // sailboat at anchor in the bay
    {
      const sx = L.BAY.x + 4, sz = L.BAY.z + 4;
      const g = boatGeometry({ paint: 0xffffff, stripe: P.roofBlue });
      B.at(sx, sz);
      B.addRaw(g.hull, { x: sx, y: 0.05, z: sz, ry: 0.6, sx: 1.6, sy: 1.5, sz: 1.6 });
      B.push(sx, 0.05, sz, 0.6);
      B.cyl(0.07, 0.08, 6.5, 0, 3.4, 0.5, P.woodLight, { seg: 6 });
      B.cyl(0.05, 0.05, 3.0, 0, 1.4, -0.9, P.woodLight, { seg: 6, rx: Math.PI / 2 });
      B.add(B.geo('sailTri', () => { const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.6, 0), new THREE.Vector2(0, 5.2)]); return new THREE.ShapeGeometry(s); }), P.cloth, { x: 0.02, y: 1.5, z: 0.45, ry: Math.PI / 2 + Math.PI });
      B.add(B.geo('sailTri2', () => { const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-2.6, 0), new THREE.Vector2(0, 5.2)]); return new THREE.ShapeGeometry(s); }), P.cloth, { x: -0.02, y: 1.5, z: 0.45, ry: Math.PI / 2 + Math.PI });
      B.pop(); B.free();
      B.colliders.push({ type: 'circle', x: sx, z: sz, r: 2.6, layer: 'boat' });
    }
  }
  // lamp posts along village paths
  for (const [lx, lz] of [[24, 24], [38, 40], [20, 36], [44, 34], [28, 46], [50, 40]]) { const y = groundAt(lx, lz); if (y > 0.6) { lanternPost(B, lx, y, lz, 2.2, R() * 6); ex(lx, lz, 1); } }

  // ================================================================== LIGHTHOUSE CLIFFS
  {
    const { x, z } = L.LIGHTHOUSE;
    const f = footY(x, z, 2.5);
    B.at(x, z);
    B.push(x, f.top - 0.1, z, 0.4);
    const r = lighthouse(B);
    const top = B.world(r.top.x, r.top.y, r.top.z), lamp = B.world(r.lamp.x, r.lamp.y, r.lamp.z), door = B.world(r.door.x, 0, r.door.z);
    B.pop();
    dyn.lighthouse = { lamp, top };
    poi('lighthouse_top', top.x, top.y, top.z, 0.4 + Math.PI / 2);
    poi('lighthouse_door', door.x, groundAt(door.x, door.z), door.z, 0.4);
    ex(x, z, 4);
    // keeper's house
    const kx = x - 7, kz = z + 4, kf = footY(kx, kz, 3);
    B.push(kx, kf.top, kz, 0.5);
    plinth(B, 5, 4.4, kf.top - kf.low);
    const d = house(B, 1, { w: 4.2, d: 3.6, h: 2.5 });
    const dw = B.world(d.x, 0, d.z);
    B.pop();
    poi('npc_ettore', dw.x, groundAt(dw.x, dw.z), dw.z, 0.5);
    ex(kx, kz, 4.5);
    // bench looking at the sea + a few crates and a rowing boat upside-down
    const bx = x - 3, bz = z + 6.5;
    bench(B, bx, groundAt(bx, bz), bz, Math.PI, 1.7);
    // [Fix] two seats on the 1.7 m bench: Ettore sits on one end all day, the other end stays free for the player
    poi('bench_lighthouse', bx + 0.42, groundAt(bx, bz) + 0.46, bz - 0.05, Math.PI, { kind: 'bench' });
    poi('bench_lighthouse_2', bx - 0.42, groundAt(bx, bz) + 0.46, bz - 0.05, Math.PI, { kind: 'bench' });
    lanternPost(B, x - 2, groundAt(x - 2, z + 4), z + 4, 2.2, 0);
    B.free();
  }

  // ================================================================== MEADOW: windmill, bench, fences
  {
    const { x, z } = L.WINDMILL;
    const f = footY(x, z, 2);
    B.at(x, z);
    B.push(x, f.top - 0.05, z, 0.15);
    plinth(B, 4.2, 4.2, f.top - f.low, P.stone);
    const r = windmill(B);
    const hub = B.world(r.hub.x, r.hub.y, r.hub.z);
    B.pop();
    const sg = windmillSails().map(g => g);
    const sails = new THREE.Mesh(mergeGeometries(sg, false), materials.solid());
    sails.castShadow = true; sails.receiveShadow = true;
    const pivot = new THREE.Group(); pivot.position.copy(hub); pivot.rotation.y = 0.15; pivot.add(sails); pivot.name = 'windmillSails';
    dyn.sails = sails; dyn.sailsPivot = pivot;
    ex(x, z, 4);
    const bx = x - 3.5, bz = z + 6;
    bench(B, bx, groundAt(bx, bz), bz, 0.1, 1.7);
    poi('bench_meadow', bx, groundAt(bx, bz) + 0.46, bz + 0.05, 0.1, { kind: 'bench' });
    // fenced flower garden
    B.push(x + 8, 0, z + 9, 0.3);
    fence(B, -4, -3, 4, -3, groundAt); fence(B, 4, -3, 4, 3, groundAt); fence(B, -4, 3, -1, 3, groundAt);
    B.pop();
    B.free();
    poi('windmill_door', x, f.top, z + 3, 0.15);
  }
  // ================================================================== RIVER: bridge + stepping stones
  {
    const q = {};
    L.RIVER.query(L.BRIDGE.x, L.BRIDGE.z, 10, q);
    const s = q.s, cx = L.RIVER.at(s, 0), cz = L.RIVER.at(s, 1), lvl = L.RIVER.at(s, 2), hw = L.RIVER.at(s, 3);
    const [dx, dz] = L.RIVER.dir(s);
    const nx = -dz, nz = dx;              // across the river
    const half = hw + 2.6;
    const x0 = cx - nx * half, z0 = cz - nz * half, x1 = cx + nx * half, z1 = cz + nz * half;
    const y0 = groundAt(x0, z0) + 0.05, y1 = groundAt(x1, z1) + 0.05;
    const arch = Math.max(0.6, lvl + 1.2 - (y0 + y1) / 2);
    const yaw = Math.atan2(nx, nz);
    const len = half * 2;
    B.at(cx, cz);
    const N = 22;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const px = lerp(x0, x1, t), pz = lerp(z0, z1, t), py = lerp(y0, y1, t) + arch * Math.sin(Math.PI * t);
      const slope = (lerp(y0, y1, t + 0.01) + arch * Math.sin(Math.PI * (t + 0.01)) - py) / (len * 0.01);
      B.box(2.3, 0.1, len / N - 0.04, px, py - 0.05, pz, i % 3 ? P.wood : P.woodLight, { ry: yaw, rx: -Math.atan(slope) });
    }
    for (const side of [-1, 1]) {
      const ox = Math.cos(yaw) * 1.15 * side, oz = -Math.sin(yaw) * 1.15 * side;
      let prev = null;
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const px = lerp(x0, x1, t) + ox, pz = lerp(z0, z1, t) + oz, py = lerp(y0, y1, t) + arch * Math.sin(Math.PI * t);
        B.box(0.12, 1.0, 0.12, px, py + 0.4, pz, P.woodDark, { ry: yaw });
        if (i === 0 || i === 6) B.box(0.16, 1.15, 0.16, px, py + 0.45, pz, P.woodDark, { ry: yaw });
        if (prev) {
          const a = new THREE.Vector3(prev[0], prev[1] + 0.88, prev[2]), b = new THREE.Vector3(px, py + 0.88, pz);
          B.beam(a, b, 0.05, P.woodLight);
          B.beam(a.clone().setY(prev[1] + 0.45), b.clone().setY(py + 0.45), 0.035, P.wood);
        }
        prev = [px, py, pz];
      }
      B.colliders.push({ type: 'box', x: cx + ox * 1.05, z: cz + oz * 1.05, hw: 0.1, hd: half, rot: yaw, layer: 'walk', tag: 'rail' });
      // support posts in the water
      for (const t of [0.3, 0.7]) { const px = lerp(x0, x1, t) + ox * 0.9, pz = lerp(z0, z1, t) + oz * 0.9; const py = lerp(y0, y1, t) + arch * Math.sin(Math.PI * t); B.cyl(0.13, 0.15, py + 1.2 - (lvl - 1), px, (py + lvl - 1) / 2, pz, P.woodDeep, { seg: 6 }); }
    }
    B.free();
    B.surfaces.push({ type: 'span', x0, z0, x1, z1, hw: 1.15, y0, y1, arch });
    poi('river_bridge', cx, lvl + arch + 0.0 + (y0 + y1) / 2 - lvl, cz, Math.atan2(dx, dz));
    pois.river_bridge.y = (y0 + y1) / 2 + arch;
    ex(cx, cz, half + 1);
    dyn.bridge = { x0, z0, x1, z1, y0, y1, arch };
  }
  const riverRocks = [];
  {
    const q = {};
    L.RIVER.query(L.STONES.x, L.STONES.z, 10, q);
    const s = q.s, cx = L.RIVER.at(s, 0), cz = L.RIVER.at(s, 1), lvl = L.RIVER.at(s, 2), hw = L.RIVER.at(s, 3);
    const [dx, dz] = L.RIVER.dir(s);
    const nx = -dz, nz = dx;
    const n = Math.ceil((hw * 2 + 1.2) / 1.25);
    B.at(cx, cz);
    for (let i = 0; i <= n; i++) {
      const t = i / n - 0.5;
      const px = cx + nx * t * (hw * 2 + 1.4) + (R() - 0.5) * 0.2, pz = cz + nz * t * (hw * 2 + 1.4) + (R() - 0.5) * 0.2;
      const top = lvl + 0.16;
      const gy = H(px, pz);
      B.rock(0.68, px, Math.min(top - 0.25, gy + 0.2), pz, i % 2 ? P.stone : P.stoneWarm, { variant: i % 6, sy: Math.max(0.6, (top - gy) / 0.68 * 0.7), ry: R() * 3 });
      B.surfaces.push({ type: 'disc', x: px, z: pz, r: 0.78, y: Math.max(top, gy) });
      riverRocks.push({ x: px, z: pz, r: 0.6 });
    }
    B.free();
    ex(cx, cz, hw + 2);
  }

  // ================================================================== WATERFALL POND
  {
    const Pd = L.POND;
    // little fishing jetty on the south-east shore
    const a = Math.atan2(0.82, 0.57);
    const ux = Math.cos(a), uz = Math.sin(a);
    const jx = Pd.x + ux * (Pd.r - 0.6), jz = Pd.z + uz * (Pd.r - 0.6);
    const yaw = Math.atan2(ux, uz);
    const jy = Pd.level + 0.55;
    B.at(jx, jz);
    B.push(jx, 0, jz, yaw);
    deckPlanks(B, 1.8, 4.2, jy, { postDepth: 2, step: 2, along: 'x' });
    markDock('pond');
    B.pop();
    B.free();
    const end = { x: Pd.x + ux * (Pd.r - 2.4), z: Pd.z + uz * (Pd.r - 2.4) };
    poi('waterfall_pond', end.x, jy, end.z, yaw + Math.PI);
    poi('bench_pond', Pd.x + ux * (Pd.r - 2.6), jy, Pd.z + uz * (Pd.r - 2.6), yaw + Math.PI, { kind: 'edge' });
    ex(jx, jz, 3);
    // rocks framing the falls and the pool
    const F = L.WATERFALL;
    B.at(F.x, F.zTop);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const rx = F.x + s * (F.width / 2 + 0.8 + k * 0.7), rz = F.zTop + 0.5 + k * 1.6;
        const ry = lerp(F.top + 0.4, Pd.level + 0.6, k / 3.2);
        B.rock(1.3 - k * 0.12, rx, ry, rz, k % 2 ? P.stone : P.stoneDark, { variant: k + (s > 0 ? 2 : 0), sy: 1.2 });
        B.colliders.push({ type: 'circle', x: rx, z: rz, r: (1.3 - k * 0.12) * 0.85, tag: 'rock' });
      }
      B.rock(1.6, F.x + s * (F.width / 2 + 0.6), F.top + 0.3, F.zTop - 0.8, P.stoneDark, { variant: s > 0 ? 1 : 4 });
      B.colliders.push({ type: 'circle', x: F.x + s * (F.width / 2 + 0.6), z: F.zTop - 0.8, r: 1.35, tag: 'rock' });
    }
    for (let k = 0; k < 5; k++) { const ang = k / 5 * Math.PI - Math.PI, rs = 0.6 + R() * 0.5, rx = F.x + Math.cos(ang) * 3.8, rz = F.zBottom + 1.4 + Math.abs(Math.sin(ang)) * 0.8; B.rock(rs, rx, Pd.level - 0.1, rz, P.stone, { variant: k }); B.colliders.push({ type: 'circle', x: rx, z: rz, r: rs * 0.8, tag: 'rock' }); }
    B.free();
    ex(F.x, F.zBottom, 4);
  }

  // ================================================================== SEA CAVE
  {
    const C = L.CAVE;
    B.at(C.x, C.z);
    // ring of big rocks (open on the east = entrance, west = sea channel)
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * Math.PI * 2;
      const deg = ((a * 180 / Math.PI) + 360) % 360;
      if (deg < 32 || deg > 328) continue;               // entrance (east, +x)
      if (deg > 160 && deg < 200) continue;              // sea channel (west)
      const r = C.r + 1.6 + (i % 2) * 0.5;
      const px = C.x + Math.cos(a) * r, pz = C.z + Math.sin(a) * r;
      const south = Math.sin(a) > 0.3;                   // keep the camera side low
      const hgt = south ? 1.1 + R() * 0.5 : 2.4 + R() * 1.6;
      B.rock(1.9 + R() * 0.6, px, Math.max(H(px, pz), -0.5) + hgt * 0.4, pz, i % 3 ? 0x8f8a86 : 0x7a7672, { variant: i % 6, sy: hgt / 1.9, ry: R() * 6 });
      if (!south) B.rock(1.2, px + Math.cos(a) * 1.2, Math.max(H(px, pz), 0) + hgt * 0.9, pz + Math.sin(a) * 1.2, 0x8a8682, { variant: (i + 3) % 6, sy: 1.1 });
      B.colliders.push({ type: 'circle', x: px, z: pz, r: 1.7 });
    }
    // arch over the channel
    const ax = C.x - C.r - 1.8;
    for (const s of [-1, 1]) B.rock(1.5, ax, 1.4, C.z + s * 3.0, 0x85817c, { variant: s > 0 ? 2 : 5, sy: 2.4 });
    for (let k = 0; k < 5; k++) B.rock(1.25, ax + (R() - 0.5) * 0.6, 4.2 + Math.sin(k / 4 * Math.PI) * 0.6, C.z - 2.8 + k * 1.4, 0x8a8682, { variant: k, sy: 0.8 });
    for (let k = 0; k < 6; k++) B.cone(0.18, 0.7 + R() * 0.5, ax + (R() - 0.5), 3.3, C.z - 2 + k * 0.8, 0x9a958e, { seg: 5, rx: Math.PI });
    // glowing crystals around the pool
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 1.4 + 0.9, r = C.r + 0.7 + R() * 0.6;
      const px = C.x + Math.cos(a) * r, pz = C.z + Math.sin(a) * r;
      const py = Math.max(H(px, pz), 0.1);
      for (let j = 0; j < 3; j++) B.cone(0.12 + R() * 0.1, 0.5 + R() * 0.6, px + (R() - 0.5) * 0.4, py + 0.25, pz + (R() - 0.5) * 0.4, j % 2 ? 0x8ff0ff : 0xb8a0ff, { mat: 'crystal', seg: 5, rx: (R() - 0.5) * 0.6, rz: (R() - 0.5) * 0.6 });
    }
    B.free();
    B.glow(C.x, 0.6, C.z, 0x6ff0ff, 1.2, 'cave');
    poi('cave_entrance', C.entrance.x, groundAt(C.entrance.x, C.entrance.z), C.entrance.z, -Math.PI / 2);
    const px = C.x + C.r + 0.4, pz = C.z + 0.6;
    poi('cave_pool', px, groundAt(px, pz), pz, -Math.PI / 2);
    ex(C.x, C.z, C.r + 4);
    signpost(B, C.entrance.x + 3, groundAt(C.entrance.x + 3, C.entrance.z + 2.5), C.entrance.z + 2.5, 0.3, [Math.PI, -0.4]);
    lanternPost(B, C.entrance.x + 1.2, groundAt(C.entrance.x + 1.2, C.entrance.z - 2.2), C.entrance.z - 2.2, 2.0, Math.PI);
  }

  // ================================================================== ISLETS
  {
    const I = L.ISLANDS.palm;
    // small landing dock on the west beach
    let sx = I.cx - I.rx - 4, sz = I.cz + 1;
    for (let x = I.cx; x > I.cx - 40; x -= 0.5) if (H(x, sz) < 0.2) { sx = x; break; }
    const len = 7;
    B.at(sx, sz);
    B.push(sx - len / 2 + 2.5, 0, sz, Math.PI / 2);
    deckPlanks(B, 2.2, len, 1.05, { postDepth: 3, step: 2.3 });
    markDock('palm');
    B.pop();
    B.colliders.push({ type: 'box', x: sx - len / 2 + 2.5, z: sz, hw: len / 2, hd: 1.3, rot: 0, layer: 'boat', tag: 'dock' });
    lanternPost(B, sx - len + 3.2, 1.05, sz + 1.0, 2.0, Math.PI / 2);
    B.free();
    poi('palm_islet_dock', sx - len + 3.3, 1.05, sz, -Math.PI / 2);
    poi('boat_mooring_palm', sx - len + 2.5, 0, sz - 2.4, -Math.PI / 2);
    poi('palm_islet_beach', sx + 3.2, groundAt(sx + 3.2, sz), sz, -Math.PI / 2);
    for (let x = sx - len + 2; x < sx + 3; x += 2.5) ex(x, sz, 2);
    // hammock + towel + driftwood
    const hx = I.cx - 2, hz = I.cz - 4;
    B.at(hx, hz);
    for (const s of [-1, 1]) { const px = hx + s * 1.6, gy = groundAt(px, hz); B.cyl(0.09, 0.1, 2.0, px, gy + 1.0, hz, P.woodDark, { seg: 6 }); B.circle(px, hz, 0.15); }
    const hy = groundAt(hx, hz) + 0.85;
    for (let i = 0; i < 10; i++) { const t = (i + 0.5) / 10; B.box(0.32, 0.04, 0.75, hx - 1.45 + 2.9 * t, hy + 0.35 - Math.sin(t * Math.PI) * 0.4, hz, i % 2 ? P.clothRed : P.flowerYellow); }
    B.free();
    ex(hx, hz, 2.5);
  }
  {
    const T = L.ISLANDS.turtle;
    let sx = T.cx - 6, sz = T.cz + T.rz + 4;
    for (let z = T.cz; z < T.cz + 30; z += 0.5) if (H(T.cx - 4, z) < 0.15) { sx = T.cx - 4; sz = z - 1.5; break; }
    poi('turtle_isle_beach', sx, groundAt(sx, sz), sz, 0);
    poi('boat_mooring_turtle', sx, 0, sz + 4.5, 0);
    // crossed sticks marking the treasure + rocks
    const tx = L.TREASURE.x, tz = L.TREASURE.z, ty = groundAt(tx, tz);
    B.at(tx, tz);
    B.push(tx + 1.4, groundAt(tx + 1.4, tz - 0.8), tz - 0.8);
    B.cyl(0.04, 0.05, 1.4, 0, 0.6, 0, P.woodLight, { seg: 5, rz: 0.6 });
    B.cyl(0.04, 0.05, 1.4, 0, 0.6, 0, P.woodLight, { seg: 5, rz: -0.6 });
    B.pop();
    for (let k = 0; k < 5; k++) { const a = k * 1.3, rs = 0.5 + R() * 0.5; B.rock(rs, tx + Math.cos(a) * 3.2, ty, tz + Math.sin(a) * 2.6, P.stone, { variant: k }); B.colliders.push({ type: 'circle', x: tx + Math.cos(a) * 3.2, z: tz + Math.sin(a) * 2.6, r: rs * 0.8, tag: 'rock' }); }
    B.free();
    poi('treasure', tx, ty, tz + 1.1, Math.PI);
    ex(tx, tz, 3);
    dyn.treasurePos = new THREE.Vector3(tx, ty - 0.18, tz);
  }

  // ================================================================== signposts at junctions + scattered props
  for (const [x, z, ry] of [[-11, 50, 0.4], [20, -9, -0.6], [-51, -2, 2.3], [29, 36, 0.2], [-34, 28, -1.1]]) { signpost(B, x, groundAt(x, z), z, ry); ex(x, z, 1); }
  // driftwood logs on beaches
  for (const [x, z, ry] of [[-28, 63, 0.4], [16, 66, -0.3], [-70, 36, 1.2], [44, -32, 0.8], [112, 82, 0.3]]) {
    const y = groundAt(x, z);
    if (y < 0.1) continue;
    B.at(x, z);
    B.cyl(0.18, 0.24, 2.6, x, y + 0.12, z, 0xa89478, { seg: 7, rz: Math.PI / 2, ry });
    B.cyl(0.08, 0.1, 0.9, x + 0.5, y + 0.3, z + 0.2, 0xa89478, { seg: 5, rz: 0.9, ry: ry + 0.5 });
    B.free();
    B.colliders.push({ type: 'box', x, z, hw: 1.3, hd: 0.24, rot: ry, tag: 'log' });
    ex(x, z, 1.5);
  }

  // ================================================================== forage spots
  {
    const FR = rng(L.SEED + '-forage');
    const want = { home_beach: 5, village: 3, pine_forest: 6, meadow: 6, waterfall: 4, lighthouse: 4, palm_islet: 4, turtle_isle: 2 };
    const near = (x, z, r) => exclusions.some(e => (x - e.x) ** 2 + (z - e.z) ** 2 < (e.r + r) ** 2);
    const placed = [];
    for (const [zone, n] of Object.entries(want)) {
      const c = L.ZONE_CENTERS[zone];
      let k = 0;
      for (let t = 0; t < 600 && k < n; t++) {
        const a = FR() * Math.PI * 2, r = 4 + FR() * (zone.includes('isle') || zone.includes('islet') ? 12 : 26);
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (L.zoneAt(x, z) !== zone) continue;
        const h = H(x, z);
        if (h < 0.35 || terrain.slopeAt(x, z) > 0.55 || near(x, z, 1.2)) continue;
        if (wet(x, z) || wet(x + 1.2, z) || wet(x - 1.2, z) || wet(x, z + 1.2) || wet(x, z - 1.2) || solidAt(x, z, 0.8)) continue;  // [Fix] never in the pond/river
        if (placed.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 36)) continue;
        const id = `forage_${zone}_${k + 1}`;
        poi(id, x, h, z, FR() * 6.28, { kind: 'forage' });
        placed.push({ x, z });
        k++;
      }
    }
    // canonical aliases used by data
    if (pois.forage_meadow_1) pois.forage_meadow = { ...pois.forage_meadow_1, id: 'forage_meadow' };
    for (const z of Object.keys(want)) if (pois[`forage_${z}_1`]) pois[`forage_${z}`] = { ...pois[`forage_${z}_1`], id: `forage_${z}` };
  }

  // ================================================================== dock-edge sit spots
  // Every ~2.4 m along the open edges of each dock, 0.15 m in from the edge, facing the water below (≥ 0.45 m deep,
  // so the legs dangle over the sea), free of props and not where another deck continues (T joints).
  const sitSpots = [];
  {
    const decks = B.surfaces.filter(sf => sf.dock && sf.type === 'box');
    const onDeck = (x, z, except) => decks.some(sf => sf !== except && sf.dock === except.dock && Math.abs((x - sf.x) * Math.cos(sf.rot || 0) - (z - sf.z) * Math.sin(sf.rot || 0)) <= sf.hw && Math.abs((x - sf.x) * Math.sin(sf.rot || 0) + (z - sf.z) * Math.cos(sf.rot || 0)) <= sf.hd);
    const deep = (x, z) => { const w = env.waterSurfaceAt?.(x, z); return w != null && w - H(x, z) > 0.45; };
    const count = {};
    for (const sf of decks) {
      const co = Math.cos(sf.rot || 0), si = Math.sin(sf.rot || 0);
      const W = (lx, lz) => ({ x: sf.x + lx * co + lz * si, z: sf.z - lx * si + lz * co });
      for (const [ax, az, half, along] of [[1, 0, sf.hd, 'z'], [-1, 0, sf.hd, 'z'], [0, 1, sf.hw, 'x'], [0, -1, sf.hw, 'x']]) {
        const n = Math.floor((half * 2 - 0.6) / 2.4) + 1;
        for (let k = 0; k < n; k++) {
          const t = n === 1 ? 0 : -half + 0.3 + (half * 2 - 0.6) * k / (n - 1);
          const lx = ax ? ax * (sf.hw - 0.15) : t, lz = az ? az * (sf.hd - 0.15) : t;
          const p = W(lx, lz), out = W(lx + ax * 0.75, lz + az * 0.75), out2 = W(lx + ax * 1.4, lz + az * 1.4), back = W(lx - ax * 0.5, lz - az * 0.5);
          const ux = out.x - p.x, uz = out.z - p.z;
          if (!deep(out.x, out.z) || !deep(out2.x, out2.z) || onDeck(out.x, out.z, sf) || onDeck(out2.x, out2.z, sf)) continue;
          if (solidAt(p.x, p.z, 0.4) || solidAt(back.x, back.z, 0.35)) continue;
          if (ramps.some(r => Math.hypot(r.x1 - p.x, r.z1 - p.z) < r.hw + 1)) continue;
          if (sitSpots.some(o => Math.hypot(o.x - p.x, o.z - p.z) < 1.6)) continue;
          // the dock-end / pond seats (kind 'edge') already sit you there: no second, competing spot next to them
          if (Object.values(pois).some(o => o.kind === 'edge' && Math.hypot(o.x - p.x, o.z - p.z) < 1.6)) continue;
          count[sf.dock] = (count[sf.dock] || 0) + 1;
          const id = `edge_${sf.dock}_${count[sf.dock]}`;
          sitSpots.push(poi(id, p.x, sf.y, p.z, Math.atan2(ux, uz), { kind: 'dock_edge', seat: 'edge', dock: sf.dock }));
        }
      }
    }
  }

  // ================================================================== build
  const mats = { solid: materials.solid(), glow: materials.glow(), glass: env.extraMats.glass, tank: env.extraMats.tank, lamp: env.extraMats.lamp, crystal: env.extraMats.crystal };
  const group = B.build(mats, { name: 'Places' });
  return {
    group, pois, exclusions, colliders: B.colliders, surfaces: B.surfaces, glows: B.glows,
    homeTiers, dyn, riverRocks, aquariumTanks, shopFront, sitSpots, ramps,
  };
}
