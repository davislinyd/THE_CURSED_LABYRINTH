import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

/** Fog of war for the ink mist: a mask over the ground from (0, 0), white where seen. */
export interface Mist {
  texture: THREE.Texture;
  /** Metres the mask spans along x and z. */
  size: THREE.Vector2;
}

/**
 * Ink drawing from the scene's depth: a brush line where the depth jumps (the second
 * difference of linear depth, so a sloping ground makes no line) and, on HIGH, a soft
 * dark halo where a surface sits farther than its surroundings (a depth unsharp mask,
 * standing in for ambient occlusion). With a mist, drifting ink wash covers whatever
 * stands on ground not yet seen (its x, z found from the depth). Runs on the linear
 * colour, before bloom and tone mapping.
 */
export class InkPass extends Pass {
  private readonly quad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;
  private camera: THREE.Camera | null = null;
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(640, 448) },
    uNear: { value: 1 },
    uFar: { value: 100 },
    uOrtho: { value: 0 },
    /** Depth jump that makes a full line: metres (orthographic) or a share of the distance (perspective). */
    uEdge: { value: 0.3 },
    /** Where lines fade out with distance (perspective only). */
    uFadeRange: { value: new THREE.Vector2(1e5, 2e5) },
    /** Line width in pixels. */
    uWidth: { value: 1 },
    uStrength: { value: 0.82 },
    uAO: { value: 0 },
    uAOScale: { value: 1.2 },
    uMist: { value: 0 },
    tMist: { value: null as THREE.Texture | null },
    uMistSize: { value: new THREE.Vector2(1, 1) },
    /** Height of the fog bank's top (metres): smaller things are lost in it, taller ones rise out of it. */
    uMistTop: { value: 3 },
    /** Seconds, for the drift. */
    uTime: { value: 0 },
    /** Clip space back to the world. */
    uInvViewProj: { value: new THREE.Matrix4() },
  };

  constructor() {
    super();
    this.needsSwap = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, tDepth, tMist;
        uniform vec2 uRes, uFadeRange, uMistSize;
        uniform float uNear, uFar, uOrtho, uEdge, uWidth, uStrength, uAO, uAOScale, uMist, uMistTop, uTime;
        uniform mat4 uInvViewProj;
        varying vec2 vUv;
        float hash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) { return 0.57 * vnoise(p) + 0.29 * vnoise(p * 2.03 + 17.0) + 0.14 * vnoise(p * 4.01 + 31.0); }
        // distance from the camera plane, in metres; the background counts as far away
        float dist(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          if (d >= 0.99999) return uFar;
          return uOrtho > 0.5 ? d * (uFar - uNear) + uNear : (uNear * uFar) / (uFar - (uFar - uNear) * d);
        }
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          vec2 px = uWidth / uRes;
          float dc = dist(vUv);
          float dl = dist(vUv - vec2(px.x, 0.0)), dr = dist(vUv + vec2(px.x, 0.0));
          float du = dist(vUv + vec2(0.0, px.y)), dd = dist(vUv - vec2(0.0, px.y));
          float d1 = dist(vUv + px), d2 = dist(vUv - px);
          float d3 = dist(vUv + vec2(px.x, -px.y)), d4 = dist(vUv + vec2(-px.x, px.y));
          float lap = abs(dl + dr - 2.0 * dc) + abs(du + dd - 2.0 * dc) + 0.5 * (abs(d1 + d2 - 2.0 * dc) + abs(d3 + d4 - 2.0 * dc));
          float unit = uOrtho > 0.5 ? 1.0 : dc;
          float line = smoothstep(1.0, 2.2, lap / (uEdge * unit));
          line *= 1.0 - smoothstep(uFadeRange.x, uFadeRange.y, dc);
          c = mix(c, vec3(0.03, 0.02, 0.018), line * uStrength);
          if (uAO > 0.0) {
            vec2 r = px * 5.0;
            float avg = (dist(vUv + vec2(r.x, 0.0)) + dist(vUv - vec2(r.x, 0.0)) + dist(vUv + vec2(0.0, r.y)) + dist(vUv - vec2(0.0, r.y))
              + dist(vUv + r * 0.7) + dist(vUv - r * 0.7) + dist(vUv + vec2(r.x, -r.y) * 0.7) + dist(vUv + vec2(-r.x, r.y) * 0.7)) * 0.125;
            float occ = smoothstep(0.0, 1.0, (dc - avg) / (uAOScale * unit));
            c *= 1.0 - occ * uAO;
          }
          if (uMist > 0.5) {
            // a ground fog bank over unseen ground, up to uMistTop: whatever the view ray reaches
            // through it is lost in it, and taller things rise out of its top
            vec2 ndc = vUv * 2.0 - 1.0;
            vec4 a = uInvViewProj * vec4(ndc, -1.0, 1.0), b = uInvViewProj * vec4(ndc, texture2D(tDepth, vUv).x * 2.0 - 1.0, 1.0);
            vec3 s = b.xyz / b.w, dir = normalize(s - a.xyz / a.w);
            // the void past the ground's edge counts as ground at y = 0
            if (s.y < 0.0 && dir.y < -0.05) s -= dir * (s.y / dir.y);
            if (s.y < uMistTop && dir.y < -0.05) {
              float len = (uMistTop - s.y) / -dir.y;
              vec3 top = s - dir * len;
              float unseen = 0.0;
              for (int i = 0; i < 4; i++) {
                vec2 m = mix(top.xz, s.xz, (float(i) + 0.5) / 4.0) / uMistSize;
                // past the edge of the map the fog thickens over a few metres instead of all at once
                vec2 past = max(-m, m - 1.0) * uMistSize;
                unseen = max(unseen, 1.0 - texture2D(tMist, clamp(m, 0.0, 1.0)).r * (1.0 - smoothstep(0.0, 3.0, max(past.x, past.y))));
              }
              // two layers of wisps on the bank's top, drifting at different speeds and folded into
              // themselves; they fray its edge
              vec2 q = top.xz * 0.24 + uTime * vec2(0.16, 0.08);
              float n = mix(fbm(q + 1.8 * fbm(q * 0.5 - uTime * 0.07)), fbm(top.xz * 0.4 - uTime * vec2(0.05, 0.12)), 0.35);
              float cover = clamp(unseen * 1.6 - 0.3 + (n - 0.5) * 0.9, 0.0, 1.0) * smoothstep(0.0, 2.0, len);
              // a thin, moonlit ink wash: grey indigo, paler where the wisps gather, so it reads against the night
              vec3 ink = mix(vec3(0.045, 0.05, 0.072), vec3(0.14, 0.145, 0.185), smoothstep(0.25, 0.8, n));
              c = mix(c, ink, cover);
            }
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width: number, height: number): void {
    this.uniforms.uRes.value.set(width, height);
    this.uniforms.uWidth.value = Math.max(1, height / 700);
  }

  /** Per frame: the camera whose depth is read (orthographic cameras have no distance fade). */
  setCamera(camera: THREE.Camera): void {
    const u = this.uniforms;
    const cam = camera as THREE.PerspectiveCamera;
    const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
    this.camera = camera;
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    u.uOrtho.value = ortho ? 1 : 0;
    u.uEdge.value = ortho ? 0.3 : 0.035;
    u.uAOScale.value = ortho ? 1.4 : 0.09;
    u.uFadeRange.value.set(ortho ? 1e5 : 28, ortho ? 2e5 : 70);
  }

  /** Per frame: the fog of war to cover with mist, if any. */
  setMist(mist: Mist | null, time: number): void {
    const u = this.uniforms;
    u.uMist.value = mist ? 1 : 0;
    u.tMist.value = mist?.texture ?? null;
    if (mist) u.uMistSize.value.copy(mist.size);
    u.uTime.value = time;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    // the scene pass has just brought the camera's matrices up to date
    if (this.camera) this.uniforms.uInvViewProj.value.multiplyMatrices(this.camera.matrixWorld, this.camera.projectionMatrixInverse);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
