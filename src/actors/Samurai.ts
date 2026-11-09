import * as THREE from 'three';
import { lamellarTextures } from '../engine/ProcTex';
import { cyl, part, swordGrip } from './Build';
import { BoneName, Pose, Rig, buildRig, makeClip, makeLoop, mirror } from './Rig';

/** Shared materials (built once). */
let MATS: ReturnType<typeof makeMaterials> | null = null;

function makeMaterials() {
  const red = lamellarTextures('#17120f', '#8e1b1b');
  const dark = lamellarTextures('#141012', '#2a2f4a', 5, 10);
  return {
    laced: new THREE.MeshStandardMaterial({ map: red.map, bumpMap: red.bump, bumpScale: 1.5, roughness: 0.38, metalness: 0.15, side: THREE.DoubleSide }),
    lacedDark: new THREE.MeshStandardMaterial({ map: dark.map, bumpMap: dark.bump, bumpScale: 1.5, roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide }),
    lacquer: new THREE.MeshStandardMaterial({ color: 0x15110f, roughness: 0.42, metalness: 0.15 }),
    mask: new THREE.MeshStandardMaterial({ color: 0x5c1410, roughness: 0.35, metalness: 0.1 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc9a55c, roughness: 0.3, metalness: 1 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x1c2235, roughness: 0.92 }),
    sash: new THREE.MeshStandardMaterial({ color: 0x6e1414, roughness: 0.85 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x2a1e16, roughness: 0.8 }),
    straw: new THREE.MeshStandardMaterial({ color: 0x4a3f2a, roughness: 0.95 }),
    shadow: new THREE.MeshStandardMaterial({ color: 0x0a0807, roughness: 1 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.18, metalness: 1 }),
    edge: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 1, emissive: 0x6080ff, emissiveIntensity: 0 }),
  };
}

export type SamuraiMaterials = ReturnType<typeof makeMaterials>;

/** A katana along +Z of `parent`: the guard sits just ahead of the origin, the hilt runs back. */
function katana(parent: THREE.Object3D, m: SamuraiMaterials): THREE.Mesh {
  part(parent, new THREE.BoxGeometry(0.032, 0.036, 0.26), m.leather, 0, 0, -0.07);
  part(parent, cyl(0.045, 0.045, 0.012, 16), m.gold, 0, 0, 0.065, Math.PI / 2);
  // a slightly curved blade: bend a thin box along its length (edge on -Y, curving toward the spine)
  const blade = new THREE.BoxGeometry(0.006, 0.03, 0.72, 1, 1, 12);
  const pos = blade.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getZ(i) + 0.36) / 0.72;
    pos.setY(i, pos.getY(i) + 0.05 * k * k);
  }
  blade.computeVertexNormals();
  const b = part(parent, blade, m.steel, 0, 0, 0.43);
  part(parent, blade.clone().scale(1.3, 0.2, 1).translate(0, -0.014, 0), m.edge, 0, 0, 0.43);
  return b;
}

export interface SamuraiModel {
  rig: Rig;
  blade: THREE.Mesh;
  mats: SamuraiMaterials;
}

