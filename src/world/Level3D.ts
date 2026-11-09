import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Assets } from '../engine/Assets';
import { rng } from '../engine/ProcTex';
import { Dungeon, ThemeId } from './DungeonMap';
import { CELL, DIR_X, DIR_Y, WALL_H, cellKind, center, layout } from './Grid3D';

/** Surface textures and air of each labyrinth theme (chapter 1 ships the grotto set). */
export interface LevelTheme {
  wall: string;
  floor: string;
  ceil: string;
  fog: number;
  fogDensity: number;
  hemi: [number, number, number];
}

const GROTTO: LevelTheme = { wall: 'rock_wall_02', floor: 'rocky_trail', ceil: 'dark_rock', fog: 0x05070a, fogDensity: 0.055, hemi: [0x2a3a4a, 0x0c0906, 0.35] };
export const THEMES: Record<ThemeId, LevelTheme> = { grotto: GROTTO, mine: GROTTO, crypt: GROTTO, temple: GROTTO };

/** Smooth pseudo-noise from sines: deterministic, no tables. */
export const noise = (x: number, y: number, z: number) =>
  Math.sin(x * 1.3 + z * 0.7) * 0.5 + Math.sin(y * 1.9 - x * 0.6 + 1.7) * 0.3 + Math.sin(z * 2.7 + y * 1.1 + x * 2.1) * 0.2;

export type V3 = [number, number, number];

/** Accumulates subdivided, displaced quads into one geometry with world-scaled UVs. */
export class Surface {
  private pos: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  /**
   * A grid from `o` spanning `a` (u) and `b` (v), pushed along `n` by `disp`
   * (zero on the border so neighbouring quads meet). UVs are world metres / tile.
   */
  quad(o: V3, a: V3, b: V3, n: V3, nu: number, nv: number, tile: number, uvOf: (p: V3) => [number, number], disp: (p: V3) => number): void {
    const base = this.pos.length / 3;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv;
        const p: V3 = [o[0] + a[0] * u + b[0] * v, o[1] + a[1] * u + b[1] * v, o[2] + a[2] * u + b[2] * v];
        const k = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * disp(p);
        const [tu, tv] = uvOf(p);
        this.pos.push(p[0] + n[0] * k, p[1] + n[1] * k, p[2] + n[2] * k);
        this.uv.push(tu / tile, tv / tile);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const q = base + j * (nu + 1) + i;
        this.idx.push(q, q + nu + 1, q + 1, q + 1, q + nu + 1, q + nu + 2);
      }
    }
  }

  build(): THREE.BufferGeometry {
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g = mergeVertices(g, 1e-4);
    g.computeVertexNormals();
    return g;
  }
}

/** One wall face of open cell (x, y) on side `dir`, bulging into the cell. */
function wallQuad(s: Surface, x: number, y: number, dir: number, amp = 0.55): void {
  const x0 = x * CELL, z0 = y * CELL;
  // corners in counter-clockwise order seen from inside the cell, so the face points inward
  const [o, a, n]: [V3, V3, V3] =
    dir === 0 ? [[x0 + CELL, 0, z0], [-CELL, 0, 0], [0, 0, 1]]
      : dir === 1 ? [[x0 + CELL, 0, z0 + CELL], [0, 0, -CELL], [-1, 0, 0]]
        : dir === 2 ? [[x0, 0, z0 + CELL], [CELL, 0, 0], [0, 0, -1]]
          : [[x0, 0, z0], [0, 0, CELL], [1, 0, 0]];
  const along = dir === 0 || dir === 2 ? (p: V3): [number, number] => [p[0], p[1]] : (p: V3): [number, number] => [p[2], p[1]];
  s.quad(o, a, [0, WALL_H, 0], n, 5, 5, 3, along, (p) => amp * (0.35 + 0.65 * noise(p[0], p[1], p[2])));
}

export interface Lantern {
  pos: THREE.Vector3;
  color: number;
}

export interface Level {
  group: THREE.Group;
  /** Anchors for the pooled point lights. */
  lanterns: Lantern[];
  theme: LevelTheme;
}

