// Rowboat: procedural mesh, repair state, boarding/landing and rowing physics (gentle inertia, only where
// world.boatWaterOK), oar strokes, wake and bobbing. Fishing works from the boat (deep/reef habitats).
//   save.state.boat = { repaired, level, at: 'home'|'village'|'free', x, z, heading }
// Emits 'boat:board' {x, z}, 'boat:leave' {x, z}, 'boat:repaired', 'boat:upgrade' {level}.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LEN = 1.75, WID = 0.78, DEP = 0.5;
const LANDINGS = ['dock_home', 'dock_village', 'palm_islet_beach', 'palm_islet_dock', 'turtle_isle_beach', 'boat_mooring_home', 'boat_mooring_village'];

function vcolor(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), col); c.set([col.r, col.g, col.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function buildBoatMesh() {
  const g = new THREE.Group(); g.name = 'Rowboat';
  const hullC = new THREE.Color(0xc0653f), stripeC = new THREE.Color(0x3fa8b8), rimC = new THREE.Color(0xf2e2b0), keelC = new THREE.Color(0x7d3d24);
  // hull: lower half of a sphere, stretched and pinched toward the bow
  const shape = geo => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      x *= WID; y *= DEP; z *= LEN;
      const f = z / LEN; // -1 stern .. 1 bow
      const pinch = f > 0 ? 1 - Math.pow(f, 2.2) * 0.8 : 1 - Math.pow(-f, 3) * 0.25;
      x *= pinch;
      y += Math.pow(Math.max(0, f), 2) * 0.22 + Math.pow(Math.max(0, -f), 2) * 0.08; // sheer: bow rises
      p.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const outer = shape(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
  vcolor(outer, (x, y, z, c) => {
    const top = y > -0.11 + Math.pow(Math.max(0, z / LEN), 2) * 0.22;
    c.copy(top ? stripeC : hullC);
    if (y < -0.42) c.copy(keelC);
  });
  const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const hull = new THREE.Mesh(outer, hullMat);
  hull.castShadow = true; hull.receiveShadow = true;
  const inner = shape(new THREE.SphereGeometry(0.94, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
  const innerMesh = new THREE.Mesh(inner, new THREE.MeshStandardMaterial({ color: 0x9a6a42, roughness: 0.9, side: THREE.BackSide }));
  innerMesh.receiveShadow = true;
  // rim, seats, floor boards (merged)
  const rimPts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    let x = Math.cos(a) * WID, z = Math.sin(a) * LEN;
    const f = z / LEN;
    x *= f > 0 ? 1 - Math.pow(f, 2.2) * 0.8 : 1 - Math.pow(-f, 3) * 0.25;
    rimPts.push(new THREE.Vector3(x, Math.pow(Math.max(0, f), 2) * 0.22 + Math.pow(Math.max(0, -f), 2) * 0.08 + 0.015, z));
  }
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 80, 0.045, 6, true);
  const parts = [vcolor(rim, (x, y, z, c) => c.copy(rimC))];
  for (const [z, w] of [[-0.75, 0.62], [0.45, 0.6]]) parts.push(vcolor(new THREE.BoxGeometry(w * 2, 0.06, 0.32).translate(0, 0.0, z), (x, y, zz, c) => c.set(0xb07a4a)));
  // plank floor above the waterline (the water plane is opaque, so the inside must not dip below it)
  const outline = new THREE.Shape(rimPts.slice(0, -1).map(v => new THREE.Vector2(v.x * 0.9, -v.z * 0.9)));
  const floor = new THREE.ShapeGeometry(outline, 2).rotateX(-Math.PI / 2).translate(0, -0.1, 0);
  parts.push(vcolor(floor, (x, y, z, c) => c.set(Math.floor((x + 2) / 0.16) % 2 ? 0x9a6a42 : 0x8a5c38)));
  for (const s of [-1, 1]) parts.push(vcolor(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6).translate(s * 0.72, 0.08, 0.02), (x, y, z, c) => c.set(0x5a4a3a)));
  const fittings = new THREE.Mesh(mergeGeometries(parts.map(p => (p.index ? p.toNonIndexed() : p)).map(p => { p.deleteAttribute('uv'); return p; })), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  fittings.castShadow = true; fittings.receiveShadow = true;
  // oars (pivot at the oarlocks)
  const oarMat = new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 0.8 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x3fa8b8, roughness: 0.7 });
  const oars = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.72, 0.12, 0.02);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), oarMat);
    shaft.rotation.z = Math.PI / 2; shaft.position.x = s * 0.55;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.2), bladeMat); blade.position.x = s * 1.55;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6), oarMat); grip.rotation.z = Math.PI / 2; grip.position.x = -s * 0.52;
    for (const m of [shaft, blade, grip]) { m.castShadow = true; pivot.add(m); }
    pivot.userData.side = s;
    oars.push(pivot); g.add(pivot);
  }
  // mast + sail (level 2)
  const sail = new THREE.Group(); sail.visible = false;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x8a5532, roughness: 0.8 }));
  mast.position.set(0, 1.0, 0.75); mast.castShadow = true;
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.15, 0.78, 0, 2.1, 0.78, 0, 0.2, -0.65], 3));
  sg.computeVertexNormals();
  const sheet = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.9, side: THREE.DoubleSide }));
  sheet.castShadow = true;
  sail.add(mast, sheet);
  // seat where the player sits (faces the bow, +z)
  const seat = new THREE.Object3D(); seat.position.set(0, -0.1, -0.05); seat.name = 'BoatSeat';
  // patches shown while broken
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.18, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 1 }));
  patch.position.set(0.5, -0.18, 0.3); patch.rotation.y = Math.PI / 2 + 0.3;
  g.add(hull, innerMesh, fittings, sail, seat, patch);
  return { group: g, oars, seat, sail, sheet, patch, hullMat };
}

