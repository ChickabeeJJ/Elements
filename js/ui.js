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
    for (const id of ['home', 'map', 'codex', 'forge']) $(id).classList.toggle('hidden', id !== name);
    $('hud').classList.toggle('hidden', name !== null);
    document.body.classList.toggle('playing', name === null);
    if (name === 'home') { Sfx.setMusicPaused(true); refreshHome(); }
    else if (name === null) Sfx.setMusicPaused(false);
    homeShift();
    if (name) Platform.gameplayStop();
    document.querySelectorAll('.essence-val').forEach(el => { el.textContent = fmt(Save.data.essence); });
  }

  function refreshHome() {
    applyAccentTheme();
    const [r, s] = Save.nextStage();
    const all = Object.keys(Save.data.stars).length >= TOTAL_STAGES;
    $('playSub').textContent = all ? 'ALL STAGES CLEAR' : `STAGE ${stageLabel(r, s)} · ${REALMS[r].name.toUpperCase()}`;
    $('endlessSub').textContent = 'BEST ' + Save.data.endlessBest;
    $('homeStars').textContent = Save.totalStars() + '/' + TOTAL_STAGES * 3;
    const cheapest = Math.min(...UPGRADES.map(u => Save.upgradeCost(u.id) ?? Infinity));
    $('homeForge').classList.toggle('hidden', !(cheapest <= Save.data.essence));
    $('homeLoadout').innerHTML = `<span class="lbl">YOUR ELEMENTS</span><div class="row">${Save.loadout().map(id => hex(id)).join('')}<button class="btn small" id="homeChange"><b>CHANGE</b></button></div>`;
    $('homeChange').onclick = () => { Sfx.ensure(); Sfx.click(); openLoadout(); };
    refreshUser();
    setTimeout(() => { if (current === 'home') Platform.showBanner('cgBanner'); }, 300);
  }

  function refreshUser() {
    const chip = $('userChip');
    if (!Platform.accountsAvailable) { chip.classList.add('hidden'); return; }
    chip.classList.remove('hidden');
    const user = Platform.user;
    chip.innerHTML = user ? `${user.profilePictureUrl ? `<img src="${user.profilePictureUrl}" alt="">` : ''}<b>${String(user.username || 'PLAYER').toUpperCase().slice(0, 16)}</b>` : '<b>LOG IN TO SAVE</b>';
    chip.onclick = user ? null : async () => { Sfx.click(); await Platform.login(); };
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
    const act = tabs.querySelector('.active');
    if (act) tabs.scrollLeft = act.offsetLeft - (tabs.clientWidth - act.offsetWidth) / 2;
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
      el.style.setProperty('--c', realm.tint);
      el.innerHTML = `<span class="n">${open ? (boss ? '<span class="ic" data-icon="crown"></span>' : s + 1) : '<span class="ic" data-icon="lock"></span>'}</span>
        <span class="stars">${[1, 2, 3].map(k => `<span class="ic${k <= st ? ' on' : ''}" data-icon="star"></span>`).join('')}</span>
        <small>${boss ? 'BOSS' : '<span class="st-word">STAGE </span>' + stageLabel(mapRealm, s)}</small>
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
    let sel = Save.loadout().slice(), drawn = false;
    const draw = () => {
      const keep = drawn; drawn = true;
      applyAccentTheme(sel[0] || Save.loadout()[0]);
      modal(`
        <button type="button" class="round sheet-back" id="loBack" aria-label="Back"><span class="ic" data-icon="back"></span></button>
        <h2>YOUR ELEMENTS</h2>
        <div class="lo-slots">${[0, 1, 2].map(i => `<button type="button" class="lo-slot" data-slot="${i}" aria-label="${sel[i] ? `Remove ${NAME(sel[i])} from slot ${i + 1}` : `Slot ${i + 1} empty`}" ${sel[i] ? '' : 'disabled'}>${sel[i] ? hex(sel[i]) : '<span class="empty"></span>'}<small>${sel[i] ? `${i + 1} · ${NAME(sel[i])}` : `${i + 1} · EMPTY`}</small></button>`).join('')}</div>
        <p class="hint">Pick up to three. You can swap between them in battle with 1, 2 and 3.</p>
        <div class="picker">${ELEMENTS.map(e => {
          const open = Save.elementOpen(e.id);
          return `<button class="pick${sel.includes(e.id) ? ' on' : ''}${open ? '' : ' locked'}" data-el="${e.id}" style="--c:${e.color}">${hex(e.id, open ? '' : 'locked')}<span>${e.name.toUpperCase()}</span>${open ? '' : `<span class="price">${e.price}</span>`}</button>`;
        }).join('')}</div>
        <div class="actions"><button class="btn primary" id="loDone"><b>DONE</b></button></div>`, sh => {
        sh.querySelectorAll('.lo-slot:not(:disabled)').forEach(slot => slot.onclick = () => {
          if (sel.length <= 1) {
            Sfx.denied();
            toast('KEEP AT LEAST ONE ELEMENT EQUIPPED');
            return;
          }
          Sfx.click();
          sel.splice(Number(slot.dataset.slot), 1);
          draw();
        });
        sh.querySelectorAll('.pick').forEach(b => b.onclick = () => {
          const id = b.dataset.el;
          if (!Save.elementOpen(id)) { Sfx.click(); closeModal(); codexSel = id; openCodex(); return; }
          Sfx.click();
          if (sel.includes(id)) { if (sel.length > 1) sel = sel.filter(x => x !== id); }
          else if (sel.length < 3) sel.push(id);
          else { sel.shift(); sel.push(id); }
          draw();
        });
        // the back arrow does exactly what DONE does, so nobody has to scroll down to leave
        sh.querySelector('#loBack').onclick = () => sh.querySelector('#loDone').click();
        sh.querySelector('#loDone').onclick = () => {
          Sfx.click(); Save.setLoadout(sel);
          applyAccentTheme();
          if (current === 'home') refreshHome();
          after ? after() : closeModal();
        };
      }, 'wide', keep);
    };
    draw();
  }

  /* -------------------------------------------------------------- codex */
  function openCodex() { show('codex'); renderCodex(); nudgeScroll($('codex'), 'y'); nudgeScroll($('codexList'), 'x'); }
  function renderCodex() {
    const list = $('codexList');
    list.innerHTML = '';
    for (const e of ELEMENTS) {
      const open = Save.elementOpen(e.id);
      const b = document.createElement('button');
      b.className = 'el-pill' + (e.id === codexSel ? ' active' : '');
      b.style.setProperty('--c', e.color);
      b.innerHTML = `${hex(e.id, open ? '' : 'locked')}<span>${e.name.toUpperCase()}</span>${open ? '' : `<span class="price"><span class="ic gem" data-icon="gem"></span>${e.price}</span>`}`;
      b.onclick = () => { Sfx.click(); codexSel = e.id; renderCodex(); };
      list.appendChild(b);
    }
    Icons.hydrate(list);
    $('codexCount').textContent = Save.unlockedElements().length + '/' + ELEMENTS.length;
    const e = ELEMENT_BY_ID[codexSel];
    const open = Save.elementOpen(e.id);
    if (open) Game.setPreviewElement(e.id);
    const det = $('codexDetail');
    det.style.setProperty('--c', e.color);
    det.innerHTML = `
      <div class="cd-head">${hex(e.id, open ? '' : 'locked')}<div><h3>${e.name.toUpperCase()}</h3><p>${e.blurb}</p></div><button class="btn small preview-btn" id="previewEl"><span class="ic" data-icon="play"></span><b>PREVIEW</b></button></div>
      ${open ? '' : `<div class="buy-row"><p>Unlock ${e.name} with gems from battles, pickups and stage clears.</p><button class="btn${Save.data.essence >= e.price ? ' primary' : ''}" id="buyEl"><span class="ic" data-icon="gem"></span><b>UNLOCK · ${e.price}</b></button></div>`}
      <div class="moves">${e.moves.map((mv, i) => `
        <div class="move"${open ? '' : ' style="opacity:.5"'}>
          <div class="move-top"><span class="move-ic" style="--c:${e.color};--d:${e.deep}"><span class="ic" data-icon="${mv.icon}"></span></span>
            <div><h4>${mv.name.toUpperCase()}</h4><div class="tags"><span>${i === 0 ? 'MAIN' : 'POWER'}</span>${mv.type === 'melee' ? '<span class="melee">MELEE</span>' : mv.type === 'ranged' ? '<span class="ranged">RANGED</span>' : ''}</div></div></div>
          <p>${mv.desc}</p>
          <div class="meta">${mv.dmg ? `<span>${mv.dmg}${mv.count ? '×' + mv.count : ''} DMG</span>` : ''}<span>${mv.cd}S</span><kbd>${KEYS[i]}</kbd></div>
        </div>`).join('')}</div>
      ${(() => {
        const mine = COMBOS.filter(cb => cb.b === e.id || cb.a.includes(e.id));
        if (!mine.length) return '';
        return `<div class="combos"><h4>COMBOS</h4>${mine.map(cb => `
          <div class="combo-card">
            <div class="pair">${(cb.b === e.id ? cb.a : [e.id]).map(id => hex(id)).join('<span class="or">/</span>')}<span class="plus">+</span>${hex(cb.b)}</div>
            <div><b>${cb.name.toUpperCase()}</b><p>${cb.desc}</p></div>
          </div>`).join('')}</div>`;
      })()}`;
    Icons.hydrate(det);
    det.querySelector('#previewEl').onclick = () => { Sfx.click(); openPreview(e); };
    const buy = det.querySelector('#buyEl');
    if (buy) buy.onclick = () => {
      if (Save.buyElement(e.id)) {
        Sfx.unlock(); Platform.happytime();
        const l = Save.loadout(); if (l.length < 3 && !l.includes(e.id)) Save.setLoadout(l.concat(e.id));
        toast(`${e.name.toUpperCase()} UNLOCKED!`);
        show('codex'); renderCodex();
      } else { Sfx.denied(); toast(`NEED ${e.price - Save.data.essence} MORE GEMS`); }
    };
  }

  /* ------------------------------------------------------------ preview */
  // watch an element's whole kit in action before buying or equipping it
  function openPreview(e) {
    const bar = $('previewBar');
    bar.style.setProperty('--c', e.color);
    bar.innerHTML = `<div class="pv-head">${hex(e.id)}<div><small>PREVIEW</small><b>${e.name.toUpperCase()}</b></div></div>
      <div class="pv-moves">${e.moves.map((mv, i) => `<div class="pv-move" data-i="${i}"><span class="move-ic" style="--c:${e.color};--d:${e.deep}">${Icons.svg(mv.icon)}</span><div><b>${mv.name.toUpperCase()}</b><small>${i === 0 ? 'MAIN ATTACK' : 'POWER ' + i}</small></div></div>`).join('')}</div>
      <button class="btn primary small" id="pvBack"><b>BACK</b></button>`;
    Icons.hydrate(bar);
    document.body.classList.add('previewing');
    $('codex').classList.add('hidden');
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
    $('codex').classList.remove('hidden');
    renderCodex();
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
          else { Sfx.denied(); toast('NOT ENOUGH GEMS'); }
        };
      }
      card.appendChild(b);
      grid.appendChild(card);
    }
    Icons.hydrate(grid);
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
    Game.paused = true;
    Platform.gameplayStop();
    const label = Game.mode === 'stage' ? `${REALMS[lastStart.r].name.toUpperCase()} · ${stageLabel(lastStart.r, lastStart.s)}` : Game.mode === 'tutorial' ? 'TRAINING' : Game.mode === 'test' ? 'TESTING' : 'ENDLESS';
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
      s.querySelector('#pLoadout').onclick = () => { Sfx.click(); openLoadout(() => { closeModal(); Game.quit(); relaunch(); toast('RESTARTED WITH NEW ELEMENTS'); }); };
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
    Game.paused = false;
    if (Game.state === 'play') Platform.gameplayStart();
  }

  /* ------------------------------------------------------------ results */
  function showResult(res) {
    $('bossBar').classList.add('hidden');
    const tiles = `<div class="stat-tiles"><div><b>${res.kills}</b><small>DEFEATED</small></div><div><b>${res.ringouts}</b><small>RING OUTS</small></div><div><b>${res.bestCombo}</b><small>BEST COMBO</small></div></div>`;
    const reward = `<div class="payout"><span class="ic" data-icon="gem"></span><span id="payoutNum">+${res.essence}</span>${res.bonus ? `<small>INCL. ${res.bonus} CLEAR BONUS</small>` : ''}</div>`;
    const adRow = !Platform.adsEnabled ? '' : `<div class="revive-row">${!res.won && res.canRevive && res.mode !== 'endless' ? '<button class="btn ad" id="rRevive"><span class="ic" data-icon="play"></span><b>REVIVE · AD</b></button>' : ''}${res.essence > 0 ? '<button class="btn ad" id="rDouble"><span class="ic" data-icon="gem"></span><b>DOUBLE GEMS · AD</b></button>' : ''}</div>`;
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
    if (res.mode === 'endless') {
      modal(`
        <h2 class="${res.best ? 'win' : ''}">${res.best ? 'NEW RECORD!' : 'RUN OVER'}</h2>
        <div class="result-content">
          <p class="sub">${res.kills} DEFEATED · BEST ${res.bestKills}</p>
          ${tiles}${reward}${adRow}
        </div>
        <div class="actions result-actions"><button class="btn" id="rMenu"><b>HOME</b></button><button class="btn primary" id="rAgain"><b>AGAIN</b></button></div>`, s => {
        bindAds(s);
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
        <div class="result-content">
          <div class="big-stars">${[1, 2, 3].map(k => `<span class="ic${k <= res.stars ? ' on' : ''}" data-icon="star"></span>`).join('')}</div>
          <p class="sub">${REALMS[r].name.toUpperCase()} · STAGE ${stageLabel(r, s)}</p>
          ${tiles}${reward}${adRow}
          ${u ? `<div class="unlock" style="--c:${u.color}">${hex(u.id)}<div><small>NEW ELEMENT UNLOCKED</small><b>${u.name.toUpperCase()}</b><p>${u.blurb}</p></div></div>` : ''}
          ${boss && res.firstClear && hasNext ? `<p class="sub">${REALMS[nextR].name.toUpperCase()} IS NOW OPEN</p>` : ''}
        </div>
        <div class="actions result-actions">
          <button class="btn" id="rMenu"><b>MENU</b></button>
          <button class="btn" id="rRetry"><b>RETRY</b></button>
          ${hasNext ? '<button class="btn primary" id="rNext"><b>NEXT</b></button>' : ''}
        </div>`, sh => {
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
        <div class="actions result-actions">
          <button class="btn" id="rMenu"><b>MENU</b></button>
          <button class="btn" id="rForge"><b>UPGRADES</b></button>
          <button class="btn primary" id="rRetry"><b>RETRY</b></button>
        </div>`, sh => {
        bindAds(sh);
        sh.querySelector('#rMenu').onclick = toMenu;
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

  function relaunch() { if (!lastStart) return; lastStart.mode === 'stage' ? startStage(lastStart.r, lastStart.s) : lastStart.mode === 'tutorial' ? startTutorial() : lastStart.mode === 'test' ? startTesting() : startEndless(); }

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
    Icons.hydrate();
    applyUiScale();
    loadKeyLayout();
    if (matchMedia('(pointer: coarse)').matches || /mobile|tablet/.test(Platform.device())) document.body.classList.add('touch');
    $('btnPlay').onclick = () => { Sfx.ensure(); Sfx.click(); if (!Save.data.tutorialDone) { startTutorial(); return; } const [r, s] = Save.nextStage(); startStage(r, s); };
    $('btnEndless').onclick = () => { Sfx.ensure(); Sfx.click(); startEndless(); };
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
    Game.hooks.onCombo = onCombo;
    Game.hooks.onRhythm = mv => Rhythm.start(mv, pct => Game.endRhythm(pct));
    Game.hooks.onBoss = e => banner(e.ai.boss.name.toUpperCase(), 'boss');
    Game.hooks.onToast = (t, big) => (big ? banner(t.toUpperCase()) : toast(t.toUpperCase()));
    Game.hooks.onWave = (i, n, boss) => { if (!boss && Game.mode === 'stage' && i > 0) banner(i === n - 1 ? 'FINAL WAVE' : `WAVE ${i + 1}`); };
    Game.hooks.onKill = (e, ringout) => { if (ringout) toast('RING OUT! +2'); };

    Platform.onAuth(() => { Save.load(); applySettings(); if (current === 'home') refreshHome(); });

    applySettings();
    Game.idleScene(0);
    show('home');
    if (!Save.data.tutorialDone) startTutorial();
    checkRotate();
  }

  // menus and HUD scale up on large screens (1280x760 is the design size)
  function applyUiScale() {
    const k = clamp(Math.min(innerWidth / 1280, innerHeight / 760), 1, 1.75);
    document.documentElement.style.setProperty('--ui', k.toFixed(3));
    homeShift();
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
        <p>The game does not ask for or collect any other personal information, shows no ads and has no purchases.</p>
        <p>Playing on CrazyGames is covered by the CrazyGames <a href="https://www.crazygames.com/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="https://www.crazygames.com/terms-and-conditions" target="_blank" rel="noopener">Terms and Conditions</a>.</p>
      </div>
      <div class="actions"><button class="btn primary" id="prBack"><b>BACK</b></button></div>`, s => {
      s.querySelector('#prBack').onclick = () => { Sfx.click(); openSettings(fromPause); };
    });
  }

  function toMenu() { Sfx.click(); closeModal(); Game.quit(); Game.idleScene(0); show('home'); }

  function checkRotate() {
    const portrait = window.innerHeight > window.innerWidth * 1.1 && document.body.classList.contains('touch');
    $('rotate').classList.toggle('hidden', !portrait || rotateDismissed);
  }

  return {
    init, tick, show, openPause, resume, toast, checkRotate, applyUiScale, modalOpen, closeModal, startStage,
    get screen() { return current; },
  };
})();
