import type { GameState, Ship, Vec2 } from "../types";
import { SHOT_RANGE } from "./weapons";
import { SINK_DURATION } from "./effects";
import { HULL, SHIP_SCALE } from "./hull";
import { isOnLand, pushOutOfLand } from "./islands";
import { getPort } from "./ports";
import { BRACE_LIMIT, NO_GO, PX_PER_KNOT, WIND_MAX_KNOTS, braceEfficiency, idealBrace, offWindAngle, polarFactor } from "./wind";

export const MAX_SPEED = 60; // px/s at full sail, perfect brace, best point of sail
const ACCEL = 0.5; // how quickly speed rises toward the sail-driven target
const DRAG = 0.4; // how quickly speed bleeds off when the target is lower
const IRONS_DRAG = 0.9; // extra-fast slowdown when pointed into the wind
const TURN_RATE = 1.0; // rad/s at full speed
// Arcade tuning: rudder needs way on, but a nearly stopped ship can pivot to recover.
const MIN_STEERAGE = 0.6; // fraction of turn rate from the rudder alone at zero speed
const LOW_SPEED_STEERAGE = 1.0; // pivot boost when barely moving, so a bad heading is recoverable
const PIVOT_FULL_BELOW = 0.2; // fraction of MAX_SPEED: full pivot boost below this
const PIVOT_GONE_ABOVE = 0.4; // ...fading to nothing by this
const MIN_SPEED = 5; // px/s (~1 kn); ships never fully stop, even in irons
const SAIL_RATE = 0.8; // sails set/furled per second
const BRACE_RATE = Math.PI / 2; // rad/s the crew can swing the yards

export function createShip(state: GameState, team: Ship["team"], pos: Vec2, heading: number): Ship {
  return {
    id: state.nextId++,
    team,
    pos: { ...pos },
    heading,
    speed: 0,
    sails: 0.5,
    brace: 0,
    offWind: 0,
    sailEfficiency: 0,
    radius: HULL.radius * SHIP_SCALE,
    hp: 100,
    maxHp: 100,
    reload: { port: 0, starboard: 0 },
    wakeDistance: 0,
    jolt: { x: 0, y: 0 },
    joltSpin: 0,
    sinkAge: null,
    listSide: 1,
    sinkSpin: 0,
    smokeTimer: 0,
    pendingShots: [],
    cargo: {},
    docked: null,
  };
}

/** turn: -1 (to port) .. 1 (to starboard). */
export function steerShip(ship: Ship, turn: number, dt: number): void {
  if (ship.sinkAge !== null || ship.docked) return;
  turnShip(ship, turn, dt);
}

/** The ship's turning: shared by player steering and the docking maneuver. */
function turnShip(ship: Ship, turn: number, dt: number): void {
  const r = Math.min(1, ship.speed / MAX_SPEED);
  const rudder = MIN_STEERAGE + (1 - MIN_STEERAGE) * r;
  const fade = (PIVOT_GONE_ABOVE - r) / (PIVOT_GONE_ABOVE - PIVOT_FULL_BELOW);
  const pivot = LOW_SPEED_STEERAGE * Math.min(1, Math.max(0, fade));
  const steerage = Math.max(rudder, pivot);
  ship.heading += turn * TURN_RATE * steerage * dt;
}

/** setDelta: +1 to raise sail, -1 to furl. braceDelta: +1 swings the yards toward starboard, -1 toward port. */
export function adjustSails(ship: Ship, setDelta: number, braceDelta: number, dt: number): void {
  if (ship.sinkAge !== null || ship.docked) return;
  ship.sails = Math.min(1, Math.max(0, ship.sails + setDelta * SAIL_RATE * dt));
  ship.brace = Math.min(BRACE_LIMIT, Math.max(-BRACE_LIMIT, ship.brace + braceDelta * BRACE_RATE * dt));
}

/** Snap the yards to the ideal brace for the current heading (used by the AI). */
export function autoBrace(state: GameState, ship: Ship): void {
  ship.brace = idealBrace(ship.heading, state.wind);
}

