'use strict';
/* =========================================================================
   UI icons (24x24, stroke/fill with currentColor). Any element carrying
   data-icon="name" is filled in by Icons.hydrate().
   ========================================================================= */

const Icons = (() => {
  const S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const P = {
    heart: '<path d="M12 20.5S3.5 15 3.5 9A4.5 4.5 0 0 1 12 6.6 4.5 4.5 0 0 1 20.5 9c0 6-8.5 11.5-8.5 11.5z" fill="currentColor"/>',
    bolt: '<path d="M13.2 2.5 5 13.2h5.6L9.8 21.5l8.2-10.7h-5.6z" fill="currentColor"/>',
    gem: '<path d="M6.5 3.5h11l4 5.2L12 21 2.5 8.7z" fill="currentColor"/><path d="M2.5 8.7h19M9 3.5 7.8 8.7 12 21l4.2-12.3L15 3.5" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.3"/>',
    star: '<path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="currentColor"/>',
    pause: `<path d="M8.5 5v14M15.5 5v14" ${S} stroke-width="3"/>`,
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
    back: `<path d="M15 5l-7 7 7 7" ${S} stroke-width="2.6"/>`,
    gear: `<circle cx="12" cy="12" r="3.2" ${S}/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" ${S}/><circle cx="12" cy="12" r="6.4" ${S}/>`,
    infinity: `<path d="M12 12c-2-2.6-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1.4 5.5-4zm0 0c2 2.6 3.5 4 5.5 4a4 4 0 0 0 0-8c-2 0-3.5 1.4-5.5 4z" ${S}/>`,
    book: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" ${S}/>`,
    sword: `<path d="M19.5 3.5 10 13M19.5 3.5v4l-8 8M19.5 3.5h-4l-8 8M6.5 13.5l4 4M4 20l3.5-3.5" ${S}/>`,
    shield: '<path d="M12 2.8 4.5 5.6v6c0 4.6 3.2 8.4 7.5 9.6 4.3-1.2 7.5-5 7.5-9.6v-6z" fill="currentColor"/>',
    eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" ${S}/><circle cx="12" cy="12" r="3" fill="currentColor"/>`,
    swirl: `<path d="M12 12m-1.5 0a1.5 1.5 0 1 1 3 0a3 3 0 1 1-6 0a4.6 4.6 0 1 1 9.2 0a6.3 6.3 0 1 1-12.6 0" ${S}/>`,
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    crown: '<path d="M3 18.5h18l1-11-5.5 4.2L12 4.5l-4.5 7.2L2 7.5z" fill="currentColor"/>',
    skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.2 3 5.3V20h10v-3.7c1.7-1.1 3-2.7 3-5.3a8 8 0 0 0-8-8z" fill="currentColor"/><circle cx="8.8" cy="11.5" r="2" fill="#1a1424"/><circle cx="15.2" cy="11.5" r="2" fill="#1a1424"/>',
    up: `<path d="M12 19V6M6 11.5 12 5.5l6 6" ${S} stroke-width="2.8"/>`,
    restart: `<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4v4.5H9" ${S}/>`,
    home: `<path d="M3.5 11 12 3.8l8.5 7.2M6 9.5V20h12V9.5" ${S}/>`,
    map: `<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20" ${S}/>`,
    next: `<path d="M5 12h13M13 6l6 6-6 6" ${S} stroke-width="2.6"/>`,
    sound: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" ${S}/>`,
    music: '<path d="M9 17.5V5.5l11-2v12" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="6.5" cy="17.5" r="2.8" fill="currentColor"/><circle cx="17.5" cy="15.5" r="2.8" fill="currentColor"/>',
    shake: `<path d="M7 5.5h10v13H7zM3.5 8v8M20.5 8v8" ${S}/>`,
    aim: `<circle cx="12" cy="12" r="7.5" ${S}/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" ${S}/>`,
    rotate: `<rect x="7" y="2.5" width="10" height="19" rx="2.5" ${S}/><path d="M2.5 15a9.5 9.5 0 0 0 6 6.5M21.5 9a9.5 9.5 0 0 0-6-6.5" ${S}/>`,
    close: `<path d="M6 6l12 12M18 6 6 18" ${S} stroke-width="2.6"/>`,
    check: `<path d="M5 12.5l4.5 4.5L19 7" ${S} stroke-width="2.8"/>`,
  };
  function svg(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
  }
  function hydrate(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
      if (el.dataset.hydrated === el.dataset.icon) return;
      el.innerHTML = svg(el.dataset.icon);
      el.dataset.hydrated = el.dataset.icon;
    });
  }
  return { svg, hydrate };
})();
