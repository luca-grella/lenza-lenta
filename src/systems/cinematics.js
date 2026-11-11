// [r2-cinematics] Cozy "director": short camera shots (1.5-4.5 s) on the nice moments, played with
// ctx.cameraRig.playShot() OVER the normal camera (which keeps running underneath), so the view always comes back.
// Rules: never while a panel/dialogue is open, a tap anywhere skips (the tap still reaches the game), a bite ends
// a shot at once, Settings › cinematics off (save.state.settings.cinematics === false) or ?nocine turns it all off,
// common moments are rate-limited. API on ctx.cinematics (also ctx.systems.cinematics).
const it = {
  'cine.skip': 'Tocca per saltare',
  'cine.setting': 'Inquadrature cinematografiche',
  'cine.setting.desc': 'Brevi primi piani su catture, cucina, gatto e tramonti',
};
const en = {
  'cine.skip': 'Tap to skip',
  'cine.setting': 'Cinematic shots',
  'cine.setting.desc': 'Short close-ups of catches, cooking, the cat and sunsets',
};

const RARE = { rare: 2, epic: 3, legendary: 4 };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Minimum gap (s of game loop time) between two shots of the same "common" kind. */
// [11 nov] Luca: "shot changes feel random; use them always and only for given actions". So no more cooldowns (the
// same action used to get a close-up only if the last one was 2-4 minutes ago) and no shots that are not an action
// (waiting for a bite, entering a zone, sitting at dusk: still playable by hand via trigger()). Shots queue instead.
export const CINE_GAPS = { any: 0 };

