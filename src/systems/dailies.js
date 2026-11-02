// Daily requests from villagers (ctx.data.dailies templates). Up to 3 per game day, at most one per NPC, seeded by the
// day number so they are the same after a reload. Kinds: deliver (talk to the NPC with the items), catch (fishing:catch
// matching a filter), donate (new aquarium species). Catch/donate requests complete by themselves.
//   save.state.quests.dailies = [{id, template, day, npc, kind, itemId, filter, whatKey, need, n, done, reward}]
// Emits 'deliver' {npcId, itemId, n} and 'daily:done' {id, npc}.

const REACH = { deep: () => 'boat', reef: () => 'boat', cave: () => 'lantern' };

export function createDailies(ctx, env) {
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};
  const list = () => {
    const q = (S().quests ||= {});
    if (!Array.isArray(q.dailies)) q.dailies = [];
    return q.dailies;
  };

  function reachableHabitats() {
    const s = S();
    const boat = !!(s.boat?.repaired || s.flags?.boat_repaired);
    const lantern = !!s.owned?.lantern;
    return ['pond', 'river', 'shore', 'harbor', ...(boat ? ['deep', 'reef'] : []), ...(lantern ? ['cave'] : [])];
  }
  function reachableSpecies(id) {
    const sp = D().get?.(id);
    if (!sp) return false;
    if (sp.kind !== 'fish') return true;
    const reach = reachableHabitats();
    return sp.habitats.some(h => reach.includes(h)) && !sp.special;
  }

  function generate(day) {
    const r = ctx.math.rng('dailies-' + day);
    const pool = (D().dailies || []).filter(tpl => env.unlocked(tpl));
    const out = [], usedNpc = new Set();
    const bag = pool.slice();
    while (out.length < 3 && bag.length) {
      const total = bag.reduce((s, x) => s + (x.weight || 1), 0);
      let x = r() * total, i = 0;
      for (; i < bag.length - 1; i++) { x -= bag[i].weight || 1; if (x <= 0) break; }
      const tpl = bag.splice(i, 1)[0];
      if (usedNpc.has(tpl.npc)) continue;
      const inst = build(tpl, r, day);
      if (!inst) continue;
      usedNpc.add(tpl.npc);
      out.push(inst);
    }
    return out;
  }

  function build(tpl, r, day) {
    const need = r.int(tpl.n[0], tpl.n[1]);
    const inst = { id: `${tpl.id}@${day}`, template: tpl.id, day, npc: tpl.npc, kind: tpl.kind, textKey: tpl.textKey, thanksKey: tpl.thanksKey,
      need, n: 0, done: false, itemId: null, filter: tpl.filter ? { ...tpl.filter } : null, whatKey: null, reward: { coins: 0, items: tpl.reward?.items || null } };
    if (tpl.kind === 'deliver') {
      const opts = tpl.pick.from.filter(reachableSpecies);
      if (!opts.length) return null;
      inst.itemId = r.pick(opts);
    }
    if (tpl.filterPick) {
      let from = tpl.filterPick.from;
      if (tpl.filterPick.key === 'habitat') from = from.filter(h => reachableHabitats().includes(h));
      if (tpl.filterPick.key === 'bait') from = from.filter(b => env.unlocked(D().get?.(b)));
      if (!from.length) return null;
      const val = r.pick(from);
      inst.filter = { ...(inst.filter || {}), [tpl.filterPick.key]: val };
      inst.whatKey = tpl.filterPick.key === 'habitat' ? `habitat.${val}` : tpl.filterPick.key === 'weather' ? `weather.${val}` : D().get?.(val)?.nameKey || val;
    }
    if (tpl.filter?.phase) inst.whatKey = `phase.${tpl.filter.phase}`;
    let coins = tpl.reward?.coins ? r.int(tpl.reward.coins[0], tpl.reward.coins[1]) : 0;
    if (tpl.reward?.priceMult && inst.itemId) coins += Math.round((D().get?.(inst.itemId)?.price || 5) * tpl.reward.priceMult * need);
    inst.reward.coins = coins;
    return inst;
  }

  function vars(d) {
    return { n: d.need, item: d.itemId ? env.itemName(d.itemId) : '', what: d.whatKey ? env.t(d.whatKey) : '' };
  }

  function finish(d) {
    if (d.done) return;
    d.done = true;
    const text = sys().quests?.grant?.(d.reward, { silent: true }) || '';
    const st = (S().stats ||= {});
    st.dailies = (st.dailies | 0) + 1;
    ctx.save.commit();
    env.sfx('quest_done', { vol: 0.7 });
    env.toast('sys.daily.done', { name: env.t(`npc.${d.npc}.name`), what: text });
    ctx.bus.emit('daily:done', { id: d.id, npc: d.npc, template: d.template });
  }

  function refresh() {
    const day = ctx.time.day;
    const cur = list();
    if (cur.length && cur[0].day === day) return;
    const fresh = generate(day);
    S().quests.dailies = fresh;
    ctx.save.commit();
    if (fresh.length) ctx.bus.emit('daily:new', { day, list: fresh.map(d => d.id) });
  }

  const dailies = {
    reachableHabitats,
    refresh,
    /** For the quest sheet: [{id, kind:'daily', text, n, count, done, npc}] */
    list() {
      return list().map(d => ({
        id: d.id, kind: 'daily', npc: d.npc, n: d.n, count: d.need, done: d.done, textKey: d.textKey, vars: vars(d),
        text: env.t(d.textKey, vars(d)), title: env.t(`npc.${d.npc}.name`), item: d.itemId, reward: d.reward, marker: null,
      }));
    },
    get all() { return list(); },
    onEvent(evt, p) {
      for (const d of list()) {
        if (d.done) continue;
        if (d.kind === 'catch' && evt === 'fishing:catch' && !p.junk && sys().quests?.matches?.(d.filter, p)) {
          d.n++; ctx.save.commit();
          ctx.bus.emit('quest:progress', { id: d.id, count: d.n, need: d.need, kind: 'daily' });
          if (d.n >= d.need) finish(d);
        }
        if (d.kind === 'donate' && evt === 'aquarium:donate') {
          d.n++; ctx.save.commit();
          if (d.n >= d.need) finish(d);
        }
      }
    },
    /**
     * Called when talking to an NPC. Returns false if the conversation was not about a request, else {choice}.
     * opts.choices: answers to offer under the request line (a shopkeeper's "Vediamo cosa c'è / A dopo!"), so a
     * request never hides the counter.
     */
    async talk(npcId, opts = {}) {
      const d = list().find(x => x.npc === npcId && !x.done);
      if (!d) return false;
      const q = sys().quests;
      if (d.kind === 'deliver') {
        const have = sys().inventory?.count?.(d.itemId) || 0;
        if (have >= d.need) {
          sys().inventory.remove(d.itemId, d.need);
          d.n = d.need;
          ctx.bus.emit('deliver', { npcId, itemId: d.itemId, n: d.need });
          // reward first: the thank-you line may wait in the dialog queue (sheet open, fishing...)
          finish(d);
          const lines = [{ key: d.thanksKey || `npc.${npcId}.thanks.1` }];
          if (!opts.choices) { q?.say?.(npcId, lines); return { choice: null }; }
          return { choice: (await q?.say?.(npcId, lines, { choices: opts.choices })) ?? null };
        }
      }
      if (d.seenDay === ctx.time.day && Math.random() < 0.5) return false; // don't repeat it every single time
      d.seenDay = ctx.time.day;
      const r = await q?.say?.(npcId, [{ key: d.textKey, vars: vars(d) }], opts.choices ? { choices: opts.choices } : {});
      return { choice: r ?? null };
    },
    update() { if (list()[0]?.day !== ctx.time.day && (D().dailies || []).length) refresh(); },
  };
  ctx.bus.on('time:day', () => refresh());
  ctx.bus.on('save:loaded', () => refresh());
  ctx.bus.on('quest:complete', () => { /* new templates unlock tomorrow; nothing to do today */ });
  return dailies;
}
