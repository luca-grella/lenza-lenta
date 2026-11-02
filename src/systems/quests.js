// Quests: the story chain (ctx.data.quests), side quests, NPC conversations and rewards.
//   save.state.quests = { story, progress: {id: {count, seen[]}}, done: {id: true}, offered: {id: true}, side: {id: 'active'|'done'}, dailies }
//   save.state.flags = { boat_repaired, cat_friend, lighthouse_lit, ... }
// Story steps are active as soon as the previous one is done (progress always counts); the NPC "offers" the step the
// first time you talk to them (the letter speaks by itself). Completion plays the NPC's "done" lines wherever you are.
// Emits 'quest:progress' {id, count, need}, 'quest:complete' {id}, 'quest:start' {id}, 'npc:talk' {npcId}, 'flag:set' {flag}.

export function createQuests(ctx, env) {
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};
  const Q = () => {
    const q = (S().quests ||= {});
    q.story ??= 0; q.progress ||= {}; q.done ||= {}; q.offered ||= {}; q.side ||= {};
    return q;
  };
  const flags = () => (S().flags ||= {});
  const queue = [];   // pending dialogs: {npc, lines, then?}
  let running = false;
  let zoneT = 0, lastZone = null;

  const story = () => D().quests || [];
  const current = () => story()[Q().story] || null;
  const quest = id => D().questById?.[id] || null;

  // ---------------------------------------------------------------- matching
  /** Does an event payload satisfy a quest filter? Keys: payload → item/species record → ctx (phase, weather). */
  function matches(filter, payload) {
    if (!filter) return true;
    const rec = D().get?.(payload.speciesId || payload.itemId || payload.id) || null;
    for (const [k, want] of Object.entries(filter)) {
      let have;
      if (k === 'sizeRatio') {
        const sp = rec;
        if (!sp?.size || !payload.size) return false;
        have = (payload.size - sp.size[0]) / Math.max(1e-6, sp.size[1] - sp.size[0]);
        if (have + 1e-9 < want) return false;
        continue;
      }
      if (k in payload) have = payload[k];
      else if (k === 'phase') have = ctx.time.phase;
      else if (k === 'weather') have = env.weather();
      else if (k === 'junk') have = !!(payload.junk ?? rec?.junk);
      else if (k === 'habitat' && rec?.habitats) have = rec.habitats;
      else if (rec && k in rec) have = rec[k];
      else return false;
      const wants = Array.isArray(want) ? want : [want];
      const haves = Array.isArray(have) ? have : [have];
      if (!haves.some(h => wants.includes(h))) return false;
    }
    return true;
  }

  function requiresOK(req) {
    if (!req) return true;
    for (const [id, n] of Object.entries(req.items || {})) if (!sys().inventory?.has?.(id, n)) return false;
    return true;
  }

  // ---------------------------------------------------------------- rewards
  /** Give a reward object {coins, items, recipes, flags, consume}. Returns a short summary string. */
  function grant(r, { silent = false } = {}) {
    if (!r) return '';
    const parts = [];
    if (r.consume) for (const [id, n] of Object.entries(r.consume)) sys().inventory?.remove?.(id, n);
    if (r.coins) { sys().economy?.earn?.(r.coins, 'reward'); parts.push(env.t('sys.reward.coins', { n: r.coins })); }
    for (const [id, n] of Object.entries(r.items || {})) {
      const it = D().get?.(id);
      if (it && (it.kind === 'fish' || (it.kind === 'junk' && it.sellable !== false))) sys().inventory?.add?.(id, n, { force: true });
      else sys().inventory?.add?.(id, n);
      parts.push(n > 1 ? `${n} × ${env.itemName(id)}` : env.itemName(id));
    }
    for (const id of r.recipes || []) { sys().cooking?.learn?.(id, { silent: true }); parts.push(env.t('sys.reward.recipe', { name: env.itemName(id) })); }
    for (const f of r.flags || []) setFlag(f);
    const text = parts.join(' · ');
    if (text && !silent) env.toast('sys.reward.got', { what: text });
    ctx.save.commit();
    return text;
  }

  function setFlag(f) {
    if (flags()[f]) return;
    flags()[f] = true;
    if (f === 'boat_repaired') { S().boat ||= {}; S().boat.repaired = true; sys().boat?.refresh?.(); }
    ctx.save.commit();
    ctx.bus.emit('flag:set', { flag: f });
  }

  // ---------------------------------------------------------------- dialogs (sequential, never over a sheet or a catch)
  function say(npc, lines, opts = {}) {
    return new Promise(resolve => { queue.push({ npc, lines: lines.filter(Boolean), resolve, ...opts }); });
  }
  let dialogOpen = false;
  ctx.bus.on('ui:dialog', e => { dialogOpen = !!e?.open; });
  async function runQueue() {
    if (running || !queue.length) return;
    if (env.uiOpen() || sys().fishing?.busy || env.busy.sleep) return;
    running = true;
    const d = queue.shift();
    try { d.before?.(); } catch (e) { console.warn('[quests] before', e); }
    if (!d.lines.length) { d.resolve?.(); running = false; return; }
    try {
      const n = d.npc && d.npc !== 'letter' && d.npc !== 'cat' ? env.npc(d.npc) : null;
      if (n) { try { n.lookAt?.(env.playerPos()); n.play?.('talk', { loop: true }); } catch { /* optional */ } }
      // camera framing on the speaker is handled (and restored) by ui.dialog itself
      ctx.time.paused = true;
      if (d.sfx) env.sfx(d.sfx);
      const r = await env.dialog(d.npc, d.lines, d.choices);
      d.resolve?.(r);
      if (n) { try { n.play?.('idle', { loop: true }); } catch { /* optional */ } }
    } catch (e) { console.warn('[quests] dialog failed', e); d.resolve?.(); }
    ctx.time.paused = false;
    running = false;
  }

  // ---------------------------------------------------------------- story progression
  function activate(step) {
    if (!step) return;
    const p = (Q().progress[step.id] ||= { count: 0, seen: [] });
    if (step.start?.items && !p.startGiven) { p.startGiven = true; grant({ items: step.start.items }, { silent: true }); }
    ctx.bus.emit('quest:start', { id: step.id });
    // state-like goals that may already be satisfied
    if (step.goal?.event === 'cat:befriend' && S().cat?.befriended) complete(step);
    // the letter talks by itself
    if (step.npc === 'letter') offer(step);
  }

  function offer(step, choices = null) {
    if (!step || Q().offered[step.id]) return null;
    Q().offered[step.id] = true;
    ctx.save.commit();
    return say(step.npc, step.dialogKeys?.offer || [], { sfx: step.npc === 'letter' ? 'page_turn' : null, ...(choices ? { choices } : {}) });
  }

  function complete(step, kind = 'story') {
    if (!step || Q().done[step.id]) return;
    Q().done[step.id] = true;
    const reward = grant(step.reward, { silent: true });
    if (kind === 'story') Q().story = Math.max(Q().story, story().indexOf(step) + 1);
    if (kind === 'side') Q().side[step.id] = 'done';
    ctx.save.commit();
    // The state changes now; the celebration waits until no sheet (e.g. the catch card) is open.
    say(step.npc, [...(step.dialogKeys?.done || [])], {
      before() {
        env.sfx('quest_done');
        if (!env.realUI()) env.banner('sys.quest.done', step.titleKey);
        if (reward) env.toast('sys.reward.got', { what: reward });
        ctx.bus.emit('quest:complete', { id: step.id, kind });
      },
    });
    if (kind === 'story') {
      const next = current();
      if (next) {
        activate(next);
        if (next.npc === step.npc || next.npc === 'letter') offer(next);
        else say(null, [], { before: () => env.toast('sys.quest.next', { goal: env.t(next.goalKey) }) });
      } else say(null, [], { before: () => env.banner('sys.quest.story_done', 'sys.quest.story_done_sub') });
    }
  }

  function bump(step, payload, kind) {
    const g = step.goal;
    const p = (Q().progress[step.id] ||= { count: 0, seen: [] });
    if (g.distinct) {
      const val = payload[g.distinct];
      if (p.seen.includes(val)) return;
      p.seen.push(val);
      p.count = p.seen.length;
    } else p.count++;
    ctx.save.commit();
    ctx.bus.emit('quest:progress', { id: step.id, count: p.count, need: g.count || 1, kind });
    if (p.count >= (g.count || 1)) complete(step, kind);
    else if ((g.count || 1) > 1) env.toast('sys.quest.progress', { title: env.t(step.titleKey), n: p.count, of: g.count });
  }

  function onEvent(evt, payload = {}) {
    // story step
    const step = current();
    if (step && step.goal?.event === evt && matches(step.goal.filter, payload) && requiresOK(step.goal.requires)) bump(step, payload, 'story');
    // side quests: triggers and goals
    for (const sq of D().sideQuests || []) {
      const st = Q().side[sq.id];
      if (!st && sq.trigger?.event === evt && matches(sq.trigger.filter, payload)) {
        Q().side[sq.id] = 'active';
        ctx.save.commit();
        ctx.bus.emit('quest:start', { id: sq.id, kind: 'side' });
        env.toast('sys.quest.side_new', { title: env.t(sq.titleKey) });
      } else if (st === 'active' && sq.goal?.event === evt && matches(sq.goal.filter, payload) && requiresOK(sq.goal.requires)) bump(sq, payload, 'side');
    }
    sys().dailies?.onEvent?.(evt, payload);
  }

  const EVENTS = ['fishing:catch', 'shop:sell', 'shop:buy', 'cook:done', 'aquarium:donate', 'cat:befriend', 'forage:pick',
    'boat:board', 'home:upgrade', 'deliver', 'treasure:open', 'quest:complete'];
  for (const e of EVENTS) ctx.bus.on(e, p => onEvent(e, p || {}));
  // zone:enter from World (or from our own tracker when World doesn't emit it)
  ctx.bus.on('zone:enter', p => { if (p?.zone && p.zone !== lastZone) { lastZone = p.zone; onEvent('zone:enter', { zone: p.zone }); } });

  // ---------------------------------------------------------------- talking to villagers
  function npcAsleep(id) {
    const r = D().npcById?.[id]?.routine?.[ctx.time.phase];
    return r?.talk === false;
  }
  function pick(arr) { return arr?.length ? arr[Math.floor(Math.random() * arr.length)] : null; }

  /** Talk to a villager: quest lines first, then daily requests, then small talk (and their shop). */
  async function talkTo(npcId) {
    const npcData = D().npcById?.[npcId];
    if (!npcData) return;
    if (npcAsleep(npcId)) { env.toast('sys.npc.asleep', { name: env.t(npcData.nameKey) }); return; }
    const before = queue.length;
    const n = env.npc(npcId);
    try { n?.lookAt?.(env.playerPos()); } catch { /* optional */ }
    env.play('talk', { loop: false });
    const st = S().stats ||= {};
    st.talks = (st.talks | 0) + 1;
    ctx.bus.emit('npc:talk', { npcId });
    onEvent('npc:talk', { npcId });
    if (queue.length > before) { await drain(); return; }   // a quest completed: its lines are the conversation

    const step = current();
    // [Fix] a shopkeeper who gives you a task still offers the counter at the end ("Al mercato!": Gino's first
    // talk used to end without "Vediamo cosa c'è", so you had to talk to him twice to sell)
    const shopId = npcData.shop;
    const shopChoices = () => (shopId && sys().shops?.isOpen?.(shopId) ? [{ id: 'shop', labelKey: 'sys.npc.see_shop' }, { id: 'bye', labelKey: 'sys.npc.bye' }] : null);
    const toShop = choice => { if (choice === 'shop') sys().interact?.openShop?.(shopId); };
    if (step && step.npc === npcId && !Q().offered[step.id]) { toShop(await offer(step, shopChoices())); return; }
    for (const sq of D().sideQuests || []) {
      if (Q().side[sq.id] === 'active' && sq.npc === npcId && !Q().offered[sq.id]) { Q().offered[sq.id] = true; const ch = shopChoices(); toShop(await say(npcId, sq.dialogKeys.offer, ch ? { choices: ch } : {})); return; }
    }
    // [Fix] a daily request no longer ends the talk without choices: the shopkeeper's counter is offered under it
    // (Gino repeated "ha bisogno di 2 × Cavedano" about every other talk and you could not sell by day)
    const daily = await sys().dailies?.talk?.(npcId, { choices: shopChoices() });
    if (daily) { toShop(daily.choice); return; }
    const k = npcData.dialogKeys || {};
    const lines = [];
    if (step && step.npc === npcId) lines.push(pick(step.dialogKeys?.hint));
    else if (env.weather() === 'rain' || env.weather() === 'storm') lines.push(pick(k.rain));
    else if (ctx.time.phase === 'night') lines.push(pick(k.night));
    else if (flags().story_done && Math.random() < 0.3) lines.push(pick(k.legend));
    else lines.push(pick(Math.random() < 0.4 ? k.hello : k.chat));
    // shopkeepers offer their counter
    const ch = shopChoices();
    if (ch) toShop(await say(npcId, lines.filter(Boolean), { choices: ch }));
    else await say(npcId, lines.filter(Boolean));
  }
  function drain() { return new Promise(r => { const chk = () => (queue.length || running ? setTimeout(chk, 120) : r()); chk(); }); }

  // ---------------------------------------------------------------- notes in bottles
  function readBottle() {
    const notes = D().get?.('junk_bottle')?.notes || [];
    if (!notes.length) return;
    const st = S().stats ||= {};
    const i = (st.bottles | 0) % notes.length;
    st.bottles = (st.bottles | 0) + 1;
    say('letter', [notes[i]], { sfx: 'page_turn' });
  }

  const quests = {
    say, grant, matches, setFlag, talkTo, readBottle, onEvent,
    get queueLength() { return queue.length + (running ? 1 : 0); },
    get story() { return Q().story; },
    get current() { return current(); },
    isDone: id => !!Q().done[id],
    flag: f => !!flags()[f],
    /** Active goals for the HUD/quest sheet: story step, side quests, then dailies. */
    active() {
      const out = [];
      const step = current();
      if (step) {
        const p = Q().progress[step.id] || { count: 0 };
        out.push({ id: step.id, kind: 'story', titleKey: step.titleKey, goalKey: step.goalKey, npc: step.npc, marker: step.marker,
          n: p.count, count: step.goal?.count || 1, done: false, offered: !!Q().offered[step.id], index: Q().story, total: story().length });
      }
      for (const sq of D().sideQuests || []) {
        if (Q().side[sq.id] !== 'active') continue;
        const p = Q().progress[sq.id] || { count: 0 };
        out.push({ id: sq.id, kind: 'side', titleKey: sq.titleKey, goalKey: sq.goalKey, npc: sq.npc, marker: sq.marker, n: p.count, count: sq.goal?.count || 1, done: false });
      }
      for (const d of sys().dailies?.list?.() || []) out.push(d);
      return out;
    },
    get progress() { return Q().progress; },
    /** Debug: jump the story to a step id (marks earlier steps done without rewards). */
    jumpTo(id) {
      const i = story().findIndex(s => s.id === id);
      if (i < 0) return false;
      for (let k = 0; k < i; k++) Q().done[story()[k].id] = true;
      Q().story = i;
      ctx.save.commit();
      activate(current());
      return true;
    },
    update(dt) {
      quests._tickStart?.(dt);
      runQueue();
      // safety net: never leave the camera stuck in a close-up once no dialogue is on screen
      const rig = ctx.cameraRig;
      const talking = ctx.ui?.isOpen ? ctx.ui.isOpen() : dialogOpen;
      if (rig && (rig.mode === 'dialog' || rig.mode === 'cinematic') && !talking) {
        rig.setFocus?.(null);
        rig.setMode?.(sys().boat?.active ? 'boat' : sys().fishing?.busy ? 'fishing' : 'explore');
      }
      // zone tracker (in case World does not emit zone:enter)
      zoneT -= dt;
      if (zoneT <= 0) {
        zoneT = 1;
        const p = env.playerPos();
        const z = env.zoneAt(p.x, p.z);
        if (z && z !== lastZone && (ctx.world || env.zoneOverride)) { lastZone = z; onEvent('zone:enter', { zone: z }); }
      }
    },
  };

  // start (or resume) the story once the game is ready and a language was picked
  let started = false;
  function start() {
    if (started) return;
    started = true;
    const step = current();
    if (step) activate(step);
  }
  // (the letter waits until the title/language screens are closed)
  let ready = false, readyT = 1.0;
  ctx.bus.on('game:ready', () => { ready = true; });
  quests._tickStart = dt => {
    if (!ready || started) return;
    if (env.uiOpen()) { readyT = Math.max(readyT, 0.8); return; }
    readyT -= dt;
    if (readyT <= 0) start();
  };
  ctx.bus.on('save:loaded', e => { if (e?.reset) { queue.length = 0; started = false; start(); } });
  return quests;
}
