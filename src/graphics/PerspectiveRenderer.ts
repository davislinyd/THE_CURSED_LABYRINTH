import { DX, DY, Dir } from '../core/GameState';
import { Dungeon, Face, FloorObj, key } from '../world/DungeonMap';
import { C } from './Palette';
import { PixelRenderer } from './PixelRenderer';
import { THEMES, Theme, faceTexture, lodFor } from './DungeonTextures';
import { Sprite } from './Sprite';

// View window inside the 256x240 screen.
export const VIEW = { x: 16, y: 40, w: 224, h: 160 };
const CX = 128;
const CY = 114;
const W0 = 128;
const R = 0.6; // each cell deeper shrinks the cross-section to 60%
const LN_R = Math.log(R);
const UP = 0.8;
const DOWN = 0.72;
const LAT = 3;

/** Half-width of the corridor cross-section at (possibly fractional) depth k. */
export const halfW = (k: number) => W0 * Math.pow(R, k);
const depthOf = (w: number) => Math.log(w / W0) / LN_R;
export const topAt = (k: number) => CY - UP * halfW(k);
export const botAt = (k: number) => CY + DOWN * halfW(k);

export interface ObjectSprites {
  chest: Sprite;
  wisp: [Sprite, Sprite];
  spirit: Sprite;
  spikes: Sprite;
}

export interface ViewState {
  dungeon: Dungeon;
  x: number;
  y: number;
  dir: Dir;
  /** Camera advanced this many cells beyond (x, y) — used for the half-step walk frame. */
  offset: number;
  /** Rows of cells rendered (visibility distance). */
  depth: number;
  /** Fog steps per row. */
  fog: number[];
  frame: number;
  mirror: boolean;
  doorHp: Map<string, number>;
  flashCell: string | null;
}

/** FC-style darkening that keeps the darkest row alive one extra step. */
function fog(c: number, s: number): number {
  let v = c;
  for (let i = 0; i < s; i++) {
    if (v === C.BLACK) return v;
    if (v >= 0x10) v -= 0x10;
    else if (s - i >= 2) return C.BLACK;
  }
  return v;
}

/**
 * Grid-based pseudo-3D corridor renderer. Cells ahead are drawn far-to-near
 * and outside-in (painter's algorithm), using fixed per-depth cross-sections
 * and pre-sized face textures: depth changes in clear steps, never smoothly.
 */
export class PerspectiveRenderer {
  constructor(private readonly sprites: ObjectSprites) {}

  render(r: PixelRenderer, s: ViewState): void {
    const theme = THEMES[s.dungeon.def.theme];
    r.clip(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    r.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h, C.BLACK);
    this.floorAndCeiling(r, s, theme);
    for (let j = s.depth - 1; j >= 0; j--) {
      const order = [-3, -2, -1, 3, 2, 1, 0].filter((l) => Math.abs(l) <= LAT);
      for (const l of order) this.cell(r, s, theme, j, l);
    }
    r.unclip();
  }

  private world(s: ViewState, j: number, l: number): [number, number] {
    const f = s.dir, rt = (s.dir + 1) % 4;
    return [s.x + DX[f] * j + DX[rt] * l, s.y + DY[f] * j + DY[rt] * l];
  }

  private floorAndCeiling(r: PixelRenderer, s: ViewState, th: Theme): void {
    const kMin = -s.offset;
    const kMax = s.depth - s.offset;
    const fogAt = (k: number) => s.fog[Math.max(0, Math.min(s.fog.length - 1, Math.floor(k + s.offset)))];
    for (let y = VIEW.y; y < VIEW.y + VIEW.h; y++) {
      const floor = y >= CY;
      const w = floor ? (y + 0.5 - CY) / DOWN : (CY - (y + 0.5)) / UP;
      if (w <= 0) continue;
      const k = depthOf(w);
      if (k > kMax || k < kMin - 2) continue;
      const kk = k + s.offset; // depth relative to the player's cell
      const row = Math.floor(kk);
      const f = fogAt(kk);
      const pal = floor ? th.floor : th.ceil;
      // Grid line on the cell boundary nearest to this scanline.
      const yb = Math.round(floor ? botAt(row - s.offset) : topAt(row - s.offset));
      const boundary = y === yb && row > 0;
      for (let x = VIEW.x; x < VIEW.x + VIEW.w; x++) {
        const lf = (x + 0.5 - CX) / (2 * w) + 0.5;
        const l = Math.floor(lf);
        const edge = Math.abs(lf - Math.round(lf)) * 2 * w < 0.5;
        let c: number;
        if (boundary || edge) c = pal[2];
        else {
          const [wx, wy] = this.world(s, row, l);
          const odd = (wx + wy) & 1;
          c = odd ? ((x + y) & 1 ? pal[1] : pal[0]) : pal[0];
        }
        r.buf[y * 256 + x] = fog(c, f);
      }
    }
  }

