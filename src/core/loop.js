// Main loop: requestAnimationFrame, ordered callbacks, dt clamp, pause on hidden.

export const ORDER = { input: 0, systems: 10, actors: 20, world: 30, camera: 40, ui: 50 };

/**
 * @param {{render:()=>void, onError?:(e:Error)=>void}} opts
 */
export function createLoop({ render }) {
  const entries = []; // {fn, order, seq, errors}
  let seq = 0, raf = 0, last = 0, running = false, userPaused = false, hiddenPaused = false;
  let dirty = false;
  const frameTimes = new Float32Array(60); let ftIdx = 0;

  const loop = {
    /** Elapsed game-loop seconds (only advances while not paused). */
    t: 0,
    /** Frame counter. */
    frame: 0,
    /** Last dt passed to callbacks. */
    dt: 0,
    /** Smoothed real frames per second (rAF based). */
    fps: 60,
    /** Max dt in seconds handed to callbacks. */
    maxDt: 0.05,
    /** Time scale (1 = normal). Debug/slow-mo. */
    timeScale: 1,
    get paused() { return userPaused || hiddenPaused; },
    get running() { return running; },

    /** Register fn(dt, t). Lower order runs first. Returns a remove function. */
    add(fn, order = 0) {
      if (typeof fn !== 'function') throw new TypeError('loop.add expects a function');
      entries.push({ fn, order: +order || 0, seq: seq++, errors: 0 });
      dirty = true;
      return () => loop.remove(fn);
    },
    remove(fn) {
      const i = entries.findIndex(e => e.fn === fn);
      if (i >= 0) entries.splice(i, 1);
    },
    start() {
      if (running) return;
      running = true; last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    /** pause(true|false). While paused callbacks don't run, but the scene is still rendered. */
    pause(v = true) { userPaused = !!v; last = performance.now(); },
    _setHidden(v) { hiddenPaused = !!v; last = performance.now(); },
    /** Run one simulation step of dt seconds (no render). Used by debug.step. */
    tick(dt) {
      if (dirty) { entries.sort((a, b) => a.order - b.order || a.seq - b.seq); dirty = false; }
      dt = Math.min(Math.max(dt, 0), loop.maxDt) * loop.timeScale;
      loop.dt = dt; loop.t += dt; loop.frame++;
      for (const e of entries.slice()) {
        try { e.fn(dt, loop.t); }
        catch (err) {
          e.errors++;
          if (e.errors <= 3 || e.errors % 300 === 0) console.error(`[loop] callback (order ${e.order}) threw (${e.errors}x)`, err);
        }
      }
    },
    render() { try { render(); } catch (err) { console.error('[loop] render failed', err); } },
    /** Read-only snapshot for debugging. */
    list() { return entries.map(e => ({ order: e.order, name: e.fn.name || '(anonymous)', errors: e.errors })); },
  };

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const real = Math.max(0, (now - last) / 1000); last = now;
    frameTimes[ftIdx++ % 60] = real;
    if (ftIdx % 15 === 0) {
      let s = 0; const n = Math.min(ftIdx, 60);
      for (let i = 0; i < n; i++) s += frameTimes[i];
      loop.fps = s > 0 ? n / s : 60;
    }
    if (hiddenPaused) return;
    if (!userPaused) loop.tick(real);
    loop.render();
  }

  document.addEventListener('visibilitychange', () => loop._setHidden(document.hidden));
  loop._setHidden(document.hidden);
  return loop;
}
