// Static geometry builder: props are authored as many small primitives with a transform stack, coloured
// per part (vertex colours with a little jitter), then merged per material and per spatial cell so the
// whole village costs a handful of draw calls. Also bakes a soft contact darkening near the ground.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';

const CELL = 40;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Rounded box centred at the origin. */
export function roundedBox(w, h, d, r = 0.05, seg = 2) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const g = new THREE.BoxGeometry(1, 1, 1, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1);
  const p = g.attributes.position, n = g.attributes.normal;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) * w, p.getY(i) * h, p.getZ(i) * d);
    c.set(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd));
    const o = v.sub(c);
    if (o.lengthSq() < 1e-9) o.set(0, 1, 0);
    o.normalize();
    p.setXYZ(i, c.x + o.x * r, c.y + o.y * r, c.z + o.z * r);
    n.setXYZ(i, o.x, o.y, o.z);
  }
  // face-centre normals stay flat for big flat faces
  g.computeVertexNormals();
  return g;
}

/** Lumpy rock: icosahedron with seeded displacement. */
export function rockGeometry(seed = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const R = rng(seed);
  const p = g.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, 0.78 + R() * 0.38);
    const s = map.get(k);
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.8, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

export class Builder {
  /**
   * @param {{seed?:string, groundAt?:(x:number,z:number)=>number}} o
   */
  constructor(o = {}) {
    this.R = rng(o.seed || 'props');
    this.groundAt = o.groundAt || (() => 0);
    this.parts = new Map();   // key → {mat, list:[]}
    this.stack = [new THREE.Matrix4()];
    this.cell = '0_0';
    this.cellFixed = null;
    this.colliders = [];      // {type:'circle'|'box', ...} in world space
    this.surfaces = [];       // walkable decks: {type:'box', cx, cz, hw, hd, rot, y} | {type:'fn', ...}
    this.glows = [];          // night light sources {x, y, z, color, intensity, kind}
    this.cache = new Map();
    this.jitter = 0.05;
    this.noShadow = false;
  }
  get M() { return this.stack[this.stack.length - 1]; }
  /** Push a transform: translate (x,y,z), rotate ry (then rx, rz), uniform/vector scale. */
  push(x = 0, y = 0, z = 0, ry = 0, s = 1, rx = 0, rz = 0) {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    _m.compose(_p.set(x, y, z), _q, _s);
    this.stack.push(this.M.clone().multiply(_m));
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  /** World position of a local point under the current transform. */
  world(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.M); }
  /** World rotation (yaw) of the current transform. */
  yaw() { const e = new THREE.Vector3(1, 0, 0).transformDirection(this.M); return Math.atan2(-e.z, e.x); }
  /** Merge everything added from now on into the cell containing world x,z (call per building). */
  at(x, z) { this.cellFixed = `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`; return this; }
  free() { this.cellFixed = null; return this; }

  _key(mat, wx, wz) {
    const cell = this.cellFixed || `${Math.floor(wx / CELL)}_${Math.floor(wz / CELL)}`;
    return `${mat}|${cell}|${this.noShadow ? 'ns' : 's'}`;
  }

  /**
   * Add a geometry (centred where you want it, in local units) with a local transform.
   * @param {THREE.BufferGeometry} geo  shared template (not modified)
   * @param {number|string|THREE.Color} color
   * @param {{x?:number,y?:number,z?:number,rx?:number,ry?:number,rz?:number,sx?:number,sy?:number,sz?:number,mat?:string,jitter?:number,grad?:number}} t
   */
  add(geo, color, t = {}) {
    const mat = t.mat || 'solid';
    _e.set(t.rx || 0, t.ry || 0, t.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    _m.compose(_p.set(t.x || 0, t.y || 0, t.z || 0), _q, _s);
    const M = this.M.clone().multiply(_m);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(k === 'uv' && t.keepUV)) g.deleteAttribute(k);
    g.applyMatrix4(M);
    // vertex colour with jitter + optional vertical gradient (darker at the bottom of the part)
    _c.set(color);
    const j = (t.jitter ?? this.jitter);
    const f = 1 + (this.R() - 0.5) * 2 * j;
    const cr = _c.r * f, cg = _c.g * f, cb = _c.b * f;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const grad = t.grad || 0;
    let minY = Infinity, maxY = -Infinity;
    if (grad) for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (grad) k = 1 - grad + grad * (g.attributes.position.getY(i) - minY) / Math.max(1e-3, maxY - minY);
      col[i * 3] = cr * k; col[i * 3 + 1] = cg * k; col[i * 3 + 2] = cb * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const c = _p.set(0, 0, 0).applyMatrix4(M);
    const key = this._key(mat, c.x, c.z);
    if (!this.parts.has(key)) this.parts.set(key, { mat, list: [], shadow: !this.noShadow });
    this.parts.get(key).list.push(g);
    return this;
  }

