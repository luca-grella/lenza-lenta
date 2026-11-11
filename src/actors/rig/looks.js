// Character looks: the player's default outfit and normalisation of villager looks from src/data/npcs.js
// (with local defaults when the data is missing). A look is plain data consumed by model.js.

/** Rod colours by gear id (fallback when ctx.data has no rod model). */
export const ROD_MODELS = {
  rod_bamboo: { color: '#d8b86a', wrap: '#8a5532', tip: '#f2e6c0', length: 2.2, nodes: true },
  rod_sturdy: { color: '#8a5532', wrap: '#2f7d46', tip: '#f2e6c0', length: 2.3 },
  rod_carbon: { color: '#2a2e36', wrap: '#3fd0c9', tip: '#f2f2f2', length: 2.4 },
  rod_master: { color: '#1d4f7a', wrap: '#f5c542', tip: '#ffffff', length: 2.5 },
  rod_legendary: { color: '#f5c542', wrap: '#b8423a', tip: '#fff6d0', length: 2.6 },
};

/** Hat colours by cosmetic id (fallback when ctx.data has no cosmetics). */
export const HAT_COLORS = {
  hat_straw: { color: '#e8c872', band: '#b8423a' },
  hat_sky: { color: '#e8c872', band: '#3fa8d8' },
  hat_mint: { color: '#e8c872', band: '#5ac08a' },
  hat_sunset: { color: '#f2a860', band: '#7d3d24' },
  hat_night: { color: '#2a3a5a', band: '#f5c542' },
  hat_golden: { color: '#f5c542', band: '#ffffff' },
  hat_pirate: { color: '#2a2a2a', band: '#e8e8e8' },
};

/** The fisherman, or [11 nov] the fisherwoman (gender 'f'): same skeleton and clothes, own hair, lashes and figure. */
export function playerLook(gender = 'm') {
  const f = gender === 'f';
  return {
    id: 'player', build: 'normal', height: 1, skin: '#f2c29b', eyes: '#2a1d14', blush: f ? '#f28f86' : '#f09a86',
    hair: f ? { style: 'braids', color: '#8a4424' } : { style: 'short', color: '#5a3a24' }, beard: { style: 'none' },
    figure: f ? 'f' : null, lashes: f,
    hat: { type: 'straw', color: '#e8c872', band: '#b8423a' },
    shirt: { style: 'vest', color: '#5f8a4e', color2: '#f3ead2' },
    pants: { style: 'trousers', color: '#4d6f9c', cuff: '#86a3c8', belt: '#6b4430' },
    apron: null, glasses: null, boots: '#7a4a2a',
    pack: { color: '#c9a25e', strap: '#6b4430' },
    rod: { id: 'rod_bamboo', ...ROD_MODELS.rod_bamboo },
    props: [],
  };
}

/** Local villager defaults (used only if src/data/npcs.js is not available). Same schema as the data. */
export const FALLBACK_NPCS = [
  { id: 'gino', look: { build: 'round', height: 1.05, skin: '#e2a77c', hair: { style: 'short', color: '#3a3430' }, beard: { style: 'mustache', color: '#3a3430' }, hat: { type: 'sailor', color: '#f2f2ee' }, shirt: { style: 'striped', color: '#2f5f9a', color2: '#f4f4f0' }, pants: { style: 'trousers', color: '#3a4a5a' }, apron: { color: '#4a90c0' }, props: ['net'] },
    routine: { dawn: { poi: 'dock_village', act: 'work' }, day: { poi: 'village_pescheria', act: 'shop' }, dusk: { poi: 'bench_village', act: 'sit' }, night: { poi: 'npc_gino', act: 'sleep', talk: false } }, personality: { idle: ['laugh', 'wave'] } },
  { id: 'rosa', look: { build: 'round', height: 0.95, skin: '#f0c49a', hair: { style: 'bun', color: '#9a4a2a' }, hat: { type: 'bandana', color: '#e8453a' }, shirt: { style: 'blouse', color: '#f2e2b0' }, pants: { style: 'skirt', color: '#6a8a4a' }, apron: { color: '#c8e0a0', trim: '#e8453a' }, glasses: { color: '#7a4a2a', shape: 'round' }, props: ['broom'] },
    routine: { dawn: { poi: 'village_bottega', act: 'sweep' }, day: { poi: 'village_bottega', act: 'shop' }, dusk: { poi: 'dock_village', act: 'walk' }, night: { poi: 'npc_rosa', act: 'sleep', talk: false } }, personality: { idle: ['look', 'tidy'] } },
];

const HEX = /^#?[0-9a-f]{6}$/i;
const c = (v, d) => (typeof v === 'string' && HEX.test(v) ? (v[0] === '#' ? v : '#' + v) : d);

/** Normalise a (possibly partial) look into the full schema the mesh builder expects. */
export function normalizeLook(raw = {}, id = 'npc') {
  const L = raw || {};
  const hair = typeof L.hair === 'string' ? { style: L.hair } : (L.hair || {});
  const beard = typeof L.beard === 'string' ? { style: L.beard } : (L.beard || {});
  const hat = typeof L.hat === 'string' ? { type: L.hat } : (L.hat || {});
  const shirt = typeof L.shirt === 'string' ? { style: 'tshirt', color: L.shirt } : (L.shirt || {});
  const pants = typeof L.pants === 'string' ? { style: 'trousers', color: L.pants } : (L.pants || {});
  const out = {
    id,
    build: ['normal', 'round', 'stocky', 'thin', 'small'].includes(L.build) ? L.build : 'normal',
    height: Number.isFinite(L.height) ? Math.min(1.25, Math.max(0.75, L.height)) : 1,
    skin: c(L.skin, '#f0c49a'), eyes: c(L.eyes, '#2a1d14'), blush: c(L.blush, '#f09a86'),
    hair: { style: hair.style || 'short', color: c(hair.color, '#4a3424') },
    beard: { style: beard.style || 'none', color: c(beard.color, c(hair.color, '#4a3424')) },
    hat: { type: hat.type || 'none', color: c(hat.color, '#e8c872'), band: c(hat.band, '#b8423a') },
    shirt: { style: shirt.style || 'tshirt', color: c(shirt.color, '#6a9ac8'), color2: c(shirt.color2, '#f4f0e4') },
    pants: { style: pants.style || 'trousers', color: c(pants.color, '#4a5a7a'), cuff: c(pants.cuff, null), belt: c(pants.belt, '#5a3a24') },
    apron: L.apron ? { color: c(L.apron.color, '#ffffff'), trim: c(L.apron.trim, null) } : null,
    glasses: L.glasses ? { color: c(L.glasses.color, '#3a3a3a'), shape: L.glasses.shape === 'square' ? 'square' : 'round' } : null,
    boots: c(typeof L.boots === 'string' ? L.boots : null, '#5a3a28'),
    figure: L.figure === 'f' ? 'f' : null, lashes: !!L.lashes,
    pack: L.pack ? { color: c(L.pack.color, '#c9a25e'), strap: c(L.pack.strap, '#6b4430') } : null,
    rod: L.rod ? { ...ROD_MODELS.rod_bamboo, ...L.rod } : null,
    props: Array.isArray(L.props) ? L.props.filter(p => ['net', 'broom', 'hammer', 'ladle', 'notebook', 'spyglass'].includes(p)) : [],
  };
  return out;
}
