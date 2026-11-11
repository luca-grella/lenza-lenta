// Hand-authored clip library (pose tables + easing). Conventions are documented in anim.js.
// Every clip starts from STAND so all body bones are always keyed (no blending with the bind A-pose).
import { defineClip, pose, mirror, offset } from './anim.js';

/** Neutral standing pose: arms hang a bit out from the round body, rod tipped up ~45°, head up for the camera. */
export const STAND = {
  pos: [0, 0, 0],
  hips: [0, 0, 0], spine: [3, 0, 0], chest: [-2, 0, 0], neck: [0, 0, 0], head: [-6, 0, 0],
  shL: [0, 0, 0], shR: [0, 0, 0],
  uaL: [-3, 0, -30], uaR: [-6, 0, 30],
  faL: [-14, 0, 0], faR: [-22, 0, 0],
  hL: [0, 0, 0], hR: [13, 0, 0],
  thL: [0, 0, 2], thR: [0, 0, -2], knL: [0, 0, 0], knR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0],
  mouth: 0, eyes: 1, brow: 0, rod: 1, prop: 1,
};

const C = {};
/** Keep the rod at a steady elevation while the right arm swings (elev ≈ 15.7 − (uaR.x + faR.x + hR.x)). */
const carry = (p, elev = 30, k = 0.8) => { const ua = p.uaR?.[0] ?? -6, fa = p.faR?.[0] ?? -22; const want = 15.7 - elev - ua - fa; const h = 13 + (want - 13) * k; return { ...p, hR: [h, 0, 0] }; };
const add = (name, def) => { C[name] = defineClip(name, { base: STAND, ...def }); };

// =============================================================================== idle
add('idle', {
  duration: 4.2, loop: true,
  keys: [[0, {}]],
  osc: {
    pos: { x: [0.012, 1, 0], y: [0.004, 2, 0.1] },
    hips: { z: [1.6, 1, 0.25] }, spine: { z: [-1.4, 1, 0.25], x: [0.8, 2, 0] }, chest: { y: [1.5, 1, 0.6] },
    head: { y: [3, 1, 0.1], x: [1.2, 2, 0.3] },
    knL: { x: [2.5, 1, 0.75] }, knR: { x: [2.5, 1, 0.25] },
    uaL: { x: [1.5, 1, 0.4] }, uaR: { x: [1.2, 1, 0.9] }, hR: { x: [2.5, 2, 0.2] },
  },
});

// =============================================================================== walk (phase 0 = left heel strike)
// Bouncy cozy waddle: body bobs twice per cycle, pelvis rocks over the stance foot, shoulders counter-rotate,
// the free (left) arm swings wide, the rod arm swings less.
const WALK_L = {
  contact: { pos: [0.018, -0.005, 0], hips: [0, -9, 5], spine: [6, 0, -5], chest: [-2, 14, 0], head: [-6, -6, 2],
    thL: [-36, 0, 2], knL: [4, 0, 0], ftL: [-18, 0, 0], thR: [26, 0, -2], knR: [24, 0, 0], ftR: [26, 0, 0],
    uaL: [28, 0, -28], faL: [-10, 0, 0], uaR: [-14, 0, 30], faR: [-34, 0, 0], hR: [-14, 0, 0] },
  down: { pos: [0.022, -0.04, 0], hips: [0, -6, 6], spine: [8, 0, -6], chest: [-2, 10, 0], head: [-5, -4, 3],
    thL: [-26, 0, 2], knL: [24, 0, 0], ftL: [0, 0, 0], thR: [20, 0, -2], knR: [52, 0, 0], ftR: [24, 0, 0],
    uaL: [22, 0, -28], faL: [-12, 0, 0], uaR: [-10, 0, 30], faR: [-32, 0, 0], hR: [-12, 0, 0] },
  pass: { pos: [0.02, 0.02, 0], hips: [0, 0, 4], spine: [5, 0, -4], chest: [-2, 0, 0], head: [-7, 0, 2],
    thL: [-2, 0, 2], knL: [10, 0, 0], ftL: [0, 0, 0], thR: [-20, 0, -2], knR: [74, 0, 0], ftR: [8, 0, 0],
    uaL: [2, 0, -30], faL: [-16, 0, 0], uaR: [-6, 0, 30], faR: [-26, 0, 0], hR: [-12, 0, 0] },
  up: { pos: [0.012, 0.045, 0], hips: [0, 6, 2], spine: [4, 0, -2], chest: [-2, -9, 0], head: [-6, 4, 1],
    thL: [18, 0, 2], knL: [8, 0, 0], ftL: [10, 0, 0], thR: [-34, 0, -2], knR: [34, 0, 0], ftR: [-8, 0, 0],
    uaL: [-22, 0, -28], faL: [-32, 0, 0], uaR: [-2, 0, 30], faR: [-20, 0, 0], hR: [-10, 0, 0] },
};
/** Right-side keys mirror the left ones but keep the rod arm (right) calmer. */
const walkR = (k) => { const m = mirror(k); return { ...m, uaR: [k.uaL[0] * 0.45 - 6, 0, 30], faR: [Math.min(-16, k.faL[0] - 10), 0, 0], hR: [-12, 0, 0], uaL: [m.uaL[0] * 1.6, 0, -28], faL: [Math.min(-10, -k.faR[0] - 52), 0, 0] }; };
add('walk', {
  duration: 0.46, loop: true, meta: { look: 0.6 },
  keys: [
    [0, WALK_L.contact], [0.0575, WALK_L.down], [0.115, WALK_L.pass], [0.1725, WALK_L.up],
    [0.23, walkR(WALK_L.contact)], [0.2875, walkR(WALK_L.down)], [0.345, walkR(WALK_L.pass)], [0.4025, walkR(WALK_L.up)],
  ].map(([t, p]) => [t, carry(p, 32)]),
  events: [{ t: 0, name: 'step', foot: 'L' }, { t: 0.23, name: 'step', foot: 'R' }],
});

// slow stroll: smaller steps, little bounce, relaxed arms, the head looks around
const SLOW = {
  contact: { pos: [0.012, 0, 0], hips: [0, -6, 3], spine: [4, 0, -3], chest: [-2, 8, 0], head: [-6, -4, 1],
    thL: [-25, 0, 2], knL: [5, 0, 0], ftL: [-12, 0, 0], thR: [18, 0, -2], knR: [16, 0, 0], ftR: [16, 0, 0],
    uaL: [16, 0, -29], faL: [-12, 0, 0], uaR: [-10, 0, 30], faR: [-26, 0, 0], hR: [-12, 0, 0] },
  down: { pos: [0.014, -0.022, 0], hips: [0, -4, 4], spine: [5, 0, -4], chest: [-2, 6, 0], head: [-5, -3, 2],
    thL: [-18, 0, 2], knL: [16, 0, 0], ftL: [0, 0, 0], thR: [14, 0, -2], knR: [34, 0, 0], ftR: [16, 0, 0],
    uaL: [12, 0, -29], faL: [-13, 0, 0], uaR: [-8, 0, 30], faR: [-25, 0, 0], hR: [-12, 0, 0] },
  pass: { pos: [0.013, 0.01, 0], hips: [0, 0, 3], spine: [4, 0, -3], chest: [-2, 0, 0], head: [-6, 0, 1],
    thL: [-1, 0, 2], knL: [7, 0, 0], ftL: [0, 0, 0], thR: [-14, 0, -2], knR: [48, 0, 0], ftR: [6, 0, 0],
    uaL: [2, 0, -30], faL: [-15, 0, 0], uaR: [-6, 0, 30], faR: [-23, 0, 0], hR: [-12, 0, 0] },
  up: { pos: [0.008, 0.022, 0], hips: [0, 4, 1], spine: [3, 0, -1], chest: [-2, -6, 0], head: [-6, 3, 1],
    thL: [12, 0, 2], knL: [6, 0, 0], ftL: [6, 0, 0], thR: [-24, 0, -2], knR: [22, 0, 0], ftR: [-6, 0, 0],
    uaL: [-12, 0, -29], faL: [-24, 0, 0], uaR: [-4, 0, 30], faR: [-21, 0, 0], hR: [-12, 0, 0] },
};
const slowR = (k) => { const m = mirror(k); return { ...m, uaR: [k.uaL[0] * 0.5 - 6, 0, 30], faR: [Math.min(-18, k.faL[0] - 8), 0, 0], hR: [-12, 0, 0], uaL: [m.uaL[0] * 1.5, 0, -29], faL: [Math.min(-11, -k.faR[0] - 38), 0, 0] }; };
add('walk_slow', {
  duration: 0.72, loop: true, meta: { look: 0.8 },
  keys: [
    [0, SLOW.contact], [0.09, SLOW.down], [0.18, SLOW.pass], [0.27, SLOW.up],
    [0.36, slowR(SLOW.contact)], [0.45, slowR(SLOW.down)], [0.54, slowR(SLOW.pass)], [0.63, slowR(SLOW.up)],
  ].map(([t, p]) => [t, carry(p, 30)]),
  osc: { head: { y: [5, 0.5, 0] } },
  events: [{ t: 0, name: 'step', foot: 'L' }, { t: 0.36, name: 'step', foot: 'R' }],
});

