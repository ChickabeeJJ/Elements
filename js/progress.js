'use strict';
/* =========================================================================
   Progress: save data, stage/element unlocks, upgrade shop math.
   ========================================================================= */

const UPGRADES = [
  { id: 'vitality', name: 'Vitality', desc: '+20 max health', max: 8, base: 40, color: '#ff6b7a', icon: 'heart' },
  { id: 'stamina', name: 'Endurance', desc: '+15 max stamina', max: 8, base: 35, color: '#62b6ff', icon: 'bolt' },
  { id: 'regen', name: 'Focus', desc: '+15% stamina regen', max: 8, base: 45, color: '#7de0ff', icon: 'swirl' },
  { id: 'might', name: 'Might', desc: '+10% arrow damage', max: 8, base: 60, color: '#ffb347', icon: 'sword' },
  { id: 'ward', name: 'Ward', desc: '-6% damage taken', max: 6, base: 55, color: '#b6a6ff', icon: 'shield' },
  { id: 'insight', name: 'Insight', desc: 'Longer aim guide', max: 5, base: 30, color: '#9ae66e', icon: 'eye' },
];

const Save = (() => {
  const KEY = 'save_v1';
  const fresh = () => ({
    essence: 0,
    stars: {},            // "r-s" -> 1..3
    upgrades: Object.fromEntries(UPGRADES.map(u => [u.id, 0])),
    endlessBest: 0,
    settings: { sfx: true, music: true, shake: true, guide: true },
    selected: 'wind',
    seenHelp: false,
    stats: { kills: 0, headshots: 0, shots: 0 },
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
      }
    } catch (e) { data = fresh(); }
  }
  function save() { try { Platform.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }
  function reset() { data = fresh(); save(); }

  const cleared = (r, s) => (data.stars[stageKey(r, s)] || 0) > 0;
  function stageOpen(r, s) {
    if (r === 0 && s === 0) return true;
    if (s === 0) return cleared(r - 1, STAGES_PER_REALM - 1);
    return cleared(r, s - 1);
  }
  function realmOpen(r) { return stageOpen(r, 0); }
  function elementOpen(id) {
    const e = ELEMENT_BY_ID[id];
    return !e.unlock || cleared(e.unlock[0], e.unlock[1]);
  }
  function unlockedElements() { return ELEMENTS.filter(e => elementOpen(e.id)); }
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
      hp: 100 + u.vitality * 20,
      stamina: 100 + u.stamina * 15,
      regen: 16 * (1 + u.regen * 0.15),
      dmgMul: 1 + u.might * 0.1,
      armor: 1 - u.ward * 0.06,
      guide: 0.32 + u.insight * 0.1,
    };
  }

  /* records a stage clear; returns {newStars, firstClear} */
  function recordClear(r, s, stars) {
    const k = stageKey(r, s);
    const prev = data.stars[k] || 0;
    if (stars > prev) data.stars[k] = stars;
    save();
    return { newStars: Math.max(0, stars - prev), firstClear: prev === 0 };
  }

  return {
    load, save, reset, stageOpen, realmOpen, elementOpen, unlockedElements, totalStars, nextStage,
    upgradeCost, buy, playerStats, recordClear, cleared,
    get data() { return data; },
  };
})();
