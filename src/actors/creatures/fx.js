// Tiny pooled effects for creatures: hearts, "z" bubbles, splashes (ripple ring + droplets), sparkles.
// Sprites and flat rings with canvas-drawn textures, one shared pool (no allocations per effect).
import * as THREE from 'three';
import { makeCanvas } from './geo.js';

function tex(draw, size = 64) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const TEX = {};
function textures() {
  if (TEX.heart) return TEX;
  TEX.heart = tex((g, s) => {
    g.translate(s / 2, s / 2 + 4); g.scale(s / 64, s / 64);
    g.beginPath(); g.moveTo(0, 18); g.bezierCurveTo(-30, -2, -22, -26, 0, -12); g.bezierCurveTo(22, -26, 30, -2, 0, 18); g.closePath();
    g.fillStyle = '#ff6f8e'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff4f0'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-9, -9, 5, 3.5, -0.6, 0, Math.PI * 2); g.fill();
  });
  TEX.z = tex((g, s) => {
    g.font = `900 ${s * 0.72}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(40,50,90,0.55)'; g.strokeText('z', s / 2, s / 2); g.fillStyle = '#eef4ff'; g.fillText('z', s / 2, s / 2);
  });
  TEX.drop = tex((g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(235,250,255,0.9)'); gr.addColorStop(1, 'rgba(235,250,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  TEX.sparkle = tex((g, s) => {
    g.translate(s / 2, s / 2); g.fillStyle = '#fffbe0';
    g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? s * 0.1 : s * 0.46; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
  });
  TEX.ring = tex((g, s) => {
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = s * 0.06; g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = s * 0.03; g.beginPath(); g.arc(s / 2, s / 2, s * 0.32, 0, Math.PI * 2); g.stroke();
  }, 128);
  return TEX;
}

/** @param {any} ctx @param {THREE.Object3D} root */
export function createFx(ctx, root) {
  const T = textures();
  const group = new THREE.Group(); group.name = 'CreatureFx'; root.add(group);
  const sprites = [], rings = [];
  const ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (let i = 0; i < 48; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.drop, transparent: true, depthWrite: false, fog: true }));
    s.visible = false; s.renderOrder = 5; group.add(s);
    sprites.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grav: 0, size: 0.2, grow: 0, kind: '' });
  }
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: T.ring, transparent: true, depthWrite: false, fog: true, opacity: 0 }));
    m.visible = false; m.renderOrder = 3; group.add(m);
    rings.push({ m, life: 0, max: 1, size: 1 });
  }
  let si = 0, ri = 0;
  const take = () => { const p = sprites[si]; si = (si + 1) % sprites.length; return p; };

  function sprite(kind, pos, o = {}) {
    const p = take();
    p.kind = kind; p.life = 0; p.max = o.life ?? 1.2; p.grav = o.grav ?? 0; p.size = o.size ?? 0.2; p.grow = o.grow ?? 0;
    p.vel.set(o.vx ?? 0, o.vy ?? 0.4, o.vz ?? 0); p.wobble = o.wobble ?? 0; p.ph = Math.random() * 6;
    p.s.material.map = T[kind] || T.drop; p.s.material.color.set(o.color ?? 0xffffff); p.s.material.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.material.needsUpdate = true;
    p.s.position.copy(pos); p.s.visible = true; p.s.scale.setScalar(p.size);
    return p;
  }

  const fx = {
    group,
    /** Little hearts rising (petting, feeding). */
    hearts(pos, n = 3) { for (let i = 0; i < n; i++) sprite('heart', pos, { life: 1.6 + i * 0.2, size: 0.16 + Math.random() * 0.06, vx: (Math.random() - 0.5) * 0.3, vy: 0.45 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.2, grow: 0.05, wobble: 0.4 }).life = -i * 0.18; },
    /** One sleepy "z". */
    zzz(pos) { sprite('z', pos, { life: 2.4, size: 0.12, vx: 0.08, vy: 0.22, grow: 0.06, wobble: 0.25 }); },
    /** Water splash: ring + droplets. size ~ creature size in metres. */
    splash(pos, size = 0.5, y = null) {
      const r = rings[ri]; ri = (ri + 1) % rings.length;
      r.life = 0; r.max = 1.1 + size * 0.6; r.size = size; r.m.visible = true;
      r.m.position.set(pos.x, (y ?? ctx.world?.waterLevel ?? 0) + 0.02, pos.z);
      const n = Math.round(4 + size * 8);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random()) * (0.6 + size);
        sprite('drop', r.m.position, { life: 0.5 + Math.random() * 0.4, size: 0.05 + size * 0.06, vx: Math.cos(a) * sp * 0.6, vz: Math.sin(a) * sp * 0.6, vy: 1.6 + size * 1.5 + Math.random(), grav: 7 });
      }
    },
    /** Just a ripple ring (frog jump, fish rising). */
    ripple(pos, size = 0.4, y = null) {
      const r = rings[ri]; ri = (ri + 1) % rings.length;
      r.life = 0; r.max = 1.4; r.size = size; r.m.visible = true;
      r.m.position.set(pos.x, (y ?? ctx.world?.waterLevel ?? 0) + 0.02, pos.z);
    },
    sparkle(pos, color = 0xfff3b0) { sprite('sparkle', pos, { life: 0.9, size: 0.18, vy: 0.3, grow: -0.1, color, additive: true }); },
    update(dt) {
      for (const p of sprites) {
        if (!p.s.visible) continue;
        p.life += dt;
        if (p.life < 0) { p.s.material.opacity = 0; continue; }
        if (p.life >= p.max) { p.s.visible = false; continue; }
        p.vel.y -= p.grav * dt;
        p.s.position.addScaledVector(p.vel, dt);
        if (p.wobble) p.s.position.x += Math.sin(p.life * 5 + p.ph) * p.wobble * dt;
        const k = p.life / p.max;
        p.s.material.opacity = Math.min(1, p.life * 6) * (1 - k * k);
        p.s.scale.setScalar(Math.max(0.01, p.size + p.grow * p.life));
      }
      for (const r of rings) {
        if (!r.m.visible) continue;
        r.life += dt;
        if (r.life >= r.max) { r.m.visible = false; continue; }
        const k = r.life / r.max;
        r.m.scale.setScalar(r.size * (0.4 + 2.2 * Math.sqrt(k)));
        r.m.material.opacity = 0.75 * (1 - k);
      }
    },
  };
  return fx;
}
