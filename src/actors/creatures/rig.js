// Skinned-rig builder for procedural creatures: bones from absolute rest positions, parts merged into one
// SkinnedMesh (one draw call) with vertex colours, automatic weights along bone chains, keyframe clips
// authored as Euler angles, and cheap per-instance clones.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Builder, sweep, ellipsoid } from './geo.js';

const _v = new THREE.Vector3();

/**
 * @typedef {{name:string, parent?:string, pos:[number,number,number]}} BoneDef  pos = absolute rest position
 * @typedef {{geo:THREE.BufferGeometry, matrix?:THREE.Matrix4, color?:any, bone?:string,
 *   weights?:(p:THREE.Vector3, i:number)=>Array<[string, number]>}} PartDef
 */

/** Collects parts for a rig. */
export class RigBuilder {
  /** @param {BoneDef[]} bones */
  constructor(bones) {
    this.defs = bones;
    this.index = new Map(bones.map((b, i) => [b.name, i]));
    this.abs = new Map(bones.map(b => [b.name, new THREE.Vector3(...b.pos)]));
    this.B = new Builder({ skinIndex: 4, skinWeight: 4 });
  }
  /** Add a part bound rigidly to one bone, or with a weights(p) function. */
  add(geo, o = {}) {
    const fixed = o.bone ? [[o.bone, 1]] : null;
    const wf = o.weights || (() => fixed || [[this.defs[0].name, 1]]);
    const cache = [];
    const resolve = (p, i) => {
      if (cache[i]) return cache[i];
      let w = wf(p, i).filter(e => e[1] > 1e-4);
      w.sort((a, b) => b[1] - a[1]); w = w.slice(0, 4);
      const sum = w.reduce((s, e) => s + e[1], 0) || 1;
      const idx = [0, 0, 0, 0], wt = [0, 0, 0, 0];
      w.forEach((e, k) => { idx[k] = this.index.get(e[0]) ?? 0; wt[k] = e[1] / sum; });
      return (cache[i] = [idx, wt]);
    };
    this.B.add(geo, {
      matrix: o.matrix, color: o.color, uv: [0.5, 0.5],
      extra: { skinIndex: (p, i) => resolve(p, i)[0], skinWeight: (p, i) => resolve(p, i)[1] },
    });
    return this;
  }
  /**
   * Tube along a chain of bones (legs, tails, necks). Points default to the bones' rest positions.
   * @param {string[]} chain bone names (vertices of segment i belong to chain[i], blended near joints)
   * @param {(t:number)=>number|[number,number]} radius
   * @param {{pts?:THREE.Vector3[], radial?:number, color?:any, capStart?:boolean, capEnd?:boolean, endBone?:string, up?:THREE.Vector3}} o
   */
  limb(chain, radius, o = {}) {
    const pts = o.pts || chain.map(n => this.abs.get(n).clone());
    const g = sweep(pts, radius, o.radial ?? 10, { capStart: o.capStart ?? true, capEnd: o.capEnd ?? true, smooth: o.smooth ?? Math.max(8, pts.length * 5), up: o.up });
    // cumulative lengths of the original points
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = L[L.length - 1] || 1;
    const uv = g.attributes.uv;
    const last = chain.length - 1;
    const weights = (p, i) => {
      const d = uv.getX(i) * total;
      let s = 0; while (s < pts.length - 2 && L[s + 1] < d) s++;
      const f = (d - L[s]) / Math.max(1e-6, L[s + 1] - L[s]);
      const cur = chain[Math.min(s, last)], next = chain[Math.min(s + 1, last)], prev = chain[Math.max(0, s - 1)];
      const wn = THREE.MathUtils.smoothstep(f, 0.72, 1.0) * 0.5;
      const wp = s > 0 ? (1 - THREE.MathUtils.smoothstep(f, 0, 0.28)) * 0.5 : 0;
      const out = [[cur, 1 - wn - wp]];
      if (wn > 0) out.push([s + 1 > last && o.endBone ? o.endBone : next, wn]);
      if (wp > 0) out.push([prev, wp]);
      return out;
    };
    return this.add(g, { color: o.color, weights });
  }
  /**
   * Build the template: a Group holding the SkinnedMesh and the root bone.
   * @param {THREE.Material} material
   */
  build(material, name = 'Rig') {
    const geo = this.B.build();
    const bones = this.defs.map(d => { const b = new THREE.Bone(); b.name = d.name; return b; });
    this.defs.forEach((d, i) => {
      const pAbs = this.abs.get(d.name);
      if (d.parent) {
        const parent = bones[this.index.get(d.parent)];
        parent.add(bones[i]);
        bones[i].position.copy(pAbs).sub(this.abs.get(d.parent));
      } else bones[i].position.copy(pAbs);
    });
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.name = name + 'Mesh';
    const root = bones[0];
    mesh.add(root);
    const group = new THREE.Group(); group.name = name; group.add(mesh);
    group.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.castShadow = true; mesh.receiveShadow = false;
    mesh.frustumCulled = false; // skinned bounds are unreliable; creatures are culled by distance instead
    return group;
  }
}

/**
 * Clone a rig template (shares geometry + material, new skeleton). Returns {group, mesh, bones, rest}.
 * rest: bone name → {pos, quat} rest transform.
 */
