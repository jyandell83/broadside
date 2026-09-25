import type { GameState, Island, Port, PortStyle, Ship } from "../types";
import { coastPoint } from "./islands";
import { HULL, SHIP_SCALE } from "./hull";
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
const BERTH_CLEARANCE = 4; // px between the pier's end and a moored ship's side
const APPROACH_LEAD = 45; // px along the shore before the berth that a ship ideally comes in from
const DOCK_ZONE_OFFSET = 95; // px from the shore to the docking area's centre
const DOCK_ZONE_RADIUS = 95;
// Docking takes a little seamanship: sails furled and the ship all but stopped. Forgiving on
// purpose: ships never drop below ~1 kn (MIN_SPEED), so "stopped" means slower than this.
const DOCK_MAX_SAILS = 0.05; // sails at or below this count as furled
const DOCK_MAX_SPEED = 3 * PX_PER_KNOT; // px/s (3 kn)

export function createPorts(islands: Island[]): Port[] {
  return PORT_DEFS.map((def) => {
    const island = islands.find((i) => i.id === def.islandId);
    if (!island) throw new Error(`Port ${def.id}: no island ${def.islandId}`);
    const a = def.angle;
    const end = coastPoint(island, a, PIER_LENGTH);
    return {
      ...def,
      pierBase: coastPoint(island, a, -PIER_INLAND),
      pierEnd: end,
      // Moored across the pier's end (a T-head), parallel to the shore: ships glide in along the
      // coast and leave the same way, with no need to turn around.
      berth: coastPoint(island, a, PIER_LENGTH + HULL.halfBeam * SHIP_SCALE + BERTH_CLEARANCE),
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

/**
 * Begin docking: the crew takes the ship in (ships.updateDocking). It moors parallel to the
 * shore, facing whichever way along it needs the least turning from where it stopped.
 */
export function dock(ship: Ship, port: Port): void {
  const options = [port.angle + Math.PI / 2, port.angle - Math.PI / 2].map((h) => {
    const start = { x: port.berth.x - Math.cos(h) * APPROACH_LEAD, y: port.berth.y - Math.sin(h) * APPROACH_LEAD };
    const turn = Math.abs(Math.atan2(Math.sin(h - ship.heading), Math.cos(h - ship.heading)));
    // Past the berth for this heading, the ship would have to come round again.
    const along = (ship.pos.x - port.berth.x) * Math.cos(h) + (ship.pos.y - port.berth.y) * Math.sin(h);
    return { h, cost: turn + Math.hypot(start.x - ship.pos.x, start.y - ship.pos.y) / 120 + (along > 0 ? 1.5 : 0) };
  });
  const heading = options[0]!.cost <= options[1]!.cost ? options[0]!.h : options[1]!.h;
  ship.docked = { portId: port.id, sailsBefore: ship.sails, heading, phase: "approach", path: null, pathLength: [], progress: 0 };
  ship.sails = 0; // sails furled while in port
  ship.pendingShots = [];
}

/** Leave port. Only once moored; the ship lies along the shore, so it sails straight off. */
export function setSail(ship: Ship): void {
  if (ship.docked?.phase !== "moored") return;
  ship.sails = Math.max(0.5, ship.docked.sailsBefore);
  ship.docked = null;
}

export function getPort(state: GameState, id: string): Port | undefined {
  return state.ports.find((p) => p.id === id);
}
