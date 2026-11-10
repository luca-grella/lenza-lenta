// EDGE=<sit spot id> (default edge_home_2); STICK=1 stands up with the joystick like a player, else via standUp().
export default async function (play) {
  const EDGE = process.env.EDGE || 'edge_home_2';
  await play.onboard();
  await play.eval((EDGE) => {
    const L = window.__lenza, c = L.ctx, P = c.player;
    const s = c.world.sitSpots.find(p => p.id === EDGE);
    c.save.state.settings.cinematics = true;
    L.teleport(s.x - 0.6, s.z); P.sitAt({ ...s, kind: 'edge' });
  }, EDGE);
  await play.log('edges', await play.eval(() => window.__lenza.ctx.world.sitSpots.filter(p => p.id.startsWith('edge_')).map(p => p.id).join(' ')));
  await play.step(200);
  await play.eval(() => { const c = window.__lenza.ctx; c.cameraRig.playShot({ id: 'probe', target: c.player.object, yaw: Math.PI / 2 + 0.45, dist: 3.4, pitch: 12, height: 0.4, fov: 40, duration: 30, blendIn: 0.01, blendOut: 0.01 }, { force: true }); return true; });
  await play.step(30);
  await play.log('state', await play.eval(() => { const c = window.__lenza.ctx; return { st: c.player.state, y: +c.player.position.y.toFixed(3), g: +c.world.groundY(c.player.position.x, c.player.position.z).toFixed(3) }; }));
  await play.shot('side-seated');
  if (process.env.STICK) { await play.joyDown(); await play.joyMove(0, -0.8); }
  else await play.eval(() => { window.__lenza.ctx.player.standUp(); return true; });
  for (const k of [1, 2, 3, 4, 5, 6]) { await play.step(8); await play.log('y', k, await play.eval(() => { const c = window.__lenza.ctx; return [c.player.state, +c.player.position.y.toFixed(3)]; })); await play.shot('side-up-' + k); }
  if (process.env.STICK) await play.joyUp();
}
