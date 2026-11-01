// Map: a parchment chart painted from ctx.world.minimap() (or sampled from the terrain height function), zone
// names, POIs, the quest pin and a live player arrow. Drag to pan, pinch / wheel / buttons to zoom.
import { h, onTap, clamp } from '../dom.js';
import { icon } from '../icons.js';

const POIS = [
  ['home_bed', 'home', 'ui.map.poi.home'],
  ['village_bottega', 'shop', 'shop.bottega.name'],
  ['village_pescheria', 'sell', 'shop.pescheria.name'],
  ['village_falegname', 'board', 'shop.falegname.name'],
  ['village_trattoria', 'cook', 'shop.trattoria.name'],
  ['village_aquarium', 'aquarium', 'shop.aquarium.name'],
  ['dock_home', 'dock', 'ui.map.poi.dock'],
  ['dock_village', 'dock', 'ui.map.poi.dock'],
  ['lighthouse_top', 'lighthouse', 'ui.map.poi.lighthouse'],
  ['cave_entrance', 'cave', 'ui.map.poi.cave'],
];

let cached = null; // {canvas, bounds, zones:[{id,x,z}], key}

function paintFromHeights(ctx, bounds, hf, isWater, N = 220) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d');
  const img = c.createImageData(N, N);
  const W = bounds.maxX - bounds.minX, Hh = bounds.maxZ - bounds.minZ;
  const land = new Uint8Array(N * N);
  const hs = new Float32Array(N * N);
  const wl = ctx.world?.waterLevel ?? 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = bounds.minX + (i + 0.5) / N * W, z = bounds.minZ + (j + 0.5) / N * Hh;
    let y = -10;
    try { y = hf(x, z); } catch { /* ignore */ }
    let wet = y < wl;
    if (isWater) { try { wet = !!isWater(x, z); } catch { /* ignore */ } }
    hs[j * N + i] = y;
    land[j * N + i] = wet ? 0 : 1;
  }
  const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  const hex = s => [1, 3, 5].map(k => parseInt(s.slice(k, k + 2), 16));
  const C = { deep: hex('#6fb9cf'), shallow: hex('#a8e0df'), sand: hex('#f1dda3'), grass: hex('#b5d585'), forest: hex('#8fbf6e'), hill: hex('#a7b77e'), rock: hex('#cbbfa8'), snow: hex('#efe6d6') };
  for (let k = 0; k < N * N; k++) {
    const y = hs[k];
    let col;
    if (!land[k]) col = mix(C.shallow, C.deep, clamp((wl - y) / 4, 0, 1));
    else if (y < wl + 0.9) col = C.sand;
    else if (y < wl + 5) col = mix(C.grass, C.forest, clamp((y - wl - 1) / 4, 0, 1));
    else if (y < wl + 12) col = mix(C.forest, C.hill, clamp((y - wl - 5) / 7, 0, 1));
    else col = mix(C.rock, C.snow, clamp((y - wl - 12) / 12, 0, 1));
    // coastline + shallow foam ring
    const i = k % N, j = (k / N) | 0;
    let edge = false;
    if (i > 0 && i < N - 1 && j > 0 && j < N - 1) edge = land[k] !== land[k - 1] || land[k] !== land[k + 1] || land[k] !== land[k - N] || land[k] !== land[k + N];
    if (edge && land[k]) col = hex('#7a5a3a');
    else if (edge) col = hex('#e8fbf7');
    img.data[k * 4] = col[0]; img.data[k * 4 + 1] = col[1]; img.data[k * 4 + 2] = col[2]; img.data[k * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/** Big parchment canvas: base map scaled up, wave hatching on the sea, vignette and grain. */
function parchment(ctx, base, size = 900) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.fillStyle = '#7cc3d6'; c.fillRect(0, 0, size, size);
  try { c.drawImage(base, 0, 0, size, size); } catch { /* ignore */ }
  // sea hatching (seeded so it never changes)
  const rng = ctx.math?.rng ? ctx.math.rng('ui-map-waves') : Math.random;
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2; c.lineCap = 'round';
  // [Fix] one readback of the whole base map (420 single-pixel reads triggered Chrome's willReadFrequently warning)
  let img = null;
  try { img = base.getContext?.('2d')?.getImageData(0, 0, base.width, base.height) || null; } catch { img = null; }
  for (let n = 0; img && n < 420; n++) {
    const x = rng() * size, y = rng() * size;
    const o = (Math.min(base.height - 1, Math.floor(y / size * base.height)) * base.width + Math.min(base.width - 1, Math.floor(x / size * base.width))) * 4;
    const px = img.data.subarray(o, o + 4);
    if (!(px[2] > px[0] + 25)) continue; // only on water (blue-ish)
    c.beginPath(); c.moveTo(x - 7, y); c.quadraticCurveTo(x - 3.5, y - 4, x, y); c.quadraticCurveTo(x + 3.5, y + 4, x + 7, y); c.stroke();
  }
  // warm parchment tint + vignette
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = 'rgba(255, 236, 200, .35)'; c.fillRect(0, 0, size, size);
  const g = c.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(150, 105, 60, .55)');
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  c.globalCompositeOperation = 'source-over';
  // grid
  c.strokeStyle = 'rgba(90, 60, 30, .12)'; c.lineWidth = 1;
  for (let k = 1; k < 8; k++) { const p = k * size / 8; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, size); c.moveTo(0, p); c.lineTo(size, p); c.stroke(); }
  return cv;
}

