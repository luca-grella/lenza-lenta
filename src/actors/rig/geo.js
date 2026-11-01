// Procedural geometry kit for skinned characters. Every primitive is built directly in the bind-pose
// model space (character at the origin, facing +z, y up, 1 unit = 1 m), then tagged with vertex colours
// and skin weights and merged into ONE BufferGeometry → one draw call per character.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const col = c => (c instanceof THREE.Color ? c : new THREE.Color(c));

/** Linear-space colour mix helper: mix(a, b, t) → new Color. */
export const mix = (a, b, t) => col(a).clone().lerp(col(b), clamp01(t));

/**
 * Collects parts and merges them. Weights: a function (p:Vector3, n:Vector3) → [[boneName, w], ...]
 * or a bone name (rigid). Colours: hex/Color or a function (p, n, local) → Color|hex.
 */
export class RigBuilder {
  /** @param {string[]} boneNames */
  constructor(boneNames) {
    this.index = Object.fromEntries(boneNames.map((n, i) => [n, i]));
    this.geos = [];
    this.parts = {};      // name → {start, count} vertex ranges (filled by build())
    this._order = [];     // part name per geo
    this.colorFns = {};   // part name → colour function (for recolouring)
  }

  /**
   * @param {THREE.BufferGeometry} geo  in model space
   * @param {{part?:string, color?:any, bone?:string, weights?:Function, smooth?:boolean, local?:THREE.BufferAttribute}} o
   */
  add(geo, o = {}) {
    geo.deleteAttribute('uv');
    if (o.smooth !== false) {
      geo.deleteAttribute('normal');
      geo = mergeVertices(geo, 1e-5);
      geo.computeVertexNormals();
    } else if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.index) geo = mergeVertices(geo, 1e-7);
    const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count;
    const colors = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const colorFn = typeof o.color === 'function' ? o.color : null;
    const fixed = colorFn ? null : col(o.color ?? 0xff00ff);
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(pos, i); _n.fromBufferAttribute(nor, i);
      const c = colorFn ? col(colorFn(_v, _n, i)) : fixed;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      let w = o.weights ? o.weights(_v, _n) : [[o.bone || 'root', 1]];
      w = w.filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      let sum = 0; for (const e of w) sum += e[1];
      for (let k = 0; k < 4; k++) {
        const e = w[k];
        if (!e) { si[i * 4 + k] = 0; sw[i * 4 + k] = 0; continue; }
        const bi = this.index[e[0]];
        if (bi === undefined) throw new Error(`[rig] unknown bone ${e[0]}`);
        si[i * 4 + k] = bi; sw[i * 4 + k] = e[1] / sum;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(k)) geo.deleteAttribute(k);
    const part = o.part || 'misc';
    if (colorFn) this.colorFns[part] = this.colorFns[part] || [];
    this.geos.push({ geo, part, colorFn, fixed: fixed && fixed.clone() });
    return geo;
  }

  /** Merge everything. Returns {geometry, parts}. */
  build() {
    let start = 0;
    const list = [];
    for (const g of this.geos) {
      const cnt = g.geo.attributes.position.count;
      (this.parts[g.part] = this.parts[g.part] || []).push({ start, count: cnt, colorFn: g.colorFn, fixed: g.fixed });
      start += cnt; list.push(g.geo);
    }
    const geometry = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    return { geometry, parts: this.parts };
  }
}

// ---------------------------------------------------------------------------------------------
// Primitives (all return an indexed BufferGeometry in model space)

/**
 * Ellipsoid. `shell` (optional): {mask(u:Vector3 unit dir) → 0..1, inner=0.86} shrinks the masked-out
 * region inside the parent surface — gives smooth hairlines/beards/caps without jagged cuts.
 * `deform(p:Vector3 local scaled, u:Vector3 unit)` may move vertices before rotation/translation.
 */
