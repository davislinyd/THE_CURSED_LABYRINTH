import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cyl, part } from '../actors/Build';
import type { Building } from '../data/levels/iso';
import type { Assets } from '../engine/Assets';
import { cloudTexture, rng } from '../engine/ProcTex';
import { IsoGrid, SUB, tileMid } from './IsoMap';
import { Lantern, Surface, V3, noise } from './Level3D';
import { loadRuins, PropKit, waving } from './Props';

export type IsoTheme = 'field' | 'village' | 'forest';

interface ThemeDef {
  ground: string;
  path: string;
  rock: string;
  hemi: [number, number, number];
  moon: [number, number];
}

const THEMES: Record<IsoTheme, ThemeDef> = {
  field: { ground: 'sparse_grass', path: 'rocky_trail', rock: 'mossy_rock', hemi: [0x3a4a66, 0x100c08, 0.5], moon: [0xa8bcff, 0.8] },
  village: { ground: 'sparse_grass', path: 'mossy_cobblestone', rock: 'mossy_rock', hemi: [0x4a5a7a, 0x18120c, 0.9], moon: [0xa8bcff, 0.8] },
  forest: { ground: 'forest_ground_04', path: 'rocky_trail', rock: 'rocky_terrain_02', hemi: [0x2c3c48, 0x0a0806, 0.45], moon: [0x8aa0d8, 0.7] },
};

/**
 * See-through cut: fragments between the camera and the hero are dithered away,
 * so trees, cliffs and roofs never hide the fight. Shared by all cut materials.
 */
export const CUT = {
  uHero: { value: new THREE.Vector3() },
  uBack: { value: new THREE.Vector3(0, 1, 0) },
  uR: { value: 2.6 },
};

function cutaway<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CUT);
    sh.vertexShader = 'varying vec3 vCutPos;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 cutP = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        cutP = instanceMatrix * cutP;
      #endif
      vCutPos = (modelMatrix * cutP).xyz;`,
    );
    sh.fragmentShader = 'uniform vec3 uHero; uniform vec3 uBack; uniform float uR; varying vec3 vCutPos;\n' + sh.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      vec3 cv = vCutPos - uHero;
      float along = dot(cv, uBack);
      if (along > 0.8 && vCutPos.y > 0.35) {
        float keep = smoothstep(uR * 0.5, uR, length(cv - uBack * along));
        float dither = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
        if (keep < dither) discard;
      }`,
    );
  };
  m.customProgramCacheKey = () => 'cutaway';
  return m;
}

export interface IsoLevel {
  group: THREE.Group;
  lanterns: Lantern[];
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  /** Mist walls of the spirit barriers, by letter. */
  mists: Map<string, THREE.Object3D[]>;
  /** Breakable jars by tile "x,y". */
  jars: Map<string, THREE.Object3D>;
  update(time: number): void;
  /** Frees the textures and shadow map made for this level. */
  dispose(): void;
}

