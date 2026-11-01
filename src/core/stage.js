// Test stage: time-of-day lights + sky/fog, optional placeholder island, water and a walking dummy.
// Used by main.js until the World module exists, and by sandbox pages of every area:
//   import { createTestStage } from '../src/core/stage.js';
//   const stage = createTestStage(ctx, { island: true, dummy: true });
import * as THREE from 'three';
import { rng, createNoise, clamp, smoothstep, damp, angleDamp } from './math.js';

const ISLAND_R = 26;

/**
 * @param {any} ctx core context
 * @param {{island?:boolean, water?:boolean, ground?:boolean, dummy?:boolean, props?:boolean, lights?:boolean,
 *   seed?:number|string, shadowBox?:number}} [o]
 *   island: placeholder island + props; ground: flat grass disc instead (for character/creature benches);
 *   water: sea plane; dummy: a walkable chunky fisherman placeholder that the camera follows.
 * @returns {{group:THREE.Group, sun:THREE.DirectionalLight, hemi:THREE.HemisphereLight, water:THREE.Mesh|null,
 *   dummy:THREE.Group|null, heightAt:(x:number,z:number)=>number, update:(dt:number,t:number)=>void, dispose:()=>void}}
 */
export function createTestStage(ctx, o = {}) {
  const opt = { island: true, water: true, ground: false, dummy: true, props: true, lights: true, seed: 'stage', shadowBox: 26, ...o };
  if (o.ground && o.island === undefined) opt.island = false;
  if (opt.ground && !opt.island && o.water === undefined) opt.water = false; // flat bench: no sea (it would z-fight)
  const { scene } = ctx;
  const group = new THREE.Group(); group.name = 'TestStage';
  scene.add(group);
  const R = rng(opt.seed);
  const N = createNoise(7);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xc4ecff, 0xc2b088, 1.2);
  const sun = new THREE.DirectionalLight(0xfff0d4, 2.7);
  sun.castShadow = true;
  const sb = opt.shadowBox;
  Object.assign(sun.shadow.camera, { left: -sb, right: sb, top: sb, bottom: -sb, near: 1, far: 140 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3;
  sun.shadow.mapSize.setScalar(ctx.quality?.shadowMapSize || 2048);
  if (opt.lights) { group.add(hemi, sun, sun.target); }

  // ---- terrain ----
  const heightAt = (x, z) => {
    if (opt.ground && !opt.island) return 0;
    if (!opt.island) return -3;
    const r = Math.hypot(x, z);
    const edge = ISLAND_R + N.fbm(x * 0.05, z * 0.05, 3) * 5;
    const k = 1 - r / edge;
    const hill = Math.max(0, N.fbm(x * 0.045 + 3, z * 0.045 - 1, 3) + 0.25) * 4.2 * smoothstep(0.15, 0.7, k);
    return (k > 0 ? Math.pow(k, 0.55) * 1.3 : k * 6) + hill - 0.35;
  };
  if (opt.island || opt.ground) {
    const size = opt.island ? 90 : 60, seg = opt.island ? 150 : 40;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color(0xecd59a), cWet = new THREE.Color(0xcdb27a), cGrass = new THREE.Color(0x86c454), cGrass2 = new THREE.Color(0x6fb548), cBed = new THREE.Color(0xc9b483), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      const n = N.noise2(x * 0.15, z * 0.15) * 0.5 + 0.5;
      if (!opt.island) c.copy(cGrass).lerp(cGrass2, n);
      else if (y < -0.05) c.copy(cBed).lerp(cWet, smoothstep(-1.2, -0.05, y));
      else if (y < 0.35) c.copy(cWet).lerp(cSand, smoothstep(-0.05, 0.3, y));
      else if (y < 0.75 + n * 0.3) c.copy(cSand);
      else c.copy(cGrass).lerp(cGrass2, n).lerp(cSand, 1 - smoothstep(0.75, 1.1 + n * 0.3, y));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    ground.receiveShadow = true; ground.name = 'ground';
    group.add(ground);
  }

  // ---- water ----
  let water = null;
  if (opt.water) {
    // bake terrain depth below sea level into a small texture so colour and foam follow the real shoreline
    const RES = 160, SIZE = 90, data = new Uint8Array(RES * RES * 4);
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const x = (i + 0.5) / RES * SIZE - SIZE / 2, z = (j + 0.5) / RES * SIZE - SIZE / 2;
      const depth = opt.island ? clamp(-heightAt(x, z) / 4, 0, 1) : 1;
      data.set([depth * 255, 0, 0, 255], (j * RES + i) * 4);
    }
    const depthTex = new THREE.DataTexture(data, RES, RES);
    depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter; depthTex.needsUpdate = true;
    water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 1, 1).rotateX(-Math.PI / 2), makeWaterMaterial(depthTex, SIZE));
    water.position.y = 0; water.name = 'water'; water.renderOrder = 1;
    group.add(water);
  }

  // ---- props (pines, palms, rocks, a dock, a hut) ----
  const swayers = [];
  if (opt.island && opt.props) {
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x2f7d46, roughness: 0.9, flatShading: true });
    const pineMat2 = new THREE.MeshStandardMaterial({ color: 0x3f9152, roughness: 0.9, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5532, roughness: 0.9 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xa39e94, roughness: 0.95, flatShading: true });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb07a4a, roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x7d3d24, roughness: 0.8, flatShading: true });
    const hutMat = new THREE.MeshStandardMaterial({ color: 0xb8623b, roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x5fae45, roughness: 0.85, side: THREE.DoubleSide, flatShading: true });
    const shadow = m => { m.castShadow = true; m.receiveShadow = true; return m; };
    const pine = (x, z, s) => {
      const g = new THREE.Group(); g.position.set(x, heightAt(x, z) - 0.1, z); g.scale.setScalar(s);
      g.add(shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.2, 7), trunkMat)).translateY(0.6));
      for (let k = 0; k < 3; k++) g.add(shadow(new THREE.Mesh(new THREE.ConeGeometry(1.25 - k * 0.3, 1.5, 8), k % 2 ? pineMat2 : pineMat)).translateY(1.5 + k * 0.75));
      g.rotation.y = R() * 6.28; group.add(g); swayers.push({ o: g, ph: R() * 6.28, amp: 0.025 });
    };
    const palm = (x, z, s) => {
      const g = new THREE.Group(); g.position.set(x, heightAt(x, z) - 0.1, z); g.scale.setScalar(s);
      let top = new THREE.Vector3();
      for (let k = 0; k < 6; k++) { const seg = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.62, 7), trunkMat)); seg.position.set(k * k * 0.018, 0.3 + k * 0.58, 0); seg.rotation.z = -k * 0.05; g.add(seg); top.set(k * k * 0.018, 0.3 + k * 0.58 + 0.3, 0); }
      const crown = new THREE.Group(); crown.position.copy(top); g.add(crown);
      for (let k = 0; k < 7; k++) {
        const leaf = shadow(new THREE.Mesh(new THREE.PlaneGeometry(0.55, 2.1, 1, 4), leafMat));
        const p = leaf.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 1.05; p.setZ(i, -0.18 * y * y); p.setX(i, p.getX(i) * (1 - y / 2.6)); }
        leaf.geometry.translate(0, 1.05, 0); leaf.geometry.computeVertexNormals();
        leaf.rotation.set(-1.0, (k / 7) * 6.28, 0, 'YXZ'); crown.add(leaf);
      }
      g.rotation.y = R() * 6.28; group.add(g); swayers.push({ o: crown, ph: R() * 6.28, amp: 0.06 });
    };
    let placed = 0;
    for (let i = 0; i < 400 && placed < 34; i++) {
      const a = R() * 6.28, r = R.range(4, ISLAND_R - 4);
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightAt(x, z);
      if (Math.hypot(x - 2, z - 6) < 7) continue; // clearing near spawn
      if (y > 1.0 && z < 8) { pine(x, z, R.range(0.8, 1.35)); placed++; }
      else if (y > 0.25 && y < 1.0 && R() < 0.35) { palm(x, z, R.range(0.9, 1.2)); placed++; }
    }
    for (let i = 0; i < 14; i++) {
      const a = R() * 6.28, r = R.range(ISLAND_R - 6, ISLAND_R + 2), x = Math.cos(a) * r, z = Math.sin(a) * r;
      const rock = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(R.range(0.4, 1.2), 0), rockMat));
      rock.position.set(x, heightAt(x, z) + 0.1, z); rock.rotation.set(R() * 3, R() * 3, R() * 3); rock.scale.y = 0.7; group.add(rock);
    }
    // dock
    const dock = new THREE.Group(); dock.position.set(4, 0, ISLAND_R - 3);
    for (let k = 0; k < 9; k++) { const p = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.5), woodMat)); p.position.set(0, 0.55, k * 0.56); p.rotation.y = (R() - 0.5) * 0.04; dock.add(p); }
    for (const [x, z] of [[-1, 0.6], [1, 0.6], [-1, 4.4], [1, 4.4]]) { const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.8, 6), trunkMat)); post.position.set(x, 0, z); dock.add(post); }
    group.add(dock);
    // hut
    const hut = new THREE.Group(); hut.position.set(-6, heightAt(-6, 3), 3); hut.rotation.y = 0.5;
    hut.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2.6), hutMat)).translateY(1));
    const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.4, 4), roofMat)); roof.position.y = 2.7; roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 1); hut.add(roof);
    hut.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.1), woodMat)).translateY(0.65).translateZ(1.31));
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffd38a, emissive: 0xffb050, emissiveIntensity: 0 }));
    lantern.position.set(0.8, 1.6, 1.4); hut.add(lantern);
    hut.userData.lantern = lantern;
    group.add(hut);
    group.userData.lantern = lantern;
  }

  // ---- placeholder fisherman (camera follows it, WASD walks) ----
  let dummy = null;
  if (opt.dummy) {
    dummy = makeDummy();
    dummy.position.set(2, Math.max(0, heightAt(2, 6)), 6);
    group.add(dummy);
    ctx.cameraRig?.follow(dummy);
    ctx.cameraRig?.snap();
  }

  const sky = new THREE.Color(), fogColor = new THREE.Color(), _hc = new THREE.Color();
  let speed = 0;
  const stage = {
    group, sun, hemi, water, dummy, heightAt,
    /** Drive lights/sky/fog from ctx.time (overcast 0..1 optional). */
    overcast: 0,
    update(dt, t) {
      const L = ctx.time.lighting({ overcast: stage.overcast });
      const focus = ctx.cameraRig?.lookTarget || new THREE.Vector3();
      sun.color.copy(L.sun); sun.intensity = L.sunIntensity;
      sun.position.copy(focus).addScaledVector(L.sunDir, 60);
      sun.target.position.copy(focus); sun.target.updateMatrixWorld();
      hemi.color.copy(L.hemiSky); hemi.groundColor.copy(L.hemiGround); hemi.intensity = L.hemiIntensity;
      sky.copy(L.horizon).lerp(L.sky, 0.35); fogColor.copy(L.fog);
      if (!scene.background?.isColor) scene.background = new THREE.Color();
      scene.background.copy(sky);
      if (scene.fog) scene.fog.color.copy(fogColor);
      if (water) {
        const u = water.material.uniforms;
        u.time.value = t; u.sunDir.value.copy(L.sunDir); u.sunColor.value.copy(L.sun).multiplyScalar(L.sunIntensity / 2.6);
        u.skyColor.value.copy(L.sky); u.night.value = L.night;
        u.light.value.copy(L.sun).multiplyScalar(0.55 * L.sunIntensity / 2.6).add(_hc.copy(L.hemiSky).multiplyScalar(0.5 * L.hemiIntensity / 1.05));
      }
      const lan = group.userData.lantern;
      if (lan) lan.material.emissiveIntensity = 0.3 + 3.5 * smoothstep(0.2, 0.9, L.night + (1 - L.daylight) * 0.5);
      for (const s of swayers) { s.o.rotation.z = Math.sin(t * 1.3 + s.ph) * s.amp; s.o.rotation.x = Math.sin(t * 0.9 + s.ph * 1.7) * s.amp * 0.6; }
      // dummy controller
      if (dummy && dummy.visible && ctx.input) {
        const m = ctx.input.move;
        const target = m.mag * 3.0;
        speed = damp(speed, target, 6, dt);
        if (m.mag > 0.05) dummy.rotation.y = angleDamp(dummy.rotation.y, Math.atan2(m.x, m.z), 10, dt);
        if (speed > 0.01) {
          const nx = dummy.position.x + Math.sin(dummy.rotation.y) * speed * dt;
          const nz = dummy.position.z + Math.cos(dummy.rotation.y) * speed * dt;
          if (!opt.island || heightAt(nx, nz) > 0.05 || Math.hypot(nx - 4, nz - (ISLAND_R + 0.5)) < 3.5) { dummy.position.x = nx; dummy.position.z = nz; }
        }
        const onDock = opt.island && Math.abs(dummy.position.x - 4) < 1.2 && dummy.position.z > ISLAND_R - 3.3;
        const gy = onDock ? 0.61 : Math.max(0, heightAt(dummy.position.x, dummy.position.z));
        const bob = Math.abs(Math.sin(t * 9)) * 0.08 * clamp(speed / 3, 0, 1);
        dummy.position.y = damp(dummy.position.y, gy, 20, dt);
        dummy.userData.body.position.y = 0.95 + bob;
        dummy.userData.body.rotation.z = Math.sin(t * 9) * 0.06 * clamp(speed / 3, 0, 1);
        dummy.userData.hat.rotation.x = Math.sin(t * 2.1) * 0.04 + speed * 0.02;
      }
    },
    dispose() { ctx.loop?.remove(stage.update); scene.remove(group); group.traverse(o => { o.geometry?.dispose?.(); }); },
  };
  ctx.loop?.add(stage.update, 30);
  stage.update(0, 0);
  return stage;
}

