// Lenza Lenta — App & UI. init(ctx) builds the whole interface on top of the 3D canvas and returns ctx.ui:
//   toast(textOrKey, vars?, opts?)            banner(titleKey, subKeyOrText, opts?) → Promise
//   dialog(npcId, lines[], choices?, opts?) → Promise<choice|null>
//   sheet(name, data?) → Promise<result>      closeSheet(result?)   isOpen()   currentSheet
//     names: menu journal aquarium inventory quests map settings shop{shopId} cook{station} catch{…} language title
//   worldLabel(id, target, textOrKey, opts) / removeWorldLabel(id)
//   meter('reel', {tension, progress, hint?, danger?, pulling?} | null)  meter('cast', {power} | null)
//   actionButton {el, set({labelKey|label, icon, hold}|null), charge(p|null)}   hud {el, refresh(), visible}
//   onboarding {show(id, key), done(id), hide(), seen(id)}   haptic(pattern)   refresh()
// Everything player-visible goes through ctx.i18n (strings in ./strings.js). Robust to any missing ctx API.
import { h } from './dom.js';
import { it, en } from './strings.js';
import { createAdapter } from './adapter.js';
import { createHud } from './hud.js';
import { createControls } from './controls.js';
import { createMeters } from './meter.js';
import { createLabels } from './labels.js';
import { createNotify } from './notify.js';
import { createDialog } from './dialog.js';
import { createSheets } from './sheets/index.js';
import { createIntro } from './intro.js';
import { fishImage, clearArtCache } from './art.js';
import { resetMapCache } from './sheets/map.js';
import { buffDuration } from './sheets/common.js';
import { installGestureGuards, registerServiceWorker, createHaptics, trackViewport } from './pwa.js';
import { requestPersist } from './savefile.js';

const CSS = ['css/base.css', 'css/hud.css', 'css/sheets.css'];

function ensureCss() {
  for (const href of CSS) {
    if ([...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href.includes(href))) continue;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = new URL('../../' + href, import.meta.url).href;
    document.head.append(l);
  }
}

/**
 * Debug builds: warn once per key when a translated string still contains a {placeholder} (a t() call that
 * forgot a variable). Wraps ctx.i18n.t in place, so every module's calls are checked.
 */
function guardPlaceholders(ctx) {
  const i18n = ctx.i18n;
  if (!i18n?.t || i18n.t.guarded) return;
  const raw = i18n.t.bind(i18n), warned = new Set();
  const t = (key, vars) => {
    const s = raw(key, vars);
    if (typeof s === 'string' && s.includes('{')) {
      const left = s.match(/\{\w+(\|[^}]*)?\}/g);
      if (left && !warned.has(key)) { warned.add(key); console.warn(`[i18n] "${key}" (${i18n.lang}) is missing ${left.join(', ')} — vars passed: ${vars ? Object.keys(vars).join(', ') || 'none' : 'none'}`); }
    }
    return s;
  };
  t.guarded = true;
  i18n.t = t;
}

