// Content entry point: builds ctx.data and registers the data strings.
//   import { loadData } from './data/index.js';  await loadData(ctx);
// ctx.data keys: fish, junk, baits, rods, reels, lines, upgrades, recipes, ingredients, quests, npcs, zones, creatures,
// shopStock (contract names) + baskets, lantern, boat, cosmetics, dishes, sideQuests, aquariumMilestones, dailies,
// decor, home, treasure, fishShadows, speakers, shops (= shopStock), constants, items (id → record, every kind),
// get(id), helpers (biteTable, pickWeighted, rollSize, priceFor, baitMatches, specialOK, needMatches).
import * as constants from './constants.js';
import * as helpers from './helpers.js';
import fish from './fish.js';
import junk, { treasure } from './junk.js';
import baits from './baits.js';
import { rods, reels, lines, baskets, lantern, boat, cosmetics, upgrades } from './gear.js';
import ingredients from './ingredients.js';
import recipes, { dishes } from './recipes.js';
import npcs, { speakers } from './npcs.js';
import quests, { side as sideQuests, aquariumMilestones } from './quests.js';
import dailies from './dailies.js';
import creatures, { fishShadows } from './creatures.js';
import shops from './shops.js';
import zones from './zones.js';
import decor from './decor.js';
import home from './home.js';
import it from '../i18n/it.js';
import en from '../i18n/en.js';

let cached = null;

/** Build (once) the data object. Safe to call without ctx (tests, tools). */
export function buildData() {
  if (cached) return cached;
  const items = {};
  const add = (list, kind) => { for (const r of list) { if (!r.kind) r.kind = kind; items[r.id] = r; } };
  add(fish, 'fish'); add(junk, 'junk'); add(baits, 'bait');
  add(rods, 'rod'); add(reels, 'reel'); add(lines, 'line'); add(upgrades, 'upgrade');
  add(ingredients, 'ingredient'); add(dishes, 'dish'); add(decor, 'decor'); add(home, 'home');
  add(recipes, 'recipe'); // recipe cards (Trattoria stock)

  cached = {
    fish, junk, baits, rods, reels, lines, upgrades, recipes, ingredients, quests, npcs, zones, creatures,
    shopStock: shops, shops,
    baskets, lantern, boat, cosmetics, dishes, sideQuests, aquariumMilestones, dailies, decor, home, treasure,
    fishShadows, speakers, constants, items,
    get: id => items[id] || null,
    fishById: Object.fromEntries(fish.map(f => [f.id, f])),
    npcById: Object.fromEntries(npcs.map(n => [n.id, n])),
    questById: Object.fromEntries([...quests, ...sideQuests].map(q => [q.id, q])),
    zoneById: Object.fromEntries(zones.map(z => [z.id, z])),
    helpers: {
      ...helpers,
      biteTable: q => helpers.biteTable(cached, q),
      needMatches: (need, id) => helpers.needMatches(cached, need, id),
    },
    strings: { it, en },
  };
  return cached;
}

/** Boot step: sets ctx.data and registers Italian/English data strings. */
export async function loadData(ctx) {
  const data = buildData();
  if (ctx) {
    ctx.data = data;
    ctx.i18n?.addStrings?.(it, en);
  }
  return data;
}

export const init = loadData;
export { it, en };
export default loadData;
