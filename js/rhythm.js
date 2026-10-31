'use strict';
/* =========================================================================
   Tempo's Encore: a 15 second, four-lane rhythm game. The world freezes,
   the screen darkens, notes fall down perspective lanes toward a hit line.
   Lanes are 5 6 7 8 on a keyboard, or tapped on touch screens. The share of
   notes hit is handed back to the game as the sound blast's damage.
   ========================================================================= */

const Rhythm = (() => {
  const SONG = 15, INTRO = 1.4, TRAVEL = 0.9, OUTRO = 2.1;
  const WIN = { perfect: 0.05, great: 0.09, good: 0.13 };
  const KEYS = { Digit5: 0, Digit6: 1, Digit7: 2, Digit8: 3, Numpad5: 0, Numpad6: 1, Numpad7: 2, Numpad8: 3 };
  const LANE_COL = ['#7ad8ff', '#b9a8ff', '#ff7ad9', '#ffd36b'];
  let el = null, cv = null, ctx = null, active = false, notes = [], t = 0, last = 0, done = null;
  let tip = -1, ghostTimes = [];   // spam warning: when it last appeared
  let hits = 0, ghosts = 0, units = 0, combo = 0, best = 0, held = [null, null, null, null], pointers = new Map(), pops = [], flashes = [0, 0, 0, 0], sparks = [], beatNo = -1, result = null;

  // random but fair chart: 16th grid at 150 BPM, no jacks faster than 0.2s, chords only on open lanes
  function chart() {
    const out = [], step = 60 / 150 / 2, lastAt = [-9, -9, -9, -9];
    let tm = 0.7, prev = -1;
    while (tm < SONG - 0.3) {
      const r = Math.random();
      const free = [0, 1, 2, 3].filter(l => tm - lastAt[l] >= 0.2 && l !== prev);
      if (r < 0.7 && free.length) {
        const l = free[Math.floor(Math.random() * free.length)];
        // now and then a hold note: keep the lane pressed until its tail passes the line
        if (Math.random() < 0.17 && tm < SONG - 1.5) {
          const len = step * (2 + Math.floor(Math.random() * 3));
          out.push({ lane: l, at: tm, len }); lastAt[l] = tm + len + 0.05; prev = l;
          tm += step; continue;
        }
        out.push({ lane: l, at: tm }); lastAt[l] = tm; prev = l;
        // a chord now and then (two lanes at once)
        const rest = free.filter(x => x !== l);
        if (Math.random() < 0.16 && rest.length) { const l2 = rest[Math.floor(Math.random() * rest.length)]; out.push({ lane: l2, at: tm }); lastAt[l2] = tm; }
        // a quick 16th double into a neighbouring lane
        else if (Math.random() < 0.2) {
          const t2 = tm + step / 2, nb = [l - 1, l + 1].filter(x => x >= 0 && x < 4 && t2 - lastAt[x] >= 0.2);
          if (nb.length) { const l2 = nb[Math.floor(Math.random() * nb.length)]; out.push({ lane: l2, at: t2 }); lastAt[l2] = t2; prev = l2; }
        }
      }
      tm += step;
    }
    // a hold's lane stays clear while it is held
    const holds = out.filter(n => n.len);
    const clean = out.filter(n => n.len || !holds.some(h => h.lane === n.lane && n.at > h.at - 0.05 && n.at < h.at + h.len + 0.2));
    return clean.sort((a, b) => a.at - b.at).map(n => Object.assign(n, { state: 'live' }));
  }

  function build() {
    el = document.createElement('div');
    el.id = 'rhythm';
    el.innerHTML = '<canvas></canvas>';
    document.body.appendChild(el);
    cv = el.querySelector('canvas'); ctx = cv.getContext('2d');
    el.addEventListener('pointerdown', e => { if (!active) return; e.preventDefault(); const l = laneAt(e.clientX); if (l >= 0) { pointers.set(e.pointerId, l); press(l); } });
    const up = e => { const l = pointers.get(e.pointerId); pointers.delete(e.pointerId); if (active && l != null && ![...pointers.values()].includes(l)) release(l); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    window.addEventListener('keydown', e => {
      if (!active || !(e.code in KEYS)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) press(KEYS[e.code]);
    }, true);
    window.addEventListener('keyup', e => {
      if (!active || !(e.code in KEYS)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      release(KEYS[e.code]);
    }, true);
  }

  function geom() {
    const W = innerWidth, H = innerHeight;
    const lw = Math.min(120, W * 0.17, H * 0.26);
    const width = lw * 4, x0 = (W - width) / 2;
    return { W, H, lw, width, x0, hitY: H * 0.8, topY: H * 0.06 };
  }
  function laneAt(x) { const g = geom(); const l = Math.floor((x - g.x0) / g.lw); return l >= 0 && l < 4 ? l : -1; }

  function start(mv, cb) {
    if (!el) build();
    notes = chart(); t = 0; last = performance.now(); done = cb;
    hits = 0; ghosts = 0; combo = 0; best = 0; pops = []; sparks = []; flashes = [0, 0, 0, 0]; beatNo = -1; result = null;
    held = [null, null, null, null]; pointers.clear(); tip = -1; ghostTimes = [];
    units = notes.length + notes.filter(n => n.len).length;   // a hold counts its head and its tail
    active = true;
    el.classList.add('on');
    document.body.classList.add('rhythm');
    document.body.classList.toggle('rhythm-touch', document.body.classList.contains('touch'));
    requestAnimationFrame(loop);
  }
  function abort() {
    active = false;
    if (el) el.classList.remove('on');
    document.body.classList.remove('rhythm');
  }

  const songT = () => t - INTRO;
  function judge(dt) {
    const a = Math.abs(dt);
    return a <= WIN.perfect ? 'PERFECT' : a <= WIN.great ? 'GREAT' : a <= WIN.good ? 'GOOD' : null;
  }
  function press(lane) {
    if (songT() < -0.3 || result) return;
    flashes[lane] = 1;
    const now = songT();
    let hitNote = null;
    for (const n of notes) if (n.state === 'live' && n.lane === lane && Math.abs(n.at - now) <= WIN.good && (!hitNote || Math.abs(n.at - now) < Math.abs(hitNote.at - now))) hitNote = n;
    if (!hitNote) {
      // a tap with nothing to hit: spamming costs accuracy and the combo
      if (now > 0 && now < SONG + 0.2) {
        ghosts++; combo = 0; pops.push({ lane, text: 'MISS', t: 0 }); Sfx.note(lane, false);
        // lots of stray taps in a short burst: show a gentle tip (at most every few seconds)
        ghostTimes.push(now); ghostTimes = ghostTimes.filter(x => now - x < 2);
        if (ghostTimes.length >= 5 && (tip < 0 || t - tip > 6)) { tip = t; ghostTimes = []; }
      }
      return;
    }
    const j = judge(hitNote.at - now);
    hitNote.state = hitNote.len ? 'holding' : 'hit';
    if (hitNote.len) held[lane] = hitNote;
    hits++; combo++; bestCombo();
    pops.push({ lane, text: j, t: 0 });
    for (let i = 0; i < 8; i++) sparks.push({ lane, x: Math.random() - 0.5, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.2 - 0.4, t: 0 });
    Sfx.note(lane);
  }
  function release(lane) {
    const n = held[lane];
    held[lane] = null;
    if (!n || n.state !== 'holding') return;
    if (songT() < n.at + n.len - 0.1) { n.state = 'broken'; combo = 0; pops.push({ lane, text: 'MISS', t: 0 }); Sfx.note(lane, false); }
  }
  function bestCombo() { if (combo > best) best = combo; }

  function loop(now) {
    if (!active) return;
    // stopped from outside (quit to menu, run ended)
    if (!Game.rhythm && !result) { abort(); return; }
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (Game.paused) dt = 0;   // pause menu holds the song too
    t += dt;
    const s = songT();
    // metronome so the beat is easy to feel
    const bn = Math.floor(s / 0.4);
    if (s >= 0 && s < SONG && bn !== beatNo) { beatNo = bn; Sfx.beat(bn % 4 === 0); }
    for (const n of notes) if (n.state === 'live' && s - n.at > WIN.good) { n.state = 'miss'; combo = 0; pops.push({ lane: n.lane, text: 'MISS', t: 0 }); Sfx.note(n.lane, false); }
    for (const n of notes) if (n.state === 'holding') {
      if (Math.random() < dt * 30) sparks.push({ lane: n.lane, x: Math.random() - 0.5, vx: (Math.random() - 0.5) * 1.5, vy: -Math.random() * 1.2 - 0.3, t: 0 });
      flashes[n.lane] = Math.max(flashes[n.lane], 0.6);
      if (s >= n.at + n.len) { n.state = 'hit'; held[n.lane] = null; hits++; combo++; bestCombo(); pops.push({ lane: n.lane, text: 'PERFECT', t: 0 }); Sfx.note(n.lane); }
    }
    for (const p of pops) p.t += dt;
    pops = pops.filter(p => p.t < 0.5);
    for (const sp of sparks) sp.t += dt;
    sparks = sparks.filter(sp => sp.t < 0.45);
    for (let i = 0; i < 4; i++) flashes[i] = Math.max(0, flashes[i] - dt * 5);
    if (!result && s > SONG + 0.25) { result = { pct: units ? Math.min(1, hits / (units + ghosts)) : 0, t: 0 }; Sfx.chord(1); }
    if (result) {
      result.t += dt;
      if (result.t > OUTRO) { const pct = result.pct; abort(); done && done(pct); return; }
    }
    draw();
    requestAnimationFrame(loop);
  }

  const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  function grade(p) { return p >= 0.95 ? 'FULL SCORE' : p >= 0.85 ? 'GREAT!' : p >= 0.65 ? 'NICE' : p >= 0.4 ? 'OKAY' : 'MISSED THE BEAT'; }

  function draw() {
    const dpr = Math.min(2, devicePixelRatio || 1), g = geom();
    if (cv.width !== Math.round(g.W * dpr) || cv.height !== Math.round(g.H * dpr)) { cv.width = Math.round(g.W * dpr); cv.height = Math.round(g.H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.W, g.H);
    const s = songT();
    // in: backdrop darkens, lanes rise; out: lanes sink and the backdrop clears
    const kIn = ease(t / 0.55);
    const kOut = result ? ease((result.t - (OUTRO - 0.55)) / 0.55) : 0;
    const vis = kIn * (1 - kOut);
    ctx.fillStyle = `rgba(6,7,14,${0.72 * vis})`;
    ctx.fillRect(0, 0, g.W, g.H);
    const lift = (1 - kIn) * g.H * 0.6 + kOut * g.H * 0.6;
    ctx.save(); ctx.translate(0, lift); ctx.globalAlpha = vis;

    const cx = g.W / 2;
    const persp = () => 1;   // flat, straight lanes: notes fall at one constant speed
    const X = (lanePos, y) => cx + (g.x0 + lanePos * g.lw - cx) * persp(y);
    // lane floor
    ctx.beginPath(); ctx.moveTo(X(0, g.topY), g.topY); ctx.lineTo(X(4, g.topY), g.topY); ctx.lineTo(X(4, g.H), g.H); ctx.lineTo(X(0, g.H), g.H); ctx.closePath();
    const fl = ctx.createLinearGradient(0, g.topY, 0, g.H);
    fl.addColorStop(0, 'rgba(30,26,52,0)'); fl.addColorStop(0.3, 'rgba(30,26,52,0.75)'); fl.addColorStop(1, 'rgba(18,16,32,0.95)');
    ctx.fillStyle = fl; ctx.fill();
    for (let i = 0; i < 4; i++) {
      if (flashes[i] > 0) {
        ctx.beginPath(); ctx.moveTo(X(i, g.topY), g.topY); ctx.lineTo(X(i + 1, g.topY), g.topY); ctx.lineTo(X(i + 1, g.hitY), g.hitY); ctx.lineTo(X(i, g.hitY), g.hitY); ctx.closePath();
        const lg = ctx.createLinearGradient(0, g.topY, 0, g.hitY);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, hexA(LANE_COL[i], 0.35 * flashes[i]));
        ctx.fillStyle = lg; ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(X(i, g.topY), g.topY); ctx.lineTo(X(i, g.H), g.H); ctx.stroke(); }
    // hit line
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X(0, g.hitY), g.hitY); ctx.lineTo(X(4, g.hitY), g.hitY); ctx.stroke();
    ctx.shadowColor = '#ff3d9a'; ctx.shadowBlur = 16; ctx.stroke(); ctx.shadowBlur = 0;
    // notes
    const yAt = when => g.topY + (g.hitY - g.topY) * (1 - (when - s) / TRAVEL);
    for (const n of notes) {
      if (n.state === 'hit') continue;
      const x1 = X(n.lane + 0.08, 0), x2 = X(n.lane + 0.92, 0), h = 16;
      if (n.len) {
        // hold: a body from head to tail; while held the head sits on the line
        const headY = n.state === 'holding' ? g.hitY : yAt(n.at), tailY = Math.max(g.topY, yAt(n.at + n.len));
        if (tailY > g.H || headY < g.topY - 20) continue;
        ctx.globalAlpha = vis * (n.state === 'miss' || n.state === 'broken' ? 0.3 : 1) * 0.5;
        ctx.fillStyle = LANE_COL[n.lane];
        roundRect(ctx, x1 + 10, tailY, x2 - x1 - 20, Math.max(0, headY - tailY), 6); ctx.fill();
        ctx.globalAlpha = vis * (n.state === 'miss' || n.state === 'broken' ? 0.3 : 1);
        roundRect(ctx, x1, tailY - h / 2, x2 - x1, h, h / 2); ctx.fill();
        roundRect(ctx, x1, headY - h / 2, x2 - x1, h, h / 2); ctx.fill();
        continue;
      }
      const u = 1 - (n.at - s) / TRAVEL;
      if (u < 0 || u > 1.25) continue;
      const y = yAt(n.at);
      ctx.globalAlpha = vis * (n.state === 'miss' ? 0.3 : Math.min(1, u * 4));
      ctx.fillStyle = LANE_COL[n.lane];
      roundRect(ctx, x1, y - h / 2, x2 - x1, h, h / 2); ctx.fill();
    }
    ctx.globalAlpha = vis;
    // sparks and judgements at the hit line
    for (const sp of sparks) {
      const k = sp.t / 0.45, x = X(sp.lane + 0.5 + sp.x * 0.6, g.hitY) + sp.vx * k * 40, y = g.hitY + sp.vy * k * 90;
      ctx.fillStyle = hexA(LANE_COL[sp.lane], 1 - k); ctx.beginPath(); ctx.arc(x, y, 4 * (1 - k) + 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of pops) {
      const k = p.t / 0.5, x = X(p.lane + 0.5, g.hitY);
      ctx.globalAlpha = vis * (1 - k);
      ctx.font = `900 ${Math.round(Math.min(20, g.lw * 0.17) * (1 + (1 - ease(p.t / 0.12)) * 0.4))}px Rubik, sans-serif`;
      ctx.fillStyle = p.text === 'MISS' ? '#8b8fa3' : p.text === 'PERFECT' ? '#ffe066' : p.text === 'GREAT' ? '#ff7ad9' : '#7ad8ff';
      ctx.fillText(p.text, x, g.hitY - 34 - k * 18);
    }
    ctx.globalAlpha = vis;
    // small key hints under each lane (keyboard only)
    if (!document.body.classList.contains('touch')) {
      ctx.font = '800 12px Rubik, sans-serif';
      for (let i = 0; i < 4; i++) {
        const x = X(i + 0.5, g.hitY), y = g.hitY + 26;
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, x - 11, y - 10, 22, 20, 5); ctx.fill();
        ctx.fillStyle = flashes[i] > 0.3 ? '#ffffff' : 'rgba(255,255,255,0.7)'; ctx.fillText(String(5 + i), x, y + 1);
      }
    }
    // header: title, time bar, accuracy and combo
    const judged = notes.filter(n => n.state !== 'live' && n.state !== 'holding').length + notes.filter(n => n.len && (n.state === 'hit' || n.state === 'broken' || n.state === 'miss')).length;
    const pct = judged + ghosts ? Math.min(1, hits / (judged + ghosts)) : 1;
    ctx.font = '900 14px Rubik, sans-serif'; ctx.fillStyle = '#ffffff';
    ctx.fillText('ENCORE', cx, g.topY - 6 > 14 ? g.topY + 4 : 18);
    const bw = Math.min(g.width, 360), by = g.topY + 22;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(ctx, cx - bw / 2, by, bw, 5, 3); ctx.fill();
    const prog = Math.min(1, Math.max(0, s / SONG));
    const pg = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0); pg.addColorStop(0, '#b9a8ff'); pg.addColorStop(1, '#ff3d9a');
    ctx.fillStyle = pg; roundRect(ctx, cx - bw / 2, by, bw * prog, 5, 3); ctx.fill();
    ctx.font = '900 18px Rubik, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
    ctx.fillText(Math.round(pct * 100) + '%', cx + bw / 2 + 12, by + 3);
    ctx.textAlign = 'center';
    if (combo >= 3) {
      ctx.font = `900 ${Math.round(Math.min(46, g.H * 0.08))}px Rubik, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(combo, cx, g.H * 0.36);
      ctx.font = '800 12px Rubik, sans-serif'; ctx.fillStyle = '#ff7ad9'; ctx.fillText('COMBO', cx, g.H * 0.36 + Math.min(30, g.H * 0.055));
    }
    // spam tip: fades in, holds, fades out
    if (tip >= 0 && t - tip < 2.6) {
      const k = t - tip, a = Math.min(1, k / 0.3, (2.6 - k) / 0.5);
      ctx.globalAlpha = vis * a;
      const msg = 'TAPPING AN EMPTY LANE COUNTS AS A MISS', yy = g.topY + 54 - (1 - Math.min(1, k / 0.3)) * 8;
      ctx.font = '800 13px Rubik, sans-serif';
      const tw = ctx.measureText(msg).width + 28;
      ctx.fillStyle = 'rgba(14,12,26,0.88)'; roundRect(ctx, cx - tw / 2, yy - 15, tw, 30, 8); ctx.fill();
      ctx.fillStyle = '#ffd36b'; ctx.fillText(msg, cx, yy + 1);
      ctx.globalAlpha = vis;
    }
    // countdown
    if (s < 0) {
      const txt = s < -0.55 ? 'READY?' : 'GO!';
      ctx.font = `900 ${Math.round(Math.min(64, g.H * 0.12))}px Rubik, sans-serif`;
      ctx.fillStyle = '#ffffff'; ctx.fillText(txt, cx, g.H * 0.45);
    }
    ctx.restore();
    // result card
    if (result) {
      const k = ease(result.t / 0.35), fade = 1 - ease((result.t - (OUTRO - 0.5)) / 0.4);
      ctx.save(); ctx.globalAlpha = Math.max(0, fade); ctx.translate(cx, g.H * 0.45); ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
      ctx.fillStyle = 'rgba(14,12,26,0.92)'; roundRect(ctx, -170, -70, 340, 140, 14); ctx.fill();
      ctx.strokeStyle = '#ff3d9a'; ctx.lineWidth = 3; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const shown = Math.round(result.pct * 100 * Math.min(1, result.t / 0.6));
      ctx.font = '900 54px Rubik, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(shown + '%', 0, -14);
      ctx.font = '900 16px Rubik, sans-serif'; ctx.fillStyle = '#ffe066'; ctx.fillText(grade(result.pct), 0, 30);
      ctx.font = '700 12px Rubik, sans-serif'; ctx.fillStyle = '#b9a8ff'; ctx.fillText(`BEST COMBO ${best} · ${hits}/${units} NOTES`, 0, 52);
      ctx.restore();
    }
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2))); }

  return { start, abort, get active() { return active; }, _press: press, _notes: () => notes };
})();
