// Reel minigame model: pure JS (no three.js, no ctx) so it can be simulated in node for balance.
// The fish alternates rest → warn (telegraph) → run (or jump) → rest. Holding reels the fish in; holding while it
// runs builds tension; over the line strength for longer than line.grace seconds the line snaps. No time limit.

export const BEHAVIOR_DEFAULTS = {
  calm:   { pull: 0.35, burst: 0.05, rest: [2.2, 3.5], jump: 0,    swerve: 0.1, stamina: 7 },
  darter: { pull: 0.55, burst: 0.22, rest: [0.8, 1.6], jump: 0,    swerve: 0.3, stamina: 8 },
  heavy:  { pull: 0.75, burst: 0.08, rest: [1.6, 2.6], jump: 0,    swerve: 0.1, stamina: 12 },
  jumper: { pull: 0.5,  burst: 0.12, rest: [1.2, 2.2], jump: 0.25, swerve: 0.2, stamina: 9 },
  zigzag: { pull: 0.5,  burst: 0.15, rest: [0.9, 1.8], jump: 0,    swerve: 0.8, stamina: 9 },
};
// Per behaviour: run duration, telegraph duration, lateral wobble speed.
const STYLE = {
  calm:   { run: [0.7, 1.1], warn: 0.75, wob: 0.8 },
  darter: { run: [0.45, 0.85], warn: 0.42, wob: 2.4 },
  heavy:  { run: [1.5, 2.4], warn: 0.7, wob: 0.6 },
  jumper: { run: [0.8, 1.3], warn: 0.55, wob: 1.4 },
  zigzag: { run: [0.9, 1.5], warn: 0.55, wob: 2.6 },
};

/**
 * Derive minigame parameters from species + gear + buffs.
 * @param {{behavior:string, difficulty:number, junk?:boolean, preset?:object,
 *   rod?:{power:number, control:number}, reel?:{tolerance:number, recovery:number, speed:number},
 *   line?:{strength:number, grace:number}, calm?:number, reelBuff?:number}} o
 */
export function reelParams(o) {
  const beh = BEHAVIOR_DEFAULTS[o.behavior] ? o.behavior : 'calm';
  const B = { ...BEHAVIOR_DEFAULTS[beh], ...(o.preset || {}) };
  const rod = { power: 1, control: 1, ...(o.rod || {}) };
  const reel = { tolerance: 1, recovery: 1, speed: 1, ...(o.reel || {}) };
  const line = { strength: 1, grace: 1.2, ...(o.line || {}) };
  const d = Math.max(0, Math.min(1, o.difficulty ?? 0.3));
  const calm = o.calm || 1, reelBuff = o.reelBuff || 1;
  if (o.junk) {
    return { behavior: 'calm', junk: true, B: { ...B, burst: 0, rest: [99, 99], jump: 0, swerve: 0.05 }, style: STYLE.calm,
      pullMax: 0.08, S: 2.4 / (reel.speed * reelBuff), strength: line.strength, grace: line.grace, recovery: 0.7 * reel.recovery, swerve: 0.05, difficulty: 0, restEffort: 0.1 };
  }
  return {
    behavior: beh, junk: false, B, style: STYLE[beh], difficulty: d,
    pullMax: (B.pull * (0.6 + d)) / (rod.power * reel.tolerance * calm),
    S: (B.stamina * (0.42 + 0.72 * d)) / (Math.sqrt(rod.power) * reel.speed * reelBuff),
    strength: line.strength,
    grace: line.grace,
    recovery: 0.7 * reel.recovery,
    swerve: B.swerve / rod.control,
    restEffort: 0.12 + 0.24 * d,  // hard fish keep pulling while resting: pulse the reel
  };
}

/**
 * One fight. step(dt, holding) advances it and returns this frame's events
 * ('warn' | 'run' | 'jump' | 'splashdown' | 'snap' | 'landed').
 */
