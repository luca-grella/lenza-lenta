// Inline SVG icons, drawn by hand in a chunky "storybook" style: warm fills, dark-brown outline, round joins.
// icon(name) → SVG string (viewBox 32). itemIcon(record) → SVG string for any data item (baits, gear, food…).
import { shade } from './dom.js';

const O = '#4b3221';          // outline ink
const SW = 'stroke="' + O + '" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"';
const svg = (inner, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${inner}</svg>`;
const mono = (d, w = 3) => svg(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`, 'mono');

// ── shared pieces ──
const sunDisc = (cx = 16, cy = 16, r = 7) => {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, x1 = cx + Math.cos(a) * (r + 2.6), y1 = cy + Math.sin(a) * (r + 2.6), x2 = cx + Math.cos(a) * (r + 5.4), y2 = cy + Math.sin(a) * (r + 5.4);
    rays += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return `<path d="${rays}" stroke="#f0a92a" stroke-width="2.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffd04f" ${SW}/><path d="M${cx - r * .55} ${cy - r * .2}a${r * .6} ${r * .6} 0 0 1 ${r * .5}-${r * .45}" stroke="#fff6c8" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
};
const moonShape = (dx = 0, dy = 0, s = 1) => `<path transform="translate(${dx} ${dy}) scale(${s})" d="M20.5 5.5a11 11 0 1 0 6 16.5A9 9 0 0 1 20.5 5.5z" fill="#f6e7a8" ${SW}/><circle transform="translate(${dx} ${dy}) scale(${s})" cx="13" cy="19" r="1.6" fill="#e3cf7f"/><circle transform="translate(${dx} ${dy}) scale(${s})" cx="17.5" cy="23.5" r="1.1" fill="#e3cf7f"/>`;
const cloudShape = (fill = '#ffffff', dx = 0, dy = 0) => `<path transform="translate(${dx} ${dy})" d="M9 25.5h15.5a5.2 5.2 0 0 0 .6-10.4 7.4 7.4 0 0 0-14-1.6A5.9 5.9 0 0 0 9 25.5z" fill="${fill}" ${SW}/>`;
const star = (cx, cy, r, fill = '#ffd04f') => {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .48 : r; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); }
  return `<path d="${d}z" fill="${fill}" ${SW}/>`;
};
const fishGlyph = (fill = '#3fb8b0', dx = 0, dy = 0, s = 1) => `<g transform="translate(${dx} ${dy}) scale(${s})"><path d="M4 16c4-6 13-7.5 19-2l4-4v12l-4-4c-6 5.5-15 4-19-2z" fill="${fill}" ${SW}/><circle cx="9.5" cy="14.6" r="1.5" fill="${O}"/><path d="M14 12.5c1.4 1.6 1.4 5.4 0 7" fill="none" stroke="${shade(fill, -0.35)}" stroke-width="1.6" stroke-linecap="round"/></g>`;
const bobber = (cx, cy, r = 4) => `<path d="M${cx - r} ${cy}a${r} ${r} 0 0 1 ${r * 2} 0z" fill="#e8604a" ${SW}/><path d="M${cx - r} ${cy}a${r} ${r} 0 0 0 ${r * 2} 0z" fill="#fff6e4" ${SW}/><path d="M${cx} ${cy - r}v-3" ${SW}/>`;

const ICONS = {
  // ── HUD ──
  coin: () => svg(`<circle cx="16" cy="17" r="12" fill="#c98f1c" ${SW}/><circle cx="16" cy="15.5" r="12" fill="#f5c542" ${SW}/><circle cx="16" cy="15.5" r="8" fill="none" stroke="#d99a1e" stroke-width="1.8"/><path d="M11.5 15.6c2-2.4 5.6-3 8.2-.6l1.8-1.6v4.4l-1.8-1.6c-2.6 2.4-6.2 1.8-8.2-.6z" fill="#d99a1e"/><path d="M8.5 11a9 9 0 0 1 5-4" stroke="#fff3c4" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  basket: () => svg(`<path d="M9.5 13.5c0-7 13-7 13 0" fill="none" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/><path d="M17.5 13.6l3.2-6.2 1.6 3.2 2.6-2.4-.9 5.4z" fill="#3fb8b0" ${SW}/><path d="M4.5 13.5h23l-2.6 12.4a2.2 2.2 0 0 1-2.2 1.7H9.3a2.2 2.2 0 0 1-2.2-1.7z" fill="#dda66a" ${SW}/><path d="M6.2 18.5h19.6M7.3 23h17.4" stroke="#a8713f" stroke-width="1.6"/><path d="M12 13.8l.8 13.6M20 13.8l-.8 13.6M16 13.8v13.6" stroke="#b9824b" stroke-width="1.4"/>`),
  menu: () => mono('M8 10h16M8 16h16M8 22h16', 3.2),
  close: () => mono('M10 10l12 12M22 10L10 22', 3.4),
  back: () => mono('M19 8l-8 8 8 8', 3.4),
  next: () => mono('M13 8l8 8-8 8', 3.4),
  plus: () => mono('M16 8v16M8 16h16', 3.4),
  minus: () => mono('M8 16h16', 3.4),
  check: () => mono('M8 16.5l5.5 5.5L24 10', 3.6),
  down: () => mono('M9 12l7 8 7-8', 3.6),
  center: () => svg(`<circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="16" cy="16" r="3" fill="currentColor"/><path d="M16 3v5M16 24v5M3 16h5M24 16h5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`, 'mono'),
  lock: () => svg(`<path d="M11 14v-3.5a5 5 0 0 1 10 0V14" fill="none" stroke="${O}" stroke-width="2.6"/><rect x="7.5" y="13.5" width="17" height="13" rx="3" fill="#d9a46e" ${SW}/><circle cx="16" cy="19.2" r="1.9" fill="${O}"/><path d="M16 20v3" ${SW}/>`),
  star: () => svg(star(16, 16.5, 11)),
  heart: () => svg(`<path d="M16 27C6 20 4.5 15 5.5 11.5a5.6 5.6 0 0 1 10.5-1.6 5.6 5.6 0 0 1 10.5 1.6C27.5 15 26 20 16 27z" fill="#ef7a6a" ${SW}/><path d="M9 11.5a3 3 0 0 1 3-2.5" stroke="#ffd2c8" stroke-width="1.8" fill="none" stroke-linecap="round"/>`),
  sparkle: () => svg(`<path d="M16 3c1 6.5 2.5 8 9 9-6.5 1-8 2.5-9 9-1-6.5-2.5-8-9-9 6.5-1 8-2.5 9-9z" fill="#ffd04f" ${SW}/><path d="M25 19c.5 3 1 3.5 4 4-3 .5-3.5 1-4 4-.5-3-1-3.5-4-4 3-.5 3.5-1 4-4z" fill="#fff0b0" ${SW}/>`),
  pin: () => svg(`<path d="M16 29s-9-9.2-9-15.5a9 9 0 0 1 18 0C25 19.8 16 29 16 29z" fill="#e8604a" ${SW}/><circle cx="16" cy="13.5" r="3.6" fill="#fff6e4" ${SW}/>`),
  flag: () => svg(`<path d="M8 28V5" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/><path d="M8.5 6c5-3 8 3 15 0v11c-7 3-10-3-15 0z" fill="#e8604a" ${SW}/>`),
  clock: () => svg(`<circle cx="16" cy="16" r="11.5" fill="#fff6e4" ${SW}/><path d="M16 9v7l4.5 3" ${SW} fill="none"/>`),
  hourglass: () => svg(`<path d="M9 5h14M9 27h14" ${SW}/><path d="M10.5 5c0 7 11 7 11 11s-11 4-11 11h11c0-7-11-7-11-11s11-4 11-11z" fill="#fff6e4" ${SW}/><path d="M12.5 24.5c1-2 6-2 7 0z" fill="#e9c46a"/>`),
  info: () => svg(`<circle cx="16" cy="16" r="12" fill="#3fb8b0" ${SW}/><path d="M16 14.5v7.5" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="10" r="1.9" fill="#fff"/>`),
  refresh: () => mono('M24.5 12A9.5 9.5 0 1 0 25 19M25 6.5V12h-5.5', 3),
  globe: () => svg(`<circle cx="16" cy="16" r="11.5" fill="#7fd0e0" ${SW}/><path d="M9 9.5c3 1 3 4 6 4.5s2 4 0 5.5-1 4 1 5M19 6c-1 2 1 3.5 3 3.5s3.5 2 2.5 4" fill="none" stroke="#3f8f5a" stroke-width="2" stroke-linecap="round"/><path d="M8 11.5c2 .4 3 2.2 2.6 4.2l-1 2.6-2.6-2z" fill="#6fb548"/><path d="M19.5 15.5c2.2-.6 4.4.6 4.5 2.6-.2 2.4-2.4 4.2-4 5.2-.6-1.6-.4-3.4-1.2-4.6z" fill="#6fb548"/>`),
  music: () => svg(`<path d="M12 23.5V8l13-3v15.5" fill="none" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="9" cy="23.5" rx="4" ry="3.2" fill="#3fb8b0" ${SW}/><ellipse cx="22" cy="20.5" rx="4" ry="3.2" fill="#3fb8b0" ${SW}/><path d="M12 12l13-3" stroke="${O}" stroke-width="2.4"/>`),
  sfx: () => svg(`<path d="M5 12.5h5l7-6v19l-7-6H5z" fill="#f2c14e" ${SW}/><path d="M21 11.5c2 2.5 2 6.5 0 9M24.5 8.5c4 4 4 11 0 15" fill="none" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/>`),
  camera: () => svg(`<rect x="4" y="10" width="20" height="14" rx="3" fill="#fff6e4" ${SW}/><path d="M24 14l5-3v12l-5-3z" fill="#e8604a" ${SW}/><circle cx="14" cy="17" r="3.6" fill="#3fd0c9" ${SW}/>`),   // [r2-gameplay] Settings › Close-ups
  vibrate: () => svg(`<rect x="10" y="5" width="12" height="22" rx="3" fill="#fff6e4" ${SW}/><path d="M14 23.5h4" ${SW}/><path d="M6 11v10M3 13.5v5M26 11v10M29 13.5v5" stroke="#e8604a" stroke-width="2.2" stroke-linecap="round"/>`),
  quality: () => svg(`<path d="M8 6h16l5 7-13 14L3 13z" fill="#9fe3ea" ${SW}/><path d="M3 13h26M12 6l-2 7 6 14 6-14-2-7" fill="none" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 9l-1.5 3" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`),
  book: () => svg(`<path d="M4 7.5c4-2 8-2 12 1 4-3 8-3 12-1V26c-4-2-8-2-12 1-4-3-8-3-12-1z" fill="#fff6e4" ${SW}/><path d="M16 8.5V27" ${SW}/><path d="M7 12c2-.8 4-.8 6 0M7 16c2-.8 4-.8 6 0M19 12c2-.8 4-.8 6 0M19 16c2-.8 4-.8 6 0" stroke="#c9a77a" stroke-width="1.6" stroke-linecap="round"/>`),
  trash: () => svg(`<path d="M7 9h18l-1.6 17a2 2 0 0 1-2 1.8H10.6a2 2 0 0 1-2-1.8z" fill="#ef7a6a" ${SW}/><path d="M5 9h22M12.5 9V6h7v3" ${SW} fill="none"/><path d="M13 13.5v10M19 13.5v10" stroke="#fff3ec" stroke-width="1.8" stroke-linecap="round"/>`),
  phone: () => svg(`<rect x="9" y="3.5" width="14" height="25" rx="3.4" fill="#fff6e4" ${SW}/><rect x="11.4" y="7" width="9.2" height="16" rx="1.4" fill="#7fd0e0"/><path d="M14 25.5h4" ${SW}/>`),
  share: () => svg(`<path d="M10 13H8.5A2.5 2.5 0 0 0 6 15.5v9A2.5 2.5 0 0 0 8.5 27h15a2.5 2.5 0 0 0 2.5-2.5v-9a2.5 2.5 0 0 0-2.5-2.5H22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M16 19V4M11 8.5L16 4l5 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`, 'mono'),

  // ── time & weather ──
  sun: () => svg(sunDisc()),
  moon: () => svg(moonShape() + star(26, 7, 2.6, '#fff3b0')),
  dawn: () => svg(`<clipPath id="cl-dawn"><rect x="0" y="0" width="32" height="21"/></clipPath><g clip-path="url(#cl-dawn)">${sunDisc(16, 21, 7)}</g><path d="M3 21.5h26M7 26h18" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/>`),
  dusk: () => svg(`<clipPath id="cl-dusk"><rect x="0" y="0" width="32" height="21"/></clipPath><g clip-path="url(#cl-dusk)"><circle cx="16" cy="21" r="8" fill="#f4935a" ${SW}/></g><path d="M3 21.5h26M8 26h16" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/><path d="M6 10l2 1M26 10l-2 1M16 6v2" stroke="#e57f4a" stroke-width="2.2" stroke-linecap="round"/>`),
  cloudy: () => svg(`<g transform="translate(-3 -5) scale(.85)">${sunDisc(20, 14, 6)}</g>` + cloudShape('#ffffff', 0, 1)),
  cloudy_night: () => svg(moonShape(-3, -4, .8) + cloudShape('#e7eef5', 0, 1)),
  cloud: () => svg(cloudShape('#ffffff', 0, -1)),
  rain: () => svg(cloudShape('#e3ecf3', 0, -5) + `<path d="M11 24l-1.5 4M16.5 24l-1.5 4M22 24l-1.5 4" stroke="#3a8fd0" stroke-width="2.4" stroke-linecap="round"/>`),
  storm: () => svg(cloudShape('#b9c4d0', 0, -5) + `<path d="M17 18l-4 6h4l-2 6 6-8h-4l2-4z" fill="#ffd04f" ${SW}/><path d="M9 23l-1.4 3.4M24 23l-1.4 3.4" stroke="#3a8fd0" stroke-width="2.2" stroke-linecap="round"/>`),
  fog: () => svg(`<path d="M5 11c3-2 6 2 9 0s6-2 9 0 4 1 4 1M4 17c3-2 6 2 9 0s6-2 9 0 5 1 5 1M6 23c3-2 6 2 9 0s6-2 9 0" fill="none" stroke="#8fa3b3" stroke-width="2.6" stroke-linecap="round"/>`),

  // ── actions ──
  cast: () => svg(`<path d="M5 28L20 6" stroke="#b77d4b" stroke-width="3" stroke-linecap="round"/><path d="M5 28L20 6" stroke="${O}" stroke-width="1" stroke-linecap="round" opacity=".35"/><circle cx="9" cy="22.5" r="2.6" fill="#9a9a9a" ${SW}/><path d="M20 6c6 2 8 8 7 14" fill="none" stroke="#5d7f8f" stroke-width="1.4" stroke-dasharray="2 2"/>` + bobber(26.5, 24, 3.4)),
  reel: () => svg(`<circle cx="15" cy="17" r="9.5" fill="#cfd8dc" ${SW}/><circle cx="15" cy="17" r="5" fill="#3fb8b0" ${SW}/><circle cx="15" cy="17" r="1.6" fill="${O}"/><path d="M15 17l9-8" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/><circle cx="24.5" cy="8.5" r="2.6" fill="#e8604a" ${SW}/><path d="M4 9a13 13 0 0 1 6-5M27 25a13 13 0 0 1-5 4" fill="none" stroke="#e8604a" stroke-width="2" stroke-linecap="round"/>`),
  strike: () => svg(`<path d="M4 25c3-2 5 2 8 0s5-2 8 0 5 2 8 0" fill="none" stroke="#3fb8b0" stroke-width="2.6" stroke-linecap="round"/><path d="M13.2 4.5h5.6l-1 14h-3.6z" fill="#e8604a" ${SW}/><circle cx="16" cy="22" r="2.6" fill="#e8604a" ${SW}/><path d="M7 9l2.5 2M25 9l-2.5 2" stroke="#f2c14e" stroke-width="2.4" stroke-linecap="round"/>`),
  release: () => svg(fishGlyph('#3fb8b0', -1, -3, 1) + `<path d="M5 25c3-2 5 2 8 0s5-2 8 0 5 2 7 0" fill="none" stroke="#5aa8d8" stroke-width="2.2" stroke-linecap="round"/>`),
  talk: () => svg(`<path d="M6 6.5h20a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H15l-6 5v-5H6a3 3 0 0 1-3-3v-10a3 3 0 0 1 3-3z" fill="#fff6e4" ${SW}/><circle cx="10.5" cy="14.5" r="1.9" fill="#e8604a"/><circle cx="16" cy="14.5" r="1.9" fill="#e8604a"/><circle cx="21.5" cy="14.5" r="1.9" fill="#e8604a"/>`),
  pick: () => svg(`<path d="M16 28V15" stroke="#4b8a34" stroke-width="2.4" stroke-linecap="round"/><path d="M16 17c-8 0-10-6-9-10 5 0 9 3 9 10z" fill="#6fb548" ${SW}/><path d="M16 15c6-1 9-5 8-9-5 0-8 3-8 9z" fill="#86c454" ${SW}/>` + star(25, 23, 3.4, '#ffd04f')),
  board: () => svg(`<path d="M3 17h26l-3.5 7.5a3 3 0 0 1-2.7 1.7H9.2a3 3 0 0 1-2.7-1.7z" fill="#b77d4b" ${SW}/><path d="M5 20.5h22" stroke="#8a5532" stroke-width="1.6"/><path d="M10 17l-4-11M22 17l4-11" stroke="#d9a46e" stroke-width="2.4" stroke-linecap="round"/><path d="M3 29c3-2 6 2 9 0s6-2 9 0 6 2 8 0" fill="none" stroke="#3fb8b0" stroke-width="2.2" stroke-linecap="round"/>`),
  leave: () => svg(`<path d="M3 20h20l-3 6a3 3 0 0 1-2.7 1.7H8.7A3 3 0 0 1 6 26z" fill="#b77d4b" ${SW}/><path d="M19 13l6-6M19 7h6v6" fill="none" stroke="#e8604a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  sit: () => svg(`<rect x="4" y="12" width="24" height="5" rx="2" fill="#d9a46e" ${SW}/><rect x="4" y="6" width="24" height="4.5" rx="2" fill="#d9a46e" ${SW}/><path d="M7 17v9M25 17v9M7 10.5V12M25 10.5V12" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>`),
  stand: () => svg(`<rect x="4" y="18" width="24" height="5" rx="2" fill="#d9a46e" ${SW}/><path d="M7 23v5M25 23v5" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/><path d="M16 15V4M11 8.5L16 4l5 4.5" fill="none" stroke="#3fb8b0" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  sleep: () => svg(moonShape(-3, 3, .85) + `<path d="M18 5h7l-7 8h7" fill="none" stroke="#3f7fb0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  cook: () => svg(`<path d="M11 8c-1.5-2 1.5-3 0-5M16 8c-1.5-2 1.5-3 0-5M21 8c-1.5-2 1.5-3 0-5" fill="none" stroke="#9fb3c0" stroke-width="2" stroke-linecap="round"/><path d="M5 13h22v7a7 7 0 0 1-7 7h-8a7 7 0 0 1-7-7z" fill="#e8604a" ${SW}/><path d="M3 13h26" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/><path d="M8 17.5h16" stroke="#f7a493" stroke-width="2" stroke-linecap="round"/>`),
  shop: () => svg(`<rect x="6" y="14" width="20" height="13" rx="1.5" fill="#fff6e4" ${SW}/><rect x="13" y="18.5" width="6" height="8.5" fill="#b77d4b" ${SW}/><path d="M4 8.5L6.5 4h19L28 8.5v2.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" fill="#e8604a" ${SW}/><path d="M10 8.5v2.5M16 8.5v2.5M22 8.5v2.5" stroke="#fff6e4" stroke-width="2.4"/>`),
  sell: () => svg(fishGlyph('#3fb8b0', -2, -5, .78) + `<circle cx="22" cy="22" r="7" fill="#f5c542" ${SW}/><path d="M22 18.5v7M19.8 20.3c0-1.6 4.4-1.6 4.4 0s-4.4 1.4-4.4 3.2 4.4 1.6 4.4 0" fill="none" stroke="#a8711c" stroke-width="1.5" stroke-linecap="round"/>`),
  donate: () => svg(`<path d="M6 9h20v14a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5z" fill="#9fe3ea" ${SW}/><path d="M6 13c4 1.6 6-1.6 10 0s6 1.6 10 0" fill="none" stroke="#5ab8c8" stroke-width="1.6"/>` + fishGlyph('#f4935a', 6.5, 10.5, .55) + `<path d="M22.5 6.8c-1.8-1.4-3.8 0-2.6 2 .7 1.2 2.6 2.4 2.6 2.4s1.9-1.2 2.6-2.4c1.2-2-.8-3.4-2.6-2z" fill="#ef7a6a" ${SW}/>`),
  pet: () => svg(`<ellipse cx="16" cy="21" rx="7" ry="6" fill="#f2b39a" ${SW}/><ellipse cx="7.5" cy="13.5" rx="2.8" ry="3.4" fill="#f2b39a" ${SW}/><ellipse cx="12.5" cy="8.5" rx="2.8" ry="3.4" fill="#f2b39a" ${SW}/><ellipse cx="19.5" cy="8.5" rx="2.8" ry="3.4" fill="#f2b39a" ${SW}/><ellipse cx="24.5" cy="13.5" rx="2.8" ry="3.4" fill="#f2b39a" ${SW}/>`),
  open: () => svg(`<path d="M4 15h24v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#b77d4b" ${SW}/><path d="M4 15c0-5 2-8 12-8s12 3 12 8z" fill="#d9a46e" ${SW}/><rect x="13.5" y="13" width="5" height="6" rx="1" fill="#f5c542" ${SW}/><path d="M4 20h24" stroke="#8a5532" stroke-width="1.6"/>`),
  read: () => svg(`<rect x="4" y="8" width="24" height="17" rx="2" fill="#fff6e4" ${SW}/><path d="M5 9.5l11 8 11-8" fill="none" ${SW}/><circle cx="16" cy="18" r="2.6" fill="#e8604a" ${SW}/>`),
  eat: () => svg(`<ellipse cx="16" cy="20" rx="12" ry="7" fill="#fff6e4" ${SW}/><ellipse cx="16" cy="18.5" rx="7" ry="3.6" fill="#f4935a" ${SW}/><path d="M12 16.5c1.4-1 2.4-.6 3 .3M17 16c1.4-1 2.4-.6 3 .3" stroke="#6fb548" stroke-width="1.8" stroke-linecap="round" fill="none"/>`),
  hand: () => svg(`<path d="M16 3c1 6.5 2.5 8 9 9-6.5 1-8 2.5-9 9-1-6.5-2.5-8-9-9 6.5-1 8-2.5 9-9z" fill="#fff0b0" ${SW}/><circle cx="24" cy="24" r="4" fill="#3fb8b0" ${SW}/>`),
  wait: () => svg(`<path d="M3 21c3-2 5 2 8 0s5-2 8 0 5 2 8 0" fill="none" stroke="#3fb8b0" stroke-width="2.4" stroke-linecap="round"/>` + bobber(16, 16, 5.5)),
  cancel: () => svg(`<circle cx="16" cy="16" r="11" fill="#fff6e4" ${SW}/><path d="M11.5 11.5l9 9M20.5 11.5l-9 9" stroke="#e8604a" stroke-width="3" stroke-linecap="round"/>`),

  // ── sheets ──
  journal: () => svg(`<path d="M6 4.5h17a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H6z" fill="#3fb8b0" ${SW}/><path d="M6 4.5v24" stroke="${O}" stroke-width="3"/><rect x="10" y="9" width="12" height="8.5" rx="2" fill="#fff6e4" ${SW}/>` + fishGlyph('#f4935a', 10.2, 7.3, .4) + `<path d="M23 24.5h-13" stroke="#a6e6e2" stroke-width="1.6"/>`),
  aquarium: () => svg(`<rect x="4" y="7" width="24" height="19" rx="3" fill="#9fe3ea" ${SW}/><path d="M5 11c4 1.6 7-1.6 11 0s7 1.6 11 0" fill="none" stroke="#5ab8c8" stroke-width="1.6"/><path d="M8 25.5c0-4 2-6 1-9M23 25.5c-1-3 1-5 0-7" stroke="#4b8a34" stroke-width="2" fill="none" stroke-linecap="round"/>` + fishGlyph('#f4935a', 7, 7, .55) + `<circle cx="22" cy="12.5" r="1.4" fill="#fff" stroke="#5ab8c8"/><circle cx="24" cy="9.5" r="1" fill="#fff" stroke="#5ab8c8"/>`),
  inventory: () => svg(`<path d="M10 9V7.5a6 6 0 0 1 12 0V9" fill="none" stroke="${O}" stroke-width="2.4"/><path d="M6 13a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#d9894a" ${SW}/><rect x="10" y="17" width="12" height="8" rx="2" fill="#b86a35" ${SW}/><path d="M6 15h20" stroke="${O}" stroke-width="1.6"/><rect x="14.5" y="15.5" width="3" height="4" rx="1" fill="#f5c542" ${SW}/>`),
  quests: () => svg(`<path d="M8 5h16v20a3 3 0 0 1-3 3H8z" fill="#fff6e4" ${SW}/><path d="M6 5a2.5 2.5 0 0 1 2.5 2.5V28A3 3 0 0 1 5 25V7.5A2.5 2.5 0 0 1 6 5z" fill="#e6d1a6" ${SW}/><path d="M12 11.5l2 2 3.5-4M12 19l2 2 3.5-4" fill="none" stroke="#4b8a34" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 12h1.5M19.5 19.5h1.5" stroke="#c9a77a" stroke-width="2" stroke-linecap="round"/>`),
  map: () => svg(`<path d="M3.5 7.5l7-3 11 3 7-3v20l-7 3-11-3-7 3z" fill="#f4e3b8" ${SW}/><path d="M10.5 4.5v20M21.5 7.5v20" stroke="${O}" stroke-width="1.4" opacity=".6"/><path d="M6 17c3-1 4 2 7 1" stroke="#5ab8c8" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M14 12l3 3m0-3l-3 3" stroke="#e8604a" stroke-width="2.2" stroke-linecap="round"/><path d="M18 22c2 0 3-2 5-1.5" stroke="#6fb548" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  settings: () => svg(`<path d="M13.6 3.5h4.8l.7 3.4 2.4 1.4 3.3-1.1 2.4 4.1-2.6 2.3v2.8l2.6 2.3-2.4 4.1-3.3-1.1-2.4 1.4-.7 3.4h-4.8l-.7-3.4-2.4-1.4-3.3 1.1-2.4-4.1 2.6-2.3v-2.8L5 11.3l2.4-4.1 3.3 1.1 2.4-1.4z" fill="#9fb3c0" ${SW}/><circle cx="16" cy="16" r="4.2" fill="#fff6e4" ${SW}/>`),
  catch: () => svg(fishGlyph('#3fb8b0', 0, 0, 1) + star(26, 7, 3.4)),
  language: () => svg(`<path d="M4 6.5h14a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5v-3.5H4A2.5 2.5 0 0 1 1.5 16V9A2.5 2.5 0 0 1 4 6.5z" fill="#fff6e4" ${SW}/><path d="M14 13.5h14a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-2.5V29L21 25.5h-7a2.5 2.5 0 0 1-2.5-2.5v-7a2.5 2.5 0 0 1 2.5-2.5z" fill="#3fb8b0" ${SW}/><path d="M6 12.5h8M17 19.5h8" stroke="${O}" stroke-width="2" stroke-linecap="round"/>`),

  // ── map POIs ──
  home: () => svg(`<path d="M4 15L16 5l12 10" fill="none" stroke="${O}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 13.5V27h18V13.5L16 6z" fill="#fff6e4" ${SW}/><path d="M4.5 15.5L16 6l11.5 9.5" fill="none" stroke="#b8623b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="13" y="19" width="6" height="8" fill="#b77d4b" ${SW}/>`),
  dock: () => svg(`<path d="M3 13h26v5H3z" fill="#d9a46e" ${SW}/><path d="M8 18v9M16 18v9M24 18v9" stroke="#8a5532" stroke-width="2.6" stroke-linecap="round"/><path d="M3 25c3-2 5 2 8 0s5-2 8 0 5 2 8 0" fill="none" stroke="#3fb8b0" stroke-width="2.2" stroke-linecap="round"/>`),
  lighthouse: () => svg(`<path d="M12 9h8l2 19H10z" fill="#fff6e4" ${SW}/><path d="M11.2 16h9.6M10.6 22h10.8" stroke="#e8604a" stroke-width="3.2"/><rect x="11.5" y="5" width="9" height="4" fill="#ffd04f" ${SW}/><path d="M10 5l6-3 6 3" fill="#e8604a" ${SW}/><path d="M22 6.5l7-2M22 8l7 2" stroke="#ffd04f" stroke-width="2" stroke-linecap="round"/>`),
  cave: () => svg(`<path d="M2 28C3 14 9 6 16 6s13 8 14 22z" fill="#a39e94" ${SW}/><path d="M9 28c0-7 3-12 7-12s7 5 7 12z" fill="#3a3550" ${SW}/><circle cx="16" cy="23" r="2" fill="#9ff0e8"/>`),
  boat: () => svg(`<path d="M3 16h26l-3.5 7.5a3 3 0 0 1-2.7 1.7H9.2a3 3 0 0 1-2.7-1.7z" fill="#b77d4b" ${SW}/><path d="M5 19.5h22" stroke="#8a5532" stroke-width="1.6"/><path d="M16 16V4l9 9z" fill="#fff6e4" ${SW}/>`),
  bench: () => ICONS.sit(),
  treasure: () => ICONS.open(),
  fish: () => svg(fishGlyph('#3fb8b0')),
  question: () => svg(`<circle cx="16" cy="16" r="12" fill="#e6d1a6" ${SW}/><path d="M12 12.5a4 4 0 1 1 5.5 3.7c-1 .5-1.5 1.2-1.5 2.3v.5" fill="none" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="23" r="1.7" fill="${O}"/>`),
  paw: () => ICONS.pet(),
  bait: () => itemIcon({ kind: 'bait', model: { shape: 'worm', color: '#d27a72', accent: '#a8524c' } }),
};

/** SVG string for a named UI icon (falls back to a sparkle). */
export function icon(name) {
  const f = ICONS[name] || ICONS[ALIASES[name]] || ICONS.hand;
  return f();
}
export const hasIcon = name => !!(ICONS[name] || ICONS[ALIASES[name]]);

/** Aliases so Systems can use natural verbs as icon names. */
const ALIASES = {
  fishing: 'cast', rod: 'cast', hook: 'strike', bite: 'strike', speak: 'talk', chat: 'talk', forage: 'pick', gather: 'pick',
  boat_board: 'board', row: 'board', boat_leave: 'leave', bench_sit: 'sit', bed: 'sleep', campfire: 'cook', kitchen: 'cook',
  buy: 'shop', store: 'shop', fishmonger: 'sell', aquarium_donate: 'donate', cat: 'pet', chest: 'open', letter: 'read',
  dish: 'eat', interact: 'hand', default: 'hand', menu_open: 'menu', backpack: 'inventory', exit: 'leave', door: 'shop',
  clear: 'sun', day: 'sun', night: 'moon', overcast: 'cloudy',
};

/** Weather + phase → icon name for the HUD clock. */
export function weatherIcon(weather, phase) {
  const night = phase === 'night';
  switch (weather) {
    case 'rain': return 'rain';
    case 'storm': return 'storm';
    case 'fog': return 'fog';
    case 'cloudy': return night ? 'cloudy_night' : 'cloudy';
    default: return night ? 'moon' : phase === 'dawn' ? 'dawn' : phase === 'dusk' ? 'dusk' : 'sun';
  }
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// Item icons (data records). Colours come from the record's model where the data has them.
// ──────────────────────────────────────────────────────────────────────────────────────────

const BAIT = {
  worm: (c, a) => `<path d="M6 22c0-6 8-6 8-1s6 6 8 0-2-9 4-10" fill="none" stroke="${O}" stroke-width="7.4" stroke-linecap="round"/><path d="M6 22c0-6 8-6 8-1s6 6 8 0-2-9 4-10" fill="none" stroke="${c}" stroke-width="4.6" stroke-linecap="round"/><path d="M9.5 18.5l1 1.6M17.5 23.5l1.6-.6" stroke="${a}" stroke-width="1.6" stroke-linecap="round"/><circle cx="25.6" cy="10.8" r=".9" fill="${O}"/>`,
  bread: (c, a) => `<path d="M6 14a6 5 0 0 1 4-6c2-1 10-1 12 0a6 5 0 0 1 4 6v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill="${a}" ${SW}/><path d="M9 15a3 3 0 0 1 2-4c2-.8 8-.8 10 0a3 3 0 0 1 2 4v9H9z" fill="${c}"/><circle cx="13" cy="17" r="1" fill="${a}"/><circle cx="18" cy="20" r="1" fill="${a}"/>`,
  corn: (c, a) => `<path d="M11 27c-4-6-3-17 5-22 8 5 9 16 5 22z" fill="${c}" ${SW}/><path d="M13 10h6M12 14h8M11.5 18h9M12 22h8" stroke="${a}" stroke-width="1.6"/><path d="M16 6v20" stroke="${a}" stroke-width="1.4"/><path d="M11 27c-5-2-7-8-6-12 3 2 5 6 6 12zM21 27c5-2 7-8 6-12-3 2-5 6-6 12z" fill="#7cb85a" ${SW}/>`,
  shrimp: (c, a) => `<path d="M24 9c-7-3-17 2-16 10 1 6 7 8 11 6l-3-3c-3 1-5-1-4-4 1-4 6-5 10-3z" fill="${c}" ${SW}/><path d="M14 13.5l1.8 2.4M11.5 17.5l2.8.6M18.5 11.5l1 2.6" stroke="${a}" stroke-width="1.6" stroke-linecap="round"/><path d="M24 9l5-3M24 9l5 1" stroke="${O}" stroke-width="1.4" stroke-linecap="round"/><circle cx="22" cy="10.8" r="1.2" fill="${O}"/>`,
  fly: (c, a) => `<ellipse cx="12" cy="11" rx="7" ry="4.5" transform="rotate(-25 12 11)" fill="#e7f3f6" ${SW}/><ellipse cx="20" cy="11" rx="7" ry="4.5" transform="rotate(25 20 11)" fill="#e7f3f6" ${SW}/><ellipse cx="16" cy="19" rx="4.2" ry="7.5" fill="${c}" ${SW}/><path d="M12.4 17h7.2M12.4 21h7.2" stroke="${a}" stroke-width="2"/><circle cx="16" cy="11.5" r="2.6" fill="${O}"/>`,
  squid: (c, a) => `<path d="M16 3c5 3 7 8 6 14H10C9 11 11 6 16 3z" fill="${c}" ${SW}/><path d="M11 17c-1 4-3 7-1 10M14 17c0 4-1 7 0 10M18 17c0 4 1 7 0 10M21 17c1 4 3 7 1 10" fill="none" stroke="${a}" stroke-width="2.4" stroke-linecap="round"/><circle cx="13.5" cy="13" r="1.3" fill="${O}"/><circle cx="18.5" cy="13" r="1.3" fill="${O}"/>`,
  firefly: (c, a) => `<circle cx="16" cy="21" r="9" fill="${a}" opacity=".35"/><circle cx="16" cy="21" r="5.5" fill="${a}" ${SW}/><ellipse cx="11.5" cy="11" rx="5" ry="3.4" transform="rotate(-30 11.5 11)" fill="#e7f3f6" ${SW}/><ellipse cx="20.5" cy="11" rx="5" ry="3.4" transform="rotate(30 20.5 11)" fill="#e7f3f6" ${SW}/><ellipse cx="16" cy="13" rx="3.4" ry="4.4" fill="${c}" ${SW}/><path d="M14 6l-1.5-2.5M18 6l1.5-2.5" stroke="${O}" stroke-width="1.6" stroke-linecap="round"/>`,
  lure: (c, a) => `<circle cx="16" cy="15" r="11" fill="${a}" opacity=".45"/><path d="M5 15c4-7 14-8 20-2l2-2v8l-2-2c-6 6-16 5-20-2z" fill="${c}" ${SW}/><path d="M11 13c2 1 2 3 0 4M15 12.5c2 1.2 2 3.8 0 5" stroke="#fff6c8" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="9" cy="14" r="1.3" fill="${O}"/><path d="M17 20v5a2.5 2.5 0 0 1-5 0" fill="none" stroke="${O}" stroke-width="1.8" stroke-linecap="round"/>`,
};

const ING = {
  driftwood: (c, a) => `<path d="M3 19c2-4 6-3 9-5s7-6 12-4 6 5 3 7-6 1-9 3-8 5-12 4-4-3-3-5z" fill="${c}" ${SW}/><path d="M9 17c3 0 6-3 9-4M12 21c3-1 6-2 9-3" stroke="${a}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  shell: (c, a) => `<path d="M16 27L5 14a11 9 0 0 1 22 0z" fill="${c}" ${SW}/><path d="M16 27L9 9M16 27l-2-19M16 27l2-19M16 27l7-18" stroke="${a}" stroke-width="1.5" stroke-linecap="round"/><path d="M12 27h8l-2 2.5h-4z" fill="${a}" ${SW}/>`,
  clam: (c, a) => `<ellipse cx="16" cy="19" rx="12" ry="8" fill="${c}" ${SW}/><path d="M5 18c4-6 18-6 22 0" fill="none" stroke="${a}" stroke-width="1.8"/><path d="M8 22c5-3 11-3 16 0M10 25c4-2 8-2 12 0" stroke="${a}" stroke-width="1.4" fill="none"/>`,
  seaweed: (c, a) => `<path d="M10 28c-3-6 3-9 0-15s2-9 2-9c3 4-1 7 1 12s-1 9-1 12zM18 28c-2-5 4-8 2-13s1-7 1-7c3 3 0 6 1 10s0 7-2 10z" fill="${c}" ${SW}/><path d="M23 28c0-4 4-6 3-10 3 3 1 7 0 10z" fill="${a}" ${SW}/>`,
  salt: (c, a) => `<path d="M8 13h16l-2 14H10z" fill="${a}" ${SW}/><path d="M7 12c2-6 16-6 18 0z" fill="${c}" ${SW}/><path d="M12 9l1-1M17 8l1 .8M20 10l1 .5" stroke="#9fb3c0" stroke-width="1.6" stroke-linecap="round"/>`,
  herb: (c, a) => `<path d="M16 29V8" stroke="#4b6a3a" stroke-width="2" stroke-linecap="round"/>` + [9, 13, 17, 21].map((y, i) => `<path d="M16 ${y + 2}c-${5 - i * .5} 0-${7 - i * .7}-3-${7 - i * .5}-5 ${4 - i * .4} 0 ${7 - i * .5} 2 ${7 - i * .5} 5zM16 ${y + 3}c${5 - i * .5} 0 ${7 - i * .7}-3 ${7 - i * .5}-5-${4 - i * .4} 0-${7 - i * .5} 2-${7 - i * .5} 5z" fill="${c}" ${SW}/>`).join('') + `<circle cx="16" cy="6.5" r="2.4" fill="${a}" ${SW}/>`,
  mushroom: (c, a) => `<path d="M12 18h8v7a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z" fill="#f4ecd8" ${SW}/><path d="M4 18c0-8 6-12 12-12s12 4 12 12z" fill="${c}" ${SW}/><circle cx="11" cy="12" r="1.6" fill="${a}"/><circle cx="19" cy="10" r="1.4" fill="${a}"/><circle cx="22" cy="15" r="1.2" fill="${a}"/>`,
  berry: (c, a) => `<path d="M16 9c-3-4-7-4-9-2 3 0 6 1 9 2zM16 9c2-4 6-5 9-3-3 1-6 2-9 3z" fill="#6fb548" ${SW}/>` + [[12, 15], [20, 15], [16, 19], [11, 22], [21, 22], [16, 25]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="${c}" ${SW}/><circle cx="${x - 1.2}" cy="${y - 1.4}" r="1" fill="${a}" opacity=".8"/>`).join(''),
  pinecone: (c, a) => `<path d="M16 4c6 3 9 10 7 17-1.5 5-4 7-7 7s-5.5-2-7-7C7 14 10 7 16 4z" fill="${c}" ${SW}/><path d="M11 12c3 1.6 7 1.6 10 0M9.5 17c4 2 9 2 13 0M10.5 22c3.5 1.6 7.5 1.6 11 0M16 6v21" stroke="${a}" stroke-width="1.5" fill="none"/>`,
  lemon: (c, a) => `<ellipse cx="16" cy="17" rx="11" ry="8.5" transform="rotate(-20 16 17)" fill="${c}" ${SW}/><path d="M24 8.5c1-2 3-3 5-2-1 2-3 2.6-5 2z" fill="#6fb548" ${SW}/><path d="M10 15a6 4 0 0 1 4-3" stroke="#fff6c8" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  coconut: (c, a) => `<circle cx="16" cy="17" r="11" fill="${c}" ${SW}/><path d="M8 12c2-2 4-1 5 0M15 9c2-1 4 0 5 1" stroke="${a}" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="13" cy="15" r="1.4" fill="${O}"/><circle cx="18" cy="15" r="1.4" fill="${O}"/><circle cx="15.5" cy="19" r="1.4" fill="${O}"/>`,
  pasta: (c, a) => `<path d="M6 25L20 5M9 27L23 7M12 28L25 10" stroke="${O}" stroke-width="4.2" stroke-linecap="round"/><path d="M6 25L20 5M9 27L23 7M12 28L25 10" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/><rect x="9" y="14" width="10" height="5" rx="1.5" transform="rotate(-55 14 16.5)" fill="${a}" ${SW}/>`,
  tomato: (c, a) => `<circle cx="16" cy="18" r="10" fill="${c}" ${SW}/><path d="M16 9l-4-2 3 3-4 1 5 .5L16 15l1-3.5 5-.5-4-1 3-3z" fill="#5aa04a" ${SW}/><path d="M9.5 16a6 6 0 0 1 3-4" stroke="#ffc4b8" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  potato: (c, a) => `<path d="M5 18c-1-6 5-10 11-10s12 2 11 9-7 9-12 9-9-2-10-8z" fill="${c}" ${SW}/><circle cx="11" cy="15" r="1" fill="${a}"/><circle cx="19" cy="13" r="1" fill="${a}"/><circle cx="21" cy="20" r="1" fill="${a}"/><circle cx="13" cy="21" r="1" fill="${a}"/>`,
  sack: (c, a) => `<path d="M11 9c-5 4-7 9-6 14 1 4 4 5 11 5s10-1 11-5c1-5-1-10-6-14z" fill="${c}" ${SW}/><path d="M11 9l-1-4h12l-1 4z" fill="${c}" ${SW}/><path d="M10 9h12" stroke="${a}" stroke-width="2.6" stroke-linecap="round"/><path d="M13 18c2-2 4-2 6 0M12 22c2.6-2 5.4-2 8 0" stroke="${a}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  crystal: (c, a) => `<circle cx="16" cy="16" r="12" fill="${a || '#c8d8ff'}" opacity=".35"/><path d="M16 3l7 9-7 17-7-17z" fill="${c}" ${SW}/><path d="M9 12h14M16 3v26" stroke="#ffffff" stroke-width="1.4" opacity=".8"/>`,
};

const JUNK = {
  junk_boot: p => `<path d="M9 4h9v14l8 3a3 3 0 0 1 2 3v3H6l1-11z" fill="${p.back}" ${SW}/><path d="M6 24h22" stroke="${p.belly}" stroke-width="3"/><path d="M11 8h5M11 12h5" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round"/>`,
  junk_can: p => `<rect x="9" y="6" width="14" height="21" rx="2" fill="${p.back}" ${SW}/><ellipse cx="16" cy="6.5" rx="7" ry="2" fill="${p.belly}" ${SW}/><rect x="9" y="13" width="14" height="6" fill="${p.accent}"/><path d="M9 13h14M9 19h14" stroke="${O}" stroke-width="1.4"/>`,
  junk_hat: p => `<ellipse cx="16" cy="21" rx="13" ry="5" fill="${p.back}" ${SW}/><path d="M9 20c0-8 3-11 7-11s7 3 7 11z" fill="${p.belly}" ${SW}/><path d="M9.4 17h13.2" stroke="${p.fin}" stroke-width="2.6"/><path d="M5 22l3-1M24 21l3 1" stroke="${p.accent}" stroke-width="1.4"/>`,
  junk_bottle: p => `<path d="M13 3h6v6l3 4v13a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V13l3-4z" fill="${p.back}" opacity=".9" ${SW}/><rect x="12.6" y="2" width="6.8" height="3" rx="1" fill="${p.fin}" ${SW}/><rect x="12" y="15" width="8" height="8" rx="1" transform="rotate(-8 16 19)" fill="${p.accent}" ${SW}/>`,
  junk_duck: p => `<path d="M6 19c0 5 4 8 10 8s10-3 10-8c-3 1-6 1-8-1 3-2 3-8-2-9s-7 3-6 7c-2-1-3-1-4 3z" fill="${p.back}" ${SW}/><path d="M18 11l6 1-5 2z" fill="${p.fin}" ${SW}/><circle cx="16" cy="11.5" r="1.2" fill="${p.accent}"/>`,
  junk_gem: p => `<path d="M9 8l7-4 7 4 2 9-9 11-9-11z" fill="${p.back}" ${SW}/><path d="M9 8l7 4 7-4M16 12v16M7 17h18" stroke="${p.belly}" stroke-width="1.4" fill="none"/>`,
  junk_coin: p => `<circle cx="16" cy="16" r="11" fill="${p.back}" ${SW}/><circle cx="16" cy="16" r="7.5" fill="none" stroke="${p.accent}" stroke-width="1.6"/><path d="M13 13l6 6M19 13l-6 6" stroke="${p.accent}" stroke-width="1.6"/>`,
  junk_key: p => `<circle cx="10" cy="11" r="6" fill="none" stroke="${O}" stroke-width="5"/><circle cx="10" cy="11" r="6" fill="none" stroke="${p.back}" stroke-width="2.6"/><path d="M14.5 15l11 11M21 22l3-3M24 25l2.5-2.5" stroke="${O}" stroke-width="5" stroke-linecap="round"/><path d="M14.5 15l11 11M21 22l3-3M24 25l2.5-2.5" stroke="${p.back}" stroke-width="2.6" stroke-linecap="round"/>`,
  junk_crown: p => `<path d="M5 24l-1-14 7 6 5-9 5 9 7-6-1 14z" fill="${p.back}" ${SW}/><rect x="5" y="23" width="22" height="4" rx="1.5" fill="${p.belly}" ${SW}/><circle cx="16" cy="18" r="2" fill="${p.accent}" ${SW}/>`,
};

const DECOR = {
  flower_box: (c, a) => `<rect x="4" y="18" width="24" height="9" rx="1.5" fill="${c}" ${SW}/>` + [8, 13, 19, 24].map((x, i) => `<path d="M${x} 18v-5" stroke="#4b8a34" stroke-width="2"/><circle cx="${x}" cy="${11 - (i % 2) * 2}" r="3.2" fill="${i % 2 ? '#ffd04f' : a}" ${SW}/>`).join(''),
  wind_chime: (c, a) => `<path d="M6 6h20" stroke="${a}" stroke-width="3" stroke-linecap="round"/><path d="M16 3v3" ${SW}/>` + [9, 13, 17, 21, 24].map((x, i) => `<path d="M${x} 6v${4 + i % 3}" stroke="${O}" stroke-width="1"/><rect x="${x - 1.4}" y="${10 + i % 3}" width="2.8" height="${10 + (i % 3) * 3}" rx="1.2" fill="${c}" ${SW}/>`).join(''),
  hammock: (c, a) => `<path d="M3 8v20M29 8v20" stroke="#8a5532" stroke-width="2.6" stroke-linecap="round"/><path d="M4 12c4 12 20 12 24 0" fill="${c}" ${SW}/><path d="M7 16c5 5 13 5 18 0" stroke="${a}" stroke-width="2" fill="none"/>`,
  fairy_lights: (c, a) => `<path d="M3 9c8 8 18 8 26 0" fill="none" stroke="${c}" stroke-width="1.6"/>` + [[7, 12.5], [12, 15], [16, 15.8], [20, 15], [25, 12.5]].map(([x, y]) => `<circle cx="${x}" cy="${y + 3}" r="5" fill="${a}" opacity=".35"/><circle cx="${x}" cy="${y + 3}" r="2.6" fill="${a}" ${SW}/>`).join(''),
  rug: (c, a) => `<rect x="4" y="8" width="24" height="16" rx="3" fill="${c}" ${SW}/><rect x="8" y="12" width="16" height="8" rx="2" fill="none" stroke="${a}" stroke-width="2"/><path d="M4 11H2M4 15H2M4 19H2M28 11h2M28 15h2M28 19h2" stroke="${a}" stroke-width="1.6"/>`,
  potted_plant: (c, a) => `<path d="M16 18c-6-2-8-8-6-12 4 2 6 6 6 12zM16 18c5-3 9-7 8-11-4 1-7 5-8 11zM16 18c-1-6 1-11 0-14" fill="${a}" ${SW}/><path d="M9 18h14l-2 10H11z" fill="${c}" ${SW}/>`,
  lamp: (c, a) => `<circle cx="16" cy="12" r="11" fill="${a}" opacity=".3"/><path d="M9 14l3-9h8l3 9z" fill="${a}" ${SW}/><path d="M16 14v10M10 27h12" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`,
  cat_bed: (c, a) => `<ellipse cx="16" cy="21" rx="13" ry="7" fill="${c}" ${SW}/><ellipse cx="16" cy="19.5" rx="9" ry="4" fill="${a}" ${SW}/>`,
  bookshelf: (c, a) => `<rect x="6" y="4" width="20" height="24" rx="1.5" fill="${c}" ${SW}/><path d="M6 12h20M6 20h20" ${SW}/>` + [[8, '#e8604a'], [11, '#3fb8b0'], [14, '#f2c14e'], [18, '#6fb548'], [21, '#a57be0']].map(([x, col], i) => `<rect x="${x}" y="${i % 2 ? 6 : 14}" width="2.6" height="6" fill="${col}" ${SW}/>`).join(''),
  radio: (c, a) => `<rect x="4" y="11" width="24" height="15" rx="3" fill="${c}" ${SW}/><circle cx="11" cy="18.5" r="4.2" fill="${a}" ${SW}/><path d="M18 16h7M18 20h7" ${SW}/><path d="M8 11l14-6" ${SW}/>`,
  painting: (c, a) => `<rect x="4" y="6" width="24" height="20" rx="1" fill="${c}" ${SW}/><rect x="7.5" y="9.5" width="17" height="13" fill="#a9e4f2"/><path d="M7.5 19l5-4 4 3 3-2 5 4v2.5h-17z" fill="${a}"/><circle cx="20" cy="13" r="1.8" fill="#ffd04f"/>`,
  fishbowl: (c, a) => `<path d="M9 7h14c5 4 6 12 2 17-2 2-5 3-9 3s-7-1-9-3c-4-5-3-13 2-17z" fill="#bdeef2" ${SW}/>` + fishGlyph(a || '#f4935a', 8, 9, .5),
  fish_trophy: (c, a) => `<path d="M10 25h12l-1 3H11z" fill="${c}" ${SW}/><path d="M8 6h16v15H8z" fill="${c}" ${SW}/>` + fishGlyph(a || '#f2c14e', 7, 6, .58),
  ship_bottle: (c, a) => `<path d="M3 13h20l6 3-6 3H3z" fill="#bdeef2" opacity=".9" ${SW}/><path d="M7 16.5h12l-2 2H9z" fill="${c}"/><path d="M12 16V9l4 4z" fill="#fff" ${SW}/>`,
  rubber_duck: (c, a) => JUNK.junk_duck({ back: c || '#ffd23a', fin: a || '#ff8a1a', accent: O }),
};

function rodSvg(m) {
  const c = m.color || '#d8b86a', w = m.wrap || '#8a5532', tip = m.tip || '#f2e6c0';
  return `${m.glow ? `<circle cx="16" cy="16" r="13" fill="${m.glow}" opacity=".35"/>` : ''}<path d="M6 27L26 5" stroke="${O}" stroke-width="5.2" stroke-linecap="round"/><path d="M6 27L26 5" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M22.5 9L26 5" stroke="${tip}" stroke-width="2" stroke-linecap="round"/><path d="M8.5 24.3l2 1.8M12 20.5l2 1.8M16 16l2 1.8" stroke="${w}" stroke-width="2.4"/><circle cx="11" cy="23" r="3.2" fill="#cfd8dc" ${SW}/><path d="M26 5c2 5 1 10-1 14" fill="none" stroke="#7a8a92" stroke-width="1" stroke-dasharray="1.6 1.6"/>`;
}
function reelSvg(m) {
  const c = m.color || '#9a9a9a', a = m.accent || '#5a5a5a';
  return `<circle cx="16" cy="16" r="11" fill="${c}" ${SW}/><circle cx="16" cy="16" r="6.2" fill="${a}" ${SW}/><circle cx="16" cy="16" r="2" fill="#fff6e4" ${SW}/><path d="M16 16l8.5-7" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/><circle cx="25" cy="8.5" r="2.6" fill="#f4ecd8" ${SW}/>`;
}
function lineSvg(m) {
  const c = m.color || '#f4ecd8';
  return `<rect x="8" y="6" width="16" height="4" rx="1.5" fill="#b77d4b" ${SW}/><rect x="8" y="22" width="16" height="4" rx="1.5" fill="#b77d4b" ${SW}/><rect x="10" y="10" width="12" height="12" fill="${c}" ${SW}/><path d="M10 13h12M10 16h12M10 19h12" stroke="${shade(c, -0.25)}" stroke-width="1.2"/><path d="M22 18c4 1 6 4 6 8" fill="none" stroke="${shade(c, -0.35)}" stroke-width="1.4" stroke-linecap="round"/>`;
}
function basketSvg(r) {
  const s = 0.8 + (r.tier || 0) * 0.07;
  return `<g transform="translate(${16 - 16 * s} ${17 - 16 * s}) scale(${s})">${ICONS.basket().replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
}
function hatSvg(r) {
  const c = r.color || '#e8c872', b = r.band || '#b8423a';
  const pirate = r.id === 'hat_pirate';
  if (pirate) return `<path d="M3 20c4-2 7-12 13-12s9 10 13 12c-4 3-22 3-26 0z" fill="${c}" ${SW}/><circle cx="16" cy="15" r="2.6" fill="${b}"/><path d="M14.4 13.4l3.2 3.2M17.6 13.4l-3.2 3.2" stroke="${c}" stroke-width="1.2"/>`;
  return `<ellipse cx="16" cy="21" rx="14" ry="5.5" fill="${c}" ${SW}/><path d="M8 20c0-8 3.6-11 8-11s8 3 8 11c-3 1.4-13 1.4-16 0z" fill="${shade(c, 0.12)}" ${SW}/><path d="M8.3 17c3 1.4 12.4 1.4 15.4 0" stroke="${b}" stroke-width="3" fill="none"/><path d="M6 23.5c3 1 6 1.2 9 1.2" stroke="${shade(c, -0.2)}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
}
function collarSvg(r) {
  const c = r.color || '#d84a3a', b = r.bell || '#f5c542';
  return `<ellipse cx="16" cy="14" rx="11" ry="6.5" fill="none" stroke="${O}" stroke-width="6"/><ellipse cx="16" cy="14" rx="11" ry="6.5" fill="none" stroke="${c}" stroke-width="3.6"/><circle cx="16" cy="23" r="4" fill="${b}" ${SW}/><path d="M14 24h4" stroke="${O}" stroke-width="1.4"/>` + (r.id === 'collar_flower' ? `<circle cx="7" cy="12" r="2.2" fill="#fff" ${SW}/><circle cx="25" cy="12" r="2.2" fill="#fff" ${SW}/>` : '');
}
function bucketSvg(m) {
  const c = m.color || '#5a8ab0', a = m.accent || '#c8c8c8';
  return `<path d="M9 7Q16 0 23 7" fill="none" stroke="${O}" stroke-width="2"/>`
    + `<path d="M6 9L9 27Q16 30 23 27L26 9Z" fill="${c}" ${SW}/>`
    + `<ellipse cx="16" cy="9" rx="10" ry="3" fill="#7fd0e0" ${SW}/>`
    + `<path d="M8 17Q16 20 24 17" fill="none" stroke="${a}" stroke-width="1.4" opacity=".8"/>`;
}
function lanternSvg(m) {
  const c = m?.color || '#b8623b', g = m?.glass || '#ffe7a0';
  return `<circle cx="16" cy="18" r="12" fill="${m?.light || '#ffc870'}" opacity=".3"/><path d="M12 5a4 4 0 0 1 8 0" fill="none" stroke="${O}" stroke-width="2.2"/><rect x="10" y="7" width="12" height="4" rx="1" fill="${c}" ${SW}/><path d="M11 11h10l1 12H10z" fill="${g}" ${SW}/><path d="M14 13.5v7M18 13.5v7" stroke="${c}" stroke-width="1.6"/><rect x="9" y="23" width="14" height="4" rx="1" fill="${c}" ${SW}/>`;
}
function boatSvg(r) {
  if (r.id === 'boat_oars') return `<path d="M5 27L22 6M10 27L27 6" stroke="${O}" stroke-width="4.4" stroke-linecap="round"/><path d="M5 27L22 6M10 27L27 6" stroke="#d9a46e" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="22" cy="7" rx="2.6" ry="5" transform="rotate(39 22 7)" fill="#b77d4b" ${SW}/><ellipse cx="27" cy="7" rx="2.6" ry="5" transform="rotate(39 27 7)" fill="#b77d4b" ${SW}/>`;
  if (r.id === 'boat_sail') return ICONS.boat().replace(/^<svg[^>]*>|<\/svg>$/g, '');
  return ICONS.board().replace(/^<svg[^>]*>|<\/svg>$/g, '') + `<path d="M20 4l6 6M24 4l-4 4" stroke="#8a5532" stroke-width="2.4" stroke-linecap="round"/>`;
}
function dishSvg(m) {
  const p = m?.plate || '#f4ecd8', f = m?.food || '#c8823a', g = m?.garnish || '#4a7a5a';
  return `<ellipse cx="16" cy="20" rx="13.5" ry="7.5" fill="${p}" ${SW}/><ellipse cx="16" cy="19.5" rx="9.5" ry="4.8" fill="${shade(p, -0.08)}"/><path d="M8.5 19c0-4 4-6.5 7.5-6.5s7.5 2.5 7.5 6.5c-2 2-13 2-15 0z" fill="${f}" ${SW}/><circle cx="12.5" cy="16" r="1.4" fill="${g}"/><circle cx="18" cy="15" r="1.2" fill="${g}"/><circle cx="20.5" cy="17.5" r="1.3" fill="${g}"/><path d="M11 9c-1-2 1-3 0-5M16 8c-1-2 1-3 0-5M21 9c-1-2 1-3 0-5" fill="none" stroke="#c4ccd2" stroke-width="1.6" stroke-linecap="round"/>`;
}
function recipeSvg(m) {
  return `<rect x="4" y="3.5" width="21" height="25" rx="2" transform="rotate(-6 14.5 16)" fill="#fff6e4" ${SW}/><path d="M9 9h10M9 12.5h7" stroke="#c9a77a" stroke-width="1.6" stroke-linecap="round" transform="rotate(-6 14.5 16)"/><g transform="translate(8 9) scale(.72)">${dishSvg(m)}</g>`;
}
function homeSvg(r) {
  const m = r.model || {};
  if (m.kind === 'tent') return `<path d="M3 26L16 6l13 20z" fill="${m.cloth}" ${SW}/><path d="M16 6v20M12 26l4-9 4 9" fill="${m.trim}" ${SW}/><path d="M2 26.5h28" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/>`;
  const walls = m.walls || '#b07a4a', roof = m.roof || '#7d3d24';
  const big = m.kind === 'cottage';
  return `<rect x="${big ? 4 : 6}" y="14" width="${big ? 24 : 20}" height="13" fill="${walls}" ${SW}/><path d="M${big ? 2 : 4} 15L16 5l${big ? 14 : 12} 10z" fill="${roof}" ${SW}/><rect x="13.5" y="19" width="5" height="8" fill="${m.wood || '#8a5532'}" ${SW}/><rect x="${big ? 7 : 8.5}" y="17.5" width="3.6" height="3.6" fill="#ffe7a0" ${SW}/>${big ? `<rect x="21.4" y="17.5" width="3.6" height="3.6" fill="#ffe7a0" ${SW}/><rect x="21" y="6" width="3" height="5" fill="${walls}" ${SW}/>` : ''}`;
}

/**
 * SVG string for a data item record (bait, rod, reel, line, basket, lantern, boat, cosmetic, ingredient, dish, recipe,
 * decor, home, junk). Fish should use a thumbnail image instead (see art.js); a generic fish glyph is returned for them.
 */
export function itemIcon(rec) {
  if (!rec) return icon('question');
  const m = rec.model || {};
  let inner = '';
  try {
    switch (rec.kind) {
      case 'bait': inner = (BAIT[m.shape] || BAIT.worm)(m.color || '#d27a72', m.accent || '#a8524c'); break;
      case 'rod': inner = rodSvg(m); break;
      case 'reel': inner = reelSvg(m); break;
      case 'line': inner = lineSvg(m); break;
      case 'basket': inner = basketSvg(rec); break;
      case 'lantern': inner = lanternSvg(m); break;
      case 'tool': inner = bucketSvg(m); break;   // [r2-gameplay] the bucket
      case 'boat': inner = boatSvg(rec); break;
      case 'cosmetic': inner = rec.slot === 'cat_collar' ? collarSvg(rec) : hatSvg(rec); break;
      case 'ingredient': inner = (ING[m.shape] || ING.herb)(m.color || '#6fb548', m.accent || '#4b8a34'); break;
      case 'dish': inner = dishSvg(rec.model || rec._recipe?.model); break;
      case 'recipe': inner = recipeSvg(m); break;
      case 'decor': inner = (DECOR[m.shape] || DECOR.flower_box)(m.color || '#b07a4a', m.accent || '#f2a0c0'); break;
      case 'home': inner = homeSvg(rec); break;
      case 'junk': inner = (JUNK[m.shape] || JUNK.junk_boot)(m.palette || {}); break;
      case 'fish': inner = fishGlyph(m.palette?.back || '#3fb8b0'); break;
      default: inner = ICONS.sparkle().replace(/^<svg[^>]*>|<\/svg>$/g, '');
    }
  } catch (e) {
    inner = ICONS.sparkle().replace(/^<svg[^>]*>|<\/svg>$/g, '');
  }
  return svg(inner, 'item');
}
