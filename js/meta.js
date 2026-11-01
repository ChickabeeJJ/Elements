'use strict';
/* =========================================================================
   Meta: the live features around the fights.
   - Arena: 1v1 duels with trophies and tiers. A live rival is used when the
     platform can provide one (Platform.findLiveMatch); otherwise a clearly
     labelled bot is matched at the player's level.
   - Daily quests (reset at 00:00 UTC) paid in gems.
   - Weekly events, each with an exclusive element earned with event tokens.
   Everything is stored in the regular save. No personal data is used: bot
   names are generated, and nothing about the player is shared with anyone.
   ========================================================================= */

const Meta = (() => {
  const DAY = 86400000;
  const today = () => Math.floor(Date.now() / DAY);
  const EPOCH = Math.floor(Date.UTC(2026, 0, 5) / DAY);   // a Monday: events turn over on Mondays 00:00 UTC
  const EVENT_DAYS = 7;
  const mod = (a, n) => ((a % n) + n) % n;
  const listeners = [];
  const notify = text => listeners.forEach(cb => { try { cb(text); } catch (e) { /* ignore */ } });

  /* ----------------------------------------------------------- tiers */
  const TIERS = [
    { id: 'bronze', name: 'Bronze', min: 0, color: '#d9925e', reward: 0 },
    { id: 'silver', name: 'Silver', min: 300, color: '#cfd8e6', reward: 120 },
    { id: 'gold', name: 'Gold', min: 700, color: '#ffcf4a', reward: 200 },
    { id: 'platinum', name: 'Platinum', min: 1200, color: '#7ff0d8', reward: 300 },
    { id: 'diamond', name: 'Diamond', min: 1800, color: '#8ab8ff', reward: 420 },
    { id: 'master', name: 'Master', min: 2600, color: '#d58bff', reward: 600 },
    { id: 'legend', name: 'Legend', min: 3500, color: '#ff6b7d', reward: 900 },
  ];
  const ROMAN = ['', 'I', 'II', 'III'];
  function tierOf(trophies) {
    let i = 0;
    for (let k = 0; k < TIERS.length; k++) if (trophies >= TIERS[k].min) i = k;
    const T = TIERS[i], next = TIERS[i + 1] || null;
    const span = next ? next.min - T.min : 1;
    const into = trophies - T.min;
    const div = next ? 3 - Math.min(2, Math.floor((into / span) * 3)) : 0;   // III -> II -> I
    return { i, id: T.id, name: T.name, color: T.color, min: T.min, next, div, label: T.name.toUpperCase() + (div ? ' ' + ROMAN[div] : ''), pct: next ? into / span : 1 };
  }

  /* ------------------------------------------------------------ bots */
  const BOT_A = ['Ash', 'Brisk', 'Cinder', 'Dusk', 'Ember', 'Flint', 'Grit', 'Haze', 'Iris', 'Jolt', 'Kite', 'Lumen', 'Moss', 'Nova', 'Onyx', 'Pike', 'Quill', 'Rook', 'Sable', 'Thistle', 'Umber', 'Vex', 'Wren', 'Zephyr'];
  const BOT_B = ['fang', 'wick', 'spark', 'hollow', 'strike', 'vale', 'crest', 'shade', 'bloom', 'ward', 'drift', 'rune', 'claw', 'gale'];
  const DUEL_ARENAS = ['Mainland', 'Summit', 'Crossing', 'Islets', 'Drift', 'Twin Peaks'];
  function makeRival() {
    const a = Save.data.arena;
    const tr = Math.max(0, Math.round(a.trophies + rand(-90, 90)));
    const d = clamp(0.3 + tr / 2200, 0.3, 1.5);
    const name = pick(BOT_A) + pick(BOT_B);
    return {
      bot: true, name, trophies: tr, tier: tierOf(tr), title: 'BOT · ' + tierOf(tr).label,
      element: pick(ELEMENTS).id, d, hp: Math.round(150 + d * 110), dmg: 1 + d * 0.35,
      realm: randi(0, REALMS.length - 1), arena: pick(DUEL_ARENAS), seed: randi(1, 999),
    };
  }
  // Ask the platform for a live rival; resolve to a bot when none is available.
  async function findMatch() {
    let live = null;
    try { live = await Platform.findLiveMatch(); } catch (e) { live = null; }
    return live || makeRival();
  }

  /* ----------------------------------------------------------- arena */
  function recordDuel(won, rival) {
    const a = Save.data.arena;
    const before = a.trophies;
    const diff = clamp(((rival ? rival.trophies : before) - before) / 400, -1, 1);
    let delta;
    if (won) {
      a.wins++; a.streak = a.streak > 0 ? a.streak + 1 : 1; a.bestStreak = Math.max(a.bestStreak, a.streak);
      delta = Math.round(28 + diff * 6 + Math.min(a.streak - 1, 4) * 2);
    } else {
      a.losses++; a.streak = a.streak < 0 ? a.streak - 1 : -1;
      delta = -Math.round((18 - diff * 4) * (before < TIERS[1].min ? 0.5 : 1));
    }
    a.trophies = Math.max(0, before + delta);
    delta = a.trophies - before;
    a.peak = Math.max(a.peak, a.trophies);
    // first time in a tier pays its reward once
    let promoted = null, tierGems = 0;
    const t = tierOf(a.trophies);
    while (a.tiersClaimed < t.i) {
      a.tiersClaimed++;
      tierGems += TIERS[a.tiersClaimed].reward;
      promoted = TIERS[a.tiersClaimed];
    }
    const gems = (won ? 30 + t.i * 8 : 10) + tierGems;
    const ev = syncEvent();
    const tokens = won ? 15 : 5;
    Save.data.event.tokens += tokens;
    Save.data.essence += gems;
    Save.save();
    Platform.submitScore(a.trophies);
    return { delta, trophies: a.trophies, tier: t, gems, tierGems, tokens, promoted, event: ev };
  }

  /* ---------------------------------------------------------- quests */
  // type: the counter it listens to. max: progress is the best single value, not a sum.
  const QUEST_POOL = [
    { type: 'kills', n: [25, 40], gems: [30, 45], text: q => `Defeat ${q.n} foes` },
    { type: 'ringouts', n: [8, 14], gems: [35, 50], text: q => `Ring out ${q.n} foes` },
    { type: 'stages', n: [2, 3], gems: [35, 50], text: q => `Clear ${q.n} campaign stages` },
    { type: 'stars3', n: [1, 2], gems: [40, 55], text: q => `Earn 3 stars on ${q.n} stage${q.n > 1 ? 's' : ''}` },
    { type: 'duels', n: [2, 3], gems: [35, 50], text: q => `Play ${q.n} Arena matches` },
    { type: 'duelWins', n: [1, 2], gems: [45, 60], text: q => `Win ${q.n} Arena match${q.n > 1 ? 'es' : ''}` },
    { type: 'endlessKills', n: [20, 35], gems: [35, 50], text: q => `Defeat ${q.n} foes in Endless` },
    { type: 'combo', n: [8, 12], gems: [30, 45], max: true, text: q => `Reach a ${q.n}× combo` },
    { type: 'gems', n: [100, 160], gems: [30, 40], text: q => `Earn ${q.n} gems in battle` },
    { type: 'elKills', n: [12, 20], gems: [35, 50], el: true, text: q => `Defeat ${q.n} foes with ${(ELEMENT_BY_ID[q.el] || NEUTRAL).name}` },
  ];
  const POOL_BY_TYPE = Object.fromEntries(QUEST_POOL.map(q => [q.type, q]));
  const DAILY_BONUS = 60;
  const round5 = v => Math.max(1, Math.round(v / 5) * 5);

  function syncDaily() {
    const d = Save.data.daily, t = today();
    if (d.day === t && d.list.length) return d;
    const types = QUEST_POOL.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    d.day = t; d.bonus = false;
    d.list = types.map(p => {
      const n = p.n[0] >= 20 ? round5(rand(p.n[0], p.n[1])) : randi(p.n[0], p.n[1]);
      const q = { type: p.type, n, gems: round5(rand(p.gems[0], p.gems[1])), prog: 0, claimed: false };
      if (p.el) q.el = pick(Save.unlockedElements()).id;
      return q;
    });
    Save.save();
    return d;
  }
  const questText = q => (POOL_BY_TYPE[q.type] || { text: () => q.type }).text(q);

  /* ---------------------------------------------------------- events */
  const EVENTS = [
    { id: 'molten', name: 'Molten Rising', element: 'magma', color: '#ff8a4a', deep: '#a8240e', tagline: 'The islands crack open and lava floods the realms. Master the Magma.' },
    { id: 'polar', name: 'Polar Lights', element: 'aurora', color: '#8ff7e4', deep: '#5b4fd8', tagline: 'The night sky ignites over the islands. Bend the Aurora to your will.' },
    { id: 'tempest', name: 'Eye of the Storm', element: 'tempest', color: '#bfe3ff', deep: '#2f63d8', tagline: 'Wind and thunder merge into one. Ride the Tempest.' },
  ];
  const EVENT_QUESTS = [
    { id: 'duels', type: 'duels', n: 3, tokens: 60 },
    { id: 'wins', type: 'duelWins', n: 2, tokens: 80 },
    { id: 'kills', type: 'kills', n: 60, tokens: 60 },
    { id: 'ringouts', type: 'ringouts', n: 15, tokens: 60 },
    { id: 'stages', type: 'stages', n: 4, tokens: 70 },
    { id: 'combo', type: 'combo', n: 10, tokens: 50, max: true },
    { id: 'endless', type: 'endlessKills', n: 40, tokens: 70 },
  ];
  const CACHE = { cost: 100, gems: 150 };

  function eventInfo(offset = 0) {
    const cycle = Math.floor((today() - EPOCH) / EVENT_DAYS) + offset;
    const ev = EVENTS[mod(cycle, EVENTS.length)];
    const start = (EPOCH + cycle * EVENT_DAYS) * DAY;
    return Object.assign({}, ev, { cycle, start, end: start + EVENT_DAYS * DAY });
  }
  function syncEvent() {
    const ev = eventInfo(), s = Save.data.event;
    if (s.cycle !== ev.cycle) { Object.assign(s, { cycle: ev.cycle, id: ev.id, tokens: 0, prog: {}, claimed: [] }); Save.save(); }
    return ev;
  }
  function eventState() {
    const ev = syncEvent(), s = Save.data.event;
    const quests = EVENT_QUESTS.map(q => {
      const prog = Math.min(q.n, s.prog[q.id] || 0);
      return Object.assign({}, q, { prog, done: prog >= q.n, claimed: s.claimed.includes(q.id), text: questText(q) });
    });
    return { ev, tokens: s.tokens, quests, owned: Save.elementOpen(ev.element), price: ELEMENT_BY_ID[ev.element].tokenPrice, left: ev.end - Date.now(), upcoming: [1, 2].map(o => eventInfo(o)), cache: CACHE };
  }
  function claimEvent(id) {
    const s = Save.data.event, q = EVENT_QUESTS.find(x => x.id === id);
    if (!q || s.claimed.includes(id) || (s.prog[id] || 0) < q.n) return 0;
    s.claimed.push(id); s.tokens += q.tokens; Save.save();
    return q.tokens;
  }
  function buyEventElement() {
    const ev = syncEvent(), s = Save.data.event, el = ELEMENT_BY_ID[ev.element];
    if (Save.elementOpen(el.id) || s.tokens < el.tokenPrice) return false;
    s.tokens -= el.tokenPrice;
    Save.grantElement(el.id);
    return true;
  }
  function buyCache() {
    const s = Save.data.event;
    if (s.tokens < CACHE.cost) return false;
    s.tokens -= CACHE.cost; Save.data.essence += CACHE.gems; Save.save();
    return true;
  }
  // which event an exclusive element belongs to, and when it is next live
  function elementEvent(id) {
    const e = ELEMENT_BY_ID[id];
    if (!e || !e.event) return null;
    for (let o = 0; o <= EVENTS.length; o++) { const ev = eventInfo(o); if (ev.id === e.event) return Object.assign(ev, { live: o === 0 }); }
    return null;
  }

  /* -------------------------------------------------------- tracking */
  function track(type, n = 1, ctx = {}) {
    if (!(n > 0)) return;
    const d = syncDaily();
    for (const q of d.list) {
      if (q.type !== type || q.claimed || q.prog >= q.n || (q.el && q.el !== ctx.el)) continue;
      const p = POOL_BY_TYPE[q.type];
      q.prog = Math.min(q.n, p && p.max ? Math.max(q.prog, n) : q.prog + n);
      if (q.prog >= q.n) notify('QUEST COMPLETE · ' + questText(q).toUpperCase());
    }
    syncEvent();
    const s = Save.data.event;
    for (const q of EVENT_QUESTS) {
      if (q.type !== type || (s.prog[q.id] || 0) >= q.n) continue;
      s.prog[q.id] = Math.min(q.n, q.max ? Math.max(s.prog[q.id] || 0, n) : (s.prog[q.id] || 0) + n);
      if (s.prog[q.id] >= q.n) notify('EVENT QUEST COMPLETE · ' + questText(q).toUpperCase());
    }
  }
  function claimDaily(i) {
    const d = syncDaily(), q = d.list[i];
    if (!q || q.claimed || q.prog < q.n) return 0;
    q.claimed = true; Save.data.essence += q.gems; Save.save();
    return q.gems;
  }
  function claimBonus() {
    const d = syncDaily();
    if (d.bonus || !d.list.every(q => q.claimed)) return 0;
    d.bonus = true; Save.data.essence += DAILY_BONUS; Save.save();
    return DAILY_BONUS;
  }
  function dailyState() {
    const d = syncDaily();
    return {
      list: d.list.map((q, i) => Object.assign({}, q, { i, text: questText(q), done: q.prog >= q.n })),
      bonus: d.bonus, bonusGems: DAILY_BONUS, bonusReady: !d.bonus && d.list.every(q => q.claimed),
      left: (today() + 1) * DAY - Date.now(),
    };
  }
  function claimable() {
    const d = dailyState(), e = eventState();
    return {
      daily: d.list.filter(q => q.done && !q.claimed).length + (d.bonusReady ? 1 : 0),
      event: e.quests.filter(q => q.done && !q.claimed).length + (!e.owned && e.tokens >= e.price ? 1 : 0),
    };
  }

  function fmtLeft(ms) {
    const m = Math.max(0, Math.floor(ms / 60000)), dd = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return dd > 0 ? `${dd}D ${h}H` : h > 0 ? `${h}H ${mm}M` : `${Math.max(1, mm)}M`;
  }

  return {
    TIERS, EVENTS, tierOf, makeRival, findMatch, recordDuel,
    track, claimDaily, claimBonus, dailyState, eventState, claimEvent, buyEventElement, buyCache, elementEvent, eventInfo,
    claimable, fmtLeft, onNotify: cb => listeners.push(cb), questText,
  };
})();
