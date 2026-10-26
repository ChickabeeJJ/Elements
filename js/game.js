'use strict';
/* =========================================================================
   Game: the battle simulation and renderer. Owns the player, enemies,
   arrows, elemental effects and the wave/stage flow. UI talks to it through
   start/pause/quit/selectElement and receives results through hooks.
   ========================================================================= */

const GRAV = 1250;               // arrow gravity (world units / s^2)
const STEP = 1 / 120;            // fixed physics step
const JUMP_COST = 18;
const PLAYER_X = 250, PLAYER_Y = 655;

const Game = (() => {
  let canvas, ctx, dpr = 1;
  const view = { x0: 0, y0: 0, w: W, h: H, scale: 1, ox: 0, oy: 0, cw: 1, ch: 1 };
  const fx = new FX();
  const amb = new Ambience();
  let realmIdx = 0, realm = REALMS[0];
  let state = 'idle';            // idle | play | won | lost
  let paused = false;
  let mode = null, stageDef = null, waveIdx = -1, waveTimer = 0, endlessWaveNo = 0;
  let player = null, playerIsland = null;
  let enemies = [], islands = [], arrows = [], stuckArrows = [], pickups = [], orbs = [], wells = [], beams = [];
  let time = 0, timeScale = 1, slowmo = 0, hitstop = 0, shake = 0, hurtFlash = 0, healFlash = 0, acc = 0, endTimer = 0, realmFlash = 0;
  let run = null, aim = null, pStats = Save.playerStats(), pickupTimer = 8;
  let lastShotEl = null;
  const hooks = {};

  /* ------------------------------------------------------------ setup */
  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
    idleScene(0);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const scale = Math.min(cw / W, ch / H);
    view.scale = scale; view.cw = cw; view.ch = ch;
    view.ox = (cw - W * scale) / 2; view.oy = (ch - H * scale) / 2;
    view.x0 = -view.ox / scale; view.y0 = -view.oy / scale;
    view.w = cw / scale; view.h = ch / scale;
  }

  function setRealm(i) {
    realmIdx = i; realm = REALMS[i];
    amb.setRealm(realm, view);
    Sfx.setRealm(i);
    hooks.onRealm && hooks.onRealm(i);
  }

  function makePlayer() {
    const fig = new Figure({ x: PLAYER_X, y: PLAYER_Y, facing: 1, isPlayer: true, body: '#f7f2e7', shade: '#d6cab4', scale: 1.05 });
    const el = Save.elementOpen(Save.data.selected) ? Save.data.selected : 'wind';
    const p = { fig, hp: pStats.hp, maxHp: pStats.hp, st: pStats.stamina, maxSt: pStats.stamina, el, burn: 0, burnDps: 0, chill: 0, lowSt: 0 };
    fig.nockEl = el; fig.capeColor = ELEMENT_BY_ID[el].deep;
    return p;
  }

  function baseScene() {
    fx.clear();
    enemies = []; arrows = []; stuckArrows = []; pickups = []; orbs = []; wells = []; beams = [];
    playerIsland = new Island(PLAYER_X, PLAYER_Y, 250, { depth: 300, seed: 42, enter: 1 });
    islands = [playerIsland];
    pStats = Save.playerStats();
    player = makePlayer();
    aim = null; timeScale = 1; slowmo = 0; hitstop = 0; shake = 0; hurtFlash = 0; healFlash = 0; acc = 0;
  }

  /* calm backdrop for menus: the hero on their island + a distant sentry */
  function idleScene(r) {
    state = 'idle'; mode = null; paused = false;
    setRealm(r);
    baseScene();
    const isl = new Island(1260, 520, 150, { enter: 1, seed: 7 });
    islands.push(isl);
    const fig = new Figure({ x: isl.x, y: isl.y, facing: -1, body: '#2b2836', shade: '#1b1923', aura: AURA[realm.element], kind: 'archer' });
    enemies.push({ fig, island: isl, offX: 0, alive: true, hp: 1, maxHp: 1, el: realm.element, type: 'archer', decor: true, timer: 1e9, stats: enemyStats('archer', 0) });
  }

  function start(opts) {
    mode = opts.mode;
    paused = false;
    baseScene();
    run = { kills: 0, shots: 0, hits: 0, heads: 0, essence: 0, dmgTaken: 0, r: opts.r || 0, s: opts.s || 0, bestCombo: 0 };
    if (mode === 'stage') {
      stageDef = buildStage(opts.r, opts.s);
      setRealm(opts.r);
      waveIdx = -1;
    } else {
      stageDef = null;
      setRealm(0);
      endlessWaveNo = 0;
    }
    waveTimer = 0.9;
    pickupTimer = rand(7, 11);
    state = 'play';
    Platform.gameplayStart();
    hooks.onStart && hooks.onStart();
  }

  /* -------------------------------------------------------- enemies */
  function bodyColors() {
    return realm.id === 'void' ? ['#130e1e', '#0a0712'] : realm.id === 'storm' ? ['#191a2c', '#10111d'] : ['#2b2836', '#1b1923'];
  }

  function spawnEnemy(spec) {
    const t = ENEMY_TYPES[spec.type];
    const stats = enemyStats(spec.type, spec.d);
    const scale = spec.scale || t.scale;
    const isBoss = spec.type === 'boss';
    const w = isBoss ? 280 : spec.type === 'brute' ? 170 : rand(130, 155);
    const motion = spec.moving ? { ax: rand(10, 40), ay: rand(60, 110), speed: rand(0.8, 1.25), phase: rand(0, 6) } : null;
    const island = new Island(spec.x, spec.y, w, { enter: 0, motion, depth: isBoss ? 300 : undefined });
    islands.push(island);
    const [body, shade] = bodyColors();
    const fig = new Figure({ x: island.x, y: island.y, facing: -1, scale, body, shade, aura: AURA[spec.element], kind: spec.type });
    fig.nockEl = spec.element === 'none' ? 'none' : spec.element;
    fig.outline = rgba(AURA[spec.element], 0.55);
    const hp = Math.round(stats.hp * (spec.hpMul || 1));
    const e = {
      fig, island, offX: isBoss ? 30 : 0, hp, maxHp: hp, el: spec.element, type: spec.type, stats, alive: true,
      timer: rand(1.4, 2.4) + (isBoss ? 0.8 : 0), drawing: false, drawT: 0, boss: spec.boss || null, volley: 0, volleyT: 0,
      summoned: 0, leaveT: -1, d: spec.d,
    };
    enemies.push(e);
    if (isBoss) {
      hooks.onBoss && hooks.onBoss(e);
      shake = Math.max(shake, 10);
      Sfx.boom(1.4);
    }
    return e;
  }

  function aliveEnemies() { return enemies.filter(e => e.alive && !e.decor); }

  function solveAim(from, to, v, g) {
    const dx = to.x - from.x, dy = to.y - from.y;
    if (g <= 0) return Math.atan2(dy, dx);
    const X = Math.abs(dx), Y = -dy, v2 = v * v;
    const disc = v2 * v2 - g * (g * X * X + 2 * Y * v2);
    const theta = disc < 0 ? Math.PI / 4 : Math.atan((v2 - Math.sqrt(disc)) / (g * X));
    return dx >= 0 ? -theta : Math.PI + theta;
  }

  function enemyArrowParams(e) {
    const el = e.el === 'lightning' ? 'lightning' : e.el;
    const straight = el === 'lightning';
    return { el, v: straight ? 1500 : 1080, g: straight ? 0 : GRAV * (e.el === 'none' ? 1 : (ELEMENT_BY_ID[el] ? ELEMENT_BY_ID[el].grav : 1)) };
  }

  function updateEnemy(e, dt) {
    const fig = e.fig;
    fig.x = e.island.x + e.offX; fig.y = e.island.y;
    if (e.decor) {
      // menu sentry: idle aim toward the hero
      fig.aim = lerp(fig.aim, Math.PI + 0.2 + Math.sin(time * 0.6) * 0.08, 0.05);
      fig.update(dt, islands, null);
      return;
    }
    if (!e.alive) {
      fig.update(dt, islands, wellForce);
      if (e.leaveT >= 0) {
        e.leaveT += dt;
        if (e.leaveT > 1.3 && e.island.leave === 0) e.island.leave = 0.001;
      }
      return;
    }
    // damage over time
    if (fig.status.burn > 0) {
      damageEnemy(e, fig.status.burnDps * dt, { el: 'fire', silent: true, vel: { x: 0, y: -1 } });
      if (Math.random() < dt * 22) { const c = fig.center(); fx.add({ x: c.x + rand(-12, 12), y: c.y + rand(-30, 20), vy: -rand(60, 140), color: pick(['#ffb347', '#ff6a2a', '#ffd76a']), size: rand(5, 10), life: rand(0.3, 0.6) }); }
      if (!e.alive) return;
    }
    fig.update(dt, islands, null);
    if (fig.status.rooted > 0) e.island.t -= dt;   // roots pin moving platforms
    if (e.island.enter < 1) return;
    if (fig.status.frozen > 0) { e.drawing = false; fig.drawAmt = Math.max(0, fig.drawAmt - dt * 4); return; }

    const target = player.fig.alive ? player.fig.chest() : { x: PLAYER_X, y: PLAYER_Y - 80 };
    const hand = fig.bowHand();
    const ap = enemyArrowParams(e);
    const sol = solveAim(hand, target, ap.v, ap.g);

    if (e.volley > 0) {
      e.volleyT -= dt;
      fig.aim = sol; fig.drawAmt = 1;
      if (e.volleyT <= 0) { e.volley--; e.volleyT = 0.17; enemyRelease(e, sol + rand(-0.06, 0.06)); }
      if (e.volley === 0) fig.drawAmt = 0;
      return;
    }

    if (!e.drawing) {
      fig.aim += angDiff(fig.aim, sol) * (1 - Math.exp(-2 * dt));
      fig.drawAmt = Math.max(0, fig.drawAmt - dt * 3);
      if (state === 'play' && player.fig.alive) e.timer -= dt;
      if (e.timer <= 0) { e.drawing = true; e.drawT = 0; Sfx.draw(); }
    } else {
      e.drawT += dt;
      const drawTime = e.type === 'boss' ? 1.0 : e.type === 'scout' ? 0.6 : 0.8;
      fig.drawAmt = Math.min(1, e.drawT / drawTime);
      fig.aim += angDiff(fig.aim, sol) * (1 - Math.exp(-12 * dt));
      if (e.drawT >= drawTime + 0.15) {
        e.drawing = false;
        e.timer = e.stats.interval * rand(0.8, 1.25);
        if (e.type === 'mage') { castOrb(e); fig.drawAmt = 0; }
        else if (e.type === 'boss') { e.volley = 1 + Math.min(2, Math.floor(realmIdx / 2)); e.volleyT = 0.17; enemyRelease(e, sol); }
        else { enemyRelease(e, sol); fig.drawAmt = 0; }
      }
    }
  }

  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 0.5; }

  function enemyRelease(e, ang) {
    const ap = enemyArrowParams(e);
    const a = ang + gauss() * e.stats.aimErr;
    const v = ap.v * (1 + gauss() * e.stats.powErr);
    const h = e.fig.bowHand();
    arrows.push(newArrow(h.x + Math.cos(a) * 30, h.y + Math.sin(a) * 30, Math.cos(a) * v, Math.sin(a) * v, ap.el, 'enemy', e.stats.dmg, ap.g, e));
    Sfx.shoot(ap.el === 'none' ? 'wind' : ap.el);
  }

  function castOrb(e) {
    const h = e.fig.bowHand();
    const col = AURA[e.el];
    orbs.push({ x: h.x, y: h.y, vx: -220, vy: -160, el: e.el, color: col, dmg: e.stats.dmg * 1.2, life: 7, src: e });
    fx.burst(h.x, h.y, col, 12, 200);
    Sfx.wellHum();
  }

  /* --------------------------------------------------------- arrows */
  function newArrow(x, y, vx, vy, el, owner, dmg, g, src) {
    return { x, y, px: x, py: y, vx, vy, el, owner, dmg, g, src, life: el === 'lightning' ? 1.3 : 6, trail: [], dead: false };
  }

  function playerFire(power) {
    const el = ELEMENT_BY_ID[player.el];
    if (player.st < el.cost) { player.lowSt = 0.6; Sfx.denied(); hooks.onLowStamina && hooks.onLowStamina(); return; }
    player.st -= el.cost;
    const fig = player.fig;
    const a = fig.aim;
    const h = fig.bowHand();
    let v = lerp(520, 1480, power) * el.speed;
    if (el.id === 'lightning') v = lerp(1900, 2500, power);
    const g = GRAV * el.grav;
    const dmg = el.dmg * pStats.dmgMul;
    const n = el.split || 1;
    for (let i = 0; i < n; i++) {
      const aa = a + (i - (n - 1) / 2) * (el.spread || 0);
      arrows.push(newArrow(h.x + Math.cos(aa) * 30, h.y + Math.sin(aa) * 30, Math.cos(aa) * v, Math.sin(aa) * v, el.id, 'player', dmg, g, null));
    }
    run.shots++;
    Save.data.stats.shots++;
    lastShotEl = el.id;
    Sfx.shoot(el.id);
    fx.burst(h.x, h.y, el.deep, 6, 160, { life: 0.25 });
    hooks.onShot && hooks.onShot();
  }

  function stepArrows(dt) {
    for (const a of arrows) {
      if (a.dead) continue;
      a.life -= dt;
      a.px = a.x; a.py = a.y;
      a.vy += a.g * dt;
      // void wells bend arrows that pass near them
      for (const w of wells) {
        const dx = w.x - a.x, dy = w.y - a.y, d = Math.hypot(dx, dy);
        if (d < w.r && d > 1) {
          const f = (a.owner === 'enemy' ? 2.6 : 0.6) * w.pull * (1 - d / w.r);
          a.vx += (dx / d) * f * dt; a.vy += (dy / d) * f * dt;
          if (a.owner === 'enemy' && d < 34) { a.dead = true; fx.burst(a.x, a.y, '#c08bff', 8, 120); }
        }
      }
      a.x += a.vx * dt; a.y += a.vy * dt;
      if (a.life <= 0 || a.x < view.x0 - 300 || a.x > view.x0 + view.w + 300 || a.y > H + 400 || a.y < -1500) { a.dead = true; continue; }
      collideArrow(a);
    }
  }

  function collideArrow(a) {
    const ax = a.px, ay = a.py, bx = a.x, by = a.y;
    if (a.owner === 'player') {
      // pickups first: they float in the open
      for (const p of pickups) {
        if (p.dead) continue;
        if (segPointDist(ax, ay, bx, by, p.x, p.y).d < 26) { collectPickup(p); }
      }
      for (const o of orbs) {
        if (o.dead) continue;
        if (segPointDist(ax, ay, bx, by, o.x, o.y).d < 22) {
          o.dead = true; fx.burst(o.x, o.y, o.color, 18, 260); fx.ring(o.x, o.y, o.color, 50);
          fx.text(o.x, o.y - 20, 'Blocked!', '#ffffff', 22); Sfx.zap(); grantEssence(1, o.x, o.y);
          if (a.el !== 'lightning') { a.dead = true; return; }
        }
      }
      let best = null;
      for (const e of enemies) {
        if (e.decor || a.src === e) continue;
        if (!e.alive && e.fig.deadT > 2.5) continue;
        if (a.hitSet && a.hitSet.has(e)) continue;
        const h = e.fig.hitTest(ax, ay, bx, by, a.el === 'earth' ? 4 : 0);
        if (h && (!best || h.t < best.h.t)) best = { e, h };
      }
      const islT = islandHit(a);
      if (best && (islT == null || best.h.t <= islT)) {
        hitEnemy(a, best.e, best.h);
        return;
      }
      if (islT != null) arrowToIsland(a, islT);
    } else {
      const f = player.fig;
      if (f.alive) {
        const h = f.hitTest(ax, ay, bx, by, 0);
        const islT = islandHit(a);
        if (h && (islT == null || h.t <= islT)) { hitPlayer(a, h); return; }
      }
      const islT = islandHit(a);
      if (islT != null) arrowToIsland(a, islT);
    }
  }

  function islandHit(a) {
    let best = null;
    for (const isl of islands) {
      if (a.src && a.src.island === isl && a.life > 5.8) continue;
      const t = isl.hitSegment(a.px, a.py, a.x, a.y);
      if (t != null && (best == null || t < best)) best = t;
    }
    return best;
  }

  function arrowToIsland(a, t) {
    const x = lerp(a.px, a.x, t), y = lerp(a.py, a.y, t);
    a.dead = true;
    const isl = islands.find(i => i.hitSegment(a.px, a.py, a.x, a.y) != null);
    if (a.el !== 'lightning' && isl) {
      stuckArrows.push({ isl, rx: x - isl.x, ry: y - isl.y, ang: Math.atan2(a.vy, a.vx), el: a.el, life: 7 });
      if (stuckArrows.length > 60) stuckArrows.shift();
    }
    Sfx.thud();
    fx.burst(x, y, realm.top, 5, 120, { add: false, kind: 'chunk', g: 1200, size: 3, life: 0.5 });
    if (a.owner === 'player') impactEffects(a, x, y, null);
    else if (a.el === 'fire') fx.burst(x, y, '#ff8a3d', 10, 160);
  }

  /* ----------------------------------------------------------- damage */
  function hitEnemy(a, e, h) {
    const el = ELEMENT_BY_ID[a.el];
    const fig = e.fig;
    const px = h.px, py = h.py;
    if (!e.alive) {
      // poking a ragdoll is always allowed
      fig.push(a.vx * 0.45 * el.knock, a.vy * 0.45 * el.knock, SEGS[h.seg][1], 0.4);
      fig.attachArrow(h, Math.atan2(a.vy, a.vx), a.el, 56);
      a.dead = true;
      Sfx.thud();
      return;
    }
    run.hits++;
    let mul = affinityMul(e.el, a.el);
    let dmg = a.dmg * mul;
    let tag = null;
    if (h.head) { dmg *= e.type === 'boss' || e.type === 'brute' ? 1.5 : 2; run.heads++; Save.data.stats.headshots++; tag = 'HEADSHOT'; }
    if (a.el === 'earth' && fig.status.frozen > 0) { dmg *= el.shatter; fig.status.frozen = 0; tag = 'SHATTER'; fx.chunks(px, py, '#d8f6ff', 16, 420, 9); }
    if (a.el === 'lightning' && fig.status.soaked > 0) { dmg *= 2; tag = 'OVERLOAD'; }
    const vel = { x: a.vx, y: a.vy };

    if (a.el !== 'lightning') fig.attachArrow(h, Math.atan2(a.vy, a.vx), a.el, 56);
    fig.hitFlinch(a.vx, a.vy, el.knock);

    // statuses before damage so kills keep the look
    if (el.burn) { fig.status.burn = el.burn.dur; fig.status.burnDps = el.burn.dps * pStats.dmgMul * mul; }
    if (el.freeze) fig.status.frozen = e.type === 'boss' ? el.freeze * 0.4 : el.freeze;
    if (el.soak) fig.status.soaked = el.soak;
    if (el.root) fig.status.rooted = el.root;
    if (el.leech) healPlayer(dmg * el.leech, true);

    Sfx.hit(a.el, h.head);
    fx.burst(px, py, el.deep, 10, 240);
    fx.burst(px, py, '#ffffff', 4, 180, { life: 0.2 });
    if (mul > 1) fx.text(px + 26, py - 46, 'WEAK!', '#ffe066', 20, { dur: 0.9 });
    if (mul < 1) fx.text(px + 26, py - 46, 'RESIST', '#a7adbd', 18, { dur: 0.9 });
    if (tag) { fx.text(px, py - 74, tag, tag === 'HEADSHOT' ? '#ff6b6b' : el.color, 30, { dur: 1.1 }); hitstop = Math.max(hitstop, 0.06); }
    damageEnemy(e, dmg, { el: a.el, vel, head: h.head, hitIdx: SEGS[h.seg][1], px, py });
    a.dead = true;
    if (a.el === 'lightning') {
      // lightning keeps going through
      a.dead = false;
      a.hitSet = a.hitSet || new Set();
      a.hitSet.add(e);
    }
    impactEffects(a, px, py, e);
  }

  function damageEnemy(e, amount, o) {
    if (!e.alive || amount <= 0) return;
    e.hp -= amount;
    if (!o.silent) {
      const c = o.px != null ? { x: o.px, y: o.py } : e.fig.chest();
      const col = o.head ? '#ff6b6b' : '#ffffff';
      fx.text(c.x + rand(-10, 10), c.y - 30, Math.max(1, Math.round(amount)), col, o.head ? 34 : 26);
      shake = Math.max(shake, o.head ? 7 : 4);
    }
    if (e.boss && e.hp > 0) {
      const ratio = e.hp / e.maxHp;
      if (ratio < 0.66 && e.summoned === 0) { e.summoned = 1; summon(e, 1); }
      else if (ratio < 0.33 && e.summoned === 1) { e.summoned = 2; summon(e, 2); }
    }
    if (e.hp <= 0) killEnemy(e, o.vel || { x: -1, y: -1 }, o.hitIdx, o.head);
  }

  function summon(boss, n) {
    const slots = [[1060, 380], [1120, 690], [1480, 330]];
    for (let i = 0; i < n; i++) {
      const [x, y] = slots[(boss.summoned + i) % slots.length];
      spawnEnemy({ type: 'archer', element: boss.el, x, y, d: boss.d });
    }
    fx.text(boss.fig.head().x, boss.fig.head().y - 80, 'Reinforcements!', AURA[boss.el], 26, { dur: 1.4 });
  }

  function killEnemy(e, vel, hitIdx, head) {
    e.alive = false;
    e.hp = 0;
    const l = Math.hypot(vel.x, vel.y) || 1;
    const k = clamp(l, 400, 1600) * 0.45;
    e.fig.kill({ x: (vel.x / l) * k, y: (vel.y / l) * k - 120 }, hitIdx != null ? hitIdx : 2, e.island.vx, e.island.vy);
    e.leaveT = 0;
    const c = e.fig.center();
    const col = AURA[e.el];
    fx.burst(c.x, c.y, col, 22, 320);
    fx.ring(c.x, c.y, col, 90, 0.45);
    fx.add({ kind: 'bow', x: e.fig.bowHand().x, y: e.fig.bowHand().y, vx: rand(-80, 80), vy: -260, g: 1500, vr: rand(-6, 6), color: '#a07a4a', life: 1.6, add: false });
    run.kills++;
    Save.data.stats.kills++;
    const reward = e.type === 'boss' ? 40 : e.type === 'brute' ? 5 : 3;
    grantEssence(reward + (head ? 2 : 0), c.x, c.y - 60);
    Sfx.kill();
    hitstop = Math.max(hitstop, 0.07);
    shake = Math.max(shake, e.type === 'boss' ? 22 : 9);
    if (e.type === 'boss') { Sfx.boom(2); fx.ring(c.x, c.y, col, 260, 0.8, 14); slowmo = 1.6; }
    hooks.onKill && hooks.onKill(e);
    if (aliveEnemies().length === 0) waveCleared();
  }

  function grantEssence(n, x, y) {
    n = Math.round(n);
    run.essence += n;
    fx.text(x, y, '+' + n, '#ffd76a', 22, { dur: 1.2, vy: -50 });
  }

  function hitPlayer(a, h) {
    const p = player, fig = p.fig;
    let dmg = a.dmg * pStats.armor * (h.head ? 1.5 : 1);
    fig.attachArrow(h, Math.atan2(a.vy, a.vx), a.el, 56);
    fig.hitFlinch(a.vx, a.vy, 1.2);
    a.dead = true;
    if (a.el === 'fire') { p.burn = 3; p.burnDps = 3 + a.dmg * 0.12; }
    if (a.el === 'frost') { p.chill = 2.5; fig.status.frozen = 0.35; }
    if (a.el === 'void') p.st = Math.max(0, p.st - 20);
    if (a.el === 'nature' && a.src && a.src.alive) { a.src.hp = Math.min(a.src.maxHp, a.src.hp + dmg * 0.5); fx.text(a.src.fig.head().x, a.src.fig.head().y - 40, '+' + Math.round(dmg * 0.5), '#9ae66e', 20); }
    fx.burst(h.px, h.py, '#ff4a5a', 12, 260);
    fx.burst(h.px, h.py, AURA[a.src ? a.src.el : 'none'], 8, 200);
    if (h.head) fx.text(h.px, h.py - 60, 'OUCH!', '#ff6b6b', 26);
    damagePlayer(dmg, { x: a.vx, y: a.vy }, SEGS[h.seg][1]);
  }

  function damagePlayer(dmg, vel, hitIdx) {
    const p = player;
    if (!p.fig.alive) return;
    p.hp -= dmg;
    run.dmgTaken += dmg;
    hurtFlash = Math.min(1, hurtFlash + 0.55);
    shake = Math.max(shake, 10);
    Sfx.hurt();
    const c = p.fig.chest();
    fx.text(c.x, c.y - 50, '-' + Math.round(dmg), '#ff8a8a', 26);
    if (p.hp <= 0) {
      p.hp = 0;
      const l = Math.hypot(vel.x, vel.y) || 1;
      p.fig.kill({ x: (vel.x / l) * 520, y: (vel.y / l) * 520 - 200 }, hitIdx != null ? hitIdx : 2);
      fx.add({ kind: 'bow', x: p.fig.bowHand().x, y: p.fig.bowHand().y, vx: rand(-80, 80), vy: -260, g: 1500, vr: rand(-6, 6), color: '#e8b04a', life: 1.6, add: false });
      aim = null;
      lose();
    }
  }

  function healPlayer(n, quiet) {
    const p = player;
    if (!p.fig.alive || n <= 0) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    const got = p.hp - before;
    if (got >= 1) {
      const c = p.fig.chest();
      fx.text(c.x + 20, c.y - 70, '+' + Math.round(got), '#9ae66e', quiet ? 20 : 28);
      healFlash = 0.5;
    }
  }

  /* --------------------------------------------- elemental area effects */
  function impactEffects(a, x, y, primary) {
    const el = ELEMENT_BY_ID[a.el];
    if (!el) return;
    if (el.splash) {
      fx.burst(x, y, '#ffb347', 26, 340); fx.burst(x, y, '#ff5a1f', 14, 200);
      fx.ring(x, y, '#ff8a3d', el.splash.r, 0.35);
      for (let i = 0; i < 6; i++) fx.add({ kind: 'smoke', x: x + rand(-20, 20), y: y + rand(-20, 20), vy: -rand(20, 60), color: '#4a3a3a', size: rand(14, 24), life: rand(0.6, 1.1), add: false });
      Sfx.boom(0.5);
      for (const e of aliveEnemies()) {
        if (e === primary) continue;
        const c = e.fig.center();
        if (dist(x, y, c.x, c.y) < el.splash.r + 30) {
          e.fig.status.burn = el.burn.dur; e.fig.status.burnDps = el.burn.dps * pStats.dmgMul;
          damageEnemy(e, el.splash.dmg * pStats.dmgMul * affinityMul(e.el, 'fire'), { el: 'fire', vel: { x: c.x - x, y: c.y - y } });
        }
      }
      shake = Math.max(shake, 7);
    }
    if (a.el === 'earth') {
      fx.chunks(x, y, '#b08a66', 12, 420, 8);
      fx.ring(x, y, '#d9b38c', 70, 0.3);
      shake = Math.max(shake, 9);
    }
    if (a.el === 'frost') {
      fx.burst(x, y, '#c9f2ff', 18, 220);
      fx.chunks(x, y, '#e6fbff', 7, 260, 5);
    }
    if (a.el === 'water') {
      for (let i = 0; i < 10; i++) fx.add({ kind: 'drop', x, y, vx: rand(-180, 180), vy: rand(-320, -60), g: 1400, color: '#7cc8ff', size: rand(2, 4), life: rand(0.4, 0.8), add: false });
    }
    if (a.el === 'nature') {
      for (let i = 0; i < 8; i++) fx.add({ kind: 'leaf', x, y, vx: rand(-160, 160), vy: rand(-220, -40), g: 300, drag: 1.5, vr: rand(-8, 8), color: pick(['#9ae66e', '#5fbf4a', '#c3f08e']), size: rand(4, 7), life: rand(0.8, 1.4), add: false });
    }
    if (el.chain && primary) {
      let from = primary, n = el.chain.n;
      const hit = new Set([primary]);
      while (n-- > 0) {
        const fc = from.fig.center();
        let best = null, bd = el.chain.r;
        for (const e of aliveEnemies()) {
          if (hit.has(e)) continue;
          const c = e.fig.center(), d = dist(fc.x, fc.y, c.x, c.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        hit.add(best);
        const c = best.fig.center();
        fx.arc(fc.x, fc.y, c.x, c.y, '#c49bff', 0.3);
        let dmg = a.dmg * el.chain.mul * affinityMul(best.el, 'lightning');
        if (best.fig.status.soaked > 0) dmg *= 2;
        damageEnemy(best, dmg, { el: 'lightning', vel: { x: c.x - fc.x, y: c.y - fc.y } });
        from = best;
      }
      // chained bolts also snag pickups nearby
      for (const p of pickups) if (!p.dead && dist(x, y, p.x, p.y) < el.chain.r) { fx.arc(x, y, p.x, p.y, '#fff27a'); collectPickup(p); }
    }
    if (a.el === 'lightning') { fx.burst(x, y, '#fff27a', 14, 300, { kind: 'spark' }); }
    if (el.well) {
      wells.push({ x, y, t: 0, dur: el.well.dur, r: el.well.r, dps: el.well.dps * pStats.dmgMul, pull: el.well.pull });
      Sfx.wellHum();
    }
    if (el.beams) {
      for (let i = 0; i < el.beams.n; i++) {
        beams.push({ t: 0.18 + i * el.beams.delay, x: x + (i === 0 ? 0 : rand(-el.beams.spread, el.beams.spread)), y, dmg: el.beams.dmg * pStats.dmgMul });
      }
      fx.ring(x, y, '#fff3b0', 60, 0.4);
    }
  }

  function wellForce(px, py) {
    let fx_ = 0, fy_ = 0;
    for (const w of wells) {
      const dx = w.x - px, dy = w.y - py, d = Math.hypot(dx, dy);
      if (d < w.r * 1.3 && d > 4) {
        const f = w.pull * (1 - d / (w.r * 1.3)) * 1.4;
        fx_ += (dx / d) * f; fy_ += (dy / d) * f - RAG_G * 0.6 * (1 - d / (w.r * 1.3));
      }
    }
    return { x: fx_, y: fy_ };
  }

  function updateWells(dt) {
    for (let i = wells.length - 1; i >= 0; i--) {
      const w = wells[i];
      w.t += dt;
      if (w.t > w.dur) {
        fx.ring(w.x, w.y, '#c08bff', 120, 0.4, 10);
        fx.burst(w.x, w.y, '#c08bff', 20, 300);
        wells.splice(i, 1);
        continue;
      }
      for (const e of aliveEnemies()) {
        const c = e.fig.center();
        const d = dist(w.x, w.y, c.x, c.y);
        if (d < w.r) {
          const k = 1 - d / w.r * 0.5;
          damageEnemy(e, w.dps * k * dt * affinityMul(e.el, 'void'), { el: 'void', silent: true, vel: { x: w.x - c.x, y: w.y - c.y } });
          e.fig.hitFlinch(w.x - c.x, w.y - c.y, dt * 6);
        }
      }
      for (const p of pickups) {
        const d = dist(w.x, w.y, p.x, p.y);
        if (d < w.r) { p.x += (w.x - p.x) * dt * 2; p.y += (w.y - p.y) * dt * 2; if (d < 30) collectPickup(p); }
      }
      if (Math.random() < 0.9) {
        const ang = rand(0, TAU), r = rand(w.r * 0.4, w.r);
        fx.add({ x: w.x + Math.cos(ang) * r, y: w.y + Math.sin(ang) * r, vx: -Math.cos(ang) * r * 2 - Math.sin(ang) * 200, vy: -Math.sin(ang) * r * 2 + Math.cos(ang) * 200, color: pick(['#c08bff', '#7a4ae0', '#ffffff']), size: rand(3, 7), life: 0.45, drag: 1 });
      }
    }
  }

  function updateBeams(dt) {
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.t -= dt;
      if (b.t > 0) continue;
      beams.splice(i, 1);
      // land on whatever is under the column: an enemy if there is one
      let gy = b.y + 40;
      for (const e of aliveEnemies()) {
        const c = e.fig.center();
        if (Math.abs(c.x - b.x) < 38 * e.fig.s) {
          gy = Math.max(gy, e.island.y);
          damageEnemy(e, b.dmg * affinityMul(e.el, 'light'), { el: 'light', vel: { x: 0, y: 600 } });
        }
      }
      for (const o of orbs) if (Math.abs(o.x - b.x) < 30) o.dead = true;
      fx.add({ kind: 'beam', x: b.x, y: gy, color: '#ffe48a', size: 26, life: 0.45 });
      fx.burst(b.x, gy, '#fff3b0', 12, 260);
      Sfx.beam();
      shake = Math.max(shake, 4);
    }
  }

  /* --------------------------------------------------------- pickups */
  const PICKUPS = {
    heal: { color: '#ff7a8a', label: 'Health', glyph: 'heart' },
    stamina: { color: '#62b6ff', label: 'Stamina', glyph: 'bolt' },
    essence: { color: '#ffd76a', label: 'Essence', glyph: 'gem' },
  };
  function spawnPickup() {
    const r = Math.random();
    const type = r < 0.42 ? 'heal' : r < 0.75 ? 'stamina' : 'essence';
    pickups.push({ type, x: view.x0 + view.w + 40, y: rand(130, 330), baseY: 0, vx: -rand(55, 85), t: rand(0, 6), dead: false });
    pickups[pickups.length - 1].baseY = pickups[pickups.length - 1].y;
  }

  function collectPickup(p) {
    if (p.dead) return;
    p.dead = true;
    const def = PICKUPS[p.type];
    fx.burst(p.x, p.y, def.color, 24, 300);
    fx.ring(p.x, p.y, def.color, 70, 0.4);
    Sfx.pickup();
    if (p.type === 'heal') healPlayer(player.maxHp * 0.3);
    else if (p.type === 'stamina') { player.st = player.maxSt; fx.text(p.x, p.y - 30, 'Stamina full!', def.color, 24); }
    else grantEssence(8, p.x, p.y - 30);
  }

  /* --------------------------------------------------------- waves */
  function waveCleared() {
    if (state !== 'play') return;
    if (mode === 'stage' && waveIdx >= stageDef.waves.length - 1) win();
    else waveTimer = 1.1;
  }

  function nextWave() {
    if (mode === 'stage') {
      waveIdx++;
      for (const spec of stageDef.waves[waveIdx]) spawnEnemy(spec);
      hooks.onWave && hooks.onWave(waveIdx, stageDef.waves.length);
    } else {
      const w = endlessWave(run.kills, endlessWaveNo++);
      if (w.realm !== realmIdx) { setRealm(w.realm); realmFlash = 1; hooks.onToast && hooks.onToast(REALMS[w.realm].name); }
      for (const spec of w.wave) spawnEnemy(spec);
    }
    // old islands that have fallen away are recycled
    islands = islands.filter(i => i === playerIsland || i.leave < 2.5);
    enemies = enemies.filter(e => e.alive || e.fig.deadT < 6.5);
  }

  function win() {
    state = 'won';
    endTimer = 2.1;
    slowmo = Math.max(slowmo, 1.3);
    Sfx.win();
    Platform.happytime();
  }

  function lose() {
    state = 'lost';
    endTimer = 2.0;
    slowmo = 1.2;
    Sfx.lose();
  }

  function finish() {
    Platform.gameplayStop();
    const hpRatio = player.hp / player.maxHp;
    const res = {
      mode, won: state === 'won', r: run.r, s: run.s, kills: run.kills, shots: run.shots, hits: run.hits, heads: run.heads,
      accuracy: run.shots ? Math.min(1, run.hits / run.shots) : 0, essence: run.essence, stars: 0, unlocked: null, firstClear: false, best: false,
    };
    if (mode === 'stage' && res.won) {
      res.stars = hpRatio >= 0.7 ? 3 : hpRatio >= 0.35 ? 2 : 1;
      const rec = Save.recordClear(run.r, run.s, res.stars);
      res.firstClear = rec.firstClear;
      const bonus = 15 + run.r * 8 + (rec.firstClear ? 25 : 0) + rec.newStars * 10;
      res.bonus = bonus;
      res.essence += bonus;
      if (rec.firstClear) res.unlocked = elementUnlockedBy(run.r, run.s);
    }
    if (mode === 'endless') {
      res.best = run.kills > Save.data.endlessBest;
      if (res.best) Save.data.endlessBest = run.kills;
      res.bestKills = Save.data.endlessBest;
    }
    Save.data.essence += res.essence;
    Save.save();
    hooks.onEnd && hooks.onEnd(res);
  }

  /* abandon from the pause menu: keep what was earned */
  function quit() {
    if (run && (state === 'play' || state === 'won' || state === 'lost')) {
      Save.data.essence += run.essence;
      if (mode === 'endless' && run.kills > Save.data.endlessBest) Save.data.endlessBest = run.kills;
      Save.save();
    }
    Platform.gameplayStop();
    run = null;
    idleScene(realmIdx);
  }

  /* ---------------------------------------------------------- input */
  function screenToWorld(sx, sy) { return { x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale }; }
  function maxDrag() { return clamp(Math.min(view.cw, view.ch) * 0.3, 110, 240); }

  function pointerDown(sx, sy) {
    if (state !== 'play' || paused || !player.fig.alive) return false;
    aim = { sx, sy, cx: sx, cy: sy, power: 0 };
    return true;
  }
  function pointerMove(sx, sy) {
    if (!aim) return;
    aim.cx = sx; aim.cy = sy;
    const dx = aim.sx - sx, dy = aim.sy - sy;
    const len = Math.hypot(dx, dy);
    const prev = aim.power;
    aim.power = clamp((len - 10) / maxDrag(), 0, 1);
    if (len > 12) {
      player.fig.aim = Math.atan2(dy, dx);
      player.fig.facing = dx >= 0 ? 1 : -1;
    }
    if (prev < 0.15 && aim.power >= 0.15) Sfx.draw();
  }
  function pointerUp() {
    if (!aim) return;
    const p = aim.power;
    aim = null;
    if (state !== 'play' || paused || !player.fig.alive) return;
    if (p >= 0.15) playerFire(p);
    else Sfx.cancel();
  }
  function cancelAim() { if (aim) { aim = null; Sfx.cancel(); } }

  function jump() {
    if (state !== 'play' || paused || !player.fig.alive) return;
    if (player.st < JUMP_COST) { player.lowSt = 0.6; Sfx.denied(); return; }
    if (player.fig.jump(1)) {
      player.st -= JUMP_COST;
      Sfx.jump();
      const f = player.fig;
      fx.burst(f.x, f.y, '#ffffff', 10, 160, { life: 0.3 });
    }
  }

  function selectElement(id) {
    if (!Save.elementOpen(id)) { Sfx.denied(); return false; }
    if (!player) return false;
    player.el = id;
    player.fig.nockEl = id;
    player.fig.capeColor = ELEMENT_BY_ID[id].deep;
    Save.data.selected = id;
    if (state === 'play') {
      const h = player.fig.bowHand();
      fx.burst(h.x, h.y, ELEMENT_BY_ID[id].color, 10, 140, { life: 0.35 });
    }
    hooks.onElement && hooks.onElement(id);
    return true;
  }

  /* ---------------------------------------------------------- update */
  function update(realDt) {
    time += realDt;
    if (paused) return;
    if (hitstop > 0) { hitstop -= realDt; return; }
    if (slowmo > 0) { slowmo -= realDt; timeScale = lerp(timeScale, 0.3, 0.2); } else timeScale = lerp(timeScale, 1, 0.1);
    shake = Math.max(0, shake - realDt * 40);
    hurtFlash = Math.max(0, hurtFlash - realDt * 1.6);
    healFlash = Math.max(0, healFlash - realDt * 1.5);
    realmFlash = Math.max(0, realmFlash - realDt * 1.2);

    if (state === 'won' || state === 'lost') {
      endTimer -= realDt;
      if (endTimer <= 0) { state = 'done'; finish(); }
    }

    acc += realDt * timeScale;
    let steps = 0;
    while (acc >= STEP && steps < 12) {
      acc -= STEP; steps++;
      step(STEP);
    }
    amb.update(realDt * timeScale, view);
  }

  function step(dt) {
    for (const isl of islands) isl.update(dt);

    // player
    const p = player, pf = p.fig;
    pf.x = playerIsland.x; pf.y = playerIsland.y;
    if (pf.alive) {
      const regen = pStats.regen * (p.chill > 0 ? 0.3 : 1) * (aim ? 0.6 : 1);
      p.st = Math.min(p.maxSt, p.st + regen * dt);
      p.chill = Math.max(0, p.chill - dt);
      p.lowSt = Math.max(0, p.lowSt - dt);
      if (p.burn > 0) {
        p.burn -= dt;
        damagePlayerDot(p.burnDps * dt);
        if (Math.random() < dt * 20) { const c = pf.center(); fx.add({ x: c.x + rand(-10, 10), y: c.y + rand(-30, 20), vy: -rand(60, 140), color: pick(['#ffb347', '#ff6a2a']), size: rand(5, 9), life: 0.5 }); }
      }
      const target = aim ? aim.power : 0;
      pf.drawAmt += (target - pf.drawAmt) * (1 - Math.exp(-18 * dt));
      if (!aim && state !== 'play') pf.aim += angDiff(pf.aim, -0.15) * dt * 2;
    }
    pf.update(dt, islands, wellForce);

    for (const e of enemies) updateEnemy(e, dt);

    stepArrows(dt);
    arrows = arrows.filter(a => !a.dead);
    for (const a of arrows) {
      a.trail.push(a.x, a.y);
      if (a.trail.length > 16) a.trail.splice(0, 2);
      emitTrail(a, dt);
    }

    updateOrbs(dt);
    updateWells(dt);
    updateBeams(dt);

    // pickups
    if (state === 'play') {
      pickupTimer -= dt;
      if (pickupTimer <= 0 && pickups.length < 2) { spawnPickup(); pickupTimer = rand(10, 16); }
    }
    for (const pk of pickups) { pk.t += dt; pk.x += pk.vx * dt; pk.y = pk.baseY + Math.sin(pk.t * 2) * 14; if (pk.x < view.x0 - 80) pk.dead = true; }
    pickups = pickups.filter(pk => !pk.dead);

    for (const s of stuckArrows) s.life -= dt;
    stuckArrows = stuckArrows.filter(s => s.life > 0 && s.isl.leave < 2);

    // wave flow
    if (state === 'play' && waveTimer > 0 && aliveEnemies().length === 0) {
      waveTimer -= dt;
      if (waveTimer <= 0) nextWave();
    }
    fx.update(dt);
  }

  function damagePlayerDot(n) {
    const p = player;
    if (!p.fig.alive) return;
    p.hp -= n * pStats.armor;
    run && (run.dmgTaken += n);
    if (p.hp <= 0) { p.hp = 0; p.fig.kill({ x: -200, y: -300 }, 2); aim = null; lose(); }
  }

  function updateOrbs(dt) {
    const target = player.fig.chest();
    for (const o of orbs) {
      o.life -= dt;
      const dx = target.x - o.x, dy = target.y - o.y, d = Math.hypot(dx, dy) || 1;
      const sp = 250;
      o.vx += ((dx / d) * sp - o.vx) * dt * 0.9;
      o.vy += ((dy / d) * sp - o.vy) * dt * 0.9;
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (Math.random() < 0.5) fx.add({ x: o.x, y: o.y, vx: rand(-30, 30), vy: rand(-30, 30), color: o.color, size: rand(4, 8), life: 0.4 });
      if (player.fig.alive && d < 30) {
        o.dead = true;
        fx.burst(o.x, o.y, o.color, 24, 300);
        damagePlayer(o.dmg * pStats.armor, { x: o.vx, y: o.vy }, 2);
        if (o.el === 'fire') { player.burn = 3; player.burnDps = 4; }
        if (o.el === 'frost') player.chill = 2.5;
      }
      if (o.life <= 0) { o.dead = true; fx.burst(o.x, o.y, o.color, 10, 150); }
    }
    orbs = orbs.filter(o => !o.dead);
  }

  function emitTrail(a, dt) {
    const r = Math.random();
    switch (a.el) {
      case 'fire': if (r < 0.7) fx.add({ x: a.x, y: a.y, vx: rand(-30, 30), vy: rand(-60, 0), color: pick(['#ffb347', '#ff6a2a', '#ffd76a']), size: rand(5, 9), life: rand(0.25, 0.45) }); break;
      case 'frost': if (r < 0.4) fx.add({ x: a.x, y: a.y, vx: rand(-20, 20), vy: rand(-20, 20), color: '#c9f2ff', size: rand(3, 5), life: 0.5 }); break;
      case 'water': if (r < 0.3) fx.add({ kind: 'drop', x: a.x, y: a.y, vx: a.vx * 0.05, vy: 0, g: 1200, color: '#7cc8ff', size: rand(1.5, 3), life: 0.4, add: false }); break;
      case 'nature': if (r < 0.15) fx.add({ kind: 'leaf', x: a.x, y: a.y, vx: rand(-40, 40), vy: rand(-40, 10), g: 200, vr: rand(-8, 8), color: '#9ae66e', size: 4, life: 0.8, add: false }); break;
      case 'void': if (r < 0.6) fx.add({ x: a.x, y: a.y, vx: rand(-40, 40), vy: rand(-40, 40), color: pick(['#c08bff', '#5b2bb5']), size: rand(5, 9), life: 0.4 }); break;
      case 'light': if (r < 0.5) fx.add({ x: a.x + rand(-4, 4), y: a.y + rand(-4, 4), color: '#fff3b0', size: rand(3, 6), life: 0.4 }); break;
      case 'lightning': if (r < 0.5) fx.add({ kind: 'spark', x: a.x, y: a.y, vx: rand(-300, 300), vy: rand(-300, 300), color: '#fff27a', size: 4, life: 0.15 }); break;
      case 'earth': if (r < 0.2) fx.add({ kind: 'smoke', x: a.x, y: a.y, vy: -10, color: '#b08a66', size: 6, life: 0.4, add: false }); break;
      default: break;
    }
  }

  /* ---------------------------------------------------------- render */
  function render() {
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const pxScale = Math.min(view.scale * dpr, 1.5);
    const bg = Backdrop.render(realm, view, pxScale);
    c.drawImage(bg, 0, 0, canvas.width, canvas.height);

    const sx = shake > 0 && Save.data.settings.shake ? rand(-shake, shake) * 0.6 : 0;
    const sy = shake > 0 && Save.data.settings.shake ? rand(-shake, shake) * 0.6 : 0;
    const k = view.scale * dpr;
    c.setTransform(k, 0, 0, k, (view.ox + sx) * dpr, (view.oy + sy) * dpr);

    amb.drawBack(c, view, time);

    // void wells behind everything on the field
    for (const w of wells) drawWell(c, w);

    for (const isl of islands) isl.draw(c, realm, time);
    for (const s of stuckArrows) {
      const tx = s.isl.x + s.rx, ty = s.isl.y + s.ry;
      c.globalAlpha = clamp(s.life, 0, 1);
      drawArrowShape(c, tx - Math.cos(s.ang) * 34, ty - Math.sin(s.ang) * 34, tx, ty, s.el, 1, 0, true);
      c.globalAlpha = 1;
    }

    // enemy auras + figures
    c.globalCompositeOperation = 'lighter';
    for (const e of enemies) {
      if (!e.alive) continue;
      const ce = e.fig.center();
      Glow.draw(c, AURA[e.el], ce.x, ce.y - 10, 90 * e.fig.s, 0.22);
      if (e.drawing && !e.decor) Glow.draw(c, AURA[e.el], e.fig.bowHand().x, e.fig.bowHand().y, 30 + e.fig.drawAmt * 30, 0.4 + e.fig.drawAmt * 0.5);
      if (e.fig.status.burn > 0) Glow.draw(c, '#ff7a2a', ce.x, ce.y, 70, 0.35);
    }
    c.globalCompositeOperation = 'source-over';
    for (const e of enemies) drawFigureWithOutline(c, e.fig);
    drawFigureWithOutline(c, player.fig);

    for (const a of arrows) drawArrow(c, a);
    for (const o of orbs) drawOrb(c, o);
    for (const p of pickups) drawPickup(c, p);

    fx.draw(c);

    for (const e of enemies) if (e.alive && !e.decor && e.island.enter > 0.6) drawEnemyBar(c, e);

    if (aim && player.fig.alive && Save.data.settings.guide) drawGuide(c);

    amb.drawFront(c, view, time);
    fx.drawTexts(c);

    // screen-space overlays
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVignettes(c);
    if (aim) drawDragUI(c);
  }

  function drawFigureWithOutline(c, fig) {
    if (fig.outline && fig.alive) {
      // thin rim so dark silhouettes read against dark skies
      c.save();
      c.shadowColor = fig.outline; c.shadowBlur = 10;
      fig.draw(c, time);
      c.restore();
    } else fig.draw(c, time);
  }

  function drawArrow(c, a) {
    const el = ELEMENT_BY_ID[a.el];
    const ang = Math.atan2(a.vy, a.vx);
    const L = a.el === 'lightning' ? 46 : 58;
    const tx = a.x, ty = a.y;
    // trail
    const tr = a.trail;
    if (tr.length >= 4) {
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = rgba(el ? el.deep : '#ffffff', a.el === 'lightning' ? 0.9 : 0.35);
      c.lineWidth = a.el === 'lightning' ? 5 : 3; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(tr[0], tr[1]);
      for (let i = 2; i < tr.length; i += 2) {
        const j = a.el === 'lightning' ? rand(-6, 6) : 0;
        c.lineTo(tr[i] + j, tr[i + 1] + j);
      }
      c.stroke();
      c.globalCompositeOperation = 'source-over';
    }
    if (a.el === 'lightning') {
      c.globalCompositeOperation = 'lighter';
      Glow.draw(c, '#fff27a', tx, ty, 34, 0.9);
      Glow.draw(c, '#c49bff', tx, ty, 60, 0.4);
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = '#ffffff'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(tx - Math.cos(ang) * L, ty - Math.sin(ang) * L);
      for (let i = 1; i <= 4; i++) { const t = i / 4; c.lineTo(tx - Math.cos(ang) * L * (1 - t) + rand(-4, 4), ty - Math.sin(ang) * L * (1 - t) + rand(-4, 4)); }
      c.stroke();
      return;
    }
    drawArrowShape(c, tx - Math.cos(ang) * L, ty - Math.sin(ang) * L, tx, ty, a.el, 1, 1);
  }

  function drawOrb(c, o) {
    c.globalCompositeOperation = 'lighter';
    Glow.draw(c, o.color, o.x, o.y, 46 + Math.sin(time * 12) * 4, 0.9);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(o.x, o.y, 8, 0, TAU); c.fill();
    c.strokeStyle = o.color; c.lineWidth = 2.5;
    c.beginPath(); c.arc(o.x, o.y, 15, time * 6, time * 6 + 4); c.stroke();
  }

  function drawPickup(c, p) {
    const def = PICKUPS[p.type];
    const x = p.x, y = p.y;
    // little wings
    c.fillStyle = 'rgba(255,255,255,0.9)';
    const flap = Math.sin(p.t * 12) * 0.5;
    for (const s of [-1, 1]) {
      c.save(); c.translate(x + s * 16, y - 4); c.rotate(s * (0.4 + flap)); c.scale(s, 1);
      c.beginPath(); c.ellipse(8, 0, 13, 6, -0.3, 0, TAU); c.fill();
      c.restore();
    }
    c.globalCompositeOperation = 'lighter';
    Glow.draw(c, def.color, x, y, 40, 0.75);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = def.color;
    c.beginPath(); c.arc(x, y, 15, 0, TAU); c.fill();
    c.fillStyle = '#ffffff';
    if (p.type === 'heal') { c.fillRect(x - 2.5, y - 8, 5, 16); c.fillRect(x - 8, y - 2.5, 16, 5); }
    else if (p.type === 'stamina') { c.beginPath(); c.moveTo(x + 2, y - 9); c.lineTo(x - 6, y + 2); c.lineTo(x, y + 2); c.lineTo(x - 2, y + 9); c.lineTo(x + 6, y - 2); c.lineTo(x, y - 2); c.closePath(); c.fill(); }
    else { c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 7, y - 2); c.lineTo(x, y + 9); c.lineTo(x - 7, y - 2); c.closePath(); c.fill(); }
    // halo
    c.strokeStyle = 'rgba(255,240,170,0.9)'; c.lineWidth = 2.5;
    c.beginPath(); c.ellipse(x, y - 24, 11, 3.5, 0, 0, TAU); c.stroke();
  }

  function drawWell(c, w) {
    const k = w.t / w.dur;
    const grow = Math.min(1, w.t * 5) * (k > 0.85 ? (1 - k) / 0.15 : 1);
    c.globalCompositeOperation = 'lighter';
    Glow.draw(c, '#7a4ae0', w.x, w.y, w.r * 1.1 * grow, 0.5);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#05020a';
    c.beginPath(); c.arc(w.x, w.y, 30 * grow, 0, TAU); c.fill();
    c.strokeStyle = '#c08bff'; c.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.arc(w.x, w.y, (36 + i * 16) * grow, time * (4 - i) + i, time * (4 - i) + i + 2.2); c.stroke();
    }
  }

  function drawEnemyBar(c, e) {
    const s = e.fig.s;
    if (e.type === 'boss') return; // boss uses the big HUD bar
    const hd = e.fig.head();
    const w = 74, h = 8;
    const x = hd.x - w / 2 + 8, y = hd.y - 34 * s - 12;
    c.fillStyle = 'rgba(15,12,24,0.7)';
    c.beginPath(); c.roundRect(x - 2, y - 2, w + 4, h + 4, 5); c.fill();
    const r = clamp(e.hp / e.maxHp, 0, 1);
    c.fillStyle = r > 0.5 ? '#7ee081' : r > 0.25 ? '#ffd166' : '#ff6b6b';
    c.beginPath(); c.roundRect(x, y, Math.max(2, w * r), h, 4); c.fill();
    const ic = IconCanvas.sprite(e.el, AURA[e.el]);
    c.fillStyle = 'rgba(15,12,24,0.75)';
    c.beginPath(); c.arc(x - 12, y + h / 2, 12, 0, TAU); c.fill();
    c.drawImage(ic, x - 21, y + h / 2 - 9, 18, 18);
    // telegraph: a "!" while drawing
    if (e.drawing) {
      c.font = '900 26px Nunito, sans-serif'; c.textAlign = 'center';
      c.fillStyle = AURA[e.el];
      c.globalAlpha = 0.5 + e.fig.drawAmt * 0.5;
      c.fillText('!', x + w / 2, y - 12);
      c.globalAlpha = 1;
    }
  }

  function drawGuide(c) {
    const el = ELEMENT_BY_ID[player.el];
    const f = player.fig;
    const h = f.bowHand();
    const power = aim.power;
    if (power < 0.05) return;
    let v = lerp(520, 1480, power) * el.speed;
    if (el.id === 'lightning') v = lerp(1900, 2500, power);
    const g = GRAV * el.grav;
    const dur = pStats.guide * (el.id === 'lightning' ? 0.45 : 1);
    const angles = el.split ? [-1, 0, 1].map(i => f.aim + i * el.spread) : [f.aim];
    for (const ang of angles) {
      let x = h.x + Math.cos(ang) * 30, y = h.y + Math.sin(ang) * 30, vx = Math.cos(ang) * v, vy = Math.sin(ang) * v;
      const dt = 0.016;
      let i = 0;
      for (let t = 0; t < dur; t += dt, i++) {
        vy += g * dt; x += vx * dt; y += vy * dt;
        if (i % 2) continue;
        const a = 1 - t / dur;
        c.fillStyle = rgba(el.color, a * 0.9);
        c.beginPath(); c.arc(x, y, 3.2 * a + 1, 0, TAU); c.fill();
      }
    }
  }

  function drawDragUI(c) {
    const el = ELEMENT_BY_ID[player.el];
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
    c.setLineDash([4, 6]);
    c.beginPath(); c.moveTo(aim.sx, aim.sy); c.lineTo(aim.cx, aim.cy); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath(); c.arc(aim.sx, aim.sy, 22, 0, TAU); c.fill();
    c.strokeStyle = rgba(el.color, 0.95); c.lineWidth = 4;
    c.beginPath(); c.arc(aim.sx, aim.sy, 22, -Math.PI / 2, -Math.PI / 2 + TAU * aim.power); c.stroke();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(aim.cx, aim.cy, 9, 0, TAU); c.fill();
    const enough = player.st >= el.cost;
    if (!enough) {
      c.font = '800 14px Nunito, sans-serif'; c.textAlign = 'center';
      c.fillStyle = '#7fc0ff';
      c.fillText('Need ' + el.cost + ' stamina', aim.sx, aim.sy - 34);
    }
  }

  function drawVignettes(c) {
    const cw = view.cw, ch = view.ch;
    const low = player && player.fig.alive && player.hp / player.maxHp < 0.3 ? (0.25 + Math.sin(time * 5) * 0.12) : 0;
    const a = Math.max(hurtFlash * 0.55, low);
    if (a > 0.01) {
      const g = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(200,20,40,${a})`);
      c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    }
    if (healFlash > 0.01) {
      const g = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.4, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      g.addColorStop(0, 'rgba(120,255,140,0)');
      g.addColorStop(1, `rgba(120,255,140,${healFlash * 0.3})`);
      c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    }
    if (realmFlash > 0) { c.fillStyle = `rgba(255,255,255,${realmFlash * 0.6})`; c.fillRect(0, 0, cw, ch); }
    // soft cinematic edge
    const g = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.55, cw / 2, ch / 2, Math.max(cw, ch) * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    c.fillStyle = g; c.fillRect(0, 0, cw, ch);
  }

  /* ------------------------------------------------------------- api */
  function hud() {
    if (!player) return null;
    const boss = enemies.find(e => e.type === 'boss' && e.alive && !e.decor);
    return {
      hp: player.hp, maxHp: player.maxHp, st: player.st, maxSt: player.maxSt, lowSt: player.lowSt > 0,
      el: player.el, kills: run ? run.kills : 0, essence: run ? run.essence : 0,
      wave: waveIdx, waves: stageDef ? stageDef.waves.length : 0,
      left: aliveEnemies().length + (stageDef && waveIdx >= 0 ? stageDef.waves.slice(waveIdx + 1).reduce((n, w) => n + w.length, 0) : 0),
      boss: boss ? { name: boss.boss.name, title: boss.boss.title, ratio: boss.hp / boss.maxHp, el: boss.el } : null,
      chill: player.chill > 0, burn: player.burn > 0,
    };
  }

  /* test hook used by automated playtests; harmless in production */
  const dev = {
    enemies: () => aliveEnemies(),
    player: () => player,
    shoot(angle, power) { player.fig.aim = angle; playerFire(power); },
    solve: (from, to, v, g) => solveAim(from, to, v, g),
  };

  return {
    dev, init, resize, update, render, start, quit, idleScene, selectElement, jump,
    pointerDown, pointerMove, pointerUp, cancelAim, hud, hooks,
    get state() { return state; }, get mode() { return mode; }, get realmIdx() { return realmIdx; },
    get paused() { return paused; }, set paused(v) { paused = v; if (v) aim = null; },
    get aiming() { return !!aim; }, get run() { return run; },
  };
})();
