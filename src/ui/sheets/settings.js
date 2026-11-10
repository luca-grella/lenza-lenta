// Settings: language (live), music & effects volume, graphics quality, haptics, install help, credits,
// save backup (export as file or code / import from file or code, with an in-page confirmation), reset.
import { h, onTap, fmt } from '../dom.js';
import { icon } from '../icons.js';
import { section } from './common.js';
import { isStandalone, isIOS } from '../pwa.js';
import * as SF from '../savefile.js';

export default function settings(ui) {
  const { ctx } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  let confirmReset = false, creditsOpen = false;
  let qNote = null;
  // save backup panel: null | 'code' (export code shown) | 'import' (file / paste) | 'confirm' (summary + yes/no)
  let savePanel = null, codeText = '', pasted = '', importErr = '', pending = null, busy = false;
  const fileIn = h('input.hidden', { type: 'file', accept: 'application/json,.json,text/plain,.txt' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    let text = '';
    try { text = await f.text(); } catch { importErr = t('ui.save.err_read'); spec.refresh(); return; }
    check(text);
  });
  function check(text) {
    const r = SF.decode(text, ctx.save.state?.v || 1);
    if (!r.ok) { importErr = t('ui.save.err_' + r.reason); pending = null; savePanel = 'import'; ui.sfx('ui_close', { vol: 0.4 }); }
    else { importErr = ''; pending = { state: r.state, sum: SF.summary(r.state, ctx) }; savePanel = 'confirm'; ui.sfx('ui_open', { vol: 0.5 }); }
    spec.refresh();
  }
  function applyImport() {
    const state = pending?.state;
    if (!state) return;
    ui.sheets.close(undefined, { silent: true });
    // freeze the world first: nothing may write the old game's values over the imported save before the reload
    if (ctx.time) ctx.time.paused = true;
    ctx.loop?.pause?.(true);
    const ok = ctx.save.import(state);
    if (!ok) { ctx.loop?.pause?.(false); if (ctx.time) ctx.time.paused = false; ui.toast('ui.save.import_failed', { icon: 'info', kind: 'warn' }); return; }
    ui.toast('ui.save.imported', { icon: 'check', kind: 'good', ms: 4000 });
    setTimeout(() => location.reload(), 1200);
  }
  const dateText = ms => { try { return new Date(ms).toLocaleDateString(ctx.i18n.lang === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };

  function savePart(body) {
    const out = [section(t('ui.set.save'), 'book')];
    out.push(h('div.save-note.paper.flat', h('span.inst-ic', { html: icon('info') }), h('span', t('ui.save.where'))));
    if (ui.persisted === true) out.push(h('div.set-note.muted.small', t('ui.save.persist_on')));
    const bFile = h('button.btn.small.sea', { type: 'button' }, h('span', { html: icon('share') }), t('ui.save.export_file'));
    const bCode = h('button.btn.small.ghost', { type: 'button' }, h('span', { html: icon('book') }), t('ui.save.export_code'));
    const bImp = h('button.btn.small.ghost', { type: 'button' }, h('span', { html: icon('down') }), t('ui.save.import'));
    onTap(bFile, async () => {
      if (busy) return; busy = true;
      ui.sfx('ui_tap');
      try {
        const r = await SF.exportFile(SF.snapshot(ctx));
        if (r === 'shared') ui.toast('ui.save.shared', { icon: 'check', kind: 'good' });
        else if (r === 'downloaded') ui.toast('ui.save.downloaded', { icon: 'check', kind: 'good' });
      } catch (e) { console.warn('[ui] export', e); ui.toast('ui.save.export_failed', { icon: 'info', kind: 'warn' }); }
      busy = false;
    });
    onTap(bCode, () => { ui.sfx('ui_tap'); codeText = SF.encodeCode(SF.snapshot(ctx)); savePanel = savePanel === 'code' ? null : 'code'; spec.refresh(); });
    onTap(bImp, () => { ui.sfx('ui_tap'); importErr = ''; savePanel = savePanel === 'import' ? null : 'import'; spec.refresh(); });
    out.push(h('div.save-btns', bFile, bCode, bImp));

    if (savePanel === 'code') {
      const ta = h('textarea.save-code', { readOnly: true, rows: 4, spellcheck: false, 'aria-label': t('ui.save.code_title') });
      ta.value = codeText;
      const copy = h('button.btn.small.leaf', { type: 'button' }, h('span', { html: icon('check') }), t('ui.save.copy'));
      onTap(copy, async () => { const ok = await SF.copyText(codeText, ta); ui.toast(ok ? 'ui.save.copied' : 'ui.save.copy_failed', { icon: ok ? 'check' : 'info', kind: ok ? 'good' : 'warn' }); });
      out.push(h('div.save-panel.paper.stitched', h('b', t('ui.save.code_title')), h('p.muted.small', t('ui.save.code_hint')), ta, h('div.confirm-btns', copy)));
    } else if (savePanel === 'import') {
      const ta = h('textarea.save-code', { rows: 4, spellcheck: false, autocapitalize: 'off', autocomplete: 'off', placeholder: t('ui.save.paste_here'), 'aria-label': t('ui.save.paste_here') });
      ta.value = pasted;
      ta.addEventListener('input', () => { pasted = ta.value; });
      const pick = h('button.btn.small.sea', { type: 'button' }, h('span', { html: icon('book') }), t('ui.save.choose_file'));
      onTap(pick, () => fileIn.click());
      const paste = h('button.btn.small.ghost', { type: 'button' }, t('ui.save.paste'));
      onTap(paste, async () => {
        try { const txt = await navigator.clipboard.readText(); if (txt) { pasted = txt; ta.value = txt; } } catch { ta.focus(); }
      });
      const go = h('button.btn.small.leaf', { type: 'button' }, h('span', { html: icon('check') }), t('ui.save.check'));
      onTap(go, () => check(ta.value));
      const cancel = h('button.btn.small.ghost', { type: 'button' }, t('ui.save.cancel'));
      onTap(cancel, () => { savePanel = null; importErr = ''; pasted = ''; spec.refresh(); });
      out.push(h('div.save-panel.paper.stitched', h('b', t('ui.save.import_title')), h('div.confirm-btns', pick),
        h('p.muted.small.center', t('ui.save.or_paste')), ta, h('div.confirm-btns', paste, go, cancel),
        importErr ? h('div.save-err', h('span', { html: icon('info') }), importErr) : null));
    } else if (savePanel === 'confirm' && pending) {
      const s = pending.sum;
      const yes = h('button.btn.coral', { type: 'button' }, t('ui.save.load_yes'));
      const no = h('button.btn.ghost', { type: 'button' }, t('ui.save.cancel'));
      onTap(yes, applyImport);
      onTap(no, () => { pending = null; savePanel = null; spec.refresh(); });
      out.push(h('div.confirm.danger.paper.stitched.save-confirm',
        h('div.confirm-q', t('ui.save.confirm_q')),
        h('div.save-sum', h('b', t('ui.save.summary', { day: s.day, coins: fmt(s.coins), species: s.species })),
          s.storyTotal ? h('div.muted.small', t('ui.save.summary_story', { n: Math.min(s.story + 1, s.storyTotal), total: s.storyTotal })) : null,
          s.saved ? h('div.muted.small', t('ui.save.saved_on', { date: dateText(s.saved) })) : null),
        h('div.confirm-btns', yes, no)));
    }
    if (savePanel) requestAnimationFrame(() => body.querySelector('.save-panel, .save-confirm')?.scrollIntoView?.({ block: 'nearest' }));
    return out;
  }

  const seg = (options, value, onPick) => h('div.seg', options.map(([v, label]) => {
    const b = h('button.seg-btn' + (v === value ? '.on' : ''), { type: 'button' }, label);
    onTap(b, () => { if (v !== value) { ui.sfx('ui_tap'); onPick(v); } });
    return b;
  }));
  const slider = (key, label, ic) => {
    const vol = ctx.audio?.volumes?.[key] ?? ctx.save.state.settings?.[key] ?? 0.7;
    const out = h('span.sl-v', Math.round(vol * 100) + '%');
    const input = h('input.slider', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(vol * 100), 'aria-label': label });
    input.style.setProperty('--p', Math.round(vol * 100) + '%');
    input.addEventListener('input', () => {
      const v = input.value / 100;
      out.textContent = input.value + '%';
      input.style.setProperty('--p', input.value + '%');
      if (ctx.audio?.setVolumes) ctx.audio.setVolumes({ [key]: v });
      else { ctx.save.state.settings[key] = v; ctx.save.commit(); }
    });
    input.addEventListener('change', () => { if (key === 'sfx') ui.sfx('ui_tap'); });
    return h('div.set-row', h('span.set-ic', { html: icon(ic) }), h('span.set-k', label), input, out);
  };

  const spec = {
    title: t('ui.sheet.settings'), icon: 'settings', cls: 'settings',
    // no refreshOn 'quality:change': the FPS watchdog emits it on its own (dynamic resolution) and a re-render in the
    // middle of a tap swallowed it (Esporta / Importa did nothing on a busy phone); tick() updates the note in place
    tick() {
      const tier = ctx.quality?.tier;
      if (qNote && tier && tier !== qNote.dataset.tier) { qNote.dataset.tier = tier; qNote.textContent = t('ui.set.quality_now', { tier: t('quality.' + tier) }); }
    },
    render(body) {
      const st = ctx.save.state.settings || {};
      const parts = [];
      // [9 nov] the player's name
      parts.push(h('div.set-row', h('span.set-ic', { html: icon('hand') }), h('span.set-k', h('span', t('ui.set.name')), h('small.muted', ctx.save.state.player?.name || '')),
        (() => {
          const b = h('button.btn.small.set-name', { type: 'button' }, t('ui.set.name_change'));
          onTap(b, () => { ui.sfx('ui_tap'); ui.intro?.askName?.({ overlay: true }).then(() => spec.refresh()); });
          return b;
        })()));

      parts.push(section(t('ui.set.language'), 'language'));
      parts.push(h('div.set-row', h('span.set-ic', { html: icon('globe') }),
        seg([['it', t('ui.lang.it')], ['en', t('ui.lang.en')]], ctx.i18n.lang, v => ctx.i18n.setLang(v))));

      parts.push(section(t('ui.set.audio'), 'music'));
      parts.push(slider('music', t('ui.set.music'), 'music'), slider('sfx', t('ui.set.sfx'), 'sfx'));

      parts.push(section(t('ui.set.graphics'), 'quality'));
      const q = ctx.quality;
      parts.push(h('div.set-row', h('span.set-ic', { html: icon('quality') }),
        seg(['auto', 'low', 'mid', 'high'].map(k => [k, t('quality.' + k)]), q?.setting || st.quality || 'auto', v => { q?.set?.(v); spec.refresh(); })));
      qNote = q?.tier ? h('div.set-note.muted.small', { dataset: { tier: q.tier } }, t('ui.set.quality_now', { tier: t('quality.' + q.tier) })) : null;
      if (qNote) parts.push(qNote);

      parts.push(h('div.set-row', h('span.set-ic', { html: icon('vibrate') }), h('span.set-k', h('span', t('ui.set.haptics')), h('small.muted', t('ui.set.haptics_desc'))),
        (() => {
          const on = st.haptics !== false;
          const sw = h('button.switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': t('ui.set.haptics') }, h('i'));
          onTap(sw, () => { ctx.save.state.settings.haptics = !on; ctx.save.commit(); if (!on) ui.haptic(15); ui.sfx('ui_tap'); spec.refresh(); });
          return sw;
        })()));

      // [9 nov] camera distance (Vicina / Media / Lontana), Media = the framing of r7
      parts.push(h('div.set-row', h('span.set-ic', { html: icon('camera') }), h('span.set-k', h('span', t('ui.set.cam')), h('small.muted', t('ui.set.cam_desc'))),
        seg([['near', t('ui.set.cam_near')], ['mid', t('ui.set.cam_mid')], ['far', t('ui.set.cam_far')]], st.camDist || 'mid',
          v => { ctx.save.state.settings.camDist = v; ctx.save.commit(); ctx.bus.emit('settings:change', { key: 'camDist', value: v }); spec.refresh(); })));

      // [r2-gameplay] close-ups (systems/cinematics.js reads settings.cinematics; default on)
      parts.push(h('div.set-row', h('span.set-ic', { html: icon('camera') }), h('span.set-k', h('span', t('ui.set.cinematics')), h('small.muted', t('ui.set.cinematics_desc'))),
        (() => {
          const on = st.cinematics !== false;
          const sw = h('button.switch.set-cinematics' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': t('ui.set.cinematics') }, h('i'));
          onTap(sw, () => { ctx.save.state.settings.cinematics = !on; ctx.save.commit(); ui.sfx('ui_tap'); ctx.bus.emit('settings:change', { key: 'cinematics', value: !on }); spec.refresh(); });
          return sw;
        })()));

      // install
      if (!isStandalone()) {
        parts.push(section(t('ui.set.install'), 'phone'));
        parts.push(h('div.install.paper.flat', h('span.inst-ic', { html: icon('share') }), h('span', t('ui.set.install_text'))));
      } else parts.push(h('div.set-note.muted.small.center', t('ui.set.installed')));

      // credits
      parts.push(section(t('ui.set.credits'), 'book'));
      const cr = h('button.btn.ghost.small', { type: 'button' }, h('span', { html: icon(creditsOpen ? 'down' : 'next') }), t('ui.set.credits'));
      onTap(cr, () => { creditsOpen = !creditsOpen; spec.refresh(); });
      parts.push(cr);
      if (creditsOpen) parts.push(h('div.credits.paper.flat', h('p', t('ui.set.credits_text')), h('p.bold', t('ui.set.credits_thanks'))));

      // save backup
      parts.push(...savePart(body));

      // reset
      parts.push(section(t('ui.set.game'), 'trash'));
      if (!confirmReset) {
        const r = h('button.btn.coral.small', { type: 'button' }, h('span', { html: icon('refresh') }), t('ui.set.reset'));
        onTap(r, () => { confirmReset = true; ui.sfx('ui_open', { vol: 0.5 }); spec.refresh(); body.scrollTop = body.scrollHeight; });
        parts.push(r);
      } else {
        const yes = h('button.btn.coral', { type: 'button' }, t('ui.set.reset_yes'));
        const no = h('button.btn.ghost', { type: 'button' }, t('ui.set.reset_no'));
        onTap(yes, () => { confirmReset = false; ui.resetSave(); });
        onTap(no, () => { confirmReset = false; spec.refresh(); });
        parts.push(h('div.confirm.danger.paper.stitched', h('div.confirm-q', t('ui.set.reset_confirm')), h('div.confirm-btns', yes, no)));
      }
      parts.push(h('div.version.muted.tiny', t('ui.set.version', { v: ui.version })));
      body.replaceChildren(...parts, fileIn);
      if (confirmReset) requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    },
  };
  return spec;
}
