'use strict';
/* =========================================================================
   Fighter: an active ragdoll. Eleven verlet points joined by bones are
   pulled toward an animated pose by "muscles". Hits shove the points
   around; big hits drop muscle strength to zero (tumble) and the body
   flies limp until it settles and stands itself back up.
   A light platformer "root" (feet position) drives movement while active.
   ========================================================================= */

const P = { HEAD: 0, NECK: 1, PELVIS: 2, FELB: 3, FHAND: 4, BELB: 5, BHAND: 6, FKNEE: 7, FFOOT: 8, BKNEE: 9, BFOOT: 10 };
// bones: [a, b, hurt radius]
const SEGS = [
  [1, 0, 0], [1, 2, 9],
  [1, 3, 6], [3, 4, 6], [1, 5, 6], [5, 6, 6],
  [2, 7, 7], [7, 8, 6], [2, 9, 7], [9, 10, 6],
];
const BONE_LEN = [17, 45, 24, 24, 24, 24, 29, 28, 29, 28];
const MUSCLE = [0.2, 0.3, 0.34, 0.16, 0.26, 0.16, 0.24, 0.2, 0.32, 0.2, 0.32];
const MUSCLE_DAMP = 0.3;
const HEAD_R = 13;
const ROOT_G = 2700;
const BODY_G = 2400;

class Fighter {
  constructor(o) {
    this.s = o.scale || 1;
    this.facing = o.facing || 1;
    this.isPlayer = !!o.isPlayer;
    this.kind = o.kind || 'grunt';
    this.el = o.el || 'none';
    this.body = o.body || '#f7f2e7';
    this.shade = o.shade || '#d6cab4';
    this.accent = o.accent || AURA[this.el];
    this.weight = o.weight || 1;
    this.speed = o.speed || 340;
    this.jumpV = o.jumpV || 1020;
    this.maxJumps = o.maxJumps || 1;
    this.maxHp = this.hp = o.hp || 100;
    this.root = { x: o.x, y: o.y, vx: 0, vy: 0, grounded: false, plat: null, dropPlat: null, dropT: 0, jumps: 0 };
    this.mode = 'active';           // active | tumble | rising | dead
    this.m = 1;                     // muscle strength 0..1
    this.stunT = 0;
    this.t = Math.random() * 10;
    this.walkPh = 0;
    this.aim = this.facing > 0 ? 0 : Math.PI;
    this.input = { x: 0 };
    this.action = null;
    this.cds = {};
    this.status = { burn: 0, burnDps: 0, freeze: 0, chill: 0, soak: 0, root: 0, shock: 0 };
    this.shield = 0; this.shieldT = 0;
    this.regen = 0; this.regenT = 0;
    this.invuln = 0;
    this.flash = 0;
    this.knockT = 0;
    this.deadT = 0;
    this.comboAlt = 0;
    this.dash = null;
    this.slam = false;
    this.pts = []; this.T = []; this.Tp = [];
    for (let i = 0; i < 11; i++) { this.pts.push({ x: o.x, y: o.y, px: o.x, py: o.y }); this.T.push({ x: o.x, y: o.y }); this.Tp.push({ x: o.x, y: o.y }); }
    this.computeTargets();
    for (let i = 0; i < 11; i++) { const p = this.pts[i]; p.x = p.px = this.T[i].x; p.y = p.py = this.T[i].y; this.Tp[i].x = this.T[i].x; this.Tp[i].y = this.T[i].y; }
    this.cape = null;
    if (this.isPlayer || this.kind === 'boss') {
      this.cape = [];
      for (let i = 0; i < 7; i++) this.cape.push({ x: o.x, y: o.y - 90, px: o.x, py: o.y - 90 });
    }
  }

  get alive() { return this.mode !== 'dead'; }
  get canAct() { return (this.mode === 'active') && this.status.freeze <= 0 && !this.dash; }
  get pelvis() { return this.pts[P.PELVIS]; }

