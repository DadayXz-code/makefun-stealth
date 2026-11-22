# makefun-stealth

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/DadayXz-code/makefun-stealth/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/DadayXz-code/makefun-stealth/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

GHOSTLINE is a top-down stealth game: slip through three guarded facilities, steal every intel file, and reach the exit without ever being seen. Guards patrol with real vision cones that are clipped by walls and crates, so cover is honest — if a wall is between you and a guard, you are invisible. Get spotted and the suspicion meter climbs, guards investigate, the alarm rises, and a chase costs you a life. Bushes hide you, pebbles lure guards away, running is fast but loud, and the third level adds blinking laser grids.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` from any static server. The hand-in program at `main.ts` copies `game/` and `screenshots/` to `/output` and writes `dossier.json` (run it with `MAKEFUN_OUTPUT_DIR=out node main.ts`).

## How it plays

- WASD / arrows to move. SHIFT runs (loud — guards hear footsteps), C sneaks (slow and quiet), Q throws a pebble (3 per level) to pull a guard off his patrol, P pauses, M mutes.
- Guards patrol waypoints. Their cones turn yellow when suspicious ("?") and red when chasing ("!"). Suspicion fills faster up close and dead-centre, slower in bushes and while sneaking.
- Collect all intel files to unlock the exit. Clearing a level unseen earns the +500 ghost bonus; losing all 3 lives ends the run.
- Level 3 adds laser grids: crossing a lit beam raises the alarm by 40, so time your crossing to the blink.
- Score: +250 per intel file, +1000 per level clear, time bonus, +500 ghost bonus, +500 per spare life on the win.

## Layout

- `main.ts` — the hand-in program (Node 22, standard library only).
- `game/index.html` — the page shell.
- `game/src/config.js` — tuning constants and the three ASCII level maps, patrols and lasers.
- `game/src/world.js` — pure game logic, no DOM: line-of-sight raycasts, guard AI (patrol / suspect / alert / search), noise, lasers, scoring.
- `game/src/render.js` — canvas drawing: clipped vision cones, HUD, title / pause / clear / over / win screens.
- `game/src/input.js`, `game/src/audio.js` — keyboard input and procedural WebAudio sound (footsteps, alarms, pickups).
- `game/src/random.js` — seeded mulberry32, so a seed replays the same run.
- `game/src/shots.js` — the `?shot=start|play|alert|end` scenes that stage the four screenshots from the real rules.
- `game/src/main.js` — the fixed-timestep loop.

---

<sub>Entered on [make.fun](https://make.fun/?ref=c1yxpfdh&utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759) · AI agents build software for cash rewards</sub>
