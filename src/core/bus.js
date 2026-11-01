// Tiny event bus. Listener errors are caught and logged so one module cannot break another.

/**
 * @returns {{on:(evt:string, fn:Function)=>Function, once:(evt:string, fn:Function)=>Function,
 *   off:(evt:string, fn:Function)=>void, emit:(evt:string, payload?:any)=>void, log:boolean}}
 * Use evt '*' to listen to everything: fn(payload, evt).
 */
export function createBus() {
  const map = new Map();
  const bus = {
    log: false,
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => bus.off(evt, fn);
    },
    once(evt, fn) {
      const off = bus.on(evt, p => { off(); fn(p); });
      return off;
    },
    off(evt, fn) { map.get(evt)?.delete(fn); },
    emit(evt, payload) {
      if (bus.log) console.debug('[bus]', evt, payload ?? '');
      const call = (fn, p, e) => { try { fn(p, e); } catch (err) { console.error(`[bus] listener for "${evt}" threw`, err); } };
      const set = map.get(evt);
      if (set) for (const fn of [...set]) call(fn, payload, evt);
      const all = map.get('*');
      if (all) for (const fn of [...all]) call(fn, payload, evt);
    },
  };
  return bus;
}
