// Three-quarter top-down follow camera ("miniature diorama" look), with modes, focus, zoom and shake.
import * as THREE from 'three';
import { damp, clamp, lerp, angleDamp, noise2 } from './math.js';

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
  const _v = new THREE.Vector3(), _goal = new THREE.Vector3(), _prev = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let followed = null, focus = null, hasPrev = false;
  let trauma = 0, shakeT = 0;
  let shot = null; // cinematic {position, lookAt, fov}
  const cur = { dist: CAMERA_MODES.explore.dist, pitch: CAMERA_MODES.explore.pitch, fov: CAMERA_MODES.explore.fov, yaw: 0, focusW: 0, height: 0.9 };

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
    setMode(mode) { if (CAMERA_MODES[mode]) rig.mode = mode; else console.warn('[camera] unknown mode', mode); if (mode !== 'cinematic') shot = null; },
    /** Cinematic framing: {position:Vector3, lookAt:Vector3, fov?}. Switches to 'cinematic'. */
    setShot(s) { shot = s ? { position: s.position.clone(), lookAt: s.lookAt.clone(), fov: s.fov } : null; rig.mode = 'cinematic'; },
    /** Add trauma 0..1 (gentle: 0.2 small bump, 0.5 big fish). */
    shake(amount = 0.3) { trauma = clamp(trauma + amount, 0, 1); },
    /** Jump instantly to the goal framing (after teleports / scene loads). */
    snap() { rig.update(1 / 60, true); },
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
      cur.yaw = angleDamp(cur.yaw, rig.yaw + m.yawOffset, 1.8 * k, dt);
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
      if (Math.abs(camera.fov - cur.fov) > 0.01) { camera.fov = cur.fov; camera.updateProjectionMatrix(); }
      camera.lookAt(rig.lookTarget);

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

  if (dom) dom.addEventListener('wheel', e => {
    if (!rig.wheelZoom) return;
    e.preventDefault();
    rig.zoom = clamp(rig.zoom * Math.exp(e.deltaY * 0.0012), rig.zoomMin, rig.zoomMax);
  }, { passive: false });

  return rig;
}

