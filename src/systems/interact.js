// Interact: decides the context action every frame and exposes it for the UI action button.
//   ctx.systems.interact.current → {id, kind, labelKey, labelVars, label, icon, hold?, run()} | null
// Sources: villagers, shop counters, aquarium, bed, campfire, benches, forage spots, the boat, the treasure chest,
// the cat, World's own interactables (world.interactables.nearest) and finally Cast when there is water ahead.
// Space / the action button runs it (fishing reads the held action itself); E (interact) runs it too.
// register({id, kind, pos | getPos(), radius, labelKey, icon, enabled(), run(), priority}) adds custom entries.
// Sitting is owned here (World's own 'sit' interactables and Creatures' 'cat' one are skipped, so there is one
// code path): benches and edges are POIs with kind 'bench' | 'edge'; on an edge (dock end, pond) the action button
// casts from the seat; the stick (or the button, on a bench) stands up. Petting/feeding the cat first walks the
// player next to it (systems/cat.js).

const SHOP_POI = { bottega: 'village_bottega', pescheria: 'village_pescheria', falegname: 'village_falegname', trattoria: 'village_trattoria', aquarium: 'village_aquarium' };

export function createInteract(ctx, env) {
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};
  const custom = new Map();
  let current = null;
  let secondary = null;  // a second, smaller choice next to the action button (sit on the dock edge while Cast is the main action)
  let sitting = null;   // {q, kind:'bench'|'edge', seated}
  let cooldown = 0;
  let poiCache = null, poiT = 0;

  function label(entry) {
    entry.label = entry.labelKey ? env.t(entry.labelKey, entry.labelVars) : '';
    return entry;
  }

  function pois() {
    if (poiCache && poiT > 0) return poiCache;
    poiT = 3;
    const list = [];
    for (const [shopId, poiId] of Object.entries(SHOP_POI)) { const p = env.poi(poiId); if (p) list.push({ type: 'shop', shopId, ...p }); }
    const bed = env.poi('home_bed'); if (bed) list.push({ type: 'bed', ...bed });
    const fire = env.poi('home_campfire'); if (fire) list.push({ type: 'campfire', ...fire });
    const chest = env.poi('treasure'); if (chest) list.push({ type: 'chest', ...chest });
    // seats: every POI World marks as bench / edge (dock ends, the pond), plus bench_* ids without a kind
    const seen = new Set();
    for (const b of [...env.listPois(''), ...env.listPois('bench_')]) {
      const k = b.raw?.kind;
      if (seen.has(b.id) || !(k === 'bench' || k === 'edge' || (!k && b.id.startsWith('bench_')))) continue;
      seen.add(b.id);
      list.push({ type: 'bench', seat: k === 'edge' ? 'edge' : 'bench', ...b });
    }
    poiCache = list;
    return list;
  }

  function npcEntry(n, p) {
    const id = n.id || n.data?.id;
    const o = n.object;
    if (!id || !o) return null;
    const d = Math.hypot(o.position.x - p.x, o.position.z - p.z);
    if (d > 2.6) return null;
    const rec = D().npcById?.[id];
    if (!rec) return null;
    if (rec.routine?.[ctx.time.phase]?.talk === false) return null;
    return { id: 'npc:' + id, kind: 'talk', npcId: id, d, at: o.position, priority: 3, icon: 'talk', labelKey: 'sys.act.talk', labelVars: { name: env.t(rec.nameKey) }, run: () => sys().quests?.talkTo?.(id) };
  }

  function candidates(p) {
    const out = [];
    const boat = sys().boat;
    const fishing = sys().fishing;
    // on the boat: only leaving (and casting below)
    if (boat?.active) {
      // the landing competes with casting by direction: facing the shore → leave, facing open water → cast
      const ls = boat.speed < 1.2 && (boat.landingSpot?.() || (boat.canLeave() ? p : null));
      if (ls) out.push({ id: 'boat:leave', kind: 'leave_boat', d: Math.min(1.2, Math.hypot(ls.x - p.x, ls.z - p.z) * 0.3), at: ls, priority: 2, icon: 'leave', labelKey: 'sys.act.leave_boat', run: () => boat.leave() });
      return out;
    }
    // villagers
    for (const n of env.npcList()) { const e = npcEntry(n, p); if (e) out.push(e); }
    const npcNear = shopId => {
      const nid = D().shops?.[shopId]?.npc;
      const n = nid && env.npc(nid);
      return n?.object && out.some(e => e.npcId === nid);
    };
    // fixed places
    for (const q of pois()) {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (q.type === 'shop') {
        if (d > 3.2) continue;
        if (q.shopId === 'aquarium') {
          const n = sys().aquarium?.donatable?.().length || 0;
          out.push({ id: 'shop:aquarium', kind: n ? 'donate' : 'shop', shopId: 'aquarium', d, at: q, priority: 2, icon: n ? 'donate' : 'aquarium',
            labelKey: n ? 'sys.act.donate' : 'sys.act.aquarium', labelVars: { n }, run: () => (n ? donate() : openShop('aquarium')) });
          continue;
        }
        if (npcNear(q.shopId)) continue; // talking to the shopkeeper covers the counter
        if (q.shopId === 'pescheria') {
          const n = S().basket?.length || 0;
          out.push({ id: 'shop:pescheria', kind: 'sell', shopId: 'pescheria', d, at: q, priority: 2, icon: 'sell', labelKey: n ? 'sys.act.sell' : 'sys.act.shop_name', labelVars: { n, name: env.t('shop.pescheria.name') }, run: () => openShop('pescheria') });
        } else out.push({ id: 'shop:' + q.shopId, kind: 'shop', shopId: q.shopId, d, at: q, priority: 2, icon: q.shopId === 'trattoria' ? 'cook' : 'shop', labelKey: 'sys.act.shop_name', labelVars: { name: env.t(D().shops?.[q.shopId]?.nameKey || q.shopId) }, run: () => openShop(q.shopId) });
      } else if (q.type === 'bed' && d < 2.4) {
        const k = sys().home?.sleepKind?.() || 'sleep';
        out.push({ id: 'bed', kind: 'sleep', d, at: q, priority: 2, icon: 'sleep', labelKey: k === 'sleep' ? 'sys.act.sleep' : 'sys.act.nap', run: () => sys().home?.sleep?.() });
      } else if (q.type === 'campfire' && d < 2.4) {
        out.push({ id: 'campfire', kind: 'cook', d, at: q, priority: 2, icon: 'cook', labelKey: 'sys.act.cook', run: () => openCook('campfire') });
      } else if (q.type === 'chest' && d < 2.2 && !S().flags?.treasure_open) {
        out.push({ id: 'chest', kind: 'chest', d, at: q, priority: 2, icon: 'treasure', labelKey: 'sys.act.open_chest', run: () => openChest() });
      } else if (q.type === 'bench' && d < (q.seat === 'edge' ? 2.3 : 1.9)) {   // an edge seat lies at the very rim, the planks end ~1.9 m before it; a bench seat point is inside its collider
        const edge = q.seat === 'edge';
        out.push({ id: 'bench:' + q.id, kind: 'sit', seat: q.seat, d, at: q, priority: edge ? 2.4 : 1, icon: 'sit', labelKey: edge ? 'sys.act.sit_edge' : 'sys.act.sit', run: () => sit(q) });
      }
    }
    // dock-edge sit spots along the sides (World.sitSpots): never stronger than Cast, so they mostly show up as the
    // secondary button; the dock-end / pond seats above are primary
    const ss = ctx.world?.nearestSitSpot?.(p, 1.3);
    if (ss) {
      const d = Math.hypot(ss.x - p.x, ss.z - p.z);
      const q = { type: 'bench', seat: 'edge', id: ss.id, x: ss.x, z: ss.z, y: ss.y, facing: ss.facing, raw: ss };
      out.push({ id: 'seat:' + ss.id, kind: 'sit', seat: 'edge', side: true, d, at: ss, priority: 1.2, icon: 'sit', labelKey: 'sys.act.sit_edge', run: () => sit(q) });
    }
    // forage
    const f = sys().foraging?.nearest?.(p, 1.6);
    if (f) out.push({ id: 'forage:' + f.id, kind: 'pick', d: Math.hypot(f.x - p.x, f.z - p.z), at: f, priority: 2.5, icon: 'pick', labelKey: 'sys.act.pick', labelVars: { item: env.itemName(f.itemId) }, run: () => sys().foraging.pick(f.id) });
    // boat
    if (boat?.object?.visible) {
      const d = boat.distanceTo(p);
      if (d < 3.0) {
        if (boat.unlocked) out.push({ id: 'boat:board', kind: 'board', d, at: boat.position, priority: 2.2, icon: 'board', labelKey: 'sys.act.board', run: () => boat.board() });
        else out.push({ id: 'boat:inspect', kind: 'inspect', d, at: boat.position, priority: 1.2, icon: 'boat', labelKey: 'sys.act.inspect_boat', run: () => env.toast('sys.boat.broken') });
      }
    }
    // cat
    const cp = sys().cat?.position?.();
    if (cp && !sys().cat?.approaching) {
      const d = Math.hypot(cp.x - p.x, cp.z - p.z);
      if (d < 2.4) {   // the player walks up to the cat before feeding/petting (systems/cat.js)
        const cat = sys().cat;
        const fish = (S().basket || []).some(e => D().get?.(e.id)?.kind === 'fish');
        if (!cat.befriended && fish) out.push({ id: 'cat', kind: 'feed_cat', d, at: cp, priority: 2.2, icon: 'paw', labelKey: 'sys.act.feed_cat', run: () => cat.feed() });
        else out.push({ id: 'cat', kind: 'pet', d, at: cp, priority: 1.5, icon: 'pet', labelKey: 'sys.act.pet', run: () => cat.pet() });
      }
    }
    // World-registered interactables
    try {
      const w = ctx.world?.interactables?.nearest?.(p, { filter: it => !WORLD_SKIP.has(it.kind) && it.id !== 'cat' });
      if (w && (w.enabled?.() ?? true)) {
        const wp = w.pos || w.position;
        const d = wp ? Math.hypot(wp.x - p.x, wp.z - p.z) : 0;
        if (!wp || d <= (w.radius || 2)) out.push({ id: 'world:' + w.id, kind: w.kind || 'use', d, at: wp, priority: w.priority ?? 2, icon: w.icon || 'hand', labelKey: w.labelKey || 'sys.act.use', labelVars: w.labelVars, run: () => w.onInteract?.(ctx) });
      }
    } catch (e) { /* world registry optional */ }
    // custom
    for (const c of custom.values()) {
      if (c.enabled && !c.enabled()) continue;
      const cpos = c.getPos ? c.getPos() : c.pos;
      if (!cpos) continue;
      const d = Math.hypot(cpos.x - p.x, cpos.z - p.z);
      if (d <= (c.radius || 2)) out.push({ ...c, d, at: cpos, priority: c.priority ?? 2 });
    }
    return out;
  }

  /** Score = priority, minus distance, minus how far you'd have to turn to face it. Cast competes with CAST_SCORE. */
  const CAST_SCORE = 2.6;
  const SOFT = new Set(['sit', 'talk', 'pet', 'inspect', 'use']);
  /** World interactables Systems handles itself (seats, the cat). */
  const WORLD_SKIP = new Set(['sit', 'pet']);
  function choose(list, p, castOK) {
    const face = env.playerFacing();
    let best = null, bs = castOK ? CAST_SCORE : -Infinity;
    for (const e of list) {
      let off = 0;
      if (e.at && e.d > 0.6) off = Math.abs(Math.atan2(Math.sin(Math.atan2(e.at.x - p.x, e.at.z - p.z) - face), Math.cos(Math.atan2(e.at.x - p.x, e.at.z - p.z) - face)));
      let s = e.priority * 2 - e.d - off * 1.1;
      // [Fix] facing open water, casting wins over idle chores (sit, talk, pet...) unless the target is right in front and close
      // ...except a dock-edge seat: sitting there is how you fish seated (the button then casts from the seat)
      if (castOK && SOFT.has(e.kind) && !(e.seat === 'edge' && !e.side) && !(off < 0.35 && e.d < 1.1)) s = Math.min(s, CAST_SCORE - 0.01);
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }

  // ---------------------------------------------------------------- actions
  function openShop(shopId) {
    const shop = D().shops?.[shopId];
    if (!shop) return;
    if (shopId !== 'pescheria' && shopId !== 'aquarium' && !sys().shops?.isOpen?.(shopId)) {
      env.toast('sys.shop.closed', { name: env.t(shop.nameKey) });
      return;
    }
    if (shopId === 'pescheria' && !sys().shops?.isOpen?.(shopId)) env.toast('sys.shop.honesty');
    env.sfx('door', { vol: 0.5 });
    if (env.ui()?.sheet) env.sheet('shop', { shopId });
    else if (shopId === 'pescheria') sys().shops?.sell?.('all');
  }
  function openCook(station) {
    if (env.ui()?.sheet) env.sheet('cook', { station });
    else {
      const r = sys().cooking?.list?.(station)?.find(x => x.ok);
      if (r) sys().cooking.cook(r.id, station); else env.toast('sys.cook.nothing');
    }
  }
  function donate() {
    const ids = sys().aquarium?.donateAll?.() || [];
    if (ids.length) sys().quests?.say?.('marta', [{ key: 'sys.aquarium.thanks', vars: { n: ids.length } }]);
  }
  function openChest() {
    const inv = sys().inventory;
    if (!inv?.has?.('junk_key')) { env.toast('sys.chest.locked'); env.sfx('door', { pitch: 0.6, vol: 0.5 }); return; }
    const tr = D().treasure;
    inv.remove('junk_key', 1);
    S().flags ||= {}; S().flags.treasure_open = true;
    env.play('crouch_pick', { loop: false });
    env.sfx('door', { pitch: 0.8 });
    env.sfx('rare_jingle', { delay: 0.5 });
    const text = sys().quests?.grant?.(tr?.reward, { silent: true }) || '';
    sys().quests?.say?.('letter', [tr?.textKey || 'treasure.open']);
    env.banner('sys.chest.opened', 'treasure.name');
    if (text) env.toast('sys.reward.got', { what: text });
    ctx.save.commit();
    ctx.bus.emit('flag:set', { flag: 'treasure_open' });
    ctx.bus.emit('treasure:open', { id: 'treasure' });
  }
  function sit(q) {
    const pl = env.player();
    const seat = { q, kind: q.seat || (q.raw?.kind === 'edge' ? 'edge' : 'bench'), seated: false };
    sitting = seat;
    cooldown = 0.6;
    env.setPlayerState('sit');
    let r = null;
    try { r = pl.sitAt?.(q.raw || q); } catch (e) { console.warn('[interact] sitAt', e); }
    if (!pl.sitAt) env.play('sit_down', { loop: false });
    // sitAt walks to the seat, then sits (Promise<true>); false = it could not
    Promise.resolve(r).then(ok => {
      if (sitting !== seat) return;
      if (ok === false) { sitting = null; env.setPlayerState('idle'); return; }
      seat.seated = true;
      ctx.bus.emit('player:sit', { id: q.id, kind: seat.kind });
      try { env.ui()?.onboarding?.show?.(seat.kind === 'edge' ? 'sit_edge' : 'sit_bench', seat.kind === 'edge' ? 'ui.tip.sit_edge' : 'ui.tip.sit_bench', { ms: 9000 }); } catch { /* UI optional */ }
    });
  }
  function standUp() {
    if (!sitting) return;
    sitting = null;
    try { env.player().standUp?.(); } catch (e) { console.warn('[interact] standUp', e); }
    env.setPlayerState('idle');
    ctx.bus.emit('player:stand', {});
  }

  const interact = {
    /** Current context action (or null). */
    get current() { return current; },
    get sitting() { return !!sitting; },
    /** Second, smaller choice for the UI (e.g. sit on the dock edge while the main button casts), or null. */
    get secondary() { return secondary; },
    runSecondary() { if (secondary?.run && cooldown <= 0) { cooldown = 0.35; const r = secondary.run; secondary = null; r(); return true; } return false; },
    /** 'bench' | 'edge' while seated (or walking to the seat), else null. */
    get sittingKind() { return sitting?.kind || null; },
    openShop, openCook, standUp,
    register(entry) { custom.set(entry.id, entry); return () => custom.delete(entry.id); },
    unregister(id) { custom.delete(id); },
    /** Run the current action (UI may call this for non-hold actions). */
    run() { if (current?.run && !current.disabled) { cooldown = 0.35; current.run(); return true; } return false; },
    update(dt) {
      poiT -= dt; cooldown -= dt;
      const fishing = sys().fishing;
      secondary = null;
      if (env.busy.sleep || env.uiOpen()) { current = null; return; }
      if (fishing?.busy) { current = label({ id: 'fishing', ...fishing.actionInfo() }); if (!current.labelKey) current.label = ''; return; }
      const input = ctx.input;
      // sitting: the stick stands up; on a bench the button too, on an edge the button casts (fishing reads it)
      if (sitting) {
        const pl = env.player();
        if (sitting.seated && pl.seated === null) { sitting = null; }   // stood up by something else (sleep, boat, teleport)
        else {
          const down = sitting.seated || (pl.seated && pl.seated === sitting.kind);   // on the seat (sit_down may still be playing)
          const castHere = sitting.kind === 'edge' && down && !!fishing?.aim && !fishing.aim.reason;
          current = castHere
            ? label({ id: 'cast', kind: 'cast', icon: 'cast', hold: true, labelKey: 'sys.act.cast', run: () => {} })
            : label({ id: 'stand', kind: 'stand', icon: 'stand', labelKey: 'sys.act.stand', run: standUp });
          // casting from the seat: "Alzati" moves to the small side button (the stick stands up too)
          if (castHere) secondary = label({ id: 'stand', kind: 'stand', icon: 'stand', labelKey: 'sys.act.stand', run: standUp });
          if ((input.move?.mag || 0) > 0.3 && cooldown <= 0) standUp();
          else if (!castHere && (input.action.down || input.pressed('interact')) && cooldown <= 0) { cooldown = 0.35; standUp(); }
          return;
        }
      }
      const p = env.playerPos();
      const castOK = !!fishing?.aim && !fishing.aim.reason;
      const list = candidates(p);
      const pick = choose(list, p, castOK);
      if (pick) current = label(pick);
      else if (fishing?.aim) current = label({ id: 'cast', kind: 'cast', icon: 'cast', hold: true, labelKey: fishing.aim.reason === 'dark' ? 'sys.act.too_dark' : 'sys.act.cast', disabled: fishing.aim.reason === 'dark', run: () => {} });
      else current = null;
      // casting is the main action but a seat is right here: offer it on the small side button
      const seat = (!current || current.kind === 'cast') ? list.filter(e => e.kind === 'sit').sort((a, b) => a.d - b.d)[0] : null;
      secondary = seat ? label({ ...seat }) : null;
      // run non-fishing actions on Space / action button tap, or E
      if (current && current.kind !== 'cast' && cooldown <= 0 && (input.action.down || input.pressed('interact'))) {
        cooldown = 0.35;
        try { current.run(); } catch (e) { console.warn('[interact] action failed', e); }
      }
    },
  };
  ctx.bus.on('save:loaded', () => { poiCache = null; });
  return interact;
}