  /** Add a geometry that already has a `color` attribute (kept as is). */
  addRaw(geo, t = {}) {
    const mat = t.mat || 'solid';
    _e.set(t.rx || 0, t.ry || 0, t.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    _m.compose(_p.set(t.x || 0, t.y || 0, t.z || 0), _q, _s);
    const M = this.M.clone().multiply(_m);
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(M);
    const c = _p.set(0, 0, 0).applyMatrix4(M);
    const key = this._key(mat, c.x, c.z);
    if (!this.parts.has(key)) this.parts.set(key, { mat, list: [], shadow: !this.noShadow });
    this.parts.get(key).list.push(g);
    return this;
  }

  // ---- primitive shortcuts (all centred at x,y,z in the current frame) ----
  geo(name, make) { if (!this.cache.has(name)) this.cache.set(name, make()); return this.cache.get(name); }
  box(w, h, d, x, y, z, color, t = {}) {
    const r = Math.min(t.round ?? 0, w * 0.3, h * 0.3, d * 0.3);
    const geo = r > 0.004 ? this.geo(`rb${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}_${r.toFixed(3)}`, () => roundedBox(w, h, d, r, 1)) : this.geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
    return this.add(geo, color, { ...t, x, y, z });
  }
  cyl(rt, rb, h, x, y, z, color, t = {}) {
    const seg = t.seg || 8;
    const geo = this.geo(`c${rt}_${rb}_${h}_${seg}_${t.open ? 1 : 0}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!t.open));
    return this.add(geo, color, { ...t, x, y, z });
  }
  cone(r, h, x, y, z, color, t = {}) {
    const seg = t.seg || 8;
    const geo = this.geo(`k${r}_${h}_${seg}`, () => new THREE.ConeGeometry(r, h, seg, 1));
    return this.add(geo, color, { ...t, x, y, z });
  }
  sphere(r, x, y, z, color, t = {}) {
    const d = t.detail ?? 1;
    const geo = this.geo(`s${d}`, () => new THREE.IcosahedronGeometry(1, d));
    return this.add(geo, color, { ...t, x, y, z, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }
  rock(r, x, y, z, color, t = {}) {
    const v = t.variant ?? Math.floor(this.R() * 6);
    const geo = this.geo(`rock${v}`, () => rockGeometry(100 + v, 1));
    return this.add(geo, color, { ...t, x, y, z, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }
  torus(r, tube, x, y, z, color, t = {}) {
    const geo = this.geo(`t${r}_${tube}`, () => new THREE.TorusGeometry(r, tube, 6, 14));
    return this.add(geo, color, { ...t, x, y, z });
  }
  /** Plank strip from (x0,z0) to (x1,z1) at height y (local frame). */
  plankBetween(x0, z0, x1, z1, y, w, th, color, t = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    return this.box(w, th, len, (x0 + x1) / 2, y, (z0 + z1) / 2, color, { ...t, ry: ry + (t.ry || 0) });
  }
  /** Beam between two local 3D points. */
  beam(a, b, r, color, t = {}) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    return this.cyl(r, r, len, mid.x, mid.y, mid.z, color, { ...t, rx: e.x, ry: e.y, rz: e.z, seg: t.seg || 6 });
  }

  // ---- gameplay data in world space ----
  circle(x, z, r, tag) { const p = this.world(x, 0, z); this.colliders.push({ type: 'circle', x: p.x, z: p.z, r, tag }); return this; }
  rect(x, z, hw, hd, rot = 0, tag) {
    const p = this.world(x, 0, z);
    this.colliders.push({ type: 'box', x: p.x, z: p.z, hw, hd, rot: rot + this.yaw(), tag });
    return this;
  }
  /** Walkable deck (local rect at height y). */
  deck(x, z, hw, hd, y, rot = 0, tag) {
    const p = this.world(x, y, z);
    this.surfaces.push({ type: 'box', x: p.x, z: p.z, hw, hd, rot: rot + this.yaw(), y: p.y, tag });
    return this;
  }
  glow(x, y, z, color = 0xffc070, intensity = 1, kind = 'lamp') {
    const p = this.world(x, y, z);
    this.glows.push({ x: p.x, y: p.y, z: p.z, color: new THREE.Color(color), intensity, kind });
    return this;
  }

  /**
   * Merge everything into meshes. materials: {name: THREE.Material}.
   * @returns {THREE.Group}
   */
  build(materials, { ao = true, name = 'Props' } = {}) {
    const group = new THREE.Group(); group.name = name;
    for (const [key, { mat, list, shadow }] of this.parts) {
      if (!list.length) continue;
      const g = mergeGeometries(list, false);
      if (!g) { console.warn('[world] merge failed', key); continue; }
      if (ao && mat !== 'glow') {
        const p = g.attributes.position, c = g.attributes.color;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const gy = Math.max(this.groundAt(x, z), -0.4);
          const k = lerp(0.62, 1, smoothstep(-0.05, 0.75, y - gy));
          c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
        }
      }
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials[mat] || materials.solid);
      mesh.name = key;
      mesh.castShadow = shadow && mat !== 'glow';
      mesh.receiveShadow = mat !== 'glow';
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      for (const x of list) x.dispose();
    }
    this.parts.clear();
    return group;
  }
}
