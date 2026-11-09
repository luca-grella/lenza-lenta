const STEP = process.env.STEP || 'q_meet';
export default async function (play) {
  await play.onboard({ lang: 'it' });
  const r = await play.eval(step => {
    const c = window.__lenza.ctx, Q = c.systems.quests;
    Q.jumpTo(step);
    c.save.state.quests.offered[step] = true;
    c.save.state.quests.side.q_side_treasure = 'active';
    (c.ui.sheet || c.ui.openSheet).call(c.ui, 'map');
    return Q.active().map(q => q.id + ':' + q.marker);
  }, STEP);
  await play.log('active', JSON.stringify(r));
  await play.step(40);
  const n = await play.eval(() => ({ goals: document.querySelectorAll('.mk-goal').length, labels: document.querySelectorAll('.mk-goal-txt').length, pois: document.querySelectorAll('.mk-poi').length }));
  await play.log('markers', JSON.stringify(n));
  await play.expect(n.goals >= 2, 'more than one goal pin', n);
  await play.shot('map-' + STEP);
  const ov = await play.overlaps();
  if (ov.length) await play.issue('overlaps: ' + JSON.stringify(ov).slice(0, 400));
}
