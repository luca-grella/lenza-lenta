// Ambient creatures (not catchable). Used by the Creatures area to decide what to spawn where/when.
// zones: where they live; spot?: preferred POI; times: active phases (outside them they hide/sleep);
// weather: spawn multipliers (0 = absent); count: how many around the player at once (high quality; scale down on low);
// chance?: for rare sightings, probability per game hour that a group appears; behavior: animation/motion hint;
// look: colours for the procedural model. Names: i18n `creature.<id>.name` (Journal "seen" list, tooltips).

const ALL = ['dawn', 'day', 'dusk', 'night'];

const creatures = [
  { id: 'cat', zones: ['home_beach', 'village'], spot: 'village_trattoria', times: ALL, weather: {}, count: 1, unique: true,
    behavior: 'companion', befriend: { feeds: 3, accepts: 'fish' },
    look: { fur: '#e8a050', stripes: '#b8642a', belly: '#fff4e0', eyes: '#7ac05a', nose: '#e88a8a' } },
  { id: 'seagull', zones: ['village', 'home_beach', 'lighthouse', 'palm_islet', 'turtle_isle'], times: ['dawn', 'day', 'dusk'],
    weather: { storm: 0.3, rain: 0.6 }, count: 6, behavior: 'fly_land',
    look: { body: '#f6f6f2', wing: '#b8c0c8', tip: '#3a3a3a', beak: '#f2c63a' } },
  { id: 'crab', zones: ['home_beach', 'palm_islet', 'turtle_isle', 'lighthouse'], times: ['dawn', 'dusk', 'night'],
    weather: { rain: 1.3 }, count: 6, behavior: 'scuttle',
    look: { shell: '#d8582a', claw: '#e8784a', eyes: '#2a2a2a' } },
  { id: 'turtle', zones: ['turtle_isle'], spot: 'turtle_isle_beach', times: ['dawn', 'day', 'dusk'], weather: { rain: 0.5 }, count: 4,
    behavior: 'swim_sunbathe', look: { shell: '#6a7a3a', pattern: '#a8a85a', skin: '#8aa07a' } },
  { id: 'frog', zones: ['waterfall', 'meadow'], spot: 'waterfall_pond', times: ['dusk', 'night', 'dawn'], weather: { rain: 1.6 }, count: 5,
    behavior: 'hop_croak', look: { skin: '#6ab04a', belly: '#e8e8a0', spots: '#3a7a2a' } },
  { id: 'butterfly', zones: ['meadow', 'pine_forest', 'home_beach', 'village', 'waterfall'], times: ['day'],
    weather: { clear: 1.3, rain: 0, storm: 0, fog: 0.4 }, count: 12, behavior: 'flutter',
    look: { colors: ['#f8d040', '#f2a0c0', '#7ac0f0', '#ffffff', '#f2843a'] } },
  { id: 'firefly', zones: ['meadow', 'pine_forest', 'waterfall', 'home_beach'], times: ['dusk', 'night'],
    weather: { rain: 0.2, storm: 0 }, count: 40, behavior: 'drift_glow', look: { glow: '#e8ff7a' } },
  { id: 'dolphin', zones: ['lighthouse', 'palm_islet', 'turtle_isle'], times: ['dawn', 'day'], weather: { clear: 1.5, storm: 0 },
    count: 3, chance: 0.15, behavior: 'leap', look: { back: '#5a7a9a', belly: '#e8eef2' } },
  { id: 'rabbit', zones: ['meadow', 'pine_forest'], times: ['dawn', 'dusk'], weather: { rain: 0.3 }, count: 4,
    behavior: 'hop_flee', look: { fur: '#c8a888', tail: '#ffffff', ears: '#e8c0b0' } },
  { id: 'deer', zones: ['pine_forest'], times: ['dawn', 'dusk'], weather: { fog: 1.6 }, count: 2, chance: 0.4,
    behavior: 'graze_flee', look: { fur: '#a8724a', spots: '#f2e2c8', belly: '#e8d8c0' } },
  { id: 'jellyfish', zones: ['sea_cave'], spot: 'cave_pool', times: ALL, weather: {}, count: 8, behavior: 'pulse_drift',
    look: { bell: '#bfe0ff', glow: '#9af7ff', nightGlow: true } },
  { id: 'heron', zones: ['pine_forest', 'waterfall'], spot: 'river_bridge', times: ['dawn', 'day'], weather: {}, count: 1,
    behavior: 'wade_still', look: { body: '#c8ccd4', wing: '#8a929e', beak: '#e8b03a' } },
  { id: 'dragonfly', zones: ['waterfall', 'pine_forest'], times: ['day'], weather: { clear: 1.3, rain: 0 }, count: 6,
    behavior: 'dart_hover', look: { body: '#3ab0c0', wing: '#e8f8ff' } },
  { id: 'duck', zones: ['waterfall'], spot: 'waterfall_pond', times: ['dawn', 'day', 'dusk'], weather: { rain: 1.2 }, count: 3,
    behavior: 'paddle', look: { body: '#a88a6a', head: '#2a7a4a', beak: '#f2c63a' } },
];

for (const c of creatures) c.nameKey = `creature.${c.id}.name`;

/** Swimming fish shadows near the player, per habitat (Creatures `fishShadows`; scale down on low quality). */
export const fishShadows = { pond: 6, river: 6, shore: 8, harbor: 8, deep: 7, reef: 12, cave: 5 };

export default creatures;
