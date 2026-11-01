// Shared world uniforms + material patches: wind sway (foliage, creatures, cloth), drifting cloud shadows,
// rain wetness and the stylized terrain splat. Every patch is applied with onBeforeCompile and keeps the
// standard three.js lighting/shadows/fog.
import * as THREE from 'three';
import { rng } from '../core/math.js';

/** Tileable value-noise fbm texture (R8), used for cloud shadows, terrain mottling and water detail. */
function makeNoiseTexture(size = 128, seed = 'world-noise') {
  const R = rng(seed);
  const octaves = [[8, 0.5], [16, 0.25], [32, 0.15], [64, 0.1]];
  const grids = octaves.map(([n]) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = R(); return g; });
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    octaves.forEach(([n, a], k) => {
      const g = grids[k];
      const fx = x / size * n, fy = y / size * n;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i, j) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
      const a0 = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const a1 = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      v += (a0 + (a1 - a0) * sy) * a;
    });
    v /= 1.0;
    // second channel: a different, sharper pattern (shifted octaves) for variety
    const o = (y * size + x) * 4;
    data[o] = Math.max(0, Math.min(255, v * 255));
    data[o + 1] = Math.max(0, Math.min(255, (1 - Math.abs(v * 2 - 1)) * 255));
    data[o + 2] = data[(((y * 7 + 31) % size) * size + ((x * 7 + 17) % size)) * 4] || 128;
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Shared uniforms, updated once per frame by World. */
export function createWorldUniforms() {
  return {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector4(0.8, 0.6, 0.35, 0) },   // dir.x, dir.z, strength 0..1.5, gust phase
    uNoise: { value: makeNoiseTexture() },
    uCloudOffset: { value: new THREE.Vector2() },
    uCloudAmt: { value: 0.18 },           // how dark cloud shadows are (0..1)
    uCloudCover: { value: 0.35 },         // fraction of the sky covered
    uWet: { value: 0 },                   // 0..1 rain wetness
    uNight: { value: 0 },
  };
}

const COMMON_PARS = /* glsl */`
uniform float uTime;
uniform vec4 uWind;
uniform sampler2D uNoise;
uniform vec2 uCloudOffset;
uniform float uCloudAmt, uCloudCover, uWet, uNight;
`;

const WIND_VERTEX = /* glsl */`
  {
    #ifdef USE_INSTANCING
      vec3 wOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      mat3 wBasis = mat3(modelMatrix) * mat3(instanceMatrix);
    #else
      vec3 wOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      mat3 wBasis = mat3(modelMatrix);
    #endif
    float wScale2 = max(dot(wBasis[1], wBasis[1]), 1e-4);
    float wH = max(transformed.y, 0.0) * sqrt(wScale2) / uWindHeight;   // 0 at the base, 1 at the reference height
    float wW = wH * wH;
    vec2 wDir = uWind.xy;
    float wPh = dot(wOrigin.xz, vec2(0.071, 0.113));
    float gust = 0.5 + 0.5 * sin(dot(wOrigin.xz, wDir) * 0.06 - uTime * 1.25 + sin(wOrigin.x * 0.02) * 2.0);
    gust = gust * gust;
    float sway = 0.55 + 0.25 * sin(uTime * 1.1 + wPh) + 0.12 * sin(uTime * 2.3 + wPh * 1.9);
    float str = uWind.z * (sway + gust * 0.9);
    vec2 d = wDir * str * wW * uWindAmp;
    // side-to-side wobble + leaf flutter
    d += vec2(-wDir.y, wDir.x) * sin(uTime * 1.7 + wPh * 2.3) * 0.25 * uWind.z * wW * uWindAmp;
    d += vec2(sin(uTime * 7.0 + transformed.x * 4.0 + wPh * 3.0), cos(uTime * 6.1 + transformed.z * 4.0 + wPh)) * 0.035 * uFlutter * (0.4 + uWind.z) * wH;
    vec3 dw = vec3(d.x, -0.35 * dot(d, d), d.y);
    transformed += transpose(wBasis) * dw / wScale2;
  }
`;

const CLOUD_FRAG = /* glsl */`
  {
    vec2 cuv = vWorldPosW.xz * 0.0065 + uCloudOffset;
    float cn = texture2D(uNoise, cuv).r * 0.65 + texture2D(uNoise, cuv * 2.7 + 0.31).r * 0.35;
    float cs = 1.0 - uCloudAmt * smoothstep(1.02 - uCloudCover - 0.12, 1.02 - uCloudCover + 0.12, cn);
    reflectedLight.directDiffuse *= cs;
    reflectedLight.directSpecular *= cs;
  }
`;

