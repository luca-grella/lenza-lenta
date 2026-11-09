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
  // [9 nov] every place the game sends you to, not only the shops
  ['home_campfire', 'cook', 'ui.map.poi.campfire'],
  ['home_mailbox', 'read', 'ui.map.poi.mailbox'],
  ['waterfall_pond', 'fishing', 'ui.map.poi.pond'],
  ['river_bridge', 'fishing', 'ui.map.poi.river'],
  ['palm_islet_dock', 'dock', 'ui.map.poi.dock'],
];

/**
 * [9 nov] Where the active objectives are: the villagers still to talk to, the forage spots still to pick for that item,
 * otherwise the step's marker POI. Returns [{x, z, quest, story}].
 */
function goalTargets(poiPos) {
  const c = goalTargets.ctx; if (!c) return [];
  const Q = c.systems?.quests; const D = c.data || {};
  const defs = [...(D.quests || []), ...(D.sideQuests || [])];
  const out = [];
  let list = [];
  try { list = Q?.active?.() || []; } catch { list = []; }
  for (const q of list) {
    if (!q || q.done || (q.kind !== 'story' && q.kind !== 'side')) continue;
    const def = defs.find(s => s.id === q.id); const g = def?.goal || {};
    const seen = Q.progress?.[q.id]?.seen || [];
    const story = q.kind === 'story';
    const pts = [];
    // a step not yet offered: its villager first
    if (story && q.offered === false && q.npc && q.npc !== 'letter') { const n = c.npcs?.get?.(q.npc)?.object?.position; if (n) pts.push({ x: n.x, z: n.z }); }
    else if (g.event === 'npc:talk' && g.filter?.npcId) {
      for (const id of [].concat(g.filter.npcId)) { if (seen.includes(id)) continue; const n = c.npcs?.get?.(id)?.object?.position; if (n) pts.push({ x: n.x, z: n.z }); }
    } else if (g.event === 'forage:pick' && g.filter?.itemId) {
      const ids = [].concat(g.filter.itemId);
      for (const s of c.systems?.foraging?.spots || []) if (!s.picked && ids.includes(s.itemId)) pts.push({ x: s.x, z: s.z });
    }
    if (!pts.length && q.marker) { const p = poiPos(q.marker); if (p) pts.push({ x: p.x, z: p.z }); }
    for (const p of pts) out.push({ ...p, quest: q.id, story });
  }
  return out;
}

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
  goalTargets.ctx = ctx;
  let view, layer, overlay, player, src;
  const st = { scale: 1, tx: 0, ty: 0, base: 300 };
  const markers = []; // {node, x, z, kind: 'zone'|'poi'|'goal', span?}
  let lastPl = null;

  const toMap = (x, z) => [(x - src.bounds.minX) / (src.bounds.maxX - src.bounds.minX) * st.base, (z - src.bounds.minZ) / (src.bounds.maxZ - src.bounds.minZ) * st.base];
  function apply() {
    const vw = view.clientWidth, vh = view.clientHeight;
    const s = st.base * st.scale;
    st.tx = s <= vw ? (vw - s) / 2 : clamp(st.tx, vw - s - 40, 40);
    st.ty = s <= vh ? (vh - s) / 2 : clamp(st.ty, vh - s - 40, 40);
    layer.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale})`;
    for (const m of markers) {
      const [mx, my] = toMap(m.x, m.z);
      m.sx = st.tx + mx * st.scale; m.sy = st.ty + my * st.scale;
    }
    declutter();
    for (const m of markers) m.node.style.transform = `translate(${m.sx.toFixed(1)}px, ${m.sy.toFixed(1)}px)`;
    tickPlayer();
    layoutLabels();
  }
  /**
   * [Fix] Zone names dodge the icons: the You arrow covered the "e" of "Home Beach" and the harbour shops sat on
   * "Slow Harbor". Each name tries a few spots around its centre (centre, below, above, right, left, farther) and takes
   * the one that overlaps the least with icons, the goal pin, the You arrow and the names already placed.
   */
  /**
   * [9 nov] Icons never cover each other: close POI icons (the village shops when zoomed out) are pushed apart a little,
   * and a goal pin that points at an icon stands on top of it instead of hiding it (its tip on the icon's upper edge).
   */
  function declutter() {
    const ps = markers.filter(m => m.kind === 'poi');
    const MIN = 34;
    for (let it = 0; it < 6; it++) {
      let moved = false;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        let dx = b.sx - a.sx, dy = b.sy - a.sy, d = Math.hypot(dx, dy);
        if (d >= MIN) continue;
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        const push = (MIN - d) / 2;
        a.sx -= dx / d * push; a.sy -= dy / d * push; b.sx += dx / d * push; b.sy += dy / d * push;
        moved = true;
      }
      if (!moved) break;
    }
    const goals = markers.filter(m => m.kind === 'goal');
    for (const g of goals) {
      const under = ps.find(p => Math.hypot(p.sx - g.sx, p.sy - g.sy) < 24);
      if (under) { g.sx = under.sx; g.sy = under.sy - 14; }
    }
    // one label per quest, on its topmost pin (a label under other pins of the same quest got covered)
    const top = new Map();
    for (const g of goals) if (g.q && (!top.has(g.q) || g.sy < top.get(g.q).sy)) top.set(g.q, g);
    for (const g of goals) { const on = top.get(g.q) === g; g.label = on; if (g.txt) g.txt.style.display = on ? '' : 'none'; }
    // two goal pins on (almost) the same spot: fan them out
    for (let i = 0; i < goals.length; i++) for (let j = i + 1; j < goals.length; j++) {
      if (Math.hypot(goals[i].sx - goals[j].sx, goals[i].sy - goals[j].sy) < 20) { goals[i].sx -= 13; goals[j].sx += 13; }
    }
    // labels of two close pins: the second one goes under its pin
    const lab = goals.filter(g => g.label);
    for (const g of lab) if (g.txt) g.txt.style.top = '';
    for (let i = 0; i < lab.length; i++) for (let j = i + 1; j < lab.length; j++) {
      if (Math.abs(lab[i].sx - lab[j].sx) < 80 && Math.abs(lab[i].sy - lab[j].sy) < 24 && lab[j].txt) lab[j].txt.style.top = '4px';
    }
  }
  function layoutLabels() {
    if (!view) return;
    const obst = [];
    const box = (x, y, w, hh) => ({ x0: x - w / 2, y0: y - hh / 2, x1: x + w / 2, y1: y + hh / 2 });
    for (const m of markers) {
      if (m.kind === 'poi') obst.push(box(m.sx + 2, m.sy + 2, 40, 40));   // 30 px icon + 2 px border + shadow
      else if (m.kind === 'goal') { obst.push(box(m.sx, m.sy - 21, 38, 44)); if (m.label) obst.push(box(m.sx, m.sy - 52, 64, 20)); }
    }
    if (player && !player.classList.contains('hidden') && lastPl) {
      obst.push(box(lastPl.x, lastPl.y, 40, 40));
      obst.push(box(lastPl.x, lastPl.y + 27, 50, 20));
    }
    const over = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const placed = [];
    for (const m of markers) {
      if (m.kind !== 'zone' || !m.span) continue;
      const w = m.w || (m.w = m.span.offsetWidth || 90), hh = m.hh || (m.hh = m.span.offsetHeight || 18);
      const dy = hh / 2 + 23, dx = w / 2 + 25;
      const around = [[0, dy], [0, -dy], [dx, 0], [-dx, 0], [dx * 0.75, dy], [-dx * 0.75, dy], [dx * 0.75, -dy], [-dx * 0.75, -dy],
        [0, dy + 18], [0, -dy - 18], [dx + 14, 0], [-dx - 14, 0], [0, dy * 2 + 10], [0, -dy * 2 - 10]];
      const tries = m.pinned ? around : [[0, 0], ...around];
      let best = null, bs = Infinity;
      for (const [ox, oy] of tries) {
        const r = box(m.sx + ox, m.sy + oy, w + 4, hh + 2);
        let sc = 0;
        for (const o of obst) sc += over(r, o);
        for (const o of placed) sc += over(r, o) * 1.5;
        sc += Math.hypot(ox, oy) * 0.05;   // prefer the centre when it is free
        if (sc < bs - 1e-6) { bs = sc; best = { ox, oy, r }; }
      }
      placed.push(best.r);
      m.span.style.transform = `translate(calc(-50% + ${best.ox.toFixed(0)}px), calc(-50% + ${best.oy.toFixed(0)}px))`;
      m.span.style.top = '0px';
    }
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
  function tickPlayer(fromTick = false) {
    if (!player || !src) return;
    const p = A.playerPos();
    if (!p) { player.classList.add('hidden'); return; }
    const [mx, my] = toMap(p.x, p.z);
    const f = A.playerFacing();
    player.classList.remove('hidden');
    const px = st.tx + mx * st.scale, py = st.ty + my * st.scale;
    player.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    player.firstChild.style.transform = `rotate(${((Math.PI - f) * 180 / Math.PI).toFixed(1)}deg)`;
    // the names move out of the way when You moves a few pixels (cheap: a handful of labels)
    const movedPl = !lastPl || Math.hypot(lastPl.x - px, lastPl.y - py) > 3;
    lastPl = { x: px, y: py };
    if (movedPl && fromTick) layoutLabels();
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
      const addMarker = (x, z, node, kind = 'poi', extra = {}) => { markers.push({ x, z, node, kind, ...extra }); overlay.append(node); };
      const pinAt = (x, z) => (src.pois || []).some(p => p && typeof p.x === 'number' && Math.hypot(p.x - x, p.z - z) < 9);
      for (const zn of src.zones) {
        if (!ctx.i18n.has(`zone.${zn.id}.name`)) continue;
        const pinned = pinAt(zn.x, zn.z);
        const node = h('div.mk.mk-zone' + (zn.id === ui.zone ? '.here' : '') + (pinned ? '.pinned' : ''), h('span', t(`zone.${zn.id}.name`)));
        addMarker(zn.x, zn.z, node, 'zone', { span: node.firstChild, pinned });
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
      // [9 nov] the minimap's own list repeats places under other ids (home/home_bed, lighthouse_door/_top): skip the ones
      // already shown or with no icon of their own (a bare pin there read as a quest pin)
      const shown = markers.filter(m => m.kind === 'poi');
      for (const p of src.pois || []) {
        if (!p || typeof p.x !== 'number' || seen.has(p.id) || !p.icon) continue;
        if (shown.some(m => Math.hypot(m.x - p.x, m.z - p.z) < 8)) continue;
        addMarker(p.x, p.z, h('div.mk.mk-poi', h('span.mk-ic', { html: icon(p.icon) })));
      }
      if ((A.flags().boat_repaired || ctx.save.state.boat?.repaired)) { const p = poiPos('boat_mooring_home'); if (p) addMarker(p.x, p.z, h('div.mk.mk-poi', h('span.mk-ic', { html: icon('boat') }))); }
      // quest pins: one on every objective still to do, for the story step and every active side quest
      const targets = data.focus ? [{ ...(poiPos(data.focus) || {}), story: true }].filter(p => typeof p.x === 'number') : goalTargets(poiPos);
      const gp = targets.find(g => g.story) || targets[0] || null;   // centring (focus or the story objective)
      for (const g of targets) {
        const txt = h('span.mk-goal-txt', g.story ? t('ui.map.goal') : t('ui.map.side_goal'));
        addMarker(g.x, g.z, h('div.mk.mk-goal' + (g.story ? '' : '.side'), h('span.mk-ic', { html: icon('pin') }), txt), 'goal',
          { txt, q: g.story ? 'story' : 'side:' + g.quest, label: true });
      }
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
    tick() { if (view?.isConnected) tickPlayer(true); },
    onClose() { spec._ro?.disconnect(); },
  };
  return spec;
}

/** Drop the cached map (e.g. when World finishes building). */
export function resetMapCache() { cached = null; }
