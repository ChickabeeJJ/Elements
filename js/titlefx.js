'use strict';
/* =========================================================================
   Title card: ELEMENT RAG, animated.

   Each of the seven letters of ELEMENT carries one element:
       E fire · L water · E lightning · M frost · E nature · N void · T wind
   On load the letters slam in one by one (CSS) and each lands with its own
   element bursting off it; then the RAG tag hits with a prismatic shockwave.

   Then, on a loop, an ELEMENTAL SURGE: a comet of light runs along the word,
   shifting colour as it goes. Every letter it passes flares in its element's
   colours, hops on a spring and throws off that element:
     fire      flame tongues and rising embers
     water     teardrop droplets and splash rings
     lightning branching bolts that flicker, plus sparks
     frost     faceted ice shards and twinkling glints
     nature    veined leaves that flutter down
     void      dark wisps spiralling into a collapsing rift
     wind      curling gust streaks
   At the end the comet dives into the RAG tag: a white flash, light rays, a
   seven-colour shockwave ring and a bit of every element at once, while the
   tag squashes and springs back.

   Between surges a single mote now and then drifts off a random letter so
   the logo never sits completely still. Everything is drawn on one canvas
   over the home screen; clicks pass straight through it.
   ========================================================================= */

const TitleFx = (() => {
  const EL = [
    { k: 'fire', c: '#ffb347', d: '#ff5a1f', rgb: '255,150,60' },
    { k: 'water', c: '#7cc8ff', d: '#2f7fe0', rgb: '110,190,255' },
    { k: 'lightning', c: '#fff27a', d: '#a77bff', rgb: '255,240,140' },
    { k: 'frost', c: '#c9f2ff', d: '#4fb6e0', rgb: '190,236,255' },
    { k: 'nature', c: '#9ae66e', d: '#3f9b3a', rgb: '150,230,110' },
    { k: 'void', c: '#c08bff', d: '#6a35d0', rgb: '180,120,255' },
    { k: 'wind', c: '#bdf3e4', d: '#2fb58f', rgb: '170,240,220' },
  ];
  const TAU = Math.PI * 2;
  const LOOP = 8.5;                 // seconds between surges
  const INTRO = 2.4;                // the film clock starts at -INTRO for the load-in
  const RUN = 1.3, DIVE = 0.42;     // comet: along the word, then down into the tag

  let cv, ctx, home, title, letters = [], tag, raf = 0, last = 0, dpr = 1, reduced = false;
  let T = -INTRO;
  let parts = [], rings = [], bolts = [], rays = [], flashes = [];
  let springs = [];                 // per letter + the tag: { x, y, r, s, vx, vy, vr, vs }
  let lit = [];                     // seconds of glow left on each letter
  let comet = null, hit = [], introHit = [], moteT = 1;
  let k = 1;                        // scale of everything relative to a 54px logo

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
  const easeInOut = t => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  /* -------------------------------------------------------------- setup */
  function init() {
    home = document.getElementById('home');
    title = home && home.querySelector('.title');
    if (!title) return;
    letters = [...title.querySelectorAll('.t1 i')];
    tag = title.querySelector('.t2');
    if (letters.length !== EL.length || !tag) return;
    letters.forEach((l, i) => { l.style.setProperty('--ec', EL[i].c); l.style.setProperty('--ed', EL[i].d); });
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    cv = document.createElement('canvas');
    cv.id = 'titleFx';
    cv.setAttribute('aria-hidden', 'true');
    home.appendChild(cv);
    ctx = cv.getContext('2d');
    springs = [...letters, tag].map(() => ({ x: 0, y: 0, r: 0, s: 0, vx: 0, vy: 0, vr: 0, vs: 0 }));
    lit = letters.map(() => 0);
    resize();
    window.addEventListener('resize', resize);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
  }

  // where a letter (or the tag) sits right now, without the spring offsets
  function box(i) {
    const el = i < letters.length ? letters[i] : tag;
    const keep = [el.style.translate, el.style.rotate, el.style.scale];
    el.style.translate = el.style.rotate = el.style.scale = '';
    const r = el.getBoundingClientRect();
    [el.style.translate, el.style.rotate, el.style.scale] = keep;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }
  function measureK() { const r = letters[0].getBoundingClientRect(); k = (r.height / 62) || 1; }

  /* --------------------------------------------------------- spawners */
  const P = o => parts.push(Object.assign({ t: 0, rot: 0, vr: 0, seed: Math.random() * 100 }, o));

  function burst(i, b, n = 1) {
    const e = EL[i].k, s = k;
    if (e === 'fire') {
      for (let j = 0; j < 6 * n; j++) P({ type: 'flame', x: b.x + rand(-0.4, 0.4) * b.w, y: b.top + b.h * rand(0.2, 0.6), vx: rand(-40, 40) * s, vy: rand(-230, -120) * s, size: rand(7, 13) * s, life: rand(0.6, 1.0), lean: rand(-0.25, 0.25) });
      for (let j = 0; j < 14 * n; j++) P({ type: 'ember', x: b.x + rand(-0.5, 0.5) * b.w, y: b.y, vx: rand(-120, 120) * s, vy: rand(-380, -120) * s, life: rand(0.7, 1.5), col: pick(['#fff1b0', '#ffb347', '#ff7a2f']) });
    } else if (e === 'water') {
      for (let j = 0; j < 11 * n; j++) { const a = rand(-Math.PI * 0.9, -Math.PI * 0.1); const v = rand(220, 460) * s; P({ type: 'drop', x: b.x + rand(-0.3, 0.3) * b.w, y: b.top + b.h * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: rand(3, 5.5) * s, life: rand(0.8, 1.3) }); }
      rings.push({ x: b.x, y: b.bottom - 2 * s, r0: 6 * s, r1: b.w * 0.95, life: 0.6, t: 0, col: '124,200,255', w: 2.2, squash: 0.28 });
      rings.push({ x: b.x, y: b.bottom - 2 * s, r0: 2 * s, r1: b.w * 0.6, life: 0.5, t: -0.08, col: '200,235,255', w: 1.4, squash: 0.28 });
    } else if (e === 'lightning') {
      for (let j = 0; j < 3 * n; j++) { const a = rand(-Math.PI * 0.95, -Math.PI * 0.05); const L = rand(70, 140) * s; bolts.push({ x0: b.x + rand(-0.2, 0.2) * b.w, y0: b.top + b.h * 0.25, x1: b.x + Math.cos(a) * L, y1: b.top + Math.sin(a) * L, t: -j * 0.06, life: 0.26, pts: null, jit: 0 }); }
      for (let j = 0; j < 12 * n; j++) { const a = rand(0, TAU), v = rand(200, 520) * s; P({ type: 'spark', x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.25, 0.55), col: pick(['#ffffff', '#fff27a', '#cdb6ff']), len: rand(8, 18) * s }); }
      flashes.push({ x: b.x, y: b.y, r: 90 * s, life: 0.22, t: 0, col: '255,245,170' });
    } else if (e === 'frost') {
      for (let j = 0; j < 9 * n; j++) { const a = rand(0, TAU), v = rand(140, 330) * s; P({ type: 'shard', x: b.x + rand(-0.3, 0.3) * b.w, y: b.y + rand(-0.3, 0.3) * b.h, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120 * s, rot: rand(0, TAU), vr: rand(-6, 6), L: rand(7, 14) * s, W: rand(2.4, 4.2) * s, life: rand(0.9, 1.5) }); }
      for (let j = 0; j < 8 * n; j++) P({ type: 'glint', x: b.x + rand(-0.9, 0.9) * b.w, y: b.y + rand(-0.9, 0.7) * b.h, vx: rand(-15, 15) * s, vy: rand(-30, 5) * s, size: rand(4, 8) * s, life: rand(0.8, 1.4) });
    } else if (e === 'nature') {
      for (let j = 0; j < 8 * n; j++) { const a = rand(-Math.PI * 0.85, -Math.PI * 0.15), v = rand(220, 380) * s; P({ type: 'leaf', x: b.x + rand(-0.3, 0.3) * b.w, y: b.top + b.h * 0.35, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rand(0, TAU), L: rand(7, 11) * s, W: rand(3.2, 4.6) * s, life: rand(1.3, 2.0), hue: Math.random() }); }
    } else if (e === 'void') {
      for (let j = 0; j < 10 * n; j++) P({ type: 'wisp', cx: b.x, cy: b.y, a: rand(0, TAU), r0: rand(46, 80) * s, va: rand(4, 7) * (Math.random() < 0.5 ? -1 : 1), size: rand(3, 5.5) * s, life: rand(0.75, 1.1), x: b.x, y: b.y });
      rings.push({ x: b.x, y: b.y, r0: 74 * s, r1: 3 * s, life: 0.7, t: 0, col: '192,139,255', w: 2.6, squash: 1, implode: true });
      flashes.push({ x: b.x, y: b.y, r: 70 * s, life: 0.5, t: 0, col: '120,60,220' });
    } else if (e === 'wind') {
      for (let j = 0; j < 5 * n; j++) P({ type: 'gust', cx: b.x + rand(-0.2, 0.4) * b.w, cy: b.y + rand(-0.45, 0.35) * b.h, r: rand(9, 20) * s, vrr: rand(18, 40) * s, a0: rand(0, TAU), va: rand(5, 8) * (Math.random() < 0.5 ? -1 : 1), drift: rand(90, 170) * s, life: rand(0.6, 0.95), x: b.x, y: b.y });
    }
  }

  // a single gentle mote between surges, so the logo never sits completely still
  function mote() {
    const i = (Math.random() * letters.length) | 0, b = box(i), e = EL[i].k, s = k;
    if (e === 'fire') P({ type: 'ember', x: b.x + rand(-0.3, 0.3) * b.w, y: b.top + b.h * 0.3, vx: rand(-15, 15) * s, vy: rand(-90, -50) * s, life: rand(1.2, 1.8), col: '#ffb347', calm: true });
    else if (e === 'frost') P({ type: 'glint', x: b.x + rand(-0.5, 0.5) * b.w, y: b.y + rand(-0.5, 0.4) * b.h, vx: 0, vy: -6 * s, size: rand(4, 6) * s, life: 1.2 });
    else if (e === 'nature') P({ type: 'leaf', x: b.x + rand(-0.3, 0.3) * b.w, y: b.top + 4 * s, vx: rand(-30, 30) * s, vy: -60 * s, rot: rand(0, TAU), L: 7 * s, W: 3.2 * s, life: 1.8, hue: Math.random(), calm: true });
    else if (e === 'void') P({ type: 'wisp', cx: b.x, cy: b.y, a: rand(0, TAU), r0: 34 * s, va: 4, size: 3 * s, life: 0.9, x: b.x, y: b.y });
    else if (e === 'water') P({ type: 'drop', x: b.x + rand(-0.3, 0.3) * b.w, y: b.bottom - 4 * s, vx: 0, vy: 30 * s, size: 3 * s, life: 0.7 });
    else if (e === 'wind') P({ type: 'gust', cx: b.x, cy: b.y, r: 18 * s, vrr: 30 * s, a0: rand(0, TAU), va: 4, drift: 50 * s, life: 0.9, x: b.x, y: b.y });
    else P({ type: 'spark', x: b.x, y: b.top, vx: rand(-80, 80) * s, vy: rand(-160, -60) * s, life: 0.35, col: '#fff27a', len: 9 * s });
  }

  function kick(i, x, y, r, sc = 0) { const s = springs[i]; s.vx += x; s.vy += y; s.vr += r; s.vs += sc; }

  function strikeLetter(i) {
    const b = box(i);
    lit[i] = 1.15;
    burst(i, b);
    kick(i, rand(-40, 40), -520, rand(-1, 1) * 9, 1.2);
    rings.push({ x: b.x, y: b.y, r0: 6 * k, r1: b.h * 0.95, life: 0.42, t: 0, col: EL[i].rgb, w: 2, squash: 1 });
  }
  function strikeTag(big) {
    const b = box(letters.length), s = k;
    tag.classList.remove('hit'); void tag.offsetWidth; tag.classList.add('hit');
    flashes.push({ x: b.x, y: b.y, r: (big ? 170 : 130) * s, life: 0.4, t: 0, col: '255,255,255' });
    rings.push({ x: b.x, y: b.y, r0: 12 * s, r1: (big ? 165 : 125) * s, life: 0.7, t: 0, prism: true, w: 3.6, squash: 0.5 });
    rings.push({ x: b.x, y: b.y, r0: 6 * s, r1: (big ? 105 : 80) * s, life: 0.5, t: 0.04, col: '255,255,255', w: 1.8, squash: 0.5 });
    const n = big ? 18 : 12;
    for (let j = 0; j < n; j++) rays.push({ x: b.x, y: b.y, a: (j / n) * TAU + rand(-0.1, 0.1), L: rand(80, 150) * s, w: rand(5, 11) * s, life: rand(0.35, 0.55), t: 0, col: EL[j % EL.length].rgb });
    const sub = { x: b.x, y: b.y, w: b.w * 0.5, h: b.h, top: b.top, bottom: b.bottom };
    EL.forEach((_, i) => burst(i, sub, 0.4));
    kick(letters.length, 0, 260, rand(-1, 1) * 4, -2.6);
    letters.forEach((_, i) => kick(i, rand(-60, 60), rand(-140, -60), rand(-2, 2)));
  }

  /* ------------------------------------------------------------ timeline */
  function cometPos(t) {
    const a = box(0), z = box(letters.length - 1), g = box(letters.length);
    const y = (a.y + z.y) / 2, x0 = a.left - 60 * k, x1 = z.right + 26 * k;
    if (t < RUN) { const u = easeInOut(t / RUN); return { x: x0 + (x1 - x0) * u, y: y + Math.sin(u * Math.PI * 3) * 5 * k }; }
    // dive: a curve from past the T, up and over, down into the tag
    const u = clamp01((t - RUN) / DIVE), e = u * u;
    const cx = x1 + 40 * k, cy = y - 80 * k;
    const x = (1 - e) * (1 - e) * x1 + 2 * (1 - e) * e * cx + e * e * g.x;
    const yy = (1 - e) * (1 - e) * y + 2 * (1 - e) * e * cy + e * e * g.y;
    return { x, y: yy };
  }

  function step(dt) {
    const prevT = T;
    T += dt;
    if (T >= LOOP) { T -= LOOP; hit = []; }
    if (prevT < 0 && T >= 0) {
      title.classList.add('settled');                              // the CSS slam-in only plays once
      T = RUN + DIVE + 1; hit = [];                     // no surge straight after the intro: the first one comes a full loop later
    }
    measureK();

    // ---- intro: each letter lands (CSS) with its element, then the tag with a shockwave
    if (prevT < 0) {
      const it = T + INTRO;
      letters.forEach((_, i) => {
        if (!introHit[i] && it > 0.15 + i * 0.11 + 0.4) { introHit[i] = true; const b = box(i); burst(i, b, 0.55); lit[i] = 0.7; kick(i, 0, 160, rand(-1, 1) * 3, -0.6); }
      });
      if (!introHit.tag && it > 1.62) { introHit.tag = true; strikeTag(false); }
    }

    // ---- the surge
    if (T >= 0 && T < RUN + DIVE + 0.05) {
      const p = cometPos(Math.min(T, RUN + DIVE));
      if (!comet) comet = { trail: [] };
      // colour of the letter the comet is over (or the last one once it leaves the word)
      let ci = 0; letters.forEach((_, i) => { if (p.x > box(i).left) ci = i; });
      comet.x = p.x; comet.y = p.y; comet.ci = ci;
      comet.trail.unshift({ x: p.x, y: p.y, ci });
      if (comet.trail.length > 22) comet.trail.length = 22;
      if (Math.random() < 0.8) P({ type: 'spark', x: p.x, y: p.y, vx: rand(-90, 30) * k, vy: rand(-60, 60) * k, life: rand(0.25, 0.5), col: EL[ci].c, len: rand(5, 10) * k });
      letters.forEach((_, i) => { if (!hit[i] && p.x >= box(i).x) { hit[i] = true; strikeLetter(i); } });
      if (!hit.tag && T >= RUN + DIVE) { hit.tag = true; strikeTag(true); }
    } else if (comet) {
      comet.trail.pop(); if (!comet.trail.length) comet = null;
    }

    // ---- ambient motes between surges
    if (T > RUN + DIVE + 1 || (T < 0 && T > -0.4)) { moteT -= dt; if (moteT <= 0) { moteT = rand(0.35, 0.8); mote(); } }

    // ---- springs: letters hop and whip back; the tag squashes and stretches
    const els = [...letters, tag];
    springs.forEach((s, i) => {
      const K = 210, D = 12;
      s.vx += (-K * s.x - D * s.vx) * dt; s.vy += (-K * s.y - D * s.vy) * dt; s.vr += (-K * s.r - D * s.vr) * dt; s.vs += (-K * s.s - D * s.vs) * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.r += s.vr * dt; s.s += s.vs * dt;
      const still = Math.abs(s.x) + Math.abs(s.y) < 0.05 && Math.abs(s.r) < 0.01 && Math.abs(s.s) < 0.002 && Math.abs(s.vy) < 1;
      const el = els[i];
      if (still) { if (el.style.translate) el.style.translate = el.style.rotate = el.style.scale = ''; return; }
      el.style.translate = `${(s.x * k * 0.4).toFixed(2)}px ${(s.y * k * 0.4).toFixed(2)}px`;
      el.style.rotate = `${(s.r * 12).toFixed(2)}deg`;
      el.style.scale = i < letters.length ? `${(1 + s.s * 1.5).toFixed(3)}` : `${(1 - s.s * 0.9).toFixed(3)} ${(1 + s.s * 1.0).toFixed(3)}`;
    });

    // ---- letter glow
    lit.forEach((v, i) => {
      const n = Math.max(0, v - dt); lit[i] = n;
      const on = n > 0;
      if (letters[i].classList.contains('lit') !== on) letters[i].classList.toggle('lit', on);
    });

    // ---- particles
    for (const p of parts) {
      p.t += dt;
      const s = k;
      switch (p.type) {
        case 'flame': p.vy *= 1 - 1.4 * dt; p.vx += Math.sin(p.t * 9 + p.seed) * 120 * s * dt; break;
        case 'ember': p.vy += (p.calm ? -10 : 60) * s * dt; p.vx += Math.sin(p.t * 6 + p.seed) * 90 * s * dt; p.vx *= 1 - 1.2 * dt; break;
        case 'drop': p.vy += 1100 * s * dt; break;
        case 'spark': p.vx *= 1 - 3 * dt; p.vy = p.vy * (1 - 3 * dt) + 300 * s * dt; break;
        case 'shard': p.vy += 520 * s * dt; p.vx *= 1 - 1.1 * dt; p.rot += p.vr * dt; break;
        case 'glint': break;
        case 'leaf': p.vy = p.vy * (1 - 2.6 * dt) + 260 * s * dt; p.vx = p.vx * (1 - 2.2 * dt) + Math.sin(p.t * 4.5 + p.seed) * 260 * s * dt; p.rot += Math.sin(p.t * 3 + p.seed) * 4 * dt; break;
        case 'wisp': { const u = p.t / p.life; const r = p.r0 * (1 - easeOut(u)); p.a += p.va * dt * (1 + u * 3); p.x = p.cx + Math.cos(p.a) * r; p.y = p.cy + Math.sin(p.a) * r * 0.75; continue; }
        case 'gust': p.r += p.vrr * dt; p.a0 += p.va * dt; p.cx += p.drift * dt; continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    parts = parts.filter(p => p.t < p.life && p.y < innerHeight + 40);
    if (parts.length > 700) parts.splice(0, parts.length - 700);
    for (const r of rings) r.t += dt;
    rings = rings.filter(r => r.t < r.life);
    for (const b of bolts) { b.t += dt; b.jit -= dt; }
    bolts = bolts.filter(b => b.t < b.life);
    for (const r of rays) r.t += dt;
    rays = rays.filter(r => r.t < r.life);
    for (const f of flashes) f.t += dt;
    flashes = flashes.filter(f => f.t < f.life);
  }

  /* --------------------------------------------------------------- draw */
  function glow(x, y, r, rgb, a) {
    if (a <= 0 || r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function boltPath(b) {
    if (!b.pts || b.jit <= 0) {
      b.jit = 0.045;
      const n = 7, dx = b.x1 - b.x0, dy = b.y1 - b.y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      b.pts = [];
      for (let i = 0; i <= n; i++) { const u = i / n, off = i === 0 || i === n ? 0 : rand(-1, 1) * 13 * k; b.pts.push([b.x0 + dx * u + nx * off, b.y0 + dy * u + ny * off]); }
      const m = b.pts[3], ba = Math.atan2(dy, dx) + rand(-0.9, 0.9), bl = len * 0.4;
      b.branch = [m, [m[0] + Math.cos(ba) * bl * 0.5 + rand(-6, 6) * k, m[1] + Math.sin(ba) * bl * 0.5], [m[0] + Math.cos(ba) * bl, m[1] + Math.sin(ba) * bl]];
    }
    return b;
  }
  function strokePts(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }

  function drawPart(p) {
    const u = p.t / p.life, a = Math.min(1, (1 - u) * 2.4) * Math.min(1, p.t * 12 + 0.2), s = k;
    switch (p.type) {
      case 'flame': {
        const f = p.size * (1 - u * 0.55) * (1 + 0.16 * Math.sin(p.t * 34 + p.seed));
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.lean + Math.sin(p.t * 7 + p.seed) * 0.18);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
        const g = ctx.createRadialGradient(0, f * 0.35, 0, 0, f * 0.1, f * 1.6);
        g.addColorStop(0, 'rgba(255,248,214,1)'); g.addColorStop(0.3, 'rgba(255,190,80,0.95)'); g.addColorStop(0.7, 'rgba(255,90,31,0.7)'); g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, -f * 1.8);
        ctx.bezierCurveTo(f * 0.95, -f * 0.6, f * 0.95, f * 0.7, 0, f * 0.85);
        ctx.bezierCurveTo(-f * 0.95, f * 0.7, -f * 0.95, -f * 0.6, 0, -f * 1.8); ctx.fill();
        ctx.fillStyle = 'rgba(255,250,230,0.85)';
        ctx.beginPath(); ctx.moveTo(0, -f * 0.6); ctx.bezierCurveTo(f * 0.4, -f * 0.1, f * 0.4, f * 0.55, 0, f * 0.6); ctx.bezierCurveTo(-f * 0.4, f * 0.55, -f * 0.4, -f * 0.1, 0, -f * 0.6); ctx.fill();
        ctx.restore(); break;
      }
      case 'ember': {
        ctx.globalCompositeOperation = 'lighter';
        glow(p.x, p.y, 7 * s, '255,140,50', 0.45 * a);
        ctx.globalAlpha = a; ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * s * (1 - u * 0.5), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; break;
      }
      case 'drop': {
        const sp = Math.hypot(p.vx, p.vy), ang = Math.atan2(p.vy, p.vx), r = p.size, stretch = 1 + Math.min(1.4, sp / (500 * s));
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createLinearGradient(-r * 2, -r, r, r);
        g.addColorStop(0, 'rgba(200,235,255,0.9)'); g.addColorStop(0.6, 'rgba(110,190,255,0.95)'); g.addColorStop(1, 'rgba(47,127,224,0.95)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); ctx.quadraticCurveTo(-r * 1.2 * stretch, r * 0.4, -r * 2.2 * stretch, 0); ctx.quadraticCurveTo(-r * 1.2 * stretch, -r * 0.4, 0, -r); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(r * 0.25, -r * 0.4, r * 0.38, r * 0.22, 0, 0, TAU); ctx.fill();
        ctx.restore(); break;
      }
      case 'spark': {
        const sp = Math.hypot(p.vx, p.vy) || 1, l = p.len * Math.min(1, sp / (260 * s));
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.strokeStyle = p.col; ctx.lineWidth = 1.6 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / sp * l, p.y - p.vy / sp * l); ctx.stroke(); ctx.globalAlpha = 1; break;
      }
      case 'shard': {
        const L = p.L, W = p.W;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createLinearGradient(-W, -L, W, L);
        g.addColorStop(0, 'rgba(240,252,255,0.95)'); g.addColorStop(0.5, 'rgba(160,226,250,0.9)'); g.addColorStop(1, 'rgba(79,182,224,0.85)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(W, -L * 0.35); ctx.lineTo(W * 0.75, L * 0.6); ctx.lineTo(0, L); ctx.lineTo(-W * 0.75, L * 0.6); ctx.lineTo(-W, -L * 0.35); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(40,120,170,0.35)';            // the shaded facet
        ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(W, -L * 0.35); ctx.lineTo(W * 0.75, L * 0.6); ctx.lineTo(0, L); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.9 * k;
        ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(0, L); ctx.stroke();
        ctx.restore(); break;
      }
      case 'glint': {
        const tw = Math.sin(clamp01(u) * Math.PI), r = p.size * tw;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = tw;
        glow(p.x, p.y, r * 1.6, '200,240,255', 0.5 * tw);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * 0.16, p.y - r * 0.16); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x + r * 0.16, p.y + r * 0.16); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r * 0.16, p.y + r * 0.16); ctx.lineTo(p.x - r, p.y); ctx.lineTo(p.x - r * 0.16, p.y - r * 0.16); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; break;
      }
      case 'leaf': {
        const L = p.L, W = p.W, flip = Math.cos(p.t * 5 + p.seed);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.25 + 0.75 * Math.abs(flip)); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createLinearGradient(-L, -W, L, W);
        const light = p.hue < 0.5 ? 'rgba(198,245,154,1)' : 'rgba(170,230,110,1)';
        g.addColorStop(0, light); g.addColorStop(1, flip > 0 ? 'rgba(63,155,58,1)' : 'rgba(45,120,45,1)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(-L, 0); ctx.quadraticCurveTo(-L * 0.1, -W * 1.5, L, 0); ctx.quadraticCurveTo(-L * 0.1, W * 1.5, -L, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(30,90,30,0.75)'; ctx.lineWidth = 0.8 * k;
        ctx.beginPath(); ctx.moveTo(-L * 1.25, 0); ctx.lineTo(L * 0.85, 0);
        for (let v = -0.5; v <= 0.4; v += 0.3) { ctx.moveTo(L * v, 0); ctx.lineTo(L * (v + 0.25), -W * 0.55); ctx.moveTo(L * v, 0); ctx.lineTo(L * (v + 0.25), W * 0.55); }
        ctx.stroke(); ctx.restore(); break;
      }
      case 'wisp': {
        ctx.globalCompositeOperation = 'lighter';
        glow(p.x, p.y, p.size * 3.2, '150,80,255', 0.55 * a);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(16,6,34,0.95)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - u * 0.5), 0, TAU); ctx.fill();
        ctx.strokeStyle = '#d7b3ff'; ctx.lineWidth = 1.2 * k; ctx.stroke();
        // a short tail along its orbit
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(192,139,255,0.55)'; ctx.lineWidth = p.size * 0.9; ctx.lineCap = 'round';
        const r = Math.hypot(p.x - p.cx, (p.y - p.cy) / 0.75);
        ctx.beginPath(); ctx.ellipse(p.cx, p.cy, r, r * 0.75, 0, p.a - Math.sign(p.va) * 0.5, p.a, p.va < 0); ctx.stroke();
        ctx.globalAlpha = 1; break;
      }
      case 'gust': {
        // a curling streak of air: faint thin tail, bright thick head, spiralling outward
        const sweep = 0.8 + easeOut(u) * 1.6, dir = Math.sign(p.va), N = 9;
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = 0; i < N; i++) {
          const f0 = i / N, f1 = (i + 1) / N, rr = p.r * (0.7 + 0.3 * f1);
          ctx.strokeStyle = `rgba(${i > N - 3 ? '235,255,248' : '170,240,220'},${a * f1 * 0.85})`;
          ctx.lineWidth = k * (0.4 + 2.4 * f1) * (1 - u * 0.6);
          ctx.beginPath(); ctx.arc(p.cx, p.cy, rr, p.a0 + dir * sweep * f0, p.a0 + dir * sweep * f1, dir < 0); ctx.stroke();
        }
        break;
      }
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    for (const f of flashes) glow(f.x, f.y, f.r * (0.7 + 0.3 * f.t / f.life), f.col, 0.6 * (1 - f.t / f.life));
    // light rays from the tag impact
    for (const r of rays) {
      const u = r.t / r.life, L = r.L * easeOut(u * 1.6), a = 1 - u;
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a);
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, `rgba(255,255,255,${0.75 * a})`); g.addColorStop(0.35, `rgba(${r.col},${0.5 * a})`); g.addColorStop(1, `rgba(${r.col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -r.w * 0.5); ctx.lineTo(L, 0); ctx.lineTo(0, r.w * 0.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // rings: plain, imploding (void) and the seven-colour prism shockwave
    for (const r of rings) {
      if (r.t < 0) continue;
      const u = r.t / r.life, e = r.implode ? easeInOut(u) : easeOut(u), rad = r.r0 + (r.r1 - r.r0) * e, a = r.implode ? Math.sin(u * Math.PI) : 1 - u;
      ctx.lineWidth = r.w * k * (1 - u * 0.5);
      if (r.prism) {
        const seg = TAU / EL.length, spin = r.t * 2.2;
        EL.forEach((el, i) => {
          ctx.strokeStyle = `rgba(${el.rgb},${0.9 * a})`;
          ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * r.squash, 0, spin + i * seg, spin + (i + 1) * seg - 0.04); ctx.stroke();
        });
      } else {
        ctx.strokeStyle = `rgba(${r.col},${0.8 * a})`;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * r.squash, 0, 0, TAU); ctx.stroke();
      }
    }
    // lightning
    for (const b of bolts) {
      if (b.t < 0) continue;
      boltPath(b);
      const a = (1 - b.t / b.life) * (0.65 + 0.35 * Math.random());
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(167,123,255,${0.45 * a})`; ctx.lineWidth = 7 * k; strokePts(b.pts); strokePts(b.branch);
      ctx.strokeStyle = `rgba(255,242,122,${0.9 * a})`; ctx.lineWidth = 2.6 * k; strokePts(b.pts); ctx.lineWidth = 1.6 * k; strokePts(b.branch);
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1 * k; strokePts(b.pts);
    }

    for (const p of parts) drawPart(p);
    ctx.globalAlpha = 1;

    // the comet: a ribbon of light that changes colour letter by letter
    if (comet && comet.trail.length > 1) {
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const tr = comet.trail;
      for (let i = 1; i < tr.length; i++) {
        const u = i / tr.length, el = EL[tr[i].ci];
        ctx.strokeStyle = `rgba(${el.rgb},${0.8 * (1 - u)})`; ctx.lineWidth = 9 * k * (1 - u);
        ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      for (let i = 1; i < Math.min(tr.length, 9); i++) { ctx.lineWidth = 3 * k * (1 - i / 9); ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke(); }
      if (T < RUN + DIVE + 0.05) {
        const el = EL[comet.ci];
        glow(comet.x, comet.y, 46 * k, el.rgb, 0.7);
        glow(comet.x, comet.y, 14 * k, '255,255,255', 0.95);
        const hs = ctx.createLinearGradient(comet.x - 70 * k, 0, comet.x + 70 * k, 0);          // a small anamorphic streak
        hs.addColorStop(0, `rgba(${el.rgb},0)`); hs.addColorStop(0.5, 'rgba(255,255,255,0.7)'); hs.addColorStop(1, `rgba(${el.rgb},0)`);
        ctx.fillStyle = hs; ctx.fillRect(comet.x - 70 * k, comet.y - 1 * k, 140 * k, 2 * k);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const showing = !home.classList.contains('hidden') && !document.hidden;
    if (!showing) {
      if (cv.dataset.clear !== '1') {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); cv.dataset.clear = '1';
        parts = []; rings = []; bolts = []; rays = []; flashes = []; comet = null;
        letters.forEach(l => l.classList.remove('lit'));
      }
      if (T >= 0) { T = LOOP - 1.2; hit = []; }                     // back on the menu, the next surge isn't far off
      return;
    }
    cv.dataset.clear = '';
    step(dt);
    draw();
  }

  return { init, get T() { return T; }, set T(v) { T = v; hit = []; } };
})();
