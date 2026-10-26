# Elementfall: CrazyGames listing

## Title
Elementfall

## Short description (one line)
A ragdoll brawler on floating islands. Wield 15 elements and knock every foe into the void.

## Description
Elementfall is a physics ragdoll brawler set across seven elemental realms of floating islands. Every fighter is an active ragdoll, so bodies wobble and flinch, and big hits send them tumbling. Knock enemies off the edge for an instant ring-out. Watch your own footing, though, because falling into the void ends your run.

Each element gives you a main attack plus two element powers. Gale's Updraft launches foes skyward, Ember's Flame Dash burns through crowds, Tide's Tidal Wave sweeps fighters off the edge, and Rime's Frost Nova freezes everything nearby. Earn gems in battle to unlock new elements, from Stone and Storm to Void, Radiance, Crystal, Gravity and Echo: ricochet shards, prism walls that reflect shots, anti-gravity fields and a rewind that pulls you back from a fall. Equip up to three at once and swap between them mid-combo.

Fight through 56 stages in 7 realms, each ending in an elemental boss. Upgrade your fighter in the forge, chase three stars on every stage, then test yourself in Endless mode.

**Features**
- Active ragdoll physics with knockback, tumbles and ring-outs
- 15 elements, each with its own main attack and two unique powers (45 moves)
- 56 campaign stages across 7 realms, with 7 bosses
- Elemental weaknesses and combos (shatter frozen foes, shock soaked ones)
- Endless mode with rotating realms and champion waves
- Permanent upgrades, star ratings, a short visual tutorial and a Testing ground to try every element
- Full desktop and mobile touch controls

## Controls

**Desktop**
- A / D or Arrow keys: move
- W / Space: jump (double jump in the air)
- S: drop through an island
- Mouse + Left click (or J): main attack toward the cursor
- Q / Right click (or K): element power 1
- E / Middle click (or L): element power 2
- 1, 2, 3 / Tab / Mouse wheel: swap element
- P (or Esc): pause

Key labels in game follow the player's keyboard layout (AZERTY shows Z/Q/S/D).

**Mobile**
- Left joystick: move (pull down to drop through)
- Right buttons: attack, power 1, power 2, jump
- Tap the element hexes to swap
- Attacks auto-aim; drag off a button to aim manually
- The camera zooms in on small screens; edge arrows point to off-screen foes

## Tags
Suggested (pick the ones the portal offers):
`ragdoll`, `physics`, `fighting`, `brawler`, `action`, `stickman`, `magic`, `elements`, `platformer`, `boss`, `upgrade`, `mobile`, `1 player`

**Category:** Action (or Fighting)

## Assets (in this folder)

| File | Size | Use |
| --- | --- | --- |
| `cover-landscape-1920x1080.png` | 1920×1080 (16:9) | Landscape cover |
| `cover-portrait-800x1200.png` | 800×1200 (2:3) | Portrait cover |
| `cover-square-800x800.png` | 800×800 (1:1) | Square cover |
| `preview-landscape-1920x1080.mp4` | 1920×1080, 20 s, H.264, no audio | Landscape gameplay preview |
| `preview-portrait-1080x1920.mp4` | 1080×1920, 20 s, H.264, no audio | Portrait gameplay preview |

The covers come from real gameplay. The only text on them is the game title, with no borders, logos or UI. The videos are raw, unedited gameplay.

## Technical
- Pure HTML5 / Canvas 2D with no build step. Upload the repo folder as a zip, minus `crazygames/`.
- Orientation: landscape. Mobile portrait shows a "turn sideways" prompt with a play-anyway option.
- Saves go through the SDK `data` module on CrazyGames and `localStorage` elsewhere.

## CrazyGames SDK v3 integration (`js/platform.js`)

**Basic Launch build: ads are switched off** (`ADS_ENABLED = false` in `js/platform.js`). No midgame, rewarded or banner ads are requested, there is no ad-block check, and the Revive / Double Gems ad buttons are hidden. Set the flag to `true` for a Full Launch.

- `SDK.init()`, `environment`
- `game.loadingStart` / `loadingStop` around boot
- `game.gameplayStart` / `gameplayStop` on combat start/end, pause, menus and ads
- `game.happytime` on stage clears and element unlocks
- `game.settings` + `addSettingsChangeListener` (`muteAudio` is respected)
- `ad.requestAd('midgame')` between stages, rate-limited to one every 3 minutes
- `ad.requestAd('rewarded')`: revive once per run, or double the gems from a stage
- `ad.hasAdblock`
- `banner.requestResponsiveBanner` on the home screen (desktop, 300×250) and `banner.clearAllBanners` when gameplay starts
- `user.isUserAccountAvailable`, `getUser`, `showAuthPrompt`, `addAuthListener` (login chip on home; the save reloads on login)
- `user.systemInfo.device.type` for mobile detection (hides keyboard hints)
- `data.getItem` / `setItem` / `removeItem` for cloud saves

Not used: `game.inviteLink` / `showInviteButton` (single-player game, no rooms).
