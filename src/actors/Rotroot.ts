import * as THREE from 'three';
import type { Assets } from '../engine/Assets';
import { rng } from '../engine/ProcTex';
import { type ActionTiming, Skin } from './Enemies';
import { cyl, part } from './Build';

export type RotrootAction = 'idle' | 'slam' | 'sweep' | 'hurt' | 'stagger' | 'die';

/** Ticks (60 Hz). A slam lies on the ground after its blow: the time to strike back. */
export const ROTROOT_ATTACK = {
  slam: { len: 108, active: [48, 57] },
  sweep: { len: 96, active: [40, 60] },
} satisfies Record<string, ActionTiming>;
export const ROTROOT_REACT = { hurt: 24, stagger: 120, die: 150 };

const SEGMENTS = 9;
const SEG_LEN = 0.42;

interface Arm {
  joints: THREE.Object3D[];
  yaw: number;
  phase: number;
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * The first guardian: a rotting zelkova that woke with a grudge. A gnarled trunk
 * with a hollow mouth and two burning knots for eyes, four root-arms that sway,
 * slam and sweep. Animated in code.
 */
export class Rotroot {
  readonly root = new THREE.Group();
  /** The trunk sways and shudders as one piece. */
  private readonly body = new THREE.Group();
  readonly arms: Arm[] = [];
  /** Between the eyes: the lock-on point. */
  readonly core = new THREE.Object3D();
  private readonly eyeMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  private readonly light = new THREE.PointLight(0xff8a30, 24, 12, 1.5);
  private action: RotrootAction = 'idle';
  private arm = 0;
  private t = 0;
  private clock = 0;
  private readonly skin: Skin;

