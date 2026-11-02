// [r2-animation] The catch mat ("stuoia"): a woven straw mat the fisherman unrolls beside his fishing spot, with the
// catch lying on it as real fish models (ctx.fishModels.create) in a neat row, plus a small water bucket at its near end.
//   const mat = createMat(ctx);  mat.place(pos, facing);  const slot = mat.addFish('koi', 42);  mat.roll();
// Local frame: origin = mat centre on the ground, +z = the player's facing when placed (long axis), +x = the player's left.
// It unrolls from the near end (-z) to the far end (+z); fish lie across it (nose to +x), slot 0 nearest to the player.
import * as THREE from 'three';
import { makeBucket, Droplets } from './tools.js';

export const MAT = { L: 1.25, W: 0.66, LIFT: 0.018, SIDE: 0.7, AHEAD: 0.3, SLOTS: 6, MAXLEN: 0.56 };
const SLOT_Z = i => -MAT.L / 2 + 0.17 + i * ((MAT.L - 0.3) / (MAT.SLOTS - 1));
const BUCKET_LOCAL = new THREE.Vector3(-0.08, 0, -MAT.L / 2 - 0.24);
const R_MAX = Math.sqrt(MAT.L * 0.007 / Math.PI) + 0.012;   // radius of the full roll (mat ~7 mm thick)

let TEX = null;
/** Woven straw texture: weft bands, warp threads, two coloured border stripes and a fringe (alpha) at both ends. */
function strawTexture() {
  if (TEX) return TEX;
  const w = 128, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const y0 = 10, y1 = h - 10;
  g.fillStyle = '#d8b56a'; g.fillRect(0, y0, w, y1 - y0);
  // weft: alternating light/dark straw bands with a basket-weave offset
  for (let y = y0, r = 0; y < y1; y += 4, r++) {
    for (let x = 0; x < w; x += 8) {
      const on = ((x / 8) + r) % 2 === 0;
      g.fillStyle = on ? '#e6c77e' : '#c9a258';
      g.fillRect(x, y, 8, 4);
      g.fillStyle = 'rgba(90,60,20,0.18)'; g.fillRect(x, y + 3, 8, 1);
    }
  }
  // coloured stripes near the ends (cozy beach mat) and along the sides
  const band = (y, col) => { g.fillStyle = col; g.fillRect(0, y, w, 6); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, y, w, 1); };
  for (const y of [y0 + 12, y1 - 18]) { band(y, '#b8623b'); band(y + 9, '#3f8f7a'); }
  g.fillStyle = '#a8813f'; g.fillRect(0, y0, 5, y1 - y0); g.fillRect(w - 5, y0, 5, y1 - y0);
  // fringe
  g.strokeStyle = '#d6b46c'; g.lineWidth = 2;
  for (let x = 4; x < w; x += 6) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x + 1, 1); g.stroke(); g.beginPath(); g.moveTo(x, y1); g.lineTo(x - 1, h - 1); g.stroke(); }
  TEX = new THREE.CanvasTexture(c);
  TEX.colorSpace = THREE.SRGBColorSpace; TEX.anisotropy = 4;
  return TEX;
}

