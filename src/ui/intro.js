// First launch: language picker, then a short title screen ("Lenza Lenta" + subtitle + Start, which also
// unlocks audio). Shown on every launch over the live scene; skipped with ?debug unless ?title is present.
import { h, onTap, fmt } from './dom.js';
import { icon } from './icons.js';

const HAT = `<svg class="logo-hat" viewBox="0 0 220 120" aria-hidden="true">
  <defs><linearGradient id="hat-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8dc8c"/><stop offset="1" stop-color="#e0b55a"/></linearGradient></defs>
  <path d="M150 62 C 175 40, 200 60, 206 92" fill="none" stroke="#fff6e4" stroke-width="2" stroke-dasharray="4 4" opacity=".9"/>
  <ellipse cx="110" cy="84" rx="100" ry="24" fill="url(#hat-g)" stroke="#4b3221" stroke-width="4"/>
  <path d="M52 80 C 52 30, 78 14, 110 14 S 168 30, 168 80 C 140 92, 80 92, 52 80 Z" fill="url(#hat-g)" stroke="#4b3221" stroke-width="4" stroke-linejoin="round"/>
  <path d="M55 64 C 85 76, 135 76, 165 64 L 166 76 C 135 88, 85 88, 54 76 Z" fill="#c8402a" stroke="#4b3221" stroke-width="3" stroke-linejoin="round"/>
  <path d="M70 40 C 90 30, 110 28, 128 30 M64 54 C 90 44, 130 42, 156 50 M22 86 C 60 98, 160 98, 198 86" fill="none" stroke="#c99a48" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
  <path d="M150 66 l18 -26 l6 14 l12 -10 l-2 22 z" fill="#2fb3ad" stroke="#4b3221" stroke-width="3" stroke-linejoin="round"/>
  <g transform="translate(204 96)"><path d="M-8 0 a8 8 0 0 1 16 0 z" fill="#e8604a" stroke="#4b3221" stroke-width="2.6"/><path d="M-8 0 a8 8 0 0 0 16 0 z" fill="#fff6e4" stroke="#4b3221" stroke-width="2.6"/></g>
</svg>`;

