'use strict';
/* =========================================================================
   Figure: a stick archer. While alive it is posed procedurally (aim, draw,
   breathing, flinch, jump). On death the same 11 points become a verlet
   ragdoll. Arrows that hit stay stuck to the limb they struck.
   ========================================================================= */

// point indices
const P = { HEAD: 0, NECK: 1, PELVIS: 2, FELB: 3, FHAND: 4, BELB: 5, BHAND: 6, FKNEE: 7, FFOOT: 8, BKNEE: 9, BFOOT: 10 };
// limb segments: [a, b, radius, part]
const SEGS = [
  [1, 0, 0, 'neck'], [1, 2, 9, 'torso'],
  [1, 3, 6, 'arm'], [3, 4, 6, 'arm'], [1, 5, 6, 'arm'], [5, 6, 6, 'arm'],
  [2, 7, 7, 'leg'], [7, 8, 6, 'leg'], [2, 9, 7, 'leg'], [9, 10, 6, 'leg'],
];
const HEAD_R = 13;
const RAG_G = 2300;
const RAG_ITER = 7;

class Figure {
  constructor(o) {
    this.x = o.x; this.y = o.y;          // feet anchor (top of the platform)
    this.facing = o.facing || 1;
    this.s = o.scale || 1;
    this.body = o.body || '#f4efe4';
    this.shade = o.shade || '#d9d1c2';
    this.aura = o.aura || '#ffffff';
    this.kind = o.kind || 'archer';      // player | archer | scout | brute | mage | boss
    this.isPlayer = !!o.isPlayer;
    this.alive = true;
    this.aim = this.facing > 0 ? -0.15 : Math.PI + 0.15;
    this.drawAmt = 0;
    this.t = Math.random() * 10;
    this.flinch = { x: 0, y: 0 };
    this.jumpY = 0; this.jumpV = 0; this.airborne = false;
    this.pts = [];
    for (let i = 0; i < 11; i++) this.pts.push({ x: o.x, y: o.y, px: o.x, py: o.y });
    this.stuck = [];
    this.status = { burn: 0, burnDps: 0, frozen: 0, soaked: 0, rooted: 0, chill: 0 };
    this.deadT = 0;
    this.cape = null;
    if (this.isPlayer) {
      this.cape = [];
      for (let i = 0; i < 7; i++) this.cape.push({ x: o.x, y: o.y - 90, px: o.x, py: o.y - 90 });
    }
    this.pose(0);
    for (const p of this.pts) { p.px = p.x; p.py = p.y; }
  }

  /* ---------------------------------------------------------------- pose */
  pose(dt) {
    const s = this.s, f = this.facing;
    this.t += dt * (this.status.frozen > 0 ? 0 : 1);
    const frozen = this.status.frozen > 0;
    const bob = frozen ? 0 : Math.sin(this.t * 2.4) * 1.4 * s;
    const crouch = this.drawAmt * 4 * s;
    const fx = this.flinch.x, fy = this.flinch.y;
    const gx = this.x, gy = this.y + this.jumpY;
    const air = this.airborne ? 1 : 0;
    const pts = this.pts;
    const set = (i, x, y) => { pts[i].x = x; pts[i].y = y; };

    // legs: planted wide stance, tucked when airborne
    const tuck = air * 14 * s;
    set(P.FFOOT, gx + f * 17 * s, gy - tuck);
    set(P.BFOOT, gx - f * 15 * s, gy - tuck * 0.6);
    const pelvisX = gx + fx * 0.3, pelvisY = gy - 53 * s + bob + crouch;
    set(P.PELVIS, pelvisX, pelvisY);
    set(P.FKNEE, gx + f * 12 * s, gy - 27 * s + crouch * 0.5 - tuck * 1.2);
    set(P.BKNEE, gx - f * 5 * s, gy - 28 * s + crouch * 0.5 - tuck);

    // torso leans back a touch while drawing
    const lean = -f * this.drawAmt * 5 * s;
    const nx = pelvisX + lean + fx, ny = pelvisY - 46 * s + fy;
    set(P.NECK, nx, ny);
    set(P.HEAD, nx + f * 2 * s + fx * 0.6, ny - 17 * s + fy * 0.4);

    // arms follow the aim
    const ax = Math.cos(this.aim), ay = Math.sin(this.aim);
    let ux = -ay, uy = ax;                // perpendicular pointing "up"
    if (uy > 0) { ux = -ux; uy = -uy; }
    const sag = frozen ? 0 : Math.sin(this.t * 2.4 + 1) * 0.8 * s;
    set(P.FELB, nx + ax * 24 * s + ux * 2 * s, ny + ay * 24 * s + uy * 2 * s + sag + 4 * s);
    set(P.FHAND, nx + ax * 46 * s, ny + ay * 46 * s + 4 * s);
    const reach = (40 - this.drawAmt * 36) * s;
    const hx = nx + ax * reach, hy = ny + ay * reach + 3 * s;
    set(P.BHAND, hx, hy);
    const back = (6 + this.drawAmt * 16) * s;
    set(P.BELB, nx + ax * reach * 0.35 - ax * back + ux * 9 * s, ny + ay * reach * 0.35 - ay * back + uy * 9 * s + 4 * s);

    // decay flinch
    const k = Math.pow(0.0015, dt);
    this.flinch.x *= k; this.flinch.y *= k;
  }

