/**
 * SHIP HANDLING TUNING
 *
 * Every hand-tunable value for how ships sail and steer lives here. With `npm run dev`, save this
 * file and the game reloads with the new values.
 *
 * Units:
 * - Speeds are px/s (5 px/s = 1 knot; top speed 60 px/s = 12 kn).
 * - Angles are written in degrees (the `* DEG` converts them).
 * - "per second" rates are how much changes each second; bigger = faster.
 *
 * Some values depend on each other. `checkTuning()` (bottom of this file) runs at startup and
 * prints a warning in the browser console if an edit breaks one of those rules.
 *
 * Not here: weather (wind shifts, in systems/wind.ts), docking (systems/ships.ts), combat
 * (systems/weapons.ts).
 */

const DEG = Math.PI / 180;

// ───────────────────────── SPEED ─────────────────────────

// Top speed in px/s: full sail, yards braced perfectly, best angle to the wind, full wind.
// Everything else about speed is a fraction of this. 60 = 12 kn.
export const MAX_SPEED = 60;

// How quickly the ship speeds up toward the speed the wind can give her (per second).
// Higher = picks up speed faster after a turn or a stall.
export const ACCEL = 0.5;

// How quickly the ship slows down when the wind gives her less than her current speed
// (per second): after bearing into a slower angle, furling sail, or bad bracing.
export const DRAG = 0.4;

// How quickly the ship slows while pointed inside the no-go zone (per second). She gets no
// drive there either way; this only sets how fast she coasts to a stop. Equal to DRAG means
// no extra penalty for turning through the wind; higher punishes tacking harder.
export const IRONS_DRAG = 0.4;

// The slowest a ship ever goes, in px/s (5 = 1 kn), even in irons. Keeps a little way on so the
// rudder always has some bite and a stalled ship can always be steered out.
export const MIN_SPEED = 9; //raising from 5

// How fast W/S raise or furl the sails (fraction of full sail per second). 0.8 = empty to full
// in about 1.25s.
export const SAIL_RATE = 0.8;

// ───────────────────────── STEERING (RUDDER) ─────────────────────────

// Turn rate at full rudder once the ship has full rudder bite, in radians per second
// (1.0 ≈ 57°/s). Higher = tighter, faster turns at speed.
export const TURN_RATE = 1.0;

// How fast holding A/D moves the rudder (per second). 0.5 = amidships to hard over in 2s.
// Lower = more deliberate steering and finer small corrections; higher = snappier.
export const RUDDER_RATE = 0.5;

// Hard over: the rudder's range is ±RUDDER_MAX. Rarely needs changing; turn strength is
// TURN_RATE.
export const RUDDER_MAX = 1;

// How quickly the ship's actual turn catches up with what the rudder asks for (per second).
// Lower = heavier, the ship eases into and out of turns; higher = the turn follows the rudder
// almost immediately.
export const TURN_RESPONSE = 1.5;

// Rudder bite: how much the rudder can turn the ship at a given speed. Below
// RUDDER_BITE_MIN_SPEED (px/s) the rudder does nothing; from RUDDER_BITE_FULL_SPEED (px/s) up
// it has full effect. In between, RUDDER_BITE_CURVE shapes the ramp: 1 = straight line,
// below 1 = more bite at low speed (0.5 gives ~37% at the 1 kn minimum), above 1 = less.
// More low-speed bite means a slow ship pivots more; less means she needs way on to turn.
export const RUDDER_BITE_MIN_SPEED = 1;
export const RUDDER_BITE_FULL_SPEED = 30; // ~6 kn
export const RUDDER_BITE_CURVE = 0.5;

// Assisted centring: with A/D released, the rudder drifts back toward amidships at this rate
// (per second). 0.6 = hard over back to centre in about 1.7s. Higher = the ship straightens
// quickly after you let go (less overshoot); lower = she holds her arc longer. 0 = the rudder
// stays wherever you leave it.
export const RUDDER_RETURN_RATE = 0.0; //was 0.6 testing none

// Centre snap: moving toward amidships (by key or by the assisted return), once the rudder is
// within this much of 0 it snaps to exactly 0. Bigger = easier to land on centre.
export const RUDDER_CENTER_SNAP = 0.05; //lowering from 0.8

// After snapping to centre while a key is still held, the rudder rests there this many seconds
// before carrying on to the other side. Makes a tap stop at centre; 0 = no pause.
export const RUDDER_CENTER_DETENT = 0.15;

// ───────────────────────── SAILS & WIND ANGLE ─────────────────────────

// The no-go zone: pointing closer to the wind than this angle gives no drive at all. Real
// square-riggers managed ~65°. Must match POLAR's first row, and BRACE_LIMIT must be at least
// (180° − NO_GO) / 2.
export const NO_GO = 55 * DEG;

