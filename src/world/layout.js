// Hand-designed map of the "Arcipelago di Porto Lento": signed-distance island shapes + noise, river, pond,
// paths, zone regions and the placement of every landmark/POI. Pure JS (no three.js) so it can also run in node.
// Coordinates: x = east, z = south (the camera looks north, toward -z). 1 unit = 1 m. Sea level = 0.
import { createNoise, clamp, smoothstep, lerp } from '../core/math.js';

export const SIZE = 320;
export const HALF = SIZE / 2;
export const SEED = 'porto-lento';

const N = createNoise(20251101);
const N2 = createNoise(77);

// ---------------------------------------------------------------- SDF helpers (negative = inside)
const sdEllipse = (x, z, cx, cz, rx, rz) => (Math.hypot((x - cx) / rx, (z - cz) / rz) - 1) * Math.min(rx, rz);
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);

/** Dense polyline with a bucket grid for fast distance queries. */
export class Poly {
  constructor(points, { step = 1, closed = false, extra = [] } = {}) {
    // Catmull-Rom resample of control points [x, z, ...extra values]
    const P = points;
    const out = [];
    const n = P.length;
    const get = i => P[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const k = Math.max(1, Math.ceil(segLen / step));
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        const row = [];
        for (let c = 0; c < p1.length; c++) {
          row.push(0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
        }
        out.push(row);
      }
    }
    out.push([...P[n - 1]]);
    this.pts = out;
    this.len = [0];
    for (let i = 1; i < out.length; i++) this.len.push(this.len[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    this.total = this.len[this.len.length - 1];
    // bucket grid
    this.cell = 8;
    this.buckets = new Map();
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      const x0 = Math.floor(Math.min(a[0], b[0]) / this.cell), x1 = Math.floor(Math.max(a[0], b[0]) / this.cell);
      const z0 = Math.floor(Math.min(a[1], b[1]) / this.cell), z1 = Math.floor(Math.max(a[1], b[1]) / this.cell);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const key = cx * 1000 + cz;
        if (!this.buckets.has(key)) this.buckets.set(key, []);
        this.buckets.get(key).push(i);
      }
    }
  }
  /** Distance to the polyline within maxR (else Infinity). Writes result into `o` {d, i, f, s (arc length), side}. */
  query(x, z, maxR = 12, o = {}) {
    o.d = Infinity; o.i = -1; o.f = 0; o.s = 0; o.side = 0;
    const r = Math.ceil(maxR / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = maxR * maxR;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const list = this.buckets.get((cx + i) * 1000 + cz + j);
      if (!list) continue;
      for (const s of list) {
        if (seen.has(s)) continue; seen.add(s);
        const a = this.pts[s], b = this.pts[s + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const L2 = dx * dx + dz * dz || 1e-9;
        const f = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
        const px = a[0] + dx * f - x, pz = a[1] + dz * f - z;
        const d2 = px * px + pz * pz;
        if (d2 < best) { best = d2; o.i = s; o.f = f; o.side = Math.sign(dx * (z - a[1]) - dz * (x - a[0])); }
      }
    }
    if (o.i >= 0) { o.d = Math.sqrt(best); o.s = this.len[o.i] + (this.len[o.i + 1] - this.len[o.i]) * o.f; }
    return o;
  }
  /** Interpolated column c (0 = x, 1 = z, 2.. extra) at arc length s. */
  at(s, c) {
    const L = this.len;
    s = clamp(s, 0, this.total);
    let lo = 0, hi = L.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= s) lo = m; else hi = m; }
    const f = (s - L[lo]) / ((L[hi] - L[lo]) || 1);
    return this.pts[lo][c] + (this.pts[hi][c] - this.pts[lo][c]) * f;
  }
  /** Unit tangent at arc length s → [dx, dz]. */
  dir(s) {
    const a = Math.max(0, s - 1), b = Math.min(this.total, s + 1);
    const dx = this.at(b, 0) - this.at(a, 0), dz = this.at(b, 1) - this.at(a, 1);
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }
}

