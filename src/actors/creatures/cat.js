// Biscotto the cat: a skinned quadruped (one draw call) with hand-authored keyframe clips (idle, walk, trot,
// sit, groom, sleep curled, loaf, eat) blended by an AnimationMixer, plus procedural layers on top
// (head look-at, blinks, meow with a little mouth, purring, tail flicks). Lives near its home spot until
// befriended, then follows the player at a cozy distance and sits beside them while they fish.
import * as THREE from 'three';
import { RigBuilder, instantiate, makeClip, cycle, creatureMaterial, addRot, addEyes } from './rig.js';
import { ellipsoid, cone, aim, mat, col, sweep as sweepTube } from './geo.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ss = THREE.MathUtils.smoothstep;
const SIDES = [['L', 1], ['R', -1]];

const BONES = [
  { name: 'root', pos: [0, 0, 0] },
  { name: 'hips', parent: 'root', pos: [0, 0.26, -0.14] },
  { name: 'spine', parent: 'hips', pos: [0, 0.28, -0.01] },
  { name: 'chest', parent: 'spine', pos: [0, 0.29, 0.12] },
  { name: 'neck', parent: 'chest', pos: [0, 0.33, 0.19] },
  { name: 'head', parent: 'neck', pos: [0, 0.42, 0.24] },
  { name: 'eyes', parent: 'head', pos: [0, 0.462, 0.35] },
  { name: 'mouth', parent: 'head', pos: [0, 0.392, 0.372] },
  { name: 'earL', parent: 'head', pos: [0.072, 0.53, 0.235] },
  { name: 'earR', parent: 'head', pos: [-0.072, 0.53, 0.235] },
  { name: 'tail1', parent: 'hips', pos: [0, 0.29, -0.25] },
  { name: 'tail2', parent: 'tail1', pos: [0, 0.32, -0.37] },
  { name: 'tail3', parent: 'tail2', pos: [0, 0.38, -0.46] },
  { name: 'tail4', parent: 'tail3', pos: [0, 0.47, -0.51] },
  { name: 'tailEnd', parent: 'tail4', pos: [0, 0.56, -0.52] },
];
for (const [s, x] of SIDES) {
  BONES.push(
    { name: 'shoulder' + s, parent: 'chest', pos: [x * 0.07, 0.25, 0.13] },
    { name: 'elbow' + s, parent: 'shoulder' + s, pos: [x * 0.075, 0.14, 0.13] },
    { name: 'wrist' + s, parent: 'elbow' + s, pos: [x * 0.075, 0.045, 0.15] },
    { name: 'fpaw' + s, parent: 'wrist' + s, pos: [x * 0.075, 0.02, 0.19] },
    { name: 'thigh' + s, parent: 'hips', pos: [x * 0.075, 0.24, -0.15] },
    { name: 'knee' + s, parent: 'thigh' + s, pos: [x * 0.08, 0.14, -0.09] },
    { name: 'hock' + s, parent: 'knee' + s, pos: [x * 0.08, 0.07, -0.17] },
    { name: 'bpaw' + s, parent: 'hock' + s, pos: [x * 0.08, 0.02, -0.13] },
  );
}

function lerpKeys(keys, x) {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) { const f = (x - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]); return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * f; }
  return keys[keys.length - 1][1];
}

