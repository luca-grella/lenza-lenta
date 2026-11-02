// Foliage: procedural species (pines, palms, broadleaf "cotton ball" trees, bushes, grass, flowers, ferns,
// reeds, mushrooms, rocks, lily pads, coral) placed with a seeded rule set and drawn as one InstancedMesh per
// species. Every few frames the visible instances near the camera are gathered (distance + frustum culling).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import * as L from './layout.js';
import { patchMaterial } from './materials.js';
import { rockGeometry } from './builder.js';

const C = h => new THREE.Color(h);
const _v = new THREE.Vector3(), _c = new THREE.Color();

// ------------------------------------------------------------------ geometry helpers
/** Finalise a part: vertex colours (with optional vertical gradient), tint flag, optional normal override. */
function part(g, color, { tint = 0, grad = 0, gradTop = null, normals = null, center = null, upNormals = false } = {}) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const p = g.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), tin = new Float32Array(n).fill(tint);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); }
  const a = C(color), b = gradTop ? C(gradTop) : null;
  for (let i = 0; i < n; i++) {
    const t = (p.getY(i) - minY) / Math.max(1e-4, maxY - minY);
    if (b) _c.copy(a).lerp(b, t); else _c.copy(a);
    const k = grad ? 1 - grad + grad * t : 1;
    col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aTint', new THREE.BufferAttribute(tin, 1));
  if (upNormals) { const nn = g.attributes.normal; for (let i = 0; i < n; i++) nn.setXYZ(i, 0, 1, 0); }
  if (center) {
    const nn = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      _v.set(p.getX(i) - center.x, (p.getY(i) - center.y) * 1.3, p.getZ(i) - center.z).normalize();
      // blend with the face normal a little to keep some facet definition
      const fx = nn.getX(i), fy = nn.getY(i), fz = nn.getZ(i);
      _v.set(_v.x * 0.8 + fx * 0.2, _v.y * 0.8 + fy * 0.2, _v.z * 0.8 + fz * 0.2).normalize();
      nn.setXYZ(i, _v.x, _v.y, _v.z);
    }
  }
  if (normals) normals(g);
  return g;
}
const merge = list => { const g = mergeGeometries(list, false); g.computeBoundingSphere(); return g; };
const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s));
  return g.applyMatrix4(m);
};

/** Blade / leaf strip along a curve: returns a non-indexed geometry. pts: spine points, widths per point. */
function strip(pts, widths, side = new THREE.Vector3(1, 0, 0), saw = 0) {
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const wa = widths[i], wb = widths[i + 1];
    const s0 = saw && i % 2 ? 1 + saw : 1, s1 = saw && (i + 1) % 2 ? 1 + saw : 1;
    const al = a.clone().addScaledVector(side, -wa * s0), ar = a.clone().addScaledVector(side, wa * s0);
    const bl = b.clone().addScaledVector(side, -wb * s1), br = b.clone().addScaledVector(side, wb * s1);
    pos.push(...al.toArray(), ...ar.toArray(), ...bl.toArray(), ...ar.toArray(), ...br.toArray(), ...bl.toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ species geometry
function pineGeo(variant) {
  const R = rng('pine' + variant);
  const parts = [];
  const H = variant === 1 ? 6.4 : variant === 2 ? 4.2 : 5.4;
  parts.push(part(T(new THREE.CylinderGeometry(0.13, 0.24, H * 0.32, 7), 0, H * 0.16, 0), 0x7a4a2c, { grad: 0.3 }));
  const tiers = variant === 2 ? 3 : 4;
  for (let k = 0; k < tiers; k++) {
    const f = k / tiers;
    const r = lerp(1.65, 0.62, f) * (H / 5.4) * (0.95 + R() * 0.1);
    const h = lerp(1.9, 1.35, f) * (H / 5.4);
    const y = H * 0.22 + k * (H * 0.72 / tiers);
    const g = new THREE.ConeGeometry(r, h, 9, 2, false);
    // droopy, jagged skirt
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i);
      if (yy < -h / 2 + 0.01) { const a = Math.atan2(p.getZ(i), p.getX(i)); const j = 1 + 0.12 * Math.sin(a * 9 + k) ; p.setX(i, p.getX(i) * j); p.setZ(i, p.getZ(i) * j); p.setY(i, yy - 0.12 - 0.1 * Math.cos(a * 9)); }
    }
    T(g, 0, y + h / 2, 0, 0, R() * 3, 0);
    parts.push(part(g, k % 2 ? 0x2e7a45 : 0x2a7040, { tint: 1, gradTop: k === tiers - 1 ? 0x5aa557 : 0x4c9a50, center: new THREE.Vector3(0, y + h * 0.1, 0) }));
  }
  return merge(parts);
}

