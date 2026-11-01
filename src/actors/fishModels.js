// Fish models (Creatures area): a procedural mesh factory for every species in src/data/fish.js and junk.js.
//   const fm = ctx.fishModels;  const f = fm.create('koi', { size: 60 });  scene.add(f.object);
//   each frame: f.animate(dt, swimSpeed 0..2, bend -1..1)
//   fm.thumbnail('koi', 128) → PNG dataURL (3/4 portrait, transparent, cached); fm.silhouette('koi') for unknown entries.
// Model space: nose at +z, length normalised to 1 (z ∈ [-0.5, 0.5]); object.scale = real length in metres.
// One merged geometry + one material per fish; swimming = vertex-shader spine bend + tail beat + fin flutter.
import * as THREE from 'three';
import { Builder, sweep, strip, ellipsoid, cone, aim, mat, bump, col, mixCol, shade, canvasTexture, makeCanvas } from './creatures/geo.js';
import { rng } from '../core/math.js';

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---- texture atlas layout (canvas 256 x 160) ----
// body: rows 0..127 (u along the body nose→tail, v around: belly → +x side → back → -x side → belly)
// fins: rows 128..159, x 0..223 (u along the fin root, v root → tip); solid texels at x 224..255.
const TW = 256, TH = 160;
const UV = {
  body: [0, 1, 1, 1 - 128 / TH],
  fin: [2 / TW, 1 - 131 / TH, 222 / TW, 1 - 157 / TH],
  solid: [232 / TW, 1 - 144 / TH],     // white, no glow
  glow: [248 / TW, 1 - 144 / TH],      // white, full glow in the emissive map
};
const FIN = { body: 0, pect: 1, ripple: 2, tail: 3, limb: 4, sway: 5, vripple: 6 };

// ---- body shapes ----
// umax: position of max depth, p: nose roundness exponent, pr: peduncle ratio, arch: back fuller than belly,
// nose: nose drop, e: superellipse exponent, wr: width/height, tail: tail fin share of length, waves/amp/stiff: swimming.
const SHAPES = {
  torpedo: { H: 0.26, umax: 0.34, p: 0.6, pr: 0.2, arch: 0.12, nose: 0.12, e: 2.0, wr: 0.62, tail: 0.21, waves: 0.75, amp: 0.06, stiff: 0.12, eyeU: 0.12 },
  round:   { H: 0.36, umax: 0.4, p: 0.5, pr: 0.26, arch: 0.16, nose: 0.16, e: 2.0, wr: 0.56, tail: 0.2, waves: 0.65, amp: 0.06, stiff: 0.14, eyeU: 0.13 },
  tall:    { H: 0.44, umax: 0.42, p: 0.55, pr: 0.2, arch: 0.18, nose: 0.22, e: 2.1, wr: 0.34, tail: 0.21, waves: 0.6, amp: 0.055, stiff: 0.14, eyeU: 0.14 },
  long:    { H: 0.22, umax: 0.4, p: 0.68, pr: 0.42, arch: 0.05, nose: 0.06, e: 2.1, wr: 0.85, tail: 0.15, waves: 1.0, amp: 0.07, stiff: 0.1, eyeU: 0.08 },
  eel:     { H: 0.09, umax: 0.14, p: 0.75, pr: 0.06, arch: 0.0, nose: 0.0, e: 2.0, wr: 0.85, tail: 0.03, waves: 1.6, amp: 0.085, stiff: 0.2, eyeU: 0.05, tp: 2.2 },
  flat:    { H: 0.45, umax: 0.42, p: 0.55, pr: 0.15, arch: 0.0, nose: 0, e: 2.6, wr: 1, tail: 0.1, waves: 0.5, amp: 0.012, stiff: 0.3, eyeU: 0.12 },
};

// Hand tweaks per species (look only; everything else is generic from the data params).
const TWEAKS = {
  koi: { spots: 'blobs' },
  legend_dawn_koi: { spots: 'blobs', whiskerLen: 1.6 },
  goldfish: { profile: { umax: 0.45, p: 0.45, arch: 0.24 }, tailScale: 1.25 },
  pike: { profile: { nose: -0.05, p: 0.95, arch: -0.05 }, duckbill: true },
  mahi: { profile: { umax: 0.18, p: 0.35, arch: 0.15, nose: 0.2 } },
  gilthead: { goldBrow: true },
  sunfish: { mola: true },
  pufferfish: { profile: { umax: 0.46, p: 0.42, pr: 0.32, arch: 0.08, nose: 0.08, tail: 0.12 } },
  anglerfish: { profile: { umax: 0.3, p: 0.36, pr: 0.26, arch: 0.25, nose: 0.15, tail: 0.15 }, bigMouth: true },
  legend_rainbow_king: { hues: true },
  rainbow_trout: {},
  stargazer: { profile: { arch: -0.25, nose: -0.1, p: 0.4 } },
  grouper: { profile: { p: 0.45, umax: 0.36 }, bigMouth: true },
  legend_old_grumbler: { profile: { p: 0.42, umax: 0.36 }, bigMouth: true },
  moray: { bigMouth: true, profile: { umax: 0.12, p: 0.6 } },
  catfish: { profile: { nose: -0.1, p: 0.5, umax: 0.25, arch: 0.08 } },
  lazy_loach: { profile: { p: 0.55 } },
  axolotl: { profile: { p: 0.42, umax: 0.2, pr: 0.5, nose: 0, arch: 0.05 }, smooth: true },
  scorpionfish: { profile: { p: 0.45 } },
  sturgeon: { profile: { p: 0.9, nose: -0.15, arch: 0.1 } },
  john_dory: { profile: { nose: 0.3, p: 0.6 } },
  bluefin_tuna: { profile: { umax: 0.38, pr: 0.12 } },
  bonito: { profile: { pr: 0.13 } },
  swordfish: { profile: { pr: 0.13 } },
  clownfish: { profile: { p: 0.5, umax: 0.42 } },
  damselfish: {},
  flying_fish: {},
  legend_grandma_trout: { whiskerLen: 1.2 },
  legend_lumina: { whiskerLen: 1.8 },
  glassfish: { skeleton: true },
  blindfish: { skeleton: true },
};

const EYE_R = { small: 0.038, normal: 0.05, big: 0.063, none: 0 };
const BLACK = '#17151c';

// ------------------------------------------------------------------------------------------------
// species params
// ------------------------------------------------------------------------------------------------
function specOf(rec) {
  const m = rec.model || {};
  const pal = { back: '#7a8a9a', belly: '#eef0f0', fin: '#9aa4ae', accent: '#3a4450', ...(m.palette || {}) };
  return {
    id: rec.id, rec, junk: !!rec.junk || String(m.shape || '').startsWith('junk_'),
    shape: m.shape || 'torpedo', variant: m.variant || null,
    len: m.length || 1, H: m.height, W: m.width,
    pal, pattern: m.pattern || 'none',
    fins: { dorsal: 'small', tail: 'fork', pectoral: 'small', ...(m.fins || {}) },
    eye: m.eye || 'normal', feat: new Set(m.features || []),
    glow: m.glow || null, transparent: !!m.transparent,
    tw: TWEAKS[rec.id] || {},
    rarity: rec.rarity || 'common',
  };
}

function profileFor(sp) {
  const base = SHAPES[sp.shape] || SHAPES.torpedo;
  const P = { ...base };
  if (sp.feat.has('puff')) Object.assign(P, { umax: 0.46, p: 0.42, pr: 0.3, arch: 0.06, nose: 0.06, e: 2 });
  if (sp.feat.has('snout')) P.p = Math.min(1, P.p + 0.2);
  if (sp.tw.mola) Object.assign(P, { umax: 0.48, p: 0.5, pr: 0.72, arch: 0.02, nose: 0.1, tail: 0.06, wr: 0.3 });
  Object.assign(P, sp.tw.profile || {});
  const elong = sp.len || 1;
  P.Hh = (sp.H ?? base.H) / 2 / Math.pow(elong, 0.55);
  if (sp.shape === 'flat') { P.Wh = (sp.H ?? base.H) / 2; P.Hh = 0.032; }
  else P.Wh = sp.W ? sp.W / 2 : P.Hh * P.wr;
  P.zFront = 0.5; P.zBack = 0.5 - (1 - P.tail);
  return P;
}

function kOf(u, P) {
  if (u <= 0) return 0;
  if (u < P.umax) { const t = u / P.umax; return Math.pow(1 - (1 - t) * (1 - t), P.p); }
  const t = Math.min(1, (u - P.umax) / (1 - P.umax));
  const s = 0.5 - 0.5 * Math.cos(Math.PI * t);
  return 1 - (1 - P.pr) * Math.pow(s, P.tp ?? 1);
}

/** Cross-section of the body at u (0 nose → 1 peduncle). */
function sectionAt(u, P) {
  const k = kOf(u, P);
  const h = P.Hh * k;
  const tailT = Math.max(0, (u - P.umax) / (1 - P.umax));
  const w = P.Wh * k * (1 - 0.35 * tailT * tailT);
  const arch = P.arch;
  const yc = u < P.umax ? -P.nose * P.Hh * Math.pow(1 - k, 1.5) : 0;
  return { z: P.zFront + (P.zBack - P.zFront) * u, yc, ht: h * (1 + arch), hb: h * (1 - arch), w, e: P.e, k };
}

/** Point on the section surface at angle a (0 bottom, π/2 +x side, π top). */
function surfPoint(S, a, side = 1) {
  const sa = Math.sin(a), ca = Math.cos(a), ex = 2 / (S.e || 2);
  const x = S.w * Math.sign(sa) * Math.pow(Math.abs(sa), ex) * side;
  const yv = -ca, hh = yv > 0 ? S.ht : S.hb;
  const y = S.yc + hh * Math.sign(yv) * Math.pow(Math.abs(yv), ex);
  return V(x, y, S.z);
}

