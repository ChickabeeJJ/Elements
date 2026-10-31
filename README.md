# Element Rag

A ragdoll brawler set on floating islands. Every fighter is an **active ragdoll**: a verlet skeleton held upright by muscle springs, so bodies wobble, flinch and get flung around. Big hits make them go limp and tumble, and they pick themselves back up once they land. Knock a foe off the islands for an instant **ring-out**, but careful: if you fall into the void yourself, the run is over.

You don't use a bow. You fight with **elements**: each one has a **main attack** (melee or ranged) plus **two element powers**. There are **26 elements**, and you unlock them with **gems** earned in battle. The campaign has **56 stages** across seven realms. Your loadout of up to three elements is saved. **Play** drops you straight into your next stage, and **Stage Select** lets you replay any cleared one. Change your loadout from the home screen, the map or the pause menu, and swap between the three mid-combo. There's also an **Endless** mode, plus a short, skippable tutorial on first launch.

It's pure HTML5 and vanilla JS, with no build step and no dependencies. All art is drawn procedurally and every sound is synthesized.

To play, serve the folder (for example `python3 -m http.server`) and open `index.html`.

## Elements

| Element | Main attack | Power 1 | Power 2 | Gems |
| --- | --- | --- | --- | --- |
| Gale (wind) | Gust Palm (melee, big knockback) | Updraft: launch up and fling foes | Cyclone: travelling tornado that drags foes | free |
| Ember (fire) | Fireball (ranged, burns) | Flame Dash | Fire Pillars: four flame pillars march forward along the ground | 60 |
| Tide (water) | Water Whip (long melee, soaks) | Tidal Wave: sweeps foes off edges | Bubble Shield | 90 |
| Stone (earth) | Stone Fist (heavy melee) | Boulder | Quake: ground slam / air plunge that stuns | 130 |
| Rime (frost) | Ice Shards (3 ranged shards, chill) | Frost Nova: freeze everything near | Ice Lance: pierces and shatters frozen foes | 170 |
| Storm (lightning) | Shock Bolt (instant ranged, chains) | Blink Strike: teleport + discharge | Thunderstorm: lightning on 4 foes | 220 |
| Thorn (nature) | Vine Lash (melee, roots, lifesteal) | Thorn Snare: rooting thorn patch | Bloom: heal and cleanse | 270 |
| Steel | Blade Arc (wide melee) | Magnetize: yanks nearby foes toward you | Saw Disc: piercing spinning blade | 320 |
| Venom | Venom Spit (ranged, poisons) | Toxic Cloud: lingering poison zone | Plague Swarm: five flies hunt separate foes | 380 |
| Void | Void Orb (homing ranged) | Rift: black hole that pulls foes and eats projectiles | Shadow Step: untouchable dash | 450 |
| Arcane | Star Bolts (2 homing bolts) | Orbiting Stars: three stars circle you and strike | Meteor Fall: meteors on marked foes | 520 |
| Radiance (light) | Radiant Blade (fast melee combo) | Sunbeam: channelled beam | Halo: a ring of light that returns to you | 600 |
| Crystal | Crystal Shot (ricochets off islands) | Prism Wall: reflects enemy shots | Geode Mines: proximity mines | 680 |
| Gravity | Gravity Hook (reels a foe in) | Anti-Grav Field: foes float helplessly | Collapse: slams airborne foes down, stuns the rest | 760 |
| Echo | Sonic Clap (widening wave through everything) | Resonance: tag foes, then stun them | Rewind: snap back 1.5s, even out of a fall | 840 |
| Dragon | Dragonfire (roaring flame burst) | Dragon Dive: leap and crash down in flame | Summon Dragon: a great golden dragon sweeps the arena | 1500 |
| Sand | Sand Blast (3 slowing grit shots) | Dune Wave | Sandstorm: slowing zone | 110 |
| Magma | Magma Fist (burning melee) | Lava Vents | Eruption: burning nova | 240 |
| Smoke | Smoke Jab (fast melee) | Smoke Bomb: slowing cloud | Vanish: untouchable dash | 290 |
| Spirit | Wisp (homing) | Phase: teleport burst | Spirit Bloom: heal | 350 |
| Crimson | Crimson Lash (life-steal whip) | Hemorrhage: bleeding thorns | Crimson Nova: life-steal burst | 400 |
| Plasma | Plasma Shot (piercing) | Arc Dash: stunning dash | Plasma Rain: 4 sky bolts | 430 |
| Moon | Crescent Cut (melee) | Moon Disc: returning disc | Moonbeams: 3 sky beams | 580 |
| Mirror | Glass Shards (ricochet) | Mirror Step: teleport burst | Mirror Shell: shield | 700 |
| Phoenix | Flare Feathers (burning) | Rebirth: heal in flames | Firebird Dive | 1300 |
| Cosmos | Star Lance (piercing) | Black Star: pulling zone | Supernova: huge nova | 1750 |

