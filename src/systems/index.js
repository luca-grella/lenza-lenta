// Gameplay systems entry point: init(ctx) → ctx.systems
//   { fishing, inventory, economy, shops, quests, dailies, aquarium, cooking, buffs, foraging, boat, home, journal, cat, interact,
//     env, fx }
// One loop callback at ORDER.systems (10) updates them in a fixed order. Every system reads ctx.save.state fresh.
import { createEnv } from './env.js';
import { createFx } from './fx.js';
import { createEconomy } from './economy.js';
import { createInventory } from './inventory.js';
import { createBuffs } from './buffs.js';
import { createJournal } from './journal.js';
import { createShops } from './shops.js';
import { createQuests } from './quests.js';
import { createDailies } from './dailies.js';
import { createAquarium } from './aquarium.js';
import { createCooking } from './cooking.js';
import { createCat } from './cat.js';
import { createHome } from './home.js';
import { createForaging } from './foraging.js';
import { createBoat } from './boat.js';
import { createFishing } from './fishing.js';
import { createInteract } from './interact.js';
import { it, en } from './strings.js';

/** Make sure the save has every sub-object the systems own (old saves, resets, imports). */
function ensureState(s) {
  s.flags ||= {};
  s.stats ||= {};
  s.items ||= {};
  s.owned ||= {};
  if (!Array.isArray(s.basket)) s.basket = [];
  if (!Array.isArray(s.buffs)) s.buffs = [];
  s.journal ||= {};
  s.aquarium ||= {};
  s.quests ||= {};
  s.quests.story ??= 0; s.quests.progress ||= {}; s.quests.done ||= {}; s.quests.offered ||= {}; s.quests.side ||= {};
  if (!Array.isArray(s.quests.dailies)) s.quests.dailies = [];
  s.cooking ||= {}; s.cooking.known ||= {};
  s.home ||= {}; s.home.tier ??= 0; s.home.decor ||= {};
  s.boat ||= {}; s.boat.level ??= 0;
  s.cat ||= {}; s.cat.friend ??= 0;
  s.forage ||= {}; s.forage.picked ||= {}; s.forage.once ||= {};
  s.equip ||= {}; s.equip.bait ||= 'bait_worm';
  if (typeof s.coins !== 'number') s.coins = 0;
  return s;
}

export async function init(ctx) {
  ctx.i18n.addStrings(it, en);
  ensureState(ctx.save.state);
  const env = createEnv(ctx);
  const fx = createFx(ctx);
  const sys = { env, fx };
  ctx.systems = sys; // systems talk to each other through ctx.systems at runtime

  sys.economy = createEconomy(ctx, env);
  sys.inventory = createInventory(ctx, env);
  sys.buffs = createBuffs(ctx, env);
  sys.journal = createJournal(ctx, env);
  sys.shops = createShops(ctx, env);
  sys.quests = createQuests(ctx, env);
  sys.dailies = createDailies(ctx, env);
  sys.aquarium = createAquarium(ctx, env);
  sys.cooking = createCooking(ctx, env);
  sys.cat = createCat(ctx, env);
  sys.home = createHome(ctx, env);
  sys.foraging = createForaging(ctx, env);
  sys.boat = createBoat(ctx, env, fx);
  sys.fishing = createFishing(ctx, env, fx);
  sys.interact = createInteract(ctx, env);

  const order = [sys.buffs, sys.inventory, sys.interact, sys.fishing, sys.boat, sys.foraging, sys.cat, sys.home, sys.dailies, sys.quests];
  ctx.loop.add(function systemsUpdate(dt, t) {
    env.dummy.update(dt);
    for (const s of order) {
      try { s.update?.(dt, t); } catch (e) { if (!s._err) { s._err = true; console.error('[systems] update failed: ' + (e?.stack || e)); } }
    }
    fx.update(dt, t);
  }, ctx.ORDER?.systems ?? 10);

  ctx.bus.on('save:loaded', e => { ensureState(e?.state || ctx.save.state); });
  ctx.bus.on('save:reset', () => ensureState(ctx.save.state));

  // Without the UI module (sandboxes, early integration) show a tiny built-in HUD so the loop stays playable.
  ctx.bus.on('game:ready', async () => {
    if (ctx.ui || ctx.params?.has('nofallback')) return;
    try {
      const { createFallbackUI } = await import('./fallbackUI.js');
      env.fallbackUI = createFallbackUI(ctx, env);
    } catch (e) { console.warn('[systems] fallback UI failed', e); }
  });

  sys.version = 1;
  return sys;
}

export default { init };
