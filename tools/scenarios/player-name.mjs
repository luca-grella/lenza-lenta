// Player name: asked on a new game, asked again for an old save without one, changed from Settings.
//   node tools/play.mjs tools/scenarios/player-name.mjs [--landscape] [--lang en]
export default async function (play) {
  // new game: language, Start, then the name card (onboard types "Nico")
  await play.step(30);
  if (await play.findSel('.lang-btn')) { await play.tapText(play.lang === 'en' ? 'English' : 'Italiano'); await play.step(40); }
  await play.waitFor(() => document.querySelector('.title-start'), { timeout: 6 }); await play.wait(1);
  await play.tapSel('.title-start');
  await play.expect(!!(await play.waitFor(() => document.querySelector('.name-input'), { timeout: 4 })), 'new game asks the name');
  await play.tapSel('.name-input'); await play.page.keyboard.type('Nico<b>!!', { delay: 20 });
  await play.step(10);
  await play.shot('name-card');
  await play.tapSel('.name-ok'); await play.step(40);
  let r = await play.eval(() => ({ name: window.__lenza.ctx.save.state.player.name, line: window.__lenza.ctx.i18n.t('q.q_first_catch.offer.1') }));
  await play.expect(r.name === 'Nicob', 'the name is saved, cleaned of symbols', r);
  await play.expect(r.line.includes('Nicob'), "grandpa's letter uses the name", r.line);
  await play.tapThroughDialogs();

  // an old save without a name: the title's Start asks it
  await play.eval(() => { const L = window.__lenza; delete L.ctx.save.state.player.name; L.ctx.ui.intro.show('title'); });
  await play.waitFor(() => document.querySelector('.intro.title.in .title-start'), { timeout: 6 });
  await play.wait(1);
  await play.tapSel('.title-start');
  const asked = await play.waitFor(() => document.querySelector('.name-input'), { timeout: 4 });
  await play.expect(!!asked, 'an old save without a name is asked once');
  await play.tapSel('.name-input'); await play.page.keyboard.type('Ada', { delay: 20 }); await play.tapSel('.name-ok'); await play.step(40);
  let st = await play.state();
  await play.expect(!st.intro && st.inputEnabled, 'back in the game after the name', { ui: st.ui });

  // Settings › Name › Change
  await play.eval(() => { window.__lenza.ctx.ui.sheet('settings'); return true; });   // resolves on close: don't wait
  await play.step(30);
  await play.waitFor(() => document.querySelector('.set-name'), { timeout: 4 });
  await play.tapSel('.set-name');
  await play.expect(!!(await play.waitFor(() => document.querySelector('.name-input'), { timeout: 4 })), 'Settings › Change opens the name card');
  await play.eval(() => { document.querySelector('.name-input').value = ''; });
  await play.tapSel('.name-input'); await play.page.keyboard.type("Anna Maria D'Amico", { delay: 10 });
  await play.tapSel('.name-ok'); await play.step(30);
  r = await play.eval(() => ({ name: window.__lenza.ctx.save.state.player.name, hello: window.__lenza.ctx.i18n.t('npc.rosa.hello.1'), sheet: window.__lenza.ctx.ui.currentSheet }));
  await play.expect(r.name === "Anna Maria D'Amico", 'the new name is saved', r);
  await play.expect(r.hello.includes(r.name) && r.sheet === 'settings', 'villagers use the new name, Settings still open', r);
  await play.shot('settings');
}
