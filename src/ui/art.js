// 2D art for the UI: fish portraits painted on a canvas from the species model params (used when the Creatures
// thumbnail renderer is not available, and for very small icons), item icons as data URLs, and NPC portraits (SVG).
import { shade } from './dom.js';
import { itemIcon } from './icons.js';

const cache = new Map();
const O = '#4b3221';

/** Deterministic 0..1 from a string + index (patterns stay identical every time). */
function hrand(str, i) {
  let h = 2166136261 ^ i * 16777619;
  for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 2246822507); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Fish (or junk) image as a data URL. Order: ctx.fishModels.thumbnail → 2D painter. Cached per id+size.
 * @param {any} ctx  @param {string} id  @param {number} size px (square)
 */
export function fishImage(ctx, id, size = 192) {
  const key = id + '@' + size;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  const rec = ctx.data?.items?.[id] || ctx.data?.fishById?.[id];
  if (rec?.kind === 'junk') url = svgUrl(itemIcon(rec));
  if (!url && ctx.fishModels?.thumbnail && !ctx.params?.has?.('ui2d')) {
    try { const r = ctx.fishModels.thumbnail(id, size); if (typeof r === 'string' && r.startsWith('data:')) url = r; } catch (e) { /* fall back */ }
  }
  if (!url && rec?.model) url = paintFish(rec, size);
  if (!url) url = svgUrl(itemIcon({ kind: 'fish', model: {} }));
  cache.set(key, url);
  return url;
}

