// Small ground/shore animals with skinned rigs and procedural animation:
//   crabs   (side scuttle on the sand, claw wave, dash into the water / bury when the player comes close)
//   turtles (swim at the surface near Turtle Isle, crawl ashore, sunbathe with slow blinks)
//   frogs   (sit on lily pads, throat-sac croak, jump pad to pad with a splash)
//   rabbits (hop in meadows and woods, nibble, ear twitch, flee in bounds)
// Every controller: setActive(on, info, n), setCount(n), update(dt, t, info), list, debugSpawn(x, z, state).
import * as THREE from 'three';
import { RigBuilder, instantiate, rot, offset, creatureMaterial } from './rig.js';
import { ellipsoid, cone, sweep, aim, mat, col } from './geo.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SIDES = [['L', 1], ['R', -1]];
const R = Math.random;
const TAU = Math.PI * 2;
const wrapA = a => THREE.MathUtils.euclideanModulo(a + Math.PI, TAU) - Math.PI;
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Generic population: spawns agents around a centre, fades them in/out (scale), culls by distance.
 * @param {{spawn:(info:any)=>any, step:(a:any, dt:number, t:number, info:any)=>void, centre?:(info:any)=>{x:number,z:number}|null}} o
 */
function population(group, o) {
  const list = [];
  let target = 0, active = false;
  return {
    group, list,
    setActive(on, info, n) { active = on; target = on ? n : 0; for (const a of list) a.leaving = !on && !a.pinned; },
    setCount(n) { target = n; },
    update(dt, t, info) {
      if (active) {
        let alive = list.filter(a => !a.leaving && !a.pinned).length, guard = 0;
        while (alive < target && guard++ < 4) { const a = o.spawn(info); if (!a) break; list.push(a); alive++; }
      }
      let extra = list.filter(a => !a.leaving && !a.pinned).length - target;
      for (const a of list) if (extra > 0 && !a.leaving && !a.pinned) { a.leaving = true; extra--; }
      for (const a of list.slice()) {
        if (a.pinned) a.leaving = false; else if (near(a.pos, info.player) > (info.cull || 70)) a.leaving = true;
        a.fade += ((a.leaving || a.hidden ? 0 : 1) - a.fade) * Math.min(1, dt * 2.5);
        o.step(a, dt, t, info);
        a.o.position.copy(a.pos);
        a.o.rotation.y = a.facing;
        a.o.scale.setScalar(a.size * Math.max(0.001, a.fade));
        a.o.visible = a.fade > 0.01;
        if (a.leaving && a.fade < 0.02) { a.o.removeFromParent(); list.splice(list.indexOf(a), 1); }
      }
    },
  };
}

function agent(rig, group, pos, size, extra = {}) {
  const o = new THREE.Group(); o.add(rig.group); group.add(o);
  return { rig, o, pos: pos.clone(), size, fade: 0, leaving: false, hidden: false, facing: R() * TAU, t: R() * 10, state: 'idle', stateT: 0, ...extra };
}

/** Where to spawn: the def's spot when near, else around the player. */
function centreOf(env, def, info, maxD = 45) {
  const s = def.spot ? env.poi(def.spot) : null;
  if (s && near(s, info.player) < maxD) return s;
  return info.player;
}

const turnTo = (a, want, dt, k = 4) => { a.facing += wrapA(want - a.facing) * Math.min(1, dt * k); };

// =====================================================================================  CRAB
function buildCrab(look = {}) {
  const shell = col(look.body || '#e0603a'), belly = col('#f4c08a'), dark = col('#9c3220');
  const bones = [{ name: 'root', pos: [0, 0, 0] }, { name: 'body', parent: 'root', pos: [0, 0.07, 0] }];
  for (const [s, x] of SIDES) {
    bones.push({ name: 'eye' + s, parent: 'body', pos: [x * 0.03, 0.1, 0.07] }, { name: 'claw' + s, parent: 'body', pos: [x * 0.09, 0.07, 0.07] }, { name: 'pinch' + s, parent: 'claw' + s, pos: [x * 0.15, 0.08, 0.15] });
    for (let i = 0; i < 3; i++) bones.push({ name: `leg${i}${s}`, parent: 'body', pos: [x * 0.1, 0.065, 0.03 - i * 0.045] });
  }
  const B = new RigBuilder(bones);
  const c = new THREE.Color();
  B.add(ellipsoid(0.12, 0.05, 0.09, 18, 10), { matrix: mat(0, 0.08, 0), bone: 'body', color: (p, n) => c.copy(belly).lerp(shell, THREE.MathUtils.smoothstep(n.y, -0.3, 0.2)).lerp(dark, Math.max(0, n.y - 0.85) * 2) });
  for (const [s, x] of SIDES) {
    // eye stalks
    B.add(sweep([V(x * 0.03, 0.1, 0.07), V(x * 0.035, 0.15, 0.08)], () => 0.007, 6), { bone: 'eye' + s, color: shell });
    B.add(ellipsoid(0.016, 0.016, 0.016, 10, 8), { matrix: mat(x * 0.035, 0.158, 0.082), bone: 'eye' + s, color: '#141418' });
    B.add(ellipsoid(0.005, 0.005, 0.005, 6, 4), { matrix: mat(x * 0.038, 0.166, 0.095), bone: 'eye' + s, color: '#ffffff' });
    // arm + big claw
    B.add(sweep([V(x * 0.09, 0.07, 0.07), V(x * 0.13, 0.085, 0.12), V(x * 0.15, 0.08, 0.15)], () => 0.014, 7), { bone: 'claw' + s, color: shell });
    B.add(ellipsoid(0.04, 0.03, 0.05, 12, 8), { matrix: mat(x * 0.16, 0.085, 0.19, 0, x * 0.3, 0), bone: 'claw' + s, color: shell });
    B.add(cone(0.016, 0.06, 7), { matrix: aim(V(x * 0.16, 0.1, 0.22), V(x * 0.2, 0.15, 1), V(1, 1, 0.7)), bone: 'claw' + s, color: dark });
    B.add(cone(0.014, 0.055, 7), { matrix: aim(V(x * 0.155, 0.075, 0.22), V(x * 0.2, -0.1, 1), V(1, 1, 0.7)), bone: 'pinch' + s, color: dark });
    for (let i = 0; i < 3; i++) {
      const z0 = 0.03 - i * 0.045;
      B.add(sweep([V(x * 0.1, 0.065, z0), V(x * 0.17, 0.09, z0 - 0.01), V(x * 0.22, 0.0, z0 - 0.025)], q => 0.011 * (1 - q * 0.6), 6, { capEnd: true }), { bone: `leg${i}${s}`, color: shell });
    }
  }
  return B.build(creatureMaterial({ roughness: 0.55 }), 'Crab');
}

