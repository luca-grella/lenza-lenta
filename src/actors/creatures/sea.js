// Sea creatures:
//   dolphins  (rare: a small pod far out at sea doing a few leaping arcs with splashes, then gone)
//   jellyfish (sea cave pool: translucent pulsing bells with swaying tentacles, glowing, stronger at night)
import * as THREE from 'three';
import { RigBuilder, instantiate, rot, creatureMaterial } from './rig.js';
import { ellipsoid, cone, sweep, aim, mat, col } from './geo.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;
const TAU = Math.PI * 2;

// =====================================================================================  DOLPHIN
function buildDolphin(look = {}) {
  const back = col(look.back || '#4f6f88'), belly = col(look.belly || '#dfe8ec'), mid = col('#8aa4b6');
  const bones = [
    { name: 'root', pos: [0, 0, 0] }, { name: 'body', parent: 'root', pos: [0, 0, 0.1] }, { name: 'head', parent: 'body', pos: [0, 0, 0.45] },
    { name: 'tail1', parent: 'body', pos: [0, 0, -0.15] }, { name: 'tail2', parent: 'tail1', pos: [0, 0, -0.45] }, { name: 'fluke', parent: 'tail2', pos: [0, 0, -0.72] },
  ];
  const B = new RigBuilder(bones);
  const c = new THREE.Color();
  const skin = (p, n) => c.copy(belly).lerp(mid, THREE.MathUtils.smoothstep(n.y, -0.45, -0.05)).lerp(back, THREE.MathUtils.smoothstep(n.y, -0.05, 0.35));
  const S = THREE.MathUtils.smoothstep;
  const weights = p => {
    const z = p.z;
    if (z > 0.3) return [['head', S(z, 0.3, 0.5)], ['body', 1 - S(z, 0.3, 0.5)]];
    if (z > -0.15) return [['body', 1]];
    if (z > -0.45) { const k = S(z, -0.45, -0.15); return [['body', k], ['tail1', 1 - k]]; }
    if (z > -0.72) { const k = S(z, -0.72, -0.45); return [['tail1', k], ['tail2', 1 - k]]; }
    return [['tail2', 0.4], ['fluke', 0.6]];
  };
  const pts = []; for (let i = 0; i <= 14; i++) pts.push(V(0, 0.01 * Math.sin(i / 14 * Math.PI), 0.72 - i / 14 * 1.52));
  const prof = t => 0.03 + 0.17 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.06)), 0.55) * (1 - 0.55 * t) * (t > 0.8 ? 1 - (t - 0.8) * 3 : 1);
  B.add(sweep(pts, prof, 18, { capStart: true, capEnd: true }), { weights, color: skin });
  B.add(ellipsoid(0.055, 0.042, 0.1, 14, 10), { matrix: mat(0, -0.04, 0.7, 0.08, 0, 0), bone: 'head', color: (p, n) => c.copy(belly).lerp(back, S(n.y, 0.1, 0.7)) });
  // dorsal fin (swept back), pectoral flippers, tail flukes
  B.add(cone(0.1, 0.19, 10), { matrix: aim(V(0, 0.12, -0.02), V(0, 1, -0.8), V(0.22, 1, 1)), bone: 'body', color: back });
  for (const x of [1, -1]) {
    B.add(ellipsoid(0.11, 0.015, 0.045, 12, 6), { matrix: mat(x * 0.17, -0.08, 0.22, 0.3, x * 0.7, -x * 0.5), bone: 'body', color: mid });
    B.add(ellipsoid(0.16, 0.014, 0.06, 14, 6), { matrix: mat(x * 0.1, 0, -0.85, 0, -x * 0.55, 0), bone: 'fluke', color: back });
  }
  for (const x of [1, -1]) {
    B.add(ellipsoid(0.014, 0.014, 0.01, 8, 6), { matrix: mat(x * 0.105, 0.02, 0.52), bone: 'head', color: '#141418' });
    B.add(ellipsoid(0.004, 0.004, 0.003, 5, 4), { matrix: mat(x * 0.112, 0.026, 0.527), bone: 'head', color: '#ffffff' });
  }
  return B.build(creatureMaterial({ roughness: 0.35 }), 'Dolphin');
}

function poseDolphin(rig, t, beat = 1) {
  const ph = t * 6;
  rot(rig, 'tail1', Math.sin(ph) * 0.12 * beat, 0, 0);
  rot(rig, 'tail2', Math.sin(ph - 0.8) * 0.22 * beat, 0, 0);
  rot(rig, 'fluke', Math.sin(ph - 1.6) * 0.35 * beat, 0, 0);
  rot(rig, 'head', -Math.sin(ph) * 0.04 * beat, 0, 0);
}

