'use strict';
/* =========================================================================
   Boot, main loop and input routing.
   ========================================================================= */

(async function boot() {
  const canvas = document.getElementById('stage');
  Platform.loadingStart();
  await Platform.init();
  Save.load();
  try { await document.fonts.load('900 20px Nunito'); await document.fonts.load('700 20px Cinzel'); } catch (e) { /* fonts are optional */ }
  Game.init(canvas);
  UI.init();
  Platform.loadingStop();

  /* ------------------------------------------------------------ input */
  let activePointer = null;
  canvas.addEventListener('pointerdown', e => {
    Sfx.ensure();
    if (e.button === 2) { Game.cancelAim(); return; }
    if (activePointer != null || UI.screen !== null || UI.modalOpen()) return;
    if (Game.pointerDown(e.clientX, e.clientY)) {
      activePointer = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  });
  canvas.addEventListener('pointermove', e => { if (e.pointerId === activePointer) Game.pointerMove(e.clientX, e.clientY); });
  const release = e => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    Game.pointerUp();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', e => { if (e.pointerId === activePointer) { activePointer = null; Game.cancelAim(); } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('wheel', e => {
    if (UI.screen !== null) return;
    cycleElement(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  function cycleElement(dir) {
    const open = Save.unlockedElements();
    const h = Game.hud();
    if (!h || open.length < 2) return;
    const i = open.findIndex(e => e.id === h.el);
    Game.selectElement(open[(i + dir + open.length) % open.length].id);
    Sfx.click();
  }

  window.addEventListener('keydown', e => {
    if (e.repeat && e.code !== 'Space') return;
    const inGame = UI.screen === null;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!inGame) return;
      UI.modalOpen() ? (Game.paused && Game.state === 'play' ? UI.resume() : null) : UI.openPause();
      return;
    }
    if (!inGame || UI.modalOpen()) return;
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') { e.preventDefault(); if (!e.repeat) Game.jump(); return; }
    if (e.code === 'KeyQ') { cycleElement(-1); return; }
    if (e.code === 'KeyE') { cycleElement(1); return; }
    const m = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) {
      const el = ELEMENTS[+m[2] - 1];
      if (el) { Game.selectElement(el.id) ? Sfx.click() : UI.toast(`${el.name} unlocks at stage ${stageLabel(el.unlock[0], el.unlock[1])}`); }
    }
  });

  window.addEventListener('resize', () => { Game.resize(); UI.checkRotate(); });
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
