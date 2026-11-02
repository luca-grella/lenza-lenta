// Cooking & eating. Recipes turn basket fish + items into a dish (kept in items until eaten); eating gives soft buffs.
//   save.state.cooking = { known: {recipeId: true}, cooked: n }
// station: 'campfire' (home) or 'trattoria'. Recipes with station 'trattoria' need Pina's kitchen.
// Emits 'cook:done' {recipeId, dishId, station}, 'eat' {dishId, recipeId}.

export function createCooking(ctx, env) {
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};
  const C = () => { const c = (S().cooking ||= {}); c.known ||= {}; return c; };
  const recipe = id => (D().recipes || []).find(r => r.id === id || r.dish === id) || null;
  const isKnown = r => !!r && (r.known || !!C().known[r.id]);

  /**
   * Allocate the needs of a recipe without double-using a basket entry or an item.
   * Returns {ok, take: {basket: [indexes], items: {id: n}}, missing: [{need, have}]}.
   */
  function allocate(r) {
    const basket = S().basket || [];
    const items = { ...(S().items || {}) };
    const used = new Set();
    const take = { basket: [], items: {} };
    const missing = [];
    const helpers = D().helpers;
    // most specific needs first so 'any fish' doesn't eat the sardine a later need wants
    const order = r.needs.map((n, i) => ({ n, i, w: n.fillet ? -1 : n.id ? 0 : n.ids ? 1 : n.habitat ? 2 : 3 })).sort((a, b) => a.w - b.w);
    for (const { n } of order) {
      let need = n.n || 1, have = 0;
      const isFishNeed = n.fillet || n.fish === 'any' || n.habitat || (n.id && D().get?.(n.id)?.kind === 'fish') || (n.ids && n.ids.some(id => D().get?.(id)?.kind === 'fish'));
      if (isFishNeed) {
        // [r2-gameplay] fillets (cleaned on the mat): {fillet:true} needs only take fillets, {whole:true} never does;
        // otherwise whole fish go first, unless the recipe prefersFillet (then a fillet gives two portions, see cook())
        const anyFish = n.fish === 'any' || (n.fillet && !n.id && !n.ids && !n.habitat);
        const cand = basket.map((e, i) => i).filter(i => !used.has(i) && D().get?.(basket[i].id)?.kind === 'fish'
            && (anyFish || helpers?.needMatches?.(n, basket[i].id)) && (!n.fillet || basket[i].fillet) && (!n.whole || !basket[i].fillet))
          .sort((a, b) => (r.prefersFillet ? (basket[b].fillet ? 1 : 0) - (basket[a].fillet ? 1 : 0) : (basket[a].fillet ? 1 : 0) - (basket[b].fillet ? 1 : 0))
            || basket[a].size - basket[b].size);
        for (const i of cand) { if (have >= need) break; used.add(i); take.basket.push(i); have++; }
      }
      if (have < need) {
        const ids = n.id ? [n.id] : n.ids || [];
        for (const id of ids) {
          const k = Math.min(items[id] || 0, need - have);
          if (k > 0) { items[id] -= k; take.items[id] = (take.items[id] || 0) + k; have += k; }
        }
      }
      if (have < need) missing.push({ need: n, have, n: need });
    }
    return { ok: !missing.length, take, missing };
  }

  const cooking = {
    /** Known recipe ids. */
    get recipes() { return (D().recipes || []).filter(isKnown).map(r => r.id); },
    get known() { return C().known; },
    isKnown: id => isKnown(recipe(id)),
    learn(id, { silent = false } = {}) {
      const r = recipe(id);
      if (!r || isKnown(r)) return false;
      C().known[r.id] = true;
      ctx.save.commit();
      if (!silent) env.toast('sys.cook.learned', { name: env.t(r.nameKey) });
      ctx.bus.emit('recipe:learn', { recipeId: r.id });
      return true;
    },
    /** {ok, reason?, missing[]} for a recipe at a station. */
    canCook(id, station = 'campfire') {
      const r = recipe(id);
      if (!r) return { ok: false, reason: 'unknown', missing: [] };
      if (!isKnown(r)) return { ok: false, reason: 'unknown', missing: [] };
      if (r.station === 'trattoria' && station !== 'trattoria') return { ok: false, reason: 'station', missing: [] };
      const a = allocate(r);
      return { ok: a.ok, reason: a.ok ? null : 'missing', missing: a.missing };
    },
    /** For the cook sheet: every recipe with its state. */
    list(station = 'campfire') {
      return (D().recipes || []).map(r => ({ id: r.id, dish: r.dish, nameKey: r.nameKey, descKey: r.descKey, known: isKnown(r), station: r.station, buffs: r.buffs, effect: r.effect || null, ...cooking.canCook(r.id, station) }));
    },
    cook(id, station = 'campfire') {
      const r = recipe(id);
      const chk = cooking.canCook(id, station);
      if (!chk.ok) { env.toast(chk.reason === 'station' ? 'sys.cook.need_trattoria' : 'sys.cook.missing'); return chk; }
      const a = allocate(r);
      const inv = sys().inventory;
      const b = S().basket || [];
      const taken = a.take.basket.sort((x, y) => y - x).map(i => b[i]);
      for (const i of a.take.basket) b.splice(i, 1);
      for (const [iid, n] of Object.entries(a.take.items)) inv.remove(iid, n);
      if (taken.length) ctx.bus.emit('inventory:change', { id: null, delta: -taken.length, where: 'basket' });
      const withFillet = !!r.prefersFillet && taken.some(e => e?.fillet);
      inv.add(r.dish, withFillet ? 2 : 1);
      C().cooked = (C().cooked | 0) + 1;
      ctx.save.commit();
      env.play('crouch_pick', { loop: false });
      env.sfx('splash_small', { vol: 0.25, pitch: 2.2 });
      env.sfx('pickup', { delay: 0.4 });
      env.toastFB('sys.cook.done', { name: env.t(r.nameKey) });
      if (withFillet) env.toast('sys.cook.fillet_bonus', { name: env.t(r.nameKey) });
      ctx.bus.emit('cook:done', { recipeId: r.id, dishId: r.dish, station, portions: withFillet ? 2 : 1, fillet: taken.some(e => e?.fillet) });
      return { ok: true, dishId: r.dish, portions: withFillet ? 2 : 1 };
    },
    /** Eat a dish from the inventory → buffs (and cat friendship for the kitty treat). */
    eat(dishId) {
      const r = recipe(dishId);
      if (!r || !(S().items?.[r.dish] > 0)) return { ok: false, reason: 'missing' };
      if (r.effect?.cat) {
        // the kitty treat is for Biscotto, not for you: the player walks over and hands it (systems/cat.js); the dish
        // leaves the Backpack only once the cat is reached
        const why = sys().cat?.treatBlocked ? sys().cat.treatBlocked() : 'none';
        if (why) return { ok: false, reason: why === 'far' ? 'cat_far' : 'cat' };
        sys().cat.giveTreat(r.effect.cat, () => sys().inventory.remove(r.dish, 1));
        return { ok: true, cat: true };
      }
      sys().inventory.remove(r.dish, 1);
      sys().buffs?.add?.(r.buffs, r.dish);
      env.play('eat', { loop: false });
      env.sfx('eat');
      const names = (r.buffs || []).map(b => env.t(`buff.${b.stat}.name`)).join(', ');
      env.toastFB('sys.cook.ate', { name: env.t(r.nameKey), buffs: names });
      ctx.bus.emit('eat', { dishId: r.dish, recipeId: r.id });
      return { ok: true };
    },
  };
  return cooking;
}
