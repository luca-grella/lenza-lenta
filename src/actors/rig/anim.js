// Animation authoring kit: write poses as readable tables of Euler angles (degrees) per bone, sequence
// them as keys with easing, add oscillators for loops, and bake to THREE.AnimationClip.
//
// FRAME CONVENTIONS (every bone has an identity bind rotation, axes = model axes, character faces +z,
// its LEFT side is +x). Euler order XYZ, degrees:
//   spine/chest/neck/head/hips  x+ bend forward (nod)   x- bend back     y+ turn to its left   y- right   z+ tilt to its right
//   thigh                       x- swing forward        x+ swing back    z: L+ / R- = outwards
//   shin                        x+ bend the knee        foot: x- toes up, x+ toes down
//   upperarm (hangs down-out)   x- swing forward/up     x+ backwards     z: L+ / R- = raise sideways, L- / R+ = towards body
//                               y: L- / R+ swing a raised arm forward (horizontal plane)
//   lowerarm                    x- bend the elbow (forearm comes forward/up)
//   hand_R (holds the rod)      x- rod tip up           y twists the rod sideways
// Special channels (not bones):
//   pos [x,y,z]  root offset in metres (y- = crouch/sit)       mouth 0..1 (open)    eyes 0..1 (1 open)
//   brow -1..1 (raise)   rod 0..1 (rod visible scale)   prop 0..1 (held prop scale)   crank (reel turns)
import * as THREE from 'three';
import { LOWER } from './skeleton.js';

export const ALIAS = {
  hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head',
  shL: 'shoulder_L', shR: 'shoulder_R', uaL: 'upperarm_L', uaR: 'upperarm_R', faL: 'lowerarm_L', faR: 'lowerarm_R',
  hL: 'hand_L', hR: 'hand_R', thL: 'thigh_L', thR: 'thigh_R', knL: 'shin_L', knR: 'shin_R', ftL: 'foot_L', ftR: 'foot_R',
};
const SCALARS = new Set(['mouth', 'eyes', 'brow', 'rod', 'prop', 'crank']);
const D = Math.PI / 180;

/** Easing curves (u: 0..1 → 0..1). 'smooth' = Catmull-Rom spline through the keys (continuous velocity). */
export const EASE = {
  linear: u => u,
  in: u => u * u * u,
  out: u => 1 - (1 - u) ** 3,
  inOut: u => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  sine: u => -(Math.cos(Math.PI * u) - 1) / 2,
  back: u => { const s = 1.9; return 1 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2; },      // overshoot then settle
  snap: u => 1 - (1 - u) ** 5,                                                                 // very fast start (whips)
  hold: u => (u < 1 ? 0 : 1),
};

/** Merge pose tables left → right (later wins). */
export const pose = (...ps) => Object.assign({}, ...ps);

/** Mirror a pose left ↔ right (swap _L/_R bones, negate y/z rotations and x position). */
export function mirror(p) {
  const o = {};
  for (const [k, v] of Object.entries(p)) {
    let key = k;
    if (/L$/.test(k) && ALIAS[k]) key = k.slice(0, -1) + 'R'; else if (/R$/.test(k) && ALIAS[k]) key = k.slice(0, -1) + 'L';
    if (k === 'pos') o[key] = [-v[0], v[1], v[2]];
    else if (Array.isArray(v)) o[key] = [v[0], -v[1], -v[2]];
    else o[key] = v;
  }
  return o;
}

/** Add degrees to a pose: offset(pose, {chest:[5,0,0]}) */
export function offset(p, add) {
  const o = { ...p };
  for (const [k, v] of Object.entries(add)) {
    const b = o[k];
    if (Array.isArray(v)) o[k] = (b || [0, 0, 0]).map((x, i) => x + (v[i] || 0));
    else o[k] = (b || 0) + v;
  }
  return o;
}

