// Story chain, side quests and aquarium milestones.
//
// Step format: { id, npc, goal, reward, dialogKeys, titleKey, goalKey, marker?, start? }
//   npc: villager who gives/receives the step ('letter' = grandpa's letter, no rig).
//   goal: { event, filter?, count, distinct?, requires? }
//     event: bus event that advances the step (see constants.QUEST_EVENTS).
//     filter: every key must match; an array value means "any of". Keys are read from the event payload first,
//       then from the item/species record (kind, rarity, habitat…) and from the game state at that moment:
//       speciesId, itemId, npcId, recipeId, zone, habitat, rarity, kind, phase (ctx.time.phase), weather.
//     distinct: payload key whose different values are counted (e.g. talk to 3 *different* villagers).
//     requires: extra state needed when the event fires ({ items: {id: n} } in inventory).
//   reward: { coins?, items?: {id: n}, recipes?: [ids], flags?: [save flags], consume?: {id: n} }.
//     flags are set in save.state.flags (World/Systems read e.g. 'boat_repaired', 'lighthouse_lit').
//   start?: { items } given when the step begins (so the player can act right away).
//   dialogKeys: { offer: [...] when the step starts, hint: [...] when talking mid-step, done: [...] on completion }.
//   marker: POI the HUD/map can point at for this step.
// Story steps unlock in order; `save.quests.story` is the index of the current step.

const dk = (id, offer, done, hint = 1) => ({
  offer: Array.from({ length: offer }, (_, i) => `q.${id}.offer.${i + 1}`),
  hint: Array.from({ length: hint }, (_, i) => `q.${id}.hint.${i + 1}`),
  done: Array.from({ length: done }, (_, i) => `q.${id}.done.${i + 1}`),
});

const story = [
  { id: 'q_first_catch', npc: 'letter', marker: 'dock_home',
    goal: { event: 'fishing:catch', filter: { junk: false }, count: 1 },
    reward: { coins: 20 }, dialogKeys: dk('q_first_catch', 4, 2) },
  { id: 'q_sell', npc: 'gino', marker: 'village_pescheria',
    goal: { event: 'shop:sell', count: 1 },
    reward: { coins: 30 }, dialogKeys: dk('q_sell', 3, 2) },
  { id: 'q_buy_bait', npc: 'rosa', marker: 'village_bottega',
    goal: { event: 'shop:buy', filter: { kind: 'bait' }, count: 1 },
    reward: { items: { bait_shrimp: 5 } }, dialogKeys: dk('q_buy_bait', 3, 2) },
  { id: 'q_harbor', npc: 'rosa', marker: 'dock_village',
    goal: { event: 'fishing:catch', filter: { habitat: 'harbor', junk: false }, count: 3 },
    reward: { coins: 60 }, dialogKeys: dk('q_harbor', 2, 2) },
  { id: 'q_meet', npc: 'gino', marker: 'village_trattoria',
    goal: { event: 'npc:talk', filter: { npcId: ['pina', 'tonio', 'marta'] }, count: 3, distinct: 'npcId' },
    reward: { coins: 50 }, dialogKeys: dk('q_meet', 3, 2) },
  { id: 'q_cook', npc: 'pina', marker: 'village_trattoria', start: { items: { ing_rosemary: 2 } },
    goal: { event: 'cook:done', count: 1 },
    reward: { coins: 40, recipes: ['rec_fish_soup'], items: { ing_tomato: 2 } }, dialogKeys: dk('q_cook', 3, 3) },
  { id: 'q_aquarium', npc: 'marta', marker: 'village_aquarium',
    goal: { event: 'aquarium:donate', count: 3 },
    reward: { coins: 80 }, dialogKeys: dk('q_aquarium', 3, 2) },
  { id: 'q_cat', npc: 'pina', marker: 'village_trattoria',
    goal: { event: 'cat:befriend', count: 1 },
    reward: { items: { collar_red: 1 }, flags: ['cat_friend'] }, dialogKeys: dk('q_cat', 3, 3) },
  { id: 'q_trout', npc: 'marta', marker: 'river_bridge',
    goal: { event: 'fishing:catch', filter: { speciesId: ['brown_trout', 'rainbow_trout', 'marble_trout', 'legend_grandma_trout'] }, count: 1 },
    reward: { coins: 60, items: { bait_fly: 10 } }, dialogKeys: dk('q_trout', 3, 2) },
  { id: 'q_driftwood', npc: 'tonio', marker: 'dock_home',
    goal: { event: 'forage:pick', filter: { itemId: 'ing_driftwood' }, count: 3 },
    reward: { coins: 0 }, dialogKeys: dk('q_driftwood', 4, 2) },
  { id: 'q_boat', npc: 'tonio', marker: 'village_falegname',
    goal: { event: 'shop:buy', filter: { itemId: 'boat_repair' }, count: 1 },
    reward: { flags: ['boat_repaired'] }, dialogKeys: dk('q_boat', 3, 3) },
  { id: 'q_islet', npc: 'tonio', marker: 'palm_islet_beach',
    goal: { event: 'zone:enter', filter: { zone: 'palm_islet' }, count: 1 },
    reward: { coins: 100 }, dialogKeys: dk('q_islet', 2, 2) },
  { id: 'q_reef', npc: 'marta', marker: 'palm_islet_beach',
    goal: { event: 'fishing:catch', filter: { habitat: 'reef', junk: false }, count: 3 },
    reward: { coins: 120, items: { bait_golden: 1 } }, dialogKeys: dk('q_reef', 3, 2) },
  { id: 'q_ettore', npc: 'rosa', marker: 'lighthouse_top',
    goal: { event: 'npc:talk', filter: { npcId: 'ettore' }, count: 1 },
    reward: { coins: 50 }, dialogKeys: dk('q_ettore', 3, 4) },
  { id: 'q_lantern', npc: 'ettore', marker: 'village_bottega',
    goal: { event: 'shop:buy', filter: { itemId: 'lantern' }, count: 1 },
    reward: { items: { bait_firefly: 6 } }, dialogKeys: dk('q_lantern', 3, 2) },
  { id: 'q_cave', npc: 'ettore', marker: 'cave_entrance',
    goal: { event: 'fishing:catch', filter: { habitat: 'cave', junk: false }, count: 1 },
    reward: { coins: 150 }, dialogKeys: dk('q_cave', 3, 2) },
  { id: 'q_crystal', npc: 'ettore', marker: 'cave_pool',
    goal: { event: 'forage:pick', filter: { itemId: 'key_moon_crystal' }, count: 1 },
    reward: {}, dialogKeys: dk('q_crystal', 3, 2) },
  { id: 'q_lighthouse', npc: 'ettore', marker: 'lighthouse_top',
    goal: { event: 'npc:talk', filter: { npcId: 'ettore', phase: 'night' }, count: 1, requires: { items: { key_moon_crystal: 1 } } },
    reward: { coins: 500, flags: ['lighthouse_lit'], consume: { key_moon_crystal: 1 } }, dialogKeys: dk('q_lighthouse', 2, 4) },
  { id: 'q_legend', npc: 'ettore', marker: null,
    goal: { event: 'fishing:catch', filter: { rarity: 'legendary' }, count: 1 },
    reward: { coins: 1000, items: { hat_golden: 1 }, flags: ['story_done'] }, dialogKeys: dk('q_legend', 4, 4, 2) },
];

