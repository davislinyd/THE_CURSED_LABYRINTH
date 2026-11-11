import * as THREE from 'three';
import { glowTexture, lamellarTextures, noiseTexture } from '../engine/ProcTex';
import { Animator } from './Animator';
import { BodyMotion } from './BodyMotion';
import { cyl, part, swordGrip } from './Build';
import { BONES, BoneName, HUMAN, Pose, Proportions, buildRig, makeClip, mirror } from './Rig';

export type EnemyAction = 'idle' | 'move' | 'attack' | 'hurt' | 'stagger' | 'die';

/** A posed, animated enemy body. Game logic moves `root`; the model only animates. */
export interface EnemyModel {
  readonly root: THREE.Object3D;
  play(action: EnemyAction): void;
  update(dt: number): void;
  /** Struck: flash white, then red. */
  flash(): void;
  /** Release its geometry and its own materials (once it is gone). */
  dispose(): void;
}

export interface ActionTiming {
  /** Ticks (60 Hz) of the whole attack, and [from, to) of the blow. */
  len: number;
  active: [number, number];
}

/** Attack timing per kind, matched to the clips / procedural motion below. */
export const ENEMY_ATTACK = {
  ghoul: { len: 54, active: [27, 33] },
  hopper: { len: 60, active: [30, 40] },
  wisp: { len: 72, active: [36, 60] },
  crow: { len: 84, active: [52, 64] },
} satisfies Record<string, ActionTiming>;

/** Lengths of the other timed actions (ticks). */
export const ENEMY_REACT = { hurt: 21, stagger: 60, die: 72 };

let MATS: ReturnType<typeof makeMaterials> | null = null;

function makeMaterials() {
  const rust = lamellarTextures('#2a1f17', '#4a3426', 5, 10);
  return {
    skin: new THREE.MeshStandardMaterial({ map: noiseTexture(31, '#33382c', '#5d6150', 128, 10), roughness: 0.9 }),
    rag: new THREE.MeshStandardMaterial({ map: noiseTexture(32, '#1e1914', '#3b3128', 128, 12), roughness: 1, side: THREE.DoubleSide }),
    rustPlate: new THREE.MeshStandardMaterial({ map: rust.map, bumpMap: rust.bump, bumpScale: 1.2, roughness: 0.75, metalness: 0.3, side: THREE.DoubleSide }),
    iron: new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.7, metalness: 0.6 }),
    hat: new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide }),
    eye: new THREE.MeshBasicMaterial({ color: 0xd8f0ff }),
    redEye: new THREE.MeshBasicMaterial({ color: 0xff3a20 }),
    shroud: new THREE.MeshStandardMaterial({ map: noiseTexture(41, '#a39c86', '#d9d3c0', 128, 14), roughness: 0.95, side: THREE.DoubleSide }),
    pale: new THREE.MeshStandardMaterial({ color: 0xb9bab0, roughness: 0.8 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.95, side: THREE.DoubleSide }),
    rope: new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9, side: THREE.DoubleSide }),
    feather: new THREE.MeshStandardMaterial({ color: 0x0c0d13, roughness: 0.42, metalness: 0.35, side: THREE.DoubleSide }),
    beak: new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.5 }),
  };
}

/** Ticks of the white-then-red flash when struck (the last two red). */
const FLASH_TICKS = 4;
/** A fallen body starts to burn away this long into its death (s), and is gone after BURN_TIME more. */
const BURN_FROM = 0.5;
const BURN_TIME = 0.65;
const burnAt = (t: number) => (t < BURN_FROM ? 0 : Math.min(1.05, (t - BURN_FROM) / BURN_TIME));