/** A ship at 0 HP is disabled and starts going down; it's removed after SINK_DURATION. */
export function startSinking(ship: Ship): void {
  if (ship.sinkAge !== null) return;
  ship.sinkAge = 0;
  ship.listSide = Math.random() < 0.5 ? -1 : 1;
  ship.sinkSpin = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2);
}

const SINK_DRAG = 0.8; // how quickly a wreck loses way
// Arcade grounding: running into land costs speed in proportion to how squarely you hit, and
// the bow is swung along the shore so the ship slides off rather than sticking.
const GROUNDING_DRAG = 3; // per second, at a head-on hit
// Kept below the helm's weakest turn rate (TURN_RATE × MIN_STEERAGE-ish ≈ 0.7 rad/s), so a
// player steering away from land always wins; in a corner between blobs, a stronger deflection
// could hold the bow against the shore.
const DEFLECT_RATE = 0.6; // rad/s the bow is turned toward the shoreline, at a head-on hit
const WRECK_DRIFT = 0.04; // fraction of wind speed a wreck is pushed downwind

/** Moves ships. Returns the wrecks that finished sinking and were removed this tick. */
export function updateShips(state: GameState, dt: number): Ship[] {
  for (const ship of state.ships) {
    if (ship.sinkAge !== null) {
      // Disabled: coast to a stop, slowly turn, and drift a little with the wind.
      ship.sinkAge += dt;
      ship.speed *= Math.exp(-SINK_DRAG * dt);
      ship.heading += ship.sinkSpin * dt;
      ship.sinkSpin *= Math.exp(-0.3 * dt);
      const drift = state.wind.strength * WIND_MAX_KNOTS * PX_PER_KNOT * WRECK_DRIFT;
      ship.pos.x += (Math.cos(ship.heading) * ship.speed + Math.cos(state.wind.dir) * drift) * dt;
      ship.pos.y += (Math.sin(ship.heading) * ship.speed + Math.sin(state.wind.dir) * drift) * dt;
      pushOutOfLand(state.islands, ship.pos, ship.radius);
      continue;
    }

    if (ship.docked) {
      updateDocking(state, ship, dt);
      ship.reload.port = Math.max(0, ship.reload.port - dt);
      ship.reload.starboard = Math.max(0, ship.reload.starboard - dt);
      continue;
    }

    ship.offWind = offWindAngle(ship.heading, state.wind);
    ship.sailEfficiency = braceEfficiency(ship, state.wind);

    const target = MAX_SPEED * state.wind.strength * ship.sails * polarFactor(ship.offWind) * ship.sailEfficiency;
    const rate = target > ship.speed ? ACCEL : ship.offWind < NO_GO ? IRONS_DRAG : DRAG;
    ship.speed += (target - ship.speed) * rate * dt;
    ship.speed = Math.max(MIN_SPEED, ship.speed);

    ship.pos.x += Math.cos(ship.heading) * ship.speed * dt;
    ship.pos.y += Math.sin(ship.heading) * ship.speed * dt;

    // Land is solid: pushed back out to the coast, a ship is deflected along it and loses way.
    const shore = pushOutOfLand(state.islands, ship.pos, ship.radius);
    if (shore) {
      const rel = Math.atan2(Math.sin(ship.heading - Math.atan2(shore.y, shore.x)), Math.cos(ship.heading - Math.atan2(shore.y, shore.x)));
      const into = -Math.cos(rel); // 1 = head-on into the coast, 0 = running along it, <0 = leaving
      if (into > 0) {
        ship.speed *= Math.exp(-GROUNDING_DRAG * into * dt);
        ship.heading -= (rel >= 0 ? 1 : -1) * DEFLECT_RATE * into * dt;
      }
    }

    // Keep ships inside the world.
    ship.pos.x = Math.min(state.world.width - ship.radius, Math.max(ship.radius, ship.pos.x));
    ship.pos.y = Math.min(state.world.height - ship.radius, Math.max(ship.radius, ship.pos.y));

    ship.reload.port = Math.max(0, ship.reload.port - dt);
    ship.reload.starboard = Math.max(0, ship.reload.starboard - dt);
  }
  const afloat = (s: Ship) => s.sinkAge === null || s.sinkAge < SINK_DURATION;
  const sunk = state.ships.filter((s) => !afloat(s));
  state.ships = state.ships.filter(afloat);
  return sunk;
}

