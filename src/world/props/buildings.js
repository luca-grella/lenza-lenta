// Buildings: shops on stilts, village houses, the three home tiers, the aquarium, lighthouse + keeper's
// house and the windmill. All drawn into a Builder in a local frame: origin = footprint centre on the
// ground (or deck), +z = front door side.
import * as THREE from 'three';
import { P, crate, barrel, lanternBox, planter, fishIcon, ropeCoil, netPile, woodpile, tableSet, hangingNet } from './common.js';

const triCache = new Map();
/** Triangular gable fill (width w, height h, thickness t), base at y=0, centred on z. */
function gableTri(w, h, t) {
  const k = `${w.toFixed(2)}_${h.toFixed(2)}_${t}`;
  if (!triCache.has(k)) {
    const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2);
    triCache.set(k, g);
  }
  return triCache.get(k);
}

/**
 * Gable roof, ridge along x. y = eave height, h = rise, w = length along the ridge, d = depth (z).
 * Shingle rows with slight colour alternation and tilt; ridge cap.
 */
export function gableRoof(B, w, d, y, h, c1, c2, { oh = 0.45, rows = 5, fill = P.wood, fillBack = true, fillFront = true, thick = 0.09 } = {}) {
  const half = d / 2 + oh;
  const ang = Math.atan2(h, d / 2);
  const run = half / Math.cos(ang);
  for (const side of [-1, 1]) {
    for (let r = 0; r < rows; r++) {
      const t0 = r / rows, t1 = (r + 1) / rows;
      const tm = (t0 + t1) / 2;
      // along the slab from the eave (t=0) to the ridge (t=1)
      const zz = side * (half - tm * half);
      const yy = y - oh * Math.tan(ang) + tm * (h + oh * Math.tan(ang));
      const len = run / rows * 1.22;
      B.box(w + oh * 2 + (r % 2 ? 0.04 : 0), thick, len, 0, yy + 0.02 * (rows - r), zz, r % 2 ? c1 : c2, { rx: side * ang, jitter: 0.04 });
    }
  }
  B.box(w + oh * 2 + 0.1, 0.16, 0.28, 0, y + h + 0.06, 0, c2, { round: 0.05 });
  // gable fill triangles
  if (fillFront) B.add(gableTri(d, h, 0.12), fill, { x: w / 2 - 0.02, y, z: 0, ry: Math.PI / 2 });
  if (fillBack) B.add(gableTri(d, h, 0.12), fill, { x: -w / 2 + 0.02, y, z: 0, ry: Math.PI / 2 });
}

/** Wall of vertical planks in the local XY plane at z, from x0..x1, y0..y1, skipping holes [{x0,x1,y0,y1}]. */
export function plankWall(B, x0, x1, y0, y1, z, colors, holes = [], ry = 0, plank = 0.3, thick = 0.1) {
  B.push(0, 0, 0, ry);
  const n = Math.max(1, Math.round((x1 - x0) / plank));
  const pw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * pw, xb = xa + pw, xm = (xa + xb) / 2;
    const col = colors[(i * 7 + Math.floor(xa * 3)) % colors.length];
    // split by holes overlapping this plank
    let segs = [[y0, y1]];
    for (const h of holes) {
      if (xb <= h.x0 + 0.02 || xa >= h.x1 - 0.02) continue;
      const out = [];
      for (const [a, b] of segs) { if (h.y0 > a) out.push([a, Math.min(b, h.y0)]); if (h.y1 < b) out.push([Math.max(a, h.y1), b]); }
      segs = out;
    }
    for (const [a, b] of segs) if (b - a > 0.02) B.box(pw - 0.03, b - a, thick, xm, (a + b) / 2, z, col, { jitter: 0.06 });
  }
  B.pop();
}

/** Window with frame, glowing glass and optional shutters/flower box. Local frame: on a wall facing +z at z. */
export function windowUnit(B, x, y, z, w = 0.8, h = 0.8, { shutters = P.trimTeal, frame = P.trimWhite, box = true, ry = 0, cross = true } = {}) {
  B.push(x, y, z, ry);
  B.box(w, h, 0.06, 0, 0, -0.02, P.window, { mat: 'glow' });
  B.box(w + 0.14, 0.09, 0.1, 0, h / 2 + 0.03, 0.02, frame);
  B.box(w + 0.18, 0.09, 0.16, 0, -h / 2 - 0.03, 0.04, frame);
  B.box(0.08, h, 0.1, -w / 2 - 0.03, 0, 0.02, frame);
  B.box(0.08, h, 0.1, w / 2 + 0.03, 0, 0.02, frame);
  if (cross) { B.box(0.05, h, 0.05, 0, 0, 0.02, frame); B.box(w, 0.05, 0.05, 0, 0, 0.02, frame); }
  if (shutters) for (const s of [-1, 1]) {
    B.box(w * 0.5, h + 0.06, 0.05, s * (w * 0.75 + 0.1), 0, 0.03, shutters, { ry: s * 0.25 });
    for (let k = -1; k <= 1; k++) B.box(w * 0.42, 0.03, 0.06, s * (w * 0.75 + 0.1), k * h * 0.28, 0.06, shutters, { ry: s * 0.25 });
  }
  if (box) planter(B, 0, -h / 2 - 0.12, 0.2, 0, w + 0.1, P.woodDark);
  B.pop();
}

