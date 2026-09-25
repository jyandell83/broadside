import type { GameState, Particle, Ship } from "../types";
import { getPlayer } from "./state";
import { SPLASH_DURATION } from "./weapons";
import { worldToScreen } from "./camera";
import { SINK_DURATION, fireSpots, shakeOffset } from "./effects";
import { SHIP_SCALE } from "./hull";
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
  ctx.restore();

  // Screen space.
  drawOffscreenIndicators(ctx, state);
  drawHud(ctx, state);
  drawWindIndicator(ctx, state);
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

const INDICATOR_INSET = 22; // px from the screen edge
const INDICATOR_SIZE = 9;

/** A small arrow at the screen edge pointing toward each off-screen enemy. */
function drawOffscreenIndicators(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { width, height } = state.viewport;
  const cx = width / 2;
  const cy = height / 2;
  for (const ship of state.ships) {
    if (ship.team !== "enemy" || ship.sinkAge !== null) continue;
    const p = worldToScreen(state, ship.pos);
    const r = ship.radius;
    if (p.x > -r && p.x < width + r && p.y > -r && p.y < height + r) continue;

    // Slide from the screen centre toward the ship until hitting the inset border.
    const dx = p.x - cx;
    const dy = p.y - cy;
    const t = Math.min((cx - INDICATOR_INSET) / Math.abs(dx || 1e-6), (cy - INDICATOR_INSET) / Math.abs(dy || 1e-6));
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(cx + dx * t, cy + dy * t);
    ctx.rotate(angle);
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
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const player = getPlayer(state);
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText("A/D rudder · W/S raise/furl sails · ←/→ brace yards · Q/E fire port/starboard", 12, 22);
  ctx.fillStyle = COLORS.hud;
  if (!player || player.sinkAge !== null) {
    ctx.fillText(player ? "She's going down!" : "Sunk! Press R to restart.", 12, 46);
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