// Drive at each angle off the wind, as [degrees, fraction of MAX_SPEED]. Straight lines are
// drawn between rows. The first row must be at NO_GO; the last must be 180 (dead downwind).
// Raise a row to make that point of sail faster.
export const POLAR: [number, number][] = [
  [55, 0.42], // close-hauled, right at the edge of the no-go zone
  [60, 0.5],
  [75, 0.75],
  [90, 0.9], // beam reach: wind straight across the ship
  [120, 1], // broad reach: the fastest angles
  [150, 1],
  [180, 0.9], // running dead downwind
];

// How far the yards (←/→) can swing from square across the ship. Must be at least
// (180° − NO_GO) / 2, or the sails can't be set right when close-hauled.
export const BRACE_LIMIT = 65 * DEG;

// How far the yards can be off their ideal angle before the sails stop drawing. Drive falls
// smoothly from full (on ideal) to none (this far off). Bigger = more forgiving: the ship keeps
// drive through turns you haven't re-braced for.
export const BRACE_TOLERANCE = 60 * DEG;

// How fast ←/→ swing the yards, in degrees per second.
export const BRACE_RATE = 90 * DEG;

// Speed bonus for sailing well, in knots at best: on the fastest angles (POLAR at 1.0) with the
// yards braced right and full sail. 0 turns it off.
export const SAILING_BONUS_KNOTS = 1;

// Where the bonus starts fading in, as a POLAR drive fraction: it grows from nothing here to
// full at 1.0. Lower = the bonus reaches further toward the beam reach and running.
export const SAILING_BONUS_FROM = 0.85;

// ───────────────────────── SHORE CONTACT ─────────────────────────

// Speed lost per second while pressed head-on against land (less when glancing).
export const GROUNDING_DRAG = 3;

// How fast land swings the bow along the shore on contact, in radians per second at a head-on
// hit. Helps ships slide off rather than stick. Must stay below TURN_RATE × rudder bite at
// MIN_SPEED, or a ship can be held against the shore in a corner.
export const DEFLECT_RATE = 0.3;

// ───────────────────────── CHECKS ─────────────────────────

/** Rules the values above must follow. Returns a warning for each one that's broken. */
export function checkTuning(): string[] {
  const warnings: string[] = [];
  const noGoDeg = NO_GO / DEG;
  const first = POLAR[0];
  const last = POLAR[POLAR.length - 1];
  if (!first || Math.abs(first[0] - noGoDeg) > 1e-6) {
    warnings.push(
      `POLAR's first row should be at NO_GO (${noGoDeg.toFixed(1)}°) but is at ${first?.[0]}°.`,
    );
  }
  if (!last || last[0] !== 180)
    warnings.push(
      `POLAR's last row should be at 180° but is at ${last?.[0]}°.`,
    );
  for (let i = 1; i < POLAR.length; i++) {
    if (POLAR[i]![0] <= POLAR[i - 1]![0])
      warnings.push(`POLAR angles must increase row by row (row ${i + 1}).`);
  }
  if (POLAR.some(([, v]) => v < 0))
    warnings.push("POLAR drive values can't be negative.");
  const closeHauledBrace = (180 - noGoDeg) / 2;
  if (BRACE_LIMIT / DEG < closeHauledBrace - 1e-6) {
    warnings.push(
      `BRACE_LIMIT (${(BRACE_LIMIT / DEG).toFixed(1)}°) should be at least (180° − NO_GO) / 2 = ${closeHauledBrace.toFixed(1)}°.`,
    );
  }
  if (RUDDER_BITE_FULL_SPEED <= RUDDER_BITE_MIN_SPEED)
    warnings.push(
      "RUDDER_BITE_FULL_SPEED must be above RUDDER_BITE_MIN_SPEED.",
    );
  const biteAtMin = Math.pow(
    Math.max(
      0,
      Math.min(
        1,
        (MIN_SPEED - RUDDER_BITE_MIN_SPEED) /
          (RUDDER_BITE_FULL_SPEED - RUDDER_BITE_MIN_SPEED),
      ),
    ),
    RUDDER_BITE_CURVE,
  );
  if (DEFLECT_RATE >= TURN_RATE * biteAtMin) {
    warnings.push(
      `DEFLECT_RATE (${DEFLECT_RATE}) should stay below TURN_RATE × rudder bite at MIN_SPEED (${(TURN_RATE * biteAtMin).toFixed(2)}), or ships can get pinned against the shore.`,
    );
  }
  if (RUDDER_CENTER_SNAP >= RUDDER_MAX)
    warnings.push("RUDDER_CENTER_SNAP must be smaller than RUDDER_MAX.");
  return warnings;
}
