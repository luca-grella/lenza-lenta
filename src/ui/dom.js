// Tiny DOM helpers shared by the UI modules (no framework).

/**
 * Create an element. `h('div.card.big', {onclick, style, dataset, html, text, attrs}, ...children)`.
 * Children may be strings, nodes, arrays, null/false (skipped).
 */
export function h(sel, props, ...kids) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'class') el.className += ' ' + v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'attrs') for (const [a, av] of Object.entries(v)) el.setAttribute(a, av);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

/** Parse an SVG/HTML string into a node. */
export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild || t.content;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Number with thin grouping (1 234). */
export function fmt(n) {
  n = Math.round(+n || 0);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Empty an element. */
export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

/** Darken/lighten a #rrggbb colour by k (-1..1). */
export function shade(hex, k) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return '#' + [r, g, b].map(x => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
}

/**
 * Fast tap handler that works for mouse and touch without the 300ms delay or ghost clicks.
 * Fires on pointerup if the pointer didn't move much.
 */
export function onTap(el, fn) {
  let sx = 0, sy = 0, id = null;
  el.addEventListener('pointerdown', e => { if (e.button > 0) return; id = e.pointerId; sx = e.clientX; sy = e.clientY; });
  el.addEventListener('pointerup', e => {
    if (e.pointerId !== id) return;
    id = null;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) < 12) fn(e);
  });
  el.addEventListener('pointercancel', () => { id = null; });
  // Buttons never keep keyboard focus: Space/Enter belong to the game (action).
  el.addEventListener('focus', () => el.blur());
  return el;
}
