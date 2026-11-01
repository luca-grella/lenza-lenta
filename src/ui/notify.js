// Notifications: toasts (small paper pills under the HUD), big cozy banners (new species, quest done…),
// zone titles (location name fading in) and contextual onboarding tips (shown once per save).
import { h, onTap } from './dom.js';
import { icon } from './icons.js';

export function createNotify(ui) {
  const { ctx } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const el = h('div.notify');
  const toasts = h('div.toasts');
  const bannerHost = h('div.banner-host');
  const zoneTitle = h('div.zone-title');
  const tipHost = h('div.tip-host');
  el.append(toasts, zoneTitle, bannerHost, tipHost);

  const txt = (k, v) => (typeof k === 'string' && ctx.i18n.has(k) ? t(k, v) : String(k ?? ''));

  // ── toasts ──
  /** toast(textOrKey, vars?, {icon, kind:'info'|'good'|'warn', ms, onTap, quiet}) */
  function toast(textOrKey, vars, opts) {
    if (vars && (vars.icon !== undefined || vars.kind || vars.ms || vars.onTap || vars.quiet) && opts === undefined) { opts = vars; vars = undefined; }
    opts = opts || {};
    const text = txt(textOrKey, vars);
    if (!text) return null;
    // merge identical toasts
    for (const n of toasts.children) if (n.dataset.text === text && !n.classList.contains('bye')) { n.classList.remove('again'); void n.offsetWidth; n.classList.add('again'); return n; }
    const ic = opts.icon ? (opts.icon.startsWith('<') ? opts.icon : icon(opts.icon)) : null;
    const n = h('div.toast.paper' + (opts.kind ? '.' + opts.kind : ''), { dataset: { text } }, ic ? h('span.toast-ic', { html: ic }) : null, h('span.toast-txt', text));
    if (opts.onTap) { n.classList.add('tappable'); onTap(n, () => { opts.onTap(); dismiss(); }); }
    toasts.append(n);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    const dismiss = () => { if (n.classList.contains('bye')) return; n.classList.add('bye'); setTimeout(() => n.remove(), 400); };
    setTimeout(dismiss, opts.ms || Math.min(5200, 2200 + text.length * 35));
    return n;
  }

  // ── banners (queued) ──
  const queue = [];
  let showing = null;
  /** banner(titleKey, subKeyOrText, {icon, image, kind:'species'|'quest'|'legend'|'record', ms, vars}) → Promise */
  function banner(titleKey, sub, opts = {}) {
    return new Promise(res => { queue.push({ titleKey, sub, opts, res }); if (!showing) next(); });
  }
  function next() {
    const b = queue.shift();
    if (!b) { showing = null; return; }
    const { opts } = b;
    const kind = opts.kind || 'quest';
    const node = h('div.banner.' + kind);
    const card = h('div.banner-card.paper.stitched');
    const rays = h('div.banner-rays');
    const ribbon = h('div.banner-ribbon', h('span', txt(b.titleKey, opts.vars)));
    const pic = opts.image ? h('img.banner-img', { src: opts.image, alt: '' }) : opts.icon ? h('div.banner-ic', { html: opts.icon.startsWith('<') ? opts.icon : icon(opts.icon) }) : null;
    const subText = txt(b.sub, opts.vars);
    card.append(ribbon, pic, subText ? h('div.banner-sub', subText) : null, h('div.banner-tap', t('ui.banner.tap')));
    node.append(rays, card, confetti(kind));
    bannerHost.append(node);
    showing = node;
    ui.sfx(kind === 'legend' || kind === 'record' ? 'rare_jingle' : kind === 'quest' ? 'quest_done' : 'catch_jingle', { vol: 0.8 });
    let done = false;
    const close = () => {
      if (done) return; done = true;
      node.classList.add('bye');
      setTimeout(() => { node.remove(); b.res(); next(); }, 380);
    };
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

  // ── zone title ──
  let zoneTimer = 0;
  function showZone(zoneId) {
    const key = `zone.${zoneId}.name`;
    if (!ctx.i18n.has(key)) return;
    zoneTitle.replaceChildren(h('span.zt-line'), h('span.zt-name', t(key)), h('span.zt-line'));
    zoneTitle.classList.remove('on'); void zoneTitle.offsetWidth; zoneTitle.classList.add('on');
    clearTimeout(zoneTimer);
    zoneTimer = setTimeout(() => zoneTitle.classList.remove('on'), 3400);
  }

  // ── onboarding tips (once per save) ──
  const tipsState = () => { const s = ctx.save.state; s.ui = s.ui || {}; s.ui.tips = s.ui.tips || {}; return s.ui.tips; };
  let tipNode = null, tipId = null, tipTimer = 0;
  const tips = {
    /** Show tip `id` (text key) once per save, unless already done. */
    show(id, key, { ms = 9000, force = false } = {}) {
      if (!force && tipsState()[id]) return false;
      if (tipId === id) return true;
      tips.hide();
      tipId = id;
      tipNode = h('div.tip.paper.stitched', h('span.tip-ic', { html: icon('info') }), h('span.tip-txt', t(key)));
      const ok = h('button.btn.small.tip-ok', { type: 'button' }, t('ui.tip.got_it'));
      onTap(ok, () => tips.done(id));
      tipNode.append(ok);
      tipHost.append(tipNode);
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

  return { el, toast, banner, showZone, tips };
}
