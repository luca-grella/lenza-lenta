// Settings › Camera distance by touch: Medium is the default, Close and Far change the play camera.
//   node tools/play.mjs tools/scenarios/camera-distance.mjs [--landscape] [--lang en]
export default async function (play) {
  await play.onboard();
  const dist = () => play.eval(() => { const c = window.__lenza.ctx; return +c.cameraRig.camera.position.distanceTo(c.player.position).toFixed(2); });
  await play.step(120);
  const d0 = await dist();
  await play.expect(!(await play.eval(() => window.__lenza.ctx.save.state.settings.camDist)), 'default is Medium (no setting saved)');
  const label = { it: ['Vicina', 'Lontana'], en: ['Close', 'Far'] }[play.lang];
  const out = {};
  for (const [i, v] of [[0, 'near'], [1, 'far']]) {
    for (const ok of ['Ok!', 'Got it!']) await play.tapText(ok, { optional: true, exact: true });   // an onboarding tip may be up
    await play.eval(() => { window.__lenza.ctx.ui.sheet('settings'); return true; });
    await play.waitFor(() => document.querySelector('.seg-btn'), { timeout: 4 });
    await play.eval(t => { [...document.querySelectorAll('.seg-btn')].find(b => b.textContent === t)?.scrollIntoView({ block: 'center' }); }, label[i]);
    await play.step(10);
    await play.tapText(label[i], { exact: true });
    await play.step(10);
    if (v === 'far') await play.shot('settings');
    await play.tapSel('.sheet .close, [aria-label="Chiudi"], [aria-label="Close"]', { optional: true });
    await play.step(240);
    out[v] = await dist();
    await play.shot('cam-' + v);
  }
  await play.log('distances', { mid: d0, ...out });
  await play.expect(out.near < d0 * 0.9 && out.far > d0 * 1.15, 'Close is nearer and Far is farther than Medium', { mid: d0, ...out });
  await play.expect((await play.eval(() => window.__lenza.ctx.save.state.settings.camDist)) === 'far', 'the choice is saved');
}
