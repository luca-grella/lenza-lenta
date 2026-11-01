// Aquarium: donated species swimming in little tanks, milestone track, and (at Marta's) what you can donate.
import { h, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { lazyImg, section, empty, rarityColor } from './common.js';

export default function aquarium(ui, data) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const D = ctx.data || {};
  const spec = {
    title: t('ui.sheet.aquarium'), icon: 'aquarium', cls: 'aquarium', wide: true,
    refreshOn: ['aquarium:donate', 'inventory:change'],
    render(body) {
      const fish = D.fish || [];
      const don = A.aquarium();
      const ids = fish.filter(f => don[f.id]).map(f => f.id);
      const total = fish.length;
      // milestones
      const ms = (D.aquariumMilestones || []).map(m => ({ ...m, at: m.count === 'all' ? total : m.count }));
      const next = ms.find(m => ids.length < m.at);
      const track = h('div.aq-track', h('div.aq-bar', h('i', { style: { width: (total ? ids.length / total * 100 : 0) + '%' } })),
        ms.map(m => h('span.aq-mark' + (ids.length >= m.at ? '.done' : ''), { style: { left: (m.at / total * 100) + '%' }, title: t(m.textKey) },
          h('span.aq-dot', { html: icon(ids.length >= m.at ? 'star' : 'heart') }), h('span.aq-n', m.count === 'all' ? '★' : String(m.at)))));
      const head = h('div.aq-head',
        h('div.aq-count', t('ui.aquarium.count', { n: ids.length, total })),
        track,
        h('div.aq-next.muted.small', next ? t('ui.aquarium.next', { n: next.at }) : t('ui.aquarium.all_done')));
      const parts = [head];

      if (data.donate) {
        const seen = new Set();
        const can = A.basket().filter(e => A.item(e.id)?.kind === 'fish' && !don[e.id] && !seen.has(e.id) && seen.add(e.id));
        parts.push(section(t('ui.aquarium.donate_title'), 'donate'));
        if (!can.length) parts.push(h('div.note', t('ui.aquarium.none_to_donate')));
        else parts.push(h('div.aq-donate', can.map(e => {
          const b = h('button.btn.small.coral', { type: 'button' }, h('span', { html: icon('heart') }), t('ui.aquarium.donate'));
          onTap(b, () => {
            const r = A.donate(e.id);
            if (r.ok) { ui.sfx('quest_done', { vol: 0.6 }); spec.refresh(); }
            else ui.toast(t('ui.toast.unavailable'), { icon: 'info' });
          });
          return h('div.row-card.paper.flat', h('span.rc-pic', lazyImg(ui, e.id, 56)), h('span.rc-main', h('b', A.name(e.id)), h('span.muted.small', t('ui.journal.cm', { n: Math.round(e.size || 0) }))), b);
        })));
      }

      if (!ids.length) parts.push(empty(t('ui.aquarium.empty'), 'aquarium'));
      else {
        const tanks = h('div.tanks');
        ids.forEach((id, i) => {
          const f = A.item(id);
          const night = f.habitats?.includes('cave');
          const swim = h('div.swimmer', { style: { animationDuration: (9 + (i % 5) * 1.7) + 's', animationDelay: (-(i * 1.3) % 9) + 's' } }, lazyImg(ui, id, 96));
          const tank = h('div.tank' + (night ? '.night' : ''), { style: { '--rc': rarityColor(ui, f.rarity) } },
            h('div.tank-water', h('div.bubbles', h('i'), h('i'), h('i')), swim, h('div.tank-weed'), h('div.tank-sand')),
            h('div.tank-name', A.name(id)));
          onTap(tank, () => ui.sheet('journal', { speciesId: id, parent: 'aquarium' }));
          tanks.append(tank);
        });
        parts.push(section(t('ui.sheet.aquarium'), 'fish'), tanks);
      }
      body.replaceChildren(...parts);
    },
  };
  return spec;
}
