import type { Ship, Wind } from "../types";

const DEG = Math.PI / 180;

/**
 * Square rig: ships can't make headway closer to the wind than this. Real square-riggers
 * managed ~65°; 55° (tuned in play) makes beating upwind less of a slog, with quicker tacks
 * through a 110° dead zone. If you change it, keep POLAR's first row at the same angle and
 * BRACE_LIMIT at least (180° − NO_GO) / 2.
 */
export const NO_GO = 55 * DEG;

/**
 * How far the yards can be braced round from square across the ship. The ideal brace
 * close-hauled is (180° − NO_GO) / 2 (62.5° at 55°), so this must be at least that.
 */
export const BRACE_LIMIT = 65 * DEG;

/** How far the brace can be off ideal before the sails stop drawing at all. */
const BRACE_TOLERANCE = 30 * DEG;

/**
 * Speed multiplier by angle off the wind (degrees). Square-riggers are happiest off the wind.
 * The first row sits at NO_GO; closer to the wind than that there's no drive at all.
 */
const POLAR: [number, number][] = [
  [55, 0.42],
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

// Two layers of wind change, both eased so nothing is sudden:
// 1. The prevailing wind drifts slowly: every few minutes it picks a new direction up to
//    PREVAILING_STEP away (pulled partly back toward the climate) and eases there over ~a minute.
//    So there are long stretches of one prevailing wind, and occasionally a shift big enough to
//    change the best route, without it circling the compass.
// 2. Every 20–45s the wind shifts to within LOCAL_SPREAD of the current prevailing wind.
const PREVAILING_INTERVAL_MIN = 150; // seconds
const PREVAILING_INTERVAL_MAX = 300;
const PREVAILING_STEP = 50 * DEG; // largest single swing of the prevailing wind
const PREVAILING_PULL = 0.3; // fraction of the way back toward the climate added to each swing
const PREVAILING_EASE = 0.02; // per second; a swing mostly settles over ~1–2 minutes
const SHIFT_INTERVAL_MIN = 20; // seconds
const SHIFT_INTERVAL_MAX = 45;
const LOCAL_SPREAD = 35 * DEG; // short-term shifts land within this of the prevailing wind
const MAX_SHIFT = 40 * DEG; // largest single short-term change of direction
const STRENGTH_MIN = 0.5;
const STRENGTH_MAX = 1;
const SHIFT_EASE = 0.15; // per second; ~15s for a shift to mostly settle

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** `climate` is where the wind blows toward in the long run; the game starts with it prevailing. */
export function createWind(climate: number): Wind {
  return {
    dir: climate,
    climate,
    prevailing: climate,
    prevailingTarget: climate,
    nextPrevailingShift: rand(PREVAILING_INTERVAL_MIN, PREVAILING_INTERVAL_MAX),
    strength: 0.8,
    targetDir: climate,
    targetStrength: 0.8,
    nextShift: rand(SHIFT_INTERVAL_MIN, SHIFT_INTERVAL_MAX),
    drift: { x: 0, y: 0 },
  };
}

export function updateWind(wind: Wind, dt: number): void {
  wind.nextPrevailingShift -= dt;
  if (wind.nextPrevailingShift <= 0) {
    const pull = angleDiff(wind.climate, wind.prevailing) * PREVAILING_PULL;
    const step = Math.max(
      -PREVAILING_STEP,
      Math.min(PREVAILING_STEP, rand(-PREVAILING_STEP, PREVAILING_STEP) + pull),
    );
    wind.prevailingTarget = wind.prevailing + step;
    wind.nextPrevailingShift = rand(
      PREVAILING_INTERVAL_MIN,
      PREVAILING_INTERVAL_MAX,
    );
  }
  wind.prevailing +=
    angleDiff(wind.prevailingTarget, wind.prevailing) * PREVAILING_EASE * dt;

  wind.nextShift -= dt;
  if (wind.nextShift <= 0) {
    // New direction near the current prevailing wind, and no more than MAX_SHIFT from now.
    const candidate = wind.prevailing + rand(-LOCAL_SPREAD, LOCAL_SPREAD);
    const change = Math.max(
      -MAX_SHIFT,
      Math.min(MAX_SHIFT, angleDiff(candidate, wind.dir)),
    );
    wind.targetDir = wind.dir + change;
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
  const err =
    angleDiff(ship.brace, idealBrace(ship.heading, wind)) / BRACE_TOLERANCE;
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
