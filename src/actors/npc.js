// Villagers: built with the same procedural rig as the player, driven by daily routines from src/data/npcs.js
// (a POI + an activity per time phase). They stroll between POIs with world.resolveMove, idle with small
// variations, look at the player when near, wave hello, turn and gesture while talking.
// Dialog itself belongs to Gameplay (systems.quests.talkTo) and UI (ui.dialog); this module only offers talk().
import * as THREE from 'three';
import { createCharacter } from './rig/index.js';
import { FALLBACK_NPCS } from './rig/looks.js';

import * as STR from './rig/strings.js';
/** [Fix] POIs where the player fishes: villagers stand behind them, never on them. */
const FISH_SPOTS = new Set(['dock_home', 'dock_village', 'waterfall_pond', 'cave_pool']);

const WALK_SPEED = 1.35;          // cozy stroll (walk_slow blend)
const LOOK_DIST = 5.5, WAVE_DIST = 6.5, FACE_DIST = 2.8;
const FAR_UPDATE = 4;             // far villagers animate every Nth frame

/**
 * @param {any} ctx
 * @param {{sandbox?:boolean}} [opts]  sandbox: line villagers up near the origin (no POIs needed)
 */
export function init(ctx, opts = {}) {
  ctx.i18n?.addStrings?.(STR.it, STR.en);
  const records = (Array.isArray(ctx.data?.npcs) && ctx.data.npcs.length) ? ctx.data.npcs : FALLBACK_NPCS;
  const list = [];
  const byId = {};
  const v = new THREE.Vector3(), head = new THREE.Vector3();
  let frame = 0, interactChecked = false;

  const groundY = (x, z) => {
    const w = ctx.world;
    const y = w?.groundY?.(x, z) ?? w?.heightAt?.(x, z) ?? ctx.stage?.heightAt?.(x, z) ?? 0;
    return Number.isFinite(y) ? y : 0;
  };
  const poiOf = (id) => { if (!id) return null; try { return ctx.world?.poi?.(id) || null; } catch { return null; } };
  const phase = () => ctx.time?.phase || 'day';
  const playerObj = () => ctx.player?.object || null;

  records.forEach((rec, i) => {
    let ch;
    try { ch = createCharacter(ctx, rec.look || {}, { id: rec.id }); } catch (e) { console.warn('[npc] could not build', rec.id, e); return; }
    const obj = ch.object;
    obj.name = `NPC:${rec.id}`;
    ctx.scene.add(obj);
    const n = makeNpc(rec, ch, i);
    list.push(n); byId[rec.id] = n;
  });

  function makeNpc(rec, ch, index) {
    const obj = ch.object;
    const rng = ctx.math?.rng ? ctx.math.rng('npc:' + rec.id) : Math.random;
    const rand = (a, b) => a + (typeof rng === 'function' ? rng() : Math.random()) * (b - a);
    const st = {
      facing: 0, facingGoal: 0, speed: 0, target: null, act: 'idle', seated: false, asleep: false,
      idleT: rand(3, 8), wanderT: rand(2, 5), waveCd: rand(0, 4), talkT: 0, stuckT: 0, lastD: Infinity, acc: 0,
      lookOverride: null, home: null,
    };
    const n = {
      id: rec.id, data: rec, object: obj, character: ch,
      get position() { return obj.position; },
      get facing() { return st.facing; },
      get state() { return st.asleep ? 'sleep' : st.talkT > 0 ? 'talk' : st.seated ? 'sit' : st.speed > 0.1 ? 'walk' : st.act; },
      get awake() { return !st.asleep; },
      play: (name, o) => ch.play(name, o),
      /** Look at a point / Object3D (null = automatic: the player when near). */
      lookAt(target) { st.lookOverride = target || null; },
      /** Start a conversation: Gameplay's quest/dialog flow if present, else the UI dialog, else just the bus event. */
      talk() {
        if (st.asleep) { ctx.ui?.toast?.('char.npc.asleep', { name: nameOf() }); return Promise.resolve(); }
        const q = ctx.systems?.quests;
        if (q?.talkTo) return Promise.resolve(q.talkTo(rec.id));
        ctx.bus?.emit('npc:talk', { npcId: rec.id });
        const keys = rec.dialogKeys?.hello?.length ? [rec.dialogKeys.hello[Math.floor(Math.random() * rec.dialogKeys.hello.length)]] : ['char.npc.hello_fallback'];
        return Promise.resolve(ctx.ui?.dialog?.(rec.id, keys)).finally(() => endTalk());
      },
      /** Called when a dialog starts / ends (also driven by the bus). */
      beginTalk, endTalk,
      /** Move to this phase's routine spot now (teleport = true skips the walk). */
      goRoutine(teleport = false) { applyRoutine(teleport); },
      update,
    };
    const nameOf = () => (rec.nameKey ? ctx.i18n.t(rec.nameKey) : rec.id);

    function routineSpot() {
      const r = rec.routine?.[phase()] || {};
      if (opts.sandbox) {
        const x = -2.6 + index * 5.2 * (index % 2 ? 1 : -0.5), z = -1.5 - index * 0.5;
        return { x, z, facing: 0, act: r.act === 'sleep' ? 'idle' : (r.act || 'idle'), talk: true };
      }
      const p = poiOf(r.poi) || poiOf(r.fallback) || poiOf(rec.home) || poiOf(rec.fallback);
      if (p) {
        // [Fix] never park on a fishing spot: queue up behind it (away from the water) so the player can still cast there
        const pid = poiOf(r.poi) === p ? r.poi : null;
        const f = p.facing ?? p.rot;
        if (pid && FISH_SPOTS.has(pid) && f != null) {
          const back = 2.6 + (index % 3) * 1.1;
          return { x: p.x - Math.sin(f) * back, z: p.z - Math.cos(f) * back, y: p.y, facing: f, kind: p.kind, act: r.act || 'idle', talk: r.talk !== false };
        }
        // spread villagers that share a POI so they never stand inside each other
        const a = index * 2.399, rr = r.act === 'sit' || r.act === 'sleep' ? 0 : 0.6 + (index % 3) * 0.35;
        return { x: p.x + Math.cos(a) * rr, z: p.z + Math.sin(a) * rr, y: p.y, facing: p.facing ?? p.rot ?? null, kind: p.kind, act: r.act || 'idle', talk: r.talk !== false };
      }
      const s = ctx.world?.spawn || { x: 0, z: 0 };
      return { x: s.x + 3 + index * 1.7, z: s.z - 2 - (index % 2) * 1.5, facing: null, act: r.act === 'sleep' ? 'idle' : (r.act || 'idle'), talk: r.talk !== false };
    }

    function applyRoutine(teleport) {
      const spot = routineSpot();
      st.home = spot;
      if (st.seated) { st.seated = false; ch.play('locomotion', { fade: 0.3 }); }
      if (st.asleep) { st.asleep = false; obj.visible = true; }
      const d = Math.hypot(spot.x - obj.position.x, spot.z - obj.position.z);
      const p = playerObj();
      const unseen = !p || Math.hypot(p.position.x - obj.position.x, p.position.z - obj.position.z) > 28;
      if (teleport || (d > 60 && unseen)) {
        obj.position.set(spot.x, groundY(spot.x, spot.z), spot.z);
        st.target = null; arrive();
      } else {
        st.target = { x: spot.x, z: spot.z }; st.stuckT = 0; st.lastD = Infinity;
      }
    }

    function arrive() {
      const s = st.home; st.target = null; st.act = s.act;
      if (s.facing != null) st.facingGoal = s.facing;
      if (s.act === 'sleep' && !s.talk) { st.asleep = true; obj.visible = false; return; }  // indoors for the night
      if (s.act === 'sit') {
        const seatY = Number.isFinite(s.y) && s.kind !== 'bench' ? s.y : groundY(s.x, s.z) + (s.kind === 'bench' || !Number.isFinite(s.y) ? 0.42 : 0);
        obj.position.set(s.x, seatY, s.z);
        st.seated = true;
        ch.play('sit_down', { fade: 0.25, next: 'sit_idle' });
        return;
      }
      ch.play('locomotion', { fade: 0.3 });
    }

    function beginTalk() {
      st.talkT = 6;
      if (!st.seated) ch.play('talk', { fade: 0.3 });
      else ch.play('talk', { fade: 0.3, layer: 'upper' });
      ch.setSpeaking(true);
    }
    function endTalk() {
      if (st.talkT <= 0) return;
      st.talkT = 0; ch.setSpeaking(false);
      if (st.seated) ch.animator.stopUpper(0.3); else ch.play('locomotion', { fade: 0.35 });
    }

    function update(dt) {
      if (st.asleep) return;
      const p = playerObj();
      const dp = p ? Math.hypot(p.position.x - obj.position.x, p.position.z - obj.position.z) : 999;
      const far = dp > (ctx.quality?.foliageDistance ?? 55);
      st.acc += dt;
      if (far && (frame + index) % FAR_UPDATE !== 0) return;
      const step = st.acc; st.acc = 0;

      // ---- walking along the routine ----
      let want = 0;
      if (st.target && st.talkT <= 0) {
        const dx = st.target.x - obj.position.x, dz = st.target.z - obj.position.z, d = Math.hypot(dx, dz);
        if (d < 0.25) arrive();
        else {
          st.facingGoal = Math.atan2(dx, dz);
          want = d < 1.2 ? WALK_SPEED * Math.max(0.35, d / 1.2) : WALK_SPEED;
          // progress watchdog: blocked by a collider for a while → hop to the goal (only far from the player)
          if (d > st.lastD - 0.02 * step) st.stuckT += step; else st.stuckT = 0;
          st.lastD = Math.min(st.lastD, d);
          if (st.stuckT > 4 && dp > 18) { obj.position.set(st.target.x, groundY(st.target.x, st.target.z), st.target.z); arrive(); }
        }
      } else if (!st.seated && st.talkT <= 0 && st.act === 'walk' && st.home) {
        // strolling around the POI with pauses
        st.wanderT -= step;
        if (st.wanderT <= 0) {
          st.wanderT = rand(5, 10);
          const a = rand(0, Math.PI * 2), r = rand(0.8, 3.2);
          st.target = { x: st.home.x + Math.cos(a) * r, z: st.home.z + Math.sin(a) * r }; st.lastD = Infinity; st.stuckT = 0;
        }
      }
      st.speed += (want - st.speed) * (1 - Math.exp(-(want > st.speed ? 4 : 6) * step));
      if (st.speed > 0.02 && !st.seated) {
        const nx = obj.position.x + Math.sin(st.facing) * st.speed * step, nz = obj.position.z + Math.cos(st.facing) * st.speed * step;
        const r = ctx.world?.resolveMove?.(obj.position, { x: nx, z: nz }, 0.35) || { x: nx, z: nz };
        obj.position.x = r.x; obj.position.z = r.z;
        obj.position.y = Number.isFinite(r.y) ? r.y : groundY(r.x, r.z);
      } else if (!st.seated) obj.position.y += (groundY(obj.position.x, obj.position.z) - obj.position.y) * (1 - Math.exp(-10 * step));

      // ---- social: face / look at / wave at the player ----
      st.waveCd -= step;
      const awakeIdle = !st.seated && st.speed < 0.2 && !st.target;
      if (p && dp < FACE_DIST && awakeIdle) st.facingGoal = Math.atan2(p.position.x - obj.position.x, p.position.z - obj.position.z);
      if (p && dp < WAVE_DIST && dp > 2.2 && st.waveCd <= 0 && st.talkT <= 0) {
        st.waveCd = rand(50, 90);
        ch.play('wave', { fade: 0.25, layer: st.seated || st.speed > 0.2 ? 'upper' : undefined });
      }
      if (st.lookOverride) ch.setLook(st.lookOverride, 1);
      else if (p && dp < LOOK_DIST) { p.getWorldPosition(head); head.y += 1.3; ch.setLook(head, 1); }
      else ch.setLook(null);

      // ---- idle flavour ----
      if (awakeIdle && st.talkT <= 0 && ch.animator.current === 'locomotion') {
        st.idleT -= step;
        if (st.idleT <= 0) {
          st.idleT = rand(7, 14);
          const pick = st.act === 'forage' ? 'crouch_pick' : st.act === 'sweep' || st.act === 'work' || st.act === 'cook' ? (Math.random() < 0.5 ? 'idle_hat' : 'idle_look')
            : phase() === 'night' && Math.random() < 0.4 ? 'idle_yawn' : Math.random() < 0.5 ? 'idle_look' : 'idle_hat';
          ch.play(pick, { fade: 0.35 });
        }
      }
      if (st.talkT > 0) { st.talkT -= step; if (st.talkT <= 0) { st.talkT = 0.001; endTalk(); } }

      // ---- turn & animate ----
      const da = Math.atan2(Math.sin(st.facingGoal - st.facing), Math.cos(st.facingGoal - st.facing));
      const turn = da * (1 - Math.exp(-(st.speed > 0.2 ? 6 : 4) * step));
      st.facing += turn;
      obj.rotation.y = st.facing;
      ch.animator.setSpeed(st.seated ? 0 : st.speed);
      ch.update(step, { ground: st.seated ? null : groundY, speed: st.speed, turnRate: step > 0 ? turn / step : 0, accel: 0 });
    }

    // initial placement
    applyRoutine(true);
    st.facing = st.facingGoal = st.home?.facing ?? (index * 1.3) % (Math.PI * 2);
    obj.rotation.y = st.facing;
    return n;
  }

  // ---- bus wiring ----
  const offs = [];
  const on = (e, f) => { const off = ctx.bus?.on?.(e, f); if (off) offs.push(off); };
  on('time:phase', () => { for (const n of list) n.goRoutine(false); });
  on('npc:talk', ({ npcId } = {}) => { const n = byId[npcId]; if (n && n.awake) n.beginTalk(); });
  for (const e of ['dialog:close', 'dialog:end', 'ui:dialog:close']) on(e, (d = {}) => { for (const n of list) if (!d.npcId || d.npcId === n.id) n.endTalk(); });

  // fallback interactables (only when Gameplay's interact system is missing, e.g. in the sandbox)
  function ensureInteract() {
    interactChecked = true;
    if (ctx.systems?.interact) return;
    const reg = ctx.world?.interactables?.register;
    if (!reg) return;
    for (const n of list) {
      reg.call(ctx.world.interactables, {
        id: 'npc:' + n.id, pos: n.object.position, radius: 2.4, kind: 'talk', labelKey: 'char.act.talk', icon: 'talk', priority: 3,
        enabled: () => n.awake && n.object.visible, onInteract: () => n.talk(),
      });
    }
  }

  const tick = (dt) => {
    frame++;
    if (!interactChecked && frame > 2) ensureInteract();
    for (const n of list) { try { n.update(dt); } catch (e) { console.warn('[npc] update', n.id, e); } }
  };
  const removeLoop = ctx.loop?.add?.(tick, ctx.ORDER?.actors ?? 20);

  return {
    list, byId,
    get: (id) => byId[id] || null,
    /** Nearest awake villager within maxDist of a point. */
    nearest(pos, maxDist = 3) {
      let best = null, bd = maxDist;
      for (const n of list) { if (!n.awake) continue; const d = Math.hypot(n.object.position.x - pos.x, n.object.position.z - pos.z); if (d < bd) { bd = d; best = n; } }
      return best;
    },
    update: tick,
    dispose() { removeLoop?.(); offs.forEach(f => f()); for (const n of list) n.character.dispose(); list.length = 0; },
  };
}

export default { init };
