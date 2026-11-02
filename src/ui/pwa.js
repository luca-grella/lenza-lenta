// iPhone-native feel: gesture guards (no pinch / double-tap zoom, no rubber band), standalone detection,
// service-worker registration with "update ready" notice, and an iOS haptic fallback.

/** True when launched from the home screen (iOS standalone or display-mode standalone). */
export const isStandalone = () => !!(navigator.standalone || matchMedia?.('(display-mode: standalone)').matches || matchMedia?.('(display-mode: fullscreen)').matches);
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.platform || '') || (/Mac/.test(navigator.platform || '') && navigator.maxTouchPoints > 1);

export function installGestureGuards() {
  const prevent = e => e.preventDefault();
  // iOS Safari pinch zoom (ignores user-scalable=no since iOS 10)
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, prevent, { passive: false });
  // double-tap zoom
  document.addEventListener('dblclick', prevent, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const now = e.timeStamp;
    if (now - lastTouchEnd < 320 && e.changedTouches.length === 1 && !e.target.closest?.('input, textarea')) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  // multi-touch zoom & rubber band: block touchmove unless inside a scrollable UI area
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) { e.preventDefault(); return; }
    const sc = e.target.closest?.('.scroll, .scroll-x, input[type=range], textarea');
    if (!sc) { e.preventDefault(); return; }
    if (sc.matches('.scroll') && sc.scrollHeight <= sc.clientHeight + 1) e.preventDefault();
  }, { passive: false });
  // no context menu / long-press menus
  document.addEventListener('contextmenu', e => { if (!e.target.closest?.('input, textarea')) e.preventDefault(); });
  document.addEventListener('selectstart', e => { if (!e.target.closest?.('input, textarea')) e.preventDefault(); });
  // Ctrl/Cmd + wheel zoom on desktop trackpads
  window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
}

/**
 * Register sw.js (relative URL so it works under /lenza-lenta-v2/). Skipped in ?debug and on localhost unless ?sw.
 * onUpdate() is called when a new version took control (the old page keeps running until reloaded).
 */
export function registerServiceWorker({ params, onUpdate } = {}) {
  if (!('serviceWorker' in navigator)) return;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (params?.has('nosw') || params?.has('debug') || (local && !params?.has('sw'))) return;
  const hadController = !!navigator.serviceWorker.controller;
  let notified = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !notified) { notified = true; onUpdate?.(); }
  });
  const go = () => navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
    .then(reg => {
      // look for updates when the app comes back to the foreground
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    })
    .catch(e => console.warn('[ui] service worker registration failed', e));
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}

/**
 * Haptic tick that also works on iOS 17.4+ Safari, which has no navigator.vibrate: toggling a native
 * <input type=checkbox switch> produces the system haptic. Works best inside a user gesture.
 */
export function createHaptics(ctx) {
  let sw = null;
  const ensure = () => {
    if (sw) return sw;
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
    label.append(input); document.body.append(label);
    sw = label;
    return sw;
  };
  const enabled = () => ctx.save?.state?.settings?.haptics !== false;
  return function haptic(pattern = 12) {
    if (!enabled()) return;
    try {
      if (typeof navigator.vibrate === 'function') { navigator.vibrate(pattern); return; }
      if (isIOS()) {
        const n = Array.isArray(pattern) ? Math.min(3, Math.ceil(pattern.length / 2)) : 1;
        for (let i = 0; i < n; i++) setTimeout(() => ensure().click(), i * 90);
      }
    } catch { /* unsupported */ }
  };
}

/** Keep a CSS var with the real visible height (iOS toolbars) — the layout uses 100% of #ui anyway. */
export function trackViewport(root) {
  const set = () => {
    const vv = window.visualViewport;
    root.style.setProperty('--vh', ((vv?.height || innerHeight) / 100) + 'px');
  };
  set();
  window.visualViewport?.addEventListener('resize', set);
  window.addEventListener('resize', set);
}
