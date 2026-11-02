// Interactables registry: anything the player can act on (benches, NPCs, shops, forage spots, the boat...).
// Systems decide what the action button shows; World only stores and answers spatial queries.

/**
 * @typedef {Object} Interactable
 * @property {string} id
 * @property {{x:number,y?:number,z:number}} pos   live reference is fine (e.g. an Object3D.position)
 * @property {number} [radius=1.6]   activation distance
 * @property {string} [kind]         'sit' | 'talk' | 'shop' | 'forage' | 'board' | ...
 * @property {string} [labelKey]     i18n key for the action button
 * @property {string} [icon]
 * @property {number} [priority=0]   ties are broken by distance; higher wins within reach
 * @property {()=>boolean} [enabled]
 * @property {(ctx:any)=>void} [onInteract]
 */
export function createInteractables() {
  const map = new Map();
  const api = {
    /** Register (or replace by id). Returns an unregister function. */
    register(item) {
      if (!item?.id || !item.pos) { console.warn('[world] interactable needs id and pos', item); return () => {}; }
      const it = item;   // kept as is (getters such as a live pos/labelKey keep working); defaults filled in
      if (it.radius == null) it.radius = 1.6;
      if (it.priority == null) it.priority = 0;
      map.set(it.id, it);
      return () => { if (map.get(it.id) === it) map.delete(it.id); };
    },
    unregister(id) { map.delete(id); },
    get(id) { return map.get(id) || null; },
    list(kind) { const a = [...map.values()]; return kind ? a.filter(i => i.kind === kind) : a; },
    /**
     * Closest enabled interactable whose radius contains pos (or within maxDist if given).
     * @param {{x:number,z:number}} pos
     * @param {{maxDist?:number, kind?:string, filter?:(it:Interactable)=>boolean}} [o]
     */
    nearest(pos, o = {}) {
      let best = null, bestScore = Infinity;
      for (const it of map.values()) {
        if (o.kind && it.kind !== o.kind) continue;
        if (o.filter && !o.filter(it)) continue;
        if (it.enabled && !safe(it.enabled)) continue;
        const d = Math.hypot(pos.x - it.pos.x, pos.z - it.pos.z);
        const reach = o.maxDist ?? it.radius;
        if (d > reach) continue;
        const score = d - (it.priority || 0) * 10;
        if (score < bestScore) { bestScore = score; best = it; }
      }
      return best;
    },
    get size() { return map.size; },
  };
  const safe = fn => { try { return !!fn(); } catch { return false; } };
  return api;
}