export function createDolphins(ctx, env, root, fx, def = {}) {
  const group = new THREE.Group(); group.name = 'Dolphins'; root.add(group);
  let tpl = null, allowed = false, rolled = false;
  const pods = [];
  const deep = (x, z) => env.isWater(x, z) && env.depth(x, z) > 2.5;

  function spawnPod(cx, cz, heading, n, loops = 4) {
    tpl ||= buildDolphin(def.look);
    const pod = { list: [], heading, loops, t: 0, alive: true };
    for (let i = 0; i < n; i++) {
      const rig = instantiate(tpl);
      const o = new THREE.Group(); o.add(rig.group); group.add(o);
      const side = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.6;
      pod.list.push({ rig, o, off: V(Math.cos(heading) * side, 0, -Math.sin(heading) * side - i * 0.9), delay: i * 0.35 + R() * 0.2, size: 1.3 + R() * 0.3, splashA: false, splashB: false });
    }
    pod.origin = V(cx, 0, cz);
    pods.push(pod);
    return pod;
  }

  function trySpawn(info) {
    const s = env.findSpot(info.player.x, info.player.z, 25, 45, deep, R, 40);
    if (!s) return false;
    spawnPod(s.x, s.z, R() * TAU, 2 + Math.floor(R() * 2));
    ctx.bus?.emit?.('creatures:dolphins', { x: s.x, z: s.z });
    return true;
  }

  const CYCLE = 3.2, LEAP = 1.15, SPEED = 5.5;
  function stepPod(pod, dt) {
    pod.t += dt;
    const fwd = V(Math.sin(pod.heading), 0, Math.cos(pod.heading));
    let any = false;
    for (const d of pod.list) {
      const tt = pod.t - d.delay;
      const k = ((tt % CYCLE) + CYCLE) % CYCLE;
      const loop = Math.floor(tt / CYCLE);
      const done = tt < 0 || loop >= pod.loops;
      const wl = env.waterLevel;
      const p = pod.origin.clone().add(d.off).addScaledVector(fwd, Math.max(0, tt) * SPEED);
      let y = wl - 0.9, pitch = 0;
      if (k < LEAP && !done) {
        const u = k / LEAP;
        y = wl - 0.5 + Math.sin(u * Math.PI) * 1.9;
        pitch = -Math.cos(u * Math.PI) * 0.9;
        if (u < 0.12 && !d.splashA) { d.splashA = true; fx?.splash?.(V(p.x, wl, p.z), 0.7, wl); }
        if (u > 0.85 && !d.splashB) { d.splashB = true; fx?.splash?.(V(p.x, wl, p.z), 0.9, wl); }
      } else { d.splashA = d.splashB = false; const u = (k - LEAP) / (CYCLE - LEAP); y = wl - 0.5 - Math.sin(u * Math.PI) * 0.7; pitch = Math.cos(u * Math.PI) * 0.25; }
      d.o.position.set(p.x, y, p.z);
      d.o.rotation.set(0, pod.heading, 0);
      d.o.rotateX(pitch);
      d.o.scale.setScalar(d.size);
      d.o.visible = !done && y > wl - 1.4;
      poseDolphin(d.rig, pod.t + d.delay, k < LEAP ? 0.3 : 1);
      if (!done || tt < 0) any = true;
    }
    if (!any) { pod.alive = false; for (const d of pod.list) d.o.removeFromParent(); }
  }

  return {
    group, get list() { return pods; },
    setActive(on, info) { allowed = on; if (on && !rolled) { rolled = true; if (R() < (def.chance ?? 0.15)) trySpawn(info); } if (!on) rolled = false; },
    setCount() {},
    /** Called on every game hour: a chance to see a pod when allowed. */
    onHour(info, ok) { if (ok && allowed && !pods.length && R() < (def.chance ?? 0.15)) trySpawn(info); },
    update(dt) { for (const p of pods.slice()) { stepPod(p, dt); if (!p.alive) pods.splice(pods.indexOf(p), 1); } },
    /** Debug/sandbox: a pod at x,z heading `heading` that loops `loops` arcs. */
    debugSpawn(x, z, heading = Math.PI / 2, n = 3, loops = 9999) { return spawnPod(x, z, heading, n, loops); },
    poseDolphin, buildDolphin,
  };
}

// =====================================================================================  JELLYFISH
function bellGeo() {
  const pts = [];
  for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 0.55; pts.push(new THREE.Vector2(Math.sin(a) * 0.16 * (1 + 0.08 * Math.sin(a * 6)), Math.cos(a) * 0.12)); }
  pts.push(new THREE.Vector2(0.15, -0.012), new THREE.Vector2(0.12, -0.004));
  const g = new THREE.LatheGeometry(pts, 24);
  g.computeVertexNormals();
  return g;
}
function tentacleGeo() {
  const parts = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, r = 0.09 + (i % 2) * 0.03, L = 0.35 + (i % 3) * 0.12;
    const p = [];
    for (let j = 0; j <= 8; j++) { const k = j / 8; p.push(V(Math.cos(a) * r * (1 - k * 0.3) + Math.sin(k * 9 + i) * 0.015, -0.01 - k * L, Math.sin(a) * r * (1 - k * 0.3) + Math.cos(k * 8 + i) * 0.015)); }
    parts.push(sweep(p, t => 0.008 * (1 - t * 0.7), 5));
  }
  // frilly oral arms in the middle
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; const p = []; for (let j = 0; j <= 8; j++) { const k = j / 8; p.push(V(Math.cos(a) * 0.025 + Math.sin(k * 7 + i) * 0.02, -0.01 - k * 0.22, Math.sin(a) * 0.025 + Math.cos(k * 6 + i) * 0.02)); } parts.push(sweep(p, t => 0.02 * (1 - t * 0.6), 6)); }
  const pos = [], nor = [], idx = []; let off = 0;
  for (const g of parts) { const gi = g.index ? g : g; const P = gi.attributes.position, N = gi.attributes.normal; for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); } const I = gi.index; if (I) for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + off); off += P.count; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

