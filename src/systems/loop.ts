const STEP = 1 / 60; // fixed simulation step in seconds
const MAX_FRAME = 0.25; // clamp long frames (tab switches) to avoid a spiral of death

/** Fixed-timestep update, render every animation frame. */
export function startLoop(update: (dt: number) => void, draw: () => void): void {
  let last = performance.now();
  let acc = 0;

  function frame(now: number) {
    acc += Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