export async function init(ctx) {
  ensureCss();
  ctx.i18n.addStrings(it, en);
  if (ctx.isDebug) guardPlaceholders(ctx);
  installGestureGuards();

  const root = h('div#ui');
  document.body.append(root);
  trackViewport(root);

  const busy = new Set();
  let timePausedByUI = false;
  const ui = {
    ctx, root, version: ctx.VERSION || '2', zone: ctx.save?.state?.player?.zone || null,
    get busy() { return busy.size > 0; },
    sfx: (name, o) => { try { ctx.audio?.sfx?.(name, o); } catch { /* audio optional */ } },
  };
  ui.A = createAdapter(ctx);
  // ask the browser to keep our save (best effort: on iPhone deleting the Home-screen app still deletes it)
  ui.persisted = null;
  requestPersist().then(v => { ui.persisted = v; });
  ui.haptic = createHaptics(ctx);
  ctx.haptic = ui.haptic; // also works on iOS (no navigator.vibrate there)

  ui.setBusy = (kind, v) => {
    if (v) busy.add(kind); else busy.delete(kind);
    const b = busy.size > 0;
    root.classList.toggle('busy', b);
    root.classList.toggle('has-sheet', busy.has('sheet'));
    root.classList.toggle('has-dialog', busy.has('dialog'));
    root.classList.toggle('has-intro', busy.has('intro'));
    if (ctx.input) {
      if (b && ctx.input.enabled) { ui.controls?.releaseAll(); ctx.input.clear?.(); }
      ctx.input.enabled = !b;
    }
    // the clock rests while a panel is open (cozy: nothing happens behind your back)
    const wantPause = busy.has('sheet') || busy.has('intro');
    if (ctx.time) {
      if (wantPause && !ctx.time.paused) { ctx.time.paused = true; timePausedByUI = true; }
      else if (!wantPause && timePausedByUI) { ctx.time.paused = false; timePausedByUI = false; }
    }
  };

  // ── build layers (bottom → top) ──
  ui.labels = createLabels(ui);
  ui.hud = createHud(ui);
  ui.controls = createControls(ui);
  ui.meters = createMeters(ui);
  ui.notify = createNotify(ui);
  ui.tips = ui.notify.tips;
  ui.dialogs = createDialog(ui);
  ui.sheets = createSheets(ui);
  ui.intro = createIntro(ui);
  root.append(
    h('div.layer.l-world', ui.labels.el),
    h('div.layer.l-hud', ui.hud.el),
    h('div.layer.l-controls', ui.controls.el),
    h('div.layer.l-meters', ui.meters.el),
    h('div.layer.l-notify', ui.notify.el),
    h('div.layer.l-dialog', ui.dialogs.el),
    h('div.layer.l-sheets', ui.sheets.el),
    h('div.layer.l-intro', ui.intro.el));

  // ── layout classes ──
  function layout() {
    const w = root.clientWidth || innerWidth, hh = root.clientHeight || innerHeight;
    const portrait = hh > w;
    root.classList.toggle('portrait', portrait);
    root.classList.toggle('landscape', !portrait);
    root.classList.toggle('compact', !portrait && hh < 520);
    root.classList.toggle('narrow', w < 440);
    root.classList.toggle('short', portrait && hh < 700);
    root.classList.toggle('wide', w >= 900 && hh >= 600);
    root.classList.toggle('touch', !!ctx.input?.isTouch);
    requestAnimationFrame(syncHudBottom);
  }
  // --hud-bottom = where the free space under the HUD starts (toasts, zone title, banners and the joystick zone
  // hang from it). The HUD grows and shrinks (2-line goals, buffs, language): follow its real size.
  let hudBottom = -1;
  function syncHudBottom() {
    const r = ui.hud.el.getBoundingClientRect();
    const b = Math.round(r.bottom);
    if (b !== hudBottom && r.height > 0) { hudBottom = b; root.style.setProperty('--hud-bottom', b + 'px'); }
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncHudBottom).observe(ui.hud.el);
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 150));

  // ── public API (ctx.ui) ──
  let actionOverride = null;
  let pendingCatch = null, lastCatchSig = '', catchPromise = null;
  const api = {
    root,
    toast: (k, v, o) => ui.notify.toast(k, v, o),
    banner: (k, s, o) => ui.notify.banner(k, s, o),
    dialog: (npc, lines, choices, o) => ui.dialogs.dialog(npc, lines, choices, o),
    sheet(name, data) {
      if (name === 'catch') return openCatch(data || {});
      return ui.sheets.open(name, data);
    },
    closeSheet: r => ui.sheets.close(r),
    isOpen: () => ui.sheets.isOpen() || ui.dialogs.open || ui.intro.open,
    get currentSheet() { return ui.sheets.current; },
    worldLabel: (...a) => ui.labels.worldLabel(...a),
    removeWorldLabel: id => ui.labels.removeWorldLabel(id),
    meter: (name, d) => ui.meters.meter(name, d),
    actionButton: {
      get el() { return ui.controls.act; },
      set(o) { actionOverride = o || null; ui.controls.refresh(true); },
      charge: p => ui.controls.setCharge(p),
    },
    hud: {
      get el() { return ui.hud.el; },
      refresh: () => ui.hud.refresh(true),
      get visible() { return !root.classList.contains('hud-hidden'); },
      set visible(v) { root.classList.toggle('hud-hidden', !v); },
    },
    onboarding: ui.tips,
    /** Result of navigator.storage.persist() at startup: true | false | null (not supported / not answered yet). */
    get persisted() { return ui.persisted; },
    haptic: ui.haptic,
    refresh() { ui.hud.refresh(true); ui.controls.refresh(true); ui.sheets.refresh(); },
    adapter: ui.A,
    fishImage: (id, size) => fishImage(ctx, id, size),
    intro: ui.intro,
  };
  ui.api = api;
  ui.toast = api.toast; ui.banner = api.banner; ui.dialog = api.dialog; ui.sheet = api.sheet; ui.closeSheet = api.closeSheet;
  // let interact prompts be overridden by Systems via ctx.ui.actionButton.set()
  const baseInteraction = ui.A.interaction;
  ui.A.interaction = () => actionOverride || baseInteraction();

  // ── catch card (deduped: UI opens it on fishing:catch unless Systems already did) ──
  function openCatch(data) {
    const sig = `${data.speciesId || data.id}|${data.size}`;
    clearTimeout(pendingCatch); pendingCatch = null;
    if (sig === lastCatchSig && catchPromise && ui.sheets.current === 'catch') return catchPromise;
    lastCatchSig = sig;
    catchPromise = ui.sheets.open('catch', data).then(choice => {
      const f = ui.A.item(data.speciesId || data.id);
      if (f?.kind === 'fish' && data.isNew) {
        const leg = f.rarity === 'legendary';
        ui.notify.banner(leg ? 'ui.banner.legend' : 'ui.banner.new_species', ui.A.name(f.id), { kind: leg ? 'legend' : 'species', image: fishImage(ctx, f.id, 256) });
      } else if (data.isRecord && f?.kind === 'fish') {
        ui.notify.banner('ui.banner.record', ui.A.name(f.id) + ' · ' + ctx.i18n.t('ui.journal.cm', { n: Math.round(data.size) }), { kind: 'record', image: fishImage(ctx, f.id, 256), ms: 2600 });
      }
      return choice;
    });
    return catchPromise;
  }

  ui.resetSave = () => {
    ui.sheets.close(undefined, { silent: true });
    ctx.save.reset();
    clearArtCache();
    ui.intro.show('language');
  };

  // ── bus wiring ──
  const on = (e, f) => ctx.bus.on(e, p => { try { f(p || {}); } catch (err) { console.error('[ui] handler', e, err); } });
  on('resize', layout);
  on('lang:change', () => {
    ui.hud.applyLang(); ui.meters.applyLang(); ui.labels.applyLang(); ui.controls.refresh(true); ui.sheets.applyLang(); ui.dialogs?.applyLang?.();
    document.title = ctx.i18n.t('ui.title.name');
    requestAnimationFrame(layout);
  });
  on('quality:change', () => { /* nothing: core handles rendering */ });
  on('coins:change', p => { ui.hud.coinsChanged(p.delta ?? 0); });
  let lastBasketN = ui.A.basket().length;
  on('inventory:change', () => {
    const n = ui.A.basket().length;
    if (n > lastBasketN) ui.hud.basketBump();
    lastBasketN = n;
    ui.hud.refresh(); ui.controls.refresh(true);
    if (n >= ui.A.capacity() - 1 && n > 0) ui.tips.show('basket', 'ui.tip.basket');
  });
  on('equip:change', () => ui.controls.refresh(true));
  // [r2-gameplay] the bucket's tip once it is bought (the mat's own tips come from systems/mat.js)
  on('shop:buy', e => { if (e?.itemId === 'bucket') setTimeout(() => ui.tips.show('bucket', 'ui.tip.bucket', { ms: 9000 }), 900); });
  on('weather:change', () => ui.hud.refresh());
  on('time:phase', () => ui.hud.refresh());
  on('time:day', p => { ui.hud.refresh(); if (p.day > 1) ui.notify.toast('ui.toast.day', { n: p.day }, { icon: 'sun' }); });
  // a zone name shown less than 40 s ago is not shown again (back and forth across a border)
  const zoneShown = {};
  on('zone:enter', p => {
    if (!p.zone || p.zone === ui.zone) return;
    ui.zone = p.zone;
    const now = performance.now();
    if (ui.intro.open || now - (zoneShown[p.zone] ?? -1e9) < 40000) return;
    zoneShown[p.zone] = now;
    ui.notify.showZone(p.zone);
  });

  // fishing
  const BITE = 'bite';
  const bobberPos = p => p.pos || p.point || p.bobber || ctx.systems?.fishing?.bobber || ctx.systems?.fishing?.bobberPos || null;
  // while charging a cast the bait and side buttons step aside (the long "Lascia per lanciare" tag covered the bait count)
  on('fishing:state', p => root.classList.toggle('charging', p.state === 'charge'));
  on('fishing:cast', () => { ui.tips.done('cast'); ui.tips.show('wait', 'ui.tip.wait', { ms: 7000 }); });
  on('fishing:bite', p => {
    const pos = bobberPos(p);
    if (pos) ui.labels.worldLabel(BITE, pos, '!', { kind: 'bite', offsetY: 0.9 });
    ui.haptic([18, 40, 18]);
    ui.tips.done('wait');
    if (!ui.tips.seen('bite')) { ui.notify.toast('ui.fish.bite', null, { icon: 'strike', kind: 'good', ms: 2200 }); ui.tips.done('bite'); }
  });
  on('fishing:strike', () => { ui.labels.removeWorldLabel(BITE); ui.tips.show('reel', 'ui.tip.reel', { ms: 8000 }); });
  on('fishing:escape', p => {
    ui.labels.removeWorldLabel(BITE); ui.meters.meter('reel', null); ui.controls.setCharge(null);
    ui.notify.toast(p.reason === 'snap' || p.reason === 'line' ? 'ui.fish.snap' : 'ui.fish.escape', null, { icon: 'release' });
  });
  on('fishing:cancel', () => { ui.labels.removeWorldLabel(BITE); ui.meters.meter('reel', null); ui.controls.setCharge(null); });
  on('fishing:catch', p => {
    ui.labels.removeWorldLabel(BITE); ui.meters.meter('reel', null); ui.controls.setCharge(null); ui.tips.done('reel');
    if (p.card === false || !(p.speciesId || p.id)) return;
    clearTimeout(pendingCatch);
    pendingCatch = setTimeout(() => openCatch(p), p.cardDelay ?? 900);
  });

  // progress & rewards
  on('quest:progress', () => ui.hud.refresh());
  on('quest:complete', p => {
    ui.hud.refresh();
    const q = ctx.data?.questById?.[p.id];
    const title = p.title || (q?.titleKey ? ctx.i18n.t(q.titleKey) : '');
    ui.notify.banner('ui.banner.quest_done', title, { kind: 'quest', icon: 'flag' });
  });
  on('shop:sell', p => { if (p.total) ui.notify.toast('ui.toast.sold', { n: p.count ?? 1, total: p.total }, { icon: 'coin', kind: 'good' }); });
  on('aquarium:donate', p => ui.notify.toast('ui.toast.donated', { item: ui.A.name(p.speciesId) }, { icon: 'aquarium', kind: 'good' }));
  on('cook:done', p => { const r = ui.A.item(p.recipeId); ui.notify.toast(r?.effect?.cat ? 'ui.toast.cooked_cat' : 'ui.toast.cooked', { item: ui.A.name(r?.dish || p.recipeId) }, { icon: 'cook', kind: 'good' }); });
  on('buff:start', p => { if (p.stat) ui.notify.toast('ui.toast.buff', { buff: ctx.i18n.t(`buff.${p.stat}.name`), lasts: buffDuration(ui, p.hours).replace(/^./, c => c.toLowerCase()) }, { icon: 'sparkle', kind: 'good', ms: 5200 }); ui.hud.refresh(); });
  on('buff:end', p => { if (p.stat) ui.notify.toast('ui.toast.buff_end', { buff: ctx.i18n.t(`buff.${p.stat}.name`) }, { icon: 'sparkle' }); ui.hud.refresh(); });
  on('forage:pick', p => { if (p.itemId) ui.notify.toast('ui.toast.picked', { item: ui.A.name(p.itemId) }, { icon: ui.A.item(p.itemId) ? undefined : 'pick' }); });
  on('home:upgrade', p => ui.notify.banner('ui.banner.upgrade', p.tier !== undefined ? ui.A.name((ctx.data?.home || [])[p.tier]?.id) : '', { kind: 'quest', icon: 'home' }));
  on('gl:lost', () => ui.notify.toast('core.context_lost', null, { icon: 'info', ms: 4000 }));
  on('save:loaded', p => { ui.hud.refresh(true); ui.controls.refresh(true); lastBasketN = ui.A.basket().length; if (p.reset) ui.zone = null; });

  // keyboard / gamepad shortcuts
  const TOGGLE = { journal: 'journal', map: 'map', inventory: 'inventory', quests: 'quests' };
  on('input:press', ({ name }) => {
    if (ui.intro.open || ui.dialogs.open) return;
    if (name === 'menu') {
      if (ui.sheets.isOpen()) {
        const sp = ui.sheets.spec;
        if (sp?.modal) return;
        const cur = ui.sheets.current;
        if (cur !== 'menu' && ['journal', 'aquarium', 'inventory', 'quests', 'map', 'settings'].includes(cur) && sp?.data?.parent === 'menu') ui.sheets.open('menu');
        else ui.sheets.close();
      } else ui.sheets.open('menu');
      return;
    }
    if (TOGGLE[name]) {
      if (ui.sheets.current === TOGGLE[name]) ui.sheets.close();
      else if (!ui.sheets.spec?.modal) ui.sheets.open(TOGGLE[name]);
      return;
    }
    if (name === 'bait' && !ui.busy) ui.controls.cycleBait();
  });
  // close the bait popover when tapping elsewhere
  root.addEventListener('pointerdown', e => { if (!e.target.closest('.act-wrap')) ui.controls.togglePop(false); }, true);
  ctx.renderer?.domElement?.addEventListener('pointerdown', () => ui.controls.togglePop(false));

  // ── per-frame ──
  let acc = 1;
  ctx.loop.add(function uiUpdate(dt) {
    ui.dialogs.update(dt);
    ui.notify.update();
    ui.labels.update();
    ui.hud.tick(dt);
    ui.sheets.spec?.tick?.(dt);
    acc += dt;
    if (acc >= 0.25) { acc = 0; ui.hud.refresh(); ui.controls.refresh(); syncHudBottom(); ui.labels.reserve(); }
  }, ctx.ORDER?.ui ?? 50);

  // ── PWA ──
  registerServiceWorker({ params: ctx.params, onUpdate: () => ui.notify.toast('ui.toast.update', null, { icon: 'refresh', ms: 20000, onTap: () => location.reload() }) });

  // ── start-up flow ──
  ui.hud.applyLang();
  ui.controls.refresh(true);
  document.title = ctx.i18n.t('ui.title.name');
  const skipIntro = ctx.isDebug && !ctx.params?.has('title') && !ctx.params?.has('intro');
  const showTips = !ctx.isDebug || ctx.params?.has('tips');
  function startTips() {
    if (!showTips) return;
    const touch = ctx.input?.isTouch;
    setTimeout(() => ui.tips.show('move', touch ? 'ui.tip.move_touch' : 'ui.tip.move_keys', { ms: 12000 }), 1400);
    setTimeout(() => { if (!ui.tips.current) ui.tips.show('action', touch ? 'ui.tip.action_touch' : 'ui.tip.action_keys', { ms: 9000 }); }, 16000);
    if (!touch) setTimeout(() => { if (!ui.tips.current) ui.tips.show('keys', 'ui.tip.keys', { ms: 9000 }); }, 34000);
  }
  ctx.bus.on('game:ready', () => {
    ui.labels.autoLabels();
    resetMapCache();
    ui.hud.refresh(true);
    layout();
  });
  if (!skipIntro) ui.intro.show(ctx.i18n.chosen ? 'title' : 'language');
  ctx.bus.on('ui:start', startTips);
  if (skipIntro) setTimeout(startTips, 500);

  // late modules (e.g. fishModels arriving after UI in a sandbox) — refresh art once
  ctx.bus.on('fishModels:ready', () => clearArtCache());

  ctx.ui = api;
  return api;
}

export default { init };
