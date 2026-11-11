import { rng } from '../engine/ProcTex';
import type { PerfReport } from '../engine/PerfMonitor';
import { SaveManager } from '../persistence/SaveManager';
import type { Game } from './Game';
import { newGameState } from './GameState';
import type { Action, Vec2 } from './InputManager';

/** The three measured scenes: open plains, the grotto's passages, the guardian's fight. */
export type BenchId = 'plains' | 'grotto' | 'boss';
export const BENCH_IDS: BenchId[] = ['plains', 'grotto', 'boss'];

export interface BenchResult extends PerfReport {
  scene: BenchId;
  seconds: number;
  /** False: the browser has no GPU timer query, so gpuMs is null (not zero). */
  gpuTimer: boolean;
  gpu: string;
  userAgent: string;
}

interface Pad {
  move: Vec2;
  press: Action[];
}

/** The hero's commands at tick t of each run: the same every time. */
const SCRIPTS: Record<BenchId, (t: number) => Pad> = {
  // a wide circle over the plain, a cut now and then
  plains: (t) => {
    const a = (t / 720) * Math.PI * 2;
    return { move: { x: Math.cos(a), y: Math.sin(a) }, press: t % 75 === 0 ? ['attack'] : [] };
  },
  // down the passages, weaving, cutting and rolling
  grotto: (t) => ({ move: { x: Math.sin(t / 150) * 0.5, y: -1 }, press: t % 90 === 0 ? ['attack'] : t % 400 === 200 ? ['dodge'] : [] }),
  // circling the guardian one way then the other, closing in to strike
  boss: (t) => ({
    move: { x: Math.floor(t / 300) % 2 ? 1 : -1, y: t % 300 < 60 ? -1 : 0 },
    press: t % 45 === 0 ? ['attack'] : t % 210 === 100 ? ['dodge'] : t % 400 === 399 ? ['strong'] : [],
  }),
};

const WARMUP_TICKS = 180;

/**
 * A repeatable measurement of one scene (?bench=plains|grotto|boss in the address, with
 * optional &quality=, &res= and &seconds=). It plays a fresh journey held in memory with
 * scripted commands and a seeded random source, never touches the stored journey or
 * settings, and leaves its result in `window.__bench` and the console.
 */
export class Benchmark {
  result: BenchResult | null = null;
  private t = -1;
  private readonly ticks: number;

  constructor(private readonly game: Game, readonly id: BenchId, readonly seconds = 20) {
    this.ticks = Math.round(seconds * 60);
    SaveManager.readOnly = true;
  }

  /** Once the boot load is done: into the scene. */
  begin(): void {
    const g = this.game;
    g.state = newGameState();
    g.fatigue.reset();
    if (this.id === 'plains') g.toWorld();
    else if (this.id === 'grotto') g.enterDungeon('d1');
    else g.startBoss('d1');
  }

  get running(): boolean {
    return !this.result;
  }

  /** Every logic tick, after the devices were read: give the scripted commands and keep the hero alive. */
  tick(): void {
    const g = this.game;
    if (this.result) return;
    if (this.t < 0) {
      if (g.scenes.busy || !g.scenes.current?.view) return;
      // the scene is built: from here every run sees the same random numbers
      Math.random = rng(20261111);
      this.t = 0;
    }
    const t = this.t++;
    g.state.life = g.state.maxLife;
    const pad = SCRIPTS[this.id](t);
    g.input.inject(pad.move, t % 97 === 96 ? [...pad.press, 'confirm'] : pad.press);
    if (t === WARMUP_TICKS) g.gfx.perf.clear();
    if (t === WARMUP_TICKS + this.ticks) this.finish();
  }

  private finish(): void {
    const gfx = this.game.gfx, gl = gfx.gl.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.result = {
      scene: this.id,
      seconds: this.seconds,
      ...gfx.perf.report(gfx.gl.info),
      gpuTimer: gfx.gpuTimerSupported,
      gpu: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown',
      userAgent: navigator.userAgent,
    };
    (window as unknown as { __bench: BenchResult }).__bench = this.result;
    console.log('[bench]', JSON.stringify(this.result));
  }
}
