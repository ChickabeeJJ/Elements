'use strict';
/* =========================================================================
   Elements. Each one is a fighting style: a main attack (melee or ranged)
   and two powers. Moves are data; js/combat.js knows how to run each kind.
   Order here is the order shown in menus.
   ========================================================================= */

const ELEMENTS = [
  {
    id: 'wind', name: 'Gale', color: '#bdf3e4', deep: '#2fb58f', price: 0,
    blurb: 'Fast palms and wild air currents that toss foes off the islands.',
    moves: [
      { slot: 'main', id: 'gust_palm', name: 'Gust Palm', type: 'melee', icon: 'palm', kind: 'melee', pose: 'punch',
        desc: 'Quick palm strike that blasts foes back.', cd: 0.36, windup: 0.06, active: 0.1, recover: 0.12,
        reach: 66, radius: 30, dmg: 11, knock: 560, lift: 0.35 },
      { slot: 'p1', id: 'updraft', name: 'Updraft', type: 'power', icon: 'updraft', kind: 'updraft', pose: 'raise',
        desc: 'Launch skyward on a whirlwind and fling nearby foes up.', cd: 5, windup: 0.04, active: 0.1, recover: 0.1,
        radius: 150, dmg: 10, knock: 760, lift: 1, selfJump: 1300 },
      { slot: 'p2', id: 'cyclone', name: 'Cyclone', type: 'power', icon: 'tornado', kind: 'projectile', pose: 'cast',
        desc: 'Hurl a travelling tornado that drags foes along, then bursts.', cd: 8, windup: 0.16, active: 0.1, recover: 0.2,
        speed: 430, grav: 0, radius: 46, dmg: 5, tick: 0.14, pierce: true, ghost: true, life: 1.7, knock: 240, lift: 0.7, flat: true,
        endBlast: { r: 130, dmg: 12, knock: 760, lift: 0.8 }, style: 'cyclone' },
    ],
  },
  {
    id: 'fire', name: 'Ember', color: '#ffb347', deep: '#ff5a1f', price: 60,
    blurb: 'Fireballs, blazing dashes and pillars of flame that march across the ground.',
    moves: [
      { slot: 'main', id: 'fireball', name: 'Fireball', type: 'ranged', icon: 'fireball', kind: 'projectile', pose: 'cast',
        desc: 'Throw a fireball that bursts and burns.', cd: 0.5, windup: 0.08, active: 0.05, recover: 0.16,
        speed: 950, grav: 500, radius: 14, dmg: 12, knock: 330, lift: 0.3, burn: { dps: 5, dur: 2.2 },
        explode: { r: 60, dmg: 5, knock: 260 }, style: 'fireball' },
      { slot: 'p1', id: 'flame_dash', name: 'Flame Dash', type: 'power', icon: 'dash', kind: 'dash', pose: 'dash',
        desc: 'Rocket forward in flames, scorching everything you pass.', cd: 4.5, windup: 0.04, active: 0.24, recover: 0.12,
        speed: 1350, dmg: 14, knock: 520, lift: 0.5, burn: { dps: 6, dur: 2.5 }, invuln: false, style: 'fire' },
      { slot: 'p2', id: 'pillars', name: 'Fire Pillars', type: 'power', icon: 'pillars', kind: 'pillars', pose: 'heavy',
        desc: 'Four flame pillars burst from the ground one after another, marching forward.', cd: 8, windup: 0.2, active: 0.1, recover: 0.25,
        n: 4, gap: 120, delay: 0.13, radius: 58, dmg: 13, knock: 420, lift: 1.4, burn: { dps: 6, dur: 3 } },
    ],
  },
  {
    id: 'water', name: 'Tide', color: '#7cc8ff', deep: '#2f7fe0', price: 90,
    blurb: 'Long-reaching whips and waves that wash foes over the edge.',
    moves: [
      { slot: 'main', id: 'water_whip', name: 'Bubble Beam', type: 'ranged', icon: 'bubble', kind: 'projectile', pose: 'cast',
        desc: 'Fire a tight, focused stream of water bubbles toward your aim.', cd: 0.48, windup: 0.06, active: 0.05, recover: 0.14,
        speed: 520, grav: 0, radius: 11, dmg: 7, count: 3, spread: 0.018, knock: 210, lift: 0.12, soak: 2, life: 1.4, style: 'bubble' },
      { slot: 'p1', id: 'tidal_wave', name: 'Tidal Wave', type: 'power', icon: 'wave', kind: 'wave', pose: 'nova',
        desc: 'Send a wave rolling across the ground that sweeps foes away.', cd: 6, windup: 0.18, active: 0.1, recover: 0.2,
        speed: 720, height: 95, life: 1.2, dmg: 14, knock: 820, lift: 0.4, soak: 4, style: 'water' },
      { slot: 'p2', id: 'bubble', name: 'Bubble Shield', type: 'power', icon: 'bubble', kind: 'shield', pose: 'raise',
        desc: 'Wrap yourself in water that absorbs 45 damage and heals a little.', cd: 12, windup: 0.08, active: 0.1, recover: 0.1,
        absorb: 45, dur: 4, heal: 12 },
    ],
  },
  {
    id: 'earth', name: 'Stone', color: '#e0b98f', deep: '#8a5a33', price: 130,
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
    id: 'frost', name: 'Rime', color: '#c9f2ff', deep: '#4fb6e0', price: 170,
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
    id: 'lightning', name: 'Storm', color: '#fff27a', deep: '#a77bff', price: 220,
    blurb: 'Instant bolts, teleport strikes and a sky full of thunder.',
    moves: [
      { slot: 'main', id: 'shock_bolt', name: 'Shock Bolt', type: 'ranged', icon: 'bolt', kind: 'projectile', pose: 'cast',
        desc: 'A near-instant bolt that arcs to a second foe.', cd: 0.45, windup: 0.05, active: 0.05, recover: 0.14,
        speed: 2600, grav: 0, radius: 10, dmg: 13, knock: 260, lift: 0.2, chain: { n: 1, r: 280, mul: 0.7 }, shock: 0.2, life: 0.5, style: 'bolt' },
      { slot: 'p1', id: 'blink', name: 'Blink Strike', type: 'power', icon: 'blink', kind: 'blink', pose: 'nova',
        desc: 'Teleport toward your aim and discharge on arrival.', cd: 5, windup: 0.05, active: 0.1, recover: 0.15,
        range: 380, radius: 115, dmg: 21, knock: 600, lift: 0.5, shock: 0.5, style: 'storm' },
      { slot: 'p2', id: 'thunderstorm', name: 'Thunderstorm', type: 'power', icon: 'storm', kind: 'strike', pose: 'raise',
        desc: 'Call lightning down on up to four foes.', cd: 10, windup: 0.25, active: 0.1, recover: 0.2,
        targets: 4, delay: 0.14, dmg: 29, knock: 480, lift: 0.8, shock: 0.7, style: 'bolt' },
    ],
  },
  {
    id: 'nature', name: 'Thorn', color: '#9ae66e', deep: '#3f9b3a', price: 270,
    blurb: 'Vines that root and drain, snares of thorns and healing blooms.',
    moves: [
      { slot: 'main', id: 'vine_lash', name: 'Vine Swing', type: 'ranged', icon: 'vine', kind: 'projectile', pose: 'cast',
        desc: 'Hold to cast a flexible vine. It flops between your hand and its hook point; moving away pulls hooked enemies.', cd: 0.18, windup: 0.05, active: 0.1, recover: 0.08,
        speed: 720, reach: 620, radius: 20, dmg: 8, knock: 160, lift: 0.1, style: 'nature', vineSwing: true },
      { slot: 'p1', id: 'thorn_snare', name: 'Thorn Snare', type: 'power', icon: 'snare', kind: 'projectile', pose: 'cast',
        desc: 'Lob a seed that bursts into a patch of rooting thorns.', cd: 6, windup: 0.12, active: 0.05, recover: 0.2,
        speed: 760, grav: 1300, radius: 12, dmg: 6, knock: 120, lift: 0.1,
        zone: { r: 115, dur: 3.2, dps: 11, root: 1.2, style: 'thorns' }, style: 'seed' },
      { slot: 'p2', id: 'bloom', name: 'Bloom', type: 'power', icon: 'heal', kind: 'heal', pose: 'raise',
        desc: 'Heal 30% over 2.5s, cleanse effects, push foes back and leech half of Bloom damage as health.', cd: 14, windup: 0.12, active: 0.1, recover: 0.15,
        heal: 0.3, dur: 2.5, radius: 120, knock: 520, lift: 0.4, dmg: 6, leech: 0.5, style: 'nature' },
    ],
  },
  {
    id: 'steel', name: 'Steel', color: '#cfd6e0', deep: '#6d7a8c', price: 320,
    blurb: 'Wide blade arcs, a magnet that drags foes in and buzzing saw discs.',
    moves: [
      { slot: 'main', id: 'blade_arc', name: 'Blade Arc', type: 'melee', icon: 'blade', kind: 'melee', pose: 'swing',
        desc: 'A wide, heavy sweep that cuts everything in front of you.', cd: 0.55, windup: 0.1, active: 0.14, recover: 0.18,
        reach: 110, radius: 26, dmg: 15, knock: 540, lift: 0.3, style: 'steel' },
      { slot: 'p1', id: 'magnetize', name: 'Magnetize', type: 'power', icon: 'magnet', kind: 'pull', pose: 'channel',
        desc: 'Yank every nearby foe toward you, setting up a blade combo.', cd: 8, windup: 0.18, active: 0.1, recover: 0.2,
        radius: 420, dmg: 6, pullV: 950, stun: 0.35 },
      { slot: 'p2', id: 'saw_disc', name: 'Saw Disc', type: 'power', icon: 'saw', kind: 'projectile', pose: 'cast',
        desc: 'Throw a spinning disc that grinds through every foe it passes.', cd: 6, windup: 0.12, active: 0.05, recover: 0.18,
        speed: 900, grav: 0, radius: 22, dmg: 7, tick: 0.12, pierce: true, life: 1.1, knock: 220, lift: 0.2, style: 'saw' },
    ],
  },
  {
    id: 'venom', name: 'Venom', color: '#a6e35b', deep: '#4f8a23', price: 380,
    blurb: 'Poison spit, choking clouds and a swarm of plague flies.',
    moves: [
      { slot: 'main', id: 'venom_spit', name: 'Venom Spit', type: 'ranged', icon: 'spit', kind: 'projectile', pose: 'cast',
        desc: 'Spit a glob of venom that poisons whoever it hits.', cd: 0.5, windup: 0.07, active: 0.05, recover: 0.16,
        speed: 880, grav: 900, radius: 12, dmg: 8, knock: 220, lift: 0.2, poison: { dps: 6, dur: 3.5 }, style: 'spit' },
      { slot: 'p1', id: 'toxic_cloud', name: 'Toxic Cloud', type: 'power', icon: 'cloud', kind: 'zone', pose: 'raise',
        desc: 'Release a cloud of poison at your aim that lingers.', cd: 8, windup: 0.18, active: 0.1, recover: 0.2,
        range: 600, zone: { r: 150, dur: 3.6, dps: 14, style: 'toxic' } },
      { slot: 'p2', id: 'swarm', name: 'Plague Swarm', type: 'power', icon: 'swarm', kind: 'projectile', pose: 'cast',
        desc: 'Release five plague flies that hunt down separate foes and poison them.', cd: 8, windup: 0.12, active: 0.05, recover: 0.2,
        count: 5, spread: 0.5, speed: 520, grav: 0, radius: 9, dmg: 4, knock: 120, lift: 0.1, homing: 5, spreadTargets: true, life: 3, poison: { dps: 5, dur: 3 }, style: 'fly' },
    ],
  },
  {
    id: 'arcane', name: 'Arcane', color: '#ff8ad8', deep: '#b0369a', price: 520,
    blurb: 'Homing star bolts, stars that orbit you and meteors from the sky.',
    moves: [
      { slot: 'main', id: 'star_bolt', name: 'Star Bolts', type: 'ranged', icon: 'star', kind: 'projectile', pose: 'cast',
        desc: 'Two quick star bolts that curve toward the nearest foe.', cd: 0.5, windup: 0.06, active: 0.05, recover: 0.15,
        speed: 1250, grav: 0, radius: 10, dmg: 7, count: 2, spread: 0.1, homing: 1.8, life: 1.4, knock: 240, lift: 0.2, style: 'star' },
      { slot: 'p1', id: 'orbit', name: 'Orbiting Stars', type: 'power', icon: 'orbit', kind: 'orbit', pose: 'raise',
        desc: 'Three stars circle you for 5 seconds, striking anything they pass through.', cd: 10, windup: 0.12, active: 0.1, recover: 0.15,
        n: 3, dur: 5, orbitR: 78, dmg: 6, tick: 0.45, knock: 300, lift: 0.3 },
      { slot: 'p2', id: 'meteor', name: 'Meteor Fall', type: 'power', icon: 'meteor', kind: 'strike', pose: 'raise',
        desc: 'Mark up to three foes and crush them with falling meteors.', cd: 11, windup: 0.3, active: 0.1, recover: 0.25,
        targets: 3, delay: 0.22, dmg: 28, knock: 700, lift: 0.7, style: 'meteor' },
    ],
  },
  {
    id: 'void', name: 'Void', color: '#c08bff', deep: '#6a35d0', price: 450,
    blurb: 'Seeking orbs, rifts that swallow the battlefield and shadow steps.',
    moves: [
      { slot: 'main', id: 'void_orb', name: 'Void Orb', type: 'ranged', icon: 'orb', kind: 'projectile', pose: 'cast',
        desc: 'A slow orb that seeks out the nearest foe.', cd: 0.6, windup: 0.1, active: 0.05, recover: 0.16,
        speed: 560, grav: 0, radius: 15, dmg: 14, knock: 380, lift: 0.3, homing: 4.5, life: 2.4, style: 'voidorb' },
      { slot: 'p1', id: 'rift', name: 'Rift', type: 'power', icon: 'rift', kind: 'zone', pose: 'raise',
        desc: 'Tear open a rift at your aim that drags in and grinds foes.', cd: 9, windup: 0.2, active: 0.1, recover: 0.2,
        range: 650, zone: { r: 240, dur: 2.4, dps: 15, pull: 2800, style: 'rift' } },
      { slot: 'p2', id: 'shadow_step', name: 'Shadow Step', type: 'power', icon: 'shadowstep', kind: 'dash', pose: 'dash',
        desc: 'Phase through foes untouchable, cutting everything in your path.', cd: 4, windup: 0.03, active: 0.22, recover: 0.1,
        speed: 1650, dmg: 17, knock: 380, lift: 0.4, invuln: true, style: 'void' },
    ],
  },
  {
    id: 'light', name: 'Radiance', color: '#fff3b0', deep: '#f2b41c', price: 600,
    blurb: 'Blinding blade combos, a searing beam and a halo that returns to your hand.',
    moves: [
      { slot: 'main', id: 'radiant_blade', name: 'Radiant Blade', type: 'melee', icon: 'sunblade', kind: 'melee', pose: 'swing',
        desc: 'Fast blade combo. Every third slash hits much harder.', cd: 0.3, windup: 0.05, active: 0.1, recover: 0.1,
        reach: 96, radius: 22, dmg: 9, knock: 300, lift: 0.25, combo: { n: 3, dmg: 2, knock: 3 }, style: 'light' },
      { slot: 'p1', id: 'sunbeam', name: 'Sunbeam', type: 'power', icon: 'beam', kind: 'beam', pose: 'channel',
        desc: 'Channel a searing beam that pushes foes away.', cd: 8, windup: 0.15, active: 1.0, recover: 0.2,
        dps: 42, push: 1100, length: 1000, width: 22, style: 'light' },
      { slot: 'p2', id: 'halo', name: 'Halo', type: 'power', icon: 'halo', kind: 'projectile', pose: 'cast',
        desc: 'Throw a ring of light that slices through foes and returns to you.', cd: 6, windup: 0.1, active: 0.05, recover: 0.15,
        speed: 1050, grav: 0, radius: 30, dmg: 11, knock: 360, lift: 0.3, pierce: true, tick: 0.3, boomerang: 0.42, ghost: true, life: 2.2, style: 'halo' },
    ],
  },
  {
    id: 'crystal', name: 'Crystal', color: '#9ff0e8', deep: '#2fb0a8', price: 680,
    blurb: 'Ricocheting shards, a prism wall that turns shots around and hidden geode mines.',
    moves: [
      { slot: 'main', id: 'crystal_shot', name: 'Crystal Shot', type: 'ranged', icon: 'crystal', kind: 'projectile', pose: 'cast',
        desc: 'A shard that ricochets off islands up to twice.', cd: 0.42, windup: 0.06, active: 0.05, recover: 0.12,
        speed: 1150, grav: 300, radius: 10, dmg: 10, knock: 300, lift: 0.25, bounce: 2, life: 1.8, style: 'crystal' },
      { slot: 'p1', id: 'prism', name: 'Prism Wall', type: 'power', icon: 'prism', kind: 'wall', pose: 'raise',
        desc: 'Raise a crystal wall in front of you. Enemy shots that hit it fly back at them.', cd: 9, windup: 0.15, active: 0.1, recover: 0.2,
        dur: 4, wallH: 170, dist: 90 },
      { slot: 'p2', id: 'geode', name: 'Geode Mines', type: 'power', icon: 'mine', kind: 'mines', pose: 'cast',
        desc: 'Scatter three geodes that arm after a moment and burst when a foe comes close.', cd: 10, windup: 0.12, active: 0.05, recover: 0.2,
        n: 3, spreadX: 110, radius: 110, dmg: 18, knock: 700, lift: 0.9, dur: 10 },
    ],
  },
  {
    id: 'gravity', name: 'Gravity', color: '#b9a6ff', deep: '#5b45c9', price: 760,
    blurb: 'Hook foes in, float them helplessly, then crush them into the ground.',
    moves: [
      { slot: 'main', id: 'grav_hook', name: 'Gravity Hook', type: 'ranged', icon: 'hook', kind: 'projectile', pose: 'cast',
        desc: 'Fire a hook that drags the foe it catches back to you.', cd: 0.75, windup: 0.08, active: 0.05, recover: 0.15,
        speed: 1300, grav: 0, radius: 12, dmg: 8, knock: 0, lift: 0, hook: 820, life: 0.55, style: 'hook' },
      { slot: 'p1', id: 'antigrav', name: 'Anti-Grav Field', type: 'power', icon: 'antigrav', kind: 'zone', pose: 'raise',
        desc: 'Open a field at your aim where foes float up, helpless.', cd: 9, windup: 0.2, active: 0.1, recover: 0.2,
        range: 650, zone: { r: 170, dur: 3, dps: 6, style: 'antigrav' } },
      { slot: 'p2', id: 'collapse', name: 'Collapse', type: 'power', icon: 'crush', kind: 'crush', pose: 'heavy',
        desc: 'Slam every airborne foe nearby into the ground. Grounded foes are stunned.', cd: 8, windup: 0.22, active: 0.1, recover: 0.25,
        radius: 700, dmg: 10, airDmg: 22, slamV: 1900, stun: 0.6 },
    ],
  },
  {
    id: 'echo', name: 'Echo', color: '#ffc6a8', deep: '#e0734a', price: 840,
    blurb: 'Sound that passes through everything, resonance that stuns and time that rewinds.',
    moves: [
      { slot: 'main', id: 'sonic', name: 'Sonic Clap', type: 'ranged', icon: 'sonic', kind: 'projectile', pose: 'punch',
        desc: 'A widening sound wave that passes through foes and walls.', cd: 0.55, windup: 0.06, active: 0.05, recover: 0.14,
        speed: 820, grav: 0, radius: 16, grow: 70, dmg: 8, knock: 420, lift: 0.3, pierce: true, ghost: true, life: 0.75, style: 'sonic' },
      { slot: 'p1', id: 'resonance', name: 'Resonance', type: 'power', icon: 'resonance', kind: 'resonance', pose: 'channel',
        desc: 'Tag every foe in range. A moment later they shatter with sound and are stunned.', cd: 10, windup: 0.15, active: 0.1, recover: 0.2,
        radius: 560, delay: 0.75, dmg: 14, knock: 260, lift: 0.4, shock: 1.1 },
      { slot: 'p2', id: 'rewind', name: 'Rewind', type: 'power', icon: 'rewind', kind: 'rewind', pose: 'raise',
        desc: 'Snap back to where you were 1.5 seconds ago, shaking off ailments. Saves you from falls.', cd: 12, windup: 0.05, active: 0.05, recover: 0.1,
        back: 1.5, heal: 0.08 },
    ],
  },
  {
    id: 'dragon', name: 'Dragon', color: '#ffcf5a', deep: '#e0532d', price: 1500,
    blurb: 'Breathe fire, dive from the sky and summon a great dragon that sweeps the whole arena.',
    moves: [
      { slot: 'main', id: 'dragonfire', name: 'Dragonfire', type: 'ranged', icon: 'breath', kind: 'projectile', pose: 'cast',
        desc: 'A short roaring burst of dragon flame that burns everything in front of you.', cd: 0.42, windup: 0.06, active: 0.05, recover: 0.12,
        count: 3, spread: 0.16, speed: 980, grav: 0, radius: 15, dmg: 6, knock: 260, lift: 0.2, pierce: true, life: 0.36, ghost: true, burn: { dps: 5, dur: 2.5 }, style: 'dragonfire' },
      { slot: 'p1', id: 'dragon_dive', name: 'Dragon Dive', type: 'power', icon: 'dive', kind: 'dive', pose: 'heavy',
        desc: 'Leap into the sky and crash down at your aim, erupting in flame.', cd: 7, windup: 0.08, active: 0.1, recover: 0.25,
        dmg: 24, radius: 175, knock: 820, lift: 1.1, burn: { dps: 6, dur: 3 } },
      { slot: 'p2', id: 'summon_dragon', name: 'Summon Dragon', type: 'power', icon: 'dragon', kind: 'dragon', pose: 'raise',
        desc: 'A great golden dragon sweeps across the whole arena, scorching and launching every foe it touches.', cd: 16, windup: 0.3, active: 0.1, recover: 0.3,
        dur: 2.6, dmg: 22, knock: 700, lift: 1.3, burn: { dps: 7, dur: 3 } },
    ],
  },
  /* ------------------------------------------------ twenty newer elements */
  {
    id: 'sand', name: 'Sand', color: '#f2d28b', deep: '#c2902f', price: 110,
    blurb: 'Gritty blasts, rolling dunes and a storm that slows everything caught in it.',
    moves: [
      { slot: 'main', id: 'sand_blast', name: 'Sand Blast', type: 'ranged', icon: 'grit', kind: 'projectile', pose: 'cast',
        desc: 'Fling a spray of grit that slows what it hits.', cd: 0.5, windup: 0.07, active: 0.05, recover: 0.15,
        speed: 900, grav: 300, radius: 9, dmg: 5, count: 3, spread: 0.1, knock: 220, lift: 0.2, chill: 1.2, life: 0.9 },
      { slot: 'p1', id: 'dune_wave', name: 'Dune Wave', type: 'power', icon: 'dune', kind: 'wave', pose: 'nova',
        desc: 'Roll a dune across the ground that carries foes away.', cd: 6, windup: 0.16, active: 0.1, recover: 0.2,
        speed: 640, height: 85, life: 1.2, dmg: 13, knock: 760, lift: 0.5, chill: 1.5 },
      { slot: 'p2', id: 'sandstorm', name: 'Sandstorm', type: 'power', icon: 'sandstorm', kind: 'zone', pose: 'raise',
        desc: 'Whip up a sandstorm at your aim that grinds and slows foes.', cd: 9, windup: 0.18, active: 0.1, recover: 0.2,
        range: 620, zone: { r: 170, dur: 3.2, dps: 14, style: 'aura', fx: { chill: 1 } } },
    ],
  },
  {
    id: 'magma', name: 'Magma', color: '#ff8a4c', deep: '#b8321a', price: 240,
    blurb: 'Molten fists, lava vents and an eruption that sets the whole island ablaze.',
    moves: [
      { slot: 'main', id: 'magma_fist', name: 'Magma Fist', type: 'melee', icon: 'magmafist', kind: 'melee', pose: 'heavy',
        desc: 'A slow, molten punch that burns.', cd: 0.6, windup: 0.12, active: 0.1, recover: 0.2,
        reach: 72, radius: 34, dmg: 17, knock: 640, lift: 0.4, burn: { dps: 5, dur: 2.5 } },
      { slot: 'p1', id: 'lava_vents', name: 'Lava Vents', type: 'power', icon: 'vents', kind: 'pillars', pose: 'heavy',
        desc: 'Three lava vents burst open in front of you.', cd: 7, windup: 0.2, active: 0.1, recover: 0.25,
        n: 3, gap: 130, delay: 0.16, radius: 64, dmg: 15, knock: 460, lift: 1.5, burn: { dps: 6, dur: 3 } },
      { slot: 'p2', id: 'eruption', name: 'Eruption', type: 'power', icon: 'eruption', kind: 'nova', pose: 'nova',
        desc: 'Explode in molten rock, burning everyone around you.', cd: 10, windup: 0.2, active: 0.1, recover: 0.25,
        radius: 210, dmg: 20, knock: 760, lift: 0.9, burn: { dps: 7, dur: 3 } },
    ],
  },
  {
    id: 'smoke', name: 'Smoke', color: '#c9c3d8', deep: '#5d566e', price: 290,
    blurb: 'Quick jabs from the haze, smoke bombs and a vanishing dash.',
    moves: [
      { slot: 'main', id: 'smoke_jab', name: 'Smoke Jab', type: 'melee', icon: 'jab', kind: 'melee', pose: 'punch',
        desc: 'Lightning-fast jabs.', cd: 0.28, windup: 0.04, active: 0.08, recover: 0.1,
        reach: 64, radius: 28, dmg: 8, knock: 380, lift: 0.25 },
      { slot: 'p1', id: 'smoke_bomb', name: 'Smoke Bomb', type: 'power', icon: 'smokebomb', kind: 'zone', pose: 'cast',
        desc: 'Drop a choking cloud that slows and stings foes.', cd: 7, windup: 0.12, active: 0.1, recover: 0.15,
        range: 560, zone: { r: 160, dur: 3, dps: 12, style: 'aura', fx: { chill: 1.2 } } },
      { slot: 'p2', id: 'vanish', name: 'Vanish', type: 'power', icon: 'vanish', kind: 'dash', pose: 'dash',
        desc: 'Vanish into smoke and dash through foes, untouchable.', cd: 5, windup: 0.03, active: 0.24, recover: 0.12,
        speed: 1400, dmg: 14, knock: 520, lift: 0.4, invuln: true },
    ],
  },
  {
    id: 'spirit', name: 'Spirit', color: '#b8f5ff', deep: '#4aa9c9', price: 350,
    blurb: 'Seeking wisps, a phase step and a calming bloom of spirit light.',
    moves: [
      { slot: 'main', id: 'wisp', name: 'Wisp', type: 'ranged', icon: 'wisp', kind: 'projectile', pose: 'cast',
        desc: 'Release a wisp that homes in on the nearest foe.', cd: 0.5, windup: 0.08, active: 0.05, recover: 0.14,
        speed: 620, grav: 0, radius: 12, dmg: 11, knock: 320, lift: 0.25, homing: 5, life: 2.2 },
      { slot: 'p1', id: 'phase', name: 'Phase', type: 'power', icon: 'phase', kind: 'blink', pose: 'nova',
        desc: 'Slip through the spirit world to your aim and burst out, binding foes in spirit chains.', cd: 5, windup: 0.05, active: 0.1, recover: 0.15,
        range: 400, radius: 120, dmg: 18, knock: 520, lift: 0.4, root: 1 },
      { slot: 'p2', id: 'spirit_bloom', name: 'Spirit Bloom', type: 'power', icon: 'spiritbloom', kind: 'heal', pose: 'raise',
        desc: 'Heal 25% over 2s and push foes away.', cd: 13, windup: 0.12, active: 0.1, recover: 0.15,
        heal: 0.25, dur: 2, radius: 140, knock: 560, lift: 0.5, dmg: 8 },
    ],
  },
  {
    id: 'crimson', name: 'Crimson', color: '#ff6f86', deep: '#a3173a', price: 400,
    blurb: 'A life-stealing whip, bleeding thorns and a nova that feeds on every hit.',
    moves: [
      { slot: 'main', id: 'crimson_lash', name: 'Crimson Lash', type: 'melee', icon: 'lash', kind: 'melee', pose: 'swing',
        desc: 'A long lash that heals you for a slice of the damage.', cd: 0.46, windup: 0.08, active: 0.12, recover: 0.14,
        reach: 112, radius: 22, dmg: 11, knock: 440, lift: 0.3, leech: 0.25 },
      { slot: 'p1', id: 'hemorrhage', name: 'Hemorrhage', type: 'power', icon: 'thorns', kind: 'projectile', pose: 'cast',
        desc: 'Fire three thorns that make foes bleed.', cd: 5, windup: 0.1, active: 0.05, recover: 0.15,
        speed: 1100, grav: 0, radius: 9, dmg: 8, count: 3, spread: 0.12, knock: 260, lift: 0.2, poison: { dps: 6, dur: 3 }, life: 1 },
      { slot: 'p2', id: 'crimson_nova', name: 'Crimson Nova', type: 'power', icon: 'bloodnova', kind: 'nova', pose: 'nova',
        desc: 'Burst outward and drink in half the damage dealt.', cd: 10, windup: 0.16, active: 0.1, recover: 0.2,
        radius: 190, dmg: 18, knock: 640, lift: 0.6, leech: 0.5 },
    ],
  },
  {
    id: 'plasma', name: 'Plasma', color: '#7affea', deep: '#1aa6c4', price: 430,
    blurb: 'Piercing plasma shots, a charged dash and a storm of plasma bolts from above.',
    moves: [
      { slot: 'main', id: 'plasma_shot', name: 'Plasma Shot', type: 'ranged', icon: 'plasmashot', kind: 'projectile', pose: 'cast',
        desc: 'A fast shot that pierces through foes.', cd: 0.42, windup: 0.06, active: 0.05, recover: 0.12,
        speed: 1500, grav: 0, radius: 10, dmg: 9, knock: 260, lift: 0.15, pierce: true, life: 0.9 },
      { slot: 'p1', id: 'arc_dash', name: 'Arc Dash', type: 'power', icon: 'arcdash', kind: 'dash', pose: 'dash',
        desc: 'Dash forward wrapped in plasma, stunning what you hit.', cd: 4.5, windup: 0.04, active: 0.22, recover: 0.12,
        speed: 1400, dmg: 13, knock: 480, lift: 0.4, shock: 0.6 },
      { slot: 'p2', id: 'plasma_rain', name: 'Plasma Rain', type: 'power', icon: 'plasmarain', kind: 'strike', pose: 'raise',
        desc: 'Call plasma bolts down on four foes.', cd: 10, windup: 0.25, active: 0.1, recover: 0.2,
        targets: 4, delay: 0.14, dmg: 20, knock: 560, lift: 0.6, shock: 0.5, style: 'beam' },
    ],
  },
  {
    id: 'moon', name: 'Moon', color: '#dfe1ff', deep: '#6b6fd6', price: 580,
    blurb: 'Crescent blades, a returning moon disc and moonbeams from the night sky.',
    moves: [
      { slot: 'main', id: 'crescent_cut', name: 'Crescent Cut', type: 'melee', icon: 'crescent', kind: 'melee', pose: 'swing',
        desc: 'A sweeping crescent slash.', cd: 0.42, windup: 0.07, active: 0.12, recover: 0.14,
        reach: 98, radius: 26, dmg: 12, knock: 480, lift: 0.35 },
      { slot: 'p1', id: 'moon_disc', name: 'Moon Disc', type: 'power', icon: 'moondisc', kind: 'projectile', pose: 'cast',
        desc: 'Throw a moon disc that slices through foes and returns.', cd: 6, windup: 0.1, active: 0.05, recover: 0.15,
        speed: 1000, grav: 0, radius: 28, dmg: 11, knock: 360, lift: 0.3, pierce: true, tick: 0.3, boomerang: 0.42, ghost: true, life: 2.2, style: 'halo' },
      { slot: 'p2', id: 'moonbeams', name: 'Moonbeams', type: 'power', icon: 'moonbeams', kind: 'strike', pose: 'raise',
        desc: 'Moonbeams strike down on three foes.', cd: 10, windup: 0.28, active: 0.1, recover: 0.2,
        targets: 3, delay: 0.18, dmg: 24, knock: 620, lift: 0.7, style: 'beam' },
    ],
  },
  {
    id: 'mirror', name: 'Mirror', color: '#e8f4ff', deep: '#7f9bb8', price: 700,
    blurb: 'Glass shards that ricochet, a reflecting shell and a mirror step.',
    moves: [
      { slot: 'main', id: 'glass_shards', name: 'Glass Shards', type: 'ranged', icon: 'glass', kind: 'projectile', pose: 'cast',
        desc: 'Two glass shards that bounce off islands.', cd: 0.5, windup: 0.07, active: 0.05, recover: 0.14,
        speed: 1000, grav: 700, radius: 9, dmg: 8, count: 2, spread: 0.1, knock: 280, lift: 0.2, bounce: 2, life: 1.6, style: 'shard' },
      { slot: 'p1', id: 'mirror_step', name: 'Mirror Step', type: 'power', icon: 'mirrorstep', kind: 'blink', pose: 'nova',
        desc: 'Step through your reflection and shatter on arrival.', cd: 5, windup: 0.05, active: 0.1, recover: 0.15,
        range: 420, radius: 120, dmg: 19, knock: 600, lift: 0.5 },
      { slot: 'p2', id: 'mirror_shell', name: 'Mirror Shell', type: 'power', icon: 'mirrorshell', kind: 'shield', pose: 'raise',
        desc: 'A mirrored shell absorbs 50 damage.', cd: 11, windup: 0.08, active: 0.1, recover: 0.1,
        absorb: 50, dur: 4, heal: 8 },
    ],
  },
  {
    id: 'phoenix', name: 'Phoenix', color: '#ffb05a', deep: '#d62f5a', price: 1300,
    blurb: 'Flaring feathers, a rebirth that heals in fire and a blazing firebird dive.',
    moves: [
      { slot: 'main', id: 'flare_feathers', name: 'Flare Feathers', type: 'ranged', icon: 'feathers', kind: 'projectile', pose: 'cast',
        desc: 'Two burning feathers that streak at foes.', cd: 0.46, windup: 0.06, active: 0.05, recover: 0.14,
        speed: 1100, grav: 0, radius: 11, dmg: 8, count: 2, spread: 0.08, knock: 300, lift: 0.25, burn: { dps: 5, dur: 2.5 }, life: 1, style: 'fireball' },
      { slot: 'p1', id: 'rebirth', name: 'Rebirth', type: 'power', icon: 'rebirth', kind: 'heal', pose: 'raise',
        desc: 'Heal 35% over 2.5s and burst into flames around you.', cd: 15, windup: 0.12, active: 0.1, recover: 0.15,
        heal: 0.35, dur: 2.5, radius: 170, knock: 560, lift: 0.6, dmg: 12, burn: { dps: 6, dur: 3 } },
      { slot: 'p2', id: 'firebird', name: 'Firebird Dive', type: 'power', icon: 'firebird', kind: 'dive', pose: 'heavy',
        desc: 'Soar up and crash down at your aim in a burst of flame.', cd: 8, windup: 0.08, active: 0.1, recover: 0.25,
        dmg: 22, radius: 170, knock: 800, lift: 1.1, burn: { dps: 6, dur: 3 } },
    ],
  },
  {
    id: 'cosmos', name: 'Cosmos', color: '#c2b3ff', deep: '#3b2a9a', price: 1750,
    blurb: 'Star lances, a black star that devours the field and a supernova.',
    moves: [
      { slot: 'main', id: 'star_lance', name: 'Star Lance', type: 'ranged', icon: 'starlance', kind: 'projectile', pose: 'cast',
        desc: 'A lance of starlight that pierces everything.', cd: 0.45, windup: 0.06, active: 0.05, recover: 0.13,
        speed: 1500, grav: 0, radius: 11, dmg: 12, knock: 340, lift: 0.25, pierce: true, life: 0.9, style: 'lance' },
      { slot: 'p1', id: 'black_star', name: 'Black Star', type: 'power', icon: 'blackstar', kind: 'zone', pose: 'raise',
        desc: 'Summon a black star that drags in and crushes foes.', cd: 10, windup: 0.2, active: 0.1, recover: 0.2,
        range: 650, zone: { r: 250, dur: 2.6, dps: 18, pull: 2900, style: 'rift' } },
      { slot: 'p2', id: 'supernova', name: 'Supernova', type: 'power', icon: 'supernova', kind: 'nova', pose: 'nova',
        desc: 'Explode like a dying star, blasting everything far away.', cd: 13, windup: 0.3, active: 0.1, recover: 0.3,
        radius: 280, dmg: 30, knock: 980, lift: 1 },
    ],
  },
];