function makeDummy() {
  const g = new THREE.Group(); g.name = 'DummyFisherman';
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c29b, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x3f7fbf, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.9 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xe8c66a, roughness: 0.9 });
  const band = new THREE.MeshStandardMaterial({ color: 0xb8623b, roughness: 0.8 });
  const sh = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const body = new THREE.Group(); body.position.y = 0.95; g.add(body);
  body.add(sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.35, 6, 14), shirt)));
  for (const s of [-1, 1]) {
    const leg = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 4, 8), pants)); leg.position.set(0.16 * s, -0.62, 0); body.add(leg);
    const arm = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.32, 4, 8), shirt)); arm.position.set(0.45 * s, 0.02, 0); arm.rotation.z = 0.25 * s; body.add(arm);
    const hand = sh(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin)); hand.position.set(0.53 * s, -0.22, 0.02); body.add(hand);
  }
  const head = sh(new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), skin)); head.position.y = 0.68; body.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a1d14 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat); e.position.set(0.12 * s, 0.7, 0.32); body.add(e); }
  const hat = new THREE.Group(); hat.position.y = 0.9; body.add(hat);
  hat.add(sh(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.76, 0.05, 28), straw)));
  hat.add(sh(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.26, 20), straw)).translateY(0.14));
  hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.07, 20), band).translateY(0.05));
  g.userData = { body, hat };
  return g;
}

