'use strict';
/* =========================================================================
   Meta: the live features around the fights.
   - Arena: best-of-three duels with trophies and tiers. The opponent is a
     computer fighter built like a player at your rank, and the match starts
     straight away. (Live matchmaking lives on the multiplayer branch.)
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

  const BODIES = ['#f1ece4', '#e6e9f2', '#efe6f2', '#e9f0e6', '#f3e9e1', '#e4edf0'];
  const DUEL_ARENAS = ['Mainland', 'Summit', 'Crossing', 'Islets', 'Drift', 'Twin Peaks'];
  function statsFrom(up) {
    return {
      hp: Math.round((120 + up.vitality * 20) * 1.2), dmgMul: 1 + up.might * 0.1, armor: 1 - up.ward * 0.06, cdMul: 1 - up.focus * 0.06,
      speedMul: 1 + up.swift * 0.06, jumpMul: 1 + up.swift * 0.03, knockMul: 1 - up.anchor * 0.08,
    };
  }
  // how a fallback opponent looks: usually the classic pale body, but often a shop colour
  // and sometimes a hat, like real players dress up (event exclusives only while that event runs)
  function rivalLook() {
    const live = c => !c.event || Meta.winterLive();
    const cols = COLOURS.filter(c => c.id !== 'snow' && live(c)), hats = HATS.filter(live);
    return {
      body: Math.random() < 0.45 && cols.length ? pick(cols).body : pick(BODIES),
      hat: Math.random() < 0.4 && hats.length ? pick(hats).id : null,
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
    const pool = ELEMENTS.filter(e => e.id !== 'tempo').map(e => ({ id: e.id, w: 1 + ((e.event ? e.tokenPrice : e.price) / 2500) * frac * 4 }));
    const loadout = [];
    while (loadout.length < 3 && pool.length) {
      let r = Math.random() * pool.reduce((t, p) => t + p.w, 0), k = 0;
      while (k < pool.length - 1 && (r -= pool[k].w) > 0) k++;
      loadout.push(pool.splice(k, 1)[0].id);
    }
    const tier = tierOf(tr);
    return {
      bot: true, name: playerName(), trophies: tr, tier, title: tier.label, loadout, element: loadout[0],
      d, upgrades: up, stats: statsFrom(up), ...rivalLook(),
      realm: randi(0, REALMS.length - 1), arena: pick(DUEL_ARENAS), seed: randi(1, 999),
    };
  }
  /* --------------------------------------------------------- seasons */
  // Arena seasons follow the calendar quarters (UTC): Jan, Apr, Jul and Oct. October-December
  // 2026 is Season 1. When a season ends, trophies are halved, the season's best tier pays a
  // gem reward, tier rewards can be earned again, and a summary is shown on the next visit.
  const SEASON_REWARD = [40, 100, 180, 280, 400, 560, 800];   // by best tier reached (Bronze..Legend)
  function seasonOf(t = Date.now()) {
    const d = new Date(t), y = d.getUTCFullYear(), q = Math.floor(d.getUTCMonth() / 3);
    return { n: Math.max(1, (y - 2026) * 4 + q - 2), start: Date.UTC(y, q * 3, 1), end: Date.UTC(y, q * 3 + 3, 1) };
  }
  function syncSeason() {
    const a = Save.data.arena, s = seasonOf();
    if (!a.season) { a.season = s.n; a.seasonPeak = a.trophies; Save.save(); return s; }
    if (a.season >= s.n) return s;
    const ended = a.season, before = a.trophies, peak = Math.max(a.seasonPeak || 0, before), pt = tierOf(peak);
    const after = Math.round(before / 2), reward = SEASON_REWARD[pt.i];
    a.history = (a.history || []).concat({ season: ended, peak, tier: pt.label, final: before }).slice(-12);
    a.trophies = after; a.seasonPeak = after; a.streak = 0; a.tiersClaimed = tierOf(after).i; a.season = s.n;
    Save.data.essence += reward;
    a.pending = { ended, peak, tier: pt.label, tierId: pt.id, color: pt.color, before, after, reward, next: s.n };
    Save.save();
    return s;
  }
  function takeSeasonSummary() { syncSeason(); const p = Save.data.arena.pending; if (p) { Save.data.arena.pending = null; Save.save(); } return p || null; }

  // the opponent is ready at once: no search, no waiting
  async function findMatch() { return makeRival(); }

  /* ----------------------------------------------------------- arena */
  function recordDuel(won, rival) {
    syncSeason();
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
    a.seasonPeak = Math.max(a.seasonPeak || 0, a.trophies);
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
    const tokens = 0;   // event tokens come from event quests only
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
  // quest types that only appear in an event's own quests (never as daily quests)
  const EVENT_ONLY = [
    { type: 'gifts', text: q => `Grab ${q.n} presents in Winterfest` },
    { type: 'evStages', text: q => `Clear ${q.n} Winterfest stage${q.n > 1 ? 's' : ''}` },
    { type: 'snowman', text: q => `Win ${q.n} Snowman Defence${q.n > 1 ? 's' : ''}` },
    { type: 'evKills', text: q => `Defeat ${q.n} Kramplings` },
  ];
  const POOL_BY_TYPE = Object.fromEntries(QUEST_POOL.concat(EVENT_ONLY).map(q => [q.type, q]));
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
  ].map(e => Object.assign({ kind: 'element' }, e, { start: Date.parse(e.start), end: Date.parse(e.end) }));
  // Winterfest comes back every year, 1-31 December (UTC). Its rewards are cosmetics:
  // milestone hats in its 20-stage chapter, and colours / a hat in its token shop.
  // the years are worked out from today's date, so it keeps coming back with no end year
  const thisYear = new Date(Date.now()).getUTCFullYear();
  for (let y = 2026; y <= thisYear + 1; y++) EVENTS.push({
    id: 'winterfest-' + y, kind: 'winterfest', name: 'Winterfest', element: null, color: '#7fe0ff', deep: '#e2394b',
    start: Date.UTC(y, 11, 1), end: Date.UTC(y + 1, 0, 1),
    tagline: 'Kramplings are loose in the snow. Grab the presents, defend the snowmen and take back Winterfest from Frostbeard.',
  });
  const CACHE = { cost: 100, gems: 150 };
  // Event quests: three new ones every day (00:00 UTC), worth 100-120 tokens in total,
  // so an event element takes several days of play. Spare tokens go to the gem cache.
  const EVENT_POOL = [
    { type: 'duels', n: [3, 4] }, { type: 'duelWins', n: [2, 2] }, { type: 'kills', n: [35, 50] },
    { type: 'ringouts', n: [10, 15] }, { type: 'stages', n: [2, 3] }, { type: 'stars3', n: [1, 2] },
    { type: 'combo', n: [8, 12], max: true }, { type: 'endlessKills', n: [25, 40] },
  ];
  const WINTER_POOL = [
    { type: 'gifts', n: [8, 14] }, { type: 'evStages', n: [2, 3] }, { type: 'snowman', n: [1, 2] },
    { type: 'evKills', n: [20, 35] }, { type: 'ringouts', n: [8, 12] }, { type: 'combo', n: [8, 12], max: true },
  ];
  function syncEventDaily() {
    const s = Save.data.event, t = today();
    if (s.day === t && Array.isArray(s.list) && s.list.length) return s.list;
    const ev = liveEvent();
    const pool = ev && ev.kind === 'winterfest' ? WINTER_POOL : EVENT_POOL;
    const picks = pool.slice().sort(() => Math.random() - 0.5).slice(0, 3);
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
    const base = { ev, tokens: s.tokens, quests, refresh: (today() + 1) * DAY, left: ev.end - Date.now(), upcoming: upcomingEvents(), cache: CACHE };
    if (ev.kind === 'winterfest') {
      const shop = COLOURS.filter(c => c.event === 'winterfest').map(c => ({ kind: 'colour', id: c.id, name: c.name, cost: c.tokens, owned: Cosmetics.ownsColour(c.id) }))
        .concat(HATS.filter(h => h.event === 'winterfest' && h.tokens).map(h => ({ kind: 'hat', id: h.id, name: h.name, cost: h.tokens, owned: Cosmetics.ownsHat(h.id) })));
      const cleared = WINTER_STAGES.filter(w => winterStars(w.i) > 0).length;
      const stars = WINTER_STAGES.reduce((t, w) => t + winterStars(w.i), 0);
      return Object.assign(base, { shop, chapter: { cleared, stars, total: WINTER_COUNT } });
    }
    return Object.assign(base, { owned: Save.elementOpen(ev.element), price: ELEMENT_BY_ID[ev.element].tokenPrice });
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
  function buyEventCosmetic(kind, id) {
    const ev = syncEvent();
    if (!ev || ev.kind !== 'winterfest') return false;
    const def = kind === 'hat' ? HAT_BY_ID[id] : COLOUR_BY_ID[id];
    const s = Save.data.event;
    if (!def || def.event !== 'winterfest' || !def.tokens || (kind === 'hat' ? Cosmetics.ownsHat(id) : Cosmetics.ownsColour(id)) || s.tokens < def.tokens) return false;
    s.tokens -= def.tokens;
    Cosmetics.grant(kind, id);
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
      event: e ? e.quests.filter(q => q.done && !q.claimed).length + (e.ev.kind === 'element' && !e.owned && e.tokens >= e.price ? 1 : 0) : 0,
    };
  }

  function fmtLeft(ms) {
    const m = Math.max(0, Math.floor(ms / 60000)), dd = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return dd > 0 ? `${dd}D ${h}H` : h > 0 ? `${h}H ${mm}M` : `${Math.max(1, mm)}M`;
  }

  return {
    TIERS, EVENTS, tierOf, makeRival, findMatch, recordDuel, seasonOf, syncSeason, takeSeasonSummary,
    track, claimDaily, claimBonus, dailyState, eventState, claimEvent, buyEventElement, buyEventCosmetic, buyCache, elementEvent, liveEvent,
    winterLive: () => { const e = liveEvent(); return !!(e && e.kind === 'winterfest'); },
    claimable, fmtLeft, onNotify: cb => listeners.push(cb), questText,
  };
})();
