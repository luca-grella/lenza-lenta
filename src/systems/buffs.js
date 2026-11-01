// Buffs: soft timed effects from food. save.state.buffs = [{stat, mult, until (absolute game hours), source}].
// mult(stat) → the strongest active multiplier for that stat (same stat from two dishes does not stack).
// Emits 'buff:start' {stat, mult, hours, source} and 'buff:end' {stat, source}.

export function createBuffs(ctx, env) {
  const S = env.S;
  const list = () => (Array.isArray(S().buffs) ? S().buffs : (S().buffs = []));
  let checkT = 0;

  const buffs = {
    /** Active buffs → [{stat, mult, source, remaining (game hours), nameKey, descKey}]. */
    get active() {
      const now = env.absHours();
      return list().filter(b => b.until > now).map(b => ({
        stat: b.stat, mult: b.mult, source: b.source, remaining: b.until - now,
        nameKey: `buff.${b.stat}.name`, descKey: `buff.${b.stat}.desc`,
      }));
    },
    /** Strongest multiplier for a stat (1 when none). */
    mult(stat) {
      const now = env.absHours();
      let m = 1;
      for (const b of list()) if (b.stat === stat && b.until > now) m = Math.max(m, b.mult);
      return m;
    },
    has(stat) { return buffs.mult(stat) > 1; },
    /** Start buffs [{stat, mult, hours}] from a source (dish id). Refreshes the same stat from the same source. */
    add(defs, source = '') {
      const now = env.absHours();
      for (const d of defs || []) {
        if (!d?.stat || !(d.mult > 0)) continue;
        const arr = list();
        const i = arr.findIndex(b => b.stat === d.stat && b.source === source);
        const b = { stat: d.stat, mult: d.mult, until: now + (d.hours || 4), source };
        if (i >= 0) arr[i] = b; else arr.push(b);
        ctx.bus.emit('buff:start', { stat: d.stat, mult: d.mult, hours: d.hours || 4, source });
      }
      ctx.save.commit();
    },
    clear() { S().buffs = []; ctx.save.commit(); },
    update(dt) {
      checkT -= dt;
      if (checkT > 0) return;
      checkT = 0.5;
      const now = env.absHours();
      const arr = list();
      const ended = arr.filter(b => b.until <= now);
      if (!ended.length) return;
      S().buffs = arr.filter(b => b.until > now);
      for (const b of ended) ctx.bus.emit('buff:end', { stat: b.stat, source: b.source });
      ctx.save.commit();
    },
  };
  return buffs;
}
