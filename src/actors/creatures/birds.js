// Seagulls: skinned birds that circle and glide over the coast, flap now and then, land on posts/docks/
// the shoreline, walk a few steps, preen, call, and take off when the player comes close.
import * as THREE from 'three';
import { RigBuilder, instantiate, rot, creatureMaterial, offset } from './rig.js';
import { ellipsoid, cone, strip, aim, mat, col, sweep } from './geo.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SIDES = [['L', 1], ['R', -1]];

function gullBones() {
  const b = [
    { name: 'root', pos: [0, 0, 0] },
    { name: 'body', parent: 'root', pos: [0, 0.3, 0] },
    { name: 'neck', parent: 'body', pos: [0, 0.37, 0.11] },
    { name: 'head', parent: 'neck', pos: [0, 0.45, 0.15] },
    { name: 'tail', parent: 'body', pos: [0, 0.32, -0.15] },
  ];
  for (const [s, x] of SIDES) b.push(
    { name: 'wing1' + s, parent: 'body', pos: [x * 0.08, 0.36, 0.03] },
    { name: 'wing2' + s, parent: 'wing1' + s, pos: [x * 0.32, 0.37, 0.02] },
    { name: 'leg' + s, parent: 'body', pos: [x * 0.045, 0.25, 0.0] },
    { name: 'foot' + s, parent: 'leg' + s, pos: [x * 0.045, 0.03, 0.01] },
  );
  return b;
}

export function buildGullTemplate(look = {}) {
  const white = col(look.body || '#f6f6f2'), grey = col(look.wing || '#b8c0c8'), tip = col(look.tip || '#3a3a3a'), beak = col(look.beak || '#f2c63a');
  const R = new RigBuilder(gullBones());
  const c = new THREE.Color();
  R.add(ellipsoid(0.11, 0.1, 0.2, 18, 12), { matrix: mat(0, 0.31, 0), weights: p => (p.z > 0.1 ? [['body', 0.6], ['neck', 0.4]] : p.z < -0.12 ? [['body', 0.7], ['tail', 0.3]] : [['body', 1]]), color: (p, n) => c.copy(white).lerp(grey, THREE.MathUtils.smoothstep(n.y, 0.55, 0.9) * 0.6) });
  R.add(ellipsoid(0.07, 0.068, 0.075, 16, 12), { matrix: mat(0, 0.46, 0.18), bone: 'head', color: white });
  R.add(cone(0.024, 0.1, 8), { matrix: aim(V(0, 0.455, 0.24), V(0, -0.15, 1), V(1, 1, 0.75)), bone: 'head', color: beak });
  R.add(ellipsoid(0.008, 0.008, 0.008, 6, 5), { matrix: mat(0, 0.445, 0.31), bone: 'head', color: '#e04a2a' });
  for (const [, x] of SIDES) {
    R.add(ellipsoid(0.014, 0.016, 0.01, 8, 6), { matrix: mat(x * 0.05, 0.478, 0.215), bone: 'head', color: '#141418' });
    R.add(ellipsoid(0.005, 0.005, 0.004, 5, 4), { matrix: mat(x * 0.058, 0.483, 0.222), bone: 'head', color: '#ffffff' });
  }
  // tail fan
  R.add(strip(s => V((s - 0.5) * 0.12, 0.33, -0.13), s => V((s - 0.5) * 0.17, 0.315, -0.27 + Math.abs(s - 0.5) * 0.02), 6, 2, { thick: 0.01 }), { bone: 'tail', color: (p) => c.copy(white).lerp(grey, 0.3) });
  // wings: leading edge along the span, chord tapering; grey with black tips and a white trailing rim
  for (const [s, x] of SIDES) {
    const span = s2 => 0.06 + s2 * 0.56;
    const root = q => V(x * span(q), 0.372 - q * 0.01, 0.06 - q * q * 0.06);
    const tipF = q => V(x * span(q) - x * q * q * 0.02, 0.365 - q * 0.012, 0.06 - q * q * 0.06 - (0.17 * (1 - q) + 0.06));
    const g = strip(root, tipF, 14, 3, { thick: 0.014 });
    R.add(g, {
      weights: p => { const ax = Math.abs(p.x); const w2 = THREE.MathUtils.smoothstep(ax, 0.26, 0.36); return [['wing1' + s, 1 - w2], ['wing2' + s, w2]]; },
      color: (p) => { const ax = Math.abs(p.x); c.copy(grey); if (ax > 0.47) c.lerp(tip, THREE.MathUtils.smoothstep(ax, 0.47, 0.52)); return c; },
    });
    // legs + webbed feet
    R.add(sweep([V(x * 0.045, 0.25, 0), V(x * 0.045, 0.14, 0.005), V(x * 0.045, 0.03, 0.01)], () => 0.011, 6, { capEnd: true }), { weights: p => (p.y > 0.2 ? [['leg' + s, 0.6], ['body', 0.4]] : [['leg' + s, 1]]), color: '#e8a050' });
    R.add(strip(q => V(x * 0.045 + (q - 0.5) * 0.02, 0.022, 0.01), q => V(x * 0.045 + (q - 0.5) * 0.07, 0.016, 0.07), 3, 1, { thick: 0.008 }), { bone: 'foot' + s, color: '#e8964a' });
  }
  return R.build(creatureMaterial({ roughness: 0.75 }), 'Gull');
}

