// Palette + small reusable props (crates, barrels, lanterns, benches, signs, fences, nets, buoys...).
// Every function draws into a Builder in its current local frame (origin on the ground, +z = front).
import * as THREE from 'three';

export const P = {
  woodLight: 0xc89462, wood: 0xb07a4a, woodDark: 0x8a5532, woodDeep: 0x6a3f24, woodGrey: 0xa8977e, woodGreyDark: 0x857560,
  roofRed: 0xc0603a, roofRedDark: 0x9c4a2c, roofBrown: 0x7d3d24, roofBrownDark: 0x5e2c1a, roofTeal: 0x3f8f8a, roofBlue: 0x4f7fa8,
  wallCream: 0xf2e2c8, wallWhite: 0xf6f0e4, wallBlue: 0xb2d6e4, wallYellow: 0xf2d68e, wallPink: 0xf2bfa6, wallMint: 0xbfe2c8,
  trimTeal: 0x3fa8b8, trimWhite: 0xfff6e6, trimRed: 0xc8513a, trimGreen: 0x5a9a5a,
  stone: 0xbab2a4, stoneDark: 0x8f877c, stoneWarm: 0xc8b89c, rope: 0xd8c08a, metal: 0x4c4c54, metalLight: 0x8a8a92, brass: 0xd2a84a,
  cloth: 0xf4ecd8, clothRed: 0xd8503a, clothBlue: 0x3f7fb8, clothGreen: 0x5aa06a, leaf: 0x5aa04a, flowerPink: 0xf49ac0, flowerYellow: 0xf8d64a,
  window: 0xffd8a0, fish: 0x8ab8c8, fishOrange: 0xf08a3a, sand: 0xe8d29a,
};

/** Wooden crate (≈0.7 m). */
export function crate(B, x, y, z, s = 1, ry = 0, color = P.woodLight) {
  B.push(x, y, z, ry, s);
  B.box(0.7, 0.6, 0.7, 0, 0.3, 0, color, { round: 0.03 });
  for (const sx of [-1, 1]) B.box(0.08, 0.62, 0.72, sx * 0.31, 0.3, 0, P.woodDark, { round: 0.02 });
  B.box(0.72, 0.08, 0.08, 0, 0.3, 0.33, P.woodDark, { round: 0.02 });
  B.box(0.72, 0.08, 0.08, 0, 0.3, -0.33, P.woodDark, { round: 0.02 });
  B.rect(0, 0, 0.37 * s, 0.37 * s, 0, 'prop');
  B.pop();
}

/** Barrel. */
export function barrel(B, x, y, z, s = 1, color = P.wood) {
  B.push(x, y, z, 0, s);
  B.cyl(0.3, 0.27, 0.8, 0, 0.4, 0, color, { seg: 10 });
  B.cyl(0.34, 0.34, 0.06, 0, 0.62, 0, P.metal, { seg: 10 });
  B.cyl(0.34, 0.34, 0.06, 0, 0.18, 0, P.metal, { seg: 10 });
  B.cyl(0.27, 0.27, 0.02, 0, 0.81, 0, P.woodDark, { seg: 10 });
  B.circle(0, 0, 0.33 * s, 'prop');
  B.pop();
}

/** Lantern on a post. Registers a glow source. lit = has a night light. */
export function lanternPost(B, x, y, z, h = 2.1, ry = 0) {
  B.push(x, y, z, ry);
  B.cyl(0.07, 0.09, h, 0, h / 2, 0, P.woodDark, { seg: 6 });
  B.box(0.55, 0.06, 0.06, 0.24, h - 0.08, 0, P.woodDark);
  B.cyl(0.015, 0.015, 0.2, 0.46, h - 0.2, 0, P.metal, { seg: 4 });
  lanternBox(B, 0.46, h - 0.52, 0);
  B.glow(0.46, h - 0.5, 0, 0xffb860, 1, 'lantern');
  B.circle(0, 0, 0.13, 'post');
  B.pop();
}

