// Water: depth-coloured sea with shoreline foam, caustics, glints, rain rings, cave glow and lantern
// reflections; flowing river + plateau creek ribbons; the waterfall pond; the waterfall sheet with mist.
import * as THREE from 'three';
import { clamp, smoothstep, lerp } from '../core/math.js';
import * as L from './layout.js';

const MAX_GLOWS = 4;

const NOISE_FN = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
`;

const SEA_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
uniform float uTime, uWaveAmp;
uniform sampler2D uWaterTex;
uniform float uSize;
varying vec3 vWorld;
varying float vWave;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 uv = wp.xz / uSize + 0.5;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float depth = mix(8.0, texture2D(uWaterTex, clamp(uv, 0.0, 1.0)).r * 8.0, inside);
  float amp = uWaveAmp * (0.35 + 0.65 * smoothstep(0.0, 3.0, depth));
  float w = sin(dot(wp.xz, vec2(0.21, 0.13)) + uTime * 0.9) * 0.5
          + sin(dot(wp.xz, vec2(-0.17, 0.29)) + uTime * 1.3) * 0.3
          + sin(dot(wp.xz, vec2(0.41, -0.33)) + uTime * 1.9) * 0.2;
  wp.y += w * amp;
  vWave = w;
  vWorld = wp.xyz;
  vec4 worldPosition = wp;
  vec3 transformedNormal = normalMatrix * vec3(0.0, 1.0, 0.0);
  #include <shadowmap_vertex>
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SEA_FRAG = /* glsl */`
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform sampler2D uWaterTex, uNoise;
uniform float uTime, uSize, uNight, uRain, uFoam, uCloudAmt, uCloudCover, uDaylight;
uniform vec2 uCloudOffset;
uniform vec3 uShallow, uMid, uDeep, uFoamCol, uSky, uHorizon, uSunCol, uLight, uSunDir, uMoonDir;
uniform vec4 uCave;          // x, z, radius, glow 0..1
uniform vec3 uGlowPos[${MAX_GLOWS}];
uniform vec3 uGlowCol[${MAX_GLOWS}];
varying vec3 vWorld;
varying float vWave;
${NOISE_FN}
float rainRings(vec2 p, float t){
  vec2 cell = floor(p); vec2 f = fract(p);
  float acc = 0.0;
  for (int j = -1; j <= 0; j++) for (int i = -1; i <= 0; i++) {
    vec2 c = cell + vec2(float(i), float(j));
    vec2 o = hash22(c);
    float ph = fract(t * 0.9 + o.x * 7.0);
    vec2 d = p - (c + o);
    float r = length(d);
    float ring = smoothstep(0.06, 0.0, abs(r - ph * 0.55)) * (1.0 - ph);
    acc += ring;
  }
  return acc;
}
void main(){
  vec2 p = vWorld.xz;
  vec2 uv = p / uSize + 0.5;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec4 W = texture2D(uWaterTex, clamp(uv, 0.0, 1.0));
  float depth = mix(8.0, W.r * 8.0, inside);
  float shore = mix(24.0, W.g * 24.0, inside);

  // detail normal from two scrolling noise layers
  float t = uTime;
  vec2 q1 = p * 0.045 + vec2(t * 0.012, t * 0.008);
  vec2 q2 = p * 0.11 - vec2(t * 0.018, -t * 0.013);
  float e = 0.02;
  float h1 = texture2D(uNoise, q1).r, h2 = texture2D(uNoise, q2).r;
  float hx = texture2D(uNoise, q1 + vec2(e, 0.0)).r - h1 + (texture2D(uNoise, q2 + vec2(e, 0.0)).r - h2) * 0.6;
  float hz = texture2D(uNoise, q1 + vec2(0.0, e)).r - h1 + (texture2D(uNoise, q2 + vec2(0.0, e)).r - h2) * 0.6;
  vec3 N = normalize(vec3(-hx * 7.0, 1.0, -hz * 7.0));
  if (uRain > 0.01) {
    float rr = rainRings(p * 1.6, t) * uRain;
    N = normalize(N + vec3(rr * 0.6, 0.0, rr * 0.4));
  }

  // body colour by depth
  vec3 col = mix(uShallow, uMid, smoothstep(0.15, 2.4, depth));
  col = mix(col, uDeep, smoothstep(2.2, 7.5, depth));
  col *= 0.95 + 0.1 * h1;

  // caustics in the shallows
  vec2 cq = p * 0.32;
  float c1 = texture2D(uNoise, cq + vec2(t * 0.035, t * 0.02)).r;
  float c2 = texture2D(uNoise, cq * 1.37 + vec2(-t * 0.027, t * 0.031) + 0.5).r;
  float caus = pow(clamp(1.0 - abs(c1 - c2) * 5.0, 0.0, 1.0), 5.0);
  col += caus * 0.14 * (1.0 - smoothstep(0.2, 3.2, depth)) * uDaylight * vec3(0.9, 1.0, 0.95);

  // lighting (sun + sky), shadows and cloud shadows
  float shadow = 1.0;
  #ifdef USE_SHADOWMAP
    shadow = mix(0.62, 1.0, getShadowMask());
  #endif
  vec2 cuv = p * 0.0065 + uCloudOffset;
  float cn = texture2D(uNoise, cuv).r * 0.65 + texture2D(uNoise, cuv * 2.7 + 0.31).r * 0.35;
  shadow *= 1.0 - uCloudAmt * 0.7 * smoothstep(1.02 - uCloudCover - 0.12, 1.02 - uCloudCover + 0.12, cn);
  col *= uLight * shadow;

  // fresnel sky reflection
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 4.0);
  vec3 refl = mix(uHorizon, uSky, 0.4);
  col = mix(col, refl * mix(1.0, 0.55, uNight), clamp(0.12 + fres * 0.8, 0.0, 0.7));

  // sun / moon glints
  vec3 Hs = normalize(V + uSunDir);
  float spec = pow(max(dot(N, Hs), 0.0), 220.0);
  float sparkle = smoothstep(0.7, 0.78, texture2D(uNoise, p * 0.7 + t * 0.04).r) * pow(max(dot(N, Hs), 0.0), 90.0);
  col += uSunCol * (spec * 1.6 + sparkle * 0.35) * shadow;

  // lantern / window reflections at night (long wobbly streaks toward the viewer)
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    vec3 gp = uGlowPos[i];
    vec2 dv = p - gp.xz;
    vec2 tv = normalize((cameraPosition.xz - gp.xz) + 1e-3);
    float along = dot(dv, tv), across = dot(dv, vec2(-tv.y, tv.x));
    float wob = (texture2D(uNoise, p * 0.4 + t * 0.06).r - 0.5) * 0.8;
    float g = exp(-pow((across + wob) / (0.35 + max(along, 0.0) * 0.08), 2.0)) * exp(-max(along, -along * 4.0) * 0.16);
    col += uGlowCol[i] * g * 0.55;
  }

  // shoreline foam: contact line + bands rolling in, broken by noise
  float br = texture2D(uNoise, p * 0.23 + vec2(t * 0.02, -t * 0.015)).r;
  float br2 = texture2D(uNoise, p * 0.6 - vec2(t * 0.03, t * 0.01)).r;
  float contact = (1.0 - smoothstep(0.0, 0.06 + 0.06 * br, depth)) * (1.0 - smoothstep(0.6, 1.6, shore));
  float phase = shore * 0.7 - t * 0.45 + br * 1.2;
  float bands = smoothstep(0.86, 0.95, sin(phase * 2.2) * 0.5 + 0.5) * (1.0 - smoothstep(0.6, 4.0, shore)) * (1.0 - smoothstep(0.8, 2.0, depth));
  bands *= smoothstep(0.4, 0.62, br2 + 0.1);
  float foam = clamp(max(contact, bands * 0.85), 0.0, 1.0) * uFoam;
  // wave crest highlights out at sea
  foam += smoothstep(0.75, 0.95, vWave * 0.5 + 0.5) * smoothstep(0.65, 0.85, br2) * 0.25 * smoothstep(3.0, 8.0, depth);
  vec3 fcol = uFoamCol * mix(uLight, vec3(length(uLight) * 0.6), 0.3) * mix(1.0, shadow, 0.6);
  col = mix(col, fcol, clamp(foam, 0.0, 1.0));

  // sea cave: bioluminescent pool
  float dc = length(p - uCave.xy);
  if (dc < uCave.z + 3.0 && uCave.w > 0.001) {
    float inPool = 1.0 - smoothstep(uCave.z - 1.0, uCave.z + 2.0, dc);
    float s1 = texture2D(uNoise, p * 0.7 + vec2(t * 0.03, t * 0.02)).r;
    float s2 = step(0.72, texture2D(uNoise, p * 2.1 - t * 0.04).r);
    vec3 glow = vec3(0.15, 0.85, 1.0) * (0.35 + 0.65 * s1) + vec3(0.6, 1.0, 1.0) * s2 * (0.5 + 0.5 * sin(t * 3.0 + p.x * 5.0));
    col += glow * inPool * uCave.w;
  }

  float alpha = mix(0.55, 0.96, smoothstep(0.0, 2.8, depth));
  alpha = max(alpha, foam);
  alpha = mix(alpha, 1.0, smoothstep(5.0, 8.0, depth));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// River / creek / pond: ribbon or disc with per-vertex depth and flow coordinates.
