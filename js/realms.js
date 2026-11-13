'use strict';
/* =========================================================================
   Realms (themes + enemy affinity), handcrafted-by-seed stage layouts, and
   the endless-mode wave generator.
   ========================================================================= */

const REALMS = [
  {
    id: 'verdant', name: 'Verdant Vale', element: 'nature',
    sky: ['#86cfe0', '#d9efd9', '#ffe7b8'], sun: '#fff6cf', sunPos: [0.78, 0.2], showSun: true,
    hills: ['#a7d3b8', '#73b08f', '#4d8a6d'], fog: '#e9f6e6',
    top: '#8fd46b', topDark: '#5fae4c', rock: '#6b5848', rockDark: '#4a3b31',
    ambient: 'leaf', tint: '#9ae66e',
    boss: { name: 'Thornwarden', title: 'Keeper of the Vale' },
  },
  {
    id: 'ember', name: 'Ember Wastes', element: 'fire',
    sky: ['#2b1030', '#8a2e3b', '#ff9a52'], sun: '#ffcf7a', sunPos: [0.25, 0.32],
    hills: ['#9c3d3a', '#64232c', '#3b1520'], fog: '#ff8a5a',
    top: '#4a302c', topDark: '#33201f', rock: '#5c3b37', rockDark: '#3b2427',
    ambient: 'ember', tint: '#ff8a3d', glowTop: true,
    boss: { name: 'Cinder Tyrant', title: 'Lord of Ash' },
  },
  {
    id: 'reef', name: 'Tidal Reef', element: 'water',
    sky: ['#0f4c6e', '#3f95b8', '#a8e2ea'], sun: '#e8fbff', sunPos: [0.72, 0.18],
    hills: ['#5fb3c4', '#2f8399', '#1d5a70'], fog: '#c9f1f5',
    top: '#bcecff', topDark: '#86cde8', rock: '#2f7d8c', rockDark: '#1f5a67',
    ambient: 'bubble', tint: '#7cc8ff',
    boss: { name: 'Tidecaller', title: 'Voice of the Deep' },
  },
  {
    id: 'frost', name: 'Frostpeak', element: 'frost',
    sky: ['#2b4f8a', '#7fa9d6', '#e3f1fa'], sun: '#ffffff', sunPos: [0.7, 0.16], clouds: true,
    hills: ['#c0d8ec', '#8fb2d4', '#5f84ad'], fog: '#eef7ff',
    top: '#f3fbff', topDark: '#bfe0f2', rock: '#5c6f88', rockDark: '#3e4d63',
    ambient: 'snow', tint: '#9fe6ff',
    boss: { name: 'Rimeheart', title: 'The Frozen Sovereign' },
  },
  {
    id: 'storm', name: 'Stormspire', element: 'lightning',
    sky: ['#14162e', '#2d3266', '#6b6aa8'], sun: '#d7d2ff', sunPos: [0.32, 0.14],
    hills: ['#454a86', '#30335f', '#1f2141'], fog: '#8d8ccc',
    top: '#8a8fe0', topDark: '#5b5fb0', rock: '#41447a', rockDark: '#2b2d55',
    ambient: 'rain', tint: '#fff27a', flashes: true,
    boss: { name: 'Storm Herald', title: 'Voice of the Tempest' },
  },
  {
    id: 'mire', name: 'Toxic Mire', element: 'venom',
    sky: ['#1d2a17', '#4a5e2b', '#a3b85a'], sun: '#e9ff9e', sunPos: [0.3, 0.22],
    hills: ['#5b7333', '#3d5122', '#263515'], fog: '#c6dd84',
    top: '#9fcf4a', topDark: '#6c9a2a', rock: '#4a4434', rockDark: '#2f2b20',
    ambient: 'spore', tint: '#a6e35b',
    boss: { name: 'Plaguebinder', title: 'Heart of the Rot' },
  },
  {
    id: 'void', name: 'The Void Rift', element: 'void',
    sky: ['#05030c', '#1f0f38', '#4d2370'], sun: '#e0b8ff', sunPos: [0.62, 0.28],
    hills: ['#2e1b4d', '#1e1236', '#120a22'], fog: '#5b2b8a',
    top: '#b98bff', topDark: '#6d3fc0', rock: '#3b2a5e', rockDark: '#251a40',
    ambient: 'mote', tint: '#c08bff', glowTop: true,
    boss: { name: 'The Starless Regent', title: 'End of All Light' },
  },
  {
    id: 'caverns', name: 'Crystal Caverns', element: 'crystal',
    sky: ['#0b1f2e', '#14455a', '#3f8f99'], sun: '#c9fff7', sunPos: [0.7, 0.2],
    hills: ['#2a6b78', '#1b4b57', '#10323b'], fog: '#7fe0d6',
    top: '#9ff0e8', topDark: '#4fbcb2', rock: '#2f5560', rockDark: '#1d3942',
    ambient: 'shard', tint: '#9ff0e8',
    boss: { name: 'The Shardmother', title: 'Heart of the Geode' },
  },
  {
    id: 'dunes', name: 'Sunscorch Dunes', element: 'sand',
    sky: ['#e9a24a', '#f6cf86', '#fff1c9'], sun: '#fff8dc', sunPos: [0.66, 0.18], showSun: true,
    hills: ['#e2b06b', '#c48946', '#99642e'], fog: '#f7deaa',
    top: '#f0cf8a', topDark: '#d2a55c', rock: '#a8733f', rockDark: '#7a4f2a',
    ambient: 'grit', tint: '#f2c46b',
    boss: { name: 'Dunemaw', title: 'Devourer of Caravans' },
  },
  {
    id: 'citadel', name: 'Radiant Citadel', element: 'light',
    sky: ['#3b2a6e', '#b36fa8', '#ffd59a'], sun: '#fff6d6', sunPos: [0.5, 0.24], showSun: true,
    hills: ['#e7c58c', '#c39a62', '#8d6a45'], fog: '#ffe8b8',
    top: '#fff0c2', topDark: '#e8c477', rock: '#c9a46a', rockDark: '#94723f',
    ambient: 'glimmer', tint: '#fff3b0', glowTop: true, decor: 'citadel',
    boss: { name: 'Solaris Ascendant', title: 'The Final Radiance' },
  },
];
// the first seven realms keep the difficulty curve they launched with
const CLASSIC_STAGES = 56;
const STAGES_PER_REALM = 8;
const TOTAL_STAGES = REALMS.length * STAGES_PER_REALM;

