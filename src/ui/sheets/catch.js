// Catch card: big fish portrait with sun rays, rarity, size on a little ruler, value, NEW / RECORD ribbons,
// and the three choices. ui.sheet('catch', {speciesId, size, price, isNew, isRecord, basketFull?, canGiveCat?})
// resolves to 'keep' | 'release' | 'cat' (bus 'ui:catch' {choice, ...data} is emitted too).
import { h, onTap, fmt } from '../dom.js';
import { icon } from '../icons.js';
import { rarityChip, rarityColor, lazyImg } from './common.js';

export default function catchCard(ui, data) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const id = data.speciesId || data.id;
  const f = A.item(id) || { rarity: 'common', kind: 'fish' };
  const isJunk = f.kind === 'junk';
  const rar = f.rarity || 'common';
  const full = data.basketFull ?? (A.basket().length >= A.capacity());
  const canCat = data.canGiveCat ?? A.catFriend();
  let chosen = false;

  const spec = {
    frame: false, modal: true, cls: 'catch rar-' + rar, sound: false,
    render(host) {
      const card = h('div.catch-card.paper.stitched.scroll', { style: { '--rc': rarityColor(ui, rar) } });
      const rays = h('div.catch-rays');
      const pic = h('div.catch-pic', rays, h('div.catch-fish', lazyImg(ui, id, 300)), h('div.catch-shadow'));
      const ribbons = h('div.ribbons',
        data.isNew ? h('span.ribbon.new', t('ui.catch.new')) : null,
        data.isRecord && !data.isNew ? h('span.ribbon.rec', t('ui.catch.record')) : null);
      const name = h('div.catch-name', A.name(id));
      const meta = h('div.catch-meta', rarityChip(ui, rar), isJunk ? h('span.chip', t('ui.catch.junk')) : null);
      const size = data.size && !isJunk ? sizeRuler(data.size, f.size) : null;
      const val = h('div.catch-val', h('span.cv-k', t('ui.catch.value')), h('span.price.big', { html: icon('coin') }, fmt(data.price ?? f.price ?? 0)));
      const prev = data.isRecord && data.prevBest ? h('div.muted.small.center', t('ui.catch.best_was', { n: Math.round(data.prevBest) })) : null;
      const desc = h('p.catch-desc', t(f.descKey || `fish.${id}.desc`));

      const btn = (cls, ic, label, choice, disabled) => {
        const b = h('button.btn.' + cls, { type: 'button', disabled: !!disabled }, h('span', { html: icon(ic) }), label);
        if (!disabled) onTap(b, () => pick(choice));
        return b;
      };
      const actions = h('div.catch-actions',
        btn('gold.big.keep', 'basket', full ? t('ui.catch.basket_full') : t('ui.catch.keep'), 'keep', full),
        btn('release', 'release', t('ui.catch.release'), 'release'),
        canCat ? btn('coral.cat', 'paw', t('ui.catch.cat'), 'cat') : null);
      card.append(...[pic, ribbons, name, meta, h('div.catch-stats', size, val), prev, desc, actions].filter(Boolean));
      host.replaceChildren(card);
      ui.sfx(f.rarity === 'rare' || f.rarity === 'epic' || f.rarity === 'legendary' ? 'rare_jingle' : 'catch_jingle', { vol: 0.9 });
    },
    onClose(r) { if (!chosen) emit(r || 'keep'); },
  };

  function sizeRuler(size, range) {
    const [a, b] = range || [size * 0.6, size * 1.2];
    const k = Math.max(0, Math.min(1, (size - a) / Math.max(1, b - a)));
    return h('div.ruler', h('span.cv-k', t('ui.catch.size')), h('div.ruler-bar', h('i', { style: { width: (8 + k * 92) + '%' } }), h('span.ruler-ticks')),
      h('b.ruler-v', t('ui.journal.cm', { n: Math.round(size) })));
  }
  function emit(choice) {
    chosen = true;
    ctx.bus.emit('ui:catch', { ...data, speciesId: id, choice });
  }
  function pick(choice) {
    if (chosen) return;
    ui.sfx(choice === 'keep' ? 'pickup' : choice === 'cat' ? 'cat_meow' : 'splash_small');
    if (choice === 'release') ui.toast('ui.toast.released', { icon: 'release' });
    if (choice === 'cat') ui.toast('ui.toast.cat', { icon: 'paw' });
    emit(choice);
    spec.close(choice);
  }
  return spec;
}
