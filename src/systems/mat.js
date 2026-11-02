// [r2-gameplay] The fishing mat (stuoia): after "Tieni" the fisherman lays the catch on a straw mat next to him, like in
// the reference video. Fish on the mat ARE basket entries (flag `mat: true`), so capacity, selling and cooking stay the
// same; walking more than ROLL_DIST from the mat (or boarding the boat, sleeping) rolls it up: the fish go into the
// basket (the flag is cleared).
// Actions offered at the mat (systems/interact.js reads mat.candidates()):
//   clean     "Pulisci il pesce"  → the entry becomes a fillet (`fillet: true`, price × FILLET_MULT), 'fish:clean'
//   bucket    "Metti nel secchio" → with the bucket item, a new species goes to Marta's aquarium alive (aquarium:donate via:'bucket')
//   show cat  "Mostra a Biscotto" → the cat comes over and sniffs it, friendship +1 once a day, 'cat:show'
//   save.state.mat = { open, x, y, z, facing }      basket entries: { id, size, price, day, mat?, fillet? }
// Visuals and animations: the Animation area's prop + chores (ctx.player.mat, ctx.player.chore(name, opts),
// ctx.player.cancelChore()); every chore can be skipped (stick, or the action button that says "Salta" meanwhile).
// Without them (sandboxes, older player module) a small straw mat is built here and the 'crouch_pick' clip is used.

export const ROLL_DIST = 6;          // metres from the mat before it rolls itself up
export const FILLET_MULT = 1.6;      // a cleaned fillet sells for this much more
const REACH = 1.9;                   // mat actions offered within this distance of its centre
const PROP_SLOTS = 6;                // fish the prop can show (more stay in the data, the last ones are shown)
const MAT_W = 1.2, MAT_D = 0.78;     // fallback mat: local x (across) / z (along the player's facing)
const SLOTS = [[-0.28, -0.26], [0.28, -0.26], [-0.28, -0.09], [0.28, -0.09], [-0.28, 0.09], [0.28, 0.09], [-0.28, 0.26], [0.28, 0.26]];