/** Door with frame (faces +z). */
export function door(B, x, y, z, w = 0.9, h = 1.75, color = P.woodDark, frame = P.trimWhite) {
  B.push(x, y, z);
  B.box(w, h, 0.08, 0, h / 2, -0.03, color);
  for (let i = 0; i < 4; i++) B.box(w / 4 - 0.03, h - 0.1, 0.03, -w / 2 + w / 8 + i * w / 4, h / 2, 0.02, i % 2 ? color : P.woodDeep);
  B.box(w + 0.2, 0.12, 0.12, 0, h + 0.05, 0.02, frame);
  B.box(0.1, h, 0.12, -w / 2 - 0.05, h / 2, 0.02, frame);
  B.box(0.1, h, 0.12, w / 2 + 0.05, h / 2, 0.02, frame);
  B.sphere(0.04, w / 2 - 0.15, h * 0.5, 0.06, P.brass, { detail: 0 });
  B.pop();
}

/** Deck of planks (local rect), posts down to `postDepth` below. Registers the walkable surface. */
export function deckPlanks(B, w, d, y, { posts = true, postDepth = 3, color = P.wood, color2 = P.woodLight, along = 'x', rail = null, step = 1.8, surface = true } = {}) {
  const n = Math.max(1, Math.round((along === 'x' ? d : w) / 0.34));
  for (let i = 0; i < n; i++) {
    const t = -0.5 + (i + 0.5) / n;
    const c = i % 3 === 0 ? color2 : i % 3 === 1 ? color : P.woodGrey;
    if (along === 'x') B.box(w + (i % 2 ? 0.06 : -0.04), 0.1, d / n - 0.04, 0, y - 0.05, t * d, c, { ry: (B.R() - 0.5) * 0.02 });
    else B.box(w / n - 0.04, 0.1, d + (i % 2 ? 0.06 : -0.04), t * w, y - 0.05, 0, c, { ry: (B.R() - 0.5) * 0.02 });
  }
  // stringers under the planks
  for (const s of [-1, 1]) {
    if (along === 'x') B.box(w, 0.16, 0.14, 0, y - 0.18, s * (d / 2 - 0.15), P.woodDark);
    else B.box(0.14, 0.16, d, s * (w / 2 - 0.15), y - 0.18, 0, P.woodDark);
  }
  if (posts) {
    const nx = Math.max(1, Math.round(w / step)), nz = Math.max(1, Math.round(d / step));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      if (i !== 0 && i !== nx && j !== 0 && j !== nz) continue;
      const x = -w / 2 + 0.12 + (w - 0.24) * i / nx, z = -d / 2 + 0.12 + (d - 0.24) * j / nz;
      const top = y - 0.05;
      B.cyl(0.13, 0.15, top + postDepth, x, (top - postDepth) / 2, z, (i + j) % 2 ? P.woodDark : P.woodDeep, { seg: 7 });
    }
  }
  if (rail) {
    for (const [side, len, axis, off = 0] of rail) {   // [side, length, axis, offset along the axis]
      const n2 = Math.max(1, Math.round(len / 1.4));
      for (let i = 0; i <= n2; i++) {
        const t = off - len / 2 + len * i / n2;
        const px = axis === 'x' ? t : side, pz = axis === 'x' ? side : t;
        B.box(0.1, 0.9, 0.1, px, y + 0.45, pz, P.woodDark);
      }
      if (axis === 'x') B.box(len, 0.08, 0.1, off, y + 0.88, side, P.woodLight); else B.box(0.1, 0.08, len, side, y + 0.88, off, P.woodLight);
      if (axis === 'x') B.box(len, 0.06, 0.06, off, y + 0.5, side, P.wood); else B.box(0.06, 0.06, len, side, y + 0.5, off, P.wood);
      // rails are colliders for walkers
      if (axis === 'x') B.rect(off, side, len / 2, 0.08, 0, 'rail'); else B.rect(side, off, 0.08, len / 2, 0, 'rail');
    }
  }
  if (surface) B.deck(0, 0, w / 2, d / 2, y);
}

// ------------------------------------------------------------------ shop on stilts
const SIGN = {
  bottega: (B) => { // rod + bobber
    B.box(0.06, 1.0, 0.06, -0.1, 0, 0.1, P.woodDeep, { rz: 0.7 });
    B.sphere(0.12, 0.25, -0.25, 0.1, P.clothRed, { detail: 1 }); B.sphere(0.12, 0.25, -0.16, 0.1, P.trimWhite, { detail: 1, sy: 0.5 });
  },
  pescheria: (B) => fishIcon(B, 0, 0, 0.1, 1.2, P.fish),
  falegname: (B) => { B.box(0.7, 0.14, 0.06, 0, 0.12, 0.1, P.metalLight, { rz: 0.15 }); B.box(0.18, 0.3, 0.07, 0.36, 0.0, 0.1, P.woodDark, { rz: 0.15 }); B.box(0.08, 0.5, 0.06, -0.1, -0.15, 0.12, P.woodDark, { rz: -0.6 }); B.box(0.3, 0.12, 0.08, 0.05, 0.08, 0.13, P.metal, { rz: -0.6 }); },
  trattoria: (B) => { B.cyl(0.26, 0.22, 0.32, 0, -0.08, 0.12, P.metal, { seg: 10 }); B.box(0.62, 0.05, 0.06, 0, 0.1, 0.12, P.metal); B.sphere(0.1, -0.08, 0.25, 0.12, 0xffffff, { detail: 0 }); B.sphere(0.08, 0.08, 0.36, 0.12, 0xffffff, { detail: 0 }); },
  aquarium: (B) => { B.sphere(0.32, 0, 0, 0.12, 0xbfeaf2, { detail: 1, sz: 0.4 }); fishIcon(B, 0, 0, 0.26, 0.5, P.fishOrange); },
};

/**
 * Hut on a deck (optionally on stilts over water). Returns {front: local point for the shopkeeper}.
 * @param {string} kind sign kind
 */
