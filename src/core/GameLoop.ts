export const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 4;

/**
 * Fixed 60 Hz logic, drawn on every display frame. Logic speed is identical on 60,
 * 120 or 144 Hz displays; `render` gets how far (0..1) the clock is past the last
 * tick, so faster displays can show the motion in between. After a tab switch the
 * accumulator is discarded instead of replaying the missed time.
 */
export class GameLoop {
  private acc = 0;
  private last = 0;
  private running = false;
  private raf = 0;
  /** Speed of the game clock: below 1 is slow motion. */
  scale = 1;
  /** Per drawn frame, if set: its interval and the CPU times of its logic ticks and of its drawing (ms). */
  probe: ((frameMs: number, updateMs: number, renderMs: number) => void) | null = null;

  constructor(
    private readonly update: () => void,
    private readonly render: (alpha: number, ms: number, now: number) => void,
    private readonly beforeStep: () => void = () => undefined,
  ) {
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
    const ms = now - this.last;
    this.acc += ms * this.scale;
    this.last = now;
    const t0 = this.probe ? performance.now() : 0;
    let steps = 0;
    while (this.acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      this.beforeStep();
      this.update();
      this.acc -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    const t1 = this.probe ? performance.now() : 0;
    this.render(this.acc / STEP_MS, ms, now);
    this.probe?.(ms, t1 - t0, performance.now() - t1);
    this.raf = requestAnimationFrame(this.frame);
  };
}
