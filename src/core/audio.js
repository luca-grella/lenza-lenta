// Fully procedural WebAudio: generative cozy music per mood, ambient layers and soft synthesized SFX.
// Nothing is loaded from files. Instruments are rendered once into small AudioBuffers (Karplus-Strong
// pluck, FM electric piano, music box, glass bell) and replayed; pads/bass are live oscillators.

import { clamp } from './math.js';

const MOODS = ['day', 'dusk', 'night', 'rain', 'cave'];
const LAYERS = ['waves', 'birds', 'crickets', 'rain', 'wind', 'waterfall', 'river'];
export const SFX_NAMES = ['splash_small', 'splash_big', 'cast_whoosh', 'reel_click', 'bite', 'line_snap', 'catch_jingle',
  'rare_jingle', 'coin', 'ui_tap', 'ui_open', 'ui_close', 'footstep_sand', 'footstep_grass', 'footstep_wood', 'row',
  'pickup', 'cat_meow', 'gull', 'frog', 'door', 'eat', 'quest_done', 'page_turn'];

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PENTA_MAJ = [0, 2, 4, 7, 9];
const PENTA_MIN = [0, 3, 5, 7, 10];

// Mood recipes. prog: chord degrees (0-based in the mode), 1 chord per `barsPerChord` bars.
const RECIPES = {
  day: {
    bpm: 76, swing: 0.08, mode: MAJOR, penta: PENTA_MAJ, roots: [60, 65, 67, 62], lead: 'pluck', leadOct: 0, leadVol: 0.34,
    density: 0.5, arp: 0.5, arpInst: 'pluck', pad: 0.11, padCut: 1100, bass: 0.16, barsPerChord: 1, echo: 0.22, verb: 0.25, sparkle: 0.12,
    progs: [[0, 4, 5, 3], [0, 3, 0, 4], [5, 3, 0, 4], [0, 2, 3, 3], [3, 0, 1, 4], [0, 5, 3, 4]],
  },
  dusk: {
    bpm: 64, swing: 0.1, mode: MAJOR, penta: PENTA_MAJ, roots: [58, 63, 56, 61], lead: 'ep', leadOct: 0, leadVol: 0.3,
    density: 0.36, arp: 0.3, arpInst: 'ep', pad: 0.13, padCut: 850, bass: 0.15, barsPerChord: 2, echo: 0.25, verb: 0.33, sparkle: 0.05,
    progs: [[0, 3, 5, 4], [3, 4, 2, 5], [0, 5, 1, 4], [3, 0, 3, 4]],
  },
  night: {
    bpm: 56, swing: 0.0, mode: MAJOR, penta: PENTA_MAJ, roots: [62, 57, 64, 59], lead: 'musicbox', leadOct: 12, leadVol: 0.32,
    density: 0.26, arp: 0.15, arpInst: 'musicbox', pad: 0.14, padCut: 650, bass: 0.07, barsPerChord: 2, echo: 0.3, verb: 0.42, sparkle: 0,
    progs: [[0, 3, 0, 4], [5, 3, 0, 0], [0, 2, 3, 0], [3, 3, 0, 4]],
  },
  rain: {
    bpm: 62, swing: 0.06, mode: DORIAN, penta: PENTA_MIN, roots: [62, 57, 60], lead: 'ep', leadOct: -12, leadVol: 0.3,
    density: 0.32, arp: 0.35, arpInst: 'ep', pad: 0.12, padCut: 750, bass: 0.15, barsPerChord: 2, echo: 0.24, verb: 0.34, sparkle: 0,
    progs: [[0, 3, 0, 6], [0, 2, 3, 4], [5, 6, 0, 0], [0, 6, 3, 3]],
  },
  cave: {
    bpm: 50, swing: 0, mode: AEOLIAN, penta: PENTA_MIN, roots: [57, 52, 55], lead: 'bell', leadOct: 0, leadVol: 0.2,
    density: 0.18, arp: 0, arpInst: 'bell', pad: 0.12, padCut: 600, bass: 0.1, barsPerChord: 4, echo: 0.42, verb: 0.62, sparkle: 0,
    progs: [[0, 5, 3, 0], [0, 6, 5, 4], [0, 0, 5, 5]],
  },
};

/**
 * @param {{bus:any, save:any, getListener?:()=>({x:number,z:number}|null), getRight?:()=>({x:number,z:number})}} opts
 */
