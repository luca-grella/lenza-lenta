// Shops: data for the shop sheets, buying (coins + `needs` items, unlock gates, one-time items) and selling at the Pescheria.
//   open(shopId) → view model for the UI     buy(itemId, shopId?) → {ok, reason}
//   sell('all' | indexes[]) → {count, total}  sellItem(id, n) for foraged ingredients
//   priceOf(entry) → sell price now (daily special + price buff)
// Emits 'shop:buy' {itemId, shopId, price} and 'shop:sell' {count, total, items}.

const ONE_TIME = new Set(['rod', 'reel', 'line', 'basket', 'lantern', 'boat', 'cosmetic', 'home', 'recipe']);

export function createShops(ctx, env) {
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};

  /** Is the shop open now? Pescheria has an honesty box at night (selling still works). */
  function isOpen(shop) {
    const phase = ctx.time.phase;
    return !shop.hours || shop.hours.includes(phase);
  }

  function ownedOrDone(it) {
    if (it.kind === 'recipe') return !!S().cooking?.known?.[it.id];
    if (it.kind === 'home') return (S().home?.tier ?? 0) >= it.tier;
    if (it.kind === 'boat') {
      if (it.id === 'boat_repair') return !!(S().boat?.repaired || S().flags?.boat_repaired);
      return (S().boat?.level ?? 0) >= it.level;
    }
    if (ONE_TIME.has(it.kind)) return !!S().owned?.[it.id];
    return false;
  }

  /** Price + unit count for one purchase. Baits come in packs. */
  function offer(it) {
    const price = it.price || 0;
    const qty = it.kind === 'bait' ? it.pack || 1 : 1;
    return { price, qty };
  }

  function needsOK(it) {
    for (const [id, n] of Object.entries(it.needs || {})) if (!sys().inventory?.has?.(id, n)) return false;
    return true;
  }

  /** Why an item can't be bought right now (null = it can). */
  function blocker(it) {
    if (!it) return 'unknown';
    if (!env.unlocked(it)) return 'locked';
    if (ownedOrDone(it)) return 'owned';
    if (it.kind === 'home' && it.tier !== (S().home?.tier ?? 0) + 1) return 'tier';
    if (it.kind === 'boat' && it.id !== 'boat_repair' && !(S().boat?.repaired || S().flags?.boat_repaired)) return 'boat';
    if (it.kind === 'boat' && it.level > 0 && (S().boat?.level ?? 0) < it.level - 1) return 'tier';
    if (it.kind === 'decor' && (S().home?.tier ?? 0) < (it.minTier || 0)) return 'tier';
    if (it.reward) return 'reward';
    if (!sys().economy?.canAfford?.(offer(it).price)) return 'coins';
    if (!needsOK(it)) return 'needs';
    return null;
  }

  function dailySpecial(day = ctx.time.day) {
    const cfg = D().shops?.pescheria?.dailySpecial;
    if (!cfg) return null;
    const reach = sys().dailies?.reachableHabitats?.() || ['pond', 'river', 'shore', 'harbor'];
    const pool = (D().fish || []).filter(f => cfg.rarities.includes(f.rarity) && f.habitats.some(h => reach.includes(h)));
    if (!pool.length) return null;
    const r = ctx.math.rng('pescheria-special-' + day);
    return { speciesId: r.pick(pool).id, mult: cfg.mult };
  }

  function priceOf(entry) {
    const it = D().get?.(entry.id);
    let p = entry.price ?? it?.price ?? 1;
    const sp = dailySpecial();
    if (sp && sp.speciesId === entry.id) p *= sp.mult;
    p *= sys().buffs?.mult?.('price') || 1;
    return Math.max(1, Math.round(p));
  }

  const shops = {
    isOpen: id => { const s = D().shops?.[id]; return s ? isOpen(s) : false; },
    dailySpecial,
    priceOf,
    blocker: id => blocker(D().get?.(id)),
    /** View model for the shop sheet. */
    open(shopId) {
      const shop = D().shops?.[shopId];
      if (!shop) return null;
      const sections = (shop.sections || []).map(sec => ({
        section: sec.section, labelKey: `shop.section.${sec.section}`,
        items: sec.items.map(id => D().get?.(id)).filter(Boolean)
          .filter(it => env.unlocked(it) || it.kind === 'bait' || ['rod', 'reel', 'line', 'basket'].includes(it.kind)) // show upcoming gear as locked
          .filter(it => !(it.story && ownedOrDone(it)))
          .map(it => {
            const o = offer(it);
            const b = blocker(it);
            return { id: it.id, kind: it.kind, nameKey: it.nameKey, descKey: it.descKey, price: o.price, qty: o.qty, needs: it.needs || null,
              owned: b === 'owned', locked: b === 'locked', canBuy: !b, reason: b, count: sys().inventory?.count?.(it.id) || 0, stats: it.stats || null };
          }),
      })).filter(s => s.items.length);
      const view = { id: shop.id, nameKey: shop.nameKey, npc: shop.npc, open: isOpen(shop), hours: shop.hours, sections, coins: sys().economy?.coins ?? 0 };
      if (shop.buys) {
        const sp = dailySpecial();
        view.sell = {
          special: sp,
          honesty: !isOpen(shop),
          basket: (S().basket || []).map((e, i) => ({ index: i, id: e.id, size: e.size, base: e.price, price: priceOf(e), special: sp?.speciesId === e.id, nameKey: D().get?.(e.id)?.nameKey })),
          items: Object.entries(S().items || {}).filter(([id, n]) => n > 0 && D().get?.(id)?.kind === 'ingredient' && D().get?.(id)?.sellable)
            .map(([id, n]) => ({ id, n, price: Math.max(1, Math.round((D().get(id).price || 1) * (shop.buys.ingredient || 0.8))), nameKey: D().get(id).nameKey })),
        };
        view.sell.total = view.sell.basket.reduce((s, e) => s + e.price, 0);
      }
      if (shop.cook) view.cook = true;
      if (shop.donate) view.donate = true;
      return view;
    },
    /** Buy one item (a bait pack, a recipe card, a rod…). */
    buy(itemId, shopId = null) {
      const it = D().get?.(itemId);
      const b = blocker(it);
      if (b) {
        if (b === 'coins') env.toast('sys.shop.no_coins');
        else if (b === 'needs') env.toast('sys.shop.needs', { items: Object.entries(it.needs).map(([id, n]) => `${n} ${env.itemName(id)}`).join(', ') });
        else if (b === 'owned') env.toast('sys.shop.owned');
        else if (b === 'locked') env.toast('sys.shop.locked');
        else if (b === 'tier' || b === 'boat') env.toast('sys.shop.not_yet');
        return { ok: false, reason: b };
      }
      const shop = shopId ? D().shops?.[shopId] : Object.values(D().shops || {}).find(s => s.stock?.includes(itemId));
      if (shop && !isOpen(shop)) { env.toast('sys.shop.closed', { name: env.t(shop.nameKey) }); return { ok: false, reason: 'closed' }; }
      const o = offer(it);
      if (!sys().economy.spend(o.price, 'buy:' + itemId)) return { ok: false, reason: 'coins' };
      for (const [id, n] of Object.entries(it.needs || {})) sys().inventory.remove(id, n);
      const inv = sys().inventory;
      if (it.kind === 'bait') inv.add(itemId, o.qty);
      else if (it.kind === 'recipe') sys().cooking?.learn(itemId);
      else if (it.kind === 'boat') { S().owned[itemId] = true; sys().boat?.applyItem?.(it); }
      else if (it.kind === 'home') { S().owned[itemId] = true; sys().home?.setTier(it.tier); }
      else if (['rod', 'reel', 'line'].includes(it.kind)) { inv.add(itemId, 1); inv.equip(it.kind, itemId); }
      else inv.add(itemId, 1);
      env.sfx('coin');
      const name = env.itemName(itemId);
      env.toast('sys.shop.bought', { item: o.qty > 1 ? `${o.qty} × ${name}` : name });
      ctx.save.commit();
      ctx.bus.emit('shop:buy', { itemId, shopId: shop?.id || null, price: o.price, kind: it.kind, qty: o.qty });
      return { ok: true };
    },
    /** Sell basket entries: 'all' or an array of basket indexes. */
    sell(sel = 'all') {
      const b = S().basket || [];
      const idx = sel === 'all' ? b.map((e, i) => i) : [...new Set(sel)].filter(i => b[i]);
      if (!idx.length) { env.toast('sys.shop.nothing_to_sell'); return { count: 0, total: 0 }; }
      let total = 0;
      const sold = [];
      for (const i of idx.sort((a, c) => c - a)) {
        const e = b[i];
        const it = D().get?.(e.id);
        if (it && it.sellable === false) continue;
        total += priceOf(e);
        sold.push(e);
        b.splice(i, 1);
      }
      if (!sold.length) return { count: 0, total: 0 };
      sys().economy.earn(total, 'sell');
      const st = (S().stats ||= {});
      st.sold = (st.sold | 0) + sold.length;
      env.sfx('coin', { pitch: 1.1 });
      env.sfx('coin', { pitch: 1.3, delay: 0.12 });
      env.toastFB('sys.shop.sold', { n: sold.length, coins: total });
      ctx.save.commit();
      ctx.bus.emit('inventory:change', { id: null, delta: -sold.length, where: 'basket' });
      ctx.bus.emit('shop:sell', { count: sold.length, total, items: sold.map(e => e.id) });
      return { count: sold.length, total };
    },
    /** Sell foraged ingredients to Gino (80 % of their value). */
    sellItem(id, n = 1) {
      const it = D().get?.(id);
      const have = S().items?.[id] || 0;
      if (!it || it.kind !== 'ingredient' || !it.sellable || have <= 0) return { count: 0, total: 0 };
      n = Math.min(n, have);
      const each = Math.max(1, Math.round((it.price || 1) * (D().shops?.pescheria?.buys?.ingredient || 0.8)));
      sys().inventory.remove(id, n);
      sys().economy.earn(each * n, 'sell');
      env.sfx('coin');
      ctx.bus.emit('shop:sell', { count: n, total: each * n, items: [id] });
      return { count: n, total: each * n };
    },
  };
  return shops;
}
