// Cooking [11 nov]: where does the player face and kneel? STATION=campfire|trattoria. Cooks the first ready recipe
// right there and films it from the side; logs the angle between facing and the fire / counter.
export default async function (play) {
  const ST = process.env.STATION || 'campfire';
  await play.onboard();
  const r = await play.eval(st => {
    const L = window.__lenza, c = L.ctx, W = c.world;
    const q = st === 'campfire' ? W.poi('home_campfire') : W.poi('village_trattoria');
    for (let i = 0; i < 3; i++) c.save.state.basket.push({ id: 'sardine', size: 14, price: 5, day: 1 });
    L.teleport(q.x + 1.5, q.z + 0.6, 0);
    window.__probeQ = q;
    return { q: [q.x, q.z] };
  }, ST);
  await play.step(20);
  const res = await play.eval(st => { const c = window.__lenza.ctx; const rec = (c.systems.cooking.list(st) || []).find(x => x.ok); return rec ? c.systems.cooking.cook(rec.id, st) : { ok: false, why: 'none ready' }; }, ST);
  await play.log('cook', JSON.stringify(res));
  await play.step(50);
  const f = await play.eval(q => { const P = window.__lenza.ctx.player, p = P.position; const want = Math.atan2(q[0] - p.x, q[1] - p.z); const d = Math.atan2(Math.sin(P.facing - want), Math.cos(P.facing - want)); return { facing: +P.facing.toFixed(2), want: +want.toFixed(2), off: +(d * 180 / Math.PI).toFixed(0) }; }, r.q);
  await play.log('facing', JSON.stringify(f));
  await play.expect(Math.abs(f.off) < 20, `${ST}: the player faces the ${ST === 'campfire' ? 'fire' : 'counter'}`, f);
  await play.eval(() => { const c = window.__lenza.ctx; c.cameraRig.playShot({ id: 'probe', target: c.player.object, yaw: Math.PI / 2, dist: 4.2, pitch: 14, height: 0.6, fov: 45, duration: 30, blendIn: 0.01, blendOut: 0.01 }, { force: true }); return true; });
  await play.step(10);
  await play.shot('side-' + ST);
}
