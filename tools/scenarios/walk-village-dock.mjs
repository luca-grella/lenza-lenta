// Walk from the spawn (home beach) to the village dock and onto it, with the joystick only.
//   node tools/play.mjs tools/scenarios/walk-village-dock.mjs [--landscape]
// Checks: onboarding by touch, the route to the beach at the root of the dock, stepping up onto the planks,
// walking to the end of the dock, never wading into the sea on the way.
const DOCK = { x: 58.5, z0: 39, z1: 62, y: 1.25 };   // src/world/layout.js VILLAGE.dock

export default async function (play) {
  await play.onboard({ lang: 'it' });
  await play.shot('start');

  // 1) to the beach right in front of the dock (planned on walkable ground, walked with the stick)
  const leg1 = await play.goTo(DOCK.x, DOCK.z0 - 2.5, { timeout: 60 });
  await play.expect(leg1.ok, 'reach the beach at the root of the village dock', { reason: leg1.reason, pos: leg1.pos });
  await play.expect(!leg1.wetSamples, 'stay out of the sea on the way', { wetSamples: leg1.wetSamples });
  await play.shot('dock-root');

  // 2) straight up onto the planks
  const on = await play.walkTo(DOCK.x, DOCK.z0 + 5, { timeout: 8, label: 'onto the dock' });
  const st = await play.state();
  await play.expect(on.ok && st.player.y > DOCK.y - 0.2, 'step onto the village dock', { reason: on.reason, pos: on.pos, y: st.player.y });
  await play.shot('on-dock');

  // 3) to the far end
  const end = await play.walkTo(DOCK.x, DOCK.z1 - 1.5, { timeout: 15, label: 'dock end' });
  const st2 = await play.state();
  await play.expect(end.ok && st2.player.y > DOCK.y - 0.2 && !end.wetSamples, 'walk to the end of the dock (on the planks)', { reason: end.reason, pos: end.pos });
  await play.log('action button at the dock end:', st2.action, 'interact:', st2.interact);
  const ov = await play.overlaps();
  if (ov.length) await play.issue('overlapping texts at the dock end: ' + JSON.stringify(ov));
  await play.shot('dock-end');
}