export function createAudio({ bus, save, getListener = () => null, getRight = () => ({ x: 1, z: 0 }) }) {
  const settings = save?.state?.settings || {};
  let ac = null, ready = false;
  const vol = { master: 1, music: settings.music ?? 0.7, sfx: settings.sfx ?? 0.8, ambient: 1 };
  let N = {}; // nodes
  let desiredMood = 'off', currentMood = 'off', manualMood = null;
  const ambientTarget = Object.fromEntries(LAYERS.map(l => [l, 0]));
  const ambientManual = {};
  const layers = {};
  const bufCache = new Map();
  let noise = null;
  let timer = 0;
  const lastSfx = {};

  // ------------------------------------------------------------------------------------------
  // Setup
  function build() {
    const sr = ac.sampleRate;
    N.master = ac.createGain(); N.master.gain.value = vol.master;
    N.comp = ac.createDynamicsCompressor();
    N.comp.threshold.value = -16; N.comp.knee.value = 12; N.comp.ratio.value = 3; N.comp.attack.value = 0.01; N.comp.release.value = 0.25;
    N.master.connect(N.comp).connect(ac.destination);

    N.music = ac.createGain(); N.music.gain.value = vol.music;
    N.musicFade = ac.createGain(); N.musicFade.gain.value = 0;
    N.musicIn = ac.createGain(); N.musicIn.gain.value = 0.9;
    N.musicIn.connect(N.musicFade).connect(N.music).connect(N.master);
    N.sfx = ac.createGain(); N.sfx.gain.value = vol.sfx; N.sfx.connect(N.master);
    N.amb = ac.createGain(); N.amb.gain.value = vol.sfx * vol.ambient; N.amb.connect(N.master);

    // reverb (procedural impulse response)
    N.verb = ac.createConvolver(); N.verb.buffer = impulse(3.4, 2.6);
    N.verbOut = ac.createGain(); N.verbOut.gain.value = 0.9;
    N.verb.connect(N.verbOut).connect(N.master);
    N.musicVerb = ac.createGain(); N.musicVerb.gain.value = 0.3; N.musicVerb.connect(N.verb); // fed post-fader below
    N.sfxVerbVol = ac.createGain(); N.sfxVerbVol.gain.value = vol.sfx; N.sfxVerbVol.connect(N.verb); // follows the sfx volume
    N.sfxVerb = ac.createGain(); N.sfxVerb.gain.value = 0.18; N.sfxVerb.connect(N.sfxVerbVol);
    N.leadSend = ac.createGain(); // melody voices → musicIn + echo
    N.leadSend.gain.value = 1;
    N.leadSend.connect(N.musicIn);

    // tape-ish echo for melodies
    N.echo = ac.createDelay(2); N.echo.delayTime.value = 0.6;
    N.echoFb = ac.createGain(); N.echoFb.gain.value = 0.32;
    N.echoLp = ac.createBiquadFilter(); N.echoLp.type = 'lowpass'; N.echoLp.frequency.value = 2200;
    N.echoIn = ac.createGain(); N.echoIn.gain.value = 0.22;
    N.leadSend.connect(N.echoIn).connect(N.echo).connect(N.echoLp).connect(N.echoFb).connect(N.echo);
    N.echoLp.connect(N.musicIn);
    // music reverb send taken after the fader so mood fades also fade the tail
    N.musicPostFade = ac.createGain(); N.musicPostFade.gain.value = 1;
    N.musicFade.connect(N.musicPostFade);
    N.musicPostVol = ac.createGain(); N.musicPostVol.gain.value = vol.music;
    N.musicPostFade.connect(N.musicPostVol).connect(N.musicVerb);

    // pad bus: shared warm lowpass with slow LFO
    N.padFilter = ac.createBiquadFilter(); N.padFilter.type = 'lowpass'; N.padFilter.frequency.value = 900; N.padFilter.Q.value = 0.4;
    N.padLfo = ac.createOscillator(); N.padLfo.frequency.value = 0.05;
    N.padLfoAmt = ac.createGain(); N.padLfoAmt.gain.value = 220;
    N.padLfo.connect(N.padLfoAmt).connect(N.padFilter.frequency); N.padLfo.start();
    N.padFilter.connect(N.musicIn);

    // warm periodic wave for pads (soft saw, odd-heavy)
    const n = 12, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (k % 2 ? 1 : 0.45) / Math.pow(k, 1.35);
    N.warmWave = ac.createPeriodicWave(re, im);

    noise = makeNoise(sr);
  }

  function makeNoise(sr) {
    const len = Math.floor(sr * 4);
    const mk = () => ac.createBuffer(2, len, sr);
    const white = mk(), pink = mk(), brown = mk();
    for (let ch = 0; ch < 2; ch++) {
      const w = white.getChannelData(ch), p = pink.getChannelData(ch), b = brown.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const x = Math.random() * 2 - 1;
        w[i] = x * 0.5;
        b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
        b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
        p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
        last = (last + 0.02 * x) / 1.02; b[i] = last * 3.5;
      }
      // crossfade the loop seam
      const f = Math.floor(sr * 0.05);
      for (const d of [w, p, b]) for (let i = 0; i < f; i++) { const t = i / f; d[i] = d[i] * t + d[len - f + i] * (1 - t); }
    }
    return { white, pink, brown };
  }

  function impulse(seconds, decay) {
    const sr = ac.sampleRate, len = Math.floor(sr * seconds);
    const buf = ac.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const pre = t < 0.012 ? 0 : 1;
        // darker as it decays (one-pole lowpass whose coefficient grows with t)
        const a = 0.25 + 0.7 * Math.min(1, t / seconds);
        lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
        d[i] = pre * lp * Math.pow(1 - t / seconds, decay) * 0.9;
      }
    }
    return buf;
  }

  // ------------------------------------------------------------------------------------------
  // Instrument buffers (rendered once per note and cached)
  function getBuf(inst, midi) {
    const key = inst + midi;
    let b = bufCache.get(key);
    if (b) return b;
    const sr = ac.sampleRate, f = mtof(midi);
    if (inst === 'pluck') b = renderPluck(sr, f);
    else if (inst === 'ep') b = renderAdditive(sr, f, 'ep');
    else if (inst === 'musicbox') b = renderAdditive(sr, f, 'musicbox');
    else b = renderAdditive(sr, f, 'bell');
    bufCache.set(key, b);
    return b;
  }

  function renderPluck(sr, f) {
    // Karplus-Strong with soft excitation and a fractional-delay allpass for exact tuning.
    const dur = 2.6, len = Math.floor(sr * dur);
    const buf = ac.createBuffer(1, len, sr), out = buf.getChannelData(0);
    const period = sr / f - 0.5;
    const L = Math.max(2, Math.floor(period)), frac = period - L;
    const C = (1 - frac) / (1 + frac);
    const line = new Float32Array(L);
    let lp = 0;
    for (let i = 0; i < L; i++) { lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45; line[i] = lp; }
    const loss = Math.pow(0.5, 1 / (f * 1.9)) ; // ~ T60 shrinking with pitch
    let idx = 0, prev = 0, apX = 0, apY = 0, body = 0, dc = 0, dcPrev = 0;
    for (let n = 0; n < len; n++) {
      const cur = line[idx];
      const avg = 0.5 * (cur + prev); prev = cur;
      const ap = C * avg + apX - C * apY; apX = avg; apY = ap;
      line[idx] = ap * loss * 0.999;
      idx = (idx + 1) % L;
      body = body * 0.6 + cur * 0.4; // warm it up
      const y = body - dcPrev + 0.995 * dc; dcPrev = body; dc = y;
      const att = n < 64 ? n / 64 : 1;
      out[n] = y * att * 0.8;
    }
    fadeTail(out, sr);
    return buf;
  }

  // Partial = [frequency ratio, amplitude, decay rate]. Uses recursive phasors/decays (no per-sample sin/exp)
  // so a note renders in ~1 ms even on phones.
  function addPartial(out, sr, fr, amp, k) {
    if (fr > sr * 0.45) return;
    const w = (2 * Math.PI * fr) / sr, c = Math.cos(w), sn = Math.sin(w), dec = Math.exp(-k / sr);
    let x = 0, y = 1, e = amp; // (x,y) rotates; output x = sin(phase)
    for (let n = 0; n < out.length && e > 1e-5; n++) {
      out[n] += x * e;
      const nx = x * c + y * sn; y = y * c - x * sn; x = nx;
      e *= dec;
    }
  }

  function renderAdditive(sr, f, kind) {
    const dur = kind === 'bell' ? 3.2 : kind === 'ep' ? 2.8 : 2.4;
    const len = Math.floor(sr * dur);
    const buf = ac.createBuffer(1, len, sr), out = buf.getChannelData(0);
    if (kind === 'ep') {
      // FM electric piano: carrier f, modulator f with a decaying index; soft "tine" overtone
      const TAU = Math.PI * 2, w = TAU * f / sr;
      let idx = 1.1, env = 0.75, mx = 0, my = 1;
      const mc = Math.cos(w * 1.0004), ms = Math.sin(w * 1.0004);
      const dIdx = Math.exp(-3.2 / sr), dEnv = Math.exp(-(0.9 + f / 1400) / sr);
      let ph = 0;
      for (let n = 0; n < len; n++) {
        const nx = mx * mc + my * ms; my = my * mc - mx * ms; mx = nx; // modulator sine
        ph += w;
        out[n] = Math.sin(ph + mx * (idx + 0.12)) * env;
        idx *= dIdx; env *= dEnv;
      }
      addPartial(out, sr, f * 2, 0.06, 4);
      addPartial(out, sr, f * 7.02, 0.035, 28);
    } else {
      const parts = kind === 'musicbox'
        ? [[1, 1, 1.5], [2, 0.16, 4.5], [3.0, 0.05, 6], [4.2, 0.06, 9], [5.4, 0.035, 14]]
        : [[1, 1, 0.55], [2.0, 0.3, 1.2], [2.76, 0.22, 1.6], [5.4, 0.1, 3.5], [8.93, 0.05, 6]];
      for (const [r, a, d] of parts) addPartial(out, sr, f * r * (1 + (Math.random() - 0.5) * 0.0015), a * 0.55, d * (1 + f / 2000));
    }
    const att = Math.floor(sr * (kind === 'ep' ? 0.004 : 0.002));
    for (let n = 0; n < att; n++) out[n] *= n / att;
    fadeTail(out, sr);
    return buf;
  }

  /** Render buffers ahead of time in small idle chunks so the first notes of a mood never hiccup. */
  function prewarm(inst, midis) {
    let i = 0;
    const next = () => { if (i >= midis.length || !ac) return; getBuf(inst, midis[i++]); setTimeout(next, 16); };
    setTimeout(next, 0);
  }

  function fadeTail(d, sr) { const f = Math.floor(sr * 0.08); for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f; }

  // ------------------------------------------------------------------------------------------
  // Voices
  function panner(p) {
    if (ac.createStereoPanner) { const s = ac.createStereoPanner(); s.pan.value = clamp(p, -1, 1); return s; }
    return ac.createGain();
  }
  function playBuf(buf, when, { rate = 1, gain = 0.3, pan = 0, dest, verb = 0, release = 0, dur = 0 } = {}) {
    const src = ac.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = ac.createGain(); g.gain.value = gain;
    const p = panner(pan);
    src.connect(g).connect(p).connect(dest);
    // music voices get reverb post-fader on the whole mix; only sfx voices use a per-voice send
    if (verb > 0 && dest !== N.leadSend && dest !== N.musicIn) { const s = ac.createGain(); s.gain.value = verb; p.connect(s).connect(N.sfxVerb); }
    src.start(when);
    const end = when + buf.duration / rate;
    if (dur > 0 && release > 0) { g.gain.setValueAtTime(gain, when + dur); g.gain.setTargetAtTime(0, when + dur, release / 3); src.stop(Math.min(end, when + dur + release * 2)); }
    else src.stop(end);
    return src;
  }
  function note(inst, midi, when, gain, opts = {}) {
    // pick a cached buffer near the note (pluck renders exact pitch; reuse within ±0)
    const buf = getBuf(inst, midi);
    return playBuf(buf, when, { gain, ...opts });
  }

  function padChord(midis, when, dur, level, cut) {
    const atk = Math.min(2.5, dur * 0.4), rel = 2.8;
    N.padFilter.frequency.setTargetAtTime(cut, when, 2);
    for (const m of midis) {
      const g = ac.createGain(); g.gain.value = 0;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(level / midis.length, when + atk);
      g.gain.setValueAtTime(level / midis.length, when + dur);
      g.gain.setTargetAtTime(0, when + dur, rel / 3);
      g.connect(N.padFilter);
      for (const d of [-6, 6]) {
        const o = ac.createOscillator();
        o.setPeriodicWave(N.warmWave);
        o.frequency.value = mtof(m); o.detune.value = d + (Math.random() - 0.5) * 3;
        o.connect(g); o.start(when); o.stop(when + dur + rel * 2);
      }
    }
  }

  function bassNote(midi, when, dur, level) {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi);
    const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = mtof(midi);
    const g = ac.createGain(); g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + 0.04);
    g.gain.setTargetAtTime(level * 0.55, when + 0.05, 0.4);
    g.gain.setTargetAtTime(0, when + dur, 0.25);
    const g2 = ac.createGain(); g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2).connect(g); g.connect(N.musicIn);
    o.start(when); o2.start(when); o.stop(when + dur + 1.5); o2.stop(when + dur + 1.5);
  }

  // ------------------------------------------------------------------------------------------
  // Generative music
  const M = { recipe: null, mood: 'off', nextTime: 0, step: 0, stepDur: 0.2, rootIdx: 0, root: 60, prog: [], section: null, sectionBars: 0, phrase: null, motif: null, rnd: Math.random, pitchIdx: 7 };

  function startMood(mood, at) {
    const R = RECIPES[mood];
    M.recipe = R; M.mood = mood;
    M.stepDur = 60 / R.bpm / 2; // eighth notes
    M.step = 0; M.nextTime = at;
    M.rootIdx = Math.floor(Math.random() * R.roots.length); M.root = R.roots[M.rootIdx];
    M.motif = null; M.pitchIdx = 7;
    const warm = [];
    for (const r of R.roots) for (let m = r - 14 + R.leadOct; m <= r + 28 + R.leadOct; m++) warm.push(m);
    prewarm(R.lead, [...new Set(warm)]);
    if (R.arpInst !== R.lead) prewarm(R.arpInst, [...new Set(warm.map(m => m - 12))]);
    N.echo.delayTime.setTargetAtTime(M.stepDur * 3, at, 0.1); // dotted-quarter echo
    N.echoIn.gain.setTargetAtTime(R.echo, at, 0.5);
    N.echoFb.gain.setTargetAtTime(mood === 'cave' ? 0.45 : 0.3, at, 0.5);
    newSection();
  }

  function newSection() {
    const R = M.recipe;
    const r = Math.random();
    // form: mostly full, sometimes sparse or a "breath" of pads only
    const kind = M.section === null ? (Math.random() < 0.5 ? 'sparse' : 'full') : r < 0.55 ? 'full' : r < 0.85 ? 'sparse' : 'breath';
    M.section = kind; M.sectionBars = 16;
    M.prog = R.progs[Math.floor(Math.random() * R.progs.length)];
    // occasional key change between sections (a fourth/fifth away within the recipe's roots)
    if (Math.random() < 0.3) { M.rootIdx = (M.rootIdx + 1) % R.roots.length; M.root = R.roots[M.rootIdx]; }
    M.sectionStart = M.step;
  }

  function chordAtBar(bar) {
    const R = M.recipe;
    const deg = M.prog[Math.floor(bar / R.barsPerChord) % M.prog.length];
    const mode = R.mode;
    const tone = k => { const d = deg + k; return M.root + mode[d % 7] + 12 * Math.floor(d / 7); };
    return { deg, tones: [tone(0), tone(2), tone(4)], color: tone(6), ninth: tone(8) };
  }

  function pentaPool() {
    // two octaves of the pentatonic around the lead register
    const R = M.recipe, pool = [];
    const base = M.root - 12 + R.leadOct;
    for (let o = 0; o < 3; o++) for (const s of R.penta) pool.push(base + 12 * o + s);
    return pool.filter(m => m >= 55 + R.leadOct && m <= 86 + R.leadOct);
  }

  function makePhrase(barInSection) {
    // 4-bar phrase. Rhythm motif of bar 1 repeats in bar 3, bar 4 cadences.
    const R = M.recipe, pool = pentaPool();
    const density = R.density * (M.section === 'sparse' ? 0.5 : M.section === 'breath' ? 0 : 1);
    const notes = [];
    if (density <= 0) return notes;
    const mkRhythm = (n) => {
      const weights = [1, 0.25, 0.6, 0.3, 0.85, 0.25, 0.55, 0.35];
      const steps = [];
      for (let s = 0; s < 8; s++) if (Math.random() < weights[s] * n) steps.push(s);
      if (!steps.length) steps.push(0);
      return steps;
    };
    const reuse = M.motif && Math.random() < 0.55;
    const rA = reuse ? M.motif.rA : mkRhythm(density * 1.4), rB = mkRhythm(density * 1.4);
    const contour = reuse ? M.motif.contour : [];
    let ci = 0;
    for (let b = 0; b < 4; b++) {
      const rhythm = b === 3 ? [0, Math.random() < 0.5 ? 4 : 2].slice(0, density > 0.4 ? 2 : 1) : (b % 2 === 0 ? rA : rB);
      const chord = chordAtBar(barInSection + b);
      const chordPcs = chord.tones.map(m => ((m % 12) + 12) % 12);
      for (let k = 0; k < rhythm.length; k++) {
        const s = rhythm[k];
        // pitch motion: stepwise walk with occasional leaps, pulled toward the middle
        let move;
        if (contour.length && ci < contour.length) move = contour[ci];
        else { const r = Math.random(); move = r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.8 ? 2 : r < 0.9 ? -2 : r < 0.95 ? 0 : (Math.random() < 0.5 ? 3 : -3); }
        if (!reuse) contour.push(move);
        ci++;
        M.pitchIdx = clamp(M.pitchIdx + move, 0, pool.length - 1);
        if (M.pitchIdx > pool.length - 3 && move > 0) M.pitchIdx -= 2;
        if (M.pitchIdx < 2 && move < 0) M.pitchIdx += 2;
        let midi = pool[M.pitchIdx];
        const strong = s === 0 || s === 4 || b === 3;
        if (strong) {
          // snap to nearest chord tone on strong beats
          let best = midi, bd = 99;
          for (let d = -3; d <= 3; d++) { const pc = (((midi + d) % 12) + 12) % 12; if (chordPcs.includes(pc) && Math.abs(d) < bd) { bd = Math.abs(d); best = midi + d; } }
          midi = best;
        }
        const next = rhythm[k + 1] ?? 8;
        const len = (next - s) * M.stepDur;
        notes.push({ step: b * 8 + s, midi, vel: (strong ? 1 : 0.78) * (0.85 + Math.random() * 0.15), len: b === 3 ? len * 2 : len });
      }
    }
    if (!reuse) M.motif = { rA, contour };
    // occasional rest phrase so the music breathes
    if (Math.random() < 0.18) return notes.filter((n, i) => i < 2);
    return notes;
  }

  function scheduleMusic(until) {
    if (!M.recipe) return;
    const R = M.recipe;
    // after a long main-thread stall, skip missed steps instead of firing them all at once
    const now = ac.currentTime;
    while (M.nextTime < now - 0.1) { M.step++; M.nextTime += M.stepDur; }
    while (M.nextTime < until) {
      const t = M.nextTime, s = M.step;
      const local = s - M.sectionStart;
      const bar = Math.floor(local / 8), stepInBar = local % 8;
      if (local >= M.sectionBars * 8) { newSection(); continue; }
      const swingOff = (stepInBar % 2 === 1) ? R.swing * M.stepDur : 0;
      const when = t + swingOff + (Math.random() - 0.5) * 0.012;
      if (stepInBar === 0) {
        const chord = chordAtBar(bar);
        if (bar % R.barsPerChord === 0) {
          const voicing = [chord.tones[0] - 12, chord.tones[1] - 12, chord.tones[2] - 12];
          if (Math.random() < 0.6) voicing.push(chord.ninth - 12);
          const padLvl = R.pad * (M.section === 'breath' ? 1.2 : 1);
          padChord(voicing, t, M.stepDur * 8 * R.barsPerChord, padLvl, R.padCut);
          if (M.section !== 'breath' && R.bass > 0) bassNote(chord.tones[0] - 24, t, M.stepDur * 8 * R.barsPerChord * 0.9, R.bass);
        } else if (R.bass > 0 && M.section === 'full' && Math.random() < 0.5) bassNote(chord.tones[0] - 24, t, M.stepDur * 6, R.bass * 0.7);
        if (bar % 4 === 0) M.phrase = makePhrase(bar);
      }
      // melody
      if (M.phrase) {
        const pStep = (bar % 4) * 8 + stepInBar;
        for (const n of M.phrase) if (n.step === pStep) {
          note(R.lead, n.midi, when, R.leadVol * n.vel, { dest: N.leadSend, pan: (Math.random() - 0.5) * 0.4, verb: 0.6, dur: Math.max(0.3, n.len * 1.4), release: 1.2 });
          if (R.sparkle && Math.random() < R.sparkle) note('bell', n.midi + 12, when + 0.005, R.leadVol * 0.18, { dest: N.leadSend, pan: 0.3, verb: 1 });
        }
      }
      // arpeggio (soft, lower register) in full sections
      if (R.arp > 0 && M.section === 'full' && stepInBar % 2 === 0 && Math.random() < R.arp) {
        const chord = chordAtBar(bar);
        const m = chord.tones[(stepInBar / 2) % 3] - 12 + (R.lead === 'musicbox' ? 12 : 0);
        note(R.arpInst, m, when, R.leadVol * 0.32, { dest: N.musicIn, pan: (stepInBar / 4 - 0.75) * 0.6, verb: 0.5, dur: M.stepDur * 2.5, release: 0.8 });
      }
      M.step++; M.nextTime += M.stepDur;
    }
  }

  function applyMood() {
    if (!ready) return;
    const want = manualMood || desiredMood;
    if (want === currentMood) return;
    const now = ac.currentTime;
    const fadeOut = currentMood === 'off' ? 0.05 : 2.8;
    N.musicFade.gain.cancelScheduledValues(now);
    N.musicFade.gain.setValueAtTime(N.musicFade.gain.value, now);
    N.musicFade.gain.linearRampToValueAtTime(0, now + fadeOut);
    currentMood = want;
    const verb = RECIPES[want]?.verb;
    if (verb !== undefined) N.musicVerb.gain.setTargetAtTime(verb, now + fadeOut, 1);
    if (want === 'off') { M.recipe = null; return; }
    const start = now + fadeOut + 0.4;
    M.recipe = null;
    pendingStart = { mood: want, at: start };
    N.musicFade.gain.setValueAtTime(0, start);
    N.musicFade.gain.linearRampToValueAtTime(1, start + 5);
  }
  let pendingStart = null;

  // ------------------------------------------------------------------------------------------
  // Ambient layers
  function noiseSrc(type, dest, rate = 1) {
    const s = ac.createBufferSource(); s.buffer = noise[type]; s.loop = true; s.playbackRate.value = rate;
    s.connect(dest); s.start(ac.currentTime, Math.random() * 3.5); return s;
  }
  const filt = (type, f, q = 0.7) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

  const LAYER_DEFS = {
    waves: {
      base: 0.4,
      build(out) {
        const L = { srcs: [], parts: [] };
        for (const side of [-0.6, 0.6]) {
          const lp = filt('lowpass', 500, 0.5), g = ac.createGain(); g.gain.value = 0.2;
          const p = panner(side);
          L.srcs.push(noiseSrc(side < 0 ? 'brown' : 'pink', lp));
          lp.connect(g).connect(p).connect(out);
          L.parts.push({ lp, g, next: ac.currentTime + Math.random() * 3 });
        }
        const rumble = filt('lowpass', 180), rg = ac.createGain(); rg.gain.value = 0.35;
        L.srcs.push(noiseSrc('brown', rumble)); rumble.connect(rg).connect(out);
        return L;
      },
      tick(L, now) {
        for (const part of L.parts) {
          if (now < part.next - 0.3) continue;
          // one wave: rise, crest (filter opens), long wash
          const t0 = Math.max(now, part.next), rise = 2 + Math.random() * 2, fall = 3 + Math.random() * 3, peak = 0.45 + Math.random() * 0.5;
          part.g.gain.setTargetAtTime(peak, t0, rise / 3);
          part.lp.frequency.setTargetAtTime(900 + Math.random() * 900, t0, rise / 3);
          part.g.gain.setTargetAtTime(0.12, t0 + rise, fall / 3);
          part.lp.frequency.setTargetAtTime(380, t0 + rise, fall / 2.5);
          part.next = t0 + rise + fall * (0.7 + Math.random() * 0.5);
        }
      },
    },
    wind: {
      base: 0.4,
      build(out) {
        const bp = filt('bandpass', 420, 0.6), g = ac.createGain(); g.gain.value = 0.3;
        const whistle = filt('bandpass', 900, 9), wg = ac.createGain(); wg.gain.value = 0.05;
        const L = { srcs: [noiseSrc('brown', bp), noiseSrc('pink', whistle)], bp, g, whistle, next: 0 };
        bp.connect(g).connect(out); whistle.connect(wg).connect(g);
        return L;
      },
      tick(L, now) {
        if (now < L.next) return;
        const d = 2.5 + Math.random() * 4;
        L.g.gain.setTargetAtTime(0.15 + Math.random() * 0.6, now, d / 3);
        L.bp.frequency.setTargetAtTime(280 + Math.random() * 500, now, d / 2);
        L.whistle.frequency.setTargetAtTime(700 + Math.random() * 600, now, d / 2);
        L.next = now + d;
      },
    },
    rain: {
      base: 0.5,
      build(out) {
        const hp = filt('highpass', 500), lp = filt('lowpass', 7000), g = ac.createGain(); g.gain.value = 0.45;
        const L = { srcs: [noiseSrc('pink', hp)] };
        hp.connect(lp).connect(g).connect(out);
        // droplets: pre-rendered patter loop
        const s = ac.createBufferSource(); s.buffer = patterBuffer(); s.loop = true;
        const pg = ac.createGain(); pg.gain.value = 0.5; s.connect(pg).connect(out); s.start();
        L.srcs.push(s);
        const low = filt('lowpass', 300), lg = ac.createGain(); lg.gain.value = 0.25;
        L.srcs.push(noiseSrc('brown', low)); low.connect(lg).connect(out);
        return L;
      },
    },
    waterfall: {
      base: 0.55,
      build(out) {
        const lp = filt('lowpass', 2400, 0.4), g = ac.createGain(); g.gain.value = 0.5;
        const low = filt('lowpass', 220), lg = ac.createGain(); lg.gain.value = 0.6;
        const L = { srcs: [noiseSrc('pink', lp), noiseSrc('brown', low)] };
        lp.connect(g).connect(out); low.connect(lg).connect(out);
        return L;
      },
    },
    river: {
      base: 0.45,
      build(out) {
        const bp = filt('bandpass', 1000, 1.8), g = ac.createGain(); g.gain.value = 0.55;
        const bp2 = filt('bandpass', 1600, 2.5), g2 = ac.createGain(); g2.gain.value = 0.35;
        const base = filt('bandpass', 600, 0.5), bg = ac.createGain(); bg.gain.value = 0.25;
        const L = { srcs: [noiseSrc('white', bp), noiseSrc('white', bp2), noiseSrc('pink', base)], bp, bp2, next: 0 };
        bp.connect(g).connect(out); bp2.connect(g2).connect(out); base.connect(bg).connect(out);
        return L;
      },
      tick(L, now) {
        if (now < L.next) return;
        // babbling: jitter resonances quickly
        L.bp.frequency.setTargetAtTime(500 + Math.random() * 1300, now, 0.04);
        L.bp2.frequency.setTargetAtTime(1100 + Math.random() * 1800, now, 0.05);
        L.next = now + 0.06 + Math.random() * 0.09;
      },
    },
    birds: {
      base: 0.5,
      build(out) { return { srcs: [], out, next: ac.currentTime + 1 }; },
      tick(L, now) {
        if (now < L.next) return;
        birdCall(L.out, now + 0.05);
        L.next = now + 0.8 + Math.random() * Math.random() * 6;
      },
    },
    crickets: {
      base: 0.5,
      build(out) {
        const L = { srcs: [] };
        for (let i = 0; i < 4; i++) {
          const s = ac.createBufferSource(); s.buffer = cricketBuffer(4300 + i * 260 + Math.random() * 200, 0.45 + Math.random() * 0.5);
          s.loop = true; s.playbackRate.value = 0.97 + Math.random() * 0.06;
          const g = ac.createGain(); g.gain.value = 0.18 + Math.random() * 0.1;
          const p = panner((i / 3) * 1.6 - 0.8);
          s.connect(g).connect(p).connect(out); s.start(ac.currentTime + Math.random() * 2);
          L.srcs.push(s);
        }
        // distant soft frog chorus under the crickets
        const s = ac.createBufferSource(); s.buffer = frogChorusBuffer(); s.loop = true;
        const g = ac.createGain(); g.gain.value = 0.22; s.connect(g).connect(out); s.start();
        L.srcs.push(s);
        return L;
      },
    },
  };

  function patterBuffer() {
    if (patterBuffer.b) return patterBuffer.b;
    const sr = ac.sampleRate, len = sr * 3, b = ac.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let k = 0; k < 520; k++) {
        const at = Math.floor(Math.random() * (len - sr * 0.03)), f = 1800 + Math.random() * 5000, a = 0.05 + Math.random() * 0.12;
        const n = Math.floor(sr * 0.012);
        for (let i = 0; i < n; i++) d[at + i] += Math.sin((2 * Math.PI * f * i) / sr) * a * Math.exp(-i / (n / 5));
      }
    }
    return (patterBuffer.b = b);
  }

  function cricketBuffer(freq, period) {
    const sr = ac.sampleRate, len = Math.floor(sr * period * 4), b = ac.createBuffer(1, len, sr), d = b.getChannelData(0);
    const pulses = 3 + Math.floor(Math.random() * 2), pulseLen = 0.016, gap = 0.026;
    for (let c = 0; c < 4; c++) {
      if (Math.random() < 0.15) continue; // skip a chirp now and then
      const start = Math.floor((c * period + Math.random() * 0.03) * sr);
      for (let p = 0; p < pulses; p++) {
        const s0 = start + Math.floor(p * (pulseLen + gap) * sr), n = Math.floor(pulseLen * sr);
        for (let i = 0; i < n && s0 + i < len; i++) { const env = Math.sin((Math.PI * i) / n); d[s0 + i] += Math.sin((2 * Math.PI * freq * i) / sr) * env * 0.5; }
      }
    }
    return b;
  }

  function frogChorusBuffer() {
    if (frogChorusBuffer.b) return frogChorusBuffer.b;
    const sr = ac.sampleRate, len = sr * 6, b = ac.createBuffer(1, len, sr), d = b.getChannelData(0);
    for (let k = 0; k < 9; k++) {
      const at = Math.floor(Math.random() * (len - sr * 0.4)), f0 = 180 + Math.random() * 160, a = 0.06 + Math.random() * 0.05;
      const n = Math.floor(sr * (0.15 + Math.random() * 0.12));
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.sin(Math.PI * i / n);
        const pulse = 0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * 30 * t));
        d[at + i] += Math.sin(2 * Math.PI * f0 * t + 2 * Math.sin(2 * Math.PI * f0 * 2 * t)) * env * pulse * a;
      }
    }
    return (frogChorusBuffer.b = b);
  }

  function birdCall(out, when) {
    const type = Math.random();
    const pan = (Math.random() - 0.5) * 1.6;
    const p = panner(pan); const g = ac.createGain(); g.gain.value = 0.12 + Math.random() * 0.1;
    const bp = filt('bandpass', 4000, 0.8);
    p.connect(out); g.connect(bp).connect(p);
    const vs = ac.createGain(); vs.gain.value = 0.35; p.connect(vs).connect(N.sfxVerb);
    const chirp = (t, f0, f1, d, a = 1) => {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      const e = ac.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(a, t + d * 0.15); e.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(e).connect(g); o.start(t); o.stop(t + d + 0.02);
    };
    if (type < 0.35) { // tweet-tweet
      const n = 2 + Math.floor(Math.random() * 3), f = 3000 + Math.random() * 1500;
      for (let i = 0; i < n; i++) chirp(when + i * 0.13, f, f * 1.45, 0.07);
    } else if (type < 0.6) { // two-note whistle "fee-bee"
      const f = 3400 + Math.random() * 800;
      chirp(when, f, f * 1.02, 0.22, 0.8); chirp(when + 0.3, f * 0.84, f * 0.8, 0.26, 0.8);
    } else if (type < 0.85) { // warble
      const f = 3600 + Math.random() * 1200;
      for (let i = 0; i < 7; i++) chirp(when + i * 0.055, f * (1 + 0.15 * Math.sin(i * 2.1)), f * (1.1 + 0.12 * Math.cos(i * 1.7)), 0.05, 0.7);
    } else { // soft dove coo, low
      bp.frequency.value = 600; bp.Q.value = 1;
      chirp(when, 520, 470, 0.35, 0.9); chirp(when + 0.5, 560, 480, 0.5, 0.9);
    }
  }

  function ensureLayer(name) {
    if (layers[name]) return layers[name];
    const def = LAYER_DEFS[name];
    const out = ac.createGain(); out.gain.value = 0; out.connect(N.amb);
    const L = def.build(out);
    L.out = L.out || out; L.gain = out; L.def = def; L.zeroSince = 0;
    layers[name] = L;
    return L;
  }

  function applyAmbient(name) {
    if (!ready) return;
    const v = clamp(ambientTarget[name] || 0, 0, 1);
    if (v <= 0 && !layers[name]) return;
    const L = ensureLayer(name);
    L.gain.gain.setTargetAtTime(v * L.def.base, ac.currentTime, 1.4);
    if (v > 0) L.zeroSince = 0;
  }

  // ------------------------------------------------------------------------------------------
  // SFX (each builds a tiny node graph and lets it die)
  function env(g, t, a, peak, d, sustain = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(sustain, t + a, d / 3);
  }
  function osc(type, f, t, dur, dest, gain = 0.3, a = 0.005, glideTo = 0) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ac.createGain(); env(g, t, a, gain, dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur * 2.5 + 0.1);
    return o;
  }
  function noiseBurst(t, dur, dest, { type = 'bandpass', f = 1000, f2 = 0, q = 0.8, gain = 0.3, a = 0.005, color = 'white' } = {}) {
    const s = ac.createBufferSource(); s.buffer = noise[color];
    const b = filt(type, f, q); if (f2) b.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ac.createGain(); env(g, t, a, gain, dur);
    s.connect(b).connect(g).connect(dest); s.start(t, Math.random() * 3); s.stop(t + dur * 2.5 + 0.1);
  }
  function bubbles(t, n, dest, gain = 0.1) {
    for (let i = 0; i < n; i++) { const tt = t + 0.04 + Math.random() * 0.25; const f = 500 + Math.random() * 700; osc('sine', f, tt, 0.05, dest, gain * (0.5 + Math.random() * 0.5), 0.003, f * 2.2); }
  }
  function bells(notes, t, dest, gain = 0.25, gap = 0.09, inst = 'musicbox') {
    notes.forEach((m, i) => playBuf(getBuf(inst, m), t + i * gap, { gain, dest, verb: 0.5, pan: (i / Math.max(1, notes.length - 1) - 0.5) * 0.5 }));
  }

  const SFX = {
    splash_small(t, o) { noiseBurst(t, 0.22, o, { type: 'lowpass', f: 2200, f2: 500, gain: 0.32, color: 'pink' }); osc('sine', 900, t, 0.06, o, 0.12, 0.002, 280); bubbles(t, 3, o); },
    splash_big(t, o) { noiseBurst(t, 0.5, o, { type: 'lowpass', f: 3200, f2: 380, gain: 0.45, color: 'pink', a: 0.01 }); osc('sine', 140, t, 0.25, o, 0.3, 0.004, 60); bubbles(t + 0.1, 7, o, 0.12); },
    cast_whoosh(t, o) { noiseBurst(t, 0.32, o, { type: 'bandpass', f: 500, f2: 2600, q: 1.4, gain: 0.6, a: 0.12, color: 'pink' }); },
    reel_click(t, o, pitch) { noiseBurst(t, 0.012, o, { type: 'highpass', f: 3500, gain: 0.08 }); osc('triangle', 2100 * pitch, t, 0.012, o, 0.035, 0.001); },
    bite(t, o) { osc('sine', 760, t, 0.09, o, 0.3, 0.002, 220); osc('sine', 640, t + 0.12, 0.09, o, 0.25, 0.002, 200); playBuf(getBuf('bell', 88), t + 0.02, { gain: 0.12, dest: o, verb: 0.4 }); bubbles(t, 2, o); },
    line_snap(t, o) { playBuf(getBuf('pluck', 79), t, { gain: 0.35, dest: o, rate: 1 }); osc('triangle', 900, t, 0.25, o, 0.07, 0.002, 160); noiseBurst(t, 0.05, o, { type: 'highpass', f: 2500, gain: 0.1 }); },
    catch_jingle(t, o) { bells([72, 76, 79, 84], t, o, 0.24, 0.09); bells([88], t + 0.4, o, 0.16, 0, 'bell'); },
    rare_jingle(t, o) {
      bells([72, 76, 79, 84, 88, 91], t, o, 0.24, 0.085);
      bells([96, 100, 103], t + 0.62, o, 0.1, 0.06, 'bell');
      for (const m of [60, 64, 67, 72]) { const g = ac.createGain(); g.connect(o); const oo = ac.createOscillator(); oo.setPeriodicWave(N.warmWave); oo.frequency.value = mtof(m); oo.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.04, t + 0.5); g.gain.setTargetAtTime(0, t + 1.2, 0.5); oo.start(t); oo.stop(t + 3.5); }
    },
    coin(t, o) { bells([83], t, o, 0.2, 0, 'bell'); bells([88], t + 0.07, o, 0.2, 0, 'bell'); },
    ui_tap(t, o) { osc('sine', 880, t, 0.04, o, 0.055, 0.002, 620); noiseBurst(t, 0.01, o, { type: 'bandpass', f: 2500, gain: 0.03 }); },
    ui_open(t, o) { osc('sine', 520, t, 0.09, o, 0.12, 0.004, 880); osc('sine', 780, t + 0.06, 0.1, o, 0.08, 0.004, 1180); },
    ui_close(t, o) { osc('sine', 820, t, 0.09, o, 0.1, 0.004, 480); },
    footstep_sand(t, o, p) { noiseBurst(t, 0.08 + Math.random() * 0.03, o, { type: 'lowpass', f: 900 * p + Math.random() * 400, gain: 0.13, a: 0.012, color: 'pink' }); },
    footstep_grass(t, o, p) { noiseBurst(t, 0.07, o, { type: 'bandpass', f: 2200 * p + Math.random() * 600, q: 0.9, gain: 0.11, a: 0.01, color: 'pink' }); },
    footstep_wood(t, o, p) { osc('sine', 170 * p, t, 0.07, o, 0.09, 0.002, 120); osc('triangle', 340 * p, t, 0.04, o, 0.03, 0.002); noiseBurst(t, 0.02, o, { type: 'bandpass', f: 1500, gain: 0.04 }); },
    row(t, o) { noiseBurst(t, 0.45, o, { type: 'bandpass', f: 380, f2: 1300, q: 1.2, gain: 0.25, a: 0.12, color: 'pink' }); bubbles(t + 0.25, 3, o, 0.07); },
    pickup(t, o) { osc('sine', 400, t, 0.06, o, 0.16, 0.003, 900); bells([84, 91], t + 0.05, o, 0.13, 0.07); },
    cat_meow(t, o, p) {
      const src = ac.createOscillator(); src.type = 'sawtooth';
      const f = 520 * p;
      src.frequency.setValueAtTime(f * 0.9, t); src.frequency.linearRampToValueAtTime(f * 1.35, t + 0.18); src.frequency.linearRampToValueAtTime(f * 0.85, t + 0.55);
      const f1 = filt('bandpass', 700, 4), f2 = filt('bandpass', 1800, 6);
      f1.frequency.setValueAtTime(500, t); f1.frequency.linearRampToValueAtTime(950, t + 0.2); f1.frequency.linearRampToValueAtTime(650, t + 0.55);
      f2.frequency.setValueAtTime(1500, t); f2.frequency.linearRampToValueAtTime(2300, t + 0.25); f2.frequency.linearRampToValueAtTime(1100, t + 0.55);
      const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 0.08); g.gain.setValueAtTime(0.3, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 0.6);
      const mix = ac.createGain(); mix.gain.value = 1;
      src.connect(f1).connect(mix); src.connect(f2).connect(mix); mix.connect(g).connect(o);
      src.start(t); src.stop(t + 0.65);
    },
    gull(t, o) {
      for (let k = 0; k < 3; k++) {
        const tt = t + k * 0.26, src = ac.createOscillator(); src.type = 'sawtooth';
        const f = 1150 + Math.random() * 150;
        src.frequency.setValueAtTime(f * 0.8, tt); src.frequency.linearRampToValueAtTime(f * 1.25, tt + 0.06); src.frequency.linearRampToValueAtTime(f * 0.9, tt + 0.2);
        const bp = filt('bandpass', 2200, 3); const g = ac.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.32 * (1 - k * 0.2), tt + 0.03); g.gain.linearRampToValueAtTime(0, tt + 0.22);
        src.connect(bp).connect(g).connect(o); src.start(tt); src.stop(tt + 0.25);
      }
    },
    frog(t, o, p) {
      for (const [dt, d] of [[0, 0.09], [0.14, 0.13]]) {
        const tt = t + dt, src = ac.createOscillator(); src.type = 'square'; src.frequency.value = 95 * p;
        const am = ac.createOscillator(); am.frequency.value = 38; const amg = ac.createGain(); amg.gain.value = 0.5; am.connect(amg);
        const bp = filt('bandpass', 650 * p, 3); const g = ac.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.14, tt + 0.015); g.gain.linearRampToValueAtTime(0, tt + d);
        amg.connect(g.gain);
        src.connect(bp).connect(g).connect(o); src.start(tt); am.start(tt); src.stop(tt + d + 0.02); am.stop(tt + d + 0.02);
      }
    },
    door(t, o) {
      const src = ac.createOscillator(); src.type = 'sawtooth'; src.frequency.setValueAtTime(70, t); src.frequency.linearRampToValueAtTime(130, t + 0.45);
      const am = ac.createOscillator(); am.frequency.value = 23; const amg = ac.createGain(); amg.gain.value = 0.05; am.connect(amg);
      const bp = filt('bandpass', 950, 5); const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.08); g.gain.linearRampToValueAtTime(0, t + 0.48);
      amg.connect(g.gain); src.connect(bp).connect(g).connect(o); src.start(t); am.start(t); src.stop(t + 0.5); am.stop(t + 0.5);
      SFX.footstep_wood(t + 0.5, o, 0.8);
    },
    eat(t, o) { for (let i = 0; i < 3; i++) noiseBurst(t + i * 0.16, 0.06, o, { type: 'bandpass', f: 1800 + Math.random() * 1200, q: 1.2, gain: 0.12, color: 'white' }); osc('sine', 220, t + 0.55, 0.3, o, 0.07, 0.05, 260); },
    quest_done(t, o) { bells([67, 72, 76], t, o, 0.22, 0.11); bells([79, 84], t + 0.42, o, 0.2, 0.12); bells([91], t + 0.75, o, 0.12, 0, 'bell'); },
    page_turn(t, o) { noiseBurst(t, 0.2, o, { type: 'highpass', f: 1400, f2: 3800, gain: 0.08, a: 0.06 }); noiseBurst(t + 0.12, 0.08, o, { type: 'bandpass', f: 2600, gain: 0.04 }); },
  };

  // ------------------------------------------------------------------------------------------
  // Scheduler (runs on a timer so music keeps time even if rAF hiccups)
  function tick() {
    if (!ready || ac.state !== 'running') return;
    const now = ac.currentTime;
    if (pendingStart && now >= pendingStart.at - 0.3) { startMood(pendingStart.mood, pendingStart.at); pendingStart = null; }
    scheduleMusic(now + 0.3);
    for (const name of LAYERS) {
      const L = layers[name];
      if (!L) continue;
      const v = ambientTarget[name] || 0;
      if (v > 0) { L.def.tick?.(L, now); continue; }
      if (!L.zeroSince) L.zeroSince = now;
      else if (now - L.zeroSince > 8) { // fully faded: free the nodes
        for (const s of L.srcs) { try { s.stop(); } catch { /* already stopped */ } }
        L.gain.disconnect(); delete layers[name];
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // Public API
  const audio = {
    /** True once the AudioContext is running (after the first user gesture). */
    get unlocked() { return ready; },
    get context() { return ac; },
    get mood() { return manualMood || desiredMood; },
    moods: MOODS, layers: LAYERS, sfxNames: SFX_NAMES,
    /** Create/resume the AudioContext. Call from a user gesture (core also does it automatically on the first tap/key). */
    unlock() {
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false;
          ac = new AC({ latencyHint: 'interactive' });
          build();
          ready = true;
          timer = setInterval(tick, 50);
          // silent buffer kick (iOS)
          const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0);
          for (const l of LAYERS) applyAmbient(l);
          applyMood();
        }
        if (ac.state !== 'running' && !document.hidden) ac.resume().catch(() => {});
        return true;
      } catch (e) { console.warn('[audio] unlock failed', e); return false; }
    },
    /**
     * Play a sound effect. opts: {vol=1, pitch=1 (multiplier), pos: {x,z} world position for pan/attenuation, delay=0 (s)}.
     * Unknown names warn once. Silently ignored before unlock.
     */
    sfx(name, opts = {}) {
      if (!ready || ac.state !== 'running') return;
      const fn = SFX[name];
      if (!fn) { if (!lastSfx['?' + name]) { lastSfx['?' + name] = 1; console.warn('[audio] unknown sfx', name); } return; }
      const now = ac.currentTime;
      if (lastSfx[name] && now - lastSfx[name] < 0.03) return; // de-dupe bursts
      lastSfx[name] = now;
      let gain = opts.vol ?? 1, pan = opts.pan ?? 0;
      if (opts.pos) {
        const l = getListener();
        if (l) {
          const dx = opts.pos.x - l.x, dz = opts.pos.z - l.z, d = Math.hypot(dx, dz);
          if (d > 45) return;
          gain *= 1 / (1 + (d / 10) * (d / 10));
          const r = getRight();
          pan = clamp((dx * r.x + dz * r.z) / 12, -0.8, 0.8);
        }
      }
      if (gain < 0.01) return;
      const out = ac.createGain(); out.gain.value = gain;
      const p = panner(pan); out.connect(p).connect(N.sfx);
      const vs = ac.createGain(); vs.gain.value = 0.5; p.connect(vs).connect(N.sfxVerb);
      try { fn(now + 0.005 + (opts.delay || 0), out, opts.pitch || 1); } catch (e) { console.warn('[audio] sfx failed', name, e); }
      setTimeout(() => { try { out.disconnect(); vs.disconnect(); } catch { /* ignore */ } }, 6000 + (opts.delay || 0) * 1000);
    },
    /** 'day'|'dusk'|'night'|'rain'|'cave'|'off' forces a mood; 'auto' returns to automatic (time/weather/zone). */
    setMusic(mood) {
      if (mood === 'auto') manualMood = null;
      else if (mood === 'off' || MOODS.includes(mood)) manualMood = mood;
      else { console.warn('[audio] unknown mood', mood); return; }
      applyMood();
    },
    /** Used by the automatic controller in core; modules should use setMusic. */
    _setAutoMood(mood) { desiredMood = mood; applyMood(); },
    /**
     * Ambient layer volume 0..1 with a smooth ~1.5 s transition. Layers: waves, birds, crickets, rain, wind, waterfall, river.
     * birds/crickets/rain/wind are driven automatically by time & weather until you set them; pass 'auto' to give them back.
     */
    setAmbient(layer, volume) {
      if (!LAYERS.includes(layer)) { console.warn('[audio] unknown ambient layer', layer); return; }
      if (volume === 'auto') { delete ambientManual[layer]; return; }
      ambientManual[layer] = true;
      ambientTarget[layer] = clamp(+volume || 0, 0, 1);
      applyAmbient(layer);
    },
    _setAutoAmbient(layer, volume) {
      if (ambientManual[layer]) return;
      ambientTarget[layer] = clamp(+volume || 0, 0, 1);
      applyAmbient(layer);
    },
    getAmbient(layer) { return ambientTarget[layer] || 0; },
    /** {music, sfx, master} in 0..1 (sfx also scales ambient). Persists music/sfx to settings. */
    setVolumes(v = {}) {
      for (const k of ['music', 'sfx', 'master', 'ambient']) if (Number.isFinite(v[k])) vol[k] = clamp(v[k], 0, 1);
      if (save) { save.state.settings.music = vol.music; save.state.settings.sfx = vol.sfx; save.commit(); }
      if (!ready) return;
      const t = ac.currentTime;
      N.music.gain.setTargetAtTime(vol.music, t, 0.08);
      N.musicPostVol.gain.setTargetAtTime(vol.music, t, 0.08);
      N.sfx.gain.setTargetAtTime(vol.sfx, t, 0.08);
      N.sfxVerbVol.gain.setTargetAtTime(vol.sfx, t, 0.08);
      N.amb.gain.setTargetAtTime(vol.sfx * vol.ambient, t, 0.08);
      N.master.gain.setTargetAtTime(vol.master, t, 0.08);
    },
    get volumes() { return { ...vol }; },
    /** Output level meter (debug/UI): {rms, peak} in dBFS over the last ~40 ms. -Infinity when silent or locked. */
    meter() {
      if (!ready) return { rms: -Infinity, peak: -Infinity };
      if (!N.analyser) { N.analyser = ac.createAnalyser(); N.analyser.fftSize = 2048; N.comp.connect(N.analyser); N.meterBuf = new Float32Array(2048); }
      N.analyser.getFloatTimeDomainData(N.meterBuf);
      let sum = 0, pk = 0;
      for (const v of N.meterBuf) { sum += v * v; pk = Math.max(pk, Math.abs(v)); }
      const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
      return { rms: db(Math.sqrt(sum / N.meterBuf.length)), peak: db(pk) };
    },
    /** Suspend/resume the context (core does this on visibility change). */
    suspend() { if (ac && ac.state === 'running') ac.suspend().catch(() => {}); },
    resume() { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); },
  };

  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.suspend(); else if (ready) audio.resume(); });
  window.addEventListener('pagehide', () => audio.suspend());
  window.addEventListener('pageshow', () => { if (ready && !document.hidden) audio.resume(); });
  return audio;
}

