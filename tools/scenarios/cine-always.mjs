// [11 nov] Close-ups always and only for actions: run the catch-and-mat round with several catches, then every catch
// has its own catch shot (no 2-4 minute cooldown any more) and no non-action shots (wait / zone / dusk) appear.
//   CATCHES=3 node tools/play.mjs tools/scenarios/cine-always.mjs --port 8843
import round from './round2-mat.mjs';
export default async function (play) {
  process.env.CATCHES ||= '3';
  await round(play);
  const log = await play.eval(() => window.__lenza.ctx.cinematics.log.map(e => `${e.kind}:${e.result}`));
  await play.log('shots', JSON.stringify(log));
  const n = Number(process.env.CATCHES);
  const catches = log.filter(s => s.startsWith('catch')).length;
  await play.expect(catches >= n, `a catch close-up for each of the ${n} catches`, catches);
  await play.expect(!log.some(s => /^(wait|zone|dusk):/.test(s)), 'no shots that are not actions', log);
}