/** Build the cat template (shared geometry/material). */
export function buildCatTemplate(look = {}) {
  const fur = col(look.fur || '#e8a050'), stripe = col(look.stripes || '#b8642a'), belly = col(look.belly || '#fff4e0');
  const pink = col(look.nose || '#e88a8a'), eye = col(look.eyes || '#7ac05a');
  const R = new RigBuilder(BONES);
  const c = new THREE.Color();
  const furAt = (p, n, stripes = 1) => {
    c.copy(fur);
    const top = ss(n.y, -0.1, 0.55);
    const band = Math.sin(p.z * 44 + Math.sin(p.x * 25) * 0.8);
    if (band > 0.35) c.lerp(stripe, 0.8 * top * stripes);
    return c;
  };
  // torso (hips → neck), weights blend along z
  const torsoPts = [V(0, 0.262, -0.255), V(0, 0.272, -0.15), V(0, 0.288, -0.01), V(0, 0.3, 0.11), V(0, 0.34, 0.2), V(0, 0.4, 0.24)];
  const rx = [[0, 0.075], [0.12, 0.1], [0.4, 0.108], [0.66, 0.1], [0.86, 0.075], [1, 0.06]];
  const ry = [[0, 0.075], [0.12, 0.098], [0.4, 0.104], [0.66, 0.1], [0.86, 0.078], [1, 0.06]];
  const zKeys = [[-0.2, 'hips'], [-0.06, 'hips'], [0.02, 'spine'], [0.1, 'chest'], [0.18, 'chest'], [0.23, 'neck'], [0.27, 'head']];
  const zWeights = p => {
    if (p.z <= zKeys[0][0]) return [[zKeys[0][1], 1]];
    for (let i = 1; i < zKeys.length; i++) if (p.z <= zKeys[i][0]) {
      const f = (p.z - zKeys[i - 1][0]) / (zKeys[i][0] - zKeys[i - 1][0]);
      return [[zKeys[i - 1][1], 1 - f], [zKeys[i][1], f]];
    }
    return [[zKeys[zKeys.length - 1][1], 1]];
  };
  const torso = new THREE.CatmullRomCurve3(torsoPts).getPoints(30);
  R.add(sweepTube(torso, t => [lerpKeys(rx, t), lerpKeys(ry, t)], 18), {
    weights: zWeights,
    color: (p, n) => {
      furAt(p, n);
      const under = ss(-n.y, 0.15, 0.6);
      c.lerp(belly, under);
      if (p.z > 0.12) c.lerp(belly, ss(-n.y + (p.z - 0.12) * 4, -0.1, 0.5) * 0.9); // chest bib
      return c;
    },
  });
  // head
  const head = 'head';
  R.add(ellipsoid(0.132, 0.114, 0.12, 24, 18), { matrix: mat(0, 0.452, 0.268), bone: head, color: (p, n) => {
    c.copy(fur);
    if (n.y > 0.45 && n.z > -0.2 && Math.sin(p.x * 70) > 0.2 && Math.abs(p.x) < 0.07) c.lerp(stripe, 0.85); // forehead "M"
    if (n.y > 0.3 && Math.abs(n.x) > 0.55 && Math.sin(p.y * 90) > 0.4) c.lerp(stripe, 0.6);
    c.lerp(belly, ss(-n.y, 0.35, 0.8) * 0.8);
    return c;
  } });
  for (const [, x] of SIDES) {
    R.add(ellipsoid(0.07, 0.052, 0.06, 12, 10), { matrix: mat(x * 0.072, 0.41, 0.3), bone: head, color: (p, n) => c.copy(fur).lerp(belly, ss(-n.y, 0.0, 0.6)) });
    R.add(ellipsoid(0.04, 0.032, 0.036, 10, 8), { matrix: mat(x * 0.024, 0.405, 0.362), bone: head, color: belly });
    // ears (outer + pink inner)
    const ep = R.abs.get('ear' + (x > 0 ? 'L' : 'R'));
    const dir = V(x * 0.38, 1, -0.05).normalize();
    R.add(cone(0.062, 0.105, 4), { matrix: aim(ep.clone().add(V(0, -0.03, 0)), dir, V(1, 1, 0.5), Math.PI / 4), bone: 'ear' + (x > 0 ? 'L' : 'R'), color: fur });
    R.add(cone(0.042, 0.075, 4), { matrix: aim(ep.clone().add(V(-x * 0.002, -0.022, 0.018)), dir, V(1, 1, 0.35), Math.PI / 4), bone: 'ear' + (x > 0 ? 'L' : 'R'), color: pink.clone().lerp(belly, 0.35) });
    // whiskers
    for (let k = 0; k < 3; k++) {
      const a = V(x * 0.05, 0.408 - k * 0.008, 0.372);
      const b = V(x * 0.17, 0.418 - k * 0.022, 0.37 - k * 0.012);
      R.add(sweepTube([a, a.clone().lerp(b, 0.5).add(V(0, 0.006, 0)), b], t => 0.0028 * (1 - t * 0.6), 4), { bone: head, color: '#fdfaf2' });
    }
  }
  R.add(ellipsoid(0.03, 0.02, 0.03, 10, 8), { matrix: mat(0, 0.385, 0.35), bone: head, color: belly });
  R.add(ellipsoid(0.018, 0.012, 0.012, 10, 8), { matrix: mat(0, 0.43, 0.392), bone: head, color: pink });
  R.add(ellipsoid(0.022, 0.017, 0.012, 10, 8), { matrix: mat(0, 0.392, 0.37), bone: 'mouth', color: '#7a2a32' });
  addEyes(R, 'eyes', [0, 0.462, 0.352], { spread: 0.054, r: 0.039, iris: eye, pupilStretch: 1.1 });
  // legs
  for (const [s, x] of SIDES) {
    const legCol = (p, n) => { furAt(p, n, 0.6); if (Math.sin(p.y * 70) > 0.6 && n.x * x > 0.2) c.lerp(stripe, 0.5); return c; };
    R.limb(['shoulder' + s, 'elbow' + s, 'wrist' + s, 'fpaw' + s], t => 0.05 - 0.017 * t, { color: legCol, radial: 10 });
    R.add(ellipsoid(0.04, 0.027, 0.052, 12, 8), { matrix: mat(x * 0.075, 0.026, 0.178), bone: 'fpaw' + s, color: belly });
    R.add(ellipsoid(0.058, 0.088, 0.085, 14, 10), { matrix: mat(x * 0.07, 0.225, -0.15), weights: () => [['thigh' + s, 0.75], ['hips', 0.25]], color: legCol });
    R.limb(['thigh' + s, 'knee' + s, 'hock' + s, 'bpaw' + s], t => 0.048 - 0.018 * t, { color: legCol, radial: 10 });
    R.add(ellipsoid(0.04, 0.027, 0.058, 12, 8), { matrix: mat(x * 0.08, 0.026, -0.12), bone: 'bpaw' + s, color: belly });
  }
  // tail
  const tailBase = R.abs.get('tail1');
  R.limb(['tail1', 'tail2', 'tail3', 'tail4', 'tailEnd'], t => 0.036 - 0.004 * t, {
    radial: 10, color: (p, n) => { const d = p.distanceTo(tailBase); c.copy(fur); if (Math.sin(d * 34) > 0.25) c.lerp(stripe, 0.85); if (d > 0.36) c.lerp(stripe, 0.7); return c; },
  });
  const template = R.build(creatureMaterial({ roughness: 0.92 }), 'Cat');
  return template;
}


