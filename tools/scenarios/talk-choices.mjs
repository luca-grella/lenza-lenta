// Shopkeepers by touch [10 nov]: next to Gino, Rosa and Pina the talk button and the shop button are two different
// small buttons (talk = slot 0, shop counter = slot 3) that stay in place; talking is only talking (no shop choice
// in the dialogue), the shop button opens the shop. Setup teleports next to each villager; the rest is by touch.
//   node tools/play.mjs tools/scenarios/talk-choices.mjs [--landscape] [--lang en]
export default async function (play) {
  await play.onboard();
  const btns = () => play.eval(() => {
    const I = window.__lenza.ctx.systems.interact;
    const r = s => { const e = document.querySelector(s); return e && !e.classList.contains('empty') ? { t: e.textContent.trim(), r: e.getBoundingClientRect().toJSON() } : null; };
    return { big: I.current?.kind, s0: I.slots?.[0]?.kind, s3: I.slots?.[3]?.kind, b0: r('.slot-0'), b3: r('.slot-3') };
  });
  for (const id of ['gino', 'rosa', 'pina']) {
    await play.eval(n => { const L = window.__lenza; const o = L.ctx.npcs.get(n).object.position; const P = L.ctx.player; L.teleport(o.x + 1.0, o.z + 0.6); P.facing = Math.atan2(o.x - P.position.x, o.z - P.position.z); }, id);
    let b = null;
    for (let i = 0; i < 10; i++) { await play.step(20); b = await btns(); if ((b.s0 === 'talk' || b.big === 'talk') && (b.s3 || b.big === 'shop' || b.big === 'sell')) break; }
    await play.log(id, JSON.stringify(b));
    await play.shot('buttons-' + id);
    const talkOn = b.s0 === 'talk' ? '.slot-0' : b.big === 'talk' ? '.act' : null;
    const shopOn = (b.s3 === 'shop' || b.s3 === 'sell') ? '.slot-3' : (b.big === 'shop' || b.big === 'sell') ? '.act' : null;
    await play.expect(!!talkOn, `${id}: a talk button`, b);
    await play.expect(!!shopOn, `${id}: a separate shop button`, b);
    if (b.b0 && b.b3) {
      const A = b.b0.r, B = b.b3.r;
      await play.expect(A.right <= B.left || B.right <= A.left || A.bottom <= B.top || B.bottom <= A.top, `${id}: the small buttons do not overlap`);
    }
    if (talkOn) {
      await play.tapSel(talkOn, talkOn === '.act' ? { hold: 0.06, after: 0.1 } : {});
      let choices = 0, lines = 0;
      for (let i = 0; i < 12; i++) {
        await play.wait(1.0);
        const st = await play.state();
        if (!st.dialog) { if (lines) break; continue; }
        lines++; choices = Math.max(choices, st.dialog.choices?.length || 0);
        if (st.dialog.choices?.length) await play.tapSel('.dlg-choice'); else await play.tapSel('.dialog-host .dialog', { optional: true });
      }
      const sheet = (await play.state()).sheet;
      await play.expect(lines > 0 && !choices && !sheet, `${id}: talking is only talking (no shop in the dialogue)`, { lines, choices, sheet });
    }
    if (shopOn) {
      await play.step(30);
      await play.tapSel(shopOn, shopOn === '.act' ? { hold: 0.06, after: 0.1 } : {});
      const open = await play.waitFor(L => L.ctx.ui.currentSheet, { timeout: 4 });
      await play.expect(!!open, `${id}: the shop button opens the shop`, { open });
      if (open) { await play.shot('shop-' + id); await play.eval(() => window.__lenza.ctx.ui.closeSheet() && true); await play.step(30); }
    }
  }
}