export function createIntro(ui) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const el = h('div.intro-host');
  let node = null, resolveDone = null;

  function show(which) {
    if (which === 'language' || !ctx.i18n.chosen) return showLanguage();
    return showTitle();
  }

  function mount(n) {
    if (node) { const old = node; old.classList.add('bye'); setTimeout(() => old.remove(), 450); }
    node = n; el.append(n);
    requestAnimationFrame(() => n.classList.add('in'));
    ui.setBusy('intro', true);
  }

  function showLanguage() {
    return new Promise(res => {
      const pick = lang => {
        ctx.audio?.unlock?.();
        ctx.i18n.setLang(lang);
        ui.sfx('ui_open');
        showTitle().then(res);
      };
      const btn = (lang, name, hello) => {
        const b = h('button.lang-btn.paper', { type: 'button' }, h('span.lang-hello', hello), h('span.lang-name', name));
        onTap(b, () => pick(lang));
        return b;
      };
      const card = h('div.lang-card.paper.stitched',
        h('div.lang-ic', { html: icon('language') }),
        h('h2.lang-title', ctx.i18n._tables?.it?.['ui.lang.title'] || 'Scegli la lingua', h('br'), h('small', ctx.i18n._tables?.en?.['ui.lang.title'] || 'Choose your language')),
        h('div.lang-btns', btn('it', 'Italiano', 'Ciao!'), btn('en', 'English', 'Hello!')),
        h('div.lang-sub.muted.small', t('ui.lang.sub')));
      mount(h('div.intro.lang', h('div.intro-sky'), card));
    });
  }

  function showTitle() {
    return new Promise(res => {
      resolveDone = res;
      const cont = !ctx.save.firstLaunch && (ctx.save.state.meta?.playSeconds > 5 || (ctx.time?.day || 1) > 1 || A.coins() > 0 || Object.keys(A.journal()).length);
      const start = h('button.btn.gold.big.title-start', { type: 'button' }, h('span', { html: icon('cast') }), cont ? t('ui.title.continue') : t('ui.title.start'));
      onTap(start, go);
      const lang = h('button.btn.ghost.small.title-lang', { type: 'button' }, h('span', { html: icon('globe') }), ctx.i18n.lang === 'it' ? 'English' : 'Italiano');
      onTap(lang, () => { ctx.i18n.setLang(ctx.i18n.lang === 'it' ? 'en' : 'it'); ui.sfx('ui_tap'); showTitle().then(resolveDone); });
      const n = h('div.intro.title',
        h('div.intro-sky'),
        h('div.title-box',
          h('div.logo', { html: HAT }, h('h1.logo-text', h('span.l1', 'Lenza'), h('span.l2', 'Lenta')), h('div.logo-2', '2')),
          h('div.title-sub.plank', t('ui.title.sub')),
          start,
          cont ? h('div.title-save.muted', t('ui.title.day', { n: ctx.time?.day || 1, coins: fmt(A.coins()) })) : null,
          h('div.title-hint.small', h('span', { html: icon('music') }), t('ui.title.hint'))),
        h('div.title-foot', lang));
      mount(n);
    });
  }

  function go() {
    ctx.audio?.unlock?.();
    ui.sfx('ui_open');
    ui.haptic(10);
    // [9 nov] no name yet (new game, or a save from before names): ask once, then play
    if (!playerName()) { askName().then(finish); return; }
    finish();
  }
  function finish() {
    hide();
    ctx.bus.emit('ui:start', {});
    const r = resolveDone; resolveDone = null; r?.();
  }

  const playerName = () => String(ctx.save.state.player?.name || '').trim();
  /** Sanitised name: letters, digits, space, apostrophe, dash and dot, at most 20 characters. */
  const clean = s => String(s || '').replace(/[^\p{L}\p{N} '’.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);

  /**
   * [9 nov] "What's your name?" card (first start, and Settings › Name). Resolves with the saved name.
   * opts.overlay: shown over the game (Settings) instead of replacing the title screen.
   */
  function askName(opts = {}) {
    return new Promise(res => {
      const input = h('input.name-input', { type: 'text', maxlength: '20', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false',
        enterkeyhint: 'done', placeholder: t('ui.name.placeholder'), 'aria-label': t('ui.name.title') });
      input.value = playerName();
      const ok = h('button.btn.gold.big.name-ok', { type: 'button' }, h('span', { html: icon('check') }), t('ui.name.ok'));
      const sync = () => { ok.disabled = !clean(input.value); };
      input.addEventListener('input', sync); sync();
      const done = () => {
        const v = clean(input.value);
        if (!v) { input.focus(); return; }
        input.blur();
        ctx.save.state.player ||= {};
        ctx.save.state.player.name = v;
        ctx.save.commit();
        ctx.bus.emit('player:name', { name: v });
        ui.sfx('ui_tap'); ui.haptic(10);
        if (opts.overlay) { card.remove(); ui.setBusy('name', false); }
        res(v);
      };
      onTap(ok, done);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
      const card = h('div.intro.name' + (opts.overlay ? '.over' : ''), h('div.intro-sky'),
        h('div.lang-card.name-card.paper.stitched',
          h('div.lang-ic', { html: icon('hand') }),
          h('h2.lang-title', t('ui.name.title')),
          h('div.lang-sub.muted', t('ui.name.sub')),
          input, ok));
      if (opts.overlay) { el.append(card); ui.setBusy('name', true); requestAnimationFrame(() => card.classList.add('in')); }
      else mount(card);
      setTimeout(() => { try { input.focus(); } catch { /* ignore */ } }, 350);
    });
  }

  function hide() {
    if (!node) return;
    const n = node; node = null;
    n.classList.remove('in'); n.classList.add('bye');
    setTimeout(() => n.remove(), 700);
    ui.setBusy('intro', false);
  }

  return { el, show, hide, askName, get open() { return !!node; } };
}