function palmGeo(variant) {
  const R = rng('palm' + variant);
  const parts = [];
  const segs = 7, H = variant ? 5.6 : 4.8;
  let x = 0, y = 0;
  const lean = 0.06 + R() * 0.05;
  for (let k = 0; k < segs; k++) {
    const h = H / segs;
    const g = new THREE.CylinderGeometry(0.15 - k * 0.006, 0.2 - k * 0.006, h * 1.02, 7);
    const nx = x + lean * k * 0.9;
    T(g, (x + nx) / 2, y + h / 2, 0, 0, 0, -lean * 1.2);
    parts.push(part(g, k % 2 ? 0x9a6b42 : 0x8a5c38, { grad: 0.25 }));
    x = nx; y += h;
  }
  const top = new THREE.Vector3(x, y, 0);
  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const a = i / fronds * Math.PI * 2 + R() * 0.3;
    const len = 2.4 + R() * 0.6;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const pts = [], w = [];
    const n = 7;
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const p = top.clone().addScaledVector(dir, t * len);
      p.y += 0.55 * Math.sin(t * Math.PI * 0.8) - t * t * 1.5;
      pts.push(p);
      w.push(Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.85) * 0.42 + 0.03);
    }
    const g = strip(pts, w, side, 0.35);
    // fold along the spine (V shape)
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      _v.set(p.getX(k) - top.x, 0, p.getZ(k) - top.z);
      const across = _v.dot(side);
      p.setY(k, p.getY(k) + Math.abs(across) * 0.35);
    }
    g.computeVertexNormals();
    parts.push(part(g, 0x3f8f3a, { tint: 1, gradTop: 0x7cc04f, upNormals: false, normals: gg => { const nn = gg.attributes.normal; for (let k = 0; k < nn.count; k++) { _v.set(nn.getX(k), Math.abs(nn.getY(k)) + 0.6, nn.getZ(k)).normalize(); nn.setXYZ(k, _v.x, _v.y, _v.z); } } }));
  }
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    parts.push(part(T(new THREE.IcosahedronGeometry(0.17, 1), top.x + Math.cos(a) * 0.2, top.y - 0.22, Math.sin(a) * 0.2), 0x6b4a2a));
  }
  return merge(parts);
}

function broadleafGeo(variant) {
  const R = rng('broad' + variant);
  const parts = [];
  const H = variant === 1 ? 4.6 : 3.8;
  parts.push(part(T(new THREE.CylinderGeometry(0.16, 0.28, H * 0.55, 7), 0, H * 0.27, 0), 0x7c5434, { grad: 0.3 }));
  parts.push(part(T(new THREE.CylinderGeometry(0.07, 0.11, 1.2, 5), 0.35, H * 0.5, 0, 0, 0, -0.7), 0x7c5434));
  parts.push(part(T(new THREE.CylinderGeometry(0.07, 0.11, 1.1, 5), -0.3, H * 0.55, 0.1, 0.2, 0, 0.8), 0x7c5434));
  const center = new THREE.Vector3(0, H * 0.78, 0);
  const blobs = [[0, 0.8, 0, 1.25], [0.85, 0.45, 0.2, 0.95], [-0.8, 0.5, -0.1, 0.95], [0.1, 0.4, 0.85, 0.9], [-0.1, 0.45, -0.8, 0.9], [0.3, 1.45, 0.1, 0.8]];
  const canopy = [];
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.IcosahedronGeometry(r * (0.9 + R() * 0.2), 1);
    T(g, x, H * 0.55 + y, z, 0, R() * 3, 0, [1, 0.85, 1]);
    canopy.push(g);
  }
  const cg = mergeGeometries(canopy.map(g => (g.index ? g.toNonIndexed() : g)), false);
  parts.push(part(cg, variant === 2 ? 0x6aa83e : 0x4f9a3e, { tint: 1, gradTop: variant === 2 ? 0xa8d060 : 0x86c454, center }));
  return merge(parts);
}

function bushGeo(variant) {
  const R = rng('bush' + variant);
  const parts = [], list = [];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.28 + R(), r = i ? 0.45 : 0;
    const g = new THREE.IcosahedronGeometry(0.55 + R() * 0.25, 1);
    T(g, Math.cos(a) * r, 0.45 + R() * 0.15, Math.sin(a) * r, 0, R() * 3, 0, [1, 0.8, 1]);
    list.push(g.index ? g.toNonIndexed() : g);
  }
  parts.push(part(mergeGeometries(list, false), 0x4a8f3a, { tint: 1, gradTop: 0x8cc456, center: new THREE.Vector3(0, 0.35, 0) }));
  if (variant === 1) for (let i = 0; i < 9; i++) {
    const a = R() * 6.28, y = 0.3 + R() * 0.6, r = 0.55 + R() * 0.2;
    parts.push(part(T(new THREE.IcosahedronGeometry(0.075, 0), Math.cos(a) * r, y, Math.sin(a) * r), i % 3 ? 0xd2364a : 0x5a2a6a));
  }
  if (variant === 2) for (let i = 0; i < 7; i++) {
    const a = R() * 6.28, y = 0.4 + R() * 0.5, r = 0.55 + R() * 0.2;
    parts.push(part(T(new THREE.IcosahedronGeometry(0.09, 0), Math.cos(a) * r, y, Math.sin(a) * r), 0xfff3f6));
  }
  return merge(parts);
}