const JELLY_COLORS = ['#b8a4ff', '#8fd8ff', '#ffb0e0', '#a8ffd8'];

export function createJellyfish(ctx, env, root, fx, def = {}) {
  const group = new THREE.Group(); group.name = 'Jellyfish'; root.add(group);
  let bell = null, tent = null;
  const mats = JELLY_COLORS.map(cl => {
    const c = new THREE.Color(cl);
    return {
      bell: new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
      tent: new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, roughness: 0.4, transparent: true, opacity: 0.5, depthWrite: false }),
    };
  });
  const list = [];
  let target = 0, active = false;
  const water = (x, z) => env.isWater(x, z) && env.depth(x, z) > 0.8;

  function spawn(info, at) {
    const c = (def.spot && env.poi(def.spot)) || info.player;
    const s = at || env.findSpot(c.x, c.z, 0.5, 9, water, R, 30);
    if (!s) return null;
    bell ||= bellGeo(); tent ||= tentacleGeo();
    const m = mats[Math.floor(R() * mats.length)];
    const o = new THREE.Group();
    const b = new THREE.Mesh(bell, m.bell), tg = new THREE.Mesh(tent, m.tent);
    b.renderOrder = tg.renderOrder = 3;
    o.add(b, tg); group.add(o);
    const inWater = env.isWater(s.x, s.z);
    const base = inWater ? env.waterLevel - 0.5 - R() * Math.min(1.2, env.depth(s.x, s.z) - 0.6) : env.ground(s.x, s.z) + 0.8 + R();
    const j = { o, b, tg, m, pos: V(s.x, base, s.z), base, t: R() * 10, fade: 0, leaving: false, size: 0.8 + R() * 0.7, drift: V((R() - 0.5) * 0.1, 0, (R() - 0.5) * 0.1), inWater };
    list.push(j);
    return j;
  }

  return {
    group, get list() { return list; },
    setActive(on, info, n) { active = on; target = on ? n : 0; for (const j of list) j.leaving = !on && !j.pinned; },
    setCount(n) { target = n; },
    update(dt, t, info) {
      if (active) { let alive = list.filter(j => !j.leaving && !j.pinned).length, g = 0; while (alive < target && g++ < 4) { if (!spawn(info)) break; alive++; } }
      const glow = (info.zone === 'sea_cave' ? 1.0 : 0.35) + (info.night ?? 0) * 1.1;
      for (const m of mats) { m.bell.emissiveIntensity = 0.35 + glow * 0.8; m.tent.emissiveIntensity = 0.3 + glow * 0.7; }
      for (const j of list.slice()) {
        j.t += dt;
        j.fade += ((j.leaving ? 0 : 1) - j.fade) * Math.min(1, dt * 1.5);
        const cyc = (j.t * 0.55) % 1;
        const pulse = cyc < 0.3 ? Math.sin(cyc / 0.3 * Math.PI) : 0;
        j.b.scale.set(1 - pulse * 0.16, 1 + pulse * 0.12, 1 - pulse * 0.16);
        j.tg.scale.set(1 - pulse * 0.1, 1 + pulse * 0.08, 1 - pulse * 0.1);
        j.tg.rotation.y = Math.sin(j.t * 0.7) * 0.4;
        j.tg.rotation.x = Math.sin(j.t * 0.9 + 1) * 0.08;
        j.pos.y = j.base + Math.sin(j.t * 0.55 * TAU / 1 * 0.16) * 0.25 + pulse * 0.02;
        const nx = j.pos.x + j.drift.x * dt, nz = j.pos.z + j.drift.z * dt;
        if (!j.inWater || water(nx, nz)) { j.pos.x = nx; j.pos.z = nz; } else j.drift.multiplyScalar(-1);
        j.o.position.copy(j.pos);
        j.o.rotation.z = Math.sin(j.t * 0.3) * 0.12;
        j.o.scale.setScalar(j.size * Math.max(0.001, j.fade));
        j.o.visible = j.fade > 0.01;
        if (j.pinned) j.leaving = false; else if (Math.hypot(j.pos.x - info.player.x, j.pos.z - info.player.z) > (info.cull || 70)) j.leaving = true;
        if (j.leaving && j.fade < 0.02) { j.o.removeFromParent(); list.splice(list.indexOf(j), 1); }
      }
    },
    debugSpawn(x, z, y = null) { const j = spawn({ player: V(x, 0, z) }, { x, z }); if (j) { j.fade = 1; j.pinned = true; if (y != null) j.base = j.pos.y = y; } return j; },
  };
}
