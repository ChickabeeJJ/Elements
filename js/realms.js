'use strict';
/* =========================================================================
   Realms (themes + enemy affinity), handcrafted-by-seed stage layouts, and
   the endless-mode wave generator.
   ========================================================================= */

const REALMS = [
  {
    id: 'verdant', name: 'Verdant Vale', element: 'nature',
    sky: ['#86cfe0', '#d9efd9', '#ffe7b8'], sun: '#fff6cf', sunPos: [0.78, 0.2], showSun: true, clouds: true,
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
    boss: { name: 'The Hollow King', title: 'End of All Light' },
  },
];
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
];
const BOSS_ARENA = { name: 'Throne', isl: [[800, 705, 960], [270, 520, 240], [1330, 520, 240]] };

const ENEMY_TYPES = {
  grunt:  { hp: 1, dmg: 1, cd: 1, scale: 1, weight: 1, speed: 250, label: 'Warrior' },
  caster: { hp: 0.8, dmg: 1.1, cd: 0.9, scale: 0.95, weight: 0.85, speed: 230, label: 'Caster' },
  brute:  { hp: 2.3, dmg: 1.5, cd: 1.3, scale: 1.25, weight: 2, speed: 190, label: 'Brute' },
  boss:   { hp: 1, dmg: 1, cd: 1.25, scale: 1.75, weight: 3.2, speed: 200, label: 'Boss' },
};

/* stat curve shared by campaign and endless; d runs 0..1 (and past 1 in endless) */
function enemyStats(type, d) {
  const t = ENEMY_TYPES[type];
  return {
    hp: Math.round(37 * (1 + d * 2.6) * t.hp),
    dmgMul: (0.75 + d * 1.3) * t.dmg,
    cdMul: lerp(1.3, 0.8, Math.min(d, 1.2)) * t.cd,
    think: lerp(0.32, 0.12, Math.min(d, 1.2)),
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

/* Campaign stage: deterministic arena + list of waves. */
function buildStage(r, s) {
  const realm = REALMS[r];
  const g = r * STAGES_PER_REALM + s;
  const d = g / (TOTAL_STAGES - 1);
  const rng = mulberry32(9137 + g * 7919);
  const mix = r === REALMS.length - 1 ? 0.3 : 0;
  const waves = [];
  if (s === STAGES_PER_REALM - 1) {
    waves.push([0, 1].map(() => ({ type: 'grunt', element: rollElement(rng, realm, mix), d })));
    waves.push([{ type: 'boss', element: realm.element, d, boss: realm.boss, hpMul: 6 + r * 1.1 }]);
    return { realm: r, stage: s, arena: BOSS_ARENA, waves, d, boss: true };
  }
  const arena = ARENAS[(g * 3 + r) % ARENAS.length];
  // at most three waves; early stages are short and gentle
  // at most three waves of at most three foes; individual foes carry the difficulty
  const total = Math.min(9, 2 + Math.floor(s * 0.7) + Math.floor(r * 0.8));
  const nW = Math.min(3, Math.ceil(total / 3));
  for (let w = 0; w < nW; w++) {
    const n = Math.floor(total / nW) + (w < total % nW ? 1 : 0);
    const wave = [];
    for (let i = 0; i < n; i++) wave.push({ type: rollType(rng, r, s), element: rollElement(rng, realm, mix), d });
    waves.push(capElements(wave));
  }
  return { realm: r, stage: s, arena, waves, d, boss: false };
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
  return { realm: r, d, wave: capElements(wave) };
}

function stageKey(r, s) { return r + '-' + s; }
function stageLabel(r, s) { return (r + 1) + '-' + (s + 1); }

// elements are bought with gems now; stages no longer award them
function elementUnlockedBy() { return null; }
