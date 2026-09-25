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
- `src/main.ts` wires everything together. Its `update(dt)` function sets the order of systems each tick: input → enemy AI → ships → projectiles → collision.
- `src/types.ts` holds the shared data shapes (`Ship`, `Projectile`, `GameState`). Entities are plain data objects; the systems in `src/systems/` are functions that read and mutate `GameState`.
- `systems/loop.ts` runs a fixed 60 Hz simulation step and renders on every animation frame. Pass `dt` in seconds and keep gameplay code frame-rate independent.
- Entities are removed by filtering: ships at `hp <= 0` in `updateShips`, projectiles at `life <= 0` in `updateProjectiles`. Collision "consumes" a projectile by setting `life = 0`.
- `Input.wasPressed` is true only on the first tick a key goes down; `endFrame()` must stay at the end of `update`.
- Tuning constants (speeds, reload time, damage) sit at the top of each system file.
- Coordinates use screen space (y down); `heading` 0 points toward +x, and starboard is `heading + PI/2`.
- Movement is wind-driven (age of sail), with no throttle. `systems/wind.ts` holds the sailing model:
  - `state.wind.dir` is the direction the wind blows *toward*.
  - A ship's target speed is `MAX_SPEED × wind strength × sails set × polarFactor(angle off the wind) × trimEfficiency(trim)`.
  - Ships within 45° of the wind (`NO_GO`) get no drive and slow down quickly, so going upwind means tacking through the wind on momentum.
  - Rudder authority scales with speed.
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
