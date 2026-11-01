// Sky & light: gradient dome with sun, moon, stars and soft clouds; sun (shadows follow the player) and
// hemisphere light driven by ctx.time.lighting(); fog colour/range synced with time and weather.
import * as THREE from 'three';
import { clamp, smoothstep, lerp } from '../core/math.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;
const SKY_FRAG = /* glsl */`
uniform vec3 uSky, uHorizon, uFog, uSunCol, uSunDir, uMoonDir;
uniform float uNight, uCloud, uTime, uSunVis, uMoonVis;
uniform sampler2D uNoise;
uniform vec2 uCloudOffset;
varying vec3 vDir;
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uSky, smoothstep(0.0, 0.42, h));
  col = mix(uFog, col, smoothstep(-0.08, 0.06, h));
  // sun glow + disc
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 8.0) * 0.18 + pow(sd, 90.0) * 0.5) * uSunVis;
  col = mix(col, uSunCol * 1.6 + 0.4, smoothstep(0.9993, 0.9996, sd) * uSunVis);
  // stars
  if (uNight > 0.01 && h > 0.0) {
    vec3 sp = d * 180.0;
    vec3 cell = floor(sp);
    float r = hash13(cell);
    vec3 f = fract(sp) - 0.5;
    float star = step(0.985, r) * (1.0 - smoothstep(0.0, 0.18, length(f))) * (0.6 + 0.4 * sin(uTime * (1.5 + r * 4.0) + r * 50.0));
    col += vec3(0.95, 0.97, 1.0) * star * uNight * smoothstep(0.0, 0.2, h) * (1.0 - uCloud);
  }
  // moon
  float md = max(dot(d, uMoonDir), 0.0);
  float disc = smoothstep(0.99935, 0.99955, md);
  // a soft crescent shading
  vec3 mcol = vec3(0.95, 0.96, 1.0) * (0.75 + 0.25 * smoothstep(0.9994, 0.99975, dot(d, normalize(uMoonDir + vec3(0.004, 0.003, 0.0)))));
  col = mix(col, mcol, disc * uMoonVis);
  col += vec3(0.55, 0.65, 0.9) * pow(md, 40.0) * 0.18 * uMoonVis;
  // clouds on a virtual plane
  if (h > 0.0) {
    vec2 cuv = d.xz / (h + 0.12) * 0.22 + uCloudOffset * 3.0;
    float n = texture2D(uNoise, cuv).r * 0.6 + texture2D(uNoise, cuv * 2.3 + 0.17).r * 0.4;
    float cov = mix(0.62, 0.32, uCloud);
    float c = smoothstep(cov, cov + 0.22, n) * smoothstep(0.0, 0.18, h);
    vec3 ccol = mix(vec3(1.0, 0.99, 0.97), uHorizon * 1.05, 0.25) * mix(1.0, 0.65, uCloud);
    ccol = mix(ccol, uFog * 1.1, uNight * 0.7);
    ccol += uSunCol * pow(sd, 6.0) * 0.25 * uSunVis;
    col = mix(col, ccol, c * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Sun and moon directions (same arcs as core/time.js). */
export function sunMoon(hours, outSun, outMoon) {
  const h = ((hours % 24) + 24) % 24;
  const dayT = (h - 5.6) / (20.4 - 5.6);
  const ang = clamp(dayT, 0, 1) * Math.PI;
  const elev = Math.max(0.12, Math.sin(ang)) * 1.08;
  outSun.set(Math.cos(ang) * Math.cos(elev), Math.sin(elev), 0.45 * Math.cos(elev) + 0.15).normalize();
  if (dayT < 0 || dayT > 1) outSun.y = -0.2 - 0.3 * Math.min(Math.abs(dayT), Math.abs(dayT - 1));
  const nightT = ((h + 24 - 20.4) % 24) / 9.2;
  const mang = clamp(nightT, 0, 1) * Math.PI;
  const melev = Math.max(0.35, Math.sin(mang));
  outMoon.set(Math.cos(mang) * Math.cos(melev) * 0.7, Math.sin(melev), 0.5 * Math.cos(melev) + 0.2).normalize();
}

/**
 * @param {any} ctx
 * @param {object} U world uniforms
 */
export function createSky(ctx, U) {
  const group = new THREE.Group(); group.name = 'Sky';
  const skyU = {
    uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uNight: { value: 0 }, uCloud: { value: 0 }, uTime: U.uTime, uSunVis: { value: 1 }, uMoonVis: { value: 0 }, uNoise: U.uNoise, uCloudOffset: U.uCloudOffset,
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  dome.name = 'skyDome'; dome.renderOrder = -10; dome.frustumCulled = false;
  group.add(dome);

  // ---- lights
  const hemi = new THREE.HemisphereLight(0xc4ecff, 0xc2b088, 1.05);
  const sun = new THREE.DirectionalLight(0xfff0d4, 2.6);
  sun.name = 'sun';
  sun.castShadow = true;
  const SB = 30;
  Object.assign(sun.shadow.camera, { left: -SB, right: SB, top: SB, bottom: -SB, near: 1, far: 220 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2.5;
  sun.shadow.mapSize.setScalar(ctx.quality?.shadowMapSize || 2048);
  group.add(hemi, sun, sun.target);

  const sunV = new THREE.Vector3(), moonV = new THREE.Vector3(), focus = new THREE.Vector3(), _v = new THREE.Vector3();
  const fogCol = new THREE.Color();
  const sky = {
    group, dome, sun, hemi, sunDir: sunV, moonDir: moonV,
    /** Shadow box half-size (m). */
    shadowBox: SB,
    update(dt, Lt, env) {
      sunMoon(ctx.time.hours, sunV, moonV);
      const cam = ctx.camera.position;
      dome.position.copy(cam);
      // lights
      focus.copy(ctx.cameraRig?.lookTarget || cam);
      sun.color.copy(Lt.sun);
      sun.intensity = Lt.sunIntensity * (env.sunMul ?? 1);
      // keep the light direction from the palette but stop it from grazing too low (long ugly shadows)
      _v.copy(Lt.sunDir); if (_v.y < 0.28) { _v.y = 0.28; _v.normalize(); }
      // texel snapping: stable shadows while the camera glides
      const texel = (SB * 2) / sun.shadow.mapSize.x;
      sun.position.copy(focus).addScaledVector(_v, 120);
      sun.target.position.copy(focus);
      // snap in light space
      const m = sun.shadow.camera.matrixWorldInverse;
      if (m) {
        const p = _v.copy(focus).applyMatrix4(m);
        const sx = Math.round(p.x / texel) * texel - p.x, sy = Math.round(p.y / texel) * texel - p.y;
        const inv = sun.shadow.camera.matrixWorld;
        const right = new THREE.Vector3().setFromMatrixColumn(inv, 0), up = new THREE.Vector3().setFromMatrixColumn(inv, 1);
        sun.position.addScaledVector(right, sx).addScaledVector(up, sy);
        sun.target.position.addScaledVector(right, sx).addScaledVector(up, sy);
      }
      sun.target.updateMatrixWorld();
      hemi.color.copy(Lt.hemiSky); hemi.groundColor.copy(Lt.hemiGround); hemi.intensity = Lt.hemiIntensity * (env.hemiMul ?? 1);

      // sky dome
      skyU.uSky.value.copy(Lt.sky); skyU.uHorizon.value.copy(Lt.horizon);
      fogCol.copy(Lt.fog);
      if (env.fog > 0) fogCol.lerp(_fogGrey.setRGB(0.62, 0.68, 0.72).multiplyScalar(lerp(1, 0.25, Lt.night)), env.fog * 0.45);
      skyU.uFog.value.copy(fogCol);
      skyU.uSunCol.value.copy(Lt.sun).multiplyScalar(clamp(Lt.sunIntensity / 2.6, 0, 1));
      skyU.uSunDir.value.copy(sunV); skyU.uMoonDir.value.copy(moonV);
      skyU.uNight.value = Lt.night; skyU.uCloud.value = env.cloud;
      skyU.uSunVis.value = smoothstep(-0.05, 0.05, sunV.y) * (1 - env.cloud * 0.85);
      skyU.uMoonVis.value = smoothstep(0.3, 0.8, Lt.night) * (1 - env.cloud * 0.8);

      // fog
      const scene = ctx.scene;
      if (!scene.fog) scene.fog = new THREE.Fog(0xffffff, 40, 180);
      scene.fog.color.copy(fogCol);
      const dd = ctx.quality?.drawDistance ?? 1;
      // far cameras (map/overview/cinematic) push the fog out so the island stays readable
      const lt = ctx.cameraRig?.lookTarget;
      const camExtra = lt && ctx.camera ? Math.max(0, ctx.camera.position.distanceTo(lt) - 34) : 0;
      scene.fog.near = lerp(lerp(46, 26, env.rain), 5, env.fog) + camExtra * 0.9;
      scene.fog.far = lerp(lerp(210, 120, env.rain), 62, env.fog) * lerp(0.8, 1, dd) + camExtra * 1.2;
      if (!scene.background?.isColor) scene.background = new THREE.Color();
      scene.background.copy(fogCol);
    },
  };
  const _fogGrey = new THREE.Color();
  return sky;
}