function grassGeo(variant) {
  const R = rng('grass' + variant);
  const parts = [];
  const blades = 9;
  for (let i = 0; i < blades; i++) {
    const a = R() * Math.PI * 2, out = 0.05 + R() * 0.12;
    const h = 0.32 + R() * 0.32;
    const lean = 0.12 + R() * 0.2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = dir.clone().multiplyScalar(out);
    const pts = [base, base.clone().addScaledVector(dir, lean * 0.4).setY(h * 0.55), base.clone().addScaledVector(dir, lean).setY(h)];
    const g = strip(pts, [0.045, 0.03, 0.002], side);
    parts.push(part(g, 0xb4b4ac, { tint: 1, gradTop: 0xfffff0, upNormals: true }));
  }
  return merge(parts);
}

function flowerGeo(variant) {
  const R = rng('flower' + variant);
  const parts = [];
  const heads = variant === 1 ? 3 : 2;
  for (let k = 0; k < heads; k++) {
    const a = R() * 6.28, r = k ? 0.12 : 0;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.3 + R() * 0.2;
    const stem = strip([new THREE.Vector3(x, 0, z), new THREE.Vector3(x + 0.02, h * 0.6, z), new THREE.Vector3(x, h, z)], [0.018, 0.014, 0.01], new THREE.Vector3(1, 0, 0));
    parts.push(part(stem, 0x4f8f36, { upNormals: true }));
    const petals = variant === 2 ? 8 : 5;
    for (let p = 0; p < petals; p++) {
      const pa = p / petals * Math.PI * 2;
      const g = new THREE.CircleGeometry(0.06, 5);
      T(g, x + Math.cos(pa) * 0.06, h + 0.01, z + Math.sin(pa) * 0.06, -Math.PI / 2 + 0.25, -pa, 0, [1, 1.5, 1]);
      parts.push(part(g, 0xffffff, { tint: 1, upNormals: true }));
    }
    parts.push(part(T(new THREE.IcosahedronGeometry(0.035, 0), x, h + 0.03, z), 0xf6c832, { upNormals: true }));
    // leaves
    const lg = strip([new THREE.Vector3(x, 0.02, z), new THREE.Vector3(x + 0.1, 0.08, z + 0.05), new THREE.Vector3(x + 0.18, 0.06, z + 0.1)], [0.02, 0.04, 0.002], new THREE.Vector3(0, 0, 1));
    parts.push(part(lg, 0x5a9a3a, { upNormals: true }));
  }
  return merge(parts);
}

function fernGeo() {
  const R = rng('fern');
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + R() * 0.4, len = 0.7 + R() * 0.35;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-dir.z, 0, dir.x);
    const pts = [], w = [];
    for (let j = 0; j <= 6; j++) { const t = j / 6; pts.push(dir.clone().multiplyScalar(t * len).setY(Math.sin(t * Math.PI * 0.7) * 0.5 - t * t * 0.2)); w.push(Math.sin(Math.min(1, t * 1.2) * Math.PI) * 0.12 + 0.01); }
    parts.push(part(strip(pts, w, side, 0.5), 0x2f7a35, { tint: 1, gradTop: 0x6aae4a, upNormals: true }));
  }
  return merge(parts);
}

function reedGeo() {
  const R = rng('reed');
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = R() * 6.28, r = R() * 0.25, h = 0.9 + R() * 0.8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, lean = (R() - 0.5) * 0.3;
    parts.push(part(strip([new THREE.Vector3(x, 0, z), new THREE.Vector3(x + lean * 0.4, h * 0.6, z), new THREE.Vector3(x + lean, h, z)], [0.03, 0.022, 0.003], new THREE.Vector3(Math.cos(a + 1.57), 0, Math.sin(a + 1.57))), 0x4f8a36, { tint: 1, gradTop: 0x9cc05a, upNormals: true }));
    if (i < 3) parts.push(part(T(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 6), x + lean * 0.85, h * 0.86, z), 0x6a4024));
  }
  return merge(parts);
}

function mushroomGeo(variant) {
  const parts = [];
  const n = variant ? 3 : 1;
  const R = rng('mush' + variant);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, r = i ? 0.18 : 0, s = i ? 0.65 : 1;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    parts.push(part(T(new THREE.CylinderGeometry(0.05 * s, 0.065 * s, 0.22 * s, 7), x, 0.11 * s, z), 0xf4ead8));
    const cap = new THREE.SphereGeometry(0.15 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    T(cap, x, 0.2 * s, z, 0, 0, 0, [1, 0.75, 1]);
    parts.push(part(cap, 0xffffff, { tint: 1 }));
    for (let k = 0; k < 4; k++) { const b = k * 1.6 + a; parts.push(part(T(new THREE.IcosahedronGeometry(0.022 * s, 0), x + Math.cos(b) * 0.08 * s, 0.29 * s, z + Math.sin(b) * 0.08 * s), 0xfff8ee)); }
  }
  return merge(parts);
}

