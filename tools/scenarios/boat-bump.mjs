// Boat vs docks: from the home mooring row straight at the home dock (and along it) with the stick; the hull (bow,
// centre, stern) must never enter a dock/moored-boat collider. Also checks the map "You" marker follows the boat.
export default async function (play) {
  await play.onboard();
  await play.eval(() => { const c = window.__lenza.ctx; (c.save.state.flags ||= {}).boat_repaired = true; c.systems.boat.board(); return true; });
  await play.step(60);
  const hull = () => play.eval(() => {
    const c = window.__lenza.ctx, B = c.systems.boat, p = B.position, h = B.heading, L = 1.75;
    const pts = [[0, 0], [L, 0], [-L, 0]].map(([f]) => [p.x + Math.sin(h) * f, p.z + Math.cos(h) * f]);
    return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), bad: pts.filter(([x, z]) => !c.world.boatWaterOK(x, z)).length };
  });
  let h = await hull();
  await play.log('at the mooring', JSON.stringify(h));
  const rowTo = async (x, z, secs) => {
    const s = await play.eval(() => { const p = window.__lenza.ctx.systems.boat.position; return [p.x, p.y, p.z]; });
    const a = await play.project(s[0], s[1], s[2]), t = await play.project(x, s[1], z);
    const d = Math.hypot(t.x - a.x, t.y - a.y) || 1;
    await play.joyDown();
    for (const f of [0.35, 0.7, 1]) { await play.joyMove((t.x - a.x) / d * f, (t.y - a.y) / d * f); await play.step(1); }
    let worst = 0, maxX = -1e9;
    for (let i = 0; i < secs * 6; i++) { await play.step(10); const r = await hull(); worst = Math.max(worst, r.bad); maxX = Math.max(maxX, r.x); }
    await play.joyUp(); await play.step(30);
    return { worst, maxX };
  };
  // out a bit, then straight at the dock side, then along it toward the shore end
  await rowTo(h.x - 1.5, h.z - 6, 3);   // the home dock runs z 64..84 at x 4.5
  await play.log('out', JSON.stringify(await hull()));
  await play.expect(Math.hypot((await hull()).x - h.x, (await hull()).z - h.z) > 2, 'the boat leaves the mooring');
  const into = await rowTo(4.5, (await hull()).z, 5);
  await play.log('rowing into the dock', JSON.stringify(into), JSON.stringify(await hull()));
  await play.shot('against-dock');
  await play.expect(into.worst === 0 && into.maxX < 4.5 - 1.0, 'the boat stops at the dock side (hull never inside)', into);
  const z0 = (await hull()).z;
  const along = await rowTo(3.2, z0 - 12, 4);
  await play.expect(along.worst === 0, 'rowing along the dock: hull never inside', along);
  // map marker follows the boat
  const m = await play.eval(() => { const c = window.__lenza.ctx, A = c.ui?.adapter || null; const B = c.systems.boat; return { boat: [+B.position.x.toFixed(1), +B.position.z.toFixed(1)], player: [+c.player.position.x.toFixed(1), +c.player.position.z.toFixed(1)] }; });
  await play.log('positions', JSON.stringify(m));
  await play.eval(() => window.__lenza.ctx.ui.sheet('map') && true);
  await play.step(30);
  const mk = await play.eval(() => { const e = document.querySelector('.mk-player'); return e && !e.classList.contains('hidden') ? e.style.transform : null; });
  await play.log('map marker', mk);
  await play.shot('map-on-boat');
}
