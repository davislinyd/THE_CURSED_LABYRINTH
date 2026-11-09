import { C, FADE_MAPS, IDENTITY_MAP, PAL_RGBA } from './Palette';
import { Sprite } from './Sprite';
import { glyph, measure, zhGlyph, CHAR_W, ZH_H, ZH_TOP, ZH_W } from './Font';

export const SCREEN_W = 256;
export const SCREEN_H = 240;

/**
 * Indexed-colour framebuffer. Every primitive writes master-palette indices,
 * never RGB, so fades and flashes are pure palette remaps like on hardware.
 */
export class PixelRenderer {
  readonly w = SCREEN_W;
  readonly h = SCREEN_H;
  readonly buf = new Uint8Array(SCREEN_W * SCREEN_H);
  private readonly image: ImageData;
  private readonly out: Uint32Array;
  /** Palette remap applied when presenting (fade / flash). */
  remap: Uint8Array = IDENTITY_MAP;
  // clip rect
  cx0 = 0;
  cy0 = 0;
  cx1 = SCREEN_W;
  cy1 = SCREEN_H;
  /** Per-scanline hardware-sprite budget for flicker emulation. */
  readonly lineSprites = new Uint8Array(SCREEN_H);
  spriteLimit = 0; // 0 = unlimited

  constructor(private readonly ctx: CanvasRenderingContext2D) {
    this.image = ctx.createImageData(SCREEN_W, SCREEN_H);
    this.out = new Uint32Array(this.image.data.buffer);
  }

  setFade(level: number): void {
    this.remap = FADE_MAPS[Math.max(0, Math.min(4, level | 0))];
  }

  clip(x: number, y: number, w: number, h: number): void {
    this.cx0 = Math.max(0, x);
    this.cy0 = Math.max(0, y);
    this.cx1 = Math.min(SCREEN_W, x + w);
    this.cy1 = Math.min(SCREEN_H, y + h);
  }

  unclip(): void {
    this.cx0 = 0;
    this.cy0 = 0;
    this.cx1 = SCREEN_W;
    this.cy1 = SCREEN_H;
  }

  beginFrame(): void {
    this.lineSprites.fill(0);
  }

  clear(c: number = C.BLACK): void {
    this.buf.fill(c);
  }

  pset(x: number, y: number, c: number): void {
    x |= 0;
    y |= 0;
    if (x < this.cx0 || y < this.cy0 || x >= this.cx1 || y >= this.cy1) return;
    this.buf[y * SCREEN_W + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    let x0 = x | 0, y0 = y | 0, x1 = (x + w) | 0, y1 = (y + h) | 0;
    if (x0 < this.cx0) x0 = this.cx0;
    if (y0 < this.cy0) y0 = this.cy0;
    if (x1 > this.cx1) x1 = this.cx1;
    if (y1 > this.cy1) y1 = this.cy1;
    for (let yy = y0; yy < y1; yy++) this.buf.fill(c, yy * SCREEN_W + x0, yy * SCREEN_W + Math.max(x0, x1));
  }

  /** Ordered-dither fill: pixels where (x+y) is odd get colour b. */
  ditherRect(x: number, y: number, w: number, h: number, a: number, b: number): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.pset(xx, yy, (xx + yy) & 1 ? b : a);
  }

  hline(x0: number, x1: number, y: number, c: number): void {
    if (x1 < x0) [x0, x1] = [x1, x0];
    this.rect(x0, y, x1 - x0 + 1, 1, c);
  }

  vline(x: number, y0: number, y1: number, c: number): void {
    if (y1 < y0) [y0, y1] = [y1, y0];
    this.rect(x, y0, 1, y1 - y0 + 1, c);
  }

  /** Integer Bresenham line: gives proper pixel staircases on slanted edges. */
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    x0 |= 0;
    y0 |= 0;
    x1 |= 0;
    y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.pset(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  frame(x: number, y: number, w: number, h: number, c: number): void {
    this.hline(x, x + w - 1, y, c);
    this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c);
    this.vline(x + w - 1, y, y + h - 1, c);
  }