function poseCrab(rig, t, k) {
  const ph = t * (k.speed > 0.05 ? 18 : 0);
  for (const [s, x] of SIDES) {
    for (let i = 0; i < 3; i++) {
      const p = ph + i * 2.1 + (x > 0 ? 0 : Math.PI);
      rot(rig, `leg${i}${s}`, 0, Math.sin(p) * 0.35, x * (Math.max(0, Math.cos(p)) * 0.4 - (k.bury || 0) * 0.6));
    }
    const wave = s === 'L' ? k.wave || 0 : 0;
    rot(rig, 'claw' + s, -wave * 0.9 + Math.sin(t * 2 + x) * 0.05, 0, x * wave * 0.5);
    rot(rig, 'pinch' + s, Math.max(0, Math.sin(t * (wave ? 14 : 3) + x)) * (wave ? 0.5 : 0.15), 0, 0);
    rot(rig, 'eye' + s, Math.sin(t * 1.7 + x * 2) * 0.15, 0, 0);
  }
  offset(rig, 'body', 0, (k.speed > 0.05 ? Math.abs(Math.sin(ph)) * 0.008 : 0) - (k.bury || 0) * 0.08, 0);
  rot(rig, 'body', 0, 0, Math.sin(ph * 0.5) * 0.04 * (k.speed > 0.05 ? 1 : 0));
}

export function createCrabs(ctx, env, root, fx, def = {}) {
  const group = new THREE.Group(); group.name = 'Crabs'; root.add(group);
  let tpl = null;
  const sandy = (x, z) => !env.isWater(x, z) && env.height(x, z) < 1.2 && env.height(x, z) > env.waterLevel + 0.02;
  const pop = population(group, {
    spawn(info) {
      const c = centreOf(env, def, info);
      const s = env.findSpot(c.x, c.z, 4, 22, (x, z) => sandy(x, z) && near({ x, z }, info.player) > 4, R, 40);
      if (!s) return null;
      tpl ||= buildCrab(def.look);
      return agent(instantiate(tpl), group, V(s.x, env.ground(s.x, s.z), s.z), 1.3 + R() * 0.5, { dir: 1, speed: 0, wave: 0, bury: 0 });
    },
    step(a, dt, t, info) {
      a.t += dt; a.stateT -= dt;
      const pd = near(a.pos, info.player);
      if (pd < 2.6 && a.state !== 'flee' && a.state !== 'bury') { a.state = 'flee'; a.stateT = 2.5; a.dir = R() < 0.5 ? 1 : -1; }
      if (a.state === 'idle' && a.stateT < 0) { const r = R(); a.state = r < 0.55 ? 'scuttle' : r < 0.75 ? 'wave' : 'idle'; a.stateT = 1 + R() * 2.5; a.dir = R() < 0.5 ? 1 : -1; if (R() < 0.4) a.facing += (R() - 0.5) * 2; }
      else if (a.state !== 'idle' && a.state !== 'bury' && a.stateT < 0) { if (a.state === 'flee') { a.state = 'bury'; a.stateT = 4 + R() * 4; } else { a.state = 'idle'; a.stateT = 1 + R() * 3; } }
      let want = 0;
      if (a.state === 'scuttle') want = 0.45;
      if (a.state === 'flee') { want = 1.6; const away = Math.atan2(a.pos.x - info.player.x, a.pos.z - info.player.z); turnTo(a, away - a.dir * Math.PI / 2, dt, 6); }
      a.speed += (want - a.speed) * Math.min(1, dt * 8);
      a.wave += ((a.state === 'wave' ? 1 : 0) - a.wave) * Math.min(1, dt * 5);
      a.bury += ((a.state === 'bury' ? 1 : 0) - a.bury) * Math.min(1, dt * 3);
      if (a.state === 'bury' && a.stateT < 0) { if (pd > 4) { a.state = 'idle'; a.stateT = 2; } else a.stateT = 2; }
      if (a.speed > 0.02) {
        // sideways: local +x is the crab's right; facing 0 = +z
        const sx = Math.cos(a.facing) * a.dir, sz = -Math.sin(a.facing) * a.dir;
        const nx = a.pos.x + sx * a.speed * dt, nz = a.pos.z + sz * a.speed * dt;
        if (sandy(nx, nz) || a.state === 'flee') { a.pos.x = nx; a.pos.z = nz; }
        else { a.dir *= -1; }
        if (env.isWater(a.pos.x, a.pos.z)) { a.hidden = true; if (!a.splashed) { a.splashed = true; fx?.ripple?.(a.pos, 0.3, env.waterLevel); } a.leaving = true; }
        a.pos.y = env.ground(a.pos.x, a.pos.z);
      }
      poseCrab(a.rig, a.t, a);
    },
  });
  return {
    ...pop, poseCrab,
    debugSpawn(x, z, state = 'idle') { tpl ||= buildCrab(def.look); const a = agent(instantiate(tpl), group, V(x, env.ground(x, z), z), 1.2, { dir: 1, speed: 0, wave: 0, bury: 0, state, stateT: 999, fade: 1, facing: 0 }); a.pinned = true; pop.list.push(a); return a; },
  };
}