/** Value noise for the burn front, and the patch that adds the flash and the burn to a material. */
const BURN_GLSL = /* glsl */ `
uniform vec4 uFlash;
uniform float uBurn;
varying vec3 vBurnPos;
float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bHash(i), bHash(i + vec3(1, 0, 0)), f.x), mix(bHash(i + vec3(0, 1, 0)), bHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bHash(i + vec3(0, 0, 1)), bHash(i + vec3(1, 0, 1)), f.x), mix(bHash(i + vec3(0, 1, 1)), bHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

function burnPatch(sh: THREE.WebGLProgramParametersWithUniforms, u: Skin['u']): void {
  sh.uniforms.uFlash = u.uFlash;
  sh.uniforms.uBurn = u.uBurn;
  sh.vertexShader = 'varying vec3 vBurnPos;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vBurnPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = BURN_GLSL + sh.fragmentShader
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  float burn = 0.65 * bNoise(vBurnPos * 6.0) + 0.35 * bNoise(vBurnPos * 17.0) - uBurn;\n  if (uBurn > 0.0 && burn < 0.0) discard;')
    .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlash.rgb, uFlash.a);\n  if (uBurn > 0.0) gl_FragColor.rgb += vec3(3.0, 0.8, 0.2) * (1.0 - smoothstep(0.0, 0.07, burn));');
}

/**
 * One body's own copies of its (shared) materials, so it alone flashes when cut
 * and burns away when it falls: an ember edge eats it along a noise pattern.
 */
export class Skin {
  readonly u = { uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }, uBurn: { value: 0 } };
  private readonly mats: THREE.Material[] = [];
  private flashT = 0;
  private flashK = 1;

  /** `keep`: materials the model changes as it animates, left shared and unpatched. */
  constructor(private readonly root: THREE.Object3D, keep: ReadonlySet<THREE.Material> = new Set()) {
    const copies = new Map<THREE.Material, THREE.Material>();
    const u = this.u;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      const src = m.material as THREE.Material;
      if (!m.isMesh || keep.has(src)) return;
      let c = copies.get(src);
      if (!c) {
        c = src.clone();
        c.onBeforeCompile = (sh) => burnPatch(sh, u);
        copies.set(src, c);
        this.mats.push(c);
      }
      m.material = c;
    });
  }

  /** `k` scales the flash (a body filling the screen needs less). */
  flash(k = 1): void {
    this.flashT = FLASH_TICKS;
    this.flashK = k;
    this.u.uFlash.value.set(1, 1, 1, 0.55 * k);
  }

  /** One tick: the flash turns red and ends; `burn` (0..1) eats the body away. */
  update(burn: number): void {
    if (this.flashT > 0 && --this.flashT <= 2) this.u.uFlash.value.set(1, 0.1, 0.04, this.flashT ? 0.4 * this.flashK : 0);
    // a burning body casts no full shadow
    if (burn > 0 && this.u.uBurn.value === 0) this.root.traverse((o) => (o.castShadow = false));
    this.u.uBurn.value = burn;
  }

  /** The geometry under the root and the copied materials. */
  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of this.mats) m.dispose();
  }
}

class RiggedEnemy implements EnemyModel {
  private readonly anim: Animator<EnemyAction>;
  private readonly skin: Skin;
  /** Seconds since it fell (-1 while alive). */
  private dying = -1;
  /** Lean and breath over the clips (drawing only), from how the game moved the root since the last tick. */
  private readonly motion: BodyMotion;
  private readonly was = new THREE.Vector3();
  private wasYaw = 0;
  private action: EnemyAction = 'idle';
  constructor(readonly root: THREE.Object3D, clips: Record<EnemyAction, THREE.AnimationClip>) {
    this.anim = new Animator(root, clips, ['attack', 'hurt', 'stagger', 'die']);
    this.anim.play('idle');
    this.skin = new Skin(root);
    const bones = Object.fromEntries(BONES.map((b) => [b, root.getObjectByName(b)!])) as Record<BoneName, THREE.Object3D>;
    this.motion = new BodyMotion({ root: root as THREE.Group, bones, p: HUMAN });
    this.was.copy(root.position);
    this.wasYaw = root.rotation.y;
  }
  play(a: EnemyAction): void {
    this.anim.play(a, a === 'die' ? 0.15 : 0.1, a === 'attack' || a === 'hurt');
    this.action = a;
    if (a === 'die') this.dying = 0;
  }
  update(dt: number): void {
    this.motion.begin();
    this.anim.update(dt);
    if (dt > 0) {
      const p = this.root.position, turned = this.root.rotation.y - this.wasYaw;
      // a shudder under a blow or a warp is not a stride
      const speed = Math.min(8, Math.hypot(p.x - this.was.x, p.z - this.was.z) / dt);
      this.motion.update(dt, {
        speed,
        yawRate: Math.atan2(Math.sin(turned), Math.cos(turned)) / dt,
        look: null,
        tired: 0.35,
        ease: this.action === 'die' ? 0 : this.action === 'idle' || this.action === 'move' ? 1 : 0.3,
      });
      this.was.copy(p);
      this.wasYaw = this.root.rotation.y;
    }
    if (this.dying >= 0) this.dying += dt;
    this.skin.update(burnAt(this.dying));
  }
  flash(): void {
    this.skin.flash();
  }
  dispose(): void {
    this.skin.dispose();
  }
}

// ------------------------------------------------------------------ ghoul

const GHOUL: Proportions = { ...HUMAN, hipHeight: 0.9, shoulder: 0.17, upperArm: 0.31, forearm: 0.29 };

const g = (lift: number, pose: Pose): Pose => ({ lift, ...pose });
const HUNCH: Pose = g(-0.05, {
  spine: [25, 0, 0], chest: [15, 0, 0], neck: [-15, 0, 0], head: [-20, 0, 12],
  armR: [-20, 0, -8], forearmR: [-25, 0, 0], handR: [20, 0, 0], armL: [-10, 0, 12], forearmL: [-20, 0, 0],
  thighL: [-15, 0, 4], shinL: [25, 0, 0], footL: [-8, 0, 0], thighR: [-5, 0, -4], shinR: [15, 0, 0], footR: [-8, 0, 0],
});
const SHAMBLE: Pose = g(-0.04, {
  ...HUNCH, spine: [28, 8, 6], chest: [15, 6, 0], head: [-20, -8, 16],
  armR: [-35, 0, -8], armL: [10, 0, 14],
  thighL: [-35, 0, 4], shinL: [30, 0, 0], footL: [5, 0, 0], thighR: [15, 0, -4], shinR: [25, 0, 0], footR: [-20, 0, 0],
});
const SHAMBLE_PASS: Pose = g(-0.02, { ...HUNCH, spine: [26, 0, 0], thighL: [-5, 0, 4], shinL: [10, 0, 0], thighR: [-25, 0, -4], shinR: [70, 0, 0], footR: [-10, 0, 0] });

const GHOUL_CLIPS: Record<EnemyAction, THREE.AnimationClip> = {
  idle: makeClip('idle', [[0, HUNCH], [1.3, { ...HUNCH, lift: -0.07, spine: [28, 0, 3], head: [-24, 6, 16] }], [2.6, HUNCH]], GHOUL),
  // a dragging limp: the right leg swings late
  move: makeClip('move', [[0, SHAMBLE], [0.35, SHAMBLE_PASS], [0.6, { ...mirror(SHAMBLE), armR: SHAMBLE.armR, forearmR: HUNCH.forearmR, handR: HUNCH.handR }], [0.85, { ...mirror(SHAMBLE_PASS), armR: HUNCH.armR, forearmR: HUNCH.forearmR, handR: HUNCH.handR }], [1.2, SHAMBLE]], GHOUL),
  // a slow overhead chop: raise (telegraph), fall, recover
  attack: makeClip('attack', [
    [0, HUNCH],
    [0.38, g(0.02, { ...HUNCH, spine: [-5, -10, 0], chest: [-10, -10, 0], head: [-5, 10, 0], armR: [-170, 0, -15], forearmR: [-40, 0, 0], handR: [0, 0, 0], armL: [-40, 0, 30], forearmL: [-30, 0, 0] })],
    [0.45, g(0.02, { ...HUNCH, spine: [-8, -12, 0], chest: [-12, -10, 0], head: [-5, 12, 0], armR: [-178, 0, -15], forearmR: [-45, 0, 0], handR: [0, 0, 0], armL: [-40, 0, 30], forearmL: [-30, 0, 0] })],
    [0.53, g(-0.12, { ...HUNCH, spine: [45, 10, 0], chest: [20, 5, 0], head: [-30, 0, 0], armR: [-60, 0, -5], forearmR: [0, 0, 0], handR: [40, 0, 0], armL: [10, 0, 20], thighL: [-40, 0, 4], shinL: [40, 0, 0], thighR: [20, 0, -4] })],
    [0.9, HUNCH],
  ], GHOUL),
  hurt: makeClip('hurt', [[0, HUNCH], [0.07, { ...HUNCH, spine: [5, 0, -10], chest: [-5, 0, 0], head: [-35, 0, -20] }], [0.35, HUNCH]], GHOUL),
  // reeling, arms flung wide: the opening for a counter
  stagger: makeClip('stagger', [
    [0, HUNCH],
    [0.12, g(0, { ...HUNCH, spine: [-15, 0, 8], chest: [-15, 0, 0], head: [-30, 0, 20], armR: [-30, 0, -70], armL: [-30, 0, 70], forearmR: [-10, 0, 0], forearmL: [-10, 0, 0], thighL: [5, 0, 4], thighR: [-25, 0, -4], shinR: [40, 0, 0] })],
    [0.8, g(-0.03, { ...HUNCH, spine: [-8, 0, 12], chest: [-10, 0, 0], head: [-25, 0, 24], armR: [-25, 0, -55], armL: [-25, 0, 55] })],
    [1, HUNCH],
  ], GHOUL),
  die: makeClip('die', [
    [0, HUNCH],
    [0.15, { ...HUNCH, spine: [-20, 0, 0], head: [-40, 0, 0], armR: [-40, 0, -40], armL: [-40, 0, 40] }],
    [0.55, g(-0.42, { ...HUNCH, spine: [40, 0, 0], head: [20, 0, 0], thighL: [-90, 0, 0], shinL: [160, 0, 0], thighR: [-80, 0, 0], shinR: [160, 0, 0], armR: [-10, 0, -10], armL: [-10, 0, 10] })],
    [1.2, g(-0.72, { ...HUNCH, spine: [85, 0, 0], chest: [10, 0, 0], head: [10, 0, 30], thighL: [-90, 0, 0], shinL: [160, 0, 0], thighR: [-80, 0, 0], shinR: [160, 0, 0], armR: [-160, 0, -20], forearmR: [0, 0, 0], armL: [-150, 0, 20], forearmL: [0, 0, 0] })],
  ], GHOUL),
};

/** A dead foot soldier: grey flesh, a split war hat, scraps of armour, a chipped blade. */
export function buildGhoul(): EnemyModel {
  const m = (MATS ??= makeMaterials());
  const rig = buildRig(GHOUL);
  const b = rig.bones;
  const head = part(b.head, new THREE.SphereGeometry(0.1, 10, 8), m.skin, 0, 0.08, 0.01);
  head.scale.set(0.85, 1.05, 0.95);
  // slack jaw over a dark mouth
  part(b.head, new THREE.BoxGeometry(0.07, 0.03, 0.05), m.hat, 0, 0.02, 0.06);
  part(b.head, new THREE.BoxGeometry(0.09, 0.03, 0.08), m.skin, 0, -0.015, 0.045, 0.4);
  for (const s of [1, -1]) part(b.head, new THREE.SphereGeometry(0.016, 6, 4), m.eye, s * 0.035, 0.09, 0.095);
  // war hat with a missing wedge
  part(b.head, new THREE.ConeGeometry(0.27, 0.11, 18, 1, true, 0.6, Math.PI * 2 - 0.9), m.hat, 0, 0.19, 0, -0.12, 0, 0.1);
  part(b.neck, cyl(0.035, 0.045, 0.12, 8), m.skin, 0, 0.05, 0);
  part(b.chest, cyl(0.15, 0.12, 0.3, 10), m.skin, 0, 0.1, 0).scale.z = 0.7;
  // half a breastplate, hanging by its laces
  part(b.chest, cyl(0.17, 0.15, 0.3, 10, true, -1.1, 2.0), m.rustPlate, 0.01, 0.08, 0, 0, 0, 0.08).scale.z = 0.75;
  part(b.spine, cyl(0.12, 0.13, 0.16, 10), m.skin, 0, 0.07, 0).scale.z = 0.7;
  part(b.spine, cyl(0.135, 0.135, 0.05, 10), m.rag, 0, 0.0, 0).scale.z = 0.75;
  // torn loincloth strips
  for (let i = 0; i < 5; i++) part(b.hips, cyl(0.14, 0.2, 0.32 + (i % 2) * 0.1, 4, true, i * 1.25 + 0.2, 0.7), m.rag, 0, -0.16, 0);
  for (const s of ['L', 'R'] as const) {
    part(b[`arm${s}`], cyl(0.04, 0.032, 0.31, 8), m.skin, 0, -0.155, 0);
    part(b[`forearm${s}`], cyl(0.032, 0.028, 0.29, 8), m.skin, 0, -0.145, 0);
    part(b[`forearm${s}`], cyl(0.04, 0.036, 0.12, 8), m.rag, 0, -0.08, 0);
    part(b[`hand${s}`], new THREE.BoxGeometry(0.05, 0.1, 0.04), m.skin, 0, -0.05, 0);
    part(b[`thigh${s}`], cyl(0.06, 0.045, 0.44, 8), m.skin, 0, -0.22, 0);
    part(b[`shin${s}`], cyl(0.045, 0.035, 0.43, 8), m.skin, 0, -0.215, 0);
    part(b[`shin${s}`], cyl(0.055, 0.05, 0.18, 8), m.rag, 0, -0.25, 0);
    part(b[`foot${s}`], new THREE.BoxGeometry(0.07, 0.04, 0.19), m.skin, 0, -0.02, 0.04);
  }
  part(b.armL, cyl(0.1, 0.12, 0.16, 6, true, 0.6, 1.6), m.rustPlate, -0.03, -0.06, 0);
  // chipped, rust-brown blade
  const grip = swordGrip(b.handR);
  part(grip, new THREE.BoxGeometry(0.028, 0.03, 0.2), m.rag, 0, 0, -0.05);
  const blade = new THREE.BoxGeometry(0.006, 0.034, 0.62, 1, 1, 8);
  const pos = blade.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getZ(i) + 0.31) / 0.62;
    const notch = pos.getY(i) < 0 && Math.abs(k - 0.55) < 0.06 ? 0.012 : 0;
    pos.setY(i, pos.getY(i) + 0.04 * k * k + notch);
  }
  blade.computeVertexNormals();
  part(grip, blade, m.iron, 0, 0, 0.36);
  return new RiggedEnemy(rig.root, GHOUL_CLIPS);
}

// ----------------------------------------------------------------- hopper

const STAND: Pose = { spine: [4, 0, 0], chest: [0, 0, 0], neck: [6, 0, 0], head: [10, 0, 4] };

const HOPPER_CLIPS: Record<EnemyAction, THREE.AnimationClip> = {
  idle: makeClip('idle', [[0, STAND], [1.4, { ...STAND, spine: [6, 0, 3], head: [14, 0, 10] }], [2.8, STAND]]),
  // the shrouded body cannot walk: it crouches and springs forward
  move: makeClip('move', [
    [0, { ...STAND, lift: 0 }],
    [0.12, { ...STAND, lift: -0.12, spine: [12, 0, 0], head: [16, 0, 4] }],
    [0.3, { ...STAND, lift: 0.32, spine: [-4, 0, 0], head: [2, 0, 4] }],
    [0.48, { ...STAND, lift: -0.1, spine: [10, 0, 0], head: [18, 0, 4] }],
    [0.6, { ...STAND, lift: 0 }],
  ]),
  // a deep crouch (telegraph), then a flying head-first leap
  attack: makeClip('attack', [
    [0, STAND],
    [0.42, { ...STAND, lift: -0.22, spine: [20, 0, 0], chest: [8, 0, 0], head: [-10, 0, 0] }],
    [0.5, { ...STAND, lift: -0.24, spine: [24, 0, 0], chest: [10, 0, 0], head: [-14, 0, 0] }],
    [0.62, { ...STAND, lift: 0.45, spine: [50, 0, 0], chest: [10, 0, 0], head: [-30, 0, 0] }],
    [0.8, { ...STAND, lift: -0.14, spine: [20, 0, 0], head: [10, 0, 0] }],
    [1, STAND],
  ]),
  hurt: makeClip('hurt', [[0, STAND], [0.07, { ...STAND, spine: [-12, 0, 6], head: [-20, 0, 15] }], [0.35, STAND]]),
  stagger: makeClip('stagger', [
    [0, STAND],
    [0.15, { ...STAND, spine: [-18, 0, -10], chest: [-8, 0, 0], head: [-30, 0, -20], lift: 0.05 }],
    [0.8, { ...STAND, spine: [-10, 0, 12], head: [-20, 0, 25] }],
    [1, STAND],
  ]),
  // topples backward like a plank
  die: makeClip('die', [
    [0, STAND],
    [0.3, { ...STAND, hips: [-25, 0, 0], head: [-10, 0, 0] }],
    [0.75, { ...STAND, hips: [-88, 0, 0], lift: -0.72, sway: [0, -0.2], head: [-10, 0, 20] }],
    [0.85, { ...STAND, hips: [-82, 0, 0], lift: -0.7, sway: [0, -0.2], head: [-10, 0, 20] }],
    [1.2, { ...STAND, hips: [-90, 0, 0], lift: -0.74, sway: [0, -0.2], head: [-10, 0, 24] }],
  ]),
};

/** A corpse bound in its burial shroud and straw rope; long hair hides all but one eye. */
export function buildHopper(): EnemyModel {
  const m = (MATS ??= makeMaterials());
  const rig = buildRig();
  const b = rig.bones;
  part(b.hips, cyl(0.22, 0.14, 0.97, 14), m.shroud, 0, -0.47, 0).scale.z = 0.85;
  part(b.spine, cyl(0.21, 0.2, 0.22, 14), m.shroud, 0, 0.08, 0).scale.z = 0.8;
  part(b.chest, cyl(0.12, 0.22, 0.3, 14), m.shroud, 0, 0.1, 0).scale.z = 0.8;
  for (const [bone, y, r] of [[b.hips, -0.1, 0.217], [b.hips, -0.42, 0.19], [b.hips, -0.75, 0.163], [b.spine, 0.1, 0.215], [b.chest, 0.06, 0.205]] as const) {
    const ring = part(bone, new THREE.TorusGeometry(r, 0.014, 5, 18), m.rope, 0, y, 0, Math.PI / 2);
    ring.scale.y = 0.85;
  }
  part(b.neck, cyl(0.04, 0.05, 0.12, 8), m.pale, 0, 0.05, 0);
  part(b.head, new THREE.SphereGeometry(0.095, 10, 8), m.pale, 0, 0.08, 0.005).scale.set(0.9, 1.08, 0.95);
  part(b.head, new THREE.SphereGeometry(0.014, 6, 4), m.redEye, 0.036, 0.085, 0.09);
  // hair: a crown, two front curtains (a gap over the left eye) and a long back fall
  part(b.head, new THREE.SphereGeometry(0.105, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.hair, 0, 0.1, 0);
  part(b.head, cyl(0.1, 0.13, 0.36, 10, true, 0.16, 0.8), m.hair, 0, -0.06, 0.005);
  part(b.head, cyl(0.1, 0.13, 0.38, 10, true, -0.9, 0.86), m.hair, 0, -0.07, 0.005);
  part(b.head, cyl(0.105, 0.17, 0.62, 12, true, 1.0, Math.PI * 2 - 2.0), m.hair, 0, -0.18, 0);
  const tri = new THREE.Shape();
  tri.moveTo(-0.035, 0);
  tri.lineTo(0.035, 0);
  tri.lineTo(0, 0.045);
  part(b.head, new THREE.ShapeGeometry(tri), m.paper, 0, 0.155, 0.098, -0.25);
  return new RiggedEnemy(rig.root, HOPPER_CLIPS);
}

// ------------------------------------------------------------------- wisp

/** A drifting ghost-fire with a hot core; it swells before it rushes. Animated in code. */
class Wisp implements EnemyModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly flames: THREE.Sprite[] = [];
  private readonly light = new THREE.PointLight(0x7ab0ff, 6, 7, 1.6);
  private readonly core: THREE.Mesh;
  private action: EnemyAction = 'idle';
  private t = 0;
  private clock = Math.random() * 10;

  constructor(tex: THREE.Texture, coreMat: THREE.Material) {
    this.root.add(this.body);
    this.body.position.y = 1.4;
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), coreMat);
    this.body.add(this.core, this.light);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: i === 0 ? 0xcfe4ff : 0x5a8cff }));
      this.flames.push(s);
      this.body.add(s);
    }
  }

  play(a: EnemyAction): void {
    this.action = a;
    this.t = 0;
  }

  update(dt: number): void {
    this.t += dt;
    this.clock += dt;
    const c = this.clock, t = this.t;
    let swell = 1, bright = 1, alpha = 1;
    if (this.action === 'attack') swell = t < 0.6 ? 1 + t * 0.9 : t < 1 ? 1.5 : 1.5 - (t - 1) * 2.5;
    else if (this.action === 'hurt') bright = t < 0.12 ? 3 : 1;
    else if (this.action === 'stagger') swell = 0.75 + 0.1 * Math.sin(t * 30);
    else if (this.action === 'die') alpha = Math.max(0, 1 - t / 0.9), swell = 1 + t * 1.5;
    swell = Math.max(0.6, swell);
    this.body.position.y = 1.4 + Math.sin(c * 2.1) * 0.12;
    this.flames.forEach((s, i) => {
      const f = 1 + 0.15 * Math.sin(c * (9 + i * 3) + i);
      const size = (i === 0 ? 0.45 : 0.8 - i * 0.08) * swell * f;
      s.scale.set(size, size * 1.35, 1);
      s.position.set(Math.sin(c * 3 + i * 2) * 0.05, 0.08 * i + 0.04 * Math.sin(c * 5 + i), 0);
      s.material.opacity = alpha * (i === 0 ? 1 : 0.55);
    });
    this.core.scale.setScalar(swell * alpha);
    this.light.intensity = 6 * bright * swell * alpha * (0.85 + 0.15 * Math.sin(c * 13));
  }

  /** A struck flame already flares (see `hurt` above). */
  flash(): void {}

  dispose(): void {
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    for (const s of this.flames) s.material.dispose();
    this.light.dispose();
  }
}

let WISP_TEX: THREE.Texture | null = null;

export function buildWisp(): EnemyModel {
  WISP_TEX ??= glowTexture(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(160,200,255,0.75)'], [0.6, 'rgba(60,110,255,0.25)'], [1, 'rgba(20,40,255,0)']]);
  return new Wisp(WISP_TEX, new THREE.MeshBasicMaterial({ color: 0xe8f2ff }));
}

// ------------------------------------------------------------------- crow

/** A great carrion crow with ember eyes. Flaps, hovers, folds its wings to dive. */
class Crow implements EnemyModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly wings: { inner: THREE.Object3D; outer: THREE.Object3D; side: number }[] = [];
  private readonly tail = new THREE.Object3D();
  private readonly head = new THREE.Object3D();
  private action: EnemyAction = 'idle';
  private t = 0;
  private phase = Math.random() * 6;
  /** Flight height of the body above `root` (metres). */
  altitude = 2;
  private readonly skin: Skin;

  constructor(m: NonNullable<typeof MATS>) {
    this.root.add(this.body);
    const torso = part(this.body, new THREE.SphereGeometry(0.16, 12, 8), m.feather);
    torso.scale.set(0.85, 0.8, 1.55);
    this.head.position.set(0, 0.06, 0.24);
    this.body.add(this.head);
    part(this.head, new THREE.SphereGeometry(0.085, 10, 8), m.feather);
    part(this.head, new THREE.ConeGeometry(0.035, 0.14, 6), m.beak, 0, -0.01, 0.12, Math.PI / 2);
    for (const s of [1, -1]) part(this.head, new THREE.SphereGeometry(0.014, 6, 4), m.redEye, s * 0.05, 0.025, 0.05);
    this.tail.position.set(0, 0.02, -0.22);
    this.body.add(this.tail);
    for (let i = 0; i < 5; i++) part(this.tail, new THREE.BoxGeometry(0.05, 0.006, 0.26), m.feather, (i - 2) * 0.035, 0, -0.12, 0, (i - 2) * 0.14, 0);
    for (const side of [1, -1]) {
      const inner = new THREE.Object3D();
      inner.position.set(side * 0.1, 0.05, 0.02);
      this.body.add(inner);
      part(inner, new THREE.BoxGeometry(0.3, 0.012, 0.22), m.feather, side * 0.15, 0, -0.02);
      const outer = new THREE.Object3D();
      outer.position.set(side * 0.3, 0, 0);
      inner.add(outer);
      for (let i = 0; i < 5; i++) part(outer, new THREE.BoxGeometry(0.3, 0.008, 0.05), m.feather, side * 0.15, 0, 0.06 - i * 0.045, 0, side * (0.1 + i * 0.12), 0);
      this.wings.push({ inner, outer, side });
    }
    this.skin = new Skin(this.root);
  }

  play(a: EnemyAction): void {
    this.action = a;
    this.t = 0;
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    let rate = 9, amp = 0.9, fold = 0, y = this.altitude, pitch = 0;
    switch (this.action) {
      case 'attack':
        // rise and beat hard (telegraph), fold and dive, then climb back
        if (t < 0.55) (rate = 15), (y += t * 0.8), (pitch = -0.2);
        else if (t < 1.07) (fold = 1), (y += 0.44 - ((t - 0.55) / 0.52) * 1.5), (pitch = 0.7);
        else (rate = 12), (y += -1.06 + Math.min(1, (t - 1.07) / 0.33) * 1.06), (pitch = -0.3);
        break;
      case 'hurt':
        pitch = Math.sin(t * 40) * 0.3 * Math.max(0, 1 - t / 0.35);
        break;
      case 'stagger':
        (rate = 4), (y -= Math.min(0.5, t)), (pitch = -0.5);
        break;
      case 'die':
        (amp = 0.3), (rate = 3), (y = Math.max(0.12, this.altitude - 4.9 * t * t)), (pitch = Math.min(1.4, t * 2));
        break;
      case 'move':
        rate = 10;
        break;
    }
    this.phase += dt * rate;
    const flap = Math.sin(this.phase);
    for (const w of this.wings) {
      w.inner.rotation.z = w.side * (flap * amp * (1 - fold) + fold * 0.15);
      w.inner.rotation.y = w.side * fold * 1.2;
      w.outer.rotation.z = w.side * (Math.sin(this.phase - 0.7) * 0.5 * amp * (1 - fold));
    }
    this.body.position.y = y + flap * 0.05 * (1 - fold);
    this.body.rotation.x = pitch;
    this.tail.rotation.x = -flap * 0.1;
    this.head.rotation.x = -pitch * 0.5;
    this.skin.update(this.action === 'die' ? burnAt(t) : 0);
  }

  flash(): void {
    this.skin.flash();
  }

  dispose(): void {
    this.skin.dispose();
  }
}

export function buildCrow(): EnemyModel {
  return new Crow((MATS ??= makeMaterials()));
}

export type EnemyKindCh1 = keyof typeof ENEMY_ATTACK;

export const BUILD_ENEMY: Record<EnemyKindCh1, () => EnemyModel> = {
  ghoul: buildGhoul,
  hopper: buildHopper,
  wisp: buildWisp,
  crow: buildCrow,
};

/** Rigged clips, exported for timing tests. */
export const ENEMY_CLIPS = { ghoul: GHOUL_CLIPS, hopper: HOPPER_CLIPS };
