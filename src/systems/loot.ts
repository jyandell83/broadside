import type { GameState, Ship } from "../types";
import { rollWreckCargo } from "./cargo";
import { getPlayer } from "./state";
import { pushOutOfLand } from "./islands";
import { PX_PER_KNOT, WIND_MAX_KNOTS } from "./wind";

// Floating cargo is deliberately separate from combat: it isn't in ships or projectiles, so
// collisions and movement never see it. The only interaction is the player's pickup check.

const SCATTER = 28; // px: pieces surface within this distance of where the wreck went down
const SCATTER_SPEED = 18; // px/s initial outward drift as they surface
const SCATTER_DRAG = 0.9; // per second
const DRIFT = 0.03; // fraction of wind speed the cargo drifts downwind
const PICKUP_REACH = 12; // px beyond the ship's collision radius
export const PICKUP_FX_DURATION = 1.3; // seconds for the fly-in and "+ Silk" text
export const SURFACE_TIME = 0.5; // seconds for a piece to pop up after the wreck is gone

/** A finished wreck leaves a few pieces of cargo floating where she went down. */
export function dropWreckCargo(state: GameState, wreck: Ship): void {
  for (const { cargo, qty } of rollWreckCargo()) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * SCATTER;
    const v = SCATTER_SPEED * (0.5 + Math.random() * 0.5);
    state.loot.push({
      cargo,
      qty,
      pos: { x: wreck.pos.x + Math.cos(a) * r, y: wreck.pos.y + Math.sin(a) * r },
      vel: { x: Math.cos(a) * v, y: Math.sin(a) * v },
      age: -Math.random() * 0.4, // stagger surfacing slightly
      phase: Math.random() * Math.PI * 2,
    });
  }
}

/** Drifts floating cargo, lets the player sail over it to collect, and ages pickup effects. */
export function updateLoot(state: GameState, dt: number): void {
  const drift = state.wind.strength * WIND_MAX_KNOTS * PX_PER_KNOT * DRIFT;
  const keep = Math.exp(-SCATTER_DRAG * dt);
  for (const item of state.loot) {
    item.age += dt;
    item.vel.x *= keep;
    item.vel.y *= keep;
    item.pos.x += (item.vel.x + Math.cos(state.wind.dir) * drift) * dt;
    item.pos.y += (item.vel.y + Math.sin(state.wind.dir) * drift) * dt;
    item.pos.x = Math.min(state.world.width - 10, Math.max(10, item.pos.x));
    item.pos.y = Math.min(state.world.height - 10, Math.max(10, item.pos.y));
    pushOutOfLand(state.islands, item.pos, 8); // cargo washes along the coast, never ashore
  }

  const player = getPlayer(state);
  if (player && player.sinkAge === null) {
    const reach = player.radius + PICKUP_REACH;
    state.loot = state.loot.filter((item) => {
      if (item.age < SURFACE_TIME * 0.6) return true; // let it surface first
      if (Math.hypot(item.pos.x - player.pos.x, item.pos.y - player.pos.y) > reach) return true;
      player.cargo[item.cargo] = (player.cargo[item.cargo] ?? 0) + item.qty;
      state.lootPickups.push({ cargo: item.cargo, qty: item.qty, from: { ...item.pos }, shipId: player.id, age: 0 });
      return false;
    });
  }

  for (const p of state.lootPickups) p.age += dt;
  state.lootPickups = state.lootPickups.filter((p) => p.age < PICKUP_FX_DURATION);
}
