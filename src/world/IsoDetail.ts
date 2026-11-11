import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cyl } from '../actors/Build';
import type { Building } from '../data/levels/iso';
import { rng } from '../engine/ProcTex';
import type { QualityProfile } from '../engine/Quality';
import { patch } from '../engine/Shading';
import { IsoGrid, SUB, tileMid } from './IsoMap';
import { noise } from './Level3D';
import type { PropKit } from './Props';

/**
 * The finer dressing of the isometric areas on the web's quality profiles: cedars with
 * drooping boughs, grass, fallen leaves and pebbles, trims on the houses. Everything is
 * instanced and grouped in blocks of ground, so only what the camera (and the moon's
 * shadow) can see is drawn. Opt-in: buildIsoLevel without a profile makes none of it.
 */

/** Tiles along one side of a block of instances. */
const BLOCK = 8;
const blockOf = (x: number, y: number) => `${Math.floor(x / BLOCK)},${Math.floor(y / BLOCK)}`;

type Placed = { m: THREE.Matrix4; c?: THREE.Color };

/** One instanced mesh per block of ground from a list of placements by tile. */
function blocks(geo: THREE.BufferGeometry, mat: THREE.Material, placed: Map<string, Placed[]>, group: THREE.Group, cast: boolean, order = 0): void {
  for (const list of placed.values()) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      mesh.setMatrixAt(i, p.m);
      if (p.c) mesh.setColorAt(i, p.c);
    });
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.renderOrder = order;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}

const push = (map: Map<string, Placed[]>, x: number, y: number, p: Placed) => {
  const k = blockOf(x, y);
  let list = map.get(k);
  if (!list) map.set(k, (list = []));
  list.push(p);
};

/** A cedar's crown: tiers of boughs, each a cone whose rim is lobed and droops; darker toward the trunk. */
function cedarCrown(seed: number): THREE.BufferGeometry {
  const r = rng(seed), tiers = 6 + (seed % 2), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < tiers; i++) {
    const u = i / (tiers - 1);
    const rad = (1.62 - u * 1.3) * (0.88 + r() * 0.28), h = 1.7 - u * 0.6;
    const c = new THREE.ConeGeometry(rad, h, 9, 2, true);
    const p = c.attributes.position, col = new Float32Array(p.count * 3);
    const lobes = 3 + Math.floor(r() * 3), phase = r() * 6.28, droop = 0.28 + r() * 0.25;
    for (let v = 0; v < p.count; v++) {
      const y = p.getY(v), k = (h / 2 - y) / h, a = Math.atan2(p.getX(v), p.getZ(v));
      // lobes depend on the angle only, so the cone's seam stays closed
      const lobe = 1 + (0.2 * Math.sin(a * lobes + phase) + 0.08 * Math.sin(a * (lobes * 2 + 1) - phase)) * k;
      p.setXYZ(v, p.getX(v) * lobe, y - k * k * droop, p.getZ(v) * lobe);
      const shade = (0.5 + 0.75 * k) * (0.72 + 0.4 * u);
      col.set([shade, shade, shade], v * 3);
    }
    c.setAttribute('color', new THREE.BufferAttribute(col, 3));
    c.rotateY(r() * 6.28);
    c.translate((r() - 0.5) * 0.14, 2.5 + i * (5.6 / tiers) + h / 2 - 0.6, (r() - 0.5) * 0.14);
    parts.push(c);
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** Cedars on the given tiles, in three shapes, by blocks. `cut`: the see-through cut of IsoLevel. */
export function cedars(tiles: readonly [number, number][], r: () => number, bark: THREE.Material, cut: <T extends THREE.Material>(m: T) => T, group: THREE.Group): void {
  const crowns = [cedarCrown(11), cedarCrown(26), cedarCrown(43)];
  const trunkGeo = cyl(0.1, 0.24, 3.4, 7);
  trunkGeo.translate(0, 1.7, 0);
  const needles = cut(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true, vertexColors: true }));
  const trunkMat = cut(bark);
  const trunks = new Map<string, Placed[]>(), tops = crowns.map(() => new Map<string, Placed[]>());
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [x, y] of tiles) {
    const k = 0.78 + r() * 0.55;
    p.set(tileMid(x) + (r() - 0.5) * 0.9, 0, tileMid(y) + (r() - 0.5) * 0.9);
    q.setFromAxisAngle(up, r() * Math.PI * 2);
    s.set(k * (0.9 + r() * 0.2), k * (0.92 + r() * 0.22), k * (0.9 + r() * 0.2));
    const m = new THREE.Matrix4().compose(p, q, s);
    push(trunks, x, y, { m });
    // deep indigo-green, a few turned toward ochre
    const c = new THREE.Color().setHSL(0.25 + r() * 0.09, 0.3 + r() * 0.16, 0.07 + r() * 0.055);
    if (r() < 0.07) c.setHSL(0.11, 0.3, 0.1);
    push(tops[Math.floor(r() * crowns.length)], x, y, { m, c });
  }
  blocks(trunkGeo, trunkMat, trunks, group, true);
  crowns.forEach((g, i) => blocks(g, needles, tops[i], group, true));
}

