import * as THREE from 'three';
import { Fatigue } from '../combat/Fatigue';
import { HeroInput, HeroMachine, HeroState, HitResult, TIMING } from '../combat/HeroMachine';
import type { InputManager } from '../core/InputManager';
import { Afterimages } from '../world/Afterimages';
import { P2, SolidFn, collide } from '../world/Grid3D';
import { SwordTrail } from '../world/SwordTrail';
import { Animator } from './Animator';
import { BodyMotion } from './BodyMotion';
import { SAMURAI_CLIPS, SamuraiClip, SamuraiModel, buildSamurai } from './Samurai';

/** Metres per second at a walk (running and trudging scale it: see Fatigue). */
const WALK_SPEED = 5;
/** Turn rate (rad/s) on the move or standing, and with the guard up. */
const TURN = 20;
const GUARD_TURN = 14;
const ONCE: SamuraiClip[] = ['atk1', 'atk2', 'atk3', 'strong', 'counter', 'dodge', 'guardHit', 'hurt', 'die', 'use'];
const BLOWS = new Set<HeroState>(['atk1', 'atk2', 'atk3', 'strong', 'counter']);
/** Soft lock: a blow with nothing aimed at turns to the nearest foe this close (to its body) and this far off the intended line. */
const SOFT_RANGE = 4.5;
const SOFT_ANGLE = (70 * Math.PI) / 180;
/** Turn rate (rad/s) while a blow recovers. */
const RECOVER_TURN = 4;
/** Crossfade (seconds) between standing and walking: the sword comes down to the carry or up to the guard. */
const STRIDE_FADE = 0.2;
/**
 * The stride clip covers about 2 m of ground in its 0.68 s; a walk covers 3.4 m in that time.
 * Played this much faster (and faster again at a run) the feet slip far less. Drawing only:
 * the action logic never reads the clip.
 */
const CADENCE = 1.28;
/** The eyes go to a foe this near while nothing is aimed at (m). */
const WATCH_RANGE = 9;
const CALM = new Set<HeroState>(['idle', 'run', 'guard']);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Trail colours: light cuts pale, the strong cut vermilion, the counter gold. */
const TRAIL_COLOR: Partial<Record<HeroState, number>> = { atk1: 0xe8e2d4, atk2: 0xe8e2d4, atk3: 0xe8e2d4, strong: 0xff3c18, counter: 0xffc040 };

/** A body a blow can be aimed at: a foe or the boss. */
export interface Mark extends P2 {
  readonly alive: boolean;
  readonly spec: { readonly radius: number };
}

/** Click-to-move steering and commands from the mouse (isometric areas). */
export interface AutoInput {
  /** World direction to walk; zero to stand. */
  dx: number;
  dz: number;
  attack: boolean;
  strong?: boolean;
  use: boolean;
  /** World yaw to turn to while the body may turn (a blow or talisman aimed with the cursor). */
  face?: number;
}

/** The samurai in play: body, animation, action state and movement on the grid. */
export class HeroActor {
  readonly model: SamuraiModel;
  readonly root: THREE.Object3D;
  readonly machine = new HeroMachine();
  private readonly anim: Animator<SamuraiClip>;
  readonly radius = 0.4;
  yaw = 0;
  private glow = 0;
  /** The foe the current blow turned to by itself (soft lock). */
  private soft: Mark | null = null;
  readonly trail: SwordTrail;
  private readonly ghosts: Afterimages;
  /** Lean, breath and gaze laid over the clips (drawing only). */
  private readonly motion: BodyMotion;
  /** The trail and the dodge's afterimages, in world space: add to the scene. */
  readonly effects = new THREE.Group();

  /** `fatigue` is the game's, so tiredness and run mode carry from area to area. */
  constructor(public x: number, public z: number, readonly fatigue = new Fatigue(), model: SamuraiModel = buildSamurai()) {
    this.model = model;
    this.root = this.model.rig.root;
    this.root.traverse((o) => (o.castShadow = false));
    this.anim = new Animator(this.root, SAMURAI_CLIPS, ONCE);
    this.anim.play('idle');
    this.motion = new BodyMotion(this.model.rig);
    this.trail = new SwordTrail(this.model.blade);
    this.ghosts = new Afterimages(this.root);
    this.effects.add(this.trail.mesh, this.ghosts.group);
  }

  get pos(): P2 {
    return { x: this.x, z: this.z };
  }

  get state(): HeroState {
    return this.machine.state;
  }

  /** Colour of the blow being struck (its trail and flash). */
  get blowColor(): number {
    return TRAIL_COLOR[this.machine.state] ?? 0xffffff;
  }

