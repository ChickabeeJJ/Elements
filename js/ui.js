'use strict';
/* =========================================================================
   UI: home, campaign, loadout editor, elements, upgrades, settings/pause/
   results, the battle HUD and touch controls. Stages start immediately
   with the saved loadout; the loadout is edited only when the player
   wants to (home card, map bar or pause menu).
   ========================================================================= */

const UI = (() => {
  const $ = id => document.getElementById(id);
  let current = 'home';
  let mapRealm = 0;
  let codexSel = 'wind';
  let lastStart = null;
  let hudCache = {};
  let coachStep = 0;
  let rotateDismissed = false;
  let returnTo = 'home';

  const colorOf = id => (ELEMENT_BY_ID[id] || NEUTRAL).color;
  const hex = (id, cls = '') => `<span class="hex ${cls}" style="--c:${colorOf(id)}">${elementIcon(id)}</span>`;
  const NAME = id => (ELEMENT_BY_ID[id] || NEUTRAL).name.toUpperCase();
  const KEYS = ['CLICK', 'Q', 'E'];
  const TIPS = [
    'Knock foes off the islands for an instant ring-out. Hurt foes fly further.',
    'Hitting an elemental weakness deals 160% damage.',
    'A "!" over an enemy means an attack is coming. Jump or dash away.',
    'Careful near edges: falling into the void ends the run.',
    'Frozen foes shatter under Stone and Ice Lance.',
    'Soak foes with Tide, then hit them with Storm.',
    'Swap elements mid-fight with 1, 2 and 3 to chain powers.',
    'Upgrades are permanent. Spend essence between stages.',
  ];

  /* ----------------------------------------------------------- screens */
  function show(name) {
    current = name;
    for (const id of ['home', 'map', 'codex', 'forge']) $(id).classList.toggle('hidden', id !== name);
    $('hud').classList.toggle('hidden', name !== null);
    document.body.classList.toggle('playing', name === null);
    if (name === 'home') refreshHome();
    if (name) Platform.gameplayStop();
    document.querySelectorAll('.essence-val').forEach(el => { el.textContent = fmt(Save.data.essence); });
  }

  function refreshHome() {
    const [r, s] = Save.nextStage();
    const all = Object.keys(Save.data.stars).length >= TOTAL_STAGES;
    $('playSub').textContent = all ? 'ALL STAGES CLEAR' : `STAGE ${stageLabel(r, s)} · ${REALMS[r].name.toUpperCase()}`;
    $('endlessSub').textContent = 'BEST ' + Save.data.endlessBest;
    $('homeStars').textContent = Save.totalStars() + '/' + TOTAL_STAGES * 3;
    const cheapest = Math.min(...UPGRADES.map(u => Save.upgradeCost(u.id) ?? Infinity));
    $('homeForge').textContent = cheapest <= Save.data.essence ? 'AVAILABLE' : '';
    $('homeForge').classList.toggle('hidden', !(cheapest <= Save.data.essence));
    $('homeLoadout').innerHTML = `<span class="lbl">YOUR ELEMENTS</span><div class="row">${Save.loadout().map(id => hex(id)).join('')}</div><button class="btn small" id="homeChange"><b>CHANGE</b></button>`;
    $('homeChange').onclick = () => { Sfx.ensure(); Sfx.click(); openLoadout(); };
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
      b.className = (i === mapRealm ? 'active' : '') + (open ? '' : ' locked');
      b.style.setProperty('--c', realm.tint);
      b.innerHTML = realm.name.toUpperCase() + (open ? '' : '<span class="ic" data-icon="lock"></span>');
      b.onclick = () => {
        if (!open) { Sfx.denied(); toast(`DEFEAT ${REALMS[i - 1].boss.name.toUpperCase()} FIRST`); return; }
        Sfx.click(); mapRealm = i; Game.idleScene(i); renderMap();
      };
      tabs.appendChild(b);
    });
    const realm = REALMS[mapRealm];
    const aff = AFFINITY[realm.element];
    const stars = Array.from({ length: STAGES_PER_REALM }, (_, s) => Save.data.stars[stageKey(mapRealm, s)] || 0).reduce((a, b) => a + b, 0);
    $('realmHead').innerHTML = `<h3>${realm.name.toUpperCase()}</h3>
      <span class="tag">${hex(realm.element)} ${NAME(realm.element)} FOES</span>
      <span class="tag">${aff.weak.map(w => hex(w)).join('')} WEAK TO</span>
      <span class="tag"><span class="ic star" data-icon="star"></span> ${stars}/${STAGES_PER_REALM * 3}</span>`;
    const [nr, ns] = Save.nextStage();
    const grid = $('stageGrid');
    grid.innerHTML = '';
    for (let s = 0; s < STAGES_PER_REALM; s++) {
      const open = Save.stageOpen(mapRealm, s);
      const st = Save.data.stars[stageKey(mapRealm, s)] || 0;
      const boss = s === STAGES_PER_REALM - 1;
      const unlock = elementUnlockedBy(mapRealm, s);
      const cur = mapRealm === nr && s === ns && !st;
      const el = document.createElement('button');
      el.className = 'stage-card' + (boss ? ' boss' : '') + (!open ? ' locked' : cur ? ' current' : '');
      el.style.setProperty('--c', realm.tint);
      el.innerHTML = `<span class="n">${open ? (boss ? '<span class="ic" data-icon="crown"></span>' : s + 1) : '<span class="ic" data-icon="lock"></span>'}</span>
        <span class="stars">${[1, 2, 3].map(k => `<span class="ic${k <= st ? ' on' : ''}" data-icon="star"></span>`).join('')}</span>
        <small>${boss ? realm.boss.name.toUpperCase() : 'STAGE ' + stageLabel(mapRealm, s)}</small>
        ${unlock && !st ? `<span class="reward" title="Unlocks ${unlock.name}">${hex(unlock.id)}</span>` : ''}`;
      el.onclick = () => {
        if (!open) { Sfx.denied(); toast('CLEAR THE PREVIOUS STAGE FIRST'); return; }
        Sfx.click(); startStage(mapRealm, s);
      };
      grid.appendChild(el);
    }
    Icons.hydrate(tabs); Icons.hydrate($('realmHead')); Icons.hydrate(grid);
  }

  /* ---------------------------------------------------- loadout editor */
  function openLoadout(after) {
    let sel = Save.loadout().slice();
    const draw = () => {
      modal(`
        <h2>YOUR ELEMENTS</h2>
        <div class="lo-slots">${[0, 1, 2].map(i => `<div class="lo-slot">${sel[i] ? hex(sel[i]) : '<span class="empty"></span>'}<small>${sel[i] ? `${i + 1} · ${NAME(sel[i])}` : `${i + 1} · EMPTY`}</small></div>`).join('')}</div>
        <p class="hint">Pick up to three. You can swap between them in battle with 1, 2 and 3.</p>
        <div class="picker">${ELEMENTS.map(e => {
          const open = Save.elementOpen(e.id);
          return `<button class="pick${sel.includes(e.id) ? ' on' : ''}${open ? '' : ' locked'}" data-el="${e.id}" style="--c:${e.color}">${hex(e.id, open ? '' : 'locked')}<span>${open ? e.name.toUpperCase() : 'LOCKED'}</span></button>`;
        }).join('')}</div>
        <div class="actions"><button class="btn primary" id="loDone"><b>DONE</b></button></div>`, sh => {
        sh.classList.add('wide');
        sh.querySelectorAll('.pick').forEach(b => b.onclick = () => {
          const id = b.dataset.el;
          if (!Save.elementOpen(id)) { Sfx.denied(); const e = ELEMENT_BY_ID[id]; toast(`UNLOCKS AT STAGE ${stageLabel(e.unlock[0], e.unlock[1])}`); return; }
          Sfx.click();
          if (sel.includes(id)) { if (sel.length > 1) sel = sel.filter(x => x !== id); }
          else if (sel.length < 3) sel.push(id);
          else { sel.shift(); sel.push(id); }
          draw();
        });
        sh.querySelector('#loDone').onclick = () => {
          Sfx.click(); Save.setLoadout(sel);
          if (current === 'home') refreshHome();
          after ? after() : closeModal();
        };
      });
    };
    draw();
  }

  /* -------------------------------------------------------------- codex */
  function openCodex() { show('codex'); renderCodex(); }
  function renderCodex() {
    const list = $('codexList');
    list.innerHTML = '';
    for (const e of ELEMENTS) {
      const open = Save.elementOpen(e.id);
      const b = document.createElement('button');
      b.className = 'el-pill' + (e.id === codexSel ? ' active' : '');
      b.style.setProperty('--c', e.color);
      b.innerHTML = `${hex(e.id, open ? '' : 'locked')}<span>${open ? e.name.toUpperCase() : 'LOCKED'}</span>`;
      b.onclick = () => { Sfx.click(); codexSel = e.id; renderCodex(); };
      list.appendChild(b);
    }
    $('codexCount').textContent = Save.unlockedElements().length + '/' + ELEMENTS.length;
    const e = ELEMENT_BY_ID[codexSel];
    const open = Save.elementOpen(e.id);
    if (open) Game.setPreviewElement(e.id);
    const det = $('codexDetail');
    det.style.setProperty('--c', e.color);
    det.innerHTML = `
      <div class="cd-head">${hex(e.id, open ? '' : 'locked')}<div><h3>${open ? e.name.toUpperCase() : 'LOCKED'}</h3><p>${open ? e.blurb : 'Clear stage ' + stageLabel(e.unlock[0], e.unlock[1]) + ' to unlock.'}</p></div></div>
      <div class="moves">${e.moves.map((mv, i) => `
        <div class="move"${open ? '' : ' style="opacity:.5"'}>
          <div class="move-top"><span class="move-ic" style="--c:${e.color}"><span class="ic" data-icon="${mv.icon}"></span></span>
            <div><h4>${mv.name.toUpperCase()}</h4><div class="tags"><span>${i === 0 ? 'MAIN' : 'POWER'}</span>${mv.type === 'melee' ? '<span class="melee">MELEE</span>' : mv.type === 'ranged' ? '<span class="ranged">RANGED</span>' : ''}</div></div></div>
          <p>${mv.desc}</p>
          <div class="meta">${mv.dmg ? `<span>${mv.dmg}${mv.count ? '×' + mv.count : ''} DMG</span>` : ''}<span>${mv.cd}S</span><kbd>${KEYS[i]}</kbd></div>
        </div>`).join('')}</div>`;
    Icons.hydrate(det);
  }

  /* -------------------------------------------------------------- forge */
  function openForge() { show('forge'); renderForge(); }
  function renderForge() {
    const grid = $('forgeGrid');
    grid.innerHTML = '';
    for (const u of UPGRADES) {
      const lv = Save.data.upgrades[u.id];
      const cost = Save.upgradeCost(u.id);
      const card = document.createElement('div');
      card.className = 'card up';
      card.style.setProperty('--c', u.color);
      card.innerHTML = `<div class="up-top"><span class="up-ic"><span class="ic" data-icon="${u.icon === 'shield' ? 'shieldUi' : u.icon}"></span></span><div><h4>${u.name.toUpperCase()}</h4><p>${u.desc}</p></div></div>
        <div class="meter">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>`;
      const b = document.createElement('button');
      if (cost == null) { b.className = 'btn'; b.innerHTML = '<b>MAXED</b>'; b.disabled = true; }
      else {
        b.className = 'btn' + (Save.data.essence >= cost ? ' primary' : '');
        b.innerHTML = `<span class="ic" data-icon="gem"></span><b>${cost}</b>`;
        b.onclick = () => {
          if (Save.buy(u.id)) { Sfx.pickup(); show('forge'); renderForge(); }
          else { Sfx.denied(); toast('NOT ENOUGH ESSENCE'); }
        };
      }
      card.appendChild(b);
      grid.appendChild(card);
    }
    Icons.hydrate(grid);
  }

  /* -------------------------------------------------------------- modal */
  function modal(html, onOpen, cls = '') {
    const m = $('modal'), s = $('sheet');
    s.className = 'sheet ' + cls;
    s.innerHTML = html;
    Icons.hydrate(s);
    m.classList.remove('hidden');
    s.scrollTop = 0;
    s.style.animation = 'none'; void s.offsetWidth; s.style.animation = '';
    onOpen && onOpen(s);
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  const modalOpen = () => !$('modal').classList.contains('hidden');

  function openSettings(fromPause) {
    const st = Save.data.settings;
    const rows = [['sfx', 'SOUND'], ['music', 'MUSIC'], ['shake', 'SCREEN SHAKE'], ['numbers', 'DAMAGE NUMBERS']];
    modal(`
      <h2>SETTINGS</h2>
      <div class="toggles">${rows.map(([k, label]) => `<button class="toggle${st[k] ? ' on' : ''}" data-k="${k}">${label}<span class="sw"></span></button>`).join('')}</div>
      <div class="keys">
        <span><kbd>A</kbd><kbd>D</kbd></span><span>Move, <kbd>S</kbd> to drop through</span>
        <span><kbd>W</kbd><kbd>SPACE</kbd></span><span>Jump, again in the air</span>
        <span><kbd>CLICK</kbd></span><span>Main attack toward the cursor</span>
        <span><kbd>Q</kbd><kbd>E</kbd></span><span>Element powers</span>
        <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span><span>Swap element</span>
      </div>
      <div class="actions"><button class="btn primary" id="setBack"><b>${fromPause ? 'BACK' : 'DONE'}</b></button><button class="btn danger" id="setReset"><b>RESET</b></button></div>`, s => {
      s.querySelectorAll('.toggle').forEach(t => t.onclick = () => {
        const k = t.dataset.k;
        st[k] = !st[k];
        t.classList.toggle('on', st[k]);
        applySettings(); Save.save(); Sfx.click();
      });
      s.querySelector('#setBack').onclick = () => { Sfx.click(); fromPause ? openPause() : closeModal(); };
      s.querySelector('#setReset').onclick = () => confirmReset(fromPause);
    });
  }

  function confirmReset(fromPause) {
    modal(`<h2 class="lose">RESET PROGRESS?</h2><p class="tip">Stars, essence, upgrades and elements will be erased.</p>
      <div class="actions"><button class="btn" id="rsNo"><b>CANCEL</b></button><button class="btn danger" id="rsYes"><b>ERASE</b></button></div>`, s => {
      s.querySelector('#rsNo').onclick = () => openSettings(fromPause);
      s.querySelector('#rsYes').onclick = () => { Save.reset(); applySettings(); closeModal(); Game.idleScene(0); show('home'); toast('PROGRESS RESET'); };
    });
  }

  function applySettings() { const st = Save.data.settings; Sfx.setSfx(st.sfx); Sfx.setMusic(st.music); }

  function openPause() {
    if (Game.state !== 'play') return;
    Game.paused = true;
    Platform.gameplayStop();
    const label = Game.mode === 'stage' ? `${REALMS[lastStart.r].name.toUpperCase()} · ${stageLabel(lastStart.r, lastStart.s)}` : 'ENDLESS';
    modal(`
      <h2>PAUSED</h2>
      <p class="sub">${label}</p>
      <div class="actions"><button class="btn primary big" id="pResume"><b>RESUME</b></button></div>
      <div class="actions">
        <button class="btn" id="pRestart"><b>RESTART</b></button>
        <button class="btn" id="pLoadout"><b>ELEMENTS</b></button>
        <button class="btn" id="pSettings"><b>SETTINGS</b></button>
        <button class="btn" id="pQuit"><b>QUIT</b></button>
      </div>`, s => {
      s.querySelector('#pResume').onclick = resume;
      s.querySelector('#pRestart').onclick = () => { Sfx.click(); closeModal(); Game.quit(); relaunch(); };
      s.querySelector('#pLoadout').onclick = () => { Sfx.click(); openLoadout(() => { closeModal(); Game.quit(); relaunch(); toast('RESTARTED WITH NEW ELEMENTS'); }); };
      s.querySelector('#pSettings').onclick = () => openSettings(true);
      s.querySelector('#pQuit').onclick = () => {
        Sfx.click(); closeModal();
        const m = Game.mode;
        Game.quit();
        m === 'stage' ? openMap(lastStart.r) : (Game.idleScene(0), show('home'));
      };
    });
  }
  function resume() {
    Sfx.click(); closeModal();
    Game.paused = false;
    if (Game.state === 'play') Platform.gameplayStart();
  }

  /* ------------------------------------------------------------ results */
  function showResult(res) {
    $('bossBar').classList.add('hidden');
    const tiles = `<div class="stat-tiles"><div><b>${res.kills}</b><small>DEFEATED</small></div><div><b>${res.ringouts}</b><small>RING OUTS</small></div><div><b>${res.bestCombo}</b><small>BEST COMBO</small></div></div>`;
    const reward = `<div class="payout"><span class="ic" data-icon="gem"></span>+${res.essence}${res.bonus ? `<small>INCL. ${res.bonus} CLEAR BONUS</small>` : ''}</div>`;
    if (res.mode === 'endless') {
      modal(`
        <h2 class="${res.best ? 'win' : ''}">${res.best ? 'NEW RECORD!' : 'RUN OVER'}</h2>
        <p class="sub">${res.kills} DEFEATED · BEST ${res.bestKills}</p>
        ${tiles}${reward}
        <div class="actions"><button class="btn" id="rMenu"><b>HOME</b></button><button class="btn primary" id="rAgain"><b>AGAIN</b></button></div>`, s => {
        s.querySelector('#rMenu').onclick = () => { Sfx.click(); closeModal(); Game.idleScene(0); show('home'); };
        s.querySelector('#rAgain').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startEndless()); };
      }, 'result');
      return;
    }
    const { r, s } = res;
    const boss = s === STAGES_PER_REALM - 1;
    if (res.won) {
      const nextR = s + 1 < STAGES_PER_REALM ? r : r + 1;
      const nextS = s + 1 < STAGES_PER_REALM ? s + 1 : 0;
      const hasNext = nextR < REALMS.length;
      const u = res.unlocked;
      modal(`
        <h2 class="win">${boss ? 'REALM CONQUERED!' : 'VICTORY!'}</h2>
        <div class="big-stars">${[1, 2, 3].map(k => `<span class="ic${k <= res.stars ? ' on' : ''}" data-icon="star"></span>`).join('')}</div>
        <p class="sub">${REALMS[r].name.toUpperCase()} · STAGE ${stageLabel(r, s)}</p>
        ${tiles}${reward}
        ${u ? `<div class="unlock" style="--c:${u.color}">${hex(u.id)}<div><small>NEW ELEMENT UNLOCKED</small><b>${u.name.toUpperCase()}</b><p>${u.blurb}</p></div></div>` : ''}
        ${boss && res.firstClear && hasNext ? `<p class="sub">${REALMS[nextR].name.toUpperCase()} IS NOW OPEN</p>` : ''}
        <div class="actions">
          <button class="btn" id="rMap"><b>MAP</b></button>
          <button class="btn" id="rRetry"><b>RETRY</b></button>
          ${hasNext ? '<button class="btn primary" id="rNext"><b>NEXT</b></button>' : ''}
        </div>`, sh => {
        if (u) { Sfx.unlock(); Platform.happytime(); const l = Save.loadout(); if (l.length < 3 && !l.includes(u.id)) { Save.setLoadout(l.concat(u.id)); toast(`${u.name.toUpperCase()} ADDED TO YOUR ELEMENTS`); } }
        sh.querySelector('#rMap').onclick = () => { Sfx.click(); closeModal(); openMap(hasNext && boss ? nextR : r); };
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(r, s)); };
        const nb = sh.querySelector('#rNext');
        if (nb) nb.onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(nextR, nextS)); };
      }, 'result');
    } else {
      modal(`
        <h2 class="lose">DEFEATED</h2>
        <p class="sub">${REALMS[r].name.toUpperCase()} · STAGE ${stageLabel(r, s)}</p>
        ${tiles}${reward}
        <p class="tip">${pick(TIPS)}</p>
        <div class="actions">
          <button class="btn" id="rMap"><b>MAP</b></button>
          <button class="btn" id="rForge"><b>UPGRADES</b></button>
          <button class="btn primary" id="rRetry"><b>RETRY</b></button>
        </div>`, sh => {
        sh.querySelector('#rMap').onclick = () => { Sfx.click(); closeModal(); openMap(r); };
        sh.querySelector('#rForge').onclick = () => { Sfx.click(); closeModal(); Game.idleScene(r); returnTo = 'map'; openForge(); };
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(r, s)); };
      }, 'result');
    }
  }

  /* --------------------------------------------------------------- run */
  function startStage(r, s) {
    lastStart = { mode: 'stage', r, s };
    closeModal(); show(null);
    Game.start({ mode: 'stage', r, s });
    hudCache = {};
    buildHud();
    const realm = REALMS[r];
    setChip(realm.element, `${realm.name.toUpperCase()} ${stageLabel(r, s)}`);
    banner(s === STAGES_PER_REALM - 1 ? 'BOSS STAGE' : `STAGE ${stageLabel(r, s)}`, s === STAGES_PER_REALM - 1 ? 'boss' : '');
    maybeCoach();
  }
  function startEndless() {
    lastStart = { mode: 'endless' };
    closeModal(); show(null);
    Game.start({ mode: 'endless' });
    hudCache = {};
    buildHud();
    setChip('none', 'ENDLESS');
    banner('ENDLESS');
    maybeCoach();
  }
  function relaunch() { if (lastStart) lastStart.mode === 'stage' ? startStage(lastStart.r, lastStart.s) : startEndless(); }

  function setChip(el, title) {
    const e = $('chipEmblem');
    e.style.setProperty('--c', colorOf(el));
    e.innerHTML = elementIcon(el);
    $('chipTitle').textContent = title;
  }

  /* --------------------------------------------------------------- HUD */
  function buildHud() {
    const h = Game.hud();
    const dock = $('dock');
    dock.innerHTML = h.loadout.map((id, i) => `<div class="dock-slot" data-i="${i}">${hex(id)}<kbd>${i + 1}</kbd></div>`).join('');
    dock.querySelectorAll('.dock-slot').forEach(d => d.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      if (Game.selectSlot(+d.dataset.i)) Sfx.click();
    }));
    dock.classList.toggle('hidden', h.loadout.length < 2);
    refreshAbilities(h);
  }

  function refreshAbilities(h) {
    const el = ELEMENT_BY_ID[h.el];
    $('dock').querySelectorAll('.dock-slot').forEach(d => d.classList.toggle('on', +d.dataset.i === h.elIdx));
    const orbs = [document.querySelector('.orb-main'), document.querySelector('.orb-p1'), document.querySelector('.orb-p2')];
    orbs.forEach((b, i) => {
      b.style.setProperty('--c', el.color);
      b.querySelector('.orb-icon').innerHTML = Icons.svg(h.moves[i].mv.icon);
      b.title = h.moves[i].mv.name;
    });
  }

  function tick() {
    if (current !== null) return;
    const h = Game.hud();
    if (!h) return;
    const set = (k, v, fn) => { if (hudCache[k] !== v) { hudCache[k] = v; fn(v); } };
    set('el', h.el + h.elIdx, () => refreshAbilities(h));
    set('ess', h.essence, v => { $('hudEssence').textContent = fmt(v); });
    const orbs = [document.querySelector('.orb-main'), document.querySelector('.orb-p1'), document.querySelector('.orb-p2')];
    h.moves.forEach((m, i) => {
      const p = m.left > 0 ? Math.round(m.left / m.full * 50) / 50 : 0;
      const num = i > 0 && m.left > 0.95 ? Math.ceil(m.left) : '';
      set('cd' + i, p + ':' + num, () => {
        orbs[i].style.setProperty('--p', p);
        orbs[i].classList.toggle('cooling', p > 0);
        orbs[i].querySelector('.cd-num').textContent = num;
        if (p === 0 && i > 0 && hudCache['was' + i]) { orbs[i].classList.remove('ready-flash'); void orbs[i].offsetWidth; orbs[i].classList.add('ready-flash'); }
        hudCache['was' + i] = p > 0;
      });
    });
    if (Game.mode === 'stage') {
      set('wave', h.wave + ':' + h.waves + ':' + h.left, () => {
        $('waveDots').innerHTML = Array.from({ length: h.waves }, (_, i) => `<i class="${i < h.wave || (i === h.wave && h.left === 0) ? 'done' : i === h.wave ? 'now' : ''}"></i>`).join('');
        $('chipSub').textContent = `${h.left} FOE${h.left === 1 ? '' : 'S'} REMAIN`;
      });
    } else {
      set('endless', h.kills, k => { $('waveDots').innerHTML = ''; $('chipSub').textContent = `${k} DEFEATED · BEST ${Save.data.endlessBest}`; });
    }
    const bb = $('bossBar');
    if (h.boss) {
      if (bb.classList.contains('hidden')) {
        bb.classList.remove('hidden');
        $('bossName').textContent = h.boss.name.toUpperCase();
        $('bossTitle').textContent = h.boss.title.toUpperCase();
        const em = $('bossEmblem'); em.style.setProperty('--c', colorOf(h.boss.el)); em.innerHTML = elementIcon(h.boss.el);
      }
      set('boss', Math.round(h.boss.ratio * 300), () => { $('bossFill').style.width = h.boss.ratio * 100 + '%'; });
    } else if (!bb.classList.contains('hidden')) bb.classList.add('hidden');
  }

  function onCombo(n) {
    const c = $('combo');
    if (n < 3) { c.classList.add('hidden'); return; }
    c.classList.remove('hidden');
    $('comboNum').textContent = n + '×';
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  }

  let bannerTimer = null;
  function banner(text, cls = '') {
    const b = $('banner');
    b.className = 'banner ' + cls;
    const span = $('bannerText');
    span.textContent = text;
    span.style.animation = 'none'; void span.offsetWidth; span.style.animation = '';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.add('hidden'), 1850);
  }

  /* ------------------------------------------------------------- coach */
  function maybeCoach() {
    const c = $('coach');
    if (Save.data.seenHelp) { c.classList.add('hidden'); return; }
    const touch = document.body.classList.contains('touch');
    const steps = touch
      ? ['DRAG ON THE LEFT TO MOVE · TAP THE BIG ORB TO ATTACK', 'THE SMALL ORBS ARE YOUR ELEMENT POWERS', 'KNOCK FOES OFF THE ISLANDS · DON\'T FALL YOURSELF!']
      : ['A / D MOVE · SPACE JUMP · CLICK TO ATTACK', 'Q / E POWERS · 1 2 3 SWAP ELEMENT', 'KNOCK FOES OFF THE ISLANDS · DON\'T FALL YOURSELF!'];
    coachStep = 0;
    const next = () => {
      if (coachStep >= steps.length) { c.classList.add('hidden'); Save.data.seenHelp = true; Save.save(); return; }
      $('coachText').textContent = steps[coachStep++];
      c.classList.remove('hidden');
      setTimeout(next, 4800);
    };
    next();
  }

  /* ------------------------------------------------------------ toasts */
  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }

  /* ----------------------------------------------------- touch controls */
  function bindTouch() {
    const joy = $('joy'), knob = $('joyKnob'), base = joy.querySelector('.joy-base');
    let jp = null, ox = 0, oy = 0, dropped = false;
    joy.addEventListener('pointerdown', e => {
      if (jp != null) return;
      e.preventDefault();
      jp = e.pointerId; ox = e.clientX; oy = e.clientY; dropped = false;
      const r = joy.getBoundingClientRect();
      for (const el of [base, knob]) { el.style.left = (ox - r.left) + 'px'; el.style.top = (oy - r.top) + 'px'; }
      joy.classList.add('on');
      try { joy.setPointerCapture(jp); } catch (err) { /* ignore */ }
    });
    joy.addEventListener('pointermove', e => {
      if (e.pointerId !== jp) return;
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const l = Math.hypot(dx, dy), max = 54;
      if (l > max) { dx = dx / l * max; dy = dy / l * max; }
      knob.style.left = (ox - r.left + dx) + 'px'; knob.style.top = (oy - r.top + dy) + 'px';
      Game.setJoy(Math.abs(dx) > 10 ? clamp(dx / 42, -1, 1) : 0);
      if (dy > 40 && !dropped) { dropped = true; Game.press('drop'); }
      if (dy < 20) dropped = false;
    });
    const end = e => { if (e.pointerId !== jp) return; jp = null; joy.classList.remove('on'); Game.setJoy(0); };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);

    document.querySelectorAll('.orb').forEach(b => {
      const act = b.dataset.act;
      let pid = null, sx = 0, sy = 0;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        Sfx.ensure();
        pid = e.pointerId; sx = e.clientX; sy = e.clientY;
        try { b.setPointerCapture(pid); } catch (err) { /* ignore */ }
        if (act !== 'p1' && act !== 'p2') Game.press(act);
      });
      b.addEventListener('pointermove', e => {
        if (e.pointerId !== pid || act === 'jump') return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.hypot(dx, dy) > 22) Game.setDirAim(Math.atan2(dy, dx));
      });
      const up = e => {
        if (e.pointerId !== pid) return;
        pid = null;
        if (act === 'p1' || act === 'p2') Game.press(act);
        Game.release(act);
        setTimeout(() => Game.setDirAim(null), 60);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    });
  }

  /* -------------------------------------------------------------- init */
  function init() {
    Icons.hydrate();
    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
    $('btnPlay').onclick = () => { Sfx.ensure(); Sfx.click(); openMap(); };
    $('btnEndless').onclick = () => { Sfx.ensure(); Sfx.click(); startEndless(); };
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
      Sfx.ensure(); Sfx.click();
      const k = b.dataset.open;
      if (k === 'settings') openSettings(false);
      else if (k === 'loadout') openLoadout();
      else if (k === 'codex') { codexSel = Save.loadout()[0]; openCodex(); }
      else if (k === 'forge') { returnTo = 'home'; openForge(); }
    });
    document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => {
      Sfx.click();
      if (b.closest('#forge') && returnTo === 'map') { returnTo = 'home'; openMap(Game.realmIdx); return; }
      Game.idleScene(b.closest('#map') ? Game.realmIdx : 0);
      show('home');
    });
    $('btnPause').addEventListener('pointerdown', e => { e.stopPropagation(); Sfx.click(); openPause(); });
    $('modal').addEventListener('pointerdown', e => e.stopPropagation());
    $('btnRotateOk').onclick = () => { $('rotate').classList.add('hidden'); rotateDismissed = true; };
    bindTouch();

    Game.hooks.onEnd = res => showResult(res);
    Game.hooks.onCombo = onCombo;
    Game.hooks.onBoss = e => banner(e.ai.boss.name.toUpperCase(), 'boss');
    Game.hooks.onToast = (t, big) => (big ? banner(t.toUpperCase()) : toast(t.toUpperCase()));
    Game.hooks.onWave = (i, n, boss) => { if (!boss && Game.mode === 'stage' && i > 0) banner(i === n - 1 ? 'FINAL WAVE' : `WAVE ${i + 1}`); };
    Game.hooks.onKill = (e, ringout) => { if (ringout) toast('RING OUT! +2'); };

    applySettings();
    Game.idleScene(0);
    show('home');
    checkRotate();
  }

  function checkRotate() {
    const portrait = window.innerHeight > window.innerWidth * 1.1 && document.body.classList.contains('touch');
    $('rotate').classList.toggle('hidden', !portrait || rotateDismissed);
  }

  return {
    init, tick, show, openPause, resume, toast, checkRotate, modalOpen, closeModal,
    get screen() { return current; },
  };
})();
