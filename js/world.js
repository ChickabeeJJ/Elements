'use strict';
/* =========================================================================
   World: floating islands, the parallax realm backdrop (pre-rendered), and
   ambient weather (leaves, embers, snow, rain + lightning, void motes).
   ========================================================================= */

class Island {
  static PAD = 4;
  constructor(x, y, w, opts = {}) {
    this.x = x; this.y = y; this.w = w;
    this.baseX = x; this.baseY = y;
    this.depth = opts.depth || Math.min(240, w * 0.42 + 70);
    this.seed = opts.seed || Math.floor(Math.random() * 1e6);
    this.motion = opts.motion || null;    // {ax, ay, speed, phase}
    this.t = 0;
    this.dx = 0; this.dy = 0;
    this.prevTop = y;
    this.cells = this.layout();
    this.solids = this.cells.rows.map(() => ({ l: 0, r: 0, t: 0, b: 0 }));
    this.syncSolids();
  }

  get top() { return this.y; }
  get left() { return this.x - this.w / 2; }
  get right() { return this.x + this.w / 2; }

  update(dt) {
    this.t += dt;
    this.prevTop = this.y;
    const px = this.x, py = this.y;
    let x = this.baseX, y = this.baseY;
    if (this.motion) {
      const m = this.motion;
      x += Math.sin(this.t * m.speed + m.phase) * m.ax;
      y += Math.sin(this.t * m.speed * 0.8 + m.phase) * m.ay;
    }
    this.x = x; this.y = y;
    this.dx = x - px; this.dy = y - py;
    this.syncSolids();
  }

  // blocky island: a stepped pyramid of tiles. The tile rows are also the collision
  // shape, so what looks solid is solid (the top can still be jumped up through).
  // The top row always spans the full width (that's what gameplay uses); the body below
  // is shaped per island from its seed: even pyramids, lopsided steps, a sheer cliff on
  // one side, or a chunky deep base. Rows never narrow to a lone block.
  layout() {
    const n = Math.max(4, Math.round(this.w / 42)), t = this.w / n;
    const rng = mulberry32(Math.imul(this.seed, 2654435761) ^ 0x9e3779b9);
    rng(); rng();
    const style = Math.floor(rng() * 4);
    const want = clamp(Math.round(this.depth / t) + (style === 3 ? 1 : 0) - (rng() < 0.3 ? 1 : 0), 2, 5);
    const minW = Math.max(2, Math.ceil(n * 0.3));
    const big = n >= 14 ? 2 : 1;
    const cliffLeft = rng() < 0.5;
    const rows = [[0, n]];
    while (rows.length < want) {
      const [a, b] = rows[rows.length - 1];
      let sl = big, sr = big;
      if (style === 1) { sl = 1 + Math.floor(rng() * (big + 1)); sr = Math.max(0, big * 2 - sl + (rng() < 0.5 ? 0 : 1) - 1); }
      else if (style === 2) { if (cliffLeft) { sl = rows.length < 3 ? 0 : 1; sr = big + 1; } else { sr = rows.length < 3 ? 0 : 1; sl = big + 1; } }
      else if (style === 3) { sl = rng() < 0.5 ? 1 : big; sr = rng() < 0.5 ? 1 : big; }
      if (sl + sr < 1) sr = 1;
      if (b - a - sl - sr < minW) break;
      rows.push([a + sl, b - sr]);
    }
    return { n, t, rows };
  }

  syncSolids() {
    const { t, rows } = this.cells, x0 = this.x - this.w / 2;
    rows.forEach(([a, b], r) => {
      const q = this.solids[r];
      q.l = x0 + a * t; q.r = x0 + b * t; q.t = this.y + r * t; q.b = this.y + (r + 1) * t;
    });
  }

  solidAt(x, y) {
    for (const q of this.solids) if (x > q.l && x < q.r && y > q.t && y < q.b) return true;
    return false;
  }

  // soft rounded tiles with no outlines: checker tone, depth darkening, a lit left side,
  // shaded right side and undersides, and a grass/crust cap. Islands never change shape,
  // so each one is drawn once into a sprite per realm.
  draw(ctx, realm) {
    if (!this.sprite || this.spriteRealm !== realm.id) this.renderSprite(realm);
    const P = Island.PAD;
    ctx.drawImage(this.sprite, this.x - this.w / 2 - P, this.y - P, this.w + P * 2, this.cells.rows.length * this.cells.t + P * 2);
  }

