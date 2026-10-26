# Elementfall

A physics archery duel inspired by Ragdoll Archers. Instead of arrow types, you fight with **elements**: you unlock nine of them as you push through a **30-stage campaign** across five realms. There is also an **Endless** mode for high scores.

It's pure HTML5 and vanilla JS, with no build step and no dependencies. All art is drawn procedurally on a canvas and every sound is synthesized with WebAudio.

To play, open `index.html` through any static server (for example `python3 -m http.server`).

## How it plays

- **Drag back anywhere and release** to draw and loose an arrow. The dotted arc previews the start of the flight. Shooting costs stamina.
- **Jump** (Space, or the on-screen button) to dodge. Archers flash a `!` and glow while they draw, and timing a jump to their release dodges the shot.
- Archers are **ragdolls**. Hits flinch them, arrows stay stuck in the limb they struck, and kills send the body tumbling off its floating island. Headshots deal double damage.
- Shoot the **winged orbs** that drift past for health, a full stamina bar, or essence.

## Elements

| # | Element | Unlocks | What it does |
| --- | --- | --- | --- |
| 1 | Gale (wind) | start | Cheap and fast with a flat arc and big knockback |
| 2 | Ember (fire) | clear 1-2 | Bursts on impact and sets targets on fire |
| 3 | Tide (water) | clear 1-6 | Fires three streams. Soaked foes take double Storm damage |
| 4 | Stone (earth) | clear 2-3 | Heavy and slow. Shatters frozen foes for double damage |
| 5 | Rime (frost) | clear 2-6 | Freezes archers solid so they can't shoot |
| 6 | Storm (lightning) | clear 3-3 | Straight bolt with no drop that chains to nearby foes |
| 7 | Thorn (nature) | clear 3-6 | Roots the target and heals you for half the damage dealt |
| 8 | Void | clear 4-3 | Opens a rift that drags in, grinds and swallows enemy arrows |
| 9 | Radiance (light) | clear 4-6 | Calls down a volley of sunbeams |

Every enemy is attuned to its realm's element. Hitting a **weakness** deals 160% damage and a **resisted** hit deals 55%. The in-game Elements screen shows the full chart.

## Campaign and progression

- Five realms with six stages each: Verdant Vale, Ember Wastes, Frostpeak, Stormspire and The Void Rift. Stage 6 of each realm is a boss (Thornwarden, Cinder Tyrant, Rimeheart, Storm Herald, The Hollow King) that fires volleys and calls reinforcements.
- Enemy types are Archer, Scout (rides a moving island), Brute (armored, with a helmet that softens headshots) and Mage (casts homing orbs you can shoot down).
- Stars depend on the health you have left when you clear a stage. **Essence** comes from kills, pickups, stage clears and new stars, and buys permanent upgrades: Vitality, Endurance, Focus, Might, Ward and Insight.
- **Endless** sends waves forever. The realm rotates every 10 kills and an elder boss appears every 9th wave. Your best kill count is saved.

## Controls

| Input | Action |
| --- | --- |
| Drag + release (mouse or touch) | Aim and shoot |
| Right click | Cancel the shot |
| `1`-`9`, `Q` / `E`, mouse wheel | Switch element |
| `Space` / `W` / `↑` | Jump |
| `Esc` / `P` | Pause |

## Project layout

```
index.html
css/style.css
js/util.js       math, seeded RNG, glow sprite cache
js/platform.js   CrazyGames SDK wrapper + storage (same layer as Powder Lab)
js/audio.js      synthesized SFX + generative per-realm music
js/elements.js   element definitions, affinities, element icons
js/realms.js     realm themes, enemy stats, stage + endless wave generation
js/progress.js   save data, unlocks, upgrade shop
js/figure.js     posed stick archer -> verlet ragdoll, hit tests, stuck arrows
js/world.js      floating islands, pre-rendered backdrop, weather
js/fx.js         particles, rings, lightning arcs, sunbeams, combat text
js/game.js       battle simulation, enemy AI, elemental effects, rendering
js/icons.js      UI icons
js/ui.js         title, map, upgrades, codex, HUD, modals, coach
js/main.js       boot, loop, input
assets/fonts/    Cinzel + Nunito (SIL Open Font License)
```

The CrazyGames SDK is only loaded when the game runs on a CrazyGames domain. Everywhere else, progress is saved to `localStorage`.

## Credits

Fonts: [Cinzel](https://fonts.google.com/specimen/Cinzel) by Natanael Gama and [Nunito](https://fonts.google.com/specimen/Nunito) by Vernon Adams, Cyreal and Jacques Le Bailly, both under the SIL Open Font License 1.1.
