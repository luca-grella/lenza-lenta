// Procedural chunky cartoon humanoid: body, clothes and accessories built in code as ONE skinned mesh
// (vertex colours, one material, one draw call). Accessories are rigidly skinned to their bone (hat,
// glasses, rod, props...), soft parts get blended weights so elbows, knees and the belly bend cleanly.
import * as THREE from 'three';
import { RigBuilder, ellipsoid, lathe, limb, panel, ring, rod, box, smoothProfile, sstep, col, mix } from './geo.js';
import { rigSpec, createBones, ARM_ANGLE } from './skeleton.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- shared material (stylised: soft standard shading + sky rim light) -----------------------
let SHARED_MAT = null;
export const rimUniforms = { rimColor: { value: new THREE.Color(0xbfe6ff) }, rimStrength: { value: 0.32 } };

export function characterMaterial() {
  if (SHARED_MAT) return SHARED_MAT;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = rimUniforms.rimColor; sh.uniforms.rimStrength = rimUniforms.rimStrength;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor; uniform float rimStrength;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float rim = pow(1.0 - ndv, 3.0) * smoothstep(-0.2, 0.6, normal.y + 0.35);
          totalEmissiveRadiance += rimColor * rim * rimStrength * diffuseColor.rgb; }`);
  };
  m.customProgramCacheKey = () => 'lenza-char-rim';
  SHARED_MAT = m;
  return m;
}

/**
 * Build the character mesh for a normalised look (see looks.js).
 * @returns {{mesh:THREE.SkinnedMesh, skeleton:THREE.Skeleton, bones:Object<string,THREE.Bone>, spec:object,
 *   parts:object, recolor:(part:string)=>void, look:object}}
 */
export function buildCharacter(look) {
  const spec = rigSpec(look.build);
  const { bones, byName } = createBones(spec);
  const RB = new RigBuilder(spec.order);
  const J = spec.joints, B = spec.build;
  const HC = spec.headC, HR = spec.headR;
  const L = look;
  const skin = () => col(L.skin);
  const hasVest = L.shirt.style === 'vest';
  const shirtCol = () => col(hasVest ? L.shirt.color2 : L.shirt.color);

  // ======================================================= torso (lathe, elliptic, belly forward)
  const prof = smoothProfile([
    [0.47, 0.0], [0.49, 0.12], [0.53, 0.205], [0.59, 0.262], [0.67, 0.296], [0.77, 0.312], [0.87, 0.31],
    [0.97, 0.297], [1.06, 0.276], [1.13, 0.246], [1.18, 0.205], [1.22, 0.15], [1.255, 0.105], [1.29, 0.088], [1.36, 0.08], [1.40, 0.0],
  ], 34);
  const bellyK = y => 1 + (B.belly - 1) * sstep(0.5, 0.72, y) * (1 - sstep(0.9, 1.04, y));
  const chestK = y => 1 + (B.chest - 1) * sstep(0.88, 1.05, y) * (1 - sstep(1.18, 1.26, y));
  const bellyFwd = y => 0.025 * B.belly * Math.exp(-((y - 0.8) ** 2) / 0.012);
  const torsoRows = prof.map(([y, r]) => { const rx = r * bellyK(y) * chestK(y); return [y, rx, rx * B.depth, 0, bellyFwd(y)]; });
  /** torso front surface z at (x, y) (used to drape the apron and place straps). */
  const torsoAt = (y) => { let i = 0; while (i < torsoRows.length - 2 && torsoRows[i + 1][0] < y) i++; const a = torsoRows[i], b = torsoRows[i + 1]; const t = Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0] || 1))); return { rx: a[1] + (b[1] - a[1]) * t, rz: a[2] + (b[2] - a[2]) * t, oz: a[4] + (b[4] - a[4]) * t }; };
  const frontZ = (x, y) => { const r = torsoAt(y); const k = 1 - (x / Math.max(1e-3, r.rx)) ** 2; return k <= 0 ? r.oz : r.oz + r.rz * Math.sqrt(k); };

  const waistY = 0.685;
  const torsoColor = (p) => {
    const ax = Math.abs(p.x), front = p.z > 0, y = p.y;
    const sh = L.shirt, pa = L.pants;
    if (y > 1.255) return skin();
    // pack straps over the shoulders (front + top)
    if (L.pack && y > 0.86 && Math.abs(ax - 0.15) < 0.032 && (front || y > 1.12)) return col(L.pack.strap);
    // apron neck strap and waist tie
    if (L.apron && y > 1.0 && Math.abs(ax - 0.11) < 0.022 && (front || y > 1.16)) return col(L.apron.color);
    if (L.apron && !front && Math.abs(y - 0.8) < 0.018) return col(L.apron.color);
    // overall bib + straps
    if (pa.style === 'overalls') {
      if (front && ax < 0.17 && y < 1.06 && y > waistY - 0.01) return col(pa.color);
      if (y > 0.98 && Math.abs(ax - 0.12) < 0.03) return col(pa.color);
    }
    if (y < waistY) return col(pa.style === 'skirt' ? pa.color : pa.color);
    if (y < waistY + 0.035 && pa.style !== 'skirt' && pa.style !== 'overalls') return col(pa.belt || '#5a3a24');
    // shirts
    let c = col(sh.color);
    switch (sh.style) {
      case 'striped': c = (Math.floor((y - waistY) / 0.055) % 2) ? col(sh.color2) : col(sh.color); break;
      case 'flannel': { const a = Math.atan2(p.x, p.z); const cx = Math.floor(a / 0.42), cy = Math.floor(y / 0.075); c = ((cx + cy) & 1) ? col(sh.color) : mix(sh.color, sh.color2, 0.55); if (((cx & 1) && (cy & 1))) c = col(sh.color2); break; }
      case 'sweater': c = col(sh.color); if (y < waistY + 0.06 || y > 1.2) c = mix(sh.color, '#000', 0.18); break;
      case 'blouse': c = col(sh.color); if (y > 1.18 && front) c = mix(sh.color, '#fff', 0.55); break;
      case 'vest': {
        const open = front && ax < 0.045 + Math.max(0, y - 0.74) * 0.32;
        if (open) c = col(sh.color2);
        else {
          c = col(sh.color);
          if (front && y > 0.78 && y < 0.9 && ax > 0.08 && ax < 0.19) c = mix(sh.color, '#000', 0.16);           // pockets
          if (front && Math.abs(y - 0.9) < 0.008 && ax > 0.08 && ax < 0.19) c = mix(sh.color, '#000', 0.32);   // pocket flaps
          if (y > 1.17 && ax < 0.16) c = col(sh.color2);                                                        // collar
        }
        break;
      }
    }
    return c;
  };
  const torsoWeights = (p) => {
    const y = p.y, ax = Math.abs(p.x), side = p.x >= 0 ? 'L' : 'R';
    const w = [];
    // hips → spine → chest → neck
    const a = sstep(0.68, 0.88, y), b = sstep(0.88, 1.05, y), n = sstep(1.21, 1.32, y);
    let wh = 1 - a, ws = a * (1 - b), wc = b * (1 - n), wn = n;
    // crotch follows the thighs a little (no leg poking out when walking)
    const wt = 0.42 * sstep(0.62, 0.5, y) * sstep(0.02, 0.12, ax);
    wh *= 1 - wt;
    // shoulder region follows the clavicle (shrugs)
    const wsh = 0.6 * sstep(0.15, 0.27, ax) * sstep(1.0, 1.13, y) * (1 - n);
    wc *= 1 - wsh;
    w.push(['hips', wh], ['spine', ws], ['chest', wc], ['neck', wn], [`thigh_${side}`, wt], [`shoulder_${side}`, wsh]);
    return w;
  };
  RB.add(lathe({ rows: torsoRows, seg: 28 }), { part: 'torso', color: torsoColor, weights: torsoWeights });

  // ======================================================= skirt
  if (L.pants.style === 'skirt') {
    const rows = smoothProfile([[0.38, 0.37], [0.385, 0.40], [0.40, 0.405], [0.5, 0.385], [0.6, 0.36], [0.7, 0.33], [0.78, 0.305]], 12)
      .map(([y, r]) => [y, r * bellyK(Math.max(y, 0.6)), r * 0.92 * bellyK(Math.max(y, 0.6)), 0, 0.01]);
    const sk = lathe({ rows, seg: 26 });
    RB.add(sk, {
      part: 'skirt', color: (p) => (p.y < 0.405 ? mix(L.pants.color, '#000', 0.15) : col(L.pants.color)),
      weights: (p) => { const a = 0.5 * sstep(0.68, 0.42, p.y); const sx = Math.max(-1, Math.min(1, p.x / 0.25)); return [['hips', 1 - a], ['thigh_L', a * (0.5 + 0.5 * sx)], ['thigh_R', a * (0.5 - 0.5 * sx)]]; },
    });
  }

  // ======================================================= legs + boots
  for (const [side, k] of [['L', 1], ['R', -1]]) {
    const hip = J[`thigh_${side}`], ank = J[`foot_${side}`];
    const Ls = hip[1] - ank[1];
    const lt = B.limb;
    const g = limb({ a: [hip[0], hip[1], 0], b: [ank[0], ank[1] + 0.04, 0.0], seg: 14, rings: 20, flatten: 0.95,
      radii: [[0, 0.118 * lt], [0.25, 0.108 * lt], [0.5, 0.094 * lt], [0.7, 0.092 * lt], [1, 0.078 * lt]], extendB: 0.6 });
    const pa = L.pants;
    RB.add(g, {
      part: 'legs',
      color: (p) => {
        const s = hip[1] - p.y;
        if (pa.style === 'shorts' || pa.style === 'skirt') {
          const hem = pa.style === 'shorts' ? 0.2 : 0.06;
          if (s < hem) return col(pa.color);
          if (s < hem + 0.025 && pa.style === 'shorts') return mix(pa.color, '#000', 0.15);
          return skin();
        }
        if (pa.cuff && s > Ls - 0.13 && s < Ls - 0.07) return col(pa.cuff);
        return col(pa.color);
      },
      weights: (p) => {
        const s = hip[1] - p.y;
        const t = sstep(0.22, 0.31, s), f = sstep(0.49, 0.56, s);
        return [['hips', 0.12 * sstep(0.05, -0.04, s)], [`thigh_${side}`, 1 - t], [`shin_${side}`, t * (1 - f)], [`foot_${side}`, t * f]];
      },
    });
    // boot: rounded toe, flat sole, short shaft
    const bc = [ank[0] + 0.005 * k, 0.075, 0.05];
    const boot = ellipsoid({ c: bc, r: [0.108 * B.hand ** 0.5, 0.088, 0.165], seg: [18, 12], deform: (v) => { if (v.y < -0.06) v.y = -0.06 - (v.y + 0.06) * 0.15; if (v.z > 0.05) v.y += (v.z - 0.05) * 0.18; } });
    RB.add(boot, { part: 'boots', color: (p) => (p.y < 0.03 ? mix(L.boots, '#000', 0.45) : col(L.boots)), bone: `foot_${side}` });
    const shaft = limb({ a: [ank[0], 0.2, 0.0], b: [ank[0], 0.07, 0.01], seg: 14, rings: 4, radii: [[0, 0.088], [1, 0.094]], extendA: 0.25, extendB: 0 });
    RB.add(shaft, { part: 'boots', color: (p) => (p.y > 0.185 ? mix(L.boots, '#fff', 0.12) : col(L.boots)), weights: (p) => [[`shin_${side}`, sstep(0.08, 0.17, p.y)], [`foot_${side}`, 1 - sstep(0.08, 0.17, p.y)]] });
  }

  // ======================================================= arms + hands
  const sleeveLen = { tshirt: 0.15, striped: 0.17, vest: 0.14, sweater: 0.56, flannel: 0.44, blouse: 0.3 }[L.shirt.style] ?? 0.15;
  for (const [side, k] of [['L', 1], ['R', -1]]) {
    const ua = J[`upperarm_${side}`], wr = J[`hand_${side}`];
    const dir = V(Math.sin(ARM_ANGLE) * k, -Math.cos(ARM_ANGLE), 0);
    const len = spec.UA + spec.FA, lt = B.limb;
    const g = limb({ a: ua, b: [wr[0] + dir.x * 0.01, wr[1] + dir.y * 0.01, 0], seg: 12, rings: 18, flatten: 0.95, ref: [0, 0, 1],
      radii: [[0, 0.088 * lt], [0.3, 0.078 * lt], [0.5, 0.068 * lt], [0.62, 0.07 * lt], [1, 0.058 * lt]], extendA: 1, extendB: 0.5 });
    const base = V(...ua);
    const sOf = p => _tmp.copy(p).sub(base).dot(dir);
    RB.add(g, {
      part: 'arms',
      color: (p) => {
        const s = sOf(p);
        if (s < sleeveLen) {
          let c = shirtCol();
          if (L.shirt.style === 'striped') c = (Math.floor(s / 0.05) % 2) ? col(L.shirt.color2) : col(L.shirt.color);
          if (L.shirt.style === 'flannel') c = (Math.floor(s / 0.07) % 2) ? col(L.shirt.color) : mix(L.shirt.color, L.shirt.color2, 0.55);
          if (s > sleeveLen - 0.03) c = c.clone().multiplyScalar(L.shirt.style === 'sweater' ? 0.8 : 0.9);
          return c;
        }
        return skin();
      },
      weights: (p) => {
        const s = sOf(p);
        const e = sstep(spec.UA - 0.045, spec.UA + 0.045, s), h = sstep(len - 0.01, len + 0.03, s);
        const sh = 0.35 * sstep(0.02, -0.06, s);
        return [[`shoulder_${side}`, sh], [`upperarm_${side}`, (1 - e) * (1 - sh)], [`lowerarm_${side}`, e * (1 - h)], [`hand_${side}`, e * h]];
      },
    });
    // mitten hand (palm + thumb), big and soft
    const hs = B.hand;
    const hc = V(...wr).addScaledVector(dir, 0.07 * hs);
    const handRot = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dir);
    RB.add(ellipsoid({ c: hc.toArray(), r: [0.066 * hs, 0.088 * hs, 0.074 * hs], seg: [14, 10], rot: handRot }), { part: 'hands', color: skin, bone: `hand_${side}` });
    const th = hc.clone().add(V(0, 0, 0.062 * hs)).addScaledVector(dir, -0.028 * hs).add(V(-0.012 * k, 0, 0));
    RB.add(ellipsoid({ c: th.toArray(), r: [0.03 * hs, 0.045 * hs, 0.03 * hs], seg: [10, 8], rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, -0.5 * k)).premultiply(handRot) }), { part: 'hands', color: skin, bone: `hand_${side}` });
  }

  // ======================================================= head + face
  const headColor = (p) => {
    let c = skin();
    const ch = (x) => Math.exp(-(((p.x - x) ** 2) / 0.004 + ((p.y - (HC[1] - 0.075)) ** 2) / 0.003)) * (p.z > 0 ? 1 : 0);
    const bl = Math.min(1, ch(0.17 * HR[0] / 0.315) + ch(-0.17 * HR[0] / 0.315));
    c = c.clone().lerp(col(L.blush), bl * 0.45);
    if (L.beard.style === 'stubble' && p.y < HC[1] - 0.06 && p.z > -0.05) c.lerp(col(L.beard.color), 0.35 * sstep(HC[1] - 0.06, HC[1] - 0.14, p.y));
    return c;
  };
  RB.add(ellipsoid({ c: HC, r: HR, seg: [30, 22], deform: (v, u) => { v.z += 0.02 * Math.max(0, -u.y) * Math.max(0, u.z); v.x *= 1 + 0.04 * Math.max(0, -u.y); } }), { part: 'head', color: headColor, bone: 'head' });
  // ears
  for (const k of [1, -1]) RB.add(ellipsoid({ c: [k * HR[0] * 0.96, HC[1] - 0.01, HC[2] - 0.01], r: [0.045, 0.07, 0.05], seg: [10, 8] }), { part: 'head', color: () => skin().clone().lerp(col(L.blush), 0.25), bone: 'head' });
  // nose
  RB.add(ellipsoid({ c: [0, HC[1] - 0.055, HC[2] + HR[2] * 0.97], r: [0.052, 0.044, 0.045], seg: [12, 10] }), { part: 'head', color: () => skin().clone().lerp(col(L.blush), 0.35), bone: 'head' });
  // eyes (squash on blink), with a highlight
  for (const side of ['L', 'R']) {
    const e = J[`eye_${side}`];
    const yaw = Math.atan2(e[0], 0.28);
    RB.add(ellipsoid({ c: e, r: [0.034, 0.05, 0.02], seg: [12, 10], rot: [0, yaw, 0] }), { part: 'face', color: () => col(L.eyes), bone: `eye_${side}` });
    RB.add(ellipsoid({ c: [e[0] + 0.011, e[1] + 0.017, e[2] + 0.016], r: [0.011, 0.013, 0.006], seg: [8, 6], rot: [0, yaw, 0] }), { part: 'face', color: 0xffffff, bone: `eye_${side}` });
    // brows
    const bk = side === 'L' ? 1 : -1;
    RB.add(limb({ a: [e[0] - 0.032 * bk, HC[1] + 0.075 + 0.007, e[2] - 0.002], b: [e[0] + 0.036 * bk, HC[1] + 0.075 - 0.003, e[2] - 0.014], radii: [[0, 0.012], [1, 0.011]], seg: 6, rings: 3 }),
      { part: 'face', color: () => mix(L.hair.style === 'bald' ? L.beard.color : L.hair.color, '#000', 0.1), bone: 'brows' });
  }
  // mouth: small smiling crescent, scales open on the jaw bone
  {
    const m = J.jaw; const fullBeard = L.beard.style === 'full';
    RB.add(ellipsoid({ c: [m[0], m[1], m[2] + (fullBeard ? 0.045 : 0.008)], r: [0.05, 0.017, 0.012], seg: [14, 8], deform: (v) => { v.y += 9 * v.x * v.x; } }),
      { part: 'face', color: 0x6a2a24, bone: 'jaw' });
  }

  // ---- hair ----------------------------------------------------------------------------------
  const hairC = () => col(L.hair.color);
  const hairline = (u) => { const front = sstep(-0.3, 0.85, u.z); const ear = Math.exp(-((u.z - 0.05) ** 2) / 0.05) * sstep(0.6, 0.9, Math.abs(u.x)); return -0.38 + 0.8 * front + 0.32 * ear; };
  const hs = L.hair.style;
  if (hs !== 'none') {
    const scale = hs === 'curly' ? 1.07 : 1.05;
    const mask = hs === 'bald'
      ? (u) => sstep(hairline(u), hairline(u) + 0.08, u.y) * (1 - sstep(0.1, 0.25, u.y)) * (1 - sstep(0.3, 0.6, u.z))
      : hs === 'side' ? (u) => sstep(hairline(u) - 0.04 * u.x, hairline(u) + 0.06, u.y)
      : (u) => sstep(hairline(u), hairline(u) + 0.08, u.y);
    RB.add(ellipsoid({ c: HC, r: HR.map(r => r * scale), seg: [30, 22], shell: { mask, inner: 0.9 } }), { part: 'hair', color: hairC, bone: 'head' });
  }
  const Hp = (x, y, z) => [HC[0] + x * HR[0], HC[1] + y * HR[1], HC[2] + z * HR[2]];
  if (hs === 'bun') RB.add(ellipsoid({ c: Hp(0, 0.62, -0.72), r: [0.13, 0.12, 0.12], seg: [14, 10] }), { part: 'hair', color: hairC, bone: 'hair' });
  if (hs === 'ponytail') {
    RB.add(ellipsoid({ c: Hp(0, 0.25, -1.02), r: [0.08, 0.08, 0.07], seg: [10, 8] }), { part: 'hair', color: hairC, bone: 'hair' });
    RB.add(ellipsoid({ c: Hp(0, -0.25, -1.08), r: [0.075, 0.17, 0.07], seg: [12, 10] }), { part: 'hair', color: hairC, bone: 'hair' });
  }
  if (hs === 'long') RB.add(ellipsoid({ c: Hp(0, -0.55, -0.62), r: [0.26, 0.26, 0.11], seg: [16, 12], rot: [-0.25, 0, 0] }), { part: 'hair', color: hairC, bone: 'hair' });
  if (hs === 'curly') {
    const capped = L.hat.type !== 'none';
    const N = 60;
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + 0.5) / N * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
      const u = V(Math.cos(a) * rr, y, Math.sin(a) * rr);
      if (u.y < hairline(u) + 0.12) continue;          // keep the face free
      if (capped && u.y > 0.12) continue;              // hidden by the hat anyway
      if (!capped && i % 2) continue;
      RB.add(ellipsoid({ c: Hp(u.x * 1.0, u.y * 1.0, u.z * 1.0), r: [0.075, 0.07, 0.075], seg: [8, 6] }), { part: 'hair', color: () => hairC().clone().multiplyScalar(0.9 + (i % 3) * 0.06), bone: 'head' });
    }
  }
  if (hs === 'side') RB.add(ellipsoid({ c: Hp(0.3, 0.88, 0.42), r: [0.17, 0.07, 0.1], seg: [12, 8], rot: [0.3, 0, -0.35] }), { part: 'hair', color: hairC, bone: 'head' });

  // ---- beard ---------------------------------------------------------------------------------
  const bs = L.beard.style, beardC = () => col(L.beard.color);
  const nose = [0, HC[1] - 0.055, HC[2] + HR[2] * 0.97];
  if (bs === 'mustache' || bs === 'full' || bs === 'goatee') {
    for (const k of [1, -1]) RB.add(ellipsoid({ c: [0.048 * k, nose[1] - 0.052, nose[2] - 0.012 + (bs === 'full' ? 0.025 : 0)], r: [0.06, 0.026, 0.03], seg: [10, 8], rot: [0, 0.25 * k, -0.28 * k] }), { part: 'beard', color: beardC, bone: 'head' });
  }
  if (bs === 'full') {
    RB.add(ellipsoid({ c: [HC[0], HC[1] - 0.02, HC[2] + 0.01], r: HR.map(r => r * 1.07), seg: [28, 20],
      shell: { mask: (u) => (1 - sstep(-0.12, 0.04, u.y)) * sstep(-0.35, 0.2, u.z), inner: 0.9 },
      deform: (v, u) => { if (u.y < -0.3 && u.z > 0) { v.y -= 0.05 * u.z; v.z += 0.03 * u.z; } } }), { part: 'beard', color: beardC, bone: 'head' });
  }
  if (bs === 'goatee') RB.add(ellipsoid({ c: [0, HC[1] - 0.21, HC[2] + HR[2] * 0.82], r: [0.06, 0.07, 0.05], seg: [10, 8] }), { part: 'beard', color: beardC, bone: 'head' });

  // ---- glasses -------------------------------------------------------------------------------
  if (L.glasses) {
    const gc = () => col(L.glasses.color);
    const sq = L.glasses.shape === 'square';
    for (const side of ['L', 'R']) {
      const e = J[`eye_${side}`], k = side === 'L' ? 1 : -1;
      const yaw = Math.atan2(e[0], 0.28);
      RB.add(ring({ c: [e[0], e[1] - 0.004, e[2] + 0.035], R: 0.058, r: 0.009, seg: [6, sq ? 4 : 20], rot: [0, yaw, sq ? Math.PI / 4 : 0] }), { part: 'glasses', color: gc, bone: 'head' });
      RB.add(rod({ a: [e[0] + 0.056 * k, e[1], e[2] + 0.02], b: [HR[0] * 0.98 * k, e[1] + 0.01, HC[2] - 0.05], ra: 0.007, seg: 5 }), { part: 'glasses', color: gc, bone: 'head' });
    }
    RB.add(rod({ a: [J.eye_R[0] + 0.056, J.eye_R[1] + 0.008, J.eye_R[2] + 0.036], b: [J.eye_L[0] - 0.056, J.eye_L[1] + 0.008, J.eye_L[2] + 0.036], ra: 0.007, seg: 5 }), { part: 'glasses', color: gc, bone: 'head' });
  }

  // ---- hats (weighted to the 'hat' bone → secondary motion) -----------------------------------
  buildHat(RB, L, spec);

  // ======================================================= apron (draped panel)
  if (L.apron) {
    const yTop = 1.03, yBot = 0.42;
    const env = (x, y) => { let z = frontZ(x, Math.min(y, 1.0)); for (let yy = y; yy <= 1.0; yy += 0.02) z = Math.max(z, frontZ(x, yy)); return z; };
    const ap = panel({ nu: 10, nv: 16, thick: 0.012, f: (u, v) => {
      const y = yTop + (yBot - yTop) * v;
      const w = 0.17 + 0.07 * sstep(0.95, 0.6, y);
      const x = (u - 0.5) * 2 * w;
      return [x, y, env(x * 0.85, y) + 0.022];
    } });
    RB.add(ap, {
      part: 'apron',
      color: (p) => { const y = p.y; const w = 0.17 + 0.07 * sstep(0.95, 0.6, y); const edge = Math.abs(p.x) > w - 0.03 || y < yBot + 0.03 || y > yTop - 0.025; return edge && L.apron.trim ? col(L.apron.trim) : col(L.apron.color); },
      weights: (p) => {
        const y = p.y;
        const a = sstep(0.68, 0.88, y), b = sstep(0.88, 1.02, y);
        const t = 0.6 * sstep(0.64, 0.44, y);
        const sx = Math.max(-1, Math.min(1, p.x / 0.2));
        return [['hips', (1 - a) * (1 - t)], ['spine', a * (1 - b)], ['chest', b], ['thigh_L', t * (0.5 + 0.5 * sx)], ['thigh_R', t * (0.5 - 0.5 * sx)]];
      },
    });
  }

  // ======================================================= backpack / creel
  if (L.pack) {
    const pc = [0, 0.97, -(torsoAt(0.97).rz) - 0.085];
    const pk = ellipsoid({ c: pc, r: [0.2, 0.18, 0.115], seg: [16, 12], deform: (v, u) => { const k = 1 + 0.18 * (1 - Math.abs(u.y)) * (1 - Math.abs(u.x)); v.x *= Math.min(1.12, k); v.y *= 1 + 0.06 * Math.abs(u.x); } });
    RB.add(pk, { part: 'pack', color: (p) => { const rowI = Math.floor((p.y - 0.78) / 0.045); let c = col(L.pack.color).clone().multiplyScalar(rowI % 2 ? 0.9 : 1.02); if (p.y > 1.08) c = mix(L.pack.color, '#000', 0.22); if (Math.abs(p.x) < 0.025 && p.z < pc[2] - 0.05) c = col(L.pack.strap); return c; }, bone: 'pack' });
    RB.add(ellipsoid({ c: [0, pc[1] + 0.165, pc[2]], r: [0.21, 0.035, 0.125], seg: [14, 6] }), { part: 'pack', color: () => mix(L.pack.color, '#000', 0.28), bone: 'pack' });
  }

  // ======================================================= fishing rod (right hand chain)
  if (L.rod) buildRod(RB, L, spec);

  // ======================================================= held props (villagers)
  for (const p of L.props || []) buildProp(RB, p, spec);

  // ---------------------------------------------------------------------------------------------
  const { geometry, parts } = RB.build();
  const mesh = new THREE.SkinnedMesh(geometry, characterMaterial());
  mesh.name = `char_${L.id || 'npc'}`;
  mesh.castShadow = true; mesh.receiveShadow = false; // no self-shadow: the big brim would blacken the face from above
  mesh.add(byName.root);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 2.8);

  const recolor = (part) => {
    const list = parts[part]; if (!list) return;
    const pos = geometry.attributes.position, nor = geometry.attributes.normal, colA = geometry.attributes.color;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (const r of list) {
      if (!r.colorFn) continue;
      for (let i = r.start; i < r.start + r.count; i++) {
        p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
        const c = col(r.colorFn(p, n, i)); colA.setXYZ(i, c.r, c.g, c.b);
      }
    }
    colA.needsUpdate = true;
  };
  return { mesh, skeleton, bones: byName, spec, parts, recolor, look: L };
}
const _tmp = new THREE.Vector3();

// ---- hats --------------------------------------------------------------------------------------
function buildHat(RB, L, spec) {
  const H = spec.joints.hat, HC = spec.headC, HR = spec.headR;
  const t = L.hat.type;
  const hatC = () => col(L.hat.color), bandC = () => col(L.hat.band);
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0.0));
  const rel = (g) => { g.translate(0, 0, 0); g.applyQuaternion(tilt); g.translate(H[0], H[1], H[2]); return g; };
  if (t === 'straw') {
    const yb = -0.02; // brim height relative to the hat pivot
    const BR = 0.585; // brim radius: big, but leaves the shoulders readable from the top-down camera
    const droop = r => -0.07 * ((r - 0.29) / (BR - 0.29)) ** 2 + 0.018 * sstep(BR - 0.07, BR + 0.01, r);
    const rs = [0.28, 0.32, 0.37, 0.42, 0.47, 0.52, 0.56, BR];
    const top = rs.map(r => [yb + droop(r) + 0.013, r, r]);
    const rim = [[yb + droop(BR + 0.012) + 0.004, BR + 0.012, BR + 0.012], [yb + droop(BR + 0.012) - 0.008, BR + 0.009, BR + 0.009]];
    const bot = rs.slice().reverse().map(r => [yb + droop(r) - 0.012, r, r]);
    // NB lathe rows go "up the axis"; the brim loop goes outwards on top and back underneath
    const brim = lathe({ rows: [...top, ...rim, ...bot].reverse(), seg: 40 }); // bottom outwards, top inwards → outward normals
    RB.add(rel(brim), { part: 'hat', bone: 'hat', color: (p) => { const r = Math.hypot(p.x - H[0], p.z - H[2]); const i = Math.round((r - 0.28) / 0.05); return hatC().clone().multiplyScalar((i % 2 ? 0.93 : 1.03) * (p.y < H[1] + yb - 0.03 ? 0.82 : 1)); } });
    const crown = lathe({ rows: smoothProfile([[yb, 0.305], [yb + 0.06, 0.3], [yb + 0.14, 0.288], [yb + 0.2, 0.262], [yb + 0.235, 0.205], [yb + 0.252, 0.13], [yb + 0.247, 0.05], [yb + 0.244, 0.0]], 14).map(([y, r]) => [y, r, r * 0.96]), seg: 32 });
    RB.add(rel(crown), { part: 'hat', bone: 'hat', color: (p) => { const i = Math.round((p.y - H[1]) / 0.035); return hatC().clone().multiplyScalar(i % 2 ? 0.94 : 1.03); } });
    const band = lathe({ rows: [[yb + 0.005, 0.0], [yb + 0.006, 0.312], [yb + 0.012, 0.316], [yb + 0.07, 0.31], [yb + 0.076, 0.302]], seg: 32 });
    RB.add(rel(band), { part: 'hat', bone: 'hat', color: bandC });
    // little bow on the left
    const bow = ellipsoid({ c: [0.3, yb + 0.04, 0.06], r: [0.03, 0.035, 0.06], seg: [8, 6], rot: [0, -0.2, 0] });
    RB.add(rel(bow), { part: 'hat', bone: 'hat', color: bandC });
    return;
  }
  const headShell = (mask, scale, inner = 0.9) => ellipsoid({ c: HC, r: HR.map(r => r * scale), seg: [30, 22], shell: { mask, inner } });
  if (t === 'cap') {
    RB.add(headShell(u => sstep(0.12, 0.2, u.y + 0.12 * Math.max(0, -u.z)), 1.09), { part: 'hat', bone: 'hat', color: hatC });
    RB.add(ellipsoid({ c: [HC[0], HC[1] + 0.12, HC[2] + HR[2] * 0.95], r: [0.2, 0.025, 0.15], seg: [14, 6], deform: (v) => { if (v.z < 0) v.z *= 0.2; v.y -= 0.1 * v.z * v.z; } }), { part: 'hat', bone: 'hat', color: () => hatC().clone().multiplyScalar(0.85) });
    RB.add(ellipsoid({ c: [HC[0], HC[1] + HR[1] * 1.08, HC[2]], r: [0.03, 0.02, 0.03], seg: [8, 6] }), { part: 'hat', bone: 'hat', color: hatC });
    return;
  }
  if (t === 'sailor') {
    const yb = -0.03;
    const rows = smoothProfile([[yb, 0.0], [yb + 0.001, 0.29], [yb + 0.07, 0.3], [yb + 0.17, 0.335], [yb + 0.215, 0.33], [yb + 0.226, 0.2], [yb + 0.229, 0.0]], 12).map(([y, r]) => [y, r, r * 0.95]);
    RB.add(rel(lathe({ rows, seg: 28 })), { part: 'hat', bone: 'hat', color: (p) => (p.y - H[1] < yb + 0.05 ? col(L.hat.color === '#f2f2ee' ? '#22304a' : '#f2f2ee').lerp(hatC(), 0.15) : hatC()) });
    const visor = ellipsoid({ c: [0, yb + 0.01, 0.27], r: [0.2, 0.018, 0.13], seg: [14, 6], deform: (v) => { if (v.z < 0) v.z *= 0.25; v.y -= 0.18 * v.z * v.z; } });
    RB.add(rel(visor), { part: 'hat', bone: 'hat', color: 0x1e1e24 });
    return;
  }
  if (t === 'beanie') {
    RB.add(headShell(u => sstep(0.14, 0.22, u.y + 0.1 * u.z - 0.1 * Math.max(0, -u.z)), 1.1), { part: 'hat', bone: 'hat', color: (p) => hatC().clone().multiplyScalar(0.94 + 0.08 * (Math.round(Math.atan2(p.x, p.z) * 9) % 2)) });
    const cuff = lathe({ origin: [HC[0], HC[1] + 0.06, HC[2]], rows: [[-0.03, HR[0] * 1.06, HR[2] * 1.06], [-0.02, HR[0] * 1.1, HR[2] * 1.1], [0.05, HR[0] * 1.08, HR[2] * 1.08], [0.06, HR[0] * 1.02, HR[2] * 1.02]], seg: 30 });
    cuff.translate(0, 0, 0); cuff.rotateX(0); // eslint-ish no-op: keeps the helper symmetrical
    RB.add(cuff, { part: 'hat', bone: 'hat', color: () => hatC().clone().multiplyScalar(0.85) });
    RB.add(ellipsoid({ c: [HC[0], HC[1] + HR[1] * 1.12, HC[2] - 0.02], r: [0.07, 0.065, 0.07], seg: [10, 8] }), { part: 'hat', bone: 'hat', color: () => mix(L.hat.color, '#fff', 0.5) });
    return;
  }
  if (t === 'bandana' || t === 'kerchief') {
    RB.add(headShell(u => sstep(0.05, 0.14, u.y + 0.32 * u.z - 0.25 * Math.max(0, -u.z)), 1.075), { part: 'hat', bone: 'hat', color: (p) => { const c = hatC(); const dots = (Math.round((p.x + 1) * 28) + Math.round((p.y + 1) * 28)) % 5 === 0; return dots ? mix(c, '#fff', 0.7) : c; } });
    RB.add(ellipsoid({ c: [HC[0], HC[1] - 0.02, HC[2] - HR[2] * 1.02], r: [0.06, 0.05, 0.05], seg: [8, 6] }), { part: 'hat', bone: 'hat', color: hatC });
    for (const k of [1, -1]) RB.add(ellipsoid({ c: [0.05 * k, HC[1] - 0.09, HC[2] - HR[2] * 1.0], r: [0.035, 0.07, 0.02], seg: [8, 6], rot: [0.3, 0, 0.4 * k] }), { part: 'hat', bone: 'hat', color: hatC });
    if (t === 'kerchief') RB.add(ellipsoid({ c: [HC[0], HC[1] - 0.17, HC[2] - HR[2] * 0.8], r: [0.16, 0.12, 0.05], seg: [10, 8], rot: [0.5, 0, 0] }), { part: 'hat', bone: 'hat', color: hatC });
    return;
  }
  if (t === 'chef') {
    RB.add(rel(lathe({ rows: [[-0.04, 0.0], [-0.039, 0.3], [0.06, 0.305], [0.065, 0.0]], seg: 28 })), { part: 'hat', bone: 'hat', color: 0xffffff });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; RB.add(rel(ellipsoid({ c: [Math.sin(a) * 0.17, 0.2, Math.cos(a) * 0.17], r: [0.16, 0.16, 0.16], seg: [10, 8] })), { part: 'hat', bone: 'hat', color: 0xf8f8f4 }); }
    RB.add(rel(ellipsoid({ c: [0, 0.27, 0], r: [0.2, 0.15, 0.2], seg: [12, 8] })), { part: 'hat', bone: 'hat', color: 0xffffff });
  }
}

// ---- rod -----------------------------------------------------------------------------------------
function buildRod(RB, L, spec) {
  const R = L.rod;
  const at = d => spec.rodAlong(d);
  const segW = (p) => {
    const g = V(...spec.joints.rod_0); const d = _tmp.copy(p).sub(g).dot(spec.rodDir);
    const a = sstep(0.36, 0.48, d), b = sstep(0.88, 1.02, d), c = sstep(1.38, 1.52, d);
    return [['rod_0', 1 - a], ['rod_1', a * (1 - b)], ['rod_2', b * (1 - c)], ['rod_3', c]];
  };
  const dist = (p) => _tmp.copy(p).sub(V(...spec.joints.rod_0)).dot(spec.rodDir);
  // butt cap + grip wrap
  RB.add(rod({ a: at(-0.27), b: at(-0.2), ra: 0.03, rb: 0.03, seg: 10 }), { part: 'rod', color: () => mix(R.wrap, '#000', 0.25), weights: segW });
  RB.add(rod({ a: at(-0.2), b: at(0.1), ra: 0.026, rb: 0.024, seg: 10 }), { part: 'rod', color: (p) => { const d = dist(p); return Math.round(d / 0.035) % 2 ? col(R.wrap) : mix(R.wrap, '#000', 0.15); }, weights: segW });
  // blank (tapered), with bamboo nodes
  const N = 7, d0 = 0.1, d1 = spec.rodTipDist;
  for (let i = 0; i < N; i++) {
    const a = d0 + (d1 - d0) * (i / N), b = d0 + (d1 - d0) * ((i + 1) / N);
    const ra = 0.02 - 0.0135 * (i / N), rb = 0.02 - 0.0135 * ((i + 1) / N);
    const last = i === N - 1;
    RB.add(rod({ a: at(a), b: at(b), ra, rb, seg: 8, caps: true }), { part: 'rod', color: (p) => (last && dist(p) > d1 - 0.1 ? col(R.tip) : col(R.color)), weights: segW });
    if (R.nodes && i > 0) RB.add(rod({ a: at(a - 0.012), b: at(a + 0.012), ra: ra + 0.004, rb: ra + 0.004, seg: 8 }), { part: 'rod', color: () => mix(R.color, '#5a3a14', 0.35), weights: segW });
  }
  // line guides under the rod
  for (const d of [0.55, 1.0, 1.42, 1.82]) {
    const c = V(...at(d)).addScaledVector(spec.rodDown, 0.03);
    RB.add(ring({ c: c.toArray(), R: 0.014, r: 0.003, seg: [4, 10], rot: [Math.atan2(spec.rodDir.y, spec.rodDir.z) - Math.PI / 2, 0, 0] }), { part: 'rod', color: 0xd8d8d8, weights: segW });
  }
  // reel: foot, spool (axis = x), crank on the +x side (left hand) with a knob
  const rc = spec.reelC;
  RB.add(rod({ a: at(0.13), b: rc, ra: 0.009, seg: 6 }), { part: 'rod', color: 0x9aa4ae, bone: 'rod_0' });
  const spool = lathe({ origin: [rc[0] - 0.035, rc[1], rc[2]], axis: [1, 0, 0], ref: [0, 0, 1], rows: [[0, 0.0], [0.001, 0.05], [0.012, 0.052], [0.016, 0.034], [0.054, 0.034], [0.058, 0.052], [0.069, 0.05], [0.07, 0.0]], seg: 16 });
  RB.add(spool, { part: 'rod', color: (p) => (Math.abs(p.x - rc[0] + 0.0) < 0.018 ? col('#e8e2d0') : col('#5a6a7a')), bone: 'rod_0' });
  RB.add(rod({ a: [rc[0] + 0.035, rc[1], rc[2]], b: [rc[0] + 0.05, rc[1], rc[2]], ra: 0.01, seg: 6 }), { part: 'rod', color: 0x5a6a7a, bone: 'reel' });
  RB.add(rod({ a: [rc[0] + 0.05, rc[1], rc[2]], b: [rc[0] + 0.05, rc[1] - 0.06, rc[2]], ra: 0.007, seg: 6 }), { part: 'rod', color: 0x5a6a7a, bone: 'reel' });
  RB.add(ellipsoid({ c: [rc[0] + 0.068, rc[1] - 0.06, rc[2]], r: [0.02, 0.016, 0.016], seg: [8, 6] }), { part: 'rod', color: 0xd9c08a, bone: 'reel' });
}

// ---- villager props ------------------------------------------------------------------------------
function buildProp(RB, kind, spec) {
  const G = V(...spec.joints.prop_R), GL = V(...spec.joints.prop_L);
  const along = (o, d, t) => o.clone().addScaledVector(d, t).toArray();
  const wood = 0x9a6a3e, metal = 0x8a949e;
  if (kind === 'net') {
    const d = V(0, 0.55, 0.85).normalize();
    RB.add(rod({ a: along(G, d, -0.2), b: along(G, d, 1.1), ra: 0.018, seg: 7 }), { part: 'prop', color: wood, bone: 'prop_R' });
    const c = V(...along(G, d, 1.27));
    RB.add(ring({ c: c.toArray(), R: 0.17, r: 0.012, seg: [5, 18], rot: [Math.atan2(d.y, d.z) + Math.PI / 2, 0, 0] }), { part: 'prop', color: 0x6a5030, bone: 'prop_R' });
    RB.add(ellipsoid({ c: c.clone().add(V(0, -0.1, 0.02)).toArray(), r: [0.15, 0.14, 0.13], seg: [10, 8], deform: (v) => { if (v.y > 0) v.y *= 0.3; } }), { part: 'prop', color: 0xe6e0c8, bone: 'prop_R' });
  } else if (kind === 'broom') {
    const d = V(0, 0.92, 0.4).normalize();
    RB.add(rod({ a: along(G, d, -0.55), b: along(G, d, 0.75), ra: 0.017, seg: 7 }), { part: 'prop', color: wood, bone: 'prop_R' });
    const c = V(...along(G, d, -0.68));
    RB.add(ellipsoid({ c: c.toArray(), r: [0.1, 0.17, 0.05], seg: [10, 8], rot: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d), deform: (v) => { if (v.y < 0) { v.x *= 1 + (-v.y) * 4; } } }), { part: 'prop', color: 0xd8b860, bone: 'prop_R' });
  } else if (kind === 'hammer') {
    const d = V(0, -0.15, 1).normalize();
    RB.add(rod({ a: along(G, d, -0.08), b: along(G, d, 0.3), ra: 0.016, seg: 7 }), { part: 'prop', color: wood, bone: 'prop_R' });
    RB.add(box({ c: along(G, d, 0.32), s: [0.05, 0.14, 0.06], rot: [0, 0, 0] }), { part: 'prop', color: metal, bone: 'prop_R', smooth: false });
  } else if (kind === 'ladle') {
    const d = V(0, 0.2, 1).normalize();
    RB.add(rod({ a: along(G, d, -0.06), b: along(G, d, 0.34), ra: 0.012, seg: 6 }), { part: 'prop', color: wood, bone: 'prop_R' });
    RB.add(ellipsoid({ c: along(G, d, 0.4), r: [0.065, 0.045, 0.065], seg: [10, 8], deform: (v) => { if (v.y > 0) v.y *= 0.15; } }), { part: 'prop', color: 0xb0a080, bone: 'prop_R' });
  } else if (kind === 'notebook') {
    RB.add(box({ c: [GL.x + 0.0, GL.y, GL.z + 0.07], s: [0.03, 0.2, 0.15], rot: [0, 0, -0.75] }), { part: 'prop', color: 0x2f7d6a, bone: 'prop_L', smooth: false });
    RB.add(box({ c: [GL.x + 0.004, GL.y, GL.z + 0.07], s: [0.024, 0.19, 0.145], rot: [0, 0, -0.75] }), { part: 'prop', color: 0xf4f0e0, bone: 'prop_L', smooth: false });
  } else if (kind === 'spyglass') {
    const d = V(0, 0.1, 1).normalize();
    RB.add(rod({ a: along(G, d, -0.12), b: along(G, d, 0.12), ra: 0.032, rb: 0.028, seg: 10 }), { part: 'prop', color: 0x3a2a20, bone: 'prop_R' });
    RB.add(rod({ a: along(G, d, 0.12), b: along(G, d, 0.3), ra: 0.024, rb: 0.022, seg: 10 }), { part: 'prop', color: 0xd4a84a, bone: 'prop_R' });
  }
}
