import type { GameState, Ship, Side } from "../types";
import { muzzleBlast } from "./effects";
import { HULL, shipToWorld } from "./hull";

const RELOAD_TIME = 2.5; // seconds
const GUNS_PER_SIDE = 3;
const SHOT_SPEED = 260; // px/s
// Effective range: roughly point-blank range for an age-of-sail long gun (~400 yd).
// At this game's scale a ~50 yd frigate is ~40px, so 1 yd ≈ 0.8px.
export const SHOT_RANGE = 320; // px
const RANGE_SCATTER = 0.1; // ± fraction, so a broadside's splashes don't land in a line
const SHOT_DAMAGE = 10;
const SPREAD = 0.08; // radians of random scatter
export const SPLASH_DURATION = 0.7; // seconds

export const STARTING_CANNONBALLS = 100; // every ship puts to sea with this many
export const LOW_CANNONBALLS = GUNS_PER_SIDE * 5; // HUD warns below five full broadsides
const GUN_SPACING = 10; // base units between guns along the hull
const RIPPLE_DELAY = 0.07; // seconds between guns in a broadside, fired bow to stern
const RIPPLE_JITTER = 0.015; // ± seconds, so the rhythm isn't mechanical

/** Cannonballs aboard that aren't already set aside for guns waiting to fire. */
export function cannonballsFree(ship: Ship): number {
  return (ship.supplies.cannonballs ?? 0) - ship.pendingShots.length;
}

/**
 * Starts a broadside: reload begins now, and the guns fire in quick succession (see updateGuns).
 * Only as many guns fire as there are cannonballs to load them, bow first; with none, nothing
 * fires and the reload doesn't start.
 */
export function fireBroadside(ship: Ship, side: Side): void {
  if (ship.reload[side] > 0 || ship.sinkAge !== null || ship.docked) return;
  const guns = Math.min(GUNS_PER_SIDE, cannonballsFree(ship));
  if (guns <= 0) return;
  ship.reload[side] = RELOAD_TIME;
  for (let i = 0; i < guns; i++) {
    const delay = i === 0 ? 0 : i * RIPPLE_DELAY + (Math.random() - 0.5) * 2 * RIPPLE_JITTER;
    ship.pendingShots.push({ side, gun: i, delay });
  }
}

/** Fires queued guns whose delay has run out. A ship that starts sinking loses its unfired guns. */
export function updateGuns(state: GameState, dt: number): void {
  for (const ship of state.ships) {
    if (ship.sinkAge !== null) {
      ship.pendingShots = [];
      continue;
    }
    for (const shot of ship.pendingShots) {
      shot.delay -= dt;
      if (shot.delay <= 0) fireGun(state, ship, shot.side, shot.gun);
    }
    ship.pendingShots = ship.pendingShots.filter((shot) => shot.delay > 0);
  }
}

/** One gun: the ball leaves from its port on the hull side, using the ship's current position. */
function fireGun(state: GameState, ship: Ship, side: Side, gun: number): void {
  const balls = ship.supplies.cannonballs ?? 0;
  if (balls <= 0) return; // fireBroadside only queues loaded guns; this is a safety net
  ship.supplies.cannonballs = balls - 1;
  // Starboard is to the right of the heading (+PI/2 in screen space, y down).
  const sideSign = side === "starboard" ? 1 : -1;
  const dir = ship.heading + sideSign * (Math.PI / 2);
  const fx = Math.cos(ship.heading);
  const fy = Math.sin(ship.heading);
  const along = ((GUNS_PER_SIDE - 1) / 2 - gun) * GUN_SPACING; // gun 0 nearest the bow
  const port = shipToWorld(ship, along, sideSign * HULL.halfBeam);

  const a = dir + (Math.random() - 0.5) * SPREAD;
  const life = (SHOT_RANGE / SHOT_SPEED) * (1 + (Math.random() - 0.5) * 2 * RANGE_SCATTER);
  state.projectiles.push({
    pos: port,
    // Shots inherit the ship's velocity.
    vel: {
      x: Math.cos(a) * SHOT_SPEED + fx * ship.speed,
      y: Math.sin(a) * SHOT_SPEED + fy * ship.speed,
    },
    life,
    maxLife: life,
    owner: ship.id,
    damage: SHOT_DAMAGE,
  });
  muzzleBlast(state, ship, port, { x: Math.cos(dir), y: Math.sin(dir) });
}

/** Moves shots; any that run out of range fall into the sea with a splash. */
export function updateProjectiles(state: GameState, dt: number): void {
  for (const p of state.projectiles) {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.life -= dt;
    if (p.life <= 0) state.splashes.push({ pos: { ...p.pos }, age: 0 });
  }
  state.projectiles = state.projectiles.filter((p) => p.life > 0);
}

export function updateSplashes(state: GameState, dt: number): void {
  for (const s of state.splashes) s.age += dt;
  state.splashes = state.splashes.filter((s) => s.age < SPLASH_DURATION);
}
