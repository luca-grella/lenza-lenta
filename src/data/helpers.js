// Pure helpers over the game data (no ctx, no three). Gameplay may use them or roll its own.
import { RARITY, RARITIES } from './constants.js';

/** True if the species bites on this bait (golden lure also matches every rare+ species). */
export function baitMatches(species, bait) {
  if (!bait) return false;
  if (species.baits?.includes(bait.id)) return true;
  return !!bait.matchesRarity?.includes(species.rarity);
}

/** True if every hard condition of a legendary (`special`) holds. */
export function specialOK(sp, { zone, phase, weather, bait, lantern }) {
  const s = sp.special;
  if (!s) return true;
  if (s.zones && !s.zones.includes(zone)) return false;
  if (s.times && !s.times.includes(phase)) return false;
  if (s.weather && !s.weather.includes(weather)) return false;
  if (s.baits && !s.baits.includes(bait?.id)) return false;
  if (s.lantern && !lantern) return false;
  return true;
}

/**
 * Candidate catches for one bite, with relative weights.
 * @param {object} data ctx.data
 * @param {{habitat:string, zone?:string, phase:string, weather:string, baitId:string, luck?:number,
 *   lantern?:boolean, exclude?:Set<string>|string[], caught?:Set<string>|string[]}} q
 *   exclude = unique junk already found; caught = species already in the Journal (repeat legendaries get rarer)
 * @returns {{id:string, weight:number, junk?:boolean}[]}
 */
export function biteTable(data, q) {
  const bait = data.items[q.baitId];
  if (!bait || bait.kind !== 'bait') return [];
  const luck = q.luck || 0;
  const exclude = q.exclude instanceof Set ? q.exclude : new Set(q.exclude || []);
  const caught = q.caught instanceof Set ? q.caught : new Set(q.caught || []);
  const out = [];
  let total = 0;
  for (const sp of data.fish) {
    if (!sp.habitats.includes(q.habitat)) continue;
    if (sp.zones && q.zone && !sp.zones.includes(q.zone)) continue;
    if (sp.zones && !q.zone) continue;
    if (!sp.times.includes(q.phase)) continue;
    if (!baitMatches(sp, bait)) continue;
    if (!specialOK(sp, { ...q, bait })) continue;
    const wm = sp.weather?.[q.weather] ?? 1;
    if (wm <= 0) continue;
    const ri = RARITIES.indexOf(sp.rarity);
    let w = RARITY[sp.rarity].weight * wm * (bait.rarityMult?.[sp.rarity] ?? 1) * (1 + luck * ri * 1.5);
    if (bait.nightBonus && q.phase === 'night' && ri > 0) w *= bait.nightBonus;
    if (caught.has(sp.id) && RARITY[sp.rarity].repeatMult) w *= RARITY[sp.rarity].repeatMult;
    out.push({ id: sp.id, weight: w });
    total += w;
  }
  for (const j of data.junk) {
    if (!j.habitats.includes(q.habitat) || !j.times.includes(q.phase)) continue;
    if (j.zones && !j.zones.includes(q.zone)) continue;
    if (j.unique && exclude.has(j.id)) continue;
    out.push({ id: j.id, weight: Math.max(total, 50) * j.chance, junk: true });
  }
  return out;
}

/** Weighted pick from biteTable output. r = random in [0,1). */
export function pickWeighted(list, r = Math.random()) {
  const sum = list.reduce((s, e) => s + e.weight, 0);
  let x = r * sum;
  for (const e of list) { x -= e.weight; if (x <= 0) return e; }
  return list[list.length - 1] || null;
}

/** Random size in cm (skewed small, `sizeMult` > 1 from buffs/baits pushes it up), rounded to 0.5 cm. */
export function rollSize(sp, r = Math.random(), sizeMult = 1) {
  const [a, b] = sp.size;
  const t = Math.pow(r, 1.6 / Math.max(0.2, sizeMult));
  return Math.round((a + (b - a) * t) * 2) / 2;
}

/** Sell price for a specimen: base at mid size, 0.7x at min, 1.3x at max. */
export function priceFor(sp, size) {
  if (sp.junk || !sp.size || sp.size[1] <= sp.size[0]) return sp.price;
  const t = Math.min(1, Math.max(0, (size - sp.size[0]) / (sp.size[1] - sp.size[0])));
  return Math.max(1, Math.round(sp.price * (0.7 + 0.6 * t)));
}

/** Does an inventory/basket satisfy one recipe `needs` entry? Returns the matching fish/item ids. */
export function needMatches(data, need, id) {
  const it = data.items[id];
  if (!it) return false;
  if (need.id) return need.id === id;
  if (need.ids) return need.ids.includes(id);
  if (need.habitat) return it.kind === 'fish' && it.habitats.includes(need.habitat);
  if (need.fish === 'any') return it.kind === 'fish';
  return false;
}