export function svgUrl(svgString) {
  const s = svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

/** Cached image URL or null (no painting). */
export function peekFishImage(id, size) { return cache.get(id + '@' + size) || null; }

/** Forget cached images (e.g. after fishModels becomes available). */
export function clearArtCache() { cache.clear(); }

// ─────────────────────────────────────────────────────────────────────────────────────────
// Fish painter
// ─────────────────────────────────────────────────────────────────────────────────────────

export function paintFish(sp, size = 192) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const m = sp.model || {};
  const p = Object.assign({ back: '#6a8a9a', belly: '#e8e0c8', fin: '#5a7080', accent: '#f2c14e' }, m.palette || {});
  const s = size / 100;           // design space 100x100
  c.scale(s, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const ink = shade(p.back, -0.55);
  const variant = m.variant || '';
  try {
    if (m.shape === 'crab' || ['crayfish', 'lobster'].includes(variant)) drawCrab(c, m, p, ink, variant, sp.id);
    else if (variant === 'shrimp') drawShrimp(c, m, p, ink);
    else if (m.shape === 'squid' || ['octopus', 'cuttlefish'].includes(variant)) drawCephalopod(c, m, p, ink, variant);
    else if (variant === 'seahorse') drawSeahorse(c, m, p, ink);
    else if (m.shape === 'flat' || m.shape === 'ray') drawFlat(c, m, p, ink, sp.id);
    else drawFishBody(c, m, p, ink, sp.id);
  } catch (e) {
    console.warn('[ui] fish painter failed for', sp.id, e);
  }
  return cv.toDataURL('image/png');
}

function glowOn(c, m) { if (m.glow) { c.shadowColor = m.glow; c.shadowBlur = 9; } }
function glowOff(c) { c.shadowBlur = 0; c.shadowColor = 'transparent'; }

function stroke(c, color, w) { c.strokeStyle = color; c.lineWidth = w; c.stroke(); }

function drawEye(c, x, y, r, big) {
  c.beginPath(); c.arc(x, y, r + 1.1, 0, 7); c.fillStyle = '#fffaf0'; c.fill(); stroke(c, O, 0.9);
  c.beginPath(); c.arc(x + r * 0.15, y, r * 0.66, 0, 7); c.fillStyle = '#20160f'; c.fill();
  c.beginPath(); c.arc(x + r * 0.32, y - r * 0.3, r * (big ? 0.28 : 0.24), 0, 7); c.fillStyle = '#fff'; c.fill();
}

function drawFishBody(c, m, p, ink, id) {
  const shape = m.shape || 'torpedo';
  const eel = shape === 'eel';
  const elong = { torpedo: 1, round: 0.82, tall: 0.78, long: 1.25, eel: 1.45 }[shape] || 1;
  // body length & height in design units; keep inside 100x100 with room for fins
  let L = 62 * elong * Math.min(1.35, Math.max(0.75, m.length || 1));
  let H = L * Math.min(0.8, Math.max(0.12, (m.height || 0.3) * (shape === 'tall' ? 1.05 : 1)));
  const maxL = eel ? 84 : 74, maxH = 50;
  const k = Math.min(1, maxL / L, maxH / H);
  L *= k; H *= k;
  const T = eel ? 0 : Math.min(22, H * 0.75 + 6);           // tail length
  const cx = 50 + T * 0.42, cy = 52;
  const nx = cx + L / 2, px = cx - L / 2, hh = H / 2, pk = Math.max(1.6, hh * (shape === 'long' ? 0.42 : 0.3));

  // body path
  const body = new Path2D();
  if (eel) {
    body.moveTo(nx, cy);
    body.bezierCurveTo(nx, cy - hh, nx - L * 0.2, cy - hh, cx, cy - hh * 0.9);
    body.bezierCurveTo(cx - L * 0.25, cy - hh * 0.8, px + 6, cy - hh * 0.25, px - 2, cy + 1);
    body.bezierCurveTo(px + 6, cy + hh * 0.35, cx - L * 0.25, cy + hh * 0.9, cx, cy + hh * 0.95);
    body.bezierCurveTo(nx - L * 0.2, cy + hh, nx, cy + hh * 0.8, nx, cy);
  } else {
    const fat = shape === 'round' || shape === 'tall' ? 0.42 : 0.3;
    body.moveTo(nx, cy + hh * 0.06);
    body.bezierCurveTo(nx, cy - hh * 0.72, nx - L * fat, cy - hh, cx + L * 0.04, cy - hh);
    body.bezierCurveTo(cx - L * 0.26, cy - hh, px + L * 0.1, cy - pk * 1.15, px, cy - pk);
    body.lineTo(px, cy + pk);
    body.bezierCurveTo(px + L * 0.1, cy + pk * 1.15, cx - L * 0.26, cy + hh * 1.02, cx + L * 0.04, cy + hh * 1.02);
    body.bezierCurveTo(nx - L * fat, cy + hh * 1.02, nx, cy + hh * 0.72, nx, cy + hh * 0.06);
    body.closePath();
  }

  const fins = m.fins || {};
  const finFill = p.fin, finInk = shade(p.fin, -0.5);
  const finStyle = () => { c.fillStyle = finFill; c.fill(); stroke(c, finInk, 1.3); };

  glowOn(c, m);
  // tail
  if (!eel && fins.tail !== 'none') {
    const t = new Path2D(), tt = fins.tail || 'fork';
    const tx = px + 1, spread = Math.max(hh * 0.95, 9) * (tt === 'fan' ? 1.25 : tt === 'lunate' ? 1.15 : 1);
    t.moveTo(tx, cy - pk);
    if (tt === 'round' || tt === 'fan') {
      t.bezierCurveTo(tx - T * 0.6, cy - spread, tx - T * 1.15, cy - spread * 0.6, tx - T, cy);
      t.bezierCurveTo(tx - T * 1.15, cy + spread * 0.6, tx - T * 0.6, cy + spread, tx, cy + pk);
    } else if (tt === 'square') {
      t.lineTo(tx - T * 0.95, cy - spread * 0.85); t.lineTo(tx - T * 0.9, cy + spread * 0.85); t.lineTo(tx, cy + pk);
    } else if (tt === 'pointed') {
      t.quadraticCurveTo(tx - T * 0.5, cy - spread * 0.5, tx - T * 1.2, cy); t.quadraticCurveTo(tx - T * 0.5, cy + spread * 0.5, tx, cy + pk);
    } else { // fork / lunate
      const notch = tt === 'lunate' ? 0.35 : 0.55;
      t.quadraticCurveTo(tx - T * 0.55, cy - spread * 0.55, tx - T, cy - spread);
      t.quadraticCurveTo(tx - T * notch - 2, cy - spread * 0.2, tx - T * notch, cy);
      t.quadraticCurveTo(tx - T * notch - 2, cy + spread * 0.2, tx - T, cy + spread);
      t.quadraticCurveTo(tx - T * 0.55, cy + spread * 0.55, tx, cy + pk);
    }
    t.closePath();
    c.save(); c.fillStyle = finFill; c.fill(t); c.strokeStyle = finInk; c.lineWidth = 1.3; c.stroke(t);
    c.clip(t); c.strokeStyle = shade(p.fin, -0.2); c.lineWidth = 0.8;
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(tx, cy + i * pk * 0.25); c.lineTo(tx - T * 1.2, cy + i * spread * 0.32); c.stroke(); }
    c.restore();
  }
  // dorsal fin
  const dors = fins.dorsal || 'small';
  if (dors !== 'none') {
    const topAt = x => cy - hh * (1 - Math.pow((x - (cx + L * 0.04)) / (L * 0.62), 2)) * 0.98;
    const fin = (x0, x1, hgt, spiny) => {
      const d = new Path2D();
      d.moveTo(x0, topAt(x0) + 1.5);
      if (spiny) {
        const n = 6;
        for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; d.lineTo(x - (x1 - x0) / n * 0.3, topAt(x) - hgt * (i % 2 ? 0.55 : 1)); }
      } else d.quadraticCurveTo(x0 + (x1 - x0) * 0.35, topAt(x0) - hgt * 1.25, x1, topAt(x1) - hgt * 0.15);
      d.lineTo(x1, topAt(x1) + 1.5); d.closePath();
      c.fillStyle = finFill; c.fill(d); c.strokeStyle = finInk; c.lineWidth = 1.2; c.stroke(d);
    };
    const hs = { small: 0.35, tall: 0.75, long: 0.32, sail: 1.15, spiny: 0.55, double: 0.42 }[dors] || 0.35;
    const fh = Math.max(4, hh * hs);
    if (eel) fin(cx + L * 0.15, px + 4, Math.max(3, hh * 0.35), false);
    else if (dors === 'long' || dors === 'sail') fin(cx + L * 0.2, cx - L * 0.38, fh, false);
    else if (dors === 'double') { fin(cx + L * 0.16, cx - L * 0.04, fh, true); fin(cx - L * 0.1, cx - L * 0.32, fh * 0.8, false); }
    else fin(cx + L * 0.14, cx - L * 0.16, fh, dors === 'spiny');
    // anal fin
    if (!eel) {
      const a = new Path2D(), ax0 = cx - L * 0.12, ax1 = cx - L * 0.32;
      a.moveTo(ax0, cy + hh * 0.8); a.quadraticCurveTo(ax0 - 3, cy + hh + fh * 0.6, ax1, cy + pk * 1.6); a.closePath();
      c.fillStyle = finFill; c.fill(a); c.strokeStyle = finInk; c.lineWidth = 1.1; c.stroke(a);
    }
  }
  // body fill
  c.save();
  if (m.transparent) c.globalAlpha = 0.78;
  const g = c.createLinearGradient(0, cy - hh, 0, cy + hh);
  g.addColorStop(0, shade(p.back, -0.08)); g.addColorStop(0.45, p.back); g.addColorStop(0.62, shade(p.belly, -0.05)); g.addColorStop(1, p.belly);
  c.fillStyle = g; c.fill(body);
  glowOff(c);
  c.restore();

  // pattern
  c.save(); c.clip(body);
  drawPattern(c, m.pattern, p, { x0: px - 2, x1: nx, cy, hh, L, id });
  // soft shading: darker under-belly edge + top highlight
  const sh = c.createLinearGradient(0, cy - hh, 0, cy + hh);
  sh.addColorStop(0, 'rgba(255,255,255,0.28)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(0.85, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(60,30,10,0.18)');
  c.fillStyle = sh; c.fillRect(px - 5, cy - hh - 2, L + 10, H + 4);
  c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.6; c.stroke(body);

  // gill line
  if (!eel) {
    c.beginPath(); c.moveTo(cx + L * 0.24, cy - hh * 0.55); c.quadraticCurveTo(cx + L * 0.18, cy, cx + L * 0.24, cy + hh * 0.55);
    stroke(c, shade(p.back, -0.35), 1.2);
  }
  // pectoral fin
  if (!eel) {
    const big = fins.pectoral === 'big' || fins.pectoral === 'wing';
    const pf = new Path2D(), fx = cx + L * 0.16, fy = cy + hh * 0.2, fl = Math.max(6, hh * (big ? 0.95 : 0.6)) * (fins.pectoral === 'wing' ? 1.6 : 1);
    pf.moveTo(fx, fy); pf.quadraticCurveTo(fx - fl * 0.6, fy - fl * 0.35, fx - fl, fy + fl * 0.25); pf.quadraticCurveTo(fx - fl * 0.5, fy + fl * 0.4, fx, fy + 2); pf.closePath();
    c.fillStyle = shade(finFill, 0.12); c.fill(pf); c.strokeStyle = finInk; c.lineWidth = 1.1; c.stroke(pf);
  }
  // features
  const f = new Set(m.features || []);
  const ex = nx - Math.max(5, L * (eel ? 0.08 : 0.13)), ey = cy - hh * (f.has('eyes_up') ? 0.62 : 0.22);
  const er = Math.max(2, Math.min(6.5, hh * ({ small: 0.16, normal: 0.22, big: 0.32 }[m.eye] || 0.22)));
  if (f.has('snout') || f.has('sword') || f.has('beak')) {
    c.beginPath();
    if (f.has('sword')) { c.moveTo(nx - 1, cy - 1.6); c.lineTo(Math.min(99, nx + 22), cy - 0.2); c.lineTo(nx - 1, cy + 1.6); }
    else if (f.has('beak')) { c.moveTo(nx - 2, cy - hh * 0.25); c.quadraticCurveTo(nx + 6, cy - hh * 0.05, nx + 2, cy + hh * 0.2); c.lineTo(nx - 2, cy + hh * 0.2); }
    else { c.moveTo(nx - 1, cy - 2); c.lineTo(Math.min(99, nx + 10), cy); c.lineTo(nx - 1, cy + 3); }
    c.closePath(); c.fillStyle = f.has('beak') ? shade(p.accent, 0.1) : p.back; c.fill(); stroke(c, ink, 1.2);
  }
  if (f.has('barbels') || f.has('whiskers')) {
    c.beginPath(); c.moveTo(nx - 2, cy + hh * 0.2); c.quadraticCurveTo(nx + 6, cy + hh * 0.5, nx + 3, cy + hh * 0.95);
    c.moveTo(nx - 3, cy + hh * 0.15); c.quadraticCurveTo(nx + 2, cy + hh * 0.6, nx - 4, cy + hh * 1.0);
    stroke(c, shade(p.fin, -0.3), 1.4);
  }
  if (f.has('lure')) {
    c.beginPath(); c.moveTo(ex - 2, cy - hh * 0.9); c.quadraticCurveTo(ex + 8, cy - hh * 1.9, nx + 7, cy - hh * 0.95); stroke(c, ink, 1.2);
    c.beginPath(); c.arc(nx + 7, cy - hh * 0.95, 3, 0, 7); c.fillStyle = m.glow || '#e8ff7a'; c.shadowColor = m.glow || '#e8ff7a'; c.shadowBlur = 8; c.fill(); glowOff(c); stroke(c, ink, 0.8);
  }
  if (f.has('teeth')) {
    c.beginPath();
    for (let i = 0; i < 3; i++) { const x = nx - 3 - i * 2.4; c.moveTo(x, cy + hh * 0.08); c.lineTo(x - 1, cy + hh * 0.28); c.lineTo(x - 2, cy + hh * 0.08); }
    c.fillStyle = '#fff'; c.fill(); stroke(c, ink, 0.6);
  }
  if (f.has('spines') || f.has('puff')) {
    c.strokeStyle = shade(p.accent, -0.3); c.lineWidth = 1.2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, rx = L * 0.42, ry = hh * 0.95;
      const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2); c.stroke();
    }
  }
  if (f.has('crest')) {
    c.beginPath(); c.moveTo(nx - L * 0.15, cy - hh * 0.9); c.quadraticCurveTo(nx - L * 0.1, cy - hh * 1.5, nx - L * 0.02, cy - hh * 0.8);
    c.fillStyle = p.accent; c.fill(); stroke(c, ink, 1);
  }
  if (f.has('spot')) { c.beginPath(); c.arc(cx - L * 0.02, cy - hh * 0.05, Math.max(2.5, hh * 0.22), 0, 7); c.fillStyle = shade(p.accent, -0.2); c.fill(); stroke(c, '#fff', 1); }
  if (f.has('finlets')) { c.fillStyle = p.accent; for (let i = 0; i < 4; i++) { const x = px + 3 + i * 3.4; c.fillRect(x, cy - pk - 2.6, 1.8, 2.2); c.fillRect(x, cy + pk + 0.4, 1.8, 2.2); } }
  if (f.has('lips')) { c.beginPath(); c.ellipse(nx - 0.5, cy + hh * 0.05, 2.4, 1.8, 0, 0, 7); c.fillStyle = shade(p.accent, 0.1); c.fill(); stroke(c, ink, 0.8); }
  if (f.has('antennae')) { c.beginPath(); c.moveTo(nx - 2, cy - hh * 0.3); c.quadraticCurveTo(nx + 10, cy - hh * 1.6, nx + 16, cy - hh * 0.6); stroke(c, ink, 1); }
  // mouth
  if (!f.has('lips') && !f.has('sword') && !f.has('beak')) { c.beginPath(); c.moveTo(nx - 0.5, cy + hh * 0.08); c.quadraticCurveTo(nx - 3, cy + hh * 0.18, nx - 5, cy + hh * 0.12); stroke(c, ink, 1.1); }
  if (m.eye !== 'none') drawEye(c, ex, ey, er, m.eye === 'big');
  if (f.has('brows')) { c.beginPath(); c.moveTo(ex - er - 1, ey - er - 1.5); c.lineTo(ex + er + 1, ey - er - 2.8); stroke(c, ink, 1.4); }
}

