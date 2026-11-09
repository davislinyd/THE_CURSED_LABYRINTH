import * as THREE from 'three';

/**
 * A humanoid joint hierarchy for rigid-part characters (each armour plate or
 * limb segment is parented to a joint, as in early PS2 games).
 *
 * Rest pose: standing, facing +Z, arms hanging down. Angles are degrees:
 *   arms / legs  x < 0 swings forward, elbows bend with x < 0, knees with x > 0
 *   spine        x > 0 leans forward, y twists left
 *   left limbs   z > 0 raises outward (the left side is +X); right limbs z < 0
 */
export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'armL', 'forearmL', 'handL',
  'shoulderR', 'armR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
] as const;

export type BoneName = (typeof BONES)[number];

export interface Proportions {
  hipHeight: number;
  spine: number;
  chest: number;
  neck: number;
  shoulder: number;
  upperArm: number;
  forearm: number;
  thigh: number;
  shin: number;
  hipWidth: number;
}

export const HUMAN: Proportions = {
  hipHeight: 0.95, spine: 0.14, chest: 0.24, neck: 0.1, shoulder: 0.19,
  upperArm: 0.29, forearm: 0.26, thigh: 0.44, shin: 0.43, hipWidth: 0.1,
};

export interface Rig {
  /** Moves and turns with the character; its child `hips` is animated. */
  root: THREE.Group;
  bones: Record<BoneName, THREE.Object3D>;
  p: Proportions;
}

export function buildRig(p: Proportions = HUMAN): Rig {
  const root = new THREE.Group();
  const b = {} as Record<BoneName, THREE.Object3D>;
  const joint = (name: BoneName, parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    b[name] = o;
    return o;
  };
  const hips = joint('hips', root, 0, p.hipHeight);
  const spine = joint('spine', hips, 0, 0.06);
  const chest = joint('chest', spine, 0, p.spine);
  const neck = joint('neck', chest, 0, p.chest);
  joint('head', neck, 0, p.neck);
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const sh = joint(`shoulder${s}`, chest, side * p.shoulder * 0.45, p.chest - 0.05);
    const arm = joint(`arm${s}`, sh, side * p.shoulder * 0.55, 0);
    const fore = joint(`forearm${s}`, arm, 0, -p.upperArm);
    joint(`hand${s}`, fore, 0, -p.forearm);
    const thigh = joint(`thigh${s}`, hips, side * p.hipWidth, -0.04);
    const shin = joint(`shin${s}`, thigh, 0, -p.thigh);
    joint(`foot${s}`, shin, 0, -p.shin);
  }
  return { root, bones: b, p };
}

/** Joint angles in degrees; `lift` raises the hips (metres), `sway` moves them sideways/forward. */
export type Pose = Partial<Record<BoneName, [number, number, number]>> & { lift?: number; sway?: [number, number] };

const D = Math.PI / 180;
const q = new THREE.Quaternion();
const e = new THREE.Euler();

/**
 * How a pose is reached from the one before: `in` speeds up, `out` slows down,
 * `inOut` does both; `whip` is a blow, the body turning first and the arms
 * following late and fast (overlapping action).
 */
export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'whip';
/** A timed pose and how it is reached (linear by default). */
export type Key = [time: number, pose: Pose, ease?: Ease];

/** The arms and head trail the body in a whip. */
const TRAIL = new Set<string>(['neck', 'head', 'shoulderL', 'armL', 'forearmL', 'handL', 'shoulderR', 'armR', 'forearmR', 'handR']);
const smooth = (u: number) => u * u * (3 - 2 * u);
const within = (u: number, a: number, b: number) => Math.min(1, Math.max(0, (u - a) / (b - a)));

/** Share of the way from the last pose at fraction u of the step into a key. */
function eased(ease: Ease, u: number, bone: string): number {
  switch (ease) {
    case 'in':
      return u * u;
    case 'out':
      return 1 - (1 - u) * (1 - u);
    case 'inOut':
      return smooth(u);
    case 'whip':
      return TRAIL.has(bone) ? within(u, 0.15, 1) ** 2 : smooth(within(u, 0, 0.65));
    default:
      return u;
  }
}

/**
 * An AnimationClip from timed poses. Every joint gets a track, so blending
 * from any other clip never leaves a joint where the previous clip put it.
 * Eased steps are baked into a key per tick (the mixer itself only interpolates linearly).
 */
