// Sleep in the tent by touch: going to bed happens behind the fade, and you wake up outside the tent walls,
// free to walk away (you used to wake inside and walk out through the canvas).
//   node tools/play.mjs tools/scenarios/sleep-tent.mjs [--landscape]
export default async function (play) {
  await play.onboard();
  await play.eval(() => { window.__lenza.ctx.time.skipTo?.(20); return true; });
  const door = await play.eval(() => window.__lenza.ctx.world.poi('home_door'));
  await play.eval((x, z) => window.__lenza.teleport(x + 2.5, z + 2.5), door.x, door.z);
  await play.step(20);
  // tier 0: the bed itself offers sleeping (reach 2.4 m, the tent walls stop you ~1.5 m from it)
  const bed = await play.eval(() => window.__lenza.ctx.world.poi('home_bed'));
  const r = await play.approach({ x: bed.x, z: bed.z, radius: 2.3 }, { expect: /sleep|bed/i, timeout: 15 });
  await play.expect(r.reached, 'the door offers going to bed', r.interact);
  if (!r.reached) return;
  await play.tapSel('.act');
  const slept = await play.waitFor(L => L.ctx.player.state === 'sleep', { timeout: 6 });
  await play.expect(!!slept, 'lying in bed');
  const back = await play.waitFor(L => L.ctx.player.state !== 'sleep' && L.ctx.input && !window.__lenza.ctx.systems.home?.busy, { timeout: 15 });
  await play.wait(3);
  const st = await play.state();
  const inside = await play.eval(() => { const c = window.__lenza.ctx, p = c.player.position; return c.world.colliders?.blockedAt?.(p.x, p.z, 0.2) ?? null; });
  await play.log('after waking', { pos: [st.player.x, st.player.z], inside, inputEnabled: st.inputEnabled });
  await play.expect(inside === false, 'woke up outside the tent walls', { inside });
  const w = await play.walkTo(door.x + 3, door.z + 3, { timeout: 8 });
  await play.expect(w.ok, 'walks away from the tent with the stick', { reason: w.reason });
  await play.shot('after-sleep');
}
