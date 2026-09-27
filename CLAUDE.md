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
- `src/main.ts` wires everything together. Its `update(dt)` function sets the order of systems each tick: wind → input → enemy AI → ships → guns → projectiles → splashes → collision → wake → effects → loot → camera → port panel sync. The F key (dock / set sail) is handled before movement.
- `src/types.ts` holds the shared data shapes (`Ship`, `Projectile`, `GameState`). Entities are plain data objects; the systems in `src/systems/` are functions that read and mutate `GameState`.
- `systems/loop.ts` runs a fixed 60 Hz simulation step and renders on every animation frame. Pass `dt` in seconds and keep gameplay code frame-rate independent.
- Entities are removed by filtering:
  - ships once they have finished sinking, in `updateShips`. A ship at 0 HP isn't removed immediately. `startSinking` sets `sinkAge`, and for `SINK_DURATION` it's disabled: no steering, sail changes or firing, and cannonballs pass over it. It drifts and turns, then is filtered out. Check `sinkAge !== null` wherever a ship must be afloat to act or be targeted.
  - projectiles at `life <= 0` in `updateProjectiles`, which leaves a `Splash` (so `life` is effectively the shot's range)
  - projectiles that hit a ship in `resolveCollisions`
- `Input.wasPressed` is true only on the first tick a key goes down; `endFrame()` must stay at the end of `update`.
- Tuning constants (speeds, reload time, damage) sit at the top of each system file.
- Coordinates use screen-style axes (y down); `heading` 0 points toward +x, and starboard is `heading + PI/2`.
- Ship size is one knob: `SHIP_SCALE` in `systems/hull.ts`.
  - Hull, gun and effect offsets are written in base (1×) units.
  - The renderer applies the scale once in the ship transform. World placements go through `shipToWorld`/`worldToShip`, and the collision radius is `HULL.radius * SHIP_SCALE`.
  - Don't hardcode ship-sized pixel offsets elsewhere.
- The world (`state.world`, base 4000×3000 × `WORLD_SCALE` in `state.ts`) is much larger than the window (`state.viewport`), and ships are kept inside it (no wrapping).
  - `state.camera` is the world point at the centre of the screen. `systems/camera.ts` follows the player with deliberate lag, plus a look-ahead (`state.cameraLead`) that grows with speed and eases more slowly than the follow, so the view swings gently through turns.
  - `render` draws the world inside a camera translate, then draws the HUD and the off-screen enemy arrows in screen space. Use `worldToScreen` to convert between the two.
  - The wake (`systems/wake.ts`, `state.wake`) and the bow wave are purely visual and scale with speed; they never feed back into gameplay.
  - Broadsides ripple-fire. `fireBroadside` starts the reload and queues `ship.pendingShots`; `updateGuns` fires each gun from the ship's current position at its gun port, with a `muzzleBlast` (flash, gun smoke, slight recoil). A sinking ship drops its queued shots.
  - Islands (`systems/islands.ts`, fixed data in `ISLANDS`; each game state gets its own copy):
    - The coast is `radius × (1 + Σ amp·sin(k·θ + phase))` around a centre, so each island ("blob") is star-shaped: no hooked headlands or overhangs on its own.
    - Overlapping blobs that share a `landmass` form one piece of land. That's how Wickham's cove is made: a ring of blobs with a gap for the entrance. The renderer draws each layer across all of a landmass's blobs, so they merge, and labels it once.
    - Grass uses a per-segment edge (`grassOffsets`): it keeps a sand margin only where a blob's coast meets open water, and reaches into neighbouring blobs elsewhere, so no sand shows inside the land.
    - Small smoothing blobs (radius < 60) in the corners between larger ones get no hills. Collision treats blobs like any other islands.
    - Free-form coastlines would need polygon collision.
    - Rendering (`islandPath`), land collision (`pushOutOfLand`, `isOnLand`) and port placement all use `coastRadius`, so they always agree.
    - Ships are pushed out radially, in a few passes, so a corner between blobs can't trap them. `pushOutOfLand` returns the combined direction away from the land touched.
    - `updateShips` then drains speed and swings the bow along the shore in proportion to how squarely it hit, so ships slide off the coast rather than sticking.
    - `DEFLECT_RATE` must stay below what full rudder gives at `MIN_SPEED` (`TURN_RATE × rudderBite(MIN_SPEED)`), or the bow can be held against the shore in a corner.
    - Cannonballs stop on land (`landImpact`), and loot can't drift ashore.
  - Ports (`systems/ports.ts`, data in `PORT_DEFS`) are an island plus the direction the harbour faces; pier, berth, docking area and buoys are derived from that.
    - Each port has a `style` (roof and flag colours, an optional lighthouse on any blob's coast) for its visual identity.
    - Each port def has a `supplies` stock of ship supplies (`systems/supplies.ts`: Timber, Oakum, Pitch, Rope, Sailcloth, Iron, and Cannonballs). `createPorts` copies it onto the port, so trading changes this game's stock without touching the defs.
    - Supplies are separate from cargo (`CARGO`) so loot never drops them.
    - Future per-port data (prices, services) goes on the def.
    - Everything else (docking, prompts, the panel, off-screen markers) is shared, so a new port is one entry here plus its island.
    - Docking needs furled sails and a near-stop, using the existing sail and speed values (no separate docking state). `dockablePort` means "inside the docking area"; `dockStatus` adds readiness: `"sails"` (sails still set), `"slowing"` (furled, faster than `DOCK_MAX_SPEED`, 3 kn), or `"ready"`. The prompt and the F key read `dockStatus`.
    - F docks when ready and sets sail when docked.
    - `ship.docked` (a `Docking`) disables steering, sails and firing from the moment docking starts.
    - The berth is across the pier's T-head, parallel to the shore. `dock` picks the mooring heading (either way along the shore) that needs the least turning.
    - `updateDocking` in `ships.ts` then plans a cubic curve from the ship's position and heading into the berth. The ship moves forward along it facing along it, advancing each tick only as far as `DOCK_TURN_RATE` lets the heading follow: easing up, cruising at about 5 kn, and easing to a stop.
    - `phase` is `"approach"` until the ship reaches the berth, then `"moored"`. The Port panel opens and Set Sail works only when moored.
    - Steering toward the berth by feedback circled instead of arriving (the docking area is only a few turning circles across), which is why the path is planned.
    - Enemy AI won't fire at a docked player.
  - Trading (`systems/trade.ts`) holds all prices and the trading rules.
    - `CARGO_VALUE` is what ports pay per unit of cargo (coin is currency and isn't traded). `SUPPLY_PRICE` is what a supply costs. Every port uses these base values for now.
    - `sellCargo` and `buySupply` check the rules (moored at that port, cargo held, in stock, enough coin), make the change, and return a message or a reason. `sellBlocker` and `buyBlocker` give the reason without trading, which the UI uses to disable buttons.
    - `buySupply`/`buyBlocker` take a quantity (default 1) and buy exactly that many or nothing. The panel's Buy 10 uses it.
    - Keep prices and rules there, not in the UI.
  - Ship inventory: `ship.cargo` is the hold (loot and trade goods, plus `coin`); `ship.supplies` holds ship supplies (repair materials and cannonballs). They're kept separate on purpose, and future repairs should consume `ship.supplies`.
  - Ammunition is the `cannonballs` supply.
    - Ships start with `STARTING_CANNONBALLS` (100, in `weapons.ts`).
    - `fireBroadside` queues only as many guns as `cannonballsFree` (balls aboard minus guns already queued), bow first. With none, nothing fires and the reload doesn't start.
    - `fireGun` uses up one ball as each gun fires.
    - Buying goes through the normal `buySupply`, at `SUPPLY_PRICE.cannonballs`.
    - The HUD shows the count on the reload line, amber below `LOW_CANNONBALLS`.
  - The Port screen is a DOM panel (`src/ui/portPanel.ts`, styled in `style.css`), not canvas. `portPanel.sync(state)` runs each tick and shows it while the player is moored.
    - It shows coin, a Cargo Hold table with Sell buttons, and a Ship Supplies table (price, available, aboard) with Buy and Buy 10 buttons, then redraws after each trade.
    - It only calls the `trade.ts` functions and keeps no game state of its own.
    - Put future menu-style UI in the DOM too.
  - Loot: `updateShips` returns the wrecks it removed this tick, and `main.ts` passes enemy wrecks to `dropWreckCargo`. Loot therefore spawns where the wreck finally went down, and is tied to the removal, not the sinking animation.
    - `state.loot` is not a collider. Only the player's pickup check in `updateLoot` reads it, by sailing within `radius + PICKUP_REACH`.
    - Collected cargo goes into `ship.cargo`, the hold. The Cargo Hold panel is drawn bottom-left and also lists supplies aboard.
    - Cargo types are data in `systems/cargo.ts` (`CARGO`). Add types or properties (weight, rarity) there; prices live in `systems/trade.ts`.
  - `systems/effects.ts` handles visual-only combat feedback (`state.particles`, `state.shake`, `ship.jolt`/`joltSpin`): impact flash, splinters and smoke via `cannonImpact` (called from collision), damage smoke and fires below 70% HP, sinking bubbles and wreckage, and camera shake. Jolt and shake are offsets applied only when drawing; never feed them back into positions or aim.
  - Wave marks are fixed to world positions so the player's motion is visible. The wind streaks tile the viewport but are offset by the camera so they move with the air.
- Movement is wind-driven (age of sail), with no throttle. `systems/wind.ts` holds the sailing model:
  - `state.wind.dir` is the direction the wind blows *toward*.
  - Ships are square-rigged. `ship.brace` is the angle of the sails' face from the bow (+ = toward starboard, 0 = yards square across), limited to ±`BRACE_LIMIT`.
  - The ideal brace is half the angle between the bow and the direction the wind blows toward (`idealBrace`).
  - A ship's target speed is `MAX_SPEED × wind strength × sails set × polarFactor(angle off the wind) × braceEfficiency`.
  - Ships within 55° of the wind (`NO_GO`) get no drive and slow down quickly, so going upwind means tacking through the wind on momentum.
    - If you change `NO_GO`, move `POLAR`'s first row to the same angle and keep `BRACE_LIMIT` ≥ (180° − `NO_GO`) / 2.
  - `sailFill` is used only for visuals: how squarely the wind hits the back of the sail. Negative means "taken aback".
  - Arcade tuning: a ship never drops below `MIN_SPEED` (even in irons).
  - Steering is a rudder.
    - A/D move `ship.rudder` (-1 port … 1 starboard) at `RUDDER_RATE`. When released, it drifts back toward amidships at `RUDDER_RETURN_RATE` (hard over to centre in about 2s) and snaps to 0 within `RUDDER_CENTER_SNAP`. Set the rate to 0 to make the rudder stay where it's left.
    - Moving toward centre, it snaps to exactly 0 within `RUDDER_CENTER_SNAP`, then rests there for `RUDDER_CENTER_DETENT` (tracked by `ship.rudderHold`) before continuing if the key is still held.
    - The rudder is shown as a small ship's wheel drawn in world space just below the player's ship (`drawRudderIndicator`), not in the corner HUD. Its king spoke points up at amidships and turns by `rudder × WHEEL_MAX_TURN`.
    - `updateShips` turns the ship: the target rate is `rudder × TURN_RATE × rudderBite(speed)`, and `ship.turnRate` eases toward it (`TURN_RESPONSE`), so she enters and leaves curves gradually.
    - `rudderBite` is 0 when stopped, rises with speed (`RUDDER_BITE_*`), and gives full authority from about 6 kn. At the ~1 kn `MIN_SPEED` a hard-over rudder still turns her slowly (about 21°/s), so a bad heading is recoverable, just slowly.
    - All the steering tuning is at the top of `ships.ts`.
    - Docking centres the rudder, and the enemy AI holds a fixed rudder.
  - The wind shifts every 20–45s toward a new random direction and strength, and eases toward it over about 15s (`updateWind`).
  - The wind changes in two layers, both eased:
    - The prevailing wind (`wind.prevailing`) drifts slowly. Every 2.5–5 minutes it swings up to 50°, pulled partly back toward the long-run `wind.climate` (from the north).
    - The 20–45s shifts land within 35° of the current prevailing wind and change by at most 40° at a time.
  - Map layout: Port Ashby (west, harbour facing east) and Wickham Bay (east, at the back of a cove that opens west) face each other across the open centre. With the usual northerly both are a beam reach from the centre, and however the prevailing wind drifts, at least one is reachable without beating. Check new ports and islands against the wind.
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
