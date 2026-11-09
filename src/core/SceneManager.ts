import { PixelRenderer } from '../graphics/PixelRenderer';
import { FADE_MAPS, IDENTITY_MAP } from '../graphics/Palette';

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(): void;
  draw(r: PixelRenderer): void;
  /** Allows START / SELECT to open the pause and item menus over this scene. */
  readonly pausable?: boolean;
  /** Counts toward the play-time statistic. */
  readonly playTime?: boolean;
  /** Called when an overlay above this scene closes. */
  resume?(): void;
}

const FADE_STEP_FRAMES = 4;

/**
 * Scene switching with FC-style palette fades (four brightness steps) and a
 * stack of overlays (menus, dialogs) that freeze the scene underneath.
 */
export class SceneManager {
  current: Scene | null = null;
  private next: Scene | null = null;
  private overlays: Scene[] = [];
  private phase: 'idle' | 'out' | 'in' = 'idle';
  private t = 0;
  private fadeLevel = 0;
  private flashMap: Uint8Array | null = null;
  private flashFrames = 0;

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
    this.overlays = [];
    this.current?.exit?.();
    this.current = scene;
    scene.enter?.();
  }

  push(overlay: Scene): void {
    this.overlays.push(overlay);
    overlay.enter?.();
  }

  pop(overlay?: Scene): void {
    const o = overlay ? this.overlays.splice(this.overlays.indexOf(overlay), 1)[0] : this.overlays.pop();
    o?.exit?.();
    this.top?.resume?.();
  }

  flash(map: Uint8Array, frames: number): void {
    this.flashMap = map;
    this.flashFrames = frames;
  }

  update(): void {
    if (this.flashFrames > 0) this.flashFrames--;
    if (this.phase === 'out') {
      this.t++;
      this.fadeLevel = Math.min(4, Math.floor(this.t / FADE_STEP_FRAMES));
      if (this.t >= FADE_STEP_FRAMES * 5) {
        this.swap(this.next!);
        this.next = null;
        this.phase = 'in';
        this.t = 0;
      }
      return;
    }
    if (this.phase === 'in') {
      this.t++;
      this.fadeLevel = Math.max(0, 4 - Math.floor(this.t / FADE_STEP_FRAMES));
      if (this.fadeLevel === 0) this.phase = 'idle';
    }
    const top = this.top;
    top?.update();
  }

  draw(r: PixelRenderer): void {
    r.beginFrame();
    this.current?.draw(r);
    for (const o of this.overlays) o.draw(r);
    if (this.flashFrames > 0 && this.flashMap) r.remap = this.flashMap;
    else r.remap = this.fadeLevel > 0 ? FADE_MAPS[this.fadeLevel] : IDENTITY_MAP;
  }
}
