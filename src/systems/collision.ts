import type { GameState, Vec2 } from "../types";

export function circlesOverlap(a: Vec2, ar: number, b: Vec2, br: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

const PROJECTILE_RADIUS = 2;

/** Applies cannonball hits to ships and removes the balls that hit. */
export function resolveCollisions(state: GameState): void {
  state.projectiles = state.projectiles.filter((p) => {
    for (const ship of state.ships) {
      if (ship.id === p.owner) continue;
      if (circlesOverlap(p.pos, PROJECTILE_RADIUS, ship.pos, ship.radius)) {
        ship.hp -= p.damage;
        return false;
      }
    }
    return true;
  });
}
