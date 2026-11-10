// Talk to the shopkeepers by touch and look at the answer buttons: they must say what they do, fit their box,
// and never show a code. Setup teleports next to each villager; the talk itself is by touch.
//   node tools/play.mjs tools/scenarios/talk-choices.mjs [--landscape] [--lang en]
export default async function (play) {
  await play.onboard();
  for (const id of ['gino', 'rosa', 'pina']) {
    await play.eval(n => { const L = window.__lenza; const p = L.ctx.npcs.get(n).object.position; L.teleport(p.x + 1.6, p.z + 1.6); }, id);
    await play.step(20);
    const r = await play.approach('npc:' + id, { expect: /talk|parla/i, timeout: 15 });
    if (!r.reached) { await play.issue(`could not reach ${id}`); continue; }
    await play.tapSel('.act');
    // tap through the lines until the answers show up
    let choices = null;
    for (let i = 0; i < 12 && !choices; i++) {
      await play.wait(1.2);
      choices = await play.eval(() => { const b = [...document.querySelectorAll('.dlg-choice')]; return b.length ? b.map(x => ({ t: x.textContent, r: x.getBoundingClientRect().toJSON(), sw: x.scrollWidth, cw: x.clientWidth })) : null; });
      if (!choices) await play.tapSel('.dlg-box, .dialog, .dlg', { optional: true });
    }
    await play.expect(!!choices, `${id}: answer buttons appear`);
    if (!choices) continue;
    await play.log(id, choices.map(c => c.t));
    await play.shot('talk-' + id);
    await play.expect(choices.every(c => !/\{\w+\}|^[a-z]+\.[a-z_.]+$/.test(c.t)), `${id}: no codes in the buttons`);
    await play.expect(choices.every(c => c.sw <= c.cw + 1), `${id}: no button text cut off`, choices.map(c => [c.sw, c.cw]));
    const vw = await play.eval(() => [innerWidth, innerHeight]);
    await play.expect(choices.every(c => c.r.left >= 0 && c.r.right <= vw[0] && c.r.bottom <= vw[1]), `${id}: buttons inside the screen`);
    const a = choices[0].r, b = choices[1]?.r;
    await play.expect(!b || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `${id}: buttons do not overlap`);
    await play.tapSel('.dlg-choice', { index: 1 });   // goodbye
    await play.step(40);
  }
}
