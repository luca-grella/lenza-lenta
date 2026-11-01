// Fishing: aim → charge (pendulum power) → cast (arc + line) → calm wait with nibbles → bite ("!", plunge, haptic)
// → strike window → reel minigame (reelModel.js) → landed (catch card) | escape (gentle shrug).
// States: idle | aim | charge | cast | wait | bite | strike | reel | landed | escape | cancel.
// Emits fishing:state {state, prev}, fishing:cast, fishing:bite, fishing:strike, fishing:escape, fishing:catch.
import * as THREE from 'three';
import { createTackle, fallbackFish } from './tackle.js';
import { reelParams, createReelSim } from './reelModel.js';

const IDLE = new Set(['idle', 'aim']);
const MIN_CAST = 3;
const RARITY_INDEX = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const rand = (a, b) => a + (b - a) * Math.random();

export function createFishing(ctx, env, fx) {
  const tackle = createTackle(ctx);
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};

  const v = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), land: new THREE.Vector3(), tip: new THREE.Vector3(), tmp: new THREE.Vector3(),
    fish: new THREE.Vector3(), edge: new THREE.Vector3(), mid: new THREE.Vector3(), bob: new THREE.Vector3(), perp: new THREE.Vector3(), start: new THREE.Vector3() };

  let state = 'idle', stateT = 0, t = 0;
  let aim = null, aimT = 0, stillT = 0;
  let power = 0, chargeT = 0, aimAngle = 0, valid = false, invalidReason = null;
  let castDur = 1, launched = false;
  let session = null; // everything about the current cast
  let reel = null;
  let fishMesh = null;
  let pendingCatch = null;
  let animNow = null, animT = 0;
  let cancelPushT = 0;

  // ---------------------------------------------------------------- helpers
  function setState(s) {
    if (s === state) return;
    const prev = state;
    state = s; stateT = 0;
    ctx.bus.emit('fishing:state', { state: s, prev });
  }
  function anim(name, opts = {}) {
    if (animNow === name && !opts.force) return;
    animNow = name; animT = 0;
    env.play(name, { fade: 0.25, ...opts });
  }
  const onBoat = () => !!sys().boat?.active;
  const gear = () => sys().inventory?.gear?.() || { rod: { stats: { cast: 9, power: 1, luck: 0, control: 1 } }, reel: { stats: {} }, line: { stats: { strength: 1, grace: 1.2, stealth: 1 } } };
  const buff = s => sys().buffs?.mult?.(s) || 1;

  /** Where would a cast at this power land, and is it valid? */
  function landingFor(angle, pw, out) {
    const g = gear();
    const maxD = g.rod.stats.cast || 9;
    const d = MIN_CAST + (maxD - MIN_CAST) * pw;
    env.playerPos(v.origin);
    out.set(v.origin.x + Math.sin(angle) * d, 0, v.origin.z + Math.cos(angle) * d);
    const water = env.isWater(out.x, out.z);
    out.y = water ? env.waterSurface(out.x, out.z) : env.groundY(out.x, out.z);
    let ok = water && env.waterDepth(out.x, out.z) >= 0.3, reason = null;
    if (!water) reason = 'land';
    else if (!ok) reason = 'shallow';
    const habitat = ok ? env.habitatAt(out.x, out.z) : null;
    if (ok && !habitat) { ok = false; reason = 'land'; }
    const zone = env.zoneAt(out.x, out.z);
    if (ok && (zone === 'sea_cave' || habitat === 'cave') && !sys().inventory?.owns?.('lantern')) { ok = false; reason = 'dark'; }
    return { ok, reason, habitat, zone, dist: d };
  }

  /** Look for water in front of the player (±60°). Returns {angle} or null. */
  function computeAim() {
    const p = env.player();
    if (!p?.object) return null;
    if (env.busy.sleep) return null;
    const st = p.state;
    if (!onBoat() && (st === 'sit' || st === 'sleep' || st === 'talk' || st === 'forage' || st === 'eat' || st === 'cutscene')) return null;
    if (onBoat() && sys().boat?.speed > 0.6) return null;
    env.playerPos(v.origin);
    const face = env.playerFacing();
    const maxD = gear().rod.stats.cast || 9;
    for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95]) {
      const a = face + da;
      v.dir.set(Math.sin(a), 0, Math.cos(a));
      const w = env.nearestWaterAlong(v.origin, v.dir, maxD - 0.5);
      if (!w) continue;
      // there must be a valid landing spot somewhere along this direction
      for (const pw of [0.55, 0.85, 0.3, 1]) {
        const L = landingFor(a, pw, v.tmp);
        if (L.ok || L.reason === 'dark') return { angle: a, power: pw, reason: L.ok ? null : L.reason };
      }
    }
    return null;
  }

  function surfaceAt(p) { return env.isWater(p.x, p.z) ? env.waterSurface(p.x, p.z) : p.y; }

  // ---------------------------------------------------------------- catch selection
  function pickCatch(habitat, zone) {
    const d = D(), h = d.helpers;
    const inv = sys().inventory, journal = sys().journal;
    const stats = (S().stats ||= {});
    const baitId = inv?.bait || 'bait_worm';
    const g = gear();
    const goodwill = Math.min(0.08, (stats.goodwill || 0) * 0.002);
    const pity = Math.min(0.35, Math.max(0, (stats.sinceRare || 0) - 10) * 0.025);
    const luck = (g.rod.stats.luck || 0) + (buff('luck') - 1) + goodwill + pity;
    const caught = new Set(journal?.caughtIds?.() || []);
    const q = { habitat, zone, phase: ctx.time.phase, weather: env.weather(), baitId, luck, lantern: !!inv?.owns?.('lantern'), exclude: caught, caught };
    if (!h?.biteTable) return { id: null, junk: false, baitId };
    let table = h.biteTable(q);
    // The very first catch of a new save is always a real, common fish.
    const first = !caught.size;
    if (first) table = table.filter(e => !e.junk && d.fishById[e.id]?.rarity === 'common');
    if (!table.filter(e => !e.junk).length) { const q2 = { ...q, baitId: 'bait_worm' }; table = h.biteTable(q2).concat(table.filter(e => e.junk)); if (first) table = table.filter(e => !e.junk); }
    if (!table.length) table = h.biteTable({ ...q, baitId: 'bait_bread' });
    const e = table.length ? h.pickWeighted(table, Math.random()) : null;
    return { id: e?.id || null, junk: !!e?.junk, baitId, first };
  }

  function waitDuration(sp, habitat) {
    const inv = sys().inventory;
    const bait = inv?.baitRecord?.();
    const g = gear();
    let w = rand(6.5, 14);
    if (session?.first) w = rand(4, 6);
    w *= bait?.biteSpeed || 1;
    w *= g.line.stats.stealth || 1;
    w /= buff('bite');
    if (bait?.attracts?.includes(habitat)) w *= 0.85;
    if (bait?.nightBonus && ctx.time.phase !== 'night' && habitat !== 'cave') w *= 1.6;
    if (ctx.time.phase === 'night' && inv?.owns?.('lantern')) w /= 1.15;
    if (env.weather() === 'rain') w *= 0.9;
    return Math.max(3.5, w);
  }

  // ---------------------------------------------------------------- state entry points
  function beginCharge() {
    if (!aim) return;
    aimAngle = aim.angle;
    env.face(aimAngle);
    if (!onBoat()) env.setControl(false);
    env.setPlayerState('fishing');
    power = 0; chargeT = 0;
    setState('charge');
    ctx.cameraRig?.setMode?.('fishing');
    ctx.cameraRig?.setFocus?.(tackle.ring);
    anim('cast_windup', { loop: false });
    sys().boat?.setFishing?.(true);
  }

  function beginCast() {
    const L = landingFor(aimAngle, power, v.land);
    if (!L.ok) { abortCharge(L.reason); return; }
    const sp = pickCatch(L.habitat, L.zone);
    session = {
      point: v.land.clone(), habitat: L.habitat, zone: L.zone, dist: L.dist, species: sp.id, junk: sp.junk, bait: sp.baitId, first: sp.first,
      misses: 0, creatureFish: null, nibbles: [], waitDur: 0, ownShadow: false, angle: aimAngle,
    };
    const spr = D().get?.(sp.id);
    session.fishLenGuess = spr?.size ? Math.max(0.35, Math.min(1.6, ((spr.size[0] + spr.size[1]) / 2) / 100 * 1.2)) : 0.5;
    // The fish comes in to the water's edge in front of the player (or the boat side).
    env.playerPos(v.origin);
    session.edge = new THREE.Vector3();
    const steps = Math.ceil(L.dist / 0.25);
    session.edge.copy(session.point);
    for (let i = steps; i >= 0; i--) {
      const u = i / steps;
      const x = v.origin.x + (session.point.x - v.origin.x) * u, z = v.origin.z + (session.point.z - v.origin.z) * u;
      if (env.isWater(x, z) && env.waterDepth(x, z) > 0.12) session.edge.set(x, env.waterSurface(x, z), z);
      else break;
    }
    if (session.edge.distanceTo(v.origin) < 1.0) { // standing over water (dock or boat): stop a bit in front
      session.edge.set(v.origin.x + Math.sin(aimAngle) * 1.3, 0, v.origin.z + Math.cos(aimAngle) * 1.3);
      session.edge.y = env.waterSurface(session.edge.x, session.edge.z);
    }
    castDur = 0.55 + L.dist * 0.035;
    launched = false;
    setState('cast');
    anim('cast_release', { loop: false });
    env.meter('cast', null);
    tackle.hideRing();
    S().stats.casts = (S().stats.casts | 0) + 1;
  }

  function abortCharge(reason) {
    env.meter('cast', null);
    tackle.hideRing();
    const key = reason === 'dark' ? 'sys.fish.too_dark' : reason === 'shallow' ? 'sys.fish.too_shallow' : 'sys.fish.no_water';
    env.toast(key);
    endSession(true);
  }

  function beginWait(short = false) {
    const sp = D().get?.(session.species);
    session.waitDur = short ? rand(3, 6) : waitDuration(sp, session.habitat);
    const n = short ? 1 : 1 + Math.floor(Math.random() * 3);
    session.nibbles = Array.from({ length: n }, () => ({ at: session.waitDur * rand(0.3, 0.88), done: false })).sort((a, b) => a.at - b.at);
    setState('wait');
    anim('fish_wait', { loop: true });
    // a visible fish swims to the bobber
    if (!session.junk && !session.creatureFish) {
      const fs = ctx.creatures?.fishShadows;
      try {
        const f = fs?.nearestFish?.(session.point, session.habitat, 10);
        if (f) { fs.attract?.(f, session.point); session.creatureFish = f; }
      } catch (e) { console.warn('[fishing] fishShadows', e); }
      session.ownShadow = !session.creatureFish;
      session.shadowAngle = Math.random() * Math.PI * 2;
    }
  }

  function releaseCreatureFish() {
    if (session?.creatureFish) { try { ctx.creatures?.fishShadows?.release?.(session.creatureFish); } catch { /* ignore */ } session.creatureFish = null; }
  }

  function beginBite() {
    setState('bite');
    const g = gear();
    session.window = 1.7 * buff('calm') * Math.sqrt(g.rod.stats.control || 1) + (session.first ? 0.8 : 0);
    if (!env.realUI()) tackle.showBang(session.point);
    fx.splash(session.point, 0.55);
    env.sfx('bite', { pos: session.point });
    ctx.haptic?.([25, 40, 60]);
    ctx.cameraRig?.shake?.(0.12);
    ctx.bus.emit('fishing:bite', { habitat: session.habitat, zone: session.zone, pos: session.point.clone() });
  }

  function beginStrike() {
    tackle.hideBang();
    sys().inventory?.consumeBait?.();
    const sp = D().get?.(session.species) || null;
    const g = gear();
    const params = reelParams({
      behavior: sp?.behavior || 'calm', difficulty: sp?.difficulty ?? 0.2, junk: !!session.junk || !sp,
      preset: D().constants?.BEHAVIORS?.[sp?.behavior],
      rod: g.rod.stats, reel: g.reel.stats, line: g.line.stats, calm: buff('calm'), reelBuff: buff('reel'),
    });
    reel = createReelSim(params);
    session.sp = sp;
    session.fishLen = sp && !session.junk ? Math.max(0.35, Math.min(1.6, ((sp.size[0] + sp.size[1]) / 2) / 100 * 1.2)) : 0.5;
    setState('strike');
    anim('strike', { loop: false });
    fx.splash(session.point, 1.1);
    env.sfx('splash_big', { pos: session.point, vol: 0.6 });
    env.sfx('reel_click', { pitch: 0.8 });
    ctx.cameraRig?.shake?.(0.18);
    ctx.haptic?.(30);
    releaseCreatureFish();
    ctx.bus.emit('fishing:strike', { habitat: session.habitat, behavior: sp?.behavior || 'calm', junk: !!session.junk });
  }

  function makeFishMesh() {
    const id = session.species;
    let m = null;
    try { m = ctx.fishModels?.create?.(id, { lod: 0 }); } catch (e) { console.warn('[fishing] fishModels.create', e); }
    if (!m?.object) m = fallbackFish(D().get?.(id));
    // normalise to ~the real size (a bit exaggerated so it reads from the top-down camera)
    const box = new THREE.Box3().setFromObject(m.object);
    const len = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, box.max.y - box.min.y) || 1;
    const sizeCm = session.size || ((session.sp?.size?.[0] || 20) + (session.sp?.size?.[1] || 40)) / 2;
    const target = session.junk ? 0.5 : Math.max(0.32, Math.min(1.7, sizeCm / 100 * 1.25));
    m.object.scale.multiplyScalar(target / len);
    m.object.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return m;
  }

  function beginLanded() {
    const d = D();
    const sp = session.sp || d.get?.(session.species);
    const isJunk = !!session.junk || sp?.kind === 'junk';
    const size = isJunk ? 0 : d.helpers?.rollSize?.(sp, Math.random(), buff('size') * (d.get?.(session.bait)?.sizeMult || 1)) ?? 0;
    session.size = size;
    const price = sp ? (d.helpers?.priceFor?.(sp, size) ?? sp.price) : 1;
    const prevBest = sys().journal?.get?.(session.species)?.best || 0;
    const rec = sys().journal?.record?.({ speciesId: session.species, size }) || { isNew: false, isRecord: false };
    const stats = S().stats;
    stats.catches = (stats.catches | 0) + 1;
    if (!isJunk) stats.sinceRare = RARITY_INDEX[sp?.rarity] >= 2 ? 0 : (stats.sinceRare | 0) + 1;
    pendingCatch = {
      speciesId: session.species, size, price, habitat: session.habitat, zone: session.zone, bait: session.bait,
      rarity: sp?.rarity || 'common', junk: isJunk, isNew: rec.isNew, isRecord: rec.isRecord, prevBest,
      nameKey: sp?.nameKey || `fish.${session.species}.name`, descKey: sp?.descKey || `fish.${session.species}.desc`,
      phase: ctx.time.phase, weather: env.weather(), day: ctx.time.day, resolved: false,
    };
    setState('landed');
    // fish flies out of the water into the player's hands
    fishMesh = makeFishMesh();
    ctx.scene.add(fishMesh.object);
    session.liftFrom = (session.fishPos || session.edge).clone();
    fx.splash(session.liftFrom, 1.3);
    env.sfx('splash_big', { pos: session.liftFrom, vol: 0.7 });
    tackle.hideShadow();
    env.meter('reel', null);
    const happy = !isJunk && (RARITY_INDEX[pendingCatch.rarity] >= 2 || pendingCatch.isRecord);
    anim(happy ? 'catch_happy' : 'catch_show', { loop: false });
    const jingle = isJunk ? 'pickup' : d.constants?.RARITY?.[pendingCatch.rarity]?.jingle || 'catch_jingle';
    env.sfx(jingle, { delay: 0.45 });
    if (happy) ctx.cameraRig?.shake?.(0.15);
    ctx.haptic?.([20, 30, 20]);
    ctx.bus.emit('fishing:catch', {
      speciesId: pendingCatch.speciesId, size, price, habitat: session.habitat, zone: session.zone, bait: session.bait,
      isNew: rec.isNew, isRecord: rec.isRecord, junk: isJunk, rarity: pendingCatch.rarity, kind: isJunk ? 'junk' : 'fish',
      card: false, // Systems opens the catch card itself once the fish is in the player's hands
    });
  }

  function openCard() {
    const inv = sys().inventory;
    const c = pendingCatch;
    const it = D().get?.(c.speciesId);
    const keyItem = c.junk && it?.sellable === false;
    c.basketFull = !keyItem && !!inv?.basketFull;
    c.canKeep = keyItem || !c.basketFull;
    c.choices = c.junk ? (c.canKeep ? ['keep'] : ['release']) : ['keep', 'release', 'cat'].filter(ch => ch !== 'keep' || c.canKeep);
    const cat = sys().cat;
    const cp = cat?.position?.();
    c.canGiveCat = !c.junk && (!!cat?.befriended || (!!cp && cp.distanceTo?.(env.playerPos()) < 14));
    if (!c.canGiveCat) c.choices = c.choices.filter(ch => ch !== 'cat');
    c.onChoice = choice => fishing.resolveCatch(choice);
    session.cardOpen = true;
    const fallback = c.canKeep ? 'keep' : 'release';
    if (env.ui()?.sheet) {
      const r = env.sheet('catch', { ...c });
      // the real UI returns a Promise with the choice; the fallback HUD calls onChoice / emits ui:sheet instead
      if (r && typeof r.then === 'function') r.then(ch => fishing.resolveCatch(['keep', 'release', 'cat'].includes(ch) ? ch : fallback), () => fishing.resolveCatch(fallback));
    } else fishing.resolveCatch(fallback);
  }

  function beginEscape(reason) {
    setState('escape');
    tackle.hideBang(); tackle.hideShadow();
    env.meter('reel', null);
    releaseCreatureFish();
    if (reason === 'snap') {
      env.sfx('line_snap');
      ctx.cameraRig?.shake?.(0.2);
      tackle.hideLine();
      session.loose = true;
    } else {
      fx.splash(session.fishPos || session.point, 0.6);
      env.sfx('splash_small', { pos: session.point });
    }
    anim('fail_shrug', { loop: false });
    const k = 1 + Math.floor(Math.random() * 3);
    env.toastFB(`sys.fish.escape.${reason === 'snap' ? 'snap' : 'missed'}.${k}`);
    S().stats.escapes = (S().stats.escapes | 0) + 1;
    ctx.bus.emit('fishing:escape', { reason, habitat: session.habitat, speciesId: session.species });
  }

  function beginCancel() {
    setState('cancel');
    tackle.hideBang(); tackle.hideShadow();
    releaseCreatureFish();
    session.retractFrom = tackle.bobber.position.clone();
    env.sfx('reel_click', { pitch: 1.3 });
    ctx.bus.emit('fishing:cancel', {});
    anim('reel', { loop: true });
  }

  function endSession(silent = false) {
    releaseCreatureFish();
    tackle.hideAll();
    env.meter('reel', null); env.meter('cast', null);
    if (fishMesh) { fishMesh.object.parent?.remove(fishMesh.object); fishMesh = null; }
    try { env.player().holdFish?.(null); } catch { /* ignore */ }
    ctx.cameraRig?.setFocus?.(null);
    ctx.post?.setFocus?.(null);
    sys().boat?.setFishing?.(false);
    if (onBoat()) ctx.cameraRig?.setMode?.('boat');
    else { ctx.cameraRig?.setMode?.('explore'); env.setControl(true); env.setPlayerState('idle'); }
    if (!silent && animNow !== 'fail_shrug') { /* the player module returns to idle by itself */ }
    animNow = null;
    session = null; reel = null; pendingCatch = null;
    setState('idle');
  }

  // ---------------------------------------------------------------- per-frame
  function updateBobberIdle(dt) {
    const p = session.point;
    const bob = Math.sin(t * 2.1) * 0.025 + Math.sin(t * 3.7) * 0.01;
    tackle.bobber.position.set(p.x, p.y + bob, p.z);
    tackle.bobber.rotation.set(Math.sin(t * 1.7) * 0.08, 0, Math.cos(t * 1.3) * 0.08);
  }

  function lineFromTip(sag, wiggle = 0) {
    env.rodTip(v.tip);
    v.bob.copy(tackle.bobber.position); v.bob.y += 0.22;
    tackle.setLine(v.tip, v.bob, sag, wiggle, t);
  }

  function updateFocus() {
    v.mid.copy(env.playerPos(v.tmp)).lerp(tackle.bobber.position, 0.5);
    ctx.post?.setFocus?.(v.mid);
  }

  const fishing = {
    tackle,
    get state() { return state; },
    /** True while a cast is in progress (anything but idle/aim). */
    get busy() { return !IDLE.has(state); },
    /** Current aim (water ahead) or null. */
    get aim() { return aim; },
    get canCast() { return !!aim && !aim.reason && IDLE.has(state); },
    get power() { return power; },
    get session() { return session; },
    get reel() { return reel; },
    get pendingCatch() { return pendingCatch; },
    /** Bobber world position while it is out (else null). */
    get bobber() { return tackle.bobber.visible ? tackle.bobber.position : null; },
    /** Context action while fishing (for the UI action button). */
    actionInfo() {
      switch (state) {
        case 'charge': return { kind: 'fishing', labelKey: 'sys.act.release_cast', icon: 'cast', hold: true };
        case 'cast': case 'wait': return { kind: 'fishing', labelKey: 'sys.act.reel_in', icon: 'wait' };
        case 'bite': return { kind: 'fishing', labelKey: 'sys.act.strike', icon: 'strike', urgent: true };
        case 'strike': case 'reel': return { kind: 'fishing', labelKey: 'sys.act.reel', icon: 'reel', hold: true, holding: ctx.input.action.held };
        default: return { kind: 'fishing', labelKey: null, icon: null, disabled: true };
      }
    },
    /** Catch card choice: 'keep' | 'release' | 'cat'. */
    resolveCatch(choice = 'keep') {
      const c = pendingCatch;
      if (!c || c.resolved || state !== 'landed') return false;
      c.resolved = true;
      const inv = sys().inventory;
      const it = D().get?.(c.speciesId);
      const stats = S().stats;
      if (choice === 'keep') {
        if (c.junk && it?.sellable === false) inv?.add?.(c.speciesId, 1);
        else if (!inv?.addCatch?.({ id: c.speciesId, size: c.size, price: c.price })) { env.toast('sys.fish.basket_full'); choice = 'release'; }
        if (choice === 'keep' && c.speciesId === 'junk_duck' && !inv?.count?.('decor_duck') && !S().home?.decorOwned?.decor_duck) inv?.add?.('decor_duck', 1);
      }
      if (choice === 'cat') {
        if (!sys().cat?.feedCatch?.(c)) choice = 'release';
      }
      if (choice === 'release') {
        const rel = D().constants?.RARITY?.[c.rarity]?.release || 1;
        stats.goodwill = (stats.goodwill | 0) + (c.junk ? 0 : rel);
        stats.released = (stats.released | 0) + 1;
        session.tossBack = true;
      }
      ctx.save.commit();
      ctx.bus.emit('catch:resolve', { choice, speciesId: c.speciesId, size: c.size });
      if (c.junk && c.speciesId === 'junk_bottle' && choice === 'keep') sys().quests?.readBottle?.();
      session.resolveT = 0;
      session.cardOpen = false;
      if (choice === 'release') {
        // toss the fish back
        try { env.player().holdFish?.(null); } catch { /* ignore */ }
        if (fishMesh) { ctx.scene.add(fishMesh.object); env.playerPos(v.tmp); fishMesh.object.position.set(v.tmp.x, v.tmp.y + 1.6, v.tmp.z); session.tossFrom = fishMesh.object.position.clone(); }
        env.sfx('splash_small', { pos: session.edge, delay: 0.5 });
      } else {
        endSession();
      }
      return true;
    },
    /** Force-cancel (UI, sleep, boarding…). */
    cancel() { if (fishing.busy) { if (state === 'landed' && pendingCatch && !pendingCatch.resolved) fishing.resolveCatch('keep'); else endSession(true); } },

    update(dt) {
      t += dt; stateT += dt; animT += dt;
      const input = ctx.input;
      const L = ctx.time?.lighting?.();
      tackle.update(dt, t, L ? L.night : 0);
      if (session) tackle.setLineColor(D().get?.(S().equip?.line)?.model?.color, L ? 0.35 + 0.65 * L.daylight : 1);

      // ---- idle / aim: find water ahead and preview the landing spot when standing still
      if (IDLE.has(state)) {
        aimT -= dt;
        if (aimT <= 0) { aim = computeAim(); aimT = 0.1; }
        const moving = (input.move?.mag || 0) > 0.08 || (onBoat() && (sys().boat?.speed || 0) > 0.3);
        stillT = moving ? 0 : stillT + dt;
        const cur = sys().interact?.current;
        const castIsAction = cur?.kind === 'cast';
        if (aim && castIsAction && stillT > 0.35 && !env.uiOpen()) {
          if (state !== 'aim') setState('aim');
          const Lp = landingFor(aim.angle, aim.power, v.land);
          tackle.showRing(v.land, Lp.ok, t, 0.85);
        } else {
          if (state === 'aim') setState('idle');
          tackle.hideRing();
        }
        if (castIsAction && input.action.down && aim && !aim.reason && !env.uiOpen()) beginCharge();
        else if (castIsAction && input.action.down && aim?.reason === 'dark') env.toast('sys.fish.too_dark');
        return;
      }

      switch (state) {
        case 'charge': {
          chargeT += dt;
          // pendulum: 0 → 1 → 0 every 2.2 s
          power = 0.5 - 0.5 * Math.cos((chargeT / 1.1) * Math.PI);
          // the joystick steers the aim a little
          const sx = input.moveScreen?.x || 0;
          if (Math.abs(sx) > 0.15) { aimAngle -= sx * 1.1 * dt; env.face(aimAngle); }
          const Lp = landingFor(aimAngle, power, v.land);
          valid = Lp.ok; invalidReason = Lp.reason;
          tackle.showRing(v.land, valid, t, 1);
          env.rodTip(v.tip);
          tackle.showArc(v.tip, v.land, valid, t);
          env.meter('cast', { power, valid, reason: invalidReason, hint: valid ? 'sys.hint.release_cast' : `sys.hint.${invalidReason || 'land'}` });
          // dangling bobber under the rod tip
          tackle.bobber.visible = true;
          tackle.bobber.position.set(v.tip.x, v.tip.y - 0.75 + Math.sin(t * 5) * 0.03, v.tip.z);
          tackle.bobber.rotation.set(0, 0, Math.sin(t * 4) * 0.2);
          v.bob.copy(tackle.bobber.position); v.bob.y += 0.4;
          tackle.setLine(v.tip, v.bob, 0, 0, t);
          if (!input.action.held || input.action.up) {
            if (chargeT < 0.18) { // a quick tap casts to the preview spot
              power = aim?.power ?? 0.55;
              const q = landingFor(aimAngle, power, v.land);
              if (!q.ok) { // try the other preview distances
                for (const pw of [0.55, 0.85, 0.3, 1]) { if (landingFor(aimAngle, pw, v.land).ok) { power = pw; break; } }
              }
            }
            beginCast();
          } else if (!env.player()?.object) endSession(true);
          break;
        }
        case 'cast': {
          const launchAt = 0.22;
          env.rodTip(v.tip);
          if (stateT < launchAt) {
            tackle.bobber.position.set(v.tip.x, v.tip.y - 0.6, v.tip.z);
            v.bob.copy(tackle.bobber.position); v.bob.y += 0.4;
            tackle.setLine(v.tip, v.bob, 0, 0, t);
            break;
          }
          if (!launched) { launched = true; session.launch = v.tip.clone(); env.sfx('cast_whoosh', { pitch: 0.9 + Math.random() * 0.2 }); }
          const u = Math.min(1, (stateT - launchAt) / castDur);
          const e = u; // the arc already reads as a throw; keep the flight linear in time
          tackle.arcPoint(session.launch, session.point, e, tackle.bobber.position);
          tackle.bobber.rotation.set(u * 9, 0, 0);
          lineFromTip(0.15 + u * 0.25);
          if (u >= 1) {
            tackle.bobber.rotation.set(0, 0, 0);
            fx.splash(session.point, 0.75);
            env.sfx('splash_small', { pos: session.point });
            ctx.cameraRig?.setMode?.('fishing');
            ctx.cameraRig?.setFocus?.(tackle.bobber);
            ctx.bus.emit('fishing:cast', { point: session.point.clone(), habitat: session.habitat, zone: session.zone, bait: session.bait });
            beginWait();
          }
          break;
        }
        case 'wait': {
          updateBobberIdle(dt);
          lineFromTip(0.55);
          updateFocus();
          for (const n of session.nibbles) {
            if (!n.done && stateT >= n.at) { n.done = true; n.t = 0; fx.ripple(session.point, 0.45, { life: 1.1, alpha: 0.6 }); env.sfx('splash_small', { pos: session.point, vol: 0.18, pitch: 1.7 }); }
            if (n.done && n.t !== undefined && n.t < 0.35) { n.t += dt; tackle.bobber.position.y -= Math.sin((n.t / 0.35) * Math.PI) * 0.07; }
          }
          // our own fish shadow (when Creatures is not providing one) circles in during the last part of the wait
          if (session.ownShadow) {
            const k = Math.min(1, Math.max(0, (stateT / session.waitDur - 0.35) / 0.6));
            if (k > 0) {
              session.shadowAngle += dt * (0.5 + k * 0.6);
              const r = 3.2 * (1 - k) + 0.35;
              v.fish.set(session.point.x + Math.cos(session.shadowAngle) * r, session.point.y, session.point.z + Math.sin(session.shadowAngle) * r);
              if (env.isWater(v.fish.x, v.fish.z)) tackle.showShadow(v.fish, -session.shadowAngle, (session.fishLenGuess || 0.6), 0.32 * Math.min(1, k * 3));
              else tackle.hideShadow();
            }
          }
          if (input.action.down && stateT > 0.25) { beginCancel(); break; }
          if ((input.move?.mag || 0) > 0.6 && !onBoat()) { cancelPushT += dt; if (cancelPushT > 0.5) { cancelPushT = 0; beginCancel(); break; } } else cancelPushT = 0;
          if (stateT >= session.waitDur) beginBite();
          break;
        }
        case 'bite': {
          const p = session.point;
          const plunge = Math.min(1, stateT / 0.12);
          tackle.bobber.position.set(p.x + Math.sin(t * 40) * 0.03, p.y - 0.24 * plunge + Math.sin(t * 25) * 0.03, p.z);
          tackle.bobber.rotation.set(Math.sin(t * 30) * 0.25, 0, 0.3);
          lineFromTip(0.2, 0.01);
          updateFocus();
          if (stateT % 0.4 < dt) fx.ripple(p, 0.5, { life: 0.9 });
          if (input.action.down) { beginStrike(); break; }
          if (stateT > session.window) {
            tackle.hideBang();
            session.misses++;
            if (session.misses >= 2) beginEscape('missed');
            else { env.toast('sys.fish.missed_again'); beginWait(true); }
          }
          break;
        }
        case 'strike': {
          updateBobberIdle(dt);
          tackle.bobber.position.y -= 0.12;
          lineFromTip(0.05, 0.015);
          updateFocus();
          if (stateT > 0.45) {
            setState('reel');
            session.fishPos = session.point.clone();
            session.trailT = 0; session.clickT = 0; session.hapticT = 0;
            anim('reel', { loop: true });
          }
          break;
        }
        case 'reel': {
          const holding = input.action.held;
          const ev = reel.step(dt, holding);
          // fish position: from the cast point toward the edge, swerving sideways
          v.perp.set(session.point.z - session.edge.z, 0, -(session.point.x - session.edge.x)).normalize();
          const k = reel.progress;
          v.fish.lerpVectors(session.point, session.edge, k);
          v.fish.addScaledVector(v.perp, reel.lateral * 1.6 * (1 - 0.5 * k));
          v.fish.y = surfaceAt(v.fish);
          if (!env.isWater(v.fish.x, v.fish.z)) v.fish.lerp(session.edge, 0.5);
          session.fishPos.lerp(v.fish, Math.min(1, dt * 6));
          const running = reel.phase === 'run' || reel.phase === 'jump';
          const tn = reel.tensionN;
          // bobber dragged under by the fish
          const fp = session.fishPos;
          tackle.bobber.position.set(fp.x + Math.sin(t * 23) * 0.02 * (running ? 2 : 1), fp.y - 0.1 - Math.min(0.12, tn * 0.12), fp.z);
          tackle.bobber.rotation.set(0.5 + Math.sin(t * 9) * 0.1, Math.atan2(fp.x - session.edge.x, fp.z - session.edge.z), 0);
          lineFromTip(Math.max(0, 0.35 * (1 - Math.min(1, tn * 1.2))), tn > 0.7 ? 0.012 : 0);
          // shadow + trails
          const ang = Math.atan2(session.point.x - session.edge.x, session.point.z - session.edge.z) + reel.lateral * 0.6;
          if (!session.junk) tackle.showShadow(fp, ang, session.fishLen, reel.phase === 'jump' ? 0.1 : 0.42);
          session.trailT -= dt;
          if (session.trailT <= 0) { session.trailT = running ? 0.22 : 0.45; fx.ripple(fp, running ? 0.7 : 0.45, { life: 1.1, alpha: running ? 0.7 : 0.45 }); if (running && !session.junk) fx.splash(fp, 0.35); }
          // sounds & feel
          if (holding) { session.clickT -= dt; if (session.clickT <= 0) { session.clickT = 0.11; env.sfx('reel_click', { vol: 0.32, pitch: 0.9 + Math.random() * 0.25 + (running ? -0.15 : 0) }); } }
          if (reel.danger > 0.7) { session.hapticT -= dt; if (session.hapticT <= 0) { session.hapticT = 0.35; ctx.haptic?.(8); } }
          for (const e of ev) {
            if (e === 'run') { ctx.cameraRig?.shake?.(0.1); ctx.haptic?.(14); fx.splash(fp, 0.6); env.sfx('splash_small', { pos: fp, vol: 0.5 }); }
            if (e === 'warn') { fx.ripple(fp, 0.6, { life: 0.8 }); }
            if (e === 'jump') {
              if (!fishMesh) { fishMesh = makeFishMesh(); }
              ctx.scene.add(fishMesh.object);
              session.jumpFrom = fp.clone(); session.jumpT = 0;
              fx.splash(fp, 1.4); env.sfx('splash_big', { pos: fp, vol: 0.6 }); ctx.cameraRig?.shake?.(0.22);
            }
            if (e === 'splashdown') { fx.splash(fp, 1.5); env.sfx('splash_big', { pos: fp, vol: 0.7 }); if (fishMesh) fishMesh.object.parent?.remove(fishMesh.object); }
          }
          if (session.jumpFrom && fishMesh?.object.parent) {
            session.jumpT += dt;
            const u = Math.min(1, session.jumpT / 0.95);
            const o = fishMesh.object;
            o.position.copy(session.jumpFrom).addScaledVector(v.perp, (u - 0.5) * 1.4);
            o.position.y = session.jumpFrom.y + Math.sin(u * Math.PI) * (1.3 + session.fishLen * 0.8);
            o.rotation.set(-Math.cos(u * Math.PI) * 1.1, ang + Math.PI / 2, Math.sin(t * 20) * 0.3);
            fishMesh.animate?.(dt, 2, 0.6);
            if (u >= 1) session.jumpFrom = null;
          }
          // player animation with a little hysteresis
          const want = running || tn > 0.65 ? 'reel_struggle' : 'reel';
          if (want !== animNow && animT > 0.35) anim(want, { loop: true });
          const hint = running ? 'sys.hint.let_go' : reel.phase === 'warn' ? 'sys.hint.careful' : holding ? 'sys.hint.reeling' : 'sys.hint.hold_reel';
          env.meter('reel', {
            tension: Math.min(1.25, tn), progress: reel.progress, danger: reel.danger > 0.5, dangerLevel: reel.danger, pulling: running,
            holding, phase: reel.phase, behavior: session.sp?.behavior || 'calm', hint, hintKey: hint, fishId: session.junk ? null : null,
          });
          if (ev.includes('snap')) beginEscape('snap');
          else if (ev.includes('landed')) beginLanded();
          break;
        }
        case 'landed': {
          const o = fishMesh?.object;
          if (o && !session.held) {
            env.rodTip(v.tip);
            env.playerPos(v.tmp);
            const u = Math.min(1, stateT / 0.6);
            const target = v.tmp.clone(); target.y += 1.3;
            o.position.lerpVectors(session.liftFrom, target, u);
            o.position.y += Math.sin(u * Math.PI) * 1.6;
            o.rotation.set(Math.sin(t * 18) * 0.4, t * 3, 0);
            fishMesh.animate?.(dt, 3, 0.7);
            v.bob.copy(o.position);
            tackle.setLine(v.tip, v.bob, 0, 0, t);
            tackle.bobber.position.copy(o.position).y += 0.3;
            if (u >= 1) {
              session.held = true;
              tackle.hideLine(); tackle.bobber.visible = false;
              const p = env.player();
              if (p.holdFish) { o.parent?.remove(o); o.rotation.set(0, 0, 0); p.holdFish(o); }
            }
          } else if (fishMesh) {
            fishMesh.animate?.(dt, 1.5, 0.45);
          }
          if (session.held && !session.cardShown && stateT > 1.0) { session.cardShown = true; openCard(); if (!session) break; }
          // release: the fish flies back into the water
          if (session.tossFrom && fishMesh) {
            session.resolveT += dt;
            const u = Math.min(1, session.resolveT / 0.55);
            fishMesh.object.position.lerpVectors(session.tossFrom, session.edge, u);
            fishMesh.object.position.y += Math.sin(u * Math.PI) * 1.2;
            fishMesh.object.rotation.x += dt * 9;
            if (u >= 1) { fx.splash(session.edge, 0.9); endSession(); }
          } else if (session.tossBack && !fishMesh) endSession();
          break;
        }
        case 'escape': {
          if (session.loose) {
            // the bobber floats away and sinks
            const p = tackle.bobber.position;
            p.x += Math.sin(session.angle) * dt * 0.6; p.z += Math.cos(session.angle) * dt * 0.6;
            p.y -= dt * 0.12;
            if (stateT > 1.4) tackle.bobber.visible = false;
          } else {
            const u = Math.min(1, stateT / 0.5);
            env.rodTip(v.tip);
            tackle.bobber.position.lerp(v.tip, u * 0.25);
            lineFromTip(0.3 * (1 - u));
          }
          if (stateT > 1.7) endSession();
          break;
        }
        case 'cancel': {
          const u = Math.min(1, stateT / 0.5);
          env.rodTip(v.tip);
          tackle.bobber.position.lerpVectors(session.retractFrom, v.tip, u);
          tackle.bobber.position.y += Math.sin(u * Math.PI) * 0.8;
          tackle.bobber.position.y -= u * 0.6;
          lineFromTip(0.1);
          if (u >= 1) endSession();
          break;
        }
      }
    },
  };

  // if the catch card closes without a choice, keep the fish (or release it when the basket is full)
  ctx.bus.on('ui:sheet', e => {
    if (e?.name === 'catch' && e.open === false && pendingCatch && !pendingCatch.resolved && state === 'landed') {
      fishing.resolveCatch(pendingCatch.canKeep === false ? 'release' : 'keep');
    }
  });
  ctx.bus.on('ui:catch', e => { if (e?.choice && pendingCatch && !pendingCatch.resolved) fishing.resolveCatch(e.choice); });
  ctx.bus.on('save:reset', () => fishing.cancel());
  return fishing;
}
