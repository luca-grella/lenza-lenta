// Math helpers: seeded RNG, noise, easing, damping. Pure functions, no three.js dependency.

/** Hash a string (or number) to a 32-bit unsigned int. */
export function hashString(s) {
  s = String(s);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Seeded RNG (mulberry32). `const r = rng('island'); r()` → float in [0,1).
 * Helpers on the returned function: range(a,b), int(a,b) (inclusive), pick(arr), chance(p),
 * sign(), gauss(mean=0, sd=1), shuffle(arr) (in place), fork(label) → independent child rng.
 * @param {number|string} seed
 */
export function rng(seed = 1) {
  let a = typeof seed === 'number' ? (seed >>> 0) || 1 : hashString(seed);
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.gauss = (mean = 0, sd = 1) => {
    const u = 1 - r(), v = r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  r.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  r.fork = label => rng((hashString(label) ^ Math.floor(r() * 4294967296)) >>> 0);
  return r;
}

/** Deterministic hash of integer/float coordinates → [0,1). */
export function hash2(x, y, seed = 0) {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((y | 0) + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// ---- Simplex noise (2D + 3D), seeded --------------------------------------------------------
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3, G3 = 1 / 6;
const GRAD3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);

/**
 * Create an independent seeded noise set.
 * @returns {{noise2:(x:number,y:number)=>number, noise3:(x:number,y:number,z:number)=>number,
 *   value2:(x:number,y:number)=>number, fbm:(x:number,y:number,oct?:number,lac?:number,gain?:number)=>number,
 *   ridged:(x:number,y:number,oct?:number)=>number, warp:(x:number,y:number,amount?:number)=>[number,number]}}
 * All return roughly [-1, 1] (value2 too).
 */
export function createNoise(seed = 1337) {
  const r = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  r.shuffle(p);
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }

  function noise2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = pm12[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = pm12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = pm12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2 = t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  }

  function noise3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const c = (tt, g, x, y, z) => { if (tt < 0) return 0; tt *= tt; return tt * tt * (GRAD3[g] * x + GRAD3[g + 1] * y + GRAD3[g + 2] * z); };
    const n0 = c(0.6 - x0 * x0 - y0 * y0 - z0 * z0, pm12[ii + perm[jj + perm[kk]]] * 3, x0, y0, z0);
    const n1 = c(0.6 - x1 * x1 - y1 * y1 - z1 * z1, pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3, x1, y1, z1);
    const n2 = c(0.6 - x2 * x2 - y2 * y2 - z2 * z2, pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3, x2, y2, z2);
    const n3 = c(0.6 - x3 * x3 - y3 * y3 - z3 * z3, pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3, x3, y3, z3);
    return 32 * (n0 + n1 + n2 + n3);
  }

  // Smooth value noise (cheaper look, blobby) in [-1,1].
  function value2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (a, b) => perm[(perm[a & 255] + b) & 511] / 127.5 - 1;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) { sum += amp * noise2(x * freq + o * 17.1, y * freq - o * 9.3); norm += amp; amp *= gain; freq *= lac; }
    return sum / norm;
  }

  function ridged(x, y, oct = 4) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) { const n = 1 - Math.abs(noise2(x * freq + o * 31.7, y * freq + o * 5.1)); sum += amp * n * n; norm += amp; amp *= 0.5; freq *= 2; }
    return (sum / norm) * 2 - 1;
  }

  function warp(x, y, amount = 1) {
    return [x + amount * noise2(x + 5.2, y + 1.3), y + amount * noise2(x - 3.7, y + 8.1)];
  }

  return { noise2, noise3, value2, fbm, ridged, warp };
}

const defaultNoise = createNoise(1337);
export const noise2 = defaultNoise.noise2;
export const noise3 = defaultNoise.noise3;
export const value2 = defaultNoise.value2;
export const fbm = defaultNoise.fbm;
export const ridged = defaultNoise.ridged;

// ---- Scalars --------------------------------------------------------------------------------
export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x, a, b, c, d, doClamp = true) => { let t = invLerp(a, b, x); if (doClamp) t = clamp(t); return c + (d - c) * t; };
/** GLSL-style smoothstep(edge0, edge1, x). */
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential smoothing: move a toward b. lambda ≈ 1/response-time. */
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
/** Wrap angle to (-PI, PI]. */
export const wrapAngle = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
/** Shortest-path angle lerp. */
export const angleLerp = (a, b, t) => a + wrapAngle(b - a) * t;
/** Frame-rate independent angle smoothing. */
export const angleDamp = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
/** Move value toward target by at most maxDelta. */
export const approach = (a, b, maxDelta) => (Math.abs(b - a) <= maxDelta ? b : a + Math.sign(b - a) * maxDelta);
export const fract = x => x - Math.floor(x);
/** 0..1 → 0..1..0 triangle. */
export const pingpong = x => 1 - Math.abs(fract(x) * 2 - 1);

/** Damp a THREE.Vector3-like {x,y,z} in place toward target. */
export function dampVec3(v, target, lambda, dt) {
  const k = 1 - Math.exp(-lambda * dt);
  v.x += (target.x - v.x) * k; v.y += (target.y - v.y) * k; v.z += (target.z - v.z) * k;
  return v;
}

/**
 * Critically-damped-ish spring for secondary motion (hats, tails, bobbers).
 * `const s = spring(0); s.update(target, dt)` → value. stiffness ~ 40-200, damping ratio ~0.3..1.
 */
export function spring(value = 0, stiffness = 120, dampingRatio = 0.45) {
  const s = { value, velocity: 0, stiffness, dampingRatio };
  s.update = (target, dt) => {
    const k = s.stiffness, c = 2 * Math.sqrt(k) * s.dampingRatio;
    // semi-implicit Euler, sub-stepped for stability
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) { s.velocity += (k * (target - s.value) - c * s.velocity) * h; s.value += s.velocity * h; }
    return s.value;
  };
  s.reset = v => { s.value = v; s.velocity = 0; };
  return s;
}

// ---- Easing ---------------------------------------------------------------------------------
export const ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: t => Math.sin((t * Math.PI) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: t => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
  outBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

/** Everything above, bundled as ctx.math. */
export const math = {
  TAU, rng, hashString, hash2, createNoise, noise2, noise3, value2, fbm, ridged,
  clamp, lerp, invLerp, remap, smoothstep, damp, wrapAngle, angleLerp, angleDamp, approach, fract, pingpong,
  dampVec3, spring, ease,
};
export default math;
