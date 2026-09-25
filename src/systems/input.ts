export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener("keydown", (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    target.addEventListener("keyup", (e) => this.held.delete(e.code));
    target.addEventListener("blur", () => this.held.clear());
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** True only on the first frame a key goes down. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Call once at the end of each update tick. */
  endFrame(): void {
    this.pressed.clear();
  }
}
