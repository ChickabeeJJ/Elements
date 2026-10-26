'use strict';
/* =========================================================================
   UI (flat style): home, campaign, battle prep, elements, upgrades,
   settings/pause/results, the battle HUD and touch controls.
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

  const chip = (id, cls = '') => `<span class="chip ${cls}" style="--c:${(ELEMENT_BY_ID[id] || NEUTRAL).color}">${elementIcon(id)}</span>`;
  const elName = id => (ELEMENT_BY_ID[id] || NEUTRAL).name.toUpperCase();
  const KEYS = ['LMB', 'Q', 'E'];
  const TIPS = [
    'Knock foes off the islands for an instant ring-out. Hurt foes fly further.',
    'Hitting an elemental weakness deals 160% damage.',
    'A "!" over an enemy means an attack is coming. Jump or dash away.',
    'Double jump to recover if you get knocked off an edge.',
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

  function slotLines(ids, active = -1) {
    return ids.map((id, i) => `<div class="slot-line${i === active ? ' on' : ''}" data-i="${i}"><span class="radio${i === active ? ' on' : ''}"></span><span class="num">${i + 1}</span>${chip(id)}<span class="name">${elName(id)}</span></div>`).join('');
  }

  function refreshHome() {
    const [r, s] = Save.nextStage();
    const all = Object.keys(Save.data.stars).length >= TOTAL_STAGES;
    $('playSub').textContent = all ? 'ALL CLEAR' : `STAGE ${stageLabel(r, s)} · ${REALMS[r].name.toUpperCase()}`;
    $('endlessSub').textContent = 'BEST ' + Save.data.endlessBest;
    $('homeStars').textContent = Save.totalStars() + '/' + TOTAL_STAGES * 3;
    $('homeKills').textContent = fmt(Save.data.stats.kills || 0);
    $('homeElems').textContent = Save.unlockedElements().length + '/' + ELEMENTS.length;
    const cheapest = Math.min(...UPGRADES.map(u => Save.upgradeCost(u.id) ?? Infinity));
    $('homeForge').textContent = cheapest <= Save.data.essence ? 'READY' : ' ';
    $('homeLoadout').innerHTML = `<span class="lbl">LOADOUT</span>${slotLines(Save.loadout(), 0)}`;
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
      b.className = 'tab' + (i === mapRealm ? ' active' : '') + (open ? '' : ' locked');
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
    $('realmLine').innerHTML = `<h3>${realm.name.toUpperCase()}</h3>
      <span class="grp">${chip(realm.element)} ${elName(realm.element)} WARRIORS</span>
      <span class="grp">WEAK TO ${aff.weak.map(w => chip(w)).join('')}</span>
      <span class="grp"><span class="ic star" data-icon="star"></span> ${stars}/${STAGES_PER_REALM * 3}</span>`;
    const [nr, ns] = Save.nextStage();
    const row = $('stageRow');
    row.innerHTML = '';
    for (let s = 0; s < STAGES_PER_REALM; s++) {
      const open = Save.stageOpen(mapRealm, s);
      const st = Save.data.stars[stageKey(mapRealm, s)] || 0;
      const boss = s === STAGES_PER_REALM - 1;
      const unlock = elementUnlockedBy(mapRealm, s);
      const cur = mapRealm === nr && s === ns && !st;
      const el = document.createElement('button');
      el.className = 'stage' + (boss ? ' boss' : '') + (!open ? ' locked' : st ? ' done' : cur ? ' current' : '');
      el.innerHTML = `<span class="block">${open ? (boss ? '<span class="ic" data-icon="skull"></span>' : s + 1) : '<span class="ic" data-icon="lock"></span>'}${unlock && !st ? `<span class="tag" style="--c:${unlock.color}" title="Unlocks ${unlock.name}">${elementIcon(unlock.id)}</span>` : ''}</span>
        <span class="stars">${[1, 2, 3].map(k => `<span class="ic${k <= st ? ' on' : ''}" data-icon="star"></span>`).join('')}</span>
        <small>${boss ? realm.boss.name.toUpperCase() : 'STAGE ' + stageLabel(mapRealm, s)}</small>`;
      el.onclick = () => {
        if (!open) { Sfx.denied(); toast('CLEAR THE PREVIOUS STAGE FIRST'); return; }
        Sfx.click(); openPrep({ mode: 'stage', r: mapRealm, s });
      };
      row.appendChild(el);
    }
    Icons.hydrate(tabs); Icons.hydrate($('realmLine')); Icons.hydrate(row);
  }

  /* ------------------------------------------------------- battle prep */
  function openPrep(opts) {
    let sel = Save.loadout().slice();
    const realm = opts.mode === 'stage' ? REALMS[opts.r] : null;
    const aff = realm ? AFFINITY[realm.element] : null;
    const draw = () => {
      const boss = opts.mode === 'stage' && opts.s === STAGES_PER_REALM - 1;
      const title = opts.mode === 'stage' ? `STAGE ${stageLabel(opts.r, opts.s)}` : 'ENDLESS';
      const foe = realm
        ? `<div class="foe">${chip(realm.element)}<div><b>${boss ? realm.boss.name.toUpperCase() : elName(realm.element) + ' WARRIORS'}</b><small>Weak to ${aff.weak.map(w => ELEMENT_BY_ID[w].name).join(' and ')}</small></div></div>`
        : `<div class="foe">${chip('none')}<div><b>ENDLESS WAVES</b><small>Every realm, ever harder. Best ${Save.data.endlessBest}</small></div></div>`;
      modal(`
        <button class="x" id="prepX" aria-label="Close"><span class="ic" data-icon="close"></span></button>
        <h2>${title}</h2>
        <div class="prep">
          <div class="prep-col">
            ${foe}
            <p class="prep-h">LOADOUT · UP TO 3</p>
            <div class="loadout">${[0, 1, 2].map(i => sel[i]
              ? `<div class="slot-line"><span class="num">${i + 1}</span>${chip(sel[i])}<span class="name">${elName(sel[i])}</span></div>`
              : `<div class="slot-line empty"><span class="num">${i + 1}</span><span class="ph"></span><span class="name">EMPTY</span></div>`).join('')}</div>
          </div>
          <div class="prep-col">
            <p class="prep-h">ELEMENTS</p>
            <div class="picker">${ELEMENTS.map(e => {
              const open = Save.elementOpen(e.id);
              const good = aff && aff.weak.includes(e.id) && open;
              return `<button class="pick${sel.includes(e.id) ? ' on' : ''}${open ? '' : ' locked'}" data-el="${e.id}">${good ? '<span class="badge">STRONG</span>' : ''}${chip(e.id, open ? '' : 'locked')}<span>${open ? e.name.toUpperCase() : '???'}</span></button>`;
            }).join('')}</div>
          </div>
        </div>
        <div class="actions"><button class="btn go big" id="prepGo"><b>FIGHT</b></button></div>`, sh => {
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
        sh.querySelector('#prepX').onclick = () => { Sfx.click(); closeModal(); };
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
    list.innerHTML = '';
    for (const e of ELEMENTS) {
      const open = Save.elementOpen(e.id);
      const b = document.createElement('button');
      b.className = 'el-row' + (e.id === codexSel ? ' active' : '');
      b.innerHTML = `${chip(e.id, open ? '' : 'locked')}<span>${open ? e.name.toUpperCase() : '???'}</span>`;
      b.onclick = () => { Sfx.click(); codexSel = e.id; renderCodex(); };
      list.appendChild(b);
    }
    $('codexCount').textContent = Save.unlockedElements().length + '/' + ELEMENTS.length;
    const e = ELEMENT_BY_ID[codexSel];
    const open = Save.elementOpen(e.id);
    if (open) Game.setPreviewElement(e.id);
    const det = $('codexDetail');
    det.innerHTML = `
      <div class="cd-head">${chip(e.id, open ? '' : 'locked')}<div><h3>${open ? e.name.toUpperCase() : 'LOCKED'}</h3><p>${open ? e.blurb : 'Clear stage ' + stageLabel(e.unlock[0], e.unlock[1]) + ' to unlock.'}</p></div></div>
      <div class="moves">${e.moves.map((mv, i) => `
        <div class="move"${open ? '' : ' style="opacity:.5"'}>
          <span class="move-ic" style="--c:${e.color}"><span class="ic" data-icon="${mv.icon}"></span></span>
          <div><h4>${mv.name.toUpperCase()} <span class="tagx">${i === 0 ? 'MAIN' : 'POWER'}</span>${mv.type === 'melee' ? '<span class="tagx melee">MELEE</span>' : mv.type === 'ranged' ? '<span class="tagx ranged">RANGED</span>' : ''}</h4><p>${mv.desc}</p></div>
          <div class="num">${mv.dmg ? `<span>${mv.dmg}${mv.count ? '×' + mv.count : ''} DMG</span>` : '<span>&nbsp;</span>'}<span>${mv.cd}S</span><kbd>${KEYS[i]}</kbd></div>
        </div>`).join('')}</div>`;
    Icons.hydrate(det);
  }

  /* -------------------------------------------------------------- forge */
  function openForge() { show('forge'); renderForge(); }
  function renderForge() {
    const list = $('forgeList');
    list.innerHTML = '';
    for (const u of UPGRADES) {
      const lv = Save.data.upgrades[u.id];
      const cost = Save.upgradeCost(u.id);
      const row = document.createElement('div');
      row.className = 'up';
      row.style.setProperty('--c', u.color);
      const b = document.createElement('button');
      if (cost == null) { b.className = 'cost max'; b.textContent = 'MAX'; b.disabled = true; }
      else {
        b.className = 'cost' + (Save.data.essence >= cost ? '' : ' poor');
        b.innerHTML = `<span class="ic" data-icon="gem"></span>${cost}`;
        b.onclick = () => {
          if (Save.buy(u.id)) { Sfx.pickup(); renderForge(); show('forge'); }
          else { Sfx.denied(); toast('NOT ENOUGH ESSENCE'); }
        };
      }
      row.appendChild(b);
      row.insertAdjacentHTML('beforeend', `<div class="what">${u.name.toUpperCase()} ${u.desc.split(' ')[0].toUpperCase()}<small>${u.desc}</small></div>
        <div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>`);
      list.appendChild(row);
    }
    Icons.hydrate(list);
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
    const rows = [['sfx', 'SOUND'], ['music', 'MUSIC'], ['shake', 'SHAKING'], ['numbers', 'NUMBERS']];
    modal(`
      <button class="x" id="setX" aria-label="Close"><span class="ic" data-icon="close"></span></button>
      <h2>SETTINGS</h2>
      <div class="toggles">${rows.map(([k, label]) => `<button class="toggle${st[k] ? ' on' : ''}" data-k="${k}">${label}<span class="sw"></span></button>`).join('')}</div>
      <div class="keys">
        <span><kbd>A</kbd><kbd>D</kbd></span><span>Move, <kbd>S</kbd> to drop through</span>
        <span><kbd>W</kbd><kbd>SPACE</kbd></span><span>Jump, again in the air</span>
        <span><kbd>LMB</kbd></span><span>Main attack toward the cursor</span>
        <span><kbd>Q</kbd><kbd>E</kbd></span><span>Element powers</span>
        <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span><span>Swap element</span>
      </div>
      <div class="actions">
        ${fromPause ? '<button class="btn" id="setBack"><b>BACK</b></button>' : '<button class="btn" id="setBack"><b>DONE</b></button>'}
      </div>
      <button class="link-danger" id="setReset">RESET PROGRESS</button>`, s => {
      s.querySelectorAll('.toggle').forEach(t => t.onclick = () => {
        const k = t.dataset.k;
        st[k] = !st[k];
        t.classList.toggle('on', st[k]);
        applySettings(); Save.save(); Sfx.click();
      });
      const back = () => { Sfx.click(); fromPause ? openPause() : closeModal(); };
      s.querySelector('#setX').onclick = back;
      s.querySelector('#setBack').onclick = back;
      s.querySelector('#setReset').onclick = () => confirmReset(fromPause);
    });
  }

  function confirmReset(fromPause) {
    modal(`<h2 class="lose">RESET PROGRESS?</h2><p class="tip">Stars, essence, upgrades and elements will be erased.</p>
      <div class="actions"><button class="btn" id="rsNo"><b>CANCEL</b></button><button class="btn dark" id="rsYes"><b>ERASE</b></button></div>`, s => {
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
      <div class="actions"><button class="btn big" id="pResume"><b>CONTINUE</b></button></div>
      <div class="actions">
        <button class="btn dark" id="pRestart"><b>RESTART</b></button>
        <button class="btn dark" id="pSettings"><b>SETTINGS</b></button>
        <button class="btn dark" id="pQuit"><b>MENU</b></button>
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
    const tiles = `<div class="stat-tiles"><div><b>${res.kills}</b><small>KILLS</small></div><div><b>${res.ringouts}</b><small>RING OUTS</small></div><div><b>${res.bestCombo}</b><small>BEST COMBO</small></div></div>`;
    const reward = `<div class="payout"><span class="ic" data-icon="gem"></span>+${res.essence}${res.bonus ? `<small>INCL. ${res.bonus} CLEAR BONUS</small>` : ''}</div>`;
    if (res.mode === 'endless') {
      modal(`
        <h2 class="${res.best ? 'win' : ''}">${res.best ? 'NEW RECORD!' : 'RUN OVER'}</h2>
        <p class="sub">${res.kills} DEFEATED · BEST ${res.bestKills}</p>
        ${tiles}${reward}
        <div class="actions"><button class="btn dark" id="rMenu"><b>MENU</b></button><button class="btn go" id="rAgain"><b>AGAIN</b></button></div>`, s => {
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
        ${u ? `<div class="unlock" style="--c:${u.color}">${chip(u.id)}<div><small>NEW ELEMENT UNLOCKED</small><b>${u.name.toUpperCase()}</b><p>${u.blurb}</p></div></div>` : ''}
        ${boss && res.firstClear && hasNext ? `<p class="sub">${REALMS[nextR].name.toUpperCase()} IS NOW OPEN</p>` : ''}
        <div class="actions">
          <button class="btn dark" id="rMap"><b>MAP</b></button>
          <button class="btn dark" id="rRetry"><b>RETRY</b></button>
          ${hasNext ? '<button class="btn go" id="rNext"><b>NEXT</b></button>' : ''}
        </div>`, sh => {
        if (u) { Sfx.unlock(); Platform.happytime(); const l = Save.loadout(); if (l.length < 3 && !l.includes(u.id)) Save.setLoadout(l.concat(u.id)); }
        sh.querySelector('#rMap').onclick = () => { Sfx.click(); closeModal(); openMap(hasNext && boss ? nextR : r); };
        sh.querySelector('#rRetry').onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => startStage(r, s)); };
        const nb = sh.querySelector('#rNext');
        if (nb) nb.onclick = () => { Sfx.click(); closeModal(); Platform.maybeMidgame(() => { openMap(nextR); openPrep({ mode: 'stage', r: nextR, s: nextS }); }); };
      }, 'result');
    } else {
      modal(`
        <h2 class="lose">DEFEATED</h2>
        <p class="sub">${REALMS[r].name.toUpperCase()} · STAGE ${stageLabel(r, s)}</p>
        ${tiles}${reward}
        <p class="tip">${pick(TIPS)}</p>
        <div class="actions">
          <button class="btn dark" id="rMap"><b>MAP</b></button>
          <button class="btn dark" id="rForge"><b>UPGRADES</b></button>
          <button class="btn go" id="rRetry"><b>RETRY</b></button>
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
    $('hudStage').textContent = `${REALMS[r].name.toUpperCase()} · ${stageLabel(r, s)}`;
    banner(s === STAGES_PER_REALM - 1 ? 'BOSS STAGE' : `STAGE ${stageLabel(r, s)}`, s === STAGES_PER_REALM - 1 ? 'boss' : '');
    maybeCoach();
  }
  function startEndless() {
    lastStart = { mode: 'endless' };
    closeModal(); show(null);
    Game.start({ mode: 'endless' });
    hudCache = {};
    buildHud();
    $('hudStage').textContent = 'ENDLESS';
    banner('ENDLESS');
    maybeCoach();
  }
  function relaunch() { if (lastStart) lastStart.mode === 'stage' ? startStage(lastStart.r, lastStart.s) : startEndless(); }

  /* --------------------------------------------------------------- HUD */
  function buildHud() {
    const h = Game.hud();
    const bar = $('loadoutBar');
    bar.innerHTML = slotLines(h.loadout, h.elIdx);
    bar.querySelectorAll('.slot-line').forEach(l => l.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      if (Game.selectSlot(+l.dataset.i)) Sfx.click();
    }));
    refreshAbilities(h);
  }

  function refreshAbilities(h) {
    const el = ELEMENT_BY_ID[h.el];
    $('loadoutBar').querySelectorAll('.slot-line').forEach(l => {
      const on = +l.dataset.i === h.elIdx;
      l.classList.toggle('on', on);
      l.querySelector('.radio').classList.toggle('on', on);
    });
    const btns = [document.querySelector('.ab-main'), document.querySelector('.ab-p1'), document.querySelector('.ab-p2')];
    btns.forEach((b, i) => {
      const mv = h.moves[i].mv;
      b.style.setProperty('--c', el.color);
      b.querySelector('.ab-icon').innerHTML = Icons.svg(mv.icon);
      b.querySelector('.ab-name').textContent = mv.name.toUpperCase();
      b.querySelector('.ab-sub').textContent = KEYS[i];
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
    set('kills', h.kills, v => { $('hudKills').textContent = v; });
    const st = h.status;
    const sk = ['burn', 'freeze', 'chill', 'soak', 'root', 'shock'].filter(k => st[k] > 0).join(',');
    set('status', sk, v => {
      const map = { burn: 'fire', freeze: 'frost', chill: 'frost', soak: 'water', root: 'nature', shock: 'lightning' };
      $('statusRow').innerHTML = v ? v.split(',').map(k => `<span style="color:${AURA[map[k]]}">${elementIcon(map[k])}</span>`).join('') : '';
    });
    const btns = [document.querySelector('.ab-main'), document.querySelector('.ab-p1'), document.querySelector('.ab-p2')];
    h.moves.forEach((m, i) => {
      const p = m.left > 0 ? Math.round(m.left / m.full * 100) : 0;
      const label = m.left > 0.95 ? Math.ceil(m.left) + 'S' : KEYS[i];
      set('cd' + i, p + label, () => {
        btns[i].style.setProperty('--p', p + '%');
        btns[i].classList.toggle('cooling', p > 0);
        btns[i].querySelector('.ab-sub').textContent = document.body.classList.contains('touch') && !(m.left > 0.95) ? '' : label;
        if (p === 0 && i > 0 && hudCache['was' + i]) { btns[i].classList.remove('ready-flash'); void btns[i].offsetWidth; btns[i].classList.add('ready-flash'); }
        hudCache['was' + i] = p > 0;
      });
    });
    if (Game.mode === 'stage') {
      set('wave', h.wave + ':' + h.waves + ':' + h.left, () => { $('waveText').textContent = `WAVE ${Math.max(1, h.wave + 1)}/${h.waves}`; $('leftText').textContent = `${h.left} LEFT`; });
    } else {
      set('endless', h.kills, k => { $('waveText').textContent = `${k} DEFEATED`; $('leftText').textContent = `BEST ${Save.data.endlessBest}`; });
    }
    const bb = $('bossBar');
    if (h.boss) {
      if (bb.classList.contains('hidden')) {
        bb.classList.remove('hidden');
        $('bossName').textContent = h.boss.name.toUpperCase();
        $('bossTitle').textContent = h.boss.title.toUpperCase();
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
      ? ['DRAG ON THE LEFT TO MOVE · TAP A BUTTON TO ATTACK', 'THE SMALLER BUTTONS ARE YOUR ELEMENT POWERS', 'KNOCK FOES OFF THE ISLANDS FOR A RING OUT!']
      : ['A / D TO MOVE · SPACE TO JUMP · CLICK TO ATTACK', 'Q / E FOR POWERS · 1 2 3 TO SWAP ELEMENT', 'KNOCK FOES OFF THE ISLANDS FOR A RING OUT!'];
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
