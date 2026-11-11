// Fishing tackle visuals owned by Gameplay: bobber, line (camera-facing ribbon with sag), aim ring, cast-arc preview,
// the "!" bite marker, the hooked fish's shadow and a fallback fish mesh (used when ctx.fishModels is missing).
import * as THREE from 'three';

const SEG = 30;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  return t;
}

function makeBobber() {
  const g = new THREE.Group(); g.name = 'Bobber';
  const red = new THREE.MeshStandardMaterial({ color: 0xe0453a, roughness: 0.45 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfbf6ea, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffd36a, emissiveIntensity: 0, roughness: 0.4 });
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), red);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), white);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.035, 18), red); band.position.y = 0.035;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 6), dark); stick.position.y = 0.26;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glow); tip.position.y = 0.41;
  const keel = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), red); keel.position.y = -0.2; keel.rotation.x = Math.PI;
  for (const m of [bottom, top, band, stick, tip, keel]) { m.castShadow = true; g.add(m); }
  g.userData.glow = glow;
  return g;
}

/** Tiny stylised fish used when the Creatures area isn't loaded. */
export function fallbackFish(species) {
  const pal = species?.model?.palette || { back: '#6a8aa0', belly: '#e8eef2', fin: '#8aa0b0' };
  const len = Math.max(0.25, Math.min(1.2, ((species?.size?.[0] || 20) + (species?.size?.[1] || 40)) / 2 / 100));
  const g = new THREE.Group(); g.name = 'FallbackFish';
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), new THREE.MeshStandardMaterial({ color: pal.back, roughness: 0.5 }));
  body.scale.set(0.32, 0.42 * (species?.model?.height ? species.model.height / 0.33 : 1), 1);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.47, 14, 8), new THREE.MeshStandardMaterial({ color: pal.belly, roughness: 0.6 }));
  belly.scale.set(0.3, 0.3, 0.9); belly.position.y = -0.05;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.32, 4), new THREE.MeshStandardMaterial({ color: pal.fin, roughness: 0.6 }));
  tail.rotation.x = -Math.PI / 2; tail.position.z = -0.6; tail.scale.set(0.3, 1, 1.1);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
  eye.position.set(0.12, 0.08, 0.33);
  const eye2 = eye.clone(); eye2.position.x = -0.12;
  g.add(body, belly, tail, eye, eye2);
  g.scale.setScalar(len);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { object: g, animate(dt, speed = 1, bend = 0.3) { g.userData.t = (g.userData.t || 0) + dt * (4 + speed * 6); tail.rotation.y = Math.sin(g.userData.t) * bend * 1.4; body.rotation.y = -Math.sin(g.userData.t) * bend * 0.2; } };
}

