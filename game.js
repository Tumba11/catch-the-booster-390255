/* Chopsticks — an unofficial SpaceX fan game. Not affiliated with or endorsed by SpaceX. */
(() => {
'use strict';
const P = window.Physics;
const qs = new URLSearchParams(location.search);
const DEMO = qs.get('demo') === '1';
const CAPTURE = qs.get('capture') === '1';
const START = qs.get('start') || '';
let seed = parseInt(qs.get('seed') || '', 10) || (DEMO ? 1337 : (Date.now() % 1e9));
function rng() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const $ = s => document.querySelector(s);
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
if (CAPTURE) document.body.classList.add('capture');
const SND = window.GameAudio || { play() {}, engine() {}, setMuted() {}, muted: false, startLog() {} };
const FEATURE_WAVEOFF = false;   // "catch called off, ditch in the Gulf" is parked for now (Tobias: hold off)
const GAME_URL = 'https://catch-the-booster-390255.onrender.com';  // public link, used by the share button
const LEADERBOARD_URL = null;    // hook for a future global leaderboard API (POST {name, score, ...}, GET top 20)
const TOUCH = qs.get('touch') === '1' || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
if (TOUCH) document.body.classList.add('touch');

// ---------------------------------------------------------------- DATA
const MISSIONS = [
  { id: 'f15', name: 'FLIGHT 15', full: 'Starship Flight 15', date: 'NOV 13, 2026', site: 'Starbase, Texas', badge: 'FEATURED · TODAY',
    desc: 'Real life, Nov 13, 2026: Starship reached orbit and deployed 26 Starlink V3 satellites, but the Super Heavy catch was called off and Booster 22 diverted to the Gulf. Your turn: make the catch.',
    fixedWx: { wind: 14, shear: 48, clouds: 'Scattered cumulus', lightning: false, temp: 71, sea: 4 }, payload: 26 },
  { id: 'free', name: 'FREE FLIGHT', full: 'Free Flight', date: 'ANY DAY', site: 'Starbase, Texas', badge: 'RANDOM WEATHER',
    desc: 'Random weather, your rules. Gusty days, thunderstorms and cold fronts all show up. Read the briefing carefully.', fixedWx: null },
];
const ROLES = [
  { id: 'fd', title: 'FLIGHT DIRECTOR', opts: [
    { id: 'ava', name: 'Ava Reyes', trait: 'Steady Hand', desc: 'Wider stage-separation sweet spot and one extra scrub day.' },
    { id: 'marcus', name: 'Marcus Lee', trait: 'Go-Fever Skeptic', desc: 'Tells you the real odds when you risk it, and cuts weather-violation risk by 30%.' } ] },
  { id: 'prop', title: 'PROPULSION LEAD', opts: [
    { id: 'priya', name: 'Priya Nair', trait: 'Engine Whisperer', desc: 'Halves the chance of an engine-out.' },
    { id: 'diego', name: 'Diego Alvarez', trait: 'Performance Tuner', desc: '+3% thrust on every Raptor, but +30% engine-out risk.' } ] },
  { id: 'wx', title: 'WEATHER OFFICER', opts: [
    { id: 'kenji', name: 'Kenji Mori', trait: 'Forecast Pro', desc: 'Exact readings from weather-balloon soundings.' },
    { id: 'sam', name: 'Sam Okafor', trait: 'Fast Turnaround', desc: 'Scrubs cost no score, but readings are ± estimates.' } ] },
  { id: 'rec', title: 'RECOVERY / LANDING LEAD', opts: [
    { id: 'lena', name: 'Lena Brooks', trait: 'Catch Specialist', desc: 'Catch window 30% wider.' },
    { id: 'omar', name: 'Omar Haddad', trait: 'Fuel Miser', desc: '+15% landing propellant.' },
    { id: 'jules', name: 'Jules Park', trait: 'Ignition Caller', desc: 'Adds a seconds-to-burn countdown on the burn line.' } ] },
];
const TIPS = {
  build: [
    'Thrust-to-weight (T/W) above 1 is needed to lift off. Around 1.5 gets you off the pad briskly without crushing loads at max-Q.',
    'Every kilogram of payload costs the Ship delta-v. The rocket equation (Tsiolkovsky, 1903) is merciless: ΔV = Isp · g₀ · ln(m₀ / m₁).',
    'Raptor engines burn liquid methane and liquid oxygen ("methalox"). Methane burns clean, which helps with reuse.',
    'A returning booster must keep propellant for a boostback burn and a landing burn. Reusability costs payload.',
  ],
  crew: [
    'Real launch teams run a "poll": every console answers GO or NO-GO before the launch director clears the vehicle.',
    'Weather officers release balloons before launch to measure winds high above the pad. The surface can be calm while it\'s stormy aloft.',
  ],
  weather: [
    'Upper-level wind shear adds sideways load right around max-Q, when the air is still thick and the rocket is moving fast.',
    'Rockets can trigger their own lightning: the exhaust plume acts like a long conductor through charged clouds.',
    'Scrubbing is not failure. Waiting a day is cheaper than a rocket.',
  ],
};
const LESSONS = {
  maxq: { head: 'STRUCTURAL FAILURE AT MAX-Q', what: 'Aerodynamic load passed the structural limit as the rocket punched through thick air at high speed.',
    better: 'Throttle down (↓ / S) as the load gauge climbs toward the red line, then back up after max-Q. Strong upper-level shear makes loads spike higher.',
    fact: 'Real rockets "throttle bucket" through max-Q, the moment of peak aerodynamic pressure, usually about a minute after liftoff.' },
  engines: { head: 'TOO MANY ENGINES LOST', what: 'Several Raptors shut down and the remaining engines could no longer carry the stack to staging.',
    better: 'Pick flight-proven engines or the Engine Whisperer. Fewer, more reliable engines can beat raw thrust.',
    fact: 'In 2012 a Falcon 9 lost one of its nine engines on the CRS-1 mission and still delivered Dragon to orbit. Engine-out tolerance is why big boosters use many engines.' },
  lightning: { head: 'TRIGGERED LIGHTNING STRIKE', what: 'The vehicle flew into charged clouds and triggered a lightning strike that knocked out flight computers.',
    better: 'Lightning within 10 nautical miles is a hard NO-GO. Scrub and try the next day.',
    fact: 'Apollo 12 was struck by lightning twice during launch in November 1969. Strict lightning rules have kept rockets away from charged clouds since.' },
  boostback: { head: 'NOT ENOUGH PROPELLANT TO COME HOME', what: 'The booster burned so long that it did not have enough propellant for the boostback burn.',
    better: 'Stage earlier, when BOOSTER FUEL is inside the green STAGE WINDOW (the STAGE button pulses green).',
    fact: 'Booster recovery means saving propellant for a boostback burn and a landing burn. That reserve is the price of reuse.' },
  hotstage: { head: 'HOT-STAGING DAMAGE', what: 'The Ship\'s engine plume damaged the booster\'s top dome at separation, and its engines failed to relight for boostback.',
    better: 'Hot staging is worth it, but it carries some risk. Cold staging is gentler and costs the Ship some ΔV.',
    fact: 'Starship switched to hot staging on Flight 2 in November 2023. The Ship lights its engines while still attached, behind a vented interstage.' },
  toohot: { head: 'LANDING BURN STARTED TOO LATE', what: 'The booster reached the chopsticks too fast for the arms to absorb.',
    better: 'Light the landing burn earlier (↑ / W). Aim to arrive at the arms under the catch-speed limit shown on the HUD.',
    fact: 'Super Heavy can\'t really hover: at minimum throttle it barely holds itself up. Recovery is a precisely timed "hoverslam" that reaches zero speed at the catch point.' },
  never: { head: 'LANDING BURN NEVER LIT', what: 'The engines never relit for landing, so the booster fell at full speed.',
    better: 'Light the landing burn with THROTTLE + (↑ / W) when the booster reaches the BURN LINE.',
    fact: 'After separation a booster falls at hundreds of km/h. Only the landing burn slows it to a gentle catch.' },
  offcenter: { head: 'MISSED THE CHOPSTICKS', what: 'The booster arrived off-center and struck the arms instead of settling between them.',
    better: 'Steer with ← / → early, while the booster is high. Small corrections far up beat big ones near the tower.',
    fact: 'Grid fins steer the booster through the atmosphere. Falcon 9 first flew them in 2015.' },
  sideways: { head: 'DRIFTING SIDEWAYS AT CONTACT', what: 'The booster was sliding sideways too fast when it met the arms.',
    better: 'Null your horizontal speed (H-SPD) before the final drop. Counter the wind with gentle steering.',
    fact: 'Ground winds push a descending booster around. Launch weather rules cover recovery winds as well as launch winds.' },
  missed: { head: 'MISSED THE TOWER', what: 'The booster came down well away from the tower and had no legs to stand on.',
    better: 'Line up with the tower early. The HUD offset should read near 0 m before the last few hundred meters.',
    fact: 'Super Heavy has no landing legs. Catching it with the tower saves mass and lets the booster be reflown faster.' },
  fuel: { head: 'PROPELLANT DEPLETED', what: 'The landing engines ran dry before the booster reached the arms.',
    better: 'Stage a little earlier for more landing propellant, and avoid long, slow burns high above the tower.',
    fact: 'Every second of hovering burns propellant that could have carried payload. Efficient landings are short and hard.' },
};
const PART_LABEL = { engine: 'ENGINES', fuel: 'PROPELLANT LOAD', staging: 'STAGE SEPARATION', payload: 'PAYLOAD', fins: 'GRID FINS', shield: 'HEAT SHIELD', walls: 'TANK WALLS', profile: 'THROTTLE PROFILE' };
const BUILD_LESSONS = {
  twr: (c, v) => ({ parts: ['engine', 'fuel', 'payload'], head: v.twr < 1 ? 'TOO HEAVY TO LEAVE THE PAD' : 'TOO SLOW: HIT THE TOWER',
    what: `Your ${v.e.name} stack weighed ${fmt(v.liftoff)} t, for a liftoff thrust-to-weight of only ${v.twr.toFixed(2)}. ${v.twr < 1 ? 'It never left the launch mount, and the engines cooked the pad until something gave.' : 'It crawled off the mount so slowly that the wind pushed it into the tower.'}`,
    better: 'Aim for a liftoff T/W of roughly 1.3 to 1.7. Use more engines, load less propellant, or carry a lighter payload.',
    fact: 'Super Heavy V3\'s 33 Raptor 3 engines produce more than 18 million pounds of thrust at liftoff.' }),
  cascade: (c, v) => ({ parts: ['engine', 'fuel', 'payload'], head: 'ENGINE-OUT CASCADE',
    what: `Your ${v.e.name} on a light stack (${Math.round(c.fuel * 100)}% propellant, ${v.p.sats} satellites) gave a liftoff T/W of ${v.twr.toFixed(2)}. The violent G-load and vibration shook engines loose one after another.`,
    better: 'Match engines to mass. Keep liftoff T/W under about 2: fewer engines, more propellant, or more payload.',
    fact: 'The Soviet N1 moon rocket had 30 first-stage engines and failed on all four launches (1969 to 1972), with engine problems spreading from one engine to others.' }),
  buckle: (c, v) => ({ parts: ['walls', 'profile'], head: 'BUCKLED AT MAX-Q',
    what: `Your thin tank walls are only rated to ${fmt(v.limit / 1000)} kPa, and the ${v.pf.id === 'aggressive' ? 'aggressive full-throttle' : v.pf.name.toLowerCase()} profile kept full power through max-Q. The stack folded at the interstage.`,
    better: 'Use standard or reinforced walls, or keep thin walls and let the auto throttle bucket ease off through max-Q.',
    fact: 'Starship is built from stainless steel, which gets stronger at the super-cold temperatures of its liquid methane and oxygen.' }),
  fins: (c, v) => ({ parts: ['fins'], head: 'TUMBLED ON BOOSTBACK',
    what: `Your ${v.f.n === 0 ? 'fin-less' : '2-fin'} booster couldn't steer back. It started to tumble during the boostback flip and broke apart.`,
    better: 'Fit at least 3 grid fins: 4 standard fins, or 3 large V3 fins.',
    fact: 'Super Heavy flew home on 4 grid fins until V3, which uses 3 fins that are each 50% larger and also serve as catch points for the tower.' }),
  heat: (c, v) => ({ parts: ['shield'], head: 'SHIP BURNED UP ON REENTRY',
    what: `Your Ship flew with ${v.h.id === 'none' ? 'no heat shield' : 'a thin heat shield'}. Reentry plasma burned through the belly.`,
    better: 'Use the full or reinforced heat shield. The mass is worth it.',
    fact: 'Starship\'s belly is covered in roughly 18,000 hexagonal heat-shield tiles to survive reentry plasma.' }),
  dry: (c, v) => ({ parts: ['payload', 'fuel'], head: 'RAN DRY BEFORE THE LANDING BURN',
    what: `${v.p.sats} satellites on ${Math.round(c.fuel * 100)}% propellant${v.s.id === 'cold' ? ' with cold staging' : ''} needed more ΔV than the stack had. The flight computer kept the booster burning to save the Ship and spent the landing reserve. Its engines sputtered out before the landing burn.`,
    better: 'Carry fewer satellites or load more propellant. The build screen\'s Ship ΔV margin should be positive.',
    fact: 'Reuse costs payload: a recovered booster has to save propellant for its boostback and landing burns.' }),
};
function buildFlaws(cfg) {
  const v = P.vehicle(cfg), pr = P.predict(cfg, 30), f = new Set();
  if (v.twr < 1.15) f.add('twr');
  if (v.twr > 2.05) f.add('cascade');
  if (v.wl.id === 'thin' && v.pf.id === 'aggressive') f.add('buckle');
  if (v.f.n < 3) f.add('fins');
  if (!v.h.ok) f.add('heat');
  if (pr.margin < 0) f.add('dry');
  return f;
}
function lessonFor(cause) {
  const v = P.vehicle(cfgWithCrew());
  if (BUILD_LESSONS[cause]) return Object.assign({ build: true }, BUILD_LESSONS[cause](S.cfg, v));
  const l = Object.assign({}, LESSONS[cause]);
  if (cause === 'maxq' && v.pf.id === 'aggressive') { l.what = 'Your aggressive throttle profile held full power through max-Q and the load passed the structural limit.'; l.parts = ['profile']; l.build = true; }
  return l;
}
const FACT_WIN = 'SpaceX first caught a Super Heavy booster with the tower\'s "chopsticks" on Starship Flight 5, October 13, 2024.';
const FACT_DIVERT = 'On Flight 15 (Nov 13, 2026) SpaceX called off the real booster catch and diverted Booster 22 to the Gulf of Mexico. Safety first.';

// ---------------------------------------------------------------- STATE
const S = {
  screen: 'title', scene: 'pad', mission: MISSIONS[0],
  cfg: { engine: 'r3', fuel: 1.0, staging: 'hot', payload: 26, fins: 'std', shield: 'full', walls: 'std', profile: 'auto' }, highlight: [],
  crew: { fd: 'ava', prop: 'priya', wx: 'kenji', rec: 'lena' },
  wx: null, wxShown: null, scrubs: 0, day: 1, riskIt: false,
  asc: null, land: null, result: null, timeScale: 1, shake: 0, flash: 0, banners: [], t: 0, keys: {},
};
const has = id => Object.values(S.crew).includes(id);

// ---------------------------------------------------------------- SCREENS
function show(id) {
  S.screen = id;
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === 's-' + id));
  const overlayScreens = ['how', 'mission', 'build', 'crew', 'weather'];
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('overlay', overlayScreens.includes(el.id.slice(2))));
  if (id === 'mission') renderMissions();
  if (id === 'build') renderBuild();
  if (id === 'crew') renderCrew();
  if (id === 'weather') { if (!S.wx) newWeather(); renderWeather(); }
  if (['title', 'how', 'mission', 'build', 'crew', 'weather'].includes(id)) { S.scene = 'pad'; }
  hideTip();
  if (TIPS[id]) menuTip(id, TIPS[id][Math.floor(rng() * TIPS[id].length)]);
}
let tipTimer = 0;
function tip(text, dur = 9) { const el = $('#tip'); el.innerHTML = '<b>TIP</b>' + text; el.classList.remove('hidden'); tipTimer = dur; }
function menuTip(id, t) {
  const panel = document.querySelector('#s-' + id + ' .panel'); if (!panel) return;
  let el = panel.querySelector('.menu-tip'); if (!el) { el = document.createElement('div'); el.className = 'fact menu-tip'; panel.insertBefore(el, panel.querySelector('.btn-row')); }
  el.innerHTML = '<b>ROCKETRY TIP</b>' + t;
}
function hideTip() { $('#tip').classList.add('hidden'); tipTimer = 0; }

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (go) { const g = go.dataset.go; if (g === 'weather') { S.wx = null; S.scrubs = 0; S.day = 1; } show(g); return; }
  const act = e.target.closest('[data-act]');
  if (act) { if (act.dataset.act === 'again') { S.wx = null; S.scrubs = 0; S.day = 1; show('weather'); } if (act.dataset.act === 'rebuild') show('build'); }
});