/** The hero: lacquered armour in black and crimson, a lantern-flame crest, katana in hand. */
export function buildSamurai(): SamuraiModel {
  const m = (MATS ??= makeMaterials());
  const rig = buildRig();
  const b = rig.bones;
  const HALF = Math.PI;

  // head: helmet bowl, neck guard, crest, face mask
  const head = b.head;
  part(head, new THREE.SphereGeometry(0.095, 12, 10), m.shadow, 0, 0.08, 0.005);
  const bowl = part(head, new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.lacquer, 0, 0.1, 0);
  bowl.scale.set(1, 0.85, 1.08);
  part(head, cyl(0.15, 0.15, 0.02, 20), m.gold, 0, 0.1, 0);
  for (let i = 0; i < 3; i++) {
    const r = 0.145 + i * 0.022;
    part(head, cyl(r, r + 0.03, 0.05, 18, true, HALF * 0.3, HALF * 1.4), m.laced, 0, 0.07 - i * 0.042, -0.005);
  }
  const crest = new THREE.Shape();
  crest.moveTo(0, 0);
  crest.bezierCurveTo(0.06, 0.05, 0.03, 0.12, 0, 0.19);
  crest.bezierCurveTo(-0.03, 0.12, -0.06, 0.05, 0, 0);
  part(head, new THREE.ExtrudeGeometry(crest, { depth: 0.008, bevelEnabled: false }), m.gold, 0, 0.17, 0.12, -0.25);
  for (const s of [1, -1]) part(head, new THREE.BoxGeometry(0.012, 0.16, 0.008), m.gold, s * 0.055, 0.21, 0.12, -0.2, 0, -s * 0.45);
  part(head, cyl(0.1, 0.105, 0.085, 14, true, -HALF * 0.35, HALF * 0.7), m.mask, 0, 0.035, 0.005);
  part(head, cyl(0.11, 0.135, 0.06, 14, true, -HALF * 0.4, HALF * 0.8), m.laced, 0, -0.03, 0.005);
  b.neck.add(new THREE.Mesh(cyl(0.06, 0.07, 0.12), m.cloth));

  // torso: laced cuirass, sash, skirt plates
  const dou = part(b.chest, cyl(0.2, 0.165, 0.4, 16), m.laced, 0, 0.06, 0);
  dou.scale.z = 0.72;
  part(b.chest, cyl(0.205, 0.205, 0.035, 16), m.gold, 0, 0.255, 0).scale.z = 0.72;
  part(b.spine, cyl(0.165, 0.165, 0.08, 16), m.sash, 0, 0.02, 0).scale.z = 0.75;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const plate = part(b.hips, cyl(0.17, 0.25, 0.26, 6, true, a - 0.55, 1.1), m.laced, 0, -0.1, 0);
    plate.scale.z = 0.85;
  }
  // scabbard at the left hip
  part(b.hips, cyl(0.022, 0.018, 0.78, 8), m.lacquer, 0.2, -0.02, -0.12, 1.2, 0, 0.12);

  // arms: shoulder guards, sleeves, gauntlets, hands
  for (const s of ['L', 'R'] as const) {
    const side = s === 'L' ? 1 : -1;
    const arm = b[`arm${s}` as BoneName];
    const sode = part(arm, cyl(0.13, 0.15, 0.22, 8, true, side > 0 ? HALF * 0.25 : HALF * 1.25, HALF * 0.55), m.laced, -side * 0.06, -0.1, 0);
    sode.rotation.z = side * 0.12;
    part(arm, cyl(0.06, 0.05, 0.29), m.cloth, 0, -0.145, 0);
    const fore = b[`forearm${s}` as BoneName];
    part(fore, cyl(0.05, 0.04, 0.24, 10), m.lacedDark, 0, -0.12, 0);
    part(fore, cyl(0.052, 0.052, 0.02, 10), m.gold, 0, -0.01, 0);
    part(b[`hand${s}` as BoneName], new THREE.BoxGeometry(0.06, 0.09, 0.07), m.leather, 0, -0.045, 0.005);
    // legs: wide trousers, shin guards, sandals
    const thigh = b[`thigh${s}` as BoneName];
    part(thigh, cyl(0.1, 0.13, 0.46, 10), m.cloth, 0, -0.22, 0);
    part(thigh, cyl(0.135, 0.15, 0.2, 8, true, -HALF * 0.35, HALF * 0.7), m.lacedDark, 0, -0.16, 0.01);
    const shin = b[`shin${s}` as BoneName];
    part(shin, cyl(0.065, 0.055, 0.36, 10), m.lacquer, 0, -0.2, 0.005);
    part(shin, cyl(0.067, 0.067, 0.02, 10), m.gold, 0, -0.04, 0.005);
    part(b[`foot${s}` as BoneName], new THREE.BoxGeometry(0.09, 0.05, 0.22), m.straw, 0, -0.015, 0.05);
  }

  const blade = katana(swordGrip(b.handR), m);
  return { rig, blade, mats: m };
}

// ---------------------------------------------------------------- animation

type V = [number, number, number];
type Arms = Pick<Pose, 'armR' | 'forearmR' | 'handR' | 'armL' | 'forearmL' | 'handL'>;

/**
 * Arm angles per sword position. Two-handed ones were solved numerically so the
 * left hand lands on the pommel; the note gives the right hand target and blade
 * direction (world, character at the origin facing +Z) they were solved for.
 */
