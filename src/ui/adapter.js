// Game-state adapter: one place where the UI reads state and asks Systems to act.
// Reads prefer ctx.systems.* when present and fall back to ctx.save.state + ctx.data, so the UI works (read-only)
// before Gameplay exists and in sandboxes. Actions call Systems; without Systems they return {ok:false}.
//
// Systems calls used by the UI (all optional, see docs/CHANGES.md [App & UI]):
//   economy.coins                       inventory.basket, inventory.capacity, inventory.count(id), inventory.equip(slot, id)
//   shops.buy(itemId, shopId)           shops.sell(indices|'all', shopId) · shops.sellItem(itemId, n) · shops.priceOf(entry)
//   shops.isOpen(shopId)                aquarium.donate(speciesId)        cooking.cook(recipeId), cooking.canCook(recipeId),
//   cooking.eat(dishId), cooking.recipes (known ids)                     buffs.active
//   quests.active() → [{id, kind:'story'|'daily'|'side', titleKey?, goalKey?, text?, n, count, done, npc, marker}]
//   interact.current → {labelKey|label, icon, hold?}    fishing.state, fishing.bobber (Vector3)
// Each action returns a normalized {ok, reason?, ...} object.

export function createAdapter(ctx) {
  const S = () => ctx.save?.state || {};
  const sys = () => ctx.systems || {};
  const D = () => ctx.data || {};
  const t = (k, v) => ctx.i18n.t(k, v);

  const norm = r => {
    if (r === undefined || r === null) return { ok: false, reason: 'unavailable' };
    if (r === true) return { ok: true };
    if (r === false) return { ok: false, reason: 'failed' };
    if (typeof r === 'object') return { ok: r.ok !== false && !r.error, ...r, reason: r.reason || r.error };
    return { ok: true, value: r };
  };
  const call = (fn, ...args) => {
    try { return norm(fn(...args)); } catch (e) { console.warn('[ui] systems call failed', e); return { ok: false, reason: 'error' }; }
  };

  const api = {
    S, D, t,
    /** Data record of any item/fish (dishes get their recipe's model). */
    item(id) {
      const d = D();
      const r = d.items?.[id] || d.get?.(id) || d.fishById?.[id] || null;
      if (r && r.kind === 'dish' && !r.model && r.recipe) r.model = d.items?.[r.recipe]?.model;
      return r;
    },
    /** Translated display name of an item/fish/npc/zone id. */
    name(id) {
      const r = api.item(id);
      if (r?.nameKey) return t(r.nameKey);
      if (D().npcById?.[id]) return t(D().npcById[id].nameKey);
      for (const k of [`fish.${id}.name`, `item.${id}.name`, `npc.${id}.name`, `zone.${id}.name`]) if (ctx.i18n.has(k)) return t(k);
      return id;
    },
    desc(id) { const r = api.item(id); return r?.descKey ? t(r.descKey) : ''; },

    coins() { return +(sys().economy?.coins ?? S().coins ?? 0) || 0; },
    basket() { const b = sys().inventory?.basket ?? S().basket; return Array.isArray(b) ? b : []; },
    capacity() {
      const c = sys().inventory?.capacity;
      if (typeof c === 'number') return c;
      let cap = 8;
      for (const b of D().baskets || []) if (S().owned?.[b.id]) cap = Math.max(cap, b.capacity || 0);
      return cap;
    },
    count(id) {
      const inv = sys().inventory;
      if (typeof inv?.count === 'function') { try { const n = inv.count(id); if (typeof n === 'number') return n; } catch { /* ignore */ } }
      return +(S().items?.[id] || 0);
    },
    owned(id) { return !!S().owned?.[id]; },
    equipped(slot) { return S().equip?.[slot] || null; },
    equip(slot, id) {
      const inv = sys().inventory;
      if (typeof inv?.equip === 'function') return call(inv.equip.bind(inv), slot, id);
      const st = S(); st.equip = st.equip || {}; st.equip[slot] = id; ctx.save.commit();
      ctx.bus.emit('equip:change', { slot, id });
      return { ok: true };
    },
    flags() { return S().flags || {}; },
    storyIndex() { return +(S().quests?.story || 0); },
    questDone(qid) {
      if (!qid) return true;
      const q = S().quests || {};
      if (q.done?.[qid]) return true;
      const idx = (D().quests || []).findIndex(x => x.id === qid);
      return idx >= 0 && api.storyIndex() > idx;
    },
    unlocked(rec) { return !rec?.unlock?.quest || api.questDone(rec.unlock.quest); },

    /** Baits the player can choose now: free ones + any with count > 0 (in data order). */
    baits() { return (D().baits || []).filter(b => b.free || api.count(b.id) > 0); },
    weather() { return ctx.world?.weather?.type || S().weather?.type || 'clear'; },
    phase() { return ctx.time?.phase || 'day'; },
    journal() { return S().journal || {}; },
    aquarium() {
      const a = sys().aquarium?.donated;
      if (a && typeof a === 'object') return Array.isArray(a) ? Object.fromEntries(a.map(id => [id, true])) : a;
      return S().aquarium || {};
    },
    catFriend() { return !!(api.flags().cat_friend || (S().cat?.friend || 0) >= 1 || ctx.creatures?.cat?.friendly); },
    playerPos() { return ctx.player?.position || ctx.player?.object?.position || ctx.cameraRig?.followed?.position || null; },
    playerFacing() { return ctx.player?.facing ?? ctx.player?.object?.rotation?.y ?? 0; },

    /** Active buffs [{stat, mult, hoursLeft}] (Systems or save). */
    buffs() {
      const a = sys().buffs?.active ?? S().buffs ?? [];
      const now = (ctx.time?.day || 1) * 24 + (ctx.time?.hours || 0);
      return (Array.isArray(a) ? a : []).map(b => {
        let left = b.hoursLeft ?? b.remaining;
        if (left === undefined && b.until !== undefined) left = b.until - now;
        return { stat: b.stat, mult: b.mult, hoursLeft: left === undefined ? null : Math.max(0, left) };
      }).filter(b => b.stat && (b.hoursLeft === null || b.hoursLeft > 0));
    },

    // ── quests ──
    /** Progress of a quest step from save (number or object). */
    progressOf(qid) {
      const p = S().quests?.progress?.[qid];
      if (typeof p === 'number') return p;
      if (p && typeof p === 'object') return +(p.n ?? p.count ?? (Array.isArray(p.seen) ? p.seen.length : 0)) || 0;
      return 0;
    },
    /** Normalized quest list: [{id, kind, title, goal, n, count, done, npc, marker}] */
    quests() {
      const q = sys().quests;
      let list = null;
      if (typeof q?.active === 'function') { try { list = q.active(); } catch (e) { console.warn('[ui] quests.active failed', e); } }
      if (Array.isArray(list)) return list.map(api.normQuest).filter(Boolean);
      // fallback from save + data
      const out = [];
      const story = D().quests || [];
      const cur = story[api.storyIndex()];
      if (cur) out.push(api.normQuest({ ...cur, kind: 'story', n: api.progressOf(cur.id), count: cur.goal?.count || 1 }));
      for (const d of S().quests?.dailies || []) out.push(api.normQuest({ ...d, kind: 'daily' }));
      for (const sq of D().sideQuests || []) {
        const st = S().quests?.side?.[sq.id];
        if (st && !st.done) out.push(api.normQuest({ ...sq, kind: 'side', n: api.progressOf(sq.id), count: sq.goal?.count || 1 }));
      }
      return out.filter(Boolean);
    },
    normQuest(x) {
      if (!x) return null;
      const def = D().questById?.[x.id] || D().dailies?.find?.(d => d.id === (x.template || x.id)) || {};
      const vars = { ...(x.vars || {}), n: x.vars?.n ?? x.count ?? x.need ?? def.n?.[0] };
      if (x.item && vars.item === undefined) vars.item = api.name(x.item);
      if (x.what !== undefined && vars.what === undefined) vars.what = x.whatKey ? t(x.whatKey) : x.what;
      const title = x.title || (x.titleKey || def.titleKey ? t(x.titleKey || def.titleKey) : '');
      const goal = x.text || x.goal?.text || (x.goalKey || def.goalKey ? t(x.goalKey || def.goalKey, vars) : (x.textKey || def.textKey ? t(x.textKey || def.textKey, vars) : ''));
      return {
        id: x.id, kind: x.kind || (def.textKey ? 'daily' : 'story'), title, goal,
        n: +(x.n ?? x.progress ?? 0) || 0, count: +(x.count ?? x.need ?? def.goal?.count ?? 1) || 1,
        done: !!x.done, npc: x.npc || def.npc || null, marker: x.marker ?? def.marker ?? null,
        reward: x.reward || def.reward || null,
      };
    },
    currentGoal() {
      const story = api.quests().find(q => q.kind === 'story' && !q.done);
      if (story) return story;
      if ((D().quests || []).length && api.storyIndex() >= D().quests.length) return { id: null, kind: 'done', title: t('ui.hud.goal_done'), goal: '', n: 0, count: 0 };
      return null;
    },

    // ── shops ──
    shopOpen(shopId) {
      const s = sys().shops;
      if (typeof s?.isOpen === 'function') { try { return s.isOpen(shopId) !== false; } catch { /* ignore */ } }
      const shop = D().shops?.[shopId];
      return !shop?.hours || shop.hours.includes(api.phase());
    },
    priceOf(entry) {
      const s = sys().shops;
      if (typeof s?.priceOf === 'function') { try { const p = s.priceOf(entry); if (typeof p === 'number') return p; } catch { /* ignore */ } }
      return +(entry?.price || 0);
    },
    buy(itemId, shopId) {
      const s = sys().shops;
      if (typeof s?.buy === 'function') return call(s.buy.bind(s), itemId, shopId);
      return { ok: false, reason: 'unavailable' };
    },
    sell(which, shopId) {
      const s = sys().shops;
      if (typeof s?.sell === 'function') return call(s.sell.bind(s), which, shopId);
      return { ok: false, reason: 'unavailable' };
    },
    sellItem(itemId, n = 1) {
      const s = sys().shops;
      if (typeof s?.sellItem === 'function') return call(s.sellItem.bind(s), itemId, n);
      return { ok: false, reason: 'unavailable' };
    },
    donate(speciesId) {
      const a = sys().aquarium;
      if (typeof a?.donate === 'function') return call(a.donate.bind(a), speciesId);
      return { ok: false, reason: 'unavailable' };
    },
    knownRecipes() {
      const c = sys().cooking;
      let list = c?.recipes ?? c?.known;
      if (typeof list === 'function') { try { list = list(); } catch { list = null; } }
      if (Array.isArray(list)) return list.map(r => (typeof r === 'string' ? r : r.id));
      if (list && typeof list === 'object') return Object.keys(list).filter(k => list[k]);
      const st = S();
      return (D().recipes || []).filter(r => r.known || st.recipes?.[r.id] || st.owned?.[r.id] || st.items?.[r.id] > 0).map(r => r.id);
    },
    /** {ok, missing:[{label, have, need}]} — Systems first, else evaluated locally from basket + items. */
    canCook(recipeId, station = 'any') {
      const r = api.item(recipeId);
      if (!r) return { ok: false, missing: [] };
      const missing = api.recipeNeeds(r).filter(x => x.have < x.need);
      let ok = missing.length === 0 && (r.station !== 'trattoria' || station === 'trattoria');
      const c = sys().cooking;
      if (typeof c?.canCook === 'function') { try { const v = c.canCook(recipeId, station); ok = typeof v === 'object' ? v.ok !== false : !!v; } catch { /* ignore */ } }
      return { ok, missing, stationOk: r.station !== 'trattoria' || station === 'trattoria' };
    },
    recipeNeeds(r) {
      const basket = api.basket().filter(f => api.item(f.id)?.kind === 'fish');
      return (r.needs || []).map(nd => {
        let have = 0, label = '';
        const pool = nd.fillet ? basket.filter(f => f.fillet) : nd.whole ? basket.filter(f => !f.fillet) : basket;   // [r2-gameplay] fillets
        if (nd.fillet && !nd.id && !nd.ids && !nd.habitat) { have = pool.length; label = t('ui.cook.fillet'); }
        else if (nd.fish === 'any') { have = basket.length; label = t('ui.cook.any_fish'); }
        else if (nd.habitat) { have = pool.filter(f => api.item(f.id)?.habitats?.includes(nd.habitat)).length; label = t('ui.cook.habitat_fish', { what: t('habitat.' + nd.habitat) }); }
        else if (nd.ids) { have = nd.ids.reduce((s, id) => s + pool.filter(f => f.id === id).length + (api.item(id)?.kind === 'fish' ? 0 : api.count(id)), 0); label = nd.ids.map(api.name).join(' / '); }
        else if (nd.id) { const it = api.item(nd.id); have = it?.kind === 'fish' ? pool.filter(f => f.id === nd.id).length : api.count(nd.id); label = api.name(nd.id); }
        return { label, have, need: nd.n || 1, id: nd.id || null };
      });
    },
    cook(recipeId, station) {
      const c = sys().cooking;
      if (typeof c?.cook === 'function') return call(c.cook.bind(c), recipeId, station);
      return { ok: false, reason: 'unavailable' };
    },
    eat(dishId) {
      const c = sys().cooking;
      if (typeof c?.eat === 'function') return call(c.eat.bind(c), dishId);
      return { ok: false, reason: 'unavailable' };
    },
    /** Interact prompt for the action button. */
    interaction() {
      const i = sys().interact;
      let cur = i?.current;
      if (typeof cur === 'function') { try { cur = cur(); } catch { cur = null; } }
      return cur || null;
    },
  };
  return api;
}
