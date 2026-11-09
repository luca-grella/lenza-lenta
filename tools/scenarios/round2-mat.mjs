// Round 2 by touch: onboard, walk out on the home dock, catch N fish (close-up seen before the card, Keep → mat),
// then clean one from the side button. LANG2=it|en, CATCHES=N.
const DOCK = { x: 4.5, z0: 64, z1: 84, y: 1.15 };
const LANG = process.env.LANG2 || 'en';
const N = +(process.env.CATCHES || 2);

export default async function (play) {
  await play.onboard({ lang: LANG });
  const walk = await play.walkPath([[DOCK.x, DOCK.z0 + 1.5], [DOCK.x, DOCK.z1 - 2]], { timeout: 25, label: 'home dock' });
  let st = await play.state();
  await play.expect(walk.ok && st.player.y > DOCK.y - 0.2, 'walk out on the home dock', { reason: walk.reason, pos: walk.pos });

  const faceSea = async () => {
    const s = await play.project(DOCK.x, DOCK.y, DOCK.z1 + 4), p = await play.project(st.player.x, st.player.y, st.player.z);
    const d = Math.hypot(s.x - p.x, s.y - p.y) || 1;
    await play.joy((s.x - p.x) / d * 0.3, (s.y - p.y) / d * 0.3, 0.2);
  };

  for (let k = 1; k <= N; k++) {
    st = await play.state();
    await faceSea();
    const cast = await play.waitFor(L => L.ctx.systems.interact.current?.kind === 'cast', { timeout: 4 });
    await play.expect(!!cast, `catch ${k}: the big button offers casting`, (await play.state()).interact);
    if (!cast) return;
    const f = await play.press('action'); await play.step(30); await play.release(f);
    await play.expect(!!(await play.waitFor(L => L.ctx.systems.fishing.state === 'wait', { timeout: 5 })), `catch ${k}: bobber in the water`);
    const bite = await play.waitFor(L => L.ctx.systems.fishing.state === 'bite', { timeout: 90, every: 3 });
    await play.expect(!!bite, `catch ${k}: a bite`);
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
    // the close-up must be on screen before the card covers it
    const landed = await play.waitFor(L => L.ctx.systems.fishing.state === 'landed', { timeout: 3 });
    if (landed) {
      await play.wait(1.5);
      st = await play.state();
      await play.expect(st.sheet !== 'catch', `catch ${k}: no card yet 1.5 s after landing (close-up visible)`, { sheet: st.sheet, camera: st.camera });
      if (k === 1) await play.shot('closeup-before-card');
    }
    const card = await play.waitFor(L => L.ctx.ui.currentSheet === 'catch', { timeout: 5 });
    await play.expect(!!card, `catch ${k}: the card opens`);
    if (!card) return;
    await play.step(30);
    if (k === 1) await play.shot('card');
    await play.tapSel('.keep');
    await play.step(90);
    await play.tapThroughDialogs({ firstWait: 1 });
    const onMat = await play.waitFor(L => L.ctx.player.mat?.fish?.length, { timeout: 8 });
    await play.expect(onMat >= k, `catch ${k}: fish on the mat`, { onMat });
    await play.wait(3); // chores and the mat close-up
  }
  await play.shot('mat-full');
  const ov = await play.overlaps();
  if (ov.length) await play.issue('overlapping texts with the mat out: ' + JSON.stringify(ov));

  // clean one from the side button (at the cast spot the big button keeps casting)
  await faceSea();
  const alt = await play.waitFor(L => !document.querySelector('.alt-btn')?.classList.contains('hidden') && document.querySelector('.alt-btn')?.textContent, { timeout: 4 });
  await play.log('side button:', alt);
  if (!alt) { await play.issue('no side button at the cast spot with fish on the mat'); return; }
  const before = await play.eval(() => window.__lenza.ctx.player.mat.fish.filter(f => f.clean).length);
  await play.tapSel('.alt-btn');
  // with different species on the mat a "which fish?" dialogue asks first: pick the first fish
  const asked = await play.waitFor(L => L.ctx.ui.isOpen?.() || document.querySelector('#ui')?.classList.contains('has-dialog'), { timeout: 2 });
  if (asked) await play.tapThroughDialogs({ firstWait: 1 });
  const cleaned = await play.waitFor((L, b) => L.ctx.player.mat.fish.filter(f => f.clean).length > b, { timeout: 15, arg: before });
  await play.log('side button was', alt);
  if (/clean|pulisci/i.test(alt)) await play.expect(!!cleaned, 'cleaning a fish from the side button');
  await play.shot('after-side-action');
  st = await play.state();
  await play.expect(st.inputEnabled && !st.dialog && !st.sheet, 'back in control at the end', { ui: st.ui, camera: st.camera });
}