const FLOW_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
attribute float aDepth;
attribute vec2 aFlow;      // across (-1..1), along (metres)
attribute float aRapid;
uniform float uTime;
varying vec3 vWorld;
varying float vDepth, vRapid;
varying vec2 vFlow;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += sin(wp.x * 0.7 + uTime * 2.0) * sin(wp.z * 0.6 - uTime * 1.6) * 0.02 * (1.0 + aRapid * 2.0);
  vWorld = wp.xyz; vDepth = aDepth; vFlow = aFlow; vRapid = aRapid;
  vec4 worldPosition = wp;
  vec3 transformedNormal = normalMatrix * vec3(0.0, 1.0, 0.0);
  #include <shadowmap_vertex>
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FLOW_FRAG = /* glsl */`
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform sampler2D uNoise;
uniform float uTime, uSpeed, uNight, uRain, uDaylight, uFoamAmt, uImpact;
uniform vec3 uShallow, uDeep, uFoamCol, uSky, uSunCol, uLight, uSunDir;
uniform vec4 uRocks[8];     // foam around stones: x, z, radius, -
uniform vec3 uImpactPos;
varying vec3 vWorld;
varying float vDepth, vRapid;
varying vec2 vFlow;
void main(){
  vec2 p = vWorld.xz;
  float t = uTime;
  float sp = uSpeed * (1.0 + vRapid * 1.6);
  vec2 fuv = vec2(vFlow.x * 0.9, vFlow.y * 0.11 - t * sp * 0.11);
  float s1 = texture2D(uNoise, fuv).r;
  float s2 = texture2D(uNoise, vec2(vFlow.x * 2.1 + 0.3, vFlow.y * 0.29 - t * sp * 0.27)).r;
  vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 1.1, vDepth));
  col *= 0.9 + 0.2 * s1;
  // streaks along the flow
  float streak = smoothstep(0.6, 0.85, s2) * 0.35;
  // caustics
  float c1 = texture2D(uNoise, p * 0.35 + vec2(t * 0.05, -t * 0.03)).r;
  float c2 = texture2D(uNoise, p * 0.47 - vec2(t * 0.04, t * 0.05) + 0.4).r;
  float caus = pow(clamp(1.0 - abs(c1 - c2) * 5.0, 0.0, 1.0), 5.0) * (1.0 - smoothstep(0.1, 1.0, vDepth));
  col += caus * 0.12 * uDaylight;
  float shadow = 1.0;
  #ifdef USE_SHADOWMAP
    shadow = mix(0.6, 1.0, getShadowMask());
  #endif
  col *= uLight * shadow;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vec3((s1 - 0.5) * 0.6, 1.0, (s2 - 0.5) * 0.6));
  float fres = pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 4.0);
  col = mix(col, uSky * mix(1.0, 0.5, uNight), clamp(0.1 + fres * 0.7, 0.0, 0.6));
  col += uSunCol * pow(max(dot(N, normalize(V + uSunDir)), 0.0), 160.0) * 1.6 * shadow;
  // foam: banks, rapids, stones, waterfall impact
  float foam = (1.0 - smoothstep(0.02, 0.09 + 0.06 * s1, vDepth)) * 0.8;
  foam = max(foam, smoothstep(0.45, 0.8, s2 + vRapid * 0.45) * vRapid);
  for (int i = 0; i < 8; i++) {
    vec4 r = uRocks[i];
    if (r.z <= 0.0) continue;
    float d = length(p - r.xy) - r.z;
    foam = max(foam, (1.0 - smoothstep(0.0, 0.5 + 0.35 * s1, d)) * smoothstep(0.3, 0.6, s2 + 0.2));
  }
  if (uImpact > 0.0) {
    float d = length(p - uImpactPos.xz);
    float ring = (1.0 - smoothstep(1.0, 4.2 + s1 * 1.2, d)) * smoothstep(0.25, 0.55, s2 + 0.3 - d * 0.05);
    foam = max(foam, ring * uImpact);
  }
  col += streak * uLight * 0.35;
  col = mix(col, uFoamCol * uLight * mix(1.0, shadow, 0.6), clamp(foam * uFoamAmt, 0.0, 1.0));
  float alpha = mix(0.62, 0.95, smoothstep(0.05, 1.0, vDepth));
  alpha = max(alpha, foam * uFoamAmt);
  // soft fade where the ribbon dips under the bank
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const FALL_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FALL_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uLight, uWater, uFoamCol;
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  float t = uTime;
  float v = vUv.y;  // 0 top → 1 bottom
  float s1 = texture2D(uNoise, vec2(vUv.x * 1.6, v * 0.55 - t * 0.9)).r;
  float s2 = texture2D(uNoise, vec2(vUv.x * 3.7 + 0.21, v * 1.1 - t * 1.45)).r;
  float streak = smoothstep(0.45, 0.75, s2 * 0.7 + s1 * 0.5);
  vec3 col = mix(uWater, uFoamCol, 0.35 + streak * 0.55);
  col = mix(col, uFoamCol, smoothstep(0.75, 1.0, v) * 0.8 + smoothstep(0.08, 0.0, v) * 0.6);
  col *= uLight;
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float alpha = (0.72 + 0.28 * streak) * edge;
  alpha *= smoothstep(0.0, 0.03, v);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const MIST_VERT = /* glsl */`