/**
 * Automatic mood + ambient controller: phase/weather/zone → music mood, birds by day, crickets at night,
 * rain/wind from weather. Explicit setMusic()/setAmbient() calls override it.
 */
export function attachAutoAudio(ctx) {
  const { audio, bus, time } = ctx;
  let zone = null, weather = ctx.save?.state?.weather?.type || 'clear', intensity = 1;
  const update = () => {
    const w = ctx.world?.weather;
    if (w?.type) { weather = w.type; intensity = w.intensity ?? 1; }
    const phase = time.phase;
    const rainy = weather === 'rain' || weather === 'storm';
    let mood = phase === 'night' ? 'night' : phase === 'dusk' ? 'dusk' : 'day';
    if (rainy) mood = 'rain';
    if (zone === 'sea_cave') mood = 'cave';
    audio._setAutoMood(mood);
    const L = time.lighting();
    const day = L.daylight, night = L.night;
    const h = time.hours;
    const dawnChorus = h > 5.5 && h < 9 ? 1.25 : 1;
    audio._setAutoAmbient('birds', zone === 'sea_cave' ? 0 : day * (rainy ? 0.15 : weather === 'fog' ? 0.5 : 0.75) * dawnChorus);
    audio._setAutoAmbient('crickets', zone === 'sea_cave' ? 0 : night * (rainy ? 0.25 : 0.8));
    audio._setAutoAmbient('rain', rainy ? (weather === 'storm' ? 1 : 0.55 + 0.4 * intensity) : 0);
    audio._setAutoAmbient('wind', weather === 'storm' ? 0.9 : rainy ? 0.4 : weather === 'cloudy' ? 0.3 : 0.15);
  };
  bus.on('time:phase', update);
  bus.on('weather:change', p => { if (p?.type) weather = p.type; update(); });
  bus.on('zone:enter', p => { zone = p?.zone ?? null; update(); });
  const iv = setInterval(update, 2000);
  update();
  return { update, stop: () => clearInterval(iv) };
}
