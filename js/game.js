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
  // camera: on small screens it zooms in and follows the player so fighters stay readable
  const cam = { z: 1, x: W / 2, y: H / 2, k: 1, ox: 0, oy: 0 };
  const fx = new FX();
  const amb = new Ambience();
  let realmIdx = 0, realm = REALMS[0], arena = ARENAS[0];
  let state = 'idle';
  let paused = false;
  let mode = null, stageDef = null, waveIdx = -1, waveTimer = 0, endlessWaveNo = 0;
  let islands = [], player = null, enemies = [];
  let projectiles = [], zones = [], waves = [], strikes = [], spawns = [], pickups = [];
  let eruptions = [], walls = [], mines = [], resonances = [], dragons = [];
  let vineSwing = null;
  let dummyTimer = 0;
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
    updateCam(0, true);
  }

  let shiftX = 0;   // screen-space offset for the menu scene (home menu column)
  function setShift(px) { shiftX = px; }

  function wantZoom() {
    if (dev.camOverride) return dev.camOverride.z;
    if (state === 'idle' || dev.cinematic) return 1;
    return clamp(0.64 / view.scale, 1, 1.42);
  }
  function updateCam(dt, snap) {
    const z = wantZoom();
    cam.z = snap ? z : lerp(cam.z, z, Math.min(1, dt * 3));
    let tx = W / 2, ty = H / 2;
    if (dev.camOverride) { tx = dev.camOverride.x; ty = dev.camOverride.y; }
    else if (cam.z > 1.001 && player) {
      const r = player.root;
      tx = r.x; ty = Math.min(r.y - 70, H * 0.62);
    }
    const vw = view.w / cam.z, vh = view.h / cam.z;
    tx = clamp(tx, view.x0 + vw / 2, view.x0 + view.w - vw / 2);
    ty = clamp(ty, view.y0 + vh / 2, view.y0 + view.h - vh / 2);
    const f = snap ? 1 : Math.min(1, dt * 5);
    cam.x = lerp(cam.x, tx, f); cam.y = lerp(cam.y, ty, f);
    cam.x = clamp(cam.x, view.x0 + vw / 2, view.x0 + view.w - vw / 2);
    cam.y = clamp(cam.y, view.y0 + vh / 2, view.y0 + view.h - vh / 2);
    cam.k = view.scale * cam.z;
    const sx = state === 'idle' ? shiftX : 0;
    cam.sx = snap ? sx : lerp(cam.sx || 0, sx, Math.min(1, dt * 6));
    cam.ox = view.cw / 2 - cam.x * cam.k + cam.sx;
    cam.oy = view.ch / 2 - cam.y * cam.k;
  }

  function setRealm(i) {
    realmIdx = i; realm = REALMS[i];
    amb.setRealm(realm, view);
    Sfx.setRealm(i);
    hooks.onRealm && hooks.onRealm(i);
  }

  // variant reseeds island shapes so each stage looks a little different
  function buildArena(a, variant = 0) {
    arena = a;
    islands = a.isl.map(([x, y, w, motion], i) => new Island(x, y, w, { seed: 101 + i * 37 + realmIdx * 11 + variant * 7919, motion }));
  }

  const arenaNamed = n => ARENAS.find(a => a.name === n) || ARENAS[0];
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
    eruptions = []; walls = []; mines = []; resonances = []; dragons = [];
    timeScale = 1; slowmo = 0; hitstop = 0; shake = 0; hurtFlash = 0; healFlash = 0; acc = 0;
    combo.n = 0; combo.t = 0; combo.best = 0;
    input.attack = false; input.queued = {}; vineSwing = null;
  }

  /* menu backdrop: the hero shows off moves against a sparring dummy */
  function idleScene(r) {
    state = 'idle'; mode = null; paused = false; run = null;
    setRealm(r);
    pStats = Save.playerStats();
    buildArena(arenaNamed('Crossing'));
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
    run = { kills: 0, ringouts: 0, hits: 0, essence: 0, essenceRemainder: 0, dmgTaken: 0, r: opts.r || 0, s: opts.s || 0, falls: 0 };
    if (mode === 'stage') {
      stageDef = buildStage(opts.r, opts.s);
      setRealm(opts.r);
      buildArena(stageDef.arena, 1 + opts.r * 16 + opts.s);
      waveIdx = -1;
    } else if (mode === 'tutorial' || mode === 'test') {
      stageDef = null;
      setRealm(0);
      buildArena(ARENAS[0]);
      if (mode === 'tutorial') run.tut = { moved: 0, jumped: 0, attacks: 0, powers: 0, hits: 0 };
    } else {
      stageDef = null;
      setRealm(0);
      buildArena(arenaNamed('Crossing'));
      endlessWaveNo = 0;
    }
    clearField();
    player = makePlayer();
    player.invuln = 1;
    if (mode === 'tutorial') {
      const sp = islands[0];
      const dummy = spawnEnemyAt({ type: 'grunt', element: 'nature', d: 0 }, sp.x + 200, sp.top, true);
      dummy.decor = true; dummy.facing = -1;
    }
    if (mode === 'test') spawnTestDummy();
    waveTimer = 1.0;
    pickupTimer = rand(9, 13);
    state = 'play';
    Platform.gameplayStart();
    hooks.onStart && hooks.onStart();
  }

  /* Testing ground: a passive dummy that can be killed and comes back */
  function spawnTestDummy() {
    const sp = islands[0];
    const d = spawnEnemyAt({ type: 'grunt', element: 'none', d: 0.4, hpMul: 3 }, sp.x + 220, sp.top, true);
    d.dummy = true; d.facing = -1;
    return d;
  }

  /* -------------------------------------------------------- enemies */
  // Keep rear limbs readable: shaded, but only subtly darker than the torso.
  function bodyColors(el, type) {
    const E = ELEMENT_BY_ID[el] || NEUTRAL;
    const vivid = E.color || E.deep || '#e6e1d6';
    const bodyMix = type === 'boss' ? 0.68 : type === 'brute' ? 0.76 : 0.82;
    const body = mixHex(E.deep, vivid, bodyMix);
    // Rear limbs and hands should be only a touch darker, not nearly black.
    const shade = mixHex(body, '#10131b', type === 'boss' ? 0.16 : 0.13);
    return [body, shade];
  }

  const AI_KINDS = new Set(['nova', 'updraft', 'dash', 'wave', 'slam', 'strike', 'zone', 'blink', 'shield', 'heal', 'beam', 'projectile', 'pillars', 'orbit', 'pull', 'crush', 'resonance']);
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

  function spawnEnemyAt(spec, x, y, instant, isl) {
    const T = ENEMY_TYPES[spec.type];
    const stats = enemyStats(spec.type, spec.d);
    const [body, shade] = bodyColors(spec.element, spec.type);
    const f = new Fighter({
      x, y: instant ? y : y - 520, facing: player && x > player.root.x ? -1 : 1, scale: spec.scale || T.scale,
      kind: spec.type, el: spec.element, body, shade, accent: AURA[spec.element], weight: T.weight,
      speed: T.speed * (1 + Math.min(spec.d, 1.2) * 0.3), jumpV: 1000, maxJumps: 2,
      hp: Math.round(stats.hp * (spec.hpMul || 1)),
    });
    f.team = 'enemy';
    f.ai = { stats, thinkT: 0.6, kit: enemyKit(spec.element, spec.type), boss: spec.boss || null, summoned: 0, d: spec.d, jumpCd: 0 };
    if (instant) { f.root.grounded = true; f.root.plat = islands.find(i => x >= i.left && x <= i.right && Math.abs(i.top - y) < 4) || null; }
    else { f.root.grounded = false; f.root.vy = 600; f.root.ghostTo = isl || null; }
    enemies.push(f);
    if (spec.type === 'boss') { hooks.onBoss && hooks.onBoss(f); shake = Math.max(shake, 12); Sfx.boom(1.5); }
    return f;
  }

  function queueSpawn(spec, placement = null) {
    let isl, x;
    if (placement) {
      isl = placement.isl;
      const margin = Math.min(45, isl.w * 0.18);
      x = clamp(placement.x, isl.left + margin, isl.right - margin);
    } else {
      const away = islands.filter(i => !(player && player.root.plat === i));
      isl = spec.type === 'boss' ? islands[0] : pick(away.length ? away : islands);
      const margin = Math.min(60, isl.w * 0.3);
      // Portals open as far from the hero as the island allows (single-island arenas included).
      x = rand(isl.left + margin, isl.right - margin);
      if (player) for (let k = 0; k < 6; k++) { const c = rand(isl.left + margin, isl.right - margin); if (Math.abs(c - player.root.x) > Math.abs(x - player.root.x)) x = c; }
      if (spec.type === 'boss') x = player.root.x < isl.x ? isl.right - 120 : isl.left + 120;
    }
    spawns.push({ spec, isl, ox: x - isl.x, t: 1.0, el: spec.element });
    Sfx.portal();
  }

  // Allocate portal positions per wave, not per enemy, so independently queued enemies
  // cannot accidentally cluster at the same rough spawn spot.
  function queueSpawnWave(specs) {
    if (!specs.length) return;
    if (specs.some(spec => spec.type === 'boss')) {
      specs.forEach(spec => queueSpawn(spec));
      return;
    }

    const maxPerPosition = specs.length === 2 ? 1 : 2;
    const makePositions = sourceIslands => {
      const positions = [];
      sourceIslands.forEach(isl => {
        const margin = Math.min(45, isl.w * 0.18);
        const left = isl.left + margin, right = isl.right - margin;
        const span = Math.max(0, right - left);
        // Use distinct left/right zones on small islands and three zones on wider islands.
        const ratios = span >= 420 ? [0.18, 0.5, 0.82] : span >= 180 ? [0.14, 0.86] : [0.5];
        ratios.forEach((ratio, zone) => {
          positions.push({ isl, x: left + span * ratio, key: islands.indexOf(isl) + ':' + zone, margin });
        });
      });
      return positions;
    };

    const awayIslands = islands.filter(isl => !(player && player.root.plat === isl));
    const awayPositions = makePositions(awayIslands);
    // Prefer platforms away from the player, but use the whole arena if that would
    // force enemies to reuse a rough position beyond the allowed limit.
    let positions = awayPositions.length * maxPerPosition >= specs.length
      ? awayPositions : makePositions(islands);

    const used = new Map();
    const placements = [];
    for (const spec of specs) {
      let available = positions.filter(pos => (used.get(pos.key) || 0) < maxPerPosition);
      if (!available.length) {
        positions = makePositions(islands);
        available = positions.filter(pos => (used.get(pos.key) || 0) < maxPerPosition);
      }

      // Spread across empty positions before allowing a second enemy into any one area.
      const minUsed = Math.min(...available.map(pos => used.get(pos.key) || 0));
      available = available.filter(pos => (used.get(pos.key) || 0) === minUsed);
      if (player) {
        available.sort((a, b) => {
          const da = Math.hypot(a.x - player.root.x, a.isl.top - player.root.y);
          const db = Math.hypot(b.x - player.root.x, b.isl.top - player.root.y);
          return db - da;
        });
        // Keep some randomness while favouring positions furthest from the player.
        available = available.slice(0, Math.min(3, available.length));
      }
      const pos = pick(available);
      const count = used.get(pos.key) || 0;
      used.set(pos.key, count + 1);
      // If a larger wave needs two enemies in the same rough area, stagger their
      // portal positions a little so they do not appear perfectly stacked.
      const offset = maxPerPosition === 2 ? (count === 0 ? -22 : 22) : rand(-8, 8);
      placements.push({ isl: pos.isl, x: clamp(pos.x + offset, pos.isl.left + pos.margin, pos.isl.right - pos.margin) });
    }

    specs.forEach((spec, i) => queueSpawn(spec, placements[i]));
  }

  const aliveEnemies = () => enemies.filter(e => e.alive && !e.decor);
  // the sparring dummy (menu demo / training) can be hit; elsewhere decor fighters are ignored
  const blocked = t => t.decor && !(mode === 'tutorial' || state === 'idle');
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
    const lockKinds = { dive: 1, dragon: 1, nova: 1, beam: 1, strike: 1, zone: 1, heal: 1, shield: 1, slam: 1, pillars: 1, pull: 1, crush: 1, resonance: 1, wall: 1 };
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
    if (mv.kind === 'dive' && f.dive) {
      f.dive.t -= dt;
      if (f.dive.t <= 0 && !f.slam) { f.slam = true; f.root.vy = 1900; f.root.vx = clamp((f.dive.tx - f.root.x) * 2.6, -1000, 1000); }
      act.t = Math.min(act.t, mv.windup + 0.01);
      if (f.slam && f.root.grounded) { f.slam = false; f.dive = null; diveImpact(f, act); act.t = mv.windup + mv.active; }
      return;
    }
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
          const pr = { owner: f, team: f.team, mv, el, x, y, px: x, py: y, vx, vy, r: mv.radius, life: mv.life || 3, hitSet: new Set(), tickT: new Map(), rot: rand(0, 6), trail: [], age: 0, bounces: 0 };
          if (mv.spreadTargets) {
            const foes = opponents(f).filter(t => t.alive && !blocked(t)).sort((a, b) => Math.abs(a.root.x - f.root.x) - Math.abs(b.root.x - f.root.x));
            if (foes.length) pr.target = foes[i % foes.length];
          }
          projectiles.push(pr);
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
        f.shield = mv.absorb; f.shieldT = mv.dur; f.shieldEl = el;
        heal(f, mv.heal);
        Sfx.shield();
        fx.ring(f.center().x, f.center().y, el === 'steel' ? '#dfe5ee' : '#7cc8ff', 90, 0.4);
        break;
      case 'heal': {
        f.regen = (f.maxHp * mv.heal) / mv.dur; f.regenT = mv.dur;
        const st = f.status; st.burn = st.poison = st.chill = st.soak = st.root = st.shock = 0;
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
        const targets = opponents(f).filter(t => t.alive && !blocked(t)).sort((a, b) => dist(a.root.x, a.root.y, act.tx, act.ty) - dist(b.root.x, b.root.y, act.tx, act.ty)).slice(0, mv.targets);
        targets.forEach((t, i) => strikes.push({ owner: f, mv, el, target: t, t: 0.25 + i * mv.delay, x: t.center().x }));
        if (!targets.length) strikes.push({ owner: f, mv, el, target: null, t: 0.25, x: act.tx, y: act.ty });
        Sfx.charge();
        break;
      }
      case 'pillars': {
        // flame pillars march forward along the ground, one after another
        for (let i = 0; i < mv.n; i++) {
          const x = f.root.x + f.facing * (90 + i * mv.gap);
          const isl = islands.filter(q => x >= q.left && x <= q.right && q.top >= f.root.y - 160).sort((a, b) => a.top - b.top)[0];
          if (isl) eruptions.push({ owner: f, mv, el, isl, ox: x - isl.x, x, y: isl.top, t: 0.05 + i * mv.delay, warn: 0.05 + i * mv.delay });
        }
        Sfx.rumble();
        break;
      }
      case 'dive': {
        // leap high, then dive at the aim point on the nearest island under it
        const isl = platformBelow(act.tx, Math.min(act.ty, f.root.y) - 400, 1400) || f.root.plat || nearestIsland(f.root.x);
        f.dive = { t: 0.3, tx: clamp(act.tx, isl.left + 40, isl.right - 40) };
        f.root.vy = -1250; f.root.grounded = false; f.root.plat = null;
        for (let i = 0; i < 16; i++) fx.add({ kind: 'ember', x: f.root.x + rand(-20, 20), y: f.root.y - rand(0, 20), vx: rand(-80, 80), vy: rand(80, 260), color: pick(['#ffcf5a', '#ff8a3d']), size: rand(6, 10), life: rand(0.3, 0.5), drag: 2 });
        Sfx.dash('fire');
        break;
      }
      case 'dragon': {
        // a great serpent dragon sweeps across the arena from behind the caster
        const dir = f.facing;
        const y0 = clamp(f.root.y - 150, 180, 640);
        dragons.push({ owner: f, mv, el, dir, t: 0, x0: dir > 0 ? view.x0 - 260 : view.x0 + view.w + 260, span: view.w + 520, y0, path: [], hit: new Map() });
        shake = Math.max(shake, 14); realmFlash = Math.max(realmFlash, 0.25); Sfx.boom(1.6); Sfx.rumble();
        break;
      }
      case 'orbit':
        f.orbit = { t: mv.dur, mv, el, a: 0, hit: new Map() };
        Sfx.charge();
        break;
      case 'pull': {
        const c = f.center();
        for (const t of opponents(f)) {
          if (!t.alive || blocked(t)) continue;
          const tc = t.center(), d = dist(c.x, c.y, tc.x, tc.y);
          if (d > mv.radius) continue;
          const dir = Math.sign(c.x - tc.x) || 1;
          applyHit(f, t, { mv, el, dmg: mv.dmg, knock: 0, lift: 0, dirX: dir, dirY: 0, idx: P.PELVIS, px: tc.x, py: tc.y, quiet: true });
          if (t.mode === 'active') { t.root.vx = dir * mv.pullV * clamp(d / mv.radius + 0.35, 0.5, 1.1); t.root.vy = -240; t.root.grounded = false; t.root.plat = null; t.knockT = 0.45; }
          else t.impulse(P.PELVIS, dir * mv.pullV * 0.6, -200, 1);
          t.status.shock = Math.max(t.status.shock, mv.stun);
          fx.arc(tc.x, tc.y, c.x, c.y, '#cfd6e0', 0.25);
          for (let i = 0; i < 6; i++) { const u = rand(0.2, 1); fx.add({ kind: 'spark', x: lerp(c.x, tc.x, u), y: lerp(c.y, tc.y, u) + rand(-14, 14), vx: dir * 700, vy: 0, color: '#e6ebf2', size: 4, life: 0.2 }); }
        }
        fx.ring(c.x, c.y, '#cfd6e0', 70, 0.3, 6);
        Sfx.zap();
        break;
      }
      case 'wall': {
        const x = clamp(f.root.x + f.facing * mv.dist, 30, W - 30);
        const isl = islands.filter(q => x >= q.left - 20 && x <= q.right + 20 && q.top >= f.root.y - 80).sort((a, b) => a.top - b.top)[0];
        const base = isl ? isl.top : f.root.y;
        walls.push({ owner: f, team: f.team, el, isl, ox: isl ? x - isl.x : 0, x, bottom: base, top: base - mv.wallH, t: 0, dur: mv.dur });
        for (let i = 0; i < 18; i++) fx.add({ kind: 'shard', x: x + rand(-14, 14), y: base - rand(0, mv.wallH), vx: rand(-60, 60), vy: -rand(80, 260), color: pick(['#9ff0e8', '#e6fffb']), size: rand(5, 8), life: 0.45, drag: 3 });
        Sfx.shield();
        break;
      }
      case 'mines': {
        for (let i = 0; i < mv.n; i++) {
          const x = f.root.x + f.facing * (70 + i * mv.spreadX);
          const isl = islands.filter(q => x >= q.left + 10 && x <= q.right - 10 && q.top >= f.root.y - 120).sort((a, b) => a.top - b.top)[0];
          if (!isl) continue;
          mines.push({ owner: f, team: f.team, mv, el, isl, ox: x - isl.x, x, y: isl.top, t: 0, arm: 0.6 + i * 0.1 });
          fx.burst(x, isl.top - 10, '#9ff0e8', 8, 160, { kind: 'shard' });
        }
        Sfx.cast(el);
        break;
      }
      case 'crush': {
        const c = f.center();
        for (const t of opponents(f)) {
          if (!t.alive || blocked(t)) continue;
          const tc = t.center();
          if (dist(c.x, c.y, tc.x, tc.y) > mv.radius) continue;
          const air = !t.root.grounded || t.mode !== 'active';
          applyHit(f, t, { mv, el, dmg: air ? mv.airDmg : mv.dmg, knock: 0, lift: 0, dirX: 0, dirY: 1, idx: P.PELVIS, px: tc.x, py: tc.y });
          if (air) {
            if (t.mode === 'active') { t.root.vy = mv.slamV; t.root.vx *= 0.3; } else t.impulse(P.PELVIS, 0, mv.slamV * 0.7, 1);
            for (let i = 0; i < 5; i++) fx.add({ kind: 'spark', x: tc.x + rand(-26, 26), y: tc.y - rand(60, 140), vx: 0, vy: 1400, color: '#b9a6ff', size: 6, life: 0.22 });
          } else t.status.shock = Math.max(t.status.shock, mv.stun);
          fx.ring(t.root.x, t.root.y, '#b9a6ff', 60, 0.35, 6);
        }
        shake = Math.max(shake, 14);
        Sfx.boom(0.9);
        break;
      }
      case 'resonance': {
        const c = f.center();
        for (const t of opponents(f)) {
          if (!t.alive || blocked(t)) continue;
          const tc = t.center();
          if (dist(c.x, c.y, tc.x, tc.y) > mv.radius) continue;
          resonances.push({ owner: f, mv, el, target: t, t: mv.delay, max: mv.delay });
        }
        fx.ring(c.x, c.y, '#ffc6a8', mv.radius, 0.5, 4);
        Sfx.charge();
        break;
      }
      case 'rewind': {
        // snap back to the latest safe (grounded) spot from ~1.5s ago
        const h = f.hist || [];
        let to = null;
        for (const e of h) if (e.t <= time - mv.back) to = e;
        if (!to) to = h[0];
        if (to) {
          const c = f.center();
          for (let i = 0; i < 3; i++) fx.add({ kind: 'ring', x: c.x, y: c.y, color: '#ffc6a8', size: 50 + i * 30, life: 0.3 + i * 0.1, width: 4 });
          teleport(f, to.x, to.y);
          f.root.vx = 0; f.root.vy = 0;
          const st = f.status; st.burn = st.poison = st.chill = st.soak = st.root = st.shock = 0; st.freeze = 0;
          heal(f, f.maxHp * mv.heal);
          f.invuln = Math.max(f.invuln, 0.5);
          const c2 = f.center();
          fx.ring(c2.x, c2.y, '#ffc6a8', 90, 0.4, 8);
          fx.burst(c2.x, c2.y, '#ffc6a8', 20, 280);
        }
        Sfx.blink();
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
    // The fist is still travelling through its wind-up on the first active frame.
    // Aim the actual hit and its wind effect at the locked target, never along the
    // temporary wind-up hand position (which can point backwards).
    let dx = (act.tx ?? f.root.x + Math.cos(f.aim) * mv.reach) - n.x;
    let dy = (act.ty ?? f.root.y + Math.sin(f.aim) * mv.reach) - n.y;
    let l = Math.hypot(dx, dy);
    if (l < 1) { dx = Math.cos(f.aim); dy = Math.sin(f.aim); l = 1; }
    const ux = dx / l, uy = dy / l;
    const tx = n.x + ux * mv.reach * f.s;
    const ty = n.y + uy * mv.reach * f.s;
    act.tip = { x: tx, y: ty, nx: n.x, ny: n.y };
    act.trail = act.trail || [];
    if (!act.gust && act.el === 'wind') {
      act.gust = true;
      // Original layered Gale crescents, emitted low and just ahead of the torso.
      // Their travel follows aim, while the lower origin keeps shallow swings clear of the head.
      const ang = Math.atan2(uy, ux);
      const sx = n.x + ux * 24 * f.s;
      const sy = n.y + uy * 24 * f.s + (27 + Math.max(0, -uy * 52)) * f.s;
      for (let i = 0; i < 3; i++) {
        const speed = 260 + i * 120;
        fx.add({
          kind: 'crescent',
          x: sx, y: sy,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          ang, size: 34 + i * 16, color: '#e6fff7',
          life: 0.28 + i * 0.05, drag: 3, add: true
        });
      }
      for (let i = 0; i < 6; i++) {
        const b = ang + rand(-0.35, 0.35), v = rand(500, 900);
        fx.add({ kind: 'spark', x: sx, y: sy, vx: Math.cos(b) * v, vy: Math.sin(b) * v, color: '#dffcf2', size: rand(4, 7), life: rand(0.18, 0.3), drag: 4, add: true });
      }
    }
    act.trail.push({ x: tx, y: ty, ix: lerp(n.x, tx, 0.45), iy: lerp(n.y, ty, 0.45) });
    if (act.trail.length > 10) act.trail.shift();
    const r = mv.radius * f.s;
    let mul = 1, kmul = 1;
    if (mv.combo && act.comboStep === mv.combo.n - 1) { mul = mv.combo.dmg; kmul = mv.combo.knock; }
    for (const t of opponents(f)) {
      if (act.hitSet.has(t) || blocked(t)) continue;
      const hit = t.hitCapsule(n.x, n.y, tx, ty, r);
      if (!hit) continue;
      act.hitSet.add(t);
      fx.ring(hit.px, hit.py, (ELEMENT_BY_ID[act.el] || NEUTRAL).color, 46, 0.25, 5);
      applyHit(f, t, { mv, el: act.el, dmg: mv.dmg * mul, knock: mv.knock * kmul, lift: mv.lift, dirX: f.facing, dirY: Math.sin(f.aim) * 0.6, idx: hit.idx, head: hit.head, px: hit.px, py: hit.py });
    }
    if (f.isPlayer) for (const p of pickups) if (!p.dead && segPointDist(n.x, n.y, tx, ty, p.x, p.y).d < r + 24) collectPickup(p);
  }

  function dashTick(f, act) {
    const mv = act.move;
    const n = f.pts[P.NECK], pv = f.pelvis;
    for (const t of opponents(f)) {
      if (act.hitSet.has(t) || blocked(t)) continue;
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
      if (!t.alive || blocked(t)) continue;
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
    fx.burst(x, y, col, 16, mv.radius * 2.2);
    novaShapes(x, y, mv.radius, el, col);
    if (el === 'fire') { for (let i = 0; i < 10; i++) fx.add({ kind: 'smoke', x: x + rand(-50, 50), y: y + rand(-30, 30), vy: -rand(30, 80), color: '#3a2a2a', size: rand(16, 28), life: rand(0.7, 1.2), add: false }); Sfx.boom(0.8); }
    else if (el === 'frost') Sfx.freeze();
    else if (el === 'lightning') { for (let i = 0; i < 5; i++) { const a = rand(0, TAU); fx.arc(x, y, x + Math.cos(a) * mv.radius, y + Math.sin(a) * mv.radius, '#a77bff', 0.2); } Sfx.zap(); }
    else if (el === 'earth') Sfx.boom(0.6);
    else Sfx.whoosh();
    shake = Math.max(shake, 8);
    for (const t of opponents(f)) {
      if (blocked(t)) continue;
      const c = t.center();
      if (dist(x, y, c.x, c.y) > mv.radius + 30 * t.s) continue;
      const dx = c.x - x;
      applyHit(f, t, { mv, el, dmg: mv.dmg || 0, knock: mv.knock, lift: mv.lift, dirX: Math.sign(dx) || f.facing, dirY: 0, idx: P.PELVIS, px: c.x, py: c.y });
    }
  }

  // element-shaped debris for bursts so each nova reads differently
  function novaShapes(x, y, radius, el, col) {
    const n = 18, sp = radius * 3.2;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rand(-0.12, 0.12), v = sp * rand(0.75, 1.1);
      const base = { x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 4.5, life: rand(0.35, 0.5) };
      if (el === 'fire' || el === 'dragon') fx.add(Object.assign(base, { kind: 'flame', color: el === 'dragon' ? pick(['#ffcf5a', '#ff8a3d', '#fff0b0']) : pick(['#ff6a2a', '#ff8a3d', '#ffb347']), size: rand(8, 12), add: true }));
      else if (el === 'frost') fx.add(Object.assign(base, { kind: 'shard', color: pick(['#bfeaff', '#9fe6ff', '#e6f8ff']), size: rand(7, 10), add: true }));
      else if (el === 'arcane' || el === 'light') fx.add(Object.assign(base, { kind: 'star', color: el === 'light' ? '#fff3b0' : pick(['#ff8ad8', '#ffd6f2']), size: rand(7, 11), vr: rand(-8, 8), add: true }));
      else if (el === 'wind') fx.add(Object.assign(base, { kind: 'spark', color: '#e6fff7', size: rand(5, 8), add: true }));
      else if (el === 'crystal') fx.add(Object.assign(base, { kind: 'shard', color: pick(['#9ff0e8', '#e6fffb']), size: rand(7, 10), add: true }));
      else fx.add(Object.assign(base, { kind: 'spark', color: col, size: rand(5, 8), add: true }));
    }
  }

  function diveImpact(f, act) {
    const mv = act.move, x = f.root.x, y = f.root.y;
    nova(f, x, y - 30, { radius: mv.radius, dmg: mv.dmg, knock: mv.knock, lift: mv.lift, burn: mv.burn }, 'dragon');
    const isl = f.root.plat;
    if (isl) for (const k of [-1, 1]) for (let i = 1; i <= 2; i++) {
      const ex = x + k * i * 105;
      if (ex > isl.left + 10 && ex < isl.right - 10) eruptions.push({ owner: f, mv: { radius: 50, dmg: mv.dmg * 0.4, knock: 380, lift: 1.3, burn: mv.burn }, el: 'dragon', isl, ox: ex - isl.x, x: ex, y: isl.top, t: 0.06 * i, warn: 0.06 * i });
    }
    fx.chunks(x, y, '#5c3b37', 14, 520, 9);
    shake = Math.max(shake, 18); Sfx.boom(1.4);
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
    if (z.style === 'rift' || z.style === 'antigrav') Sfx.rift(); else Sfx.thorns();
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
    if (f.isPlayer) n *= pStats.healMul;
    const before = f.hp;
    f.hp = Math.min(f.maxHp, f.hp + n);
    const got = f.hp - before;
    if (got >= 1 && Save.data.settings.numbers) fx.text(f.center().x + 20, f.center().y - 80, '+' + Math.round(got), '#9ae66e', 22);
    if (f.isPlayer && got >= 1) healFlash = 0.4;
  }

  /* ------------------------------------------------------------- hits */
  function applyHit(att, t, o) {
    if (t.decor) {
      // the menu / training dummy reacts but never dies
      if (run && run.tut && att && att.isPlayer) run.tut.hits++;
      t.flash = 1;
      // in training the dummy flies properly so it can be knocked off; the menu dummy stays tame
      const k = mode === 'tutorial' ? 1.35 : 0.6;
      t.knock(o.dirX * o.knock * k, -Math.max(o.lift, mode === 'tutorial' ? 0.35 : 0) * o.knock * k, o.idx, o.knock * k > (mode === 'tutorial' ? 300 : 360) ? 0.6 : 0);
      fx.burst(o.px, o.py, (ELEMENT_BY_ID[o.el] || NEUTRAL).color, 10, 240);
      return;
    }
    if (!t.alive) { const k = o.knock * 0.9; t.impulse(o.idx, o.dirX * k, (o.dirY - o.lift) * k, 0.6); return; }
    if (t.invuln > 0) return;
    const enemyTarget = t.team === 'enemy';
    if (att && att.isPlayer && enemyTarget) o = Object.assign({}, o, { knock: o.knock * pStats.knockDealtMul });
    let dmg = o.dmg;
    if (att) dmg *= att.isPlayer ? pStats.dmgMul : att.ai ? att.ai.stats.dmgMul * (att.kind === 'boss' ? 0.5 : 0.66) : 1;   // enemy hit scaling (bosses much gentler)
    let mul = 1, tag = null;
    if (enemyTarget) mul = affinityMul(t.el, o.el);
    dmg *= mul;
    if (o.head && !o.quiet) dmg *= t.kind === 'boss' || t.kind === 'brute' ? 1.15 : 1.35;
    const mv = o.mv || {};
    if (mv.shatter && t.status.freeze > 0) { dmg *= mv.shatter; t.status.freeze = 0; tag = 'SHATTER'; fx.chunks(o.px, o.py, '#d8f6ff', 18, 460, 9); Sfx.freeze(); }
    for (const cb of COMBOS) {
      if (!cb.when(t.status, o.el, t)) continue;
      dmg *= cb.mul; tag = tag || cb.name.toUpperCase();
      if (cb.knock) o = Object.assign({}, o, { knock: o.knock * cb.knock });
      if (cb.clear) { t.status[cb.clear] = 0; fx.chunks(o.px, o.py, '#d8f6ff', 18, 460, 9); Sfx.freeze(); }
      break;
    }
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
    if (mv.burn) { st.burn = Math.max(st.burn, mv.burn.dur); st.burnDps = mv.burn.dps * (att && att.isPlayer ? pStats.dmgMul : 0.62); }
    if (COMBO_MARKS[o.el] && t.alive) st[COMBO_MARKS[o.el]] = 2.5;
    if (mv.poison) { st.poison = Math.max(st.poison, mv.poison.dur); st.poisonDps = mv.poison.dps * (att && att.isPlayer ? pStats.dmgMul : 0.62); }
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
      if (tag && !(t.tagCd > 0)) { fx.text(o.px, o.py - 96, tag, '#ffe066', 26, { dur: 1 }); t.tagCd = 0.6; }   // one label per foe at a time
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
    if (t.dummy) {
      fx.burst(c.x, c.y, '#ece6da', 20, 300); fx.ring(c.x, c.y, '#ece6da', 100, 0.45, 8); Sfx.kill();
      if (ringout) t.gone = true;
      dummyTimer = 1.5;
      return;
    }
    fx.burst(c.x, c.y, t.accent, 26, 360);
    fx.ring(c.x, c.y, t.accent, 110, 0.5, 10);
    if (run) {
      run.kills++;
      Save.data.stats.kills++;
      const reward = t.kind === 'boss' ? 25 : t.kind === 'brute' ? 4 : 2;
      const at = ringout && player ? player.center() : c;
      grantEssence(reward + (ringout ? 1 : 0), clamp(at.x, 60, W - 60), clamp(at.y - 80, 60, H - 60));
    }
    Sfx.kill();
    hitstop = Math.max(hitstop, 0.08);
    shake = Math.max(shake, t.kind === 'boss' ? 24 : 10);
    if (t.kind === 'boss') {
      Sfx.boom(2); fx.ring(c.x, c.y, t.accent, 300, 0.9, 16); slowmo = 1.6; Save.data.stats.bosses++;
      // the boss's reinforcements collapse with it
      if (mode === 'stage') {
        spawns.length = 0;
        for (const e of aliveEnemies()) { const ec = e.center(); e.die(0, -300, P.PELVIS); fx.burst(ec.x, ec.y, e.accent, 18, 300); fx.ring(ec.x, ec.y, e.accent, 90, 0.45, 8); }
      }
    }
    hooks.onKill && hooks.onKill(t, ringout);
    if (state === 'play' && aliveEnemies().length === 0 && spawns.length === 0) waveCleared();
  }

  function grantEssence(n, x, y) {
    n = Math.round(n);
    if (!run || mode === 'test') return;
    // Carry fractional bonus between rewards so small drops benefit from Scavenger too.
    const scaled = n * pStats.essenceMul + (run.essenceRemainder || 0);
    n = Math.floor(scaled);
    run.essenceRemainder = scaled - n;
    run.essence += n;
    fx.text(x, y, '+' + n, '#ffd76a', 22, { dur: 1.2, vy: -50 });
  }

  function ringOut(f) {
    if (f.isPlayer && (mode === 'tutorial' || mode === 'test')) {
      const sp = spawnPoint();
      teleport(f, sp.x, sp.y - 300);
      f.mode = 'active'; f.m = 1; f.stunT = 0; f.action = null;
      if (mode === 'tutorial') hooks.onToast && hooks.onToast('Careful! In battle, falling ends the run');
      return;
    }
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
      p.age += dt;
      p.px = p.x; p.py = p.y;
      p.rot += dt * 8;
      if (mv.grow) p.r = mv.radius + p.age * mv.grow;
      if (mv.boomerang && p.age > mv.boomerang && p.owner.alive) {
        // fly back to the thrower and vanish on arrival
        const oc = p.owner.center(), d = dist(p.x, p.y, oc.x, oc.y), sp = mv.speed * 1.1;
        if (d < 40) { p.dead = true; continue; }
        p.vx = lerp(p.vx, (oc.x - p.x) / d * sp, 0.18); p.vy = lerp(p.vy, (oc.y - p.y) / d * sp, 0.18);
        if (!p.returning) { p.returning = true; p.tickT.clear(); }
      }
      if (mv.homing) {
        let best = null, bd = 700;
        if (p.target && p.target.alive) best = p.target.chest();
        else for (const t of opponents(p.owner)) { if (!t.alive || blocked(t)) continue; const c = t.chest(); const d = dist(p.x, p.y, c.x, c.y); if (d < bd) { bd = d; best = c; } }
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
      // prism walls send enemy shots back the way they came
      for (const w of walls) {
        if (w.team === p.team) continue;
        if ((p.px - w.x) * (p.x - w.x) <= 0 && p.y > w.top - 6 && p.y < w.bottom) {
          p.vx = -p.vx; p.x = w.x + Math.sign(p.vx) * 16; p.team = w.team; p.owner = w.owner; p.hitSet.clear(); p.tickT.clear();
          fx.burst(w.x, p.y, '#e6fffb', 10, 260, { kind: 'shard' }); Sfx.shield();
        }
      }

      for (const t of opponents(p.owner)) {
        if (blocked(t) || t.gone || (!t.alive && t.deadT > 2)) continue;
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
        if (mv.hook && t.alive) {
          // reel the caught foe in to the thrower
          const dir = Math.sign(p.owner.root.x - t.root.x) || 1;
          if (t.mode === 'active') { t.root.vx = dir * mv.hook * clamp(Math.abs(p.owner.root.x - t.root.x) / 500 + 0.4, 0.5, 1.2); t.root.vy = -340; t.root.grounded = false; t.root.plat = null; t.knockT = 0.4; }
          else t.impulse(P.PELVIS, dir * mv.hook * 0.6, -260, 1);
          t.status.shock = Math.max(t.status.shock, 0.3);
          fx.arc(hit.px, hit.py, p.owner.hand().x, p.owner.hand().y, '#b9a6ff', 0.2);
        }
        if (!mv.pierce) { p.dead = true; detonate(p, hit.px, hit.py); break; }
      }
      if (p.dead) continue;
      if (p.team === 'player') for (const pk of pickups) if (!pk.dead && segPointDist(p.px, p.py, p.x, p.y, pk.x, pk.y).d < p.r + 24) collectPickup(pk);
      if (!mv.ghost) {
        for (const isl of islands) {
          if (p.x < isl.left || p.x > isl.right) continue;
          if ((p.py <= isl.prevTop && p.y >= isl.top) || (p.y > isl.top + 4 && isl.solidAt(p.x, p.y))) {
            if (mv.bounce && p.bounces < mv.bounce) {
              // ricochet: off the top surface bounce up, otherwise off the side
              p.bounces++;
              if (p.py <= isl.prevTop + 2) { p.y = isl.top - 1; p.vy = -Math.abs(p.vy) * 0.85; }
              else { p.x = p.px; p.vx = -p.vx * 0.9; }
              p.hitSet.clear();
              fx.burst(p.x, p.y, '#9ff0e8', 8, 220, { kind: 'shard' }); Sfx.thud();
              break;
            }
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
        if (hit.has(t) || !t.alive || blocked(t)) continue;
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
      case 'dragonfire': for (let i = 0; i < 2; i++) fx.add({ kind: 'ember', x: p.x + rand(-8, 8), y: p.y + rand(-8, 8), vx: p.vx * 0.15 + rand(-40, 40), vy: rand(-90, -20), color: pick(['#ffcf5a', '#ff8a3d', '#ff5a1f']), size: rand(7, 12), life: rand(0.25, 0.4), drag: 2 }); break;
      case 'fireball': if (r < 0.8) fx.add({ x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-60, 0), color: pick(['#ffb347', '#ff6a2a', '#ffd76a']), size: rand(6, 11), life: rand(0.25, 0.45) }); break;
      case 'shard': case 'lance': if (r < 0.4) fx.add({ x: p.x, y: p.y, vx: rand(-20, 20), vy: rand(-20, 20), color: '#c9f2ff', size: rand(3, 5), life: 0.4 }); break;
      case 'voidorb': if (r < 0.7) fx.add({ x: p.x, y: p.y, vx: rand(-40, 40), vy: rand(-40, 40), color: pick(['#c08bff', '#6a35d0']), size: rand(5, 10), life: 0.45 }); break;
      case 'bolt': if (r < 0.6) fx.add({ kind: 'spark', x: p.x, y: p.y, vx: rand(-300, 300), vy: rand(-300, 300), color: '#fff27a', size: 4, life: 0.15 }); break;
      case 'cyclone': if (r < 0.9) { const a = rand(0, TAU); fx.add({ x: p.x + Math.cos(a) * 40, y: p.y + rand(-60, 50), vx: -Math.sin(a) * 200, vy: -rand(80, 200), color: '#e6fff7', size: rand(3, 6), life: 0.35 }); } break;
      case 'spit': if (r < 0.5) fx.add({ kind: 'drop', x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-20, 20), g: 900, color: pick(['#a6e35b', '#6fbf2e']), size: rand(2, 4), life: 0.45, add: false }); break;
      case 'star': if (r < 0.6) fx.add({ kind: 'star', x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-30, 30), color: pick(['#ff8ad8', '#ffd6f2']), size: rand(4, 7), vr: rand(-6, 6), life: 0.4, add: true }); break;
      case 'saw': if (r < 0.4) fx.add({ kind: 'spark', x: p.x, y: p.y + 14, vx: rand(-260, 260), vy: -rand(60, 260), color: '#ffe3a6', size: 3, life: 0.2 }); break;
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
        if (w.hitSet.has(t) || blocked(t) || !t.alive) continue;
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
        if (!t.alive || blocked(t)) continue;
        const c = t.center();
        const inside = z.style === 'thorns' ? Math.abs(t.root.x - z.x) < z.r && Math.abs(t.root.y - z.y) < 40 : dist(c.x, c.y, z.x, z.y) < z.r;
        if (!inside) continue;
        if (z.style === 'antigrav') {
          if (t.mode === 'active') { t.root.vy = Math.min(lerp(t.root.vy, -260, 0.25), t.root.vy); t.root.vx *= 0.9; t.root.grounded = false; t.root.plat = null; t.knockT = Math.max(t.knockT, 0.2); }
          else t.impulse(P.PELVIS, 0, -60, 0.3);
        }
        if (tick) applyHit(z.owner, t, { mv: null, el: z.el, dmg: z.dps * 0.25, knock: z.style === 'rift' || z.style === 'antigrav' ? 0 : 60, lift: 0, dirX: 0, dirY: 1, idx: P.PELVIS, px: c.x, py: c.y, quiet: true, zoneRoot: z.root });
      }
      if (z.style === 'antigrav' && Math.random() < 0.8) fx.add({ x: z.x + rand(-z.r, z.r) * 0.8, y: z.y + rand(0, z.r) * 0.8, vy: -rand(120, 260), color: pick(['#b9a6ff', '#e4dcff']), size: rand(3, 6), life: 0.6 });
      if (z.style === 'toxic' && Math.random() < 0.5) fx.add({ x: z.x + rand(-z.r, z.r) * 0.7, y: z.y + rand(-z.r, z.r) * 0.4, vy: -rand(20, 60), color: pick(['#a6e35b', '#6fbf2e']), size: rand(4, 8), life: 0.6 });
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

  /* fire pillars, prism walls, geode mines, resonance tags, orbiting stars, rewind history */
  function updateSpecials(dt) {
    for (const e of eruptions) {
      e.t -= dt;
      e.x = e.isl.x + e.ox; e.y = e.isl.top;
      if (e.t > 0 || e.done) continue;
      e.done = true;
      const mv = e.mv;
      for (let i = 0; i < 22; i++) fx.add({ kind: 'ember', x: e.x + rand(-mv.radius * 0.5, mv.radius * 0.5), y: e.y - rand(0, 30), vx: rand(-40, 40), vy: -rand(400, 900), color: pick(['#ff6a2a', '#ff8a3d', '#ffb347']), size: rand(9, 15), life: rand(0.35, 0.6), drag: 2.5 });
      fx.add({ kind: 'beam', x: e.x, y: e.y, color: '#ff8a3d', size: mv.radius * 0.7, life: 0.35 });
      fx.chunks(e.x, e.y, '#5c3b37', 6, 420, 7);
      for (const t of opponents(e.owner)) {
        if (!t.alive || blocked(t)) continue;
        if (Math.abs(t.root.x - e.x) > mv.radius + 10 * t.s || t.root.y < e.y - 230 || t.root.y > e.y + 30) continue;
        const c = t.center();
        applyHit(e.owner, t, { mv, el: e.el, dmg: mv.dmg, knock: mv.knock, lift: mv.lift, dirX: Math.sign(t.root.x - e.owner.root.x) || 1, dirY: -1, idx: P.PELVIS, px: c.x, py: c.y });
      }
      shake = Math.max(shake, 6); Sfx.boom(0.4);
    }
    eruptions = eruptions.filter(e => !e.done || e.t > -0.4);

    for (const w of walls) {
      w.t += dt;
      if (w.isl) { const h = w.bottom - w.top; w.x = w.isl.x + w.ox; w.bottom = w.isl.top; w.top = w.bottom - h; }
      for (const t of opponents(w.owner)) {
        if (!t.alive || t.mode !== 'active') continue;
        if (Math.abs(t.root.x - w.x) < 22 && t.root.y > w.top && t.root.y < w.bottom + 4) {
          const side = Math.sign(t.root.x - w.x) || Math.sign(w.x - w.owner.root.x) || 1;
          t.root.x = w.x + side * 23; t.root.vx = side * Math.max(Math.abs(t.root.vx), 160);
        }
      }
    }
    walls = walls.filter(w => w.t < w.dur);

    for (const m of mines) {
      m.t += dt;
      m.x = m.isl.x + m.ox; m.y = m.isl.top;
      if (m.t < m.arm || m.done) continue;
      const near = opponents(m.owner).some(t => t.alive && !blocked(t) && dist(t.root.x, t.root.y - 30, m.x, m.y - 12) < 80);
      if (near || m.t > m.mv.dur) {
        m.done = true;
        if (near) nova(m.owner, m.x, m.y - 16, { radius: m.mv.radius, dmg: m.mv.dmg, knock: m.mv.knock, lift: m.mv.lift }, m.el);
        else fx.burst(m.x, m.y - 10, '#9ff0e8', 8, 140, { kind: 'shard' });
      }
    }
    mines = mines.filter(m => !m.done);

    for (const r of resonances) {
      r.t -= dt;
      if (r.t > 0 || r.done) continue;
      r.done = true;
      const t = r.target;
      if (!t.alive) continue;
      const c = t.center();
      applyHit(r.owner, t, { mv: r.mv, el: r.el, dmg: r.mv.dmg, knock: r.mv.knock, lift: r.mv.lift, dirX: Math.sign(c.x - r.owner.root.x) || 1, dirY: -1, idx: P.NECK, px: c.x, py: c.y });
      t.status.shock = Math.max(t.status.shock, r.mv.shock);
      for (let i = 0; i < 3; i++) fx.add({ kind: 'ring', x: c.x, y: c.y, color: '#ffc6a8', size: 40 + i * 28, life: 0.25 + i * 0.08, width: 5 });
      fx.burst(c.x, c.y, '#ffe1cf', 14, 300, { kind: 'spark' });
      Sfx.zap();
    }
    resonances = resonances.filter(r => !r.done);

    for (const d of dragons) {
      d.t += dt;
      const u = d.t / d.mv.dur;
      const hx = d.x0 + d.dir * d.span * u;
      const hy = d.y0 + Math.sin(d.t * 4.2) * 85 + Math.sin(d.t * 1.7 + 1) * 35;
      d.path.unshift({ x: hx, y: hy });
      if (d.path.length > 260) d.path.pop();
      d.segs = dragonSegments(d.path, 26, 30);
      for (let i = 0; i < d.segs.length; i += 2) {
        const sg = d.segs[i];
        if (Math.random() < 0.03) fx.add({ kind: 'ember', x: sg.x + rand(-10, 10), y: sg.y + rand(-10, 10), vx: rand(-30, 30), vy: -rand(40, 120), color: pick(['#ffcf5a', '#ff8a3d']), size: rand(5, 9), life: rand(0.3, 0.5), drag: 1.5 });
      }
      for (const t of opponents(d.owner)) {
        if (!t.alive || blocked(t)) continue;
        const tc = t.center();
        if (time - (d.hit.get(t) || -9) < 0.6) continue;
        const hd = d.segs[0], jx = hd.x + Math.cos(hd.a) * 160, jy = hd.y + Math.sin(hd.a) * 160;
        if (!d.segs.some((sg, i) => i % 2 === 0 && dist(sg.x, sg.y, tc.x, tc.y) < 46 * t.s + sg.r) && dist(jx, jy, tc.x, tc.y) > 70) continue;
        d.hit.set(t, time);
        applyHit(d.owner, t, { mv: d.mv, el: d.el, dmg: d.mv.dmg, knock: d.mv.knock, lift: d.mv.lift, dirX: d.dir, dirY: -1, idx: P.PELVIS, px: tc.x, py: tc.y });
        fx.burst(tc.x, tc.y, '#ffcf5a', 14, 320, { kind: 'flame', size: 9 });
      }
    }
    dragons = dragons.filter(d => d.t < d.mv.dur + 0.6);

    const fighters = player ? enemies.concat([player]) : enemies;
    for (const f of fighters) {
      if (f.orbit) {
        const o = f.orbit;
        o.t -= dt; o.a += dt * 4.2;
        if (o.t <= 0 || !f.alive) { f.orbit = null; continue; }
        const c = f.center();
        for (let k = 0; k < o.mv.n; k++) {
          const a = o.a + k * TAU / o.mv.n, sx = c.x + Math.cos(a) * o.mv.orbitR, sy = c.y + Math.sin(a) * o.mv.orbitR * 0.8;
          if (Math.random() < 0.35) fx.add({ kind: 'star', x: sx, y: sy, vx: -Math.sin(a) * 60, vy: Math.cos(a) * 60, color: pick(['#ff8ad8', '#ffd6f2']), size: rand(3, 5), vr: 5, life: 0.3 });
          for (const t of opponents(f)) {
            if (!t.alive || blocked(t)) continue;
            const tc = t.center();
            if (dist(sx, sy, tc.x, tc.y) > 34 * t.s + 12) continue;
            if (time - (o.hit.get(t) || -9) < o.mv.tick) continue;
            o.hit.set(t, time);
            applyHit(f, t, { mv: o.mv, el: o.el, dmg: o.mv.dmg, knock: o.mv.knock, lift: o.mv.lift, dirX: Math.sign(tc.x - c.x) || 1, dirY: 0, idx: P.PELVIS, px: sx, py: sy });
            fx.burst(sx, sy, '#ffd6f2', 6, 200, { kind: 'star', size: 5, vr: 6 });
          }
        }
      }
      if (f.isPlayer && f.alive && f.mode === 'active' && f.root.grounded) {
        f.hist = f.hist || [];
        const last = f.hist[f.hist.length - 1];
        if (!last || time - last.t > 0.1) { f.hist.push({ t: time, x: f.root.x, y: f.root.y }); if (f.hist.length > 40) f.hist.shift(); }
      }
    }
  }

  // body segments placed at fixed spacing along the head's recent path
  function dragonSegments(path, n, gap) {
    const out = [];
    if (!path.length) return out;
    let acc = 0, idx = 0, prev = path[0];
    out.push({ x: prev.x, y: prev.y, a: 0, r: 40 });
    for (let i = 1; i < path.length && out.length < n; i++) {
      const q = path[i], l = dist(prev.x, prev.y, q.x, q.y);
      acc += l;
      while (acc >= gap && out.length < n) {
        acc -= gap; idx = out.length;
        const k = 1 - acc / Math.max(l, 1e-3);
        const x = lerp(prev.x, q.x, k), y = lerp(prev.y, q.y, k);
        const back = out[out.length - 1];
        out.push({ x, y, a: Math.atan2(back.y - y, back.x - x), r: 40 * (1 - idx / n * 0.72) });
      }
      prev = q;
    }
    out[0].a = out.length > 1 ? Math.atan2(out[0].y - out[1].y, out[0].x - out[1].x) : 0;
    return out;
  }

  // the summoned dragon: a smooth obsidian serpent with a molten belly and seams, swept spines
  // trailing fire, beating wings and an angular horned head breathing a jet of flame. No outlines.
  function drawDragon(c, d) {
    const segs = d.segs || [];
    if (segs.length < 4) return;
    const n = segs.length;
    const alpha = Math.min(1, d.t * 4) * clamp((d.mv.dur + 0.6 - d.t) / 0.6, 0, 1);
    const width = i => {
      const u = i / (n - 1);
      return 34 * (i === 0 ? 0.5 : i === 1 ? 0.62 : u < 0.14 ? 0.7 + u * 2.1 : 1 - Math.pow((u - 0.14) / 0.86, 1.15) * 0.9);
    };
    // which side of the spine faces up (spines go on top, belly underneath)
    const up = sg => (Math.cos(sg.a) >= 0 ? 1 : -1);
    const edge = (i, side, k = 1) => { const sg = segs[i], s2 = side * up(sg) * width(i) * k; return { x: sg.x - Math.sin(sg.a) * s2, y: sg.y + Math.cos(sg.a) * s2 }; };
    const ribbon = (k, offs = 0) => {
      const top = [], bot = [];
      for (let i = 0; i < n; i++) {
        const sg = segs[i], o = offs * width(i) * up(sg);
        const nx = -Math.sin(sg.a), ny = Math.cos(sg.a), w = width(i) * k * (k < 1 ? Math.min(1, i / 3) : 1);   // belly stripes taper into the neck
        top.push({ x: sg.x + nx * (o - w * up(sg)), y: sg.y + ny * (o - w * up(sg)) });
        bot.push({ x: sg.x + nx * (o + w * up(sg)), y: sg.y + ny * (o + w * up(sg)) });
      }
      const pts = top.concat(bot.reverse());
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) { const p0 = pts[i - 1], p1 = pts[i]; c.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2); }
      c.closePath();
    };
    c.save();
    c.globalAlpha = alpha;
    // heat glow on the ground and around the body
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i += 4) Glow.draw(c, '#ff4a12', segs[i].x, segs[i].y, width(i) * 3.2, 0.16);
    c.globalCompositeOperation = 'source-over';

    // far wing (behind the body)
    const wi = Math.min(3, n - 1), ws = segs[wi];
    const flap = Math.sin(d.t * 9);
    const wing = (sideK, shade) => {
      // bat wing: finger bones fanning back from the shoulder, scalloped membrane between them
      const sx = ws.x, sy = ws.y, back = ws.a + Math.PI, lift = up(ws);
      const span = 180 * sideK, ang = back + lift * (1.3 + flap * 0.5);
      const fingers = [[0, 1], [-0.42, 0.86], [-0.8, 0.7], [-1.12, 0.56]].map(([da, l]) => ({ x: sx + Math.cos(ang + da * lift) * span * l, y: sy + Math.sin(ang + da * lift) * span * l }));
      const tail = { x: sx + Math.cos(back) * 120, y: sy + Math.sin(back) * 120 };
      const pts = fingers.concat([tail]);
      c.fillStyle = shade;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i], mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
        c.quadraticCurveTo(lerp(mx, sx, 0.3), lerp(my, sy, 0.3), p1.x, p1.y);
      }
      c.closePath(); c.fill();
      // bones, with a molten glow along the leading one
      c.fillStyle = '#120404';
      for (const f of fingers) {
        const dx = f.x - sx, dy = f.y - sy, l = Math.hypot(dx, dy) || 1, nx = -dy / l * 3, ny = dx / l * 3;
        c.beginPath(); c.moveTo(sx + nx, sy + ny); c.lineTo(f.x, f.y); c.lineTo(sx - nx, sy - ny); c.closePath(); c.fill();
      }
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = 'rgba(255, 110, 40, 0.5)'; c.lineWidth = 2.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(fingers[0].x, fingers[0].y); c.stroke();
      c.globalCompositeOperation = 'source-over';
    };
    wing(0.85, '#1c0707');

    // body: obsidian ribbon, darker underside shading, molten belly stripe
    ribbon(1); c.fillStyle = '#2a0a09'; c.fill();
    ribbon(0.55, 0.42); c.fillStyle = '#41110d'; c.fill();
    c.globalCompositeOperation = 'lighter';
    ribbon(0.22, 0.62); c.fillStyle = 'rgba(255, 96, 30, 0.75)'; c.fill();
    // molten seams pulsing down the body
    for (let i = 2; i < n - 2; i += 2) {
      const pulse = 0.35 + 0.35 * Math.sin(time * 8 - i * 0.6);
      const a1 = edge(i, -1, 0.75), a2 = edge(i, 1, 0.2), mid = segs[i], fwd = Math.cos(mid.a), fwy = Math.sin(mid.a);
      c.strokeStyle = `rgba(255, 140, 50, ${pulse})`; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(a1.x, a1.y); c.quadraticCurveTo(mid.x - fwd * 8, mid.y - fwy * 8, a2.x, a2.y); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';

    // swept-back dorsal spines with fire licking off the tips
    for (let i = 1; i < n - 3; i++) {
      const sg = segs[i], base = edge(i, -1, 0.85), w = width(i);
      const back = sg.a + Math.PI, out = -up(sg);
      const len = w * (i < 4 ? 1.5 : 1.1), sweep = 0.75;
      const tip = { x: base.x + (Math.cos(back) * Math.sin(sweep) - Math.sin(sg.a) * out * Math.cos(sweep)) * len, y: base.y + (Math.sin(back) * Math.sin(sweep) + Math.cos(sg.a) * out * Math.cos(sweep)) * len };
      const b1 = { x: base.x + Math.cos(sg.a) * w * 0.35, y: base.y + Math.sin(sg.a) * w * 0.35 }, b2 = { x: base.x - Math.cos(sg.a) * w * 0.35, y: base.y - Math.sin(sg.a) * w * 0.35 };
      c.fillStyle = '#1a0606';
      c.beginPath(); c.moveTo(b1.x, b1.y); c.quadraticCurveTo((b1.x + tip.x) / 2, (b1.y + tip.y) / 2, tip.x, tip.y); c.lineTo(b2.x, b2.y); c.closePath(); c.fill();
      if (i % 3 === 0 && Math.random() < 0.2) fx.add({ kind: 'ember', x: tip.x, y: tip.y, vx: Math.cos(back) * 60 + rand(-20, 20), vy: -rand(80, 180), color: pick(['#ff3a0a', '#e0532d', '#ff5a1f']), size: rand(6, 10), life: rand(0.25, 0.45), drag: 2 });
    }
    // tail: a whip of fire
    const tl = segs[n - 1];
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) Glow.draw(c, ['#ff3a0a', '#ff6a1f', '#ffa040', '#ffe0a0'][k], tl.x - Math.cos(tl.a) * (8 + k * 10), tl.y - Math.sin(tl.a) * (8 + k * 10) + Math.sin(time * 16 + k) * 5, 16 - k * 3, 0.8);
    c.globalCompositeOperation = 'source-over';
    if (Math.random() < 0.5) fx.add({ kind: 'smoke', x: tl.x, y: tl.y, vx: rand(-20, 20), vy: -rand(20, 50), color: '#2a1414', size: rand(10, 16), life: rand(0.6, 0.9), add: false });

    // near wing (in front of the body)
    wing(1, '#320c0a');

    // head: angular skull, swept horns, blazing slit eye, open jaw with a roaring jet of flame
    const h = segs[0];
    c.translate(h.x, h.y); c.rotate(h.a);
    if (Math.cos(h.a) < 0) c.scale(1, -1);
    c.scale(1.7, 1.7);
    const jaw = 0.28 + Math.abs(Math.sin(time * 7)) * 0.18;
    // horns
    c.fillStyle = '#140505';
    c.beginPath(); c.moveTo(-4, -16); c.quadraticCurveTo(-34, -30, -74, -26); c.quadraticCurveTo(-40, -20, -14, -8); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(8, -18); c.quadraticCurveTo(-18, -44, -56, -52); c.quadraticCurveTo(-24, -34, 0, -8); c.closePath(); c.fill();
    // lower jaw (open)
    c.save(); c.translate(6, 6); c.rotate(jaw);
    c.fillStyle = '#240807';
    c.beginPath(); c.moveTo(-14, -2); c.lineTo(48, 2); c.lineTo(40, 9); c.lineTo(-10, 10); c.closePath(); c.fill();
    c.fillStyle = '#f4e6d0';
    for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(10 + k * 9, 2); c.lineTo(14 + k * 9, -4); c.lineTo(18 + k * 9, 2); c.closePath(); c.fill(); }
    c.restore();
    // mouth glow
    c.globalCompositeOperation = 'lighter';
    Glow.draw(c, '#ff6a1f', 30, 8, 30, 0.9);
    c.globalCompositeOperation = 'source-over';
    // frill: swept plates behind the skull that hide where the neck joins
    c.fillStyle = '#1a0606';
    c.beginPath(); c.moveTo(-14, -16); c.lineTo(-52, -24); c.lineTo(-34, -8); c.lineTo(-58, 0); c.lineTo(-34, 6); c.lineTo(-50, 18); c.lineTo(-12, 14); c.closePath(); c.fill();
    // skull + snout
    c.fillStyle = '#2a0a09';
    c.beginPath(); c.moveTo(-26, -10); c.lineTo(-6, -22); c.lineTo(26, -16); c.lineTo(62, -4); c.lineTo(58, 4); c.lineTo(20, 6); c.lineTo(-20, 14); c.closePath(); c.fill();
    c.fillStyle = '#41110d';
    c.beginPath(); c.moveTo(-6, -22); c.lineTo(26, -16); c.lineTo(50, -8); c.lineTo(18, -10); c.closePath(); c.fill();
    c.fillStyle = '#f4e6d0';
    for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(22 + k * 9, 4); c.lineTo(25 + k * 9, 11); c.lineTo(29 + k * 9, 4); c.closePath(); c.fill(); }
    // blazing slit eye under a heavy brow
    c.fillStyle = '#140505';
    c.beginPath(); c.moveTo(4, -20); c.lineTo(30, -14); c.lineTo(10, -10); c.closePath(); c.fill();
    c.globalCompositeOperation = 'lighter';
    Glow.draw(c, '#ffb020', 16, -9, 12, 1);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#ffe680';
    c.beginPath(); c.moveTo(8, -9); c.lineTo(24, -11); c.lineTo(10, -6); c.closePath(); c.fill();
    c.restore();

    // roaring jet of flame from the jaws
    const fxh = Math.cos(h.a), fyh = Math.sin(h.a), mx = h.x + fxh * 78, my = h.y + fyh * 78;
    c.save(); c.globalAlpha = alpha; c.globalCompositeOperation = 'lighter';
    const L = 170;
    const g = c.createLinearGradient(mx, my, mx + fxh * L, my + fyh * L);
    g.addColorStop(0, 'rgba(255, 230, 150, 0.85)'); g.addColorStop(0.35, 'rgba(255, 120, 40, 0.55)'); g.addColorStop(1, 'rgba(255, 60, 10, 0)');
    c.fillStyle = g;
    const nxh = -fyh, nyh = fxh, spread = 36 + Math.sin(time * 30) * 6;
    c.beginPath(); c.moveTo(mx + nxh * 6, my + nyh * 6); c.lineTo(mx + fxh * L + nxh * spread, my + fyh * L + nyh * spread);
    c.lineTo(mx + fxh * L - nxh * spread, my + fyh * L - nyh * spread); c.lineTo(mx - nxh * 6, my - nyh * 6); c.closePath(); c.fill();
    c.restore();
    for (let k = 0; k < 2; k++) fx.add({ kind: 'ember', x: mx, y: my, vx: fxh * rand(700, 1000) + rand(-80, 80), vy: fyh * rand(700, 1000) + rand(-80, 80), color: pick(['#ffcf5a', '#ff8a3d', '#ff5a1f']), size: rand(8, 13), life: rand(0.18, 0.3), drag: 2 });
  }

  function drawSpecials(c) {
    for (const d of dragons) drawDragon(c, d);
    for (const e of eruptions) {
      if (e.done) continue;
      // ground crack glows brighter just before the pillar bursts
      const k = 1 - clamp(e.t / Math.max(0.05, e.warn), 0, 1);
      c.globalCompositeOperation = 'lighter';
      Glow.draw(c, '#ff6a2a', e.x, e.y - 4, 30 + k * 30, 0.35 + k * 0.5);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = rgba('#ffb347', 0.5 + k * 0.5);
      c.beginPath(); c.ellipse(e.x, e.y - 2, 14 + k * 26, 3, 0, 0, TAU); c.fill();
    }
    for (const w of walls) {
      const a = Math.min(1, w.t * 6) * Math.min(1, (w.dur - w.t) * 3);
      const h = (w.bottom - w.top) * Math.min(1, w.t * 7);
      const top = w.bottom - h;
      c.globalAlpha = 0.35 * a; c.fillStyle = '#9ff0e8';
      c.beginPath(); c.moveTo(w.x - 16, w.bottom); c.lineTo(w.x - 14, top + 18); c.lineTo(w.x, top); c.lineTo(w.x + 14, top + 18); c.lineTo(w.x + 16, w.bottom); c.closePath(); c.fill();
      c.globalAlpha = 0.9 * a; c.strokeStyle = '#e6fffb'; c.lineWidth = 2.5; c.stroke();
      c.globalAlpha = 0.6 * a; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(w.x, top); c.lineTo(w.x - 4, w.bottom); c.moveTo(w.x - 14, top + 18); c.lineTo(w.x + 6, top + h * 0.55); c.stroke();
      c.globalAlpha = 1;
    }
    for (const m of mines) {
      const armed = m.t >= m.arm;
      c.fillStyle = '#2fb0a8';
      c.beginPath(); c.moveTo(m.x - 12, m.y); c.lineTo(m.x - 8, m.y - 12); c.lineTo(m.x, m.y - 18); c.lineTo(m.x + 9, m.y - 11); c.lineTo(m.x + 12, m.y); c.closePath(); c.fill();
      c.fillStyle = '#9ff0e8';
      c.beginPath(); c.moveTo(m.x - 8, m.y - 12); c.lineTo(m.x, m.y - 18); c.lineTo(m.x + 2, m.y - 6); c.closePath(); c.fill();
      if (armed) { c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#9ff0e8', m.x, m.y - 9, 16, 0.4 + 0.4 * Math.abs(Math.sin(time * 6))); c.globalCompositeOperation = 'source-over'; }
    }
    for (const r of resonances) {
      if (!r.target.alive) continue;
      const tc = r.target.center(), k = r.t / r.max;
      c.strokeStyle = rgba('#ffc6a8', 0.9 - k * 0.5); c.lineWidth = 2.5;
      for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(tc.x, tc.y, 22 + (k * 50 + i * 18) % 60, 0, TAU); c.stroke(); }
    }
    const fighters = player ? enemies.concat([player]) : enemies;
    for (const f of fighters) {
      if (!f.orbit) continue;
      const o = f.orbit, cc = f.center();
      for (let k = 0; k < o.mv.n; k++) {
        const a = o.a + k * TAU / o.mv.n, sx = cc.x + Math.cos(a) * o.mv.orbitR, sy = cc.y + Math.sin(a) * o.mv.orbitR * 0.8;
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#ff8ad8', sx, sy, 22, 0.8); c.globalCompositeOperation = 'source-over';
        c.save(); c.translate(sx, sy); c.rotate(time * 6 + k);
        c.fillStyle = '#ffe6f7'; c.beginPath();
        for (let i = 0; i < 10; i++) { const b = i / 10 * TAU, rr = i % 2 ? 5 : 12; c.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); }
        c.closePath(); c.fill(); c.restore();
      }
    }
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
      else if (s.mv.style === 'meteor') { fx.chunks(tx, ty, '#7a4a6e', 18, 520, 10); fx.ring(tx, ty, '#ff8ad8', 120, 0.45, 12); fx.burst(tx, ty, '#ffb36b', 24, 360); Sfx.boom(1); }
      else { fx.arc(tx + rand(-60, 60), -80, tx, ty, '#a77bff', 0.35); fx.arc(tx + rand(-40, 40), -80, tx, ty, '#fff27a', 0.25); Sfx.zap(); }
      fx.burst(tx, ty, s.mv.style === 'sun' ? '#fff3b0' : '#fff27a', 22, 320);
      shake = Math.max(shake, 7);
      for (const o of opponents(s.owner)) {
        if (!o.alive || blocked(o)) continue;
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
    else grantEssence(5, p.x, p.y - 30);
  }

  /* ----------------------------------------------------------- waves */
  function waveCleared() {
    if (state !== 'play') return;
    if (mode === 'stage' && waveIdx >= stageDef.waves.length - 1) win();
    else waveTimer = 1.2;
  }

  function nextWave() {
    if (mode === 'tutorial' || mode === 'test') return;
    if (mode === 'stage') {
      waveIdx++;
      queueSpawnWave(stageDef.waves[waveIdx]);
      hooks.onWave && hooks.onWave(waveIdx, stageDef.waves.length, stageDef.boss && waveIdx === stageDef.waves.length - 1);
    } else {
      const w = endlessWave(run.kills, endlessWaveNo++);
      if (w.realm !== realmIdx) {
        setRealm(w.realm);
        buildArena(ARENAS[w.realm % ARENAS.length], 200 + w.realm);
        const sp = spawnPoint();
        teleport(player, sp.x, sp.y - 300);
        player.invuln = 1.2;
        zones = []; waves = []; pickups = [];
        enemies = enemies.filter(e => e.alive);
        realmFlash = 1;
        hooks.onToast && hooks.onToast(REALMS[w.realm].name, true);
      }
      queueSpawnWave(w.wave);
      hooks.onWave && hooks.onWave(endlessWaveNo - 1, 0, w.wave.some(s => s.type === 'boss'));
    }
    enemies = enemies.filter(e => e.alive || (e.deadT < 5.5 && !e.gone));
  }

  function summon(boss, n) {
    const reinforcements = Array.from({ length: n }, () => ({ type: 'grunt', element: boss.el, d: boss.ai.d }));
    queueSpawnWave(reinforcements);
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
      mode, won, canRevive: !won && !run.revived, r: run.r, s: run.s, kills: run.kills, ringouts: run.ringouts, bestCombo: combo.best,
      essence: run.essence + Math.round(run.essenceRemainder || 0), stars: 0, unlocked: null, firstClear: false, best: false,
    };
    if (mode === 'stage' && res.won) {
      res.stars = hpRatio >= 0.65 && run.falls === 0 ? 3 : hpRatio >= 0.3 ? 2 : 1;
      const rec = Save.recordClear(run.r, run.s, res.stars);
      res.firstClear = rec.firstClear;
      res.bonus = Math.round((10 + run.r * 5 + (rec.firstClear ? 15 : 0) + rec.newStars * 5) * pStats.essenceMul);
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

  // rewarded-ad revive: once per run, back on the main island at half health
  function revive() {
    if (!run || run.revived || state !== 'done' || !player) return false;
    run.revived = true;
    run.falls++;
    const f = player, sp = spawnPoint();
    f.gone = false;
    teleport(f, sp.x, sp.y - 300);
    f.mode = 'active'; f.m = 1; f.stunT = 0; f.action = null; f.dash = null; f.slam = false;
    f.hp = f.maxHp * 0.5; f.invuln = 2.5;
    for (const k in f.status) f.status[k] = 0;
    state = 'play'; slowmo = 0; timeScale = 1;
    Platform.gameplayStart();
    return true;
  }

  function quit() {
    if (run && (state === 'play' || state === 'won' || state === 'lost')) {
      Save.data.essence += run.essence + Math.round(run.essenceRemainder || 0);
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
    if (e.decor || e.dummy) { e.input.x = 0; return; }
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
      if (ratio < 0.5 && ai.summoned === 0) { ai.summoned = 1; summon(e, 1); }
    }
    ai.thinkT -= dt;
    if (ai.thinkT > 0) return;
    ai.thinkT = ai.stats.think * rand(0.45, 0.8);

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
      if (!ready(pw) || Math.random() > (e.kind === 'boss' ? 0.45 : 0.8)) continue;
      const k = pw.kind;
      const ok = (k === 'nova' || k === 'updraft') ? dd < (pw.radius || 140) * 0.9
        : k === 'heal' ? e.hp < e.maxHp * 0.5
        : k === 'shield' ? e.hp < e.maxHp * 0.8
        : (k === 'dash' || k === 'wave') ? adx < 520 && Math.abs(dy) < 70
        : k === 'slam' ? me.grounded && adx < 420 && Math.abs(dy) < 60
        : k === 'blink' ? dd > 200
        : k === 'beam' ? adx > 150 && Math.abs(dy) < 160
        : k === 'pillars' ? adx < 520 && Math.abs(dy) < 90
        : k === 'orbit' ? dd < 220
        : k === 'pull' ? dd < 400 && dd > 120
        : k === 'crush' ? !player.root.grounded && dd < 650
        : k === 'resonance' ? dd < 520
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

    // ---- navigation: chase the hero across islands
    const prefer = !kit.melee ? 300 : 30;
    const myIsl = me.grounded ? me.plat : null;
    const goal = (player.root.grounded && player.root.plat) || platformBelow(pr.x, pr.y - 5, 900) || nearestIsland(pr.x);
    let dir = 0;
    if (myIsl && goal && myIsl !== goal) {
      const hop = nextHop(myIsl, goal);
      ai.nav = hop;
      const over = me.x > hop.left + 12 && me.x < hop.right - 12;
      if (hop.top < me.y - 30 && over) {
        // directly beneath: jump straight up through it
        if (ai.jumpCd <= 0) { e.jump(); ai.jumpCd = 0.5; }
        dir = Math.sign(hop.x - me.x) * 0.4;
      } else if (hop.top > me.y + 30 && over) {
        if (ai.jumpCd <= 0) { e.drop(); ai.jumpCd = 0.6; }
      } else {
        const edgeX = hop.x > me.x ? hop.left : hop.right;
        dir = Math.sign(edgeX - me.x);
        const gap = Math.abs(edgeX - me.x);
        const noGround = !groundAt(me.x + dir * 44, me.y, 10);
        const rise = me.y - hop.top;
        if (ai.jumpCd <= 0 && (noGround || (rise > 60 && gap < 260) || (rise > -40 && gap < 140))) { e.jump(); ai.jumpCd = 0.5; }
      }
    } else if (!me.grounded && ai.nav) {
      dir = 0;   // mid-jump: aiAir steers onto the target island
    } else {
      ai.nav = null;
      if (adx > prefer + 20) dir = Math.sign(dx);
      else if (prefer > 100 && adx < prefer - 140) dir = -Math.sign(dx);
      if (me.grounded && dir !== 0 && !groundAt(me.x + dir * 50, me.y, 10)) dir = 0;   // never back off an edge
      // hop at a hero standing on the same island but airborne above
      if (me.grounded && dy < -120 && adx < 160 && ai.jumpCd <= 0) { e.jump(); ai.jumpCd = 0.7; }
    }
    if (!me.grounded && !ai.nav && !platformBelow(me.x + dir * 30, me.y - 5, 900)) dir = Math.sign(nearestIsland(me.x).x - me.x);
    e.input.x = dir;
  }

  // islands reachable in one jump (with double jump) from a
  function canHop(a, b) {
    const gap = Math.max(0, b.left - a.right, a.left - b.right);
    return gap < 380 && b.top > a.top - 280;
  }
  // breadth-first search over islands; returns the first island to head for
  function nextHop(from, goal) {
    if (canHop(from, goal)) return goal;
    const prev = new Map([[from, null]]), q = [from];
    while (q.length) {
      const c = q.shift();
      if (c === goal) break;
      for (const n of islands) if (!prev.has(n) && canHop(c, n)) { prev.set(n, c); q.push(n); }
    }
    if (!prev.has(goal)) return nearestIsland(goal.x);
    let n = goal;
    while (prev.get(n) !== from) n = prev.get(n);
    return n;
  }

  // per-frame air control: steer onto the island being jumped to, double jump if short
  function aiAir(e) {
    const ai = e.ai, me = e.root, t = ai && ai.nav;
    if (!t || me.grounded || e.mode !== 'active' || e.action) return;
    const tx = clamp(me.x, t.left + 40, t.right - 40);
    e.input.x = Math.abs(tx - me.x) > 8 ? Math.sign(tx - me.x) : 0;
    if (me.vy > -120 && me.y > t.top - 30 && me.jumps < e.maxJumps) e.jump();
  }

  /* ---------------------------------------------------------- input */
  function screenToWorld(sx, sy) { return { x: (sx - cam.ox) / cam.k, y: (sy - cam.oy) / cam.k }; }

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

  function attachVine(f, aim) {
    const hand = f.hand();
    const dx = aim.x - hand.x, dy = aim.y - hand.y;
    const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    let px = hand.x, py = hand.y;
    // Step along the actual vine path. An enemy hit before terrain becomes the moving anchor.
    for (let d = 10; d <= 620; d += 10) {
      const x = hand.x + ux * d, y = hand.y + uy * d;
      let enemyHit = null;
      for (const target of opponents(f)) {
        if (!target.alive || target.gone || blocked(target)) continue;
        const hit = target.hitCapsule(px, py, x, y, 15);
        if (hit) { enemyHit = { target, hit }; break; }
      }
      if (enemyHit) {
        const target = enemyHit.target, hit = enemyHit.hit;
        const ax = hit.px, ay = hit.py;
        vineSwing = {
          x: ax, y: ay, target, ox: ax - target.root.x, oy: ay - target.root.y,
          length: Math.max(40, Math.hypot(hand.x - ax, hand.y - ay)), age: 0
        };
        f.action = null;
        fx.burst(ax, ay, '#9ae66e', 10, 130, { life: 0.28 });
        return;
      }
      for (const isl of islands) {
        if (x < isl.left || x > isl.right) continue;
        if (isl.solidAt(x, y) || (Math.abs(y - isl.top) < 12 && uy > 0)) {
          const ax = x, ay = Math.min(y, isl.top);
          vineSwing = {
            x: ax, y: ay, isl,
            length: Math.max(40, Math.hypot(hand.x - ax, hand.y - ay)), age: 0
          };
          f.action = null;
          fx.burst(ax, ay, '#9ae66e', 8, 110, { life: 0.25 });
          return;
        }
      }
      px = x; py = y;
    }
  }

  function updateVineSwing(f, dt) {
    if (!vineSwing || !input.attack || !f || f.el !== 'nature' || !f.alive) { vineSwing = null; return; }
    const v = vineSwing, r = f.root;
    if (v.target) {
      if (!v.target.alive || v.target.gone) { vineSwing = null; return; }
      v.x = v.target.root.x + v.ox;
      v.y = v.target.root.y + v.oy;
    }
    v.age += dt;
    // Enforce the rope length at the hand itself, translating the entire ragdoll together.
    // This keeps a taut, straight rope without limb/body drift or artificial stretching.
    const hand = f.hand();
    let dx = hand.x - v.x, dy = hand.y - v.y;
    let d = Math.hypot(dx, dy);
    if (d < 0.001) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d;
    const correctionX = v.x + nx * v.length - hand.x;
    const correctionY = v.y + ny * v.length - hand.y;
    if (Math.abs(correctionX) > 0.001 || Math.abs(correctionY) > 0.001) {
      r.x += correctionX; r.y += correctionY;
      for (let i = 0; i < f.pts.length; i++) {
        f.pts[i].x += correctionX; f.pts[i].y += correctionY;
        f.pts[i].px += correctionX; f.pts[i].py += correctionY;
        f.T[i].x += correctionX; f.T[i].y += correctionY;
        f.Tp[i].x += correctionX; f.Tp[i].y += correctionY;
      }
    }
    // Keep only tangential velocity so momentum swings around the anchor instead of stretching through it.
    const radial = r.vx * nx + r.vy * ny;
    r.vx -= radial * nx; r.vy -= radial * ny;
    r.grounded = false; r.plat = null;
    r.vy += 520 * dt;
    r.vx += -ny * (f.input.x || 0) * 1150 * dt;
    r.vy += nx * (f.input.x || 0) * 1150 * dt;
    if (Math.random() < dt * 18) fx.add({x:v.x+rand(-4,4),y:v.y+rand(-4,4),vx:rand(-18,18),vy:rand(-18,18),color:'#9ae66e',size:rand(2,4),life:0.25});
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
    if (run && run.tut && mx) run.tut.moved += dt;   // any steer input counts as moving
    if (q.jump) { if (f.jump()) { if (run && run.tut) run.tut.jumped++; Sfx.jump(); fx.burst(f.root.x, f.root.y, '#ffffff', 8, 140, { life: 0.3 }); } q.jump = false; }
    if (q.drop) {
      // only drop through when there is an island below to land on, never into the void
      if (f.root.grounded && platformBelow(f.root.x, f.root.y, 900, f.root.plat)) f.drop();
      q.drop = false;
    }
    const a = playerAim();
    const o = aimFrom(f);
    if (!f.action) {
      f.aim = Math.atan2(a.y - o.y, a.x - o.x);
      if (mx !== 0) f.facing = mx > 0 ? 1 : -1;
      else if (input.mouse) f.facing = a.x >= f.root.x ? 1 : -1;
    }
    const kit = ELEMENT_BY_ID[f.el].moves;
    const count = mv => { if (run && run.tut) { if (mv === kit[0]) run.tut.attacks++; else run.tut.powers++; } };
    for (const [key, mv] of [['p1', kit[1]], ['p2', kit[2]]]) {
      if (!q[key]) continue;
      q[key] = false;
      if (tryMove(f, mv, a.x, a.y)) count(mv);
      else if ((f.cds[mv.id] || 0) > 0.15) Sfx.denied();
    }
    if (f.el === 'nature' && kit[0].vineSwing) {
      if (input.attack || q.attack) {
        if (!vineSwing) attachVine(f, a);
        q.attack = false;
      } else if (vineSwing) vineSwing = null;
    } else if (input.attack || q.attack) { if (tryMove(f, kit[0], a.x, a.y)) count(kit[0]); q.attack = false; }
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
    if (mode === 'test' && dummyTimer > 0 && state === 'play') {
      dummyTimer -= realDt;
      if (dummyTimer <= 0) { const d = spawnTestDummy(); fx.ring(d.center().x, d.center().y, '#ece6da', 90, 0.4, 8); Sfx.portal(); }
    }

    acc += realDt * timeScale;
    let steps = 0;
    while (acc >= STEP && steps < 10) { acc -= STEP; steps++; step(STEP); }
    if (steps >= 10) acc = 0;
    amb.update(realDt * timeScale, view);
    updateCam(realDt, false);
  }

  function demoTick(dt) {
    if (dev.noDemo) return;
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
    for (const e of enemies) if (e.ai) { updateAI(e, dt); aiAir(e); }
    const fighters = player ? enemies.concat([player]) : enemies;
    for (const f of fighters) {
      if (f.gone) continue;
      if (f.tagCd > 0) f.tagCd -= dt;
      updateAction(f, dt);
      if (f.status.burn > 0 && f.alive && !f.decor) {
        f.hp -= f.status.burnDps * dt * (f.isPlayer ? pStats.armor : 1);
        if (Math.random() < dt * 45) {
          const q = f.pts[pick([P.HEAD, P.NECK, P.PELVIS, P.FELB, P.BELB, P.FKNEE, P.BKNEE, P.FHAND])];
          fx.add({ kind: 'ember', x: q.x + rand(-6, 6), y: q.y + rand(-6, 6), vx: rand(-20, 20), vy: -rand(90, 170), color: pick(['#ff6a2a', '#ff8a3d', '#ffb347']), size: rand(5, 9), life: rand(0.35, 0.6), drag: 1.5 });
        }
        if (f.hp <= 0) kill(f, null, 0, -200, P.PELVIS);
      }
      if (f.status.poison > 0 && f.alive && !f.decor) {
        f.hp -= f.status.poisonDps * dt * (f.isPlayer ? pStats.armor : 1);
        if (Math.random() < dt * 14) { const c = f.center(); fx.add({ x: c.x + rand(-14, 14), y: c.y + rand(-30, 20), vy: -rand(30, 80), color: pick(['#a6e35b', '#6fbf2e']), size: rand(4, 7), life: rand(0.4, 0.7) }); }
        if (f.hp <= 0) kill(f, null, 0, -200, P.PELVIS);
      }
      f.update(dt, islands, zoneForce);
      if (f.isPlayer && vineSwing) updateVineSwing(f, dt);
      if (f.decor) {
        f.hp = f.maxHp;
        if (f.mode === 'active' && mode !== 'tutorial') f.root.x = clamp(f.root.x, islands[0].left + 60, islands[0].right - 60);
      }
      const yy = f.alive ? Math.min(f.root.y, f.pelvis.y + 60) : f.pelvis.y;
      if (yy > RINGOUT_Y) {
        if (f.decor || (state === 'idle' && f.isPlayer)) {
          const isl = islands[0];
          if (f.decor && run && run.tut) { run.tut.ringouts = (run.tut.ringouts || 0) + 1; Sfx.kill(); hooks.onToast && hooks.onToast('RING OUT!'); }
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
    updateSpecials(dt);

    for (const s of spawns) {
      s.t -= dt;
      if (Math.random() < 0.5) fx.add({ x: s.isl.x + s.ox + rand(-30, 30), y: s.isl.top - rand(0, 20), vy: -rand(80, 220), color: AURA[s.el], size: rand(4, 8), life: 0.5 });
      if (s.t <= 0) {
        // step out of the portal standing on the marked island (no drop, so no landing bounce)
        s.done = true;
        const e = spawnEnemyAt(s.spec, s.isl.x + s.ox, s.isl.top, true, s.isl);
        const c = e.center(), col = (ELEMENT_BY_ID[s.el] || NEUTRAL).color;
        fx.ring(c.x, c.y, col, 80, 0.35, 8); fx.burst(c.x, c.y, col, 14, 240);
      }
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
    const bg = Backdrop.render(realm, view, pxScale);
    if (cam.z > 1.001) {
      // backdrop zooms less than the play field for a little parallax depth
      const zp = 1 + (cam.z - 1) * 0.4;
      const sw = bg.width / zp, sh = bg.height / zp;
      const fx = (cam.x * view.scale + view.ox) / view.cw, fy = (cam.y * view.scale + view.oy) / view.ch;
      const sx = clamp(fx * bg.width - sw / 2, 0, bg.width - sw), sy = clamp(fy * bg.height - sh / 2, 0, bg.height - sh);
      c.drawImage(bg, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    } else c.drawImage(bg, 0, 0, canvas.width, canvas.height);
    const sk = shake > 0 && Save.data.settings.shake ? shake * 0.6 : 0;
    const k = cam.k * dpr;
    c.setTransform(k, 0, 0, k, (cam.ox + rand(-sk, sk)) * dpr, (cam.oy + rand(-sk, sk)) * dpr);

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
    if (vineSwing && player && input.attack) {
      const h = player.hand();
      c.strokeStyle = '#9ae66e'; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(h.x, h.y); c.lineTo(vineSwing.x, vineSwing.y); c.stroke();
      c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#9ae66e', vineSwing.x, vineSwing.y, 15, 0.55); c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#d8ffb7'; c.beginPath(); c.arc(vineSwing.x, vineSwing.y, 6, 0, TAU); c.fill();
    }
    for (const f of player ? enemies.concat([player]) : enemies) {
      const a = f.action;
      if (a && a.beam && a.move.kind === 'beam' && a.t < a.move.windup + a.move.active) drawBeam(c, a.beam);
    }

    drawStrikeMarkers(c);
    drawSpecials(c);
    fx.draw(c);
    if (dev.cinematic) { amb.drawFront(c, view, time); c.setTransform(dpr, 0, 0, dpr, 0, 0); return; }
    for (const e of enemies) if (e.alive && !e.decor && e.kind !== 'boss') drawEnemyBar(c, e);
    if (player && player.alive && state !== 'idle') drawPlayerMarker(c);
    for (const e of enemies) if (e.alive && e.action && !e.action.fired && !e.decor) drawTelegraph(c, e);
    if (player && player.alive && state === 'play' && input.mouse) drawReticle(c);

    amb.drawFront(c, view, time);
    fx.drawTexts(c);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cam.z > 1.001 && state === 'play') drawOffscreen(c);
    drawVignettes(c);
  }

  // edge arrows for foes outside the zoomed camera
  function drawOffscreen(c) {
    const cw = view.cw, ch = view.ch, m = 26;
    for (const e of enemies) {
      if (!e.alive || e.decor) continue;
      const p = e.chest();
      const sx = p.x * cam.k + cam.ox, sy = p.y * cam.k + cam.oy;
      if (sx > 0 && sx < cw && sy > 0 && sy < ch) continue;
      const x = clamp(sx, m, cw - m), y = clamp(sy, m + 110, ch - m);
      const a = Math.atan2(sy - y, sx - x);
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = 'rgba(16, 19, 31, 0.75)';
      c.beginPath(); c.arc(0, 0, 15, 0, TAU); c.fill();
      c.fillStyle = e.kind === 'boss' ? '#ffcf5a' : '#ff5a6a';
      c.beginPath(); c.moveTo(11, 0); c.lineTo(-5, -8); c.lineTo(-2, 0); c.lineTo(-5, 8); c.closePath(); c.fill();
      c.restore();
    }
  }

  // melee slash: a tapered crescent ribbon swept through the recent tip positions
  function drawSwipe(c, f) {
    const act = f.action;
    if (!act || act.move.kind !== 'melee' || !act.trail || act.trail.length < 2) return;
    const mv = act.move;
    const u = (act.t - mv.windup) / mv.active;
    if (u < 0 || u > 1.8) return;
    const el = ELEMENT_BY_ID[act.el] || NEUTRAL;
    const tr = act.trail;
    const fade = clamp(1.8 - u, 0, 1);
    c.save();
    c.globalAlpha = 0.85 * fade;
    c.fillStyle = el.color;
    c.beginPath();
    c.moveTo(tr[0].x, tr[0].y);
    for (let i = 1; i < tr.length; i++) c.lineTo(tr[i].x, tr[i].y);
    for (let i = tr.length - 1; i >= 0; i--) {
      const k = i / (tr.length - 1);
      c.lineTo(lerp(tr[i].x, tr[i].ix, 0.25 + k * 0.55), lerp(tr[i].y, tr[i].iy, 0.25 + k * 0.55));
    }
    c.closePath(); c.fill();
    c.globalAlpha = fade;
    c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(tr[0].x, tr[0].y);
    for (let i = 1; i < tr.length; i++) c.lineTo(tr[i].x, tr[i].y);
    c.stroke();
    c.restore();
    if (act.el === 'water' || act.el === 'nature') {
      c.strokeStyle = act.el === 'water' ? '#7cc8ff' : '#5fae4c';
      c.lineWidth = 6 * f.s; c.lineCap = 'round';
      const h = f.hand(), t = tr[tr.length - 1];
      c.beginPath(); c.moveTo(h.x, h.y);
      c.quadraticCurveTo((h.x + t.x) / 2, (h.y + t.y) / 2 + 12, t.x, t.y);
      c.stroke();
    }
  }

  function drawStrikeMarkers(c) {
    for (const s of strikes) {
      const t = s.target;
      const x = s.x, y = t && t.alive ? t.root.y : (s.y || 0);
      const col = s.mv.style === 'sun' ? '#ffe48a' : s.mv.style === 'meteor' ? '#ff8ad8' : '#fff27a';
      const k = clamp(1 - s.t / 0.6, 0, 1);
      c.strokeStyle = col; c.lineWidth = 3;
      c.globalAlpha = 0.5 + k * 0.5;
      c.beginPath(); c.ellipse(x, y, 34 - k * 10, 9 - k * 3, 0, 0, TAU); c.stroke();
      c.globalAlpha = 0.25 * k;
      c.fillStyle = col; c.fillRect(x - 2, y - 600, 4, 600);
      c.globalAlpha = 1;
    }
  }

  function drawProjectile(c, p) {
    const st = p.mv.style;
    const ang = Math.atan2(p.vy, p.vx);
    const tr = p.trail;
    const el = ELEMENT_BY_ID[p.el] || NEUTRAL;
    if (p.mv.hook && p.owner.alive) {
      const h = p.owner.hand();
      c.strokeStyle = rgba('#b9a6ff', 0.85); c.lineWidth = 3; c.setLineDash([8, 6]);
      c.beginPath(); c.moveTo(h.x, h.y); c.lineTo(p.x, p.y); c.stroke(); c.setLineDash([]);
    }
    if (tr.length >= 4 && !['cyclone', 'halo', 'sonic', 'hook', 'fly', 'dragonfire', 'bubble'].includes(st)) {
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = rgba(el.deep, st === 'bolt' ? 0.9 : 0.4); c.lineWidth = st === 'bolt' ? 5 : p.r * 0.9; c.lineCap = 'round';
      c.beginPath(); c.moveTo(tr[0], tr[1]);
      for (let i = 2; i < tr.length; i += 2) { const j = st === 'bolt' ? rand(-6, 6) : 0; c.lineTo(tr[i] + j, tr[i + 1] + j); }
      c.stroke();
      c.globalCompositeOperation = 'source-over';
    }
    c.save(); c.translate(p.x, p.y);
    switch (st) {
      case 'bubble': {
        const pulse = 0.85 + Math.sin(time * 12 + p.rot) * 0.12;
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#7cc8ff', 0, 0, p.r * 2.5, 0.45); c.globalCompositeOperation = 'source-over';
        c.fillStyle = 'rgba(124,200,255,0.42)'; c.strokeStyle = '#d9f5ff'; c.lineWidth = 2;
        c.beginPath(); c.arc(0, 0, p.r * pulse, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(-p.r*0.3, -p.r*0.35, p.r*0.24, 0, TAU); c.fill();
        break;
      }
      case 'dragonfire': {
        const a = clamp(p.life / (p.mv.life || 1), 0, 1);
        c.globalCompositeOperation = 'lighter';
        Glow.draw(c, '#ff5a1f', 0, 0, p.r * (3.4 - a * 1.4), 0.75); Glow.draw(c, '#ffcf5a', 0, 0, p.r * 1.6, 0.9);
        c.globalCompositeOperation = 'source-over';
        break;
      }
      case 'crystal':
        c.rotate(ang);
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#2fb0a8', 0, 0, 22, 0.7); c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#9ff0e8'; c.beginPath(); c.moveTo(16, 0); c.lineTo(0, -7); c.lineTo(-10, 0); c.lineTo(0, 7); c.closePath(); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(16, 0); c.lineTo(0, -7); c.lineTo(2, 0); c.closePath(); c.fill();
        break;
      case 'hook':
        c.rotate(ang);
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#5b45c9', 0, 0, 22, 0.8); c.globalCompositeOperation = 'source-over';
        c.strokeStyle = '#e4dcff'; c.lineWidth = 4; c.lineCap = 'round';
        c.beginPath(); c.arc(-2, 0, 9, -1.9, 1.9); c.stroke();
        c.fillStyle = '#b9a6ff'; c.beginPath(); c.arc(-4, 0, 5, 0, TAU); c.fill();
        break;
      case 'sonic': {
        c.rotate(ang);
        const a = clamp(p.life / (p.mv.life || 1), 0, 1);
        c.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          c.globalAlpha = a * (0.9 - i * 0.25); c.strokeStyle = i ? '#ffc6a8' : '#fff1e8'; c.lineWidth = 5 - i;
          c.beginPath(); c.arc(-i * 12 - p.r * 0.6, 0, p.r, -0.8, 0.8); c.stroke();
        }
        c.globalAlpha = 1;
        break;
      }
      case 'halo':
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#ffd76a', 0, 0, p.r * 1.6, 0.7); c.globalCompositeOperation = 'source-over';
        c.rotate(time * 14);
        c.strokeStyle = '#fff6cf'; c.lineWidth = 6; c.beginPath(); c.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, TAU); c.stroke();
        c.strokeStyle = '#f2b41c'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, p.r - 5, p.r * 0.45 - 3, 0, 0, TAU); c.stroke();
        break;
      case 'fly': {
        c.rotate(ang);
        const flap = Math.sin(time * 50 + p.rot) * 0.6;
        c.fillStyle = 'rgba(230,255,200,0.6)';
        c.beginPath(); c.ellipse(-1, -5, 6, 3, -0.6 + flap, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(-1, 5, 6, 3, 0.6 - flap, 0, TAU); c.fill();
        c.fillStyle = '#4f8a23'; c.beginPath(); c.ellipse(0, 0, 7, 4.5, 0, 0, TAU); c.fill();
        c.fillStyle = '#a6e35b'; c.beginPath(); c.arc(5, 0, 3, 0, TAU); c.fill();
        break;
      }
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
      case 'saw': {
        c.rotate(time * 22);
        c.fillStyle = '#cfd6e0';
        c.beginPath();
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, rr = i % 2 ? p.r : p.r * 0.78; i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c.closePath(); c.fill();
        c.fillStyle = '#6d7a8c'; c.beginPath(); c.arc(0, 0, p.r * 0.32, 0, TAU); c.fill();
        break;
      }
      case 'spit':
        c.rotate(ang);
        c.fillStyle = '#a6e35b';
        c.beginPath(); c.ellipse(0, 0, p.r * 1.25, p.r * 0.85, 0, 0, TAU); c.fill();
        c.fillStyle = '#d9ff9c'; c.beginPath(); c.arc(p.r * 0.35, -p.r * 0.3, p.r * 0.3, 0, TAU); c.fill();
        break;
      case 'star':
        c.globalCompositeOperation = 'lighter'; Glow.draw(c, '#ff8ad8', 0, 0, 26, 0.9); c.globalCompositeOperation = 'source-over';
        c.rotate(time * 8);
        c.fillStyle = '#ffe6f7';
        c.beginPath();
        for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, rr = i % 2 ? 6.5 : 16; i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c.closePath(); c.fill();
        break;
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
    if (z.style === 'antigrav') {
      if (!back) return;
      const g = c.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r * grow);
      g.addColorStop(0, 'rgba(185,166,255,0.05)'); g.addColorStop(0.8, 'rgba(185,166,255,0.16)'); g.addColorStop(1, 'rgba(185,166,255,0.35)');
      c.fillStyle = g; c.beginPath(); c.arc(z.x, z.y, z.r * grow, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(228,220,255,0.8)'; c.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const u = ((time * 0.6 + i / 3) % 1); c.globalAlpha = 1 - u; c.beginPath(); c.arc(z.x, z.y, z.r * grow * u, 0, TAU); c.stroke(); }
      c.globalAlpha = 1;
      return;
    }
    if (z.style === 'rift') {
      if (!back) return;
      c.globalCompositeOperation = 'lighter';
      Glow.draw(c, '#7a4ae0', z.x, z.y, z.r * 1.1 * grow, 0.5);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#05020a';
      c.beginPath(); c.arc(z.x, z.y, 34 * grow, 0, TAU); c.fill();
      c.strokeStyle = '#c08bff'; c.lineWidth = 3;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(z.x, z.y, (40 + i * 18) * grow, time * (4 - i) + i, time * (4 - i) + i + 2.2); c.stroke(); }
    } else if (z.style === 'toxic') {
      if (back) return;
      c.fillStyle = '#8fd14a';
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU + time * 0.4, rr = z.r * 0.55;
        c.globalAlpha = 0.22 * grow;
        c.beginPath(); c.arc(z.x + Math.cos(a) * rr * 0.6, z.y + Math.sin(a) * rr * 0.35, z.r * 0.48, 0, TAU); c.fill();
      }
      c.globalAlpha = 0.3 * grow;
      c.beginPath(); c.arc(z.x, z.y, z.r * 0.55, 0, TAU); c.fill();
      c.globalAlpha = 1;
    } else if (z.style === 'thorns') {
      if (back) return;
      // curved thorn stalks that burst up from the centre outward, with side thorns, leaves and buds
      if (!z.spikes) {
        const rng = mulberry32(Math.floor(z.x * 7 + z.y * 3));
        const n = Math.floor(z.r / 17);
        z.spikes = [];
        for (let i = -n; i <= n; i++) {
          const e = Math.abs(i) / (n + 1);
          z.spikes.push({ dx: i * 17 + (rng() - 0.5) * 8, h: (30 + rng() * 22) * (1 - e * 0.45), lean: i / (n + 1) * 0.55 + (rng() - 0.5) * 0.25, d: e * 0.22, w: 5.5 + rng() * 2.5, leaf: rng() < 0.35, bud: rng() < 0.22 });
        }
      }
      const fade = k > 0.85 ? (1 - k) / 0.15 : 1;
      c.globalAlpha = 0.45 * fade; c.fillStyle = '#1f3d1a';
      c.beginPath(); c.ellipse(z.x, z.y + 2, z.r * 0.95, 6, 0, 0, TAU); c.fill();
      c.globalAlpha = fade;
      for (const sp of z.spikes) {
        const u = clamp((z.t - sp.d) * 7, 0, 1), g = 1 - Math.pow(1 - u, 3);
        if (g <= 0) continue;
        const h = sp.h * g, x = z.x + sp.dx, y = z.y + 2;
        const lean = sp.lean + Math.sin(time * 2 + sp.dx) * 0.04;
        const tx = x + Math.sin(lean) * h, ty = y - Math.cos(lean) * h;
        const mx = (x + tx) / 2 + Math.cos(lean) * sp.w * 0.6, my = (y + ty) / 2;
        // stalk: dark body with a lit left edge
        c.fillStyle = '#2f6b2a';
        c.beginPath(); c.moveTo(x - sp.w, y); c.quadraticCurveTo(mx - sp.w * 0.5, my, tx, ty); c.quadraticCurveTo(mx + sp.w * 0.5, my, x + sp.w, y); c.closePath(); c.fill();
        c.fillStyle = '#5fa84a';
        c.beginPath(); c.moveTo(x - sp.w, y); c.quadraticCurveTo(mx - sp.w * 0.5, my, tx, ty); c.quadraticCurveTo(mx - sp.w * 0.1, my, x - sp.w * 0.2, y); c.closePath(); c.fill();
        // side thorns
        c.fillStyle = '#2f6b2a';
        for (const [t, side] of [[0.38, -1], [0.62, 1]]) {
          const px = lerp(x, tx, t), py = lerp(y, ty, t), w = sp.w * (1 - t) + 1.5;
          const ox = Math.cos(lean) * side, oy = Math.sin(lean) * side;
          c.beginPath(); c.moveTo(px - Math.sin(lean) * 3, py + Math.cos(lean) * 3); c.lineTo(px + ox * (w + 7) - Math.sin(lean) * 4, py + oy * (w + 7) - Math.cos(lean) * 4); c.lineTo(px + Math.sin(lean) * 3, py - Math.cos(lean) * 3); c.closePath(); c.fill();
        }
        if (sp.leaf && g > 0.6) {
          c.fillStyle = '#7cc95a';
          c.beginPath(); c.ellipse(lerp(x, tx, 0.5) - Math.cos(lean) * 8, lerp(y, ty, 0.5), 7, 3.2, lean - 0.9, 0, TAU); c.fill();
        }
        if (sp.bud && g > 0.85) {
          c.fillStyle = '#ff7aa8';
          c.beginPath(); c.arc(tx, ty + 1, 4, 0, TAU); c.fill();
          c.fillStyle = '#ffd1e3';
          c.beginPath(); c.arc(tx - 1.2, ty - 0.3, 1.6, 0, TAU); c.fill();
        }
      }
      c.globalAlpha = 1;
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

  // floating relic: soft halo, two-tone hex gem with an icon, an orbiting glint and a
  // shadow on the island below. Fades (not blinks) when about to expire.
  function drawPickup(c, p) {
    const def = PICKUPS[p.type];
    const x = p.x, y = p.y + Math.sin(p.t * 3) * 4;
    const k = p.life < 2 ? 0.45 + 0.55 * Math.abs(Math.sin(time * 6)) : 1;
    const dark = mixHex(def.color, '#1d2233', 0.45), light = mixHex(def.color, '#ffffff', 0.35);
    if (p.isl) {
      c.globalAlpha = 0.25 * k; c.fillStyle = '#000';
      c.beginPath(); c.ellipse(x, p.isl.top + 2, 16, 4, 0, 0, TAU); c.fill();
    }
    c.globalAlpha = k;
    c.globalCompositeOperation = 'lighter';
    Glow.draw(c, def.color, x, y, 34, 0.55);
    c.globalCompositeOperation = 'source-over';
    const R = 15, hexPath = r => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * TAU / 6; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); };
    c.fillStyle = dark; hexPath(R + 3); c.fill();
    c.fillStyle = def.color; hexPath(R); c.fill();
    // upper facet
    c.fillStyle = light;
    c.beginPath(); c.moveTo(x - R * 0.866, y - R * 0.5); c.lineTo(x, y - R); c.lineTo(x + R * 0.866, y - R * 0.5); c.lineTo(x, y - R * 0.1); c.closePath(); c.fill();
    // icon
    c.fillStyle = '#ffffff';
    if (p.type === 'heal') { c.fillRect(x - 2.2, y - 6.5, 4.4, 13); c.fillRect(x - 6.5, y - 2.2, 13, 4.4); }
    else if (p.type === 'power') { c.beginPath(); c.moveTo(x + 2, y - 8); c.lineTo(x - 5, y + 1.5); c.lineTo(x, y + 1.5); c.lineTo(x - 2, y + 8); c.lineTo(x + 5, y - 1.5); c.lineTo(x, y - 1.5); c.closePath(); c.fill(); }
    else { c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 6, y - 1.5); c.lineTo(x, y + 7); c.lineTo(x - 6, y - 1.5); c.closePath(); c.fill(); }
    // orbiting glint
    const a = p.t * 2.6;
    c.globalCompositeOperation = 'lighter';
    Glow.draw(c, light, x + Math.cos(a) * 24, y + Math.sin(a) * 9, 7, 0.9);
    c.globalCompositeOperation = 'source-over';
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
    c.font = `900 ${Math.round(24 + k * 10)}px Rubik, Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 5; c.lineJoin = 'round'; c.strokeStyle = 'rgba(24,16,8,0.9)';
    const y = hd.y - 62 * e.s;
    c.strokeText('!', hd.x, y);
    c.fillStyle = k > 0.7 ? '#ff5a5a' : '#f5b041';
    c.fillText('!', hd.x, y);
  }

  // element-coloured reticle over a dark outline so it reads on any background
  function drawReticle(c) {
    const m = input.mouse;
    const el = ELEMENT_BY_ID[player.el];
    const shape = () => {
      c.beginPath(); c.arc(m.x, m.y, 12, 0, TAU); c.stroke();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + time * 1.5;
        c.beginPath(); c.moveTo(m.x + Math.cos(a) * 16, m.y + Math.sin(a) * 16); c.lineTo(m.x + Math.cos(a) * 22, m.y + Math.sin(a) * 22); c.stroke();
      }
    };
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(12, 14, 26, 0.7)'; c.lineWidth = 5.5; shape();
    c.strokeStyle = el.color; c.lineWidth = 2.5; shape();
    c.fillStyle = 'rgba(12, 14, 26, 0.7)'; c.beginPath(); c.arc(m.x, m.y, 4.2, 0, TAU); c.fill();
    c.fillStyle = el.color; c.beginPath(); c.arc(m.x, m.y, 2.5, 0, TAU); c.fill();
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
    cinematic: false,            // capture mode for store art: no bars, markers or combat text
    camOverride: null,           // {z, x, y} framing for store art
    all: () => enemies,
    toScreen: (x, y) => ({ x: x * cam.k + cam.ox, y: y * cam.k + cam.oy }),
    enemies: () => aliveEnemies(),
    player: () => player,
    use: (slot, x, y) => tryMove(player, ELEMENT_BY_ID[player.el].moves[slot], x, y),
    islands: () => islands,
    spawnPickup: () => spawnPickup(),
    setEl: id => { setPlayerElement(player, id, true); for (const k in player.cds) player.cds[k] = 0; },
    spawn: (spec, x, y) => spawnEnemyAt(Object.assign({ type: 'grunt', element: realm.element, d: 0.3 }, spec), x, y, true),
    hold: () => { waveTimer = 1e9; spawns = []; },   // stop the stage's own waves (staged scenes)
  };

  return {
    dev, init, resize, update, render, start, quit, revive, idleScene, hud, hooks, setShift,
    press, release, setKey, setJoy, setDirAim, setMouse, selectSlot, cycleSlot,
    setPreviewElement(id) { if (player && state === 'idle') { player.loadout = [id]; setPlayerElement(player, id, true); idleDemo.t = 0.3; } },
    get state() { return state; }, get mode() { return mode; }, get realmIdx() { return realmIdx; },
    get paused() { return paused; },
    set paused(v) { paused = v; if (v) { input.attack = false; input.left = input.right = false; input.joyX = 0; } },
    get run() { return run; },
  };
})();
