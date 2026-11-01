// Procedural animation layers applied AFTER the mixer each frame: analytic two-bone IK (feet on uneven
// ground, left hand on the reel crank / rod butt), head look-at, breathing, blinking, lean into turns and
// spring "jiggle" for secondary motion (hat, backpack, hair bun, rod tip whip).
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qe = new THREE.Quaternion();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Rotate `bone` by a WORLD-space rotation q (premultiplied), keeping its children consistent. */
export function rotateWorld(bone, q) {
  bone.parent.getWorldQuaternion(_qp);
  // local' = Wp^-1 * q * Wp * local
  _qa.copy(_qp).invert().multiply(q).multiply(_qp);
  bone.quaternion.premultiply(_qa);
  bone.updateMatrixWorld(true);
}

/** Set a bone's WORLD rotation. */
export function setWorldQuat(bone, qWorld) {
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(qWorld));
  bone.updateMatrixWorld(true);
}

/**
 * Analytic two-bone IK. upper (hip/shoulder) → mid (knee/elbow) → end (ankle/wrist).
 * Moves `end` toward `target` (world) by weight; keeps the end bone's world rotation (or `endQ` if given).
 * `fallbackAxis` (world) is the bend axis when the limb is straight.
 */
export function twoBoneIK(upper, mid, end, target, weight, fallbackAxis, endQ = null) {
  if (weight <= 1e-4) return;
  end.getWorldQuaternion(_qe);
  if (endQ) _qe.copy(endQ);
  const keepQ = _qe.clone();
  upper.getWorldPosition(_a); mid.getWorldPosition(_b); end.getWorldPosition(_c);
  _t.copy(_c).lerp(target, weight);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  const dist = clamp(_a.distanceTo(_t), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  // 1) mid joint angle
  _u.subVectors(_a, _b); _v.subVectors(_c, _b);
  const cur = _u.angleTo(_v);
  const want = Math.acos(clamp((l1 * l1 + l2 * l2 - dist * dist) / (2 * l1 * l2), -1, 1));
  _n.crossVectors(_u, _v);
  if (_n.lengthSq() < 1e-8) _n.copy(fallbackAxis); else _n.normalize();
  _q.setFromAxisAngle(_n, want - cur);
  rotateWorld(mid, _q);
  // 2) aim the chain at the target
  end.getWorldPosition(_c);
  _u.subVectors(_c, _a).normalize(); _v.subVectors(_t, _a).normalize();
  _q.setFromUnitVectors(_u, _v);
  rotateWorld(upper, _q);
  // 3) restore the end orientation
  setWorldQuat(end, keepQ);
}

/** Spring-driven pendulum for secondary motion: the bone swings toward where its tip lags behind. */
export class Jiggle {
  /**
   * @param {THREE.Bone} bone
   * @param {THREE.Vector3} tip   tip offset in the bone's local frame (bind)
   * @param {{k?:number, damp?:number, max?:number, gravity?:number, weight?:number}} o
   */
  constructor(bone, tip, o = {}) {
    this.bone = bone; this.tip = tip.clone();
    this.k = o.k ?? 120; this.c = o.damp ?? 0.35; this.max = o.max ?? 0.25; this.g = o.gravity ?? 0; this.weight = o.weight ?? 1;
    this.p = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.init = false;
    this.angle = 0; this.axis = new THREE.Vector3(1, 0, 0);
  }
  reset() { this.init = false; }
  /** Simulate; returns the world delta rotation (also applied to the bone unless apply=false). */
  update(dt, apply = true) {
    const O = this.bone.getWorldPosition(_a);
    const R = this.bone.localToWorld(_b.copy(this.tip));
    const L = R.distanceTo(O);
    if (!this.init || dt <= 0) { this.p.copy(R); this.vel.set(0, 0, 0); this.init = true; }
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    const c = 2 * Math.sqrt(this.k) * this.c;
    for (let i = 0; i < n; i++) {
      _d.subVectors(R, this.p).multiplyScalar(this.k).addScaledVector(this.vel, -c);
      _d.y -= this.g;
      this.vel.addScaledVector(_d, h);
      this.p.addScaledVector(this.vel, h);
    }
    // keep length + clamp the angle
    _u.subVectors(R, O).normalize();
    _v.subVectors(this.p, O); if (_v.lengthSq() < 1e-10) _v.copy(_u); _v.normalize();
    let ang = _u.angleTo(_v);
    if (ang > this.max) { _n.crossVectors(_u, _v).normalize(); _v.copy(_u).applyAxisAngle(_n, this.max); ang = this.max; this.vel.multiplyScalar(0.5); }
    this.p.copy(O).addScaledVector(_v, L);
    _q.setFromUnitVectors(_u, _v);
    if (this.weight < 1) _q.slerp(_qa.identity(), 1 - this.weight);
    this.angle = ang; this.axis.crossVectors(_u, _v); if (this.axis.lengthSq() > 1e-10) this.axis.normalize();
    if (apply) rotateWorld(this.bone, _q);
    return _q;
  }
}

/** Head/neck look-at with limits and smoothing. */
export class LookAt {
  constructor(char) {
    this.c = char; this.yaw = 0; this.pitch = 0; this.weight = 0;
    this.headLocal = new THREE.Vector3(...char.spec.headC).sub(new THREE.Vector3(...char.spec.joints.head));
    this.eyeShift = 0;
  }
  /** target: Vector3 | Object3D | null; w: 0..1 (blended meta * user weight) */
  update(dt, target, w) {
    const B = this.c.bones;
    let wantYaw = 0, wantPitch = 0;
    if (target && w > 0.001) {
      const tp = target.isObject3D ? target.getWorldPosition(_t) : _t.copy(target);
      const H = B.head.localToWorld(_a.copy(this.headLocal));
      B.chest.getWorldQuaternion(_q).invert();
      _d.subVectors(tp, H).applyQuaternion(_q);                     // desired dir in chest frame
      B.head.getWorldQuaternion(_qa); _u.set(0, 0, 1).applyQuaternion(_qa).applyQuaternion(_q); // animated head fwd
      const yawD = Math.atan2(_d.x, _d.z), pitchD = Math.atan2(-_d.y, Math.hypot(_d.x, _d.z));
      const yawA = Math.atan2(_u.x, _u.z), pitchA = Math.atan2(-_u.y, Math.hypot(_u.x, _u.z));
      const yawT = clamp(yawD, -1.25, 1.25), pitchT = clamp(pitchD, -0.45, 0.7);
      // behind the character: don't strain, ease toward neutral
      const behind = Math.abs(yawD) > 2.2 ? 0 : 1;
      wantYaw = (yawT - yawA) * w * behind; wantPitch = (pitchT - pitchA) * w * behind;
    }
    const k = 1 - Math.exp(-5 * dt);
    this.yaw += (wantYaw - this.yaw) * k; this.pitch += (wantPitch - this.pitch) * k;
    this.weight = w;
    if (Math.abs(this.yaw) + Math.abs(this.pitch) < 1e-4) return;
    // distribute: neck 35 %, head 65 % (in each parent's frame)
    for (const [bone, f] of [[B.neck, 0.35], [B.head, 0.65]]) {
      _q.setFromEuler(_e.set(this.pitch * f, this.yaw * f, 0, 'YXZ'));
      bone.quaternion.premultiply(_q);
    }
    B.neck.updateMatrixWorld(true);
    // eyes glance a little further
    this.eyeShift = clamp(this.yaw * 0.04, -0.012, 0.012);
  }
}
const _e = new THREE.Euler();

/** Ground helpers. */
export function groundNormal(fn, x, z, out) {
  const e = 0.12;
  const hx = fn(x + e, z) - fn(x - e, z), hz = fn(x, z + e) - fn(x, z - e);
  return out.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
}