/** Side quests: start when `trigger` happens, then work like story steps. */
export const side = [
  { id: 'q_side_treasure', npc: 'ettore', marker: 'treasure',
    trigger: { event: 'fishing:catch', filter: { speciesId: 'junk_key' } },
    goal: { event: 'treasure:open', count: 1 },
    reward: { flags: ['treasure_open'] }, dialogKeys: dk('q_side_treasure', 2, 2) },
  { id: 'q_side_collector', npc: 'marta', marker: 'village_aquarium',
    trigger: { event: 'quest:complete', filter: { id: 'q_aquarium' } },
    goal: { event: 'aquarium:donate', count: 20 },
    reward: { coins: 600, items: { decor_fishbowl: 1 } }, dialogKeys: dk('q_side_collector', 2, 2) },
  { id: 'q_side_home', npc: 'tonio', marker: 'home_bed',
    trigger: { event: 'quest:complete', filter: { id: 'q_boat' } },
    goal: { event: 'home:upgrade', count: 1 },
    reward: { items: { decor_rug: 1 } }, dialogKeys: dk('q_side_home', 2, 2) },
];

/** Aquarium rewards by number of species donated (Marta gives them, see q.aquarium.* strings). */
export const aquariumMilestones = [
  { count: 5, reward: { coins: 100 }, textKey: 'aquarium.milestone.5' },
  { count: 10, reward: { coins: 200, items: { decor_painting: 1 } }, textKey: 'aquarium.milestone.10' },
  { count: 20, reward: { coins: 400, items: { bait_golden: 2 } }, textKey: 'aquarium.milestone.20' },
  { count: 35, reward: { coins: 800, items: { decor_fish_trophy: 1 } }, textKey: 'aquarium.milestone.35' },
  { count: 50, reward: { coins: 1500, items: { hat_night: 1 } }, textKey: 'aquarium.milestone.50' },
  { count: 'all', reward: { coins: 3000, flags: ['aquarium_complete'] }, textKey: 'aquarium.milestone.all' },
];

for (const q of [...story, ...side]) {
  q.titleKey = `q.${q.id}.title`;
  q.goalKey = `q.${q.id}.goal`;
}

export default story;
