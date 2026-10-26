'use strict';
/* =========================================================================
   Icons (24x24, currentColor). UI glyphs plus one glyph per move.
   Any element with data-icon="name" is filled in by Icons.hydrate().
   ========================================================================= */

const Icons = (() => {
  const S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const F = 'fill="currentColor"';
  const P = {
    // ui
    heart: `<path d="M12 20.5S3.5 15 3.5 9A4.5 4.5 0 0 1 12 6.6 4.5 4.5 0 0 1 20.5 9c0 6-8.5 11.5-8.5 11.5z" ${F}/>`,
    gem: `<path d="M6.5 3.5h11l4 5.2L12 21 2.5 8.7z" ${F}/><path d="M2.5 8.7h19M9 3.5 7.8 8.7 12 21l4.2-12.3L15 3.5" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.3"/>`,
    star: `<path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" ${F}/>`,
    pause: `<path d="M8.5 5v14M15.5 5v14" ${S} stroke-width="3.4"/>`,
    play: `<path d="M7 4.5v15l12.5-7.5z" ${F}/>`,
    back: `<path d="M15 5l-7 7 7 7" ${S} stroke-width="3"/>`,
    gear: `<path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" ${S}/><path d="M10.3 2.8h3.4l.6 2.6 2 1.1 2.5-.9 1.7 2.9-1.9 1.8v2.3l1.9 1.8-1.7 2.9-2.5-.9-2 1.1-.6 2.6h-3.4l-.6-2.6-2-1.1-2.5.9-1.7-2.9 1.9-1.8v-2.3L3.5 8.5l1.7-2.9 2.5.9 2-1.1z" ${S} stroke-width="1.9"/>`,
    infinity: `<path d="M12 12c-2-2.6-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1.4 5.5-4zm0 0c2 2.6 3.5 4 5.5 4a4 4 0 0 0 0-8c-2 0-3.5 1.4-5.5 4z" ${S} stroke-width="2.6"/>`,
    book: `<path d="M12 6.5C9.5 4.6 6.5 4 3 4.3v14.2c3.5-.3 6.5.3 9 2.2 2.5-1.9 5.5-2.5 9-2.2V4.3c-3.5-.3-6.5.3-9 2.2z" ${F}/><path d="M12 6.5v14" stroke="rgba(0,0,0,.35)" stroke-width="1.6"/><path d="M5.5 8.5c1.8 0 3.4.3 4.5.9M5.5 11.5c1.8 0 3.4.3 4.5.9" stroke="rgba(0,0,0,.25)" stroke-width="1.3" fill="none"/>`,
    hammer: `<path d="M13.5 3.5 20.5 10.5 18 13 15.8 10.8 6 20.6a1.8 1.8 0 0 1-2.6-2.6L13.2 8.2 11 6z" ${F}/>`,
    lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.4" ${F}/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/>`,
    crown: `<path d="M3 18.5h18l1-11-5.5 4.2L12 4.5l-4.5 7.2L2 7.5z" ${F}/>`,
    skull: `<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.2 3 5.3V20h10v-3.7c1.7-1.1 3-2.7 3-5.3a8 8 0 0 0-8-8z" ${F}/><circle cx="8.8" cy="11.5" r="2" fill="#1a1424"/><circle cx="15.2" cy="11.5" r="2" fill="#1a1424"/>`,
    up: `<path d="M12 19V6M6 11.5 12 5.5l6 6" ${S} stroke-width="3"/>`,
    restart: `<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4v4.5H9" ${S} stroke-width="2.6"/>`,
    home: `<path d="M3 11.2 12 3.5l9 7.7V20.5H14.5v-6h-5v6H3z" ${F}/>`,
    map: `<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20" ${S}/>`,
    next: `<path d="M5 12h13M13 6l6 6-6 6" ${S} stroke-width="2.8"/>`,
    sound: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" ${F}/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" ${S}/>`,
    music: `<path d="M9 17.5V5.5l11-2v12" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="6.5" cy="17.5" r="2.8" ${F}/><circle cx="17.5" cy="15.5" r="2.8" ${F}/>`,
    shake: `<path d="M7 5.5h10v13H7zM3.5 8v8M20.5 8v8" ${S}/>`,
    hash: `<path d="M9 4 7.5 20M16.5 4 15 20M4.5 9h16M3.5 15h16" ${S}/>`,
    rotate: `<rect x="7" y="2.5" width="10" height="19" rx="2.5" ${S}/><path d="M2.5 15a9.5 9.5 0 0 0 6 6.5M21.5 9a9.5 9.5 0 0 0-6-6.5" ${S}/>`,
    check: `<path d="M5 12.5l4.5 4.5L19 7" ${S} stroke-width="3"/>`,
    plus: `<path d="M12 5v14M5 12h14" ${S} stroke-width="3"/>`,
    sword: `<path d="M19.5 3.5 10 13M19.5 3.5v4l-8 8M19.5 3.5h-4l-8 8M6.5 13.5l4 4M4 20l3.5-3.5" ${S}/>`,
    shieldUi: `<path d="M12 2.8 4.5 5.6v6c0 4.6 3.2 8.4 7.5 9.6 4.3-1.2 7.5-5 7.5-9.6v-6z" ${F}/>`,
    swirl: `<path d="M12 12m-1.5 0a1.5 1.5 0 1 1 3 0a3 3 0 1 1-6 0a4.6 4.6 0 1 1 9.2 0a6.3 6.3 0 1 1-12.6 0" ${S}/>`,
    wing: `<path d="M3 15c4-1 7-4 9-9 1 4 0 7-2 9 3 0 6-1 9-3-1 4-5 7-10 7-2.5 0-4.5-1.5-6-4z" ${F}/>`,
    anchor: `<circle cx="12" cy="5" r="2.2" ${S}/><path d="M12 7.2V21M7.5 11h9M4 14c0 4 3.6 7 8 7s8-3 8-7" ${S}/>`,
    target: `<circle cx="12" cy="12" r="8" ${S}/><circle cx="12" cy="12" r="3.5" ${F}/>`,
    // moves
    palm: `<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11V4a1.5 1.5 0 0 1 3 0v7V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.7 7-6.5 7-2.4 0-4-1.2-5.3-3.4L3.4 13a1.6 1.6 0 0 1 2.7-1.6z" ${F}/><path d="M19 9h3M19.5 5.5 22 4M19.5 12.5 22 14" ${S} stroke-width="1.6"/>`,
    tornado: `<path d="M3 4h18M5 8h14M7.5 12h9M9.5 16h5M11 20h2" ${S} stroke-width="2.6"/>`,
    cyclone: `<path d="M4 6c4-2 12-2 16 0M5 10c3-1.5 11-1.5 14 0M7 14c2.5-1 7.5-1 10 0M9 18c1.5-.7 4.5-.7 6 0" ${S} stroke-width="2.4"/><path d="M2 21h20" ${S} stroke-width="1.6" opacity=".6"/>`,
    fireball: `<circle cx="14" cy="10" r="5.5" ${F}/><path d="M9.5 13.5 3 20M10.5 16 6 21.5M8 11 2.5 15" ${S} stroke-width="2"/>`,
    dash: `<path d="M13 4l8 8-8 8" ${S} stroke-width="3"/><path d="M3 8h7M2 12h9M3 16h7" ${S} stroke-width="2"/>`,
    burst: `<path d="m12 2 2.2 6 6.3-1.8-4.1 5 4.6 4.6-6.4-.6L12 22l-2.6-6.8-6.4.6 4.6-4.6-4.1-5L9.8 8z" ${F}/>`,
    whip: `<path d="M4 20c2-6 6-4 8-8s1-7 6-8" ${S} stroke-width="2.6"/><circle cx="19" cy="4" r="2" ${F}/>`,
    wave: `<path d="M2 18c2.5 0 3-2 5.5-2S10 18 12.5 18s3-2 5.5-2 2.5 2 4 2M3 13c1-4 4-8 9-8 3 0 5 2 5 4.5S15 13 13 12" ${S} stroke-width="2.3"/>`,
    shield: `<circle cx="12" cy="12" r="9" ${S} stroke-width="2.4"/><path d="M8 9.5a4.5 4.5 0 0 1 3-2.5" ${S}/>`,
    fist: `<rect x="5" y="7" width="13" height="10" rx="3" ${F}/><path d="M8.5 7v4M12 7v4M15.5 7v4M5 13h4" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/><path d="M8 17v4h8v-4" ${F}/>`,
    boulder: `<path d="M6 7.5 11 4l6 1.5 3.5 5-1 6.5L14 21l-6.5-1L3.5 15l.5-5z" ${F}/><path d="M9 10l3 2 4-1M12 12l-1 5" stroke="rgba(0,0,0,.3)" stroke-width="1.5" fill="none"/>`,
    quake: `<path d="M2 20h20M5 20l2-6 3 3 2-8 3 6 2-4 2 9" ${S} stroke-width="2.2"/><path d="M12 2v4" ${S}/>`,
    shards: `<path d="M3 15 15 9l-2 3zM4 20l13-4-2.5 2.5zM5 10l11-6.5-1.5 3z" ${F}/>`,
    snow: ICON_PATHS.frost,
    lance: `<path d="M2 22 16 8l1.5 1.5L4 23zM16 8l6-6-1.5 7.5z" ${F}/>`,
    bolt: ICON_PATHS.lightning,
    blink: `<circle cx="6" cy="17" r="3" ${S} stroke-dasharray="2 2.5"/><circle cx="18" cy="7" r="3.5" ${F}/><path d="M8.5 15 15 9" ${S} stroke-dasharray="2 2.5"/>`,
    storm: `<path d="M6.5 12a4.5 4.5 0 0 1 .7-8.9A6 6 0 0 1 18 5a3.5 3.5 0 0 1 0 7z" ${F}/><path d="M10 13.5 8 18h3l-1.5 4.5M16 13.5 14.5 17h2.5L16 20" ${S} stroke-width="2"/>`,
    vine: `<path d="M4 21c0-6 4-8 8-9s7-4 7-9" ${S} stroke-width="2.4"/><path d="M8 15c-2.5 0-4-1.5-4-3.5 2.5 0 4 1.5 4 3.5zM15 9c0-2.5 1.5-4 3.5-4 0 2.5-1.5 4-3.5 4z" ${F}/>`,
    snare: `<path d="M3 20h18" ${S}/><path d="M5 20l1.5-7L8 20M10 20l2-10 2 10M16 20l1.5-7 1.5 7" ${F}/><circle cx="12" cy="6" r="2.5" ${F}/>`,
    heal: `<path d="M12 21c-5-3-8-6.5-8-10.5A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 8 2.5c0 4-3 7.5-8 10.5z" ${F}/><path d="M12 11v6M9 14h6" stroke="rgba(0,0,0,.35)" stroke-width="2.2" stroke-linecap="round"/>`,
    orb: `<circle cx="12" cy="12" r="5.5" ${F}/><circle cx="12" cy="12" r="9" ${S} stroke-dasharray="3 3"/>`,
    rift: ICON_PATHS.void,
    blade: `<path d="M20 3 9 14l1.5 1.5L21.5 4.5z" ${F}/><path d="M7 13l4 4M5.5 18.5 9 15M3 21l2.5-2.5" ${S} stroke-width="2.4"/>`,
    beam: `<circle cx="5" cy="12" r="3" ${F}/><path d="M8 9.5h14v5H8z" ${F} opacity=".85"/><path d="M8 12h14" stroke="#fff" stroke-width="1.6"/>`,
    sun: ICON_PATHS.light,
  };
  function svg(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${P[name] || ICON_PATHS[name] || ''}</svg>`; }
  function hydrate(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
      if (el.dataset.hydrated === el.dataset.icon) return;
      el.innerHTML = svg(el.dataset.icon);
      el.dataset.hydrated = el.dataset.icon;
    });
  }
  return { svg, hydrate };
})();