/** Pose a gull rig. mode: 'flap' | 'glide' | 'perch' | 'walk' | 'land'. */
function poseGull(rig, mode, t, k = {}) {
  const ph = t * (k.flapRate || 7.5);
  for (const [s, x] of SIDES) {
    let w1z = 0, w2z = 0, w1y = 0, w2y = 0, w1x = 0;
    if (mode === 'flap' || mode === 'land') { const a = Math.sin(ph); w1z = 0.15 + 0.85 * a; w2z = 0.35 * Math.sin(ph - 0.9); w1x = -0.12 * Math.cos(ph); }
    else if (mode === 'glide') { w1z = 0.16 + Math.sin(t * 1.3 + x) * 0.04; w2z = -0.1; }
    else { w1y = 1.5; w2y = 1.25; w1z = -0.25; w2z = 0.2; w1x = 0.1; } // folded along the body
    rot(rig, 'wing1' + s, w1x, x * w1y, x * w1z);
    rot(rig, 'wing2' + s, 0, x * w2y, x * w2z);
    const flying = mode === 'flap' || mode === 'glide';
    const step = mode === 'walk' ? Math.sin(t * 9 + (x > 0 ? 0 : Math.PI)) * 0.45 : 0;
    rot(rig, 'leg' + s, flying ? 1.25 : step, 0, 0);
    rot(rig, 'foot' + s, flying ? 0.6 : 0, 0, 0);
  }
  const bob = mode === 'walk' ? Math.abs(Math.sin(t * 9)) * 0.012 : 0;
  offset(rig, 'body', 0, bob, 0);
  rot(rig, 'body', (k.pitch || 0) + (mode === 'land' ? -0.5 : 0), 0, (k.bank || 0));
  rot(rig, 'neck', mode === 'perch' ? -0.1 + Math.sin(t * 0.7) * 0.05 : 0.15, (k.look || 0) * 0.5, 0);
  rot(rig, 'head', k.call ? -0.6 : 0, (k.look || 0) * 0.6, 0);
  rot(rig, 'tail', mode === 'walk' ? Math.sin(t * 9) * 0.06 : 0, 0, 0);
}

