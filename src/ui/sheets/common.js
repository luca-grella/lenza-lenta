// Small building blocks shared by the sheets.
import { h, fmt } from '../dom.js';
import { icon, itemIcon } from '../icons.js';
import { fishImage, peekFishImage } from '../art.js';

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export function rarityColor(ui, r) { return ui.ctx.data?.constants?.RARITY?.[r]?.color || '#8fbf6a'; }

export function rarityChip(ui, r) {
  return h('span.chip.rarity', { style: { background: rarityColor(ui, r) } }, ui.ctx.i18n.t('rarity.' + r));
}

export function price(n) { return h('span.price', { html: icon('coin') }, fmt(n)); }

export function section(title, iconName, extra) {
  return h('div.sec-head', iconName ? h('span.sec-ic', { html: icon(iconName) }) : null, h('span.sec-title', title), h('span.sec-line'), extra || null);
}

export function empty(text, iconName = 'sparkle') {
  return h('div.empty', h('div.empty-ic', { html: icon(iconName) }), h('div.empty-txt', text));
}

/** Item icon element for any id (fish → image, others → svg). */
export function thing(ui, id, size = 96) {
  const rec = ui.A.item(id);
  if (rec?.kind === 'fish' || rec?.kind === 'junk') return lazyImg(ui, id, size);
  return h('span.thing-ic', { html: itemIcon(rec) });
}

// ── lazy fish images: painted/rendered a few per frame so opening a sheet never stalls ──
const pending = [];
let pumping = false;
function pump(ui) {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const t0 = performance.now();
    while (pending.length && performance.now() - t0 < 10) {
      const { img, id, size } = pending.shift();
      if (!img.isConnected) continue;
      img.src = fishImage(ui.ctx, id, size);
      img.classList.add('ready');
    }
    if (pending.length) setTimeout(step, 16); else pumping = false;
  };
  setTimeout(step, 0);
}
export function lazyImg(ui, id, size = 96, cls = '') {
  const img = h('img.fish-img' + (cls ? '.' + cls : ''), { alt: '', draggable: false, width: size, height: size });
  const px = Math.round(size * Math.min(2, window.devicePixelRatio || 1));
  const hit = peekFishImage(id, px);
  if (hit) { img.src = hit; img.classList.add('ready'); return img; }
  pending.push({ img, id, size: px });
  pump(ui);
  return img;
}

/** Stat bars for gear (values are multipliers ~1..2, cast in units). */
export function statBars(ui, stats, compare) {
  const t = (k, v) => ui.ctx.i18n.t(k, v);
  const rows = [];
  for (const [k, v] of Object.entries(stats || {})) {
    if (typeof v !== 'number' || !ui.ctx.i18n.has('stat.' + k)) continue;
    const norm = k === 'cast' ? v / 18 : k === 'luck' ? v / 0.2 : k === 'capacity' ? v / 24 : k === 'lightRadius' ? v / 8 : (v - 0.6) / 1.4;
    const cv = compare?.[k];
    const better = typeof cv === 'number' && v > cv + 1e-6;
    rows.push(h('div.stat' + (better ? '.up' : ''), h('span.stat-k', t('stat.' + k)), h('span.stat-bar', h('i', { style: { width: Math.round(Math.max(0.06, Math.min(1, norm)) * 100) + '%' } })),
      better ? h('span.stat-up', { html: icon('plus') }) : null));
  }
  return h('div.stats', rows);
}

/** "2× Lemon, 1× Pasta" style label from a {id: n} map. */
export function needsText(ui, needs) {
  return Object.entries(needs || {}).map(([id, n]) => `${n}× ${ui.A.name(id)}`).join(', ');
}
