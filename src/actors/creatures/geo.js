// Geometry helpers shared by fishModels.js and the creatures: a merge builder with custom attributes,
// swept tubes, two-sided fin strips, ellipsoids and small utilities. All procedural, no assets.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
const _m3 = new THREE.Matrix3();

/** Linear colour from hex/string (THREE colour management converts sRGB → linear). */
export const col = (h) => (h && h.isColor ? h.clone() : new THREE.Color(h ?? 0xffffff));
/** Mix two colours (returns new). */
export const mixCol = (a, b, t) => col(a).lerp(col(b), t);
/** Lighten (t>0) toward white or darken (t<0) toward black. */
export const shade = (a, t) => (t >= 0 ? col(a).lerp(_c.setRGB(1, 1, 1), t) : col(a).multiplyScalar(1 + t));

/**
 * Accumulates many part geometries into one BufferGeometry with per-part colour, uv override and
 * custom attributes (e.g. aFin for fin flutter, skinIndex/skinWeight for rigs).
 */
export class Builder {
  /** @param {Record<string, number>} extra custom attribute name → item size */
  constructor(extra = {}) {
    this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = [];
    this.extra = {};
    for (const k in extra) this.extra[k] = { size: extra[k], d: [] };
  }
  get count() { return this.p.length / 3; }

  /**
   * Append a geometry.
   * @param {THREE.BufferGeometry} geo
   * @param {{matrix?:THREE.Matrix4, color?:any|((p:THREE.Vector3, n:THREE.Vector3, i:number)=>THREE.Color),
   *   uv?:[number,number], uvRect?:[number,number,number,number], extra?:Record<string, number[]|((p:THREE.Vector3, i:number, uv:number[])=>number[])>,
   *   flip?:boolean}} o
   *   uv: constant uv for every vertex (solid colour texel); uvRect: map the geometry's own uv into [u0,v0,u1,v1].
   */
  add(geo, o = {}) {
    const base = this.count;
    const pos = geo.attributes.position, nor = geo.attributes.normal, guv = geo.attributes.uv, gcol = geo.attributes.color;
    if (!nor) geo.computeVertexNormals();
    const N = geo.attributes.normal;
    if (o.matrix) _m3.getNormalMatrix(o.matrix);
    const colFn = typeof o.color === 'function' ? o.color : null;
    const colConst = o.color && !colFn ? col(o.color) : null;
    const uvTmp = [0, 0];
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i); _n.fromBufferAttribute(N, i);
      if (o.matrix) { _v.applyMatrix4(o.matrix); _n.applyMatrix3(_m3).normalize(); }
      this.p.push(_v.x, _v.y, _v.z); this.n.push(_n.x, _n.y, _n.z);
      if (o.uv) { uvTmp[0] = o.uv[0]; uvTmp[1] = o.uv[1]; }
      else if (guv) {
        let u = guv.getX(i), v = guv.getY(i);
        if (o.uvRect) { const r = o.uvRect; u = r[0] + (r[2] - r[0]) * u; v = r[1] + (r[3] - r[1]) * v; }
        uvTmp[0] = u; uvTmp[1] = v;
      } else { uvTmp[0] = 0.99; uvTmp[1] = 0.01; }
      this.uv.push(uvTmp[0], uvTmp[1]);
      let c = colConst;
      if (colFn) c = colFn(_v, _n, i);
      if (!c && gcol) c = _c.fromBufferAttribute(gcol, i);
      if (!c) c = _c.setRGB(1, 1, 1);
      this.c.push(c.r, c.g, c.b);
      for (const k in this.extra) {
        const e = this.extra[k], src = o.extra?.[k];
        let val = typeof src === 'function' ? src(_v, i, uvTmp) : src;
        for (let j = 0; j < e.size; j++) e.d.push(val ? (val[j] ?? 0) : 0);
      }
    }
    if (geo.index) {
      const ix = geo.index.array;
      for (let i = 0; i < ix.length; i += 3) {
        if (o.flip) this.idx.push(base + ix[i], base + ix[i + 2], base + ix[i + 1]);
        else this.idx.push(base + ix[i], base + ix[i + 1], base + ix[i + 2]);
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        if (o.flip) this.idx.push(base + i, base + i + 2, base + i + 1);
        else this.idx.push(base + i, base + i + 1, base + i + 2);
      }
    }
    return this;
  }

  /** Build the merged BufferGeometry. */
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    for (const k in this.extra) {
      const e = this.extra[k];
      if (k === 'skinIndex') g.setAttribute(k, new THREE.Uint16BufferAttribute(e.d, e.size));
      else g.setAttribute(k, new THREE.Float32BufferAttribute(e.d, e.size));
    }
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/**
 * Tube swept along a polyline/curve with parallel-transport frames.
 * @param {THREE.Vector3[]} pts path points (≥2)
 * @param {(t:number)=>number|[number,number]} radius radius (or [rx, ry] in the frame's normal/binormal) at t∈[0,1]
 * @param {number} radial segments around
 * @param {{capStart?:boolean, capEnd?:boolean, up?:THREE.Vector3, smooth?:number}} o
 */