  renderSprite(realm) {
    const { n, t, rows } = this.cells, SS = 2, P = Island.PAD;
    const cv = this.sprite || document.createElement('canvas');
    cv.width = Math.ceil((this.w + P * 2) * SS); cv.height = Math.ceil((rows.length * t + P * 2) * SS);
    const g = cv.getContext('2d');
    g.setTransform(SS, 0, 0, SS, P * SS, P * SS);
    const pal = Island.palette(realm), half = n / 2;
    const R = t * 0.22, rt = t * 0.16, capH = t * 0.36;
    rows.forEach(([a, b], r) => {
      const next = rows[r + 1];
      g.save();
      g.beginPath(); g.roundRect(a * t, r * t, (b - a) * t, t, [r ? 0 : R, r ? 0 : R, R, R]); g.clip();
      // a slightly deeper tone shows through only where rounded tile corners meet
      g.fillStyle = pal.tone(r * 0.11 + 0.2); g.fillRect(a * t, r * t, (b - a) * t, t);
      if (r === 0) { g.fillStyle = mixHex(realm.top, '#000000', 0.18); g.fillRect(a * t, 0, (b - a) * t, capH); }
      for (let i = a; i < b; i++) {
        const side = (i + 0.5 - half) / half;   // -1 left … 1 right
        const k = r * 0.11 + (side > 0.35 ? 0.2 : 0) + ((i + r) % 2) * 0.05 - (side < -0.35 ? 0.06 : 0);
        const x = i * t, y = r * t;
        g.save();
        g.beginPath(); g.roundRect(x, y, t, t, rt); g.clip();
        g.fillStyle = pal.tone(k); g.fillRect(x, y, t, t);
        if (!next || i < next[0] || i >= next[1]) { g.fillStyle = pal.under; g.fillRect(x, y + t * 0.8, t, t * 0.2); }
        if (r === 0) {
          g.fillStyle = (i % 2) ? pal.top2 : realm.top; g.fillRect(x, y, t, capH);
          g.fillStyle = pal.hi; g.fillRect(x, y, t, 2.5);
          g.fillStyle = realm.topDark; g.fillRect(x, y + capH, t, t * 0.1);
          g.fillStyle = pal.ao; g.fillRect(x, y + capH + t * 0.1, t, t * 0.14);
        }
        g.restore();
      }
      g.restore();
    });
    this.sprite = cv; this.spriteRealm = realm.id;
  }

  static palette(realm) {
    const tones = [];
    const tone = k => {
      const i = clamp(Math.round((k + 0.2) * 40), 0, 60);
      if (!tones[i]) {
        const v = i / 40 - 0.2;
        tones[i] = v < 0 ? mixHex(realm.rock, '#ffffff', -v * 0.6) : mixHex(realm.rock, realm.rockDark, Math.min(1, v * 1.4));
      }
      return tones[i];
    };
    return {
      id: realm.id, tone,
      top2: mixHex(realm.top, '#000000', 0.07),
      hi: mixHex(realm.top, '#ffffff', 0.3),
      under: mixHex(realm.rockDark, '#000000', 0.25),
      ao: 'rgba(0, 0, 0, 0.16)',
    };
  }
}

