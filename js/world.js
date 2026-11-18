'use strict';
/* =========================================================================
   World: floating islands, the parallax realm backdrop (pre-rendered), and
   ambient weather (leaves, embers, snow, rain + lightning, void motes).
   ========================================================================= */

class Island {
  static PAD = 4;
  constructor(x, y, w, opts = {}) {
    this.x = x; this.y = y; this.w = w;
    this.baseX = x; this.baseY = y; this.opts = opts;
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
    const forced = this.opts && this.opts.rows;   // a layout can ask for an exact number of rock layers
    const minW = Math.max(2, Math.ceil(n * 0.25));
    const maxStep = n >= 12 ? 2 : 1;
    const rows = [[0, n]];
    const goal = forced || want;
    while (rows.length < goal) {
      const [a, b] = rows[rows.length - 1];
      const sl = maxStep > 1 && rng() < 0.6 ? 2 : 1, sr = maxStep > 1 && rng() < 0.6 ? 2 : 1;
      if (b - a - sl - sr < minW) {
        if (b - a - 2 >= minW) { rows.push([a + 1, b - 1]); continue; }
        if (forced && b - a - 1 >= minW) { rows.push(rows.length % 2 ? [a + 1, b] : [a, b - 1]); continue; }   // step one side only
        if (forced) { rows.push([a, b]); continue; }
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
// the Radiant Citadel's painted castle: once it loads, the cached backdrop is redrawn with it
const CITADEL_IMG = new Image();
CITADEL_IMG.decoding = 'async';
CITADEL_IMG.onload = () => { if (typeof Backdrop !== 'undefined') Backdrop.invalidate(); };
CITADEL_IMG.src = 'assets/img/citadel.webp';

// the castle, prepared once: lifted slightly to hold up under the backdrop's dimming, and its bottom
// 10% faded to nothing, so no hard image edge can ever show
let citadelCv = null;
function citadelFaded(realm) {
  if (citadelCv) return citadelCv;
  const im = CITADEL_IMG, cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const c = cv.getContext('2d');
  // the art is already painted in this realm's palette: just lift it a little so it holds up
  // under the backdrop's overall dimming
  c.filter = 'saturate(1.28) brightness(1.22) contrast(1.04)';
  c.drawImage(im, 0, 0);
  c.filter = 'none';
  c.globalCompositeOperation = 'destination-in';
  const m = c.createLinearGradient(0, 0, 0, cv.height);
  m.addColorStop(0, '#000'); m.addColorStop(0.985, '#000'); m.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = m; c.fillRect(0, 0, cv.width, cv.height);
  citadelCv = cv;
  return cv;
}

// where the castle's bottom edge sits: just below the nearer dune's lowest point across its width
const CITADEL_W = 648;
const SAND_RESERVE = 6;   // px of the front dune that is live, drifting sand instead of baked into the backdrop
function citadelFoot(realm, rawRidge) {
  const cx = W * realm.sunPos[0];
  let foot = 0;
  for (let x = cx - CITADEL_W / 2 - 20; x <= cx + CITADEL_W / 2 + 20; x += 6) foot = Math.max(foot, rawRidge(1, x));
  return foot + 7;
}

// the Winterfest focal tree (painted) and where the mid treeline's pines stand (the trailer's eyes peek
// out from some of them)
const XMAS_TREE = new Image();
XMAS_TREE.decoding = 'async';
XMAS_TREE.onload = () => { if (typeof Backdrop !== 'undefined') Backdrop.invalidate(); };
XMAS_TREE.src = 'assets/img/xmas_tree.webp';
const WINTER_TREES = [];
// the painted tree graded into the night: a little less saturated and bright, a cool moonlit cast over
// the greens and snow, while its lights and star keep their warmth
let xmasCv = null;
function xmasTreeGraded(realm) {
  if (xmasCv) return xmasCv;
  const im = XMAS_TREE, cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const c = cv.getContext('2d');
  c.filter = 'saturate(0.78) brightness(0.86) contrast(0.95)';
  c.drawImage(im, 0, 0);
  c.filter = 'none';
  c.globalCompositeOperation = 'source-atop';
  const tint = c.createLinearGradient(0, 0, 0, cv.height);
  tint.addColorStop(0, rgba(realm.sky[1], 0.12)); tint.addColorStop(1, rgba(realm.sky[1], 0.26));
  c.fillStyle = tint; c.fillRect(0, 0, cv.width, cv.height);
  // bring the lights and star back up so they still glow against the cooler tree
  c.globalCompositeOperation = 'lighter';
  c.filter = 'brightness(0.9)';
  const lum = document.createElement('canvas'); lum.width = cv.width; lum.height = cv.height;
  const lc = lum.getContext('2d'); lc.drawImage(im, 0, 0);
  const d = lc.getImageData(0, 0, lum.width, lum.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2], warm = r > 200 && g > 150 && b < 170 && r - b > 50;
    if (!warm) px[i + 3] = 0; else px[i + 3] = Math.min(px[i + 3], 120);
  }
  lc.putImageData(d, 0, 0);
  c.drawImage(lum, 0, 0);
  c.filter = 'none';
  xmasCv = cv;
  return cv;
}

// a flat, clean pine: three tiers, no outline or noise; optional snow resting along each tier
function flatPine(g, x, base, h, col, snow) {
  g.fillStyle = col;
  g.fillRect(x - h * 0.025, base - h * 0.1, h * 0.05, h * 0.1);
  for (let k = 0; k < 3; k++) {
    const by = base - h * 0.08 - k * h * 0.24, tw = h * 0.36 * (1 - k * 0.24), top = by - h * (0.42 - k * 0.04);
    g.fillStyle = col;
    g.beginPath(); g.moveTo(x - tw, by); g.lineTo(x, top); g.lineTo(x + tw, by); g.closePath(); g.fill();
    if (snow) {
      g.fillStyle = 'rgba(240,247,255,0.9)';
      g.beginPath(); g.moveTo(x - tw, by); g.quadraticCurveTo(x, by - h * 0.07, x + tw, by); g.quadraticCurveTo(x, by - h * 0.02, x - tw, by); g.closePath(); g.fill();
    }
  }
}

const DECOR = {
  // Winterfest: a calm, composed night. One focal point (the lit tree, dead centre), mirrored cabins,
  // pines in an even rhythm whose heights rise toward the tree, three depth values (far / mid / near)
  // and one warm accent. Nothing is scattered at random.
  winter: {
    sky(g, realm, x0, x1, y0, y1) {
      // sparse stars on a golden-ratio sequence: even, never clumped; they fade toward the horizon
      for (let i = 1; i <= 42; i++) {
        const u = (i * 0.6180339887) % 1, v = (i * 0.7548776662) % 1;
        const x = lerp(x0, x1, u), y = lerp(y0 + 20, H * 0.46, v * v);
        const k = 1 - v * 0.85, big = i % 7 === 0;
        g.globalAlpha = 0.18 + k * 0.5; g.fillStyle = '#eef4ff';
        g.beginPath(); g.arc(x, y, big ? 1.7 : 1.1, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      // a single aurora band: one smooth, faint ribbon arcing across the sky
      g.save(); g.globalCompositeOperation = 'lighter';
      const band = (x) => H * 0.2 + Math.sin(x * 0.0024 + 0.6) * 34;
      const gr = g.createLinearGradient(0, H * 0.06, 0, H * 0.3);
      gr.addColorStop(0, 'rgba(110,240,200,0.02)'); gr.addColorStop(0.65, 'rgba(110,240,200,0.09)'); gr.addColorStop(1, 'rgba(110,240,200,0)');
      g.filter = 'blur(28px)';   // no edges: the band dissolves into the sky
      g.fillStyle = gr; g.beginPath(); g.moveTo(x0, band(x0) - 90);
      for (let x = x0; x <= x1 + 20; x += 20) g.lineTo(x, band(x) - 90);
      for (let x = x1 + 20; x >= x0; x -= 20) g.lineTo(x, band(x) + 14);
      g.closePath(); g.fill();
      g.filter = 'none';
      g.restore();
    },
    far(g, realm, x0, x1, y0, y1, ridgeY) {
      const cx = W * 0.5, base = H * 0.64;
      WINTER_TREES.length = 0;
      // each treeline stands on its own rolling snow bank: trunks are planted in snow, and the
      // gentle roll of the bank keeps the row from reading as a ruler-straight line
      const row = (y, gap, h0, h1, col, bank, roll, skip, keep) => {
        const ground = x => y + Math.sin((x - cx) * 0.0062) * roll + Math.sin((x - cx) * 0.0151 + 1.1) * roll * 0.35;
        for (let k = -16; k <= 16; k++) {
          const x = cx + k * gap; if (x < x0 - 80 || x > x1 + 80 || Math.abs(k) < skip) continue;
          const t = Math.cos(Math.min(1, Math.abs(x - cx) / (W * 0.62)) * Math.PI / 2);
          const h = lerp(h0, h1, t) * (k % 2 ? 0.88 : 1);                      // a gentle tall-short rhythm
          flatPine(g, x, ground(x) + 6, h, col, false);
          if (keep) WINTER_TREES.push({ x, y: ground(x), h });
        }
        // the bank: a soft snow surface just above the trunks' feet, fading into the hill below
        const gr = g.createLinearGradient(0, y - roll, 0, y + 90);
        gr.addColorStop(0, bank); gr.addColorStop(1, rgba(bank, 0));
        g.fillStyle = gr; g.beginPath(); g.moveTo(x0 - 20, y + 120);
        for (let x = x0 - 20; x <= x1 + 20; x += 16) g.lineTo(x, ground(x) - 1);
        g.lineTo(x1 + 20, y + 120); g.closePath(); g.fill();
      };
      row(base + 8, 54, 44, 74, '#8ea7c8', '#c3d6ec', 9, 2, false);
      row(base + 34, 78, 60, 100, '#5f7898', '#a9c3df', 12, 2, true);
      // two cabins, mirrored either side of the tree
      for (const side of [-1, 1]) {
        const hx = cx + side * 215, w = 88, h = 50, by = base + 40, peak = by - h - 36;
        g.fillStyle = '#3f4c67'; g.fillRect(hx - w / 2, by - h, w, h);                      // walls
        g.fillStyle = '#35405a'; g.fillRect(hx + side * 22 - 5, peak + 8, 10, 26);           // chimney
        g.fillStyle = '#eef4fb'; g.fillRect(hx + side * 22 - 7, peak + 5, 14, 5);
        g.fillStyle = '#eef4fb';                                                              // snow-laden roof with a soft overhang
        g.beginPath(); g.moveTo(hx - w / 2 - 10, by - h + 4); g.lineTo(hx, peak); g.lineTo(hx + w / 2 + 10, by - h + 4);
        g.quadraticCurveTo(hx + w / 2, by - h + 9, hx + w / 2 - 6, by - h + 4); g.lineTo(hx - w / 2 + 6, by - h + 4);
        g.quadraticCurveTo(hx - w / 2, by - h + 9, hx - w / 2 - 10, by - h + 4); g.closePath(); g.fill();
        const wx = hx - side * 16 - 9;                                                        // one warm window, a door
        g.fillStyle = '#ffcf7a'; g.fillRect(wx, by - h + 15, 18, 15);
        g.fillStyle = '#2d3650'; g.fillRect(hx + side * 16 - 7, by - 24, 14, 24);
        g.save(); g.globalCompositeOperation = 'lighter';
        const wg = g.createRadialGradient(wx + 9, by - h + 22, 0, wx + 9, by - h + 22, 64);
        wg.addColorStop(0, 'rgba(255,190,110,0.22)'); wg.addColorStop(1, 'rgba(255,190,110,0)');
        g.fillStyle = wg; g.fillRect(wx - 64, by - h - 42, 146, 146); g.restore();
      }
      // the focal tree (painted), planted in its own small drift
      // the tree's foot sinks behind the next snow layer (drawn after this), like the citadel's castle:
      // the trunk sits just below that layer's highest point across the trunk, so it is hidden
      const th = 300;
      let ridgeTop = Infinity;
      for (let x = cx - 30; x <= cx + 30; x += 5) ridgeTop = Math.min(ridgeTop, ridgeY(1, x));
      const tb = ridgeTop + th * 0.11;
      if (XMAS_TREE.complete && XMAS_TREE.naturalWidth) {
        const tw = th * XMAS_TREE.naturalWidth / XMAS_TREE.naturalHeight;
        g.drawImage(xmasTreeGraded(realm), cx - tw * 0.502, tb - th * 0.985, tw, th);
      } else flatPine(g, cx, tb, th * 0.9, '#24584a', true);
    },
    near(g, realm, x0, x1, y0, y1) {
      // dark pines framing the edges, mirrored, each planted in a dark snow drift
      for (const side of [-1, 1]) {
        for (const [d, h] of [[0.47, 380], [0.4, 280]]) flatPine(g, W * (0.5 + side * d), H * 0.98, h, '#16283a', false);
        const ex = side < 0 ? x0 - 40 : x1 + 40, ix = W * (0.5 + side * 0.3);
        const dg = g.createLinearGradient(0, H * 0.9, 0, H);
        dg.addColorStop(0, '#3a526e'); dg.addColorStop(1, '#22364c');
        g.fillStyle = dg;
        g.beginPath(); g.moveTo(ex, H * 0.915); g.quadraticCurveTo(W * (0.5 + side * 0.42), H * 0.9, ix, H * 0.99); g.lineTo(ix, y1 + 10); g.lineTo(ex, y1 + 10); g.closePath(); g.fill();
      }
    },
  },
  citadel: {
    // the dune in front of the castle dips to just above the image's bottom edge, so it hides the
    // cut and as little of the castle as possible, easing back into its natural shape either side
    shapeRidge(realm, li, x, raw, cache) {
      const yy = raw(li, x);
      if (li !== 1 || !(CITADEL_IMG.complete && CITADEL_IMG.naturalWidth)) return yy;
      if (cache.foot == null) cache.foot = citadelFoot(realm, raw);
      const cx = W * realm.sunPos[0], half = CITADEL_W / 2 + 10, ease = 150;
      const dx = Math.abs(x - cx), t = clamp((half + ease - dx) / ease, 0, 1), wgt = t * t * (3 - 2 * t);
      const lip = cache.foot - 9 - (Math.sin(x * 0.011) * 0.5 + 0.5) * 3;   // a gentle sandy roll, always above the cut
      // polynomial soft max: rounds the corner where the dip meets the dune, overshooting at most k/4 = 2.5 px
      const k = 10, q = Math.max(k - Math.abs(yy - lip), 0) / k, smax = Math.max(yy, lip) + q * q * k / 4;
      const shaped = lerp(yy, smax, wgt);
      // the live sand (Backdrop.drawSand) sits on top of this baked layer: a thinner reserve in front of the
      // castle (so the cut stays covered with the sand at its lowest), easing to the full reserve elsewhere
      return shaped + lerp(SAND_RESERVE, 2.5, wgt);
    },
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
      for (const [fx, fy, fw, shrine] of [[0.12, 0.3, 150, true], [0.86, 0.24, 110, true]]) {
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
    // the citadel itself, rising from the farthest ridge under the sun: the painted castle
    // (assets/img/citadel.webp), with the drawn one below as a stand-in until it has loaded
    far(g, realm, x0, x1, y0, y1, ridgeY) {
      const cx = W * realm.sunPos[0], base = H * 0.6;
      if (CITADEL_IMG.complete && CITADEL_IMG.naturalWidth) {
        // the painted castle sits BETWEEN the sand layers, dead centre: drawn after the farthest
        // (lightest) dune and before the next one, its foot sunk into that nearer layer
        const w = CITADEL_W, h = w * CITADEL_IMG.naturalHeight / CITADEL_IMG.naturalWidth;
        // the foot goes below the nearer dune's LOWEST point across the castle's full width (plus a
        // margin), so the image's bottom edge is always under sand; its last strip also fades out
        const foot = citadelFoot(realm, ridgeY);
        const gl = g.createRadialGradient(cx, foot - h * 0.55, 0, cx, foot - h * 0.55, 480);
        gl.addColorStop(0, 'rgba(255,232,175,0.48)'); gl.addColorStop(1, 'rgba(255,230,170,0)');
        g.fillStyle = gl; g.fillRect(cx - 480, foot - h - 140, 960, h + 260);
        g.globalAlpha = 0.95;
        g.drawImage(citadelFaded(realm), cx - w / 2, foot - h, w, h);
        g.globalAlpha = 1;
        return;
      }
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
      const R = realm.softGlow ? 560 : 380, sun = g.createRadialGradient(sx, sy, 0, sx, sy, R);
      if (realm.softGlow) {
        // a long, eased falloff: no visible edge where the glow ends
        for (let i = 0; i <= 12; i++) { const u = i / 12; sun.addColorStop(u, rgba(realm.sun, 0.42 * Math.pow(1 - u, 2.6))); }
      } else {
        sun.addColorStop(0, rgba(realm.sun, 0.9));
        sun.addColorStop(0.12, rgba(realm.sun, 0.55));
        sun.addColorStop(0.4, rgba(realm.sun, 0.12));
        sun.addColorStop(1, rgba(realm.sun, 0));
      }
      g.globalAlpha = realm.sunAlpha || 1;
      g.fillStyle = sun; g.fillRect(x0, y0, view.w, view.h);
      g.fillStyle = realm.sun;
      g.beginPath(); g.arc(sx, sy, 46, 0, TAU); g.fill();
      g.globalAlpha = 1;
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
    const D = realm.decor && DECOR[realm.decor], rcache = {};
    const drawRidge = D && D.shapeRidge ? (li, x) => D.shapeRidge(realm, li, x, ridgeY, rcache) : ridgeY;
    for (let li = 0; li < layers.length; li++) {
      if (li === 1 && realm.decor && DECOR[realm.decor].far) DECOR[realm.decor].far(g, realm, x0, x1, y0, y1, ridgeY);
      const base = H * (0.55 + li * 0.13);
      const amp = 110 - li * 22;
      g.fillStyle = layers[li];
      g.beginPath();
      g.moveTo(x0, y1);
      { let px = x0, py = drawRidge(li, x0); g.lineTo(px, py);
        for (let x = x0 + 12; x <= x1 + 24; x += 12) { const y = drawRidge(li, x); g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); px = x; py = y; }
        g.lineTo(px, py); }
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
    buildSand(realm, view, ridgeY, D, rcache, canvas, pxScale, x0, y0);
    return canvas;
  }
  /* ---------------------------------------------------------- living sand
     The citadel's front dune keeps SAND_RESERVE px of loose sand on top of its baked shape. It is a
     1D height field: the wind carries it downwind (so ripples creep slowly along), slopes steeper
     than the angle of repose slump, and it relaxes back toward its resting depth. Grains lift off the
     ripple crests and drift on the wind before settling. Drawn every frame over the cached backdrop. */
  let sand = null;
  function buildSand(realm, view, ridge, D, rcache, cv, pxScale, x0, y0) {
    sand = null;
    if (!D || !D.shapeRidge) return;
    const step = 6, xs = [], s1 = [], r2 = [], col = [];
    let img = null;
    try { img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height); } catch (e) { return; }
    const foot = rcache.foot;
    for (let x = view.x0 - step; x <= view.x0 + view.w + step; x += step) {
      const a = D.shapeRidge(realm, 1, x, ridge, rcache), b = ridge(2, x);
      xs.push(x); s1.push(a); r2.push(b);
      // the dune's own colour just below its baked surface, so the live sand matches exactly
      const px = clamp(Math.round((x - x0) * pxScale), 0, cv.width - 1), py = clamp(Math.round((a + 4 - y0) * pxScale), 0, cv.height - 1);
      const i = (py * cv.width + px) * 4;
      col.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
    }
    const cx = W * realm.sunPos[0], half = CITADEL_W / 2 + 10;
    const h = xs.map(x => SAND_RESERVE + Math.sin(x * 0.045) * 1.6 + Math.sin(x * 0.11 + 1.3) * 0.9);
    // inside the castle zone the surface must stay at least 6 px above the image's bottom edge
    const minH = xs.map((x, i) => Math.abs(x - cx) < half + 20 && foot != null ? Math.max(0, s1[i] - (foot - 6)) : 0);
    sand = { step, xs, s1, r2, col, h, minH, grains: [], t: 0 };
  }
  function stepSand(dt) {
    const S = sand, n = S.h.length, h = S.h;
    S.t += dt;
    const wind = 0.65 + 0.35 * Math.sin(S.t * 0.11) + 0.15 * Math.sin(S.t * 0.37);   // slow gusts, always blowing right
    const speed = 7 * wind;                                                            // ripples creep ~5-10 px/s
    const adv = speed * dt / S.step, nh = h.slice();
    for (let i = 0; i < n; i++) {
      const l = h[(i - 1 + n) % n];
      nh[i] = h[i] - adv * (h[i] - l);                                                  // carried downwind
    }
    for (let i = 0; i < n; i++) {                                                       // angle of repose: steep faces slump
      const j = (i + 1) % n, slope = (nh[i] - nh[j]) / S.step;
      if (Math.abs(slope) > 0.32) { const m = (Math.abs(slope) - 0.32) * S.step * 0.25 * Math.sign(slope); nh[i] -= m; nh[j] += m; }
    }
    for (let i = 0; i < n; i++) {
      nh[i] += (SAND_RESERVE - nh[i]) * 0.02 * dt + Math.sin(S.xs[i] * 0.07 - S.t * 0.6) * 0.25 * dt;   // rest depth + ripple growth
      h[i] = Math.max(S.minH[i], Math.max(0, nh[i]));
    }
    // grains lifted off ripple crests on the stronger gusts
    if (S.grains.length < 70 && Math.random() < dt * 22 * wind * wind) {
      const i = 1 + Math.floor(Math.random() * (n - 2));
      if (h[i] >= h[i - 1] && h[i] >= h[i + 1] && S.s1[i] - h[i] < S.r2[i] - 2) {
        S.grains.push({ x: S.xs[i], y: S.s1[i] - h[i], vx: 18 + 30 * wind, vy: -(4 + Math.random() * 10), life: 1.6 + Math.random() * 1.6, max: 0, c: S.col[i] });
        S.grains[S.grains.length - 1].max = S.grains[S.grains.length - 1].life;
      }
    }
    for (const g of S.grains) { g.life -= dt; g.vy += 14 * dt; g.vx += (18 + 30 * wind - g.vx) * dt; g.x += g.vx * dt; g.y += g.vy * dt; }
    S.grains = S.grains.filter(g => g.life > 0);
  }
  function drawSand(c, dt) {
    if (!sand) return;
    stepSand(Math.min(dt, 0.05));
    const S = sand, n = S.xs.length;
    // the live sand: between its moving surface and the baked layer, never over the nearer dune
    for (let i = 0; i < n - 1; i++) {
      const xa = S.xs[i], xb = S.xs[i + 1];
      const ta = S.s1[i] - S.h[i], tb = S.s1[i + 1] - S.h[i + 1];
      const ba = Math.min(S.s1[i], S.r2[i]) + 0.6, bb = Math.min(S.s1[i + 1], S.r2[i + 1]) + 0.6;
      if (ta >= ba && tb >= bb) continue;
      const [r, g, b] = S.col[i];
      c.fillStyle = `rgb(${r},${g},${b})`;
      c.beginPath(); c.moveTo(xa, Math.min(ta, ba)); c.lineTo(xb + 0.5, Math.min(tb, bb)); c.lineTo(xb + 0.5, bb); c.lineTo(xa, ba); c.closePath(); c.fill();
    }
    // a faint lit rim on the windward faces of the ripples
    c.lineWidth = 1.2; c.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const rise = S.h[i] - S.h[i - 1];
      if (rise <= 0.05) continue;
      const y0 = S.s1[i - 1] - S.h[i - 1], y1 = S.s1[i] - S.h[i];
      if (y1 > S.r2[i] - 1) continue;
      const [r, g, b] = S.col[i];
      c.strokeStyle = `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 34)},${Math.min(255, b + 24)},${Math.min(0.5, rise * 0.6)})`;
      c.beginPath(); c.moveTo(S.xs[i - 1], y0); c.lineTo(S.xs[i], y1); c.stroke();
    }
    for (const g of S.grains) {
      const a = Math.sin(Math.PI * (1 - g.life / g.max)) * 0.8;
      const [r, gg, b] = g.c;
      c.fillStyle = `rgba(${Math.min(255, r + 50)},${Math.min(255, gg + 44)},${Math.min(255, b + 30)},${a})`;
      c.fillRect(g.x - 0.8, g.y - 0.8, 1.6, 1.6);
    }
  }

  return { render, drawSand, get sand() { return sand; }, invalidate() { key = ''; } };
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
    const want = r.ambientN || { leaf: 26, ember: 60, snow: 110, rain: 150, mote: 70, bubble: 45, spore: 55, shard: 60, grit: 120, glimmer: 55 }[r.ambient] || 0;
    while (this.parts.length < want) this.parts.push(this.spawn(view, true));
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (r.ambient === 'leaf' || r.ambient === 'snow') p.x += Math.sin(p.t * p.f + p.ph) * (r.ambient === 'snow' ? 9 : 22) * dt;
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
    else if (r === 'snow') { p.vx = 6 + p.s * 6; p.vy = 26 + p.s * 42; }   // nearer (bigger) flakes fall faster: reads as depth, not noise
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
      ctx.fillStyle = '#ffffff';
      for (const p of this.parts) { ctx.globalAlpha = 0.35 + (p.s - 0.6) * 0.6; ctx.beginPath(); ctx.arc(p.x, p.y, 2 * p.s, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
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
