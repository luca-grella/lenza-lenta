// Terrain: bakes the layout height field into a grid (1 m), builds frustum-culled chunks with smooth vertex
// colours + a stylized per-pixel splat (crisp, wobbly grass/sand/path/rock edges), and answers height queries.
import * as THREE from 'three';
import { clamp, smoothstep, lerp } from '../core/math.js';
import * as L from './layout.js';
import { patchMaterial } from './materials.js';

const RES = L.SIZE;            // cells per side (1 m)
const STRIDE = RES + 1;
const CHUNK = 32;

const C = (hex) => new THREE.Color(hex);
export const PALETTE = {
  sand: C(0xf0dca4), sandWarm: C(0xe9cf92), wetSand: C(0xcfb17c), bed: C(0xc8c088), bedDeep: C(0x6fa898), bedDeeper: C(0x3f7f8a),
  whiteSand: C(0xf4e4b8),
  grassMeadow: C(0x8cc957), grassBase: C(0x72b84a), grassForest: C(0x4f9a3e), grassYellow: C(0xb9cf62),
  dirt: C(0xc19a64), dirt2: C(0xa98454), rock: C(0xa9a49a), rockDark: C(0x86827c), moss: C(0x7aa04a), needles: C(0x8f7a4e),
};

/**
 * @param {any} ctx core ctx
 * @param {object} U world uniforms
 */
