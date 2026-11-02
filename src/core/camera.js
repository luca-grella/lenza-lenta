// Three-quarter top-down follow camera ("miniature diorama" look), with modes, focus, zoom and shake.
import * as THREE from 'three';
import { damp, clamp, lerp, angleDamp, noise2, wrapAngle } from './math.js';

const DEG = Math.PI / 180;
/** Per-mode framing. dist in world units at zoom 1, pitch in degrees above the horizon. */
export const CAMERA_MODES = {
  explore:   { dist: 23, pitch: 50, fov: 33, lead: 1.1, focusW: 0.0,  lambda: 3.0, yawOffset: 0,    height: 0.9 },
  fishing:   { dist: 22, pitch: 47, fov: 33, lead: 0.0, focusW: 0.42, lambda: 1.8, yawOffset: 0,    height: 0.6 },
  boat:      { dist: 26, pitch: 48, fov: 34, lead: 2.2, focusW: 0.0,  lambda: 2.0, yawOffset: 0,    height: 0.5 },
  dialog:    { dist: 9.5, pitch: 30, fov: 34, lead: 0.0, focusW: 0.5,  lambda: 2.2, yawOffset: 0.28, height: 1.3 },
  cinematic: { dist: 14, pitch: 40, fov: 34, lead: 0.0, focusW: 0.0,  lambda: 1.2, yawOffset: 0,    height: 1.0 },
};

/**
 * @param {{camera:THREE.PerspectiveCamera, ctx:any, dom?:HTMLElement}} opts
 */