export function instantiate(template) {
  const group = cloneSkinned(template);
  let mesh = null;
  const bones = {};
  group.traverse(o => { if (o.isSkinnedMesh) mesh = o; if (o.isBone) bones[o.name] = o; });
  const rest = {};
  for (const n in bones) rest[n] = { pos: bones[n].position.clone(), quat: bones[n].quaternion.clone() };
  if (mesh) { mesh.frustumCulled = false; mesh.castShadow = template.children[0]?.castShadow ?? true; }
  return { group, mesh, bones, rest };
}

/** Reset every bone to its rest pose. */
export function resetPose(rig) {
  for (const n in rig.bones) { rig.bones[n].position.copy(rig.rest[n].pos); rig.bones[n].quaternion.copy(rig.rest[n].quat); }
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion();
/** Set a bone's rotation as rest ∘ euler(x,y,z). */
export function rot(rig, name, x = 0, y = 0, z = 0, order = 'YXZ') {
  const b = rig.bones[name]; if (!b) return;
  _q.setFromEuler(_e.set(x, y, z, order));
  b.quaternion.copy(rig.rest[name].quat).multiply(_q);
}
/** Add a rotation on top of the current pose (procedural layers after a mixer update). */
export function addRot(rig, name, x = 0, y = 0, z = 0) {
  const b = rig.bones[name]; if (!b) return;
  _q.setFromEuler(_e.set(x, y, z, 'YXZ'));
  b.quaternion.multiply(_q);
}
/** Offset a bone from its rest position. */
export function offset(rig, name, x = 0, y = 0, z = 0) {
  const b = rig.bones[name]; if (!b) return;
  b.position.copy(rig.rest[name].pos).add(_v.set(x, y, z));
}

/**
 * Author a keyframe clip from Euler keys.
 * @param {string} name
 * @param {number} duration seconds
 * @param {Record<string, Array<[number, number, number, number]>>} rotKeys bone → [[t, rx, ry, rz], …] (t in 0..1 of duration)
 * @param {Record<string, Array<[number, number, number, number]>>} [posKeys] bone → [[t, dx, dy, dz], …] offsets from rest
 * @param {Record<string, {pos:THREE.Vector3}>} rest rest positions (needed for posKeys)
 */
export function makeClip(name, duration, rotKeys, posKeys = {}, rest = {}, scaleKeys = {}) {
  const tracks = [];
  for (const bone in rotKeys) {
    const keys = rotKeys[bone];
    const times = [], vals = [];
    for (const [t, x, y, z] of keys) {
      times.push(t * duration);
      _q.setFromEuler(_e.set(x, y, z, 'YXZ')); // yaw in the parent frame, then pitch, then roll
      vals.push(_q.x, _q.y, _q.z, _q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, vals));
  }
  for (const bone in posKeys) {
    const keys = posKeys[bone], r = rest[bone]?.pos || _v.set(0, 0, 0);
    const times = [], vals = [];
    for (const [t, x, y, z] of keys) { times.push(t * duration); vals.push(r.x + x, r.y + y, r.z + z); }
    tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, vals));
  }
  for (const bone in scaleKeys) {
    const times = [], vals = [];
    for (const [t, x, y, z] of scaleKeys[bone]) { times.push(t * duration); vals.push(x, y, z); }
    tracks.push(new THREE.VectorKeyframeTrack(`${bone}.scale`, times, vals));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

/** Cyclic gait helper: keys for a leg with phase offset. pose(f) → [rx, ry, rz] for f ∈ [0,1). */
export function cycle(phase, pose, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const f = (t + phase) % 1;
    out.push([t, ...pose(f)]);
  }
  return out;
}

/** Standard creature material: vertex colours, soft fur/skin response, skinning on. */
export function creatureMaterial(o = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? 0.82, metalness: 0, ...o.extra });
}

/** Two black eyes with highlights, bound to a bone (for blinks, scale that bone's y). */
export function addEyes(R, bone, center, { spread = 0.05, r = 0.025, forward = new THREE.Vector3(0, 0, 1), iris = null, pupilStretch = 1 } = {}) {
  for (const side of [-1, 1]) {
    const c = new THREE.Vector3(center[0] + side * spread, center[1], center[2]);
    const dir = new THREE.Vector3(side * 0.4, 0.05, 0.92).normalize();
    if (iris) {
      R.add(ellipsoid(r, r, r * 0.8, 14, 10), { matrix: new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), color: iris, bone });
      const pc = c.clone().addScaledVector(dir, r * 0.6);
      R.add(ellipsoid(r * 0.46, r * 0.62 * pupilStretch, r * 0.32, 10, 8), { matrix: new THREE.Matrix4().makeTranslation(pc.x, pc.y, pc.z), color: 0x111014, bone });
      const hc = c.clone().addScaledVector(dir, r * 0.85).add(new THREE.Vector3(0, r * 0.35, 0));
      R.add(ellipsoid(r * 0.2, r * 0.2, r * 0.12, 6, 5), { matrix: new THREE.Matrix4().makeTranslation(hc.x, hc.y, hc.z), color: 0xffffff, bone });
    } else {
      R.add(ellipsoid(r, r, r * 0.8, 10, 8), { matrix: new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), color: 0x16141a, bone });
      const hc = c.clone().addScaledVector(dir, r * 0.7).add(new THREE.Vector3(0, r * 0.4, 0));
      R.add(ellipsoid(r * 0.28, r * 0.28, r * 0.15, 6, 5), { matrix: new THREE.Matrix4().makeTranslation(hc.x, hc.y, hc.z), color: 0xffffff, bone });
    }
  }
}
