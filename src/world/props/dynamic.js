// Animated / interactive world objects: the rowboat factory, campfire flames, lighthouse beam, treasure chest.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { P } from './common.js';

const _c = new THREE.Color();
function colorize(g, color, k = 1) {
  g = g.index ? g.toNonIndexed() : g;
  for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
  _c.set(color).multiplyScalar(k);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = _c.r; col[i + 1] = _c.g; col[i + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Rowboat hull geometry (bow toward +z, waterline at y=0). Planked strakes, inner shell, gunwale, thwarts.
 * @returns {{hull:THREE.BufferGeometry, oar:THREE.BufferGeometry, oarlocks:THREE.Vector3[], seat:THREE.Vector3}}
 */
export function boatGeometry({ paint = 0xf4f0e6, stripe = 0x3f8fb8, inner = 0xb07a4a } = {}) {
  const LEN = 3.5, BEAM = 1.35, NZ = 18, NS = 6;
  const halfW = t => { const u = t * 2 - 1; return BEAM / 2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u + 0.08), 2.4)), 0.55); };
  const sheer = t => 0.42 + 0.22 * Math.pow(Math.abs(t * 2 - 1), 2.2) + (t > 0.5 ? 0.08 * (t - 0.5) * 2 : 0);
  const keel = t => -0.32 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t * 2 - 1.05), 3)), 0.6);
  const pts = (t, s, shrink = 0) => {
    // s: 0 = keel, 1 = sheer; cross-section is a soft U
    const w = Math.max(0, halfW(t) - shrink), y0 = keel(t) + shrink, y1 = sheer(t);
    const a = s * Math.PI / 2;
    return [Math.sin(a) * w, y0 + (y1 - y0) * (1 - Math.cos(a)) * 0.85 + (y1 - y0) * 0.15 * s, (t - 0.5) * LEN];
  };
  const shell = (shrink, flip, colors) => {
    const pos = [], col = [];
    const C1 = new THREE.Color(colors[0]), C2 = new THREE.Color(colors[1]), C3 = new THREE.Color(colors[2] ?? colors[0]);
    for (const side of [-1, 1]) for (let i = 0; i < NZ; i++) for (let j = 0; j < NS; j++) {
      const t0 = i / NZ, t1 = (i + 1) / NZ, s0 = j / NS, s1 = (j + 1) / NS;
      const q = [pts(t0, s0, shrink), pts(t1, s0, shrink), pts(t1, s1, shrink), pts(t0, s1, shrink)].map(p => [p[0] * side, p[1], p[2]]);
      let tri = [q[0], q[1], q[2], q[0], q[2], q[3]];
      if ((side > 0) === flip) tri = [q[0], q[2], q[1], q[0], q[3], q[2]];
      const c = j === NS - 1 ? C2 : j === NS - 2 ? C3 : (j % 2 ? C1 : C1.clone().multiplyScalar(0.92));
      for (const p of tri) { pos.push(...p); col.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  };
  const parts = [];
  parts.push(shell(0, false, [paint, stripe, paint]));
  parts.push(shell(0.06, true, [inner, 0x8a5532, inner]));
  // gunwale rim (boxes along the sheer)
  for (const side of [-1, 1]) for (let i = 0; i < NZ; i++) {
    const a = pts(i / NZ, 1), b = pts((i + 1) / NZ, 1);
    const ax = a[0] * side, bx = b[0] * side;
    const len = Math.hypot(bx - ax, b[1] - a[1], b[2] - a[2]);
    const g = new THREE.BoxGeometry(0.09, 0.07, len + 0.02);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(ax, a[1], a[2]), new THREE.Vector3(bx, b[1], b[2]), new THREE.Vector3(0, 1, 0));
    m.setPosition((ax + bx) / 2, (a[1] + b[1]) / 2 + 0.02, (a[2] + b[2]) / 2);
    g.applyMatrix4(m);
    parts.push(colorize(g, 0x8a5532));
  }
  // thwarts (seats) + floor boards
  const seatY = 0.16;
  for (const [z, w] of [[-0.05, 1.18], [0.95, 0.9], [-1.15, 0.85]]) parts.push(colorize(new THREE.BoxGeometry(w, 0.06, 0.3).translate(0, seatY + (z > 0.5 ? 0.06 : 0), z), 0xc89462));
  for (let i = -2; i <= 2; i++) parts.push(colorize(new THREE.BoxGeometry(0.16, 0.03, 2.2).translate(i * 0.19, -0.2, -0.05), i % 2 ? 0x9a6a40 : 0xb07a4a));
  // bow & stern posts
  parts.push(colorize(new THREE.BoxGeometry(0.1, 0.5, 0.12).translate(0, 0.45, LEN / 2 - 0.02), 0x8a5532));
  parts.push(colorize(new THREE.BoxGeometry(0.5, 0.45, 0.08).translate(0, 0.3, -LEN / 2 + 0.06), 0xb07a4a));
  // oarlocks
  const oarlocks = [new THREE.Vector3(-0.66, 0.5, -0.15), new THREE.Vector3(0.66, 0.5, -0.15)];
  for (const o of oarlocks) parts.push(colorize(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6).translate(o.x, o.y, o.z), 0x4c4c54));
  const hull = mergeGeometries(parts, false);
  hull.computeBoundingSphere();
  // oar along +x from the pivot (handle at -x)
  const oarParts = [
    colorize(new THREE.CylinderGeometry(0.03, 0.035, 2.5, 6).rotateZ(Math.PI / 2).translate(0.75, 0, 0), 0xc89462),
    colorize(new THREE.BoxGeometry(0.55, 0.03, 0.17).translate(1.95, 0, 0), 0xc89462),
    colorize(new THREE.BoxGeometry(0.2, 0.032, 0.18).translate(2.05, 0, 0), stripe),
    colorize(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6).rotateZ(Math.PI / 2).translate(-0.42, 0, 0), 0x8a5532),
  ];
  const oar = mergeGeometries(oarParts, false);
  oar.computeBoundingSphere();
  return { hull, oar, oarlocks, seat: new THREE.Vector3(0, seatY + 0.03, -0.05) };
}