const key = (x: number, y: number) => `${x},${y}`;
const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Everything static of an isometric area: ground, rock, trees, water, buildings and landmarks. */
export async function buildIsoLevel(grid: IsoGrid, theme: IsoTheme, assets: Assets, kit: PropKit, buildings: Building[] = []): Promise<IsoLevel> {
  const th = THEMES[theme];
  const group = new THREE.Group();
  const lanterns: Lantern[] = [];
  const mists = new Map<string, THREE.Object3D[]>();
  const mistTex: THREE.Texture[] = [];
  const jars = new Map<string, THREE.Object3D>();
  const r = rng(grid.w * 31 + grid.h);
  const W = grid.w * SUB, D = grid.h * SUB;
  const animated: ((t: number) => void)[] = [];

  const [groundSet, pathSet, rock, plaster, thatch, tiles, vase, fern, stump, barrel, crate, bucket, rocks] = await Promise.all([
    assets.textures(th.ground),
    assets.textures(th.path),
    assets.material(th.rock, 1, { color: 0x8a8a8a }),
    assets.material('worn_mossy_plasterwall', 2, { color: 0xb8b0a0 }),
    assets.material('thatch_roof_angled', 3, { color: 0x9a8a70 }),
    assets.material('grey_roof_tiles', 3, { color: 0x6a6e78 }),
    assets.model('ceramic_vase_01'),
    assets.model('fern_02'),
    assets.model('tree_stump_01'),
    assets.model('barrel_03'),
    assets.model('wooden_crate_01'),
    assets.model('wooden_bucket_01'),
    Promise.all([assets.model('rock_07'), assets.model('rock_09'), assets.model('moon_rock_01')]),
  ]);

  // ------------------------------------------------------------ ground
  // one plane; a mask texture blends the path texture in and darkens under trees
  const mask = new Uint8Array(grid.w * grid.h * 4);
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = grid.ch(x, y), i = (y * grid.w + x) * 4;
      mask[i] = ',=GX'.includes(c) || (theme === 'village' && 'HWNL'.includes(c)) ? 255 : 0;
      mask[i + 1] = c === 'T' || c === '#' || c === '+' ? 200 : c === '~' ? 255 : 0;
      mask[i + 3] = 255;
    }
  }
  const maskTex = new THREE.DataTexture(mask, grid.w, grid.h);
  maskTex.magFilter = maskTex.minFilter = THREE.LinearFilter;
  maskTex.needsUpdate = true;
  const groundGeo = new THREE.PlaneGeometry(W, D, Math.min(grid.w, 128), Math.min(grid.h, 128));
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(W / 2, 0, D / 2);
  const gp = groundGeo.attributes.position, guv = groundGeo.attributes.uv;
  for (let i = 0; i < gp.count; i++) guv.setXY(i, gp.getX(i) / 4, gp.getZ(i) / 4);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundSet.map, normalMap: groundSet.normalMap, roughnessMap: groundSet.armMap, aoMap: groundSet.armMap });
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: maskTex };
    sh.uniforms.uPath = { value: pathSet.map };
    sh.uniforms.uSize = { value: new THREE.Vector2(W, D) };
    sh.vertexShader = 'varying vec2 vGround;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D uMask; uniform sampler2D uPath; uniform vec2 uSize; varying vec2 vGround;\n' + sh.fragmentShader.replace(
      '#include <map_fragment>',
      `vec4 gm = texture2D(uMask, vGround / uSize);
      vec4 g0 = texture2D(map, vMapUv);
      vec4 g1 = texture2D(uPath, vMapUv * 0.75);
      float pk = smoothstep(0.38, 0.62, gm.r + (g0.g - 0.25) * 0.6);
      vec4 sampledDiffuseColor = mix(g0, g1, pk);
      sampledDiffuseColor.rgb *= mix(1.0, 0.45, gm.g);
      diffuseColor *= sampledDiffuseColor;`,
    );
  };
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // ------------------------------------------------------------ rock: blocks rising toward the inside of each massif
  const depth = new Map<string, number>();
  const isRock = (x: number, y: number) => grid.ch(x, y) === '#';
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (isRock(x, y)) depth.set(key(x, y), DIRS.every(([dx, dy]) => isRock(x + dx, y + dy) || x + dx < 0 || y + dy < 0 || x + dx >= grid.w || y + dy >= grid.h) ? 9 : 1);
  for (let pass = 2; pass <= 4; pass++) {
    for (const [k, v] of depth) {
      if (v !== 9) continue;
      const [x, y] = k.split(',').map(Number);
      if (DIRS.some(([dx, dy]) => depth.get(key(x + dx, y + dy)) === pass - 1)) depth.set(k, pass);
    }
  }
  const rockH = (x: number, y: number) => {
    const dp = depth.get(key(x, y));
    if (dp === undefined) return 0;
    return 1.4 + Math.min(dp, 5) * 1.1 + (noise(x * 1.7, y * 1.3, 0.5) + 1) * 0.5;
  };
  const surf = new Surface();
  const amp = (p: V3) => 0.35 * (0.4 + 0.6 * noise(p[0], p[1], p[2]));
  for (const k of depth.keys()) {
    const [x, y] = k.split(',').map(Number);
    const h = rockH(x, y), x0 = x * SUB, z0 = y * SUB;
    surf.quad([x0, h, z0 + SUB], [SUB, 0, 0], [0, 0, -SUB], [0, 1, 0], 2, 2, 3, (p) => [p[0], p[2]], (p) => amp(p) * 0.8);
    DIRS.forEach(([dx, dy], dir) => {
      const hn = rockH(x + dx, y + dy);
      if (hn >= h) return;
      // the face of this block seen from the lower neighbour
      const [o, a, n]: [V3, V3, V3] =
        dir === 0 ? [[x0, hn, z0], [SUB, 0, 0], [0, 0, -1]]
          : dir === 1 ? [[x0 + SUB, hn, z0], [0, 0, SUB], [1, 0, 0]]
            : dir === 2 ? [[x0 + SUB, hn, z0 + SUB], [-SUB, 0, 0], [0, 0, 1]]
              : [[x0, hn, z0 + SUB], [0, 0, -SUB], [-1, 0, 0]];
      const along = dir === 0 || dir === 2 ? (p: V3): [number, number] => [p[0], p[1]] : (p: V3): [number, number] => [p[2], p[1]];
      surf.quad(o, a, [0, h - hn, 0], n, 2, Math.max(1, Math.round(h - hn)), 3, along, amp);
    });
  }
  if (depth.size) {
    const m = new THREE.Mesh(surf.build(), cutaway(rock));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // ------------------------------------------------------------ trees: instanced cedars
  const treeTiles: [number, number][] = [];
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (grid.ch(x, y) === 'T') treeTiles.push([x, y]);
  if (treeTiles.length) {
    const cones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const c = new THREE.ConeGeometry(1.5 - i * 0.28, 2.6 - i * 0.25, 7);
      c.translate(0, 2.4 + i * 1.35, 0);
      cones.push(c);
    }
    const canopyGeo = mergeGeometries(cones);
    const trunkGeo = cyl(0.11, 0.22, 3, 6);
    trunkGeo.translate(0, 1.5, 0);
    const bark = await assets.material('japanese_cedar_bark', 1, { color: 0x6a5a4a });
    const needles = cutaway(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }));
    const trunks = new THREE.InstancedMesh(trunkGeo, cutaway(bark), treeTiles.length);
    const crowns = new THREE.InstancedMesh(canopyGeo, needles, treeTiles.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    treeTiles.forEach(([x, y], i) => {
      const k = 0.8 + r() * 0.5;
      p.set(tileMid(x) + (r() - 0.5) * 0.9, 0, tileMid(y) + (r() - 0.5) * 0.9);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      s.set(k * (0.9 + r() * 0.2), k, k * (0.9 + r() * 0.2));
      m4.compose(p, q, s);
      trunks.setMatrixAt(i, m4);
      crowns.setMatrixAt(i, m4);
      col.setHSL(0.3 + r() * 0.08, 0.3 + r() * 0.15, 0.06 + r() * 0.05);
      crowns.setColorAt(i, col);
    });
    for (const m of [trunks, crowns]) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }

  // ------------------------------------------------------------ water and bridges
  const waterGeo: THREE.BufferGeometry[] = [], deckGeo: THREE.BufferGeometry[] = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = grid.ch(x, y);
      if (c === '~' || c === '=' || c === 'b') {
        const q = new THREE.PlaneGeometry(SUB, SUB);
        q.rotateX(-Math.PI / 2);
        q.translate(tileMid(x), 0.05, tileMid(y));
        waterGeo.push(q);
      }
      if (c === '=' || c === 'b') {
        const deck = new THREE.BoxGeometry(SUB, 0.16, SUB * 0.98);
        deck.translate(tileMid(x), 0.22, tileMid(y));
        deckGeo.push(deck);
        DIRS.forEach(([dx, dy]) => {
          if (grid.ch(x + dx, y + dy) !== '~') return;
          const rail = new THREE.BoxGeometry(dx ? 0.12 : SUB, 0.12, dx ? SUB : 0.12);
          rail.translate(tileMid(x) + dx * (SUB / 2 - 0.1), 0.95, tileMid(y) + dy * (SUB / 2 - 0.1));
          deckGeo.push(rail);
          const post = new THREE.BoxGeometry(0.16, 0.9, 0.16);
          post.translate(tileMid(x) + dx * (SUB / 2 - 0.1), 0.5, tileMid(y) + dy * (SUB / 2 - 0.1));
          deckGeo.push(post);
        });
      }
    }
  }
  if (waterGeo.length) {
    const nor = pathSet.normalMap.clone();
    nor.repeat.set(0.4, 0.4);
    const water = new THREE.Mesh(mergeGeometries(waterGeo), new THREE.MeshStandardMaterial({ color: 0x0a1820, roughness: 0.12, metalness: 0.2, normalMap: nor, normalScale: new THREE.Vector2(0.6, 0.6) }));
    water.receiveShadow = true;
    group.add(water);
    animated.push((t) => nor.offset.set(t * 0.02, t * 0.013));
  }
  if (deckGeo.length) {
    const deck = new THREE.Mesh(mergeGeometries(deckGeo.map((g) => g.toNonIndexed())), kit.wood);
    deck.castShadow = deck.receiveShadow = true;
    group.add(deck);
  }

  // ------------------------------------------------------------ fences, graves, lilies
  const fenceGeo: THREE.BufferGeometry[] = [];
  const graves: THREE.Matrix4[] = [], planks: THREE.Matrix4[] = [], lilies: THREE.Matrix4[] = [];
  const m4 = () => new THREE.Matrix4();
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = grid.ch(x, y), cx = tileMid(x), cz = tileMid(y);
      if (c === 'f') {
        const post = new THREE.BoxGeometry(0.14, 1.3, 0.14);
        post.translate(cx, 0.65, cz);
        fenceGeo.push(post);
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          if (grid.ch(x + dx, y + dy) !== 'f') continue;
          for (const hy of [0.45, 1.0]) {
            const rail = new THREE.BoxGeometry(dx ? SUB : 0.07, 0.08, dx ? 0.07 : SUB);
            rail.translate(cx + dx * SUB / 2, hy, cz + dy * SUB / 2);
            fenceGeo.push(rail);
          }
        }
      } else if (c === '+') {
        const e = new THREE.Euler((r() - 0.5) * 0.15, r() * Math.PI * 2, (r() - 0.5) * 0.15);
        graves.push(m4().compose(new THREE.Vector3(cx + (r() - 0.5) * 0.8, 0.4, cz + (r() - 0.5) * 0.8), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 0.8 + r() * 0.5, 1)));
        if (r() < 0.5) planks.push(m4().compose(new THREE.Vector3(cx + (r() - 0.5) * 1.4, 0.65, cz + (r() - 0.5) * 1.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 3, (r() - 0.5) * 0.3)), new THREE.Vector3(1, 1, 1)));
      } else if (c === 'r') {
        for (let i = 0; i < 6; i++) {
          const k = 0.45 + r() * 0.35;
          lilies.push(m4().compose(new THREE.Vector3(cx + (r() - 0.5) * 1.8, k * 0.5, cz + (r() - 0.5) * 1.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 3, 0)), new THREE.Vector3(k, k, k)));
        }
      }
    }
  }
  if (fenceGeo.length) {
    const f = new THREE.Mesh(mergeGeometries(fenceGeo.map((g) => g.toNonIndexed())), kit.darkWood);
    f.castShadow = true;
    group.add(f);
  }
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], shadow = true) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((x, i) => m.setMatrixAt(i, x));
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
  };
  instanced(new THREE.BoxGeometry(0.42, 0.8, 0.2), kit.stone, graves);
  instanced(new THREE.BoxGeometry(0.11, 1.3, 0.025), kit.wood, planks);
  const lilyGeo = mergeGeometries([new THREE.PlaneGeometry(1, 1), new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2)]);
  instanced(lilyGeo, new THREE.MeshStandardMaterial({ map: lilyTexture(), alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x5a0606, roughness: 0.8 }), lilies, false);

  // ------------------------------------------------------------ small props on tiles
  const place = (o: THREE.Object3D, x: number, z: number, yaw = 0, s = 1) => {
    o.position.set(x, 0, z);
    o.rotation.y = yaw;
    o.scale.setScalar(s);
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
    });
    group.add(o);
    return o;
  };
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = grid.ch(x, y), cx = tileMid(x), cz = tileMid(y);
      if (c === 'L') {
        place(stoneLantern(kit), cx, cz, r() * 6);
        lanterns.push({ pos: new THREE.Vector3(cx, 1.5, cz), color: 0xffa860 });
      } else if (c === 'J') {
        jars.set(key(x, y), place(vase.clone(), cx, cz, r() * 6, 2.2));
      } else if (c === 'W') {
        place(well(kit, bucket.clone()), cx, cz);
      } else if ('VvS1234'.includes(c)) {
        // landmarks face the road that reaches them
        const [fx, fz] = DIRS.find(([dx, dy]) => grid.ch(x + dx, y + dy) === ',') ?? [0, 1];
        const yaw = Math.atan2(fx, fz), lx = cx + fx * 1.3, lz = cz + fz * 1.3;
        if (c === 'S') {
          place(shrine(kit, tiles), cx, cz, yaw);
          lanterns.push({ pos: new THREE.Vector3(lx, 1.6, lz), color: 0xffd090 });
        } else if (c === 'V' || c === 'v') {
          place(villageGate(kit, tiles), cx, cz, yaw);
          lanterns.push({ pos: new THREE.Vector3(lx, 2.2, lz), color: 0xffa860 });
        } else {
          place(torii(kit), cx, cz, yaw);
          lanterns.push({ pos: new THREE.Vector3(lx, 2.4, lz), color: 0xff4a30 });
        }
      } else if ('abc'.includes(c)) {
        const m = mist(cx, cz);
        mistTex.push(m.material.map!);
        group.add(m);
        mists.set(c, [...(mists.get(c) ?? []), m]);
        animated.push((t) => (m.material.map!.offset.x = (t * 0.05 + x * 0.1) % 1));
      } else if (c === '.' && theme === 'forest' && r() < 0.05) {
        place((r() < 0.6 ? fern : stump).clone(), cx + (r() - 0.5), cz + (r() - 0.5), r() * 6, 1 + r() * 0.6);
      } else if (c === '.' && theme === 'field' && r() < 0.012) {
        place(rocks[Math.floor(r() * 3)].clone(), cx, cz, r() * 6, 0.6 + r() * 0.6);
      }
    }
  }
  for (const m of grid.markers) {
    if (m.ch === 'G') {
      // against the cliff face along the top of the goal tile
      place(caveMouth(kit), tileMid(m.x), m.y * SUB);
      lanterns.push({ pos: new THREE.Vector3(tileMid(m.x), 2.4, tileMid(m.y)), color: 0xff4a30 });
    } else if (m.ch === 'X') place(signpost(kit), tileMid(m.x) + 1.4, tileMid(m.y) - 0.6, 0.4);
  }

  // ------------------------------------------------------------ weathered ruins (own RNG, so the layout above stays put)
  const ruins = await loadRuins(assets);
  const rw = rng(grid.w * 17 + grid.h * 5 + 3);
  const winds: ReturnType<typeof waving>[] = [];
  const beside = (x: number, y: number, c: string) => DIRS.some(([dx, dy]) => grid.ch(x + dx, y + dy) === c);
  const ruin = (o: THREE.Object3D, x: number, z: number, s: number) => {
    place(o, x + (rw() - 0.5) * SUB * 0.6, z + (rw() - 0.5) * SUB * 0.6, rw() * 6.3, s * (0.85 + rw() * 0.3));
    if (o.getObjectByName('cloth')) {
      const w = waving(o, rw() * 6);
      winds.push(w);
      animated.push(w.update);
    }
  };
  const remnants = [ruins.katana_stuck, ruins.spear_stuck, ruins.arrows_stuck, ruins.banner_torn, ruins.sotoba];
  const open5 = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (grid.ch(x + dx, y + dy) !== '.') return false;
    return true;
  };
  const gates: [number, number][] = [];
  const clearings: [number, number][] = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = grid.ch(x, y), cx = tileMid(x), cz = tileMid(y);
      if (c === '.') {
        if (open5(x, y)) clearings.push([x, y]);
        if (theme === 'field' && beside(x, y, ',') && rw() < 0.05) ruin(remnants[Math.floor(rw() * 5)].clone(), cx, cz, 1.6);
        else if (theme === 'forest' && rw() < 0.04) ruin(remnants[Math.floor(rw() * 5)].clone(), cx, cz, 1.6);
        else if (theme === 'village' && !beside(x, y, ',') && rw() < 0.015) ruin(ruins.fence_broken.clone(), cx, cz, 1.7);
      } else if (c === '+' && rw() < 0.45) ruin(ruins.sotoba.clone(), cx + 0.9, cz + 0.5, 1.5);
      else if (c === 'V' || c === 'v') gates.push([x, y]);
      else if (c === 'W') place(ruins.jizo.clone(), cx + 2.4, cz + 1.4, 0.5, 1.7);
    }
  }
  for (const [x, y] of gates) {
    // a jizo beside each village gate, off the road
    const [fx, fz] = DIRS.find(([dx, dy]) => grid.ch(x + dx, y + dy) === ',') ?? [0, 1];
    place(ruins.jizo.clone(), tileMid(x) + fx * 1.3 + fz * 2.6, tileMid(y) + fz * 1.3 - fx * 2.6, Math.atan2(fx, fz), 1.7);
  }
  if (theme !== 'village' && clearings.length) {
    const [x, y] = clearings[Math.floor(rw() * clearings.length)];
    place(ruins.torii_fallen.clone(), tileMid(x), tileMid(y), rw() * 6.3, 1.3);
  }

  // ------------------------------------------------------------ buildings
  for (const b of buildings) {
    const g = house(b, kit, plaster, b.kind === 'house' || b.kind === 'elder' ? thatch : tiles);
    place(g, (b.x + b.w / 2) * SUB, (b.y + b.h / 2) * SUB);
    lanterns.push({ pos: new THREE.Vector3((b.x + b.w / 2) * SUB, 2.1, (b.y + b.h) * SUB + 0.6), color: b.kind === 'smithy' ? 0xff6a20 : 0xffa860 });
    if (b.kind === 'shop') {
      place(barrel.clone(), (b.x + 0.6) * SUB, (b.y + b.h) * SUB + 0.6, 0, 1.1);
      place(crate.clone(), (b.x + b.w - 0.6) * SUB, (b.y + b.h) * SUB + 0.7, 0.4, 1.4);
    }
  }

  // ------------------------------------------------------------ light
  const hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]);
  const moon = new THREE.DirectionalLight(th.moon[0], th.moon[1]);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = sc.bottom = -18;
  sc.right = sc.top = 18;
  sc.near = 1;
  sc.far = 80;
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.04;
  group.add(hemi, moon, moon.target);

  const dispose = () => {
    maskTex.dispose();
    mistTex.forEach((t) => t.dispose());
    winds.forEach((w) => w.dispose());
    moon.dispose();
  };
  return { group, lanterns, hemi, moon, mists, jars, update: (t) => animated.forEach((f) => f(t)), dispose };
}

