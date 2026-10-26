'use strict';
/* =========================================================================
   Elements. Each one is a fighting style: a main attack (melee or ranged)
   and two powers. Moves are data; js/combat.js knows how to run each kind.
   Order here is the order shown in menus.
   ========================================================================= */

const ELEMENTS = [
  {
    id: 'wind', name: 'Gale', color: '#bdf3e4', deep: '#2fb58f', unlock: null,
    blurb: 'Fast palms and wild air currents that toss foes off the islands.',
    moves: [
      { slot: 'main', id: 'gust_palm', name: 'Gust Palm', type: 'melee', icon: 'palm', kind: 'melee', pose: 'punch',
        desc: 'Quick palm strike that blasts foes back.', cd: 0.36, windup: 0.06, active: 0.1, recover: 0.12,
        reach: 66, radius: 30, dmg: 11, knock: 560, lift: 0.35 },
      { slot: 'p1', id: 'updraft', name: 'Updraft', type: 'power', icon: 'tornado', kind: 'updraft', pose: 'raise',
        desc: 'Launch skyward on a whirlwind and fling nearby foes up.', cd: 5, windup: 0.04, active: 0.1, recover: 0.1,
        radius: 150, dmg: 10, knock: 760, lift: 1, selfJump: 1300 },
      { slot: 'p2', id: 'cyclone', name: 'Cyclone', type: 'power', icon: 'cyclone', kind: 'projectile', pose: 'cast',
        desc: 'Hurl a travelling tornado that drags foes along, then bursts.', cd: 8, windup: 0.16, active: 0.1, recover: 0.2,
        speed: 430, grav: 0, radius: 46, dmg: 5, tick: 0.14, pierce: true, ghost: true, life: 1.7, knock: 240, lift: 0.7, flat: true,
        endBlast: { r: 130, dmg: 12, knock: 760, lift: 0.8 }, style: 'cyclone' },
    ],
  },
  {
    id: 'fire', name: 'Ember', color: '#ffb347', deep: '#ff5a1f', unlock: [0, 1],
    blurb: 'Fireballs, blazing dashes and eruptions that leave foes burning.',
    moves: [
      { slot: 'main', id: 'fireball', name: 'Fireball', type: 'ranged', icon: 'fireball', kind: 'projectile', pose: 'cast',
        desc: 'Throw a fireball that bursts and burns.', cd: 0.5, windup: 0.08, active: 0.05, recover: 0.16,
        speed: 950, grav: 500, radius: 14, dmg: 12, knock: 330, lift: 0.3, burn: { dps: 5, dur: 2.2 },
        explode: { r: 60, dmg: 5, knock: 260 }, style: 'fireball' },
      { slot: 'p1', id: 'flame_dash', name: 'Flame Dash', type: 'power', icon: 'dash', kind: 'dash', pose: 'dash',
        desc: 'Rocket forward in flames, scorching everything you pass.', cd: 4.5, windup: 0.04, active: 0.24, recover: 0.12,
        speed: 1350, dmg: 14, knock: 520, lift: 0.5, burn: { dps: 6, dur: 2.5 }, invuln: false, style: 'fire' },
      { slot: 'p2', id: 'eruption', name: 'Eruption', type: 'power', icon: 'burst', kind: 'nova', pose: 'nova',
        desc: 'Detonate around you, launching foes skyward.', cd: 9, windup: 0.22, active: 0.1, recover: 0.25,
        radius: 175, dmg: 22, knock: 900, lift: 1, burn: { dps: 6, dur: 3 }, style: 'fire' },
    ],
  },
  {
    id: 'water', name: 'Tide', color: '#7cc8ff', deep: '#2f7fe0', unlock: [0, 5],
    blurb: 'Long-reaching whips and waves that wash foes over the edge.',
    moves: [
      { slot: 'main', id: 'water_whip', name: 'Water Whip', type: 'melee', icon: 'whip', kind: 'melee', pose: 'swing',
        desc: 'Lash out with a long water whip. Soaks foes.', cd: 0.48, windup: 0.08, active: 0.14, recover: 0.16,
        reach: 150, radius: 18, dmg: 11, knock: 420, lift: 0.25, soak: 4, style: 'water' },
      { slot: 'p1', id: 'tidal_wave', name: 'Tidal Wave', type: 'power', icon: 'wave', kind: 'wave', pose: 'nova',
        desc: 'Send a wave rolling across the ground that sweeps foes away.', cd: 6, windup: 0.18, active: 0.1, recover: 0.2,
        speed: 720, height: 95, life: 1.2, dmg: 14, knock: 820, lift: 0.4, soak: 4, style: 'water' },
      { slot: 'p2', id: 'bubble', name: 'Bubble Shield', type: 'power', icon: 'shield', kind: 'shield', pose: 'raise',
        desc: 'Wrap yourself in water that absorbs 45 damage and heals a little.', cd: 12, windup: 0.08, active: 0.1, recover: 0.1,
        absorb: 45, dur: 4, heal: 12 },
    ],
  },
  {
    id: 'earth', name: 'Stone', color: '#e0b98f', deep: '#8a5a33', unlock: [1, 2],
    blurb: 'Slow, crushing fists, hurled boulders and quakes that floor everyone.',
    moves: [
      { slot: 'main', id: 'stone_fist', name: 'Stone Fist', type: 'melee', icon: 'fist', kind: 'melee', pose: 'heavy',
        desc: 'A heavy rock-clad punch with huge knockback.', cd: 0.75, windup: 0.18, active: 0.1, recover: 0.2,
        reach: 74, radius: 34, dmg: 22, knock: 860, lift: 0.45, style: 'earth' },
      { slot: 'p1', id: 'boulder', name: 'Boulder', type: 'power', icon: 'boulder', kind: 'projectile', pose: 'heavy',
        desc: 'Heave a boulder in a high arc that shatters on impact.', cd: 5, windup: 0.22, active: 0.05, recover: 0.25,
        speed: 820, grav: 1500, radius: 26, dmg: 28, knock: 900, lift: 0.5, explode: { r: 80, dmg: 10, knock: 500 }, style: 'boulder' },
      { slot: 'p2', id: 'quake', name: 'Quake', type: 'power', icon: 'quake', kind: 'slam', pose: 'heavy',
        desc: 'Slam the ground (or plunge from the air) to send out stunning shockwaves.', cd: 9, windup: 0.12, active: 0.1, recover: 0.3,
        speed: 900, height: 60, life: 0.45, dmg: 18, knock: 520, lift: 1, stun: 1.0, style: 'earth' },
    ],
  },
  {
    id: 'frost', name: 'Rime', color: '#c9f2ff', deep: '#4fb6e0', unlock: [1, 5],
    blurb: 'Shards that chill, a freezing nova and lances that shatter ice.',
    moves: [
      { slot: 'main', id: 'ice_shards', name: 'Ice Shards', type: 'ranged', icon: 'shards', kind: 'projectile', pose: 'cast',
        desc: 'Fire three fast shards that chill and slow.', cd: 0.55, windup: 0.07, active: 0.05, recover: 0.16,
        speed: 1150, grav: 220, radius: 9, dmg: 6, count: 3, spread: 0.12, knock: 170, lift: 0.15, chill: 1.6, style: 'shard' },
      { slot: 'p1', id: 'frost_nova', name: 'Frost Nova', type: 'power', icon: 'snow', kind: 'nova', pose: 'nova',
        desc: 'Freeze everything around you solid.', cd: 8, windup: 0.15, active: 0.1, recover: 0.2,
        radius: 200, dmg: 10, knock: 150, lift: 0.2, freeze: 2.3, style: 'frost' },
      { slot: 'p2', id: 'ice_lance', name: 'Ice Lance', type: 'power', icon: 'lance', kind: 'projectile', pose: 'cast',
        desc: 'A piercing lance. Shatters frozen foes for double damage.', cd: 4, windup: 0.16, active: 0.05, recover: 0.2,
        speed: 1600, grav: 0, radius: 13, dmg: 24, pierce: true, knock: 650, lift: 0.3, shatter: 2, life: 1, style: 'lance' },
    ],
  },
  {
    id: 'lightning', name: 'Storm', color: '#fff27a', deep: '#a77bff', unlock: [2, 2],
    blurb: 'Instant bolts, teleport strikes and a sky full of thunder.',
    moves: [
      { slot: 'main', id: 'shock_bolt', name: 'Shock Bolt', type: 'ranged', icon: 'bolt', kind: 'projectile', pose: 'cast',
        desc: 'A near-instant bolt that arcs to a second foe.', cd: 0.45, windup: 0.05, active: 0.05, recover: 0.14,
        speed: 2600, grav: 0, radius: 10, dmg: 10, knock: 260, lift: 0.2, chain: { n: 1, r: 280, mul: 0.7 }, shock: 0.2, life: 0.5, style: 'bolt' },
      { slot: 'p1', id: 'blink', name: 'Blink Strike', type: 'power', icon: 'blink', kind: 'blink', pose: 'nova',
        desc: 'Teleport toward your aim and discharge on arrival.', cd: 5, windup: 0.05, active: 0.1, recover: 0.15,
        range: 380, radius: 115, dmg: 16, knock: 600, lift: 0.5, shock: 0.5, style: 'storm' },
      { slot: 'p2', id: 'thunderstorm', name: 'Thunderstorm', type: 'power', icon: 'storm', kind: 'strike', pose: 'raise',
        desc: 'Call lightning down on up to four foes.', cd: 10, windup: 0.25, active: 0.1, recover: 0.2,
        targets: 4, delay: 0.14, dmg: 22, knock: 480, lift: 0.8, shock: 0.7, style: 'bolt' },
    ],
  },
  {
    id: 'nature', name: 'Thorn', color: '#9ae66e', deep: '#3f9b3a', unlock: [2, 5],
    blurb: 'Vines that root and drain, snares of thorns and healing blooms.',
    moves: [
      { slot: 'main', id: 'vine_lash', name: 'Vine Lash', type: 'melee', icon: 'vine', kind: 'melee', pose: 'swing',
        desc: 'A thorny lash that roots briefly and heals you.', cd: 0.5, windup: 0.08, active: 0.14, recover: 0.16,
        reach: 125, radius: 20, dmg: 11, knock: 360, lift: 0.2, root: 0.7, leech: 0.35, style: 'nature' },
      { slot: 'p1', id: 'thorn_snare', name: 'Thorn Snare', type: 'power', icon: 'snare', kind: 'projectile', pose: 'cast',
        desc: 'Lob a seed that bursts into a patch of rooting thorns.', cd: 6, windup: 0.12, active: 0.05, recover: 0.2,
        speed: 760, grav: 1300, radius: 12, dmg: 6, knock: 120, lift: 0.1,
        zone: { r: 115, dur: 3.2, dps: 11, root: 1.2, style: 'thorns' }, style: 'seed' },
      { slot: 'p2', id: 'bloom', name: 'Bloom', type: 'power', icon: 'heal', kind: 'heal', pose: 'raise',
        desc: 'Heal 30% over 2.5s, cleanse effects and push foes back.', cd: 14, windup: 0.12, active: 0.1, recover: 0.15,
        heal: 0.3, dur: 2.5, radius: 120, knock: 520, lift: 0.4, dmg: 6, style: 'nature' },
    ],
  },
  {
    id: 'void', name: 'Void', color: '#c08bff', deep: '#6a35d0', unlock: [3, 2],
    blurb: 'Seeking orbs, rifts that swallow the battlefield and shadow steps.',
    moves: [
      { slot: 'main', id: 'void_orb', name: 'Void Orb', type: 'ranged', icon: 'orb', kind: 'projectile', pose: 'cast',
        desc: 'A slow orb that seeks out the nearest foe.', cd: 0.6, windup: 0.1, active: 0.05, recover: 0.16,
        speed: 560, grav: 0, radius: 15, dmg: 14, knock: 380, lift: 0.3, homing: 4.5, life: 2.4, style: 'voidorb' },
      { slot: 'p1', id: 'rift', name: 'Rift', type: 'power', icon: 'rift', kind: 'zone', pose: 'raise',
        desc: 'Tear open a rift at your aim that drags in and grinds foes.', cd: 9, windup: 0.2, active: 0.1, recover: 0.2,
        range: 650, zone: { r: 240, dur: 2.4, dps: 15, pull: 2800, style: 'rift' } },
      { slot: 'p2', id: 'shadow_step', name: 'Shadow Step', type: 'power', icon: 'dash', kind: 'dash', pose: 'dash',
        desc: 'Phase through foes untouchable, cutting everything in your path.', cd: 4, windup: 0.03, active: 0.22, recover: 0.1,
        speed: 1650, dmg: 17, knock: 380, lift: 0.4, invuln: true, style: 'void' },
    ],
  },
  {
    id: 'light', name: 'Radiance', color: '#fff3b0', deep: '#f2b41c', unlock: [3, 5],
    blurb: 'Blinding blade combos, a searing beam and judgment from the sky.',
    moves: [
      { slot: 'main', id: 'radiant_blade', name: 'Radiant Blade', type: 'melee', icon: 'blade', kind: 'melee', pose: 'swing',
        desc: 'Fast blade combo. Every third slash hits much harder.', cd: 0.3, windup: 0.05, active: 0.1, recover: 0.1,
        reach: 96, radius: 22, dmg: 9, knock: 300, lift: 0.25, combo: { n: 3, dmg: 2, knock: 3 }, style: 'light' },
      { slot: 'p1', id: 'sunbeam', name: 'Sunbeam', type: 'power', icon: 'beam', kind: 'beam', pose: 'channel',
        desc: 'Channel a searing beam that pushes foes away.', cd: 8, windup: 0.15, active: 1.0, recover: 0.2,
        dps: 42, push: 1100, length: 1000, width: 22, style: 'light' },
      { slot: 'p2', id: 'judgment', name: 'Judgment', type: 'power', icon: 'sun', kind: 'strike', pose: 'raise',
        desc: 'Sunbeams crash down on up to six foes.', cd: 12, windup: 0.3, active: 0.1, recover: 0.25,
        targets: 6, delay: 0.1, dmg: 24, knock: 520, lift: 1, style: 'sun' },
    ],
  },
];
const ELEMENT_BY_ID = Object.fromEntries(ELEMENTS.map(e => [e.id, e]));

