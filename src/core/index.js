// Lenza Lenta — Core. createCore() builds the engine every other module runs on and returns `ctx`.
//
// Quick reference (details in the JSDoc typedefs below and in docs/ARCHITECTURE.md "Core API"):
//   ctx.THREE, ctx.renderer, ctx.scene, ctx.camera, ctx.cameraRig, ctx.loop, ctx.bus, ctx.input,
//   ctx.save, ctx.i18n, ctx.audio, ctx.time, ctx.math, ctx.quality, ctx.post, ctx.debug,
//   ctx.viewport, ctx.params, ctx.isDebug, ctx.haptic(), ctx.ORDER, ctx.createTestStage()
//
// Loop orders: input.update -1000, time 1, systems 10, actors 20, world 30, camera 40, ui 50, watchdog 1000;
// rendering happens after all callbacks (ctx.post.render()).
import * as THREE from 'three';
import { createBus } from './bus.js';
import { createLoop, ORDER } from './loop.js';
import { createSave } from './save.js';
import { createI18n } from './i18n.js';
import { createTime, lightingAt, phaseOf } from './time.js';
import { createInput } from './input.js';
import { createCameraRig, CAMERA_MODES } from './camera.js';
import { createQuality } from './quality.js';
import { createPost } from './post.js';
import { createAudio, attachAutoAudio } from './audio.js';
import { createDebug } from './debug.js';
import { createTestStage } from './stage.js';
import { math } from './math.js';
import * as coreStrings from './strings.js';

export const VERSION = '2.0.0-dev';

/**
 * @typedef {Object} Loop
 * @property {(fn:(dt:number,t:number)=>void, order?:number)=>(()=>void)} add  Register a per-frame callback; returns remover.
 * @property {(fn:Function)=>void} remove
 * @property {()=>void} start
 * @property {()=>void} stop
 * @property {(v?:boolean)=>void} pause  Pause/unpause simulation (scene keeps rendering).
 * @property {boolean} paused   true if paused by pause() or because the page is hidden.
 * @property {number} t   elapsed simulated seconds   @property {number} dt last dt   @property {number} frame
 * @property {number} fps smoothed real fps          @property {number} timeScale  (1 normal)
 * @property {(dt:number)=>void} tick  one simulation step (debug)   @property {()=>void} render
 */

/**
 * @typedef {Object} Input
 * @property {{x:number,z:number,mag:number}} move   camera-relative world-space direction (x,z) and magnitude 0..1
 * @property {{x:number,y:number}} moveScreen  raw stick/keys, x right, y up
 * @property {{down:boolean,held:boolean,up:boolean}} action   main action edges for this frame
 * @property {(name:'action'|'interact'|'bait'|'journal'|'map'|'menu'|'inventory'|'quests')=>boolean} pressed  one-frame press edge
 * @property {(name:string)=>boolean} released
 * @property {(name:string)=>boolean} isDown
 * @property {(v:boolean, source?:string)=>void} setAction   UI action button hold (true on pointerdown, false on up/cancel)
 * @property {(name:string)=>void} press   programmatic one-shot press of a named button
 * @property {(x:number,y:number)=>void} setJoystick   UI joystick, x right / y up, -1..1; (0,0) on release
 * @property {()=>void} clear
 * @property {boolean} enabled   false while a sheet/dialog is open (move=0, action suppressed; pressed() still works)
 * @property {boolean} isTouch
 * @property {'keyboard'|'touch'|'gamepad'} lastDevice
 */

/**
 * @typedef {Object} CameraRig
 * @property {(obj:THREE.Object3D|null)=>void} follow
 * @property {(p:THREE.Vector3|THREE.Object3D|null)=>void} setFocus  look between the followed object and p
 * @property {(mode:'explore'|'fishing'|'boat'|'dialog'|'cinematic')=>void} setMode
 * @property {(shot:{position:THREE.Vector3, lookAt:THREE.Vector3, fov?:number}|null)=>void} setShot  cinematic framing
 * @property {(amount?:number)=>void} shake   0..1 trauma (0.2 small, 0.5 big)
 * @property {()=>void} snap   jump to the goal framing (after teleports)
 * @property {(p:THREE.Vector3, out?:object)=>{x:number,y:number,behind:boolean}} toScreen  normalized 0..1, y down
 * @property {number} zoom  0.7..1.6 (default 1) @property {number} yaw base yaw (0 = camera at +z looking -z)
 * @property {string} mode @property {THREE.Vector3} lookTarget smoothed look point @property {THREE.Vector3} followPos
 * @property {THREE.Vector3} offset extra look offset @property {boolean} wheelZoom
 */

