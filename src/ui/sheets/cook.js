// Cooking: known recipes with what you have / what you need, the soft buff, and a Cook button.
// ui.sheet('cook', {station: 'campfire'|'trattoria'}); also embedded in the Trattoria shop.
import { h, onTap } from '../dom.js';
import { icon, itemIcon } from '../icons.js';
import { empty, buffDuration, buffLines } from './common.js';

export default function cook(ui, data = {}) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const D = ctx.data || {};
  const station = data.station === 'trattoria' ? 'trattoria' : 'any';

  const spec = {
    title: t('ui.sheet.cook'), icon: 'cook', cls: 'cook', wide: true,
    refreshOn: ['inventory:change', 'cook:done'],
    render(body) {
      const known = new Set(A.knownRecipes());
      const list = (D.recipes || []).filter(r => known.has(r.id));
      const unknownN = (D.recipes || []).length - list.length;
      if (!list.length) { body.replaceChildren(empty(t('ui.cook.no_recipes'), 'cook')); return; }
      // cookable first
      const rows = list.map(r => ({ r, c: A.canCook(r.id, station) })).sort((a, b) => (b.c.ok - a.c.ok));
      const cards = rows.map(({ r, c }) => {
        const dish = A.item(r.dish) || { kind: 'dish', model: r.model };
        if (!dish.model) dish.model = r.model;
        const needs = A.recipeNeeds(r).map(n => h('span.need' + (n.have >= n.need ? '.ok' : '.miss'),
          h('span.need-ic', { html: icon(n.have >= n.need ? 'check' : 'close') }), `${Math.min(n.have, n.need)}/${n.need} ${n.label}`));
        // the bonus is what you get when you EAT the dish, for a while: cooking itself is instant
        const hours = Math.max(...(r.buffs || []).map(b => b.hours || 4), 0);
        const eff = r.buffs?.length
          ? [h('div.eff-title', t('ui.cook.bonus')), ...buffLines(ui, r.buffs), h('div.eff-time', h('span.eff-ic', { html: icon('hourglass') }), buffDuration(ui, hours))]
          : r.effect?.cat ? [h('div.eff-title', t('ui.cook.bonus_cat')), h('div.eff-line', h('span.eff-ic', { html: icon('paw') }), t('ui.cook.cat_effect'))] : [];
        const btn = c.ok
          ? h('button.btn.small.leaf', { type: 'button' }, h('span', { html: icon('cook') }), t('ui.cook.cook'))
          : h('span.chip', !c.stationOk ? t('ui.cook.station') : t('ui.cook.missing'));
        if (c.ok) onTap(btn, () => {
          const res = A.cook(r.id, station);
          // [11 nov] the sheet closes so you watch the cooking (camera close-up on cook:done)
          if (res.ok) { ui.closeSheet?.(); }
          else ui.toast('ui.toast.unavailable', { icon: 'info' });
        });
        return h('div.recipe.paper.flat' + (c.ok ? '.ready' : ''),
          h('span.rec-ic', { html: itemIcon(dish) }),
          h('div.rec-main', h('b', t(r.nameKey)), h('p.rec-desc', t(r.descKey)), h('div.needs-row', needs), eff.length ? h('div.rec-eff', eff) : null),
          h('div.rec-act', btn, A.count(r.dish) ? h('span.muted.small', '×' + A.count(r.dish)) : null));
      });
      body.replaceChildren(...[h('div.note.center.cook-how', t('ui.cook.how')), h('div.recipes', cards), unknownN > 0 ? h('div.note.center', t('ui.cook.unknown', { n: unknownN })) : null].filter(Boolean));
    },
  };
  return spec;
}