function resolveSource(ctx) {
  const w = ctx.world;
  const key = w ? 'world' : ctx.stage ? 'stage' : 'none';
  if (cached && cached.key === key) return cached;
  let mm = null;
  try { mm = typeof w?.minimap === 'function' ? w.minimap() : w?.minimap || null; } catch (e) { console.warn('[ui] world.minimap failed', e); }
  let img = null, bounds = null, zones = null, extraPois = null;
  const isImg = o => o && (o instanceof HTMLCanvasElement || o instanceof HTMLImageElement || (typeof ImageBitmap !== 'undefined' && o instanceof ImageBitmap) || (typeof OffscreenCanvas !== 'undefined' && o instanceof OffscreenCanvas));
  if (isImg(mm)) img = mm;
  else if (mm && typeof mm === 'object') {
    img = isImg(mm.canvas) ? mm.canvas : isImg(mm.image) ? mm.image : null;
    if (!img && typeof mm.url === 'string') { img = new Image(); img.src = mm.url; }
    bounds = mm.bounds || null;
    if (!bounds && mm.size) bounds = { minX: -mm.size / 2, maxX: mm.size / 2, minZ: -mm.size / 2, maxZ: mm.size / 2 };
    zones = Array.isArray(mm.zones) ? mm.zones : mm.zones && typeof mm.zones === 'object' ? Object.entries(mm.zones).map(([id, p]) => ({ id, ...p })) : null;
    extraPois = mm.pois || null;
  }
  const hf = w?.heightAt ? (x, z) => w.heightAt(x, z) : ctx.stage?.heightAt ? (x, z) => ctx.stage.heightAt(x, z) : null;
  bounds = bounds || w?.bounds || (w ? { minX: -160, maxX: 160, minZ: -160, maxZ: 160 } : { minX: -48, maxX: 48, minZ: -48, maxZ: 48 });
  if (!img && hf) img = paintFromHeights(ctx, bounds, hf, w?.isWater ? (x, z) => w.isWater(x, z) : null);
  if (!img) return (cached = { key, canvas: null, bounds, zones: [], pois: [] });
  // zone centroids from zoneAt if World didn't give them
  if (!zones && typeof w?.zoneAt === 'function') {
    const acc = {};
    const N = 48;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = bounds.minX + (i + 0.5) / N * (bounds.maxX - bounds.minX), z = bounds.minZ + (j + 0.5) / N * (bounds.maxZ - bounds.minZ);
      let id = null;
      try { if (w.isWater?.(x, z)) continue; id = w.zoneAt(x, z); } catch { id = null; }
      if (!id) continue;
      const a = (acc[id] = acc[id] || { x: 0, z: 0, n: 0 });
      a.x += x; a.z += z; a.n++;
    }
    zones = Object.entries(acc).map(([id, a]) => ({ id, x: a.x / a.n, z: a.z / a.n }));
  }
  return (cached = { key, canvas: parchment(ctx, img), bounds, zones: zones || [], pois: extraPois || [] });
}

