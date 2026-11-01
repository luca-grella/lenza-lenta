// Daily request templates. Each game day the Quests system picks up to 3 unlocked templates (weighted, at most
// one per NPC) and fills them in with a seeded RNG (seed = day number) so they are stable across reloads.
//   kind 'deliver': bring `n` of `pick` to the NPC (talk to them with the items in basket/inventory).
//   kind 'catch':   catch `n` fish matching `filter` (same filter keys as quests.js) — progress via fishing:catch.
//   kind 'donate':  donate `n` new species to the aquarium.
// pick: { from: [ids] } choose one id from the list; only ids the player can currently reach should be used
//   (Quests may skip species whose habitat is not reachable yet: reef/deep-by-boat need q_boat, cave needs lantern).
// filterPick: { key, from } picks one value for filter[key] from the list (e.g. a habitat or a bait).
// n: [min, max].  reward: { coins: [min, max] } and/or { priceMult } (x the item base price per unit) and/or { items }.
// textKey gets vars {n}, {item} (translated name of the picked id) and {what} (translated habitat/bait/phase label).

const dailies = [
  { id: 'daily_gino_fish', npc: 'gino', kind: 'deliver', weight: 3,
    pick: { from: ['sardine', 'bogue', 'mackerel', 'salema', 'mullet', 'red_mullet', 'white_bream', 'chub', 'carp', 'perch', 'brown_trout', 'scorpionfish'] },
    n: [2, 3], reward: { priceMult: 1.6, coins: [15, 30] }, textKey: 'daily.daily_gino_fish' },
  { id: 'daily_gino_big', npc: 'gino', kind: 'catch', weight: 1, unlock: { quest: 'q_harbor' },
    filter: { sizeRatio: 0.8 }, n: [1, 1], reward: { coins: [70, 110] }, textKey: 'daily.daily_gino_big' },
  { id: 'daily_rosa_bait', npc: 'rosa', kind: 'catch', weight: 2, unlock: { quest: 'q_buy_bait' },
    filterPick: { key: 'bait', from: ['bait_corn', 'bait_shrimp', 'bait_fly', 'bait_squid'] },
    n: [2, 4], reward: { coins: [40, 70], items: { bait_shrimp: 3 } }, textKey: 'daily.daily_rosa_bait' },
  { id: 'daily_pina_herbs', npc: 'pina', kind: 'deliver', weight: 2, unlock: { quest: 'q_meet' },
    pick: { from: ['ing_rosemary', 'ing_fennel', 'ing_mint', 'ing_blackberry', 'ing_lemon', 'ing_clam', 'ing_chanterelle', 'ing_porcini'] },
    n: [2, 4], reward: { priceMult: 2.5, coins: [10, 25] }, textKey: 'daily.daily_pina_herbs' },
  { id: 'daily_pina_menu', npc: 'pina', kind: 'deliver', weight: 2, unlock: { quest: 'q_cook' },
    pick: { from: ['red_mullet', 'sardine', 'mackerel', 'gilthead', 'sole', 'cuttlefish', 'octopus', 'sea_bass', 'rainbow_trout', 'tench'] },
    n: [1, 2], reward: { priceMult: 1.8, coins: [20, 40] }, textKey: 'daily.daily_pina_menu' },
  { id: 'daily_tonio_wood', npc: 'tonio', kind: 'deliver', weight: 2, unlock: { quest: 'q_driftwood' },
    pick: { from: ['ing_driftwood'] }, n: [3, 5], reward: { coins: [50, 80] }, textKey: 'daily.daily_tonio_wood' },
  { id: 'daily_tonio_shells', npc: 'tonio', kind: 'deliver', weight: 1, unlock: { quest: 'q_boat' },
    pick: { from: ['ing_shell'] }, n: [3, 5], reward: { coins: [60, 90] }, textKey: 'daily.daily_tonio_shells' },
  { id: 'daily_marta_new', npc: 'marta', kind: 'donate', weight: 2, unlock: { quest: 'q_aquarium' },
    n: [1, 1], reward: { coins: [90, 140] }, textKey: 'daily.daily_marta_new' },
  { id: 'daily_marta_habitat', npc: 'marta', kind: 'catch', weight: 2, unlock: { quest: 'q_aquarium' },
    filterPick: { key: 'habitat', from: ['pond', 'river', 'shore', 'harbor', 'deep', 'reef', 'cave'] },
    n: [3, 5], reward: { coins: [60, 100] }, textKey: 'daily.daily_marta_habitat' },
  { id: 'daily_ettore_night', npc: 'ettore', kind: 'catch', weight: 2, unlock: { quest: 'q_ettore' },
    filter: { phase: 'night' }, n: [2, 3], reward: { coins: [80, 120], items: { bait_firefly: 2 } }, textKey: 'daily.daily_ettore_night' },
  { id: 'daily_ettore_weather', npc: 'ettore', kind: 'catch', weight: 1, unlock: { quest: 'q_ettore' },
    filterPick: { key: 'weather', from: ['rain', 'fog', 'cloudy'] },
    n: [2, 3], reward: { coins: [70, 110] }, textKey: 'daily.daily_ettore_weather' },
];

for (const d of dailies) d.thanksKey = `npc.${d.npc}.thanks.1`;

export default dailies;
