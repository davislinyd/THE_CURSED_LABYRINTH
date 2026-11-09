import type { InputManager, Vec2 } from '../core/InputManager';
import { rng } from '../engine/ProcTex';
import { SCREEN_H, VIEW } from '../engine/Renderer';
import { wrapText } from './Text';

/** Palette of the interface: black lacquer, aged gold, blood red, parchment. */
export const COL = {
  ink: 'rgba(6, 5, 9, 0.84)',
  inkSolid: '#07060a',
  gold: '#c9a55c',
  goldLight: '#f1dc9f',
  goldDim: '#6e5a33',
  red: '#c0281e',
  crimson: '#7d1010',
  text: '#ece4d3',
  gray: '#8d867a',
  dim: '#57524a',
  blue: '#7fb2ff',
  life: '#b8231b',
  lifeHi: '#ff6a4a',
};

export const FAMILY = 'Cinzel, "Noto Serif TC", serif';

/** Dyed paper grain shared by every panel: blotches and fibres, mostly transparent so the panel colour shows. */
let PAPER: HTMLCanvasElement | null = null;
function paper(): HTMLCanvasElement {
  if (PAPER) return PAPER;
  const c = (PAPER = document.createElement('canvas'));
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = rng(5150);
  for (let i = 0; i < 70; i++) {
    const px = r() * 256, py = r() * 256, rad = 14 + r() * 40, warm = r() < 0.5;
    const grad = g.createRadialGradient(px, py, 0, px, py, rad);
    grad.addColorStop(0, warm ? 'rgba(120, 80, 40, 0.10)' : 'rgba(10, 14, 40, 0.14)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 700; i++) {
    const px = r() * 256, py = r() * 256, a = r() * Math.PI * 2, len = 4 + r() * 14;
    g.strokeStyle = r() < 0.6 ? `rgba(220, 200, 160, ${0.03 + r() * 0.05})` : `rgba(0, 0, 0, ${0.06 + r() * 0.08})`;
    g.lineWidth = 0.5 + r() * 0.5;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
    g.stroke();
  }
  return c;
}

/** Layout of a vertical `menu()`; the same options give its rows to the mouse (`rowAt`). */
export interface MenuOpts {
  pitch?: number;
  size?: number;
  width?: number;
  disabled?: boolean[];
  align?: CanvasTextAlign;
}

/** The row of a `menu(items, x, y, cursor, o)` with `n` items under point `p`, or -1. */
export function rowAt(p: Vec2 | null, n: number, x: number, y: number, o: MenuOpts = {}): number {
  if (!p) return -1;
  const pitch = o.pitch ?? 30, size = o.size ?? 18, width = o.width ?? 200;
  const left = o.align === 'center' ? x - width / 2 : x;
  // each row owns a full pitch, centred on its highlight band
  const top = y - size * 0.95 - (pitch - size * 1.3) / 2;
  const i = Math.floor((p.y - top) / pitch);
  return p.x >= left && p.x <= left + width && i >= 0 && i < n ? i : -1;
}

/** Mouse over a menu: `hover` is the row under a pointer that moved this tick, `click` the row clicked. */
export function menuMouse(inp: InputManager, n: number, x: number, y: number, o: MenuOpts = {}): { hover: number; click: number } {
  const i = rowAt(inp.mouse, n, x, y, o);
  const ok = i >= 0 && !o.disabled?.[i];
  return { hover: ok && inp.mouseMoved ? i : -1, click: inp.mouseLeft ? (ok ? i : i >= 0 ? -2 : -1) : -1 };
}

/** Is point `p` inside the rectangle? */
export function inRect(p: Vec2 | null, x: number, y: number, w: number, h: number): boolean {
  return !!p && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
}

export interface TextOpts {
  size?: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  /** Soft drop shadow (default on). */
  shadow?: boolean;
  /** Coloured glow around the letters. */
  glow?: string;
  /** Letter spacing in px. */
  spacing?: number;
  alpha?: number;
}

/**
 * The 2D interface layer: a canvas over the 3D view, laid out in logical units
 * (448 tall) but backed at the display resolution so text stays sharp. x = 0..640
 * is the safe area centred on the screen; `left` / `right` are the screen's edges.
 */
export class UI {
  readonly ctx: CanvasRenderingContext2D;
  frame = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(cssW: number, cssH: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }

  /** Left edge of the screen in safe-area units (0 at 10:7, negative on wider screens). */
  get left(): number {
    return -VIEW.ox;
  }

  /** Right edge of the screen in safe-area units. */
  get right(): number {
    return VIEW.w - VIEW.ox;
  }

  begin(): void {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = canvas.height / SCREEN_H;
    ctx.setTransform(k, 0, 0, k, VIEW.ox * k, 0);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  font(size = 16, weight = 500): string {
    return `${weight} ${size}px ${FAMILY}`;
  }

  measure(s: string, size = 16, weight = 500, spacing = 0): number {
    this.ctx.font = this.font(size, weight);
    return this.ctx.measureText(s).width + spacing * [...s].length;
  }

  wrap(s: string, width: number, size = 16, weight = 500): string[] {
    this.ctx.font = this.font(size, weight);
    return wrapText(s, width, (x) => this.ctx.measureText(x).width);
  }

  /** Text with its baseline at y. */
  text(s: string, x: number, y: number, o: TextOpts = {}): void {
    const ctx = this.ctx;
    const size = o.size ?? 16;
    ctx.save();
    ctx.font = this.font(size, o.weight ?? 500);
    ctx.textAlign = o.align ?? 'left';
    ctx.globalAlpha = o.alpha ?? 1;
    if (o.spacing) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing}px`;
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = size * 0.6;
      ctx.fillStyle = o.glow;
      ctx.fillText(s, x, y);
    }
    if (o.shadow !== false) {
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1.5;
    }
    ctx.fillStyle = o.color ?? COL.text;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  fill(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /**
   * A panel of dyed, stained washi in a hand-brushed frame: dark indigo-brown paper with
   * fibres and blotches, a wavering ink border, a thinner gold rule inside and diamonds at the corners.
   * Panels of one size keep the same grain, so nothing shimmers from frame to frame.
   */
  panel(x: number, y: number, w: number, h: number, accent = COL.gold): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(8, 6, 9, 0.9)';
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(34, 26, 28, 0.9)');
    g.addColorStop(1, 'rgba(12, 9, 12, 0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    ctx.fillStyle = ctx.createPattern(paper(), 'repeat')!;
    ctx.fillRect(0, 0, w, h);
    ctx.translate(-x, -y);
    // the brush frame: an ink band along each side whose inner edge wavers
    const r = rng((w * 31 + h * 17) | 0);
    ctx.fillStyle = 'rgba(2, 1, 3, 0.9)';
    const strip = (x0: number, y0: number, dx: number, dy: number, nx: number, ny: number, len: number) => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      let k = 0;
      for (let t = 0; t <= len; t += 6) {
        k = Math.max(-1.6, Math.min(1.6, k + (r() - 0.5) * 0.9));
        ctx.lineTo(x0 + dx * t + nx * (3.2 + k), y0 + dy * t + ny * (3.2 + k));
      }
      ctx.lineTo(x0 + dx * len, y0 + dy * len);
      ctx.closePath();
      ctx.fill();
    };
    strip(x, y, 1, 0, 0, 1, w);
    strip(x, y + h, 1, 0, 0, -1, w);
    strip(x, y, 0, 1, 1, 0, h);
    strip(x + w, y, 0, 1, -1, 0, h);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.85;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.globalAlpha = 0.4;
    ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    ctx.globalAlpha = 1;
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) this.diamond(cx, cy, 4, accent);
    ctx.restore();
  }

  diamond(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }

  /** Horizontal gauge with a dark trough and a bright top edge. */
  gauge(x: number, y: number, w: number, h: number, frac: number, color: string, hi: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    const fw = Math.max(0, Math.min(1, frac)) * w;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, hi);
    g.addColorStop(0.45, color);
    g.addColorStop(1, '#1a0606');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, fw, h);
    ctx.strokeStyle = COL.goldDim;
    ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  }

  /**
   * Vertical menu. The selected row gets a red brush band and a flickering
   * diamond; disabled rows are dimmed.
   */
  menu(items: string[], x: number, y: number, cursor: number, o: MenuOpts = {}): void {
    const pitch = o.pitch ?? 30, size = o.size ?? 18, width = o.width ?? 200;
    const align = o.align ?? 'left';
    items.forEach((it, i) => {
      const yy = y + i * pitch;
      const left = align === 'center' ? x - width / 2 : x;
      if (i === cursor) {
        const g = this.ctx.createLinearGradient(left, 0, left + width, 0);
        g.addColorStop(0, 'rgba(160, 24, 18, 0)');
        g.addColorStop(0.2, 'rgba(160, 24, 18, 0.55)');
        g.addColorStop(0.8, 'rgba(160, 24, 18, 0.55)');
        g.addColorStop(1, 'rgba(160, 24, 18, 0)');
        this.ctx.fillStyle = g;
        this.ctx.fillRect(left, yy - size * 0.95, width, size * 1.3);
        const flick = 0.75 + 0.25 * Math.sin(this.frame * 0.25);
        this.ctx.globalAlpha = flick;
        this.diamond(left + 10, yy - size * 0.32, 4.5, COL.goldLight);
        this.ctx.globalAlpha = 1;
      }
      const tx = align === 'center' ? x : x + 26;
      this.text(it, tx, yy, { size, align, color: o.disabled?.[i] ? COL.dim : i === cursor ? COL.goldLight : COL.text });
    });
  }

  /** Full-screen black veil (fades). */
  veil(alpha: number): void {
    if (alpha <= 0) return;
    this.ctx.globalAlpha = Math.min(1, alpha);
    this.fill(this.left, 0, VIEW.w, SCREEN_H, '#000');
    this.ctx.globalAlpha = 1;
  }

  /**
   * A brush cut across the whole screen: an ink stroke rising to the right that
   * lands hard and thins to a frayed flick, with a white-hot line through it,
   * swept in fast, then fading. `k` is 0..1 of its life; `seed` shapes it.
   */
  brushCut(k: number, seed: number): void {
    const ctx = this.ctx, r = rng(seed);
    const drawn = Math.min(1, k / 0.16), fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
    const ang = -0.3 + (r() - 0.5) * 0.24, cy = 214 + (r() - 0.5) * 50;
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    // both ends on screen: the brush lands left and flicks off right
    const half = ((this.right - this.left) / 2 - 36) / dx, len = half * 2 * drawn;
    const x0 = 320 - dx * half, y0 = cy - dy * half;
    const at = (u: number, off: number): [number, number] => [x0 + dx * len * u + nx * off, y0 + dy * len * u + ny * off];
    const W = 64, ph = [r() * 6, r() * 6, r() * 6, r() * 6];
    const width = (u: number) => W * Math.min(1, u / 0.06) ** 0.5 * Math.max(0, 1 - u) ** 0.8;
    // the edges waver like a loaded brush
    const edge = (u: number, i: number) => 1 + 0.12 * Math.sin(u * 17 + ph[i]) + 0.06 * Math.sin(u * 53 + ph[i + 2]);
    const N = 64;
    ctx.save();
    ctx.globalAlpha = 0.95 * fade;
    ctx.fillStyle = ctx.strokeStyle = '#0a0706';
    ctx.beginPath();
    for (let i = 0; i <= N; i++) ctx.lineTo(...at(i / N, (width(i / N) * edge(i / N, 0)) / 2));
    for (let i = N; i >= 0; i--) ctx.lineTo(...at(i / N, (-width(i / N) * edge(i / N, 1)) / 2));
    ctx.fill();
    // dry bristles fraying off the tail
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const u0 = 0.35 + r() * 0.4, u1 = Math.min(1.04, u0 + 0.15 + r() * 0.35), off = (r() - 0.5) * 1.1 * width(u0);
      ctx.lineWidth = 0.6 + r() * 1.6;
      ctx.beginPath();
      ctx.moveTo(...at(u0, off));
      ctx.lineTo(...at(u1, off * 0.8));
      ctx.stroke();
    }
    // ink thrown where the brush landed
    for (let i = 0; i < 10; i++) {
      const [x, y] = at(r() * 0.25, (r() < 0.5 ? -1 : 1) * W * (0.55 + r() * 0.8));
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + r() * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // the cut itself: a white-hot line through the ink, a vermilion thread beside it
    ctx.globalAlpha = fade;
    ctx.shadowColor = '#ff7040';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#fff4e2';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(...at(0.02, -W * 0.08));
    ctx.lineTo(...at(0.9, 0));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = COL.red;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(...at(0.05, W * 0.12));
    ctx.lineTo(...at(0.8, W * 0.04));
    ctx.stroke();
    ctx.restore();
  }
}
