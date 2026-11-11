// [11 nov] Man or woman: the name card has Pescatore / Pescatrice; choosing in Settings rebuilds the body on the same
// skeleton (braids, lashes) and the Italian text agrees ({g|..|..}). Old saves stay a man.
export default async function (play) {
  await play.onboard();
  let r = await play.eval(() => { const c = window.__lenza.ctx; return { g: c.save.state.player.gender || null, hair: c.player.character.look?.hair?.style }; });
  await play.log('start', JSON.stringify(r));
  await play.expect(r.g !== 'f', 'a new game starts as a man unless chosen', r);
  await play.eval(() => { window.__lenza.ctx.ui.sheet('settings'); return true; });
  await play.step(30);
  await play.waitFor(() => document.querySelector('.set-name'), { timeout: 4 });
  await play.tapSel('.set-name');
  await play.expect(!!(await play.waitFor(() => document.querySelector('.gender-btn[data-g="f"]'), { timeout: 4 })), 'the name card offers Pescatrice');
  await play.shot('card');
  await play.tapSel('.gender-btn[data-g="f"]'); await play.step(5);
  await play.tapSel('.name-ok'); await play.step(30);
  r = await play.eval(() => {
    const c = window.__lenza.ctx, t = c.i18n.t;
    return { g: c.save.state.player.gender, hair: c.player.character.look?.hair?.style, lashes: c.player.character.look?.lashes,
      pina: t('npc.pina.hello.1'), gino: t('q.q_sell.offer.1'), cam: t('ui.set.cam_desc'), sheet: c.ui.currentSheet };
  });
  await play.log('after', JSON.stringify(r));
  await play.expect(r.g === 'f', 'the choice is saved', r.g);
  await play.expect(r.hair === 'braids' && r.lashes === true, 'the body is rebuilt as a woman', r);
  if (play.lang !== 'en') await play.expect(r.pina.includes('cucciola') && r.gino.includes('la nuova arrivata') && !r.cam.includes('{'), 'Italian text agrees', r);
  await play.eval(() => { window.__lenza.ctx.ui.closeSheet?.(); return true; }); await play.step(30);
  // she still fishes with both arms in front (same rig): cast near water is covered by other scenarios, here a pose
  await play.eval(() => { const L = window.__lenza; L.ctx.player.play('reel', { fade: 0 }); L.step(40); return true; });
  await play.shot('woman-reel');
  // back to man
  await play.eval(() => { const L = window.__lenza; L.ctx.player.play('locomotion', { fade: 0 }); L.ctx.save.state.player.gender = 'm'; L.ctx.bus.emit('player:gender', { gender: 'm' }); L.step(5); return true; });
  r = await play.eval(() => ({ hair: window.__lenza.ctx.player.character.look?.hair?.style, pina: window.__lenza.ctx.i18n.t('npc.pina.hello.1') }));
  await play.expect(r.hair === 'short' && (play.lang === 'en' || r.pina.includes('cucciolo')), 'and back to a man', r);
}
