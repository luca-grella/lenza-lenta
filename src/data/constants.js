// Shared enumerations used by every data file (and handy for other areas).
// Labels: i18n keys `habitat.<id>`, `rarity.<id>`, `phase.<id>`, `weather.<id>`, `behavior.<id>`, `zone.<id>.name`.

export const HABITATS = ['pond', 'river', 'shore', 'harbor', 'deep', 'reef', 'cave'];

export const ZONES = ['home_beach', 'village', 'pine_forest', 'waterfall', 'meadow', 'lighthouse', 'sea_cave', 'palm_islet', 'turtle_isle'];

export const PHASES = ['dawn', 'day', 'dusk', 'night'];
/** Game-hour ranges of each phase (start inclusive, end exclusive, night wraps). */
export const PHASE_HOURS = { dawn: [5, 8], day: [8, 18], dusk: [18, 21], night: [21, 5] };

export const WEATHERS = ['clear', 'cloudy', 'rain', 'fog', 'storm'];

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** Base pick weight per rarity (relative), UI colour, catch-card jingle (ctx.audio sfx name), goodwill when released. */
export const RARITY = {
  common:    { weight: 100, color: '#8fbf6a', jingle: 'catch_jingle', release: 1 },
  uncommon:  { weight: 38,  color: '#4fb3d9', jingle: 'catch_jingle', release: 2 },
  rare:      { weight: 12,  color: '#a57be0', jingle: 'rare_jingle',  release: 4 },
  epic:      { weight: 4,   color: '#f08a3c', jingle: 'rare_jingle',  release: 8 },
  // Legendaries only enter the table when every `special` condition holds, so their weight is high on purpose.
  // repeatMult: weight multiplier once the player already has this legendary in the Journal (no farming).
  legendary: { weight: 25,  color: '#f5c542', jingle: 'rare_jingle',  release: 20, repeatMult: 0.15 },
};

/**
 * Reel-minigame behaviour presets (suggested values for Gameplay; free to retune).
 * pull: how hard the fish pulls (tension/s while reeling), burst: chance per second of a strong run,
 * rest: seconds of calm between pulls, jump: chance per second to leap (only jumpers),
 * swerve: sideways motion amount (zigzag), stamina: seconds of reeling to tire it at difficulty 0.5.
 */
export const BEHAVIORS = {
  calm:   { pull: 0.35, burst: 0.05, rest: [2.2, 3.5], jump: 0,    swerve: 0.1, stamina: 7 },
  darter: { pull: 0.55, burst: 0.22, rest: [0.8, 1.6], jump: 0,    swerve: 0.3, stamina: 8 },
  heavy:  { pull: 0.75, burst: 0.08, rest: [1.6, 2.6], jump: 0,    swerve: 0.1, stamina: 12 },
  jumper: { pull: 0.5,  burst: 0.12, rest: [1.2, 2.2], jump: 0.25, swerve: 0.2, stamina: 9 },
  zigzag: { pull: 0.5,  burst: 0.15, rest: [0.9, 1.8], jump: 0,    swerve: 0.8, stamina: 9 },
};

/** Which habitats are typically found in which zone (for hints, map and validation). */
export const ZONE_HABITATS = {
  home_beach: ['shore'],
  village: ['harbor', 'shore'],
  pine_forest: ['river'],
  waterfall: ['pond', 'river'],
  meadow: ['river'],
  lighthouse: ['deep', 'shore'],
  sea_cave: ['cave'],
  palm_islet: ['reef', 'shore', 'deep'],
  turtle_isle: ['shore', 'deep'],
};

/** Buff stats produced by recipes (Systems `buffs.mult(stat)`). Label key `buff.<stat>.name`. */
export const BUFF_STATS = ['luck', 'size', 'calm', 'reel', 'bite', 'forage', 'speed', 'price'];

/** POIs guaranteed by World (ARCHITECTURE.md). Wildcards: bench_*, forage_*, npc_*. */
export const POIS = ['home_bed', 'home_campfire', 'village_bottega', 'village_pescheria', 'village_falegname',
  'village_trattoria', 'village_aquarium', 'dock_home', 'dock_village', 'boat_mooring_home', 'boat_mooring_village',
  'lighthouse_top', 'cave_entrance', 'cave_pool', 'waterfall_pond', 'river_bridge', 'palm_islet_beach',
  'turtle_isle_beach', 'treasure'];
export const POI_PREFIXES = ['bench_', 'forage_', 'npc_'];

/** Events the quest data relies on (ARCHITECTURE.md bus table + Content additions, see CHANGES.md). */
export const QUEST_EVENTS = ['fishing:catch', 'shop:sell', 'shop:buy', 'npc:talk', 'cook:done', 'aquarium:donate',
  'cat:befriend', 'forage:pick', 'zone:enter', 'boat:board', 'home:upgrade', 'deliver', 'treasure:open', 'quest:complete'];