let GRASS: THREE.CanvasTexture | null = null;
/** A tuft of grass: blades fanning from the root, ochre toward their tips. */
function grassTexture(): THREE.CanvasTexture {
  if (GRASS) return GRASS;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, r = rng(303);
  g.lineCap = 'round';
  for (let i = 0; i < 13; i++) {
    const lean = (i / 12 - 0.5) * 2, h = 30 + r() * 30, x0 = 32 + lean * 9;
    const grad = g.createLinearGradient(0, 64, 0, 64 - h);
    grad.addColorStop(0, '#4a5a30');
    grad.addColorStop(0.6, i % 3 ? '#7f8a48' : '#6c7c40');
    grad.addColorStop(1, i % 4 ? '#c2b060' : '#d8bc6a');
    g.strokeStyle = grad;
    g.lineWidth = 2.2 + r() * 1.6;
    g.beginPath();
    g.moveTo(x0, 64);
    g.quadraticCurveTo(x0 + lean * 6, 64 - h * 0.6, x0 + lean * (14 + r() * 12), 64 - h);
    g.stroke();
  }
  GRASS = new THREE.CanvasTexture(c);
  GRASS.colorSpace = THREE.SRGBColorSpace;
  return GRASS;
}

/**
 * Grass in meadows and thin patches (never on the paths), fallen leaves under the trees and
 * pebbles along the paths and the rock. Returns the wind's update and what to dispose.
 */
export function clutter(grid: IsoGrid, q: QualityProfile, group: THREE.Group): { update: (t: number) => void; dispose: () => void } {
  const r = rng(grid.w * 53 + grid.h * 7 + 1);
  const near = (x: number, y: number, set: string) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && set.includes(grid.ch(x + dx, y + dy))) return true;
    return false;
  };
  const grass = new Map<string, Placed[]>(), leaves = new Map<string, Placed[]>(), stones = new Map<string, Placed[]>();
  const q4 = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const mat = (x: number, y: number, z: number, yaw: number, sx: number, sy = sx, sz = sx, tilt = 0) =>
    new THREE.Matrix4().compose(v.set(x, y, z), q4.setFromEuler(e.set(tilt, yaw, tilt * 0.6)), s.set(sx, sy, sz));
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = grid.ch(x, y), cx = tileMid(x), cz = tileMid(y);
      const at = () => [cx + (r() - 0.5) * SUB, cz + (r() - 0.5) * SUB] as const;
      if (c === '.') {
        // meadows and bare ground come from one slow field, so the grass gathers in drifts
        const lush = Math.max(0, noise(x * 0.31, 1.7, y * 0.27) * 0.5 + 0.5 + (r() - 0.5) * 0.3);
        const n = Math.round(q.clutter * lush * lush * (near(x, y, ',=') ? 2 : 6));
        for (let i = 0; i < n; i++) {
          const [px, pz] = at(), k = 0.7 + r() * 0.7;
          push(grass, x, y, { m: mat(px, 0, pz, r() * 6.28, k, k * (0.75 + r() * 0.5), k), c: new THREE.Color().setHSL(0.15 + r() * 0.1, 0.2 + r() * 0.2, 0.7 + r() * 0.25) });
        }
        if (near(x, y, 'T')) {
          for (let i = 0, m = Math.round(q.clutter * (1 + r() * 4)); i < m; i++) {
            const [px, pz] = at();
            // vermilion and ochre: the print's warm accents on the dark ground
            const col = r() < 0.4 ? new THREE.Color().setHSL(0.02 + r() * 0.03, 0.75, 0.2 + r() * 0.1) : new THREE.Color().setHSL(0.09 + r() * 0.04, 0.6, 0.2 + r() * 0.12);
            push(leaves, x, y, { m: mat(px, 0.025 + r() * 0.01, pz, r() * 6.28, 0.7 + r() * 0.8), c: col });
          }
        }
      }
      if ((c === ',' && r() < 0.5) || (c === '.' && near(x, y, '#'))) {
        for (let i = 0, m = Math.round(q.clutter * (1 + r() * 3)); i < m; i++) {
          const [px, pz] = at(), k = 0.5 + r() * 1.3;
          const tone = 0.5 + r() * 0.35;
          push(stones, x, y, { m: mat(px, 0.02, pz, r() * 6.28, k, k * (0.45 + r() * 0.3), k * (0.7 + r() * 0.5), r() * 0.4), c: new THREE.Color(tone, tone * 0.97, tone * 0.92) });
        }
      }
    }
  }
  // two crossed cards with their normals turned up, so a tuft is lit like the ground it grows from
  const card = () => new THREE.PlaneGeometry(0.74, 0.46).translate(0, 0.23, 0);
  // each card twice, facing either way: a two-sided material would turn the back faces' normals down, into the dark
  const back = (g: THREE.BufferGeometry) => {
    const i = g.index!;
    for (let k = 0; k < i.count; k += 3) {
      const t = i.getX(k + 1);
      i.setX(k + 1, i.getX(k + 2));
      i.setX(k + 2, t);
    }
    return g;
  };
  const tuft = mergeGeometries([0, 1, 2].flatMap((k) => [card().rotateY((k * Math.PI) / 3), back(card().rotateY((k * Math.PI) / 3))]));
  const tn = tuft.attributes.normal;
  for (let i = 0; i < tn.count; i++) tn.setXYZ(i, 0, 1, 0);
  const uTime = { value: 0 };
  // grass writes no depth, so the ink pass draws no line round every blade; drawn after the solid things
  // (and tested against them), it still hides behind and stands before a body as it should
  const grassMat = patch(new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, roughness: 1, depthWrite: false }), 'sway', (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 root = instanceMatrix[3].xz;
        float gust = sin(uTime * 1.3 + root.x * 0.35 + root.y * 0.22) * 0.6 + sin(uTime * 2.9 + root.x * 1.1 - root.y * 0.7) * 0.4;
        transformed.x += gust * 0.09 * uv.y;
        transformed.z += gust * 0.05 * uv.y;
      #endif`,
    );
  });
  const leafGeo = new THREE.PlaneGeometry(0.2, 0.11).rotateX(-Math.PI / 2);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  const stoneGeo = new THREE.IcosahedronGeometry(0.1, 0);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.92, flatShading: true });
  blocks(tuft, grassMat, grass, group, false, 1);
  blocks(leafGeo, leafMat, leaves, group, false);
  blocks(stoneGeo, stoneMat, stones, group, false);
  return {
    update: (t) => (uTime.value = t),
    dispose: () => {
      for (const m of [grassMat, leafMat, stoneMat]) m.dispose();
    },
  };
}

