// Inventory: the basket (caught fish + sellable junk, limited by the basket tier), stackable items (baits, ingredients,
// dishes, decor, key items), owned gear/cosmetics and the equipped set.
//   save.state.basket = [{id, size, price, day}]   save.state.items = {id: n}
//   save.state.owned = {id: true}                    save.state.equip = {rod, reel, line, bait, hat, collar}
// Emits 'inventory:change' {id, delta, where} and 'equip:change' {slot, id}.

const OWNED_KINDS = new Set(['rod', 'reel', 'line', 'basket', 'lantern', 'boat', 'cosmetic', 'home', 'tool']);   // tool: the bucket [r2-gameplay]

export function createInventory(ctx, env) {
  const S = env.S;
  const D = () => ctx.data || {};
  const items = () => (S().items ||= {});
  const basket = () => (Array.isArray(S().basket) ? S().basket : (S().basket = []));
  const owned = () => (S().owned ||= {});
  const equip = () => (S().equip ||= {});
  const changed = (id, delta, where) => { ctx.save.commit(); ctx.bus.emit('inventory:change', { id, delta, where }); };

  const isFishLike = it => it && (it.kind === 'fish' || (it.kind === 'junk' && it.sellable !== false));

  const inv = {
    // ---------------------------------------------------------------- basket
    get basket() { return basket(); },
    get capacity() {
      let c = 8;
      for (const b of D().baskets || []) if (owned()[b.id]) c = Math.max(c, b.capacity);
      return c;
    },
    get basketCount() { return basket().length; },
    get basketFree() { return Math.max(0, inv.capacity - basket().length); },
    get basketFull() { return basket().length >= inv.capacity; },
    /** Put a caught specimen in the basket. Returns false if the basket is full (unless force). */
    addCatch({ id, size = 0, price }, force = false) {
      if (!force && inv.basketFull) return false;
      const sp = D().get?.(id);
      const p = price ?? (sp ? D().helpers?.priceFor?.(sp, size) ?? sp.price : 1);
      basket().push({ id, size, price: p, day: ctx.time.day });
      changed(id, 1, 'basket');
      return true;
    },
    /** Remove basket entries matching pred (smallest first). Returns the removed entries. */
    takeFromBasket(pred, n = 1, prefer = 'smallest') {
      const b = basket();
      const idx = b.map((e, i) => i).filter(i => pred(b[i], D().get?.(b[i].id)));
      idx.sort((a, c) => (prefer === 'biggest' ? b[c].size - b[a].size : b[a].size - b[c].size));
      const pick = idx.slice(0, n).sort((a, c) => c - a);
      const out = [];
      for (const i of pick) out.push(...b.splice(i, 1));
      if (out.length) for (const e of out) changed(e.id, -1, 'basket');
      return out;
    },
    removeBasketAt(i) {
      const e = basket()[i];
      if (!e) return null;
      basket().splice(i, 1);
      changed(e.id, -1, 'basket');
      return e;
    },
    basketCountOf(pred) { return basket().filter(e => pred(e, D().get?.(e.id))).length; },

    // ---------------------------------------------------------------- items & owned
    /** Add anything by id: fish go to the basket, gear/cosmetics become owned, the rest stacks in items. Returns n added. */
    add(id, n = 1, opts = {}) {
      n = Math.max(0, n | 0);
      if (!n) return 0;
      if (id === 'coins') { ctx.systems?.economy?.earn(n, 'gift'); return n; }
      const it = D().get?.(id);
      if (!it) { items()[id] = (items()[id] || 0) + n; changed(id, n, 'items'); return n; }
      if (isFishLike(it)) {
        let k = 0;
        const roll = D().helpers?.rollSize;
        for (let i = 0; i < n; i++) {
          const size = opts.size ?? (it.size && roll ? roll(it, Math.random()) : 0);
          if (inv.addCatch({ id, size }, opts.force)) k++;
        }
        return k;
      }
      if (it.kind === 'recipe') { ctx.systems?.cooking?.learn(id); return 1; }
      if (it.kind === 'home') { owned()[id] = true; ctx.systems?.home?.setTier(it.tier); changed(id, 1, 'owned'); return 1; }
      if (it.kind === 'boat') { owned()[id] = true; ctx.systems?.boat?.applyItem?.(it); changed(id, 1, 'owned'); return 1; }
      if (OWNED_KINDS.has(it.kind)) {
        const was = owned()[id];
        owned()[id] = true;
        if (!was && it.kind === 'cosmetic' && opts.equip !== false) inv.equip(it.slot === 'cat_collar' ? 'collar' : 'hat', id);
        changed(id, 1, 'owned');
        return 1;
      }
      items()[id] = (items()[id] || 0) + n;
      changed(id, n, 'items');
      return n;
    },
    /** Remove n of id from items, else from the basket (smallest first). Returns how many were removed. */
    remove(id, n = 1) {
      let left = n;
      const have = items()[id] || 0;
      if (have > 0) {
        const k = Math.min(have, left);
        items()[id] = have - k;
        if (items()[id] <= 0) delete items()[id];
        left -= k;
        changed(id, -k, 'items');
      }
      if (left > 0) left -= inv.takeFromBasket(e => e.id === id, left).length;
      return n - left;
    },
    /** How many: stack count + basket entries (+1 if owned gear). */
    count(id) {
      return (items()[id] || 0) + basket().filter(e => e.id === id).length + (owned()[id] && !items()[id] ? 1 : 0);
    },
    has(id, n = 1) { return inv.count(id) >= n; },
    owns(id) { return !!owned()[id]; },
    get items() { return items(); },
    get owned() { return owned(); },

    // ---------------------------------------------------------------- equipment
    get equipped() { return equip(); },
    /** Equip an owned item. slot: rod|reel|line|bait|hat|collar. */
    equip(slot, id) {
      const it = D().get?.(id);
      if (slot === 'bait') return inv.setBait(id);
      if (!owned()[id]) return false;
      equip()[slot] = id;
      ctx.save.commit();
      ctx.bus.emit('equip:change', { slot, id });
      if (slot === 'hat') { try { ctx.player?.setOutfit?.({ hat: id, hatColor: it?.color, hatBand: it?.band }); } catch { /* optional */ } }
      if (slot === 'collar') { try { ctx.creatures?.cat?.setCollar?.(id); } catch { /* optional */ } }
      return true;
    },
    /** {rod, reel, line} records with stats (fallback to starter gear). */
    gear() {
      const d = D(), e = equip();
      return {
        rod: d.get?.(e.rod) || d.rods?.[0] || { stats: { cast: 9, power: 1, luck: 0, control: 1 } },
        reel: d.get?.(e.reel) || d.reels?.[0] || { stats: { tolerance: 1, recovery: 1, speed: 1 } },
        line: d.get?.(e.line) || d.lines?.[0] || { stats: { strength: 1, grace: 1.2, stealth: 1 } },
      };
    },

    // ---------------------------------------------------------------- baits
    get bait() { return equip().bait || 'bait_worm'; },
    baitRecord() { return D().get?.(inv.bait) || D().baits?.[0] || null; },
    /** Baits the player can use now → [{id, count (Infinity for free), free, equipped, nameKey}]. */
    baits() {
      return (D().baits || []).filter(b => b.free || (items()[b.id] || 0) > 0).map(b => ({
        id: b.id, free: b.free, count: b.free ? Infinity : items()[b.id] || 0, equipped: b.id === inv.bait, nameKey: b.nameKey,
      }));
    },
    setBait(id) {
      const b = D().get?.(id);
      if (!b || b.kind !== 'bait') return false;
      if (!b.free && !(items()[id] > 0)) return false;
      if (equip().bait === id) return true;
      equip().bait = id;
      ctx.save.commit();
      ctx.bus.emit('equip:change', { slot: 'bait', id });
      return true;
    },
    /** Next available bait (B key). Shows a toast with the bait name. */
    cycleBait(dir = 1) {
      const list = inv.baits();
      if (!list.length) return null;
      const i = list.findIndex(b => b.equipped);
      const next = list[(i + dir + list.length) % list.length];
      inv.setBait(next.id);
      env.toast('sys.bait.now', { item: env.itemName(next.id), n: next.free ? '∞' : next.count });
      env.sfx('ui_tap', { pitch: 1.2 });
      return next.id;
    },
    /** One unit of the equipped bait is used when a fish is hooked. Free baits are never used up. */
    consumeBait() {
      const b = inv.baitRecord();
      if (!b || b.free) return true;
      const have = items()[b.id] || 0;
      if (have <= 0) { inv.setBait('bait_worm'); return false; }
      items()[b.id] = have - 1;
      if (items()[b.id] <= 0) {
        delete items()[b.id];
        equip().bait = 'bait_worm';
        ctx.bus.emit('equip:change', { slot: 'bait', id: 'bait_worm' });
        env.toast('sys.bait.out', { item: env.itemName(b.id) });
      }
      changed(b.id, -1, 'items');
      return true;
    },

    /** Snapshot for the Inventory sheet. */
    list() {
      const d = D();
      const stack = Object.entries(items()).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, kind: d.get?.(id)?.kind || 'item', nameKey: d.get?.(id)?.nameKey }));
      return { basket: basket().slice(), capacity: inv.capacity, items: stack, baits: inv.baits(), equip: { ...equip() }, owned: Object.keys(owned()) };
    },
    update() {
      // Keyboard B cycles the bait only when no UI module owns the bait selector.
      if (!ctx.ui && ctx.input.pressed('bait') && !ctx.systems?.fishing?.busy) inv.cycleBait(1);
    },
  };
  return inv;
}
