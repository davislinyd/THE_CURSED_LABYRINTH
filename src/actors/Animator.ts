import * as THREE from 'three';

/** Crossfading clip player: one action per clip, `once` clips hold their last frame. */
export class Animator<N extends string> {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<N, THREE.AnimationAction>();
  current: N | null = null;
  /** Weight of each clip in the pose (they always add up to 1). */
  private readonly weights = new Map<N, number>();
  /** Weight per second the current clip gains in its crossfade. */
  private rate = 10;

  constructor(root: THREE.Object3D, clips: Record<N, THREE.AnimationClip>, once: readonly N[] = []) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const name of Object.keys(clips) as N[]) {
      const a = this.mixer.clipAction(clips[name]);
      if (once.includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }
  }

  /**
   * Switch to `name` over `fade` seconds; `restart` replays it if it is already playing.
   * The weights move on from where they are, so a crossfade cut short by another never
   * jumps, and a looping clip still fading out takes up again where it is.
   */
  play(name: N, fade = 0.1, restart = false): void {
    if (name === this.current && !restart) return;
    const next = this.actions.get(name)!;
    if (!this.weights.has(name) || next.loop === THREE.LoopOnce) next.reset();
    next.play();
    if (!this.weights.has(name)) this.weights.set(name, this.current === null ? 1 : 0);
    this.current = name;
    this.rate = 1 / fade;
  }

  /** How much of the pose a clip makes up now (0..1). */
  weight(name: N): number {
    return this.weights.get(name) ?? 0;
  }

  /** Where a clip is (s). */
  time(name: N): number {
    return this.actions.get(name)!.time;
  }

  /** Playback speed of a clip; negative plays it backwards. */
  speed(name: N, scale: number): void {
    this.actions.get(name)!.timeScale = scale;
  }

  update(dt: number): void {
    const cur = this.current;
    if (cur !== null) {
      // the current clip gains weight; the others share what is left as they had it
      let rest = 0;
      for (const [name, w] of this.weights) if (name !== cur) rest += w;
      const now = rest > 0 ? Math.min(1, this.weights.get(cur)! + dt * this.rate) : 1;
      for (const [name, w] of this.weights) {
        const v = name === cur ? now : (w * (1 - now)) / rest;
        const a = this.actions.get(name)!;
        if (v > 1e-4 || name === cur) {
          this.weights.set(name, v);
          a.setEffectiveWeight(v);
        } else {
          this.weights.delete(name);
          a.stop();
        }
      }
    }
    this.mixer.update(dt);
  }
}
