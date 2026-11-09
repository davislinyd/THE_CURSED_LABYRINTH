import { SCREEN_H, SCREEN_W } from './PixelRenderer';

export type Scanlines = 0 | 1 | 2;

/**
 * Scales the 256x240 back buffer to the page with nearest-neighbour sampling.
 * Integer scales are preferred so every source pixel maps to an equal block.
 */
export class Display {
  readonly lowres: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  scanlines: Scanlines = 1;
  /** 1 = square pixels, 8/7 = NTSC pixel aspect ratio. */
  pixelAspect = 1;
  private dw = 0;
  private dh = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly host: HTMLElement) {
    this.lowres = document.createElement('canvas');
    this.lowres.width = SCREEN_W;
    this.lowres.height = SCREEN_H;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('fullscreenchange', () => this.resize());
    this.resize();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const availW = this.host.clientWidth * dpr;
    const availH = this.host.clientHeight * dpr;
    const srcW = SCREEN_W * this.pixelAspect;
    let scale = Math.min(availW / srcW, availH / SCREEN_H);
    if (scale >= 2) scale = Math.floor(scale);
    scale = Math.max(1, scale);
    this.dw = Math.round(srcW * scale);
    this.dh = Math.round(SCREEN_H * scale);
    this.canvas.width = this.dw;
    this.canvas.height = this.dh;
    this.canvas.style.width = `${this.dw / dpr}px`;
    this.canvas.style.height = `${this.dh / dpr}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  present(): void {
    const { ctx, dw, dh } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.lowres, 0, 0, dw, dh);
    if (this.scanlines > 0) {
      const sy = dh / SCREEN_H;
      if (sy >= 2) {
        ctx.fillStyle = this.scanlines === 1 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.38)';
        const lh = Math.max(1, Math.floor(sy / 3));
        for (let y = 0; y < SCREEN_H; y++) ctx.fillRect(0, Math.floor((y + 1) * sy) - lh, dw, lh);
      }
    }
  }

  lowresContext(): CanvasRenderingContext2D {
    return this.lowres.getContext('2d', { alpha: false })!;
  }
}