/* arena layouts: [x, top y, width, motion?]. Widths are multiples of the 40-unit tile.
   The first island is where the hero spawns. Floating islands keep at least ~120 units
   of headroom above anything below them. */
const ARENAS = [
  { name: 'Mainland', isl: [[800, 680, 1040]] },
  { name: 'Summit', isl: [[800, 690, 880], [800, 450, 280]] },
  { name: 'Crossing', isl: [[800, 700, 760], [240, 560, 240], [1360, 560, 240], [800, 430, 280]] },
  { name: 'Twin Peaks', isl: [[460, 690, 520], [1140, 690, 520], [800, 470, 240]] },
  { name: 'Stairway', isl: [[640, 710, 680], [1220, 590, 280], [1460, 440, 240], [210, 580, 240], [860, 450, 240]] },
  { name: 'Islets', isl: [[800, 700, 480], [300, 640, 320], [1300, 640, 320], [540, 470, 200], [1060, 470, 200]] },
  { name: 'Drift', isl: [[800, 705, 640], [270, 580, 240, { ax: 0, ay: 60, speed: 0.9, phase: 0 }], [1330, 580, 240, { ax: 0, ay: 60, speed: 0.9, phase: 3 }], [800, 440, 240, { ax: 120, ay: 0, speed: 0.6, phase: 1 }]] },
  { name: 'Pillars', isl: [[800, 690, 440], [330, 610, 200], [1270, 610, 200], [800, 470, 160]] },
  { name: 'Causeway', isl: [[800, 700, 920], [230, 560, 160], [1370, 560, 160], [800, 470, 200]] },   // side islands sit just past the main island's ends
  { name: 'Terraces', isl: [[580, 720, 560], [1080, 640, 360], [1380, 520, 200], [300, 560, 200]] },
  { name: 'Spire', isl: [[800, 700, 640], [800, 540, 240], [800, 380, 120], [330, 600, 160], [1270, 600, 160]] },
  { name: 'Archipelago', isl: [[700, 700, 440], [1200, 700, 280], [290, 620, 200], [1010, 530, 200], [520, 480, 160]] },
];
// arenas a twist can't use (Tight trims every island, so it skips the ones that are already small)
const TWIST_ARENA_SKIP = { tight: ['Islets', 'Archipelago', 'Pillars'] };