// ---------------------------------------------------------------- the islands
export const ISLANDS = {
  main: { blobs: [
    [-12, -8, 66, 60],   // core
    [-8, 42, 46, 34],    // south lobe: Home Beach
    [-58, -32, 34, 30],  // north-west: sea cave
    [50, -48, 26, 24],   // north-east promontory: lighthouse
    [34, -4, 40, 34],    // east: meadow
    [36, 36, 40, 28],    // south-east: village
    [72, 44, 13, 24],    // east arm of the harbour
    [-70, 18, 24, 22],   // west: river mouth
  ] },
  palm: { cx: 108, cz: 70, rx: 19, rz: 14 },
  turtle: { cx: 102, cz: -104, rx: 11, rz: 9 },
};
export const BAY = { x: 60, z: 53, r: 13 };     // village harbor bay (carved out of the south-east lobe)

// ---------------------------------------------------------------- water features
export const POND = { x: -16, z: -44, r: 8.5, level: 2.6, depth: 1.8 };
export const CAVE = { x: -86, z: -40, r: 6.5, entrance: { x: -75, z: -38 } };
export const WATERFALL = { x: -16, zTop: -57, zBottom: -51, top: 13.2, width: 5.2 };

// River control points: x, z, surface level, half width.
export const RIVER = new Poly([
  [-17, -36.5, 2.6, 1.7],
  [-21, -28, 2.5, 1.8],
  [-28, -19, 2.15, 1.9],
  [-35, -9, 1.62, 2.0],
  [-43, 2, 1.38, 2.2],
  [-53, 11, 1.08, 2.3],
  [-63, 17.5, 0.72, 2.6],
  [-75, 23, 0.36, 2.9],
  [-88, 29, 0.0, 3.4],
  [-102, 33, -0.25, 4.2],
], { step: 1 });

// Small creek on the plateau feeding the waterfall.
export const CREEK = new Poly([
  [-8, -84, 13.9, 1.0],
  [-12, -74, 13.7, 1.1],
  [-17, -66, 13.5, 1.2],
  [-16, -58.5, 13.3, 1.3],
], { step: 1 });

// ---------------------------------------------------------------- dirt paths
export const PATHS = [
  // home → village
  [[-7, 57], [5, 59], [17, 53], [26, 43], [31, 33]],
  // home → bridge → (west bank) → sea cave
  [[-9, 53], [-19, 41], [-31, 25], [-39, 11], [-44, 3], [-49, -5], [-58, -15], [-66, -25], [-74, -36]],
  // west bank → waterfall pond
  [[-49, -5], [-43, -17], [-35, -29], [-27, -39], [-25.5, -42]],
  // village → meadow → lighthouse
  [[31, 33], [29, 17], [24, 2], [22, -12], [29, -27], [40, -41], [50, -52], [54, -58]],
  // meadow → home
  [[22, -12], [12, 8], [2, 28], [-5, 50]],
  // meadow → pond (east shore)
  [[22, -12], [9, -24], [-2, -34], [-7.5, -41]],
  // west coast path with stepping stones
  [[-19, 41], [-36, 31], [-50, 24], [-58, 21], [-63, 17.5], [-68, 11], [-73, 0], [-74, -14], [-74, -30]],
].map(p => new Poly(p, { step: 1 }));

// ---------------------------------------------------------------- landmarks
export const HOME = { x: -15, z: 52, rot: 0.08 };            // cabin footprint centre, faces south (+z)
export const CAMPFIRE = { x: -4.5, z: 59.5 };
export const SPAWN = { x: 1.2, z: 62.6, facing: 0.75 };  // [Fix] next to the home dock, facing it (was by the campfire)
export const HOME_DOCK = { x: 4.5, z0: 64, z1: 84, w: 2.4, y: 1.15 };   // runs south into the sea
export const LIGHTHOUSE = { x: 58, z: -62, base: 0 };      // base filled from terrain
export const WINDMILL = { x: 24, z: -22 };
export const BRIDGE = { x: -44, z: 3 };
export const STONES = { x: -63, z: 17.5 };
export const TREASURE = { x: 101, z: -103.5 };

