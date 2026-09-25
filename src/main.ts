import "./style.css";
import { Input } from "./systems/input";
import { startLoop } from "./systems/loop";
import { render } from "./systems/render";
import { adjustSails, steerShip, updateEnemyAI, updateShips } from "./systems/ships";
import { createGameState, getPlayer } from "./systems/state";
import { fireBroadside, updateGuns, updateProjectiles, updateSplashes } from "./systems/weapons";
import { updateWind } from "./systems/wind";
import { resolveCollisions } from "./systems/collision";
import { updateCamera } from "./systems/camera";
import { updateWake } from "./systems/wake";
import { updateEffects } from "./systems/effects";
import { dropWreckCargo, updateLoot } from "./systems/loot";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const ctx = canvas?.getContext("2d");
if (!canvas || !ctx) throw new Error("Canvas #game not found");

const input = new Input();
let state = createGameState(window.innerWidth, window.innerHeight);

function resize(): void {
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.viewport.width = window.innerWidth;
  state.viewport.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

function update(dt: number): void {
  state.time += dt;

  if (input.wasPressed("KeyR")) {
    state = createGameState(state.viewport.width, state.viewport.height);
  }

  updateWind(state.wind, dt);

  const player = getPlayer(state);
  if (player) {
    const turn = (input.isDown("KeyD") ? 1 : 0) - (input.isDown("KeyA") ? 1 : 0);
    const setSail = (input.isDown("KeyW") ? 1 : 0) - (input.isDown("KeyS") ? 1 : 0);
    const brace = (input.isDown("ArrowRight") ? 1 : 0) - (input.isDown("ArrowLeft") ? 1 : 0);
    steerShip(player, turn, dt);
    adjustSails(player, setSail, brace, dt);
    if (input.isDown("KeyQ")) fireBroadside(player, "port");
    if (input.isDown("KeyE")) fireBroadside(player, "starboard");
  }

  updateEnemyAI(state, dt, (ship, side) => fireBroadside(ship, side));
  for (const wreck of updateShips(state, dt)) {
    if (wreck.team === "enemy") dropWreckCargo(state, wreck);
  }
  updateGuns(state, dt);
  updateProjectiles(state, dt);
  updateSplashes(state, dt);
  resolveCollisions(state);
  updateWake(state, dt);
  updateEffects(state, dt);
  updateLoot(state, dt);
  updateCamera(state, dt);

  input.endFrame();
}

startLoop(update, () => render(ctx, state));
