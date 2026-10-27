'use strict';
/* =========================================================================
   Boot, main loop and keyboard/mouse input. Touch controls live in ui.js.
   ========================================================================= */

(async function boot() {
  const canvas = document.getElementById('stage');
  // SDK order: init, loadingStart, load everything, loadingStop, and only then the UI,
  // which may start the tutorial (the first gameplayStart must come after loadingStop)
  await Platform.init();
  Platform.loadingStart();
  Save.load();
  try { await Promise.all([document.fonts.load('20px Bungee'), document.fonts.load('800 20px Nunito')]); } catch (e) { /* fonts are optional */ }
  Game.init(canvas);
  Platform.loadingStop();
  UI.init();

  const inFight = () => UI.screen === null && !UI.modalOpen() && Game.state === 'play';

  /* ------------------------------------------------------------ mouse */
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') Game.setMouse(e.clientX, e.clientY); });
  canvas.addEventListener('pointerdown', e => {
    Sfx.ensure();
    if (e.pointerType !== 'mouse') { document.body.classList.add('touch'); return; }
    document.body.classList.remove('touch');
    Game.setMouse(e.clientX, e.clientY);
    if (!inFight()) return;
    if (e.button === 0) Game.press('attack');
    else if (e.button === 2) Game.press('p1');
    else if (e.button === 1) { e.preventDefault(); Game.press('p2'); }
  });
  window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) Game.release('attack'); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { if (inFight()) Game.cycleSlot(e.deltaY > 0 ? 1 : -1); }, { passive: true });

  /* --------------------------------------------------------- keyboard */
  const MOVE = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  window.addEventListener('keydown', e => {
    // P pauses. Escape is left to the browser (it leaves fullscreen); it only closes an open pause menu.
    if (e.code === 'KeyP' || (e.code === 'Escape' && UI.modalOpen() && Game.paused)) {
      if (UI.screen !== null) return;
      if (UI.modalOpen()) { if (Game.paused && Game.state === 'play') UI.resume(); }
      else UI.openPause();
      return;
    }
    if (!inFight()) return;
    if (MOVE[e.code]) { Game.setKey(MOVE[e.code], true); e.preventDefault(); return; }
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': case 'Space': e.preventDefault(); Game.press('jump'); break;
      case 'KeyS': case 'ArrowDown': e.preventDefault(); Game.press('drop'); break;
      case 'KeyJ': Game.press('attack'); break;
      case 'KeyQ': case 'KeyK': Game.press('p1'); break;
      case 'KeyE': case 'KeyL': Game.press('p2'); break;
      case 'Tab': e.preventDefault(); Game.cycleSlot(1); break;
      case 'Digit1': case 'Digit2': case 'Digit3': Game.selectSlot(+e.code.slice(5) - 1); break;
      default: break;
    }
  });
  window.addEventListener('keyup', e => {
    if (MOVE[e.code]) Game.setKey(MOVE[e.code], false);
    if (e.code === 'KeyJ') Game.release('attack');
  });
  window.addEventListener('blur', () => { Game.setKey('left', false); Game.setKey('right', false); Game.release('attack'); });

  window.addEventListener('resize', () => { Game.resize(); UI.checkRotate(); UI.applyUiScale(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (UI.screen === null && Game.state === 'play' && !Game.paused) UI.openPause();
      Sfx.suspend(true);
    } else Sfx.suspend(false);
  });

  /* ------------------------------------------------------------- loop */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    Game.update(dt);
    Game.render();
    UI.tick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