export function createBoat(ctx, env, fx) {
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};
  const B = () => { const b = (S().boat ||= {}); b.level ??= 0; return b; };
  const repaired = () => !!(B().repaired || S().flags?.boat_repaired);

  const mesh = ctx.world?.boat?.object ? null : buildBoatMesh();
  const root = ctx.world?.boat?.object || mesh.group;
  if (mesh) ctx.scene.add(root);
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), seatW = new THREE.Vector3();

  let active = false, fishingMode = false;
  let heading = 0, speed = 0, turnRate = 0, strokePh = 0, wakeT = 0, t0 = 0, bumpT = 0;
  let animNow = null;
  let parentedByUs = false;
  const pos = new THREE.Vector3();

  function levelSpeed() {
    const lv = B().level || 0;
    const it = (D().boat || []).find(x => x.level === lv && x.id !== 'boat_repair') || null;
    return it?.stats?.speed || (lv >= 2 ? 1.65 : lv >= 1 ? 1.3 : 1);
  }

  function place() {
    const b = B();
    let p = null;
    if (Number.isFinite(b.x) && Number.isFinite(b.z)) p = { x: b.x, z: b.z, facing: b.heading || 0 };
    else p = env.poi(b.at === 'village' ? 'boat_mooring_village' : 'boat_mooring_home') || env.poi('boat_mooring_home') || env.poi('dock_home');
    if (!p) { root.visible = false; return; }
    root.visible = true;
    pos.set(p.x, 0, p.z);
    heading = Number.isFinite(b.heading) ? b.heading : p.facing ?? 0;
    pos.y = env.waterSurface(pos.x, pos.z);
  }

  function refresh() {
    if (!mesh) return;
    const ok = repaired();
    for (const o of mesh.oars) o.visible = ok;
    mesh.patch.visible = !ok;
    mesh.sail.visible = ok && (B().level || 0) >= 2;
    mesh.hullMat.color.setScalar(ok ? 1 : 0.72);
  }

  /** Is there a place to step ashore near the boat? → {x, z} or null. */
  function landingSpot() {
    let best = null, bd = 8.5;
    for (const id of LANDINGS) {
      const p = env.poi(id);
      if (!p) continue;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < bd && env.walkable(p.x, p.z) && !id.startsWith('boat_mooring')) { bd = d; best = { x: p.x, z: p.z }; }
    }
    if (best) return best;
    const surf = pos.y;
    for (let r = 1.4; r <= 5.2; r += 0.55) {
      for (let k = 0; k < 16; k++) {
        const a = heading + (k / 16) * Math.PI * 2;
        const x = pos.x + Math.sin(a) * r, z = pos.z + Math.cos(a) * r;
        if (env.walkable(x, z) && !env.isWater(x, z) && env.groundY(x, z) - surf < 1.6) return { x, z };
      }
    }
    return null;
  }

  function anim(name, opts) { if (animNow === name) return; animNow = name; env.play(name, { loop: true, ...opts }); }

  function attachPlayer() {
    const p = env.player();
    parentedByUs = false;
    try { p.board?.(boat); } catch (e) { console.warn('[boat] player.board', e); }
    const o = p.object;
    if (!o) return;
    // make sure the player rides along even if the player module doesn't parent it
    let q = o.parent, inside = false;
    while (q) { if (q === root) { inside = true; break; } q = q.parent; }
    if (!inside) { boat.seat.add(o); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); parentedByUs = true; }
  }

  function detachPlayer(x, z) {
    const p = env.player();
    const o = p.object;
    try { p.leaveBoat?.(); } catch (e) { console.warn('[boat] player.leaveBoat', e); }
    if (o && (parentedByUs || o.parent === boat.seat)) {
      o.parent?.remove(o);
      (ctx.stage?.group && p === env.dummy ? ctx.stage.group : ctx.scene).add(o);
      o.rotation.set(0, heading, 0);
    }
    parentedByUs = false;
    if (p.teleport) p.teleport(x, z);
    else if (o) o.position.set(x, env.groundY(x, z), z);
    ctx.cameraRig?.snap?.();
  }

  const boat = {
    object: root,
    get seat() { return mesh?.seat || ctx.world?.boat?.seat || root; },
    get group() { return root; },
    get oars() { return mesh?.oars || []; },
    get unlocked() { return repaired(); },
    get repaired() { return repaired(); },
    get active() { return active; },
    get speed() { return Math.abs(speed); },
    get heading() { return heading; },
    get position() { return pos; },
    refresh() { refresh(); },
    /** Distance from a point to the boat (for interact). */
    distanceTo(p) { return Math.hypot(p.x - pos.x, p.z - pos.z); },
    canLeave() { return active && !!landingSpot(); },
    /** Where the player would step ashore ({x, z}) or null. */
    landingSpot() { return active ? landingSpot() : null; },
    landingSpot,
    applyItem(it) {
      if (!it) return;
      if (it.id === 'boat_repair') {
        B().repaired = true;
        S().flags ||= {}; S().flags.boat_repaired = true;
        ctx.bus.emit('boat:repaired', {});
        ctx.bus.emit('flag:set', { flag: 'boat_repaired' });
      } else if (Number.isFinite(it.level)) {
        B().level = Math.max(B().level || 0, it.level);
        ctx.bus.emit('boat:upgrade', { level: B().level });
      }
      ctx.save.commit();
      refresh();
    },
    setFishing(v) { fishingMode = !!v; if (!v) animNow = null; },
    board() {
      if (active || !repaired() || !root.visible) return false;
      sys().fishing?.cancel?.();
      active = true; speed = 0; turnRate = 0;
      B().at = 'free';
      env.setControl(false);
      env.setPlayerState('boat');
      attachPlayer();
      animNow = null; anim('sit_idle');
      ctx.cameraRig?.setMode?.('boat');
      env.sfx('footstep_wood', { pos });
      env.sfx('splash_small', { pos, vol: 0.4, delay: 0.15 });
      fx.ripple(pos, 1.6, { life: 1.8 });
      ctx.save.commit();
      ctx.bus.emit('boat:board', { x: pos.x, z: pos.z });
      return true;
    },
    leave() {
      if (!active) return false;
      const spot = landingSpot();
      if (!spot) { env.toast('sys.boat.no_landing'); return false; }
      sys().fishing?.cancel?.();
      active = false; speed = 0;
      const b = B(); b.x = pos.x; b.z = pos.z; b.heading = heading;
      detachPlayer(spot.x, spot.z);
      env.setControl(true);
      env.setPlayerState('idle');
      ctx.cameraRig?.setMode?.('explore');
      env.sfx('footstep_wood');
      ctx.save.commit();
      ctx.bus.emit('boat:leave', { x: spot.x, z: spot.z });
      return true;
    },
    /** Put the boat back at a mooring (debug / after repair). */
    moor(at = 'home') { const b = B(); b.at = at; delete b.x; delete b.z; delete b.heading; place(); },
    update(dt, t) {
      t0 = t;
      if (!root.visible && !active) return;
      const input = ctx.input;
      if (active && !fishingMode && !sys().fishing?.busy && !env.uiOpen()) {
        const m = input.move;
        const mag = m.mag || 0;
        let thrust = 0;
        if (mag > 0.08) {
          const target = Math.atan2(m.x, m.z);
          let diff = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
          const maxTurn = 1.15 * (0.4 + 0.6 * mag);
          const want = Math.max(-maxTurn, Math.min(maxTurn, diff * 2.2));
          turnRate += (want - turnRate) * Math.min(1, dt * 2.5);
          thrust = mag * Math.max(0, Math.cos(diff));
        } else turnRate += (0 - turnRate) * Math.min(1, dt * 2);
        heading += turnRate * dt;
        const vmax = 3.4 * levelSpeed();
        const target = thrust * vmax;
        speed += (target - speed) * Math.min(1, dt * (target > speed ? 0.9 : 0.45));
        // strokes
        if (mag > 0.08) {
          const prev = strokePh;
          strokePh += dt * (1.6 + Math.abs(speed) * 0.35) * Math.PI;
          if (Math.floor(prev / (Math.PI * 2)) !== Math.floor(strokePh / (Math.PI * 2))) {
            env.sfx('row', { pos, vol: 0.6 });
            for (const o of boat.oars) { o.getWorldPosition(tmp); tmp.x += Math.cos(heading) * o.userData.side * 1.5; tmp.z -= Math.sin(heading) * o.userData.side * 1.5; tmp.y = pos.y; fx.ripple(tmp, 0.55, { life: 1.2, alpha: 0.6 }); fx.foam(tmp, 0.35, { life: 1.4, alpha: 0.5 }); }
          }
          anim('row', { speed: 0.6 + Math.abs(speed) / vmax * 0.8 });
        } else anim('sit_idle');
      } else if (active) {
        speed += (0 - speed) * Math.min(1, dt * 0.8);
        turnRate += (0 - turnRate) * Math.min(1, dt * 2);
        heading += turnRate * dt;
      }
      // move (only on water deep enough)
      if (Math.abs(speed) > 0.001) {
        fwd.set(Math.sin(heading), 0, Math.cos(heading));
        const nx = pos.x + fwd.x * speed * dt, nz = pos.z + fwd.z * speed * dt;
        const bowX = nx + fwd.x * LEN * Math.sign(speed || 1), bowZ = nz + fwd.z * LEN * Math.sign(speed || 1);
        const dep = (x, z) => env.waterDepth?.(x, z) ?? 0;
        // a boat that drifted into the shallows (waves, landing) may always row toward deeper water
        const escape = !env.boatWaterOK(pos.x, pos.z) && dep(bowX, bowZ) >= dep(pos.x, pos.z) - 0.02 && dep(nx, nz) > 0.05;
        if ((env.boatWaterOK(nx, nz) && env.boatWaterOK(bowX, bowZ)) || escape) { pos.x = nx; pos.z = nz; }
        else {
          if (bumpT <= 0) { ctx.cameraRig?.shake?.(0.08); env.sfx('footstep_wood', { pos, vol: 0.5, pitch: 0.6 }); bumpT = 0.8; fx.ripple({ x: bowX, y: pos.y, z: bowZ }, 0.7); }
          speed *= -0.25;
        }
      }
      bumpT -= dt;
      // wake
      if (active && Math.abs(speed) > 0.35) {
        wakeT -= dt;
        if (wakeT <= 0) {
          wakeT = 0.11;
          fwd.set(Math.sin(heading), 0, Math.cos(heading));
          const k = Math.min(1, Math.abs(speed) / 3);
          for (const s of [-1, 1]) {
            tmp.set(pos.x - fwd.x * (LEN - 0.2) + fwd.z * s * 0.35, pos.y, pos.z - fwd.z * (LEN - 0.2) - fwd.x * s * 0.35);
            fx.foam(tmp, 0.45 + k * 0.35, { life: 2.4, alpha: 0.35 + k * 0.3, vx: fwd.z * s * 0.5 * k, vz: -fwd.x * s * 0.5 * k });
          }
          if (Math.random() < 0.5) { tmp.set(pos.x + fwd.x * (LEN - 0.3), pos.y, pos.z + fwd.z * (LEN - 0.3)); fx.foam(tmp, 0.3 + k * 0.3, { life: 1.2, alpha: 0.4 * k }); }
        }
      }
      // pose: bob, roll, pitch
      const surf = env.waterSurface(pos.x, pos.z);
      pos.y = surf;
      const ok = repaired();
      root.position.set(pos.x, surf + 0.2 + Math.sin(t * 1.4) * 0.035 + (ok ? 0 : -0.07), pos.z);
      root.rotation.set(Math.sin(t * 0.9) * 0.02 - speed * 0.012 + (ok ? 0 : -0.05), heading, Math.sin(t * 1.1) * 0.03 + turnRate * 0.12 + (ok ? 0 : 0.1), 'YXZ');
      // oars: sweep while rowing, rest otherwise
      for (const o of boat.oars) {
        const s = o.userData.side;
        if (active && (ctx.input.move?.mag || 0) > 0.08 && !fishingMode) {
          o.rotation.y = s * Math.sin(strokePh) * 0.55;
          o.rotation.z = s * (-0.2 + Math.cos(strokePh) * 0.16);
        } else {
          o.rotation.y += (s * -0.9 - o.rotation.y) * Math.min(1, dt * 2);
          o.rotation.z += (s * -0.12 - o.rotation.z) * Math.min(1, dt * 2);
        }
      }
      // keep a player we parented ourselves facing forward
      if (active && parentedByUs) { const o = env.player().object; if (o) { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); } }
      if (active) { const b = B(); b.x = pos.x; b.z = pos.z; b.heading = heading; }
    },
  };

  place();
  refresh();
  ctx.bus.on('save:loaded', () => { if (!active) { place(); refresh(); } });
  ctx.bus.on('flag:set', e => { if (e?.flag === 'boat_repaired') refresh(); });
  return boat;
}
