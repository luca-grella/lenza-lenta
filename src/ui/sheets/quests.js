// Quests: the current story chapter (big card), today's requests, side stories, and completed chapters.
import { h, onTap, fmt } from '../dom.js';
import { icon, itemIcon } from '../icons.js';
import { section, empty } from './common.js';
import { portrait } from '../art.js';

export default function quests(ui) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const D = ctx.data || {};

  const npcName = id => (id === 'letter' ? t('npc.letter.name') : D.npcById?.[id] ? t(D.npcById[id].nameKey) : id || '');
  const progress = q => q.count > 1 || q.n > 0
    ? h('div.q-prog', h('div.q-bar', h('i', { style: { width: Math.min(100, q.n / q.count * 100) + '%' } })), h('span.q-n', t('ui.quests.progress', { n: Math.min(q.n, q.count), count: q.count })))
    : null;
  const rewardRow = r => {
    if (!r) return null;
    const bits = [];
    const coins = Array.isArray(r.coins) ? r.coins[0] : r.coins;
    if (coins) bits.push(h('span.chip', { html: icon('coin') }, fmt(coins) + (Array.isArray(r.coins) && r.coins[1] !== r.coins[0] ? '+' : '')));
    for (const [id, n] of Object.entries(r.items || {})) bits.push(h('span.chip', { html: itemIcon(A.item(id)) }, `${n > 1 ? n + '× ' : ''}${A.name(id)}`));
    for (const id of r.recipes || []) bits.push(h('span.chip', { html: itemIcon(A.item(id)) }, A.name(id)));
    return bits.length ? h('div.q-reward', h('span.q-reward-k', t('ui.quests.reward')), ...bits) : null;
  };
  const mapBtn = q => {
    if (!q.marker || typeof ctx.world?.poi !== 'function') return null;
    const b = h('button.btn.small.ghost', { type: 'button' }, h('span', { html: icon('map') }), t('ui.quests.show_map'));
    onTap(b, () => ui.sheet('map', { focus: q.marker, parent: 'quests' }));
    return b;
  };

  return {
    title: t('ui.sheet.quests'), icon: 'quests', cls: 'quests', wide: true,
    refreshOn: ['quest:progress', 'quest:complete', 'time:day'],
    render(body) {
      const list = A.quests();
      const story = list.find(q => q.kind === 'story' && !q.done);
      const total = (D.quests || []).length;
      const idx = A.storyIndex();
      const parts = [];
      // story
      parts.push(section(t('ui.quests.story'), 'flag', total ? h('span.chip', t('ui.quests.chapter', { n: Math.min(idx + 1, total), total })) : null));
      if (story) {
        const card = h('div.q-card.story.paper.stitched',
          story.npc ? h('div.q-face', { html: portrait(ctx, story.npc) }) : null,
          h('div.q-main',
            h('div.q-from.muted.small', story.npc ? t('ui.quests.from', { npc: npcName(story.npc) }) : ''),
            h('div.q-title', story.title),
            h('div.q-goal', story.goal),
            progress(story),
            h('div.q-foot', rewardRow(story.reward), mapBtn(story))));
        parts.push(card);
      } else if (total && idx >= total) parts.push(h('div.q-card.done-all.paper.stitched', h('div.q-main', h('div.q-title', t('ui.quests.story_done')))));
      else parts.push(empty(t('ui.hud.goal_free'), 'flag'));

      // dailies
      const dailies = list.filter(q => q.kind === 'daily');
      parts.push(section(t('ui.quests.daily'), 'sun'));
      if (!dailies.length) parts.push(h('div.note', t('ui.quests.no_daily')));
      else parts.push(h('div.q-list', dailies.map(q => h('div.q-card.daily.paper.flat' + (q.done ? '.done' : ''),
        q.npc ? h('div.q-face.small', { html: portrait(ctx, q.npc) }) : null,
        h('div.q-main', h('div.q-from.muted.small', npcName(q.npc)), h('div.q-goal', q.goal), progress(q), rewardRow(q.reward)),
        q.done ? h('span.q-check', { html: icon('check') }) : null))));

      // side quests
      const side = list.filter(q => q.kind === 'side');
      if (side.length) {
        parts.push(section(t('ui.quests.side'), 'sparkle'));
        parts.push(h('div.q-list', side.map(q => h('div.q-card.side.paper.flat',
          q.npc ? h('div.q-face.small', { html: portrait(ctx, q.npc) }) : null,
          h('div.q-main', h('div.q-title.small', q.title), h('div.q-goal', q.goal), progress(q))))));
      }

      // completed story chapters
      if (idx > 0) {
        parts.push(section(t('ui.quests.done'), 'check'));
        parts.push(h('div.q-done-list', (D.quests || []).slice(0, idx).reverse().map(q =>
          h('div.q-done', h('span.q-done-ic', { html: icon('check') }), h('span', t(q.titleKey))))));
      }
      if (story && total && idx < total - 1) parts.push(h('div.note.center', t('ui.quests.locked')));
      body.replaceChildren(...parts);
    },
  };
}
