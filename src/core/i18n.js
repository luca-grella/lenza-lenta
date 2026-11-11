// Minimal i18n: flat key → string tables for 'it' and 'en', {var} interpolation, simple plurals.

export const LANGS = ['it', 'en'];

/**
 * @param {{save:any, bus:any}} opts
 */
export function createI18n({ save, bus }) {
  const tables = { it: Object.create(null), en: Object.create(null) };
  const warned = new Set();
  const listeners = new Set();
  const detect = () => {
    const navs = [...(navigator.languages || []), navigator.language || ''];
    for (const l of navs) { const c = String(l).slice(0, 2).toLowerCase(); if (LANGS.includes(c)) return c; }
    return 'en';
  };
  const saved = save?.state?.lang;
  let lang = LANGS.includes(saved) ? saved : detect();

  // [11 nov] the player can be a man or a woman: {g|pescatore|pescatrice} picks by save.state.player.gender ('f' = woman)
  const female = () => save?.state?.player?.gender === 'f';
  function interpolate(str, vars) {
    if (typeof str !== 'string') return str;
    if (str.includes('{g|')) str = str.replace(/\{g\|([^}|]*)\|([^}]*)\}/g, (m, man, woman) => (female() ? woman : man));
    if (!vars) return str;
    return str.replace(/\{(\w+)(?:\|([^}|]*)\|([^}]*))?\}/g, (m, k, one, many) => {
      const v = vars[k];
      if (one !== undefined) return Number(v) === 1 ? one : many; // {n|pesce|pesci}
      return v === undefined || v === null ? m : String(v);
    });
  }

  const playerName = () => String(save?.state?.player?.name || '').trim() || interpolate(tables[lang]['ui.name.fallback'] || 'friend');

  const i18n = {
    get lang() { return lang; },
    /** True once the player explicitly picked a language (saved). */
    get chosen() { return LANGS.includes(save?.state?.lang); },
    langs: LANGS,
    /**
     * Translate. `t('hud.coins', {n: 3})` with `'{n} monete'`. Plural form: `'{n} {n|pesce|pesci}'`.
     * Missing key: falls back to the other language, else returns the key (warns once).
     */
    t(key, vars) {
      let s = tables[lang][key];
      if (s === undefined) {
        const other = lang === 'it' ? 'en' : 'it';
        s = tables[other][key];
        if (!warned.has(key)) { warned.add(key); console.warn(`[i18n] missing "${key}" for ${lang}${s === undefined ? '' : ' (using ' + other + ')'}`); }
        if (s === undefined) return key;
      }
      // [9 nov] {player} = the name chosen at the start, in every string
      if (typeof s === 'string' && s.includes('{player}') && !(vars && 'player' in vars)) vars = { ...(vars || {}), player: playerName() };
      if (typeof s === 'function') return s(vars || {}, lang);
      return interpolate(s, vars);
    },
    /** True if the key exists in the current language. */
    has(key) { return key in tables[lang]; },
    /** Merge flat string tables. Later calls override earlier keys. */
    addStrings(it = {}, en = {}) {
      Object.assign(tables.it, it);
      Object.assign(tables.en, en);
    },
    /** Change language, save it, notify. */
    setLang(l) {
      if (!LANGS.includes(l)) { console.warn('[i18n] unknown lang', l); return; }
      const changed = l !== lang;
      lang = l;
      if (save) { save.state.lang = l; save.commit(); }
      document.documentElement.lang = l;
      if (changed) {
        for (const fn of [...listeners]) { try { fn(l); } catch (e) { console.error(e); } }
        bus?.emit('lang:change', { lang: l });
      }
    },
    /** fn(lang) on change. Returns unsubscribe. */
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Raw table access (debug / tooling). */
    _tables: tables,
  };
  document.documentElement.lang = lang;
  return i18n;
}
