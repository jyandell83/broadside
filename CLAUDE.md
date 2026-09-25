# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project Instructions

This is a small arcade naval combat game.

## Goals
- Fun over realism.
- Fast iteration.
- Keep systems simple.
- Get features playable before polishing them.
- Prefer readable code over clever abstractions.

## Stack
- TypeScript
- Vite
- HTML Canvas
- CSS
- No frontend framework.
- No backend.

## Architecture
Keep game systems separated where reasonable:
- game loop
- input
- ships
- weapons/projectiles
- collision
- rendering
- game state

Do not introduce libraries unless they provide substantial value.

## Commands
- `npm run dev` — Vite dev server with hot reload
- `npm run build` — type-check (`tsc`) then production build into `dist/`
- `npm run typecheck` — type-check only
- `npm run preview` — serve the production build

There is no test runner yet.

## Code layout
- `src/main.ts` wires everything together. Its `update(dt)` function sets the order of systems each tick: wind → input → enemy AI → ships → projectiles → splashes → collision → wake → camera.
- `src/types.ts` holds the shared data shapes (`Ship`, `Projectile`, `GameState`). Entities are plain data objects; the systems in `src/systems/` are functions that read and mutate `GameState`.
- `systems/loop.ts` runs a fixed 60 Hz simulation step and renders on every animation frame. Pass `dt` in seconds and keep gameplay code frame-rate independent.
- Entities are removed by filtering:
  - ships at `hp <= 0` in `updateShips`
  - projectiles at `life <= 0` in `updateProjectiles`, which leaves a `Splash` (so `life` is effectively the shot's range)
  - projectiles that hit a ship in `resolveCollisions`
- `Input.wasPressed` is true only on the first tick a key goes down; `endFrame()` must stay at the end of `update`.
- Tuning constants (speeds, reload time, damage) sit at the top of each system file.
- Coordinates use screen-style axes (y down); `heading` 0 points toward +x, and starboard is `heading + PI/2`.
- The world (`state.world`, 4000×3000) is much larger than the window (`state.viewport`), and ships are kept inside it (no wrapping).
  - `state.camera` is the world point at the centre of the screen. `systems/camera.ts` follows the player with deliberate lag, plus a look-ahead (`state.cameraLead`) that grows with speed and eases more slowly than the follow, so the view swings gently through turns.
  - `render` draws the world inside a camera translate, then draws the HUD and the off-screen enemy arrows in screen space. Use `worldToScreen` to convert between the two.
  - The wake (`systems/wake.ts`, `state.wake`) and the bow wave are purely visual and scale with speed; they never feed back into gameplay.
  - Wave marks are fixed to world positions so the player's motion is visible. The wind streaks tile the viewport but are offset by the camera so they move with the air.
- Movement is wind-driven (age of sail), with no throttle. `systems/wind.ts` holds the sailing model:
  - `state.wind.dir` is the direction the wind blows *toward*.
  - Ships are square-rigged. `ship.brace` is the angle of the sails' face from the bow (+ = toward starboard, 0 = yards square across), limited to ±`BRACE_LIMIT`.
  - The ideal brace is half the angle between the bow and the direction the wind blows toward (`idealBrace`).
  - A ship's target speed is `MAX_SPEED × wind strength × sails set × polarFactor(angle off the wind) × braceEfficiency`.
  - Ships within 60° of the wind (`NO_GO`) get no drive and slow down quickly, so going upwind means tacking through the wind on momentum.
  - `sailFill` is used only for visuals: how squarely the wind hits the back of the sail. Negative means "taken aback".
  - Arcade tuning: a ship never drops below `MIN_SPEED` (even in irons).
  - Steering is `max(rudder, pivot)`. Rudder authority grows with speed; the pivot boost gives full turn rate when nearly stopped, so a bad heading is always recoverable.
  - The wind shifts every 20–45s toward a new random direction and strength, and eases toward it over about 15s (`updateWind`).
  - Ships and wind share one speed scale (`PX_PER_KNOT` in `wind.ts`). Use it for any speed shown to the player.
  - `wind.drift` is added up each tick and moves the on-water streaks. Don't derive streak positions from `time × wind`, because every shift then makes them jump.
  - `offWind` and `sailEfficiency` on `Ship` are derived each tick in `updateShips`. Don't set them anywhere else.

## Working rules
- Explain major architectural changes before making them.
- Do not rewrite large working systems unnecessarily.
- Keep TypeScript types strict.
- Run the build after meaningful changes.
- Fix TypeScript/build errors before considering a task complete.
- Do not modify files outside this repository.
- Do not access credentials, SSH keys, or unrelated files.
- Do not install global packages.
- Do not deploy or push to remote repositories without permission.
