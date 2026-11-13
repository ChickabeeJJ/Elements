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
  // Islands sit on a 40-unit tile grid. The top row spans the full width (that's what
  // gameplay uses); every row below steps in on both sides so the silhouette always
  // tapers. The seed varies depth and step sizes (gentle slopes vs steep wedges, a
  // little asymmetry) and rows never narrow to a lone block.
  layout() {
    const n = Math.max(4, Math.round(this.w / 40)), t = this.w / n;
    const rng = mulberry32(Math.imul(this.seed, 2654435761) ^ 0x9e3779b9);
    rng(); rng();
    const want = clamp(Math.round(this.depth / t) + (rng() < 0.35 ? -1 : rng() < 0.3 ? 1 : 0), 2, 5);
    const minW = Math.max(2, Math.ceil(n * 0.25));
    const maxStep = n >= 12 ? 2 : 1;
    const rows = [[0, n]];
    while (rows.length < want) {
      const [a, b] = rows[rows.length - 1];
      const sl = maxStep > 1 && rng() < 0.6 ? 2 : 1, sr = maxStep > 1 && rng() < 0.6 ? 2 : 1;
      if (b - a - sl - sr < minW) {
        if (b - a - 2 >= minW) rows.push([a + 1, b - 1]);
        break;
      }
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

/* ------------------------------------------------------------- backdrop decor
   Realm-specific scenery painted into the pre-rendered backdrop (drawn once per realm
   and view size, so it costs nothing per frame). sky: after the sun; far: on the
   farthest ridge; near: over the nearest ridge. */
// a pine with optional fairy lights and baubles
function drawPine(g, x, base, h, col, lights, rng, star) {
  const w = h * 0.42;
  g.fillStyle = '#4a3324'; g.fillRect(x - h * 0.03, base - h * 0.12, h * 0.06, h * 0.12);
  for (let k = 0; k < 4; k++) {
    const ty = base - h * 0.1 - k * h * 0.2, tw = w * (1 - k * 0.2);
    g.fillStyle = col;
    g.beginPath(); g.moveTo(x - tw, ty); g.lineTo(x, ty - h * 0.38); g.lineTo(x + tw, ty); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';   // snow along each tier
    g.beginPath(); g.moveTo(x - tw, ty); g.quadraticCurveTo(x - tw * 0.4, ty - h * 0.05, x, ty - h * 0.02); g.quadraticCurveTo(x + tw * 0.4, ty - h * 0.05, x + tw, ty); g.lineTo(x + tw * 0.8, ty + 2); g.lineTo(x - tw * 0.8, ty + 2); g.closePath(); g.fill();
  }
  if (lights) {
    const cols = ['#ff4f6d', '#ffd34d', '#7fe0ff', '#7ee081', '#ff9df2'];
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < (star ? 26 : 9); k++) {
      const u = rng(), vy = base - h * 0.15 - u * h * 0.72, half = w * (1 - u * 0.85) * 0.9;
      const lx = x + (rng() * 2 - 1) * half, c = cols[(rng() * cols.length) | 0];
      const gr = g.createRadialGradient(lx, vy, 0, lx, vy, star ? 9 : 5);
      gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(lx - 10, vy - 10, 20, 20);
    }
    g.restore();
  }
  if (star) {
    const sy = base - h * 0.88, r = h * 0.06;
    g.save(); g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(x, sy, 0, x, sy, r * 4); gr.addColorStop(0, 'rgba(255,230,150,0.8)'); gr.addColorStop(1, 'rgba(255,230,150,0)');
    g.fillStyle = gr; g.fillRect(x - r * 4, sy - r * 4, r * 8, r * 8); g.restore();
    g.fillStyle = '#ffe48a'; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
}

// the Radiant Citadel's painted castle: once it loads, the cached backdrop is redrawn with it
const CITADEL_IMG = new Image();
CITADEL_IMG.decoding = 'async';
CITADEL_IMG.onload = () => { if (typeof Backdrop !== 'undefined') Backdrop.invalidate(); };
CITADEL_IMG.src = 'assets/img/citadel.webp';

// the castle with distance applied once: a light veil of the realm's sky/fog colour over it, thickening
// toward its foot so it dissolves into the dune haze instead of ending in a hard line
let citadelCache = null;
function citadelHazed(realm) {
  if (citadelCache && citadelCache.realm === realm) return citadelCache.cv;
  const im = CITADEL_IMG, cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const c = cv.getContext('2d');
  c.drawImage(im, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  const veil = c.createLinearGradient(0, 0, 0, cv.height);
  veil.addColorStop(0, rgba(realm.sky[1], 0.16));
  veil.addColorStop(0.6, rgba(realm.fog, 0.22));
  veil.addColorStop(1, rgba(realm.fog, 0.6));
  c.fillStyle = veil; c.fillRect(0, 0, cv.width, cv.height);
  citadelCache = { realm, cv };
  return cv;
}

const DECOR = {
  winter: {
    sky(g, realm, x0, x1, y0, y1) {
      const rng = mulberry32(1225);
      // stars
      for (let i = 0; i < 180; i++) { g.globalAlpha = 0.25 + rng() * 0.65; g.fillStyle = '#ffffff'; const r = rng() < 0.08 ? 2.2 : 1.3; g.fillRect(lerp(x0, x1, rng()), lerp(y0, H * 0.55, rng()), r, r); }
      g.globalAlpha = 1;
      // aurora ribbons
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const [col, yy, amp, ph] of [['rgba(110,255,190,', H * 0.16, 40, 0], ['rgba(120,170,255,', H * 0.22, 30, 2], ['rgba(200,140,255,', H * 0.12, 26, 4]]) {
        for (let x = x0; x < x1; x += 6) {
          const y = yy + Math.sin(x * 0.004 + ph) * amp + Math.sin(x * 0.011 + ph) * amp * 0.3, hgt = 70 + Math.sin(x * 0.007 + ph * 2) * 30;
          const gr = g.createLinearGradient(0, y - hgt, 0, y + 10);
          gr.addColorStop(0, col + '0)'); gr.addColorStop(0.7, col + '0.10)'); gr.addColorStop(1, col + '0)');
          g.fillStyle = gr; g.fillRect(x, y - hgt, 7, hgt + 10);
        }
      }
      g.restore();
      // the moon gets a few soft craters
      const mx = W * realm.sunPos[0], my = H * realm.sunPos[1];
      g.fillStyle = 'rgba(170,182,210,0.2)';
      for (const [dx, dy, r] of [[-13, -8, 8], [11, 9, 6], [-3, 15, 4]]) { g.beginPath(); g.arc(mx + dx, my + dy, r, 0, TAU); g.fill(); }
    },
    far(g, realm, x0, x1, y0, y1) {
      const rng = mulberry32(2512), base = H * 0.64;
      // a cosy village on the far ridge: warm windows and chimney smoke
      for (let i = 0; i < 9; i++) {
        const hx = W * 0.08 + i * W * 0.11 + rng() * 40, hw = 60 + rng() * 40, hh = 44 + rng() * 26;
        if (Math.abs(hx - W * 0.52) < 120) continue;          // leave room for the great tree
        const L = hx - hw / 2, roofY = base - hh, peak = roofY - hw * 0.42;
        // walls, a dark roof under a soft snow cap, a chimney with a thin smoke wisp
        g.fillStyle = '#5c5070'; g.fillRect(L, roofY, hw, hh);
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(L, roofY, hw, 6);
        g.fillStyle = '#4a4058'; g.fillRect(hx + hw * 0.16, peak + hw * 0.12, 9, hw * 0.24);
        g.fillStyle = '#463b56';
        g.beginPath(); g.moveTo(L - 6, roofY + 2); g.lineTo(hx, peak); g.lineTo(L + hw + 6, roofY + 2); g.closePath(); g.fill();
        g.fillStyle = '#eef3fb';
        g.beginPath(); g.moveTo(L - 7, roofY - 1); g.lineTo(hx, peak - 3); g.lineTo(L + hw + 7, roofY - 1);
        g.quadraticCurveTo(L + hw * 0.75, roofY - 7, hx, peak + 9); g.quadraticCurveTo(L + hw * 0.25, roofY - 7, L - 7, roofY - 1); g.closePath(); g.fill();
        // warm windows with a cross frame and a door
        const ww = Math.min(14, hw * 0.16), wh = ww * 1.15, wy = base - hh * 0.66;
        for (const wx of [L + hw * 0.18, L + hw * 0.82 - ww]) {
          g.fillStyle = '#ffcf7a'; g.fillRect(wx, wy, ww, wh);
          g.fillStyle = '#5c5070'; g.fillRect(wx + ww / 2 - 1, wy, 2, wh); g.fillRect(wx, wy + wh / 2 - 1, ww, 2);
        }
        g.fillStyle = '#3b3048'; g.fillRect(hx - 6, base - 22, 12, 22);
        g.save(); g.globalCompositeOperation = 'lighter';
        const wg = g.createRadialGradient(hx, wy + wh / 2, 0, hx, wy + wh / 2, hw * 0.7); wg.addColorStop(0, 'rgba(255,190,110,0.16)'); wg.addColorStop(1, 'rgba(255,190,110,0)');
        g.fillStyle = wg; g.fillRect(hx - hw, wy - hw, hw * 2, hw * 2); g.restore();
        const cx = hx + hw * 0.16 + 4.5, cy = peak + hw * 0.1;
        g.strokeStyle = 'rgba(225,232,248,0.16)'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(cx, cy); g.bezierCurveTo(cx + 4, cy - 18, cx - 8, cy - 30, cx + 6, cy - 48); g.stroke();
      }
      // a line of snowy pines with fairy lights
      for (let i = 0; i < 16; i++) drawPine(g, lerp(x0, x1, i / 15) + rng() * 30, base + 30, 90 + rng() * 60, '#2f5a6b', rng() < 0.5, rng, false);
      // the great festive tree in the middle
      drawPine(g, W * 0.52, base + 34, 300, '#2a6e58', true, rng, true);
    },
    near(g, realm, x0, x1, y0, y1) {
      const rng = mulberry32(3112);
      // tall dark pines framing the edges
      for (const [fx, h] of [[0.03, 360], [0.1, 280], [0.92, 340], [0.98, 300]]) drawPine(g, W * fx, H * 0.98, h, '#1d3a4a', false, rng, false);
    },
  },
  citadel: {
    sky(g, realm, x0, x1, y0, y1) {
      const sx = W * realm.sunPos[0], sy = H * realm.sunPos[1];
      // god rays fanning down from the sun
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * (0.14 + i * 0.072), len = 1300, w = 0.022 + (i % 3) * 0.012;
        const gr = g.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
        gr.addColorStop(0, 'rgba(255,236,180,0.22)'); gr.addColorStop(1, 'rgba(255,236,180,0)');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a - w) * len, sy + Math.sin(a - w) * len); g.lineTo(sx + Math.cos(a + w) * len, sy + Math.sin(a + w) * len); g.closePath(); g.fill();
      }
      // a golden halo ring around the sun
      g.strokeStyle = 'rgba(255,226,150,0.55)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(sx, sy, 92, 92, 0, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,240,200,0.25)'; g.lineWidth = 10;
      g.beginPath(); g.ellipse(sx, sy, 128, 128, 0, 0, TAU); g.stroke();
      g.restore();
      // soft cream cloud banks low in the sky
      const rng = mulberry32(4242);
      for (let i = 0; i < 9; i++) {
        const cx = lerp(x0, x1, rng()), cy = H * (0.36 + rng() * 0.12), rw = 140 + rng() * 160;
        for (let k = 0; k < 4; k++) {
          const gx = cx + (k - 1.5) * rw * 0.4, gy = cy + Math.sin(k * 1.7) * 10, rr = rw * (0.35 + 0.15 * Math.sin(k * 2.3 + i));
          const cg = g.createRadialGradient(gx, gy, 0, gx, gy, rr);
          cg.addColorStop(0, 'rgba(255,240,214,0.42)'); cg.addColorStop(1, 'rgba(255,240,214,0)');
          g.fillStyle = cg; g.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
        }
      }
      // distant floating sky-islands: stepped rock like the arena's, a golden rim, a little shrine
      for (const [fx, fy, fw, shrine] of [[0.12, 0.3, 150, true], [0.86, 0.24, 110, true], [0.7, 0.42, 70, false]]) {
        const ix = W * fx, iy = H * fy, t = fw / 5;
        const rows = [[0, 5], [0.6, 4.4], [1.3, 3.7], [2, 3]];
        rows.forEach(([a, bb], r) => {
          g.fillStyle = mixHex('#b48aa8', '#6d4f74', r / 3);
          g.beginPath(); g.roundRect(ix - fw / 2 + a * t, iy + r * t * 0.8, (bb - a) * t, t * 0.8 + 1, r ? 0 : 4); g.fill();
        });
        g.fillStyle = 'rgba(255,233,170,0.9)'; g.beginPath(); g.roundRect(ix - fw / 2, iy - 3, fw, 6, 3); g.fill();
        if (shrine) {
          const sx2 = ix + fw * 0.12, sw = fw * 0.16, sh = fw * 0.32;
          g.fillStyle = '#f4e2c2'; g.fillRect(sx2 - sw / 2, iy - sh, sw, sh);
          g.fillStyle = '#ffd36e'; g.beginPath(); g.moveTo(sx2 - sw / 2 - 3, iy - sh); g.quadraticCurveTo(sx2, iy - sh - sw * 1.1, sx2 + sw / 2 + 3, iy - sh); g.closePath(); g.fill();
          g.fillStyle = '#fff3c8'; g.fillRect(sx2 - sw * 0.15, iy - sh * 0.7, sw * 0.3, sh * 0.35);
        }
        const lg = g.createLinearGradient(0, iy + t * 3, 0, iy + t * 7);
        lg.addColorStop(0, 'rgba(255,236,180,0.32)'); lg.addColorStop(1, 'rgba(255,236,180,0)');
        g.fillStyle = lg; g.fillRect(ix - 2, iy + t * 3, 4, t * 4);
      }
    },
    // the painted castle, set BEHIND the farthest dune: its foot sits just below that ridge's
    // lowest point across the castle, so every dune layer overlaps it, and it is tinted toward
    // the sky's haze so it reads as far off
    back(g, realm, x0, x1, y0, y1, ridgeY) {
      if (!(CITADEL_IMG.complete && CITADEL_IMG.naturalWidth)) return;
      const cx = W * realm.sunPos[0];
      const w = 600, h = w * CITADEL_IMG.naturalHeight / CITADEL_IMG.naturalWidth;
      let foot = 0;
      for (let x = cx - w * 0.42; x <= cx + w * 0.42; x += 10) foot = Math.max(foot, ridgeY(0, x));
      foot += 26;
      // a warm glow behind it, from the sun above
      const gl = g.createRadialGradient(cx, foot - h * 0.55, 0, cx, foot - h * 0.55, 480);
      gl.addColorStop(0, 'rgba(255,230,170,0.42)'); gl.addColorStop(1, 'rgba(255,230,170,0)');
      g.fillStyle = gl; g.fillRect(cx - 480, foot - h - 140, 960, h + 260);
      g.drawImage(citadelHazed(realm), cx - w / 2, foot - h, w, h);
    },
    // the citadel itself, rising from the farthest ridge under the sun: the painted castle
    // (assets/img/citadel.webp), with the drawn one below as a stand-in until it has loaded
    far(g, realm, x0, x1, y0, y1) {
      const cx = W * realm.sunPos[0], base = H * 0.6;
      if (CITADEL_IMG.complete && CITADEL_IMG.naturalWidth) return;   // the painted castle is drawn in back(), behind the dunes
      const stone = '#f4e2c2', shadow = '#d9bd92', gold = '#ffd36e', win = '#fff3c8';
      const tower = (x, w, h, roof, domeH) => {
        // body with a lit left and shaded right face
        g.fillStyle = stone; g.fillRect(x - w / 2, base - h, w, h);
        g.fillStyle = shadow; g.fillRect(x + w * 0.12, base - h, w * 0.38, h);
        // gold trim bands
        g.fillStyle = gold; g.fillRect(x - w / 2 - 2, base - h, w + 4, 5); g.fillRect(x - w / 2, base - h * 0.55, w, 3);
        // tall arched windows, glowing
        for (let wy = base - h + 22; wy < base - 26; wy += 34) {
          g.fillStyle = win; g.beginPath(); g.roundRect(x - w * 0.12, wy, w * 0.24, 18, [w * 0.12, w * 0.12, 0, 0]); g.fill();
        }
        // roof: dome or spire
        if (roof === 'dome') {
          g.fillStyle = gold;
          g.beginPath(); g.moveTo(x - w / 2 - 4, base - h); g.bezierCurveTo(x - w / 2, base - h - domeH, x + w / 2, base - h - domeH, x + w / 2 + 4, base - h); g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(x - w * 0.18, base - h - domeH * 0.5, w * 0.1, domeH * 0.25, -0.4, 0, TAU); g.fill();
          g.fillStyle = gold; g.fillRect(x - 2, base - h - domeH - 30, 4, 34);
          g.beginPath(); g.arc(x, base - h - domeH - 32, 5, 0, TAU); g.fill();
        } else {
          g.fillStyle = gold;
          g.beginPath(); g.moveTo(x - w / 2 - 3, base - h); g.lineTo(x, base - h - domeH); g.lineTo(x + w / 2 + 3, base - h); g.closePath(); g.fill();
          g.fillStyle = shadow; g.beginPath(); g.moveTo(x, base - h - domeH); g.lineTo(x + w / 2 + 3, base - h); g.lineTo(x + w * 0.1, base - h); g.closePath(); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
          // a pennant
          g.strokeStyle = '#c9a46a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, base - h - domeH); g.lineTo(x, base - h - domeH - 26); g.stroke();
          g.fillStyle = '#ff9d6e'; g.beginPath(); g.moveTo(x, base - h - domeH - 26); g.lineTo(x + 20, base - h - domeH - 20); g.lineTo(x, base - h - domeH - 14); g.closePath(); g.fill();
        }
      };
      // a soft glow behind the whole citadel
      const gl = g.createRadialGradient(cx, base - 160, 0, cx, base - 160, 420);
      gl.addColorStop(0, 'rgba(255,230,170,0.4)'); gl.addColorStop(1, 'rgba(255,230,170,0)');
      g.fillStyle = gl; g.fillRect(cx - 420, base - 580, 840, 600);
      // curtain wall with arches
      g.fillStyle = stone; g.fillRect(cx - 330, base - 80, 660, 80);
      g.fillStyle = 'rgba(120,80,60,0.35)';
      for (let i = -4; i <= 4; i++) { g.beginPath(); g.roundRect(cx + i * 70 - 18, base - 58, 36, 58, [18, 18, 0, 0]); g.fill(); }
      g.fillStyle = gold; g.fillRect(cx - 332, base - 82, 664, 5);
      for (let i = -11; i <= 11; i++) g.fillRect(cx + i * 29 - 7, base - 96, 14, 14);
      tower(cx - 300, 46, 200, 'spire', 70);
      tower(cx + 300, 46, 200, 'spire', 70);
      tower(cx - 165, 62, 280, 'spire', 96);
      tower(cx + 165, 62, 280, 'spire', 96);
      tower(cx, 96, 360, 'dome', 92);
      // distance haze so it sits behind the action: an elliptical veil with no hard edges
      g.save(); g.translate(cx, base - 170); g.scale(1.35, 1);
      const hz = g.createRadialGradient(0, 0, 60, 0, 0, 340);
      hz.addColorStop(0, rgba(realm.fog, 0.22)); hz.addColorStop(0.75, rgba(realm.fog, 0.12)); hz.addColorStop(1, rgba(realm.fog, 0));
      g.fillStyle = hz; g.beginPath(); g.arc(0, 0, 340, 0, TAU); g.fill(); g.restore();
    },
  },
};

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

    if (realm.decor && DECOR[realm.decor]) DECOR[realm.decor].sky(g, realm, x0, x1, y0, y1);

    // layered ridges (their shapes are worked out first, so decor can tuck itself behind them)
    const layers = realm.hills;
    const phs = layers.map(() => [rng() * 10, rng() * 10, rng() * 10]);
    const ridgeY = (li, x) => {
      const ph = phs[li], base = H * (0.55 + li * 0.13), amp = 110 - li * 22;
      const n = Math.sin(x * 0.0021 + ph[0]) * 0.55 + Math.sin(x * 0.0057 + ph[1]) * 0.3 + Math.sin(x * 0.013 + ph[2]) * 0.15;
      let yy = base - n * amp;
      if (realm.id === 'frost' || realm.id === 'storm') yy -= Math.abs(Math.sin(x * 0.009 + ph[1])) * 40 * (1 - li * 0.3);
      return yy;
    };
    if (realm.decor && DECOR[realm.decor].back) DECOR[realm.decor].back(g, realm, x0, x1, y0, y1, ridgeY);
    for (let li = 0; li < layers.length; li++) {
      if (li === 1 && realm.decor && DECOR[realm.decor].far) DECOR[realm.decor].far(g, realm, x0, x1, y0, y1, ridgeY);
      const base = H * (0.55 + li * 0.13);
      const amp = 110 - li * 22;
      g.fillStyle = layers[li];
      g.beginPath();
      g.moveTo(x0, y1);
      for (let x = x0; x <= x1 + 20; x += 12) g.lineTo(x, ridgeY(li, x));
      g.lineTo(x1, y1);
      g.closePath(); g.fill();
      // haze between layers
      const fog = g.createLinearGradient(0, base - amp, 0, y1);
      fog.addColorStop(0, rgba(realm.fog, 0));
      fog.addColorStop(1, rgba(realm.fog, 0.22 - li * 0.05));
      g.fillStyle = fog; g.fillRect(x0, base - amp, view.w, y1 - base + amp);
    }
    if (realm.decor && DECOR[realm.decor].near) DECOR[realm.decor].near(g, realm, x0, x1, y0, y1);
    // abyss fade at the bottom
    const abyss = g.createLinearGradient(0, H * 0.75, 0, y1);
    abyss.addColorStop(0, rgba(realm.hills[2], 0));
    abyss.addColorStop(1, rgba(mixHex(realm.hills[2], '#000000', 0.5), 0.95));
    g.fillStyle = abyss; g.fillRect(x0, H * 0.75, view.w, y1 - H * 0.75);
    // overall dim so fighters and islands pop against the sky
    g.fillStyle = 'rgba(10, 12, 26, 0.22)'; g.fillRect(x0, y0, view.w, view.h);
    return canvas;
  }
  return { render, invalidate() { key = ''; } };
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
    const want = { leaf: 26, ember: 60, snow: 110, rain: 150, mote: 70, bubble: 45, spore: 55, shard: 60, grit: 120, glimmer: 55 }[r.ambient] || 0;
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
    else if (r === 'grit') { p.x = anywhere ? x : view.x0 - 50; p.y = rand(top, bot); p.vx = rand(260, 520); p.vy = rand(-20, 30); }   // wind-blown sand
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
    } else if (kind === 'grit') {
      // grains of sand streaking sideways on the desert wind, plus a few slow dust puffs
      ctx.lineCap = 'round';
      for (const p of this.parts) {
        const big = p.s > 1.2;
        if (big) { Glow.draw(ctx, '#f7deaa', p.x, p.y, 16 * p.s, 0.12); continue; }
        ctx.strokeStyle = p.s > 0.9 ? 'rgba(255,236,190,0.55)' : 'rgba(214,160,90,0.5)';
        ctx.lineWidth = 1.3 * p.s;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      }
    } else if (kind === 'glimmer') {
      // golden motes of light rising past the citadel, twinkling into four-point stars
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.parts) {
        const tw = 0.35 + Math.abs(Math.sin(p.t * 2 + p.ph)) * 0.65, r = 5 * p.s * tw;
        Glow.draw(ctx, '#ffe39a', p.x, p.y, 10 * p.s, 0.35 * tw);
        ctx.fillStyle = `rgba(255,250,225,${tw})`;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * 0.18, p.y - r * 0.18); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x + r * 0.18, p.y + r * 0.18);
        ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r * 0.18, p.y + r * 0.18); ctx.lineTo(p.x - r, p.y); ctx.lineTo(p.x - r * 0.18, p.y - r * 0.18); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (kind === 'shard') {
      // slow glinting crystal flecks drifting up through the cavern
      for (const p of this.parts) {
        const tw = 0.4 + Math.abs(Math.sin(p.t * 2.5 + p.ph)) * 0.6;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.t * 0.6);
        ctx.globalAlpha = tw; ctx.fillStyle = p.s > 1 ? '#c9fff7' : '#7fe0d6';
        const r = 4 * p.s;
        ctx.beginPath(); ctx.moveTo(0, -r * 1.6); ctx.lineTo(r * 0.6, 0); ctx.lineTo(0, r * 1.6); ctx.lineTo(-r * 0.6, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
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
