// Top HUD: goal card (top-left), clock + weather, coins, basket, menu (top-right), active buffs.
// Rebuilt on language change, refreshed from state at low frequency and on bus events.
import { h, onTap, fmt } from './dom.js';
import { icon, weatherIcon } from './icons.js';

export function createHud(ui) {
  const { ctx, A } = ui;
  const t = (k, v) => ctx.i18n.t(k, v);

  const el = h('div.hud');
  const goal = h('button.goal.paper.stitched', { type: 'button', 'aria-label': t('ui.sheet.quests') });
  const goalTag = h('div.goal-tag');
  const goalTitle = h('div.goal-title');
  const goalText = h('div.goal-text');
  const goalBar = h('div.goal-bar', h('i'));
  const goalCount = h('span.goal-count');
  // [10 nov] while you play the goal is a small flag button; it opens for a few seconds when the goal changes or
  // when you tap it, and a tap on the open card shows the quest list
  const goalMini = h('span.goal-mini');
  goal.append(goalMini, goalTag, goalTitle, goalText, h('div.goal-prog', goalBar, goalCount));
  let goalOpenT = 0, goalPending = 0;
  const setGoalOpen = (on, ms = 6000) => {
    clearTimeout(goalOpenT);
    goal.classList.toggle('mini', !on);
    if (on) goalOpenT = setTimeout(() => goal.classList.add('mini'), ms);
  };
  goal.classList.add('mini');
  onTap(goal, () => { ui.sfx('ui_tap'); if (goal.classList.contains('mini')) setGoalOpen(true); else ui.sheet('quests'); });

  const clock = h('div.pill.clock', { role: 'img' });
  const clockIc = h('span.pill-ic');
  const clockTime = h('span.pill-val');
  const clockDay = h('span.pill-sub');
  clock.append(clockIc, h('span.pill-txt', clockTime, clockDay));

  const coins = h('div.pill.coins', { role: 'img' }, h('span.pill-ic', { html: icon('coin') }));
  const coinsVal = h('span.pill-val');
  coins.append(coinsVal);

  const basket = h('button.pill.basket', { type: 'button' }, h('span.pill-ic', { html: icon('basket') }));
  const basketVal = h('span.pill-val');
  basket.append(basketVal);
  onTap(basket, () => { ui.sfx('ui_tap'); ui.sheet('inventory', { tab: 'basket' }); });

  const menu = h('button.round.menu-btn', { type: 'button', html: icon('menu') });
  onTap(menu, () => { ui.sfx('ui_open'); ui.sheet('menu'); });

  const right = h('div.hud-right', clock, coins, basket, menu);
  const buffs = h('div.buffs');
  el.append(h('div.hud-left', goal, buffs), right);

  // ── state ──
  let shownCoins = null, targetCoins = 0, lastGoalSig = '', lastBuffSig = '';

  function applyLang() {
    goal.setAttribute('aria-label', t('ui.sheet.quests'));
    goalTag.innerHTML = icon('flag') + `<span>${t('ui.hud.goal')}</span>`;
    menu.setAttribute('aria-label', t('ui.hud.menu'));
    basket.setAttribute('aria-label', t('ui.hud.basket'));
    coins.setAttribute('aria-label', t('ui.hud.coins'));
    clock.setAttribute('aria-label', t('ui.hud.clock'));
    lastGoalSig = ''; lastBuffSig = '';
    refresh(true);
  }

  function refreshGoal() {
    const g = A.currentGoal();
    const sig = g ? `${g.id}|${g.title}|${g.goal}|${g.n}|${g.count}|${ctx.i18n.lang}` : 'none|' + ctx.i18n.lang;
    if (sig === lastGoalSig) return;
    const prevId = lastGoalSig.split('|')[0], changed = lastGoalSig && prevId === String(g?.id);
    const langOnly = lastGoalSig === '' && goal.dataset.seen;
    lastGoalSig = sig;
    goal.dataset.seen = '1';
    if (!langOnly) goalPending = 2.4;   // a new goal or some progress: shown (then folded) once no dialogue is on screen
    if (!g) { goalMini.innerHTML = icon('flag'); goalTitle.textContent = t('ui.hud.goal_free'); goalText.textContent = ''; goal.classList.add('no-prog'); goal.classList.add('free'); return; }
    goal.classList.remove('free');
    goalTitle.textContent = g.title || g.goal;
    goalText.textContent = g.title ? g.goal : '';
    const showProg = g.count > 1;
    goal.classList.toggle('no-prog', !showProg);
    goalBar.firstChild.style.width = Math.round(100 * Math.min(1, g.n / g.count)) + '%';
    goalCount.textContent = t('ui.quests.progress', { n: Math.min(g.n, g.count), count: g.count });
    goalMini.innerHTML = icon('flag') + (showProg ? `<b>${Math.min(g.n, g.count)}/${g.count}</b>` : '');
    if (changed) { goal.classList.remove('bump'); void goal.offsetWidth; goal.classList.add('bump'); }
  }

  function refreshBuffs() {
    const list = A.buffs();
    const sig = list.map(b => b.stat + Math.ceil(b.hoursLeft ?? 0)).join(',') + ctx.i18n.lang;
    if (sig === lastBuffSig) return;
    lastBuffSig = sig;
    buffs.replaceChildren(...list.map(b => h('div.buff', { title: t(`buff.${b.stat}.desc`) },
      h('span.buff-ic', { html: icon('sparkle') }), h('span', t(`buff.${b.stat}.name`)),
      b.hoursLeft !== null && b.hoursLeft < 48 ? h('span.buff-t', t('ui.hud.buff_left', { h: Math.ceil(b.hoursLeft) })) : null)));
  }

  let lastWeatherIc = '';
  function refresh(force = false) {
    // clock
    const time = ctx.time;
    clockTime.textContent = time?.format ? time.format() : '';
    clockDay.textContent = t('time.day_n', { n: time?.day || 1 });
    const wi = weatherIcon(A.weather(), A.phase());
    if (wi !== lastWeatherIc || force) { clockIc.innerHTML = icon(wi); lastWeatherIc = wi; }
    clock.classList.toggle('night', A.phase() === 'night');
    // coins
    targetCoins = A.coins();
    if (shownCoins === null || force) { shownCoins = targetCoins; coinsVal.textContent = fmt(shownCoins); }
    // basket
    const n = A.basket().length, cap = A.capacity();
    basketVal.textContent = `${n}/${cap}`;
    basket.classList.toggle('full', n >= cap);
    refreshGoal();
    refreshBuffs();
  }

  // smooth coin counter
  function tick(dt) {
    // the new goal waits for the end of the conversation (and the "objective complete" banner) before it opens
    if (goalPending > 0) {
      if (ui.dialogs?.open || ui.sheets?.isOpen?.() || ui.intro?.open) goalPending = 2.4;
      else if ((goalPending -= dt) <= 0) { goalPending = 0; setGoalOpen(true, 5000); }
    }
    if (shownCoins === null || shownCoins === targetCoins) return;
    const d = targetCoins - shownCoins;
    const step = Math.sign(d) * Math.max(1, Math.abs(d) * Math.min(1, dt * 7));
    shownCoins = Math.abs(step) >= Math.abs(d) ? targetCoins : Math.round(shownCoins + step);
    coinsVal.textContent = fmt(shownCoins);
  }

  function coinsChanged(delta) {
    targetCoins = A.coins();
    coins.classList.remove('bump'); void coins.offsetWidth; coins.classList.add('bump');
    if (delta) {
      const f = h('div.coin-fly' + (delta < 0 ? '.neg' : ''), (delta > 0 ? '+' : '−') + fmt(Math.abs(delta)));
      coins.append(f);
      setTimeout(() => f.remove(), 1300);
    }
  }
  function basketBump() { basket.classList.remove('bump'); void basket.offsetWidth; basket.classList.add('bump'); }

  return { el, refresh, tick, applyLang, coinsChanged, basketBump, goal, menu };
}
