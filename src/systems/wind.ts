import type { Ship, Wind } from "../types";

const DEG = Math.PI / 180;

/**
 * Square rig: ships can't make headway closer to the wind than this.
 * Real square-riggers managed ~65°; a little closer keeps it arcade-friendly.
 */
export const NO_GO = 60 * DEG;

/** How far the yards can be braced round from square across the ship. */
export const BRACE_LIMIT = 65 * DEG;

/** How far the brace can be off ideal before the sails stop drawing at all. */
const BRACE_TOLERANCE = 30 * DEG;

/** Speed multiplier by angle off the wind (degrees). Square-riggers are happiest off the wind. */
const POLAR: [number, number][] = [
  [60, 0.5],
  [75, 0.75],
  [90, 0.9],
  [120, 1],
  [150, 1],
  [180, 0.9],
];

/** One speed scale for ships and wind, so the readouts and on-screen motion agree. */
export const PX_PER_KNOT = 5;
/** Wind speed at strength 1. Ships top out around half the wind speed. */
export const WIND_MAX_KNOTS = 20;

// Wind shifts: every so often pick a new target, then ease toward it.
const SHIFT_INTERVAL_MIN = 20; // seconds
const SHIFT_INTERVAL_MAX = 45;
const MAX_SHIFT = 40 * DEG; // largest single change of direction
const STRENGTH_MIN = 0.5;
const STRENGTH_MAX = 1;
const SHIFT_EASE = 0.15; // per second; ~15s for a shift to mostly settle

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function createWind(dir: number): Wind {
  return { dir, strength: 0.8, targetDir: dir, targetStrength: 0.8, nextShift: rand(SHIFT_INTERVAL_MIN, SHIFT_INTERVAL_MAX), drift: { x: 0, y: 0 } };
}

export function updateWind(wind: Wind, dt: number): void {
  wind.nextShift -= dt;
  if (wind.nextShift <= 0) {
    wind.targetDir = wind.dir + rand(-MAX_SHIFT, MAX_SHIFT);
    wind.targetStrength = rand(STRENGTH_MIN, STRENGTH_MAX);
    wind.nextShift = rand(SHIFT_INTERVAL_MIN, SHIFT_INTERVAL_MAX);
  }
  wind.dir += angleDiff(wind.targetDir, wind.dir) * SHIFT_EASE * dt;
  wind.strength += (wind.targetStrength - wind.strength) * SHIFT_EASE * dt;

  // Integrate, rather than computing time × current wind, so a shift changes only the current motion.
  const speed = wind.strength * WIND_MAX_KNOTS * PX_PER_KNOT;
  wind.drift.x += Math.cos(wind.dir) * speed * dt;
  wind.drift.y += Math.sin(wind.dir) * speed * dt;
}

export function windKnots(wind: Wind): number {
  return wind.strength * WIND_MAX_KNOTS;
}

/** Signed difference a - b, normalised to -PI..PI. */
export function angleDiff(a: number, b: number): number {
  const d = a - b;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

/** Angle between the bow and the wind's source: 0 = head to wind, PI = dead downwind. */
export function offWindAngle(heading: number, wind: Wind): number {
  return Math.abs(angleDiff(wind.dir + Math.PI, heading));
}

/** Direction the wind blows toward, relative to the bow: positive = toward starboard. */
export function windToRelative(heading: number, wind: Wind): number {
  return angleDiff(wind.dir, heading);
}

/**
 * Best brace: the sail should face halfway between the bow and where the wind is going.
 * Brace is the angle of the sail's face from the bow (positive = toward starboard);
 * 0 means the yards are square across the ship.
 */
export function idealBrace(heading: number, wind: Wind): number {
  const half = windToRelative(heading, wind) / 2;
  return Math.max(-BRACE_LIMIT, Math.min(BRACE_LIMIT, half));
}

export function polarFactor(offWind: number): number {
  const deg = offWind / DEG;
  if (offWind < NO_GO) return 0;
  for (let i = 1; i < POLAR.length; i++) {
    const [d1, v1] = POLAR[i]!;
    if (deg <= d1) {
      const [d0, v0] = POLAR[i - 1]!;
      return v0 + ((deg - d0) / (d1 - d0)) * (v1 - v0);
    }
  }
  return POLAR[POLAR.length - 1]![1];
}

/** 1 when braced perfectly, falling to 0 as the brace gets further off. */
export function braceEfficiency(ship: Ship, wind: Wind): number {
  const err = angleDiff(ship.brace, idealBrace(ship.heading, wind)) / BRACE_TOLERANCE;
  return Math.max(0, 1 - err * err);
}

/**
 * How much the wind is filling the sail from behind: 1 = square on, 0 = edge on,
 * negative = the wind is on the front of the sail ("taken aback").
 */
export function sailFill(ship: Ship, wind: Wind): number {
  return Math.cos(angleDiff(windToRelative(ship.heading, wind), ship.brace));
}

export function pointOfSailName(offWind: number): string {
  const deg = offWind / DEG;
  if (offWind < NO_GO) return "In irons";
  if (deg < 75) return "Close-hauled";
  if (deg < 110) return "Beam reach";
  if (deg < 160) return "Broad reach";
  return "Running";
}

/** Tells the player which way to swing the yards. */
export function braceAdvice(ship: Ship, wind: Wind): string {
  if (ship.offWind < NO_GO) return "";
  if (sailFill(ship, wind) < 0) return "Taken aback!";
  const err = angleDiff(ship.brace, idealBrace(ship.heading, wind));
  if (err > BRACE_TOLERANCE / 3) return "Brace to port (←)";
  if (err < -BRACE_TOLERANCE / 3) return "Brace to starboard (→)";
  return "Drawing well";
}