function drawPattern(c, pat, p, { x0, x1, cy, hh, L, id }) {
  const acc = p.accent;
  c.fillStyle = acc; c.strokeStyle = acc;
  const W = x1 - x0;
  switch (pat) {
    case 'stripes': for (let i = 1; i < 9; i++) { const x = x0 + W * i / 9; c.globalAlpha = 0.75; c.fillRect(x, cy - hh * 1.2, Math.max(1.2, L * 0.022), hh * 1.25); } break;
    case 'bands': for (let i = 1; i < 6; i++) { const x = x0 + W * i / 6; c.globalAlpha = 0.8; c.beginPath(); c.ellipse(x, cy - hh * 0.2, L * 0.035, hh * 1.1, 0, 0, 7); c.fill(); } break;
    case 'clown': for (const f of [0.2, 0.52, 0.82]) {
      const x = x0 + W * f; c.globalAlpha = 1; c.fillStyle = '#20160f'; c.beginPath(); c.ellipse(x, cy, L * 0.07, hh * 1.3, 0, 0, 7); c.fill();
      c.fillStyle = '#fffaf0'; c.beginPath(); c.ellipse(x, cy, L * 0.05, hh * 1.3, 0, 0, 7); c.fill();
    } break;
    case 'spots': case 'dots': {
      const n = pat === 'spots' ? 14 : 30, r = pat === 'spots' ? Math.max(1.6, hh * 0.13) : Math.max(0.9, hh * 0.06);
      c.globalAlpha = 0.85;
      for (let i = 0; i < n; i++) { const x = x0 + W * (0.08 + 0.84 * hrand(id, i)), y = cy - hh * 0.9 + hh * 1.5 * hrand(id, i + 99); c.beginPath(); c.arc(x, y, r * (0.7 + 0.6 * hrand(id, i + 7)), 0, 7); c.fill(); }
    } break;
    case 'lines': c.globalAlpha = 0.65; for (let i = -2; i <= 2; i++) c.fillRect(x0, cy + i * hh * 0.24 - 0.6, W, Math.max(1, hh * 0.07)); break;
    case 'rainbow': {
      const g = c.createLinearGradient(x0, 0, x1, 0);
      ['#ff6a8a', '#ffb04a', '#ffe04a', '#6ad08a', '#5ab0ff', '#b07aff'].forEach((col, i) => g.addColorStop(i / 5, col));
      c.globalAlpha = 0.7; c.fillStyle = g; c.fillRect(x0, cy - hh * 0.35, W, hh * 0.55);
    } break;
    case 'gradient': {
      const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, acc); g.addColorStop(0.7, 'rgba(0,0,0,0)');
      c.globalAlpha = 0.75; c.fillStyle = g; c.fillRect(x0, cy - hh * 1.2, W, hh * 2.4);
    } break;
    default: break;
  }
  c.globalAlpha = 1;
}