// Docking maneuver: the crew brings the ship in under tow/warps, sails furled. When docking
// starts, a smooth curve is planned from the ship's position and heading to the berth, arriving
// along the shore. The ship always faces along the curve and moves forward along it at a
// controlled speed (easing up, cruising, easing to a stop). It advances each tick only as far as
// DOCK_TURN_RATE lets its heading follow, so it glides through gentle bends and all but pivots in
// tight ones: the same forward-only, rate-limited motion as sailing, never sliding sideways.
// (Steering toward the berth by feedback circled instead of arriving: the docking area is only
// a few turning circles across.)
const DOCK_CRUISE = 25; // px/s (~5 kn) while coming in
const DOCK_TURN_RATE = TURN_RATE * 1.5; // rad/s: boats and warps swing her a little quicker than sailing
const DOCK_DECEL = 9; // px/s²: eases to a stop at the berth
const DOCK_MIN_SPEED = 3; // px/s: keeps it moving to the very end of the path
const DOCK_CREEP = 3; // px/s: forward creep while pivoting through a very tight spot
const DOCK_SPEED_EASE = 2; // per second: how quickly speed follows the plan
const DOCK_PATH_SAMPLES = 128;
const DOCK_MIN_LEAD = 12; // px the path runs straight ahead first, so it starts along the ship's heading

/** A cubic curve leaving along the ship's heading and arriving along the mooring heading. */
function planDockingPath(state: GameState, ship: Ship, berth: Vec2, heading: number): Vec2[] {
  const dist = Math.hypot(berth.x - ship.pos.x, berth.y - ship.pos.y);
  const h0 = { x: Math.cos(ship.heading), y: Math.sin(ship.heading) };
  const h1 = { x: Math.cos(heading), y: Math.sin(heading) };
  // How far each end runs straight before curving; shortened if it would run onto land.
  let lead = Math.min(35, Math.max(DOCK_MIN_LEAD, dist * 0.4));
  while (lead > DOCK_MIN_LEAD && isOnLand(state.islands, { x: ship.pos.x + h0.x * lead, y: ship.pos.y + h0.y * lead }, ship.radius * 0.6)) lead *= 0.7;
  const tail = Math.min(50, Math.max(25, dist * 0.5 + 10));
  const p1 = { x: ship.pos.x + h0.x * lead, y: ship.pos.y + h0.y * lead };
  const p2 = { x: berth.x - h1.x * tail, y: berth.y - h1.y * tail };
  const pts: Vec2[] = [];
  for (let i = 0; i <= DOCK_PATH_SAMPLES; i++) {
    const t = i / DOCK_PATH_SAMPLES;
    const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, e = t ** 3;
    pts.push({
      x: a * ship.pos.x + b * p1.x + c * p2.x + e * berth.x,
      y: a * ship.pos.y + b * p1.y + c * p2.y + e * berth.y,
    });
  }
  return pts;
}

