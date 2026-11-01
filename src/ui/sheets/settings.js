// Settings: language (live), music & effects volume, graphics quality, haptics, install help, credits, reset.
import { h, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { section } from './common.js';
import { isStandalone, isIOS } from '../pwa.js';

export default function settings(ui) {
  const { ctx } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  let confirmReset = false, creditsOpen = false;

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
    refreshOn: ['quality:change'],
    render(body) {
      const st = ctx.save.state.settings || {};
      const parts = [];
      parts.push(section(t('ui.set.language'), 'language'));
      parts.push(h('div.set-row', h('span.set-ic', { html: icon('globe') }),
        seg([['it', t('ui.lang.it')], ['en', t('ui.lang.en')]], ctx.i18n.lang, v => ctx.i18n.setLang(v))));

      parts.push(section(t('ui.set.audio'), 'music'));
      parts.push(slider('music', t('ui.set.music'), 'music'), slider('sfx', t('ui.set.sfx'), 'sfx'));

      parts.push(section(t('ui.set.graphics'), 'quality'));
      const q = ctx.quality;
      parts.push(h('div.set-row', h('span.set-ic', { html: icon('quality') }),
        seg(['auto', 'low', 'mid', 'high'].map(k => [k, t('quality.' + k)]), q?.setting || st.quality || 'auto', v => { q?.set?.(v); spec.refresh(); })));
      if (q?.tier) parts.push(h('div.set-note.muted.small', t('ui.set.quality_now', { tier: t('quality.' + q.tier) })));

      parts.push(h('div.set-row', h('span.set-ic', { html: icon('vibrate') }), h('span.set-k', h('span', t('ui.set.haptics')), h('small.muted', t('ui.set.haptics_desc'))),
        (() => {
          const on = st.haptics !== false;
          const sw = h('button.switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': t('ui.set.haptics') }, h('i'));
          onTap(sw, () => { ctx.save.state.settings.haptics = !on; ctx.save.commit(); if (!on) ui.haptic(15); ui.sfx('ui_tap'); spec.refresh(); });
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
      body.replaceChildren(...parts);
      if (confirmReset) requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    },
  };
  return spec;
}