// =============================================================================== idle variants
add('idle_look', {
  duration: 3.6, meta: { look: 0.15 },
  keys: [
    [0, {}],
    [0.45, { head: [-4, 10, 0], chest: [-2, 4, 0] }],
    [0.9, { uaL: [-40, 0, -12], faL: [-118, 0, 0], hL: [0, 0, 0], head: [-10, 38, -4], chest: [-3, 12, 0], spine: [2, 4, 0], brow: 0.6, eyes: 0.7 }, 'back'],
    [1.5, { head: [-12, 30, -3] }],
    [2.1, { head: [-10, -34, 4], chest: [-3, -10, 0], spine: [2, -4, 0], hips: [0, -3, 0] }],
    [2.6, { head: [-9, -28, 3] }],
    [3.1, { uaL: [-3, 0, -30], faL: [-14, 0, 0], head: [-6, 0, 0], chest: [-2, 0, 0], spine: [3, 0, 0], hips: [0, 0, 0], brow: 0, eyes: 1 }],
    [3.6, {}],
  ].map(([t, p, e]) => [t, carry(p, 30, 0.6), e]),
});

add('idle_yawn', {
  duration: 3.4, meta: { look: 0, breathe: 0 },
  keys: [
    [0, {}],
    [0.6, { chest: [-8, 0, 0], spine: [-2, 0, 0], head: [-16, 0, 0], shL: [0, 0, 8], shR: [0, 0, -8], pos: [0, 0.01, 0], mouth: 0.3, eyes: 0.6 }],
    [1.15, { uaL: [-150, 0, 40], faL: [-40, 0, 0], uaR: [-140, 0, -34], faR: [-38, 0, 0], hR: [30, 0, 0],
      chest: [-12, 0, 0], head: [-24, 0, 0], ftL: [10, 0, 0], ftR: [10, 0, 0], pos: [0, 0.045, 0], mouth: 1, eyes: 0.08, brow: 0.8 }, 'out'],
    [1.9, { chest: [-14, 0, 4], head: [-26, 0, 6], hips: [0, 0, -3], uaL: [-156, 0, 44], mouth: 1, eyes: 0 }],
    [2.4, { uaL: [-20, 0, -20], faL: [-30, 0, 0], uaR: [-8, 0, 30], faR: [-24, 0, 0], hR: [14, 0, 0],
      chest: [4, 0, 0], head: [4, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], pos: [0, -0.03, 0], mouth: 0.1, eyes: 0.5, brow: 0, shL: [0, 0, 0], shR: [0, 0, 0], hips: [0, 0, 0] }, 'inOut'],
    [2.9, { head: [-2, 0, 0], chest: [-1, 0, 0], pos: [0, 0, 0], eyes: 0.9, mouth: 0 }],
    [3.4, { uaL: STAND.uaL, faL: STAND.faL, uaR: STAND.uaR, faR: STAND.faR, hR: STAND.hR, head: STAND.head, chest: STAND.chest, eyes: 1 }],
  ],
});

add('idle_hat', {
  duration: 3.4, meta: { look: 0.2 },
  keys: [
    [0, {}],
    [0.5, { uaL: [-112, 0, -6], faL: [-96, 0, 0], hL: [-10, 0, 0], head: [-2, 0, -4], chest: [-2, 4, 0], pos: [0, -0.01, 0] }, 'back'],
    [0.85, { head: [12, 0, -2], uaL: [-104, 0, -6], spine: [6, 0, 0] }],     // tug the brim down
    [1.2, { head: [-10, -6, 2], uaL: [-118, 0, -6], spine: [2, 0, 0], eyes: 0.55 }],
    [1.45, { head: [-6, -4, 2] }],
    // fan the face with the hand
    [1.75, { uaL: [-60, 0, -10], faL: [-112, 0, 0], hL: [0, 30, 0], mouth: 0.35, brow: 0.3 }],
    [1.95, { hL: [0, -30, 0] }], [2.15, { hL: [0, 30, 0] }], [2.35, { hL: [0, -30, 0] }],
    [2.9, { uaL: [-3, 0, -30], faL: [-14, 0, 0], hL: [0, 0, 0], head: [-6, 0, 0], chest: [-2, 0, 0], spine: [3, 0, 0], mouth: 0, brow: 0, eyes: 1, pos: [0, 0, 0] }],
    [3.4, {}],
  ].map(([t, p, e]) => [t, carry(p, 30, 0.6), e]),
});