export default function map(ui, data) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  let view, layer, overlay, player, src;
  const st = { scale: 1, tx: 0, ty: 0, base: 300 };
  const markers = []; // {node, x, z}

  const toMap = (x, z) => [(x - src.bounds.minX) / (src.bounds.maxX - src.bounds.minX) * st.base, (z - src.bounds.minZ) / (src.bounds.maxZ - src.bounds.minZ) * st.base];
  function apply() {
    const vw = view.clientWidth, vh = view.clientHeight;
    const s = st.base * st.scale;
    st.tx = s <= vw ? (vw - s) / 2 : clamp(st.tx, vw - s - 40, 40);
    st.ty = s <= vh ? (vh - s) / 2 : clamp(st.ty, vh - s - 40, 40);
    layer.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale})`;
    for (const m of markers) {
      const [mx, my] = toMap(m.x, m.z);
      m.node.style.transform = `translate(${(st.tx + mx * st.scale).toFixed(1)}px, ${(st.ty + my * st.scale).toFixed(1)}px)`;
    }
    tickPlayer();
  }
  function fit() {
    const vw = view.clientWidth || 300, vh = view.clientHeight || 300;
    st.base = Math.max(120, Math.min(vw, vh));
    layer.style.width = layer.style.height = st.base + 'px';
    apply();
  }
  function centerOn(x, z, scale) {
    if (scale) st.scale = clamp(scale, 1, 4);
    const [mx, my] = toMap(x, z);
    st.tx = view.clientWidth / 2 - mx * st.scale; st.ty = view.clientHeight / 2 - my * st.scale;
    apply();
  }
  function zoomAt(f, cx, cy) {
    const ns = clamp(st.scale * f, 1, 4);
    const k = ns / st.scale;
    st.tx = cx - (cx - st.tx) * k; st.ty = cy - (cy - st.ty) * k; st.scale = ns;
    apply();
  }
  function tickPlayer() {
    if (!player || !src) return;
    const p = A.playerPos();
    if (!p) { player.classList.add('hidden'); return; }
    const [mx, my] = toMap(p.x, p.z);
    const f = A.playerFacing();
    player.classList.remove('hidden');
    player.style.transform = `translate(${(st.tx + mx * st.scale).toFixed(1)}px, ${(st.ty + my * st.scale).toFixed(1)}px)`;
    player.firstChild.style.transform = `rotate(${((Math.PI - f) * 180 / Math.PI).toFixed(1)}deg)`;
  }

  const spec = {
    title: t('ui.sheet.map'), icon: 'map', cls: 'map tall', wide: true,
    render(body) {
      src = resolveSource(ctx);
      view = h('div.map-view');
      if (!src.canvas) { body.replaceChildren(h('div.map-empty', h('div.empty-ic', { html: icon('map') }), h('div', t('ui.map.unknown')))); return; }
      layer = h('div.map-layer');
      const cv = src.canvas;
      cv.className = 'map-canvas';
      layer.append(cv);
      overlay = h('div.map-overlay');
      markers.length = 0;
      const addMarker = (x, z, node) => { markers.push({ x, z, node }); overlay.append(node); };
      for (const zn of src.zones) {
        if (!ctx.i18n.has(`zone.${zn.id}.name`)) continue;
        addMarker(zn.x, zn.z, h('div.mk.mk-zone' + (zn.id === ui.zone ? '.here' : ''), h('span', t(`zone.${zn.id}.name`))));
      }
      const poiFn = ctx.world?.poi;
      const seen = new Set();
      const poiPos = id => { try { const p = poiFn?.call(ctx.world, id); return p && typeof p.x === 'number' ? p : null; } catch { return null; } };
      for (const [id, ic, key] of POIS) {
        const p = poiPos(id);
        if (!p) continue;
        seen.add(id);
        addMarker(p.x, p.z, h('div.mk.mk-poi', { title: t(key) }, h('span.mk-ic', { html: icon(ic) })));
      }
      for (const p of src.pois || []) if (p && typeof p.x === 'number' && !seen.has(p.id)) addMarker(p.x, p.z, h('div.mk.mk-poi', h('span.mk-ic', { html: icon(p.icon || 'pin') })));
      if ((A.flags().boat_repaired || ctx.save.state.boat?.repaired)) { const p = poiPos('boat_mooring_home'); if (p) addMarker(p.x, p.z, h('div.mk.mk-poi', h('span.mk-ic', { html: icon('boat') }))); }
      // quest pin
      const goalPoi = data.focus || A.currentGoal()?.marker;
      const gp = goalPoi ? poiPos(goalPoi) : null;
      if (gp) addMarker(gp.x, gp.z, h('div.mk.mk-goal', h('span.mk-ic', { html: icon('pin') }), h('span.mk-goal-txt', t('ui.map.goal'))));
      player = h('div.mk.mk-player', h('div.mk-arrow', { html: `<svg viewBox="0 0 32 32"><path d="M16 3l9 22-9-5-9 5z" fill="#e8604a" stroke="#fff6e4" stroke-width="2.6" stroke-linejoin="round"/></svg>` }), h('span.mk-you', t('ui.map.you')));
      overlay.append(player);

      const compass = h('div.compass', { html: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="#fff6e4" stroke="#8a5532" stroke-width="2.5"/><path d="M32 8l6 24-6 24-6-24z" fill="#e8604a" stroke="#4b3221" stroke-width="1.6" stroke-linejoin="round"/><path d="M32 32l6 0-6 24-6-24z" fill="#f4e3b8" stroke="#4b3221" stroke-width="1.6" stroke-linejoin="round"/><text x="32" y="7" text-anchor="middle" font-size="9" font-weight="900" fill="#4b3221" font-family="ui-rounded, system-ui">N</text></svg>` });
      const zin = h('button.round.paper-btn', { type: 'button', 'aria-label': t('ui.map.zoom_in'), html: icon('plus') });
      const zout = h('button.round.paper-btn', { type: 'button', 'aria-label': t('ui.map.zoom_out'), html: icon('minus') });
      const zc = h('button.round.paper-btn', { type: 'button', 'aria-label': t('ui.map.center'), html: icon('center') });
      onTap(zin, () => zoomAt(1.5, view.clientWidth / 2, view.clientHeight / 2));
      onTap(zout, () => zoomAt(1 / 1.5, view.clientWidth / 2, view.clientHeight / 2));
      onTap(zc, () => { const p = A.playerPos(); if (p) centerOn(p.x, p.z, Math.max(2, st.scale)); });
      const here = ui.zone && ctx.i18n.has(`zone.${ui.zone}.name`) ? h('div.map-here.plank', h('span', { html: icon('pin') }), t(`zone.${ui.zone}.name`)) : null;
      view.append(layer, overlay, compass, h('div.map-ctrls', zin, zout, zc), here);
      body.replaceChildren(view);

      // gestures: drag, pinch, wheel
      const pts = new Map();
      let pinch0 = 0, scale0 = 1;
      view.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { view.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); scale0 = st.scale; }
      });
      view.addEventListener('pointermove', e => {
        const p = pts.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (pts.size === 1) { st.tx += dx; st.ty += dy; apply(); }
        else if (pts.size === 2 && pinch0) {
          const [a, b] = [...pts.values()];
          const r = view.getBoundingClientRect();
          zoomAt((scale0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0) / st.scale, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        }
      });
      const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
      view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
      view.addEventListener('wheel', e => { e.preventDefault(); const r = view.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });

      requestAnimationFrame(() => {
        fit();
        const p = gp || A.playerPos();
        if (data.focus && gp) centerOn(gp.x, gp.z, 1.8);
        else if (p && src.bounds.maxX - src.bounds.minX > 150) centerOn(p.x, p.z, 1.6);
      });
      spec._ro = new ResizeObserver(() => fit());
      spec._ro.observe(view);
    },
    tick() { if (view?.isConnected) tickPlayer(); },
    onClose() { spec._ro?.disconnect(); },
  };
  return spec;
}

/** Drop the cached map (e.g. when World finishes building). */
export function resetMapCache() { cached = null; }
