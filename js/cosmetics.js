'use strict';
/* =========================================================================
   Cosmetics and items (the Shop)
   - COLOURS: the hero's body colour (shade is derived)
   - HATS:    accessories worn on the head, drawn on the ragdoll in play
   - ITEMS:   one-run boosts, bought with gems and armed for the next run
   Event exclusives (`event: 'winterfest'`) can't be bought with gems: they are
   earned in that event (chapter milestones, or its token shop).
   ========================================================================= */

const COLOURS = [
  { id: 'snow', name: 'Snow', body: '#f4f4f4', price: 0 },
  { id: 'ash', name: 'Ash', body: '#9aa1ad', price: 120 },
  { id: 'sky', name: 'Sky', body: '#9fd4ff', price: 150 },
  { id: 'mint', name: 'Mint', body: '#a8f0cf', price: 150 },
  { id: 'peach', name: 'Peach', body: '#ffc6a3', price: 150 },
  { id: 'rose', name: 'Rose', body: '#ffa8c8', price: 180 },
  { id: 'lilac', name: 'Lilac', body: '#c9b2ff', price: 180 },
  { id: 'sun', name: 'Sunflower', body: '#ffe27a', price: 200 },
  { id: 'jade', name: 'Jade', body: '#5fcf97', price: 240 },
  { id: 'cobalt', name: 'Cobalt', body: '#5b8cff', price: 260 },
  { id: 'ember', name: 'Ember', body: '#ff7a59', price: 260 },
  { id: 'onyx', name: 'Onyx', body: '#3b3f4a', price: 320 },
  // Winterfest exclusives (event token shop)
  { id: 'holly', name: 'Holly Red', body: '#e2394b', event: 'winterfest', tokens: 160 },
  { id: 'evergreen', name: 'Evergreen', body: '#2f9e62', event: 'winterfest', tokens: 160 },
  { id: 'gingerbread', name: 'Gingerbread', body: '#c47a43', event: 'winterfest', tokens: 200 },
  { id: 'frostbite', name: 'Frostbite', body: '#bff0ff', event: 'winterfest', tokens: 220, glow: '#7fe0ff' },
];

const HATS = [
  { id: 'party', name: 'Party Hat', price: 140 },
  { id: 'cat', name: 'Cat Ears', price: 160 },
  { id: 'headphones', name: 'Headphones', price: 200 },
  { id: 'cowboy', name: 'Ranger Hat', price: 240 },
  { id: 'viking', name: 'Horned Helm', price: 300 },
  { id: 'wizard', name: 'Star Hat', price: 340 },
  { id: 'crown', name: 'Crown', price: 450 },
  { id: 'halo', name: 'Halo', price: 520 },
  // Winterfest exclusives: milestones in the event chapter, plus one in the token shop
  { id: 'elf', name: 'Elf Cap', event: 'winterfest', how: 'Clear Winterfest stage 5' },
  { id: 'antlers', name: 'Reindeer Antlers', event: 'winterfest', how: 'Clear Winterfest stage 10' },
  { id: 'tophat', name: 'Frosty Top Hat', event: 'winterfest', how: 'Clear Winterfest stage 15' },
  { id: 'santa', name: 'Festive Hat', event: 'winterfest', how: 'Clear Winterfest stage 20' },
  { id: 'beanie', name: 'Pom Beanie', event: 'winterfest', tokens: 240 },
];

// one-run boosts: arm up to two, they are used up when the next stage, Endless run or
// event stage starts (never in the Arena, where fights are even)
const ITEMS = [
  { id: 'tonic', name: 'Health Tonic', desc: '+30% max health for one run', price: 60, icon: 'heart', color: '#ff6b81' },
  { id: 'charm', name: 'Power Charm', desc: '+20% damage for one run', price: 80, icon: 'burst', color: '#ffb347' },
  { id: 'clover', name: 'Lucky Clover', desc: '+50% gems from one run', price: 70, icon: 'gem', color: '#7ee081' },
  { id: 'boots', name: 'Swift Boots', desc: '+15% speed and jump for one run', price: 60, icon: 'wing', color: '#59d0ff' },
  { id: 'feather', name: 'Guardian Feather', desc: 'Once, when you would be knocked out or fall, you come back at half health', price: 120, icon: 'heal', color: '#e8dcff' },
];
const ITEM_ARM_MAX = 2;

const COLOUR_BY_ID = Object.fromEntries(COLOURS.map(c => [c.id, c]));
const HAT_BY_ID = Object.fromEntries(HATS.map(h => [h.id, h]));
const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

