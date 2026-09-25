import type { GameState, Ship } from "../types";
import { getPlayer } from "./state";
import { SPLASH_DURATION } from "./weapons";
import { PX_PER_KNOT, pointOfSailName, trimAdvice, windFromRelative, windKnots } from "./wind";

const COLORS = {
  water: "#0b1d2e",
  streak: "rgba(200, 225, 255, 0.12)",
  player: "#e8d8a8",
  enemy: "#c0504d",
  sail: "#f4f0e6",
  sailLuffing: "#9aa3ad",
  shot: "#f2f2f2",
  hud: "#e8e8e8",
  hudDim: "#8a9aaa",
  hpBack: "#333",
  hpFront: "#6fcf6f",
  trimGood: "#6fcf6f",
  trimBad: "#e0a040",
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

  // Sail swings to the side away from the wind; flaps when it isn't drawing.
  if (ship.sails > 0.05) {
    const windFromStarboard = windFromRelative(ship.heading, state.wind) > 0;
    const luffing = ship.sailEfficiency < 0.3;
    const flap = luffing ? Math.sin(state.time * 40 + ship.id) * 0.12 : 0;
    const boom = Math.PI + (windFromStarboard ? ship.trim : -ship.trim) + flap;
    const len = 8 + 16 * ship.sails;
    ctx.strokeStyle = luffing ? COLORS.sailLuffing : COLORS.sail;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(4 + Math.cos(boom) * len, Math.sin(boom) * len);
    ctx.stroke();
  }
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

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const player = getPlayer(state);
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText("A/D rudder · W/S raise/furl sails · ←/→ haul in/ease out · Q/E fire port/starboard", 12, 22);
  ctx.fillStyle = COLORS.hud;
  if (!player) {
    ctx.fillText("Sunk! Press R to restart.", 12, 46);
    return;
  }

  const deg = (r: number) => Math.round((r * 180) / Math.PI);
  const reload = (s: number) => (s > 0 ? s.toFixed(1) + "s" : "ready");
  const lines = [
    `${pointOfSailName(player.offWind)} · ${deg(player.offWind)}° off the wind`,
    `Sails ${Math.round(player.sails * 100)}% · Trim ${deg(player.trim)}° · Speed ${Math.round(player.speed / PX_PER_KNOT)} kn`,
    `Port: ${reload(player.reload.port)}   Starboard: ${reload(player.reload.starboard)}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, 12, 46 + i * 20));

  // Trim quality bar.
  const y = 46 + lines.length * 20 - 6;
  const good = player.sailEfficiency > 0.75;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(12, y, 120, 8);
  ctx.fillStyle = good ? COLORS.trimGood : COLORS.trimBad;
  ctx.fillRect(12, y, 120 * player.sailEfficiency, 8);
  ctx.fillStyle = COLORS.hud;
  ctx.fillText(trimAdvice(player), 142, y + 8);
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
