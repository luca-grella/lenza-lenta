// Aquarium by touch: from the door push the stick into the building, and along each side; the player must never end
// up inside the walls. Also logs which button offers the aquarium (place slot) at the door.
export default async function (play) {
  await play.onboard();
  const info = await play.eval(() => {
    const L = window.__lenza, c = L.ctx, d = c.world.poi('village_aquarium'), s = c.data?.shops?.aquarium;
    return { door: [d.x, d.z, d.facing], shopPos: s?.pos || null };
  });
  await play.log('door', JSON.stringify(info));
  const [dx, dz, rot] = info.door;
  // building centre: 3.85 m behind the door point, toward -facing
  const cx = dx - Math.sin(rot) * 3.85, cz = dz - Math.cos(rot) * 3.85;
  const inside = () => play.eval((cx, cz, rot) => {
    const p = window.__lenza.ctx.player.position;
    const lx = (p.x - cx) * Math.cos(rot) - (p.z - cz) * Math.sin(rot), lz = (p.x - cx) * Math.sin(rot) + (p.z - cz) * Math.cos(rot);
    // [11 nov] the body (radius ~0.3) must stay off the 10 × 7 stone plinth, not only out of the hall
    return { lx: +lx.toFixed(2), lz: +lz.toFixed(2), in: Math.abs(lx) < 5.25 && Math.abs(lz) < 3.65 };
  }, cx, cz, rot);
  const pushTo = async (x, z, secs) => {
    const p = await play.eval(() => window.__lenza.ctx.player.position.toArray());
    const a = await play.project(p[0], p[1], p[2]), t = await play.project(x, p[1], z);
    const d = Math.hypot(t.x - a.x, t.y - a.y) || 1;
    await play.joy((t.x - a.x) / d, (t.y - a.y) / d, secs);
  };
  await play.eval((x, z) => { window.__lenza.teleport(x, z); return true; }, dx + Math.sin(rot) * 1.5, dz + Math.cos(rot) * 1.5);
  await play.step(30);
  const btn = await play.eval(() => { const I = window.__lenza.ctx.systems.interact; return { big: I.current?.kind, s3: I.slots?.[3]?.label }; });
  await play.log('at the door', JSON.stringify(btn));
  await play.expect(btn.big === 'shop' || btn.big === 'donate' || /acquario|aquarium/i.test(btn.s3 || ''), 'at the door a button offers the aquarium', btn);
  await pushTo(cx, cz, 4);
  let r = await inside(); await play.log('pushed in from the door', JSON.stringify(r)); await play.shot('door-push');
  await play.expect(!r.in, 'cannot walk into the aquarium from the door', r);
  // the four sides from outside
  const sides = [[0, 5.5], [0, -5.5], [7, 0], [-7, 0]];
  for (const [ox, oz] of sides) {
    const x = cx + ox * Math.cos(rot) + oz * Math.sin(rot), z = cz - ox * Math.sin(rot) + oz * Math.cos(rot);
    await play.eval((x, z) => { window.__lenza.teleport(x, z); return true; }, x, z);
    await play.step(20);
    await pushTo(cx, cz, 4);
    r = await inside(); await play.log('side', ox, oz, JSON.stringify(r));
    await play.expect(!r.in, `cannot walk into the aquarium from side ${ox},${oz}`, r);
  }
}
