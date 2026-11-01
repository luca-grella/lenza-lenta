// Minimal built-in HUD used ONLY when the real UI module (src/ui) is missing: sandbox/gameplay.html and early integration.
// Implements the subset of ctx.ui that Systems call: toast, banner, dialog, meter, sheet('catch'|'shop'|'cook'|...), isOpen.
// The shipped game uses App & UI's interface instead.

const CSS = `
.llfb{position:fixed;inset:0;pointer-events:none;font:600 15px/1.35 system-ui,-apple-system,sans-serif;color:#3a2a1a;z-index:50}
.llfb *{box-sizing:border-box}
.llfb .card{background:#fff8ea;border-radius:16px;box-shadow:0 6px 22px rgba(40,30,10,.25),inset 0 0 0 2px #e8d5ae}
.llfb .top{position:absolute;top:calc(10px + env(safe-area-inset-top));right:calc(10px + env(safe-area-inset-right));display:flex;gap:8px}
.llfb .pill{padding:6px 12px;border-radius:999px;background:#fff8ea;box-shadow:0 3px 10px rgba(40,30,10,.2)}
.llfb .goal{position:absolute;top:calc(10px + env(safe-area-inset-top));left:calc(10px + env(safe-area-inset-left));max-width:min(320px,52vw);padding:8px 12px;font-size:13px}
.llfb .goal b{display:block;color:#b8623b;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.llfb .toasts{position:absolute;left:50%;top:calc(64px + env(safe-area-inset-top));transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center;width:min(92vw,460px)}
.llfb .toast{padding:8px 14px;border-radius:12px;background:rgba(40,32,20,.82);color:#fff6e4;font-size:14px;animation:llin .3s ease both;text-align:center}
.llfb .banner{position:absolute;left:50%;top:26%;transform:translate(-50%,-50%);padding:14px 28px;text-align:center;animation:llpop .5s cubic-bezier(.2,1.6,.4,1) both}
.llfb .banner h2{margin:0;font-size:24px;color:#b8623b}.llfb .banner p{margin:4px 0 0;font-size:14px;opacity:.8}
.llfb .act{position:absolute;right:calc(18px + env(safe-area-inset-right));bottom:calc(22px + env(safe-area-inset-bottom));width:96px;height:96px;border-radius:50%;border:0;pointer-events:auto;
  background:radial-gradient(circle at 35% 30%,#ffd98a,#f0a43a);box-shadow:0 6px 16px rgba(120,60,10,.35),inset 0 -4px 0 rgba(0,0,0,.12);color:#5a2e10;font:800 13px/1.15 system-ui,sans-serif;padding:8px;touch-action:none}
.llfb .act.off{opacity:.45}.llfb .act.urgent{animation:llpulse .5s ease infinite alternate}
.llfb .meter{position:absolute;left:50%;bottom:calc(140px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(80vw,340px);padding:10px 14px}
.llfb .bar{height:12px;border-radius:8px;background:#ead9b8;overflow:hidden;margin:6px 0}
.llfb .bar i{display:block;height:100%;border-radius:8px;background:#7cc96a;transition:width .08s linear}
.llfb .bar.t i{background:linear-gradient(90deg,#7cc96a,#f5c542 60%,#e2553f)}
.llfb .meter small{display:block;text-align:center;font-size:13px}
.llfb .dlg{position:absolute;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(94vw,560px);padding:14px 18px;pointer-events:auto;animation:llin .25s ease both}
.llfb .dlg b{color:#1d6f9a}.llfb .dlg p{margin:6px 0 10px}
.llfb .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.llfb button.b{pointer-events:auto;border:0;border-radius:10px;padding:8px 14px;background:#3fa8b8;color:#fff;font:700 14px system-ui,sans-serif}
.llfb button.b.alt{background:#e8d5ae;color:#3a2a1a}
.llfb .sheet{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,460px);max-height:80vh;overflow:auto;padding:16px;pointer-events:auto}
.llfb .sheet h3{margin:0 0 8px;color:#b8623b}.llfb .li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed #e8d5ae;font-size:14px}
.llfb .catch{text-align:center}.llfb .catch .tag{display:inline-block;margin:0 4px;padding:2px 8px;border-radius:8px;background:#f5c542;font-size:12px}
@keyframes llin{from{opacity:0;transform:translate(-50%,8px)}}.llfb .toast{animation-name:llfade}@keyframes llfade{from{opacity:0;transform:translateY(6px)}}
@keyframes llpop{from{opacity:0;transform:translate(-50%,-50%) scale(.6)}}@keyframes llpulse{to{transform:scale(1.08)}}
`;

