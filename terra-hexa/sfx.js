'use strict';
/* 테라 헥사 — 효과음 (WebAudio로 합성, 파일 없음) */
const SFX = (function () {
  const KEY = 'terrahexa.sound';
  let ac = null, master = null, on = true, last = {};
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* 저장 불가 */ }

  function ctx() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C(); master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  function tone(f, dur, type, vol, t, slide) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, t, freq, q) {
    const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 0.9; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  const seq = (notes, step, dur, type, vol, t) => notes.forEach((f, k) => tone(f, dur, type, vol, t + k * step));
  const DEFS = {
    click: t => tone(700, 0.05, 'triangle', 0.1, t),
    select: t => { tone(520, 0.06, 'sine', 0.09, t); tone(780, 0.08, 'sine', 0.07, t + 0.05); },
    move: t => { noise(0.07, 0.1, t, 700); noise(0.06, 0.08, t + 0.09, 900); },
    melee: t => { noise(0.13, 0.3, t + 0.1, 2400, 1.4); tone(150, 0.16, 'square', 0.1, t + 0.1, 60); },
    shoot: t => { noise(0.18, 0.14, t, 3200, 2); tone(950, 0.14, 'sine', 0.05, t, 320); noise(0.06, 0.2, t + 0.2, 500); },
    found: t => seq([392, 494, 587, 784], 0.09, 0.3, 'triangle', 0.11, t),
    build: t => { tone(330, 0.07, 'square', 0.05, t); tone(440, 0.1, 'square', 0.05, t + 0.08); },
    work: t => { noise(0.05, 0.2, t, 1800, 3); noise(0.05, 0.2, t + 0.13, 1500, 3); },
    tech: t => seq([523, 659, 784, 1047], 0.08, 0.26, 'sine', 0.1, t),
    boost: t => { tone(1047, 0.09, 'sine', 0.07, t); tone(1568, 0.18, 'sine', 0.06, t + 0.07); },
    policy: t => seq([440, 554, 659], 0.1, 0.3, 'triangle', 0.09, t),
    faith: t => { tone(392, 0.5, 'sine', 0.08, t); tone(587, 0.5, 'sine', 0.06, t + 0.04); tone(784, 0.6, 'sine', 0.04, t + 0.1); },
    turn: t => { tone(294, 0.14, 'triangle', 0.09, t); tone(392, 0.22, 'triangle', 0.09, t + 0.11); },
    bad: t => tone(210, 0.2, 'sawtooth', 0.06, t, 140),
    war: t => { tone(110, 0.5, 'sawtooth', 0.09, t, 80); noise(0.4, 0.12, t, 300); },
    win: t => seq([523, 659, 784, 1047, 784, 1047, 1319], 0.13, 0.4, 'triangle', 0.11, t),
    lose: t => seq([392, 349, 311, 262], 0.2, 0.45, 'triangle', 0.09, t),
  };
  return {
    play(name, delay) {
      if (!on || !DEFS[name]) return;
      const now = performance.now();
      if (!delay && last[name] && now - last[name] < 60) return; // 같은 소리 겹침 방지
      last[name] = now;
      try { if (ctx()) DEFS[name](ac.currentTime + (delay || 0) + 0.005); } catch (e) { /* 소리 없이 진행 */ }
    },
    get on() { return on; },
    toggle() { on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* 무시 */ } if (on) this.play('select'); return on; },
  };
})();