// =====================================================================================  TURTLE
function buildTurtle(look = {}) {
  const shell = col(look.shell || '#6f8a3a'), plate = col('#a7b45a'), skin = col(look.skin || '#8fb07a'), under = col('#e6dca0');
  const bones = [{ name: 'root', pos: [0, 0, 0] }, { name: 'body', parent: 'root', pos: [0, 0.12, 0] }, { name: 'neck', parent: 'body', pos: [0, 0.12, 0.2] }, { name: 'head', parent: 'neck', pos: [0, 0.14, 0.3] }, { name: 'tail', parent: 'body', pos: [0, 0.1, -0.22] }];
  for (const [s, x] of SIDES) bones.push({ name: 'fin' + s, parent: 'body', pos: [x * 0.16, 0.1, 0.12] }, { name: 'back' + s, parent: 'body', pos: [x * 0.13, 0.09, -0.15] });
  const B = new RigBuilder(bones);
  const c = new THREE.Color();
  // domed shell with a hex-ish plate pattern from a cheap cell function
  B.add(ellipsoid(0.24, 0.13, 0.28, 24, 14), {
    matrix: mat(0, 0.12, 0), bone: 'body',
    color: (p, n) => {
      if (n.y < 0.05) return c.copy(under);
      const u = Math.atan2(p.x, p.z) * 2.2, v = n.y * 5.2;
      const f = Math.abs(Math.sin(u + Math.floor(v) * 0.9) * Math.sin(v * Math.PI));
      return c.copy(shell).lerp(plate, THREE.MathUtils.smoothstep(f, 0.35, 0.8) * 0.75).lerp(under, n.y < 0.2 ? 0.4 : 0);
    },
  });
  B.add(ellipsoid(0.24, 0.025, 0.28, 24, 6), { matrix: mat(0, 0.105, 0), bone: 'body', color: col('#55702c') });
  B.add(sweep([V(0, 0.12, 0.2), V(0, 0.14, 0.27)], () => 0.05, 10), { bone: 'neck', color: skin });
  B.add(ellipsoid(0.065, 0.055, 0.085, 14, 10), { matrix: mat(0, 0.145, 0.32), bone: 'head', color: (p, n) => c.copy(skin).lerp(under, Math.max(0, -n.y) * 0.7) });
  for (const [, x] of SIDES) {
    B.add(ellipsoid(0.014, 0.014, 0.012, 8, 6), { matrix: mat(x * 0.045, 0.165, 0.365), bone: 'head', color: '#121214' });
    B.add(ellipsoid(0.005, 0.005, 0.004, 5, 4), { matrix: mat(x * 0.05, 0.172, 0.375), bone: 'head', color: '#ffffff' });
  }
  for (const [s, x] of SIDES) {
    B.add(ellipsoid(0.15, 0.022, 0.06, 14, 6), { matrix: mat(x * 0.27, 0.1, 0.16, 0, x * 0.45, 0), bone: 'fin' + s, color: (p, n) => c.copy(skin).lerp(plate, 0.15) });
    B.add(ellipsoid(0.07, 0.02, 0.05, 10, 6), { matrix: mat(x * 0.18, 0.09, -0.2, 0, -x * 0.5, 0), bone: 'back' + s, color: skin });
  }
  B.add(cone(0.03, 0.08, 7), { matrix: aim(V(0, 0.1, -0.22), V(0, -0.2, -1)), bone: 'tail', color: skin });
  return B.build(creatureMaterial({ roughness: 0.6 }), 'Turtle');
}

