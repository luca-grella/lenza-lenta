// Fishing line from a cliff [11 nov]: on a high spot by the sea (lighthouse promontory / sea cave cliffs), cast by
// touch and check that no point of the line goes under the ground or into a boulder (it drapes over them).
export default async function (play) {
  await play.onboard();
  const spot = await play.eval(() => {
    const W = window.__lenza.ctx.world;
    let best = null;
    for (const [cx, cz] of [[55, -56], [-70, -44]]) for (let r = 6; r < 40; r += 1.5) for (let k = 0; k < 32; k++) {
      const a = k / 32 * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!W.walkable?.(x, z) || W.isWater?.(x, z)) continue;
      const g = W.groundY(x, z); if (g < 2.5) continue;
      for (let d = 3; d < 9; d += 1) { const wx = x + Math.cos(a) * d, wz = z + Math.sin(a) * d; if (W.isWater?.(wx, wz) && W.groundY(wx, wz) < 0) { if (!best || g > best.g) best = { x, z, g, f: Math.atan2(Math.cos(a), Math.sin(a)) }; break; } }
    }
    return best;
  });
  await play.log('cliff spot', JSON.stringify(spot));
  if (!spot) { await play.issue('no cliff spot found'); return; }
  await play.eval(s => { window.__lenza.teleport(s.x, s.z, s.f); window.__lenza.ctx.player.facing = s.f; return true; }, spot);
  await play.step(30);
  const cast = await play.waitFor(L => L.ctx.systems.interact.current?.kind === 'cast', { timeout: 4 });
  await play.expect(!!cast, 'cast offered on the cliff');
  if (!cast) return;
  const f = await play.press('action'); await play.step(40); await play.release(f);
  await play.waitFor(L => L.ctx.systems.fishing.state === 'wait', { timeout: 6 });
  await play.step(60);
  const r = await play.eval(() => {
    const c = window.__lenza.ctx; let line = null;
    c.scene.traverse(o => { if (o.isMesh && o.renderOrder === 4 && !o.frustumCulled && o.visible && o.geometry?.attributes?.position?.count > 20) line = o; });
    if (!line) return null;
    const a = line.geometry.attributes.position.array, out = { pts: 0, under: 0, worst: 0 };
    for (let i = 6; i < a.length - 6; i += 6) { const x = (a[i] + a[i + 3]) / 2, y = (a[i + 1] + a[i + 4]) / 2, z = (a[i + 2] + a[i + 5]) / 2; const g = Math.max(c.world.groundY(x, z), c.world.rockTopAt?.(x, z) ?? -1e9); out.pts++; if (y < g - 0.01) { out.under++; out.worst = Math.max(out.worst, +(g - y).toFixed(2)); } }
    return out;
  });
  await play.log('line', JSON.stringify(r));
  await play.shot('cliff-line');
  await play.expect(r && r.under === 0, 'the line never goes under the ground', r);
}
