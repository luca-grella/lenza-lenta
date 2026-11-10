// Lenza Lenta — boot. Each later module is loaded with a dynamic import inside try/catch, so the
// game boots at any stage of development (missing or broken modules log a warning and are skipped).
import { createCore } from './core/index.js';
import { createCarriedLantern } from './integration/lantern.js';

const isMissing = e => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|404/i.test(String(e?.message || e));

async function load(path) {
  try { return await import(path); }
  catch (e) {
    if (isMissing(e)) console.warn(`[boot] ${path} not present yet — skipped`);
    else console.warn(`[boot] ${path} failed to load — skipped`, e);
    return null;
  }
}

/** Import `path` and call its init(ctx) (named export, default.init, or default function). */
async function initModule(name, path, ctx) {
  const mod = await load(path);
  if (!mod) return null;
  const init = mod.init || mod.default?.init || (typeof mod.default === 'function' ? mod.default : null);
  if (!init) { console.warn(`[boot] ${path} has no init(ctx) export — skipped`); return null; }
  try {
    const api = await init(ctx);
    return api ?? null;
  } catch (e) {
    console.warn(`[boot] ${name}.init threw — continuing without it`, e);
    return null;
  }
}

function setBootMessage(text) { const el = document.getElementById('boot-msg'); if (el) el.textContent = text; }
function hideBoot() {
  const el = document.getElementById('boot');
  if (!el) return;
  el.style.transition = 'opacity .9s ease';
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 1000);
}

/** Minimal touch controls used only while the UI module doesn't exist yet (drag left = walk, tap right = action). */
function devTouchFallback(ctx) {
  const c = ctx.renderer.domElement;
  let id = null, sx = 0, sy = 0;
  c.addEventListener('pointerdown', e => {
    if (ctx.ui) return;
    if (e.clientX < innerWidth * 0.5 && id === null) { id = e.pointerId; sx = e.clientX; sy = e.clientY; c.setPointerCapture(id); }
    else ctx.input.setAction(true, 'devtouch');
  });
  c.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const R = 60; ctx.input.setJoystick((e.clientX - sx) / R, -(e.clientY - sy) / R);
  });
  const end = e => { if (e.pointerId === id) { id = null; ctx.input.setJoystick(0, 0); } else ctx.input.setAction(false, 'devtouch'); };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}

/** Trees and palms between the camera and the player dither away (World's foliage materials read these uniforms). */
function occluderFade(ctx) {
  const U = ctx.world?.materials?.U;
  if (!U) return;
  ctx.loop.add(() => {
    if (!U.uOccPos) return;
    const o = ctx.player?.object;
    if (!o || !o.visible) { U.uOccOn.value = 0; return; }
    o.getWorldPosition(U.uOccPos.value);
    U.uOccPos.value.y += 1.1;
    U.uOccCam.value.copy(ctx.camera.position);
    U.uOccOn.value = ctx.cameraRig?.mode === 'cinematic' ? 0 : 1;
  }, (ctx.ORDER?.camera ?? 40) + 1);
}

/** Small event bridges between areas whose names did not line up. */
function glue(ctx) {
  const { bus } = ctx;
  // UI dialog closed → villagers stop their talk loop right away (npc.js listens to 'dialog:close')
  bus.on('ui:dialog', e => { if (e && e.open === false) bus.emit('dialog:close', { npcId: e.npcId }); });
  // a dolphin pod far out at sea gets a quiet toast
  let lastDolphins = -1e9;
  bus.on('creatures:dolphins', () => {
    if (ctx.loop.t - lastDolphins < 120) return;
    lastDolphins = ctx.loop.t;
    ctx.ui?.toast?.('creatures.dolphins', null, { icon: 'fish' });
  });
}

async function boot() {
  const ctx = await createCore({ canvasParent: document.getElementById('game') || document.body });
  setBootMessage(ctx.i18n.t('core.loading'));

  // Content: data + strings
  const dataMod = await load('./data/index.js');
  if (dataMod) {
    try {
      if (typeof dataMod.loadData === 'function') await dataMod.loadData(ctx);
      else if (dataMod.default && typeof dataMod.default === 'object') ctx.data = dataMod.default;
    } catch (e) { console.warn('[boot] loadData threw — continuing', e); }
  }
  ctx.data = ctx.data || {};
  const [itMod, enMod] = await Promise.all([load('./i18n/it.js'), load('./i18n/en.js')]);
  if (itMod || enMod) ctx.i18n.addStrings(itMod?.default || {}, enMod?.default || {});

  // World (or a placeholder island until it exists)
  ctx.world = await initModule('world', './world/index.js', ctx);
  if (!ctx.world) {
    ctx.createTestStage({ island: true, dummy: true });
    console.info('[boot] World not available: showing the placeholder island');
  }

  ctx.fishModels = await initModule('fishModels', './actors/fishModels.js', ctx);
  ctx.player = await initModule('player', './actors/player.js', ctx);
  if (ctx.player?.object) {
    if (ctx.stage?.dummy) ctx.stage.dummy.visible = false;
    if (!ctx.cameraRig.followed || ctx.cameraRig.followed === ctx.stage?.dummy) ctx.cameraRig.follow(ctx.player.object);
    ctx.cameraRig.snap();
  }
  ctx.npcs = await initModule('npcs', './actors/npc.js', ctx);
  ctx.creatures = await initModule('creatures', './actors/creatures/index.js', ctx);
  ctx.systems = await initModule('systems', './systems/index.js', ctx);
  ctx.ui = await initModule('ui', './ui/index.js', ctx);
  if (!ctx.ui) devTouchFallback(ctx);
  glue(ctx);
  occluderFade(ctx);
  try { ctx.lantern = createCarriedLantern(ctx); } catch (e) { console.warn('[boot] carried lantern failed', e); }

  ctx.bus.emit('save:loaded', { state: ctx.save.state });
  ctx.loop.start();
  ctx.loop.render();
  hideBoot();
  ctx.bus.emit('game:ready', { ctx });
}

boot().catch(e => {
  console.error('[boot] fatal', e);
  setBootMessage(String(e?.message || e));
});
