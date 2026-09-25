import type { GameState } from "../types";
import { MAX_SPEED } from "./ships";

// All visual: the wake never affects gameplay.
const PUFF_SPACING = 4; // px sailed between wake puffs; close enough that puffs blend into a band
const STERN_OFFSET = 17; // px behind the ship's centre
const ARM_LIFE = 3.2; // seconds the V-shaped wake arms last
const CENTRE_LIFE = 1.8; // seconds the churned water directly astern lasts
const ARM_SPREAD = 0.5; // sideways spread speed as a fraction of ship speed
const SPREAD_DAMPING = 0.8; // per second; the spread slows so the wake settles in place
const MAX_PARTICLES = 1200;

/** Lays foam behind moving ships and ages it. Faster ships lay denser, brighter, wider wakes. */
export function updateWake(state: GameState, dt: number): void {
  for (const ship of state.ships) {
    ship.wakeDistance += ship.speed * dt;
    const s = Math.min(1, ship.speed / MAX_SPEED);
    const fx = Math.cos(ship.heading);
    const fy = Math.sin(ship.heading);
    const sternX = ship.pos.x - fx * STERN_OFFSET;
    const sternY = ship.pos.y - fy * STERN_OFFSET;

    while (ship.wakeDistance >= PUFF_SPACING) {
      ship.wakeDistance -= PUFF_SPACING;
      const jitter = () => (Math.random() - 0.5) * 3;
      // Two arms spreading out to either side (starboard perpendicular is (-fy, fx)).
      for (const side of [-1, 1]) {
        const spread = ship.speed * ARM_SPREAD;
        state.wake.push({
          pos: { x: sternX + side * -fy * 5 + jitter(), y: sternY + side * fx * 5 + jitter() },
          vel: { x: side * -fy * spread, y: side * fx * spread },
          age: 0,
          life: ARM_LIFE * (0.5 + 0.5 * s),
          strength: 0.08 + 0.22 * s,
          size: 1.8 + 1.7 * s,
        });
      }
      // Churned water straight astern.
      state.wake.push({
        pos: { x: sternX + jitter(), y: sternY + jitter() },
        vel: { x: 0, y: 0 },
        age: 0,
        life: CENTRE_LIFE * (0.5 + 0.5 * s),
        strength: 0.06 + 0.18 * s,
        size: 2.5 + 2.5 * s,
      });
    }
  }

  const damp = Math.exp(-SPREAD_DAMPING * dt);
  for (const p of state.wake) {
    p.age += dt;
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.vel.x *= damp;
    p.vel.y *= damp;
  }
  state.wake = state.wake.filter((p) => p.age < p.life);
  if (state.wake.length > MAX_PARTICLES) state.wake.splice(0, state.wake.length - MAX_PARTICLES);
}
