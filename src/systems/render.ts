import type { GameState, Ship } from "../types";
import { getPlayer } from "./state";

const COLORS = {
  water: "#0b1d2e",
  player: "#e8d8a8",
  enemy: "#c0504d",
  shot: "#f2f2f2",
  hud: "#e8e8e8",
  hpBack: "#333",
  hpFront: "#6fcf6f",
};

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(0, 0, state.width, state.height);

  for (const ship of state.ships) drawShip(ctx, ship);

  ctx.fillStyle = COLORS.shot;
  for (const p of state.projectiles) {
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHud(ctx, state);
}

function drawShip(ctx: CanvasRenderingContext2D, ship: Ship): void {
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
  ctx.fillStyle = COLORS.hud;
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("W/S throttle · A/D turn · Q fire port · E fire starboard", 12, 22);
  if (player) {
    const r = (s: number) => (s > 0 ? s.toFixed(1) + "s" : "ready");
    ctx.fillText(`Port: ${r(player.reload.port)}   Starboard: ${r(player.reload.starboard)}`, 12, 42);
  } else {
    ctx.fillText("Sunk! Press R to restart.", 12, 42);
  }
}
