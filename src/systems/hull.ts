import type { Ship, Vec2 } from "../types";

/**
 * Ship size, as a tuning knob. Everything ship-shaped is defined below in "base units" (the
 * original 1x size) and scaled by this: the renderer applies it once in the ship's transform,
 * and anything placed in the world goes through shipToWorld/worldToShip, which apply it too.
 */
export const SHIP_SCALE = 1.25;

/** Hull dimensions in base units (ship-local: +x toward the bow, +y toward starboard). */
export const HULL = {
  bow: 22,
  stern: -18,
  halfBeam: 7,
  radius: 18, // collision circle
} as const;

/** Ship-local base units → world position. */
export function shipToWorld(ship: Ship, lx: number, ly: number): Vec2 {
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  const x = lx * SHIP_SCALE;
  const y = ly * SHIP_SCALE;
  return { x: ship.pos.x + c * x - s * y, y: ship.pos.y + s * x + c * y };
}

/** World position → ship-local base units. */
export function worldToShip(ship: Ship, p: Vec2): Vec2 {
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  const dx = p.x - ship.pos.x;
  const dy = p.y - ship.pos.y;
  return { x: (dx * c + dy * s) / SHIP_SCALE, y: (-dx * s + dy * c) / SHIP_SCALE };
}
