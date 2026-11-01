// Foraging: World's `forage_*` POIs get an ingredient each game day (seeded by day + spot, following the zones and
// perDay hints in ingredients.js). Picking plays a crouch animation; spots refill the next day.
// Also the one-off moon crystal in the sea cave pool (story step q_crystal, needs the lantern).
//   save.state.forage = { day, picked: {spotId: true}, once: {itemId: true} }
// Emits 'forage:pick' {itemId, spotId, n}.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const colorize = (geo, hex) => {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
};
const P = (geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const g = geo.toNonIndexed ? geo.index ? geo.toNonIndexed() : geo : geo;
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  return colorize(g, hex);
};

/** Small procedural prop for an ingredient (merged, vertex coloured). */
function buildProp(it) {
  const m = it?.model || {};
  const c = m.color || '#8a6a4a', a = m.accent || '#f2e2c0';
  const parts = [];
  const leaf = '#4f8a3e', leaf2 = '#6aa84a';
  switch (m.shape) {
    case 'driftwood':
      parts.push(P(new THREE.CylinderGeometry(0.08, 0.11, 1.0, 7), c, 0, 0.09, 0, 0, 0.4, Math.PI / 2));
      parts.push(P(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 6), a, 0.15, 0.13, 0.12, 0.6, 0.4, Math.PI / 2 - 0.5));
      break;
    case 'shell':
      for (let i = 0; i < 2; i++) parts.push(P(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI), i ? a : c, i * 0.22 - 0.1, 0.03, i * 0.1, -Math.PI / 2, i * 1.2, 0, 1, 1, 0.35));
      break;
    case 'clam':
      parts.push(P(new THREE.SphereGeometry(0.13, 10, 6), c, 0, 0.05, 0, 0, 0, 0, 1, 0.4, 0.8));
      parts.push(P(new THREE.SphereGeometry(0.11, 10, 6), a, 0.22, 0.04, 0.08, 0, 1, 0.3, 1, 0.4, 0.8));
      break;
    case 'seaweed':
      for (let i = 0; i < 5; i++) parts.push(P(new THREE.ConeGeometry(0.05, 0.5 + (i % 3) * 0.12, 5), i % 2 ? c : a, Math.cos(i * 1.3) * 0.12, 0.25, Math.sin(i * 1.3) * 0.12, Math.sin(i) * 0.3, 0, Math.cos(i * 2) * 0.35));
      break;
    case 'salt':
      for (let i = 0; i < 6; i++) parts.push(P(new THREE.IcosahedronGeometry(0.07 + (i % 3) * 0.02, 0), i % 2 ? c : a, Math.cos(i * 2.1) * 0.12, 0.05 + (i > 3 ? 0.08 : 0), Math.sin(i * 2.1) * 0.12));
      break;
    case 'herb':
      for (let i = 0; i < 8; i++) parts.push(P(new THREE.ConeGeometry(0.035, 0.42 + (i % 3) * 0.1, 4), i % 2 ? c : leaf2, Math.cos(i * 0.8) * 0.1, 0.22, Math.sin(i * 0.8) * 0.1, Math.sin(i * 1.7) * 0.35, 0, Math.cos(i * 1.1) * 0.35));
      for (let i = 0; i < 4; i++) parts.push(P(new THREE.SphereGeometry(0.045, 6, 4), a, Math.cos(i * 1.6) * 0.13, 0.46 + (i % 2) * 0.06, Math.sin(i * 1.6) * 0.13));
      break;
    case 'mushroom':
      for (let i = 0; i < 3; i++) {
        const s = [1, 0.7, 0.55][i], x = [0, 0.2, -0.15][i], z = [0, 0.1, 0.16][i];
        parts.push(P(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.22 * s, 7), a, x, 0.11 * s, z));
        parts.push(P(new THREE.SphereGeometry(0.15 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), c, x, 0.2 * s, z, 0, 0, 0, 1, 0.75, 1));
      }
      break;
    case 'berry':
      parts.push(P(new THREE.IcosahedronGeometry(0.3, 1), leaf, 0, 0.25, 0, 0, 0, 0, 1, 0.8, 1));
      parts.push(P(new THREE.IcosahedronGeometry(0.2, 1), leaf2, 0.18, 0.2, 0.1));
      for (let i = 0; i < 9; i++) parts.push(P(new THREE.SphereGeometry(0.05, 6, 4), i % 3 ? c : a, Math.cos(i * 2.3) * 0.27, 0.18 + (i % 4) * 0.08, Math.sin(i * 2.3) * 0.27));
      break;
    case 'pinecone':
      for (let i = 0; i < 3; i++) parts.push(P(new THREE.IcosahedronGeometry(0.09, 0), i ? c : a, i * 0.15 - 0.12, 0.09, (i % 2) * 0.12, 0, i, 0, 0.8, 1.4, 0.8));
      break;
    case 'lemon':
      parts.push(P(new THREE.SphereGeometry(0.11, 10, 8), c, 0, 0.1, 0, 0, 0, 0, 1, 0.85, 1.3));
      parts.push(P(new THREE.SphereGeometry(0.1, 10, 8), c, 0.2, 0.09, 0.1, 0, 0.7, 0, 1, 0.85, 1.3));
      parts.push(P(new THREE.ConeGeometry(0.06, 0.2, 4), a, 0.05, 0.2, -0.12, 1.2, 0, 0, 1, 1, 0.3));
      break;
    case 'coconut':
      parts.push(P(new THREE.IcosahedronGeometry(0.16, 1), c, 0, 0.15, 0));
      parts.push(P(new THREE.IcosahedronGeometry(0.15, 1), c, 0.26, 0.14, 0.08));
      parts.push(P(new THREE.CircleGeometry(0.06, 8), a, 0.26, 0.15, 0.235));
      break;
    case 'crystal':
      parts.push(P(new THREE.OctahedronGeometry(0.22, 0), c, 0, 0.42, 0, 0, 0.3, 0, 0.7, 1.7, 0.7));
      parts.push(P(new THREE.OctahedronGeometry(0.13, 0), a, 0.18, 0.2, 0.06, 0.3, 0, 0.4, 0.7, 1.5, 0.7));
      break;
    default:
      parts.push(P(new THREE.IcosahedronGeometry(0.15, 1), c, 0, 0.13, 0));
  }
  const geo = mergeGeometries(parts);
  geo.computeVertexNormals();
  return geo;
}

