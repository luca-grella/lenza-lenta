// Weather: clear / cloudy / rain / fog / storm with smooth transitions, an automatic cozy cycle every few
// game hours (saved), wind (direction + gusts) driving foliage, rain streaks around the camera and splashes.
import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from '../core/math.js';

export const WEATHER_TYPES = ['clear', 'cloudy', 'rain', 'fog', 'storm'];
const PRESET = {
  clear:  { cloud: 0.18, rain: 0, fog: 0,    wind: 0.32, overcast: 0 },
  cloudy: { cloud: 0.72, rain: 0, fog: 0,    wind: 0.55, overcast: 0.45 },
  rain:   { cloud: 0.95, rain: 1, fog: 0.12, wind: 0.65, overcast: 0.78 },
  fog:    { cloud: 0.55, rain: 0, fog: 1,    wind: 0.08, overcast: 0.5 },
  storm:  { cloud: 1,    rain: 1.35, fog: 0.2, wind: 1.25, overcast: 0.92 },
};
// next-weather weights by current type (cozy: mostly clear)
const NEXT = {
  clear:  { clear: 40, cloudy: 35, rain: 10, fog: 12, storm: 3 },
  cloudy: { clear: 40, cloudy: 15, rain: 30, fog: 8, storm: 7 },
  rain:   { clear: 25, cloudy: 45, rain: 15, fog: 10, storm: 5 },
  fog:    { clear: 55, cloudy: 35, rain: 10, fog: 0, storm: 0 },
  storm:  { clear: 10, cloudy: 30, rain: 60, fog: 0, storm: 0 },
};

const RAIN_VERT = /* glsl */`
attribute vec3 aSeed;
uniform float uTime, uBox, uHeight, uLen, uWidth;
uniform vec3 uCenter;
uniform vec2 uWindXZ;
uniform float uAmount;
varying float vA;
void main(){
  float on = step(aSeed.z, uAmount);
  vec3 dir = normalize(vec3(uWindXZ.x * 0.35, -1.0, uWindXZ.y * 0.35));
  float speed = 16.0 + aSeed.z * 6.0;
  float fall = fract(aSeed.y + uTime * speed / uHeight);
  vec3 head;
  head.x = uCenter.x + (fract(aSeed.x * 7.13 + uCenter.x / uBox) - 0.5) * uBox;
  head.z = uCenter.z + (fract(aSeed.x * 3.71 + aSeed.y * 1.9 + uCenter.z / uBox) - 0.5) * uBox;
  head.y = uCenter.y + uHeight * (0.75 - fall);
  head.xz -= dir.xz * (uHeight * (0.75 - fall));
  vec3 tail = head - dir * uLen * (0.7 + aSeed.z * 0.6);
  vec3 p = mix(head, tail, position.y);
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  p += camRight * position.x * uWidth;
  vA = on * (0.22 + 0.26 * aSeed.y) * (1.0 - position.y * 0.8) * smoothstep(0.0, 0.08, fall) * (1.0 - smoothstep(0.85, 1.0, fall));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const RAIN_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA;
void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uColor, vA); }`;

/**
 * @param {any} ctx
 * @param {object} U world uniforms
 * @param {{heightAt:(x:number,z:number)=>number, waterSurfaceAt:(x:number,z:number)=>number|null}} q
 */
