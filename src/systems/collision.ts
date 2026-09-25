import type { GameState, Vec2 } from "../types";

export function circlesOverlap(a: Vec2, ar: number, b: Vec2, br: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

const PROJECTILE_RADIUS = 2;

export function resolveCollisions(state: GameState): void {
  for (const p of state.projectiles) {
    for (const ship of state.ships) {
      if (ship.id === p.owner) continue;
      if (circlesOverlap(p.pos, PROJECTILE_RADIUS, ship.pos, ship.radius)) {
        ship.hp -= p.damage;
        p.life = 0; // consumed; removed on the next projectile update
        break;
      }
    }
  }
}
