/* Catch the Booster — procedural Web Audio. No sound files; everything is synthesized. */
(function () {
  'use strict';
  const LS = 'ctb-muted';
  let muted = false; try { muted = localStorage.getItem(LS) === '1'; } catch (e) {}
  let ctx = null, master = null, eng = null;
  const log = []; let logging = false; let clock = () => 0;
  const noiseCache = new WeakMap();

  function noiseBuf(c, kind = 'white') {
    let m = noiseCache.get(c); if (!m) { m = {}; noiseCache.set(c, m); }
    if (m[kind]) return m[kind];
    const len = c.sampleRate * 3, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return (m[kind] = b);
  }
  function noise(c, t, dur, kind) { const s = c.createBufferSource(); s.buffer = noiseBuf(c, kind); s.loop = true; s.start(t, Math.random() * 2); s.stop(t + dur + 0.05); return s; }
  function env(c, t, peak, a, d, curve = 'exp') { const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); else g.gain.linearRampToValueAtTime(0.0001, t + a + d); return g; }
  function osc(c, type, f, t, dur) { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur + 0.05); return o; }
  function filt(c, type, f, q = 0.7) { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

  // ------------------------------------------------------------ sound library: (c, dest, t, p)
  const L = {
    tap(c, d, t) { const o = osc(c, 'triangle', 1400, t, 0.05); o.frequency.exponentialRampToValueAtTime(700, t + 0.04); chain(o, env(c, t, 0.35, 0.002, 0.05), d); },
    snap(c, d, t) { const n = noise(c, t, 0.08); chain(n, filt(c, 'bandpass', 2400, 3), env(c, t, 0.35, 0.002, 0.07), d); const o = osc(c, 'sine', 180, t, 0.12); o.frequency.exponentialRampToValueAtTime(80, t + 0.1); chain(o, env(c, t, 0.3, 0.003, 0.1), d); },
    beep(c, d, t, p = {}) { const o = osc(c, 'sine', p.f || 880, t, p.dur || 0.14); chain(o, env(c, t, p.g || 0.22, 0.005, p.dur || 0.14), d); },
    liftoff(c, d, t) {
      L.beep(c, d, t, { f: 1320, dur: 0.5, g: 0.25 });
      const n = noise(c, t, 3.2, 'brown'); const lp = filt(c, 'lowpass', 180); lp.frequency.exponentialRampToValueAtTime(1400, t + 1.2); lp.frequency.exponentialRampToValueAtTime(500, t + 3);
      chain(n, lp, env(c, t, 1.0, 0.6, 2.6), d);
      const s = osc(c, 'sine', 32, t, 3); chain(s, env(c, t, 0.6, 0.4, 2.5), d);
    },
    creak(c, d, t, p = {}) {
      const dur = p.dur || 1.3;
      for (let i = 0; i < (p.n || 9); i++) { const tt = t + Math.random() * dur; const n = noise(c, tt, 0.06); chain(n, filt(c, 'bandpass', 160 + Math.random() * 320, 28), env(c, tt, 0.9, 0.004, 0.05), d); }
      const o = osc(c, 'sawtooth', 52, t, dur); const lp = filt(c, 'lowpass', 260, 6); const lfo = osc(c, 'sine', 3.2, t, dur); const lg = c.createGain(); lg.gain.value = 90; lfo.connect(lg); lg.connect(lp.frequency);
      chain(o, lp, env(c, t, p.g || 0.16, 0.2, dur - 0.2, 'lin'), d);
    },
    bang(c, d, t, p = {}) {
      const k = p.k || 1; const n = noise(c, t, 0.9); const lp = filt(c, 'lowpass', 4000 * k); lp.frequency.exponentialRampToValueAtTime(250, t + 0.6);
      chain(n, lp, env(c, t, 0.9 * k, 0.003, 0.7), d);
      const s = osc(c, 'sine', 95, t, 0.6); s.frequency.exponentialRampToValueAtTime(32, t + 0.5); chain(s, env(c, t, 0.9 * k, 0.003, 0.55), d);
    },
    fins(c, d, t, p = {}) {
      const dur = p.dur || 1.4; const n = noise(c, t, dur); const bp = filt(c, 'bandpass', 700, 1.5); bp.frequency.linearRampToValueAtTime(1300, t + dur);
      const am = c.createGain(); am.gain.value = 0.5; const lfo = osc(c, 'square', p.rate || 16, t, dur); const lg = c.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(am.gain);
      chain(n, bp, am, env(c, t, p.g || 0.35, 0.25, dur - 0.25, 'lin'), d);
      for (let i = 0; i < 3; i++) { const tt = t + 0.05 + i * 0.09; const m = osc(c, 'square', 120 + i * 30, tt, 0.05); chain(m, filt(c, 'lowpass', 900), env(c, tt, 0.15, 0.002, 0.05), d); }
    },
    clunk(c, d, t) {
      const s = osc(c, 'sine', 75, t, 0.4); s.frequency.exponentialRampToValueAtTime(42, t + 0.3); chain(s, env(c, t, 1.0, 0.003, 0.35), d);
      const n = noise(c, t, 0.12); chain(n, filt(c, 'lowpass', 1800), env(c, t, 0.7, 0.002, 0.1), d);
      [310, 467, 731, 1093, 1520].forEach((f, i) => { const o = osc(c, 'sine', f, t, 1.2); chain(o, env(c, t, 0.12 / (i + 1) + 0.03, 0.002, 1.0 - i * 0.12), d); });
      const t2 = t + 0.16; const s2 = osc(c, 'sine', 62, t2, 0.3); chain(s2, env(c, t2, 0.6, 0.003, 0.25), d);
    },
    sting(c, d, t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { const tt = t + i * 0.1; const o = osc(c, 'triangle', f, tt, 1.6); chain(o, env(c, tt, 0.16, 0.01, 1.5), d); });
      const tc = t + 0.42; [523.25, 783.99, 1046.5, 1318.5].forEach(f => { const o = osc(c, 'sawtooth', f, tc, 2.2); chain(o, filt(c, 'lowpass', 2200), env(c, tc, 0.05, 0.08, 2.0), d); });
    },
    explosion(c, d, t, p = {}) {
      const k = p.k || 1, dur = 3.2 * k;
      const n = noise(c, t, dur); const lp = filt(c, 'lowpass', 3500); lp.frequency.exponentialRampToValueAtTime(110, t + dur * 0.8);
      chain(n, lp, env(c, t, 1.0, 0.01, dur), d);
      const s = osc(c, 'sine', 70, t, 1.4); s.frequency.exponentialRampToValueAtTime(22, t + 1.2); chain(s, env(c, t, 1.0, 0.005, 1.3), d);
      for (let i = 0; i < 14; i++) { const tt = t + 0.2 + Math.random() * dur * 0.6; const b = noise(c, tt, 0.04); chain(b, filt(c, 'highpass', 1500), env(c, tt, 0.25 * Math.random(), 0.001, 0.035), d); }
    },
    metal(c, d, t) { for (let i = 0; i < 10; i++) { const tt = t + i * 0.05 + Math.random() * 0.05; const f = 300 + Math.random() * 1600; const o = osc(c, 'square', f, tt, 0.5); chain(o, filt(c, 'bandpass', f, 12), env(c, tt, 0.35, 0.002, 0.45), d); } },
    pop(c, d, t) { L.bang(c, d, t, { k: 0.35 }); },
    crack(c, d, t) { const n = noise(c, t, 0.08); chain(n, filt(c, 'highpass', 900), env(c, t, 1.0, 0.001, 0.07), d); L.bang(c, d, t + 0.02, { k: 0.6 }); },
    sizzle(c, d, t, p = {}) {
      const dur = p.dur || 2.6; const n = noise(c, t, dur); const hp = filt(c, 'highpass', 2500); hp.frequency.linearRampToValueAtTime(900, t + dur);
      chain(n, hp, env(c, t, 0.45, dur * 0.8, dur * 0.2, 'lin'), d);
      const r = noise(c, t, dur, 'brown'); chain(r, filt(c, 'lowpass', 400), env(c, t, 0.6, dur * 0.7, dur * 0.3, 'lin'), d);
      for (let i = 0; i < 22; i++) { const tt = t + dur * 0.3 + Math.random() * dur * 0.7; const b = noise(c, tt, 0.03); chain(b, filt(c, 'bandpass', 3000 + Math.random() * 3000, 4), env(c, tt, 0.3, 0.001, 0.025), d); }
    },
    sputter(c, d, t) {
      for (let i = 0; i < 7; i++) { const tt = t + i * 0.16 + Math.random() * 0.05; const n = noise(c, tt, 0.12, 'brown'); chain(n, filt(c, 'lowpass', 700), env(c, tt, 0.8 - i * 0.09, 0.01, 0.1), d); }
    },
    whoosh(c, d, t, p = {}) { const dur = p.dur || 0.8; const n = noise(c, t, dur); const bp = filt(c, 'bandpass', 400, 2); bp.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.5); bp.frequency.exponentialRampToValueAtTime(300, t + dur); chain(n, bp, env(c, t, p.g || 0.4, dur * 0.4, dur * 0.6, 'lin'), d); },
  };

  // ------------------------------------------------------------ continuous engine bed
  function makeEngine(c, d) {
    const e = {};
    e.src = c.createBufferSource(); e.src.buffer = noiseBuf(c, 'brown'); e.src.loop = true;
    e.lp = filt(c, 'lowpass', 300, 0.9); e.g = c.createGain(); e.g.gain.value = 0;
    chain(e.src, e.lp, e.g, d);
    e.sub = c.createOscillator(); e.sub.type = 'sine'; e.sub.frequency.value = 38; e.sg = c.createGain(); e.sg.gain.value = 0; chain(e.sub, e.sg, d);
    e.hiss = c.createBufferSource(); e.hiss.buffer = noiseBuf(c, 'white'); e.hiss.loop = true; e.hp = filt(c, 'bandpass', 900, 0.8); e.hg = c.createGain(); e.hg.gain.value = 0; chain(e.hiss, e.hp, e.hg, d);
    e.fin = c.createBufferSource(); e.fin.buffer = noiseBuf(c, 'white'); e.fin.loop = true; e.fbp = filt(c, 'bandpass', 600, 3); e.fg = c.createGain(); e.fg.gain.value = 0; chain(e.fin, e.fbp, e.fg, d);
    e.src.start(); e.sub.start(); e.hiss.start(); e.fin.start();
    return e;
  }
  function setEngine(e, t, l, b, f, tc = 0.08) {
    e.g.gain.setTargetAtTime(0.9 * l, t, tc); e.lp.frequency.setTargetAtTime(160 + 900 * b * Math.max(l, 0.1), t, tc);
    e.sg.gain.setTargetAtTime(0.45 * l, t, tc); e.hg.gain.setTargetAtTime(0.18 * l * b, t, tc);
    e.fg.gain.setTargetAtTime(0.22 * f, t, tc); e.fbp.frequency.setTargetAtTime(500 + 900 * f, t, tc);
  }

  // ------------------------------------------------------------ public API
  function ensure() {
    if (ctx) return ctx; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    eng = makeEngine(ctx, master); return ctx;
  }
  function unlock() {
    const c = ensure(); if (!c) return;
    if (c.state !== 'running') { c.resume && c.resume(); const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); }
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  let lastEng = [0, 0, 0];
  const Audio = {
    play(name, p) { if (logging) log.push({ t: clock(), name, p }); if (!ctx || ctx.state !== 'running' || muted || !L[name]) return; try { L[name](ctx, master, ctx.currentTime + 0.01, p || {}); } catch (e) { console.warn(e); } },
    engine(l, b, f) { l = +l || 0; b = +b || 0; f = +f || 0; if (logging) log.push({ t: clock(), eng: [l, b, f] });
      if (Math.abs(l - lastEng[0]) + Math.abs(b - lastEng[1]) + Math.abs(f - lastEng[2]) < 0.01) return; lastEng = [l, b, f];
      if (ctx && eng) setEngine(eng, ctx.currentTime, l, b, f); },
    get muted() { return muted; },
    setMuted(m) { muted = !!m; try { localStorage.setItem(LS, muted ? '1' : '0'); } catch (e) {} if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.03); },
    startLog(fn) { logging = true; clock = fn; log.length = 0; },
    log,
    // Render a logged window to a WAV (base64) offline: used for the marketing videos.
    async render(t0, dur) {
      const sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
      const m = oc.createGain(); m.gain.value = 0.7; const comp = oc.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; m.connect(comp); comp.connect(oc.destination);
      const e = makeEngine(oc, m);
      for (const ev of log) { const t = ev.t - t0; if (t < -4 || t > dur) continue;
        if (ev.eng) { if (t >= 0) setEngine(e, t, ev.eng[0], ev.eng[1], ev.eng[2]); else setEngine(e, 0, ev.eng[0], ev.eng[1], ev.eng[2], 0.001); }
        else if (L[ev.name] && t >= 0) L[ev.name](oc, m, t, ev.p || {}); }
      const buf = await oc.startRendering();
      const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 4));
      const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
      ws(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
      out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * 4, true);
      const L0 = buf.getChannelData(0), R0 = buf.getChannelData(1);
      for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L0[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R0[i])) * 32767, true); }
      const bytes = new Uint8Array(out.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
  };
  window.GameAudio = Audio;
})();
