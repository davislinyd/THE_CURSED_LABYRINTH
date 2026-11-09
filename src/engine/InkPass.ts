import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

/**
 * Ink drawing from the scene's depth: a brush line where the depth jumps (the second
 * difference of linear depth, so a sloping ground makes no line) and, on HIGH, a soft
 * dark halo where a surface sits farther than its surroundings (a depth unsharp mask,
 * standing in for ambient occlusion). Runs on the linear colour, before bloom and tone mapping.
 */
export class InkPass extends Pass {
  private readonly quad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;
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
        uniform sampler2D tDiffuse, tDepth;
        uniform vec2 uRes, uFadeRange;
        uniform float uNear, uFar, uOrtho, uEdge, uWidth, uStrength, uAO, uAOScale;
        varying vec2 vUv;
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
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    u.uOrtho.value = ortho ? 1 : 0;
    u.uEdge.value = ortho ? 0.3 : 0.035;
    u.uAOScale.value = ortho ? 1.4 : 0.09;
    u.uFadeRange.value.set(ortho ? 1e5 : 28, ortho ? 2e5 : 70);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
