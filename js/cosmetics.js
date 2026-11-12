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
  // The head is a rounded block: (x - hr .. x + hr) wide, its top at y - 1.05 hr, corner radius 0.8 hr.
  // capPath traces that outline from one side, over the top, to the other, `out` px outside it,
  // down to `depth` below the top, so hats sit ON the head instead of hovering over it.
  function capPath(ctx, x, top, hr, depth, out = 0, lift = 0) {
    const r = hr * 0.8 + out, L = x - hr - out, R = x + hr + out, T = top - out - lift;
    ctx.beginPath();
    ctx.moveTo(L, top + depth);
    ctx.lineTo(L, T + r);
    ctx.quadraticCurveTo(L, T, L + r, T);
    ctx.lineTo(R - r, T);
    ctx.quadraticCurveTo(R, T, R, T + r);
    ctx.lineTo(R, top + depth);
    ctx.quadraticCurveTo(x, top + depth + hr * 0.12, L, top + depth);   // the rim follows the brow, a touch lower in the middle
    ctx.closePath();
  }
  function headband(ctx, x, top, hr, depth, out, w, col) {
    const r = hr * 0.8 + out, L = x - hr - out, R = x + hr + out, T = top - out;
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(L, top + depth); ctx.lineTo(L, T + r); ctx.quadraticCurveTo(L, T, L + r, T); ctx.lineTo(R - r, T); ctx.quadraticCurveTo(R, T, R, T + r); ctx.lineTo(R, top + depth); ctx.stroke();
  }
  const shade = (ctx, x, y0, y1, a, b) => { const g = ctx.createLinearGradient(x, y0, x, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  function fluff(ctx, cx, cy, r) {   // a soft round pom-pom
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.75, '#f1f4f8'); g.addColorStop(1, '#d5dde8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  }

  // draws a hat on a head centred at (x, y) of radius hr, facing f (1 right, -1 left)
  function drawHat(ctx, id, x, y, hr, f, time, s = 1) {
    if (!id) return;
    const top = y - hr * 1.05;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (id) {
      case 'santa': {
        // one smooth cap: rises over the crown and drapes down the back to a pom-pom, fur brim on the brow
        const b = -f, sway = Math.sin(time * 2.6) * 1.2 * s;
        const tipX = x + b * hr * 1.22 + sway, tipY = top + hr * 0.28;
        ctx.fillStyle = shade(ctx, x, top - hr * 0.9, top + hr * 0.5, '#ec4457', '#b51c31');
        ctx.beginPath();
        ctx.moveTo(x - b * hr * 1.04, top + hr * 0.4);
        ctx.bezierCurveTo(x - b * hr * 1.08, top - hr * 0.45, x - b * hr * 0.35, top - hr * 0.88, x + b * hr * 0.3, top - hr * 0.78);
        ctx.bezierCurveTo(x + b * hr * 0.85, top - hr * 0.7, x + b * hr * 1.2, top - hr * 0.3, tipX, tipY);
        ctx.quadraticCurveTo(x + b * hr * 1.0, top + hr * 0.12, x + b * hr * 1.04, top + hr * 0.4);
        ctx.closePath(); ctx.fill();
        // soft highlight along the crown
        ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = hr * 0.1;
        ctx.beginPath(); ctx.moveTo(x - b * hr * 0.75, top - hr * 0.2); ctx.quadraticCurveTo(x - b * hr * 0.2, top - hr * 0.7, x + b * hr * 0.45, top - hr * 0.62); ctx.stroke();
        // fur brim wrapping the brow
        ctx.fillStyle = shade(ctx, x, top + hr * 0.22, top + hr * 0.66, '#ffffff', '#d9e0ea');
        ctx.beginPath(); ctx.roundRect(x - hr * 1.1, top + hr * 0.24, hr * 2.2, hr * 0.42, hr * 0.21); ctx.fill();
        fluff(ctx, tipX, tipY + hr * 0.04, hr * 0.24);
        break;
      }
      case 'beanie': {
        // a smooth knitted dome, faint knit ribs, a ribbed cuff and a pom-pom
        const dome = () => { ctx.beginPath(); ctx.moveTo(x - hr * 1.06, top + hr * 0.42); ctx.bezierCurveTo(x - hr * 1.1, top - hr * 0.78, x + hr * 1.1, top - hr * 0.78, x + hr * 1.06, top + hr * 0.42); ctx.closePath(); };
        dome(); ctx.fillStyle = shade(ctx, x, top - hr * 0.5, top + hr * 0.5, '#ea4a5c', '#bd2236'); ctx.fill();
        ctx.save(); dome(); ctx.clip();
        ctx.strokeStyle = 'rgba(0,0,0,0.09)'; ctx.lineWidth = Math.max(1, hr * 0.06);
        for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * hr * 0.3, top + hr * 0.42); ctx.quadraticCurveTo(x + k * hr * 0.22, top - hr * 0.1, x + k * hr * 0.06, top - hr * 0.5); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(x - hr * 0.35, top - hr * 0.2, hr * 0.32, hr * 0.14, -0.4, 0, TAU); ctx.fill();
        ctx.restore();
        // ribbed cuff
        ctx.fillStyle = shade(ctx, x, top + hr * 0.26, top + hr * 0.66, '#f7f7f9', '#d6dce5');
        ctx.beginPath(); ctx.roundRect(x - hr * 1.08, top + hr * 0.28, hr * 2.16, hr * 0.38, hr * 0.17); ctx.fill();
        ctx.strokeStyle = 'rgba(150,160,180,0.3)'; ctx.lineWidth = Math.max(1, s * 0.6);
        for (let k = -3; k <= 3; k++) { const cx = x + k * hr * 0.28; ctx.beginPath(); ctx.moveTo(cx, top + hr * 0.35); ctx.lineTo(cx, top + hr * 0.59); ctx.stroke(); }
        fluff(ctx, x, top - hr * 0.56, hr * 0.22);
        break;
      }
      case 'elf': {
        // a green cap that hugs the head and rises into a curled point with a bell
        const sway = Math.sin(time * 3) * 1.4 * s;
        const tipX = x - f * hr * 0.95 + sway, tipY = top - hr * 1.5;
        ctx.fillStyle = shade(ctx, x, tipY, top + hr * 0.5, '#3fbf6e', '#228a49');
        ctx.beginPath();
        ctx.moveTo(x - hr * 1.04, top + hr * 0.4);
        ctx.bezierCurveTo(x - hr * 1.0, top - hr * 0.35, x - f * hr * 0.2, top - hr * 0.9, tipX, tipY);
        ctx.bezierCurveTo(x + f * hr * 0.35, top - hr * 0.8, x + hr * 1.0, top - hr * 0.35, x + hr * 1.04, top + hr * 0.4);
        ctx.closePath(); ctx.fill();
        // striped cuff
        ctx.save(); ctx.beginPath(); ctx.roundRect(x - hr * 1.1, top + hr * 0.18, hr * 2.2, hr * 0.42, hr * 0.14); ctx.clip();
        ctx.fillStyle = '#d8283b'; ctx.fillRect(x - hr * 1.1, top + hr * 0.18, hr * 2.2, hr * 0.42);
        ctx.fillStyle = '#ffffff'; for (let k = 0; k < 7; k++) { const sx = x - hr * 1.1 + k * hr * 0.36; ctx.beginPath(); ctx.moveTo(sx, top + hr * 0.6); ctx.lineTo(sx + hr * 0.14, top + hr * 0.18); ctx.lineTo(sx + hr * 0.28, top + hr * 0.18); ctx.lineTo(sx + hr * 0.14, top + hr * 0.6); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        const bg = ctx.createRadialGradient(tipX - hr * 0.08, tipY - hr * 0.08, 1, tipX, tipY, hr * 0.24);
        bg.addColorStop(0, '#fff3b0'); bg.addColorStop(1, '#e0a420');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(tipX, tipY, hr * 0.22, 0, TAU); ctx.fill();
        break;
      }
      case 'antlers': {
        // a slim headband over the crown with two branched antlers, and a red nose
        ctx.strokeStyle = '#8a5a33'; ctx.lineWidth = hr * 0.2;
        for (const side of [-1, 1]) {
          const bx = x + side * hr * 0.62, by = top + hr * 0.02;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + side * hr * 0.1, by - hr * 0.9, bx + side * hr * 0.6, by - hr * 1.35); ctx.stroke();
          ctx.lineWidth = hr * 0.16;
          ctx.beginPath(); ctx.moveTo(bx + side * hr * 0.07, by - hr * 0.5); ctx.quadraticCurveTo(bx + side * hr * 0.45, by - hr * 0.55, bx + side * hr * 0.7, by - hr * 0.78); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(bx + side * hr * 0.3, by - hr * 1.05); ctx.quadraticCurveTo(bx + side * hr * 0.2, by - hr * 1.35, bx + side * hr * 0.25, by - hr * 1.6); ctx.stroke();
          ctx.lineWidth = hr * 0.2;
        }
        headband(ctx, x, top, hr, hr * 0.42, s * 0.6, hr * 0.16, '#6b4a2e');
        const ng = ctx.createRadialGradient(x + f * hr * 0.92, y + hr * 0.05, 1, x + f * hr * 1.0, y + hr * 0.12, hr * 0.26);
        ng.addColorStop(0, '#ff8a96'); ng.addColorStop(1, '#e0263c');
        ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(x + f * hr * 1.0, y + hr * 0.12, hr * 0.24, 0, TAU); ctx.fill();
        break;
      }
      case 'tophat': {
        // the brim sits on the head; a tall crown with a red band, a dusting of snow and holly
        const by = top + hr * 0.3;
        ctx.fillStyle = '#1d1f27';
        ctx.beginPath(); ctx.ellipse(x, by, hr * 1.42, hr * 0.26, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = shade(ctx, x - hr * 0.8, 0, x + hr * 0.8, '#30333d', '#15161c');
        ctx.fillStyle = (() => { const g = ctx.createLinearGradient(x - hr * 0.82, 0, x + hr * 0.82, 0); g.addColorStop(0, '#363944'); g.addColorStop(1, '#16171d'); return g; })();
        ctx.beginPath(); ctx.moveTo(x - hr * 0.78, by); ctx.lineTo(x - hr * 0.84, by - hr * 1.45); ctx.quadraticCurveTo(x, by - hr * 1.56, x + hr * 0.84, by - hr * 1.45); ctx.lineTo(x + hr * 0.78, by); ctx.quadraticCurveTo(x, by + hr * 0.12, x - hr * 0.78, by); ctx.fill();
        ctx.fillStyle = '#c62f3f';
        ctx.beginPath(); ctx.moveTo(x - hr * 0.79, by - hr * 0.2); ctx.lineTo(x - hr * 0.8, by - hr * 0.48); ctx.quadraticCurveTo(x, by - hr * 0.42, x + hr * 0.8, by - hr * 0.48); ctx.lineTo(x + hr * 0.79, by - hr * 0.2); ctx.quadraticCurveTo(x, by - hr * 0.12, x - hr * 0.79, by - hr * 0.2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath(); ctx.ellipse(x, by - hr * 1.47, hr * 0.8, hr * 0.12, 0, Math.PI, TAU); ctx.fill();
        const hx = x + f * hr * 0.42, hy = by - hr * 0.36;
        ctx.fillStyle = '#2e9e57';
        for (const a of [-0.55, 0.45]) { ctx.save(); ctx.translate(hx, hy); ctx.rotate(a * f); ctx.beginPath(); ctx.ellipse(hr * 0.26 * f, 0, hr * 0.3, hr * 0.12, 0, 0, TAU); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = '#ff2f45';
        for (const [dx, dy] of [[0, 0], [hr * 0.15, -hr * 0.1], [-hr * 0.08, -hr * 0.14]]) { ctx.beginPath(); ctx.arc(hx + dx * f, hy + dy, hr * 0.1, 0, TAU); ctx.fill(); }
        break;
      }
      case 'party': {
        // a cone perched on the crown, held by its curved base
        const bx = x + f * hr * 0.1, by = top + hr * 0.22, tx = x + f * hr * 0.35, ty = top - hr * 1.5;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(bx - hr * 0.72, by); ctx.lineTo(tx, ty); ctx.lineTo(bx + hr * 0.72, by); ctx.quadraticCurveTo(bx, by + hr * 0.2, bx - hr * 0.72, by); ctx.closePath();
        ctx.fillStyle = '#ff5c8a'; ctx.fill(); ctx.clip();
        ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = hr * 0.2;
        for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(bx - hr, by - hr * 0.1 - k * hr * 0.42); ctx.lineTo(bx + hr, by + hr * 0.35 - k * hr * 0.42); ctx.stroke(); }
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(bx + f * hr * 0.15, ty, hr, hr * 2);
        ctx.restore();
        fluff(ctx, tx, ty, hr * 0.2);
        break;
      }
      case 'cat': {
        // a band that follows the head, with two ears on top
        for (const side of [-1, 1]) {
          const ax = x + side * hr * 0.66, ay = top - hr * 0.78;
          ctx.fillStyle = '#3b3f4a';
          ctx.beginPath(); ctx.moveTo(x + side * hr * 0.12, top + hr * 0.12); ctx.quadraticCurveTo(x + side * hr * 0.3, top - hr * 0.45, ax, ay); ctx.quadraticCurveTo(x + side * hr * 1.0, top - hr * 0.3, x + side * hr * 1.0, top + hr * 0.3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffa8c8';
          ctx.beginPath(); ctx.moveTo(x + side * hr * 0.36, top + hr * 0.02); ctx.quadraticCurveTo(x + side * hr * 0.46, top - hr * 0.35, ax - side * hr * 0.02, ay + hr * 0.32); ctx.quadraticCurveTo(x + side * hr * 0.82, top - hr * 0.15, x + side * hr * 0.82, top + hr * 0.12); ctx.closePath(); ctx.fill();
        }
        headband(ctx, x, top, hr, hr * 0.42, s * 0.6, hr * 0.16, '#3b3f4a');
        break;
      }
      case 'headphones': {
        ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = hr * 0.2;
        ctx.beginPath(); ctx.ellipse(x, y - hr * 0.05, hr * 1.12, hr * 1.12, 0, Math.PI * 1.06, Math.PI * 1.94); ctx.stroke();
        for (const side of [-1, 1]) {
          ctx.fillStyle = '#2b2f3a'; ctx.beginPath(); ctx.roundRect(x + side * hr * 1.02 - hr * 0.28, y - hr * 0.4, hr * 0.56, hr * 0.9, hr * 0.26); ctx.fill();
          ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.roundRect(x + side * hr * 1.1 - hr * 0.12, y - hr * 0.24, hr * 0.24, hr * 0.58, hr * 0.12); ctx.fill();
        }
        break;
      }
      case 'cowboy': {
        // the brim rests on the head; a pinched crown on top
        const by = top + hr * 0.32;
        ctx.fillStyle = '#7a4e2c';
        ctx.beginPath(); ctx.ellipse(x, by, hr * 1.75, hr * 0.3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = shade(ctx, x, by - hr * 1.05, by, '#a8723f', '#8a5a33');
        ctx.beginPath(); ctx.moveTo(x - hr * 0.88, by); ctx.bezierCurveTo(x - hr * 0.95, by - hr * 0.8, x - hr * 0.5, by - hr * 1.05, x, by - hr * 0.85); ctx.bezierCurveTo(x + hr * 0.5, by - hr * 1.05, x + hr * 0.95, by - hr * 0.8, x + hr * 0.88, by); ctx.quadraticCurveTo(x, by + hr * 0.15, x - hr * 0.88, by); ctx.fill();
        ctx.fillStyle = '#4a2f1a';
        ctx.beginPath(); ctx.moveTo(x - hr * 0.9, by - hr * 0.08); ctx.lineTo(x - hr * 0.92, by - hr * 0.3); ctx.quadraticCurveTo(x, by - hr * 0.24, x + hr * 0.92, by - hr * 0.3); ctx.lineTo(x + hr * 0.9, by - hr * 0.08); ctx.quadraticCurveTo(x, by, x - hr * 0.9, by - hr * 0.08); ctx.fill();
        break;
      }
      case 'viking': {
        // a steel cap that hugs the head, a gold rim and nose guard, and two horns
        ctx.fillStyle = '#efe6d2';
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(x + side * hr * 0.75, top + hr * 0.3); ctx.quadraticCurveTo(x + side * hr * 1.75, top + hr * 0.2, x + side * hr * 1.5, top - hr * 0.95);
          ctx.quadraticCurveTo(x + side * hr * 1.3, top - hr * 0.2, x + side * hr * 0.75, top - hr * 0.1); ctx.closePath(); ctx.fill();
        }
        capPath(ctx, x, top, hr, hr * 0.5, s * 1.2, hr * 0.14);
        ctx.fillStyle = shade(ctx, x, top - hr * 0.2, top + hr * 0.5, '#b7c0cc', '#7f8a99'); ctx.fill();
        ctx.fillStyle = '#c9a85a';
        ctx.beginPath(); ctx.roundRect(x - hr * 1.08, top + hr * 0.32, hr * 2.16, hr * 0.22, hr * 0.1); ctx.fill();
        ctx.beginPath(); ctx.roundRect(x - hr * 0.1, top - hr * 0.12, hr * 0.2, hr * 0.5, hr * 0.08); ctx.fill();
        break;
      }
      case 'wizard': {
        // a wide brim on the head and a tall cone that bends back
        const by = top + hr * 0.3;
        ctx.fillStyle = '#4a33a8';
        ctx.beginPath(); ctx.ellipse(x, by, hr * 1.55, hr * 0.26, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = shade(ctx, x, by - hr * 2, by, '#7a5ce0', '#5b3fc4');
        ctx.beginPath(); ctx.moveTo(x - hr * 0.86, by); ctx.quadraticCurveTo(x - hr * 0.3, by - hr * 1.2, x - f * hr * 0.75, by - hr * 2.05); ctx.quadraticCurveTo(x + hr * 0.25, by - hr * 0.9, x + hr * 0.86, by); ctx.quadraticCurveTo(x, by + hr * 0.12, x - hr * 0.86, by); ctx.fill();
        ctx.fillStyle = '#ffe27a';
        const star = (sx, sy, r) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); };
        star(x + hr * 0.08, by - hr * 0.55, hr * 0.24); star(x - f * hr * 0.3, by - hr * 1.2, hr * 0.15);
        break;
      }
      case 'crown': {
        // a gold band around the crown of the head with five points
        const by = top + hr * 0.5, ty = top - hr * 0.25;
        ctx.fillStyle = shade(ctx, x, ty - hr * 0.4, by, '#ffe08a', '#e6a51f');
        ctx.beginPath(); ctx.moveTo(x - hr * 1.06, by);
        const pts = [[-1.06, -0.05], [-0.62, 0.3], [-0.3, -0.25], [0, 0.22], [0.3, -0.25], [0.62, 0.3], [1.06, -0.05]];
        ctx.lineTo(x - hr * 1.06, ty + hr * 0.3);
        for (const [px, py] of pts) ctx.lineTo(x + px * hr, ty + py * hr - (py < 0 ? hr * 0.2 : 0));
        ctx.lineTo(x + hr * 1.06, by); ctx.quadraticCurveTo(x, by + hr * 0.1, x - hr * 1.06, by); ctx.fill();
        ctx.fillStyle = '#d4931a'; ctx.beginPath(); ctx.roundRect(x - hr * 1.07, by - hr * 0.3, hr * 2.14, hr * 0.3, hr * 0.06); ctx.fill();
        for (const [gx, col] of [[-0.55, '#ff4f6d'], [0, '#5bd1ff'], [0.55, '#7ee081']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + gx * hr, by - hr * 0.15, hr * 0.1, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#fff3c4'; for (const px of [-0.3, 0.3]) { ctx.beginPath(); ctx.arc(x + px * hr, ty - hr * 0.45, hr * 0.08, 0, TAU); ctx.fill(); }
        break;
      }
      case 'halo': {
        const hy = top - hr * 0.5 + Math.sin(time * 2.5) * 1.5 * s;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, hy, 0, x, hy, hr * 1.5);
        g.addColorStop(0, 'rgba(255,230,140,0.3)'); g.addColorStop(1, 'rgba(255,230,140,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, hy, hr * 1.5, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#ffe48a'; ctx.lineWidth = hr * 0.18;
        ctx.beginPath(); ctx.ellipse(x, hy, hr * 0.9, hr * 0.26, 0, 0, TAU); ctx.stroke();
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
