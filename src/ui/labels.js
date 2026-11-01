// World-anchored labels: NPC name tags, shop signs, the "!" over the bobber, free hints.
// ui.worldLabel(id, target, textOrKey, opts) — target: Vector3 | Object3D | {x,y,z} | () => Vector3.
// opts: {kind:'npc'|'sign'|'bite'|'hint', icon, offsetY, maxDist (from the player), vars}
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
  function render(l) {
    const kind = l.opts.kind || 'hint';
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

  function update() {
    if (!labels.size) return;
    const W = ui.root.clientWidth, H = ui.root.clientHeight;
    const pp = A.playerPos();
    for (const l of labels.values()) {
      const p = resolve(l.target);
      let show = !!p && !ui.busy;
      if (show) {
        if (l.opts.offsetY) p.y += l.opts.offsetY;
        if (l.opts.maxDist && pp) show = Math.hypot(p.x - pp.x, p.z - pp.z) <= l.opts.maxDist;
      }
      if (show) {
        ctx.cameraRig.toScreen(p, out);
        show = !out.behind && out.x > -0.05 && out.x < 1.05 && out.y > -0.05 && out.y < 1.1;
        if (show) l.node.style.transform = `translate3d(${(out.x * W).toFixed(1)}px, ${(out.y * H).toFixed(1)}px, 0)`;
      }
      if (show !== l.shown) { l.shown = show; l.node.classList.toggle('on', show); }
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

  return { el, worldLabel, removeWorldLabel, update, autoLabels, applyLang, labels };
}
