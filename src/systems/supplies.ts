/**
 * Ship supplies: repair materials and ammunition. Ports stock them (Port.supplies), ships carry
 * them (Ship.supplies), and they're bought through systems/trade.ts. Add a supply, or a property
 * such as weight, here: the Port panel and the hold list whatever this table holds, in this order.
 * Prices live in trade.ts.
 */
export interface SupplyDef {
  label: string;
  singular?: string; // for "Bought 1 …" when the label is a plural
}

export const SUPPLIES = {
  timber: { label: "Timber" },
  oakum: { label: "Oakum" }, // tarred fibre caulked into hull seams
  pitch: { label: "Pitch" },
  rope: { label: "Rope" },
  sailcloth: { label: "Sailcloth" },
  iron: { label: "Iron" },
  cannonballs: { label: "Cannonballs", singular: "Cannonball" }, // ammunition: each gun that fires uses one (weapons.ts)
} as const satisfies Record<string, SupplyDef>;

export type SupplyId = keyof typeof SUPPLIES;

/** Display order. */
export const SUPPLY_IDS = Object.keys(SUPPLIES) as SupplyId[];

/** Units of each supply, e.g. a port's stock. */
export type SupplyStock = Record<SupplyId, number>;
