import type { GameState, Island, Particle, Port, Ship, Vec2 } from "../types";
import { getPlayer } from "./state";
import { SPLASH_DURATION } from "./weapons";
import { worldToScreen } from "./camera";
import { SINK_DURATION, fireSpots, shakeOffset } from "./effects";
import { SHIP_SCALE } from "./hull";
import { CARGO, CARGO_IDS, cargoText, type CargoDef } from "./cargo";
import { PICKUP_FX_DURATION, SURFACE_TIME } from "./loot";
import { coastPoint, coastRadius, maxRadius } from "./islands";
import { dockStatus, dockablePort, getPort } from "./ports";
import { MAX_SPEED } from "./ships";
import { PX_PER_KNOT, braceAdvice, pointOfSailName, sailFill, windKnots } from "./wind";

const COLORS = {
  water: "#0b1d2e",
  outside: "#060f18", // beyond the world edge
  worldEdge: "rgba(200, 225, 255, 0.18)",
  wave: [160, 200, 235] as const, // rgb for crests; alpha varies per mark
  foam: [225, 238, 250] as const, // rgb for wake, flecks and bow wave
  offscreenEdge: "rgba(255, 255, 255, 0.5)",
  streak: "rgba(200, 225, 255, 0.12)",
  // Hulls are darker than the sails so the sails always read against them.
  player: "#9c7447",
  enemy: "#8e3530",
  sail: "#f4f0e6",
  sailLuffing: "#9aa3ad",
  sailAback: "#d9a58f",
  yard: "#3b2715",
  wood: "#c9a26b",
  wreckage: "#6b4a2b",
  scorch: "#1a120c",
  // Islands and ports.
  shallowsOuter: "rgba(40, 110, 130, 0.22)",
  shallowsInner: "rgba(80, 160, 165, 0.28)",
  beach: "#d6c28f",
  grass: "#5d7c46",
  hills: "#4c6a3a",
  rock: "#6f6e55",
  trees: "#3b5a2f",
  islandLabel: "rgba(235, 240, 225, 0.55)",
  pier: "#8b6a44",
  port: "#f5d77a",
  sailEdge: "rgba(30, 20, 10, 0.45)",
  shot: "#f2f2f2",
  hud: "#e8e8e8",
  hudDim: "#8a9aaa",
  hpBack: "#333",
  hpFront: "#6fcf6f",
  braceGood: "#6fcf6f",
  braceBad: "#e0a040",
};

const STREAK_COUNT = 40;
const STREAK_LENGTH = 24;

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { viewport, camera, world } = state;
  ctx.fillStyle = COLORS.outside;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  // World space: everything positioned in world px, shifted so the camera is centred.
  ctx.save();
  const shake = shakeOffset(state);
  ctx.translate(viewport.width / 2 - camera.x + shake.x, viewport.height / 2 - camera.y + shake.y);

  ctx.fillStyle = COLORS.water;
  ctx.fillRect(0, 0, world.width, world.height);
  drawWaveMarks(ctx, state);
  ctx.strokeStyle = COLORS.worldEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, world.width, world.height);

  drawWake(ctx, state);
  drawParticles(ctx, state, "water");
  for (const island of state.islands) drawIsland(ctx, state, island);
  for (const port of state.ports) drawPort(ctx, state, port);
  drawLoot(ctx, state);
  drawWindStreaks(ctx, state);
  for (const ship of state.ships) drawShip(ctx, ship, state);

  drawSplashes(ctx, state);

  // Balls swell mid-flight to suggest a lobbed arc.
  ctx.fillStyle = COLORS.shot;
  for (const p of state.projectiles) {
    const t = 1 - p.life / p.maxLife;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, 1.8 + 1.4 * Math.sin(Math.PI * t), 0, Math.PI * 2);
    ctx.fill();
  }
  drawParticles(ctx, state, "air");
  drawLootPickups(ctx, state);
  ctx.restore();

  // Screen space.
  drawOffscreenIndicators(ctx, state);
  drawHud(ctx, state);
  drawWindIndicator(ctx, state);
  drawCargoHold(ctx, state);
  drawPortPrompt(ctx, state);
}

/** Top-left corner of the view in world coordinates. */
function viewOrigin(state: GameState): { left: number; top: number } {
  return {
    left: state.camera.x - state.viewport.width / 2,
    top: state.camera.y - state.viewport.height / 2,
  };
}

const WAVE_CELL = 90; // px grid the sea texture is scattered on

/**
 * Sea texture fixed to world positions: small crests of varied size plus the odd fleck of foam.
 * The marks never move; each slowly brightens and fades so the sea doesn't look printed on.
 * This is what lets the player read their own speed while the camera follows them.
 */
