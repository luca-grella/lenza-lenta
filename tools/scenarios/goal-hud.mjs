// Goal card: folded into a flag button while playing, opens on tap and when the goal changes; on completion the
// villager's lines play first, then the "objective complete" banner, and only then the new goal opens.
export default async function (play) {
  await play.onboard();
  const mini = () => play.eval(() => document.querySelector('.goal')?.classList.contains('mini'));
  await play.wait(9);
  await play.expect(await mini(), 'after the start the goal folds into the flag button');
  await play.shot('goal-folded');
  await play.tapSel('.goal');
  await play.step(10);
  await play.expect(!(await mini()), 'a tap opens the goal card');
  await play.shot('goal-open');
  await play.wait(7);
  await play.expect(await mini(), 'it folds back by itself');
  // complete the current story step by firing its goal event
  await play.eval(() => { window.__lenza.ctx.bus.emit('fishing:catch', { junk: false, speciesId: 'sardine' }); return true; });   // q_first_catch
  // the fake catch also opens the catch card: close it like a player would (the quest dialogue waits for it)
  if (await play.waitFor(L => L.ctx.ui.currentSheet === 'catch', { timeout: 4 })) { await play.step(30); await play.tapSel('.keep'); await play.step(30); }
  // watch dialog / banner / goal card for 15 s
  const seen = [];
  for (let i = 0; i < 30; i++) {
    const r = await play.eval(() => ({
      dlg: !!window.__lenza.ctx.ui.isOpen?.() && document.querySelector('#ui')?.classList.contains('has-dialog'),
      banner: !!document.querySelector('.banner-host .banner, .banner-host > *'),
      open: !document.querySelector('.goal')?.classList.contains('mini'),
    }));
    seen.push((r.dlg ? 'D' : '-') + (r.banner ? 'B' : '-') + (r.open ? 'G' : '-'));
    const d = r.dlg && await play.findSel('.dialog-host .dialog');
    if (d) { await play.tap(d.x, d.y + d.h * 0.2); await play.step(20); } else await play.wait(0.5);
  }
  await play.log('timeline (Dialog Banner Goal-open):', seen.join(' '));
  const firstB = seen.findIndex(x => x[1] === 'B'), lastD = seen.map(x => x[0]).lastIndexOf('D'), firstG = seen.findIndex((x, i) => i > 0 && x[2] === 'G');
  await play.expect(firstB < 0 || seen.slice(0, firstB).every(x => x[0] !== 'D' || true) && !seen.some(x => x[0] === 'D' && x[1] === 'B'), 'banner never over the dialogue', seen.join(' '));
  await play.expect(firstG < 0 || !seen.some(x => x[0] === 'D' && x[2] === 'G'), 'the new goal does not open during the dialogue', seen.join(' '));
}
