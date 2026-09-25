import type { CargoId } from "./systems/cargo";

export interface Vec2 {
  x: number;
  y: number;
}

export type Side = "port" | "starboard";

export interface Wind {
  dir: number; // radians, the direction the wind blows TOWARD
  prevailing: number; // radians: shifts wander around this, never further than MAX_SHIFT from it
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
  docked: { portId: string; sailsBefore: number } | null; // alongside a port's pier; can't sail or fire
}

/**
 * An island: land whose coastline is `radius` scaled by a few sine "harmonics" around the centre
 * (see systems/islands.ts). Star-shaped by construction: every coast point is visible from the centre.
 */
export interface Island {
  id: string;
  name: string;
  center: Vec2;
  radius: number;
  harmonics: readonly (readonly [k: number, amp: number, phase: number])[];
}

/** A port on an island's coast. Geometry is derived from the island + `angle` in systems/ports.ts. */
export interface Port {
  id: string;
  name: string;
  islandId: string;
  angle: number; // direction from the island centre the harbour faces (radians)
  pierBase: Vec2; // where the pier meets the shore
  pierEnd: Vec2;
  berth: Vec2; // where a docked ship lies, alongside the pier
  berthHeading: number; // docked ships lie bow-out, ready to leave
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
