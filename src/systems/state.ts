import type { GameState } from "../types";
import { autoBrace, createShip } from "./ships";
import { createWind } from "./wind";

// World size as a tuning knob: base size × WORLD_SCALE (keeps the 4:3 proportions).
// Camera limits, ship boundaries, spawns and the sea texture all read state.world.
const WORLD_SCALE = 1.25;
const WORLD_WIDTH = 4000 * WORLD_SCALE;
const WORLD_HEIGHT = 3000 * WORLD_SCALE;
// Ships spawn this far apart regardless of world size, so a bigger world doesn't mean a longer approach.
const SPAWN_SEPARATION = 600;

export function createGameState(viewportWidth: number, viewportHeight: number): GameState {
  const state: GameState = {
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    viewport: { width: viewportWidth, height: viewportHeight },
    camera: { x: 0, y: 0 },
    cameraLead: { x: 0, y: 0 },
    ships: [],
    projectiles: [],
    splashes: [],
    wake: [],
    particles: [],
    shake: 0,
    wind: createWind(Math.PI / 2), // blowing from the north (top of the world)
    nextId: 1,
    time: 0,
  };
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2;
  const half = SPAWN_SEPARATION / 2;
  state.ships.push(createShip(state, "player", { x: cx - half, y: cy }, 0));
  state.ships.push(createShip(state, "enemy", { x: cx + half, y: cy }, Math.PI));
  for (const ship of state.ships) autoBrace(state, ship); // start with the yards braced sensibly
  state.camera = { x: cx - half, y: cy };
  return state;
}

export function getPlayer(state: GameState) {
  return state.ships.find((s) => s.team === "player");
}
