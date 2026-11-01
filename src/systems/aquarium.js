// Aquarium: donate one specimen of each species (taken from the basket). Milestones reward the player through Marta.
//   save.state.aquarium = {speciesId: true}    save.state.stats.aqMilestones = [counts already rewarded]
// Emits 'aquarium:donate' {speciesId, count} and 'aquarium:milestone' {count}.

export function createAquarium(ctx, env) {
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};
  const A = () => (S().aquarium ||= {});

  function checkMilestones() {
    const st = (S().stats ||= {});
    const got = new Set(st.aqMilestones || []);
    const n = aquarium.count;
    for (const m of D().aquariumMilestones || []) {
      const need = m.count === 'all' ? aquarium.total : m.count;
      if (n >= need && !got.has(m.count)) {
        got.add(m.count);
        st.aqMilestones = [...got];
        const text = sys().quests?.grant?.(m.reward, { silent: true }) || '';
        sys().quests?.say?.('marta', [m.textKey]);
        env.banner('sys.aquarium.milestone', 'sys.aquarium.milestone_sub', { n: need });
        if (text) env.toast('sys.reward.got', { what: text });
        ctx.bus.emit('aquarium:milestone', { count: m.count });
      }
    }
    ctx.save.commit();
  }

  const aquarium = {
    /** Map of donated species. */
    get donated() { return A(); },
    get count() { return Object.keys(A()).filter(k => A()[k]).length; },
    get total() { return (D().fish || []).length; },
    has(id) { return !!A()[id]; },
    canDonate(id) {
      const sp = D().get?.(id);
      return !!sp && sp.kind === 'fish' && !A()[id] && (S().basket || []).some(e => e.id === id);
    },
    /** Species in the basket that are not in the aquarium yet. */
    donatable() { return [...new Set((S().basket || []).map(e => e.id))].filter(id => aquarium.canDonate(id)); },
    donate(speciesId) {
      if (!aquarium.canDonate(speciesId)) return { ok: false, reason: A()[speciesId] ? 'have' : 'missing' };
      sys().inventory?.takeFromBasket?.(e => e.id === speciesId, 1, 'biggest');
      A()[speciesId] = true;
      ctx.save.commit();
      env.sfx('quest_done', { vol: 0.5, pitch: 1.2 });
      env.toastFB('sys.aquarium.donated', { name: env.itemName(speciesId) });
      ctx.bus.emit('aquarium:donate', { speciesId, count: aquarium.count });
      checkMilestones();
      return { ok: true };
    },
    /** Donate every new species in the basket (context action at the aquarium). */
    donateAll() {
      const ids = aquarium.donatable();
      for (const id of ids) aquarium.donate(id);
      return ids;
    },
  };
  return aquarium;
}