/* Twists (special rules for a stage). Only Winterfest stages use them now: campaign
   stages are classic fights, with their variety coming from arenas and foe mixes. */
const TWISTS = {
  none:    { name: 'Classic', desc: 'A straight fight.', icon: 'swords' },
  swarm:   { name: 'Swarm', desc: 'More foes, each a little frailer.', icon: 'skull' },
  elite:   { name: 'Elite', desc: 'One foe is an Elite: bigger, tougher and glowing.', icon: 'crown' },
  gale:    { name: 'Gale Force', desc: 'Gusts sweep the arena every few seconds. Watch the arrows.', icon: 'cyclone' },
  lowgrav: { name: 'Low Gravity', desc: 'Everyone floats: higher jumps, longer flights.', icon: 'antigrav' },
  drift:   { name: 'Drifting Isles', desc: 'The side islands move.', icon: 'map' },
  frenzy:  { name: 'Frenzy', desc: 'Foes move and attack faster.', icon: 'burst' },
  night:   { name: 'Nightfall', desc: 'Darkness falls: only the area around you is lit.', icon: 'moondisc' },
  tight:   { name: 'Tight Quarters', desc: 'Every island is narrower.', icon: 'crush' },
};
function stageTwist() { return 'none'; }   // campaign stages have no twists

// apply an arena-shaping twist to a layout (returns a new layout)
function twistArena(a, twist) {
  if (twist === 'drift') return { name: a.name, isl: a.isl.map((d, i) => i === 0 || d[3] ? d : [d[0], d[1], d[2], { ax: i % 2 ? 90 : 0, ay: i % 2 ? 0 : 50, speed: 0.55 + i * 0.08, phase: i * 1.7 }]) };
  if (twist === 'tight') return { name: a.name, isl: a.isl.map(d => [d[0], d[1], Math.max(200, Math.round(d[2] * 0.72 / 40) * 40), d[3]]) };
  return a;
}
const BOSS_ARENA = { name: 'Throne', isl: [[800, 705, 960], [270, 520, 240], [1330, 520, 240]] };

const ENEMY_TYPES = {
  grunt:  { hp: 1, dmg: 1, cd: 1, scale: 1, weight: 1, speed: 250, label: 'Warrior' },
  caster: { hp: 0.8, dmg: 1.1, cd: 0.9, scale: 0.95, weight: 0.85, speed: 230, label: 'Caster' },
  brute:  { hp: 2.3, dmg: 1.5, cd: 1.3, scale: 1.25, weight: 2, speed: 190, label: 'Brute' },
  boss:   { hp: 1, dmg: 1, cd: 1.25, scale: 1.75, weight: 3.2, speed: 200, label: 'Boss' },
  rival:  { hp: 1, dmg: 1, cd: 1, scale: 1.05, weight: 1, speed: 380, label: 'Rival' },   // Arena opponent: built like a player
};

