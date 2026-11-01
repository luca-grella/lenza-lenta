// Game clock (day cycle, phases, events) + a shared time-of-day lighting palette.
import * as THREE from 'three';
import { clamp, smoothstep } from './math.js';

export const PHASES = ['dawn', 'day', 'dusk', 'night'];
/** Phase of a given hour: dawn 5-8, day 8-18, dusk 18-21, night 21-5. */
export function phaseOf(h) {
  h = ((h % 24) + 24) % 24;
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 18) return 'day';
  if (h >= 18 && h < 21) return 'dusk';
  return 'night';
}

// Lighting keyframes. Colours are sRGB hex (converted to linear by THREE.Color.setHex).
const KEYS = [
  { h: 0.0, sky: 0x18233f, horizon: 0x2a3862, fog: 0x233157, sun: 0xa8c0ff, sunI: 0.8, hemiSky: 0x5672c0, hemiGround: 0x232a50, hemiI: 1.0, warmth: -0.35, night: 1 },
  { h: 4.6, sky: 0x18233f, horizon: 0x2a3862, fog: 0x233157, sun: 0xa8c0ff, sunI: 0.8, hemiSky: 0x5672c0, hemiGround: 0x232a50, hemiI: 1.0, warmth: -0.35, night: 1 },
  { h: 5.6, sky: 0x40507f, horizon: 0xd39a8e, fog: 0x7a7392, sun: 0xff9f73, sunI: 0.35, hemiSky: 0x8085b0, hemiGround: 0x3d3649, hemiI: 0.8, warmth: 0.1, night: 0.65 },
  { h: 6.6, sky: 0x8fc4e2, horizon: 0xffc8a0, fog: 0xf0cdb2, sun: 0xffb47c, sunI: 1.7, hemiSky: 0xc9daee, hemiGround: 0xa38c6e, hemiI: 1.0, warmth: 0.3, night: 0 },
  { h: 8.2, sky: 0x9fdcf0, horizon: 0xe2f4f0, fog: 0xc4e6ea, sun: 0xfff0d4, sunI: 2.45, hemiSky: 0xbfe6fb, hemiGround: 0xb5a47e, hemiI: 1.05, warmth: 0.12, night: 0 },
  { h: 13.0, sky: 0xa2e0f3, horizon: 0xe6f6f2, fog: 0xc8e9ec, sun: 0xfff6e8, sunI: 2.6, hemiSky: 0xc0e8fc, hemiGround: 0xb8a882, hemiI: 1.05, warmth: 0.08, night: 0 },
  { h: 16.8, sky: 0x9fd8ee, horizon: 0xfbe4c2, fog: 0xe4e0cb, sun: 0xffe0ac, sunI: 2.45, hemiSky: 0xc8e0f0, hemiGround: 0xbaa07c, hemiI: 1.0, warmth: 0.22, night: 0 },
  { h: 18.7, sky: 0x9db4dc, horizon: 0xffbf86, fog: 0xf2c49c, sun: 0xffc078, sunI: 2.35, hemiSky: 0xf6dcb0, hemiGround: 0xbc9a70, hemiI: 1.12, warmth: 0.42, night: 0 },
  { h: 19.7, sky: 0x8796cc, horizon: 0xffa772, fog: 0xeeb08c, sun: 0xffab62, sunI: 1.75, hemiSky: 0xf2cc9c, hemiGround: 0x9a7a62, hemiI: 1.08, warmth: 0.46, night: 0.08 },
  { h: 20.5, sky: 0x4a568e, horizon: 0xcf8e86, fog: 0x7e7296, sun: 0xff9a78, sunI: 0.55, hemiSky: 0x8a80b4, hemiGround: 0x403a58, hemiI: 0.95, warmth: 0.12, night: 0.55 },
  { h: 21.2, sky: 0x1d2a4a, horizon: 0x303e69, fog: 0x26345c, sun: 0xa8c0ff, sunI: 0.8, hemiSky: 0x5672c0, hemiGround: 0x232a50, hemiI: 1.0, warmth: -0.3, night: 1 },
  { h: 24.0, sky: 0x18233f, horizon: 0x2a3862, fog: 0x233157, sun: 0xa8c0ff, sunI: 0.8, hemiSky: 0x5672c0, hemiGround: 0x232a50, hemiI: 1.0, warmth: -0.35, night: 1 },
];
const COLOR_FIELDS = ['sky', 'horizon', 'fog', 'sun', 'hemiSky', 'hemiGround'];
const NUM_FIELDS = ['sunI', 'hemiI', 'warmth', 'night'];
const _ca = new THREE.Color(), _cb = new THREE.Color(), _grey = new THREE.Color();
const _sunV = new THREE.Vector3(), _moonV = new THREE.Vector3();

