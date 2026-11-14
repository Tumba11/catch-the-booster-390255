/* Chopsticks — simplified flight physics (fan game; numbers are approximate, for fun & learning). */
(function (root) {
  'use strict';
  const G0 = 9.80665, RE = 6371000;

  const ENGINES = [
    { id: 'r2s', name: '24 × Raptor 2', tag: 'BUDGET', count: 24, ring: [3, 9, 12], thrust: 2.30e6, mass: -45, fail: 0.0035,
      pro: 'Cheapest and lightest engine section', con: 'Far less thrust. Check your T/W' },
    { id: 'r2',  name: '33 × Raptor 2', tag: 'FLIGHT-PROVEN', count: 33, ring: [3, 10, 20], thrust: 2.30e6, mass: 0,   fail: 0.0035,
      pro: 'Most reliable option', con: 'Less thrust than Raptor 3' },
    { id: 'r3',  name: '33 × Raptor 3', tag: 'V3 STANDARD',   count: 33, ring: [3, 10, 20], thrust: 2.75e6, mass: -15, fail: 0.006,
      pro: 'More thrust, lighter engines', con: 'Newer design, slightly less proven' },
    { id: 'r3m', name: '39 × Raptor 3', tag: 'MAX ENGINES',   count: 39, ring: [3, 12, 24], thrust: 2.75e6, mass: 30,  fail: 0.008,
      pro: 'Enormous thrust', con: 'Hard on a light stack: high G, high vibration' },
  ];
  const STAGING = [
    { id: 'hot',  name: 'Hot staging', tag: 'CURRENT METHOD', mass: 9, dvLoss: 0, reserveBonus: 0.006, risk: 0.03,
      pro: 'Ship lights its engines before separating: no lost momentum', con: 'Vented interstage adds 9 t; booster dome takes a blast' },
    { id: 'cold', name: 'Cold staging', tag: 'CLASSIC',        mass: 0, dvLoss: 260, reserveBonus: 0, risk: 0,
      pro: 'Lighter, gentle separation', con: 'Coast gap costs the Ship ~260 m/s' },
  ];
  const PAYLOADS = [
    { id: 10, name: '10 × Starlink V3', sats: 10, mass: 22 },
    { id: 26, name: '26 × Starlink V3', sats: 26, mass: 57, tag: 'FLIGHT 15 LOAD' },
    { id: 40, name: '40 × Starlink V3', sats: 40, mass: 88 },
    { id: 60, name: '60 × Starlink V3', sats: 60, mass: 132, tag: 'MAX CAPACITY' },
  ];
  const FINS = [
    { id: 'none', name: 'No grid fins', n: 0, mass: -6, lateral: 0.4, pro: 'Saves 6 t', con: 'Nothing to steer with on the way home' },
    { id: 'two',  name: '2 grid fins', n: 2, mass: -3, lateral: 1.6, pro: 'Saves 3 t', con: 'Steering only works in one axis' },
    { id: 'std',  name: '4 grid fins', n: 4, mass: 0, lateral: 3.0, pro: 'Classic Super Heavy setup', con: 'Standard steering authority' },
    { id: 'v3',   name: '3 large V3 grid fins', n: 3, big: true, mass: 4, lateral: 4.2, pro: '+40% steering authority on landing', con: '+4 t on the booster' },
  ];
  const SHIELDS = [
    { id: 'none',  name: 'No heat shield', mass: -8, ok: false, pro: 'Saves 8 t of tiles', con: 'Bare steel facing reentry plasma' },
    { id: 'thin',  name: 'Thin heat shield', mass: 4, ok: false, pro: 'Light: more ΔV for payload', con: 'Thin margin against reentry heating' },
    { id: 'full',  name: 'Full heat shield', mass: 12, ok: true, pro: 'Proven tile thickness', con: '+12 t on the Ship' },
    { id: 'heavy', name: 'Reinforced shield', mass: 20, ok: true, pro: 'Extra margin; ice-damage proof', con: '+20 t on the Ship (less ΔV)' },
  ];
  const WALLS = [
    { id: 'thin', name: 'Thin tank walls', mass: -25, limit: 34000, pro: 'Saves 25 t', con: 'Lower structural limit at max-Q' },
    { id: 'std',  name: 'Standard walls', mass: 0, limit: 46000, pro: 'Balanced', con: 'Throttle down through max-Q on windy days' },
    { id: 'thick', name: 'Reinforced walls', mass: 30, limit: 56000, pro: 'Shrugs off max-Q loads', con: '+30 t on the booster' },
  ];
  const PROFILES = [
    { id: 'auto', name: 'Auto throttle bucket', pro: 'Flight computer throttles down through max-Q for you', con: 'Plays it safe' },
    { id: 'manual', name: 'Manual throttle', pro: 'You fly the throttle (↓/S). +100 score if you make it', con: 'Your hands, your loads' },
    { id: 'aggressive', name: 'Aggressive: full throttle', pro: 'Locked at 100% through max-Q for max performance', con: 'Maximum aerodynamic load' },
  ];

  const BOOSTER_DRY = 275, BOOSTER_PROP = 3650, SHIP_DRY = 150, SHIP_PROP = 1600; // tonnes (approximate)
  const BOOSTBACK_COST = 0.06, LANDING_IDEAL = 0.04; // fraction of full booster load

  function vehicle(cfg) {
    const e = ENGINES.find(x => x.id === cfg.engine), s = STAGING.find(x => x.id === cfg.staging);
    const p = PAYLOADS.find(x => x.id === cfg.payload), f = FINS.find(x => x.id === cfg.fins), h = SHIELDS.find(x => x.id === cfg.shield);
    const wl = WALLS.find(x => x.id === (cfg.walls || 'std')), pf = PROFILES.find(x => x.id === (cfg.profile || 'auto'));
    const boosterDry = BOOSTER_DRY + e.mass + f.mass + s.mass + wl.mass;
    const boosterProp = BOOSTER_PROP * cfg.fuel;
    const shipDry = SHIP_DRY + h.mass;
    const upper = shipDry + SHIP_PROP + p.mass;
    const liftoff = boosterDry + boosterProp + upper;
    const thrustMult = cfg.thrustMult || 1;
    const twr = (e.count * e.thrust * thrustMult) / (liftoff * 1000 * G0);
    return { e, s, p, f, h, wl, pf, limit: wl.limit, boosterDry, boosterProp, shipDry, upper, liftoff, twr, thrustMult };
  }

  function shipDV(v) { // ship's own delta-v (rocket equation), Isp ~370 s average
    return 370 * G0 * Math.log((v.shipDry + SHIP_PROP + v.p.mass) / (v.shipDry + v.p.mass)) - v.s.dvLoss;
  }
  function dvNeeded(st) { // rough: orbital speed minus what the booster already gave, plus losses
    const vx = st.vx, vy = Math.max(0, st.vy);
    return 7800 + 900 - 0.95 * vx - 0.25 * vy;
  }

  function newAscent(v) {
    return { t: 0, h: 0, x: 0, vx: 0, vy: 0, prop: v.boosterProp, enginesOut: 0, throttle: 1, q: 0, maxQ: 0, load: 0, stress: 0, pitch: 0, mach: 0 };
  }
  // one physics step (dt in real flight seconds). cmdThrottle 0.6..1.
  function stepAscent(st, v, dt, cmdThrottle, shearKt) {
    const rho = 1.225 * Math.exp(-st.h / 8500);
    const speed = Math.hypot(st.vx, st.vy);
    st.q = 0.5 * rho * speed * speed;
    st.maxQ = Math.max(st.maxQ, st.q);
    const shearFactor = 1 + (shearKt || 0) / 200 * Math.exp(-Math.pow((st.h - 11000) / 6000, 2));
    st.load = st.q * shearFactor;
    st.throttle += Math.max(-0.6 * dt, Math.min(0.6 * dt, cmdThrottle - st.throttle));
    st.pitch = st.t < 10 ? 0 : Math.min(72, (st.t - 10) * 0.6) * Math.PI / 180;
    const pAtm = Math.exp(-st.h / 7000);
    const active = v.e.count - st.enginesOut;
    const F = st.prop > 0 ? active * v.e.thrust * v.thrustMult * st.throttle * (1 + 0.1 * (1 - pAtm)) : 0;
    const isp = 330 + 25 * (1 - pAtm);
    const mdot = F / (isp * G0);
    st.prop = Math.max(0, st.prop - mdot * dt / 1000);
    const m = (v.boosterDry + st.prop + v.upper) * 1000;
    const drag = st.q * 0.45 * 63.6;
    const ux = speed > 1 ? st.vx / speed : 0, uy = speed > 1 ? st.vy / speed : 1;
    const g = G0 * Math.pow(RE / (RE + st.h), 2) - st.vx * st.vx / (RE + st.h);
    const ax = (F * Math.sin(st.pitch) - drag * ux) / m;
    let ay = (F * Math.cos(st.pitch) - drag * uy) / m - g;
    if (st.h <= 0 && ay < 0 && st.vy <= 0) ay = 0;
    st.vx += ax * dt; st.vy += ay * dt;
    st.h = Math.max(0, st.h + st.vy * dt); st.x += st.vx * dt;
    st.mach = speed / (rho > 0.4 ? 340 : 295);
    st.accel = Math.hypot(ax, ay + g) / G0;
    st.t += dt;
    return st;
  }
  function reserveFrac(st) { return st.prop / BOOSTER_PROP; }

  // headless prediction with an ideal pilot (throttle bucket + stage at ideal reserve)
  function predict(cfg, shearKt) {
    const v = vehicle(cfg); const st = newAscent(v); const target = BOOSTBACK_COST + LANDING_IDEAL - v.s.reserveBonus;
    let bucket = false;
    for (let i = 0; i < 4000; i++) {
      const cmd = v.pf.id === 'aggressive' && st.t < 100 ? 1 : st.load > Math.min(31000, v.limit * 0.75) ? 0.62 : 1; if (cmd < 1) bucket = true;
      stepAscent(st, v, 0.1, cmd, shearKt || 0);
      if (reserveFrac(st) <= target + 0.005 || st.prop <= 0) break;
    }
    const margin = shipDV(v) - dvNeeded(st);
    return { v, st, margin, reserve: reserveFrac(st), target, bucket };
  }

  const api = { G0, ENGINES, STAGING, PAYLOADS, FINS, SHIELDS, WALLS, PROFILES, BOOSTER_PROP, BOOSTBACK_COST, LANDING_IDEAL,
    vehicle, shipDV, dvNeeded, newAscent, stepAscent, reserveFrac, predict };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Physics = api;
})(typeof window !== 'undefined' ? window : globalThis);
