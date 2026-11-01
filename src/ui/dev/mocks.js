// Mock Systems / NPCs / World bits for sandbox/ui.html — lets every UI screen be exercised before Gameplay exists.
// Not loaded by the game (only the sandbox imports it) and not precached by the service worker.

export function seedDemoState(ctx, { fresh = false } = {}) {
  const s = ctx.save.state;
  if (fresh) return s;
  const D = ctx.data;
  s.lang = s.lang || 'it';
  s.coins = 1240;
  const pick = ids => ids.filter(id => D.fishById[id]);
  const caught = pick(['carp', 'tench', 'rudd', 'perch', 'goldfish', 'koi', 'brown_trout', 'chub', 'grayling', 'sardine', 'mackerel', 'bogue', 'salema',
    'white_bream', 'mullet', 'red_mullet', 'green_crab', 'octopus', 'pufferfish', 'clownfish', 'seahorse', 'crayfish', 'cuttlefish', 'sea_bass', 'scorpionfish', 'legend_dawn_koi']);
  s.journal = {};
  caught.forEach((id, i) => { const f = D.fishById[id]; s.journal[id] = { n: 1 + (i * 7) % 9, best: Math.round((f.size[0] + (f.size[1] - f.size[0]) * (0.4 + (i % 5) / 9)) * 10) / 10, firstDay: 1 + (i % 4) }; });
  s.journal.junk_boot = { n: 2, best: 0, firstDay: 1 };
  s.aquarium = Object.fromEntries(caught.slice(0, 9).map(id => [id, true]));
  s.basket = pick(['carp', 'sardine', 'koi', 'mackerel', 'octopus', 'perch']).map((id, i) => {
    const f = D.fishById[id]; const size = Math.round((f.size[0] + (f.size[1] - f.size[0]) * (0.3 + i * 0.1)) * 10) / 10;
    return { id, size, price: Math.round(f.price * (0.7 + 0.6 * (size - f.size[0]) / (f.size[1] - f.size[0]))) };
  });
  s.basket.push({ id: 'junk_boot', size: 0, price: 1 });
  s.items = { bait_corn: 8, bait_shrimp: 14, bait_fly: 3, ing_rosemary: 3, ing_lemon: 2, ing_tomato: 1, ing_driftwood: 5, ing_shell: 4, ing_mint: 2,
    ing_porcini: 1, ing_chanterelle: 2, dish_grilled_fish: 1, dish_mint_tea: 2, junk_bottle: 1, junk_key: 1, decor_rug: 1 };
  s.owned = { ...s.owned, rod_sturdy: true, reel_smooth: true, basket_medium: true, hat_sky: true, hat_sunset: true, collar_red: true, line_nylon: true, lantern: true };
  s.equip = { ...s.equip, rod: 'rod_sturdy', bait: 'bait_shrimp' };
  s.quests = { story: 3, progress: { q_harbor: 1 }, done: {}, side: {},
    dailies: [
      { id: 'd1', template: 'daily_gino_fish', npc: 'gino', textKey: 'daily.daily_gino_fish', vars: { n: 3 }, item: 'mackerel', n: 1, count: 3, reward: { coins: 45 } },
      { id: 'd2', template: 'daily_marta_habitat', npc: 'marta', textKey: 'daily.daily_marta_habitat', vars: { n: 2, what: ctx.i18n.t('habitat.river') }, n: 2, count: 2, done: true, reward: { coins: 60 } },
      { id: 'd3', template: 'daily_ettore_night', npc: 'ettore', textKey: 'daily.daily_ettore_night', vars: { n: 2 }, n: 0, count: 2, reward: { coins: 80, items: { bait_firefly: 2 } } },
    ] };
  s.recipes = { rec_fish_soup: true, rec_mint_tea: true, rec_trout_fennel: true };
  s.flags = { cat_friend: true };
  s.buffs = [{ stat: 'luck', mult: 1.12, until: 99999 }];
  return s;
}

