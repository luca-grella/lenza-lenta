// Villagers of Porto Lento. Names/roles/lines: i18n `npc.<id>.name`, `npc.<id>.role`, `npc.<id>.<group>.<n>`.
// look: params for the procedural rig (Characters area). Colours are hex; styles are suggestions with fallbacks:
//   build round|stocky|thin|small (body proportions), height (x player height), skin,
//   hair {style: short|bun|bald|curly|ponytail|long|side, color}, beard {style: none|mustache|full|goatee|stubble, color},
//   hat {type: none|cap|sailor|beanie|bandana|chef|straw|kerchief, color}, shirt {style: tshirt|striped|vest|sweater|flannel|blouse, color, color2?},
//   pants {style: trousers|shorts|skirt|overalls, color}, apron {color, trim?}|null, glasses {color, shape: round|square}|null,
//   boots?, props? [items held or worn: spyglass, notebook, ladle, hammer, broom, net].
// home: POI where the NPC lives/works; `fallback` POI is used if World has no such POI.
// routine: where to be per time phase: {poi, fallback, act}; act = work|shop|sit|walk|sleep|fish|cook|watch|forage|sweep.
//   `talk: false` = asleep indoors (cannot be talked to; shop closed).
// personality: short hints for animation flavour (idle anim choices, talk speed). `voice`: pitch for procedural blips.
// shop: shop id they run (shops.js).  dialogKeys: arrays of i18n keys by situation.

const lines = (id, group, n) => Array.from({ length: n }, (_, i) => `npc.${id}.${group}.${i + 1}`);
const keys = (id) => ({
  hello: lines(id, 'hello', 3),
  chat: lines(id, 'chat', 6),
  shop: lines(id, 'shop', 2),
  rain: lines(id, 'rain', 1),
  night: lines(id, 'night', 1),
  thanks: lines(id, 'thanks', 2),
  legend: lines(id, 'legend', 1),
});

