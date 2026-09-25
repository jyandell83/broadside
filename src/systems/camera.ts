import type { GameState, Vec2 } from "../types";
import { getPlayer } from "./state";

const FOLLOW_RATE = 1.8; // per second; lower = more lag behind the target
const LEAD_TIME = 2.2; // look ahead by this many seconds of travel...
const LEAD_MAX_FRACTION = 0.2; // ...capped at this fraction of the smaller viewport side
const LEAD_RATE = 0.8; // per second; how gently the look-ahead swings through turns and speed changes
const EDGE_OVERSCROLL = 120; // px of open sea past the world edge the camera may show

/**
 * The camera eases toward a point ahead of the player's ship. The look-ahead is smoothed
 * separately (and more slowly) than the follow, so the view drifts ahead as the ship gathers
 * way and swings round gradually in turns instead of snapping with the heading.
 */
export function updateCamera(state: GameState, dt: number): void {
  const player = getPlayer(state);
  if (player) {
    const maxLead = Math.min(state.viewport.width, state.viewport.height) * LEAD_MAX_FRACTION;
    const leadDist = Math.min(maxLead, player.speed * LEAD_TIME);
    const kLead = 1 - Math.exp(-LEAD_RATE * dt);
    state.cameraLead.x += (Math.cos(player.heading) * leadDist - state.cameraLead.x) * kLead;
    state.cameraLead.y += (Math.sin(player.heading) * leadDist - state.cameraLead.y) * kLead;

    // Frame-rate independent exponential smoothing.
    const k = 1 - Math.exp(-FOLLOW_RATE * dt);
    state.camera.x += (player.pos.x + state.cameraLead.x - state.camera.x) * k;
    state.camera.y += (player.pos.y + state.cameraLead.y - state.camera.y) * k;
  }
  clampCamera(state);
}

function clampCamera(state: GameState): void {
  const { world, viewport, camera } = state;
  camera.x = clampAxis(camera.x, viewport.width / 2, world.width);
  camera.y = clampAxis(camera.y, viewport.height / 2, world.height);
}

function clampAxis(v: number, halfView: number, worldSize: number): number {
  const min = halfView - EDGE_OVERSCROLL;
  const max = worldSize - halfView + EDGE_OVERSCROLL;
  if (min > max) return worldSize / 2; // viewport bigger than the world: centre it
  return Math.min(max, Math.max(min, v));
}

/** World position → viewport (CSS px) position. */
export function worldToScreen(state: GameState, p: Vec2): Vec2 {
  return {
    x: p.x - state.camera.x + state.viewport.width / 2,
    y: p.y - state.camera.y + state.viewport.height / 2,
  };
}
