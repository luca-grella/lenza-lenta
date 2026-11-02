// The cat (Biscotto / Biscuit): feed it fish to befriend it, then it follows you and sits next to you while you fish.
//   save.state.cat = { friend, befriended, following, fed, petDay }
// The cat's body and animation belong to Creatures (ctx.creatures.cat: befriend, follow, sitNear, feed, pet?, object).
// Emits 'cat:feed' {friend}, 'cat:befriend', 'cat:pet'.
// Feeding and petting first walk the player up to the cat (env.walkPlayerTo); for petting, Creatures'
// cat.approachForPet() says where to stand so the hand lands on the cat, and stops the cat meanwhile.

export function createCat(ctx, env) {
  const S = env.S;
  const D = () => ctx.data || {};
  const sys = () => ctx.systems || {};
  const C = () => { const c = (S().cat ||= {}); c.friend ??= 0; return c; };
  const creature = () => ctx.creatures?.cat || null;
  const need = () => D().creatures?.find?.(c => c.id === 'cat')?.befriend?.feeds || 3;
  const call = (fn, ...a) => { try { return creature()?.[fn]?.(...a); } catch (e) { console.warn('[cat]', fn, e); } };

  function gain(n, source) {
    const c = C();
    c.friend = (c.friend || 0) + n;
    c.fed = (c.fed | 0) + 1;
    call('feed');
    env.sfx('cat_meow', { pitch: 1.1 + Math.random() * 0.2, pos: catPos() });
    ctx.bus.emit('cat:feed', { friend: c.friend, source });
    if (!c.befriended && c.friend >= need()) befriend();
    else if (!c.befriended) env.toast('sys.cat.closer', { n: c.friend, of: need() });
    else env.toast('sys.cat.happy');
    ctx.save.commit();
  }

  function befriend() {
    const c = C();
    if (c.befriended) return;
    c.befriended = true;
    c.following = true;
    call('befriend');
    call('follow', true);
    ctx.save.commit();
    env.banner('sys.cat.friend', 'sys.cat.friend_sub');
    ctx.bus.emit('cat:befriend', {});
  }

  let approaching = false;
  /** Walk next to the cat. pet: use the cat's own petting spot; dist: stop this far from it (a shy cat keeps away). */
  async function approach(forPet, dist = 0.85) {
    const cr = creature(), o = cr?.object;
    if (!o) return false;
    const p = env.playerPos();
    let spot = null;
    if (forPet) { try { spot = cr.approachForPet?.({ x: p.x, z: p.z }) || null; } catch (e) { console.warn('[cat] approachForPet', e); } }
    if (!spot || spot.ok === false) {
      // fallback: 0.85 m from the cat, on the player's side
      const dx = p.x - o.position.x, dz = p.z - o.position.z, d = Math.hypot(dx, dz) || 1;
      spot = { standPos: { x: o.position.x + dx / d * dist, z: o.position.z + dz / d * dist }, facing: Math.atan2(-dx, -dz), tolerance: 0.25 };
    }
    approaching = true;
    let ok = true;
    if (Math.hypot(spot.standPos.x - p.x, spot.standPos.z - p.z) > (spot.tolerance ?? 0.2)) {
      ok = await env.walkPlayerTo(spot.standPos.x, spot.standPos.z, { tolerance: Math.max(0.15, spot.tolerance ?? 0.2), timeout: 5 });
    }
    approaching = false;
    // close enough counts: the cat does the last few cm itself
    const q = env.playerPos();
    const near = Math.hypot(o.position.x - q.x, o.position.z - q.z) < Math.max(1.3, dist + 0.4);
    if (ok || near) { if (Number.isFinite(spot.facing)) env.face(spot.facing); return true; }
    if (forPet) call('cancelPet');
    return false;
  }

  function catPos() {
    const o = creature()?.object;
    return o ? { x: o.position.x, z: o.position.z } : undefined;
  }

  const TREAT_REACH = 10;   // farther than this the Backpack asks you to walk over first (the walk-up has a 5 s budget)
  const cat = {
    get friend() { return C().friend || 0; },
    get befriended() { return !!C().befriended; },
    get following() { return !!C().following; },
    get exists() { return !!creature()?.object; },
    /** True while the player is walking up to the cat. */
    get approaching() { return approaching; },
    /** World position of the cat (or null). */
    position() { return creature()?.object?.position || null; },
    /** Give the fish from the catch card. */
    feedCatch(c) {
      if (!c || c.junk) return false;
      gain(1, 'catch');
      return true;
    },
    /** Walk up to the cat, then feed it the smallest fish from the basket. */
    async feed() {
      if (approaching) return false;
      if (!(S().basket || []).some(e => D().get?.(e.id)?.kind === 'fish')) { env.toast('sys.cat.no_fish'); return false; }
      if (!(await approach(false))) return false;
      const taken = sys().inventory?.takeFromBasket?.((e, it) => it?.kind === 'fish', 1, 'smallest');
      if (!taken?.length) { env.toast('sys.cat.no_fish'); return false; }
      env.play('crouch_pick', { loop: false });
      gain(1, 'basket');
      return true;
    },
    /** Can the kitty treat be handed over now? null = yes, else 'none' (no cat) | 'far'. */
    treatBlocked() {
      const o = creature()?.object;
      if (!o) return 'none';
      const p = env.playerPos();
      return Math.hypot(o.position.x - p.x, o.position.z - p.z) > TREAT_REACH ? 'far' : null;
    },
    /**
     * Kitty treat dish, given from the Backpack: [Fix] it used to reach the cat from any distance with no walk and no
     * gesture. Now the player walks up to the cat (once the panel has closed), crouches and hands it over; onGiven()
     * (removing the dish) runs only if the cat was reached. Resolves true when given.
     */
    async giveTreat(n = 1, onGiven = null) {
      if (approaching || cat.treatBlocked()) { if (cat.treatBlocked() === 'far') env.toast('sys.cat.far'); return false; }
      // the walk needs the controls back: wait for the Backpack to close
      for (let k = 0; k < 40 && ctx.input?.enabled === false; k++) await new Promise(r => setTimeout(r, 50));
      if (!(await approach(false))) { env.toast('sys.cat.far'); return false; }
      onGiven?.();
      env.play('crouch_pick', { loop: false });
      gain(n + 1, 'treat');
      return true;
    },
    /** Not friends yet and no fish to offer: walk up slowly, crouch and hold out a hand; the cat sniffs it and backs off. */
    async greet() {
      if (approaching) return false;
      await approach(false, 1.25);
      env.play('crouch_pick', { loop: false });
      env.sfx('cat_meow', { pitch: 1.4, vol: 0.6, delay: 0.4, pos: catPos() });
      env.toast('sys.cat.sniff');
      return true;
    },
    /** Walk up to the cat (to the spot where the hand lands on its back), then pet it. */
    async pet() {
      const c = C();
      if (!c.befriended) { env.sfx('cat_meow', { pitch: 1.4, vol: 0.6, pos: catPos() }); env.toast('sys.cat.shy'); return false; }
      if (approaching) return false;
      if (!(await approach(true))) return false;
      env.play('pet', { loop: false });
      call('pet', { duration: 3 });
      env.sfx('cat_meow', { pitch: 0.85, vol: 0.5, delay: 0.5, pos: catPos() });
      c.petDay = ctx.time.day;
      ctx.save.commit();
      ctx.bus.emit('cat:pet', {});
      return true;
    },
    follow(v = true) {
      if (!C().befriended) return false;
      C().following = !!v;
      call('follow', !!v);
      ctx.save.commit();
      env.toast(v ? 'sys.cat.follow' : 'sys.cat.stay');
      return true;
    },
    /** [r2-gameplay] The mat's "Mostra a Biscotto" is offered (the cat is around and was not just shown a fish). */
    canShow() { return !!creature()?.object && ctx.time.day * 24 + ctx.time.hours - (C().showAt ?? -99) > 0.5; },
    /**
     * [r2-gameplay] Show a fish on the mat to the cat: it comes over, sits by the fish facing it and meows; friendship +1
     * once per game day (a shy cat gets closer to befriending). `at` = the fish's world position. → {gained, friend}
     */
    show(speciesId, at) {
      const c = C(), cr = creature();
      c.showAt = ctx.time.day * 24 + ctx.time.hours;
      let gained = 0;
      if (c.showDay !== ctx.time.day) { c.showDay = ctx.time.day; c.friend = (c.friend || 0) + 1; gained = 1; }
      if (cr) {
        try {
          if (typeof cr.reactShow === 'function') cr.reactShow(at);      // Creatures may add a dedicated reaction
          else if (at) {
            // a dry, walkable spot 0.5 m from the fish: beyond it, beside it, else on the player's side (a mat on a dock edge)
            const p = env.playerPos(), dx = at.x - p.x, dz = at.z - p.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
            const w = ctx.world, gy = w?.groundY ? w.groundY(at.x, at.z) : at.y;
            const ok = (x, z) => (!w?.walkable || w.walkable(x, z)) && (!w?.groundY || Math.abs(w.groundY(x, z) - gy) < 0.3);
            const tries = [[ux, uz], [-uz, ux], [uz, -ux], [-ux * 0.6 - uz * 0.8, -uz * 0.6 + ux * 0.8], [-ux * 0.6 + uz * 0.8, -uz * 0.6 - ux * 0.8]];
            const t = tries.find(([a, b]) => ok(at.x + a * 0.5, at.z + b * 0.5));
            if (t) {
              const sx = at.x + t[0] * 0.5, sz = at.z + t[1] * 0.5;
              cr.sitNear?.({ x: sx, y: gy, z: sz }, Math.atan2(at.x - sx, at.z - sz));
            }
          }
        } catch (e) { console.warn('[cat] show', e); }
      }
      env.sfx('cat_meow', { pitch: 1.3, vol: 0.6, delay: 0.6, pos: catPos() });
      env.sfx('cat_meow', { pitch: 1.1, vol: 0.45, delay: 1.5, pos: catPos() });
      if (!c.befriended && c.friend >= need()) befriend();
      else env.toast(gained ? 'sys.cat.show_happy' : 'sys.cat.show_again');
      ctx.save.commit();
      return { gained, friend: c.friend };
    },
    update() {},
  };

  // sit next to the player while fishing
  ctx.bus.on('fishing:cast', () => {
    if (!C().following || !creature()) return;
    const p = env.playerPos();
    const a = env.playerFacing() + Math.PI / 2;
    call('sitNear', { x: p.x + Math.sin(a) * 1.1, y: p.y, z: p.z + Math.cos(a) * 1.1 });
  });
  ctx.bus.on('fishing:catch', e => {
    if (C().following && creature() && !e.junk) env.sfx('cat_meow', { pitch: 1.25, vol: 0.45, delay: 1.2, pos: catPos() });
  });
  // restore state into the creature once everything is loaded
  ctx.bus.on('game:ready', () => {
    if (C().befriended) { call('befriend'); call('follow', !!C().following); }
    const col = S().equip?.collar; if (col) call('setCollar', col);
  });
  return cat;
}
