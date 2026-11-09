/**
 * The hero's action state machine, in 60 Hz ticks. Pure logic: the scene feeds
 * input and incoming hits, then reads the state (for the animation), the
 * active attack (for hit tests), invulnerability and forced forward motion.
 */
export type HeroState =
  | 'idle' | 'run' | 'guard' | 'guardHit' | 'hurt' | 'die' | 'use' | 'dodge'
  | 'atk1' | 'atk2' | 'atk3' | 'strong' | 'counter';

export interface HeroInput {
  /** Stick magnitude, 0..1. */
  move: number;
  /** Pressed this tick. */
  attack: boolean;
  strong: boolean;
  dodge: boolean;
  use: boolean;
  /** Held. */
  guard: boolean;
}

export type HitResult = 'hit' | 'guarded' | 'parried' | 'ignored';

interface Timing {
  len: number;
  /** Ticks [from, to) in which the blade hurts. */
  active?: [number, number];
  /** From this tick a buffered command may start the next action. */
  cancel?: number;
  /** Forced forward speed (m/s) during ticks [from, to). */
  lunge?: [number, number, number];
  iframes?: [number, number];
  power?: number;
}

type Timed = 'atk1' | 'atk2' | 'atk3' | 'strong' | 'counter' | 'dodge' | 'guardHit' | 'hurt' | 'use';

/** Matched to the clip lengths and strike keys in actors/Samurai.ts. */
export const TIMING: Record<Timed, Timing> = {
  atk1: { len: 27, active: [7, 13], cancel: 15, lunge: [5, 12, 2.5], power: 1 },
  atk2: { len: 27, active: [6, 12], cancel: 14, lunge: [4, 11, 2.5], power: 1 },
  atk3: { len: 39, active: [10, 18], cancel: 30, lunge: [8, 17, 3.5], power: 1.5 },
  strong: { len: 54, active: [20, 28], cancel: 44, lunge: [22, 28, 5], power: 2.5 },
  counter: { len: 30, active: [2, 7], cancel: 20, lunge: [0, 5, 8], iframes: [0, 30], power: 4 },
  dodge: { len: 30, cancel: 22, lunge: [0, 18, 7], iframes: [2, 18] },
  guardHit: { len: 18 },
  hurt: { len: 24, iframes: [0, 24] },
  use: { len: 36, cancel: 30 },
};

/** A guard raised at most this many ticks before a blow parries it. */
export const PARRY_WINDOW = 8;
/** After a parry, an attack within this many ticks becomes a counter. */
export const COUNTER_WINDOW = 36;
/** How long a pressed command is remembered. */
export const BUFFER = 20;
/** The talisman leaves the hand on this tick of `use`. */
export const USE_TICK = 17;
/** A dodge may turn into a blow from this tick (other commands wait for its cancel tick). */
export const DODGE_TO_ATTACK = 18;
/** A dodge's feet come down on this tick. */
const DODGE_LAND = 16;
/** Ticks the world stands still when each blow lands. */
export const HIT_STOP: Partial<Record<HeroState, number>> = { atk1: 3, atk2: 3, atk3: 5, strong: 7, counter: 10 };

type Command = 'attack' | 'strong' | 'dodge' | 'use';

export class HeroMachine {
  state: HeroState = 'idle';
  /** Ticks since entering the state. */
  t = 0;
  /** Increments per swing, so a swing hits each foe once. */
  swing = 0;
  /** Sound and effect cues raised during the last update / hit: 'swing', 'use', 'parry', 'dust' (a dodge or a start kicks it up). */
  readonly events: string[] = [];
  private queued: Command | null = null;
  private queuedAge = 0;
  private counterWindow = 0;

  update(inp: HeroInput): void {
    this.events.length = 0;
    this.t++;
    if (this.counterWindow > 0) this.counterWindow--;
    if (this.state === 'die') return;
    if (!this.buffer(inp) && this.queued && ++this.queuedAge > BUFFER) this.queued = null;

    const timing = TIMING[this.state as Timed];
    if (!timing) {
      if (!this.startQueued()) this.settle(inp);
      return;
    }
    if (timing.active && this.t === timing.active[0]) this.events.push('swing');
    if (this.state === 'use' && this.t === USE_TICK) this.events.push('use');
    if (this.state === 'dodge' && this.t === DODGE_LAND) this.events.push('dust');
    if (this.queued && this.t >= this.cancelAt(this.queued) && this.startQueued()) return;
    if (this.t >= timing.len) this.settle(inp);
  }