function rockGeo(variant) {
  let g = rockGeometry(500 + variant, 1); if (g.index) g = g.toNonIndexed();
  T(g, 0, 0.35, 0, 0, 0, 0, [1, 0.85, 1]);
  const p = g.attributes.position, n = g.attributes.normal;
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3), tin = new Float32Array(p.count).fill(1);
  const base = C(0xb3ada2), dark = C(0x8f8a82), moss = C(0x7fa64e);
  for (let i = 0; i < p.count; i++) {
    _c.copy(dark).lerp(base, smoothstep(0, 0.9, p.getY(i)));
    if (variant !== 3) _c.lerp(moss, smoothstep(0.72, 0.92, n.getY(i)) * 0.7);
    col.set([_c.r, _c.g, _c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aTint', new THREE.BufferAttribute(tin, 1));
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeBoundingSphere();
  return g;
}

function lilyGeo(flower) {
  const parts = [];
  const g = new THREE.CircleGeometry(0.42, 12, 0.35, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2);
  parts.push(part(g, 0x4f9a3a, { tint: 1, upNormals: true }));
  if (flower) {
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * 6.28;
      const pg = new THREE.ConeGeometry(0.06, 0.16, 4);
      T(pg, Math.cos(a) * 0.06, 0.08, Math.sin(a) * 0.06, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      parts.push(part(pg, 0xf6a6c8, { gradTop: 0xfff0f6 }));
    }
    parts.push(part(T(new THREE.IcosahedronGeometry(0.04, 0), 0, 0.08, 0), 0xf6d23a));
  }
  return merge(parts);
}

function coralGeo(variant) {
  const R = rng('coral' + variant);
  const parts = [];
  if (variant === 0) {
    // branching coral
    const branch = (x, y, z, len, a, b, depth) => {
      const end = new THREE.Vector3(x + Math.sin(a) * Math.cos(b) * len, y + Math.cos(a) * len, z + Math.sin(a) * Math.sin(b) * len);
      const g = new THREE.CylinderGeometry(0.035 * (depth + 1), 0.05 * (depth + 1), len, 5);
      const mid = new THREE.Vector3(x, y, z).add(end).multiplyScalar(0.5);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(new THREE.Vector3(x, y, z)).normalize()));
      g.translate(mid.x, mid.y, mid.z);
      parts.push(part(g, 0xffffff, { tint: 1 }));
      if (depth > 0) for (let i = 0; i < 2; i++) branch(end.x, end.y, end.z, len * 0.75, a * 0.5 + (R() - 0.5) * 1.2, b + (R() - 0.5) * 2, depth - 1);
    };
    for (let i = 0; i < 3; i++) branch(0, 0, 0, 0.35, (R() - 0.5) * 0.8, R() * 6.28, 2);
  } else {
    const g = new THREE.IcosahedronGeometry(0.4, 2);
    T(g, 0, 0.2, 0, 0, 0, 0, [1, 0.6, 1]);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + 0.06 * Math.sin(p.getX(i) * 30) * Math.sin(p.getZ(i) * 30); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    g.computeVertexNormals();
    parts.push(part(g, 0xffffff, { tint: 1 }));
  }
  return merge(parts);
}

// ------------------------------------------------------------------ species table
// dist: draw radius as a fraction of quality.foliageDistance; wind: shader params; shadow: casts shadows
const SPECIES = {
  pine:      { make: () => [pineGeo(0), pineGeo(1), pineGeo(2)], dist: 1.0, wind: { amount: 0.22, height: 6, flutter: 0.25 }, shadow: true, radius: 2 },
  palm:      { make: () => [palmGeo(0), palmGeo(1)], dist: 1.0, wind: { amount: 0.35, height: 5.5, flutter: 1.2 }, shadow: true, radius: 3, side: THREE.DoubleSide },
  broadleaf: { make: () => [broadleafGeo(0), broadleafGeo(1), broadleafGeo(2)], dist: 1.0, wind: { amount: 0.16, height: 4.5, flutter: 0.5 }, shadow: true, radius: 2.5 },
  bush:      { make: () => [bushGeo(0), bushGeo(1), bushGeo(2)], dist: 0.75, wind: { amount: 0.07, height: 1, flutter: 0.4 }, shadow: true, radius: 1 },
  grass:     { make: () => [grassGeo(0), grassGeo(1)], dist: 0.42, wind: { amount: 0.13, height: 0.55, flutter: 0.3 }, shadow: false, radius: 0.4, fade: true, side: THREE.DoubleSide },
  flower:    { make: () => [flowerGeo(0), flowerGeo(1), flowerGeo(2)], dist: 0.42, wind: { amount: 0.1, height: 0.45, flutter: 0.4 }, shadow: false, radius: 0.3, fade: true, side: THREE.DoubleSide },
  fern:      { make: () => [fernGeo()], dist: 0.5, wind: { amount: 0.07, height: 0.6, flutter: 0.4 }, shadow: false, radius: 0.8, side: THREE.DoubleSide, fade: true },
  reed:      { make: () => [reedGeo()], dist: 0.6, wind: { amount: 0.2, height: 1.6, flutter: 0.3 }, shadow: true, radius: 0.6, side: THREE.DoubleSide },
  mushroom:  { make: () => [mushroomGeo(0), mushroomGeo(1)], dist: 0.45, wind: null, shadow: false, radius: 0.3, fade: true },
  rock:      { make: () => [rockGeo(0), rockGeo(1), rockGeo(2), rockGeo(3)], dist: 1.0, wind: null, shadow: true, radius: 1.2 },
  lily:      { make: () => [lilyGeo(false), lilyGeo(true)], dist: 0.7, wind: { amount: 0.04, height: 0.2, flutter: 0.2 }, shadow: false, radius: 0.5 },
  coral:     { make: () => [coralGeo(0), coralGeo(1)], dist: 0.7, wind: null, shadow: false, radius: 0.6 },
};