  private shadeNear(s: ViewState, j: number): number {
    return s.fog[Math.min(j, s.fog.length - 1)];
  }

  private faceVariant(s: ViewState, face: Face, wx: number, wy: number): [string, number] {
    switch (face) {
      case 'breakable':
        return ['breakable', s.doorHp.get(key(wx, wy)) ?? 3];
      case 'lever': {
        const c = s.dungeon.ch(wx, wy);
        return ['lever', s.dungeon.lever(c === '=' ? 0 : 1) ? 1 : 0];
      }
      case 'fake':
        return s.mirror ? ['fake', (s.frame >> 2) & 7] : ['wall', 0];
      default:
        return [face, 0];
    }
  }

  private cell(r: PixelRenderer, s: ViewState, th: Theme, j: number, l: number): void {
    const [wx, wy] = this.world(s, j, l);
    const face = s.dungeon.visualFace(wx, wy);
    const kNear = j - s.offset;
    if (face) {
      const [fname, variant] = this.faceVariant(s, face, wx, wy);
      const flash = s.flashCell === key(wx, wy) && (s.frame & 2) !== 0;
      if (l !== 0) {
        const [ix, iy] = this.world(s, j, l + (l < 0 ? 1 : -1));
        if (!s.dungeon.visualFace(ix, iy)) this.side(r, s, th, j, l, fname, variant, flash);
      }
      if (j > 0) {
        const [nx, ny] = this.world(s, j - 1, l);
        if (!s.dungeon.visualFace(nx, ny) && kNear > 0) this.front(r, s, th, j, l, fname, variant, flash);
      }
      return;
    }
    if (l !== 0 || kNear + 0.5 <= 0.15) return;
    // Open cell straight ahead: door frames and objects standing in it.
    if (j > 0 && (s.dungeon.opened(wx, wy) || s.dungeon.openGate(wx, wy))) this.archway(r, s, th, j, s.dungeon.openGate(wx, wy));
    const obj = s.dungeon.floorObj(wx, wy);
    if (obj) this.object(r, s, j, obj);
    if (s.dungeon.isNpc(wx, wy)) this.npc(r, s, j);
  }

  private front(r: PixelRenderer, s: ViewState, th: Theme, j: number, l: number, face: string, variant: number, flash: boolean): void {
    const k = j - s.offset;
    const w = halfW(k);
    const x0 = Math.round(CX + (2 * l - 1) * w), x1 = Math.round(CX + (2 * l + 1) * w);
    const y0 = Math.round(topAt(k)), y1 = Math.round(botAt(k));
    if (x1 <= VIEW.x || x0 >= VIEW.x + VIEW.w) return;
    const tex = faceTexture(s.dungeon.def.theme, face, variant, lodFor(x1 - x0));
    const f = this.shadeNear(s, j);
    const lut = th.pal.map((c) => (flash ? C.WHITE : fog(c, f)));
    const cx0 = Math.max(x0, r.cx0), cx1 = Math.min(x1, r.cx1);
    const cy0 = Math.max(y0, r.cy0), cy1 = Math.min(y1, r.cy1);
    for (let y = cy0; y < cy1; y++) {
      const ty = Math.min(tex.h - 1, Math.floor(((y - y0) * tex.h) / (y1 - y0)));
      const row = ty * tex.w;
      for (let x = cx0; x < cx1; x++) {
        const tx = Math.min(tex.w - 1, Math.floor(((x - x0) * tex.w) / (x1 - x0)));
        r.buf[y * 256 + x] = lut[tex.px[row + tx]];
      }
    }
    const edge = fog(C.BLACK, 0);
    r.frame(x0, y0, x1 - x0, y1 - y0, edge);
  }

