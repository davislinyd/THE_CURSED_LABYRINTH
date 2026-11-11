import type * as THREE from 'three';

/** The last `size` samples of a timing, for means and percentiles. */
export class Samples {
  private readonly buf: Float32Array;
  private n = 0;
  private at = 0;

  constructor(size = 600) {
    this.buf = new Float32Array(size);
  }

  push(v: number): void {
    this.buf[this.at] = v;
    this.at = (this.at + 1) % this.buf.length;
    if (this.n < this.buf.length) this.n++;
  }

  get count(): number {
    return this.n;
  }

  clear(): void {
    this.n = this.at = 0;
  }

  mean(): number {
    if (!this.n) return NaN;
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.buf[i];
    return s / this.n;
  }

  /** Percentiles (0..100) by nearest rank; NaN with no samples. */
  percentiles(ps: readonly number[]): number[] {
    if (!this.n) return ps.map(() => NaN);
    const sorted = Float32Array.from(this.buf.subarray(0, this.n)).sort();
    return ps.map((p) => sorted[Math.min(this.n - 1, Math.max(0, Math.ceil((p / 100) * this.n) - 1))]);
  }
}

/** What one report holds. `null` means the browser gave no such measurement (shown as N/A). */
export interface PerfReport {
  fps: number;
  frameMs: number;
  p50: number;
  p95: number;
  p99: number;
  /** CPU time of the fixed logic ticks run in a frame. */
  updateMs: number;
  /** CPU time spent submitting a frame's draw calls (not the GPU's time to draw them). */
  renderMs: number;
  /** GPU time of a frame, from a timer query. */
  gpuMs: number | null;
  drawCalls: number;
  triangles: number;
  /** Live resource counts of the renderer. These are counts, not bytes of video memory. */
  geometries: number;
  textures: number;
  programs: number;
  renderW: number;
  renderH: number;
  outputW: number;
  outputH: number;
  dpr: number;
  scale: number;
  quality: string;
  frames: number;
}

const TIME_ELAPSED = 0x88bf;
const GPU_DISJOINT = 0x8fbb;

/**
 * GPU time of a frame through EXT_disjoint_timer_query_webgl2. One query runs at a time;
 * its result arrives a few frames later and is dropped if the GPU reports a disjoint
 * (the timing was interrupted). Without the extension `supported` is false and nothing is measured.
 */
export class GpuTimer {
  supported: boolean;
  private readonly gl: WebGL2RenderingContext | null;
  private pending: WebGLQuery | null = null;
  private active: WebGLQuery | null = null;

  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl : null;
    this.gl = gl2;
    this.supported = !!gl2?.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  begin(): void {
    const gl = this.gl;
    if (!gl || !this.supported || this.pending || this.active) return;
    this.active = gl.createQuery();
    if (this.active) gl.beginQuery(TIME_ELAPSED, this.active);
  }

  end(): void {
    const gl = this.gl;
    if (!gl || !this.active) return;
    gl.endQuery(TIME_ELAPSED);
    this.pending = this.active;
    this.active = null;
  }

  /** The finished query's time in ms, once; null while none is ready. */
  poll(): number | null {
    const gl = this.gl, q = this.pending;
    if (!gl || !q) return null;
    if (!gl.isQuery(q)) {
      this.pending = null;
      return null;
    }
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return null;
    const disjoint = gl.getParameter(GPU_DISJOINT) as boolean;
    const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
    gl.deleteQuery(q);
    this.pending = null;
    return disjoint ? null : ns / 1e6;
  }

  /** A lost context takes its queries with it; a restored one has to be asked for the extension again. */
  reset(): void {
    this.pending = this.active = null;
    this.supported = !!this.gl && !this.gl.isContextLost() && !!this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }
}

const fmt = (v: number | null, digits = 1) => (v === null || Number.isNaN(v) ? 'N/A' : v.toFixed(digits));

/**
 * Frame timing and renderer counts, off unless switched on (F3, or ?perf in the address):
 * while off it costs one branch a frame. Frame time is the interval between drawn frames;
 * update and render are CPU times on the main thread; GPU time comes from a timer query
 * where the browser has one.
 */
export class PerfMonitor {
  enabled = false;
  readonly frame = new Samples();
  readonly update = new Samples();
  readonly render = new Samples();
  readonly gpu = new Samples();
  private el: HTMLElement | null = null;
  private shown = 0;
  private calls = 0;
  private tris = 0;
  /** Filled by the renderer each frame. */
  size = { renderW: 0, renderH: 0, outputW: 0, outputH: 0, dpr: 1, scale: 1, quality: '' };

  constructor(private readonly host: HTMLElement | null = null) {}

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.el?.remove();
      this.el = null;
      return;
    }
    this.clear();
    if (this.host && !this.el) {
      const el = (this.el = document.createElement('pre'));
      el.id = 'perf';
      el.style.cssText = 'position:absolute;left:6px;top:6px;margin:0;padding:6px 8px;z-index:5;pointer-events:none;' +
        'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#d8e0c0;background:rgba(0,0,0,0.72);border:1px solid #6e5a33;white-space:pre';
      this.host.appendChild(el);
    }
  }

  clear(): void {
    for (const s of [this.frame, this.update, this.render, this.gpu]) s.clear();
  }

  /** One drawn frame: its interval and the CPU times of its logic ticks and its draw submission (ms). */
  sample(frameMs: number, updateMs: number, renderMs: number, gpuMs: number | null, info: THREE.WebGLInfo): void {
    if (!this.enabled) return;
    // a pause (tab switch) is not a frame
    if (frameMs < 250) this.frame.push(frameMs);
    this.update.push(updateMs);
    this.render.push(renderMs);
    if (gpuMs !== null) this.gpu.push(gpuMs);
    this.calls = info.render.calls;
    this.tris = info.render.triangles;
    if (this.el && ++this.shown % 15 === 0) this.el.textContent = this.text(info);
  }

  report(info: THREE.WebGLInfo): PerfReport {
    const [p50, p95, p99] = this.frame.percentiles([50, 95, 99]);
    const mean = this.frame.mean();
    return {
      fps: 1000 / mean, frameMs: mean, p50, p95, p99,
      updateMs: this.update.mean(), renderMs: this.render.mean(),
      gpuMs: this.gpu.count ? this.gpu.mean() : null,
      drawCalls: this.calls, triangles: this.tris,
      geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
      ...this.size, frames: this.frame.count,
    };
  }

  private text(info: THREE.WebGLInfo): string {
    const r = this.report(info);
    return [
      `${r.quality.toUpperCase()}  ${fmt(r.fps, 0)} fps`,
      `frame  ${fmt(r.frameMs, 2)} ms  p50 ${fmt(r.p50)}  p95 ${fmt(r.p95)}  p99 ${fmt(r.p99)}`,
      `cpu    update ${fmt(r.updateMs, 2)} ms  render ${fmt(r.renderMs, 2)} ms`,
      `gpu    ${fmt(r.gpuMs, 2)}${r.gpuMs === null ? '' : ' ms'}`,
      `draw   ${r.drawCalls} calls  ${r.triangles} tris`,
      `res    ${r.renderW}x${r.renderH} -> ${r.outputW}x${r.outputH}  dpr ${fmt(r.dpr, 2)}  scale ${fmt(r.scale, 2)}`,
      `count  ${r.geometries} geometries  ${r.textures} textures  ${r.programs} programs`,
    ].join('\n');
  }
}