/** Small hanging lantern body (glass glows at night). */
export function lanternBox(B, x, y, z, s = 1) {
  B.push(x, y, z, 0, s);
  B.box(0.24, 0.05, 0.24, 0, 0.3, 0, P.metal, { round: 0.01 });
  B.cone(0.17, 0.12, 0, 0.38, 0, P.metal, { seg: 4, ry: Math.PI / 4 });
  B.box(0.2, 0.26, 0.2, 0, 0.15, 0, P.window, { mat: 'glow', round: 0.01 });
  B.box(0.24, 0.04, 0.24, 0, 0.0, 0, P.metal, { round: 0.01 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.025, 0.28, 0.025, sx * 0.105, 0.15, sz * 0.105, P.metal, { round: 0 });
  B.pop();
}

/** Bench facing +z. Returns the local sit point. */
export function bench(B, x, y, z, ry = 0, len = 1.6) {
  B.push(x, y, z, ry);
  B.box(len, 0.08, 0.42, 0, 0.46, 0, P.wood, { round: 0.03 });
  B.box(len, 0.32, 0.06, 0, 0.78, -0.22, P.wood, { round: 0.03, rx: -0.12 });
  for (const sx of [-1, 1]) {
    B.box(0.08, 0.46, 0.08, sx * (len / 2 - 0.15), 0.23, 0.14, P.woodDark);
    B.box(0.08, 0.86, 0.08, sx * (len / 2 - 0.15), 0.43, -0.2, P.woodDark);
    B.box(0.06, 0.06, 0.4, sx * (len / 2 - 0.15), 0.62, -0.02, P.woodDark);
  }
  B.rect(0, 0, len / 2, 0.25, 0, 'bench');
  B.pop();
}

/** Simple wooden signpost with arrow boards (no text). */
export function signpost(B, x, y, z, ry = 0, arrows = [0.3, -0.8, 2.2]) {
  B.push(x, y, z, ry);
  B.cyl(0.07, 0.08, 2.1, 0, 1.05, 0, P.woodDark, { seg: 6 });
  arrows.forEach((a, i) => {
    B.push(0, 1.75 - i * 0.32, 0, a);
    B.box(0.8, 0.2, 0.05, 0.38, 0, 0, i % 2 ? P.woodLight : P.wood, { round: 0.02 });
    B.box(0.18, 0.14, 0.05, 0.82, 0, 0, i % 2 ? P.woodLight : P.wood, { rz: Math.PI / 4, round: 0.02 });
    B.pop();
  });
  B.circle(0, 0, 0.18);
  B.pop();
}

/** Wooden fence segment from (x0,z0) to (x1,z1) in the local frame, posts every ~1.6 m. */
export function fence(B, x0, z0, x1, z1, groundAt, color = P.woodLight) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 1.6));
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const w = B.world(x, 0, z);
    const y = groundAt(w.x, w.z) - B.world(0, 0, 0).y;
    B.box(0.12, 0.95, 0.12, x, y + 0.42, z, P.woodDark, { round: 0.03 });
    B.cone(0.09, 0.12, x, y + 0.95, z, P.woodDark, { seg: 4 });
    if (prev) {
      for (const h of [0.35, 0.7]) {
        const a = new THREE.Vector3(prev.x, prev.y + h, prev.z), b = new THREE.Vector3(x, y + h, z);
        const mid = a.clone().add(b).multiplyScalar(0.5), d = b.clone().sub(a);
        B.box(0.06, 0.1, d.length() + 0.1, mid.x, mid.y, mid.z, color, { ry: Math.atan2(d.x, d.z), rx: -Math.atan2(d.y, Math.hypot(d.x, d.z)), round: 0.02 });
      }
      // solid for walkers: one thin box per span (posts included)
      const ddx = x - prev.x, ddz = z - prev.z;
      B.rect((x + prev.x) / 2, (z + prev.z) / 2, Math.hypot(ddx, ddz) / 2 + 0.08, 0.09, Math.atan2(-ddz, ddx), 'fence');
    }
    prev = { x, y, z };
  }
}

/** Rope coil on the ground. */
export function ropeCoil(B, x, y, z, s = 1) {
  B.push(x, y, z, 0, s);
  B.torus(0.22, 0.05, 0, 0.05, 0, P.rope, { rx: Math.PI / 2 });
  B.torus(0.16, 0.05, 0, 0.12, 0, P.rope, { rx: Math.PI / 2 });
  B.pop();
}

/** Buoy / float. */
export function buoy(B, x, y, z, color = P.clothRed) {
  B.push(x, y, z);
  B.sphere(0.2, 0, 0, 0, color, { detail: 1 });
  B.sphere(0.205, 0, 0.02, 0, P.trimWhite, { detail: 1, sy: 0.35 });
  B.pop();
}

/** Fishing net pile. */
export function netPile(B, x, y, z, s = 1) {
  B.push(x, y, z, 0, s);
  B.sphere(0.45, 0, 0.1, 0, 0x6f8f86, { sy: 0.4, detail: 1 });
  B.sphere(0.3, 0.3, 0.12, 0.15, 0x7fa096, { sy: 0.45, detail: 1 });
  B.sphere(0.12, -0.2, 0.25, 0.1, P.fishOrange, { detail: 0 });
  B.sphere(0.1, 0.15, 0.27, -0.15, P.trimWhite, { detail: 0 });
  B.circle(0.05, 0.03, 0.45 * s, 'prop');
  B.pop();
}

/** Net hung between two posts (a lattice of thin strings). */
export function hangingNet(B, x, y, z, ry = 0, w = 2.2, h = 1.4) {
  B.push(x, y, z, ry);
  for (const sx of [-1, 1]) B.cyl(0.06, 0.07, h + 0.6, sx * w / 2, (h + 0.6) / 2, 0, P.woodDark, { seg: 6 });
  B.box(w + 0.2, 0.06, 0.06, 0, h + 0.4, 0, P.woodDark);
  const nx = 7, ny = 5;
  for (let i = 0; i <= nx; i++) { const xx = -w / 2 + 0.1 + (w - 0.2) * i / nx; const sag = Math.sin(i / nx * Math.PI) * 0.18; B.box(0.02, h - sag, 0.02, xx, 0.4 + (h - sag) / 2, 0, 0x5f7a72, { round: 0 }); }
  for (let j = 0; j <= ny; j++) { const yy = 0.4 + h * j / ny; B.box(w - 0.2, 0.02, 0.02, 0, yy - Math.sin(j / ny * Math.PI) * 0.05, 0, 0x5f7a72, { round: 0 }); }
  B.sphere(0.13, -0.3, 0.9, 0.04, P.fishOrange, { detail: 0 });
  B.sphere(0.12, 0.5, 1.2, 0.04, P.trimWhite, { detail: 0 });
  B.circle(-w / 2, 0, 0.12); B.circle(w / 2, 0, 0.12);
  B.rect(0, 0, w / 2, 0.07, 0, 'net');
  B.pop();
}