export function makeClip(name: string, keys: Key[], p: Proportions = HUMAN): THREE.AnimationClip {
  // every key, plus a sample each tick inside eased steps: [time, key index, fraction]
  const samples: [number, number, number][] = [];
  keys.forEach(([t, , ease], i) => {
    if (i > 0 && ease && ease !== 'linear') {
      const t0 = keys[i - 1][0], n = Math.round((t - t0) * 60);
      for (let k = 1; k < n; k++) samples.push([t0 + (k / n) * (t - t0), i, k / n]);
    }
    samples.push([t, i, 1]);
  });
  const times = samples.map(([t]) => t);
  const tracks: THREE.KeyframeTrack[] = [];
  const at = new THREE.Quaternion();
  for (const bone of BONES) {
    const qs = keys.map(([, pose]) => {
      const a = pose[bone] ?? [0, 0, 0];
      return new THREE.Quaternion().setFromEuler(e.set(a[0] * D, a[1] * D, a[2] * D, 'YXZ'));
    });
    const values: number[] = [];
    for (const [, i, u] of samples) {
      q.copy(u === 1 ? qs[i] : at.slerpQuaternions(qs[i - 1], qs[i], eased(keys[i][2]!, u, bone)));
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }
  const hip = (pose: Pose) => [pose.sway?.[0] ?? 0, p.hipHeight + (pose.lift ?? 0), pose.sway?.[1] ?? 0];
  const pos: number[] = [];
  for (const [, i, u] of samples) {
    const b = hip(keys[i][1]);
    if (u === 1) pos.push(...b);
    else {
      const a = hip(keys[i - 1][1]), w = eased(keys[i][2]!, u, 'hips');
      pos.push(...a.map((v, k) => v + (b[k] - v) * w));
    }
  }
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, pos));
  return new THREE.AnimationClip(name, times[times.length - 1], tracks);
}

/**
 * A looping clip (a gait) from timed poses, the last one repeating the first. The joints
 * pass through the poses on a smooth closed curve (Catmull-Rom over the angles, baked a key
 * per tick): with straight steps every joint would stop dead or snap back at each pose,
 * which in a stride reads as a twitch.
 */
export function makeLoop(name: string, keys: Key[], p: Proportions = HUMAN): THREE.AnimationClip {
  const n = keys.length - 1, period = keys[n][0];
  // key k of the loop, its time carried on past either end
  const pose = (k: number) => keys[((k % n) + n) % n][1];
  const time = (k: number) => keys[((k % n) + n) % n][0] + Math.floor(k / n) * period;
  const ticks = Math.round(period * 60);
  const times = Array.from({ length: ticks + 1 }, (_, i) => (i / ticks) * period);
  /** Value of `f` at time t: cubic Hermite between the keys either side, sloped toward their neighbours. */
  const curve = (t: number, f: (pose: Pose) => number) => {
    let k = 0;
    while (k < n - 1 && t >= keys[k + 1][0]) k++;
    const t0 = time(k), t1 = time(k + 1), h = t1 - t0, u = (t - t0) / h;
    const v0 = f(pose(k)), v1 = f(pose(k + 1));
    const m0 = ((v1 - f(pose(k - 1))) / (t1 - time(k - 1))) * h;
    const m1 = ((f(pose(k + 2)) - v0) / (time(k + 2) - t0)) * h;
    return (2 * u ** 3 - 3 * u ** 2 + 1) * v0 + (u ** 3 - 2 * u ** 2 + u) * m0 + (3 * u ** 2 - 2 * u ** 3) * v1 + (u ** 3 - u ** 2) * m1;
  };
  const tracks: THREE.KeyframeTrack[] = [];
  for (const bone of BONES) {
    const values: number[] = [];
    for (const t of times) {
      const [x, y, z] = [0, 1, 2].map((c) => curve(t, (ps) => (ps[bone]?.[c] ?? 0) * D));
      q.setFromEuler(e.set(x, y, z, 'YXZ'));
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }
  const pos: number[] = [];
  for (const t of times) pos.push(curve(t, (ps) => ps.sway?.[0] ?? 0), p.hipHeight + curve(t, (ps) => ps.lift ?? 0), curve(t, (ps) => ps.sway?.[1] ?? 0));
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, pos));
  return new THREE.AnimationClip(name, period, tracks);
}

/** Mirror a pose left/right (for alternating steps). */
export function mirror(pose: Pose): Pose {
  const out: Pose = { lift: pose.lift, sway: pose.sway ? [-pose.sway[0], pose.sway[1]] : undefined };
  for (const bone of BONES) {
    const a = pose[bone];
    if (!a) continue;
    const other = (bone.endsWith('L') ? bone.slice(0, -1) + 'R' : bone.endsWith('R') ? bone.slice(0, -1) + 'L' : bone) as BoneName;
    out[other] = [a[0], -a[1], -a[2]];
  }
  return out;
}