/**
 * Time-of-day lighting palette (shared by placeholder/test stages, World sky and post grading).
 * Returns a reused object (do not keep references across frames; copy what you need).
 * @param {number} hours 0..24
 * @param {{overcast?:number}} [opts] overcast 0..1 dims the sun and greys the sky (cloudy/rain/fog).
 * @returns {{sky:THREE.Color, horizon:THREE.Color, fog:THREE.Color, sun:THREE.Color, sunIntensity:number,
 *   hemiSky:THREE.Color, hemiGround:THREE.Color, hemiIntensity:number, sunDir:THREE.Vector3,
 *   moon:boolean, night:number, warmth:number, daylight:number, sunElevation:number}}
 *   sunDir points FROM the scene TOWARD the light (normalized). night 0..1, daylight 0..1, warmth -1..1.
 */
export function lightingAt(hours, opts = {}, out = lightingAt._out) {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smoothstep(0, 1, (h - a.h) / (b.h - a.h));
  for (const f of COLOR_FIELDS) { _ca.setHex(a[f]); _cb.setHex(b[f]); out[f].copy(_ca).lerp(_cb, t); }
  const n = {};
  for (const f of NUM_FIELDS) n[f] = a[f] + (b[f] - a[f]) * t;
  out.sunIntensity = n.sunI; out.hemiIntensity = n.hemiI; out.warmth = n.warmth; out.night = n.night;

  // Sun arc: rises east (+x) at ~5.6, sets west (-x) at ~20.4, leaning a bit toward +z (camera side).
  const dayT = (h - 5.6) / (20.4 - 5.6);
  const ang = clamp(dayT, 0, 1) * Math.PI;
  const elev = Math.max(0.12, Math.sin(ang)) * 1.08; // radians, max ~62°
  _sunV.set(Math.cos(ang) * Math.cos(elev), Math.sin(elev), 0.45 * Math.cos(elev) + 0.15).normalize();
  // Moon: gentle arc in the opposite sky.
  const nightT = ((h + 24 - 20.4) % 24) / 9.2;
  const mang = clamp(nightT, 0, 1) * Math.PI;
  const melev = Math.max(0.35, Math.sin(mang)) * 1.0;
  _moonV.set(Math.cos(mang) * Math.cos(melev) * 0.7, Math.sin(melev), 0.5 * Math.cos(melev) + 0.2).normalize();
  const moonW = smoothstep(0.35, 0.85, out.night);
  out.sunDir.copy(_sunV).lerp(_moonV, moonW).normalize();
  out.moon = moonW > 0.5;
  out.sunElevation = Math.asin(clamp(out.sunDir.y, -1, 1));
  out.daylight = clamp(1 - out.night, 0, 1) * smoothstep(0.0, 0.25, Math.sin(clamp(dayT, 0, 1) * Math.PI) + 0.05);

  const oc = clamp(opts.overcast || 0, 0, 1);
  if (oc > 0) {
    for (const f of ['sky', 'horizon', 'fog']) {
      const c = out[f]; const l = (c.r * 0.3 + c.g * 0.59 + c.b * 0.11);
      _grey.setRGB(l * 1.02, l * 1.04, l * 1.08);
      c.lerp(_grey, oc * 0.75);
    }
    out.sun.lerp(_grey.setRGB(0.9, 0.92, 0.95), oc * 0.5);
    out.sunIntensity *= 1 - 0.72 * oc;
    out.hemiIntensity *= 1 + 0.12 * oc;
    out.warmth *= 1 - 0.6 * oc;
  }
  return out;
}
lightingAt._out = {
  sky: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(),
  hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), sunDir: new THREE.Vector3(0, 1, 0),
  sunIntensity: 1, hemiIntensity: 1, moon: false, night: 0, warmth: 0, daylight: 1, sunElevation: 1,
};

