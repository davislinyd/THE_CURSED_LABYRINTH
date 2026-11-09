import * as THREE from 'three';
import { part } from '../actors/Build';
import type { Assets } from '../engine/Assets';
import { glowTexture, rng } from '../engine/ProcTex';
import { WALL_H } from './Grid3D';

/** Shared materials and models for labyrinth fittings. */
export interface PropKit {
  wood: THREE.Material;
  darkWood: THREE.Material;
  stone: THREE.Material;
  iron: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  lacquer: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  chest: THREE.Group;
  glow: THREE.Texture;
}

/** The weathered props modelled in Blender (scripts/blender/props.py): origin at the base, weathering in vertex colours. */
export const RUINS = ['sotoba', 'jizo', 'torii_fallen', 'fence_broken', 'katana_stuck', 'spear_stuck', 'arrows_stuck', 'banner_torn'] as const;
export type RuinKit = Record<(typeof RUINS)[number], THREE.Group>;

export async function loadRuins(assets: Assets): Promise<RuinKit> {
  const models = await Promise.all(RUINS.map((id) => assets.model(id)));
  return Object.fromEntries(RUINS.map((id, i) => [id, models[i]])) as RuinKit;
}

/**
 * Makes a torn banner's cloth flutter in the wind (it hangs from the top, so the hem moves most).
 * Gives the cloth its own material; returns the per-frame update and what to dispose.
 */