function renderMissions() {
  const el = $('#mission-cards'); el.innerHTML = '';
  MISSIONS.forEach(m => {
    const c = document.createElement('div'); c.className = 'card' + (S.mission.id === m.id ? ' sel' : '');
    c.innerHTML = `<span class="badge">${m.badge}</span><div class="t">${m.name}</div><div class="muted" style="font-family:var(--mono);font-size:11px">${m.date} · ${m.site}</div><p class="d">${m.desc}</p><button class="btn primary" style="width:100%">SELECT</button>`;
    c.onclick = () => { S.mission = m; if (m.payload) S.cfg.payload = m.payload; show('build'); };
    el.appendChild(c);
  });
}

function optGroup(title, list, key, render) {
  const g = document.createElement('div'); g.className = 'opt-group' + (S.highlight.includes(key) ? ' flaw' : ''); g.dataset.key = key;
  g.innerHTML = `<h3>${title}${S.highlight.includes(key) ? ' <span class="flaw-tag">◀ CAUSED YOUR LAST FAILURE</span>' : ''}</h3>`; const row = document.createElement('div'); row.className = 'opt-row';
  list.forEach(o => {
    const c = document.createElement('div'); c.className = 'card' + (S.cfg[key] === o.id ? ' sel' : '');
    c.innerHTML = (o.tag ? `<span class="badge">${o.tag}</span>` : '') + `<div class="t">${o.name}</div>` + (render ? render(o) : `<div class="pro">+ ${o.pro}</div><div class="con">− ${o.con}</div>`);
    c.onclick = () => { if (S.cfg[key] !== o.id) { S.cfg[key] = o.id; S.kitFlash = { part: key, t: 0.6 }; SND.play('snap'); S.highlight = S.highlight.filter(k => k !== key); } renderBuild(); };
    row.appendChild(c);
  });
  g.appendChild(row); return g;
}
function renderBuild() {
  const el = $('#build-options'); const scroll = el.closest('.screen').scrollTop; el.innerHTML = '';
  el.appendChild(optGroup('BOOSTER ENGINES', P.ENGINES, 'engine'));
  const fg = document.createElement('div'); fg.className = 'opt-group' + (S.highlight.includes('fuel') ? ' flaw' : ''); fg.dataset.key = 'fuel';
  fg.innerHTML = `<h3>BOOSTER PROPELLANT LOAD: <span id="fuelv" style="color:#fff">${Math.round(S.cfg.fuel * 100)}%</span>${S.highlight.includes('fuel') ? ' <span class="flaw-tag">◀ CAUSED YOUR LAST FAILURE</span>' : ''}</h3>
    <input type="range" id="fuel" min="75" max="100" step="1" value="${Math.round(S.cfg.fuel * 100)}">
    <div class="muted">More propellant gives more ΔV and a bigger landing reserve, but a heavier, slower liftoff. Less gives a punchy liftoff but less performance.</div>`;
  el.appendChild(fg);
  fg.querySelector('#fuel').oninput = e => { S.cfg.fuel = e.target.value / 100; fg.querySelector('#fuelv').textContent = e.target.value + '%'; S.kitFlash = { part: 'fuel', t: 0.4 }; renderStats(); };
  el.appendChild(optGroup('TANK WALLS', P.WALLS, 'walls'));
  el.appendChild(optGroup('STAGE SEPARATION', P.STAGING, 'staging'));
  el.appendChild(optGroup('PAYLOAD', P.PAYLOADS, 'payload', o => `<div class="d">~${o.mass} t to orbit</div>`));
  el.appendChild(optGroup('GRID FINS', P.FINS, 'fins'));
  el.appendChild(optGroup('SHIP HEAT SHIELD', P.SHIELDS, 'shield'));
  el.appendChild(optGroup('MAX-Q THROTTLE PROFILE', P.PROFILES, 'profile'));
  renderStats();
  el.closest('.screen').scrollTop = scroll;
}
function cfgWithCrew() { return Object.assign({}, S.cfg, { thrustMult: has('diego') ? 1.03 : 1 }); }
function renderStats() {
  const cfg = cfgWithCrew(), pr = P.predict(cfg, 30), v = pr.v, flaws = buildFlaws(cfg);
  const warn = '<span class="warnc">⚠</span> ';
  const twrTxt = v.twr < 1.15 ? `${warn}<span class="warnc">${v.twr.toFixed(2)} sluggish</span>` : v.twr > 2.05 ? `${warn}<span class="warnc">${v.twr.toFixed(2)} violent</span>` : `<span class="good">${v.twr.toFixed(2)}</span>`;
  const mC = pr.margin < 0 ? 'warnc' : pr.margin < 250 ? 'warnc' : 'good';
  const failP = 1 - Math.pow(1 - v.e.fail * (has('priya') ? 0.5 : 1) * (has('diego') ? 1.3 : 1), v.e.count);
  const peakQ = (() => { const st = P.newAscent(v); let m = 0; for (let i = 0; i < 2000; i++) { P.stepAscent(st, v, 0.1, 1, 30); m = Math.max(m, st.load); if (P.reserveFrac(st) < 0.12) break; } return m; })();
  const structTxt = peakQ <= v.limit ? '<span class="good">GOOD</span>' : v.pf.id === 'aggressive' ? `${warn}<span class="warnc">${v.wl.id === 'thin' ? 'VERY LOW' : 'LOW'}</span>` : v.pf.id === 'auto' ? '<span class="good">OK (AUTO BUCKET)</span>' : '<span class="warnc">THROTTLE DOWN</span>';
  const steer = { 0: `${warn}<span class="warnc">NONE</span>`, 2: `${warn}<span class="warnc">WEAK</span>`, 3: '<span class="good">STRONG</span>', 4: '<span class="good">GOOD</span>' }[v.f.n];
  const shieldTxt = { none: `${warn}<span class="warnc">BARE STEEL</span>`, thin: `${warn}<span class="warnc">MARGINAL</span>`, full: '<span class="good">GOOD</span>', heavy: '<span class="good">HIGH</span>' }[v.h.id];
  $('#build-stats').innerHTML = `
    <canvas id="kit" width="560" height="560"></canvas>
    <h3 style="margin-top:6px">FLIGHT COMPUTER PREDICTION</h3>
    <div class="stat"><span class="k">Liftoff mass</span><span>${fmt(v.liftoff)} t</span></div>
    <div class="stat"><span class="k">Liftoff T/W</span><span>${twrTxt}</span></div>
    <div class="stat"><span class="k">Structure at max-Q</span><span>${structTxt}</span></div>
    <div class="stat"><span class="k">Ship ΔV margin</span><span class="${mC}">${pr.margin < 0 ? '⚠ ' : '+'}${fmt(pr.margin)} m/s</span></div>
    <div class="stat"><span class="k">Steering home</span><span>${steer}</span></div>
    <div class="stat"><span class="k">Reentry protection</span><span>${shieldTxt}</span></div>
    <div class="stat"><span class="k">Random engine-out</span><span class="${failP > 0.15 ? 'warnc' : 'good'}">${Math.round(failP * 100)}%</span></div>
    <div class="fact"><b>READOUT</b>${flaws.size ? `Flight computer: <span class="warnc">${flaws.size === 1 ? 'one part of this stack is' : 'some parts of this stack are'} outside safe limits.</span> Look for the ⚠ readings.` :
      peakQ > v.limit && v.pf.id === 'manual' ? 'Flyable, but full-throttle max-Q exceeds your walls. Throttle down (↓ / S) through max-Q.' :
      'Looks flyable. Stage when the landing reserve is in the green.'}</div>`;
  drawKit();
}
// model-kit preview of the stack, redrawn while the build screen is open
function drawKit() {
  const kc = document.getElementById('kit'); if (!kc) return;
  const k = kc.getContext('2d'), w = kc.width, h = kc.height;
  const saved = ctx; ctx = k;
  k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, w, h);
  const g = k.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#05070b'); g.addColorStop(1, '#0d1118'); k.fillStyle = g; k.fillRect(0, 0, w, h);
  k.strokeStyle = 'rgba(255,255,255,.06)'; for (let x = 0; x < w; x += 28) { k.beginPath(); k.moveTo(x, 0); k.lineTo(x, h); k.stroke(); } for (let y = 0; y < h; y += 28) { k.beginPath(); k.moveTo(0, y); k.lineTo(w, y); k.stroke(); }
  const sc = (h - 70) / 126, cx = w * 0.42, by = h - 30;
  const fl = S.kitFlash && S.kitFlash.t > 0 ? S.kitFlash : null;
  const glow = part => fl && fl.part === part ? 0.5 + 0.5 * Math.sin(fl.t * 30) : 0;
  const v = P.vehicle(cfgWithCrew());
  k.save(); k.translate(cx, by);
  drawBooster(sc, { fins: v.f, walls: v.wl.id, fuel: S.cfg.fuel, glowFins: glow('fins'), glowWalls: glow('walls') + glow('fuel') });
  k.translate(0, -73 * sc); drawShip(sc, { shield: v.h.id, sats: v.p.sats, glow: glow('shield') + glow('payload') });
  k.restore();
  // engine plate inset
  const savedEngines = v; drawEngines(w * 0.82, h - 70, 46, savedEngines, 0);
  text(v.e.name.toUpperCase(), w * 0.82, h - 10, 13, { align: 'center', ls: 2, color: glow('engine') ? '#fff' : '#9aa0a8' });
  if (glow('engine')) { k.strokeStyle = `rgba(255,255,255,${glow('engine')})`; k.lineWidth = 3; k.beginPath(); k.arc(w * 0.82, h - 70, 56, 0, Math.PI * 2); k.stroke(); }
  text('YOUR STACK', 18, 30, 14, { ls: 4, color: '#9aa0a8' });
  text(`${v.p.sats} SATS · ${Math.round(S.cfg.fuel * 100)}% PROP`, 18, 52, 12, { ls: 2, color: '#6d737c', mono: true });
  ctx = saved;
}

function renderCrew() {
  const el = $('#crew-roles'); el.innerHTML = '';
  ROLES.forEach(r => {
    const g = document.createElement('div'); g.className = 'role';
    g.innerHTML = `<h3>${r.title}</h3>`; const row = document.createElement('div'); row.className = 'opt-row';
    r.opts.forEach(o => {
      const c = document.createElement('div'); c.className = 'card' + (S.crew[r.id] === o.id ? ' sel' : '');
      c.innerHTML = `<div class="t">${o.name}</div><div class="muted" style="letter-spacing:.15em;font-size:10px">${o.trait.toUpperCase()}</div><div class="d" style="margin-top:6px">${o.desc}</div>`;
      c.onclick = () => { S.crew[r.id] = o.id; renderCrew(); };
      row.appendChild(c);
    });
    g.appendChild(row); el.appendChild(g);
  });
  const note = document.createElement('p'); note.className = 'muted'; note.textContent = 'Crew members are fictional characters.'; el.appendChild(note);
}

// ---------------------------------------------------------------- WEATHER
const CLOUDS = ['Clear', 'Scattered cumulus', 'Thick cumulus', 'Anvil / thunderstorms nearby'];
function newWeather() {
  let w;
  if (S.mission.fixedWx && S.day === 1) w = Object.assign({}, S.mission.fixedWx);
  else {
    const ci = rng() < 0.45 ? 0 : rng() < 0.55 ? 1 : rng() < 0.6 ? 2 : 3;
    w = { wind: Math.round(4 + rng() * 30), shear: Math.round(15 + rng() * 95), clouds: CLOUDS[ci], lightning: ci === 3 && rng() < 0.8,
      temp: Math.round(30 + rng() * 60), sea: Math.round(2 + rng() * 10) };
  }
  if (DEMO) w = { wind: 8, shear: 30, clouds: 'Clear', lightning: false, temp: 72, sea: 3 };
  S.wx = w;
  const noisy = has('sam');
  const n = (v, f) => noisy ? Math.max(0, Math.round(v * (1 + (rng() - 0.55) * f))) : v;
  S.wxShown = { wind: n(w.wind, 0.5), shear: n(w.shear, 0.5), clouds: w.clouds, lightning: w.lightning, temp: n(w.temp, 0.15), sea: n(w.sea, 0.5) };
}
function wxRules(w) {
  const r = [];
  r.push({ k: 'GROUND WINDS', v: `${w.wind} kt`, s: w.wind > 28 ? 'nogo' : w.wind > 20 ? 'warn' : 'go', why: 'Pushes the returning booster sideways during the catch. Limit 28 kt.' });
  r.push({ k: 'UPPER-LEVEL SHEAR', v: `${w.shear} kt`, s: w.shear > 90 ? 'nogo' : w.shear > 60 ? 'warn' : 'go', why: 'Adds sideways load at max-Q, ~11 km up. Limit 90 kt.' });
  r.push({ k: 'CLOUDS / LIGHTNING', v: w.lightning ? 'Lightning 6 nmi' : w.clouds, s: w.lightning ? 'nogo' : w.clouds === 'Thick cumulus' || w.clouds.startsWith('Anvil') ? 'warn' : 'go', why: 'No launch with lightning within 10 nmi or through thick cumulus.' });
  r.push({ k: 'TEMPERATURE', v: `${w.temp} °F`, s: w.temp < 40 ? 'warn' : 'go', why: 'Below 40 °F, ice can form on the vehicle and shed onto heat-shield tiles.' });
  r.push({ k: 'SEA STATE', v: `${w.sea} ft`, s: w.sea > 10 ? 'nogo' : w.sea > 6 ? 'warn' : 'go', why: 'Recovery and range-safety boats in the Gulf need workable seas. Limit 10 ft.' });
  return r;
}
function riskOdds() {
  const w = S.wx; let p = 0;
  if (w.lightning) p += 0.4; if (w.shear > 90) p += 0.25; if (w.wind > 28) p += 0.2; if (w.sea > 10) p += 0.05;
  return clamp(p * (has('marcus') ? 0.7 : 1), 0, 0.9);
}
function renderWeather() {
  const w = S.wxShown, rules = wxRules(w), noisy = has('sam');
  const maxScrubs = has('ava') ? 3 : 2;
  $('#wx-title').textContent = `LAUNCH WEATHER BRIEFING · DAY ${S.day}`;
  const worst = rules.some(r => r.s === 'nogo') ? 'nogo' : rules.some(r => r.s === 'warn') ? 'warn' : 'go';
  $('#wx-body').innerHTML = `<div class="muted" style="margin-bottom:12px">${S.mission.site} · ${S.mission.fixedWx && S.day === 1 ? 'Game forecast for the featured mission (not real weather data)' : 'Forecast'} · Officer ${noisy ? 'Sam Okafor (± estimates)' : 'Kenji Mori (balloon-verified)'}</div>
   <div class="wx-grid">${rules.map(r => `<div class="wx"><div class="k">${r.k}</div><div class="v">${noisy && r.k !== 'CLOUDS / LIGHTNING' ? '≈ ' : ''}${r.v}</div><span class="pill ${r.s}">${r.s === 'nogo' ? 'NO-GO' : r.s === 'warn' ? 'WATCH' : 'GO'}</span><div class="r" style="margin-top:6px">${r.why}</div></div>`).join('')}</div>
   <div class="verdict">${worst === 'nogo' ? '<span class="badc">WEATHER IS NO-GO.</span> Scrub for a better day, or risk it.' : worst === 'warn' ? '<span class="warnc">GO WITH CAUTION.</span> Some readings are near limits.' : '<span class="good">WEATHER IS GO.</span> All criteria green.'}
   ${has('marcus') && worst === 'nogo' ? `<br><span class="muted">Marcus: "Risking it gives us about a ${Math.round(riskOdds() * 100)}% chance of losing the vehicle to weather."</span>` : ''}
   <span class="muted"> · Scrubs left: ${maxScrubs - S.scrubs}</span></div>`;
  const a = $('#wx-actions'); a.innerHTML = '';
  const b = (t, cls, fn, dis) => { const x = document.createElement('button'); x.className = 'btn ' + cls; x.textContent = t; x.onclick = fn; x.disabled = !!dis; a.appendChild(x); };
  b('BACK', '', () => show('crew'));
  b('SCRUB 24 HRS', 'warn', () => { S.scrubs++; S.day++; newWeather(); renderWeather(); menuTip('weather', 'Scrubbed. In real life, teams recycle propellant and try again, sometimes the next day.'); }, S.scrubs >= maxScrubs);
  if (worst === 'nogo') b('RISK IT', 'bad', () => { S.riskIt = true; startLaunch(); });
  b('GO FOR LAUNCH', 'primary', () => { S.riskIt = false; startLaunch(); }, worst === 'nogo');
}