/**
 * Patch a built-in material (Standard/Lambert/Phong/Physical) with world features.
 * @param {THREE.Material} mat
 * @param {object} U world uniforms (createWorldUniforms)
 * @param {{wind?:boolean|{amount?:number,height?:number,flutter?:number}, cloud?:boolean, wet?:boolean, terrain?:object, extra?:(shader)=>void, key?:string}} o
 */
export function patchMaterial(mat, U, o = {}) {
  const wind = o.wind ? { amount: 1, height: 3, flutter: 1, ...(o.wind === true ? {} : o.wind) } : null;
  const cloud = o.cloud !== false;
  const prev = mat.onBeforeCompile;
  mat.userData.windCfg = wind;
  mat.userData.U = U;
  if (wind) {
    mat.userData.windUniforms = { uWindAmp: { value: wind.amount }, uWindHeight: { value: wind.height }, uFlutter: { value: wind.flutter } };
  }
  // tall swaying foliage (trees, palms) dithers away where it hides the player from the camera
  const occ = !!wind && wind.height >= 2.5 && o.occlude !== false;
  if (occ && !U.uOccPos) { U.uOccPos = { value: new THREE.Vector3(0, -999, 0) }; U.uOccCam = { value: new THREE.Vector3(0, 50, 0) }; U.uOccOn = { value: 0 }; }
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, U);
    if (wind) Object.assign(shader.uniforms, mat.userData.windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON_PARS + (wind ? 'uniform float uWindAmp, uWindHeight, uFlutter;\n' : '') + 'varying vec3 vWorldPosW;\n')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (wind ? WIND_VERTEX : ''))
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + `
        #ifdef USE_INSTANCING
          vWorldPosW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWorldPosW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON_PARS + 'varying vec3 vWorldPosW;\n')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + (cloud ? CLOUD_FRAG : ''));
    if (o.wet !== false) {
      // rain: darker, a little glossier
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 1.0 - 0.22 * uWet * smoothstep(-0.2, 0.6, vWorldPosW.y);`);
    }
    if (occ) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uOccPos, uOccCam; uniform float uOccOn;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          vec3 ab = uOccPos - uOccCam;
          float tt = clamp(dot(vWorldPosW - uOccCam, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
          float dd = length(vWorldPosW - (uOccCam + ab * tt));
          float fade = (1.0 - smoothstep(1.4, 3.0, dd)) * (1.0 - smoothstep(0.86, 0.95, tt)) * smoothstep(0.25, 0.5, tt) * uOccOn;
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (ign < fade * 0.82) discard;
        }`);
    }
    o.extra?.(shader);
  };
  // worldpos_vertex only runs when needed; force it on with a define
  mat.defines = { ...(mat.defines || {}), USE_WORLD_FEATURES: '' };
  const key = `w${wind ? `${wind.amount}_${wind.height}_${wind.flutter}` : 0}c${+cloud}${occ ? 'o' : ''}${o.key || ''}`;
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}

/**
 * Factory exposed as world.materials. `wind(material, opts)` adds wind sway to any material whose
 * geometry is authored in local space with +Y up (height above the base): instanced or not.
 */
export function createMaterials(U) {
  const cache = new Map();
  const M = {
    U,
    /**
     * Add wind sway to a material (returns the same material).
     * @param {THREE.Material} material
     * @param {{amount?:number, height?:number, flutter?:number}} [opts]
     *   amount: sway in metres at `height` with full wind; height: reference height (m); flutter: leaf jitter.
     */
    wind(material, opts = {}) { return patchMaterial(material, U, { wind: { amount: 0.35, height: 3, flutter: 0.6, ...opts } }); },
    /** Add only cloud shadows + wetness (props, characters). */
    world(material, opts = {}) { return patchMaterial(material, U, { ...opts }); },
    /** Shared vertex-coloured solid material for merged static props. */
    solid() {
      if (!cache.has('solid')) cache.set('solid', patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }), U, { key: 'solid' }));
      return cache.get('solid');
    },
    /** Night-glowing parts (windows, lantern glass): colour = vertex colour * glow intensity. */
    glow() {
      if (!cache.has('glow')) {
        const m = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x6a5a48, fog: true });
        m.userData.dayColor = new THREE.Color(0x5e5a52);
        m.userData.nightColor = new THREE.Color(3.2, 2.5, 1.6);
        cache.set('glow', m);
      }
      return cache.get('glow');
    },
  };
  return M;
}
