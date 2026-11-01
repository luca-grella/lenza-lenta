// Persistent save in localStorage with defaults, deep-merge, versioned migrations, debounced commit.

export const SAVE_KEY = 'lenza-lenta-v2';
export const SAVE_VERSION = 1;

/** Fresh default state (schema from docs/ARCHITECTURE.md). Each module owns its sub-object. */
export function defaultState() {
  return {
    v: SAVE_VERSION,
    lang: null, // null until the player picks a language (first launch)
    settings: { music: 0.7, sfx: 0.8, quality: 'auto', haptics: true },
    player: { x: null, z: null, facing: 0, outfit: {} },
    time: { hours: 8.5, day: 1 },
    weather: { type: 'clear' },
    coins: 0,
    basket: [],
    items: {},
    equip: { rod: 'rod_bamboo', reel: 'reel_basic', line: 'line_cotton', bait: 'bait_worm', hat: 'hat_straw' },
    owned: { rod_bamboo: true, reel_basic: true, line_cotton: true, basket_small: true, hat_straw: true },
    journal: {},
    aquarium: {},
    quests: { story: 0, progress: {}, dailies: [], done: {} },
    home: { tier: 0, decor: {} },
    boat: { repaired: false, level: 0, at: 'home' },
    cat: { friend: 0, following: false },
    forage: { day: 0, picked: {} },
    buffs: [],
    stats: {},
    meta: { created: Date.now(), saved: 0, playSeconds: 0 },
  };
}

/** Migrations: key = version being upgraded FROM. Each receives the raw object and returns it upgraded. */
const MIGRATIONS = {
  // 1: s => { ...; s.v = 2; return s; },
};

const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
/** Fill missing keys of `target` from `defaults` recursively (arrays and existing values are kept). */
function fillDefaults(target, defaults) {
  for (const k in defaults) {
    if (!(k in target) || target[k] === undefined) target[k] = structuredClone(defaults[k]);
    else if (isObj(target[k]) && isObj(defaults[k])) fillDefaults(target[k], defaults[k]);
  }
  return target;
}

function storage() {
  try { const s = window.localStorage; s.getItem(SAVE_KEY); return s; } catch { return null; }
}

/**
 * @param {{bus:any, debounceMs?:number, key?:string}} opts
 */
export function createSave({ bus, debounceMs = 800, key = SAVE_KEY }) {
  const ls = storage();
  let timer = 0, firstLaunch = true, writeFailures = 0;

  function load() {
    let raw = null;
    try { raw = ls?.getItem(key); } catch { raw = null; }
    if (!raw) return defaultState();
    try {
      let s = JSON.parse(raw);
      if (!isObj(s)) return defaultState();
      firstLaunch = false;
      let v = +s.v || 1;
      while (v < SAVE_VERSION && MIGRATIONS[v]) { s = MIGRATIONS[v](s) || s; v = +s.v || v + 1; }
      s.v = SAVE_VERSION;
      return fillDefaults(s, defaultState());
    } catch (e) {
      console.warn('[save] corrupted save, backing it up and starting fresh', e);
      try { ls?.setItem(key + ':corrupt', raw); } catch { /* ignore */ }
      return defaultState();
    }
  }

  function write() {
    clearTimeout(timer); timer = 0;
    if (!ls) return false;
    bus?.emit('save:before', { state: save.state }); // modules write their last-moment values (player position)
    try {
      save.state.meta.saved = Date.now();
      ls.setItem(key, JSON.stringify(save.state));
      return true;
    } catch (e) {
      if (writeFailures++ < 3) console.warn('[save] write failed', e);
      return false;
    }
  }

  const save = {
    /** The live state object. Mutate your own sub-object, then call commit(). */
    state: load(),
    /** True if no save existed when the game started (or after reset()). */
    get firstLaunch() { return firstLaunch; },
    /** True if localStorage is usable. */
    available: !!ls,
    key,
    /** Schedule a debounced write. */
    commit() { if (!timer) timer = setTimeout(write, debounceMs); },
    /** Write immediately. Returns true on success. */
    flush: write,
    /** Wipe everything and start over (state object identity changes: always read ctx.save.state). */
    reset() {
      save.state = defaultState();
      firstLaunch = true;
      write();
      bus?.emit('save:reset', { state: save.state });
      bus?.emit('save:loaded', { state: save.state, reset: true });
    },
    /** Export the current state as a JSON string (for backups). */
    export() { return JSON.stringify(save.state); },
    /** Replace the state from a JSON string or object. Returns true on success. */
    import(data) {
      try {
        const s = typeof data === 'string' ? JSON.parse(data) : structuredClone(data);
        if (!isObj(s)) return false;
        save.state = fillDefaults(s, defaultState());
        write();
        bus?.emit('save:loaded', { state: save.state, imported: true });
        return true;
      } catch { return false; }
    },
  };

  const flushNow = () => { if (timer) write(); };
  window.addEventListener('pagehide', () => write());
  document.addEventListener('visibilitychange', () => { if (document.hidden) write(); });
  window.addEventListener('beforeunload', flushNow);
  return save;
}
