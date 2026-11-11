import * as THREE from 'three';
import { Proportions, Rig, buildRig } from './Rig';

/** Ankle heights over the ground (m) between which a foot of the clip takes the body's weight. */
const LIFT = 0.2, DOWN = 0.09;
/** A foot of the clip sliding back at least this fast (m/s) bears weight fully; one going forward is in the air. */
const PUSH = 1;
/** How far a planted foot may stay behind where the clip has it (m), and how fast it catches up once it lifts (1/s). */
const MAX_SLIP = 0.3;
const RECOVER = 8;
/** The hips sink at most this far (m) so a planted leg reaches its foot with the knee still bent; they sink quickly and rise slowly (1/s). */
const MAX_DROP = 0.12;
const SINK = 25, RISE = 8;
/** Share of the leg's full length it spans at ease, and the most it ever spans (the knee never locks straight). */
const EASY = 0.92, FULL = 0.995;
/** A body that moved further than this in a tick was put somewhere else, not walked. */
const WARP = 1;

const X = new THREE.Vector3(1, 0, 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (u: number) => u * u * (3 - 2 * u);
/** How much a foot of the clip bears weight: low, and travelling back under the body. */
const bearing = (y: number, back: number) => smooth(clamp((LIFT - y) / (LIFT - DOWN), 0, 1)) * smooth(clamp(back / PUSH, 0, 1));

/** What a stride clip does with its feet. */
export interface Stride {
  /** Per foot (left, right), a sample a tick: how much it bears weight. */
  contact: [Float32Array, Float32Array];
  /** Ground speed (m/s) at which the clip at normal speed does not slip: how fast its feet travel back while they bear weight. */
  speed: number;
}

/** Plays the stride clip once on a body of the same build and watches its feet. */
export function stride(clip: THREE.AnimationClip, p?: Proportions): Stride {
  const rig = buildRig(p), mixer = new THREE.AnimationMixer(rig.root);
  mixer.clipAction(clip).play();
  const feet = [rig.bones.footL, rig.bones.footR], ticks = Math.round(clip.duration * 60);
  // ankle positions a tick apart, one past each end so every tick has a neighbour either side
  const at = feet.map((f) =>
    Array.from({ length: ticks + 2 }, (_, i) => {
      mixer.setTime((((i - 1 + ticks) % ticks) / 60));
      rig.root.updateMatrixWorld(true);
      return rig.root.worldToLocal(f.getWorldPosition(new THREE.Vector3()));
    }),
  );
  let travel = 0, time = 0;
  const contact = at.map((a) => {
    let c = Float32Array.from({ length: ticks }, (_, i) => {
      const back = ((a[i].z - a[i + 2].z) / 2) * 60;
      const w = bearing(a[i + 1].y, back);
      travel += w * back;
      time += w;
      return w;
    });
    // soften the edges so a foot never takes or gives up its weight within a single tick
    for (let pass = 0; pass < 2; pass++) c = c.map((v, i) => (c[(i + ticks - 1) % ticks] + 2 * v + c[(i + 1) % ticks]) / 4);
    return c;
  }) as Stride['contact'];
  return { contact, speed: travel / time };
}

interface Leg {
  thigh: THREE.Object3D;
  shin: THREE.Object3D;
  foot: THREE.Object3D;
  /** The pose the clips last left the three joints in. */
  posed: THREE.Quaternion[];
  /** Where the foot is held, relative to where the clip has it (root space, m). */
  slip: THREE.Vector3;
  /** Where the clip had the ankle last tick (root space); null until there is a last tick. */
  last: THREE.Vector3 | null;
}

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3(), _moved = new THREE.Vector3();
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _w = new THREE.Quaternion();

/**
 * Feet that stand on the ground: while the stride clip has a foot bearing weight, the foot is
 * held where it came down (the body's own travel is taken off it), pressed flat onto the
 * ground, and the leg bends or straightens to reach it, the hips sinking so the knee stays
 * bent. Once the clip lifts the foot it catches up with the clip again. Drawing only, like
 * BodyMotion: the clips stay as they are, and `begin` puts their pose back before the mixer runs.
 */
export class FootPlant {
  private readonly legs: Leg[];
  /** Ankle height standing straight, the foot flat on the ground. */
  private readonly ground: number;
  private drop = 0;
  private readonly hipsAt = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private placed = false;
  private laid = false;

  constructor(private readonly rig: Rig, private readonly stride: Stride) {
    const b = rig.bones;
    this.ground = rig.p.hipHeight + b.thighL.position.y - rig.p.thigh - rig.p.shin;
    this.legs = (['L', 'R'] as const).map((s) => {
      const thigh = b[`thigh${s}`], shin = b[`shin${s}`], foot = b[`foot${s}`];
      return { thigh, shin, foot, posed: [thigh, shin, foot].map((j) => j.quaternion.clone()), slip: new THREE.Vector3(), last: null };
    });
  }

  /** Before the mixer runs: take the layer off again, leaving the pose of the clips. */
  begin(): void {
    if (!this.laid) return;
    this.rig.bones.hips.position.copy(this.hipsAt);
    for (const l of this.legs) [l.thigh, l.shin, l.foot].forEach((j, i) => j.quaternion.copy(l.posed[i]));
    this.laid = false;
  }

  /**
   * After the clips (and the carriage) have posed the body and the root stands where it is
   * this tick. `weight`: how much of the pose is the stride clip (0 leaves the clips as they
   * are); `time`: where that clip is (s).
   */
  update(dt: number, weight: number, time: number): void {
    const { root, bones: b, p } = this.rig;
    this.hipsAt.copy(b.hips.position);
    for (const l of this.legs) [l.thigh, l.shin, l.foot].forEach((j, i) => l.posed[i].copy(j.quaternion));
    this.laid = true;
    root.updateMatrixWorld(true);
    // the body's travel this tick, in its own frame; only the part the stride covers, ahead or
    // back (sliding sideways along a wall, the feet go with the body instead of splaying the legs)
    root.getWorldPosition(_v);
    _moved.subVectors(_v, this.at);
    const warped = !this.placed || _moved.lengthSq() > WARP * WARP;
    this.at.copy(_v);
    this.placed = true;
    _moved.applyQuaternion(root.getWorldQuaternion(_q).invert());
    _moved.x = 0;

    const reach = p.thigh + p.shin, easy = reach * EASY, most = reach * FULL;
    let want = 0;
    const targets = this.legs.map((l, k) => {
      const ankle = root.worldToLocal(l.foot.getWorldPosition(new THREE.Vector3()));
      const c = weight * this.contact(k, time);
      if (warped || !l.last) l.slip.set(0, 0, 0);
      // a foot taking weight stays where it is on the ground: neither the body's travel nor the clip moves it
      else l.slip.addScaledVector(_moved, -c).addScaledVector(_a.subVectors(ankle, l.last), -c);
      l.slip.y = 0;
      l.slip.multiplyScalar(Math.exp(-RECOVER * (1 - c) * dt)).clampLength(0, MAX_SLIP);
      l.last = (l.last ?? new THREE.Vector3()).copy(ankle);
      const t = ankle.clone().add(l.slip);
      t.y -= c * (t.y - this.ground);
      // how far the hips must come down for this leg to reach its foot at ease (a leg in the air asks nothing)
      root.worldToLocal(l.thigh.getWorldPosition(_h));
      const flat = Math.min(easy, Math.hypot(t.x - _h.x, t.z - _h.z));
      want = Math.min(want, c * (Math.sqrt(easy * easy - flat * flat) - (_h.y - t.y)));
      return { t, c };
    });
    if (weight <= 0) {
      this.drop = 0;
      return;
    }
    want = Math.max(want, -MAX_DROP);
    this.drop += (want - this.drop) * (1 - Math.exp(-(want < this.drop ? SINK : RISE) * dt));
    b.hips.position.y += this.drop * weight;
    b.hips.updateMatrixWorld(true);

    this.legs.forEach((l, i) => {
      const { t, c } = targets[i];
      root.localToWorld(t);
      l.thigh.getWorldPosition(_h);
      // the knee bends to make the hip-to-ankle span (law of cosines), then the thigh swings it onto the foot
      let d = Math.max(t.distanceTo(_h), Math.abs(p.thigh - p.shin) + 1e-3);
      // past an easy span the leg stretches ever less, so the knee straightens smoothly and never locks
      if (d > easy) d = easy + (most - easy) * (1 - Math.exp(-(d - easy) / (most - easy)));
      l.shin.quaternion.setFromAxisAngle(X, Math.acos(clamp((d * d - p.thigh * p.thigh - p.shin * p.shin) / (2 * p.thigh * p.shin), -1, 1)));
      l.thigh.updateMatrixWorld(true);
      _a.subVectors(l.foot.getWorldPosition(_a), _h).normalize();
      _q.setFromUnitVectors(_a, _t.subVectors(t, _h).normalize());
      l.thigh.parent!.getWorldQuaternion(_p);
      l.thigh.quaternion.premultiply(_w.copy(_p)).premultiply(_q).premultiply(_p.invert());
      // the sole lies flat on the ground while it bears weight
      l.thigh.updateMatrixWorld(true);
      if (c > 0) {
        l.foot.getWorldQuaternion(_w).slerp(root.getWorldQuaternion(_q), c);
        l.foot.quaternion.copy(l.shin.getWorldQuaternion(_p).invert().multiply(_w));
      }
      // part stride, part something else (a crossfade): only that share of the reach
      if (weight < 1) [l.thigh, l.shin, l.foot].forEach((j, n) => j.quaternion.slerpQuaternions(l.posed[n], j.quaternion.clone(), weight));
    });
  }

  /** How much foot `k` bears weight `time` seconds into the stride clip (between its samples, a straight line). */
  private contact(k: number, time: number): number {
    const c = this.stride.contact[k], n = c.length, u = (((time * 60) % n) + n) % n, i = Math.floor(u);
    return c[i] + (c[(i + 1) % n] - c[i]) * (u - i);
  }
}
