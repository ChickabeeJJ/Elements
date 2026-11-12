'use strict';
/* =========================================================================
   Progress: save data, stage/element unlocks, upgrade shop math.
   ========================================================================= */

const UPGRADES = [
  { id: 'vitality', name: 'Vitality', desc: '+20 max health', max: 8, base: 40, color: '#ff5d73', icon: 'heart' },
  { id: 'might', name: 'Might', desc: '+10% damage', max: 8, base: 55, color: '#ffb347', icon: 'sword' },
  { id: 'ward', name: 'Ward', desc: '-6% damage taken', max: 6, base: 50, color: '#a993ff', icon: 'shield' },
  { id: 'focus', name: 'Focus', desc: '-6% power cooldowns', max: 6, base: 60, color: '#59d0ff', icon: 'swirl' },
  { id: 'swift', name: 'Swiftness', desc: '+6% move speed and jump', max: 5, base: 35, color: '#7ee081', icon: 'wing' },
  { id: 'anchor', name: 'Anchor', desc: '-8% knockback taken', max: 5, base: 45, color: '#e0b98f', icon: 'anchor' },
  { id: 'recovery', name: 'Recovery', desc: '+8% healing received', max: 5, base: 45, color: '#68e0a3', icon: 'heal' },
  { id: 'impact', name: 'Impact', desc: '+6% knockback dealt', max: 6, base: 60, color: '#ff8b53', icon: 'burst' },
  { id: 'scavenger', name: 'Scavenger', desc: '+8% essence earned', max: 5, base: 65, color: '#ffd76a', icon: 'crystal' },
];

