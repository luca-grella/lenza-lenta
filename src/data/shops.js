// Shops: who runs them, where, opening phases and what they sell.
// stock: item ids in display order, grouped by `section` (label key `shop.section.<section>`).
//   Unlock conditions live on the item records (`unlock: { quest }`); `story: true` items are hidden once owned.
// pescheria buys: kinds it accepts and price multipliers. dailySpecial: one species per day pays `mult` x
//   (seeded by day, picked among common/uncommon species of reachable habitats).
// Names: i18n `shop.<id>.name`. Greeting lines come from the NPC (npc.<id>.shop.*).

const shops = {
  bottega: {
    id: 'bottega', npc: 'rosa', poi: 'village_bottega', hours: ['dawn', 'day', 'dusk'],
    sections: [
      { section: 'baits', items: ['bait_corn', 'bait_shrimp', 'bait_fly', 'bait_squid', 'bait_firefly', 'bait_golden'] },
      { section: 'rods', items: ['rod_sturdy', 'rod_carbon', 'rod_master', 'rod_legendary'] },
      { section: 'reels', items: ['reel_smooth', 'reel_pro'] },
      { section: 'lines', items: ['line_nylon', 'line_braided'] },
      { section: 'baskets', items: ['basket_medium', 'basket_large', 'basket_grand'] },
      { section: 'tools', items: ['lantern'] },
      { section: 'style', items: ['hat_sky', 'hat_mint', 'hat_sunset', 'hat_night', 'collar_blue', 'collar_flower'] },
    ],
  },
  pescheria: {
    id: 'pescheria', npc: 'gino', poi: 'village_pescheria', hours: ['dawn', 'day', 'dusk'],
    sections: [],
    buys: { fish: 1.0, junk: 1.0, ingredient: 0.8 },
    sizeBonus: true,
    dailySpecial: { mult: 1.5, rarities: ['common', 'uncommon'] },
  },
  falegname: {
    id: 'falegname', npc: 'tonio', poi: 'village_falegname', hours: ['dawn', 'day', 'dusk'],
    sections: [
      { section: 'boat', items: ['boat_repair', 'boat_oars', 'boat_sail'] },
      { section: 'home', items: ['home_cabin', 'home_cottage'] },
      { section: 'decor', items: ['decor_flower_box', 'decor_wind_chime', 'decor_rug', 'decor_plant', 'decor_lamp', 'decor_cat_bed',
        'decor_bookshelf', 'decor_radio', 'decor_hammock', 'decor_fairy_lights', 'decor_painting', 'decor_fishbowl', 'decor_fish_trophy'] },
    ],
  },
  trattoria: {
    id: 'trattoria', npc: 'pina', poi: 'village_trattoria', hours: ['day', 'dusk', 'night'], cook: true,
    sections: [
      { section: 'pantry', items: ['ing_pasta', 'ing_tomato', 'ing_potato', 'ing_flour'] },
      { section: 'recipes', items: ['rec_mint_tea', 'rec_harbor_fry', 'rec_mushroom_soup', 'rec_berry_tart', 'rec_trout_fennel',
        'rec_carp_porcini', 'rec_beccafico', 'rec_spaghetti_clams', 'rec_octopus_potatoes', 'rec_ink_pasta', 'rec_coconut_fish',
        'rec_salt_bream', 'rec_tuna_tagliata'] },
    ],
  },
  aquarium: {
    id: 'aquarium', npc: 'marta', poi: 'village_aquarium', hours: ['dawn', 'day', 'dusk', 'night'], donate: true, sections: [],
  },
};

for (const s of Object.values(shops)) {
  s.nameKey = `shop.${s.id}.name`;
  s.stock = s.sections.flatMap(x => x.items);
}

export default shops;