export function createForaging(ctx, env) {
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};
  const F = () => { const f = (S().forage ||= {}); f.picked ||= {}; f.once ||= {}; return f; };

  const group = new THREE.Group(); group.name = 'Forage';
  ctx.scene.add(group);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const glowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0x7ad8ff, emissiveIntensity: 1.2 });
  const geoCache = new Map();
  const geoFor = id => { if (!geoCache.has(id)) geoCache.set(id, buildProp(D().get?.(id))); return geoCache.get(id); };

  // sparkles: one Points object for every available spot
  const MAXS = 96;
  const spPos = new Float32Array(MAXS * 3), spPh = new Float32Array(MAXS);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('phase', new THREE.BufferAttribute(spPh, 1));
  const spMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, scale: { value: 300 }, night: { value: 0 } },
    vertexShader: `attribute float phase; uniform float time, scale; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, 0.08 * sin(time * 1.3 + phase * 7.0), 0.0), 1.0);
        float tw = pow(0.5 + 0.5 * sin(time * 2.2 + phase * 6.283), 3.0);
        vA = 0.25 + 0.75 * tw; gl_PointSize = scale * (0.05 + 0.07 * tw) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float night; varying float vA;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p);
        float star = max(0.0, 1.0 - d * 2.2) + max(0.0, 1.0 - abs(p.x) * 14.0) * max(0.0, 1.0 - abs(p.y) * 2.2) * 0.8 + max(0.0, 1.0 - abs(p.y) * 14.0) * max(0.0, 1.0 - abs(p.x) * 2.2) * 0.8;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.75), clamp(star, 0.0, 1.0) * vA * (0.75 + 0.25 * night)); }`,
  });
  const sparkles = new THREE.Points(spGeo, spMat);
  sparkles.frustumCulled = false; sparkles.renderOrder = 6;
  group.add(sparkles);

  /** spotId → {id, x, y, z, zone, itemId, mesh, picked, special} */
  const spots = new Map();
  let builtFor = -1;

  function zoneIngredients(zone) {
    return (D().ingredients || []).filter(g => g.source === 'forage' && g.zones.includes(zone));
  }

  function assign(day) {
    const f = F();
    if (f.day !== day) { f.day = day; f.picked = {}; ctx.save.commit(); }
    for (const s of spots.values()) { if (s.mesh) group.remove(s.mesh); }
    spots.clear();
    const pois = env.listPois('forage_');
    const byZone = new Map();
    for (const p of pois) {
      const zone = p.raw?.zone || p.zone || env.zoneAt(p.x, p.z);
      if (!byZone.has(zone)) byZone.set(zone, []);
      byZone.get(zone).push(p);
    }
    const driftQuest = sys().quests?.current?.id === 'q_driftwood';
    for (const [zone, list] of byZone) {
      const ings = zoneIngredients(zone);
      if (!ings.length) continue;
      const r = ctx.math.rng(`forage-${day}-${zone}`);
      const left = new Map(ings.map(g => [g.id, g.perDay || 2]));
      const order = r.shuffle ? r.shuffle(list.slice()) : list.slice();
      let drift = 0;
      for (const p of order) {
        let id = p.raw?.item && D().get?.(p.raw.item) ? p.raw.item : null;
        if (!id && driftQuest && left.has('ing_driftwood') && drift < 4) { id = 'ing_driftwood'; drift++; }
        if (!id) {
          const pool = ings.filter(g => (left.get(g.id) || 0) > 0);
          const src = pool.length ? pool : ings;
          id = src[Math.floor(r() * src.length)].id;
        }
        left.set(id, (left.get(id) || 1) - 1);
        addSpot(p.id, p.x, p.z, zone, id, false, p.y);
      }
    }
    // the moon crystal (story)
    const pool = env.poi('cave_pool');
    if (pool && env.questDone('q_cave') && !F().once.key_moon_crystal) addSpot('cave_pool', pool.x, pool.z, 'sea_cave', 'key_moon_crystal', true, pool.y);
    builtFor = day;
    refreshSparkles();
  }

  let cullT = 0;
  function addSpot(id, x, z, zone, itemId, special, y0) {
    const picked = !!F().picked[id];
    const y = Number.isFinite(y0) ? y0 : env.groundY(x, z);
    const s = { id, x, y, z, zone, itemId, picked, special };
    const it = D().get?.(itemId);
    const mesh = new THREE.Mesh(geoFor(itemId), it?.model?.glow ? glowMat : mat);
    mesh.position.set(x, y - 0.02, z);
    mesh.rotation.y = (x * 12.9898 + z * 78.233) % 6.28;
    mesh.castShadow = false; mesh.receiveShadow = true;  // [Fix] tiny pickups: no shadow pass (draw-call budget)
    mesh.visible = !picked;
    mesh.userData.spot = id;
    group.add(mesh);
    s.mesh = mesh;
    spots.set(id, s);
  }

  function refreshSparkles() {
    let k = 0;
    for (const s of spots.values()) {
      if (s.picked || k >= MAXS) continue;
      spPos.set([s.x, s.y + 0.65, s.z], k * 3);
      spPh[k] = (s.x * 0.37 + s.z * 0.11) % 1;
      k++;
    }
    spGeo.setDrawRange(0, k);
    spGeo.attributes.position.needsUpdate = true;
    spGeo.attributes.phase.needsUpdate = true;
  }

  const foraging = {
    group,
    get spots() { return [...spots.values()]; },
    /** Available spot near a position (for interact). */
    nearest(pos, radius = 1.6) {
      let best = null, bd = radius;
      for (const s of spots.values()) {
        if (s.picked) continue;
        const d = Math.hypot(s.x - pos.x, s.z - pos.z);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
    canPick(s) {
      if (!s || s.picked) return false;
      const it = D().get?.(s.itemId);
      if (it?.needs === 'lantern' && !sys().inventory?.owns?.('lantern')) return false;
      return true;
    },
    /** Pick a spot (crouch animation, then the item goes to the inventory). */
    pick(spotId, { instant = false } = {}) {
      const s = spots.get(spotId);
      if (!s || s.picked) return false;
      const it = D().get?.(s.itemId);
      if (!foraging.canPick(s)) { env.toast('sys.forage.need_lantern'); return false; }
      s.picked = true;
      F().picked[s.id] = true;
      if (s.special) F().once[s.itemId] = true;
      let n = 1;
      const fb = sys().buffs?.mult?.('forage') || 1;
      if (fb > 1 && Math.random() < fb - 1) n++;
      if (it?.rainBonus && ['rain', 'storm'].includes(env.weather()) && Math.random() < (it.rainBonus - 1) * 0.6) n++;
      ctx.save.commit();
      const p = env.playerPos();
      env.face(Math.atan2(s.x - p.x, s.z - p.z));
      env.setControl(false);
      env.setPlayerState('forage');
      env.play('crouch_pick', { loop: false });
      const give = () => {
        s.popT = 0.001;
        sys().inventory?.add?.(s.itemId, n);
        env.sfx('pickup', { pos: { x: s.x, z: s.z } });
        if (n > 1) env.toast('sys.forage.got_more', { item: env.itemName(s.itemId), n }); else env.toastFB('sys.forage.got', { item: env.itemName(s.itemId), n });
        const st = (S().stats ||= {}); st.forage = (st.forage | 0) + n;
        ctx.bus.emit('forage:pick', { itemId: s.itemId, spotId: s.id, n, zone: s.zone });
        refreshSparkles();
      };
      if (instant) { give(); env.setControl(true); env.setPlayerState('idle'); }
      else {
        s.pending = { t: 0, give, done: false };
      }
      return true;
    },
    update(dt, t) {
      if (builtFor !== ctx.time.day) assign(ctx.time.day);
      spMat.uniforms.time.value = t;
      spMat.uniforms.scale.value = ctx.viewport.height * 0.9;
      const L = ctx.time.lighting?.();
      spMat.uniforms.night.value = L ? L.night : 0;
      glowMat.emissiveIntensity = 0.6 + (L ? L.night * 1.6 : 0) + Math.sin(t * 2) * 0.2;
      // [Fix] distance cull: pickups are tiny, only draw the ones near the player (draw-call budget)
      cullT -= dt;
      const pp = ctx.player?.object?.position;
      if (cullT <= 0 && pp) {
        cullT = 0.4;
        for (const s of spots.values()) if (!s.popT && !s.pending) s.mesh.visible = !s.picked && Math.hypot(s.x - pp.x, s.z - pp.z) < 34;
      }
      for (const s of spots.values()) {
        if (s.pending) {
          s.pending.t += dt;
          if (!s.pending.done && s.pending.t > 0.55) { s.pending.done = true; s.pending.give(); }
          if (s.pending.t > 1.05) { s.pending = null; env.setControl(true); env.setPlayerState('idle'); }
        }
        if (s.popT) {
          s.popT += dt;
          const u = Math.min(1, s.popT / 0.35);
          s.mesh.scale.setScalar(1 + Math.sin(u * Math.PI) * 0.3 - u);
          s.mesh.position.y = s.y + u * 0.4;
          if (u >= 1) { s.mesh.visible = false; s.popT = 0; s.mesh.scale.setScalar(1); s.mesh.position.y = s.y - 0.02; }
        }
      }
    },
    /** Rebuild today's spots (debug/tests, or after World appears). */
    rebuild() { builtFor = -1; },
  };
  ctx.bus.on('time:day', () => { builtFor = -1; });
  ctx.bus.on('quest:start', e => { if (e?.id === 'q_driftwood' || e?.id === 'q_crystal') builtFor = -1; });
  ctx.bus.on('quest:complete', e => { if (e?.id === 'q_cave') builtFor = -1; });
  ctx.bus.on('save:loaded', () => { builtFor = -1; });
  return foraging;
}