export function createMat(ctx, env) {
  const THREE = ctx.THREE;
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};
  const M = () => (S().mat ||= { open: false });
  const basket = () => S().basket || [];
  const onMat = () => basket().map((e, i) => ({ e, i })).filter(x => x.e.mat);
  const isFish = id => D().get?.(id)?.kind === 'fish';
  const day = () => ctx.time?.day | 0;
  const P = () => ctx.player || null;
  /** The Animation area's mat prop, when the player module has it (and its chores). */
  const pm = () => { const p = P(); return p?.mat && typeof p.mat.place === 'function' && typeof p.chore === 'function' ? p.mat : null; };
  const matPos = () => ({ x: M().x, y: M().y, z: M().z });

  let busy = 0;               // seconds left of a fallback action / safety timeout
  let chore = null;           // name of the running prop chore
  const queue = [];           // chores to run one after the other (lay after unroll)

  // ------------------------------------------------------------------ fallback visuals (no prop)
  let group = null, sheet = null, roll = null, anim = null;
  const meshes = new Map();   // basket entry → {object, fillet}
  const flights = [];
  function strawTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#e6cf8f'; g.fillRect(0, 0, 128, 64);
    for (let x = 0; x < 128; x += 4) { g.fillStyle = x % 8 ? '#d9bd76' : '#efdba2'; g.fillRect(x, 0, 2, 64); }
    g.fillStyle = '#b8623b'; g.fillRect(0, 6, 128, 4); g.fillRect(0, 54, 128, 4);
    g.fillStyle = '#3fa8a0'; g.fillRect(0, 12, 128, 2); g.fillRect(0, 50, 128, 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function fbPlace(spot, animate = true) {
    if (!group) {
      group = new THREE.Group(); group.name = 'fishing-mat-fallback';
      const mat = new THREE.MeshLambertMaterial({ map: strawTexture() });
      sheet = new THREE.Mesh(new THREE.BoxGeometry(MAT_W, 0.02, MAT_D), mat); sheet.position.y = 0.01; sheet.receiveShadow = true;
      roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, MAT_D, 10), mat); roll.rotation.x = Math.PI / 2; roll.castShadow = true;
      group.add(sheet, roll);
    }
    group.position.set(spot.x, spot.y, spot.z); group.rotation.y = spot.facing || 0;
    (ctx.stage?.group || ctx.scene).add(group);
    anim = animate ? { kind: 'unroll', t: 0 } : null;
    if (!animate) { sheet.scale.x = 1; sheet.position.x = 0; roll.visible = false; }
  }
  function fbSlot(i, out = new THREE.Vector3()) {
    const m = M(), s = SLOTS[i % SLOTS.length], lift = Math.floor(i / SLOTS.length) * 0.05;
    const c = Math.cos(m.facing || 0), sn = Math.sin(m.facing || 0);
    return out.set(m.x + s[0] * c + s[1] * sn, (m.y || 0) + 0.05 + lift, m.z - s[0] * sn + s[1] * c);
  }
  function fbFish(entry) {
    const wrap = new THREE.Group();
    const len = Math.max(0.2, Math.min(0.5, (entry.size || 25) / 100 * 0.9));
    if (entry.fillet) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshLambertMaterial({ color: '#f2a48c' }));
      m.scale.set(len * 0.8, 0.045, len * 0.3); m.castShadow = true; wrap.add(m);
      return wrap;
    }
    let o = null;
    try { o = ctx.fishModels?.create?.(entry.id, { lod: 1 })?.object; } catch { /* fallback below */ }
    if (!o) o = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshLambertMaterial({ color: '#8fb8c8' }));
    const box = new THREE.Box3().setFromObject(o);
    o.scale.multiplyScalar(len / (Math.max(box.max.x - box.min.x, box.max.z - box.min.z, box.max.y - box.min.y) || 1));
    o.rotation.z = Math.PI / 2;
    const inner = new THREE.Group(); inner.add(o); inner.rotation.y = Math.PI / 2; wrap.add(inner);
    return wrap;
  }
  function fbSync() {
    const list = onMat(), keep = new Set(list.map(x => x.e));
    for (const [e, m] of meshes) if (!keep.has(e) || !!e.fillet !== m.fillet) { m.object.removeFromParent(); meshes.delete(e); }
    list.forEach(({ e }, i) => {
      let m = meshes.get(e);
      if (!m) { m = { object: fbFish(e), fillet: !!e.fillet }; meshes.set(e, m); (ctx.stage?.group || ctx.scene).add(m.object); }
      if (!flights.some(f => f.object === m.object)) { fbSlot(i, m.object.position); m.object.rotation.set(0, (M().facing || 0) + (i % 2 ? 0.12 : -0.1), 0); }
    });
  }
  function fbClear() { for (const m of meshes.values()) m.object.removeFromParent(); meshes.clear(); flights.length = 0; }

  // ------------------------------------------------------------------ prop helpers
  /** The prop slot showing this entry (same species/size/cleaned state), or -1. */
  function slotOf(entry) {
    const p = pm(); if (!p) return -1;
    const f = p.fish.find(s => s.speciesId === entry.id && Math.abs((s.size || 0) - (entry.size || 0)) < 0.01 && !!s.clean === !!entry.fillet)
      || p.fish.find(s => s.speciesId === entry.id && !!s.clean === !!entry.fillet);
    return f ? f.slot : -1;
  }
  /** Make the prop show the last PROP_SLOTS mat entries (after selling, cooking, loading…). */
  function propSync() {
    const p = pm(); if (!p || !p.active) return;
    const want = onMat().map(x => x.e).slice(-PROP_SLOTS);
    const left = want.slice();
    for (const s of p.fish) {
      const k = left.findIndex(e => e.id === s.speciesId && !!e.fillet === !!s.clean);
      if (k >= 0) left.splice(k, 1); else p.removeFish(s.slot, true);
    }
    for (const e of left) { const sl = p.addFish(e.id, e.size); if (e.fillet && Number.isInteger(sl)) p.markClean(sl); }
  }
  function sync() { if (pm()) propSync(); else fbSync(); }

  /** Run a prop chore (or a fallback clip) and resolve when it ends or is skipped. */
  function runChore(name, opts = {}, fallback = ['crouch_pick'], secs = 1.2) {
    const p = P();
    if (pm()) {
      chore = name; busy = 8;   // safety: a chore never holds the mat longer than this
      return Promise.resolve(p.chore(name, opts)).catch(() => ({ ok: false })).then(r => { if (chore === name) { chore = null; busy = 0; } return r || { ok: false }; });
    }
    busy = secs;
    let have = null; try { have = p?.clips?.(); } catch { /* ignore */ }
    const clip = Array.isArray(have) ? fallback.find(n => have.includes(n)) || fallback[fallback.length - 1] : fallback[fallback.length - 1];
    return new Promise(resolve => {
      let done = false; const fin = () => { if (!done) { done = true; busy = 0; resolve({ ok: true }); } };
      try { const r = env.play(clip, { loop: false }); if (r?.then) r.then(fin, fin); } catch { /* ignore */ }
      let tt = 0; const off = ctx.loop.add(dt => { tt += dt; if (tt > secs) { off?.(); fin(); } }, ctx.ORDER?.systems ?? 10);
    });
  }
  function faceMat() {
    if (pm()) return;   // chores turn the player themselves
    const m = M(), p = env.playerPos();
    if (Math.hypot(m.x - p.x, m.z - p.z) > 0.3) env.face(Math.atan2(m.x - p.x, m.z - p.z));
  }

  /** Where to unroll the mat (fallback): beside / behind the player on the same floor, dry. */
  function findSpot() {
    const p = env.playerPos(), f = env.playerFacing(), w = ctx.world;
    const gy = w?.groundY ? w.groundY(p.x, p.z) : p.y;
    const rx = Math.cos(f), rz = -Math.sin(f), fx = Math.sin(f), fz = Math.cos(f);
    for (const [dx, dz, k] of [[rx, rz, 0.95], [-rx, -rz, 0.95], [-fx, -fz, 1.0], [rx - fx, rz - fz, 0.8], [-rx - fx, -rz - fz, 0.8], [-fx, -fz, 1.5]]) {
      const n = Math.hypot(dx, dz) || 1, x = p.x + dx / n * k, z = p.z + dz / n * k;
      const y = w?.groundY ? w.groundY(x, z) : gy;
      if (Math.abs(y - gy) > 0.3 || (w?.walkable && !w.walkable(x, z))) continue;
      return { x, y, z, facing: f };
    }
    return { x: p.x, y: gy, z: p.z, facing: f };
  }

  // ------------------------------------------------------------------ API
  const mat = {
    ROLL_DIST, FILLET_MULT,
    get open() { return !!M().open; },
    get position() { return M().open ? matPos() : null; },
    get facing() { return M().facing || 0; },
    /** An action/chore is playing: the action button offers "Salta" (skip). */
    get busy() { return busy > 0 || !!chore || queue.length > 0; },
    get chore() { return chore; },
    /** Skip the running chore (its effect happens at once) and the queued ones. */
    skip() {
      const q = queue.splice(0);
      try { if (chore) P()?.cancelChore?.(); } catch { /* ignore */ }
      for (const c of q) c.instant?.();
      busy = 0;
      return true;
    },
    /** Basket entries on the mat, in order. */
    entries() { return onMat().map(x => x.e); },
    /** Unroll the mat next to the player (no-op if it is already open). Returns true if it was rolled. */
    unroll() {
      if (M().open) return false;
      const p = pm(), pl = P();
      let spot;
      if (p) {
        const sp = p.spotFor(pl.position, pl.facing);
        spot = { x: sp.x, y: ctx.world?.groundY?.(sp.x, sp.z) ?? pl.position.y, z: sp.z, facing: pl.facing };
      } else spot = findSpot();
      Object.assign(M(), { open: true, ...spot, day: day() });
      ctx.save.commit();
      if (p) queue.push({ name: 'unroll_mat', opts: { pos: { x: spot.x, z: spot.z }, facing: spot.facing }, instant: () => { p.place({ x: spot.x, z: spot.z }, spot.facing); } });
      else { fbPlace(spot); env.sfx('pickup', { vol: 0.5, pitch: 0.8 }); ctx.bus.emit('mat:place', { ...spot, first: true }); }   // the prop emits its own 'mat:place'
      try { env.ui()?.onboarding?.show?.('mat', 'ui.tip.mat', { ms: 9000 }); } catch { /* UI optional */ }
      return true;
    },
    /** Roll it up: the fish go into the basket. */
    rollUp(reason = 'walk') {
      if (!M().open) return false;
      const n = onMat().length;
      for (const { e } of onMat()) delete e.mat;
      M().open = false;
      ctx.save.commit();
      queue.length = 0;
      const p = pm();
      if (p) { try { if (chore) P().cancelChore?.(); } catch { /* ignore */ } if (p.active) p.roll(); }   // the prop emits 'mat:roll' when done
      else {
        fbClear();
        if (group) anim = { kind: 'roll', t: 0 };
        ctx.bus.emit('mat:roll', { count: n, reason, ...matPos() });
      }
      if (n && reason !== 'silent') env.toast('sys.mat.rolled', { n });
      ctx.bus.emit('inventory:change', { id: null, delta: 0, where: 'basket' });
      return true;
    },
    /**
     * Called by fishing.resolveCatch('keep') right after the catch went into the basket: unrolls the mat at the first
     * catch, flags the newest basket entry and lays the fish down. Returns true when the player module took over the
     * mesh held in the hands (the caller must then leave it in the hands: the 'lay_on_mat' chore puts it down).
     */
    layCatch(c, mesh) {
      if (sys().boat?.active || P()?.state === 'boat') return false;
      const b = basket(), entry = b[b.length - 1];
      if (!entry || entry.id !== c.speciesId || !isFish(entry.id)) return false;
      const first = mat.unroll();
      entry.mat = true;
      ctx.save.commit();
      const count = onMat().length;
      const p = pm();
      if (p) {
        queue.push({ name: 'lay_on_mat', opts: { speciesId: entry.id, size: entry.size }, instant: () => { P().holdFish?.(null); p.addFish(entry.id, entry.size); } });
        ctx.bus.emit('mat:lay', { speciesId: entry.id, size: entry.size, count, first, ...matPos() });
        return true;
      }
      // fallback: our own copy flies from the hand to its slot while the player crouches
      faceMat();
      if (!P()?.seated) runChore('lay_on_mat', {}, ['crouch_pick'], 1.1);
      const obj = fbFish(entry);
      meshes.set(entry, { object: obj, fillet: false });
      (ctx.stage?.group || ctx.scene).add(obj);
      const from = new THREE.Vector3();
      const src = mesh?.object || (mesh?.isObject3D ? mesh : null);
      if (src) src.getWorldPosition(from); else { env.playerPos(from); from.y += 1.2; }
      obj.position.copy(from);
      flights.push({ object: obj, from, to: fbSlot(count - 1), i: count - 1, t: 0, delay: first ? 0.55 : 0.4 });
      env.sfx('splash_small', { vol: 0.2, pitch: 2.4, delay: 0.8 });
      ctx.bus.emit('mat:lay', { speciesId: entry.id, size: entry.size, count, first, ...matPos() });
      return false;
    },

    /** Mat fish that can be cleaned (not fillets, real fish). [{e, i}] */
    cleanable() { return onMat().filter(x => !x.e.fillet && isFish(x.e.id)); },
    /** Mat fish that can go in the bucket for the aquarium (needs the bucket). */
    bucketable() {
      if (!sys().inventory?.owns?.('bucket')) return [];
      const aq = S().aquarium || {};
      return onMat().filter(x => !x.e.fillet && isFish(x.e.id) && !aq[x.e.id]);
    },
    catNear() {
      const cp = sys().cat?.position?.(), p = env.playerPos();
      return !!cp && Math.hypot(cp.x - p.x, cp.z - p.z) < 6;
    },
    /** Pick one of `list` ({e, i}); asks with a small choice box when there is more than one species. → {e, i} | null */
    async pick(list, promptKey) {
      if (!list.length) return null;
      const by = new Map();
      for (const x of list) { const b = by.get(x.e.id); if (!b || (x.e.size || 0) > (b.e.size || 0)) by.set(x.e.id, x); }
      const kinds = [...by.values()].sort((a, b) => (b.e.size || 0) - (a.e.size || 0));
      if (kinds.length === 1 || !env.ui()?.dialog) return kinds[0];
      const choices = kinds.slice(0, 4).map((x, n) => ({ id: 'f' + n, label: env.t('sys.mat.pick_one', { name: env.itemName(x.e.id), n: Math.round(x.e.size || 0) }) }));
      choices.push({ id: 'cancel', label: env.t('sys.mat.cancel') });
      let r = null;
      try { r = await env.ui().dialog('mat', [promptKey], choices, { name: env.t('sys.mat.name'), camera: false }); } catch { r = null; }
      const x = typeof r === 'string' && r[0] === 'f' ? kinds[+r.slice(1)] : null;
      return x && basket().includes(x.e) ? x : null;
    },
    /** Clean a fish (an entry, or the player's pick). Resolves the fillet entry or null. */
    async clean(entry = null) {
      if (mat.busy) return null;
      let x = entry ? mat.cleanable().find(q => q.e === entry) : null;
      if (!x) x = await mat.pick(mat.cleanable(), 'sys.mat.pick_clean');
      if (!x) return null;
      faceMat();
      const slot = slotOf(x.e);
      if (pm() && slot < 0) propSync();
      await runChore('clean_fish', { slot: slotOf(x.e) >= 0 ? slotOf(x.e) : undefined }, ['clean_fish', 'crouch_pick'], 1.3);
      if (!basket().includes(x.e) || x.e.fillet) return null;   // sold/cooked meanwhile
      const before = x.e.price;
      x.e.fillet = true;
      x.e.price = Math.max(before + 1, Math.round(before * FILLET_MULT));
      const st = (S().stats ||= {}); st.cleaned = (st.cleaned | 0) + 1;
      ctx.save.commit();
      if (!pm()) { fbSync(); env.sfx('splash_small', { vol: 0.25, pitch: 2.2 }); }
      env.toast('sys.mat.cleaned', { name: env.itemName(x.e.id), price: x.e.price });
      ctx.bus.emit('inventory:change', { id: x.e.id, delta: 0, where: 'basket' });
      ctx.bus.emit('fish:clean', { speciesId: x.e.id, size: x.e.size, price: x.e.price, before, ...matPos() });
      try { if (st.cleaned === 1) env.ui()?.onboarding?.show?.('fillet', 'ui.tip.fillet', { ms: 9000 }); } catch { /* UI optional */ }
      return x.e;
    },
    /** Put a new species in the bucket: Marta gets it alive (an aquarium donation from here). */
    async bucket(entry = null) {
      if (mat.busy) return null;
      let x = entry ? mat.bucketable().find(q => q.e === entry) : null;
      if (!x) x = await mat.pick(mat.bucketable(), 'sys.mat.pick_bucket');
      if (!x) return null;
      faceMat();
      const slot = slotOf(x.e);
      await runChore('put_in_bucket', { slot: slot >= 0 ? slot : undefined, speciesId: x.e.id }, ['crouch_pick'], 1.1);
      if (!basket().includes(x.e)) return null;
      if (!pm()) env.sfx('splash_small', { vol: 0.45, pitch: 1.3 });
      const r = sys().aquarium?.donate?.(x.e.id, { entry: x.e, via: 'bucket' });
      if (!r?.ok) return null;
      env.toast('sys.mat.bucketed', { name: env.itemName(x.e.id) });
      if (!pm()) { ctx.bus.emit('mat:bucket', { speciesId: x.e.id, size: x.e.size, ...matPos() }); fbSync(); }   // the player module emits it with the prop
      else propSync();
      return x.e;
    },
    /** Show the biggest fish on the mat to Biscotto: the player holds it out, the cat comes and sniffs it. */
    async showCat(entry = null) {
      if (mat.busy) return null;
      const list = onMat();
      const x = entry ? list.find(q => q.e === entry) : list.slice().sort((a, b) => (b.e.size || 0) - (a.e.size || 0))[0];
      if (!x) return null;
      const p = pm(), pl = P();
      const catObj = ctx.creatures?.cat?.object || null;
      const at = p ? (slotOf(x.e) >= 0 ? p.slotWorld(slotOf(x.e)) : p.position.clone()) : fbSlot(list.indexOf(x));
      const r = sys().cat?.show?.(x.e.id, at) || { gained: 0, friend: S().cat?.friend | 0 };
      let taken = null;
      if (p && slotOf(x.e) >= 0) { try { taken = p.takeFish(slotOf(x.e)); if (taken?.inst?.object) pl.holdFish?.(taken.inst.object); } catch { taken = null; } }
      faceMat();
      await runChore('show_to_cat', { target: catObj || at }, ['catch_show'], 1.6);
      if (taken) { try { pl.holdFish?.(null); taken.inst?.object?.removeFromParent(); taken.inst?.dispose?.(); } catch { /* ignore */ } propSync(); }
      ctx.bus.emit('cat:show', { speciesId: x.e.id, size: x.e.size, gained: r.gained, friend: r.friend, ...matPos() });
      return x.e;
    },

    /** Context actions for interact.js (kind 'mat'). */
    candidates(p) {
      const m = M();
      if (!m.open || mat.busy || sys().boat?.active) return [];
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (d > REACH) return [];
      const at = { x: m.x, y: m.y, z: m.z };
      const out = [];
      if (onMat().length && mat.catNear() && sys().cat?.canShow?.() !== false) out.push({ id: 'mat:cat', kind: 'mat', d, at, priority: 2.45, icon: 'paw', labelKey: 'sys.act.show_cat', run: () => mat.showCat() });
      if (mat.bucketable().length) out.push({ id: 'mat:bucket', kind: 'mat', d, at, priority: 2.4, icon: 'donate', labelKey: 'sys.act.bucket', run: () => mat.bucket() });
      if (mat.cleanable().length) out.push({ id: 'mat:clean', kind: 'mat', d, at, priority: 2.35, icon: 'pick', labelKey: 'sys.act.clean_fish', run: () => mat.clean() });
      return out;
    },

    update(dt) {
      busy = Math.max(0, busy - dt);
      // next queued chore (one at a time: a new chore would cancel the running one)
      if (!chore && queue.length && pm()) {
        const c = queue.shift();
        runChore(c.name, c.opts);
      }
      // the stick always wins over a chore (it is skipped: its effect happens at once)
      if ((chore || queue.length) && (ctx.input?.move?.mag || 0) > 0.3) mat.skip();
      // fallback mat animation
      if (anim && group) {
        anim.t += dt;
        const u = Math.min(1, anim.t / 0.5), k = anim.kind === 'unroll' ? u : 1 - u, e = k * k * (3 - 2 * k);
        sheet.scale.x = Math.max(0.04, e); sheet.position.x = -MAT_W / 2 * (1 - e);
        roll.position.set(-MAT_W / 2 + MAT_W * e, 0.06, 0); roll.scale.set(1 + (1 - e) * 1.4, 1, 1 + (1 - e) * 1.4);
        roll.visible = e < 0.98 || anim.kind === 'roll';
        if (u >= 1) { if (anim.kind === 'roll') group.removeFromParent(); anim = null; }
      }
      for (let n = flights.length - 1; n >= 0; n--) {
        const f = flights[n];
        if (f.delay > 0) { f.delay -= dt; continue; }
        f.t += dt;
        const u = Math.min(1, f.t / 0.45), e = u * u * (3 - 2 * u);
        f.object.position.lerpVectors(f.from, f.to, e); f.object.position.y += Math.sin(u * Math.PI) * 0.25;
        f.object.rotation.y = (M().facing || 0) + (f.i % 2 ? 0.12 : -0.1);
        if (u >= 1) flights.splice(n, 1);
      }
      if (!M().open) return;
      const p = env.playerPos(), m = M();
      if (Math.hypot(m.x - p.x, m.z - p.z) > ROLL_DIST) mat.rollUp('walk');
    },
  };

  // keep the mat in step with the basket (sold at the Pescheria, cooked, fed to the cat…)
  ctx.bus.on('inventory:change', e => { if (M().open && (!e || e.where !== 'items') && !chore && !queue.length) sync(); });
  const restore = () => {
    queue.length = 0; fbClear(); group?.removeFromParent();
    const m = M();
    if (m.open && Number.isFinite(m.x) && onMat().length) {
      const p = pm();
      if (p) { try { p.clear(); p.place({ x: m.x, z: m.z }, m.facing || 0); } catch (e) { console.warn('[mat] restore', e); } }
      else fbPlace(m, false);
      sync();
    } else { m.open = false; for (const e of basket()) delete e.mat; }   // no open mat → nothing can be flagged
  };
  ctx.bus.on('save:loaded', restore);
  ctx.bus.on('game:ready', restore);
  ctx.bus.on('save:reset', () => { queue.length = 0; fbClear(); group?.removeFromParent(); try { pm()?.clear(); } catch { /* ignore */ } });
  ctx.bus.on('boat:board', () => mat.rollUp('boat'));
  ctx.bus.on('home:sleep', () => mat.rollUp('sleep'));
  return mat;
}