export function init(ctx) {
  const THREE = ctx.THREE;
  ctx.i18n?.addStrings?.(it, en);
  const rig = () => ctx.cameraRig;
  const S = () => { const s = ctx.save.state; s.cinema ||= {}; s.cinema.zones ||= {}; s.cinema.firsts ||= {}; return s.cinema; };
  const last = {};          // kind → loop time of the last shot
  let now = 0;              // loop time (s)
  let lastAny = -1e9;
  let duskDay = -1;
  const log = [];           // [{t, kind, id, result}] last 20 (tests)

  const player = () => ctx.player?.object || rig()?.followed || null;
  const facing = () => Number.isFinite(ctx.player?.facing) ? ctx.player.facing : 0;
  const viewYaw = () => rig()?.effectiveYaw ?? 0;
  const uiOpen = () => !api.debugIgnoreUI && !!(ctx.ui?.isOpen?.() || ctx.ui?.busy);
  const enabled = () => ctx.save?.state?.settings?.cinematics !== false && !ctx.params?.has?.('nocine');
  /** A yaw between the current view and the player's front 3/4, never more than `max` rad away from the view. */
  const frontish = (side = 0.9, max = 1.2) => {
    const v = viewYaw(), f = facing();
    const a = wrap(f + side - v), b = wrap(f - side - v);
    return v + clamp(Math.abs(a) < Math.abs(b) ? a : b, -max, max);
  };
  // the catch card covers most of a portrait screen: the close-up waits behind it, so closing the card shows the
  // fisherman close up with the fish, and the mat shot (takeOver) carries on from there
  const cardOpen = () => ctx.ui?.currentSheet === 'catch';
  const catPos = () => ctx.systems?.cat?.position?.() || ctx.creatures?.cat?.object?.position || null;

  // ------------------------------------------------------------------ overlay: thin letterbox + first-time hint
  const ov = document.createElement('div');
  ov.className = 'cine-ov';
  ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:15;';
  const barCss = 'position:absolute;left:0;right:0;height:min(6vh,40px);background:#1c140c;opacity:.82;transition:transform .5s ease;';
  const top = document.createElement('div'); top.style.cssText = barCss + 'top:0;transform:translateY(-100%);';
  const bot = document.createElement('div'); bot.style.cssText = barCss + 'bottom:0;transform:translateY(100%);';
  const hint = document.createElement('div');
  // the hint sits in the bottom bar, left (the bait and action buttons live bottom-centre / bottom-right)
  hint.style.cssText = 'position:absolute;left:calc(16px + env(safe-area-inset-left,0px));bottom:calc((min(6vh,40px) - 13px) / 2);' +
    'font:700 13px/1 system-ui,-apple-system,sans-serif;color:#fff8ea;text-shadow:0 1px 3px rgba(40,25,10,.8);opacity:0;transition:opacity .4s;white-space:nowrap;';
  ov.append(top, bot, hint);
  document.body.append(ov);
  let barsOn = false;
  const bars = v => {
    if (v === barsOn) return;
    barsOn = v;
    top.style.transform = v ? 'translateY(0)' : 'translateY(-100%)';
    bot.style.transform = v ? 'translateY(0)' : 'translateY(100%)';
    if (!v) hint.style.opacity = '0';
  };

  // ------------------------------------------------------------------ playing
  /**
   * Play a shot of `kind` (rate-limited unless opts.force). spec = cameraRig.playShot spec.
   * @returns {Promise<string>|null} null when not played (off, panel open, too soon, no camera).
   */
  function play(kind, spec, opts = {}) {
    const r = rig();
    if (!r?.playShot || !enabled() || !player()) return null;
    if (uiOpen() && !opts.evenIfOpen) return null;
    if (!opts.force) {
      if (now - lastAny < (opts.gapAny ?? CINE_GAPS.any)) return null;
      const g = opts.gap ?? CINE_GAPS[kind] ?? 0;
      if (g && now - (last[kind] ?? -1e9) < g) return null;
    }
    if (r.shotActive && opts.queue === false && !spec.takeOver) return null;
    last[kind] = now; lastAny = now;
    const c = S(); c.count = (c.count | 0) + 1;
    const showHint = c.count <= 3;
    const entry = { t: +now.toFixed(2), kind, id: spec.id || kind, result: null, yaw: +(spec.yaw ?? NaN).toFixed?.(2), view: +viewYaw().toFixed(2), facing: +facing().toFixed(2) };
    log.push(entry); if (log.length > 20) log.shift();
    if (showHint) setTimeout(() => { if (barsOn) { hint.textContent = ctx.i18n.t('cine.skip'); hint.style.opacity = '1'; } }, 700);
    return r.playShot({ id: kind, ...spec }).then(res => { entry.result = res; return res; });
  }

  // ------------------------------------------------------------------ shots
  const shots = {
    /** Catch: gentle push-in on the fisherman lifting the fish; slow orbit for rare+/new/record. */
    catch(e) {
      if (e?.junk) return null;
      const big = RARE[e?.rarity] || 0;
      const special = big >= 2 || e?.isNew || e?.isRecord;
      const y0 = frontish(0.8, 1.15);
      if (special) {
        const dir = Math.sign(wrap(y0 - viewYaw())) || 1;
        const legend = big >= 4;
        return play('catch', {
          id: legend ? 'catch_legendary' : 'catch_special', target: player(), yaw: y0, yawTo: y0 + dir * (legend ? 1.0 : 0.65),
          dist: 6.4, distTo: legend ? 4.4 : 4.9, pitch: 24, pitchTo: 18, height: 1.15, fov: 34,
          duration: legend ? 4.5 : 3.8, blendIn: 1.3, blendOut: 1.0, ease: 'inOut', holdWhile: cardOpen,
        }, { force: true });
      }
      return play('catch', {
        id: 'catch', target: player(), yaw: y0, dist: 8.2, distTo: 6.4, pitch: 30, pitchTo: 25, height: 1.1,
        duration: 2.8, blendIn: 1.1, blendOut: 0.9, ease: 'out', holdWhile: cardOpen,
      });
    },
    /** Waiting for a bite: a slow side shot of fisherman + float (by hand only since 11 nov). */
    wait() {
      const focus = rig()?.focus;
      const p = player();
      if (!focus || !p) return null;
      const fp = new THREE.Vector3(), pp = new THREE.Vector3();
      const look = () => { p.getWorldPosition(pp); (focus.isObject3D ? focus.getWorldPosition(fp) : fp.copy(focus)); return pp.lerp(fp, 0.38); };
      const y0 = viewYaw() + (Math.random() < 0.5 ? -0.7 : 0.7);
      return play('wait', {
        id: 'wait', target: look, yaw: y0, yawSpeed: 0.05 * Math.sign(y0 - viewYaw()), dist: 10, distTo: 8.6,
        pitch: 26, height: 0.5, duration: 4.2, blendIn: 1.4, blendOut: 1.2, ease: 'inOut',
      });
    },
    /** Laying the catch on the mat beside the fisherman. */
    mat(e) {
      const tgt = matPoint(e);
      const first = !S().firsts.mat;
      S().firsts.mat = true;
      // unrolling the mat (first catch of an outing) is followed by laying the fish: one longer shot covers both
      return play('mat', {
        id: e?.unroll ? 'mat_unroll' : 'mat', target: tgt, yaw: frontish(1.0, 0.6), dist: 6.2, distTo: 5.2, pitch: 42, pitchTo: 36, height: 0.2,
        duration: e?.unroll ? 4.6 : 2.8, blendIn: 1.0, blendOut: 0.9, ease: 'out', takeOver: true,
      }, { force: first || e?.unroll, gapAny: 0 });
    },
    /** Cleaning a fish: close on the hands. */
    clean(e) {
      const first = !S().firsts.clean;
      S().firsts.clean = true;
      const p = player();
      const pp = new THREE.Vector3();
      const mp = new THREE.Vector3();
      const hands = () => {
        p.getWorldPosition(pp);
        const m = ctx.player?.mat;
        if (m?.active && m.position) { mp.copy(m.position); mp.y = pp.y; return pp.lerp(mp, 0.75); } // the fish lies on the mat
        const f = facing(); pp.x += Math.sin(f) * 0.45; pp.z += Math.cos(f) * 0.45; return pp;
      };
      return play('clean', {
        id: 'clean', target: hands, yaw: frontish(1.1, 0.9), dist: 5.4, distTo: 4.7, pitch: 40, pitchTo: 36, height: 0.3,
        duration: 4.2, blendIn: 1.0, blendOut: 1.0, ease: 'out', takeOver: true,
      }, { force: first });
    },
    /** Player and cat together (show / feed / pet / befriend). */
    cat(kind, e) {
      const cp0 = catPos(), p = player();
      if (!cp0 || !p) return null;
      const pp = new THREE.Vector3(), mid = new THREE.Vector3();
      const midF = () => { p.getWorldPosition(pp); const c = catPos() || cp0; return mid.set((pp.x + c.x) / 2, Math.min(pp.y, c.y ?? pp.y), (pp.z + c.z) / 2); };
      // two-shot: camera perpendicular to the player-cat line, on the side nearest the current view
      p.getWorldPosition(pp);
      const a = Math.atan2(cp0.x - pp.x, cp0.z - pp.z);
      const v = viewYaw();
      const c1 = wrap(a + Math.PI / 2 - v), c2 = wrap(a - Math.PI / 2 - v);
      const y0 = v + clamp(Math.abs(c1) < Math.abs(c2) ? c1 : c2, -1.1, 1.1);
      const bef = kind === 'befriend';
      const first = !S().firsts['cat_' + kind];
      S().firsts['cat_' + kind] = true;
      return play('cat', {
        id: 'cat_' + kind, target: midF, yaw: y0, yawSpeed: bef ? 0.1 : 0.05, dist: bef ? 6 : 5.4, distTo: bef ? 4.6 : 4.5,
        pitch: 27, height: 0.45, duration: bef ? 3.8 : 2.8, blendIn: 1.0, blendOut: 0.9, ease: 'inOut', takeOver: kind === 'show',
      }, { force: bef || kind === 'show' || first });
    },
    /** Recipe done: warm close shot at the station. */
    cook(e) {
      const c = S(); c.recipes ||= {};
      const first = !c.recipes[e?.recipeId];
      if (e?.recipeId) c.recipes[e.recipeId] = true;
      return play('cook', {
        id: 'cook', target: player(), yaw: frontish(0.9, 0.9), yawSpeed: 0.08, dist: 6.2, distTo: 5.2, pitch: 30, height: 0.8,
        duration: 2.8, blendIn: 1.0, blendOut: 0.9, ease: 'out',
      }, { force: first });
    },
    /** First visit of a zone: a slow wide establishing pan (by hand only since 11 nov). */
    zone(e) {
      const z = e?.zone;
      if (!z || !e?.prev) return null; // the first zone of a session is where you load in, not a discovery
      const c = S();
      if (c.zones[z]) return null;
      const v = viewYaw();
      const r = play('zone', {
        id: 'zone_' + z, target: player(), yaw: v - 0.32, yawTo: v + 0.32, dist: 31, distTo: 34, pitch: 38, pitchTo: 31,
        height: 1.5, duration: 4.2, blendIn: 1.4, blendOut: 1.3, ease: 'linear',
      }, { force: true, gapAny: 6 });
      if (r) c.zones[z] = true;
      return r;
    },
    /** Seated on a dock edge at dusk: behind the shoulders, looking out at the sea and the sky (by hand only since 11 nov). */
    dusk() {
      if (ctx.time?.day === duskDay) return null;
      const p = player();
      if (!p) return null;
      const pp = new THREE.Vector3(), ahead = new THREE.Vector3();
      const lookF = () => { p.getWorldPosition(pp); const f = facing(); return ahead.set(pp.x + Math.sin(f) * 3.2, pp.y + 1.15, pp.z + Math.cos(f) * 3.2); };
      const f = facing();
      const behind = f + Math.PI;
      const side = ctx.viewport?.portrait ? 0.4 : 1; // narrow portrait view: stay closer behind the shoulders
      const r = play('dusk', {
        id: 'dusk', target: p, lookAt: lookF, lookHeight: 0, yaw: behind + 0.7 * side, yawTo: behind + 0.4 * side, dist: 7.2, distTo: 6,
        pitch: 23, pitchTo: 18, height: 0.6, fov: 40, portraitScale: 1.2, duration: 4.5, blendIn: 1.6, blendOut: 1.4, ease: 'inOut',
      }, { force: true });
      if (r) duskDay = ctx.time?.day ?? 0;
      return r;
    },
  };

  /** Where the mat is: payload pos, Systems/World API, else just beside the player on the right. */
  function matPoint(e) {
    const v = new THREE.Vector3();
    return () => {
      const m = ctx.player?.mat;
      const p = e?.pos || (m?.active && m.position) || (Number.isFinite(e?.x) ? e : null);
      if (p?.isObject3D) return p.getWorldPosition(v);
      if (p && Number.isFinite(p.x)) {
        v.set(p.x, p.y ?? 0, p.z);
        const g = ctx.world?.groundY?.(v.x, v.z); // the mat prop keeps y = 0: put the look point on the planks/sand
        if (!(v.y > 0) && Number.isFinite(g)) v.y = g;
        return v;
      }
      const o = player(); if (!o) return v;
      o.getWorldPosition(v); const f = facing() - Math.PI / 2;
      v.x += Math.sin(f) * 0.8; v.z += Math.cos(f) * 0.8;
      return v;
    };
  }

  // ------------------------------------------------------------------ events
  const bus = ctx.bus;
  bus.on('fishing:catch', e => shots.catch(e));
  bus.on('fishing:bite', () => { if (rig()?.shotActive) rig().cancelShots('bite'); });
  bus.on('fishing:strike', () => { if (rig()?.shotActive) rig().cancelShots('bite'); });
  // The catch chores (player.chore: unroll_mat, lay_on_mat, clean_fish, show_to_cat) are framed when their clip
  // STARTS (watched in the loop below); the bus events come at the end of a chore, so they are only a fallback
  // for builds without the player's chores.
  const noChores = () => typeof ctx.player?.chore !== 'function';
  bus.on('mat:place', e => { if (noChores()) setTimeout(() => shots.mat(e), 0); });
  bus.on('mat:lay', e => { if (noChores()) shots.mat(e); });
  bus.on('fish:clean', e => { if (noChores()) shots.clean(e); });
  bus.on('cat:show', e => { if (noChores()) shots.cat('show', e); });
  bus.on('cat:feed', e => shots.cat('feed', e));
  bus.on('cat:pet', e => shots.cat('pet', e));
  bus.on('cat:befriend', e => shots.cat('befriend', e));
  // [r2-playtest] recipes are cooked from the cook panel (or the Trattoria shop), so cook:done always fires with a sheet
  // open and the shot was dropped: keep it and play it when the panel closes (within 90 s, the player still nearby)
  let pendingCook = null;
  bus.on('cook:start', e => {   // [11 nov] the close-up frames the stirring, not the moment after
    if (!uiOpen()) { pendingCook = null; shots.cook(e); return; }
    const p = player()?.position;
    pendingCook = { e, t: now, x: p?.x ?? 0, z: p?.z ?? 0 };
  });
  bus.on('ui:sheet', e => {
    if (e?.open || !pendingCook) return;
    const pc = pendingCook, p = player()?.position;
    setTimeout(() => {   // after the sheet's own close bookkeeping (ui.isOpen false)
      if (pendingCook !== pc || uiOpen()) return;
      pendingCook = null;
      if (now - pc.t > 90 || (p && Math.hypot(p.x - pc.x, p.z - pc.z) > 4)) return;
      shots.cook(pc.e);
    }, 350);
  });
  bus.on('ui:sheet', e => { if (e?.open && rig()?.shotInfo?.id === 'wait') rig().cancelShots('sheet'); });
  bus.on('camera:shot', e => { bars(e?.phase === 'start'); if (e?.phase === 'end') ctx.save?.commit?.(); });

  // tap anywhere skips (capture phase, never stops the event: the same tap still works for the game)
  // (a tap on a panel — e.g. Keep on the catch card — is for the panel, not a skip)
  const onTap = () => { if (rig()?.shotActive && !uiOpen()) rig().skipShot(); };
  window.addEventListener('pointerdown', onTap, true);
  window.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') onTap(); }, true);

  let choreWas = null;
  ctx.loop.add(function cinematics(dt) {
    now += dt;
    const r = rig();
    const ch = ctx.player?.choreName || null;
    if (ch !== choreWas) {
      choreWas = ch;
      if (ch === 'unroll_mat') shots.mat({ unroll: true });
      else if (ch === 'lay_on_mat') shots.mat({});
      else if (ch === 'clean_fish') shots.clean({});
      else if (ch === 'show_to_cat') shots.cat('show', {});
    }
    // a panel opening over a shot: let the shot finish under it, but never start the next one
    if (r?.shotActive && !enabled()) r.cancelShots('off');
  }, (ctx.ORDER?.systems ?? 10) + 1);

  var api = {
    /** Is the director on (Settings + ?nocine)? */
    get enabled() { return enabled(); },
    /** A shot is on screen. */
    get playing() { return !!rig()?.shotActive; },
    /** Play a named moment by hand: 'catch'|'wait'|'mat'|'clean'|'cook'|'zone'|'dusk' (payload like the bus event), or cat via trigger('cat', {kind}). */
    trigger(kind, payload = {}) { return kind === 'cat' ? shots.cat(payload.kind || 'show', payload) : shots[kind]?.(payload) ?? null; },
    /** Play any custom shot (rig.playShot spec) through the same rules (off / panel open / rate limits). */
    play,
    skip() { return rig()?.skipShot?.() || false; },
    cancel() { rig()?.cancelShots?.('cancelled'); },
    /** Forget rate limits (tests). */
    resetLimits() { for (const k in last) delete last[k]; lastAny = -1e9; duskDay = -1; },
    log,
    gaps: CINE_GAPS,
    /** Tests only (contact sheets): play even while a panel/dialogue is open. */
    debugIgnoreUI: false,
  };
  ctx.cinematics = api;
  return api;
}

export default { init };
