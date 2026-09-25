/**
 * Repair supplies. Ports stock these (Port.supplies); later they'll be bought, carried and used
 * in repairs. Add a supply, or a property such as a base price or weight, here: the Port panel
 * lists whatever this table holds, in this order.
 */
export interface SupplyDef {
  label: string;
}

export const SUPPLIES = {
  timber: { label: "Timber" },
  oakum: { label: "Oakum" }, // tarred fibre caulked into hull seams
  pitch: { label: "Pitch" },
  rope: { label: "Rope" },
  sailcloth: { label: "Sailcloth" },
  iron: { label: "Iron" },
} as const satisfies Record<string, SupplyDef>;

export type SupplyId = keyof typeof SUPPLIES;

/** Display order. */
export const SUPPLY_IDS = Object.keys(SUPPLIES) as SupplyId[];

/** Units of each supply, e.g. a port's stock. */
export type SupplyStock = Record<SupplyId, number>;
