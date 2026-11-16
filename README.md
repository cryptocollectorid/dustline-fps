# DUSTLINE — a tactical FPS (threejs-fps-02)

A round-based tactical FPS in a dusk desert freight yard, built with three.js 0.187.0
and no build step: `game/` is plain static files, opened in desktop Chrome.

**You are SABLE, the attackers.** Plant the bomb at Site A, or eliminate the VULTURE
defenders. First to 5 rounds takes the match.

## How to play

- **WASD** move · **Mouse** look · **Click** fire · **R** reload
- **1 / 2 / 3** switch weapons (pistol / rifle / SMG)
- **G** throw a frag grenade · **B** buy (buy phase, 15 s) · **E** plant the bomb
- **Shift** walk slow (accurate) · **Ctrl / C** crouch · **Space** jump

## What's in the game

- **A real map:** Dustline Yard — Long lane (open sightline), Mid (containers),
  Short lane (crates and barrels), a north-west deck vantage, and Site A with a
  marked plant zone. Warm dusk sun, long shadows, a water tower on the skyline.
- **Gunplay:** three hitscan weapons (P9 pistol, LR-7 rifle, KX-9 SMG) with
  recoil, bloom, movement spread, headshots x4, tracers and muzzle flash.
- **Bots:** two SABLE allies shadow you; three VULTURE defenders hold the site,
  patrol waypoints, react to gunfire, and converge to defuse a planted bomb.
  A dropped bomb is picked up by an ally, who carries it to Site A and plants.
- **Rounds and economy:** 15 s buy phase, 100 s rounds, $800 start, $300 per kill,
  $325 round win / $1,400 round loss, $300 plant. Buy a rifle, SMG, grenades or
  kevlar (30% damage reduction). First to 5 rounds wins the match.
- **HUD:** health, ammo, money, round timer, score, alive counts, kill feed,
  bomb status, plant/defuse progress, and a buy menu.

## Run it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Or open `game/index.html` through any static server. Desktop Chrome only;
WebGL 2 required.

## Build the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This copies `game/` and `screenshots/` to `out/` and writes `out/dossier.json`.

## Screenshots

`1-start.jpg` — buy phase at spawn · `2-play.jpg` — rifle fire down Long lane ·
`3-bomb.jpg` — planting at Site A · `4-end.jpg` — round won.

## Credits

Built for the [make.fun](https://make.fun/bounty/threejs-fps-02) threejs-fps-02 bounty.
three.js 0.187.0 is vendored under `game/vendor/three/` (MIT). All map, art, names
and sounds are original work for this entry.