function drawFlat(c, m, p, ink, id) {
  // flatfish / ray seen from above: an oval with a frilly fin rim, both eyes on top
  const cx = 52, cy = 50, rx = 34, ry = 24;
  c.save(); glowOn(c, m);
  c.beginPath(); c.ellipse(cx, cy, rx + 5, ry + 5, 0, 0, 7); c.fillStyle = p.fin; c.fill(); stroke(c, shade(p.fin, -0.5), 1.2);
  glowOff(c);
  c.beginPath(); c.moveTo(cx - rx - 3, cy); c.lineTo(cx - rx - 16, cy - 10); c.lineTo(cx - rx - 14, cy + 10); c.closePath(); c.fillStyle = p.fin; c.fill(); stroke(c, shade(p.fin, -0.5), 1.2);
  const body = new Path2D(); body.ellipse(cx, cy, rx, ry, 0, 0, 7);
  const g = c.createRadialGradient(cx + 6, cy - 6, 3, cx, cy, rx); g.addColorStop(0, shade(p.back, 0.15)); g.addColorStop(1, p.back);
  c.fillStyle = g; c.fill(body);
  c.save(); c.clip(body); drawPattern(c, m.pattern || 'spots', p, { x0: cx - rx, x1: cx + rx, cy, hh: ry, L: rx * 2, id }); c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.6; c.stroke(body);
  drawEye(c, cx + rx * 0.55, cy - 7, 3.2); drawEye(c, cx + rx * 0.62, cy + 3, 3);
  c.restore();
}