function drawWaveMarks(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { left, top } = viewOrigin(state);
  const x0 = Math.max(0, Math.floor(left / WAVE_CELL));
  const y0 = Math.max(0, Math.floor(top / WAVE_CELL));
  const x1 = Math.min(Math.ceil(state.world.width / WAVE_CELL), Math.ceil((left + state.viewport.width) / WAVE_CELL));
  const y1 = Math.min(Math.ceil(state.world.height / WAVE_CELL), Math.ceil((top + state.viewport.height) / WAVE_CELL));
  const [wr, wg, wb] = COLORS.wave;
  const [fr, fg, fb] = COLORS.foam;
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  for (let ix = x0; ix < x1; ix++) {
    for (let iy = y0; iy < y1; iy++) {
      const x = (ix + 0.1 + 0.8 * hash(ix, iy, 1)) * WAVE_CELL;
      const y = (iy + 0.1 + 0.8 * hash(ix, iy, 2)) * WAVE_CELL;
      const shimmer = 0.6 + 0.4 * Math.sin(state.time * (0.4 + hash(ix, iy, 3) * 0.5) + hash(ix, iy, 4) * 6.28);

      // A shallow crest, 4–10px wide.
      const w = 4 + 6 * hash(ix, iy, 5);
      ctx.strokeStyle = `rgba(${wr}, ${wg}, ${wb}, ${0.17 * shimmer})`;
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.quadraticCurveTo(x, y - w * 0.45, x + w, y);
      ctx.stroke();

      // Occasional fleck of foam near the crest.
      if (hash(ix, iy, 6) < 0.35) {
        ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${0.14 * shimmer})`;
        ctx.beginPath();
        ctx.arc(x + (hash(ix, iy, 7) - 0.5) * 16, y + 4 + hash(ix, iy, 8) * 6, 1 + hash(ix, iy, 9), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/** Foam behind ships: spreads a little and fades. */
function drawWake(ctx: CanvasRenderingContext2D, state: GameState): void {
  const [fr, fg, fb] = COLORS.foam;
  for (const p of state.wake) {
    const t = p.age / p.life;
    const alpha = p.strength * (1 - t) * (1 - t);
    if (alpha < 0.01) continue;
    ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size * (1 + 1.5 * t), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Stable pseudo-random 0..1 for a grid cell. */
function hash(ix: number, iy: number, salt: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(salt, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Streaks carried by the wind so its direction and speed are always visible. */
function drawWindStreaks(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { dir, drift } = state.wind;
  const { width, height } = state.viewport;
  const { left, top } = viewOrigin(state);
  const dx = Math.cos(dir);
  const dy = Math.sin(dir);
  ctx.strokeStyle = COLORS.streak;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < STREAK_COUNT; i++) {
    // Cheap pseudo-random but stable base positions.
    const bx = ((i * 7919) % 1000) / 1000;
    const by = ((i * 104729) % 1000) / 1000;
    const gust = 0.85 + ((i * 31) % 10) / 30; // slight per-streak speed variation
    // Tile the streaks over the viewport, offset by the camera so they move with the air, not the screen.
    const x = left + wrap(bx * width + drift.x * gust - left, width);
    const y = top + wrap(by * height + drift.y * gust - top, height);
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * STREAK_LENGTH, y - dy * STREAK_LENGTH);
  }
  ctx.stroke();
}

function drawSplashes(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.lineWidth = 1.5;
  for (const s of state.splashes) {
    const t = s.age / SPLASH_DURATION;
    ctx.strokeStyle = `rgba(220, 235, 255, ${0.8 * (1 - t)})`;
    ctx.beginPath();
    ctx.arc(s.pos.x, s.pos.y, 2 + t * 10, 0, Math.PI * 2);
    ctx.stroke();
    // White plume that collapses back into the sea.
    if (t < 0.4) {
      ctx.fillStyle = `rgba(240, 248, 255, ${0.9 * (1 - t / 0.4)})`;
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, 3 * (1 - t / 0.4) + 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function wrap(v: number, max: number): number {
  return ((v % max) + max) % max;
}

/** Hull outline in base units; keep in step with HULL in hull.ts. */
function hullPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(8, 8);
  ctx.lineTo(-18, 7);
  ctx.lineTo(-18, -7);
  ctx.lineTo(8, -8);
  ctx.closePath();
}

function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, state: GameState): void {
  const damage = 1 - Math.max(0, ship.hp) / ship.maxHp;
  const sinkT = ship.sinkAge === null ? 0 : Math.min(1, ship.sinkAge / SINK_DURATION);
  const list = Math.min(1, sinkT * 2.5); // heels over quickly, then settles lower
  const fade = sinkT < 0.7 ? 1 : 1 - (sinkT - 0.7) / 0.3; // gone once mostly submerged

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(ship.pos.x + ship.jolt.x, ship.pos.y + ship.jolt.y);
  ctx.rotate(ship.heading + ship.joltSpin);
  // Everything below is drawn in ship-local base units (see hull.ts).
  ctx.scale(SHIP_SCALE, SHIP_SCALE);
  drawBowWave(ctx, ship);

  // Listing, seen from above: the deck foreshortens across the beam as she heels,
  // and everything shrinks slightly as she settles lower.
  const settle = 1 - 0.12 * sinkT;
  ctx.scale(settle, settle * (1 - 0.35 * list));

  ctx.fillStyle = ship.team === "player" ? COLORS.player : COLORS.enemy;
  hullPath(ctx);
  ctx.fill();
  // Scorching as the ship takes damage.
  if (damage > 0.3) {
    ctx.globalAlpha = fade * 0.4 * ((damage - 0.3) / 0.7);
    ctx.fillStyle = COLORS.scorch;
    ctx.fill();
  }
  // Water closing over the hull as she goes down.
  if (sinkT > 0) {
    ctx.globalAlpha = fade * 0.8 * sinkT;
    ctx.fillStyle = COLORS.water;
    ctx.fill();
  }
  ctx.globalAlpha = fade;

  if (damage > 0.55 || sinkT > 0) drawFires(ctx, ship, state, sinkT);

  // Masts lean over to the side she's heeling toward.
  ctx.translate(0, ship.listSide * list * 5);
  drawSails(ctx, ship, state);
  ctx.restore();

  if (ship.sinkAge !== null) return;
  // Health bar (unrotated).
  const w = 36 * SHIP_SCALE;
  const x = ship.pos.x - w / 2;
  const y = ship.pos.y - ship.radius - 12;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = COLORS.hpFront;
  ctx.fillRect(x, y, w * Math.max(0, ship.hp / ship.maxHp), 4);
}

/** Small flickering fires on deck at the ship's damage spots. Ship-local coords. */
function drawFires(ctx: CanvasRenderingContext2D, ship: Ship, state: GameState, sinkT: number): void {
  const outer = ctx.globalAlpha;
  const base = outer * (1 - sinkT * 0.8); // the sea puts them out as she sinks
  fireSpots(ship).forEach(([lx, ly], i) => {
    const flicker = 0.75 + 0.25 * Math.sin(state.time * 19 + i * 2.1 + ship.id);
    ctx.globalAlpha = base * 0.75;
    ctx.fillStyle = "#e0662a";
    ctx.beginPath();
    ctx.arc(lx, ly, 2.6 * flicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = base;
    ctx.fillStyle = "#ffd27a";
    ctx.beginPath();
    ctx.arc(lx, ly, 1.2 * flicker, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = outer;
}

const WATER_LAYER = new Set<Particle["kind"]>(["bubble", "wreckage"]);

/** Impact and damage effects. "water" = things on the surface (under ships); "air" = above them. */
function drawParticles(ctx: CanvasRenderingContext2D, state: GameState, layer: "water" | "air"): void {
  for (const p of state.particles) {
    if (WATER_LAYER.has(p.kind) !== (layer === "water")) continue;
    const t = p.age / p.life;
    switch (p.kind) {
      case "flash": {
        const r = p.size * (0.6 + 0.4 * t);
        ctx.fillStyle = `rgba(255, 190, 110, ${0.55 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 248, 225, ${1 - t})`;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "splinter": {
        const dx = Math.cos(p.rot) * p.size * 0.5;
        const dy = Math.sin(p.rot) * p.size * 0.5;
        ctx.strokeStyle = COLORS.wood;
        ctx.globalAlpha = 1 - t * t;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.pos.x - dx, p.pos.y - dy);
        ctx.lineTo(p.pos.x + dx, p.pos.y + dy);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case "smoke":
        ctx.fillStyle = `rgba(150, 150, 155, ${0.3 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.size * (1 + 2 * t), 0, Math.PI * 2);
        ctx.fill();
        break;
      case "gunsmoke":
        // Quick white puff from a gun port: expands a little and is gone in well under a second.
        ctx.fillStyle = `rgba(225, 225, 218, ${0.5 * (1 - t) * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.size * (1 + 1.6 * t), 0, Math.PI * 2);
        ctx.fill();
        break;
      case "dust": // cannonball hitting land
        ctx.fillStyle = `rgba(190, 165, 120, ${0.55 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.size * (1 + 1.5 * t), 0, Math.PI * 2);
        ctx.fill();
        break;
      case "ember":
        ctx.fillStyle = `rgba(255, 170, 70, ${1 - t})`;
        ctx.fillRect(p.pos.x - 0.75, p.pos.y - 0.75, 1.5, 1.5);
        break;
      case "bubble":
        ctx.strokeStyle = `rgba(200, 230, 255, ${0.5 * (1 - t)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.size * (1 + t), 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "wreckage": {
        ctx.save();
        ctx.translate(p.pos.x, p.pos.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = t < 0.7 ? 0.9 : 0.9 * (1 - (t - 0.7) / 0.3);
        ctx.fillStyle = COLORS.wreckage;
        ctx.fillRect(-p.size / 2, -1, p.size, 2);
        ctx.restore();
        break;
      }
    }
  }
}

/** Foam curling off the bow; longer and brighter the faster the ship goes. Ship-local coords. */
function drawBowWave(ctx: CanvasRenderingContext2D, ship: Ship): void {
  const s = Math.min(1, ship.speed / MAX_SPEED);
  if (s < 0.08) return;
  const [fr, fg, fb] = COLORS.foam;
  ctx.strokeStyle = `rgba(${fr}, ${fg}, ${fb}, ${0.15 + 0.45 * s})`;
  ctx.lineWidth = 1 + s;
  ctx.lineCap = "round";
  const reach = 6 + 14 * s; // how far aft the bow wave trails
  const flare = 8 + 6 * s; // how far it spreads to the side
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(22, 0);
    ctx.quadraticCurveTo(14, side * 8, 14 - reach, side * flare);
  }
  ctx.stroke();
}

// Mast positions along the hull (ship-local x) and half-length of each yard.
const MASTS: [number, number][] = [
  [11, 11], // fore
  [1, 13], // main
  [-9, 10], // mizzen
];

/**
 * Square sails seen from above: each yard is a line across the ship, and the sail bellies
 * out along its face when the wind fills it. Drawn in ship-local coordinates.
 */
function drawSails(ctx: CanvasRenderingContext2D, ship: Ship, state: GameState): void {
  const nx = Math.cos(ship.brace); // the sail's face direction
  const ny = Math.sin(ship.brace);
  const yx = -ny; // along the yard
  const yy = nx;

  const fill = sailFill(ship, state.wind);
  const aback = fill < 0;
  const luffing = ship.sinkAge !== null || (!aback && ship.sailEfficiency < 0.3);
  const flap = luffing ? Math.sin(state.time * 30 + ship.id) * 0.5 : 0;
  // Belly depth: deep when drawing well, flat when edge-on or mis-braced, reversed when aback.
  // Sail amount changes the depth only partly, so the bulge stays readable at reduced sail.
  const baseAlpha = ctx.globalAlpha;
  const belly = (0.5 + 0.5 * ship.sails) * 8 * (aback ? fill * 0.6 : fill * (0.25 + 0.75 * ship.sailEfficiency) + flap);

  for (const [mx, half] of MASTS) {
    const x1 = mx + yx * half;
    const y1 = yy * half;
    const x2 = mx - yx * half;
    const y2 = -yy * half;

    if (ship.sails > 0.05) {
      ctx.fillStyle = aback ? COLORS.sailAback : luffing ? COLORS.sailLuffing : COLORS.sail;
      ctx.globalAlpha = baseAlpha * (0.5 + 0.5 * ship.sails);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx + nx * belly * 2, ny * belly * 2, x2, y2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = baseAlpha;
      ctx.strokeStyle = COLORS.sailEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.yard;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

const ISLAND_SEGMENTS = 96;

/** Traces an island outline: the coast pushed out by `offset` px, or scaled by `scale` toward the centre. */
function islandPath(ctx: CanvasRenderingContext2D, island: Island, offset: number, scale = 1): void {
  ctx.beginPath();
  for (let i = 0; i <= ISLAND_SEGMENTS; i++) {
    const a = (i / ISLAND_SEGMENTS) * Math.PI * 2;
    const r = coastRadius(island, a) * scale + offset;
    const x = island.center.x + Math.cos(a) * r;
    const y = island.center.y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function isVisible(state: GameState, p: Vec2, r: number): boolean {
  const { left, top } = viewOrigin(state);
  return p.x + r > left && p.x - r < left + state.viewport.width && p.y + r > top && p.y - r < top + state.viewport.height;
}

/** Shallows, surf, beach, grassland, hills and trees, all derived from the island's coastline. */
function drawIsland(ctx: CanvasRenderingContext2D, state: GameState, island: Island): void {
  if (!isVisible(state, island.center, maxRadius(island) + 40)) return;

  ctx.fillStyle = COLORS.shallowsOuter;
  islandPath(ctx, island, 36);
  ctx.fill();
  ctx.fillStyle = COLORS.shallowsInner;
  islandPath(ctx, island, 16);
  ctx.fill();

  ctx.strokeStyle = `rgba(230, 244, 250, ${0.22 + 0.08 * Math.sin(state.time * 1.3 + island.radius)})`;
  ctx.lineWidth = 1.5;
  islandPath(ctx, island, 5);
  ctx.stroke();

  ctx.fillStyle = COLORS.beach;
  islandPath(ctx, island, 0);
  ctx.fill();
  ctx.fillStyle = COLORS.grass;
  islandPath(ctx, island, -14);
  ctx.fill();
  ctx.fillStyle = COLORS.hills;
  islandPath(ctx, island, 0, 0.55);
  ctx.fill();
  if (island.radius > 200) {
    ctx.fillStyle = COLORS.rock;
    islandPath(ctx, island, 0, 0.22);
    ctx.fill();
  }

  // Scattered trees, at stable positions inside the grassland.
  const seed = Math.round(island.center.x + island.center.y);
  const count = Math.round(island.radius / 7);
  ctx.fillStyle = COLORS.trees;
  for (let i = 0; i < count; i++) {
    const a = hash(i, seed, 11) * Math.PI * 2;
    const r = (coastRadius(island, a) - 22) * Math.sqrt(hash(i, seed, 12));
    const size = 2.5 + 2.5 * hash(i, seed, 13);
    ctx.beginPath();
    ctx.arc(island.center.x + Math.cos(a) * r, island.center.y + Math.sin(a) * r, size, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!state.ports.some((p) => p.islandId === island.id)) {
    ctx.font = "italic 13px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.islandLabel;
    ctx.fillText(island.name, island.center.x, island.center.y + 4);
    ctx.textAlign = "left";
  }
}

/** Pier, settlement, flag, harbour buoys, docking-area ring and name: "that's a port". */
function drawPort(ctx: CanvasRenderingContext2D, state: GameState, port: Port): void {
  const island = state.islands.find((i) => i.id === port.islandId);
  if (!island || !isVisible(state, port.dockZone.center, 400)) return;
  const a = port.angle;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const sx = -uy; // across the pier
  const sy = ux;

  // Settlement: a cluster of roofs just inland of the pier.
  for (let j = -3; j <= 3; j++) {
    const ang = a + j * 0.11;
    const inland = 26 + (Math.abs(j) % 2) * 20 + (j === 0 ? 14 : 0);
    const p = coastPoint(island, ang, -inland);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang + (j % 3) * 0.2);
    ctx.fillStyle = j === 0 ? port.style.roofMain : port.style.roof;
    const w = j === 0 ? 16 : 11;
    ctx.fillRect(-w / 2, -5, w, 10);
    ctx.strokeStyle = "rgba(40, 20, 10, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath(); // roof ridge
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();
    ctx.restore();
  }

  // Pier: planks out from the shore, with posts along both sides.
  const half = 5;
  ctx.fillStyle = COLORS.pier;
  ctx.beginPath();
  ctx.moveTo(port.pierBase.x + sx * half, port.pierBase.y + sy * half);
  ctx.lineTo(port.pierEnd.x + sx * half, port.pierEnd.y + sy * half);
  ctx.lineTo(port.pierEnd.x - sx * half, port.pierEnd.y - sy * half);
  ctx.lineTo(port.pierBase.x - sx * half, port.pierBase.y - sy * half);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(40, 25, 12, 0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const len = Math.hypot(port.pierEnd.x - port.pierBase.x, port.pierEnd.y - port.pierBase.y);
  // T-head across the pier's end, where ships moor alongside.
  const head = 20;
  ctx.fillStyle = COLORS.pier;
  ctx.beginPath();
  ctx.moveTo(port.pierEnd.x + sx * head, port.pierEnd.y + sy * head);
  ctx.lineTo(port.pierEnd.x + sx * head - ux * 7, port.pierEnd.y + sy * head - uy * 7);
  ctx.lineTo(port.pierEnd.x - sx * head - ux * 7, port.pierEnd.y - sy * head - uy * 7);
  ctx.lineTo(port.pierEnd.x - sx * head, port.pierEnd.y - sy * head);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(40, 25, 12, 0.55)";
  ctx.stroke();
  ctx.fillStyle = COLORS.yard;
  for (let d = 12; d <= len; d += 12) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(port.pierBase.x + ux * d + sx * half * side, port.pierBase.y + uy * d + sy * half * side, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Flag on the shore beside the pier.
  const pole = coastPoint(island, a - 0.09, -4);
  const wave = Math.sin(state.time * 5) * 2;
  ctx.fillStyle = port.style.flag;
  ctx.beginPath();
  ctx.moveTo(pole.x, pole.y);
  ctx.lineTo(pole.x + ux * 12 + sx * wave, pole.y + uy * 12 + sy * wave);
  ctx.lineTo(pole.x + ux * 2 + sx * 5, pole.y + uy * 2 + sy * 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.yard;
  ctx.beginPath();
  ctx.arc(pole.x, pole.y, 1.8, 0, Math.PI * 2);
  ctx.fill();

  if (port.style.lighthouse) {
    // White tower on the shore to the other side of the pier, with a slow pulsing light.
    const lh = coastPoint(island, a + 0.16, -8);
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 1.6);
    ctx.fillStyle = `rgba(255, 236, 170, ${0.1 + 0.15 * pulse})`;
    ctx.beginPath();
    ctx.arc(lh.x, lh.y, 14 + 4 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ece8dc";
    ctx.strokeStyle = "rgba(40, 25, 12, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(lh.x, lh.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#c8433a";
    ctx.beginPath();
    ctx.arc(lh.x, lh.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Docking area: a slowly turning dashed ring, brighter when the player is inside it.
  const player = getPlayer(state);
  const inside = player && !player.docked && dockablePort(state, player) === port;
  ctx.save();
  ctx.setLineDash([7, 9]);
  ctx.lineDashOffset = -state.time * 8;
  ctx.strokeStyle = inside ? "rgba(245, 215, 122, 0.55)" : "rgba(245, 215, 122, 0.2)";
  ctx.lineWidth = inside ? 2 : 1.5;
  ctx.beginPath();
  ctx.arc(port.dockZone.center.x, port.dockZone.center.y, port.dockZone.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Harbour buoys either side of the approach: red to port, green to starboard (coming in).
  const zc = port.dockZone.center;
  const rz = port.dockZone.radius;
  const buoys: [number, string][] = [
    [-1, "#c8433a"],
    [1, "#3f9a5a"],
  ];
  for (const [side, color] of buoys) {
    const bob = Math.sin(state.time * 2 + side) * 0.8;
    const bx = zc.x + ux * rz * 0.9 + sx * rz * 0.75 * side;
    const by = zc.y + uy * rz * 0.9 + sy * rz * 0.75 * side + bob;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(240, 240, 235, 0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Name just inland of the settlement (the buildings reach ~60px in from the shore).
  const label = coastPoint(island, a, -100);
  ctx.font = "600 15px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(10, 20, 15, 0.6)";
  ctx.fillText(port.name, label.x + 1, label.y + 1);
  ctx.fillStyle = COLORS.port;
  ctx.fillText(port.name, label.x, label.y);
  ctx.textAlign = "left";
}

/** Bottom-centre pill: "Press F to dock" in a docking area, or the docked banner. */
function drawPortPrompt(ctx: CanvasRenderingContext2D, state: GameState): void {
  const player = getPlayer(state);
  if (!player || player.sinkAge !== null) return;
  let text: string | null = null;
  if (player.docked) {
    const name = getPort(state, player.docked.portId)?.name ?? "port";
    text = player.docked.phase === "moored" ? `Docked at ${name}` : `Coming alongside ${name}…`;
  } else {
    // Approach → furl sails → ship slows → Dock becomes available.
    const approach = dockStatus(state, player);
    if (approach?.status === "sails") text = "Furl sails to dock";
    else if (approach?.status === "slowing") text = "Slowing to dock…";
    else if (approach?.status === "ready") text = `Press F to dock at ${approach.port.name}`;
  }
  if (!text) return;
  ctx.font = "600 14px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 28;
  const x = state.viewport.width / 2 - w / 2;
  const y = state.viewport.height - 56;
  ctx.fillStyle = "rgba(6, 15, 24, 0.75)";
  ctx.strokeStyle = "rgba(232, 195, 90, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 30, 15);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.port;
  ctx.textAlign = "center";
  ctx.fillText(text, state.viewport.width / 2, y + 20);
  ctx.textAlign = "left";
}

/**
 * A piece of cargo as a small container, centred on (0, 0), about 12px across at scale 1.
 * Used both for loot in the water and for icons in the Cargo Hold panel.
 */
function drawCargoIcon(ctx: CanvasRenderingContext2D, def: CargoDef): void {
  const dark = "rgba(30, 20, 10, 0.75)";
  ctx.lineWidth = 1;
  ctx.strokeStyle = dark;
  ctx.fillStyle = def.color;
  switch (def.shape) {
    case "chest": // small sea chest with a coin-gold lid band
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(-5, -3.5, 10, 7);
      ctx.strokeRect(-5, -3.5, 10, 7);
      ctx.fillStyle = def.color;
      ctx.fillRect(-5, -1, 10, 1.6);
      ctx.fillRect(-1, -1.5, 2, 2.6);
      break;
    case "bolt": // rolled bolt of cloth
      ctx.beginPath();
      ctx.roundRect(-5.5, -2.5, 11, 5, 2.5);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.beginPath();
      ctx.moveTo(-2, -2.5);
      ctx.lineTo(-2, 2.5);
      ctx.moveTo(2, -2.5);
      ctx.lineTo(2, 2.5);
      ctx.stroke();
      break;
    case "sack": // tied sack
      ctx.beginPath();
      ctx.ellipse(0, 0.8, 4.5, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-1.5, -3);
      ctx.lineTo(0, -4.5);
      ctx.lineTo(1.5, -3);
      ctx.stroke();
      break;
    case "barrel":
    case "keg": {
      const w = def.shape === "keg" ? 4 : 5;
      ctx.beginPath();
      ctx.ellipse(0, 0, w, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = def.shape === "keg" ? "#9a8f80" : dark; // hoops
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, -3.2);
      ctx.lineTo(-w * 0.45, 3.2);
      ctx.moveTo(w * 0.45, -3.2);
      ctx.lineTo(w * 0.45, 3.2);
      ctx.stroke();
      break;
    }
    case "crate":
      ctx.fillRect(-4, -4, 8, 8);
      ctx.strokeRect(-4, -4, 8, 8);
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(4, 4);
      ctx.moveTo(4, -4);
      ctx.lineTo(-4, 4);
      ctx.stroke();
      break;
  }
}

const LOOT_SCALE = 1.6;

/** Floating cargo: bobs and sways gently, with a faint glint so it reads as collectable. */
function drawLoot(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const item of state.loot) {
    if (item.age < 0) continue; // not surfaced yet
    const surfacing = Math.min(1, item.age / SURFACE_TIME);
    const pop = 1 - (1 - surfacing) * (1 - surfacing); // ease out
    const bob = Math.sin(state.time * 2.2 + item.phase);

    // Foam ring as it breaks the surface.
    if (surfacing < 1) {
      ctx.strokeStyle = `rgba(220, 235, 255, ${0.6 * (1 - surfacing)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(item.pos.x, item.pos.y, 4 + 10 * surfacing, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Glint: a soft pulsing ring that marks it as something to pick up.
    const glint = 0.12 + 0.08 * Math.sin(state.time * 3 + item.phase);
    ctx.strokeStyle = `rgba(255, 230, 160, ${glint * pop})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(item.pos.x, item.pos.y, 13, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(item.pos.x, item.pos.y + bob * 0.8);
    ctx.rotate(item.phase + Math.sin(state.time * 1.3 + item.phase) * 0.18);
    const scale = LOOT_SCALE * pop * (1 + bob * 0.04);
    ctx.scale(scale, scale);
    drawCargoIcon(ctx, CARGO[item.cargo]);
    ctx.restore();
  }
}

/** Collected cargo flies into the ship and a "+ Silk" label rises from it. */
function drawLootPickups(ctx: CanvasRenderingContext2D, state: GameState): void {
  const FLY = 0.3; // seconds for the item to reach the ship
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  state.lootPickups.forEach((p, i) => {
    const ship = state.ships.find((s) => s.id === p.shipId);
    const to = ship ? ship.pos : p.from;
    const def = CARGO[p.cargo];

    if (p.age < FLY) {
      const t = p.age / FLY;
      const e = t * t; // accelerate into the hold
      ctx.save();
      ctx.globalAlpha = 1 - t * 0.5;
      ctx.translate(p.from.x + (to.x - p.from.x) * e, p.from.y + (to.y - p.from.y) * e);
      ctx.scale(LOOT_SCALE * (1 - 0.6 * t), LOOT_SCALE * (1 - 0.6 * t));
      drawCargoIcon(ctx, def);
      ctx.restore();
    }

    // Label rises above the ship; simultaneous pickups stack instead of overlapping.
    const t = p.age / PICKUP_FX_DURATION;
    const alpha = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.55) / 0.45);
    const y = to.y - 48 - t * 22 - (i % 4) * 14; // starts above the health bar
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(10, 20, 30, 0.6)";
    ctx.fillText(cargoText(p.cargo, p.qty), to.x + 1, y + 1);
    ctx.fillStyle = def.shape === "chest" ? "#f5d77a" : "#f4f0e6";
    ctx.fillText(cargoText(p.cargo, p.qty), to.x, y);
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = "left";
}

/** Small panel, bottom-left: what's in the player's hold. Rows light up briefly on pickup. */
function drawCargoHold(ctx: CanvasRenderingContext2D, state: GameState): void {
  const player = getPlayer(state);
  if (!player) return;
  const rows = CARGO_IDS.filter((id) => (player.cargo[id] ?? 0) > 0);
  const ROW = 18;
  const w = 150;
  const h = 26 + Math.max(1, rows.length) * ROW;
  const x = 12;
  const y = state.viewport.height - h - 12;

  ctx.fillStyle = "rgba(6, 15, 24, 0.6)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(200, 225, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText("CARGO HOLD", x + 10, y + 17);

  if (rows.length === 0) {
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText("Empty", x + 10, y + 17 + ROW);
    return;
  }
  ctx.font = "13px system-ui, sans-serif";
  rows.forEach((id, i) => {
    const ry = y + 17 + (i + 1) * ROW;
    const recent = state.lootPickups.some((p) => p.cargo === id && p.age < 0.9);
    if (recent) {
      ctx.fillStyle = "rgba(255, 220, 140, 0.15)";
      ctx.fillRect(x + 4, ry - 13, w - 8, ROW - 1);
    }
    ctx.save();
    ctx.translate(x + 18, ry - 4);
    ctx.scale(1.15, 1.15);
    drawCargoIcon(ctx, CARGO[id]);
    ctx.restore();
    ctx.fillStyle = recent ? "#f5d77a" : COLORS.hud;
    ctx.fillText(CARGO[id].label, x + 32, ry);
    ctx.textAlign = "right";
    ctx.fillText(String(player.cargo[id]), x + w - 10, ry);
    ctx.textAlign = "left";
  });
}

const INDICATOR_INSET = 22; // px from the screen edge
const INDICATOR_SIZE = 9;

/** Where a line from the screen centre toward an off-screen point meets the inset border. */
function edgeMarker(state: GameState, p: Vec2, margin: number): { x: number; y: number; angle: number } | null {
  const { width, height } = state.viewport;
  if (p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin) return null;
  const cx = width / 2;
  const cy = height / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const t = Math.min((cx - INDICATOR_INSET) / Math.abs(dx || 1e-6), (cy - INDICATOR_INSET) / Math.abs(dy || 1e-6));
  return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) };
}

/** Edge-of-screen pointers: a red arrow per off-screen enemy, a gold marker per off-screen port. */
function drawOffscreenIndicators(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const ship of state.ships) {
    if (ship.team !== "enemy" || ship.sinkAge !== null) continue;
    const m = edgeMarker(state, worldToScreen(state, ship.pos), ship.radius);
    if (!m) continue;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = COLORS.enemy;
    ctx.strokeStyle = COLORS.offscreenEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(INDICATOR_SIZE, 0);
    ctx.lineTo(-INDICATOR_SIZE * 0.7, INDICATOR_SIZE * 0.7);
    ctx.lineTo(-INDICATOR_SIZE * 0.7, -INDICATOR_SIZE * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  for (const port of state.ports) {
    const m = edgeMarker(state, worldToScreen(state, port.pierEnd), 40);
    if (!m) continue;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.translate(m.x, m.y);
    ctx.fillStyle = COLORS.port;
    ctx.strokeStyle = COLORS.offscreenEdge;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 6);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Name sits on the inward side of the marker so it never runs off-screen.
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = Math.cos(m.angle) > 0.3 ? "right" : Math.cos(m.angle) < -0.3 ? "left" : "center";
    const tx = Math.cos(m.angle) > 0.3 ? -10 : Math.cos(m.angle) < -0.3 ? 10 : 0;
    const ty = Math.sin(m.angle) > 0.3 ? -10 : Math.sin(m.angle) < -0.3 ? 18 : 4;
    ctx.fillText(port.name, tx, ty);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const player = getPlayer(state);
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText("A/D rudder · W/S raise/furl sails · ←/→ brace yards · Q/E fire port/starboard · F dock", 12, 22);
  ctx.fillStyle = COLORS.hud;
  if (!player || player.sinkAge !== null) {
    ctx.fillText(player ? "She's going down!" : "Sunk! Press R to restart.", 12, 46);
    return;
  }
  if (player.docked) {
    // In port the sailing readouts don't apply; the Port panel and banner say where we are.
    ctx.fillText(`In port · ${getPort(state, player.docked.portId)?.name ?? ""}`, 12, 46);
    return;
  }

  const deg = (r: number) => Math.round((r * 180) / Math.PI);
  const braceText =
    Math.abs(player.brace) < 0.02 ? "square" : `${Math.abs(deg(player.brace))}° to ${player.brace > 0 ? "starboard" : "port"}`;
  const reload = (s: number) => (s > 0 ? s.toFixed(1) + "s" : "ready");
  const lines = [
    `${pointOfSailName(player.offWind)} · ${deg(player.offWind)}° off the wind`,
    `Sails ${Math.round(player.sails * 100)}% · Yards ${braceText} · Speed ${Math.round(player.speed / PX_PER_KNOT)} kn`,
    `Port: ${reload(player.reload.port)}   Starboard: ${reload(player.reload.starboard)}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, 12, 46 + i * 20));

  // Brace quality bar.
  const y = 46 + lines.length * 20 - 6;
  const good = player.sailEfficiency > 0.75;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(12, y, 120, 8);
  ctx.fillStyle = good ? COLORS.braceGood : COLORS.braceBad;
  ctx.fillRect(12, y, 120 * player.sailEfficiency, 8);
  ctx.fillStyle = COLORS.hud;
  ctx.fillText(braceAdvice(player, state.wind), 142, y + 8);
}

function drawWindIndicator(ctx: CanvasRenderingContext2D, state: GameState): void {
  const r = 26;
  const cx = state.viewport.width - r - 20;
  const cy = r + 20;
  ctx.strokeStyle = COLORS.hudDim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Arrow points the way the wind blows.
  const dx = Math.cos(state.wind.dir);
  const dy = Math.sin(state.wind.dir);
  const len = r * (0.35 + 0.5 * state.wind.strength);
  ctx.strokeStyle = COLORS.hud;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - dx * len, cy - dy * len);
  ctx.lineTo(cx + dx * len, cy + dy * len);
  ctx.stroke();
  const hx = cx + dx * len;
  const hy = cy + dy * len;
  ctx.fillStyle = COLORS.hud;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx - dx * 9 - dy * 5, hy - dy * 9 + dx * 5);
  ctx.lineTo(hx - dx * 9 + dy * 5, hy - dy * 9 - dx * 5);
  ctx.closePath();
  ctx.fill();

  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`WIND ${Math.round(windKnots(state.wind))} kn`, cx, cy + r + 16);
  ctx.textAlign = "left";
}