/** Flower box / planter. */
export function planter(B, x, y, z, ry = 0, len = 0.9, color = P.wood) {
  B.push(x, y, z, ry);
  B.box(len, 0.22, 0.26, 0, 0.11, 0, color, { round: 0.03 });
  B.box(len - 0.06, 0.04, 0.2, 0, 0.22, 0, 0x5a4026, { round: 0 });
  const cols = [P.flowerPink, P.flowerYellow, 0xffffff, 0xf4785a, 0xb8a0f0];
  const n = Math.max(2, Math.round(len / 0.18));
  for (let i = 0; i < n; i++) {
    const xx = -len / 2 + 0.1 + (len - 0.2) * i / Math.max(1, n - 1);
    B.sphere(0.09, xx, 0.3, (i % 2 ? 0.04 : -0.03), P.leaf, { detail: 0 });
    B.sphere(0.055, xx + 0.02, 0.37, (i % 2 ? 0.02 : -0.05), cols[(i + Math.round(x * 3)) % cols.length], { detail: 0 });
  }
  B.rect(0, 0, len / 2, 0.15, 0, 'prop');
  B.pop();
}

/** Stool / tiny table set. */
export function tableSet(B, x, y, z, ry = 0, cloth = P.clothRed) {
  B.push(x, y, z, ry);
  B.cyl(0.42, 0.42, 0.06, 0, 0.74, 0, P.woodLight, { seg: 12 });
  B.cyl(0.44, 0.44, 0.03, 0, 0.78, 0, cloth, { seg: 12 });
  B.cyl(0.05, 0.07, 0.72, 0, 0.36, 0, P.woodDark, { seg: 6 });
  B.cyl(0.22, 0.25, 0.04, 0, 0.02, 0, P.woodDark, { seg: 8 });
  for (const a of [0.4, 0.4 + Math.PI]) {
    const sx = Math.cos(a) * 0.75, sz = Math.sin(a) * 0.75;
    B.cyl(0.2, 0.2, 0.05, sx, 0.46, sz, P.wood, { seg: 10 });
    for (let k = 0; k < 3; k++) { const b = k / 3 * Math.PI * 2; B.cyl(0.025, 0.025, 0.46, sx + Math.cos(b) * 0.13, 0.23, sz + Math.sin(b) * 0.13, P.woodDark, { seg: 4 }); }
  }
  B.circle(0, 0, 0.5);
  B.pop();
}

/** Stack of firewood. */
export function woodpile(B, x, y, z, ry = 0) {
  B.push(x, y, z, ry);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
    B.cyl(0.11, 0.11, 0.9, (i - (3 - r) / 2) * 0.23, 0.11 + r * 0.2, 0, i % 2 ? P.woodDark : P.wood, { seg: 7, rx: Math.PI / 2 });
    B.cyl(0.08, 0.08, 0.005, (i - (3 - r) / 2) * 0.23, 0.11 + r * 0.2, 0.452, P.woodLight, { seg: 7, rx: Math.PI / 2 });
  }
  B.rect(0, 0, 0.5, 0.5);
  B.pop();
}

/** Mooring bollard / post top. */
export function bollard(B, x, y, z) {
  B.push(x, y, z);
  B.cyl(0.12, 0.14, 0.4, 0, 0.2, 0, P.metal, { seg: 8 });
  B.cyl(0.18, 0.18, 0.06, 0, 0.42, 0, P.metal, { seg: 8 });
  B.circle(0, 0, 0.17, 'prop');
  B.pop();
}

/** Simple fish-shaped sign icon (for the fishmonger etc.). */
export function fishIcon(B, x, y, z, s = 1, color = P.fish) {
  B.push(x, y, z, 0, s);
  B.sphere(0.24, 0, 0, 0.02, color, { sx: 1.4, sy: 0.75, sz: 0.25, detail: 1 });
  B.cone(0.16, 0.22, -0.4, 0, 0.02, color, { rz: Math.PI / 2, seg: 4, sz: 0.3 });
  B.sphere(0.035, 0.2, 0.05, 0.08, 0x222222, { detail: 0 });
  B.pop();
}

/** Small boat-shaped hull used for static moored boats (geometry shared with createBoat). */
export function hullPoints() {
  // half-width profile along length (z from -1 to 1) and keel depth
  return { len: 3.4, beam: 1.3, depth: 0.55 };
}