export function createMat(ctx) {
  const root = new THREE.Group(); root.name = 'CatchMat'; root.visible = false;
  // flat (unrolled) part: a plane from z=0 to z=L, scaled in z by the unrolled fraction; the texture follows.
  const tex = strawTexture().clone(); tex.needsUpdate = true;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  const flatMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pg = new THREE.PlaneGeometry(MAT.W, MAT.L); pg.rotateX(-Math.PI / 2); pg.translate(0, 0, MAT.L / 2);
  // UV v: 0 at the near end (z=0) → 1 at the far end
  { const uv = pg.attributes.uv, pos = pg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getZ(i) / MAT.L); }
  const flat = new THREE.Mesh(pg, flatMat); flat.receiveShadow = true; flat.name = 'mat_flat';
  const flatPivot = new THREE.Group(); flatPivot.position.set(0, MAT.LIFT, -MAT.L / 2); flatPivot.add(flat);
  // the roll: a cylinder across the mat
  const rollTex = strawTexture().clone(); rollTex.needsUpdate = true; rollTex.wrapS = rollTex.wrapT = THREE.RepeatWrapping; rollTex.repeat.set(1, 0.5);
  const rollMat = new THREE.MeshStandardMaterial({ map: rollTex, roughness: 0.95, color: 0xf2e2c0 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xa8813f, roughness: 1 });
  const cg = new THREE.CylinderGeometry(1, 1, MAT.W - 0.02, 18, 1, false); cg.rotateZ(Math.PI / 2);
  const roll = new THREE.Mesh(cg, [rollMat, capMat, capMat]); roll.castShadow = true; roll.name = 'mat_roll';
  const fishLayer = new THREE.Group(); fishLayer.name = 'mat_fish';
  const bucket = makeBucket(); bucket.position.copy(BUCKET_LOCAL);
  root.add(flatPivot, roll, fishLayer, bucket);
  const fx = new Droplets(); ctx.scene?.add?.(fx.object);

  let active = false, unrolled = 0, anim = null, facing = 0, placedAt = new THREE.Vector3();
  const slots = new Array(MAT.SLOTS).fill(null);   // {id, size, inst, fresh, flopT, flop, roll, clean, tween}
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
  const ZA = new THREE.Vector3(0, 0, 1), YA = new THREE.Vector3(0, 1, 0);

  function setUnrolled(u) {
    unrolled = Math.max(0, Math.min(1, u));
    const fl = Math.max(1e-3, unrolled);
    flat.scale.z = fl; flat.visible = unrolled > 0.01;
    tex.repeat.set(1, fl); tex.offset.set(0, 0);
    const r = Math.sqrt(R_MAX * R_MAX * (1 - unrolled)) + 0.008;
    roll.scale.set(1, r, r);
    roll.position.set(0, MAT.LIFT + r, -MAT.L / 2 + unrolled * MAT.L);
    roll.rotation.x = -unrolled * MAT.L / Math.max(0.03, R_MAX * 0.7);
    roll.visible = unrolled < 0.985;
    rollTex.repeat.set(1, 0.25 + 0.75 * (1 - unrolled));
  }
  setUnrolled(0);

  const W = () => ctx.world;
  const gy = (x, z) => { const w = W(); const y = w?.groundY?.(x, z); if (Number.isFinite(y)) return y; return w?.heightAt ? Math.max(w.waterLevel ?? 0, w.heightAt(x, z)) : 0; };
  const toWorld = (lx, lz, out = new THREE.Vector3()) => {
    const c = Math.cos(facing), s = Math.sin(facing);
    return out.set(placedAt.x + lx * c + lz * s, 0, placedAt.z - lx * s + lz * c);
  };

  /** Lay the mat flat on docks / sloped shores: fit pitch & roll to the ground under its corners. */
  function fitGround() {
    const hw = MAT.W / 2 - 0.04, hl = MAT.L / 2 - 0.05, p = new THREE.Vector3();
    const h = (lx, lz) => { toWorld(lx, lz, p); return gy(p.x, p.z); };
    const fl = h(hw, hl), fr = h(-hw, hl), bl = h(hw, -hl), br = h(-hw, -hl), c = h(0, 0);
    const pitch = Math.atan2(((fl + fr) - (bl + br)) / 2, 2 * hl), rollA = Math.atan2(((fl + bl) - (fr + br)) / 2, 2 * hw);
    root.position.set(placedAt.x, Math.max(c, (fl + fr + bl + br) / 4) + 0.004, placedAt.z);
    root.rotation.set(-Math.max(-0.35, Math.min(0.35, pitch)), facing, Math.max(-0.35, Math.min(0.35, rollA)), 'YXZ');
    // the bucket stands on its own ground
    toWorld(BUCKET_LOCAL.x, BUCKET_LOCAL.z, p);
    root.updateMatrixWorld(true);
    const local = root.worldToLocal(p.set(p.x, gy(p.x, p.z), p.z));
    bucket.position.set(BUCKET_LOCAL.x, local.y, BUCKET_LOCAL.z);
  }

  /** Lie-on-side transform of a fish in slot i (roll angle a: +90° = on its right side, -90° after a flip). */
  function posFish(s, i, hop = 0) {
    const o = s.inst.object;
    _qa.setFromAxisAngle(YA, s.flatOne ? Math.PI : Math.PI / 2);   // nose → +x (flat ones: face the player)
    _qb.setFromAxisAngle(ZA, s.roll);                      // lie on the side
    o.quaternion.copy(_qa).multiply(_qb);
    if (s.wob) o.quaternion.multiply(_q.setFromAxisAngle(ZA, s.wob));
    o.position.set(0, MAT.LIFT + 0.004 + s.half + hop, SLOT_Z(i));
  }

  function freeSlot() {
    for (let i = 0; i < slots.length; i++) if (!slots[i]) return i;
    // full: the oldest fish quietly leaves (max ~6 visible)
    removeFish(0, true);
    for (let i = 0; i < slots.length - 1; i++) { slots[i] = slots[i + 1]; if (slots[i]) slots[i].tween = { t: 0, dur: 0.35, from: slots[i].inst.object.position.clone(), fromQ: slots[i].inst.object.quaternion.clone() }; }
    slots[slots.length - 1] = null;
    return slots.length - 1;
  }

  /**
   * Add a fish model to the mat. opts.from: world Vector3 the fish glides from (e.g. the player's hands), opts.fresh
   * (default true) = small idle flops for ~10 s. Returns the slot index (or -1 if no model exists for that species).
   */
  function addFish(speciesId, size, opts = {}) {
    const inst = ctx.fishModels?.create?.(speciesId, { size, lod: 1, shadow: true });
    if (!inst) return -1;
    if (!active) { place(opts.pos || null, opts.facing); setUnrolled(1); }
    const i = freeSlot();
    // keep a big catch inside the mat
    const len = Math.min(MAT.MAXLEN, inst.length);
    inst.object.scale.setScalar(len);
    const g = inst.mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    // crabs, rays, octopus, turtles, junk lie as they are; fish lie on their side
    const shape = String(inst.species?.model?.shape || inst.spec?.shape || '');
    const flatOne = /crab|ray|squid|octo|turtle|jelly|star|junk/.test(shape) || inst.mode === 'flat' || inst.mode === 'junk';
    const half = flatOne ? Math.max(Math.abs(bb.min.y), 0.01) * len : Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), 0.02) * len;
    const s = { id: speciesId, size, inst, half, flatOne, roll: flatOne ? 0 : Math.PI / 2, wob: 0, fresh: opts.fresh === false ? 0 : 10, flopT: 0.6 + Math.random(), flop: 0, clean: false, tween: null };
    slots[i] = s;
    fishLayer.add(inst.object);
    inst.animate(0, 0, 0);
    posFish(s, i);
    if (opts.from) {
      root.updateMatrixWorld(true);
      const from = root.worldToLocal(opts.from.clone());
      s.tween = { t: 0, dur: opts.dur ?? 0.32, from, fromQ: inst.object.quaternion.clone().multiply(_q.setFromAxisAngle(ZA, -Math.PI / 2)) };
      inst.object.position.copy(from);
    }
    ctx.bus?.emit?.('mat:add', { slot: i, speciesId, size });
    return i;
  }

  function removeFish(slot = 'all', silent = false) {
    if (slot === 'all') { for (let i = 0; i < slots.length; i++) if (slots[i]) removeFish(i, silent); return; }
    const s = slots[slot]; if (!s) return;
    s.inst.dispose?.(); s.inst.object.removeFromParent();
    slots[slot] = null;
    if (!silent) ctx.bus?.emit?.('mat:remove', { slot, speciesId: s.id });
  }

  /** Put the mat (already unrolled unless opts.rolled) at pos = mat centre, long axis along `facing`. */
  function place(pos, f = facing, opts = {}) {
    if (!pos) pos = spotFor();
    facing = Number.isFinite(f) ? f : 0;
    placedAt.set(pos.x, 0, pos.z);
    if (!root.parent) ctx.scene.add(root);
    fitGround();
    root.visible = true; active = true;
    anim = null; setUnrolled(opts.rolled ? 0 : 1);
    ctx.bus?.emit?.('mat:place', { x: placedAt.x, z: placedAt.z, facing });
    return api;
  }

  /** Default spot beside the player: on the left, a bit ahead; falls back to the right / behind when blocked or wet. */
  function spotFor(p = ctx.player?.position, f = ctx.player?.facing ?? 0) {
    if (!p) return { x: 0, z: 0, facing: f };
    const fw = { x: Math.sin(f), z: Math.cos(f) }, left = { x: Math.cos(f), z: -Math.sin(f) };
    const w = W(), base = gy(p.x, p.z);
    const okAt = (x, z) => {
      if (w?.walkable && !w.walkable(x, z)) return false;
      const g = gy(x, z);
      if (Math.abs(g - base) > 0.25) return false;
      if (w?.isWater?.(x, z) && g <= (w.waterLevel ?? 0) + 0.04) return false;
      return true;
    };
    for (const [side, ahead] of [[1, MAT.AHEAD], [-1, MAT.AHEAD], [1, 0], [-1, 0], [1, -0.35], [-1, -0.35]]) {
      const cx = p.x + left.x * MAT.SIDE * side + fw.x * ahead, cz = p.z + left.z * MAT.SIDE * side + fw.z * ahead;
      let ok = true;
      for (const [lx, lz] of [[0, 0], [0.28, 0.58], [-0.28, 0.58], [0.28, -0.58], [-0.28, -0.58], [BUCKET_LOCAL.x, BUCKET_LOCAL.z]]) {
        const x = cx + lx * Math.cos(f) + lz * Math.sin(f), z = cz - lx * Math.sin(f) + lz * Math.cos(f);
        if (!okAt(x, z)) { ok = false; break; }
      }
      if (ok) return { x: cx, z: cz, facing: f, side };
    }
    return { x: p.x + left.x * MAT.SIDE + fw.x * MAT.AHEAD, z: p.z + left.z * MAT.SIDE + fw.z * MAT.AHEAD, facing: f, side: 1, blocked: true };
  }

  /** Unroll animation (rolled → flat) over dur seconds; place() first with {rolled:true}. */
  function unroll(dur = 1.0) { if (!active) place(null, undefined, { rolled: true }); anim = { from: unrolled, to: 1, t: 0, dur }; return new Promise(r => { anim.done = r; }); }
  /** Roll it up (flat → rolled) over dur, then clear the fish and hide. Resolves when done. */
  function rollUp(dur = 0.9, opts = {}) {
    if (!active) return Promise.resolve(false);
    for (let i = 0; i < slots.length; i++) if (slots[i]) slots[i].leaving = 0;
    anim = { from: unrolled, to: 0, t: 0, dur, hide: opts.keepVisible ? 0 : 0.25 };
    return new Promise(r => { anim.done = r; });
  }

  function flipFish(slot) {
    const s = slots[slot]; if (!s) return false;
    if (s.flatOne) { s.flip = { t: 0, dur: 0.45, from: 0, to: 0 }; s.fresh = 0; return true; }
    s.flip = { t: 0, dur: 0.45, from: s.roll, to: s.roll > 0 ? -Math.PI / 2 : Math.PI / 2 };
    s.fresh = 0;
    return true;
  }
  /** Mark a fish as cleaned: a touch paler and glossier, no more flops. */
  function markClean(slot) {
    const s = slots[slot]; if (!s || s.clean) return false;
    s.clean = true; s.fresh = 0;
    const m = s.inst.mesh.material;
    if (m.color) m.color.lerp(new THREE.Color(0xfff4ea), 0.22);
    if ('roughness' in m) m.roughness = Math.max(0.2, (m.roughness ?? 0.6) - 0.3);
    ctx.bus?.emit?.('mat:clean', { slot, speciesId: s.id });
    return true;
  }
  /** World position of a slot (top of the fish) / of the bucket rim. */
  function slotWorld(slot, out = new THREE.Vector3()) {
    root.updateMatrixWorld(true);
    return root.localToWorld(out.set(0, MAT.LIFT + 0.04, SLOT_Z(Math.max(0, Math.min(MAT.SLOTS - 1, slot)))));
  }
  function bucketWorld(out = new THREE.Vector3()) { root.updateMatrixWorld(true); return bucket.localToWorld(out.set(0, 0.2, 0)); }
  /** Slot index the player should use next / the nearest occupied slot. */
  const nextSlot = () => { const i = slots.findIndex(s => !s); return i < 0 ? MAT.SLOTS - 1 : i; };
  const lastSlot = () => { for (let i = slots.length - 1; i >= 0; i--) if (slots[i]) return i; return -1; };

  /** Take the fish model out of a slot (e.g. to hold it again): returns {inst, id, size} and frees the slot. */
  function takeFish(slot) {
    const s = slots[slot]; if (!s) return null;
    slots[slot] = null;
    const o = s.inst.object; o.updateWorldMatrix(true, false);
    const wp = o.getWorldPosition(new THREE.Vector3());
    o.removeFromParent();
    o.scale.setScalar(s.inst.length);
    ctx.bus?.emit?.('mat:remove', { slot, speciesId: s.id, taken: true });
    return { inst: s.inst, id: s.id, size: s.size, worldPos: wp };
  }

  function update(dt) {
    fx.update(dt);
    if (!active && !anim) return;
    if (anim) {
      anim.t += dt;
      const k = Math.min(1, anim.t / anim.dur), e = k * k * (3 - 2 * k);
      setUnrolled(anim.from + (anim.to - anim.from) * e);
      // fish slide into the roll as it reaches them
      if (anim.to === 0) for (let i = 0; i < slots.length; i++) {
        const s = slots[i]; if (!s) continue;
        const zN = (SLOT_Z(i) + MAT.L / 2) / MAT.L;
        if (unrolled < zN + 0.05) s.inst.object.scale.setScalar(Math.max(1e-3, s.inst.object.scale.x * Math.exp(-14 * dt)));
      }
      if (k >= 1) {
        const a = anim;
        if (a.to === 0) {
          if (a.hide > 0 && !a.hiding) { a.hiding = true; a.t = a.dur; a.hideT = 0; }
        }
        if (!a.hiding) { anim = null; a.done?.(true); }
      }
      if (anim?.hiding) {
        anim.hideT += dt;
        const s = Math.max(1e-3, 1 - anim.hideT / anim.hide);
        root.scale.setScalar(s);
        if (anim.hideT >= anim.hide) {
          const a = anim; anim = null;
          removeFish('all', true); root.visible = false; root.scale.setScalar(1); active = false; setUnrolled(0);
          ctx.bus?.emit?.('mat:roll', {});
          a.done?.(true);
        }
      }
    }
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]; if (!s) continue;
      let hop = 0;
      if (s.flip) {
        s.flip.t += dt; const k = Math.min(1, s.flip.t / s.flip.dur), e = k * k * (3 - 2 * k);
        s.roll = s.flip.from + (s.flip.to - s.flip.from) * e; hop = Math.sin(k * Math.PI) * 0.06;
        if (k >= 1) s.flip = null;
      }
      if (s.fresh > 0) {
        s.fresh -= dt; s.flopT -= dt;
        if (s.flopT <= 0 && !s.flop) { s.flop = 0.42; s.flopT = 1.6 + Math.random() * 2.4; s.dir = Math.random() < 0.5 ? -1 : 1; }
      }
      if (s.flop > 0) {
        s.flop -= dt; const k = 1 - Math.max(0, s.flop) / 0.42;
        hop += Math.sin(k * Math.PI) * 0.035;
        s.wob = Math.sin(k * Math.PI * 2) * 0.18 * s.dir;
        s.inst.animate(dt, 2.4, Math.sin(k * Math.PI * 3) * 0.9 * s.dir);
        if (s.flop <= 0) { s.flop = 0; s.wob = 0; s.settle = 0.3; }
      } else if (s.settle > 0) { s.settle -= dt; s.inst.animate(dt, 0, 0); }
      if (s.tween) {
        s.tween.t += dt; const k = Math.min(1, s.tween.t / s.tween.dur), e = 1 - (1 - k) ** 3;
        posFish(s, i, 0);
        const goal = s.inst.object.position.clone(), gq = s.inst.object.quaternion.clone();
        s.inst.object.position.lerpVectors(s.tween.from, goal, e); s.inst.object.position.y += Math.sin(k * Math.PI) * 0.05;
        s.inst.object.quaternion.copy(s.tween.fromQ).slerp(gq, e);
        if (k >= 1) s.tween = null;
      } else posFish(s, i, hop);
    }
  }

  const api = {
    object: root, bucket, fx,
    place, addFish, removeFish, roll: rollUp, unroll, spotFor, flipFish, markClean, slotWorld, bucketWorld, takeFish,
    nextSlot, lastSlot,
    /** Mat-local (x across, z along) ↔ world XZ. */
    toWorld: (lx, lz, out) => toWorld(lx, lz, out),
    toLocal(p) { const c = Math.cos(facing), sn = Math.sin(facing), dx = p.x - placedAt.x, dz = p.z - placedAt.z; return { x: dx * c - dz * sn, z: dx * sn + dz * c }; },
    slotZ: (i) => SLOT_Z(i),
    get active() { return active; },
    get unrolled() { return unrolled; },
    get facing() { return facing; },
    get position() { return placedAt; },
    /** [{slot, speciesId, size, clean}] of the fish on the mat. */
    get fish() { return slots.map((s, i) => s && { slot: i, speciesId: s.id, size: s.size, clean: s.clean }).filter(Boolean); },
    get count() { return slots.filter(Boolean).length; },
    /** Hide immediately (no animation) and clear. */
    clear() { anim = null; removeFish('all', true); root.visible = false; active = false; setUnrolled(0); },
    update,
  };
  return api;
}
