// Environment queries for creatures, with fallbacks when World (or Player) is not loaded yet:
// the placeholder stage (ctx.stage) or a flat bench ground.
import * as THREE from 'three';

/** @param {any} ctx */
export function createEnv(ctx) {
  const W = () => ctx.world;
  const _p = new THREE.Vector3(), _prev = new THREE.Vector3();
  let moving = 0, lastMove = 0;
  const env = {
    /** Sea/water surface height. */
    get waterLevel() { return W()?.waterLevel ?? 0; },
    /** Terrain height (no docks). */
    height(x, z) {
      const h = W()?.heightAt?.(x, z);
      if (Number.isFinite(h)) return h;
      return ctx.stage?.heightAt?.(x, z) ?? 0;
    },
    /** Walkable surface height (docks, bridges…). */
    ground(x, z) {
      const g = W()?.groundY?.(x, z);
      if (Number.isFinite(g)) return g;
      return Math.max(env.height(x, z), env.isWater(x, z) ? env.waterLevel : -Infinity);
    },
    isWater(x, z) {
      const w = W();
      if (w?.isWater) return !!w.isWater(x, z);
      if (ctx.stage && !ctx.stage.water) return false;
      return env.height(x, z) < env.waterLevel - 0.04;
    },
    /** Water depth (0 on land). */
    depth(x, z) {
      const d = W()?.waterDepth?.(x, z);
      if (Number.isFinite(d)) return d;
      return Math.max(0, env.waterLevel - env.height(x, z));
    },
    habitat(x, z) {
      const w = W();
      if (w?.habitatAt) return w.habitatAt(x, z);
      if (!env.isWater(x, z)) return null;
      return env.depth(x, z) > 3 ? 'deep' : 'shore';
    },
    zone(x, z) {
      const z2 = W()?.zoneAt?.(x, z);
      return z2 || (ctx.stage ? 'home_beach' : null);
    },
    walkable(x, z) {
      const w = W();
      if (w?.walkable) return !!w.walkable(x, z);
      return !env.isWater(x, z);
    },
    /** Slide a move against colliders when World provides it. */
    resolveMove(from, to, radius = 0.25) {
      const r = W()?.resolveMove?.(from, to, radius);
      return r || to;
    },
    /** Named point {x, y, z, ...} or null. */
    poi(id) {
      const p = W()?.poi?.(id);
      if (!p) return null;
      return { ...p, x: p.x, y: p.y ?? env.ground(p.x, p.z), z: p.z };
    },
    /** All POI ids starting with prefix (World may expose pois/poiIds; otherwise probes _1.._N). */
    poisWithPrefix(prefix, max = 24) {
      const w = W(); const out = [];
      const list = typeof w?.poiIds === 'function' ? w.poiIds() : w?.pois ? Object.keys(w.pois) : null;
      if (list) { for (const id of list) if (id.startsWith(prefix)) out.push(id); return out.sort(); }
      for (let i = 0; i <= max; i++) for (const id of [prefix + i, prefix + String(i).padStart(2, '0')]) if (!out.includes(id) && w?.poi?.(id)) out.push(id);
      return out;
    },
    /** The object the game follows: player rig, placeholder dummy, or null. */
    playerObject() { return ctx.player?.object || ctx.cameraRig?.followed || null; },
    /** Player world position (falls back to the camera look target). */
    player(out = _p) {
      const o = env.playerObject();
      if (o) return o.getWorldPosition(out);
      return out.copy(ctx.cameraRig?.lookTarget || out.set(0, 0, 0));
    },
    /** Player facing (radians, 0 = +z). */
    playerFacing() {
      if (Number.isFinite(ctx.player?.facing)) return ctx.player.facing;
      return env.playerObject()?.rotation.y ?? 0;
    },
    /** 'idle' | 'walk' | 'fishing' | 'boat' | 'sit' | ... (from ctx.player.state, else inferred from motion). */
    playerState() {
      const s = ctx.player?.state;
      if (s) return s;
      const f = ctx.systems?.fishing?.state;
      if (f && f !== 'idle') return 'fishing';
      return moving > 0.3 ? 'walk' : 'idle';
    },
    /** Seconds since the player last moved. */
    playerStill() { return (ctx.loop?.t ?? 0) - lastMove; },
    get phase() { return ctx.time?.phase || 'day'; },
    get hours() { return ctx.time?.hours ?? 12; },
    get weather() { return W()?.weather?.type || ctx.save?.state?.weather?.type || 'clear'; },
    get wind() { return W()?.weather?.wind || { x: 0.6, z: 0.3, strength: 0.4 }; },
    lighting() { return ctx.time.lighting({ overcast: ctx.stage?.overcast || 0 }); },
    /** Random spot near (cx, cz) between rMin and rMax satisfying pred(x, z). */
    findSpot(cx, cz, rMin, rMax, pred, rnd = Math.random, tries = 30) {
      for (let i = 0; i < tries; i++) {
        const a = rnd() * Math.PI * 2, r = rMin + (rMax - rMin) * Math.sqrt(rnd());
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!pred || pred(x, z)) return { x, z };
      }
      return null;
    },
    /** Called once per frame by the creatures manager. */
    tick(dt) {
      const p = env.player(new THREE.Vector3());
      const v = dt > 0 ? p.distanceTo(_prev) / dt : 0;
      moving += ((v > 0.4 ? 1 : 0) - moving) * Math.min(1, dt * 6);
      if (v > 0.4) lastMove = ctx.loop?.t ?? 0;
      _prev.copy(p);
    },
  };
  return env;
}