/* plain brawlers and basic enemy strikes */
const NEUTRAL = { id: 'none', name: 'Brawler', color: '#ece6da', deep: '#9a9184' };
const ENEMY_PUNCH = {
  id: 'punch', name: 'Strike', type: 'melee', kind: 'melee', pose: 'punch', icon: 'fist',
  cd: 1.0, windup: 0.1, active: 0.1, recover: 0.2, reach: 62, radius: 28, dmg: 9, knock: 430, lift: 0.3,
};
const ENEMY_ROCK = {
  id: 'rock', name: 'Rock Toss', type: 'ranged', kind: 'projectile', pose: 'cast', icon: 'boulder',
  cd: 2.2, windup: 0.15, active: 0.05, recover: 0.2, speed: 820, grav: 1100, radius: 13, dmg: 9, knock: 380, lift: 0.3, style: 'rock',
};

/* enemy affinities: damage multiplier for each incoming element */
const AFFINITY = {
  none:      { weak: [], resist: [] },
  nature:    { weak: ['fire', 'void'], resist: ['water', 'nature', 'earth'] },
  fire:      { weak: ['water', 'earth'], resist: ['fire', 'nature', 'wind'] },
  frost:     { weak: ['fire', 'earth'], resist: ['frost', 'water'] },
  lightning: { weak: ['earth', 'nature'], resist: ['lightning', 'water', 'wind'] },
  void:      { weak: ['light'], resist: ['void', 'wind', 'frost'] },
};
const WEAK_MUL = 1.6;
const RESIST_MUL = 0.55;