export const VILLAGE = {
  square: { x: 34, z: 30 },
  dock: { x: 58.5, z0: 39, z1: 62, w: 2.6, y: 1.25 },
  // shops: building centre, facing (radians; 0 = door toward +z / the camera), stilts = front deck over the water
  shops: {
    bottega:   { x: 46.5, z: 47, rot: Math.PI / 2 - 0.08, stilts: true },
    pescheria: { x: 48.5, z: 58.5, rot: Math.PI / 2 - 0.35, stilts: true },
    falegname: { x: 67, z: 33, rot: -0.5, stilts: false },
    trattoria: { x: 27, z: 38, rot: 0.12, stilts: false },
    aquarium:  { x: 34, z: 15, rot: 0, stilts: false },
  },
  houses: [
    { id: 'gino', x: 46, z: 27, rot: -0.3, style: 0 },
    { id: 'rosa', x: 16, z: 46, rot: 0.35, style: 1 },
    { id: 'tonio', x: 57, z: 22, rot: -0.2, style: 2 },
    { id: 'pina', x: 13, z: 30, rot: 0.4, style: 3 },
    { id: 'marta', x: 20, z: 18, rot: 0.2, style: 1 },
  ],
};

/** Flat dirt plazas (village square, campfire). */
export const PLAZAS = [
  { x: 34, z: 30, r: 7.5 },
  { x: -4.5, z: 59.5, r: 3.4 },
];

export const PALM_ISLET = { x: 108, z: 70, dock: { x: 92, z: 75 } };
export const TURTLE_ISLE = { x: 102, z: -104 };

// ---------------------------------------------------------------- height field
const _q = {};

/** Signed distance to the coast of every island (negative = inside land), before noise. */
function islandSDF(x, z) {
  const B = ISLANDS.main.blobs;
  let d = sdEllipse(x, z, B[0][0], B[0][1], B[0][2], B[0][3]);
  for (let i = 1; i < B.length; i++) d = smin(d, sdEllipse(x, z, B[i][0], B[i][1], B[i][2], B[i][3]), 14);
  d = smax(d, -sdEllipse(x, z, BAY.x, BAY.z, BAY.r, BAY.r * 1.05), 6);
  d = smax(d, -sdEllipse(x, z, BAY.x + 1, BAY.z + 16, 10, 12), 5);   // bay mouth (south)
  const P = ISLANDS.palm, T = ISLANDS.turtle;
  d = Math.min(d, sdEllipse(x, z, P.cx, P.cz, P.rx, P.rz));
  d = Math.min(d, sdEllipse(x, z, T.cx, T.cz, T.rx, T.rz));
  return d;
}

/** 0..1: how "cliffy" the coast is here (lighthouse promontory, north coast, sea cave). */
export function cliffiness(x, z) {
  let c = 0;
  c = Math.max(c, 1 - smoothstep(18, 36, Math.hypot(x - 54, z + 56)));               // lighthouse promontory
  c = Math.max(c, 0.9 * (1 - smoothstep(16, 34, Math.hypot(x + 70, z + 44))));      // sea cave cliffs
  c = Math.max(c, 0.8 * smoothstep(-52, -66, z) * (1 - smoothstep(20, 40, x)));     // north coast
  return clamp(c, 0, 1);
}

/** Coast SDF with noise (negative = land). */
export function coastSDF(x, z) {
  let d = islandSDF(x, z);
  // calmer coastline where docks/buildings sit
  const calm = Math.max(1 - smoothstep(10, 26, Math.hypot(x - HOME_DOCK.x, z - 72)), 1 - smoothstep(16, 34, Math.hypot(x - 50, z - 42)));
  const amp = 1 - 0.75 * calm;
  d += (N.fbm(x * 0.022, z * 0.022, 3) * 7 + N.noise2(x * 0.085, z * 0.085) * 1.4) * amp;
  return d;
}

function plateau(x, z) {
  // north highlands above the waterfall
  const d = sdEllipse(x, z, -14, -80, 54, 28);
  return smoothstep(1.5, -2.5, d);
}