function drawCrab(c, m, p, ink, variant, id) {
  const long = variant === 'crayfish' || variant === 'lobster';
  c.save(); glowOn(c, m);
  const cx = 50, cy = long ? 56 : 58;
  const body = p.back, legs = p.fin;
  c.lineWidth = 3.4; c.strokeStyle = shade(legs, -0.4);
  // legs
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    c.beginPath();
    if (long) { const y = cy - 2 + i * 7; c.moveTo(cx + s * 8, y); c.lineTo(cx + s * 20, y + 4); c.lineTo(cx + s * 25, y + 12); }
    else { const y = cy + 2 + i * 5; c.moveTo(cx + s * 16, y); c.lineTo(cx + s * 30, y - 2); c.lineTo(cx + s * 36, y + 10); }
    c.stroke();
  }
  c.lineWidth = 1.6; c.strokeStyle = legs;
  // claws
  for (const s of [-1, 1]) {
    const bx = long ? cx + s * 9 : cx + s * 22, by = long ? cy - 18 : cy - 10, tx = long ? cx + s * 18 : cx + s * 32, ty = long ? cy - 34 : cy - 26;
    c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + s * 6, by - 6, tx, ty); c.strokeStyle = shade(body, -0.4); c.lineWidth = 4.2; c.stroke();
    c.beginPath(); c.ellipse(tx, ty, long ? 6 : 7.5, long ? 9 : 6, s * 0.5, 0, 7); c.fillStyle = shade(body, 0.05); c.fill(); stroke(c, ink, 1.4);
    c.beginPath(); c.moveTo(tx, ty - (long ? 9 : 6)); c.lineTo(tx + s * 2, ty - (long ? 2 : 1)); stroke(c, ink, 1.4);
  }
  // body
  const b = new Path2D();
  if (long) {
    b.ellipse(cx, cy - 6, 10, 16, 0, 0, 7);
    for (let i = 0; i < 4; i++) b.ellipse(cx, cy + 12 + i * 6, 8.5 - i, 4, 0, 0, 7);
    b.moveTo(cx, cy + 34); b.lineTo(cx - 9, cy + 42); b.lineTo(cx + 9, cy + 42); b.closePath();
  } else b.ellipse(cx, cy, 24, 17, 0, 0, 7);
  const g = c.createLinearGradient(0, cy - 20, 0, cy + 20); g.addColorStop(0, shade(body, 0.12)); g.addColorStop(1, shade(body, -0.12));
  c.fillStyle = g; c.fill(b); glowOff(c);
  c.save(); c.clip(b); drawPattern(c, m.pattern, p, { x0: cx - 24, x1: cx + 24, cy, hh: 17, L: 48, id }); c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.6; c.stroke(b);
  // eyes on stalks
  const ey = long ? cy - 24 : cy - 17;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * 4, ey + 4); c.lineTo(cx + s * 6, ey - 2); stroke(c, ink, 1.6); drawEye(c, cx + s * 6, ey - 3, 2.2); }
  if (long) { c.beginPath(); c.moveTo(cx - 3, ey); c.quadraticCurveTo(cx - 20, ey - 26, cx - 34, ey - 18); c.moveTo(cx + 3, ey); c.quadraticCurveTo(cx + 20, ey - 26, cx + 34, ey - 18); stroke(c, shade(body, -0.35), 1.2); }
  c.restore();
}