export function createReelSim(p, rand = Math.random) {
  const range = (a, b) => a + (b - a) * rand();
  const sim = {
    p,
    progress: 0,      // 0..1, 1 = landed
    tension: 0,       // raw; tensionN = tension / strength
    over: 0,          // seconds spent over the strength
    phase: 'rest',
    phaseT: range(0.9, 1.6),  // a short calm moment right after the strike
    effort: p.restEffort, // fish effort 0..1.3
    lateral: 0, latSpeed: 0,
    t: 0, done: false, result: null,
    runs: 0, jumps: 0,
    get tensionN() { return sim.tension / p.strength; },
    /** Danger 0..1 for UI tint: how close the line is to snapping. */
    get danger() { return Math.max(0, Math.min(1, (sim.tension / p.strength - 0.6) / 0.4 * 0.6 + sim.over / p.grace * 0.4)); },
    step(dt, holding) {
      const ev = [];
      if (sim.done) return ev;
      sim.t += dt;
      const B = p.B, st = p.style;
      sim.phaseT -= dt;
      // ---- fish phases
      if (sim.phase === 'rest') {
        sim.effort += (p.restEffort + 0.05 * Math.sin(sim.t * 3) - sim.effort) * Math.min(1, dt * 4);
        if (sim.phaseT <= 0 || rand() < B.burst * dt) {
          sim.phase = 'warn';
          sim.phaseT = sim.phaseT <= 0 ? st.warn : st.warn * 0.7;
          ev.push('warn');
        }
      } else if (sim.phase === 'warn') {
        sim.effort += (0.42 - sim.effort) * Math.min(1, dt * 5);
        if (sim.phaseT <= 0) {
          sim.runs++;
          if (B.jump > 0 && rand() < Math.min(0.85, B.jump * 2.6)) { sim.phase = 'jump'; sim.phaseT = 1.0; sim.jumps++; ev.push('jump'); }
          else { sim.phase = 'run'; sim.phaseT = range(st.run[0], st.run[1]); ev.push('run'); }
        }
      } else if (sim.phase === 'run' || sim.phase === 'jump') {
        const tired = 1 - 0.32 * sim.progress;
        const target = (sim.phase === 'jump' ? 1.25 : 1) * tired;
        sim.effort += (target - sim.effort) * Math.min(1, dt * 7);
        if (sim.phaseT <= 0) {
          if (sim.phase === 'jump') ev.push('splashdown');
          sim.phase = 'rest';
          sim.phaseT = range(B.rest[0], B.rest[1]) * (1 + 0.45 * sim.progress);
        }
      }
      // ---- lateral wobble (zigzag fish swerve hard while running)
      const active = sim.phase === 'run' || sim.phase === 'warn' ? 1 : 0.25;
      const prevL = sim.lateral;
      sim.lateral = Math.sin(sim.t * st.wob + Math.sin(sim.t * 0.7) * 1.3) * Math.min(1, p.swerve) * active;
      sim.latSpeed = (sim.lateral - prevL) / Math.max(1e-4, dt);
      // ---- tension & progress
      const pull = sim.effort * p.pullMax;
      if (holding) {
        sim.tension += (pull * 2.0 + Math.abs(sim.latSpeed) * p.swerve * 0.12 - 0.2) * dt;
        sim.progress += ((1 - 0.8 * Math.min(1, sim.effort)) / p.S) * dt;
      } else {
        sim.tension -= p.recovery * dt;
        if (sim.effort > 0.3) sim.progress -= ((sim.effort * 0.3) / p.S) * dt;
      }
      sim.tension = Math.max(0, Math.min(p.strength * 1.5, sim.tension));
      sim.progress = Math.max(0, Math.min(1, sim.progress));
      if (sim.tension > p.strength) sim.over += dt; else sim.over = Math.max(0, sim.over - dt * 1.5);
      if (sim.over >= p.grace) { sim.done = true; sim.result = 'snap'; ev.push('snap'); }
      else if (sim.progress >= 1) { sim.done = true; sim.result = 'landed'; ev.push('landed'); }
      return ev;
    },
  };
  return sim;
}

/** A simple player model for balance tests: reacts to runs and tension after `reaction` seconds. */
export function botPolicy({ reaction = 0.3, threshold = 0.8, careless = 0 } = {}, rand = Math.random) {
  const hist = [];
  return (sim, dt) => {
    hist.push({ t: sim.t, running: sim.phase === 'run' || sim.phase === 'jump', tn: sim.tensionN });
    while (hist.length > 2 && hist[1].t <= sim.t - reaction) hist.shift();
    const seen = hist[0];
    if (careless && rand() < careless * dt) return true;
    return !(seen.running || seen.tn > threshold);
  };
}

/** Run one fight to the end with a policy → {result, time}. */
export function simulateFight(params, policy, rand = Math.random, dt = 1 / 30, maxT = 120) {
  const sim = createReelSim(params, rand);
  while (!sim.done && sim.t < maxT) sim.step(dt, policy(sim, dt));
  return { result: sim.result || 'timeout', time: sim.t, runs: sim.runs };
}