export function createFallbackUI(ctx, env) {
  const t = (k, v) => (typeof k === 'string' && ctx.i18n.has(k) ? ctx.i18n.t(k, v) : k);
  const root = document.createElement('div');
  root.className = 'llfb';
  const style = document.createElement('style'); style.textContent = CSS;
  document.head.appendChild(style);
  document.body.appendChild(root);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const goal = el('div', 'goal card'); root.append(goal);
  const top = el('div', 'top'); const coins = el('div', 'pill'); const basket = el('div', 'pill'); top.append(coins, basket); root.append(top);
  const toasts = el('div', 'toasts'); root.append(toasts);
  const act = el('button', 'act'); root.append(act);
  const meterEl = el('div', 'meter card'); meterEl.style.display = 'none'; root.append(meterEl);
  let open = null; // current modal element

  act.addEventListener('pointerdown', e => { e.preventDefault(); ctx.input.setAction(true, 'fallback'); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) act.addEventListener(ev, () => ctx.input.setAction(false, 'fallback'));

  function closeModal() {
    if (!open) return;
    const name = open.dataset.name;
    const res = open._resolve;
    open.remove(); open = null;
    res?.(undefined);
    ctx.input.enabled = true;
    ctx.bus.emit('ui:sheet', { name, open: false });
  }
  function modal(name, node) {
    closeModal();
    node.dataset.name = name;
    open = node; root.append(node);
    ctx.input.enabled = false; ctx.input.clear();
    ctx.bus.emit('ui:sheet', { name, open: true });
  }

  const ui = {
    isFallback: true,
    toast(key, vars) {
      const d = el('div', 'toast'); d.textContent = t(key, vars);
      toasts.append(d);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      setTimeout(() => d.remove(), 3200);
    },
    banner(title, sub, vars) {
      const d = el('div', 'banner card', `<h2>${esc(t(title, vars))}</h2>${sub ? `<p>${esc(t(sub, vars))}</p>` : ''}`);
      root.append(d); setTimeout(() => d.remove(), 2600);
    },
    dialog(npcId, lines, choices) {
      return new Promise(resolve => {
        const name = npcId === 'letter' ? ctx.i18n.t('npc.letter.name') : t(ctx.data?.npcById?.[npcId]?.nameKey || `npc.${npcId}.name`);
        let i = 0;
        const box = el('div', 'dlg card');
        const render = () => {
          const ln = lines[i];
          const text = typeof ln === 'string' ? t(ln) : t(ln?.key, ln?.vars);
          const last = i >= lines.length - 1;
          box.innerHTML = `<b>${esc(name)}</b><p>${esc(text)}</p>`;
          const row = el('div', 'row');
          if (last && choices?.length) for (const c of choices) { const b = el('button', 'b'); b.textContent = t(c.labelKey || c.label); b.onclick = () => { box._resolve = null; closeModal(); resolve(c.id); }; row.append(b); }
          else { const b = el('button', 'b'); b.textContent = t('sys.fb.continue'); b.onclick = () => { if (last) { box._resolve = null; closeModal(); resolve(undefined); } else { i++; render(); } }; row.append(b); }
          box.append(row);
        };
        if (!lines.length) { resolve(undefined); return; }
        render();
        modal('dialog', box);
        box._resolve = resolve;
      });
    },
    meter(name, d) {
      if (!d) { if (meterEl.dataset.name === name) { meterEl.style.display = 'none'; meterEl.dataset.name = ''; } return; }
      meterEl.style.display = ''; meterEl.dataset.name = name;
      if (name === 'cast') meterEl.innerHTML = `<div class="bar"><i style="width:${(d.power * 100).toFixed(1)}%;background:${d.valid ? '#7cc96a' : '#f08a7a'}"></i></div><small>${esc(t(d.hint))}</small>`;
      else meterEl.innerHTML = `<div class="bar t"><i style="width:${(Math.min(1, d.tension) * 100).toFixed(1)}%"></i></div><div class="bar"><i style="width:${(d.progress * 100).toFixed(1)}%;background:#3fa8b8"></i></div><small>${esc(t(d.hint))}</small>`;
    },
    sheet(name, data = {}) {
      const s = ctx.systems;
      const box = el('div', 'sheet card');
      if (name === 'catch') {
        box.className = 'sheet card catch';
        const tags = `${data.isNew ? `<span class="tag">${esc(t('sys.fb.new'))}</span>` : ''}${data.isRecord ? `<span class="tag">${esc(t('sys.fb.record'))}</span>` : ''}`;
        box.innerHTML = `<h3>${esc(t(data.nameKey))}</h3><div>${esc(t('rarity.' + data.rarity))} ${tags}</div><p>${data.junk ? '' : esc(t('sys.fb.size', { size: data.size, price: data.price }))}</p>`;
        const row = el('div', 'row'); row.style.justifyContent = 'center';
        for (const c of data.choices || ['keep']) { const b = el('button', 'b' + (c === 'keep' ? '' : ' alt')); b.textContent = t('sys.fb.' + c); b.onclick = () => { data.onChoice?.(c); closeModal(); }; row.append(b); }
        box.append(row);
      } else if (name === 'shop') {
        const v = s.shops.open(data.shopId);
        box.innerHTML = `<h3>${esc(t(v.nameKey))}</h3>`;
        if (v.sell) {
          const b = el('button', 'b'); b.textContent = `${t('sys.act.sell', { n: v.sell.basket.length })} · ${v.sell.total}`;
          b.onclick = () => { s.shops.sell('all'); closeModal(); };
          box.append(b);
        }
        for (const sec of v.sections) for (const it of sec.items) {
          const li = el('div', 'li', `<span>${esc(t(it.nameKey))}${it.qty > 1 ? ' ×' + it.qty : ''}</span>`);
          const b = el('button', 'b' + (it.canBuy ? '' : ' alt')); b.textContent = it.owned ? '✓' : String(it.price);
          b.onclick = () => { s.shops.buy(it.id, data.shopId); ui.sheet('shop', data); };
          li.append(b); box.append(li);
        }
        if (v.cook) { const b = el('button', 'b'); b.textContent = t('sys.act.cook'); b.onclick = () => ui.sheet('cook', { station: 'trattoria' }); box.append(b); }
        const c = el('button', 'b alt'); c.textContent = '×'; c.onclick = closeModal; box.append(c);
      } else if (name === 'cook') {
        box.innerHTML = `<h3>${esc(t('sys.act.cook'))}</h3>`;
        for (const r of s.cooking.list(data.station)) {
          if (!r.known) continue;
          const li = el('div', 'li', `<span>${esc(t(r.nameKey))}</span>`);
          const b = el('button', 'b' + (r.ok ? '' : ' alt')); b.textContent = r.ok ? '✓' : '…';
          b.onclick = () => { if (r.ok) { s.cooking.cook(r.id, data.station); ui.sheet('cook', data); } };
          li.append(b); box.append(li);
        }
        const c = el('button', 'b alt'); c.textContent = '×'; c.onclick = closeModal; box.append(c);
      } else {
        box.innerHTML = `<h3>${esc(name)}</h3>`;
        const c = el('button', 'b alt'); c.textContent = '×'; c.onclick = closeModal; box.append(c);
      }
      modal(name, box);
    },
    closeSheet: closeModal,
    isOpen: () => !!open,
  };

  let tick = 0;
  ctx.loop.add(function fallbackHud(dt) {
    tick -= dt;
    const cur = ctx.systems?.interact?.current;
    act.textContent = cur?.label || '';
    act.classList.toggle('off', !cur || !!cur.disabled || !cur.label);
    act.classList.toggle('urgent', !!cur?.urgent);
    if (tick > 0) return;
    tick = 0.25;
    const s = ctx.systems;
    coins.textContent = t('sys.fb.coins', { n: s.economy.coins });
    basket.textContent = t('sys.fb.basket', { n: s.inventory.basketCount, of: s.inventory.capacity });
    const g = s.quests.active()[0];
    goal.innerHTML = g ? `<b>${esc(g.titleKey ? t(g.titleKey) : g.title || '')}</b>${esc(g.goalKey ? t(g.goalKey) : g.text || '')}${g.count > 1 ? ` (${g.n}/${g.count})` : ''}` : '';
    goal.style.display = g ? '' : 'none';
  }, 50);
  window.addEventListener('keydown', e => { if (e.code === 'Escape' && open && open.dataset.name !== 'catch' && open.dataset.name !== 'dialog') closeModal(); });
  return ui;
}
