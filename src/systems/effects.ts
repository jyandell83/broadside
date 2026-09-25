import type { GameState, ParticleKind, Ship, Vec2 } from "../types";
import { PX_PER_KNOT, WIND_MAX_KNOTS } from "./wind";

// Everything here is visual. Nothing in this file changes positions, HP or anything else
// gameplay reads; ship jolt and camera shake are offsets applied only when drawing.

export const SINK_DURATION = 3.2; // seconds from 0 HP until the wreck is removed
const MAX_PARTICLES = 900;
const SMOKE_WIND_FACTOR = 0.3; // smoke drifts downwind at this fraction of the wind speed

// Hit reactions.
const JOLT_PX = 3; // visual shove per cannonball, along the ball's path
const JOLT_SPIN = 0.05; // rad of visual twist per cannonball
const JOLT_DECAY = 9; // per second
const SHAKE_PER_HIT = 0.16; // camera trauma when the player's ship is hit
const SHAKE_ON_KILL = 0.45; // camera trauma when a ship is sunk
const SHAKE_DECAY = 1.6; // trauma lost per second
const SHAKE_MAX = 0.7;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function spawn(state: GameState, kind: ParticleKind, pos: Vec2, vel: Vec2, life: number, size: number, drag = 0): void {
  state.particles.push({
    kind,
    pos: { ...pos },
    vel,
    drag,
    age: 0,
    life,
    size,
    rot: rand(0, Math.PI * 2),
    spin: kind === "splinter" ? rand(-14, 14) : kind === "wreckage" ? rand(-0.6, 0.6) : 0,
  });
}

/** Where smoke drifts: downwind, slower than the wind itself. */
function smokeDrift(state: GameState): Vec2 {
  const speed = state.wind.strength * WIND_MAX_KNOTS * PX_PER_KNOT * SMOKE_WIND_FACTOR;
  return { x: Math.cos(state.wind.dir) * speed, y: Math.sin(state.wind.dir) * speed };
}

function smokePuff(state: GameState, pos: Vec2, size: number, life: number): void {
  const d = smokeDrift(state);
  spawn(state, "smoke", pos, { x: d.x + rand(-8, 8), y: d.y + rand(-8, 8) }, life, size, 0.3);
}

/** Moves a world point in a ship's local frame (x toward the bow, y toward starboard). */
function shipLocalToWorld(ship: Ship, lx: number, ly: number): Vec2 {
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  return { x: ship.pos.x + c * lx - s * ly, y: ship.pos.y + s * lx + c * ly };
}

/** Snaps a hit point from the round collision circle onto the hull's outline. */
function hullPoint(ship: Ship, p: Vec2): Vec2 {
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  const dx = p.x - ship.pos.x;
  const dy = p.y - ship.pos.y;
  const lx = Math.max(-18, Math.min(20, dx * c + dy * s));
  const ly = Math.max(-7, Math.min(7, -dx * s + dy * c));
  return shipLocalToWorld(ship, lx, ly);
}

/**
 * A cannonball hit: flash, splinters bursting back out of the hull, a puff of smoke,
 * a visual jolt to the ship, and camera shake if it's the player. `fatal` makes it bigger.
 */
export function cannonImpact(state: GameState, ship: Ship, ballPos: Vec2, ballVel: Vec2, fatal: boolean): void {
  const at = hullPoint(ship, ballPos);
  const speed = Math.hypot(ballVel.x, ballVel.y) || 1;
  const dir = { x: ballVel.x / speed, y: ballVel.y / speed };
  const back = Math.atan2(-dir.y, -dir.x); // splinters mostly burst back toward the shooter

  spawn(state, "flash", at, { x: 0, y: 0 }, fatal ? 0.2 : 0.12, fatal ? 20 : 11);

  const splinters = fatal ? 16 : 7;
  for (let i = 0; i < splinters; i++) {
    // Most blow back out of the entry hole; a few go through with the ball.
    const through = Math.random() < 0.25;
    const a = (through ? back + Math.PI : back) + rand(-1.1, 1.1);
    const v = rand(60, fatal ? 200 : 150);
    spawn(state, "splinter", at, { x: Math.cos(a) * v, y: Math.sin(a) * v }, rand(0.4, 0.8), rand(2, 4.5), 4);
  }

  for (let i = 0; i < (fatal ? 5 : 2); i++) smokePuff(state, { x: at.x + rand(-3, 3), y: at.y + rand(-3, 3) }, rand(4, 7), rand(0.9, 1.5));

  ship.jolt.x += dir.x * JOLT_PX * (fatal ? 2 : 1);
  ship.jolt.y += dir.y * JOLT_PX * (fatal ? 2 : 1);
  ship.joltSpin += (Math.random() < 0.5 ? -1 : 1) * JOLT_SPIN * (fatal ? 2 : 1);

  if (ship.team === "player") addShake(state, fatal ? SHAKE_ON_KILL : SHAKE_PER_HIT);
  else if (fatal) addShake(state, SHAKE_ON_KILL * 0.6); // the payoff for sinking an enemy

  if (fatal) {
    // Wreckage left floating where she went down.
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(10, 45);
      spawn(state, "wreckage", shipLocalToWorld(ship, rand(-14, 14), rand(-5, 5)), { x: Math.cos(a) * v, y: Math.sin(a) * v }, rand(4, 6), rand(3, 6), 1.2);
    }
  }
}

