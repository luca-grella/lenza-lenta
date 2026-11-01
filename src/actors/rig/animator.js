// AnimationMixer wrapper. Each clip is baked in two halves (upper body / lower body) so that:
//   - a full-body clip plays both halves in sync;
//   - an UPPER override (wave, cast while sitting...) replaces only the upper half while the legs keep
//     doing the base clip (walking, sitting, rowing);
//   - cross-fades are done per half with weights that always sum to 1 (no blending with the bind pose).
// Plus an ADDITIVE layer (nod, flinch...) and a LOCOMOTION blend (idle / walk_slow / walk by speed, with
// the walk cycles phase-locked to the distance travelled so the feet do not slide).
import * as THREE from 'three';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Locomotion tuning: natural speed (m/s) and stride (m per full cycle) of the two walk clips. */
export const LOCO = { slow: { clip: 'walk_slow', speed: 1.2, stride: 0.95 }, fast: { clip: 'walk', speed: 2.8, stride: 1.3 }, idle: 'idle' };

class Slot {
  constructor(anim, half) { this.anim = anim; this.half = half; this.entries = []; }
  get target() { return this.entries[this.entries.length - 1] || null; }
  /** Fade to key (clip name or 'locomotion'). Reuses an entry that is still fading out. */
  fadeTo(key, fade, { restart = true, time = null, speed = 1, loop = null } = {}) {
    const A = this.anim;
    let e = this.entries.find(x => x.key === key);
    if (e) { this.entries.splice(this.entries.indexOf(e), 1); }
    else {
      e = { key, w: this.entries.length ? 0 : 1, actions: [] };
      if (key === 'locomotion') {
        for (const n of [LOCO.idle, LOCO.slow.clip, LOCO.fast.clip]) { const a = A._action(n, this.half); if (a) e.actions.push({ name: n, action: a, sub: 0 }); }
      } else { const a = A._action(key, this.half); if (a) e.actions.push({ name: key, action: a, sub: 1 }); }
    }
    e.fade = Math.max(1e-3, fade);
    for (const it of e.actions) {
      const a = it.action, def = A.lib[it.name].def;
      const isLoop = key === 'locomotion' ? true : (loop ?? def.loop);
      a.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !isLoop;
      if (key === 'locomotion' && it.name !== LOCO.idle) a.timeScale = 0; else a.timeScale = speed;
      if (restart && key !== 'locomotion' && e.w < 0.999) a.reset();
      if (restart && key !== 'locomotion' && e.w >= 0.999) a.time = 0;
      if (time !== null && key !== 'locomotion') a.time = Math.min(time, def.duration);
      if (!a.isRunning()) { A.beforeActivate?.(); a.play(); }
      a.enabled = true; a.paused = false;
    }
    this.entries.push(e);
    if (fade <= 1e-3) { for (const x of this.entries) x.w = x === e ? 1 : 0; }
    return e;
  }
  update(dt) {
    const t = this.target; if (!t) return;
    t.w = Math.min(1, t.w + dt / t.fade);
    const others = this.entries.filter(x => x !== t);
    const rest = others.reduce((s, x) => s + x.w, 0);
    const k = rest > 1e-6 ? (1 - t.w) / rest : 0;
    for (const x of others) x.w *= k;
    for (const x of others) if (x.w < 1e-3) { for (const it of x.actions) if (!this.anim._usedElsewhere(it.action, x)) it.action.stop(); }
    this.entries = this.entries.filter(x => x === t || x.w >= 1e-3);
    if (this.entries.length === 1) t.w = 1;
  }
  apply() { for (const e of this.entries) for (const it of e.actions) it.action.setEffectiveWeight(e.w * it.sub); }
}

export class Animator {
  /**
   * @param {THREE.Object3D} root  object whose descendants are the bones (the SkinnedMesh)
   * @param {Object<string,{def:object, full:THREE.AnimationClip, upper:THREE.AnimationClip, lower:THREE.AnimationClip}>} lib
   */
  constructor(root, lib) {
    this.root = root; this.lib = lib;
    this.mixer = new THREE.AnimationMixer(root);
    this.slots = { lower: new Slot(this, 'lower'), upper: new Slot(this, 'upper') };
    this.base = null;   // {name, opts, resolve, ended, t}
    this.over = null;   // upper override
    this.additive = []; // {name, action, w, target, fade}
    this.speed = 0; this.phase = 0; this.locoW = { idle: 1, slow: 0, fast: 0 };
    this.meta = { footIK: 1, look: 1, breathe: 1, lean: 1, armIK: null, armIKw: 0, sit: 0 };
    /** (eventName, clipName, eventData) → void */
    this.onEvent = null;
    /** () → default clip name when a non-hold one-shot ends without `next` */
    this.defaultFor = () => 'locomotion';
    this.beforeActivate = null;
    this._addCache = new Map();
  }