const ARMS = {
  /** hand (-0.1, 1.0, 0.42), blade forward-up (0.05, 0.5, 0.87) */
  kamae: { armR: [-43, 4, 18], forearmR: [-43, 0, 0], handR: [18, -18, 0], armL: [-39, -17, -12], forearmL: [-21, 0, 0] },
  kesaUp: { armR: [-104, 21, -14], forearmR: [-97, 0, 0], handR: [22, -44, 0], armL: [-113, -22, -18], forearmL: [-17, 0, 0] },
  kesaDown: { armR: [-66, -35, 39], forearmR: [0, 0, 0], handR: [45, -50, 0], armL: [-43, -25, -14], forearmL: [-42, 0, 0] },
  gyakuLow: { armR: [-54, -34, 38], forearmR: [0, 0, 0], handR: [49, -50, 0], armL: [-20, 0, 20], forearmL: [-40, 0, 0] },
  gyakuHigh: { armR: [-117, 78, -63], forearmR: [0, 0, 0], handR: [29, -49, 0], armL: [20, 0, 25], forearmL: [-30, 0, 0] },
  yokoBack: { armR: [-29, -36, 40], forearmR: [-93, 0, 0], handR: [-6, -50, 0], armL: [-70, -30, 0], forearmL: [-40, 0, 0] },
  yokoFront: { armR: [-46, 27, -68], forearmR: [-89, 0, 0], handR: [79, 1, 0], armL: [10, 0, 40], forearmL: [-20, 0, 0] },
  jodan: { armR: [-125, 38, -1], forearmR: [-47, 0, 0], handR: [11, -3, 0], armL: [-123, -13, -12], forearmL: [-15, 0, 0] },
  jodanDown: { armR: [-100, 68, -48], forearmR: [0, 0, 0], handR: [39, -49, 0], armL: [-51, -17, -12], forearmL: [-67, 0, 0] },
  guard: { armR: [-62, 44, -35], forearmR: [-93, 0, 0], handR: [-2, 50, 0], armL: [-100, -48, 1], forearmL: [-2, 0, 0] },
  issenStart: { armR: [-14, 46, -40], forearmR: [-98, 0, 0], handR: [17, 32, 0], armL: [-75, -37, -12], forearmL: [-5, 0, 0] },
  issenEnd: { armR: [-85, 22, -1], forearmR: [-49, 0, 0], handR: [80, 50, 0], armL: [-40, 30, 40], forearmL: [-30, 0, 0] },
  carry: { armR: [39, 80, -4], forearmR: [-52, 0, 0], handR: [80, -19, 0] },
  limp: { armR: [-10, 0, -10], forearmR: [-15, 0, 0], handR: [10, 0, 0], armL: [-5, 0, 10], forearmL: [-10, 0, 0] },
} satisfies Record<string, Arms>;

const LEGS = {
  kamae: { thighL: [-18, 0, 4], shinL: [24, 0, 0], footL: [-6, 0, 0], thighR: [12, 0, -5], shinR: [16, 0, 0], footR: [-28, 0, 0] },
  lunge: { thighL: [-45, 0, 4], shinL: [45, 0, 0], footL: [0, 0, 0], thighR: [25, 0, -6], shinR: [20, 0, 0], footR: [-20, 0, 0] },
} satisfies Record<string, Pose>;

/** Torso and head: lift, spine, chest, head (the neck follows the head a little). */
function body(lift: number, spine: V, chest: V, head: V, legs: Pose = LEGS.kamae): Pose {
  return { lift, spine, chest, neck: [head[0] / 2, head[1] / 2, 0], head: [head[0] / 2, head[1] / 2, head[2]], ...legs };
}

const KAMAE_BODY = body(-0.04, [8, 0, 0], [4, -12, 0], [-8, 12, 0]);
const KAMAE: Pose = { ...KAMAE_BODY, ...ARMS.kamae };
const recover = (chest: V): Pose => ({ ...KAMAE, chest });