function addShake(state: GameState, amount: number): void {
  state.shake = Math.min(SHAKE_MAX, state.shake + amount);
}

/**
 * Damage smoke/fire on ships below ~70% HP, bubbles and smoke from sinking wrecks,
 * decays jolt and shake, and ages particles.
 */
export function updateEffects(state: GameState, dt: number): void {
  const joltKeep = Math.exp(-JOLT_DECAY * dt);
  for (const ship of state.ships) {
    ship.jolt.x *= joltKeep;
    ship.jolt.y *= joltKeep;
    ship.joltSpin *= joltKeep;

    const damage = 1 - Math.max(0, ship.hp) / ship.maxHp;
    const sinking = ship.sinkAge !== null;
    if (!sinking && damage < 0.3) continue;

    ship.smokeTimer -= dt;
    if (ship.smokeTimer <= 0) {
      // More damage = more frequent, larger, longer-lasting smoke. A sinking ship's smoke
      // thins out as the sea puts the fires out, so the sinking itself stays visible.
      const sinkT = sinking ? ship.sinkAge! / SINK_DURATION : 0;
      const heavy = sinking ? 1 - sinkT : (damage - 0.3) / 0.7;
      ship.smokeTimer = sinking ? 0.3 + 0.4 * sinkT : 0.5 - 0.3 * heavy;
      for (const [lx, ly] of fireSpots(ship)) {
        if (Math.random() < 0.5) smokePuff(state, shipLocalToWorld(ship, lx, ly), 2.5 + 2.5 * heavy, 1 + 1 * heavy);
      }
      if (damage > 0.6 || sinking) {
        const [lx, ly] = fireSpots(ship)[0]!;
        const a = rand(0, Math.PI * 2);
        spawn(state, "ember", shipLocalToWorld(ship, lx, ly), { x: Math.cos(a) * 20, y: Math.sin(a) * 20 }, rand(0.3, 0.6), 1.5, 2);
      }
    }

    if (sinking) {
      // Air escaping around the hull as she goes down.
      if (Math.random() < 0.5) {
        const p = shipLocalToWorld(ship, rand(-20, 20), rand(-9, 9) * ship.listSide);
        spawn(state, "bubble", p, { x: 0, y: 0 }, rand(0.5, 0.9), rand(1.5, 3));
      }
    }
  }

  state.shake = Math.max(0, state.shake - SHAKE_DECAY * dt);

  for (const p of state.particles) {
    p.age += dt;
    const keep = Math.exp(-p.drag * dt);
    p.vel.x *= keep;
    p.vel.y *= keep;
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.rot += p.spin * dt;
  }
  state.particles = state.particles.filter((p) => p.age < p.life);
  if (state.particles.length > MAX_PARTICLES) state.particles.splice(0, state.particles.length - MAX_PARTICLES);
}

/**
 * Where damage shows on a ship (ship-local coords): more spots light up as HP drops.
 * Fixed per ship so fires don't jump around.
 */
export function fireSpots(ship: Ship): [number, number][] {
  const all: [number, number][] = [
    [-8 + (ship.id % 3) * 3, 3 - (ship.id % 2) * 5],
    [7 - (ship.id % 2) * 4, -3],
    [-14, (ship.id % 2) * 4 - 2],
  ];
  const damage = 1 - Math.max(0, ship.hp) / ship.maxHp;
  if (ship.sinkAge !== null) return all;
  return all.slice(0, damage > 0.8 ? 3 : damage > 0.55 ? 2 : 1);
}

/** Camera offset from shake: squared trauma so small shakes stay small. */
export function shakeOffset(state: GameState): Vec2 {
  const MAX_PX = 9;
  const t = state.shake * state.shake * MAX_PX;
  return { x: t * Math.sin(state.time * 53.1), y: t * Math.sin(state.time * 41.7 + 1.3) };
}
