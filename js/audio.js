'use strict';
/* =========================================================================
   Audio: every sound is synthesized with WebAudio (no files). Includes a
   soft generative score whose scale shifts with the realm.
   ========================================================================= */

const Sfx = (() => {
  let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let sfxOn = true, musicOn = true, adMuted = false;
  let musicTimer = null, musicRealm = 0, step = 0;

  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 0.9 : 0; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = musicOn ? 0.32 : 0; musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startMusic();
    return true;
  }

  function env(g, t, a, peak, dcy) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  }

  function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0, bus = null) {
    if (!ac || !sfxOn) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    env(g, t, 0.005, vol, dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol = 0.3, filt = 1200, type = 'lowpass', q = 1, delay = 0, sweep = 0) {
    if (!ac || !sfxOn) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = rand(0.8, 1.2);
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(filt, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, filt * sweep), t + dur);
    const g = ac.createGain();
    env(g, t, 0.004, vol, dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const shootVoices = {
    wind: () => { noise(0.28, 0.25, 2600, 'bandpass', 1.5, 0, 0.4); },
    fire: () => { noise(0.35, 0.3, 900, 'lowpass', 1, 0, 2.5); tone(180, 0.2, 'sawtooth', 0.05, 0.5); },
    water: () => { for (let i = 0; i < 3; i++) tone(rand(500, 700), 0.12, 'sine', 0.12, 2.2, i * 0.03); },
    earth: () => { noise(0.3, 0.35, 400, 'lowpass', 1); tone(90, 0.25, 'triangle', 0.2, 0.6); },
    frost: () => { tone(1800, 0.25, 'sine', 0.08, 1.4); tone(2400, 0.2, 'sine', 0.05, 1.2, 0.04); noise(0.2, 0.12, 5000, 'highpass'); },
    lightning: () => { noise(0.2, 0.35, 3000, 'bandpass', 0.8); tone(900, 0.18, 'square', 0.06, 0.2); },
    nature: () => { tone(420, 0.18, 'triangle', 0.12, 1.6); noise(0.2, 0.15, 1800, 'bandpass', 2); },
    void: () => { tone(160, 0.5, 'sine', 0.25, 0.3); tone(240, 0.5, 'sawtooth', 0.04, 0.4); },
    light: () => { tone(880, 0.35, 'sine', 0.12, 1.5); tone(1320, 0.35, 'sine', 0.08, 1.5, 0.05); },
  };

  function shoot(el) {
    if (!ensure()) return;
    noise(0.09, 0.3, 1800, 'bandpass', 3);            // string twang
    tone(rand(160, 190), 0.12, 'triangle', 0.18, 0.7);
    (shootVoices[el] || shootVoices.wind)();
  }

  function hit(el, head) {
    if (!ensure()) return;
    noise(0.12, 0.35, 700, 'lowpass', 2);
    tone(head ? 140 : 110, 0.12, 'sine', 0.3, 0.5);
    if (head) tone(1400, 0.12, 'square', 0.05, 0.8, 0.02);
    if (el === 'fire') noise(0.4, 0.3, 1200, 'lowpass', 1, 0.02, 0.3);
    if (el === 'frost') { tone(2600, 0.3, 'sine', 0.08, 0.9); tone(3200, 0.2, 'triangle', 0.05, 1, 0.05); }
    if (el === 'earth') { noise(0.35, 0.45, 300, 'lowpass', 1); tone(60, 0.3, 'sine', 0.35, 0.5); }
    if (el === 'lightning') zap();
    if (el === 'nature') tone(660, 0.2, 'triangle', 0.1, 1.5, 0.04);
  }
  function thud() { if (!ensure()) return; noise(0.08, 0.2, 500, 'lowpass', 1); tone(200, 0.06, 'triangle', 0.08, 0.6); }
  function zap() { noise(0.25, 0.3, 4000, 'bandpass', 0.6, 0, 0.3); tone(rand(300, 600), 0.15, 'sawtooth', 0.07, 3); }
  function boom(big = 1) { if (!ensure()) return; noise(0.6 * big, 0.5, 600, 'lowpass', 1, 0, 0.15); tone(70, 0.5 * big, 'sine', 0.4, 0.4); }
  function hurt() { if (!ensure()) return; tone(220, 0.25, 'sawtooth', 0.12, 0.5); noise(0.15, 0.3, 900, 'lowpass', 1); }
  function kill() { if (!ensure()) return; tone(520, 0.12, 'triangle', 0.16, 1.5); tone(780, 0.18, 'triangle', 0.12, 1.4, 0.07); }
  function jump() { if (!ensure()) return; tone(300, 0.18, 'sine', 0.12, 2.2); noise(0.12, 0.1, 2000, 'bandpass', 1); }
  function pickup() { if (!ensure()) return; [660, 880, 1320].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, 1, i * 0.06)); }
  function wellHum() { if (!ensure()) return; tone(55, 1.6, 'sine', 0.3, 0.6); tone(82, 1.6, 'triangle', 0.08, 0.5); }
  function beam() { if (!ensure()) return; tone(rand(1000, 1400), 0.3, 'sine', 0.08, 0.4); noise(0.25, 0.15, 3000, 'highpass'); }
  function thunder() { if (!ac || !sfxOn) return; noise(1.4, 0.18, 300, 'lowpass', 0.7, 0.15, 0.3); }
  function click() { if (!ensure()) return; tone(900, 0.05, 'triangle', 0.08, 0.8); }
  function draw() { if (!ensure()) return; noise(0.25, 0.06, 1400, 'bandpass', 6, 0, 1.6); }
  function cancel() { if (!ensure()) return; tone(300, 0.08, 'triangle', 0.06, 0.6); }
  function win() { if (!ensure()) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.15, 1, i * 0.1)); }
  function lose() { if (!ensure()) return; [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'triangle', 0.14, 0.98, i * 0.14)); }
  function unlock() { if (!ensure()) return; [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, 'sine', 0.12, 1, i * 0.07)); }
  function denied() { if (!ensure()) return; tone(160, 0.15, 'square', 0.06, 0.8); }

  /* ------------------------------------------------------------- music */
  const SCALES = [
    [0, 2, 4, 7, 9],       // verdant: major pentatonic
    [0, 1, 5, 7, 8],       // ember: phrygian-ish
    [0, 2, 3, 7, 10],      // frost: minor
    [0, 3, 5, 6, 10],      // storm: blues
    [0, 1, 6, 7, 11],      // void: tense
  ];
  const ROOTS = [57, 52, 55, 50, 49];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function pad(freq, t, dur) {
    for (const det of [-4, 4]) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      f.type = 'lowpass'; f.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(musicBus);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
  function pluck(freq, t) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + 1);
  }

  function startMusic() {
    if (musicTimer) return;
    const beat = 0.42;
    let next = ac.currentTime + 0.1;
    musicTimer = setInterval(() => {
      if (!ac || ac.state !== 'running') return;
      while (next < ac.currentTime + 0.6) {
        const sc = SCALES[musicRealm], root = ROOTS[musicRealm];
        if (step % 16 === 0) {
          const deg = [0, 3, 4, 2][(step / 16) % 4];
          pad(mtof(root - 12 + sc[deg % sc.length]), next, beat * 16);
          pad(mtof(root - 12 + sc[(deg + 2) % sc.length] + 12), next, beat * 16);
        }
        if (Math.random() < 0.55) {
          const n = sc[Math.floor(Math.random() * sc.length)] + (Math.random() < 0.3 ? 12 : 0);
          pluck(mtof(root + n), next);
        }
        next += beat; step++;
      }
    }, 150);
  }

  function setRealm(i) { musicRealm = clamp(i, 0, SCALES.length - 1); }
  function applyGains() {
    if (!ac) return;
    const t = ac.currentTime;
    sfxBus.gain.setTargetAtTime(sfxOn && !adMuted ? 0.9 : 0, t, 0.05);
    musicBus.gain.setTargetAtTime(musicOn && !adMuted ? 0.32 : 0, t, 0.2);
  }
  function setSfx(on) { sfxOn = on; applyGains(); }
  function setMusic(on) { musicOn = on; applyGains(); }
  function setAdMuted(m) { adMuted = m; applyGains(); }
  function suspend(s) { if (!ac) return; s ? ac.suspend() : ac.resume(); }

  return {
    ensure, shoot, hit, thud, zap, boom, hurt, kill, jump, pickup, wellHum, beam, thunder, click, draw, cancel,
    win, lose, unlock, denied, setRealm, setSfx, setMusic, setAdMuted, suspend,
  };
})();
