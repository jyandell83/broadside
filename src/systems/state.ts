import type { GameState } from "../types";
import { createShip } from "./ships";

export function createGameState(width: number, height: number): GameState {
  const state: GameState = {
    width,
    height,
    ships: [],
    projectiles: [],
    wind: { dir: Math.PI / 2, strength: 1 }, // blowing from the north (top of screen)
    nextId: 1,
    time: 0,
  };
  state.ships.push(createShip(state, "player", { x: width * 0.3, y: height * 0.5 }, 0));
  state.ships.push(createShip(state, "enemy", { x: width * 0.7, y: height * 0.5 }, Math.PI));
  return state;
}

export function getPlayer(state: GameState) {
  return state.ships.find((s) => s.team === "player");
}