// Apply the global combat balance pass once to the move data.
// Main ranged attacks gain 5%; non-Gale main melee attacks gain 15%.
// Every non-main ability gets an additional 5% multiplier on top of its
// attack-type multiplier. Damage-over-time and nested blast/zone damage scale too.
const DAMAGE_FIELDS = new Set(['dmg', 'dps', 'airDmg']);
function scaleMoveDamage(node, multiplier) {
  if (!node || typeof node !== 'object' || multiplier <= 1) return;
  for (const [key, value] of Object.entries(node)) {
    if (DAMAGE_FIELDS.has(key) && typeof value === 'number') {
      node[key] = Math.ceil(value * multiplier - 1e-9);
    } else if (value && typeof value === 'object') {
      scaleMoveDamage(value, multiplier);
    }
  }
}
for (const element of ELEMENTS) {
  for (const move of element.moves) {
    const attackMultiplier = move.type === 'ranged'
      ? 1.05
      : move.type === 'melee' && element.id !== 'wind'
        ? 1.15
        : 1;
    const abilityMultiplier = move.slot === 'main' ? 1 : 1.05;
    scaleMoveDamage(move, attackMultiplier * abilityMultiplier);
  }
}
const ELEMENT_BY_ID = Object.fromEntries(ELEMENTS.map(e => [e.id, e]));

