// Contact sheet of every player clip from four sides [11 nov]: Luca saw shots where the player seemed to miss an arm.
// Each row = one clip at two moments x four views (front, right, back, left), rendered close like the cinematics.
// Env CLIPS=a,b,c to pick clips, DIST (default 2.4), TW/TH tile size, PER rows per sheet, GENDER=f for the fisherwoman.
import fs from 'node:fs';
import path from 'node:path';
export default async function (play) {
  await play.onboard();
  if (process.env.GENDER === 'f') await play.eval(() => { const c = window.__lenza.ctx; c.save.state.player.gender = 'f'; c.bus.emit('player:gender', { gender: 'f' }); return true; });
  const names = (process.env.CLIPS || 'idle,walk,cast_windup,cast_release,fish_wait,strike,reel,reel_struggle,catch_show,catch_hold,catch_happy,catch_proud,fail_shrug,sit_down,sit_idle,stand_up,sit_boat,row,crouch_pick,pet,eat,wave,talk,sleep,wake,lay_on_mat,clean_fish,cook_stir,cook_counter,put_in_bucket,show_to_cat,unroll_mat,roll_mat,nod,flinch,idle_hat,idle_yawn').split(',');
  const per = Number(process.env.PER || 10);
  for (let g = 0; g < names.length; g += per) {
    const url = await play.eval(async (list, dist, tw, th) => {
      const L = window.__lenza, c = L.ctx, P = c.player, cam = c.camera, R = c.renderer;
      const p0 = P.position.clone();
      const TW = tw, TH = th, views = [0, Math.PI / 2, Math.PI, -Math.PI / 2], times = [0.5, 1.4];
      const out = document.createElement('canvas'); out.width = TW * 8 + 90; out.height = TH * list.length;
      const g2 = out.getContext('2d'); g2.fillStyle = '#222'; g2.fillRect(0, 0, out.width, out.height);
      g2.font = '12px sans-serif';
      for (let r = 0; r < list.length; r++) {
        g2.fillStyle = '#fff'; g2.fillText(list[r], 4, r * TH + 20);
        P.play(list[r], { fade: 0 });
        let tPrev = 0;
        for (let k = 0; k < times.length; k++) {
          L.step(Math.round((times[k] - tPrev) * 60)); tPrev = times[k];
          for (let v = 0; v < 4; v++) {
            const a = P.facing + views[v], ctr = P.position.clone(); ctr.y += 0.8;
            cam.position.set(ctr.x + Math.sin(a) * dist, ctr.y + 0.35, ctr.z + Math.cos(a) * dist); cam.lookAt(ctr);
            cam.aspect = TW / TH; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
            R.render(c.scene, cam);
            const src = R.domElement, sw = src.width, sh = src.height, ar = TW / TH;
            const cw = Math.min(sw, sh * ar), chh = cw / ar;
            g2.drawImage(src, (sw - cw) / 2, (sh - chh) / 2, cw, chh, 90 + (k * 4 + v) * TW, r * TH, TW - 2, TH - 2);
          }
        }
        P.play('locomotion', { fade: 0 }); L.step(2);
      }
      return out.toDataURL('image/png');
    }, names.slice(g, g + per), Number(process.env.DIST || 2.4), Number(process.env.TW || 150), Number(process.env.TH || 190));
    const f = path.join(play.outDir || 'tmp', `limb-sheet-${g / per}.png`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    await play.log('sheet', f);
  }
}
