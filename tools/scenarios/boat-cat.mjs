// [11 nov] Biscotto on the boat: a friend cat near the dock hops in when the player gets on, rides on the bow boards
// facing the rower (above the floor, inside the hull outline), moves with the boat, and hops off with the player.
export default async function (play) {
  await play.onboard();
  await play.eval(() => {
    const L = window.__lenza, c = L.ctx;
    (c.save.state.flags ||= {}).boat_repaired = true;
    c.save.state.cat = { ...(c.save.state.cat || {}), befriended: true, following: true, friend: 3 };
    const p = c.systems.boat.position;
    L.teleport(4.2, p.z, -Math.PI / 2);
    c.creatures?.cat?.teleport?.(5.2, p.z + 0.8);
    return true;
  });
  await play.step(40);
  await play.tapThroughDialogs?.({ firstWait: 0.3 });
  const sec = await play.eval(() => window.__lenza.ctx.systems.interact.slots?.[3]?.kind);
  if (sec === 'board') await play.tapSel('.slot-3'); else await play.eval(() => { window.__lenza.ctx.systems.boat.board(); return true; });
  const on = await play.waitFor(L => L.ctx.systems.boat.active, { timeout: 4 });
  await play.expect(!!on, 'on the boat');
  await play.step(60);
  const where = () => play.eval(() => {
    const c = window.__lenza.ctx, cat = c.creatures.cat, B = c.systems.boat, root = B.group;
    const local = root.worldToLocal(cat.object.position.clone());
    return { aboard: cat.aboard, local: local.toArray().map(v => +v.toFixed(2)), boat: [B.position.x, B.position.z].map(v => +v.toFixed(1)) };
  });
  let w = await where();
  await play.log('aboard', JSON.stringify(w));
  await play.expect(w.aboard, 'Biscotto hops on the boat', w);
  await play.expect(Math.abs(w.local[0]) < 0.3 && w.local[1] > -0.15 && w.local[2] > 0.8 && w.local[2] < 1.4, 'sits on the bow boards, not in the hull', w.local);
  await play.shot('cat-on-board');
  await play.joy(0.2, -1, 4); await play.step(60);
  const w2 = await where();
  await play.log('after rowing', JSON.stringify(w2));
  await play.expect(w2.boat.join() !== w.boat.join() && Math.abs(w2.local[2] - w.local[2]) < 0.05, 'rides along with the boat', w2);
  const pet = await play.eval(() => window.__lenza.ctx.systems.interact.slots?.[1]?.kind || null);
  await play.expect(pet !== 'pet', 'no pet button from the boat', pet);
  await play.shot('rowing-with-cat');
  // back to the dock and off
  await play.eval(() => { const c = window.__lenza.ctx; c.systems.boat.moor('home'); return true; });
  await play.step(10);
  await play.eval(() => { window.__lenza.ctx.systems.boat.leave(); return true; });
  await play.step(30);
  const off = await play.eval(() => { const c = window.__lenza.ctx, cat = c.creatures.cat, p = c.player.position, q = cat.object.position; return { aboard: cat.aboard, d: +Math.hypot(p.x - q.x, p.z - q.z).toFixed(2), walk: !!c.world.walkable?.(q.x, q.z) }; });
  await play.log('off', JSON.stringify(off));
  await play.expect(!off.aboard && off.d > 0.4 && off.d < 3.5 && off.walk, 'hops off beside the player, on walkable ground', off);
}
