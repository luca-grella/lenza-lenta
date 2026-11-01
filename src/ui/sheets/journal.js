// Journal: species grid by habitat (thumbnails, silhouettes for unknown), detail page with hints and records.
import { h, onTap, fmt } from '../dom.js';
import { icon, itemIcon, weatherIcon } from '../icons.js';
import { rarityChip, rarityColor, lazyImg, price, empty } from './common.js';

const PHASE_IC = { dawn: 'dawn', day: 'sun', dusk: 'dusk', night: 'moon' };

export default function journal(ui, data) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);
  const D = ctx.data || {};
  const habitats = D.constants?.HABITATS || ['pond', 'river', 'shore', 'harbor', 'deep', 'reef', 'cave'];
  const tabs = [{ id: 'all', label: t('ui.journal.all') }, ...habitats.map(hb => ({ id: hb, label: t('habitat.' + hb) })), { id: 'junk', label: t('ui.journal.junk') }];
  let detail = data.speciesId || null;

  const spec = {
    title: t('ui.sheet.journal'), icon: 'journal', tabs, tab: data.tab || 'all', wide: true, cls: 'tall',
    refreshOn: ['fishing:catch', 'aquarium:donate'],
    render(body) {
      const oldMain = body.querySelector('.j-main');
      if (oldMain && oldMain.offsetParent) spec._jscroll = oldMain.scrollTop;
      if (spec._lastTab !== spec.tab) { spec._jscroll = 0; spec._lastTab = spec.tab; }
      const J = A.journal();
      const list = spec.tab === 'junk' ? (D.junk || []) : (D.fish || []).filter(f => spec.tab === 'all' || f.habitats.includes(spec.tab));
      const known = list.filter(f => J[f.id]).length;
      const all = (D.fish || []).length, allKnown = (D.fish || []).filter(f => J[f.id]).length;
      const head = h('div.j-head',
        h('div.j-count', h('b', String(allKnown)), ' / ' + all),
        h('div.j-countbar', h('i', { style: { width: (all ? allKnown / all * 100 : 0) + '%' } })),
        h('div.j-sub', spec.tab === 'all' ? t('ui.journal.count', { n: allKnown, total: all }) : `${known} / ${list.length}`));
      const grid = h('div.j-grid');
      for (const f of list) {
        const e = J[f.id];
        const cell = h('button.j-cell' + (e ? '.known' : '.unknown') + (detail === f.id ? '.sel' : ''), { type: 'button', style: e ? { '--rc': rarityColor(ui, f.rarity) } : null },
          h('span.j-pic', lazyImg(ui, f.id, 88, e ? '' : 'sil'), e ? null : h('span.j-q', '?')),
          h('span.j-name', e ? t(f.nameKey) : t('ui.journal.unknown')),
          e && A.aquarium()[f.id] ? h('span.j-donated', { html: icon('aquarium'), title: t('ui.journal.donated') }) : null);
        onTap(cell, () => { detail = f.id; ui.sfx('page_turn', { vol: 0.5 }); spec.render(body); body.querySelector('.j-detail')?.scrollTo?.(0, 0); });
        grid.append(cell);
      }
      const layout = h('div.j-layout' + (detail ? '.has-detail' : ''), h('div.j-main.scroll', head, list.length ? grid : empty(t('ui.journal.empty'), 'fish')));
      if (detail) layout.append(renderDetail(detail));
      body.replaceChildren(layout);
      const main = layout.firstChild;
      if (spec._jscroll && main.offsetParent) main.scrollTop = spec._jscroll;
    },
  };

  function fact(label, ...content) { return h('div.fact', h('div.fact-k', label), h('div.fact-v', ...content)); }

  function renderDetail(id) {
    const f = A.item(id);
    const e = A.journal()[id];
    const wrap = h('div.j-detail.paper.flat.scroll');
    const back = h('button.btn.ghost.small.j-back', { type: 'button' }, h('span', { html: icon('back') }), t('ui.sheet.back'));
    onTap(back, () => { detail = null; spec.refresh(); });
    if (!f) return wrap;
    const isJunk = f.kind === 'junk';
    const pic = h('div.j-portrait' + (f.habitats?.includes('cave') || (f.times?.length === 1 && f.times[0] === 'night') ? '.night' : ''),
      lazyImg(ui, id, 240, e ? '' : 'sil'), e ? null : h('span.j-q.big', '?'));
    const name = h('div.j-title', e ? t(f.nameKey) : t('ui.journal.unknown'));
    const chips = h('div.j-chips', rarityChip(ui, f.rarity), e && A.aquarium()[id] ? h('span.chip.on', { html: icon('aquarium') }, t('ui.journal.donated')) : null);
    const desc = h('p.j-desc', e ? t(f.descKey) : t('ui.journal.unknown_desc'));
    const facts = h('div.facts');

    // where / when (always shown: these are the hints)
    const zones = f.special?.zones || f.zones;
    const where = (zones?.length ? zones.map(z => t(`zone.${z}.name`)) : (f.habitats || []).map(hb => t('habitat.' + hb)));
    facts.append(fact(t('ui.journal.where'), where.length ? where.join(' · ') : t('ui.journal.hint_any')));
    const times = f.special?.times || f.times || [];
    if (times.length && times.length < 4) facts.append(fact(t('ui.journal.when'), h('span.ic-row', times.map(p => h('span.ic-chip', { html: icon(PHASE_IC[p]) }, t('phase.' + p))))));
    else facts.append(fact(t('ui.journal.when'), t('ui.journal.hint_any')));
    const wlist = f.special?.weather || Object.entries(f.weather || {}).filter(([, m]) => m > 1.05).map(([w]) => w);
    if (wlist.length) facts.append(fact(t('ui.journal.weather'), h('span.ic-row', wlist.map(w => h('span.ic-chip', { html: icon(weatherIcon(w, 'day')) }, t('weather.' + w))))));
    if (!isJunk) {
      const baits = f.special?.baits || f.baits || [];
      facts.append(fact(t('ui.journal.bait'), e
        ? h('span.ic-row', baits.map(b => h('span.ic-chip', { html: itemIcon(A.item(b)) }, A.name(b))))
        : t('ui.journal.hint_bait_unknown')));
    }
    if (f.special && !e) facts.append(h('div.j-special', h('span', { html: icon('sparkle') }), t('ui.journal.special')));
    if (e) {
      if (f.size) facts.append(fact(t('ui.journal.size'), t('ui.journal.cm_range', { a: f.size[0], b: f.size[1] })));
      const rec = h('div.j-records',
        h('div.rec', h('div.rec-v', fmt(e.n || 1)), h('div.rec-k', t('ui.journal.caught'))),
        e.best ? h('div.rec', h('div.rec-v', t('ui.journal.cm', { n: Math.round(e.best) })), h('div.rec-k', t('ui.journal.best'))) : null,
        e.firstDay ? h('div.rec', h('div.rec-v', String(e.firstDay)), h('div.rec-k', t('ui.journal.first'))) : null,
        f.price ? h('div.rec', h('div.rec-v', price(f.price)), h('div.rec-k', t('ui.journal.price'))) : null);
      wrap.append(back, pic, name, chips, desc, rec, facts);
    } else wrap.append(back, pic, name, chips, desc, facts);
    return wrap;
  }

  return spec;
}
