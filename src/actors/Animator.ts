import * as THREE from 'three';

/** Crossfading clip player: one action per clip, `once` clips hold their last frame. */
export class Animator<N extends string> {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<N, THREE.AnimationAction>();
  current: N | null = null;

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

  /** Switch to `name` over `fade` seconds; `restart` replays it if it is already playing. */
  play(name: N, fade = 0.1, restart = false): void {
    if (name === this.current && !restart) return;
    const next = this.actions.get(name)!;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset().setEffectiveWeight(1).play();
    if (prev && prev !== next) next.crossFadeFrom(prev, fade, false);
    this.current = name;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
