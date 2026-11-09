import * as THREE from 'three';

interface Pose {
  p0: THREE.Vector3;
  q0: THREE.Quaternion;
  p1: THREE.Vector3;
  q1: THREE.Quaternion;
  /**
   * The angles as the logic left them: writing the quaternion derives new ones (yaw 2.5
   * reads back as (π, 0.64, π)), and code that sets one angle (rotation.y = yaw) then turns wrong.
   */
  e1: THREE.Euler;
}

/** Farther than this between two ticks is a jump (a warp, a respawn), not motion. */
const JUMP2 = 2 * 2;

/**
 * Smooth motion on displays faster than the 60 Hz logic (120 / 144 Hz): each drawn
 * frame shows the listed objects between their poses of the last two ticks, and
 * puts the real poses back afterwards so the logic never sees the blend.
 */
export class Interp {
  private readonly poses = new WeakMap<THREE.Object3D, Pose>();

  /** Before a logic tick: the pose now becomes the previous one. */
  begin(objs: readonly THREE.Object3D[]): void {
    for (const o of objs) {
      const p = this.poses.get(o);
      if (p) {
        p.p0.copy(o.position);
        p.q0.copy(o.quaternion);
      }
    }
  }

  /** After the ticks of a frame: record the current pose. */
  end(objs: readonly THREE.Object3D[]): void {
    for (const o of objs) {
      let p = this.poses.get(o);
      if (!p) {
        p = { p0: o.position.clone(), q0: o.quaternion.clone(), p1: new THREE.Vector3(), q1: new THREE.Quaternion(), e1: new THREE.Euler() };
        this.poses.set(o, p);
      }
      p.p1.copy(o.position);
      p.q1.copy(o.quaternion);
      p.e1.copy(o.rotation);
    }
  }

  /** Show the blend `alpha` (0..1) of the way from the previous tick to the current one. */
  apply(objs: readonly THREE.Object3D[], alpha: number): void {
    for (const o of objs) {
      const p = this.poses.get(o);
      if (!p || p.p0.distanceToSquared(p.p1) > JUMP2) continue;
      o.position.lerpVectors(p.p0, p.p1, alpha);
      o.quaternion.slerpQuaternions(p.q0, p.q1, alpha);
    }
  }

  restore(objs: readonly THREE.Object3D[]): void {
    for (const o of objs) {
      const p = this.poses.get(o);
      if (!p) continue;
      o.position.copy(p.p1);
      // the quaternion follows from the angles
      o.rotation.copy(p.e1);
    }
  }
}

/** The objects a scene moves every tick, kept as one flat list for `Interp`. */
export class Movers {
  readonly list: THREE.Object3D[] = [];

  add(...objs: THREE.Object3D[]): void {
    this.list.push(...objs);
  }

  /** A model and its joints (meshes ride on their joints and need no blending). */
  addRig(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) this.list.push(o);
    });
  }

  /** Forget an object and everything under it. */
  remove(root: THREE.Object3D): void {
    const gone = new Set<THREE.Object3D>();
    root.traverse((o) => gone.add(o));
    let n = 0;
    for (const o of this.list) if (!gone.has(o)) this.list[n++] = o;
    this.list.length = n;
  }
}