function poseTurtle(rig, t, k) {
  const swim = k.mode === 'swim', crawl = k.mode === 'crawl';
  for (const [s, x] of SIDES) {
    let fy = 0, fz = 0, by = 0;
    if (swim) { const p = Math.sin(t * 2.2); fz = x * p * 0.55; fy = x * Math.cos(t * 2.2) * 0.35; by = x * Math.sin(t * 2.2 + 1) * 0.3; }
    else if (crawl) { const p = Math.sin(t * 4 + (x > 0 ? 0 : Math.PI)); fy = x * p * 0.45; fz = x * Math.max(0, Math.cos(t * 4 + (x > 0 ? 0 : Math.PI))) * 0.25; by = -x * p * 0.3; }
    else { fz = -x * 0.15; fy = x * 0.25; } // sunbathe: flippers stretched out flat
    rot(rig, 'fin' + s, 0, fy, fz);
    rot(rig, 'back' + s, 0, by, 0);
  }
  const head = k.mode === 'sun' ? -0.25 + Math.sin(t * 0.3) * 0.08 : 0.05;
  rot(rig, 'neck', head, Math.sin(t * 0.5) * (k.mode === 'sun' ? 0.3 : 0.12), 0);
  rot(rig, 'head', k.mode === 'sun' ? 0.2 : 0, 0, 0);
  offset(rig, 'neck', 0, 0, k.mode === 'sun' ? 0.03 : 0);
  rot(rig, 'body', swim ? Math.sin(t * 2.2) * 0.04 : 0, 0, crawl ? Math.sin(t * 4) * 0.04 : 0);
  rot(rig, 'tail', 0, Math.sin(t * 2) * 0.2, 0);
  // blink: squash the head bone briefly
  const blink = (t % 4.3) < 0.13 ? 0.7 : 1;
  if (rig.bones.head) rig.bones.head.scale.set(1, blink, 1);
}

export function createTurtles(ctx, env, root, fx, def = {}) {
  const group = new THREE.Group(); group.name = 'Turtles'; root.add(group);
  let tpl = null;
  const beach = (x, z) => !env.isWater(x, z) && env.height(x, z) < 1.0 && env.height(x, z) > env.waterLevel + 0.03;
  const water = (x, z) => env.isWater(x, z) && env.depth(x, z) > 0.6;
  const pop = population(group, {
    spawn(info) {
      const c = centreOf(env, def, info);
      tpl ||= buildTurtle(def.look);
      const sunny = R() < 0.55;
      const s = env.findSpot(c.x, c.z, 2, 18, sunny ? beach : water, R, 40) || env.findSpot(c.x, c.z, 2, 22, sunny ? water : beach, R, 40);
      if (!s) return null;
      const inWater = env.isWater(s.x, s.z);
      const a = agent(instantiate(tpl), group, V(s.x, 0, s.z), 1.6 + R() * 0.6, { mode: inWater ? 'swim' : 'sun', home: c, goal: null });
      a.pos.y = inWater ? env.waterLevel - 0.12 : env.ground(s.x, s.z);
      a.stateT = 6 + R() * 10;
      return a;
    },
    step(a, dt, t, info) {
      a.t += dt; a.stateT -= dt;
      if (a.mode === 'swim') {
        if (!a.goal || near(a.pos, a.goal) < 0.6) a.goal = env.findSpot(a.home.x, a.home.z, 4, 20, water, R, 20) || { x: a.pos.x + (R() - 0.5) * 6, z: a.pos.z + (R() - 0.5) * 6 };
        turnTo(a, Math.atan2(a.goal.x - a.pos.x, a.goal.z - a.pos.z), dt, 0.8);
        const nx = a.pos.x + Math.sin(a.facing) * 0.5 * dt, nz = a.pos.z + Math.cos(a.facing) * 0.5 * dt;
        if (env.isWater(nx, nz)) { a.pos.x = nx; a.pos.z = nz; } else a.goal = null;
        a.pos.y = env.waterLevel - 0.12 + Math.sin(a.t * 0.8) * 0.03;
        if (a.stateT < 0) {
          a.stateT = 8 + R() * 10;
          const shore = env.findSpot(a.pos.x, a.pos.z, 1, 10, beach, R, 30);
          if (shore && R() < 0.5 && info.phase !== 'night') { a.mode = 'crawl'; a.goal = shore; }
          else if (R() < 0.3) { a.dive = 1; }
        }
        if (a.dive > 0) { a.dive -= dt * 0.25; a.pos.y -= Math.sin(Math.max(0, a.dive) * Math.PI) * 0.5; }
        if (R() < dt * 0.05) fx?.ripple?.(a.pos, 0.35, env.waterLevel);
      } else if (a.mode === 'crawl') {
        const g = a.goal || a.pos;
        turnTo(a, Math.atan2(g.x - a.pos.x, g.z - a.pos.z), dt, 1.5);
        a.pos.x += Math.sin(a.facing) * 0.18 * dt; a.pos.z += Math.cos(a.facing) * 0.18 * dt;
        const w = env.isWater(a.pos.x, a.pos.z);
        a.pos.y = w ? env.waterLevel - 0.12 : env.ground(a.pos.x, a.pos.z);
        if (near(a.pos, g) < 0.3 || a.stateT < 0) { a.mode = w ? 'swim' : 'sun'; a.stateT = 12 + R() * 15; a.goal = null; }
      } else { // sun
        if (a.stateT < 0 || near(a.pos, info.player) < 1.8) {
          const sea = env.findSpot(a.pos.x, a.pos.z, 1, 8, water, R, 30);
          if (sea) { a.mode = 'crawl'; a.goal = sea; a.stateT = 25; } else a.stateT = 10;
        }
      }
      poseTurtle(a.rig, a.mode === 'swim' ? a.t : a.t * (a.mode === 'crawl' ? 1 : 0.5), a);
    },
  });
  return {
    ...pop, poseTurtle,
    debugSpawn(x, z, mode = 'sun') { tpl ||= buildTurtle(def.look); const a = agent(instantiate(tpl), group, V(x, env.ground(x, z), z), 2, { mode, home: { x, z }, stateT: 9999, fade: 1, facing: 0.5 }); a.debug = true; a.pinned = true; pop.list.push(a); return a; },
  };
}