/**
 * @param {{bus:any, save:any}} opts
 */
export function createTime({ bus, save }) {
  const st = save.state.time || (save.state.time = { hours: 8.5, day: 1 });
  let lastHourInt = Math.floor(st.hours);
  let lastSaveT = 0;

  const time = {
    /** 0..24 float. */
    hours: clamp(+st.hours || 8.5, 0, 23.999),
    /** Day counter, starts at 1. */
    day: Math.max(1, st.day | 0),
    /** Real seconds per game hour (default 60 → a day lasts 24 real minutes). */
    scale: 60,
    /** When true the clock doesn't advance (dialogs, cutscenes, menus may set it). */
    paused: false,
    phase: 'day',
    PHASES,
    phaseOf,
    /** 0..1 progress through the day (hours / 24). */
    get dayT() { return time.hours / 24; },
    /** Current lighting palette (see lightingAt). */
    lighting(opts) { return lightingAt(time.hours, opts); },
    /** Palette for any hour. */
    lightingAt,
    /** Advance forward to the next occurrence of `hours` (wraps into the next day if needed). */
    skipTo(h) {
      h = ((h % 24) + 24) % 24;
      let delta = h - time.hours;
      if (delta <= 0) delta += 24;
      advance(delta, true);
    },
    /** Jump directly (debug/tools). Emits phase/day events if they change. */
    set(h, day = time.day) {
      time.hours = ((h % 24) + 24) % 24;
      const dayChanged = day !== time.day;
      time.day = Math.max(1, day | 0);
      lastHourInt = Math.floor(time.hours);
      if (dayChanged) bus.emit('time:day', { day: time.day });
      checkPhase();
      persist(true);
    },
    /** Format as "HH:MM". */
    format(h = time.hours) {
      const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    },
    /** Loop callback (registered by core at order 1). */
    update(dt) {
      if (time.paused || !(time.scale > 0)) return;
      advance(dt / time.scale, false);
      lastSaveT += dt;
      if (lastSaveT > 10) { lastSaveT = 0; persist(false); }
    },
  };

  function checkPhase() {
    const p = phaseOf(time.hours);
    if (p !== time.phase) {
      const prev = time.phase;
      time.phase = p;
      bus.emit('time:phase', { phase: p, prev });
    }
  }

  function persist(commit) {
    st.hours = time.hours; st.day = time.day;
    save.state.time = st;
    if (commit) save.commit();
  }

  function advance(dHours, skipping) {
    let h = time.hours + dHours;
    while (h >= 24) {
      // emit remaining hour ticks before midnight
      for (let k = lastHourInt + 1; k < 24; k++) bus.emit('time:hour', { hour: k, day: time.day, skipping });
      h -= 24; time.day++; lastHourInt = -1;
      time.hours = 0; checkPhase();
      bus.emit('time:day', { day: time.day });
    }
    time.hours = h;
    const hi = Math.floor(h);
    if (hi !== lastHourInt) {
      for (let k = lastHourInt + 1; k <= hi; k++) bus.emit('time:hour', { hour: k, day: time.day, skipping });
      lastHourInt = hi;
      persist(true);
    }
    checkPhase();
  }

  time.phase = phaseOf(time.hours);
  return time;
}
