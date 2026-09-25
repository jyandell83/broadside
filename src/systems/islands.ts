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
    // West of the open centre, harbour facing east. With the usual northerly the run to and from
    // Port Ashby is a beam reach. ~750px of sea room to the west, ~1,600px north and south.
    center: { x: 1050, y: 1875 },
    radius: 230,
    harmonics: [
      [2, 0.1, 0.6],
      [3, 0.12, 2.1],
      [5, 0.05, 0.4],
    ],
  },
  // Wickham: a landmass curled round a sheltered cove, built from overlapping blobs. The cove
  // opens west toward the open centre (a beam reach in with the usual northerly) through a
  // ~240px entrance between two headlands, widening to ~450px inside, with Wickham Bay's pier
  // at the back. ~400px of sea to Long Cay, ~575px to Gull Rock, ~280px to the east edge.
  ...wickhamBlobs([
    ["back", 4530, 1760, 155, [[2, 0.08, 0.4], [3, 0.1, 1.9], [5, 0.04, 0.7]]],
    ["ne", 4440, 1505, 150, [[2, 0.1, 2.2], [3, 0.08, 0.5], [4, 0.05, 1.3]]],
    ["n", 4255, 1420, 128, [[2, 0.12, 1.1], [3, 0.07, 2.6]]],
    ["ntip", 4120, 1560, 98, [[2, 0.14, 0.2], [3, 0.08, 1.7]]], // north headland
    ["se", 4430, 2015, 150, [[2, 0.09, 1.6], [3, 0.1, 0.9], [5, 0.04, 2.4]]],
    ["s", 4245, 2090, 122, [[2, 0.13, 0.5], [3, 0.08, 2.9]]],
    ["stip", 4075, 1985, 88, [[2, 0.12, 2.7], [3, 0.09, 0.4]]], // south headland
    // Smaller fillers in the notches between the big blobs, to smooth the coastline. Set a little
    // outward so they don't narrow the cove or its entrance.
    ["f1", 4182, 1478, 72, [[2, 0.08, 1.4], [3, 0.05, 0.3]]],
    ["f2", 4351, 1444, 86, [[2, 0.07, 2.9], [3, 0.05, 1.1]]],
    ["f3", 4500, 1622, 95, [[2, 0.07, 0.8], [3, 0.05, 2.2]]],
    ["f4", 4495, 1896, 95, [[2, 0.07, 1.9], [3, 0.05, 0.6]]],
    ["f5", 4340, 2070, 86, [[2, 0.07, 0.2], [3, 0.05, 2.7]]],
    ["f6", 4156, 2049, 70, [[2, 0.08, 2.3], [3, 0.05, 1.5]]],
    // Small ones set into the remaining sharp corners.
    ["c1", 4224, 1512, 40, [[2, 0.06, 0.9]]], // under the north headland, inside the cove
    ["c2", 4402, 1628, 42, [[2, 0.06, 2.1]]], // back of the cove, north of the pier
    ["c3", 4416, 1866, 42, [[2, 0.06, 1.3]]], // back of the cove, south of the pier
    ["c4", 4560, 1580, 46, [[2, 0.06, 0.4]]], // east coast
    ["c5", 4556, 1946, 46, [[2, 0.06, 2.6]]], // east coast
  ]),
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

function wickhamBlobs(blobs: [string, number, number, number, Island["harmonics"]][]): Island[] {
  return blobs.map(([part, x, y, radius, harmonics]) => ({
    id: `wickham-${part}`,
    name: "Wickham",
    landmass: "wickham",
    center: { x, y },
    radius,
    harmonics,
  }));
}

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
 * the island centre. Returns the outward direction (unit vector) of the land it touched, or null
 * if it wasn't touching land. In a corner where blobs meet, that's the combined direction out of
 * the corner, not just the last blob's.
 */
export function pushOutOfLand(islands: Island[], pos: Vec2, r: number): Vec2 | null {
  // A few passes: where blobs of one landmass meet, pushing out of one can land in the next.
  let sx = 0;
  let sy = 0;
  for (let pass = 0; pass < 3; pass++) {
    const shore = pushOutOnce(islands, pos, r);
    if (!shore) break;
    sx += shore.x;
    sy += shore.y;
  }
  const len = Math.hypot(sx, sy);
  return len > 1e-6 ? { x: sx / len, y: sy / len } : null;
}

function pushOutOnce(islands: Island[], pos: Vec2, r: number): Vec2 | null {
  let hit = false;
  let nx = 0;
  let ny = 0;
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
      hit = true;
      nx += Math.cos(a);
      ny += Math.sin(a);
    }
  }
  return hit ? { x: nx, y: ny } : null;
}