export function createTackle(ctx) {
  const group = new THREE.Group(); group.name = 'Tackle';
  ctx.scene.add(group);

  // ---- bobber
  const bobber = makeBobber();
  bobber.visible = false;
  group.add(bobber);

  // ---- line ribbon
  const linePos = new Float32Array((SEG + 1) * 2 * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const idx = [];
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  lineGeo.setIndex(idx);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf4ecd8, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false, fog: true });
  const line = new THREE.Mesh(lineGeo, lineMat);
  line.frustumCulled = false; line.visible = false; line.renderOrder = 4;
  group.add(line);
  const pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
  const baseLineColor = new THREE.Color(0xf4ecd8);

  // ---- aim ring (canvas texture tinted by material colour)
  const ringTex = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(255,255,255,0.28)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    g.lineWidth = 14; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const a0 = (i / 12) * Math.PI * 2 + 0.06, a1 = a0 + (Math.PI * 2) / 12 - 0.2; g.beginPath(); g.arc(c, c, c * 0.78, a0, a1); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(c, c, 12, 0, 7); g.fill();
  });
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, color: 0x7be08a, transparent: true, depthWrite: false, fog: false });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2), ringMat);
  ring.visible = false; ring.renderOrder = 5;
  group.add(ring);

  // ---- arc preview dots
  const DOTS = 16;
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), dotMat, DOTS);
  dots.visible = false; dots.frustumCulled = false; dots.renderOrder = 5;
  group.add(dots);
  const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();

  // ---- "!" marker
  const bangTex = canvasTex(128, 160, (g) => {
    g.fillStyle = 'rgba(40,30,20,0.25)'; g.beginPath(); g.ellipse(66, 70, 54, 58, 0, 0, 7); g.fill();
    g.fillStyle = '#fff8ea'; g.beginPath(); g.ellipse(64, 66, 54, 58, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(52, 118); g.lineTo(64, 152); g.lineTo(78, 116); g.fill();
    g.strokeStyle = '#f0a43a'; g.lineWidth = 7; g.beginPath(); g.ellipse(64, 66, 50, 54, 0, 0, 7); g.stroke();
    g.fillStyle = '#e8563a'; g.font = 'bold 92px system-ui, -apple-system, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('!', 64, 70);
  });
  const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangTex, transparent: true, depthTest: false, depthWrite: false }));
  bang.visible = false; bang.renderOrder = 10; bang.scale.set(0.9, 1.12, 1);
  group.add(bang);

  // ---- fish shadow on the water
  const shadowTex = canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grd.addColorStop(0, 'rgba(10,30,40,0.85)'); grd.addColorStop(0.6, 'rgba(10,30,40,0.45)'); grd.addColorStop(1, 'rgba(10,30,40,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 }));
  shadow.visible = false; shadow.renderOrder = 2;
  group.add(shadow);

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _side = new THREE.Vector3(), _toCam = new THREE.Vector3();
  let bangT = 0;

  const tackle = {
    group, bobber, line, ring, dots, bang, shadow,
    /** Line from a to b: sag = metres of droop at the middle, wiggle = small lateral shake. */
    setLine(a, b, sag = 0.5, wiggle = 0, t = 0) {
      line.visible = true;
      const dist = a.distanceTo(b);
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        const p = pts[i].lerpVectors(a, b, u);
        p.y -= sag * 4 * u * (1 - u);
        if (wiggle) { const w = Math.sin(u * Math.PI) * wiggle * Math.sin(t * 30 + u * 9); p.x += w; p.z += w * 0.6; }
        // [11 nov] never through the ground: from a cliff or a high bank the line drapes over the edge (terrain, decks)
        if (i > 0 && i < SEG) {
          let g = null, r = null;
          try { g = ctx.world?.groundY?.(p.x, p.z); r = ctx.world?.rockTopAt?.(p.x, p.z); } catch { /* optional */ }
          if (Number.isFinite(r) && (!Number.isFinite(g) || r > g)) g = r;
          if (Number.isFinite(g) && p.y < g + 0.05) p.y = g + 0.05;
        }
      }
      // keep the line above the water except at the very end
      const cam = ctx.camera.position;
      const width = 0.022 + Math.min(0.02, dist * 0.0012);
      for (let i = 0; i <= SEG; i++) {
        const p = pts[i];
        _t.subVectors(pts[Math.min(SEG, i + 1)], pts[Math.max(0, i - 1)]).normalize();
        _toCam.subVectors(cam, p).normalize();
        _side.crossVectors(_t, _toCam).normalize().multiplyScalar(width);
        linePos.set([p.x + _side.x, p.y + _side.y, p.z + _side.z, p.x - _side.x, p.y - _side.y, p.z - _side.z], i * 6);
      }
      lineGeo.attributes.position.needsUpdate = true;
      lineGeo.computeBoundingSphere();
    },
    hideLine() { line.visible = false; },
    setLineColor(hex, daylight = 1) { baseLineColor.set(hex || 0xf4ecd8); lineMat.color.copy(baseLineColor).multiplyScalar(0.35 + 0.65 * daylight); },
    /** Aim ring at a point; valid → green, else soft red. */
    showRing(p, valid, t, scale = 1) {
      ring.visible = true;
      ring.position.set(p.x, p.y + 0.05, p.z);
      const pulse = 1 + Math.sin(t * 4) * 0.06;
      ring.scale.setScalar(scale * pulse);
      ring.rotation.y = t * 0.4;
      ringMat.color.set(valid ? 0x8ff09a : 0xf59a88);
      ringMat.opacity = valid ? 0.95 : 0.8;
    },
    hideRing() { ring.visible = false; dots.visible = false; },
    /** Dotted parabola from a to b. */
    showArc(a, b, valid, t) {
      dots.visible = true;
      dotMat.color.set(valid ? 0xd8ffd8 : 0xffd0c8);
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const h = 1.2 + d * 0.22;
      for (let i = 0; i < DOTS; i++) {
        let u = (i + 1) / (DOTS + 1);
        u = (u + (t * 0.35) / (DOTS + 1) * 6) % 1;
        _a.lerpVectors(a, b, u); _a.y += h * 4 * u * (1 - u);
        const s = 0.6 + 0.6 * Math.sin(u * Math.PI);
        _m.compose(_a, _q, _s.set(s, s, s));
        dots.setMatrixAt(i, _m);
      }
      dots.instanceMatrix.needsUpdate = true;
    },
    /** Position on the cast parabola from a to b at u (0..1). */
    arcPoint(a, b, u, out) {
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const h = 1.2 + d * 0.22;
      out.lerpVectors(a, b, u); out.y += h * 4 * u * (1 - u);
      return out;
    },
    showBang(p) { bang.visible = true; bang.position.set(p.x, p.y + 1.25, p.z); bangT = 0; },
    hideBang() { bang.visible = false; },
    showShadow(p, angle, size = 1, alpha = 0.5) {
      shadow.visible = true;
      shadow.position.set(p.x, p.y + 0.02, p.z);
      shadow.rotation.y = angle;
      shadow.scale.set(0.55 * size, 1, 1.5 * size);
      shadow.material.opacity = alpha;
    },
    hideShadow() { shadow.visible = false; },
    update(dt, t, night = 0) {
      bobber.userData.glow.emissiveIntensity = 0.2 + night * 2.2;
      if (bang.visible) {
        bangT += dt;
        const pop = bangT < 0.25 ? THREE.MathUtils.lerp(0.2, 1.15, bangT / 0.25) : 1 + 0.15 * Math.exp(-(bangT - 0.25) * 6) * Math.sin((bangT - 0.25) * 22);
        bang.scale.set(0.9 * pop, 1.12 * pop, 1);
        bang.material.rotation = Math.sin(t * 9) * 0.06;
      }
    },
    hideAll() { bobber.visible = false; line.visible = false; ring.visible = false; dots.visible = false; bang.visible = false; shadow.visible = false; },
  };
  return tackle;
}
