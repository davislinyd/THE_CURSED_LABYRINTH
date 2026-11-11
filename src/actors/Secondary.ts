import * as THREE from 'three';

/** How a hanging part swings. */
export interface DangleSpec {
  /** From the pivot to the point that swings (m). */
  length: number;
  /** Pull back to where it hangs at rest (1/s²). */
  stiffness: number;
  /** Damping against its pivot (1/s): how soon a swing dies. */
  damping: number;
  /** Drag through the air (1/s): how far it trails behind a body on the move. */
  drag: number;
  /** Extra pull straight down (m/s²): it hangs truer when its parent leans. */
  gravity: number;
  /** Widest swing from rest (rad). */
  limit: number;
  /** How much of a kick it takes from a change of speed, relative to a loose plate (default 1). */
  kick?: number;
  /** In the part's own space, the direction from the pivot to the swinging point (default: straight down). */
  axis?: THREE.Vector3;
  /** Where it would hang now, in its parent's space, given the pose (default: along `axis`). */
  rest?: (out: THREE.Vector3) => THREE.Vector3;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _pivot = new THREE.Vector3(), _scale = new THREE.Vector3(), _q = new THREE.Quaternion(), _swing = new THREE.Quaternion();
const _rest = new THREE.Vector3(), _dir = new THREE.Vector3(), _pv = new THREE.Vector3(), _dv = new THREE.Vector3(), _acc = new THREE.Vector3();
const IDENTITY = new THREE.Quaternion();
/**
 * The game starts, stops and shoves a body within one tick. A plate with its true inertia
 * would be flung to its stop each time, so it feels only this share of a change of speed,
 * and no single change (or wind) beyond these speeds (m/s).
 */
const INERTIA = 0.11;
const MAX_KICK = 7;
const MAX_WIND = 9;
/** Farther than this in one tick is a warp, not motion (m). */
const JUMP = 1.5;

/**
 * A part that hangs from a pivot and swings: an armour plate, a scabbard, the end of a sash.
 * The point at its far end is held, relative to the pivot, by a damped spring toward where
 * the part would hang at rest; a change of the pivot's speed kicks it the other way, moving
 * through the air drags it back; the part turns about its pivot to point at it. So it lags
 * when the body starts, swings on when it stops, and settles. One tick of 1/60 s per update:
 * the same every run.
 */
export class Dangle {
  /** The swinging point relative to the pivot (world axes), and its speed in that frame. */
  private readonly off = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly last = new THREE.Vector3();
  private readonly lastV = new THREE.Vector3();
  private readonly axis: THREE.Vector3;
  private started = false;

  constructor(readonly node: THREE.Object3D, private readonly spec: DangleSpec) {
    this.axis = (spec.axis ?? DOWN).clone().normalize();
  }

  /** The parent's world matrix must be current. */
  update(dt: number): void {
    const s = this.spec, parent = this.node.parent!;
    parent.matrixWorld.decompose(_pivot, _q, _scale);
    _pivot.copy(this.node.position).applyMatrix4(parent.matrixWorld);
    _rest.copy(this.axis);
    if (s.rest) s.rest(_rest).normalize();
    _rest.applyQuaternion(_q);
    // the first tick, and after a jump (a warp, a respawn): hang at rest
    if (!this.started || this.last.distanceTo(_pivot) > JUMP) {
      this.off.copy(_rest).multiplyScalar(s.length);
      this.vel.set(0, 0, 0);
      this.lastV.set(0, 0, 0);
      this.last.copy(_pivot);
      this.started = true;
    }
    _pv.copy(_pivot).sub(this.last).divideScalar(dt);
    this.last.copy(_pivot);
    _dv.copy(_pv).sub(this.lastV).clampLength(0, MAX_KICK);
    this.lastV.copy(_pv);
    // spring to rest and damping about the pivot, the air's drag, weight; then the kick of a change of speed
    _acc.copy(_rest).multiplyScalar(s.length).sub(this.off).multiplyScalar(s.stiffness);
    _acc.addScaledVector(this.vel, -s.damping).addScaledVector(_pv.clampLength(0, MAX_WIND), -s.drag);
    _acc.y -= s.gravity;
    this.vel.addScaledVector(_acc, dt).addScaledVector(_dv, -INERTIA * (s.kick ?? 1));
    this.off.addScaledVector(this.vel, dt);
    _dir.copy(this.off);
    if (_dir.lengthSq() < 1e-10) _dir.copy(_rest);
    _dir.normalize();
    const angle = Math.acos(Math.min(1, Math.max(-1, _dir.dot(_rest))));
    if (angle > s.limit) {
      // against its stop: no farther, and the swing loses its force
      _swing.setFromUnitVectors(_rest, _dir);
      _dir.copy(_rest).applyQuaternion(IDENTITY.clone().slerp(_swing, s.limit / angle));
      this.vel.multiplyScalar(0.6);
    }
    this.off.copy(_dir).multiplyScalar(s.length);
    _dir.applyQuaternion(_q.invert());
    this.node.quaternion.setFromUnitVectors(this.axis, _dir);
  }
}

/** The hanging parts of one body, moved together after its joints are posed. */
export class Secondary {
  private readonly parts: Dangle[] = [];

  add(node: THREE.Object3D, spec: DangleSpec): void {
    this.parts.push(new Dangle(node, spec));
  }

  get count(): number {
    return this.parts.length;
  }

  /** `root`'s world matrices are brought up to date first (the joints were just posed). */
  update(root: THREE.Object3D, dt: number): void {
    if (!this.parts.length) return;
    root.updateMatrixWorld(true);
    for (const p of this.parts) p.update(dt);
  }
}