export function stiltHut(B, kind, { wall = [P.woodLight, P.wood, P.woodGrey], roof = [P.roofRed, P.roofRedDark], deckY = 1.55, stilts = true, w = 4.4, d = 3.8, wallH = 2.5 } = {}) {
  const dw = w + 2.6, dd = d + 3.0;
  // deck (extends more to the front for the counter)
  B.push(0, 0, 0.5);
  // the back rail only runs behind the hut: the back corners stay open for a ramp from the land
  deckPlanks(B, dw, dd, deckY, { postDepth: stilts ? 3.5 : 1.2, rail: [[-dd / 2 + 0.05, w, 'x']], along: 'x' });
  B.pop();
  B.rect(0, 0.5, dw / 2, dd / 2, 0, 'deck').colliders[B.colliders.length - 1].layer = 'boat';
  // hut body
  B.push(0, deckY, -0.4);
  const hw = w / 2, hd = d / 2;
  const doorHole = { x0: -0.55, x1: 0.55, y0: 0, y1: 1.9 };
  const winL = { x0: -hw + 0.45, x1: -hw + 1.35, y0: 0.95, y1: 1.75 }, winR = { x0: hw - 1.35, x1: hw - 0.45, y0: 0.95, y1: 1.75 };
  plankWall(B, -hw, hw, 0, wallH, hd, wall, [doorHole, winL, winR]);
  plankWall(B, -hw, hw, 0, wallH, -hd, wall, [{ x0: -0.5, x1: 0.5, y0: 1.0, y1: 1.7 }]);
  plankWall(B, -hd, hd, 0, wallH, hw, wall, [{ x0: -0.45, x1: 0.45, y0: 1.0, y1: 1.7 }], Math.PI / 2);
  plankWall(B, -hd, hd, 0, wallH, -hw, wall, [], Math.PI / 2);
  // corner posts + top beam
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.22, wallH + 0.1, 0.22, sx * hw, wallH / 2, sz * hd, P.woodDark, { round: 0.04 });
  B.box(w + 0.3, 0.18, 0.2, 0, wallH, hd, P.woodDark); B.box(w + 0.3, 0.18, 0.2, 0, wallH, -hd, P.woodDark);
  // interior darkness behind openings
  B.box(w - 0.3, wallH - 0.1, 0.05, 0, wallH / 2, -hd + 0.12, 0x3a2a20);
  B.box(1.2, 1.95, 0.05, 0, 0.98, hd - 0.4, 0x2e2018);
  // windows: glowing glass, frames, shutters; side window
  windowUnit(B, (winL.x0 + winL.x1) / 2, 1.35, hd + 0.02, 0.86, 0.76, { shutters: P.trimTeal, box: true });
  windowUnit(B, (winR.x0 + winR.x1) / 2, 1.35, hd + 0.02, 0.86, 0.76, { shutters: P.trimTeal, box: true });
  B.push(hw + 0.02, 0, 0, Math.PI / 2); windowUnit(B, 0, 1.35, 0, 0.86, 0.66, { shutters: null, box: false }); B.pop();
  // door frame (open doorway with a curtain)
  B.box(0.12, 2.0, 0.14, -0.6, 1.0, hd + 0.04, P.trimWhite); B.box(0.12, 2.0, 0.14, 0.6, 1.0, hd + 0.04, P.trimWhite); B.box(1.35, 0.14, 0.14, 0, 1.98, hd + 0.04, P.trimWhite);
  for (let i = 0; i < 4; i++) B.box(0.26, 0.5, 0.03, -0.39 + i * 0.26, 1.66, hd + 0.0, i % 2 ? P.clothRed : P.cloth);
  // roof
  gableRoof(B, w, d, wallH + 0.05, 1.45, roof[0], roof[1], { oh: 0.55, rows: 5, fill: wall[1] });
  // awning over the counter
  B.push(0, 0, hd + 0.05);
  for (let i = 0; i < 7; i++) B.box(0.5, 0.05, 1.3, -1.5 + i * 0.5, 2.1, 0.55, i % 2 ? P.trimWhite : roof[0], { rx: 0.32, jitter: 0.02 });
  for (const s of [-1, 1]) B.box(0.08, 2.0, 0.08, s * 1.7, 1.0, 1.15, P.woodDark);
  B.pop();
  // counter in front of the door
  B.box(2.2, 0.95, 0.5, 0, 0.47, hd + 1.0, P.wood, { round: 0.03 });
  B.box(2.35, 0.08, 0.62, 0, 0.98, hd + 1.0, P.woodLight, { round: 0.03 });
  // sign board above the awning
  B.push(0, wallH + 0.95, hd + 0.35);
  B.box(1.5, 0.75, 0.08, 0, 0, 0, P.woodLight, { round: 0.04 });
  B.box(1.62, 0.87, 0.06, 0, 0, -0.04, P.woodDark, { round: 0.03 });
  SIGN[kind]?.(B);
  B.pop();
  // lantern by the door
  B.push(1.05, 0, hd + 0.12); B.box(0.36, 0.05, 0.05, 0, 2.15, 0.15, P.woodDark); lanternBox(B, 0, 1.6, 0.3, 0.9); B.glow(0, 1.75, 0.3, 0xffb860, 1, 'lantern'); B.pop();
  B.rect(0, 0, hw + 0.15, hd + 0.15, 0, 'hut');
  B.rect(0, hd + 1.0, 1.15, 0.3, 0, 'counter');
  B.pop();
  // little props on the deck
  const R = B.R;
  // (against the hut front beside the counter: the side walkways, the corners and the front edge stay free for the
  // ramps and for walking round to the counter)
  crate(B, -1.75, deckY, hd - 0.4 + 0.42, 0.85, R());
  barrel(B, 1.72, deckY, hd - 0.4 + 0.4, 0.9);
  if (kind === 'pescheria') { netPile(B, 2.95, deckY, dd / 2 + 0.05, 0.8); crate(B, -2.95, deckY, dd / 2 + 0.05, 0.75, 0.4, P.woodGrey); for (let i = 0; i < 3; i++) fishIcon(B, -0.6 + i * 0.6, deckY + 1.08, d / 2 + 0.6, 0.55, [P.fish, P.fishOrange, 0xb8c8d8][i]); }
  if (kind === 'bottega') { ropeCoil(B, dw / 2 - 0.7, deckY, dd / 2 - 0.5); for (let i = 0; i < 4; i++) B.cyl(0.1, 0.1, 0.22, -0.7 + i * 0.45, deckY + 1.13, d / 2 + 0.6, [0x9ad0e0, 0xf2d68e, 0xd0a0e0, 0xa0e0a0][i], { seg: 8 }); }
  return { front: new THREE.Vector3(0, deckY, -0.4 + hd + 1.65), deckY };
}