// ---------------------------------------------------------------- CANVAS
const cv = $('#game'); let ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize); resize();
const stars = Array.from({ length: 260 }, () => ({ x: rng(), y: rng(), r: rng() * 1.3 + 0.2, a: rng() }));
const particles = [];
function spacing(px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
function text(t, x, y, size, opts = {}) {
  ctx.save(); ctx.font = `${opts.weight || 400} ${size}px ${opts.mono ? 'Menlo, Consolas, monospace' : 'Helvetica Neue, Helvetica, Arial, sans-serif'}`;
  spacing(opts.ls || 0); ctx.textAlign = opts.align || 'left'; ctx.textBaseline = opts.base || 'alphabetic';
  ctx.fillStyle = opts.color || '#fff'; ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha; ctx.fillText(t, x, y); ctx.restore();
}
function banner(t, sub, dur = 2.6, color) { S.banners = [{ t, sub, life: dur, dur, color }]; }

// sky
function drawSky(alt) {
  const k = clamp(alt / 45000, 0, 1);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgb(${lerp(14, 0, k)},${lerp(22, 0, k)},${lerp(44, 2, k)})`);
  g.addColorStop(0.7, `rgb(${lerp(46, 0, k)},${lerp(52, 1, k)},${lerp(78, 5, k)})`);
  g.addColorStop(1, `rgb(${lerp(150, 2, k)},${lerp(92, 4, k)},${lerp(70, 10, k)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sa = clamp(0.25 + k, 0, 1);
  ctx.fillStyle = '#fff';
  for (const s of stars) { ctx.globalAlpha = sa * (0.4 + 0.6 * Math.abs(Math.sin(S.t * 0.6 + s.a * 9))) * (s.y < 0.75 ? 1 : 0.3); ctx.fillRect(s.x * W, s.y * H, s.r, s.r); }
  ctx.globalAlpha = 1;
}
function drawEarthLimb(alt) {
  const k = clamp((alt - 18000) / 45000, 0, 1); if (k <= 0) return;
  const R = W * 2.6, cy = H + R - lerp(0, H * 0.22, k);
  ctx.save();
  const glow = ctx.createRadialGradient(W / 2, cy, R - 4, W / 2, cy, R + 40);
  glow.addColorStop(0, 'rgba(120,180,255,0.0)'); glow.addColorStop(0.1, `rgba(120,180,255,${0.55 * k})`); glow.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(W / 2, cy, R + 40, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#05080f'; ctx.beginPath(); ctx.arc(W / 2, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// vehicle drawing; origin = bottom center of booster, units meters * sc
function drawBooster(sc, o = {}) {
  const w = 9 * sc, h = 71 * sc;
  const fins = o.fins || P.FINS.find(f => f.id === S.cfg.fins);
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, '#6d737c'); g.addColorStop(0.35, '#e9edf2'); g.addColorStop(0.6, '#c3c8cf'); g.addColorStop(1, '#4b5058');
  ctx.fillStyle = g; ctx.fillRect(-w / 2, -h, w, h);
  if (o.fuel != null) { ctx.fillStyle = 'rgba(80,140,255,.18)'; ctx.fillRect(-w / 2 + sc, -h * 0.95 * o.fuel, w - 2 * sc, h * 0.95 * o.fuel); }
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = Math.max(0.5, sc * 0.15);
  for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(-w / 2, -h * i / 12); ctx.lineTo(w / 2, -h * i / 12); ctx.stroke(); }
  if (o.walls) { ctx.strokeStyle = o.glowWalls ? `rgba(255,255,255,${0.4 + o.glowWalls * 0.6})` : 'rgba(255,255,255,.55)'; ctx.lineWidth = { thin: 0.8, std: 2, thick: 4.5 }[o.walls]; ctx.strokeRect(-w / 2, -h, w, h); }
  ctx.fillStyle = '#9aa0a8'; ctx.fillRect(-w / 2 - sc * 0.6, -h * 0.75, sc * 0.6, h * 0.6); ctx.fillRect(w / 2, -h * 0.75, sc * 0.6, h * 0.6);
  ctx.fillStyle = '#2a2e34'; ctx.fillRect(-w / 2, -h - 2 * sc, w, 2 * sc);
  ctx.fillStyle = '#7d838c'; for (let i = 0; i < 6; i++) ctx.fillRect(-w / 2 + (i + 0.3) * w / 6, -h - 1.6 * sc, w / 12, 1.2 * sc);
  // grid fins (side view): 2+ fins show left/right, 3+ adds one facing the camera
  const big = fins.big ? 1.45 : 1, fw = 4.2 * sc * big, fh = 3.2 * sc * big, fy = -h + (fins.big ? 9 : 3) * sc;
  ctx.strokeStyle = o.glowFins ? `rgba(255,255,255,${0.5 + o.glowFins * 0.5})` : '#d7dbe0'; ctx.lineWidth = Math.max(0.6, sc * 0.25) * (o.glowFins ? 2 : 1);
  const finAt = (x, y, fw2) => { ctx.strokeRect(x, y, fw2, fh); for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + fw2 * i / 4, y); ctx.lineTo(x + fw2 * i / 4, y + fh); ctx.stroke(); } };
  if (fins.n >= 2) { finAt(-w / 2 - fw, fy, fw); finAt(w / 2, fy, fw); }
  if (fins.n >= 3) { ctx.fillStyle = 'rgba(30,34,40,.85)'; ctx.fillRect(-fw * 0.35, fy, fw * 0.7, fh); finAt(-fw * 0.35, fy, fw * 0.7); }
  ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2 - sc * 1.2, -64 * sc, sc * 1.2, sc * 1); ctx.fillRect(w / 2, -64 * sc, sc * 1.2, sc * 1);
  ctx.fillStyle = '#1b1e22'; ctx.fillRect(-w / 2 + sc, -sc * 0.8, w - 2 * sc, sc * 0.8);
}
function drawShip(sc, o = {}) {
  const w = 9 * sc, h = 52 * sc, shield = o.shield || S.cfg.shield;
  ctx.save();
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  const dark = { none: ['#8f959d', '#c9ced5'], thin: ['#2b2f35', '#3c4148'], full: ['#0d0f12', '#1c2026'], heavy: ['#050607', '#111316'] }[shield] || ['#0d0f12', '#1c2026'];
  g.addColorStop(0, dark[0]); g.addColorStop(0.5, dark[1]); g.addColorStop(0.51, '#cfd4da'); g.addColorStop(0.8, '#f2f4f7'); g.addColorStop(1, '#6a7078');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -h + 14 * sc);
  ctx.quadraticCurveTo(-w / 2, -h, 0, -h); ctx.quadraticCurveTo(w / 2, -h, w / 2, -h + 14 * sc); ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fill();
  if (shield === 'thin') { ctx.fillStyle = 'rgba(200,205,212,.5)'; for (let i = 0; i < 26; i++) ctx.fillRect(-w / 2 + ((i * 37) % 10) / 10 * w * 0.45, -h + 10 * sc + ((i * 53) % 40) * sc, sc * 0.9, sc * 0.9); }
  if (shield === 'heavy') { ctx.fillStyle = '#000'; ctx.fillRect(-w / 2 - sc * 0.5, -h + 14 * sc, sc * 0.5, h - 14 * sc); }
  if (o.sats) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(w * 0.06, -h * 0.72, w * 0.36, h * 0.3); ctx.fillStyle = '#9fd3ff'; const rows = Math.min(30, Math.ceil(o.sats / 2)); for (let i = 0; i < rows; i++) ctx.fillRect(w * 0.08, -h * 0.72 + (i + 0.5) * h * 0.3 / rows, w * 0.32, Math.max(1, h * 0.3 / rows * 0.5)); }
  if (o.glow) { ctx.strokeStyle = `rgba(255,255,255,${o.glow})`; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.fillStyle = '#16191d';
  ctx.beginPath(); ctx.moveTo(-w / 2, -3 * sc); ctx.lineTo(-w / 2 - 3.2 * sc, -2 * sc); ctx.lineTo(-w / 2 - 3.2 * sc, -12 * sc); ctx.lineTo(-w / 2, -16 * sc); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w / 2, -3 * sc); ctx.lineTo(w / 2 + 3.2 * sc, -2 * sc); ctx.lineTo(w / 2 + 3.2 * sc, -12 * sc); ctx.lineTo(w / 2, -16 * sc); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-w / 2, -h + 16 * sc); ctx.lineTo(-w / 2 - 2 * sc, -h + 17 * sc); ctx.lineTo(-w / 2 - 2 * sc, -h + 24 * sc); ctx.lineTo(-w / 2, -h + 26 * sc); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w / 2, -h + 16 * sc); ctx.lineTo(w / 2 + 2 * sc, -h + 17 * sc); ctx.lineTo(w / 2 + 2 * sc, -h + 24 * sc); ctx.lineTo(w / 2, -h + 26 * sc); ctx.fill();
  ctx.restore();
}
function drawFlame(sc, power, altK, width = 7) {
  if (power <= 0) return;
  const len = sc * (18 + 50 * power) * (1 + altK * 2.5) * (0.92 + Math.random() * 0.16);
  const wd = sc * width * (1 + altK * 1.8);
  const g = ctx.createLinearGradient(0, 0, 0, len);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,236,200,.95)'); g.addColorStop(0.45, 'rgba(255,150,70,.6)'); g.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-wd / 2, 0); ctx.quadraticCurveTo(-wd * 0.9, len * 0.4, 0, len); ctx.quadraticCurveTo(wd * 0.9, len * 0.4, wd / 2, 0); ctx.fill();
  if (altK < 0.3) { ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.ellipse(0, len * i * 0.13, wd * 0.18, wd * 0.12, 0, 0, Math.PI * 2); ctx.fill(); } }
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, wd * 2.2); halo.addColorStop(0, `rgba(255,190,120,${0.35 * power})`); halo.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, wd * 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// tower in side view (ascent / pad). baseX/baseY screen coords of ground at tower center
function drawTowerSide(bx, by, sc, armsOpen = 1) {
  const tw = 12 * sc, th = 146 * sc;
  ctx.save(); ctx.strokeStyle = '#8b929b'; ctx.lineWidth = Math.max(0.6, sc * 0.35);
  ctx.fillStyle = 'rgba(20,24,30,.9)'; ctx.fillRect(bx - tw / 2, by - th, tw, th);
  const n = 22; for (let i = 0; i < n; i++) { const y0 = by - th * i / n, y1 = by - th * (i + 1) / n; ctx.beginPath(); ctx.moveTo(bx - tw / 2, y0); ctx.lineTo(bx + tw / 2, y1); ctx.moveTo(bx + tw / 2, y0); ctx.lineTo(bx - tw / 2, y1); ctx.stroke(); }
  ctx.strokeRect(bx - tw / 2, by - th, tw, th);
  ctx.restore();
}
function drawPad(cx, gy, sc) {
  ctx.fillStyle = '#0c0e11'; ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, gy, W, 1);
  // launch mount
  ctx.fillStyle = '#3a3f46'; const mh = 22 * sc, mw = 30 * sc;
  ctx.fillRect(cx - mw / 2, gy - mh, mw, 4 * sc);
  for (let i = 0; i < 3; i++) ctx.fillRect(cx - mw / 2 + i * (mw / 2) - (i === 1 ? sc * 1.5 : i === 2 ? sc * 3 : 0), gy - mh, 3 * sc, mh);
}