const Save = (() => {
  const KEY = 'save_v2';
  const fresh = () => ({
    essence: 0,
    stars: {},            // "r-s" -> 1..3
    upgrades: Object.fromEntries(UPGRADES.map(u => [u.id, 0])),
    endlessBest: 0,
    settings: { sfx: true, music: true, shake: true, numbers: true },
    loadout: ['wind'],
    owned: ['wind'],
    tutorialDone: false,
    seenHelp: false,
    stats: { kills: 0, ringouts: 0, bosses: 0 },
    // live features (js/meta.js): Arena trophies, daily quests, event progress
    arena: { trophies: 0, peak: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, tiersClaimed: 0, season: 0, seasonPeak: 0, history: [], pending: null },
    daily: { day: -1, list: [], bonus: false },
    ads: { day: -1, n: 0 },   // opt-in "+gems" rewarded ads watched today (capped)
    event: { cycle: -1, id: '', tokens: 0, prog: {}, claimed: [], day: -1, list: [] },
    // the Shop: owned / worn cosmetics, and one-run items (counts + the ones armed for the next run)
    cos: { colours: ['snow'], hats: [], colour: 'snow', hat: null },
    items: { n: {}, armed: [] },
    // Winterfest (the yearly December event): its 20-stage chapter keeps its stars across years;
    // the how-to plays once ever
    winter: { stars: {}, tutDone: false },
  });
  let data = fresh();

  function load() {
    try {
      const raw = Platform.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        data = Object.assign(fresh(), d);
        data.upgrades = Object.assign(fresh().upgrades, d.upgrades || {});
        data.settings = Object.assign(fresh().settings, d.settings || {});
        data.stats = Object.assign(fresh().stats, d.stats || {});
        data.arena = Object.assign(fresh().arena, d.arena || {});
        data.daily = Object.assign(fresh().daily, d.daily || {});
        data.ads = Object.assign(fresh().ads, d.ads || {});
        data.event = Object.assign(fresh().event, d.event || {});
        data.cos = Object.assign(fresh().cos, d.cos || {});
        data.items = Object.assign(fresh().items, d.items || {});
        data.winter = Object.assign(fresh().winter, d.winter || {});
        if (!Array.isArray(data.owned)) data.owned = ['wind'];
      }
    } catch (e) { data = fresh(); }
    reportProgress();
  }
  function save() { try { Platform.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }
  function reportProgress() {
    const completed = Object.values(data.stars || {}).filter(stars => Number(stars) > 0).length;
    Platform.reportProgress(Math.min(100, completed / TOTAL_STAGES * 100));
  }
  function reset() { data = fresh(); save(); reportProgress(); }

  const cleared = (r, s) => (data.stars[stageKey(r, s)] || 0) > 0;
  function stageOpen(r, s) {
    if (r === 0 && s === 0) return true;
    if (s === 0) return cleared(r - 1, STAGES_PER_REALM - 1);
    return cleared(r, s - 1);
  }
  function realmOpen(r) { return stageOpen(r, 0); }
  // elements are bought with gems (essence); Gale is free. Event exclusives are
  // earned with event tokens (Meta.buyEventElement) and are never free.
  function elementOpen(id) {
    const e = ELEMENT_BY_ID[id];
    return !!e && ((e.price === 0 && !e.event) || (data.owned || []).includes(id));
  }
  function grantElement(id) {
    if (!ELEMENT_BY_ID[id] || elementOpen(id)) return false;
    data.owned = (data.owned || []).concat(id);
    save();
    return true;
  }
  function buyElement(id) {
    const e = ELEMENT_BY_ID[id];
    if (!e || e.event || elementOpen(id) || data.essence < e.price) return false;
    data.essence -= e.price;
    data.owned = (data.owned || []).concat(id);
    save();
    return true;
  }
  function unlockedElements() { return ELEMENTS.filter(e => elementOpen(e.id)); }
  function loadout() {
    const l = (data.loadout || []).filter(id => ELEMENT_BY_ID[id] && elementOpen(id)).slice(0, 3);
    return l.length ? l : ['wind'];
  }
  function setLoadout(ids) { data.loadout = ids.slice(0, 3); save(); }
  // ad trial: one locked element for the next stage, Arena match or Endless run
  const TRIAL_CAP = 5;   // trials a day
  function trialsLeft() { const a = data.ads; return a.tryDay === dayNo() ? Math.max(0, TRIAL_CAP - (a.tryN || 0)) : TRIAL_CAP; }
  function setTrial(id) {
    const a = data.ads; if (a.tryDay !== dayNo()) { a.tryDay = dayNo(); a.tryN = 0; }
    a.tryN = (a.tryN || 0) + 1; data.trial = id; save();
  }
  function takeTrial() { const id = data.trial; if (!id) return null; data.trial = null; save(); return ELEMENT_BY_ID[id] && !elementOpen(id) ? id : null; }
  const dayNo = () => Math.floor(Date.now() / 86400000);
  function totalStars() { return Object.values(data.stars).reduce((a, b) => a + b, 0); }
  function nextStage() {
    for (let r = 0; r < REALMS.length; r++) for (let s = 0; s < STAGES_PER_REALM; s++) if (!cleared(r, s)) return [r, s];
    return [REALMS.length - 1, STAGES_PER_REALM - 1];
  }

  function upgradeCost(id) {
    const u = UPGRADES.find(x => x.id === id), lv = data.upgrades[id];
    if (lv >= u.max) return null;
    return Math.round(u.base * (1 + lv * 0.8 + lv * lv * 0.25));
  }
  function buy(id) {
    const c = upgradeCost(id);
    if (c == null || data.essence < c) return false;
    data.essence -= c;
    data.upgrades[id]++;
    save();
    return true;
  }

  /* derived player stats */
  function playerStats() {
    const u = data.upgrades;
    return {
      hp: 120 + u.vitality * 20,
      dmgMul: 1 + u.might * 0.1,
      armor: 1 - u.ward * 0.06,
      cdMul: 1 - u.focus * 0.06,
      speedMul: 1 + u.swift * 0.06,
      jumpMul: 1 + u.swift * 0.03,
      knockMul: 1 - u.anchor * 0.08,
      healMul: 1 + u.recovery * 0.08,
      knockDealtMul: 1 + u.impact * 0.06,
      essenceMul: 1 + u.scavenger * 0.08,
    };
  }

  /* records a stage clear; returns {newStars, firstClear} */
  function recordClear(r, s, stars) {
    const k = stageKey(r, s);
    const prev = data.stars[k] || 0;
    if (stars > prev) data.stars[k] = stars;
    save();
    reportProgress();
    return { newStars: Math.max(0, stars - prev), firstClear: prev === 0 };
  }

  return {
    load, save, reset, stageOpen, realmOpen, elementOpen, buyElement, grantElement, unlockedElements, loadout, setLoadout, totalStars, nextStage,
    trialsLeft, setTrial, takeTrial, get trial() { return data.trial && ELEMENT_BY_ID[data.trial] && !elementOpen(data.trial) ? data.trial : null; },
    upgradeCost, buy, playerStats, recordClear, cleared,
    get data() { return data; },
  };
})();
