import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rotroot } from '../src/actors/Rotroot';
import { patch, rimBody, rimLight, surfaceDetail } from '../src/engine/Shading';

const shader = () => ({ uniforms: {}, vertexShader: '#include <project_vertex>\n#include <begin_vertex>', fragmentShader: '#define STANDARD\n#include <normal_fragment_maps>\n#include <opaque_fragment>' }) as unknown as THREE.WebGLProgramParametersWithUniforms;
const compile = (m: THREE.Material) => {
  const sh = shader();
  m.onBeforeCompile(sh, null as never);
  return sh;
};

describe('shader patches', () => {
  it('runs every addition in the order made', () => {
    const m = new THREE.MeshStandardMaterial(), order: string[] = [];
    patch(m, 'a', () => order.push('a'));
    patch(m, 'b', () => order.push('b'));
    compile(m);
    expect(order).toEqual(['a', 'b']);
  });

  it('gives materials with different additions different program keys', () => {
    const plain = new THREE.MeshStandardMaterial(), rim = rimLight(new THREE.MeshStandardMaterial());
    const both = surfaceDetail(rimLight(new THREE.MeshStandardMaterial()), { moss: 0.5 });
    // a material with shader code of its own and the default key (an enemy's skin copy)
    const own = new THREE.MeshStandardMaterial();
    own.onBeforeCompile = (sh) => void (sh.fragmentShader += '// own');
    rimLight(own);
    const keys = [plain, rim, both, own].map((m) => m.customProgramCacheKey());
    expect(new Set(keys).size).toBe(4);
    // and the same additions share one program
    expect(rimLight(new THREE.MeshStandardMaterial()).customProgramCacheKey()).toBe(rim.customProgramCacheKey());
  });

  it('keeps a key set by earlier code', () => {
    const m = new THREE.MeshStandardMaterial();
    m.customProgramCacheKey = () => 'cutaway';
    expect(surfaceDetail(m, { wet: 0.4 }).customProgramCacheKey()).toBe('cutaway|detail:w');
  });

  it('leaves preprocessor lines at the start of a line', () => {
    for (const m of [rimLight(new THREE.MeshStandardMaterial()), surfaceDetail(new THREE.MeshStandardMaterial(), { moss: 1, wet: 1 })]) {
      const sh = compile(m);
      for (const line of sh.fragmentShader.split('\n')) if (line.includes('#define') || line.includes('#include')) expect(line.trimStart().startsWith('#'), line).toBe(true);
    }
  });

  it('adds the rim once to each lit material of a body', () => {
    const root = new THREE.Group(), lit = new THREE.MeshStandardMaterial(), flat = new THREE.MeshBasicMaterial();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), lit), new THREE.Mesh(new THREE.BoxGeometry(), lit), new THREE.Mesh(new THREE.BoxGeometry(), flat));
    rimBody(root);
    rimBody(root);
    expect(lit.userData.patches).toEqual(['rim']);
    expect(flat.userData.patches).toBeUndefined();
  });
});

describe('rotroot body', () => {
  it('skins each root-arm over its nine joints and keeps the joints where the hit tests read them', () => {
    const b = new Rotroot(new THREE.MeshStandardMaterial());
    const skinned: THREE.SkinnedMesh[] = [];
    b.root.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && skinned.push(o as THREE.SkinnedMesh));
    expect(skinned.length).toBe(4);
    for (const s of skinned) {
      expect(s.skeleton.bones.length).toBe(9);
      const w = s.geometry.attributes.skinWeight;
      for (let i = 0; i < w.count; i++) expect(w.getX(i) + w.getY(i)).toBeCloseTo(1, 5);
    }
    b.root.updateMatrixWorld(true);
    // arm 0 at rest: its base on the trunk, its tip 9 x 0.42 m of chain away at most
    const base = b.armPoint(0, 0), tip = b.armPoint(0, 9);
    expect(Math.hypot(base.x, base.z)).toBeCloseTo(1, 1);
    expect(base.distanceTo(tip)).toBeLessThanOrEqual(9 * 0.42 + 1e-6);
    expect(base.distanceTo(tip)).toBeGreaterThan(2);
  });

  it('flares before a blow only while told to, and never changes the arms for it', () => {
    const a = new Rotroot(new THREE.MeshStandardMaterial()), b = new Rotroot(new THREE.MeshStandardMaterial());
    b.warn = 1;
    for (const r of [a, b]) {
      r.play('slam', 1);
      for (let i = 0; i < 50; i++) r.update(1 / 60);
      r.root.updateMatrixWorld(true);
    }
    expect(a.armPoint(1, 9).distanceTo(b.armPoint(1, 9))).toBeLessThan(1e-9);
  });
});