export function createWeather(ctx, U, q) {
  const group = new THREE.Group(); group.name = 'Weather';
  const env = { cloud: PRESET.clear.cloud, rain: 0, fog: 0, wind: PRESET.clear.wind, overcast: 0, caveGlow: 0, flash: 0, sunMul: 1, hemiMul: 1 };
  const windDir = new THREE.Vector2(0.8, 0.6).normalize();
  let windAngle = Math.atan2(0.6, 0.8);
  let gust = 0, gustT = 0;
  const saved = ctx.save.state.weather || (ctx.save.state.weather = { type: 'clear' });
  let type = WEATHER_TYPES.includes(saved.type) ? saved.type : 'clear';
  if (saved.until == null) saved.until = absHour() + 4;
  Object.assign(env, { ...PRESET[type], caveGlow: 0, flash: 0, sunMul: 1, hemiMul: 1 });

  function absHour() { return (ctx.time.day || 1) * 24 + ctx.time.hours; }

  // ---- rain streaks (instanced quads)
  const MAXDROPS = 2200;
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  quad.setIndex([0, 2, 1, 1, 2, 3]);
  const seeds = new Float32Array(MAXDROPS * 3);
  let s = 12345; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < MAXDROPS; i++) seeds.set([r(), r(), r()], i * 3);
  quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
  quad.instanceCount = MAXDROPS;
  const rainU = {
    uTime: U.uTime, uBox: { value: 46 }, uHeight: { value: 26 }, uLen: { value: 0.9 }, uWidth: { value: 0.018 },
    uCenter: { value: new THREE.Vector3() }, uWindXZ: { value: new THREE.Vector2() }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0xdfeaf2) },
  };
  const rainMesh = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: rainU, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  rainMesh.frustumCulled = false; rainMesh.renderOrder = 8; rainMesh.name = 'rain'; rainMesh.visible = false;
  group.add(rainMesh);

  // ---- splashes (flat rings on ground/water)
  const SPL = 140;
  const ring = new THREE.RingGeometry(0.55, 0.8, 14).rotateX(-Math.PI / 2);
  const splashes = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }), SPL);
  splashes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SPL * 3), 3);
  splashes.frustumCulled = false; splashes.renderOrder = 7; splashes.name = 'splashes'; splashes.visible = false;
  const spl = Array.from({ length: SPL }, () => ({ x: 0, y: 0, z: 0, age: 9, life: 0.5 }));
  group.add(splashes);
  const _m = new THREE.Matrix4(), _c = new THREE.Color();

  let transition = 1 / 18;  // lambda: ~18 s to settle
  const w = {
    group, env, windDir,
    get type() { return type; },
    PRESET,
    /** Public state (also exposed as world.weather). */
    state: { type, intensity: 0, wind: { x: windDir.x, z: windDir.y, strength: env.wind }, rain: 0, fog: 0, cloud: 0 },
    set(next, { instant = false, duration } = {}) {
      if (!PRESET[next]) { console.warn('[world] unknown weather', next); return; }
      const prev = type;
      type = next;
      saved.type = next;
      saved.until = absHour() + (duration ?? (next === 'storm' ? 2 + Math.random() * 2 : 3 + Math.random() * 4));
      ctx.save.commit();
      if (instant) Object.assign(env, { cloud: PRESET[next].cloud, rain: PRESET[next].rain, fog: PRESET[next].fog, wind: PRESET[next].wind, overcast: PRESET[next].overcast });
      if (prev !== next || instant) ctx.bus.emit('weather:change', { type: next, prev });
    },
    /** Pick a new weather when the current one expires (called on time:hour). */
    tick() {
      if (absHour() < saved.until) return;
      const weights = NEXT[type];
      let total = 0; for (const k in weights) total += weights[k];
      let x = Math.random() * total, pick = 'clear';
      for (const k in weights) { x -= weights[k]; if (x <= 0) { pick = k; break; } }
      // fog likes dawn; storms stay rare at night
      const h = ctx.time.hours;
      if (pick === 'fog' && !(h > 4 && h < 10) && Math.random() < 0.6) pick = 'cloudy';
      w.set(pick);
    },
    update(dt, t, focus) {
      const P = PRESET[type];
      const k = transition;
      env.cloud = damp(env.cloud, P.cloud, k * 1.4, dt);
      env.rain = damp(env.rain, P.rain, k * (P.rain > env.rain ? 1.2 : 0.9), dt);
      env.fog = damp(env.fog, P.fog, k * 0.9, dt);
      env.overcast = damp(env.overcast, P.overcast, k, dt);
      // wind: slow direction drift + gusts
      windAngle += Math.sin(t * 0.013) * dt * 0.02;
      windDir.set(Math.cos(windAngle), Math.sin(windAngle));
      gustT -= dt;
      if (gustT <= 0) { gustT = 4 + Math.random() * 8; gust = Math.random() * 0.4 * (0.5 + P.wind); }
      gust = damp(gust, 0, 0.35, dt);
      env.wind = damp(env.wind, P.wind + gust, 0.6, dt);
      // storm flashes (soft)
      if (type === 'storm' && Math.random() < dt * 0.06) env.flash = 1;
      env.flash = damp(env.flash, 0, 5, dt);
      // rain greys the day further than the core overcast palette (softer shadows, wet dim look)
      const wetDim = clamp(env.rain, 0, 1);
      env.sunMul = (1 - 0.45 * wetDim) * (1 + env.flash * 0.8);
      env.hemiMul = (1 - 0.12 * wetDim) * (1 + env.flash * 1.6);

      U.uWind.value.set(windDir.x, windDir.y, env.wind, gust);
      U.uWet.value = damp(U.uWet.value, clamp(env.rain, 0, 1), env.rain > U.uWet.value ? 0.12 : 0.03, dt);
      U.uCloudCover.value = lerp(0.25, 0.85, env.cloud);
      U.uCloudAmt.value = lerp(0.3, 0.12, env.overcast);
      U.uCloudOffset.value.x += windDir.x * dt * 0.0016 * (0.5 + env.wind);
      U.uCloudOffset.value.y += windDir.y * dt * 0.0016 * (0.5 + env.wind);

      // rain
      const amt = clamp(env.rain, 0, 1.4) / 1.4 * (ctx.quality?.particles ?? 1);
      rainMesh.visible = amt > 0.01;
      splashes.visible = rainMesh.visible;
      if (rainMesh.visible) {
        rainU.uCenter.value.copy(focus); rainU.uCenter.value.y += 2;
        rainU.uWindXZ.value.set(windDir.x * env.wind, windDir.y * env.wind);
        rainU.uAmount.value = amt;
        const Lt = ctx.time.lighting();
        rainU.uColor.value.setRGB(0.85, 0.9, 0.95).multiplyScalar(lerp(1, 0.45, Lt.night));
        // splashes
        const n = Math.floor(SPL * amt);
        for (let i = 0; i < SPL; i++) {
          const sp = spl[i];
          sp.age += dt;
          if (sp.age > sp.life && i < n) {
            sp.x = focus.x + (Math.random() - 0.5) * 34; sp.z = focus.z + (Math.random() - 0.5) * 30;
            const wy = q.waterSurfaceAt(sp.x, sp.z);
            sp.y = (wy != null ? wy : q.groundY(sp.x, sp.z)) + 0.04;
            sp.age = 0; sp.life = 0.35 + Math.random() * 0.25;
          }
          const a = sp.age / sp.life;
          const live = a < 1 && i < n;
          const sc = live ? 0.08 + a * 0.22 : 0.0001;
          _m.makeScale(sc, 1, sc).setPosition(sp.x, sp.y, sp.z);
          splashes.setMatrixAt(i, _m);
          const f = live ? (1 - a) * 0.5 * lerp(1, 0.5, Lt.night) : 0;
          splashes.setColorAt(i, _c.setRGB(f, f, f));
        }
        splashes.instanceMatrix.needsUpdate = true; splashes.instanceColor.needsUpdate = true;
      }
      const st = w.state;
      st.type = type; st.intensity = type === 'clear' ? env.cloud * 0.3 : Math.max(env.rain / 1.35, env.fog, env.cloud * 0.6);
      st.wind.x = windDir.x; st.wind.z = windDir.y; st.wind.strength = env.wind;
      st.rain = env.rain; st.fog = env.fog; st.cloud = env.cloud; st.overcast = env.overcast;
    },
  };
  return w;
}