const STRIDE: Pose = {
  lift: -0.02, spine: [14, -6, 0], chest: [4, 10, 0], neck: [-5, -2, 0], head: [-5, -2, 0],
  ...ARMS.carry, armL: [-35, 0, 12], forearmL: [-50, 0, 0],
  thighL: [-42, 0, 0], shinL: [20, 0, 0], footL: [10, 0, 0],
  thighR: [28, 0, 0], shinR: [40, 0, 0], footR: [-20, 0, 0],
};
const PASS: Pose = {
  lift: 0.03, spine: [12, 0, 0], chest: [4, 0, 0], neck: [-4, 0, 0], head: [-4, 0, 0],
  ...ARMS.carry, armL: [-10, 0, 10], forearmL: [-45, 0, 0],
  thighL: [-5, 0, 0], shinL: [10, 0, 0], footL: [0, 0, 0],
  thighR: [-20, 0, 0], shinR: [95, 0, 0], footR: [-10, 0, 0],
};
/** The legs and torso mirror on the other step; the sword arm keeps its carry, the free hand its angle. */
const otherStep = (p: Pose, armL: V): Pose => ({ ...mirror(p), ...ARMS.carry, armL, forearmL: p.forearmL, handL: p.handL });

const GUARD: Pose = { ...body(-0.08, [10, 0, 0], [4, -20, 0], [-10, 16, 0], { ...LEGS.kamae, thighL: [-22, 0, 8], thighR: [16, 0, -8] }), ...ARMS.guard };

