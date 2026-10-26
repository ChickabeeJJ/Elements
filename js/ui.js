'use strict';
/* =========================================================================
   UI: title, campaign map, upgrades, codex, HUD, pause/result modals,
   toasts and the first-run coach. Pure DOM over the game canvas.
   ========================================================================= */

const UI = (() => {
  const $ = id => document.getElementById(id);
  let current = 'title';
  let mapRealm = 0;
  let lastStart = null;
  let coachStage = 0;
  let hudCache = {};
  const TIPS = [
    'Jump right as an archer lets go to dodge the shot.',
    'Hitting an elemental weakness deals 160% damage.',
    'Headshots deal double damage to most archers.',
    'Shoot the winged orbs for health, stamina and essence.',
    'Upgrades are permanent. Spend essence between stages.',
    'Rime freezes archers mid-draw; Stone shatters them for double damage.',
    'Soak foes with Tide, then hit them with Storm for double damage.',
    'Void rifts swallow enemy arrows that fly too close.',
    'A "!" over an archer means they are about to fire.',
  ];

  /* ----------------------------------------------------------- screens */
  function show(name) {
    current = name;
    for (const id of ['title', 'map', 'shop', 'codex']) $(id).classList.toggle('hidden', id !== name);
    $('hud').classList.toggle('hidden', name !== null);
    if (name === 'title') refreshTitle();
    if (name) Platform.gameplayStop();
    refreshEssence();
  }

  function refreshEssence() {
    document.querySelectorAll('.essence-val').forEach(el => { el.textContent = fmt(Save.data.essence); });
  }

  function refreshTitle() {
    const [r, s] = Save.nextStage();
    const all = Object.keys(Save.data.stars).length >= TOTAL_STAGES;
    $('playSub').textContent = all ? 'All clear' : 'Stage ' + stageLabel(r, s);
    $('endlessSub').textContent = 'Best: ' + Save.data.endlessBest;
    $('titleStars').textContent = Save.totalStars() + ' / ' + TOTAL_STAGES * 3;
    $('titleElems').textContent = Save.unlockedElements().length + ' / ' + ELEMENTS.length + ' elements';
  }

  /* --------------------------------------------------------------- map */
  function openMap(r) {
    const [nr] = Save.nextStage();
    mapRealm = r != null ? r : nr;
    Game.idleScene(mapRealm);
    show('map');
    renderMap();
  }

  function renderMap() {
    const tabs = $('realmTabs');
    tabs.innerHTML = '';
    REALMS.forEach((realm, i) => {
      const open = Save.realmOpen(i);
      const b = document.createElement('button');
      b.className = 'realm-tab' + (i === mapRealm ? ' active' : '') + (open ? '' : ' locked');
      b.innerHTML = `<span class="swatch" style="background:${realm.tint};box-shadow:0 0 8px ${realm.tint}"></span>${i + 1}. ${realm.name}${open ? '' : ' <i class="ic" data-icon="lock"></i>'}`;
      b.onclick = () => { Sfx.click(); mapRealm = i; Game.idleScene(i); renderMap(); };
      tabs.appendChild(b);
    });
    const realm = REALMS[mapRealm];
    const aff = AFFINITY[realm.element];
    const stars = Array.from({ length: STAGES_PER_REALM }, (_, s) => Save.data.stars[stageKey(mapRealm, s)] || 0).reduce((a, b) => a + b, 0);
    const [nr, ns] = Save.nextStage();
    const view = $('realmView');
    view.innerHTML = `
      <div class="realm-card" style="background:linear-gradient(160deg, ${rgba(realm.sky[0], 0.55)}, ${rgba(realm.hills[2], 0.75)})">
        <div>
          <h3>${realm.name}</h3>
          <div class="realm-meta" style="margin-top:10px">
            <span class="chip" style="color:${AURA[realm.element]}">${elementIcon(realm.element)} ${ELEMENT_BY_ID[realm.element].name} archers</span>
            <span class="chip weakto">Weak to ${aff.weak.map(w => `<span style="color:${ELEMENT_BY_ID[w].color}" title="${ELEMENT_BY_ID[w].name}">${elementIcon(w)}</span>`).join('')}</span>
            <span class="chip star"><i class="ic" data-icon="star"></i>${stars} / ${STAGES_PER_REALM * 3}</span>
          </div>
        </div>
        <div class="nodes" id="nodes"></div>
      </div>`;
    const nodes = view.querySelector('#nodes');
    for (let s = 0; s < STAGES_PER_REALM; s++) {
      const open = Save.stageOpen(mapRealm, s);
      const st = Save.data.stars[stageKey(mapRealm, s)] || 0;
      const boss = s === STAGES_PER_REALM - 1;
      const unlock = elementUnlockedBy(mapRealm, s);
      const n = document.createElement('button');
      n.className = 'node' + (open ? '' : ' locked') + (boss ? ' boss' : '') + (mapRealm === nr && s === ns && !st ? ' current' : '');
      n.innerHTML = open
        ? `${boss ? '<i class="ic crown" data-icon="crown"></i>' : ''}<span>${stageLabel(mapRealm, s)}</span>
           ${boss ? `<small>${realm.boss.name}</small>` : ''}
           <span class="stars">${[1, 2, 3].map(k => `<i class="ic${k <= st ? ' on' : ''}" data-icon="star"></i>`).join('')}</span>`
        : `<i class="ic lk" data-icon="lock"></i><small>${stageLabel(mapRealm, s)}</small>`;
      if (unlock && !st) n.innerHTML += `<span class="reward" style="color:${unlock.color}" title="Unlocks ${unlock.name}">${elementIcon(unlock.id)}</span>`;
      n.onclick = () => {
        if (!open) { Sfx.denied(); toast('Clear the previous stage first'); return; }
        Sfx.click();
        startStage(mapRealm, s);
      };
      nodes.appendChild(n);
    }
    Icons.hydrate(view);
    Icons.hydrate(tabs);
  }

  /* -------------------------------------------------------------- shop */
  function openShop() { show('shop'); renderShop(); }
  function renderShop() {
    const grid = $('shopGrid');
    grid.innerHTML = '';
    for (const u of UPGRADES) {
      const lv = Save.data.upgrades[u.id];
      const cost = Save.upgradeCost(u.id);
      const card = document.createElement('div');
      card.className = 'card up-card';
      card.innerHTML = `
        <div class="up-top">
          <div class="up-icon" style="background:${rgba(u.color, 0.16)};color:${u.color}"><i class="ic" data-icon="${u.icon}"></i></div>
          <div><h4>${u.name} <small style="color:var(--muted)">Lv ${lv}</small></h4><p>${u.desc}</p></div>
        </div>
        <div class="lv" style="--c:${u.color}">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>`;
      const b = document.createElement('button');
      if (cost == null) { b.className = 'btn max'; b.innerHTML = '<i class="ic" data-icon="check"></i> Maxed'; b.disabled = true; }
      else {
        b.className = 'btn' + (Save.data.essence >= cost ? ' primary' : '');
        b.innerHTML = `<i class="ic" data-icon="gem"></i> ${cost}`;
        b.onclick = () => {
          if (Save.buy(u.id)) { Sfx.pickup(); renderShop(); refreshEssence(); }
          else { Sfx.denied(); toast('Not enough essence'); }
        };
      }
      card.appendChild(b);
      grid.appendChild(card);
    }
    Icons.hydrate(grid);
  }

  /* ------------------------------------------------------------- codex */
  function openCodex() { show('codex'); renderCodex(); }
  function renderCodex() {
    const grid = $('codexGrid');
    grid.innerHTML = '';
    for (const e of ELEMENTS) {
      const open = Save.elementOpen(e.id);
      const c = document.createElement('div');
      c.className = 'card el-card' + (open ? '' : ' locked');
      c.style.setProperty('--c', e.color);
      const tags = [`Cost ${e.cost}`, `Dmg ${e.dmg}${e.split ? ' ×' + e.split : ''}`];
      if (e.grav === 0) tags.push('No drop'); else if (e.grav > 1.2) tags.push('Heavy');
      c.innerHTML = `
        <div class="el-head"><div class="el-badge">${elementIcon(e.id)}</div>
          <div><h4>${open ? e.name : '???'}</h4><small>${open ? e.id.toUpperCase() : 'Clear stage ' + stageLabel(e.unlock[0], e.unlock[1])}</small></div></div>
        <p>${open ? e.blurb : 'A new element waits further into the campaign.'}</p>
        ${open ? `<div class="el-stats">${tags.map(t => `<span>${t}</span>`).join('')}</div>` : ''}`;
      grid.appendChild(c);
    }
    $('codexCount').textContent = Save.unlockedElements().length + ' / ' + ELEMENTS.length;
    const aff = $('affGrid');
    aff.innerHTML = '';
    for (const r of REALMS) {
      const a = AFFINITY[r.element];
      const d = document.createElement('div');
      d.className = 'card aff';
      d.innerHTML = `<b style="color:${AURA[r.element]}">${elementIcon(r.element)} ${r.name}</b>
        <div class="row">Weak: ${a.weak.map(w => `<span style="color:${ELEMENT_BY_ID[w].color}" title="${ELEMENT_BY_ID[w].name}">${elementIcon(w)}</span>`).join('')}</div>
        <div class="row">Resists: ${a.resist.map(w => `<span style="color:${ELEMENT_BY_ID[w].color};opacity:.7" title="${ELEMENT_BY_ID[w].name}">${elementIcon(w)}</span>`).join('')}</div>`;
      aff.appendChild(d);
    }
  }

  /* ------------------------------------------------------------- modal */
  function modal(html, onOpen) {
    const m = $('modal'), s = $('sheet');
    s.innerHTML = html;
    Icons.hydrate(s);
    m.classList.remove('hidden');
    s.style.animation = 'none'; void s.offsetWidth; s.style.animation = '';
    onOpen && onOpen(s);
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  const modalOpen = () => !$('modal').classList.contains('hidden');

  function openSettings(fromPause) {
    const st = Save.data.settings;
    const rows = [['sfx', 'sound', 'Sound'], ['music', 'music', 'Music'], ['shake', 'shake', 'Screen shake'], ['guide', 'aim', 'Aim guide']];
    modal(`
      <h2>Settings</h2>
      <div class="toggles">${rows.map(([k, ic, label]) => `<button class="toggle${st[k] ? ' on' : ''}" data-k="${k}"><i class="ic" data-icon="${ic}"></i>${label}<span class="sw"></span></button>`).join('')}</div>
      <div class="help">
        <div><kbd>Drag</kbd> pull back and release to shoot</div>
        <div><kbd>1</kbd>–<kbd>9</kbd> / <kbd>Q</kbd> <kbd>E</kbd> / wheel: switch element</div>
        <div><kbd>Space</kbd> / <kbd>W</kbd> jump to dodge · <kbd>Esc</kbd> pause</div>
      </div>
      <div class="actions"><button class="btn primary" id="setDone">Done</button></div>
      <button class="link-danger" id="setReset">Reset all progress</button>`, s => {
      s.querySelectorAll('.toggle').forEach(t => t.onclick = () => {
        const k = t.dataset.k;
        st[k] = !st[k];
        t.classList.toggle('on', st[k]);
        applySettings();
        Save.save();
        Sfx.click();
      });
      s.querySelector('#setDone').onclick = () => { Sfx.click(); fromPause ? openPause() : closeModal(); };
      s.querySelector('#setReset').onclick = () => confirmReset(fromPause);
    });
  }

  function confirmReset(fromPause) {
    modal(`<h2>Reset progress?</h2><p class="sub">Stars, essence, upgrades and unlocked elements will be erased.</p>
      <div class="actions"><button class="btn" id="rsNo">Cancel</button><button class="btn" id="rsYes" style="color:#ff8a8a">Erase</button></div>`, s => {
      s.querySelector('#rsNo').onclick = () => openSettings(fromPause);
      s.querySelector('#rsYes').onclick = () => {
        Save.reset(); applySettings(); closeModal();
        if (Game.state !== 'idle') Game.quit();
        Game.idleScene(0); buildEbar(); show('title'); toast('Progress reset');
      };
    });
  }

  function applySettings() {
    const st = Save.data.settings;
    Sfx.setSfx(st.sfx);
    Sfx.setMusic(st.music);
  }

  function openPause() {
    if (Game.state !== 'play' && Game.state !== 'won' && Game.state !== 'lost') return;
    Game.paused = true;
    Platform.gameplayStop();
    const label = Game.mode === 'stage' ? `${REALMS[lastStart.r].name} · ${stageLabel(lastStart.r, lastStart.s)}` : 'Endless';
    modal(`
      <h2>Paused</h2><p class="sub">${label}</p>
      <div class="stack">
        <button class="btn primary big" id="pResume"><i class="ic" data-icon="play"></i><span>Resume</span></button>
        <div class="actions">
          <button class="btn" id="pRestart"><i class="ic" data-icon="restart"></i>Restart</button>
          <button class="btn" id="pSettings"><i class="ic" data-icon="gear"></i>Settings</button>
        </div>
        <button class="btn" id="pQuit"><i class="ic" data-icon="home"></i>Quit to ${Game.mode === 'stage' ? 'map' : 'menu'}</button>
      </div>`, s => {
      s.querySelector('#pResume').onclick = resume;
      s.querySelector('#pRestart').onclick = () => { Sfx.click(); closeModal(); Game.quit(); relaunch(); };
      s.querySelector('#pSettings').onclick = () => openSettings(true);
      s.querySelector('#pQuit').onclick = () => {
        Sfx.click(); closeModal();
        const m = Game.mode;
        Game.quit();
        m === 'stage' ? openMap(lastStart.r) : show('title');
      };
    });
  }
  function resume() {
    Sfx.click();
    closeModal();
    Game.paused = false;
    if (Game.state === 'play') Platform.gameplayStart();
  }

  /* ------------------------------------------------------------ results */
  function showResult(res) {
    $('bossBar').classList.add('hidden');
    const stat = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
    const stats = `<div class="stats">${stat(res.kills, 'Kills')}${stat(Math.round(res.accuracy * 100) + '%', 'Accuracy')}${stat(res.heads, 'Headshots')}</div>`;
    const earned = `<div class="earned"><i class="ic" data-icon="gem"></i>+${res.essence}${res.bonus ? ` <small>(incl. ${res.bonus} clear bonus)</small>` : ''}</div>`;

    if (res.mode === 'endless') {
      modal(`
        <h2 class="${res.best ? 'win' : ''}">${res.best ? 'New Best!' : 'Run Over'}</h2>
        <p class="sub">${res.kills} archers felled · Best ${res.bestKills}</p>
        ${stats}${earned}
        <div class="actions">
          <button class="btn" id="rMenu"><i class="ic" data-icon="home"></i>Menu</button>
          <button class="btn primary" id="rAgain"><i class="ic" data-icon="restart"></i>Again</button>
        </div>`, s => {
        s.querySelector('#rMenu').onclick = () => { Sfx.click(); closeModal(); Game.idleScene(0); show('title'); };
        s.querySelector('#rAgain').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startEndless()); };
      });
      return;
    }

    const { r, s } = res;
    const boss = s === STAGES_PER_REALM - 1;
    if (res.won) {
      const nextR = s + 1 < STAGES_PER_REALM ? r : r + 1;
      const nextS = s + 1 < STAGES_PER_REALM ? s + 1 : 0;
      const hasNext = nextR < REALMS.length;
      const unlock = res.unlocked ? `
        <div class="unlock-card" style="--c:${res.unlocked.color}">
          <div class="el-badge" style="--c:${res.unlocked.color}">${elementIcon(res.unlocked.id)}</div>
          <div><small>New element unlocked</small><b>${res.unlocked.name}</b><p>${res.unlocked.blurb}</p></div>
        </div>` : '';
      const realmDone = boss && res.firstClear && hasNext ? `<p class="sub" style="color:${REALMS[nextR].tint}">${REALMS[nextR].name} is now open</p>` : '';
      modal(`
        <h2 class="win">${boss ? 'Realm Conquered!' : 'Victory!'}</h2>
        <p class="sub">${REALMS[r].name} · ${stageLabel(r, s)}</p>
        <div class="big-stars">${[1, 2, 3].map(k => `<i class="ic${k <= res.stars ? ' on' : ''}" data-icon="star"></i>`).join('')}</div>
        ${stats}${earned}${unlock}${realmDone}
        <div class="actions">
          <button class="btn" id="rMap"><i class="ic" data-icon="map"></i>Map</button>
          <button class="btn" id="rRetry"><i class="ic" data-icon="restart"></i>Retry</button>
          ${hasNext ? `<button class="btn primary" id="rNext"><span>Next</span><i class="ic" data-icon="next"></i></button>` : ''}
        </div>`, sh => {
        if (res.unlocked) { Sfx.unlock(); buildEbar(); Platform.happytime(); }
        sh.querySelector('#rMap').onclick = () => { Sfx.click(); closeModal(); openMap(hasNext && boss ? nextR : r); };
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(r, s)); };
        const nb = sh.querySelector('#rNext');
        if (nb) nb.onclick = () => {
          Sfx.click(); closeModal();
          if (res.unlocked) Game.selectElement(res.unlocked.id);
          Platform.maybeMidgame(() => startStage(nextR, nextS));
        };
      });
    } else {
      modal(`
        <h2 class="lose">Fallen</h2>
        <p class="sub">${REALMS[r].name} · ${stageLabel(r, s)}</p>
        ${stats}${earned}
        <p class="sub" style="margin:0">Tip: ${pick(TIPS)}</p>
        <div class="actions">
          <button class="btn" id="rMap"><i class="ic" data-icon="map"></i>Map</button>
          <button class="btn" id="rShop"><i class="ic" data-icon="sword"></i>Upgrades</button>
          <button class="btn primary" id="rRetry"><i class="ic" data-icon="restart"></i>Retry</button>
        </div>`, sh => {
        sh.querySelector('#rMap').onclick = () => { Sfx.click(); closeModal(); openMap(r); };
        sh.querySelector('#rShop').onclick = () => { Sfx.click(); closeModal(); Game.idleScene(r); openShop(); shopReturn = 'map'; };
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(r, s)); };
      });
    }
  }
  let shopReturn = 'title';

  /* --------------------------------------------------------------- run */
  function startStage(r, s) {
    lastStart = { mode: 'stage', r, s };
    closeModal();
    show(null);
    buildEbar();
    Game.start({ mode: 'stage', r, s });
    $('hudStage').textContent = `${REALMS[r].name} · ${stageLabel(r, s)}`;
    buildPips();
    hudCache = {};
    maybeCoach();
  }
  function startEndless() {
    lastStart = { mode: 'endless' };
    closeModal();
    show(null);
    buildEbar();
    Game.start({ mode: 'endless' });
    $('hudPips').innerHTML = '';
    hudCache = {};
    maybeCoach();
  }
  function relaunch() {
    if (!lastStart) return;
    lastStart.mode === 'stage' ? startStage(lastStart.r, lastStart.s) : startEndless();
  }

  function buildPips() {
    const p = $('hudPips');
    const def = buildStage(lastStart.r, lastStart.s);
    p.innerHTML = def.waves.map((w, i) => `<i class="${def.boss && i === def.waves.length - 1 ? 'boss' : ''}"></i>`).join('');
  }

  /* --------------------------------------------------------------- HUD */
  function buildEbar() {
    const bar = $('ebar');
    bar.innerHTML = '';
    ELEMENTS.forEach((e, i) => {
      const open = Save.elementOpen(e.id);
      const b = document.createElement('button');
      b.className = 'eslot' + (open ? '' : ' locked');
      b.dataset.el = e.id;
      b.style.setProperty('--c', e.color);
      b.title = open ? `${e.name} (${i + 1}) · ${e.cost} stamina\n${e.blurb}` : `Locked · clear stage ${stageLabel(e.unlock[0], e.unlock[1])}`;
      b.innerHTML = `<span class="key">${i + 1}</span>${elementIcon(e.id)}${open ? `<span class="cost">${e.cost}</span>` : '<i class="ic" data-icon="lock"></i>'}`;
      b.addEventListener('pointerdown', ev => { ev.stopPropagation(); });
      b.onclick = () => {
        if (!open) { Sfx.denied(); toast(`${'Unlock by clearing stage ' + stageLabel(e.unlock[0], e.unlock[1])}`); return; }
        Sfx.click();
        Game.selectElement(e.id);
      };
      bar.appendChild(b);
    });
    Icons.hydrate(bar);
    markEbar();
  }
  function markEbar() {
    const h = Game.hud();
    document.querySelectorAll('.eslot').forEach(s => s.classList.toggle('active', !!h && s.dataset.el === h.el));
  }

  function tick() {
    if (current !== null) return;
    const h = Game.hud();
    if (!h) return;
    const set = (k, v, fn) => { if (hudCache[k] !== v) { hudCache[k] = v; fn(v); } };
    const hpPct = clamp(h.hp / h.maxHp, 0, 1) * 100;
    set('hp', Math.round(hpPct * 2), () => { $('hpFill').style.width = hpPct + '%'; $('hpGhost').style.width = hpPct + '%'; $('hpText').textContent = Math.ceil(h.hp); });
    const stPct = clamp(h.st / h.maxSt, 0, 1) * 100;
    set('st', Math.round(stPct * 2), () => { $('stFill').style.width = stPct + '%'; $('stText').textContent = Math.floor(h.st); });
    set('low', h.lowSt, v => { if (v) { const b = $('stBar'); b.classList.remove('low'); void b.offsetWidth; b.classList.add('low'); } });
    set('chill', h.chill, v => $('stBar').classList.toggle('chill', v));
    set('burn', h.burn, v => document.querySelector('.bar.hp').classList.toggle('burn', v));
    set('ess', h.essence, v => { $('hudEssence').textContent = fmt(v); });
    // stamina affordability on slots
    set('afford', ELEMENTS.map(e => (h.st >= e.cost ? 1 : 0)).join(''), () => {
      document.querySelectorAll('.eslot').forEach(s => { const e = ELEMENT_BY_ID[s.dataset.el]; s.classList.toggle('poor', h.st < e.cost); });
    });
    set('el', h.el, markEbar);
    if (Game.mode === 'stage') {
      set('wave', h.wave, w => { $('hudPips').querySelectorAll('i').forEach((p, i) => p.classList.toggle('done', i < w || (i === w && h.left === 0))); });
      set('left', h.left, () => { $('hudPips').querySelectorAll('i').forEach((p, i) => p.classList.toggle('done', i < h.wave || (i === h.wave && h.left === 0))); });
    } else {
      set('kills', h.kills, k => { $('hudStage').textContent = `Endless · ${k} kill${k === 1 ? '' : 's'} · Best ${Save.data.endlessBest}`; });
    }
    const bb = $('bossBar');
    if (h.boss) {
      if (bb.classList.contains('hidden')) {
        bb.classList.remove('hidden');
        $('bossName').textContent = h.boss.name;
        $('bossTitle').textContent = h.boss.title;
        $('bossEl').innerHTML = `<span style="color:${AURA[h.boss.el]}">${elementIcon(h.boss.el)}</span>`;
      }
      set('boss', Math.round(h.boss.ratio * 300), () => { $('bossFill').style.width = h.boss.ratio * 100 + '%'; });
    } else if (!bb.classList.contains('hidden')) bb.classList.add('hidden');
    $('hudPips').classList.toggle('hidden', !!h.boss);
  }

  /* ------------------------------------------------------------- coach */
  function maybeCoach() {
    const c = $('coach');
    if (Save.data.seenHelp) { c.classList.add('hidden'); coachStage = 0; return; }
    coachStage = 1;
    $('coachText').textContent = matchMedia('(hover: none)').matches ? 'Drag back anywhere and let go to shoot' : 'Click, drag back and release to shoot';
    c.querySelector('.coach-hand').classList.remove('hidden');
    c.classList.remove('hidden');
  }
  function coachShot() {
    if (coachStage !== 1) return;
    coachStage = 2;
    const c = $('coach');
    c.querySelector('.coach-hand').classList.add('hidden');
    $('coachText').textContent = matchMedia('(hover: none)').matches ? 'Tap JUMP to dodge incoming arrows' : 'Press Space or JUMP to dodge arrows';
    setTimeout(() => {
      if (coachStage !== 2) return;
      $('coachText').textContent = 'Hit glowing weak spots: each realm fears an element';
      setTimeout(() => { coachStage = 0; c.classList.add('hidden'); Save.data.seenHelp = true; Save.save(); }, 3800);
    }, 3800);
  }

  /* ------------------------------------------------------------ toasts */
  function toast(text, big = false, html = '') {
    const t = document.createElement('div');
    t.className = 'toast' + (big ? ' big' : '');
    t.innerHTML = html + text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }

  /* -------------------------------------------------------------- init */
  function init() {
    Icons.hydrate();
    $('btnPlay').onclick = () => { Sfx.ensure(); Sfx.click(); openMap(); };
    $('btnEndless').onclick = () => { Sfx.ensure(); Sfx.click(); startEndless(); };
    $('btnShop').onclick = () => { Sfx.ensure(); Sfx.click(); shopReturn = 'title'; openShop(); };
    $('btnCodex').onclick = () => { Sfx.ensure(); Sfx.click(); openCodex(); };
    $('btnSettings').onclick = () => { Sfx.ensure(); Sfx.click(); openSettings(false); };
    document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => {
      Sfx.click();
      if (b.closest('#shop') && shopReturn === 'map') { shopReturn = 'title'; openMap(Game.realmIdx); return; }
      Game.idleScene(Game.realmIdx);
      show('title');
    });
    $('btnPause').onclick = () => { Sfx.click(); openPause(); };
    $('btnPause').addEventListener('pointerdown', e => e.stopPropagation());
    const jb = $('btnJump');
    jb.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); Game.jump(); });
    $('modal').addEventListener('pointerdown', e => e.stopPropagation());
    $('btnRotateOk').onclick = () => { $('rotate').classList.add('hidden'); rotateDismissed = true; };

    Game.hooks.onEnd = res => { showResult(res); };
    Game.hooks.onShot = coachShot;
    Game.hooks.onElement = () => { hudCache.el = null; };
    Game.hooks.onBoss = e => { toast(e.boss.name, true, `<span style="color:${AURA[e.el]}">${elementIcon(e.el)}</span>`); };
    Game.hooks.onToast = t => toast(t, true);
    Game.hooks.onWave = (i, n) => { if (i > 0 && i === n - 1 && !buildStage(lastStart.r, lastStart.s).boss) toast('Final wave'); };

    applySettings();
    buildEbar();
    show('title');
    checkRotate();
  }

  let rotateDismissed = false;
  function checkRotate() {
    const portrait = window.innerHeight > window.innerWidth * 1.1 && matchMedia('(hover: none)').matches;
    $('rotate').classList.toggle('hidden', !portrait || rotateDismissed);
  }

  return {
    init, tick, show, openPause, resume, toast, checkRotate, modalOpen, closeModal,
    get screen() { return current; },
  };
})();
