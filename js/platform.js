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
  let adInFlight = false;
  let lastMidgame = 0;
  let adBlock = false;
  let user = null;
  const bannersShown = new Set();
  const bannerRequests = new Set();
  const authListeners = [];
  const MIDGAME_GAP = 3 * 60 * 1000;
  const PREFIX = 'elementfall_';
  // Ads are for a Full Launch on CrazyGames (Basic Launch builds must not show any:
  // set this to false for a Basic Launch upload). Off CrazyGames no ad is ever requested.
  //  - midgame: only at natural breaks, at most one per MIDGAME_GAP, never for brand-new players
  //  - rewarded: always opt-in, for a clear bonus
  //  - banner: desktop home screen only, never during gameplay
  const ADS_ENABLED = true;
  let midgameGate = () => true;
  // CrazyGames leaderboards are invite-only and need the encryption key from the
  // developer portal. Leave the key empty and no score is ever sent.
  // The score is AES-GCM encrypted (random 12-byte IV, sent as base64 of IV + ciphertext + tag)
  // and submitted as { encryptedScore, score }. Check it in the CrazyGames QA tool before launch.
  // Leaderboard OFF until this is set: no score is sent and nothing about it is shown.
  // Once CrazyGames invites the game, paste the leaderboard's encryption key here.
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
  // cb(success:boolean). Without the SDK (other hosts, local testing) no ad runs and no reward is given.
  function requestAd(kind, cb) {
    if (!ADS_ENABLED || !sdk) { cb && cb(false); return; }
    if (adInFlight) { cb && cb(false); return; }
    adInFlight = true;
    let done = false;
    const wasPlaying = inGameplay;
    const finish = ok => {
      if (done) return; done = true; adInFlight = false;
      Sfx.setAdMuted(false);
      if (wasPlaying) gameplayStart();
      cb && cb(ok);
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
    if (!ADS_ENABLED || !sdk || Date.now() - lastMidgame < MIDGAME_GAP || !safe(midgameGate, false)) { cb && cb(); return; }
    lastMidgame = Date.now();
    requestAd('midgame', () => cb && cb());
  }
  function rewarded(cb) { requestAd('rewarded', cb); }

  /* ----------------------------------------------------------- banners */
  // containerId must be a visible element sized to a supported banner format
  function showBanner(containerId) {
    if (!ADS_ENABLED || !sdk || inGameplay || bannerRequests.has(containerId)) return;
    const el = document.getElementById(containerId);
    if (!el || !el.offsetWidth) return;
    bannerRequests.add(containerId);
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

  /* ------------------------------------------------------ leaderboard */
  // Only a single number (best Endless knockouts) is sent, and only on CrazyGames with a key.
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


  function device() {
    const t = safe(() => sdk && sdk.user.systemInfo && sdk.user.systemInfo.device && sdk.user.systemInfo.device.type, null);
    if (t) return t;
    return matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
  }

  return {
    init, getItem, setItem, removeItem, loadingStart, loadingStop, gameplayStart, gameplayStop,
    happytime, requestAd, maybeMidgame, rewarded, showBanner, clearBanners, login, onAuth, device, submitScore,
    get leaderboardEnabled() { return leaderboardOn(); },
    get hasSdk() { return !!sdk; }, get ready() { return ready; }, get env() { return env; },
    get inGameplay() { return inGameplay; },
    get adBlock() { return adBlock; }, get adsEnabled() { return ADS_ENABLED && !!sdk; },
    get rewardedAvailable() { return ADS_ENABLED && !!sdk && !adBlock; },
    setMidgameGate(fn) { midgameGate = fn; }, get user() { return user; },
    get accountsAvailable() { return !!sdk && safe(() => sdk.user.isUserAccountAvailable, false); },
  };
})();
