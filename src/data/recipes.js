// Recipes. Cooking turns `needs` into one dish (`dish` id, kept in items until eaten).
// needs entries (all must be satisfied, fish taken from the basket, smallest first):
//   { id, n }          exact fish species or ingredient
//   { ids: [...], n }  any of these species/ingredients
//   { habitat, n }     any fish from that habitat         { fish: 'any', n }  any fish (not junk)
//   { fillet: true, n } a cleaned fillet (any species; may be combined with id/ids/habitat)   [r2-gameplay]
//   { ..., whole: true } only whole fish (never a fillet)
// prefersFillet: a fillet is used first and the dish comes out as two portions (fillets are cleaned on the mat).
// buffs: soft timed effects when eaten: { stat (constants.BUFF_STATS), mult, hours (game hours) }.
// effect?: special non-buff effect ({ cat: n } = n points of cat friendship).
// station: 'any' (campfire or Trattoria) | 'trattoria' (needs Pina's kitchen).
// known: available from the start; price > 0: recipe card sold at the Trattoria; else given by a quest.
// Names: i18n `recipe.<id>.name` / `.desc` (the dish uses the same keys).

const recipes = [
  { id: 'rec_grilled_fish', known: true, price: 0, station: 'any',
    needs: [{ fish: 'any', n: 1 }, { id: 'ing_rosemary', n: 1 }], buffs: [{ stat: 'calm', mult: 1.15, hours: 4 }], prefersFillet: true,
    model: { plate: '#f4ecd8', food: '#c8823a', garnish: '#4a7a5a' } },
  { id: 'rec_cat_treat', known: true, price: 0, station: 'any',
    needs: [{ fish: 'any', n: 1 }], buffs: [], effect: { cat: 1 },
    model: { plate: '#d84a3a', food: '#e8b090', garnish: '#ffffff' } },
  { id: 'rec_fish_soup', price: 0, station: 'any',
    needs: [{ fish: 'any', n: 3 }, { id: 'ing_tomato', n: 1 }], buffs: [{ stat: 'size', mult: 1.12, hours: 6 }], prefersFillet: true,
    model: { plate: '#3a6a9a', food: '#d8582a', garnish: '#7ab04a' } },
  { id: 'rec_harbor_fry', price: 60, station: 'trattoria',
    needs: [{ habitat: 'harbor', n: 3 }, { id: 'ing_flour', n: 1 }, { id: 'ing_lemon', n: 1 }], buffs: [{ stat: 'bite', mult: 1.15, hours: 5 }],
    model: { plate: '#f4ecd8', food: '#e8b850', garnish: '#f8e040' } },
  { id: 'rec_beccafico', price: 90, station: 'trattoria',
    needs: [{ id: 'sardine', n: 3 }, { id: 'ing_pinenut', n: 1 }, { id: 'ing_lemon', n: 1 }], buffs: [{ stat: 'luck', mult: 1.12, hours: 6 }], prefersFillet: true,
    model: { plate: '#e8e0c8', food: '#c8823a', garnish: '#5aa04a' } },
  { id: 'rec_trout_fennel', price: 80, station: 'any',
    needs: [{ habitat: 'river', n: 1 }, { id: 'ing_fennel', n: 1 }, { id: 'ing_lemon', n: 1 }], buffs: [{ stat: 'reel', mult: 1.15, hours: 5 }],
    model: { plate: '#f4ecd8', food: '#e89a7a', garnish: '#7ab04a' } },
  { id: 'rec_carp_porcini', price: 80, station: 'any',
    needs: [{ habitat: 'pond', n: 1 }, { id: 'ing_porcini', n: 1 }], buffs: [{ stat: 'size', mult: 1.15, hours: 6 }],
    model: { plate: '#8a5532', food: '#b88a50', garnish: '#5a3a24' } },
  { id: 'rec_mushroom_soup', price: 70, station: 'any',
    needs: [{ id: 'ing_porcini', n: 1 }, { id: 'ing_chanterelle', n: 2 }], buffs: [{ stat: 'forage', mult: 1.5, hours: 8 }],
    model: { plate: '#f4ecd8', food: '#c8a060', garnish: '#f2b03a' } },
  { id: 'rec_berry_tart', price: 70, station: 'trattoria',
    needs: [{ id: 'ing_blackberry', n: 3 }, { id: 'ing_strawberry', n: 2 }, { id: 'ing_flour', n: 1 }], buffs: [{ stat: 'speed', mult: 1.2, hours: 6 }],
    model: { plate: '#f4ecd8', food: '#5a2a4a', garnish: '#e83a3a' } },
  { id: 'rec_mint_tea', price: 40, station: 'any',
    needs: [{ id: 'ing_mint', n: 2 }, { id: 'ing_lemon', n: 1 }], buffs: [{ stat: 'calm', mult: 1.2, hours: 4 }],
    model: { plate: '#5ac0b0', food: '#c8e090', garnish: '#5ac07a' } },
  { id: 'rec_spaghetti_clams', price: 100, station: 'trattoria',
    needs: [{ id: 'ing_clam', n: 4 }, { id: 'ing_pasta', n: 1 }], buffs: [{ stat: 'price', mult: 1.1, hours: 8 }],
    model: { plate: '#f4ecd8', food: '#f2d890', garnish: '#4a7a5a' } },
  { id: 'rec_octopus_potatoes', price: 120, station: 'trattoria',
    needs: [{ id: 'octopus', n: 1 }, { id: 'ing_potato', n: 2 }, { id: 'ing_rosemary', n: 1 }], buffs: [{ stat: 'calm', mult: 1.3, hours: 6 }],
    model: { plate: '#f4ecd8', food: '#c46a5a', garnish: '#c8a060' } },
  { id: 'rec_ink_pasta', price: 120, station: 'trattoria',
    needs: [{ ids: ['cuttlefish', 'squid'], n: 1 }, { id: 'ing_pasta', n: 1 }], buffs: [{ stat: 'reel', mult: 1.25, hours: 6 }],
    model: { plate: '#f4ecd8', food: '#22222a', garnish: '#e8402a' } },
  { id: 'rec_coconut_fish', price: 140, station: 'any',
    needs: [{ habitat: 'reef', n: 2 }, { id: 'ing_coconut', n: 1 }, { id: 'ing_lemon', n: 1 }], buffs: [{ stat: 'luck', mult: 1.18, hours: 6 }],
    model: { plate: '#7a5032', food: '#f8f4ea', garnish: '#f2a03a' } },
  { id: 'rec_salt_bream', price: 150, station: 'trattoria',
    needs: [{ ids: ['gilthead', 'white_bream', 'dentex'], n: 1, whole: true }, { id: 'ing_salt', n: 2 }, { id: 'ing_rosemary', n: 1 }],
    buffs: [{ stat: 'size', mult: 1.22, hours: 6 }],
    model: { plate: '#f4ecd8', food: '#f8f8f4', garnish: '#4a7a5a' } },
  { id: 'rec_tuna_tagliata', price: 300, station: 'trattoria',
    needs: [{ id: 'bluefin_tuna', n: 1 }, { id: 'ing_salt', n: 1 }, { id: 'ing_rosemary', n: 1 }],
    buffs: [{ stat: 'luck', mult: 1.3, hours: 8 }, { stat: 'size', mult: 1.15, hours: 8 }],
    model: { plate: '#2a2a2a', food: '#c8404a', garnish: '#7ab04a' } },
  // [r2-gameplay] fillet recipes (clean a fish on the mat first)
  { id: 'rec_fillet_lemon', known: true, price: 0, station: 'any',
    needs: [{ fillet: true, n: 1 }, { id: 'ing_lemon', n: 1 }], buffs: [{ stat: 'calm', mult: 1.2, hours: 5 }],
    model: { plate: '#f4ecd8', food: '#f2b49c', garnish: '#f8e040' } },
  { id: 'rec_fillet_potato', price: 70, station: 'any',
    needs: [{ fillet: true, n: 1 }, { id: 'ing_potato', n: 2 }], buffs: [{ stat: 'size', mult: 1.15, hours: 6 }],
    model: { plate: '#f4ecd8', food: '#d8a860', garnish: '#7ab04a' } },
  { id: 'rec_fish_rolls', price: 80, station: 'trattoria',
    needs: [{ fillet: true, n: 2 }, { id: 'ing_pinenut', n: 1 }, { id: 'ing_rosemary', n: 1 }], buffs: [{ stat: 'luck', mult: 1.15, hours: 6 }],
    model: { plate: '#e8e0c8', food: '#e8a080', garnish: '#4a7a5a' } },
  { id: 'rec_fillet_pasta', price: 90, station: 'trattoria',
    needs: [{ fillet: true, n: 1 }, { id: 'ing_pasta', n: 1 }, { id: 'ing_tomato', n: 1 }], buffs: [{ stat: 'bite', mult: 1.15, hours: 5 }],
    model: { plate: '#f4ecd8', food: '#e86a3a', garnish: '#5aa04a' } },
];

for (const r of recipes) {
  r.known = !!r.known;
  r.dish = r.id.replace(/^rec_/, 'dish_');
  r.nameKey = `recipe.${r.id}.name`;
  r.descKey = `recipe.${r.id}.desc`;
}

/** Dish items produced by cooking (inventory entries); same names as their recipe. */
export const dishes = recipes.map(r => ({ id: r.dish, kind: 'dish', recipe: r.id, nameKey: r.nameKey, descKey: r.descKey, price: 0, sellable: false }));

export default recipes;