const npcs = [
  { id: 'gino', role: 'fishmonger', shop: 'pescheria', home: 'npc_gino', fallback: 'village_pescheria',
    look: { build: 'round', height: 1.05, skin: '#e2a77c',
      hair: { style: 'short', color: '#3a3430' }, beard: { style: 'mustache', color: '#3a3430' },
      hat: { type: 'sailor', color: '#f2f2ee' }, shirt: { style: 'striped', color: '#2f5f9a', color2: '#f4f4f0' },
      pants: { style: 'trousers', color: '#3a4a5a' }, apron: { color: '#4a90c0' }, glasses: null, boots: '#2a2a2a', props: ['net'] },
    routine: {
      dawn: { poi: 'dock_village', act: 'work' },
      day: { poi: 'village_pescheria', act: 'shop' },
      dusk: { poi: 'bench_village', fallback: 'dock_village', act: 'sit' },
      night: { poi: 'npc_gino', fallback: 'village_pescheria', act: 'sleep', talk: false },
    },
    personality: { traits: ['loud', 'generous', 'jokes'], idle: ['laugh', 'wave'], talkSpeed: 1.15 }, voice: 0.8 },

  { id: 'rosa', role: 'shopkeeper', shop: 'bottega', home: 'npc_rosa', fallback: 'village_bottega',
    look: { build: 'round', height: 0.95, skin: '#f0c49a',
      hair: { style: 'bun', color: '#9a4a2a' }, beard: { style: 'none' },
      hat: { type: 'bandana', color: '#e8453a' }, shirt: { style: 'blouse', color: '#f2e2b0' },
      pants: { style: 'skirt', color: '#6a8a4a' }, apron: { color: '#c8e0a0', trim: '#e8453a' },
      glasses: { color: '#7a4a2a', shape: 'round' }, props: ['broom'] },
    routine: {
      dawn: { poi: 'village_bottega', act: 'sweep' },
      day: { poi: 'village_bottega', act: 'shop' },
      dusk: { poi: 'dock_village', act: 'walk' },
      night: { poi: 'npc_rosa', fallback: 'village_bottega', act: 'sleep', talk: false },
    },
    personality: { traits: ['chatty', 'kind', 'curious'], idle: ['look', 'tidy'], talkSpeed: 1.25 }, voice: 1.25 },

  { id: 'tonio', role: 'carpenter', shop: 'falegname', home: 'npc_tonio', fallback: 'village_falegname',
    look: { build: 'stocky', height: 1.1, skin: '#c98a5e',
      hair: { style: 'bald', color: '#6a4a2a' }, beard: { style: 'full', color: '#6a4a2a' },
      hat: { type: 'beanie', color: '#c8602a' }, shirt: { style: 'flannel', color: '#b8423a', color2: '#5a2a24' },
      pants: { style: 'overalls', color: '#4a5a7a' }, apron: { color: '#8a5532' }, glasses: null, props: ['hammer'] },
    routine: {
      dawn: { poi: 'village_falegname', act: 'work' },
      day: { poi: 'village_falegname', act: 'shop' },
      dusk: { poi: 'boat_mooring_village', act: 'work' },
      night: { poi: 'npc_tonio', fallback: 'village_falegname', act: 'sleep', talk: false },
    },
    personality: { traits: ['gruff', 'soft-hearted', 'few words'], idle: ['stretch', 'look'], talkSpeed: 0.85 }, voice: 0.65 },

  { id: 'pina', role: 'cook', shop: 'trattoria', home: 'npc_pina', fallback: 'village_trattoria',
    look: { build: 'small', height: 0.85, skin: '#f2c8a8',
      hair: { style: 'bun', color: '#ececec' }, beard: { style: 'none' },
      hat: { type: 'kerchief', color: '#f2a0b0' }, shirt: { style: 'blouse', color: '#6a7ab8' },
      pants: { style: 'skirt', color: '#3a3a4a' }, apron: { color: '#ffffff', trim: '#d84a3a' },
      glasses: { color: '#c8a050', shape: 'round' }, props: ['ladle'] },
    routine: {
      dawn: { poi: 'forage_meadow', fallback: 'village_trattoria', act: 'forage' },
      day: { poi: 'village_trattoria', act: 'shop' },
      dusk: { poi: 'village_trattoria', act: 'cook' },
      night: { poi: 'village_trattoria', act: 'cook' },
    },
    personality: { traits: ['motherly', 'feeds everyone', 'teasing'], idle: ['wipe_hands', 'laugh'], talkSpeed: 1.0 }, voice: 1.15 },

  { id: 'marta', role: 'aquarist', shop: 'aquarium', home: 'npc_marta', fallback: 'village_aquarium',
    look: { build: 'thin', height: 1.0, skin: '#a86e48',
      hair: { style: 'curly', color: '#2a1a14' }, beard: { style: 'none' },
      hat: { type: 'cap', color: '#3fd0c9' }, shirt: { style: 'tshirt', color: '#3fa8b8' },
      pants: { style: 'shorts', color: '#e8dcb8' }, apron: null,
      glasses: { color: '#2a6aa0', shape: 'square' }, boots: '#f2c63a', props: ['notebook'] },
    routine: {
      dawn: { poi: 'waterfall_pond', fallback: 'village_aquarium', act: 'watch' },
      day: { poi: 'village_aquarium', act: 'shop' },
      dusk: { poi: 'dock_village', act: 'fish' },
      night: { poi: 'npc_marta', fallback: 'village_aquarium', act: 'sleep', talk: false },
    },
    personality: { traits: ['enthusiastic', 'nerdy', 'fast talker'], idle: ['write', 'adjust_glasses'], talkSpeed: 1.3 }, voice: 1.35 },

  { id: 'ettore', role: 'lighthouse_keeper', shop: null, home: 'npc_ettore', fallback: 'lighthouse_top',
    look: { build: 'thin', height: 1.12, skin: '#e6b896',
      hair: { style: 'side', color: '#f2f2f2' }, beard: { style: 'full', color: '#f4f4f4' },
      hat: { type: 'sailor', color: '#22304a' }, shirt: { style: 'sweater', color: '#2a3a5a' },
      pants: { style: 'trousers', color: '#5a4a3a' }, apron: null, glasses: null, boots: '#3a2a20', props: ['spyglass'] },
    routine: {
      dawn: { poi: 'bench_lighthouse', fallback: 'lighthouse_top', act: 'fish' },
      day: { poi: 'bench_lighthouse', fallback: 'lighthouse_top', act: 'sit' },
      dusk: { poi: 'lighthouse_top', act: 'watch' },
      night: { poi: 'lighthouse_top', act: 'watch' },
    },
    personality: { traits: ['slow', 'poetic', 'sleepy by day'], idle: ['yawn', 'spyglass'], talkSpeed: 0.75 }, voice: 0.55 },
];

for (const n of npcs) {
  n.nameKey = `npc.${n.id}.name`;
  n.roleKey = `npc.${n.id}.role`;
  n.dialogKeys = keys(n.id);
}

/** Non-villager speakers that can appear in dialogs (no rig). */
export const speakers = [
  { id: 'letter', nameKey: 'npc.letter.name' },
  { id: 'cat', nameKey: 'npc.cat.name' },
];

export default npcs;
