import * as THREE from 'three';

/** What drifts through a scene: how many motes, the box around the hero they fill, their fall and the wind. */
export interface DriftKind {
  count: number;
  box: [number, number, number];
  /** Metres per second down (ash) and up (embers); `ember` is the share of motes that are embers. */
  fall: number;
  rise: number;
  ember: number;
  wind: [number, number];
  /** Mote size in metres. */
  size: number;
}

export const DRIFT = {
  /** Ash and a few embers over the roads and the village. */
  iso: { count: 260, box: [44, 16, 44], fall: 0.35, rise: 0.5, ember: 0.07, wind: [0.9, 0.3], size: 0.075 },
  /** Dust hanging in the labyrinth's air. */
  cave: { count: 150, box: [16, 4, 16], fall: 0.04, rise: 0.05, ember: 0.03, wind: [0.08, 0.05], size: 0.028 },
  /** Embers rising from the boss's hollow. */
  boss: { count: 220, box: [30, 12, 30], fall: 0.15, rise: 0.9, ember: 0.45, wind: [0.3, 0.2], size: 0.06 },
} satisfies Record<string, DriftKind>;

const VERT = /* glsl */ `
  attribute vec4 aRand;
  uniform vec3 uCenter, uBox;
  uniform vec2 uWind;
  uniform float uTime, uFall, uRise, uSize, uEmber, uPx;
  varying vec4 vColor;
  void main() {
    float seed = aRand.w;
    bool ember = seed < uEmber;
    float k = 0.6 + fract(seed * 7.13);
    vec3 v = vec3(uWind.x * k, ember ? uRise * k : -uFall * k, uWind.y * k);
    vec3 p = aRand.xyz * uBox + v * uTime + vec3(sin(uTime * 0.6 + seed * 50.0), 0.0, cos(uTime * 0.5 + seed * 37.0)) * 0.5;
    // the box follows the hero; motes stay where they are and wrap round it
    vec3 o = uCenter - uBox * 0.5;
    p = o + mod(p - o, uBox);
    vec3 r = (p - uCenter) / uBox;
    float edge = (1.0 - smoothstep(0.34, 0.5, max(abs(r.x), abs(r.z)))) * (1.0 - smoothstep(0.38, 0.5, abs(r.y)));
    float flick = ember ? 0.65 + 0.35 * sin(uTime * 9.0 + seed * 90.0) : 1.0;
    vColor = ember ? vec4(2.4, 1.0, 0.34, 0.9 * edge * flick) : vec4(0.8, 0.76, 0.7, 0.42 * edge);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    gl_PointSize = max(1.6, uSize * (ember ? 0.8 : 1.0) * uPx * projectionMatrix[1][1] / gl_Position.w);
  }`;
const FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float a = vColor.a * (1.0 - smoothstep(0.5, 1.0, length(gl_PointCoord - 0.5) * 2.0));
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
  }`;

const _v4 = new THREE.Vector4();

/** Ash, dust or embers drifting round the hero: one Points object, moved entirely in the vertex shader. */
export class Drift {
  readonly points: THREE.Points;
  private readonly u: Record<string, THREE.IUniform>;

  /** `scale`: share of the motes to make (the quality profile's particle amount). */
  constructor(kind: DriftKind, scale = 1) {
    const count = Math.max(8, Math.round(kind.count * scale));
    const g = new THREE.BufferGeometry();
    const rand = new Float32Array(count * 4);
    for (let i = 0; i < rand.length; i++) rand[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    this.u = {
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(...kind.box) },
      uWind: { value: new THREE.Vector2(...kind.wind) },
      uTime: { value: 0 },
      uFall: { value: kind.fall },
      uRise: { value: kind.rise },
      uSize: { value: kind.size },
      uEmber: { value: kind.ember },
      uPx: { value: 360 },
    };
    const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, transparent: true, depthWrite: false });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.onBeforeRender = (r) => (this.u.uPx.value = r.getCurrentViewport(_v4).w / 2);
    this.box = kind.box;
  }

  private readonly box: [number, number, number];

  update(time: number, around: THREE.Vector3): void {
    this.u.uTime.value = time;
    (this.u.uCenter.value as THREE.Vector3).set(around.x, this.box[1] * 0.5, around.z);
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
