// Cooking by touch [11 nov]: at the home campfire the place button opens the cook sheet; cooking a recipe closes the
// sheet, the player kneels and stirs (cook_stir) and the dish toast comes at the end.
export default async function (play) {
  await play.onboard();
  const setup = await play.eval(() => {
    const L = window.__lenza, c = L.ctx, q = c.world.poi('home_campfire') || c.world.poiList('campfire')[0];
    for (let i = 0; i < 3; i++) c.save.state.basket.push({ id: 'sardine', size: 14, price: 5, day: 1 });
    const ok = (c.systems.cooking.list('campfire') || []).filter(r => r.ok).map(r => r.id);
    L.teleport(q.x + 1.6, q.z, -Math.PI / 2);
    return { q: q && [q.x, q.z], ok };
  });
  await play.log('setup', JSON.stringify(setup));
  await play.step(30);
  const b = await play.eval(() => { const I = window.__lenza.ctx.systems.interact; return { big: I.current?.kind, s3: I.slots?.[3]?.kind }; });
  await play.log('buttons', JSON.stringify(b));
  const sel = b.s3 === 'cook' ? '.slot-3' : b.big === 'cook' ? '.act' : null;
  await play.expect(!!sel, 'a cook button by the campfire', b);
  if (!sel) return;
  await play.tapSel(sel, sel === '.act' ? { hold: 0.06, after: 0.1 } : {});
  const open = await play.waitFor(L => L.ctx.ui.currentSheet === 'cook', { timeout: 4 });
  await play.expect(!!open, 'the cook sheet opens');
  if (!open) return;
  await play.step(30);
  const ready = await play.eval(() => !!document.querySelector('.recipe.ready button, .recipe.ready .btn'));
  await play.expect(ready, 'a recipe is ready to cook', setup.ok);
  if (!ready) return;
  await play.tapSel('.recipe.ready .btn');
  await play.wait(1.2);
  const st = await play.eval(() => { const c = window.__lenza.ctx; return { sheet: c.ui.currentSheet || null, clip: c.player?.clip || c.player?.anim?.current || c.player?.state }; });
  await play.log('after tap', JSON.stringify(st));
  await play.shot('cooking');
  await play.expect(!st.sheet, 'the sheet closed to show the cooking', st);
  const early = await play.eval(() => document.body.innerText.includes('Pronto'));
  await play.expect(!early, 'no dish toast while stirring');
  await play.wait(3.0);
  const toast = await play.eval(() => document.body.innerText.includes('Pronto'));
  await play.expect(toast, 'the dish toast at the end');
  await play.log('toasts', toast);
  await play.shot('cooked');
}
