import * as THREE from 'three';
import type { Assets } from '../engine/Assets';
import { lamellarTextures, noiseTexture, weaveTexture } from '../engine/ProcTex';
import { rimLight } from '../engine/Shading';
import { swordGrip } from './Build';
import { BONES, Rig, buildRig } from './Rig';
import { SamuraiModel, buildSamurai } from './Samurai';
import { DangleSpec, Secondary } from './Secondary';

/** Material slots of scripts/blender/web_hero.py. */
const SLOTS = ['lacquer', 'laced', 'lacedDark', 'gold', 'mask', 'cloth', 'sash', 'leather', 'straw', 'steel', 'edge', 'shadow'] as const;
type Slot = (typeof SLOTS)[number];

let MATS: Record<Slot, THREE.MeshStandardMaterial> | null = null;

/**
 * The armour's PBR materials, built once and shared by every copy of the model (never
 * disposed with a scene). Scenes are lit dimly and their sky reflection is faint, so
 * metal and lacquer take a stronger share of it to keep their sheen.
 */
function materials(): Record<Slot, THREE.MeshStandardMaterial> {
  const red = lamellarTextures('#16110e', '#cf2a1c');
  const dark = lamellarTextures('#131013', '#3a4c8c', 5, 10);
  // lames broad enough to read from the camera's distance
  for (const t of [red.map, red.bump, dark.map, dark.bump]) t.repeat.set(0.6, 0.6);
  const weave = weaveTexture();
  weave.repeat.set(14, 14);
  const hide = noiseTexture(91, '#404040', '#c0c0c0', 128, 16);
  hide.colorSpace = THREE.NoColorSpace;
  hide.repeat.set(3, 3);
  const lac = (color: number, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.16, envMapIntensity: 1.8, ...extra });
  const cloth = (color: number, sheen: number) =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.94, bumpMap: weave, bumpScale: 0.6, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(sheen), side: THREE.DoubleSide });
  const m: Record<Slot, THREE.MeshStandardMaterial> = {
    lacquer: lac(0x15110f),
    laced: lac(0xffffff, { map: red.map, bumpMap: red.bump, bumpScale: 2.2, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, side: THREE.DoubleSide }),
    lacedDark: lac(0xffffff, { map: dark.map, bumpMap: dark.bump, bumpScale: 2.2, roughness: 0.48, clearcoat: 0.45, clearcoatRoughness: 0.35, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd2a856, roughness: 0.3, metalness: 1, envMapIntensity: 4.5 }),
    mask: lac(0x6a1510, { roughness: 0.3 }),
    cloth: cloth(0x1d2540, 0x5a6aa8),
    sash: cloth(0x7a1614, 0xc05040),
    leather: new THREE.MeshStandardMaterial({ color: 0x2c1f16, roughness: 0.72, bumpMap: hide, bumpScale: 0.8 }),
    straw: new THREE.MeshStandardMaterial({ color: 0x57492f, roughness: 0.95, bumpMap: weave, bumpScale: 1 }),
    // a faint light of its own: polished steel never goes black in a dark hollow
    steel: new THREE.MeshStandardMaterial({ color: 0xdfe4ec, roughness: 0.16, metalness: 1, envMapIntensity: 5, emissive: 0x8a98b4, emissiveIntensity: 0.22 }),
    edge: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 1, envMapIntensity: 5, emissive: 0x6080ff, emissiveIntensity: 0 }),
    shadow: new THREE.MeshStandardMaterial({ color: 0x0a0807, roughness: 1 }),
  };
  for (const s of SLOTS) rimLight(m[s]);
  return m;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _d = new THREE.Vector3();
/** Bearings (degrees from the front, toward the left) of the skirt's seven tassets, as in web_hero.py. */
const KUSAZURI = [27, -27, 80, -80, 131, -131, 180];

/**
 * How each hanging part of the armour swings (parts named sub_<name>__<joint> in the model).
 * Tassets are pushed out by the thigh under them, shoulder guards lift with the arm part
 * of the way, so plates ride on the body instead of passing through it.
 */
