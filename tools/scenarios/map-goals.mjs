// Map goal pins for every story step (offered and not yet offered) and the side quests: logs where each pin lands
// and what is there (nearest villager / place), so a pin on an empty spot shows up.
export default async function (play) {
  await play.onboard();
  const rows = await play.eval(async () => {
    const L = window.__lenza, c = L.ctx, Q = c.systems.quests;
    const m = await import('/src/ui/sheets/map.js');
    m.default.length; // module loaded
    const gt = m._goalTargets; gt.ctx = c;
    const poiPos = id => { const p = c.world.poi?.(id); return p && typeof p.x === 'number' ? p : null; };
    const near = (x, z) => {
      let best = null, bd = 1e9;
      for (const n of c.npcs.list) { const id = n.id; const p = n.object.position; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = 'npc:' + id; } }
      for (const q of c.world.poiList('')) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = 'poi:' + q.id; } }
      return `${best} ${bd.toFixed(1)}m`;
    };
    const out = [];
    for (const s of c.data.quests) {
      Q.jumpTo(s.id);
      for (const offered of [false, true]) {
        c.save.state.quests.offered[s.id] = offered;
        const t = gt(poiPos).filter(p => p.quest === s.id);
        out.push(`${s.id} offered=${offered} npc=${s.npc} event=${s.goal?.event} marker=${s.marker} → ` + (t.length ? t.map(p => `(${p.x.toFixed(0)},${p.z.toFixed(0)}) ${near(p.x, p.z)}`).join(' ; ') : 'NO PIN'));
      }
    }
    const S = c.save.state.quests;
    S.side.q_side_treasure = 'active';
    for (const offered of [false, true]) {
      S.offered.q_side_treasure = offered;
      const t = gt(poiPos).filter(p => p.quest === 'q_side_treasure');
      out.push(`q_side_treasure offered=${offered} → ` + t.map(p => `(${p.x.toFixed(0)},${p.z.toFixed(0)}) ${near(p.x, p.z)} "${p.titleKey}"`).join(' ; '));
    }
    return out;
  });
  for (const r of rows) await play.log(r);
}
