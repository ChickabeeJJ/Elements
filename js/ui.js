'use strict';
/* =========================================================================
   UI: home, campaign map, battle prep (loadout), element grimoire,
   upgrades, settings/pause/results modals, the battle HUD and touch
   controls. Pure DOM over the canvas.
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

  const medal = (id, cls = '') => `<span class="medal ${cls}" style="--c:${(ELEMENT_BY_ID[id] || NEUTRAL).color}">${elementIcon(id)}</span>`;
  const TIPS = [
    'Knocking a foe off the islands is an instant kill: the more hurt they are, the further they fly.',
    'Hitting an elemental weakness deals 160% damage. Check the realm before you pick a loadout.',
    'A "!" over an enemy means an attack is coming. Jump or dash out of the way.',
    'Double jump to recover if you get knocked off an edge.',
    'Rime freezes foes solid; Ice Lance and Stone shatter them.',
    'Soak foes with Tide, then hit them with Storm for bonus damage.',
    'Swap elements mid-fight with 1, 2 and 3 to chain powers together.',
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
    refreshEssence();
  }
  function refreshEssence() { document.querySelectorAll('.essence-val').forEach(el => { el.textContent = fmt(Save.data.essence); }); }

  function refreshHome() {
    const [r, s] = Save.nextStage();
    const all = Object.keys(Save.data.stars).length >= TOTAL_STAGES;
    $('playSub').textContent = all ? 'All stages clear' : `Stage ${stageLabel(r, s)} · ${REALMS[r].name}`;
    $('endlessSub').textContent = 'Best ' + Save.data.endlessBest + ' kills';
    $('homeStars').textContent = Save.totalStars() + '/' + TOTAL_STAGES * 3;
    $('homeElems').textContent = Save.unlockedElements().length + '/' + ELEMENTS.length;
    const cheapest = Math.min(...UPGRADES.map(u => Save.upgradeCost(u.id) ?? Infinity));
    $('homeForge').textContent = cheapest <= Save.data.essence ? 'Upgrade ready!' : 'Forge';
    $('homeLoadout').innerHTML = `<span class="lbl">Loadout</span><span class="row">${Save.loadout().map(id => medal(id)).join('')}</span>`;
  }

  /* --------------------------------------------------------------- map */
  function openMap(r) {
    const [nr] = Save.nextStage();
    mapRealm = r != null ? r : nr;
    Game.idleScene(mapRealm);
    show('map');
    renderMap();
  }

  function realmArt(realm) {
    return `<svg class="art" viewBox="0 0 200 128" preserveAspectRatio="xMidYMid slice">
      <defs><linearGradient id="g${realm.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${realm.sky[0]}"/><stop offset="0.6" stop-color="${realm.sky[1]}"/><stop offset="1" stop-color="${realm.sky[2]}"/></linearGradient></defs>
      <rect width="200" height="128" fill="url(#g${realm.id})"/>
      <circle cx="${realm.sunPos[0] * 200}" cy="${realm.sunPos[1] * 128 + 6}" r="13" fill="${realm.sun}" opacity=".9"/>
      <path d="M0 86 Q30 60 60 80 T120 72 T200 78 V128 H0Z" fill="${realm.hills[0]}"/>
      <path d="M0 100 Q40 82 80 98 T160 92 T200 96 V128 H0Z" fill="${realm.hills[1]}"/>
      <path d="M118 74 h52 l-6 8 -14 22 -12 -10 -14 -12z" fill="${realm.rock}"/><rect x="116" y="70" width="56" height="6" rx="3" fill="${realm.top}"/>
      <path d="M0 112 Q50 104 100 114 T200 110 V128 H0Z" fill="${realm.hills[2]}"/>
    </svg>`;
  }

  function renderMap() {
    const strip = $('chapters');
    strip.innerHTML = '';
    REALMS.forEach((realm, i) => {
      const open = Save.realmOpen(i);
      const stars = Array.from({ length: STAGES_PER_REALM }, (_, s) => Save.data.stars[stageKey(i, s)] || 0).reduce((a, b) => a + b, 0);
      const b = document.createElement('button');
      b.className = 'chapter' + (i === mapRealm ? ' active' : '') + (open ? '' : ' locked');
      b.innerHTML = `${realmArt(realm)}<span class="num">REALM ${i + 1}</span><b>${realm.name}</b><span class="meta"><span class="ic" data-icon="star"></span>${stars}/${STAGES_PER_REALM * 3}</span>${open ? '' : '<span class="ic lockic" data-icon="lock"></span>'}`;
      b.onclick = () => {
        if (!open) { Sfx.denied(); toast(`Defeat ${REALMS[i - 1].boss.name} to open ${realm.name}`); return; }
        Sfx.click(); mapRealm = i; Game.idleScene(i); renderMap();
      };
      strip.appendChild(b);
    });

    const realm = REALMS[mapRealm];
    const aff = AFFINITY[realm.element];
    const [nr, ns] = Save.nextStage();
    const d = $('chapterDetail');
    d.innerHTML = `
      <div class="panel realm-info">
        <h3>${realm.name}</h3>
        <div class="sub">${ELEMENT_BY_ID[realm.element].name} warriors guard these islands. Their champion: <b style="color:${AURA[realm.element]}">${realm.boss.name}</b>.</div>
        <div class="aff-row"><span class="tag weak">WEAK TO</span>${aff.weak.map(w => medal(w)).join('')}</div>
        <div class="aff-row"><span class="tag res">RESISTS</span>${aff.resist.map(w => medal(w)).join('')}</div>
      </div>
      <div class="panel stage-path">
        <svg class="path" viewBox="0 0 600 300" preserveAspectRatio="none"><path d="M50 196 C 90 196, 110 104, 150 104 S 210 196, 250 196 S 310 104, 350 104 S 410 196, 450 196 S 510 104, 550 104" fill="none" stroke="#160e29" stroke-width="16" stroke-linecap="round"/><path d="M50 196 C 90 196, 110 104, 150 104 S 210 196, 250 196 S 310 104, 350 104 S 410 196, 450 196 S 510 104, 550 104" fill="none" stroke="#8a74d6" stroke-width="8" stroke-dasharray="2 16" stroke-linecap="round"/></svg>
        <div class="nodes" id="nodes"></div>
      </div>`;
    const nodes = d.querySelector('#nodes');
    for (let s = 0; s < STAGES_PER_REALM; s++) {
      const open = Save.stageOpen(mapRealm, s);
      const st = Save.data.stars[stageKey(mapRealm, s)] || 0;
      const boss = s === STAGES_PER_REALM - 1;
      const unlock = elementUnlockedBy(mapRealm, s);
      const cur = mapRealm === nr && s === ns && !st;
      const n = document.createElement('button');
      n.className = 'node' + (boss ? ' boss' : '') + (!open ? ' locked' : st ? ' done' : cur ? ' current' : '');
      n.innerHTML = (boss ? '<span class="ic crown" data-icon="crown"></span>' : '') +
        (open ? `<span>${s + 1}</span>` : '<span class="ic" data-icon="lock"></span>') +
        (open ? `<span class="stars">${[1, 2, 3].map(k => `<span class="ic${k <= st ? ' on' : ''}" data-icon="star"></span>`).join('')}</span>` : '') +
        (unlock && !st ? `<span class="reward medal" style="--c:${unlock.color}" title="Unlocks ${unlock.name}">${elementIcon(unlock.id)}</span>` : '');
      n.onclick = () => {
        if (!open) { Sfx.denied(); toast('Clear the previous stage first'); return; }
        Sfx.click(); openPrep({ mode: 'stage', r: mapRealm, s });
      };
      nodes.appendChild(n);
    }
    Icons.hydrate(strip); Icons.hydrate(d);
  }

  /* ------------------------------------------------------- battle prep */
  function openPrep(opts) {
    const unlocked = Save.unlockedElements();
    let sel = Save.loadout().slice();
    const realm = opts.mode === 'stage' ? REALMS[opts.r] : null;
    const aff = realm ? AFFINITY[realm.element] : null;
    const draw = () => {
      const title = opts.mode === 'stage' ? `Stage ${stageLabel(opts.r, opts.s)}` : 'Endless';
      const boss = opts.mode === 'stage' && opts.s === STAGES_PER_REALM - 1;
      const foe = realm
        ? `<div class="prep-foe">${medal(realm.element)}<div><b>${boss ? realm.boss.name : ELEMENT_BY_ID[realm.element].name + ' warriors'}</b><small>${boss ? realm.boss.title : realm.name} · weak to ${aff.weak.map(w => ELEMENT_BY_ID[w].name).join(', ')}</small></div></div>`
        : `<div class="prep-foe">${medal('none')}<div><b>Endless waves</b><small>Every realm, ever harder. Best: ${Save.data.endlessBest} kills</small></div></div>`;
      modal(`
        <h2 class="title-ribbon gold">${title}</h2>
        <div class="prep-top">${foe}</div>
        <p class="prep-h">Your loadout (up to 3)</p>
        <div class="slots">${[0, 1, 2].map(i => {
          const id = sel[i];
          return `<div class="slot"><kbd>${i + 1}</kbd>${id ? medal(id) : '<span class="empty"><span class="ic" data-icon="plus"></span></span>'}<small>${id ? ELEMENT_BY_ID[id].name : 'Empty'}</small></div>`;
        }).join('')}</div>
        <div class="picker">${ELEMENTS.map(e => {
          const open = unlocked.includes(e);
          const good = aff && aff.weak.includes(e.id);
          return `<button class="pick${sel.includes(e.id) ? ' on' : ''}${open ? '' : ' locked'}" data-el="${e.id}">${good && open ? '<span class="badge">STRONG</span>' : ''}${medal(e.id, open ? '' : 'locked')}<small>${open ? e.name : '???'}</small></button>`;
        }).join('')}</div>
        <div class="actions">
          <button class="cbtn cbtn-dark" id="prepBack"><b>Back</b></button>
          <button class="cbtn cbtn-gold lg" id="prepGo"><span class="ic" data-icon="play"></span><b>Fight!</b></button>
        </div>`, sh => {
        sh.classList.add('wide');
        sh.querySelectorAll('.pick').forEach(b => b.onclick = () => {
          const id = b.dataset.el;
          if (!Save.elementOpen(id)) { Sfx.denied(); const e = ELEMENT_BY_ID[id]; toast(`Unlocks at stage ${stageLabel(e.unlock[0], e.unlock[1])}`); return; }
          Sfx.click();
          if (sel.includes(id)) { if (sel.length > 1) sel = sel.filter(x => x !== id); }
          else if (sel.length < 3) sel.push(id);
          else { sel.shift(); sel.push(id); }
          draw();
        });
        sh.querySelector('#prepBack').onclick = () => { Sfx.click(); closeModal(); };
        sh.querySelector('#prepGo').onclick = () => {
          Sfx.click(); Save.setLoadout(sel); closeModal();
          opts.mode === 'stage' ? startStage(opts.r, opts.s) : startEndless();
        };
      });
    };
    draw();
  }

  /* -------------------------------------------------------------- codex */
  function openCodex() { show('codex'); renderCodex(); }
  function renderCodex() {
    const list = $('codexList');
    list.classList.add('panel');
    list.innerHTML = '';
    for (const e of ELEMENTS) {
      const open = Save.elementOpen(e.id);
      const b = document.createElement('button');
      b.className = 'codex-item' + (e.id === codexSel ? ' active' : '');
      b.innerHTML = `${medal(e.id, open ? '' : 'locked')}<small>${open ? e.name : '???'}</small>`;
      b.onclick = () => { Sfx.click(); codexSel = e.id; renderCodex(); };
      list.appendChild(b);
    }
    $('codexCount').textContent = Save.unlockedElements().length + '/' + ELEMENTS.length;
    const e = ELEMENT_BY_ID[codexSel];
    const open = Save.elementOpen(e.id);
    if (open) Game.setPreviewElement(e.id);
    const det = $('codexDetail');
    det.classList.add('panel');
    const keys = ['LMB', 'Q', 'E'];
    det.innerHTML = `
      <div class="cd-head">${medal(e.id, open ? '' : 'locked')}<div><h3 style="color:${open ? e.color : 'inherit'}">${open ? e.name : 'Locked'}</h3><p>${open ? e.blurb : 'Clear stage ' + stageLabel(e.unlock[0], e.unlock[1]) + ' to master this element.'}</p></div></div>
      <div class="moves">${e.moves.map((mv, i) => `
        <div class="move-card"${open ? '' : ' style="filter:grayscale(1);opacity:.6"'}>
          <div class="move-top"><span class="move-ic" style="background:linear-gradient(180deg, ${e.color}, ${e.deep})"><span class="ic" data-icon="${mv.icon}"></span></span>
            <div><h4>${mv.name}</h4><div class="tags">${i === 0 ? '<span class="t-main">MAIN</span>' : '<span>POWER</span>'}${mv.type === 'melee' ? '<span class="t-melee">MELEE</span>' : mv.type === 'ranged' ? '<span class="t-ranged">RANGED</span>' : ''}</div></div></div>
          <p>${mv.desc}</p>
          <div class="stats">${mv.dmg ? `<span>${mv.dmg}${mv.count ? '×' + mv.count : ''} dmg</span>` : ''}<span>${mv.cd}s</span><kbd>${keys[i]}</kbd></div>
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
      card.className = 'panel up-card';
      card.innerHTML = `
        <div class="up-top"><span class="up-ic" style="background:linear-gradient(180deg, ${u.color}, ${mixHex(u.color, '#1b1235', 0.45)})"><span class="ic" data-icon="${u.icon === 'shield' ? 'shieldUi' : u.icon}"></span></span>
          <div><h4>${u.name}</h4><p>${u.desc} · Lv ${lv}/${u.max}</p></div></div>
        <div class="lv" style="--c:${u.color}">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>`;
      const b = document.createElement('button');
      if (cost == null) { b.className = 'cbtn cbtn-dark'; b.innerHTML = '<span class="ic" data-icon="check"></span><b>Maxed</b>'; b.disabled = true; }
      else {
        b.className = 'cbtn ' + (Save.data.essence >= cost ? 'cbtn-teal' : 'cbtn-dark');
        b.innerHTML = `<span class="ic" data-icon="gem"></span><b>${cost}</b>`;
        b.onclick = () => {
          if (Save.buy(u.id)) { Sfx.pickup(); renderForge(); refreshEssence(); }
          else { Sfx.denied(); toast('Not enough essence'); }
        };
      }
      card.appendChild(b);
      grid.appendChild(card);
    }
    Icons.hydrate(grid);
  }

  /* -------------------------------------------------------------- modal */
  function modal(html, onOpen) {
    const m = $('modal'), s = $('sheet');
    s.className = 'sheet panel';
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
    const rows = [['sfx', 'sound', 'Sound'], ['music', 'music', 'Music'], ['shake', 'shake', 'Screen shake'], ['numbers', 'hash', 'Damage numbers']];
    modal(`
      <h2 class="title-ribbon">Settings</h2>
      <div class="toggles">${rows.map(([k, ic, label]) => `<button class="toggle${st[k] ? ' on' : ''}" data-k="${k}"><span class="ic" data-icon="${ic}"></span>${label}<span class="sw"></span></button>`).join('')}</div>
      <div class="keys">
        <span><kbd>A</kbd><kbd>D</kbd></span><span>Move · <kbd>S</kbd> drop through</span>
        <span><kbd>W</kbd><kbd>SPACE</kbd></span><span>Jump (double jump in the air)</span>
        <span><kbd>LMB</kbd><kbd>J</kbd></span><span>Main attack (aim with the mouse)</span>
        <span><kbd>Q</kbd><kbd>E</kbd></span><span>Element powers (also RMB / K / L)</span>
        <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span><span>Swap element (or mouse wheel)</span>
      </div>
      <div class="actions"><button class="cbtn cbtn-gold" id="setDone"><b>Done</b></button></div>
      <button class="link-danger" id="setReset">Reset all progress</button>`, s => {
      s.querySelectorAll('.toggle').forEach(t => t.onclick = () => {
        const k = t.dataset.k;
        st[k] = !st[k];
        t.classList.toggle('on', st[k]);
        applySettings(); Save.save(); Sfx.click();
      });
      s.querySelector('#setDone').onclick = () => { Sfx.click(); fromPause ? openPause() : closeModal(); };
      s.querySelector('#setReset').onclick = () => confirmReset(fromPause);
    });
  }

  function confirmReset(fromPause) {
    modal(`<h2 class="title-ribbon red">Reset?</h2><p class="sub">Stars, essence, upgrades and unlocked elements will be erased for good.</p>
      <div class="actions"><button class="cbtn cbtn-dark" id="rsNo"><b>Cancel</b></button><button class="cbtn cbtn-red" id="rsYes"><b>Erase</b></button></div>`, s => {
      s.querySelector('#rsNo').onclick = () => openSettings(fromPause);
      s.querySelector('#rsYes').onclick = () => {
        Save.reset(); applySettings(); closeModal();
        Game.idleScene(0); show('home'); toast('Progress reset');
      };
    });
  }

  function applySettings() { const st = Save.data.settings; Sfx.setSfx(st.sfx); Sfx.setMusic(st.music); }

  function openPause() {
    if (Game.state !== 'play') return;
    Game.paused = true;
    Platform.gameplayStop();
    const label = Game.mode === 'stage' ? `${REALMS[lastStart.r].name} · ${stageLabel(lastStart.r, lastStart.s)}` : 'Endless';
    modal(`
      <h2 class="title-ribbon">Paused</h2>
      <p class="sub">${label}</p>
      <div class="stack">
        <button class="cbtn cbtn-gold lg" id="pResume"><span class="ic" data-icon="play"></span><b>Resume</b></button>
        <div class="actions">
          <button class="cbtn cbtn-violet" id="pRestart"><span class="ic" data-icon="restart"></span><b>Restart</b></button>
          <button class="cbtn cbtn-violet" id="pSettings"><span class="ic" data-icon="gear"></span><b>Settings</b></button>
        </div>
        <button class="cbtn cbtn-dark" id="pQuit"><span class="ic" data-icon="home"></span><b>Quit</b></button>
      </div>`, s => {
      s.querySelector('#pResume').onclick = resume;
      s.querySelector('#pRestart').onclick = () => { Sfx.click(); closeModal(); Game.quit(); relaunch(); };
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
    const tiles = `<div class="stat-tiles"><div><b>${res.kills}</b><small>Kills</small></div><div><b>${res.ringouts}</b><small>Ring outs</small></div><div><b>${res.bestCombo}</b><small>Best combo</small></div></div>`;
    const reward = `<div class="reward"><span class="ic" data-icon="gem"></span>+${res.essence}${res.bonus ? ` <small>incl. ${res.bonus} clear bonus</small>` : ''}</div>`;
    if (res.mode === 'endless') {
      modal(`
        <h2 class="title-ribbon ${res.best ? 'gold' : ''}">${res.best ? 'New Record!' : 'Run Over'}</h2>
        <p class="sub">${res.kills} foes defeated · best ${res.bestKills}</p>
        ${tiles}${reward}
        <div class="actions">
          <button class="cbtn cbtn-dark" id="rMenu"><span class="ic" data-icon="home"></span><b>Home</b></button>
          <button class="cbtn cbtn-gold" id="rAgain"><span class="ic" data-icon="restart"></span><b>Again</b></button>
        </div>`, s => {
        s.querySelector('#rMenu').onclick = () => { Sfx.click(); closeModal(); Game.idleScene(0); show('home'); };
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
      const u = res.unlocked;
      const unlock = u ? `<div class="unlock" style="--c:${u.color}">${medal(u.id)}<div><small>New element unlocked</small><b>${u.name}</b><p>${u.blurb}</p></div></div>` : '';
      modal(`
        <h2 class="title-ribbon gold">${boss ? 'Realm Conquered!' : 'Victory!'}</h2>
        <div class="big-stars">${[1, 2, 3].map(k => `<span class="ic${k <= res.stars ? ' on' : ''}" data-icon="star"></span>`).join('')}</div>
        <p class="sub">${REALMS[r].name} · Stage ${stageLabel(r, s)}</p>
        ${tiles}${reward}${unlock}
        ${boss && res.firstClear && hasNext ? `<p class="sub" style="color:${REALMS[nextR].tint}">${REALMS[nextR].name} is now open!</p>` : ''}
        <div class="actions">
          <button class="cbtn cbtn-dark" id="rMap"><span class="ic" data-icon="map"></span><b>Map</b></button>
          <button class="cbtn cbtn-violet" id="rRetry"><span class="ic" data-icon="restart"></span><b>Retry</b></button>
          ${hasNext ? '<button class="cbtn cbtn-gold" id="rNext"><b>Next</b><span class="ic" data-icon="next"></span></button>' : ''}
        </div>`, sh => {
        if (u) { Sfx.unlock(); Platform.happytime(); const l = Save.loadout(); if (l.length < 3 && !l.includes(u.id)) Save.setLoadout(l.concat(u.id)); }
        sh.querySelector('#rMap').onclick = () => { Sfx.click(); closeModal(); openMap(hasNext && boss ? nextR : r); };
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(r, s)); };
        const nb = sh.querySelector('#rNext');
        if (nb) nb.onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => { show('map'); mapRealm = nextR; openPrep({ mode: 'stage', r: nextR, s: nextS }); renderMap(); Game.idleScene(nextR); }); };
      });
    } else {
      modal(`
        <h2 class="title-ribbon red">Defeated</h2>
        <p class="sub">${REALMS[r].name} · Stage ${stageLabel(r, s)}</p>
        ${tiles}${reward}
        <p class="sub" style="margin:0">💡 ${pick(TIPS)}</p>
        <div class="actions">
          <button class="cbtn cbtn-dark" id="rMap"><span class="ic" data-icon="map"></span><b>Map</b></button>
          <button class="cbtn cbtn-teal" id="rForge"><span class="ic" data-icon="hammer"></span><b>Upgrade</b></button>
          <button class="cbtn cbtn-gold" id="rRetry"><span class="ic" data-icon="restart"></span><b>Retry</b></button>
        </div>`, sh => {
        sh.querySelector('#rMap').onclick = () => { Sfx.click(); closeModal(); openMap(r); };
        sh.querySelector('#rForge').onclick = () => { Sfx.click(); closeModal(); Game.idleScene(r); returnTo = 'map'; openForge(); };
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(r, s)); };
      });
    }
  }

  /* --------------------------------------------------------------- run */
  function startStage(r, s) {
    lastStart = { mode: 'stage', r, s };
    closeModal(); show(null);
    Game.start({ mode: 'stage', r, s });
    hudCache = {};
    buildHud();
    banner(s === STAGES_PER_REALM - 1 ? 'Boss Stage' : `Stage ${stageLabel(r, s)}`, s === STAGES_PER_REALM - 1 ? 'boss' : '');
    maybeCoach();
  }
  function startEndless() {
    lastStart = { mode: 'endless' };
    closeModal(); show(null);
    Game.start({ mode: 'endless' });
    hudCache = {};
    buildHud();
    banner('Endless');
    maybeCoach();
  }
  function relaunch() { if (lastStart) lastStart.mode === 'stage' ? startStage(lastStart.r, lastStart.s) : startEndless(); }

  /* --------------------------------------------------------------- HUD */
  function buildHud() {
    const h = Game.hud();
    const bar = $('loadoutBar');
    bar.innerHTML = '';
    h.loadout.forEach((id, i) => {
      const b = document.createElement('button');
      b.className = 'lslot';
      b.dataset.i = i;
      b.innerHTML = `${medal(id)}<kbd>${i + 1}</kbd>`;
      b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (Game.selectSlot(i)) Sfx.click(); });
      bar.appendChild(b);
    });
    $('waveChip').classList.toggle('hidden', false);
    refreshAbilities(h);
  }

  function refreshAbilities(h) {
    const el = ELEMENT_BY_ID[h.el];
    $('hudPortrait').innerHTML = medal(h.el);
    document.querySelectorAll('.lslot').forEach(s => s.classList.toggle('active', +s.dataset.i === h.elIdx));
    const btns = [document.querySelector('.ab-main'), document.querySelector('.ab-p1'), document.querySelector('.ab-p2')];
    btns.forEach((b, i) => {
      b.style.setProperty('--c', el.color);
      b.querySelector('.ab-icon').innerHTML = Icons.svg(h.moves[i].mv.icon);
      b.title = h.moves[i].mv.name;
    });
  }

  function tick() {
    if (current !== null) return;
    const h = Game.hud();
    if (!h) return;
    const set = (k, v, fn) => { if (hudCache[k] !== v) { hudCache[k] = v; fn(v); } };
    const hpPct = clamp(h.hp / h.maxHp, 0, 1) * 100;
    set('hp', Math.round(hpPct * 2), () => { $('hpFill').style.width = hpPct + '%'; $('hpGhost').style.width = hpPct + '%'; $('hpText').textContent = Math.ceil(h.hp); });
    set('sh', Math.round(h.shield), v => { $('hpShield').style.width = clamp(v / h.maxHp * 100, 0, 100) + '%'; });
    set('el', h.el + h.elIdx, () => refreshAbilities(h));
    set('ess', h.essence, v => { $('hudEssence').textContent = fmt(v); });
    const st = h.status;
    const sk = ['burn', 'freeze', 'chill', 'soak', 'root', 'shock'].filter(k => st[k] > 0).join(',');
    set('status', sk, v => {
      const map = { burn: 'fire', freeze: 'frost', chill: 'frost', soak: 'water', root: 'nature', shock: 'lightning' };
      $('statusRow').innerHTML = v ? v.split(',').map(k => `<span style="color:${AURA[map[k]]}" title="${k}">${elementIcon(map[k])}</span>`).join('') : '';
    });
    // cooldown sweeps
    const btns = [document.querySelector('.ab-main'), document.querySelector('.ab-p1'), document.querySelector('.ab-p2')];
    h.moves.forEach((m, i) => {
      const p = m.left > 0 ? Math.round(m.left / m.full * 100) : 0;
      set('cd' + i, p + ':' + (m.left > 0.95 ? Math.ceil(m.left) : ''), () => {
        btns[i].style.setProperty('--p', p + '%');
        btns[i].querySelector('.cd-num').textContent = i > 0 && m.left > 0.95 ? Math.ceil(m.left) : '';
        if (p === 0 && i > 0 && hudCache['was' + i]) { btns[i].classList.remove('ready-flash'); void btns[i].offsetWidth; btns[i].classList.add('ready-flash'); }
        hudCache['was' + i] = p > 0;
      });
    });
    if (Game.mode === 'stage') {
      set('wave', h.wave + ':' + h.waves + ':' + h.left, () => {
        $('waveText').textContent = `Wave ${Math.max(1, h.wave + 1)}/${h.waves}`;
        $('leftText').textContent = h.left;
      });
    } else {
      set('kills', h.kills, k => { $('waveText').textContent = `${k} kills`; $('leftText').textContent = 'Best ' + Save.data.endlessBest; });
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
    $('waveChip').classList.toggle('hidden', !!h.boss);
  }

  function onCombo(n) {
    const c = $('combo');
    if (n < 3) { c.classList.add('hidden'); return; }
    c.classList.remove('hidden');
    $('comboNum').textContent = n;
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  }

  let bannerTimer = null;
  function banner(text, cls = '') {
    const b = $('banner');
    b.className = 'banner ' + cls;
    $('bannerText').textContent = text;
    const span = $('bannerText');
    span.style.animation = 'none'; void span.offsetWidth; span.style.animation = '';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.add('hidden'), 1850);
  }

  /* ------------------------------------------------------------- coach */
  function maybeCoach() {
    const c = $('coach');
    if (Save.data.seenHelp) { c.classList.add('hidden'); return; }
    const touch = document.body.classList.contains('touch');
    coachStep = 1;
    $('coachText').innerHTML = touch ? 'Drag on the left to move · tap the big button to attack' : '<kbd>A</kbd> <kbd>D</kbd> move · <kbd>SPACE</kbd> jump · <kbd>LMB</kbd> attack toward the cursor';
    c.classList.remove('hidden');
    setTimeout(() => {
      if (coachStep !== 1) return;
      coachStep = 2;
      $('coachText').innerHTML = touch ? 'Use the two small buttons for your element powers' : '<kbd>Q</kbd> <kbd>E</kbd> unleash element powers · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> swap element';
      setTimeout(() => {
        if (coachStep !== 2) return;
        coachStep = 3;
        $('coachText').innerHTML = 'Knock foes off the islands for an instant ring-out!';
        setTimeout(() => { coachStep = 0; c.classList.add('hidden'); Save.data.seenHelp = true; Save.save(); }, 4200);
      }, 5200);
    }, 5600);
  }

  /* ------------------------------------------------------------ toasts */
  function toast(text, html = '') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = html + text;
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
      const l = Math.hypot(dx, dy), max = 56;
      if (l > max) { dx = dx / l * max; dy = dy / l * max; }
      knob.style.left = (ox - r.left + dx) + 'px'; knob.style.top = (oy - r.top + dy) + 'px';
      Game.setJoy(Math.abs(dx) > 10 ? clamp(dx / 44, -1, 1) : 0);
      if (dy > 42 && !dropped) { dropped = true; Game.press('drop'); }
      if (dy < 20) dropped = false;
    });
    const end = e => { if (e.pointerId !== jp) return; jp = null; joy.classList.remove('on'); Game.setJoy(0); };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);

    document.querySelectorAll('.ab').forEach(b => {
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
        // drag off an ability button to aim it manually
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
    $('btnEndless').onclick = () => { Sfx.ensure(); Sfx.click(); openPrep({ mode: 'endless' }); };
    $('homeLoadout').onclick = () => { Sfx.ensure(); Sfx.click(); const [r, s] = Save.nextStage(); openPrep({ mode: 'stage', r, s }); };
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
      Sfx.ensure(); Sfx.click();
      const k = b.dataset.open;
      if (k === 'settings') openSettings(false);
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
    Game.hooks.onBoss = e => { banner(e.ai.boss.name, 'boss'); };
    Game.hooks.onToast = (t, big) => (big ? banner(t) : toast(t));
    Game.hooks.onWave = (i, n, boss) => {
      if (boss) return;
      if (Game.mode === 'stage') { if (i > 0) banner(i === n - 1 ? 'Final Wave' : `Wave ${i + 1}`); }
    };
    Game.hooks.onKill = (e, ringout) => { if (ringout) toast('Ring out! +2'); };

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
