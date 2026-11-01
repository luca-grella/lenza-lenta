// Gameplay environment adapter: one place where Systems read the World, the Player and the UI through ctx,
// with fallbacks so every system also runs on the core placeholder island (ctx.stage) and without UI/Actors.
import * as THREE from 'three';

// Placeholder-island POIs (core stage: island radius ~26, dock at x=4 running south from z≈23 to z≈30, hut at -6,3).
const STAGE_POIS = {
  dock_home: { x: 4, z: 28.6, facing: 0 },
  boat_mooring_home: { x: 6.6, z: 27.5, facing: 0 },
  home_bed: { x: -6, z: 4.6, facing: 0 },
  home_campfire: { x: -2.5, z: 9, facing: 0 },
  bench_home: { x: 1.5, z: 14, facing: 0 },
  village_bottega: { x: 9, z: -4 },
  village_pescheria: { x: 13, z: 5 },
  village_falegname: { x: -12, z: -7 },
  village_trattoria: { x: 0, z: -11 },
  village_aquarium: { x: -11, z: 11 },
  treasure: { x: -15, z: 0 },
  forage_beach_1: { x: -8, z: 19 }, forage_beach_2: { x: 12, z: 17 }, forage_beach_3: { x: 17, z: -12 },
  forage_beach_4: { x: -18, z: 12 }, forage_meadow: { x: -4, z: -4 }, forage_wood_1: { x: 6, z: 4 },
};