  /** Remember a command (also while time stands still in a hit-stop); true if one was given. */
  buffer(inp: HeroInput): boolean {
    const cmd: Command | null = inp.attack ? 'attack' : inp.strong ? 'strong' : inp.dodge ? 'dodge' : inp.use ? 'use' : null;
    if (!cmd || this.state === 'die') return false;
    this.queued = cmd;
    this.queuedAge = 0;
    return true;
  }

  /** The tick of the current action from which `cmd` may cut it short. */
  private cancelAt(cmd: Command): number {
    const tm = TIMING[this.state as Timed];
    if (!tm) return 0;
    // dodge away as soon as the blade has passed; strike out of a dodge early
    if (cmd === 'dodge' && tm.active) return tm.active[1];
    if (this.state === 'dodge' && (cmd === 'attack' || cmd === 'strong')) return DODGE_TO_ATTACK;
    return tm.cancel ?? tm.len;
  }

  /** A command given on the next update would start at once (a held button repeats only then). */
  get ready(): boolean {
    return this.state !== 'die' && this.t + 1 >= this.cancelAt('attack');
  }

  /** An enemy blow connects. `fromFront` is false for blows from behind, which a guard cannot stop. */
  hit(fromFront = true): HitResult {
    if (this.state === 'die' || this.invulnerable) return 'ignored';
    if (fromFront && (this.state === 'guard' || this.state === 'guardHit')) {
      if (this.state === 'guard' && this.t <= PARRY_WINDOW) {
        this.counterWindow = COUNTER_WINDOW;
        this.events.push('parry');
        return 'parried';
      }
      this.enter('guardHit');
      return 'guarded';
    }
    this.enter('hurt');
    return 'hit';
  }

  kill(): void {
    this.enter('die');
  }

  /** The blade's current blow, if it is in its active window. */
  get attack(): { swing: number; power: number; kind: HeroState } | null {
    const tm = TIMING[this.state as Timed];
    if (!tm?.active || this.t < tm.active[0] || this.t >= tm.active[1]) return null;
    return { swing: this.swing, power: tm.power ?? 1, kind: this.state };
  }

  get invulnerable(): boolean {
    const f = TIMING[this.state as Timed]?.iframes;
    return !!f && this.t >= f[0] && this.t < f[1];
  }

  /** Forced forward speed in m/s: fast at first, easing off (the distance of l[2] m/s held throughout). */
  get lunge(): number {
    const l = TIMING[this.state as Timed]?.lunge;
    if (!l || this.t < l[0] || this.t >= l[1]) return 0;
    return 2 * l[2] * (1 - (this.t - l[0] + 0.5) / (l[1] - l[0]));
  }

  /** Share of full running speed the stick may steer: 1 running, slow while guarding, 0 otherwise. */
  get moveFactor(): number {
    return this.state === 'run' || this.state === 'idle' ? 1 : this.state === 'guard' ? 0.35 : 0;
  }

  /** Whether the body may turn toward the stick (attacks aim during their wind-up, an item until it leaves the hand). */
  get canTurn(): boolean {
    const tm = TIMING[this.state as Timed];
    if (!tm) return this.state !== 'die';
    if (this.state === 'use') return this.t < USE_TICK;
    return this.state === 'dodge' ? this.t < 2 : !!tm.active && this.t < tm.active[0];
  }

  /** After a blow's active window: the body may still turn a little toward the next. */
  get recovering(): boolean {
    const a = TIMING[this.state as Timed]?.active;
    return !!a && this.t >= a[1];
  }

  get canCounter(): boolean {
    return this.counterWindow > 0;
  }

  private startQueued(): boolean {
    const q = this.queued;
    if (!q) return false;
    this.queued = null;
    if (q === 'attack') {
      if (this.counterWindow > 0) {
        this.counterWindow = 0;
        this.enter('counter');
      } else this.enter(this.state === 'atk1' ? 'atk2' : this.state === 'atk2' ? 'atk3' : 'atk1');
    } else this.enter(q);
    if (q === 'dodge') this.events.push('dust');
    return true;
  }

  private settle(inp: HeroInput): void {
    const next: HeroState = inp.guard ? 'guard' : inp.move > 0.1 ? 'run' : 'idle';
    if (next === this.state) return;
    if (next === 'run' && this.state === 'idle') this.events.push('dust');
    const fromGuardHit = this.state === 'guardHit';
    this.enter(next);
    // a guard kept up through a blow does not grant a fresh parry window
    if (next === 'guard' && fromGuardHit) this.t = PARRY_WINDOW + 1;
  }

  private enter(s: HeroState): void {
    this.state = s;
    this.t = 0;
    if (TIMING[s as Timed]?.active) this.swing++;
  }
}