// =============================================================================== fishing
// Rod elevation rule of thumb (degrees above horizontal, sagittal plane): 15.7 − (uaR.x + faR.x + hR.x).
/** Wind-up: rod back over the right shoulder, torso twisted and leaning back, weight on the back foot. */
const WINDUP = {
  pos: [0, -0.03, -0.04], hips: [0, -18, 0], spine: [-5, -10, 2], chest: [-10, -16, 0], neck: [0, 8, 0], head: [-10, 14, 0],
  shR: [0, 0, -6],
  uaR: [-158, 0, 14], faR: [-58, 0, 0], hR: [66, 0, 0],
  uaL: [-55, 0, -18], faL: [-58, 0, 0], hL: [0, 0, 0],
  thL: [-16, 0, 6], knL: [8, 0, 0], ftL: [-6, 0, 0], thR: [18, 0, -6], knR: [20, 0, 0], ftR: [6, 0, 0],
  brow: 0.45, mouth: 0.1,
};
/** Waiting: rod out in front at ~35°, both hands on it, relaxed knees. */
const FISH = {
  pos: [0, -0.01, 0], hips: [0, 0, 0], spine: [6, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [-2, 0, 0], shR: [0, 0, 0],
  uaR: [-34, 0, 20], faR: [-46, 0, 0], hR: [34, 0, 0],
  uaL: [-30, 0, -16], faL: [-62, 0, 0], hL: [0, 0, 0],
  thL: [-6, 0, 4], knL: [6, 0, 0], ftL: [0, 0, 0], thR: [6, 0, -4], knR: [8, 0, 0], ftR: [0, 0, 0], brow: 0, mouth: 0,
};
/** Reeling: rod higher, slight crouch, left hand on the crank. */
const REEL = {
  pos: [0, -0.04, 0], hips: [0, 4, 0], spine: [9, 0, 0], chest: [2, 6, 0], neck: [0, 0, 0], head: [-6, -4, 0], shR: [0, 0, 0],
  uaR: [-42, 0, 18], faR: [-52, 0, 0], hR: [24, 0, 0],
  uaL: [-36, 0, -10], faL: [-70, 0, 0],
  thL: [-14, 0, 5], knL: [16, 0, 0], ftL: [0, 0, 0], thR: [12, 0, -5], knR: [20, 0, 0], ftR: [0, 0, 0], brow: -0.2,
};

add('cast_windup', {
  duration: 0.75, hold: true, meta: { look: 0.35, lean: 0.4 },
  keys: [
    [0, {}],
    // anticipation: dip the rod forward and sink a little before swinging it back
    [0.22, { pos: [0, -0.04, 0.02], spine: [10, 4, 0], chest: [6, 6, 0], uaR: [-32, 0, 24], faR: [-34, 0, 0], hR: [24, 0, 0],
      knL: [12, 0, 0], knR: [14, 0, 0], uaL: [-20, 0, -24], faL: [-40, 0, 0], brow: 0.2 }],
    [0.75, WINDUP, 'back'],
  ],
});

add('cast_release', {
  duration: 1.0, next: 'fish_wait', meta: { look: 0.5, lean: 0.4 },
  keys: [
    [0, WINDUP],
    // whip: hips lead, then chest, then the arm snaps over
    [0.07, { hips: [0, 4, 0], spine: [0, -2, 0], chest: [-6, -8, 0], uaR: [-150, 0, 16], faR: [-60, 0, 0] }, 'in'],
    [0.16, { pos: [0, -0.05, 0.06], hips: [0, 12, -2], spine: [12, 6, -2], chest: [12, 14, 0], neck: [0, 0, 0], head: [-2, -10, 0],
      uaR: [-74, 0, 24], faR: [-18, 0, 0], hR: [14, 0, 0], uaL: [14, 0, -30], faL: [-26, 0, 0],
      thL: [-24, 0, 4], knL: [18, 0, 0], thR: [10, 0, -4], knR: [8, 0, 0], ftR: [18, 0, 0], mouth: 0.45, brow: 0.6 }, 'snap'],
    // follow-through: the arm keeps going down, the body rocks onto the front foot
    [0.36, { pos: [0, -0.06, 0.07], spine: [14, 4, 0], chest: [8, 8, 0], uaR: [-44, 0, 24], faR: [-26, 0, 0], hR: [36, 0, 0],
      uaL: [-14, 0, -24], faL: [-44, 0, 0], head: [-4, -4, 0], mouth: 0.2 }],
    [0.6, { pos: [0, -0.03, 0.03], spine: [8, 0, 0], chest: [2, 2, 0], hips: [0, 4, 0], uaR: [-36, 0, 20], faR: [-44, 0, 0], hR: [32, 0, 0], thL: [-10, 0, 4], knL: [8, 0, 0], thR: [6, 0, -4], ftR: [0, 0, 0], brow: 0.1 }],
    [1.0, FISH],
  ],
  events: [{ t: 0.15, name: 'release' }],
});

add('fish_wait', {
  duration: 6, loop: true, meta: { armIK: 'butt', look: 1 },
  keys: [[0, FISH], [2.2, { hips: [0, 0, 2], spine: [6, 0, -2], knL: [10, 0, 0], knR: [4, 0, 0] }], [4.4, { hips: [0, 0, -2], spine: [6, 0, 2], knL: [4, 0, 0], knR: [10, 0, 0] }]],
  osc: {
    hR: { x: [3, 2, 0], y: [2.5, 1, 0.3] }, uaR: { x: [1.5, 1, 0.2] },
    chest: { y: [3, 1, 0.5], x: [1, 3, 0] }, head: { y: [6, 1, 0.1], x: [2, 2, 0.4] },
    pos: { x: [0.01, 1, 0.25], y: [0.004, 3, 0] },
  },
});

add('strike', {
  duration: 0.6, next: 'reel', meta: { look: 0.6, armIK: 'butt' },
  keys: [
    [0, FISH],
    [0.09, { pos: [0, -0.06, -0.06], spine: [-8, 0, 0], chest: [-10, 4, 0], head: [-12, 0, 0], uaR: [-64, 0, 18], faR: [-50, 0, 0], hR: [24, 0, 0],
      uaL: [-44, 0, -12], faL: [-80, 0, 0], thL: [-26, 0, 6], knL: [16, 0, 0], thR: [14, 0, -6], knR: [26, 0, 0], ftL: [-10, 0, 0], mouth: 0.7, brow: 0.9, eyes: 1 }, 'snap'],
    [0.25, { spine: [-4, 0, 0], chest: [-6, 4, 0], hR: [30, 0, 0], mouth: 0.4 }],
    [0.6, REEL],
  ],
  events: [{ t: 0.08, name: 'strike' }],
});

add('reel', {
  duration: 1.0, loop: true, meta: { armIK: 'crank', look: 1 },
  keys: [[0, { ...REEL, crank: 0 }], [1.0, { ...REEL, crank: 2 }, 'linear']],
  osc: { chest: { x: [1.5, 2, 0], y: [2, 2, 0.25] }, spine: { z: [1.2, 2, 0] }, hR: { x: [2.5, 2, 0.1] }, pos: { y: [0.008, 2, 0.2] }, head: { y: [3, 1, 0] } },
  events: [{ t: 0, name: 'click' }, { t: 0.5, name: 'click' }],
});

const STRUGGLE = {
  ...REEL, pos: [0, -0.09, -0.08], hips: [-6, 8, 0], spine: [-6, 0, 0], chest: [-8, 8, 0], head: [-12, -6, 0],
  uaR: [-56, 0, 16], faR: [-60, 0, 0], hR: [10, 0, 0],
  thL: [-34, 0, 7], knL: [26, 0, 0], ftL: [-12, 0, 0], thR: [24, 0, -6], knR: [40, 0, 0], ftR: [10, 0, 0], brow: -0.7, mouth: 0.25,
};
add('reel_struggle', {
  duration: 0.9, loop: true, meta: { armIK: 'crank', look: 0.8, lean: 0.3 },
  keys: [[0, { ...STRUGGLE, crank: 0 }], [0.9, { ...STRUGGLE, crank: 2.5 }, 'linear']],
  osc: { chest: { y: [6, 2, 0], x: [2, 3, 0.3] }, spine: { z: [3, 1, 0] }, hips: { y: [4, 1, 0.5] }, hR: { x: [6, 3, 0] }, pos: { x: [0.025, 1, 0], z: [0.015, 2, 0.3] }, head: { z: [3, 1, 0.2] } },
  events: [{ t: 0, name: 'click' }, { t: 0.45, name: 'click' }],
});

/** Holding the catch with both hands at chest height, rod tucked away. */
const HOLD = {
  pos: [0, 0, 0], spine: [4, 0, 0], chest: [-2, 0, 0], head: [10, 0, 0],
  uaL: [-46, 0, -6], faL: [-74, 0, 0], hL: [0, 0, 0], uaR: [-46, 0, 6], faR: [-74, 0, 0], hR: [0, 0, 0],
  thL: [0, 0, 2], thR: [0, 0, -2], knL: [0, 0, 0], knR: [0, 0, 0], rod: 0, mouth: 0.35,
};
const OVERHEAD = {
  uaL: [-162, 0, -8], faL: [-22, 0, 0], uaR: [-162, 0, 8], faR: [-22, 0, 0], hL: [0, 0, 0], hR: [0, 0, 0],
};
add('catch_show', {
  duration: 3.0, next: 'catch_hold', meta: { look: 0, armIK: null },
  keys: [
    [0, {}],
    [0.3, { ...HOLD, rod: 1, head: [16, 0, 0], mouth: 0.3 }],
    [0.42, { rod: 0 }],
    // anticipation: sink, then push the fish up overhead with a proud chest
    [0.75, { pos: [0, -0.1, 0], knL: [30, 0, 0], knR: [30, 0, 0], thL: [-20, 0, 4], thR: [-20, 0, -4], spine: [12, 0, 0], head: [8, 0, 0],
      uaL: [-60, 0, -8], faL: [-90, 0, 0], uaR: [-60, 0, 8], faR: [-90, 0, 0] }],
    [1.15, { ...OVERHEAD, pos: [0, 0.05, 0], knL: [0, 0, 0], knR: [0, 0, 0], thL: [0, 0, 4], thR: [0, 0, -4], ftL: [12, 0, 0], ftR: [12, 0, 0],
      spine: [-6, 0, 0], chest: [-12, 0, 0], head: [-26, 0, 0], mouth: 0.9, eyes: 0.6, brow: 0.9 }, 'back'],
    [1.5, { pos: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], chest: [-10, 6, 0], hips: [0, -4, 0] }],
    [1.9, { chest: [-10, -6, 0], hips: [0, 4, 0], head: [-24, 0, 4] }],
    [2.25, { chest: [-10, 0, 0], hips: [0, 0, 0], head: [-22, 0, 0] }],
    [3.0, { ...HOLD, head: [8, 0, 0], eyes: 1, brow: 0.3 }],
  ],
  events: [{ t: 1.1, name: 'show' }],
});

