# Elementfall

A ragdoll brawler set on floating islands. Every fighter is an **active ragdoll**: a verlet skeleton held upright by muscle springs, so bodies wobble, flinch and get flung around. Big hits make them go limp and tumble, and they pick themselves back up once they land. Knock a foe off the islands for an instant **ring-out**.

You don't use a bow. You fight with **elements**: each one has a **main attack** (melee or ranged) plus **two element powers**. You unlock elements through a **30-stage campaign** across five realms, take up to three into each fight, and can swap between them mid-combo. There's also an **Endless** mode.

It's pure HTML5 and vanilla JS, with no build step and no dependencies. All art is drawn procedurally and every sound is synthesized.

To play, serve the folder (for example `python3 -m http.server`) and open `index.html`.

## Elements

| Element | Main attack | Power 1 | Power 2 | Unlocks |
| --- | --- | --- | --- | --- |
| Gale (wind) | Gust Palm (melee, big knockback) | Updraft: launch up and fling foes | Cyclone: travelling tornado that drags foes | start |
| Ember (fire) | Fireball (ranged, burns) | Flame Dash | Eruption: launching blast | clear 1-2 |
| Tide (water) | Water Whip (long melee, soaks) | Tidal Wave: sweeps foes off edges | Bubble Shield | clear 1-6 |
| Stone (earth) | Stone Fist (heavy melee) | Boulder | Quake: ground slam / air plunge that stuns | clear 2-3 |
| Rime (frost) | Ice Shards (3 ranged shards, chill) | Frost Nova: freeze everything near | Ice Lance: pierces and shatters frozen foes | clear 2-6 |
| Storm (lightning) | Shock Bolt (instant ranged, chains) | Blink Strike: teleport + discharge | Thunderstorm: lightning on 4 foes | clear 3-3 |
| Thorn (nature) | Vine Lash (melee, roots, lifesteal) | Thorn Snare: rooting thorn patch | Bloom: heal and cleanse | clear 3-6 |
| Void | Void Orb (homing ranged) | Rift: black hole that pulls foes and eats projectiles | Shadow Step: untouchable dash | clear 4-3 |
| Radiance (light) | Radiant Blade (fast melee combo) | Sunbeam: channelled beam | Judgment: sunbeams on 6 foes | clear 4-6 |

Each realm's warriors share an element. Hitting their weakness deals 160% damage and resisted hits deal 55%. The battle-prep screen marks which of your elements are **strong** against the stage. Combos between elements work too: frozen foes shatter under Stone or Ice Lance, and soaked foes take extra Storm damage.

## Campaign and progression

- Five realms with six stages each: Verdant Vale, Ember Wastes, Frostpeak, Stormspire and The Void Rift. Each realm has its own arena layouts, and some have moving islands. Stage 6 is a boss: Thornwarden, Cinder Tyrant, Rimeheart, Storm Herald or The Hollow King. Bosses use their element's full kit and summon reinforcements.
- Enemy types are Warriors, Casters (keep their distance and cast), Brutes (heavy, hard to knock away, carry a power) and Bosses. Hurt enemies fly further when hit.
- Stars come from the health you have left (3 stars also needs no falls). Essence comes from kills, ring-outs, pickups and clears, and buys permanent upgrades: Vitality, Might, Ward, Focus, Swiftness and Anchor.
- **Endless** sends waves forever. Realms and arenas rotate every 10 kills, and an elder champion appears every 8th wave.

## Controls

| Desktop | Action |
| --- | --- |
| `A` / `D` (or arrows) | Move |
| `W` / `Space` | Jump (double jump in the air) |
| `S` | Drop through an island |
| Mouse + left click (or `J`) | Main attack toward the cursor |
| `Q` / right click (or `K`) | Power 1 |
| `E` / middle click (or `L`) | Power 2 |
| `1` `2` `3`, `Tab`, wheel | Swap element |
| `Esc` / `P` | Pause |

On touch screens, a floating joystick on the left handles movement (pull down to drop through). On the right are the attack, power and jump buttons. Attacks auto-aim at the nearest foe, or you can drag off a button to aim it yourself.

## Project layout

```
index.html
css/style.css     flat minimal UI: charcoal panels, flat buttons, Bungee labels
js/util.js        math, seeded RNG, glow sprite cache
js/platform.js    CrazyGames SDK wrapper + storage
js/audio.js       synthesized SFX + generative per-realm music
js/elements.js    element kits (moves as data), affinities, emblems
js/realms.js      realm themes, arenas, enemy archetypes, stages, endless waves
js/progress.js    save data, unlocks, loadout, upgrades
js/ragdoll.js     Fighter: active ragdoll, poses, tumble/recover, hurtboxes
js/world.js       one-way floating islands, backdrop, weather
js/fx.js          particles, rings, arcs, beams, combat text
js/game.js        moves runtime, hits/knockback/ring-outs, enemy AI, waves, rendering
js/icons.js       UI and move icons
js/ui.js          home, map, battle prep, grimoire, forge, HUD, touch controls
js/main.js        boot, loop, keyboard/mouse
assets/fonts/     Bungee + Nunito (SIL Open Font License)
```

The CrazyGames SDK is only loaded on CrazyGames domains. Everywhere else, progress is saved to `localStorage`.

## Credits

Fonts: [Bungee](https://fonts.google.com/specimen/Bungee) by David Jonathan Ross and [Nunito](https://fonts.google.com/specimen/Nunito) by Vernon Adams, Cyreal and Jacques Le Bailly, both under the SIL Open Font License 1.1.
