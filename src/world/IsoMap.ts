import { WORLD_H, WORLD_MAP, WORLD_W } from '../data/levels/world';
import { CELL, P2, Rect, SolidFn } from './Grid3D';

/**
 * Grids of the isometric areas (world map, villages, chapter roads), in tiles of
 * SUB metres: x east, z south. Pure logic shared by the scene, the 3D builder and tests.
 *
 *   .  grass        ,  path         r  spider lilies   =  bridge
 *   #  rock         T  tree         ~  water           +  grave      f  fence
 *   H  building     W  well         L  lantern post    J  jar (solid until broken)
 *   N  villager     V v S 1-4  world landmarks (solid)  a b c  spirit barriers
 */
export const SUB = CELL / 2;

const SOLID = new Set(['#', 'T', '~', '+', 'f', 'H', 'W', 'L', 'J', 'N', 'V', 'v', 'S', '1', '2', '3', '4']);
const BARRIERS = new Set(['a', 'b', 'c']);
/** Foe letters and markers lifted out of hand-made maps. */
const MARKERS: Record<string, string> = { g: '.', h: '.', w: '.', c: '.', P: ',', G: ',', X: ',' };

export interface Marker {
  ch: string;
  x: number;
  y: number;
}

/** Centre of tile `t` in metres. */
export const tileMid = (t: number) => (t + 0.5) * SUB;
export const tileOf = (m: number) => Math.floor(m / SUB);

export class IsoGrid {
  readonly w: number;
  readonly h: number;
  /** Foe letters and P / G / X markers found in the map (hand-made maps only). */
  readonly markers: Marker[] = [];
  private readonly g: string[][];

  /** `open` tells whether a spirit barrier has been lifted. */
  constructor(rows: string[], markers: boolean, private readonly open: (ch: string) => boolean = () => false) {
    this.w = rows[0].length;
    this.h = rows.length;
    this.g = rows.map((r) => r.split(''));
    if (!markers) return;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = this.g[y][x], to = MARKERS[ch];
        if (to === undefined) continue;
        this.markers.push({ ch, x, y });
        this.g[y][x] = to;
      }
    }
  }

  ch(x: number, y: number): string {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? '#' : this.g[y][x];
  }

  set(x: number, y: number, ch: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = ch;
  }

  blocked(x: number, y: number): boolean {
    const c = this.ch(x, y);
    return SOLID.has(c) || (BARRIERS.has(c) && !this.open(c));
  }

  marker(ch: string): Marker | undefined {
    return this.markers.find((m) => m.ch === ch);
  }

  /** Solid rects of the 2x2 tiles inside collision cell (cx, cy) (see Grid3D.collide). */
  readonly solid: SolidFn = (cx, cy) => {
    const out: Rect[] = [];
    for (let y = cy * 2; y < cy * 2 + 2; y++) {
      for (let x = cx * 2; x < cx * 2 + 2; x++) {
        if (this.blocked(x, y)) out.push({ x0: x * SUB, z0: y * SUB, x1: (x + 1) * SUB, z1: (y + 1) * SUB });
      }
    }
    return out;
  };

  /**
   * Shortest 8-way walk from tile a to tile b (no corner cutting), as tile centres
   * after the start; null if b cannot be reached within `limit` expanded tiles.
   */
  path(a: P2, b: P2, limit = 4000): P2[] | null {
    const ax = tileOf(a.x), ay = tileOf(a.z), bx = tileOf(b.x), by = tileOf(b.z);
    if (this.blocked(bx, by)) return null;
    const id = (x: number, y: number) => y * this.w + x;
    const cost = new Map<number, number>([[id(ax, ay), 0]]);
    const from = new Map<number, number>();
    const open: [number, number, number][] = [[0, ax, ay]];
    const h = (x: number, y: number) => {
      const dx = Math.abs(x - bx), dy = Math.abs(y - by);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    let n = 0;
    while (open.length && n++ < limit) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, x, y] = open[bi];
      open.splice(bi, 1);
      if (x === bx && y === by) {
        const out: P2[] = [];
        for (let k = id(x, y); k !== id(ax, ay); k = from.get(k)!) out.push({ x: tileMid(k % this.w), z: tileMid(Math.floor(k / this.w)) });
        return out.reverse();
      }
      const c0 = cost.get(id(x, y))!;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (this.blocked(nx, ny) || (dx && dy && (this.blocked(x + dx, y) || this.blocked(x, y + dy)))) continue;
          const c = c0 + (dx && dy ? 1.414 : 1), k = id(nx, ny);
          if (c >= (cost.get(k) ?? Infinity)) continue;
          cost.set(k, c);
          from.set(k, id(x, y));
          open.push([c + h(nx, ny), nx, ny]);
        }
      }
    }
    return null;
  }
}

// ------------------------------------------------------------------ world map

/** Iso tiles per world-map tile. */
export const WT = 3;
const LANDMARKS = 'VvS1234';
const ROADLIKE = new Set([',', '=', 'a', 'b', 'c', ...LANDMARKS]);

/** Metres of the centre of world-map tile (tx, ty). */
export const worldMid = (t: number) => (t * WT + 1.5) * SUB;
/** World-map tile coordinate (fractional) of a position in metres. */
export const worldTile = (m: number) => m / (WT * SUB) - 0.5;

/**
 * The world map at iso scale: every tile becomes 3x3. Roads run two metres wide
 * along their connections, landmarks stand solid in the middle of their tile.
 */
export function worldRows(): string[] {
  const at = (x: number, y: number) => WORLD_MAP[y]?.[x] ?? 'M';
  const rows: string[][] = Array.from({ length: WORLD_H * WT }, () => new Array<string>(WORLD_W * WT));
  for (let ty = 0; ty < WORLD_H; ty++) {
    for (let tx = 0; tx < WORLD_W; tx++) {
      const ch = at(tx, ty);
      const arm = [ROADLIKE.has(at(tx, ty - 1)), ROADLIKE.has(at(tx + 1, ty)), ROADLIKE.has(at(tx, ty + 1)), ROADLIKE.has(at(tx - 1, ty))];
      for (let j = 0; j < WT; j++) {
        for (let i = 0; i < WT; i++) {
          const mid = i === 1 && j === 1;
          // on a road arm: the middle column toward N/S neighbours, the middle row toward E/W
          const onArm = mid || (i === 1 && ((j === 0 && arm[0]) || (j === 2 && arm[2]))) || (j === 1 && ((i === 2 && arm[1]) || (i === 0 && arm[3])));
          let c: string;
          if (ch === 'M') c = '#';
          else if (ch === 't') c = mid ? 'T' : '.';
          else if (ch === 'g') c = '+';
          else if (ch === ',') c = onArm ? ',' : '.';
          else if (LANDMARKS.includes(ch)) c = mid ? ch : onArm ? ',' : '.';
          else c = ch; // T ~ = r . a b c
          rows[ty * WT + j][tx * WT + i] = c;
        }
      }
    }
  }
  return rows.map((r) => r.join(''));
}