  constructor(bark: THREE.Material) {
    this.root.add(this.body);
    const r = rng(77);
    // trunk: a tapered column, lumpy and slightly twisted
    const trunk = new THREE.CylinderGeometry(0.85, 1.4, 4.6, 24, 12);
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, z) + y * 0.12;
      const rad = Math.hypot(x, z) * (1 + 0.12 * Math.sin(3 * a + y * 1.7) + 0.08 * Math.sin(7 * a - y * 2.3) + 0.04 * Math.sin(13 * a + y * 5));
      p.setXYZ(i, Math.sin(a) * rad, y, Math.cos(a) * rad);
    }
    trunk.computeVertexNormals();
    part(this.body, trunk, bark, 0, 2.3, 0).receiveShadow = true;
    // hollow mouth with splintered lips
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x050302 }));
    mouth.scale.set(0.42, 0.62, 0.22);
    mouth.position.set(0, 2.25, 1.18);
    this.body.add(mouth);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      part(this.body, new THREE.ConeGeometry(0.05, 0.28 + r() * 0.12, 5), bark, Math.sin(a) * 0.4, 2.25 + Math.cos(a) * 0.58, 1.2, Math.PI / 2 + Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
    }
    // burning knots
    for (const s of [1, -1]) {
      part(this.body, new THREE.SphereGeometry(0.15, 12, 10), this.eyeMat, s * 0.36, 3.2, 0.98);
      part(this.body, new THREE.TorusGeometry(0.2, 0.08, 8, 16), bark, s * 0.36, 3.2, 0.95, 0, s * 0.25, 0);
    }
    this.core.position.set(0, 3.0, 1.0);
    this.light.position.set(0, 3.0, 1.8);
    this.body.add(this.core, this.light);
    // dead crown
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r() * 0.4, tilt = 0.5 + r() * 0.5, len = 1.6 + r() * 0.8;
      const branch = new THREE.Object3D();
      branch.position.set(Math.sin(a) * 0.5, 4.5, Math.cos(a) * 0.5);
      branch.rotation.set(tilt, a, 0, 'YXZ');
      this.body.add(branch);
      part(branch, cyl(0.06, 0.22, len, 7), bark, 0, len / 2, 0);
      for (let j = 0; j < 2; j++) {
        const twig = new THREE.Object3D();
        twig.position.y = len * (0.5 + j * 0.3);
        twig.rotation.set((j ? -1 : 1) * (0.6 + r() * 0.4), r() * 3, 0);
        branch.add(twig);
        part(twig, cyl(0.02, 0.07, 0.9, 5), bark, 0, 0.45, 0);
      }
    }
    // anchoring roots
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.3, len = 1.6 + r() * 1.0;
      const root = new THREE.Object3D();
      root.position.set(Math.sin(a) * 1.1, 0.3, Math.cos(a) * 1.1);
      root.rotation.set(1.3 + r() * 0.15, a, 0, 'YXZ');
      this.root.add(root);
      part(root, cyl(0.06, 0.32, len, 7), bark, 0, len / 2, 0).receiveShadow = true;
    }
    // root-arms: chains of tapering segments along each joint's +Z
    const bases: [number, number][] = [[-0.6, 1.9], [0.6, 2.1], [-1.6, 1.5], [1.6, 1.7]];
    bases.forEach(([yaw, h], n) => {
      const joints: THREE.Object3D[] = [];
      let parent: THREE.Object3D = this.body;
      for (let k = 0; k < SEGMENTS; k++) {
        const j = new THREE.Object3D();
        j.rotation.order = 'YXZ';
        if (k === 0) j.position.set(Math.sin(yaw) * 1.0, h, Math.cos(yaw) * 1.0);
        else j.position.z = SEG_LEN;
        parent.add(j);
        const r0 = 0.24 - k * 0.022, r1 = 0.24 - (k + 1) * 0.022;
        const g = cyl(r1, r0, SEG_LEN + 0.06, 8);
        g.rotateX(Math.PI / 2).translate(0, 0, SEG_LEN / 2);
        part(j, g, bark);
        joints.push(j);
        parent = j;
      }
      this.arms.push({ joints, yaw, phase: n * 1.7 });
    });
    // the eyes' colour is animated, so they keep their own material
    this.skin = new Skin(this.root, new Set([this.eyeMat]));
    this.update(0);
  }

  /** Struck: flash white, then red (faintly: it fills the view). */
  flash(): void {
    this.skin.flash(0.12);
  }

  dispose(): void {
    this.skin.dispose();
  }

  /** Start an action; `arm` picks the root-arm that slams or sweeps (0, 1 front; 2, 3 sides). */
  play(a: RotrootAction, arm = 0): void {
    this.action = a;
    this.arm = arm;
    this.t = 0;
  }

  /** World position of an arm joint (0 = base .. SEGMENTS-1, and SEGMENTS for the tip), for hit tests. */
  armPoint(arm: number, k: number, out = new THREE.Vector3()): THREE.Vector3 {
    const js = this.arms[arm].joints;
    return k < js.length ? js[k].getWorldPosition(out) : js[js.length - 1].localToWorld(out.set(0, 0, SEG_LEN));
  }

  update(dt: number): void {
    this.t += dt;
    this.clock += dt;
    const t = this.t, c = this.clock, act = this.action;
    let glow = 1, sink = 0, lean = 0, shake = 0;
    if (act === 'hurt') (glow = t < 0.12 ? 2.2 : 1), (shake = Math.max(0, 1 - t / 0.4));
    else if (act === 'stagger') (glow = 0.45), (lean = -0.08 * smooth(t / 0.3));
    else if (act === 'die') (glow = Math.max(0, 1 - t / 2)), (sink = 0.35 * smooth(t / 2.5)), (lean = -0.2 * smooth(t / 2.5));
    this.body.rotation.set(lean + Math.sin(c * 0.7) * 0.015, 0, Math.sin(c * 0.5) * 0.02 + Math.sin(t * 50) * 0.03 * shake);
    this.body.position.y = -sink;
    this.eyeMat.color.setRGB(1 * glow, 0.63 * glow, 0.25 * glow);
    this.light.intensity = 24 * glow * (0.9 + 0.1 * Math.sin(c * 11));
    this.skin.update(0);

    this.arms.forEach((arm, n) => {
      // resting curve: out and up, arcing down to the ground, gently swaying
      let yaw = arm.yaw + 0.1 * Math.sin(c * 0.9 + arm.phase);
      const pitch = (k: number) => (k === 0 ? -0.35 : 0.2) + 0.1 * Math.sin(c * 1.4 + k * 0.6 + arm.phase);
      let first = pitch(0), rest = (k: number) => pitch(k);
      const mine = n === this.arm;
      if (act === 'slam' && mine) {
        // rear up and curl back (telegraph), crash down straight, lie still, withdraw
        const up = smooth(t / 0.8), down = smooth((t - 0.8) / 0.15), back = smooth((t - 1.55) / 0.25);
        const f0 = mix(mix(first, -1.3, up), 0.42, down), r0 = (k: number) => mix(mix(pitch(k), -0.12, up), 0.02, down);
        first = mix(f0, pitch(0), back);
        rest = (k) => mix(r0(k), pitch(k), back);
        yaw = mix(yaw, arm.yaw * 0.4, up * (1 - back));
      } else if (act === 'sweep' && mine) {
        // low across the front, from its own side to the other
        const side = Math.sign(arm.yaw) || 1;
        const wind = smooth(t / 0.66), go = smooth((t - 0.66) / 0.34), back = smooth((t - 1) / 0.6);
        yaw = mix(mix(mix(yaw, side * 1.5, wind), -side * 1.2, go), yaw, back);
        const low = wind * (1 - back);
        first = mix(first, 0.25, low);
        rest = (k) => mix(pitch(k), 0.035, low);
      } else if (act === 'stagger' || act === 'die') {
        const k0 = smooth(t / 0.5);
        first = mix(first, 0.45, k0);
        rest = (k) => mix(pitch(k), 0.06, k0);
      }
      arm.joints.forEach((j, k) => {
        j.rotation.x = k === 0 ? first : rest(k);
        j.rotation.y = k === 0 ? yaw : 0.08 * Math.sin(c * 1.1 + k * 0.7 + arm.phase);
      });
    });
  }
}

export async function buildRotroot(assets: Assets): Promise<Rotroot> {
  const bark = await assets.material('japanese_zelkova_bark', 2, { color: 0x6a5e52 });
  return new Rotroot(bark);
}
