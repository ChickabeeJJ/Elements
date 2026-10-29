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
const MUSCLE = [0.15, 0.22, 0.27, 0.16, 0.24, 0.16, 0.23, 0.15, 0.24, 0.15, 0.24];
const MUSCLE_DAMP = 0.22;
// inverse masses: heavy trunk, light extremities, so limbs whip around the body
const INV_MASS = [0.8, 0.35, 0.3, 0.88, 0.92, 0.88, 0.92, 0.75, 1, 0.75, 1];
// soft joint limits [a, b, minLen, maxLen] in unscaled units
const JOINT_LIMITS = [
  [2, 8, 36, 58], [2, 10, 36, 58],     // knees never fold flat
  [1, 4, 18, 49], [1, 6, 18, 49],      // elbows never fold flat
  [1, 7, 52, 80], [1, 9, 52, 80],      // thighs stay below the chest
  [0, 2, 56, 64],                      // head stays on the spine
  [0, 3, 22, 60], [0, 5, 22, 60],      // arms can't fold over the face
];
const HEAD_R = 13;
const ROOT_G = 2700;
const BODY_G = 2700;

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
    this.status = { burn: 0, burnDps: 0, poison: 0, poisonDps: 0, freeze: 0, chill: 0, soak: 0, root: 0, shock: 0, glint: 0, dazzle: 0, drain: 0 };
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
    // heavy hits set the body spinning: head and feet pushed opposite ways
    const kick = Math.hypot(kx, ky);
    if (kick > 300) {
      const dir = Math.sign(kx || 1) * Math.min(1, kick / 1400) * 260 * STEP;
      this.pts[P.HEAD].px -= dir; this.pts[P.NECK].px -= dir * 0.5;
      for (const i of [P.FFOOT, P.BFOOT]) this.pts[i].px += dir;
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
    for (const k of ['burn', 'poison', 'chill', 'soak', 'root', 'shock', 'glint', 'dazzle', 'drain']) st[k] = Math.max(0, st[k] - dt);
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
        this.m = Math.min(1, this.m + dt / 0.7);
        if (this.m >= 0.85) this.mode = 'active';
      } else {
        this.m = st.shock > 0 ? 0.4 : Math.min(1, this.m + dt * 3);
      }
      const rx0 = this.root.x, ry0 = this.root.y;
      this.stepRoot(dt, plats, forces);
      if (st.freeze <= 0) { this.t += dt; this.computeTargets(); }
      else {
        // frozen: the pose is locked but travels with the root as one solid statue,
        // so knockback and gravity move the whole body instead of tearing it from its feet
        const dx = this.root.x - rx0, dy = this.root.y - ry0;
        for (let i = 0; i < 11; i++) {
          this.T[i].x += dx; this.T[i].y += dy;
          this.Tp[i].x = this.T[i].x; this.Tp[i].y = this.T[i].y;
          const q = this.pts[i]; q.x += dx; q.y += dy; q.px += dx; q.py += dy;
        }
      }
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
        if (r.ghostTo && pl !== r.ghostTo) continue;   // spawning: fall straight to the marked island
        if (r.x < pl.left - 4 || r.x > pl.right + 4) continue;
        // solid landing band: anything that was at most a few px inside still lands
        if (prevY <= pl.prevTop + 10 && r.y >= pl.top && r.y <= pl.top + 60) {
          const impact = r.vy;
          r.y = pl.top; r.vy = 0; r.grounded = true; r.plat = pl; r.jumps = 0;
          if (!wasGrounded && impact > 900) this.landT = Math.min(1, impact / 2000);
          break;
        }
      }
    }
    // island bodies are solid: rising through them is allowed, but a fighter that ends up
    // inside one climbs onto the top if near it, otherwise gets pushed out of the side
    for (const pl of plats) {
      if (pl === r.plat || (r.dropT > 0 && pl === r.dropPlat) || !pl.solids || (r.ghostTo && pl !== r.ghostTo)) continue;
      if (r.x <= pl.left || r.x >= pl.right) continue;
      for (const q of pl.solids) {
        if (r.x <= q.l || r.x >= q.r || r.y <= q.t || r.y >= q.b) continue;
        if (!r.grounded && r.vy < 0) break;
        if (!r.grounded && r.y - pl.top < pl.cells.t * 1.5) {
          r.y = pl.top; r.vy = 0; r.grounded = true; r.plat = pl; r.jumps = 0;
        } else {
          const dl = r.x - q.l, dr = q.r - r.x, db = r.grounded ? Infinity : q.b - r.y;
          if (db < dl && db < dr) { r.y = q.b + 0.5; r.vy = Math.max(r.vy, 0); }
          else {
            const left = dl < dr;
            r.x = left ? q.l - 0.5 : q.r + 0.5;
            if (left ? r.vx > 0 : r.vx < 0) r.vx = 0;
          }
        }
        break;
      }
    }
    if (r.grounded) r.ghostTo = null;
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
    let elbowDownPose = false;
    let uppercutPose = false;
    let straightAttack = false;
    let rangedRelaxBack = false;
    const act = this.action;
    if (act) {
      const mv = act.move;
      const w = mv.windup, a = mv.active, rc = mv.recover;
      const t = act.t;
      const phase = t < w ? 0 : t < w + a ? 1 : 2;
      const u = phase === 0
        ? clamp(t / Math.max(w, 1e-3), 0, 1)
        : phase === 1
          ? clamp((t - w) / Math.max(a, 1e-3), 0, 1)
          : clamp((t - w - a) / Math.max(rc, 1e-3), 0, 1);

      // Continuous attack poses: settle into wind-up, drive through the active
      // frames, then return to guard instead of snapping between static targets.
      const guard = [f * 23 * s, 20 * s + bob, -f * 13 * s, 18 * s + bob];
      const poseLerp = (from, to, k) => from.map((v, i) => lerp(v, to[i], k));
      const actionPose = (wind, strike) => {
        if (phase === 0) return poseLerp(guard, wind, easeInOut(u));
        if (phase === 1) return poseLerp(wind, strike, easeOut(clamp(u / 0.3, 0, 1)));
        return poseLerp(strike, guard, easeInOut(u));
      };
      const isRanged = mv.type === 'ranged' || mv.pose === 'cast' || mv.kind === 'projectile' || mv.kind === 'beam';
      const px = -ay, py = ax;
      const front = (distance, spread = 0) => [ax * distance + px * spread, ay * distance + py * spread];

      switch (mv.pose) {
        case 'punch': {
          if (isRanged) {
            // Ranged palm/clap: gather both hands at the chest, then project together.
            const wind = [-f * 8 * s, 2 * s, -f * 18 * s, 8 * s];
            const strike = [...front(39 * s, 7 * s), ...front(32 * s, -8 * s)];
            hands = actionPose(wind, strike);
            lean += f * (phase === 1 ? 3 : -1) * s;
          } else if (ay < -0.42) {
            // Aimed-high punches become an uppercut: load low, then drive the
            // lead fist up in front of the face while the rear hand stays guarding.
            elbowDownPose = true;
            uppercutPose = true;
            const wind = [f * 10 * s, 18 * s, -f * 15 * s, 17 * s];
            // Punch up through the target: the lead fist finishes high and forward,
            // with the elbow kept below/in front of the shoulder rather than behind the head.
            const strike = [f * 22 * s, -33 * s, -f * 13 * s, 17 * s];
            hands = actionPose(wind, strike);
            lean += f * (phase === 0 ? -2 : phase === 1 ? 6 : 0) * s;
            crouch += phase === 0 ? 2 * s : 0;
          } else {
            // Ordinary shallow punches also keep the elbow below the fist.
            elbowDownPose = true;
            const wind = [-f * 14 * s, 5 * s, -f * 22 * s, 8 * s];
            // Extend the lead hand almost straight on the impact frames, while
            // keeping the rear fist in guard and the elbow bent slightly downward.
            const strike = [...front(44 * s), -f * 11 * s, 8 * s];

            hands = actionPose(wind, strike);
            lean += f * (phase === 1 ? 7 : -3) * s;
          }
          break;
        }
        case 'heavy': {
          if (isRanged) {
            // Heavy projectiles (e.g. boulders): draw the arms back, then throw forward.
            const wind = [-f * 21 * s, -24 * s, -f * 12 * s, -18 * s];
            const strike = [...front(42 * s, 5 * s), ...front(27 * s, -8 * s)];
            hands = actionPose(wind, strike);
            lean += f * (phase === 0 ? -6 : phase === 1 ? 10 : 1) * s;
          } else {
            const wind = [-f * 18 * s, -26 * s, -f * 10 * s, -22 * s];
            const strike = [...front(43 * s, 6 * s), ...front(32 * s, -8 * s)];
            hands = actionPose(wind, strike);
            lean += f * (phase === 0 ? -5 : phase === 1 ? 9 : 1) * s;
            crouch += phase === 1 ? 5 * s : 0;
          }
          break;
        }
        case 'swing': {
          // Original weapon swing: sweep the lead hand through a broad arc.
          // This stays move-specific instead of becoming a straight punch.
          const dir = act.alt ? -1 : 1;
          const a0 = this.aim - f * 1.6 * dir, a1 = this.aim + f * 0.9 * dir;
          const ang = phase === 0 ? a0 : lerp(a0, a1, easeOut(Math.min(1, phase === 1 ? u : 1)));
          hands = [Math.cos(ang) * 50 * s, Math.sin(ang) * 50 * s, -f * 14 * s, 12 * s];
          lean += f * (phase === 1 ? 5 : 0) * s;
          break;
        }
        case 'cast': {
          // Ranged casts gather both arms, then release with the off-hand bracing.
          const wind = [-f * 8 * s, -7 * s, -f * 18 * s, 5 * s];
          const strike = [...front(43 * s, 8 * s), ...front(29 * s, -9 * s)];
          hands = actionPose(wind, strike);
          const charge = phase === 0 ? Math.sin(u * Math.PI) * 2.2 : phase === 1 ? Math.sin(u * Math.PI * 2) * 1.2 : 0;
          hands[1] += charge * s;
          hands[3] -= charge * s * 0.55;
          lean += f * (phase === 1 ? 2.5 : 0) * s;
          break;
        }
        case 'channel': {
          const pulse = Math.sin(t * 12) * 1.7 * s;
          const spread = 8 * s + pulse;
          hands = [...front(40 * s, spread), ...front(36 * s, -spread)];
          lean -= f * 2.5 * s;
          break;
        }
        case 'raise': {
          const wind = [f * 8 * s, -24 * s, -f * 8 * s, -22 * s];
          const strike = [f * 14 * s, -43 * s, -f * 12 * s, -40 * s];
          hands = phase === 0 ? poseLerp(guard, wind, easeInOut(u)) :
            phase === 1 ? poseLerp(wind, strike, easeOut(clamp(u / 0.45, 0, 1))) :
            poseLerp(strike, guard, easeInOut(u));
          break;
        }
        case 'nova': {
          const wind = [f * 7 * s, 13 * s, -f * 6 * s, 16 * s];
          const strike = [f * 36 * s, -8 * s, -f * 36 * s, -8 * s];
          hands = actionPose(wind, strike);
          crouch += phase === 0 ? 6 * s : 0;
          break;
        }
        case 'dash': {
          const tuck = [-f * 29 * s, 12 * s, -f * 24 * s, 18 * s];
          const launch = [-f * 36 * s, 8 * s, -f * 30 * s, 14 * s];
          hands = phase === 2 ? poseLerp(launch, guard, easeInOut(u)) :
            poseLerp(tuck, launch, phase === 1 ? easeOut(u) : easeInOut(u));
          lean += f * 12 * s;
          break;
        }
        default: break;
      }

      // Keep ranged firing hands aligned with their shots. Only Gale's ordinary
      // palm strike gets the straight extension; swords and heavy melee retain
      // their own sweeping / loaded poses. High Gale punches stay uppercuts.
      const galePalm = act.el === 'wind' && mv.id === 'gust_palm' && !uppercutPose;
      if (phase === 1 && (isRanged || galePalm)) {
        straightAttack = true;
        if (!hands) hands = [f * 23 * s, 20 * s + bob, -f * 13 * s, 18 * s + bob];
        hands[0] = ax * 47.5 * s;
        hands[1] = ay * 47.5 * s;
      }

      // Ranged attacks use one active firing arm; let the rear arm hang relaxed
      // beside the torso throughout wind-up, shot, and recovery.
      if (isRanged) {
        rangedRelaxBack = true;
        if (!hands) hands = [f * 23 * s, 20 * s + bob, -f * 8 * s, 34 * s];
        hands[2] = -f * 8 * s;
        hands[3] = 34 * s;
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
      // Grounded stance: keep both hands around the torso, with the lead hand slightly forward.
      // Let the arms hang naturally during jumps instead of locking into idle guard.
      // Small counter-swings keep them loose without letting the hands fly across the body.
      hands = air
        ? [f * 12 * s + Math.sin(this.t * 3.2) * 2 * s, 30 * s, -f * 10 * s - Math.sin(this.t * 2.6) * 1.5 * s, 29 * s]
        : [f * 23 * s + sw, 20 * s + bob, -f * 13 * s - sw * 0.45, 18 * s + bob];
    }
    const setArm = (hi, ei, hx, hy) => {
      // Keep visual hand targets within arm reach, but allow real sweep distance
      // for weapon swings and heavy strikes.
      const rawLen = Math.hypot(hx, hy) || 1;
      const move = this.action && this.action.move;
      const meleeReach = move && move.kind === 'melee' && move.pose !== 'punch';
      const maxReach = straightAttack && hi === P.FHAND ? 47.5 * s : meleeReach ? 47.5 * s : 41 * s;
      if (rawLen > maxReach) { const k = maxReach / rawLen; hx *= k; hy *= k; }
      T[hi].x = nx + hx; T[hi].y = ny + hy;
      const mx = nx + hx / 2, my = ny + hy / 2;
      const l = Math.hypot(hx, hy) || 1;
      // Pick the elbow side deliberately: lead elbow bends forward/up, rear elbow
      // bends back/down. This gives the arms a readable L-shaped bend instead of
      // making both elbows fold to the same upside-down angle.
      let bx = -hy / l, by = hx / l;
      const leadArm = hi === P.FHAND;
      // During any melee punch, bias the lead elbow down and forward.
      // The old upward preference folded the arm above the wrist and across the head.
      const preferredX = rangedRelaxBack && !leadArm ? -f : elbowDownPose && leadArm ? f : leadArm ? -f : f;
      const preferredY = rangedRelaxBack && !leadArm ? 0.85 : elbowDownPose && leadArm ? 0.95 : -0.42;
      if (bx * preferredX + by * preferredY < 0) { bx = -bx; by = -by; }
      const armLen = 24 * s;
      const half = Math.min(armLen, l / 2);
      const bend = straightAttack && hi === P.FHAND ? 1.5 * s : Math.sqrt(Math.max(0, armLen * armLen - half * half));
      T[ei].x = mx + bx * bend; T[ei].y = my + by * bend;
    };
    setArm(P.FHAND, P.FELB, hands[0], hands[1]);
    setArm(P.BHAND, P.BELB, hands[2], hands[3]);
  }

  stepBody(dt, plats, forces) {
    const m = this.m, pts = this.pts, T = this.T, Tp = this.Tp;
    const g = BODY_G * dt * dt * (1 - 0.9 * m);
    const air = m < 0.5 ? 0.998 : 0.99;
    for (let i = 0; i < 11; i++) {
      const p = pts[i];
      let vx = (p.x - p.px) * air, vy = (p.y - p.py) * air;
      if (forces && m < 0.5) { const f = forces(p.x, p.y, this); vx += f.x * dt * dt; vy += f.y * dt * dt; }
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g;
      if (m > 0.01) {
        let k = MUSCLE[i] * m;
        const isArmPoint = i === P.FELB || i === P.FHAND || i === P.BELB || i === P.BHAND;
        let damping = MUSCLE_DAMP;
        if (isArmPoint && this.mode === 'active') {
          // Hands follow the animated targets firmly during combat and jumps,
          // but still go loose when the fighter is stunned or tumbling.
          const control = this.action ? 2.1 : !this.root.grounded ? 1.65 : 1.3;
          k = Math.min(this.action ? 0.56 : 0.46, k * control);
          damping += this.action ? 0.12 : !this.root.grounded ? 0.08 : 0.04;
        }
        const tvx = T[i].x - Tp[i].x, tvy = T[i].y - Tp[i].y;
        p.x += (T[i].x - p.x) * k - (vx - tvx) * damping * m;
        p.y += (T[i].y - p.y) * k - (vy - tvy) * damping * m;
      }
    }
    const s = this.s;
    const solve = (A, B, wa, wb, d0, d1, stiff) => {
      const dx = B.x - A.x, dy = B.y - A.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      const target = d < d0 ? d0 : d > d1 ? d1 : d;
      if (target === d) return;
      const k = ((d - target) / d) * stiff / (wa + wb);
      A.x += dx * k * wa; A.y += dy * k * wa;
      B.x -= dx * k * wb; B.y -= dy * k * wb;
    };
    const collide = this.mode !== 'active' || this.root.dropT <= 0;
    for (let it = 0; it < 6; it++) {
      for (let b = 0; b < SEGS.length; b++) {
        const ia = SEGS[b][0], ib = SEGS[b][1], L = BONE_LEN[b] * s;
        solve(pts[ia], pts[ib], INV_MASS[ia], INV_MASS[ib], L, L, 1);
      }
      for (const [ia, ib, lo, hi] of JOINT_LIMITS) solve(pts[ia], pts[ib], INV_MASS[ia], INV_MASS[ib], lo * s, hi * s, 0.6);
      if (collide && this.mode !== 'active') for (const p of pts) for (const pl of plats) { if (this.root.ghostTo && pl !== this.root.ghostTo) continue; landPoint(p, pl); solidPoint(p, pl); }
    }
    if (collide && this.mode === 'active') for (const i of [P.FFOOT, P.BFOOT, P.FKNEE, P.BKNEE]) for (const pl of plats) { if (this.root.ghostTo && pl !== this.root.ghostTo) continue; landPoint(pts[i], pl); }
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
  // flat, chunky mannequin: thick rounded limbs, no outlines, no faces
  draw(ctx, time) {
    const s = this.s, pts = this.pts, st = this.status;
    const fade = this.mode === 'dead' ? clamp(1 - (this.deadT - 4) / 1.2, 0, 1) : 1;
    if (fade <= 0) return;
    ctx.globalAlpha = fade * (this.invuln > 0 && this.isPlayer && !this.dash ? 0.55 + Math.sin(time * 30) * 0.25 : 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (this.cape) this.drawCape(ctx);

    const fl = this.flash;
    const body = fl > 0 ? mixHex(this.body, '#ffffff', fl) : this.body;
    const shade = fl > 0 ? mixHex(this.shade, '#ffffff', fl) : this.shade;
    const seg = (a, b, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w * s;
      ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
    };
    // back limbs in the shade tone
    seg(2, 9, 13, shade); seg(9, 10, 11, shade);
    seg(1, 5, 11, shade); seg(5, 6, 9.5, shade);
    // Simple solid-colour wrist bands: use the fighter's element colour, no gradients or trim.
    const cuff = (e, h, col) => {
      const brute = this.kind === 'brute';
      const E = pts[e], Hh = pts[h];
      const x1 = lerp(E.x, Hh.x, brute ? 0.43 : 0.56), y1 = lerp(E.y, Hh.y, brute ? 0.43 : 0.56);
      const x2 = lerp(E.x, Hh.x, 0.83), y2 = lerp(E.y, Hh.y, 0.83);
      ctx.strokeStyle = col || '#aeb8c8';
      ctx.lineWidth = (brute ? 15.5 : 11.5) * s;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    const bandColor = this.el === 'none' ? '#aeb8c8' : this.accent;
    cuff(P.BELB, P.BHAND, bandColor);
    // Small rounded hand endpoints clarify where the rear arms finish.
    ctx.fillStyle = shade;
    ctx.beginPath(); ctx.arc(pts[P.BHAND].x, pts[P.BHAND].y, 5.3 * s, 0, TAU); ctx.fill();
    // torso: thick capsule with a slightly narrower waist
    seg(1, 2, 22, body);
    // front leg
    seg(2, 7, 13.5, body); seg(7, 8, 11.5, body);
    // head: rounded block
    const hd = pts[P.HEAD];
    ctx.fillStyle = body;
    const hr = HEAD_R * s;
    ctx.beginPath(); ctx.roundRect(hd.x - hr, hd.y - hr * 1.05, hr * 2, hr * 2.1, hr * 0.8); ctx.fill();
    this.drawHeadgear(ctx, hd, time);
    // front arm on top
    seg(1, 3, 11, body); seg(3, 4, 9.5, body);
    cuff(P.FELB, P.FHAND, bandColor);
    // Keep the leading hand visibly attached to the forearm during fast attacks.
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(pts[P.FHAND].x, pts[P.FHAND].y, 5.8 * s, 0, TAU); ctx.fill();
    if (this.isPlayer && this.alive && this.el !== 'none') {
      ctx.globalCompositeOperation = 'lighter';
      Glow.draw(ctx, AURA[this.el], pts[P.FHAND].x, pts[P.FHAND].y, 16 * s, 0.55);
      ctx.globalCompositeOperation = 'source-over';
    }

    this.drawStatus(ctx, time, fade, seg, hd, hr);
    ctx.globalAlpha = 1;
  }

  /* status visuals: each effect reads at a glance and differs in shape, not just colour */
  drawStatus(ctx, time, fade, seg, hd, hr) {
    const s = this.s, pts = this.pts, st = this.status;
    const c = this.center();
    // poison: sickly tint on the limbs
    if (st.poison > 0) {
      ctx.globalAlpha = fade * 0.2 * Math.min(1, st.poison * 2);
      for (const [a, b] of SEGS) seg(a, b, 9, '#9be04a');
      ctx.globalAlpha = fade;
    }
    // soak: water sheen on the limbs and drips from the hands
    if (st.soak > 0) {
      ctx.globalAlpha = fade * 0.3 * Math.min(1, st.soak * 2);
      for (const [a, b] of SEGS) seg(a, b, 7, '#9fd8ff');
      ctx.globalAlpha = fade * 0.85;
      ctx.fillStyle = '#7cc8ff';
      for (const h of [P.FHAND, P.BHAND, P.HEAD]) {
        const q = pts[h], ph = (time * 1.6 + h * 0.37) % 1;
        const y = q.y + 6 * s + ph * 22 * s, r = 3.2 * s * (1 - ph * 0.5);
        ctx.beginPath(); ctx.moveTo(q.x, y - r * 2); ctx.quadraticCurveTo(q.x + r, y, q.x, y + r); ctx.quadraticCurveTo(q.x - r, y, q.x, y - r * 2); ctx.fill();
      }
      ctx.globalAlpha = fade;
    }
    // chill: frost rim on the limbs and slow drifting sparkles
    if (st.chill > 0 && st.freeze <= 0) {
      ctx.globalAlpha = fade * 0.45 * Math.min(1, st.chill * 2);
      for (const [a, b] of SEGS) seg(a, b, 5, '#e6f8ff');
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#e6f8ff'; ctx.lineWidth = 1.8;
      for (let i = 0; i < 3; i++) {
        const a = time * 1.3 + i * 2.1, x = c.x + Math.cos(a) * 26 * s, y = c.y + Math.sin(a * 1.4) * 40 * s, r = 4 * s;
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
      }
    }
    // freeze: faceted ice shell around the whole body
    if (st.freeze > 0) {
      const a = fade * clamp(st.freeze * 2, 0, 1);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      x0 -= 16 * s; x1 += 16 * s; y0 -= 22 * s; y1 += 8 * s;
      const mx = (x0 + x1) / 2, ch = (x1 - x0) * 0.22;
      const poly = [[x0 + ch, y0], [mx + ch * 0.4, y0 - 8 * s], [x1, y0 + ch], [x1 - 4 * s, y1 - ch], [x1 - ch, y1], [x0 + ch * 0.6, y1], [x0, y1 - ch * 1.2], [x0 + 3 * s, y0 + ch * 1.4]];
      ctx.globalAlpha = a * 0.45; ctx.fillStyle = '#bfeaff';
      ctx.beginPath(); poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#f2fbff'; ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.globalAlpha = a * 0.55; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); ctx.lineTo(mx, (y0 + y1) / 2); ctx.lineTo(poly[4][0], poly[4][1]);
      ctx.moveTo(mx, (y0 + y1) / 2); ctx.lineTo(poly[2][0], poly[2][1]); ctx.stroke();
      ctx.globalAlpha = a * 0.8; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0 + 8 * s, y0 + ch * 1.6); ctx.lineTo(x0 + 8 * s, y0 + ch * 2.6); ctx.stroke();
      ctx.globalAlpha = fade;
    }
    // root: thorny vines coiling up the legs
    if (st.root > 0) {
      ctx.globalAlpha = fade * Math.min(1, st.root * 3);
      for (const [a, b] of [[P.FKNEE, P.FFOOT], [P.BKNEE, P.BFOOT]]) {
        const A = pts[a], B = pts[b];
        ctx.strokeStyle = '#3f7a2e'; ctx.lineWidth = 4 * s;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const u = i / 12, w = Math.sin(u * 13 + time * 2) * 7 * s;
          const x = lerp(B.x, A.x, u) + w, y = lerp(B.y + 4 * s, A.y, u);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = '#7cc95a';
        for (let i = 1; i < 4; i++) {
          const u = i / 4, w = Math.sin(u * 13 + time * 2) * 7 * s, x = lerp(B.x, A.x, u) + w, y = lerp(B.y, A.y, u), d = i % 2 ? 1 : -1;
          ctx.beginPath(); ctx.ellipse(x + d * 5 * s, y, 5 * s, 2.4 * s, d * 0.6, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = fade;
    }
    // burn: a soft warm glow; the flames themselves are translucent particles (game.js)
    if (st.burn > 0) {
      ctx.globalCompositeOperation = 'lighter';
      Glow.draw(ctx, '#ff7a2a', c.x, c.y, 44 * s, 0.3 * Math.min(1, st.burn * 2) * fade);
      ctx.globalCompositeOperation = 'source-over';
    }
    // combo marks: crystal glint, radiant dazzle, void drain
    if (st.glint > 0) {
      ctx.globalAlpha = fade * Math.min(1, st.glint * 2); ctx.fillStyle = '#e6fffb';
      for (let i = 0; i < 3; i++) {
        const q = pts[[P.HEAD, P.FELB, P.BKNEE][i]], tw = Math.abs(Math.sin(time * 5 + i * 2.1)), r = (2 + tw * 4) * s;
        ctx.beginPath(); ctx.moveTo(q.x, q.y - r * 1.6); ctx.lineTo(q.x + r * 0.45, q.y); ctx.lineTo(q.x, q.y + r * 1.6); ctx.lineTo(q.x - r * 0.45, q.y); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = fade;
    }
    if (st.dazzle > 0) {
      ctx.globalAlpha = fade * Math.min(1, st.dazzle * 2) * 0.9; ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(hd.x, hd.y - hr * 1.6, hr * 1.1, hr * 0.35, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = fade;
    }
    if (st.drain > 0) {
      ctx.globalAlpha = fade * Math.min(1, st.drain * 2) * 0.55; ctx.strokeStyle = '#c08bff'; ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) { const a = time * 3 + i * Math.PI; ctx.beginPath(); ctx.arc(c.x, c.y, (30 + i * 8) * s, a, a + 1.6); ctx.stroke(); }
      ctx.globalAlpha = fade;
    }
    // shock: crackling arcs between joints
    if (st.shock > 0) {
      ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = '#fff27a'; ctx.lineWidth = 2;
      const seed = Math.floor(time * 18);
      for (let i = 0; i < 2; i++) {
        const A = pts[(seed + i * 5) % 11], B = pts[(seed * 3 + i * 7 + 4) % 11];
        ctx.beginPath(); ctx.moveTo(A.x, A.y);
        for (let j = 1; j < 5; j++) { const u = j / 5; ctx.lineTo(lerp(A.x, B.x, u) + Math.sin(seed * 7.1 + j * 3.3 + i) * 9 * s, lerp(A.y, B.y, u) + Math.cos(seed * 5.3 + j * 2.1) * 9 * s); }
        ctx.lineTo(B.x, B.y); ctx.stroke();
      }
      ctx.globalAlpha = fade;
    }
    // shields: a water bubble (Tide) or orbiting iron plates (Steel)
    if (this.shield > 0) {
      const cy = c.y - 10 * s, R = 72 * s;
      if (this.shieldEl === 'steel') {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const a = time * 1.2 + i * TAU / n, x = c.x + Math.cos(a) * R * 0.78, y = cy + Math.sin(a) * R * 0.95;
          ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
          ctx.globalAlpha = fade * 0.95; ctx.fillStyle = '#c9d2df';
          ctx.beginPath();
          for (let j = 0; j < 6; j++) { const b = j * TAU / 6; ctx.lineTo(Math.cos(b) * 13 * s, Math.sin(b) * 13 * s); }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#eef2f8'; ctx.beginPath(); ctx.arc(-3 * s, -3 * s, 4 * s, 0, TAU); ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = fade * 0.12; ctx.fillStyle = '#dfe5ee';
        ctx.beginPath(); ctx.arc(c.x, cy, R * 0.9, 0, TAU); ctx.fill();
      } else {
        const wob = Math.sin(time * 3) * 2 * s;
        const g = ctx.createRadialGradient(c.x, cy, R * 0.55, c.x, cy, R);
        g.addColorStop(0, 'rgba(124,200,255,0)'); g.addColorStop(0.8, 'rgba(124,200,255,0.18)'); g.addColorStop(1, 'rgba(170,225,255,0.45)');
        ctx.globalAlpha = fade; ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(c.x, cy, R + wob, R - wob, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(220,242,255,0.9)'; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(c.x, cy, R * 0.8, Math.PI * 1.1, Math.PI * 1.35); ctx.stroke();
        ctx.beginPath(); ctx.arc(c.x - R * 0.42, cy - R * 0.5, 3 * s, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      }
      ctx.globalAlpha = fade;
    }
  }

  drawHeadgear(ctx, hd, time) {
    const s = this.s, f = this.facing, hr = HEAD_R * s;
    if (this.isPlayer) {
      // wrapped band in the element colour with two trailing tails
      ctx.fillStyle = this.accent;
      ctx.fillRect(hd.x - hr, hd.y - hr * 0.55, hr * 2, 5 * s);
      ctx.strokeStyle = this.accent; ctx.lineWidth = 3.5 * s; ctx.lineCap = 'round';
      const wave = Math.sin(time * 6 + this.t) * 3 * s;
      ctx.beginPath();
      ctx.moveTo(hd.x - f * hr, hd.y - hr * 0.45);
      ctx.quadraticCurveTo(hd.x - f * (hr + 10 * s), hd.y - hr * 0.5 + wave, hd.x - f * (hr + 18 * s), hd.y - hr * 0.1 + wave);
      ctx.stroke();
      return;
    }
    if (this.kind === 'brute' || this.kind === 'boss') {
      // flat grey plates: helmet cap, shoulder and chest
      ctx.fillStyle = '#9a9a9a';
      ctx.beginPath(); ctx.roundRect(hd.x - hr - 2 * s, hd.y - hr * 1.15, hr * 2 + 4 * s, hr * 1.15, [hr * 0.9, hr * 0.9, 2 * s, 2 * s]); ctx.fill();
      const n = this.pts[P.NECK], pv = this.pts[P.PELVIS];
      ctx.strokeStyle = '#8c8c8c'; ctx.lineWidth = 24 * s;
      ctx.beginPath(); ctx.moveTo(n.x, n.y + 2 * s); ctx.lineTo(lerp(n.x, pv.x, 0.45), lerp(n.y, pv.y, 0.45)); ctx.stroke();
      ctx.fillStyle = '#a6a6a6';
      ctx.beginPath(); ctx.ellipse(n.x, n.y + 2 * s, 16 * s, 8 * s, 0, Math.PI, 0); ctx.fill();
    }
    if (this.kind === 'boss') {
      // tall element-coloured crest rising from the helmet
      ctx.fillStyle = this.accent;
      const by = hd.y - hr * 1.1;
      ctx.beginPath();
      ctx.moveTo(hd.x - 6 * s, by);
      ctx.lineTo(hd.x - f * 4 * s, by - 18 * s);
      ctx.lineTo(hd.x + 6 * s, by);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(hd.x - hr - 2 * s, hd.y - hr * 0.2, hr * 2 + 4 * s, 4 * s);
    } else if (this.kind === 'caster') {
      ctx.fillStyle = this.shade;
      ctx.beginPath();
      ctx.moveTo(hd.x - hr - 3 * s, hd.y + hr * 0.4);
      ctx.quadraticCurveTo(hd.x - hr * 0.4, hd.y - hr * 1.8, hd.x - f * hr * 0.9, hd.y - hr * 2.4);
      ctx.quadraticCurveTo(hd.x + hr * 0.6, hd.y - hr * 1.2, hd.x + hr + 3 * s, hd.y + hr * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = this.accent;
      ctx.fillRect(hd.x - hr - 1 * s, hd.y - hr * 0.1, hr * 2 + 2 * s, 3.5 * s);
    } else if (this.kind === 'grunt') {
      ctx.fillStyle = this.accent;
      ctx.fillRect(hd.x - hr, hd.y - hr * 0.55, hr * 2, 5 * s);
    }
  }

  drawCape(ctx) {
    const c = this.cape;
    ctx.fillStyle = this.capeColor || this.accent;
    ctx.beginPath();
    const w0 = 8 * this.s;
    const left = [], right = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const w = w0 * (1 - i / c.length * 0.4);
      left.push([c[i].x - dy / l * w, c[i].y + dx / l * w]);
      right.push([c[i].x + dy / l * w, c[i].y - dx / l * w]);
    }
    ctx.moveTo(left[0][0], left[0][1]);
    for (const p of left) ctx.lineTo(p[0], p[1]);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath(); ctx.fill();
  }
}

/* push a loose ragdoll point out of an island's tile rows through the nearest open
   face (top only on the first row), killing the velocity into that face. */
function solidPoint(p, pl) {
  if (!pl.solids || p.x <= pl.left || p.x >= pl.right) return;
  for (const q of pl.solids) {
    if (p.x <= q.l || p.x >= q.r || p.y <= q.t || p.y >= q.b) continue;
    const dl = p.x - q.l, dr = q.r - p.x, db = q.b - p.y, du = q === pl.solids[0] ? p.y - q.t : Infinity;
    const m = Math.min(dl, dr, db, du);
    if (m === du) { p.y = q.t; p.px = lerp(p.px, p.x, 0.5); p.py = p.y + Math.min(0, p.py - p.y) * 0.15; }
    else if (m === db) { p.y = q.b; p.py = p.y + Math.max(0, p.py - p.y) * 0.2; }
    else if (m === dl) { p.x = q.l; p.px = p.x + Math.max(0, p.px - p.x) * 0.2; }
    else { p.x = q.r; p.px = p.x + Math.min(0, p.px - p.x) * 0.2; }
    return;
  }
}

/* one-way platform contact for a single verlet point. The band below the
   top surface is treated as solid so points nudged slightly into the
   platform by the solver are pushed back up instead of falling through. */
function landPoint(p, pl) {
  if (p.x < pl.left || p.x > pl.right) return;
  if (p.y > pl.top && p.y < pl.top + 30 && p.py <= pl.prevTop + 14) {
    p.y = pl.top;
    p.px = lerp(p.px, p.x, 0.5);           // friction
    p.py = p.y + Math.min(0, p.py - p.y) * 0.15;
  }
}
