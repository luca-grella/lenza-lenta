// Colliders (circles + oriented boxes), walkable surfaces (docks, decks, bridge, stepping stones) and the
// movement solver used by the player, NPCs and the boat: circle-vs-colliders push-out + terrain limits with
// smooth sliding along shores, cliffs and walls.
import { clamp, lerp } from '../core/math.js';

const CELL = 8;
const PAD = 0.7;          // colliders/surfaces are binned with this margin so a walker in the next cell still sees them
const key = (i, j) => i * 8192 + j;
/** Walking limits (metres): the feet never step into water deeper than WADE, never climb more than CLIMB in one step,
 *  never drop more than DROP off a deck/dock/bridge edge (ramps and steps are surfaces, so they are smooth). */
export const WALK = { WADE: 0.07, CLIMB: 0.62, DROP: 0.55, SLOPE: 1.0, LOOK: 0.75, SHORE_RUN: 0.35, FOAM: 0.95 };
/** [Fix] On a gently sloping sea beach 0.07 m of water lies 1-2 m past the waterline (the player stood on turquoise
 *  water beyond the foam). In the sea the allowed depth also shrinks with the slope, so the feet stop at most
 *  WALK.SHORE_RUN m past the waterline, where the contact foam is drawn. */
function wadeLimit(q, x, z, w) {
  if (w !== 0) return WALK.WADE;   // ponds, river, creek: unchanged
  // on a flat shelf just under sea level the depth stays tiny for metres: also stop where the shoreline foam ends
  // (water.js draws the contact foam from the same baked distance-from-land, fading out from 0.6 to 1.6 m)
  if (q.shoreDistance && q.shoreDistance(x, z) > WALK.FOAM) return -1;
  return clamp(q.slopeAt(x, z) * WALK.SHORE_RUN, 0.012, WALK.WADE);
}

/**
 * @param {{heightAt:(x:number,z:number)=>number, slopeAt:(x:number,z:number)=>number, waterSurfaceAt:(x:number,z:number)=>number|null, bound:number}} q
 */
