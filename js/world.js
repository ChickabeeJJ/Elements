'use strict';
/* =========================================================================
   World: floating islands, the parallax realm backdrop (pre-rendered), and
   ambient weather (leaves, embers, snow, rain + lightning, void motes).
   ========================================================================= */

class Island {
  constructor(x, y, w, opts = {}) {
    this.x = x; this.y = y; this.w = w;
    this.baseX = x; this.baseY = y;
    this.depth = opts.depth || Math.min(320, w * 0.6 + 60);
    this.seed = opts.seed || Math.floor(Math.random() * 1e6);
    this.motion = opts.motion || null;    // {ax, ay, speed, phase}
    this.t = 0;
    this.dx = 0; this.dy = 0;
    this.prevTop = y;
    this.shape = this.buildShape();
  }

  get top() { return this.y; }
  get left() { return this.x - this.w / 2; }
  get right() { return this.x + this.w / 2; }

  buildShape() {
    const rng = mulberry32(this.seed);
    const hw = this.w / 2, pts = [];
    const n = Math.max(7, Math.floor(this.w / 50));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = lerp(hw, -hw, u);
      const taper = Math.sin(u * Math.PI);
      const y = 14 + taper * this.depth * (0.55 + rng() * 0.45) + (rng() - 0.5) * 10;
      pts.push([x * (1 - taper * 0.18) + (rng() - 0.5) * 8, y]);
    }
    const tufts = [];
    for (let i = 0; i < Math.floor(this.w / 16); i++) tufts.push([(rng() - 0.5) * this.w * 0.95, 4 + rng() * 7, rng()]);
    const drips = [];
    for (let i = 0; i < Math.floor(this.w / 40); i++) drips.push([(rng() - 0.5) * this.w * 0.85, 10 + rng() * 22]);
    drips.sort((a, b) => b[0] - a[0]);
    const cracks = [];
    for (let i = 0; i < Math.max(2, Math.floor(this.w / 120)); i++) {
      const sx = (rng() - 0.5) * this.w * 0.6;
      const c = [[sx, 16]];
      for (let k = 1; k < 4; k++) c.push([sx + (rng() - 0.5) * 30, 16 + k * this.depth * 0.14]);
      cracks.push(c);
    }
    return { pts, tufts, drips, cracks };
  }

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

  draw(ctx, realm, time) {
    const { pts, tufts, drips, cracks } = this.shape;
    const hw = this.w / 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    const grd = ctx.createLinearGradient(0, 0, 0, this.depth);
    grd.addColorStop(0, realm.rock);
    grd.addColorStop(1, realm.rockDark);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-hw, 6);
    ctx.lineTo(hw, 6);
    for (const [px, py] of pts) ctx.lineTo(px, py);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.moveTo(hw * 0.15, 14);
    ctx.lineTo(hw, 8);
    for (let i = 0; i < pts.length / 2; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
    if (realm.glowTop) {
      ctx.strokeStyle = realm.topDark; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.6 + Math.sin(time * 2 + this.seed) * 0.25;
      for (const c of cracks) { ctx.beginPath(); c.forEach(([cx, cy], i) => (i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy))); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = realm.topDark;
    ctx.beginPath();
    ctx.moveTo(-hw - 4, 0);
    ctx.lineTo(hw + 4, 0);
    ctx.lineTo(hw + 1, 14);
    for (const [dx, dl] of drips) { ctx.lineTo(dx + 7, 13); ctx.quadraticCurveTo(dx, 13 + dl, dx - 7, 13); }
    ctx.lineTo(-hw - 1, 14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = realm.top;
    ctx.beginPath(); ctx.roundRect(-hw - 5, -3, this.w + 10, 10, 5); ctx.fill();
    for (const [tx, th, r] of tufts) {
      ctx.beginPath();
      ctx.moveTo(tx - 4, -1);
      ctx.lineTo(tx - 1 + Math.sin(time * 1.5 + r * 6) * 1.5, -th - 3);
      ctx.lineTo(tx + 3, -1);
      ctx.fill();
    }
    if (realm.glowTop) {
      ctx.globalCompositeOperation = 'lighter';
      Glow.draw(ctx, realm.topDark, 0, 4, hw * 1.1, 0.16);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
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
    if (realm.id === 'void' || realm.id === 'storm' || realm.id === 'ember') {
      for (let i = 0; i < 160; i++) {
        const sx = lerp(x0, x1, rng()), sy = lerp(y0, H * 0.6, rng());
        g.globalAlpha = 0.2 + rng() * 0.6;
        g.fillStyle = '#ffffff';
        g.fillRect(sx, sy, 1.6, 1.6);
      }
      g.globalAlpha = 1;
    }

    // sun / moon
    const sx = W * realm.sunPos[0], sy = H * realm.sunPos[1];
    const sun = g.createRadialGradient(sx, sy, 0, sx, sy, 380);
    sun.addColorStop(0, rgba(realm.sun, 0.9));
    sun.addColorStop(0.12, rgba(realm.sun, 0.55));
    sun.addColorStop(0.4, rgba(realm.sun, 0.12));
    sun.addColorStop(1, rgba(realm.sun, 0));
    g.fillStyle = sun; g.fillRect(x0, y0, view.w, view.h);
    g.fillStyle = realm.sun;
    g.beginPath(); g.arc(sx, sy, 46, 0, TAU); g.fill();
    if (realm.id === 'void') {
      g.fillStyle = realm.sky[1];
      g.beginPath(); g.arc(sx + 18, sy - 10, 42, 0, TAU); g.fill();
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
    for (let i = 0; i < 7; i++) {
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
    const want = { leaf: 26, ember: 60, snow: 110, rain: 150, mote: 70 }[r.ambient] || 0;
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
      const col = kind === 'ember' ? '#ff9a4a' : '#b58cff';
      for (const p of this.parts) Glow.draw(ctx, col, p.x, p.y, 7 * p.s, 0.5 + Math.sin(p.t * 3 + p.ph) * 0.3);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(220,220,255,${this.flash * 0.18})`;
      ctx.fillRect(view.x0, view.y0, view.w, view.h);
    }
  }
}