export const SAMURAI_CLIPS = {
  idle: makeClip('idle', [
    [0, KAMAE],
    [1.1, { ...KAMAE, lift: -0.05, chest: [6, -12, 0] }],
    [2.2, KAMAE],
  ]),
  run: makeLoop('run', [
    [0, STRIDE],
    [0.17, PASS],
    [0.34, otherStep(STRIDE, [20, 0, 12])],
    [0.51, otherStep(PASS, [-10, 0, 10])],
    [0.68, STRIDE],
  ]),
  // three-step combo: diagonal down cut, rising reverse cut, horizontal sweep. Each coils
  // (easing out), whips through the active window, carries on with its weight (the body
  // turning on past the cut, arms as they were so both hands stay on the hilt) and settles.
  atk1: makeClip('atk1', [
    [0, KAMAE],
    [0.1, { ...body(-0.04, [2, -15, 0], [-4, -25, 0], [-4, 30, 0]), ...ARMS.kesaUp }, 'out'],
    [0.2, { ...body(-0.13, [16, 15, 0], [12, 20, 0], [-14, -24, 0], LEGS.lunge), ...ARMS.kesaDown }, 'whip'],
    [0.27, { ...body(-0.16, [19, 22, 0], [14, 30, 0], [-16, -30, 0], LEGS.lunge), ...ARMS.kesaDown }, 'out'],
    [0.45, recover([8, 10, 0]), 'inOut'],
  ]),
  atk2: makeClip('atk2', [
    [0, recover([8, 10, 0])],
    [0.08, { ...body(-0.1, [14, 15, 0], [12, 25, 0], [-14, -30, 0], LEGS.lunge), ...ARMS.gyakuLow }, 'out'],
    [0.2, { ...body(-0.03, [-2, -15, 0], [-6, -30, 0], [0, 36, 0]), ...ARMS.gyakuHigh }, 'whip'],
    [0.27, { ...body(-0.01, [-4, -22, 0], [-8, -38, 0], [2, 42, 0]), ...ARMS.gyakuHigh }, 'out'],
    [0.45, recover([2, -20, 0]), 'inOut'],
  ]),
  atk3: makeClip('atk3', [
    [0, recover([2, -20, 0])],
    [0.14, { ...body(-0.06, [4, -30, 0], [4, -40, 0], [-4, 60, 0]), ...ARMS.yokoBack }, 'out'],
    [0.28, { ...body(-0.12, [10, 30, 0], [6, 35, 0], [-8, -50, 0], LEGS.lunge), ...ARMS.yokoFront }, 'whip'],
    [0.37, { ...body(-0.15, [12, 40, 0], [8, 48, 0], [-10, -58, 0], LEGS.lunge), ...ARMS.yokoFront }, 'out'],
    [0.65, recover([6, 10, 0]), 'inOut'],
  ]),
  // heavy overhead cut: raise the sword, hold the charge a breath, then a lunging blow
  strong: makeClip('strong', [
    [0, KAMAE],
    [0.2, { ...body(0, [-6, 0, 0], [-8, -8, 0], [-6, 8, 0]), ...ARMS.jodan }, 'out'],
    [0.3, { ...body(0.01, [-9, 0, 0], [-10, -9, 0], [-8, 8, 0]), ...ARMS.jodan }, 'inOut'],
    [0.42, { ...body(-0.16, [24, 0, 0], [16, -5, 0], [-30, 5, 0], LEGS.lunge), ...ARMS.jodanDown }, 'whip'],
    [0.5, { ...body(-0.2, [30, 0, 0], [20, -5, 0], [-34, 5, 0], LEGS.lunge), ...ARMS.jodanDown }, 'out'],
    [0.9, KAMAE, 'inOut'],
  ]),
  guard: makeClip('guard', [
    [0, GUARD],
    [1, { ...GUARD, chest: [5, -20, 0] }],
  ]),
  guardHit: makeClip('guardHit', [
    [0, GUARD],
    [0.06, { ...GUARD, lift: -0.1, spine: [2, 0, 0], chest: [-6, -20, 0] }],
    [0.3, GUARD],
  ]),
  // a low dash (the game moves the body; the pose only crouches)
  dodge: makeClip('dodge', [
    [0, KAMAE],
    [0.12, { ...KAMAE, lift: -0.25, spine: [40, 0, 0], chest: [20, -10, 0], thighL: [-80, 0, 0], shinL: [100, 0, 0], thighR: [-40, 0, 0], shinR: [120, 0, 0], footR: [-30, 0, 0] }, 'out'],
    [0.3, { ...KAMAE, lift: -0.3, spine: [55, 0, 0], chest: [25, -10, 0], thighL: [-90, 0, 0], shinL: [120, 0, 0], thighR: [-90, 0, 0], shinR: [120, 0, 0] }, 'inOut'],
    [0.5, KAMAE, 'inOut'],
  ]),
  hurt: makeClip('hurt', [
    [0, KAMAE],
    [0.08, { ...KAMAE, lift: -0.02, spine: [-12, 0, 0], chest: [-10, -12, 0], head: [-20, 0, 0] }],
    [0.4, KAMAE],
  ]),
  die: makeClip('die', [
    [0, KAMAE],
    [0.4, { ...body(-0.45, [30, 0, 0], [6, 0, 0], [30, 0, 0], { thighL: [-80, 0, 0], shinL: [150, 0, 0], thighR: [-60, 0, 0], shinR: [150, 0, 0] }), ...ARMS.limp }],
    [1.2, { ...body(-0.7, [70, 0, 0], [10, 0, 0], [40, 0, 0], { thighL: [-90, 0, 0], shinL: [160, 0, 0], thighR: [-80, 0, 0], shinR: [160, 0, 0] }), ...ARMS.limp, armR: [-40, 0, -10], armL: [-40, 0, 10] }],
  ]),
  // one swift cut through a staggered foe
  counter: makeClip('counter', [
    [0, { ...body(-0.08, [8, 20, 0], [6, 30, 0], [-8, -44, 0]), ...ARMS.issenStart }],
    [0.08, { ...body(-0.15, [16, -30, 0], [8, -35, 0], [-14, 56, 0], LEGS.lunge), ...ARMS.issenEnd }, 'whip'],
    [0.18, { ...body(-0.18, [18, -40, 0], [10, -45, 0], [-16, 62, 0], LEGS.lunge), ...ARMS.issenEnd }, 'out'],
    [0.5, recover([6, -20, 0]), 'inOut'],
  ]),
  // throw a paper talisman with the left hand
  use: makeClip('use', [
    [0, KAMAE],
    [0.15, { ...KAMAE, chest: [-4, -30, 0], armL: [-150, 0, 40], forearmL: [-80, 0, 0], handL: [0, 0, 0] }],
    [0.28, { ...KAMAE, chest: [10, 20, 0], armL: [-85, 0, 5], forearmL: [-5, 0, 0], handL: [10, 0, 0] }],
    [0.6, KAMAE],
  ]),
};

export type SamuraiClip = keyof typeof SAMURAI_CLIPS;
