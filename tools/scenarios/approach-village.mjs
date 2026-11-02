// Walk (joystick only, planned routes) from the spawn to every shop counter of the village and to two villagers,
// checking each time that the action button offers that place/person and that the player never wades into the sea.
// Also the harness's own reliability test for long multi-stop routes (narrow ramps onto the stilt decks).
//   node tools/play.mjs tools/scenarios/approach-village.mjs [--landscape]
export const options = { params: 'debug', speed: 2 };
export default async function (play) {
  await play.onboard();
  await play.log('pois village_*:', await play.pois('village_'));
  await play.log('npcs:', await play.npcs());
  for (const id of ['village_bottega', 'village_pescheria', 'village_trattoria', 'village_falegname', 'village_aquarium', 'npc:rosa', 'npc:gino']) {
    const r = await play.approach(id, { timeout: 70 });
    await play.expect(r.reached && !r.wetSamples, `walk up to ${id}`, { reason: r.reason, pos: r.pos, wet: r.wetSamples, plan: r.plan?.reason, interact: r.interact });
    if (!r.reached) await play.shot('fail-' + id);
  }
  await play.shot('last');
}