  center() { const a = this.pts[P.NECK], b = this.pts[P.PELVIS]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  chest() { const a = this.pts[P.NECK], b = this.pts[P.PELVIS]; return { x: lerp(a.x, b.x, 0.3), y: lerp(a.y, b.y, 0.3) }; }
  head() { return this.pts[P.HEAD]; }
  hand() { return this.pts[P.FHAND]; }

  /* ------------------------------------------------------------ control */
  jump() {
    const r = this.root;
    if (!this.canAct || this.status.root > 0) return false;
    if (r.grounded) { r.jumps = 1; }
    else if (r.jumps < this.maxJumps) { r.jumps++; }
    else return false;
    r.vy = -(r.grounded ? this.jumpV : this.jumpV * 0.9);
    r.grounded = false; r.plat = null;
    return true;
  }
  drop() {
    const r = this.root;
    if (!this.canAct || !r.grounded || !r.plat) return false;
    r.dropPlat = r.plat; r.dropT = 0.3; r.grounded = false; r.plat = null; r.y += 3;
    return true;
  }

  /* -------------------------------------------------------------- hits */
  // push the body; spread decides how much the rest of the body moves with the struck point
  impulse(idx, vx, vy, spread = 0.45) {
    const dt = STEP;
    for (let i = 0; i < 11; i++) {
      const k = i === idx ? 1 : spread;
      this.pts[i].px -= vx * k * dt;
      this.pts[i].py -= vy * k * dt;
    }
  }

  knock(kx, ky, idx, tumbleFor) {
    const r = this.root;
    if (this.mode === 'active' || this.mode === 'rising') {
      r.vx += kx; r.vy += ky;
      if (ky < -50) { r.grounded = false; r.plat = null; }
      this.knockT = 0.35;
    }
    this.impulse(idx != null ? idx : P.PELVIS, kx * 0.9, ky * 0.9, 0.5);
    if (tumbleFor > 0) this.tumble(tumbleFor, kx, ky);
  }

  tumble(dur, kx = 0, ky = 0) {
    if (this.mode === 'dead') return;
    if (this.mode === 'active' || this.mode === 'rising') {
      // hand the root's momentum over to the body
      const dt = STEP, r = this.root;
      for (const p of this.pts) { p.px -= r.vx * dt * 0.6; p.py -= r.vy * dt * 0.6; }
    }
    this.mode = 'tumble';
    this.stunT = Math.max(this.stunT, dur);
    this.action = null;
    this.dash = null;
    this.slam = false;
  }

  die(kx, ky, idx) {
    if (this.mode === 'dead') return;
    this.tumble(1, kx, ky);
    this.mode = 'dead';
    this.m = 0;
    this.deadT = 0;
    this.hp = 0;
  }

  /* ------------------------------------------------------------ update */
  update(dt, plats, forces) {
    const st = this.status;
    for (const k of ['burn', 'chill', 'soak', 'root', 'shock']) st[k] = Math.max(0, st[k] - dt);
    if (st.freeze > 0) st.freeze = Math.max(0, st.freeze - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.knockT = Math.max(0, this.knockT - dt);
    this.root.dropT = Math.max(0, this.root.dropT - dt);
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) this.shield = 0; }
    if (this.regenT > 0) { this.regenT -= dt; this.hp = Math.min(this.maxHp, this.hp + this.regen * dt); }
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);

    if (this.mode === 'dead') this.deadT += dt;

    if (this.mode === 'active' || this.mode === 'rising') {
      if (this.mode === 'rising') {
        this.m = Math.min(1, this.m + dt / 0.5);
        if (this.m >= 0.85) this.mode = 'active';
      } else {
        this.m = st.shock > 0 ? 0.4 : Math.min(1, this.m + dt * 3);
      }
      this.stepRoot(dt, plats, forces);
      if (st.freeze <= 0) { this.t += dt; this.computeTargets(); }
      else for (let i = 0; i < 11; i++) { this.Tp[i].x = this.T[i].x; this.Tp[i].y = this.T[i].y; }
    } else {
      this.m = Math.max(0, this.m - dt * 8);
      if (this.mode === 'tumble') {
        this.stunT -= dt;
        if (st.freeze > 0) this.stunT = Math.max(this.stunT, 0.05);
      }
    }
    this.stepBody(dt, plats, forces);

