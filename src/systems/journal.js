// Journal: what has been caught. save.state.journal = { [speciesId]: { n, best, smallest, firstDay, lastDay } }.
// Junk is recorded too (n only) so the Journal can show found treasures.

export function createJournal(ctx, env) {
  const S = env.S;
  const J = () => (S().journal ||= {});
  const data = () => ctx.data || {};

  const journal = {
    /** Record a catch → {isNew, isRecord}. isRecord = bigger than every previous one of that species. */
    record({ speciesId, size = 0 }) {
      const j = J();
      const e = j[speciesId];
      const isNew = !e || !e.n;
      let isRecord = false;
      if (isNew) j[speciesId] = { n: 1, best: size, smallest: size, firstDay: ctx.time.day, lastDay: ctx.time.day };
      else {
        e.n++;
        if (size > (e.best || 0)) { isRecord = true; e.best = size; }
        if (!e.smallest || (size && size < e.smallest)) e.smallest = size;
        e.lastDay = ctx.time.day;
      }
      ctx.save.commit();
      return { isNew, isRecord };
    },
    get entries() { return J(); },
    get(id) { return J()[id] || null; },
    has(id) { return !!J()[id]?.n; },
    /** Ids of every species/junk ever caught. */
    caughtIds() { return Object.keys(J()).filter(k => J()[k]?.n); },
    /** Number of distinct real fish species caught. */
    get count() { return (data().fish || []).filter(f => J()[f.id]?.n).length; },
    get total() { return (data().fish || []).length; },
    /** Total catches (all species, junk included). */
    get catches() { return Object.values(J()).reduce((s, e) => s + (e.n || 0), 0); },
    /** Records grouped for the Journal sheet: [{id, rarity, habitats, caught, n, best}]. */
    list() {
      return (data().fish || []).map(f => ({ id: f.id, rarity: f.rarity, habitats: f.habitats, caught: !!J()[f.id]?.n, n: J()[f.id]?.n || 0, best: J()[f.id]?.best || 0, nameKey: f.nameKey, descKey: f.descKey }));
    },
  };
  return journal;
}
