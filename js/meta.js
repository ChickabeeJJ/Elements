'use strict';
/* =========================================================================
   Meta: the live features around the fights.
   - Arena: best-of-three duels with trophies and tiers. A live rival is used
     when the platform can provide one (Platform.findLiveMatch); after 8
     seconds without one, a computer opponent at the player's rank is used.
   - Daily quests (reset at 00:00 UTC) paid in gems.
   - Hand-scheduled events (about a month each) with an exclusive element
     earned with event tokens. No event scheduled means no Event content.
   Everything is stored in the regular save. No personal data is used: fallback
   opponents' names are generated, and nothing about the player is shared.
   ========================================================================= */

const Meta = (() => {
  const DAY = 86400000;
  const today = () => Math.floor(Date.now() / DAY);
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
  // Fallback opponents are built like real players: a player-style name, upgrades and a
  // three-element loadout, all scaled to their rank, so higher ranks meet stronger play.
  const NAME_A = ['Ash', 'Brisk', 'Cinder', 'Dusk', 'Ember', 'Flint', 'Grit', 'Haze', 'Iris', 'Jolt', 'Kite', 'Lumen', 'Moss', 'Nova', 'Onyx', 'Pike', 'Quill', 'Rook', 'Sable', 'Thistle', 'Umber', 'Vex', 'Wren', 'Zephyr', 'Blaze', 'Echo', 'Frost', 'Gale', 'Pixel', 'Storm'];
  const NAME_B = ['fang', 'wick', 'spark', 'hollow', 'strike', 'vale', 'crest', 'shade', 'bloom', 'ward', 'drift', 'rune', 'claw', 'fox', 'byte', 'wolf', 'blade', 'star'];
  function playerName(rng = Math.random) {
    const pk = arr => arr[Math.floor(rng() * arr.length)], ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
    const a = pk(NAME_A), b = pk(NAME_B), n = ri(2, 99);
    switch (ri(0, 4)) {
      case 0: return a + b[0].toUpperCase() + b.slice(1);
      case 1: return (a + '_' + b).toLowerCase() + n;
      case 2: return a + n;
      case 3: return a.toLowerCase() + b;
      default: return a + b[0].toUpperCase() + b.slice(1) + ri(1, 9);
    }
  }

  /* ----------------------------------------------------- leaderboard */
  // Arena top 10. The ladder is seeded per day and its trophy counts move minute by
  // minute; the player's own row is placed by their real trophies.
  function leaderboard() {
    const day = today(), rng = mulberry32(day * 7919 + 13);
    const mins = (Date.now() % DAY) / 60000, dayFrac = mins / 1440;
    const rare = ELEMENTS.slice().sort((a, b) => (b.event ? b.tokenPrice : b.price) - (a.event ? a.tokenPrice : a.price)).slice(0, 18);
    let base = 4300 + rng() * 500;
    const rows = [];
    for (let i = 0; i < 10; i++) {
      const name = playerName(rng), el = rare[Math.floor(rng() * rare.length)].id;
      const gain = rng() * 160 * dayFrac, wobble = Math.sin(mins / (6 + rng() * 8) + i * 1.7) * (12 + rng() * 18);
      rows.push({ name, el, trophies: Math.round(base + gain + wobble) });
      base -= 60 + rng() * 170;
    }
    const mine = Save.data.arena.trophies;
    rows.sort((a, b) => b.trophies - a.trophies);
    const you = { name: '', el: Save.loadout()[0], trophies: mine, you: true };
    let yourRank;
    const at = rows.findIndex(r => mine > r.trophies);
    if (at >= 0) { rows.splice(at, 0, you); rows.length = 10; yourRank = at + 1; }
    else yourRank = 10 + Math.max(1, Math.round(16000 * Math.exp(-mine / 650)));
    rows.forEach((r, i) => { r.rank = i + 1; r.tier = tierOf(r.trophies); });
    return { rows, you: Object.assign(you, { rank: yourRank, tier: tierOf(mine) }) };
  }
  const BODIES = ['#f1ece4', '#e6e9f2', '#efe6f2', '#e9f0e6', '#f3e9e1', '#e4edf0'];
  const DUEL_ARENAS = ['Mainland', 'Summit', 'Crossing', 'Islets', 'Drift', 'Twin Peaks'];
  function statsFrom(up) {
    return {
      hp: 120 + up.vitality * 20, dmgMul: 1 + up.might * 0.1, armor: 1 - up.ward * 0.06, cdMul: 1 - up.focus * 0.06,
      speedMul: 1 + up.swift * 0.06, jumpMul: 1 + up.swift * 0.03, knockMul: 1 - up.anchor * 0.08,
    };
  }
  function makeRival() {
    const a = Save.data.arena;
    const tr = Math.max(0, Math.round(a.trophies + rand(-80, 80)));
    const frac = clamp(0.08 + tr / 3200, 0, 1);   // how far along a player at this rank would be
    const d = clamp(0.3 + tr / 2200, 0.3, 1.5);
    const up = {};
    for (const u of UPGRADES) up[u.id] = clamp(Math.round(u.max * frac * rand(0.75, 1.15)), 0, u.max);
    // three different elements; higher ranks lean toward the rarer, pricier ones
    const pool = ELEMENTS.map(e => ({ id: e.id, w: 1 + ((e.event ? e.tokenPrice : e.price) / 2500) * frac * 4 }));
    const loadout = [];
    while (loadout.length < 3 && pool.length) {
      let r = Math.random() * pool.reduce((t, p) => t + p.w, 0), k = 0;
      while (k < pool.length - 1 && (r -= pool[k].w) > 0) k++;
      loadout.push(pool.splice(k, 1)[0].id);
    }
    const tier = tierOf(tr);
    return {
      bot: true, name: playerName(), trophies: tr, tier, title: tier.label, loadout, element: loadout[0],
      d, upgrades: up, stats: statsFrom(up), body: pick(BODIES),
      realm: randi(0, REALMS.length - 1), arena: pick(DUEL_ARENAS), seed: randi(1, 999),
    };
  }
  // Look for a live opponent for up to 8 seconds; only then fall back to a computer opponent.
  const SEARCH_MS = 8000;
  async function findMatch(isCancelled = () => false) {
    const t0 = Date.now();
    while (Date.now() - t0 < SEARCH_MS) {
      if (isCancelled()) return null;
      let live = null;
      try { live = await Promise.race([Platform.findLiveMatch(), new Promise(r => setTimeout(() => r(null), 1000))]); } catch (e) { live = null; }
      if (live) return live;
      await new Promise(r => setTimeout(r, Math.max(0, Math.min(1000, SEARCH_MS - (Date.now() - t0)))));
    }
    return isCancelled() ? null : makeRival();
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
    const tokens = ev ? (won ? 15 : 5) : 0;   // tokens only while an event is live
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
  // Events are added by hand: give each one an id, its exclusive element, the dates
  // it runs (UTC, about a month) and its quests. Outside those dates the Event tab is
  // empty. An event's element can only be unlocked while that event is live.
  const EVENTS = [
    {
      id: 'syserror', name: 'System Error', element: 'glitch', color: '#ff4fe1', deep: '#19d3ff',
      start: '2026-11-01T00:00:00Z', end: '2026-12-01T00:00:00Z',
      tagline: 'Something broke out of the game\'s code. Corrupt, cut, paste and crash your way to the Glitch.',
    },
  ].map(e => Object.assign({}, e, { start: Date.parse(e.start), end: Date.parse(e.end) }));
  const CACHE = { cost: 100, gems: 150 };
  // Event quests: three new ones every day (00:00 UTC), worth 100-120 tokens in total,
  // so an event element takes several days of play. Spare tokens go to the gem cache.
  const EVENT_POOL = [
    { type: 'duels', n: [3, 4] }, { type: 'duelWins', n: [2, 2] }, { type: 'kills', n: [35, 50] },
    { type: 'ringouts', n: [10, 15] }, { type: 'stages', n: [2, 3] }, { type: 'stars3', n: [1, 2] },
    { type: 'combo', n: [8, 12], max: true }, { type: 'endlessKills', n: [25, 40] },
  ];
  function syncEventDaily() {
    const s = Save.data.event, t = today();
    if (s.day === t && Array.isArray(s.list) && s.list.length) return s.list;
    const picks = EVENT_POOL.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const total = round5(rand(100, 120));
    const a = round5(total / 3), b = round5(total / 3);
    const tokens = [a, b, total - a - b];
    s.day = t;
    s.list = picks.map((p, i) => ({ type: p.type, n: p.n[0] >= 20 ? round5(rand(p.n[0], p.n[1])) : randi(p.n[0], p.n[1]), tokens: tokens[i], max: !!p.max, prog: 0, claimed: false }));
    Save.save();
    return s.list;
  }

  const liveEvent = () => { const now = Date.now(); return EVENTS.find(e => now >= e.start && now < e.end) || null; };
  const upcomingEvents = () => EVENTS.filter(e => e.start > Date.now()).sort((a, b) => a.start - b.start);
  function syncEvent() {
    const ev = liveEvent(), s = Save.data.event;
    if (ev && s.id !== ev.id) { Object.assign(s, { cycle: 0, id: ev.id, tokens: 0, prog: {}, claimed: [], day: -1, list: [] }); Save.save(); }
    return ev;
  }
  // null when no event is running
  function eventState() {
    const ev = syncEvent();
    if (!ev) return null;
    const s = Save.data.event;
    const quests = syncEventDaily().map((q, i) => Object.assign({}, q, { i, done: q.prog >= q.n, text: questText(q) }));
    return { ev, tokens: s.tokens, quests, refresh: (today() + 1) * DAY, owned: Save.elementOpen(ev.element), price: ELEMENT_BY_ID[ev.element].tokenPrice, left: ev.end - Date.now(), upcoming: upcomingEvents(), cache: CACHE };
  }
  function claimEvent(i) {
    if (!syncEvent()) return 0;
    const s = Save.data.event, q = syncEventDaily()[i];
    if (!q || q.claimed || q.prog < q.n) return 0;
    q.claimed = true; s.tokens += q.tokens; Save.save();
    return q.tokens;
  }
  function buyEventElement() {
    const ev = syncEvent();
    if (!ev) return false;
    const s = Save.data.event, el = ELEMENT_BY_ID[ev.element];
    if (Save.elementOpen(el.id) || s.tokens < el.tokenPrice) return false;
    s.tokens -= el.tokenPrice;
    Save.grantElement(el.id);
    return true;
  }
  function buyCache() {
    const s = Save.data.event;
    if (!syncEvent() || s.tokens < CACHE.cost) return false;
    s.tokens -= CACHE.cost; Save.data.essence += CACHE.gems; Save.save();
    return true;
  }
  // the event an exclusive element belongs to: live, upcoming or ended
  function elementEvent(id) {
    const e = ELEMENT_BY_ID[id];
    if (!e || !e.event) return null;
    const now = Date.now();
    const evs = EVENTS.filter(x => x.element === id);
    const ev = evs.find(x => now >= x.start && now < x.end) || evs.filter(x => x.start > now).sort((a, b) => a.start - b.start)[0] || evs[evs.length - 1];
    return ev ? Object.assign({}, ev, { live: now >= ev.start && now < ev.end, upcoming: ev.start > now }) : null;
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
    const ev = syncEvent();
    if (!ev) return;
    for (const q of syncEventDaily()) {
      if (q.type !== type || q.claimed || q.prog >= q.n) continue;
      q.prog = Math.min(q.n, q.max ? Math.max(q.prog, n) : q.prog + n);
      if (q.prog >= q.n) notify('EVENT QUEST COMPLETE · ' + questText(q).toUpperCase());
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
      event: e ? e.quests.filter(q => q.done && !q.claimed).length + (!e.owned && e.tokens >= e.price ? 1 : 0) : 0,
    };
  }

  function fmtLeft(ms) {
    const m = Math.max(0, Math.floor(ms / 60000)), dd = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return dd > 0 ? `${dd}D ${h}H` : h > 0 ? `${h}H ${mm}M` : `${Math.max(1, mm)}M`;
  }

  return {
    TIERS, EVENTS, tierOf, makeRival, findMatch, recordDuel,
    track, claimDaily, claimBonus, dailyState, eventState, claimEvent, buyEventElement, buyCache, elementEvent, liveEvent,
    claimable, fmtLeft, leaderboard, onNotify: cb => listeners.push(cb), questText,
  };
})();