function drawShrimp(c, m, p, ink) {
  c.save(); glowOn(c, m);
  const b = new Path2D();
  b.moveTo(74, 40); b.bezierCurveTo(70, 24, 36, 22, 26, 40); b.bezierCurveTo(18, 54, 28, 70, 42, 70);
  b.lineTo(44, 62); b.bezierCurveTo(36, 60, 34, 50, 40, 44); b.bezierCurveTo(48, 36, 64, 40, 66, 50); b.closePath();
  c.fillStyle = p.back; c.fill(b); glowOff(c);
  c.save(); c.clip(b); c.strokeStyle = p.accent; c.lineWidth = 1.4; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(50, 50, 10 + i * 3.5, Math.PI * 0.9, Math.PI * 1.9); c.stroke(); } c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.6; c.stroke(b);
  c.beginPath(); c.moveTo(42, 70); c.lineTo(34, 80); c.lineTo(48, 76); c.closePath(); c.fillStyle = p.fin; c.fill(); stroke(c, ink, 1.2);
  c.beginPath(); c.moveTo(72, 38); c.quadraticCurveTo(90, 20, 96, 30); c.moveTo(72, 40); c.quadraticCurveTo(92, 34, 94, 46); stroke(c, ink, 1);
  for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(44 + i * 6, 58 - i); c.lineTo(46 + i * 6, 66 - i); stroke(c, shade(p.fin, -0.3), 1.4); }
  drawEye(c, 68, 36, 2.6);
  c.restore();
}

function drawCephalopod(c, m, p, ink, variant) {
  c.save(); glowOn(c, m);
  const octo = variant === 'octopus', cuttle = variant === 'cuttlefish';
  const arms = octo ? 8 : 6;
  c.lineCap = 'round';
  // arms
  for (let i = 0; i < arms; i++) {
    const t = i / (arms - 1) - 0.5;
    c.beginPath();
    if (octo) { const x0 = 50 + t * 26, y0 = 54; c.moveTo(x0, y0); c.bezierCurveTo(x0 + t * 30, y0 + 20, x0 + t * 50, y0 + 18, x0 + t * 46 + (i % 2 ? 6 : -6), y0 + 34); }
    else { const y0 = 50 + t * 14; c.moveTo(40, y0); c.bezierCurveTo(26, y0 + t * 10, 16, y0 + t * 22, 8 + (i % 2) * 4, y0 + t * 30 + Math.sin(i) * 4); }
    c.strokeStyle = shade(p.fin, -0.45); c.lineWidth = 6.2; c.stroke();
    c.strokeStyle = p.fin; c.lineWidth = 4; c.stroke();
  }
  glowOff(c);
  const b = new Path2D();
  if (octo) b.ellipse(50, 38, 22, 20, 0, 0, 7);
  else if (cuttle) { b.ellipse(62, 50, 26, 15, 0, 0, 7); }
  else { b.moveTo(94, 50); b.lineTo(80, 36); b.bezierCurveTo(64, 36, 44, 38, 38, 50); b.bezierCurveTo(44, 62, 64, 64, 80, 64); b.closePath(); }
  if (cuttle) { c.beginPath(); c.ellipse(62, 50, 30, 19, 0, 0, 7); c.fillStyle = p.fin; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1; stroke(c, shade(p.fin, -0.45), 1.2); }
  const g = c.createLinearGradient(0, 20, 0, 70); g.addColorStop(0, shade(p.back, 0.12)); g.addColorStop(1, p.belly);
  c.fillStyle = g; if (m.transparent) c.globalAlpha = 0.85; c.fill(b); c.globalAlpha = 1;
  c.save(); c.clip(b); drawPattern(c, m.pattern || 'dots', p, { x0: 30, x1: 95, cy: 44, hh: 20, L: 60, id: variant || 'squid' }); c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.6; c.stroke(b);
  if (octo) { drawEye(c, 42, 44, 3.6); drawEye(c, 58, 44, 3.6); }
  else drawEye(c, cuttle ? 44 : 46, 48, 3.4);
  c.restore();
}

function drawSeahorse(c, m, p, ink) {
  c.save(); glowOn(c, m);
  const b = new Path2D();
  b.moveTo(56, 16); b.bezierCurveTo(72, 14, 74, 30, 64, 34); b.lineTo(80, 34); b.lineTo(80, 40); b.lineTo(64, 40);
  b.bezierCurveTo(70, 52, 66, 66, 56, 72); b.bezierCurveTo(48, 78, 52, 90, 62, 86); b.bezierCurveTo(56, 94, 40, 88, 44, 74);
  b.bezierCurveTo(48, 62, 54, 54, 50, 44); b.bezierCurveTo(46, 34, 44, 20, 56, 16); b.closePath();
  const g = c.createLinearGradient(40, 0, 75, 0); g.addColorStop(0, p.back); g.addColorStop(1, shade(p.belly, -0.05));
  c.fillStyle = g; c.fill(b); glowOff(c);
  c.save(); c.clip(b); c.strokeStyle = shade(p.back, -0.25); c.lineWidth = 1.2; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(40, 30 + i * 5); c.lineTo(80, 26 + i * 5); c.stroke(); } c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.6; c.stroke(b);
  c.beginPath(); c.moveTo(48, 40); c.quadraticCurveTo(38, 46, 46, 54); c.closePath(); c.fillStyle = p.fin; c.fill(); stroke(c, ink, 1.1);
  drawEye(c, 60, 24, 2.8);
  c.restore();
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// NPC portraits (SVG strings)
// ─────────────────────────────────────────────────────────────────────────────────────────

