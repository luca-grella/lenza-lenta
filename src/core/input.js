// Input: keyboard, gamepad and programmatic joystick/action from the UI.
// Edge flags are computed once per frame (at the start of the loop), so every module sees the same edges.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'action', Enter: 'action', NumpadEnter: 'action',
  KeyE: 'interact', KeyB: 'bait', KeyJ: 'journal', KeyM: 'map', Escape: 'menu', KeyI: 'inventory', KeyQ: 'quests',
  ShiftLeft: 'slow', ShiftRight: 'slow',
};
/** Named one-shot buttons readable with input.pressed(name). */
export const BUTTONS = ['action', 'interact', 'bait', 'journal', 'map', 'menu', 'inventory', 'quests'];

/**
 * @param {{bus:any, getYaw:()=>number}} opts getYaw returns the camera yaw (radians) used to rotate the move vector.
 */
export function createInput({ bus, getYaw = () => 0 }) {
  const held = new Map();       // name -> Set(source)
  const pendDown = new Map();   // name -> count
  const pendUp = new Map();
  const edgeDown = new Set(), edgeUp = new Set();
  const keys = new Set();       // physical codes held
  const joy = { x: 0, y: 0 };
  let gpPrev = {};

  const isHeld = n => (held.get(n)?.size || 0) > 0;
  function setHeld(name, source, v) {
    let s = held.get(name);
    if (!s) held.set(name, (s = new Set()));
    const was = s.size > 0;
    if (v) s.add(source); else s.delete(source);
    const now = s.size > 0;
    if (now && !was) pendDown.set(name, (pendDown.get(name) || 0) + 1);
    if (!now && was) pendUp.set(name, (pendUp.get(name) || 0) + 1);
  }

  const input = {
    /** Camera-relative world-space move vector, mag 0..1 (0 when disabled). */
    move: { x: 0, z: 0, mag: 0 },
    /** Raw screen-space move (x right, y up), -1..1. */
    moveScreen: { x: 0, y: 0 },
    /** Edge flags for the main action this frame. held stays true while pressed. */
    action: { down: false, held: false, up: false },
    /** When false (a sheet/dialog is open): move = 0 and action edges are suppressed. pressed() keeps working. */
    enabled: true,
    /** Coarse pointer / touch device. */
    isTouch: (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window,
    /** 'keyboard' | 'touch' | 'gamepad' — last device used. */
    lastDevice: 'keyboard',

    /** One-frame edge for a named button: action, interact, bait, journal, map, menu, inventory, quests. */
    pressed(name) { return edgeDown.has(name); },
    /** One-frame release edge. */
    released(name) { return edgeUp.has(name); },
    /** Currently held. */
    isDown(name) { return isHeld(name); },
    /** Programmatic hold of the action button (UI action button: true on pointerdown, false on pointerup). */
    setAction(v, source = 'ui') { if (v) input.lastDevice = input.isTouch ? 'touch' : input.lastDevice; setHeld('action', source, !!v); },
    /** Programmatic one-shot press of a named button (e.g. a HUD "journal" icon). */
    press(name) { pendDown.set(name, (pendDown.get(name) || 0) + 1); pendUp.set(name, (pendUp.get(name) || 0) + 1); },
    /** UI virtual joystick: x right, y up (screen), each -1..1. Call setJoystick(0,0) on release. */
    setJoystick(x, y) {
      const m = Math.hypot(x, y);
      const k = m > 1 ? 1 / m : 1;
      joy.x = (+x || 0) * k; joy.y = (+y || 0) * k;
      if (m > 0.01) input.lastDevice = 'touch';
    },
    /** Release everything (blur, sheet opening...). */
    clear() {
      for (const [n, s] of held) if (s.size) { s.clear(); pendUp.set(n, (pendUp.get(n) || 0) + 1); }
      keys.clear(); joy.x = joy.y = 0;
    },
    /** Called by core first in every frame (order -1000). */
    update() {
      edgeDown.clear(); edgeUp.clear();
      pollGamepad();
      for (const n of new Set([...pendDown.keys(), ...pendUp.keys()])) {
        const d = pendDown.get(n) || 0, u = pendUp.get(n) || 0;
        if (d > 0) { edgeDown.add(n); pendDown.set(n, 0); } // a tap inside one frame: down now, up next frame
        else if (u > 0) { edgeUp.add(n); pendUp.set(n, 0); }
      }
      for (const n of edgeDown) if (n !== 'action' && BUTTONS.includes(n)) bus?.emit('input:press', { name: n });

      // move vector
      let sx = 0, sy = 0;
      if (Math.hypot(joy.x, joy.y) > 0.04) { sx = joy.x; sy = joy.y; }
      else {
        sx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
        sy = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
        const m = Math.hypot(sx, sy);
        if (m > 0) { const k = (keys.has('slow') ? 0.5 : 1) / m; sx *= k; sy *= k; }
        if (gp.x || gp.y) { sx = gp.x; sy = gp.y; }
      }
      const en = input.enabled;
      input.moveScreen.x = en ? sx : 0; input.moveScreen.y = en ? sy : 0;
      const yaw = getYaw() || 0, c = Math.cos(yaw), s = Math.sin(yaw);
      // screen right = (cos, 0, -sin), screen up = (-sin, 0, -cos)
      const wx = sx * c - sy * s, wz = -sx * s - sy * c;
      const mag = Math.min(1, Math.hypot(sx, sy));
      input.move.x = en ? wx : 0; input.move.z = en ? wz : 0; input.move.mag = en ? mag : 0;

      const a = input.action;
      a.down = en && edgeDown.has('action');
      a.up = edgeUp.has('action');
      a.held = en && (isHeld('action') || a.down);
    },
  };

  // ---- keyboard ----
  const typing = e => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
  window.addEventListener('keydown', e => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = KEYMAP[e.code];
    if (!n) return;
    if (['up', 'down', 'left', 'right', 'action'].includes(n)) e.preventDefault();
    input.lastDevice = 'keyboard';
    if (e.repeat) return;
    keys.add(n);
    if (BUTTONS.includes(n)) setHeld(n, 'kb:' + e.code, true);
  }, { passive: false });
  window.addEventListener('keyup', e => {
    const n = KEYMAP[e.code];
    if (!n) return;
    keys.delete(n);
    if (BUTTONS.includes(n)) setHeld(n, 'kb:' + e.code, false);
  });
  window.addEventListener('blur', () => input.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.clear(); });
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { input.isTouch = true; input.lastDevice = 'touch'; } }, { passive: true });

  // ---- gamepad (standard mapping: A=action, X=interact, Y=bait, Start=menu, Back=map) ----
  const gp = { x: 0, y: 0 };
  const GP_BUTTONS = { 0: 'action', 2: 'interact', 3: 'bait', 9: 'menu', 8: 'map' };
  function pollGamepad() {
    gp.x = gp.y = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find(Boolean);
    if (!p) return;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const m = Math.hypot(ax, ay);
    if (m > 0.18) { const k = Math.min(1, (m - 0.18) / 0.82) / m; gp.x = ax * k; gp.y = -ay * k; input.lastDevice = 'gamepad'; }
    for (const [i, name] of Object.entries(GP_BUTTONS)) {
      const v = !!p.buttons[i]?.pressed;
      if (v !== !!gpPrev[i]) { setHeld(name, 'gp' + i, v); input.lastDevice = 'gamepad'; }
      gpPrev[i] = v;
    }
  }

  return input;
}
