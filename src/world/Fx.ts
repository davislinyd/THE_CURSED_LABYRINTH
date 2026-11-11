import { Drift, type DriftKind } from './Drift';
import * as THREE from 'three';
import { crescentTexture, glowTexture, ringTexture, stainTexture, starTexture } from '../engine/ProcTex';

let GLOW: THREE.Texture | null = null;
let BLOB: THREE.Texture | null = null;
let CRESCENT: THREE.Texture | null = null;
let STAR: THREE.Texture | null = null;
let STAIN: THREE.Texture | null = null;
let RING: THREE.Texture | null = null;

/** Set from the quality profile: the share of motes, sparks and drops made, and whether blows light their surroundings. */
export const FX_QUALITY = { particles: 1, flashLight: true };

const glow = () => (GLOW ??= glowTexture(64));

/** A soft dark disc under a body: the shadow of the PS2 era. */
export function blobShadow(size: number): THREE.Mesh {
  BLOB ??= glowTexture(64, [[0, 'rgba(0,0,0,0.7)'], [0.6, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}

export type SoulKind = 'red' | 'yellow';

interface Soul {
  s: THREE.Sprite;
  kind: SoulKind;
  v: THREE.Vector3;
  age: number;
}

interface Spark {
  s: THREE.Sprite;
  age: number;
  life: number;
  /** Size at the start and the end (a 'pulse' swells and shrinks back instead). */
  from: number;
  to: number;
  pulse?: boolean;
  /** Width over height. */
  aspect: number;
}

/** A drop of blood or a mote of dust, drawn as one point of a shared cloud. */
interface Dot {
  p: THREE.Vector3;
  v: THREE.Vector3;
  color: THREE.Color;
  alpha: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  gravity: number;
  drag: number;
  /** Leaves a stain where it lands. */
  stains: boolean;
}

interface Stain {
  x: number;
  z: number;
  size: number;
  yaw: number;
  age: number;
}

const MAX_DOTS = 512;
const MAX_STAINS = 40;
/** Stains stay this long (s), then fade out over STAIN_FADE. */
const STAIN_HOLD = 6;
const STAIN_FADE = 4;
/** Height of the stains, above the bumps of a cave floor. */
const STAIN_Y = 0.06;

const DOT_VERT = /* glsl */ `
  attribute vec4 aColor;
  attribute float aSize;
  uniform float uPx;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // world size to pixels, for perspective and orthographic cameras alike
    gl_PointSize = aSize * uPx * projectionMatrix[1][1] / gl_Position.w;
  }`;
const DOT_FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float a = vColor.a * (1.0 - smoothstep(0.55, 1.0, length(gl_PointCoord - 0.5) * 2.0));
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
  }`;
const STAIN_VERT = /* glsl */ `
  attribute float aAlpha;
  varying float vA;
  varying vec3 vC;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vA = aAlpha;
    vC = instanceColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }`;
const STAIN_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying float vA;
  varying vec3 vC;
  varying vec2 vUv;
  void main() {
    float a = texture2D(map, vUv).a * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vC, a);
  }`;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v4 = new THREE.Vector4();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Combat effects of a scene: hit sparks and cut flashes, blood and dust, stains
 * on the ground, and the souls the fallen release (red: sword experience, yellow: life).
 */
export class Fx {
  readonly group = new THREE.Group();
  private readonly souls: Soul[] = [];
  private readonly sparks: Spark[] = [];
  private readonly dots: Dot[] = [];
  private readonly dotPos = new Float32Array(MAX_DOTS * 3);
  private readonly dotCol = new Float32Array(MAX_DOTS * 4);
  private readonly dotSize = new Float32Array(MAX_DOTS);
  private readonly cloud: THREE.Points;
  private readonly stainMesh: THREE.InstancedMesh;
  private readonly stainAlpha: THREE.InstancedBufferAttribute;
  private readonly stains: (Stain | null)[] = new Array(MAX_STAINS).fill(null);
  private nextStain = 0;
  private readonly drift: Drift | null;
  private time = 0;
  /** One light for the flash of a blow: moved to where it lands, then dying away. */
  private readonly flare = new THREE.PointLight(0xffffff, 0, 9, 1.6);

  /** `ambient`: what drifts through the scene (ash, dust, embers), following the hero. */
  constructor(ambient: DriftKind | null = null) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.dotPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.dotCol, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.dotSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const dm = new THREE.ShaderMaterial({ vertexShader: DOT_VERT, fragmentShader: DOT_FRAG, uniforms: { uPx: { value: 360 } }, transparent: true, depthWrite: false });
    this.cloud = new THREE.Points(g, dm);
    this.cloud.frustumCulled = false;
    this.cloud.onBeforeRender = (r) => (dm.uniforms.uPx.value = r.getCurrentViewport(_v4).w / 2);
    const sg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.stainAlpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAINS), 1).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('aAlpha', this.stainAlpha);
    const sm = new THREE.ShaderMaterial({
      vertexShader: STAIN_VERT,
      fragmentShader: STAIN_FRAG,
      uniforms: { map: { value: (STAIN ??= stainTexture(7)) } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.stainMesh = new THREE.InstancedMesh(sg, sm, MAX_STAINS);
    this.stainMesh.frustumCulled = false;
    for (let i = 0; i < MAX_STAINS; i++) {
      this.stainMesh.setMatrixAt(i, ZERO);
      this.stainMesh.setColorAt(i, new THREE.Color(0));
    }
    this.group.add(this.stainMesh, this.cloud);
    this.drift = ambient && new Drift(ambient, FX_QUALITY.particles);
    if (this.drift) this.group.add(this.drift.points);
    // in the scene from the start (its count is part of every lit shader), dark until a blow lands
    this.flare.visible = FX_QUALITY.flashLight;
    this.group.add(this.flare);
  }

  /** Steel on steel or a blow that lands: a burst of light, sparks thrown from it and, for the big ones, a ring. */
  spark(at: THREE.Vector3, color = 0xffd8a0, size = 1.1, life = 0.16): void {
    this.sprite(glow(), at, color, life, { from: size * 0.4, to: size * 1.4, aspect: 1 });
    this.burst(at, null, color, Math.round(size * 6), 3 + size * 1.5);
    this.flash(at, color, size * 10);
    if (size >= 2) {
      const ring = this.sprite((RING ??= ringTexture()), at, color, life * 1.6, { from: size * 0.3, to: size * 2.6, aspect: 1 });
      ring.material.depthTest = false;
      ring.renderOrder = 3;
    }
  }

  /** Light the surroundings of a blow for an instant. */
  flash(at: THREE.Vector3, color: number, intensity: number): void {
    if (intensity < this.flare.intensity) return;
    this.flare.position.copy(at);
    this.flare.color.setHex(color);
    this.flare.intensity = intensity;
  }

  /** Bright motes thrown from `at`, along `dir` if given: they fly, fall and die within half a second. */
  burst(at: THREE.Vector3, dir: THREE.Vector3 | null, color: number, n: number, speed = 5): void {
    n = Math.round(n * FX_QUALITY.particles);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, up = Math.random() * 2 - 0.5, sp = speed * (0.4 + Math.random() * 0.8);
      const v = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).multiplyScalar(sp);
      if (dir) v.addScaledVector(dir, speed * (0.5 + Math.random() * 0.7));
      // brighter than white: the bloom makes them glow
      this.dot(at, v, color, 1, 0.22 + Math.random() * 0.25, 0.035 + Math.random() * 0.03, -0.7, 9, 0.93, false, 3.5);
    }
  }

  /**
   * The flash of a cut: a crescent across the wound, lying along the path of the
   * blade tip on screen (`path`: its last positions, oldest first) and bulging the
   * way the blade curved.
   */
  slash(at: THREE.Vector3, path: readonly THREE.Vector3[], camera: THREE.Camera, color: number, size = 1): void {
    const s = this.sprite((CRESCENT ??= crescentTexture()), at, color, 0.15, { from: size * 0.45, to: size * 0.65, aspect: 3.2 });
    s.material.depthTest = false;
    s.material.color.multiplyScalar(0.75);
    s.renderOrder = 3;
    if (path.length < 2) return;
    const n = path.length, p0 = path[Math.max(0, n - 3)].clone().project(camera), p2 = path[n - 1].clone().project(camera);
    const p1 = path[Math.max(0, n - 2)].clone().project(camera);
    const persp = camera as THREE.PerspectiveCamera, ortho = camera as THREE.OrthographicCamera;
    const asp = persp.isPerspectiveCamera ? persp.aspect : (ortho.right - ortho.left) / (ortho.top - ortho.bottom);
    const dx = (p2.x - p0.x) * asp, dy = p2.y - p0.y;
    // the sprite bulges toward its +Y: flip it when the blade curved to the right of its motion
    const bx = (p1.x - (p0.x + p2.x) / 2) * asp, by = p1.y - (p0.y + p2.y) / 2;
    s.material.rotation = Math.atan2(dy, dx) + (dx * by - dy * bx < 0 ? Math.PI : 0);
  }

  /**
   * Where a blade lands on a body: the cut's flash in the blow's colour, and
   * (with a `blood` colour) blood thrown along the blade's path and away from
   * the striker at `from`.
   */
  wound(at: THREE.Vector3, from: { x: number; z: number }, path: readonly THREE.Vector3[], camera: THREE.Camera, color: number, heavy: boolean, blood: number | null): void {
    this.slash(at, path, camera, color, heavy ? 1.5 : 1.1);
    const n = path.length, dir = new THREE.Vector3(at.x - from.x, 0, at.z - from.z).normalize();
    if (n >= 2) dir.add(path[n - 1].clone().sub(path[Math.max(0, n - 3)]).setY(0).normalize());
    this.burst(at, dir, color, heavy ? 12 : 6, heavy ? 5 : 3.5);
    this.flash(at, color, heavy ? 16 : 7);
    if (blood === null) return;
    this.splatter(at, dir, blood, Math.round((heavy ? 18 : 10) * Math.max(0.6, FX_QUALITY.particles)));
  }

  /** The glint of a coming blow. */
  glint(at: THREE.Vector3, color = 0xff3018, size = 0.9): void {
    const s = this.sprite((STAR ??= starTexture()), at, color, 0.3, { from: 0, to: size, pulse: true, aspect: 1 });
    s.material.depthTest = false;
    s.renderOrder = 3;
  }

  /** Blood (or ink) thrown from a wound along `dir`; some drops stain the ground where they fall. */
  splatter(at: THREE.Vector3, dir: THREE.Vector3, color: number, n = 12): void {
    const d = _p.copy(dir).setY(0).normalize();
    for (let i = 0; i < n; i++) {
      const speed = 2 + Math.random() * 4;
      const v = new THREE.Vector3(
        d.x * speed + (Math.random() - 0.5) * 2.5,
        0.5 + Math.random() * 3,
        d.z * speed + (Math.random() - 0.5) * 2.5,
      );
      this.dot(at, v, color, 0.95, 0.9, 0.05 + Math.random() * 0.08, 0, 14, 0.985, Math.random() < 0.45);
    }
  }

  /** A puff of dust about the feet at (x, z). */
  dust(x: number, z: number, n = 7): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.2;
      _s.set(x + Math.cos(a) * 0.2, 0.08, z + Math.sin(a) * 0.2);
      this.dot(_s, new THREE.Vector3(Math.cos(a) * sp, 0.2 + Math.random() * 0.5, Math.sin(a) * sp), 0xd0c6b0, 0.4, 0.55 + Math.random() * 0.25, 0.3, 2, -0.4, 0.9, false);
    }
  }

  release(at: THREE.Vector3, kind: SoulKind, n: number): void {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: kind === 'red' ? 0xff3a2a : 0xffd040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.copy(at).setY(1.2);
      s.scale.setScalar(0.45);
      this.group.add(s);
      const a = Math.random() * Math.PI * 2;
      this.souls.push({ s, kind, v: new THREE.Vector3(Math.cos(a) * 1.5, 2 + Math.random(), Math.sin(a) * 1.5), age: 0 });
    }
  }

  /** Advance; souls home in on `hero` and are absorbed. Returns how many of each were taken this tick. */
  update(dt: number, hero: THREE.Vector3): Record<SoulKind, number> {
    const got = { red: 0, yellow: 0 };
    this.drift?.update((this.time += dt), hero);
    if (this.flare.intensity > 0) this.flare.intensity = this.flare.intensity < 0.2 ? 0 : this.flare.intensity * 0.72;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.age += dt;
      const k = p.age / p.life;
      const size = p.pulse ? p.to * Math.sin(Math.PI * Math.min(1, k)) : p.from + (p.to - p.from) * k;
      p.s.scale.set(size * p.aspect, size, 1);
      p.s.material.opacity = p.pulse ? 1 : 1 - k;
      if (k >= 1) {
        this.group.remove(p.s);
        p.s.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
    const target = hero.clone().setY(1.1);
    for (let i = this.souls.length - 1; i >= 0; i--) {
      const o = this.souls[i];
      o.age += dt;
      const to = target.clone().sub(o.s.position);
      const d = to.length();
      if (o.age > 0.5) o.v.lerp(to.normalize().multiplyScalar(Math.max(6, 14 - d)), 0.12);
      else o.v.multiplyScalar(0.94);
      o.s.position.addScaledVector(o.v, dt);
      o.s.scale.setScalar(0.4 + 0.08 * Math.sin(o.age * 20));
      if (o.age > 0.5 && d < 0.5) {
        got[o.kind]++;
        this.group.remove(o.s);
        o.s.material.dispose();
        this.souls.splice(i, 1);
      }
    }
    this.updateDots(dt);
    this.updateStains(dt);
    return got;
  }

  dispose(): void {
    this.flare.dispose();
    this.drift?.dispose();
    this.cloud.geometry.dispose();
    (this.cloud.material as THREE.Material).dispose();
    this.stainMesh.geometry.dispose();
    (this.stainMesh.material as THREE.Material).dispose();
    this.stainMesh.dispose();
  }

  private sprite(map: THREE.Texture, at: THREE.Vector3, color: number, life: number, shape: Omit<Spark, 's' | 'age' | 'life'>): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(at);
    s.scale.set(shape.from * shape.aspect, shape.from, 1);
    this.group.add(s);
    this.sparks.push({ s, age: 0, life, ...shape });
    return s;
  }

  private dot(at: THREE.Vector3, v: THREE.Vector3, color: number, alpha: number, life: number, size: number, grow: number, gravity: number, drag: number, stains: boolean, boost = 1): void {
    if (this.dots.length >= MAX_DOTS) return;
    this.dots.push({ p: at.clone(), v, color: new THREE.Color(color).multiplyScalar(boost), alpha, age: 0, life, size, grow, gravity, drag, stains });
  }

  private updateDots(dt: number): void {
    const D = this.dots;
    for (let i = D.length - 1; i >= 0; i--) {
      const d = D[i];
      d.age += dt;
      d.v.y -= d.gravity * dt;
      d.v.multiplyScalar(d.drag);
      d.p.addScaledVector(d.v, dt);
      const landed = d.p.y <= STAIN_Y && d.v.y < 0;
      if (landed && d.stains) this.stain(d.p.x, d.p.z, 0.18 + d.size * 3, d.color);
      if (d.age >= d.life || landed) D.splice(i, 1);
    }
    D.forEach((d, i) => {
      const k = d.age / d.life;
      this.dotPos.set([d.p.x, d.p.y, d.p.z], i * 3);
      this.dotCol.set([d.color.r, d.color.g, d.color.b, d.alpha * (d.grow ? 1 - k : 1)], i * 4);
      this.dotSize[i] = d.size * Math.max(0, 1 + d.grow * k);
    });
    const g = this.cloud.geometry;
    g.setDrawRange(0, D.length);
    if (D.length) for (const a of ['position', 'aColor', 'aSize']) g.getAttribute(a).needsUpdate = true;
  }

  private stain(x: number, z: number, size: number, color: THREE.Color): void {
    const i = this.nextStain;
    this.nextStain = (i + 1) % MAX_STAINS;
    this.stains[i] = { x, z, size, yaw: Math.random() * Math.PI * 2, age: 0 };
    this.stainMesh.setColorAt(i, color);
    this.stainMesh.instanceColor!.needsUpdate = true;
  }

  private updateStains(dt: number): void {
    let changed = false;
    this.stains.forEach((s, i) => {
      if (!s) return;
      s.age += dt;
      changed = true;
      if (s.age >= STAIN_HOLD + STAIN_FADE) {
        this.stains[i] = null;
        this.stainMesh.setMatrixAt(i, ZERO);
        this.stainAlpha.setX(i, 0);
        return;
      }
      // a splash spreads for a moment, then dries and fades
      const spread = Math.min(1, 0.55 + s.age * 3);
      _q.setFromAxisAngle(UP, s.yaw);
      _m.compose(_p.set(s.x, STAIN_Y, s.z), _q, _s.set(s.size * spread, 1, s.size * spread));
      this.stainMesh.setMatrixAt(i, _m);
      this.stainAlpha.setX(i, 0.8 * Math.min(1, (STAIN_HOLD + STAIN_FADE - s.age) / STAIN_FADE));
    });
    if (changed) {
      this.stainMesh.instanceMatrix.needsUpdate = true;
      this.stainAlpha.needsUpdate = true;
    }
  }
}
