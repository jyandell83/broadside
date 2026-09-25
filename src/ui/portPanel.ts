import type { GameState } from "../types";
import { CARGO, CARGO_IDS } from "../systems/cargo";
import { SUPPLIES, SUPPLY_IDS } from "../systems/supplies";
import { getPort } from "../systems/ports";
import { getPlayer } from "../systems/state";

/**
 * The Port screen, as a DOM panel over the canvas: menus with real buttons (and, later, trading
 * lists) are much simpler in HTML than drawn by hand. It shows whenever the player is moored and
 * reads the player's cargo hold and the port's repair supplies; it keeps no state of its own.
 */
export function createPortPanel(onSetSail: () => void): { sync: (state: GameState) => void } {
  const el = document.createElement("div");
  el.className = "port-panel";
  el.hidden = true;

  const title = document.createElement("h2");
  const sub = document.createElement("p");
  sub.className = "port-sub";
  sub.textContent = "Docked · safe harbour";
  const holdHeading = document.createElement("h3");
  holdHeading.textContent = "Cargo Hold";
  const list = document.createElement("ul");
  list.className = "port-cargo";

  // Repair Supplies: what the port has in stock. A table, so later columns (price, in hold,
  // buy/sell) slot in beside "Available".
  const suppliesHeading = document.createElement("h3");
  suppliesHeading.textContent = "Repair Supplies";
  const supplies = document.createElement("table");
  supplies.className = "port-supplies";
  const head = supplies.createTHead().insertRow();
  for (const [text, cls] of [["Item", ""], ["Available", "qty"]] as const) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = text;
    if (cls) th.className = cls;
    head.append(th);
  }
  const suppliesBody = supplies.createTBody();

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Set Sail";
  button.addEventListener("click", () => {
    button.blur(); // so later key presses go to the game, not the button
    onSetSail();
  });
  const hint = document.createElement("p");
  hint.className = "port-hint";
  hint.textContent = "or press F";

  el.append(title, sub, holdHeading, list, suppliesHeading, supplies, button, hint);
  document.body.append(el);

  let shownFor: string | null = null;

  function fill(state: GameState, portId: string): void {
    const player = getPlayer(state);
    const port = getPort(state, portId);
    title.textContent = port?.name ?? "Port";

    suppliesBody.replaceChildren();
    for (const id of SUPPLY_IDS) {
      const row = suppliesBody.insertRow();
      row.insertCell().textContent = SUPPLIES[id].label;
      const qty = row.insertCell();
      qty.className = "qty";
      qty.textContent = String(port?.supplies[id] ?? 0);
    }

    list.replaceChildren();
    const ids = CARGO_IDS.filter((id) => (player?.cargo[id] ?? 0) > 0);
    if (ids.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Empty";
      list.append(li);
    }
    for (const id of ids) {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = CARGO[id].color;
      const name = document.createElement("span");
      name.textContent = CARGO[id].label;
      const qty = document.createElement("span");
      qty.className = "qty";
      qty.textContent = String(player?.cargo[id] ?? 0);
      li.append(swatch, name, qty);
      list.append(li);
    }
  }

  return {
    /** Call every tick: shows the panel once the player is moored in port, hides it otherwise. */
    sync(state) {
      const docked = getPlayer(state)?.docked;
      const portId = docked?.phase === "moored" ? docked.portId : null;
      if (portId === shownFor) return;
      shownFor = portId;
      if (portId) fill(state, portId);
      el.hidden = portId === null;
    },
  };
}
