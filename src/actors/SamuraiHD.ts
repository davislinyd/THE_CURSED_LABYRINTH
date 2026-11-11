import * as THREE from 'three';
import type { Assets } from '../engine/Assets';
import { lamellarTextures, noiseTexture, weaveTexture } from '../engine/ProcTex';
import { rimLight } from '../engine/Shading';
import { swordGrip } from './Build';
import { BONES, buildRig } from './Rig';
import { SamuraiModel, buildSamurai } from './Samurai';

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
  const grip = swordGrip(rig.bones.handR);
  const weapon = src.getObjectByName('part_weapon');
  if (weapon) grip.add(weapon);
  // the trail and the hit flashes read the blade from here: the same place as the procedural blade's mesh
  const blade = new THREE.Object3D();
  blade.position.z = 0.43;
  grip.add(blade);
  return { rig, blade, mats: m };
}
