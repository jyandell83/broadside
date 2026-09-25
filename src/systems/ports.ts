import type { GameState, Island, Port, PortStyle, Ship } from "../types";
import { coastPoint } from "./islands";
import { PX_PER_KNOT } from "./wind";

/**
 * Port definitions. A port is an island + the direction its harbour faces; the pier, berth and
 * docking area are derived from that. Future per-port data (prices, services, contracts)
 * belongs on these entries.
 */
const PORT_DEFS: { id: string; name: string; islandId: string; angle: number; style: PortStyle }[] = [
  // The two ports face each other across the open centre (Ashby east, Carrow west), so they're
  // approached across the usual northerly wind, and when the wind drifts one stays reachable.
  {
    id: "port-ashby",
    name: "Port Ashby",
    islandId: "ashby",
    angle: 0,
    style: { roof: "#a4553a", roofMain: "#8e3f2a", flag: "#e8c35a" }, // terracotta roofs, gold flag
  },
  {
    id: "port-carrow",
    name: "Port Carrow",
    islandId: "carrow",
    angle: Math.PI,
    style: { roof: "#5d6f84", roofMain: "#46566a", flag: "#c8433a", lighthouse: true }, // slate roofs, red flag, lighthouse
  },
];

const PIER_LENGTH = 55; // px out from the shore
const PIER_INLAND = 8; // px the pier starts inland, so it meets the beach cleanly
const BERTH_SIDE = 26; // px from the pier's centreline to a docked ship's centre
const DOCK_ZONE_OFFSET = 95; // px from the shore to the docking area's centre
const DOCK_ZONE_RADIUS = 95;
const BERTH_EASE = 2.5; // per second: how quickly a docking ship settles into its berth
// Docking takes a little seamanship: sails furled and the ship all but stopped. Forgiving on
// purpose: ships never drop below ~1 kn (MIN_SPEED), so "stopped" means slower than this.
const DOCK_MAX_SAILS = 0.05; // sails at or below this count as furled
const DOCK_MAX_SPEED = 3 * PX_PER_KNOT; // px/s (3 kn)

export function createPorts(islands: Island[]): Port[] {
  return PORT_DEFS.map((def) => {
    const island = islands.find((i) => i.id === def.islandId);
    if (!island) throw new Error(`Port ${def.id}: no island ${def.islandId}`);
    const a = def.angle;
    const side = { x: -Math.sin(a), y: Math.cos(a) }; // perpendicular to the pier
    const end = coastPoint(island, a, PIER_LENGTH);
    const berthAlong = coastPoint(island, a, PIER_LENGTH * 0.7);
    return {
      ...def,
      pierBase: coastPoint(island, a, -PIER_INLAND),
      pierEnd: end,
      berth: { x: berthAlong.x + side.x * BERTH_SIDE, y: berthAlong.y + side.y * BERTH_SIDE },
      berthHeading: a,
      dockZone: { center: coastPoint(island, a, DOCK_ZONE_OFFSET), radius: DOCK_ZONE_RADIUS },
    };
  });
}

/** The port whose docking area the ship is in, if any. */
export function dockablePort(state: GameState, ship: Ship): Port | undefined {
  if (ship.docked || ship.sinkAge !== null) return undefined;
  return state.ports.find((p) => Math.hypot(ship.pos.x - p.dockZone.center.x, ship.pos.y - p.dockZone.center.y) <= p.dockZone.radius);
}

/**
 * Docking state for a ship in a port's docking area:
 * "sails" = sails still set, "slowing" = furled but still making way, "ready" = can dock now.
 */
export function dockStatus(state: GameState, ship: Ship): { port: Port; status: "sails" | "slowing" | "ready" } | undefined {
  const port = dockablePort(state, ship);
  if (!port) return undefined;
  if (ship.sails > DOCK_MAX_SAILS) return { port, status: "sails" };
  if (ship.speed > DOCK_MAX_SPEED) return { port, status: "slowing" };
  return { port, status: "ready" };
}

export function dock(ship: Ship, port: Port): void {
  ship.docked = { portId: port.id, sailsBefore: ship.sails };
  ship.sails = 0; // sails furled while in port
  ship.pendingShots = [];
}

/** Leave port: the ship lies bow-out, so it sails straight away from the pier. */
export function setSail(ship: Ship): void {
  if (!ship.docked) return;
  ship.sails = Math.max(0.5, ship.docked.sailsBefore);
  ship.docked = null;
}

/** Docked ships ease into their berth and lie still. */
export function updateDocked(state: GameState, ship: Ship, dt: number): void {
  const port = state.ports.find((p) => p.id === ship.docked?.portId);
  if (!port) return;
  const k = 1 - Math.exp(-BERTH_EASE * dt);
  ship.pos.x += (port.berth.x - ship.pos.x) * k;
  ship.pos.y += (port.berth.y - ship.pos.y) * k;
  const dh = Math.atan2(Math.sin(port.berthHeading - ship.heading), Math.cos(port.berthHeading - ship.heading));
  ship.heading += dh * k;
  ship.speed = 0;
}

export function getPort(state: GameState, id: string): Port | undefined {
  return state.ports.find((p) => p.id === id);
}