/**
 * @typedef {Object} Ctx
 * @property {typeof THREE} THREE
 * @property {THREE.WebGLRenderer} renderer
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {CameraRig} cameraRig
 * @property {Loop} loop
 * @property {{on:(e:string,fn:Function)=>Function, once:(e:string,fn:Function)=>Function, off:(e:string,fn:Function)=>void, emit:(e:string,p?:any)=>void}} bus
 * @property {Input} input
 * @property {{state:object, commit:()=>void, flush:()=>boolean, reset:()=>void, export:()=>string, import:(d:string|object)=>boolean, firstLaunch:boolean, available:boolean}} save
 * @property {{t:(key:string, vars?:object)=>string, has:(key:string)=>boolean, lang:'it'|'en', chosen:boolean, setLang:(l:'it'|'en')=>void, addStrings:(it:object,en:object)=>void, onChange:(fn:(lang:string)=>void)=>Function}} i18n
 * @property {{unlock:()=>boolean, unlocked:boolean, sfx:(name:string, o?:{vol?:number,pitch?:number,pos?:{x:number,z:number},delay?:number,pan?:number})=>void, setMusic:(mood:string)=>void, setAmbient:(layer:string, v:number|'auto')=>void, setVolumes:(v:{music?:number,sfx?:number,master?:number})=>void, volumes:object, mood:string}} audio
 * @property {{hours:number, day:number, phase:'dawn'|'day'|'dusk'|'night', scale:number, paused:boolean, skipTo:(h:number)=>void, set:(h:number, day?:number)=>void, format:(h?:number)=>string, lighting:(o?:{overcast?:number})=>object, lightingAt:Function, phaseOf:(h:number)=>string}} time
 * @property {typeof math} math
 * @property {{tier:'low'|'mid'|'high', setting:string, pixelRatio:number, shadows:boolean, shadowMapSize:number, grassDensity:number, post:boolean, bloom:boolean, msaa:number, drawDistance:number, foliageDistance:number, particles:number, water:'low'|'mid'|'high', set:(t:string, o?:{persist?:boolean})=>void, stepDown:(reason?:string)=>boolean, detected:object}} quality
 * @property {{render:()=>void, setEnabled:(v:boolean)=>void, enabled:boolean, tiltShift:(s:number)=>void, grade:(o:{warmth?:number,saturation?:number,vignette?:number,exposure?:number,contrast?:number,split?:number,lift?:number})=>void, bloom:(s:number)=>void, setFocus:(v:THREE.Vector3|null)=>void, auto:boolean, params:object}} post
 * @property {object} debug  same object as window.__lenza (see debug.js)
 * @property {{width:number, height:number, portrait:boolean, pixelRatio:number, aspect:number}} viewport
 * @property {URLSearchParams} params
 * @property {boolean} isDebug
 * @property {(pattern?:number|number[])=>void} haptic  vibrate if supported and enabled in settings
 * @property {typeof ORDER} ORDER
 * @property {typeof createTestStage} createTestStage
 * @property {any} [data] @property {any} [world] @property {any} [player] @property {any} [npcs]
 * @property {any} [fishModels] @property {any} [creatures] @property {any} [systems] @property {any} [ui]
 */

/**
 * Create the engine.
 * @param {{canvasParent?:HTMLElement, debug?:boolean, quality?:'low'|'mid'|'high'|'auto'|null, startLoop?:boolean}} [opts]
 *   debug: expose window.__lenza (defaults to "?debug" in the URL). quality: force a tier (also "?quality=mid").
 * @returns {Promise<Ctx>}
 */
