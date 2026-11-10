// Save backup: export the save as a .json file (share sheet when the phone has one, else a download) or as a text
// code to copy; import it back from a file or a pasted code, with validation and a summary for the confirmation.
// The save lives in this browser's localStorage only: on iPhone, deleting the Home-screen app deletes it too.
//   code format: "LENZA2:" + base64(UTF-8 JSON of the save). Files hold {app, format, exported, save}.
//   decode() also accepts a raw save JSON, the file wrapper JSON, or a bare base64 code.

// the save format keeps its old internal app id; codes now start with LENZA: (old LENZA2: codes still import)
const APP = 'lenza-lenta-v2', PREFIX = 'LENZA:', OLD_PREFIX = 'LENZA2:';
const isObj = o => o && typeof o === 'object' && !Array.isArray(o);

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/[^A-Za-z0-9+/=_-]/g, '').replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Snapshot of the live save (after asking modules to write their last-moment values). */
export function snapshot(ctx) {
  try { ctx.save.flush?.(); } catch { /* storage may be unavailable: the in-memory state is still good */ }
  return JSON.parse(ctx.save.export ? ctx.save.export() : JSON.stringify(ctx.save.state));
}

export function encodeCode(state) { return PREFIX + b64encode(JSON.stringify(state)); }

export function fileText(state) {
  return JSON.stringify({ app: APP, format: 1, exported: new Date().toISOString(), save: state }, null, 1);
}

export function fileName(now = new Date()) {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `lenza-lenta-${d}.json`;
}

/**
 * Text (file content or pasted code) → {ok:true, state} | {ok:false, reason:'empty'|'format'|'notsave'|'newer'}.
 * maxVersion: the game's SAVE_VERSION (a save from a newer version is refused).
 */
export function decode(text, maxVersion = 1) {
  let s = String(text ?? '').trim();
  if (!s) return { ok: false, reason: 'empty' };
  let obj = null;
  try {
    if (s.startsWith('{')) obj = JSON.parse(s);
    else {
      if (s.toUpperCase().startsWith(OLD_PREFIX)) s = s.slice(OLD_PREFIX.length);
      else if (s.toUpperCase().startsWith(PREFIX)) s = s.slice(PREFIX.length);
      obj = JSON.parse(b64decode(s));
    }
  } catch { return { ok: false, reason: 'format' }; }
  if (isObj(obj) && isObj(obj.save) && (obj.app === APP || obj.format)) obj = obj.save;
  if (!looksLikeSave(obj)) return { ok: false, reason: 'notsave' };
  if ((+obj.v || 1) > maxVersion) return { ok: false, reason: 'newer' };
  return { ok: true, state: obj };
}

/** Enough of the schema to be sure this is a Lenza Lenta save and not some other JSON. */
export function looksLikeSave(o) {
  if (!isObj(o)) return false;
  const num = v => v === undefined || Number.isFinite(+v);
  if (!num(o.v) || !num(o.coins)) return false;
  if (o.quests !== undefined && !isObj(o.quests)) return false;
  if (o.player !== undefined && !isObj(o.player)) return false;
  if (o.basket !== undefined && !Array.isArray(o.basket)) return false;
  // at least three of the save's own sub-objects
  const keys = ['player', 'time', 'quests', 'journal', 'equip', 'owned', 'settings', 'meta', 'basket', 'items'];
  return keys.filter(k => k in o).length >= 3;
}

/** {day, coins, species, story, saved} for the confirmation card. */
export function summary(state, ctx) {
  const total = (ctx.data?.quests || []).length;
  return {
    day: +state.time?.day || 1,
    coins: Math.max(0, Math.round(+state.coins || 0)),
    species: Object.keys(state.journal || {}).filter(id => ctx.data?.fishById?.[id]).length,
    story: Math.min(+state.quests?.story || 0, total || Infinity),
    storyTotal: total,
    saved: +state.meta?.saved || 0,
  };
}

/**
 * Export as a file: the share sheet on phones that can share files (iPhone: "Save to Files", AirDrop, Mail…),
 * else a normal download. Resolves 'shared' | 'downloaded' | 'cancelled'.
 */
export async function exportFile(state) {
  const text = fileText(state), name = fileName();
  let file = null;
  try { file = new File([text], name, { type: 'application/json' }); } catch { file = null; }
  if (file && navigator.canShare?.({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; /* else fall back to a download */ }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  return 'downloaded';
}

/** Copy text to the clipboard. Resolves true on success. */
export async function copyText(text, fallbackEl) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  if (fallbackEl) {
    try { fallbackEl.focus(); fallbackEl.select(); fallbackEl.setSelectionRange?.(0, text.length); if (document.execCommand?.('copy')) return true; } catch { /* ignore */ }
  }
  return false;
}

/** Ask the browser not to evict our storage (best effort; iOS still deletes it with the app). Resolves true/false/null. */
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}
