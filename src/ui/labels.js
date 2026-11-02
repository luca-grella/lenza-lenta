// World-anchored labels: NPC name tags, shop signs, the "!" over the bobber, free hints.
// ui.worldLabel(id, target, textOrKey, opts) — target: Vector3 | Object3D | {x,y,z} | () => Vector3.
// opts: {kind:'npc'|'sign'|'bite'|'hint', icon, offsetY, maxDist (from the player), vars}
// Labels never sit on top of the HUD, the controls, toasts, tips, dialogues or each other: a label whose box
// would touch a reserved UI box is faded out, and between two labels the more important one stays
// (bite "!" > villager name > shop sign > hint, then the closer one).
import { h } from './dom.js';
import { icon } from './icons.js';

const SHOP_ICON = { bottega: 'shop', pescheria: 'sell', falegname: 'board', trattoria: 'cook', aquarium: 'aquarium' };

export function createLabels(ui) {
  const { ctx, A } = ui;
  const THREE = ctx.THREE;
  const el = h('div.wlabels');
  const labels = new Map();
  const v = new THREE.Vector3(), out = { x: 0, y: 0, behind: false };

  function text(l) {
    const k = l.text;
    if (typeof k !== 'string') return '';
    return ctx.i18n.has(k) ? ctx.i18n.t(k, l.vars) : k;
  }
  const PRIO = { bite: 4, npc: 3, sign: 2, hint: 1 };
  function render(l) {
    const kind = l.opts.kind || 'hint';
    l.w = 0; l.h = 0; // re-measure
    l.node.className = 'wl wl-' + kind;
    if (kind === 'bite') { l.node.innerHTML = '<span class="wl-ring"></span><span class="wl-bang">!</span>'; return; }
    l.node.replaceChildren(...[l.opts.icon ? h('span.wl-ic', { html: icon(l.opts.icon) }) : null, h('span.wl-txt', text(l))].filter(Boolean));
  }

  function worldLabel(id, target, textOrKey, opts = {}) {
    let l = labels.get(id);
    if (!l) { l = { node: h('div'), shown: false }; el.append(l.node); labels.set(id, l); }
    l.target = target; l.text = textOrKey; l.opts = opts; l.vars = opts.vars;
    render(l);
    return id;
  }
  function removeWorldLabel(id) {
    const l = labels.get(id);
    if (!l) return;
    labels.delete(id);
    l.node.classList.add('bye');
    setTimeout(() => l.node.remove(), 220);
  }

  function resolve(target) {
    if (!target) return null;
    if (typeof target === 'function') { try { target = target(); } catch { return null; } if (!target) return null; }
    if (target.isObject3D) { target.getWorldPosition(v); return v; }
    if (target.position?.isVector3 && !target.isVector3) { v.copy(target.position); return v; }
    if (typeof target.x === 'number') { v.set(target.x, target.y || 0, target.z ?? 0); return v; }
    return null;
  }

  // ── boxes the labels must keep clear of (refreshed 4×/s by ui/index.js) ──
  const RESERVED = '.hud .goal, .hud .pill, .hud .menu-btn, .hud .buff, .notify-top .zone-title.on .zt-name, .notify-top .toast, .notify .tip, '
    + '.act-wrap .act:not(.idle), .act-wrap .bait-btn, .act-tag, .meters > *, .dialog-host .dialog, .banner-card';
  let reserved = [];
  function reserve() {
    reserved = [];
    for (const e of ui.root.querySelectorAll(RESERVED)) {
      const r = e.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) reserved.push({ l: r.left - 4, t: r.top - 4, r: r.right + 4, b: r.bottom + 4 });
    }
  }
  /** Screen box of a label's visible part, from its anchor (x, y) in px. */
  function box(l, x, y) {
    if (!l.w) {
      const n = l.node.querySelector(l.opts.kind === 'bite' ? '.wl-bang' : '.wl-txt');
      l.w = n?.offsetWidth || 1; l.h = n?.offsetHeight || 1;
    }
    const kind = l.opts.kind || 'hint';
    if (kind === 'bite') return { l: x - 24, r: x + 24, t: y - 76, b: y - 28 };
    const lift = kind === 'npc' ? 8 : 0;
    return { l: x - l.w / 2, r: x + l.w / 2, t: y - lift - l.h, b: y - lift };
  }
  const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

  const cand = [];
  function update() {
    if (!labels.size) return;
    const W = ui.root.clientWidth, H = ui.root.clientHeight;
    const pp = A.playerPos();
    cand.length = 0;
    for (const l of labels.values()) {
      const p = resolve(l.target);
      let show = !!p && !ui.busy;
      let dist = 0;
      if (show) {
        if (l.opts.offsetY) p.y += l.opts.offsetY;
        dist = pp ? Math.hypot(p.x - pp.x, p.z - pp.z) : 0;
        if (l.opts.maxDist && pp) show = dist <= l.opts.maxDist;
      }
      if (show) {
        ctx.cameraRig.toScreen(p, out);
        show = !out.behind && out.x > -0.05 && out.x < 1.05 && out.y > -0.05 && out.y < 1.1;
        if (show) {
          const x = out.x * W, y = out.y * H;
          l.node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          cand.push({ l, rect: box(l, x, y), prio: PRIO[l.opts.kind || 'hint'] || 1, dist });
        }
      }
      if (!show && l.shown) { l.shown = false; l.node.classList.remove('on'); }
    }
    // declutter: most important first; a label that would cover the UI or a more important label waits
    cand.sort((a, b) => b.prio - a.prio || a.dist - b.dist);
    const kept = [];
    for (const c of cand) {
      const ok = c.prio >= 4 || (!reserved.some(r => hit(c.rect, r)) && !kept.some(k => hit(c.rect, k)));
      if (ok) kept.push(c.rect);
      if (ok !== c.l.shown) { c.l.shown = ok; c.l.node.classList.toggle('on', ok); }
    }
  }

  // ── automatic labels: villagers and shop signs ──
  function npcList() {
    const n = ctx.npcs;
    if (!n) return [];
    const list = Array.isArray(n) ? n : n.list || n.all || (typeof n.get === 'function' ? (ctx.data?.npcs || []).map(d => n.get(d.id)) : []);
    return (typeof list === 'function' ? list.call(n) : list).filter(x => x && (x.object || x.position));
  }
  function autoLabels() {
    for (const id of [...labels.keys()]) if (id.startsWith('npc:') || id.startsWith('shop:')) { labels.get(id).node.remove(); labels.delete(id); }
    for (const npc of npcList()) {
      const id = npc.id || npc.data?.id;
      if (!id) continue;
      worldLabel('npc:' + id, npc.object || npc, `npc.${id}.name`, { kind: 'npc', offsetY: npc.labelHeight || 2.35, maxDist: 9 });
    }
    const poi = ctx.world?.poi;
    if (typeof poi === 'function') {
      for (const s of Object.values(ctx.data?.shops || {})) {
        let p = null;
        try { p = poi.call(ctx.world, s.poi); } catch { p = null; }
        if (!p) continue;
        const pos = p.isVector3 ? p.clone() : { x: p.x, y: p.y ?? ctx.world.groundY?.(p.x, p.z) ?? 0, z: p.z };
        worldLabel('shop:' + s.id, pos, s.nameKey, { kind: 'sign', icon: SHOP_ICON[s.id] || 'shop', offsetY: 3.4, maxDist: 24 });
      }
    }
  }
  function applyLang() { for (const l of labels.values()) render(l); }

  return { el, worldLabel, removeWorldLabel, update, reserve, autoLabels, applyLang, labels };
}
