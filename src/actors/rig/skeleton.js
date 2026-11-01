// Humanoid skeleton definition. Bind pose = "A-pose": arms 45° down, legs straight, character at the
// origin facing +z. EVERY bone has an identity bind rotation (axes aligned with the model), so pose
// tables can be written as plain Euler angles in a predictable frame (see anim.js for the conventions).
import * as THREE from 'three';

export const ARM_ANGLE = Math.PI / 4; // bind-pose arm angle from vertical

/** Body proportions per build. All lengths in metres at height 1 (the character is then scaled). */
export const BUILDS = {
  normal: { belly: 1.0, chest: 1.0, shoulder: 0.29, hip: 0.12, limb: 1.0, hand: 1.0, head: 1.0, depth: 0.86 },
  round:  { belly: 1.16, chest: 1.04, shoulder: 0.30, hip: 0.125, limb: 1.04, hand: 1.03, head: 1.0, depth: 0.9 },
  stocky: { belly: 1.06, chest: 1.14, shoulder: 0.32, hip: 0.13, limb: 1.16, hand: 1.12, head: 0.97, depth: 0.88 },
  thin:   { belly: 0.86, chest: 0.9, shoulder: 0.27, hip: 0.11, limb: 0.88, hand: 0.95, head: 1.0, depth: 0.84 },
  small:  { belly: 0.98, chest: 0.94, shoulder: 0.28, hip: 0.115, limb: 0.95, hand: 0.98, head: 1.07, depth: 0.88 },
};

/** Bones that belong to the lower-body layer (everything else is upper body). */
export const LOWER = new Set(['root', 'hips', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R']);

/**
 * Joint positions (model space, bind pose) for a build. Returns {joints: name → [x,y,z], parent: name → parent, order: []}.
 * Also returns handy derived points (head centre, grip, rod points) used by the mesh builder.
 */
export function rigSpec(buildName = 'normal') {
  const B = BUILDS[buildName] || BUILDS.normal;
  const J = {}, P = {}, order = [];
  const add = (name, parent, pos) => { J[name] = pos; P[name] = parent; order.push(name); };
  const sx = B.shoulder, hx = B.hip;
  const s = Math.sin(ARM_ANGLE), c = Math.cos(ARM_ANGLE);
  const UA = 0.27 * B.limb ** 0.3, FA = 0.25 * B.limb ** 0.3, HAND = 0.075 * B.hand;

  add('root', null, [0, 0, 0]);
  add('hips', 'root', [0, 0.70, 0]);
  add('spine', 'hips', [0, 0.82, 0]);
  add('chest', 'spine', [0, 1.00, 0]);
  add('neck', 'chest', [0, 1.20, 0]);
  add('head', 'neck', [0, 1.27, 0]);
  const headC = [0, 1.52, 0.01], headR = [0.315 * B.head, 0.295 * B.head, 0.30 * B.head];
  add('hat', 'head', [0, headC[1] + 0.13 * B.head, headC[2] - 0.01]);
  add('eye_L', 'head', [0.112 * B.head, 1.505, headC[2] + 0.268 * B.head]);
  add('eye_R', 'head', [-0.112 * B.head, 1.505, headC[2] + 0.268 * B.head]);
  add('brows', 'head', headC.slice());                         // rotates about x → brows slide up/down the face
  add('jaw', 'head', [0, 1.405, headC[2] + 0.262 * B.head]);
  add('hair', 'head', [0, headC[1], headC[2] - 0.2]);          // ponytail/bun jiggle pivot

  for (const [side, k] of [['L', 1], ['R', -1]]) {
    add(`shoulder_${side}`, 'chest', [0.08 * k, 1.13, 0]);
    const ua = [sx * k, 1.12, 0];
    add(`upperarm_${side}`, `shoulder_${side}`, ua);
    const fa = [ua[0] + s * UA * k, ua[1] - c * UA, 0];
    add(`lowerarm_${side}`, `upperarm_${side}`, fa);
    const wr = [fa[0] + s * FA * k, fa[1] - c * FA, 0];
    add(`hand_${side}`, `lowerarm_${side}`, wr);
    const grip = [wr[0] + s * HAND * k, wr[1] - c * HAND, 0.0];
    add(`prop_${side}`, `hand_${side}`, grip);
  }
  for (const [side, k] of [['L', 1], ['R', -1]]) {
    add(`thigh_${side}`, 'hips', [hx * k, 0.62, 0]);
    add(`shin_${side}`, `thigh_${side}`, [hx * k, 0.35, 0]);
    add(`foot_${side}`, `shin_${side}`, [hx * k, 0.10, 0]);
  }
  add('pack', 'chest', [0, 1.12, -0.22 * B.chest]);               // backpack / creel jiggle
  // fishing rod chain in the right hand (bind direction: forward and a bit up)
  const grip = J.prop_R;
  const rodDir = new THREE.Vector3(0, 0.28, 1).normalize();
  const along = d => [grip[0] + rodDir.x * d, grip[1] + rodDir.y * d, grip[2] + rodDir.z * d];
  const rodDown = new THREE.Vector3(0, -rodDir.z, rodDir.y);      // perpendicular to the rod, pointing down
  const reelC = along(0.13).map((v, i) => v + rodDown.getComponent(i) * 0.07);
  add('rod_0', 'hand_R', grip.slice());
  add('reel', 'rod_0', reelC);
  add('rod_1', 'rod_0', along(0.42));
  add('rod_2', 'rod_1', along(0.95));
  add('rod_3', 'rod_2', along(1.45));

  return {
    build: B, buildName, joints: J, parent: P, order,
    headC, headR, rodDir, rodDown, reelC, UA, FA, HAND,
    rodAlong: along, rodTipDist: 1.95, rodButt: -0.26,
  };
}

/**
 * Create the THREE.Bone hierarchy for a spec. Bones get LOCAL positions (child − parent), identity rotations.
 * @returns {{bones: THREE.Bone[], byName: Object<string, THREE.Bone>, root: THREE.Bone}}
 */
export function createBones(spec) {
  const byName = {}, bones = [];
  for (const name of spec.order) {
    const b = new THREE.Bone(); b.name = name;
    const p = spec.joints[name], parent = spec.parent[name];
    if (parent) {
      const pp = spec.joints[parent];
      b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      byName[parent].add(b);
    } else b.position.set(...p);
    byName[name] = b; bones.push(b);
  }
  return { bones, byName, root: byName.root };
}
