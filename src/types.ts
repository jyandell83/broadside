import type { CargoId } from "./systems/cargo";
import type { SupplyStock } from "./systems/supplies";

export interface Vec2 {
  x: number;
  y: number;
}

export type Side = "port" | "starboard";

export interface Wind {
  dir: number; // radians, the direction the wind blows TOWARD
  climate: number; // radians: the long-run average; the prevailing wind is pulled back toward it
  prevailing: number; // radians: the current prevailing wind, drifting slowly; shifts wander around it
  prevailingTarget: number; // the prevailing wind eases toward this
  nextPrevailingShift: number; // seconds until the prevailing wind picks a new target
  strength: number; // 0..1
  targetDir: number; // the wind eases toward these between shifts
  targetStrength: number;
  nextShift: number; // seconds until a new target is picked
  drift: Vec2; // total distance the air has moved (px); drives the on-water streaks
}

export interface Ship {
  id: number;
  team: "player" | "enemy";
  pos: Vec2;
  heading: number; // radians, 0 = facing +x
  speed: number;
  sails: number; // 0 (furled) .. 1 (full sail)
  brace: number; // radians the sails' face is swung from the bow (+ = toward starboard); 0 = yards square across
  offWind: number; // derived each tick: 0 = bow into the wind, PI = dead downwind
  sailEfficiency: number; // derived each tick: 0..1, how well the brace suits the wind
  radius: number;
  hp: number;
  maxHp: number;
  reload: Record<Side, number>; // seconds until each side can fire again
  wakeDistance: number; // px sailed since the last wake puff
  // Visual-only hit reaction: offset and twist added when drawing, decaying to zero.
  jolt: Vec2;
  joltSpin: number;
  sinkAge: number | null; // null while afloat; seconds since reaching 0 HP while sinking
  listSide: number; // -1 or 1: which way the ship heels as it sinks
  sinkSpin: number; // rad/s the wreck slowly turns while sinking
  smokeTimer: number; // seconds until the next damage smoke puff
  pendingShots: PendingShot[]; // guns of a broadside still waiting to fire (ripple fire)
  cargo: Partial<Record<CargoId, number>>; // the cargo hold: units of each cargo type
  docked: Docking | null; // coming alongside or moored at a port; can't sail or fire
}

/**
 * An island, or one blob of a larger landmass: land whose coastline is `radius` scaled by a few
 * sine "harmonics" around the centre (see systems/islands.ts). Each blob is star-shaped (every
 * coast point is visible from its centre); overlapping blobs that share a `landmass` form one
 * piece of land, which can have shapes a single blob can't, such as a cove.
 */
export interface Island {
  id: string;
  name: string;
  landmass?: string; // blobs sharing this are drawn and labelled as one piece of land
  center: Vec2;
  radius: number;
  harmonics: readonly (readonly [k: number, amp: number, phase: number])[];
}

/** A ship docking at, or moored in, a port. Set by ports.dock; the maneuver runs in ships.updateDocking. */
export interface Docking {
  portId: string;
  sailsBefore: number; // restored on setting sail
  heading: number; // the ship moors facing this way, along the shore
  // "approach": gliding along a planned curve into the berth; "moored": still at the berth,
  // the Port panel opens and Set Sail is allowed.
  phase: "approach" | "moored";
  path: Vec2[] | null; // the approach curve, sampled; planned on the first tick
  pathLength: number[]; // distance along the path at each sample
  progress: number; // px travelled along the path
}

/** How a port looks, so each has its own identity. */
export interface PortStyle {
  roof: string;
  roofMain: string; // the largest building, by the pier
  flag: string;
  lighthouse?: { islandId: string; angle: number }; // a lighthouse on that blob's coast, facing `angle`
}

/** A port on an island's coast. Geometry is derived from the island + `angle` in systems/ports.ts. */
export interface Port {
  id: string;
  name: string;
  islandId: string;
  angle: number; // direction from the island centre the harbour faces (radians)
  style: PortStyle;
  supplies: SupplyStock; // repair supplies in stock; this game's copy, so it can change in play
  pierBase: Vec2; // where the pier meets the shore
  pierEnd: Vec2;
  berth: Vec2; // where a docked ship lies: across the end of the pier, parallel to the shore
  dockZone: { center: Vec2; radius: number }; // enter this to be offered "Dock"
}

/** A piece of cargo floating where a ship went down. Not a collider: only the player's pickup check reads it. */
export interface FloatingLoot {
  cargo: CargoId;
  qty: number;
  pos: Vec2;
  vel: Vec2; // initial scatter; settles into a slow downwind drift
  age: number;
  phase: number; // offsets the bobbing so pieces don't move in unison
}

/** Visual only: a collected piece flying into the ship, with its "+ Silk" label. */
export interface LootPickup {
  cargo: CargoId;
  qty: number;
  from: Vec2;
  shipId: number;
  age: number;
}

export interface PendingShot {
  side: Side;
  gun: number; // index along the hull, 0 = nearest the bow
  delay: number; // seconds until it fires
}

export interface Projectile {
  pos: Vec2;
  vel: Vec2;
  life: number; // seconds remaining; the ball falls into the sea at 0
  maxLife: number;
  owner: number; // ship id
  damage: number;
}

export interface Splash {
  pos: Vec2;
  age: number; // seconds
}

/** A patch of foam left in the water behind a ship. Purely visual. */
export interface WakeParticle {
  pos: Vec2;
  vel: Vec2; // sideways spread; decays so the wake settles in place
  age: number; // seconds
  life: number; // seconds until gone
  strength: number; // 0..1 starting opacity, from the ship's speed when it was laid
  size: number; // px radius at birth
}

export type ParticleKind = "flash" | "splinter" | "smoke" | "gunsmoke" | "dust" | "ember" | "bubble" | "wreckage";

/** A short-lived visual effect (impacts, damage, sinking). Never affects gameplay. */
export interface Particle {
  kind: ParticleKind;
  pos: Vec2;
  vel: Vec2;
  drag: number; // per second; velocity decays by exp(-drag * dt)
  age: number;
  life: number;
  size: number;
  rot: number;
  spin: number; // rad/s
}

export interface Size {
  width: number;
  height: number;
}

export interface GameState {
  world: Size; // playable area in world px; ships are kept inside it
  viewport: Size; // the window, in CSS px
  camera: Vec2; // world position shown at the centre of the viewport
  cameraLead: Vec2; // eased look-ahead offset from the player; see systems/camera.ts
  islands: Island[];
  ports: Port[];
  ships: Ship[];
  projectiles: Projectile[];
  splashes: Splash[];
  wake: WakeParticle[];
  particles: Particle[];
  loot: FloatingLoot[];
  lootPickups: LootPickup[];
  shake: number; // camera shake "trauma", 0..1; decays over time
  wind: Wind;
  nextId: number;
  time: number;
}
