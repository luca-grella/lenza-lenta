// Dialogue box: NPC portrait + name plank, typewriter text, tap to advance, optional choices.
// ui.dialog(npcId, lines, choices?, opts?) → Promise resolving to the chosen choice (its `id`/`value`, or its index),
// or null when there were no choices. lines: i18n keys | strings | {key, vars} | {text}.
import { h, onTap } from './dom.js';
import { icon } from './icons.js';
import { portrait } from './art.js';

const CPS = 46; // characters per second

export function createDialog(ui) {
  const { ctx } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const el = h('div.dialog-host');
  let chain = Promise.resolve();
  let cur = null; // {resolve, lines, i, text, shown, typing, choices, node...}

  const lineText = l => {
    if (l === null || l === undefined) return '';
    if (typeof l === 'string') return ctx.i18n.has(l) ? t(l) : l;
    if (l.text) return l.text;
    if (l.key) return t(l.key, l.vars);
    return String(l);
  };
  const choiceText = c => (typeof c === 'string' ? (ctx.i18n.has(c) ? t(c) : c) : c.label || c.text || (c.key ? t(c.key, c.vars) : String(c.id ?? '')));

  function dialog(npcId, lines = [], choices = null, opts = {}) {
    const p = chain.then(() => run(npcId, Array.isArray(lines) ? lines : [lines], choices, opts));
    chain = p.catch(() => null);
    return p;
  }

  function run(npcId, lines, choices, opts) {
    return new Promise(resolve => {
      const npcData = ctx.data?.npcById?.[npcId];
      const speaker = npcData || ctx.data?.speakers?.find?.(s => s.id === npcId);
      const name = opts.name || (speaker?.nameKey ? t(speaker.nameKey) : npcId === 'letter' ? t('ui.dialog.letter') : (npcId || ''));
      const role = npcData?.roleKey ? t(npcData.roleKey) : '';
      const voice = npcData?.voice || 1;

      const box = h('div.dialog.paper.stitched' + (npcId === 'letter' ? '.letter' : ''));
      const face = h('div.dlg-face', { html: portrait(ctx, npcId) });
      const plank = h('div.dlg-name.plank', h('span', name), role ? h('small', role) : null);
      const text = h('div.dlg-text');
      const more = h('div.dlg-more', { html: icon('down') });
      const choiceBox = h('div.dlg-choices');
      box.append(face, plank, text, more, choiceBox);
      el.replaceChildren(box);
      requestAnimationFrame(() => box.classList.add('in'));

      // camera framing on the speaker
      const npcObj = ctx.npcs?.get?.(npcId)?.object;
      const rig = ctx.cameraRig;
      const camWas = rig?.mode;
      if (npcObj && rig && camWas === 'explore' && opts.camera !== false) { rig.setMode('dialog'); rig.setFocus(npcObj); }

      ui.setBusy('dialog', true);
      ctx.bus.emit('ui:dialog', { npcId, open: true });
      ui.sfx('ui_open', { vol: 0.5 });

      cur = { npcId, opts, npcData, speaker, plank, openFrame: ctx.loop.frame, resolve, lines, i: -1, full: '', shown: 0, typing: false, choices, box, text, more, choiceBox, voice, sel: 0, acc: 0, done: false,
        finish(result) {
          if (cur?.done) return; cur.done = true;
          box.classList.remove('in'); box.classList.add('bye');
          setTimeout(() => { if (box.parentNode === el) box.remove(); }, 260);
          if (npcObj && rig && camWas === 'explore' && opts.camera !== false) { rig.setFocus(null); rig.setMode(camWas); }
          ui.setBusy('dialog', false);
          ctx.bus.emit('ui:dialog', { npcId, open: false });
          const r = cur.resolve; cur = null;
          r(result);
        } };
      onTap(box, e => { if (!e.target.closest('.dlg-choice')) advance(); });
      nextLine();
    });
  }

  function nextLine() {
    if (!cur) return;
    cur.i++;
    if (cur.i >= cur.lines.length) {
      if (cur.choices?.length) return showChoices();
      return cur.finish(null);
    }
    cur.full = lineText(cur.lines[cur.i]);
    cur.shown = 0; cur.acc = 0; cur.typing = true;
    cur.text.textContent = '';
    cur.more.classList.remove('on');
    cur.choiceBox.replaceChildren();
    if (!cur.full) { cur.typing = false; nextLine(); }
  }
  /** [Fix] live language switch: re-translate the open dialog (name, role, current line, choices). */
  function applyLang() {
    if (!cur || cur.done) return;
    const { npcId, opts, npcData, speaker } = cur;
    const name = opts.name || (speaker?.nameKey ? t(speaker.nameKey) : npcId === 'letter' ? t('ui.dialog.letter') : (npcId || ''));
    const role = npcData?.roleKey ? t(npcData.roleKey) : '';
    cur.plank.replaceChildren(h('span', name), ...(role ? [h('small', role)] : []));
    if (cur.i >= 0 && cur.i < cur.lines.length) {
      cur.full = lineText(cur.lines[cur.i]);
      if (cur.typing) cur.shown = Math.min(cur.shown, cur.full.length); else cur.shown = cur.full.length;
      cur.acc = cur.shown;
      cur.text.textContent = cur.full.slice(0, cur.shown);
    }
    if (cur.choiceBox.children.length && cur.choices) [...cur.choiceBox.children].forEach((b, i) => { b.textContent = choiceText(cur.choices[i]); });
  }
  function showChoices() {
    cur.more.classList.remove('on');
    cur.sel = 0;
    const btns = cur.choices.map((c, i) => {
      const b = h('button.dlg-choice.btn.ghost' + (i === 0 ? '.sel' : ''), { type: 'button' }, choiceText(c));
      onTap(b, () => pick(i));
      return b;
    });
    cur.choiceBox.replaceChildren(...btns);
    cur.box.classList.add('has-choices');
  }
  function pick(i) {
    if (!cur) return;
    const c = cur.choices[i];
    ui.sfx('ui_tap');
    cur.finish(c && typeof c === 'object' ? (c.id ?? c.value ?? i) : i);
  }
  function advance() {
    if (!cur) return;
    if (cur.typing) { cur.shown = cur.full.length; cur.text.textContent = cur.full; cur.typing = false; cur.more.classList.add('on'); return; }
    if (cur.i >= cur.lines.length) return; // waiting for a choice
    ui.sfx('page_turn', { vol: 0.35 });
    nextLine();
  }

  function onKey(e) {
    if (!cur || !cur.choiceBox.children.length) return;
    const n = cur.choiceBox.children.length;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') cur.sel = (cur.sel + 1) % n;
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') cur.sel = (cur.sel + n - 1) % n;
    else if (/^Digit[1-9]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (i < n) pick(i); return; }
    else return;
    [...cur.choiceBox.children].forEach((b, i) => b.classList.toggle('sel', i === cur.sel));
  }
  window.addEventListener('keydown', onKey);

  /** Loop tick: typewriter + keyboard advance. */
  function update(dt) {
    if (!cur) return;
    if (cur.typing) {
      cur.acc += dt * CPS;
      const n = Math.min(cur.full.length, Math.floor(cur.acc));
      if (n !== cur.shown) {
        const prev = cur.shown;
        cur.shown = n;
        cur.text.textContent = cur.full.slice(0, n);
        if (Math.floor(n / 3) !== Math.floor(prev / 3) && /\S/.test(cur.full[n - 1] || '')) ui.sfx('ui_tap', { vol: 0.08, pitch: cur.voice * (0.9 + Math.random() * 0.25) });
      }
      if (n >= cur.full.length) { cur.typing = false; cur.more.classList.add('on'); }
    }
    const inp = ctx.input;
    if (ctx.loop.frame === cur.openFrame) return; // the press that opened the dialog
    if (inp.pressed('action') || inp.pressed('interact')) {
      if (cur.choiceBox.children.length) pick(cur.sel); else advance();
    }
  }

  return { el, dialog, update, applyLang, get open() { return !!cur; }, advance };
}