Each realm's warriors share an element. Hitting their weakness deals 160% damage and resisted hits deal 55%. The battle-prep screen marks which of your elements are **strong** against the stage. Elements combo (each element's combos are shown in the Elements menu): **Shatter** (Rime → Stone), **Overload** (Tide → Storm), **Wildfire** (Thorn → Ember), **Ignite** (Venom → Ember), **Firestorm** (Ember/Dragon → Gale), **Resonate** (Storm/Echo → Steel), **Starfall** (Gravity → Arcane), **Prismatic** (Crystal → Radiance), **Eclipse** (Radiance → Void), **Singularity** (Void → Gravity), **Inferno** (Ember → Dragon), **Thunderwing** (Storm/Echo → Dragon), plus **Mudslide** (Tide → Sand), **Glassworks** (Sand/Smoke → Mirror), **Meltdown** (Venom/Crimson → Magma), **Ashes** (Ember/Magma/Dragon → Phoenix), **Smokescreen** (Radiance/Arcane → Smoke), **Haunt** (Smoke/Sand/Rime → Spirit), **Bloodlust** (Thorn/Spirit → Crimson), **Blood Moon** (Crimson/Venom → Moon), **Landslide** (Sand/Smoke → Stone), **Frostbite** (Rime → Crystal), **Conductor** (Tide → Plasma) and **Big Bang** (Gravity/Moon/Gale → Cosmos). Every element is part of at least two combos, and each element has a **Preview** in the Elements menu that plays its whole kit. Crystal, Radiance and Void hits leave a short mark (glint, dazzle, drain) that their partner cashes in.

## Campaign and progression

- Verdant Vale also has **stage 0**: the tutorial the first time, then a **Testing** ground with a dummy that respawns, to try elements freely (no rewards).
- Seven realms with eight stages each: Verdant Vale, Ember Wastes, Tidal Reef, Frostpeak, Stormspire, Toxic Mire and The Void Rift. Each realm has its own arena layouts, and some have moving islands. Stage 8 is a boss: Thornwarden, Cinder Tyrant, Tidecaller, Rimeheart, Storm Herald, Plaguebinder or The Hollow King. Bosses use their element's full kit and summon reinforcements.
- Enemy types are Warriors, Casters (keep their distance and cast), Brutes (heavy, hard to knock away, carry a power) and Bosses. Hurt enemies fly further when hit.
- Stages have at most three waves; when a boss falls, its reinforcements fall with it. Stars come from the health you have left (3 stars also needs no falls). Gems come from kills, ring-outs, pickups and clears. They unlock new elements and buy permanent upgrades: Vitality, Might, Ward, Focus, Swiftness and Anchor.
- Falling into the void ends a stage. The ad rewards (one revive per run, double gems) only appear when ads are switched on; this Basic Launch build ships with ads off.
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
| `P` (or `Esc`) | Pause |

On touch screens, a floating joystick on the left handles movement (pull down to drop through). On the right, the attack, power and jump buttons sit in a thumb arc around a big attack button and scale with the screen. Attacks auto-aim at the nearest foe, or you can drag off a button to aim it yourself. On small screens the camera zooms in and follows you, and edge arrows point to foes off screen.

Key labels follow the player's keyboard layout (for example, AZERTY shows Z Q S D), and `P` pauses so `Esc` can stay free for leaving fullscreen.

## Project layout

```
index.html
css/style.css     UI: ink panels with cut corners, square element tiles, skill badges, touch orbs
js/util.js        math, seeded RNG, glow sprite cache
js/platform.js    CrazyGames SDK v3 wrapper: events, ads, banners, accounts, data
js/audio.js       synthesized SFX + generative per-realm music
js/elements.js    element kits (moves as data), affinities, emblems
js/realms.js      realm themes, arenas, enemy archetypes, stages, endless waves
js/progress.js    save data, unlocks, loadout, upgrades
js/ragdoll.js     Fighter: active ragdoll, poses, tumble/recover, hurtboxes
js/world.js       one-way floating islands (blocky tile pyramids), backdrop, weather
js/fx.js          particles, rings, arcs, beams, combat text
js/game.js        moves runtime, hits/knockback/ring-outs, enemy AI, waves, rendering
js/icons.js       UI and move icons
js/ui.js          home, stage select, codex/shop, forge, pause, tutorial, HUD, touch
js/main.js        boot, loop, keyboard/mouse
assets/fonts/     Rubik (SIL Open Font License)
crazygames/       listing text (CRAZYGAMES_LISTING.md), 3 covers, 2 preview videos
```

The CrazyGames SDK v3 script is always included. Every call is guarded, so the game also runs offline or on other hosts, and progress falls back to `localStorage`. See `crazygames/CRAZYGAMES_LISTING.md` for the full list of SDK features used.

## Credits

Font: [Rubik](https://fonts.google.com/specimen/Rubik) by Hubert and Fischer, under the SIL Open Font License 1.1.
