// Notifications: toasts (small paper pills under the HUD), big cozy banners (new species, quest done…),
// zone titles (location name fading in) and contextual onboarding tips (shown once per save).
//
// Layout slots (no two texts on top of each other, portrait or landscape):
//   top stack   = one centred column right under the HUD (its top follows --hud-bottom, which a ResizeObserver
//                 keeps in sync with the real HUD height): zone title, then toasts, then a tip while reeling or
//                 talking. Being one flex column, its pieces push each other down instead of overlapping.
//   bottom tip  = a tip above the controls (portrait) / between them (landscape) when nothing else is there.
//   banner      = centred in the free area under the HUD. Only one at a time (queued); it waits while a
//                 dialogue or a panel is open, and while it shows the top stack and the tips step aside
//                 (new toasts and the zone title wait for it, then appear).
import { h, onTap } from './dom.js';
import { icon } from './icons.js';

export function createNotify(ui) {
  const { ctx } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const el = h('div.notify');
  const top = h('div.notify-top');
  const toasts = h('div.toasts');
  const bannerHost = h('div.banner-host');
  const zoneTitle = h('div.zone-title.gone');
  const tipTop = h('div.tip-slot.tip-top');
  const tipHost = h('div.tip-host');
  top.append(zoneTitle, toasts, tipTop);
  el.append(top, bannerHost, tipHost);

  const txt = (k, v) => (typeof k === 'string' && ctx.i18n.has(k) ? t(k, v) : String(k ?? ''));
  const compact = () => ui.root.classList.contains('compact');
  const blocked = () => ui.root.classList.contains('has-dialog') || ui.root.classList.contains('has-sheet') || ui.root.classList.contains('has-intro');

  // ── toasts ──
  const OPT_KEYS = ['icon', 'kind', 'ms', 'onTap', 'quiet'];
  const pendingToasts = [];
  /** toast(textOrKey, vars?, {icon, kind:'info'|'good'|'warn', ms, onTap, quiet}) */
  function toast(textOrKey, vars, opts) {
    if (vars && opts === undefined && OPT_KEYS.some(k => vars[k] !== undefined) && !Object.keys(vars).some(k => !OPT_KEYS.includes(k))) { opts = vars; vars = undefined; }
    opts = opts || {};
    const text = txt(textOrKey, vars);
    if (!text) return null;
    // merge identical toasts
    for (const n of toasts.children) if (n.dataset.text === text && !n.classList.contains('bye')) { n.classList.remove('again'); void n.offsetWidth; n.classList.add('again'); return n; }
    if (showing) {   // a banner is up: show it right after
      if (!pendingToasts.some(p => p.text === text)) pendingToasts.push({ text, opts });
      return null;
    }
    return addToast(text, opts);
  }
  function addToast(text, opts) {
    const ic = opts.icon ? (opts.icon.startsWith('<') ? opts.icon : icon(opts.icon)) : null;
    const n = h('div.toast.paper' + (opts.kind ? '.' + opts.kind : ''), { dataset: { text } }, ic ? h('span.toast-ic', { html: ic }) : null, h('span.toast-txt', text));
    const dismiss = () => { if (n.classList.contains('bye')) return; n.classList.add('bye'); setTimeout(() => n.remove(), 400); };
    if (opts.onTap) { n.classList.add('tappable'); onTap(n, () => { opts.onTap(); dismiss(); }); }
    toasts.append(n);
    // at most 3 (2 on a phone on its side, where the screen is short)
    const max = compact() ? 2 : 3;
    const live = [...toasts.children].filter(c => !c.classList.contains('bye'));
    for (let i = 0; i < live.length - max; i++) live[i].remove();
    setTimeout(dismiss, opts.ms || Math.min(5200, 2200 + text.length * 35));
    return n;
  }

  // ── banners (queued) ──
  const queue = [];
  let showing = null, closeCurrent = null;
  /** banner(titleKey, subKeyOrText, {icon, image, kind:'species'|'quest'|'legend'|'record', ms, vars}) → Promise */
  function banner(titleKey, sub, opts = {}) {
    // tolerate vars passed directly as the 3rd argument (banner(title, sub, {n: 5}))
    if (opts && !opts.vars && !['icon', 'image', 'kind', 'ms'].some(k => k in opts) && Object.keys(opts).length) opts = { vars: opts };
    return new Promise(res => { queue.push({ titleKey, sub, opts: opts || {}, res }); pump(); });
  }
  function pump() {
    if (showing || !queue.length) return;
    if (blocked()) { setTimeout(pump, 300); return; }   // wait for the dialogue / panel to close
    next();
  }
  function next() {
    const b = queue.shift();
    if (!b) return;
    const { opts } = b;
    const kind = opts.kind || 'quest';
    const node = h('div.banner.' + kind);
    const card = h('div.banner-card.paper.stitched');
    const rays = h('div.banner-rays');
    const ribbon = h('div.banner-ribbon', h('span', txt(b.titleKey, opts.vars)));
    const pic = opts.image ? h('img.banner-img', { src: opts.image, alt: '' }) : opts.icon ? h('div.banner-ic', { html: opts.icon.startsWith('<') ? opts.icon : icon(opts.icon) }) : null;
    const subText = txt(b.sub, opts.vars);
    card.append(...[ribbon, pic, subText ? h('div.banner-sub', subText) : null].filter(Boolean), h('div.banner-tap', t('ui.banner.tap')));
    node.append(rays, card, confetti(kind));
    bannerHost.append(node);
    showing = node;
    ui.root.classList.add('has-banner');
    ui.sfx(kind === 'legend' || kind === 'record' ? 'rare_jingle' : kind === 'quest' ? 'quest_done' : 'catch_jingle', { vol: 0.8 });
    let done = false;
    const close = () => {
      if (done) return; done = true;
      node.classList.add('bye');
      setTimeout(() => {
        node.remove(); showing = null; closeCurrent = null; b.res();
        if (queue.length) { pump(); return; }
        ui.root.classList.remove('has-banner');
        // what waited for the banner
        if (pendingZone) { const z = pendingZone; pendingZone = null; showZone(z); }
        for (const p of pendingToasts.splice(0)) addToast(p.text, p.opts);
      }, 380);
    };
    closeCurrent = close;
    onTap(node, close);
    setTimeout(close, opts.ms || 3600);
  }
  function confetti(kind) {
    const wrap = h('div.confetti');
    const cols = kind === 'legend' ? ['#f5c542', '#ffe7a0', '#ffffff', '#f2a03a'] : ['#e8604a', '#f5c542', '#3fb8b0', '#6fb548', '#a57be0'];
    for (let i = 0; i < 26; i++) {
      const c = h('i');
      const a = (i / 26) * Math.PI * 2, d = 110 + Math.random() * 120;
      c.style.cssText = `--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d * 0.7 - 40).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;background:${cols[i % cols.length]};animation-delay:${(Math.random() * 0.12).toFixed(2)}s`;
      wrap.append(c);
    }
    return wrap;
  }
  /** A dialogue or a panel opened over a banner: let the banner go (it has been seen). */
  function yieldBanner() { if (closeCurrent) closeCurrent(); }

  // ── zone title (first slot of the top stack) ──
  let zoneTimer = 0, zoneGone = 0, pendingZone = null;
  function showZone(zoneId, { ms = 3400 } = {}) {
    const key = `zone.${zoneId}.name`;
    if (!ctx.i18n.has(key)) return;
    if (showing) { pendingZone = zoneId; return; }
    zoneTitle.replaceChildren(h('span.zt-line'), h('span.zt-name', t(key)), h('span.zt-line'));
    clearTimeout(zoneGone); zoneTitle.classList.remove('gone');
    zoneTitle.classList.remove('on'); void zoneTitle.offsetWidth; zoneTitle.classList.add('on');
    clearTimeout(zoneTimer);
    zoneTimer = setTimeout(() => {
      zoneTitle.classList.remove('on');
      zoneGone = setTimeout(() => zoneTitle.classList.add('gone'), 1100);   // free the slot once faded
    }, ms);
  }

  // ── onboarding tips (once per save) ──
  const tipsState = () => { const s = ctx.save.state; s.ui = s.ui || {}; s.ui.tips = s.ui.tips || {}; return s.ui.tips; };
  let tipNode = null, tipId = null, tipTimer = 0;
  /** The tip sits above the controls, or in the top stack while the bottom is busy (reeling meter, dialogue). */
  function placeTip() {
    if (!tipNode || tipNode.classList.contains('bye')) return;
    const r = ui.root.classList;
    const host = r.contains('reeling') || r.contains('has-dialog') ? tipTop : tipHost;
    if (tipNode.parentNode !== host) host.append(tipNode);
  }
  const tips = {
    /** Show tip `id` (text key) once per save, unless already done. */
    show(id, key, { ms = 9000, force = false, vars } = {}) {
      if (!force && tipsState()[id]) return false;
      if (tipId === id) return true;
      tips.hide();
      tipId = id;
      tipNode = h('div.tip.paper.stitched', h('span.tip-ic', { html: icon('info') }), h('span.tip-txt', t(key, vars)));
      const ok = h('button.btn.small.tip-ok', { type: 'button' }, t('ui.tip.got_it'));
      onTap(ok, () => tips.done(id));
      tipNode.append(ok);
      placeTip();
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => { if (tipId === id) tips.hide(); }, ms);
      return true;
    },
    /** Mark tip as done (hides it if visible). */
    done(id) {
      const st = tipsState();
      if (!st[id]) { st[id] = true; ctx.save.commit(); }
      if (tipId === id) tips.hide();
    },
    hide() {
      if (!tipNode) return;
      const n = tipNode; tipNode = null; tipId = null;
      n.classList.add('bye'); setTimeout(() => n.remove(), 350);
    },
    seen(id) { return !!tipsState()[id]; },
    get current() { return tipId; },
  };

  /** Per frame (cheap): keep the tip in the right slot, let a banner give way to dialogues. */
  function update() {
    placeTip();
    if (showing && blocked()) yieldBanner();
  }

  return { el, top, toast, banner, showZone, tips, update, get bannerShowing() { return !!showing; } };
}