function dangles(rig: Rig): Record<string, DangleSpec> {
  const b = rig.bones;
  const spec: Record<string, DangleSpec> = {
    shikoro: { length: 0.15, stiffness: 520, damping: 34, drag: 0.4, gravity: 0, limit: 0.13, kick: 0.45 },
    saya: { length: 0.55, stiffness: 420, damping: 30, drag: 0.3, gravity: 2, limit: 0.24, kick: 0.35, axis: new THREE.Vector3(0.014, -0.235, -0.57) },
    sash: { length: 0.22, stiffness: 64, damping: 5, drag: 2.2, gravity: 8, limit: 1 },
    tassel: { length: 0.16, stiffness: 72, damping: 5, drag: 2, gravity: 8, limit: 1 },
  };
  for (const [s, arm] of [['L', b.armL], ['R', b.armR]] as const) {
    // hangs from the shoulder, lifted by the arm less than half of the arm's own swing
    spec[`sode${s}`] = { length: 0.26, stiffness: 230, damping: 15, drag: 1, gravity: 4, limit: 0.7, rest: (out) => out.copy(DOWN).lerp(_d.copy(DOWN).applyQuaternion(arm.quaternion), 0.45) };
  }
  KUSAZURI.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180, out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const thighs = deg === 180 ? [b.thighL, b.thighR] : [deg > 0 ? b.thighL : b.thighR];
    spec[`kusazuri${i}`] = {
      length: 0.2, stiffness: 175, damping: 11, drag: 1.6, gravity: 6, limit: 1.05,
      rest: (v) => {
        // how far the thigh under this plate leans its way
        let push = 0;
        for (const t of thighs) push = Math.max(push, _d.copy(DOWN).applyQuaternion(t.quaternion).dot(out) - 0.04);
        return v.copy(DOWN).addScaledVector(out, push * 1.3);
      },
    };
  });
  return spec;
}

/**
 * The hero as modelled in Blender (scripts/blender/web_hero.py): armour plates, cloth and
 * the katana as rigid parts on the same joints as the procedural figure, so the clips,
 * the action timings and the sword's reach are untouched. Falls back to the procedural
 * figure if the model cannot be loaded.
 */
export async function buildSamuraiHD(assets: Assets): Promise<SamuraiModel> {
  let src: THREE.Group;
  try {
    src = await assets.model('web_samurai');
  } catch (e) {
    console.warn('HD samurai unavailable, using the procedural figure', e);
    return buildSamurai();
  }
  const m = (MATS ??= materials());
  const rig = buildRig();
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = m[(mesh.material as THREE.Material).name as Slot] ?? m.lacquer;
    mesh.castShadow = true;
  });
  // every part's vertices are in its joint's space already
  for (const bone of BONES) {
    const part = src.getObjectByName(`part_${bone}`);
    if (part) rig.bones[bone].add(part);
  }
  // hanging parts keep the pivot the model gives them, under the joint they are named after
  const secondary = new Secondary(), specs = dangles(rig);
  for (const sub of src.children.filter((o) => o.name.startsWith('sub_'))) {
    const [name, bone] = sub.name.slice(4).split('__');
    const joint = rig.bones[bone as (typeof BONES)[number]];
    if (!joint) continue;
    // the pivot is a joint of its own (never a mesh), so it is blended between ticks like the others
    const pivot = new THREE.Group();
    pivot.name = sub.name;
    pivot.position.copy(sub.position);
    sub.position.set(0, 0, 0);
    sub.name = '';
    pivot.add(sub);
    joint.add(pivot);
    if (specs[name]) secondary.add(pivot, specs[name]);
  }
  const grip = swordGrip(rig.bones.handR);
  const weapon = src.getObjectByName('part_weapon');
  if (weapon) grip.add(weapon);
  // the trail and the hit flashes read the blade from here: the same place as the procedural blade's mesh
  const blade = new THREE.Object3D();
  blade.position.z = 0.43;
  grip.add(blade);
  return { rig, blade, mats: m, secondary };
}