/** Trims that give a house its joinery: a stone footing, ridge and eaves, lattice windows, a door frame and step. */
export function houseTrims(g: THREE.Group, b: Building, k: PropKit, w: number, d: number, wallH: number, part: (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number) => THREE.Mesh): void {
  const alongX = w >= d, span = alongX ? d : w, len = (alongX ? w : d) + 1.2;
  const thatched = b.kind === 'house' || b.kind === 'elder';
  const rise = thatched ? span * 0.55 : span * 0.38;
  // footing: the walls stand on a course of stone
  part(g, new THREE.BoxGeometry(w + 0.36, 0.3, d + 0.36), k.stone, 0, 0.15, 0).receiveShadow = true;
  // ridge beam with its end caps
  const ridgeY = wallH + rise + (thatched ? 0.42 : 0.2);
  const ridge = alongX ? new THREE.BoxGeometry(len + 0.2, 0.2, 0.28) : new THREE.BoxGeometry(0.28, 0.2, len + 0.2);
  part(g, ridge, k.darkWood, 0, ridgeY, 0);
  for (const s of [1, -1]) {
    const cap = alongX ? new THREE.BoxGeometry(0.16, 0.34, 0.4) : new THREE.BoxGeometry(0.4, 0.34, 0.16);
    part(g, cap, k.darkWood, alongX ? (s * (len + 0.2)) / 2 : 0, ridgeY + 0.05, alongX ? 0 : (s * (len + 0.2)) / 2);
    // eave boards under each slope's edge
    const eave = alongX ? new THREE.BoxGeometry(len, 0.12, 0.1) : new THREE.BoxGeometry(0.1, 0.12, len);
    part(g, eave, k.darkWood, alongX ? 0 : s * (span / 2 + 0.62), wallH - 0.18, alongX ? s * (span / 2 + 0.62) : 0);
  }
  // rafters' ends along the front
  const front = d / 2 + 0.05;
  for (let x = -w / 2 + 0.5; x <= w / 2 - 0.4; x += 0.9) part(g, new THREE.BoxGeometry(0.1, 0.1, 0.5), k.darkWood, x, wallH - 0.02, front + 0.2);
  // lattice over the lit windows
  if (w > 4) {
    for (const sx of [-1, 1]) {
      const wx = sx * w * 0.3;
      part(g, new THREE.BoxGeometry(1.06, 0.07, 0.07), k.darkWood, wx, 1.94, front + 0.02);
      part(g, new THREE.BoxGeometry(1.06, 0.07, 0.07), k.darkWood, wx, 1.26, front + 0.02);
      for (let i = -2; i <= 2; i++) part(g, new THREE.BoxGeometry(0.04, 0.64, 0.05), k.darkWood, wx + i * 0.2, 1.6, front + 0.03);
    }
  }
  // door posts, lintel and a stone step
  for (const s of [1, -1]) part(g, new THREE.BoxGeometry(0.14, 2.1, 0.14), k.darkWood, s * 0.74, 1.05, front + 0.03);
  part(g, new THREE.BoxGeometry(1.7, 0.16, 0.16), k.darkWood, 0, 2.12, front + 0.03);
  part(g, new THREE.BoxGeometry(1.9, 0.18, 0.7), k.stone, 0, 0.09, front + 0.4).receiveShadow = true;
}