/** Placeholder stylized water: depth-tinted turquoise from a baked depth texture, lapping foam, sun glints. */
function makeWaterMaterial(depthTex, size) {
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, depthTex: { value: null }, size: { value: size }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(1, 1, 1) }, skyColor: { value: new THREE.Color(0xa9e4f2) }, night: { value: 0 },
      light: { value: new THREE.Color(1, 1, 1) },
      shallow: { value: new THREE.Color(0x52dccf) }, mid: { value: new THREE.Color(0x2fb3c4) }, deep: { value: new THREE.Color(0x1d6f9a) },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D depthTex; uniform float time, size, night; uniform vec3 sunDir, sunColor, skyColor, light, shallow, mid, deep;
      varying vec3 vWorld;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vWorld.xz;
        vec2 uv = p / size + 0.5;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float depth = mix(4.0, texture2D(depthTex, uv).r * 4.0, inside);   // metres below the surface (0..4)
        vec3 col = mix(shallow, mid, smoothstep(0.0, 1.2, depth));
        col = mix(col, deep, smoothstep(1.2, 4.0, depth));
        // gentle ripples
        float n = vn(p * 0.55 + vec2(time * 0.22, time * 0.16)) + vn(p * 1.25 - vec2(time * 0.28, -time * 0.19));
        col *= 0.95 + 0.07 * n;
        // foam: shore contact + a lapping line that moves in and out, broken up by noise
        float lap = 0.5 + 0.5 * sin(time * 0.8 + vn(p * 0.2) * 5.0);
        float br = vn(p * 2.4 + vec2(time * 0.3, -time * 0.22));
        float contact = 1.0 - smoothstep(0.02, 0.12, depth);
        float line = 1.0 - smoothstep(0.0, 0.05, abs(depth - (0.12 + 0.22 * lap)));
        float line2 = (1.0 - smoothstep(0.0, 0.06, abs(depth - (0.45 + 0.25 * (1.0 - lap))))) * 0.5;
        float foam = max(contact, max(line, line2) * smoothstep(0.35, 0.6, br + 0.15));
        // view-dependent sky tint
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
        col = mix(col, skyColor, 0.15 + 0.5 * fres);
        col *= light * (1.0 - 0.5 * night);
        col = mix(col, vec3(0.96, 0.98, 1.0) * light * (1.0 - 0.35 * night), clamp(foam, 0.0, 1.0) * 0.85);
        // sun glints
        vec3 N = normalize(vec3((vn(p * 1.7 + time * 0.5) - 0.5) * 0.35, 1.0, (vn(p * 1.9 - time * 0.4) - 0.5) * 0.35));
        vec3 H = normalize(V + normalize(sunDir));
        col += sunColor * pow(max(dot(N, H), 0.0), 240.0) * 2.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.depthTex.value = depthTex;
  return mat;
}