/* stat curve shared by campaign and endless; d runs 0..1 (and past 1 in endless) */
function enemyStats(type, d) {
  const t = ENEMY_TYPES[type];
  const regular = type !== 'boss' && type !== 'brute';
  return {
    // Keep the existing difficulty curve, then give regular Grunts/Casters +10% HP.
    hp: Math.round(37 * (1 + d * 2.6) * t.hp * (type === 'boss' ? 1.3 : 0.8) * (regular ? 1.1 : 1)),
    // Caster and brute attacks retain their existing damage reduction; regular enemies
    // get +10% damage relative to their previous value.
    dmgMul: (0.75 + d * 1.3) * t.dmg * (type === 'caster' || type === 'brute' ? 0.75 : 1) * (regular ? 1.1 : 1),
    // Lower cooldown + decision intervals makes enemies attack more often, without
    // shortening their existing readable attack wind-ups.
    cdMul: lerp(1.3, 0.8, Math.min(d, 1.2)) * t.cd * 0.85,
    think: lerp(0.32, 0.12, Math.min(d, 1.2)) * 0.85,
    aimErr: lerp(0.14, 0.04, Math.min(d, 1.1)),
    windupMul: lerp(2.5, 1.5, Math.min(d, 1)),
  };
}

function rollType(rng, r, s) {
  const opts = ['grunt', 'grunt', 'grunt'];
  if (s >= 1 || r >= 1) opts.push('caster');
  if (s >= 3 || r >= 1) opts.push('brute');
  if (r >= 2) opts.push('caster', 'brute');
  return opts[Math.floor(rng() * opts.length)];
}

function rollElement(rng, realm, mixChance) {
  if (rng() < mixChance) return pick(Object.keys(AFFINITY));
  return rng() < 0.8 ? realm.element : 'none';
}

// no wave fields more than two foes of the same element (three Void users at once was brutal)
const SAME_ELEMENT_CAP = 2;
function capElements(wave) {
  const seen = {};
  for (const spec of wave) {
    if (spec.element === 'none' || spec.type === 'boss') continue;
    seen[spec.element] = (seen[spec.element] || 0) + 1;
    if (seen[spec.element] > SAME_ELEMENT_CAP) spec.element = 'none';
  }
  return wave;
}

// Stormspire (lightning brutes) and the Void Rift (ranged void orbs) stack up badly:
// one brute and one caster per wave at most there, and one fewer foe overall.
const TOUGH_REALMS = { lightning: 1, void: 1 };
function capRoles(wave, realm) {
  if (!TOUGH_REALMS[realm.element]) return wave;
  let brutes = 0, casters = 0;
  for (const spec of wave) {
    if (spec.type === 'brute' && ++brutes > 1) spec.type = 'grunt';
    if (spec.type === 'caster' && ++casters > 1) spec.type = 'grunt';
  }
  return wave;
}

// hand-tuned stages that played far harder than their neighbours
// d: difficulty override, noBrutes: brutes become regular warriors
const STAGE_EASE = {
  '6-5': { d: 0.88, noBrutes: true },   // Void Rift 7-6
};
// whole chapters that played far harder than intended: lower difficulty, softer and fewer foes, a lighter boss
const CHAPTER_EASE = {
  9: { d: -0.14, hp: 0.78, dmg: 0.78, foes: -1, boss: 0.8 },   // Radiant Citadel (chapter 10)
};

