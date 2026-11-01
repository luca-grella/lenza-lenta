// Post-processing ("the Unity look"): MSAA scene → subtle bloom → OutputPass (tone map + sRGB)
// → tilt-shift horizontal → tilt-shift vertical + colour grade + vignette + dither (to screen).
// Grading happens in display space so its parameters are intuitive. Disabled on quality 'low'.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { clamp, damp } from './math.js';

/** Renders the scene into its own multisampled target, then copies into the composer read buffer. */
class SceneMSAAPass extends Pass {
  constructor(scene, camera, samples = 4) {
    super();
    this.scene = scene; this.camera = camera; this.needsSwap = false;
    this.samples = samples;
    this.rt = null;
    this.copy = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.fsQuad = new FullScreenQuad(this.copy);
  }
  setSize(w, h) {
    if (this.samples > 0) {
      if (!this.rt) this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.samples });
      else this.rt.setSize(w, h);
    }
  }
  setSamples(n) {
    if (n === this.samples) return;
    this.samples = n;
    if (this.rt) { this.rt.dispose(); this.rt = null; }
  }
  render(renderer, writeBuffer, readBuffer) {
    if (this.samples > 0) {
      if (!this.rt) { const s = readBuffer; this.rt = new THREE.WebGLRenderTarget(s.width, s.height, { type: THREE.HalfFloatType, samples: this.samples }); }
      renderer.setRenderTarget(this.rt);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      this.copy.uniforms.tDiffuse.value = this.rt.texture;
      renderer.setRenderTarget(readBuffer);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(readBuffer);
      renderer.clear();
      renderer.render(this.scene, this.camera);
    }
  }
  dispose() { this.rt?.dispose(); this.copy.dispose(); this.fsQuad.dispose(); }
}

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const TILT_COMMON = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 texel;      // 1/size
uniform vec2 dir;        // (1,0) or (0,1)
uniform float focusY;    // uv y of the focus (0 bottom, 1 top)
uniform float band;      // half height of the sharp band (uv)
uniform float falloff;   // distance over which blur ramps to full (uv)
uniform float radius;    // max blur radius in pixels
varying vec2 vUv;
float tiltAmount(){
  float d = vUv.y - focusY;
  float far = d > 0.0 ? 1.0 : 0.8;   // top of the screen is further away: a bit more blur
  return smoothstep(band, band + falloff, abs(d)) * far;
}
vec3 tiltBlur(){
  float r = tiltAmount() * radius;
  vec3 c0 = texture2D(tDiffuse, vUv).rgb;
  if (r < 0.35) return c0;
  vec3 acc = c0; float wsum = 1.0;
  for (int i = 1; i <= HALF; i++) {
    float x = float(i) / float(HALF);
    float w = exp(-x * x * 2.2);
    vec2 o = dir * texel * x * r;
    acc += (texture2D(tDiffuse, vUv + o).rgb + texture2D(tDiffuse, vUv - o).rgb) * w;
    wsum += 2.0 * w;
  }
  return acc / wsum;
}`;

const TiltShader = {
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() }, dir: { value: new THREE.Vector2(1, 0) }, focusY: { value: 0.45 }, band: { value: 0.1 }, falloff: { value: 0.36 }, radius: { value: 5 } },
  vertexShader: VERT,
  fragmentShader: TILT_COMMON + /* glsl */`
void main(){ gl_FragColor = vec4(tiltBlur(), 1.0); }`,
};

const TiltGradeShader = {
  uniforms: {
    ...THREE.UniformsUtils.clone(TiltShader.uniforms),
    warmth: { value: 0.1 }, saturation: { value: 1.08 }, contrast: { value: 0.12 }, vignette: { value: 0.28 },
    split: { value: 1 }, aspect: { value: 1.6 }, lift: { value: 0.012 }, time: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: VERT,
  fragmentShader: TILT_COMMON + /* glsl */`
