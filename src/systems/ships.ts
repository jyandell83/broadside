import type { GameState, Ship, Vec2 } from "../types";

const MAX_SPEED = 120; // px/s
const ACCEL = 0.6; // how quickly speed approaches throttle target
const TURN_RATE = 1.4; // rad/s at full speed

export function createShip(state: GameState, team: Ship["team"], pos: Vec2, heading: number): Ship {
  return {
    id: state.nextId++,
    team,
    pos: { ...pos },
    heading,
    speed: 0,
    throttle: 0,
    radius: 18,
    hp: 100,
    maxHp: 100,
    reload: { port: 0, starboard: 0 },
  };
}

/** turn: -1 (left) .. 1 (right) */
export function steerShip(ship: Ship, turn: number, throttleDelta: number, dt: number): void {
  ship.throttle = Math.min(1, Math.max(-0.25, ship.throttle + throttleDelta * dt));
  // Ships need some way on to turn well.
  const steerage = 0.3 + 0.7 * Math.min(1, Math.abs(ship.speed) / MAX_SPEED);
  ship.heading += turn * TURN_RATE * steerage * dt;
}

export function updateShips(state: GameState, dt: number): void {
  for (const ship of state.ships) {
    const target = ship.throttle * MAX_SPEED;
    ship.speed += (target - ship.speed) * ACCEL * dt;
    ship.pos.x += Math.cos(ship.heading) * ship.speed * dt;
    ship.pos.y += Math.sin(ship.heading) * ship.speed * dt;

    // Wrap around the screen edges.
    ship.pos.x = (ship.pos.x + state.width) % state.width;
    ship.pos.y = (ship.pos.y + state.height) % state.height;

    ship.reload.port = Math.max(0, ship.reload.port - dt);
    ship.reload.starboard = Math.max(0, ship.reload.starboard - dt);
  }
  state.ships = state.ships.filter((s) => s.hp > 0);
}

/** Placeholder enemy behaviour: sail in circles and fire when the player is abeam. */
export function updateEnemyAI(state: GameState, dt: number, fire: (ship: Ship, side: "port" | "starboard") => void): void {
  const player = state.ships.find((s) => s.team === "player");
  for (const ship of state.ships) {
    if (ship.team !== "enemy") continue;
    steerShip(ship, 0.4, 0.5, dt);
    if (!player) continue;
    const angle = Math.atan2(player.pos.y - ship.pos.y, player.pos.x - ship.pos.x) - ship.heading;
    const rel = Math.atan2(Math.sin(angle), Math.cos(angle)); // normalise to -PI..PI
    if (Math.abs(rel - Math.PI / 2) < 0.2) fire(ship, "starboard");
    if (Math.abs(rel + Math.PI / 2) < 0.2) fire(ship, "port");
  }
}
