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

// @@MORE@@
export const CLIP_DEFS = C;
export { pose, offset, mirror };