export function createGulls(ctx, env, root, fx, def = {}) {
  const group = new THREE.Group(); group.name = 'Seagulls'; root.add(group);
  let template = null;
  const birds = [];
  let target = 0, active = false, callT = 6;
  const R = Math.random;
  const _d = V();

  function perchSpot(px, pz) {
    for (const id of ['dock_home', 'dock_village', 'bench_village', 'bench_lighthouse']) {
      const p = env.poi(id);
      if (p && Math.hypot(p.x - px, p.z - pz) < 30 && R() < 0.3) return { x: p.x + (R() - 0.5) * 1.5, z: p.z + (R() - 0.5) * 1.5, y: env.ground(p.x, p.z) };
    }
    const nearWater = (x, z) => [[1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8]].some(([a, b]) => env.isWater(x + a, z + b));
    const s = env.findSpot(px, pz, 5, 22, (x, z) => !env.isWater(x, z) && env.height(x, z) < 1.4 && env.height(x, z) > 0.02 && nearWater(x, z), R, 40);
    return s ? { ...s, y: env.ground(s.x, s.z) } : null;
  }

  function spawnBird(info, perched) {
    if (!template) template = buildGullTemplate(def.look);
    const rig = instantiate(template);
    const o = new THREE.Group(); o.add(rig.group); o.scale.setScalar(1.15); group.add(o);
    const p = info.player;
    const a = R() * Math.PI * 2;
    const b = {
      rig, o, state: 'circle', t: R() * 10, stateT: 0, pos: V(p.x + Math.cos(a) * 14, 6 + R() * 3, p.z + Math.sin(a) * 14), vel: V(), facing: 0, bank: 0,
      center: V(p.x + (R() - 0.5) * 10, 0, p.z + (R() - 0.5) * 10), radius: 5 + R() * 6, height: 5 + R() * 4, dir: R() < 0.5 ? 1 : -1, ang: a,
      flapT: 0, perch: null, look: 0, lookT: 0, call: 0, scale: 0, leaving: false, walkTo: null,
    };
    if (perched) {
      const s = perchSpot(p.x, p.z);
      if (s) { b.perch = s; b.state = 'perched'; b.pos.set(s.x, s.y, s.z); b.stateT = -R() * 10; b.facing = R() * 6.28; }
    }
    birds.push(b);
    return b;
  }

  function stepBird(b, dt, t, info) {
    b.t += dt; b.stateT += dt;
    b.scale += ((b.leaving ? 0 : 1) - b.scale) * Math.min(1, dt * 1.5);
    const p = info.player;
    let mode = 'glide', pitch = 0;
    if (b.state === 'circle') {
      b.ang += b.dir * dt * (2.2 / b.radius);
      const goal = _d.set(b.center.x + Math.cos(b.ang) * b.radius, b.height + Math.sin(b.t * 0.4) * 0.6, b.center.z + Math.sin(b.ang) * b.radius);
      b.vel.lerp(goal.sub(b.pos).multiplyScalar(1.2), Math.min(1, dt * 1.5));
      b.flapT -= dt;
      if (b.flapT < -3 - R() * 2) b.flapT = 1.2 + R();
      mode = b.flapT > 0 ? 'flap' : 'glide';
      // drift the circle centre with the player so gulls stay around
      b.center.lerp(_d.set(p.x, 0, p.z), dt * 0.03);
      if (b.stateT > 12 && R() < dt * 0.08 && !b.leaving) { const s = perchSpot(p.x, p.z); if (s) { b.perch = s; b.state = 'toPerch'; b.stateT = 0; } }
    } else if (b.state === 'toPerch') {
      const goal = _d.set(b.perch.x, b.perch.y + 0.02, b.perch.z);
      const d = goal.distanceTo(b.pos);
      const sp = Math.min(5, d * 0.9 + 0.6);
      b.vel.lerp(goal.sub(b.pos).normalize().multiplyScalar(sp), Math.min(1, dt * 2));
      mode = d < 2.5 ? 'land' : (Math.sin(b.t * 0.7) > 0 ? 'flap' : 'glide');
      if (d < 0.12 || b.stateT > 15) { b.state = 'perched'; b.stateT = 0; b.pos.set(b.perch.x, b.perch.y, b.perch.z); b.vel.set(0, 0, 0); }
    } else if (b.state === 'perched') {
      mode = 'perch';
      b.vel.set(0, 0, 0);
      b.lookT -= dt; if (b.lookT < 0) { b.lookT = 1 + R() * 3; b.look = (R() - 0.5) * 1.6; }
      if (!b.walkTo && R() < dt * 0.08) { const a = R() * 6.28; b.walkTo = V(b.pos.x + Math.cos(a) * 0.6, 0, b.pos.z + Math.sin(a) * 0.6); if (env.isWater(b.walkTo.x, b.walkTo.z)) b.walkTo = null; }
      if (b.walkTo) {
        mode = 'walk';
        const dx = b.walkTo.x - b.pos.x, dz = b.walkTo.z - b.pos.z, d = Math.hypot(dx, dz);
        b.facing = Math.atan2(dx, dz);
        if (d < 0.05) b.walkTo = null; else { b.pos.x += dx / d * 0.35 * dt; b.pos.z += dz / d * 0.35 * dt; b.pos.y = env.ground(b.pos.x, b.pos.z); }
      }
      const pd = Math.hypot(p.x - b.pos.x, p.z - b.pos.z);
      if (pd < 3.2 || b.stateT > 25 + R() * 20 || b.leaving) { b.state = 'takeoff'; b.stateT = 0; b.walkTo = null; if (pd < 4 && R() < 0.6) { b.call = 0.6; ctx.audio?.sfx?.('gull', { vol: 0.35, pos: b.pos }); } }
    } else if (b.state === 'takeoff') {
      mode = 'flap';
      const away = _d.set(b.pos.x - p.x, 0, b.pos.z - p.z).normalize();
      b.vel.lerp(V(away.x * 3, 3.2, away.z * 3), Math.min(1, dt * 3));
      if (b.stateT > 1.6) { b.state = 'circle'; b.stateT = 0; b.center.set(p.x + (R() - 0.5) * 8, 0, p.z + (R() - 0.5) * 8); b.ang = Math.atan2(b.pos.z - b.center.z, b.pos.x - b.center.x); }
    }
    if (b.state !== 'perched') {
      b.pos.addScaledVector(b.vel, dt);
      const hs = Math.hypot(b.vel.x, b.vel.z);
      if (hs > 0.2) {
        const want = Math.atan2(b.vel.x, b.vel.z);
        const da = THREE.MathUtils.euclideanModulo(want - b.facing + Math.PI, Math.PI * 2) - Math.PI;
        b.facing += da * Math.min(1, dt * 3);
        b.bank += (THREE.MathUtils.clamp(-da * 2.2, -0.7, 0.7) - b.bank) * Math.min(1, dt * 3);
      }
      pitch = THREE.MathUtils.clamp(-b.vel.y * 0.12, -0.4, 0.4);
      const g = env.ground(b.pos.x, b.pos.z);
      if (b.state === 'circle' && b.pos.y < g + 3) b.pos.y += (g + 3 - b.pos.y) * dt;
    } else b.bank *= 0.9;
    if (b.call > 0) b.call -= dt;
    poseGull(b.rig, mode, b.t, { pitch, bank: b.bank, look: b.look, call: b.call > 0 });
    b.o.position.copy(b.pos);
    b.o.rotation.y = b.facing;
    b.o.scale.setScalar(1.15 * Math.max(0.001, b.scale));
    b.o.visible = b.scale > 0.01;
  }

  return {
    group, get list() { return birds; },
    setActive(on, info, n) { active = on; target = on ? n : 0; if (!on) for (const b of birds) b.leaving = true; else for (const b of birds) b.leaving = false; },
    setCount(n) { target = n; },
    update(dt, t, info) {
      if (active) { let alive = birds.filter(b => !b.leaving).length; while (alive < target) { spawnBird(info, alive < target / 2); alive++; } }
      let extra = birds.filter(b => !b.leaving && !b.pinned).length - target;
      for (const b of birds) if (extra > 0 && !b.leaving && !b.pinned) { b.leaving = true; extra--; }
      for (const b of birds.slice()) {
        if (b.pinned) b.leaving = false; else if (Math.hypot(b.pos.x - info.player.x, b.pos.z - info.player.z) > 60) b.leaving = true;
        if (b.leaving && b.state === 'perched') { b.state = 'takeoff'; b.stateT = 0; }
        stepBird(b, dt, t, info);
        if (b.leaving && b.scale < 0.02) { b.o.removeFromParent(); birds.splice(birds.indexOf(b), 1); }
      }
      callT -= dt;
      if (callT < 0 && birds.length) { callT = 10 + R() * 18; const b = birds[Math.floor(R() * birds.length)]; b.call = 0.6; ctx.audio?.sfx?.('gull', { vol: 0.25, pos: b.pos, pitch: 0.9 + R() * 0.2 }); }
    },
    /** Debug/sandbox: put one gull on a perch at x,z (or flying) and return it. */
    debugSpawn(x, z, state = 'perched', info = { player: V(x, 0, z + 6) }) { const b = spawnBird(info, false); b.state = state; b.pos.set(x, state === 'perched' ? env.ground(x, z) : 3, z); b.perch = { x, y: env.ground(x, z), z }; b.scale = 1; b.stateT = -999; b.pinned = true; return b; },
    poseGull,
  };
}
