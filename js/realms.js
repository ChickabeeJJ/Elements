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

const ENEMY_TYPES = {
  archer: { hp: 1, dmg: 1, rate: 1, scale: 1, label: 'Archer' },
  scout:  { hp: 0.75, dmg: 0.8, rate: 0.75, scale: 0.9, label: 'Scout', moves: true },
  brute:  { hp: 2.2, dmg: 1.45, rate: 1.35, scale: 1.18, label: 'Brute', helmet: true },
  mage:   { hp: 0.9, dmg: 1.1, rate: 1.2, scale: 1, label: 'Mage', orb: true },
  boss:   { hp: 1, dmg: 1.1, rate: 1, scale: 1.9, label: 'Boss', helmet: true },
};

/* stat curve shared by campaign and endless; d runs 0..1 (and past 1 in endless) */
function enemyStats(type, d) {
  const t = ENEMY_TYPES[type];
  return {
    hp: Math.round(55 * (1 + d * 2.6) * t.hp),
    dmg: Math.round((10 + d * 14) * t.dmg),
    interval: lerp(3.6, 2.0, Math.min(d, 1.2)) * t.rate,
    aimErr: lerp(0.085, 0.026, Math.min(d, 1.1)),
    powErr: lerp(0.075, 0.025, Math.min(d, 1.1)),
  };
}

/* platform slots on the enemy side, picked so concurrent enemies never overlap */
const SLOTS = [
  [1020, 640], [1180, 520], [1340, 380], [1440, 640], [1110, 330], [1290, 700], [1460, 470], [990, 450],
];

function pickSlots(rng, n) {
  const pool = SLOTS.map((s, i) => i).sort(() => rng() - 0.5);
  const out = [];
  for (const i of pool) {
    const [x, y] = SLOTS[i];
    if (out.every(o => Math.abs(o[0] - x) > 140 || Math.abs(o[1] - y) > 170)) out.push([x + (rng() - 0.5) * 40, y + (rng() - 0.5) * 40]);
    if (out.length === n) break;
  }
  return out;
}

function rollType(rng, r, s) {
  const opts = ['archer', 'archer', 'archer'];
  if (s >= 1 || r >= 1) opts.push('scout');
  if (s >= 2 || r >= 1) opts.push('brute');
  if ((r >= 1 && s >= 2) || r >= 2) opts.push('mage');
  return opts[Math.floor(rng() * opts.length)];
}

function rollElement(rng, realm, mixChance) {
  if (rng() < mixChance) return pick(Object.keys(AFFINITY));
  return rng() < 0.75 ? realm.element : 'none';
}

/* Campaign stage: deterministic list of waves. Each wave is an array of enemy specs. */
function buildStage(r, s) {
  const realm = REALMS[r];
  const g = r * STAGES_PER_REALM + s;
  const d = g / (TOTAL_STAGES - 1);
  const rng = mulberry32(9137 + g * 7919);
  const mix = r === 4 ? 0.35 : 0;
  const waves = [];

  if (s === STAGES_PER_REALM - 1) {
    // boss stage: an escort wave, then the boss on its own island
    const esc = pickSlots(rng, 2);
    waves.push(esc.map(([x, y]) => ({ type: rollType(rng, r, s), element: rollElement(rng, realm, mix), x, y, d })));
    waves.push([{ type: 'boss', element: realm.element, x: 1330, y: 600, d, boss: realm.boss, hpMul: 6 + r * 1.6 }]);
    return { realm: r, stage: s, waves, d, boss: true };
  }

  const total = 3 + s + Math.floor(r / 2);
  const conc = r === 0 && s < 2 ? 1 : s < 2 ? 1 + (r >= 2 ? 1 : 0) : s < 4 ? 2 : r >= 2 ? 3 : 2;
  let left = total;
  while (left > 0) {
    const n = Math.min(left, 1 + Math.floor(rng() * conc));
    const slots = pickSlots(rng, n);
    waves.push(slots.map(([x, y]) => {
      const type = rollType(rng, r, s);
      return { type, element: rollElement(rng, realm, mix), x, y, d, moving: type === 'scout' };
    }));
    left -= slots.length;
  }
  return { realm: r, stage: s, waves, d, boss: false };
}

/* Endless: infinite waves, realm theme rotates every 10 kills, mini-bosses every 20. */
function endlessWave(kills, waveNo) {
  const d = Math.min(1.35, kills / 50);
  const r = Math.floor(kills / 10) % REALMS.length;
  const realm = REALMS[r];
  const rng = Math.random;
  if (waveNo > 0 && waveNo % 9 === 0) {
    return { realm: r, d, wave: [{ type: 'boss', element: realm.element, x: 1330, y: 600, d, boss: { name: 'Elder ' + realm.boss.name.split(' ').pop(), title: 'Endless Champion' }, hpMul: 6 + d * 6, scale: 1.55 }] };
  }
  const conc = kills < 4 ? 1 : kills < 14 ? 2 : 3;
  const n = 1 + Math.floor(rng() * conc);
  const slots = pickSlots(rng, n);
  return {
    realm: r, d,
    wave: slots.map(([x, y]) => {
      const type = rollType(rng, Math.min(4, 1 + Math.floor(kills / 8)), 3);
      return { type, element: rollElement(rng, realm, 0.3), x, y, d, moving: type === 'scout' };
    }),
  };
}

function stageKey(r, s) { return r + '-' + s; }
function stageLabel(r, s) { return (r + 1) + '-' + (s + 1); }

/* which element (if any) a stage unlocks on first clear */
function elementUnlockedBy(r, s) {
  return ELEMENTS.find(e => e.unlock && e.unlock[0] === r && e.unlock[1] === s) || null;
}
