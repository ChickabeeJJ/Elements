'use strict';
/* =========================================================================
   World, flat style: charcoal sky with drifting dust specks and faint
   squares, and floating platforms built from grey stone blocks. Each realm
   only tints the greys slightly so the elements stay the colour accents.
   ========================================================================= */

const FLAT = {
  verdant: { bg: '#3d413d', block: '#6c716b', speck: '#cfe3c4', accent: '#8fd46b' },
  ember:   { bg: '#423b39', block: '#716764', speck: '#f2c9a8', accent: '#ff8a3d' },
  frost:   { bg: '#3c4146', block: '#6b737a', speck: '#e3f2fb', accent: '#9fe6ff' },
  storm:   { bg: '#3a3b45', block: '#696b78', speck: '#e4e2ff', accent: '#fff27a' },
  void:    { bg: '#37333f', block: '#66606f', speck: '#e2d2ff', accent: '#c08bff' },
};
const flatOf = realm => FLAT[realm.id] || FLAT.verdant;

class Island {
  constructor(x, y, w, opts = {}) {
    this.x = x; this.y = y; this.w = w;
    this.baseX = x; this.baseY = y;
    this.seed = opts.seed || Math.floor(Math.random() * 1e6);
    this.motion = opts.motion || null;    // {ax, ay, speed, phase}
    this.t = 0;
    this.dx = 0; this.dy = 0;
    this.prevTop = y;
    // blocks: square-ish tiles, rows taper toward the bottom
    const n = Math.max(2, Math.round(w / 52));
    this.bs = w / n;
    this.rows = [];
    const rng = mulberry32(this.seed);
    let count = n, inset = 0, row = 0;
    while (count > 0 && row < 4) {
      this.rows.push({ inset, count, shade: rng() * 0.05 });
      const cut = row === 0 ? (n > 4 ? 1 : 0) : 1 + (rng() < 0.4 ? 1 : 0);
      inset += cut; count -= cut * 2; row++;
      if (n <= 3 && row >= 2) break;
    }
    this.depth = this.rows.length * this.bs;
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
  }

  draw(ctx, realm) {
    const fl = flatOf(realm);
    const bs = this.bs, gap = 3;
    const x0 = this.left;
    this.rows.forEach((r, ri) => {
      const col = mixHex(fl.block, '#2b2b2b', ri * 0.14 + r.shade);
      ctx.fillStyle = col;
      for (let i = 0; i < r.count; i++) {
        const bx = x0 + (r.inset + i) * bs, by = this.y + ri * bs;
        ctx.fillRect(bx + gap / 2, by + gap / 2, bs - gap, bs - gap);
      }
    });
    // walkable lip in a lighter grey
    ctx.fillStyle = mixHex(fl.block, '#ffffff', 0.12);
    ctx.fillRect(x0 + gap / 2, this.y + gap / 2, this.w - gap, 5);
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
    canvas.width = Math.max(1, Math.ceil(view.w * pxScale));
    canvas.height = Math.max(1, Math.ceil(view.h * pxScale));
    const g = canvas.getContext('2d');
    g.setTransform(pxScale, 0, 0, pxScale, -view.x0 * pxScale, -view.y0 * pxScale);
    const fl = flatOf(realm);
    g.fillStyle = fl.bg;
    g.fillRect(view.x0, view.y0, view.w, view.h);
    // static specks
    const rng = mulberry32(realm.id.length * 977 + 13);
    g.fillStyle = fl.speck;
    for (let i = 0; i < 140; i++) {
      g.globalAlpha = 0.08 + rng() * 0.22;
      const r = 1 + rng() * 2.4;
      g.beginPath(); g.arc(lerp(view.x0, view.x0 + view.w, rng()), lerp(view.y0, view.y0 + view.h, rng()), r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    return canvas;
  }
  return { render };
})();

/* --------------------------------------------------------------- ambience */
class Ambience {
  constructor() { this.specks = []; this.squares = []; this.realm = null; this.flash = 0; }

  setRealm(realm, view) {
    if (this.realm === realm) return;
    this.realm = realm;
    this.specks = [];
    for (let i = 0; i < 46; i++) this.specks.push(this.spawn(view, true));
    this.squares = [];
    for (let i = 0; i < 3; i++) this.squares.push({ x: rand(view.x0, view.x0 + view.w), y: rand(view.y0 + 80, view.y0 + view.h - 80), s: rand(120, 220), a: rand(0, 6), va: rand(-0.08, 0.08), vx: rand(-8, 8), vy: rand(-5, 5) });
  }

  spawn(view, anywhere) {
    return {
      x: rand(view.x0, view.x0 + view.w), y: anywhere ? rand(view.y0, view.y0 + view.h) : view.y0 + view.h + 10,
      r: rand(1.2, 3.2), vy: -rand(6, 22), vx: rand(-6, 6), a: rand(0.12, 0.4), ph: rand(0, 6),
    };
  }

  update(dt, view) {
    if (!this.realm) return;
    for (const p of this.specks) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.ph += dt;
      if (p.y < view.y0 - 10) Object.assign(p, this.spawn(view, false));
    }
    for (const q of this.squares) {
      q.a += q.va * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.x < view.x0 - 300) q.x = view.x0 + view.w + 200;
      if (q.x > view.x0 + view.w + 300) q.x = view.x0 - 200;
    }
    this.flash = Math.max(0, this.flash - dt * 3);
  }

  drawBack(ctx) {
    if (!this.realm) return;
    ctx.fillStyle = '#ffffff';
    for (const q of this.squares) {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
      ctx.globalAlpha = 0.045;
      ctx.fillRect(-q.s / 2, -q.s / 2, q.s, q.s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawFront(ctx, view) {
    if (!this.realm) return;
    const fl = flatOf(this.realm);
    ctx.fillStyle = fl.speck;
    for (const p of this.specks) {
      ctx.globalAlpha = p.a * (0.7 + Math.sin(p.ph * 2) * 0.3);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.15})`; ctx.fillRect(view.x0, view.y0, view.w, view.h); }
  }
}
