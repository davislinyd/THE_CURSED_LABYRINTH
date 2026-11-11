/** Frames slower than this count against the current scale; faster than FAST_MS, for it. */
const SLOW_MS = 20;
const FAST_MS = 18;
/** A hitch (a tab switch, a shader compile) says nothing about the scale. */
const HITCH_MS = 100;
/** Slow frames (net of fast ones) before a step down, and smooth frames before a try upward. */
const DOWN_AFTER = 45;
const UP_AFTER = 600;
/** One step: about 12 % fewer pixels, small enough not to read as a jump. */
const STEP = 0.06;
/** A scale that ran too slow is not tried again for this long (ms). */
const CEILING_MS = 60000;
/** With a GPU timer: only step up while the GPU uses less than this share of a 60 Hz frame. */
const GPU_HEADROOM_MS = 11;

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * AUTO render scale. Fed every drawn frame with its interval: below about 50 fps for a
 * while it steps down (two steps at once when far too slow); after a long smooth run it
 * tries one step up again, but not to a scale that was too slow in the last minute, and
 * not while a GPU timer says there is no headroom. Pure logic, so it can be tested.
 */
export class DynamicResolution {
  scale = 1;
  private ceiling = 1;
  private ceilingUntil = 0;
  private slow = 0;
  private fast = 0;
  /** Smoothed frame interval (ms). */
  private avg = 1000 / 60;

  constructor(public min = 0.6, public max = 1) {}

  reset(min = this.min): void {
    this.min = min;
    this.scale = this.ceiling = this.max;
    this.slow = this.fast = this.ceilingUntil = 0;
    this.avg = 1000 / 60;
  }

  /** One drawn frame: its interval, the clock, and the GPU's time for it if known. True when the scale changed. */
  sample(ms: number, now: number, gpuMs: number | null = null): boolean {
    if (ms > HITCH_MS) return false;
    this.avg += (ms - this.avg) * 0.1;
    if (ms > SLOW_MS) {
      this.slow++;
      this.fast = 0;
    } else {
      this.slow = Math.max(0, this.slow - 1);
      if (ms < FAST_MS) this.fast++;
    }
    if (this.slow > DOWN_AFTER && this.scale > this.min) {
      this.ceiling = this.scale;
      this.ceilingUntil = now + CEILING_MS;
      // far over budget (under 36 fps): one step would only be followed by another
      this.scale = round(Math.max(this.min, this.scale - (this.avg > 28 ? 2 : 1) * STEP));
      this.slow = this.fast = 0;
      return true;
    }
    if (this.fast > UP_AFTER && this.scale < this.max) {
      this.fast = 0;
      const up = round(Math.min(this.max, this.scale + STEP));
      const tried = up >= this.ceiling && now <= this.ceilingUntil;
      if (!tried && (gpuMs === null || gpuMs < GPU_HEADROOM_MS)) {
        this.scale = up;
        return true;
      }
    }
    return false;
  }
}