/** Raw (analytic) terrain height. Use the baked grid (terrain.heightAt) at runtime: same values, faster. */
export function computeHeight(x, z) {
  const d = coastSDF(x, z);
  const inside = -d;
  const c = cliffiness(x, z);
  let h;
  // inland relief
  const n1 = N.fbm(x * 0.017, z * 0.017, 4) * 0.5 + 0.5;
  const n2 = N2.fbm(x * 0.05, z * 0.05, 3);
  let inland = 0.9 + 2.0 * n1 + 0.5 * n2;
  // meadow: rolling, a little higher
  const mead = 1 - smoothstep(14, 40, Math.hypot(x - 26, z + 8));
  inland += mead * (1.2 + 1.4 * N2.noise2(x * 0.045, z * 0.045));
  // windmill hill
  inland += 4.2 * Math.exp(-((x - WINDMILL.x) ** 2 + (z - WINDMILL.z) ** 2) / (13 * 13));
  // lighthouse promontory
  const lh = 1 - smoothstep(10, 30, Math.hypot(x - 52, z + 52));
  inland += lh * 5.5;
  // north plateau (waterfall cliff)
  const pl = plateau(x, z);
  inland += pl * 10.0;
  // flat village + home clearing
  const vil = 1 - smoothstep(18, 32, Math.hypot(x - 34, z - 30));
  inland = lerp(inland, 1.55 + 0.25 * n2, vil * 0.85);
  const home = 1 - smoothstep(8, 18, Math.hypot(x - HOME.x - 4, z - HOME.z - 3));
  inland = lerp(inland, 0.55, home * 0.9);

  // islets: low sandy dunes only
  const islet = Math.max(1 - smoothstep(26, 40, Math.hypot(x - ISLANDS.palm.cx, z - ISLANDS.palm.cz)), 1 - smoothstep(18, 30, Math.hypot(x - ISLANDS.turtle.cx, z - ISLANDS.turtle.cz)));
  inland = lerp(inland, 0.35 + 0.5 * n1, islet);

  if (inside <= 0) {
    const o = -inside;
    const shelf = lerp(0.12, 0.55, c);
    h = o < 14 ? -o * shelf : -14 * shelf - (o - 14) * lerp(0.32, 0.6, c);
    h = Math.max(h, -14);
    // gentle sandbar texture in the shallows
    h += N2.noise2(x * 0.09, z * 0.09) * 0.25 * (1 - smoothstep(4, 14, o));
  } else {
    const wide = 1 - smoothstep(18, 42, Math.hypot(x + 6, z - 62));
    const beach = 1.25 * smoothstep(0, lerp(10, 20, wide), inside);
    const land = beach + inland * smoothstep(lerp(5, 17, wide), lerp(24, 38, wide), inside);
    const cliffH = 4.5 + inland * 0.85;
    const cliff = cliffH * smoothstep(0.2, 3.6, inside) + inland * 0.2 * smoothstep(4, 20, inside);
    h = lerp(land, Math.max(land, cliff), c);
  }

  // river valley: raise banks so the water is contained, then carve the bed
  RIVER.query(x, z, 14, _q);
  if (_q.d < 14) {
    const s = RIVER.at(_q.s, 2), w = RIVER.at(_q.s, 3);
    const valley = s + 0.35 + Math.max(0, _q.d - w - 0.8) * 0.42;
    const nearPond = smoothstep(POND.r - 1, POND.r + 5, Math.hypot(x - POND.x, z - POND.z));
    const bankRaise = (1 - smoothstep(w + 2, w + 6, _q.d)) * nearPond;
    if (_q.s < RIVER.total - 6) h = Math.max(h, lerp(h, s + 0.45, bankRaise));
    const bed = s - lerp(0.9, 0.55, smoothstep(0, 1, _q.d / w)) * (1 - smoothstep(w * 0.7, w + 0.6, _q.d));
    const carve = _q.d < w + 0.6 ? Math.min(bed, valley) : valley;
    h = Math.min(h, carve);
  }
  // plateau creek
  CREEK.query(x, z, 6, _q);
  if (_q.d < 6) {
    const s = CREEK.at(_q.s, 2), w = CREEK.at(_q.s, 3);
    const bed = s - 0.5 * (1 - smoothstep(w * 0.5, w + 0.4, _q.d));
    h = Math.min(h, Math.max(bed, s + 0.3 + (_q.d - w - 0.4) * 0.5));
  }
  // pond basin (banks above the pond level, bowl below)
  const dp = Math.hypot(x - POND.x, z - POND.z);
  if (dp < POND.r + 10) {
    const rim = POND.level + 0.55 + Math.max(0, dp - POND.r - 1.5) * 0.25;
    const bank = 1 - smoothstep(POND.r + 2, POND.r + 9, dp);
    h = lerp(h, Math.max(Math.min(h, rim + 1.6), rim), bank * (1 - pl * smoothstep(-48, -53, z)));
    if (dp < POND.r + 1.6) {
      const k = clamp(dp / POND.r, 0, 1);
      const bed = POND.level - POND.depth * (1 - k * k) - 0.15;
      const edge = smoothstep(POND.r - 0.5, POND.r + 1.6, dp);
      h = Math.min(h, lerp(bed, POND.level + 0.5, edge));
    }
  }

  // sea cave pool: a basin open to the sea through a channel toward the west
  const dc = Math.hypot(x - CAVE.x, z - CAVE.z);
  if (dc < CAVE.r + 12) {
    const pool = -1.8 + 2.4 * smoothstep(CAVE.r - 2.5, CAVE.r + 1.2, dc);
    // channel west
    const chan = Math.abs(z - CAVE.z + (x - CAVE.x) * 0.08);
    const chanH = x < CAVE.x ? -1.4 + smoothstep(1.8, 4, chan) * 4 : 99;
    const floor = 0.55 + (dc - CAVE.r - 1.2) * 0.5;
    h = Math.min(h, Math.max(pool, Math.min(floor, 99)), chanH);
    if (dc < CAVE.r + 7) h = Math.min(h, Math.max(pool, 0.6 + Math.max(0, dc - CAVE.r - 2) * 0.35));
  }
  return h;
}