export function createEnv(ctx) {
  const v3 = new THREE.Vector3();
  const S = () => ctx.save.state;
  const W = () => ctx.world;
  const stage = () => ctx.stage;

  /** Dummy-player adapter used when Characters' player is missing (sandbox / early integration). */
  const dummy = {
    isFallback: true,
    state: 'idle',
    lastAnim: null,
    animLog: [],
    _lock: null,
    _held: null,
    _endT: 0, _onEnd: null,
    get object() { return ctx.stage?.dummy || ctx.cameraRig.followed; },
    get position() { return dummy.object?.position || v3.set(0, 0, 0); },
    get facing() { return dummy.object?.rotation.y || 0; },
    set facing(a) { if (dummy.object) dummy.object.rotation.y = a; },
    play(name, o = {}) {
      dummy.lastAnim = name; dummy.animLog.push(name); if (dummy.animLog.length > 60) dummy.animLog.shift();
      const dur = { cast_release: 0.7, strike: 0.5, catch_show: 2.0, catch_happy: 2.2, fail_shrug: 1.5, crouch_pick: 1.1, pet: 1.6, eat: 1.8, sit_down: 0.8, stand_up: 0.6, wake: 1.2, wave: 1.2 }[name];
      dummy._onEnd = o.onEnd || null; dummy._endT = dur && !o.loop ? dur / (o.speed || 1) : 0;
    },
    setControl(v) { dummy._lock = v ? null : dummy.position.clone(); },
    sitAt(p) { if (p && dummy.object) { dummy.object.position.set(p.x, groundY(p.x, p.z), p.z); dummy._lock = dummy.position.clone(); dummy.state = 'sit'; } },
    standUp() { dummy._lock = null; dummy.state = 'idle'; },
    board(boat) { const o = dummy.object; if (!o || !boat?.seat) return; boat.seat.add(o); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); dummy.state = 'boat'; },
    leaveBoat() { const o = dummy.object; if (!o) return; const p = new THREE.Vector3(); o.getWorldPosition(p); (ctx.stage?.group || ctx.scene).add(o); o.position.copy(p); dummy.state = 'idle'; },
    holdFish(mesh) {
      const o = dummy.object; if (!o) return;
      if (dummy._held) dummy._held.parent?.remove(dummy._held);
      dummy._held = mesh || null;
      if (mesh) { o.add(mesh); mesh.position.set(0, 2.55, 0.25); mesh.rotation.set(0, Math.PI / 2, 0.25); }
    },
    teleport(x, z) { const o = dummy.object; if (o) { o.position.set(x, groundY(x, z), z); if (dummy._lock) dummy._lock.copy(o.position); } },
    rod: {
      tipWorld(out = new THREE.Vector3()) {
        const o = dummy.object; if (!o) return out.set(0, 2, 0);
        o.updateWorldMatrix(true, false);
        return out.set(0.35, 2.45, 1.45).applyMatrix4(o.matrixWorld);
      },
    },
    update(dt) {
      if (dummy._lock && dummy.object && dummy.state !== 'boat') { dummy.object.position.x = dummy._lock.x; dummy.object.position.z = dummy._lock.z; }
      if (dummy._endT > 0) { dummy._endT -= dt; if (dummy._endT <= 0) { const f = dummy._onEnd; dummy._onEnd = null; f?.(); } }
    },
  };

  // ---------------------------------------------------------------- world queries
  function heightAt(x, z) {
    const w = W();
    if (w?.heightAt) return w.heightAt(x, z);
    return stage()?.heightAt?.(x, z) ?? 0;
  }
  function groundY(x, z) {
    const w = W();
    if (w?.groundY) return w.groundY(x, z);
    const st = stage();
    if (st && Math.abs(x - 4) < 1.2 && z > 22.7 && z < 30.5) return 0.61; // placeholder dock
    return Math.max(heightAt(x, z), waterLevel());
  }
  function waterLevel() { return W()?.waterLevel ?? 0; }
  function isWater(x, z) {
    const w = W();
    if (w?.isWater) return !!w.isWater(x, z);
    if (stage() && Math.abs(x - 4) < 1.2 && z > 22.7 && z < 30.5) return true; // under the dock is water
    return heightAt(x, z) < waterLevel() - 0.05;
  }
  function waterDepth(x, z) {
    const w = W();
    if (w?.waterDepth) return Math.max(0, w.waterDepth(x, z) || 0);
    return Math.max(0, waterLevel() - heightAt(x, z));
  }
  /** Y of the water surface at x,z (rivers and the pond sit above sea level). */
  function waterSurface(x, z) {
    const w = W();
    const f = w?.waterSurfaceAt || w?.waterHeightAt || w?.surfaceAt || w?.waterY;
    if (typeof f === 'function') { const y = f.call(w, x, z); if (Number.isFinite(y)) return y; }
    if (w?.waterDepth && w?.heightAt) { const d = w.waterDepth(x, z); if (d > 0) return w.heightAt(x, z) + d; }
    return waterLevel();
  }
  function habitatAt(x, z) {
    if (env.habitatOverride) return isWater(x, z) ? env.habitatOverride : null;
    const w = W();
    if (w?.habitatAt) return w.habitatAt(x, z) || null;
    if (!isWater(x, z)) return null;
    return waterDepth(x, z) > 2.6 ? 'deep' : 'shore';
  }
  function zoneAt(x, z) {
    if (env.zoneOverride) return env.zoneOverride;
    return W()?.zoneAt?.(x, z) || 'home_beach';
  }
  function walkable(x, z) {
    const w = W();
    if (w?.walkable) return !!w.walkable(x, z);
    if (stage() && Math.abs(x - 4) < 1.2 && z > 22.7 && z < 30.5) return true;
    return heightAt(x, z) > waterLevel() + 0.05;
  }
  function boatWaterOK(x, z) {
    const w = W();
    if (w?.boatWaterOK) return !!w.boatWaterOK(x, z);
    if (stage() && Math.abs(x - 4) < 1.6 && z > 22.7 && z < 30.8) return false; // dock pilings
    return waterDepth(x, z) > 0.45;
  }
  function weather() { return W()?.weather?.type || S().weather?.type || 'clear'; }

  /** Named point → {x, y, z, facing} or null. */
  function poi(id) {
    const w = W();
    let p = null;
    if (w?.poi) p = w.poi(id);
    else if (w?.pois) p = w.pois instanceof Map ? w.pois.get(id) : w.pois[id];
    if (!p && !w && STAGE_POIS[id]) p = STAGE_POIS[id];
    if (!p) return null;
    const x = p.x ?? p.position?.x, z = p.z ?? p.position?.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return { id, x, z, y: p.y ?? p.position?.y ?? groundY(x, z), facing: p.facing ?? p.rot ?? 0, raw: p };
  }
  /** All POIs whose id starts with prefix → [{id, x, y, z, facing, raw}]. */
  function listPois(prefix = '') {
    const w = W();
    let ids = [];
    if (w) {
      if (typeof w.poiList === 'function') ids = (w.poiList(prefix) || []).map(e => (typeof e === 'string' ? e : e.id));
      else if (typeof w.listPois === 'function') {
        const r = w.listPois(prefix);
        ids = (Array.isArray(r) ? r : Object.keys(r || {})).map(e => (typeof e === 'string' ? e : e.id));
      } else if (w.pois) ids = w.pois instanceof Map ? [...w.pois.keys()] : Array.isArray(w.pois) ? w.pois.map(p => p.id) : Object.keys(w.pois);
      else if (w.poiIds) ids = [...w.poiIds];
    } else ids = Object.keys(STAGE_POIS);
    return ids.filter(id => id && id.startsWith(prefix)).map(poi).filter(Boolean);
  }

  /** First water point along a ray (horizontal) → {point, habitat, dist} or null. */
  function nearestWaterAlong(origin, dir, maxDist) {
    const w = W();
    if (w?.nearestWaterAlong && !env.habitatOverride) {
      const r = w.nearestWaterAlong(origin, dir, maxDist);
      if (r) return { point: r.point, habitat: r.habitat ?? habitatAt(r.point.x, r.point.z), dist: Math.hypot(r.point.x - origin.x, r.point.z - origin.z) };
      return null;
    }
    const len = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / len, dz = dir.z / len;
    for (let d = 0.6; d <= maxDist; d += 0.3) {
      const x = origin.x + dx * d, z = origin.z + dz * d;
      if (isWater(x, z) && waterDepth(x, z) > 0.2) return { point: new THREE.Vector3(x, waterSurface(x, z), z), habitat: habitatAt(x, z), dist: d };
    }
    return null;
  }

  // ---------------------------------------------------------------- player
  function player() { return ctx.player?.object ? ctx.player : dummy; }
  function playerPos(out = new THREE.Vector3()) {
    const p = player(); const o = p.object;
    if (!o) return out.set(0, 0, 0);
    o.getWorldPosition(out);
    return out;
  }
  function playerFacing() {
    const p = player();
    if (p !== dummy && Number.isFinite(p.facing)) return p.facing;
    const o = p.object; if (!o) return 0;
    const q = new THREE.Quaternion(); o.getWorldQuaternion(q);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return Math.atan2(f.x, f.z);
  }
  /** Turn the player toward an angle (0 = +z). */
  function face(angle) {
    const p = player();
    if (typeof p.setFacing === 'function') p.setFacing(angle);
    else if (typeof p.face === 'function') p.face(angle);
    else {
      try { p.facing = angle; } catch { /* read-only */ }
      if (p.object && p.object.parent && p.object.parent.type === 'Scene') p.object.rotation.y = angle;
      else if (p === dummy && p.object) p.object.rotation.y = angle;
    }
  }
  const ONE_SHOT_STATE = { crouch_pick: 'forage', pet: 'pet', eat: 'eat' };
  const ONE_SHOT_DUR = { crouch_pick: 1.1, pet: 1.6, eat: 1.8 };
  /** Play an animation (missing names are tolerated by the player module). */
  function play(name, opts) {
    const p = player();
    let r;
    try { r = p.play?.(name, opts); } catch (e) { console.warn('[systems] player.play failed', name, e); }
    // one-shot "chore" clips put the player in a state (forage/pet/eat); return to idle when the clip ends
    const st = ONE_SHOT_STATE[name];
    if (st && !opts?.loop) {
      const back = () => { if (p.state === st) setPlayerState('idle'); };
      if (r && typeof r.then === 'function') r.then(back, back);
      const dur = ONE_SHOT_DUR[name] || 1.5; let tt = 0;
      const off = ctx.loop.add(dt => { tt += dt; if (tt > dur + 0.6) { off(); back(); } }, ctx.ORDER?.systems ?? 10);
    }
    return r;
  }
  function setControl(v) { try { player().setControl?.(v); } catch { /* ignore */ } }
  function setPlayerState(st) {
    const p = player();
    if (typeof p.setState === 'function') { p.setState(st); return; }
    try { p.state = st; } catch { /* getter only */ }
  }
  function rodTip(out = new THREE.Vector3()) {
    const p = player();
    const r = p.rod?.tipWorld?.(out);
    if (r && r.isVector3) return r === out ? out : out.copy(r);
    if (p.rod?.tipWorld && out.lengthSq() > 0) return out;
    return dummy.rod.tipWorld(out);
  }

  // ---------------------------------------------------------------- npcs
  function npcList() {
    const n = ctx.npcs;
    if (!n) return [];
    if (Array.isArray(n)) return n;
    if (Array.isArray(n.list)) return n.list;
    if (Array.isArray(n.all)) return n.all;
    if (typeof n.list === 'function') return n.list();
    if (n.byId) return Object.values(n.byId);
    return [];
  }
  function npc(id) { return ctx.npcs?.get?.(id) || npcList().find(n => n.id === id) || null; }

  // ---------------------------------------------------------------- ui helpers
  const t = (k, vars) => ctx.i18n.t(k, vars);
  const ui = () => ctx.ui || env.fallbackUI || null;
  function toast(key, vars) { const u = ui(); try { u?.toast?.(key, vars); } catch (e) { console.warn(e); } }
  /** True when the real UI module is present (it shows its own toasts/banners for most bus events). */
  const realUI = () => !!ctx.ui && !ctx.ui.isFallback;
  /** Toast only when the real UI isn't there (it already reacts to that bus event). */
  function toastFB(key, vars) { if (!realUI()) toast(key, vars); }
  /** Big announcement: title/sub are i18n keys (vars apply to both). */
  function banner(title, sub, vars) { try { ui()?.banner?.(title, sub, vars); } catch (e) { console.warn(e); } }
  function meter(name, data) { try { ui()?.meter?.(name, data); } catch (e) { console.warn(e); } }
  function uiOpen() { try { return !!ui()?.isOpen?.(); } catch { return false; } }
  /** Dialog with an NPC: lines are i18n keys (or {key, vars}). Returns a Promise resolving to the choice (or undefined). */
  function dialog(npcId, lines, choices) {
    const u = ui();
    if (!u?.dialog) return Promise.resolve(choices?.[0]?.id);
    try { return Promise.resolve(u.dialog(npcId, lines, choices)); } catch (e) { console.warn(e); return Promise.resolve(); }
  }
  function sheet(name, data) { try { return ui()?.sheet?.(name, data); } catch (e) { console.warn(e); } }
  function sfx(name, o) { try { ctx.audio?.sfx?.(name, o); } catch { /* ignore */ } }

  /** Absolute game time in hours (day 1 at 0:00 = 0). */
  const absHours = () => (ctx.time.day - 1) * 24 + ctx.time.hours;

  /** Item display name (any kind). */
  function itemName(id) {
    const it = ctx.data?.get?.(id);
    if (it?.nameKey) return t(it.nameKey);
    if (ctx.data?.fishById?.[id]) return t(`fish.${id}.name`);
    return id;
  }

  /** True once story step `questId` is complete. */
  function questDone(questId) { return !!S().quests?.done?.[questId]; }
  function unlocked(item) { return !item?.unlock?.quest || questDone(item.unlock.quest); }
  function flag(f) { return !!S().flags?.[f]; }

  const env = {
    STAGE_POIS, S, t, absHours, itemName, questDone, unlocked, flag,
    heightAt, groundY, waterLevel, isWater, waterDepth, waterSurface, habitatAt, zoneAt, walkable, boatWaterOK, weather,
    poi, listPois, nearestWaterAlong,
    player, playerPos, playerFacing, face, play, setControl, setPlayerState, rodTip, dummy,
    npcList, npc,
    ui, realUI, toast, toastFB, banner, meter, uiOpen, dialog, sheet, sfx,
    habitatOverride: ctx.params?.get('habitat') || null,
    zoneOverride: ctx.params?.get('zone') || null,
    fallbackUI: null,
    /** Shared busy flags (sleeping, cutscenes) other systems check. */
    busy: { sleep: false },
  };
  return env;
}