/**
 * Define a clip.
 * @param {string} name
 * @param {{duration:number, loop?:boolean, base?:object, keys:Array<[number, object, string?]|{t:number, pose:object, ease?:string}>,
 *   osc?:object, events?:Array<{t:number, name:string}>, meta?:object, hold?:boolean, next?:string, fps?:number}} def
 *   keys: [time, poseOverrides, ease] — each key is the PREVIOUS key's pose plus the overrides (the first key starts from base).
 *   osc:  { boneAlias: { x:[amp°, cyclesPerClip, phase01], ... }, pos: { y:[amp m, cycles, phase] } } added on top (loops).
 *   meta: per-clip hints read by the procedural layers: {footIK, look, armIK:'crank'|'butt'|null, breathe, lean, sit}.
 */
export function defineClip(name, def) {
  const keys = def.keys.map(k => (Array.isArray(k) ? { t: k[0], pose: k[1], ease: k[2] } : k));
  let cur = { ...(def.base || {}) };
  const full = keys.map(k => { cur = k.reset ? { ...(def.base || {}), ...k.pose } : { ...cur, ...k.pose }; return { t: k.t, pose: cur, ease: k.ease || def.ease || 'smooth' }; });
  if (def.loop && full[full.length - 1].t < def.duration - 1e-6) full.push({ t: def.duration, pose: full[0].pose, ease: full[0].ease });
  return { name, duration: def.duration, loop: !!def.loop, keys: full, osc: def.osc || {}, events: def.events || [], meta: def.meta || {}, hold: !!def.hold, next: def.next || null, fps: def.fps || 30 };
}

/** Evaluate channel `ch` (alias) component `j` at time t (seconds). */
function sample(def, ch, j, t) {
  const K = def.keys, n = K.length;
  const val = i => { const v = K[i].pose[ch]; return v === undefined ? (SCALARS.has(ch) ? defaultScalar(ch) : 0) : Array.isArray(v) ? (v[j] || 0) : v; };
  let i = 0; while (i < n - 2 && K[i + 1].t <= t) i++;
  if (n === 1) return val(0);
  const t0 = K[i].t, t1 = K[i + 1].t;
  let u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
  const ease = K[i + 1].ease;
  const p1 = val(i), p2 = val(i + 1);
  if (ease !== 'smooth') return p1 + (p2 - p1) * (EASE[ease] || EASE.inOut)(u);
  // Catmull-Rom (non-uniform) via Hermite; loops wrap, one-shots get zero end tangents.
  const prev = i > 0 ? i - 1 : (def.loop ? n - 2 : -1), next = i + 2 < n ? i + 2 : (def.loop ? 1 : -1);
  const tPrev = i > 0 ? K[i - 1].t : (def.loop ? K[n - 2].t - def.duration : t0);
  const tNext = i + 2 < n ? K[i + 2].t : (def.loop ? def.duration + K[1].t : t1);
  const m1 = prev >= 0 ? (p2 - val(prev)) / Math.max(1e-4, t1 - tPrev) : 0;
  const m2 = next >= 0 ? (val(next) - p1) / Math.max(1e-4, tNext - t0) : 0;
  const h = t1 - t0, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * h * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * h * m2;
}
const defaultScalar = ch => (ch === 'eyes' || ch === 'rod' || ch === 'prop' ? 1 : 0);

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _qp = new THREE.Quaternion();

/**
 * Bake a clip definition into AnimationClips: {full, upper, lower} (+ the def).
 */
