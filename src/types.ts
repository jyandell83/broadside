export interface Vec2 {
  x: number;
  y: number;
}

export type Side = "port" | "starboard";

export interface Wind {
  dir: number; // radians, the direction the wind blows TOWARD
  strength: number; // 0..1
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
  life: number; // seconds remaining
  owner: number; // ship id
  damage: number;
}

export interface GameState {
  width: number;
  height: number;
  ships: Ship[];
  projectiles: Projectile[];
  wind: Wind;
  nextId: number;
  time: number;
}
