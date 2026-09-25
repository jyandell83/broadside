export interface Vec2 {
  x: number;
  y: number;
}

export type Side = "port" | "starboard";

export interface Ship {
  id: number;
  team: "player" | "enemy";
  pos: Vec2;
  heading: number; // radians, 0 = facing +x
  speed: number;
  throttle: number; // -0.25..1
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
  nextId: number;
  time: number;
}
