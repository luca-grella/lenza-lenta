// Character factory: procedural skinned mesh + clip library + animator + procedural layers.
//   import { createCharacter } from './rig/index.js';
//   const ch = createCharacter(ctx, look);            // look: see looks.js (normalised automatically)
//   scene.add(ch.object); ch.play('walk'); loop: ch.update(dt, {ground, speed, turnRate, look})
import * as THREE from 'three';
import { buildCharacter, rimUniforms } from './model.js';
import { normalizeLook } from './looks.js';
import { bakeLibrary } from './anim.js';
import { CLIP_DEFS } from './clips.js';
import { Animator } from './animator.js';
import { twoBoneIK, Jiggle, LookAt, rotateWorld, groundNormal, setWorldQuat } from './procedural.js';
import { ARM_ANGLE } from './skeleton.js';

let LIB = null;
/** Baked clip library shared by every character. */
export function clipLibrary() { if (!LIB) LIB = bakeLibrary(CLIP_DEFS); return LIB; }
export const CLIP_NAMES = () => Object.keys(clipLibrary());

const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _n = new THREE.Vector3(), _ax = new THREE.Vector3(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Keep the character rim light in tune with the sky (call once per frame from any actor module). */
let rimFrame = -1;
export function updateRim(ctx) {
  if (!ctx?.time?.lighting || ctx.loop?.frame === rimFrame) return;
  rimFrame = ctx.loop?.frame;
  const L = ctx.time.lighting({ overcast: ctx.stage?.overcast || 0 });
  rimUniforms.rimColor.value.copy(L.hemiSky).lerp(L.sun, 0.35);
  rimUniforms.rimStrength.value = 0.22 + 0.18 * (L.daylight ?? 1);
}

/**
 * @param {any} ctx core context (only used for math/time; may be null in tools)
 * @param {object} rawLook
 * @param {{id?:string}} [opts]
 */
export function createCharacter(ctx, rawLook, opts = {}) {
  const look = rawLook?._normalized ? rawLook : { ...normalizeLook(rawLook, opts.id || rawLook?.id), _normalized: true };
  if (rawLook?.rod && !look.rod) look.rod = rawLook.rod;
  const built = buildCharacter(look);
  const { mesh, bones: B, spec } = built;
  const object = new THREE.Group(); object.name = `Character:${look.id}`;
  const model = new THREE.Group(); model.name = 'model'; model.scale.setScalar(look.height);
  object.add(model); model.add(mesh);

  // bind pose (local) for the per-frame reset
  const bind = built.skeleton.bones.map(b => ({ b, p: b.position.clone() }));
  const resetPose = () => { for (const { b, p } of bind) { b.position.copy(p); b.quaternion.identity(); b.scale.set(1, 1, 1); } };

  const animator = new Animator(mesh, clipLibrary());
  animator.beforeActivate = resetPose;
  resetPose();

  // ---- procedural state ----
  const lookAt = new LookAt(built);
  const jig = {
    hat: new Jiggle(B.hat, new THREE.Vector3(0, 0.35, 0), { k: 160, damp: 0.28, max: 0.2 }),
    pack: look.pack ? new Jiggle(B.pack, new THREE.Vector3(0, -0.32, -0.04), { k: 110, damp: 0.32, max: 0.22 }) : null,
    hair: ['bun', 'ponytail', 'long'].includes(look.hair.style) ? new Jiggle(B.hair, new THREE.Vector3(0, -0.3, -0.05), { k: 90, damp: 0.25, max: 0.3 }) : null,
    rod: look.rod ? new Jiggle(B.rod_1, spec.rodDir.clone().multiplyScalar(spec.rodTipDist - 0.42), { k: 140, damp: 0.22, max: 0.5 }) : null,
  };
  const st = {
    t: Math.random() * 10, blinkT: 1 + Math.random() * 3, blink: 0, hipDrop: 0, roll: 0, pitch: 0, breath: Math.random() * 6,
    exert: 0, speak: 0, rodVis: look.rod ? 1 : 0, propVis: 1, rodEnabled: !!look.rod, propEnabled: true,
    rodBend: 0, rodBendGoal: 0, rodPull: null, armIKw: 0, footW: 1, lookTarget: null, lookWeight: 1, held: null,
    rodLen: look.rod ? Math.max(0.6, ((look.rod.length || 2.2) - 0.68) / 1.53) : 1,
  };
  const socket = new THREE.Object3D(); socket.name = 'holdSocket'; object.add(socket);

  const sideDir = { L: new THREE.Vector3(Math.sin(ARM_ANGLE), -Math.cos(ARM_ANGLE), 0), R: new THREE.Vector3(-Math.sin(ARM_ANGLE), -Math.cos(ARM_ANGLE), 0) };
  const palmLocal = { L: sideDir.L.clone().multiplyScalar(0.075), R: sideDir.R.clone().multiplyScalar(0.075) };
  const knobLocal = new THREE.Vector3(0.068, -0.06, 0);
  const buttLocal = spec.rodDir.clone().multiplyScalar(-0.2);
  const tipLocal = spec.rodDir.clone().multiplyScalar(spec.rodTipDist - 1.45);

  const ch = {
    object, model, mesh, bones: B, look, spec, animator, socket,
    get skeleton() { return built.skeleton; },
    /** Play a clip (see Animator.play). */
    play: (name, o) => animator.play(name, o),
    has: (name) => animator.has(name),
    /** Look at a world point / Object3D (null = free). weight 0..1 */
    setLook(target, weight = 1) { st.lookTarget = target || null; st.lookWeight = weight; },
    get lookTarget() { return st.lookTarget; },
    /** Mouth chatter while a dialog line is shown (0..1). */
    setSpeaking(v) { st.speak = v ? 1 : 0; },
    setRodEnabled(v) { st.rodEnabled = !!v && !!look.rod; },
    setPropEnabled(v) { st.propEnabled = !!v; },
    /** World position of a palm. */
    handWorld(side = 'R', out = new THREE.Vector3()) { return B[`hand_${side}`].localToWorld(out.copy(palmLocal[side])); },
    rod: {
      /** World position of the rod tip (line attachment point). */
      tipWorld(out = new THREE.Vector3()) { object.updateWorldMatrix(true, true); return B.rod_3.localToWorld(out.copy(tipLocal)); },
      /** 0..1 static bend (line tension). */
      setBend(v) { st.rodBendGoal = Math.max(0, Math.min(1.3, v || 0)); },
      /** World point the line pulls toward (bobber / fish) or null. */
      setPull(p) { st.rodPull = p ? (st.rodPull || new THREE.Vector3()).copy(p.isObject3D ? p.getWorldPosition(_p2) : p) : null; },
      get bend() { return st.rodBend; },
      get visible() { return st.rodVis > 0.5; },
    },
    /** Attach a mesh between the hands (fish: nose at +z, shown sideways). null detaches (does not dispose). */
    holdFish(obj) {
      if (st.held && st.held.parent === socket) socket.remove(st.held);
      st.held = obj || null;
      if (obj) { obj.parent?.remove(obj); socket.add(obj); obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); }
    },
    get held() { return st.held; },
    /** Recolour a part after changing look fields (e.g. look.hat.color). */
    recolor: (part) => built.recolor(part),
    setRodModel(m) {
      if (!look.rod || !m) return;
      Object.assign(look.rod, m); built.recolor('rod');
      st.rodLen = Math.max(0.6, ((m.length || 2.2) - 0.68) / 1.53);
    },
    /** Snap springs (after teleports). */
    resetSprings() { for (const j of Object.values(jig)) j?.reset(); st.hipDrop = 0; },
    /**
     * Per-frame update. env: {ground(x,z)→y|null, speed, turnRate, accel, dt} (all optional).
     */
    update(dt, env = {}) {
      st.t += dt;
      resetPose();
      // three's PropertyMixer only writes a bone when its blended value changed since the previous frame; since
      // the procedural layers start from the bind pose every frame, poison the "previous" buffer so every
      // animated property is written again (otherwise held / constant poses snap back to the bind pose).
      { const mx = animator.mixer, ai = mx._accuIndex; for (const pm of mx._bindings || []) { const e = pm.valueSize; pm.buffer[ai * e + e] = NaN; } }
      animator.update(dt);
      const M = animator.meta;

      // ---- lean into turns / acceleration (whole body pivots on the feet) ----
      const speed = env.speed || 0;
      const rollGoal = Math.max(-0.16, Math.min(0.16, -(env.turnRate || 0) * speed * 0.032)) * M.lean;
      const pitchGoal = Math.max(-0.08, Math.min(0.12, (env.accel || 0) * 0.03 + speed * 0.012)) * M.lean;
      st.roll += (rollGoal - st.roll) * (1 - Math.exp(-6 * dt));
      st.pitch += (pitchGoal - st.pitch) * (1 - Math.exp(-4 * dt));
      if (Math.abs(st.roll) > 1e-4) B.root.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(0, 0, 1), st.roll * 0.45));
      if (Math.abs(st.roll) > 1e-4) B.spine.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(0, 0, 1), st.roll * 0.55));
      if (Math.abs(st.pitch) > 1e-4) B.spine.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(1, 0, 0), st.pitch));

      // ---- breathing (faster after a brisk walk) ----
      st.exert += ((speed > 2 ? 1 : 0) - st.exert) * (1 - Math.exp(-(speed > 2 ? 0.25 : 0.12) * dt));
      const rate = 0.28 + 0.2 * st.exert;
      st.breath += dt * rate * Math.PI * 2;
      const br = Math.sin(st.breath) * M.breathe * (1 + 0.6 * st.exert);
      B.chest.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(1, 0, 0), -0.018 * br));
      B.shoulder_L.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(0, 0, 1), 0.02 * br));
      B.shoulder_R.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(0, 0, 1), -0.02 * br));
      B.head.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(1, 0, 0), 0.01 * br));

      // rod/prop visibility and rod length (multiplies whatever the clip says)
      st.rodVis += ((st.rodEnabled ? 1 : 0) - st.rodVis) * (1 - Math.exp(-12 * dt));
      st.propVis += ((st.propEnabled ? 1 : 0) - st.propVis) * (1 - Math.exp(-12 * dt));
      if (look.rod) { B.rod_0.scale.multiplyScalar(Math.max(1e-3, st.rodVis)); B.rod_1.scale.setScalar(st.rodLen); }
      B.prop_R.scale.multiplyScalar(Math.max(1e-3, st.propVis)); B.prop_L.scale.multiplyScalar(Math.max(1e-3, st.propVis));

      object.updateMatrixWorld(true);

      // ---- feet on uneven ground: hip drop + two-bone IK + align to the slope ----
      const ground = env.ground;
      const fw = M.footIK * (env.footIK ?? 1);
      if (ground && fw > 0.01) footIK(dt, ground, fw);
      else st.hipDrop *= Math.exp(-8 * dt);

      // ---- look-at ----
      lookAt.update(dt, st.lookTarget, M.look * st.lookWeight);

      // ---- face: blink, glance, speech ----
      st.blinkT -= dt;
      if (st.blinkT <= 0) { st.blink = 0.16; st.blinkT = 2.2 + Math.random() * 3.8; if (Math.random() < 0.2) st.blinkT = 0.25; }
      if (st.blink > 0) {
        st.blink -= dt;
        const k = 1 - Math.sin(Math.max(0, st.blink) / 0.16 * Math.PI) * 0.92;
        B.eye_L.scale.y *= k; B.eye_R.scale.y *= k;
      }
      if (lookAt.eyeShift) { B.eye_L.position.x += lookAt.eyeShift; B.eye_R.position.x += lookAt.eyeShift; }
      if (st.speak > 0) {
        const o = Math.max(0, Math.sin(st.t * 15) * 0.5 + Math.sin(st.t * 23.7) * 0.35 + 0.15);
        B.jaw.scale.y *= 1 + 2.4 * o; B.jaw.scale.x *= 1 + 0.15 * o;
      }
      B.eye_L.updateMatrixWorld(); B.eye_R.updateMatrixWorld(); B.jaw.updateMatrixWorld();

      // ---- secondary motion ----
      jig.hat.update(dt); jig.pack?.update(dt); jig.hair?.update(dt);
      if (jig.rod && st.rodVis > 0.05) rodUpdate(dt); else { st.rodBend = 0; jig.rod?.reset(); }

      // ---- left hand on the reel crank / rod butt ----
      const want = M.armIK && look.rod && st.rodVis > 0.5 ? M.armIKw : 0;
      st.armIKw += (want - st.armIKw) * (1 - Math.exp(-14 * dt));
      if (st.armIKw > 0.01) armIK(M.armIK);

      // ---- held object socket ----
      if (st.held) updateSocket();
    },
    dispose() { animator.dispose(); mesh.geometry.dispose(); mesh.skeleton.dispose?.(); object.parent?.remove(object); },
  };

  // ------------------------------------------------------------------------------------------
  const footState = { L: { n: new THREE.Vector3(0, 1, 0) }, R: { n: new THREE.Vector3(0, 1, 0) } };
  function footIK(dt, ground, w) {
    const rootY = object.getWorldPosition(_p).y;
    const dy = {}, P = {};
    for (const s of ['L', 'R']) {
      const f = B[`foot_${s}`].getWorldPosition(new THREE.Vector3());
      const g = ground(f.x, f.z);
      P[s] = f;
      dy[s] = Number.isFinite(g) ? Math.max(-0.4, Math.min(0.4, g - rootY)) * w : 0;
    }
    const drop = Math.min(dy.L, dy.R, 0) + Math.max(0, Math.min(dy.L, dy.R)) * 0.5;
    st.hipDrop += (drop - st.hipDrop) * (1 - Math.exp(-14 * dt));
    if (Math.abs(st.hipDrop) > 1e-4) {
      B.root.position.y += st.hipDrop / look.height;
      B.root.updateMatrixWorld(true);
    }
    for (const s of ['L', 'R']) {
      const th = B[`thigh_${s}`], sh = B[`shin_${s}`], ft = B[`foot_${s}`];
      const target = P[s].clone(); target.y += dy[s];
      // the animated foot moved with the hip drop: target stays absolute
      th.getWorldQuaternion(_q2);
      const fallback = _ax.set(1, 0, 0).applyQuaternion(_q2);
      ft.getWorldQuaternion(_q);
      // slope alignment of the sole, only when the foot is near the ground
      const lift = P[s].y - rootY - 0.1;
      const plant = (1 - sstep(0.04, 0.2, lift)) * w;
      const fs = footState[s];
      const g = groundNormal(ground, P[s].x, P[s].z, _n);
      fs.n.lerp(g, 1 - Math.exp(-12 * dt)).normalize();
      const align = _q2.setFromUnitVectors(UP, fs.n);
      const endQ = _q.clone().premultiply(new THREE.Quaternion().slerp(align, plant));
      twoBoneIK(th, sh, ft, target, 1, fallback, endQ);
    }
  }

  function rodUpdate(dt) {
    // bend from line tension (Gameplay: rod.setBend / setPull)
    st.rodBend += (st.rodBendGoal - st.rodBend) * (1 - Math.exp(-6 * dt));
    if (st.rodBend > 0.01 && st.rodPull) {
      B.rod_1.getWorldPosition(_p);
      const tip = B.rod_3.localToWorld(_p2.copy(tipLocal));
      const dirRod = tip.clone().sub(_p).normalize();
      const pull = st.rodPull.clone().sub(tip).normalize();
      _ax.crossVectors(dirRod, pull);
      if (_ax.lengthSq() > 1e-6) {
        _ax.normalize();
        const total = st.rodBend * 0.95 * Math.min(1, dirRod.angleTo(pull) / 1.2);
        for (const [b, f] of [[B.rod_1, 0.2], [B.rod_2, 0.35], [B.rod_3, 0.45]]) rotateWorld(b, _q.setFromAxisAngle(_ax, total * f));
      }
    }
    // whip / wobble: pendulum on the tip, spread over the segments
    const j = jig.rod;
    j.update(dt, false);
    if (j.angle > 1e-4) {
      for (const [b, f] of [[B.rod_1, 0.25], [B.rod_2, 0.35], [B.rod_3, 0.4]]) rotateWorld(b, _q.setFromAxisAngle(j.axis, j.angle * f));
    }
  }

  function armIK(kind) {
    const target = kind === 'crank' ? B.reel.localToWorld(_p.copy(knobLocal)) : B.rod_0.localToWorld(_p.copy(buttLocal));
    // wrist target = grip point minus the palm offset along the forearm
    const wr = B.hand_L.getWorldPosition(new THREE.Vector3()), el = B.lowerarm_L.getWorldPosition(new THREE.Vector3());
    const fore = wr.clone().sub(el).normalize();
    target.addScaledVector(fore, -0.075 * look.height);
    B.upperarm_L.getWorldQuaternion(_q2);
    const fallback = _ax.set(0, 1, 0).applyQuaternion(_q2);
    twoBoneIK(B.upperarm_L, B.lowerarm_L, B.hand_L, target, st.armIKw, fallback);
  }

  function updateSocket() {
    const L = ch.handWorld('L', new THREE.Vector3()), R = ch.handWorld('R', new THREE.Vector3());
    const span = L.distanceTo(R);
    const mid = span < 0.6 ? L.clone().add(R).multiplyScalar(0.5) : R.clone();
    object.updateWorldMatrix(true, false);
    // basis: z along R→L (fish nose to the character's left), y ≈ up
    const z = span < 0.6 ? L.clone().sub(R).normalize() : new THREE.Vector3(1, 0, 0).applyQuaternion(object.getWorldQuaternion(_q));
    const y = new THREE.Vector3(0, 1, 0); const x = new THREE.Vector3().crossVectors(y, z).normalize(); y.crossVectors(z, x);
    _m.makeBasis(x, y, z);
    const qW = new THREE.Quaternion().setFromRotationMatrix(_m);
    socket.position.copy(object.worldToLocal(mid.clone().add(new THREE.Vector3(0, 0.02, 0))));
    socket.quaternion.copy(object.getWorldQuaternion(_q).invert().multiply(qW));
  }

  animator.play('locomotion', { fade: 0 });
  return ch;
}

export { normalizeLook };