  has(name) { return name === 'locomotion' || !!this.lib[name]; }
  _action(name, half) { const c = this.lib[name]; if (!c) return null; return this.mixer.clipAction(half === 'upper' ? c.upper : c.lower); }
  _usedElsewhere(action, exceptEntry) {
    for (const s of Object.values(this.slots)) for (const e of s.entries) if (e !== exceptEntry && e.actions.some(it => it.action === action)) return true;
    return false;
  }

  /** Name of the current base clip ('locomotion' or a clip) and of the upper override (or null). */
  get current() { return this.base?.name || null; }
  get upperName() { return this.over?.name || null; }
  /** Normalised time 0..1 of the current base (or override) clip. */
  progress(layer = 'base') {
    const st = layer === 'upper' ? this.over : this.base; if (!st || st.name === 'locomotion') return 0;
    const a = this._lead(st, layer); const d = this.lib[st.name].def.duration; return a ? Math.min(1, a.time / d) : 0;
  }
  _lead(st, layer) {
    const slot = layer === 'upper' ? this.slots.upper : this.slots.lower;
    const e = slot.entries.find(x => x.key === st.name) || this.slots.upper.entries.find(x => x.key === st.name);
    return e?.actions[0]?.action || null;
  }

  /**
   * Play a clip. opts: {fade=0.25, speed=1, loop, next, hold, layer:'full'|'upper', onEnd, onEvent:{name:fn}, fadeOut=0.25, time}
   * Returns a Promise that resolves true when the clip ends (or false if it was interrupted).
   */
  play(name, opts = {}) {
    if (!this.has(name)) { console.warn('[anim] unknown clip', name); return Promise.resolve(false); }
    const fade = opts.fade ?? 0.25;
    const layer = opts.layer === 'upper' ? 'upper' : 'full';
    let resolve; const p = new Promise(r => { resolve = r; });
    const st = { name, opts, resolve, ended: false, prevT: 0 };
    if (layer === 'upper') {
      if (this.over && !this.over.ended) this.over.resolve(false);
      this.over = st;
      this.slots.upper.fadeTo(name, fade, { speed: opts.speed ?? 1, loop: opts.loop ?? null, time: opts.time ?? null });
    } else {
      if (this.base && !this.base.ended && this.base.name !== name) this.base.resolve(false);
      const same = this.base && this.base.name === name && name === 'locomotion';
      this.base = st;
      if (!same) {
        this.slots.lower.fadeTo(name, fade, { speed: opts.speed ?? 1, loop: opts.loop ?? null, time: opts.time ?? null });
        if (!this.over) this.slots.upper.fadeTo(name, fade, { speed: opts.speed ?? 1, loop: opts.loop ?? null, time: opts.time ?? null });
        else if (opts.keepUpper === false) this.stopUpper(fade);
      }
    }
    return p;
  }

  /** End the upper override and fade the upper body back to the base clip (time-synced). */
  stopUpper(fade = 0.3) {
    if (!this.over) return;
    if (!this.over.ended) { this.over.ended = true; this.over.resolve(false); }
    this.over = null;
    const b = this.base?.name || 'locomotion';
    const lower = this.slots.lower.entries.find(x => x.key === b);
    const t = b !== 'locomotion' ? lower?.actions[0]?.action.time ?? 0 : null;
    this.slots.upper.fadeTo(b, fade, { restart: false, time: t, speed: this.base?.opts.speed ?? 1, loop: this.base?.opts.loop ?? null });
  }

