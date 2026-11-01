// Swarm creatures:
//   butterflies (day): two-lobed vertex-coloured wings that flap and glide, wandering flight that rests on the
//                      ground with slowly opening wings; a few palettes.
//   fireflies (dusk/night): one THREE.Points cloud, soft additive glow, each point blinks on its own rhythm and
//                      drifts on a smooth noise path near the ground around the player.
import * as THREE from 'three';

const R = Math.random;
const TAU = Math.PI * 2;
const PALETTES = [
  ['#ffb347', '#e0662a', '#3a2418'], // monarch orange
  ['#bfe3ff', '#4f8fe0', '#1d2a4a'], // blue
  ['#fff6c8', '#f2d64a', '#4a3a18'], // lemon
  ['#ffd6ec', '#e47ab6', '#4a2038'], // pink
  ['#ffffff', '#e8e4dc', '#3a3a3a'], // cabbage white
];

function wingGeo(pal, side) {
  // fan of rings around the wing root; r(θ) = two lobes (fore + hind wing)
  const inner = new THREE.Color(pal[0]), mid = new THREE.Color(pal[1]), edge = new THREE.Color(pal[2]);
  const N = 22, RINGS = 3, pos = [0, 0, 0], cols = [inner.r, inner.g, inner.b], idx = [];
  const radius = th => { const fore = 0.11 * Math.exp(-(((th - 0.55) / 0.55) ** 2)); const hind = 0.075 * Math.exp(-(((th + 0.65) / 0.5) ** 2)); return 0.012 + fore + hind; };
  const c = new THREE.Color();
  for (let r = 1; r <= RINGS; r++) {
    const k = r / RINGS;
    for (let i = 0; i <= N; i++) {
      const th = -1.45 + (i / N) * 2.9; // from back-low to front-high
      const rr = radius(th) * k;
      pos.push(side * Math.cos(th) * rr, 0, Math.sin(th) * rr);
      c.copy(inner).lerp(mid, Math.min(1, k * 1.3)).lerp(edge, k > 0.9 ? 0.85 : 0);
      if (k > 0.9 && (i % 5 === 2)) c.set('#ffffff');
      cols.push(c.r, c.g, c.b);
    }
  }
  const ring = r => 1 + (r - 1) * (N + 1);
  for (let i = 0; i < N; i++) idx.push(0, ring(1) + i, ring(1) + i + 1);
  for (let r = 1; r < RINGS; r++) for (let i = 0; i < N; i++) { const a = ring(r) + i, b = ring(r + 1) + i; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(side > 0 ? idx : idx.map((v, i) => idx[i - (i % 3) + (2 - (i % 3))]));
  g.computeVertexNormals();
  return g;
}

export function createButterflies(ctx, env, root, fx, def = {}) {
  const group = new THREE.Group(); group.name = 'Butterflies'; root.add(group);
  const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.8 });
  const bodyGeo = new THREE.CapsuleGeometry(0.008, 0.05, 3, 6); bodyGeo.rotateX(Math.PI / 2);
  const geos = PALETTES.map(p => [wingGeo(p, 1), wingGeo(p, -1)]);
  const list = [];
  let target = 0, active = false;
  const land = (x, z) => !env.isWater(x, z);

  function spawn(info, at) {
    const s = at || env.findSpot(info.player.x, info.player.z, 3, 18, land, R, 30);
    if (!s) return null;
    const k = Math.floor(R() * PALETTES.length);
    const o = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const wl = new THREE.Mesh(geos[k][0], wingMat), wr = new THREE.Mesh(geos[k][1], wingMat);
    o.add(body, wl, wr); group.add(o);
    const b = { o, wl, wr, pos: new THREE.Vector3(s.x, env.ground(s.x, s.z) + 0.6 + R(), s.z), home: new THREE.Vector3(s.x, 0, s.z), vel: new THREE.Vector3(), t: R() * 100, seed: R() * 100, state: 'fly', stateT: 4 + R() * 6, fade: 0, leaving: false, size: 2 + R() * 0.7, flap: 0 };
    list.push(b);
    return b;
  }

  function step(b, dt, info) {
    b.t += dt; b.stateT -= dt;
    b.fade += ((b.leaving ? 0 : 1) - b.fade) * Math.min(1, dt * 2);
    const gy = env.ground(b.pos.x, b.pos.z);
    if (b.state === 'fly') {
      const s = b.seed, t = b.t;
      // wandering: smooth sum of sines + gentle pull home + avoid water
      const want = new THREE.Vector3(Math.sin(t * 0.7 + s) + Math.sin(t * 1.9 + s * 2) * 0.5, 0, Math.cos(t * 0.6 + s * 3) + Math.sin(t * 1.3 + s) * 0.5).multiplyScalar(0.9);
      want.x += (b.home.x - b.pos.x) * 0.08; want.z += (b.home.z - b.pos.z) * 0.08;
      if (env.isWater(b.pos.x, b.pos.z)) { want.x += (b.home.x - b.pos.x) * 0.5; want.z += (b.home.z - b.pos.z) * 0.5; }
      const alt = 0.5 + (Math.sin(t * 0.9 + s) * 0.5 + 0.5) * 1.1;
      want.y = (gy + alt - b.pos.y) * 1.5 + Math.sin(t * 9 + s) * 0.25;
      b.vel.lerp(want, Math.min(1, dt * 2.5));
      b.pos.addScaledVector(b.vel, dt);
      b.flap = Math.sin(t * 22 + s);
      const ang = Math.abs(b.flap) ** 0.7 * 1.25;
      b.wl.rotation.z = ang; b.wr.rotation.z = -ang;
      const hs = Math.hypot(b.vel.x, b.vel.z);
      if (hs > 0.05) b.o.rotation.y = Math.atan2(b.vel.x, b.vel.z);
      b.o.rotation.x = -0.25;
      if (b.stateT < 0 && land(b.pos.x, b.pos.z)) { b.state = 'rest'; b.stateT = 3 + R() * 5; }
      // drift the home with the player so they stay around
      b.home.lerp(new THREE.Vector3(info.player.x, 0, info.player.z), dt * 0.02);
    } else {
      b.pos.y += (gy + 0.04 - b.pos.y) * Math.min(1, dt * 3);
      const open = (Math.sin(b.t * 1.6 + b.seed) * 0.5 + 0.5) * 1.3;
      b.wl.rotation.z = open; b.wr.rotation.z = -open;
      b.o.rotation.x *= 0.9;
      if (b.stateT < 0 || Math.hypot(b.pos.x - info.player.x, b.pos.z - info.player.z) < 1.5) { b.state = 'fly'; b.stateT = 5 + R() * 8; b.vel.set(0, 1.2, 0); }
    }
    b.o.position.copy(b.pos);
    b.o.scale.setScalar(b.size * Math.max(0.001, b.fade));
    b.o.visible = b.fade > 0.01;
  }

  return {
    group, get list() { return list; },
    setActive(on, info, n) { active = on; target = on ? n : 0; for (const b of list) b.leaving = !on; },
    setCount(n) { target = n; },
    update(dt, t, info) {
      if (active) { let alive = list.filter(b => !b.leaving && !b.pinned).length, g = 0; while (alive < target && g++ < 4) { if (!spawn(info)) break; alive++; } }
      let extra = list.filter(b => !b.leaving && !b.pinned).length - target;
      for (const b of list) if (extra > 0 && !b.leaving && !b.pinned) { b.leaving = true; extra--; }
      for (const b of list.slice()) {
        if (b.pinned) b.leaving = false; else if (Math.hypot(b.pos.x - info.player.x, b.pos.z - info.player.z) > (info.cull || 70) * 0.6) b.leaving = true;
        step(b, dt, info);
        if (b.leaving && b.fade < 0.02) { b.o.removeFromParent(); list.splice(list.indexOf(b), 1); }
      }
    },
    debugSpawn(x, z, state = 'fly') { const b = spawn({ player: new THREE.Vector3(x, 0, z) }, { x, z }); if (b) { b.fade = 1; b.pinned = true; b.home.set(x, 0, z); b.state = state; b.stateT = state === 'rest' ? 999 : 6; } return b; },
  };
}

