// Carried lantern: once the player owns the 'lantern' item, a small brass lantern hangs from the belt and
// lights the way at night and inside the sea cave (warm point light, no shadows). The light always stays in
// the scene (intensity 0 by day) so turning it on never recompiles materials.
import * as THREE from 'three';

/** @param {any} ctx */
export function createCarriedLantern(ctx) {
  const player = ctx.player;
  if (!player?.object) return null;
  const { clamp, damp, smoothstep } = ctx.math;

  const group = new THREE.Group();
  group.name = 'carried-lantern';
  const brass = new THREE.MeshStandardMaterial({ color: 0x9a6b2f, roughness: 0.45, metalness: 0.55 });
  const glass = new THREE.MeshBasicMaterial({ color: 0xffd58a });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.05, 8), brass);
  cap.position.y = 0.11;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 10), brass);
  ring.position.y = 0.16;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.13, 8), glass);
  body.position.y = 0.03;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.035, 8), brass);
  base.position.y = -0.05;
  group.add(cap, ring, body, base);
  group.position.set(0.3, 0.62, 0.12); // right hip, a little forward so the hat brim does not hide it
  group.visible = false;
  player.object.add(group);

  const light = new THREE.PointLight(0xffb866, 0, 7.5, 1.6);
  light.position.set(0.3, 0.9, 0.2);
  light.castShadow = false;
  player.object.add(light);

  let k = 0, flick = 0;
  const owned = () => !!ctx.systems?.inventory?.owns?.('lantern');
  const remove = ctx.loop.add((dt, t) => {
    const L = ctx.time?.lighting?.();
    const night = L ? L.night : 0;
    const cave = ctx.world?.zoneAt?.(player.position.x, player.position.z) === 'sea_cave';
    const want = owned() && !ctx.systems?.boat?.active ? clamp(Math.max(smoothstep(0.25, 0.7, night), cave ? 0.7 : 0), 0, 1) : 0;
    k = damp(k, want, 3, dt);
    group.visible = k > 0.02;
    flick = 0.92 + 0.08 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.3);
    light.intensity = k * 2.4 * flick;
    glass.color.setRGB(1, 0.84, 0.54).multiplyScalar(0.55 + 0.45 * k * flick);
    // a gentle swing with walking speed
    group.rotation.z = Math.sin(t * 6) * 0.12 * clamp((player.speed ?? 0) / 3, 0, 1);
  }, (ctx.ORDER?.actors ?? 20) + 1);

  return { group, light, get on() { return k > 0.5; }, dispose() { remove(); group.removeFromParent(); light.removeFromParent(); } };
}
