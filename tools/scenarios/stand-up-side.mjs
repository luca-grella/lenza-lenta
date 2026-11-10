export default async function (play) {
  await play.onboard();
  await play.eval(() => {
    const L = window.__lenza, c = L.ctx, P = c.player;
    const s = c.world.sitSpots.find(p => p.id === 'edge_home_2');
    c.save.state.settings.cinematics = true;
    L.teleport(s.x - 0.6, s.z); P.sitAt({ ...s, kind: 'edge' });
  });
  await play.step(200);
  await play.eval(() => { const c = window.__lenza.ctx; c.cameraRig.playShot({ id: 'probe', target: c.player.object, yaw: Math.PI / 2 + 0.45, dist: 3.4, pitch: 12, height: 0.4, fov: 40, duration: 30, blendIn: 0.01, blendOut: 0.01 }, { force: true }); return true; });
  await play.step(30);
  await play.log('state', await play.eval(() => { const c = window.__lenza.ctx; return { st: c.player.state, y: +c.player.position.y.toFixed(3), g: +c.world.groundY(c.player.position.x, c.player.position.z).toFixed(3) }; }));
  await play.shot('side-seated');
  await play.eval(() => { window.__lenza.ctx.player.standUp(); return true; });
  for (const k of [1, 2, 3, 4, 5, 6]) { await play.step(8); await play.log('y', k, await play.eval(() => { const c = window.__lenza.ctx; return [c.player.state, +c.player.position.y.toFixed(3)]; })); await play.shot('side-up-' + k); }
}