// ---------------------------------------------------------------------------------------- fireflies
const FF_VERT = /* glsl */`
  attribute float aPhase;
  attribute float aSize;
  uniform float uTime, uScale, uNight;
  varying float vGlow;
  void main() {
    float blink = pow(max(0.0, sin(uTime * (1.3 + fract(aPhase * 7.3) * 1.4) + aPhase * 6.2831)), 3.0);
    vGlow = (0.15 + 0.85 * blink) * uNight;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale * (0.6 + 0.6 * blink) / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FF_FRAG = /* glsl */`
  uniform vec3 uColor;
  varying float vGlow;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float core = smoothstep(0.35, 0.0, r);
    float halo = smoothstep(1.0, 0.0, r) * 0.45;
    float a = (core + halo * halo) * vGlow;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * (0.6 + core), a);
  }`;

export function createFireflies(ctx, env, root, fx, def = {}) {
  const MAX = 96;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3), phase = new Float32Array(MAX), size = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) { phase[i] = R(); size[i] = 110 + R() * 60; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setDrawRange(0, 0);
  const matl = new THREE.ShaderMaterial({
    vertexShader: FF_VERT, fragmentShader: FF_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uNight: { value: 1 }, uColor: { value: new THREE.Color(def.look?.color || '#d8ff7a') } },
  });
  const points = new THREE.Points(geo, matl); points.name = 'Fireflies'; points.frustumCulled = false; points.renderOrder = 5;
  root.add(points);
  const flies = [];
  let target = 0, active = false, fade = 0, pinnedAt = null;
  const ok = (x, z) => !env.isWater(x, z) || env.depth(x, z) < 0.5;

  function place(f, info, anywhere) {
    const s = env.findSpot(info.player.x, info.player.z, anywhere ? 1.5 : 10, 20, ok, R, 20) || { x: info.player.x + (R() - 0.5) * 20, z: info.player.z + (R() - 0.5) * 20 };
    f.home.set(s.x, 0, s.z); f.seed = R() * 100;
  }
  return {
    points, get list() { return flies; },
    setActive(on, info, n) { if (pinnedAt) return; active = on; target = on ? Math.min(MAX, n) : 0; },
    setCount(n) { target = Math.min(MAX, n); },
    update(dt, t, info) {
      fade += ((active ? 1 : 0) - fade) * Math.min(1, dt * 0.8);
      const night = THREE.MathUtils.clamp((info.night ?? 1) * 1.3, 0.25, 1);
      matl.uniforms.uTime.value = t;
      matl.uniforms.uNight.value = fade * night;
      matl.uniforms.uScale.value = (ctx.renderer?.getPixelRatio?.() || 1) * (ctx.viewport?.height || 800) / 800 * 3.2;
      points.visible = fade > 0.01;
      while (flies.length < target) { const f = { home: new THREE.Vector3(), seed: 0, p: new THREE.Vector3() }; place(f, info, true); flies.push(f); }
      if (!active && fade < 0.02) flies.length = 0;
      else if (flies.length > target && active) flies.length = target;
      for (let i = 0; i < flies.length; i++) {
        const f = flies[i], s = f.seed, tt = t * 0.25;
        if (!pinnedAt && Math.hypot(f.home.x - info.player.x, f.home.z - info.player.z) > 24) place(f, info, false);
        const x = f.home.x + Math.sin(tt + s) * 2.2 + Math.sin(tt * 2.3 + s * 1.7) * 0.8;
        const z = f.home.z + Math.cos(tt * 0.9 + s * 2.1) * 2.2 + Math.sin(tt * 1.7 + s) * 0.8;
        const y = env.ground(x, z) + 0.5 + (Math.sin(tt * 1.4 + s * 3) * 0.5 + 0.5) * 1.6;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      }
      geo.setDrawRange(0, flies.length);
      geo.attributes.position.needsUpdate = true;
    },
    debugSpawn(x, z, n = 30) { pinnedAt = new THREE.Vector3(x, 0, z); active = true; target = n; fade = 1; const info = { player: new THREE.Vector3(x, 0, z) }; for (let i = 0; i < n; i++) { const f = { home: new THREE.Vector3(), seed: 0 }; place(f, info, true); flies.push(f); } },
  };
}