uniform float uTime, uSize;
attribute vec4 aSeed;
varying float vA;
void main(){
  float life = fract(uTime * (0.18 + aSeed.w * 0.12) + aSeed.z);
  vec3 p = position;
  p.x += (aSeed.x - 0.5) * 7.0 * life;
  p.z += (aSeed.y * 0.9 + 0.1) * 4.5 * life;
  p.y += life * (2.0 + aSeed.w * 2.5);
  vA = sin(life * 3.14159) * (0.35 + 0.4 * aSeed.x);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.6 + life * 1.4) * (300.0 / -mv.z);
}`;
const MIST_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c)) * vA;
  gl_FragColor = vec4(uColor, a * 0.55);
}`;

function lightUniforms() { return THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog]); }

/**
 * @param {any} ctx
 * @param {object} U world uniforms
 * @param {object} terrain
 */
export function createWater(ctx, U, terrain) {
  const group = new THREE.Group(); group.name = 'Water';
  const glowPos = Array.from({ length: MAX_GLOWS }, () => new THREE.Vector3(0, -100, 0));
  const glowCol = Array.from({ length: MAX_GLOWS }, () => new THREE.Vector3());

  // ---------------------------------------------------------------- sea
  // camera-following grid, dense in the middle (quadratic spacing), radius 520 m
  const SEG = 72, R = 520;
  const seaGeo = new THREE.PlaneGeometry(2, 2, SEG, SEG).rotateX(-Math.PI / 2);
  { const p = seaGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const f = v => Math.sign(v) * (Math.abs(v) * 0.22 + v * v * 0.78); p.setX(i, f(x) * R); p.setZ(i, f(z) * R); } }
  seaGeo.computeBoundingSphere();
  const seaUniforms = THREE.UniformsUtils.merge([lightUniforms(), {
    uTime: { value: 0 }, uWaveAmp: { value: 0.07 }, uSize: { value: L.SIZE }, uNight: { value: 0 }, uRain: { value: 0 }, uFoam: { value: 1 },
    uDaylight: { value: 1 },
    uShallow: { value: new THREE.Color(0x3fd6c8) }, uMid: { value: new THREE.Color(0x1fa8c0) }, uDeep: { value: new THREE.Color(0x165f96) },
    uFoamCol: { value: new THREE.Color(0xf6fbff) }, uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() }, uLight: { value: new THREE.Color(1, 1, 1) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uCave: { value: new THREE.Vector4(L.CAVE.x, L.CAVE.z, L.CAVE.r, 0) },
    uGlowPos: { value: glowPos }, uGlowCol: { value: glowCol },
  }]);
  seaUniforms.uWaterTex = { value: terrain.waterTex };
  for (const k of ['uNoise', 'uCloudOffset', 'uCloudAmt', 'uCloudCover']) seaUniforms[k] = U[k];
  const seaMat = new THREE.ShaderMaterial({ uniforms: seaUniforms, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, lights: true, fog: true, transparent: true, depthWrite: true });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.name = 'sea'; sea.renderOrder = 2; sea.frustumCulled = false; sea.receiveShadow = true;
  group.add(sea);

  // ---------------------------------------------------------------- flowing water material factory
  const flowMats = [];
  function flowMaterial({ shallow, deep, speed = 1, foam = 1 }) {
    const u = THREE.UniformsUtils.merge([lightUniforms(), {
      uTime: { value: 0 }, uSpeed: { value: speed }, uNight: { value: 0 }, uRain: { value: 0 }, uDaylight: { value: 1 }, uFoamAmt: { value: foam },
      uShallow: { value: new THREE.Color(shallow) }, uDeep: { value: new THREE.Color(deep) }, uFoamCol: { value: new THREE.Color(0xf4fbff) },
      uSky: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uLight: { value: new THREE.Color(1, 1, 1) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uRocks: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) }, uImpact: { value: 0 }, uImpactPos: { value: new THREE.Vector3() },
    }]);
    u.uNoise = U.uNoise;
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, lights: true, fog: true, transparent: true, depthWrite: true });
    flowMats.push(m);
    return m;
  }

  /** Ribbon along a Poly (columns x, z, level, halfWidth). */
  function ribbon(poly, { s0 = 0, s1 = poly.total, extra = 1.6, across = 6, step = 1, rapids = () => 0 } = {}) {
    const rows = Math.ceil((s1 - s0) / step) + 1;
    const pos = [], depth = [], flow = [], rap = [], idx = [];
    for (let r = 0; r < rows; r++) {
      const s = Math.min(s1, s0 + r * step);
      const x = poly.at(s, 0), z = poly.at(s, 1), lvl = poly.at(s, 2), hw = poly.at(s, 3) + extra;
      const [dx, dz] = poly.dir(s);
      const nx = -dz, nz = dx;
      const rp = rapids(s);
      for (let c = 0; c <= across; c++) {
        const a = c / across * 2 - 1;
        const px = x + nx * a * hw, pz = z + nz * a * hw;
        pos.push(px, lvl, pz);
        depth.push(Math.max(0, lvl - terrain.heightAt(px, pz)));
        flow.push(a, s);
        rap.push(rp);
      }
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < across; c++) {
      const a = r * (across + 1) + c, b = a + 1, d = a + across + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setAttribute('aRapid', new THREE.Float32BufferAttribute(rap, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  // fix winding so the ribbon faces up regardless of direction (we render DoubleSide anyway)

  // ---------------------------------------------------------------- river
  // stop where the river meets the sea (level ~0)
  let sEnd = L.RIVER.total;
  for (let s = 0; s < L.RIVER.total; s += 0.5) if (L.RIVER.at(s, 2) < 0.04) { sEnd = s; break; }
  const riverMat = flowMaterial({ shallow: 0x48ccc0, deep: 0x1f8a9e, speed: 1.1 });
  riverMat.side = THREE.DoubleSide;
  const rapidsAt = s => {
    const a = L.RIVER.at(Math.max(0, s - 2), 2), b = L.RIVER.at(Math.min(L.RIVER.total, s + 2), 2);
    return clamp(((a - b) / 4 - 0.02) * 25, 0, 1);
  };
  const river = new THREE.Mesh(ribbon(L.RIVER, { s0: 0, s1: sEnd + 4, extra: 1.8, across: 8, step: 1, rapids: rapidsAt }), riverMat);
  river.name = 'river'; river.renderOrder = 3; river.receiveShadow = true;
  group.add(river);

  // creek on the plateau feeding the waterfall
  const creekMat = flowMaterial({ shallow: 0x52d0c2, deep: 0x2898a6, speed: 1.5 });
  creekMat.side = THREE.DoubleSide;
  const creek = new THREE.Mesh(ribbon(L.CREEK, { extra: 1.1, across: 4, step: 1, rapids: () => 0.35 }), creekMat);
  creek.name = 'creek'; creek.renderOrder = 3;
  group.add(creek);

  // ---------------------------------------------------------------- pond (disc)
  const pondMat = flowMaterial({ shallow: 0x4ccdb0, deep: 0x1b7c8e, speed: 0.15, foam: 1 });
  {
    const P = L.POND, RN = 14, SEGS = 56, rMax = P.r + 2.6;
    const pos = [], depth = [], flow = [], rap = [], idx = [];
    pos.push(P.x, P.level, P.z); depth.push(P.depth); flow.push(0, 0); rap.push(0);
    for (let r = 1; r <= RN; r++) for (let a = 0; a < SEGS; a++) {
      const rr = rMax * r / RN, an = a / SEGS * Math.PI * 2;
      const x = P.x + Math.cos(an) * rr, z = P.z + Math.sin(an) * rr;
      pos.push(x, P.level, z); depth.push(Math.max(0, P.level - terrain.heightAt(x, z))); flow.push(Math.cos(an) * rr * 0.3, Math.sin(an) * rr * 2); rap.push(0);
    }
    for (let a = 0; a < SEGS; a++) idx.push(0, 1 + (a + 1) % SEGS, 1 + a);
    for (let r = 1; r < RN; r++) for (let a = 0; a < SEGS; a++) {
      const i0 = 1 + (r - 1) * SEGS + a, i1 = 1 + (r - 1) * SEGS + (a + 1) % SEGS, j0 = i0 + SEGS, j1 = i1 + SEGS;
      idx.push(i0, i1, j0, i1, j1, j0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setAttribute('aRapid', new THREE.Float32BufferAttribute(rap, 1));
    g.setIndex(idx); g.computeBoundingSphere();
    pondMat.uniforms.uImpact.value = 1;
    pondMat.uniforms.uImpactPos.value.set(L.WATERFALL.x, P.level, L.WATERFALL.zBottom + 0.6);
    pondMat.side = THREE.DoubleSide;
    const pond = new THREE.Mesh(g, pondMat);
    pond.name = 'pond'; pond.renderOrder = 3; pond.receiveShadow = true;
    group.add(pond);
  }

  // ---------------------------------------------------------------- waterfall sheet
  const fallUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uWater: { value: new THREE.Color(0x8ee6e8) }, uFoamCol: { value: new THREE.Color(0xf6fdff) },
  }]);
  fallUniforms.uNoise = U.uNoise;
  const fallMat = new THREE.ShaderMaterial({ uniforms: fallUniforms, vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  {
    const F = L.WATERFALL, CX = 10, CY = 26;
    const pos = [], uv = [], idx = [];
    const top = F.top, bot = L.POND.level - 0.05;
    for (let j = 0; j <= CY; j++) {
      const v = j / CY;
      // lip pushes out, then a slightly curved fall
      const y = lerp(top, bot, Math.pow(v, 1.15));
      const zz = F.zTop + 1.2 * Math.sin(Math.min(v * 4, 1) * Math.PI / 2) + (F.zBottom - F.zTop - 1.2) * Math.pow(v, 1.6) + 0.6;
      for (let i = 0; i <= CX; i++) {
        const u = i / CX;
        const w = F.width * (1 + v * 0.35);
        const x = F.x + (u - 0.5) * w;
        const bulge = Math.sin(u * Math.PI) * 0.35 * (1 - v * 0.5);
        pos.push(x, y, zz + bulge);
        uv.push(u, v);
      }
    }
    for (let j = 0; j < CY; j++) for (let i = 0; i < CX; i++) {
      const a = j * (CX + 1) + i, b = a + 1, c = a + CX + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const fall = new THREE.Mesh(g, fallMat);
    fall.name = 'waterfall'; fall.renderOrder = 5;
    group.add(fall);
  }

  // ---------------------------------------------------------------- mist particles
  const MIST = 70;
  const mistGeo = new THREE.BufferGeometry();
  { const pos = new Float32Array(MIST * 3), seed = new Float32Array(MIST * 4); let s = 1;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < MIST; i++) { pos.set([L.WATERFALL.x + (r() - 0.5) * 4, L.POND.level + 0.2, L.WATERFALL.zBottom + 0.5 + r() * 1.2], i * 3); seed.set([r(), r(), r(), r()], i * 4); }
    mistGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    mistGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(L.WATERFALL.x, L.POND.level + 2, L.WATERFALL.zBottom + 2), 8);
  }
  const mistMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uSize: { value: 2.6 }, uColor: { value: new THREE.Color(0xf2fbff) } }, vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false });
  const mist = new THREE.Points(mistGeo, mistMat);
  mist.name = 'mist'; mist.renderOrder = 6;
  group.add(mist);

  const _c = new THREE.Color();
  const water = {
    group, sea, river, seaMat, flowMats, fallMat, mistMat, glowPos, glowCol,
    /** Set foam rings around stones in the river (x, z, r). */
    setRiverRocks(list) { list.slice(0, 8).forEach((r, i) => riverMat.uniforms.uRocks.value[i].set(r.x, r.z, r.r, 0)); },
    /** Per-frame update from World. */
    update(dt, t, Lt, env) {
      // follow the camera (snapped to the grid spacing so the waves don't swim)
      const cam = ctx.camera.position;
      sea.position.set(Math.round(cam.x / 4) * 4, 0, Math.round(cam.z / 4) * 4);
      const u = seaUniforms;
      u.uTime.value = t;
      u.uNight.value = Lt.night;
      u.uDaylight.value = Lt.daylight;
      u.uRain.value = env.rain;
      u.uWaveAmp.value = 0.06 + env.wind * 0.06;
      u.uSunDir.value.copy(Lt.sunDir);
      // glints: warm sun by day, cool moon at night
      u.uSunCol.value.copy(Lt.sun).multiplyScalar(Lt.sunIntensity / 2.6 * (1 - env.overcast * 0.7));
      u.uSky.value.copy(Lt.sky); u.uHorizon.value.copy(Lt.horizon);
      // ambient-ish light level for the water body
      _c.copy(Lt.sun).multiplyScalar(0.62 * Lt.sunIntensity / 2.6).add(new THREE.Color().copy(Lt.hemiSky).multiplyScalar(0.5 * Lt.hemiIntensity / 1.05));
      if (Lt.night > 0.5) _c.multiplyScalar(lerp(1, 1.25, Lt.night));
      u.uLight.value.copy(_c);
      u.uCave.value.w = env.caveGlow;
      for (const m of flowMats) {
        const fu = m.uniforms;
        fu.uTime.value = t; fu.uNight.value = Lt.night; fu.uDaylight.value = Lt.daylight; fu.uRain.value = env.rain;
        fu.uSunDir.value.copy(Lt.sunDir); fu.uSunCol.value.copy(u.uSunCol.value); fu.uSky.value.copy(Lt.sky); fu.uLight.value.copy(_c);
      }
      fallUniforms.uTime.value = t;
      fallUniforms.uLight.value.copy(_c).multiplyScalar(1.08);
      mistMat.uniforms.uTime.value = t;
      mistMat.uniforms.uColor.value.copy(_c).multiplyScalar(1.05);
    },
  };
  return water;
}