// ------------------------------------------------------------------------------------------------
// lofted body
// ------------------------------------------------------------------------------------------------
/** Loft a closed body along z from a section function sec(u) → {z, yc, ht, hb, w, e}. */
function loft(sec, NS, NR, { warp = 1.35, capEnd = true } = {}) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const u = Math.pow(i / NS, warp);
    const S = sec(u);
    for (let j = 0; j <= NR; j++) {
      const p = surfPoint(S, (j / NR) * TAU);
      pos.push(p.x, p.y, p.z); uv.push(u, j / NR);
    }
  }
  const R = NR + 1;
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
    const a = i * R + j, b = a + R;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  if (capEnd) {
    const S = sec(1), c = pos.length / 3;
    pos.push(0, S.yc + (S.ht - S.hb) * 0.5, S.z - 0.002); uv.push(1, 0.5);
    for (let j = 0; j < NR; j++) { const a = NS * R + j; idx.push(c, a + 1, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal, t = new THREE.Vector3(), t2 = new THREE.Vector3();
  for (let i = 0; i <= NS; i++) { // weld seam
    const a = i * R, b = a + NR;
    t.fromBufferAttribute(n, a).add(t2.fromBufferAttribute(n, b)).normalize();
    n.setXYZ(a, t.x, t.y, t.z); n.setXYZ(b, t.x, t.y, t.z);
  }
  for (let j = 0; j <= NR; j++) { // rounded nose
    t.fromBufferAttribute(n, R + j).multiplyScalar(0.35).add(t2.set(0, 0, 1)).normalize();
    n.setXYZ(j, t.x, t.y, t.z);
  }
  return g;
}

// ------------------------------------------------------------------------------------------------
// skin painting (canvas atlas + optional emissive atlas)
// ------------------------------------------------------------------------------------------------
const hexRGB = h => { const c = new THREE.Color(h); c.convertLinearToSRGB(); return [c.r * 255, c.g * 255, c.b * 255]; };
const rgbStr = (a, alpha = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${alpha})`;
const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function paintSkin(sp) {
  // texel aspect: how much a round mark must be squashed vertically to look round on the body
  let kv = 0.6;
  if (!sp.junk && ['torpedo', 'round', 'tall', 'long', 'eel', 'flat'].includes(sp.shape) && !sp.variant) {
    const P = profileFor(sp), a = P.Hh, b = P.Wh;
    const halfPerim = Math.PI / 2 * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    kv = THREE.MathUtils.clamp(0.25 * (1 - P.tail) / Math.max(0.05, halfPerim * 0.85), 0.2, 1.6);
  }
  const pal = { back: hexRGB(sp.pal.back), belly: hexRGB(sp.pal.belly), fin: hexRGB(sp.pal.fin), acc: hexRGB(sp.pal.accent) };
  const cv = makeCanvas(TW, TH), g = cv.getContext('2d');
  const half = makeCanvas(256, 64), h = half.getContext('2d');
  const X = u => u * 256, Y = s => s * 64; // s: 0 belly … 1 back
  const smooth = sp.tw.smooth || ['eel', 'squid', 'crab'].includes(sp.shape) || sp.feat.has('whiskers') && sp.shape === 'long';
  const wide = sp.pattern === 'gradient' || sp.pattern === 'rainbow';
  const g0 = wide ? 0.12 : 0.36, g1 = wide ? 0.9 : 0.66;
  // base: counter-shading + fin tint at the tail end
  const img = h.createImageData(256, 64);
  for (let y = 0; y < 64; y++) {
    const s = (y + 0.5) / 64, t = sstep(g0, g1, s);
    for (let x = 0; x < 256; x++) {
      const u = x / 256;
      let c = mixRGB(pal.belly, pal.back, t);
      if (u > 0.82 && !sp.junk) c = mixRGB(c, pal.fin, (u - 0.82) / 0.18 * 0.4);
      if (u < 0.05) c = mixRGB(c, pal.back, (1 - u / 0.05) * 0.15 * t);
      const o = (y * 256 + x) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  h.putImageData(img, 0, 0);

  // pattern (painted twice when glowing: once in colour, once white on the emissive atlas)
  const drawPattern = (ctx, fill, isGlow) => {
    const R = rng('skin:' + sp.id);
    ctx.save();
    ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineCap = 'round';
    const dot = (x, y, r) => { ctx.beginPath(); ctx.ellipse(x, y, r, Math.max(0.6, r * kv), 0, 0, TAU); ctx.fill(); };
    switch (sp.pattern) {
      case 'stripes': {
        ctx.lineWidth = sp.shape === 'squid' ? 3.5 : 2.6;
        const step = sp.shape === 'squid' ? 0.06 : 0.065;
        for (let u = 0.2; u < 0.93; u += step) {
          ctx.beginPath();
          const x0 = X(u + R.range(-0.01, 0.01));
          ctx.moveTo(x0, Y(1.02));
          for (let s = 1; s > 0.48; s -= 0.04) ctx.lineTo(x0 + Math.sin(s * 14 + u * 9) * 3.2 + (1 - s) * 8, Y(s));
          ctx.stroke();
        }
        break;
      }
      case 'bands': {
        ctx.globalAlpha = 0.82;
        const n = 6;
        for (let i = 0; i < n; i++) {
          const u = 0.24 + i * (0.62 / (n - 1)), x = X(u);
          ctx.beginPath(); ctx.moveTo(x - 6, Y(1.02)); ctx.lineTo(x + 6, Y(1.02)); ctx.lineTo(x + 3, Y(0.3));
          ctx.quadraticCurveTo(x, Y(0.18), x - 3, Y(0.3)); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'spots': {
        if (sp.tw.spots === 'blobs') {
          for (let i = 0; i < 5; i++) {
            const cx = X(R.range(0.24, 0.82)), cy = Y(R.range(0.6, 1)), rr = R.range(11, 18);
            for (let k = 0; k < 6; k++) dot(cx + R.range(-rr, rr) * 0.7, cy + R.range(-rr, rr) * 0.25, rr * R.range(0.45, 0.75));
          }
        } else {
          const n = sp.shape === 'eel' ? 34 : 26;
          for (let i = 0; i < n; i++) {
            const x = X(R.range(0.1, 0.92)), y = Y(R.range(0.3, 1)), r = R.range(2.2, 4.4);
            if (!isGlow && sp.shape === 'torpedo') { ctx.save(); ctx.fillStyle = 'rgba(255,250,235,0.55)'; dot(x, y, r + 1.6); ctx.restore(); }
            dot(x, y, r);
          }
        }
        break;
      }
      case 'dots': {
        ctx.globalAlpha = isGlow ? 1 : 0.85;
        const glowRow = isGlow || sp.glow;
        for (let u = 0.14; u < 0.92; u += 0.034) for (let s = 0.28; s < 1; s += 0.13) {
          if (glowRow && s > 0.6) continue;
          dot(X(u + R.range(-0.008, 0.008)), Y(s + R.range(-0.03, 0.03)), R.range(1.1, 2.0));
        }
        break;
      }
      case 'lines': {
        ctx.lineWidth = 1.8; ctx.globalAlpha = 0.85;
        for (const s of [0.36, 0.48, 0.6, 0.72, 0.84]) {
          ctx.beginPath(); ctx.moveTo(X(0.17), Y(s));
          for (let u = 0.17; u <= 0.96; u += 0.04) ctx.lineTo(X(u), Y(s + Math.sin(u * 11 + s * 5) * 0.025));
          ctx.stroke();
        }
        break;
      }
      case 'rainbow': {
        if (sp.tw.hues) {
          for (let x = 0; x < 256; x++) { ctx.fillStyle = `hsla(${(x / 256) * 300 + 300},92%,${isGlow ? 90 : 60}%,0.88)`; ctx.fillRect(x, Y(0.3), 1, Y(0.7)); }
        } else {
          const gr = ctx.createLinearGradient(0, Y(0.36), 0, Y(0.66));
          gr.addColorStop(0, rgbStr(pal.acc, 0)); gr.addColorStop(0.5, rgbStr(isGlow ? [255, 255, 255] : pal.acc, 0.9)); gr.addColorStop(1, rgbStr(pal.acc, 0));
          ctx.fillStyle = gr; ctx.fillRect(X(0.12), Y(0.36), X(0.82), Y(0.3));
          if (!isGlow) { ctx.fillStyle = 'rgba(40,40,40,0.75)'; for (let i = 0; i < 30; i++) dot(X(R.range(0.15, 0.95)), Y(R.range(0.68, 1)), R.range(0.9, 1.6)); }
        }
        break;
      }
      case 'clown': {
        for (const [u, w] of [[0.2, 10], [0.5, 12], [0.82, 7]]) {
          ctx.lineWidth = w + 4; ctx.strokeStyle = BLACK;
          const path = () => { ctx.beginPath(); ctx.moveTo(X(u) - 3, Y(0)); ctx.quadraticCurveTo(X(u) + 6, Y(0.5), X(u) - 3, Y(1.05)); };
          path(); ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = isGlow ? '#fff' : rgbStr(pal.acc); path(); ctx.stroke();
        }
        break;
      }
      default: break;
    }
    ctx.restore();
  };
  drawPattern(h, rgbStr(pal.acc), false);

  // features painted on the skin
  if (sp.feat.has('spot')) {
    const Lu = 1 - (profileFor(sp).tail || 0.2);
    const [u, s, rho] = sp.pattern === 'none' ? [0.42, 0.6, 0.075] : [0.2, 0.6, 0.028];
    const r = rho * 256 / Lu;
    h.fillStyle = 'rgba(250,240,220,0.8)'; h.beginPath(); h.ellipse(X(u), Y(s), r + 1.8, (r + 1.8) * kv, 0, 0, TAU); h.fill();
    h.fillStyle = BLACK; h.beginPath(); h.ellipse(X(u), Y(s), r, r * kv, 0, 0, TAU); h.fill();
  }
  if (sp.tw.goldBrow) { h.fillStyle = rgbStr(pal.acc); h.beginPath(); h.ellipse(X(0.075), Y(0.98), 9, 4, 0, 0, TAU); h.fill(); }
  if (sp.tw.skeleton) { // see-through fish: a faint spine and ribs
    h.strokeStyle = 'rgba(255,255,255,0.55)'; h.lineWidth = 1.4;
    h.beginPath(); h.moveTo(X(0.2), Y(0.6)); h.lineTo(X(0.95), Y(0.55)); h.stroke();
    for (let u = 0.28; u < 0.9; u += 0.05) { h.beginPath(); h.moveTo(X(u), Y(0.6)); h.lineTo(X(u - 0.025), Y(0.34)); h.stroke(); }
  }
  if (!sp.junk && !['crab', 'squid'].includes(sp.shape)) {
    // gill cover arc + lateral line + soft scales
    h.strokeStyle = rgbStr(mixRGB(pal.back, [0, 0, 0], 0.35), 0.38); h.lineWidth = 2;
    const gu = sp.shape === 'eel' ? 0.08 : sp.shape === 'long' ? 0.14 : 0.2;
    if (sp.shape !== 'flat') { h.beginPath(); h.moveTo(X(gu - 0.02), Y(0.22)); h.quadraticCurveTo(X(gu + 0.035), Y(0.55), X(gu - 0.02), Y(0.92)); h.stroke(); }
    h.strokeStyle = 'rgba(255,255,255,0.18)'; h.lineWidth = 1;
    h.beginPath(); h.moveTo(X(gu + 0.02), Y(0.62)); h.bezierCurveTo(X(0.45), Y(0.7), X(0.7), Y(0.58), X(0.97), Y(0.55)); h.stroke();
    if (!smooth) {
      h.lineWidth = 0.8;
      for (let y = 4, row = 0; y < 62; y += 4.5, row++) for (let x = X(gu + 0.04) + (row % 2) * 3; x < 248; x += 6) {
        h.strokeStyle = 'rgba(255,255,255,0.11)'; h.beginPath(); h.arc(x, y, 3.2, 0.25 * Math.PI, 0.75 * Math.PI); h.stroke();
      }
    }
  }

  // compose: half (belly→back) then mirrored (back→belly)
  g.drawImage(half, 0, 0);
  g.save(); g.translate(0, 128); g.scale(1, -1); g.drawImage(half, 0, 0); g.restore();
  // fins: root → tip gradient with rays
  const fg = g.createLinearGradient(0, 130, 0, 158);
  const finTip = sp.pattern === 'clown' ? [24, 22, 28] : mixRGB(pal.fin, [255, 255, 255], 0.42);
  fg.addColorStop(0, rgbStr(mixRGB(pal.fin, pal.back, 0.2))); fg.addColorStop(sp.pattern === 'clown' ? 0.78 : 0.55, rgbStr(pal.fin)); fg.addColorStop(sp.pattern === 'clown' ? 0.82 : 1, rgbStr(finTip));
  if (sp.pattern === 'clown') fg.addColorStop(1, rgbStr(finTip));
  g.fillStyle = fg; g.fillRect(0, 128, 224, 32);
  g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 1.2;
  for (let x = 3; x < 224; x += 6) { g.beginPath(); g.moveTo(x, 131); g.lineTo(x + 1, 156); g.stroke(); }
  g.fillStyle = '#ffffff'; g.fillRect(224, 128, 32, 32);

  let emissive = null;
  if (sp.glow) {
    const ec = makeCanvas(TW, TH), e = ec.getContext('2d');
    const lure = sp.feat.has('lure');
    const patterned = ['dots', 'lines', 'spots', 'rainbow'].includes(sp.pattern);
    const base = lure ? 0 : sp.rarity === 'legendary' ? (patterned ? 0.1 : 0.28) : patterned ? 0.12 : 0.5;
    const bv = Math.round(base * 255);
    e.fillStyle = `rgb(${bv},${bv},${bv})`; e.fillRect(0, 0, TW, TH);
    if (!lure && patterned) {
      const eh = makeCanvas(256, 64), ehc = eh.getContext('2d');
      ehc.fillStyle = `rgb(${bv},${bv},${bv})`; ehc.fillRect(0, 0, 256, 64);
      drawPattern(ehc, '#ffffff', true);
      e.drawImage(eh, 0, 0); e.save(); e.translate(0, 128); e.scale(1, -1); e.drawImage(eh, 0, 0); e.restore();
    }
    const fv = Math.round((lure ? 0 : Math.min(1, base + 0.3)) * 255);
    e.fillStyle = `rgb(${fv},${fv},${fv})`; e.fillRect(0, 128, 224, 32);
    e.fillStyle = '#000'; e.fillRect(224, 128, 16, 32);
    e.fillStyle = '#fff'; e.fillRect(240, 128, 16, 32);
    emissive = canvasTexture(ec);
  }
  return { map: canvasTexture(cv), emissive, canvas: cv };
}

// ------------------------------------------------------------------------------------------------
// builders
// ------------------------------------------------------------------------------------------------
const finAttr = (type, side = 0) => (p, i, uv) => [type, 1, side];
const finFlex = (type, side = 0, scale = 1) => (p, i, uv) => {
  // uv is already remapped into the atlas: recover v (root→tip) from the fin rect
  const v = (uv[1] - UV.fin[1]) / (UV.fin[3] - UV.fin[1]);
  return [type, Math.max(0, Math.min(1, v)) * scale, side];
};
const tubeFlex = (type, side = 0) => (p, i, uv) => [type, uv[0] < 0.5 ? 0 : 1, side];

function addFin(B, rootFn, tipFn, N, M, type, side = 0, o = {}) {
  B.add(strip(rootFn, tipFn, N, M, { thick: o.thick ?? 0.0045, bow: o.bow }), { uvRect: UV.fin, extra: { aFin: finFlex(type, side, o.flex ?? 1) } });
}

/** Simple tube (whisker, barbel, leg, antenna). flex grows along the tube. */
function addTube(B, pts, r0, r1, color, type = FIN.sway, side = 0, radial = 6, o = {}) {
  const g = sweep(pts, t => r0 + (r1 - r0) * t, radial, { capEnd: true, capStart: !!o.capStart, smooth: o.smooth ?? 10 });
  const tuv = g.attributes.uv;
  const flexOf = [];
  for (let i = 0; i < tuv.count; i++) flexOf.push(Math.pow(tuv.getX(i), o.flexPow ?? 1.2) * (o.flexScale ?? 1));
  B.add(g, { uv: o.glow ? UV.glow : UV.solid, color, extra: { aFin: (p, i) => [type, flexOf[i], side] } });
}

function addSphere(B, center, r, color, o = {}) {
  const g = ellipsoid(r * (o.sx ?? 1), r * (o.sy ?? 1), r * (o.sz ?? 1), o.ws ?? 12, o.hs ?? 9);
  const m = o.matrix || new THREE.Matrix4().makeTranslation(center.x, center.y, center.z);
  B.add(g, { matrix: m, uv: o.glow ? UV.glow : UV.solid, color, extra: { aFin: o.fin || [0, 0, 0] } });
}

function addEyes(B, sp, S, P, o = {}) {
  if (sp.eye === 'none') {
    for (const side of [-1, 1]) { const p = surfPoint(S, Math.PI / 2 + 0.45, side); addSphere(B, p, 0.012, mixCol(sp.pal.belly, '#ffffff', 0.3)); }
    return;
  }
  let r = EYE_R[sp.eye] ?? EYE_R.normal;
  r = Math.min(r, Math.max(0.02, 0.62 * Math.min(S.ht, Math.max(S.w, 0.03))), 0.07) * (o.scale || 1);
  const up = sp.feat.has('eyes_up');
  const delta = o.delta ?? (up ? 1.25 : 0.42);
  for (const side of [-1, 1]) {
    const p = surfPoint(S, Math.PI / 2 + delta, side);
    // outward normal of the superellipse (approx) tilted forward a little
    const n = V(p.x / Math.max(1e-4, S.w * S.w), (p.y - S.yc) / Math.max(1e-4, (p.y > S.yc ? S.ht : S.hb) ** 2), 0).normalize();
    n.z += up ? 0.1 : 0.32; n.normalize();
    const c = p.clone().addScaledVector(n, -r * 0.25);
    addSphere(B, c, r, '#fbfaf4', { ws: 14, hs: 10 });
    const pupil = c.clone().addScaledVector(n, r * 0.52);
    addSphere(B, pupil, r * 0.66, BLACK, { ws: 12, hs: 9 });
    const hl = pupil.clone().addScaledVector(n, r * 0.5).add(V(0, r * 0.28, r * 0.12));
    addSphere(B, hl, r * 0.2, '#ffffff', { ws: 8, hs: 6 });
    if (sp.feat.has('brows')) {
      const bp = c.clone().addScaledVector(n, r * 0.4).add(V(0, r * 1.05, 0.0));
      const browCol = sp.id.includes('grandma') ? '#f4f0e6' : shade(sp.pal.back, -0.35);
      const tilt = sp.id.includes('grumbler') ? -0.45 : 0.3;
      const g = ellipsoid(r * 0.55, r * 0.26, r * 1.15, 10, 6);
      B.add(g, { matrix: mat(bp.x, bp.y, bp.z, tilt * side * 0 + 0, 0, side * 0, 1).multiply(mat(0, 0, 0, tilt, 0, 0)), uv: UV.solid, color: browCol, extra: { aFin: [0, 0, 0] } });
    }
  }
}

/** Standard fish (torpedo, round, tall, long, eel, flat). */
function buildFish(sp, lod) {
  const B = new Builder({ aFin: 3 });
  const P = profileFor(sp);
  const sec = u => sectionAt(u, P);
  const NS = [44, 26, 14][lod], NR = [30, 18, 10][lod];
  const flat = sp.shape === 'flat';
  const eel = sp.shape === 'eel';
  B.add(loft(sec, NS, NR), { uvRect: UV.body, extra: { aFin: [0, 0, 0] } });
  const zOf = u => P.zFront + (P.zBack - P.zFront) * u;
  const Hh = P.Hh, fins = sp.fins;
  const N = [12, 8, 5][lod], M = [3, 2, 1][lod];

  // ---------- dorsal / anal ----------
  const backFin = (uA, uB, hMax, opt = {}) => {
    const { peak = 0.35, rise = 0.6, fall = 0.9, sweepB = 0.45, spikes = 0, below = false, minH = 0.02 } = opt;
    const dir = below ? -1 : 1;
    const root = s => { const S = sec(uA + (uB - uA) * s); return V(0, S.yc + dir * ((below ? S.hb : S.ht) - 0.004), S.z); };
    const tip = s => {
      const r = root(s);
      let hh = Math.max(minH * bump(s, peak, 0.5, 0.6), hMax * bump(s, peak, rise, fall));
      if (spikes) hh *= 0.72 + 0.28 * Math.pow(Math.abs(Math.sin(s * Math.PI * spikes)), 0.6);
      return V(0, r.y + dir * hh, r.z - hh * sweepB);
    };
    addFin(B, root, tip, spikes ? Math.max(N, spikes * 4) : N, M, FIN.ripple, 0);
  };
  if (flat) {
    // flatfish: fringe fins around the lateral edges (it lies on its side), rippling vertically
    for (const side of [-1, 1]) {
      const root = s => { const S = sec(0.08 + 0.86 * s); return V(side * S.w * 0.96, S.yc, S.z); };
      const tip = s => { const r = root(s); const hh = 0.045 * (0.35 + bump(s, 0.5, 0.4, 0.4)); return V(r.x + side * hh, r.y - 0.004, r.z - hh * 0.2); };
      addFin(B, root, tip, N + 6, M, FIN.vripple, side);
    }
  } else {
    const d = fins.dorsal;
    const sail = sp.tw.mola ? 0.62 : 1;
    if (d === 'small') backFin(0.36, 0.62, Hh * 0.6);
    else if (d === 'tall') backFin(sp.tw.mola ? 0.5 : 0.32, sp.tw.mola ? 0.86 : 0.56, Hh * 1.05 * sail, { peak: 0.3, sweepB: sp.tw.mola ? 0.25 : 0.6, rise: 0.7, fall: 0.8 });
    else if (d === 'long') eel ? backFin(0.22, 1.0, Math.max(0.03, Hh * 0.75), { peak: 0.5, rise: 0.4, fall: 0.25, sweepB: 0.15, minH: 0.012 })
      : backFin(0.24, 0.88, Hh * 0.5, { peak: 0.2, rise: 0.5, fall: 0.5, sweepB: 0.3 });
    else if (d === 'sail') eel ? backFin(0.1, 1.0, Math.max(0.05, Hh * 1.4), { peak: 0.3, rise: 0.4, fall: 0.35, sweepB: 0.2, minH: 0.015 })
      : backFin(0.18, 0.78, Hh * 1.25, { peak: 0.45, rise: 0.45, fall: 0.5, sweepB: 0.3 });
    else if (d === 'spiny') { backFin(0.22, 0.58, Hh * 0.75, { peak: 0.3, spikes: 7, sweepB: 0.25 }); backFin(0.56, 0.8, Hh * 0.5, { peak: 0.4, rise: 0.5, fall: 0.6 }); }
    else if (d === 'double') { backFin(0.27, 0.46, Hh * 0.72, { peak: 0.25, sweepB: 0.5 }); backFin(0.58, 0.76, Hh * 0.55, { peak: 0.3, sweepB: 0.45 }); }
    // anal fin
    if (eel) backFin(0.45, 1.0, Math.max(0.025, Hh * 0.6), { below: true, peak: 0.5, rise: 0.4, fall: 0.25, sweepB: 0.15, minH: 0.01 });
    else if (sp.tw.mola) backFin(0.5, 0.86, Hh * 1.05 * sail, { below: true, peak: 0.3, sweepB: 0.25, rise: 0.7, fall: 0.8 });
    else if (d === 'long' || d === 'sail') backFin(0.55, 0.88, Hh * 0.42, { below: true, peak: 0.25, sweepB: 0.3 });
    else if (d !== 'none') backFin(0.62, 0.8, Hh * 0.45, { below: true, peak: 0.3, sweepB: 0.45 });
  }

  // ---------- tail ----------
  const Se = sec(1);
  const zEnd = Se.z;
  const tailLen = (P.tail + 0.02) * (sp.tw.tailScale || 1);
  const tt = sp.tw.mola ? 'mola' : fins.tail;
  if (tt !== 'none') {
    let Ts = Hh * 0.95, lenF = s => tailLen;
    const a = s => Math.abs(2 * s - 1);
    switch (tt) {
      case 'fork': Ts = Hh * 1.0; lenF = s => tailLen * (0.45 + 0.6 * Math.pow(a(s), 1.3)); break;
      case 'round': Ts = Hh * 0.75; lenF = s => tailLen * (0.7 + 0.3 * Math.sin(Math.PI * s)); break;
      case 'square': Ts = Hh * 0.82; lenF = s => tailLen * (0.82 + 0.12 * a(s)); break;
      case 'lunate': Ts = Hh * 1.25; lenF = s => tailLen * (0.3 + 0.85 * Math.pow(a(s), 1.6)); break;
      case 'pointed': Ts = Math.max(Hh * 0.6, 0.02); lenF = s => tailLen * 1.2 * Math.pow(1 - a(s), 0.8) + 0.004; break;
      case 'fan': Ts = Hh * 1.2; lenF = s => tailLen * 1.45 * (0.62 + 0.38 * a(s)) * (1 + 0.06 * Math.sin(s * Math.PI * 7)); break;
      case 'mola': Ts = Hh * 0.72; lenF = s => 0.05 * (0.7 + 0.3 * Math.abs(Math.sin(s * Math.PI * 5))); break;
      default: break;
    }
    if (eel) { Ts = Math.max(Hh * 0.75, 0.018); lenF = s => 0.055 * Math.sqrt(Math.max(0, 1 - a(s) * a(s))) + 0.006; }
    if (flat) {
      const root = s => V((2 * s - 1) * Se.w * 0.9, Se.yc, zEnd + 0.012);
      const tip = s => V((2 * s - 1) * Hh * 2.2 + (2 * s - 1) * 0.03, Se.yc, zEnd - tailLen * (0.8 + 0.2 * Math.sin(Math.PI * s)));
      addFin(B, root, tip, N, M + 1, FIN.vripple, 0);
    } else {
      const ycE = Se.yc + (Se.ht - Se.hb) * 0.5;
      const root = s => V(0, ycE + (2 * s - 1) * Math.max(0.006, (Se.ht + Se.hb) * 0.5 * 0.95), zEnd + 0.014);
      const tip = s => V(0, ycE + (2 * s - 1) * Ts, zEnd - lenF(s));
      addFin(B, root, tip, N + 4, M + 1, FIN.tail, 0, { thick: 0.004 });
    }
  }

  // ---------- pectoral & pelvic ----------
  if (!flat) {
    const pu = eel ? 0.07 : sp.shape === 'long' ? 0.17 : 0.24;
    const Sp = sec(pu);
    const pt = fins.pectoral;
    const L = pt === 'wing' ? 0.46 : pt === 'big' ? 0.15 : 0.1;
    for (const side of [-1, 1]) {
      const base = surfPoint(Sp, Math.PI / 2 - 0.25, side);
      base.x -= side * 0.004;
      const rootLen = pt === 'wing' ? 0.07 : 0.03;
      const root = s => V(base.x, base.y + (s - 0.5) * rootLen * 0.6, base.z - s * rootLen);
      let tip;
      if (pt === 'wing') tip = s => V(base.x + side * L * (0.95 - 0.3 * s), base.y + 0.02 - s * 0.03, base.z - 0.03 - L * (0.15 + 0.75 * s));
      else tip = s => { const l = L * (0.55 + 0.45 * Math.sin(Math.PI * (0.15 + 0.7 * s))); return V(base.x + side * l * 0.5, base.y + l * (0.25 - 0.6 * s), base.z - 0.01 - l * 0.8); };
      addFin(B, root, tip, N, M, FIN.pect, side, { thick: 0.0035 });
      // pelvic fins (small, under the belly)
      if (!eel && !sp.tw.mola) {
        const Sv = sec(0.42), pb = surfPoint(Sv, 0.35, side);
        const r2 = s => V(pb.x, pb.y + 0.003, pb.z - s * 0.025);
        const t2 = s => V(pb.x + side * 0.018, pb.y - 0.05 * (0.6 + 0.4 * Math.sin(Math.PI * s)), pb.z - 0.03 - s * 0.03);
        addFin(B, r2, t2, Math.max(3, N >> 1), M, FIN.pect, side, { thick: 0.003, flex: 0.6 });
      }
    }
  }

  // ---------- eyes, mouth ----------
  const eu = P.eyeU ?? 0.12;
  const Se2 = sec(flat ? 0.14 : eu);
  if (flat) {
    for (const side of [-1, 1]) {
      const p = V(side * 0.03 + 0.012, Se2.yc + Se2.ht * 0.95, Se2.z - (side > 0 ? 0 : 0.03));
      addSphere(B, p, 0.026, '#fbfaf4'); addSphere(B, p.clone().add(V(0, 0.016, 0.004)), 0.017, BLACK); addSphere(B, p.clone().add(V(0.004, 0.028, 0.008)), 0.006, '#ffffff');
    }
  } else addEyes(B, sp, Se2, P, { delta: sp.feat.has('eyes_up') ? 1.25 : sp.shape === 'eel' ? 0.75 : 0.42 });
  const nose = sec(0);
  const mouthY = nose.yc;
  const mouthCol = mixCol(sp.pal.back, '#3a1a20', 0.65);
  if (sp.tw.bigMouth) {
    const mw = Math.max(0.035, P.Wh * 0.6), mh = Math.max(0.018, Hh * 0.22);
    addSphere(B, V(0, mouthY - 0.004, 0.495), 1, mouthCol, { sx: mw, sy: mh, sz: 0.02 });
    const teeth = sp.feat.has('teeth') ? 6 : 0;
    for (let i = 0; i < teeth; i++) {
      const a = (i / (teeth - 1) - 0.5) * 1.8, x = Math.sin(a) * mw * 0.85, zz = 0.49 + Math.cos(a) * 0.012;
      for (const s of [1, -1]) B.add(cone(0.006, 0.02, 5), { matrix: aim(V(x, mouthY + s * mh * 0.9, zz), V(0, -s, 0.15)), uv: UV.solid, color: '#fffdf2', extra: { aFin: [0, 0, 0] } });
    }
  } else {
    addSphere(B, V(0, mouthY - Hh * 0.04, 0.497), 1, mouthCol, { sx: Math.max(0.012, P.Wh * 0.32), sy: Math.max(0.006, Hh * 0.08), sz: 0.008 });
    if (sp.feat.has('teeth') && !sp.tw.duckbill) for (let i = 0; i < 4; i++) {
      const x = (i / 3 - 0.5) * P.Wh * 0.5;
      B.add(cone(0.005, 0.016, 5), { matrix: aim(V(x, mouthY - 0.002, 0.493), V(0, -1, 0.3)), uv: UV.solid, color: '#fffdf2', extra: { aFin: [0, 0, 0] } });
    }
  }
  if (sp.feat.has('lips')) {
    const g = new THREE.TorusGeometry(Math.max(0.028, P.Wh * 0.42), 0.012, 8, 18);
    g.scale(1, 0.55, 1);
    B.add(g, { matrix: mat(0, mouthY - 0.004, 0.49), uv: UV.solid, color: mixCol(sp.pal.belly, sp.pal.accent, 0.3), extra: { aFin: [0, 0, 0] } });
  }
  if (sp.tw.duckbill && sp.feat.has('teeth')) {
    for (let i = 0; i < 6; i++) for (const side of [-1, 1]) {
      const S = sec(0.015 + i * 0.012); const p = surfPoint(S, Math.PI / 2 - 0.2, side);
      B.add(cone(0.003, 0.012, 4), { matrix: aim(p, V(side * 0.3, -1, 0)), uv: UV.solid, color: '#fffdf2', extra: { aFin: [0, 0, 0] } });
    }
  }

  // ---------- features ----------
  const F = sp.feat;
  const featCol = mixCol(sp.pal.belly, sp.pal.back, 0.45);
  const whiskK = sp.tw.whiskerLen || 1;
  if (F.has('barbels')) {
    const n = sp.id === 'carp' || sp.id === 'koi' || sp.id.includes('koi') ? 1 : 2;
    for (const side of [-1, 1]) for (let k = 0; k < n; k++) {
      const o = V(side * (P.Wh * 0.3 + k * 0.01), mouthY - 0.006 - k * 0.012, 0.485 - k * 0.012);
      const l = 0.06 * (1 + k * 0.4);
      addTube(B, [o, o.clone().add(V(side * l * 0.3, -l * 0.5, -l * 0.15)), o.clone().add(V(side * l * 0.5, -l * 0.9, -l * 0.55))], 0.006, 0.002, featCol, FIN.sway, side, 5);
    }
  }
  if (F.has('whiskers')) {
    for (const side of [-1, 1]) {
      const o = V(side * P.Wh * 0.45, mouthY + 0.004, 0.48);
      const l = 0.26 * whiskK;
      addTube(B, [o, o.clone().add(V(side * l * 0.35, l * 0.05, -l * 0.05)), o.clone().add(V(side * l * 0.6, -l * 0.08, -l * 0.35)), o.clone().add(V(side * l * 0.7, -l * 0.02, -l * 0.75))], 0.0065, 0.0018, sp.glow ? mixCol(sp.pal.accent, '#ffffff', 0.3) : featCol, FIN.sway, side, 5, { glow: !!sp.glow });
      const o2 = V(side * P.Wh * 0.2, mouthY - Hh * 0.2, 0.47);
      addTube(B, [o2, o2.clone().add(V(side * 0.02, -0.04, -0.01)), o2.clone().add(V(side * 0.035, -0.07, -0.05))], 0.004, 0.0015, featCol, FIN.sway, side, 4);
    }
  }
  if (F.has('snout') && sp.shape === 'long' && !sp.tw.duckbill) {
    B.add(cone(Math.max(0.02, P.Hh * 0.35), 0.1, 10), { matrix: aim(V(0, nose.yc + 0.003, 0.47), V(0, 0.18, 1), V(1, 1, 0.7)), uv: UV.solid, color: shade(sp.pal.back, 0.1), extra: { aFin: [0, 0, 0] } });
  }
  if (F.has('beak')) {
    if (sp.shape === 'long') {
      addTube(B, [V(0, nose.yc, 0.48), V(0, nose.yc, 0.62), V(0, nose.yc + 0.004, 0.76)], 0.012, 0.0025, shade(sp.pal.back, 0.05), FIN.body, 0, 6, { flexScale: 0 });
    } else {
      const bw = Math.max(0.03, P.Wh * 0.6);
      addSphere(B, V(0, nose.yc + 0.008, 0.49), 1, '#f2f2ea', { sx: bw, sy: Math.max(0.02, Hh * 0.22), sz: 0.035 });
      addSphere(B, V(0, nose.yc - 0.012, 0.485), 1, mixCol(sp.pal.fin, '#ffffff', 0.4), { sx: bw * 0.9, sy: Math.max(0.016, Hh * 0.16), sz: 0.03 });
    }
  }
  if (F.has('sword')) {
    const g = sweep([V(0, nose.yc + 0.01, 0.46), V(0, nose.yc + 0.012, 0.66), V(0, nose.yc + 0.016, 0.9)], t => [0.018 * (1 - t) + 0.002, 0.008 * (1 - t) + 0.0015], 8, { capEnd: true, smooth: 8 });
    B.add(g, { uv: UV.solid, color: shade(sp.pal.back, -0.1), extra: { aFin: [0, 0, 0] } });
  }
  if (F.has('spines')) {
    const R = rng('spines:' + sp.id);
    if (F.has('puff')) {
      for (let i = 0; i < (lod ? 26 : 44); i++) {
        const u = R.range(0.12, 0.85), a = R.range(0.2, TAU - 0.2), S = sec(u);
        const p = surfPoint(S, a);
        const n = V(p.x, p.y - S.yc, 0.15).normalize();
        B.add(cone(0.009, 0.035, 5), { matrix: aim(p.addScaledVector(n, -0.004), n), uv: UV.solid, color: mixCol(sp.pal.belly, sp.pal.back, 0.3), extra: { aFin: [0, 0, 0] } });
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const u = 0.04 + i * 0.025, S = sec(u);
        for (const side of [-1, 1]) {
          const p = surfPoint(S, Math.PI - 0.5 - i * 0.05, side);
          const n = V(side * 0.6, 1, 0.2).normalize();
          B.add(cone(0.007, 0.028, 4), { matrix: aim(p, n), uv: UV.solid, color: shade(sp.pal.back, 0.15), extra: { aFin: [0, 0, 0] } });
        }
      }
      if (sp.fins.dorsal === 'long') { // john dory filaments
        for (let i = 0; i < 6; i++) {
          const S = sec(0.25 + i * 0.05); const r = V(0, S.yc + S.ht * 0.95 + Hh * 0.4 * bump((i + 0.5) / 6, 0.2, 0.5, 0.5), S.z);
          addTube(B, [r, r.clone().add(V(0, 0.06, -0.04)), r.clone().add(V(0, 0.1, -0.12))], 0.004, 0.0015, sp.pal.fin, FIN.sway, 0, 4);
        }
      }
    }
  }
  if (F.has('lure')) {
    const S = sec(0.12);
    const o = V(0, S.yc + S.ht - 0.004, S.z);
    addTube(B, [o, o.clone().add(V(0, 0.12, -0.01)), o.clone().add(V(0, 0.2, 0.08)), o.clone().add(V(0, 0.16, 0.16))], 0.007, 0.004, sp.pal.back, FIN.sway, 0, 6, { flexScale: 0.7 });
    addSphere(B, o.clone().add(V(0, 0.15, 0.175)), 0.032, sp.glow || '#fff27a', { glow: true, fin: [FIN.sway, 0.7, 0] });
  }
  if (F.has('crest')) {
    if (sp.shape === 'eel' || sp.shape === 'tall' || sp.shape === 'torpedo' && sp.rarity === 'legendary') {
      const uA = 0.03, uB = eel ? 0.1 : 0.16;
      const root = s => { const S = sec(uA + (uB - uA) * s); return V(0, S.yc + S.ht - 0.004, S.z); };
      const tip = s => { const r = root(s); const hh = Math.max(0.04, Hh * 0.6) * bump(s, 0.4, 0.5, 0.6); return V(0, r.y + hh, r.z - hh * 0.8); };
      addFin(B, root, tip, N, M, FIN.ripple, 0);
    }
  }
  if (F.has('legs')) {
    for (const [u, back] of [[0.25, 0], [0.62, 1]]) for (const side of [-1, 1]) {
      const S = sec(u), p = surfPoint(S, Math.PI / 2 - 0.5, side);
      const pts = [p, p.clone().add(V(side * 0.05, -0.025, back ? -0.02 : 0.01)), p.clone().add(V(side * 0.08, -0.06, back ? -0.03 : 0.025))];
      addTube(B, pts, 0.016, 0.01, mixCol(sp.pal.back, sp.pal.belly, 0.4), FIN.limb, side, 6);
      for (let t = -1; t <= 1; t++) addSphere(B, pts[2].clone().add(V(side * 0.008, -0.004, t * 0.012)), 0.009, mixCol(sp.pal.back, sp.pal.belly, 0.4), { fin: [FIN.limb, 1, side] });
    }
  }
  if (F.has('gills')) {
    const S = sec(0.17);
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      const p = surfPoint(S, Math.PI - 0.55 + k * 0.38, side);
      const d = V(side * (0.55 - k * 0.15), 0.6 - k * 0.45, -0.55).normalize();
      const pts = [p, p.clone().addScaledVector(d, 0.05).add(V(0, 0.01, 0)), p.clone().addScaledVector(d, 0.1).add(V(0, 0.005, -0.01))];
      addTube(B, pts, 0.008, 0.005, sp.pal.accent, FIN.sway, side, 5);
      for (let q = 1; q <= 4; q++) {
        const c = pts[0].clone().lerp(pts[2], q / 4.5);
        addSphere(B, c.add(V(0, 0.006, 0)), 0.008 + 0.002 * (q % 2), sp.pal.accent, { fin: [FIN.sway, q / 4, side] });
      }
    }
  }
  if (F.has('finlets')) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const u = 0.8 + i * 0.038; const S = sec(u);
      for (const below of [0, 1]) {
        const y = below ? S.yc - S.hb : S.yc + S.ht;
        const dir = below ? -1 : 1;
        const root = s => V(0, y - dir * 0.002, S.z - s * 0.016);
        const tip = s => V(0, y + dir * 0.018 * (1 - s * 0.6), S.z - 0.012 - s * 0.012);
        addFin(B, root, tip, 2, 1, FIN.ripple, 0, { thick: 0.003 });
      }
    }
  }
  return B;
}

/** Crab, crayfish, lobster, shrimp. Front at +z. */
function buildCrab(sp, lod) {
  const B = new Builder({ aFin: 3 });
  const pal = sp.pal, variant = sp.variant;
  const shellCol = (p, n) => mixCol(pal.belly, pal.back, THREE.MathUtils.smoothstep(n.y, -0.35, 0.3));
  const legCol = pal.fin, tipCol = pal.accent;
  const seg = lod ? 5 : 7;
  const leg = (pts, r0, r1, side, i) => addTube(B, pts, r0, r1, legCol, FIN.limb, side * (1 + i * 0.37), seg, { flexPow: 1, smooth: 8 });
  const eyeStalk = (base, top, r) => {
    addTube(B, [base, top], 0.012, 0.009, legCol, FIN.sway, 0, 6, { flexScale: 0.3 });
    addSphere(B, top, r, BLACK); addSphere(B, top.clone().add(V(0.004, r * 0.6, r * 0.5)), r * 0.3, '#ffffff');
  };
  if (!variant) {
    // crab: wide carapace, 8 legs, 2 claws, eye stalks
    B.add(ellipsoid(0.3, 0.12, 0.23, lod ? 16 : 26, lod ? 10 : 16), { matrix: mat(0, 0.17, 0), uv: UV.solid, color: shellCol, extra: { aFin: [0, 0, 0] } });
    for (const side of [-1, 1]) {
      B.add(ellipsoid(0.08, 0.05, 0.07, 10, 8), { matrix: mat(side * 0.13, 0.24, 0.06), uv: UV.solid, color: shellCol, extra: { aFin: [0, 0, 0] } });
      eyeStalk(V(side * 0.06, 0.22, 0.17), V(side * 0.085, 0.31, 0.22), 0.03);
      for (let i = 0; i < 4; i++) {
        const zb = 0.08 - i * 0.075;
        leg([V(side * 0.24, 0.14, zb), V(side * 0.42, 0.24, zb * 1.25 - 0.02), V(side * 0.56, 0.02, zb * 1.6 - 0.04)], 0.024, 0.009, side, i);
      }
      const a0 = V(side * 0.2, 0.13, 0.15), a1 = V(side * 0.33, 0.17, 0.28), a2 = V(side * 0.22, 0.17, 0.4);
      addTube(B, [a0, a1, a2], 0.03, 0.026, legCol, FIN.limb, side * 0.4, seg, { flexScale: 0.4 });
      B.add(ellipsoid(0.075, 0.055, 0.1, 12, 9), { matrix: mat(a2.x, a2.y, a2.z + 0.06, 0, -side * 0.5, 0), uv: UV.solid, color: legCol, extra: { aFin: [FIN.limb, 0.4, side] } });
      B.add(cone(0.028, 0.1, 7), { matrix: aim(V(a2.x - side * 0.01, a2.y + 0.015, a2.z + 0.12), V(-side * 0.5, 0.05, 1)), uv: UV.solid, color: tipCol, extra: { aFin: [FIN.limb, 0.5, side] } });
      B.add(cone(0.022, 0.08, 7), { matrix: aim(V(a2.x + side * 0.02, a2.y - 0.02, a2.z + 0.12), V(-side * 0.35, -0.15, 1)), uv: UV.solid, color: tipCol, extra: { aFin: [FIN.limb, 0.8, side] } });
    }
    addSphere(B, V(0, 0.13, 0.22), 1, BLACK, { sx: 0.05, sy: 0.02, sz: 0.012 });
    return B;
  }
  // long crustaceans
  const lobster = variant === 'lobster', shrimp = variant === 'shrimp';
  const bodyR = shrimp ? 0.075 : lobster ? 0.1 : 0.088;
  const segN = shrimp ? 6 : 5;
  // cephalothorax
  B.add(ellipsoid(bodyR, bodyR * 0.9, shrimp ? 0.15 : 0.19, lod ? 14 : 22, lod ? 9 : 14), { matrix: mat(0, 0.11, 0.12, shrimp ? 0.15 : 0), uv: sp.glow ? UV.glow : UV.solid, color: shellCol, extra: { aFin: [0, 0, 0] } });
  addSphere(B, V(0, 0.13, 0.31), 1, shade(pal.back, 0.05), { sx: 0.02, sy: 0.015, sz: 0.06 }); // rostrum
  // abdomen segments (curling down for shrimp)
  let z = -0.06, y = 0.1, ang = 0;
  for (let i = 0; i < segN; i++) {
    const r = bodyR * (1 - i * 0.1);
    B.add(ellipsoid(r * 0.95, r * 0.75, 0.06, lod ? 12 : 18, lod ? 7 : 10), { matrix: mat(0, y, z, ang, 0, 0), uv: sp.glow ? UV.glow : UV.solid, color: shellCol, extra: { aFin: [i > 2 ? FIN.limb : 0, i > 2 ? (i - 2) * 0.15 : 0, 0] } });
    z -= 0.062 * Math.cos(ang); y -= 0.062 * Math.sin(ang) + (shrimp ? 0.008 : 0.004);
    if (shrimp) ang += 0.22;
  }
  // tail fan
  for (let k = -2; k <= 2; k++) {
    const base = V(0, y, z + 0.02);
    const d = V(k * 0.35, -Math.sin(ang) * 0.6, -1).normalize();
    const root = s => base.clone().add(V((s - 0.5) * 0.03, 0, 0));
    const tip = s => base.clone().addScaledVector(d, 0.09 * (0.7 + 0.3 * Math.sin(Math.PI * s))).add(V((s - 0.5) * 0.06, 0, 0));
    addFin(B, root, tip, 4, 1, FIN.tail, 0, { thick: 0.004 });
  }
  // legs
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const zb = 0.18 - i * 0.05;
      leg([V(side * bodyR * 0.7, 0.07, zb), V(side * (bodyR + 0.07), 0.08, zb - 0.01), V(side * (bodyR + 0.12), -0.01, zb - 0.03)], 0.01, 0.005, side, i);
    }
    eyeStalk(V(side * 0.03, 0.15, 0.28), V(side * 0.05, 0.19, 0.31), shrimp ? 0.022 : 0.02);
    // antennae
    const ant = lobster ? 0.75 : shrimp ? 0.8 : 0.5;
    const a0 = V(side * 0.03, 0.12, 0.3);
    addTube(B, [a0, a0.clone().add(V(side * 0.05, 0.04, ant * 0.3)), a0.clone().add(V(side * ant * 0.25, 0.05, ant * 0.6)), a0.clone().add(V(side * ant * 0.55, 0.02, ant * 0.55))], 0.007, 0.0018, pal.fin, FIN.sway, side, 4);
    addTube(B, [a0, a0.clone().add(V(side * 0.03, 0.02, 0.12)), a0.clone().add(V(side * 0.08, 0.03, 0.2))], 0.004, 0.0015, pal.fin, FIN.sway, side, 4);
    if (!shrimp) {
      const k = lobster ? 1.25 : 0.85;
      const c0 = V(side * 0.07, 0.08, 0.22), c1 = V(side * 0.16 * k, 0.09, 0.32), c2 = V(side * 0.13 * k, 0.09, 0.42 * (0.85 + 0.15 * k));
      addTube(B, [c0, c1, c2], 0.024 * k, 0.022 * k, pal.fin, FIN.limb, side * 0.3, seg, { flexScale: 0.3 });
      B.add(ellipsoid(0.055 * k, 0.034 * k, 0.1 * k, 12, 8), { matrix: mat(c2.x, c2.y, c2.z + 0.08 * k, 0, -side * 0.15, 0), uv: UV.solid, color: pal.fin, extra: { aFin: [FIN.limb, 0.3, side] } });
      B.add(cone(0.026 * k, 0.11 * k, 7), { matrix: aim(V(c2.x - side * 0.012, c2.y + 0.008, c2.z + 0.16 * k), V(-side * 0.25, 0, 1)), uv: UV.solid, color: pal.accent, extra: { aFin: [FIN.limb, 0.5, side] } });
      B.add(cone(0.02 * k, 0.09 * k, 7), { matrix: aim(V(c2.x + side * 0.014, c2.y - 0.008, c2.z + 0.16 * k), V(side * 0.12, 0, 1)), uv: UV.solid, color: pal.accent, extra: { aFin: [FIN.limb, 0.7, side] } });
    }
    if (sp.feat.has('spines')) for (let i = 0; i < 3; i++) B.add(cone(0.008, 0.03, 4), { matrix: aim(V(side * 0.05, 0.19, 0.18 - i * 0.05), V(side * 0.4, 1, 0.3)), uv: UV.solid, color: pal.accent, extra: { aFin: [0, 0, 0] } });
  }
  return B;
}

/** Squid, octopus, cuttlefish. */
function buildCephalopod(sp, lod) {
  const B = new Builder({ aFin: 3 });
  const pal = sp.pal, v = sp.variant;
  const NS = lod ? 18 : 30, NR = lod ? 14 : 24;
  const armCol = (p, n) => mixCol(pal.belly, pal.back, THREE.MathUtils.smoothstep(n.y, -0.5, 0.6));
  const eye = (p, r, side) => {
    addSphere(B, p, r, '#fbf7ec');
    const n = V(side, 0.2, 0.25).normalize();
    addSphere(B, p.clone().addScaledVector(n, r * 0.55), r * 0.62, BLACK);
    addSphere(B, p.clone().addScaledVector(n, r * 1.05).add(V(0, r * 0.3, 0.004)), r * 0.2, '#ffffff');
  };
  if (v === 'octopus') {
    // mantle (lofted along z so the skin pattern applies), tilted back and up
    const sec = u => { const k = Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.92 + 0.04)), 0.7); return { z: 0.28 - 0.42 * u, yc: 0, ht: 0.19 * k, hb: 0.17 * k, w: 0.17 * k, e: 2 }; };
    B.add(loft(sec, NS, NR, { warp: 1 }), { matrix: mat(0, 0.26, -0.04, -0.75, 0, 0), uvRect: UV.body, extra: { aFin: [0, 0, 0] } });
    B.add(ellipsoid(0.15, 0.11, 0.13, 18, 12), { matrix: mat(0, 0.1, 0.1), uv: UV.solid, color: armCol, extra: { aFin: [0, 0, 0] } });
    for (const side of [-1, 1]) eye(V(side * 0.105, 0.16, 0.16), 0.045, side);
    addSphere(B, V(0, 0.06, 0.22), 1, mixCol(pal.back, BLACK, 0.4), { sx: 0.018, sy: 0.012, sz: 0.01 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8, d = V(Math.sin(a), 0, Math.cos(a));
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10, r = 0.06 + t * 0.42, curl = Math.max(0, t - 0.62) / 0.38;
        const side = V(-d.z, 0, d.x).multiplyScalar(Math.sin(curl * 2.4) * 0.07 * curl);
        pts.push(V(d.x * r, 0.06 - t * 0.08 + Math.sin(curl * 3.2) * 0.07 * curl, d.z * r + 0.06).add(side));
      }
      addTube(B, pts, 0.05, 0.007, armCol, FIN.limb, Math.sin(a) >= 0 ? 1 + i * 0.3 : -1 - i * 0.3, lod ? 6 : 9, { smooth: 18 });
      if (!lod) for (let k = 1; k < 6; k++) { const p = pts[k].clone(); p.y -= 0.03 * (1 - k / 8); addSphere(B, p, 0.011 * (1 - k / 8), mixCol(pal.belly, '#ffffff', 0.3), { fin: [FIN.limb, k / 10, Math.sin(a) >= 0 ? 1 : -1] }); }
    }
    return B;
  }
  if (v === 'cuttlefish') {
    const sec = u => { const k = Math.pow(Math.sin(Math.PI * Math.min(1, 0.02 + u * 0.96)), 0.55); return { z: 0.22 - 0.58 * u, yc: 0, ht: 0.085 * k, hb: 0.07 * k, w: 0.15 * k, e: 2.2 }; };
    B.add(loft(sec, NS, NR, { warp: 1 }), { uvRect: UV.body, extra: { aFin: [0, 0, 0] } });
    for (const side of [-1, 1]) {
      const root = s => { const S = sec(0.04 + 0.92 * s); return V(side * S.w * 0.95, -0.005, S.z); };
      const tip = s => { const r = root(s); const w = 0.04 * (0.4 + 0.6 * Math.sin(Math.PI * s)); return V(r.x + side * w, r.y - 0.005, r.z); };
      addFin(B, root, tip, 16, 2, FIN.vripple, side, { thick: 0.003 });
    }
    B.add(ellipsoid(0.1, 0.075, 0.08, 16, 12), { matrix: mat(0, 0.0, 0.27), uv: UV.solid, color: armCol, extra: { aFin: [0, 0, 0] } });
    for (const side of [-1, 1]) eye(V(side * 0.085, 0.035, 0.28), 0.04, side);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, o = V(Math.cos(a) * 0.04, Math.sin(a) * 0.03 - 0.01, 0.33);
      addTube(B, [o, o.clone().add(V(Math.cos(a) * 0.02, Math.sin(a) * 0.015, 0.07)), o.clone().add(V(Math.cos(a) * 0.015, Math.sin(a) * 0.01 - 0.01, 0.14))], 0.016, 0.004, armCol, FIN.limb, Math.cos(a) >= 0 ? 1 + i * 0.2 : -1 - i * 0.2, 6);
    }
    return B;
  }
  // squid: mantle-first at +z, fins near the tip, arms trailing at -z
  const sec = u => { const k = u < 0.18 ? Math.pow(u / 0.18, 0.6) : 1 - 0.08 * (u - 0.18); return { z: 0.5 - 0.58 * u, yc: 0, ht: 0.075 * k, hb: 0.068 * k, w: 0.072 * k, e: 2 }; };
  B.add(loft(sec, NS, NR, { warp: 1.1 }), { uvRect: UV.body, extra: { aFin: [0, 0, 0] } });
  for (const side of [-1, 1]) {
    const root = s => { const S = sec(0.04 + 0.26 * s); return V(side * S.w * 0.9, 0, S.z); };
    const tip = s => { const r = root(s); return V(r.x + side * 0.11 * Math.sin(Math.PI * Math.min(1, s * 1.1)), 0, r.z - 0.03); };
    addFin(B, root, tip, 10, 2, FIN.pect, side, { thick: 0.004 });
  }
  B.add(ellipsoid(0.065, 0.06, 0.08, 16, 12), { matrix: mat(0, 0, -0.12), uv: UV.solid, color: armCol, extra: { aFin: [0, 0, 0] } });
  for (const side of [-1, 1]) eye(V(side * 0.055, 0.015, -0.11), 0.038, side);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU, long = i === 2 || i === 7;
    const o = V(Math.cos(a) * 0.035, Math.sin(a) * 0.03, -0.17);
    const L = long ? 0.36 : 0.2;
    const pts = [o, o.clone().add(V(Math.cos(a) * 0.02, Math.sin(a) * 0.02, -L * 0.4)), o.clone().add(V(Math.cos(a) * 0.03, Math.sin(a) * 0.025 - 0.01, -L))];
    addTube(B, pts, long ? 0.008 : 0.014, 0.004, armCol, FIN.limb, Math.cos(a) >= 0 ? 1 + i * 0.2 : -1 - i * 0.2, 6);
    if (long) addSphere(B, pts[2], 0.012, armCol, { sz: 2, fin: [FIN.limb, 1, 1] });
  }
  return B;
}

/** Seahorse (upright). */
function buildSeahorse(sp, lod) {
  const B = new Builder({ aFin: 3 });
  const pal = sp.pal;
  const path = [V(0, 0.8, 0.27), V(0, 0.81, 0.17), V(0, 0.83, 0.07), V(0, 0.84, -0.02), V(0, 0.76, -0.07), V(0, 0.62, -0.03), V(0, 0.48, 0.05), V(0, 0.34, 0.07), V(0, 0.22, 0.02), V(0, 0.12, -0.06), V(0, 0.03, -0.07), V(0, -0.02, -0.01), V(0, 0.0, 0.05), V(0, 0.05, 0.06), V(0, 0.08, 0.02)];
  const rad = t => {
    const k = [[0, 0.022], [0.1, 0.026], [0.16, 0.07], [0.24, 0.075], [0.32, 0.06], [0.42, 0.09], [0.52, 0.105], [0.62, 0.08], [0.72, 0.05], [0.85, 0.03], [1, 0.012]];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const f = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]); return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (0.5 - 0.5 * Math.cos(Math.PI * f)); }
    return 0.012;
  };
  const g = sweep(path, t => [rad(t) * 0.82, rad(t)], lod ? 12 : 20, { capEnd: true, capStart: true, smooth: lod ? 40 : 80, up: V(1, 0, 0) });
  B.add(g, { uvRect: UV.body, extra: { aFin: [0, 0, 0] } });
  // eye
  const ep = V(0.055, 0.85, 0.06);
  for (const side of [-1, 1]) { const p = ep.clone(); p.x *= side; addSphere(B, p, 0.03, '#fbf7ec'); addSphere(B, p.clone().add(V(side * 0.018, 0, 0.01)), 0.02, BLACK); addSphere(B, p.clone().add(V(side * 0.03, 0.01, 0.016)), 0.007, '#ffffff'); }
  // coronet
  for (let i = 0; i < 4; i++) B.add(cone(0.014, 0.05 - i * 0.006, 5), { matrix: aim(V(0, 0.9 - i * 0.012, 0.0 - i * 0.03), V(0, 1, -0.3 - i * 0.2)), uv: UV.solid, color: pal.accent, extra: { aFin: [0, 0, 0] } });
  // dorsal fin (fluttering) and pectorals
  const root = s => V(0, 0.54 - s * 0.14, -0.075 + s * 0.015);
  const tip = s => V(0, 0.54 - s * 0.14, -0.075 + s * 0.015 - 0.07 * Math.pow(Math.sin(Math.PI * s), 0.7) - 0.004);
  addFin(B, root, tip, 6, 2, FIN.ripple, 0);
  for (const side of [-1, 1]) {
    const r = s => V(side * 0.05, 0.74 - s * 0.03, -0.04);
    const t = s => V(side * 0.09, 0.74 - s * 0.05, -0.08);
    addFin(B, r, t, 3, 1, FIN.pect, side);
  }
  // little ridges
  for (let i = 0; i < 9; i++) { const t = 0.3 + i * 0.065; const p = path[Math.min(path.length - 1, Math.round(t * (path.length - 1)))]; B.add(cone(0.008, 0.02, 4), { matrix: aim(p.clone().add(V(0, 0, -rad(t))), V(0, 0.2, -1)), uv: UV.solid, color: pal.accent, extra: { aFin: [0, 0, 0] } }); }
  return B;
}

// ---- junk ----
function buildJunk(sp, lod) {
  const B = new Builder({ aFin: 3 });
  const p = sp.pal, kind = sp.shape.replace('junk_', '');
  const add = (geo, m, color, glowUv = false) => B.add(geo, { matrix: m, uv: glowUv ? UV.glow : UV.solid, color, extra: { aFin: [0, 0, 0] } });
  const seg = lod ? 12 : 24;
  switch (kind) {
    case 'boot': {
      add(new THREE.CylinderGeometry(0.15, 0.17, 0.45, seg), mat(0, 0.32, -0.12), p.back);
      add(new THREE.TorusGeometry(0.155, 0.025, 8, seg), mat(0, 0.55, -0.12, Math.PI / 2, 0, 0), p.belly);
      add(ellipsoid(0.17, 0.12, 0.3, seg, 12), mat(0, 0.11, 0.06), p.back);
      add(ellipsoid(0.17, 0.025, 0.31, seg, 6), mat(0, 0.0, 0.06), p.belly);
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.2, 0.012, 0.016), mat(0, 0.24 + i * 0.07 - i * 0.012, 0.03 + i * 0.012 - 0.02, -0.6, 0, 0), p.accent);
      addTube(B, [V(0.05, 0.56, -0.05), V(0.1, 0.7, 0.0), V(0.03, 0.82, -0.04), V(0.08, 0.92, 0.01)], 0.012, 0.006, '#4f8a3c', FIN.sway, 1, 5);
      break;
    }
    case 'can': {
      add(new THREE.CylinderGeometry(0.16, 0.16, 0.42, seg), mat(0, 0.21, 0), p.back);
      add(new THREE.CylinderGeometry(0.162, 0.162, 0.14, seg), mat(0, 0.22, 0), p.accent);
      add(new THREE.CylinderGeometry(0.15, 0.16, 0.03, seg), mat(0, 0.435, 0), p.belly);
      add(new THREE.CylinderGeometry(0.16, 0.15, 0.03, seg), mat(0, -0.005, 0), p.belly);
      add(new THREE.TorusGeometry(0.03, 0.008, 6, 12), mat(0.05, 0.455, 0, Math.PI / 2, 0, 0), p.fin);
      break;
    }
    case 'hat': {
      const brim = new THREE.CylinderGeometry(0.42, 0.44, 0.03, seg * 2, 1);
      const pos = brim.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z); pos.setY(i, pos.getY(i) - Math.pow(Math.max(0, r - 0.2), 2) * 0.5 + Math.sin(Math.atan2(z, x) * 3) * 0.02 * r); }
      brim.computeVertexNormals();
      add(brim, mat(0, 0.05, 0), p.back);
      add(new THREE.CylinderGeometry(0.19, 0.22, 0.2, seg), mat(0, 0.16, 0), p.belly);
      add(ellipsoid(0.19, 0.06, 0.19, seg, 8), mat(0, 0.26, 0), p.belly);
      add(new THREE.CylinderGeometry(0.222, 0.222, 0.05, seg), mat(0, 0.09, 0), p.fin);
      break;
    }
    case 'bottle': {
      const pts = [[0, 0], [0.13, 0], [0.14, 0.02], [0.14, 0.34], [0.12, 0.42], [0.06, 0.5], [0.045, 0.56], [0.045, 0.66], [0.05, 0.68]].map(([x, y]) => new THREE.Vector2(x, y));
      add(new THREE.LatheGeometry(pts, seg), mat(0, -0.34, 0, 0, 0, 0), p.back);
      add(new THREE.CylinderGeometry(0.043, 0.04, 0.08, 10), mat(0, 0.36, 0), p.fin);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 12), mat(0, -0.15, 0, 0.1, 0, 0.05), p.accent);
      break;
    }
    case 'duck': {
      add(ellipsoid(0.26, 0.2, 0.32, seg, 16), mat(0, 0.18, -0.04), p.back);
      add(ellipsoid(0.08, 0.06, 0.1, 10, 8), mat(0, 0.3, -0.33, 0.6, 0, 0), p.back);
      add(ellipsoid(0.16, 0.16, 0.16, seg, 14), mat(0, 0.44, 0.14), p.back);
      add(ellipsoid(0.08, 0.035, 0.1, 12, 8), mat(0, 0.42, 0.3), p.fin);
      for (const s of [-1, 1]) { addSphere(B, V(s * 0.09, 0.5, 0.25), 0.03, p.accent); addSphere(B, V(s * 0.11, 0.51, 0.265), 0.008, '#ffffff'); add(ellipsoid(0.04, 0.1, 0.16, 10, 8), mat(s * 0.24, 0.2, -0.05, 0, 0, s * 0.3), p.belly); }
      break;
    }
    case 'gem': {
      const g = new THREE.IcosahedronGeometry(0.25, lod ? 1 : 2);
      const pos = g.attributes.position, R = rng('gem');
      for (let i = 0; i < pos.count; i++) { const v = V().fromBufferAttribute(pos, i); v.multiply(V(1.25, 0.5, 0.9)); v.multiplyScalar(1 + 0.06 * Math.sin(v.x * 9 + v.z * 7)); pos.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals();
      add(g, mat(0, 0.12, 0), p.back, true);
      break;
    }
    case 'coin': {
      add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, seg * 2), mat(0, 0.3, 0, Math.PI / 2, 0, 0), p.back);
      add(new THREE.TorusGeometry(0.28, 0.025, 8, seg * 2), mat(0, 0.3, 0.0), p.belly);
      add(new THREE.TorusGeometry(0.28, 0.025, 8, seg * 2), mat(0, 0.3, 0.0, 0, Math.PI, 0), p.belly);
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.07 : 0.16; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const sg = new THREE.ExtrudeGeometry(star, { depth: 0.02, bevelEnabled: false });
      add(sg, mat(0, 0.3, 0.02), p.accent); add(sg.clone(), mat(0, 0.3, -0.02, 0, Math.PI, 0), p.accent);
      break;
    }
    case 'key': {
      add(new THREE.TorusGeometry(0.12, 0.035, 10, seg), mat(0, 0.2, 0.3, 0, Math.PI / 2, 0), p.back);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 10), mat(0, 0.2, -0.05, Math.PI / 2, 0, 0), p.back);
      add(new THREE.BoxGeometry(0.03, 0.14, 0.08), mat(0, 0.13, -0.26), p.fin);
      add(new THREE.BoxGeometry(0.03, 0.08, 0.05), mat(0, 0.12, -0.16), p.fin);
      add(new THREE.TorusGeometry(0.04, 0.012, 6, 10), mat(0, 0.2, 0.15, 0, Math.PI / 2, 0), p.accent);
      break;
    }
    case 'crown': {
      const band = new THREE.CylinderGeometry(0.28, 0.25, 0.18, seg * 2, 1, true);
      add(band, mat(0, 0.12, 0), p.back); add(band.clone(), mat(0, 0.12, 0, 0, 0, 0), p.back);
      B.add(new THREE.CylinderGeometry(0.276, 0.246, 0.18, seg * 2, 1, true), { matrix: mat(0, 0.12, 0), uv: UV.solid, color: shade(p.back, -0.2), flip: true, extra: { aFin: [0, 0, 0] } });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        add(cone(0.06, 0.16, 4), aim(V(Math.cos(a) * 0.27, 0.2, Math.sin(a) * 0.27), V(Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15)), p.back);
        addSphere(B, V(Math.cos(a) * 0.285, 0.12, Math.sin(a) * 0.285), 0.032, i % 2 ? p.fin : p.accent);
        addSphere(B, V(Math.cos(a) * 0.29, 0.38, Math.sin(a) * 0.29), 0.022, p.belly);
      }
      break;
    }
    default: add(new THREE.BoxGeometry(0.4, 0.3, 0.3), mat(0, 0.15, 0), p.back);
  }
  return B;
}

/** Scale/centre a geometry so its largest horizontal extent (z for fish) is 1 and it is centred at the origin. */
function normalize(geo, mode) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, size = bb.getSize(V()), c = bb.getCenter(V());
  const ext = mode === 'z' ? size.z : mode === 'xz' ? Math.max(size.x, size.z) : Math.max(size.x, size.y, size.z);
  const s = 1 / Math.max(1e-6, ext);
  geo.translate(-c.x, -c.y, -c.z);
  geo.scale(s, s, s);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

// ------------------------------------------------------------------------------------------------
// material with the swimming deformation
// ------------------------------------------------------------------------------------------------
const VERT_COMMON = /* glsl */`
  uniform float uPhase, uAmp, uWaves, uBend, uFlap, uTime, uStiff, uPitch;
  attribute vec3 aFin;
  vec3 fishFlutter(vec3 p) {
    float type = aFin.x, f = aFin.y, side = aFin.z;
    if (type < 0.5) return p;
    if (type < 1.5) { float a = sin(uTime * 7.0 + side * 0.7) * (0.45 + uFlap); p.x += side * f * a * 0.03; p.y += f * a * 0.02; }
    else if (type < 2.5) { p.x += f * sin(uTime * 6.0 - p.z * 24.0) * 0.012 * (0.6 + uFlap); }
    else if (type < 3.5) { p.x += f * f * sin(uPhase - 1.4) * (0.012 + uAmp * 0.5); }
    else if (type < 4.5) { float ph = uTime * (5.0 + 6.0 * uFlap) + side * 1.7 + p.z * 14.0; p.y += f * sin(ph) * 0.022 * (0.35 + uFlap); p.x += f * cos(ph) * 0.016 * sign(side) * (0.35 + uFlap); }
    else if (type < 5.5) { p.x += f * sin(uTime * 2.3 + p.z * 7.0 + side) * 0.022; p.y += f * cos(uTime * 1.8 + side * 2.0) * 0.014; }
    else { p.y += f * sin(uTime * 6.0 - p.z * 22.0 + side) * 0.012 * (0.6 + uFlap); }
    return p;
  }
  vec2 fishBend(float z) {
    float s = clamp(0.5 - z, 0.0, 1.0);
    float env = mix(uStiff, 1.0, s * s);
    float w = 6.2831853 * uWaves;
    float sn = sin(uPhase - s * w), cs = cos(uPhase - s * w);
    float off = uAmp * env * sn + uBend * 0.42 * s * s;
    float d = uAmp * ((1.0 - uStiff) * 2.0 * s * sn - env * w * cs) + uBend * 0.84 * s;
    return vec2(off, -d);
  }
`;
const VERT_NORMAL = /* glsl */`
  #include <beginnormal_vertex>
  { vec2 fb = fishBend(position.z); float an = atan(fb.y); float c = cos(an), s = sin(an);
    objectNormal = vec3(objectNormal.x * c + objectNormal.z * s, objectNormal.y, -objectNormal.x * s + objectNormal.z * c); }
`;
const VERT_POS = /* glsl */`
  #include <begin_vertex>
  { transformed = fishFlutter(transformed);
    vec2 fb = fishBend(position.z); float an = atan(fb.y); float c = cos(an), s = sin(an);
    transformed = vec3(fb.x + transformed.x * c, transformed.y + uPitch * position.z * position.z * -0.3, transformed.z - transformed.x * s); }
`;

function patchShader(sh, U, frag = true) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_COMMON)
    .replace('#include <beginnormal_vertex>', VERT_NORMAL)
    .replace('#include <begin_vertex>', VERT_POS);
  if (frag) {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform float uMurk, uAlpha;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, uTint, uMurk); gl_FragColor.a *= uAlpha;');
  }
}

function makeUniforms(sw) {
  return {
    uPhase: { value: Math.random() * TAU }, uAmp: { value: sw.amp }, uWaves: { value: sw.waves }, uBend: { value: 0 },
    uFlap: { value: 0.3 }, uTime: { value: Math.random() * 10 }, uStiff: { value: sw.stiff }, uPitch: { value: 0 },
    uTint: { value: new THREE.Color(0x2a8fa0) }, uMurk: { value: 0 }, uAlpha: { value: 1 },
  };
}

function makeMaterial(base, U) {
  const m = base.clone();
  m.onBeforeCompile = sh => patchShader(sh, U);
  m.customProgramCacheKey = () => 'lenzaFish' + (m.transparent ? 't' : 'o');
  return m;
}

function makeDepthMaterial(U) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_COMMON).replace('#include <begin_vertex>', VERT_POS);
  };
  m.customProgramCacheKey = () => 'lenzaFishDepth';
  return m;
}

// ------------------------------------------------------------------------------------------------
// factory
// ------------------------------------------------------------------------------------------------
/** Small built-in samples used only when src/data/fish.js cannot be loaded. */
const SAMPLES = [
  { id: 'sample_trout', rarity: 'common', size: [20, 50], model: { shape: 'torpedo', height: 0.26, palette: { back: '#7a6438', belly: '#f0e2ba', fin: '#a07a40', accent: '#d23a2a' }, pattern: 'spots', fins: { dorsal: 'small', tail: 'square', pectoral: 'small' }, eye: 'normal' } },
  { id: 'sample_carp', rarity: 'common', size: [30, 80], model: { shape: 'round', height: 0.38, palette: { back: '#6b5a2e', belly: '#e0c982', fin: '#8a5a2b', accent: '#b8913c' }, pattern: 'dots', fins: { dorsal: 'long', tail: 'fork', pectoral: 'small' }, features: ['barbels'] } },
  { id: 'sample_eel', rarity: 'uncommon', size: [40, 90], model: { shape: 'eel', height: 0.08, palette: { back: '#3d4a2a', belly: '#d6d2a2', fin: '#4a5530', accent: '#2a311c' }, pattern: 'gradient', fins: { dorsal: 'long', tail: 'pointed', pectoral: 'small' }, eye: 'small' } },
];

/**
 * Create the fish model factory.
 * @param {any} ctx core context (uses ctx.data.fish/junk, ctx.renderer for thumbnails)
 * @param {{records?:object[]}} [o]
 */
export function createFishModels(ctx, o = {}) {
  const records = new Map();
  for (const r of o.records || [...(ctx?.data?.fish || []), ...(ctx?.data?.junk || [])]) records.set(r.id, r);
  if (!records.size) for (const r of SAMPLES) records.set(r.id, r);

  const specs = new Map(), geos = new Map(), skins = new Map(), bases = new Map();
  const thumbs = new Map(), sils = new Map();
  const spec = id => {
    if (!specs.has(id)) { const r = records.get(id); if (!r) return null; specs.set(id, specOf(r)); }
    return specs.get(id);
  };
  const swimOf = sp => {
    const s = SHAPES[sp.shape] || SHAPES.torpedo;
    if (sp.junk || sp.shape === 'crab' || sp.variant === 'seahorse') return { amp: 0, waves: 0, stiff: 1, mode: sp.junk ? 'junk' : sp.variant === 'seahorse' ? 'upright' : 'crawl' };
    if (sp.shape === 'squid') return { amp: 0.008, waves: 0.5, stiff: 0.2, mode: 'jet' };
    let amp = s.amp, stiff = s.stiff;
    if (sp.fins.tail === 'lunate') { amp *= 0.8; stiff = 0.03; }
    if (sp.tw.mola) { amp = 0.012; stiff = 0.6; }
    if (sp.feat.has('puff')) amp *= 0.6;
    return { amp, waves: s.waves, stiff, mode: sp.shape === 'flat' ? 'flat' : 'swim' };
  };

  function geometry(id, lod = 0) {
    const key = id + ':' + lod;
    if (geos.has(key)) return geos.get(key);
    const sp = spec(id);
    if (!sp) return null;
    let B, mode = 'z';
    if (sp.junk) { B = buildJunk(sp, lod); mode = 'all'; }
    else if (sp.variant === 'seahorse') { B = buildSeahorse(sp, lod); mode = 'all'; }
    else if (sp.shape === 'crab') { B = buildCrab(sp, lod); mode = sp.variant ? 'z' : 'xz'; }
    else if (sp.shape === 'squid') { B = buildCephalopod(sp, lod); mode = sp.variant === 'octopus' ? 'xz' : 'z'; }
    else B = buildFish(sp, lod);
    const g = normalize(B.build(), mode);
    g.userData.species = id;
    geos.set(key, g);
    return g;
  }

  function skin(id) {
    if (!skins.has(id)) skins.set(id, paintSkin(spec(id)));
    return skins.get(id);
  }

  function baseMaterial(id) {
    if (bases.has(id)) return bases.get(id);
    const sp = spec(id), s = skin(id);
    const metal = sp.junk && ['coin', 'key', 'crown', 'can'].includes(sp.shape.replace('junk_', ''));
    const glass = sp.transparent || ['junk_bottle', 'junk_gem'].includes(sp.shape);
    const m = new THREE.MeshStandardMaterial({
      map: s.map, vertexColors: true,
      roughness: sp.junk ? (metal ? 0.38 : 0.75) : 0.42, metalness: metal ? 0.55 : 0,
      emissive: sp.glow ? new THREE.Color(sp.glow) : new THREE.Color(0), emissiveMap: s.emissive || null, emissiveIntensity: sp.glow ? 1.2 : 0,
      transparent: glass, opacity: glass ? 0.78 : 1,
    });
    if (sp.shape === 'junk_gem') m.emissive.set(sp.pal.back), m.emissiveIntensity = 0.15;
    bases.set(id, m);
    return m;
  }

  /**
   * Create a fish/junk instance.
   * @param {string} id species id
   * @param {{lod?:0|1|2, size?:number, scale?:number, shadow?:boolean}} [opts] size in cm (default mid of the
   *   species range); scale overrides it with a length in metres.
   */
  function create(id, opts = {}) {
    const sp = spec(id);
    if (!sp) { console.warn('[fishModels] unknown species', id); return null; }
    const lod = opts.lod ?? 0;
    const sw = swimOf(sp);
    const U = makeUniforms(sw);
    const mesh = new THREE.Mesh(geometry(id, lod), makeMaterial(baseMaterial(id), U));
    mesh.name = 'fish:' + id;
    mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = false;
    mesh.customDepthMaterial = makeDepthMaterial(U);
    const object = new THREE.Group(); object.name = 'Fish_' + id; object.add(mesh);
    const rec = sp.rec;
    const sizeCm = opts.size ?? (rec.size && rec.size[1] ? (rec.size[0] + rec.size[1]) / 2 : 30);
    const length = opts.scale ?? Math.max(0.05, sizeCm / 100);
    object.scale.setScalar(length);
    let bendS = 0, speedS = 0, glowBase = baseMaterial(id).emissiveIntensity;
    const inst = {
      id, object, mesh, species: rec, spec: sp, mode: sw.mode, length, uniforms: U,
      /** Advance the swim animation. swimSpeed 0 (hover) … 1 (cruise) … 2+ (burst); bend -1..1 turns the body. */
      animate(dt, swimSpeed = 1, bend = 0) {
        speedS += (swimSpeed - speedS) * Math.min(1, dt * 4);
        bendS += (bend - bendS) * Math.min(1, dt * 6);
        const sp2 = Math.max(0, speedS);
        U.uTime.value += dt * (0.8 + Math.min(2, sp2) * 0.6);
        U.uPhase.value += dt * (sw.mode === 'flat' ? 3 : 4.2) * (0.35 + sp2 * 0.9);
        U.uAmp.value = sw.amp * (0.3 + 0.7 * Math.min(1.6, sp2));
        U.uBend.value = THREE.MathUtils.clamp(bendS, -1.2, 1.2) * (sw.amp > 0 ? 1 : 0);
        U.uFlap.value = Math.min(1.4, 0.25 + sp2 * 0.5);
        if (sw.mode === 'upright') mesh.position.y = Math.sin(U.uTime.value * 1.6) * 0.03;
        if (sw.mode === 'jet') { const k = Math.max(0, Math.sin(U.uPhase.value * 0.5)); mesh.scale.set(1 - k * 0.06, 1 - k * 0.06, 1 + k * 0.05); }
        if (sw.mode === 'junk') { mesh.rotation.z = Math.sin(U.uTime.value * 1.3) * 0.12; mesh.rotation.x = Math.sin(U.uTime.value * 0.9) * 0.08; }
        if (glowBase > 0) mesh.material.emissiveIntensity = glowBase * (0.8 + 0.2 * Math.sin(U.uTime.value * 2.1));
      },
      /** Underwater look: murk 0..1 toward tint, alpha 0..1 (null = normal). */
      setSubmerged(o2) {
        const m = mesh.material;
        if (!o2) { U.uMurk.value = 0; U.uAlpha.value = 1; m.transparent = baseMaterial(id).transparent; m.depthWrite = true; return; }
        if (o2.tint) U.uTint.value.set(o2.tint);
        U.uMurk.value = o2.murk ?? 0.4; U.uAlpha.value = o2.alpha ?? 0.8;
        if (!m.transparent) { m.transparent = true; m.needsUpdate = true; }
        m.depthWrite = false;
      },
      /** Multiply the base glow (0 = off). */
      setGlow(k = 1) { glowBase = baseMaterial(id).emissiveIntensity * k; mesh.material.emissiveIntensity = glowBase; },
      dispose() { mesh.material.dispose(); mesh.customDepthMaterial.dispose(); object.removeFromParent(); },
    };
    if (sp.transparent) mesh.renderOrder = 2;
    inst.animate(0, opts.swim ?? 0.6, 0);
    return inst;
  }

  // ---- thumbnails (offscreen render through the shared renderer) ----
  let T = null;
  function thumbRig() {
    if (T) return T;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(26, 1, 0.01, 20);
    const hemi = new THREE.HemisphereLight(0xdff2ff, 0xa89070, 1.5);
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(-1.5, 2.6, 2.4);
    const rim = new THREE.DirectionalLight(0xbfe4ff, 1.6); rim.position.set(1.2, 1.2, -2.6);
    const fill = new THREE.DirectionalLight(0xffe6d0, 0.5); fill.position.set(2, -1, 1);
    scene.add(hemi, key, rim, fill);
    const quadMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, exposure: { value: 1.0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc; uniform float exposure; varying vec2 vUv;
        vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 aces(vec3 c){
          const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
          const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
          c *= exposure / 0.6; c = IN * c; c = RRTAndODTFit(c); c = OUT * c; return clamp(c, 0.0, 1.0); }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main(){ vec4 s = texture2D(tSrc, vUv); vec3 c = s.a > 0.0 ? s.rgb / s.a : vec3(0.0);
          gl_FragColor = vec4(toSRGB(aces(c)), s.a); }`,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat); quad.frustumCulled = false;
    const qScene = new THREE.Scene(); qScene.add(quad);
    T = { scene, cam, quadMat, qScene, rts: new Map() };
    return T;
  }

  function renderThumb(id, size) {
    const renderer = ctx?.renderer;
    if (!renderer || !spec(id)) return null;
    const R = thumbRig();
    const px = size * 2;
    let rt = R.rts.get(px);
    if (!rt) {
      const isGL2 = renderer.capabilities.isWebGL2;
      rt = { src: new THREE.WebGLRenderTarget(px, px, { type: THREE.HalfFloatType, samples: isGL2 ? 4 : 0 }), out: new THREE.WebGLRenderTarget(px, px, { type: THREE.UnsignedByteType }) };
      R.rts.set(px, rt);
    }
    const inst = create(id, { lod: 0, scale: 1, shadow: false });
    const sp = inst.spec;
    const o = inst.object;
    inst.uniforms.uPhase.value = 1.1; inst.uniforms.uTime.value = 0.6;
    inst.uniforms.uAmp.value = (inst.uniforms.uAmp.value || 0) * 0.5; inst.uniforms.uBend.value = sp.junk ? 0 : 0.12;
    // pose: 3/4 view, nose to the left, slightly toward the viewer
    if (sp.junk) o.rotation.set(0.35, -0.7, 0);
    else if (sp.variant === 'seahorse') o.rotation.set(0, -1.2, 0);
    else if (sp.shape === 'crab' && !sp.variant) o.rotation.set(0.55, -0.5, 0);
    else if (sp.variant === 'octopus') o.rotation.set(0.45, -0.6, 0);
    else if (sp.shape === 'flat' || sp.variant === 'cuttlefish') o.rotation.set(0.8, -Math.PI / 2 - 0.3, 0, 'YXZ');
    else o.rotation.set(0.5, -Math.PI / 2 + 0.6, 0, 'XYZ');
    if (sp.shape === 'flat' || sp.variant === 'cuttlefish') o.rotation.set(0.75, -Math.PI / 2 + 0.3, 0, 'XYZ');
    R.scene.add(o);
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(V()), s = box.getSize(V());
    const radius = Math.max(s.x, s.y) * 0.5 * 1.12 + 0.01;
    const dist = radius / Math.tan((R.cam.fov * Math.PI / 180) / 2);
    R.cam.position.set(c.x, c.y, c.z + dist + s.z * 0.5); R.cam.near = 0.01; R.cam.far = dist * 3 + 5;
    R.cam.lookAt(c); R.cam.updateProjectionMatrix();

    const prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear, prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rt.src); renderer.clear(); renderer.render(R.scene, R.cam);
    R.quadMat.uniforms.tSrc.value = rt.src.texture;
    renderer.setRenderTarget(rt.out); renderer.clear(); renderer.render(R.qScene, R.cam);
    const buf = new Uint8Array(px * px * 4);
    renderer.readRenderTargetPixels(rt.out, 0, 0, px, px, buf);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(prevClear, prevAlpha); renderer.autoClear = prevAuto; renderer.shadowMap.autoUpdate = prevShadow;
    inst.dispose();

    // flip Y into a canvas, then downsample 2x
    const big = makeCanvas(px, px), bg = big.getContext('2d'), img = bg.createImageData(px, px);
    for (let y = 0; y < px; y++) img.data.set(buf.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
    bg.putImageData(img, 0, 0);
    const out = makeCanvas(size, size), og = out.getContext('2d');
    og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
    og.drawImage(big, 0, 0, size, size);
    return out;
  }

  /** 3/4 portrait of a species (transparent PNG dataURL, cached). '' if it cannot render. */
  function thumbnail(id, size = 128) {
    const key = id + '@' + size;
    if (thumbs.has(key)) return thumbs.get(key);
    let url = '';
    try { const cv = renderThumb(id, size); if (cv) { url = cv.toDataURL('image/png'); thumbs.set(key + ':canvas', cv); } }
    catch (e) { console.warn('[fishModels] thumbnail failed', id, e); }
    thumbs.set(key, url);
    return url;
  }

  /** Dark silhouette of a species for unknown Journal entries (PNG dataURL, cached). */
  function silhouette(id, size = 128, color = 'rgba(38,58,78,0.82)') {
    const key = id + '@' + size + color;
    if (sils.has(key)) return sils.get(key);
    let url = '';
    try {
      thumbnail(id, size);
      const src = thumbs.get(id + '@' + size + ':canvas');
      if (src) {
        const cv = makeCanvas(size, size), g = cv.getContext('2d');
        g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, size, size);
        url = cv.toDataURL('image/png');
      }
    } catch (e) { console.warn('[fishModels] silhouette failed', id, e); }
    sils.set(key, url);
    return url;
  }

  const api = {
    create, thumbnail, silhouette, geometry,
    /** Normalised model params for a species (shape, palette, fins, …) or null. */
    spec: id => spec(id),
    has: id => records.has(id),
    ids: () => [...records.keys()],
    /** Swim style of a species: 'swim' | 'flat' | 'jet' | 'crawl' | 'upright' | 'junk'. */
    swimMode: id => { const sp = spec(id); return sp ? swimOf(sp).mode : null; },
    /** Drop cached thumbnails (e.g. after a GL context restore). */
    clearThumbs() { thumbs.clear(); sils.clear(); },
    dispose() { for (const g of geos.values()) g.dispose(); for (const s of skins.values()) { s.map.dispose(); s.emissive?.dispose(); } for (const m of bases.values()) m.dispose(); geos.clear(); skins.clear(); bases.clear(); thumbs.clear(); sils.clear(); },
  };
  return api;
}

/** Boot entry (src/main.js): returns ctx.fishModels. */
export async function init(ctx) {
  let recs = null;
  if (!ctx.data?.fish?.length) {
    try {
      const [f, j] = await Promise.all([import('../data/fish.js'), import('../data/junk.js')]);
      recs = [...(f.default || []), ...(j.default || [])];
    } catch { recs = SAMPLES; console.warn('[fishModels] src/data/fish.js not available: using built-in samples'); }
  }
  return createFishModels(ctx, recs ? { records: recs } : {});
}

export default { init };