/* ------------------------------------------------------------------ backdrop */
const Backdrop = (() => {
  let canvas = null, key = '';
  function render(realm, view, pxScale) {
    const k = realm.id + view.x0 + view.y0 + view.w + view.h + pxScale;
    if (k === key && canvas) return canvas;
    key = k;
    canvas = canvas || document.createElement('canvas');
    const cw = Math.max(1, Math.ceil(view.w * pxScale)), ch = Math.max(1, Math.ceil(view.h * pxScale));
    canvas.width = cw; canvas.height = ch;
    const g = canvas.getContext('2d');
    g.setTransform(pxScale, 0, 0, pxScale, -view.x0 * pxScale, -view.y0 * pxScale);
    const x0 = view.x0, x1 = view.x0 + view.w, y0 = view.y0, y1 = view.y0 + view.h;

    // sky
    const sky = g.createLinearGradient(0, y0, 0, y1);
    sky.addColorStop(0, realm.sky[0]);
    sky.addColorStop(0.55, realm.sky[1]);
    sky.addColorStop(1, realm.sky[2]);
    g.fillStyle = sky; g.fillRect(x0, y0, view.w, view.h);

    // stars in dark realms
    const rng = mulberry32(realm.id.length * 977);
    if (realm.id === 'void' || realm.id === 'storm') {
      for (let i = 0; i < 160; i++) {
        const sx = lerp(x0, x1, rng()), sy = lerp(y0, H * 0.6, rng());
        g.globalAlpha = 0.2 + rng() * 0.6;
        g.fillStyle = '#ffffff';
        g.fillRect(sx, sy, 1.6, 1.6);
      }
      g.globalAlpha = 1;
    }

    // sun (only realms that ask for one; night realms stay clean)
    if (realm.showSun) {
      const sx = W * realm.sunPos[0], sy = H * realm.sunPos[1];
      const sun = g.createRadialGradient(sx, sy, 0, sx, sy, 380);
      sun.addColorStop(0, rgba(realm.sun, 0.9));
      sun.addColorStop(0.12, rgba(realm.sun, 0.55));
      sun.addColorStop(0.4, rgba(realm.sun, 0.12));
      sun.addColorStop(1, rgba(realm.sun, 0));
      g.fillStyle = sun; g.fillRect(x0, y0, view.w, view.h);
      g.fillStyle = realm.sun;
      g.beginPath(); g.arc(sx, sy, 46, 0, TAU); g.fill();
    }

    // layered ridges
    const layers = realm.hills;
    for (let li = 0; li < layers.length; li++) {
      const base = H * (0.55 + li * 0.13);
      const amp = 110 - li * 22;
      const ph = [rng() * 10, rng() * 10, rng() * 10];
      g.fillStyle = layers[li];
      g.beginPath();
      g.moveTo(x0, y1);
      for (let x = x0; x <= x1 + 20; x += 12) {
        const n = Math.sin(x * 0.0021 + ph[0]) * 0.55 + Math.sin(x * 0.0057 + ph[1]) * 0.3 + Math.sin(x * 0.013 + ph[2]) * 0.15;
        let yy = base - n * amp;
        if (realm.id === 'frost' || realm.id === 'storm') yy -= Math.abs(Math.sin(x * 0.009 + ph[1])) * 40 * (1 - li * 0.3);
        g.lineTo(x, yy);
      }
      g.lineTo(x1, y1);
      g.closePath(); g.fill();
      // haze between layers
      const fog = g.createLinearGradient(0, base - amp, 0, y1);
      fog.addColorStop(0, rgba(realm.fog, 0));
      fog.addColorStop(1, rgba(realm.fog, 0.22 - li * 0.05));
      g.fillStyle = fog; g.fillRect(x0, base - amp, view.w, y1 - base + amp);
    }
    // abyss fade at the bottom
    const abyss = g.createLinearGradient(0, H * 0.75, 0, y1);
    abyss.addColorStop(0, rgba(realm.hills[2], 0));
    abyss.addColorStop(1, rgba(mixHex(realm.hills[2], '#000000', 0.5), 0.95));
    g.fillStyle = abyss; g.fillRect(x0, H * 0.75, view.w, y1 - H * 0.75);
    // overall dim so fighters and islands pop against the sky
    g.fillStyle = 'rgba(10, 12, 26, 0.22)'; g.fillRect(x0, y0, view.w, view.h);
    return canvas;
  }
  return { render };
})();

/* --------------------------------------------------------------- ambience */
class Ambience {
  constructor() { this.parts = []; this.clouds = []; this.flash = 0; this.bolt = null; this.realm = null; }

  setRealm(realm, view) {
    if (this.realm === realm) return;
    this.realm = realm;
    this.parts.length = 0;
    this.clouds = [];
    for (let i = 0; i < (realm.clouds ? 7 : 0); i++) {
      this.clouds.push({ x: rand(view.x0, view.x0 + view.w), y: rand(60, 420), s: rand(0.6, 1.4), v: rand(6, 18) });
    }
  }