export async function createCore(opts = {}) {
  const params = new URLSearchParams(location.search);
  const isDebug = opts.debug ?? params.has('debug');
  const parent = opts.canvasParent || document.body;

  /** @type {Ctx} */
  const ctx = { THREE, math, params, isDebug, ORDER, VERSION, createTestStage: o => (ctx.stage = createTestStage(ctx, o)) };
  ctx.bus = createBus();
  ctx.save = createSave({ bus: ctx.bus });
  ctx.i18n = createI18n({ save: ctx.save, bus: ctx.bus });
  ctx.i18n.addStrings(coreStrings.it, coreStrings.en);

  // ---- renderer ----
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: false });
  } catch (e) {
    showFatal(parent, ctx.i18n.t('core.webgl_error'));
    throw e;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false; // reset once per frame so info.render.calls counts the whole frame (incl. post passes)
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;-webkit-tap-highlight-color:transparent;';
  canvas.setAttribute('tabindex', '-1');
  parent.appendChild(canvas);
  ctx.renderer = renderer;

  // ---- scene & camera ----
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa9e4f2);
  scene.fog = new THREE.Fog(0xc4e6ea, 45, 170);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);
  camera.position.set(0, 14, 11);
  ctx.scene = scene; ctx.camera = camera;

  // ---- loop / quality / rig / input / time ----
  ctx.loop = createLoop({ render: () => { renderer.info.reset(); if (ctx.post) ctx.post.render(); else renderer.render(scene, camera); } });
  const qOverride = opts.quality || params.get('quality');
  ctx.quality = createQuality({ renderer, bus: ctx.bus, save: ctx.save, loop: ctx.loop, debug: isDebug, override: ['low', 'mid', 'high', 'auto'].includes(qOverride) ? qOverride : null });
  ctx.cameraRig = createCameraRig({ camera, ctx, dom: canvas });
  ctx.input = createInput({ bus: ctx.bus, getYaw: () => ctx.cameraRig.effectiveYaw });
  ctx.time = createTime({ bus: ctx.bus, save: ctx.save });
  ctx.time.lightingAt = lightingAt; ctx.time.phaseOf = phaseOf;

  // ---- viewport ----
  ctx.viewport = { width: 1, height: 1, portrait: false, pixelRatio: 1, aspect: 1 };
  const resize = () => {
    const r = parent === document.body ? { width: window.innerWidth, height: window.innerHeight } : parent.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const pr = ctx.quality.pixelRatio;
    const changed = w !== ctx.viewport.width || h !== ctx.viewport.height || pr !== ctx.viewport.pixelRatio;
    Object.assign(ctx.viewport, { width: w, height: h, portrait: h > w, pixelRatio: pr, aspect: w / h });
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    ctx.post?.setSize(w, h, pr);
    if (changed) ctx.bus.emit('resize', { ...ctx.viewport });
  };
  resize();

  // ---- post ----
  ctx.post = createPost({ renderer, scene, camera, ctx });
  ctx.post.setSize(ctx.viewport.width, ctx.viewport.height, ctx.viewport.pixelRatio);

  // ---- audio ----
  const _r = new THREE.Vector3();
  ctx.audio = createAudio({
    bus: ctx.bus, save: ctx.save,
    getListener: () => ctx.cameraRig.followed ? ctx.cameraRig.followPos : ctx.cameraRig.lookTarget,
    getRight: () => { _r.set(1, 0, 0).applyQuaternion(camera.quaternion); _r.y = 0; _r.normalize(); return _r; },
  });
  ctx.audioAuto = attachAutoAudio(ctx);
  const unlock = () => {
    if (ctx.audio.unlock() && ctx.audio.context?.state === 'running') {
      for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) window.removeEventListener(ev, unlock, true);
    }
  };
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(ev, unlock, true);

  // ---- quality changes: pixel ratio, shadows, post ----
  ctx.bus.on('quality:change', () => {
    const q = ctx.quality;
    const shadowToggle = renderer.shadowMap.enabled !== q.shadows;
    renderer.shadowMap.enabled = q.shadows;
    scene.traverse(o => {
      if (o.isLight && o.shadow && o.castShadow) {
        if (o.isDirectionalLight && o.shadow.mapSize.x !== q.shadowMapSize) {
          o.shadow.mapSize.setScalar(q.shadowMapSize);
          o.shadow.map?.dispose(); o.shadow.map = null;
        }
      }
      if (shadowToggle && o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
    });
    ctx.post.applyQuality();
    resize();
  });
  renderer.shadowMap.enabled = ctx.quality.shadows;

  // ---- per-frame core work ----
  ctx.loop.add(function coreInput() { ctx.input.update(); }, -1000);
  ctx.loop.add(function coreTime(dt) { ctx.time.update(dt); }, 1);
  ctx.loop.add(function coreCamera(dt) { ctx.cameraRig.update(dt); }, ORDER.camera);
  ctx.loop.add(function coreWatchdog() { ctx.quality.updateWatchdog(); }, 1000);

  // ---- resize/visibility/context loss ----
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  window.visualViewport?.addEventListener('resize', resize);
  if (parent !== document.body && 'ResizeObserver' in window) new ResizeObserver(resize).observe(parent);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); ctx.loop.pause(true); ctx.bus.emit('gl:lost'); ctx.save.flush(); console.warn('[core] WebGL context lost'); });
  canvas.addEventListener('webglcontextrestored', () => { ctx.bus.emit('gl:restored'); location.reload(); });

  ctx.haptic = (pattern = 12) => {
    if (ctx.save.state.settings?.haptics === false) return;
    try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
  };

  ctx.debug = createDebug(ctx, isDebug);
  if (opts.startLoop) ctx.loop.start();
  return ctx;
}

function showFatal(parent, msg) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;font:600 18px/1.4 system-ui,-apple-system,sans-serif;color:#1d2a4a;background:#a9e4f2';
  d.textContent = msg;
  parent.appendChild(d);
}

export { ORDER, CAMERA_MODES, createTestStage, math, THREE };
export default createCore;
