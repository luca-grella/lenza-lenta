// [r2-animation] Small hand props and fx for the catch actions: knife, wooden water bucket, water/scale droplets.
// Sizes in metres; the knife is parented to the hand_R prop bone by player.js (scaled by 1/height there).
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });

/** A small fishing knife: wooden handle + steel blade along +z (the grip is at the origin). */
export function makeKnife() {
  const g = new THREE.Group(); g.name = 'knife';
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.095, 8), std(0x8a5532));
  handle.rotation.x = Math.PI / 2; handle.position.z = 0.01;
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 8), std(0x6a6a6a, { metalness: 0.6, roughness: 0.4 }));
  guard.rotation.x = Math.PI / 2; guard.position.z = 0.06;
  const bg = new THREE.BoxGeometry(0.006, 0.026, 0.11);
  { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > 0) { const k = 1 - (z / 0.055) * 0.7; p.setY(i, p.getY(i) * k + (p.getY(i) > 0 ? 0 : 0.008)); } } bg.computeVertexNormals(); }
  const blade = new THREE.Mesh(bg, std(0xd8dde2, { metalness: 0.7, roughness: 0.3 }));
  blade.position.z = 0.12;
  g.add(handle, guard, blade);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A little wooden bucket with water in it (origin = bottom centre). */
export function makeBucket() {
  const g = new THREE.Group(); g.name = 'bucket';
  const R0 = 0.11, R1 = 0.13, H = 0.2;
  const wood = std(0xb07a4a), band = std(0x5d5a55, { metalness: 0.4, roughness: 0.5 });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R1, R0, H, 14, 1, true), [wood]);
  wall.material = std(0xb07a4a, { side: THREE.DoubleSide }); wall.position.y = H / 2;
  // stave lines via vertex colours would be nicer; two metal bands read well from the top camera
  const b1 = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.006, 0.006, 5, 18), band); b1.rotation.x = Math.PI / 2; b1.position.y = 0.04;
  const b2 = new THREE.Mesh(new THREE.TorusGeometry(R1 - 0.002, 0.007, 5, 18), band); b2.rotation.x = Math.PI / 2; b2.position.y = H - 0.025;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(R0, 14), std(0x8a5532)); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.01;
  const water = new THREE.Mesh(new THREE.CircleGeometry(R1 - 0.012, 16), new THREE.MeshStandardMaterial({ color: 0x3fb8c4, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }));
  water.rotation.x = -Math.PI / 2; water.position.y = H - 0.05; water.name = 'bucket_water';
  const handle = new THREE.Mesh(new THREE.TorusGeometry(R1, 0.005, 4, 16, Math.PI), band); handle.position.y = H; handle.rotation.y = 0.3;
  g.add(wall, b1, b2, bottom, water, handle);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.water = water;
  return g;
}

/** A tiny pool of ballistic droplets (water splashes, fish scales). One InstancedMesh, ≤ 40 drops. */
export class Droplets {
  constructor(n = 40) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), m, n);
    this.mesh.frustumCulled = false; this.mesh.name = 'droplets';
    this.object = this.mesh;
    this.d = Array.from({ length: n }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0.01, floor: 0 }));
    this.next = 0; this._m = new THREE.Matrix4(); this._c = new THREE.Color();
    for (let i = 0; i < n; i++) { this._m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this._m); this.mesh.setColorAt(i, this._c.set(0xffffff)); }
    this.mesh.count = n; this.mesh.visible = false;
  }
  /** Burst at a world point. o: {n, color, speed, up, size, floor (world y where drops stop)} */
  burst(at, o = {}) {
    const n = o.n ?? 10;
    for (let k = 0; k < n; k++) {
      const d = this.d[this.next]; const i = this.next; this.next = (this.next + 1) % this.d.length;
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 0.9) * (0.5 + Math.random() * 0.7);
      d.p.copy(at); d.v.set(Math.cos(a) * sp, (o.up ?? 1.4) * (0.6 + Math.random() * 0.6), Math.sin(a) * sp);
      d.life = 0.5 + Math.random() * 0.35; d.r = (o.size ?? 0.012) * (0.6 + Math.random() * 0.8); d.floor = o.floor ?? -1e9;
      this.mesh.setColorAt(i, this._c.set(o.color ?? 0xbfeaf2));
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = true;
  }
  update(dt) {
    if (!this.mesh.visible) return;
    let any = false;
    for (let i = 0; i < this.d.length; i++) {
      const d = this.d[i];
      if (d.life > 0) {
        d.life -= dt; any = true;
        d.v.y -= 6.5 * dt; d.p.addScaledVector(d.v, dt);
        if (d.p.y < d.floor) { d.p.y = d.floor; d.v.set(0, 0, 0); }
        const s = d.life > 0 ? d.r * Math.min(1, d.life * 4) : 0;
        this._m.makeScale(s, s, s).setPosition(d.p);
      } else this._m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!any) this.mesh.visible = false;
  }
}
