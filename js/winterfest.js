'use strict';
/* =========================================================================
   Winterfest: the yearly December event (1-31 Dec, UTC).
   A 20-stage event chapter with its own game modes:
     gifts    GIFT RUSH       grab the presents scattered over the islands while
                              Kramplings keep coming (defeated foes can drop one too)
     snowman  SNOWMAN DEFENCE Kramplings march on the snowman: keep it standing until
                              the timer runs out
     brawl    BRAWL           classic waves, festive foes
     boss     BOSS            Gloomgrump (stage 10) and Frostbeard (stage 20)
   Twists from the campaign layer on top (Gale Force on a snowman stage, Nightfall on a
   gift hunt...). Milestones (5, 10, 15, 20) award exclusive hats; the event quests award
   Snowflakes for the token shop (exclusive colours, a hat, gem caches).
   The first time anyone plays it, stage 1 is a guided how-to (once ever, not each year).
   ========================================================================= */

const WINTER_REALM = {
  id: 'winterfest', name: 'Winterfest', element: 'frost',
  sky: ['#0b1636', '#1d3a6e', '#6d8fc4'], sun: '#fff8e8', sunPos: [0.8, 0.17], showSun: true,
  hills: ['#cfe3f5', '#9dbcdd', '#6d8fbd'], fog: '#e6f2ff',
  top: '#ffffff', topDark: '#d3e8f7', rock: '#5f6f8f', rockDark: '#3b4766',
  ambient: 'snow', tint: '#7fe0ff', clouds: true, decor: 'winter',
};

const WINTER_MODES = {
  gifts: { name: 'Gift Rush', icon: 'gift', goal: n => `Grab ${n} presents` },
  snowman: { name: 'Snowman Defence', icon: 'snowman', goal: n => `Protect the snowman for ${n}s` },
  brawl: { name: 'Brawl', icon: 'swords', goal: () => 'Defeat every Krampling' },
  boss: { name: 'Boss', icon: 'crown', goal: () => 'Defeat the boss' },
};

const WINTER_BOSSES = {
  gloomgrump: { name: 'Gloomgrump', title: 'Thief of Presents', element: 'void', hat: 'santa' },
  frostbeard: { name: 'Frostbeard', title: 'King of the Long Winter', element: 'frost', hat: 'crown' },
};

// [mode, twist, goal amount]
const WINTER_STAGES = [
  ['gifts', 'none', 5], ['brawl', 'none', 0], ['snowman', 'none', 35], ['gifts', 'lowgrav', 6], ['brawl', 'elite', 0],
  ['snowman', 'gale', 40], ['gifts', 'night', 6], ['brawl', 'swarm', 0], ['gifts', 'drift', 7], ['boss', 'none', 0],
  ['brawl', 'gale', 0], ['snowman', 'frenzy', 45], ['gifts', 'tight', 7], ['brawl', 'elite', 0], ['snowman', 'night', 45],
  ['gifts', 'swarm', 8], ['brawl', 'frenzy', 0], ['snowman', 'lowgrav', 50], ['gifts', 'gale', 8], ['boss', 'none', 0],
].map(([mode, twist, n], i) => ({ i, mode, twist, n }));
const WINTER_COUNT = WINTER_STAGES.length;
const WINTER_MILESTONES = { 4: 'elf', 9: 'antlers', 14: 'tophat', 19: 'santa' };   // stage index -> exclusive hat

const winterKey = i => 'w-' + i;
const winterLabel = i => 'W-' + (i + 1);
function winterStars(i) { return Save.data.winter.stars[winterKey(i)] || 0; }
function winterOpen(i) { return i === 0 || winterStars(i - 1) > 0; }

// festive foes: Kramplings in elf caps and pom beanies, mostly frost and wind
function winterFoe(rng, i, d, type) {
  const el = rng() < 0.55 ? 'frost' : rng() < 0.5 ? 'wind' : 'none';
  return { type, element: el, d, hat: rng() < 0.5 ? 'elf' : 'beanie', hpMul: 0.95 + i * 0.03 };
}

/* one event stage: arena, foes and the mode's goal */
function buildWinterStage(i) {
  const st = WINTER_STAGES[i];
  const d = lerp(0.22, 0.95, i / (WINTER_COUNT - 1));
  const rng = mulberry32(7717 + i * 104729);
  const def = { winter: true, i, mode: st.mode, twist: st.twist, n: st.n, d, realm: WINTER_REALM, waves: [], boss: st.mode === 'boss' };
  let arena;
  if (st.mode === 'boss') arena = BOSS_ARENA;
  else if (st.mode === 'snowman') arena = { name: 'Snowfield', isl: [[800, 700, 760], [330, 590, 200], [1270, 590, 200], [800, 470, 200]] };   // a wide main island for the snowman
  else arena = ARENAS[(i * 5 + 3) % ARENAS.length];
  def.arena = twistArena(arena, st.mode === 'snowman' && st.twist === 'tight' ? 'none' : st.twist);
  const pickType = () => { const r = rng(); return r < 0.55 ? 'grunt' : r < 0.8 ? 'caster' : 'brute'; };
  if (st.mode === 'brawl') {
    const nW = i < 5 ? 2 : 3;
    for (let w = 0; w < nW; w++) {
      const n = Math.min(4, 2 + Math.floor(i / 7) + (w === nW - 1 ? 1 : 0)) + (st.twist === 'swarm' ? 1 : 0);
      const wave = Array.from({ length: n }, () => winterFoe(rng, i, d, pickType()));
      if (st.twist === 'swarm') wave.forEach(s => { s.hpMul *= 0.62; });
      if (st.twist === 'frenzy') wave.forEach(s => { s.speedMul = 1.28; s.cdMul = 0.78; });
      def.waves.push(wave);
    }
    if (st.twist === 'elite') Object.assign(def.waves[def.waves.length - 1][0], { type: 'brute', elite: true, hpMul: 2.2, element: 'frost' });
  } else if (st.mode === 'boss') {
    const b = WINTER_BOSSES[i < 10 ? 'gloomgrump' : 'frostbeard'];
    def.waves.push([winterFoe(rng, i, d, 'grunt'), winterFoe(rng, i, d, 'caster')]);
    def.waves.push([{ type: 'boss', element: b.element, d, hat: b.hat, boss: { name: b.name, title: b.title }, hpMul: i < 10 ? 7.5 : 11 }]);
  } else {
    // gifts / snowman: a steady trickle of foes instead of waves
    def.trickle = { cap: Math.min(4, 2 + Math.floor(i / 6)) + (st.twist === 'swarm' ? 1 : 0), every: lerp(4.2, 2.6, i / (WINTER_COUNT - 1)), spec: () => {
      const s = winterFoe(rng, i, d, pickType());
      if (st.twist === 'swarm') s.hpMul *= 0.62;
      if (st.twist === 'frenzy') { s.speedMul = 1.28; s.cdMul = 0.78; }
      return s;
    } };
    if (st.mode === 'snowman') def.snowmanHp = Math.round(90 + i * 3);
  }
  return def;
}
