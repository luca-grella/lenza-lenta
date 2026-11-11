// The fisherman: procedural rig + cozy controller + animation state, exposed as ctx.player.
// Fishing/boat/foraging logic lives in Gameplay; this module only offers clean hooks (see ARCHITECTURE.md).
import * as THREE from 'three';
import { createCharacter, updateRim, CLIP_NAMES } from './rig/index.js';
import { playerLook, HAT_COLORS, ROD_MODELS } from './rig/looks.js';
import * as STR from './rig/strings.js';
import { createMat } from './props/mat.js';
import { makeKnife } from './props/tools.js';

const WALK = 2.6, SLOW = 1.15;               // m/s (cozy: full stick / half stick or Shift)
const RADIUS = 0.35;
/** [Fix] player body + villager body: you no longer walk through the villagers (centres stay this far apart). */
const NPC_GAP = 0.78;
const FISHING = new Set(['cast_windup', 'cast_hold', 'cast_release', 'fish_wait', 'strike', 'reel', 'reel_struggle', 'catch_show', 'catch_happy', 'catch_proud', 'catch_hold', 'fail_shrug']);
/** [r2-animation] Catch chores: state 'cutscene' while they play (no stick), back to idle when they end. */
const CHORES = new Set(['lay_on_mat', 'clean_fish', 'put_in_bucket', 'show_to_cat', 'unroll_mat', 'roll_mat']);
/** Clips that can play on the upper body while seated (dock edge, bench, boat) or walking. */
const UPPER_OK = new Set([...FISHING, 'wave', 'talk', 'eat', 'lay_on_mat', 'show_to_cat', 'put_in_bucket']);
const STATE_OF = (n) => (CHORES.has(n) ? 'cutscene' : FISHING.has(n) ? 'fishing' : n.startsWith('sit') || n === 'stand_up' ? 'sit' : n === 'row' ? 'boat' : n === 'crouch_pick' ? 'forage' : ['pet', 'eat', 'talk', 'sleep'].includes(n) ? n : n === 'wake' ? 'sleep' : null);
const IDLE_VARIANTS = ['idle_look', 'idle_hat', 'idle_yawn'];

