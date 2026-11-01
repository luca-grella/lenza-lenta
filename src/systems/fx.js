// Gameplay water FX: splash droplets, expanding ripple rings and soft foam puffs (boat wake), all pooled.
// One InstancedMesh for droplets, one for ripples and one for foam → 3 draw calls in total.
import * as THREE from 'three';

function softTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (kind === 'ring') {
    const grd = g.createRadialGradient(64, 64, 40, 64, 64, 63);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  } else {
    // foam blob: soft disc with a few lumpy highlights
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 18 + (i % 3) * 9;
      g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 6 + (i % 4) * 2, 0, 7); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFx(ctx) {
  const group = new THREE.Group();
  group.name = 'GameplayFx';
  ctx.scene.add(group);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  // ---- droplets
  const DROPS = 140;
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.92, depthWrite: false, fog: true });
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 1), dropMat, DROPS);
  drops.frustumCulled = false; drops.renderOrder = 3; drops.count = 0;
  group.add(drops);
  const dp = Array.from({ length: DROPS }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, floor: 0 }));
  let dropNext = 0;

  // ---- ripple rings (flat, on the water surface)
  const RINGS = 40;
  const ringMat = new THREE.MeshBasicMaterial({ map: softTexture('ring'), color: 0xffffff, transparent: true, depthWrite: false, fog: true, opacity: 1 });
  ringMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= vAlpha;\n#include <opaque_fragment>');
  };
  const ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ringAlpha = new THREE.InstancedBufferAttribute(new Float32Array(RINGS), 1);
  ringGeo.setAttribute('aAlpha', ringAlpha);
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, RINGS);
  rings.frustumCulled = false; rings.renderOrder = 2; rings.count = 0;
  group.add(rings);
  const rp = Array.from({ length: RINGS }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, r0: 0.2, r1: 1.5, a: 0.8 }));
  let ringNext = 0;

  // ---- foam puffs (boat wake, landing splash)
  const FOAM = 64;
  const foamMat = ringMat.clone();
  foamMat.map = softTexture('foam');
  foamMat.onBeforeCompile = ringMat.onBeforeCompile;
  const foamGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const foamAlpha = new THREE.InstancedBufferAttribute(new Float32Array(FOAM), 1);
  foamGeo.setAttribute('aAlpha', foamAlpha);
  const foam = new THREE.InstancedMesh(foamGeo, foamMat, FOAM);
  foam.frustumCulled = false; foam.renderOrder = 2; foam.count = 0;
  group.add(foam);
  const fp = Array.from({ length: FOAM }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, s0: 0.4, s1: 1.2, rot: 0, vx: 0, vz: 0, a: 0.7 }));
  let foamNext = 0;

  const q = () => ctx.quality?.particles ?? 1;

  const fx = {
    group,
    /** Ripple ring at a water point. size ~1 small, 2 big. */
    ripple(pos, size = 1, { life = 1.6, alpha = 0.75, delay = 0 } = {}) {
      const r = rp[ringNext]; ringNext = (ringNext + 1) % RINGS;
      Object.assign(r, { life: life + delay, max: life, delay, x: pos.x, y: (pos.y ?? 0) + 0.025, z: pos.z, r0: 0.15 * size, r1: 1.4 * size, a: alpha });
    },
    /** Foam puff. */
    foam(pos, size = 1, { life = 2.2, alpha = 0.6, vx = 0, vz = 0 } = {}) {
      const f = fp[foamNext]; foamNext = (foamNext + 1) % FOAM;
      Object.assign(f, { life, max: life, x: pos.x, y: (pos.y ?? 0) + 0.03, z: pos.z, s0: 0.35 * size, s1: 1.25 * size, rot: Math.random() * 6.28, vx, vz, a: alpha });
    },
    /** Splash: droplets + rings (+ foam for big ones). */
    splash(pos, size = 1) {
      const n = Math.round((6 + size * 10) * q());
      for (let i = 0; i < n; i++) {
        const d = dp[dropNext]; dropNext = (dropNext + 1) % DROPS;
        const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 1.4) * (0.7 + size * 0.35);
        Object.assign(d, { life: 0.5 + Math.random() * 0.5, x: pos.x, y: (pos.y ?? 0) + 0.05, z: pos.z,
          vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: (2.2 + Math.random() * 2.2) * (0.65 + size * 0.3), s: 0.6 + Math.random() * (0.6 + size * 0.3), floor: pos.y ?? 0 });
      }
      fx.ripple(pos, 0.8 * size, { life: 1.4 });
      fx.ripple(pos, 1.25 * size, { life: 2.0, alpha: 0.5, delay: 0.18 });
      if (size >= 1.4) fx.foam(pos, 0.9 * size, { life: 1.8, alpha: 0.55 });
    },
    update(dt) {
      // daylight-aware tint so splashes don't glow at night
      const L = ctx.time?.lighting?.();
      const lum = L ? 0.38 + 0.62 * (L.daylight ?? 1) : 1;
      tint.setRGB(lum, lum * 1.0, Math.min(1, lum * 1.04));
      dropMat.color.copy(tint); ringMat.color.copy(tint); foamMat.color.copy(tint);

      let k = 0;
      for (const d of dp) {
        if (d.life <= 0) continue;
        d.life -= dt; d.vy -= 9.8 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        if (d.y < d.floor) d.life = 0;
        if (d.life <= 0) continue;
        dummy.position.set(d.x, d.y, d.z); dummy.scale.setScalar(d.s * Math.min(1, d.life * 3)); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); drops.setMatrixAt(k++, dummy.matrix);
      }
      drops.count = k; drops.instanceMatrix.needsUpdate = true;

      k = 0;
      for (const r of rp) {
        if (r.life <= 0) continue;
        r.life -= dt;
        if (r.life <= 0 || r.life > r.max) continue; // dead or still delayed
        const u = 1 - r.life / r.max;
        const s = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - u, 2.2));
        dummy.position.set(r.x, r.y, r.z); dummy.scale.set(s * 2, 1, s * 2); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); rings.setMatrixAt(k, dummy.matrix);
        ringAlpha.array[k] = r.a * (1 - u) * Math.min(1, u * 8);
        k++;
      }
      rings.count = k; rings.instanceMatrix.needsUpdate = true; ringAlpha.needsUpdate = true;

      k = 0;
      for (const f of fp) {
        if (f.life <= 0) continue;
        f.life -= dt;
        if (f.life <= 0) continue;
        const u = 1 - f.life / f.max;
        f.x += f.vx * dt; f.z += f.vz * dt; f.vx *= 1 - dt * 0.8; f.vz *= 1 - dt * 0.8;
        const s = f.s0 + (f.s1 - f.s0) * Math.sqrt(u);
        dummy.position.set(f.x, f.y, f.z); dummy.scale.set(s * 2, 1, s * 2); dummy.rotation.set(0, f.rot + u * 0.4, 0);
        dummy.updateMatrix(); foam.setMatrixAt(k, dummy.matrix);
        foamAlpha.array[k] = f.a * (1 - u) * Math.min(1, u * 10);
        k++;
      }
      foam.count = k; foam.instanceMatrix.needsUpdate = true; foamAlpha.needsUpdate = true;
    },
  };
  return fx;
}