const SWp = `stroke="${O}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;

/** SVG portrait (viewBox 64) for an NPC id using its look from ctx.data.npcs; 'letter' and 'cat' are special. */
export function portrait(ctx, npcId) {
  if (npcId === 'letter') return `<svg viewBox="0 0 64 64" class="portrait"><rect x="0" y="0" width="64" height="64" fill="#f2e4c4"/><g transform="rotate(-8 32 32)"><rect x="12" y="17" width="40" height="30" rx="3" fill="#fff6e4" ${SWp}/><path d="M13 19l19 15 19-15" fill="none" ${SWp}/><circle cx="32" cy="34" r="5" fill="#c8402a" ${SWp}/><path d="M30 33.5l4 1" stroke="#f7b0a0" stroke-width="1.6"/></g></svg>`;
  if (npcId === 'cat') return catPortrait();
  const n = ctx.data?.npcById?.[npcId];
  const L = n?.look || { skin: '#e8b48a', hair: { style: 'short', color: '#5a3a24' } };
  const skin = L.skin || '#e8b48a', hair = L.hair || {}, beard = L.beard || {}, hat = L.hat || {}, shirt = L.shirt || {}, gl = L.glasses;
  const hc = hair.color || '#5a3a24';
  const sh = shade(skin, -0.18);
  let s = `<svg viewBox="0 0 64 64" class="portrait">`;
  s += `<rect x="0" y="0" width="64" height="64" fill="${shade(shirt.color || '#3fb8b0', 0.55)}"/>`;
  // shoulders / shirt
  s += `<path d="M6 66c0-12 11-18 26-18s26 6 26 18z" fill="${shirt.color || '#3fb8b0'}" ${SWp}/>`;
  if (shirt.style === 'striped' && shirt.color2) s += `<path d="M10 56h44M8 62h48" stroke="${shirt.color2}" stroke-width="3"/>`;
  if (shirt.style === 'flannel' && shirt.color2) s += `<path d="M14 52v14M24 49v17M40 49v17M50 52v14M8 58h48" stroke="${shirt.color2}" stroke-width="1.8" opacity=".7"/>`;
  if (L.apron) s += `<path d="M22 66V55c3-2 17-2 20 0v11z" fill="${L.apron.color}" ${SWp}/>`;
  s += `<path d="M26 47c2 4 10 4 12 0" fill="${sh}" ${SWp}/>`;
  // hair behind
  if (hair.style === 'long' || hair.style === 'ponytail') s += `<path d="M13 30c0 12 3 18 6 20h26c3-2 6-8 6-20z" fill="${hc}" ${SWp}/>`;
  if (hair.style === 'bun' && !['kerchief', 'bandana'].includes(hat.type)) s += `<circle cx="32" cy="9" r="7" fill="${hc}" ${SWp}/>`;
  // ears + head
  s += `<circle cx="13.5" cy="31" r="4.4" fill="${skin}" ${SWp}/><circle cx="50.5" cy="31" r="4.4" fill="${skin}" ${SWp}/>`;
  s += `<ellipse cx="32" cy="29" rx="18" ry="19" fill="${skin}" ${SWp}/>`;
  // hair top
  if (hair.style === 'curly') s += [14, 20, 27, 34, 41, 47, 50].map((x, i) => `<circle cx="${x}" cy="${15 + (i % 2) * 2 + (x < 18 || x > 46 ? 5 : 0)}" r="6" fill="${hc}" ${SWp}/>`).join('');
  else if (hair.style === 'side') s += `<path d="M14 26c0-12 8-17 18-17s18 5 18 15c-6-6-16-7-28-2z" fill="${hc}" ${SWp}/>`;
  else if (hair.style !== 'bald') s += `<path d="M14 27c-1-12 7-18 18-18s19 6 18 18c-3-6-8-8-14-8-3 3-9 5-14 5-3 0-6 1-8 3z" fill="${hc}" ${SWp}/>`;
  // face
  s += `<ellipse cx="22" cy="34" rx="3.6" ry="2.4" fill="#ef8f80" opacity=".55"/><ellipse cx="42" cy="34" rx="3.6" ry="2.4" fill="#ef8f80" opacity=".55"/>`;
  s += `<ellipse cx="25" cy="28.5" rx="2.2" ry="2.8" fill="${O}"/><ellipse cx="39" cy="28.5" rx="2.2" ry="2.8" fill="${O}"/><circle cx="25.8" cy="27.4" r=".8" fill="#fff"/><circle cx="39.8" cy="27.4" r=".8" fill="#fff"/>`;
  s += `<path d="M30 30.5c0 3 4 3 4 0" fill="${sh}" stroke="${O}" stroke-width="1.6" stroke-linecap="round"/>`;
  // beard / mouth
  if (beard.style === 'full') s += `<path d="M15 31c0 14 8 18 17 18s17-4 17-18c-3 5-6 6-9 6-3-3-13-3-16 0-3 0-6-1-9-6z" fill="${beard.color || hc}" ${SWp}/><path d="M28 40c2 1.6 6 1.6 8 0" stroke="${O}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  else {
    s += `<path d="M27 38c3 3 7 3 10 0" stroke="${O}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
    if (beard.style === 'mustache') s += `<path d="M22 36c3-4 7-3 10-1 3-2 7-3 10 1-3 1-7 2-10 0-3 2-7 1-10 0z" fill="${beard.color || hc}" ${SWp}/>`;
    if (beard.style === 'goatee') s += `<path d="M28 42c1 4 7 4 8 0z" fill="${beard.color || hc}" ${SWp}/>`;
    if (beard.style === 'stubble') s += `<path d="M18 37c4 9 24 9 28 0" stroke="${beard.color || hc}" stroke-width="3" opacity=".35" fill="none"/>`;
  }
  // glasses
  if (gl) {
    const gc = gl.color || O;
    if (gl.shape === 'square') s += `<rect x="19" y="24" width="11" height="9" rx="2" fill="#ffffff33" stroke="${gc}" stroke-width="2"/><rect x="34" y="24" width="11" height="9" rx="2" fill="#ffffff33" stroke="${gc}" stroke-width="2"/><path d="M30 28h4" stroke="${gc}" stroke-width="2"/>`;
    else s += `<circle cx="25" cy="28.5" r="5.5" fill="#ffffff33" stroke="${gc}" stroke-width="2"/><circle cx="39" cy="28.5" r="5.5" fill="#ffffff33" stroke="${gc}" stroke-width="2"/><path d="M30.5 28h3" stroke="${gc}" stroke-width="2"/>`;
  }
  // hat
  const hcol = hat.color || '#e8c872';
  switch (hat.type) {
    case 'sailor': s += `<path d="M13 18c2-8 10-11 19-11s17 3 19 11z" fill="${hcol}" ${SWp}/><rect x="11" y="16" width="42" height="6" rx="3" fill="${shade(hcol, -0.15)}" ${SWp}/><path d="M18 19h28" stroke="${hcol === '#22304a' ? '#f5c542' : '#2f5f9a'}" stroke-width="1.6"/>`; break;
    case 'bandana': s += `<path d="M13 22c0-10 8-14 19-14s19 4 19 14c-6-3-12-4-19-4s-13 1-19 4z" fill="${hcol}" ${SWp}/><circle cx="22" cy="14" r="1.4" fill="#fff"/><circle cx="34" cy="12" r="1.4" fill="#fff"/><circle cx="42" cy="16" r="1.4" fill="#fff"/><path d="M49 19l6 4-5 2z" fill="${hcol}" ${SWp}/>`; break;
    case 'kerchief': s += `<path d="M12 26c0-12 9-18 20-18s20 6 20 18c-5-5-12-7-20-7s-15 2-20 7z" fill="${hcol}" ${SWp}/><path d="M18 14c3 2 6 1 8-1M36 12c3 2 6 2 8 0" stroke="#fff" stroke-width="1.6" fill="none" opacity=".8"/>`; break;
    case 'beanie': s += `<path d="M13 22c0-11 8-16 19-16s19 5 19 16z" fill="${hcol}" ${SWp}/><rect x="12" y="19" width="40" height="7" rx="3.5" fill="${shade(hcol, -0.15)}" ${SWp}/><circle cx="32" cy="5" r="3.6" fill="${shade(hcol, 0.2)}" ${SWp}/>`; break;
    case 'cap': s += `<path d="M14 21c0-10 8-14 18-14s18 4 18 14z" fill="${hcol}" ${SWp}/><path d="M30 21h26c0 3-2 5-6 5H30z" fill="${shade(hcol, -0.15)}" ${SWp}/><circle cx="32" cy="8" r="1.8" fill="${shade(hcol, -0.25)}"/>`; break;
    case 'chef': s += `<path d="M18 20c-6 0-7-9-1-10 1-6 9-7 12-3 3-5 12-3 12 2 6 0 7 10 1 11z" fill="#fff" ${SWp}/><rect x="18" y="18" width="28" height="6" rx="2" fill="#fff" ${SWp}/>`; break;
    case 'straw': s += `<ellipse cx="32" cy="18" rx="27" ry="6" fill="#e8c872" ${SWp}/><path d="M18 17c0-9 6-12 14-12s14 3 14 12z" fill="#efd28a" ${SWp}/><path d="M18 15h28" stroke="${hcol}" stroke-width="3"/>`; break;
    default: break;
  }
  return s + `</svg>`;
}

function catPortrait() {
  const f = '#f0a860', d = '#c9773a';
  return `<svg viewBox="0 0 64 64" class="portrait"><rect width="64" height="64" fill="#fde4c4"/>` +
    `<path d="M14 26L12 6l14 10zM50 26l2-20-14 10z" fill="${f}" ${SWp}/><path d="M16 20l-1-9 7 5zM48 20l1-9-7 5z" fill="#f7b8a8"/>` +
    `<ellipse cx="32" cy="36" rx="22" ry="19" fill="${f}" ${SWp}/>` +
    `<path d="M26 18c1 4 2 6 2 8M32 17v9M38 18c-1 4-2 6-2 8" stroke="${d}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<ellipse cx="32" cy="44" rx="10" ry="7" fill="#fff6e4"/>` +
    `<ellipse cx="23" cy="34" rx="3" ry="4" fill="${O}"/><ellipse cx="41" cy="34" rx="3" ry="4" fill="${O}"/><circle cx="24" cy="32.6" r="1" fill="#fff"/><circle cx="42" cy="32.6" r="1" fill="#fff"/>` +
    `<path d="M30 40h4l-2 2.4z" fill="#ef8f80" ${SWp}/><path d="M32 42.4c-1 3-4 3-5 1.6M32 42.4c1 3 4 3 5 1.6" stroke="${O}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M8 40l12 1M8 45l12-1M56 40l-12 1M56 45l-12-1" stroke="${O}" stroke-width="1.2" stroke-linecap="round"/></svg>`;
}