  /** Facing unit vector. */
  get fx(): number {
    return Math.sin(this.yaw);
  }

  get fz(): number {
    return Math.cos(this.yaw);
  }

  /**
   * One tick: read input, advance the action state, steer relative to the camera
   * (or toward a locked target), apply lunges and collide with the grid.
   * `auto` (mouse) steers only while the stick is idle. A blow given with no target
   * and no cursor aim turns to the nearest of `near` in front (soft lock).
   */
  update(inp: InputManager, camYaw: number, solid: SolidFn, target: Mark | null, frozen = false, auto: AutoInput | null = null, near: readonly Mark[] = []): HeroInput {
    const m = frozen ? { x: 0, y: 0 } : inp.move();
    const x0 = this.x, z0 = this.z, yaw0 = this.yaw;
    let mag = Math.min(1, Math.hypot(m.x, m.y));
    const steer = !frozen && mag < 0.1 && auto && (auto.dx || auto.dz) ? auto : null;
    if (steer) mag = 1;
    const hi = this.read(inp, frozen, mag, auto);
    if (!frozen && inp.pressed('run')) this.fatigue.toggle();
    const mc = this.machine;
    const before = mc.state, beforeSwing = mc.swing;
    mc.update(hi);
    // desired world direction from the stick: forward (sin a, cos a), right (-cos a, sin a)
    const fa = Math.sin(camYaw), fb = Math.cos(camYaw);
    let dx = steer ? steer.dx : fa * -m.y + -fb * m.x, dz = steer ? steer.dz : fb * -m.y + fa * m.x;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-6) (dx /= dl), (dz /= dl);
    if (mc.state !== before || mc.swing !== beforeSwing) {
      const blow = BLOWS.has(mc.state);
      // snap into a blow, ease out of one; set off and stop at an easy pace
      const stride = (mc.state === 'run' || mc.state === 'idle') && (before === 'run' || before === 'idle');
      this.anim.play(mc.state, blow ? 0.06 : BLOWS.has(before) ? 0.12 : stride ? STRIDE_FADE : 0.08, true);
      this.soft = blow && !target && auto?.face === undefined ? this.nearest(near, mag > 0.1 ? Math.atan2(dx, dz) : this.yaw) : null;
    }
    if (this.soft && (!this.soft.alive || !BLOWS.has(mc.state))) this.soft = null;
    const aim = target ?? this.soft;
    // the body turns the way it goes, unless it faces a mark (a lock, a cursor's aim)
    const marked = auto?.face !== undefined || !!aim;
    const dt = 1 / 60;
    if (mc.canTurn || mc.recovering) {
      let want: number | null = null;
      if (auto?.face !== undefined && mc.state !== 'dodge') want = auto.face;
      else if (aim && mc.state !== 'dodge') want = Math.atan2(aim.x - this.x, aim.z - this.z);
      else if (mag > 0.1) want = Math.atan2(dx, dz);
      if (want !== null) {
        const rate = !mc.canTurn ? RECOVER_TURN : mc.state === 'run' || mc.state === 'idle' ? TURN : mc.state === 'guard' ? GUARD_TURN : 30;
        this.yaw += Math.max(-rate * dt, Math.min(rate * dt, wrap(want - this.yaw)));
      }
    }
    const legs = mc.state === 'run' ? this.fatigue.pace : 1;
    const ahead = Math.cos(wrap(Math.atan2(dx, dz) - this.yaw));
    let speed = WALK_SPEED * mc.moveFactor * mag * legs;
    // turning round to go the other way: wheel about first instead of sliding off backwards
    if (!marked) speed *= Math.max(0, ahead);
    if (speed > 0) {
      this.x += dx * speed * dt;
      this.z += dz * speed * dt;
    }
    this.fatigue.tick(speed <= 0 ? 'rest' : legs > 1 ? 'run' : 'walk');
    // the stride keeps time with the legs, and runs in reverse while backing away from a mark
    this.anim.speed('run', (speed > 0 && ahead < -0.3 ? -1 : 1) * CADENCE * Math.sqrt(legs) * (0.75 + 0.25 * Math.min(1, mag)));
    let l = mc.lunge * dt;
    // a blow's lunge stops at the body it is aimed at instead of running through it
    if (l > 0 && aim && BLOWS.has(mc.state)) l = Math.min(l, Math.max(0, Math.hypot(aim.x - this.x, aim.z - this.z) - aim.spec.radius - this.radius - 0.15));
    if (l > 0) {
      this.x += this.fx * l;
      this.z += this.fz * l;
    }
    const p = { x: this.x, z: this.z };
    collide(p, this.radius, solid);
    this.x = p.x;
    this.z = p.z;
    this.motion.begin();
    this.anim.update(dt);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.yaw;
    // carriage and hanging armour, over the pose the clips just gave (after the logic: they change nothing it reads)
    const watched = aim ?? (CALM.has(mc.state) ? this.nearestWithin(near, WATCH_RANGE) : null);
    this.motion.update(dt, {
      speed: Math.hypot(this.x - x0, this.z - z0) / dt,
      yawRate: wrap(this.yaw - yaw0) / dt,
      look: this.bearing(watched),
      tired: this.fatigue.level,
      ease: mc.state === 'die' ? 0 : CALM.has(mc.state) ? 1 : 0.3,
    });
    this.model.secondary?.update(this.root, dt);
    // the edge flares while the blade is live
    this.glow = mc.attack ? 1 : Math.max(0, this.glow - dt * 6);
    this.model.mats.edge.emissiveIntensity = this.glow * 3;
    // the blade leaves a trail from just before it cuts until its follow-through
    const act = TIMING[mc.state as keyof typeof TIMING]?.active;
    this.trail.tick(act && BLOWS.has(mc.state) && mc.t >= act[0] - 2 && mc.t < act[1] + 3 ? TRAIL_COLOR[mc.state]! : null);
    this.ghosts.tick(mc.state === 'dodge' && mc.invulnerable && (mc.t - TIMING.dodge.iframes![0]) % 4 === 0);
    return hi;
  }

  /** Before each render (the scene's onBeforeRender): end the trail at the blade as drawn. */
  drawTrail(): void {
    this.trail.draw();
  }

  dispose(): void {
    this.trail.dispose();
    this.ghosts.dispose();
  }

  /** Time stands still (a hit-stop): only remember the commands given meanwhile. */
  stall(inp: InputManager, auto: AutoInput | null): void {
    this.machine.buffer(this.read(inp, false, 0, auto));
  }

  private read(inp: InputManager, frozen: boolean, move: number, auto: AutoInput | null): HeroInput {
    if (frozen) return { move: 0, attack: false, strong: false, dodge: false, use: false, guard: false };
    return {
      move,
      attack: inp.pressed('attack') || !!auto?.attack,
      strong: inp.pressed('strong') || !!auto?.strong,
      dodge: inp.pressed('dodge'),
      use: inp.pressed('item') || !!auto?.use,
      guard: inp.held('guard'),
    };
  }

  /** The nearest live foe within the soft-lock range and angle of the bearing `dir`. */
  private nearest(near: readonly Mark[], dir: number): Mark | null {
    let best: Mark | null = null, bd = SOFT_RANGE;
    for (const f of near) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - this.x, f.z - this.z) - f.spec.radius;
      if (d < bd && Math.abs(wrap(Math.atan2(f.x - this.x, f.z - this.z) - dir)) <= SOFT_ANGLE) (bd = d), (best = f);
    }
    return best;
  }

  /** Where `m` lies relative to the facing (rad, positive to the left); null for nothing, or for something behind the shoulders. */
  private bearing(m: Mark | null): number | null {
    if (!m) return null;
    const a = wrap(Math.atan2(m.x - this.x, m.z - this.z) - this.yaw);
    return Math.abs(a) > 1.9 ? null : a;
  }

  /** The nearest live foe within `range` metres, whichever way it lies. */
  private nearestWithin(near: readonly Mark[], range: number): Mark | null {
    let best: Mark | null = null, bd = range;
    for (const f of near) {
      const d = Math.hypot(f.x - this.x, f.z - this.z);
      if (f.alive && d < bd) (bd = d), (best = f);
    }
    return best;
  }

  /** An enemy blow connects (see HeroMachine.hit). */
  hit(fromFront: boolean): HitResult {
    const r = this.machine.hit(fromFront);
    if (r === 'hit' || r === 'guarded') this.anim.play(this.machine.state, 0.05, true);
    return r;
  }

  kill(): void {
    this.machine.kill();
    this.anim.play('die', 0.1, true);
  }

  /** Is `p` (with radius r) inside the blade's sweep right now? */
  inSweep(p: P2, r: number): boolean {
    const a = this.machine.attack;
    if (!a) return false;
    const reach = a.kind === 'strong' ? 2.7 : a.kind === 'counter' ? 3.1 : a.kind === 'atk3' ? 2.6 : 2.4;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    if (d - r > reach) return false;
    if (d < 0.8) return true;
    return (dx * this.fx + dz * this.fz) / d > Math.cos(a.kind === 'atk3' || a.kind === 'counter' ? 1.6 : 1.25);
  }
}