export function ellipsoid({ c = [0, 0, 0], r = [1, 1, 1], seg = [20, 14], rot = null, shell = null, deform = null }) {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  const p = g.attributes.position, u = new THREE.Vector3();
  const q = rot ? (rot.isQuaternion ? rot : new THREE.Quaternion().setFromEuler(rot.isEuler ? rot : new THREE.Euler(...rot))) : null;
  for (let i = 0; i < p.count; i++) {
    u.fromBufferAttribute(p, i);
    let s = 1;
    if (shell) s = shell.inner + (1 - shell.inner) * clamp01(shell.mask(u));
    _v.set(u.x * r[0] * s, u.y * r[1] * s, u.z * r[2] * s);
    if (deform) deform(_v, u);
    if (q) _v.applyQuaternion(q);
    p.setXYZ(i, _v.x + c[0], _v.y + c[1], _v.z + c[2]);
  }
  return g;
}

/** Catmull-Rom resample of a profile [[s, ...values], ...] into n rows (keeps first/last).
 * Parametrised by row index, so profiles may fold back (e.g. a dimpled hat crown). */
export function smoothProfile(rows, n) {
  const out = [], m = rows.length;
  for (let k = 0; k < n; k++) {
    const f = (k / (n - 1)) * (m - 1);
    const i = Math.min(m - 2, Math.floor(f)), t = f - i;
    const p0 = rows[Math.max(0, i - 1)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(m - 1, i + 2)];
    const row = [];
    for (let j = 0; j < p1.length; j++) {
      const a = p0[j], b = p1[j], cc = p2[j], d = p3[j];
      const t2 = t * t, t3 = t2 * t;
      row.push(0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3));
    }
    out.push(row);
  }
  return out;
}

/**
 * Generalised lathe around an axis: rows [[s, rx, rz?, ox?, oz?], ...]. Ring centre = origin + axis*s
 * + ref*ox + bin*oz, ring point = centre + ref*rx*sinθ + bin*rz*cosθ (θ=0 → +bin). Rings with r≈0 close the ends.
 * @param {{origin?:number[], axis?:number[], ref?:number[], rows:number[][], seg?:number, arc?:number[]}} o
 *   arc: [start, length] radians for partial lathes (e.g. a visor).
 */
