'use strict';
/* =========================================================================
   Platform layer: the CrazyGames HTML5 SDK v3, fully wrapped.
   - init + environment + device info
   - loading / gameplay events, happytime
   - midgame ads (rate limited) and rewarded ads, ad-block detection
   - responsive banners on menu screens (cleared during gameplay)
   - user accounts: current user, auth prompt, auth listener
   - data module for cloud saves (localStorage when standalone)
   - game settings (muteAudio) with a change listener
   Every call is guarded so the game runs unchanged offline or elsewhere.
   ========================================================================= */

const Platform = (() => {
  let sdk = null;
  let env = 'standalone';
  let ready = false;
  let inGameplay = false;
  let lastMidgame = 0;
  let adBlock = false;
  let user = null;
  let lastBanner = 0;
  const bannersShown = new Set();
  const authListeners = [];
  const MIDGAME_GAP = 3 * 60 * 1000;
  const BANNER_GAP = 61 * 1000;
  const PREFIX = 'elementfall_';
  // Basic Launch builds must not show ads: no midgame, rewarded, banner or ad-block calls.
  // Flip to true for a Full Launch.
  const ADS_ENABLED = false;

  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };

  async function init() {
    try {
      if (window.CrazyGames && window.CrazyGames.SDK) {
        await window.CrazyGames.SDK.init();
        sdk = window.CrazyGames.SDK;
        env = sdk.environment || 'crazygames';
        if (env === 'disabled') sdk = null;
      }
    } catch (e) { sdk = null; }
    ready = true;
    lastMidgame = Date.now();
    if (!sdk) return;
    // platform audio setting wins over the in-game toggles
    safe(() => {
      applySettings(sdk.game.settings);
      sdk.game.addSettingsChangeListener(applySettings);
    });
    // accounts
    safe(() => sdk.user.addAuthListener(u => { user = u || null; authListeners.forEach(cb => safe(() => cb(user))); }));
    if (safe(() => sdk.user.isUserAccountAvailable, false)) {
      try { user = await sdk.user.getUser(); } catch (e) { user = null; }
    }
    if (ADS_ENABLED) { try { adBlock = !!(await sdk.ad.hasAdblock()); } catch (e) { adBlock = false; } }
  }

  function applySettings(s) {
    if (!s) return;
    if (typeof Sfx !== 'undefined' && Sfx.setPlatformMute) Sfx.setPlatformMute(!!s.muteAudio);
  }

  /* ----------------------------------------------------------- storage */
  function store() {
    if (sdk && sdk.data) return sdk.data;
    try { localStorage.setItem(PREFIX + 't', '1'); return localStorage; } catch (e) { return null; }
  }
  const memory = {};
  function getItem(k) {
    const s = store();
    try { return s ? s.getItem(PREFIX + k) : (memory[k] ?? null); } catch (e) { return memory[k] ?? null; }
  }
  function setItem(k, v) {
    const s = store();
    try { if (s) s.setItem(PREFIX + k, v); else memory[k] = v; } catch (e) { memory[k] = v; }
  }
  function removeItem(k) {
    const s = store();
    try { if (s) s.removeItem(PREFIX + k); } catch (e) { /* ignore */ }
    delete memory[k];
  }

  /* ------------------------------------------------------------ events */
  function loadingStart() { safe(() => sdk && sdk.game.loadingStart()); }
  function loadingStop() { safe(() => sdk && sdk.game.loadingStop()); }
  function gameplayStart() {
    if (inGameplay) return; inGameplay = true;
    clearBanners();
    safe(() => sdk && sdk.game.gameplayStart());
  }
  function gameplayStop() {
    if (!inGameplay) return; inGameplay = false;
    safe(() => sdk && sdk.game.gameplayStop());
  }
  function happytime() { safe(() => sdk && sdk.game.happytime()); }

  /* --------------------------------------------------------------- ads */
  // cb(success:boolean). Standalone: rewarded ads succeed so features stay testable.
  function requestAd(kind, cb) {
    if (!ADS_ENABLED) { cb(false); return; }
    if (!sdk) { cb(kind === 'rewarded'); return; }
    let done = false;
    const wasPlaying = inGameplay;
    const finish = ok => {
      if (done) return; done = true;
      Sfx.setAdMuted(false);
      if (wasPlaying) gameplayStart();
      cb(ok);
    };
    gameplayStop();
    try {
      sdk.ad.requestAd(kind, {
        adStarted: () => Sfx.setAdMuted(true),
        adFinished: () => finish(true),
        adError: () => finish(false),
      });
    } catch (e) { finish(false); }
  }
  function maybeMidgame(cb) {
    if (!ADS_ENABLED || !sdk || Date.now() - lastMidgame < MIDGAME_GAP) { cb && cb(); return; }
    lastMidgame = Date.now();
    requestAd('midgame', () => cb && cb());
  }
  function rewarded(cb) { requestAd('rewarded', cb); }

  /* ----------------------------------------------------------- banners */
  // containerId must be a visible element sized to a supported banner format
  function showBanner(containerId) {
    if (!ADS_ENABLED || !sdk || inGameplay) return;
    const el = document.getElementById(containerId);
    if (!el || !el.offsetWidth) return;
    if (bannersShown.has(containerId) && Date.now() - lastBanner < BANNER_GAP) return;
    lastBanner = Date.now();
    bannersShown.add(containerId);
    try {
      const p = sdk.banner.requestResponsiveBanner(containerId);
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }
  function clearBanners() {
    if (!ADS_ENABLED || !sdk || !bannersShown.size) return;
    safe(() => sdk.banner.clearAllBanners());
    bannersShown.clear();
  }

  /* -------------------------------------------------------------- user */
  async function login() {
    if (!sdk || !safe(() => sdk.user.isUserAccountAvailable, false)) return null;
    try { user = await sdk.user.showAuthPrompt(); } catch (e) { /* cancelled */ }
    return user;
  }
  function onAuth(cb) { authListeners.push(cb); }

  function device() {
    const t = safe(() => sdk && sdk.user.systemInfo && sdk.user.systemInfo.device && sdk.user.systemInfo.device.type, null);
    if (t) return t;
    return matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
  }

  return {
    init, getItem, setItem, removeItem, loadingStart, loadingStop, gameplayStart, gameplayStop,
    happytime, requestAd, maybeMidgame, rewarded, showBanner, clearBanners, login, onAuth, device,
    get hasSdk() { return !!sdk; }, get ready() { return ready; }, get env() { return env; },
    get adBlock() { return adBlock; }, get adsEnabled() { return ADS_ENABLED; }, get user() { return user; },
    get accountsAvailable() { return !!sdk && safe(() => sdk.user.isUserAccountAvailable, false); },
  };
})();
