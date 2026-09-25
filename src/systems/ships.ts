import type { GameState, Ship, Vec2 } from "../types";
import { SHOT_RANGE } from "./weapons";
import { NO_GO, idealTrim, offWindAngle, polarFactor, trimEfficiency } from "./wind";

export const MAX_SPEED = 60; // px/s at full sail, perfect trim, best point of sail
const ACCEL = 0.5; // how quickly speed rises toward the sail-driven target
const DRAG = 0.4; // how quickly speed bleeds off when the target is lower
const IRONS_DRAG = 0.9; // extra-fast slowdown when pointed into the wind
const TURN_RATE = 1.0; // rad/s at full speed
const MIN_STEERAGE = 0.25; // fraction of turn rate available when dead in the water
const SAIL_RATE = 0.8; // sails set/furled per second
const TRIM_RATE = Math.PI / 3; // rad/s the sheets can be hauled or eased

export function createShip(state: GameState, team: Ship["team"], pos: Vec2, heading: number): Ship {
  return {
    id: state.nextId++,
    team,
    pos: { ...pos },
    heading,
    speed: 0,
    sails: 0.5,
    trim: Math.PI / 4,
    offWind: 0,
    sailEfficiency: 0,
    radius: 18,
    hp: 100,
    maxHp: 100,
    reload: { port: 0, starboard: 0 },
  };
}

/** turn: -1 (to port) .. 1 (to starboard). Rudder only bites with way on. */
export function steerShip(ship: Ship, turn: number, dt: number): void {
  const steerage = MIN_STEERAGE + (1 - MIN_STEERAGE) * Math.min(1, ship.speed / MAX_SPEED);
  ship.heading += turn * TURN_RATE * steerage * dt;
}

/** setDelta: +1 to raise sail, -1 to furl. trimDelta: +1 to ease out, -1 to haul in. */
export function adjustSails(ship: Ship, setDelta: number, trimDelta: number, dt: number): void {
  ship.sails = Math.min(1, Math.max(0, ship.sails + setDelta * SAIL_RATE * dt));
  ship.trim = Math.min(Math.PI / 2, Math.max(0, ship.trim + trimDelta * TRIM_RATE * dt));
}

/** Snap trim to ideal for the current heading (used by the AI). */
export function autoTrim(state: GameState, ship: Ship): void {
  ship.trim = idealTrim(offWindAngle(ship.heading, state.wind));
}

export function updateShips(state: GameState, dt: number): void {
  for (const ship of state.ships) {
    ship.offWind = offWindAngle(ship.heading, state.wind);
    ship.sailEfficiency = trimEfficiency(ship.trim, ship.offWind);

    const target = MAX_SPEED * state.wind.strength * ship.sails * polarFactor(ship.offWind) * ship.sailEfficiency;
    const rate = target > ship.speed ? ACCEL : ship.offWind < NO_GO ? IRONS_DRAG : DRAG;
    ship.speed += (target - ship.speed) * rate * dt;

    ship.pos.x += Math.cos(ship.heading) * ship.speed * dt;
    ship.pos.y += Math.sin(ship.heading) * ship.speed * dt;

    // Wrap around the screen edges.
    ship.pos.x = (ship.pos.x + state.width) % state.width;
    ship.pos.y = (ship.pos.y + state.height) % state.height;

    ship.reload.port = Math.max(0, ship.reload.port - dt);
    ship.reload.starboard = Math.max(0, ship.reload.starboard - dt);
  }
  state.ships = state.ships.filter((s) => s.hp > 0);
}

/** Placeholder enemy behaviour: sail in circles and fire when the player is abeam. */
export function updateEnemyAI(state: GameState, dt: number, fire: (ship: Ship, side: "port" | "starboard") => void): void {
  const player = state.ships.find((s) => s.team === "player");
  for (const ship of state.ships) {
    if (ship.team !== "enemy") continue;
    ship.sails = 1;
    steerShip(ship, 0.4, dt);
    autoTrim(state, ship);
    if (!player || Math.hypot(player.pos.x - ship.pos.x, player.pos.y - ship.pos.y) > SHOT_RANGE) continue;
    const angle = Math.atan2(player.pos.y - ship.pos.y, player.pos.x - ship.pos.x) - ship.heading;
    const rel = Math.atan2(Math.sin(angle), Math.cos(angle)); // normalise to -PI..PI
    if (Math.abs(rel - Math.PI / 2) < 0.2) fire(ship, "starboard");
    if (Math.abs(rel + Math.PI / 2) < 0.2) fire(ship, "port");
  }
}