export function bakeClip(def) {
  const channels = new Set();
  for (const k of def.keys) for (const c of Object.keys(k.pose)) channels.add(c);
  for (const c of Object.keys(def.osc)) channels.add(c);
  const dt = 1 / def.fps;
  const times = [];
  for (let t = 0; t < def.duration - 1e-6; t += dt) times.push(t);
  for (const k of def.keys) times.push(k.t);
  times.push(def.duration);
  const T = [...new Set(times.map(t => +t.toFixed(5)))].filter(t => t >= 0 && t <= def.duration + 1e-6).sort((a, b) => a - b);
  const tracks = { upper: [], lower: [] };
  const oscAt = (ch, axis, t) => { const o = def.osc[ch]?.[axis]; if (!o) return 0; const [amp, cyc = 1, ph = 0] = o; return amp * Math.sin(2 * Math.PI * (cyc * t / def.duration + ph)); };
  const push = (bone, track) => (LOWER.has(bone) ? tracks.lower : tracks.upper).push(track);
  const constant = (vals, stride) => { for (let i = stride; i < vals.length; i++) if (Math.abs(vals[i] - vals[i % stride]) > 1e-5) return false; return true; };
  const finish = (name, vals, stride, Track, bone) => {
    let tt = T, vv = vals;
    if (constant(vals, stride)) { tt = [0, def.duration]; vv = [...vals.slice(0, stride), ...vals.slice(0, stride)]; }
    push(bone, new Track(name, tt, vv));
  };
  for (const ch of channels) {
    if (ch === 'pos') {
      const v = [];
      for (const t of T) v.push(sample(def, ch, 0, t) + oscAt(ch, 'x', t), sample(def, ch, 1, t) + oscAt(ch, 'y', t), sample(def, ch, 2, t) + oscAt(ch, 'z', t));
      finish('root.position', v, 3, THREE.VectorKeyframeTrack, 'root');
      continue;
    }
    if (SCALARS.has(ch)) {
      const s = T.map(t => sample(def, ch, 0, t) + oscAt(ch, 'x', t));
      if (ch === 'mouth') finish('jaw.scale', s.flatMap(o => [1 + 0.25 * o, 1 + 3.2 * o, 1 + 0.3 * o]), 3, THREE.VectorKeyframeTrack, 'jaw');
      else if (ch === 'eyes') { const v = s.flatMap(o => [1, Math.max(0.08, o), 1]); finish('eye_L.scale', v, 3, THREE.VectorKeyframeTrack, 'eye_L'); finish('eye_R.scale', v.slice(), 3, THREE.VectorKeyframeTrack, 'eye_R'); }
      else if (ch === 'brow') { const v = []; for (const o of s) { _q.setFromAxisAngle(_ax, -o * 5 * D); v.push(_q.x, _q.y, _q.z, _q.w); } finish('brows.quaternion', v, 4, THREE.QuaternionKeyframeTrack, 'brows'); }
      else if (ch === 'rod') finish('rod_0.scale', s.flatMap(o => { const k = Math.max(1e-3, o); return [k, k, k]; }), 3, THREE.VectorKeyframeTrack, 'rod_0');
      else if (ch === 'prop') { const v = s.flatMap(o => { const k = Math.max(1e-3, o); return [k, k, k]; }); finish('prop_R.scale', v, 3, THREE.VectorKeyframeTrack, 'prop_R'); finish('prop_L.scale', v.slice(), 3, THREE.VectorKeyframeTrack, 'prop_L'); }
      else if (ch === 'crank') { const v = []; let prev = null; for (const o of s) { _q.setFromAxisAngle(_ax, -o * Math.PI * 2); if (prev && prev.dot(_q) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w); v.push(_q.x, _q.y, _q.z, _q.w); prev = (prev || new THREE.Quaternion()).copy(_q); } finish('reel.quaternion', v, 4, THREE.QuaternionKeyframeTrack, 'reel'); }
      continue;
    }
    const bone = ALIAS[ch] || ch;
    const v = []; let first = true;
    for (const t of T) {
      _e.set((sample(def, ch, 0, t) + oscAt(ch, 'x', t)) * D, (sample(def, ch, 1, t) + oscAt(ch, 'y', t)) * D, (sample(def, ch, 2, t) + oscAt(ch, 'z', t)) * D, 'XYZ');
      _q.setFromEuler(_e);
      if (!first && _qp.dot(_q) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      _qp.copy(_q); first = false;
      v.push(_q.x, _q.y, _q.z, _q.w);
    }
    finish(`${bone}.quaternion`, v, 4, THREE.QuaternionKeyframeTrack, bone);
  }
  const full = new THREE.AnimationClip(def.name, def.duration, [...tracks.upper, ...tracks.lower]);
  const upper = new THREE.AnimationClip(def.name + '#upper', def.duration, tracks.upper);
  const lower = new THREE.AnimationClip(def.name + '#lower', def.duration, tracks.lower);
  return { def, full, upper, lower };
}
const _ax = new THREE.Vector3(1, 0, 0);

/** Bake a whole library {name: def}. Clips only use rotations, the root offset and scales, so they are
 * shared by every character regardless of build. */
export function bakeLibrary(defs) {
  const out = {};
  for (const d of Object.values(defs)) out[d.name] = bakeClip(d);
  return out;
}
