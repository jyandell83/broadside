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
  trim: number; // radians the sails are let out from the centreline, 0..PI/2
  offWind: number; // derived each tick: 0 = bow into the wind, PI = dead downwind
  sailEfficiency: number; // derived each tick: 0..1, how well the trim suits the wind
  radius: number;
  hp: number;
  maxHp: number;
  reload: Record<Side, number>; // seconds until each side can fire again
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

export interface GameState {
  width: number;
  height: number;
  ships: Ship[];
  projectiles: Projectile[];
  splashes: Splash[];
  wind: Wind;
  nextId: number;
  time: number;
}
