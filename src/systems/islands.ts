import type { Island, Vec2 } from "../types";

/**
 * Fixed islands for now (no procedural generation). Positions are laid out around the world's
 * open centre, where ships spawn and fight. Adding an island is one entry here.
 *
 * Shape: coast distance at angle θ = radius × (1 + Σ amp·sin(k·θ + phase)). Low k gives broad
 * lobes (k = 2 elongates), higher k gives smaller headlands and bays. Keep Σ|amp| well under 1.
 */
export const ISLANDS: Island[] = [
  {
    id: "ashby",
    name: "Ashby Isle",
    center: { x: 1250, y: 1050 },
    radius: 230,
    harmonics: [
      [2, 0.1, 0.6],
      [3, 0.12, 2.1],
      [5, 0.05, 0.4],
    ],
  },
  {
    id: "long-cay",
    name: "Long Cay",
    center: { x: 3850, y: 2750 },
    radius: 320,
    harmonics: [
      [2, 0.3, 1.2], // long and narrow
      [3, 0.08, 0.3],
      [6, 0.04, 1.9],
    ],
  },
  {
    id: "gull-rock",
    name: "Gull Rock",
    center: { x: 3650, y: 850 },
    radius: 110,
    harmonics: [
      [3, 0.14, 0.9],
      [4, 0.06, 2.5],
    ],
  },
];

/** Distance from the island centre to its coast in direction `angle`. */
export function coastRadius(island: Island, angle: number): number {
  let f = 1;
  for (const [k, amp, phase] of island.harmonics) f += amp * Math.sin(k * angle + phase);
  return island.radius * f;
}

/** A point `offset` px out from the coast (negative = inland) in direction `angle`. */
export function coastPoint(island: Island, angle: number, offset = 0): Vec2 {
  const r = coastRadius(island, angle) + offset;
  return { x: island.center.x + Math.cos(angle) * r, y: island.center.y + Math.sin(angle) * r };
}

/** Upper bound on the island's extent, for cheap distance rejection. */
export function maxRadius(island: Island): number {
  return island.radius * (1 + island.harmonics.reduce((a, [, amp]) => a + Math.abs(amp), 0));
}

export function isOnLand(islands: Island[], p: Vec2, margin = 0): boolean {
  for (const island of islands) {
    const dx = p.x - island.center.x;
    const dy = p.y - island.center.y;
    const d = Math.hypot(dx, dy);
    if (d > maxRadius(island) + margin) continue;
    if (d < coastRadius(island, Math.atan2(dy, dx)) + margin) return true;
  }
  return false;
}

/**
 * Pushes a circle at `pos` with radius `r` out of any island it overlaps, straight away from
 * the island centre. Returns the outward direction (unit vector) of the coast it touched,
 * or null if it wasn't touching land.
 */
export function pushOutOfLand(islands: Island[], pos: Vec2, r: number): Vec2 | null {
  let touched: Vec2 | null = null;
  for (const island of islands) {
    const dx = pos.x - island.center.x;
    const dy = pos.y - island.center.y;
    const d = Math.hypot(dx, dy);
    if (d > maxRadius(island) + r) continue;
    const a = d > 1e-6 ? Math.atan2(dy, dx) : 0;
    const limit = coastRadius(island, a) + r;
    if (d < limit) {
      pos.x = island.center.x + Math.cos(a) * limit;
      pos.y = island.center.y + Math.sin(a) * limit;
      touched = { x: Math.cos(a), y: Math.sin(a) };
    }
  }
  return touched;
}