/* plain brawlers and basic enemy strikes */
// listed cheapest first everywhere (codex, loadout picker)
ELEMENTS.sort((a, b) => a.price - b.price);

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
  void:      { weak: ['light', 'arcane'], resist: ['void', 'wind', 'frost'] },
  water:     { weak: ['lightning', 'nature'], resist: ['water', 'fire', 'frost'] },
  venom:     { weak: ['fire', 'arcane'], resist: ['venom', 'nature', 'water'] },
};
/* element combos: set a foe up with one element, then hit it with the partner.
   a: element(s) that apply the setup status; b: element that cashes it in. */
const COMBOS = [
  { id: 'shatter', name: 'Shatter', a: ['frost'], b: 'earth', mul: 2, clear: 'freeze',
    desc: 'Freeze a foe with Rime, then smash it with Stone for double damage.', when: (st, el) => el === 'earth' && st.freeze > 0 },
  { id: 'overload', name: 'Overload', a: ['water'], b: 'lightning', mul: 1.6,
    desc: 'Soak foes with Tide and every Storm hit deals +60%.', when: (st, el) => el === 'lightning' && st.soak > 0 },
  { id: 'wildfire', name: 'Wildfire', a: ['nature'], b: 'fire', mul: 1.5,
    desc: 'Foes tangled in Thorn roots go up in flames: Ember deals +50%.', when: (st, el) => el === 'fire' && st.root > 0 },
  { id: 'ignite', name: 'Ignite', a: ['venom'], b: 'fire', mul: 1.5,
    desc: 'Poisoned foes catch fire easily: Ember deals +50%.', when: (st, el) => el === 'fire' && st.poison > 0 },
  { id: 'firestorm', name: 'Firestorm', a: ['fire', 'dragon', 'magma', 'phoenix'], b: 'wind', mul: 1.4, knock: 1.3,
    desc: 'Gale fans the flames: burning foes take +40% and fly further.', when: (st, el) => el === 'wind' && st.burn > 0 },
  { id: 'resonate', name: 'Resonate', a: ['lightning', 'echo', 'plasma'], b: 'steel', mul: 1.5,
    desc: 'Foes stunned by Storm or Echo ring like a bell: Steel deals +50%.', when: (st, el) => el === 'steel' && st.shock > 0 },
  { id: 'starfall', name: 'Starfall', a: ['gravity', 'cosmos', 'wind'], b: 'arcane', mul: 1.5,
    desc: 'Foes floating or flung by Gravity are easy targets: Arcane deals +50%.', when: (st, el, t) => el === 'arcane' && t && (!t.root.grounded || t.mode !== 'active') },
  { id: 'prismatic', name: 'Prismatic', a: ['crystal', 'mirror'], b: 'light', mul: 1.6,
    desc: 'Crystal leaves foes glinting: Radiance refracts through them for +60%.', when: (st, el) => el === 'light' && st.glint > 0 },
  { id: 'eclipse', name: 'Eclipse', a: ['light', 'arcane'], b: 'void', mul: 1.6,
    desc: 'Foes dazzled by Radiance are swallowed by Void: +60%.', when: (st, el) => el === 'void' && st.dazzle > 0 },
  { id: 'singularity', name: 'Singularity', a: ['void'], b: 'gravity', mul: 1.6,
    desc: 'Foes drained by Void collapse under Gravity: +60%.', when: (st, el) => el === 'gravity' && st.drain > 0 },
  { id: 'inferno', name: 'Inferno', a: ['fire'], b: 'dragon', mul: 1.5,
    desc: 'Burning foes feed the Dragon: every Dragon hit deals +50%.', when: (st, el) => el === 'dragon' && st.burn > 0 },
  { id: 'thunderwing', name: 'Thunderwing', a: ['lightning', 'echo', 'plasma', 'steel'], b: 'dragon', mul: 1.5,
    desc: 'Stunned foes cannot dodge the Dragon: +50%.', when: (st, el) => el === 'dragon' && st.shock > 0 },
  { id: 'mudslide', name: 'Mudslide', a: ['water'], b: 'sand', mul: 1.5,
    desc: 'Soaked foes turn to mud: every Sand hit deals +50%.', when: (st, el) => el === 'sand' && st.soak > 0 },
  { id: 'glassworks', name: 'Glassworks', a: ['sand', 'smoke'], b: 'mirror', mul: 1.6,
    desc: 'Slowed foes are stuck in place for Mirror: +60%.', when: (st, el) => el === 'mirror' && st.chill > 0 },
  { id: 'meltdown', name: 'Meltdown', a: ['venom', 'crimson'], b: 'magma', mul: 1.6,
    desc: 'Poisoned or bleeding foes melt in the heat: Magma deals +60%.', when: (st, el) => el === 'magma' && st.poison > 0 },
  { id: 'ashes', name: 'Ashes', a: ['fire', 'magma', 'dragon'], b: 'phoenix', mul: 1.5,
    desc: 'Burning foes feed the Phoenix: +50%.', when: (st, el) => el === 'phoenix' && st.burn > 0 },
  { id: 'smokescreen', name: 'Smokescreen', a: ['light', 'arcane'], b: 'smoke', mul: 1.6,
    desc: 'Foes dazzled by Radiance or Arcane never see Smoke coming: +60%.', when: (st, el) => el === 'smoke' && st.dazzle > 0 },
  { id: 'haunt', name: 'Haunt', a: ['smoke', 'sand', 'frost'], b: 'spirit', mul: 1.5,
    desc: 'Slowed or chilled foes are haunted: Spirit deals +50%.', when: (st, el) => el === 'spirit' && st.chill > 0 },
  { id: 'bloodlust', name: 'Bloodlust', a: ['nature', 'spirit'], b: 'crimson', mul: 1.5,
    desc: 'Rooted foes cannot escape the lash: Crimson deals +50%.', when: (st, el) => el === 'crimson' && st.root > 0 },
  { id: 'bloodmoon', name: 'Blood Moon', a: ['crimson', 'venom'], b: 'moon', mul: 1.5,
    desc: 'Bleeding foes fall under the Moon: +50%.', when: (st, el) => el === 'moon' && st.poison > 0 },
  { id: 'landslide', name: 'Landslide', a: ['sand', 'smoke'], b: 'earth', mul: 1.4,
    desc: 'Slowed foes cannot dodge the rockfall: Stone deals +40%.', when: (st, el) => el === 'earth' && st.chill > 0 },
  { id: 'frostbite', name: 'Frostbite', a: ['frost'], b: 'crystal', mul: 1.5, clear: 'freeze',
    desc: 'Frozen foes crystallise and crack: Crystal deals +50%.', when: (st, el) => el === 'crystal' && st.freeze > 0 },
  { id: 'conductor', name: 'Conductor', a: ['water'], b: 'plasma', mul: 1.6,
    desc: 'Plasma arcs through soaked foes for +60%.', when: (st, el) => el === 'plasma' && st.soak > 0 },
  { id: 'bigbang', name: 'Big Bang', a: ['gravity', 'moon', 'wind'], b: 'cosmos', mul: 1.6,
    desc: 'Foes flung airborne are blown apart by Cosmos: +60%.', when: (st, el, t) => el === 'cosmos' && t && (!t.root.grounded || t.mode !== 'active') },
];
// hitting with these elements leaves a short mark that their combo partner cashes in
const COMBO_MARKS = { crystal: 'glint', mirror: 'glint', light: 'dazzle', arcane: 'dazzle', void: 'drain' };