// ------------------------------------------------------------------ pieces

/** A red spider lily: a ring of thin curled petals on a bare stem. */
let LILY: THREE.CanvasTexture | null = null;
function lilyTexture(): THREE.CanvasTexture {
  if (LILY) return LILY;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#2f4a22';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 128);
  g.lineTo(64, 56);
  g.stroke();
  g.strokeStyle = '#d8141a';
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.lineWidth = i % 2 ? 2 : 4;
    g.beginPath();
    g.moveTo(64, 46);
    g.quadraticCurveTo(64 + Math.cos(a) * 30, 46 + Math.sin(a) * 18 - 14, 64 + Math.cos(a) * 40, 46 + Math.sin(a) * 26 - 4);
    g.stroke();
  }
  LILY = new THREE.CanvasTexture(c);
  LILY.colorSpace = THREE.SRGBColorSpace;
  return LILY;
}

function stoneLantern(k: PropKit): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(0.3, 0.36, 0.2, 6), k.stone, 0, 0.1);
  part(g, cyl(0.1, 0.13, 0.75, 6), k.stone, 0, 0.55);
  part(g, cyl(0.26, 0.22, 0.12, 6), k.stone, 0, 0.98);
  const fire = new THREE.MeshStandardMaterial({ color: 0x1a1008, emissive: 0xffa040, emissiveIntensity: 2.2 });
  part(g, new THREE.BoxGeometry(0.3, 0.3, 0.3), fire, 0, 1.2);
  part(g, new THREE.ConeGeometry(0.42, 0.3, 6), k.stone, 0, 1.5);
  part(g, new THREE.SphereGeometry(0.07, 6, 4), k.stone, 0, 1.68);
  return g;
}

