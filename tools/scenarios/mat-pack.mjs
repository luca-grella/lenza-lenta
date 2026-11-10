// Pack up by touch [10 nov]: with a fish on the mat, the "hands" small button says pack up; tapping it rolls the mat
// (the fish goes into the basket) and the button goes away.
export default async function (play) {
  await play.onboard();
  await play.eval(() => {
    const L = window.__lenza, c = L.ctx;
    L.teleport(4.5, 80, 0);
    c.save.state.basket.push({ id: 'sardine', size: 14, price: 5, day: 1 });
    c.systems.mat.layCatch({ speciesId: 'sardine' }, null);
    return true;
  });
  await play.wait(6);   // unroll + lay chores
  await play.tapThroughDialogs({ firstWait: 0.5 });
  const s = await play.eval(() => { const c = window.__lenza.ctx, I = c.systems.interact; return { open: c.save.state.mat?.open, onMat: c.save.state.basket.filter(e => e.mat).length, s1: I.slots?.[1]?.kind, s2: I.slots?.[2]?.kind, b1: document.querySelector('.slot-1:not(.empty)')?.textContent?.trim() }; });
  await play.log('mat out', JSON.stringify(s));
  await play.shot('mat-out');
  await play.expect(s.open && s.s1 === 'pack', 'with the mat out the hands button says pack up', s);
  if (s.s1 !== 'pack') return;
  await play.tapSel('.slot-1');
  const done = await play.waitFor(L => !L.ctx.save.state.mat?.open, { timeout: 8 });
  await play.wait(2);
  const e = await play.eval(() => { const c = window.__lenza.ctx; return { open: c.save.state.mat?.open, onMat: c.save.state.basket.filter(x => x.mat).length, basket: c.save.state.basket.length, s1: c.systems.interact.slots?.[1]?.kind }; });
  await play.log('after', JSON.stringify(e));
  await play.shot('packed');
  await play.expect(!!done && !e.open && e.onMat === 0 && e.basket >= 1, 'the mat is rolled up and the fish is in the basket', e);
  await play.expect(e.s1 !== 'pack', 'the pack-up button is gone', e);
}