export function init(ctx) {
  ctx.i18n?.addStrings?.(STR.it, STR.en);
  const { math } = ctx;
  const save = () => ctx.save?.state || {};

  // ---- look from the save (hat cosmetic, rod) ----
  const look = playerLook(save().player?.gender);
  applyEquip(look, save().equip);
  const ch = createCharacter(ctx, look, { id: 'player' });
  const obj = ch.object;
  ctx.scene.add(obj);
  // [11 nov] man or woman, chosen with the name (first start, Settings › Name): rebuild the body on the same skeleton
  ctx.bus?.on?.('player:gender', ({ gender } = {}) => {
    const lk = playerLook(gender);
    applyEquip(lk, save().equip);
    ch.swapLook(lk);
  });

  // ---- controller state ----
  let facing = 0, facingGoal = 0, speed = 0, turnRate = 0, accel = 0, control = true, state = 'idle';
  let seated = null, seatedIdle = 'sit_idle', autopilot = null, idleT = 0, idleNext = rand(7, 12), saveT = 0;
  let settle = null, seatBack = null;   // short glide into / out of a seat; where to stand up to
  let manualBend = -1, fishState = 'idle', lookOverride = null, faceCamera = false, glanceT = rand(6, 14), glancing = 0;
  const v3 = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3(), camLook = new THREE.Vector3();

  const W = () => ctx.world;
  const groundY = (x, z) => {
    const w = W();
    if (w?.groundY) { const y = w.groundY(x, z); if (Number.isFinite(y)) return y; }
    if (w?.heightAt) return Math.max(w.waterLevel ?? 0, w.heightAt(x, z));
    if (ctx.stage?.heightAt) return Math.max(0, ctx.stage.heightAt(x, z));
    return 0;
  };
  const ground = (x, z) => groundY(x, z);

  function rand(a, b) { return a + Math.random() * (b - a); }

  ctx.bus?.on?.('save:before', () => {
    const sp = save().player;
    if (!sp || seated || !obj.parent) return;
    sp.x = +obj.position.x.toFixed(2); sp.z = +obj.position.z.toFixed(2); sp.facing = +facing.toFixed(3);
  });

  // ---- spawn ----
  function spawnPoint() {
    const s = save().player;
    if (s && Number.isFinite(s.x) && Number.isFinite(s.z)) return { x: s.x, z: s.z, facing: Number.isFinite(s.facing) ? s.facing : 0 };
    const sp = W()?.spawn;
    if (sp && Number.isFinite(sp.x)) return { x: sp.x, z: sp.z, facing: sp.facing || 0 };
    if (ctx.stage?.dummy) return { x: ctx.stage.dummy.position.x, z: ctx.stage.dummy.position.z, facing: 0 };
    return { x: 0, z: 0, facing: 0 };
  }
  function teleport(x, z, f) {
    if (obj.parent !== ctx.scene) { ctx.scene.add(obj); }
    obj.position.set(x, groundY(x, z), z);
    if (Number.isFinite(f)) { facing = facingGoal = f; obj.rotation.y = f; }
    speed = 0; autopilot = null; settle = null;
    if (seated && seated !== 'boat') { seated = null; seatBack = null; if (state === 'sit') state = 'idle'; ch.play('locomotion', { fade: 0.1 }); }
    ch.resetSprings();
    ctx.cameraRig?.snap?.();
  }
  { const s = spawnPoint(); obj.position.set(s.x, groundY(s.x, s.z), s.z); facing = facingGoal = s.facing; obj.rotation.y = facing; }

  // ---- animation routing ----
  ch.animator.defaultFor = () => (seated ? (seated === 'boat' ? 'sit_boat' : seatedIdle) : 'locomotion');
  ch.animator.onEvent = (evt, clip, data) => {
    if (evt === 'step') footstep(data);
    ctx.bus?.emit('player:anim', { event: evt, clip, ...data });
  };

  function resolveName(name) {
    if (name === 'idle') return seated ? (seated === 'boat' ? 'sit_boat' : seatedIdle) : 'locomotion';
    if (name === 'sit_idle' && (seated === 'boat' || state === 'boat')) return 'sit_boat';
    if (name === 'catch_happy' && seated) return 'catch_show';
    return name;
  }

  let playToken = 0;
  const ONE_SHOT_STATES = new Set(['talk', 'pet', 'eat', 'forage', 'cutscene']);
  /** Play an animation: {loop, fade, speed, onEnd, next, layer, onEvent}. Unknown names are ignored. Returns a Promise. */
  function play(name, o = {}) {
    if (autopilot && !o._auto) { finishAutopilot(true); }
    const n = resolveName(name);
    if (!ch.has(n)) { console.warn('[player] unknown animation', name); return Promise.resolve(false); }
    const opts = { ...o };
    const moving = speed > 0.4 && !seated;
    if (!opts.layer && UPPER_OK.has(n) && (seated || (moving && (n === 'wave' || n === 'talk')))) opts.layer = 'upper';
    if (opts.layer !== 'upper') {
      const st = STATE_OF(n);
      if (st && !o._keepState) state = seated === 'boat' && st !== 'fishing' ? 'boat' : st;
      if (n === 'locomotion') state = speed > 0.1 ? 'walk' : 'idle';
    }
    faceCamera = n === 'catch_show' || n === 'catch_happy' || n === 'catch_proud';
    idleT = 0;
    if (opts.layer !== 'upper' && n !== 'locomotion' && !seated) ch.animator.stopUpper(Math.min(0.2, opts.fade ?? 0.2));
    const token = ++playToken;
    const res = ch.play(n, opts);
    // one-shot chores (talk, pet, eat, crouch_pick) hand the state back when they end, unless something newer took over
    const st = STATE_OF(n);
    if (!opts.loop && !opts.next && opts.layer !== 'upper' && ONE_SHOT_STATES.has(st)) {
      Promise.resolve(res).then(() => { if (token === playToken && state === st) state = seated === 'boat' ? 'boat' : seated ? 'sit' : 'idle'; });
    }
    return res;
  }

  // ---- footsteps by surface ----
  function surfaceAt(x, z) {
    const w = W();
    const t = w?.surfaceType?.(x, z) || w?.groundType?.(x, z);
    if (t) return t;
    const gy = groundY(x, z), h = w?.heightAt ? w.heightAt(x, z) : (ctx.stage?.heightAt?.(x, z) ?? 0);
    if (gy - h > 0.08) return 'wood';
    const zone = w?.zoneAt?.(x, z);
    if (zone === 'palm_islet' || zone === 'turtle_isle') return 'sand';
    if (h < 0.9) return 'sand';
    return 'grass';
  }
  function footstep(d) {
    if (seated) return;
    const s = surfaceAt(obj.position.x, obj.position.z);
    const name = s === 'wood' ? 'footstep_wood' : s === 'grass' ? 'footstep_grass' : 'footstep_sand';
    const sp = d?.speed ?? speed;
    ctx.audio?.sfx?.(name, { vol: 0.28 + 0.22 * Math.min(1, sp / WALK), pitch: 0.94 + Math.random() * 0.12 + (d?.foot === 'R' ? 0.03 : 0), pos: { x: obj.position.x, z: obj.position.z } });
  }

  // ---- outfit ----
  function applyEquip(lk, equip = {}) {
    const hatId = equip?.hat;
    const cos = hatId && (ctx.data?.get?.(hatId) || (ctx.data?.cosmetics || []).find(c => c.id === hatId));
    const hc = cos || HAT_COLORS[hatId];
    if (hc) { lk.hat.color = hc.color || lk.hat.color; lk.hat.band = hc.band || lk.hat.band; }
    const rodId = equip?.rod;
    const rm = (rodId && (ctx.data?.get?.(rodId)?.model || ROD_MODELS[rodId])) || null;
    if (rm) lk.rod = { ...lk.rod, ...rm, id: rodId, nodes: rodId === 'rod_bamboo' };
  }
  function setOutfit(o = {}) {
    if (o.hat || o.hatColor || o.hatBand) {
      const hc = HAT_COLORS[o.hat] || (o.hat && ctx.data?.get?.(o.hat)) || {};
      look.hat.color = o.hatColor || hc.color || look.hat.color;
      look.hat.band = o.hatBand || hc.band || look.hat.band;
      ch.recolor('hat');
    }
    if (o.rod) {
      const rm = typeof o.rod === 'object' ? o.rod : (ctx.data?.get?.(o.rod)?.model || ROD_MODELS[o.rod]);
      if (rm) { look.rod.nodes = o.rod === 'rod_bamboo'; ch.setRodModel(rm); }
    }
    for (const k of ['shirt', 'pants', 'skin']) if (o[k]) {
      if (k === 'skin') look.skin = o.skin; else Object.assign(look[k], typeof o[k] === 'string' ? { color: o[k] } : o[k]);
      for (const p of ['torso', 'arms', 'legs', 'head', 'hands']) ch.recolor(p);
    }
    const st = save(); if (st.player) { st.player.outfit = { ...(st.player.outfit || {}), ...o }; ctx.save?.commit?.(); }
  }
  ctx.bus?.on('inventory:change', () => { const e = save().equip; if (e?.rod && e.rod !== look.rod?.id) { look.rod.id = e.rod; setOutfit({ rod: e.rod }); } });
  ctx.bus?.on('fishing:state', (e) => { fishState = e?.state || 'idle'; });
  ctx.bus?.on('save:loaded', () => {
    const s = spawnPoint(); teleport(s.x, s.z, s.facing);
    applyEquip(look, save().equip); ch.recolor('hat'); if (look.rod) ch.setRodModel(look.rod);
  });

  // ---- sitting / boat ----
  function resolvePoi(p) {
    if (typeof p === 'string') p = W()?.poi?.(p);
    if (!p) return null;
    if (Array.isArray(p)) p = { x: p[0], z: p[1] };
    return p;
  }
  /**
   * Walk to a seat and sit. poi: id | {x, z, y?, facing?, seatY?, kind?:'bench'|'edge'}. y/seatY = seat surface height
   * (bench top, or the deck for a dock edge). Resolves true once seated, false if cancelled.
   * [Fix] The seat point of a bench lies inside the bench collider, so the old autopilot pushed against the bench for up
   * to 6 s ("Siediti" did nothing): now the player walks to a free approach point (in front of a bench, just behind a
   * dock edge), turns, and glides onto the seat while sit_down plays. A stall (blocked) also ends the approach.
   */
  function sitAt(p) {
    p = resolvePoi(p);
    if (!p || seated === 'boat') return Promise.resolve(false);
    if (seated) { seated = null; settle = null; }
    const x = p.x, z = p.z;
    const f = Number.isFinite(p.facing) ? p.facing : Number.isFinite(p.rot) ? p.rot : facing;
    const kind = p.kind === 'bench' ? 'bench' : 'edge';
    const seatY = Number.isFinite(p.seatY) ? p.seatY : Number.isFinite(p.y) ? p.y : groundY(x, z) + (kind === 'bench' ? 0.42 : 0);
    const fx = Math.sin(f), fz = Math.cos(f);
    const off = kind === 'bench' ? 0.52 : -0.32;           // in front of the bench / on the planks behind the edge
    const ap = { x: x + fx * off, z: z + fz * off };
    seatedIdle = 'sit_idle';
    if (autopilot) { const a = autopilot; autopilot = null; a.cancel?.(); }
    return new Promise(resolve => {
      const sit = () => {
        facingGoal = f;
        seated = kind; state = 'sit'; speed = 0;
        seatBack = { x: ap.x, z: ap.z };
        settle = { from: obj.position.clone(), to: new THREE.Vector3(x, seatY, z), t: 0, dur: 0.45 };
        play('sit_down', { fade: 0.2, next: 'sit_idle', _auto: true }).then(() => resolve(true));
      };
      const d = Math.hypot(ap.x - obj.position.x, ap.z - obj.position.z);
      if (d > 9) teleport(ap.x, ap.z, f);
      if (d < 0.2 || d > 9 || !control) { sit(); return; }
      autopilot = { x: ap.x, z: ap.z, then: sit, cancel: () => resolve(false), t: 0, stall: 0, last: d };
    });
  }
  function finishAutopilot(snap) {
    const a = autopilot; autopilot = null; if (!a) return;
    if (snap) a.then();   // the seat glide (settle) takes the player from where they are onto the seat
  }
  /** Stand up from a seat (bench / dock edge). Resolves when standing. */
  function standUp() {
    if (!seated || seated === 'boat') { if (state === 'sleep') { state = 'idle'; } return Promise.resolve(true); }
    ch.animator.stopUpper(0.2);
    const back = seatBack;
    // [10 nov] from a dock edge the legs come back up over the edge: without a lift they swept through the planks
    // ("sprofonda" when standing up). The body rises in a short arc while it slides back onto the deck.
    const edge = seated === 'edge';
    if (back) settle = { from: obj.position.clone(), to: new THREE.Vector3(back.x, groundY(back.x, back.z), back.z), t: edge ? 0 : -0.25, dur: 0.75, arc: edge ? 0.3 : 0 };
    const p = play('stand_up', { fade: 0.2, _auto: true });
    return p.then(() => {
      seated = null; state = 'idle'; seatBack = null;
      if (settle && settle.t < settle.dur) { obj.position.copy(settle.to); settle = null; }
      obj.position.y = groundY(obj.position.x, obj.position.z);
      return true;
    });
  }
  /** Board a boat: {object, seat?:Object3D, rowing?:number}. The player rides along parented to the seat. */
  function board(boat) {
    const seat = boat?.seat || boat?.object || boat?.group;
    if (!seat?.isObject3D) return;
    autopilot = null; seated = 'boat'; state = 'boat';
    seat.add(obj); obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); facing = facingGoal = 0;
    speed = 0; ch.resetSprings();
    play('sit_boat', { fade: 0.3, _auto: true });
  }
  function leaveBoat() {
    if (seated !== 'boat') return;
    const wp = obj.getWorldPosition(new THREE.Vector3());
    const wq = obj.getWorldQuaternion(new THREE.Quaternion());
    ctx.scene.add(obj);
    obj.position.copy(wp);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(wq);
    facing = facingGoal = Math.atan2(f.x, f.z); obj.rotation.set(0, facing, 0);
    seated = null; state = 'idle';
    ch.resetSprings();
    play('locomotion', { fade: 0.25, _auto: true });
  }

  // ---- [r2-animation] catch mat, knife and the catch chores ----
  const mat = createMat(ctx);
  const knife = makeKnife(); knife.visible = false;
  knife.scale.setScalar(1 / (look.height || 1)); knife.rotation.x = -0.27;
  ch.bones.prop_R.add(knife);
  let chore = null;          // {name, look, back, finish(ok), done}
  const _w = new THREE.Vector3();
  const heldWorld = () => (ch.held ? ch.held.getWorldPosition(new THREE.Vector3()) : ch.handWorld('R', new THREE.Vector3()));
  const angleTo = (p) => Math.atan2(p.x - obj.position.x, p.z - obj.position.z);
  const sfx = (n, o = {}) => ctx.audio?.sfx?.(n, { pos: { x: obj.position.x, z: obj.position.z }, ...o });
  /** A fish dropping into the bucket (and gone). */
  let dropping = null;

  /**
   * Run a catch chore. Every chore is short (2.3-5.2 s), turns the player toward its target and back, and can be skipped
   * with cancelChore() (its effect is applied at once). Names and options:
   *   'unroll_mat'   {pos?, facing?}            places + unrolls the mat (default spot: mat.spotFor(), on the left)
   *   'lay_on_mat'   {speciesId, size}          the fish in the hands (holdFish) goes onto the next slot → {slot}
   *   'clean_fish'   {slot?}                    kneel, knife strokes, flip, rinse; then mat.markClean(slot) → {slot}
   *   'put_in_bucket'{slot?}                    the held fish (or the one taken from `slot`) drops into the bucket
   *   'show_to_cat'  {target, give?}            crouch and offer the held fish toward target (Vector3|Object3D); give → {fish}
   *   'roll_mat'     {}                         rolls the mat up (fish models on it are cleared)
   * Resolves {ok:true|false(interrupted), ...}. Bus: 'player:anim' {event, clip} for every clip event.
   */
  function doChore(name, o = {}) {
    if (chore) cancelChore();
    if (!CHORES.has(name)) return Promise.resolve({ ok: false });
    const res = { ok: false };
    const c = { name, look: null, back: Number.isFinite(o.backTo) ? o.backTo : facing, fired: new Set(), res };   // [r2-playtest] backTo: face this way when done
    const ev = {};
    const once = (k, fn) => (ev[k] = (e) => { if (c.fired.has(k + (e?.t ?? ''))) return; c.fired.add(k + (e?.t ?? '')); fn(e); });
    let target = null, onFinish = () => {};
    const seatedNow = !!seated;
    if (name === 'unroll_mat') {
      const sp = o.pos ? { x: o.pos.x, z: o.pos.z } : mat.spotFor(obj.position, facing);
      const f = Number.isFinite(o.facing) ? o.facing : facing;
      if (mat.active) mat.clear();
      target = new THREE.Vector3(sp.x, obj.position.y, sp.z);
      const doPlace = () => { if (c.placed) return; c.placed = true; mat.place(sp, f, { rolled: true }); mat.unroll(0.95); sfx('page_turn', { vol: 0.35, pitch: 0.7 }); };
      once('place', doPlace);
      onFinish = () => { doPlace(); if (mat.unrolled < 1) { mat.place(sp, f); } };
    } else if (name === 'lay_on_mat') {
      if (!mat.active) { const sp = mat.spotFor(obj.position, facing); mat.place(sp, facing); }
      const slot = mat.nextSlot();
      target = mat.slotWorld(slot);
      const release = () => {
        if (c.released) return; c.released = true;
        const from = heldWorld();
        ch.holdFish(null);
        if (o.speciesId) res.slot = mat.addFish(o.speciesId, o.size, { from });
        sfx('splash_small', { vol: 0.12, pitch: 1.6 });
      };
      once('release', release);
      once('pat', () => sfx('ui_tap', { vol: 0.25, pitch: 0.6 }));
      onFinish = release;
    } else if (name === 'clean_fish') {
      const slot = Number.isInteger(o.slot) ? o.slot : mat.lastSlot();
      if (!mat.active || slot < 0) return Promise.resolve({ ok: false, reason: 'no-fish' });
      res.slot = slot;
      target = mat.slotWorld(slot);
      const at = () => mat.slotWorld(slot, _w);
      once('knife_on', () => { knife.visible = true; });
      ev.stroke = () => { mat.fx.burst(at(), { n: 4, color: 0xeef4f4, size: 0.007, speed: 0.5, up: 0.9, floor: at().y - 0.03 }); sfx('reel_click', { vol: 0.2, pitch: 1.7 }); };
      once('flip', () => { mat.flipFish(slot); sfx('splash_small', { vol: 0.1, pitch: 1.8 }); });
      once('knife_off', () => { knife.visible = false; });
      const rinse = () => { if (c.rinsed) return; c.rinsed = true; mat.fx.burst(at().add(new THREE.Vector3(0, 0.12, 0)), { n: 16, speed: 0.55, up: 0.5, size: 0.011, floor: at().y - 0.03 }); sfx('splash_small', { vol: 0.35, pitch: 1.3 }); };
      once('rinse', rinse);
      onFinish = (ok) => { knife.visible = false; if (!ok) c.rinsed = true; mat.markClean(slot); };
    } else if (name === 'put_in_bucket') {
      if (!ch.held && Number.isInteger(o.slot)) {
        const t = mat.takeFish(o.slot);
        if (t) { c.owned = t.inst; ch.holdFish(t.inst.object); }
      }
      target = mat.active ? mat.bucketWorld() : new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).add(obj.position);
      const drop = () => {
        if (c.dropped) return; c.dropped = true;
        const held = ch.held; const from = heldWorld();
        ch.holdFish(null);
        if (held && mat.active) {
          ctx.scene.add(held); held.position.copy(from);
          dropping = { o: held, owned: c.owned, from, to: mat.bucketWorld(), t: 0 };
        } else c.owned?.dispose?.();
        ctx.bus?.emit?.('mat:bucket', { speciesId: o.speciesId || null });
      };
      once('drop', drop);
      onFinish = drop;
    } else if (name === 'show_to_cat') {
      const tp = o.target?.isObject3D ? o.target.getWorldPosition(new THREE.Vector3()) : o.target;
      target = tp ? new THREE.Vector3(tp.x, tp.y ?? obj.position.y, tp.z) : null;
      const offer = () => {
        if (c.offered) return; c.offered = true;
        ctx.bus?.emit?.('player:offer', { target: o.target || null });
        if (o.give && ch.held) { res.fish = ch.held; ch.holdFish(null); }
      };
      once('offer', offer);
      onFinish = offer;
    } else if (name === 'roll_mat') {
      if (!mat.active) return Promise.resolve({ ok: false, reason: 'no-mat' });
      target = mat.position.clone(); target.y = obj.position.y;
      const roll = () => { if (c.rolled) return; c.rolled = true; mat.roll(1.1); sfx('page_turn', { vol: 0.3, pitch: 0.6 }); };
      once('roll', roll);
      onFinish = (ok) => { if (!ok) mat.clear(); else roll(); };
    }
    // line up beside the slot (short glide along the mat), so the hands land on the right fish
    if (!seatedNow && mat.active && (name === 'lay_on_mat' || name === 'clean_fish') && Number.isInteger(res.slot ?? (name === 'lay_on_mat' ? mat.nextSlot() : -1))) {
      const slot = res.slot ?? mat.nextSlot();
      const lp = mat.toLocal(obj.position);
      const lx = Math.sign(lp.x || -1) * Math.min(Math.abs(lp.x), name === 'clean_fish' ? 0.66 : 0.7);
      const to = mat.toWorld(lx, mat.slotZ(slot) - 0.06);
      const w = W();
      const r = w?.resolveMove ? w.resolveMove(obj.position, { x: to.x, z: to.z }, 0.2) : to;
      if (r && Math.hypot(r.x - obj.position.x, r.z - obj.position.z) < 0.9) {
        settle = { from: obj.position.clone(), to: new THREE.Vector3(r.x, groundY(r.x, r.z), r.z), t: 0, dur: 0.5 };
        target = name === 'clean_fish' ? mat.slotWorld(slot) : target;
        const face = mat.toWorld(0, mat.slotZ(slot)); target = new THREE.Vector3(face.x, target.y, face.z);
        c.from = settle.from.clone();
        facingGoal = Math.atan2(face.x - r.x, face.z - r.z);
      }
    }
    if (target && !seatedNow) { if (!settle) facingGoal = angleTo(target); c.look = target.clone().setY(target.y + 0.05); }
    c.finish = (ok) => {
      if (c.ended) return; c.ended = true;
      onFinish(ok);
      knife.visible = false;
      if (chore === c) chore = null;
      if (o.faceBack !== false && !seatedNow) facingGoal = c.back;
      if (c.from && o.stepBack !== false && !seated) settle = { from: obj.position.clone(), to: c.from, t: 0, dur: 0.45 };
      res.ok = ok;
    };
    chore = c;
    return new Promise(resolve => {
      play(name, { fade: 0.22, onEvent: ev }).then(ok => { c.finish(!!ok); resolve(res); });
      c.resolveNow = () => resolve(res);
    });
  }
  function cancelChore() {
    const c = chore; if (!c) return false;
    c.finish(false);
    if (state === 'cutscene') state = seated ? 'sit' : 'idle';
    play(c.name === 'show_to_cat' ? 'catch_hold' : 'idle', { fade: 0.2 });
    return true;
  }
  function choreUpdate(dt) {
    mat.update(dt);
    if (knife.visible && ch.animator.current !== 'clean_fish') knife.visible = false;
    if (dropping) {
      const d = dropping; d.t += dt;
      const k = Math.min(1, d.t / 0.32);
      d.o.position.lerpVectors(d.from, d.to, k); d.o.position.y += Math.sin(k * Math.PI) * 0.08 - k * 0.12;
      d.o.rotation.x += dt * 6;
      if (k >= 1) {
        dropping = null;
        mat.fx.burst(d.to, { n: 12, speed: 0.6, up: 1.1, size: 0.012, floor: d.to.y - 0.25 });
        sfx('splash_small', { vol: 0.4, pitch: 1.2 });
        d.o.removeFromParent(); d.owned?.dispose?.();
      }
    }
    if (mat.active && obj.position.distanceTo(mat.position) > 60) mat.clear();
  }

  // ---- per-frame ----
  function update(dt, t) {
    updateRim(ctx);
    const input = ctx.input;
    const free = !seated && !autopilot && control && (state === 'idle' || state === 'walk');
    const base = ch.animator.current;
    let goal = 0;
    let dirX = Math.sin(facing), dirZ = Math.cos(facing);
    if (autopilot) {
      autopilot.t += dt;
      const dx = autopilot.x - obj.position.x, dz = autopilot.z - obj.position.z, d = Math.hypot(dx, dz);
      // progress check: blocked by a collider/edge for 0.3 s (or 4 s in all) ends the approach where we are
      if (d < autopilot.last - 0.03) { autopilot.last = d; autopilot.stall = 0; } else autopilot.stall += dt;
      if (d < 0.12 || autopilot.t > 4 || (autopilot.stall > 0.3 && autopilot.t > 0.4)) finishAutopilot(true);
      else { facingGoal = Math.atan2(dx, dz); goal = Math.min(SLOW, d * 2.2 + 0.3); dirX = dx / d; dirZ = dz / d; }
    } else if (free && input?.enabled !== false) {
      const m = input?.move || { x: 0, z: 0, mag: 0 };
      if (m.mag > 0.08) {
        goal = m.mag <= 0.55 ? SLOW * (m.mag / 0.55) : SLOW + (WALK - SLOW) * ((m.mag - 0.55) / 0.45);
        goal = Math.max(0.45, goal);
        facingGoal = Math.atan2(m.x, m.z);
        if (base !== 'locomotion') play('locomotion', { fade: 0.2 });
      }
    }
    // turning: quick on the spot, gentler while walking fast
    const prevF = facing;
    const turnL = chore ? 5.5 : speed < 0.3 ? 9 : 11 - speed * 1.5;
    if (faceCamera && ctx.camera) { const c = ctx.camera.position; facingGoal = Math.atan2(c.x - obj.getWorldPosition(v3).x, c.z - v3.z); }
    if (seated !== 'boat') facing = math.angleDamp(facing, facingGoal, faceCamera ? 4 : turnL, dt);
    turnRate = dt > 0 ? math.wrapAngle(facing - prevF) / dt : 0;
    // slow down while turning sharply (no moonwalking)
    const turnK = 1 - Math.min(0.7, Math.abs(math.wrapAngle(facingGoal - facing)) / 2.4);
    const prevSpeed = speed;
    speed = math.damp(speed, goal * turnK, goal > speed ? 4.5 : 7, dt);
    if (speed < 0.01) speed = 0;
    accel = dt > 0 ? (speed - prevSpeed) / dt : 0;

    let moved = 0;
    if (!seated && speed > 0) {
      const mx = autopilot ? dirX : Math.sin(facing), mz = autopilot ? dirZ : Math.cos(facing);
      from.copy(obj.position);
      to.set(from.x + mx * speed * dt, from.y, from.z + mz * speed * dt);
      let nx = to.x, nz = to.z;
      const w = W();
      if (w?.resolveMove) { const r = w.resolveMove(from, to, RADIUS); if (r) { nx = r.x; nz = r.z; } }
      else if (ctx.stage?.heightAt && ctx.stage.water) {   // placeholder island: don't walk into the sea
        if (ctx.stage.heightAt(nx, nz) < 0.02 && ctx.stage.heightAt(from.x, from.z) >= 0.02) { nx = from.x; nz = from.z; }
      }
      const pushed = npcPush(nx, nz);
      if (pushed) {
        // slide round the villager; the slide itself must respect the terrain/colliders, else stay put
        const r2 = w?.resolveMove ? w.resolveMove(from, pushed, RADIUS) : pushed;
        if (!npcPush(r2.x, r2.z, 0.03)) { nx = r2.x; nz = r2.z; } else if (!npcPush(from.x, from.z, 0.03)) { nx = from.x; nz = from.z; }
      }
      moved = Math.hypot(nx - from.x, nz - from.z);
      obj.position.x = nx; obj.position.z = nz;
    } else if (!seated && !settle && (state === 'idle' || state === 'walk')) {
      // a villager walking into a player who stands still nudges them aside (never through a wall or into the sea)
      const pushed = npcPush(obj.position.x, obj.position.z);
      if (pushed) {
        const w = W();
        const k = Math.min(1, dt * 8);
        const tx = obj.position.x + (pushed.x - obj.position.x) * k, tz = obj.position.z + (pushed.z - obj.position.z) * k;
        const r = w?.resolveMove ? w.resolveMove(obj.position, { x: tx, z: tz }, RADIUS) : { x: tx, z: tz };
        obj.position.x = r.x; obj.position.z = r.z;
      }
    }
    if (settle) {   // glide onto / off a seat (smoothstep), independent of colliders
      settle.t += dt;
      const k = Math.max(0, Math.min(1, settle.t / settle.dur)), e = k * k * (3 - 2 * k);
      obj.position.lerpVectors(settle.from, settle.to, e);
      if (settle.arc) obj.position.y += settle.arc * Math.sin(Math.PI * k);
      if (k >= 1) settle = null;
    }
    // safety net: seated on a bench/edge with nobody (Systems) owning the stand-up, the stick stands up
    if (seated && seated !== 'boat' && state === 'sit' && !settle && control && !ctx.systems?.interact?.sitting && (ctx.input?.move?.mag || 0) > 0.5 && ch.animator.current === 'sit_idle') standUp();
    if (!seated && !settle) {
      const gy = groundY(obj.position.x, obj.position.z);
      obj.position.y = Math.abs(gy - obj.position.y) > 1.5 ? gy : math.damp(obj.position.y, gy, 16, dt);
      obj.rotation.y = facing;
    } else if (seated !== 'boat') obj.rotation.y = facing;
    const animSpeed = dt > 0 ? Math.min(speed, moved / dt * 1.05 + 0.15) : 0;
    ch.animator.setSpeed(seated ? 0 : animSpeed);
    if (!seated && !autopilot && (state === 'idle' || state === 'walk')) state = animSpeed > 0.1 ? 'walk' : 'idle';

    // ---- idle variants after standing still for a while ----
    if (free && base === 'locomotion' && speed < 0.05) {
      idleT += dt;
      if (idleT > idleNext) {
        idleT = 0; idleNext = rand(9, 16);
        const night = ctx.time?.phase === 'night' || ctx.time?.phase === 'dawn';
        const pick = Math.random() < (night ? 0.55 : 0.25) ? 'idle_yawn' : IDLE_VARIANTS[Math.random() < 0.55 ? 0 : 1];
        play(pick, { fade: 0.35, _keepState: true });
      }
    } else if (base === 'locomotion') idleT = 0;

    // ---- look target ----
    lookTarget(dt);

    // ---- rod bend: Gameplay may drive it (rod.setBend), else derived from the fishing state ----
    if (manualBend >= 0) manualBend -= dt;
    else {
      const up = ch.animator.upperName || base;
      let b = 0;
      if (fishState === 'reel' || up === 'reel' || up === 'reel_struggle') b = up === 'reel_struggle' ? 0.85 + Math.sin(t * 9) * 0.12 : 0.42 + Math.sin(t * 5) * 0.06;
      else if (fishState === 'strike' || up === 'strike') b = 0.75;
      else if (fishState === 'bite') b = 0.25 + Math.max(0, Math.sin(t * 14)) * 0.2;
      else if (fishState === 'wait') b = 0.06;
      ch.rod.setBend(b);
      const f = ctx.cameraRig?.focus;
      ch.rod.setPull(b > 0 && f ? f : null);
    }

    choreUpdate(dt);
    ch.update(dt, { ground: seated ? null : ground, speed: animSpeed, turnRate: seated ? 0 : turnRate, accel: seated ? 0 : accel });

    // ---- persist position now and then (and right before every save write) ----
    saveT += dt;
    if (saveT > 3 && !seated) {
      saveT = 0;
      const sp = save().player;
      if (sp && (Math.abs((sp.x ?? 1e9) - obj.position.x) > 0.3 || Math.abs((sp.z ?? 1e9) - obj.position.z) > 0.3)) {
        sp.x = +obj.position.x.toFixed(2); sp.z = +obj.position.z.toFixed(2); sp.facing = +facing.toFixed(3);
        ctx.save.commit?.();
      }
    }
  }

  /** Where x,z would go to keep NPC_GAP from every visible villager (null when no one is that close). slack: tolerance. */
  function npcPush(x, z, slack = 0) {
    const list = ctx.npcs?.list;
    if (!list?.length) return null;
    let px = x, pz = z, hit = false;
    for (let it = 0; it < 2; it++) {
      for (const n of list) {
        const o = n.object;
        if (!o?.visible) continue;
        const dx = px - o.position.x, dz = pz - o.position.z, d = Math.hypot(dx, dz);
        if (d >= NPC_GAP - slack) continue;
        if (Math.abs(o.position.y - obj.position.y) > 1.6) continue;   // up the lighthouse, on a deck above...
        hit = true;
        const ux = d > 1e-4 ? dx / d : -Math.sin(facing), uz = d > 1e-4 ? dz / d : -Math.cos(facing);
        px = o.position.x + ux * NPC_GAP; pz = o.position.z + uz * NPC_GAP;
      }
    }
    return hit ? { x: px, z: pz } : null;
  }

  function lookTarget(dt) {
    const up = ch.animator.upperName || ch.animator.current;
    if (lookOverride) { ch.setLook(lookOverride, 1); return; }
    if (chore?.look) { ch.setLook(chore.look, 0.9); return; }
    if (FISHING.has(up)) {
      if ((up === 'catch_show' || up === 'catch_hold' || up === 'catch_happy' || up === 'catch_proud') && ch.held) { ch.setLook(ch.socket, 0.9); return; }
      const f = ctx.cameraRig?.focus;
      if (f) { ch.setLook(f, 1); return; }
      v3.set(Math.sin(facing) * 6, 0, Math.cos(facing) * 6).add(obj.position); ch.setLook(v3.clone(), 0.6); return;
    }
    // villagers nearby
    let best = null, bd = 4.5;
    const list = ctx.npcs?.list || [];
    for (const n of list) {
      const o = n.object; if (!o || !o.visible) continue;
      const d = o.position.distanceTo(obj.position);
      if (d < bd) { bd = d; best = n.headObject || o; }
    }
    if (best) { ch.setLook(best, 0.9); glancing = 0; return; }
    // an occasional glance at the camera while idling
    glanceT -= dt;
    if (glanceT < 0 && speed < 0.05 && !seated) { glancing = rand(1.5, 2.5); glanceT = rand(10, 20); }
    if (glancing > 0 && ctx.camera) { glancing -= dt; camLook.copy(ctx.camera.position); ch.setLook(camLook, 0.55); return; }
    ch.setLook(null);
  }

  ctx.loop.add(update, ctx.ORDER?.actors ?? 20);

  const api = {
    object: obj,
    character: ch,
    get position() { return obj.position; },
    get facing() { return facing; },
    set facing(a) { facing = facingGoal = a; obj.rotation.y = a; },
    get state() { return state; },
    set state(s) { setState(s); },
    get seated() { return seated; },
    get speed() { return speed; },
    get control() { return control; },
    rod: ch.rod,
    play,
    /** Freeze/unfreeze player movement (animations keep playing). */
    setControl(v) { control = !!v; if (!control) speed = Math.min(speed, 0.0); },
    /** Gameplay state hint: 'idle' returns to free walking (unless seated). */
    setState,
    /** Turn toward an angle (0 = +z). instant=true snaps. */
    setFacing(a, instant = false) { facingGoal = a; if (instant) { facing = a; obj.rotation.y = a; } },
    face(a) { facingGoal = a; },
    faceTo(x, z) { facingGoal = Math.atan2(x - obj.position.x, z - obj.position.z); },
    /** Look at a world point / Object3D (null → automatic). */
    lookAt(p) { lookOverride = p || null; },
    sitAt, standUp, board, leaveBoat,
    holdFish: (m) => ch.holdFish(m),
    setOutfit,
    teleport: (x, z, f) => teleport(x, z, f),
    /** World position of a palm ('L'|'R') — e.g. for oars. */
    handWorld: (s, out) => ch.handWorld(s, out),
    /** Head bone (for look-at targets of other actors). */
    headObject: ch.bones.head,
    clips: () => CLIP_NAMES(),
    /** [r2-animation] The catch mat (see src/actors/props/mat.js and docs/CHANGES.md). */
    mat,
    /** [r2-animation] Run a catch chore with its props and fish hand-off: see doChore below. Resolves {ok, slot?, fish?}. */
    chore: (name, o) => doChore(name, o),
    /** [r2-animation] Skip the running chore: its effect happens at once (fish on the mat, mat unrolled...). */
    cancelChore: () => cancelChore(),
    get choreName() { return chore?.name || null; },
    get knife() { return knife; },
    update,
  };
  // rod.setBend from Gameplay takes over the automatic bend for a while
  const setBend = ch.rod.setBend;
  api.rod = Object.create(ch.rod, {
    setBend: { value: (v) => { manualBend = 0.5; setBend(v); } },
    setPull: { value: (p) => { manualBend = 0.5; ch.rod.setPull(p); } },
    tipWorld: { value: (out) => ch.rod.tipWorld(out) },
  });

  function setState(s) {
    if (!s) return;
    if (s === 'idle') {
      if (autopilot) { const a = autopilot; autopilot = null; a.cancel?.(); }
      if (seated) { if (ch.animator.upperName) ch.animator.stopUpper(0.3); if (seated !== 'boat') state = 'sit'; else state = 'boat'; return; }
      const cur = ch.animator.current;
      const def = cur && cur !== 'locomotion' ? ch.animator.lib[cur]?.def : null;
      state = 'idle';
      faceCamera = false;
      if (def && (def.loop || def.hold || def.next)) play('locomotion', { fade: 0.35 });
      return;
    }
    if (s === 'boat' && seated !== 'boat') { state = 'boat'; return; }
    state = s;
  }

  return api;
}

export default { init };
