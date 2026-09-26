import type { Port, Ship } from "../types";
import { CARGO, type CargoId } from "./cargo";
import { SUPPLIES, type SupplyId } from "./supplies";

// Base values, in coin per unit: rough Age of Sail relative worth, for rebalancing later. Every
// port trades at these for now (no port-specific prices, margins or changing markets).

/** What a port pays for one unit of cargo. Coin is the currency, so it isn't traded. */
export const CARGO_VALUE: Record<Exclude<CargoId, "coin">, number> = {
  silk: 40,
  spices: 30,
  gunpowder: 15,
  sugar: 10,
  rum: 8,
  provisions: 3,
};

/** What one unit of a repair supply costs at port. */
export const SUPPLY_PRICE: Record<SupplyId, number> = {
  sailcloth: 10,
  iron: 9,
  timber: 8,
  rope: 6,
  pitch: 3,
  oakum: 2,
};

export type SellableCargo = keyof typeof CARGO_VALUE;
export const SELLABLE_CARGO = Object.keys(CARGO_VALUE) as SellableCargo[];

export type TradeResult = { ok: true; message: string } | { ok: false; reason: string };

export function coinOf(ship: Ship): number {
  return ship.cargo.coin ?? 0;
}

function mooredAt(ship: Ship, port: Port): boolean {
  return ship.docked?.phase === "moored" && ship.docked.portId === port.id;
}

/** Why the ship can't buy one unit of this supply here, or null if it can. */
export function buyBlocker(ship: Ship, port: Port, id: SupplyId): string | null {
  if (!mooredAt(ship, port)) return "Not docked here";
  if (port.supplies[id] <= 0) return "Out of stock";
  if (coinOf(ship) < SUPPLY_PRICE[id]) return "Not enough coin";
  return null;
}

/** Buys one unit: coin from the ship, a unit from the port's stock into the ship's supplies. */
export function buySupply(ship: Ship, port: Port, id: SupplyId): TradeResult {
  const blocker = buyBlocker(ship, port, id);
  if (blocker) return { ok: false, reason: blocker };
  const price = SUPPLY_PRICE[id];
  ship.cargo.coin = coinOf(ship) - price;
  port.supplies[id] -= 1;
  ship.supplies[id] = (ship.supplies[id] ?? 0) + 1;
  return { ok: true, message: `Bought 1 ${SUPPLIES[id].label} for ${price} coin` };
}

/** Why the ship can't sell one unit of this cargo here, or null if it can. */
export function sellBlocker(ship: Ship, port: Port, id: SellableCargo): string | null {
  if (!mooredAt(ship, port)) return "Not docked here";
  if ((ship.cargo[id] ?? 0) <= 0) return "None aboard";
  return null;
}

/** Sells one unit of cargo for its value. Ports always have the coin to pay, for now. */
export function sellCargo(ship: Ship, port: Port, id: SellableCargo): TradeResult {
  const blocker = sellBlocker(ship, port, id);
  if (blocker) return { ok: false, reason: blocker };
  const value = CARGO_VALUE[id];
  ship.cargo[id] = (ship.cargo[id] ?? 0) - 1;
  ship.cargo.coin = coinOf(ship) + value;
  return { ok: true, message: `Sold 1 ${CARGO[id].label} for ${value} coin` };
}
