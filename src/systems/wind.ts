import type { Ship, Wind } from "../types";

const DEG = Math.PI / 180;

/** Ships can't make headway closer to the wind than this. */
export const NO_GO = 45 * DEG;

/** How far the trim can be off ideal before the sails stop drawing at all. */
const TRIM_TOLERANCE = 30 * DEG;

/** Speed multiplier by angle off the wind (degrees). Beam and broad reaches are fastest. */
const POLAR: [number, number][] = [
  [45, 0.5],
  [60, 0.75],
  [90, 1],
  [120, 1],
  [150, 0.9],
  [180, 0.75],
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

/** Where the wind comes from relative to the bow: positive = starboard side. */
export function windFromRelative(heading: number, wind: Wind): number {
  return angleDiff(wind.dir + Math.PI, heading);
}

/** Angle between the bow and the wind's source: 0 = head to wind, PI = dead downwind. */
export function offWindAngle(heading: number, wind: Wind): number {
  return Math.abs(windFromRelative(heading, wind));
}

/** Best sail trim for a point of sail: sheeted in close-hauled, fully out when running. */
export function idealTrim(offWind: number): number {
  if (offWind < NO_GO) return 0;
  return 10 * DEG + (offWind - NO_GO) * (80 / 135);
}

export function polarFactor(offWind: number): number {
  const deg = offWind / DEG;
  if (deg < 45) return 0;
  for (let i = 1; i < POLAR.length; i++) {
    const [d1, v1] = POLAR[i]!;
    if (deg <= d1) {
      const [d0, v0] = POLAR[i - 1]!;
      return v0 + ((deg - d0) / (d1 - d0)) * (v1 - v0);
    }
  }
  return POLAR[POLAR.length - 1]![1];
}

/** 1 when trimmed perfectly, falling to 0 when luffing (too loose) or stalled (too tight). */
export function trimEfficiency(trim: number, offWind: number): number {
  const err = (trim - idealTrim(offWind)) / TRIM_TOLERANCE;
  return Math.max(0, 1 - err * err);
}

export function pointOfSailName(offWind: number): string {
  const deg = offWind / DEG;
  if (deg < 45) return "In irons";
  if (deg < 70) return "Close-hauled";
  if (deg < 110) return "Beam reach";
  if (deg < 160) return "Broad reach";
  return "Running";
}

/** Describes whether the player should haul in or ease the sails. */
export function trimAdvice(ship: Ship): string {
  if (ship.offWind < NO_GO) return "";
  const err = ship.trim - idealTrim(ship.offWind);
  if (err > TRIM_TOLERANCE / 3) return "Luffing: haul in";
  if (err < -TRIM_TOLERANCE / 3) return "Overtrimmed: ease out";
  return "Drawing well";
}