function well(k: PropKit, bucket: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(0.85, 0.9, 0.8, 12, true), k.stone, 0, 0.4);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x050a0e, roughness: 0.1 }));
  water.position.y = 0.5;
  g.add(water);
  for (const s of [1, -1]) part(g, new THREE.BoxGeometry(0.12, 2, 0.12), k.darkWood, s * 0.9, 1);
  part(g, new THREE.BoxGeometry(2.2, 0.1, 0.14), k.darkWood, 0, 1.95);
  part(g, new THREE.BoxGeometry(2.4, 0.06, 0.8), k.darkWood, 0, 2.15, 0.25, 0.35, 0, 0);
  part(g, new THREE.BoxGeometry(2.4, 0.06, 0.8), k.darkWood, 0, 2.15, -0.25, -0.35, 0, 0);
  bucket.position.set(0.5, 0.8, 0.3);
  bucket.scale.setScalar(1.3);
  g.add(bucket);
  return g;
}

function torii(k: PropKit): THREE.Group {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0x9a1a10, roughness: 0.45 });
  for (const s of [1, -1]) {
    part(g, cyl(0.13, 0.15, 3.2, 10), red, s * 1.1, 1.6);
    part(g, cyl(0.2, 0.2, 0.3, 10), k.darkWood, s * 1.1, 0.15);
  }
  part(g, new THREE.BoxGeometry(2.8, 0.16, 0.18), red, 0, 2.55);
  part(g, new THREE.BoxGeometry(3.4, 0.2, 0.3), k.darkWood, 0, 3.25);
  part(g, new THREE.BoxGeometry(3.1, 0.14, 0.26), red, 0, 3.08);
  part(g, new THREE.BoxGeometry(0.16, 0.5, 0.1), k.darkWood, 0, 2.82);
  return g;
}

