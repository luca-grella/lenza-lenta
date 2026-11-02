// Backpack: basket (fish with size and value), baits, gear, items (ingredients, dishes, treasures), style.
import { h, onTap, fmt } from '../dom.js';
import { icon, itemIcon } from '../icons.js';
import { lazyImg, section, empty, price, rarityColor, statBars, buffDuration } from './common.js';

export default function inventory(ui, data) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const D = ctx.data || {};
  const spec = {
    title: t('ui.sheet.inventory'), icon: 'inventory', cls: 'inventory', wide: true, tab: data.tab || 'basket',
    tabs: [
      { id: 'basket', label: t('ui.inv.basket'), icon: 'basket' },
      { id: 'baits', label: t('ui.inv.baits'), icon: itemIcon(A.item('bait_worm') || { kind: 'bait', model: {} }) },
      { id: 'gear', label: t('ui.inv.gear'), icon: 'cast' },
      { id: 'items', label: t('ui.inv.items'), icon: 'pick' },
      { id: 'style', label: t('ui.inv.style'), icon: itemIcon(A.item('hat_straw') || { kind: 'cosmetic', model: {} }) },
    ],
    refreshOn: ['inventory:change', 'equip:change', 'coins:change', 'buff:start'],
    render(body) { body.replaceChildren(...(TABS[spec.tab] || TABS.basket)()); },
  };

  const equipBtn = (slot, id) => {
    if (A.equipped(slot) === id) return h('span.chip.on', { html: icon('check') }, t('ui.inv.equipped'));
    const b = h('button.btn.small', { type: 'button' }, t('ui.inv.equip'));
    onTap(b, () => { const r = A.equip(slot, id); if (r.ok !== false) { ui.sfx('ui_tap'); ui.toast('ui.toast.equipped', { item: A.name(id) }, { icon: itemIcon(A.item(id)), quiet: true }); } spec.refresh(); });
    return b;
  };
  const row = (iconNode, title, sub, right, cls = '') => h('div.row-card.paper.flat' + cls, h('span.rc-pic', iconNode), h('span.rc-main', h('b', title), sub ? h('span.muted.small', sub) : null), right || null);

  const TABS = {
    basket() {
      const b = A.basket(), cap = A.capacity();
      const total = b.reduce((s, e) => s + A.priceOf(e), 0);
      const head = h('div.inv-head',
        h('div.basket-meter', h('span', { html: icon('basket') }), h('b', t('ui.inv.basket_count', { n: b.length, cap })),
          h('div.bm-bar' + (b.length >= cap ? '.full' : ''), h('i', { style: { width: Math.min(100, b.length / cap * 100) + '%' } }))),
        b.length ? h('div.muted', t('ui.inv.basket_value', { n: fmt(total) })) : null);
      if (!b.length) return [head, empty(t('ui.inv.basket_empty'), 'basket')];
      const grid = h('div.basket-grid', b.map(e => {
        const f = A.item(e.id) || {};
        const rec = A.journal()[e.id];
        const isRecord = rec?.best && e.size && Math.abs(rec.best - e.size) < 0.05;
        return h('div.bcell.paper.flat' + (e.fillet ? '.fillet' : ''), { style: { '--rc': rarityColor(ui, f.rarity || 'common') } },
          h('span.bcell-pic', lazyImg(ui, e.id, 72)),
          h('span.bcell-name', e.fillet ? t('ui.inv.fillet', { name: A.name(e.id) }) : A.name(e.id)),
          e.mat ? h('span.bcell-mat.muted.small', t('ui.inv.on_mat')) : null,
          h('span.bcell-meta', e.size ? h('span.muted.small', t('ui.journal.cm', { n: Math.round(e.size) })) : null, price(A.priceOf(e))),
          isRecord ? h('span.bcell-rec', { html: icon('star') }) : null);
      }));
      return [head, grid];
    },
    baits() {
      return (D.baits || []).filter(bt => bt.free || A.count(bt.id) > 0).map(bt => row(
        h('span.thing-ic', { html: itemIcon(bt) }), t(bt.nameKey), t(bt.descKey),
        h('span.rc-right', h('span.rc-n', bt.free ? t('ui.misc.infinite') : t('ui.misc.x_n', { n: A.count(bt.id) })), equipBtn('bait', bt.id))));
    },
    gear() {
      const out = [];
      const grp = (title, ic, list, slot) => {
        const owned = list.filter(x => A.owned(x.id) || x.owned && slot !== 'basket' && slot !== 'lantern');
        if (!owned.length) return;
        out.push(section(title, ic));
        for (const g of owned) {
          const st = slot === 'basket' ? { capacity: g.capacity } : slot === 'lantern' ? { lightRadius: g.stats?.lightRadius } : g.stats;
          const r = row(h('span.thing-ic', { html: itemIcon(g) }), t(g.nameKey), null,
            slot === 'basket' || slot === 'lantern' ? null : h('span.rc-right', equipBtn(slot, g.id)), '.gear');
          r.querySelector('.rc-main').append(statBars(ui, st));
          out.push(r);
        }
      };
      grp(t('ui.inv.rod'), 'cast', D.rods || [], 'rod');
      grp(t('ui.inv.reel'), 'reel', D.reels || [], 'reel');
      grp(t('ui.inv.line'), 'cast', D.lines || [], 'line');
      const bk = (D.baskets || []).filter(b => A.owned(b.id) || b.owned);
      const best = bk.sort((a, b) => b.capacity - a.capacity)[0];
      if (best) grp(t('ui.inv.basket_gear'), 'basket', [best], 'basket');
      if (D.lantern && A.owned(D.lantern.id)) grp(t('ui.inv.lantern'), 'sparkle', [D.lantern], 'lantern');
      // [r2-gameplay] the bucket (Bottega › Attrezzi)
      const bucket = A.item('bucket');
      if (bucket && A.owned('bucket')) { out.push(section(t('ui.inv.tools'), 'donate')); out.push(row(h('span.thing-ic', { html: itemIcon(bucket) }), t(bucket.nameKey), t(bucket.descKey), null, '.gear')); }
      return out.length ? out : [empty(t('ui.inv.items_empty'))];
    },
    items() {
      const items = ctx.save.state.items || {};
      const groups = { ingredient: [], dish: [], junk: [], special: [], decor: [] };
      for (const [id, n] of Object.entries(items)) {
        if (!(n > 0)) continue;
        const r = A.item(id);
        if (!r) continue;
        if (r.kind === 'ingredient' && r.source !== 'quest') groups.ingredient.push([id, n]);
        else if (r.kind === 'dish') groups.dish.push([id, n]);
        else if (r.kind === 'junk' && !r.opens) groups.junk.push([id, n]);
        else if (r.kind === 'decor') groups.decor.push([id, n]);
        else if (['ingredient', 'junk'].includes(r.kind)) groups.special.push([id, n]);
      }
      const out = [];
      const tileGrid = list => h('div.item-grid', list.map(([id, n]) => {
        const r = A.item(id);
        const tile = h('div.itile.paper.flat', { title: A.desc(id) },
          h('span.itile-ic', r.kind === 'junk' ? lazyImg(ui, id, 56) : h('span', { html: itemIcon(r) })),
          h('span.itile-name', A.name(id)), h('span.itile-n', '×' + n));
        if (r.notes?.length) {
          const rd = h('button.btn.small.ghost', { type: 'button' }, t('ui.inv.read'));
          onTap(rd, () => { const seen = ctx.save.state.ui?.notes || 0; ui.dialog('letter', [r.notes[seen % r.notes.length]]); ctx.save.state.ui = { ...ctx.save.state.ui, notes: seen + 1 }; ctx.save.commit(); });
          tile.append(rd);
        }
        return tile;
      }));
      if (groups.dish.length) {
        out.push(section(t('ui.inv.dishes'), 'eat'));
        out.push(...groups.dish.map(([id, n]) => {
          const r = A.item(id), rec = A.item(r.recipe);
          // [Fix] the kitty treat is handed to the cat ("Dai a Biscotto"): the panel closes and the player walks over
          const forCat = !!rec?.effect?.cat;
          const eat = h('button.btn.small.leaf', { type: 'button' }, t(forCat ? 'ui.inv.give_cat' : 'ui.inv.eat'));
          onTap(eat, () => {
            const res = A.eat(id);
            if (res.ok && res.cat) { ui.sfx('ui_tap'); spec.close(); }
            else if (res.ok) { ui.sfx('eat'); ui.toast('ui.toast.ate', { item: A.name(id) }, { icon: 'eat' }); spec.refresh(); }
            else if (res.reason === 'cat_far') ui.toast('sys.cat.far', null, { icon: 'paw' });
            else ui.toast('ui.toast.unavailable', { icon: 'info' });
          });
          const hours = Math.max(...(rec?.buffs || []).map(b => b.hours || 4), 0);
          const buffs = (rec?.buffs || []).map(b => t(`buff.${b.stat}.name`)).join(' · ');
          return row(h('span.thing-ic', { html: itemIcon(r) }), `${A.name(id)} ×${n}`, buffs ? `${t('ui.cook.bonus')}: ${buffs} · ${buffDuration(ui, hours)}` : A.desc(id), eat);
        }));
      }
      if (groups.ingredient.length) out.push(section(t('ui.inv.ingredients'), 'pick'), tileGrid(groups.ingredient));
      if (groups.special.length) out.push(section(t('ui.inv.special'), 'sparkle'), tileGrid(groups.special));
      if (groups.junk.length) out.push(section(t('ui.inv.treasures'), 'open'), tileGrid(groups.junk));
      if (groups.decor.length) out.push(section(t('ui.inv.decor'), 'home'), tileGrid(groups.decor));
      return out.length ? out : [empty(t('ui.inv.items_empty'), 'pick')];
    },
    style() {
      const cos = D.cosmetics || [];
      const owned = c => A.owned(c.id) || c.owned || A.count(c.id) > 0;
      const hats = cos.filter(c => c.slot === 'hat' && owned(c));
      const collars = cos.filter(c => c.slot === 'cat_collar' && owned(c));
      const grid = (list, slot) => h('div.style-grid', list.map(c => {
        const on = A.equipped(slot) === c.id;
        const b = h('button.stile.paper.flat' + (on ? '.on' : ''), { type: 'button' }, h('span.stile-ic', { html: itemIcon(c) }), h('span.stile-name', t(c.nameKey)), on ? h('span.stile-check', { html: icon('check') }) : null);
        onTap(b, () => { if (!on) { A.equip(slot, c.id); ui.sfx('ui_tap'); spec.refresh(); } });
        return b;
      }));
      const out = [section(t('ui.inv.hat'), 'sparkle'), grid(hats, 'hat')];
      if (collars.length) out.push(section(t('ui.inv.collar'), 'paw'), grid(collars, 'collar'));
      return out;
    },
  };
  return spec;
}