  /** Additive clip on top of everything (e.g. 'nod', 'flinch'). weight 0..1. */
  playAdditive(name, { weight = 1, fade = 0.15, loop = false, speed = 1 } = {}) {
    const c = this.lib[name]; if (!c) return;
    let clip = this._addCache.get(name);
    if (!clip) { clip = THREE.AnimationUtils.makeClipAdditive(c.full.clone(), 0); clip.name = name + '#add'; this._addCache.set(name, clip); }
    const action = this.mixer.clipAction(clip);
    action.blendMode = THREE.AdditiveAnimationBlendMode;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); action.clampWhenFinished = false;
    action.timeScale = speed;
    this.beforeActivate?.();
    action.reset().play();
    let e = this.additive.find(x => x.name === name);
    if (!e) { e = { name, action, w: 0 }; this.additive.push(e); }
    Object.assign(e, { target: weight, fade, loop, dur: c.def.duration });
  }
  stopAdditive(name, fade = 0.2) { const e = this.additive.find(x => x.name === name); if (e) { e.target = 0; e.fade = fade; } }

  /** Drive the locomotion blend (m/s). Only matters while 'locomotion' is the base. */
  setSpeed(v) { this.speed = Math.max(0, v); }

  update(dt) {
    // locomotion weights + phase-locked walk cycles
    const s = this.speed;
    const slow = sstep(0.04, LOCO.slow.speed * 0.85, s), fast = sstep(LOCO.slow.speed, LOCO.fast.speed, s);
    this.locoW.idle = 1 - slow; this.locoW.slow = slow * (1 - fast); this.locoW.fast = slow * fast;
    const stride = LOCO.slow.stride + (LOCO.fast.stride - LOCO.slow.stride) * fast;
    const prevPhase = this.phase;
    this.phase = (this.phase + (s / stride) * dt) % 1;
    const walkW = this.locoW.slow + this.locoW.fast;
    if (this.base?.name === 'locomotion' && walkW > 0.25 && s > 0.15) {
      if (prevPhase < 0.02 && this.phase >= 0.02) this._emit('step', 'locomotion', { foot: 'L', speed: s });
      if (prevPhase < 0.52 && this.phase >= 0.52) this._emit('step', 'locomotion', { foot: 'R', speed: s });
    }
    for (const slot of Object.values(this.slots)) for (const e of slot.entries) if (e.key === 'locomotion') {
      for (const it of e.actions) {
        if (it.name === LOCO.idle) it.sub = this.locoW.idle;
        else { it.sub = it.name === LOCO.slow.clip ? this.locoW.slow : this.locoW.fast; it.action.time = this.phase * this.lib[it.name].def.duration; }
      }
    }
    for (const slot of Object.values(this.slots)) { slot.update(dt); slot.apply(); }
    for (const e of this.additive) {
      e.w = e.target > e.w ? Math.min(e.target, e.w + dt / e.fade) : Math.max(e.target, e.w - dt / e.fade);
      if (!e.loop && e.action.time >= e.dur - e.fade) e.target = 0;
      e.action.setEffectiveWeight(e.w);
      if (e.w <= 0 && e.target <= 0) e.action.stop();
    }
    this.additive = this.additive.filter(e => e.w > 0 || e.target > 0);
    this.mixer.update(dt);
    this._events(this.base, 'lower');
    this._events(this.over, 'upper');
    this._blendMeta(dt);
  }

  _emit(evt, clip, data) { this.onEvent?.(evt, clip, data); }

  _events(st, layer) {
    if (!st || st.name === 'locomotion') return;
    const a = this._lead(st, layer); if (!a) return;
    const def = this.lib[st.name].def;
    const t = a.time;
    const looped = def.loop && t < st.prevT - 1e-4;
    for (const ev of def.events) {
      const hit = looped ? (ev.t > st.prevT || ev.t <= t) : (ev.t > st.prevT && ev.t <= t) || (st.prevT === 0 && ev.t === 0 && t > 0);
      if (hit) { this._emit(ev.name, st.name, ev); st.opts.onEvent?.[ev.name]?.(ev); }
    }
    st.prevT = t;
    const isLoop = st.opts.loop ?? def.loop;
    if (isLoop || st.ended) return;
    const fadeOut = st.opts.fadeOut ?? 0.25;
    const speed = Math.max(0.05, st.opts.speed ?? 1);
    if (t >= def.duration - fadeOut * speed - 1e-4) {
      st.ended = true;
      st.opts.onEnd?.(st.name);
      st.resolve(true);
      const next = st.opts.next ?? def.next;
      const hold = st.opts.hold ?? def.hold;
      if (layer === 'upper') { if (this.over === st && !hold) { if (next) this.play(next, { layer: 'upper', fade: fadeOut }); else this.stopUpper(fadeOut); } }
      else if (this.base === st) {
        if (next) this.play(next, { fade: fadeOut });
        else if (!hold) this.play(this.defaultFor(st.name), { fade: fadeOut });
      }
    }
  }

  _blendMeta(dt) {
    const M = this.meta;
    const acc = (slot, key, dflt) => { let s = 0, w = 0; for (const e of slot.entries) { const v = this._metaOf(e, key, dflt); s += v * e.w; w += e.w; } return w > 0 ? s / w : dflt; };
    const k = 1 - Math.exp(-10 * dt);
    M.footIK += (acc(this.slots.lower, 'footIK', 1) - M.footIK) * k;
    M.sit += (acc(this.slots.lower, 'sit', 0) - M.sit) * k;
    M.look += (acc(this.slots.upper, 'look', 1) - M.look) * k;
    M.breathe += (acc(this.slots.upper, 'breathe', 1) - M.breathe) * k;
    M.lean += (acc(this.slots.lower, 'lean', 1) - M.lean) * k;
    const tgt = this.slots.upper.target;
    const want = tgt ? this._metaOf(tgt, 'armIK', null) : null;
    if (want) M.armIK = want;
    let w = 0; for (const e of this.slots.upper.entries) if (this._metaOf(e, 'armIK', null) === M.armIK && M.armIK) w += e.w;
    M.armIKw = w;
    if (w < 1e-3) M.armIK = want;
  }
  _metaOf(e, key, dflt) {
    if (e.key === 'locomotion') return key === 'armIK' ? null : (key === 'sit' ? 0 : 1);
    const m = this.lib[e.key]?.def.meta || {};
    return m[key] ?? dflt;
  }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
}
