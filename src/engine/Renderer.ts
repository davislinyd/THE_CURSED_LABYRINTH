import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { DynamicResolution } from './DynamicResolution';
import { InkPass, Mist } from './InkPass';
import { GpuTimer, PerfMonitor } from './PerfMonitor';
import { washiTexture } from './ProcTex';
import { PROFILES, QualityId, QualityProfile, Resolution, renderSize } from './Quality';

/** Logical screen height, and the width of the centred safe area menus are laid out in. */
export const SCREEN_W = 640;
export const SCREEN_H = 448;
/** The widest logical screen (21:9); wider windows get side bars. */
const MAX_W = Math.round((SCREEN_H * 21) / 9);

/** The logical screen right now: its width, and where the 640-wide safe area starts in it. */
export const VIEW = { w: SCREEN_W, ox: 0 };

export { RESOLUTIONS } from './Quality';
export type { Effects, Resolution } from './Quality';

export interface View {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** Ink mist over the ground not yet explored (the isometric areas). */
  mist?: Mist | null;
}

/**
 * The faded woodblock print, in display space: indigo shadows and ochre lights, the colours
 * thinned out and posterised but vermilion kept, washi fibres over everything, plates slightly
 * out of register, a burnt irregular edge, specks and scratches; then grain, CRT, flash and fade.
 */
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tPaper: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(SCREEN_W, SCREEN_H) },
    uFade: { value: 0 },
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.5 },
    uSat: { value: 0.8 },
    uContrast: { value: 1.08 },
    uLift: { value: new THREE.Vector3(0.034, 0.027, 0.024) },
    uGain: { value: new THREE.Vector3(1.0, 0.97, 0.92) },
    uCrt: { value: 0 },
    uImpact: { value: new THREE.Vector3() },
    uPaperAmt: { value: 1 },
    /** Output pixels per print unit: register, specks, grain and scan lines keep their size on any display. */
    uUnit: { value: 1 },
  },
  /** WORN: plates out of register, specks and scratches (compiled out on the cheapest profile). */
  defines: {} as Record<string, string>,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tPaper;
    uniform float uTime, uFade, uGrain, uVignette, uSat, uContrast, uCrt, uPaperAmt, uUnit;
    uniform vec2 uRes;
    uniform vec3 uLift, uGain;
    uniform vec4 uFlash;
    uniform vec3 uImpact;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      #ifdef WORN
        // colour plates printed a pixel apart: red one way, blue the other
        vec2 pn = uUnit / uRes;
        vec3 c = vec3(texture2D(tDiffuse, vUv + pn * vec2(0.8, 0.5)).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - pn * vec2(0.6, 0.7)).b);
      #else
        vec3 c = texture2D(tDiffuse, vUv).rgb;
      #endif
      if (uImpact.z > 0.001) {
        // a heavy blow: the picture smears outward from the hit, its colours parting
        vec2 d = vUv - uImpact.xy;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float s = 1.0 - uImpact.z * 0.08 * float(i) / 7.0;
          acc.r += texture2D(tDiffuse, uImpact.xy + d * (s + uImpact.z * 0.015)).r;
          acc.g += texture2D(tDiffuse, uImpact.xy + d * s).g;
          acc.b += texture2D(tDiffuse, uImpact.xy + d * (s - uImpact.z * 0.015)).b;
        }
        c = mix(c, acc / 8.0, min(1.0, uImpact.z * 1.5));
      }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // thinned colour, but red (blood, lanterns, torii) keeps most of its strength
      float red = clamp((c.r - max(c.g, c.b)) * 3.0, 0.0, 1.0);
      c = mix(vec3(l), c, mix(uSat, 1.0, red * 0.75));
      c = (c - 0.5) * uContrast + 0.5;
      // two inks: indigo in the shadows, ochre in the lights
      c *= mix(vec3(0.84, 0.93, 1.16), vec3(1.1, 1.0, 0.82), smoothstep(0.08, 0.75, l));
      c = c * uGain + uLift * (1.0 - c);
      // a limited set of tones, as blocks give
      float lp = dot(c, vec3(0.299, 0.587, 0.114));
      c *= mix(1.0, clamp(floor(lp * 14.0 + 0.5) / 14.0 / max(lp, 0.03), 0.6, 1.6), 0.5);
      // washi: fibres and blotches, plainest in the shadows
      vec2 pu = vUv * vec2(uRes.x / uRes.y, 1.0) * 2.6;
      float paper = texture2D(tPaper, pu).r;
      float pk = uPaperAmt * (0.45 + 0.55 * smoothstep(0.15, 0.8, lp));
      c *= 1.0 + (paper - 0.5) * 1.9 * pk;
      c = mix(c, c * vec3(1.0, 0.97, 0.9) + vec3(0.02, 0.015, 0.008), uPaperAmt * 0.35);
      // a burnt, uneven edge
      vec2 d = vUv - 0.5;
      float e = dot(d, d) * 2.0;
      float n = vnoise(vUv * vec2(9.0, 6.0)) * 0.6 + vnoise(vUv * 23.0) * 0.4;
      c *= 1.0 - uVignette * clamp(e + (n - 0.5) * 0.3 * e, 0.0, 1.0);
      c = mix(c, vec3(0.045, 0.028, 0.02), smoothstep(0.55, 0.9, e * 1.25 + (n - 0.5) * 0.45) * 0.55);
      #ifdef WORN
      {
        vec2 cell = floor(vUv * uRes / (2.0 * uUnit));
        c *= 1.0 - 0.55 * step(0.9993, hash(cell + 17.0));
        c += 0.12 * step(0.99985, hash(cell + 91.0));
        float col = floor(vUv.x * 60.0);
        float cx = (col + hash(vec2(col, 7.0))) / 60.0;
        float y0 = hash(vec2(col, 11.0)), y1 = y0 + 0.08 + hash(vec2(col, 13.0)) * 0.35;
        float sc = step(0.955, hash(vec2(col, 3.0))) * (1.0 - smoothstep(0.0, 0.0012, abs(vUv.x - cx))) * step(y0, vUv.y) * step(vUv.y, y1);
        c = mix(c, c * 0.72, sc * 0.7);
      }
      #endif
      if (uGrain > 0.0) {
        vec2 px = floor(vUv * uRes / uUnit);
        c += (hash(px + fract(uTime * 7.31) * 113.0) - 0.5) * uGrain;
      }
      if (uCrt > 0.5) {
        float s = sin(vUv.y * uRes.y / uUnit * 3.14159265);
        c *= 0.86 + 0.14 * s * s;
      }
      c = mix(c, uFlash.rgb, uFlash.a);
      c *= 1.0 - uFade;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/**
 * WebGL renderer filling the window (10:7 up to 21:9), with ink lines, bloom, SMAA and the
 * woodblock finish.
 *
 * Pipeline: scene (linear, half float) -> ink lines / halo / mist -> bloom -> tone map and
 * sRGB (OutputPass) -> SMAA -> finish. Everything before the finish runs at the internal
 * size, a share of the canvas within the quality profile's pixel budget; the finish fills
 * the canvas itself, so paper, grain and the print's wear stay sharp and keep their size
 * while the internal size moves with the frame rate.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly ink = new InkPass();
  private readonly bloom: UnrealBloomPass;
  private readonly finish: ShaderPass;
  private readonly smaa: SMAAPass;
  private readonly blank = new THREE.Scene();
  private readonly blankCam = new THREE.OrthographicCamera();
  resolution: Resolution = 'auto';
  quality: QualityProfile = PROFILES.high;
  /** CSS size of the fitted screen, for the UI canvas and mouse mapping. */
  cssW = SCREEN_W;
  cssH = SCREEN_H;
  onResize: (() => void) | null = null;
  /** The WebGL context came back after a loss: GPU-side caches (environment maps) must be rebuilt. */
  onContextRestored: (() => void) | null = null;
  contextLost = false;
  readonly perf: PerfMonitor;
  private readonly dyn = new DynamicResolution();
  private readonly timer: GpuTimer;
  /** GPU time of a recent frame (ms), while the monitor is on and the browser has a timer query. */
  gpuMs: number | null = null;
  /** Sizes last given to the GPU, so nothing is reallocated when they have not changed. */
  private outW = 0;
  private outH = 0;
  private inW = 0;
  private inH = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly host: HTMLElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(1);
    // counts add up over all the passes of a frame (reset in render)
    this.gl.info.autoReset = false;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.25;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.blank.background = new THREE.Color(0x000000);
    this.perf = new PerfMonitor(host);
    this.timer = new GpuTimer(this.gl.getContext());
    // the scene's depth is kept in a texture for the ink pass
    const target = new THREE.WebGLRenderTarget(SCREEN_W, SCREEN_H, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(SCREEN_W, SCREEN_H) });
    this.composer = new EffectComposer(this.gl, target);
    this.renderPass = new RenderPass(this.blank, this.blankCam);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(SCREEN_W, SCREEN_H), 0.55, 0.5, 0.82);
    // a soft knee: lights come into the bloom gradually instead of popping over the threshold
    (this.bloom as unknown as { highPassUniforms: Record<string, THREE.IUniform> }).highPassUniforms.smoothWidth.value = 0.18;
    this.finish = new ShaderPass(FinishShader);
    this.finish.uniforms.tPaper.value = washiTexture();
    this.smaa = new SMAAPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.ink);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.smaa);
    this.composer.addPass(this.finish);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('fullscreenchange', () => this.resize());
    canvas.addEventListener('webglcontextlost', (e) => {
      // without this the browser never restores the context
      e.preventDefault();
      this.contextLost = true;
      this.timer.reset();
      this.notice('繪圖裝置中斷，正在恢復… / GRAPHICS CONTEXT LOST, RESTORING…');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      // three.js rebuilds programs, textures and render targets as they are next used
      this.contextLost = false;
      this.timer.reset();
      this.notice(null);
      this.outW = this.inW = 0;
      this.resize();
      this.onContextRestored?.();
    });
    this.resize();
  }

  /** A line over the screen while the context is lost (plain DOM: the game cannot draw). */
  private notice(text: string | null): void {
    let el = this.host.querySelector<HTMLElement>('#gl-notice');
    if (!text) return el?.remove();
    if (!el) {
      el = document.createElement('div');
      el.id = 'gl-notice';
      el.style.cssText = 'position:absolute;left:0;right:0;top:45%;text-align:center;z-index:6;color:#e8d8a8;font:14px sans-serif;pointer-events:none';
      this.host.appendChild(el);
    }
    el.textContent = text;
  }

  /** Share of the profile's resolution in use: AUTO's current one, or the player's choice. */
  get scale(): number {
    return this.resolution === 'auto' ? this.dyn.scale : Number(this.resolution) / 100;
  }

  /** Fill the host (within 10:7 to 21:9) and size the canvas and the internal buffers. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const aw = Math.max(1, this.host.clientWidth), ah = Math.max(1, this.host.clientHeight);
    VIEW.w = Math.round(Math.max(SCREEN_W, Math.min(MAX_W, (aw / ah) * SCREEN_H)));
    VIEW.ox = (VIEW.w - SCREEN_W) / 2;
    const fit = Math.max(0.25, Math.min(aw / VIEW.w, ah / SCREEN_H));
    this.cssW = Math.floor(VIEW.w * fit);
    this.cssH = Math.floor(SCREEN_H * fit);
    const { outW, outH, inW, inH } = renderSize(this.cssW, this.cssH, dpr, this.quality, this.scale);
    if (outW !== this.outW || outH !== this.outH) {
      this.gl.setSize(outW, outH, false);
      this.finish.uniforms.uRes.value.set(outW, outH);
      this.finish.uniforms.uUnit.value = Math.max(1, outH / 900);
    }
    if (inW !== this.inW || inH !== this.inH) {
      this.composer.setSize(inW, inH);
      this.ink.setSize(inW, inH);
    }
    this.outW = outW;
    this.outH = outH;
    this.inW = inW;
    this.inH = inH;
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    Object.assign(this.perf.size, { renderW: inW, renderH: inH, outputW: outW, outputH: outH, dpr, scale: this.scale, quality: this.quality.id });
    this.onResize?.();
  }

  apply(resolution: Resolution, quality: QualityId, crt: boolean): void {
    const q = PROFILES[quality];
    const changed = resolution !== this.resolution || q !== this.quality;
    this.resolution = resolution;
    this.quality = q;
    this.bloom.enabled = q.bloom > 0;
    this.bloom.strength = q.bloom;
    this.smaa.enabled = q.smaa;
    this.ink.setQuality(q.aoTaps, q.creases);
    const f = this.finish.material as THREE.ShaderMaterial;
    if (!!f.defines.WORN !== q.worn) {
      if (q.worn) f.defines.WORN = '';
      else delete f.defines.WORN;
      f.needsUpdate = true;
    }
    this.finish.uniforms.uGrain.value = q.grain;
    this.finish.uniforms.uCrt.value = crt ? 1 : 0;
    if (changed) {
      this.dyn.reset(q.minScale);
      this.resize();
    }
  }

  /** AUTO render scale, fed every drawn frame with its interval (see DynamicResolution). */
  pace(ms: number, now: number): void {
    if (this.resolution !== 'auto' || this.contextLost) return;
    if (this.dyn.sample(ms, now, this.perf.enabled ? this.gpuMs : null)) this.resize();
  }

  /** `impact`: a heavy blow's smear, centre (0..1) and strength (see SceneManager.impact). */
  render(view: View | null, fade: number, flash: THREE.Vector4 | null, time: number, impact: THREE.Vector3 | null = null): void {
    if (this.contextLost) return;
    const v = view ?? { scene: this.blank, camera: this.blankCam };
    const aspect = VIEW.w / SCREEN_H;
    if (v.camera instanceof THREE.PerspectiveCamera && v.camera.aspect !== aspect) {
      v.camera.aspect = aspect;
      v.camera.updateProjectionMatrix();
    }
    this.renderPass.scene = v.scene;
    this.renderPass.camera = v.camera;
    this.ink.setCamera(v.camera);
    this.ink.setMist(v.mist ?? null, time);
    const u = this.finish.uniforms;
    u.uTime.value = time;
    u.uFade.value = fade;
    if (flash) u.uFlash.value.copy(flash);
    else u.uFlash.value.w = 0;
    if (impact) u.uImpact.value.copy(impact);
    else u.uImpact.value.z = 0;
    this.gl.info.reset();
    if (this.perf.enabled) {
      const g = this.timer.poll();
      if (g !== null) this.gpuMs = g;
      this.timer.begin();
      this.composer.render();
      this.timer.end();
    } else this.composer.render();
  }

  get gpuTimerSupported(): boolean {
    return this.timer.supported;
  }
}