let boatMat = null;
/**
 * World API: build a rowboat for the Gameplay boat system.
 * @returns {{object:THREE.Group, hull:THREE.Mesh, oars:THREE.Object3D[], seat:THREE.Object3D, length:number, beam:number}}
 *   object: bow toward local +z, waterline at y=0 (place object.y at the water surface).
 *   oars[0] = left (−x), oars[1] = right (+x): pivots at the oarlocks; rotate .rotation.y to sweep
 *   (positive = blade toward the bow on the right oar; mirrored on the left), .rotation.z to lift the blade.
 *   seat: Object3D at the rower's hip position, facing +z (rotate the rower by π to face the stern).
 */
export function createBoat(world, opts = {}) {
  if (!boatMat) { boatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.FrontSide }); world.materials.world(boatMat); }
  const g = boatGeometry(opts);
  const object = new THREE.Group(); object.name = 'Rowboat';
  const hull = new THREE.Mesh(g.hull, boatMat); hull.castShadow = true; hull.receiveShadow = true;
  object.add(hull);
  const oars = g.oarlocks.map((p, i) => {
    const pivot = new THREE.Group(); pivot.name = i ? 'oarRight' : 'oarLeft';
    pivot.position.copy(p);
    const m = new THREE.Mesh(g.oar, boatMat); m.castShadow = true;
    // left oar points to -x
    if (i === 0) m.rotation.y = Math.PI;
    pivot.add(m);
    // rest pose: blades trailing a little back, dipped
    pivot.rotation.set(0, i === 0 ? 0.35 : -0.35, i === 0 ? 0.28 : -0.28);
    object.add(pivot);
    return pivot;
  });
  const seat = new THREE.Object3D(); seat.name = 'boatSeat'; seat.position.copy(g.seat); object.add(seat);
  return { object, hull, oars, seat, length: 3.5, beam: 1.35 };
}

// ------------------------------------------------------------------ campfire flames
const FLAME_VERT = /* glsl */`
uniform float uTime;
attribute float aPhase;
varying vec2 vUv; varying float vPh;
void main(){
  vUv = uv; vPh = aPhase;
  vec3 p = position;
  float k = uv.y;
  p.x += sin(uTime * 7.0 + aPhase * 6.0 + k * 3.0) * 0.06 * k;
  p.z += cos(uTime * 6.3 + aPhase * 4.0 + k * 2.0) * 0.05 * k;
  p.y *= 0.9 + 0.18 * sin(uTime * 9.0 + aPhase * 10.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FLAME_FRAG = /* glsl */`
