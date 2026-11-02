// Touch controls: floating virtual joystick (left part of the screen), big context action button with hold
// support and a charge ring, bait selector with a popover list. Everything is forwarded to ctx.input.
import { h, onTap, clamp } from './dom.js';
import { icon, itemIcon, hasIcon } from './icons.js';

const R = 54;            // joystick radius in px (knob travel)

export function createControls(ui) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const el = h('div.controls');

  // ── joystick ──
  const zone = h('div.joy-zone');
  const base = h('div.joy-base', h('div.joy-ring'));
  const knob = h('div.joy-knob');
  base.append(knob);
  const ghost = h('div.joy-ghost', h('div.joy-ghost-knob'));
  zone.append(ghost, base);
  let jid = null, ox = 0, oy = 0, used = false;
  const zoneRect = () => zone.getBoundingClientRect();
  zone.addEventListener('pointerdown', e => {
    if (jid !== null || !ctx.input.enabled) return;
    jid = e.pointerId;
    try { zone.setPointerCapture(jid); } catch { /* ignore */ }
    const r = zoneRect();
    ox = clamp(e.clientX, r.left + R + 8, r.right - R - 8);
    oy = clamp(e.clientY, r.top + R + 8, r.bottom - R - 8);
    base.style.transform = `translate(${ox - r.left}px, ${oy - r.top}px)`;
    knob.style.transform = 'translate(0px, 0px)';
    base.classList.add('on');
    ghost.classList.add('off');
    move(e);
    e.preventDefault();
  });
  function move(e) {
    if (e.pointerId !== jid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > R * 1.5) { // base follows the thumb (floating stick)
      const k = (d - R * 1.5) / d; ox += dx * k; oy += dy * k; dx = e.clientX - ox; dy = e.clientY - oy;
      const r = zoneRect(); base.style.transform = `translate(${ox - r.left}px, ${oy - r.top}px)`;
    }
    const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx);
    const kx = Math.cos(a) * m * R, ky = Math.sin(a) * m * R;
    knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
    ctx.input.setJoystick(kx / R, -ky / R);
    if (m > 0.3 && !used) { used = true; ui.tips?.done('move'); }
  }
  zone.addEventListener('pointermove', move);
  const endJoy = e => {
    if (e.pointerId !== jid) return;
    jid = null; ctx.input.setJoystick(0, 0);
    base.classList.remove('on');
    knob.style.transform = 'translate(0px, 0px)';
  };
  zone.addEventListener('pointerup', endJoy);
  zone.addEventListener('pointercancel', endJoy);
  zone.addEventListener('lostpointercapture', endJoy);

  // ── action button ──
  const act = h('button.act', { type: 'button' });
  const actIc = h('span.act-ic');
  const ring = h('span.act-ring', { html: `<svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="46"/><circle class="fill" cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg>` });
  const actLabel = h('span.act-label');
  const keycap = h('span.keycap', '␣');
  act.append(ring, actIc, h('span.act-tag', actLabel, keycap));
  let actDown = null;
  act.addEventListener('pointerdown', e => {
    if (actDown !== null) return;
    actDown = e.pointerId;
    try { act.setPointerCapture(actDown); } catch { /* ignore */ }
    act.classList.add('pressed');
    ctx.input.setAction(true, 'ui');
    ui.haptic(8);
    ui.tips?.done('action');
    e.preventDefault();
  });
  const actUp = e => {
    if (e.pointerId !== actDown) return;
    actDown = null; act.classList.remove('pressed');
    ctx.input.setAction(false, 'ui');
  };
  act.addEventListener('pointerup', actUp);
  act.addEventListener('pointercancel', actUp);
  act.addEventListener('lostpointercapture', actUp);

  // ── side choice (a second, smaller action: e.g. "sit on the edge" while the big button casts) ──
  const alt = h('button.alt-btn.round.paper-btn.hidden', { type: 'button' });
  const altIc = h('span.alt-ic');
  const altLabel = h('span.alt-label');
  alt.append(altIc, h('span.alt-tag', altLabel));
  onTap(alt, () => { if (ctx.systems?.interact?.runSecondary?.()) { ui.sfx('ui_tap'); ui.haptic(8); refresh(true); } });

  // ── bait selector ──
  const bait = h('button.bait-btn.round.paper-btn', { type: 'button' });
  const baitIc = h('span.bait-ic');
  const baitN = h('span.bait-n');
  bait.append(baitIc, baitN);
  const pop = h('div.bait-pop.paper.stitched.hidden');
  onTap(bait, () => togglePop());
  function togglePop(force) {
    const open = force ?? pop.classList.contains('hidden');
    if (open) { renderPop(); pop.classList.remove('hidden'); ui.sfx('ui_open', { vol: 0.6 }); }
    else pop.classList.add('hidden');
  }
  function renderPop() {
    const cur = A.equipped('bait');
    const list = A.baits();
    pop.replaceChildren(h('div.pop-title', t('ui.hud.bait_pick')),
      h('div.pop-list.scroll', list.map(b => {
        const n = A.count(b.id);
        const row = h('button.pop-row' + (b.id === cur ? '.on' : ''), { type: 'button' },
          h('span.pop-ic', { html: itemIcon(b) }),
          h('span.pop-name', t(b.nameKey)),
          h('span.pop-n', b.free ? t('ui.misc.infinite') : t('ui.misc.x_n', { n })));
        onTap(row, () => { selectBait(b.id); togglePop(false); });
        return row;
      })));
  }
  function selectBait(id) {
    const r = A.equip('bait', id);
    if (r.ok !== false) { ui.sfx('ui_tap'); ui.toast(t('ui.toast.equipped', { item: A.name(id) }), { icon: itemIcon(A.item(id)), quiet: true }); }
    refresh(true);
  }
  /** Keyboard B: cycle to the next bait. */
  function cycleBait() {
    const list = A.baits(); if (list.length < 2) return;
    const i = list.findIndex(b => b.id === A.equipped('bait'));
    selectBait(list[(i + 1) % list.length].id);
  }

  el.append(zone, h('div.act-wrap', pop, h('div.act-side', alt, bait), act));

  // ── state refresh ──
  let lastSig = '', lastBait = '', lastAlt = '';
  function refresh(force = false) {
    const cur = A.interaction();
    const hasSystems = !!ctx.systems;
    let label = '', ic = '', show = true;
    if (cur) {
      label = cur.label || (cur.labelKey ? t(cur.labelKey, cur.labelVars) : '') || (cur.icon && ctx.i18n.has('ui.act.' + cur.icon) ? t('ui.act.' + cur.icon) : t('ui.act.default'));
      ic = cur.icon || 'hand';
      show = cur.disabled !== true;
    } else if (!hasSystems) { label = t('ui.act.default'); ic = 'hand'; }
    else show = false;
    const sig = `${label}|${ic}|${show}|${ctx.input.lastDevice}`;
    if (sig !== lastSig || force) {
      lastSig = sig;
      actLabel.textContent = label;
      actIc.innerHTML = icon(hasIcon(ic) ? ic : 'hand');
      act.setAttribute('aria-label', label || t('ui.hud.action'));
      act.classList.toggle('idle', !show);
      act.classList.toggle('kb', ctx.input.lastDevice === 'keyboard' && !ctx.input.isTouch);
      act.classList.toggle('hold', !!cur?.hold);
    }
    // side choice
    const sec = ctx.systems?.interact?.secondary || null;
    const secLabel = sec ? (sec.label || (sec.labelKey ? t(sec.labelKey, sec.labelVars) : '')) : '';
    const asig = `${sec?.id || ''}|${secLabel}`;
    if (asig !== lastAlt || force) {
      lastAlt = asig;
      alt.classList.toggle('hidden', !sec);
      if (sec) { altIc.innerHTML = icon(hasIcon(sec.icon) ? sec.icon : 'hand'); altLabel.textContent = secLabel; alt.setAttribute('aria-label', secLabel); }
    }
    // bait
    const b = A.equipped('bait') || 'bait_worm';
    const rec = A.item(b);
    const n = rec?.free ? null : A.count(b);
    const bsig = `${b}|${n}|${ctx.i18n.lang}`;
    if (bsig !== lastBait || force) {
      lastBait = bsig;
      baitIc.innerHTML = rec ? itemIcon(rec) : icon('bait');
      baitN.textContent = n === null ? t('ui.misc.infinite') : String(n);
      bait.setAttribute('aria-label', `${t('ui.hud.bait')}: ${rec ? t(rec.nameKey) : ''}`);
      bait.classList.toggle('empty', n === 0);
    }
    bait.classList.toggle('hidden', !ctx.data?.baits?.length);
    if (!pop.classList.contains('hidden') && force) renderPop();
  }

  /** Charge ring around the action button: power 0..1, or null to hide. */
  function setCharge(power) {
    const fill = ring.querySelector('.fill');
    if (power === null || power === undefined) { act.classList.remove('charging'); fill.setAttribute('stroke-dashoffset', '100'); return; }
    act.classList.add('charging');
    fill.setAttribute('stroke-dashoffset', String(100 - clamp(power, 0, 1) * 100));
    act.classList.toggle('max', power >= 0.98);
  }

  function releaseAll() {
    if (jid !== null) { jid = null; ctx.input.setJoystick(0, 0); base.classList.remove('on'); }
    if (actDown !== null) { actDown = null; act.classList.remove('pressed'); ctx.input.setAction(false, 'ui'); }
    togglePop(false);
  }

  return { el, refresh, setCharge, cycleBait, togglePop, releaseAll, act, bait, alt, zone };
}