const WEAK_MUL = 1.6;
const RESIST_MUL = 0.55;

function affinityMul(enemyEl, atkEl) {
  const a = AFFINITY[enemyEl] || AFFINITY.none;
  if (a.weak.includes(atkEl)) return WEAK_MUL;
  if (a.resist.includes(atkEl)) return RESIST_MUL;
  return 1;
}

const AURA = {
  none: '#e6e1d6', dragon: '#ffcf5a', crystal: '#9ff0e8', gravity: '#b9a6ff', echo: '#ffc6a8', steel: '#cfd6e0', venom: '#a6e35b', arcane: '#ff8ad8', wind: '#bdf3e4', fire: '#ff8a3d', water: '#7cc8ff', earth: '#e0b98f',
  frost: '#9fe6ff', lightning: '#fff27a', nature: '#9ae66e', void: '#c08bff', light: '#fff3b0',
};

for (const e of ELEMENTS) if (!AURA[e.id]) AURA[e.id] = e.color;

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
  steel: '<path d="M12 2.5 19 6v6c0 4.6-3 8-7 9.5C8 20 5 16.6 5 12V6z" fill="currentColor"/><path d="M12 6v12M8.5 9.5h7" stroke="rgba(0,0,0,.35)" stroke-width="1.8"/>',
  venom: '<path d="M12 2.5C9 7 6.5 10.3 6.5 14a5.5 5.5 0 0 0 11 0c0-3.7-2.5-7-5.5-11.5z" fill="currentColor"/><circle cx="10" cy="14.5" r="1.6" fill="rgba(0,0,0,.35)"/><circle cx="13.6" cy="16.6" r="1.1" fill="rgba(0,0,0,.35)"/>',
  arcane: '<path d="m12 2 2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z" fill="currentColor"/>',
  crystal: '<path d="M12 2 18.5 8 12 22 5.5 8z" fill="currentColor"/><path d="M5.5 8h13M12 2 9.5 8 12 22l2.5-14L12 2" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.3"/>',
  gravity: '<circle cx="12" cy="12" r="4.2" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-25 12 12)"/>',
  echo: '<path d="M4 9.5v5M8 7v10M12 4.5v15M16 7v10M20 9.5v5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  dragon: '<path d="M3 13c2.5-1 4-3.5 4.5-6.5 1.5 1.8 2.6 2.4 4.5 2.3 2.4 0 4.5-1.5 6-3.8.4 2.6 0 5-1.3 7l3.3 1.5-3.8 1.4c-1.4 3.6-4.7 6.1-8.7 6.1-2.3 0-3.9-.6-5.5-1.8l2.7-.9z" fill="currentColor"/><circle cx="15.2" cy="11.2" r="1.2" fill="rgba(0,0,0,.4)"/>',
  sand: '<path d="M2 17c3-3 6-3 9 0s6 3 11 0v4H2z" fill="currentColor"/><path d="M4 11c2.5-2 5-2 7.5 0s5 2 8.5 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="7" cy="5.5" r="1.4" fill="currentColor"/><circle cx="13" cy="4" r="1.1" fill="currentColor"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor"/>',
  magma: '<path d="M3 20.5 9 8l3 4 2.5-3.5 6.5 12z" fill="currentColor"/><path d="M11.3 4.5c.4 1.4-.6 2-.6 3.2a1.4 1.4 0 0 0 2.8 0c0-1.2-1.2-1.8-2.2-3.2zM9.5 14.5l2.5 2 1.5-2.5 2 3" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5" stroke-linejoin="round"/>',
  smoke: '<path d="M3.5 16.5A3.8 3.8 0 0 1 7.5 12.6a5 5 0 0 1 9.6.9 3.3 3.3 0 0 1-.4 6.5H7a3.5 3.5 0 0 1-3.5-3.5z" fill="currentColor"/><path d="M8.5 9.5c-1.2-1.6.8-2.6-.3-4.8M13 9c-1.2-1.6.8-2.6-.3-4.8M17 10c-.9-1.2.6-2-.2-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  spirit: '<path d="M12 2.5c4 0 7 3 7 7.5v10.5l-2.3-1.6-2.3 1.6-2.4-1.6-2.4 1.6-2.3-1.6L5 20.5V10c0-4.5 3-7.5 7-7.5z" fill="currentColor"/><circle cx="9.5" cy="10" r="1.4" fill="rgba(0,0,0,.4)"/><circle cx="14.5" cy="10" r="1.4" fill="rgba(0,0,0,.4)"/>',
  crimson: '<path d="M12 3c-3.4 4.7-6 8-6 11.2a6 6 0 0 0 12 0C18 11 15.4 7.7 12 3z" fill="currentColor"/><path d="M9 4.5 5 2.5M15 4.5l4-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9.3 14.5a2.8 2.8 0 0 0 2.4 2.8" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.6" stroke-linecap="round"/>',
  plasma: '<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2.5c2 3 0 5 2 7M21.5 12c-3 2-5 0-7 2M12 21.5c-2-3 0-5-2-7M2.5 12c3-2 5 0 7-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  moon: '<path d="M15.5 3a9 9 0 1 0 5.5 14.5A7.5 7.5 0 0 1 15.5 3z" fill="currentColor"/>',
  mirror: '<path d="M12 2.5 19 6v12l-7 3.5L5 18V6z" fill="currentColor"/><path d="M8.5 8.5 13 6M8.5 12l6-3.5M10 15l4-2.3" stroke="rgba(255,255,255,.8)" stroke-width="1.5" stroke-linecap="round"/>',
  phoenix: '<path d="M12 21c-1-3-4-4-6.5-7.5C3.5 10.5 3.5 6 3 3c2.5 2 4 4 5.5 4.5C9.5 5 10.5 3.5 12 2c1.5 1.5 2.5 3 3.5 5.5C17 7 18.5 5 21 3c-.5 3-.5 7.5-2.5 10.5C16 17 13 18 12 21z" fill="currentColor"/>',
  cosmos: '<circle cx="12" cy="12" r="3.4" fill="currentColor"/><path d="m5 4 .8 1.8L7.6 6.6l-1.8.8L5 9.2l-.8-1.8L2.4 6.6l1.8-.8zM18.5 14.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7zM17.5 3.5l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z" fill="currentColor"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.5 2.5"/>',
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
