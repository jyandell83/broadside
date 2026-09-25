import "./style.css";
import { Input } from "./systems/input";
import { startLoop } from "./systems/loop";
import { render } from "./systems/render";
import { steerShip, updateEnemyAI, updateShips } from "./systems/ships";
import { createGameState, getPlayer } from "./systems/state";
import { fireBroadside, updateProjectiles } from "./systems/weapons";
import { resolveCollisions } from "./systems/collision";

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
  state.width = window.innerWidth;
  state.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

function update(dt: number): void {
  state.time += dt;

  if (input.wasPressed("KeyR")) {
    state = createGameState(state.width, state.height);
  }

  const player = getPlayer(state);
  if (player) {
    const turn = (input.isDown("KeyD") ? 1 : 0) - (input.isDown("KeyA") ? 1 : 0);
    const throttle = (input.isDown("KeyW") ? 1 : 0) - (input.isDown("KeyS") ? 1 : 0);
    steerShip(player, turn, throttle, dt);
    if (input.isDown("KeyQ")) fireBroadside(state, player, "port");
    if (input.isDown("KeyE")) fireBroadside(state, player, "starboard");
  }

  updateEnemyAI(state, dt, (ship, side) => fireBroadside(state, ship, side));
  updateShips(state, dt);
  updateProjectiles(state, dt);
  resolveCollisions(state);

  input.endFrame();
}

startLoop(update, () => render(ctx, state));