export function createTerrain(ctx, U) {
  const t0 = performance.now();
  const H = new Float32Array(STRIDE * STRIDE);
  for (let j = 0; j < STRIDE; j++) for (let i = 0; i < STRIDE; i++) H[j * STRIDE + i] = L.computeHeight(i - L.HALF, j - L.HALF);
  const tHeights = performance.now() - t0;

  /** Height at grid vertex (clamped). */
  const hv = (i, j) => H[clamp(j, 0, RES) * STRIDE + clamp(i, 0, RES)];

  /** Terrain height matching the rendered triangles. Outside the grid: deep sea floor. */
  function heightAt(x, z) {
    const gx = x + L.HALF, gz = z + L.HALF;
    if (gx < 0 || gz < 0 || gx >= RES || gz >= RES) return -14;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const a = H[j * STRIDE + i], d = H[j * STRIDE + i + 1], b = H[(j + 1) * STRIDE + i], c = H[(j + 1) * STRIDE + i + 1];
    if (fx + fz <= 1) return a + (d - a) * fx + (b - a) * fz;
    return c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
  }
  /** Unnormalised gradient magnitude (rise per metre). */
  function slopeAt(x, z) {
    const e = 0.75;
    const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }
  function normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.75;
    return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
  }

  // ---- per-vertex colours & splat masks -------------------------------------------------------
  const q = {};
  const col = new THREE.Color();
  const pathMask = (x, z) => {
    let m = 0;
    for (const p of L.PATHS) { p.query(x, z, 3.5, q); if (q.d < 3.5) m = Math.max(m, 1 - smoothstep(0.75, 1.75, q.d)); }
    for (const p of L.PLAZAS) m = Math.max(m, 1 - smoothstep(p.r - 1.2, p.r + 0.6, Math.hypot(x - p.x, z - p.z)));
    return m;
  };
  const isletW = (x, z) => Math.max(1 - smoothstep(24, 34, Math.hypot(x - L.ISLANDS.palm.cx, z - L.ISLANDS.palm.cz)), 1 - smoothstep(14, 24, Math.hypot(x - L.ISLANDS.turtle.cx, z - L.ISLANDS.turtle.cz)));

  function vertexData(x, z, h, outCol, outMask, k) {
    const s = slopeAt(x, z);
    const isl = isletW(x, z);
    const n = L.noiseB.noise2(x * 0.11, z * 0.11);
    // base ground (what shows where there is no grass): sand family / sea bed
    if (h < 0) {
      const d = -h;
      col.copy(PALETTE.wetSand).lerp(PALETTE.bed, smoothstep(0, 0.6, d));
      col.lerp(PALETTE.bedDeep, smoothstep(1.2, 4.5, d)).lerp(PALETTE.bedDeeper, smoothstep(4.5, 10, d));
      if (isl > 0) col.lerp(PALETTE.whiteSand, isl * (1 - smoothstep(1, 5, d)) * 0.7);
    } else {
      col.copy(PALETTE.wetSand).lerp(PALETTE.sand, smoothstep(0.08, 0.5, h));
      col.lerp(PALETTE.sandWarm, smoothstep(-0.3, 0.6, n) * 0.5);
      if (isl > 0) col.lerp(PALETTE.whiteSand, isl * 0.85);
    }
    outCol[k] = col.r; outCol[k + 1] = col.g; outCol[k + 2] = col.b;
    // masks
    const coast = -L.coastSDF(x, z);
    let grass = h <= 0.2 ? 0 : smoothstep(0.85, 1.45, h + n * 0.28) * smoothstep(3, 8, coast + n * 2);
    grass *= 1 - isl * 0.75 * (1 - smoothstep(1.4, 2.0, h));
    // river / pond banks keep a little sand-free grass right to the water
    const pd = Math.hypot(x - L.POND.x, z - L.POND.z);
    if (pd < L.POND.r + 4 && h > L.POND.level - 0.05) grass = Math.max(grass, smoothstep(L.POND.level + 0.05, L.POND.level + 0.4, h));
    L.RIVER.query(x, z, 8, q);
    let wetBank = 0;
    if (q.d < 8) {
      const lvl = L.RIVER.at(q.s, 2);
      if (lvl > 0.6) grass = Math.max(grass * 0.9, smoothstep(lvl + 0.05, lvl + 0.45, h) * smoothstep(3, 8, coast));
      wetBank = 1 - smoothstep(0.0, 0.5, h - lvl);
    }
    const path = h > 0.15 ? pathMask(x, z) : 0;
    let rock = smoothstep(0.75, 1.15, s + n * 0.12);
    if (h > 0.4) rock = Math.max(rock, smoothstep(1.1, 1.6, s)); // cliffs always rock
    // gravelly river bed
    if (wetBank > 0 && h < L.RIVER.at(q.s, 2)) rock = Math.max(rock, 0.35);
    const lush = L.forestness(x, z);
    outMask[k / 3 * 4] = clamp(grass, 0, 1);
    outMask[k / 3 * 4 + 1] = clamp(path, 0, 1);
    outMask[k / 3 * 4 + 2] = clamp(rock, 0, 1);
    outMask[k / 3 * 4 + 3] = clamp(lush, 0, 1);
  }

  // ---- material -------------------------------------------------------------------------------
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const TU = {
    uGrassMeadow: { value: PALETTE.grassMeadow }, uGrassBase: { value: PALETTE.grassBase }, uGrassForest: { value: PALETTE.grassForest },
    uGrassYellow: { value: PALETTE.grassYellow }, uDirt: { value: PALETTE.dirt }, uDirt2: { value: PALETTE.dirt2 },
    uRock: { value: PALETTE.rock }, uRockDark: { value: PALETTE.rockDark }, uMoss: { value: PALETTE.moss }, uNeedles: { value: PALETTE.needles },
  };
  patchMaterial(mat, U, {
    key: 'terrain', wet: false,
    extra(shader) {
      Object.assign(shader.uniforms, TU);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aMask;\nvarying vec4 vMask;\nvarying vec3 vNrmW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMask = aMask; vNrmW = normal;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vMask; varying vec3 vNrmW;
          uniform vec3 uGrassMeadow, uGrassBase, uGrassForest, uGrassYellow, uDirt, uDirt2, uRock, uRockDark, uMoss, uNeedles;`)
        .replace('#include <color_fragment>', `
          vec2 wp = vWorldPosW.xz;
          float n1 = texture2D(uNoise, wp * 0.021).r;
          float n2 = texture2D(uNoise, wp * 0.093 + 0.37).r;
          float n3 = texture2D(uNoise, wp * 0.0071 + 0.71).r;
          float n4 = texture2D(uNoise, wp * 0.31 + 0.13).r;
          vec3 base = vColor;
          base *= 0.95 + 0.1 * n4;
          // grass: meadow → forest by lushness, patchy light/dark + dry yellow patches in the meadow
          vec3 g = mix(mix(uGrassMeadow, uGrassBase, smoothstep(0.0, 0.5, vMask.w)), uGrassForest, smoothstep(0.35, 1.0, vMask.w));
          g *= 0.84 + 0.3 * smoothstep(0.25, 0.8, n1);
          g = mix(g, g * vec3(0.78, 0.9, 0.82), smoothstep(0.55, 0.8, n2) * 0.6);
          g = mix(g, uGrassYellow, smoothstep(0.6, 0.85, n3) * (1.0 - vMask.w) * 0.55);
          g = mix(g, uNeedles, smoothstep(0.55, 0.8, n2) * smoothstep(0.5, 0.9, vMask.w) * 0.55);
          g *= 0.96 + 0.08 * n4;
          float gm = smoothstep(0.46, 0.54, vMask.x + (n2 - 0.5) * 0.38 + (n4 - 0.5) * 0.12);
          vec3 col = mix(base, g, gm);
          // dirt paths with soft wobbly edges and darker ruts
          float pm = smoothstep(0.42, 0.56, vMask.y + (n2 - 0.5) * 0.32 + (n4 - 0.5) * 0.1);
          vec3 dirt = mix(uDirt, uDirt2, smoothstep(0.3, 0.8, n4));
          col = mix(col, dirt, pm);
          // rock on slopes, moss on its flatter parts
          float rm = smoothstep(0.42, 0.58, vMask.z + (n1 - 0.5) * 0.3);
          vec3 rk = mix(uRockDark, uRock, smoothstep(0.25, 0.75, n2)) * (0.9 + 0.2 * n4);
          rk = mix(rk, uMoss, smoothstep(0.75, 0.95, normalize(vNrmW).y) * 0.6 * step(0.5, vMask.x + 0.3));
          col = mix(col, rk, rm);
          // wet ground in the rain (land only)
          col *= 1.0 - 0.2 * uWet * smoothstep(-0.1, 0.4, vWorldPosW.y);
          diffuseColor.rgb = col;
        `);
    },
  });

  // ---- chunks ---------------------------------------------------------------------------------
  const group = new THREE.Group(); group.name = 'Terrain';
  const chunks = [];
  const nChunks = RES / CHUNK;
  for (let cj = 0; cj < nChunks; cj++) for (let ci = 0; ci < nChunks; ci++) {
    const i0 = ci * CHUNK, j0 = cj * CHUNK;
    let maxH = -Infinity, minH = Infinity;
    for (let j = j0; j <= j0 + CHUNK; j++) for (let i = i0; i <= i0 + CHUNK; i++) { const h = H[j * STRIDE + i]; if (h > maxH) maxH = h; if (h < minH) minH = h; }
    if (maxH < -5.5) continue; // fully under opaque deep water
    const n = CHUNK + 1;
    const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), colr = new Float32Array(n * n * 3), mask = new Float32Array(n * n * 4);
    let k = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, k += 3) {
      const gi = i0 + i, gj = j0 + j;
      const x = gi - L.HALF, z = gj - L.HALF, h = H[gj * STRIDE + gi];
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      const nx = hv(gi - 1, gj) - hv(gi + 1, gj), nz = hv(gi, gj - 1) - hv(gi, gj + 1), ny = 2;
      const l = Math.hypot(nx, ny, nz);
      nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
      vertexData(x, z, h, colr, mask, k);
    }
    const idx = [];
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const a = j * n + i, d = a + 1, b = a + n, c = b + 1;
      idx.push(a, b, d, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 4));
    geo.setIndex(idx);
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `terrain_${ci}_${cj}`;
    mesh.receiveShadow = true;
    mesh.castShadow = maxH > 3;   // only hilly chunks cast (cliffs, plateau)
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    chunks.push({ mesh, minH, maxH, ci, cj });
  }

  // ---- baked water data texture: R = sea depth (0..8 m), G = distance from land (0..24 m), B = land height (0..16 m)
  const TEX = 512;
  const dist = new Float32Array(TEX * TEX);
  const data = new Uint8Array(TEX * TEX * 4);
  const INF = 1e9;
  for (let j = 0; j < TEX; j++) for (let i = 0; i < TEX; i++) {
    const x = (i + 0.5) / TEX * L.SIZE - L.HALF, z = (j + 0.5) / TEX * L.SIZE - L.HALF;
    dist[j * TEX + i] = heightAt(x, z) >= 0 ? 0 : INF;
  }
  // 8SSEDT-lite: two-pass chamfer distance (in texels)
  const a1 = 1, a2 = Math.SQRT2;
  for (let j = 0; j < TEX; j++) for (let i = 0; i < TEX; i++) {
    let d = dist[j * TEX + i]; if (d === 0) continue;
    if (i > 0) d = Math.min(d, dist[j * TEX + i - 1] + a1);
    if (j > 0) { d = Math.min(d, dist[(j - 1) * TEX + i] + a1); if (i > 0) d = Math.min(d, dist[(j - 1) * TEX + i - 1] + a2); if (i < TEX - 1) d = Math.min(d, dist[(j - 1) * TEX + i + 1] + a2); }
    dist[j * TEX + i] = d;
  }
  for (let j = TEX - 1; j >= 0; j--) for (let i = TEX - 1; i >= 0; i--) {
    let d = dist[j * TEX + i]; if (d === 0) continue;
    if (i < TEX - 1) d = Math.min(d, dist[j * TEX + i + 1] + a1);
    if (j < TEX - 1) { d = Math.min(d, dist[(j + 1) * TEX + i] + a1); if (i < TEX - 1) d = Math.min(d, dist[(j + 1) * TEX + i + 1] + a2); if (i > 0) d = Math.min(d, dist[(j + 1) * TEX + i - 1] + a2); }
    dist[j * TEX + i] = d;
  }
  const texel = L.SIZE / TEX;
  for (let j = 0; j < TEX; j++) for (let i = 0; i < TEX; i++) {
    const x = (i + 0.5) / TEX * L.SIZE - L.HALF, z = (j + 0.5) / TEX * L.SIZE - L.HALF;
    const h = heightAt(x, z);
    const o = (j * TEX + i) * 4;
    data[o] = clamp(-h / 8, 0, 1) * 255;
    data[o + 1] = clamp(dist[j * TEX + i] * texel / 24, 0, 1) * 255;
    data[o + 2] = clamp(h / 16, 0, 1) * 255;
    data[o + 3] = 255;
  }
  const waterTex = new THREE.DataTexture(data, TEX, TEX, THREE.RGBAFormat);
  waterTex.magFilter = THREE.LinearFilter; waterTex.minFilter = THREE.LinearFilter;
  waterTex.needsUpdate = true;
  /** distance from land in metres (sea only; 0 on land). */
  function shoreDistance(x, z) {
    const i = clamp(Math.floor((x + L.HALF) / texel), 0, TEX - 1), j = clamp(Math.floor((z + L.HALF) / texel), 0, TEX - 1);
    return Math.min(dist[j * TEX + i] * texel, 99);
  }

  const terrain = {
    group, chunks, material: mat, heights: H, RES, STRIDE,
    heightAt, slopeAt, normalAt, shoreDistance, waterTex,
    stats: { bakeMs: Math.round(performance.now() - t0), heightMs: Math.round(tHeights), chunks: chunks.length },
  };
  return terrain;
}