  hitFlinch(vx, vy, amt) {
    const l = Math.hypot(vx, vy) || 1;
    this.flinch.x += (vx / l) * amt * 10 * this.s;
    this.flinch.y += (vy / l) * amt * 6 * this.s;
  }

  /* ---------------------------------------------------------- ragdoll */
  kill(impulse, hitIdx, baseVx = 0, baseVy = 0) {
    if (!this.alive) return;
    this.alive = false;
    this.deadT = 0;
    this.status.frozen = 0;
    const dt = 1 / 120;
    // stiffen: record rest lengths from current pose
    this.sticks = SEGS.map(([a, b]) => [a, b, dist(this.pts[a].x, this.pts[a].y, this.pts[b].x, this.pts[b].y)]);
    // only the spine is stiffened so bodies always crumple
    const extra = [[0, 2]];
    for (const [a, b] of extra) this.sticks.push([a, b, dist(this.pts[a].x, this.pts[a].y, this.pts[b].x, this.pts[b].y), 0.35]);
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      const near = hitIdx != null && (i === hitIdx || SEGS.some(([a, b]) => (a === hitIdx && b === i) || (b === hitIdx && a === i)));
      const m = i === hitIdx ? 1 : near ? 0.75 : 0.45;
      const vx = baseVx + impulse.x * m + rand(-40, 40) + (i === P.HEAD ? rand(-160, 160) : 0);
      const vy = baseVy + impulse.y * m - 120 + rand(-40, 40);
      p.px = p.x - vx * dt;
      p.py = p.y - vy * dt;
    }
  }

  push(px, py, idx = null, falloff = 0.5) {
    const dt = 1 / 120;
    for (let i = 0; i < this.pts.length; i++) {
      const m = idx == null || i === idx ? 1 : falloff;
      this.pts[i].px -= px * m * dt;
      this.pts[i].py -= py * m * dt;
    }
  }

  stepRagdoll(dt, islands, forces) {
    this.deadT += dt;
    const g = RAG_G * dt * dt;
    for (const p of this.pts) {
      let vx = (p.x - p.px) * 0.996, vy = (p.y - p.py) * 0.996;
      if (forces) { const f = forces(p.x, p.y); vx += f.x * dt * dt; vy += f.y * dt * dt; }
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g;
    }
    for (let it = 0; it < RAG_ITER; it++) {
      for (const st of this.sticks) {
        const a = this.pts[st[0]], b = this.pts[st[1]];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const diff = ((d - st[2]) / d) * 0.5 * (st[3] || 1);
        a.x += dx * diff; a.y += dy * diff;
        b.x -= dx * diff; b.y -= dy * diff;
      }
      for (const p of this.pts) for (const isl of islands) isl.collidePoint(p);
    }
  }

  /* ------------------------------------------------------------ update */
  update(dt, islands, forces) {
    const st = this.status;
    st.burn = Math.max(0, st.burn - dt);
    st.frozen = Math.max(0, st.frozen - dt);
    st.soaked = Math.max(0, st.soaked - dt);
    st.rooted = Math.max(0, st.rooted - dt);
    st.chill = Math.max(0, st.chill - dt);
    if (this.alive) {
      if (this.airborne) {
        this.jumpV += 2400 * dt;
        this.jumpY += this.jumpV * dt;
        if (this.jumpY >= 0) { this.jumpY = 0; this.jumpV = 0; this.airborne = false; }
      }
      this.pose(dt);
    } else {
      this.stepRagdoll(dt, islands, forces);
    }
    if (this.cape) this.updateCape(dt);
  }

  jump(power = 1) {
    if (!this.alive || this.airborne || this.status.rooted > 0) return false;
    this.airborne = true;
    this.jumpV = -1050 * power;
    return true;
  }

  updateCape(dt) {
    const c = this.cape, n = this.pts[P.NECK];
    c[0].x = n.x - this.facing * 2; c[0].y = n.y + 2;
    const g = 900 * dt * dt;
    const wind = Math.sin(this.t * 1.7) * 0.06 - this.facing * 0.12;
    for (let i = 1; i < c.length; i++) {
      const p = c[i];
      const vx = (p.x - p.px) * 0.93, vy = (p.y - p.py) * 0.93;
      p.px = p.x; p.py = p.y;
      p.x += vx + wind; p.y += vy + g;
    }
    const L = 9 * this.s;
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < c.length; i++) {
        const a = c[i - 1], b = c[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-4;
        const diff = (d - L) / d;
        if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
        else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
      }
      c[0].x = n.x - this.facing * 2; c[0].y = n.y + 2;
    }
  }

  /* --------------------------------------------------------- hit test */
  // segment (ax,ay)->(bx,by) vs body. Returns {seg, u, head, px, py} or null.
  hitTest(ax, ay, bx, by, pad = 0) {
    const s = this.s, pts = this.pts;
    const h = pts[P.HEAD];
    const hr = segPointDist(ax, ay, bx, by, h.x, h.y);
    if (hr.d < HEAD_R * s + pad) {
      return { seg: 0, u: 1, head: true, px: lerp(ax, bx, hr.t), py: lerp(ay, by, hr.t) };
    }
    let best = null;
    for (let i = 1; i < SEGS.length; i++) {
      const [a, b, r] = SEGS[i];
      const A = pts[a], B = pts[b];
      const res = segSegDist(ax, ay, bx, by, A.x, A.y, B.x, B.y);
      if (res.d < r * s + pad && (!best || res.t < best.t)) best = { seg: i, u: res.u, t: res.t, head: false, px: lerp(ax, bx, res.t), py: lerp(ay, by, res.t) };
    }
    return best;
  }

  center() { const p = this.pts[P.NECK], q = this.pts[P.PELVIS]; return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; }
  chest() { const p = this.pts[P.NECK], q = this.pts[P.PELVIS]; return { x: lerp(p.x, q.x, 0.3), y: lerp(p.y, q.y, 0.3) }; }
  head() { return this.pts[P.HEAD]; }
  bowHand() { return this.pts[P.FHAND]; }

  attachArrow(hit, angle, el, len) {
    const [a, b] = SEGS[hit.seg];
    const A = this.pts[a], B = this.pts[b];
    const sa = Math.atan2(B.y - A.y, B.x - A.x);
    const cx = lerp(A.x, B.x, hit.u), cy = lerp(A.y, B.y, hit.u);
    // perpendicular offset of the tip from the bone, kept inside the limb
    const nx = -Math.sin(sa), ny = Math.cos(sa);
    const off = clamp((hit.px - cx) * nx + (hit.py - cy) * ny, -6 * this.s, 6 * this.s);
    this.stuck.push({ seg: hit.seg, u: hit.u, off, rel: angle - sa, el, len, head: hit.head });
    if (this.stuck.length > 14) this.stuck.shift();
  }

  /* --------------------------------------------------------------- draw */
  draw(ctx, time) {
    const s = this.s, pts = this.pts, f = this.facing;
    const st = this.status;
    const fade = this.alive ? 1 : clamp(1 - (this.deadT - 5) / 1.5, 0, 1);
    if (fade <= 0) return;
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (this.cape) this.drawCape(ctx);

    const line = (a, b, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w * s;
      ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
    };
    const limb = (a, b, c, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w * s;
      ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.lineTo(pts[c].x, pts[c].y); ctx.stroke();
    };

    // stuck arrows behind the body first (half of them look better behind)
    this.drawStuck(ctx, true);

    // back limbs, shaded
    limb(2, 9, 10, 8, this.shade);
    limb(1, 5, 6, 7, this.shade);
    // torso + front leg
    line(1, 2, 11, this.body);
    limb(2, 7, 8, 8.5, this.body);
    // head
    const hd = pts[P.HEAD];
    ctx.fillStyle = this.body;
    ctx.beginPath(); ctx.arc(hd.x, hd.y, HEAD_R * s, 0, TAU); ctx.fill();
    this.drawHeadgear(ctx, hd, time);

    // bow (only while alive) then front arm on top of it
    if (this.alive) this.drawBow(ctx);
    limb(1, 3, 4, 7.5, this.body);

    this.drawStuck(ctx, false);

    // status overlays
    if (st.frozen > 0) {
      ctx.globalAlpha = fade * clamp(st.frozen * 2, 0, 0.75);
      ctx.strokeStyle = '#d8f6ff';
      for (const [a, b] of SEGS) line(a, b, 15, '#bfefff');
      ctx.fillStyle = '#d8f6ff';
      ctx.beginPath(); ctx.arc(hd.x, hd.y, (HEAD_R + 5) * s, 0, TAU); ctx.fill();
      ctx.globalAlpha = fade;
    }
    if (st.rooted > 0) {
      ctx.strokeStyle = '#4f9e3c'; ctx.lineWidth = 3 * s;
      for (const [a, b] of [[P.FKNEE, P.FFOOT], [P.BKNEE, P.BFOOT]]) {
        const A = pts[a], B = pts[b];
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const u = i / 10, w = Math.sin(u * 14 + time * 3) * 6 * s;
          const x = lerp(A.x, B.x, u) + w, y = lerp(A.y, B.y, u);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawHeadgear(ctx, hd, time) {
    const s = this.s, f = this.facing;
    if (this.isPlayer) {
      // hood with a soft point at the back
      ctx.fillStyle = this.shade;
      ctx.beginPath();
      ctx.arc(hd.x, hd.y - 1 * s, (HEAD_R + 2.5) * s, Math.PI * 0.95, Math.PI * 2.05);
      ctx.quadraticCurveTo(hd.x - f * 10 * s, hd.y - 10 * s, hd.x - f * (HEAD_R + 9) * s, hd.y + 4 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a2730';
      ctx.beginPath(); ctx.arc(hd.x + f * 6 * s, hd.y - 1 * s, 2.2 * s, 0, TAU); ctx.fill();
      return;
    }
    // enemies: glowing eye + elemental band
    if (this.alive) Glow.draw(ctx, this.aura, hd.x + f * 6 * s, hd.y - 1 * s, 10 * s, 0.9);
    ctx.fillStyle = this.aura;
    ctx.beginPath(); ctx.ellipse(hd.x + f * 6 * s, hd.y - 1 * s, 3 * s, 2.2 * s, 0, 0, TAU); ctx.fill();
    if (this.kind === 'brute' || this.kind === 'boss') {
      // helmet
      ctx.fillStyle = '#8b8f9c';
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, (HEAD_R + 2.5) * s, Math.PI, 0);
      ctx.lineTo(hd.x + (HEAD_R + 2.5) * s, hd.y + 3 * s);
      ctx.lineTo(hd.x - (HEAD_R + 2.5) * s, hd.y + 3 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#20232b';
      ctx.fillRect(hd.x + f * 2 * s - (f < 0 ? 10 * s : 0), hd.y - 3 * s, 10 * s, 2.5 * s);
    }
    if (this.kind === 'boss') {
      ctx.fillStyle = this.aura;
      const by = hd.y - (HEAD_R + 1) * s;
      ctx.beginPath();
      ctx.moveTo(hd.x - 12 * s, by);
      for (let i = 0; i < 5; i++) {
        const x = hd.x - 12 * s + i * 6 * s;
        ctx.lineTo(x + 3 * s, by - (i % 2 ? 6 : 11) * s);
        ctx.lineTo(x + 6 * s, by);
      }
      ctx.closePath(); ctx.fill();
      if (this.alive) Glow.draw(ctx, this.aura, hd.x, by - 6 * s, 26 * s, 0.35 + Math.sin(time * 3) * 0.1);
    } else if (this.kind === 'mage') {
      ctx.fillStyle = this.shade;
      ctx.beginPath();
      ctx.moveTo(hd.x - 15 * s, hd.y + 2 * s);
      ctx.quadraticCurveTo(hd.x - 4 * s, hd.y - 22 * s, hd.x - f * 12 * s, hd.y - 30 * s);
      ctx.quadraticCurveTo(hd.x + 8 * s, hd.y - 16 * s, hd.x + 15 * s, hd.y + 2 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = this.aura;
      ctx.beginPath(); ctx.ellipse(hd.x + f * 6 * s, hd.y - 1 * s, 3 * s, 2.2 * s, 0, 0, TAU); ctx.fill();
    } else if (this.kind !== 'brute') {
      ctx.strokeStyle = this.aura; ctx.lineWidth = 3.5 * s;
      ctx.beginPath(); ctx.arc(hd.x, hd.y, (HEAD_R - 1) * s, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      // trailing band tails
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.moveTo(hd.x - f * 11 * s, hd.y - 6 * s);
      ctx.quadraticCurveTo(hd.x - f * 20 * s, hd.y - 6 * s + Math.sin(time * 5 + this.t) * 3 * s, hd.x - f * 26 * s, hd.y - 2 * s);
      ctx.stroke();
    }
  }

  drawBow(ctx) {
    const s = this.s, pts = this.pts;
    const h = pts[P.FHAND], sh = pts[P.BHAND];
    const ax = Math.cos(this.aim), ay = Math.sin(this.aim);
    const px = -ay, py = ax;
    const bend = 13 + this.drawAmt * 7;
    const t1x = h.x + px * 34 * s - ax * bend * s, t1y = h.y + py * 34 * s - ay * bend * s;
    const t2x = h.x - px * 34 * s - ax * bend * s, t2y = h.y - py * 34 * s - ay * bend * s;
    const cx = 2 * h.x - (t1x + t2x) / 2, cy = 2 * h.y - (t1y + t2y) / 2;
    // string
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4 * s;
    ctx.beginPath(); ctx.moveTo(t1x, t1y);
    if (this.drawAmt > 0.02) ctx.lineTo(sh.x, sh.y);
    ctx.lineTo(t2x, t2y); ctx.stroke();
    // limbs of the bow
    ctx.strokeStyle = this.isPlayer ? '#e8b04a' : '#a07a4a';
    ctx.lineWidth = 4.5 * s;
    ctx.beginPath(); ctx.moveTo(t1x, t1y); ctx.quadraticCurveTo(cx, cy, t2x, t2y); ctx.stroke();
    ctx.strokeStyle = this.isPlayer ? '#fff0c4' : '#c9a273';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.moveTo(t1x, t1y); ctx.quadraticCurveTo(cx, cy, t2x, t2y); ctx.stroke();
    // nocked arrow
    if (this.drawAmt > 0.02 && this.nockEl) {
      const L = 62 * s;
      const tx = sh.x + ax * L, ty = sh.y + ay * L;
      drawArrowShape(ctx, sh.x, sh.y, tx, ty, this.nockEl, s, 1);
    }
  }

  drawStuck(ctx, behind) {
    for (let i = 0; i < this.stuck.length; i++) {
      if ((i % 2 === 0) !== behind) continue;
      const a = this.stuck[i];
      const [ia, ib] = SEGS[a.seg];
      const A = this.pts[ia], B = this.pts[ib];
      const sa = Math.atan2(B.y - A.y, B.x - A.x);
      const nx = -Math.sin(sa), ny = Math.cos(sa);
      const tx = lerp(A.x, B.x, a.u) + nx * a.off, ty = lerp(A.y, B.y, a.u) + ny * a.off;
      const ang = sa + a.rel;
      const tail = a.len * 0.62;
      drawArrowShape(ctx, tx - Math.cos(ang) * tail, ty - Math.sin(ang) * tail, tx, ty, a.el, 1, 0, true);
    }
  }

  drawCape(ctx) {
    const c = this.cape;
    const col = this.capeColor || '#4fc7a6';
    ctx.fillStyle = col;
    ctx.beginPath();
    const w0 = 7 * this.s;
    const left = [], right = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const w = w0 * (1 - i / c.length * 0.55);
      left.push([c[i].x - dy / l * w, c[i].y + dx / l * w]);
      right.push([c[i].x + dy / l * w, c[i].y - dx / l * w]);
    }
    ctx.moveTo(left[0][0], left[0][1]);
    for (const p of left) ctx.lineTo(p[0], p[1]);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath(); ctx.fill();
  }
}

/* shared arrow drawing, used by flying arrows, nocked arrows and stuck ones */
function drawArrowShape(ctx, x0, y0, x1, y1, elId, s = 1, glow = 1, stuck = false) {
  const el = ELEMENT_BY_ID[elId] || NEUTRAL_ARROW;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const c = Math.cos(ang), sn = Math.sin(ang);
  ctx.lineCap = 'round';
  // shaft
  ctx.strokeStyle = elId === 'earth' ? '#8a6a4c' : '#efe6d4';
  ctx.lineWidth = (elId === 'earth' ? 3.4 : 2.4) * s;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - c * 6 * s, y1 - sn * 6 * s); ctx.stroke();
  // fletching
  ctx.strokeStyle = el.deep; ctx.lineWidth = 2.2 * s;
  for (const k of [0, 5]) {
    const bx = x0 + c * k * s, by = y0 + sn * k * s;
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx - c * 6 * s - sn * 5 * s, by - sn * 6 * s + c * 5 * s);
    ctx.moveTo(bx, by); ctx.lineTo(bx - c * 6 * s + sn * 5 * s, by - sn * 6 * s - c * 5 * s);
    ctx.stroke();
  }
  if (stuck) return;
  // head
  ctx.fillStyle = el.color;
  if (elId === 'earth') {
    ctx.beginPath(); ctx.arc(x1 - c * 3 * s, y1 - sn * 3 * s, 7 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = el.deep;
    ctx.beginPath(); ctx.arc(x1 - c * 1 * s, y1 - sn * 4 * s, 3 * s, 0, TAU); ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x1 + c * 4 * s, y1 + sn * 4 * s);
    ctx.lineTo(x1 - c * 8 * s - sn * 5 * s, y1 - sn * 8 * s + c * 5 * s);
    ctx.lineTo(x1 - c * 8 * s + sn * 5 * s, y1 - sn * 8 * s - c * 5 * s);
    ctx.closePath(); ctx.fill();
  }
  if (glow) {
    ctx.globalCompositeOperation = 'lighter';
    Glow.draw(ctx, el.deep, x1, y1, 22 * s, 0.55 * glow);
    ctx.globalCompositeOperation = 'source-over';
  }
}
