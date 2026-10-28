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
    close: `<path d="M6 6l12 12M18 6 6 18" ${S} stroke-width="3"/>`,
    check: `<path d="M5 12.5l4.5 4.5L19 7" ${S} stroke-width="3"/>`,
    plus: `<path d="M12 5v14M5 12h14" ${S} stroke-width="3"/>`,
    sword: `<path d="M19.5 3.5 10 13M19.5 3.5v4l-8 8M19.5 3.5h-4l-8 8M6.5 13.5l4 4M4 20l3.5-3.5" ${S}/>`,
    shieldUi: `<path d="M12 2.8 4.5 5.6v6c0 4.6 3.2 8.4 7.5 9.6 4.3-1.2 7.5-5 7.5-9.6v-6z" ${F}/>`,
    swirl: `<path d="M12 12m-1.5 0a1.5 1.5 0 1 1 3 0a3 3 0 1 1-6 0a4.6 4.6 0 1 1 9.2 0a6.3 6.3 0 1 1-12.6 0" ${S}/>`,
    wing: `<path d="M3 15c4-1 7-4 9-9 1 4 0 7-2 9 3 0 6-1 9-3-1 4-5 7-10 7-2.5 0-4.5-1.5-6-4z" ${F}/>`,
    anchor: `<circle cx="12" cy="5" r="2.2" ${S}/><path d="M12 7.2V21M7.5 11h9M4 14c0 4 3.6 7 8 7s8-3 8-7" ${S}/>`,
    target: `<circle cx="12" cy="12" r="8" ${S}/><circle cx="12" cy="12" r="3.5" ${F}/>`,
    // moves
    breath: `<path d="M3 12c3-1 4.5-3 5-5.5 1 2 1 3.5.5 5 2-1 3.5-3.5 3.5-6 3 2.5 4 6 3 9 1-.5 2-1.6 2.5-3 1.4 2.5 1.6 5.2.5 7.5A8 8 0 0 1 3 12z" ${F}/>`,
    dive: `<path d="M12 2.5v12M7 10l5 5 5-5" ${S} stroke-width="3"/><path d="M3 21h18" ${S} stroke-width="2.6"/><path d="M5 18.5l2-2.5M19 18.5 17 16" ${S} stroke-width="2"/>`,
    dragon: `<path d="M2.5 16c3 0 4-3 6.5-3s3 3 5.5 3 3-2.5 5-3l2 1.5-2 1c-1.5 3-3.5 4.5-6 4.5-3 0-4-2.5-6-2.5-1.8 0-3 .8-5 .5z" ${F}/><path d="M17 12.5c.5-2.5 2.5-4 4.5-4.2M15 12.5c-.5-3 .5-5.5 3-7" ${S} stroke-width="1.8"/>`,
    pillars: `<path d="M4 21V12c0-2 1.5-3 1.5-5 1.5 1.5 2 3 2 4.5V21zM10 21V8c0-2.5 2-4 2-6.5 2 2 2.5 4 2.5 6V21zM16.5 21v-7c0-1.6 1.2-2.4 1.2-4 1.3 1.2 1.8 2.4 1.8 3.6V21z" ${F}/>`,
    orbit: `<circle cx="12" cy="12" r="3" ${F}/><ellipse cx="12" cy="12" rx="9.5" ry="5" ${S} stroke-width="1.8" opacity=".7"/><path d="m20 9.2.8 1.8 1.9.2-1.4 1.3.4 1.9-1.7-1-1.7 1 .4-1.9-1.4-1.3 1.9-.2zM5 12.5l.6 1.3 1.4.2-1 .9.3 1.4L5 15.6l-1.3.7.3-1.4-1-.9 1.4-.2z" ${F}/>`,
    magnet: `<path d="M5 3.5h4.5v8a2.5 2.5 0 0 0 5 0v-8H19v8a7 7 0 0 1-14 0z" ${F}/><path d="M5 7h4.5M14.5 7H19" stroke="rgba(0,0,0,.35)" stroke-width="2.2"/>`,
    swarm: `<g ${F}><ellipse cx="7" cy="8" rx="3" ry="2"/><ellipse cx="16" cy="6" rx="2.6" ry="1.8"/><ellipse cx="17" cy="15" rx="3" ry="2"/><ellipse cx="8" cy="17" rx="2.6" ry="1.8"/></g><g fill="currentColor" opacity=".5"><ellipse cx="6" cy="5.8" rx="2" ry="1.1"/><ellipse cx="15.2" cy="4" rx="1.8" ry="1"/><ellipse cx="16" cy="12.8" rx="2" ry="1.1"/><ellipse cx="7.2" cy="15" rx="1.8" ry="1"/></g>`,
    halo: `<ellipse cx="12" cy="12" rx="9.5" ry="4.5" ${S} stroke-width="3"/><path d="M19 7.5 21.5 5M5 16.5 2.5 19" ${S} stroke-width="2"/>`,
    crystal: `<path d="M13 2 19 8l-7 14L5 8z" ${F}/><path d="M5 8h14M13 2l-2.5 6L12 22" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.3"/>`,
    prism: `<path d="M9 22V6l3-4 3 4v16z" ${F}/><path d="M3 9h4M3 13h4M17 9l4-2M17 13l4 2" ${S} stroke-width="2"/>`,
    mine: `<path d="M3 20h18" ${S}/><path d="M5 20 7 14l4-4 4 3 3-2 1 9z" ${F}/><path d="M7 14l4 2 4-3" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="1.3"/><circle cx="17.5" cy="5" r="1.6" ${F}/><path d="M17.5 1.5v1M21 5h-1M14 5h1M19.9 2.6l-.7.7M15.1 2.6l.7.7" ${S} stroke-width="1.5"/>`,
    hook: `<path d="M6 3v10a5 5 0 0 0 10 0v-2" ${S} stroke-width="3"/><path d="m12.5 12 3.5-3.5 3.5 3.5" ${S} stroke-width="3"/><circle cx="6" cy="3" r="2" ${F}/>`,
    antigrav: `<path d="M3 20h18" ${S}/><path d="M12 17V5M8 9l4-4 4 4" ${S} stroke-width="2.6"/><circle cx="6" cy="13" r="1.8" ${F}/><circle cx="18" cy="11" r="1.6" ${F}/>`,
    crush: `<path d="M2 18h20v4H2z" ${F}/><path d="M12 2v11M7.5 9 12 13.5 16.5 9M5 4v5M19 4v5" ${S} stroke-width="2.6"/>`,
    sonic: `<path d="M5 8a6 6 0 0 1 0 8M10 5a10 10 0 0 1 0 14M15 2.5a14 14 0 0 1 0 19" ${S} stroke-width="2.6"/>`,
    resonance: `<circle cx="12" cy="12" r="3" ${F}/><circle cx="12" cy="12" r="6.5" ${S} stroke-width="2"/><circle cx="12" cy="12" r="10" ${S} stroke-width="1.6" stroke-dasharray="3 3"/>`,
    rewind: `<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4.5H9" ${S} stroke-width="2.6"/><path d="M12 8v4.5l3 2" ${S} stroke-width="2.4"/>`,
    bubble: `<circle cx="12" cy="12" r="9.3" ${F} opacity=".38"/><circle cx="12" cy="12" r="9.3" ${S} stroke-width="2.4"/><path d="M7 10.4a5.4 5.4 0 0 1 3.6-3.8" ${S} stroke-width="2.8"/>`,
    updraft: `<path d="M12 21.5V9" ${S} stroke-width="3.2"/><path d="M5.5 12 12 4.5l6.5 7.5z" ${F}/><path d="M3 18c2-1.2 3.5-1.2 5 0M16 18c2-1.2 3.5-1.2 5 0" ${S} stroke-width="2.4"/>`,
    palm: `<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11V4a1.5 1.5 0 0 1 3 0v7V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.7 7-6.5 7-2.4 0-4-1.2-5.3-3.4L3.4 13a1.6 1.6 0 0 1 2.7-1.6z" ${F}/><path d="M19 9h3M19.5 5.5 22 4M19.5 12.5 22 14" ${S} stroke-width="1.6"/>`,
    tornado: `<path d="M2.5 3.5h19l-2.4 3.6H4.9zM5.8 8.7h13.6l-2.5 3.4H8.3zM8.4 13.7h8.8l-2 3.2h-4.8zM10.4 18.5h4.6l-2 3.3z" ${F}/>`,
    cyclone: `<path d="M12.5 12.4c-.6-1.3 1.1-2.4 2.3-1.4 1.6 1.4.4 4.3-2 4.4-3.3.2-4.8-3.9-2.6-6.4 2.7-3.1 8.3-2 9.3 2.4M4 9.5c.2-3 2.3-5.3 5-6" ${S} stroke-width="2.8"/><path d="M3 15.5c1.5 3.4 5 5.6 9 5.4" ${S} stroke-width="2.8"/>`,
    fireball: `<circle cx="14" cy="10" r="5.5" ${F}/><path d="M9.5 13.5 3 20M10.5 16 6 21.5M8 11 2.5 15" ${S} stroke-width="2"/>`,
    dash: `<path d="M10.5 4 21 12l-10.5 8v-4.6H7V8.6h3.5z" ${F}/><path d="M2.5 8.6h2.2M2.5 15.4h2.2M1.8 12h3" ${S} stroke-width="2.4"/>`,
    burst: `<path d="m12 2 2.2 6 6.3-1.8-4.1 5 4.6 4.6-6.4-.6L12 22l-2.6-6.8-6.4.6 4.6-4.6-4.1-5L9.8 8z" ${F}/>`,
    whip: `<path d="M3 20.5c3-1 5-3.2 6-6.2s3-7 8.2-8.2" ${S} stroke-width="3.2"/><path d="M19.5 1.8c-1.6 2.2-2.6 3.6-2.6 5a2.6 2.6 0 0 0 5.2 0c0-1.4-1-2.8-2.6-5z" ${F}/>`,
    wave: `<path d="M2 21.5V17c3 0 4.5-2 5.6-5C9.2 7.6 11.8 4 16.5 4 19.8 4 22 6.2 22 9c0 2.6-2 4.4-4.3 4.4-2 0-3.4-1.4-3.4-3.2 0-1.2.7-2.2 1.8-2.6-3 .1-4.5 3-5.4 6C9.6 17.4 8.4 19.8 6.6 21.5z" ${F}/>`,
    shield: `<path d="M12 2.5 4 5.5v6.2c0 4.8 3.4 8.6 8 9.8 4.6-1.2 8-5 8-9.8V5.5z" ${F}/><path d="M12 5.4v13.4" stroke="rgba(0,0,0,.28)" stroke-width="2.2"/>`,
    fist: `<rect x="3.5" y="4.5" width="17" height="12.5" rx="3.5" ${F}/><path d="M8 4.5v5.5M12 4.5v5.5M16 4.5v5.5M3.5 12.5h6.5" stroke="rgba(0,0,0,.35)" stroke-width="1.8" fill="none"/><path d="M7 16.5v5h10v-5" ${F}/>`,
    boulder: `<path d="M6 7.5 11 4l6 1.5 3.5 5-1 6.5L14 21l-6.5-1L3.5 15l.5-5z" ${F}/><path d="M9 10l3 2 4-1M12 12l-1 5" stroke="rgba(0,0,0,.3)" stroke-width="1.5" fill="none"/>`,
    quake: `<path d="M2 15.5h20V21H2z" ${F}/><path d="M12.5 15.5 10.5 18l2.4 1-1.6 2" stroke="rgba(0,0,0,.45)" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M12 2.5v8.5M7.8 7.6 12 11.8l4.2-4.2" ${S} stroke-width="3"/>`,
    shards: `<path d="M2 16 17.5 7.8l-2.3 4.8zM3 21.6l17-5.3-3.3 3.8zM4 10.4 18.2 2l-2 4.3z" ${F}/>`,
    snow: ICON_PATHS.frost,
    lance: `<path d="M3 21 14.5 9.5" ${S} stroke-width="3.6"/><path d="M11.8 7.2 21.8 2.2l-5 10z" ${F}/>`,
    bolt: ICON_PATHS.lightning,
    blink: `<circle cx="6.3" cy="17.7" r="3.3" ${F} opacity=".45"/><circle cx="17.5" cy="6.5" r="4" ${F}/><path d="M9 15 13.8 10.2" ${S} stroke-width="2.8" stroke-dasharray="2.2 2.8"/>`,
    storm: `<path d="M6.5 12a4.5 4.5 0 0 1 .7-8.9A6 6 0 0 1 18 5a3.5 3.5 0 0 1 0 7z" ${F}/><path d="M10 13.5 8 18h3l-1.5 4.5M16 13.5 14.5 17h2.5L16 20" ${S} stroke-width="2"/>`,
    vine: `<path d="M4 21.5c0-6 4-8 8-9s7-4 7-9.5" ${S} stroke-width="3"/><path d="M8.6 15.4c-3 .2-5-1.4-5.4-4 3-.2 5 1.4 5.4 4zM15.2 8.6c-.3-3 1.2-5 3.8-5.6.3 3-1.2 5-3.8 5.6z" ${F}/>`,
    snare: `<path d="M3 20h18" ${S}/><path d="M5 20l1.5-7L8 20M10 20l2-10 2 10M16 20l1.5-7 1.5 7" ${F}/><circle cx="12" cy="6" r="2.5" ${F}/>`,
    heal: `<path d="M12 21c-5-3-8-6.5-8-10.5A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 8 2.5c0 4-3 7.5-8 10.5z" ${F}/><path d="M12 11v6M9 14h6" stroke="rgba(0,0,0,.35)" stroke-width="2.2" stroke-linecap="round"/>`,
    orb: `<circle cx="12" cy="12" r="6" ${F}/><path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5M12 21.5A9.5 9.5 0 0 1 2.5 12" ${S} stroke-width="2.6"/>`,
    rift: `<path d="M12.2 12.4c-.7-1.2.6-2.6 2-1.8 1.8 1-.1 4.4-2.8 4-3.4-.5-3.7-5.3-.8-7 3.7-2.2 8.6.4 8.4 4.8-.3 5.5-6.6 8.4-11.3 5.6" ${S} stroke-width="3"/>`,
    blade: `<path d="M21.5 2.5 22 4 11.6 16.4 7.6 12.4 20 2z" ${F}/><path d="M5.6 11.6l6.8 6.8" ${S} stroke-width="3"/><path d="M8.4 16.4 3 21.8" ${S} stroke-width="3.6"/>`,
    sunblade: `<path d="M21.5 2.5 22 4 11.6 16.4 7.6 12.4 20 2z" ${F}/><path d="M5.6 11.6l6.8 6.8" ${S} stroke-width="3"/><path d="M8.4 16.4 3 21.8" ${S} stroke-width="3.6"/><circle cx="6" cy="6" r="2.1" ${F}/><path d="M6 1.4v1.2M6 9.4v1.2M1.4 6h1.2M9.4 6h1.2M2.8 2.8l.8.8M8.4 8.4l.8.8M2.8 9.2l.8-.8M8.4 3.6l.8-.8" ${S} stroke-width="1.5"/>`,
    shadowstep: `<path d="M15 3a8.5 8.5 0 1 0 6.5 14A7 7 0 0 1 15 3z" ${F}/><path d="M1.8 8.5h5M1 12.5h5.5M2.2 16.5h4" ${S} stroke-width="2.4"/>`,
    beam: `<circle cx="5.5" cy="12" r="3.6" ${F}/><path d="M9 8.5h13v7H9z" ${F} opacity=".55"/><path d="M9 12h13" ${S} stroke-width="3"/>`,
    sun: ICON_PATHS.light,
    saw: `<path d="M12 2l2 3 3.5-1 .5 3.6 3.4 1.3-1.8 3.1 1.8 3.1-3.4 1.3-.5 3.6-3.5-1-2 3-2-3-3.5 1-.5-3.6L2.6 15l1.8-3.1L2.6 8.9 6 7.6l.5-3.6L10 5z" ${F}/><circle cx="12" cy="12" r="3" fill="rgba(0,0,0,.35)"/>`,
    spit: `<path d="M5 19c3-1 5-4 6-8" ${S}/><path d="M15 4c-2 3-3.5 5-3.5 7a3.5 3.5 0 0 0 7 0c0-2-1.5-4-3.5-7z" ${F}/>`,
    cloud: `<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5 4.75 4.75 0 0 1 17.5 18z" ${F}/><circle cx="10" cy="14" r="1.3" fill="rgba(0,0,0,.35)"/><circle cx="14" cy="13" r="1" fill="rgba(0,0,0,.35)"/>`,
    meteor: `<circle cx="15" cy="15" r="5" ${F}/><path d="M11 11 4 4M13 9.5 8 3M9.5 13 3 8" ${S}/>`,
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
