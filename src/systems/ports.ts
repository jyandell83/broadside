import type { GameState, Island, Port, Ship } from "../types";
import { coastPoint } from "./islands";

/**
 * Port definitions. A port is an island + the direction its harbour faces; the pier, berth and
 * docking area are derived from that. Future per-port data (prices, services, contracts)
 * belongs on these entries.
 */
const PORT_DEFS: { id: string; name: string; islandId: string; angle: number }[] = [
  { id: "port-ashby", name: "Port Ashby", islandId: "ashby", angle: Math.PI * 0.25 }, // faces the open sea to the south-east
];

const PIER_LENGTH = 55; // px out from the shore
const PIER_INLAND = 8; // px the pier starts inland, so it meets the beach cleanly
const BERTH_SIDE = 26; // px from the pier's centreline to a docked ship's centre
const DOCK_ZONE_OFFSET = 95; // px from the shore to the docking area's centre
const DOCK_ZONE_RADIUS = 95;
const BERTH_EASE = 2.5; // per second: how quickly a docking ship settles into its berth

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