export function sweep(pts, radius, radial = 8, o = {}) {
  if (o.smooth && pts.length > 2) pts = new THREE.CatmullRomCurve3(pts).getPoints(Math.max(pts.length, o.smooth));
  const n = pts.length;
  const T = [], Nn = [], Bn = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    T.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  const up = (o.up || new THREE.Vector3(0, 1, 0)).clone();
  let N0 = new THREE.Vector3().crossVectors(T[0], up);
  if (N0.lengthSq() < 1e-6) N0.set(1, 0, 0).cross(T[0]);
  N0.normalize();
  // frame: N = "side" (x-ish), B = "up"
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const ax = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
      const s = ax.length();
      if (s > 1e-6) { ax.divideScalar(s); const ang = Math.acos(THREE.MathUtils.clamp(T[i - 1].dot(T[i]), -1, 1)); N0 = N0.clone().applyAxisAngle(ax, ang); }
      else N0 = N0.clone();
    }
    Nn.push(N0);
    Bn.push(new THREE.Vector3().crossVectors(T[i], N0).normalize());
  }
  const P = [], UV = [], idx = [];
  // cumulative length for t
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = L[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const t = L[i] / total;
    let r = radius(t); const rx = Array.isArray(r) ? r[0] : r, ry = Array.isArray(r) ? r[1] : r;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      P.push(pts[i].x + Nn[i].x * ca * rx + Bn[i].x * sa * ry, pts[i].y + Nn[i].y * ca * rx + Bn[i].y * sa * ry, pts[i].z + Nn[i].z * ca * rx + Bn[i].z * sa * ry);
      UV.push(t, j / radial);
    }
  }
  const R = radial + 1;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * R + j, b = a + R, c = a + 1, d = b + 1;
    idx.push(a, c, b, c, d, b);
  }
  const addCap = (i, dir) => {
    const ci = P.length / 3;
    P.push(pts[i].x, pts[i].y, pts[i].z); UV.push(i === 0 ? 0 : 1, 0.5);
    for (let j = 0; j < radial; j++) {
      const a = i * R + j, b = a + 1;
      if (dir > 0) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  };
  if (o.capStart) addCap(0, 1);
  if (o.capEnd) addCap(n - 1, -1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld the seam normals
  const nor = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const a = i * R, b = a + radial;
    _n.fromBufferAttribute(nor, a).add(_v.fromBufferAttribute(nor, b)).normalize();
    nor.setXYZ(a, _n.x, _n.y, _n.z); nor.setXYZ(b, _n.x, _n.y, _n.z);
  }
  return g;
}

/**
 * Two-sided thin surface between a root curve and a tip curve (fins, wings, ears, leaves).
 * uv: u = along root (0..1), v = root→tip (0..1). Attribute-friendly: v is also the "flex" amount.
 * @param {(s:number)=>THREE.Vector3} root
 * @param {(s:number)=>THREE.Vector3} tip
 * @param {number} N segments along the root
 * @param {number} M segments root→tip
 * @param {{thick?:number, bow?:(s:number,r:number)=>THREE.Vector3|null, oneSided?:boolean}} o  bow: extra offset (cupping)
 */
export function strip(root, tip, N = 8, M = 3, o = {}) {
  const thick = o.thick ?? 0.003;
  const grid = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, a = root(s), b = tip(s);
    for (let r = 0; r <= M; r++) {
      const t = r / M;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      if (o.bow) { const off = o.bow(s, t); if (off) p.add(off); }
      grid.push(p);
    }
  }
  const R = M + 1;
  const at = (i, r) => grid[i * R + r];
  const P = [], NN = [], UV = [], idx = [];
  const sides = o.oneSided ? [1] : [1, -1];
  for (const side of sides) {
    const base = P.length / 3;
    for (let i = 0; i <= N; i++) for (let r = 0; r <= M; r++) {
      const ds = _v.subVectors(at(Math.min(N, i + 1), r), at(Math.max(0, i - 1), r));
      const dr = new THREE.Vector3().subVectors(at(i, Math.min(M, r + 1)), at(i, Math.max(0, r - 1)));
      const nrm = new THREE.Vector3().crossVectors(ds, dr);
      if (nrm.lengthSq() < 1e-12) nrm.set(0, 1, 0); nrm.normalize().multiplyScalar(side);
      const p = at(i, r);
      P.push(p.x + nrm.x * thick * 0.5, p.y + nrm.y * thick * 0.5, p.z + nrm.z * thick * 0.5);
      NN.push(nrm.x, nrm.y, nrm.z);
      UV.push(i / N, r / M);
    }
    for (let i = 0; i < N; i++) for (let r = 0; r < M; r++) {
      const a = base + i * R + r, b = base + (i + 1) * R + r, c = a + 1, d = b + 1;
      if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(NN, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(idx);
  return g;
}

/** Ellipsoid (sphere geometry scaled), optionally squashed on one side. */
export function ellipsoid(rx, ry, rz, ws = 16, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.computeVertexNormals();
  return g;
}

/** Cone (tip up the +y axis) with base at y=0. */
export function cone(r, h, seg = 8) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(0, h / 2, 0);
  return g;
}

/** Matrix from position + direction (+y of the part aims along dir) + optional scale. */
export function aim(pos, dir, scale = 1, roll = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
  return new THREE.Matrix4().compose(pos, q, s);
}

/** Matrix from position, euler (x,y,z) and scale. */
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const sv = typeof s === 'number' ? new THREE.Vector3(s, s, s) : s;
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), sv);
}

/** Smooth bump 0→1→0 over [0,1] with independent rise/fall exponents and peak position. */
export function bump(s, peak = 0.5, rise = 0.6, fall = 0.9) {
  if (s <= 0 || s >= 1) return 0;
  return s < peak ? Math.pow(s / peak, rise) : Math.pow((1 - s) / (1 - peak), fall);
}

/** Make a CanvasTexture with sensible defaults (sRGB, mipmaps, clamp). */
export function canvasTexture(canvas, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.needsUpdate = true;
  return t;
}

/** Create a canvas (OffscreenCanvas is avoided: Safari CanvasTexture support varies). */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}
