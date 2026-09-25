/**
 * Cargo types. Add a new cargo by adding an entry here; the loot drops, pickup text and the
 * Cargo Hold panel all read from this table. Future properties (value, weight, rarity,
 * effects) belong on CargoDef too.
 */
export interface CargoDef {
  label: string;
  /** How it floats in the water: the container it's packed in. */
  shape: "chest" | "bolt" | "sack" | "barrel" | "keg" | "crate";
  color: string; // main colour of the container or goods
  qty: [number, number]; // min..max units in one floating piece
}

export const CARGO = {
  coin: { label: "Coin", shape: "chest", color: "#e8c35a", qty: [8, 20] },
  silk: { label: "Silk", shape: "bolt", color: "#b0467a", qty: [1, 2] },
  spices: { label: "Spices", shape: "sack", color: "#d9812e", qty: [1, 2] },
  sugar: { label: "Sugar", shape: "sack", color: "#efe7d4", qty: [1, 3] },
  rum: { label: "Rum", shape: "barrel", color: "#8a5a2b", qty: [1, 2] },
  gunpowder: { label: "Gunpowder", shape: "keg", color: "#3a3430", qty: [1, 2] },
  provisions: { label: "Provisions", shape: "crate", color: "#b8925a", qty: [1, 3] },
} as const satisfies Record<string, CargoDef>;

export type CargoId = keyof typeof CARGO;

/** Display order for the hold. */
export const CARGO_IDS = Object.keys(CARGO) as CargoId[];

const PIECES_MIN = 2;
const PIECES_MAX = 4;

/** What a sunk ship leaves floating: a few random pieces from the pool (repeats allowed). */
export function rollWreckCargo(): { cargo: CargoId; qty: number }[] {
  const count = PIECES_MIN + Math.floor(Math.random() * (PIECES_MAX - PIECES_MIN + 1));
  return Array.from({ length: count }, () => {
    const cargo = CARGO_IDS[Math.floor(Math.random() * CARGO_IDS.length)]!;
    const [min, max] = CARGO[cargo].qty;
    return { cargo, qty: min + Math.floor(Math.random() * (max - min + 1)) };
  });
}

export function cargoText(cargo: CargoId, qty: number): string {
  return qty > 1 ? `+ ${qty} ${CARGO[cargo].label}` : `+ ${CARGO[cargo].label}`;
}