add('catch_hold', {
  duration: 3.2, loop: true, meta: { look: 0 },
  keys: [[0, HOLD], [1.6, { head: [12, 0, 6], chest: [-2, 6, 0] }]],
  osc: { pos: { y: [0.006, 2, 0] }, uaL: { x: [2, 1, 0] }, uaR: { x: [2, 1, 0] } },
});

add('catch_happy', {
  duration: 1.6, meta: { look: 0, footIK: 0.2 },
  keys: [
    [0, {}],
    [0.28, { pos: [0, -0.14, 0], thL: [-36, 0, 6], thR: [-36, 0, -6], knL: [62, 0, 0], knR: [62, 0, 0], ftL: [-24, 0, 0], ftR: [-24, 0, 0],
      spine: [20, 0, 0], head: [4, 0, 0], uaL: [20, 0, -30], faL: [-30, 0, 0], uaR: [16, 0, 30], faR: [-34, 0, 0], rod: 0.6 }],
    [0.5, { pos: [0, 0.34, 0], thL: [-30, 0, 10], thR: [-24, 0, -10], knL: [56, 0, 0], knR: [48, 0, 0], ftL: [18, 0, 0], ftR: [18, 0, 0],
      spine: [-6, 0, 0], chest: [-10, 0, 0], head: [-22, 0, 0], uaL: [-150, 0, 34], faL: [-20, 0, 0], uaR: [-150, 0, -34], faR: [-20, 0, 0], hR: [40, 0, 0],
      mouth: 1, eyes: 0.15, brow: 1 }, 'out'],
    [0.68, { pos: [0, 0.3, 0] }],
    [0.86, { pos: [0, -0.12, 0], thL: [-30, 0, 6], thR: [-30, 0, -6], knL: [54, 0, 0], knR: [54, 0, 0], ftL: [-22, 0, 0], ftR: [-22, 0, 0], spine: [14, 0, 0], head: [-6, 0, 0] }, 'in'],
    [1.1, { pos: [0, 0.02, 0], thL: [0, 0, 2], thR: [0, 0, -2], knL: [4, 0, 0], knR: [4, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], spine: [2, 0, 0], uaL: [-130, 0, 30], uaR: [-130, 0, -30] }],
    [1.6, { ...STAND, mouth: 0.4 }],
  ],
  events: [{ t: 0.86, name: 'land' }],
});

add('fail_shrug', {
  duration: 1.9, meta: { look: 0.2 },
  keys: [
    [0, {}],
    [0.35, { shL: [0, 0, 14], shR: [0, 0, -14], uaL: [-24, 0, 6], faL: [-84, 0, 0], hL: [0, -40, 0], uaR: [-24, 0, -6], faR: [-80, 0, 0], hR: [30, 0, 0],
      head: [-2, 0, 14], chest: [-4, 0, 0], brow: 0.9, mouth: 0.25, pos: [0, 0.015, 0] }, 'back'],
    [0.85, { head: [-2, 0, 16] }],
    // sigh: everything sags, then a little recovery
    [1.25, { shL: [0, 0, -4], shR: [0, 0, 4], uaL: [0, 0, -32], faL: [-10, 0, 0], hL: [0, 0, 0], uaR: [-4, 0, 30], faR: [-18, 0, 0], hR: [10, 0, 0],
      head: [16, 0, 0], spine: [12, 0, 0], chest: [6, 0, 0], brow: -0.5, mouth: 0, eyes: 0.5, pos: [0, -0.03, 0] }],
    [1.9, { ...STAND }],
  ],
});

// =============================================================================== sitting on the dock edge
const SIT = {
  pos: [0, -0.62, -0.1], hips: [0, 0, 0], spine: [8, 0, 0], chest: [2, 0, 0], neck: [0, 0, 0], head: [-6, 0, 0],
  thL: [-88, 0, 6], thR: [-88, 0, -6], knL: [82, 0, 0], knR: [82, 0, 0], ftL: [10, 0, 0], ftR: [10, 0, 0],
  uaL: [16, 0, -16], faL: [-16, 0, 0], hL: [0, 0, 0], uaR: [-10, 0, 26], faR: [-40, 0, 0], hR: [20, 0, 0],
};
add('sit_down', {
  duration: 1.4, next: 'sit_idle', meta: { footIK: 0, sit: 1, look: 0.3 },
  keys: [
    [0, {}],
    [0.4, { pos: [0, -0.24, 0.02], thL: [-58, 0, 4], thR: [-58, 0, -4], knL: [76, 0, 0], knR: [76, 0, 0], ftL: [-18, 0, 0], ftR: [-18, 0, 0],
      spine: [24, 0, 0], head: [-14, 0, 0], uaL: [-40, 0, -20], faL: [-30, 0, 0], uaR: [-34, 0, 24], faR: [-34, 0, 0] }],
    [0.85, { ...SIT, pos: [0, -0.64, -0.08], spine: [14, 0, 0], uaL: [24, 0, -14], faL: [-6, 0, 0], ftL: [-6, 0, 0], ftR: [-6, 0, 0] }, 'inOut'],
    [1.05, { pos: [0, -0.6, -0.1], spine: [4, 0, 0], knL: [70, 0, 0], knR: [90, 0, 0] }],
    [1.4, SIT],
  ],
});

add('sit_idle', {
  duration: 4.8, loop: true, meta: { footIK: 0, sit: 1, look: 1 },
  keys: [[0, SIT], [2.4, { spine: [6, 0, 2], head: [-8, 10, 0] }]],
  osc: {
    knL: { x: [18, 3, 0] }, knR: { x: [18, 3, 0.5] }, ftL: { x: [8, 3, 0.1] }, ftR: { x: [8, 3, 0.6] },
    thL: { x: [3, 3, 0.25] }, thR: { x: [3, 3, 0.75] },
    chest: { y: [3, 1, 0.2] }, head: { y: [10, 1, 0], z: [3, 1, 0.3] }, uaL: { x: [2, 1, 0] },
  },
});

add('stand_up', {
  duration: 1.3, meta: { footIK: 0.3, sit: 0.5, look: 0.3 },
  keys: [
    [0, SIT],
    // swing the legs up onto the planks, hands push
    [0.4, { thL: [-112, 0, 10], thR: [-108, 0, -10], knL: [134, 0, 0], knR: [130, 0, 0], ftL: [-10, 0, 0], ftR: [-10, 0, 0],
      spine: [18, 0, 0], uaL: [30, 0, -10], faL: [-4, 0, 0], pos: [0, -0.6, -0.12] }],
    [0.8, { pos: [0, -0.3, -0.04], thL: [-66, 0, 4], thR: [-66, 0, -4], knL: [86, 0, 0], knR: [86, 0, 0], ftL: [-18, 0, 0], ftR: [-18, 0, 0],
      spine: [30, 0, 0], head: [-18, 0, 0], uaL: [-30, 0, -24], faL: [-30, 0, 0] }, 'inOut'],
    [1.3, { ...STAND }],
  ],
});

/** Sitting in the rowing boat (bench seat), legs forward. */
const BOAT = { ...SIT, pos: [0, -0.6, -0.05], thL: [-80, 0, 10], thR: [-80, 0, -10], knL: [66, 0, 0], knR: [66, 0, 0], ftL: [-10, 0, 0], ftR: [-10, 0, 0], uaL: [-10, 0, -24], faL: [-50, 0, 0] };
add('sit_boat', {
  duration: 5, loop: true, meta: { footIK: 0, sit: 1, look: 1 },
  keys: [[0, BOAT]],
  osc: { spine: { z: [2, 1, 0] }, head: { y: [8, 1, 0.2], z: [2, 1, 0.5] }, chest: { y: [3, 1, 0.4] } },
});

