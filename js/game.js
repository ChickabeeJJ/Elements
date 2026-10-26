'use strict';
/* =========================================================================
   Game: elemental ragdoll brawl. Owns the arena, fighters, every move's
   runtime (projectiles, melee hitboxes, dashes, novas, waves, zones,
   strikes, beams), enemy AI, wave flow and rendering.
   ========================================================================= */

const STEP = 1 / 120;
const RINGOUT_Y = H + 240;
const SWAP_CD = 0.35;

const Game = (() => {
  let canvas, ctx, dpr = 1;
  const view = { x0: 0, y0: 0, w: W, h: H, scale: 1, ox: 0, oy: 0, cw: 1, ch: 1 };
  const fx = new FX();
  const amb = new Ambience();
  let realmIdx = 0, realm = REALMS[0], arena = ARENAS[0];
  let state = 'idle';
  let paused = false;
  let mode = null, stageDef = null, waveIdx = -1, waveTimer = 0, endlessWaveNo = 0;
  let islands = [], player = null, enemies = [];
  let projectiles = [], zones = [], waves = [], strikes = [], spawns = [], pickups = [];
  let time = 0, timeScale = 1, slowmo = 0, hitstop = 0, shake = 0, hurtFlash = 0, healFlash = 0, acc = 0, endTimer = 0, realmFlash = 0;
  let run = null, pStats = Save.playerStats(), pickupTimer = 8;
  const combo = { n: 0, t: 0, best: 0 };
  const hooks = {};
  const input = { left: false, right: false, joyX: 0, attack: false, mouse: null, dirAim: null, queued: {} };
  let idleDemo = { t: 2, i: 0 };

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
    // fit the arena; allow a slight crop on odd aspect ratios instead of heavy letterboxing
    const scale = Math.min(cw / (W * 0.94), ch / (H * 0.9), Math.max(cw / W, ch / H));
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

  function buildArena(a) {
    arena = a;
    islands = a.isl.map(([x, y, w, motion], i) => new Island(x, y, w, { seed: 101 + i * 37 + realmIdx * 11, motion }));
  }

  function spawnPoint() { const m = islands[0]; return { x: m.x, y: m.top }; }

  function makePlayer() {
    const sp = spawnPoint();
    const f = new Fighter({
      x: sp.x - 120, y: sp.y, facing: 1, isPlayer: true, scale: 1.05, body: '#f4f4f4', shade: '#cdcdcd',
      hp: pStats.hp, speed: 380 * pStats.speedMul, jumpV: 1060 * pStats.jumpMul, maxJumps: 2, weight: 1,
    });
    f.root.grounded = true; f.root.plat = islands[0];
    f.team = 'player';
    f.loadout = Save.loadout();
    f.elIdx = 0; f.swapT = 0; f.comboIdx = 0; f.comboT = 0;
    setPlayerElement(f, f.loadout[0], true);
    return f;
  }

  function setPlayerElement(f, id, quiet) {
    f.el = id;
    f.accent = AURA[id];
    f.capeColor = ELEMENT_BY_ID[id].deep;
    if (!quiet) {
      const h = f.hand();
      fx.burst(h.x, h.y, ELEMENT_BY_ID[id].color, 16, 220, { life: 0.4 });
      fx.ring(f.center().x, f.center().y, ELEMENT_BY_ID[id].color, 70, 0.35);
      Sfx.swap(id);
    }
    hooks.onElement && hooks.onElement(id);
  }

  function clearField() {
    fx.clear();
    enemies = []; projectiles = []; zones = []; waves = []; strikes = []; spawns = []; pickups = [];
    timeScale = 1; slowmo = 0; hitstop = 0; shake = 0; hurtFlash = 0; healFlash = 0; acc = 0;
    combo.n = 0; combo.t = 0; combo.best = 0;
    input.attack = false; input.queued = {};
  }

  /* menu backdrop: the hero shows off moves against a sparring dummy */
  function idleScene(r) {
    state = 'idle'; mode = null; paused = false; run = null;
    setRealm(r);
    pStats = Save.playerStats();
    buildArena(ARENAS[0]);
    clearField();
    player = makePlayer();
    const sp = islands[0];
    const dummy = spawnEnemyAt({ type: 'grunt', element: realm.element, d: 0 }, sp.x + 170, sp.top, true);
    dummy.decor = true; dummy.facing = -1;
    idleDemo = { t: 1.5, i: 0 };
  }

  function start(opts) {
    mode = opts.mode;
    paused = false;
    pStats = Save.playerStats();
    run = { kills: 0, ringouts: 0, hits: 0, essence: 0, dmgTaken: 0, r: opts.r || 0, s: opts.s || 0, falls: 0 };
    if (mode === 'stage') {
      stageDef = buildStage(opts.r, opts.s);
      setRealm(opts.r);
      buildArena(stageDef.arena);
      waveIdx = -1;
    } else {
      stageDef = null;
      setRealm(0);
      buildArena(ARENAS[0]);
      endlessWaveNo = 0;
    }
    clearField();
    player = makePlayer();
    player.invuln = 1;
    waveTimer = 1.0;
    pickupTimer = rand(9, 13);
    state = 'play';
    Platform.gameplayStart();
    hooks.onStart && hooks.onStart();
  }

  /* -------------------------------------------------------- enemies */
  function bodyColors() {
    return realm.id === 'void' ? ['#2a2433', '#1b1722'] : ['#3a3944', '#282731'];
  }

  const AI_KINDS = new Set(['nova', 'updraft', 'dash', 'wave', 'slam', 'strike', 'zone', 'blink', 'shield', 'heal', 'beam', 'projectile']);
  function enemyKit(el, type) {
    const E = ELEMENT_BY_ID[el];
    if (!E) return { melee: type === 'caster' ? null : ENEMY_PUNCH, ranged: type === 'grunt' ? null : ENEMY_ROCK, powers: [] };
    const [main, p1, p2] = E.moves;
    const melee = main.type === 'melee' ? main : ENEMY_PUNCH;
    const ranged = main.type === 'ranged' ? main : [p1, p2].find(m => m.kind === 'projectile') || ENEMY_ROCK;
    let powers = [];
    if (type === 'brute') powers = [p1, p2].filter(m => AI_KINDS.has(m.kind) && m !== ranged).slice(0, 1);
    if (type === 'boss') powers = [p1, p2].filter(m => AI_KINDS.has(m.kind));
    return {
      melee: type === 'caster' ? null : melee,
      ranged: type === 'grunt' && main.type === 'melee' ? null : ranged,
      powers,
    };
  }

  function spawnEnemyAt(spec, x, y, instant) {
    const T = ENEMY_TYPES[spec.type];
    const stats = enemyStats(spec.type, spec.d);
    const [body, shade] = bodyColors();
    const f = new Fighter({
      x, y: instant ? y : y - 520, facing: player && x > player.root.x ? -1 : 1, scale: spec.scale || T.scale,
      kind: spec.type, el: spec.element, body, shade, accent: AURA[spec.element], weight: T.weight,
      speed: T.speed * (1 + Math.min(spec.d, 1.2) * 0.3), jumpV: 1000, maxJumps: 2,
      hp: Math.round(stats.hp * (spec.hpMul || 1)),
    });
    f.team = 'enemy';
    f.ai = { stats, thinkT: 0.6, kit: enemyKit(spec.element, spec.type), boss: spec.boss || null, summoned: 0, d: spec.d, jumpCd: 0 };
    if (instant) { f.root.grounded = true; f.root.plat = islands.find(i => x >= i.left && x <= i.right && Math.abs(i.top - y) < 4) || null; }
    else { f.root.grounded = false; f.root.vy = 600; }
    enemies.push(f);
    if (spec.type === 'boss') { hooks.onBoss && hooks.onBoss(f); shake = Math.max(shake, 12); Sfx.boom(1.5); }
    return f;
  }

  function queueSpawn(spec) {
    const away = islands.filter(i => !(player && player.root.plat === i));
    const isl = spec.type === 'boss' ? islands[0] : pick(away.length ? away : islands);
    const margin = Math.min(60, isl.w * 0.3);
    const x = spec.type === 'boss' ? (player.root.x < isl.x ? isl.right - 120 : isl.left + 120) : rand(isl.left + margin, isl.right - margin);
    spawns.push({ spec, isl, ox: x - isl.x, t: 1.0, el: spec.element });
    Sfx.portal();
  }

  const aliveEnemies = () => enemies.filter(e => e.alive && !e.decor);
  const opponents = f => (f.team === 'player' ? enemies : player ? [player] : []);

  /* ----------------------------------------------------------- moves */
  function aimFrom(f) { const n = f.pts[P.NECK]; return { x: n.x, y: n.y + 8 * f.s }; }

  function tryMove(f, mv, tx, ty) {
    if (!mv || !f.canAct || f.action) return false;
    if ((f.cds[mv.id] || 0) > 0) return false;
    const enemy = f.team === 'enemy';
    let cd = mv.cd;
    if (f.isPlayer && mv.slot !== 'main') cd *= pStats.cdMul;
    if (enemy) cd *= f.ai.stats.cdMul;
    f.cds[mv.id] = cd;
    const o = aimFrom(f);
    const ang = Math.atan2(ty - o.y, tx - o.x);
    f.aim = ang;
    f.facing = Math.cos(ang) >= 0 ? 1 : -1;
    const m = enemy ? Object.assign({}, mv, { windup: mv.windup * f.ai.stats.windupMul + 0.08 }) : mv;
    const lockKinds = { nova: 1, beam: 1, strike: 1, zone: 1, heal: 1, shield: 1, slam: 1 };
    let comboStep = 0;
    if (mv.combo) {
      f.comboIdx = f.comboT > 0 ? (f.comboIdx + 1) % mv.combo.n : 0;
      f.comboT = 0.9;
      comboStep = f.comboIdx;
    }
    f.comboAlt ^= 1;
    f.action = { move: m, t: 0, fired: false, tx, ty, el: f.el, alt: !!f.comboAlt, lock: !!lockKinds[mv.kind], hitSet: new Set(), comboStep };
    if (enemy) Sfx.telegraph();
    return true;
  }

  function updateAction(f, dt) {
    const act = f.action;
    if (!act) return;
    if (f.mode !== 'active') { f.action = null; f.slam = false; return; }
    if (f.status.freeze > 0) return;
    const mv = act.move;
    act.t += dt;
    if (f.isPlayer && mv.kind === 'beam') {
      const a = playerAim();
      const o = aimFrom(f);
      f.aim = Math.atan2(a.y - o.y, a.x - o.x);
      f.facing = Math.cos(f.aim) >= 0 ? 1 : -1;
    }
    if (!act.fired && act.t >= mv.windup) { act.fired = true; fireMove(f, act); }
    const inActive = act.t >= mv.windup && act.t < mv.windup + mv.active;
    if (inActive) {
      if (mv.kind === 'melee') meleeTick(f, act);
      if (mv.kind === 'beam') beamTick(f, act, dt);
    }
    if (f.dash && mv.kind === 'dash') dashTick(f, act);
    if (mv.kind === 'slam' && f.slam) {
      act.t = Math.min(act.t, mv.windup + 0.01);
      if (f.root.grounded) { f.slam = false; quake(f, act); act.t = mv.windup + mv.active; }
      return;
    }
    if (act.t >= mv.windup + mv.active + mv.recover) f.action = null;
  }

  function fireMove(f, act) {
    const mv = act.move, el = act.el;
    const o = aimFrom(f);
    const ax = Math.cos(f.aim), ay = Math.sin(f.aim);
    const s = f.s;
    switch (mv.kind) {
      case 'melee':
        Sfx.swing(el, mv.dmg > 18);
        if (f.root.grounded) f.root.vx += f.facing * (mv.pose === 'heavy' ? 260 : 150);
        break;
      case 'projectile': {
        const n = mv.count || 1;
        for (let i = 0; i < n; i++) {
          const a = f.aim + (i - (n - 1) / 2) * (mv.spread || 0);
          let x = o.x + Math.cos(a) * 34 * s, y = o.y + Math.sin(a) * 34 * s;
          let vx = Math.cos(a) * mv.speed, vy = Math.sin(a) * mv.speed;
          if (mv.flat) { x = f.root.x + f.facing * 40; y = f.root.y - 60; vx = f.facing * mv.speed; vy = 0; }
          projectiles.push({ owner: f, team: f.team, mv, el, x, y, px: x, py: y, vx, vy, r: mv.radius, life: mv.life || 3, hitSet: new Set(), tickT: new Map(), rot: rand(0, 6), trail: [] });
        }
        Sfx.cast(el);
        break;
      }
      case 'dash': {
        const dy = clamp(ay, -0.45, 0.45);
        const l = Math.hypot(ax, dy) || 1;
        f.dash = { t: mv.active, vx: (ax / l) * mv.speed, vy: (dy / l) * mv.speed };
        if (mv.invuln) f.invuln = Math.max(f.invuln, mv.active + 0.12);
        f.root.grounded = false; f.root.plat = null;
        Sfx.dash(el);
        break;
      }
      case 'nova':
        nova(f, f.center().x, f.center().y, mv, el);
        break;
      case 'updraft': {
        const c = f.center();
        nova(f, c.x, c.y + 30, mv, el);
        f.root.vy = -mv.selfJump; f.root.grounded = false; f.root.plat = null; f.root.jumps = 1;
        for (let i = 0; i < 24; i++) fx.add({ x: f.root.x + rand(-30, 30), y: f.root.y - rand(0, 40), vx: rand(-60, 60), vy: -rand(300, 700), color: '#dffcf2', size: rand(4, 9), life: rand(0.3, 0.6), drag: 2 });
        break;
      }
      case 'wave':
        spawnWave(f, f.facing, mv, el, f.root.x + f.facing * 30);
        Sfx.splash();
        break;
      case 'slam':
        if (f.root.grounded) quake(f, act);
        else { f.slam = true; f.root.vy = 1500; }
        break;
      case 'shield':
        f.shield = mv.absorb; f.shieldT = mv.dur;
        heal(f, mv.heal);
        Sfx.shield();
        fx.ring(f.center().x, f.center().y, '#7cc8ff', 90, 0.4);
        break;
      case 'heal': {
        f.regen = (f.maxHp * mv.heal) / mv.dur; f.regenT = mv.dur;
        const st = f.status; st.burn = st.chill = st.soak = st.root = st.shock = 0;
        nova(f, f.center().x, f.center().y, mv, el);
        for (let i = 0; i < 16; i++) fx.add({ kind: 'leaf', x: f.center().x + rand(-40, 40), y: f.center().y + rand(-40, 40), vx: rand(-80, 80), vy: -rand(60, 200), g: 200, vr: rand(-6, 6), color: pick(['#9ae66e', '#c3f08e', '#ffd6e8']), size: rand(4, 7), life: rand(0.8, 1.4), add: false });
        Sfx.heal();
        break;
      }
      case 'blink': {
        const c = f.center();
        let tx = act.tx, ty = act.ty;
        const d = dist(c.x, c.y, tx, ty);
        if (d > mv.range) { tx = c.x + (tx - c.x) / d * mv.range; ty = c.y + (ty - c.y) / d * mv.range; }
        tx = clamp(tx, 40, W - 40); ty = clamp(ty, 80, H - 140);
        fx.burst(c.x, c.y, '#fff27a', 20, 260);
        teleport(f, tx, ty + 30 * f.s);
        f.root.vy = -260;
        const c2 = f.center();
        fx.arc(c.x, c.y, c2.x, c2.y, '#a77bff', 0.3);
        nova(f, c2.x, c2.y, mv, el);
        Sfx.blink();
        break;
      }
      case 'strike': {
        const targets = opponents(f).filter(t => t.alive && !t.decor).sort((a, b) => dist(a.root.x, a.root.y, act.tx, act.ty) - dist(b.root.x, b.root.y, act.tx, act.ty)).slice(0, mv.targets);
        targets.forEach((t, i) => strikes.push({ owner: f, mv, el, target: t, t: 0.25 + i * mv.delay, x: t.center().x }));
        if (!targets.length) strikes.push({ owner: f, mv, el, target: null, t: 0.25, x: act.tx, y: act.ty });
        Sfx.charge();
        break;
      }
      case 'zone': {
        const c = f.center();
        let tx = act.tx, ty = act.ty;
        const d = dist(c.x, c.y, tx, ty);
        if (d > mv.range) { tx = c.x + (tx - c.x) / d * mv.range; ty = c.y + (ty - c.y) / d * mv.range; }
        addZone(f, el, mv.zone, tx, ty);
        break;
      }
      case 'beam':
        Sfx.beam();
        break;
      default: break;
    }
  }

  function meleeTick(f, act) {
    const mv = act.move;
    const n = f.pts[P.NECK], h = f.hand();
    const dx = h.x - n.x, dy = h.y - n.y, l = Math.hypot(dx, dy) || 1;
    const ext = Math.max(0, mv.reach * f.s - 46 * f.s);
    const tx = h.x + dx / l * ext, ty = h.y + dy / l * ext;
    act.tip = { x: tx, y: ty, nx: n.x, ny: n.y };
    const r = mv.radius * f.s;
    let mul = 1, kmul = 1;
    if (mv.combo && act.comboStep === mv.combo.n - 1) { mul = mv.combo.dmg; kmul = mv.combo.knock; }
    for (const t of opponents(f)) {
      if (act.hitSet.has(t) || t.decor) continue;
      const hit = t.hitCapsule(n.x, n.y, tx, ty, r);
      if (!hit) continue;
      act.hitSet.add(t);
      applyHit(f, t, { mv, el: act.el, dmg: mv.dmg * mul, knock: mv.knock * kmul, lift: mv.lift, dirX: f.facing, dirY: Math.sin(f.aim) * 0.6, idx: hit.idx, head: hit.head, px: hit.px, py: hit.py });
    }
    if (f.isPlayer) for (const p of pickups) if (!p.dead && segPointDist(n.x, n.y, tx, ty, p.x, p.y).d < r + 24) collectPickup(p);
  }

  function dashTick(f, act) {
    const mv = act.move;
    const n = f.pts[P.NECK], pv = f.pelvis;
    for (const t of opponents(f)) {
      if (act.hitSet.has(t) || t.decor) continue;
      const hit = t.hitCapsule(n.x, n.y, pv.x, pv.y, 30 * f.s);
      if (!hit) continue;
      act.hitSet.add(t);
      applyHit(f, t, { mv, el: act.el, dmg: mv.dmg, knock: mv.knock, lift: mv.lift, dirX: Math.sign(f.dash ? f.dash.vx : f.facing), dirY: 0, idx: hit.idx, px: hit.px, py: hit.py });
    }
    const c = f.center();
    const voidish = act.el === 'void';
    const col = voidish ? pick(['#c08bff', '#2a1250']) : pick(['#ffb347', '#ff5a1f', '#ffd76a']);
    for (let i = 0; i < 3; i++) fx.add({ x: c.x + rand(-14, 14), y: c.y + rand(-40, 30), vx: rand(-40, 40), vy: rand(-80, 0), color: col, size: rand(6, 12), life: rand(0.25, 0.45), add: !voidish });
  }

  function beamTick(f, act, dt) {
    const mv = act.move;
    const h = f.hand();
    const ax = Math.cos(f.aim), ay = Math.sin(f.aim);
    const ex = h.x + ax * mv.length, ey = h.y + ay * mv.length;
    act.beam = { x0: h.x, y0: h.y, x1: ex, y1: ey };
    act.tickT = (act.tickT || 0) - dt;
    const tick = act.tickT <= 0;
    if (tick) act.tickT = 0.12;
    for (const t of opponents(f)) {
      if (!t.alive || t.decor) continue;
      const hit = t.hitCapsule(h.x, h.y, ex, ey, mv.width);
      if (!hit) continue;
      if (t.mode === 'active') { t.root.vx += ax * mv.push * dt * 2 / t.weight; t.root.vy += ay * mv.push * dt / t.weight - 400 * dt; }
      if (tick) applyHit(f, t, { mv, el: act.el, dmg: mv.dps * 0.12, knock: 160, lift: 0.2, dirX: ax, dirY: ay, idx: hit.idx, px: hit.px, py: hit.py, quiet: true });
    }
    if (Math.random() < 0.6) fx.add({ x: lerp(h.x, ex, Math.random()), y: lerp(h.y, ey, Math.random()), vx: rand(-40, 40), vy: rand(-40, 40), color: '#fff3b0', size: rand(4, 9), life: 0.3 });
  }

  function nova(f, x, y, mv, el) {
    const col = ELEMENT_BY_ID[el] ? ELEMENT_BY_ID[el].color : '#ffffff';
    fx.ring(x, y, col, mv.radius, 0.45, 12);
    fx.burst(x, y, col, 30, mv.radius * 2.2);
    if (el === 'fire') { for (let i = 0; i < 10; i++) fx.add({ kind: 'smoke', x: x + rand(-50, 50), y: y + rand(-30, 30), vy: -rand(30, 80), color: '#3a2a2a', size: rand(16, 28), life: rand(0.7, 1.2), add: false }); Sfx.boom(0.8); }
    else if (el === 'frost') Sfx.freeze();
    else if (el === 'lightning') { for (let i = 0; i < 5; i++) { const a = rand(0, TAU); fx.arc(x, y, x + Math.cos(a) * mv.radius, y + Math.sin(a) * mv.radius, '#a77bff', 0.2); } Sfx.zap(); }
    else if (el === 'earth') Sfx.boom(0.6);
    else Sfx.whoosh();
    shake = Math.max(shake, 8);
    for (const t of opponents(f)) {
      if (t.decor) continue;
      const c = t.center();
      if (dist(x, y, c.x, c.y) > mv.radius + 30 * t.s) continue;
      const dx = c.x - x;
      applyHit(f, t, { mv, el, dmg: mv.dmg || 0, knock: mv.knock, lift: mv.lift, dirX: Math.sign(dx) || f.facing, dirY: 0, idx: P.PELVIS, px: c.x, py: c.y });
    }
  }

  function quake(f, act) {
    const mv = act.move;
    spawnWave(f, 1, mv, act.el, f.root.x + 20);
    spawnWave(f, -1, mv, act.el, f.root.x - 20);
    fx.chunks(f.root.x, f.root.y, '#b08a66', 20, 520, 10);
    fx.ring(f.root.x, f.root.y, '#e0b98f', 160, 0.4, 10);
    shake = Math.max(shake, 16);
    Sfx.rumble();
  }

  function spawnWave(f, dir, mv, el, x) {
    waves.push({ owner: f, team: f.team, mv, el, x, y: f.root.y, dir, life: mv.life, max: mv.life, hitSet: new Set(), h: mv.height * f.s });
  }

  function addZone(f, el, z, x, y) {
    let gy = y, isl = null;
    if (z.style === 'thorns') {
      isl = islands.filter(i => x >= i.left && x <= i.right && i.top >= y - 40).sort((a, b) => a.top - b.top)[0] || null;
      if (isl) gy = isl.top;
    }
    zones.push(Object.assign({ owner: f, team: f.team, el, x, y: gy, t: 0, tickT: 0, isl, ox: isl ? x - isl.x : 0 }, z));
    if (z.style === 'rift') Sfx.rift(); else Sfx.thorns();
  }

  function teleport(f, x, y) {
    const r = f.root;
    const dx = x - r.x, dy = y - r.y;
    r.x = x; r.y = y; r.vx = 0; r.vy = 0; r.grounded = false; r.plat = null;
    for (const p of f.pts) { p.x += dx; p.y += dy; p.px += dx; p.py += dy; }
    for (const t of f.T) { t.x += dx; t.y += dy; }
    for (const t of f.Tp) { t.x += dx; t.y += dy; }
    if (f.cape) for (const p of f.cape) { p.x += dx; p.y += dy; p.px += dx; p.py += dy; }
  }

  function heal(f, n) {
    if (!f.alive || n <= 0) return;
    const before = f.hp;
    f.hp = Math.min(f.maxHp, f.hp + n);
    const got = f.hp - before;
    if (got >= 1 && Save.data.settings.numbers) fx.text(f.center().x + 20, f.center().y - 80, '+' + Math.round(got), '#9ae66e', 22);
    if (f.isPlayer && got >= 1) healFlash = 0.4;
  }

  /* ------------------------------------------------------------- hits */
  function applyHit(att, t, o) {
    if (t.decor) {
      // the menu dummy reacts but never dies
      t.flash = 1;
      t.knock(o.dirX * o.knock * 0.6, -o.lift * o.knock * 0.6, o.idx, o.knock > 600 ? 0.6 : 0);
      fx.burst(o.px, o.py, (ELEMENT_BY_ID[o.el] || NEUTRAL).color, 10, 240);
      return;
    }
    if (!t.alive) { const k = o.knock * 0.9; t.impulse(o.idx, o.dirX * k, (o.dirY - o.lift) * k, 0.6); return; }
    if (t.invuln > 0) return;
    const enemyTarget = t.team === 'enemy';
    let dmg = o.dmg;
    if (att) dmg *= att.isPlayer ? pStats.dmgMul : att.ai ? att.ai.stats.dmgMul * 0.8 : 1;
    let mul = 1, tag = null;
    if (enemyTarget) mul = affinityMul(t.el, o.el);
    dmg *= mul;
    if (o.head && !o.quiet) dmg *= t.kind === 'boss' || t.kind === 'brute' ? 1.15 : 1.35;
    const mv = o.mv || {};
    if (mv.shatter && t.status.freeze > 0) { dmg *= mv.shatter; t.status.freeze = 0; tag = 'SHATTER'; fx.chunks(o.px, o.py, '#d8f6ff', 18, 460, 9); Sfx.freeze(); }
    if (o.el === 'lightning' && t.status.soak > 0) { dmg *= 1.6; tag = tag || 'OVERLOAD'; }
    if (t.isPlayer) dmg *= pStats.armor;
    if (t.shield > 0) {
      const ab = Math.min(t.shield, dmg);
      t.shield -= ab; dmg -= ab;
      fx.burst(o.px, o.py, '#bfe6ff', 8, 160);
      if (t.shield <= 0) { t.shieldT = 0; fx.ring(t.center().x, t.center().y, '#7cc8ff', 100, 0.3); Sfx.splash(); }
    }
    t.hp -= dmg;
    t.flash = 1;

    const st = t.status;
    const bossy = t.kind === 'boss' ? 0.4 : t.kind === 'brute' ? 0.7 : 1;
    if (mv.burn) { st.burn = Math.max(st.burn, mv.burn.dur); st.burnDps = mv.burn.dps * (att && att.isPlayer ? pStats.dmgMul : 0.7); }
    if (mv.chill) st.chill = Math.max(st.chill, mv.chill);
    if (mv.soak) st.soak = Math.max(st.soak, mv.soak);
    if (mv.root) st.root = Math.max(st.root, mv.root * bossy);
    if (mv.freeze) { st.freeze = Math.max(st.freeze, mv.freeze * bossy); t.action = null; }
    if (mv.shock) st.shock = Math.max(st.shock, mv.shock * bossy);
    if (mv.leech && att) heal(att, dmg * mv.leech);
    if (o.zoneRoot) st.root = Math.max(st.root, o.zoneRoot * bossy);

    // knockback: foes fly further the more hurt they are
    let K = o.knock;
    K *= enemyTarget ? 1 + (1 - clamp(t.hp / t.maxHp, 0, 1)) * 0.9 : pStats.knockMul;
    K /= t.weight;
    const dl = Math.hypot(o.dirX, o.dirY) || 1;
    const kx = (o.dirX / dl) * K;
    const ky = (o.dirY / dl) * K * 0.5 - (o.lift || 0) * K * 0.85;
    const dead = t.hp <= 0;
    let tumbleFor = 0;
    if (st.freeze <= 0 && (K > 620 || mv.stun || dead)) tumbleFor = mv.stun || clamp(K / 1150, 0.35, 1.1);
    t.knock(kx, ky, o.idx, tumbleFor);

    if (!o.quiet || Math.random() < 0.3) {
      const col = ELEMENT_BY_ID[o.el] ? ELEMENT_BY_ID[o.el].color : '#ffffff';
      fx.burst(o.px, o.py, col, o.quiet ? 4 : 12, 260);
      fx.burst(o.px, o.py, '#ffffff', o.quiet ? 2 : 5, 200, { life: 0.2 });
      Sfx.impact(o.el, K > 600);
    }
    if (Save.data.settings.numbers && dmg >= 0.5) {
      fx.text(o.px + rand(-12, 12), o.py - 40, Math.max(1, Math.round(dmg)), t.isPlayer ? '#ff8a8a' : tag ? '#ffe066' : mul > 1 ? '#ffd166' : '#ffffff', dmg >= 20 ? 32 : 24);
      if (mul > 1 && !o.quiet) fx.text(o.px + 34, o.py - 70, 'WEAK!', '#ffe066', 18, { dur: 0.8 });
      if (mul < 1 && !o.quiet) fx.text(o.px + 34, o.py - 70, 'RESIST', '#a7adbd', 16, { dur: 0.8 });
      if (tag) fx.text(o.px, o.py - 96, tag, '#ffe066', 26, { dur: 1 });
    }
    if (!o.quiet) {
      hitstop = Math.max(hitstop, K > 700 ? 0.07 : 0.035);
      shake = Math.max(shake, K > 700 ? 10 : 4);
    }
    if (t.isPlayer) { hurtFlash = Math.min(1, hurtFlash + 0.5); Sfx.hurt(); if (run) run.dmgTaken += dmg; }
    if (att && att.isPlayer && enemyTarget && !o.quiet) addCombo();
    if (att && att.isPlayer && run) run.hits++;

    if (dead) kill(t, att, kx, ky, o.idx);
  }

  function addCombo() {
    combo.n = combo.t > 0 ? combo.n + 1 : 1;
    combo.t = 2.4;
    combo.best = Math.max(combo.best, combo.n);
    hooks.onCombo && hooks.onCombo(combo.n);
  }

  function kill(t, att, kx, ky, idx, ringout) {
    if (t.decor) return;
    if (t.mode === 'dead' && !ringout) return;
    t.die(kx, ky, idx);
    if (t.isPlayer) { lose(); return; }
    const c = t.center();
    fx.burst(c.x, c.y, t.accent, 26, 360);
    fx.ring(c.x, c.y, t.accent, 110, 0.5, 10);
    if (run) {
      run.kills++;
      Save.data.stats.kills++;
      const reward = t.kind === 'boss' ? 40 : t.kind === 'brute' ? 6 : 3;
      const at = ringout && player ? player.center() : c;
      grantEssence(reward + (ringout ? 2 : 0), clamp(at.x, 60, W - 60), clamp(at.y - 80, 60, H - 60));
    }
    Sfx.kill();
    hitstop = Math.max(hitstop, 0.08);
    shake = Math.max(shake, t.kind === 'boss' ? 24 : 10);
    if (t.kind === 'boss') { Sfx.boom(2); fx.ring(c.x, c.y, t.accent, 300, 0.9, 16); slowmo = 1.6; Save.data.stats.bosses++; }
    hooks.onKill && hooks.onKill(t, ringout);
    if (state === 'play' && aliveEnemies().length === 0 && spawns.length === 0) waveCleared();
  }

  function grantEssence(n, x, y) {
    n = Math.round(n);
    if (!run) return;
    run.essence += n;
    fx.text(x, y, '+' + n, '#ffd76a', 22, { dur: 1.2, vy: -50 });
  }

  function ringOut(f) {
    if (f.isPlayer) {
      f.gone = true;
      if (f.mode === 'dead' || state !== 'play') return;
      // the void is final
      run.falls++;
      Sfx.ringout();
      shake = 14;
      f.hp = 0; f.mode = 'dead';
      hooks.onToast && hooks.onToast('Lost to the void', true);
      lose();
      return;
    }
    if (f.mode !== 'dead') {
      fx.text(clamp(f.root.x, 140, W - 140), H - 130, 'RING OUT!', '#ffd76a', 36, { dur: 1.2 });
      if (run) run.ringouts++;
      Save.data.stats.ringouts++;
      Sfx.ringout();
      kill(f, null, 0, 0, P.PELVIS, true);
    }
    f.gone = true;
  }

  /* ------------------------------------------------------- projectiles */
  function updateProjectiles(dt) {
    for (const p of projectiles) {
      if (p.dead) continue;
      const mv = p.mv;
      p.life -= dt;
      p.px = p.x; p.py = p.y;
      p.rot += dt * 8;
      if (mv.homing) {
        let best = null, bd = 700;
        for (const t of opponents(p.owner)) { if (!t.alive || t.decor) continue; const c = t.chest(); const d = dist(p.x, p.y, c.x, c.y); if (d < bd) { bd = d; best = c; } }
        if (best) {
          const sp = Math.hypot(p.vx, p.vy);
          const want = Math.atan2(best.y - p.y, best.x - p.x), cur = Math.atan2(p.vy, p.vx);
          const na = cur + clamp(angDiff(cur, want), -mv.homing * dt, mv.homing * dt);
          p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
        }
      }
      for (const z of zones) if (z.style === 'rift' && z.team !== p.team) {
        const d = dist(z.x, z.y, p.x, p.y);
        if (d < z.r && d > 1) { p.vx += (z.x - p.x) / d * 1800 * dt; p.vy += (z.y - p.y) / d * 1800 * dt; if (d < 30) { p.dead = true; fx.burst(p.x, p.y, '#c08bff', 10, 140); } }
      }
      if (p.dead) continue;
      p.vy += (mv.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.trail.push(p.x, p.y); if (p.trail.length > 20) p.trail.splice(0, 2);
      emitTrail(p);

      for (const t of opponents(p.owner)) {
        if (t.decor || t.gone || (!t.alive && t.deadT > 2)) continue;
        if (mv.pierce) {
          if (mv.tick ? time - (p.tickT.get(t) || -9) < mv.tick : p.hitSet.has(t)) continue;
        }
        const hit = t.hitCapsule(p.px, p.py, p.x, p.y, p.r);
        if (!hit) continue;
        if (!t.alive) { t.impulse(hit.idx, p.vx * 0.4, p.vy * 0.4 - 100, 0.5); if (!mv.pierce) { p.dead = true; break; } continue; }
        if (t.invuln > 0) continue;
        p.hitSet.add(t); p.tickT.set(t, time);
        const sp = Math.hypot(p.vx, p.vy) || 1;
        if (mv.style === 'cyclone') {
          if (t.mode === 'active') { t.root.vx = lerp(t.root.vx, p.vx * 1.1, 0.6); t.root.vy = Math.min(t.root.vy, -380); t.root.grounded = false; t.root.plat = null; }
          applyHit(p.owner, t, { mv, el: p.el, dmg: mv.dmg, knock: 120, lift: 0.2, dirX: Math.sign(p.vx), dirY: 0, idx: hit.idx, px: hit.px, py: hit.py, quiet: true });
          continue;
        }
        applyHit(p.owner, t, { mv, el: p.el, dmg: mv.dmg, knock: mv.knock, lift: mv.lift, dirX: p.vx / sp, dirY: p.vy / sp, idx: hit.idx, head: hit.head, px: hit.px, py: hit.py });
        if (mv.chain) chainFrom(p, t, mv);
        if (!mv.pierce) { p.dead = true; detonate(p, hit.px, hit.py); break; }
      }
      if (p.dead) continue;
      if (p.team === 'player') for (const pk of pickups) if (!pk.dead && segPointDist(p.px, p.py, p.x, p.y, pk.x, pk.y).d < p.r + 24) collectPickup(pk);
      if (!mv.ghost) {
        for (const isl of islands) {
          if (p.x < isl.left || p.x > isl.right) continue;
          if ((p.py <= isl.prevTop && p.y >= isl.top) || (p.y > isl.top + 4 && p.y < isl.top + isl.depth * 0.45 && Math.abs(p.x - isl.x) < isl.w * 0.42)) {
            p.dead = true;
            detonate(p, p.x, Math.min(p.y, isl.top + 2));
            if (!mv.explode && !mv.zone) { fx.burst(p.x, isl.top, '#8d8d8d', 6, 140, { add: false, kind: 'chunk', g: 1200, size: 4, life: 0.5 }); Sfx.thud(); }
            break;
          }
        }
      }
      if (!p.dead && (p.life <= 0 || p.x < -300 || p.x > W + 300 || p.y > H + 300 || p.y < -1200)) {
        p.dead = true;
        if (p.life <= 0) detonate(p, p.x, p.y);
      }
    }
    projectiles = projectiles.filter(p => !p.dead);
  }

  function detonate(p, x, y) {
    const mv = p.mv;
    const blast = mv.explode || mv.endBlast;
    if (blast) {
      nova(p.owner, x, y, { radius: blast.r, dmg: blast.dmg, knock: blast.knock, lift: blast.lift != null ? blast.lift : 0.5 }, p.el);
      if (p.el === 'earth') fx.chunks(x, y, '#9b7653', 16, 480, 10);
    }
    if (mv.zone) addZone(p.owner, p.el, mv.zone, x, y);
    if (mv.style === 'shard' || mv.style === 'lance') fx.burst(x, y, '#c9f2ff', 10, 200);
    if (mv.style === 'bolt') fx.burst(x, y, '#fff27a', 10, 300, { kind: 'spark' });
  }

  function chainFrom(p, first, mv) {
    let from = first;
    const hit = new Set([first]);
    for (let n = 0; n < mv.chain.n; n++) {
      const fc = from.center();
      let best = null, bd = mv.chain.r;
      for (const t of opponents(p.owner)) {
        if (hit.has(t) || !t.alive || t.decor) continue;
        const c = t.center(), d = dist(fc.x, fc.y, c.x, c.y);
        if (d < bd) { bd = d; best = t; }
      }
      if (!best) break;
      hit.add(best);
      const c = best.center();
      fx.arc(fc.x, fc.y, c.x, c.y, '#a77bff', 0.3);
      applyHit(p.owner, best, { mv, el: p.el, dmg: mv.dmg * mv.chain.mul, knock: mv.knock, lift: mv.lift, dirX: Math.sign(c.x - fc.x) || 1, dirY: 0, idx: P.NECK, px: c.x, py: c.y });
      from = best;
    }
  }

  function emitTrail(p) {
    const r = Math.random();
    switch (p.mv.style) {
      case 'fireball': if (r < 0.8) fx.add({ x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-60, 0), color: pick(['#ffb347', '#ff6a2a', '#ffd76a']), size: rand(6, 11), life: rand(0.25, 0.45) }); break;
      case 'shard': case 'lance': if (r < 0.4) fx.add({ x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20), color: '#c9f2ff', size: rand(3, 5), life: 0.4 }); break;
      case 'voidorb': if (r < 0.7) fx.add({ x: p.x, y: p.y, vx: rand(-40, 40), vy: rand(-40, 40), color: pick(['#c08bff', '#6a35d0']), size: rand(5, 10), life: 0.45 }); break;
      case 'bolt': if (r < 0.6) fx.add({ kind: 'spark', x: p.x, y: p.y, vx: rand(-300, 300), vy: rand(-300, 300), color: '#fff27a', size: 4, life: 0.15 }); break;
      case 'cyclone': if (r < 0.9) { const a = rand(0, TAU); fx.add({ x: p.x + Math.cos(a) * 40, y: p.y + rand(-60, 50), vx: -Math.sin(a) * 200, vy: -rand(80, 200), color: '#e6fff7', size: rand(3, 6), life: 0.35 }); } break;
      case 'seed': if (r < 0.2) fx.add({ kind: 'leaf', x: p.x, y: p.y, vx: rand(-40, 40), vy: rand(-40, 10), g: 200, vr: rand(-8, 8), color: '#9ae66e', size: 4, life: 0.7, add: false }); break;
      case 'boulder': case 'rock': if (r < 0.25) fx.add({ kind: 'smoke', x: p.x, y: p.y, vy: -10, color: '#b08a66', size: 7, life: 0.4, add: false }); break;
      default: break;
    }
  }

  /* ----------------------------------------------- waves, zones, strikes */
  function updateWaves(dt) {
    for (const w of waves) {
      w.life -= dt;
      w.x += w.dir * w.mv.speed * dt;
      for (const t of opponents(w.owner)) {
        if (w.hitSet.has(t) || t.decor || !t.alive) continue;
        const c = t.center();
        if (Math.abs(c.x - w.x) < 40 && t.root.y > w.y - w.h - 40 && t.root.y < w.y + 30) {
          w.hitSet.add(t);
          applyHit(w.owner, t, { mv: w.mv, el: w.el, dmg: w.mv.dmg, knock: w.mv.knock, lift: w.mv.lift, dirX: w.dir, dirY: 0, idx: P.PELVIS, px: c.x, py: c.y });
        }
      }
      if (w.el === 'water' && Math.random() < 0.9) fx.add({ kind: 'drop', x: w.x + rand(-20, 20), y: w.y - rand(0, w.h), vx: w.dir * rand(50, 250), vy: -rand(100, 350), g: 1400, color: pick(['#7cc8ff', '#d6efff', '#2f7fe0']), size: rand(2, 5), life: 0.6, add: false });
      if (w.el !== 'water' && Math.random() < 0.6) fx.add({ kind: 'chunk', x: w.x, y: w.y, vx: rand(-60, 60), vy: -rand(200, 450), g: 1600, color: pick(['#9b7653', '#c4a07a']), size: rand(3, 7), life: 0.6, vr: rand(-10, 10), add: false });
    }
    waves = waves.filter(w => w.life > 0);
  }

  function zoneForce(x, y, f) {
    let ox = 0, oy = 0;
    for (const z of zones) {
      if (z.style !== 'rift' || (f && f.team === z.team)) continue;
      const dx = z.x - x, dy = z.y - y, d = Math.hypot(dx, dy);
      if (d < z.r * 1.25 && d > 6) {
        const k = z.pull * (1 - d / (z.r * 1.25));
        ox += (dx / d) * k; oy += (dy / d) * k - 900 * (1 - d / (z.r * 1.25));
      }
    }
    return { x: ox, y: oy };
  }

  function updateZones(dt) {
    for (const z of zones) {
      z.t += dt;
      if (z.isl) { z.x = z.isl.x + z.ox; z.y = z.isl.top; }
      z.tickT -= dt;
      const tick = z.tickT <= 0;
      if (tick) z.tickT = 0.25;
      for (const t of opponents(z.owner)) {
        if (!t.alive || t.decor) continue;
        const c = t.center();
        const inside = z.style === 'thorns' ? Math.abs(t.root.x - z.x) < z.r && Math.abs(t.root.y - z.y) < 40 : dist(c.x, c.y, z.x, z.y) < z.r;
        if (!inside) continue;
        if (tick) applyHit(z.owner, t, { mv: null, el: z.el, dmg: z.dps * 0.25, knock: z.style === 'rift' ? 0 : 60, lift: 0, dirX: 0, dirY: 1, idx: P.PELVIS, px: c.x, py: c.y, quiet: true, zoneRoot: z.root });
      }
      if (z.style === 'rift') {
        if (Math.random() < 0.9) {
          const a = rand(0, TAU), r = rand(z.r * 0.4, z.r);
          fx.add({ x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2 - Math.sin(a) * 200, vy: -Math.sin(a) * r * 2 + Math.cos(a) * 200, color: pick(['#c08bff', '#7a4ae0', '#ffffff']), size: rand(3, 7), life: 0.45, drag: 1 });
        }
        for (const pk of pickups) { const d = dist(z.x, z.y, pk.x, pk.y); if (d < z.r && z.team === 'player' && d < 40) collectPickup(pk); }
        if (z.t >= z.dur) { fx.ring(z.x, z.y, '#c08bff', 140, 0.4, 10); fx.burst(z.x, z.y, '#c08bff', 24, 320); }
      }
    }
    zones = zones.filter(z => z.t < z.dur);
  }

  function updateStrikes(dt) {
    for (const s of strikes) {
      s.t -= dt;
      if (s.t > 0) { if (s.target && s.target.alive) s.x = lerp(s.x, s.target.center().x, 0.2); continue; }
      s.done = true;
      const t = s.target;
      const tx = t ? t.center().x + (s.owner.isPlayer ? 0 : rand(-30, 30)) : s.x;
      const ty = t ? t.center().y : s.y;
      if (s.mv.style === 'sun') { fx.add({ kind: 'beam', x: tx, y: ty + 70, color: '#ffe48a', size: 34, life: 0.5 }); Sfx.beam(); }
      else { fx.arc(tx + rand(-60, 60), -80, tx, ty, '#a77bff', 0.35); fx.arc(tx + rand(-40, 40), -80, tx, ty, '#fff27a', 0.25); Sfx.zap(); }
      fx.burst(tx, ty, s.mv.style === 'sun' ? '#fff3b0' : '#fff27a', 22, 320);
      shake = Math.max(shake, 7);
      for (const o of opponents(s.owner)) {
        if (!o.alive || o.decor) continue;
        const c = o.center();
        if (Math.abs(c.x - tx) < 48 * o.s && c.y < ty + 120) applyHit(s.owner, o, { mv: s.mv, el: s.el, dmg: s.mv.dmg, knock: s.mv.knock, lift: s.mv.lift, dirX: Math.sign(c.x - tx) || 1, dirY: 0.5, idx: P.HEAD, px: c.x, py: c.y });
      }
    }
    strikes = strikes.filter(s => !s.done);
  }

  /* --------------------------------------------------------- pickups */
  const PICKUPS = { heal: { color: '#ff7a8a' }, power: { color: '#62b6ff' }, essence: { color: '#ffd76a' } };
  function spawnPickup() {
    const r = Math.random();
    const type = r < 0.45 ? 'heal' : r < 0.72 ? 'power' : 'essence';
    const isl = pick(islands);
    pickups.push({ type, isl, ox: rand(-isl.w * 0.35, isl.w * 0.35), oy: -rand(130, 200), x: isl.x, y: isl.top - 150, t: rand(0, 6), life: 12, dead: false });
  }
  function collectPickup(p) {
    if (p.dead || !player || !player.alive) return;
    p.dead = true;
    const def = PICKUPS[p.type];
    fx.burst(p.x, p.y, def.color, 24, 300);
    fx.ring(p.x, p.y, def.color, 70, 0.4);
    Sfx.pickup();
    if (p.type === 'heal') heal(player, player.maxHp * 0.25);
    else if (p.type === 'power') { for (const k in player.cds) player.cds[k] = 0; fx.text(p.x, p.y - 30, 'Powers ready!', def.color, 24); }
    else grantEssence(8, p.x, p.y - 30);
  }

  /* ----------------------------------------------------------- waves */
  function waveCleared() {
    if (state !== 'play') return;
    if (mode === 'stage' && waveIdx >= stageDef.waves.length - 1) win();
    else waveTimer = 1.2;
  }

  function nextWave() {
    if (mode === 'stage') {
      waveIdx++;
      for (const spec of stageDef.waves[waveIdx]) queueSpawn(spec);
      hooks.onWave && hooks.onWave(waveIdx, stageDef.waves.length, stageDef.boss && waveIdx === stageDef.waves.length - 1);
    } else {
      const w = endlessWave(run.kills, endlessWaveNo++);
      if (w.realm !== realmIdx) {
        setRealm(w.realm);
        buildArena(ARENAS[w.realm % ARENAS.length]);
        const sp = spawnPoint();
        teleport(player, sp.x, sp.y - 300);
        player.invuln = 1.2;
        zones = []; waves = []; pickups = [];
        enemies = enemies.filter(e => e.alive);
        realmFlash = 1;
        hooks.onToast && hooks.onToast(REALMS[w.realm].name, true);
      }
      for (const spec of w.wave) queueSpawn(spec);
      hooks.onWave && hooks.onWave(endlessWaveNo - 1, 0, w.wave.some(s => s.type === 'boss'));
    }
    enemies = enemies.filter(e => e.alive || (e.deadT < 5.5 && !e.gone));
  }

  function summon(boss, n) {
    for (let i = 0; i < n; i++) queueSpawn({ type: 'grunt', element: boss.el, d: boss.ai.d });
    fx.text(boss.head().x, boss.head().y - 90, 'Reinforcements!', boss.accent, 26, { dur: 1.4 });
  }

  function win() {
    state = 'won'; endTimer = 2.2; slowmo = Math.max(slowmo, 1.3);
    Sfx.win(); Platform.happytime();
  }
  function lose() {
    if (state !== 'play') return;
    state = 'lost'; endTimer = 2.0; slowmo = 1.2;
    Sfx.lose();
  }

  function finish(won) {
    Platform.gameplayStop();
    const hpRatio = Math.max(0, player.hp) / player.maxHp;
    const res = {
      mode, won, r: run.r, s: run.s, kills: run.kills, ringouts: run.ringouts, bestCombo: combo.best,
      essence: run.essence, stars: 0, unlocked: null, firstClear: false, best: false,
    };
    if (mode === 'stage' && res.won) {
      res.stars = hpRatio >= 0.65 && run.falls === 0 ? 3 : hpRatio >= 0.3 ? 2 : 1;
      const rec = Save.recordClear(run.r, run.s, res.stars);
      res.firstClear = rec.firstClear;
      res.bonus = 15 + run.r * 8 + (rec.firstClear ? 25 : 0) + rec.newStars * 10;
      res.essence += res.bonus;
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

  function quit() {
    if (run && (state === 'play' || state === 'won' || state === 'lost')) {
      Save.data.essence += run.essence;
      if (mode === 'endless' && run.kills > Save.data.endlessBest) Save.data.endlessBest = run.kills;
      Save.save();
    }
    Platform.gameplayStop();
    idleScene(realmIdx);
  }

  /* --------------------------------------------------------------- AI */
  function groundAt(x, y, tol) { return islands.find(i => x >= i.left && x <= i.right && Math.abs(i.top - y) < tol); }
  function platformBelow(x, y, maxDrop, except) { return islands.filter(i => i !== except && x >= i.left && x <= i.right && i.top > y + 8 && i.top - y < maxDrop).sort((a, b) => a.top - b.top)[0]; }
  function nearestIsland(x) { return islands.slice().sort((a, b) => Math.abs(clamp(x, a.left, a.right) - x) - Math.abs(clamp(x, b.left, b.right) - x))[0]; }

  function updateAI(e, dt) {
    const ai = e.ai, me = e.root;
    if (e.decor) { e.input.x = 0; return; }
    ai.jumpCd = Math.max(0, ai.jumpCd - dt);
    if (e.mode !== 'active') { e.input.x = 0; return; }
    if (!me.grounded && !platformBelow(me.x, me.y - 5, 900)) {
      const isl = nearestIsland(me.x);
      e.input.x = Math.sign(isl.x - me.x);
      if (me.vy > 0 && me.y > isl.top - 40) e.jump();
      return;
    }
    if (!player || !player.alive || state !== 'play') { e.input.x = 0; return; }
    if (e.action) { e.input.x = 0; return; }
    if (ai.boss) {
      const ratio = e.hp / e.maxHp;
      if (ratio < 0.66 && ai.summoned === 0) { ai.summoned = 1; summon(e, 1); }
      else if (ratio < 0.33 && ai.summoned === 1) { ai.summoned = 2; summon(e, 2); }
    }
    ai.thinkT -= dt;
    if (ai.thinkT > 0) return;
    ai.thinkT = ai.stats.think * rand(0.7, 1.3);

    const pr = player.mode === 'active' ? player.root : { x: player.pelvis.x, y: player.pelvis.y + 50 };
    const dx = pr.x - me.x, dy = pr.y - me.y, adx = Math.abs(dx);
    const kit = ai.kit;
    const pc = player.chest(), ec = e.chest();
    const dd = dist(pc.x, pc.y, ec.x, ec.y);
    e.facing = dx >= 0 ? 1 : -1;
    e.aim = Math.atan2(pc.y - ec.y, pc.x - ec.x);
    const err = () => (Math.random() - 0.5) * 2 * ai.stats.aimErr * dd;
    const ready = mv => mv && (e.cds[mv.id] || 0) <= 0;

    if (kit.melee && ready(kit.melee) && dd < (kit.melee.reach + 34) * e.s && Math.abs(dy) < 110) { tryMove(e, kit.melee, pc.x, pc.y); return; }
    for (const pw of kit.powers) {
      if (!ready(pw) || Math.random() > 0.55) continue;
      const k = pw.kind;
      const ok = (k === 'nova' || k === 'updraft') ? dd < (pw.radius || 140) * 0.9
        : k === 'heal' ? e.hp < e.maxHp * 0.5
        : k === 'shield' ? e.hp < e.maxHp * 0.8
        : (k === 'dash' || k === 'wave') ? adx < 520 && Math.abs(dy) < 70
        : k === 'slam' ? me.grounded && adx < 420 && Math.abs(dy) < 60
        : k === 'blink' ? dd > 200
        : k === 'beam' ? adx > 150 && Math.abs(dy) < 160
        : true;
      if (ok) { tryMove(e, pw, pc.x + err(), pc.y + err()); return; }
    }
    if (kit.ranged && ready(kit.ranged) && adx > 110 && dd < 950 && (e.kind === 'caster' || !kit.melee || adx > 260 || Math.abs(dy) > 120)) {
      const sp = kit.ranged.speed || 900;
      const tt = dd / sp;
      const tx = pc.x + player.root.vx * Math.min(0.5, tt) * 0.6 + err();
      let ty = pc.y + err();
      if (kit.ranged.grav) ty -= 0.5 * kit.ranged.grav * tt * tt;
      tryMove(e, kit.ranged, tx, ty);
      return;
    }

    const prefer = !kit.melee ? 420 : 40;
    let dir = 0;
    if (adx > prefer + 30) dir = Math.sign(dx);
    else if (prefer > 100 && adx < prefer - 160) dir = -Math.sign(dx);
    if (me.grounded) {
      if (dy < -110 && adx < 300 && ai.jumpCd <= 0) { e.jump(); ai.jumpCd = 0.9; dir = Math.sign(dx) || dir; }
      else if (dy > 110 && adx < 340 && platformBelow(me.x, me.y, 600, me.plat) && Math.random() < 0.6) e.drop();
      if (dir !== 0) {
        const ax = me.x + dir * 46;
        if (!groundAt(ax, me.y, 10)) {
          const across = islands.find(i => i !== me.plat && (dir > 0 ? i.left > me.x && i.left - me.x < 330 : i.right < me.x && me.x - i.right < 330) && i.top > me.y - 190 && i.top < me.y + 260);
          const wants = Math.sign(dx) === dir;
          if (wants && across && ai.jumpCd <= 0) { e.jump(); ai.jumpCd = 0.8; }
          else if (!(wants && dy > 40 && platformBelow(ax, me.y, 520))) dir = 0;
        }
      }
    } else if (!platformBelow(me.x + dir * 30, me.y - 5, 900)) {
      dir = Math.sign(nearestIsland(me.x).x - me.x);
    }
    e.input.x = dir;
  }

  /* ---------------------------------------------------------- input */
  function screenToWorld(sx, sy) { return { x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale }; }

  function autoTarget() {
    if (!player) return null;
    const c = player.chest();
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (!e.alive || (e.decor && state !== 'idle')) continue;
      const ec = e.chest();
      const d = dist(c.x, c.y, ec.x, ec.y) * (Math.sign(ec.x - c.x) === player.facing ? 0.8 : 1);
      if (d < bd) { bd = d; best = ec; }
    }
    return best;
  }
  function playerAim() {
    const c = player.chest();
    if (input.dirAim != null) return { x: c.x + Math.cos(input.dirAim) * 300, y: c.y + Math.sin(input.dirAim) * 300 };
    if (input.mouse) return input.mouse;
    return autoTarget() || { x: c.x + player.facing * 300, y: c.y };
  }

  function playerControl(dt) {
    const f = player;
    if (!f) return;
    f.swapT = Math.max(0, f.swapT - dt);
    f.comboT = Math.max(0, f.comboT - dt);
    if (state !== 'play') { f.input.x = 0; return; }
    const mx = input.joyX || (input.right ? 1 : 0) - (input.left ? 1 : 0);
    f.input.x = mx;
    const q = input.queued;
    if (q.jump) { if (f.jump()) { Sfx.jump(); fx.burst(f.root.x, f.root.y, '#ffffff', 8, 140, { life: 0.3 }); } q.jump = false; }
    if (q.drop) { f.drop(); q.drop = false; }
    const a = playerAim();
    const o = aimFrom(f);
    if (!f.action) {
      f.aim = Math.atan2(a.y - o.y, a.x - o.x);
      if (mx !== 0) f.facing = mx > 0 ? 1 : -1;
      else if (input.mouse) f.facing = a.x >= f.root.x ? 1 : -1;
    }
    const kit = ELEMENT_BY_ID[f.el].moves;
    if (q.p1) { if (!tryMove(f, kit[1], a.x, a.y) && (f.cds[kit[1].id] || 0) > 0.15) Sfx.denied(); q.p1 = false; }
    if (q.p2) { if (!tryMove(f, kit[2], a.x, a.y) && (f.cds[kit[2].id] || 0) > 0.15) Sfx.denied(); q.p2 = false; }
    if (input.attack || q.attack) { tryMove(f, kit[0], a.x, a.y); q.attack = false; }
  }

  function press(action) {
    if (state !== 'play' || paused || !player) return;
    if (action === 'attack') input.attack = true;
    input.queued[action] = true;
  }
  function release(action) { if (action === 'attack') input.attack = false; }
  function setKey(dir, on) { input[dir] = on; }
  function setJoy(x) { input.joyX = x; }
  function setDirAim(a) { input.dirAim = a; }
  function setMouse(sx, sy) { input.mouse = sx == null ? null : screenToWorld(sx, sy); }

  function selectSlot(i) {
    const f = player;
    if (!f || state !== 'play' || i >= f.loadout.length || f.elIdx === i || f.swapT > 0) return false;
    f.elIdx = i; f.swapT = SWAP_CD;
    setPlayerElement(f, f.loadout[i]);
    return true;
  }
  function cycleSlot(d) { if (player && player.loadout.length > 1) selectSlot((player.elIdx + d + player.loadout.length) % player.loadout.length); }

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
    combo.t = Math.max(0, combo.t - realDt);
    if (combo.t <= 0 && combo.n) { combo.n = 0; hooks.onCombo && hooks.onCombo(0); }

    if (state === 'won' || state === 'lost') {
      endTimer -= realDt;
      if (endTimer <= 0) { const won = state === 'won'; state = 'done'; finish(won); }
    }
    if (state === 'idle') demoTick(realDt);

    acc += realDt * timeScale;
    let steps = 0;
    while (acc >= STEP && steps < 10) { acc -= STEP; steps++; step(STEP); }
    if (steps >= 10) acc = 0;
    amb.update(realDt * timeScale, view);
  }

  function demoTick(dt) {
    idleDemo.t -= dt;
    if (idleDemo.t > 0 || !player || !player.canAct) return;
    const kit = ELEMENT_BY_ID[player.el].moves;
    const target = enemies[0];
    const tc = target ? target.chest() : { x: player.root.x + 300, y: player.root.y - 80 };
    const mv = kit[[0, 0, 1, 0, 2][idleDemo.i++ % 5]];
    const safe = { melee: 1, projectile: 1, nova: 1, shield: 1, heal: 1, strike: 1, beam: 1, zone: 1, wave: 1 };
    if (!safe[mv.kind] || mv.flat) { idleDemo.t = 0.4; return; }
    player.facing = tc.x >= player.root.x ? 1 : -1;
    tryMove(player, mv, tc.x, tc.y);
    idleDemo.t = rand(1.1, 1.8);
  }

  function step(dt) {
    for (const isl of islands) isl.update(dt);
    playerControl(dt);
    for (const e of enemies) if (e.ai) updateAI(e, dt);
    const fighters = player ? enemies.concat([player]) : enemies;
    for (const f of fighters) {
      if (f.gone) continue;
      updateAction(f, dt);
      if (f.status.burn > 0 && f.alive && !f.decor) {
        f.hp -= f.status.burnDps * dt * (f.isPlayer ? pStats.armor : 1);
        if (Math.random() < dt * 20) { const c = f.center(); fx.add({ x: c.x + rand(-12, 12), y: c.y + rand(-30, 20), vy: -rand(60, 140), color: pick(['#ffb347', '#ff6a2a', '#ffd76a']), size: rand(5, 10), life: rand(0.3, 0.6) }); }
        if (f.hp <= 0) kill(f, null, 0, -200, P.PELVIS);
      }
      f.update(dt, islands, zoneForce);
      if (f.decor) {
        f.hp = f.maxHp;
        if (f.mode === 'active') f.root.x = clamp(f.root.x, islands[0].left + 60, islands[0].right - 60);
      }
      const yy = f.alive ? Math.min(f.root.y, f.pelvis.y + 60) : f.pelvis.y;
      if (yy > RINGOUT_Y) {
        if (f.decor || (state === 'idle' && f.isPlayer)) {
          const isl = islands[0];
          teleport(f, isl.x + (f.decor ? 170 : -120), isl.top - 300);
          f.mode = 'active'; f.m = 1; f.stunT = 0;
        } else ringOut(f);
      }
    }
    for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) {
      const a = fighters[i], b = fighters[j];
      if (!a.alive || !b.alive || a.mode !== 'active' || b.mode !== 'active') continue;
      const dx = b.root.x - a.root.x;
      if (Math.abs(dx) < 34 && Math.abs(b.root.y - a.root.y) < 60) { const push = (34 - Math.abs(dx)) * 4 * (Math.sign(dx) || 1); a.root.vx -= push; b.root.vx += push; }
    }

    updateProjectiles(dt);
    updateWaves(dt);
    updateZones(dt);
    updateStrikes(dt);

    for (const s of spawns) {
      s.t -= dt;
      if (Math.random() < 0.5) fx.add({ x: s.isl.x + s.ox + rand(-30, 30), y: s.isl.top - rand(0, 20), vy: -rand(80, 220), color: AURA[s.el], size: rand(4, 8), life: 0.5 });
      if (s.t <= 0) { s.done = true; spawnEnemyAt(s.spec, s.isl.x + s.ox, s.isl.top, false); }
    }
    spawns = spawns.filter(s => !s.done);

    if (state === 'play') {
      pickupTimer -= dt;
      if (pickupTimer <= 0 && pickups.length < 2) { spawnPickup(); pickupTimer = rand(11, 17); }
    }
    for (const pk of pickups) {
      pk.t += dt; pk.life -= dt;
      pk.x = pk.isl.x + pk.ox; pk.y = pk.isl.top + pk.oy + Math.sin(pk.t * 2) * 12;
      if (player && player.alive && dist(player.chest().x, player.chest().y, pk.x, pk.y) < 55) collectPickup(pk);
      if (pk.life <= 0) pk.dead = true;
    }
    pickups = pickups.filter(p => !p.dead);

    if (state === 'play' && waveTimer > 0 && aliveEnemies().length === 0 && spawns.length === 0) {
      waveTimer -= dt;
      if (waveTimer <= 0) nextWave();
    }
    fx.update(dt);
  }

  /* ---------------------------------------------------------- render */
  function render() {
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const pxScale = Math.min(view.scale * dpr, 1.5);
    c.drawImage(Backdrop.render(realm, view, pxScale), 0, 0, canvas.width, canvas.height);
    const sk = shake > 0 && Save.data.settings.shake ? shake * 0.6 : 0;
    const k = view.scale * dpr;
    c.setTransform(k, 0, 0, k, (view.ox + rand(-sk, sk)) * dpr, (view.oy + rand(-sk, sk)) * dpr);

    amb.drawBack(c, view, time);
    for (const z of zones) drawZone(c, z, true);
    for (const isl of islands) isl.draw(c, realm, time);
    for (const z of zones) drawZone(c, z, false);
    for (const s of spawns) drawPortal(c, s);
    for (const p of pickups) drawPickup(c, p);

    c.globalCompositeOperation = 'lighter';
    for (const e of enemies) if (e.alive && e.action && !e.action.fired && !e.decor) Glow.draw(c, e.accent, e.hand().x, e.hand().y, 22 + 26 * Math.min(1, e.action.t / e.action.move.windup), 0.7);
    c.globalCompositeOperation = 'source-over';

    for (const e of enemies) if (!e.alive && !e.gone) e.draw(c, time);
    for (const e of enemies) if (e.alive) e.draw(c, time);
    if (player && !player.gone) { player.draw(c, time); drawSwipe(c, player); }
    for (const e of enemies) if (e.alive) drawSwipe(c, e);

    for (const w of waves) drawWave(c, w);
    for (const p of projectiles) drawProjectile(c, p);
    for (const f of player ? enemies.concat([player]) : enemies) {
      const a = f.action;
      if (a && a.beam && a.move.kind === 'beam' && a.t < a.move.windup + a.move.active) drawBeam(c, a.beam);
    }

    fx.draw(c);
    for (const e of enemies) if (e.alive && !e.decor && e.kind !== 'boss') drawEnemyBar(c, e);
    if (player && player.alive && state !== 'idle') drawPlayerMarker(c);
    for (const e of enemies) if (e.alive && e.action && !e.action.fired && !e.decor) drawTelegraph(c, e);
    if (player && player.alive && state === 'play' && input.mouse) drawReticle(c);

    amb.drawFront(c, view, time);
    fx.drawTexts(c);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVignettes(c);
  }

  function drawSwipe(c, f) {
    const act = f.action;
    if (!act || act.move.kind !== 'melee' || !act.tip) return;
    const mv = act.move;
    const u = (act.t - mv.windup) / mv.active;
    if (u < 0 || u > 1.6) return;
    const el = ELEMENT_BY_ID[act.el] || NEUTRAL;
    if (act.el === 'water' || act.el === 'nature') {
      c.strokeStyle = act.el === 'water' ? '#7cc8ff' : '#5fae4c';
      c.lineWidth = 6 * f.s; c.lineCap = 'round';
      const h = f.hand();
      c.beginPath();
      c.moveTo(h.x, h.y);
      c.quadraticCurveTo((h.x + act.tip.x) / 2 + Math.sin(time * 30) * 10, (h.y + act.tip.y) / 2 + 14, act.tip.x, act.tip.y);
      c.stroke();
    }
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = clamp(1.4 - u, 0, 1);
    c.strokeStyle = el.color; c.lineCap = 'round';
    c.lineWidth = mv.radius * f.s * 0.9;
    c.beginPath(); c.moveTo(lerp(act.tip.nx, act.tip.x, 0.55), lerp(act.tip.ny, act.tip.y, 0.55)); c.lineTo(act.tip.x, act.tip.y); c.stroke();
    Glow.draw(c, el.deep, act.tip.x, act.tip.y, mv.radius * 2.2 * f.s, 0.8);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  function drawProjectile(c, p) {
    const st = p.mv.style;
    const ang = Math.atan2(p.vy, p.vx);
    const tr = p.trail;
    const el = ELEMENT_BY_ID[p.el] || NEUTRAL;
    if (tr.length >= 4 && st !== 'cyclone') {
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = rgba(el.deep, st === 'bolt' ? 0.9 : 0.4); c.lineWidth = st === 'bolt' ? 5 : p.r * 0.9; c.lineCap = 'round';
      c.beginPath(); c.moveTo(tr[0], tr[1]);
      for (let i = 2; i < tr.length; i += 2) { const j = st === 'bolt' ? rand(-6, 6) : 0; c.lineTo(tr[i] + j, tr[i + 1] + j); }
      c.stroke();
      c.globalCompositeOperation = 'source-over';
    }
    c.save(); c.translate(p.x, p.y);
    switch (st) {
      case 'fireball':
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#ff5a1f', 0, 0, p.r * 3.4, 0.9); Glow.draw(c, '#ffd76a', 0, 0, p.r * 1.8, 1); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(0, 0, p.r * 0.6, 0, TAU); c.fill(); break;
      case 'cyclone':
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const y = 40 - i * 18, w = 14 + i * 7;
          c.strokeStyle = `rgba(220,255,245,${0.35 + i * 0.07})`; c.lineWidth = 3;
          c.beginPath(); c.ellipse(Math.sin(time * 9 + i) * 6, y, w, 5 + i, 0, time * 12 + i, time * 12 + i + 4.5); c.stroke();
        }
        c.globalCompositeOperation = 'source-over'; break;
      case 'shard': case 'lance': {
        const L = st === 'lance' ? 46 : 18, Wd = st === 'lance' ? 7 : 5;
        c.rotate(ang);
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#4fb6e0', 0, 0, L, 0.6); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#e6fbff';
        c.beginPath(); c.moveTo(L * 0.6, 0); c.lineTo(-L * 0.4, -Wd); c.lineTo(-L * 0.6, 0); c.lineTo(-L * 0.4, Wd); c.closePath(); c.fill();
        c.fillStyle = '#9fe6ff'; c.beginPath(); c.moveTo(L * 0.6, 0); c.lineTo(-L * 0.4, -Wd); c.lineTo(-L * 0.2, 0); c.closePath(); c.fill();
        break;
      }
      case 'bolt':
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#fff27a', 0, 0, 30, 1); Glow.draw(c, '#a77bff', 0, 0, 56, 0.5); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.fill(); break;
      case 'boulder': case 'rock': {
        c.rotate(p.rot);
        const R = p.r;
        c.fillStyle = st === 'boulder' ? '#9b7653' : '#8c8c96';
        c.beginPath();
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rr = R * (0.82 + ((i * 37) % 7) / 30); i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.arc(R * 0.25, R * 0.2, R * 0.45, 0, TAU); c.fill();
        break;
      }
      case 'seed':
        c.fillStyle = '#6b4a2b'; c.beginPath(); c.arc(0, 0, p.r * 0.8, 0, TAU); c.fill();
        c.fillStyle = '#9ae66e'; c.beginPath(); c.ellipse(4, -8, 7, 3.5, -0.6, 0, TAU); c.fill(); break;
      case 'voidorb':
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#7a4ae0', 0, 0, p.r * 3.6, 0.9); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#0b0614'; c.beginPath(); c.arc(0, 0, p.r * 0.75, 0, TAU); c.fill();
        c.strokeStyle = '#c08bff'; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, p.r, time * 6, time * 6 + 4); c.stroke(); break;
      default:
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, el.deep, 0, 0, p.r * 3, 0.9); c.globalCompositeOperation = 'source-over';
        c.fillStyle = el.color; c.beginPath(); c.arc(0, 0, p.r, 0, TAU); c.fill();
    }
    c.restore();
  }

  function drawWave(c, w) {
    const k = clamp(w.life / w.max * 1.6, 0, 1);
    const h = w.h * (0.4 + k * 0.6);
    if (w.el === 'water') {
      const g = c.createLinearGradient(0, w.y - h, 0, w.y);
      g.addColorStop(0, 'rgba(214,239,255,0.95)'); g.addColorStop(1, 'rgba(47,127,224,0.8)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(w.x - w.dir * 90, w.y);
      c.quadraticCurveTo(w.x - w.dir * 40, w.y - h * 0.5, w.x, w.y - h);
      c.quadraticCurveTo(w.x + w.dir * 30, w.y - h * 0.95, w.x + w.dir * 22, w.y - h * 0.62);
      c.quadraticCurveTo(w.x + w.dir * 30, w.y - h * 0.3, w.x + w.dir * 36, w.y);
      c.closePath(); c.fill();
    } else {
      c.fillStyle = '#8a6a4c';
      for (let i = 0; i < 4; i++) {
        const x = w.x - w.dir * i * 26, hh = h * (1 - i * 0.22);
        c.beginPath(); c.moveTo(x - 14, w.y + 4); c.lineTo(x + w.dir * 4, w.y - hh); c.lineTo(x + 14, w.y + 4); c.closePath(); c.fill();
      }
      c.fillStyle = '#c4a07a';
      c.beginPath(); c.moveTo(w.x - 9, w.y); c.lineTo(w.x + w.dir * 4, w.y - h); c.lineTo(w.x - 2, w.y); c.closePath(); c.fill();
    }
  }

  function drawBeam(c, b) {
    const ang = Math.atan2(b.y1 - b.y0, b.x1 - b.x0);
    const len = dist(b.x0, b.y0, b.x1, b.y1);
    c.save(); c.translate(b.x0, b.y0); c.rotate(ang);
    c.globalCompositeOperation = 'lighter';
    const w = 26 + Math.sin(time * 40) * 4;
    const g = c.createLinearGradient(0, -w, 0, w);
    g.addColorStop(0, 'rgba(255,201,60,0)'); g.addColorStop(0.5, 'rgba(255,243,176,0.95)'); g.addColorStop(1, 'rgba(255,201,60,0)');
    c.fillStyle = g; c.fillRect(0, -w, len, w * 2);
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(0, -4, len, 8);
    Glow.draw(c, '#ffc93c', 0, 0, 60, 0.9);
    c.globalCompositeOperation = 'source-over';
    c.restore();
  }

  function drawZone(c, z, back) {
    const k = z.t / z.dur;
    const grow = Math.min(1, z.t * 5) * (k > 0.85 ? (1 - k) / 0.15 : 1);
    if (z.style === 'rift') {
      if (!back) return;
      c.globalCompositeOperation = 'lighter';
      Glow.draw(c, '#7a4ae0', z.x, z.y, z.r * 1.1 * grow, 0.5);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#05020a';
      c.beginPath(); c.arc(z.x, z.y, 34 * grow, 0, TAU); c.fill();
      c.strokeStyle = '#c08bff'; c.lineWidth = 3;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(z.x, z.y, (40 + i * 18) * grow, time * (4 - i) + i, time * (4 - i) + i + 2.2); c.stroke(); }
    } else if (z.style === 'thorns') {
      if (back) return;
      c.fillStyle = '#3f7a2e';
      const n = Math.floor(z.r / 12);
      for (let i = -n; i <= n; i++) {
        const x = z.x + i * 12, hh = (18 + (((i * 53) % 13) + 13) % 13) * grow;
        c.beginPath(); c.moveTo(x - 5, z.y + 2); c.lineTo(x + Math.sin(time * 3 + i) * 3, z.y - hh); c.lineTo(x + 5, z.y + 2); c.closePath(); c.fill();
      }
      c.fillStyle = '#ff7aa8';
      for (let i = -n; i <= n; i += 4) { c.beginPath(); c.arc(z.x + i * 12, z.y - 16 * grow, 3.5, 0, TAU); c.fill(); }
    }
  }

  function drawPortal(c, s) {
    const x = s.isl.x + s.ox, y = s.isl.top;
    const k = 1 - s.t;
    c.globalCompositeOperation = 'lighter';
    Glow.draw(c, AURA[s.el], x, y - 10, 60 + k * 50, 0.6);
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = AURA[s.el]; c.lineWidth = 3;
    c.beginPath(); c.ellipse(x, y - 2, 40 * (0.5 + k * 0.5), 8, 0, 0, TAU); c.stroke();
    c.globalAlpha = 0.25 + k * 0.4;
    c.fillStyle = AURA[s.el];
    c.fillRect(x - 3, y - 600, 6, 600);
    c.globalAlpha = 1;
  }

  function drawPickup(c, p) {
    const def = PICKUPS[p.type];
    const x = p.x, y = p.y;
    c.globalAlpha = p.life < 2 ? (Math.sin(time * 20) > 0 ? 0.4 : 1) : 1;
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
    else if (p.type === 'power') { c.beginPath(); c.moveTo(x + 2, y - 9); c.lineTo(x - 6, y + 2); c.lineTo(x, y + 2); c.lineTo(x - 2, y + 9); c.lineTo(x + 6, y - 2); c.lineTo(x, y - 2); c.closePath(); c.fill(); }
    else { c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 7, y - 2); c.lineTo(x, y + 9); c.lineTo(x - 7, y - 2); c.closePath(); c.fill(); }
    c.globalAlpha = 1;
  }

  // one clean bar style for every fighter: dark rounded track, single fill colour
  function drawHeadBar(c, f, fill, w) {
    const hd = f.head();
    const h = 8, x = hd.x - w / 2, y = hd.y - 24 * f.s - 18;
    const r = clamp(f.hp / f.maxHp, 0, 1);
    c.fillStyle = 'rgba(20,18,28,0.72)';
    c.beginPath(); c.roundRect(x - 2, y - 2, w + 4, h + 4, 6); c.fill();
    if (r > 0) { c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, Math.max(h, w * r), h, 4); c.fill(); }
    if (f.shield > 0) { c.fillStyle = 'rgba(160,215,255,0.9)'; c.beginPath(); c.roundRect(x, y, Math.max(4, w * clamp(f.shield / f.maxHp, 0, 1)), h / 2, 2); c.fill(); }
    return y;
  }
  function drawEnemyBar(c, e) { drawHeadBar(c, e, '#e5484d', 50 * Math.max(1, e.s * 0.9)); }
  function drawPlayerMarker(c) {
    const f = player;
    const y = drawHeadBar(c, f, '#56d364', 62);
    // bobbing arrow so you can always find yourself
    const ax = f.head().x, ay = y - 14 + Math.sin(time * 5) * 3;
    c.fillStyle = ELEMENT_BY_ID[f.el].color;
    c.strokeStyle = 'rgba(20,18,28,0.85)'; c.lineWidth = 3; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(ax - 10, ay - 10); c.lineTo(ax + 10, ay - 10); c.lineTo(ax, ay + 2); c.closePath();
    c.stroke(); c.fill();
  }

  function drawTelegraph(c, e) {
    const hd = e.head();
    const k = Math.min(1, e.action.t / e.action.move.windup);
    c.font = `${Math.round(24 + k * 10)}px Bungee, Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 5; c.lineJoin = 'round'; c.strokeStyle = 'rgba(24,16,8,0.9)';
    const y = hd.y - 62 * e.s;
    c.strokeText('!', hd.x, y);
    c.fillStyle = k > 0.7 ? '#ff5a5a' : '#f5b041';
    c.fillText('!', hd.x, y);
  }

  function drawReticle(c) {
    const m = input.mouse;
    const el = ELEMENT_BY_ID[player.el];
    c.strokeStyle = rgba(el.color, 0.9); c.lineWidth = 2.5;
    c.beginPath(); c.arc(m.x, m.y, 12, 0, TAU); c.stroke();
    c.fillStyle = el.color; c.beginPath(); c.arc(m.x, m.y, 2.5, 0, TAU); c.fill();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + time * 1.5;
      c.beginPath(); c.moveTo(m.x + Math.cos(a) * 16, m.y + Math.sin(a) * 16); c.lineTo(m.x + Math.cos(a) * 22, m.y + Math.sin(a) * 22); c.stroke();
    }
  }

  function drawVignettes(c) {
    const cw = view.cw, ch = view.ch;
    const low = player && player.alive && state === 'play' && player.hp / player.maxHp < 0.3 ? (0.25 + Math.sin(time * 5) * 0.12) : 0;
    const a = Math.max(hurtFlash * 0.55, low);
    if (a > 0.01) {
      const g = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(200,20,40,${a})`);
      c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    }
    if (healFlash > 0.01) {
      const g = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.4, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      g.addColorStop(0, 'rgba(120,255,140,0)'); g.addColorStop(1, `rgba(120,255,140,${healFlash * 0.3})`);
      c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    }
    if (realmFlash > 0) { c.fillStyle = `rgba(255,255,255,${realmFlash * 0.6})`; c.fillRect(0, 0, cw, ch); }
  }

  /* ------------------------------------------------------------- api */
  function hud() {
    if (!player) return null;
    const boss = enemies.find(e => e.kind === 'boss' && e.alive && !e.decor);
    const kit = ELEMENT_BY_ID[player.el].moves;
    return {
      hp: Math.max(0, player.hp), maxHp: player.maxHp, shield: player.shield, el: player.el, elIdx: player.elIdx, loadout: player.loadout,
      swap: player.swapT / SWAP_CD,
      moves: kit.map(mv => ({ mv, left: player.cds[mv.id] || 0, full: mv.cd * (mv.slot !== 'main' ? pStats.cdMul : 1) })),
      kills: run ? run.kills : 0, essence: run ? run.essence : 0, combo: combo.n,
      wave: waveIdx, waves: stageDef ? stageDef.waves.length : 0,
      left: aliveEnemies().length + spawns.length + (stageDef && waveIdx >= 0 ? stageDef.waves.slice(waveIdx + 1).reduce((n, w) => n + w.length, 0) : 0),
      boss: boss ? { name: boss.ai.boss.name, title: boss.ai.boss.title, ratio: boss.hp / boss.maxHp, el: boss.el } : null,
      status: player.status,
    };
  }

  /* test hook used by automated playtests */
  const dev = {
    enemies: () => aliveEnemies(),
    player: () => player,
    use: (slot, x, y) => tryMove(player, ELEMENT_BY_ID[player.el].moves[slot], x, y),
    islands: () => islands,
  };

  return {
    dev, init, resize, update, render, start, quit, idleScene, hud, hooks,
    press, release, setKey, setJoy, setDirAim, setMouse, selectSlot, cycleSlot,
    setPreviewElement(id) { if (player && state === 'idle') { player.loadout = [id]; setPlayerElement(player, id, true); idleDemo.t = 0.3; } },
    get state() { return state; }, get mode() { return mode; }, get realmIdx() { return realmIdx; },
    get paused() { return paused; },
    set paused(v) { paused = v; if (v) { input.attack = false; input.left = input.right = false; input.joyX = 0; } },
    get run() { return run; },
  };
})();