// ---------------------------------------------------------------- zones & habitats
export const ZONE_CENTERS = {
  home_beach: { x: -6, z: 58 },
  village: { x: 38, z: 32 },
  pine_forest: { x: -42, z: -2 },
  waterfall: { x: -16, z: -46 },
  meadow: { x: 20, z: -12 },
  lighthouse: { x: 52, z: -54 },
  sea_cave: { x: CAVE.x + 2, z: CAVE.z },
  palm_islet: { x: PALM_ISLET.x, z: PALM_ISLET.z },
  turtle_isle: { x: TURTLE_ISLE.x, z: TURTLE_ISLE.z },
};

/** Zone id at x,z (always returns one; open sea goes to the nearest region). */
export function zoneAt(x, z) {
  const d = (k) => Math.hypot(x - ZONE_CENTERS[k].x, z - ZONE_CENTERS[k].z);
  if (d('turtle_isle') < 34) return 'turtle_isle';
  if (d('palm_islet') < 42) return 'palm_islet';
  if (d('sea_cave') < 13) return 'sea_cave';
  if (Math.hypot((x - 40) / 30, (z - 34) / 28) < 1 || Math.hypot(x - BAY.x, z - BAY.z) < BAY.r + 14) return 'village';
  if (d('lighthouse') < 30 || (x > 30 && z < -38)) return 'lighthouse';
  if (d('waterfall') < 20 || plateau(x, z) > 0.5) return 'waterfall';
  if (d('home_beach') < 26 && z > 36) return 'home_beach';
  // forest vs meadow: west of a soft line
  const line = x + 0.25 * z + 4 * N.noise2(x * 0.03, z * 0.03);
  if (Math.hypot(x, z) < 110 || coastSDF(x, z) < 6) {
    if (line < -10) return 'pine_forest';
    if (z > 30 && x < 10) return 'home_beach';
    return 'meadow';
  }
  // open sea: nearest centre
  let best = 'home_beach', bd = Infinity;
  for (const k in ZONE_CENTERS) { const dd = d(k); if (dd < bd) { bd = dd; best = k; } }
  return best;
}

/** Forest density 0..1 (used by foliage & colours). */
export function forestness(x, z) {
  const base = smoothstep(-2, -22, x + 0.25 * z + 4 * N.noise2(x * 0.03, z * 0.03));
  const pl = plateau(x, z) * 0.85;
  const clear = (1 - smoothstep(4, 11, Math.hypot(x - BRIDGE.x, z - BRIDGE.z))) * 0.6  // [Fix] denser pines around the bridge
    + (1 - smoothstep(10, 22, Math.hypot(x - POND.x, z - POND.z)))
    + (1 - smoothstep(12, 22, Math.hypot(x - CAVE.x, z - CAVE.z)));
  const patches = smoothstep(0.1, 0.5, N2.fbm(x * 0.03 + 40, z * 0.03, 3));
  return clamp(Math.max(base, pl) * (0.72 + 0.28 * patches) - clear, 0, 1);
}

export const noise = N;
export const noiseB = N2;