export function lathe({ origin = [0, 0, 0], axis = [0, 1, 0], ref = [1, 0, 0], rows, seg = 20, arc = null }) {
  const A = new THREE.Vector3(...axis).normalize();
  const Rf = new THREE.Vector3(...ref); Rf.addScaledVector(A, -Rf.dot(A)).normalize();
  const B = new THREE.Vector3().crossVectors(Rf, A).normalize(); // with axis=y, ref=x → B = +z (front)
  const O = new THREE.Vector3(...origin);
  const closed = !arc;
  const cols = closed ? seg : seg + 1;
  const a0 = arc ? arc[0] : 0, al = arc ? arc[1] : Math.PI * 2;
  const pos = [], idx = [];
  for (const row of rows) {
    const [s, rx, rz = rx, ox = 0, oz = 0] = row;
    for (let j = 0; j < cols; j++) {
      const th = a0 + al * (j / seg);
      _v.copy(O).addScaledVector(A, s).addScaledVector(Rf, ox + rx * Math.sin(th)).addScaledVector(B, oz + rz * Math.cos(th));
      pos.push(_v.x, _v.y, _v.z);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < (closed ? seg : seg); j++) {
    const j2 = closed ? (j + 1) % seg : j + 1;
    const a = i * cols + j, b = i * cols + j2, c = (i + 1) * cols + j, d = (i + 1) * cols + j2;
    // winding so normals point outward (B = ref × axis keeps it right-handed for any axis)
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Capsule-ish limb between two points with a radius profile [[t(0..1), r], ...] and round caps. */
export function limb({ a, b, radii, seg = 12, rings = 18, flatten = 1, ref = [1, 0, 0], extendA = 1, extendB = 1 }) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const dir = Bv.clone().sub(A); const L = dir.length(); dir.normalize();
  const rAt = t => { let i = 0; while (i < radii.length - 2 && radii[i + 1][0] < t) i++; const [t0, r0] = radii[i], [t1, r1] = radii[i + 1]; const k = sstep(0, 1, (t - t0) / (t1 - t0 || 1)); return r0 + (r1 - r0) * k; };
  const rows = [];
  const r0 = rAt(0), r1 = rAt(1);
  const capN = 5;
  if (extendA) for (let k = capN; k >= 1; k--) { const ang = (k / capN) * Math.PI / 2; rows.push([-Math.sin(ang) * r0 * extendA, Math.cos(ang) * r0, Math.cos(ang) * r0 * flatten]); }
  for (let k = 0; k <= rings; k++) { const t = k / rings, r = rAt(t); rows.push([t * L, r, r * flatten]); }
  if (extendB) for (let k = 1; k <= capN; k++) { const ang = (k / capN) * Math.PI / 2; rows.push([L + Math.sin(ang) * r1 * extendB, Math.cos(ang) * r1, Math.cos(ang) * r1 * flatten]); }
  return lathe({ origin: a, axis: dir.toArray(), ref, rows, seg });
}

/** Thin two-sided panel from a grid function f(u,v) → [x,y,z] (u,v in 0..1), thickness along the normal. */
export function panel({ f, nu = 10, nv = 12, thick = 0.014 }) {
  const P = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) P.push(new THREE.Vector3(...f(i / nu, j / nv)));
  const N = P.map(() => new THREE.Vector3());
  const at = (i, j) => P[j * (nu + 1) + i];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const du = at(Math.min(nu, i + 1), j).clone().sub(at(Math.max(0, i - 1), j));
    const dv = at(i, Math.min(nv, j + 1)).clone().sub(at(i, Math.max(0, j - 1)));
    N[j * (nu + 1) + i].crossVectors(dv, du).normalize();
  }
  const pos = [], idx = [];
  const W = nu + 1, H = nv + 1, half = W * H;
  for (const side of [1, -1]) for (let k = 0; k < half; k++) { _v.copy(P[k]).addScaledVector(N[k], side * thick / 2); pos.push(_v.x, _v.y, _v.z); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);                         // front (faces +N)
    idx.push(half + a, half + b, half + c, half + b, half + d, half + c); // back
  }
  // edges
  const edge = (list) => { for (let k = 0; k < list.length - 1; k++) { const a = list[k], b = list[k + 1]; idx.push(a, half + a, b, b, half + a, half + b); } };
  const top = [], bottom = [], left = [], right = [];
  for (let i = 0; i <= nu; i++) { top.push(i); bottom.push(nv * W + (nu - i)); }
  for (let j = 0; j <= nv; j++) { right.push(j * W + nu); left.push((nv - j) * W); }
  edge(top); edge(right); edge(bottom); edge(left);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Torus ring (glasses, hoops, reel) placed at c, rotated by Euler rot (radians). */
export function ring({ c = [0, 0, 0], R = 0.05, r = 0.008, seg = [8, 20], rot = [0, 0, 0], arc = Math.PI * 2 }) {
  const g = new THREE.TorusGeometry(R, r, seg[0], seg[1], arc);
  g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
  g.translate(...c);
  return g;
}

/** Cylinder from a to b (radii ra → rb). */
export function rod({ a, b, ra = 0.02, rb = ra, seg = 8, caps = true }) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A), L = d.length();
  const g = new THREE.CylinderGeometry(rb, ra, L, seg, 1, !caps);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(A.x, A.y, A.z);
  return g;
}

/** Axis-aligned (then rotated) box, flat shaded (pass smooth:false to add()). */
export function box({ c = [0, 0, 0], s = [0.1, 0.1, 0.1], rot = [0, 0, 0] }) {
  const g = new THREE.BoxGeometry(...s);
  g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
  g.translate(...c);
  return g;
}

/** Weight helper: blend between two bones with smoothstep over [a, b] of a scalar. */
export const blend2 = (boneA, boneB, a, b, x) => { const t = sstep(a, b, x); return [[boneA, 1 - t], [boneB, t]]; };