// =====================================================================================  FROG
function buildFrog(look = {}) {
  const top = col(look.body || '#5fae3c'), belly = col('#e9efb0'), spot = col('#2f6e2a');
  const bones = [{ name: 'root', pos: [0, 0, 0] }, { name: 'body', parent: 'root', pos: [0, 0.04, -0.02] }, { name: 'head', parent: 'body', pos: [0, 0.075, 0.04] }, { name: 'throat', parent: 'body', pos: [0, 0.045, 0.07] }];
  for (const [s, x] of SIDES) bones.push(
    { name: 'thigh' + s, parent: 'body', pos: [x * 0.04, 0.035, -0.05] }, { name: 'shin' + s, parent: 'thigh' + s, pos: [x * 0.07, 0.03, 0.0] },
    { name: 'arm' + s, parent: 'body', pos: [x * 0.035, 0.04, 0.05] },
  );
  const B = new RigBuilder(bones);
  const c = new THREE.Color();
  const skinCol = (p, n) => {
    c.copy(belly).lerp(top, THREE.MathUtils.smoothstep(n.y, -0.35, 0.1));
    if (n.y > 0.2 && Math.sin(p.x * 130) * Math.sin(p.z * 110 + 1) > 0.75) c.lerp(spot, 0.7);
    return c;
  };
  B.add(ellipsoid(0.055, 0.04, 0.07, 16, 10), { matrix: mat(0, 0.05, -0.01, -0.35, 0, 0), bone: 'body', color: skinCol });
  B.add(ellipsoid(0.055, 0.03, 0.045, 16, 10), { matrix: mat(0, 0.075, 0.05), bone: 'head', color: skinCol });
  B.add(ellipsoid(0.03, 0.022, 0.025, 10, 8), { matrix: mat(0, 0.055, 0.07), bone: 'throat', color: belly });
  for (const [s, x] of SIDES) {
    B.add(ellipsoid(0.02, 0.02, 0.02, 12, 10), { matrix: mat(x * 0.03, 0.1, 0.055), bone: 'head', color: top });
    B.add(ellipsoid(0.014, 0.014, 0.01, 10, 8), { matrix: mat(x * 0.034, 0.106, 0.068), bone: 'head', color: '#f2d24a' });
    B.add(ellipsoid(0.01, 0.006, 0.006, 8, 6), { matrix: mat(x * 0.035, 0.106, 0.075), bone: 'head', color: '#121214' });
    B.add(ellipsoid(0.03, 0.017, 0.042, 10, 8), { matrix: mat(x * 0.065, 0.035, -0.04, 0, x * 0.5, 0), bone: 'thigh' + s, color: top });
    B.add(sweep([V(x * 0.08, 0.025, -0.01), V(x * 0.07, 0.012, -0.07)], () => 0.01, 6), { bone: 'shin' + s, color: top });
    B.add(ellipsoid(0.022, 0.004, 0.018, 8, 4), { matrix: mat(x * 0.075, 0.006, -0.085), bone: 'shin' + s, color: top });
    B.add(sweep([V(x * 0.035, 0.04, 0.05), V(x * 0.045, 0.006, 0.075)], () => 0.008, 6), { bone: 'arm' + s, color: top });
    B.add(ellipsoid(0.012, 0.003, 0.01, 6, 4), { matrix: mat(x * 0.047, 0.004, 0.08), bone: 'arm' + s, color: top });
  }
  return B.build(creatureMaterial({ roughness: 0.4 }), 'Frog');
}

function poseFrog(rig, k) {
  const j = k.jump || 0; // 0 sit … 1 fully stretched
  for (const [s, x] of SIDES) {
    rot(rig, 'thigh' + s, j * 0.9, x * j * 0.3, 0);
    rot(rig, 'shin' + s, j * 1.1, 0, 0);
    rot(rig, 'arm' + s, -j * 0.8, 0, 0);
  }
  rot(rig, 'body', -j * 0.3, 0, 0);
  rot(rig, 'head', k.look || 0, 0, 0);
  const sac = 1 + (k.croak || 0) * 0.9;
  if (rig.bones.throat) rig.bones.throat.scale.set(sac, sac, sac);
  if (rig.bones.body) rig.bones.body.scale.set(1, 1 + (k.breathe || 0) * 0.03, 1);
}