function affinityMul(enemyEl, atkEl) {
  const a = AFFINITY[enemyEl] || AFFINITY.none;
  if (a.weak.includes(atkEl)) return WEAK_MUL;
  if (a.resist.includes(atkEl)) return RESIST_MUL;
  return 1;
}

const AURA = {
  none: '#e6e1d6', wind: '#bdf3e4', fire: '#ff8a3d', water: '#7cc8ff', earth: '#e0b98f',
  frost: '#9fe6ff', lightning: '#fff27a', nature: '#9ae66e', void: '#c08bff', light: '#fff3b0',
};

function elementOf(id) { return ELEMENT_BY_ID[id] || NEUTRAL; }

/* 24x24 element emblems. currentColor so they tint with CSS. */
const ICON_PATHS = {
  wind: '<path d="M3 8.5h10.5a3 3 0 1 0-3-3M3 12.5h14.5a3 3 0 1 1-3 3M3 16.5h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  fire: '<path d="M12.6 2.2c.7 3.6 5.4 5.9 5.4 11.3a6 6 0 0 1-12 0c0-3.2 1.9-4.7 2.6-7.4 1.6 1.2 2.4 3 2.3 5 1.6-1.5 2.3-4.9 1.7-8.9z" fill="currentColor"/>',
  water: '<path d="M12 2.6C9.2 7 6 10.4 6 14.3a6 6 0 0 0 12 0c0-3.9-3.2-7.3-6-11.7z" fill="currentColor"/><path d="M9.3 14.5a2.8 2.8 0 0 0 2.4 2.8" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.6" stroke-linecap="round"/>',
  earth: '<path d="M2.5 19.5 8.4 9.7l3.6 4.8 3.2-4.4 6.3 9.4z" fill="currentColor"/><path d="M8.4 9.7l1.6 6.3M15.2 10.1l-.9 5.4" stroke="rgba(0,0,0,.3)" stroke-width="1.4"/>',
  frost: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.6 3.8 12 6.2l2.4-2.4M9.6 20.2 12 17.8l2.4 2.4M4.2 10.4l3.3-.9-.9-3.3M19.8 13.6l-3.3.9.9 3.3M4.2 13.6l3.3.9-.9 3.3M19.8 10.4l-3.3-.9.9-3.3"/></g>',
  lightning: '<path d="M13.4 2 4.6 13.6h6.2L9.6 22l9.8-12.4h-6.3z" fill="currentColor"/>',
  nature: '<path d="M20.5 3.5C10.8 3.4 4.2 8.3 4.2 15.6c0 1.5.3 2.9.9 4.1 1.4-5.2 5.1-8.9 10.4-11.2-4.4 3.1-7.2 6.9-8.4 11.6 8.5.6 13.6-5.6 13.4-16.6z" fill="currentColor"/>',
  void: '<path d="M12 12.2m-2 0a2 2 0 1 1 4 0a4 4 0 1 1-8 0a6 6 0 1 1 12 0a8 8 0 1 1-16 0" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
  light: '<circle cx="12" cy="12" r="4.3" fill="currentColor"/><g stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M12 2.2v2.6M12 19.2v2.6M2.2 12h2.6M19.2 12h2.6M5 5l1.9 1.9M17.1 17.1 19 19M5 19l1.9-1.9M17.1 6.9 19 5"/></g>',
  none: '<path d="M7 10.5V7a1.5 1.5 0 0 1 3 0v3M10 10V5.5a1.5 1.5 0 0 1 3 0V10M13 10V6.5a1.5 1.5 0 0 1 3 0v5M7 10.5a1.5 1.5 0 0 0-3 0V13a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6v-2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

function elementIcon(id, cls = '') {
  return `<svg class="eicon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[id] || ICON_PATHS.none}</svg>`;
}

/* canvas copies of the emblems for things drawn in-world */
const IconCanvas = (() => {
  const cache = new Map();
  function sprite(id, color) {
    const key = id + color;
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const img = new Image();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">${(ICON_PATHS[id] || ICON_PATHS.none).replace(/currentColor/g, color)}</svg>`;
    img.onload = () => c.getContext('2d').drawImage(img, 0, 0, 48, 48);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    cache.set(key, c);
    return c;
  }
  return { sprite };
})();