export function createCameraRig({ camera, ctx, dom }) {
  const _v = new THREE.Vector3(), _goal = new THREE.Vector3(), _prev = new THREE.Vector3(), _prev2 = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let followed = null, focus = null, hasPrev = false;
  let trauma = 0, shakeT = 0;
  let shot = null; // cinematic {position, lookAt, fov}
  // [r2-cinematics] short shots blended OVER the normal framing (the normal camera keeps running underneath,
  // so blending the weight back to 0 always lands exactly on the normal view, whatever the mode did meanwhile)
  let active = null; const queue = [];
  const _sp = new THREE.Vector3(), _sl = new THREE.Vector3(), _st = new THREE.Vector3(), _d = new THREE.Vector3();
  const cur = { portrait: 0, dist: CAMERA_MODES.explore.dist, pitch: CAMERA_MODES.explore.pitch, fov: CAMERA_MODES.explore.fov, yaw: 0, focusW: 0, height: 0.9 };

  const rig = {
    camera,
    /** Base yaw (radians). 0 = camera south of the target (+z) looking north (-z). Input uses this. */
    yaw: 0,
    /** Zoom multiplier on distance, clamped to [zoomMin, zoomMax]. Smoothly applied. */
    zoom: 1,
    zoomMin: 0.7,
    zoomMax: 1.6,
    /** Mouse wheel zoom on desktop. */
    wheelZoom: true,
    mode: 'explore',
    /** Smoothed point the camera looks at (world). Read-only; used by post (tilt-shift focus) and audio listener. */
    lookTarget: new THREE.Vector3(0, 0, 0),
    /** The followed object's (unsmoothed) position. */
    followPos: new THREE.Vector3(),
    /** Extra world offset added to the look target (e.g. for a cutscene nudge). */
    offset: new THREE.Vector3(),
    /** Current effective yaw (base + mode offset). */
    get effectiveYaw() { return cur.yaw; },
    /** Follow an Object3D (its world position). */
    follow(obj) { followed = obj || null; hasPrev = false; },
    get followed() { return followed; },
    /** Look between the followed object and this point (vec3 | Object3D | null). Weight depends on mode (fishing 0.42). */
    setFocus(p) { focus = p || null; },
    get focus() { return focus; },
    /** 'explore'|'fishing'|'boat'|'dialog'|'cinematic'. Transition is smooth. */
    setMode(mode) {
      if (CAMERA_MODES[mode]) rig.mode = mode; else console.warn('[camera] unknown mode', mode);
      if (mode !== 'cinematic') shot = null;
      if (mode === 'dialog') rig.cancelShots('dialog'); // a conversation has its own framing
    },
    /** Cinematic framing: {position:Vector3, lookAt:Vector3, fov?}. Switches to 'cinematic'. */
    setShot(s) { shot = s ? { position: s.position.clone(), lookAt: s.lookAt.clone(), fov: s.fov } : null; rig.mode = 'cinematic'; },
    /** Add trauma 0..1 (gentle: 0.2 small bump, 0.5 big fish). */
    shake(amount = 0.3) { trauma = clamp(trauma + amount, 0, 1); },
    /** Jump instantly to the goal framing (after teleports / scene loads). */
    snap() { rig.cancelShots('snap', true); rig.update(1 / 60, true); },
    /**
     * [r2-cinematics] Play a short shot over the normal camera; returns Promise<'done'|'skipped'|'cancelled'|'timeout'|'dropped'>.
     * spec: { id, target (Object3D|{x,y,z}|fn → either; default the followed object), lookAt (same, default target),
     *   height (added to the look point y, default 0.9), position (explicit camera point, same types; else orbit:)
     *   yaw (radians, rig convention: camera at target + (sin yaw, ·, cos yaw)·dist; default = current view yaw) + yawOffset,
     *   yawTo | yawSpeed (rad/s), dist (default 9), distTo, pitch (deg, default 32), pitchTo, fov, fovTo,
     *   duration (s, the whole shot incl. blend-in, default 2.5), blendIn (0.9), blendOut (0.9), ease ('inOut'|'out'|'linear'),
     *   skippable (true), maxWait (s a queued shot may wait, default 4), maxT (hard cap, default duration+blendOut+3, ≤ 14) }
     * A shot playing → this one is queued (max 2 queued, oldest dropped).
     */
    playShot(spec = {}) {
      return new Promise(resolve => {
        const s = {
          ...spec, resolve, t: 0, waited: 0, w: 0, ending: false, endT: 0, outT: spec.blendOut ?? 0.9,
          duration: clamp(spec.duration ?? 2.5, 0.3, 12), blendIn: clamp(spec.blendIn ?? 0.9, 0.05, 3),
        };
        s.maxT = Math.min(spec.maxT ?? (s.duration + s.outT + (spec.holdWhile ? 12 : 3)), spec.holdWhile ? 20 : 14);
        // the Promise always resolves: if the loop stops for good (no progress for 2 min of wall time) give up
        s.lastP = -1; s.wall = setInterval(() => { const pr = s.t + s.waited; if (pr === s.lastP) finish(s, 'timeout'); s.lastP = pr; }, 120000);
        if (!active) start(s);
        else if (spec.takeOver && !active.ending) takeOver(s);
        else { queue.push(s); while (queue.length > 2) finish(queue.shift(), 'dropped'); }
      });
    },
    /** [r2-cinematics] Tap-to-skip: the current shot (if skippable) blends back fast; queued shots are dropped. */
    skipShot() {
      if (!active) return false;
      while (queue.length) finish(queue.shift(), 'dropped');
      if (active.skippable === false) return false;
      endActive('skipped', 0.45);
      return true;
    },
    /** [r2-cinematics] End every shot (gently, or at once with instant). */
    cancelShots(reason = 'cancelled', instant = false) {
      while (queue.length) finish(queue.shift(), 'dropped');
      if (!active) return;
      if (instant) finish(active, reason); else endActive(reason, 0.5);
    },
    /** [r2-cinematics] Is a shot on screen? */
    get shotActive() { return !!active; },
    /** [r2-cinematics] {id, t, weight, ending, queued} of the current shot, or null. */
    get shotInfo() { return active ? { id: active.id || null, t: active.t, weight: active.w, ending: active.ending, queued: queue.length } : null; },
    /** Project a world point to normalized screen coords (0..1, y down). */
    toScreen(p, out = { x: 0, y: 0, behind: false }) {
      _v.copy(p).project(camera);
      out.x = _v.x * 0.5 + 0.5; out.y = -_v.y * 0.5 + 0.5; out.behind = _v.z > 1;
      return out;
    },
    /** Loop callback (core registers it at order 40). */
    update(dt, instant = false) {
      const m = CAMERA_MODES[rig.mode] || CAMERA_MODES.explore;
      const aspect = camera.aspect || 1;
      // portrait: wider vertical fov, a bit further and higher so the player sees around
      const portrait = clamp((1.15 - aspect) / 0.7, 0, 1);
      cur.portrait = portrait;
      const zoom = clamp(rig.zoom, rig.zoomMin, rig.zoomMax);
      // [Fix] short landscape phones (~390 px tall): come a bit closer so the fisherman is not a 20 px speck
      const shortH = typeof innerHeight === 'number' && aspect > 1.2 && rig.mode !== 'dialog' && rig.mode !== 'cinematic' ? clamp((560 - innerHeight) / 200, 0, 1) : 0;
      const goalDist = m.dist * zoom * lerp(1, 1.04, portrait) * lerp(1, 0.8, shortH);
      const goalPitch = m.pitch + portrait * 4;
      const hfovMin = 27 * DEG; // keep at least this horizontal view in portrait
      const fovForWidth = 2 * Math.atan(Math.tan(hfovMin / 2) / aspect) / DEG;
      const goalFov = shot?.fov || clamp(Math.max(m.fov, fovForWidth), m.fov, 56);
      const k = instant ? 1e9 : 1;
      cur.dist = damp(cur.dist, goalDist, 2.2 * k, dt);
      cur.pitch = damp(cur.pitch, goalPitch, 2.2 * k, dt);
      cur.fov = damp(cur.fov, goalFov, 3 * k, dt);
      // [Fix] dialogue: turn so the two speakers stand side by side on screen, not one behind the other (Rosa's
      // bandana hid the player's hat on her narrow deck); never more than ~50° away from the player's own view
      let yawGoal = rig.yaw + m.yawOffset;
      if (rig.mode === 'dialog' && focus?.isObject3D && followed) {
        focus.getWorldPosition(_v); followed.getWorldPosition(_prev2);
        const dx = _v.x - _prev2.x, dz = _v.z - _prev2.z;
        if (dx * dx + dz * dz > 0.04) {
          const a = Math.atan2(dx, dz);
          const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
          const c1 = wrap(a + Math.PI / 2 - yawGoal), c2 = wrap(a - Math.PI / 2 - yawGoal);
          yawGoal += clamp(Math.abs(c1) < Math.abs(c2) ? c1 : c2, -0.9, 0.9);
        }
      }
      cur.yaw = angleDamp(cur.yaw, yawGoal, 1.8 * k, dt);
      cur.focusW = damp(cur.focusW, focus ? m.focusW : 0, 1.6 * k, dt);
      cur.height = damp(cur.height, m.height, 2 * k, dt);

      // follow position + velocity lead
      if (followed) {
        followed.getWorldPosition(rig.followPos);
        if (hasPrev && dt > 0) { _v.subVectors(rig.followPos, _prev).divideScalar(dt); _v.y = 0; if (_v.length() > 30) _v.set(0, 0, 0); vel.lerp(_v, 1 - Math.exp(-4 * dt)); }
        _prev.copy(rig.followPos); hasPrev = true;
      } else vel.multiplyScalar(Math.exp(-4 * dt));
      _goal.copy(rig.followPos);
      _goal.y += cur.height;
      _goal.addScaledVector(vel, m.lead * 0.33);
      if (focus && cur.focusW > 0.001) {
        const fp = focus.isObject3D ? focus.getWorldPosition(_v) : _v.copy(focus);
        _goal.lerp(fp, cur.focusW);
      }
      _goal.add(rig.offset);

      if (rig.mode === 'cinematic' && shot) {
        rig.lookTarget.lerp(shot.lookAt, instant ? 1 : 1 - Math.exp(-m.lambda * dt));
        if (instant) camera.position.copy(shot.position); else camera.position.lerp(shot.position, 1 - Math.exp(-m.lambda * dt));
      } else {
        const lam = instant ? 1e9 : m.lambda;
        rig.lookTarget.x = damp(rig.lookTarget.x, _goal.x, lam, dt);
        rig.lookTarget.z = damp(rig.lookTarget.z, _goal.z, lam, dt);
        rig.lookTarget.y = damp(rig.lookTarget.y, _goal.y, lam * 0.7, dt);
        const p = cur.pitch * DEG;
        camera.position.set(
          rig.lookTarget.x + Math.sin(cur.yaw) * Math.cos(p) * cur.dist,
          rig.lookTarget.y + Math.sin(p) * cur.dist,
          rig.lookTarget.z + Math.cos(cur.yaw) * Math.cos(p) * cur.dist,
        );
        // keep above terrain
        const h = ctx.world?.heightAt?.(camera.position.x, camera.position.z);
        if (Number.isFinite(h) && camera.position.y < h + 2) camera.position.y = h + 2;
      }
      let fov = cur.fov;
      if (active && !instant) fov = applyShot(dt, fov);
      if (active && active.w > 0) camera.lookAt(_sl); else camera.lookAt(rig.lookTarget);
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

      // shake: smooth noise, quadratic in trauma
      if (trauma > 0) {
        shakeT += dt * 22;
        const s = trauma * trauma;
        camera.rotation.z += noise2(shakeT, 1.7) * 0.02 * s;
        camera.position.x += noise2(shakeT, 9.1) * 0.25 * s;
        camera.position.y += noise2(shakeT, 4.3) * 0.25 * s;
        trauma = Math.max(0, trauma - dt * 1.4);
      }
      camera.updateMatrixWorld();
    },
  };

  // ---------------------------------------------------------------- shots
  const easeF = (e, x) => e === 'linear' ? x : e === 'out' ? 1 - (1 - x) * (1 - x) : 0.5 - 0.5 * Math.cos(Math.PI * x);
  const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const safeCall = f => { try { return !!f(); } catch { return false; } };
  function resolvePoint(t, out) {
    if (typeof t === 'function') t = t();
    if (!t) return null;
    if (t.isObject3D) return t.getWorldPosition(out);
    if (Number.isFinite(t.x) && Number.isFinite(t.z)) return out.set(t.x, Number.isFinite(t.y) ? t.y : 0, t.z);
    return null;
  }
  function start(s) {
    active = s; s.t = 0; s.w = 0;
    s.yaw0 = Number.isFinite(s.yaw) ? s.yaw : cur.yaw + (s.yawOffset || 0);
    ctx.bus?.emit?.('camera:shot', { id: s.id || null, phase: 'start' });
  }
  /** A new shot takes over the one on screen: it starts from where the camera is now (no cut, no trip back out). */
  function takeOver(s) {
    const old = active;
    s.from = { pos: old.lastPos ? old.lastPos.clone() : camera.position.clone(), look: old.lastLook ? old.lastLook.clone() : rig.lookTarget.clone(), w: old.w };
    old.done = true; clearInterval(old.wall); active = null;
    ctx.bus?.emit?.('camera:shot', { id: old.id || null, phase: 'end', reason: 'takeover' });
    try { old.resolve('cancelled'); } catch { /* ignore */ }
    start(s);
  }
  function endActive(reason, outT) {
    const s = active;
    if (!s || s.ending) { if (s && outT < s.outT) { s.outT = outT; s.endT = s.t; s.endW = s.w; s.reason = reason; } return; }
    s.ending = true; s.reason = reason; s.endT = s.t; s.endW = s.w; s.outT = Math.max(0.05, outT ?? s.outT);
  }
  function finish(s, reason) {
    if (!s || s.done) return;
    s.done = true; clearInterval(s.wall);
    const i = queue.indexOf(s); if (i >= 0) queue.splice(i, 1);
    if (active === s) {
      active = null;
      ctx.bus?.emit?.('camera:shot', { id: s.id || null, phase: 'end', reason });
      while (queue.length) { const n = queue.shift(); if (n.waited <= (n.maxWait ?? 4)) { start(n); break; } finish(n, 'dropped'); }
    }
    try { s.resolve(reason); } catch { /* ignore */ }
  }
  /** Blend the current shot over the normal pose (camera.position already holds it); fills _sl (look point). */
  function applyShot(dt, fov) {
    for (const q of queue) q.waited += dt;
    const s = active;
    s.t += dt;
    if (s.t > s.maxT) { finish(s, 'timeout'); _sl.copy(rig.lookTarget); return fov; }
    if (!s.ending && s.t >= s.duration && !(s.holdWhile && safeCall(s.holdWhile))) endActive('done', s.outT);
    if (s.ending) {
      const k = (s.t - s.endT) / s.outT;
      s.w = (s.endW ?? 1) * (1 - sm(k));
      if (k >= 1) { const r = s.reason; finish(s, r === 'done' ? 'done' : r); _sl.copy(rig.lookTarget); return fov; }
    } else s.w = s.from ? lerp(s.from.w, 1, sm(s.t / s.blendIn)) : sm(s.t / s.blendIn);
    const p = easeF(s.ease || 'inOut', clamp(s.t / s.duration, 0, 1));
    const tp = resolvePoint(s.target, _st) || _st.copy(rig.followPos);
    const look = resolvePoint(s.lookAt, _sl) ? _sl : _sl.copy(tp);
    look.y += s.lookHeight ?? s.height ?? 0.9;
    const cp = resolvePoint(s.position, _sp);
    if (!cp) {
      let yaw = s.yaw0;
      if (Number.isFinite(s.yawTo)) yaw = s.yaw0 + wrapAngle(s.yawTo - s.yaw0) * p;
      else if (s.yawSpeed) yaw = s.yaw0 + s.yawSpeed * Math.min(s.t, s.duration);
      // portrait screens are narrow: pull back so the subject keeps some room around it
      const dist = lerp(s.dist ?? 9, s.distTo ?? s.dist ?? 9, p) * (s.portraitScale ?? lerp(1, 1.45, cur.portrait || 0));
      const pitch = lerp(s.pitch ?? 32, s.pitchTo ?? s.pitch ?? 32, p) * DEG;
      _sp.set(tp.x + Math.sin(yaw) * Math.cos(pitch) * dist, tp.y + (s.height ?? 0.9) + Math.sin(pitch) * dist, tp.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    }
    if (s.from) { // taking over another shot: glide from its last framing to ours during the blend-in
      const k = sm(s.t / s.blendIn);
      if (k < 1) { _sp.lerpVectors(s.from.pos, _sp, k); _sl.lerpVectors(s.from.look, _sl, k); }
    }
    (s.lastPos ||= new THREE.Vector3()).copy(_sp); (s.lastLook ||= new THREE.Vector3()).copy(_sl);
    // blend in spherical coordinates round the look point: the camera swings round the player in an arc
    // instead of cutting through the scene in a straight line
    const w = s.w;
    const sph = (from, to) => { _d.subVectors(from, to); const r = Math.max(0.01, _d.length()); return [r, Math.atan2(_d.x, _d.z), Math.asin(clamp(_d.y / r, -1, 1))]; };
    const [r0, y0, p0] = sph(camera.position, rig.lookTarget);
    const [r1, y1, p1] = sph(_sp, _sl);
    _sl.lerpVectors(rig.lookTarget, _sl, w);
    const r = lerp(r0, r1, w), yw = y0 + wrapAngle(y1 - y0) * w, pt = lerp(p0, p1, w);
    camera.position.set(_sl.x + Math.sin(yw) * Math.cos(pt) * r, _sl.y + Math.sin(pt) * r, _sl.z + Math.cos(yw) * Math.cos(pt) * r);
    // never under the ground or the sea
    const h = ctx.world?.heightAt?.(camera.position.x, camera.position.z);
    const floor = Math.max(Number.isFinite(h) ? h + 0.8 : -Infinity, (ctx.world?.waterLevel ?? 0) + 0.6);
    if (camera.position.y < floor) camera.position.y = floor;
    const sf = Number.isFinite(s.fov) ? lerp(s.fov, s.fovTo ?? s.fov, p) : fov;
    return lerp(fov, sf, w);
  }

  if (dom) dom.addEventListener('wheel', e => {
    if (!rig.wheelZoom) return;
    e.preventDefault();
    rig.zoom = clamp(rig.zoom * Math.exp(e.deltaY * 0.0012), rig.zoomMin, rig.zoomMax);
  }, { passive: false });

  return rig;
}