uniform float uTime, uBright;
varying vec2 vUv; varying float vPh;
void main(){
  float x = abs(vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  float shape = 1.0 - smoothstep(0.0, 1.0, x / max(0.05, (1.0 - y) * (0.9 + 0.1 * sin(uTime * 11.0 + vPh * 7.0))));
  shape *= smoothstep(0.0, 0.08, y);
  vec3 col = mix(vec3(1.0, 0.95, 0.55), vec3(1.0, 0.45, 0.08), smoothstep(0.1, 0.7, y + x * 0.3));
  col = mix(col, vec3(0.9, 0.18, 0.04), smoothstep(0.65, 1.0, y));
  gl_FragColor = vec4(col * uBright, shape);
}`;
export function createFlames() {
  const geos = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.PlaneGeometry(i === 0 ? 0.75 : 0.5, i === 0 ? 1.15 : 0.8, 1, 4).translate(0, i === 0 ? 0.575 : 0.4, 0);
    g.rotateY(i * Math.PI / 2.5);
    if (i) g.translate(Math.cos(i * 1.7) * 0.18, 0, Math.sin(i * 1.7) * 0.18);
    const ph = new Float32Array(g.attributes.position.count).fill(i * 0.37);
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    geos.push(g);
  }
  const g = mergeGeometries(geos, false);
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uBright: { value: 1.6 } }, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'campfireFlames'; mesh.renderOrder = 9;
  return mesh;
}

// ------------------------------------------------------------------ lighthouse beam
const BEAM_VERT = /* glsl */`varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const BEAM_FRAG = /* glsl */`uniform float uI; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ float along = vUv.y; float edge = pow(abs(dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 1.5);
  float a = (1.0 - along) * (1.0 - along) * (0.35 + 0.65 * edge) * uI;
  gl_FragColor = vec4(uCol * a, a); }`;
export function createBeam() {
  const group = new THREE.Group(); group.name = 'lighthouseBeam';
  const mat = new THREE.ShaderMaterial({ uniforms: { uI: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.92, 0.7) } }, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  for (const s of [1, -1]) {
    // cone from the lamp outward along +x (uv.y: 0 at the lamp, 1 at the far end)
    const g = new THREE.CylinderGeometry(0.4, 4.5, 38, 18, 1, true);
    g.translate(0, 19, 0); g.rotateZ(-Math.PI / 2 * s);
    const m = new THREE.Mesh(g, mat);
    m.rotation.z = s > 0 ? -0.06 : 0.06;
    m.frustumCulled = false;
    group.add(m);
  }
  // uv.y of a CylinderGeometry runs top→bottom; flip so 0 is near the lamp
  for (const m of group.children) { const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
  group.userData.mat = mat;
  group.renderOrder = 10;
  return group;
}

// ------------------------------------------------------------------ treasure chest
export function createChest(material) {
  const group = new THREE.Group(); group.name = 'treasureChest';
  const parts = [
    colorize(new THREE.BoxGeometry(1.0, 0.55, 0.65).translate(0, 0.275, 0), P.woodDark),
    colorize(new THREE.BoxGeometry(1.04, 0.08, 0.69).translate(0, 0.1, 0), P.brass),
    colorize(new THREE.BoxGeometry(1.04, 0.08, 0.69).translate(0, 0.48, 0), P.brass),
    colorize(new THREE.BoxGeometry(0.08, 0.56, 0.69).translate(-0.3, 0.28, 0), P.brass),
    colorize(new THREE.BoxGeometry(0.08, 0.56, 0.69).translate(0.3, 0.28, 0), P.brass),
    colorize(new THREE.BoxGeometry(0.16, 0.2, 0.05).translate(0, 0.45, 0.34), P.brass),
  ];
  const base = new THREE.Mesh(mergeGeometries(parts, false), material);
  base.castShadow = true; base.receiveShadow = true;
  group.add(base);
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.55, -0.32); group.add(lidPivot);
  const lidG = new THREE.CylinderGeometry(0.33, 0.33, 1.0, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(0);
  const lidParts = [colorize(lidG.clone().translate(0, 0, 0.32), P.wood), colorize(new THREE.BoxGeometry(0.08, 0.36, 0.7).translate(-0.3, 0.12, 0.32), P.brass), colorize(new THREE.BoxGeometry(0.08, 0.36, 0.7).translate(0.3, 0.12, 0.32), P.brass)];
  const lid = new THREE.Mesh(mergeGeometries(lidParts, false), material);
  lid.scale.set(1, 0.6, 1);
  lid.castShadow = true;
  lidPivot.add(lid);
  // gold glimmer inside
  const gold = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.25, 0.65).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xf5c542, emissive: 0x6a4a08, roughness: 0.3, metalness: 0.6 }));
  gold.visible = false; group.add(gold);
  let open = 0, target = 0;
  return {
    object: group, lid: lidPivot,
    get open() { return target > 0.5; },
    setOpen(v, instant = false) { target = v ? 1 : 0; if (instant) open = target; gold.visible = target > 0; },
    update(dt) { open += (target - open) * Math.min(1, dt * 3); lidPivot.rotation.x = -open * 1.9; },
  };
}
