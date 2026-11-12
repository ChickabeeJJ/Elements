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
  function applyAccentTheme(id = Save.loadout()[0]) {
    const el = ELEMENT_BY_ID[id] || NEUTRAL;
    document.documentElement.style.setProperty('--acc', el.color);
    document.documentElement.style.setProperty('--acc-hi', `color-mix(in srgb, ${el.color} 82%, white)`);
  }
  const hex = (id, cls = '') => `<span class="hex ${cls}" style="--c:${colorOf(id)}">${elementIcon(id)}</span>`;
  const NAME = id => (ELEMENT_BY_ID[id] || NEUTRAL).name.toUpperCase();
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls = '') => `<span class="ic ${cls}" data-icon="${name}"></span>`;
  // key labels follow the player's keyboard layout (AZERTY shows Z/Q/S/D, etc.)
  const keyNames = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyQ: 'Q', KeyE: 'E', KeyP: 'P' };
  const key = code => keyNames[code] || code;
  const KEYS = ['CLICK', 'Q', 'E'];
  async function loadKeyLayout() {
    try {
      const map = await navigator.keyboard.getLayoutMap();
      for (const c of Object.keys(keyNames)) { const v = map.get(c); if (v && /^\S$/.test(v)) keyNames[c] = v.toUpperCase(); }
      KEYS[1] = key('KeyQ'); KEYS[2] = key('KeyE');
      document.querySelector('.orb-p1 kbd').textContent = KEYS[1];
      document.querySelector('.orb-p2 kbd').textContent = KEYS[2];
      document.querySelectorAll('.sk-key').forEach((k, i) => { k.textContent = KEYS[i + 1]; });
    } catch (e) { /* layout API not available: keep QWERTY labels */ }
  }
  const TIPS = [
    'Knock foes off the islands for an instant ring-out. Hurt foes fly further.',
    'Hitting an elemental weakness deals 160% damage.',
    'A "!" over an enemy means an attack is coming. Jump or dash away.',
    'Careful near edges: falling into the void ends the run.',
    'Frozen foes shatter under Stone and Ice Lance.',
    'Soak foes with Tide, then hit them with Storm.',
    'Swap elements mid-fight with 1, 2 and 3 to chain powers.',
    'Upgrades are permanent. Spend gems between stages.',
  ];

  /* ----------------------------------------------------------- screens */
  function show(name) {
    if (document.body.classList.contains('previewing')) {   // leaving mid-preview
      Game.stopPreview(); Game.hooks.onPreviewMove = null;
      document.body.classList.remove('previewing'); $('previewBar').classList.add('hidden');
    }
    current = name;
    for (const id of ['home', 'map', 'codex', 'forge', 'hub']) $(id).classList.toggle('hidden', id !== name);
    $('hud').classList.toggle('hidden', name !== null);
    document.body.classList.toggle('playing', name === null);
    if (name === 'home') { Sfx.setMusicPaused(true); refreshHome(); }
    else if (name === null) Sfx.setMusicPaused(false);
    homeShift();
    syncBanner();
    if (name) Platform.gameplayStop();   // no-op unless gameplay was on
    document.querySelectorAll('.essence-val').forEach(el => { el.textContent = fmt(Save.data.essence); });
  }

  function refreshHome() {
    applyAccentTheme();
    const [r, s] = Save.nextStage();
    const all = Object.keys(Save.data.stars).length >= TOTAL_STAGES;
    $('playSub').textContent = all ? 'ALL STAGES CLEAR' : `STAGE ${stageLabel(r, s)} · ${REALMS[r].name.toUpperCase()}`;
    $('endlessSub').textContent = 'BEST ' + Save.data.endlessBest;
    const tier = Meta.tierOf(Save.data.arena.trophies);
    $('arenaSub').textContent = tier.label;
    refreshRail();
    $('homeStars').textContent = Save.totalStars() + '/' + TOTAL_STAGES * 3;
    const cheapest = Math.min(...UPGRADES.map(u => Save.upgradeCost(u.id) ?? Infinity));
    $('homeForge').classList.toggle('hidden', !(cheapest <= Save.data.essence));
    $('homeLoadout').innerHTML = `<span class="lbl">YOUR ELEMENTS${Save.trial ? ` · <em class="trial-lbl">+ ${NAME(Save.trial)} TRIAL</em>` : ''}</span><div class="row">${(Save.trial ? [Save.trial] : []).concat(Save.loadout()).slice(0, 3).map(id => hex(id)).join('')}<button class="btn small" id="homeChange"><b>CHANGE</b></button></div>`;
    $('homeChange').onclick = () => { Sfx.ensure(); Sfx.click(); openLoadout(); };
    refreshUser();
  }

  /* -------------------------------------------------------- banner ad */
  // CrazyGames only. One 320x50 banner in a fixed spot that never moves: bottom-centre on
  // computers, top-centre on phones and tablets. It is first requested when the Stages,
  // Elements or Upgrades menu opens, then stays on every menu and pop-up (main menu,
  // loadout, Event / Quests / Ranks, settings…), is refreshed by the SDK wrapper every 30 s
  // and is cleared only when gameplay starts. While it shows, body.banner-on makes every
  // menu and pop-up keep that strip free, so it never covers the game's UI.
  const BANNER_MENUS = ['map', 'codex', 'forge'];
  function syncBanner() {
    const slot = $('cgBanner');
    const want = !!(Platform.bannersEnabled && current && (BANNER_MENUS.includes(current) || Platform.bannerActive));
    document.body.classList.toggle('banner-on', want);
    slot.classList.toggle('hidden', !want);
    if (want) Platform.showBanner('cgBanner');   // no-op while a banner already exists
    fitScreen();
  }

  // Menus that must fit the game frame without a scrollbar: if the content is a little
  // taller than the frame (small windows, banner strip), scale it down to fit.
  const FIT_SCREENS = ['map', 'forge', 'hub'];
  function fitScreen() {
    for (const id of FIT_SCREENS) {
      const el = $(id);
      el.style.setProperty('--fit', 1);
      if (id !== current) continue;
      for (let i = 0; i < 3; i++) {
        const over = el.scrollHeight - el.clientHeight;
        if (over <= 1) break;
        const k = parseFloat(el.style.getPropertyValue('--fit')) || 1;
        el.style.setProperty('--fit', Math.max(0.72, k * el.clientHeight / el.scrollHeight).toFixed(3));
      }
    }
    // the Elements detail pane: scale its content down a little rather than scroll
    const det = $('codexDetail');
    det.style.setProperty('--fit', 1);
    if (current === 'codex') for (let i = 0; i < 3; i++) {
      if (det.scrollHeight - det.clientHeight <= 1) break;
      const k = parseFloat(det.style.getPropertyValue('--fit')) || 1;
      det.style.setProperty('--fit', Math.max(0.72, k * det.clientHeight / det.scrollHeight).toFixed(3));
    }
  }

  // every rewarded-ad offer uses the same button as its alternative (same size, font and
  // colour, per CrazyGames rules), marked with a video-camera icon so it's clear an ad plays
  const adTag = () => `<span class="rw-mark" title="Watch a video">${ic('video')}</span>`;
  const adBtn = (id, label, extra = '') => `<button class="btn rw-offer${extra}" id="${id}">${adTag()}<b>${label}</b></button>`;

  // opt-in rewarded "+gems" when you are short, a few times a day
  const GEM_AD = 60, GEM_AD_CAP = 5;
  const REVIVE_GAP = 4 * 60 * 1000;   // a revive-for-an-ad is offered at most once per 4 minutes
  function gemAdsLeft() {
    const a = Save.data.ads, d = Math.floor(Date.now() / 86400000);
    if (a.day !== d) { a.day = d; a.n = 0; }
    return Math.max(0, GEM_AD_CAP - a.n);
  }
  function needGems(short, after) {
    Sfx.denied();
    if (!Platform.rewardedAvailable || gemAdsLeft() <= 0) {
      toast(Platform.adBlock ? 'REWARDED ADS UNAVAILABLE · AD BLOCKER DETECTED' : `NEED ${short} MORE GEMS`);
      return;
    }
    modal(`<h2>NEED ${short} MORE GEMS</h2>
      <p class="tip">Watch a short ad for <b>+${GEM_AD} gems</b>. ${gemAdsLeft()} left today.</p>
      <div class="actions"><button class="btn" id="gaNo"><b>NOT NOW</b></button>${adBtn('gaYes', `+${GEM_AD} GEMS`)}</div>`, sh => {
      sh.querySelector('#gaNo').onclick = () => { Sfx.click(); closeModal(); };
      const yes = sh.querySelector('#gaYes');
      yes.onclick = () => {
        Sfx.click(); yes.disabled = true;
        Platform.rewarded(ok => {
          closeModal();
          if (!ok) { toast('AD UNAVAILABLE'); return; }
          Save.data.ads.n++; Save.data.essence += GEM_AD; Save.save();
          Sfx.pickup(); toast(`+${GEM_AD} GEMS`);
          document.querySelectorAll('.essence-val').forEach(el => { el.textContent = fmt(Save.data.essence); });
          after && after();
        });
      };
    });
  }

  function refreshUser() {
    const chip = $('userChip');
    if (!Platform.accountsAvailable) { chip.classList.add('hidden'); return; }
    chip.classList.remove('hidden');
    const user = Platform.user;
    chip.innerHTML = user ? `${user.profilePictureUrl ? `<img src="${esc(user.profilePictureUrl)}" alt="">` : ''}<b>${esc(String(user.username || 'PLAYER').toUpperCase().slice(0, 16))}</b>` : '<b>LOG IN TO SAVE</b>';
    chip.onclick = user ? null : async () => { Sfx.click(); await Platform.login(); };
  }

  /* --------------------------------------------------------------- map */
  function openMap(r) {
    const [nr] = Save.nextStage();
    mapRealm = r != null ? r : nr;
    tabPage = null;
    if (r != null || !Meta.winterLive()) mapMode = 'chapters';   // a specific chapter (or no event) means the chapter view
    Game.idleScene(mapMode === 'event' ? WINTER_REALM : mapRealm);
    show('map');
    renderMap();
  }

  // chapter tabs: one row of four, with arrows that page to the next / previous four
  const TAB_PAGE = 4;
  let tabPage = null, tabSlide = '';
  function renderTabs() {
    const tabs = $('realmTabs');
    const pages = Math.ceil(REALMS.length / TAB_PAGE);
    if (tabPage == null) tabPage = Math.floor(mapRealm / TAB_PAGE);
    tabPage = Math.max(0, Math.min(pages - 1, tabPage));
    const first = tabPage * TAB_PAGE;
    const arrow = (dir, label) => `<button type="button" class="tab-arrow ${dir}" aria-label="${label}" ${dir === 'prev' ? (tabPage === 0 ? 'disabled' : '') : (tabPage === pages - 1 ? 'disabled' : '')}>${ic('back')}</button>`;
    tabs.innerHTML = `${arrow('prev', 'Previous chapters')}<div class="tab-page ${tabSlide}"></div>${arrow('next', 'Next chapters')}`;
    tabSlide = '';
    const row = tabs.querySelector('.tab-page');
    REALMS.slice(first, first + TAB_PAGE).forEach((realm, j) => {
      const i = first + j, open = Save.realmOpen(i);
      const b = document.createElement('button');
      b.className = (i === mapRealm && mapMode !== 'event' ? 'active' : '') + (open ? '' : ' locked');
      b.style.setProperty('--c', realm.tint);
      b.innerHTML = `<small>${i + 1}</small>${realm.name.toUpperCase()}${open ? '' : '<span class="ic" data-icon="lock"></span>'}`;
      b.title = realm.name;
      b.onclick = () => {
        if (!open) { Sfx.denied(); toast(`DEFEAT ${REALMS[i - 1].boss.name.toUpperCase()} FIRST`); return; }
        Sfx.click(); mapRealm = i; mapMode = 'chapters'; Game.idleScene(i); renderMap();
      };
      row.appendChild(b);
    });
    tabs.querySelector('.tab-arrow.prev').onclick = () => { Sfx.click(); tabPage--; tabSlide = 'from-left'; renderTabs(); };
    tabs.querySelector('.tab-arrow.next').onclick = () => { Sfx.click(); tabPage++; tabSlide = 'from-right'; renderTabs(); };
    Icons.hydrate(tabs);
  }

  // Winterfest: the event chapter lives under Stages while the event runs
  let mapMode = 'chapters';
  function renderMap() {
    const evBtn = $('mapEvent'), live = Meta.winterLive();
    evBtn.classList.toggle('hidden', !live);
    if (!live) mapMode = 'chapters';
    evBtn.classList.toggle('on', mapMode === 'event');
    evBtn.onclick = () => { Sfx.click(); mapMode = mapMode === 'event' ? 'chapters' : 'event'; Game.idleScene(mapMode === 'event' ? WINTER_REALM : mapRealm); renderMap(); };
    if (mapMode === 'event') { renderWinterMap(); return; }
    if (tabPage != null && Math.floor(mapRealm / TAB_PAGE) !== tabPage && !$('realmTabs').contains(document.activeElement)) tabPage = null;
    renderTabs();
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
    grid.classList.remove('winter');
    grid.classList.toggle('nine', mapRealm === 0);
    if (mapRealm === 0) {
      // stage 0: the tutorial the first time, afterwards a sandbox to try elements on a dummy
      const done = Save.data.tutorialDone;
      const z = document.createElement('button');
      z.className = 'stage-card zero';
      z.style.setProperty('--c', realm.tint);
      z.innerHTML = `<span class="n">0</span><span class="ic zero-ic" data-icon="${done ? 'target' : 'book'}"></span><small>${done ? 'TESTING' : 'TUTORIAL'}</small>`;
      z.onclick = () => { Sfx.click(); done ? startTesting() : startTutorial(); };
      grid.appendChild(z);
    }
    for (let s = 0; s < STAGES_PER_REALM; s++) {
      const open = Save.stageOpen(mapRealm, s);
      const st = Save.data.stars[stageKey(mapRealm, s)] || 0;
      const boss = s === STAGES_PER_REALM - 1;
      const unlock = elementUnlockedBy(mapRealm, s);
      const cur = mapRealm === nr && s === ns && !st;
      const el = document.createElement('button');
      if (boss) el.title = realm.boss.name;
      el.className = 'stage-card' + (boss ? ' boss' : '') + (!open ? ' locked' : cur ? ' current' : '');
      if (stageTwist(mapRealm, s) !== 'none') el.classList.add('has-twist');
      el.style.setProperty('--c', realm.tint);
      el.innerHTML = `<span class="n">${open ? (boss ? '<span class="ic" data-icon="crown"></span>' : s + 1) : '<span class="ic" data-icon="lock"></span>'}</span>
        <span class="stars">${[1, 2, 3].map(k => `<span class="ic${k <= st ? ' on' : ''}" data-icon="star"></span>`).join('')}</span>
        <small>${boss ? 'BOSS' : '<span class="st-word">STAGE </span>' + stageLabel(mapRealm, s)}</small>
        ${unlock && !st ? `<span class="reward" title="Unlocks ${unlock.name}">${hex(unlock.id)}</span>` : ''}
        ${twistBadge(stageTwist(mapRealm, s))}`;
      el.onclick = () => {
        if (!open) { Sfx.denied(); toast('CLEAR THE PREVIOUS STAGE FIRST'); return; }
        Sfx.click(); const r = mapRealm; Platform.maybeMidgame(() => startStage(r, s));
      };
      grid.appendChild(el);
    }
    Icons.hydrate($('realmHead')); Icons.hydrate(grid);
    fitScreen();
  }

  /* ------------------------------------------------------- Winterfest */
  function hatThumb(id, size = 34) { return `<canvas class="hat-thumb" data-hat="${id}" width="${size}" height="${size}"></canvas>`; }
  function drawHatThumbs(root) {
    root.querySelectorAll('canvas[data-hat]').forEach(cv => {
      const n = +cv.getAttribute('width'), dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = n * dpr; cv.height = n * dpr; cv.style.width = cv.style.height = n + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sc = n / 52;   // frame the head and hat: the head sits ~100 units above the feet
      Cosmetics.drawMannequin(g, n / 2 - 1, n * 0.66 + 100 * sc, sc, Cosmetics.colour().id, cv.dataset.hat, 0);
    });
  }
  function renderWinterMap() {
    renderTabs();
    const ev = Meta.liveEvent();
    const cleared = WINTER_STAGES.filter(w => winterStars(w.i) > 0).length, stars = WINTER_STAGES.reduce((t, w) => t + winterStars(w.i), 0);
    $('realmHead').innerHTML = `<h3 class="wf-title">${ic('snow')}WINTERFEST</h3>
      <span class="tag"><i class="live-dot"></i>ENDS IN ${until(ev.end)}</span>
      <span class="tag">${ic('check')} ${cleared}/${WINTER_COUNT} CLEARED</span>
      <span class="tag"><span class="ic star" data-icon="star"></span> ${stars}/${WINTER_COUNT * 3}</span>`;
    const grid = $('stageGrid');
    grid.innerHTML = '';
    grid.classList.remove('nine'); grid.classList.add('winter');
    const firstOpen = WINTER_STAGES.find(w => !winterStars(w.i));
    for (const w of WINTER_STAGES) {
      const open = winterOpen(w.i), st = winterStars(w.i), M = WINTER_MODES[w.mode], hat = WINTER_MILESTONES[w.i];
      const el = document.createElement('button');
      el.className = 'stage-card wf' + (w.mode === 'boss' ? ' boss' : '') + (!open ? ' locked' : firstOpen === w ? ' current' : '') + (hat ? ' milestone' : '');
      el.style.setProperty('--c', w.mode === 'gifts' ? '#ffd34d' : w.mode === 'snowman' ? '#7fe0ff' : w.mode === 'boss' ? '#ff6b7d' : '#c9f2ff');
      const tw = TWISTS[w.twist];
      el.title = `${M.name}: ${M.goal(w.n)}${w.twist !== 'none' ? ' · ' + tw.name : ''}`;
      el.innerHTML = `<span class="n">${open ? (w.mode === 'boss' ? ic('crown') : w.i + 1) : ic('lock')}</span>
        <span class="stars">${[1, 2, 3].map(k => `<span class="ic${k <= st ? ' on' : ''}" data-icon="star"></span>`).join('')}</span>
        <span class="wf-mode">${ic(M.icon)}<b>${M.name.toUpperCase()}</b></span>
        ${hat ? `<span class="wf-hat${Cosmetics.ownsHat(hat) ? ' got' : ''}" title="Clear it to win the ${HAT_BY_ID[hat].name}">${hatThumb(hat, 30)}</span>` : ''}
        ${w.i === 0 && !Save.data.winter.tutDone ? '<span class="wf-new">HOW-TO</span>' : ''}
        ${w.twist !== 'none' ? `<span class="wf-tw" title="${tw.name}: ${tw.desc}">${ic(tw.icon)}</span>` : ''}`;
      el.onclick = () => {
        if (!open) { Sfx.denied(); toast('CLEAR THE PREVIOUS STAGE FIRST'); return; }
        Sfx.click(); Platform.maybeMidgame(() => startWinter(w.i));
      };
      grid.appendChild(el);
    }
    Icons.hydrate($('realmHead')); Icons.hydrate(grid); drawHatThumbs(grid);
    fitScreen();
  }
  function startWinter(i) {
    if (!Meta.winterLive()) { toast('WINTERFEST HAS ENDED'); return; }
    const tutorial = i === 0 && !Save.data.winter.tutDone;
    lastStart = { mode: 'event', i };
    closeModal(); show(null);
    Game.start({ mode: 'event', i, tutorial });
    hudCache = {};
    buildHud();
    const w = WINTER_STAGES[i], M = WINTER_MODES[w.mode];
    setChip('frost', `WINTERFEST ${winterLabel(i)}`);
    if (tutorial) return;
    banner(w.mode === 'boss' ? 'BOSS STAGE' : M.name.toUpperCase(), w.mode === 'boss' ? 'boss' : '');
    setTimeout(() => { if (Game.state === 'play') toast(M.goal(w.n).toUpperCase()); }, 1100);
    if (w.twist !== 'none') setTimeout(() => { if (Game.state === 'play') toast(`${TWISTS[w.twist].name.toUpperCase()} · ${TWISTS[w.twist].desc}`); }, 3000);
  }
  // the first-time how-to: cards between its three short parts (the game pauses on each)
  const WF_CARDS = {
    welcome: { icon: 'snow', title: 'WELCOME TO WINTERFEST', text: 'Winterfest is here all December, with its own 20-stage chapter and new game modes. Each stage shows its goal at the top of the screen.',
      extra: () => `<div class="wf-modes">${['gifts', 'snowman', 'brawl', 'boss'].map(m => `<div>${ic(WINTER_MODES[m].icon)}<b>${WINTER_MODES[m].name.toUpperCase()}</b></div>`).join('')}</div><p class="wf-next">First up: <b>Gift Rush</b>. Grab the 3 glowing presents.</p>`, btn: 'GRAB THE PRESENTS' },
    snowman: { icon: 'snowman', title: 'SNOWMAN DEFENCE', text: 'Kramplings march on the snowman to smash it. Knock them away and keep it standing until the timer runs out. If it falls, the stage is lost.', btn: 'DEFEND IT' },
    rewards: { icon: 'gift', title: 'EXCLUSIVE REWARDS', text: 'Clear stages 5, 10, 15 and 20 to win exclusive hats. Daily Winterfest quests pay Snowflakes: trade them in the Event tab for exclusive colours and the Pom Beanie. Everything you earn is yours to keep.',
      extra: () => `<div class="wf-prizes">${Object.values(WINTER_MILESTONES).map(h => hatThumb(h, 46)).join('')}${COLOURS.filter(c => c.event).map(c => `<span class="sw" style="--c:${c.body}"></span>`).join('')}</div>`, btn: 'START WINTERFEST' },
  };
  function eventCard(key, go) {
    const C = WF_CARDS[key];
    modal(`<div class="wf-card-ic">${ic(C.icon)}</div><h2>${C.title}</h2><p class="tip">${C.text}</p>${C.extra ? C.extra() : ''}
      <div class="actions"><button class="btn primary" id="wfGo"><b>${C.btn}</b></button></div>`, sh => {
      drawHatThumbs(sh);
      sh.querySelector('#wfGo').onclick = () => { Sfx.click(); closeModal(); go(); if (key === 'welcome') toast('GRAB THE 3 PRESENTS'); };
    }, 'wf-card');
  }

  /* --------------------------------------------------- element browser */
  // Shared by the Elements screen and the loadout picker. Built to stay readable with
  // any number of elements: a search box, filter chips with live counts, an A-Z sort and
  // a dense auto-filling grid of tiles that scrolls on its own while the rest stays put.
  const SHOWS = [['all', 'ALL'], ['owned', 'OWNED'], ['locked', 'LOCKED'], ['event', 'EVENT']];
  const TYPES = [['all', 'ANY'], ['melee', 'MELEE'], ['ranged', 'RANGED']];
  const mainType = e => (e.moves[0].type === 'melee' ? 'melee' : 'ranged');
  function elMatch(e, f, skipShow) {
    const open = Save.elementOpen(e.id);
    if (!skipShow && ((f.show === 'owned' && !open) || (f.show === 'locked' && open) || (f.show === 'event' && !e.event))) return false;
    if (f.type !== 'all' && mainType(e) !== f.type) return false;
    const q = f.q.trim().toLowerCase();
    if (q && !(e.name.toLowerCase().includes(q) || e.moves.some(m => m.name.toLowerCase().includes(q)))) return false;
    return true;
  }
  function elList(f) {
    const list = ELEMENTS.filter(e => elMatch(e, f));
    if (f.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }
  function chipsHtml(f) {
    const pool = ELEMENTS.filter(e => elMatch(e, f, true));
    const n = { all: pool.length, owned: pool.filter(e => Save.elementOpen(e.id)).length, event: pool.filter(e => e.event).length };
    n.locked = n.all - n.owned;
    return `<div class="chips show" role="group" aria-label="Show">${SHOWS.map(([k, l]) => `<button type="button" class="chip${f.show === k ? ' on' : ''}" data-show="${k}" aria-pressed="${f.show === k}">${l}<i>${n[k]}</i></button>`).join('')}</div>
      <div class="chips tail"><button type="button" class="chip${f.type !== 'all' ? ' on' : ''}" data-type title="Main attack: tap to cycle">${ic(f.type === 'melee' ? 'fist' : f.type === 'ranged' ? 'fireball' : 'swirl')}${TYPES.find(t => t[0] === f.type)[1]}</button><button type="button" class="chip" data-sort title="Sort order: tap to switch">${ic('ranks')}${f.sort === 'name' ? 'A–Z' : 'PRICE'}</button></div>`;
  }
  function mountTools(root, f, onChange) {
    root.innerHTML = `<label class="search">${ic('search')}<input type="search" placeholder="Search elements or moves" value="${esc(f.q)}" autocomplete="off" spellcheck="false" maxlength="24" aria-label="Search elements"><button type="button" class="clear${f.q ? '' : ' hidden'}" aria-label="Clear search">${ic('close')}</button></label><div class="tool-chips"></div>`;
    const inp = root.querySelector('input'), clr = root.querySelector('.clear'), chips = root.querySelector('.tool-chips');
    const drawChips = () => {
      chips.innerHTML = chipsHtml(f);
      Icons.hydrate(chips);
      chips.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { Sfx.click(); f.show = b.dataset.show; update(); });
      chips.querySelector('[data-type]').onclick = () => { Sfx.click(); f.type = TYPES[(TYPES.findIndex(t => t[0] === f.type) + 1) % TYPES.length][0]; update(); };
      chips.querySelector('[data-sort]').onclick = () => { Sfx.click(); f.sort = f.sort === 'name' ? 'price' : 'name'; update(); };
    };
    const update = () => { clr.classList.toggle('hidden', !f.q); drawChips(); onChange(); };
    inp.oninput = () => { f.q = inp.value; update(); };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape' && f.q) { e.preventDefault(); inp.value = ''; f.q = ''; update(); } };
    clr.onclick = () => { Sfx.click(); inp.value = ''; f.q = ''; update(); inp.focus(); };
    Icons.hydrate(root);
    drawChips();
  }
  function tileHtml(e, { on = false, slot = 0 } = {}) {
    const open = Save.elementOpen(e.id);
    const cost = open ? '' : e.event
      ? `<i class="et-cost ev">${ic('token')}${e.tokenPrice}</i>`
      : `<i class="et-cost">${ic('gem', 'gem')}${fmt(e.price)}</i>`;
    return `<button type="button" class="et${on ? ' on' : ''}${open ? '' : ' locked'}${e.event ? ' event' : ''}" data-el="${e.id}" style="--c:${e.color}" title="${e.name}" aria-label="${e.name}${open ? '' : ', locked'}${slot ? ', equipped in slot ' + slot : ''}">
      ${hex(e.id, open ? '' : 'locked')}<b>${e.name.toUpperCase()}</b>${cost}${slot ? `<i class="et-slot">${slot}</i>` : ''}${open ? '' : `<span class="et-lock">${ic('lock')}</span>`}${e.event ? '<i class="et-ev" aria-hidden="true"></i>' : ''}</button>`;
  }
  const emptyHtml = f => `<div class="et-empty">${ic('search')}<b>NO MATCHES</b><small>${f.q ? `Nothing called "${esc(f.q)}"` : 'Nothing fits these filters'}</small></div>`;

  /* ---------------------------------------------------- loadout editor */
  const loFilter = { q: '', show: 'all', type: 'all', sort: 'price' };
  function openLoadout(after, back) {
    let sel = Save.loadout().slice();
    const inFight = Game.state === 'play';
    applyAccentTheme(sel[0]);
    modal(`
      <div class="lo-head">
        <button type="button" class="round sheet-back" id="loBack" aria-label="Back">${ic('back')}</button>
        <h2>YOUR ELEMENTS</h2>
        <div class="lo-slots" id="loSlots"></div>
      </div>
      <div class="el-tools compact" id="loTools"></div>
      <div class="el-grid lo-grid" id="loGrid"></div>
      <div class="lo-foot"><button class="btn primary" id="loDone"><b>DONE</b></button></div>`, sh => {
      const slots = sh.querySelector('#loSlots'), grid = sh.querySelector('#loGrid');
      const drawSlots = () => {
        slots.innerHTML = [0, 1, 2].map(i => `<button type="button" class="lo-slot" data-slot="${i}" aria-label="${sel[i] ? `Remove ${NAME(sel[i])} from slot ${i + 1}` : `Slot ${i + 1} empty`}" ${sel[i] ? '' : 'disabled'}>${sel[i] ? hex(sel[i]) : '<span class="empty"></span>'}<small>${sel[i] ? `${i + 1} · ${NAME(sel[i])}` : `${i + 1} · EMPTY`}</small></button>`).join('');
        Icons.hydrate(slots);
        slots.querySelectorAll('.lo-slot:not(:disabled)').forEach(slot => slot.onclick = () => {
          Sfx.click();
          sel.splice(Number(slot.dataset.slot), 1);
          refresh();
        });
      };
      const drawGrid = () => {
        const list = elList(loFilter);
        const own = list.filter(e => Save.elementOpen(e.id)), locked = list.filter(e => !Save.elementOpen(e.id));
        grid.innerHTML = !list.length ? emptyHtml(loFilter)
          : own.map(e => tileHtml(e, { on: sel.includes(e.id), slot: sel.indexOf(e.id) + 1 })).join('')
            + (locked.length ? `<div class="et-divider"><span>${ic('lock')}LOCKED · ${locked.length}</span><small>${inFight ? 'Unlock them from the Elements menu' : 'Tap one to see how to unlock it'}</small></div>${locked.map(e => tileHtml(e)).join('')}` : '');
        Icons.hydrate(grid);
        grid.querySelectorAll('.et').forEach(b => b.onclick = () => {
          const id = b.dataset.el;
          if (!Save.elementOpen(id)) {
            if (inFight) { Sfx.denied(); toast('UNLOCK IT FROM THE ELEMENTS MENU'); return; }
            Sfx.click(); closeModal(); codexSel = id; openCodex(); return;
          }
          Sfx.click();
          if (sel.includes(id)) sel = sel.filter(x => x !== id);
          else if (sel.length < 3) sel.push(id);
          else { sel.shift(); sel.push(id); }
          refresh();
        });
      };
      // nothing equipped: DONE greys out, and only explains itself when pressed
      const refresh = () => { applyAccentTheme(sel[0]); drawSlots(); drawGrid(); sh.querySelector('#loDone').classList.toggle('is-off', !sel.length); };
      mountTools(sh.querySelector('#loTools'), loFilter, drawGrid);
      refresh();
      nudgeScroll(grid, 'y');
      // the back arrow saves like DONE, but with nothing equipped it discards the edits
      sh.querySelector('#loBack').onclick = () => {
        if (sel.length) { sh.querySelector('#loDone').click(); return; }
        Sfx.click(); applyAccentTheme();
        toast('CHANGES DISCARDED');
        back ? back() : (after ? after() : closeModal());
      };
      sh.querySelector('#loDone').onclick = () => {
        if (!sel.length) { Sfx.denied(); toast('EQUIP AT LEAST ONE ELEMENT'); return; }
        Sfx.click(); Save.setLoadout(sel);
        applyAccentTheme();
        if (current === 'home') refreshHome();
        if (current === 'codex') renderCodex();
        after ? after() : closeModal();
      };
    }, 'wide loadout');
  }

  /* -------------------------------------------------------------- codex */
  const cxFilter = { q: '', show: 'all', type: 'all', sort: 'price' };
  function openCodex(tab) {
    show('codex');
    mountTools($('codexTools'), cxFilter, renderCodexList);
    renderCodex();
    setShopTab(tab || 'elements');
    const on = $('codexList').querySelector('.et.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
    nudgeScroll($('codexList'), 'y');
  }

  /* --------------------------------------------------------------- shop */
  // the Shop: Elements (the element browser above) plus Items, Accessories and Colours
  let shopTab = 'elements';
  const shopSel = { items: ITEMS[0].id, hats: HATS[0].id, colours: 'snow' };
  function setShopTab(t) {
    shopTab = t;
    $('shopTabs').querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.shop === t);
      b.onclick = () => { if (shopTab !== b.dataset.shop) { Sfx.click(); setShopTab(b.dataset.shop); } };
    });
    Icons.hydrate($('shopTabs'));
    const els = t === 'elements';
    $('codex').querySelector('.codex').classList.toggle('hidden', !els);
    $('shopPane').classList.toggle('hidden', els);
    $('codexCountPill').classList.toggle('hidden', !els);
    if (!els) renderShop();
    fitScreen();
  }
  const tokIc = () => ic('snow', 'tok');
  function shopStatus(kind, def) {
    const owned = kind === 'hat' ? Cosmetics.ownsHat(def.id) : Cosmetics.ownsColour(def.id);
    const worn = kind === 'hat' ? Cosmetics.hat() === def.id : Cosmetics.colour().id === def.id;
    if (worn) return `<span class="sh-st worn">${ic('check')}WORN</span>`;
    if (owned) return '<span class="sh-st owned">OWNED</span>';
    if (def.event) return `<span class="sh-st ev">${tokIc()}${def.tokens ? def.tokens : 'EVENT'}</span>`;
    return `<span class="sh-st price${Save.data.essence >= def.price ? ' can' : ''}">${ic('gem', 'gem')}${def.price}</span>`;
  }
  function renderShop() {
    const grid = $('shopGrid');
    if (shopTab === 'items') {
      const armed = Cosmetics.armed();
      grid.className = 'shop-grid items';
      grid.innerHTML = ITEMS.map(it => `<button type="button" class="sh-card item${shopSel.items === it.id ? ' on' : ''}${armed.includes(it.id) ? ' armed' : ''}" data-id="${it.id}" style="--c:${it.color}">
        <span class="sh-item-ic">${ic(it.icon)}</span><b>${it.name.toUpperCase()}</b>
        <span class="sh-count">×${Cosmetics.count(it.id)}</span>${armed.includes(it.id) ? '<span class="sh-armed">ARMED</span>' : ''}
        <span class="sh-st price${Save.data.essence >= it.price ? ' can' : ''}">${ic('gem', 'gem')}${it.price}</span></button>`).join('');
    } else {
      const kind = shopTab === 'hats' ? 'hat' : 'colour', list = shopTab === 'hats' ? HATS : COLOURS;
      grid.className = 'shop-grid ' + shopTab;
      grid.innerHTML = (kind === 'hat' ? [`<button type="button" class="sh-card none${!Cosmetics.hat() ? ' worn-c' : ''}${shopSel.hats === null ? ' on' : ''}" data-id=""><canvas class="sh-thumb" data-thumb="hat:"></canvas><b>NONE</b>${!Cosmetics.hat() ? `<span class="sh-st worn">${ic('check')}WORN</span>` : '<span class="sh-st owned">TAKE OFF</span>'}</button>`] : []).concat(list.map(d => `<button type="button" class="sh-card${(shopTab === 'hats' ? shopSel.hats : shopSel.colours) === d.id ? ' on' : ''}${d.event ? ' event' : ''}" data-id="${d.id}">
        ${d.event ? `<span class="sh-flag">${ic('snow')}</span>` : ''}<canvas class="sh-thumb" data-thumb="${kind}:${d.id}"></canvas><b>${d.name.toUpperCase()}</b>${shopStatus(kind, d)}</button>`)).join('');
      // static thumbnails: the hero wearing it (hats on the current colour, colours with the current hat)
      grid.querySelectorAll('canvas[data-thumb]').forEach(cv => {
        const [k, id] = cv.dataset.thumb.split(':');
        const dpr = Math.min(2, window.devicePixelRatio || 1), w = 76, h = 76;
        cv.width = w * dpr; cv.height = h * dpr;
        const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (k === 'hat') Cosmetics.drawMannequin(g, w / 2 - 2, h * 1.55, 0.78, Cosmetics.colour().id, id || null, 0);
        else Cosmetics.drawMannequin(g, w / 2 - 2, h * 0.98, 0.5, id, Cosmetics.hat(), 0);
      });
    }
    Icons.hydrate(grid);
    grid.querySelectorAll('.sh-card').forEach(b => b.onclick = () => {
      Sfx.click();
      const id = b.dataset.id || null;
      shopSel[shopTab] = id;
      grid.querySelectorAll('.sh-card.on').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      renderShopDetail();
    });
    renderShopDetail();
    document.querySelectorAll('.essence-val').forEach(el => { el.textContent = fmt(Save.data.essence); });
  }
  function renderShopDetail() {
    const det = $('shopDetail');
    if (shopTab === 'items') {
      const it = ITEM_BY_ID[shopSel.items], n = Cosmetics.count(it.id), armed = Cosmetics.armed();
      const isArmed = armed.includes(it.id);
      det.innerHTML = `<div class="sd-item" style="--c:${it.color}"><span class="sh-item-ic big">${ic(it.icon)}</span></div>
        <div class="sd-body"><small class="kicker">ONE-RUN BOOST</small><h3>${it.name.toUpperCase()}</h3><p>${it.desc}.</p>
          <div class="sd-own">YOU HAVE <b>${n}</b></div>
          <div class="sd-btns">
            <button class="btn${Save.data.essence >= it.price ? ' primary' : ''}" id="sdBuy">${ic('gem')}<b>BUY · ${it.price}</b></button>
            <button class="btn${isArmed ? ' primary' : ''}" id="sdArm" ${!n && !isArmed ? 'disabled' : ''}><b>${isArmed ? 'ARMED · TAP TO DISARM' : 'ARM FOR NEXT RUN'}</b></button>
          </div>
          <div class="sd-slots"><small>ARMED FOR YOUR NEXT RUN (${armed.length}/${ITEM_ARM_MAX})</small><div>${[0, 1].map(k => armed[k] ? `<span class="slot" style="--c:${ITEM_BY_ID[armed[k]].color}">${ic(ITEM_BY_ID[armed[k]].icon)}${ITEM_BY_ID[armed[k]].name.toUpperCase()}</span>` : '<span class="slot empty">EMPTY</span>').join('')}</div>
          <p class="fine">Armed items are used up when your next stage, Endless run or Winterfest stage starts. They are never used in the Arena.</p></div>
        </div>`;
      Icons.hydrate(det);
      det.querySelector('#sdBuy').onclick = () => {
        if (Cosmetics.buyItem(it.id)) { Sfx.pickup(); toast(`${it.name.toUpperCase()} +1`); renderShop(); }
        else needGems(it.price - Save.data.essence, () => renderShop());
      };
      det.querySelector('#sdArm').onclick = () => {
        if (Cosmetics.toggleArm(it.id)) { Sfx.click(); renderShop(); }
        else { Sfx.denied(); toast(n ? `ONLY ${ITEM_ARM_MAX} ITEMS CAN BE ARMED` : 'BUY ONE FIRST'); }
      };
      return;
    }
    const kind = shopTab === 'hats' ? 'hat' : 'colour';
    const id = shopTab === 'hats' ? shopSel.hats : shopSel.colours;
    const def = id ? (kind === 'hat' ? HAT_BY_ID[id] : COLOUR_BY_ID[id]) : null;
    const owned = !def || (kind === 'hat' ? Cosmetics.ownsHat(id) : Cosmetics.ownsColour(id));
    const worn = kind === 'hat' ? Cosmetics.hat() === id : Cosmetics.colour().id === id;
    const evLive = Meta.winterLive();
    let btns = '';
    if (!def) btns = `<button class="btn${Cosmetics.hat() ? ' primary' : ''}" id="sdEquip" ${Cosmetics.hat() ? '' : 'disabled'}><b>${Cosmetics.hat() ? 'TAKE OFF YOUR HAT' : 'NOTHING WORN'}</b></button>`;
    else if (owned) btns = worn ? (kind === 'hat' ? '<button class="btn" id="sdUnequip"><b>TAKE OFF</b></button>' : '<button class="btn" disabled><b>WORN</b></button>') : '<button class="btn primary" id="sdEquip"><b>WEAR IT</b></button>';
    else if (def.event) btns = evLive ? `<button class="btn primary" id="sdEvent">${ic('snow')}<b>GO TO WINTERFEST</b></button>` : '<button class="btn" disabled><b>RETURNS IN DECEMBER</b></button>';
    else btns = `<button class="btn${Save.data.essence >= def.price ? ' primary' : ''}" id="sdBuy">${ic('gem')}<b>BUY · ${def.price}</b></button>`;
    const how = def && def.event ? (def.how ? def.how + '.' : `Trade ${def.tokens} Snowflakes in the Winterfest token shop.`) : '';
    det.innerHTML = `<div class="sd-preview"><canvas id="sdCanvas"></canvas></div>
      <div class="sd-body">
        <small class="kicker">${def && def.event ? `${ic('snow')}WINTERFEST EXCLUSIVE` : kind === 'hat' ? 'ACCESSORY' : 'CHARACTER COLOUR'}</small>
        <h3>${def ? def.name.toUpperCase() : 'NO HAT'}</h3>
        <p>${def && def.event ? `Exclusive to Winterfest (every December). ${how}` : kind === 'hat' ? (def ? 'Worn on your hero in every fight.' : 'Go bare-headed: just your element band.') : 'Your hero\'s body colour in every fight.'}</p>
        <div class="sd-btns">${btns}</div>
      </div>`;
    Icons.hydrate(det);
    const look = () => ({ colour: kind === 'colour' && def ? def.id : Cosmetics.colour().id, hat: kind === 'hat' ? id : Cosmetics.hat(), accent: (ELEMENT_BY_ID[Save.loadout()[0]] || NEUTRAL).color });
    Cosmetics.liveMannequin(det.querySelector('#sdCanvas'), look);
    const on = (sel, fn) => { const b = det.querySelector(sel); if (b) b.onclick = fn; };
    on('#sdBuy', () => {
      if (Cosmetics.buy(kind, id)) { Sfx.unlock(); Cosmetics.equip(kind, id); toast(`${def.name.toUpperCase()} · YOURS`); renderShop(); }
      else needGems(def.price - Save.data.essence, () => renderShop());
    });
    on('#sdEquip', () => { Sfx.click(); Cosmetics.equip(kind, def ? id : null); renderShop(); });
    on('#sdUnequip', () => { Sfx.click(); Cosmetics.equip('hat', null); renderShop(); });
    on('#sdEvent', () => { Sfx.click(); openHub('event'); });
  }
  function renderCodex() { renderCodexList(); renderCodexDetail(); }
  function renderCodexList() {
    const list = $('codexList');
    const els = elList(cxFilter), lo = Save.loadout();
    list.innerHTML = els.length ? els.map(e => tileHtml(e, { on: e.id === codexSel, slot: lo.indexOf(e.id) + 1 })).join('') : emptyHtml(cxFilter);
    Icons.hydrate(list);
    list.querySelectorAll('.et').forEach(b => b.onclick = () => {
      Sfx.click(); codexSel = b.dataset.el;
      list.querySelectorAll('.et.on').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      renderCodexDetail();
      // stacked layout: bring the details into view
      if (getComputedStyle($('codex').querySelector('.codex')).gridTemplateColumns.split(' ').length < 2) $('codexDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('codexCount').textContent = Save.unlockedElements().length + '/' + ELEMENTS.length;
  }
  // Locked element: watch one ad to try it for the next stage, Arena match or Endless run.
  // One trial at a time and a few a day; the button is simply absent otherwise (or with an ad blocker).
  function trialBtn(e) {
    if (Save.trial === e.id) return '<button class="btn small primary" disabled><b>TRIAL READY</b></button>';
    if (!Platform.rewardedAvailable || Save.trial || Save.trialsLeft() <= 0) return '';
    return `<button class="btn small primary rw-offer" id="tryEl">${adTag()}<b>TRY ONCE</b></button>`;
  }
  function renderCodexDetail() {
    const e = ELEMENT_BY_ID[codexSel] || ELEMENTS[0];
    const open = Save.elementOpen(e.id);
    const lo = Save.loadout(), slot = lo.indexOf(e.id) + 1;
    if (open) Game.setPreviewElement(e.id);
    const det = $('codexDetail');
    det.style.setProperty('--c', e.color);
    let unlock = '';
    if (!open && e.event) {
      const ev = Meta.elementEvent(e.id);
      unlock = `<div class="buy-row ev" style="--ec:${ev ? ev.color : e.color}">${ic('token')}<p>${!ev ? 'Exclusive to an event.'
        : ev.live ? `Exclusive to the <b>${ev.name}</b> event, live for <b data-until="${ev.end}">${Meta.fmtLeft(ev.end - Date.now())}</b>. Earn tokens from event quests and Arena matches.`
        : ev.upcoming ? `Exclusive to the <b>${ev.name}</b> event, which starts in <b data-until="${ev.start}">${Meta.fmtLeft(ev.start - Date.now())}</b>.`
        : `Exclusive to the <b>${ev.name}</b> event, which has ended.`}</p>${ev && ev.live ? '<button class="btn primary" id="goEvent"><b>GO TO EVENT</b></button>' : ''}</div>`;
    } else if (!open) {
      unlock = `<div class="buy-row"><p>Unlock ${e.name} with gems from battles, pickups and stage clears.</p><button class="btn${Save.data.essence >= e.price ? ' primary' : ''}" id="buyEl">${ic('gem')}<b>UNLOCK · ${e.price}</b></button></div>`;
    }
    const tags = [mainType(e) === 'melee' ? '<span class="melee">MELEE</span>' : '<span class="ranged">RANGED</span>', e.event ? '<span class="evt">EVENT EXCLUSIVE</span>' : '', slot ? `<span class="eq">EQUIPPED · SLOT ${slot}</span>` : ''].join('');
    det.innerHTML = `
      <div class="cd-head">${hex(e.id, open ? '' : 'locked')}<div class="cd-title"><h3>${e.name.toUpperCase()}</h3><div class="cd-tags">${tags}</div><p>${e.blurb}</p></div>
        <div class="cd-btns"><button class="btn small preview-btn" id="previewEl">${ic('play')}<b>PREVIEW</b></button>${open ? `<button class="btn small${slot ? '' : ' primary'}" id="equipEl"><b>${slot ? 'UNEQUIP' : 'EQUIP'}</b></button>` : trialBtn(e)}</div></div>
      ${unlock}
      <div class="moves">${e.moves.map((mv, i) => `
        <div class="move"${open ? '' : ' style="opacity:.55"'}>
          <div class="move-top"><span class="move-ic" style="--c:${e.color};--d:${e.deep}">${ic(mv.icon)}</span>
            <div><h4>${mv.name.toUpperCase()}</h4><div class="tags"><span>${i === 0 ? 'MAIN' : 'POWER ' + i}</span>${mv.type === 'melee' ? '<span class="melee">MELEE</span>' : mv.type === 'ranged' ? '<span class="ranged">RANGED</span>' : ''}</div></div></div>
          <p>${mv.desc}</p>
          <div class="meta">${mv.dmg ? `<span>${mv.dmg}${mv.count ? '×' + mv.count : ''} DMG</span>` : ''}<span>${mv.cd}S</span><kbd>${KEYS[i]}</kbd></div>
        </div>`).join('')}</div>
      ${(() => {
        const mine = COMBOS.filter(cb => cb.b === e.id || cb.a.includes(e.id));
        if (!mine.length) return '';
        return `<div class="combos"><h4>COMBOS · ${mine.length}</h4><div class="combo-grid">${mine.map(cb => `
          <div class="combo-card">
            <div class="pair">${(cb.b === e.id ? cb.a.filter(id => ELEMENT_BY_ID[id]).slice(0, 3) : [e.id]).map(id => hex(id)).join('<span class="or">/</span>')}<span class="plus">+</span>${hex(cb.b)}</div>
            <div><b>${cb.name.toUpperCase()}</b><p>${cb.desc}</p></div>
          </div>`).join('')}</div></div>`;
      })()}`;
    Icons.hydrate(det);
    requestAnimationFrame(fitScreen);
    det.scrollTop = 0;
    det.querySelector('#previewEl').onclick = () => { Sfx.click(); previewFrom = 'codex'; openPreview(e); };
    const eq = det.querySelector('#equipEl');
    if (eq) eq.onclick = () => {
      let l = Save.loadout();
      if (l.includes(e.id)) {
        if (l.length <= 1) { Sfx.denied(); toast('KEEP AT LEAST ONE ELEMENT EQUIPPED'); return; }
        l = l.filter(x => x !== e.id);
      } else { if (l.length >= 3) l.shift(); l.push(e.id); }
      Sfx.click(); Save.setLoadout(l); applyAccentTheme(); renderCodex();
      toast(l.includes(e.id) ? `${e.name.toUpperCase()} EQUIPPED` : `${e.name.toUpperCase()} UNEQUIPPED`);
    };
    const tr = det.querySelector('#tryEl');
    if (tr) tr.onclick = () => { Sfx.click(); tr.disabled = true; Platform.rewarded(ok => {
      if (ok) { Save.setTrial(e.id); Sfx.unlock(); toast(`${e.name.toUpperCase()} TRIAL READY · NEXT STAGE, ARENA MATCH OR ENDLESS RUN`); renderCodex(); }
      else { tr.disabled = false; toast('AD UNAVAILABLE'); }
    }); };
    const go = det.querySelector('#goEvent');
    if (go) go.onclick = () => { Sfx.click(); openHub('event'); };
    const buy = det.querySelector('#buyEl');
    if (buy) buy.onclick = () => {
      if (Save.buyElement(e.id)) {
        Sfx.unlock(); ;
        const l = Save.loadout(); if (l.length < 3 && !l.includes(e.id)) Save.setLoadout(l.concat(e.id));
        toast(`${e.name.toUpperCase()} UNLOCKED!`);
        show('codex'); renderCodex();
      } else needGems(e.price - Save.data.essence, () => renderCodexDetail());
    };
  }

  /* ------------------------------------------------------------ preview */
  // watch an element's whole kit in action before buying or equipping it
  let previewFrom = 'codex';
  function openPreview(e) {
    if (current !== 'hub') previewFrom = 'codex';
    const bar = $('previewBar');
    bar.style.setProperty('--c', e.color);
    bar.innerHTML = `<div class="pv-head">${hex(e.id)}<div><small>PREVIEW</small><b>${e.name.toUpperCase()}</b></div></div>
      <div class="pv-moves">${e.moves.map((mv, i) => `<div class="pv-move" data-i="${i}"><span class="move-ic" style="--c:${e.color};--d:${e.deep}">${Icons.svg(mv.icon)}</span><div><b>${mv.name.toUpperCase()}</b><small>${i === 0 ? 'MAIN ATTACK' : 'POWER ' + i}</small></div></div>`).join('')}</div>
      <button class="btn primary small" id="pvBack"><b>BACK</b></button>`;
    Icons.hydrate(bar);
    document.body.classList.add('previewing');
    $(previewFrom).classList.add('hidden');
    bar.classList.remove('hidden');
    Game.hooks.onPreviewMove = slot => bar.querySelectorAll('.pv-move').forEach(m => m.classList.toggle('on', +m.dataset.i === slot));
    Game.startPreview(e.id);
    $('pvBack').onclick = () => { Sfx.click(); closePreview(); };
  }
  function closePreview() {
    if (!document.body.classList.contains('previewing')) return;
    Game.stopPreview();
    Game.hooks.onPreviewMove = null;
    document.body.classList.remove('previewing');
    $('previewBar').classList.add('hidden');
    $(previewFrom).classList.remove('hidden');
    if (previewFrom === 'hub') renderHub(); else renderCodex();
  }

  /* ---------------------------------------------------------- live hub */
  // tier emblem: a shield in the tier colour with its division
  let badgeN = 0;
  function tierBadge(t, cls = '') {
    const id = 'tb' + (++badgeN);
    const mark = t.div < 0 ? '' : t.div ? `<text x="24" y="26" text-anchor="middle" dominant-baseline="central" font-size="${t.div === 3 ? 12 : 14}" font-weight="900" fill="#fff" font-family="Rubik, sans-serif">${['', 'I', 'II', 'III'][t.div]}</text>`
      : '<path d="m24 18 2.6 5.4 5.9.8-4.3 4.1 1 5.9L24 31.4l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="#fff"/>';
    return `<svg class="tier-badge ${cls}" viewBox="0 0 48 52" aria-label="${t.label}" role="img"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.color}"/><stop offset="1" stop-color="${mixHex(t.color, '#101320', 0.55)}"/></linearGradient></defs>
      <path d="M24 2 44 9v17c0 12-9 20-20 24C13 46 4 38 4 26V9z" fill="url(#${id})" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
      <path d="M24 8 38 13v13c0 8.5-6 14.5-14 17.5C16 40.5 10 34.5 10 26V13z" fill="rgba(0,0,0,.24)"/>${mark}</svg>`;
  }
  const QUEST_ICON = { kills: 'sword', ringouts: 'burst', stages: 'map', stars3: 'star', duels: 'swords', duelWins: 'trophy', endlessKills: 'infinity', combo: 'bolt', gems: 'gem' };
  const until = (ts, pre = '') => `<b data-until="${ts}" data-pre="${pre}">${pre}${Meta.fmtLeft(ts - Date.now())}</b>`;
  function questRow(q, reward, claimAttr) {
    const pct = Math.round(q.prog / q.n * 100);
    const icon = q.el ? hex(q.el) : `<span class="q-ic">${ic(QUEST_ICON[q.type] || 'scroll')}</span>`;
    const right = q.claimed ? `<span class="q-done">${ic('check')}</span>`
      : q.done ? `<button class="btn small primary claim" ${claimAttr}>${reward}<b>CLAIM</b></button>`
      : `<span class="q-rw">${reward}</span>`;
    return `<div class="quest${q.done ? ' done' : ''}${q.claimed ? ' claimed' : ''}">${icon}
      <div class="q-body"><b>${q.text}</b><div class="q-bar"><i style="width:${pct}%"></i></div><small>${fmt(q.prog)} / ${fmt(q.n)}</small></div>${right}</div>`;
  }
  const gemRw = n => `<span class="rw">${ic('gem', 'gem')}${n}</span>`;
  const tokRw = n => `<span class="rw tok">${ic('token')}${n}</span>`;

  let hubTab = 'event';
  function openHub(tab) { if (tab) hubTab = tab; show('hub'); renderHub(); }
  function renderHub() {
    const c = Meta.claimable();
    $('hubTabs').querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === hubTab);
      const dot = b.querySelector('.dot');
      if (dot) dot.classList.toggle('hidden', !(b.dataset.tab === 'event' ? c.event : c.daily));
      b.onclick = () => { Sfx.click(); hubTab = b.dataset.tab; renderHub(); };
    });
    const body = $('hubBody');
    body.innerHTML = hubTab === 'event' ? eventTab() : hubTab === 'quests' ? questsTab() : ranksTab();
    if (hubTab === 'ranks') loadLeaderboard();
    Icons.hydrate(body); Icons.hydrate($('hubTabs')); drawHatThumbs(body);
    document.querySelectorAll('.essence-val').forEach(el => { el.textContent = fmt(Save.data.essence); });
    bindHub(body);
    fitScreen();
  }

  function eventTab() {
    const st = Meta.eventState();
    if (!st) return `<div class="hub-empty card">${ic('clock')}<h3>NO EVENT RIGHT NOW</h3><p>There's no event running at the moment. New events bring exclusive rewards, event quests and tokens. Check back soon.</p></div>`;
    if (st.ev.kind === 'winterfest') return winterTab(st);
    const ev = st.ev, el = ELEMENT_BY_ID[ev.element];
    const pct = Math.min(100, Math.round(st.tokens / st.price * 100));
    const doneN = st.quests.filter(q => q.claimed).length;
    const cta = st.owned
      ? `<button class="btn primary" id="evEquip"><b>${Save.loadout().includes(el.id) ? 'EQUIPPED' : 'EQUIP ' + NAME(el.id)}</b></button>`
      : `<button class="btn${st.tokens >= st.price ? ' primary' : ''}" id="evBuy">${ic('token')}<b>UNLOCK · ${st.price}</b></button>`;
    return `<div class="hub-grid event-tab" style="--ec:${ev.color};--ed:${ev.deep}">
      <div class="ev-hero card">
        <div class="ev-art" style="background:radial-gradient(60% 50% at 50% 46%, ${ev.color}40, transparent 72%), linear-gradient(180deg, #171c2c, #0b0e16)">
          <span class="ev-glow" style="background:radial-gradient(closest-side, ${ev.color}66, ${ev.deep}22 60%, transparent)"></span>
          <span class="ev-grid" style="background-image:linear-gradient(${ev.color}55 1px, transparent 1px), linear-gradient(90deg, ${ev.deep}55 1px, transparent 1px)"></span>
          ${hex(el.id, 'ev-hex')}<span class="ev-floor"></span></div>
        <div class="ev-info">
          <span class="kicker"><i class="live-dot"></i>LIVE EVENT · ENDS IN ${until(ev.end)}</span>
          <h3>${ev.name.toUpperCase()}</h3>
          <p class="ev-tag">${ev.tagline}</p>
          <div class="ev-el"><small>EXCLUSIVE ELEMENT</small><b>${NAME(el.id)}</b><div class="ev-moves">${el.moves.map((mv, i) => `<span class="ev-move" title="${mv.name}"><span class="move-ic" style="--c:${el.color};--d:${el.deep}">${ic(mv.icon)}</span><small>${i ? 'POWER ' + i : 'MAIN'}</small><b>${mv.name.toUpperCase()}</b></span>`).join('')}</div></div>
          <div class="ev-progress" data-part="evprog">
            <div class="tok-line"><span class="tok-bal">${ic('token')}<b>${fmt(st.tokens)}</b><small>/ ${st.price} TOKENS</small></span>${st.owned ? `<span class="owned">${ic('check')}OWNED</span>` : ''}</div>
            <div class="bar-track"><i style="width:${st.owned ? 100 : pct}%"></i></div>
          </div>
          <div class="ev-cta" data-part="evcta">${cta}<button class="btn" id="evPreview">${ic('play')}<b>PREVIEW</b></button></div>
        </div>
      </div>
      <div class="hub-col">
        <div class="card panel">
          <div class="panel-head"><h4>${ic('scroll')}DAILY EVENT QUESTS</h4><small>NEW QUESTS IN ${until(st.refresh)}</small></div>
          <div class="quest-list" data-part="evq">${st.quests.map(q => questRow(q, tokRw(q.tokens), `data-evq="${q.i}"`)).join('')}</div>
          <p class="fine" data-part="evqn">${doneN}/${st.quests.length} claimed today · up to ${st.quests.reduce((t, q) => t + q.tokens, 0)} tokens a day</p>
        </div>
        <div class="card panel">
          <div class="panel-head"><h4>${ic('gift')}TOKEN SHOP</h4></div>
          <div class="shop-row" data-part="shop"><span class="q-ic gemc">${ic('gem')}</span><div><b>GEM CACHE</b><small>+${st.cache.gems} gems · buy as often as you like</small></div><button class="btn small${st.tokens >= st.cache.cost ? ' primary' : ''}" id="evCache">${ic('token')}<b>${st.cache.cost}</b></button></div>
          <p class="fine">Tokens come only from daily event quests. They expire when the event ends. Unlock the element before then: it's only available during this event, and it's yours to keep.</p>
        </div>
        ${st.upcoming.length ? `<div class="card panel">
          <div class="panel-head"><h4>${ic('clock')}COMING UP</h4></div>
          <div class="upcoming">${st.upcoming.map(u => `<div class="up-ev" style="--c:${u.color}">${hex(u.element)}<div><b>${u.name.toUpperCase()}</b><small>${NAME(u.element)} · STARTS IN ${until(u.start)}</small></div></div>`).join('')}</div>
        </div>` : ''}
      </div>
    </div>`;
  }

  function winterTab(st) {
    const ev = st.ev, ch = st.chapter, doneN = st.quests.filter(q => q.claimed).length;
    const ms = Object.entries(WINTER_MILESTONES).map(([i, h]) => `<div class="wf-ms${Cosmetics.ownsHat(h) ? ' got' : ''}">${hatThumb(h, 44)}<small>STAGE ${+i + 1}</small><b>${HAT_BY_ID[h].name.toUpperCase()}</b>${Cosmetics.ownsHat(h) ? `<span class="q-done">${ic('check')}</span>` : ''}</div>`).join('');
    const snow = n => `<span class="tok-rw">${ic('snow')}<b>${n}</b></span>`;
    return `<div class="hub-grid event-tab wf-tab" style="--ec:${ev.color};--ed:${ev.deep}">
      <div class="ev-hero card">
        <div class="ev-art wf-art"><span class="wf-snow"></span><span class="wf-glow"></span><span class="wf-emblem">${ic('snowman')}</span></div>
        <div class="ev-info">
          <span class="kicker"><i class="live-dot"></i>LIVE EVENT · ENDS IN ${until(ev.end)}</span>
          <h3>WINTERFEST</h3>
          <p class="ev-tag">${ev.tagline}</p>
          <div class="ev-el"><small>EVENT CHAPTER · ${ch.cleared}/${ch.total} CLEARED · ${ch.stars}/${ch.total * 3} STARS</small>
            <div class="bar-track"><i style="width:${Math.round(ch.cleared / ch.total * 100)}%"></i></div>
            <div class="wf-milestones">${ms}</div>
          </div>
          <div class="ev-cta"><button class="btn primary" id="wfPlay">${ic('play')}<b>${ch.cleared ? 'CONTINUE' : 'PLAY'} WINTERFEST</b></button></div>
        </div>
      </div>
      <div class="hub-col">
        <div class="card panel">
          <div class="panel-head"><h4>${ic('scroll')}WINTERFEST QUESTS</h4><small>NEW QUESTS IN ${until(st.refresh)}</small></div>
          <div class="quest-list" data-part="evq">${st.quests.map(q => questRow(q, snow(q.tokens), `data-evq="${q.i}"`)).join('')}</div>
          <p class="fine" data-part="evqn">${doneN}/${st.quests.length} claimed today · up to ${st.quests.reduce((t, q) => t + q.tokens, 0)} Snowflakes a day</p>
        </div>
        <div class="card panel">
          <div class="panel-head"><h4>${ic('gift')}SNOWFLAKE SHOP</h4><span class="tok-bal" data-part="evbal">${ic('snow')}<b>${fmt(st.tokens)}</b></span></div>
          <div class="wf-shop" data-part="shop">${st.shop.map(it => `<div class="wf-item${it.owned ? ' owned' : ''}">${it.kind === 'hat' ? hatThumb(it.id, 40) : `<span class="sw" style="--c:${COLOUR_BY_ID[it.id].body}"></span>`}<div><b>${it.name.toUpperCase()}</b><small>${it.kind === 'hat' ? 'HAT' : 'COLOUR'}</small></div>${it.owned ? `<span class="q-done">${ic('check')}</span>` : `<button class="btn small${st.tokens >= it.cost ? ' primary' : ''}" data-wfbuy="${it.kind}:${it.id}">${ic('snow')}<b>${it.cost}</b></button>`}</div>`).join('')}
            <div class="wf-item"><span class="q-ic gemc">${ic('gem')}</span><div><b>GEM CACHE</b><small>+${st.cache.gems} GEMS · ANY TIME</small></div><button class="btn small${st.tokens >= st.cache.cost ? ' primary' : ''}" id="evCache">${ic('snow')}<b>${st.cache.cost}</b></button></div></div>
          <p class="fine">Snowflakes come only from Winterfest quests and melt when the event ends. What you buy is yours to keep.</p>
        </div>
      </div>
    </div>`;
  }

  function questsTab() {
    const d = Meta.dailyState();
    const claimed = d.list.filter(q => q.claimed).length;
    return `<div class="hub-grid quests-tab">
      <div class="card panel">
        <div class="panel-head"><h4>${ic('scroll')}DAILY QUESTS</h4><small>NEW QUESTS IN ${until(Date.now() + d.left)}</small></div>
        <div class="quest-list" data-part="dq">${d.list.map(q => questRow(q, gemRw(q.gems), `data-dq="${q.i}"`)).join('')}</div>
        <div data-part="bonus" class="bonus${d.bonus ? ' claimed' : d.bonusReady ? ' ready' : ''}">
          <span class="q-ic gift">${ic('gift')}</span>
          <div class="q-body"><b>DAILY CHEST</b><small>Claim all three quests to open it</small><div class="pips">${[0, 1, 2].map(i => `<i class="${i < claimed ? 'on' : ''}"></i>`).join('')}</div></div>
          ${d.bonus ? `<span class="q-done">${ic('check')}</span>` : d.bonusReady ? `<button class="btn small claim" id="dqBonus">${gemRw(d.bonusGems)}<b>OPEN</b></button>${Platform.rewardedAvailable ? `<button class="btn small claim rw-offer" id="dqBonusAd">${adTag()}<b>OPEN ×2</b></button>` : Platform.adBlock ? '<span class="rw-note">×2 off · ad blocker</span>' : ''}` : `<span class="q-rw">${gemRw(d.bonusGems)}</span>`}
        </div>
      </div>
    </div>`;
  }

  function ranksTab() {
    const a = Save.data.arena, t = Meta.tierOf(a.trophies);
    const games = a.wins + a.losses;
    const recs = [
      ['trophy', 'PEAK TROPHIES', fmt(a.peak)], ['infinity', 'ENDLESS BEST', fmt(Save.data.endlessBest)],
      ['star', 'STARS', `${Save.totalStars()}/${TOTAL_STAGES * 3}`], ['crown', 'BOSSES BEATEN', fmt(Save.data.stats.bosses)],
      ['sword', 'FOES DEFEATED', fmt(Save.data.stats.kills)], ['burst', 'RING OUTS', fmt(Save.data.stats.ringouts)],
      ['swirl', 'ELEMENTS', `${Save.unlockedElements().length}/${ELEMENTS.length}`], ['bolt', 'BEST STREAK', fmt(a.bestStreak)],
    ];
    const strip = Meta.TIERS.map(T => {
      const tt = Meta.tierOf(T.min), here = tt.i === t.i, reached = T.min <= a.peak;
      return `<div class="tier-cell${here ? ' here' : ''}${reached ? ' reached' : ''}" style="--tc:${T.color}">${here ? '<span class="you">YOU</span>' : ''}${tierBadge(Object.assign({}, tt, { div: T.id === 'legend' ? 0 : -1, label: T.name }), 'sm')}<b>${T.name.toUpperCase()}</b><small>${fmt(T.min)}+</small><span class="rw">${T.reward ? `${ic('gem', 'gem')}${T.reward}` : '&nbsp;'}</span></div>`;
    }).join('');
    return `<div class="hub-grid ranks-tab">
      <div class="hub-col" id="rkLeft">
        <div class="card rank-hero" style="--tc:${t.color}">
          ${tierBadge(t, 'xl')}
          <div class="rk-info">
            <small>ARENA RANK</small><h3>${t.label}</h3>
            <div class="trophies">${ic('trophy')}<b>${fmt(a.trophies)}</b><small>TROPHIES</small></div>
            <div class="bar-track"><i style="width:${Math.round(t.pct * 100)}%"></i></div>
            <small class="to-next">${t.next ? `${t.next.min - a.trophies} TO ${t.next.name.toUpperCase()}` : 'TOP TIER REACHED'}</small>
          </div>
          <div class="rk-stats">
            <div><b>${a.wins}</b><small>WINS</small></div><div><b>${a.losses}</b><small>LOSSES</small></div>
            <div><b>${games ? Math.round(a.wins / games * 100) : 0}%</b><small>WIN RATE</small></div><div><b>${a.streak > 0 ? a.streak : 0}</b><small>STREAK</small></div>
          </div>
          <button class="btn primary" id="rkPlay">${ic('swords')}<b>PLAY ARENA</b></button>
        </div>
      </div>
      <div class="hub-col">
        <div class="card panel">
          <div class="panel-head"><h4>${ic('trophy')}ARENA TIERS</h4><small>GEMS ON FIRST PROMOTION</small></div>
          <div class="tier-strip">${strip}</div>
        </div>
        <div class="card panel">
          <div class="panel-head"><h4>${ic('ranks')}PERSONAL RECORDS</h4></div>
          <div class="records">${recs.map(([i, l, v]) => `<div>${ic(i)}<b>${v}</b><small>${l}</small></div>`).join('')}</div>
        </div>
      </div>
    </div>`;
  }
  // CrazyGames only, and only with real entries: a top-10 panel under your rank card
  function loadLeaderboard() {
    if (!Platform.hasSdk) return;
    Platform.fetchLeaderboard().then(rows => {
      const left = $('rkLeft');
      if (!rows || !rows.length || !left || hubTab !== 'ranks') return;
      const panel = document.createElement('div');
      panel.className = 'card panel lb-panel';
      panel.innerHTML = `<div class="panel-head"><h4>${ic('ranks')}LEADERBOARD</h4><small>TOP 10</small></div>
        <div class="lb">${rows.slice(0, 10).map((r, i) => {
          const rank = r.rank || i + 1, tt = Meta.tierOf(r.score || 0);
          return `<div class="lb-row${rank <= 3 ? ' top top' + rank : ''}" style="--tc:${tt.color}"><span class="lb-rank">${rank <= 3 ? ic('crown') : ''}<b>${rank}</b></span><span class="lb-name"><b>${esc(String(r.name || ''))}</b><small>${tt.label}</small></span><span class="lb-tro">${ic('trophy')}${fmt(r.score || 0)}</span></div>`;
        }).join('')}</div>`;
      left.appendChild(panel);
      Icons.hydrate(panel);
    }).catch(() => {});
  }
  function softRefreshHub() {
    const body = $('hubBody'), tmp = document.createElement('div');
    tmp.innerHTML = hubTab === 'event' ? eventTab() : hubTab === 'quests' ? questsTab() : ranksTab();
    const fresh = [...tmp.querySelectorAll('[data-part]')];
    if (!fresh.length || fresh.some(n => !body.querySelector(`[data-part="${n.dataset.part}"]`))) { renderHub(); return; }
    for (const n of fresh) body.querySelector(`[data-part="${n.dataset.part}"]`).replaceWith(n);
    Icons.hydrate(body); drawHatThumbs(body);
    const c = Meta.claimable();
    $('hubTabs').querySelectorAll('button').forEach(b => { const dot = b.querySelector('.dot'); if (dot) dot.classList.toggle('hidden', !(b.dataset.tab === 'event' ? c.event : c.daily)); });
    document.querySelectorAll('.essence-val').forEach(el => { el.textContent = fmt(Save.data.essence); });
    bindHub(body);
    fitScreen();
  }
  function bindHub(body) {
    const on = (sel, fn) => body.querySelectorAll(sel).forEach(b => b.onclick = e => fn(b, e));
    on('[data-evq]', b => { const n = Meta.claimEvent(+b.dataset.evq); if (n) { Sfx.pickup(); toast(`+${n} EVENT TOKENS`); softRefreshHub(); } });
    on('[data-dq]', b => { const n = Meta.claimDaily(+b.dataset.dq); if (n) { Sfx.pickup(); toast(`+${n} GEMS`); softRefreshHub(); } });
    on('#dqBonusAd', b => { Sfx.click(); b.disabled = true; Platform.rewarded(ok => {
      if (!ok) { b.disabled = false; toast('AD UNAVAILABLE'); return; }
      const n = Meta.claimBonus(); if (!n) return;
      Save.data.essence += n; Save.save();
      Sfx.unlock(); ; toast(`DAILY CHEST ×2 · +${n * 2} GEMS`); softRefreshHub();
    }); });
    on('#dqBonus', () => { const n = Meta.claimBonus(); if (n) { Sfx.unlock(); ; toast(`DAILY CHEST · +${n} GEMS`); softRefreshHub(); } });
    on('#rkPlay', () => { Sfx.click(); openArena(); });
    on('#wfPlay', () => { Sfx.click(); mapMode = 'event'; openMap(); Game.idleScene(WINTER_REALM); });
    on('[data-wfbuy]', b => {
      const [kind, id] = b.dataset.wfbuy.split(':');
      if (Meta.buyEventCosmetic(kind, id)) { Sfx.unlock(); Cosmetics.equip(kind, id); toast(`${(kind === 'hat' ? HAT_BY_ID[id] : COLOUR_BY_ID[id]).name.toUpperCase()} · YOURS`); renderHub(); }
      else { Sfx.denied(); toast('NOT ENOUGH SNOWFLAKES'); }
    });
    on('#evCache', () => { if (Meta.buyCache()) { Sfx.pickup(); toast('GEM CACHE OPENED'); softRefreshHub(); } else { Sfx.denied(); toast('NOT ENOUGH TOKENS'); } });
    on('#evBuy', () => {
      const st = Meta.eventState(); if (!st) return;
      const el = ELEMENT_BY_ID[st.ev.element];
      if (Meta.buyEventElement()) {
        Sfx.unlock(); ;
        const l = Save.loadout(); if (l.length < 3 && !l.includes(el.id)) Save.setLoadout(l.concat(el.id));
        toast(`${el.name.toUpperCase()} UNLOCKED!`); softRefreshHub();
      } else { Sfx.denied(); toast(`NEED ${st.price - st.tokens} MORE TOKENS`); }
    });
    on('#evEquip', () => {
      const st = Meta.eventState(); if (!st) return;
      const id = st.ev.element; let l = Save.loadout();
      if (l.includes(id)) return;
      if (l.length >= 3) l.shift(); l.push(id);
      Sfx.click(); Save.setLoadout(l); applyAccentTheme(); toast(`${NAME(id)} EQUIPPED`); softRefreshHub();
    });
    on('#evPreview', () => { Sfx.click(); const st = Meta.eventState(); if (!st) return; previewFrom = 'hub'; openPreview(ELEMENT_BY_ID[st.ev.element]); });
  }

  // home: the live rail on the right (event, quests, rank)
  function refreshRail() {
    const es = Meta.eventState(), ds = Meta.dailyState(), c = Meta.claimable(), a = Save.data.arena, t = Meta.tierOf(a.trophies);
    const badge = n => (n ? '<i class="badge" aria-label="Rewards to claim"></i>' : '');
    const ev = $('railEvent');
    ev.classList.toggle('hidden', !es);   // no event, no card
    if (es) {
      ev.style.setProperty('--c', es.ev.color);
      ev.innerHTML = `<span class="rc-gl">${es.ev.element ? elementIcon(es.ev.element) : ic('snow')}</span><span class="rc-t"><small><i class="live-dot"></i>EVENT · ${until(es.ev.end)}</small><b>${es.ev.name.toUpperCase()}</b></span>${badge(c.event)}`;
    }
    $('railQuests').innerHTML = `<span class="rc-gl">${ic('scroll')}</span><span class="rc-t"><small>QUESTS</small><b>${ds.list.filter(q => q.done).length}/${ds.list.length} DONE</b></span>${badge(c.daily)}`;
    $('railRanks').style.setProperty('--c', t.color);
    $('railRanks').innerHTML = `<span class="rc-gl">${tierBadge(t, 'sm')}</span><span class="rc-t"><small>RANKS</small><b>${t.label}</b></span>`;
    Icons.hydrate($('homeRail'));
  }
  // countdowns tick quietly wherever they are on screen
  setInterval(() => {
    document.querySelectorAll('[data-until]').forEach(el => { if (el.offsetParent !== null) el.textContent = (el.dataset.pre || '') + Meta.fmtLeft(+el.dataset.until - Date.now()); });
  }, 15000);

  /* ------------------------------------------------------------- arena */
  let mmToken = 0;
  function openArena() {
    const a = Save.data.arena, t = Meta.tierOf(a.trophies);
    mmToken++;
    modal(`
      <h2>${ic('swords')} ARENA</h2>
      <p class="sub">1V1 · BEST OF 3 · KNOCK OUT OR RING OUT YOUR RIVAL</p>
      <div class="mm-card" style="--tc:${t.color}">
        ${tierBadge(t, 'lg')}
        <div class="mm-rank"><small>YOUR RANK</small><b>${t.label}</b><span>${ic('trophy')}${fmt(a.trophies)} TROPHIES</span></div>
        <div class="mm-lo"><small>YOUR ELEMENTS</small><div>${Save.loadout().map(id => hex(id)).join('')}<button class="btn small" id="mmLo"><b>CHANGE</b></button></div></div>
      </div>
      <div class="mm-stakes">
        <div class="win"><small>WIN</small><b>${ic('trophy')}+30</b><b>${ic('gem', 'gem')}+${30 + t.i * 8}</b></div>
        <div class="loss"><small>LOSS</small><b>${ic('trophy')}${a.trophies === 0 ? '0' : '−' + (a.trophies < Meta.TIERS[1].min ? 9 : 18)}</b><b>${ic('gem', 'gem')}+10</b></div>
      </div>
      <div class="actions" id="mmActions"><button class="btn" id="mmBack"><b>BACK</b></button><button class="btn primary" id="mmFind">${ic('swords')}<b>FIGHT</b></button></div>
`, sh => {
      sh.querySelector('#mmBack').onclick = () => { Sfx.click(); mmToken++; closeModal(); if (current === 'home') refreshHome(); };
      sh.querySelector('#mmLo').onclick = () => { Sfx.click(); openLoadout(() => openArena()); };
      sh.querySelector('#mmFind').onclick = e => { Sfx.click(); e.currentTarget.disabled = true; Platform.maybeMidgame(() => { if (modalOpen()) enterDuel(); }); };
    }, 'arena');
  }
  // straight into the fight: the bars cover the switch and lift on round 1
  function enterDuel() {
    const token = ++mmToken;
    Meta.findMatch().then(rival => {
      if (token !== mmToken) return;
      closeModal();
      barWipe(() => startDuel(rival));
    });
  }
  // bar transition: bars drop to cover the screen, the swap happens behind them, then they lift
  function barWipe(mid) {
    const b = $('bars');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { mid(); return; }
    b.className = 'in';
    Sfx.whoosh();
    setTimeout(() => {
      mid();
      // hold the cover a beat so the arena is built before the bars lift
      setTimeout(() => { b.className = 'out'; setTimeout(() => { b.className = ''; }, 1500); }, 220);
    }, 1300);
  }
  // your own name on the versus screen: your CrazyGames username if logged in, otherwise YOU
  const myName = () => String((Platform.user && Platform.user.username) || 'YOU').toUpperCase().slice(0, 16);
  const roundText = r => `ROUND ${r.n} · ${r.me} – ${r.them}`;
  function startDuel(rival) {
    lastStart = { mode: 'duel', rival };
    closeModal(); show(null);
    Game.start({ mode: 'duel', rival });
    hudCache = {};
    buildHud();
    setChip(rival.element, 'ARENA · ' + rival.name.toUpperCase());
    $('waveDots').innerHTML = ''; $('chipSub').textContent = roundText({ n: 1, me: 0, them: 0 });
    banner('ROUND 1');
  }
  function forfeitDuel() {
    const rv = lastStart && lastStart.rival;
    const r = Meta.recordDuel(false, rv);
    Meta.track('duels');
    toast(`MATCH FORFEITED ${r.delta} TROPHIES`);
  }

  /* -------------------------------------------------------------- forge */
  function openForge() { show('forge'); renderForge(); nudgeScroll($('forge'), 'y'); }
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
          else needGems(cost - Save.data.essence, () => renderForge());
        };
      }
      card.appendChild(b);
      grid.appendChild(card);
    }
    Icons.hydrate(grid);
    fitScreen();
  }

  /* -------------------------------------------------------------- modal */
  // keep: re-render the open sheet in place (no pop animation, scroll kept)
  function modal(html, onOpen, cls = '', keep = false) {
    const m = $('modal'), s = $('sheet');
    const top = s.scrollTop;
    s.className = 'sheet ' + cls;
    s.innerHTML = html;
    Icons.hydrate(s);
    m.classList.remove('hidden');
    if (keep) s.scrollTop = top;
    else { s.scrollTop = 0; s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; nudgeScroll(s, 'y'); }
    onOpen && onOpen(s);
  }

  // touch screens: a scrollable menu left untouched for a moment shows a small scroll nudge and a hint
  const nudges = new Map();
  function nudgeScroll(el, axis) {
    if (!document.body.classList.contains('touch') || !el) return;
    clearTimeout(nudges.get(el));
    const hint = el.querySelector(':scope > .scroll-hint'); if (hint) hint.remove();
    let touched = false;
    const stop = () => { touched = true; clearTimeout(nudges.get(el)); const h = el.querySelector(':scope > .scroll-hint'); if (h) h.classList.add('gone'); };
    el.addEventListener('scroll', stop, { once: true, passive: true });
    el.addEventListener('pointerdown', stop, { once: true, passive: true });
    nudges.set(el, setTimeout(() => {
      const more = axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
      if (touched || more < 24 || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
      el.removeEventListener('scroll', stop);
      const d = Math.min(70, more);
      el.scrollTo(axis === 'y' ? { top: d, behavior: 'smooth' } : { left: d, behavior: 'smooth' });
      setTimeout(() => el.scrollTo(axis === 'y' ? { top: 0, behavior: 'smooth' } : { left: 0, behavior: 'smooth' }), 520);
      if (axis === 'y') {
        const h = document.createElement('div');
        h.className = 'scroll-hint';
        h.innerHTML = '<span>SCROLL FOR MORE</span><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        el.appendChild(h);
        setTimeout(() => el.addEventListener('scroll', () => h.classList.add('gone'), { once: true, passive: true }), 1100);
        setTimeout(() => h.classList.add('gone'), 5000);
      }
    }, 2600));
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  const modalOpen = () => !$('modal').classList.contains('hidden');

  function openSettings(fromPause) {
    const st = Save.data.settings;
    const rows = [['sfx', 'SOUND'], ['music', 'MUSIC'], ['shake', 'SCREEN SHAKE'], ['numbers', 'DAMAGE NUMBERS']];
    modal(`
      <h2>SETTINGS</h2>
      <div class="toggles">${rows.map(([k, label]) => `<button class="toggle${st[k] ? ' on' : ''}" data-k="${k}">${label}<span class="sw"></span></button>`).join('')}</div>
      ${document.body.classList.contains('touch') ? '' : `<div class="keys">
        <span><kbd>${key('KeyA')}</kbd><kbd>${key('KeyD')}</kbd></span><span>Move, <kbd>${key('KeyS')}</kbd> to drop through</span>
        <span><kbd>${key('KeyW')}</kbd><kbd>SPACE</kbd></span><span>Jump, again in the air</span>
        <span><kbd>CLICK</kbd></span><span>Main attack toward the cursor</span>
        <span><kbd>${KEYS[1]}</kbd><kbd>${KEYS[2]}</kbd></span><span>Element powers</span>
        <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span><span>Swap element</span>
        <span><kbd>${key('KeyP')}</kbd></span><span>Pause</span>
      </div>`}
      ${Platform.hasSdk ? '<button class="link-btn" id="setPrivacy">Privacy &amp; Terms</button>' : ''}
      <div class="actions"><button class="btn primary" id="setBack"><b>${fromPause ? 'BACK' : 'DONE'}</b></button><button class="btn danger" id="setReset"><b>RESET</b></button></div>`, s => {
      const pv = s.querySelector('#setPrivacy');
      if (pv) pv.onclick = () => { Sfx.click(); openPrivacy(fromPause); };   // only on CrazyGames (SDK present)
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
    modal(`<h2 class="lose">RESET PROGRESS?</h2><p class="tip">Stars, gems, upgrades and elements will be erased.</p>
      <div class="actions"><button class="btn" id="rsNo"><b>CANCEL</b></button><button class="btn danger" id="rsYes"><b>ERASE</b></button></div>`, s => {
      s.querySelector('#rsNo').onclick = () => openSettings(fromPause);
      s.querySelector('#rsYes').onclick = () => { Save.reset(); applySettings(); closeModal(); Game.idleScene(0); show('home'); toast('PROGRESS RESET'); };
    });
  }

  function applySettings() { const st = Save.data.settings; Sfx.setSfx(st.sfx); Sfx.setMusic(st.music); }

  function openPause() {
    if (Game.state !== 'play') return;
    Game.paused = true; Platform.gameplayStop();
    const label = Game.mode === 'stage' ? `${REALMS[lastStart.r].name.toUpperCase()} · ${stageLabel(lastStart.r, lastStart.s)}` : Game.mode === 'tutorial' ? 'TRAINING' : Game.mode === 'test' ? 'TESTING' : Game.mode === 'duel' ? `ARENA${lastStart && lastStart.rival ? ' · VS ' + esc(lastStart.rival.name.toUpperCase()) : ''}` : 'ENDLESS';
    if (Game.mode === 'duel') {
      // an Arena match cannot be restarted or re-equipped mid-fight; leaving it is a forfeit
      modal(`
        <h2>MATCH MENU</h2>
        <p class="sub">${label}</p>
        <div class="pause-stack">
          <button class="btn primary" id="pResume"><b>BACK TO THE FIGHT</b></button>
          <button class="btn" id="pSettings"><b>SETTINGS</b></button>
          <button class="btn danger" id="pQuit"><b>FORFEIT MATCH</b></button>
        </div>
        <p class="fine center">Forfeiting counts as a loss.</p>`, s => {
        s.querySelector('#pResume').onclick = resume;
        s.querySelector('#pSettings').onclick = () => openSettings(true);
        s.querySelector('#pQuit').onclick = () => { Sfx.click(); closeModal(); forfeitDuel(); Game.quit(); Game.idleScene(0); show('home'); };
      }, 'pause');
      return;
    }
    modal(`
      <h2>PAUSED</h2>
      <p class="sub">${label}</p>
      <div class="pause-stack">
        <button class="btn primary" id="pResume"><b>RESUME</b></button>
        <button class="btn" id="pRestart"><b>RESTART</b></button>
        <button class="btn" id="pLoadout"><b>CHANGE ELEMENTS</b></button>
        <button class="btn" id="pSettings"><b>SETTINGS</b></button>
        <button class="btn danger" id="pQuit"><b>QUIT TO MENU</b></button>
      </div>`, s => {
      s.querySelector('#pResume').onclick = resume;
      s.querySelector('#pRestart').onclick = () => { Sfx.click(); closeModal(); Game.quit(); relaunch(); };
      s.querySelector('#pLoadout').onclick = () => { Sfx.click(); openLoadout(() => { closeModal(); Game.quit(); relaunch(); toast('RESTARTED WITH NEW ELEMENTS'); }, openPause); };
      s.querySelector('#pSettings').onclick = () => openSettings(true);
      s.querySelector('#pQuit').onclick = () => {
        Sfx.click(); closeModal();
        // Quit always returns to the actual home screen, not back to stage selection.
        Game.quit();
        Game.idleScene(0);
        show('home');
      };
    }, 'pause');
  }
  function resume() {
    Sfx.click(); closeModal();
    if (!Game.paused) return;
    Game.paused = false;
    if (Game.state === 'play') Platform.gameplayStart();
  }

  /* ------------------------------------------------------------ results */
  // Result buttons: with ad offers, the offers sit on one row with the main action (RETRY /
  // NEXT / AGAIN) and the menu-type buttons share the row below; without offers, one row.
  function resultActions(secondary, primary, offers) {
    if (!offers) return `<div class="actions result-actions">${secondary}${primary}</div>`;
    return `<div class="actions result-actions has-offers"><div class="act-row act-main">${offers}${primary}</div><div class="act-row">${secondary}</div></div>`;
  }

  // No midgame is launched on its own at the end of a run (CrazyGames review): midgames
  // come from the buttons that start the next run (Next, Retry, Again, Play, Endless,
  // Find Match, a stage in Stages).
  function showResult(res) {
    $('bossBar').classList.add('hidden');
    renderResult(res);
  }
  function renderResult(res) {
    const tiles = `<div class="stat-tiles"><div><b>${res.kills}</b><small>DEFEATED</small></div><div><b>${res.ringouts}</b><small>RING OUTS</small></div><div><b>${res.bestCombo}</b><small>BEST COMBO</small></div></div>`;
    const reward = `<div class="payout"><span class="ic" data-icon="gem"></span><span id="payoutNum">+${res.essence}</span>${res.bonus ? `<small>INCL. ${res.bonus} CLEAR BONUS</small>` : ''}</div>`;
    const hasRewardOpportunity = (!res.won && res.canRevive && res.mode !== 'endless') || res.essence > 0;
    // a revive is a special offer: at most one every REVIVE_GAP, not on every death
    const offerRevive = Platform.rewardedAvailable && !res.won && res.canRevive && res.mode !== 'endless' && Date.now() - (Save.data.ads.reviveAt || 0) > REVIVE_GAP;
    if (offerRevive) { Save.data.ads.reviveAt = Date.now(); Save.save(); }
    res.revOffered = offerRevive;
    // one ad offer per screen at most: a revive replaces double-gems on that defeat
    const offers = offerRevive ? adBtn('rRevive', 'REVIVE') : Platform.rewardedAvailable && res.essence > 0 ? adBtn('rDouble', 'DOUBLE GEMS') : '';
    const adRow = !Platform.rewardedAvailable && Platform.adBlock && hasRewardOpportunity ? '<p class="fine center">Optional ad rewards are unavailable while an ad blocker is active. The game remains fully playable.</p>' : '';
    const bindAds = sh => {
      const d = sh.querySelector('#rDouble');
      if (d) d.onclick = () => { Sfx.click(); d.disabled = true; Platform.rewarded(ok => {
        if (ok) { Save.data.essence += res.essence; Save.save(); sh.querySelector('#payoutNum').textContent = '+' + res.essence * 2; toast('GEMS DOUBLED!'); d.remove(); }
        else { d.disabled = false; toast('AD UNAVAILABLE'); }
      }); };
      const rv = sh.querySelector('#rRevive');
      if (rv) rv.onclick = () => { Sfx.click(); rv.disabled = true; Platform.rewarded(ok => {
        if (ok && Game.revive()) { closeModal(); banner('REVIVED!'); }
        else { rv.disabled = false; toast('AD UNAVAILABLE'); }
      }); };
    };
    if (res.mode !== 'duel') Meta.track('gems', res.essence);
    if (res.mode === 'duel') { showDuelResult(res, tiles); return; }
    if (res.mode === 'event') { showWinterResult(res, tiles, reward, adRow, offers, bindAds); return; }
    if (res.mode === 'endless') {
      modal(`
        <h2 class="${res.best ? 'win' : ''}">${res.best ? 'NEW RECORD!' : 'RUN OVER'}</h2>
        <div class="result-content">
          <p class="sub">${res.kills} DEFEATED · BEST ${res.bestKills}</p>
          ${tiles}${reward}${adRow}
        </div>
        ${resultActions('<button class="btn" id="rMenu"><b>HOME</b></button>', '<button class="btn primary" id="rAgain"><b>AGAIN</b></button>', offers)}`, s => {
        bindAds(s);
        s.querySelector('#rMenu').onclick = () => { Sfx.click(); closeModal(); Game.idleScene(0); show('home'); };
        s.querySelector('#rAgain').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startEndless()); };
      }, 'result');
      return;
    }
    const { r, s } = res;
    const boss = s === STAGES_PER_REALM - 1;
    if (res.won) {
      Meta.track('stages');
      if (res.stars >= 3) Meta.track('stars3');
      const nextR = s + 1 < STAGES_PER_REALM ? r : r + 1;
      const nextS = s + 1 < STAGES_PER_REALM ? s + 1 : 0;
      const hasNext = nextR < REALMS.length;
      const u = res.unlocked;
      modal(`
        <h2 class="win">${boss ? 'REALM CONQUERED!' : 'VICTORY!'}</h2>
        <div class="result-content">
          <div class="big-stars">${[1, 2, 3].map(k => `<span class="ic${k <= res.stars ? ' on' : ''}" data-icon="star"></span>`).join('')}</div>
          <p class="sub">${REALMS[r].name.toUpperCase()} · STAGE ${stageLabel(r, s)}</p>
          ${tiles}${reward}${adRow}
          ${u ? `<div class="unlock" style="--c:${u.color}">${hex(u.id)}<div><small>NEW ELEMENT UNLOCKED</small><b>${u.name.toUpperCase()}</b><p>${u.blurb}</p></div></div>` : ''}
          ${boss && res.firstClear && hasNext ? `<p class="sub">${REALMS[nextR].name.toUpperCase()} IS NOW OPEN</p>` : ''}
        </div>
        ${hasNext
          ? resultActions('<button class="btn" id="rMenu"><b>MENU</b></button><button class="btn" id="rRetry"><b>RETRY</b></button>', '<button class="btn primary" id="rNext"><b>NEXT</b></button>', offers)
          : resultActions('<button class="btn" id="rMenu"><b>MENU</b></button>', '<button class="btn primary" id="rRetry"><b>RETRY</b></button>', offers)}`, sh => {
        bindAds(sh);
        sh.querySelector('#rMenu').onclick = toMenu;
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(r, s)); };
        const nb = sh.querySelector('#rNext');
        if (nb) nb.onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(nextR, nextS)); };
      }, 'result');
    } else {
      modal(`
        <h2 class="lose">DEFEATED</h2>
        <div class="result-content">
          <p class="sub">${REALMS[r].name.toUpperCase()} · STAGE ${stageLabel(r, s)}</p>
          ${tiles}${reward}${adRow}
          <p class="tip">${pick(TIPS)}</p>
        </div>
        ${resultActions('<button class="btn" id="rMenu"><b>MENU</b></button><button class="btn" id="rForge"><b>UPGRADES</b></button>', '<button class="btn primary" id="rRetry"><b>RETRY</b></button>', offers)}`, sh => {
        bindAds(sh);
        sh.querySelector('#rMenu').onclick = toMenu;
        sh.querySelector('#rForge').onclick = () => { Sfx.click(); closeModal(); Game.idleScene(r); returnTo = 'map'; openForge(); };
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(r, s)); };
      }, 'result');
    }
  }

  function showDuelResult(res, tiles) {
    const rv = res.rival;
    const r = Meta.recordDuel(res.won, rv);
    Meta.track('duels');
    if (res.won) Meta.track('duelWins');
    modal(`
      <h2 class="${res.won ? 'win' : 'lose'}">${res.won ? 'VICTORY!' : 'DEFEAT'}</h2>
      <div class="result-content">
        <p class="sub">ARENA · VS ${esc(rv.name.toUpperCase())}${res.rounds ? ` · ROUNDS ${res.rounds.me} – ${res.rounds.them}` : ''}</p>
        <div class="trophy-delta ${res.won ? 'gain' : 'drop'}" style="--tc:${r.tier.color}">${tierBadge(r.tier, 'md')}<div><b>${ic('trophy')}${r.delta > 0 ? '+' : ''}${r.delta}</b><small>${fmt(r.trophies)} TROPHIES · ${r.tier.label}</small></div></div>
        ${tiles}
        <div class="payout">${ic('gem')}<span id="payoutNum">+${r.gems + res.essence}</span>${r.tierGems ? `<small>INCL. ${r.tierGems} PROMOTION REWARD</small>` : ''}</div>
        ${!Platform.rewardedAvailable && Platform.adBlock ? '<p class="fine center">Optional ad rewards are unavailable while an ad blocker is active.</p>' : ''}
        ${r.promoted ? `<div class="unlock" style="--c:${r.promoted.color}">${tierBadge(r.tier, 'md')}<div><small>PROMOTED</small><b>${r.promoted.name.toUpperCase()}</b><p>You reached a new Arena tier.</p></div></div>` : ''}
      </div>
      ${resultActions('<button class="btn" id="rMenu"><b>HOME</b></button><button class="btn" id="rRanks"><b>RANKS</b></button>', '<button class="btn primary" id="rAgain"><b>NEXT MATCH</b></button>', Platform.rewardedAvailable ? adBtn('rDouble', 'DOUBLE GEMS') : '')}`, sh => {
      if (r.promoted) { Sfx.unlock(); ; }
      const dbl = sh.querySelector('#rDouble'), total = r.gems + res.essence;
      if (dbl) dbl.onclick = () => { Sfx.click(); dbl.disabled = true; Platform.rewarded(ok => {
        if (ok) { Save.data.essence += total; Save.save(); sh.querySelector('#payoutNum').textContent = '+' + total * 2; toast('GEMS DOUBLED!'); dbl.remove(); }
        else { dbl.disabled = false; toast('AD UNAVAILABLE'); }
      }); };
      sh.querySelector('#rMenu').onclick = toMenu;
      sh.querySelector('#rRanks').onclick = () => { Sfx.click(); closeModal(); Game.quit(); Game.idleScene(0); openHub('ranks'); };
      sh.querySelector('#rAgain').onclick = () => { Sfx.click(); Game.quit(); Game.idleScene(0); show('home'); openArena(); };
    }, 'result');
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
    announceTwist(stageTwist(r, s));
  }
  // stage twists: a badge on the stage card, and a heads-up when the stage starts
  function twistBadge(id) {
    const t = TWISTS[id];
    if (!t || id === 'none') return '';
    return `<span class="twist-badge" title="${t.name}: ${t.desc}">${ic(t.icon)}<b>${t.name.toUpperCase()}</b></span>`;
  }
  function announceTwist(id) {
    const t = TWISTS[id];
    if (!t || id === 'none') return;
    setTimeout(() => { if (Game.state === 'play') toast(`${t.name.toUpperCase()} · ${t.desc}`); }, 1300);
  }
  function startEndless() {
    lastStart = { mode: 'endless' };
    closeModal(); show(null);
    Game.start({ mode: 'endless' });
    hudCache = {};
    buildHud();
    setChip('none', 'ENDLESS');
    banner('ENDLESS');
  }
  /* ----------------------------------------------------------- tutorial */
  /* ---------------------------------------------------------- tutorial */
  // one action per step, shown as a picture of the input (keycaps / mouse on desktop,
  // the real on-screen button pulsing on touch) plus a two- or three-word label
  const cap = k => `<span class="cap${k.length > 2 ? ' wide' : ''}">${k}</span>`;
  const MOUSE = '<svg class="mouse" viewBox="0 0 26 36"><rect x="2" y="2" width="22" height="32" rx="11" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M13 2.6V15H2.6v-2A10.4 10.4 0 0 1 13 2.6z" fill="var(--acc)"/><path d="M13 3v12M2.5 15h21" stroke="currentColor" stroke-width="2"/></svg>';
  const GOAL = '<svg class="goal" viewBox="0 0 96 44"><g fill="#8fd46b"><rect x="2" y="22" width="9" height="9"/><rect x="12" y="22" width="9" height="9"/><rect x="22" y="22" width="9" height="9"/><rect x="32" y="22" width="9" height="9"/></g><g fill="#6b5848"><rect x="12" y="32" width="9" height="9"/><rect x="22" y="32" width="9" height="9"/></g><g stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"><circle cx="14" cy="5" r="3.2" fill="#fff"/><path d="M14 8v7M14 15l-3 6M14 15l3 6M14 11l6-2"/></g><g stroke="#ff5a6a" stroke-width="3" stroke-linecap="round" fill="none"><circle cx="58" cy="14" r="3.2" fill="#ff5a6a"/><path d="M56 17l-4 6M52 23l-5 3M52 23l1 6M55 19l5-4"/></g><path d="M66 20q10 6 8 20" stroke="#fff" stroke-width="2.4" fill="none" stroke-dasharray="3 3"/><path d="M69 37l5 5 4-6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>';
  const JOY = '<svg class="joyv" viewBox="0 0 64 44"><circle cx="32" cy="22" r="19" fill="rgba(255,255,255,.08)" stroke="currentColor" stroke-width="2.4"/><circle class="k" cx="32" cy="22" r="9" fill="var(--acc)"/><path d="M8 22H2m4-4-4 4 4 4M56 22h6m-4-4 4 4-4 4" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const TUT = [
    { label: 'MOVE', key: () => cap(key('KeyA')) + cap(key('KeyD')), touchKey: () => JOY, focus: '.joy', done: t => t.moved > 0 },
    { label: 'DOUBLE JUMP', key: () => cap('SPACE') + cap('SPACE'), focus: '.orb-jump', icon: 'up', done: t => t.jumped >= 2 },
    { label: 'HIT THE DUMMY', key: () => MOUSE, focus: '.orb-main', icon: 'palm', count: t => `${Math.min(3, t.hits)}/3`, done: t => t.hits >= 3 },
    { label: 'USE A POWER', key: () => cap(KEYS[1]) + cap(KEYS[2]), focus: '.orb-p1, .orb-p2', icon: 'burst', done: t => t.powers >= 1 },
    { label: 'KNOCK THE DUMMY OFF', key: () => GOAL, touchKey: () => GOAL, done: t => (t.ringouts || 0) >= 1 },
  ];
  let tutIdx = 0, tutLast = 0, tutWait = 0;
  function startTutorial() {
    lastStart = { mode: 'tutorial' };
    closeModal(); show(null);
    Game.start({ mode: 'tutorial' });
    hudCache = {};
    buildHud();
    setChip('wind', 'TRAINING');
    $('waveDots').innerHTML = ''; $('chipSub').textContent = 'LEARN THE BASICS';
    tutIdx = 0; tutWait = 0; tutLast = performance.now();
    $('tutDots').innerHTML = TUT.map(() => '<i></i>').join('');
    $('tut').classList.remove('hidden', 'done', 'ok');
    $('tutSkip').onclick = () => { Sfx.click(); endTutorial(); };
    renderTut();
  }
  function renderTut() {
    const touch = document.body.classList.contains('touch');
    const step = TUT[Math.min(tutIdx, TUT.length - 1)];
    $('tutVis').innerHTML = touch ? (step.touchKey ? step.touchKey() : `<span class="tut-btn">${Icons.svg(step.icon)}</span>`) : step.key();
    $('tutText').textContent = step.label;
    $('tutCount').textContent = '';
    $('tutDots').querySelectorAll('i').forEach((d, i) => { d.className = i < tutIdx ? 'on' : i === tutIdx ? 'cur' : ''; });
    document.querySelectorAll('.tut-focus').forEach(el => el.classList.remove('tut-focus'));
    if (touch && step.focus) document.querySelectorAll(step.focus).forEach(el => el.classList.add('tut-focus'));
  }
  function tutTick() {
    const run = Game.run;
    if (!run || !run.tut) return;
    const now = performance.now(), dt = (now - tutLast) / 1000; tutLast = now;
    if (tutWait > 0) { tutWait -= dt; if (tutWait <= 0) { $('tut').classList.remove('ok'); renderTut(); } return; }
    const step = TUT[tutIdx];
    if (!step) return;
    if (step.count) $('tutCount').textContent = step.count(run.tut);
    if (step.done(run.tut, dt)) {
      tutIdx++; Sfx.pickup();
      $('tut').classList.add('ok');
      $('tutDots').querySelectorAll('i').forEach((d, i) => { if (i < tutIdx) d.className = 'on'; });
      if (tutIdx >= TUT.length) {
        document.querySelectorAll('.tut-focus').forEach(el => el.classList.remove('tut-focus'));
        $('tut').classList.add('done');
        $('tutVis').innerHTML = `<span class="tut-btn go">${Icons.svg('check')}</span>`;
        $('tutText').textContent = 'READY! FIRST BATTLE';
        $('tutCount').textContent = '';
        setTimeout(endTutorial, 1300);
        return;
      }
      tutWait = 0.55;
    }
  }
  function endTutorial() {
    if (lastStart && lastStart.mode !== 'tutorial') return;
    $('tut').classList.add('hidden');
    document.querySelectorAll('.tut-focus').forEach(el => el.classList.remove('tut-focus'));
    Save.data.tutorialDone = true; Save.data.seenHelp = true; Save.save();
    Game.quit();
    const [r, s] = Save.nextStage();
    startStage(r, s);
  }

  function relaunch() { if (!lastStart) return; if (lastStart.mode === 'duel') { startDuel(lastStart.rival); return; } if (lastStart.mode === 'event') { startWinter(lastStart.i); return; } lastStart.mode === 'stage' ? startStage(lastStart.r, lastStart.s) : lastStart.mode === 'tutorial' ? startTutorial() : lastStart.mode === 'test' ? startTesting() : startEndless(); }

  // Testing ground: the tutorial island with a dummy that respawns; no waves, no rewards
  function startTesting() {
    lastStart = { mode: 'test' };
    closeModal(); show(null);
    Game.start({ mode: 'test' });
    hudCache = {};
    buildHud();
    setChip('wind', 'TESTING');
    $('waveDots').innerHTML = ''; $('chipSub').textContent = 'TRY YOUR ELEMENTS';
    $('tut').classList.add('hidden');
  }

  function fadeEmblem(e, el) {
    clearTimeout(e._fade);
    e.classList.add('em-out');
    e._fade = setTimeout(() => { e.style.setProperty('--c', colorOf(el)); e.innerHTML = elementIcon(el); e.classList.remove('em-out'); }, 160);
  }
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
      b.querySelector('.orb-icon').style.setProperty('--d', el.deep);
      b.querySelector('.orb-icon').innerHTML = Icons.svg(h.moves[i].mv.icon);
      b.title = h.moves[i].mv.name;
    });
    // desktop skill bar: the two element powers with name and hotkey
    document.querySelectorAll('.skill').forEach(sk => {
      const mv = h.moves[+sk.dataset.i].mv;
      sk.style.setProperty('--c', el.color);
      sk.style.setProperty('--d', el.deep);
      sk.querySelector('.sk-icon').innerHTML = Icons.svg(mv.icon);
      sk.querySelector('.sk-name').textContent = mv.name.toUpperCase();
    });
  }

  function tick() {
    if (current !== null) return;
    const h = Game.hud();
    if (!h) return;
    if (Game.mode === 'tutorial') tutTick();
    else if (!$('tut').classList.contains('hidden')) $('tut').classList.add('hidden');
    const set = (k, v, fn) => { if (hudCache[k] !== v) { hudCache[k] = v; fn(v); } };
    set('el', h.el + h.elIdx, () => refreshAbilities(h));
    const orbs = [document.querySelector('.orb-main'), document.querySelector('.orb-p1'), document.querySelector('.orb-p2')];
    h.moves.forEach((m, i) => {
      const p = m.left > 0 ? Math.round(m.left / m.full * 50) / 50 : 0;
      const num = i > 0 && m.left > 0.95 ? Math.ceil(m.left) : '';
      set('cd' + i, p + ':' + num, () => {
        orbs[i].style.setProperty('--p', p);
        orbs[i].classList.toggle('cooling', p > 0);
        orbs[i].querySelector('.cd-num').textContent = num;
        if (p === 0 && i > 0 && hudCache['was' + i]) { orbs[i].classList.remove('ready-flash'); void orbs[i].offsetWidth; orbs[i].classList.add('ready-flash'); }
        const sk = i > 0 && document.querySelector(`.skill[data-i="${i}"]`);
        if (sk) {
          sk.style.setProperty('--p', p);
          sk.classList.toggle('cooling', p > 0);
          if (p === 0 && hudCache['was' + i]) { sk.classList.remove('ready-flash'); void sk.offsetWidth; sk.classList.add('ready-flash'); }
        }
        hudCache['was' + i] = p > 0;
      });
    });
    h.moves.forEach((m, i) => {
      if (!i) return;
      const t = m.left > 0.05 ? (m.left >= 1 ? Math.ceil(m.left) : m.left.toFixed(1)) : '';
      set('skt' + i, t, v => { document.querySelector(`.skill[data-i="${i}"] .sk-cd`).textContent = v; });
    });
    if (Game.mode === 'stage') {
      set('wave', h.wave + ':' + h.waves + ':' + h.left, () => {
        $('waveDots').innerHTML = Array.from({ length: h.waves }, (_, i) => `<i class="${i < h.wave || (i === h.wave && h.left === 0) ? 'done' : i === h.wave ? 'now' : ''}"></i>`).join('');
        $('chipSub').textContent = `${h.left} FOE${h.left === 1 ? '' : 'S'} REMAIN`;
      });
    } else if (Game.mode === 'endless') {
      set('endless', h.kills, k => { $('waveDots').innerHTML = ''; $('chipSub').textContent = `${k} DEFEATED · BEST ${Save.data.endlessBest}`; });
    }
    else if (Game.mode === 'event' && h.obj) {
      const o = h.obj;
      const txt = o.kind === 'gifts' ? `PRESENTS ${o.cur}/${o.max}`
        : o.kind === 'snowman' ? `SNOWMAN ${Math.ceil(o.hp * 100)}% · ${Math.floor(o.left / 60)}:${String(Math.ceil(o.left) % 60).padStart(2, '0')}`
        : o.kind === 'tut' ? 'HOW-TO' : `${h.left} FOE${h.left === 1 ? '' : 'S'} REMAIN`;
      set('evobj', txt + ':' + h.wave + ':' + h.waves, () => {
        $('waveDots').innerHTML = (o.kind === 'brawl' || o.kind === 'boss') ? Array.from({ length: h.waves }, (_, i) => `<i class="${i < h.wave || (i === h.wave && h.left === 0) ? 'done' : i === h.wave ? 'now' : ''}"></i>`).join('') : '';
        $('chipSub').textContent = txt;
        $('stageChip').classList.toggle('wf-urgent', o.kind === 'snowman' && o.hp < 0.3);
      });
    }
    const bb = $('bossBar');
    if (h.boss) {
      if (bb.classList.contains('hidden')) {
        bb.classList.remove('hidden');
        $('bossName').textContent = h.boss.name.toUpperCase();
        $('bossTitle').textContent = h.boss.title.toUpperCase();
        const em = $('bossEmblem'); em.style.setProperty('--c', colorOf(h.boss.el)); em.innerHTML = elementIcon(h.boss.el);
        hudCache.rivalEl = h.boss.el;
      }
      // Arena: the emblems show the opponent's equipped element and fade when it swaps
      if (Game.mode === 'duel') set('rivalEl', h.boss.el, el => { fadeEmblem($('chipEmblem'), el); fadeEmblem($('bossEmblem'), el); });
      set('boss', Math.round(h.boss.ratio * 300), () => { $('bossFill').style.width = h.boss.ratio * 100 + '%'; });
    } else if (!bb.classList.contains('hidden')) bb.classList.add('hidden');
  }

  function onCombo(n) {
    const c = $('combo');
    if (n < 3) { c.classList.add('hidden'); return; }
    c.classList.remove('hidden');
    // sit just under the stage chip, whatever its size on this screen
    const chip = $('stageChip');
    c.style.top = (chip.offsetTop + chip.offsetHeight + 6) + 'px';
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
      const max = base.offsetWidth * 0.45 || 54, l = Math.hypot(dx, dy);
      if (l > max) { dx = dx / l * max; dy = dy / l * max; }
      knob.style.left = (ox - r.left + dx) + 'px'; knob.style.top = (oy - r.top + dy) + 'px';
      Game.setJoy(Math.abs(dx) > max * 0.18 ? clamp(dx / (max * 0.78), -1, 1) : 0);
      // drop-through needs a deliberate, mostly vertical pull
      if (dy > max * 0.85 && Math.abs(dx) < max * 0.45 && !dropped) { dropped = true; Game.press('drop'); }
      if (dy < 20) dropped = false;
    });
    const end = e => { if (e.pointerId !== jp) return; jp = null; joy.classList.remove('on'); Game.setJoy(0); for (const el of [base, knob]) { el.style.left = ''; el.style.top = ''; } };
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
    // no interstitials while someone is still learning the game (first three stages)
    Icons.hydrate();
    applyUiScale();
    loadKeyLayout();
    if (matchMedia('(pointer: coarse)').matches || /mobile|tablet/.test(Platform.device())) document.body.classList.add('touch');
    $('btnPlay').onclick = () => { Sfx.ensure(); Sfx.click(); if (!Save.data.tutorialDone) { startTutorial(); return; } const [r, s] = Save.nextStage(); Platform.maybeMidgame(() => startStage(r, s)); };
    $('btnEndless').onclick = () => { Sfx.ensure(); Sfx.click(); Platform.maybeMidgame(() => startEndless()); };
    $('btnArena').onclick = () => { Sfx.ensure(); Sfx.click(); openArena(); };
    document.querySelectorAll('[data-hub]').forEach(b => b.onclick = () => { Sfx.ensure(); Sfx.click(); openHub(b.dataset.hub); });
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
      Sfx.ensure(); Sfx.click();
      const k = b.dataset.open;
      if (k === 'settings') openSettings(false);
      else if (k === 'loadout') openLoadout();
      else if (k === 'stages') openMap();
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
    Game.hooks.onRound = r => {
      $('chipSub').textContent = roundText(r);
      if (r.over) banner(r.won ? 'ROUND WON' : 'ROUND LOST', r.won ? '' : 'boss');
      else { hudCache = {}; buildHud(); banner(r.n === 3 ? 'FINAL ROUND' : `ROUND ${r.n}`); }
    };
    Game.hooks.onCombo = n => { onCombo(n); if (Game.mode === 'stage' || Game.mode === 'endless' || Game.mode === 'duel' || Game.mode === 'event') Meta.track('combo', n); };
    Game.hooks.onRhythm = (mv, o = {}) => Rhythm.start(mv, pct => Game.endRhythm(pct, o.owner), o);
    Game.hooks.onBoss = e => banner(e.ai.boss.name.toUpperCase(), 'boss');
    Game.hooks.onToast = (t, big) => (big ? banner(t.toUpperCase()) : toast(t.toUpperCase()));
    Game.hooks.onWave = (i, n, boss) => { if (!boss && (Game.mode === 'stage' || Game.mode === 'event') && i > 0) banner(i === n - 1 ? 'FINAL WAVE' : `WAVE ${i + 1}`); };
    Game.hooks.onKill = (e, ringout) => {
      const m = Game.mode;
      if (ringout && m !== 'duel') toast('RING OUT! +2');
      if (m !== 'stage' && m !== 'endless' && m !== 'duel' && m !== 'event') return;   // training and testing never count
      Meta.track('kills');
      if (ringout) Meta.track('ringouts');
      if (m === 'endless') Meta.track('endlessKills');
      const h = Game.hud(); if (h) Meta.track('elKills', 1, { el: h.el });
    };
    Game.hooks.onEventCard = (key, go) => eventCard(key, go);
    Game.hooks.onGift = () => Meta.track('gifts');
    Game.hooks.onEventKill = () => Meta.track('evKills');
    Game.hooks.onItemUsed = () => {};
    Meta.onNotify(text => toast(text));

    Platform.onAuth(() => { Save.load(); applySettings(); if (current === 'home') refreshHome(); });

    applySettings();
    Game.idleScene(0);
    show('home');
    // a new player goes straight into the tutorial once loading has stopped (main.js calls
    // loadingStop before UI.init), and gameplayStart is sent as the tutorial starts
    if (!Save.data.tutorialDone) startTutorial();
    TitleFx.init();
    checkRotate();
  }

  // menus and HUD scale up on large screens (1280x760 is the design size)
  function applyUiScale() {
    const k = clamp(Math.min(innerWidth / 1280, innerHeight / 760), 1, 1.75);
    document.documentElement.style.setProperty('--ui', k.toFixed(3));
    homeShift();
    syncBanner();
  }

  // the home menu is a column on the left, so frame the arena in the space to its right
  function homeShift() {
    const panel = document.querySelector('.home-panel');
    const w = current === 'home' && innerWidth > 600 ? panel.getBoundingClientRect().width : 0;
    Game.setShift(w * 0.5);
  }

  function openPrivacy(fromPause) {
    modal(`
      <h2>PRIVACY &amp; TERMS</h2>
      <div class="legal">
        <p>Element Rag saves your progress (stars, gems, unlocked elements, upgrades and settings) so you can continue later. On CrazyGames it is stored with the CrazyGames SDK, linked to your CrazyGames account if you are logged in; elsewhere it stays in this browser.</p>
        <p>Quests, events and Arena trophies are part of that same save. There is no chat, and nothing about you is shown to other players.</p>
        <p>If the CrazyGames leaderboard is active and you are logged in, your Arena trophy count (one number) is sent to it and shown with your CrazyGames username. Nothing else is sent.</p>
        <p>On CrazyGames the game shows ads served by CrazyGames: a short ad now and then before a match or stage and optional ads you can choose to watch for a bonus. The game itself does not ask for or collect any other personal information and has no purchases.</p>
        <p>Playing on CrazyGames is covered by the CrazyGames <a href="https://www.crazygames.com/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="https://www.crazygames.com/terms-and-conditions" target="_blank" rel="noopener">Terms and Conditions</a>.</p>
      </div>
      <div class="actions"><button class="btn primary" id="prBack"><b>BACK</b></button></div>`, s => {
      s.querySelector('#prBack').onclick = () => { Sfx.click(); openSettings(fromPause); };
    });
  }

  function toMenu() { Sfx.click(); closeModal(); Game.quit(); Game.idleScene(0); show('home'); }
  function toWinterMap() { Sfx.click(); closeModal(); Game.quit(); mapMode = Meta.winterLive() ? 'event' : 'chapters'; openMap(); if (mapMode === 'event') Game.idleScene(WINTER_REALM); }
  function showWinterResult(res, tiles, reward, adRow, offers, bindAds) {
    const i = res.evI, w = WINTER_STAGES[i], M = WINTER_MODES[w.mode];
    const hasNext = i + 1 < WINTER_COUNT;
    if (res.won) {
      Meta.track('evStages');
      if (w.mode === 'snowman') Meta.track('snowman');
      const hat = res.hat ? HAT_BY_ID[res.hat] : null;
      modal(`
        <h2 class="win">${res.tutorial ? 'READY FOR WINTERFEST!' : w.mode === 'boss' ? (i === WINTER_COUNT - 1 ? 'WINTERFEST SAVED!' : 'BOSS DEFEATED!') : 'STAGE CLEARED!'}</h2>
        <div class="result-content">
          <div class="big-stars">${[1, 2, 3].map(k => `<span class="ic${k <= res.stars ? ' on' : ''}" data-icon="star"></span>`).join('')}</div>
          <p class="sub">WINTERFEST · ${winterLabel(i)} · ${M.name.toUpperCase()}</p>
          ${tiles}${reward}${adRow}
          ${hat ? `<div class="unlock wf-unlock" style="--c:#7fe0ff">${hatThumb(hat.id, 56)}<div><small>EXCLUSIVE HAT UNLOCKED</small><b>${hat.name.toUpperCase()}</b><p>Wear it from the Shop's Accessories tab.</p></div><button class="btn small primary" id="rWear"><b>WEAR IT</b></button></div>` : ''}
        </div>
        ${hasNext
          ? resultActions('<button class="btn" id="rMenu"><b>MENU</b></button><button class="btn" id="rRetry"><b>RETRY</b></button>', '<button class="btn primary" id="rNext"><b>NEXT</b></button>', offers)
          : resultActions('<button class="btn" id="rMenu"><b>MENU</b></button>', '<button class="btn primary" id="rRetry"><b>RETRY</b></button>', offers)}`, sh => {
        bindAds(sh); drawHatThumbs(sh);
        sh.querySelector('#rMenu').onclick = toWinterMap;
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startWinter(i)); };
        const nb = sh.querySelector('#rNext'); if (nb) nb.onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startWinter(i + 1)); };
        const wr = sh.querySelector('#rWear'); if (wr) wr.onclick = () => { Sfx.click(); Cosmetics.equip('hat', hat.id); wr.disabled = true; wr.querySelector('b').textContent = 'WORN'; };
      }, 'result');
    } else {
      modal(`
        <h2 class="lose">${res.reason === 'snowman' || (w.mode === 'snowman' && !res.won) ? 'THE SNOWMAN FELL' : 'DEFEATED'}</h2>
        <div class="result-content">
          <p class="sub">WINTERFEST · ${winterLabel(i)} · ${M.name.toUpperCase()}</p>
          ${tiles}${reward}${adRow}
          <p class="tip">${w.mode === 'snowman' ? 'Stand between the snowman and the Kramplings, and knock them off its island.' : w.mode === 'gifts' ? 'Presents glow and gold arrows point to the ones off screen. Kramplings sometimes drop them too.' : pick(TIPS)}</p>
        </div>
        ${resultActions('<button class="btn" id="rMenu"><b>MENU</b></button>', '<button class="btn primary" id="rRetry"><b>RETRY</b></button>', offers)}`, sh => {
        bindAds(sh);
        sh.querySelector('#rMenu').onclick = toWinterMap;
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startWinter(i)); };
      }, 'result');
    }
  }

  function checkRotate() {
    const portrait = window.innerHeight > window.innerWidth * 1.1 && document.body.classList.contains('touch');
    $('rotate').classList.toggle('hidden', !portrait || rotateDismissed);
  }

  return {
    init, tick, show, openPause, resume, toast, checkRotate, applyUiScale, modalOpen, closeModal, startStage,
    get screen() { return current; },
  };
})();
