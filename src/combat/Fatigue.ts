/** How the hero's legs moved this tick. */
export type Pace = 'rest' | 'walk' | 'run';

/** Seconds of running, or of walking, that wear the hero out; seconds of standing still that rest it all off. */
export const TIRE_RUN = 8;
export const TIRE_WALK = 120;
export const REST = 5;
/** Worn out, the hero may run again once rested below this. */
export const RECOVERED = 0.35;
/** Speed of a run, and of a worn-out walk, as a share of a walk. */
export const RUN_PACE = 1.5;
export const SPENT_PACE = 0.6;

/**
 * How tired the hero is, from 0 (fresh) to 1 (worn out), in 60 Hz ticks. Running
 * tires fast, walking slowly, and standing still rests. Worn out, the hero drops
 * out of a run and only trudges until rested below RECOVERED. Pure logic, kept by
 * the game across areas.
 */
export class Fatigue {
  level = 0;
  /** Worn out: no running, a slow walk. */
  spent = false;
  /** Run mode, switched by the player and dropped when worn out. */
  running = false;
  /** How fast moving tires (set by the difficulty). */
  rate = 1;

  /** The legs' speed as a share of a walk. */
  get pace(): number {
    return this.spent ? SPENT_PACE : this.running ? RUN_PACE : 1;
  }

  tick(how: Pace): void {
    const dt = 1 / 60;
    this.level += how === 'run' ? (dt / TIRE_RUN) * this.rate : how === 'walk' ? (dt / TIRE_WALK) * this.rate : -dt / REST;
    this.level = Math.min(1, Math.max(0, this.level));
    if (this.level >= 1) {
      this.spent = true;
      this.running = false;
    } else if (this.spent && this.level < RECOVERED) this.spent = false;
  }

  /** Switch between walking and running; false while worn out (no running then). */
  toggle(): boolean {
    if (this.spent) return false;
    this.running = !this.running;
    return true;
  }

  /** Fresh again (a new journey, or back from death). */
  reset(): void {
    this.level = 0;
    this.spent = this.running = false;
  }
}
