import type { GameState, Ship, Vec2 } from "../types";
import { SHOT_RANGE } from "./weapons";
import { SINK_DURATION } from "./effects";
import { HULL, SHIP_SCALE } from "./hull";
import { BRACE_LIMIT, NO_GO, PX_PER_KNOT, WIND_MAX_KNOTS, braceEfficiency, idealBrace, offWindAngle, polarFactor } from "./wind";

export const MAX_SPEED = 60; // px/s at full sail, perfect brace, best point of sail
const ACCEL = 0.5; // how quickly speed rises toward the sail-driven target
const DRAG = 0.4; // how quickly speed bleeds off when the target is lower
const IRONS_DRAG = 0.9; // extra-fast slowdown when pointed into the wind
const TURN_RATE = 1.0; // rad/s at full speed
// Arcade tuning: rudder needs way on, but a nearly stopped ship can pivot to recover.
const MIN_STEERAGE = 0.6; // fraction of turn rate from the rudder alone at zero speed
const LOW_SPEED_STEERAGE = 1.0; // pivot boost when barely moving, so a bad heading is recoverable
const PIVOT_FULL_BELOW = 0.2; // fraction of MAX_SPEED: full pivot boost below this
const PIVOT_GONE_ABOVE = 0.4; // ...fading to nothing by this
const MIN_SPEED = 5; // px/s (~1 kn); ships never fully stop, even in irons
const SAIL_RATE = 0.8; // sails set/furled per second
const BRACE_RATE = Math.PI / 2; // rad/s the crew can swing the yards

export function createShip(state: GameState, team: Ship["team"], pos: Vec2, heading: number): Ship {
  return {
    id: state.nextId++,
    team,
    pos: { ...pos },
    heading,
    speed: 0,
    sails: 0.5,
    brace: 0,
    offWind: 0,
    sailEfficiency: 0,
    radius: HULL.radius * SHIP_SCALE,
    hp: 100,
    maxHp: 100,
    reload: { port: 0, starboard: 0 },
    wakeDistance: 0,
    jolt: { x: 0, y: 0 },
    joltSpin: 0,
    sinkAge: null,
    listSide: 1,
    sinkSpin: 0,
    smokeTimer: 0,
    pendingShots: [],
  };
}

/** turn: -1 (to port) .. 1 (to starboard). */
export function steerShip(ship: Ship, turn: number, dt: number): void {
  if (ship.sinkAge !== null) return;
  const r = Math.min(1, ship.speed / MAX_SPEED);
  const rudder = MIN_STEERAGE + (1 - MIN_STEERAGE) * r;
  const fade = (PIVOT_GONE_ABOVE - r) / (PIVOT_GONE_ABOVE - PIVOT_FULL_BELOW);
  const pivot = LOW_SPEED_STEERAGE * Math.min(1, Math.max(0, fade));
  const steerage = Math.max(rudder, pivot);
  ship.heading += turn * TURN_RATE * steerage * dt;
}

/** setDelta: +1 to raise sail, -1 to furl. braceDelta: +1 swings the yards toward starboard, -1 toward port. */
export function adjustSails(ship: Ship, setDelta: number, braceDelta: number, dt: number): void {
  if (ship.sinkAge !== null) return;
  ship.sails = Math.min(1, Math.max(0, ship.sails + setDelta * SAIL_RATE * dt));
  ship.brace = Math.min(BRACE_LIMIT, Math.max(-BRACE_LIMIT, ship.brace + braceDelta * BRACE_RATE * dt));
}

/** Snap the yards to the ideal brace for the current heading (used by the AI). */
export function autoBrace(state: GameState, ship: Ship): void {
  ship.brace = idealBrace(ship.heading, state.wind);
}

/** A ship at 0 HP is disabled and starts going down; it's removed after SINK_DURATION. */
export function startSinking(ship: Ship): void {
  if (ship.sinkAge !== null) return;
  ship.sinkAge = 0;
  ship.listSide = Math.random() < 0.5 ? -1 : 1;
  ship.sinkSpin = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2);
}

const SINK_DRAG = 0.8; // how quickly a wreck loses way
const WRECK_DRIFT = 0.04; // fraction of wind speed a wreck is pushed downwind

export function updateShips(state: GameState, dt: number): void {
  for (const ship of state.ships) {
    if (ship.sinkAge !== null) {
      // Disabled: coast to a stop, slowly turn, and drift a little with the wind.
      ship.sinkAge += dt;
      ship.speed *= Math.exp(-SINK_DRAG * dt);
      ship.heading += ship.sinkSpin * dt;
      ship.sinkSpin *= Math.exp(-0.3 * dt);
      const drift = state.wind.strength * WIND_MAX_KNOTS * PX_PER_KNOT * WRECK_DRIFT;
      ship.pos.x += (Math.cos(ship.heading) * ship.speed + Math.cos(state.wind.dir) * drift) * dt;
      ship.pos.y += (Math.sin(ship.heading) * ship.speed + Math.sin(state.wind.dir) * drift) * dt;
      continue;
    }

    ship.offWind = offWindAngle(ship.heading, state.wind);
    ship.sailEfficiency = braceEfficiency(ship, state.wind);

    const target = MAX_SPEED * state.wind.strength * ship.sails * polarFactor(ship.offWind) * ship.sailEfficiency;
    const rate = target > ship.speed ? ACCEL : ship.offWind < NO_GO ? IRONS_DRAG : DRAG;
    ship.speed += (target - ship.speed) * rate * dt;
    ship.speed = Math.max(MIN_SPEED, ship.speed);

    ship.pos.x += Math.cos(ship.heading) * ship.speed * dt;
    ship.pos.y += Math.sin(ship.heading) * ship.speed * dt;

    // Keep ships inside the world.
    ship.pos.x = Math.min(state.world.width - ship.radius, Math.max(ship.radius, ship.pos.x));
    ship.pos.y = Math.min(state.world.height - ship.radius, Math.max(ship.radius, ship.pos.y));

    ship.reload.port = Math.max(0, ship.reload.port - dt);
    ship.reload.starboard = Math.max(0, ship.reload.starboard - dt);
  }
  state.ships = state.ships.filter((s) => s.sinkAge === null || s.sinkAge < SINK_DURATION);
}

/** Placeholder enemy behaviour: sail in circles and fire when the player is abeam. */
export function updateEnemyAI(state: GameState, dt: number, fire: (ship: Ship, side: "port" | "starboard") => void): void {
  const player = state.ships.find((s) => s.team === "player" && s.sinkAge === null);
  for (const ship of state.ships) {
    if (ship.team !== "enemy" || ship.sinkAge !== null) continue;
    ship.sails = 1;
    steerShip(ship, 0.4, dt);
    autoBrace(state, ship);
    if (!player || Math.hypot(player.pos.x - ship.pos.x, player.pos.y - ship.pos.y) > SHOT_RANGE) continue;
    const angle = Math.atan2(player.pos.y - ship.pos.y, player.pos.x - ship.pos.x) - ship.heading;
    const rel = Math.atan2(Math.sin(angle), Math.cos(angle)); // normalise to -PI..PI
    if (Math.abs(rel - Math.PI / 2) < 0.2) fire(ship, "starboard");
    if (Math.abs(rel + Math.PI / 2) < 0.2) fire(ship, "port");
  }
}
