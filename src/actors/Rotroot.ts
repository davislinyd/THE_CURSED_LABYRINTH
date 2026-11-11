import * as THREE from 'three';
import type { Assets } from '../engine/Assets';
import { rng } from '../engine/ProcTex';
import { type ActionTiming, Skin } from './Enemies';
import { patch } from '../engine/Shading';
import { part } from './Build';

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

/** A limb of wood along a curve, thick at its foot and thin at its end. */
function limb(points: THREE.Vector3[], r0: number, r1: number, radial = 7, segs = 10): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, segs, r0, radial, false);
  const p = g.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const k = mix(1, r1 / r0, i / segs) * (1 + 0.12 * Math.sin(i * 2.3 + points[0].x * 5));
    for (let j = 0; j <= radial; j++) {
      const v = i * (radial + 1) + j;
      p.setXYZ(v, c.x + (p.getX(v) - c.x) * k, c.y + (p.getY(v) - c.y) * k, c.z + (p.getZ(v) - c.z) * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

const EMBER_GLSL = /* glsl */ `
uniform float uEmber;
varying vec3 vEmberPos;
float eHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float eNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(eHash(i), eHash(i + vec3(1, 0, 0)), f.x), mix(eHash(i + vec3(0, 1, 0)), eHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(eHash(i + vec3(0, 0, 1)), eHash(i + vec3(1, 0, 1)), f.x), mix(eHash(i + vec3(0, 1, 1)), eHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

/**
 * The first guardian: a rotting zelkova that woke with a grudge. A gnarled trunk
 * with a hollow mouth and two burning knots for eyes, four root-arms that sway,
 * slam and sweep. Embers smoulder in the cracks of its bark and flare before a blow.
 * Animated in code.
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
  /** How brightly the cracks in the bark smoulder. */
  private readonly ember = { value: 0.7 };
  /** 0..1, set by the scene: a blow is coming (cracks, eyes and its light flare). */
  warn = 0;

  constructor(bark: THREE.Material) {
    this.root.add(this.body);
    const r = rng(77);
    // trunk: a tapered column, ridged, twisted, flaring into its roots, with a burl on its flank
    const trunk = new THREE.CylinderGeometry(0.85, 1.4, 4.6, 40, 28);
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, z) + y * 0.12;
      // the bark lies calmer round the face
      const face = Math.exp(-(a * a) * 2.2 - (y - 0.4) * (y - 0.4) * 0.5);
      const ridges = 0.12 * Math.sin(3 * a + y * 1.7) + 0.08 * Math.sin(7 * a - y * 2.3) + (0.045 * Math.sin(13 * a + y * 5) + 0.028 * Math.sin(23 * a + y * 3.1)) * (1 - 0.6 * face);
      const flare = 1 + 0.34 * Math.exp(-(y + 2.3) * 1.5);
      const da = Math.atan2(Math.sin(a - 2.1), Math.cos(a - 2.1));
      const burl = 0.2 * Math.exp(-da * da * 5 - (y + 0.3) * (y + 0.3) * 2.2);
      const rad = Math.hypot(x, z) * (1 + ridges + burl) * flare;
      p.setXYZ(i, Math.sin(a) * rad, y, Math.cos(a) * rad);
    }
    trunk.computeVertexNormals();
    part(this.body, trunk, bark, 0, 2.3, 0).receiveShadow = true;
    // hollow mouth with splintered lips
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x050302 }));
    mouth.scale.set(0.42, 0.62, 0.22);
    mouth.position.set(0, 2.25, 1.18);
    this.body.add(mouth);
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2, len = 0.24 + r() * 0.2;
      part(this.body, new THREE.ConeGeometry(0.045 + r() * 0.02, len, 5), bark, Math.sin(a) * 0.4, 2.25 + Math.cos(a) * 0.58, 1.2, Math.PI / 2 + Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
    }
    // burning knots under heavy brows
    for (const s of [1, -1]) {
      part(this.body, new THREE.SphereGeometry(0.15, 12, 10), this.eyeMat, s * 0.36, 3.2, 0.98);
      part(this.body, new THREE.TorusGeometry(0.2, 0.08, 8, 16), bark, s * 0.36, 3.2, 0.95, 0, s * 0.25, 0);
      part(this.body, limb([new THREE.Vector3(s * 0.08, 3.42, 1.0), new THREE.Vector3(s * 0.36, 3.5, 1.06), new THREE.Vector3(s * 0.7, 3.36, 0.86)], 0.09, 0.05, 6, 6), bark);
    }
    this.core.position.set(0, 3.0, 1.0);
    this.light.position.set(0, 3.0, 1.8);
    this.body.add(this.core, this.light);
    // dead crown: bent boughs that fork into twigs
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r() * 0.4, lean = 0.5 + r() * 0.5, len = 1.7 + r() * 1.1;
      const dx = Math.sin(a), dz = Math.cos(a), bend = (r() - 0.5) * 0.9;
      const at = (u: number, out: number, side: number) => new THREE.Vector3(dx * (0.45 + out) - dz * side, 4.45 + u * len * Math.cos(lean), dz * (0.45 + out) + dx * side);
      const pts = [at(0, 0, 0), at(0.4, len * 0.25 * Math.sin(lean), bend * 0.2), at(0.8, len * 0.7 * Math.sin(lean), bend * 0.6), at(1, len * Math.sin(lean), bend)];
      part(this.body, limb(pts, 0.2, 0.04, 7, 9), bark);
      for (let j = 0; j < 3; j++) {
        const from = pts[1 + (j % 2)].clone().lerp(pts[2 + (j % 2)], 0.3 + r() * 0.4);
        const tip = from.clone().add(new THREE.Vector3((r() - 0.5) * 1.2, 0.5 + r() * 0.7, (r() - 0.5) * 1.2));
        part(this.body, limb([from, from.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.12, 0)), tip], 0.06, 0.012, 5, 5), bark);
      }
    }
    // anchoring roots: out of the flare, arching once, then along the ground
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + r() * 0.3, len = 2.0 + r() * 1.3, wig = (r() - 0.5) * 0.8;
      const dx = Math.sin(a), dz = Math.cos(a);
      const at = (d: number, y: number, side: number) => new THREE.Vector3(dx * d - dz * side, y, dz * d + dx * side);
      const g = limb([at(0.9, 0.85, 0), at(1.5, 0.42 + r() * 0.2, wig * 0.2), at(1.5 + len * 0.5, 0.12, wig * 0.7), at(1.5 + len, 0.0, wig)], 0.3, 0.05, 7, 10);
      part(this.root, g, bark).receiveShadow = true;
    }
    // root-arms: a chain of joints along each one's +Z, one skin of wood over the chain
    const bases: [number, number][] = [[-0.6, 1.9], [0.6, 2.1], [-1.6, 1.5], [1.6, 1.7]];
    const L = SEGMENTS * SEG_LEN;
    bases.forEach(([yaw, h], n) => {
      const joints: THREE.Bone[] = [];
      for (let k = 0; k < SEGMENTS; k++) {
        const j = new THREE.Bone();
        j.rotation.order = 'YXZ';
        if (k === 0) j.position.set(Math.sin(yaw) * 1.0, h, Math.cos(yaw) * 1.0);
        else {
          j.position.z = SEG_LEN;
          joints[k - 1].add(j);
        }
        joints.push(j);
      }
      const g = new THREE.CylinderGeometry(1, 1, L, 10, SEGMENTS * 3, false);
      g.rotateX(Math.PI / 2).translate(0, 0, L / 2);
      const gp = g.attributes.position, idx: number[] = [], wts: number[] = [];
      for (let i = 0; i < gp.count; i++) {
        const z = gp.getZ(i), u = z / L;
        // tapering, knotted wood
        const rad = (0.25 - u * 0.205) * (1 + 0.1 * Math.sin(z * 6.3 + n * 2) + 0.06 * Math.sin(z * 15 + Math.atan2(gp.getX(i), gp.getY(i)) * 3));
        gp.setXYZ(i, gp.getX(i) * rad + joints[0].position.x, gp.getY(i) * rad + joints[0].position.y, z + joints[0].position.z);
        // each stretch follows its joint; round a joint the two neighbours share the wood, so it bends without a seam
        const t = Math.max(0, z / SEG_LEN - 0.5), j0 = Math.min(SEGMENTS - 1, Math.floor(t)), j1 = Math.min(SEGMENTS - 1, j0 + 1);
        const w = smooth((t - j0 - 0.25) / 0.5);
        idx.push(j0, j1, 0, 0);
        wts.push(1 - w, w, 0, 0);
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
      g.computeVertexNormals();
      const wood = new THREE.SkinnedMesh(g, bark);
      wood.castShadow = true;
      // its bounds are those of the rest pose: never cull a swinging arm
      wood.frustumCulled = false;
      wood.add(joints[0]);
      this.body.add(wood);
      wood.bind(new THREE.Skeleton(joints));
      // splayed rootlets at the tip
      for (let k = 0; k < 3; k++) {
        const tw = new THREE.Vector3((k - 1) * 0.16, (r() - 0.5) * 0.14, SEG_LEN + 0.3 + r() * 0.2);
        part(joints[SEGMENTS - 1], limb([new THREE.Vector3(0, 0, SEG_LEN * 0.6), tw.clone().multiplyScalar(0.7).setZ(SEG_LEN), tw], 0.035, 0.008, 5, 4), bark);
      }
      this.arms.push({ joints, yaw, phase: n * 1.7 });
    });
    // the eyes' colour is animated, so they keep their own material
    this.skin = new Skin(this.root, new Set([this.eyeMat]));
    // embers in the cracks of the bark: thin veins along a noise field fixed to the wood
    const ember = this.ember;
    const seen = new Set<THREE.Material>();
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m?.isMeshStandardMaterial || seen.has(m)) return;
      seen.add(m);
      if (m.normalMap) m.normalScale.setScalar(1.6);
      patch(m, 'ember', (sh) => {
        sh.uniforms.uEmber = ember;
        sh.vertexShader = 'varying vec3 vEmberPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vEmberPos = position;');
        sh.fragmentShader = EMBER_GLSL + sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float en = eNoise(vEmberPos * 2.6) * 0.6 + eNoise(vEmberPos * 6.7 + 4.0) * 0.4;
            float vein = 1.0 - smoothstep(0.0, 0.017, abs(en - 0.5));
            totalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * vein * uEmber * (0.5 + 0.9 * eNoise(vEmberPos * 3.1 + 9.0));
          }`,
        );
      });
    });
    this.update(0);
  }

  /** Struck: flash white, then red (faintly: it fills the view). */
  flash(): void {
    this.skin.flash(0.12);
  }

  dispose(): void {
    // each arm's skeleton keeps its joints' matrices in a texture of its own
    this.root.traverse((o) => (o as THREE.SkinnedMesh).skeleton?.dispose());
    this.skin.dispose();
    this.light.dispose();
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
    const warn = act === 'die' ? 0 : this.warn;
    const eye = glow * (1 + warn * 0.9);
    this.eyeMat.color.setRGB(1 * eye, (0.63 - 0.25 * warn) * eye, (0.25 - 0.15 * warn) * eye);
    this.light.intensity = 24 * glow * (0.9 + 0.1 * Math.sin(c * 11)) * (1 + warn * 0.9);
    this.light.color.setRGB(1, 0.54 - 0.3 * warn, 0.19 - 0.12 * warn);
    this.ember.value = glow * (0.42 + 0.16 * Math.sin(c * 1.9)) + warn * 2.4;
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
