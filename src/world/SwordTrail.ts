import * as THREE from 'three';

/** Ticks a point of the trail lasts, and its strength where it leaves the blade. */
const LIFE = 8;
const ALPHA = 0.7;
/** Ribbon points per tick of motion (Catmull-Rom between the tick samples). */
const SUB = 4;
const MAX_QUADS = (LIFE + 2) * SUB;
/** The blade in its mesh's space: just above the guard, and the tip (raised by the curve). */
const ROOT = new THREE.Vector3(0, 0, -0.26);
const TIP = new THREE.Vector3(0, 0.05, 0.36);

interface Sample {
  root: THREE.Vector3;
  tip: THREE.Vector3;
  color: THREE.Color;
  age: number;
  /** Samples of one cut share a run; the ribbon never joins two cuts. */
  run: number;
}

let MAT: THREE.ShaderMaterial | null = null;
const material = () =>
  (MAT ??= new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec4 aColor;
      varying vec4 vColor;
      void main() { vColor = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec4 vColor;
      void main() { gl_FragColor = vColor; }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));

/** Catmull-Rom through p1..p2 (p0, p3 the neighbours) at u. */
function cr(out: THREE.Vector3, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, u: number): THREE.Vector3 {
  const u2 = u * u, u3 = u2 * u;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (3 * b - a - 3 * c + d) * u3);
  return out.set(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}

/**
 * The arc a cut leaves in the air: where the blade's root and tip were over the
 * last few ticks, smoothed into a ribbon that thins toward the tip and fades
 * behind the blade. Drawn additively in the colour of the blow.
 */
export class SwordTrail {
  readonly mesh: THREE.Mesh;
  private readonly samples: Sample[] = [];
  private readonly free: Sample[] = [];
  private readonly pos: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;
  private live = false;
  private run = 0;
  private readonly head = { root: new THREE.Vector3(), tip: new THREE.Vector3() };
  private readonly a = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly b = [new THREE.Vector3(), new THREE.Vector3()];

  constructor(private readonly blade: THREE.Object3D) {
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 6 * 3), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 6 * 4), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.col.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('aColor', this.col);
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, material());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** One tick: age the samples; with a colour, the blade is cutting and its pose is added. */
  tick(color: number | null): void {
    for (const s of this.samples) s.age++;
    while (this.samples.length && this.samples[0].age > LIFE) this.free.push(this.samples.shift()!);
    if (color === null) {
      this.live = false;
      return;
    }
    if (!this.live) this.run++;
    this.live = true;
    this.blade.updateWorldMatrix(true, false);
    const s = this.free.pop() ?? { root: new THREE.Vector3(), tip: new THREE.Vector3(), color: new THREE.Color(), age: 0, run: 0 };
    s.root.copy(ROOT).applyMatrix4(this.blade.matrixWorld);
    s.tip.copy(TIP).applyMatrix4(this.blade.matrixWorld);
    s.color.setHex(color);
    s.age = 0;
    s.run = this.run;
    this.samples.push(s);
  }

  /** Tip positions of the cut in progress, oldest first. */
  path(): THREE.Vector3[] {
    return this.samples.filter((s) => s.run === this.run).map((s) => s.tip);
  }

  /** Rebuild the ribbon, ending at the blade as it is drawn (call before rendering, after the scene's matrices). */
  draw(): void {
    const head = this.head;
    if (this.live) {
      head.root.copy(ROOT).applyMatrix4(this.blade.matrixWorld);
      head.tip.copy(TIP).applyMatrix4(this.blade.matrixWorld);
    }
    const S = this.samples;
    let q = 0;
    for (let i = 0; i < S.length; ) {
      let j = i;
      while (j + 1 < S.length && S[j + 1].run === S[i].run) j++;
      const current = this.live && S[i].run === this.run;
      const R = (k: number) => (current && k === j ? head.root : S[Math.max(i, Math.min(j, k))].root);
      const T = (k: number) => (current && k === j ? head.tip : S[Math.max(i, Math.min(j, k))].tip);
      for (let k = i; k < j; k++) {
        for (let n = 0; n < SUB; n++) {
          if (q >= MAX_QUADS) break;
          const u0 = n / SUB, u1 = (n + 1) / SUB;
          this.point(this.a, R, T, k, u0, S[k].age + (S[k + 1].age - S[k].age) * u0);
          this.point(this.b, R, T, k, u1, S[k].age + (S[k + 1].age - S[k].age) * u1);
          const ca = S[k].color, cb = S[k + 1].color;
          this.quad(q++, ca, cb, S[k].age + (S[k + 1].age - S[k].age) * u0, S[k].age + (S[k + 1].age - S[k].age) * u1);
        }
      }
      i = j + 1;
    }
    this.mesh.geometry.setDrawRange(0, q * 6);
    if (q) {
      this.pos.needsUpdate = true;
      this.col.needsUpdate = true;
    }
  }

  /** Root and tip at fraction u past sample k; older points keep only the outer part of the blade. */
  private point(out: THREE.Vector3[], R: (k: number) => THREE.Vector3, T: (k: number) => THREE.Vector3, k: number, u: number, age: number): void {
    cr(out[0], R(k - 1), R(k), R(k + 1), R(k + 2), u);
    cr(out[1], T(k - 1), T(k), T(k + 1), T(k + 2), u);
    out[0].lerp(out[1], Math.min(0.9, 0.3 + (age / LIFE) * 0.6));
  }

  private quad(q: number, ca: THREE.Color, cb: THREE.Color, ageA: number, ageB: number): void {
    const [ra, ta] = this.a, [rb, tb] = this.b;
    const fa = ALPHA * Math.max(0, 1 - ageA / LIFE) ** 1.5, fb = ALPHA * Math.max(0, 1 - ageB / LIFE) ** 1.5;
    // two triangles: (root a, tip a, tip b), (root a, tip b, root b); the root edge fades out
    const i = q * 6;
    this.put(i, ra, ca, fa * 0.08);
    this.put(i + 1, ta, ca, fa);
    this.put(i + 2, tb, cb, fb);
    this.put(i + 3, ra, ca, fa * 0.08);
    this.put(i + 4, tb, cb, fb);
    this.put(i + 5, rb, cb, fb * 0.08);
  }

  private put(i: number, v: THREE.Vector3, c: THREE.Color, alpha: number): void {
    const p = this.pos.array as Float32Array, k = this.col.array as Float32Array;
    p[i * 3] = v.x;
    p[i * 3 + 1] = v.y;
    p[i * 3 + 2] = v.z;
    k[i * 4] = c.r;
    k[i * 4 + 1] = c.g;
    k[i * 4 + 2] = c.b;
    k[i * 4 + 3] = alpha;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