function villageGate(k: PropKit, roof: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  for (const s of [1, -1]) part(g, new THREE.BoxGeometry(0.22, 2.8, 0.22), k.darkWood, s * 1.1, 1.4);
  part(g, new THREE.BoxGeometry(2.6, 0.18, 0.24), k.darkWood, 0, 2.5);
  part(g, new THREE.BoxGeometry(2.9, 0.08, 0.8), roof, 0, 3.0, 0.22, 0.4, 0, 0);
  part(g, new THREE.BoxGeometry(2.9, 0.08, 0.8), roof, 0, 3.0, -0.22, -0.4, 0, 0);
  part(g, new THREE.BoxGeometry(0.7, 0.4, 0.05), k.wood, 0, 2.15, 0.13);
  return g;
}

function shrine(k: PropKit, roof: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(1.3, 0.4, 1.1), k.stone, 0, 0.2);
  part(g, new THREE.BoxGeometry(0.8, 0.75, 0.7), k.wood, 0, 0.78);
  part(g, new THREE.BoxGeometry(1.2, 0.06, 0.62), roof, 0, 1.33, 0.18, 0.55, 0, 0);
  part(g, new THREE.BoxGeometry(1.2, 0.06, 0.62), roof, 0, 1.33, -0.18, -0.55, 0, 0);
  const glow = new THREE.MeshStandardMaterial({ color: 0x201008, emissive: 0xffc070, emissiveIntensity: 1.5 });
  part(g, new THREE.BoxGeometry(0.4, 0.4, 0.02), glow, 0, 0.8, 0.36);
  for (const s of [1, -1]) {
    const l = stoneLantern(k);
    l.position.set(s * 1.2, 0, 0.9);
    l.scale.setScalar(0.7);
    g.add(l);
  }
  return g;
}

