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
    // the base stays where the thumb landed until release; the knob is clamped to the ring
    const dx = e.clientX - ox, dy = e.clientY - oy;
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
  // [10 nov] four small buttons, one per kind of action, always in the same order:
  // talk · hands (pick, pet…) · the fish on the mat · the place (sit, shop counter, boat…).
  // [11 nov] Luca: around the big button like a circle, not stacked: the visible ones take the arc positions in order.
  const slotBtns = [0, 1, 2, 3].map(i => {
    const b = h(`button.alt-btn.slot-${i}.round.paper-btn.empty`, { type: 'button' });
    b._ic = h('span.alt-ic'); b._label = h('span.alt-label');
    b.append(b._ic, h('span.alt-tag', b._label));
    onTap(b, () => { if (ctx.systems?.interact?.runSlot?.(i)) { ui.sfx('ui_tap'); ui.haptic(8); refresh(true); } });
    return b;
  });
  const alt = slotBtns[0];
  // [11 nov] one radius for every small button, 26° apart from the bait (194°) up to just left of straight up (88°):
  // labels go left, the top one above, and none of them can touch another button or label (checked at 390 px wide)
  // the circle depends on the cap of small buttons (systems/interact MAX_SMALL): fewer buttons, smaller circle
  // closest radius where the small buttons clear the big one and each other (labels included, checked at 390 px)
  const BAIT_DEG = 180;
  const LAYOUT = { 1: { R: 88, Rc: 76, at: [[130, 'left']] }, 2: { R: 88, Rc: 76, at: [[139, 'left'], [98, 'top']] },
    3: { R: 108, Rc: 104, at: [[145, 'left'], [110, 'left'], [75, 'top']] }, 4: { R: 150, at: [[168, 'left'], [142, 'left'], [116, 'left'], [88, 'top']] } };
  const layout = () => LAYOUT[ctx.systems?.interact?.maxSmall] || LAYOUT[3];

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

  // the bait is one of the small buttons too: same circle, lowest place (left of the big button)
  bait.style.setProperty('--cx', Math.cos(BAIT_DEG * Math.PI / 180).toFixed(3)); bait.style.setProperty('--cy', (-Math.sin(BAIT_DEG * Math.PI / 180)).toFixed(3));
  const orbit = h('div.act-orbit', bait, ...slotBtns);
  el.append(zone, h('div.act-wrap', pop, act, orbit));

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
    const sl = ctx.systems?.interact?.slots || [];
    const lab = s => (s ? (s.label || (s.labelKey ? t(s.labelKey, s.labelVars) : '')) : '');
    const asig = slotBtns.map((b, i) => `${sl[i]?.id || ''}|${lab(sl[i])}`).join('/');
    if (asig !== lastAlt || force) {
      lastAlt = asig;
      slotBtns.forEach((b, i) => {
        const s = sl[i];
        b.classList.toggle('empty', !s);
        if (s) { b._ic.innerHTML = icon(hasIcon(s.icon) ? s.icon : 'hand'); b._label.textContent = lab(s); b.setAttribute('aria-label', lab(s)); }
        else b._label.textContent = '';
      });
      // arc around the big button (degrees from the right, counter-clockwise; label side so labels never cross a button)
      let k = 0;
      for (const b of slotBtns) {
        if (b.classList.contains('empty')) continue;
        const L = layout(), [deg, side] = L.at[Math.min(k++, L.at.length - 1)], a = deg * Math.PI / 180;
        orbit.style.setProperty('--R', (document.getElementById('ui')?.classList.contains('compact') ? (L.Rc || 0.85 * L.R) : L.R) + 'px');
        b.style.setProperty('--cx', Math.cos(a).toFixed(3)); b.style.setProperty('--cy', (-Math.sin(a)).toFixed(3));
        b.dataset.tag = side;
      }
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