export function createColliders(q) {
  const grid = new Map();
  const surfGrid = new Map();
  const all = [], surfaces = [];

  function bbox(c) {
    if (c.type === 'circle') return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
    if (c.type === 'box') { const r = Math.hypot(c.hw, c.hd); return [c.x - r, c.z - r, c.x + r, c.z + r]; }
    if (c.type === 'disc') return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
    if (c.type === 'span') { const r = c.hw + 0.5; return [Math.min(c.x0, c.x1) - r, Math.min(c.z0, c.z1) - r, Math.max(c.x0, c.x1) + r, Math.max(c.z0, c.z1) + r]; }
    return [c.x, c.z, c.x, c.z];
  }
  function insert(map, c) {
    let [x0, z0, x1, z1] = bbox(c);
    x0 -= PAD; z0 -= PAD; x1 += PAD; z1 += PAD;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = key(i, j); if (!map.has(k)) map.set(k, []); map.get(k).push(c);
    }
  }
  const near = (map, x, z) => map.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || EMPTY;
  const EMPTY = [];

  // ---- local coordinates of an oriented box
  function toLocal(c, x, z, out) {
    const dx = x - c.x, dz = z - c.z, co = Math.cos(c.rot || 0), si = Math.sin(c.rot || 0);
    out.x = dx * co - dz * si; out.z = dx * si + dz * co;
    return out;
  }
  function toWorld(c, lx, lz, out) {
    const co = Math.cos(c.rot || 0), si = Math.sin(c.rot || 0);
    out.x = c.x + lx * co + lz * si; out.z = c.z - lx * si + lz * co;
    return out;
  }
  const _l = { x: 0, z: 0 }, _w = { x: 0, z: 0 };

  /** Height of a surface at x,z or null when outside. */
  function surfaceY(s, x, z) {
    if (s.type === 'box') {
      toLocal(s, x, z, _l);
      return Math.abs(_l.x) <= s.hw && Math.abs(_l.z) <= s.hd ? s.y : null;
    }
    if (s.type === 'disc') return (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r ? s.y : null;
    if (s.type === 'span') {
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0, L2 = dx * dx + dz * dz;
      const t = ((x - s.x0) * dx + (z - s.z0) * dz) / L2;
      if (t < 0 || t > 1) return null;
      const px = s.x0 + dx * t - x, pz = s.z0 + dz * t - z;
      if (px * px + pz * pz > s.hw * s.hw) return null;
      return lerp(s.y0, s.y1, t) + (s.arch || 0) * Math.sin(Math.PI * t);
    }
    return null;
  }

  const api = {
    all, surfaces,
    /** Add a collider: {type:'circle', x, z, r} | {type:'box', x, z, hw, hd, rot}; layer: 'all'|'walk'|'boat'. */
    add(c) { c.layer = c.layer || 'all'; all.push(c); insert(grid, c); return c; },
    /** Add a walkable surface: {type:'box', x, z, hw, hd, rot, y} | {type:'disc', x, z, r, y} | {type:'span', x0, z0, x1, z1, hw, y0, y1, arch}. */
    addSurface(s) { surfaces.push(s); insert(surfGrid, s); return s; },
    /** Highest walkable surface at x,z (deck/bridge/stone) or null. */
    surfaceAt(x, z) {
      let best = null;
      for (const s of near(surfGrid, x, z)) { if (s.off) continue; const y = surfaceY(s, x, z); if (y != null && (best == null || y > best)) best = y; }
      return best;
    },
    /** Walkable ground height: decks/bridges/stones or terrain (never below the sea floor). */
    groundY(x, z) {
      const s = api.surfaceAt(x, z), h = q.heightAt(x, z);
      return s != null ? Math.max(s, h) : h;
    },
    /** Point inside a solid collider of the given layer? */
    blockedAt(x, z, radius = 0, layer = 'walk') {
      for (const c of near(grid, x, z)) {
        if (c.off || (c.layer !== 'all' && c.layer !== layer)) continue;
        if (c.type === 'circle') { if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + radius) ** 2) return true; }
        else if (c.type === 'box') { toLocal(c, x, z, _l); if (Math.abs(_l.x) < c.hw + radius && Math.abs(_l.z) < c.hd + radius) return true; }
      }
      return false;
    },
    /**
     * Terrain/water walkability at x,z (ignores colliders). fromY = height the walker comes from (step rules).
     * Water deeper than WALK.WADE stops the feet (shore lines and dock edges hold), steps up are limited to WALK.CLIMB
     * and drops off a deck/dock/bridge to WALK.DROP: docks are entered and left by their ramps/steps.
     */
    groundOK(x, z, fromY = null) {
      if (Math.abs(x) > q.bound || Math.abs(z) > q.bound) return false;
      const s = api.surfaceAt(x, z);
      if (s != null) {
        const h0 = q.heightAt(x, z);
        const y = Math.max(s, h0);
        return fromY == null || (y - fromY < WALK.CLIMB && fromY - y < WALK.DROP);
      }
      const h = q.heightAt(x, z);
      const w = q.waterSurfaceAt(x, z);
      if (w != null && w - h > wadeLimit(q, x, z, w)) return false;
      if (q.slopeAt(x, z) > WALK.SLOPE) return false;
      if (fromY != null && (h - fromY > WALK.CLIMB || fromY - h > WALK.DROP)) return false;
      return true;
    },
    /** How "wrong" a spot is for a walker (0 = fine): used to let someone already in the water/off a ledge walk out. */
    badness(x, z) {
      if (api.surfaceAt(x, z) != null) return 0;
      const h = q.heightAt(x, z), w = q.waterSurfaceAt(x, z);
      return Math.max(0, w != null ? w - h - wadeLimit(q, x, z, w) : 0) + Math.max(0, q.slopeAt(x, z) - WALK.SLOPE) * 0.1;
    },
    walkable(x, z) { return api.groundOK(x, z) && !api.blockedAt(x, z, 0, 'walk'); },
    /** Boat: deep enough water and not on a dock footprint. */
    boatOK(x, z) {
      if (Math.abs(x) > q.bound + 20 || Math.abs(z) > q.bound + 20) return false;
      const h = q.heightAt(x, z);
      if (-h < 0.4) return false; // a rowboat floats in shallow water (0.65 kept boats ~10 m off the islets)
      return true;
    },

    /**
     * Move a circle from → to with collisions and sliding. Works with {x,z} objects or Vector3.
     * @param {{x:number,z:number}} from
     * @param {{x:number,z:number}} to
     * @param {number} [radius=0.35]
     * @param {{boat?:boolean}} [opts]
     * @returns {{x:number,y:number,z:number,blocked:boolean}}
     */
    resolveMove(from, to, radius = 0.35, opts = {}) {
      const boat = !!opts.boat;
      const layer = boat ? 'boat' : 'walk';
      const fromY = boat ? 0 : api.groundY(from.x, from.z);
      const dx = to.x - from.x, dz = to.z - from.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) return { x: from.x, y: boat ? 0 : fromY, z: from.z, blocked: false };
      // a walker already standing somewhere wrong (old save in the sea, dropped by a boat in the shallows...) may always
      // move to a spot that is not worse, so nobody is ever trapped
      const bad0 = boat ? 0 : (api.groundOK(from.x, from.z, null) ? 0 : api.badness(from.x, from.z));
      const look = boat ? 0 : radius * WALK.LOOK;
      // the centre and a probe one body-radius ahead (feet stop at the edge, not the belly button)
      const ok = (x, z, ux, uz) => {
        if (boat) return api.boatOK(x, z);
        if (bad0 > 0) { const b = api.badness(x, z); return b <= bad0 + 1e-4 && Math.abs(x) <= q.bound && Math.abs(z) <= q.bound; }
        return api.groundOK(x, z, fromY) && (!look || api.groundOK(x + ux * look, z + uz * look, fromY));
      };
      let x = to.x, z = to.z, blocked = false;
      const ux0 = dx / len, uz0 = dz / len;
      // 1) terrain limits with angled retries (slide along shores, edges, cliffs)
      if (!ok(x, z, ux0, uz0)) {
        blocked = true;
        const a0 = Math.atan2(dx, dz);
        let found = false;
        for (const da of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
          const l = len * Math.cos(da);
          const ux = Math.sin(a0 + da), uz = Math.cos(a0 + da);
          const tx = from.x + ux * l, tz = from.z + uz * l;
          if (ok(tx, tz, ux, uz)) { x = tx; z = tz; found = true; break; }
        }
        if (!found) { x = from.x; z = from.z; }
      }
      // 2) push out of colliders (several passes: corners between two colliders)
      for (let it = 0; it < 4; it++) {
        let moved = false;
        for (const c of near(grid, x, z)) {
          if (c.off || (c.layer !== 'all' && c.layer !== layer)) continue;
          if (c.type === 'circle') {
            const ex = x - c.x, ez = z - c.z, d = Math.hypot(ex, ez), m = c.r + radius;
            if (d < m) {
              if (d > 1e-5) { x = c.x + ex * m / d; z = c.z + ez * m / d; }
              else { x = c.x - ux0 * m; z = c.z - uz0 * m; }   // dead centre: back out the way we came
              moved = true;
            }
          } else if (c.type === 'box') {
            toLocal(c, x, z, _l);
            const px = clamp(_l.x, -c.hw, c.hw), pz = clamp(_l.z, -c.hd, c.hd);
            const ex = _l.x - px, ez = _l.z - pz, d = Math.hypot(ex, ez);
            if (d < radius) {
              let lx, lz;
              if (d > 1e-5) { lx = px + ex / d * radius; lz = pz + ez / d * radius; }
              else { // centre inside: exit through the nearest side
                const ox = c.hw - Math.abs(_l.x), oz = c.hd - Math.abs(_l.z);
                if (ox < oz) { lx = Math.sign(_l.x || 1) * (c.hw + radius); lz = _l.z; } else { lx = _l.x; lz = Math.sign(_l.z || 1) * (c.hd + radius); }
              }
              toWorld(c, lx, lz, _w); x = _w.x; z = _w.z;
              moved = true;
            }
          }
        }
        if (moved) blocked = true; else break;
      }
      // 3) the push-out must not drop us into water/off an edge; never move farther than asked (no tunnelling)
      if ((x !== to.x || z !== to.z) && !ok(x, z, 0, 0)) { x = from.x; z = from.z; blocked = true; }
      const mx = x - from.x, mz = z - from.z, ml = Math.hypot(mx, mz);
      if (ml > len * 1.5 + 0.02) { const k = (len * 1.5 + 0.02) / ml; x = from.x + mx * k; z = from.z + mz * k; }
      return { x, y: boat ? 0 : api.groundY(x, z), z, blocked };
    },
  };
  return api;
}