export function waving(banner: THREE.Object3D, phase = 0): { update: (t: number) => void; dispose: () => void } {
  const cloth = banner.getObjectByName('cloth') as THREE.Mesh | undefined;
  if (!cloth) return { update: () => {}, dispose: () => {} };
  const mat = (cloth.material as THREE.MeshStandardMaterial).clone();
  mat.side = THREE.DoubleSide;
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float hang = clamp((2.4 - position.y) / 1.5, 0.0, 1.0);
      transformed.z += sin(uTime * 2.3 + position.y * 4.0 + position.x * 2.0) * 0.08 * hang;
      transformed.x += sin(uTime * 1.7 + position.y * 3.0) * 0.025 * hang;`,
    );
  };
  cloth.material = mat;
  return { update: (t) => (uTime.value = t + phase), dispose: () => mat.dispose() };
}

/** One glow sprite texture for every kit, so each new scene does not upload another. */
let GLOW: THREE.Texture | null = null;

export async function loadPropKit(assets: Assets): Promise<PropKit> {
  const [wood, darkWood, stone, chest] = await Promise.all([
    assets.material('japanese_cedar_planks', 1),
    assets.material('dark_wooden_planks', 1),
    assets.material('japanese_stone_wall', 1, { color: 0xa09a90 }),
    assets.model('treasure_chest'),
  ]);
  return {
    wood, darkWood, stone, chest,
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.55, metalness: 0.8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc9a55c, roughness: 0.35, metalness: 1 }),
    lacquer: new THREE.MeshStandardMaterial({ color: 0x4a0d0a, roughness: 0.35, metalness: 0.1 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 1 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.9, side: THREE.DoubleSide }),
    glow: (GLOW ??= glowTexture(64)),
  };
}

/** A red ward circle, drawn once. */
let SIGIL: THREE.CanvasTexture | null = null;
function sigil(): THREE.CanvasTexture {
  if (SIGIL) return SIGIL;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(128, 128, 110, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.arc(128, 128, 88, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2, b = ((i + 2) / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 88, 128 + Math.sin(a) * 88);
    g.lineTo(128 + Math.cos(b) * 88, 128 + Math.sin(b) * 88);
    g.stroke();
  }
  const r = rng(5);
  g.lineWidth = 5;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, x = 128 + Math.cos(a) * 99, y = 128 + Math.sin(a) * 99;
    g.beginPath();
    g.moveTo(x - 4, y - 4 + r() * 3);
    g.lineTo(x + 4, y + 3);
    g.stroke();
  }
  SIGIL = new THREE.CanvasTexture(c);
  SIGIL.colorSpace = THREE.SRGBColorSpace;
  return SIGIL;
}

const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

export interface Prop {
  readonly obj: THREE.Object3D;
  update(dt: number): void;
}

/** Posts, lintel and fill around a 3.2 x 3.4 m opening across a 4 m passage (local x across, z along). */
function frame(g: THREE.Object3D, mat: THREE.Material, top = 3.4): void {
  for (const s of [1, -1]) {
    part(g, new THREE.BoxGeometry(0.4, top, 0.5), mat, s * 1.8, top / 2, 0);
    part(g, new THREE.BoxGeometry(0.42, WALL_H, 0.3), mat, s * 1.79, WALL_H / 2, 0);
  }
  part(g, new THREE.BoxGeometry(4, 0.4, 0.55), mat, 0, top + 0.2, 0);
  part(g, new THREE.BoxGeometry(4, WALL_H - top - 0.4, 0.3), mat, 0, (WALL_H + top + 0.4) / 2, 0);
}

export type BarrierKind = 'door' | 'locked' | 'breakable' | 'seal' | 'gate';

/** Anything that closes a passage: doors, locked doors, rotten boards, seal stones, iron gates. */
export class Barrier implements Prop {
  readonly obj = new THREE.Group();
  private readonly moving: THREE.Object3D[] = [];
  private openK = 0;
  private target = 0;
  private shake = 0;
  private pieces: { m: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3 }[] = [];
  private lock: THREE.Object3D | null = null;
  private seal: THREE.MeshBasicMaterial | null = null;

  constructor(readonly kind: BarrierKind, k: PropKit, open: boolean) {
    const g = this.obj;
    frame(g, kind === 'seal' || kind === 'gate' ? k.stone : k.darkWood);
    if (kind === 'door' || kind === 'locked') {
      for (const s of [1, -1]) {
        const hinge = new THREE.Object3D();
        hinge.position.set(s * 1.6, 0, 0);
        g.add(hinge);
        part(hinge, new THREE.BoxGeometry(1.6, 3.4, 0.12), k.wood, -s * 0.8, 1.7, 0);
        for (const y of [0.5, 1.7, 2.9]) part(hinge, new THREE.BoxGeometry(1.62, 0.1, 0.16), k.iron, -s * 0.8, y, 0);
        this.moving.push(hinge);
      }
      if (kind === 'locked') {
        this.lock = new THREE.Group();
        part(this.lock, new THREE.BoxGeometry(0.3, 0.36, 0.2), k.iron, 0, 1.6, 0.14);
        part(this.lock, new THREE.TorusGeometry(0.11, 0.03, 6, 12, Math.PI), k.iron, 0, 1.8, 0.14);
        part(this.lock, new THREE.BoxGeometry(1.2, 0.08, 0.06), k.iron, 0, 1.5, 0.12);
        g.add(this.lock);
      }
    } else if (kind === 'breakable') {
      const r = rng(9);
      for (let i = 0; i < 6; i++) {
        const plank = part(g, new THREE.BoxGeometry(3.5, 0.32, 0.1), k.darkWood, (r() - 0.5) * 0.2, 0.35 + i * 0.55, 0, 0, 0, (r() - 0.5) * 0.25);
        this.moving.push(plank);
      }
    } else if (kind === 'seal') {
      const slab = new THREE.Group();
      part(slab, new THREE.BoxGeometry(3.2, 3.4, 0.4), k.stone, 0, 1.7, 0);
      this.seal = new THREE.MeshBasicMaterial({ map: sigil(), color: 0xff3020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      for (const s of [1, -1]) {
        const c = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), this.seal);
        c.position.set(0, 1.7, s * 0.21);
        c.rotation.y = s > 0 ? 0 : Math.PI;
        slab.add(c);
        part(slab, new THREE.PlaneGeometry(0.22, 0.6), k.paper, 0.9, 2.6, s * 0.215, 0, s > 0 ? 0 : Math.PI, 0.1);
      }
      g.add(slab);
      this.moving.push(slab);
    } else {
      const bars = new THREE.Group();
      for (let i = 0; i < 9; i++) part(bars, new THREE.CylinderGeometry(0.04, 0.04, 3.4, 6), k.iron, -1.5 + i * 0.375, 1.7, 0);
      for (const y of [0.6, 2.6]) part(bars, new THREE.BoxGeometry(3.3, 0.08, 0.08), k.iron, 0, y, 0);
      g.add(bars);
      this.moving.push(bars);
    }
    this.setOpen(open, true);
  }

  get isOpen(): boolean {
    return this.target === 1;
  }

  setOpen(open: boolean, instant = false): void {
    this.target = open ? 1 : 0;
    if (instant) {
      this.openK = this.target;
      if (this.kind === 'breakable' && open) for (const m of this.moving) m.visible = false;
      if (this.lock && open) this.lock.visible = false;
      this.pose();
    } else if (this.kind === 'breakable' && open) {
      this.pieces = this.moving.map((m, i) => ({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() < 0.5 ? -1 : 1) * (2 + i * 0.3)), w: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6) }));
    }
  }

  /** A blow that does not (yet) break it. */
  hit(): void {
    this.shake = 0.25;
  }

  private pose(): void {
    const k = ease(this.openK);
    if (this.kind === 'door' || this.kind === 'locked') this.moving.forEach((h, i) => (h.rotation.y = (i === 0 ? 1 : -1) * k * 1.9));
    else if (this.kind === 'seal') this.moving[0].position.y = -3.5 * k;
    else if (this.kind === 'gate') this.moving[0].position.y = 3.1 * k;
    if (this.seal) this.seal.opacity = 1 - k;
  }

  update(dt: number): void {
    const speed = this.kind === 'seal' ? 0.7 : this.kind === 'gate' ? 1.2 : 1.8;
    if (this.openK !== this.target) {
      this.openK += Math.sign(this.target - this.openK) * Math.min(Math.abs(this.target - this.openK), dt * speed);
      if (this.lock && this.target === 1) {
        this.lock.position.y = Math.max(-1.6, this.lock.position.y - dt * 6);
      }
      this.pose();
    }
    if (this.shake > 0) {
      this.shake -= dt;
      this.obj.children.forEach((c) => this.moving.includes(c) && (c.position.x = Math.sin(this.shake * 90) * 0.04));
    }
    for (const p of this.pieces) {
      if (p.m.position.y < 0.1 && p.v.y < 0) continue;
      p.v.y -= 9.8 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.w.x * dt;
      p.m.rotation.y += p.w.y * dt;
      p.m.rotation.z += p.w.z * dt;
      if (p.m.position.y < 0.1) {
        p.m.position.y = 0.1;
        p.v.set(0, 0, 0);
        p.m.rotation.set(0, p.m.rotation.y, 0);
      }
    }
    if (this.seal) this.seal.color.setRGB(1, 0.19 + 0.08 * Math.sin(performance.now() / 300), 0.12);
  }
}

/** A wall lever (local +z points out of the wall). */
export class Lever implements Prop {
  readonly obj = new THREE.Group();
  private readonly handle = new THREE.Object3D();
  private angle: number;

  constructor(k: PropKit, private down: boolean, alt: boolean) {
    part(this.obj, new THREE.BoxGeometry(0.5, 0.8, 0.1), k.iron, 0, 1.3, 0.05);
    this.handle.position.set(0, 1.3, 0.12);
    this.obj.add(this.handle);
    part(this.handle, new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), k.iron, 0, 0.3, 0);
    part(this.handle, new THREE.SphereGeometry(0.07, 8, 6), alt ? k.iron : k.gold, 0, 0.6, 0);
    this.angle = this.target();
    this.handle.rotation.x = this.angle;
  }

  private target(): number {
    return this.down ? Math.PI * 0.75 : Math.PI * 0.25;
  }

  set(down: boolean): void {
    this.down = down;
  }

  update(dt: number): void {
    this.angle += (this.target() - this.angle) * Math.min(1, dt * 10);
    this.handle.rotation.x = this.angle;
  }
}

/** A chest whose lid swings back. */
export class Chest implements Prop {
  readonly obj: THREE.Group;
  private readonly lid: THREE.Object3D | undefined;
  private k = 0;
  private opening = false;

  constructor(kit: PropKit, opened: boolean) {
    this.obj = kit.chest.clone();
    this.obj.scale.setScalar(1.3);
    this.obj.traverse((o) => (o.castShadow = true));
    this.lid = this.obj.getObjectByName('treasure_chest_lid');
    if (opened) this.open(true);
  }

  open(instant = false): void {
    this.opening = true;
    if (instant) this.k = 1;
  }

  update(dt: number): void {
    if (this.opening && this.k < 1) this.k = Math.min(1, this.k + dt * 1.5);
    if (this.lid) this.lid.rotation.x = -1.9 * ease(this.k);
  }
}

/** Floor spikes that thrust up on a fixed rhythm. */
export class Spikes implements Prop {
  static readonly PERIOD = 2.6;
  readonly obj = new THREE.Group();
  private readonly cones = new THREE.Group();
  private t: number;

  constructor(k: PropKit, phase: number) {
    part(this.obj, new THREE.BoxGeometry(3.4, 0.06, 3.4), k.iron, 0, 0.03, 0).receiveShadow = true;
    const geo = new THREE.ConeGeometry(0.07, 0.6, 6);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) part(this.cones, geo, k.iron, -1.4 + i * 0.56, 0.3, -1.4 + j * 0.56);
    this.obj.add(this.cones);
    this.t = phase;
  }

  /** True while the points are out. */
  get up(): boolean {
    const p = this.t % Spikes.PERIOD;
    return p > 0.15 && p < 0.95;
  }

  update(dt: number): void {
    this.t += dt;
    const p = this.t % Spikes.PERIOD;
    const h = p < 0.15 ? p / 0.15 : p < 0.95 ? 1 : p < 1.4 ? 1 - (p - 0.95) / 0.45 : 0;
    this.cones.position.y = -0.62 + h * 0.62;
  }
}

/** A circle of light that throws you elsewhere. */
export class Warp implements Prop {
  readonly obj = new THREE.Group();
  private readonly ring: THREE.Mesh;

  constructor(color = 0x6aa8ff) {
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: sigil(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.obj.add(this.ring);
  }

  update(dt: number): void {
    this.ring.rotation.z += dt * 0.6;
  }
}

/** Stone tablet against a wall (local +z out of the wall). */
export function tablet(k: PropKit): THREE.Group {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(1.5, 0.3, 0.7), k.stone, 0, 0.15, 0.35);
  part(g, new THREE.BoxGeometry(1.2, 2.2, 0.28), k.stone, 0, 1.4, 0.2);
  const lines = new THREE.MeshBasicMaterial({ map: sigil(), color: 0x7fb8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), lines);
  p.position.set(0, 1.6, 0.35);
  g.add(p);
  return g;
}

/** The way out: a gate of pale daylight. */
export function exitGate(k: PropKit): THREE.Group {
  const g = new THREE.Group();
  for (const s of [1, -1]) part(g, new THREE.BoxGeometry(0.35, 3.6, 0.35), k.stone, s * 1.4, 1.8, 0.2);
  part(g, new THREE.BoxGeometry(3.4, 0.35, 0.45), k.stone, 0, 3.7, 0.2);
  const light = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 3.5), new THREE.MeshBasicMaterial({ map: k.glow, color: 0xcfe0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  light.position.set(0, 1.8, 0.12);
  light.scale.set(1.2, 1.1, 1);
  g.add(light);
  for (let i = 0; i < 4; i++) part(g, new THREE.BoxGeometry(2.4, 0.18, 0.4), k.stone, 0, 0.09 + i * 0.18, 0.05 - i * 0.05);
  return g;
}

/** The guardian's door: red lacquer, gold studs, a sacred rope across it. */
export function bossDoor(k: PropKit): THREE.Group {
  const g = new THREE.Group();
  for (const s of [1, -1]) {
    part(g, new THREE.BoxGeometry(1.8, 4.1, 0.2), k.lacquer, s * 0.9, 2.05, 0.1);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) part(g, new THREE.SphereGeometry(0.05, 6, 4), k.gold, s * (0.4 + i * 0.5), 0.6 + j * 1, 0.22);
  }
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.9, 3.6, 0.35), new THREE.Vector3(0, 2.9, 0.6), new THREE.Vector3(1.9, 3.6, 0.35)), 16, 0.11, 8), k.rope);
  rope.castShadow = true;
  g.add(rope);
  for (const x of [-1, 0, 1]) part(g, new THREE.PlaneGeometry(0.16, 0.5), k.paper, x * 0.9, 2.95 + Math.abs(x) * 0.35, 0.55);
  return g;
}

/** A pale wandering spirit that blocks a passage. */
export function spirit(k: PropKit): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: k.glow, color: 0x9fc4ff, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(1.2, 2, 1);
  s.position.y = 1.4;
  g.add(s);
  return g;
}