  private side(r: PixelRenderer, s: ViewState, th: Theme, j: number, l: number, face: string, variant: number, flash: boolean): void {
    const e = l < 0 ? 2 * l + 1 : 2 * l - 1; // signed edge multiplier facing the corridor
    const kN = j - s.offset, kF = j + 1 - s.offset;
    const xn = CX + e * halfW(Math.max(kN, -1.2)), xf = CX + e * halfW(kF);
    const xa = Math.round(Math.min(xn, xf)), xb = Math.round(Math.max(xn, xf));
    if (xb <= VIEW.x || xa >= VIEW.x + VIEW.w) return;
    const tex = faceTexture(s.dungeon.def.theme, face, variant, lodFor(Math.abs(xn - xf) * 1.6));
    const fN = this.shadeNear(s, j) + 1, fF = this.shadeNear(s, j + 1) + 1;
    const lutN = th.pal.map((c) => (flash ? C.WHITE : fog(c, fN)));
    const lutF = th.pal.map((c) => (flash ? C.WHITE : fog(c, fF)));
    const x0 = Math.max(xa, r.cx0), x1 = Math.min(xb, r.cx1);
    for (let x = x0; x < x1; x++) {
      const w = (x + 0.5 - CX) / e;
      if (w <= 0) continue;
      const k = depthOf(w);
      const u = Math.max(0, Math.min(0.9999, k - kN));
      const ytop = CY - UP * w, ybot = CY + DOWN * w;
      const tx = Math.floor(u * tex.w);
      const lut = u < 0.4 ? lutN : u > 0.7 ? lutF : null;
      const y0 = Math.max(Math.round(ytop), r.cy0), y1 = Math.min(Math.round(ybot), r.cy1);
      for (let y = y0; y < y1; y++) {
        const v = (y + 0.5 - ytop) / (ybot - ytop);
        const ty = Math.min(tex.h - 1, Math.max(0, Math.floor(v * tex.h)));
        const t = tex.px[ty * tex.w + tx];
        const L = lut ?? ((x + y) & 1 ? lutF : lutN);
        r.buf[y * 256 + x] = L[t];
      }
    }
    // Perspective edges: vertical near/far lines and slanted top/bottom.
    const ink = C.BLACK;
    r.line(Math.round(xn), Math.round(CY - UP * Math.abs((xn - CX) / e)), Math.round(xf), Math.round(topAt(kF)), ink);
    r.line(Math.round(xn), Math.round(CY + DOWN * Math.abs((xn - CX) / e)), Math.round(xf), Math.round(botAt(kF)), ink);
    r.vline(Math.round(xf), Math.round(topAt(kF)), Math.round(botAt(kF)), ink);
  }

  /** Frame of an opened door or raised gate, seen head-on. */
  private archway(r: PixelRenderer, s: ViewState, th: Theme, j: number, gate: boolean): void {
    const k = j - s.offset;
    const w = halfW(k);
    const x0 = Math.round(CX - w), x1 = Math.round(CX + w);
    const y0 = Math.round(topAt(k)), y1 = Math.round(botAt(k));
    const f = this.shadeNear(s, j);
    const post = Math.max(1, Math.round(w * 0.16));
    const lintel = Math.max(1, Math.round(w * 0.3));
    const wood = fog(gate ? th.pal[5] : th.pal[4], f);
    const dark = C.BLACK;
    r.rect(x0, y0, post, y1 - y0, wood);
    r.rect(x1 - post, y0, post, y1 - y0, wood);
    r.rect(x0, y0, x1 - x0, lintel, wood);
    r.frame(x0, y0, x1 - x0, y1 - y0, dark);
    r.frame(x0 + post, y0 + lintel, x1 - x0 - 2 * post, y1 - y0 - lintel, dark);
    if (gate) {
      // Teeth of the raised portcullis.
      const n = 5;
      for (let i = 0; i < n; i++) {
        const bx = Math.round(x0 + post + ((i + 0.5) * (x1 - x0 - 2 * post)) / n);
        r.vline(bx, y0 + lintel, y0 + lintel + Math.max(1, Math.round(w * 0.12)), fog(th.pal[7], f));
      }
    }
  }