uniform float warmth, saturation, contrast, vignette, split, aspect, lift, time;
uniform vec3 tint;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec3 c = tiltBlur() * tint;
  // white balance: warm = more red/yellow, less blue
  c *= vec3(1.0 + 0.07 * warmth, 1.0 + 0.015 * warmth, 1.0 - 0.08 * warmth);
  // split toning: cool shadows, warm highlights (stylised daylight)
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += split * (vec3(-0.010, 0.004, 0.028) * (1.0 - smoothstep(0.0, 0.45, l)) + vec3(0.018, 0.008, -0.016) * smoothstep(0.55, 1.0, l));
  // soft lift of the blacks (never pitch black: cozy)
  c = c * (1.0 - lift) + lift * vec3(0.55, 0.6, 0.85);
  // gentle S-curve
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), contrast);
  // saturation
  float l2 = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l2), c, saturation);
  // vignette, slightly warm-tinted
  vec2 d = (vUv - 0.5) * vec2(min(aspect, 1.8), 1.0);
  float v = smoothstep(0.32, 1.05, length(d) * 1.12) * vignette;
  c *= 1.0 - v;
  c = mix(c, c * vec3(1.02, 0.95, 0.92), v);
  // dither against banding in sky/water gradients
  c += (hash(gl_FragCoord.xy + fract(time) * 61.0) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`,
};

function makePass(shader, half) {
  const p = new Pass();
  p.uniforms = THREE.UniformsUtils.clone(shader.uniforms);
  p.material = new THREE.ShaderMaterial({ uniforms: p.uniforms, vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader, defines: { HALF: half }, depthTest: false, depthWrite: false });
  p.fsQuad = new FullScreenQuad(p.material);
  p.render = (renderer, writeBuffer, readBuffer) => {
    p.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(p.renderToScreen ? null : writeBuffer);
    p.fsQuad.render(renderer);
  };
  p.setHalf = h => { if (p.material.defines.HALF !== h) { p.material.defines.HALF = h; p.material.needsUpdate = true; } };
  p.dispose = () => { p.material.dispose(); p.fsQuad.dispose(); };
  return p;
}

/**
 * @param {{renderer:THREE.WebGLRenderer, scene:THREE.Scene, camera:THREE.Camera, ctx:any}} opts
 */
export function createPost({ renderer, scene, camera, ctx }) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(size.x, size.y);

  const q = ctx.quality;
  const scenePass = new SceneMSAAPass(scene, camera, q?.msaa ?? 4);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.55, 0.92);
  const outputPass = new OutputPass();
  const tiltH = makePass(TiltShader, 5);
  const tiltV = makePass(TiltGradeShader, 5);
  tiltH.uniforms.dir.value.set(1, 0);
  tiltV.uniforms.dir.value.set(0, 1);
  composer.addPass(scenePass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);
  composer.addPass(tiltH);
  composer.addPass(tiltV);

  // user-facing parameters (base) — the time-of-day offset is added on top when `auto` is true
  const params = { tilt: 1, warmth: 0.08, saturation: 1.1, vignette: 0.3, exposure: 1.0, contrast: 0.14, bloom: 0.22, split: 1, lift: 0.012 };
  const live = { warmth: params.warmth, exposure: params.exposure, sat: params.saturation };
  const _p = new THREE.Vector3(), _ndc = new THREE.Vector3();
  let focusSmoothed = 0.45;

  const post = {
    composer,
    passes: { scene: scenePass, bloom: bloomPass, output: outputPass, tiltH, tiltV },
    /** Effective enabled state (false on quality 'low' or when disabled by setEnabled). */
    get enabled() { return userEnabled && !!(ctx.quality?.post ?? true); },
    /** Follow the time-of-day palette for warmth/exposure (dusk warmer, night cooler). */
    auto: true,
    /** World point the tilt-shift band centres on. null → the camera rig's followed object. */
    focus: null,
    /** Read-only current parameters. */
    params,
    /** Draw a frame (called by the loop). Falls back to a plain render when disabled. */
    render() {
      updateUniforms();
      if (!post.enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      composer.render(ctx.loop?.dt || 0.016);
    },
    setEnabled(v) { userEnabled = !!v; },
    /** Tilt-shift strength: 0 off, 1 default (subtle), up to ~2.5 strong miniature. */
    tiltShift(strength) { params.tilt = clamp(+strength || 0, 0, 3); },
    /** Colour grade. Any subset of {warmth -1..1, saturation 0..2, vignette 0..1, exposure 0.3..2, contrast 0..1, split 0..2, lift 0..0.1}. */
    grade(o = {}) {
      for (const k of ['warmth', 'saturation', 'vignette', 'exposure', 'contrast', 'split', 'lift']) if (Number.isFinite(o[k])) params[k] = o[k];
    },
    /** Bloom strength (0 off, default 0.22). Only active on quality 'high'. */
    bloom(strength) { params.bloom = clamp(+strength || 0, 0, 3); },
    /** Point the tilt-shift focus band at a world position (Vector3) or null for the followed player. */
    setFocus(v) { post.focus = v || null; },
    /** Called by core on resize / quality change. */
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      const pw = Math.max(1, Math.round(w * pixelRatio)), ph = Math.max(1, Math.round(h * pixelRatio));
      for (const p of [tiltH, tiltV]) p.uniforms.texel.value.set(1 / pw, 1 / ph);
      tiltV.uniforms.aspect.value = w / Math.max(1, h);
      heightPx = ph;
    },
    applyQuality() {
      const qq = ctx.quality || {};
      scenePass.setSamples(qq.msaa ?? 4);
      const half = Math.max(1, Math.floor((qq.tiltTaps || 7) / 2));
      tiltH.setHalf(half); tiltV.setHalf(half);
      bloomPass.enabled = !!qq.bloom;
    },
    dispose() { composer.dispose?.(); for (const p of composer.passes) p.dispose?.(); },
  };
  let userEnabled = true;
  let heightPx = size.y * pr;

  function updateUniforms() {
    const dt = ctx.loop?.dt || 1 / 60;
    let timeWarmth = 0, timeExposure = 0, timeSat = 0, nightK = 0;
    if (post.auto && ctx.time) {
      const L = ctx.time.lighting();
      timeWarmth = L.warmth * 0.4;
      timeExposure = L.night * 0.14;   // the night palette is dark already: lift it so it stays readable and cozy
      timeSat = -L.night * 0.3;        // moonlight is less saturated
      nightK = L.night;
    }
    live.sat = damp(live.sat, params.saturation + timeSat, 2, dt);
    live.warmth = damp(live.warmth, params.warmth + timeWarmth, 2, dt);
    live.exposure = damp(live.exposure, params.exposure + timeExposure, 2, dt);
    renderer.toneMappingExposure = live.exposure;
    if (!post.enabled) return;

    // focus band: project the followed object (or explicit focus) to screen
    const rig = ctx.cameraRig;
    const fp = post.focus || (rig?.followed ? rig.followPos : rig?.lookTarget);
    let fy = 0.45;
    if (fp) { _ndc.copy(fp).project(camera); if (_ndc.z < 1) fy = clamp(_ndc.y * 0.5 + 0.5, 0.15, 0.85); }
    focusSmoothed = damp(focusSmoothed, fy, 4, dt);
    const portrait = camera.aspect < 1;
    const radius = params.tilt * 0.0036 * heightPx * (portrait ? 0.75 : 1);
    for (const p of [tiltH, tiltV]) {
      const u = p.uniforms;
      u.focusY.value = focusSmoothed; u.radius.value = radius;
      u.band.value = portrait ? 0.11 : 0.15; u.falloff.value = portrait ? 0.34 : 0.42;
    }
    const g = tiltV.uniforms;
    g.warmth.value = live.warmth; g.saturation.value = live.sat; g.vignette.value = params.vignette;
    g.contrast.value = params.contrast; g.split.value = params.split; g.lift.value = params.lift;
    g.time.value = (g.time.value + dt) % 1000;
    live.night = damp(live.night || 0, nightK, 2, dt);
    g.tint.value.set(1 - 0.12 * live.night, 1 - 0.05 * live.night, 1 + 0.1 * live.night); // moonlit blue
    bloomPass.strength = params.bloom;
  }

  post.applyQuality();
  return post;
}