/** The grotto mouth: a black hollow in the cliff behind a vermilion gate. */
function caveMouth(k: PropKit): THREE.Group {
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hole.position.set(0, 0, 0.45);
  hole.scale.set(1, 1.5, 1);
  g.add(hole);
  const breath = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: k.glow, color: 0x6a1008, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  breath.position.set(0, 1.2, 0.5);
  g.add(breath);
  const t = torii(k);
  t.scale.setScalar(0.9);
  t.position.z = 1.4;
  g.add(t);
  return g;
}

function signpost(k: PropKit): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.12, 1.6, 0.12), k.darkWood, 0, 0.8);
  part(g, new THREE.BoxGeometry(0.9, 0.24, 0.05), k.wood, 0.3, 1.35, 0, 0, 0, -0.08);
  return g;
}

/** A shimmering wall of ghost mist filling one barrier tile. */
function mist(x: number, z: number): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const tex = cloudTexture(Math.floor(x * 7 + z), 256, 96);
  tex.wrapS = THREE.RepeatWrapping;
  const geo = mergeGeometries([new THREE.PlaneGeometry(SUB, 3.4), new THREE.PlaneGeometry(SUB, 3.4).rotateY(Math.PI / 2)]);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: 0x9ab8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(x, 1.7, z);
  return m;
}