const Cosmetics = (() => {
  const st = () => Save.data.cos;
  const inv = () => Save.data.items;

  /* --------------------------------------------------------- ownership */
  const ownsColour = id => id === 'snow' || st().colours.includes(id);
  const ownsHat = id => st().hats.includes(id);
  function grant(kind, id) {
    const list = kind === 'hat' ? st().hats : st().colours;
    if (list.includes(id)) return false;
    list.push(id); Save.save(); return true;
  }
  function buy(kind, id) {
    const def = kind === 'hat' ? HAT_BY_ID[id] : COLOUR_BY_ID[id];
    if (!def || def.event || (kind === 'hat' ? ownsHat(id) : ownsColour(id)) || Save.data.essence < def.price) return false;
    Save.data.essence -= def.price;
    return grant(kind, id);
  }
  function equip(kind, id) {
    if (kind === 'hat') { if (id && !ownsHat(id)) return false; st().hat = id || null; }
    else { if (!ownsColour(id)) return false; st().colour = id; }
    Save.save(); return true;
  }
  const colour = () => COLOUR_BY_ID[st().colour] || COLOURS[0];
  const hat = () => (st().hat && ownsHat(st().hat) ? st().hat : null);
  const shadeOf = body => mixHex(body, '#000000', 0.2);

  /* ------------------------------------------------------------- items */
  const count = id => inv().n[id] || 0;
  function buyItem(id) {
    const it = ITEM_BY_ID[id];
    if (!it || Save.data.essence < it.price) return false;
    Save.data.essence -= it.price; inv().n[id] = count(id) + 1; Save.save(); return true;
  }
  const armed = () => inv().armed.filter(id => count(id) > 0);
  function toggleArm(id) {
    const a = inv().armed;
    if (a.includes(id)) { inv().armed = a.filter(x => x !== id); Save.save(); return true; }
    if (count(id) <= 0 || armed().length >= ITEM_ARM_MAX) return false;
    a.push(id); Save.save(); return true;
  }
  // called when a run starts: spends the armed items and returns their effects
  function consume() {
    const used = armed();
    for (const id of used) inv().n[id] = count(id) - 1;
    inv().armed = inv().armed.filter(id => count(id) > 0);
    if (used.length) Save.save();
    return used;
  }

  /* ------------------------------------------------------------ hats */
  // draws a hat on a head centred at (x, y) of radius hr, facing f (1 right, -1 left)
  function drawHat(ctx, id, x, y, hr, f, time, s = 1) {
    if (!id) return;
    const top = y - hr * 1.05;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (id) {
      case 'santa': case 'elf': {
        const red = id === 'santa', main = red ? '#d8283b' : '#2fa35a', dark = red ? '#a51627' : '#1f7a40';
        const sway = Math.sin(time * 3) * 2 * s;
        const tipX = x - f * hr * (red ? 1.35 : 0.5) + sway, tipY = top - hr * (red ? 0.9 : 1.85);
        ctx.fillStyle = main;
        ctx.beginPath(); ctx.moveTo(x - hr * 1.02, top + hr * 0.42);
        ctx.quadraticCurveTo(x - f * hr * 0.2, top - hr * 1.3, tipX, tipY);
        ctx.quadraticCurveTo(x + f * hr * 0.4, top - hr * 0.2, x + hr * 1.02, top + hr * 0.42); ctx.closePath(); ctx.fill();
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.moveTo(x + f * hr * 0.25, top - hr * 0.35); ctx.quadraticCurveTo(x + f * hr * 0.5, top - hr * 0.05, x + hr * 1.02 * f, top + hr * 0.42); ctx.lineTo(x + f * hr * 0.2, top + hr * 0.42); ctx.closePath(); ctx.fill();
        if (red) {   // fluffy brim and pom-pom
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.roundRect(x - hr * 1.18, top + hr * 0.2, hr * 2.36, hr * 0.5, hr * 0.25); ctx.fill();
          ctx.beginPath(); ctx.arc(tipX, tipY, hr * 0.32, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(200,215,230,0.7)';
          for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - hr + i * hr * 0.66, top + hr * 0.6, hr * 0.12, 0, TAU); ctx.fill(); }
        } else {     // striped band and a jingle bell
          ctx.fillStyle = '#d8283b'; ctx.fillRect(x - hr * 1.05, top + hr * 0.18, hr * 2.1, hr * 0.32);
          ctx.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) ctx.fillRect(x - hr * 1.05 + i * hr * 0.46, top + hr * 0.18, hr * 0.2, hr * 0.32);
          ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(tipX, tipY, hr * 0.24, 0, TAU); ctx.fill();
          ctx.fillStyle = '#b8860b'; ctx.fillRect(tipX - hr * 0.05, tipY, hr * 0.1, hr * 0.14);
        }
        break;
      }
      case 'beanie': {
        ctx.fillStyle = '#e2394b';
        ctx.beginPath(); ctx.moveTo(x - hr * 1.06, top + hr * 0.5); ctx.bezierCurveTo(x - hr * 1.1, top - hr * 0.9, x + hr * 1.1, top - hr * 0.9, x + hr * 1.06, top + hr * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (const yy of [-0.25, 0.1]) ctx.fillRect(x - hr * 1.0, top + hr * yy, hr * 2, hr * 0.16);
        ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.roundRect(x - hr * 1.12, top + hr * 0.32, hr * 2.24, hr * 0.42, hr * 0.12); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, top - hr * 0.62, hr * 0.34, 0, TAU); ctx.fill();
        break;
      }
      case 'antlers': {
        ctx.strokeStyle = '#8a5a33'; ctx.lineWidth = 3.2 * s;
        for (const side of [-1, 1]) {
          const bx = x + side * hr * 0.55, by = top + hr * 0.25;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + side * hr * 0.3, by - hr * 1.1, bx + side * hr * 0.9, by - hr * 1.6); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(bx + side * hr * 0.18, by - hr * 0.6); ctx.lineTo(bx + side * hr * 0.75, by - hr * 0.85); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(bx + side * hr * 0.5, by - hr * 1.2); ctx.lineTo(bx + side * hr * 0.35, by - hr * 1.7); ctx.stroke();
        }
        ctx.fillStyle = '#ff3b4e'; ctx.beginPath(); ctx.arc(x + f * hr * 1.0, y + hr * 0.1, hr * 0.26, 0, TAU); ctx.fill();   // red nose
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x + f * hr * 0.95, y, hr * 0.08, 0, TAU); ctx.fill();
        break;
      }
      case 'tophat': {
        ctx.fillStyle = '#1d1f27';
        ctx.beginPath(); ctx.roundRect(x - hr * 1.35, top + hr * 0.2, hr * 2.7, hr * 0.32, hr * 0.12); ctx.fill();
        ctx.beginPath(); ctx.roundRect(x - hr * 0.8, top - hr * 1.15, hr * 1.6, hr * 1.45, [hr * 0.15, hr * 0.15, 0, 0]); ctx.fill();
        ctx.fillStyle = '#c62f3f'; ctx.fillRect(x - hr * 0.8, top - hr * 0.05, hr * 1.6, hr * 0.26);
        ctx.fillStyle = '#ffffff';   // snow on the brim and crown
        ctx.beginPath(); ctx.ellipse(x - hr * 0.2, top + hr * 0.2, hr * 0.9, hr * 0.12, 0, Math.PI, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, top - hr * 1.15, hr * 0.78, hr * 0.13, 0, Math.PI, TAU); ctx.fill();
        // holly sprig
        const hx = x + f * hr * 0.45, hy = top - hr * 0.02;
        ctx.fillStyle = '#2e9e57';
        for (const a of [-0.6, 0.5]) { ctx.save(); ctx.translate(hx, hy); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(hr * 0.32, 0, hr * 0.36, hr * 0.15, 0, 0, TAU); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = '#ff2f45';
        for (const [dx, dy] of [[0, 0], [hr * 0.16, -hr * 0.12], [-hr * 0.1, -hr * 0.16]]) { ctx.beginPath(); ctx.arc(hx + dx, hy + dy, hr * 0.11, 0, TAU); ctx.fill(); }
        break;
      }
      case 'party': {
        ctx.fillStyle = '#ff5c8a';
        ctx.beginPath(); ctx.moveTo(x - hr * 0.7, top + hr * 0.35); ctx.lineTo(x + f * hr * 0.2, top - hr * 1.6); ctx.lineTo(x + hr * 0.7, top + hr * 0.35); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = hr * 0.22;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - hr, top - hr * 0.2 - i * hr * 0.5); ctx.lineTo(x + hr, top + hr * 0.4 - i * hr * 0.5); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.arc(x + f * hr * 0.2, top - hr * 1.6, hr * 0.24, 0, TAU); ctx.fill();
        break;
      }
      case 'cat': {
        for (const side of [-1, 1]) {
          const bx = x + side * hr * 0.6;
          ctx.fillStyle = '#3b3f4a';
          ctx.beginPath(); ctx.moveTo(bx - hr * 0.42, top + hr * 0.45); ctx.lineTo(bx + side * hr * 0.12, top - hr * 0.75); ctx.lineTo(bx + hr * 0.42, top + hr * 0.45); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffa8c8';
          ctx.beginPath(); ctx.moveTo(bx - hr * 0.2, top + hr * 0.3); ctx.lineTo(bx + side * hr * 0.08, top - hr * 0.35); ctx.lineTo(bx + hr * 0.2, top + hr * 0.3); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'headphones': {
        ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = 4 * s;
        ctx.beginPath(); ctx.arc(x, y - hr * 0.1, hr * 1.12, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#2b2f3a'; ctx.beginPath(); ctx.roundRect(x + side * hr * 1.0 - hr * 0.3, y - hr * 0.35, hr * 0.6, hr * 0.85, hr * 0.22); ctx.fill();
          ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.roundRect(x + side * hr * 1.05 - hr * 0.14, y - hr * 0.2, hr * 0.28, hr * 0.55, hr * 0.12); ctx.fill();
        }
        break;
      }
      case 'cowboy': {
        ctx.fillStyle = '#8a5a33';
        ctx.beginPath(); ctx.ellipse(x, top + hr * 0.35, hr * 1.7, hr * 0.32, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - hr * 0.85, top + hr * 0.35); ctx.bezierCurveTo(x - hr * 0.9, top - hr * 0.9, x + hr * 0.9, top - hr * 0.9, x + hr * 0.85, top + hr * 0.35); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5c3b22'; ctx.fillRect(x - hr * 0.86, top + hr * 0.05, hr * 1.72, hr * 0.22);
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.moveTo(x - hr * 0.1, top - hr * 0.55); ctx.quadraticCurveTo(x, top - hr * 0.2, x + hr * 0.1, top - hr * 0.55); ctx.fill();
        break;
      }
      case 'viking': {
        ctx.fillStyle = '#f2ead8';
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(x + side * hr * 0.8, top + hr * 0.45); ctx.quadraticCurveTo(x + side * hr * 1.9, top + hr * 0.1, x + side * hr * 1.7, top - hr * 1.0); ctx.quadraticCurveTo(x + side * hr * 1.35, top, x + side * hr * 0.75, top + hr * 0.1); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#8f98a6';
        ctx.beginPath(); ctx.moveTo(x - hr * 1.08, top + hr * 0.55); ctx.bezierCurveTo(x - hr * 1.08, top - hr * 0.8, x + hr * 1.08, top - hr * 0.8, x + hr * 1.08, top + hr * 0.55); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b8a05a'; ctx.fillRect(x - hr * 1.1, top + hr * 0.3, hr * 2.2, hr * 0.28); ctx.fillRect(x - hr * 0.12, top - hr * 0.42, hr * 0.24, hr * 0.8);
        break;
      }
      case 'wizard': {
        ctx.fillStyle = '#5b3fc4';
        ctx.beginPath(); ctx.ellipse(x, top + hr * 0.38, hr * 1.55, hr * 0.28, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - hr * 0.85, top + hr * 0.38); ctx.quadraticCurveTo(x - hr * 0.2, top - hr * 1.0, x - f * hr * 0.7, top - hr * 2.0); ctx.quadraticCurveTo(x + hr * 0.3, top - hr * 0.6, x + hr * 0.85, top + hr * 0.38); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe27a';
        const star = (sx, sy, r) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); };
        star(x + hr * 0.1, top - hr * 0.35, hr * 0.28); star(x - hr * 0.35, top - hr * 1.0, hr * 0.18);
        break;
      }
      case 'crown': {
        ctx.fillStyle = '#ffcf4a';
        ctx.beginPath(); ctx.moveTo(x - hr * 0.95, top + hr * 0.4); ctx.lineTo(x - hr * 0.95, top - hr * 0.45); ctx.lineTo(x - hr * 0.48, top - hr * 0.05); ctx.lineTo(x, top - hr * 0.7); ctx.lineTo(x + hr * 0.48, top - hr * 0.05); ctx.lineTo(x + hr * 0.95, top - hr * 0.45); ctx.lineTo(x + hr * 0.95, top + hr * 0.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e0a420'; ctx.fillRect(x - hr * 0.95, top + hr * 0.15, hr * 1.9, hr * 0.25);
        for (const [gx, col] of [[-0.5, '#ff4f6d'], [0, '#5bd1ff'], [0.5, '#7ee081']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + gx * hr, top + hr * 0.27, hr * 0.12, 0, TAU); ctx.fill(); }
        break;
      }
      case 'halo': {
        const hy = top - hr * 0.55 + Math.sin(time * 2.5) * 1.5 * s;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, hy, 0, x, hy, hr * 1.6);
        g.addColorStop(0, 'rgba(255,230,140,0.35)'); g.addColorStop(1, 'rgba(255,230,140,0)');
        ctx.fillStyle = g; ctx.fillRect(x - hr * 1.6, hy - hr * 1.6, hr * 3.2, hr * 3.2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#ffe48a'; ctx.lineWidth = 3 * s;
        ctx.beginPath(); ctx.ellipse(x, hy, hr * 0.95, hr * 0.28, 0, 0, TAU); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------- mannequin */
  // the hero in a relaxed stance, for the shop previews (same look as in play)
  function drawMannequin(ctx, cx, cy, sc, colourId, hatId, time, accent = '#bdf3e4') {
    const body = (COLOUR_BY_ID[colourId] || COLOURS[0]).body, shade = shadeOf(body);
    const bob = Math.sin(time * 2.2) * 1.5;
    const p = (x, y) => [cx + x * sc, cy + (y + bob * (y < 0 ? 1 : 0)) * sc];
    const seg = (a, b, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w * sc; ctx.beginPath(); ctx.moveTo(...p(...a)); ctx.lineTo(...p(...b)); ctx.stroke(); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const glow = (COLOUR_BY_ID[colourId] || {}).glow;
    if (glow) { const g = ctx.createRadialGradient(cx, cy - 40 * sc, 0, cx, cy - 40 * sc, 80 * sc); g.addColorStop(0, glow + '55'); g.addColorStop(1, glow + '00'); ctx.fillStyle = g; ctx.fillRect(cx - 80 * sc, cy - 120 * sc, 160 * sc, 160 * sc); }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + 2 * sc, 30 * sc, 6 * sc, 0, 0, TAU); ctx.fill();
    // back limbs
    seg([-4, -48], [-10, -22], 13, shade); seg([-10, -22], [-12, 0], 11, shade);
    seg([-2, -78], [-16, -60], 11, shade); seg([-16, -60], [-20, -42], 9.5, shade);
    ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(...p(-20, -42), 5.3 * sc, 0, TAU); ctx.fill();
    // torso, front leg
    seg([0, -80], [-2, -48], 22, body);
    seg([-2, -48], [8, -23], 13.5, body); seg([8, -23], [12, 0], 11.5, body);
    // head + band
    const [hx, hy] = p(2, -100), hr = 13 * sc;
    ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(hx - hr, hy - hr * 1.05, hr * 2, hr * 2.1, hr * 0.8); ctx.fill();
    ctx.fillStyle = accent; ctx.fillRect(hx - hr, hy - hr * 0.55, hr * 2, 5 * sc);
    ctx.strokeStyle = accent; ctx.lineWidth = 3.5 * sc;
    const wave = Math.sin(time * 6) * 3 * sc;
    ctx.beginPath(); ctx.moveTo(hx - hr, hy - hr * 0.45); ctx.quadraticCurveTo(hx - hr - 10 * sc, hy - hr * 0.5 + wave, hx - hr - 18 * sc, hy - hr * 0.1 + wave); ctx.stroke();
    drawHat(ctx, hatId, hx, hy, hr, 1, time, sc);
    // front arm with cuff
    seg([2, -78], [16, -58], 11, body); seg([16, -58], [22, -40], 9.5, body);
    ctx.strokeStyle = accent; ctx.lineWidth = 11.5 * sc; ctx.beginPath(); ctx.moveTo(...p(19, -50)); ctx.lineTo(...p(21.5, -43)); ctx.stroke();
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(...p(22, -40), 5.8 * sc, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // a canvas element that keeps animating its mannequin while it's on the page
  function liveMannequin(cv, get) {
    const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const t0 = performance.now();
    const tick = now => {
      if (!cv.isConnected) return;
      const o = get();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      drawMannequin(ctx, w / 2, h * 0.9, Math.min(w / 110, h / 150), o.colour, o.hat, (now - t0) / 1000, o.accent);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  return {
    ownsColour, ownsHat, grant, buy, equip, colour, hat, shadeOf,
    count, buyItem, armed, toggleArm, consume,
    drawHat, drawMannequin, liveMannequin,
  };
})();
