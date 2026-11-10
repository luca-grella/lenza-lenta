// Boat by touch: from the home dock get on the boat with the on-screen buttons, row out with the stick, cast, catch.
// Reports which button offers "get on" and every step that does not work as a player would expect. LANG2=it|en.
const LANG = process.env.LANG2 || 'it';
export default async function (play) {
  await play.onboard({ lang: LANG });
  // the boat repaired (Tonio's quest), the player on the home dock next to it
  const b0 = await play.eval(() => {
    const L = window.__lenza, c = L.ctx;
    (c.save.state.flags ||= {}).boat_repaired = true;
    const p = c.systems.boat.position;
    L.teleport(4.2, p.z, -Math.PI / 2);
    return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
  });
  await play.step(30);
  await play.tapThroughDialogs?.({ firstWait: 0.3 });
  const btns = async () => play.eval(() => ({
    big: document.querySelector('.act')?.textContent?.trim(), side: [...document.querySelectorAll('.alt-btn:not(.empty)')].map(b => b.textContent.trim()),
    cur: window.__lenza.ctx.systems.interact.current?.kind, sec: window.__lenza.ctx.systems.interact.slots?.[3]?.kind }));
  let b = await btns();
  await play.log('next to the boat on the dock:', JSON.stringify(b), JSON.stringify(b0));
  await play.shot('dock-next-to-boat');
  const boardBig = b.cur === 'board', boardSide = b.sec === 'board';
  // [10 nov] the big button is for fishing: 'Get on' has its own fixed small button (place slot)
  await play.expect(boardBig || boardSide, 'next to the boat a button says get on (place slot)', b);
  if (boardBig) await play.tapSel('.act', { hold: 0.06, after: 0.1 });
  else if (boardSide) await play.tapSel('.slot-3');
  else { // walk right up to the boat and look again
    await play.joy(-0.6, 0, 0.5); b = await btns(); await play.log('closer:', JSON.stringify(b));
    if (b.cur === 'board') await play.tapSel('.act', { hold: 0.06, after: 0.1 }); else if (b.sec === 'board') await play.tapSel('.slot-3');
  }
  const on = await play.waitFor(L => L.ctx.systems.boat.active, { timeout: 4 });
  await play.expect(!!on, 'on the boat after tapping the button');
  if (!on) return;
  await play.step(60);
  // row out toward open sea (+z) with the stick, in screen space
  const rowTo = async (x, z, secs) => {
    const s = await play.eval(() => { const p = window.__lenza.ctx.systems.boat.position; return [p.x, p.y, p.z]; });
    const a = await play.project(s[0], s[1], s[2]), t = await play.project(x, s[1], z);
    const d = Math.hypot(t.x - a.x, t.y - a.y) || 1;
    await play.joy((t.x - a.x) / d, (t.y - a.y) / d, secs);
  };
  const p0 = await play.eval(() => window.__lenza.ctx.systems.boat.position.toArray());
  await rowTo(p0[0] - 4, p0[2] + 30, 6);
  // what the big button shows while the boat glides to a stop (a player taps right after letting go of the stick)
  const glide = [];
  for (let i = 0; i < 10; i++) { glide.push(await play.eval(() => { const c = window.__lenza.ctx; return `${c.systems.boat.speed.toFixed(1)}:${c.systems.interact.current?.kind || '-'}`; })); await play.step(30); }
  await play.log('gliding (speed:big button) every 0.5 s:', glide.join(' '));
  const first = glide.findIndex(g => g.endsWith(':cast'));
  if (first < 0 || first > 2) await play.issue(`after rowing the cast button needs ${first < 0 ? '>5' : first * 0.5} s of waiting: ${glide.join(' ')}`);
  await play.step(60);
  const p1 = await play.eval(() => { const B = window.__lenza.ctx.systems.boat; return { x: +B.position.x.toFixed(1), z: +B.position.z.toFixed(1), v: +B.speed.toFixed(2) }; });
  await play.log('rowed from', p0.map(v => +v.toFixed(1)).join(','), 'to', JSON.stringify(p1));
  await play.expect(Math.hypot(p1.x - p0[0], p1.z - p0[2]) > 4, 'the stick rows the boat', p1);
  b = await btns();
  await play.log('stopped at sea:', JSON.stringify(b));
  await play.shot('at-sea');
  await play.expect(b.cur === 'cast', 'at sea the big button offers casting', b);
  if (b.cur !== 'cast') return;
  const f = await play.press('action'); await play.step(30); await play.release(f);
  const wait = await play.waitFor(L => L.ctx.systems.fishing.state === 'wait', { timeout: 5 });
  await play.expect(!!wait, 'cast from the boat: bobber in the water', await play.eval(() => window.__lenza.ctx.systems.fishing.state));
  if (!wait) return;
  await play.shot('bobber-from-boat');
  const bite = await play.waitFor(L => L.ctx.systems.fishing.state === 'bite', { timeout: 90, every: 3 });
  await play.expect(!!bite, 'a bite from the boat');
  if (!bite) return;
  await play.tapSel('.act', { hold: 0.06, after: 0.05 });
  let held = null, t = 0;
  while (t < 90) {
    const r = await play.eval(() => { const F = window.__lenza.ctx.systems.fishing; return { s: F.state, tn: F.reel ? +F.reel.tensionN : 0 }; });
    if (!['strike', 'reel'].includes(r.s)) break;
    if (r.tn < 0.62 && held === null) held = await play.press('action');
    else if (r.tn > 0.8 && held !== null) { await play.release(held); held = null; }
    await play.step(3); t += 3 / 60;
  }
  if (held !== null) await play.release(held);
  const card = await play.waitFor(L => L.ctx.ui.currentSheet === 'catch', { timeout: 8 });
  await play.expect(!!card, 'fish caught from the boat (catch card)');
  await play.shot('catch-from-boat');
}
