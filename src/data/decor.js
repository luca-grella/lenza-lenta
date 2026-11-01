// Furniture & decor sold by Tonio (or given as rewards). Placed in fixed home slots of a matching type
// (home.js: slot ids are '<type>_<n>'). minTier: home tier needed. reward: not sold, only given.
// model: simple procedural prop description for World/Home: shape + colours. Names: i18n `item.<id>.name` / `.desc`.
// effect?: small cozy perk while placed (Systems may ignore): { stat, mult } like buffs, or { music: true }.

const decor = [
  { id: 'decor_flower_box', price: 90, slot: 'porch', minTier: 0, model: { shape: 'flower_box', color: '#b07a4a', accent: '#f2a0c0' } },
  { id: 'decor_wind_chime', price: 120, slot: 'porch', minTier: 0, model: { shape: 'wind_chime', color: '#c8d8e0', accent: '#b07a4a' } },
  { id: 'decor_hammock', price: 380, slot: 'garden', minTier: 0, model: { shape: 'hammock', color: '#f2e2b0', accent: '#d8582a' },
    effect: { sit: true } },
  { id: 'decor_fairy_lights', price: 260, slot: 'porch', minTier: 0, model: { shape: 'fairy_lights', color: '#3a3a3a', accent: '#ffe7a0' } },
  { id: 'decor_rug', price: 150, slot: 'floor', minTier: 1, model: { shape: 'rug', color: '#3fa8b8', accent: '#f2e2b0' } },
  { id: 'decor_plant', price: 110, slot: 'floor', minTier: 1, model: { shape: 'potted_plant', color: '#c8623b', accent: '#4a9a5a' } },
  { id: 'decor_lamp', price: 160, slot: 'table', minTier: 1, model: { shape: 'lamp', color: '#b07a4a', accent: '#ffe7a0' } },
  { id: 'decor_cat_bed', price: 140, slot: 'floor', minTier: 1, model: { shape: 'cat_bed', color: '#d84a3a', accent: '#f4ecd8' },
    effect: { cat: true } },
  { id: 'decor_bookshelf', price: 320, slot: 'wall', minTier: 1, model: { shape: 'bookshelf', color: '#8a5532', accent: '#3a7ab0' } },
  { id: 'decor_radio', price: 280, slot: 'table', minTier: 1, model: { shape: 'radio', color: '#c8a070', accent: '#3a3a3a' },
    effect: { music: true } },
  { id: 'decor_painting', price: 240, slot: 'wall', minTier: 1, model: { shape: 'painting', color: '#b07a4a', accent: '#1d6f9a' } },
  { id: 'decor_fishbowl', price: 300, slot: 'table', minTier: 1, unlock: { quest: 'q_aquarium' },
    model: { shape: 'fishbowl', color: '#cfeff0', accent: '#ff7a1a' } },
  { id: 'decor_fish_trophy', price: 900, slot: 'wall', minTier: 2, unlock: { quest: 'q_legend' },
    model: { shape: 'fish_trophy', color: '#8a5532', accent: '#f5c542' } },
  { id: 'decor_ship_bottle', price: 0, slot: 'table', minTier: 1, reward: true,
    model: { shape: 'ship_bottle', color: '#a8e0c8', accent: '#f4ecd8' } },
  { id: 'decor_duck', price: 0, slot: 'table', minTier: 0, reward: true, fromItem: 'junk_duck',
    model: { shape: 'rubber_duck', color: '#ffd23a', accent: '#ff8a1a' } },
];

for (const d of decor) {
  d.kind = 'decor';
  d.nameKey = `item.${d.id}.name`;
  d.descKey = `item.${d.id}.desc`;
}

export default decor;