/** Static rock: floor, vaulted ceiling and bulging walls of every open cell, plus scattered dressing. */
export async function buildLevel(d: Dungeon, theme: ThemeId, assets: Assets): Promise<Level> {
  const th = THEMES[theme];
  const [wallMat, floorMat, ceilMat] = await Promise.all([
    assets.material(th.wall, 1, { color: 0x9a948a }),
    assets.material(th.floor, 1, { color: 0x8a8478 }),
    assets.material(th.ceil, 1, { color: 0x6a6660 }),
  ]);
  const group = new THREE.Group();
  const { open, walls } = layout(d);
  const floor = new Surface(), ceil = new Surface(), wall = new Surface();
  for (const [x, y] of open) {
    const x0 = x * CELL, z0 = y * CELL;
    floor.quad([x0, 0, z0], [CELL, 0, 0], [0, 0, CELL], [0, 1, 0], 2, 2, 2, (p) => [p[0], p[2]], (p) => 0.06 * noise(p[0], 0, p[2]));
    ceil.quad([x0, WALL_H, z0], [0, 0, CELL], [CELL, 0, 0], [0, -1, 0], 3, 3, 3, (p) => [p[0], p[2]], (p) => 0.4 + 0.5 * noise(p[0], 3, p[2]));
  }
  for (const w of walls) wallQuad(wall, w.x, w.y, w.dir);
  for (const [s, m, recv] of [[floor, floorMat, true], [ceil, ceilMat, false], [wall, wallMat, true]] as const) {
    const mesh = new THREE.Mesh(s.build(), m);
    mesh.receiveShadow = recv;
    group.add(mesh);
  }

  // dressing: rocks at wall feet, roots on walls, glowing fungus; lanterns at some corners
  const r = rng(d.def.id.charCodeAt(1) * 101);
  const lanterns: Lantern[] = [];
  const [rockA, rockB, roots, lantern, timber] = await Promise.all([assets.model('rock_07'), assets.model('rock_09'), assets.model('root_cluster_01'), assets.model('wooden_lantern_01'), assets.model('timber_support')]);
  // the timbers have their own RNG, so the dressing above keeps its layout
  const rt = rng(d.def.id.charCodeAt(1) * 211 + 5);
  const fungus = new THREE.MeshBasicMaterial({ color: 0x5ad0b0 });
  const fungusGeo = new THREE.SphereGeometry(0.05, 6, 4);
  const busy = (x: number, y: number) => !'.@E'.includes(d.ch(x, y));
  for (const w of walls) {
    if (cellKind(w.ch) !== 'wall' || busy(w.x, w.y)) continue;
    const cx = center(w.x), cz = center(w.y);
    // a point on the wall, 1.6 m in from the face's centre toward the cell
    const at = (off: number, inset: number) => new THREE.Vector3(cx + DIR_X[w.dir] * (CELL / 2 - inset) + (w.dir % 2 === 0 ? off : 0), 0, cz + DIR_Y[w.dir] * (CELL / 2 - inset) + (w.dir % 2 === 1 ? off : 0));
    const yaw = Math.atan2(-DIR_X[w.dir], -DIR_Y[w.dir]);
    const roll = r();
    if (roll < 0.35) {
      const rock = (r() < 0.5 ? rockA : rockB).clone();
      rock.position.copy(at((r() - 0.5) * 2.4, 0.5));
      rock.rotation.y = r() * 6.28;
      rock.scale.setScalar(2.5 + r() * 3.5);
      group.add(rock);
    } else if (roll < 0.5) {
      const root = roots.clone();
      root.position.copy(at((r() - 0.5) * 1.6, 0.3)).setY(WALL_H - 0.8);
      root.rotation.set(Math.PI, yaw + (r() - 0.5), 0);
      root.scale.setScalar(0.55 + r() * 0.3);
      group.add(root);
    } else if (roll < 0.72) {
      const base = at((r() - 0.5) * 2.6, 0.15).setY(0.4 + r() * 2.4);
      for (let i = 0; i < 6 + r() * 8; i++) {
        const f = new THREE.Mesh(fungusGeo, fungus);
        f.position.set(base.x + (r() - 0.5) * 0.5, base.y + (r() - 0.5) * 0.4, base.z + (r() - 0.5) * 0.5);
        f.scale.setScalar(0.5 + r() * 1.2);
        group.add(f);
      }
    } else if (roll < 0.82) {
      const l = lantern.clone();
      const p = at((r() - 0.5) * 1.6, 0.45);
      l.position.copy(p);
      l.rotation.y = yaw;
      l.scale.setScalar(1.6);
      group.add(l);
      lanterns.push({ pos: p.clone().setY(0.8), color: 0xff9a4a });
    } else if (roll < 0.9) {
      const t = timber.clone();
      t.position.copy(at((rt() - 0.5) * 1.2, 0.5));
      t.rotation.y = yaw + (rt() - 0.5) * 0.12;
      t.scale.setScalar(0.95 + rt() * 0.2);
      group.add(t);
    }
  }
  return { group, lanterns, theme: th };
}

/** A false wall: the same rock face, standing where there is none (on side `dir` of open cell x, y). */
export function falseWall(x: number, y: number, dir: number, mat: THREE.Material): THREE.Mesh {
  const s = new Surface();
  wallQuad(s, x, y, dir, 0.3);
  return new THREE.Mesh(s.build(), mat);
}
