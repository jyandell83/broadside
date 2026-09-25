import type { GameState, Vec2 } from "../types";
import { cannonImpact, landImpact } from "./effects";
import { isOnLand } from "./islands";
import { startSinking } from "./ships";

export function circlesOverlap(a: Vec2, ar: number, b: Vec2, br: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

const PROJECTILE_RADIUS = 2;

/** Applies cannonball hits to ships and land, removing the balls that hit. Sinking wrecks can't be hit. */
export function resolveCollisions(state: GameState): void {
  state.projectiles = state.projectiles.filter((p) => {
    if (isOnLand(state.islands, p.pos)) {
      landImpact(state, p.pos); // balls stop on land rather than flying through islands
      return false;
    }
    for (const ship of state.ships) {
      if (ship.id === p.owner || ship.sinkAge !== null) continue;
      if (circlesOverlap(p.pos, PROJECTILE_RADIUS, ship.pos, ship.radius)) {
        ship.hp -= p.damage;
        const fatal = ship.hp <= 0;
        cannonImpact(state, ship, p.pos, p.vel, fatal);
        if (fatal) startSinking(ship);
        return false;
      }
    }
    return true;
  });
}
