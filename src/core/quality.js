// Quality tiers: auto-detection (platform, GPU, DPR, screen), manual override, FPS watchdog.

/** Settings per tier. Modules read ctx.quality.<field> and listen to 'quality:change'. */
export const TIERS = {
  low:  { pixelRatioCap: 1,   shadows: false, shadowMapSize: 512,  grassDensity: 0.3,  post: false, bloom: false, msaa: 0, tiltTaps: 0,  drawDistance: 0.6,  foliageDistance: 35, particles: 0.4, water: 'low' },
  mid:  { pixelRatioCap: 1.5, shadows: true,  shadowMapSize: 1024, grassDensity: 0.6,  post: true,  bloom: false, msaa: 2, tiltTaps: 7,  drawDistance: 0.8,  foliageDistance: 55, particles: 0.7, water: 'mid' },
  high: { pixelRatioCap: 2,   shadows: true,  shadowMapSize: 2048, grassDensity: 1.0,  post: true,  bloom: true,  msaa: 4, tiltTaps: 11, drawDistance: 1.0,  foliageDistance: 80, particles: 1.0, water: 'high' },
};
const ORDER = ['low', 'mid', 'high'];

function gpuInfo(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(r || '');
  } catch { return ''; }
}

/**
 * Detect a reasonable starting tier.
 * @returns {{tier:'low'|'mid'|'high', reason:string, gpu:string, software:boolean, platform:string}}
 */
export function detectTier(renderer) {
  const gpu = gpuInfo(renderer);
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const dpr = window.devicePixelRatio || 1;
  const sw = Math.min(screen.width, screen.height), sh = Math.max(screen.width, screen.height);
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 4;
  const software = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  const platform = iOS ? 'ios' : android ? 'android' : 'desktop';
  if (software) return { tier: 'low', reason: 'software renderer', gpu, software, platform };
  if (iOS) {
    const ipad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ipad) return { tier: 'high', reason: 'iPad', gpu, software, platform };
    // iPhone X/11 Pro/12+ have DPR 3 and tall screens; older/SE models fall back to mid.
    if (dpr >= 3 && sh >= 812) return { tier: 'high', reason: 'modern iPhone', gpu, software, platform };
    return { tier: 'mid', reason: 'older iPhone', gpu, software, platform };
  }
  if (android) {
    if (mem <= 3 || cores <= 4 || /Mali-(4|T)|Adreno \(TM\) [345]\d\d|PowerVR/i.test(gpu)) return { tier: 'low', reason: 'weak android', gpu, software, platform };
    if (/Adreno \(TM\) (6[4-9]\d|7\d\d|8\d\d)|Mali-G(7[1-9]|71\d|72\d)|Xclipse|Immortalis/i.test(gpu) && mem >= 6) return { tier: 'high', reason: 'strong android', gpu, software, platform };
    return { tier: 'mid', reason: 'android', gpu, software, platform };
  }
  if (/Intel.*(HD Graphics [2-5]\d\d0?|HD Graphics$|GMA)/i.test(gpu) || cores <= 2) return { tier: 'mid', reason: 'old integrated GPU', gpu, software, platform };
  if (sw * dpr > 2200 && /Intel/i.test(gpu)) return { tier: 'mid', reason: 'hi-res + integrated', gpu, software, platform };
  return { tier: 'high', reason: 'desktop', gpu, software, platform };
}

/**
 * @param {{renderer:any, bus:any, save:any, loop:any, debug?:boolean, override?:string|null}} opts
 */
export function createQuality({ renderer, bus, save, loop, debug = false, override = null }) {
  const det = detectTier(renderer);
  const dpr = window.devicePixelRatio || 1;
  let setting = override || save.state.settings?.quality || 'auto';
  if (!['auto', ...ORDER].includes(setting)) setting = 'auto';
  // Headless/debug runs use a software renderer: show the real look (high) unless asked otherwise.
  let autoTier = det.software && debug ? 'high' : det.tier;
  let prScale = 1; // dynamic resolution factor applied by the watchdog (0.6..1)

  const q = {
    tier: 'high',
    /** 'auto' or a forced tier (what the Settings sheet shows). */
    get setting() { return setting; },
    detected: det,
    pixelRatio: 1,
    shadows: true, shadowMapSize: 2048, grassDensity: 1, post: true, bloom: true, msaa: 4, tiltTaps: 11,
    drawDistance: 1, foliageDistance: 80, particles: 1, water: 'high',
    /** Watchdog enabled (auto only, off in ?debug unless ?watchdog). */
    watchdog: !debug || /[?&]watchdog/.test(location.search),
    /** set('auto'|'low'|'mid'|'high', {persist=true}) */
    set(t, { persist = true } = {}) {
      if (!['auto', ...ORDER].includes(t)) { console.warn('[quality] unknown tier', t); return; }
      setting = t;
      prScale = 1;
      if (persist && !override) { save.state.settings.quality = t; save.commit(); }
      apply(t === 'auto' ? autoTier : t);
    },
    /** Step down one notch (used by the watchdog; safe to call manually). Returns false if already lowest. */
    stepDown(reason = 'manual') {
      if (prScale > 0.76) { prScale = Math.max(0.75, prScale - 0.125); apply(q.tier, reason); return true; }
      const i = ORDER.indexOf(q.tier);
      if (i <= 0) return false;
      autoTier = ORDER[i - 1]; prScale = 1;
      apply(autoTier, reason);
      return true;
    },
  };

  function apply(tier, reason = '') {
    const c = TIERS[tier];
    const prev = q.tier;
    Object.assign(q, c);
    if (det.platform !== 'desktop') q.msaa = Math.min(q.msaa, 2); // phones at 2x DPR don't need 4x MSAA
    q.tier = tier;
    q.pixelRatio = Math.max(0.75, Math.min(dpr, c.pixelRatioCap) * prScale);
    bus.emit('quality:change', { tier, prev, pixelRatio: q.pixelRatio, reason });
  }

  // ---- FPS watchdog: after a grace period, sample 4 s windows; two bad windows in a row → step down.
  let acc = 0, frames = 0, grace = 6, bad = 0, lastNow = performance.now();
  q.updateWatchdog = () => {
    const now = performance.now();
    const real = (now - lastNow) / 1000; lastNow = now;
    if (!q.watchdog || setting !== 'auto' || document.hidden || loop.paused || real > 0.5) return;
    if (grace > 0) { grace -= real; return; }
    acc += real; frames++;
    if (acc >= 4) {
      const fps = frames / acc; acc = 0; frames = 0;
      if (fps < 46) bad++; else bad = Math.max(0, bad - 1);
      if (bad >= 2) {
        bad = 0; grace = 3;
        if (q.stepDown(`fps ${fps.toFixed(0)}`)) console.info(`[quality] low fps (${fps.toFixed(0)}): now ${q.tier} @ ${q.pixelRatio.toFixed(2)}x`);
      }
    }
  };

  // initial tier without emitting to listeners that don't exist yet
  Object.assign(q, TIERS[setting === 'auto' ? autoTier : setting]);
  q.tier = setting === 'auto' ? autoTier : setting;
  if (det.platform !== 'desktop') q.msaa = Math.min(q.msaa, 2);
  q.pixelRatio = Math.min(dpr, TIERS[q.tier].pixelRatioCap);
  return q;
}
