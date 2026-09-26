import type { GameState, Port, Ship } from "../types";
import { CARGO } from "../systems/cargo";
import { getPort } from "../systems/ports";
import { getPlayer } from "../systems/state";
import { SUPPLIES, SUPPLY_IDS } from "../systems/supplies";
import {
  CARGO_VALUE,
  SELLABLE_CARGO,
  SUPPLY_PRICE,
  buyBlocker,
  buySupply,
  coinOf,
  sellBlocker,
  sellCargo,
  type TradeResult,
} from "../systems/trade";

const FEEDBACK_MS = 2500;

/**
 * The Port screen, as a DOM panel over the canvas: menus with real buttons are much simpler in
 * HTML than drawn by hand. It shows while the player is moored and lets them sell cargo and buy
 * repair supplies. Prices and rules live in systems/trade.ts; this only displays them and calls
 * the trade functions. It keeps no game state of its own.
 */
export function createPortPanel(onSetSail: () => void): { sync: (state: GameState) => void } {
  const el = document.createElement("div");
  el.className = "port-panel";
  el.hidden = true;

  const title = document.createElement("h2");
  const sub = document.createElement("p");
  sub.className = "port-sub";
  sub.textContent = "Docked · safe harbour";

  const coin = document.createElement("div");
  coin.className = "port-coin";
  const coinLabel = document.createElement("span");
  coinLabel.textContent = "Coin";
  const coinValue = document.createElement("span");
  coinValue.className = "qty";
  coin.append(coinLabel, coinValue);

  const feedback = document.createElement("p");
  feedback.className = "port-feedback";
  feedback.setAttribute("aria-live", "polite");

  // Cargo Hold: what's aboard, what the port pays for it, and a Sell button per row.
  const holdHeading = document.createElement("h3");
  holdHeading.textContent = "Cargo Hold";
  const cargo = tradeTable(["Item", "Qty", "Each", ""]);

  // Repair Supplies: the port's stock and prices, what's already aboard, and a Buy button per row.
  const suppliesHeading = document.createElement("h3");
  suppliesHeading.textContent = "Repair Supplies";
  const supplies = tradeTable(["Item", "Price", "Available", "Aboard", ""]);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "set-sail";
  button.textContent = "Set Sail";
  button.addEventListener("click", () => {
    button.blur(); // so later key presses go to the game, not the button
    onSetSail();
  });
  const hint = document.createElement("p");
  hint.className = "port-hint";
  hint.textContent = "or press F";

  el.append(title, sub, coin, feedback, holdHeading, cargo.table, suppliesHeading, supplies.table, button, hint);
  document.body.append(el);

  let shownFor: string | null = null;
  let latest: GameState | null = null; // the current game, for button clicks
  let feedbackTimer = 0;

  function showResult(result: TradeResult): void {
    feedback.textContent = result.ok ? result.message : result.reason;
    feedback.classList.toggle("error", !result.ok);
    feedback.classList.add("visible");
    window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => feedback.classList.remove("visible"), FEEDBACK_MS);
    if (result.ok) {
      coin.classList.remove("bump");
      void coin.offsetWidth; // restart the flash animation
      coin.classList.add("bump");
    }
  }

  /** Runs a trade against the current game, then redraws the panel. */
  function trade(run: (ship: Ship, port: Port) => TradeResult): void {
    const ship = latest && getPlayer(latest);
    const port = latest && shownFor ? getPort(latest, shownFor) : undefined;
    if (!latest || !ship || !port) return;
    showResult(run(ship, port));
    fill(latest, port.id);
  }

  function fill(state: GameState, portId: string): void {
    const player = getPlayer(state);
    const port = getPort(state, portId);
    title.textContent = port?.name ?? "Port";
    if (!player || !port) return;
    coinValue.textContent = String(coinOf(player));

    cargo.body.replaceChildren();
    const aboard = SELLABLE_CARGO.filter((id) => (player.cargo[id] ?? 0) > 0);
    if (aboard.length === 0) {
      const cell = cargo.body.insertRow().insertCell();
      cell.colSpan = 4;
      cell.className = "empty";
      cell.textContent = "Nothing to sell";
    }
    for (const id of aboard) {
      const row = cargo.body.insertRow();
      const name = row.insertCell();
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = CARGO[id].color;
      name.append(swatch, CARGO[id].label);
      numberCell(row, player.cargo[id] ?? 0);
      numberCell(row, CARGO_VALUE[id]);
      actionCell(row, "Sell", sellBlocker(player, port, id), () => trade((ship, p) => sellCargo(ship, p, id)));
    }

    supplies.body.replaceChildren();
    for (const id of SUPPLY_IDS) {
      const row = supplies.body.insertRow();
      row.insertCell().textContent = SUPPLIES[id].label;
      numberCell(row, SUPPLY_PRICE[id]);
      numberCell(row, port.supplies[id]);
      numberCell(row, player.supplies[id] ?? 0);
      actionCell(row, "Buy", buyBlocker(player, port, id), () => trade((ship, p) => buySupply(ship, p, id)));
    }
  }

  return {
    /** Call every tick: shows the panel once the player is moored in port, hides it otherwise. */
    sync(state) {
      latest = state;
      const docked = getPlayer(state)?.docked;
      const portId = docked?.phase === "moored" ? docked.portId : null;
      if (portId === shownFor) return;
      shownFor = portId;
      if (portId) fill(state, portId);
      el.hidden = portId === null;
      feedback.classList.remove("visible");
    },
  };
}

function tradeTable(headings: string[]): { table: HTMLTableElement; body: HTMLTableSectionElement } {
  const table = document.createElement("table");
  table.className = "port-trade";
  const head = table.createTHead().insertRow();
  headings.forEach((text, i) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = text;
    if (i > 0) th.className = "qty";
    head.append(th);
  });
  return { table, body: table.createTBody() };
}

function numberCell(row: HTMLTableRowElement, value: number): void {
  const cell = row.insertCell();
  cell.className = "qty";
  cell.textContent = String(value);
}

/** A small Buy/Sell button, disabled with the reason as its tooltip when the trade isn't possible. */
function actionCell(row: HTMLTableRowElement, label: string, blocker: string | null, onClick: () => void): void {
  const cell = row.insertCell();
  cell.className = "action";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "trade";
  button.textContent = label;
  button.disabled = blocker !== null;
  if (blocker) button.title = blocker;
  button.addEventListener("click", onClick);
  cell.append(button);
}
