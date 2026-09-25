import type { GameState, Ship, Side } from "../types";

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

export function fireBroadside(state: GameState, ship: Ship, side: Side): void {
  if (ship.reload[side] > 0 || ship.sinkAge !== null) return;
  ship.reload[side] = RELOAD_TIME;

  // Starboard is to the right of the heading (+PI/2 in screen space, y down).
  const dir = ship.heading + (side === "starboard" ? Math.PI / 2 : -Math.PI / 2);
  const fx = Math.cos(ship.heading);
  const fy = Math.sin(ship.heading);

  for (let i = 0; i < GUNS_PER_SIDE; i++) {
    const offset = (i - (GUNS_PER_SIDE - 1) / 2) * 10; // spread guns along the hull
    const a = dir + (Math.random() - 0.5) * SPREAD;
    const life = (SHOT_RANGE / SHOT_SPEED) * (1 + (Math.random() - 0.5) * 2 * RANGE_SCATTER);
    state.projectiles.push({
      pos: { x: ship.pos.x + fx * offset, y: ship.pos.y + fy * offset },
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
  }
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
