// First minute of a new game, by touch only: language, title, grandpa's letter, walk onto the home dock,
// cast (hold + release the action button), strike on the bite, reel by holding/releasing on the tension,
// keep the fish from the catch card.
//   node tools/play.mjs tools/scenarios/fish-home-dock.mjs [--landscape] [--speed 2]
const DOCK = { x: 4.5, z0: 64, z1: 84, y: 1.15 };   // src/world/layout.js HOME_DOCK (runs south into the sea)

export default async function (play) {
  await play.onboard({ lang: 'it' });

  // onto the home dock and out toward its end (the stick only)
  const walk = await play.walkPath([[DOCK.x, DOCK.z0 + 1.5], [DOCK.x, DOCK.z1 - 2]], { timeout: 20, label: 'home dock' });
  let st = await play.state();
  await play.expect(walk.ok && st.player.y > DOCK.y - 0.2, 'walk out on the home dock', { reason: walk.reason, pos: walk.pos });
  // face the open sea: a short nudge of the stick toward +z (south) through the camera
  const s = await play.project(DOCK.x, DOCK.y, DOCK.z1 + 4), p = await play.project(st.player.x, st.player.y, st.player.z);
  const d = Math.hypot(s.x - p.x, s.y - p.y) || 1;
  await play.joy((s.x - p.x) / d * 0.3, (s.y - p.y) / d * 0.3, 0.2);
  const cast = await play.waitFor(L => L.ctx.systems.interact.current?.kind === 'cast', { timeout: 3 });
  st = await play.state();
  await play.expect(!!cast, 'the action button offers casting at the dock end', { action: st.action, interact: st.interact });
  await play.shot('ready-to-cast');

  // hold to charge, release around half power
  const finger = await play.press('action');
  await play.step(30);
  st = await play.state();
  await play.expect(st.fishing.state === 'charge', 'holding the button charges the cast', st.fishing);
  await play.shot('charging');
  await play.release(finger);
  const waiting = await play.waitFor(L => L.ctx.systems.fishing.state === 'wait', { timeout: 4 });
  await play.expect(!!waiting, 'the bobber lands in the water', (await play.state()).fishing);
  await play.shot('waiting');

  // wait for the bite, then strike with a tap
  const bite = await play.waitFor(L => L.ctx.systems.fishing.state === 'bite', { timeout: 60, every: 3 });
  await play.expect(!!bite, 'a fish bites within 60 s');
  if (!bite) return;
  await play.shot('bite');
  await play.tapSel('.act', { hold: 0.06, after: 0.05 });

  // reel: keep the finger down while the line is slack, lift it when the tension gets high (what a player watches)
  let held = null, t = 0;
  while (t < 90) {
    const f = await play.eval(() => { const F = window.__lenza.ctx.systems.fishing; return { s: F.state, tn: F.reel ? +F.reel.tensionN : 0 }; });
    if (!['strike', 'reel'].includes(f.s)) break;
    if (f.tn < 0.62 && held === null) held = await play.press('action');
    else if (f.tn > 0.8 && held !== null) { await play.release(held); held = null; }
    await play.step(3); t += 3 / 60;
    if (Math.abs(t - 3) < 0.03) await play.shot('reeling');
  }
  if (held !== null) await play.release(held);
  st = await play.state();
  await play.log('after reeling:', st.fishing, st.toasts);

  const card = await play.waitFor(L => L.ctx.ui.currentSheet === 'catch', { timeout: 4 });
  await play.expect(!!card, 'the catch card opens', { fishing: st.fishing, toasts: st.toasts });
  if (!card) return;
  await play.step(30);
  await play.shot('catch-card');
  await play.tapText('Tieni');
  await play.step(60);
  st = await play.state();
  await play.expect(st.basket === 1 && !st.sheet, 'the fish is in the basket and the card is closed', { basket: st.basket, sheet: st.sheet });
  await play.step(30);
  await play.shot('after-catch');
  const taps = await play.tapThroughDialogs();   // grandpa's letter comments the first fish
  st = await play.state();
  await play.expect(!st.dialog && st.inputEnabled, 'back in control after the first-fish letter', { taps, ui: st.ui, goal: st.goal });
  const ov = await play.overlaps();
  if (ov.length) await play.issue('overlapping texts after the first catch: ' + JSON.stringify(ov));
  await play.log('final', await play.state());
}
