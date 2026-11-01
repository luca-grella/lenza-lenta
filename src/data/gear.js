// Gear and upgrades. Names: i18n `item.<id>.name` / `.desc`. `owned: true` = the player starts with it.
// Stats are multipliers around 1 (starter gear) unless noted; Gameplay reads them in the reel minigame:
//   rod.cast      max cast distance in world units          rod.power  reel progress speed x
//   rod.luck      + added to rarity roll (0..0.3)            rod.control less swerve from zigzag/jumper fish x
//   reel.tolerance max tension before the line is at risk x  reel.recovery tension drop speed when released x
//   reel.speed    reel-in speed x
//   line.strength break threshold x (tension over 1.0 * strength for > grace seconds snaps the line)
//   line.grace    seconds of over-tension allowed before snapping        line.stealth bite wait x (lower = faster)
// `model` gives colours for the Characters area (rod mesh on the player).
// `unlock`: shown in the shop only once the condition holds ({quest: id} = that story step is complete).

export const rods = [
  { id: 'rod_bamboo', price: 0, owned: true, stats: { cast: 9, power: 1.0, luck: 0, control: 1.0 },
    model: { color: '#d8b86a', wrap: '#8a5532', tip: '#f2e6c0', length: 2.2 } },
  { id: 'rod_sturdy', price: 350, stats: { cast: 11, power: 1.15, luck: 0.02, control: 1.1 },
    model: { color: '#8a5532', wrap: '#2f7d46', tip: '#f2e6c0', length: 2.3 } },
  { id: 'rod_carbon', price: 1200, unlock: { quest: 'q_trout' }, stats: { cast: 13, power: 1.3, luck: 0.05, control: 1.2 },
    model: { color: '#2a2e36', wrap: '#3fd0c9', tip: '#f2f2f2', length: 2.4 } },
  { id: 'rod_master', price: 3200, unlock: { quest: 'q_reef' }, stats: { cast: 15, power: 1.5, luck: 0.1, control: 1.35 },
    model: { color: '#1d4f7a', wrap: '#f5c542', tip: '#ffffff', length: 2.5 } },
  { id: 'rod_legendary', price: 7500, unlock: { quest: 'q_lighthouse' }, stats: { cast: 18, power: 1.8, luck: 0.2, control: 1.6 },
    model: { color: '#f5c542', wrap: '#b8423a', tip: '#fff6d0', length: 2.6, glow: '#ffe7a0' } },
];

export const reels = [
  { id: 'reel_basic', price: 0, owned: true, stats: { tolerance: 1.0, recovery: 1.0, speed: 1.0 },
    model: { color: '#9a9a9a', accent: '#5a5a5a' } },
  { id: 'reel_smooth', price: 600, stats: { tolerance: 1.2, recovery: 1.3, speed: 1.1 },
    model: { color: '#3a7ab0', accent: '#d8d8d8' } },
  { id: 'reel_pro', price: 2200, unlock: { quest: 'q_islet' }, stats: { tolerance: 1.45, recovery: 1.6, speed: 1.25 },
    model: { color: '#b8423a', accent: '#f5c542' } },
];

export const lines = [
  { id: 'line_cotton', price: 0, owned: true, stats: { strength: 1.0, grace: 1.2, stealth: 1.0 },
    model: { color: '#f4ecd8' } },
  { id: 'line_nylon', price: 400, stats: { strength: 1.25, grace: 1.5, stealth: 0.9 },
    model: { color: '#cfeff0' } },
  { id: 'line_braided', price: 1600, unlock: { quest: 'q_boat' }, stats: { strength: 1.55, grace: 2.0, stealth: 0.8 },
    model: { color: '#7ad08a' } },
];

/** Basket tiers: `capacity` = fish the basket holds before you must sell. */
export const baskets = [
  { id: 'basket_small', price: 0, owned: true, tier: 0, capacity: 8 },
  { id: 'basket_medium', price: 250, tier: 1, capacity: 12 },
  { id: 'basket_large', price: 900, tier: 2, capacity: 18, unlock: { quest: 'q_cook' } },
  { id: 'basket_grand', price: 2400, tier: 3, capacity: 24, unlock: { quest: 'q_boat' } },
];

/** Lantern: needed to fish in the Sea Cave; small night bonus everywhere. */
export const lantern = {
  id: 'lantern', price: 450, unlock: { quest: 'q_ettore' },
  stats: { lightRadius: 7, nightBite: 1.15, cave: true },
  model: { color: '#b8623b', glass: '#ffe7a0', light: '#ffc870' },
};

/** Rowboat. `boat_repair` is bought from Tonio during the story (q_boat); the others raise `boat.level`.
 *  `needs`: items consumed on purchase besides coins (shop must check and remove them). */
export const boat = [
  { id: 'boat_repair', price: 500, needs: { ing_driftwood: 3 }, level: 0, stats: { speed: 1.0 }, unlock: { quest: 'q_driftwood' }, story: true },
  { id: 'boat_oars', price: 900, level: 1, stats: { speed: 1.3 }, unlock: { quest: 'q_islet' } },
  { id: 'boat_sail', price: 2800, level: 2, stats: { speed: 1.65 }, unlock: { quest: 'q_lighthouse' } },
];

/** Cosmetics (player hat colours, cat collars). `slot` tells Characters/Creatures what to recolour. */
export const cosmetics = [
  { id: 'hat_straw', price: 0, owned: true, slot: 'hat', color: '#e8c872', band: '#b8423a' },
  { id: 'hat_sky', price: 120, slot: 'hat', color: '#e8c872', band: '#3fa8d8' },
  { id: 'hat_mint', price: 120, slot: 'hat', color: '#e8c872', band: '#5ac08a' },
  { id: 'hat_sunset', price: 180, slot: 'hat', color: '#f2a860', band: '#7d3d24' },
  { id: 'hat_night', price: 250, slot: 'hat', color: '#2a3a5a', band: '#f5c542' },
  { id: 'hat_golden', price: 0, slot: 'hat', color: '#f5c542', band: '#ffffff', reward: true },
  { id: 'hat_pirate', price: 0, slot: 'hat', color: '#2a2a2a', band: '#e8e8e8', reward: true },
  { id: 'collar_red', price: 0, slot: 'cat_collar', color: '#d84a3a', bell: '#f5c542', reward: true },
  { id: 'collar_blue', price: 90, slot: 'cat_collar', color: '#3a7ad8', bell: '#f5c542' },
  { id: 'collar_flower', price: 140, slot: 'cat_collar', color: '#f2a0c0', bell: '#ffffff' },
];

const tag = (list, kind) => { for (const g of list) { g.kind = kind; g.nameKey = `item.${g.id}.name`; g.descKey = `item.${g.id}.desc`; } };
tag(rods, 'rod'); tag(reels, 'reel'); tag(lines, 'line'); tag(baskets, 'basket'); tag([lantern], 'lantern');
tag(boat, 'boat'); tag(cosmetics, 'cosmetic');

/** Everything that is bought once and kept (shown in shops as "owned" afterwards). */
export const upgrades = [...baskets, lantern, ...boat, ...cosmetics];

export default { rods, reels, lines, baskets, lantern, boat, cosmetics, upgrades };