/** Authored clips. */
function buildClips(rest) {
  const clips = {};
  const gaitFront = (stance, amp) => f => {
    if (f < stance) { const s = f / stance; return [-amp + 2 * amp * s, 0, 0]; }
    const s = (f - stance) / (1 - stance), e = 0.5 - 0.5 * Math.cos(Math.PI * s);
    return [amp - 2 * amp * e, 0, 0];
  };
  const liftFront = (stance, k = 1) => f => { if (f < stance) return [0, 0, 0]; const s = (f - stance) / (1 - stance); return [0.75 * k * Math.sin(Math.PI * s), 0, 0]; };
  const wristFront = (stance, k = 1) => f => {
    if (f < stance) { const s = f / stance; return [s > 0.75 ? -(s - 0.75) * 1.4 : 0, 0, 0]; }
    const s = (f - stance) / (1 - stance); return [-1.1 * k * Math.sin(Math.PI * s), 0, 0];
  };
  const gaitBack = (stance, amp) => f => {
    if (f < stance) { const s = f / stance; return [-amp * 0.8 + 2 * amp * s, 0, 0]; }
    const s = (f - stance) / (1 - stance), e = 0.5 - 0.5 * Math.cos(Math.PI * s);
    return [amp * 1.2 - 2 * amp * e, 0, 0];
  };
  const kneeBack = (stance, k = 1) => f => { if (f < stance) return [0, 0, 0]; const s = (f - stance) / (1 - stance); return [-0.8 * k * Math.sin(Math.PI * s), 0, 0]; };
  const hockBack = (stance, k = 1) => f => { if (f < stance) return [0, 0, 0]; const s = (f - stance) / (1 - stance); return [1.0 * k * Math.sin(Math.PI * s), 0, 0]; };

  const gait = (name, dur, phases, stance, amp, lift, bob, tailUp) => {
    const r = {}, p = {};
    for (const [s] of SIDES) {
      const pf = phases['F' + s], pb = phases['B' + s];
      r['shoulder' + s] = cycle(pf, gaitFront(stance, amp), 12);
      r['elbow' + s] = cycle(pf, liftFront(stance, lift), 12);
      r['wrist' + s] = cycle(pf, wristFront(stance, lift), 12);
      r['thigh' + s] = cycle(pb, gaitBack(stance, amp), 12);
      r['knee' + s] = cycle(pb, kneeBack(stance, lift), 12);
      r['hock' + s] = cycle(pb, hockBack(stance, lift), 12);
    }
    r.hips = cycle(0, f => [0, Math.sin(f * Math.PI * 2) * 0.06, Math.sin(f * Math.PI * 2) * 0.03], 8);
    r.chest = cycle(0, f => [0, -Math.sin(f * Math.PI * 2) * 0.07, -Math.sin(f * Math.PI * 2) * 0.03], 8);
    r.neck = cycle(0, f => [0.04 + Math.sin(f * Math.PI * 4) * 0.03, Math.sin(f * Math.PI * 2) * 0.04, 0], 8);
    r.head = cycle(0, f => [-0.04 - Math.sin(f * Math.PI * 4) * 0.03, Math.sin(f * Math.PI * 2) * 0.03, 0], 8);
    r.tail1 = cycle(0, f => [tailUp, Math.sin(f * Math.PI * 2) * 0.12, 0], 8);
    r.tail2 = cycle(0.1, f => [0.05, Math.sin(f * Math.PI * 2) * 0.12, 0], 8);
    r.tail3 = cycle(0.2, f => [-0.05, Math.sin(f * Math.PI * 2) * 0.16, 0], 8);
    r.tail4 = cycle(0.3, f => [-0.2, Math.sin(f * Math.PI * 2) * 0.2, 0], 8);
    p.root = cycle(0, f => [0, bob * (0.5 + 0.5 * Math.cos(f * Math.PI * 4)), 0], 8);
    clips[name] = makeClip(name, dur, r, p, rest);
  };
  // lateral-sequence walk; diagonal trot
  gait('walk', 0.92, { FL: 0.25, FR: 0.75, BL: 0, BR: 0.5 }, 0.62, 0.38, 1, 0.008, 0.35);
  gait('trot', 0.5, { FL: 0, FR: 0.5, BL: 0.5, BR: 0 }, 0.5, 0.55, 1.15, 0.018, 0.15);

  // idle: breathing, slow tail
  clips.idle = makeClip('idle', 3.2, {
    chest: cycle(0, f => [Math.sin(f * Math.PI * 2) * 0.015, 0, 0]),
    neck: cycle(0, f => [0.05 + Math.sin(f * Math.PI * 2) * 0.02, 0, 0]),
    tail1: cycle(0, f => [0.25, Math.sin(f * Math.PI * 2) * 0.2, 0]),
    tail2: cycle(0.15, f => [0.05, Math.sin(f * Math.PI * 2) * 0.15, 0]),
    tail3: cycle(0.3, f => [-0.05, Math.sin(f * Math.PI * 2) * 0.2, 0]),
    tail4: cycle(0.45, f => [-0.25, Math.sin(f * Math.PI * 2) * 0.3, 0]),
  }, {}, rest);

  // sitting: rear down, front legs straight, back legs folded, tail wrapped round the paws
  const sitRot = {
    hips: [-0.52, 0, 0], spine: [0.04, 0, 0], chest: [0.06, 0, 0], neck: [0.22, 0, 0], head: [0.2, 0, 0],
    shoulderL: [0.42, 0, 0], shoulderR: [0.42, 0, 0], elbowL: [0, 0, 0], elbowR: [0, 0, 0], wristL: [0, 0, 0], wristR: [0, 0, 0],
    thighL: [-1.05, 0, 0.1], thighR: [-1.05, 0, -0.1], kneeL: [2.6, 0, 0], kneeR: [2.6, 0, 0], hockL: [-1.95, 0, 0], hockR: [-1.95, 0, 0],
    tail1: [-0.55, 0.75, 0], tail2: [-0.25, 0.85, 0], tail3: [-0.35, 0.75, 0], tail4: [-0.35, 0.55, 0],
  };
  const hold = (pose, extra = {}) => { const r = {}; for (const b in pose) r[b] = [[0, ...pose[b]], [1, ...pose[b]]]; return Object.assign(r, extra); };
  clips.sit = makeClip('sit', 3, hold(sitRot, {
    chest: cycle(0, f => [0.06 + Math.sin(f * Math.PI * 2) * 0.02, 0, 0]),
    tail4: cycle(0, f => [-0.35, 0.55 + Math.sin(f * Math.PI * 2) * 0.25, 0]),
  }), { root: [[0, 0, -0.095, 0], [1, 0, -0.095, 0]] }, rest);

  // grooming: sitting, right paw up, licking
  clips.groom = makeClip('groom', 1.6, hold(sitRot, {
    shoulderR: [[0, -0.5, 0.1, 0], [0.5, -0.6, 0.1, 0], [1, -0.5, 0.1, 0]],
    elbowR: [[0, -1.7, 0, 0], [0.5, -1.8, 0, 0], [1, -1.7, 0, 0]],
    wristR: [[0, -0.6, 0, 0], [1, -0.6, 0, 0]],
    neck: [[0, 0.5, -0.25, 0], [0.25, 0.62, -0.25, 0.05], [0.5, 0.5, -0.25, 0], [0.75, 0.62, -0.25, 0.05], [1, 0.5, -0.25, 0]],
    head: [[0, 0.25, -0.35, -0.2], [0.25, 0.42, -0.35, -0.25], [0.5, 0.25, -0.35, -0.2], [0.75, 0.42, -0.35, -0.25], [1, 0.25, -0.35, -0.2]],
  }), { root: [[0, 0, -0.095, 0], [1, 0, -0.095, 0]] }, rest, { eyes: [[0, 1, 0.25, 1], [1, 1, 0.25, 1]] });

  // loaf: lying with paws tucked, eyes half closed
  const loaf = {
    hips: [0, 0, 0], shoulderL: [-1.05, 0, 0], shoulderR: [-1.05, 0, 0], elbowL: [2.35, 0, 0], elbowR: [2.35, 0, 0], wristL: [-1.3, 0, 0], wristR: [-1.3, 0, 0],
    thighL: [-1.35, 0, 0.15], thighR: [-1.35, 0, -0.15], kneeL: [2.7, 0, 0], kneeR: [2.7, 0, 0], hockL: [-1.5, 0, 0], hockR: [-1.5, 0, 0],
    neck: [-0.05, 0, 0], head: [0.12, 0, 0], tail1: [-0.45, -0.7, 0], tail2: [-0.5, -0.8, 0], tail3: [-0.6, -0.7, 0], tail4: [-0.5, -0.4, 0],
  };
  clips.loaf = makeClip('loaf', 4, hold(loaf, { chest: cycle(0, f => [Math.sin(f * Math.PI * 2) * 0.02, 0, 0]) }), { root: [[0, 0, -0.15, 0], [1, 0, -0.15, 0]] }, rest, { eyes: [[0, 1, 0.45, 1], [1, 1, 0.45, 1]] });

  // sleep: curled into a ring, head on the paws, tail around, slow breathing, eyes shut
  const curl = {
    ...loaf,
    hips: [0, -0.55, 0.32], spine: [0, 0.6, 0], chest: [0.05, 0.65, 0], neck: [0.25, 0.75, 0], head: [0.45, 0.6, 0.25],
    shoulderL: [-1.3, 0.4, 0], shoulderR: [-1.3, 0.2, 0],
    tail1: [-0.6, -1.05, 0], tail2: [-0.45, -1.0, 0], tail3: [-0.55, -0.95, 0], tail4: [-0.45, -0.8, 0],
    earL: [0.3, 0, 0], earR: [0.3, 0, 0],
  };
  clips.sleep = makeClip('sleep', 4.5, hold(curl, {
    spine: cycle(0, f => [Math.sin(f * Math.PI * 2) * 0.03, 0.6, 0]),
    chest: cycle(0, f => [0.05 + Math.sin(f * Math.PI * 2) * 0.03, 0.65, 0]),
  }), { root: [[0, 0, -0.175, 0], [1, 0, -0.175, 0]] }, rest, { eyes: [[0, 1, 0.08, 1], [1, 1, 0.08, 1]] });

  // eating: head down to the ground, nibbling
  clips.eat = makeClip('eat', 0.9, {
    shoulderL: [[0, -0.25, 0, 0], [1, -0.25, 0, 0]], shoulderR: [[0, -0.25, 0, 0], [1, -0.25, 0, 0]],
    elbowL: [[0, 0.45, 0, 0], [1, 0.45, 0, 0]], elbowR: [[0, 0.45, 0, 0], [1, 0.45, 0, 0]],
    chest: [[0, 0.12, 0, 0], [1, 0.12, 0, 0]],
    neck: [[0, 0.8, 0, 0], [0.5, 0.9, 0, 0], [1, 0.8, 0, 0]],
    head: [[0, 0.55, 0, 0], [0.25, 0.7, 0, 0.08], [0.5, 0.55, 0, 0], [0.75, 0.7, 0, -0.08], [1, 0.55, 0, 0]],
    tail1: cycle(0, f => [0.4, Math.sin(f * Math.PI * 2) * 0.3, 0]),
    tail4: cycle(0.3, f => [-0.1, Math.sin(f * Math.PI * 2) * 0.4, 0]),
  }, { root: [[0, 0, -0.025, 0], [1, 0, -0.025, 0]] }, rest, { eyes: [[0, 1, 0.5, 1], [1, 1, 0.5, 1]] });
  return clips;
}