// ------------------------------------------------------------------ village house
const HOUSE_STYLES = [
  { wall: P.wallCream, roof: [P.roofRed, P.roofRedDark], trim: P.trimTeal, timber: P.woodDark },
  { wall: P.wallBlue, roof: [P.roofBrown, P.roofBrownDark], trim: P.trimWhite, timber: P.woodDark },
  { wall: P.wallYellow, roof: [P.roofRed, P.roofRedDark], trim: P.trimGreen, timber: P.woodDeep },
  { wall: P.wallPink, roof: [P.roofTeal, 0x2f706c], trim: P.trimWhite, timber: P.woodDark },
];
/** Cozy plaster house with timber corners, gable roof, chimney, windows. Returns the door front point (local). */
export function house(B, style = 0, { w = 4.6, d = 4.0, h = 2.7 } = {}) {
  const S = HOUSE_STYLES[style % HOUSE_STYLES.length];
  const hw = w / 2, hd = d / 2;
  // stone foundation
  B.box(w + 0.3, 0.45, d + 0.3, 0, 0.12, 0, P.stone, { round: 0.06 });
  for (let i = 0; i < 9; i++) B.box(0.5, 0.2, 0.08, -hw + 0.3 + i * (w - 0.4) / 8, 0.22, hd + 0.17, i % 2 ? P.stoneDark : P.stoneWarm, { round: 0.04 });
  // walls
  B.box(w, h, d, 0, 0.35 + h / 2, 0, S.wall, { round: 0.04 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.2, h + 0.05, 0.2, sx * hw, 0.35 + h / 2, sz * hd, S.timber, { round: 0.03 });
  B.box(w + 0.1, 0.16, 0.16, 0, 0.35 + h, hd + 0.02, S.timber); B.box(w + 0.1, 0.16, 0.16, 0, 0.35 + h, -hd - 0.02, S.timber);
  door(B, -0.6, 0.35, hd + 0.02, 0.95, 1.85, P.woodDark, S.trim === P.trimWhite ? P.woodLight : S.trim);
  windowUnit(B, 1.15, 0.35 + 1.45, hd + 0.03, 0.85, 0.8, { shutters: S.trim, box: true });
  B.push(hw + 0.02, 0.35, 0, Math.PI / 2); windowUnit(B, 0, 1.45, 0, 0.8, 0.75, { shutters: S.trim, box: false }); B.pop();
  B.push(-hw - 0.02, 0.35, 0, -Math.PI / 2); windowUnit(B, 0, 1.45, 0, 0.8, 0.75, { shutters: S.trim, box: true }); B.pop();
  // steps
  B.box(1.3, 0.18, 0.5, -0.6, 0.09, hd + 0.4, P.stone, { round: 0.04 });
  // small door canopy
  B.box(1.5, 0.08, 0.7, -0.6, 0.35 + 2.15, hd + 0.35, S.roof[0], { rx: 0.25 });
  // roof
  gableRoof(B, w, d, 0.35 + h + 0.02, 1.6, S.roof[0], S.roof[1], { oh: 0.5, rows: 6, fill: S.wall });
  // round attic window
  B.cyl(0.26, 0.26, 0.06, hw + 0.08, 0.35 + h + 0.55, 0, P.window, { mat: 'glow', seg: 12, rz: Math.PI / 2 });
  B.torus(0.27, 0.05, hw + 0.1, 0.35 + h + 0.55, 0, S.trim, { ry: Math.PI / 2 });
  // chimney
  B.box(0.55, 1.6, 0.55, -hw + 0.8, 0.35 + h + 1.0, -0.5, P.stone, { round: 0.05 });
  B.box(0.68, 0.14, 0.68, -hw + 0.8, 0.35 + h + 1.85, -0.5, P.stoneDark, { round: 0.04 });
  B.glow(1.15, 0.35 + 1.45, hd + 0.4, 0xffc070, 0.8, 'window');
  B.rect(0, 0, hw + 0.2, hd + 0.2, 0, 'house');
  return new THREE.Vector3(-0.6, 0, hd + 1.0);
}

// ------------------------------------------------------------------ home tiers
/** Tier 0: canvas A-frame tent with bedroll, crate and lantern. Returns {bed, door}. */
export function homeTent(B) {
  const w = 2.8, d = 3.0, h = 2.0;
  const ang = Math.atan2(h, w / 2), sl = Math.hypot(h, w / 2);
  for (const s of [-1, 1]) {
    B.box(0.06, sl, d, s * w / 4, h / 2, 0, P.cloth, { rz: s * (Math.PI / 2 - ang), round: 0.02 });
    // trim stripe along the bottom edge
    B.box(0.075, 0.2, d + 0.02, s * (w / 2 - 0.08), 0.15, 0, P.clothRed, { rz: s * (Math.PI / 2 - ang) });
  }
  B.add(gableTri(w, h, 0.05), P.cloth, { z: -d / 2, y: 0 });
  // front flaps tied open
  B.add(gableTri(w * 0.48, h * 0.95, 0.05), 0xe8d8b0, { z: d / 2 + 0.05, x: -w * 0.36, y: 0, ry: 0.5 });
  B.add(gableTri(w * 0.48, h * 0.95, 0.05), 0xe8d8b0, { z: d / 2 + 0.05, x: w * 0.36, y: 0, ry: -0.5 });
  B.cyl(0.05, 0.05, h + 0.3, 0, (h + 0.3) / 2, d / 2 + 0.05, P.woodDark, { seg: 5 });
  B.cyl(0.05, 0.05, h + 0.3, 0, (h + 0.3) / 2, -d / 2 - 0.05, P.woodDark, { seg: 5 });
  B.cyl(0.04, 0.04, d + 0.4, 0, h + 0.05, 0, P.woodDark, { seg: 5, rx: Math.PI / 2 });
  // ropes + pegs
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { B.beam(new THREE.Vector3(0, h + 0.1, sz * (d / 2 + 0.05)), new THREE.Vector3(sx * 1.2, 0.05, sz * (d / 2 + 0.9)), 0.012, P.rope); B.cyl(0.03, 0.02, 0.25, sx * 1.2, 0.05, sz * (d / 2 + 0.9), P.woodDark, { seg: 4 }); }
  // inside: dark floor + bedroll + pillow
  B.box(w - 0.3, 0.03, d - 0.1, 0, 0.02, 0, 0x7a6448);
  B.cyl(0.22, 0.22, 1.7, 0.45, 0.2, -0.1, 0x5a8ab8, { seg: 10, rx: Math.PI / 2 });
  B.box(0.75, 0.12, 1.8, -0.4, 0.08, -0.1, 0xd85a4a, { round: 0.05 });
  B.box(0.5, 0.14, 0.32, -0.4, 0.18, -0.8, 0xf6f0e4, { round: 0.06 });
  crate(B, 1.7, 0, 1.2, 0.8, 0.3);
  B.push(1.7, 0.48, 1.2); lanternBox(B, 0, 0, 0, 0.9); B.pop();
  B.glow(1.7, 0.7, 1.2, 0xffb860, 0.9, 'lantern');
  B.rect(0, 0, w / 2 + 0.1, d / 2, 0, 'home');
  return { bed: new THREE.Vector3(-0.4, 0.15, -0.1), door: new THREE.Vector3(0, 0, d / 2 + 0.9) };
}

/** Tier 1: log cabin with porch. */
export function homeCabin(B) {
  const w = 5.0, d = 4.4, h = 2.6;
  const hw = w / 2, hd = d / 2;
  B.box(w + 0.4, 0.35, d + 0.4, 0, 0.1, 0, P.stone, { round: 0.05 });
  // log walls: stacked horizontal logs with protruding corners
  const logs = 8, lr = h / logs / 2;
  for (let i = 0; i < logs; i++) {
    const y = 0.3 + lr + i * lr * 2;
    const c = i % 2 ? P.wood : P.woodLight;
    // front wall with door/window gaps
    const frontSegs = y < 0.3 + 1.95 ? (y > 1.1 && y < 2.0 ? [[-hw - 0.25, -1.55], [-0.5, 0.45], [1.75, hw + 0.25]] : [[-hw - 0.25, -1.55], [-0.5, hw + 0.25]]) : [[-hw - 0.25, hw + 0.25]];
    for (const [a, b] of frontSegs) B.cyl(lr, lr, b - a, (a + b) / 2, y, hd, c, { seg: 7, rz: Math.PI / 2 });
    B.cyl(lr, lr, w + 0.5, 0, y, -hd, c, { seg: 7, rz: Math.PI / 2 });
    const sideSegs = y > 1.1 && y < 2.0 ? [[-hd - 0.25, -0.45], [0.45, hd + 0.25]] : [[-hd - 0.25, hd + 0.25]];
    for (const sx of [-1, 1]) for (const [a, b] of sideSegs) B.cyl(lr, lr, b - a, sx * hw, y + lr, (a + b) / 2, i % 2 ? P.woodLight : P.wood, { seg: 7, rx: Math.PI / 2 });
  }
  // dark interior + door + windows
  B.box(w - 0.4, h, d - 0.4, 0, 0.3 + h / 2, 0, 0x3a2a1e);
  door(B, -1.0, 0.3, hd + 0.05, 0.95, 1.8, P.woodDeep, P.woodDark);
  windowUnit(B, 1.1, 1.55, hd + 0.12, 0.95, 0.8, { shutters: P.roofRed, frame: P.woodDark, box: true });
  for (const sx of [-1, 1]) { B.push(sx * (hw + 0.1), 1.55, 0, sx * Math.PI / 2); windowUnit(B, 0, 0, 0, 0.8, 0.75, { shutters: null, frame: P.woodDark, box: sx > 0 }); B.pop(); }
  B.glow(1.1, 1.55, hd + 0.6, 0xffc070, 1, 'window');
  // roof
  gableRoof(B, w, d, 0.3 + h, 1.7, P.roofBrown, P.roofBrownDark, { oh: 0.6, rows: 6, fill: P.wood });
  // porch
  B.push(0, 0, hd + 1.15);
  // [Fix] the front rail leaves a gap at the door, with a real step down to the path (the porch was 0.7 m up)
  { const W2 = w + 0.6, a = -W2 / 2, g0 = -1.6, g1 = -0.2;
    deckPlanks(B, W2, 1.9, 0.5, { posts: true, postDepth: 0.4, rail: [[0.92, g0 - a, 'x', (a + g0) / 2], [0.92, W2 / 2 - g1, 'x', (g1 + W2 / 2) / 2]], step: 2.6, color: P.woodLight, color2: P.wood }); }
  for (const sx of [-1, 1]) B.box(0.16, 2.3, 0.16, sx * (hw + 0.1), 1.6, 0.85, P.woodDark);
  for (let i = 0; i < 7; i++) B.box(w + 1.1, 0.06, 0.38, 0, 2.75 - i * 0.02 + 0.05, -0.75 + i * 0.32, i % 2 ? P.roofBrown : P.roofBrownDark, { rx: 0.18 });
  B.box(1.3, 0.5, 0.5, -0.9, 0.0, 1.22, P.wood, { round: 0.04 }); // step (top 0.25)
  B.deck(-0.9, 1.22, 0.65, 0.27, 0.25, 0, 'step');
  B.pop();
  // chimney + firewood
  B.box(0.7, 2.6, 0.7, -hw - 0.15, 1.6, -0.6, P.stone, { round: 0.06 });
  B.box(0.8, 0.14, 0.8, -hw - 0.15, 2.95, -0.6, P.stoneDark, { round: 0.04 });
  woodpile(B, hw + 0.8, 0, -0.6, Math.PI / 2);
  barrel(B, hw + 0.5, 0, hd + 0.4, 0.9);
  B.rect(0, 0, hw + 0.4, hd + 0.3, 0, 'home');
  B.deck(0, hd + 1.15, (w + 0.6) / 2, 0.95, 0.5, 0, 'porch');
  return { bed: new THREE.Vector3(1.2, 0.75, -1.2), door: new THREE.Vector3(-1.0, 0.5, hd + 1.4) };
}

/** Tier 2: cottage with dormer, teal shutters, flower boxes, porch and a little garden fence. */
export function homeCottage(B) {
  const w = 6.6, d = 5.2, h = 3.0;
  const hw = w / 2, hd = d / 2;
  B.box(w + 0.4, 0.45, d + 0.4, 0, 0.15, 0, P.stoneWarm, { round: 0.06 });
  B.box(w, h, d, 0, 0.4 + h / 2, 0, P.wallCream, { round: 0.05 });
  // timber frame details
  for (const sx of [-1, -0.33, 0.33, 1]) B.box(0.18, h, 0.12, sx * hw, 0.4 + h / 2, hd + 0.02, P.woodDark);
  B.box(w + 0.1, 0.16, 0.14, 0, 0.4 + h, hd + 0.04, P.woodDark);
  B.box(w + 0.1, 0.12, 0.12, 0, 0.4 + 1.0, hd + 0.04, P.woodDark);
  door(B, 0, 0.4, hd + 0.04, 1.05, 2.0, P.trimTeal, P.trimWhite);
  windowUnit(B, -1.95, 0.4 + 1.75, hd + 0.06, 0.95, 0.95, { shutters: P.trimTeal, box: true });
  windowUnit(B, 1.95, 0.4 + 1.75, hd + 0.06, 0.95, 0.95, { shutters: P.trimTeal, box: true });
  for (const sx of [-1, 1]) { B.push(sx * (hw + 0.03), 0.4, 0, sx * Math.PI / 2); windowUnit(B, -1, 1.75, 0, 0.85, 0.85, { shutters: P.trimTeal, box: true }); windowUnit(B, 1, 1.75, 0, 0.85, 0.85, { shutters: P.trimTeal, box: false }); B.pop(); }
  B.glow(-1.95, 2.1, hd + 0.5, 0xffc070, 1, 'window'); B.glow(1.95, 2.1, hd + 0.5, 0xffc070, 1, 'window');
  gableRoof(B, w, d, 0.4 + h + 0.02, 2.1, P.roofRed, P.roofRedDark, { oh: 0.6, rows: 7, fill: P.wallCream });
  // dormer
  B.push(0, 0.4 + h + 0.55, hd - 0.35);
  B.box(1.5, 1.2, 1.3, 0, 0.45, 0, P.wallCream, { round: 0.04 });
  windowUnit(B, 0, 0.5, 0.66, 0.7, 0.7, { shutters: null, box: false });
  gableRoof(B, 1.3, 1.5, 1.05, 0.65, P.roofRed, P.roofRedDark, { oh: 0.2, rows: 3, fill: P.wallCream });
  B.pop();
  // porch with roof
  B.push(0, 0, hd + 1.3);
  { const W2 = w + 0.8, g = 0.75;   // [Fix] gap in the front rail at the door + a real step (the porch was 0.7 m up)
    deckPlanks(B, W2, 2.2, 0.55, { posts: true, postDepth: 0.45, rail: [[1.05, W2 / 2 - g, 'x', -(W2 / 2 + g) / 2], [1.05, W2 / 2 - g, 'x', (W2 / 2 + g) / 2]], step: 2.4 }); }
  for (const sx of [-1, 0, 1]) if (sx) B.box(0.18, 2.6, 0.18, sx * (hw + 0.2), 1.85, 0.95, P.trimWhite);
  for (let i = 0; i < 7; i++) B.box(w + 1.3, 0.06, 0.4, 0, 3.15 - i * 0.03, -0.85 + i * 0.32, i % 2 ? P.roofRed : P.roofRedDark, { rx: 0.15 });
  B.box(1.4, 0.56, 0.5, 0, 0.0, 1.36, P.woodLight, { round: 0.04 });   // step (top 0.28)
  B.deck(0, 1.36, 0.7, 0.27, 0.28, 0, 'step');
  planter(B, -2.6, 0.55, 0.85, 0, 1.0); planter(B, 2.6, 0.55, 0.85, 0, 1.0);
  B.pop();
  // chimney
  B.box(0.75, 3.2, 0.75, hw - 1.0, 0.4 + h + 1.2, -1.0, P.stoneWarm, { round: 0.06 });
  B.box(0.85, 0.16, 0.85, hw - 1.0, 0.4 + h + 2.8, -1.0, P.stoneDark, { round: 0.04 });
  woodpile(B, -hw - 0.8, 0, -1.0, Math.PI / 2);
  B.rect(0, 0, hw + 0.4, hd + 0.3, 0, 'home');
  B.deck(0, hd + 1.3, (w + 0.8) / 2, 1.1, 0.55, 0, 'porch');
  return { bed: new THREE.Vector3(1.8, 0.95, -1.5), door: new THREE.Vector3(0, 0.55, hd + 1.8) };
}

// ------------------------------------------------------------------ aquarium
/** Aquarium hall with a glass front and three glowing tanks. Returns tank boxes (local). */
export function aquarium(B) {
  const w = 9, d = 6, h = 3.4;
  const hw = w / 2, hd = d / 2;
  B.box(w + 0.6, 0.4, d + 0.6, 0, 0.12, 0, P.stone, { round: 0.06 });
  B.box(w, h, 0.3, 0, 0.35 + h / 2, -hd, P.wallWhite);
  for (const sx of [-1, 1]) B.box(0.3, h, d, sx * hw, 0.35 + h / 2, 0, P.wallWhite);
  // glass front with mullions
  B.box(w - 0.3, h - 0.3, 0.06, 0, 0.35 + h / 2, hd, 0xbfeaf2, { mat: 'glass' });
  for (let i = 0; i <= 6; i++) B.box(0.12, h, 0.14, -hw + i * w / 6, 0.35 + h / 2, hd, P.trimTeal);
  B.box(w + 0.1, 0.18, 0.2, 0, 0.35 + h, hd, P.trimTeal); B.box(w + 0.1, 0.18, 0.2, 0, 0.45, hd, P.trimTeal);
  // floor inside
  B.box(w - 0.4, 0.05, d - 0.4, 0, 0.38, 0, 0xd8cfc0);
  // curved roof (half barrel) in teal metal
  const roofG = B.geo('aqRoof', () => new THREE.CylinderGeometry(hd + 0.5, hd + 0.5, w + 0.6, 16, 1, false, 0, Math.PI));
  B.add(roofG, P.roofTeal, { x: 0, y: 0.35 + h - 0.05, z: 0, rz: Math.PI / 2, sx: 0.5 });
  const ribG = B.geo('aqRib', () => new THREE.TorusGeometry(hd + 0.52, 0.07, 5, 16, Math.PI));
  for (let i = 0; i < 6; i++) B.add(ribG, P.trimWhite, { x: -hw + 0.4 + i * (w - 0.8) / 5, y: 0.35 + h - 0.05, z: 0, ry: Math.PI / 2, sy: 0.5 });
  // gable-end walls closing the barrel roof
  for (const sx of [-1, 1]) B.add(B.geo('aqEnd', () => new THREE.CircleGeometry(hd + 0.2, 16, 0, Math.PI)), P.wallWhite, { x: sx * (hw - 0.02), y: 0.35 + h - 0.05, z: 0, ry: sx * Math.PI / 2, sy: 0.5 });
  // tanks
  const tanks = [];
  const tw = 2.5, th = 1.6, tdp = 1.3;
  for (let i = 0; i < 3; i++) {
    const x = -3 + i * 3, z = -hd + 1.2, y = 0.4 + 0.6 + th / 2;
    B.box(tw + 0.2, 0.6, tdp + 0.2, x, 0.7, z, P.woodDark, { round: 0.04 });
    B.box(tw, th, tdp, x, y, z, 0x5fd2dc, { mat: 'tank' });
    B.box(tw - 0.1, 0.2, tdp - 0.1, x, 1.1, z, P.sand);
    for (let k = 0; k < 3; k++) B.cone(0.1, 0.6 + k * 0.15, x - 0.8 + k * 0.7, 1.45 + k * 0.05, z - 0.3, 0x3a9a4a, { seg: 4 });
    B.box(tw + 0.2, 0.1, tdp + 0.2, x, y + th / 2 + 0.05, z, P.metal);
    tanks.push({ x, y, z, w: tw - 0.15, h: th - 0.3, d: tdp - 0.15 });
  }
  // entrance doors + steps + sign
  B.box(2.2, 0.2, 1.0, 0, 0.1, hd + 0.6, P.stone, { round: 0.04 });
  B.push(0, 0.35 + h + 0.55, hd + 0.3);
  B.box(2.6, 0.9, 0.12, 0, 0, 0, P.wallWhite, { round: 0.05 });
  B.box(2.8, 1.05, 0.08, 0, 0, -0.05, P.trimTeal, { round: 0.05 });
  fishIcon(B, -0.6, 0, 0.1, 0.9, P.fishOrange); fishIcon(B, 0.55, 0.05, 0.1, 0.7, P.trimTeal);
  B.pop();
  // planters + lanterns
  planter(B, -3.4, 0.35, hd + 0.5, 0, 1.6); planter(B, 3.4, 0.35, hd + 0.5, 0, 1.6);
  B.glow(0, 2, hd - 1, 0x7fe6ff, 0.9, 'tank');
  B.rect(0, 0, hw + 0.3, hd + 0.3, 0, 'aquarium');
  return { tanks, door: new THREE.Vector3(0, 0, hd + 1.4) };
}

// ------------------------------------------------------------------ lighthouse
/** Lighthouse tower + keeper's house. Returns {top (gallery point), lamp (local), door}. */
export function lighthouse(B) {
  const H = 11;
  // rocky base
  B.cyl(2.6, 3.1, 0.9, 0, 0.3, 0, P.stone, { seg: 12 });
  // banded tapered tower
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = 0.7 + i * (H / bands), y1 = y0 + H / bands;
    const r0 = 1.75 - i * 0.12, r1 = 1.75 - (i + 1) * 0.12;
    B.cyl(r1, r0, H / bands + 0.01, 0, (y0 + y1) / 2, 0, i % 2 ? P.trimRed : P.wallWhite, { seg: 16 });
  }
  // windows + door
  door(B, 0, 0.75, 1.72, 0.9, 1.8, P.woodDark, P.stoneDark);
  for (let i = 1; i < 5; i++) { const y = 0.7 + i * 2.2, a = i * 1.3, r = 1.72 - i * 0.26; B.box(0.36, 0.55, 0.1, Math.sin(a) * r, y, Math.cos(a) * r, P.window, { mat: 'glow', ry: a }); }
  // gallery
  const gy = 0.7 + H;
  B.cyl(1.55, 1.15, 0.3, 0, gy, 0, P.stoneDark, { seg: 16 });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; B.box(0.06, 0.8, 0.06, Math.cos(a) * 1.45, gy + 0.55, Math.sin(a) * 1.45, P.metal); }
  B.torus(1.45, 0.045, 0, gy + 0.95, 0, P.metal, { rx: Math.PI / 2 });
  // lantern room
  B.cyl(0.95, 0.95, 1.4, 0, gy + 0.85, 0, P.window, { mat: 'lamp', seg: 12 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; B.box(0.07, 1.4, 0.07, Math.cos(a) * 0.97, gy + 0.85, Math.sin(a) * 0.97, P.metal); }
  B.cone(1.15, 0.9, 0, gy + 2.0, 0, P.trimRed, { seg: 12 });
  B.sphere(0.14, 0, gy + 2.5, 0, P.metal, { detail: 0 });
  B.cyl(0.03, 0.03, 0.6, 0, gy + 2.8, 0, P.metal, { seg: 4 });
  B.circle(0, 0, 2.2, 'lighthouse');
  return { top: new THREE.Vector3(1.2, gy + 0.15, 0), lamp: new THREE.Vector3(0, gy + 0.85, 0), door: new THREE.Vector3(0, 0.7, 2.6), galleryY: gy };
}

