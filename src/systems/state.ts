import type { GameState } from "../types";
import { autoBrace, createShip } from "./ships";
import { createWind } from "./wind";

export function createGameState(width: number, height: number): GameState {
  const state: GameState = {
    width,
    height,
    ships: [],
    projectiles: [],
    splashes: [],
    wind: createWind(Math.PI / 2), // blowing from the north (top of screen)
    nextId: 1,
    time: 0,
  };
  state.ships.push(createShip(state, "player", { x: width * 0.3, y: height * 0.5 }, 0));
  state.ships.push(createShip(state, "enemy", { x: width * 0.7, y: height * 0.5 }, Math.PI));
  for (const ship of state.ships) autoBrace(state, ship); // start with the yards braced sensibly
  return state;
}

export function getPlayer(state: GameState) {
  return state.ships.find((s) => s.team === "player");
}