/* Campaign stage: deterministic arena + list of waves. */
function buildStage(r, s) {
  const realm = REALMS[r];
  const g = r * STAGES_PER_REALM + s;
  const ease = STAGE_EASE[r + '-' + s];
  // from Crystal Caverns on, each chapter starts and ends a little harder than the last
  const late = Math.max(0, r - 7) * 0.06;
  const ce = CHAPTER_EASE[r] || null;
  const d = ease && ease.d != null ? ease.d : (r < 7 ? g / (CLASSIC_STAGES - 1) : lerp(0.72 + late, 0.92 + late * 0.7, s / (STAGES_PER_REALM - 1))) + (ce ? ce.d : 0);
  const rng = mulberry32(9137 + g * 7919);
  const mix = r === 6 ? 0.3 : 0;   // the Void Rift mixes in other elements
  const waves = [];
  if (s === STAGES_PER_REALM - 1) {
    waves.push([0, 1].map(() => ({ type: 'grunt', element: rollElement(rng, realm, mix), d })));
    waves.push([{ type: 'boss', element: realm.element, d, boss: realm.boss, hpMul: (6 + Math.min(r, 5) * 1.1) * 0.95 * 1.05 * (r >= 4 && r <= 7 ? 0.9 : 1) * (ce ? ce.boss : 1) }]);   // all bosses +5%; Stormspire..Crystal Caverns bosses -10%
    return { realm: r, stage: s, arena: BOSS_ARENA, waves, d, boss: true, twist: 'none' };
  }
  const twist = stageTwist(r, s);
  let ai = (g * 3 + r) % ARENAS.length;
  while ((TWIST_ARENA_SKIP[twist] || []).includes(ARENAS[ai].name) || (twist === 'drift' && ARENAS[ai].name === 'Drift')) ai = (ai + 1) % ARENAS.length;
  const arena = twistArena(ARENAS[ai], twist);
  // at most three waves; early stages are short and gentle
  // at most three waves of at most three foes; individual foes carry the difficulty
  const total = Math.max(2, Math.min(TOUGH_REALMS[realm.element] ? 8 : 9, 2 + Math.floor(s * 0.7) + Math.floor(Math.min(r, 5) * 0.8)) + (ce ? ce.foes : 0));
  const nW = Math.min(3, Math.ceil(total / 3));
  for (let w = 0; w < nW; w++) {
    const n = Math.floor(total / nW) + (w < total % nW ? 1 : 0);
    const wave = [];
    // from Toxic Mire on, foes get sturdier and hit harder chapter by chapter
    const tier = Math.max(0, r - 4);
    const extra = twist === 'swarm' ? 1 + (w < 2 ? 1 : 0) : 0;      // Swarm: one or two more per wave, each frailer
    for (let i = 0; i < n + extra; i++) wave.push({ type: ease && ease.noBrutes ? rollType(rng, r, s).replace('brute', 'grunt') : rollType(rng, r, s), element: rollElement(rng, realm, mix), d, hpMul: (1 + tier * 0.08) * (twist === 'swarm' ? 0.62 : 1) * (ce ? ce.hp : 1), dmgBoost: (1 + tier * 0.07) * (ce ? ce.dmg : 1) });
    if (twist === 'frenzy') for (const sp of wave) { sp.speedMul = 1.28; sp.cdMul = 0.78; }
    waves.push(capRoles(capElements(wave), realm));
  }
  // Elite: the last wave's first foe becomes a big glowing brute
  if (twist === 'elite') { const last = waves[waves.length - 1]; last[0] = Object.assign(last[0], { type: 'brute', elite: true, hpMul: (last[0].hpMul || 1) * 2.1, element: realm.element }); }
  return { realm: r, stage: s, arena, waves, d, boss: false, twist };
}

/* Endless: infinite waves; realm (and arena) rotates every 10 kills, champions every 8th wave. */
function endlessWave(kills, waveNo) {
  const d = Math.min(1.4, kills / 45);
  const r = Math.floor(kills / 10) % REALMS.length;
  const realm = REALMS[r];
  if (waveNo > 0 && waveNo % 8 === 0) {
    return { realm: r, d, wave: [{ type: 'boss', element: realm.element, d, boss: { name: 'Elder ' + realm.boss.name.split(' ').pop(), title: 'Endless Champion' }, hpMul: 6 + d * 5, scale: 1.5 }] };
  }
  const conc = kills < 4 ? 1 : kills < 14 ? 2 : 3;
  const n = 1 + Math.floor(Math.random() * conc);
  const wave = [];
  for (let i = 0; i < n; i++) wave.push({ type: rollType(Math.random, Math.min(4, 1 + Math.floor(kills / 8)), 3), element: rollElement(Math.random, realm, 0.25), d });
  return { realm: r, d, wave: capRoles(capElements(wave), realm) };
}

function stageKey(r, s) { return r + '-' + s; }
function stageLabel(r, s) { return (r + 1) + '-' + (s + 1); }

// elements are bought with gems now; stages no longer award them
function elementUnlockedBy() { return null; }
