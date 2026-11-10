// Home: tiers (tent → cabin → cottage, bought from Tonio), decor slots, and sleeping.
//   save.state.home = { tier, decor: {slotId: decorId} }
// sleep(): at dusk/night skip to 06:00 (a nap by day skips to 18:00) with a soft fade.
// Emits 'home:upgrade' {tier, id}, 'home:decor' {slot, id}, 'home:sleep' {from, to, day}.

export function createHome(ctx, env) {
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};
  const H = () => { const h = (S().home ||= {}); h.tier ??= 0; h.decor ||= {}; return h; };
  const tierRec = (t = H().tier) => (D().home || []).find(x => x.tier === t) || null;

  // ---- fade overlay (owned by Gameplay: used only for sleeping)
  let fadeEl = null;
  function fadeTo(v, ms, text = '') {
    if (typeof document === 'undefined') return Promise.resolve();
    if (!fadeEl) {
      fadeEl = document.createElement('div');
      fadeEl.style.cssText = 'position:fixed;inset:0;z-index:9000;pointer-events:none;opacity:0;display:flex;align-items:center;justify-content:center;'
        + 'background:radial-gradient(ellipse at 50% 60%, #2b3a62 0%, #141c33 75%);color:#fff4dc;font:600 22px/1.3 system-ui,-apple-system,sans-serif;letter-spacing:.04em;text-shadow:0 2px 8px rgba(0,0,0,.4)';
      document.body.appendChild(fadeEl);
    }
    fadeEl.textContent = text;
    fadeEl.style.transition = `opacity ${ms}ms ease`;
    void fadeEl.offsetWidth;
    fadeEl.style.opacity = String(v);
    return new Promise(r => setTimeout(r, ms));
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let quiet = false; // unplacing returns decor to the inventory without auto-placing it again

  const home = {
    get tier() { return H().tier; },
    get record() { return tierRec(); },
    get decor() { return H().decor; },
    /** Slots available at the current tier. */
    slots() { return tierRec()?.slots || ['porch_1', 'garden_1']; },
    setTier(t) {
      if (t <= H().tier) return false;
      H().tier = t;
      // decor that doesn't fit the new tier's slots goes back to the inventory (never happens when upgrading, kept for safety)
      for (const [slot, id] of Object.entries(H().decor)) if (!home.slots().includes(slot)) { delete H().decor[slot]; sys().inventory?.add?.(id, 1); }
      ctx.save.commit();
      env.sfx('quest_done');
      if (!env.realUI()) env.banner('sys.home.upgraded', tierRec()?.nameKey || '');
      ctx.bus.emit('home:upgrade', { tier: t, id: tierRec()?.id });
      return true;
    },
    /** Place an owned decor item in a slot (default: first free slot of its type). */
    place(decorId, slot = null) {
      const it = D().get?.(decorId);
      if (!it || it.kind !== 'decor') return { ok: false, reason: 'unknown' };
      if (!(S().items?.[decorId] > 0)) return { ok: false, reason: 'missing' };
      if ((it.minTier || 0) > H().tier) return { ok: false, reason: 'tier' };
      const free = home.slots().filter(s => s.startsWith(it.slot + '_') && !H().decor[s]);
      const target = slot || free[0];
      if (!target || !target.startsWith(it.slot + '_') || !home.slots().includes(target)) return { ok: false, reason: 'slot' };
      if (H().decor[target]) { quiet = true; sys().inventory?.add?.(H().decor[target], 1); quiet = false; }
      sys().inventory?.remove?.(decorId, 1);
      H().decor[target] = decorId;
      ctx.save.commit();
      ctx.bus.emit('home:decor', { slot: target, id: decorId });
      return { ok: true, slot: target };
    },
    unplace(slot) {
      const id = H().decor[slot];
      if (!id) return false;
      delete H().decor[slot];
      quiet = true; sys().inventory?.add?.(id, 1); quiet = false;
      ctx.save.commit();
      ctx.bus.emit('home:decor', { slot, id: null });
      return true;
    },
    /** 'sleep' (dusk/night → morning) or 'nap' (day → evening). */
    sleepKind() { const h = ctx.time.hours; return h >= 17 || h < 5 ? 'sleep' : 'nap'; },
    get sleeping() { return env.busy.sleep; },
    /** Go to bed: fade out, skip time, wake up. opts.fast for tests. */
    async sleep(opts = {}) {
      if (env.busy.sleep) return false;
      const fast = !!opts.fast;
      const kind = home.sleepKind();
      const from = ctx.time.hours;
      const to = kind === 'sleep' ? 6 : 18;
      env.busy.sleep = true;
      sys().fishing?.cancel?.();
      env.setControl(false);
      const bed = env.poi('home_bed'), door = env.poi('home_door');
      // [9 nov] fade out first, then lie down: walking/gliding to the bed went through the tent canvas in plain view
      await fadeTo(1, fast ? 1 : 1400, env.t(kind === 'sleep' ? 'sys.home.zzz' : 'sys.home.nap'));
      try { if (bed) { env.player().teleport?.(bed.x, bed.z, bed.facing); env.player().sitAt?.(bed); } } catch { /* optional */ }
      env.setPlayerState('sleep');
      env.play('sleep', { loop: true });
      const day0 = ctx.time.day;
      ctx.time.skipTo(to);
      ctx.audioAuto?.update?.();
      sys().buffs?.update?.(1);
      ctx.save.flush?.();
      ctx.bus.emit('home:sleep', { from, to, day: ctx.time.day, kind });
      await wait(fast ? 1 : 900);
      try { env.player().standUp?.(); } catch { /* optional */ }
      // [9 nov] wake up outside, in front of the door: standing up inside the tent left the player inside its walls,
      // and the first step out went through the canvas
      try { if (door) env.player().teleport?.(door.x, door.z, door.facing); } catch { /* optional */ }
      env.play('wake', { loop: false });
      await fadeTo(0, fast ? 1 : 1600, '');
      env.setPlayerState('idle');
      env.setControl(true);
      env.busy.sleep = false;
      if (kind === 'sleep') env.toast(ctx.time.day > day0 ? 'sys.home.morning' : 'sys.home.morning_same', { n: ctx.time.day });
      else env.toast('sys.home.evening');
      return true;
    },
    update() {},
  };

  // decor bought or received is placed automatically when a slot is free
  ctx.bus.on('inventory:change', e => {
    if (quiet || !e?.id || !(e.delta > 0)) return;
    const it = D().get?.(e.id);
    if (it?.kind === 'decor') setTimeout(() => home.place(e.id), 0);
  });
  return home;
}