/** Glides a docking ship along its planned path into the berth, then holds it there. */
function updateDocking(state: GameState, ship: Ship, dt: number): void {
  const d = ship.docked!;
  const port = getPort(state, d.portId);
  if (!port) return;
  const berth = port.berth;
  if (d.phase === "moored") {
    ship.pos.x = berth.x;
    ship.pos.y = berth.y;
    ship.heading = d.heading;
    ship.speed = 0;
    return;
  }
  if (!d.path) {
    d.path = planDockingPath(state, ship, berth, d.heading);
    d.pathLength = [0];
    for (let i = 1; i < d.path.length; i++) {
      d.pathLength.push(d.pathLength[i - 1]! + Math.hypot(d.path[i]!.x - d.path[i - 1]!.x, d.path[i]!.y - d.path[i - 1]!.y));
    }
    d.progress = 0;
  }
  const path = d.path;
  const lengths = d.pathLength;
  const total = lengths[lengths.length - 1]!;
  const n = path.length - 1;

  // Direction of the path at a sample (central difference; the ends are exact), and at any
  // distance along it (blended between samples, so it changes smoothly).
  const vertexAngle = (j: number): number => {
    if (j <= 0) return Math.atan2(path[1]!.y - path[0]!.y, path[1]!.x - path[0]!.x);
    if (j >= n) return d.heading;
    return Math.atan2(path[j + 1]!.y - path[j - 1]!.y, path[j + 1]!.x - path[j - 1]!.x);
  };
  const locate = (dist: number): { k: number; f: number } => {
    let k = 0;
    while (k < n - 1 && lengths[k + 1]! < dist) k++;
    return { k, f: Math.min(1, Math.max(0, (dist - lengths[k]!) / Math.max(1e-6, lengths[k + 1]! - lengths[k]!))) };
  };
  const directionAt = (dist: number): number => {
    const { k, f } = locate(dist);
    const a0 = vertexAngle(k);
    return a0 + Math.atan2(Math.sin(vertexAngle(k + 1) - a0), Math.cos(vertexAngle(k + 1) - a0)) * f;
  };

  // Speed: ease toward cruise, brake smoothly for the berth.
  const remaining = total - d.progress;
  const target = Math.max(DOCK_MIN_SPEED, Math.min(DOCK_CRUISE, Math.sqrt(2 * DOCK_DECEL * remaining)));
  ship.speed += (target - ship.speed) * (1 - Math.exp(-DOCK_SPEED_EASE * dt));

  // Advance, but only as far as the heading can follow at DOCK_TURN_RATE (halve the step until it can).
  let step = Math.min(remaining, ship.speed * dt);
  const turnBy = (dist: number) => Math.abs(Math.atan2(Math.sin(directionAt(dist) - ship.heading), Math.cos(directionAt(dist) - ship.heading)));
  for (let tries = 0; tries < 12 && step > 1e-4 && turnBy(d.progress + step) > DOCK_TURN_RATE * dt; tries++) step *= 0.5;
  // In a very tight spot, creep while the heading pivots round (it catches up at DOCK_TURN_RATE).
  if (turnBy(d.progress + step) > DOCK_TURN_RATE * dt) step = Math.min(remaining, DOCK_CREEP * dt);
  d.progress += step;
  ship.speed = Math.min(ship.speed, step / dt + DOCK_MIN_SPEED); // what's shown (wake, bow wave) matches the motion

  // Place the ship on the path, facing along it (turning at most DOCK_TURN_RATE per tick).
  const { k, f } = locate(d.progress);
  ship.pos.x = path[k]!.x + (path[k + 1]!.x - path[k]!.x) * f;
  ship.pos.y = path[k]!.y + (path[k + 1]!.y - path[k]!.y) * f;
  const turn = Math.atan2(Math.sin(directionAt(d.progress) - ship.heading), Math.cos(directionAt(d.progress) - ship.heading));
  ship.heading += Math.max(-DOCK_TURN_RATE * dt, Math.min(DOCK_TURN_RATE * dt, turn));

  if (d.progress >= total - 1e-3 && Math.abs(turn) < 0.01) {
    d.phase = "moored";
    ship.pos.x = berth.x;
    ship.pos.y = berth.y;
    ship.heading = d.heading;
    ship.speed = 0;
  }
}

/** Placeholder enemy behaviour: sail in circles and fire when the player is abeam. */
export function updateEnemyAI(state: GameState, dt: number, fire: (ship: Ship, side: "port" | "starboard") => void): void {
  // Enemies leave a docked player alone: ports are safe harbour.
  const player = state.ships.find((s) => s.team === "player" && s.sinkAge === null && !s.docked);
  for (const ship of state.ships) {
    if (ship.team !== "enemy" || ship.sinkAge !== null) continue;
    ship.sails = 1;
    steerShip(ship, 0.4, dt);
    autoBrace(state, ship);
    if (!player || Math.hypot(player.pos.x - ship.pos.x, player.pos.y - ship.pos.y) > SHOT_RANGE) continue;
    const angle = Math.atan2(player.pos.y - ship.pos.y, player.pos.x - ship.pos.x) - ship.heading;
    const rel = Math.atan2(Math.sin(angle), Math.cos(angle)); // normalise to -PI..PI
    if (Math.abs(rel - Math.PI / 2) < 0.2) fire(ship, "starboard");
    if (Math.abs(rel + Math.PI / 2) < 0.2) fire(ship, "port");
  }
}