let lilyGeo = null;
function lilyPad() {
  if (!lilyGeo) {
    lilyGeo = new THREE.CircleGeometry(0.22, 18, 0.3, TAU - 0.5); lilyGeo.rotateX(-Math.PI / 2);
    const n = lilyGeo.attributes.position.count, cols = new Float32Array(n * 3), cc = new THREE.Color();
    for (let i = 0; i < n; i++) { const x = lilyGeo.attributes.position.getX(i), z = lilyGeo.attributes.position.getZ(i); cc.set('#4f9a3a').lerp(new THREE.Color('#9cd060'), Math.hypot(x, z) / 0.22 * 0.6); cols.set([cc.r, cc.g, cc.b], i * 3); }
    lilyGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const m = new THREE.Mesh(lilyGeo, lilyPad.mat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}

export function createFrogs(ctx, env, root, fx, def = {}) {
  const group = new THREE.Group(); group.name = 'Frogs'; root.add(group);
  let tpl = null, croakT = 3;
  const pond = (x, z) => env.isWater(x, z) && [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [3, 0], [0, 3]].some(([a, b]) => !env.isWater(x + a, z + b));
  function padAt(x, z) {
    const w = env.isWater(x, z);
    return { position: V(x, (w ? env.waterLevel : env.ground(x, z)) + 0.012, z), rot: R() * TAU, id: padId++ };
  }
  let padId = 0;
  /** [Fix] one merged mesh per frog for all its lily pads (was one draw call per pad). */
  function padMesh(pads) {
    lilyPad();
    const o = pads[0].position, src = lilyGeo, n = src.attributes.position.count, idx = src.index.array;
    const pos = new Float32Array(n * 3 * pads.length), nor = new Float32Array(n * 3 * pads.length), colr = new Float32Array(n * 3 * pads.length), ind = [];
    pads.forEach((p, k) => {
      const c = Math.cos(p.rot), sn = Math.sin(p.rot);
      for (let i = 0; i < n; i++) {
        const x = src.attributes.position.getX(i), y = src.attributes.position.getY(i), z = src.attributes.position.getZ(i), j = (k * n + i) * 3;
        pos[j] = x * c + z * sn + p.position.x - o.x; pos[j + 1] = y + p.position.y - o.y; pos[j + 2] = -x * sn + z * c + p.position.z - o.z;
        nor[j] = 0; nor[j + 1] = 1; nor[j + 2] = 0;
        colr[j] = src.attributes.color.getX(i); colr[j + 1] = src.attributes.color.getY(i); colr[j + 2] = src.attributes.color.getZ(i);
      }
      for (const v of idx) ind.push(v + k * n);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    g.setIndex(ind); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, lilyPad.mat); m.receiveShadow = true; m.position.copy(o); group.add(m);
    return m;
  }
  function spot(c, info) { return env.findSpot(c.x, c.z, 1, 14, pond, R, 50); } // no pond nearby: no frogs
  const pop = population(group, {
    spawn(info) {
      const c = centreOf(env, def, info);
      const s = spot(c, info); if (!s) return null;
      tpl ||= buildFrog(def.look);
      const pads = [padAt(s.x, s.z)];
      for (let i = 0; i < 2; i++) { const s2 = env.findSpot(s.x, s.z, 0.7, 2.2, pond, R, 20); if (s2) pads.push(padAt(s2.x, s2.z)); }
      const fr = instantiate(tpl); if (fr.mesh) fr.mesh.castShadow = false;  // [Fix] tiny: skip the shadow pass
      const a = agent(fr, group, V(s.x, pads[0].position.y, s.z), 1.6 + R() * 0.5, { pads, padMesh: padMesh(pads), pad: 0, croak: 0, jump: 0, look: 0, from: null, to: null });
      a.stateT = 1 + R() * 4;
      return a;
    },
    step(a, dt, t, info) {
      a.t += dt; a.stateT -= dt;
      { const m = a.padMesh, p0 = a.pads[0]; m.scale.setScalar(Math.max(0.001, a.fade)); m.position.y = p0.position.y + Math.sin(a.t * 1.3 + p0.id) * 0.005; }
      if (a.state === 'idle') {
        a.croak = Math.max(0, a.croak - dt * 3);
        if (a.stateT < 0) {
          const r = R();
          if (r < 0.5) { a.state = 'croak'; a.stateT = 1.1; ctx.audio?.sfx?.('frog', { vol: 0.35, pos: a.pos, pitch: 0.85 + R() * 0.3 }); }
          else if (r < 0.8 && a.pads.length > 1) { a.state = 'jump'; a.stateT = 0.55; a.from = a.pos.clone(); a.pad = (a.pad + 1 + Math.floor(R() * (a.pads.length - 1))) % a.pads.length; const p = a.pads[a.pad].position; a.to = V(p.x, p.y, p.z); a.facing = Math.atan2(p.x - a.pos.x, p.z - a.pos.z); }
          else { a.stateT = 1 + R() * 3; a.facing += (R() - 0.5) * 1.2; }
        }
        if (near(a.pos, info.player) < 1.5 && a.pads.length > 1 && a.state === 'idle') a.stateT = 0;
      } else if (a.state === 'croak') {
        a.croak = Math.max(0, Math.sin((1.1 - a.stateT) / 1.1 * Math.PI * 3));
        if (a.stateT < 0) { a.state = 'idle'; a.stateT = 2 + R() * 5; }
      } else if (a.state === 'jump') {
        const k = THREE.MathUtils.clamp(1 - a.stateT / 0.55, 0, 1);
        a.pos.lerpVectors(a.from, a.to, k); a.pos.y += Math.sin(k * Math.PI) * 0.35;
        a.jump = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.8 + (k < 0.15 ? k * 2 : 0);
        if (a.stateT < 0) { a.state = 'idle'; a.stateT = 2 + R() * 4; a.jump = 0; a.pos.copy(a.to); fx?.ripple?.(a.pos, 0.25, env.waterLevel); }
      }
      a.look = Math.sin(a.t * 0.4) * 0.1;
      a.breathe = Math.sin(a.t * 5);
      poseFrog(a.rig, a);
      if (a.leaving && a.fade < 0.03 && a.padMesh.parent) { a.padMesh.removeFromParent(); a.padMesh.geometry.dispose(); }
    },
  });
  return {
    ...pop, poseFrog,
    update(dt, t, info) {
      pop.update(dt, t, info);
      croakT -= dt;
      if (croakT < 0 && pop.list.length > 1 && info.phase !== 'day') { croakT = 2 + R() * 4; const a = pop.list[Math.floor(R() * pop.list.length)]; if (a.state === 'idle') a.stateT = 0; }
    },
    debugSpawn(x, z) { tpl ||= buildFrog(def.look); const pads = [padAt(x, z), padAt(x + 0.6, z + 0.3)]; const a = agent(instantiate(tpl), group, V(x, pads[0].position.y, z), 2.2, { pads, padMesh: padMesh(pads), pad: 0, croak: 0, jump: 0, look: 0, fade: 1, facing: 0.3 }); a.stateT = 0.5; a.pinned = true; pop.list.push(a); return a; },
  };
}

// =====================================================================================  RABBIT
function buildRabbit(look = {}) {
  const fur = col(look.body || '#b08a68'), light = col('#efe2cf'), inner = col('#e8a7a0');
  const bones = [{ name: 'root', pos: [0, 0, 0] }, { name: 'body', parent: 'root', pos: [0, 0.11, -0.02] }, { name: 'head', parent: 'body', pos: [0, 0.17, 0.08] }, { name: 'tail', parent: 'body', pos: [0, 0.1, -0.12] }];
  for (const [s, x] of SIDES) bones.push({ name: 'ear' + s, parent: 'head', pos: [x * 0.025, 0.215, 0.09] }, { name: 'hind' + s, parent: 'body', pos: [x * 0.05, 0.08, -0.07] }, { name: 'front' + s, parent: 'body', pos: [x * 0.035, 0.08, 0.07] });
  const B = new RigBuilder(bones);
  const c = new THREE.Color();
  const furCol = (p, n) => c.copy(light).lerp(fur, THREE.MathUtils.smoothstep(n.y, -0.5, 0.05));
  B.add(ellipsoid(0.075, 0.075, 0.11, 18, 12), { matrix: mat(0, 0.1, -0.03, 0.25, 0, 0), bone: 'body', color: furCol });
  B.add(ellipsoid(0.055, 0.052, 0.06, 16, 12), { matrix: mat(0, 0.175, 0.1), bone: 'head', color: furCol });
  B.add(ellipsoid(0.03, 0.025, 0.025, 10, 8), { matrix: mat(0, 0.16, 0.145), bone: 'head', color: light });
  B.add(ellipsoid(0.008, 0.006, 0.006, 6, 4), { matrix: mat(0, 0.172, 0.168), bone: 'head', color: '#d27a80' });
  B.add(ellipsoid(0.03, 0.03, 0.028, 10, 8), { matrix: mat(0, 0.12, -0.135), bone: 'tail', color: '#fbf7f0' });
  for (const [s, x] of SIDES) {
    B.add(ellipsoid(0.011, 0.013, 0.008, 8, 6), { matrix: mat(x * 0.035, 0.19, 0.135), bone: 'head', color: '#141418' });
    B.add(ellipsoid(0.004, 0.004, 0.003, 5, 4), { matrix: mat(x * 0.038, 0.195, 0.142), bone: 'head', color: '#ffffff' });
    B.add(ellipsoid(0.017, 0.06, 0.009, 10, 8), { matrix: mat(x * 0.03, 0.27, 0.085, -0.15, 0, -x * 0.12), bone: 'ear' + s, color: (p, n) => c.copy(fur).lerp(inner, n.z > 0.4 ? 0.7 : 0) });
    B.add(ellipsoid(0.03, 0.04, 0.055, 10, 8), { matrix: mat(x * 0.055, 0.065, -0.06), bone: 'hind' + s, color: furCol });
    B.add(ellipsoid(0.018, 0.01, 0.045, 8, 6), { matrix: mat(x * 0.055, 0.012, -0.03), bone: 'hind' + s, color: light });
    B.add(sweep([V(x * 0.035, 0.08, 0.07), V(x * 0.035, 0.01, 0.08)], () => 0.013, 6, { capEnd: true }), { bone: 'front' + s, color: furCol });
  }
  return B.build(creatureMaterial({ roughness: 0.92 }), 'Rabbit');
}

function poseRabbit(rig, t, k) {
  const h = k.hop || 0; // 0..1 phase of a hop, -1 = still
  const air = h >= 0 ? Math.sin(h * Math.PI) : 0;
  for (const [s, x] of SIDES) {
    rot(rig, 'hind' + s, h >= 0 ? -Math.sin(h * TAU) * 0.6 : 0, 0, 0);
    rot(rig, 'front' + s, h >= 0 ? Math.sin(h * TAU + 1) * 0.7 : (k.nibble ? -0.2 : 0), 0, 0);
    const tw = Math.max(0, Math.sin(t * 3 + x * 4)) ** 12 * 0.4;
    rot(rig, 'ear' + s, (k.alert ? -0.15 : 0.25) + air * 0.5 + tw, 0, x * (k.alert ? 0 : 0.15));
  }
  rot(rig, 'body', h >= 0 ? -Math.sin(h * TAU) * 0.18 : (k.alert ? -0.35 : 0), 0, 0);
  offset(rig, 'body', 0, k.alert ? 0.03 : 0, 0);
  rot(rig, 'head', k.nibble ? 0.45 + Math.sin(t * 14) * 0.04 : (k.alert ? -0.2 : 0), (k.look || 0), 0);
  rot(rig, 'tail', Math.sin(t * 8) * 0.1, 0, 0);
}

export function createRabbits(ctx, env, root, fx, def = {}) {
  const group = new THREE.Group(); group.name = 'Rabbits'; root.add(group);
  let tpl = null;
  const grassy = (x, z) => !env.isWater(x, z) && env.walkable(x, z) && env.height(x, z) > 0.6;
  const pop = population(group, {
    spawn(info) {
      const s = env.findSpot(info.player.x, info.player.z, 8, 28, grassy, R, 40);
      if (!s) return null;
      tpl ||= buildRabbit(def.look);
      const a = agent(instantiate(tpl), group, V(s.x, env.ground(s.x, s.z), s.z), 1.4 + R() * 0.3, { hop: -1, hops: 0, look: 0, nibble: false, alert: false, speed: 0 });
      a.stateT = R() * 3;
      return a;
    },
    step(a, dt, t, info) {
      a.t += dt; a.stateT -= dt;
      const pd = near(a.pos, info.player);
      if (pd < 4 && a.state !== 'flee') { a.state = 'flee'; a.hops = 6 + Math.floor(R() * 4); a.hop = 0; a.facing = Math.atan2(a.pos.x - info.player.x, a.pos.z - info.player.z) + (R() - 0.5) * 0.8; }
      if (a.state === 'idle' && a.stateT < 0) {
        const r = R();
        if (r < 0.45) { a.state = 'hop'; a.hops = 1 + Math.floor(R() * 4); a.hop = 0; a.facing += (R() - 0.5) * 2; }
        else if (r < 0.8) { a.state = 'nibble'; a.stateT = 2 + R() * 3; }
        else { a.state = 'alert'; a.stateT = 1.2 + R() * 1.5; }
      }
      if ((a.state === 'nibble' || a.state === 'alert') && a.stateT < 0) { a.state = 'idle'; a.stateT = 0.5 + R() * 2; }
      a.nibble = a.state === 'nibble'; a.alert = a.state === 'alert';
      if (a.state === 'hop' || a.state === 'flee') {
        const fast = a.state === 'flee';
        a.hop += dt * (fast ? 3.2 : 2.2);
        const sp = fast ? 3.2 : 1.1;
        const nx = a.pos.x + Math.sin(a.facing) * sp * dt, nz = a.pos.z + Math.cos(a.facing) * sp * dt;
        if (grassy(nx, nz)) { a.pos.x = nx; a.pos.z = nz; } else a.facing += Math.PI * 0.6;
        a.pos.y = env.ground(a.pos.x, a.pos.z) + Math.sin(Math.min(1, a.hop % 1) * Math.PI) * (fast ? 0.18 : 0.1);
        if (a.hop >= 1) { a.hop -= 1; a.hops--; if (a.hops <= 0) { a.state = 'idle'; a.hop = -1; a.stateT = 1 + R() * 3; a.pos.y = env.ground(a.pos.x, a.pos.z); } }
        if (fast && pd > 18) a.leaving = true;
      }
      a.look = a.alert ? Math.sin(a.t * 1.5) * 0.5 : 0;
      poseRabbit(a.rig, a.t, { hop: a.state === 'hop' || a.state === 'flee' ? a.hop % 1 : -1, nibble: a.nibble, alert: a.alert, look: a.look });
    },
  });
  return {
    ...pop, poseRabbit,
    debugSpawn(x, z, state = 'idle') { tpl ||= buildRabbit(def.look); const a = agent(instantiate(tpl), group, V(x, env.ground(x, z), z), 1.8, { hop: -1, hops: 0, state, stateT: 0, fade: 1, facing: 0.6 }); a.pinned = true; pop.list.push(a); return a; },
  };
}
