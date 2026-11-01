// Sheet manager: modal panels (journal, map, shops…) with a paper frame, plank title, tabs and a body that
// scrolls inside the sheet (never outside the screen). One sheet at a time; sheets opened from the menu get a
// back button. Each sheet module exports `default (ui, data) → spec`:
//   { title, icon, tabs?: [{id, label, icon?, badge?}], tab?, render(body, spec), cls?, frame?: false,
//     onClose?(result), refreshOn?: [bus events], wide?: bool, headExtra?: Node }
import { h, onTap } from '../dom.js';
import { icon } from '../icons.js';
import menu from './menu.js';
import journal from './journal.js';
import aquarium from './aquarium.js';
import inventory from './inventory.js';
import quests from './quests.js';
import map from './map.js';
import shop from './shop.js';
import cook from './cook.js';
import catchCard from './catch.js';
import settings from './settings.js';

const REGISTRY = { menu, journal, aquarium, inventory, quests, map, shop, cook, catch: catchCard, settings };
const FROM_MENU = new Set(['journal', 'aquarium', 'inventory', 'quests', 'map', 'settings']);

export function createSheets(ui) {
  const { ctx } = ui;
  const el = h('div.sheet-host');
  let cur = null; // {name, spec, node, body, resolve, parent}
  const offs = [];

  function open(name, data = {}) {
    if (name === 'language' || name === 'title') return ui.intro?.show(name);
    const make = REGISTRY[name];
    if (!make) { console.warn('[ui] unknown sheet', name); return Promise.resolve(null); }
    const parent = cur && cur.name === 'menu' && FROM_MENU.has(name) ? 'menu' : (data.parent || null);
    if (cur) close(undefined, { silent: true, keepBusy: true });
    let spec;
    try { spec = make(ui, data || {}); } catch (e) { console.error('[ui] sheet failed to build', name, e); ui.setBusy('sheet', false); return Promise.resolve(null); }
    if (!spec) return Promise.resolve(null);
    spec.name = name; spec.data = data;

    return new Promise(resolve => {
      const wrap = h('div.sheet-wrap.sheet-' + name);
      for (const c of String(spec.cls || '').split(/\s+/).filter(Boolean)) wrap.classList.add(c);
      const scrim = h('div.scrim');
      onTap(scrim, () => { if (!spec.modal) close(); });
      wrap.append(scrim);
      let body;
      if (spec.frame === false) {
        body = h('div.sheet-free');
        wrap.append(body);
      } else {
        const sheet = h('div.sheet.paper' + (spec.wide ? '.wide' : ''));
        const head = h('div.sheet-head');
        const back = h('button.round.paper-btn.sheet-back', { type: 'button', 'aria-label': ctx.i18n.t('ui.sheet.back'), html: icon('back') });
        onTap(back, () => { ui.sfx('ui_tap'); open(parent); });
        const title = h('div.sheet-title.plank', h('span.st-ic', { html: icon(spec.icon || 'sparkle') }), h('span.st-txt', spec.title || ''));
        const closeBtn = h('button.round.coral.sheet-close', { type: 'button', 'aria-label': ctx.i18n.t('ui.sheet.close'), html: icon('close') });
        onTap(closeBtn, () => close());
        head.append(...[parent ? back : null, title, spec.headExtra].filter(Boolean));
        sheet.append(head, closeBtn);
        if (spec.tabs?.length) {
          const tabs = h('div.tabs.scroll-x');
          spec.tab = spec.tab || spec.tabs[0].id;
          for (const tb of spec.tabs) {
            const b = h('button.tab' + (tb.id === spec.tab ? '.on' : ''), { type: 'button', dataset: { tab: tb.id } },
              tb.icon ? h('span.tab-ic', { html: tb.icon.startsWith('<') ? tb.icon : icon(tb.icon) }) : null, h('span', tb.label),
              tb.badge ? h('span.tab-badge', String(tb.badge)) : null);
            onTap(b, () => setTab(tb.id));
            tabs.append(b);
          }
          sheet.append(tabs);
          spec._tabs = tabs;
        }
        body = h('div.sheet-body.scroll');
        sheet.append(body);
        wrap.append(sheet);
      }
      el.append(wrap);
      requestAnimationFrame(() => wrap.classList.add('in'));
      cur = { name, spec, node: wrap, body, resolve, parent };
      spec.close = r => close(r);
      spec.refresh = () => render();
      spec.setTab = setTab;
      render();
      ui.setBusy('sheet', true);
      ctx.bus.emit('ui:sheet', { name, open: true });
      if (spec.sound !== false) ui.sfx(name === 'journal' ? 'page_turn' : 'ui_open', { vol: 0.7 });
      for (const ev of spec.refreshOn || []) offs.push(ctx.bus.on(ev, () => { if (cur?.spec === spec) render(); }));
    });
  }

  function setTab(id) {
    if (!cur || cur.spec.tab === id) return;
    cur.spec.tab = id;
    cur.spec._tabs?.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
    cur.spec._tabs?.querySelector('.tab.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    ui.sfx('page_turn', { vol: 0.4 });
    cur.body.scrollTop = 0;
    render();
  }

  function render() {
    if (!cur) return;
    try { cur.spec.render(cur.body, cur.spec); }
    catch (e) { console.error('[ui] sheet render failed', cur.name, e); }
  }

  function close(result, { silent = false, keepBusy = false } = {}) {
    if (!cur) return;
    const c = cur; cur = null;
    while (offs.length) offs.pop()();
    try { c.spec.onClose?.(result); } catch (e) { console.error(e); }
    c.node.classList.remove('in'); c.node.classList.add('bye');
    setTimeout(() => c.node.remove(), 280);
    if (!keepBusy) ui.setBusy('sheet', false);
    ctx.bus.emit('ui:sheet', { name: c.name, open: false });
    if (!silent) ui.sfx('ui_close', { vol: 0.6 });
    c.resolve(result);
  }

  function refresh() { render(); }
  function applyLang() {
    if (!cur) return;
    const { name, spec } = cur;
    // rebuild the sheet in the new language, keeping tab and data
    const data = { ...spec.data, tab: spec.tab, parent: cur.parent };
    const r = cur.resolve;
    close(undefined, { silent: true, keepBusy: true });
    open(name, data).then(r);
  }

  return {
    el, open, close, refresh, applyLang,
    get current() { return cur?.name || null; },
    get spec() { return cur?.spec || null; },
    isOpen: () => !!cur,
  };
}