// ------------------------------------------------------------------------------------------------
/**
 * @param {any} ctx @param {any} env @param {THREE.Object3D} root @param {any} fx @param {object} def creature data record
 */
export function createCat(ctx, env, root, fx, def = {}) {
  const template = buildCatTemplate(def.look);
  const rig = instantiate(template);
  const group = new THREE.Group(); group.name = 'Cat';
  group.add(rig.group);
  group.scale.setScalar(def.scale ?? 1.25);
  root.add(group);
  const clips = buildClips(rig.rest);
  const mixer = new THREE.AnimationMixer(rig.group);
  const actions = {};
  for (const k in clips) { actions[k] = mixer.clipAction(clips[k]); actions[k].enabled = true; }
  let current = null, animName = 'idle';
  function play(name, fade = 0.45, timeScale = 1) {
    const a = actions[name]; if (!a) return;
    a.timeScale = timeScale;
    if (current === a) return;
    a.reset(); a.setEffectiveWeight(1); a.play();
    if (current) current.crossFadeTo(a, fade, false);
    current = a; animName = name;
  }

  const pos = group.position, look = V(), _t = V(), _d = V();
  let facing = 0, speed = 0, state = 'idle', stateT = 0, stateDur = 3, target = null, home = null;
  let lookW = 0, lookYaw = 0, lookPitch = 0, blinkT = 2, blink = 0, meowT = -1, nextMeow = 6, purrT = 0, zT = 0;
  let sitTarget = null, sitFace = null, eatT = 0, eatFish = null, visibleNear = true, tailFlick = 0;
  const R = Math.random;

  const saveCat = () => { const s = ctx.save?.state; if (!s) return {}; s.cat = s.cat || { friend: 0, following: false }; return s.cat; };
  const isFriend = () => !!(saveCat().befriended || ctx.save?.state?.flags?.cat_friend);
  const following = () => isFriend() && saveCat().following !== false;

  function placeAt(x, z) { pos.set(x, env.ground(x, z), z); }
  function setState(s, dur = 3) { state = s; stateT = 0; stateDur = dur; }
  function pickHome() {
    const spot = env.poi(def.spot || 'village_trattoria') || env.poi('home_campfire');
    if (spot) return { x: spot.x + 1.2, z: spot.z + 1.2 };
    const p = env.player();
    const s = env.findSpot(p.x, p.z, 3, 6, (x, z) => env.walkable(x, z) && env.height(x, z) > 0.15) || { x: p.x + 3, z: p.z + 2 };
    return s;
  }
  home = pickHome();
  placeAt(home.x, home.z);
  play('idle', 0);

  function moveToward(tx, tz, spd, dt, arrive = 0.25) {
    _d.set(tx - pos.x, 0, tz - pos.z);
    const dist = _d.length();
    if (dist < arrive) { speed += (0 - speed) * Math.min(1, dt * 6); return true; }
    const want = Math.atan2(_d.x, _d.z);
    facing = THREE.MathUtils.euclideanModulo(facing - want + Math.PI, Math.PI * 2) - Math.PI + want;
    facing += (want - facing) * Math.min(1, dt * 5);
    const s2 = Math.min(spd, dist * 2.2 + 0.2);
    speed += (s2 - speed) * Math.min(1, dt * 3.5);
    const nx = pos.x + Math.sin(facing) * speed * dt, nz = pos.z + Math.cos(facing) * speed * dt;
    if (!env.walkable(nx, nz)) { speed *= 0.3; return true; }
    _t.set(nx, 0, nz);
    const r = env.resolveMove(pos, _t, 0.2);
    pos.x = r.x; pos.z = r.z;
    return false;
  }

  function gaitFor(spd) {
    if (spd > 1.5) play('trot', 0.3, THREE.MathUtils.clamp(spd / 1.9, 0.7, 1.9));
    else if (spd > 0.08) play('walk', 0.35, THREE.MathUtils.clamp(spd / 0.75, 0.5, 1.8));
  }

  function restPose(t, night) {
    // choose a resting behaviour by how long things have been calm
    if (state === 'sit' && stateT > stateDur) {
      const r = R();
      if (r < 0.3) { setState('groom', 3 + R() * 3); return; }
      if (r < 0.55 + night * 0.25) { setState('loaf', 6 + R() * 6); return; }
      setState('sit', 4 + R() * 6);
    } else if (state === 'groom' && stateT > stateDur) setState('sit', 3 + R() * 4);
    else if (state === 'loaf' && stateT > stateDur) setState(R() < 0.5 + night * 0.4 ? 'sleep' : 'sit', 12 + R() * 20);
    else if (state === 'sleep' && stateT > stateDur && R() < 0.01) setState('sit', 4);
  }

  const cat = {
    object: group, rig, mixer,
    get anim() { return animName; },
    get position() { return pos; },
    get state() { return state; },
    /** True once the player befriended the cat. */
    get befriended() { return isFriend(); },
    /** Make the cat a friend (idempotent). Emits 'cat:befriend' the first time. */
    befriend() {
      const s = saveCat();
      const was = isFriend();
      s.befriended = true; s.following = true; s.friend = Math.max(1, s.friend || 0);
      if (ctx.save?.state) { ctx.save.state.flags = ctx.save.state.flags || {}; ctx.save.state.flags.cat_friend = true; }
      ctx.save?.commit?.();
      if (!was) { ctx.bus?.emit('cat:befriend', {}); cat.meow(); fx.hearts(_t.copy(pos).add(V(0, 0.75, 0)), 4); }
    },
    /** Follow the player (only once befriended). */
    follow(v = true) { saveCat().following = !!v; ctx.save?.commit?.(); if (!v) home = { x: pos.x, z: pos.z }; },
    /** Walk to a point and sit there (e.g. next to the player while fishing). null releases it. */
    sitNear(p, faceTo = null) { sitTarget = p ? { x: p.x, z: p.z } : null; sitFace = faceTo; if (p) setState('goSit'); },
    /** Eat a fish (catch card "give to the cat"): walks over, eats, purrs. */
    feed(speciesId = null) {
      const p = env.player();
      const f = env.playerFacing();
      sitTarget = null;
      const tx = p.x + Math.sin(f) * 0.9, tz = p.z + Math.cos(f) * 0.9;
      target = env.walkable(tx, tz) ? { x: tx, z: tz } : { x: p.x + 0.8, z: p.z };
      setState('goEat', 10);
      if (speciesId && ctx.fishModels?.create && !eatFish) {
        eatFish = ctx.fishModels.create(speciesId, { size: 16, lod: 1, shadow: true });
        if (eatFish) { eatFish.object.visible = false; root.add(eatFish.object); }
      }
      ctx.bus?.emit('cat:fed', { speciesId });
    },
    /** Pet the cat: purr + hearts. */
    pet() { purrT = 3.5; if (state === 'sleep') setState('loaf', 6); fx.hearts(_t.copy(pos).add(V(0, 0.7, 0)), 3); ctx.audio?.sfx?.('cat_meow', { vol: 0.25, pitch: 1.25, pos }); ctx.haptic?.(8); },
    /** A little meow (with sound). */
    meow() { meowT = 0; ctx.audio?.sfx?.('cat_meow', { vol: 0.55, pitch: 0.95 + R() * 0.2, pos }); },
    /** Move the cat instantly (debug / after the player teleports far). */
    teleport(x, z) { placeAt(x, z); target = null; },
    /** Debug: force a clip/state for screenshots. */
    debugState(s, dur = 999) { setState(s, dur); },
    play,
    update(dt, t, info) {
      const p = info.player;
      const dx = p.x - pos.x, dz = p.z - pos.z, dist = Math.hypot(dx, dz);
      const night = info.night || 0;
      visibleNear = dist < (info.cull || 70);
      group.visible = visibleNear;
      stateT += dt;
      const pState = info.playerState;
      const still = env.playerStill();
      const friend = isFriend(), follow = following();

      // ---- decide ----
      if (state === 'goEat') {
        if (moveToward(target.x, target.z, 1.6, dt, 0.2) || stateT > 8) { setState('eat', 4.5); eatT = 0; }
      } else if (state === 'eat') {
        speed = 0; eatT += dt;
        if (eatFish) { eatFish.object.visible = true; eatFish.object.position.set(pos.x + Math.sin(facing) * 0.42, pos.y + 0.03, pos.z + Math.cos(facing) * 0.42); eatFish.object.rotation.set(0, facing + Math.PI / 2, Math.PI / 2); eatFish.object.scale.setScalar(Math.max(0.01, 0.16 * (1 - eatT / 4.5))); }
        if (Math.floor(eatT * 2) !== Math.floor((eatT - dt) * 2) && eatT < 4) fx.sparkle(_t.set(pos.x + Math.sin(facing) * 0.45, pos.y + 0.12, pos.z + Math.cos(facing) * 0.45), 0xffffff);
        if (stateT > stateDur) { if (eatFish) { eatFish.dispose(); eatFish = null; } purrT = 3; fx.hearts(_t.copy(pos).add(V(0, 0.7, 0)), 3); setState('sit', 5); }
      } else if (sitTarget && state === 'goSit') {
        if (moveToward(sitTarget.x, sitTarget.z, dist > 6 ? 3.2 : 1.4, dt, 0.18)) setState('sit', 9999);
      } else if (follow) {
        // keep a cozy distance; sit beside a fishing player
        const fishing = pState === 'fishing';
        if (dist > 32) { const f = env.playerFacing(); const s = env.findSpot(p.x - Math.sin(f) * 5, p.z - Math.cos(f) * 5, 0, 2.5, (x, z) => env.walkable(x, z)); if (s) placeAt(s.x, s.z); }
        if (fishing) {
          const f = env.playerFacing();
          const sx = p.x + Math.cos(f) * 0.95 - Math.sin(f) * 0.25, sz = p.z - Math.sin(f) * 0.95 - Math.cos(f) * 0.25;
          const ok = env.walkable(sx, sz);
          const tx = ok ? sx : p.x - Math.sin(f) * 1.1, tz = ok ? sz : p.z - Math.cos(f) * 1.1;
          if (Math.hypot(tx - pos.x, tz - pos.z) > 0.3 && !['sit', 'groom', 'loaf'].includes(state) || Math.hypot(tx - pos.x, tz - pos.z) > 1.2) {
            if (state !== 'move') setState('move');
            if (moveToward(tx, tz, dist > 5 ? 3.3 : 1.2, dt, 0.2)) { setState('sit', 6 + R() * 6); sitFace = f; }
          } else restPose(t, night);
        } else if (dist > 3.8 || (state === 'move' && dist > 2.2)) {
          if (['sleep', 'loaf'].includes(state) && stateT < 0.6) { /* waking up */ }
          else {
            if (state !== 'move') setState('move');
            const k = Math.min(1, 2.0 / Math.max(dist, 0.01));
            const tx = p.x - dx * k, tz = p.z - dz * k;
            moveToward(tx, tz, dist > 7 ? 3.5 : dist > 5 ? 2.3 : 1.2, dt, 0.3);
          }
        } else {
          if (state === 'move') setState('idle', 1.5 + R() * 2);
          if (state === 'idle' && (stateT > stateDur || still > 4)) setState('sit', 6 + R() * 6);
          restPose(t, night);
          speed += (0 - speed) * Math.min(1, dt * 6);
        }
      } else {
        // at home: wander, rest, look at the player and come say hello
        if (state === 'move') {
          if (moveToward(target.x, target.z, 0.8, dt, 0.25) || stateT > 12) setState(R() < 0.5 ? 'sit' : 'idle', 3 + R() * 5);
        } else {
          speed += (0 - speed) * Math.min(1, dt * 6);
          if (dist < 6 && dist > 2.0 && state !== 'sleep' && R() < dt * 0.06) {
            const k = 1.4 / dist; target = { x: p.x - dx * k, z: p.z - dz * k }; setState('move', 10);
          } else if (state === 'idle' && stateT > stateDur) {
            const s = env.findSpot(home.x, home.z, 0.5, 5, (x, z) => env.walkable(x, z));
            if (s && R() < 0.7) { target = s; setState('move', 12); } else setState('sit', 4 + R() * 6);
          } else restPose(t, night);
        }
      }

      // ---- animate ----
      const moving = speed > 0.08 && (state === 'move' || state === 'goSit' || state === 'goEat');
      if (moving) gaitFor(speed);
      else if (state === 'sit' || state === 'goSit') play('sit', 0.6);
      else if (state === 'groom') play('groom', 0.6);
      else if (state === 'loaf') play('loaf', 0.8);
      else if (state === 'sleep') play('sleep', 1.2);
      else if (state === 'eat') play('eat', 0.4);
      else play('idle', 0.5);
      if (state === 'sit' && sitFace != null && !moving) facing += (THREE.MathUtils.euclideanModulo(sitFace - facing + Math.PI, Math.PI * 2) - Math.PI) * Math.min(1, dt * 2);
      if (!moving && state !== 'sit') sitFace = null;
      group.rotation.y = facing;
      pos.y += (env.ground(pos.x, pos.z) - pos.y) * Math.min(1, dt * 12);
      if (!visibleNear) return;
      mixer.update(dt);

      // ---- procedural layers ----
      const asleep = state === 'sleep';
      // look at the player's face when near and awake
      const wantLook = !asleep && state !== 'eat' && dist < 7 ? 1 : 0;
      lookW += (wantLook - lookW) * Math.min(1, dt * 3);
      const yawTo = THREE.MathUtils.euclideanModulo(Math.atan2(dx, dz) - facing + Math.PI, Math.PI * 2) - Math.PI;
      lookYaw += (THREE.MathUtils.clamp(yawTo, -1.1, 1.1) - lookYaw) * Math.min(1, dt * 4);
      lookPitch += (-Math.atan2(1.2, Math.max(0.5, dist)) * 0.6 - lookPitch) * Math.min(1, dt * 3);
      if (lookW > 0.01) { addRot(rig, 'neck', lookPitch * 0.4 * lookW, lookYaw * 0.4 * lookW, 0); addRot(rig, 'head', lookPitch * 0.6 * lookW, lookYaw * 0.55 * lookW, -lookYaw * 0.15 * lookW); }
      // meow: head up, mouth open, ears back
      nextMeow -= dt;
      if (!asleep && dist < 5 && nextMeow < 0 && state !== 'eat') { nextMeow = 9 + R() * 14; if (R() < 0.6) cat.meow(); }
      let mouth = 0.05;
      if (meowT >= 0) {
        meowT += dt;
        const k = Math.sin(Math.min(1, meowT / 0.8) * Math.PI);
        addRot(rig, 'head', -0.35 * k, 0, 0); addRot(rig, 'earL', -0.3 * k, 0, 0.3 * k); addRot(rig, 'earR', -0.3 * k, 0, -0.3 * k);
        mouth = 0.05 + 0.95 * k;
        if (meowT > 0.8) meowT = -1;
      }
      rig.bones.mouth.scale.setScalar(mouth);
      // blink (eyes bone scale y is also driven by sleep/loaf clips)
      blinkT -= dt;
      if (blinkT < 0) { blink = 0.14; blinkT = 2.5 + R() * 4; }
      if (blink > 0) { blink -= dt; rig.bones.eyes.scale.y *= 0.12; }
      // purring: half-closed eyes, gentle hearts
      if (purrT > 0) { purrT -= dt; rig.bones.eyes.scale.y *= 0.35; if (Math.floor(purrT * 1.2) !== Math.floor((purrT + dt) * 1.2)) fx.hearts(_t.copy(pos).add(V(0, 0.65, 0)), 1); }
      // ear twitch + occasional tail flick
      if (R() < dt * 0.15) tailFlick = 0.6;
      if (tailFlick > 0) { tailFlick -= dt; const k = Math.sin(tailFlick / 0.6 * Math.PI); addRot(rig, 'tail4', 0, 0.6 * k, 0); addRot(rig, R() < 0.5 ? 'earL' : 'earR', 0, 0, 0.25 * k); }
      if (asleep) { zT -= dt; if (zT < 0) { zT = 1.6; fx.zzz(_t.copy(pos).add(V(0.15, 0.45, 0))); } }
    },
    dispose() { mixer.stopAllAction(); group.removeFromParent(); },
  };
  return cat;
}
