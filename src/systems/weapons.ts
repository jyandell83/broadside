import type { GameState, Ship, Side } from "../types";

const RELOAD_TIME = 2.5; // seconds
const GUNS_PER_SIDE = 3;
const SHOT_SPEED = 260; // px/s
const SHOT_LIFE = 1.4; // seconds
const SHOT_DAMAGE = 10;
const SPREAD = 0.08; // radians of random scatter

export function fireBroadside(state: GameState, ship: Ship, side: Side): void {
  if (ship.reload[side] > 0) return;
  ship.reload[side] = RELOAD_TIME;

  // Starboard is to the right of the heading (+PI/2 in screen space, y down).
  const dir = ship.heading + (side === "starboard" ? Math.PI / 2 : -Math.PI / 2);
  const fx = Math.cos(ship.heading);
  const fy = Math.sin(ship.heading);

  for (let i = 0; i < GUNS_PER_SIDE; i++) {
    const offset = (i - (GUNS_PER_SIDE - 1) / 2) * 10; // spread guns along the hull
    const a = dir + (Math.random() - 0.5) * SPREAD;
    state.projectiles.push({
      pos: { x: ship.pos.x + fx * offset, y: ship.pos.y + fy * offset },
      // Shots inherit the ship's velocity.
      vel: {
        x: Math.cos(a) * SHOT_SPEED + fx * ship.speed,
        y: Math.sin(a) * SHOT_SPEED + fy * ship.speed,
      },
      life: SHOT_LIFE,
      owner: ship.id,
      damage: SHOT_DAMAGE,
    });
  }
}

export function updateProjectiles(state: GameState, dt: number): void {
  for (const p of state.projectiles) {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.life -= dt;
  }
  state.projectiles = state.projectiles.filter((p) => p.life > 0);
}