// ------------------------------------------------------------------ windmill
/** Windmill tower (sails are dynamic: returns the hub position in local space). */
export function windmill(B) {
  const H = 6.5;
  B.cyl(2.0, 2.2, 0.5, 0, 0.2, 0, P.stone, { seg: 8 });
  B.cyl(1.35, 1.9, H, 0, 0.4 + H / 2, 0, P.wallWhite, { seg: 8 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; B.box(0.08, H, 0.08, Math.cos(a) * 1.65, 0.4 + H / 2, Math.sin(a) * 1.65, P.woodDark, { rz: Math.cos(a) * 0.08, rx: -Math.sin(a) * 0.08 }); }
  B.cone(1.75, 2.0, 0, 0.4 + H + 0.95, 0, P.roofBrown, { seg: 8, ry: Math.PI / 8 });
  door(B, 0, 0.45, 1.82, 0.85, 1.7, P.woodDark, P.woodDark);
  windowUnit(B, 0, 4.0, 1.55, 0.55, 0.65, { shutters: P.trimRed, box: false, cross: true });
  B.glow(0, 4.0, 2.0, 0xffc070, 0.6, 'window');
  // hub housing
  B.box(0.7, 0.7, 1.2, 0, 0.4 + H + 0.2, 1.4, P.woodDark, { round: 0.06 });
  // sacks and a cart
  for (let i = 0; i < 3; i++) B.sphere(0.32, 1.7 + i * 0.5, 0.3, 1.6 - i * 0.2, 0xe8dcbc, { sy: 1.1, detail: 1 });
  B.circle(0, 0, 2.1, 'windmill');
  return { hub: new THREE.Vector3(0, 0.4 + H + 0.2, 2.05), door: new THREE.Vector3(0, 0, 2.8) };
}

/** Windmill sails as a separate rotating group (vertex-coloured, merged). */
export function windmillSails(material) {
  const B2 = { parts: [] };
  const geos = [];
  const add = (g, c) => { if (g.index) g = g.toNonIndexed(); const col = new Float32Array(g.attributes.position.count * 3); const cc = new THREE.Color(c); for (let i = 0; i < col.length; i += 3) { col[i] = cc.r; col[i + 1] = cc.g; col[i + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); geos.push(g); };
  add(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 10).rotateX(Math.PI / 2), P.woodDark);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const arm = new THREE.BoxGeometry(0.16, 5.2, 0.1).translate(0, 2.7, 0).rotateZ(a);
    add(arm, P.woodDark);
    for (let k = 0; k < 6; k++) {
      const slat = new THREE.BoxGeometry(1.15, 0.05, 0.04).translate(0.62, 1.0 + k * 0.75, 0.05).rotateZ(a);
      add(slat, P.woodLight);
    }
    const sail = new THREE.BoxGeometry(1.05, 3.9, 0.02).translate(0.62, 2.9, 0.08).rotateZ(a);
    add(sail, P.cloth);
  }
  return geos;
}

export { gableTri };