const TINT_PATCH = shader => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aTint;')
    .replace('#include <color_vertex>', `
      vColor = vec3(1.0);
      #ifdef USE_COLOR
        vColor *= color;
      #endif
      #ifdef USE_INSTANCING_COLOR
        vColor *= mix(vec3(1.0), instanceColor.rgb, aTint);
      #endif
    `);
};
const NOFLIP_PATCH = shader => {
  shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
    #ifdef DOUBLE_SIDED
      normal = normalize(vNormal);
    #endif`);
};
const FADE_PATCH = shader => {
  shader.uniforms.uFocus = FOCUS;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec4 uFocus;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 fo = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float fd = distance(fo.xz, uFocus.xz);
        transformed *= smoothstep(uFocus.w, uFocus.w * 0.78, fd);
      }`);
};
const FOCUS = { value: new THREE.Vector4(0, 0, 0, 30) };

// ------------------------------------------------------------------ manager
/**
 * @param {any} ctx
 * @param {object} U world uniforms
 * @param {object} env {terrain, exclusions:[{x,z,r}], q:{waterSurfaceAt, ...}}
 */
export function createFoliage(ctx, U, env) {
  const { terrain } = env;
  const group = new THREE.Group(); group.name = 'Foliage';
  const R = rng(L.SEED + '-foliage');
  const H = terrain.heightAt, S = terrain.slopeAt;
  const q = {};

  // exclusion grid
  const EX = new Map(), EXC = 8;
  for (const e of env.exclusions) {
    const r = Math.ceil((e.r + 1) / EXC);
    const cx = Math.floor(e.x / EXC), cz = Math.floor(e.z / EXC);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { const k = (cx + i) * 4096 + cz + j; if (!EX.has(k)) EX.set(k, []); EX.get(k).push(e); }
  }
  const excluded = (x, z, pad = 0) => {
    const list = EX.get(Math.floor(x / EXC) * 4096 + Math.floor(z / EXC));
    if (!list) return false;
    for (const e of list) if ((x - e.x) ** 2 + (z - e.z) ** 2 < (e.r + pad) ** 2) return true;
    return false;
  };
  const onPath = (x, z, pad = 0) => { for (const p of L.PATHS) { p.query(x, z, 2.5 + pad, q); if (q.d < 1.7 + pad) return true; } return false; };
  const riverDist = (x, z) => { L.RIVER.query(x, z, 10, q); return q.d < 10 ? q.d - L.RIVER.at(q.s, 3) : 99; };
  const pondDist = (x, z) => Math.hypot(x - L.POND.x, z - L.POND.z) - L.POND.r;

  const inst = {};  // species → [{x,y,z,ry,s,v,col}]
  for (const k in SPECIES) inst[k] = [];
  const add = (sp, x, y, z, s, v, col, ry = R() * Math.PI * 2, tilt = 0) => inst[sp].push({ x, y, z, s, v, ry, col, tilt });
  const gd = 1; // full density is placed; quality.grassDensity thins it at draw time

  // grid scatter helper
  function scatter(cell, fn, x0 = -L.HALF, z0 = -L.HALF, x1 = L.HALF, z1 = L.HALF) {
    for (let z = z0; z < z1; z += cell) for (let x = x0; x < x1; x += cell) fn(x + R() * cell, z + R() * cell);
  }
  const grassTint = (x, z) => {
    const f = L.forestness(x, z);
    _c.copy(C(0x8cc957)).lerp(C(0x72b84a), smoothstep(0, 0.5, f)).lerp(C(0x4f9a3e), smoothstep(0.35, 1, f));
    const n = L.noiseB.noise2(x * 0.05, z * 0.05);
    _c.multiplyScalar(1.02 + n * 0.08);
    return _c.clone();
  };

  // --- pines (forest + plateau)
  scatter(3.1, (x, z) => {
    const f = L.forestness(x, z);
    if (R() > f * 1.05) return;
    const h = H(x, z);
    if (h < 1.3 || S(x, z) > 0.85 || excluded(x, z, 1.5) || onPath(x, z, 0.8) || riverDist(x, z) < 2.5 || pondDist(x, z) < 3) return;
    const s = 0.75 + R() * 0.55;
    const tint = new THREE.Color(0.86 + R() * 0.2, 0.9 + R() * 0.18, 0.84 + R() * 0.22);
    add('pine', x, h - 0.05, z, s, R() < 0.35 ? 1 : R() < 0.3 ? 2 : 0, tint);
  });
  // --- broadleaf trees (meadow edges, village, home)
  scatter(7.5, (x, z) => {
    const f = L.forestness(x, z);
    const h = H(x, z);
    if (h < 1.4 || S(x, z) > 0.7 || excluded(x, z, 2) || onPath(x, z, 1.2) || riverDist(x, z) < 2 || pondDist(x, z) < 2) return;
    const zone = L.zoneAt(x, z);
    let p = 0.12 + (f > 0.2 && f < 0.6 ? 0.35 : 0);
    if (zone === 'meadow') p = 0.16;
    if (zone === 'village' || zone === 'home_beach') p = 0.2;
    if (zone === 'lighthouse') p = 0.05;
    if (f > 0.6) p = 0.15;
    if (R() > p) return;
    const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.9 + R() * 0.2);
    if (R() < 0.15) tint.setRGB(1.25, 1.0, 0.65); // a few autumn-ish yellow crowns
    add('broadleaf', x, h - 0.05, z, 0.8 + R() * 0.5, Math.floor(R() * 3), tint);
  });
  // --- palms (sunny beaches + islets)
  scatter(5.5, (x, z) => {
    const h = H(x, z);
    const coast = -L.coastSDF(x, z);
    const islet = Math.hypot(x - L.ISLANDS.palm.cx, z - L.ISLANDS.palm.cz) < 30 || Math.hypot(x - L.ISLANDS.turtle.cx, z - L.ISLANDS.turtle.cz) < 18;
    if (h < 0.45 || h > 2.2 || coast < 2 || coast > (islet ? 40 : 16)) return;
    const zone = L.zoneAt(x, z);
    let p = islet ? 0.42 : (zone === 'home_beach' || zone === 'village') ? 0.32 : zone === 'meadow' ? 0.15 : 0.06;
    if (z < -30 && !islet) p *= 0.3;
    if (R() > p || excluded(x, z, 2) || onPath(x, z, 1)) return;
    const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.92 + R() * 0.18);
    // lean toward the sea
    add('palm', x, h - 0.05, z, 0.85 + R() * 0.35, R() < 0.5 ? 1 : 0, tint, Math.atan2(-(L.noise.noise2(x, z)), 1) + R() * 6.28);
  });
  // --- bushes
  scatter(4.2, (x, z) => {
    const h = H(x, z);
    if (h < 1.1 || S(x, z) > 0.8 || excluded(x, z, 0.8) || onPath(x, z, 0.3) || riverDist(x, z) < 1.2 || pondDist(x, z) < 1.2) return;
    const f = L.forestness(x, z);
    const p = 0.14 + f * 0.22;
    if (R() > p) return;
    const v = f > 0.3 && R() < 0.3 ? 1 : R() < 0.15 ? 2 : 0;
    const tint = new THREE.Color(0.9 + R() * 0.2, 0.92 + R() * 0.16, 0.85 + R() * 0.2);
    add('bush', x, h - 0.08, z, 0.7 + R() * 0.6, v, tint);
  });
  // --- grass tufts (dense, near the player only)
  scatter(1.15, (x, z) => {
    if (R() > gd) return;
    const h = H(x, z);
    if (h < 1.0 && !(h > 0.6 && L.zoneAt(x, z) === 'palm_islet')) return;
    if (S(x, z) > 0.75 || excluded(x, z, 0.2) || onPath(x, z, -0.6)) return;
    const n = L.noiseB.noise2(x * 0.08, z * 0.08);
    if (R() > 0.55 + n * 0.35) return;
    if (riverDist(x, z) < 0.4 || pondDist(x, z) < 0.5) return;
    add('grass', x, h - 0.03, z, 0.75 + R() * 0.7, R() < 0.5 ? 1 : 0, grassTint(x, z).multiplyScalar(1.12));
  });
  // --- flowers (meadow mostly, a few everywhere)
  const flowerCols = [0xfff4f0, 0xf6c8e0, 0xf8d64a, 0xb8a4f0, 0xf47a6a, 0xffffff, 0x8ec8f8];
  scatter(1.9, (x, z) => {
    const h = H(x, z);
    if (h < 1.2 || S(x, z) > 0.6 || excluded(x, z, 0.3) || onPath(x, z, -0.3)) return;
    const zone = L.zoneAt(x, z);
    const n = L.noise.noise2(x * 0.06, z * 0.06);
    const p = (zone === 'meadow' ? 0.8 : zone === 'waterfall' || zone === 'home_beach' ? 0.18 : zone === 'village' ? 0.12 : 0.05) * smoothstep(-0.3, 0.4, n) * gd;
    if (R() > p) return;
    // patches of the same colour
    const ci = Math.floor((L.noiseB.noise2(x * 0.04 + 9, z * 0.04) * 0.5 + 0.5) * flowerCols.length * 1.3 + R() * 1.4) % flowerCols.length;
    // [Fix] meadow flowers big enough to read as a carpet from the gameplay camera
    add('flower', x, h - 0.02, z, (zone === 'meadow' ? 1.7 + R() * 0.7 : 1.1 + R() * 0.5), Math.floor(R() * 3), C(flowerCols[ci]));
  });
  // --- ferns + mushrooms in the forest
  scatter(2.6, (x, z) => {
    const f = L.forestness(x, z), h = H(x, z);
    if (f < 0.25 || h < 1.2 || S(x, z) > 0.8 || excluded(x, z, 0.5) || onPath(x, z, 0)) return;
    if (R() < f * 0.42) add('fern', x, h - 0.03, z, 0.8 + R() * 0.6, 0, new THREE.Color(0.9 + R() * 0.2, 0.95 + R() * 0.1, 0.9 + R() * 0.15));
    else if (R() < 0.06 * f) add('mushroom', x, h - 0.02, z, 0.8 + R() * 0.6, R() < 0.5 ? 1 : 0, R() < 0.7 ? C(0xe0412e) : C(0xc8925a));
  });
  // --- reeds along the river, pond and river mouth
  scatter(1.6, (x, z) => {
    const h = H(x, z);
    const rd = riverDist(x, z), pd = pondDist(x, z);
    let ok = false;
    if (rd > -0.6 && rd < 1.4) { L.RIVER.query(x, z, 10, q); const lvl = L.RIVER.at(q.s, 2); ok = h > lvl - 0.25 && h < lvl + 0.5; }
    if (pd > -0.8 && pd < 1.6 && h > L.POND.level - 0.3 && h < L.POND.level + 0.6) ok = true;
    if (!ok || R() > 0.42 || excluded(x, z, 0.5) || onPath(x, z, -0.3)) return;
    const wf = Math.hypot(x - L.WATERFALL.x, z - L.WATERFALL.zBottom);
    if (wf < 6) return;
    add('reed', x, h - 0.05, z, 0.8 + R() * 0.5, 0, new THREE.Color(1, 1, 1).multiplyScalar(0.9 + R() * 0.2));
  });
  // --- rocks: cliffs, coasts, river banks, scattered boulders
  scatter(5, (x, z) => {
    const h = H(x, z), s = S(x, z);
    const coast = -L.coastSDF(x, z);
    const c = L.cliffiness(x, z);
    let p = 0.02;
    if (s > 0.8 && h > 0.5) p = 0.45;
    if (Math.abs(coast) < 4 && c > 0.4) p = 0.5;
    if (riverDist(x, z) < 1.5 && riverDist(x, z) > -0.5) p = 0.25;
    if (L.forestness(x, z) > 0.4) p += 0.04;
    if (h < -1.5 || R() > p || excluded(x, z, 1) || onPath(x, z, 0.5)) return;
    const big = s > 0.8 || (Math.abs(coast) < 4 && c > 0.4);
    const sc = big ? 1.0 + R() * 1.6 : 0.35 + R() * 0.6;
    add('rock', x, h - sc * 0.25, z, sc, Math.floor(R() * 4), new THREE.Color(1, 1, 1).multiplyScalar(0.9 + R() * 0.15), R() * 6.28, (R() - 0.5) * 0.4);
  });
  // beach pebbles & small rocks near shores
  scatter(3.5, (x, z) => {
    const h = H(x, z);
    if (h < -0.4 || h > 0.9 || R() > 0.1 || excluded(x, z, 0.5)) return;
    add('rock', x, h - 0.06, z, 0.12 + R() * 0.25, Math.floor(R() * 4), new THREE.Color(1.05, 1.02, 0.98));
  });
  // --- lily pads on the pond
  scatter(1.5, (x, z) => {
    const pd = Math.hypot(x - L.POND.x, z - L.POND.z);
    if (pd > L.POND.r - 0.8 || pd < 2.2 || Math.hypot(x - L.WATERFALL.x, z - L.WATERFALL.zBottom) < 5.5) return;
    if (R() > 0.4) return;
    add('lily', x, L.POND.level + 0.025, z, 0.7 + R() * 0.6, R() < 0.18 ? 1 : 0, new THREE.Color(1, 1, 1).multiplyScalar(0.85 + R() * 0.3));
  }, L.POND.x - 10, L.POND.z - 10, L.POND.x + 10, L.POND.z + 10);
  // --- coral reef around the palm islet
  const coralCols = [0xf47aa0, 0xff9a5a, 0xb07ae0, 0x5ad0c8, 0xf8d05a, 0xff6a6a];
  scatter(1.9, (x, z) => {
    const d = Math.hypot((x - L.ISLANDS.palm.cx) / 1.2, z - L.ISLANDS.palm.cz);
    const h = H(x, z);
    if (d < 15 || d > 34 || h > -0.55 || h < -3.6 || R() > 0.55) return;
    add('coral', x, h - 0.05, z, 0.7 + R() * 0.9, R() < 0.55 ? 0 : 1, C(coralCols[Math.floor(R() * coralCols.length)]));
  }, 70, 35, 150, 105);

  // ---------------------------------------------------------------- build instanced meshes
  const species = {};
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  for (const name in SPECIES) {
    const cfg = SPECIES[name];
    const list = inst[name];
    if (!list.length) continue;
    const geos = cfg.make();
    // one InstancedMesh per variant geometry
    const variants = geos.map((geo, vi) => {
      const items = list.filter(it => it.v % geos.length === vi);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: cfg.side || THREE.FrontSide });
      patchMaterial(mat, U, { wind: cfg.wind || false, key: `fol_${name}`, extra: sh => { TINT_PATCH(sh); if (cfg.fade) FADE_PATCH(sh); if (cfg.side === THREE.DoubleSide) NOFLIP_PATCH(sh); } });
      const n = items.length;
      const mats = new Float32Array(n * 16), cols = new Float32Array(n * 3), pos = new Float32Array(n * 3);
      items.forEach((it, i) => {
        _e.set(it.tilt || 0, it.ry, (it.tilt || 0) * 0.7, 'YXZ'); _q.setFromEuler(_e);
        _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.s, it.s, it.s));
        _m.toArray(mats, i * 16);
        cols.set([it.col.r, it.col.g, it.col.b], i * 3);
        pos.set([it.x, it.y, it.z], i * 3);
      });
      // bucket grid
      const BC = 12, buckets = new Map();
      items.forEach((it, i) => { const k = Math.floor(it.x / BC) * 4096 + Math.floor(it.z / BC); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); });
      const cap = Math.max(1, Math.min(n, name === 'grass' ? 6000 : name === 'flower' ? 3500 : 2500));
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = !!cfg.shadow;
      mesh.receiveShadow = true;
      mesh.name = `fol_${name}_${vi}`;
      if (cfg.wind) {
        const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        patchMaterial(dm, U, { wind: cfg.wind, cloud: false, wet: false, key: `fold_${name}` });
        mesh.customDepthMaterial = dm;
      }
      group.add(mesh);
      geo.computeBoundingSphere();
      return { mesh, n, mats, cols, pos, buckets, BC, cap, radius: (geo.boundingSphere?.radius || 1) };
    });
    species[name] = { cfg, variants, count: list.length };
  }

  // ---------------------------------------------------------------- culling update
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  const last = new THREE.Vector3(1e9, 0, 0), lastQ = new THREE.Quaternion();
  let timer = 0, forced = true;
  function refresh(focus) {
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    const fd = ctx.quality?.foliageDistance ?? 80;
    FOCUS.value.set(focus.x, focus.y, focus.z, fd * SPECIES.grass.dist);
    let visible = 0;
    for (const name in species) {
      const { cfg, variants } = species[name];
      const R2 = fd * cfg.dist;
      const dens = cfg.fade ? (ctx.quality?.grassDensity ?? 1) : 1;
      for (const v of variants) {
        const { mesh, mats, cols, pos, buckets, BC, cap } = v;
        const im = mesh.instanceMatrix.array, ic = mesh.instanceColor.array;
        let n = 0;
        const r = Math.ceil(R2 / BC);
        const cx = Math.floor(focus.x / BC), cz = Math.floor(focus.z / BC);
        for (let i = -r; i <= r && n < cap; i++) for (let j = -r; j <= r && n < cap; j++) {
          const list = buckets.get((cx + i) * 4096 + cz + j);
          if (!list) continue;
          for (const idx of list) {
            if (dens < 1 && ((Math.imul(idx + 1, 2654435761) >>> 0) % 1000) / 1000 > dens) continue;
            const x = pos[idx * 3], y = pos[idx * 3 + 1], z = pos[idx * 3 + 2];
            const dx = x - focus.x, dz = z - focus.z;
            if (dx * dx + dz * dz > R2 * R2) continue;
            const s = mats[idx * 16 + 5] || 1;
            sph.center.set(x, y + v.radius * s * 0.5, z); sph.radius = v.radius * s + 7;
            if (!frustum.intersectsSphere(sph)) continue;
            for (let k = 0; k < 16; k++) im[n * 16 + k] = mats[idx * 16 + k];
            ic[n * 3] = cols[idx * 3]; ic[n * 3 + 1] = cols[idx * 3 + 1]; ic[n * 3 + 2] = cols[idx * 3 + 2];
            n++;
            if (n >= cap) break;
          }
        }
        mesh.count = n;
        mesh.visible = n > 0;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        visible += n;
      }
    }
    foliage.visible = visible;
  }

  const foliage = {
    group, species, visible: 0,
    counts: Object.fromEntries(Object.entries(inst).map(([k, v]) => [k, v.length])),
    /** Positions of big rocks/trees for colliders (trunks). */
    colliders() {
      const out = [];
      for (const it of inst.pine) out.push({ type: 'circle', x: it.x, z: it.z, r: 0.35 * it.s, tag: 'tree' });
      for (const it of inst.palm) out.push({ type: 'circle', x: it.x, z: it.z, r: 0.3 * it.s, tag: 'tree' });
      for (const it of inst.broadleaf) out.push({ type: 'circle', x: it.x, z: it.z, r: 0.4 * it.s, tag: 'tree' });
      for (const it of inst.rock) if (it.s > 0.42) out.push({ type: 'circle', x: it.x, z: it.z, r: (it.s > 0.55 ? 0.8 : 0.72) * it.s, tag: 'rock' });  // [Fix] knee-high rocks are solid too
      return out;
    },
    /** Force a refresh next frame (after teleports, quality changes). */
    invalidate() { forced = true; },
    update(dt, focus) {
      timer -= dt;
      const cam = ctx.camera;
      const moved = last.distanceToSquared(cam.position) > 1.5 * 1.5 || lastQ.angleTo(cam.quaternion) > 0.06;
      if (forced || (moved && timer <= 0) || timer < -1) {
        refresh(focus);
        last.copy(cam.position); lastQ.copy(cam.quaternion);
        timer = 0.12; forced = false;
      }
    },
  };
  ctx.bus.on('quality:change', () => { forced = true; });
  return foliage;
}
