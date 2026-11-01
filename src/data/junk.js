// Junk & treasure catches. Same shape as fish.js plus `junk: true`.
// They come out of the normal fishing flow (no reel fight: behaviour 'calm', difficulty ~0).
// `chance`: share of all bites that turn into this item in its habitats (Gameplay: roll junk before species).
// `unique`: can only be caught once per save. `sellable: false` keeps it out of the Pescheria.
// `notes`: i18n keys of short letters shown when the item is opened (message in a bottle).
// `opens`: id of the thing this item unlocks (the treasure chest on Turtle Isle, see `treasure` below).
// Names: i18n `fish.<id>.name` / `fish.<id>.desc` like fish, so the catch card can treat them alike.

const ALL = ['dawn', 'day', 'dusk', 'night'];
const WATER = ['pond', 'river', 'shore', 'harbor', 'deep', 'reef', 'cave'];

const junk = [
  { id: 'junk_boot', rarity: 'common', habitats: WATER, times: ALL, chance: 0.025, price: 1,
    model: { shape: 'junk_boot', palette: { back: '#5a4a3a', belly: '#3a2e24', fin: '#7a6a50', accent: '#c8b090' } } },
  { id: 'junk_can', rarity: 'common', habitats: ['harbor', 'shore', 'river'], times: ALL, chance: 0.02, price: 1,
    model: { shape: 'junk_can', palette: { back: '#c84a3a', belly: '#d8d8d8', fin: '#e8e8e8', accent: '#f2c63a' } } },
  { id: 'junk_straw_hat', rarity: 'common', habitats: ['shore', 'harbor', 'pond'], times: ALL, chance: 0.012, price: 2,
    model: { shape: 'junk_hat', palette: { back: '#d8b866', belly: '#c4a050', fin: '#b8423a', accent: '#8a6a30' } } },
  { id: 'junk_bottle', rarity: 'uncommon', habitats: ['shore', 'harbor', 'deep', 'reef'], times: ALL, chance: 0.015, price: 5,
    notes: ['fish.junk_bottle.note1', 'fish.junk_bottle.note2', 'fish.junk_bottle.note3', 'fish.junk_bottle.note4', 'fish.junk_bottle.note5'],
    model: { shape: 'junk_bottle', palette: { back: '#7ac0a0', belly: '#a8e0c8', fin: '#c8a070', accent: '#f4ecd8' } } },
  { id: 'junk_duck', rarity: 'uncommon', habitats: ['pond', 'river', 'harbor'], times: ['day', 'dusk'], chance: 0.008, price: 15,
    model: { shape: 'junk_duck', palette: { back: '#ffd23a', belly: '#ffe680', fin: '#ff8a1a', accent: '#2a2a2a' } } },
  { id: 'junk_seaglass', rarity: 'uncommon', habitats: ['shore', 'reef'], times: ALL, chance: 0.01, price: 20,
    model: { shape: 'junk_gem', palette: { back: '#8ad8c8', belly: '#c8f4ea', fin: '#5ab0a0', accent: '#ffffff' } } },
  { id: 'junk_coin', rarity: 'rare', habitats: ['harbor', 'deep', 'reef'], times: ALL, chance: 0.005, price: 120,
    model: { shape: 'junk_coin', palette: { back: '#d8b04a', belly: '#f2d878', fin: '#a8842a', accent: '#fff4c0' } } },
  { id: 'junk_key', rarity: 'rare', habitats: ['shore', 'deep'], zones: ['turtle_isle'], times: ALL, chance: 0.04, price: 0,
    unique: true, sellable: false, opens: 'treasure',
    model: { shape: 'junk_key', palette: { back: '#8a5a3a', belly: '#a8704a', fin: '#5a3a24', accent: '#c88a5a' } } },
  { id: 'junk_crown', rarity: 'epic', habitats: ['reef', 'deep', 'harbor'], times: ['dusk', 'night'], chance: 0.0015, price: 300,
    unique: true,
    model: { shape: 'junk_crown', palette: { back: '#e8c050', belly: '#f8e090', fin: '#c8402a', accent: '#5ab0ff' } } },
];

for (const j of junk) {
  Object.assign(j, { kind: 'junk', junk: true, behavior: 'calm', difficulty: 0, baits: [], weather: {}, size: [0, 0] });
  if (j.sellable === undefined) j.sellable = true;
  j.nameKey = `fish.${j.id}.name`;
  j.descKey = `fish.${j.id}.desc`;
}

/** Contents of the treasure chest at POI `treasure` on Turtle Isle (opened with junk_key). */
export const treasure = {
  id: 'treasure', poi: 'treasure', zone: 'turtle_isle', needs: 'junk_key',
  reward: { coins: 1500, items: { bait_golden: 3, decor_ship_bottle: 1, hat_pirate: 1 } },
  textKey: 'treasure.open', nameKey: 'treasure.name',
};

export default junk;
