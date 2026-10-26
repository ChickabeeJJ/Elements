'use strict';
/* =========================================================================
   Elements: what each one does when fired, how it looks, and how enemy
   affinities react to it. Order here is the slot order in the HUD.
   ========================================================================= */

const ELEMENTS = [
  {
    id: 'wind', name: 'Gale', color: '#bdf3e4', deep: '#4fc7a6',
    cost: 7, dmg: 26, speed: 1.08, grav: 0.72, knock: 1.5,
    blurb: 'Light and quick. Flies flat and pushes bodies hard.',
    unlock: null,
  },
  {
    id: 'fire', name: 'Ember', color: '#ffb347', deep: '#ff5a1f',
    cost: 12, dmg: 22, speed: 1, grav: 1, knock: 1,
    burn: { dps: 9, dur: 3 }, splash: { r: 80, dmg: 12 },
    blurb: 'Bursts on impact and sets targets ablaze.',
    unlock: [0, 1],
  },
  {
    id: 'water', name: 'Tide', color: '#7cc8ff', deep: '#2f7fe0',
    cost: 15, dmg: 17, speed: 1, grav: 1, knock: 0.8,
    split: 3, spread: 0.075, soak: 5,
    blurb: 'Looses three streams. Soaked foes take double Storm damage.',
    unlock: [0, 5],
  },
  {
    id: 'earth', name: 'Stone', color: '#d9b38c', deep: '#8a5a33',
    cost: 17, dmg: 46, speed: 0.92, grav: 1.5, knock: 3.2,
    shatter: 2,
    blurb: 'Heavy, slow and brutal. Shatters frozen foes for double damage.',
    unlock: [1, 2],
  },
  {
    id: 'frost', name: 'Rime', color: '#c9f2ff', deep: '#5fc4e8',
    cost: 13, dmg: 22, speed: 1.02, grav: 0.95, knock: 0.6,
    freeze: 2.6,
    blurb: 'Freezes the target solid. Frozen archers cannot shoot.',
    unlock: [1, 5],
  },
  {
    id: 'lightning', name: 'Storm', color: '#fff27a', deep: '#c49bff',
    cost: 20, dmg: 28, speed: 1.75, grav: 0, knock: 1.2,
    chain: { n: 2, r: 340, mul: 0.6 },
    blurb: 'A straight, instant bolt that chains to nearby foes.',
    unlock: [2, 2],
  },
  {
    id: 'nature', name: 'Thorn', color: '#9ae66e', deep: '#3f9b3a',
    cost: 14, dmg: 26, speed: 1, grav: 1, knock: 1,
    leech: 0.5, root: 2.5,
    blurb: 'Roots the target and heals you for half the damage dealt.',
    unlock: [2, 5],
  },
  {
    id: 'void', name: 'Void', color: '#c08bff', deep: '#5b2bb5',
    cost: 24, dmg: 20, speed: 0.98, grav: 0.9, knock: 0.5,
    well: { r: 260, dur: 1.9, dps: 26, pull: 2600 },
    blurb: 'Tears open a rift that drags in and grinds everything nearby.',
    unlock: [3, 2],
  },
  {
    id: 'light', name: 'Radiance', color: '#fff3b0', deep: '#ffc93c',
    cost: 28, dmg: 22, speed: 1.05, grav: 0.85, knock: 1,
    beams: { n: 5, dmg: 24, spread: 170, delay: 0.12 },
    blurb: 'Calls down a volley of sunbeams where it lands.',
    unlock: [3, 5],
  },
];
const ELEMENT_BY_ID = Object.fromEntries(ELEMENTS.map(e => [e.id, e]));
/* plain arrows fired by enemies without an element */
const NEUTRAL_ARROW = { id: 'none', color: '#ece6da', deep: '#9a9184' };

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

/* colors used for enemies that carry an element (and neutral ones) */
const AURA = {
  none: '#e6e1d6',
  nature: '#9ae66e',
  fire: '#ff8a3d',
  frost: '#9fe6ff',
  lightning: '#fff27a',
  void: '#c08bff',
};

/* 24x24 icons. Stroke icons use currentColor so they tint with CSS. */
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
  none: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
};

function elementIcon(id, cls = '') {
  return `<svg class="eicon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[id] || ICON_PATHS.none}</svg>`;
}

/* canvas versions of the icons (Path2D cache) for HP bars drawn in-world */
const IconCanvas = (() => {
  const cache = new Map();
  function sprite(id, color) {
    const key = id + color;
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const img = new Image();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" style="color:${color}">${(ICON_PATHS[id] || ICON_PATHS.none).replace(/currentColor/g, color)}</svg>`;
    img.onload = () => c.getContext('2d').drawImage(img, 0, 0, 48, 48);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    cache.set(key, c);
    return c;
  }
  return { sprite };
})();
