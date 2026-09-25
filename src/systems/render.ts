import type { GameState, Ship } from "../types";
import { getPlayer } from "./state";
import { SPLASH_DURATION } from "./weapons";
import { PX_PER_KNOT, braceAdvice, pointOfSailName, sailFill, windKnots } from "./wind";

const COLORS = {
  water: "#0b1d2e",
  streak: "rgba(200, 225, 255, 0.12)",
  // Hulls are darker than the sails so the sails always read against them.
  player: "#9c7447",
  enemy: "#8e3530",
  sail: "#f4f0e6",
  sailLuffing: "#9aa3ad",
  sailAback: "#d9a58f",
  yard: "#3b2715",
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
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(0, 0, state.width, state.height);

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

  drawHud(ctx, state);
  drawWindIndicator(ctx, state);
}

/** Streaks carried by the wind so its direction and speed are always visible. */
function drawWindStreaks(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { dir, drift } = state.wind;
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
    const x = wrap(bx * state.width + drift.x * gust, state.width);
    const y = wrap(by * state.height + drift.y * gust, state.height);
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

function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, state: GameState): void {
  ctx.save();
  ctx.translate(ship.pos.x, ship.pos.y);
  ctx.rotate(ship.heading);
  ctx.fillStyle = ship.team === "player" ? COLORS.player : COLORS.enemy;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(8, 8);
  ctx.lineTo(-18, 7);
  ctx.lineTo(-18, -7);
  ctx.lineTo(8, -8);
  ctx.closePath();
  ctx.fill();

  drawSails(ctx, ship, state);
  ctx.restore();

  // Health bar (unrotated).
  const w = 36;
  const x = ship.pos.x - w / 2;
  const y = ship.pos.y - ship.radius - 12;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = COLORS.hpFront;
  ctx.fillRect(x, y, w * Math.max(0, ship.hp / ship.maxHp), 4);
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
  const luffing = !aback && ship.sailEfficiency < 0.3;
  const flap = luffing ? Math.sin(state.time * 30 + ship.id) * 0.5 : 0;
  // Belly depth: deep when drawing well, flat when edge-on or mis-braced, reversed when aback.
  // Sail amount changes the depth only partly, so the bulge stays readable at reduced sail.
  const belly = (0.5 + 0.5 * ship.sails) * 8 * (aback ? fill * 0.6 : fill * (0.25 + 0.75 * ship.sailEfficiency) + flap);

  for (const [mx, half] of MASTS) {
    const x1 = mx + yx * half;
    const y1 = yy * half;
    const x2 = mx - yx * half;
    const y2 = -yy * half;

    if (ship.sails > 0.05) {
      ctx.fillStyle = aback ? COLORS.sailAback : luffing ? COLORS.sailLuffing : COLORS.sail;
      ctx.globalAlpha = 0.5 + 0.5 * ship.sails;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx + nx * belly * 2, ny * belly * 2, x2, y2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
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

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const player = getPlayer(state);
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText("A/D rudder · W/S raise/furl sails · ←/→ brace yards · Q/E fire port/starboard", 12, 22);
  ctx.fillStyle = COLORS.hud;
  if (!player) {
    ctx.fillText("Sunk! Press R to restart.", 12, 46);
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
  const cx = state.width - r - 20;
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
