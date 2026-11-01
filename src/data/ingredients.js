// Ingredients (kind 'ingredient'). source 'forage' = picked in the world (respawn daily on World `forage_*` spots inside `zones`);
// source 'pantry' = bought at the Trattoria;
// source 'quest' = one-off story item at a fixed POI.
// spot?: preferred POI (else any forage_* spot in the zones).  times/weather?: when it can be found (default always).
// perDay: how many spots of this ingredient should be active per zone each day (suggestion for Foraging).
// price: what the Pescheria pays (pantry: what the Trattoria charges).  Names: i18n `item.<id>.name` / `.desc`.

const ingredients = [
  { id: 'ing_driftwood', source: 'forage', zones: ['home_beach', 'lighthouse', 'turtle_isle'], perDay: 4, price: 3,
    model: { shape: 'driftwood', color: '#b8a284', accent: '#8a7458' } },
  { id: 'ing_shell', source: 'forage', zones: ['home_beach', 'palm_islet', 'turtle_isle'], perDay: 4, price: 6,
    model: { shape: 'shell', color: '#f6dccc', accent: '#e89a8a' } },
  { id: 'ing_clam', source: 'forage', zones: ['home_beach'], times: ['dawn', 'day', 'dusk'], perDay: 3, price: 8,
    model: { shape: 'clam', color: '#e8d8c0', accent: '#a89070' } },
  { id: 'ing_seaweed', source: 'forage', zones: ['home_beach', 'lighthouse', 'palm_islet'], perDay: 3, price: 3,
    model: { shape: 'seaweed', color: '#4a8a4a', accent: '#2a5a3a' } },
  { id: 'ing_salt', source: 'forage', zones: ['lighthouse'], weather: ['clear', 'cloudy'], perDay: 2, price: 5,
    model: { shape: 'salt', color: '#f8f8f4', accent: '#d8e4e8' } },
  { id: 'ing_rosemary', source: 'forage', zones: ['meadow', 'village', 'home_beach'], perDay: 3, price: 4,
    model: { shape: 'herb', color: '#4a7a5a', accent: '#a8a8e0' } },
  { id: 'ing_fennel', source: 'forage', zones: ['meadow', 'pine_forest'], perDay: 3, price: 4,
    model: { shape: 'herb', color: '#7ab04a', accent: '#f2d84a' } },
  { id: 'ing_mint', source: 'forage', zones: ['waterfall', 'meadow'], perDay: 3, price: 4,
    model: { shape: 'herb', color: '#5ac07a', accent: '#3a8a5a' } },
  { id: 'ing_porcini', source: 'forage', zones: ['pine_forest'], times: ['dawn', 'day'], perDay: 2, price: 15, rainBonus: 2,
    model: { shape: 'mushroom', color: '#8a5a32', accent: '#f2e2c0' } },
  { id: 'ing_chanterelle', source: 'forage', zones: ['pine_forest'], perDay: 3, price: 10, rainBonus: 1.5,
    model: { shape: 'mushroom', color: '#f2b03a', accent: '#f8d880' } },
  { id: 'ing_blackberry', source: 'forage', zones: ['pine_forest', 'meadow'], perDay: 4, price: 5,
    model: { shape: 'berry', color: '#3a2a4a', accent: '#5a3a6a' } },
  { id: 'ing_strawberry', source: 'forage', zones: ['meadow', 'pine_forest'], perDay: 3, price: 7,
    model: { shape: 'berry', color: '#e83a3a', accent: '#5aa04a' } },
  { id: 'ing_pinenut', source: 'forage', zones: ['pine_forest'], perDay: 3, price: 6,
    model: { shape: 'pinecone', color: '#8a5a32', accent: '#f2e2c0' } },
  { id: 'ing_lemon', source: 'forage', zones: ['village', 'meadow'], perDay: 3, price: 5,
    model: { shape: 'lemon', color: '#f8e040', accent: '#5aa04a' } },
  { id: 'ing_coconut', source: 'forage', zones: ['palm_islet'], perDay: 3, price: 12,
    model: { shape: 'coconut', color: '#7a5032', accent: '#f8f4ea' } },

  { id: 'ing_pasta', source: 'pantry', zones: [], price: 6, model: { shape: 'pasta', color: '#f2d890', accent: '#d8b860' } },
  { id: 'ing_tomato', source: 'pantry', zones: [], price: 4, model: { shape: 'tomato', color: '#e8402a', accent: '#5aa04a' } },
  { id: 'ing_potato', source: 'pantry', zones: [], price: 3, model: { shape: 'potato', color: '#c8a060', accent: '#8a6a3a' } },
  { id: 'ing_flour', source: 'pantry', zones: [], price: 3, model: { shape: 'sack', color: '#f4ecd8', accent: '#b8a07a' } },

  // Story item: glowing crystal in the Sea Cave pool, picked once, needs the lantern (quest q_crystal).
  { id: 'key_moon_crystal', source: 'quest', zones: ['sea_cave'], spot: 'cave_pool', once: true, needs: 'lantern',
    unlock: { quest: 'q_cave' }, price: 0, sellable: false,
    model: { shape: 'crystal', color: '#bfe8ff', accent: '#ffffff', glow: '#9af7ff' } },
];

for (const g of ingredients) {
  g.kind = 'ingredient';
  g.nameKey = `item.${g.id}.name`;
  g.descKey = `item.${g.id}.desc`;
  if (g.sellable === undefined) g.sellable = g.source === 'forage';
  if (g.source === 'forage' && !g.respawn) g.respawn = 'daily';
}

export default ingredients;
