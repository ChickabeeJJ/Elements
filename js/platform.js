'use strict';
/* =========================================================================
   Platform layer: the CrazyGames HTML5 SDK v3, fully wrapped.
   - init + environment + device info
   - loading / gameplay events, happytime
   - midgame ads (frequency handled by the SDK) and rewarded ads, ad-block detection
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
  let adInFlight = false;
  let adWaitOverlay = null;
  let adBlock = false;
  let user = null;
  let bannerOn = false, bannerId = null, bannerTimer = null;
  const BANNER_REFRESH = 30 * 1000;
  const BANNER_SIZE = { width: 320, height: 50 };
  let lastProgress = null;
  const authListeners = [];
  const PREFIX = 'elementfall_';
  // Ads are for a Full Launch on CrazyGames (Basic Launch builds must not show any:
  // set this to false for a Basic Launch upload). Off CrazyGames no ad is ever requested.
  //  - midgame: requested at the breaks the CrazyGames review asked for (Play, Endless,
  //    Find Match, picking a stage, Next / Retry / Again), never launched on its own;
  //    the SDK decides whether one plays
  //  - rewarded: always opt-in, for a clear bonus
  //  - banner: one 320x50 banner, first requested on the Stages / Elements / Upgrades
  //    menus, kept on the main menu, refreshed every 30 s, cleared only when gameplay starts
  const ADS_ENABLED = true;
  // Banner ads are OFF: no banner is requested and no screen reserves space for one.
  // The banner code below follows the CrazyGames review rules (320x50, fixed bottom-centre /
  // top-centre on touch, kept on menus, refreshed every 30 s, cleared at gameplay): set this
  // to true to bring it back.
  const BANNERS_ENABLED = false;
  // CrazyGames leaderboards are invite-only and need the encryption key from the
  // developer portal. Leave the key empty and no score is ever sent.
  // The score is AES-GCM encrypted (random 12-byte IV, sent as base64 of IV + ciphertext + tag)
  // and submitted as { encryptedScore, score }. Check it in the CrazyGames QA tool before launch.
  const LEADERBOARD_KEY = '';           // base64 AES key from the CrazyGames developer portal
  const LEADERBOARD_COOLDOWN = 12 * 1000;
  let lastScoreAt = 0, pendingScore = null, scoreTimer = null;

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
    if (!sdk) return;
    // platform audio setting wins over the in-game toggles
    safe(() => {
      applySettings(sdk.game.settings);
      sdk.game.addSettingsChangeListener(applySettings);
    });
    // accounts
    safe(() => sdk.user.addAuthListener(u => {
      user = u || null;
      lastProgress = null;
      authListeners.forEach(cb => safe(() => cb(user)));
    }));
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
  function reportProgress(percent) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (value === lastProgress) return;
    lastProgress = value;
    safe(() => sdk && sdk.game && typeof sdk.game.reportGameCompletedPercentage === 'function' && sdk.game.reportGameCompletedPercentage(value));
  }

  /* --------------------------------------------------------------- ads */
  // While an ad is being requested, an invisible layer swallows taps and clicks so nothing
  // underneath can be pressed twice. It shows no text (no "preparing ad" screen).
  function setAdWaitOverlay(visible) {
    if (!visible) {
      if (adWaitOverlay) adWaitOverlay.remove();
      adWaitOverlay = null;
      return;
    }
    if (adWaitOverlay || !document.body) return;
    const overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', background: 'transparent',
      pointerEvents: 'auto', touchAction: 'none', userSelect: 'none',
    });
    document.body.appendChild(overlay);
    adWaitOverlay = overlay;
  }

  // cb(success:boolean). Without the SDK (other hosts, local testing) no ad runs and no reward is given.
  // A safety timer keeps the game from hanging if the ad network goes quiet:
  //  - midgame: no start within 8 s, carry on without it
  //  - rewarded: wait up to 30 s for it to start (rewarded ads often take longer to load), and
  //    even after that the player is never told "no ad" while one could still play: the result
  //    is reported only once the SDK says the ad finished or failed
  //  - once an ad has started, up to 75 s for it to finish
  function requestAd(kind, cb) {
    if (!ADS_ENABLED || !sdk) { cb && cb(false); return; }
    if (adInFlight) { cb && cb(false); return; }
    adInFlight = true;
    setAdWaitOverlay(true);
    let done = false, started = false, watchdog = 0;
    const wasPlaying = inGameplay;
    const finish = ok => {
      if (done) return; done = true; adInFlight = false;
      clearTimeout(watchdog); clearTimeout(unblock);
      setAdWaitOverlay(false);
      Sfx.setAdMuted(false);
      if (wasPlaying) gameplayStart();
      cb && cb(ok);
    };
    const START_WAIT = kind === 'rewarded' ? 30000 : 8000;
    watchdog = setTimeout(() => finish(false), START_WAIT);
    // the tap blocker never stays up longer than 8 s: a slow rewarded ad keeps loading behind it
    const unblock = setTimeout(() => { if (!done && !started) setAdWaitOverlay(false); }, 8000);
    gameplayStop();
    try {
      const p = sdk.ad.requestAd(kind, {
        adStarted: () => {
          if (done) { Sfx.setAdMuted(true); return; }   // a midgame that turned up late: just keep it quiet
          started = true;
          clearTimeout(watchdog); watchdog = setTimeout(() => finish(false), 75000);
          setAdWaitOverlay(false); Sfx.setAdMuted(true);
        },
        adFinished: () => { if (done) { Sfx.setAdMuted(false); return; } finish(true); },
        adError: () => { if (done) { Sfx.setAdMuted(false); return; } finish(false); },   // e.g. "No ad available": the game just continues
      });
      // the v3 SDK resolves when the ad flow ends; only a rejection that comes before the ad has
      // started means it failed (some SDK builds resolve/reject alongside the callbacks)
      if (p && p.catch) p.catch(() => { if (!started) finish(false); });
    } catch (e) { finish(false); }
  }
  // UI calls this from the buttons that start or restart play; the SDK applies its own
  // frequency limits on top. No midgame in the player's first 2 minutes after the game loads,
  // except the break after beating a boss ({ afterBoss: true }), which always asks.
  const MIDGAME_GRACE = 120000, loadedAt = Date.now();
  function maybeMidgame(cb, opts) {
    const grace = !(opts && opts.afterBoss) && Date.now() - loadedAt < MIDGAME_GRACE;
    if (!ADS_ENABLED || !sdk || grace) { cb && cb(); return; }
    requestAd('midgame', () => cb && cb());
  }
  function rewarded(cb) { requestAd('rewarded', cb); }

  /* ----------------------------------------------------------- banners */
  // One fixed 320x50 banner. It is requested once; while it exists it is never requested
  // again, only refreshed every BANNER_REFRESH (and only while its slot is on screen).
  // It is cleared only when gameplay starts.
  const slotVisible = id => { const el = document.getElementById(id); return !!(el && el.offsetWidth && el.offsetHeight); };
  function fillBanner(id) {
    try {
      const p = sdk.banner.requestBanner ? sdk.banner.requestBanner(Object.assign({ id }, BANNER_SIZE)) : sdk.banner.requestResponsiveBanner(id);
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }
  function showBanner(containerId) {
    if (!BANNERS_ENABLED || !ADS_ENABLED || !sdk || inGameplay) return false;
    if (bannerOn) return true;                       // already showing: the timer refreshes it
    if (!slotVisible(containerId)) return false;
    bannerOn = true; bannerId = containerId;
    fillBanner(containerId);
    clearInterval(bannerTimer);
    bannerTimer = setInterval(() => { if (bannerOn && !inGameplay && slotVisible(bannerId)) fillBanner(bannerId); }, BANNER_REFRESH);
    return true;
  }
  function clearBanners() {
    clearInterval(bannerTimer); bannerTimer = null;
    if (!bannerOn) return;
    bannerOn = false;
    safe(() => sdk.banner.clearAllBanners());
  }

  /* -------------------------------------------------------------- user */
  async function login() {
    if (!sdk || !safe(() => sdk.user.isUserAccountAvailable, false)) return null;
    try { user = await sdk.user.showAuthPrompt(); } catch (e) { /* cancelled */ }
    return user;
  }
  function onAuth(cb) { authListeners.push(cb); }

  /* ------------------------------------------------------ leaderboard */
  // Only a single number (Arena trophies) is sent, and only on CrazyGames with a key.
  // The platform shows it under the player's own CrazyGames username; nothing else is shared.
  const leaderboardOn = () => !!(sdk && LEADERBOARD_KEY && sdk.user && typeof sdk.user.submitScore === 'function' && window.crypto && crypto.subtle);
  async function encryptScore(score) {
    const raw = Uint8Array.from(atob(LEADERBOARD_KEY), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(score))));
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv); out.set(ct, iv.length);
    let bin = ''; out.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function submitScore(score) {
    if (!leaderboardOn() || !user) return false;   // logged-in players only
    pendingScore = Math.max(0, Math.floor(score));
    const wait = Math.max(0, lastScoreAt + LEADERBOARD_COOLDOWN - Date.now());
    clearTimeout(scoreTimer);
    scoreTimer = setTimeout(async () => {
      const v = pendingScore; pendingScore = null; lastScoreAt = Date.now();
      try {
        const p = sdk.user.submitScore({ encryptedScore: await encryptScore(v), score: v });
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* ignore */ }
    }, wait);
    return true;
  }

  // Arena leaderboard entries for the in-game top 10, CrazyGames only. Resolve to
  // [{ rank, name, score }] from a real source; null hides the leaderboard panel.
  // The CrazyGames SDK documents score submission but no way to read entries yet,
  // so this stays null until such an API (or your own backend) is available.
  async function fetchLeaderboard() {
    if (!sdk) return null;
    return null;
  }

  function device() {
    const t = safe(() => sdk && sdk.user.systemInfo && sdk.user.systemInfo.device && sdk.user.systemInfo.device.type, null);
    if (t) return t;
    return matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
  }

  return {
    init, getItem, setItem, removeItem, loadingStart, loadingStop, gameplayStart, gameplayStop,
    happytime, reportProgress, requestAd, maybeMidgame, rewarded, showBanner, clearBanners, login, onAuth, device, submitScore, fetchLeaderboard,
    get leaderboardEnabled() { return leaderboardOn(); },
    get hasSdk() { return !!sdk; }, get ready() { return ready; }, get env() { return env; },
    get inGameplay() { return inGameplay; },
    get adBlock() { return adBlock; }, get adsEnabled() { return ADS_ENABLED && !!sdk; },
    get rewardedAvailable() { return ADS_ENABLED && !!sdk && !adBlock; },
    get bannerActive() { return bannerOn; }, get bannersEnabled() { return BANNERS_ENABLED && ADS_ENABLED && !!sdk; }, get user() { return user; },
    get accountsAvailable() { return !!sdk && safe(() => sdk.user.isUserAccountAvailable, false); },
  };
})();