  /**
   * Draw a sprite. pal[n-1] supplies colour for pixel value n.
   * hw > 0 makes the sprite obey the per-scanline sprite budget (flicker).
   */
  sprite(s: Sprite, x: number, y: number, pal: readonly number[], flip = false, hw = 0): void {
    x |= 0;
    y |= 0;
    const { w, h, px } = s;
    for (let yy = 0; yy < h; yy++) {
      const sy = y + yy;
      if (sy < this.cy0 || sy >= this.cy1) continue;
      if (hw > 0 && this.spriteLimit > 0) {
        if (this.lineSprites[sy] + hw > this.spriteLimit) continue;
        this.lineSprites[sy] += hw;
      }
      const row = yy * w;
      const base = sy * SCREEN_W;
      for (let xx = 0; xx < w; xx++) {
        const v = px[row + (flip ? w - 1 - xx : xx)];
        if (!v) continue;
        const sx = x + xx;
        if (sx < this.cx0 || sx >= this.cx1) continue;
        this.buf[base + sx] = pal[v - 1];
      }
    }
  }

  /** Nearest-neighbour scaled sprite (used for pre-sized objects in the 3D view). */
  spriteScaled(s: Sprite, x: number, y: number, dw: number, dh: number, pal: readonly number[], flip = false): void {
    x |= 0;
    y |= 0;
    dw |= 0;
    dh |= 0;
    if (dw <= 0 || dh <= 0) return;
    for (let yy = 0; yy < dh; yy++) {
      const sy = y + yy;
      if (sy < this.cy0 || sy >= this.cy1) continue;
      const srcY = ((yy * s.h) / dh) | 0;
      for (let xx = 0; xx < dw; xx++) {
        const sx = x + xx;
        if (sx < this.cx0 || sx >= this.cx1) continue;
        let srcX = ((xx * s.w) / dw) | 0;
        if (flip) srcX = s.w - 1 - srcX;
        const v = s.px[srcY * s.w + srcX];
        if (v) this.buf[sy * SCREEN_W + sx] = pal[v - 1];
      }
    }
  }

  /** Solid silhouette of a sprite (hit flash, shadows). */
  silhouette(s: Sprite, x: number, y: number, c: number, flip = false): void {
    const pal = [c, c, c, c, c, c, c, c, c];
    this.sprite(s, x, y, pal, flip);
  }

  text(str: string, x: number, y: number, c: number, bold = true): void {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      if (ch === '\n') {
        cx = x;
        y += 8;
        continue;
      }
      const zh = zhGlyph(ch);
      if (zh) {
        for (let r = 0; r < ZH_H; r++) {
          const m = zh[r];
          if (!m) continue;
          for (let b = 0; b < ZH_W; b++) if (m & (0x800 >> b)) this.pset(cx + b, y + ZH_TOP + r, c);
        }
        cx += ZH_W;
        continue;
      }
      const rows = glyph(ch, bold);
      for (let r = 0; r < 8; r++) {
        const m = rows[r];
        if (!m) continue;
        for (let b = 0; b < 8; b++) if (m & (0x80 >> b)) this.pset(cx + b, y + r, c);
      }
      cx += CHAR_W;
    }
  }

  /** Text with a 1px drop shadow, for legibility over busy backgrounds. */
  textShadow(str: string, x: number, y: number, c: number, shadow: number = C.BLACK): void {
    this.text(str, x + 1, y + 1, shadow);
    this.text(str, x, y, c);
  }

  textCenter(str: string, y: number, c: number, cx = SCREEN_W / 2): void {
    this.text(str, Math.round(cx - measure(str) / 2), y, c);
  }

  /** Text whose right edge ends at x. */
  textRight(str: string, x: number, y: number, c: number): void {
    this.text(str, x - measure(str), y, c);
  }

  /** Simple FC-style window: black fill, double rule border. */
  window(x: number, y: number, w: number, h: number, border: number = C.WHITE, fill: number = C.BLACK): void {
    this.rect(x, y, w, h, fill);
    this.frame(x + 1, y + 1, w - 2, h - 2, border);
    this.frame(x + 3, y + 3, w - 6, h - 6, border);
  }

  present(): void {
    const { buf, out, remap } = this;
    for (let i = 0; i < buf.length; i++) out[i] = PAL_RGBA[remap[buf[i]]];
    this.ctx.putImageData(this.image, 0, 0);
  }
}
