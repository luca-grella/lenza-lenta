// Map data for the UI: a painted top-down canvas of the archipelago + zone labels and POIs in map space.
import { clamp, smoothstep, lerp } from '../core/math.js';
import * as L from './layout.js';

const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const C = {
  deep: hex(0x2a78a8), mid: hex(0x3aaec4), shallow: hex(0x7ce0d6), foam: hex(0xf4fbff),
  sand: hex(0xf0dca4), grass: hex(0x93cc62), grassDark: hex(0x5f9e4a), rock: hex(0xb0aa9e), dirt: hex(0xcfa874),
  river: hex(0x6ad8d0), paper: hex(0xf6ecd4),
};

const MAP_POIS = [
  ['home', 'world.poi.home', 'home'], ['dock_home', 'world.poi.dock', 'dock'], ['village_bottega', 'world.poi.shop.bottega', 'shop'],
  ['village_pescheria', 'world.poi.shop.pescheria', 'shop'], ['village_falegname', 'world.poi.shop.falegname', 'shop'],
  ['village_trattoria', 'world.poi.shop.trattoria', 'shop'], ['village_aquarium', 'world.poi.shop.aquarium', 'shop'],
  ['dock_village', 'world.poi.dock', 'dock'], ['lighthouse_door', 'world.poi.lighthouse', 'lighthouse'], ['cave_entrance', 'world.poi.cave', 'cave'],
  ['windmill_door', 'world.poi.windmill', 'windmill'], ['waterfall_pond', 'world.poi.waterfall', 'waterfall'], ['river_bridge', 'world.poi.bridge', 'bridge'],
];

/**
 * @param {any} world  needs heightAt, isWater, waterDepth, pois
 * @param {object} terrain
 */
export function createMinimap(world, terrain) {
  const cache = new Map();
  const bounds = { minX: -L.HALF, maxX: L.HALF, minZ: -L.HALF, maxZ: L.HALF };
  const toMap = (x, z) => ({ u: (x - bounds.minX) / (bounds.maxX - bounds.minX), v: (z - bounds.minZ) / (bounds.maxZ - bounds.minZ) });
  const toWorld = (u, v) => ({ x: bounds.minX + u * (bounds.maxX - bounds.minX), z: bounds.minZ + v * (bounds.maxZ - bounds.minZ) });
  const q = {};

  function paint(size) {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(size, size);
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    const S = L.SIZE / size;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = bounds.minX + (i + 0.5) * S, z = bounds.minZ + (j + 0.5) * S;
      const h = terrain.heightAt(x, z);
      let c;
      const ws = world.waterSurfaceAt(x, z);
      if (ws != null && ws - h > 0.02) {
        const dep = ws - h;
        if (ws > 0.05) c = mix(C.river, C.mid, smoothstep(0.2, 1.5, dep));
        else {
          c = mix(C.shallow, C.mid, smoothstep(0.2, 2.5, dep));
          c = mix(c, C.deep, smoothstep(2.5, 8, dep));
          const sd = terrain.shoreDistance(x, z);
          if (sd < 1.6) c = mix(c, C.foam, 0.75);
          else if (Math.abs(sd - 3.5) < 0.5) c = mix(c, C.foam, 0.25);
        }
      } else {
        const sl = terrain.slopeAt(x, z);
        const f = L.forestness(x, z);
        c = h < 1.0 ? C.sand : mix(C.grass, C.grassDark, smoothstep(0.2, 0.8, f));
        if (h >= 1.0 && h < 1.25) c = mix(C.sand, c, (h - 1.0) / 0.25);
        if (sl > 0.9) c = mix(c, C.rock, smoothstep(0.9, 1.3, sl));
        let path = 0;
        for (const p of L.PATHS) { p.query(x, z, 2.5, q); if (q.d < 1.3) path = 1; }
        if (path && h > 0.3) c = mix(c, C.dirt, 0.85);
        // hillshade (light from the north-west)
        const e = 1.2;
        const dx = terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z), dz = terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e);
        const shade = clamp(1 + (-dx - dz) * 0.18, 0.72, 1.18);
        c = c.map(v => v * shade);
        // forest stipple
        if (f > 0.35 && ((i * 7 + j * 13) % 9 === 0)) c = c.map(v => v * 0.8);
      }
      const o = (j * size + i) * 4;
      d[o] = clamp(c[0], 0, 255); d[o + 1] = clamp(c[1], 0, 255); d[o + 2] = clamp(c[2], 0, 255); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // soft paper vignette
    const grad = g.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.72);
    grad.addColorStop(0, 'rgba(246,236,212,0)'); grad.addColorStop(1, 'rgba(246,236,212,0.55)');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    return canvas;
  }

  /**
   * @param {{size?:number}} [o]
   * @returns {{canvas:HTMLCanvasElement, size:number, bounds:object, toMap:Function, toWorld:Function,
   *   zones:{id:string,nameKey:string,x:number,z:number,u:number,v:number,color?:string}[],
   *   pois:{id:string,labelKey:string,kind:string,x:number,z:number,u:number,v:number}[]}}
   */
  return function minimap(o = {}) {
    const size = o.size || 512;
    if (!cache.has(size)) cache.set(size, paint(size));
    const zones = Object.entries(L.ZONE_CENTERS).map(([id, c]) => ({ id, nameKey: `zone.${id}.name`, x: c.x, z: c.z, ...toMap(c.x, c.z) }));
    const pois = [];
    for (const [id, labelKey, kind] of MAP_POIS) {
      const p = id === 'home' ? world.poi('home_door') : world.poi(id);
      if (p) pois.push({ id, labelKey, kind, x: p.x, z: p.z, ...toMap(p.x, p.z) });
    }
    return { canvas: cache.get(size), size, bounds, toMap, toWorld, zones, pois };
  };
}
