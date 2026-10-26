'use strict';
/* =========================================================================
   Realms (themes + enemy affinity), handcrafted-by-seed stage layouts, and
   the endless-mode wave generator.
   ========================================================================= */

const REALMS = [
  {
    id: 'verdant', name: 'Verdant Vale', element: 'nature',
    sky: ['#86cfe0', '#d9efd9', '#ffe7b8'], sun: '#fff6cf', sunPos: [0.78, 0.2],
    hills: ['#a7d3b8', '#73b08f', '#4d8a6d'], fog: '#e9f6e6',
    top: '#8fd46b', topDark: '#5fae4c', rock: '#6b5848', rockDark: '#4a3b31',
    ambient: 'leaf', tint: '#9ae66e',
    boss: { name: 'Thornwarden', title: 'Keeper of the Vale' },
  },
  {
    id: 'ember', name: 'Ember Wastes', element: 'fire',
    sky: ['#2b1030', '#8a2e3b', '#ff9a52'], sun: '#ffcf7a', sunPos: [0.25, 0.32],
    hills: ['#9c3d3a', '#64232c', '#3b1520'], fog: '#ff8a5a',
    top: '#3a2626', topDark: '#ff7a2a', rock: '#3d2a2a', rockDark: '#24171a',
    ambient: 'ember', tint: '#ff8a3d', glowTop: true,
    boss: { name: 'Cinder Tyrant', title: 'Lord of Ash' },
  },
  {
    id: 'frost', name: 'Frostpeak', element: 'frost',
    sky: ['#2b4f8a', '#7fa9d6', '#e3f1fa'], sun: '#ffffff', sunPos: [0.7, 0.16],
    hills: ['#c0d8ec', '#8fb2d4', '#5f84ad'], fog: '#eef7ff',
    top: '#f3fbff', topDark: '#bfe0f2', rock: '#5c6f88', rockDark: '#3e4d63',
    ambient: 'snow', tint: '#9fe6ff',
    boss: { name: 'Rimeheart', title: 'The Frozen Sovereign' },
  },
  {
    id: 'storm', name: 'Stormspire', element: 'lightning',
    sky: ['#14162e', '#2d3266', '#6b6aa8'], sun: '#d7d2ff', sunPos: [0.32, 0.14],
    hills: ['#454a86', '#30335f', '#1f2141'], fog: '#8d8ccc',
    top: '#8a8fe0', topDark: '#5b5fb0', rock: '#2c2e4c', rockDark: '#1b1c31',
    ambient: 'rain', tint: '#fff27a', flashes: true,
    boss: { name: 'Storm Herald', title: 'Voice of the Tempest' },
  },
  {
    id: 'void', name: 'The Void Rift', element: 'void',
    sky: ['#05030c', '#1f0f38', '#4d2370'], sun: '#e0b8ff', sunPos: [0.62, 0.28],
    hills: ['#2e1b4d', '#1e1236', '#120a22'], fog: '#5b2b8a',
    top: '#b98bff', topDark: '#6d3fc0', rock: '#1d1430', rockDark: '#110b1e',
    ambient: 'mote', tint: '#c08bff', glowTop: true,
    boss: { name: 'The Hollow King', title: 'End of All Light' },
  },
];
const STAGES_PER_REALM = 6;
const TOTAL_STAGES = REALMS.length * STAGES_PER_REALM;

/* arena layouts: [x, top y, width, motion?]. The first island is where the hero spawns. */
const ARENAS = [
  { name: 'Crossing', isl: [[800, 700, 760], [270, 560, 270], [1330, 560, 270], [800, 445, 280]] },
  { name: 'Twin Peaks', isl: [[470, 690, 520], [1130, 690, 520], [800, 520, 230], [270, 440, 200], [1330, 440, 200]] },
  { name: 'Stairway', isl: [[700, 715, 620], [1200, 600, 260], [1430, 470, 210], [250, 590, 260], [880, 470, 230]] },
  { name: 'Islets', isl: [[800, 700, 440], [320, 640, 320], [1280, 640, 320], [560, 490, 190], [1040, 490, 190], [800, 335, 180]] },
  { name: 'Drift', isl: [[800, 705, 600], [290, 580, 240, { ax: 0, ay: 60, speed: 0.9, phase: 0 }], [1310, 580, 240, { ax: 0, ay: 60, speed: 0.9, phase: 3 }], [800, 460, 220, { ax: 120, ay: 0, speed: 0.6, phase: 1 }]] },
];
const BOSS_ARENA = { name: 'Throne', isl: [[800, 705, 940], [300, 520, 230], [1300, 520, 230], [800, 400, 200]] };

const ENEMY_TYPES = {
  grunt:  { hp: 1, dmg: 1, cd: 1, scale: 1, weight: 1, speed: 250, label: 'Warrior' },
  caster: { hp: 0.8, dmg: 1.1, cd: 0.9, scale: 0.95, weight: 0.85, speed: 230, label: 'Caster' },
  brute:  { hp: 2.3, dmg: 1.5, cd: 1.3, scale: 1.25, weight: 2, speed: 190, label: 'Brute' },
  boss:   { hp: 1, dmg: 1.25, cd: 0.8, scale: 1.75, weight: 3.2, speed: 210, label: 'Boss' },
};

/* stat curve shared by campaign and endless; d runs 0..1 (and past 1 in endless) */
function enemyStats(type, d) {
  const t = ENEMY_TYPES[type];
  return {
    hp: Math.round(42 * (1 + d * 2.4) * t.hp),
    dmgMul: (1 + d * 1.1) * t.dmg,
    cdMul: lerp(1.9, 1.05, Math.min(d, 1.2)) * t.cd,
    think: lerp(0.32, 0.12, Math.min(d, 1.2)),
    aimErr: lerp(0.14, 0.04, Math.min(d, 1.1)),
    windupMul: lerp(2.2, 1.5, Math.min(d, 1)),
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

/* Campaign stage: deterministic arena + list of waves. */
function buildStage(r, s) {
  const realm = REALMS[r];
  const g = r * STAGES_PER_REALM + s;
  const d = g / (TOTAL_STAGES - 1);
  const rng = mulberry32(9137 + g * 7919);
  const mix = r === 4 ? 0.3 : 0;
  const waves = [];
  if (s === STAGES_PER_REALM - 1) {
    waves.push([0, 1].map(() => ({ type: rollType(rng, r, s), element: rollElement(rng, realm, mix), d })));
    waves.push([{ type: 'boss', element: realm.element, d, boss: realm.boss, hpMul: 10 + r * 2.5 }]);
    return { realm: r, stage: s, arena: BOSS_ARENA, waves, d, boss: true };
  }
  const arena = ARENAS[(g * 3 + r) % ARENAS.length];
  const total = 3 + s + Math.floor(r * 0.8);
  const conc = s < 1 && r === 0 ? 1 : s < 3 ? 2 : 3;
  let left = total;
  while (left > 0) {
    const n = Math.min(left, 1 + Math.floor(rng() * conc));
    const wave = [];
    for (let i = 0; i < n; i++) wave.push({ type: rollType(rng, r, s), element: rollElement(rng, realm, mix), d });
    waves.push(wave);
    left -= n;
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
  return { realm: r, d, wave };
}

function stageKey(r, s) { return r + '-' + s; }
function stageLabel(r, s) { return (r + 1) + '-' + (s + 1); }

function elementUnlockedBy(r, s) {
  return ELEMENTS.find(e => e.unlock && e.unlock[0] === r && e.unlock[1] === s) || null;
}
