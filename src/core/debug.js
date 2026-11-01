// Debug hooks: window.__lenza (only with ?debug). Lets headless scenario scripts drive the game
// deterministically, because requestAnimationFrame does not run reliably headless or in hidden tabs.
import * as THREE from 'three';

/**
 * @param {any} ctx
 * @param {boolean} expose put it on window.__lenza
 */
export function createDebug(ctx, expose) {
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });
  const errors = [];
  if (expose) {
    window.addEventListener('error', e => errors.push(String(e.message || e)));
    window.addEventListener('unhandledrejection', e => errors.push('unhandled: ' + String(e.reason?.message || e.reason)));
  }

  const followed = () => ctx.player?.object || ctx.cameraRig?.followed || null;

  const dbg = {
    ctx,
    THREE,
    /** Resolves when the game (or sandbox) emitted 'game:ready'. */
    ready,
    isReady: false,
    /** Uncaught errors captured since load (strings). */
    errors,
    /** Mark ready (main.js does it via bus 'game:ready'; sandboxes may call it directly). */
    markReady() { if (!dbg.isReady) { dbg.isReady = true; resolveReady(ctx); } },
    /** Advance n simulation frames of dt (default 1/60 s) synchronously; renders only once at the end. Returns loop.t. */
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) ctx.loop.tick(dt);
      ctx.loop.render();
      return ctx.loop.t;
    },
    /** Advance n frames without rendering at all. */
    advance(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) ctx.loop.tick(dt); return ctx.loop.t; },
    /** Render one frame now. */
    render() { ctx.loop.render(); },
    /** Stop the rAF loop so only step() advances time (deterministic captures). freeze(false) restarts it. */
    freeze(v = true) { if (v) ctx.loop.stop(); else ctx.loop.start(); },
    /** Move the player (or the followed placeholder) to x,z on the walkable ground and snap the camera. */
    teleport(x, z) {
      const y = ctx.world?.groundY?.(x, z) ?? ctx.world?.heightAt?.(x, z) ?? ctx.stage?.heightAt?.(x, z) ?? 0;
      if (ctx.player?.teleport) ctx.player.teleport(x, z);
      else {
        const o = followed();
        if (o) o.position.set(x, Math.max(y, 0), z);
        else console.warn('[debug] nothing to teleport');
      }
      ctx.cameraRig?.snap();
      return { x, z, y };
    },
    /** Set the clock (hours 0..24, optional day). */
    setTime(h, day) { ctx.time.set(h, day); ctx.audioAuto?.update(); return ctx.time.format(); },
    /** Set weather: clear|cloudy|rain|fog|storm (needs World; otherwise only emits the event). */
    setWeather(w) {
      if (ctx.world?.setWeather) ctx.world.setWeather(w, { instant: true });  // [Fix] tests see the full weather look at once
      else { ctx.save.state.weather = { type: w }; ctx.bus.emit('weather:change', { type: w }); }
      if (ctx.stage) ctx.stage.overcast = w === 'clear' ? 0 : w === 'cloudy' ? 0.5 : 0.8;
      ctx.audioAuto?.update();
      return w;
    },
    /** Add items/fish/coins: give('coins', 100) or give('bait_shrimp', 5). Needs Systems. */
    give(id, n = 1) {
      const s = ctx.systems;
      if (id === 'coins' && s?.economy?.earn) return s.economy.earn(n);
      if (s?.inventory?.add) return s.inventory.add(id, n);
      console.warn('[debug] give: systems not loaded');
      return null;
    },
    /** Force a quality tier ('low'|'mid'|'high'|'auto') without saving. */
    quality(t) { ctx.quality.set(t, { persist: false }); return ctx.quality.tier; },
    /** Current canvas as a PNG data URL (renders first). */
    snapshot(type = 'image/png') { ctx.loop.render(); return ctx.renderer.domElement.toDataURL(type); },
    /** Play a sound effect / set music mood (after audio.unlock()). */
    sfx(name, o) { ctx.audio.unlock(); ctx.audio.sfx(name, o); },
    music(mood) { ctx.audio.unlock(); ctx.audio.setMusic(mood); },
    /** Log every bus event to the console. */
    logEvents(v = true) { ctx.bus.log = v; },
    /** Small state summary (handy as a scenario return value). */
    info() {
      const r = ctx.renderer.info;
      return {
        tier: ctx.quality.tier, pixelRatio: ctx.quality.pixelRatio, time: ctx.time.format(), phase: ctx.time.phase, day: ctx.time.day,
        calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures,
        loopT: +ctx.loop.t.toFixed(3), frame: ctx.loop.frame, viewport: { ...ctx.viewport }, errors: errors.length,
        modules: Object.fromEntries(['data', 'world', 'player', 'npcs', 'fishModels', 'creatures', 'systems', 'ui'].map(k => [k, !!ctx[k]])),
      };
    },
  };
  ctx.bus.on('game:ready', () => dbg.markReady());
  if (expose) window.__lenza = dbg;
  return dbg;
}