add('row', {
  duration: 1.8, loop: true, meta: { footIK: 0, sit: 1, look: 0.3, armIK: null },
  keys: [
    // reach forward (blades enter the water)
    [0, { ...BOAT, rod: 0, spine: [26, 0, 0], chest: [6, 0, 0], head: [-26, 0, 0], uaL: [-78, 0, -12], faL: [-10, 0, 0], uaR: [-78, 0, 12], faR: [-10, 0, 0], hR: [0, 0, 0], knL: [80, 0, 0], knR: [80, 0, 0] }],
    // drive: lean back and pull the elbows past the ribs
    [0.7, { spine: [-14, 0, 0], chest: [-6, 0, 0], head: [-4, 0, 0], uaL: [24, 0, -18], faL: [-104, 0, 0], uaR: [24, 0, 18], faR: [-104, 0, 0], knL: [58, 0, 0], knR: [58, 0, 0], brow: -0.3 }, 'inOut'],
    [0.95, { spine: [-12, 0, 0], uaL: [20, 0, -20], uaR: [20, 0, 20] }],
    // recovery: hands away first, then the body follows
    [1.35, { spine: [6, 0, 0], head: [-14, 0, 0], uaL: [-46, 0, -14], faL: [-40, 0, 0], uaR: [-46, 0, 14], faR: [-40, 0, 0], brow: 0 }],
  ],
  events: [{ t: 0.05, name: 'stroke' }],
});

// =============================================================================== small life
add('crouch_pick', {
  duration: 1.8, meta: { look: 0.2 },
  keys: [
    [0, {}],
    [0.5, { pos: [0, -0.3, 0], thL: [-64, 0, 10], thR: [-50, 0, -8], knL: [100, 0, 0], knR: [86, 0, 0], ftL: [-30, 0, 0], ftR: [-26, 0, 0],
      spine: [30, 0, 0], chest: [8, 0, 0], head: [16, 0, 0], uaL: [-62, 0, -12], faL: [-16, 0, 0], uaR: [-16, 0, 36], faR: [-30, 0, 0] }],
    [0.72, { uaL: [-58, 0, -10], faL: [-24, 0, 0], hL: [20, 0, 0] }],
    [1.05, { pos: [0, -0.22, 0], spine: [16, 0, 0], head: [10, 0, 0], uaL: [-40, 0, -24], faL: [-108, 0, 0], hL: [0, 0, 0], brow: 0.6, mouth: 0.3 }],
    [1.35, { head: [12, 0, 10] }],
    [1.8, { ...STAND, mouth: 0.2 }],
  ].map(([t, p, e]) => [t, carry(p, 30, 0.5), e]),
  events: [{ t: 0.7, name: 'pick' }],
});

const CROUCH = { pos: [0, -0.3, 0], thL: [-62, 0, 12], thR: [-48, 0, -10], knL: [98, 0, 0], knR: [84, 0, 0], ftL: [-30, 0, 0], ftR: [-24, 0, 0], spine: [26, 0, 0], chest: [6, 0, 0], head: [12, 0, 8], uaR: [-12, 0, 40], faR: [-30, 0, 0] };
add('pet', {
  duration: 3.2, meta: { look: 0.6 },
  keys: [
    [0, {}],
    [0.55, { ...CROUCH, uaL: [-56, 0, -18], faL: [-14, 0, 0], hL: [12, 0, 0] }],
    [0.9, { uaL: [-48, 0, -16], hL: [-6, 0, 0], mouth: 0.4, eyes: 0.5 }], [1.25, { uaL: [-58, 0, -18], hL: [14, 0, 0] }],
    [1.6, { uaL: [-48, 0, -16], hL: [-6, 0, 0], head: [12, 0, 12] }], [1.95, { uaL: [-58, 0, -18], hL: [14, 0, 0] }],
    [2.3, { uaL: [-48, 0, -16], hL: [-6, 0, 0] }],
    [3.2, { ...STAND, mouth: 0.3 }],
  ].map(([t, p, e]) => [t, carry(p, 28, 0.5), e]),
});

const MOUTH_L = { uaL: [-34, 0, -22], faL: [-128, 0, 0], hL: [-10, 0, 0] };
add('eat', {
  duration: 2.6, meta: { look: 0 },
  keys: [
    [0, {}],
    [0.45, { ...MOUTH_L, uaL: [-40, 0, -22], head: [-4, 0, 0], mouth: 0.6 }],
    [0.65, { head: [8, 0, 0], mouth: 0, ...MOUTH_L }],
    [0.85, { head: [-2, 0, 0], uaL: [-28, 0, -24], faL: [-110, 0, 0], mouth: 0.3 }],
    [1.05, { mouth: 0 }], [1.25, { mouth: 0.3 }],
    [1.45, { ...MOUTH_L, head: [6, 0, 0], mouth: 0.7 }],
    [1.6, { head: [8, 0, 0], mouth: 0 }],
    [1.8, { mouth: 0.3, eyes: 0.3, head: [-6, 0, 6], uaL: [-20, 0, -26], faL: [-90, 0, 0] }], [2.0, { mouth: 0 }], [2.15, { mouth: 0.3 }],
    [2.6, { ...STAND, eyes: 1 }],
  ].map(([t, p, e]) => [t, carry(p, 30, 0.6), e]),
  events: [{ t: 0.65, name: 'bite' }, { t: 1.6, name: 'bite' }],
});

// From the top-down camera an arm straight up is foreshortened to nothing: the wave stays low and wide (out past the
// big hat brim), sweeping in a plane the camera can see, with a little bounce of the whole body.
add('wave', {
  duration: 1.9, meta: { look: 1 },
  keys: [
    [0, {}],
    [0.18, { pos: [0, -0.025, 0], knL: [10, 0, 0], knR: [10, 0, 0], uaL: [-30, 0, 10], faL: [-60, 0, 0] }],
    [0.36, { pos: [0, 0.015, 0], knL: [0, 0, 0], knR: [0, 0, 0], uaL: [-44, 0, 58], faL: [-30, 0, 0], hL: [0, 0, 0], chest: [-5, -8, -5], head: [-10, 0, -8], mouth: 0.55, brow: 0.7 }, 'back'],
    [0.56, { uaL: [-46, 0, 78], faL: [-8, 0, 0], pos: [0, 0, 0] }], [0.76, { uaL: [-40, 0, 48], faL: [-40, 0, 0] }],
    [0.96, { uaL: [-46, 0, 78], faL: [-8, 0, 0] }], [1.16, { uaL: [-40, 0, 48], faL: [-40, 0, 0] }],
    [1.36, { uaL: [-46, 0, 74], faL: [-12, 0, 0] }],
    [1.9, { ...STAND, mouth: 0.2 }],
  ],
});

add('talk', {
  duration: 3.6, loop: true, meta: { look: 1 },
  keys: [
    [0, { uaL: [-18, 0, -26], faL: [-60, 0, 0], hL: [0, -30, 0] }],
    [0.7, { uaL: [-34, 0, -8], faL: [-56, 0, 0], hL: [0, -50, 0], chest: [-3, -6, 0], brow: 0.5 }],
    [1.3, { uaL: [-22, 0, -20], faL: [-66, 0, 0], hL: [0, -30, 0], chest: [-2, 0, 0], brow: 0 }],
    [2.1, { uaL: [-6, 0, -28], faL: [-30, 0, 0], head: [-4, 0, 6] }],
    [2.7, { uaL: [-30, 0, -14], faL: [-72, 0, 0], head: [-6, 0, 0], brow: 0.4 }],
  ],
  osc: { head: { x: [3, 4, 0], y: [5, 1, 0.2] }, chest: { y: [3, 1, 0.5] }, spine: { z: [1.5, 1, 0.1] } },
});