// ---------------------------------------------------------------- LAUNCH / ASCENT
function startLaunch() {
  show('none'); hideTip();
  const cfg = cfgWithCrew();
  const v = P.vehicle(cfg);
  const st = P.newAscent(v);
  const flaws = DEMO ? new Set() : buildFlaws(cfg);
  const failP = DEMO ? 0 : v.e.fail * (has('priya') ? 0.5 : 1) * (has('diego') ? 1.3 : 1);
  const outs = []; for (let i = 0; i < v.e.count; i++) if (rng() < failP) outs.push(8 + rng() * 100);
  if (flaws.has('cascade')) outs.push(22, 25, 27.5, 29.5, 31);
  const wx = S.wx; const mult = has('marcus') ? 0.7 : 1;
  const lightning = !DEMO && wx.lightning && rng() < 0.4 * mult ? 25 + rng() * 25 : null;
  const target = P.BOOSTBACK_COST + P.LANDING_IDEAL - v.s.reserveBonus;
  const band = has('ava') ? 0.03 : 0.02;
  S.asc = { v, st, cfg, flaws, cmd: 1, outs: outs.sort((a, b) => a - b), lightning, target, band, staged: false, sepT: 0, failed: null, failT: 0, warp: 7, maxQcalled: false,
    gustPhase: rng() * 10, shownOut: 0, iceDamage: !DEMO && wx.temp < 40 && rng() < 0.25, countdown: 3, lastBeep: 4, drift: 0, driftV: 0, padT: 0, nextCreak: 0, flicker: 0 };
  S.ship = null; S.land = null; S.re = null;
  S.scene = 'ascent'; S.timeScale = 1; S.flash = 0; S.banners = []; particles.length = 0;
  banner('STARSHIP · ' + S.mission.name, 'T-3 · IGNITION SEQUENCE', 2.4);
  maybeTutorial();
}
const TUT = [
  ['THROTTLE', () => TOUCH ? '<b>THROTTLE +</b> and <b>THROTTLE −</b> set engine power; the bar between them shows the %. Ease off before <b>MAX-Q</b> so the air doesn\'t crush the rocket, then go back to full. The coach line tells you when.' : '<kbd>↑</kbd>/<kbd>W</kbd> is <b>THROTTLE +</b>, <kbd>↓</kbd>/<kbd>S</kbd> is <b>THROTTLE −</b>. Ease off before <b>MAX-Q</b> so the air doesn\'t crush the rocket, then go back to full. The coach line tells you when.'],
  ['STAGING', () => `Watch <b>BOOSTER FUEL</b>. When it reaches the green <b>STAGE WINDOW</b>, ${TOUCH ? 'tap <b>STAGE</b> (it pulses green)' : 'press <kbd>SPACE</kbd>'}. Too early and the Ship is short on speed. Too late and the booster can't fly home.`],
  ['THE CATCH', () => `Steer ${TOUCH ? '<b>◀ ▶</b>' : '<kbd>←</kbd><kbd>→</kbd>'} to keep the booster in the green laser above the arms and the <b>◆ predicted touchdown</b> between them. At the <b>BURN LINE</b>, ${TOUCH ? 'tap <b>THROTTLE +</b>' : 'press <kbd>↑</kbd>'} to light the burn, then feather it until vertical speed turns green. The <b>ARMS CAM</b> zooms in for the last 300 m.`]
];
let tutStep = 0;
function tutorialSeen() { try { return localStorage.getItem('chop-tut') === '1'; } catch (e) { return true; } }
function maybeTutorial() { if (qs.get('tutorial') === '1' || (!DEMO && !CAPTURE && !tutorialSeen())) { tutStep = 0; S.paused = true; renderTut(); $('#tutorial').classList.remove('hidden'); } }
function renderTut() { const [h, p] = TUT[tutStep]; $('#tut-n').textContent = `${tutStep + 1} / ${TUT.length}`; $('#tut-h').textContent = h; $('#tut-p').innerHTML = p(); $('#tut-next').textContent = tutStep < TUT.length - 1 ? 'NEXT' : 'GOT IT · FLY'; }
function closeTut() { $('#tutorial').classList.add('hidden'); S.paused = false; try { localStorage.setItem('chop-tut', '1'); } catch (e) {} }
$('#tut-next').addEventListener('click', () => { if (tutStep < TUT.length - 1) { tutStep++; renderTut(); } else closeTut(); });
$('#tut-skip').addEventListener('click', closeTut);
function touchSync() {
  const m = $('#thr-meter'); if (!m) return;
  let thr = null;
  if (S.scene === 'ascent' && S.asc && S.asc.st) thr = S.asc.st.throttle;
  else if (S.scene === 'landing' && S.land) thr = S.land.lit ? S.land.thr : 0;
  if (thr != null) { m.querySelector('i').style.height = Math.round(thr * 100) + '%'; m.querySelector('b').textContent = Math.round(thr * 100) + '%'; }
  const A = S.asc, ss = S.scene === 'ascent' && A && A.st ? stageState(A, P.reserveFrac(A.st)) : '';
  const sb = $('#stage-btn'); sb.classList.toggle('ready', ss === 'window'); sb.classList.toggle('late', ss === 'late');
  const L = S.land, lb = $('#burn-lbl'), bb = $('#burn-btn');
  const needBurn = S.scene === 'landing' && L && !L.lit && !L.done && L.fuel > 0;
  lb.textContent = needBurn ? 'LIGHT BURN' : 'THROTTLE';
  bb.classList.toggle('ready', !!(needBurn && L.igniteCued));
}
function ascentUpdate(dt) {
  const A = S.asc, st = A.st, v = A.v;
  if (A.failed) { A.failT += dt; return; }
  if (A.countdown > 0) {
    A.countdown -= dt;
    const n = Math.ceil(A.countdown); if (n < A.lastBeep && n > 0) { A.lastBeep = n; SND.play('beep', { f: 880 }); }
    if (A.countdown <= 0) {
      SND.play('liftoff');
      const prof = v.pf.id === 'auto' ? 'Auto throttle bucket armed for max-Q' : v.pf.id === 'aggressive' ? 'Aggressive profile: full throttle locked' : 'Hold ↓ / S to throttle down through max-Q';
      banner('LIFTOFF', prof, 3); tipFlight('Super Heavy V3\'s 33 Raptor 3 engines make more than 18 million pounds of thrust. Watch the LOAD gauge as you climb.');
    }
    return;
  }
  if (A.staged) { A.sepT += dt; if (A.sepT > 3.2) startBoostback(); return; }
  // throttle: profile from the build, then the player
  if (DEMO) A.cmd = st.load > 36000 || (st.load > 30000 && st.q > 25000 && st.vy > 0 && st.t < 90) ? 0.62 : 1;
  else if (v.pf.id === 'aggressive' && st.t < 100) A.cmd = 1;
  else {
    if (v.pf.id === 'auto' && st.t < 110) A.cmd = st.load > v.limit * 0.72 ? 0.62 : st.load < v.limit * 0.6 ? 1 : A.cmd;
    if (S.keys.down) A.cmd = clamp(A.cmd - 1.2 * dt, 0.6, 1); if (S.keys.up) A.cmd = clamp(A.cmd + 1.2 * dt, 0.6, 1);
  }
  if (DEMO) A.warp = A.promptShown && P.reserveFrac(st) <= A.target + A.band + 0.006 ? 2.2 : 7; // demo/recording: linger on STAGE NOW
  const steps = Math.ceil(dt * A.warp / 0.05), h = dt * A.warp / steps;
  const shear = S.wx.shear;
  for (let i = 0; i < steps; i++) {
    while (A.outs.length && st.t >= A.outs[0]) { A.outs.shift(); st.enginesOut++; }
    P.stepAscent(st, v, h, A.cmd, shear);
    const gust = shear > 60 ? 1 + ((shear - 60) / 100) * Math.max(0, Math.sin(st.t * 0.9 + A.gustPhase) * Math.sin(st.t * 2.3)) : 1;
    st.load *= gust;
    if (st.load > v.limit) st.stress += (st.load / v.limit - 1) * h * 1.3; else st.stress = Math.max(0, st.stress - h * 0.02);
  }
  // underpowered: crawls off the pad and drifts into the tower, or never lifts at all
  if (A.flaws.has('twr')) {
    A.padT += dt;
    if (v.twr >= 1) { A.driftV += 6 * dt; A.drift += A.driftV * dt; if (A.drift > 13) return ascentFail('twr'); }
    else if (A.padT > 3.2) return ascentFail('twr');
    if (A.padT > 0.8 && !A.padWarn) { A.padWarn = true; banner(v.twr >= 1 ? 'SLOW CLIMB' : 'NO LIFTOFF', v.twr >= 1 ? 'Drifting toward the tower…' : 'Thrust is less than weight', 2.4, '#ffc53d'); }
  }
  if (st.enginesOut > A.shownOut) {
    A.shownOut = st.enginesOut; A.flicker = 0.6; SND.play('pop');
    const casc = A.flaws.has('cascade');
    banner(casc ? 'ENGINE-OUT CASCADE' : 'ENGINE OUT', `${v.e.count - st.enginesOut} / ${v.e.count} RUNNING${casc ? ' · ' + fmt(st.accel || 0, 1) + ' G' : ''}`, 2.5, casc ? '#ff4d4d' : '#ffc53d');
    if (!casc) tipFlight('Engine-out! The remaining engines burn longer to compensate. Big boosters are designed to tolerate losing a few.');
  }
  A.flicker = Math.max(0, A.flicker - dt);
  if (st.load > v.limit * 0.85 && S.t > A.nextCreak) { A.nextCreak = S.t + 1.3; SND.play('creak', { g: st.load > v.limit ? 0.3 : 0.16 }); if (st.load > v.limit) S.shake = Math.max(S.shake, 0.15); }
  if (!A.maxQcalled && st.q < st.maxQ * 0.97 && st.maxQ > 20000 && st.t > 40) { A.maxQcalled = true; banner('MAX-Q', `Peak dynamic pressure ${fmt(st.maxQ / 1000, 1)} kPa`, 2.4); }
  if (st.stress >= 1) return ascentFail(v.wl.id === 'thin' ? 'buckle' : 'maxq');
  if (st.enginesOut >= 4) return ascentFail(A.flaws.has('cascade') ? 'cascade' : 'engines');
  if (A.lightning && st.t >= A.lightning) return ascentFail('lightning');
  const res = P.reserveFrac(st);
  if (res <= A.target + 0.05 && !A.promptShown) { A.promptShown = true;
    if (A.flaws.has('dry')) banner('FLIGHT COMPUTER: EXTENDING BURN', 'Ship is short on ΔV · spending the landing reserve', 3, '#ffc53d');
    else { banner('PREPARE FOR STAGING', W < 700 || LS() ? 'Stage in the green window' : TOUCH ? 'Tap STAGE when BOOSTER FUEL reaches the green STAGE WINDOW' : 'Press SPACE when BOOSTER FUEL reaches the green STAGE WINDOW', 2.6);
      tip('Stage inside the green STAGE WINDOW. Too early and the Ship is short on speed to reach orbit. Too late and the booster has no fuel left to fly home to the tower.', 8); } }
  if (A.flaws.has('dry')) { if (res <= P.BOOSTBACK_COST - v.s.reserveBonus + 0.003) stage(true); return; }
  if ((DEMO || S.auto) && res <= A.target + 0.004) stage();
  if (res <= 0.02) stage(true);
}
let flightTipT = 0;
function tipFlight(t) { tip(t, 6); }
function stage(forced) {
  const A = S.asc; if (!A || A.staged || A.failed || !A.st || A.st.t < 60) return;
  if (A.flaws.has('dry') && !forced) { banner('STAGING INHIBITED', 'Flight computer is holding the booster burn', 1.6, '#ffc53d'); return; }
  A.staged = true; A.sepT = 0; A.forced = !!forced;
  A.reserve = P.reserveFrac(A.st) + A.v.s.reserveBonus;
  A.margin = P.shipDV(A.v) - P.dvNeeded(A.st);
  A.hotDamage = !DEMO && !A.flaws.size && A.v.s.id === 'hot' && rng() < A.v.s.risk;
  S.flash = 0.3; S.shake = 0.25; SND.play('bang', { k: A.v.s.id === 'hot' ? 1 : 0.55 });
  banner(A.v.s.id === 'hot' ? 'HOT STAGING' : 'STAGE SEPARATION', forced ? 'Booster ran nearly dry before staging!' : `Booster reserve ${fmt(A.reserve * 100, 1)}%`, 2.6, forced ? '#ffc53d' : null);
  tipFlight(A.v.s.id === 'hot' ? 'Hot staging: the Ship lights its engines while still attached, pushing away through a vented ring on top of the booster.' : 'Cold staging: the stages separate first, then the Ship lights up. The short coast costs some speed.');
}
function ascentFail(cause) {
  const A = S.asc; A.failed = cause; A.failT = 0; S.flash = 1; S.shake = 0.9;
  const sc = H * 0.42 / 124, rx = W * 0.5 - A.drift * sc, ry = H * 0.66;
  if (cause === 'twr') { boom(rx - 6 * sc, ry - 30 * sc, 1.8); SND.play('metal'); SND.play('explosion', { k: 1.3 }); }
  else if (cause === 'buckle') { S.flash = 0.6; boom(rx, ry - 73 * sc, 1.1); SND.play('crack'); later(0.5, () => { boom(W * 0.5, H * 0.5, 1.4); SND.play('explosion'); }); }
  else if (cause === 'cascade') { boom(rx, ry, 1.2); SND.play('explosion', { k: 1.1 }); }
  else if (cause === 'lightning') { A.bolt = 0.5; SND.play('crack'); boom(rx, ry - 60 * sc, 1.4); SND.play('explosion'); }
  else { SND.play('crack'); boom(W / 2, H * 0.5, 1.4); SND.play('explosion'); }
  banner('RAPID UNSCHEDULED DISASSEMBLY', lessonFor(cause).head, 3, '#ff4d4d');
  later(2.8, () => finish({ kind: 'fail', cause, phase: 'ascent' }));
}
const timers = [];
function later(t, fn) { timers.push({ t, fn }); }
function boom(x, y, size) {
  for (let i = 0; i < 160 * size; i++) { const a = rng() * Math.PI * 2, s = (40 + rng() * 260) * size; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + rng() * 1.2, max: 1.8, r: 1 + rng() * 3 * size, c: rng() < 0.5 ? '255,200,120' : '255,110,60', screen: true }); }
}
function ascentDraw() {
  const A = S.asc, st = A.st;
  drawSky(st.h); drawEarthLimb(st.h);
  const sc = H * 0.42 / 124;
  const rx = W * 0.5 - A.drift * sc, ry = H * 0.66;
  const altK = clamp(st.h / 40000, 0, 1);
  const gy = ry + st.h * sc + 22 * sc;
  const towerX = W * 0.5 - 24 * sc;
  if (gy < H + 400) {
    drawPad(W * 0.5, gy, sc);
    const tShake = A.failed === 'twr' ? Math.sin(S.t * 60) * 4 * Math.max(0, 1 - A.failT) : 0;
    drawTowerSide(towerX + tShake, gy, sc);
    ctx.fillStyle = 'rgba(110,120,130,.9)'; ctx.fillRect(towerX + 6 * sc + tShake, gy - 112 * sc, 14 * sc, 3 * sc);
  }
  if (S.wx.clouds !== 'Clear') {
    const n = S.wx.clouds === 'Scattered cumulus' ? 5 : 10;
    for (let i = 0; i < n; i++) { const cyw = 2500 + i * 450; const y = ry - (cyw - st.h) * sc * 0.25; if (y < -200 || y > H + 200) continue;
      ctx.fillStyle = `rgba(200,205,215,${S.wx.clouds.startsWith('Anvil') ? 0.35 : 0.22})`; const x = ((i * 397) % W);
      ctx.beginPath(); ctx.ellipse(x, y, 160 + i * 9, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + 90, y - 18, 100, 30, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  if (A.countdown <= 0.8 && st.h < 600 && !A.failed) for (let i = 0; i < 4; i++) particles.push({ x: W * 0.5 + (rng() - 0.5) * 60 * sc, y: gy - 4, vx: (rng() - 0.5) * 220, vy: -rng() * 30, life: 2.5, max: 2.5, r: 20 + rng() * 30, c: '210,210,215', smoke: true, wy: st.h });
  const lean = -A.drift * 0.012;
  const pitch = st.pitch * 0.55 + lean;
  const thrOn = A.countdown <= 0.6;
  const flick = A.flicker > 0 ? (Math.random() < 0.5 ? 0.25 : 1) : 1;
  const stress = clamp(st.stress, 0, 1);
  if (!A.failed) {
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(pitch);
    if (stress > 0.05) ctx.translate((Math.random() - 0.5) * 6 * stress, 0);
    if (!A.staged) {
      ctx.save(); drawFlame(sc, thrOn ? st.throttle * (st.prop > 0 ? 1 : 0) * flick * ((A.v.e.count - st.enginesOut) / A.v.e.count) : 0, altK, 8); ctx.restore();
      drawBooster(sc);
      ctx.translate(0, -73 * sc); ctx.rotate(stress * 0.12); drawShip(sc);
      if (stress > 0.3) { ctx.strokeStyle = `rgba(255,77,77,${stress})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6 * sc, 2 * sc); ctx.lineTo(6 * sc, -1 * sc); ctx.stroke(); }
    } else {
      const s = A.sepT, d = s * s * 9 * sc + s * 6 * sc;
      ctx.save(); ctx.translate(0, -73 * sc - d); drawFlame(sc * 0.8, 1, altK, 6); drawShip(sc); ctx.restore();
      ctx.save(); ctx.translate(-s * 3 * sc, s * 8 * sc); ctx.translate(0, -36 * sc); ctx.rotate(-Math.min(Math.PI * 0.9, s * s * 0.25)); ctx.translate(0, 36 * sc); drawBooster(sc); ctx.restore();
      if (s < 0.6 && A.v.s.id === 'hot') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, -73 * sc, 0, 0, -73 * sc, 40 * sc); g.addColorStop(0, `rgba(255,220,170,${0.9 * (1 - s / 0.6)})`); g.addColorStop(1, 'rgba(255,120,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -73 * sc, 40 * sc, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    }
    ctx.restore();
  } else if (A.failed === 'buckle' && A.failT < 1.3) {
    // the stack folds at the interstage, then breaks apart
    const f = A.failT;
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(pitch);
    ctx.save(); ctx.translate(-f * 14 * sc, f * 10 * sc); ctx.rotate(-f * 1.4); drawBooster(sc); ctx.restore();
    ctx.save(); ctx.translate(f * 18 * sc, -73 * sc - f * 6 * sc); ctx.rotate(0.12 + f * 2.2); drawShip(sc); ctx.restore();
    ctx.restore();
  } else if (A.failed === 'cascade' && A.failT < 0.9) {
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(pitch + A.failT * 0.8); drawBooster(sc); ctx.translate(0, -73 * sc); drawShip(sc); ctx.restore();
  }
  if (A.bolt > 0) { A.bolt -= 1 / 60; ctx.strokeStyle = '#e8f0ff'; ctx.lineWidth = 3; ctx.beginPath(); let x = rx + 80, y = 0; ctx.moveTo(x, y); while (y < ry - 60 * sc) { x += (Math.random() - 0.5) * 60; y += 30; ctx.lineTo(x, y); } ctx.lineTo(rx, ry - 60 * sc); ctx.stroke(); }
  drawParticles();
  ascentHUD();
}
function gauge(x, y, w, label, val, max, opts = {}) {
  text(label, x, y - 6, 10, { ls: 2.5, color: '#9aa0a8' });
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, w, 6);
  if (opts.band) { ctx.fillStyle = 'rgba(61,220,132,.45)'; ctx.fillRect(x + w * opts.band[0] / max, y - 2, w * (opts.band[1] - opts.band[0]) / max, 10); }
  ctx.fillStyle = opts.color || '#fff'; ctx.fillRect(x, y, w * clamp(val / max, 0, 1), 6);
  if (opts.limit) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x + w * opts.limit / max - 1, y - 4, 2, 14); }
  if (opts.right) text(opts.right, x + w, y - 6, 11, { align: 'right', mono: true, color: opts.rc || '#fff' });
  if (opts.bandLabel && opts.band) {
    const bx = x + w * (opts.band[0] + opts.band[1]) / 2 / max, on = opts.bandOn;
    ctx.fillStyle = on ? `rgba(61,220,132,${0.6 + 0.4 * Math.sin(S.t * 9)})` : 'rgba(61,220,132,.9)';
    ctx.fillRect(x + w * opts.band[0] / max, y - 3, w * (opts.band[1] - opts.band[0]) / max, 12);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + w * clamp(val / max, 0, 1) - 1, y - 5, 2, 16);
    text('▲ ' + opts.bandLabel, clamp(bx, x + 40, x + w - 40), y + 20, 9, { align: 'center', ls: 2, color: '#3ddc84', weight: 600 });
  }
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function coachDraw(c, y, narrow) {
  if (!c) return;
  let size = narrow ? 12 : 14.5; const ls = narrow ? 1.6 : 3;
  let w; ctx.save(); spacing(ls);
  for (; ; size -= 0.5) { ctx.font = `600 ${size}px Helvetica Neue, Helvetica, Arial, sans-serif`; w = ctx.measureText(c.t).width + 30; if (w <= W - 12 || size <= 8.5) break; }
  ctx.restore(); w = Math.min(W - 12, w);
  const a = c.pulse ? 0.82 + 0.18 * Math.sin(S.t * 9) : 1;
  ctx.save(); rr(W / 2 - w / 2, y - size - 9, w, size + 20, (size + 20) / 2); ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fill();
  ctx.globalAlpha = a; ctx.strokeStyle = c.c; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
  text(c.t, W / 2, y + 1, size, { align: 'center', ls, color: c.c, alpha: a, weight: 600 });
}
function stageState(A, res) {
  if (!A || A.staged || A.failed || !A.promptShown || A.flaws.has('dry')) return '';
  if (res > A.target + A.band) return 'soon';
  if (res >= A.target - A.band / 2) return 'window';
  return 'late';
}
function ascentCoach(A, st, v, res) {
  if (A.countdown > 0 || A.staged || A.failed) return null;
  const ss = stageState(A, res);
  if (ss === 'window') return { t: TOUCH ? 'STAGE NOW · TAP STAGE' : 'STAGE NOW · PRESS SPACE', c: '#3ddc84', pulse: true };
  if (ss === 'late') return { t: 'BOOSTER FUEL LOW: STAGE!', c: '#ff4d4d', pulse: true };
  if (ss === 'soon') return { t: 'STAGE WINDOW AHEAD · WATCH BOOSTER FUEL', c: '#ffffff' };
  if (A.promptShown) return null;
  const minus = TOUCH ? 'THROTTLE −' : 'THROTTLE ↓ / S', plus = TOUCH ? 'THROTTLE +' : 'THROTTLE ↑ / W';
  const hi = st.load > v.limit * 0.87, preQ = !A.maxQcalled && st.t < 95;
  if (v.pf.id === 'aggressive' && st.t < 100) return hi ? { t: 'HIGH LOAD · THROTTLE LOCKED BY BUILD', c: '#ffc53d', pulse: true } : preQ ? { t: 'MAX-Q AHEAD · AGGRESSIVE PROFILE', c: '#9aa0a8' } : null;
  if (hi) return { t: `HIGH LOAD: HOLD ${minus}`, c: '#ffc53d', pulse: true };
  if (preQ && st.load > v.limit * 0.45) return v.pf.id === 'auto' ? { t: 'MAX-Q AHEAD: AUTO-THROTTLE EASING', c: '#9fd3ff' } : { t: `MAX-Q AHEAD: EASE ${minus}`, c: '#ffc53d' };
  if (preQ) return { t: 'CLIMBING · WATCH THE LOAD BAR', c: '#9aa0a8' };
  if (st.throttle < 0.97) return v.pf.id === 'auto' && st.t < 110 ? { t: 'PAST MAX-Q: AUTO-THROTTLE TO 100%', c: '#9fd3ff' } : { t: `PAST MAX-Q: FULL ${plus}`, c: '#3ddc84', pulse: true };
  return { t: 'PAST MAX-Q · FULL THROTTLE', c: '#9aa0a8' };
}
function drawEngines(x, y, r, v, out) {
  const rings = v.e.ring; const total = v.e.count; let idx = 0;
  const radii = [r * 0.18, r * 0.52, r * 0.9];
  const outSet = new Set(); for (let i = 0; i < out; i++) outSet.add(total - 1 - i * 7 % total);
  rings.forEach((n, ri) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + ri * 0.3; const ex = x + Math.cos(a) * radii[ri], ey = y + Math.sin(a) * radii[ri];
    ctx.beginPath(); ctx.arc(ex, ey, r * 0.075, 0, Math.PI * 2); ctx.fillStyle = outSet.has(idx) ? '#ff4d4d' : '#fff'; ctx.fill(); idx++; } });
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, Math.PI * 2); ctx.stroke();
}
function ascentHUD() {
  const A = S.asc, st = A.st, v = A.v;
  const narrow = W < 700 || H < 500;
  const speed = Math.hypot(st.vx, st.vy) * 3.6;
  const tt = Math.max(0, st.t) | 0; const ts = `T+ ${String(tt / 3600 | 0).padStart(2, '0')}:${String((tt / 60 | 0) % 60).padStart(2, '0')}:${String(tt % 60).padStart(2, '0')}`;
  const res = P.reserveFrac(st), loadK = st.load / 1000, lim = v.limit / 1000;
  const loadOpts = { limit: lim, color: loadK > lim ? '#ff4d4d' : loadK > lim * 0.87 ? '#ffc53d' : '#fff', right: `${fmt(loadK, 1)} kPa`, rc: loadK > lim ? '#ff4d4d' : '#fff' };
  const ss = stageState(A, res);
  const resOpts = { band: [(A.target - A.band / 2) * 100, (A.target + A.band) * 100], right: `${fmt(res * 100, 1)}%`, color: ss === 'late' ? '#ff4d4d' : 'rgba(255,255,255,.75)', rc: ss === 'late' ? '#ff4d4d' : ss === 'window' ? '#3ddc84' : '#fff', bandLabel: A.flaws.has('dry') ? null : 'STAGE WINDOW', bandOn: ss === 'window' };
  if (narrow) {
    const grd = ctx.createLinearGradient(0, 0, 0, 200); grd.addColorStop(0, 'rgba(0,0,0,.85)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = grd; ctx.fillRect(0, 0, W, 200);
    text(A.countdown > 0 ? `T- 00:00:0${Math.ceil(A.countdown)}` : ts, W / 2, 44, 24, { align: 'center', mono: true, ls: 2 });
    text('STARSHIP ' + S.mission.name, W / 2, 62, 9, { align: 'center', ls: 3, color: '#9aa0a8' });
    const lx = 16, y0 = 92;
    text('SPEED', lx, y0, 9, { ls: 2, color: '#9aa0a8' }); text(`${fmt(speed)} KM/H`, lx + (W < 360 ? 66 : 72), y0, W < 360 ? 12.5 : 14, { mono: true });
    text('ALT', lx, y0 + 22, 9, { ls: 2, color: '#9aa0a8' }); text(`${fmt(st.h / 1000, 1)} KM`, lx + (W < 360 ? 66 : 72), y0 + 22, W < 360 ? 12.5 : 14, { mono: true });
    text('THROTTLE', lx, y0 + 44, 9, { ls: 2, color: '#9aa0a8' }); text(`${Math.round(st.throttle * 100)}%`, lx + (W < 360 ? 66 : 72), y0 + 44, W < 360 ? 12.5 : 14, { mono: true, color: st.throttle < 0.95 ? '#9fd3ff' : '#fff' });
    const gw = W * (W < 360 ? 0.4 : 0.44), gx = W - gw - 16;
    gauge(gx, y0 - 2, gw, W < 360 ? 'LOAD' : 'LOAD (MAX-Q)', loadK, 70, loadOpts);
    if (st.stress > 0.02) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(gx, y0 + 7, gw * clamp(st.stress, 0, 1), 2); }
    gauge(gx, y0 + 34, gw, W < 360 ? 'FUEL' : 'BOOSTER FUEL', res * 100, 100 * v.boosterProp / P.BOOSTER_PROP, resOpts);
    drawEngines(W - 34, 44, 18, v, st.enginesOut);
  } else {
  const by = H - 110;
  const grd = ctx.createLinearGradient(0, by - 50, 0, H); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.85)'); ctx.fillStyle = grd; ctx.fillRect(0, by - 50, W, H - by + 50);
  text(A.countdown > 0 ? `T- 00:00:0${Math.ceil(A.countdown)}` : ts, W / 2, by + 10, 26, { align: 'center', mono: true, ls: 2 });
  text('STARSHIP ' + S.mission.name, W / 2, by + 32, 10, { align: 'center', ls: 4, color: '#9aa0a8' });
  const lx = Math.max(24, W * 0.06);
  text('SUPER HEAVY', lx, by - 6, 10, { ls: 4, color: '#9aa0a8' });
  text('SPEED', lx, by + 14, 10, { ls: 2, color: '#9aa0a8' }); text(`${fmt(speed)} KM/H`, lx + 70, by + 14, 16, { mono: true });
  text('ALTITUDE', lx, by + 38, 10, { ls: 2, color: '#9aa0a8' }); text(`${fmt(st.h / 1000, 1)} KM`, lx + 70, by + 38, 16, { mono: true });
  text('THROTTLE', lx, by + 62, 10, { ls: 2, color: '#9aa0a8' }); text(`${Math.round(st.throttle * 100)}%`, lx + 70, by + 62, 16, { mono: true, color: st.throttle < 0.95 ? '#9fd3ff' : '#fff' });
  const gw = Math.min(280, W * 0.26), gx = W - gw - Math.max(24, W * 0.05) - 90;
  gauge(gx, by - 4, gw, 'STRUCTURAL LOAD (MAX-Q)', loadK, 70, loadOpts);
  if (st.stress > 0.02) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(gx, by + 5, gw * clamp(st.stress, 0, 1), 2); }
  gauge(gx, by + 30, gw, 'BOOSTER FUEL', res * 100, 100 * v.boosterProp / P.BOOSTER_PROP, resOpts);
  text(`MAX-Q ${fmt(st.maxQ / 1000, 1)} kPa · Q ${fmt(st.q / 1000, 1)} kPa · ${fmt(st.accel || 0, 1)} G`, gx, by + 66, 10.5, { mono: true, color: '#9aa0a8' });
  drawEngines(W - Math.max(24, W * 0.05) - 36, by + 22, 34, v, st.enginesOut);
  }
  coachDraw(ascentCoach(A, st, v, res), LS() ? H - 104 : narrow ? Math.min(H * 0.6, H - 150) : H * 0.17, narrow);
  if (!TOUCH && !DEMO && !narrow && A.countdown <= 0 && !A.staged && !A.failed) text('↑/W THROTTLE +  ·  ↓/S THROTTLE −  ·  SPACE STAGE', W / 2, 24, 10, { align: 'center', ls: 2.5, color: '#8a8f98' });
}

// ---------------------------------------------------------------- BOOSTBACK + LANDING
function startBoostback() {
  const A = S.asc;
  const ship = { orbit: A.margin >= 0, margin: A.margin };
  ship.reentry = ship.orbit && !A.flaws.has('heat');
  S.ship = ship;
  S.scene = 'boostback'; S.bb = { t: 0, tumble: A.flaws.has('fins') };
  if (S.bb.tumble) {
    banner('BOOSTBACK FLIP', 'Not enough grid-fin authority…', 2.2, '#ffc53d');
    SND.play('fins', { rate: 24, dur: 2.6, g: 0.5 }); later(0.7, () => SND.play('whoosh', { dur: 0.7 })); later(1.4, () => SND.play('whoosh', { dur: 0.6, g: 0.5 }));
    later(2.4, () => { S.bb.broke = true; S.flash = 0.9; S.shake = 0.8; boom(W / 2, H * 0.55, 1.5); SND.play('explosion'); banner('LOSS OF CONTROL', lessonFor('fins').head, 2.6, '#ff4d4d'); });
    later(4.6, () => finish({ kind: 'fail', cause: 'fins', phase: 'boostback' }));
    return;
  }
  if (A.hotDamage) return finish({ kind: 'fail', cause: 'hotstage', phase: 'boostback' });
  if (A.reserve < P.BOOSTBACK_COST) { S.bb.fail = true; banner('BOOSTBACK BURN', 'Propellant low…', 2.5, '#ffc53d'); later(2.8, () => finish({ kind: 'fail', cause: 'boostback', phase: 'boostback' })); return; }
  banner('BOOSTBACK BURN', 'Booster flipping and heading home to Starbase', 2.8);
  later(DEMO && START === 'landing' ? 0.1 : 3.0, startLanding);
}
function boostbackDraw(dt) {
  const B = S.bb; B.t += dt; drawSky(60000 - B.t * 8000);
  const sc = H * 0.3 / 71;
  if (!B.broke) {
    ctx.save(); ctx.translate(W / 2, H * 0.55);
    const rot = B.tumble ? Math.PI * 0.5 + B.t * B.t * 2.2 : Math.PI * 0.5 - Math.min(1, B.t / 1.4) * Math.PI * 0.5;
    ctx.rotate(rot + Math.PI); ctx.translate(0, 36 * sc); ctx.rotate(Math.PI);
    if (!B.fail || B.t < 1) drawFlame(sc * 0.7, B.tumble ? (Math.random() < 0.4 ? 0.2 : 0.7) : 0.8, 0.8, 5);
    drawBooster(sc); ctx.restore();
    if (B.tumble) { ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.arc(W / 2, H * 0.55, 38 * sc, 0, Math.PI * 2); ctx.stroke(); }
  }
  const shipTxt = S.ship.orbit ? `SHIP: ORBIT ✓ · ${P.PAYLOADS.find(p => p.id === S.cfg.payload).sats} STARLINK DEPLOYING` : 'SHIP: SHORT OF ORBIT ✗ (not enough ΔV)';
  text(shipTxt, W / 2, H * 0.86, 13, { align: 'center', ls: 3, color: S.ship.orbit ? '#3ddc84' : '#ffc53d' });
  drawParticles();
}
function startLanding() {
  const A = S.asc || {};
  const reserve = A.reserve != null ? A.reserve : P.BOOSTBACK_COST + P.LANDING_IDEAL + 0.004;
  const fuel = Math.max(0, (reserve - P.BOOSTBACK_COST) / P.LANDING_IDEAL * 14 * (has('omar') ? 1.15 : 1));
  const side = rng() < 0.5 ? -1 : 1;
  const fins = P.FINS.find(f => f.id === S.cfg.fins);
  const k = (has('lena') ? 1.3 : 1) * (TOUCH ? 1.15 : 1);
  const y0 = parseFloat(qs.get('alt')) || 1900; const vy0 = -Math.min(190, Math.sqrt(2 * 9.81 * y0) * 0.9 + 40);
  S.land = { x: side * (35 + rng() * 25) * Math.min(1, y0 / 1900), y: y0, vx: -side * (1 + rng() * 3), vy: vy0, thr: 0, fuel, fuel0: fuel, lit: false, everLit: false, lat: fins.lateral, steer: 0,
    win: { x: 3.5 * k, vy: 5.5 * k, vx: 2.5 * k }, catchY: 36, windDir: rng() < 0.5 ? -1 : 1, windPh: rng() * 6, t: 0, done: false, caught: false, cam: { sc: 0.3, cy: 900 }, armClose: 0, prevY: y0, minAlt: 1e9, igniteCued: false };
  S.scene = 'landing'; S.timeScale = 1;
  banner('BOOSTER RETURN', TOUCH ? 'Steer ◀ ▶ into the green laser · Burn at the BURN LINE' : 'Steer ← → into the green laser · Burn ↑ at the BURN LINE', 3.2);
  SND.play('fins', { dur: 1.2 });
  tipFlight('Line up early: keep the booster inside the green laser and the ◆ predicted touchdown between the arms. Light the burn at the BURN LINE; Super Heavy can\'t hover.');
}
function windAccel(L) { return S.wx.wind * 0.05 * L.windDir * (0.55 + 0.45 * Math.sin(L.t * 0.7 + L.windPh)); }
const A_MAX = 27, MIN_THR = 0.35, G = 9.81;
function landingUpdate(dt) {
  const L = S.land; if (L.done) { if (L.caught) { L.armClose = Math.min(1, L.armClose + dt * 3); L.settle = (L.settle || 0) + dt; } return; }
  L.t += dt;
  // controls
  let up = S.keys.up, down = S.keys.down, left = S.keys.left, right = S.keys.right;
  if (DEMO || S.auto) { const ap = autopilot(L); up = ap.up; down = ap.down; left = ap.left; right = ap.right; if (ap.thr != null && L.lit) L.thr = ap.thr; }
  if (up && L.fuel > 0) { if (!L.lit) { L.lit = true; L.everLit = true; L.thr = Math.max(L.thr, 0.6); banner('LANDING BURN', 'Engines relit', 1.8); SND.play('bang', { k: 0.35 }); } else if (!DEMO && !S.auto) L.thr = clamp(L.thr + 1.4 * dt, MIN_THR, 1); }
  if (down && L.lit && !DEMO && !S.auto) L.thr = clamp(L.thr - 1.4 * dt, MIN_THR, 1);
  L.steer = lerp(L.steer, (right ? 1 : 0) - (left ? 1 : 0), clamp(dt * 8, 0, 1));
  if (FEATURE_WAVEOFF && S.keys.x && !DEMO) return waveOff();
  if (L.lit) { L.fuel -= L.thr * dt; if (L.fuel <= 0) { L.fuel = 0; L.lit = false; L.thr = 0; L.flameOut = true; L.sputter = 1.1; SND.play('sputter'); banner('PROPELLANT DEPLETED', 'Engines sputtered out', 2, '#ff4d4d'); } }
  const thrA = L.lit ? L.thr * A_MAX : 0;
  const drag = 9.81 / (220 * 220);
  const ay = thrA - G + drag * L.vy * L.vy * (L.vy < 0 ? 1 : -1);
  const ax = L.steer * L.lat + windAccel(L) - drag * 4 * L.vx * Math.abs(L.vx);
  L.vx += ax * dt; L.vy += ay * dt; L.prevY = L.y; L.x += L.vx * dt; L.y += L.vy * dt;
  const stopD = L.vy < 0 ? (L.vy * L.vy) / (2 * (A_MAX - G)) : 0;
  L.stopD = stopD;
  if (!L.everLit && !L.igniteCued && L.y <= burnAlt(L)) { L.igniteCued = true; banner('LANDING BURN · NOW', TOUCH ? 'Tap THROTTLE +' : 'Press ↑ / W', 2, '#3ddc84'); }
  // catch check
  if (L.prevY > L.catchY && L.y <= L.catchY) {
    const dx = Math.abs(L.x), dvy = Math.abs(L.vy), dvx = Math.abs(L.vx);
    L.contact = { dx, dvy, dvx };
    if (dx <= L.win.x && dvy <= L.win.vy && dvx <= L.win.vx) return caught();
    if (dx <= 10) return landFail(!L.everLit ? 'never' : dx > L.win.x ? 'offcenter' : dvy > L.win.vy ? (L.everLit ? (L.flameOut ? 'fuel' : 'toohot') : 'never') : 'sideways');
  }
  if (L.y <= 0) { L.y = 0; return landFail(!L.everLit ? 'never' : L.flameOut ? 'fuel' : 'missed'); }
  if (L.y > 4000 || L.t > 90) return landFail('fuel');
}
function autopilot(L) {
  const out = { up: false, down: false, left: false, right: false, thr: null };
  const hgt = L.y - L.catchY;
  const desVx = clamp(-L.x * 0.22, -10, 10);
  const needAx = (desVx - L.vx) * 1.4 - windAccel(L);
  if (needAx > 0.6) out.right = true; else if (needAx < -0.6) out.left = true;
  const vT = -3.6;
  const aNeed = hgt > 0.5 ? (L.vy * L.vy - vT * vT) / (2 * hgt) + G : G;
  if (!L.lit && aNeed > A_MAX * 0.9 && L.vy < 0) out.up = true;
  if (L.lit) { out.up = true; out.thr = clamp(aNeed / A_MAX + (L.vy > vT ? -0.15 : 0), MIN_THR, 1); }
  return out;
}
function caught() {
  const L = S.land; L.done = true; L.caught = true;
  const c = L.contact; L.x = 0; L.vx = 0; L.vy = 0; L.y = L.catchY; L.lit = false; L.thr = 0;
  const acc = clamp(100 - 30 * c.dx / L.win.x - 25 * c.dvy / L.win.vy - 20 * c.dvx / L.win.vx, 1, 100);
  L.acc = acc;
  S.timeScale = 0.18; S.shake = 0.7; S.flash = 1; S.slowmo = 1.1;
  banner('BOOSTER CAUGHT', `CATCH ACCURACY ${Math.round(acc)}%`, 4.5, '#ffffff');
  for (let i = 0; i < 90; i++) { const a = rng() * Math.PI * 2, s = 40 + rng() * 220; particles.push({ wx: 0, wy: 100, x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 1 + rng(), max: 2, r: 1 + rng() * 2, c: '255,230,170', spark: true }); }
  SND.play('clunk'); later(0.32, () => SND.play('sting'));
  later(3.8, () => (S.ship && (S.ship.orbit || (S.asc && S.asc.flaws.has('heat')))) ? startReentry() : finish({ kind: 'win' }));
}
function landFail(cause) {
  const L = S.land; if (S.asc && S.asc.flaws.has('dry')) cause = 'dry';
  L.done = true; L.failCause = cause; S.flash = 1; S.shake = 0.9;
  if (cause === 'offcenter' || cause === 'sideways') SND.play('metal'); SND.play('explosion');
  L.boomAt = { x: L.x, y: Math.max(0, L.y) }; L.exploded = true;
  banner('RAPID UNSCHEDULED DISASSEMBLY', lessonFor(cause).head, 3, '#ff4d4d');
  for (let i = 0; i < 220; i++) { const a = rng() * Math.PI * 2, s = 30 + rng() * 280; particles.push({ wx: L.x, wy: Math.max(5, L.y + 30), x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8 + rng() * 1.6, max: 2.4, r: 2 + rng() * 5, c: rng() < 0.5 ? '255,200,120' : '255,100,50', spark: true }); }
  later(2.8, () => finish({ kind: 'fail', cause, phase: 'landing' }));
}
function waveOff() {
  const L = S.land; L.done = true; L.waved = true;
  banner('WAVE-OFF', 'Booster diverting to the Gulf of Mexico', 2.6, '#ffc53d');
  later(2.6, () => finish({ kind: 'divert' }));
}
// ---- landing guidance helpers
function burnAlt(L) { const v = Math.max(0, -L.vy); return L.catchY + v * v / (2 * (A_MAX - G)) * 1.25 + 60; }
function landingPredict(L) {
  const hgt = Math.max(0, L.y - L.catchY), sp = Math.max(4, -L.vy), burnH = Math.max(0, burnAlt(L) - L.catchY);
  const slow = Math.max(3, (sp + 3.6) / 2);
  let T = (L.lit || hgt <= burnH) ? hgt / slow : (hgt - burnH) / sp + burnH / slow;
  T = Math.min(T, 12);
  return { x: L.x + L.vx * T + 0.5 * windAccel(L) * T * T * 0.6, T };
}
function pipOn(L) { const h = L.y - L.catchY; return !L.done && h < 320; }
function LS() { return H < 500 && W > H; }
function compactHUD() { return W < 700 || H < 500; }
function pipRect() {
  if (LS()) { const h = Math.round(H - 90 - 118), w = Math.round(h * 0.9); return { x: W - w - 14, y: 88, w, h }; }
  if (W < 700) { const w = Math.round(Math.min(W * 0.4, 190)); return { x: W - w - 10, y: 170, w, h: Math.round(w * 1.15) }; }
  const w = Math.round(clamp(H * 0.32, 160, 240)); return { x: W - w - Math.max(24, W * 0.05), y: Math.round(H * 0.33), w, h: Math.round(w * 1.12) };
}
// tower, arms, laser corridor, predicted touchdown and booster, for a given camera
function drawCatchWorld(L, toS, sc, o = {}) {
  const [tx, ty] = toS(0, 0);
  const tw = 12 * sc, th = 146 * sc;
  ctx.save(); ctx.fillStyle = '#121519'; ctx.fillRect(tx - tw / 2, ty - th, tw, th);
  ctx.strokeStyle = '#59606a'; ctx.lineWidth = Math.max(0.5, sc * 0.3);
  for (let i = 0; i < 24; i++) { const y0 = ty - th * i / 24, y1 = ty - th * (i + 1) / 24; ctx.beginPath(); ctx.moveTo(tx - tw / 2, y0); ctx.lineTo(tx + tw / 2, y1); ctx.moveTo(tx + tw / 2, y0); ctx.lineTo(tx - tw / 2, y1); ctx.stroke(); }
  ctx.strokeRect(tx - tw / 2, ty - th, tw, th); ctx.restore();
  ctx.fillStyle = '#2b3037'; ctx.fillRect(tx - 16 * sc, ty - 22 * sc, 32 * sc, 4 * sc); ctx.fillRect(tx - 15 * sc, ty - 22 * sc, 3 * sc, 22 * sc); ctx.fillRect(tx + 12 * sc, ty - 22 * sc, 3 * sc, 22 * sc);
  const armY = 100, close = L.caught ? L.armClose : 0, gap = lerp(16, 5.6, close);
  const [, ay] = toS(0, armY);
  const aligned = Math.abs(L.x) <= L.win.x, pred = o.pred, predOk = pred && Math.abs(pred.x) <= L.win.x;
  // laser guide + landing corridor straight up from the arms
  if (!L.done) {
    const col = aligned ? '61,220,132' : '255,197,61';
    const top = o.clipTop || 0;
    const g = ctx.createLinearGradient(0, ay, 0, top); g.addColorStop(0, `rgba(${col},.95)`); g.addColorStop(1, `rgba(${col},.15)`);
    ctx.fillStyle = `rgba(${col},${o.pip ? 0.1 : 0.08})`; ctx.fillRect(tx - L.win.x * sc, top, 2 * L.win.x * sc, ay - top);
    ctx.fillStyle = g; ctx.fillRect(tx - 0.75, top, 1.5, ay - top);
    ctx.fillStyle = `rgba(${col},.35)`; ctx.fillRect(tx - L.win.x * sc - 0.5, top, 1, ay - top); ctx.fillRect(tx + L.win.x * sc - 0.5, top, 1, ay - top);
  }
  // chopsticks + arm targets
  ctx.fillStyle = '#c9ced5';
  ctx.fillRect(tx - tw / 2 - 2 * sc, ay - 4 * sc, tw + 4 * sc, 6 * sc);
  ctx.fillRect(tx - gap * sc - 22 * sc, ay - 2.2 * sc, 22 * sc, 2.6 * sc);
  ctx.fillRect(tx + gap * sc, ay - 2.2 * sc, 22 * sc, 2.6 * sc);
  ctx.save();
  const glow = L.caught || (!L.done && aligned);
  if (glow) { ctx.shadowColor = '#3ddc84'; ctx.shadowBlur = o.pip ? 18 : 12; ctx.fillStyle = '#3ddc84'; } else ctx.fillStyle = L.done ? '#ffffff' : '#ffc53d';
  const tW = Math.max(2, 1.6 * sc), tH = Math.max(5, 5 * sc);
  ctx.fillRect(tx - gap * sc - tW, ay - tH * 0.7, tW, tH); ctx.fillRect(tx + gap * sc, ay - tH * 0.7, tW, tH);
  ctx.restore();
  if (!L.done) {
    const ok = aligned && Math.abs(L.vy) <= L.win.vy && Math.abs(L.vx) <= L.win.vx;
    ctx.strokeStyle = ok ? 'rgba(61,220,132,.9)' : 'rgba(255,255,255,.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.strokeRect(tx - (4.5 + L.win.x) * sc, ay - 14 * sc, (9 + 2 * L.win.x) * sc, 18 * sc); ctx.setLineDash([]);
    // predicted touchdown at arm height
    if (pred) {
      const [pxs] = toS(clamp(pred.x, -70, 70), armY), px = clamp(pxs, 8, W - 8), r = o.pip ? 7 : 6;
      ctx.save(); ctx.strokeStyle = predOk ? '#3ddc84' : '#ffc53d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, ay - 9 * (o.pip ? 1.4 : 1) - r); ctx.lineTo(px + r, ay - 9 * (o.pip ? 1.4 : 1)); ctx.lineTo(px, ay - 9 * (o.pip ? 1.4 : 1) + r); ctx.lineTo(px - r, ay - 9 * (o.pip ? 1.4 : 1)); ctx.closePath(); ctx.stroke(); ctx.restore();
      if (o.main && !o.pip) text('PREDICTED', px, ay - 9 - r - 5, 8.5, { align: 'center', ls: 1.5, color: predOk ? '#3ddc84' : '#ffc53d' });
    }
  }
  // booster
  if (!L.exploded) {
    const [bx, byy] = toS(L.x, L.y);
    if (o.pip && !L.done) { // booster's own centreline down to the arms
      ctx.save(); ctx.strokeStyle = aligned ? 'rgba(61,220,132,.9)' : 'rgba(255,255,255,.75)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, Math.max(o.clipTop || 0, Math.min(byy - 71 * sc, ay))); ctx.lineTo(bx, ay + 12); ctx.stroke(); ctx.restore();
    }
    const tilt = L.caught ? 0 : clamp(L.steer * 0.08 + L.vx * 0.006, -0.22, 0.22);
    ctx.save(); ctx.translate(bx, byy); ctx.rotate(tilt);
    if (L.lit) drawFlame(sc, L.thr, 0.1, 5);
    else if (L.sputter > 0 && o.main) { L.sputter -= 1 / 60; if (Math.random() < 0.45) drawFlame(sc, 0.3 + Math.random() * 0.4, 0.1, 4); }
    drawBooster(sc, 1); ctx.restore();
    if (o.main && sc < 0.6) { ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(bx, byy - 36 * sc, 16, 0, Math.PI * 2); ctx.stroke(); }
  }
}
function landingDraw() {
  const L = S.land, compact = compactHUD(), hgt = L.y - L.catchY, pip = pipOn(L);
  // camera: follow the booster when high; in the last ~400 m frame both the booster and the arms
  const top = Math.max(L.y + 80, 180);
  let targetSc = clamp(H * 0.8 / (top + 20), 0.9, 4.2);
  if (hgt < 420) targetSc = Math.min(targetSc, Math.max(0.9, H * (compact ? 0.5 : 0.56) / Math.max(60, L.y - 29)));
  L.cam.sc = lerp(L.cam.sc, targetSc, 0.08);
  const sc = L.cam.sc;
  const lowA = LS() ? 0.3 : W < 700 ? 0.28 : 0.2;
  const anchor = H * lerp(lowA, W < 700 && !LS() ? 0.45 : 0.38, clamp((hgt - 300) / 300, 0, 1));
  const gy = Math.max(H * (H < 500 ? 0.88 : 0.9), anchor + (L.y + 71) * sc);
  const R = pipRect();
  const colC = pip && (W < 700 || LS()) ? (R.x - 6) / 2 : W / 2;
  L.cam.cx = lerp(L.cam.cx == null ? colC : L.cam.cx, colC, 0.08);
  const cx = L.cam.cx - clamp(L.x, -60, 60) * sc * 0.3;
  const toS = (x, y) => [cx + x * sc, gy - y * sc];
  drawSky(clamp(L.y * 6, 0, 30000));
  ctx.fillStyle = '#0b0d10'; ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = '#071019'; const seaX = toS(220, 0)[0]; ctx.fillRect(seaX, gy, W - seaX, H - gy);
  ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(0, gy, W, 1);
  const pred = L.done ? null : landingPredict(L);
  drawCatchWorld(L, toS, sc, { pred, main: true });
  // burn line (everyone); Jules adds a countdown
  if (!L.done && !L.everLit && L.vy < 0) {
    const ba = burnAlt(L), [, my] = toS(0, ba);
    if (my > 0 && my < H) {
      const now = L.y <= ba;
      ctx.strokeStyle = now ? 'rgba(61,220,132,.95)' : 'rgba(159,211,255,.8)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, my); ctx.lineTo(W, my); ctx.stroke(); ctx.setLineDash([]);
      const secs = has('jules') ? ` · ${fmt(Math.max(0, (L.y - ba) / Math.max(1, -L.vy)), 1)} s` : '';
      text(`BURN LINE${secs}`, 12, my - 6, 10, { ls: 3, color: now ? '#3ddc84' : '#9fd3ff' });
    }
  }
  drawParticles(toS);
  if (toS(0, 146)[1] > H - 40 && !L.done) {
    const mx = clamp(toS(0, 0)[0], 60, W - 60);
    text(`▼ TOWER ${fmt(L.y - L.catchY)} m`, mx, H - (TOUCH ? 140 : 64), 12, { align: 'center', ls: 3, color: '#9fd3ff' });
  }
  // speed tag next to the booster while the arms cam is off
  if (!L.done && !pip) {
    const [bx, by] = toS(L.x, L.y + 36);
    const lines = landingTags(L);
    const right = bx + 4.5 * sc + 12, left = bx - 4.5 * sc - 12, useRight = right + 120 < W || left - 120 < 0;
    lines.forEach((ln, i) => text(ln[0], useRight ? right : left, clamp(by, 200, H - 170) + i * 17, i ? 11 : 14, { mono: true, align: useRight ? 'left' : 'right', color: ln[1], weight: 600, alpha: ln[2] ? 0.6 + 0.4 * Math.sin(S.t * 10) : 1 }));
  }
  if (!L.caught) { if (pip) drawPip(L, pred, R); landingHUD(pred); }
  else if (W >= 700) text('UNOFFICIAL FAN GAME · NOT AFFILIATED WITH OR ENDORSED BY SPACEX', W / 2, 40, 11, { align: 'center', ls: 3, color: '#c9cdd4' });
  else { text('UNOFFICIAL FAN GAME', W / 2, 36, 10, { align: 'center', ls: 3, color: '#c9cdd4' }); text('NOT AFFILIATED WITH OR ENDORSED BY SPACEX', W / 2, 52, 9, { align: 'center', ls: 1.5, color: '#c9cdd4' }); }
}
function landingTags(L) {
  const vOk = Math.abs(L.vy) <= L.win.vy, out = [[`${L.vy < 0 ? '↓' : '↑'} ${fmt(Math.abs(L.vy), 1)} m/s`, vOk ? '#3ddc84' : '#ffffff']];
  if (!L.everLit && L.vy < 0) { const ba = burnAlt(L); out.push(L.y <= ba ? ['BURN NOW ▲', '#3ddc84', true] : [`BURN IN ${fmt(L.y - ba)} m`, '#9fd3ff']); }
  else if (L.lit && L.vy < -L.win.vy && L.y - L.catchY < 120) out.push(['MORE THROTTLE', '#ffc53d', true]);
  else if (L.lit && L.vy > -1.5) out.push(['EASE THROTTLE', '#ffc53d', true]);
  return out;
}
function drawPip(L, pred, R) {
  const fade = clamp((320 - (L.y - L.catchY)) / 40, 0, 1);
  ctx.save(); ctx.globalAlpha = fade;
  rr(R.x, R.y, R.w, R.h, 10); ctx.save(); ctx.clip();
  const g = ctx.createLinearGradient(0, R.y, 0, R.y + R.h); g.addColorStop(0, '#16203a'); g.addColorStop(1, '#3a3346'); ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, R.h);
  const psc = R.w / 40, pcx = R.x + R.w / 2, aySc = R.y + R.h * 0.62, pgy = aySc + 100 * psc;
  const toP = (x, y) => [pcx + x * psc, pgy - y * psc];
  drawCatchWorld(L, toP, psc, { pred, pip: true, clipTop: R.y });
  // booster off-frame indicators
  const bxp = pcx + L.x * psc, aligned = Math.abs(L.x) <= L.win.x;
  if (bxp < R.x + 6 || bxp > R.x + R.w - 6) text(`${L.x < 0 ? '◀' : ''} BOOSTER ${fmt(Math.abs(L.x), 0)} m ${L.x > 0 ? '▶' : ''}`, L.x < 0 ? R.x + 8 : R.x + R.w - 8, R.y + 42, 10, { align: L.x < 0 ? 'left' : 'right', color: '#ffc53d', weight: 600 });
  // readouts inside the cam
  const tags = landingTags(L);
  const fs = R.w < 180 ? 15 : 17;
  ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(R.x, R.y + R.h - 54, R.w, 54);
  text(tags[0][0], R.x + 9, R.y + R.h - 36, fs, { mono: true, color: tags[0][1], weight: 600 });
  text(`OFFSET ${L.x >= 0 ? '+' : ''}${fmt(L.x, 1)} m`, R.x + 9, R.y + R.h - 21, 10.5, { mono: true, color: aligned ? '#3ddc84' : '#ffc53d', weight: 600 });
  if (tags[1]) text(tags[1][0], R.x + 9, R.y + R.h - 7, 10.5, { mono: true, color: tags[1][1], weight: 600, alpha: tags[1][2] ? 0.6 + 0.4 * Math.sin(S.t * 10) : 1 });
  else text(`CATCH ≤ ${fmt(L.win.vy, 1)} m/s`, R.x + 9, R.y + R.h - 7, 9.5, { mono: true, color: '#9aa0a8' });
  ctx.restore();
  ctx.strokeStyle = aligned ? 'rgba(61,220,132,.9)' : 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; rr(R.x, R.y, R.w, R.h, 10); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(R.x + 8, R.y + 8, 78, 16);
  text('● ARMS CAM', R.x + 13, R.y + 20, 9.5, { ls: 1.5, color: '#ff6b6b', weight: 600 });
  ctx.restore();
}
// horizontal offset indicator: tower centre, catch window, booster ▼, predicted ◆, drift and wind arrows
function offsetBar(L, pred, x, y, w) {
  const RNG = 30, k = w / (2 * RNG), cx = x + w / 2, aligned = Math.abs(L.x) <= L.win.x;
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x, y, w, 4);
  for (let m = -RNG; m <= RNG; m += 10) ctx.fillRect(cx + m * k - 0.5, y - 2, 1, 8);
  ctx.fillStyle = 'rgba(61,220,132,.55)'; ctx.fillRect(cx - L.win.x * k, y - 3, 2 * L.win.x * k, 10);
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, y - 6, 2, 16);
  if (pred) { const p = clamp(cx + pred.x * k, x, x + w), ok = Math.abs(pred.x) <= L.win.x; ctx.strokeStyle = ok ? '#3ddc84' : '#ffc53d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p, y - 4); ctx.lineTo(p + 6, y + 2); ctx.lineTo(p, y + 8); ctx.lineTo(p - 6, y + 2); ctx.closePath(); ctx.stroke(); }
  const b = clamp(cx + L.x * k, x, x + w);
  ctx.fillStyle = aligned ? '#3ddc84' : '#ffc53d'; ctx.beginPath(); ctx.moveTo(b - 7, y - 13); ctx.lineTo(b + 7, y - 13); ctx.lineTo(b, y - 3); ctx.closePath(); ctx.fill();
  // drift arrow (side speed) from the booster marker
  const dl = clamp(L.vx * k * 1.5, -w / 3, w / 3);
  if (Math.abs(dl) > 3) { ctx.strokeStyle = Math.abs(L.vx) <= L.win.vx ? '#3ddc84' : '#ffc53d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b, y - 18); ctx.lineTo(b + dl, y - 18); ctx.stroke(); ctx.beginPath(); ctx.moveTo(b + dl, y - 18); ctx.lineTo(b + dl - Math.sign(dl) * 5, y - 22); ctx.lineTo(b + dl - Math.sign(dl) * 5, y - 14); ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); }
  const wa = windAccel(L), arrow = wa > 0 ? '→' : '←';
  text(`WIND ${arrow} ${S.wx.wind} KT`, x, y + 22, 9.5, { ls: 1.5, mono: true, color: '#9fd3ff' });
  text('▼ BOOSTER  ◆ PREDICTED', x + w, y + 22, 9.5, { align: 'right', ls: 1, color: '#9aa0a8' });
}
function landingHUD(pred) {
  const L = S.land, alt = L.y - L.catchY;
  const vOk = Math.abs(L.vy) <= L.win.vy, xOk = Math.abs(L.x) <= L.win.x, hOk = Math.abs(L.vx) <= L.win.vx;
  const okc = ok => ok == null ? '#fff' : ok ? '#3ddc84' : '#ffc53d';
  if (compactHUD()) {
    const landscape = LS();
    const hb = landscape ? 84 : 160;
    const grd = ctx.createLinearGradient(0, 0, 0, hb + 20); grd.addColorStop(0, 'rgba(0,0,0,.85)'); grd.addColorStop(0.8, 'rgba(0,0,0,.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = grd; ctx.fillRect(0, 0, W, hb + 20);
    const cell = (k, v, x, y, ok) => { text(k, x, y - 14, 8.5, { ls: 1.8, color: '#9aa0a8' }); text(v, x, y + 2, 15, { mono: true, color: okc(ok), weight: 600 }); };
    const items = [['ALT TO ARMS', `${fmt(Math.max(0, alt))} m`, null], ['VERT SPEED', `${fmt(L.vy, 1)} m/s`, vOk], ['OFFSET', `${L.x >= 0 ? '+' : ''}${fmt(L.x, 1)} m`, xOk], ['SIDE DRIFT', `${fmt(L.vx, 1)} m/s`, hOk]];
    if (landscape) {
      const cw = (W - 90) / 4; items.forEach((it, i) => cell(it[0], it[1], 14 + i * cw, 30, it[2]));
      offsetBar(L, pred, 22, 62, W * 0.5);
      gauge(W * 0.6, 62, W * 0.3, 'LANDING PROPELLANT', L.fuel, Math.max(L.fuel0, 1), { right: `${fmt(L.fuel, 1)} s`, color: L.fuel < 3 ? '#ff4d4d' : '#fff' });
    } else {
      const c2 = W * 0.47;
      items.forEach((it, i) => cell(it[0], it[1], i % 2 ? c2 : 14, i < 2 ? 32 : 66, it[2]));
      offsetBar(L, pred, 22, 98, W - 44);
      gauge(14, 152, W - 28, 'LANDING PROPELLANT', L.fuel, Math.max(L.fuel0, 1), { right: `${fmt(L.fuel, 1)} s`, color: L.fuel < 3 ? '#ff4d4d' : '#fff' });
    }
    return;
  }
  const lx = Math.max(24, W * 0.05), ty = 70;
  const row = (k, v, y, ok) => { text(k, lx, y, 10, { ls: 2.5, color: '#9aa0a8' }); text(v, lx + 110, y, 17, { mono: true, color: okc(ok) }); };
  text('SUPER HEAVY · RETURN TO TOWER', lx, ty - 22, 10, { ls: 4, color: '#9aa0a8' });
  row('ALT TO ARMS', `${fmt(Math.max(0, alt))} m`, ty);
  row('VERT SPEED', `${fmt(L.vy, 1)} m/s`, ty + 26, vOk);
  row('OFFSET', `${L.x >= 0 ? '+' : ''}${fmt(L.x, 1)} m`, ty + 52, xOk);
  row('SIDE DRIFT', `${fmt(L.vx, 1)} m/s`, ty + 78, hOk);
  text(`CATCH WINDOW · |offset| ≤ ${fmt(L.win.x, 1)} m · |v| ≤ ${fmt(L.win.vy, 1)} m/s · |drift| ≤ ${fmt(L.win.vx, 1)} m/s`, lx, ty + 104, 10.5, { mono: true, color: '#9aa0a8' });
  const gw2 = Math.min(220, W * 0.36), rx = W - Math.max(24, W * 0.05) - gw2;
  gauge(rx, ty, gw2, 'THROTTLE', L.lit ? L.thr * 100 : 0, 100, { right: L.lit ? `${Math.round(L.thr * 100)}%` : 'OFF' });
  gauge(rx, ty + 36, gw2, 'LANDING PROPELLANT', L.fuel, Math.max(L.fuel0, 1), { right: `${fmt(L.fuel, 1)} s`, color: L.fuel < 3 ? '#ff4d4d' : '#fff' });
  const bw = Math.min(420, W - 2 * (lx + 290));
  offsetBar(L, pred, W / 2 - bw / 2, ty + 14, bw);
  if (!L.done && !TOUCH && !DEMO) text('↑/W THROTTLE + (LIGHT BURN) · ↓/S THROTTLE − · ←→/AD STEER', W / 2, 24, 10.5, { align: 'center', ls: 2.5, color: '#8a8f98' });
}

// ---------------------------------------------------------------- PARTICLES, BANNERS, FX
function drawParticles(toS) {
  for (const p of particles) {
    let x = p.x, y = p.y;
    if (p.spark && toS) { const s = toS(p.wx, p.wy); x = s[0] + p.x; y = s[1] + p.y; }
    if (p.spark && !toS) continue;
    if (!toS && p.wy != null && S.asc && S.scene === 'ascent') y += (S.asc.st.h - p.wy) * (H * 0.42 / 124);
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = p.smoke ? a * 0.25 : a; ctx.fillStyle = `rgb(${p.c})`;
    ctx.beginPath(); ctx.arc(x, y, p.smoke ? p.r * (2 - a) : p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; if (p.spark) p.vy += 120 * dt; p.vx *= 1 - dt * 0.8; p.vy *= 1 - dt * (p.smoke ? 0.8 : 0.3); }
  if (particles.length > 1500) particles.splice(0, particles.length - 1500);
}
function drawBanners(dt) {
  S.banners.forEach((b, i) => {
    b.life -= dt; const age = b.dur - b.life; const a = clamp(Math.min(age * 4, b.life * 2), 0, 1);
    const y = (S.scene === 'landing' && !(S.land && S.land.caught)) ? H * 0.62 : LS() ? H * 0.5 : H * 0.32;
    const big = b.t === 'BOOSTER CAUGHT';
    const size = big ? Math.min(W * 0.085, 92, H * 0.16) : Math.min(W * 0.045, 40, H * 0.08);
    ctx.save(); ctx.font = `300 ${size}px Helvetica Neue, Helvetica, Arial, sans-serif`; spacing(big ? 14 : 8);
    const tw = ctx.measureText(b.t).width; ctx.restore();
    const fit = Math.min(1, (W * 0.9) / Math.max(1, tw));
    const scale = (big ? 1 + Math.max(0, 0.25 - age * 0.8) : 1) * fit;
    ctx.save(); ctx.translate(W / 2, y); ctx.scale(scale, scale);
    if (big) { ctx.shadowColor = 'rgba(255,255,255,.8)'; ctx.shadowBlur = 30; }
    text(b.t, 0, 0, size, { align: 'center', ls: big ? 14 : 8, weight: big ? 300 : 300, color: b.color || '#fff', alpha: a });
    ctx.restore();
    if (b.sub) { let ss = big ? 16 : 13; ctx.save(); spacing(4); for (; ss > 9; ss -= 0.5) { ctx.font = `400 ${ss}px Helvetica Neue, Helvetica, Arial, sans-serif`; if (ctx.measureText(b.sub).width < W - 20) break; } ctx.restore();
      text(b.sub, W / 2, y + size * 0.55 + 18, ss, { align: 'center', ls: 4, color: '#c9cdd4', alpha: a }); }
  });
  S.banners = S.banners.filter(b => b.life > 0);
}

// ---------------------------------------------------------------- PAD SCENE (title backdrop)
function padDraw() {
  drawSky(0);
  const portrait = W < H; const sc = (portrait ? H * 0.34 : H * 0.5) / 146; const gy = H * 0.86, rx = W > 900 ? W * 0.86 : portrait ? W * 0.8 : W * 0.75;
  ctx.fillStyle = 'rgba(255,170,110,.07)'; ctx.fillRect(0, gy - 60, W, 60);
  drawPad(rx, gy, sc); drawTowerSide(rx - 24 * sc, gy, sc);
  ctx.fillStyle = '#9aa1aa'; ctx.fillRect(rx - 18 * sc, gy - 112 * sc, 12 * sc, 2.4 * sc);
  ctx.save(); ctx.translate(rx, gy - 22 * sc); drawBooster(sc); ctx.translate(0, -73 * sc); drawShip(sc); ctx.restore();
  // venting
  if (Math.random() < 0.5) particles.push({ x: rx + (rng() - 0.5) * 10 * sc, y: gy - 22 * sc - rng() * 60 * sc, vx: (rng() - 0.3) * 20, vy: -5 - rng() * 10, life: 3, max: 3, r: 6 + rng() * 10, c: '230,232,236', smoke: true });
  drawParticles();
}

// ---------------------------------------------------------------- SHIP REENTRY
function startReentry() {
  const burn = !!(S.asc && S.asc.flaws.has('heat'));
  S.scene = 'reentry'; S.re = { t: 0, burn }; S.timeScale = 1; particles.length = 0;
  banner('SHIP REENTRY', burn ? 'Heat shield temperatures climbing…' : 'Belly-first through the plasma', 2.6, burn ? '#ffc53d' : null);
  SND.play('sizzle', { dur: burn ? 2.9 : 3.4 });
  if (burn) {
    later(2.9, () => { S.re.broke = true; S.flash = 1; S.shake = 0.9; boom(W * 0.5, H * 0.5, 1.6); SND.play('explosion', { k: 1.2 }); banner('SHIP LOST', lessonFor('heat').head, 2.6, '#ff4d4d'); });
    later(5.2, () => finish({ kind: 'fail', cause: 'heat', phase: 'reentry', caughtBooster: !!(S.land && S.land.caught) }));
  } else later(3.6, () => { banner('REENTRY COMPLETE', 'Heat shield held ✓', 1.6, '#3ddc84'); later(1.4, () => finish({ kind: 'win' })); });
}
function reentryDraw(dt) {
  const R = S.re; R.t += dt; drawSky(70000); drawEarthLimb(70000);
  const sc = H * 0.32 / 52, cx = W * 0.5, cy = H * 0.48;
  const heat = clamp(R.t / 2.6, 0, 1);
  // plasma sheath
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const pg = ctx.createRadialGradient(cx - 10 * sc, cy + 6 * sc, 4, cx, cy, 60 * sc);
  pg.addColorStop(0, `rgba(255,${R.burn ? 160 : 120},${R.burn ? 80 : 200},${0.55 + 0.35 * heat})`); pg.addColorStop(1, 'rgba(255,80,160,0)');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, cy, 60 * sc, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 18; i++) { const y = cy - 30 * sc + i * 3.5 * sc, len = (60 + Math.random() * 120) * sc * 0.4; ctx.strokeStyle = `rgba(255,170,220,${0.15 + Math.random() * 0.2})`; ctx.beginPath(); ctx.moveTo(cx + 8 * sc, y); ctx.lineTo(cx + 8 * sc + len, y - len * 0.5); ctx.stroke(); }
  ctx.restore();
  if (!R.broke) {
    ctx.save(); ctx.translate(cx + (Math.random() - 0.5) * 3, cy); ctx.rotate(-Math.PI / 2 - 0.25); ctx.translate(0, 26 * sc); drawShip(sc);
    if (R.burn) { ctx.fillStyle = `rgba(255,${180 - heat * 120},60,${heat * 0.75})`; ctx.fillRect(-4.5 * sc, -52 * sc, 4.5 * sc, 52 * sc); }
    ctx.restore();
    if (R.burn && Math.random() < 0.3 + heat) particles.push({ x: cx - 10 * sc + Math.random() * 20 * sc, y: cy + 4 * sc, vx: 200 + Math.random() * 200, vy: -100 - Math.random() * 120, life: 1, max: 1, r: 2 + Math.random() * 2, c: '30,30,30', screen: true });
  }
  text(R.burn ? `HEAT SHIELD: ${S.cfg.shield === 'none' ? 'NONE' : 'THIN'}` : `HEAT SHIELD: ${S.cfg.shield === 'heavy' ? 'REINFORCED' : 'FULL'}`, W / 2, H * 0.86, 13, { align: 'center', ls: 3, color: R.burn ? '#ff8a8a' : '#3ddc84' });
  drawParticles();
}

// ---------------------------------------------------------------- RESULT
function finish(r) {
  S.timeScale = 1; SND.engine(0, 0, 0);
  const L = S.land || {}, A = S.asc || {};
  const pay = P.PAYLOADS.find(p => p.id === S.cfg.payload);
  const caughtB = !!L.caught;
  let score = 0;
  const shipOK = S.ship && S.ship.orbit;
  if (caughtB) score += Math.round((L.acc || 0) * 10);
  if (r.kind === 'divert') score += 150;
  if (shipOK) score += 300 + pay.sats * 5 + (S.ship.reentry && r.cause !== 'heat' ? 150 : 0);
  if (r.kind === 'win' && S.cfg.profile === 'manual') score += 100;
  if (S.riskIt) score -= 100; if (!has('sam')) score -= S.scrubs * 50;
  score = Math.max(0, score);
  const lesson = r.kind === 'fail' ? lessonFor(r.cause) : null;
  const crewNames = ROLES.map(role => { const o = role.opts.find(x => x.id === S.crew[role.id]); return `<span>${role.title.split(' ')[0]}</span>${o.name}`; }).join(' &nbsp; ');
  const perfect = r.kind === 'win' && L.acc >= 95;
  const status = r.kind === 'win' ? [perfect ? 'PERFECT CATCH' : 'BOOSTER CAUGHT', 'ok'] : r.kind === 'divert' ? ['SAFE DIVERT', 'part'] : r.cause === 'heat' ? [caughtB ? 'CAUGHT · SHIP LOST' : 'SHIP LOST', 'fail'] : ['RUD', 'fail'];
  const headline = r.kind === 'win' ? 'THE CHOPSTICKS GOT IT' : r.kind === 'divert' ? 'WAVED OFF TO THE GULF' : lesson.head;
  const c = L.contact || {};
  const shipLine = !S.ship ? 'Ship: lost with the stack' : r.cause === 'heat' ? `Ship: orbit ✓ · ${pay.sats} Starlink deployed · reentry burn-through ✗` : S.ship.orbit ? `Ship: orbit ✓ · ${pay.sats} Starlink deployed${S.ship.reentry ? ' · reentry heat shield held ✓' : ''}` : `Ship: short of orbit by ${fmt(-S.ship.margin)} m/s`;
  const cell = (k, v) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const partTxt = lesson && lesson.build ? `<div class="rc-part">CAUSED BY YOUR BUILD: ${lesson.parts.map(p => `<span>${PART_LABEL[p]}</span>`).join(' ')}</div>` : '';
  const lessonHtml = lesson ? `<div class="rc-lesson"><b>LESSON LEARNED</b>${partTxt}${lesson.what}<br><span style="color:#fff">Next time:</span> ${lesson.better}<br><span style="color:#9aa0a8">Real-world fact:</span> ${lesson.fact}</div>`
    : `<div class="fact" style="margin-top:12px"><b>REAL-WORLD FACT</b>${r.kind === 'win' ? FACT_WIN : FACT_DIVERT}</div>`;
  $('#result-card').innerHTML = `
    <div class="rc-head"><div><div class="rc-game">CHOPSTICKS · MISSION REPORT</div><div class="rc-mission">${S.mission.full.toUpperCase()}</div><div class="rc-date">${S.mission.date} · ${S.mission.site.toUpperCase()} · DAY ${S.day}</div></div>
      <div class="rc-status ${status[1]}">${status[0]}</div></div>
    <div class="rc-big"><div class="rc-score">${fmt(score)}<small>SCORE</small></div><div class="rc-headline">${headline}</div></div>
    <div class="rc-grid">
      ${cell('CATCH ACCURACY', caughtB ? Math.round(L.acc) + '%' : '—')}
      ${cell('LANDING SPEED', c.dvy != null ? fmt(c.dvy, 1) + ' m/s' : '—')}
      ${cell('ALIGNMENT', c.dx != null ? fmt(c.dx, 1) + ' m' : '—')}
      ${cell('MAX-Q', A.st ? fmt(A.st.maxQ / 1000, 1) + ' kPa' : '—')}
    </div>
    <div class="rc-crew">${crewNames}</div>
    <div class="rc-crew" style="margin-top:4px">${shipLine}${S.riskIt ? ' · <span style="color:#ff8a8a">launched against weather rules</span>' : ''}</div>
    ${lessonHtml}
    <div class="rc-foot"><span>Unofficial fan game. Not affiliated with or endorsed by SpaceX.</span><span>${P.ENGINES.find(e => e.id === S.cfg.engine).name} · ${Math.round(S.cfg.fuel * 100)}% prop</span></div>`;
  S.result = Object.assign({ score, acc: caughtB ? Math.round(L.acc) : null, perfect, lesson }, r);
  // actions
  const acts = $('#result-actions'); acts.innerHTML = '';
  const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; acts.appendChild(b); return b; };
  if (lesson && lesson.build) btn(`RETRY: FIX THE ${PART_LABEL[lesson.parts[0]]} →`, 'primary', () => { S.highlight = lesson.parts.slice(); show('build'); scrollToFlaw(); });
  btn('FLY AGAIN', lesson && lesson.build ? '' : 'primary', () => { S.wx = null; S.scrubs = 0; S.day = 1; show('weather'); });
  btn('SHARE ON X', 'share', () => shareX());
  btn('LEADERBOARD', '', () => toggleBoard());
  btn('TITLE', '', () => show('title'));
  saveScore(S.result);
  $('#board').classList.add('hidden-board');
  show('result');
}
function scrollToFlaw() { setTimeout(() => { const el = document.querySelector('.opt-group.flaw'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' }); }, 30); }
function shareText() {
  const r = S.result, m = S.mission.full;
  let t;
  if (r.kind === 'win' && r.perfect) t = `PERFECT CATCH 🥢🚀 Caught the booster with ${r.acc}% accuracy in Chopsticks, an unofficial SpaceX fan game. ${fmt(r.score)} pts on ${m}.`;
  else if (r.kind === 'win') t = `Caught the booster with ${r.acc}% accuracy in Chopsticks, an unofficial SpaceX fan game 🥢🚀 ${fmt(r.score)} pts on ${m}.`;
  else t = `RUD 💥 ${r.lesson ? r.lesson.head.charAt(0) + r.lesson.head.slice(1).toLowerCase() : 'Rapid unscheduled disassembly'}. Lesson learned in Chopsticks, an unofficial SpaceX fan game. ${fmt(r.score)} pts on ${m}.`;
  return `${t} Can you catch it? #Chopsticks` + (GAME_URL ? ' ' + GAME_URL : '');
}
function shareX() {
  const url = 'https://x.com/intent/post?text=' + encodeURIComponent(shareText());
  S.shareUrl = url;
  if (!CAPTURE) window.open(url, '_blank', 'noopener');
}
// local leaderboard (global one plugs in via LEADERBOARD_URL once the game is online)
function loadBoard() { try { return JSON.parse(localStorage.getItem('ctb-board') || '[]'); } catch (e) { return []; } }
function saveScore(r) {
  const entry = { score: r.score, acc: r.acc, outcome: r.kind === 'win' ? (r.perfect ? 'PERFECT' : 'CAUGHT') : r.kind === 'divert' ? 'DIVERT' : 'RUD', mission: S.mission.name, date: new Date().toISOString().slice(0, 10), id: Date.now() + '-' + Math.floor(rng() * 1e6) };
  const b = loadBoard(); b.push(entry); b.sort((a, c) => c.score - a.score);
  try { localStorage.setItem('ctb-board', JSON.stringify(b.slice(0, 10))); } catch (e) {}
  S.lastEntry = entry.id;
  if (LEADERBOARD_URL) fetch(LEADERBOARD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => {});
}
function toggleBoard() {
  const el = $('#board'); const b = loadBoard();
  el.innerHTML = `<h3 style="margin-top:0">LOCAL LEADERBOARD · THIS DEVICE</h3><ol>${b.map(e => `<li class="${e.id === S.lastEntry ? 'me' : ''}"><span>${fmt(e.score)}</span><span>${e.outcome}${e.acc != null ? ' · ' + e.acc + '%' : ''}</span><span>${e.mission} · ${e.date}</span></li>`).join('')}</ol><div class="muted">A global leaderboard goes live when the game is online.</div>`;
  el.classList.toggle('hidden-board');
}

// ---------------------------------------------------------------- INPUT
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', KeyX: 'x', Space: 'space' };
addEventListener('keydown', e => {
  const k = KEYMAP[e.code]; if (!k) return;
  if (['ascent', 'landing', 'boostback'].includes(S.scene) && S.screen === 'none') e.preventDefault();
  S.keys[k] = true;
  if (k === 'space' && S.scene === 'ascent' && S.asc && !S.asc.staged) stage(false);
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) S.keys[k] = false; });
// touch controls
document.querySelectorAll('#touch [data-k]').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); S.keys[k] = true; b.classList.add('on'); if (k === 'space' && S.scene === 'ascent') stage(false); };
  const off = e => { e.preventDefault(); S.keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, off));
});
// UI taps + mute
document.addEventListener('click', e => { if (e.target.closest('.btn') || (e.target.closest('.card') && S.screen !== 'build')) SND.play('tap'); }, true);
function syncMute() { const m = SND.muted; const b = $('#mute'); b.classList.toggle('muted', m); b.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound'); b.title = m ? 'Sound off (M)' : 'Sound on (M)'; }
$('#mute').addEventListener('click', e => { e.stopPropagation(); SND.setMuted(!SND.muted); syncMute(); });
addEventListener('keydown', e => { if (e.code === 'KeyM') { SND.setMuted(!SND.muted); syncMute(); } });
syncMute();

// ---------------------------------------------------------------- LOOP
function engineSound() {
  if (S.screen !== 'none') return SND.engine(0, 0, 0);
  if (S.scene === 'ascent' && S.asc) {
    const A = S.asc, st = A.st, v = A.v;
    if (A.failed) return SND.engine(0, 0, 0);
    if (A.staged) return SND.engine(0.45 * Math.max(0, 1 - A.sepT / 3), 0.6, 0);
    if (A.countdown > 0.6) return SND.engine(0, 0, 0);
    const air = 0.3 + 0.7 * Math.exp(-st.h / 18000);
    const flick = A.flicker > 0 && Math.random() < 0.5 ? 0.3 : 1;
    return SND.engine(st.throttle * ((v.e.count - st.enginesOut) / v.e.count) * air * flick, st.throttle, 0);
  }
  if (S.scene === 'boostback' && S.bb) return SND.engine(S.bb.broke ? 0 : 0.5 * Math.max(0, 1 - S.bb.t / 2.6), 0.5, S.bb.tumble && !S.bb.broke ? 0.8 : 0);
  if (S.scene === 'landing' && S.land) { const L = S.land; if (L.done) return SND.engine(0, 0, 0); return SND.engine(L.lit ? 0.35 + 0.65 * L.thr : 0, 1, clamp(Math.abs(L.vy) / 200, 0, 1) * 0.8 * (L.lit ? 0.4 : 1)); }
  SND.engine(0, 0, 0);
}
function tick(rdt) {
  rdt = Math.min(rdt, 0.05);
  if (S.slowmo > 0) { S.slowmo -= rdt; if (S.slowmo <= 0) S.timeScale = 1; else S.timeScale = lerp(1, 0.18, clamp(S.slowmo / 0.4, 0, 1)); }
  const dt = rdt * S.timeScale;
  S.t += rdt;
  for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= rdt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
  if (tipTimer > 0) { tipTimer -= rdt; if (tipTimer <= 0) hideTip(); }
  updateParticles(dt);
  ctx.save();
  if (S.shake > 0) { S.shake -= rdt; const m = 14 * S.shake; ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m); }
  if (S.scene === 'ascent') { if (!S.paused) ascentUpdate(dt); ascentDraw(); }
  else if (S.scene === 'boostback') boostbackDraw(dt);
  else if (S.scene === 'landing') { landingUpdate(dt); landingDraw(); }
  else if (S.scene === 'reentry') reentryDraw(dt);
  else padDraw();
  ctx.restore();
  drawBanners(rdt);
  if (S.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp(S.flash, 0, 1) * 0.85})`; ctx.fillRect(0, 0, W, H); S.flash -= rdt * 1.6; }
  if (S.scene === 'landing' && S.land && S.land.caught) { ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(S.t * 3)})`; ctx.lineWidth = 2; ctx.strokeRect(16, 16, W - 32, H - 32); }
  if (DEMO && W >= 700 && S.screen === 'none' && !(S.land && S.land.caught)) text('CHOPSTICKS · UNOFFICIAL FAN GAME', 18, 26, 10, { ls: 3, color: '#9aa0a8' });
  if (S.screen === 'build') { if (S.kitFlash && S.kitFlash.t > 0) S.kitFlash.t -= rdt; drawKit(); }
  const flying = S.screen === 'none' && (S.scene === 'ascent' || S.scene === 'landing');
  document.body.dataset.flight = flying ? S.scene : '';
  touchSync();
  engineSound();
}
let last = performance.now();
function frame(now) { const dt = (now - last) / 1000; last = now; try { tick(dt); } catch (err) { console.error(err); } requestAnimationFrame(frame); }

// test / capture hooks
window.__game = { S, show, startLaunch, startLanding, startReentry, stage, finish, tick, P, buildFlaws, shareText, MISSIONS, newWeather, stageState, burnAlt, landingPredict };
window.__advance = (ms, step = 1000 / 60) => { for (let t = 0; t < ms; t += step) tick(step / 1000); };
if (CAPTURE) SND.startLog(() => S.t);

// boot
function boot() {
  if (DEMO) {
    S.mission = MISSIONS[0]; S.cfg.payload = 26; S.crew = { fd: 'ava', prop: 'priya', wx: 'kenji', rec: 'lena' };
    newWeather();
    if (START === 'landing') { S.asc = null; S.ship = { orbit: true, margin: 500, reentry: true }; show('none'); startLanding(); }
    else if (START === 'launch') { startLaunch(); }
    else if (START === 'build') show('build');
    else if (START === 'crew') show('crew');
    else if (START === 'weather') show('weather');
    else if (START === 'title' || START === '') { show('title'); if (START === '') { later(2, () => show('build')); later(4, () => show('crew')); later(6, () => show('weather')); later(8, () => startLaunch()); } }
  } else show('title');
  if (!CAPTURE) requestAnimationFrame(frame); else tick(0.016);
}
boot();
})();
