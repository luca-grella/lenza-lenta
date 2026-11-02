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
  /** Walk next to the cat. pet: use the cat's own petting spot. Resolves true when there (or close enough). */
  async function approach(forPet) {
    const cr = creature(), o = cr?.object;
    if (!o) return false;
    const p = env.playerPos();
    let spot = null;
    if (forPet) { try { spot = cr.approachForPet?.({ x: p.x, z: p.z }) || null; } catch (e) { console.warn('[cat] approachForPet', e); } }
    if (!spot || spot.ok === false) {
      // fallback: 0.85 m from the cat, on the player's side
      const dx = p.x - o.position.x, dz = p.z - o.position.z, d = Math.hypot(dx, dz) || 1;
      spot = { standPos: { x: o.position.x + dx / d * 0.85, z: o.position.z + dz / d * 0.85 }, facing: Math.atan2(-dx, -dz), tolerance: 0.25 };
    }
    approaching = true;
    let ok = true;
    if (Math.hypot(spot.standPos.x - p.x, spot.standPos.z - p.z) > (spot.tolerance ?? 0.2)) {
      ok = await env.walkPlayerTo(spot.standPos.x, spot.standPos.z, { tolerance: Math.max(0.15, spot.tolerance ?? 0.2), timeout: 5 });
    }
    approaching = false;
    // close enough counts: the cat does the last few cm itself
    const q = env.playerPos();
    const near = Math.hypot(o.position.x - q.x, o.position.z - q.z) < 1.3;
    if (ok || near) { if (Number.isFinite(spot.facing)) env.face(spot.facing); return true; }
    if (forPet) call('cancelPet');
    return false;
  }

  function catPos() {
    const o = creature()?.object;
    return o ? { x: o.position.x, z: o.position.z } : undefined;
  }

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
    /** Kitty treat dish. */
    giveTreat(n = 1) { env.play('crouch_pick', { loop: false }); gain(n + 1, 'treat'); return true; },
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