/** Lying on the back (bed / blanket): the whole body pivots around the hips. */
const SLEEP = {
  pos: [0, -0.55, 0], hips: [-90, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [6, 0, 0], head: [8, 18, 0],
  thL: [0, 0, 6], thR: [0, 0, -6], knL: [6, 0, 0], knR: [10, 0, 0], ftL: [-30, 0, 0], ftR: [-30, 0, 0],
  uaL: [-10, 0, -26], faL: [-60, 0, 0], uaR: [-10, 0, 26], faR: [-60, 0, 0], hR: [0, 0, 0], rod: 0, eyes: 0, mouth: 0.12,
};
add('sleep', {
  duration: 4.4, loop: true, meta: { footIK: 0, sit: 1, look: 0, breathe: 0 },
  keys: [[0, SLEEP]],
  osc: { chest: { x: [-2.5, 1, 0] }, spine: { x: [-1, 1, 0.1] }, uaL: { x: [1.5, 1, 0.05] }, uaR: { x: [1.5, 1, 0.05] } },
});

add('wake', {
  duration: 2.8, meta: { footIK: 0, sit: 1, look: 0 },
  keys: [
    [0, SLEEP],
    [0.7, { uaL: [-176, 0, 10], faL: [-20, 0, 0], uaR: [-176, 0, -10], faR: [-20, 0, 0], ftL: [20, 0, 0], ftR: [20, 0, 0], eyes: 0.2, mouth: 0.9, head: [-6, 0, 0] }],
    [1.4, { pos: [0, -0.6, -0.05], hips: [-12, 0, 0], spine: [10, 0, 0], thL: [-78, 0, 6], thR: [-78, 0, -6], knL: [6, 0, 0], knR: [6, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0],
      uaL: [14, 0, -18], faL: [-10, 0, 0], uaR: [14, 0, 18], faR: [-10, 0, 0], head: [4, 0, 0], eyes: 0.6, mouth: 0 }, 'inOut'],
    [2.0, { pos: [0, -0.32, 0.02], hips: [0, 0, 0], spine: [28, 0, 0], thL: [-64, 0, 4], thR: [-64, 0, -4], knL: [84, 0, 0], knR: [84, 0, 0], ftL: [-18, 0, 0], ftR: [-18, 0, 0], head: [-14, 0, 0], eyes: 1 }],
    [2.8, { ...STAND, rod: 0 }],
  ],
});

// =============================================================================== [r2-animation] catch actions
// Timings (seconds) of the events below are documented in docs/CHANGES.md: Gameplay syncs the fish on them.
/** Low crouch over the mat / bucket, weight forward, both feet flat. */
const LOW = { pos: [0, -0.3, 0.04], thL: [-64, 0, 10], thR: [-56, 0, -10], knL: [100, 0, 0], knR: [94, 0, 0], ftL: [-32, 0, 0], ftR: [-30, 0, 0],
  spine: [30, 0, 0], chest: [8, 0, 0], neck: [4, 0, 0], head: [14, 0, 0] };
/** One knee down (right knee on the planks), left foot forward: for the longer chores. */
const KNEEL = { pos: [0, -0.36, 0.03], hips: [0, 0, 0], thL: [-78, 0, 8], knL: [84, 0, 0], ftL: [-6, 0, 0], thR: [-6, 0, -6], knR: [96, 0, 0], ftR: [40, 0, 0],
  spine: [32, 0, 0], chest: [10, 0, 0], neck: [4, 0, 0], head: [16, 0, 0] };
/** Both hands low in front (setting something down on the ground). */
const REACH = { uaL: [-58, 0, -4], faL: [-26, 0, 0], hL: [10, 0, 0], uaR: [-58, 0, 4], faR: [-26, 0, 0], hR: [10, 0, 0] };

add('lay_on_mat', {
  duration: 2.6, meta: { look: 0.35, breathe: 0.5 },
  keys: [
    [0, HOLD],
    // anticipation: a little rise, fish pulled to the chest, eyes on the mat
    [0.3, { pos: [0, 0.015, -0.01], spine: [0, 0, 0], head: [16, 0, 0], uaL: [-40, 0, -8], faL: [-92, 0, 0], uaR: [-40, 0, 8], faR: [-92, 0, 0], mouth: 0.25 }, 'back'],
    [0.85, { ...LOW, ...REACH, head: [18, 0, 0], mouth: 0.1 }, 'inOut'],
    // set it down gently (hands sink a touch more and open)
    [1.1, { pos: [0, -0.32, 0.05], uaL: [-54, 0, -10], faL: [-20, 0, 0], uaR: [-54, 0, 10], faR: [-20, 0, 0], hL: [0, 0, 0], hR: [0, 0, 0] }, 'out'],
    // two pats with the right hand, the left hand rests on the mat
    [1.35, { uaR: [-46, 0, 8], faR: [-50, 0, 0], hR: [-10, 0, 0], head: [16, 0, 6], mouth: 0.35 }],
    [1.5, { uaR: [-56, 0, 8], faR: [-18, 0, 0], hR: [14, 0, 0] }, 'snap'],
    [1.68, { uaR: [-48, 0, 8], faR: [-44, 0, 0], hR: [-8, 0, 0] }],
    [1.82, { uaR: [-56, 0, 8], faR: [-18, 0, 0], hR: [14, 0, 0] }, 'snap'],
    // satisfied: back up, a glance up with a smile
    [2.2, { pos: [0, -0.1, 0.01], thL: [-24, 0, 4], thR: [-20, 0, -4], knL: [36, 0, 0], knR: [34, 0, 0], ftL: [-12, 0, 0], ftR: [-12, 0, 0],
      spine: [10, 0, 0], chest: [0, 0, 0], head: [-8, 0, 0], uaL: [-10, 0, -26], faL: [-24, 0, 0], uaR: [-10, 0, 28], faR: [-26, 0, 0], hL: [0, 0, 0], hR: [13, 0, 0], mouth: 0.5, eyes: 0.55, brow: 0.5, rod: 1 }],
    [2.6, { ...STAND, mouth: 0.25 }],
  ],
  events: [{ t: 1.08, name: 'release' }, { t: 1.5, name: 'pat' }, { t: 1.82, name: 'pat' }],
});

add('clean_fish', {
  duration: 5.2, meta: { look: 0.45, breathe: 0.6, footIK: 0.7 },
  keys: [
    [0, { rod: 1 }],
    [0.25, { rod: 0, pos: [0, -0.04, 0], spine: [8, 0, 0], head: [10, 0, 0] }],
    [0.65, { ...KNEEL, uaL: [-60, 0, -2], faL: [-22, 0, 0], hL: [12, 0, 0], uaR: [-44, 0, 16], faR: [-70, 0, 0], hR: [24, 0, 0], brow: 0.3 }, 'inOut'],
    // three knife strokes from tail to head, the left hand holds the fish
    [0.95, { uaR: [-48, 0, 12], faR: [-62, 0, 0], hR: [30, 0, 0], chest: [10, 6, 0] }],
    [1.2, { uaR: [-64, 0, 2], faR: [-18, 0, 0], hR: [14, 0, 0], chest: [12, -6, 0] }, 'out'],
    [1.45, { uaR: [-48, 0, 12], faR: [-62, 0, 0], hR: [30, 0, 0], chest: [10, 6, 0] }],
    [1.7, { uaR: [-64, 0, 2], faR: [-18, 0, 0], hR: [14, 0, 0], chest: [12, -6, 0] }, 'out'],
    [1.95, { uaR: [-48, 0, 12], faR: [-62, 0, 0], hR: [30, 0, 0], chest: [10, 6, 0] }],
    [2.2, { uaR: [-64, 0, 2], faR: [-18, 0, 0], hR: [14, 0, 0], chest: [12, -6, 0], mouth: 0.15 }, 'out'],
    // turn it over: both hands under the fish, a little lift and roll of the wrists
    [2.45, { uaL: [-64, 0, -6], faL: [-16, 0, 0], hL: [0, 0, -30], uaR: [-60, 0, 8], faR: [-24, 0, 0], hR: [20, 0, 30], chest: [10, 0, 0] }],
    [2.7, { uaL: [-70, 0, -6], faL: [-30, 0, 0], hL: [0, 0, 30], uaR: [-66, 0, 8], faR: [-34, 0, 0], hR: [20, 0, -30], head: [18, 0, 0] }, 'back'],
    [2.95, { uaL: [-60, 0, -2], faL: [-22, 0, 0], hL: [12, 0, 0], uaR: [-48, 0, 12], faR: [-62, 0, 0], hR: [30, 0, 0] }],
    [3.2, { uaR: [-64, 0, 2], faR: [-18, 0, 0], hR: [14, 0, 0], chest: [12, -6, 0] }, 'out'],
    [3.45, { uaR: [-48, 0, 12], faR: [-62, 0, 0], hR: [30, 0, 0], chest: [10, 6, 0] }],
    // rinse: cupped hands up, then a quick splash down over the fish
    [3.85, { uaL: [-84, 0, -2], faL: [-70, 0, 0], hL: [-20, 0, 0], uaR: [-84, 0, 2], faR: [-70, 0, 0], hR: [-20, 0, 0], chest: [6, 0, 0], head: [8, 0, 0], brow: 0.5 }],
    [4.05, { uaL: [-62, 0, -10], faL: [-24, 0, 0], hL: [20, 0, 0], uaR: [-62, 0, 10], faR: [-24, 0, 0], hR: [20, 0, 0], mouth: 0.45, eyes: 0.6 }, 'snap'],
    [4.35, { head: [12, 0, 6], mouth: 0.5 }],
    [4.75, { pos: [0, -0.1, 0.01], thL: [-24, 0, 4], thR: [-20, 0, -4], knL: [36, 0, 0], knR: [34, 0, 0], ftL: [-12, 0, 0], ftR: [-12, 0, 0], spine: [10, 0, 0], chest: [0, 0, 0], head: [-6, 0, 0],
      uaL: [-10, 0, -26], faL: [-24, 0, 0], hL: [0, 0, 0], uaR: [-10, 0, 28], faR: [-26, 0, 0], hR: [13, 0, 0], rod: 1, eyes: 1 }],
    [5.2, { ...STAND, mouth: 0.25 }],
  ],
  events: [{ t: 0.5, name: 'knife_on' }, { t: 1.2, name: 'stroke' }, { t: 1.7, name: 'stroke' }, { t: 2.2, name: 'stroke' },
    { t: 2.6, name: 'flip' }, { t: 3.2, name: 'stroke' }, { t: 3.6, name: 'knife_off' }, { t: 4.05, name: 'rinse' }],
});

// [11 nov] cooking at the campfire / stove: kneel, the left hand holds the pan handle, the right one stirs in circles,
// a little taste at the end
add('cook_stir', {
  duration: 3.6, meta: { look: 0.4, breathe: 0.6, footIK: 0.7 },
  keys: [
    [0, { rod: 1 }],
    [0.25, { rod: 0, pos: [0, -0.04, 0], spine: [8, 0, 0], head: [12, 0, 0] }],
    [0.6, { ...KNEEL, uaL: [-52, 0, -10], faL: [-38, 0, 0], hL: [0, 0, 0], uaR: [-46, 0, 14], faR: [-60, 0, 0], hR: [20, 0, 0], head: [16, 0, 0] }, 'inOut'],
    [0.85, { uaR: [-46, 10, 16], faR: [-56, 0, 0], chest: [10, 4, 0] }],
    [1.15, { uaR: [-54, -10, 8], faR: [-66, 0, 0], chest: [10, -4, 0] }],
    [1.45, { uaR: [-46, 10, 16], faR: [-56, 0, 0], chest: [10, 4, 0] }],
    [1.75, { uaR: [-54, -10, 8], faR: [-66, 0, 0], chest: [10, -4, 0] }],
    [2.05, { uaR: [-46, 10, 16], faR: [-56, 0, 0], chest: [10, 4, 0] }],
    [2.35, { uaR: [-54, -10, 8], faR: [-66, 0, 0], chest: [10, -4, 0] }],
    [2.75, { uaR: [-80, 0, 6], faR: [-110, 0, 0], hR: [-10, 0, 0], head: [4, 0, 0], mouth: 0.4, brow: 0.4 }, 'inOut'],
    [3.05, { mouth: 0.1, eyes: 0.4, head: [10, 0, 6] }],
    [3.6, { ...STAND, mouth: 0.25 }],
  ],
  events: [{ t: 0.6, name: 'pan_on' }, { t: 1.0, name: 'stir' }, { t: 1.6, name: 'stir' }, { t: 2.2, name: 'stir' }, { t: 2.8, name: 'taste' }],
});

// [11 nov] the same stirring standing at the trattoria counter (no fire on the floor there)
add('cook_counter', {
  duration: 3.6, meta: { look: 0.4, breathe: 0.6, footIK: 0.7 },
  keys: [
    [0, { rod: 1 }],
    [0.25, { rod: 0, spine: [8, 0, 0], head: [12, 0, 0] }],
    [0.6, { uaL: [-52, 0, -10], faL: [-38, 0, 0], hL: [0, 0, 0], uaR: [-46, 0, 14], faR: [-60, 0, 0], hR: [20, 0, 0], head: [16, 0, 0] }, 'inOut'],
    [0.85, { uaR: [-46, 10, 16], faR: [-56, 0, 0], chest: [10, 4, 0] }],
    [1.15, { uaR: [-54, -10, 8], faR: [-66, 0, 0], chest: [10, -4, 0] }],
    [1.45, { uaR: [-46, 10, 16], faR: [-56, 0, 0], chest: [10, 4, 0] }],
    [1.75, { uaR: [-54, -10, 8], faR: [-66, 0, 0], chest: [10, -4, 0] }],
    [2.05, { uaR: [-46, 10, 16], faR: [-56, 0, 0], chest: [10, 4, 0] }],
    [2.35, { uaR: [-54, -10, 8], faR: [-66, 0, 0], chest: [10, -4, 0] }],
    [2.75, { uaR: [-80, 0, 6], faR: [-110, 0, 0], hR: [-10, 0, 0], head: [4, 0, 0], mouth: 0.4, brow: 0.4 }, 'inOut'],
    [3.05, { mouth: 0.1, eyes: 0.4, head: [10, 0, 6] }],
    [3.6, { ...STAND, mouth: 0.25 }],
  ],
  events: [{ t: 0.6, name: 'pan_on' }, { t: 1.0, name: 'stir' }, { t: 1.6, name: 'stir' }, { t: 2.2, name: 'stir' }, { t: 2.8, name: 'taste' }],
});

add('put_in_bucket', {
  duration: 2.3, meta: { look: 0.35, breathe: 0.6 },
  keys: [
    [0, HOLD],
    [0.3, { pos: [0, 0.01, 0], head: [14, 0, 0], uaL: [-40, 0, -8], faL: [-90, 0, 0], uaR: [-40, 0, 8], faR: [-90, 0, 0] }, 'back'],
    [0.75, { ...LOW, pos: [0, -0.2, 0.04], knL: [70, 0, 0], knR: [64, 0, 0], thL: [-46, 0, 8], thR: [-40, 0, -8], ftL: [-24, 0, 0], ftR: [-22, 0, 0], spine: [26, 0, 0],
      uaL: [-62, 0, -6], faL: [-40, 0, 0], uaR: [-62, 0, 6], faR: [-40, 0, 0], head: [18, 0, 0] }, 'inOut'],
    // let go: hands open apart
    [0.95, { uaL: [-58, 0, -22], faL: [-30, 0, 0], hL: [0, 0, 20], uaR: [-58, 0, 22], faR: [-30, 0, 0], hR: [0, 0, -20], mouth: 0.4, brow: 0.6 }, 'snap'],
    // brush the hands
    [1.25, { uaL: [-44, 0, -4], faL: [-70, 0, 0], hL: [0, 30, 0], uaR: [-44, 0, 4], faR: [-70, 0, 0], hR: [0, -30, 0], head: [10, 0, 0] }],
    [1.4, { hL: [0, -20, 0], hR: [0, 20, 0] }], [1.55, { hL: [0, 30, 0], hR: [0, -30, 0] }],
    [1.95, { pos: [0, -0.04, 0], thL: [-8, 0, 2], thR: [-8, 0, -2], knL: [10, 0, 0], knR: [10, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], spine: [4, 0, 0], head: [-4, 0, 0],
      uaL: [-6, 0, -28], faL: [-18, 0, 0], hL: [0, 0, 0], uaR: [-8, 0, 30], faR: [-22, 0, 0], hR: [13, 0, 0], rod: 1, mouth: 0.3 }],
    [2.3, { ...STAND, mouth: 0.2 }],
  ],
  events: [{ t: 0.92, name: 'drop' }],
});

add('show_to_cat', {
  duration: 2.9, next: 'catch_hold', meta: { look: 0.6, breathe: 0.7 },
  keys: [
    [0, HOLD],
    [0.3, { pos: [0, 0.01, 0], head: [6, 0, 0], brow: 0.5 }, 'back'],
    [0.8, { ...LOW, pos: [0, -0.28, 0.05], spine: [24, 0, 0], head: [6, 0, 0], uaL: [-74, 0, -6], faL: [-12, 0, 0], hL: [0, 0, 0], uaR: [-74, 0, 6], faR: [-12, 0, 0], hR: [0, 0, 0],
      mouth: 0.45, brow: 0.7 }, 'inOut'],
    // offer it forward, a gentle wiggle "look, Biscotto!"
    [1.05, { uaL: [-80, 0, -6], faL: [-6, 0, 0], uaR: [-80, 0, 6], faR: [-6, 0, 0], head: [2, 0, 8] }, 'out'],
    [1.3, { uaL: [-78, 8, -6], uaR: [-78, 8, 6] }], [1.55, { uaL: [-78, -8, -6], uaR: [-78, -8, 6], head: [2, 0, -6] }], [1.8, { uaL: [-80, 0, -6], uaR: [-80, 0, 6], mouth: 0.6, eyes: 0.5 }],
    [2.4, { ...HOLD, pos: [0, -0.03, 0], head: [12, 0, 0], mouth: 0.4, eyes: 1 }],
    [2.9, HOLD],
  ],
  events: [{ t: 1.05, name: 'offer' }],
});

add('unroll_mat', {
  duration: 2.5, meta: { look: 0.3, breathe: 0.6 },
  keys: [
    [0, { rod: 1 }],
    [0.3, { rod: 0, uaL: [-40, 0, -10], faL: [-80, 0, 0], uaR: [-40, 0, 10], faR: [-80, 0, 0], head: [10, 0, 0] }],
    [0.7, { ...LOW, uaL: [-56, 0, -10], faL: [-30, 0, 0], hL: [10, 0, 0], uaR: [-56, 0, 10], faR: [-30, 0, 0], hR: [10, 0, 0] }, 'inOut'],
    // push the roll away: lean out, arms extend
    [1.5, { pos: [0, -0.3, 0.12], spine: [40, 0, 0], uaL: [-84, 0, -8], faL: [-4, 0, 0], uaR: [-84, 0, 8], faR: [-4, 0, 0], head: [8, 0, 0], brow: 0.3 }, 'inOut'],
    // smooth it flat with both hands
    [1.75, { uaL: [-72, 0, -20], faL: [-10, 0, 0], uaR: [-72, 0, 20], faR: [-10, 0, 0], pos: [0, -0.3, 0.08] }],
    [1.95, { pos: [0, -0.12, 0.02], thL: [-28, 0, 4], thR: [-24, 0, -4], knL: [40, 0, 0], knR: [38, 0, 0], ftL: [-12, 0, 0], ftR: [-12, 0, 0], spine: [12, 0, 0],
      uaL: [-10, 0, -26], faL: [-24, 0, 0], hL: [0, 0, 0], uaR: [-10, 0, 28], faR: [-26, 0, 0], hR: [13, 0, 0], head: [-6, 0, 0], mouth: 0.4, rod: 1 }],
    [2.5, { ...STAND, mouth: 0.2 }],
  ],
  events: [{ t: 0.65, name: 'place' }],
});

add('roll_mat', {
  duration: 2.6, meta: { look: 0.3, breathe: 0.6 },
  keys: [
    [0, { rod: 1 }],
    [0.3, { rod: 0, head: [10, 0, 0] }],
    [0.75, { ...LOW, pos: [0, -0.3, 0.12], spine: [40, 0, 0], uaL: [-84, 0, -8], faL: [-6, 0, 0], hL: [20, 0, 0], uaR: [-84, 0, 8], faR: [-6, 0, 0], hR: [20, 0, 0] }, 'inOut'],
    // roll it toward himself: hands turn over and over while pulling back
    [1.0, { hL: [-20, 0, 0], hR: [-20, 0, 0] }], [1.2, { hL: [20, 0, 0], hR: [20, 0, 0], uaL: [-74, 0, -8], uaR: [-74, 0, 8], faL: [-14, 0, 0], faR: [-14, 0, 0], pos: [0, -0.3, 0.08], spine: [36, 0, 0] }],
    [1.4, { hL: [-20, 0, 0], hR: [-20, 0, 0] }], [1.6, { hL: [20, 0, 0], hR: [20, 0, 0], uaL: [-62, 0, -8], uaR: [-62, 0, 8], faL: [-28, 0, 0], faR: [-28, 0, 0], pos: [0, -0.3, 0.03], spine: [30, 0, 0] }],
    [1.8, { hL: [-10, 0, 0], hR: [-10, 0, 0] }],
    // pick the roll up and tuck it away
    [2.05, { pos: [0, -0.08, 0], thL: [-20, 0, 4], thR: [-18, 0, -4], knL: [30, 0, 0], knR: [28, 0, 0], ftL: [-10, 0, 0], ftR: [-10, 0, 0], spine: [8, 0, 0],
      uaL: [-30, 0, -6], faL: [-96, 0, 0], hL: [0, 0, 0], uaR: [-30, 0, 6], faR: [-96, 0, 0], hR: [0, 0, 0], head: [-4, 0, 0], mouth: 0.3 }],
    [2.25, { rod: 1 }],
    [2.6, { ...STAND, mouth: 0.2 }],
  ],
  events: [{ t: 0.8, name: 'roll' }, { t: 2.0, name: 'tuck' }],
});

/** Proud pose for close-ups: the fish lifted beside the face, chest out, happy squint, head tilted to the camera. */
add('catch_proud', {
  duration: 2.6, next: 'catch_hold', meta: { look: 0, breathe: 0.6 },
  keys: [
    [0, HOLD],
    [0.3, { pos: [0, -0.06, 0], knL: [16, 0, 0], knR: [16, 0, 0], thL: [-10, 0, 3], thR: [-10, 0, -3], spine: [10, 0, 0], head: [14, 0, 0], uaL: [-40, 0, -6], faL: [-84, 0, 0], uaR: [-40, 0, 6], faR: [-84, 0, 0], mouth: 0.2 }],
    [0.75, { pos: [0, 0.02, 0], knL: [0, 0, 0], knR: [0, 0, 0], thL: [0, 0, 2], thR: [0, 0, -2], spine: [-4, 0, 0], chest: [-12, 0, 0], neck: [-2, 0, 0], head: [-14, 0, 9],
      uaL: [-92, 0, -2], faL: [-66, 0, 0], uaR: [-78, 0, 4], faR: [-74, 0, 0], shL: [0, 0, 6], shR: [0, 0, -6], mouth: 0.85, eyes: 0.35, brow: 0.9 }, 'back'],
    [1.05, { pos: [0, -0.015, 0], head: [-6, 0, 9] }], [1.3, { pos: [0, 0.015, 0], head: [-14, 0, 9] }],
    [1.9, { head: [-12, 0, 5], chest: [-10, 0, 0], eyes: 0.4, mouth: 0.7 }],
    [2.6, { ...HOLD, head: [8, 0, 0], eyes: 1, brow: 0.3, mouth: 0.4, shL: [0, 0, 0], shR: [0, 0, 0], neck: [0, 0, 0] }],
  ],
  events: [{ t: 0.75, name: 'show' }],
});

// =============================================================================== additive one-shots (relative to STAND)
add('nod', { duration: 0.6, keys: [[0, {}], [0.18, { head: [16, 0, 0], neck: [4, 0, 0] }], [0.36, { head: [-4, 0, 0], neck: [0, 0, 0] }], [0.6, { head: STAND.head }]] });
add('flinch', { duration: 0.5, keys: [[0, {}], [0.07, { chest: [-10, 0, 0], head: [-12, 0, 0], shL: [0, 0, 10], shR: [0, 0, -10], eyes: 0.2 }, 'snap'], [0.5, { chest: STAND.chest, head: STAND.head, shL: [0, 0, 0], shR: [0, 0, 0], eyes: 1 }]] });

export const CLIP_DEFS = C;
export { pose, offset, mirror };