  private object(r: PixelRenderer, s: ViewState, j: number, obj: NonNullable<FloorObj>): void {
    const k = j + 0.5 - s.offset;
    const w = halfW(k);
    const scale = w / halfW(1.5);
    const floorY = Math.round(botAt(k));
    const f = this.shadeNear(s, j);
    const sp = this.sprites;
    if (obj === 'chest') {
      const dw = Math.round(sp.chest.w * 1.6 * scale), dh = Math.round(sp.chest.h * 1.6 * scale);
      r.spriteScaled(sp.chest, CX - (dw >> 1), floorY - dh, dw, dh, [fog(0x17, f), fog(0x28, f), C.BLACK]);
    } else if (obj === 'enemy') {
      const spr = sp.wisp[(s.frame >> 3) & 1];
      const bob = Math.round(Math.sin(s.frame / 10) * 3 * scale);
      const dw = Math.round(spr.w * 1.8 * scale), dh = Math.round(spr.h * 1.8 * scale);
      const pal = (s.frame >> 2) & 1 ? [fog(0x21, f), fog(0x31, f), C.WHITE] : [fog(0x12, f), fog(0x21, f), fog(0x31, f)];
      r.spriteScaled(spr, CX - (dw >> 1), floorY - dh - Math.round(18 * scale) + bob, dw, dh, pal);
    } else if (obj === 'spikes') {
      const dw = Math.round(w * 1.4), dh = Math.round(sp.spikes.h * 1.4 * scale);
      r.spriteScaled(sp.spikes, CX - (dw >> 1), floorY - dh + Math.round(4 * scale), dw, dh, [fog(0x10, f), fog(0x00, f), C.BLACK]);
    } else if (obj === 'warp') {
      const rx = w * 0.7, ry = Math.max(1, w * 0.16);
      const cy = floorY - ry;
      const col = [0x13, 0x23, 0x33, 0x23][(s.frame >> 3) & 3];
      for (let a = 0; a < 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        r.pset(Math.round(CX + Math.cos(t) * rx), Math.round(cy + Math.sin(t) * ry), fog(col, f));
        r.pset(Math.round(CX + Math.cos(t) * rx * 0.6), Math.round(cy + Math.sin(t) * ry * 0.6), fog(0x13, f));
      }
    }
  }

  private npc(r: PixelRenderer, s: ViewState, j: number): void {
    const k = j + 0.5 - s.offset;
    const scale = halfW(k) / halfW(1.5);
    const floorY = Math.round(botAt(k));
    const spr = this.sprites.spirit;
    const dw = Math.round(spr.w * 2 * scale), dh = Math.round(spr.h * 2 * scale);
    if ((s.frame & 1) === 0 || j > 1)
      r.spriteScaled(spr, CX - (dw >> 1), floorY - dh - Math.round(6 * scale), dw, dh, [0x2c, 0x3c, C.WHITE]);
  }

  /** Horizontal pan used for the 90-degree turn transition. */
  shift(r: PixelRenderer, dx: number): void {
    if (dx === 0) return;
    const row = new Uint8Array(VIEW.w);
    for (let y = VIEW.y; y < VIEW.y + VIEW.h; y++) {
      const base = y * 256 + VIEW.x;
      row.set(r.buf.subarray(base, base + VIEW.w));
      for (let x = 0; x < VIEW.w; x++) {
        const sx = x - dx;
        r.buf[base + x] = sx >= 0 && sx < VIEW.w ? row[sx] : C.BLACK;
      }
    }
  }
}