/** A village building: plaster and timber under a gabled roof, its door on the south side. */
function house(b: Building, k: PropKit, plaster: THREE.Material, roofMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const w = b.w * SUB - 0.6, d = b.h * SUB - 0.6;
  const wallH = b.kind === 'inn' ? 3.4 : b.kind === 'kura' ? 3.2 : 2.6;
  const walls = cutaway((b.kind === 'smithy' ? k.darkWood : plaster).clone());
  part(g, new THREE.BoxGeometry(w, wallH, d), walls, 0, wallH / 2);
  // timber frame: corner posts, sill and head beams
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, new THREE.BoxGeometry(0.22, wallH, 0.22), k.darkWood, sx * w / 2, wallH / 2, sz * d / 2);
  for (const y of [0.15, wallH - 0.1]) {
    part(g, new THREE.BoxGeometry(w + 0.1, 0.16, 0.12), k.darkWood, 0, y, d / 2 + 0.02);
    part(g, new THREE.BoxGeometry(w + 0.1, 0.16, 0.12), k.darkWood, 0, y, -d / 2 - 0.02);
  }
  if (b.kind === 'kura') part(g, new THREE.BoxGeometry(w + 0.04, 0.9, d + 0.04), k.darkWood, 0, 0.45);
  // door: a dark opening, with a cloth curtain at the inn and the shop
  part(g, new THREE.BoxGeometry(1.3, 2, 0.05), new THREE.MeshStandardMaterial({ color: 0x0c0806, roughness: 1 }), 0, 1, d / 2 + 0.03);
  if (b.kind === 'inn' || b.kind === 'shop') {
    const cloth = new THREE.MeshStandardMaterial({ color: b.kind === 'inn' ? 0x6a1a14 : 0x1c2a52, roughness: 0.9, side: THREE.DoubleSide });
    part(g, new THREE.BoxGeometry(1.5, 0.7, 0.02), cloth, 0, 1.75, d / 2 + 0.12);
  }
  // windows: warm lattice glow
  const lit = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, emissive: 0xff9a40, emissiveIntensity: 0.9 });
  for (const sx of [-1, 1]) if (w > 4) part(g, new THREE.BoxGeometry(0.9, 0.6, 0.04), lit, sx * w * 0.3, 1.6, d / 2 + 0.04);
  // gabled roof along the longer side
  const alongX = w >= d, span = alongX ? d : w, len = (alongX ? w : d) + 1.2;
  const rise = b.kind === 'house' || b.kind === 'elder' ? span * 0.55 : span * 0.38;
  const thick = b.kind === 'house' || b.kind === 'elder' ? 0.4 : 0.16;
  // each slab hangs from the ridge, reaching `half` metres out (eaves included)
  const half = span / 2 + 0.7, slope = Math.atan2(rise, span / 2), slab = half / Math.cos(slope);
  const cy = wallH + rise + thick / 2 - (half / 2) * Math.tan(slope);
  const roof = cutaway(roofMat.clone());
  for (const s of [1, -1]) {
    const geo = alongX ? new THREE.BoxGeometry(len, thick, slab) : new THREE.BoxGeometry(slab, thick, len);
    const m = new THREE.Mesh(geo, roof);
    if (alongX) {
      m.position.set(0, cy, (s * half) / 2);
      m.rotation.x = s * slope;
    } else {
      m.position.set((s * half) / 2, cy, 0);
      m.rotation.z = -s * slope;
    }
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  // gable ends
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-span / 2, 0, 0, span / 2, 0, 0, 0, rise, 0], 3));
  tri.computeVertexNormals();
  const endMat = cutaway((b.kind === 'smithy' ? k.darkWood : plaster).clone());
  endMat.side = THREE.DoubleSide;
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(tri, endMat);
    if (alongX) {
      m.position.set(s * w / 2, wallH, 0);
      m.rotation.y = Math.PI / 2;
    } else m.position.set(0, wallH, s * d / 2);
    g.add(m);
  }
  return g;
}
