// Fishing meters. ui.meter('reel', {tension 0..1, progress 0..1, hint, fishId?}) every frame while reeling,
// ui.meter('reel', null) to hide. ui.meter('cast', {power 0..1}) drives the ring around the action button.
// Any other name shows a simple labelled bar: ui.meter('xyz', {value, label}).
import { h, clamp } from './dom.js';
import { icon } from './icons.js';

const ARC_LEN = 100;

export function createMeters(ui) {
  const { ctx } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const el = h('div.meters');

  // ── reel: tension arc (green → amber → red) + distance track with the fish swimming to the rod ──
  const reel = h('div.reel.paper.stitched.hidden');
  reel.innerHTML = `
    <svg class="reel-arc" viewBox="0 0 200 112" aria-hidden="true">
      <defs>
        <linearGradient id="reel-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#7cc96a"/><stop offset=".55" stop-color="#f5c542"/><stop offset=".8" stop-color="#f39a4a"/><stop offset="1" stop-color="#e2553f"/>
        </linearGradient>
      </defs>
      <path class="arc-bg" d="M20 100 A80 80 0 0 1 180 100" pathLength="${ARC_LEN}"/>
      <path class="arc-zone" d="M20 100 A80 80 0 0 1 180 100" pathLength="${ARC_LEN}" stroke-dasharray="20 ${ARC_LEN}" stroke-dashoffset="-80"/>
      <path class="arc-fill" d="M20 100 A80 80 0 0 1 180 100" pathLength="${ARC_LEN}" stroke-dasharray="0 ${ARC_LEN}"/>
      <g class="needle"><path d="M100 100 L100 34" /><circle cx="100" cy="100" r="9"/></g>
    </svg>`;
  const label = h('div.reel-label');
  const track = h('div.reel-track', h('div.reel-water'), h('div.reel-fill'));
  const fish = h('div.reel-fish', { html: icon('fish') });
  const rodIc = h('div.reel-rod', { html: icon('reel') });
  track.append(fish, rodIc);
  const hint = h('div.reel-hint');
  reel.append(label, track, hint);
  el.append(reel);

  const extra = new Map(); // other meters
  let reelVisible = false, lastHint = '', tensionSmooth = 0;

  function setReel(d) {
    if (!d) {
      if (reelVisible) { reel.classList.add('out'); setTimeout(() => { if (!reelVisible) reel.classList.add('hidden'); reel.classList.remove('out'); }, 260); }
      reelVisible = false;
      ui.root.classList.remove('reeling');
      return;
    }
    if (!reelVisible) { reel.classList.remove('hidden', 'out'); reelVisible = true; label.textContent = t('ui.reel.tension'); ui.root.classList.add('reeling'); }
    const ten = clamp(+d.tension || 0, 0, 1), prog = clamp(+d.progress || 0, 0, 1);
    tensionSmooth = ten;
    const arcFill = reel.querySelector('.arc-fill');
    arcFill.setAttribute('stroke-dasharray', `${(ten * ARC_LEN).toFixed(1)} ${ARC_LEN}`);
    reel.querySelector('.needle').setAttribute('transform', `rotate(${(-90 + ten * 180).toFixed(1)} 100 100)`);
    const danger = d.danger ?? ten > 0.8;
    reel.classList.toggle('danger', !!danger);
    reel.classList.toggle('slack', ten < 0.12);
    track.querySelector('.reel-fill').style.width = (prog * 100).toFixed(1) + '%';
    fish.style.left = `calc(${(prog * 100).toFixed(1)}% - ${(prog * 30).toFixed(1)}px)`;
    fish.classList.toggle('pull', !!d.pulling);
    let hk = d.hint;
    if (hk === undefined) hk = danger ? 'ui.reel.release' : d.pulling ? 'ui.reel.pull' : ctx.input.isDown?.('action') ? '' : 'ui.reel.hold';
    const txt = hk ? (ctx.i18n.has(hk) || hk.startsWith('ui.') ? t(hk) : hk) : '';
    if (txt !== lastHint) { hint.textContent = txt; hint.classList.toggle('hidden', !txt); lastHint = txt; }
    hint.classList.toggle('warn', !!danger);
  }

  function setGeneric(name, d) {
    let m = extra.get(name);
    if (!d) { if (m) { m.remove(); extra.delete(name); } return; }
    if (!m) { m = h('div.gmeter.paper', h('div.gm-label'), h('div.gm-bar', h('i'))); el.append(m); extra.set(name, m); }
    m.querySelector('.gm-label').textContent = d.label ? (ctx.i18n.has(d.label) ? t(d.label) : d.label) : '';
    m.querySelector('.gm-bar i').style.width = (clamp(+d.value || 0, 0, 1) * 100).toFixed(1) + '%';
  }

  function meter(name, d) {
    if (name === 'reel') return setReel(d);
    if (name === 'cast' || name === 'charge') return ui.controls.setCharge(d ? (d.power ?? d.value ?? 0) : null);
    return setGeneric(name, d);
  }
  function applyLang() { label.textContent = t('ui.reel.tension'); lastHint = '\u0000'; }
  return { el, meter, applyLang, get reelVisible() { return reelVisible; } };
}