/** Minimal Systems with the API the UI adapter uses. Mutates ctx.save.state and emits the contract events. */
export function createMockSystems(ctx) {
  const S = () => ctx.save.state;
  const D = ctx.data;
  const emit = (e, p) => ctx.bus.emit(e, p);
  const capOf = () => Math.max(8, ...D.baskets.filter(b => S().owned[b.id]).map(b => b.capacity));
  const sys = {
    economy: {
      get coins() { return S().coins; },
      earn(n) { S().coins += n; emit('coins:change', { coins: S().coins, delta: n }); return S().coins; },
      spend(n) { if (S().coins < n) return false; S().coins -= n; emit('coins:change', { coins: S().coins, delta: -n }); return true; },
    },
    inventory: {
      get basket() { return S().basket; },
      get capacity() { return capOf(); },
      count(id) { return S().items[id] || 0; },
      add(id, n = 1) {
        const r = D.items[id];
        if (r?.kind === 'fish' || r?.kind === 'junk') { for (let i = 0; i < n; i++) S().basket.push({ id, size: r.size ? (r.size[0] + r.size[1]) / 2 : 0, price: r.price }); }
        else S().items[id] = (S().items[id] || 0) + n;
        emit('inventory:change', {});
        return true;
      },
      equip(slot, id) { S().equip[slot] = id; emit('equip:change', { slot, id }); return true; },
    },
    shops: {
      isOpen: () => true,
      priceOf: e => e.price || 0,
      dailySpecial: () => 'mackerel',
      buy(id, shopId) {
        const r = D.items[id]; if (!r) return { ok: false, reason: 'unknown' };
        const p = r.price || 0;
        if (S().coins < p) return { ok: false, reason: 'coins' };
        if (r.needs) for (const [k, n] of Object.entries(r.needs)) if ((S().items[k] || 0) < n) return { ok: false, reason: 'needs' };
        if (r.needs) for (const [k, n] of Object.entries(r.needs)) S().items[k] -= n;
        sys.economy.spend(p);
        if (r.kind === 'bait') S().items[id] = (S().items[id] || 0) + (r.pack || 1);
        else if (r.kind === 'ingredient') S().items[id] = (S().items[id] || 0) + 1;
        else if (r.kind === 'recipe') S().recipes[id] = true;
        else S().owned[id] = true;
        emit('shop:buy', { itemId: id, shopId }); emit('inventory:change', {});
        return { ok: true };
      },
      sell(which) {
        const b = S().basket;
        const idx = which === 'all' ? b.map((_, i) => i) : which;
        let total = 0, count = 0;
        for (const i of [...idx].sort((a, c) => c - a)) { const e = b[i]; if (!e) continue; total += e.price; count++; b.splice(i, 1); }
        if (count) { sys.economy.earn(total); emit('shop:sell', { count, total }); emit('inventory:change', {}); }
        return { ok: count > 0, total };
      },
      sellItem(id, n = 1) {
        if ((S().items[id] || 0) < n) return { ok: false };
        S().items[id] -= n; const p = Math.max(1, Math.round((D.items[id].price || 1) * 0.8)) * n;
        sys.economy.earn(p); emit('shop:sell', { count: n, total: p }); emit('inventory:change', {}); return { ok: true };
      },
    },
    aquarium: {
      get donated() { return S().aquarium; },
      donate(id) {
        const i = S().basket.findIndex(e => e.id === id);
        if (i < 0 || S().aquarium[id]) return { ok: false };
        S().basket.splice(i, 1); S().aquarium[id] = true;
        emit('aquarium:donate', { speciesId: id }); emit('inventory:change', {}); return { ok: true };
      },
    },
    cooking: {
      get recipes() { return D.recipes.filter(r => r.known || S().recipes[r.id]).map(r => r.id); },
      cook(id) {
        const r = D.items[id]; if (!r) return { ok: false };
        for (const nd of r.needs) {
          if (nd.id && D.items[nd.id]?.kind !== 'fish') S().items[nd.id] -= nd.n;
          else for (let k = 0; k < nd.n; k++) { const i = S().basket.findIndex(e => D.items[e.id]?.kind === 'fish' && (nd.fish === 'any' || (nd.habitat && D.items[e.id].habitats.includes(nd.habitat)) || nd.id === e.id || nd.ids?.includes(e.id))); if (i >= 0) S().basket.splice(i, 1); }
        }
        S().items[r.dish] = (S().items[r.dish] || 0) + 1;
        emit('cook:done', { recipeId: id }); emit('inventory:change', {}); return { ok: true };
      },
      eat(dishId) {
        if (!(S().items[dishId] > 0)) return { ok: false };
        S().items[dishId]--;
        const r = D.items[D.items[dishId].recipe];
        for (const b of r?.buffs || []) { S().buffs.push({ stat: b.stat, mult: b.mult, until: ctx.time.day * 24 + ctx.time.hours + b.hours }); emit('buff:start', { stat: b.stat }); }
        emit('inventory:change', {}); return { ok: true };
      },
    },
    buffs: { get active() { return S().buffs; } },
    quests: {
      active() {
        const story = D.quests[S().quests.story];
        const list = [];
        if (story) list.push({ id: story.id, kind: 'story', n: S().quests.progress[story.id] || 0, count: story.goal.count, npc: story.npc, marker: story.marker });
        for (const d of S().quests.dailies) list.push({ ...d, kind: 'daily' });
        return list;
      },
    },
    interact: { current: null },
  };
  return sys;
}

/** Simple capsule "villagers" so world labels have something to follow. */
export function addMockNpcs(ctx, positions) {
  const { THREE } = ctx;
  const list = [];
  for (const [id, x, z] of positions) {
    const look = ctx.data.npcById[id]?.look || {};
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 6, 12), new THREE.MeshStandardMaterial({ color: look.shirt?.color || '#3fb8b0', roughness: 0.9 }));
    body.position.y = 0.8; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ color: look.skin || '#e8b48a', roughness: 0.9 }));
    head.position.y = 1.75; head.castShadow = true;
    g.add(body, head);
    g.position.set(x, ctx.stage?.heightAt?.(x, z) ?? 0, z);
    ctx.scene.add(g);
    list.push({ id, object: g, labelHeight: 2.45 });
  }
  return { list, get: id => list.find(n => n.id === id) };
}
