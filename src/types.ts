export interface Vec2 {
  x: number;
  y: number;
}

export type Side = "port" | "starboard";

export interface Wind {
  dir: number; // radians, the direction the wind blows TOWARD
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

export interface Size {
  width: number;
  height: number;
}

export interface GameState {
  world: Size; // playable area in world px; ships are kept inside it
  viewport: Size; // the window, in CSS px
  camera: Vec2; // world position shown at the centre of the viewport
  cameraLead: Vec2; // eased look-ahead offset from the player; see systems/camera.ts
  ships: Ship[];
  projectiles: Projectile[];
  splashes: Splash[];
  wake: WakeParticle[];
  wind: Wind;
  nextId: number;
  time: number;
}
