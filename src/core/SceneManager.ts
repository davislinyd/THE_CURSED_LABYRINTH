import * as THREE from 'three';
import type { QualityProfile } from '../engine/Quality';
import type { Renderer, View } from '../engine/Renderer';
import type { UI } from '../ui/UI';

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(): void;
  /** The 3D view drawn under the interface, if any. */
  readonly view?: View | null;
  drawUI?(ui: UI): void;
  /** Allows START / SELECT to open the pause and item menus over this scene. */
  readonly pausable?: boolean;
  /** Counts toward the play-time statistic. */
  readonly playTime?: boolean;
  /** Called when an overlay above this scene closes. */
  resume?(): void;
  /** Release GPU resources when the scene is left. */
  dispose?(): void;
  /** The quality profile changed while this scene is up: resize shadow maps, light counts. */
  quality?(q: QualityProfile): void;
  /** Objects moved every tick, drawn blended between ticks on fast displays. */
  readonly moving?: readonly THREE.Object3D[];
}

const FADE_FRAMES = 18;
/** Ticks a full-screen brush cut lasts. */
const CUT_FRAMES = 30;

/** Scene switching with fades through black and a stack of overlays (menus) that freeze the scene underneath. */
export class SceneManager {
  current: Scene | null = null;
  private next: Scene | null = null;
  private overlays: Scene[] = [];
  private phase: 'idle' | 'out' | 'in' = 'idle';
  private t = 0;
  private fade = 0;
  private flashColor = new THREE.Vector4();
  private flashFrames = 0;
  private flashTotal = 1;
  /** A heavy blow's smear: centre (0..1 of the screen) and strength. */
  private readonly impactAt = new THREE.Vector3();
  private impactK = 0;
  private impactFrames = 0;
  private impactTotal = 1;
  private cutFrames = 0;
  private cutSeed = 0;

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  get top(): Scene | null {
    return this.overlays[this.overlays.length - 1] ?? this.current;
  }

  get hasOverlay(): boolean {
    return this.overlays.length > 0;
  }

  change(scene: Scene, fade = true): void {
    if (!this.current || !fade) {
      this.swap(scene);
      return;
    }
    this.next = scene;
    this.phase = 'out';
    this.t = 0;
  }

  private swap(scene: Scene): void {
    for (const o of this.overlays) o.exit?.();
    this.overlays = [];
    this.current?.exit?.();
    this.current?.dispose?.();
    this.current = scene;
    scene.enter?.();
  }

  push(overlay: Scene): void {
    this.overlays.push(overlay);
    overlay.enter?.();
  }

  pop(overlay?: Scene): void {
    const i = overlay ? this.overlays.indexOf(overlay) : this.overlays.length - 1;
    if (i < 0) return;
    const [o] = this.overlays.splice(i, 1);
    o.exit?.();
    this.top?.resume?.();
  }

  flash(r: number, g: number, b: number, frames: number): void {
    this.flashColor.set(r, g, b, 1);
    this.flashFrames = this.flashTotal = frames;
  }

  /** A heavy blow at `at` (world): for a moment the picture smears outward from it, its colours parting. */
  impact(at: THREE.Vector3, strength: number, frames = 14): void {
    const cam = this.current?.view?.camera;
    if (!cam) return;
    const p = at.clone().project(cam);
    this.impactAt.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, 0);
    this.impactK = strength;
    this.impactFrames = this.impactTotal = frames;
  }

  /** A brush cut across the whole screen (a counter-stroke lands). */
  cut(): void {
    this.cutFrames = CUT_FRAMES;
    this.cutSeed = (Math.random() * 1e6) | 0;
  }

  update(): void {
    if (this.flashFrames > 0) this.flashFrames--;
    if (this.impactFrames > 0) this.impactFrames--;
    if (this.cutFrames > 0) this.cutFrames--;
    if (this.phase === 'out') {
      this.t++;
      this.fade = Math.min(1, this.t / FADE_FRAMES);
      if (this.t >= FADE_FRAMES + 4) {
        this.swap(this.next!);
        this.next = null;
        this.phase = 'in';
        this.t = 0;
      }
      return;
    }
    if (this.phase === 'in') {
      this.t++;
      this.fade = Math.max(0, 1 - this.t / FADE_FRAMES);
      if (this.fade === 0) this.phase = 'idle';
    }
    this.top?.update();
  }

  render(gfx: Renderer, ui: UI, time: number): void {
    const view = this.current?.view ?? null;
    const flash = this.flashFrames > 0 ? this.flashColor.setW((this.flashFrames / this.flashTotal) * 0.85) : null;
    const impact = this.impactFrames > 0 ? this.impactAt.setZ(this.impactK * (this.impactFrames / this.impactTotal) ** 2) : null;
    gfx.render(view, this.fade, flash, time, impact);
    ui.begin();
    this.current?.drawUI?.(ui);
    if (this.cutFrames > 0) ui.brushCut(1 - this.cutFrames / CUT_FRAMES, this.cutSeed);
    for (const o of this.overlays) o.drawUI?.(ui);
    ui.veil(this.fade);
  }
}