    if (this.mode === 'tumble') this.followBody(dt, plats);
    if (this.cape) this.stepCape(dt);
  }

  stepRoot(dt, plats, forces) {
    const r = this.root, st = this.status;
    const control = this.mode === 'active' && st.freeze <= 0;
    // ride moving platforms
    if (r.grounded && r.plat) { r.x += r.plat.dx; r.y = r.plat.top; }

    if (this.dash) {
      this.dash.t -= dt;
      r.vx = this.dash.vx; r.vy = this.dash.vy;
      if (this.dash.t <= 0) { r.vx *= 0.35; r.vy = Math.min(r.vy, 0) * 0.3; this.dash = null; }
    } else {
      let want = control && st.root <= 0 && !(this.action && this.action.lock) ? this.input.x * this.speed * (st.chill > 0 ? 0.55 : 1) : 0;
      if (this.action && !this.action.lock) want *= 0.45;
      let acc = r.grounded ? 14 : 6;
      if (this.knockT > 0) acc *= 0.15;
      r.vx += (want - r.vx) * Math.min(1, acc * dt);
      r.vy += ROOT_G * dt * (this.slam ? 1.8 : 1);
      if (forces) { const f = forces(r.x, r.y - 50 * this.s, this); r.vx += f.x * dt * 0.5; r.vy += f.y * dt * 0.5; }
    }
    const prevY = r.y;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    const wasGrounded = r.grounded;
    r.grounded = false;
    if (r.vy >= 0) {
      for (const pl of plats) {
        if (r.dropT > 0 && pl === r.dropPlat) continue;
        if (r.x < pl.left - 4 || r.x > pl.right + 4) continue;
        if (prevY <= pl.prevTop + 2 && r.y >= pl.top) {
          const impact = r.vy;
          r.y = pl.top; r.vy = 0; r.grounded = true; r.plat = pl; r.jumps = 0;
          if (!wasGrounded && impact > 900) this.landT = Math.min(1, impact / 2000);
          break;
        }
      }
    }
    if (!r.grounded) { r.plat = null; if (wasGrounded && r.jumps === 0) r.jumps = 1; }
    if (r.grounded && Math.abs(r.vx) > 20) this.walkPh += Math.abs(r.vx) * dt * 0.05 / this.s;
    if (this.landT) this.landT = Math.max(0, this.landT - dt * 3);
  }

  computeTargets() {
    const s = this.s, f = this.facing, r = this.root, T = this.T, Tp = this.Tp;
    for (let i = 0; i < 11; i++) { Tp[i].x = T[i].x; Tp[i].y = T[i].y; }
    const air = !r.grounded;
    const moving = r.grounded && Math.abs(r.vx) > 40;
    const bob = Math.sin(this.t * 3) * 1.4 * s;
    const ax = Math.cos(this.aim), ay = Math.sin(this.aim);
    let lean = clamp(r.vx * 0.012, -7, 7) * s;
    let crouch = (this.landT || 0) * 14 * s;
    let hands = null;   // [fx, fy, bx, by] relative to neck
    const act = this.action;
    if (act) {
      const mv = act.move;
      const w = mv.windup, a = mv.active, rc = mv.recover;
      const t = act.t;
      const phase = t < w ? 0 : t < w + a ? 1 : 2;
      const u = phase === 0 ? t / Math.max(w, 1e-3) : phase === 1 ? (t - w) / Math.max(a, 1e-3) : clamp((t - w - a) / Math.max(rc, 1e-3), 0, 1);
      const guard = [f * 22 * s, 10 * s, f * 10 * s, 14 * s];
      const blend = (h) => phase === 2 ? h.map((v, i) => lerp(v, guard[i], easeInOut(u))) : h;
      switch (mv.pose) {
        case 'punch': {
          const h = phase === 0 ? [-ax * 6 * s, 6 * s, -f * 14 * s, 12 * s] : [ax * 52 * s, ay * 52 * s, -f * 16 * s, 10 * s];
          hands = blend(h); lean += f * (phase === 1 ? 6 : -2) * s; break;
        }
        case 'heavy': {
          const h = phase === 0 ? [-f * 18 * s, -36 * s, -f * 10 * s, -30 * s] : [ax * 54 * s, ay * 54 * s, -f * 18 * s, 8 * s];
          hands = blend(h); lean += f * (phase === 0 ? -6 : 9) * s; crouch += phase === 1 ? 6 * s : 0; break;
        }
        case 'swing': {
          const dir = act.alt ? -1 : 1;
          const a0 = this.aim - f * 1.6 * dir, a1 = this.aim + f * 0.9 * dir;
          const ang = phase === 0 ? a0 : lerp(a0, a1, easeOut(Math.min(1, phase === 1 ? u : 1)));
          const h = [Math.cos(ang) * 50 * s, Math.sin(ang) * 50 * s, -f * 14 * s, 12 * s];
          hands = blend(h); lean += f * (phase === 1 ? 5 : 0) * s; break;
        }
        case 'cast': {
          const h = phase === 0 ? [-ax * 18 * s, -ay * 18 * s - 14 * s, f * 8 * s, 14 * s] : [ax * 50 * s, ay * 50 * s, -f * 18 * s, 6 * s];
          hands = blend(h); break;
        }
        case 'channel': {
          const px = -ay * 7 * s, py = ax * 7 * s;
          hands = blend([ax * 48 * s + px, ay * 48 * s + py, ax * 46 * s - px, ay * 46 * s - py]); lean -= f * 4 * s; break;
        }
        case 'raise': {
          hands = blend(phase === 0 ? [f * 8 * s, -30 * s, -f * 8 * s, -28 * s] : [f * 14 * s, -48 * s, -f * 12 * s, -47 * s]); break;
        }
        case 'nova': {
          hands = blend(phase === 0 ? [f * 6 * s, 16 * s, f * 2 * s, 18 * s] : [f * 46 * s, -6 * s, -f * 46 * s, -6 * s]);
          crouch += phase === 0 ? 8 * s : 0; break;
        }
        case 'dash': {
          hands = blend([-f * 32 * s, 14 * s, -f * 26 * s, 20 * s]); lean += f * 14 * s; break;
        }
        default: break;
      }
    }

    const gx = r.x, gy = r.y;
    let ff, bf;
    if (air) {
      const tuck = clamp(-r.vy * 0.01, -6, 14) * s;
      ff = [gx + f * 13 * s, gy - 12 * s - tuck];
      bf = [gx - f * 11 * s, gy - 4 * s - tuck * 0.5];
    } else if (moving) {
      const dir = Math.sign(r.vx), a1 = this.walkPh;
      ff = [gx + dir * Math.sin(a1) * 19 * s, gy - Math.max(0, Math.cos(a1)) * 14 * s];
      bf = [gx + dir * Math.sin(a1 + Math.PI) * 19 * s, gy - Math.max(0, Math.cos(a1 + Math.PI)) * 14 * s];
    } else {
      ff = [gx + f * 15 * s, gy];
      bf = [gx - f * 13 * s, gy];
    }
    const px = gx + lean * 0.35, py = gy - 52 * s + bob + crouch;
    const nx = px + lean, ny = py - 45 * s;
    T[P.PELVIS].x = px; T[P.PELVIS].y = py;
    T[P.NECK].x = nx; T[P.NECK].y = ny;
    T[P.HEAD].x = nx + f * 2 * s + lean * 0.3; T[P.HEAD].y = ny - 17 * s;
    T[P.FFOOT].x = ff[0]; T[P.FFOOT].y = ff[1];
    T[P.BFOOT].x = bf[0]; T[P.BFOOT].y = bf[1];
    T[P.FKNEE].x = (px + ff[0]) / 2 + f * 9 * s; T[P.FKNEE].y = (py + ff[1]) / 2;
    T[P.BKNEE].x = (px + bf[0]) / 2 + f * 9 * s; T[P.BKNEE].y = (py + bf[1]) / 2;

    if (!hands) {
      const sw = moving ? Math.sin(this.walkPh) * 8 * s : 0;
      hands = air ? [f * 22 * s, -8 * s, -f * 20 * s, -6 * s] : [f * 22 * s + sw, 10 * s + bob, f * 10 * s - sw, 14 * s + bob];
    }
    const setArm = (hi, ei, hx, hy) => {
      T[hi].x = nx + hx; T[hi].y = ny + hy;
      const mx = nx + hx / 2, my = ny + hy / 2;
      const l = Math.hypot(hx, hy) || 1;
      // elbows bend down and away from the body
      let bx = -hy / l, by = hx / l;
      if (by < 0) { bx = -bx; by = -by; }
      const bend = Math.max(0, 46 * s - l) * 0.45 + 2 * s;
      T[ei].x = mx + bx * bend; T[ei].y = my + by * bend;
    };
    setArm(P.FHAND, P.FELB, hands[0], hands[1]);
    setArm(P.BHAND, P.BELB, hands[2], hands[3]);
  }

  stepBody(dt, plats, forces) {
    const m = this.m, pts = this.pts, T = this.T, Tp = this.Tp;
    const g = BODY_G * dt * dt * (1 - 0.92 * m);
    for (let i = 0; i < 11; i++) {
      const p = pts[i];
      let vx = (p.x - p.px) * 0.995, vy = (p.y - p.py) * 0.995;
      if (forces && m < 0.5) { const f = forces(p.x, p.y, this); vx += f.x * dt * dt; vy += f.y * dt * dt; }
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g;
      if (m > 0.01) {
        const k = MUSCLE[i] * m;
        const tvx = T[i].x - Tp[i].x, tvy = T[i].y - Tp[i].y;
        p.x += (T[i].x - p.x) * k - (vx - tvx) * MUSCLE_DAMP * m;
        p.y += (T[i].y - p.y) * k - (vy - tvy) * MUSCLE_DAMP * m;
      }
    }
    const s = this.s;
    for (let it = 0; it < 5; it++) {
      for (let b = 0; b < SEGS.length; b++) {
        const A = pts[SEGS[b][0]], B = pts[SEGS[b][1]];
        const dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const diff = ((d - BONE_LEN[b] * s) / d) * 0.5;
        A.x += dx * diff; A.y += dy * diff;
        B.x -= dx * diff; B.y -= dy * diff;
      }
      if (m < 0.6) {
        // keep head roughly on the spine when limp
        const A = pts[0], B = pts[2];
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1e-4;
        const diff = ((d - 61 * s) / d) * 0.25;
        A.x += dx * diff; A.y += dy * diff; B.x -= dx * diff; B.y -= dy * diff;
      }
    }
    if (this.mode !== 'active') for (const p of pts) for (const pl of plats) landPoint(p, pl);
  }

  followBody(dt, plats) {
    const r = this.root, pv = this.pelvis;
    r.vx = (pv.x - pv.px) / dt; r.vy = (pv.y - pv.py) / dt;
    r.x = pv.x; r.y = pv.y + 50 * this.s;
    r.grounded = false; r.plat = null;
    if (this.stunT > 0) return;
    const speed = Math.hypot(r.vx, r.vy);
    if (speed > 260 && this.stunT > -2) return;
    // stand up from whatever platform the pelvis is lying on
    let best = null;
    for (const pl of plats) {
      if (pv.x < pl.left || pv.x > pl.right) continue;
      const d = pl.top - pv.y;
      if (d > -6 && d < 70 * this.s && (!best || pl.top < best.top)) best = pl;
    }
    if (!best) return;
    r.x = clamp(pv.x, best.left + 10, best.right - 10); r.y = best.top; r.vx = 0; r.vy = 0;
    r.grounded = true; r.plat = best; r.jumps = 0;
    this.mode = 'rising';
    this.m = 0.05;
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  stepCape(dt) {
    const c = this.cape, n = this.pts[P.NECK];
    const L = 9 * this.s;
    c[0].x = n.x - this.facing * 2; c[0].y = n.y + 2;
    const g = 900 * dt * dt;
    const wind = Math.sin(this.t * 1.7) * 0.05 - this.facing * 0.1;
    for (let i = 1; i < c.length; i++) {
      const p = c[i];
      const vx = (p.x - p.px) * 0.93, vy = (p.y - p.py) * 0.93;
      p.px = p.x; p.py = p.y;
      p.x += vx + wind; p.y += vy + g;
    }
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

  /* ---------------------------------------------------------- hurtbox */
  // closest bone touched by a capsule (ax,ay)-(bx,by) of radius r
  hitCapsule(ax, ay, bx, by, r) {
    const s = this.s, pts = this.pts;
    const h = pts[P.HEAD];
    const hr = segPointDist(ax, ay, bx, by, h.x, h.y);
    if (hr.d < HEAD_R * s + r) return { seg: 0, idx: P.HEAD, head: true, px: h.x, py: h.y, t: hr.t };
    let best = null;
    for (let i = 1; i < SEGS.length; i++) {
      const [a, b, br] = SEGS[i];
      const A = pts[a], B = pts[b];
      const res = segSegDist(ax, ay, bx, by, A.x, A.y, B.x, B.y);
      if (res.d < br * s + r && (!best || res.t < best.t)) best = { seg: i, idx: res.u > 0.5 ? b : a, head: false, px: lerp(A.x, B.x, res.u), py: lerp(A.y, B.y, res.u), t: res.t };
    }
    return best;
  }
  hitCircle(x, y, r) { return this.hitCapsule(x, y, x + 0.01, y, r); }

  /* --------------------------------------------------------------- draw */
  draw(ctx, time) {
    const s = this.s, pts = this.pts, st = this.status;
    const fade = this.mode === 'dead' ? clamp(1 - (this.deadT - 4) / 1.2, 0, 1) : 1;
    if (fade <= 0) return;
    ctx.globalAlpha = fade * (this.invuln > 0 && this.isPlayer && !this.dash ? 0.55 + Math.sin(time * 30) * 0.25 : 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (this.cape) this.drawCape(ctx);

    const body = this.flash > 0 ? mixHex(this.body, '#ffffff', this.flash) : this.body;
    const shade = this.flash > 0 ? mixHex(this.shade, '#ffffff', this.flash) : this.shade;
    const limb = (a, b, c, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w * s;
      ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.lineTo(pts[c].x, pts[c].y); ctx.stroke();
    };
    // rim so dark fighters read on dark skies
    if (!this.isPlayer && this.alive) {
      ctx.save(); ctx.globalAlpha *= 0.55;
      for (const [a, b, c] of [[2, 9, 10], [1, 5, 6], [2, 7, 8], [1, 3, 4]]) limb(a, b, c, 12.5, this.accent);
      ctx.strokeStyle = this.accent; ctx.lineWidth = 15 * s;
      ctx.beginPath(); ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y); ctx.stroke();
      ctx.fillStyle = this.accent; ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, (HEAD_R + 2.5) * s, 0, TAU); ctx.fill();
      ctx.restore();
    }
    limb(2, 9, 10, 9, shade);
    limb(1, 5, 6, 8, shade);
    ctx.strokeStyle = body; ctx.lineWidth = 12 * s;
    ctx.beginPath(); ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y); ctx.stroke();
    limb(2, 7, 8, 9.5, body);
    const hd = pts[P.HEAD];
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(hd.x, hd.y, HEAD_R * s, 0, TAU); ctx.fill();
    this.drawHeadgear(ctx, hd, time);
    limb(1, 3, 4, 8.5, body);

    // elemental hands
    if (this.alive && this.el !== 'none') {
      ctx.globalCompositeOperation = 'lighter';
      const c = AURA[this.el];
      for (const i of [P.FHAND, P.BHAND]) Glow.draw(ctx, c, pts[i].x, pts[i].y, (this.isPlayer ? 20 : 14) * s, this.isPlayer ? 0.85 : 0.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(pts[P.FHAND].x, pts[P.FHAND].y, 5 * s, 0, TAU); ctx.fill();
    }

    if (st.freeze > 0) {
      ctx.globalAlpha = fade * clamp(st.freeze * 2, 0, 0.8);
      for (const [a, b] of SEGS) {
        ctx.strokeStyle = '#c4f1ff'; ctx.lineWidth = 17 * s;
        ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
      }
      ctx.fillStyle = '#d8f6ff';
      ctx.beginPath(); ctx.arc(hd.x, hd.y, (HEAD_R + 5) * s, 0, TAU); ctx.fill();
      ctx.globalAlpha = fade;
    }
    if (st.root > 0) {
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
    if (this.shield > 0) {
      const c = this.center();
      ctx.globalAlpha = fade * (0.35 + Math.sin(time * 6) * 0.08);
      ctx.fillStyle = '#7cc8ff';
      ctx.beginPath(); ctx.arc(c.x, c.y - 10 * s, 72 * s, 0, TAU); ctx.fill();
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = '#d5efff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c.x, c.y - 10 * s, 72 * s, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x - 22 * s, c.y - 40 * s, 14 * s, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawHeadgear(ctx, hd, time) {
    const s = this.s, f = this.facing;
    if (this.isPlayer) {
      ctx.fillStyle = this.shade;
      ctx.beginPath();
      ctx.arc(hd.x, hd.y - 1 * s, (HEAD_R + 2.5) * s, Math.PI * 0.95, Math.PI * 2.05);
      ctx.quadraticCurveTo(hd.x - f * 10 * s, hd.y - 10 * s, hd.x - f * (HEAD_R + 9) * s, hd.y + 4 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a2730';
      ctx.beginPath(); ctx.arc(hd.x + f * 6 * s, hd.y - 1 * s, 2.3 * s, 0, TAU); ctx.fill();
      return;
    }
    if (this.alive) Glow.draw(ctx, this.accent, hd.x + f * 6 * s, hd.y - 1 * s, 10 * s, 0.9);
    ctx.fillStyle = this.alive ? this.accent : '#555';
    ctx.beginPath(); ctx.ellipse(hd.x + f * 6 * s, hd.y - 1 * s, 3 * s, 2.2 * s, 0, 0, TAU); ctx.fill();
    if (this.kind === 'brute' || this.kind === 'boss') {
      ctx.fillStyle = '#8b8f9c';
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, (HEAD_R + 2.5) * s, Math.PI, 0);
      ctx.lineTo(hd.x + (HEAD_R + 2.5) * s, hd.y + 3 * s);
      ctx.lineTo(hd.x - (HEAD_R + 2.5) * s, hd.y + 3 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#20232b';
      ctx.fillRect(hd.x + f * 2 * s - (f < 0 ? 10 * s : 0), hd.y - 3 * s, 10 * s, 2.5 * s);
      // shoulder plate
      const n = this.pts[P.NECK];
      ctx.fillStyle = '#7a7e8b';
      ctx.beginPath(); ctx.ellipse(n.x, n.y + 4 * s, 15 * s, 8 * s, 0, Math.PI, 0); ctx.fill();
    }
    if (this.kind === 'boss') {
      ctx.fillStyle = this.accent;
      const by = hd.y - (HEAD_R + 1) * s;
      ctx.beginPath();
      ctx.moveTo(hd.x - 12 * s, by);
      for (let i = 0; i < 5; i++) {
        const x = hd.x - 12 * s + i * 6 * s;
        ctx.lineTo(x + 3 * s, by - (i % 2 ? 6 : 11) * s);
        ctx.lineTo(x + 6 * s, by);
      }
      ctx.closePath(); ctx.fill();
      if (this.alive) Glow.draw(ctx, this.accent, hd.x, by - 6 * s, 26 * s, 0.35 + Math.sin(time * 3) * 0.1);
    } else if (this.kind === 'caster') {
      ctx.fillStyle = this.shade;
      ctx.beginPath();
      ctx.moveTo(hd.x - 15 * s, hd.y + 2 * s);
      ctx.quadraticCurveTo(hd.x - 4 * s, hd.y - 22 * s, hd.x - f * 12 * s, hd.y - 30 * s);
      ctx.quadraticCurveTo(hd.x + 8 * s, hd.y - 16 * s, hd.x + 15 * s, hd.y + 2 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = this.accent;
      ctx.beginPath(); ctx.ellipse(hd.x + f * 6 * s, hd.y - 1 * s, 3 * s, 2.2 * s, 0, 0, TAU); ctx.fill();
    } else if (this.kind === 'grunt') {
      ctx.strokeStyle = this.accent; ctx.lineWidth = 3.5 * s;
      ctx.beginPath(); ctx.arc(hd.x, hd.y, (HEAD_R - 1) * s, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.moveTo(hd.x - f * 11 * s, hd.y - 6 * s);
      ctx.quadraticCurveTo(hd.x - f * 20 * s, hd.y - 6 * s + Math.sin(time * 5 + this.t) * 3 * s, hd.x - f * 26 * s, hd.y - 2 * s);
      ctx.stroke();
    }
  }

  drawCape(ctx) {
    const c = this.cape;
    ctx.fillStyle = this.capeColor || this.accent;
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

/* one-way platform contact for a single verlet point */
function landPoint(p, pl) {
  if (p.x < pl.left || p.x > pl.right) return;
  if (p.y > pl.top && p.py <= pl.prevTop + 1.5) {
    p.y = pl.top;
    p.px = lerp(p.px, p.x, 0.35);          // friction
    p.py = p.y + (p.py - p.y) * 0.15;
  }
}
