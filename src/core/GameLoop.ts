export const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 4;

/**
 * Fixed 60 Hz logic with render-on-demand. Logic speed is identical on 60, 120
 * or 144 Hz displays; after a tab switch the accumulator is discarded instead of
 * replaying the missed time.
 */
export class GameLoop {
  private acc = 0;
  private last = 0;
  private running = false;
  private raf = 0;

  constructor(private readonly update: () => void, private readonly render: () => void) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.acc += now - this.last;
    this.last = now;
    let steps = 0;
    while (this.acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      this.update();
      this.acc -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    if (steps > 0) this.render();
    this.raf = requestAnimationFrame(this.frame);
  };
}
