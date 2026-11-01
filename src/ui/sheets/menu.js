// Menu (Esc / backpack button): big friendly tiles to every panel.
import { h, onTap, fmt } from '../dom.js';
import { icon } from '../icons.js';

export default function menu(ui) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  return {
    title: t('ui.menu.title'), icon: 'menu', cls: 'menu',
    render(body) {
      const fish = ctx.data?.fish || [];
      const caught = fish.filter(f => A.journal()[f.id]).length;
      const donated = fish.filter(f => A.aquarium()[f.id]).length;
      const g = A.currentGoal();
      const tiles = [
        ['journal', 'journal', t('ui.journal.count', { n: caught, total: fish.length })],
        ['map', 'map', ctx.i18n.has(`zone.${ui.zone}.name`) ? t(`zone.${ui.zone}.name`) : ''],
        ['quests', 'quests', g?.title || ''],
        ['inventory', 'inventory', t('ui.inv.basket_count', { n: A.basket().length, cap: A.capacity() })],
        ['aquarium', 'aquarium', t('ui.aquarium.count', { n: donated, total: fish.length })],
        ['settings', 'settings', t('ui.set.language') + ' · ' + t('ui.set.audio')],
      ];
      const grid = h('div.menu-grid', tiles.map(([name, ic, sub]) => {
        const b = h('button.tile.paper', { type: 'button' }, h('span.tile-ic', { html: icon(ic) }), h('span.tile-name', t('ui.sheet.' + name)), h('span.tile-sub', sub));
        onTap(b, () => { ui.sfx('ui_tap'); ui.sheet(name); });
        return b;
      }));
      const pt = Math.round(ctx.save.state.meta?.playSeconds || 0);
      const hrs = Math.floor(pt / 3600), mins = Math.floor((pt % 3600) / 60);
      const info = h('div.menu-info',
        h('span.chip', { html: icon(A.phase() === 'night' ? 'moon' : 'sun') }, t('ui.menu.day', { n: ctx.time?.day || 1 }) + ' · ' + (ctx.time?.format?.() || '')),
        h('span.chip', { html: icon('coin') }, fmt(A.coins())),
        pt > 60 ? h('span.chip', { html: icon('clock') }, t('ui.menu.playtime', { t: hrs ? t('ui.misc.hours_short', { h: hrs, m: mins }) : t('ui.misc.minutes_short', { m: mins }) })) : null);
      const resume = h('button.btn.leaf.big.menu-resume', { type: 'button' }, h('span', { html: icon('cast') }), t('ui.menu.resume'));
      onTap(resume, () => ui.closeSheet());
      body.replaceChildren(info, grid, h('div.menu-foot', resume));
    },
  };
}