  update(dt, view) {
    const r = this.realm;
    if (!r) return;
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x - 260 * c.s > view.x0 + view.w) c.x = view.x0 - 260 * c.s;
    }
    const want = { leaf: 26, ember: 60, snow: 110, rain: 150, mote: 70, bubble: 45, spore: 55 }[r.ambient] || 0;
    while (this.parts.length < want) this.parts.push(this.spawn(view, true));
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (r.ambient === 'leaf' || r.ambient === 'snow') p.x += Math.sin(p.t * p.f + p.ph) * 22 * dt;
      if (p.y > view.y0 + view.h + 20 || p.y < view.y0 - 40 || p.x > view.x0 + view.w + 40 || p.x < view.x0 - 60) Object.assign(p, this.spawn(view, false));
    }
    if (r.flashes) {
      this.flash = Math.max(0, this.flash - dt * 3);
      if (Math.random() < dt * 0.12) {
        this.flash = 1;
        const bx = rand(view.x0, view.x0 + view.w);
        const pts = [[bx, view.y0]];
        let y = view.y0;
        while (y < H * 0.62) { y += rand(30, 70); pts.push([pts[pts.length - 1][0] + rand(-40, 40), y]); }
        this.bolt = { pts, life: 0.35 };
        Sfx.thunder();
      }
      if (this.bolt) { this.bolt.life -= dt; if (this.bolt.life <= 0) this.bolt = null; }
    }
  }

  spawn(view, anywhere) {
    const r = this.realm.ambient;
    const x = rand(view.x0 - 40, view.x0 + view.w);
    const top = view.y0 - 20, bot = view.y0 + view.h + 10;
    const p = { x, y: anywhere ? rand(top, bot) : top, t: 0, f: rand(0.8, 2), ph: rand(0, 6), s: rand(0.6, 1.4), rot: rand(0, 6) };
    if (r === 'leaf') { p.vx = rand(20, 60); p.vy = rand(30, 60); }
    else if (r === 'snow') { p.vx = rand(-10, 15); p.vy = rand(40, 90); }
    else if (r === 'rain') { p.vx = -180; p.vy = rand(900, 1200); }
    else { // embers + motes rise
      p.y = anywhere ? rand(top, bot) : bot; p.vx = rand(-12, 12); p.vy = r === 'ember' ? rand(-70, -30) : rand(-40, -15);
    }
    return p;
  }

  drawBack(ctx, view, time) {
    const r = this.realm;
    if (!r) return;
    // drifting clouds / smoke
    for (const c of this.clouds) {
      ctx.globalAlpha = r.id === 'void' ? 0.12 : r.id === 'ember' ? 0.2 : 0.35;
      for (let k = 0; k < 4; k++) {
        Glow.draw(ctx, r.fog, c.x + k * 70 * c.s, c.y + Math.sin(k * 2) * 14 * c.s, 90 * c.s, ctx.globalAlpha);
      }
    }
    ctx.globalAlpha = 1;
    if (this.bolt) {
      ctx.strokeStyle = rgba('#e8e4ff', this.bolt.life * 2);
      ctx.lineWidth = 3;
      ctx.beginPath();
      this.bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }

  drawFront(ctx, view, time) {
    const r = this.realm;
    if (!r) return;
    const kind = r.ambient;
    if (kind === 'rain') {
      ctx.strokeStyle = 'rgba(200,210,255,0.28)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const p of this.parts) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022); }
      ctx.stroke();
    } else if (kind === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of this.parts) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * p.s, 0, TAU); ctx.fill(); }
    } else if (kind === 'leaf') {
      for (const p of this.parts) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.t * p.f);
        ctx.fillStyle = p.s > 1 ? '#7cc95a' : '#a8de7a';
        ctx.beginPath(); ctx.ellipse(0, 0, 6 * p.s, 2.6 * p.s, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    } else {
      ctx.globalCompositeOperation = 'lighter';
      const col = { ember: '#ff9a4a', bubble: '#cfefff', spore: '#c8ef6a' }[kind] || '#b58cff';
      for (const p of this.parts) Glow.draw(ctx, col, p.x, p.y, 7 * p.s, 0.5 + Math.sin(p.t * 3 + p.ph) * 0.3);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(220,220,255,${this.flash * 0.18})`;
      ctx.fillRect(view.x0, view.y0, view.w, view.h);
    }
  }
}
