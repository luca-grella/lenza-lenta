// Shops: Bottega (baits & gear), Pescheria (sell), Falegname (boat, home, decor), Trattoria (pantry, recipes, cook).
// ui.sheet('shop', {shopId}). Aquarium redirects to the aquarium sheet with donations.
import { h, onTap, fmt } from '../dom.js';
import { icon, itemIcon } from '../icons.js';
import { section, empty, price, lazyImg, statBars, needsText, rarityColor } from './common.js';
import { portrait } from '../art.js';
import cookSheet from './cook.js';

export default function shop(ui, data) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const D = ctx.data || {};
  const shopId = data.shopId || data.id || 'bottega';
  const S = D.shops?.[shopId];
  if (shopId === 'aquarium') { setTimeout(() => ui.sheet('aquarium', { donate: true })); return null; }
  if (!S) { console.warn('[ui] unknown shop', shopId); return null; }
  const npc = D.npcById?.[S.npc];
  const greetKeys = npc?.dialogKeys?.shop || [];
  const greet = greetKeys.length ? t(greetKeys[Math.floor(Math.random() * greetKeys.length)]) : '';
  let confirmSell = false;

  // tabs
  let tabs = (S.sections || []).map(sec => ({ id: sec.section, label: t('shop.section.' + sec.section) }));
  if (shopId === 'pescheria') tabs = [{ id: 'sell', label: t('ui.shop.sell'), icon: 'sell' }];
  if (S.cook) tabs = [{ id: 'cook', label: t('ui.cook.title'), icon: 'cook' }, ...tabs];
  // hide sections with nothing visible
  const visible = rec => rec && A.unlocked(rec) && !(rec.story && A.owned(rec.id));
  tabs = tabs.filter(tb => tb.id === 'sell' || tb.id === 'cook' || (S.sections.find(s => s.section === tb.id)?.items || []).some(id => visible(A.item(id))));

  const coinsTxt = h('span');
  const coinsChip = h('span.chip.shop-coins', h('span.chip-ic', { html: icon('coin') }), coinsTxt);
  const updCoins = () => { coinsTxt.textContent = fmt(A.coins()); };
  updCoins();

  const cook = S.cook ? cookSheet(ui, { station: 'trattoria', embedded: true }) : null;

  const spec = {
    title: t(S.nameKey), icon: { bottega: 'shop', pescheria: 'sell', falegname: 'board', trattoria: 'cook' }[shopId] || 'shop',
    cls: 'shop shop-' + shopId, wide: true, tabs, tab: data.tab || tabs[0]?.id, headExtra: coinsChip,
    refreshOn: ['coins:change', 'inventory:change', 'shop:buy', 'shop:sell', 'cook:done'],
    render(body) {
      updCoins();
      const head = h('div.shop-head',
        npc ? h('div.shop-face', { html: portrait(ctx, S.npc) }) : null,
        h('div.shop-bubble.paper.flat', h('b', npc ? t(npc.nameKey) : ''), h('span', greet)));
      if (!A.shopOpen(shopId)) { body.replaceChildren(head, empty(t('ui.shop.closed'), 'moon')); return; }
      let content;
      if (spec.tab === 'sell') content = sellView();
      else if (spec.tab === 'cook') { const box = h('div'); cook.render(box, cook); content = [...box.childNodes]; }
      else content = sectionView(spec.tab);
      body.replaceChildren(head, ...[].concat(content));
    },
  };

  function buyBtn(rec) {
    const p = A.priceOf(rec);
    const owned = rec.kind !== 'bait' && rec.kind !== 'ingredient' && rec.kind !== 'recipe' && A.owned(rec.id);
    if (rec.kind === 'recipe' && A.knownRecipes().includes(rec.id)) return h('span.chip.on', { html: icon('check') }, t('ui.shop.recipe_known'));
    if (owned) return h('span.chip.on', { html: icon('check') }, t('ui.shop.owned'));
    const afford = A.coins() >= p;
    const needOk = !rec.needs || Object.entries(rec.needs).every(([id, n]) => A.count(id) >= n);
    const b = h('button.btn.small' + (afford && needOk ? '.gold' : '.ghost.dim'), { type: 'button' }, price(p));
    onTap(b, () => {
      if (!afford) { ui.toast('ui.toast.not_enough', { icon: 'coin', kind: 'warn' }); ui.sfx('ui_close', { vol: 0.5 }); b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); return; }
      if (!needOk) { ui.toast('ui.toast.need_items', { items: needsText(ui, rec.needs) }, { icon: 'info', kind: 'warn' }); return; }
      const r = A.buy(rec.id, shopId);
      // Systems' shops.buy() already toasts the result ("Comprato: 10 × Mais" / no coins / needs…): a second toast here
      // showed every purchase twice
      if (r.ok) { ui.sfx('coin'); spec.refresh(); }
      else if (!r.reason) ui.toast('ui.toast.unavailable', { icon: 'info' });
    });
    return b;
  }

  function compareStats(rec) {
    const slot = rec.kind;
    if (!['rod', 'reel', 'line'].includes(slot)) return null;
    const cur = A.item(A.equipped(slot));
    return statBars(ui, rec.stats, cur?.stats);
  }

  function sectionView(sectionId) {
    const sec = (S.sections || []).find(s => s.section === sectionId);
    const items = (sec?.items || []).map(id => A.item(id)).filter(visible);
    if (!items.length) return [empty(t('ui.shop.locked'), 'lock')];
    return [h('div.shop-grid', items.map(rec => {
      const extra = [];
      if (rec.kind === 'bait') { extra.push(h('span.muted.small', t('ui.shop.pack', { n: rec.pack }))); if (A.count(rec.id)) extra.push(h('span.chip', t('ui.shop.have', { n: A.count(rec.id) }))); }
      if (rec.kind === 'basket') extra.push(statBars(ui, { capacity: rec.capacity }));
      if (rec.kind === 'ingredient' && A.count(rec.id)) extra.push(h('span.chip', t('ui.shop.have', { n: A.count(rec.id) })));
      if (rec.needs) extra.push(h('div.needs', h('span', { html: icon('info') }), t('ui.shop.needs', { items: needsText(ui, rec.needs) })));
      const cmp = compareStats(rec);
      return h('div.shop-card.paper.flat',
        h('div.sc-top', h('span.sc-ic', { html: itemIcon(rec) }), h('div.sc-name', h('b', t(rec.nameKey)), ...extra)),
        h('p.sc-desc', t(rec.descKey)),
        cmp,
        h('div.sc-foot', buyBtn(rec)));
    }))];
  }

  function sellView() {
    const b = A.basket();
    const out = [];
    const sh = ctx.systems?.shops;
    let special = sh?.dailySpecial ?? sh?.special;
    if (typeof special === 'function') { try { special = special.call(sh); } catch { special = null; } }
    if (special && typeof special === 'object') special = special.id || special.speciesId;
    if (special && A.item(special)) out.push(h('div.special.paper.flat', h('span', { html: icon('star') }), t('ui.shop.special', { item: A.name(special) })));
    if (!b.length) out.push(empty(t('ui.shop.sell_empty'), 'basket'));
    else {
      const total = b.reduce((s, e) => s + A.priceOf(e), 0);
      const rows = b.map((e, i) => {
        const f = A.item(e.id) || {};
        const sellOne = h('button.btn.small.ghost', { type: 'button' }, price(A.priceOf(e)));
        onTap(sellOne, () => doSell([i]));
        return h('div.row-card.paper.flat.sell-row', { style: { '--rc': rarityColor(ui, f.rarity || 'common') } },
          h('span.rc-pic', lazyImg(ui, e.id, 56)),
          h('span.rc-main', h('b', A.name(e.id)), h('span.muted.small', (e.size ? t('ui.journal.cm', { n: Math.round(e.size) }) + ' · ' : '') + t('rarity.' + (f.rarity || 'common')))),
          f.sellable === false ? null : sellOne);
      });
      const all = h('button.btn.gold.big.sell-all', { type: 'button' }, h('span', { html: icon('coin') }), t('ui.shop.sell_all'), h('b.sell-total', fmt(total)));
      onTap(all, () => { confirmSell = true; spec.refresh(); });
      const bar = confirmSell
        ? h('div.confirm.paper.stitched', h('div.confirm-q', t('ui.shop.confirm_sell', { n: fmt(total) })),
          h('div.confirm-btns', (() => { const y = h('button.btn.gold', { type: 'button' }, t('ui.shop.yes')); onTap(y, () => { confirmSell = false; doSell('all'); }); return y; })(),
            (() => { const n = h('button.btn.ghost', { type: 'button' }, t('ui.shop.no')); onTap(n, () => { confirmSell = false; spec.refresh(); }); return n; })()))
        : all;
      out.push(h('div.sell-top', bar), h('div.sell-list', rows));
    }
    // other sellable items (ingredients, junk kept in items)
    const items = Object.entries(ctx.save.state.items || {}).filter(([id, n]) => {
      const r = A.item(id);
      return n > 0 && r && S.buys?.[r.kind] && r.sellable !== false && r.source !== 'quest' && !r.opens;
    });
    if (items.length) {
      out.push(section(t('ui.shop.items_sell'), 'pick'));
      out.push(h('div.item-grid', items.map(([id, n]) => {
        const r = A.item(id);
        const unit = Math.max(1, Math.round((r.price || 1) * (S.buys[r.kind] || 1)));
        const b2 = h('button.btn.small.ghost', { type: 'button' }, price(unit));
        onTap(b2, () => { const res = A.sellItem(id, 1); if (res.ok) { ui.sfx('coin'); spec.refresh(); } else ui.toast('ui.toast.unavailable', { icon: 'info' }); });
        return h('div.itile.paper.flat', h('span.itile-ic', r.kind === 'junk' ? lazyImg(ui, id, 48) : h('span', { html: itemIcon(r) })), h('span.itile-name', A.name(id)), h('span.itile-n', '×' + n), b2);
      })));
    }
    return out;
  }

  function doSell(which) {
    const r = A.sell(which, shopId);
    if (r.ok) { ui.sfx('coin'); spec.refresh(); }
    else ui.toast('ui.toast.unavailable', { icon: 'info' });
  }

  return spec;
}
