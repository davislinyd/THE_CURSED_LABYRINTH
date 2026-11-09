import { Dungeon } from './DungeonMap';

/**
 * A labyrinth grid in metres: each cell is CELL x CELL, x east and z south
 * (grid row y maps to z). Pure geometry, shared by the 3D builder, movement,
 * the camera and tests.
 */
export const CELL = 4;
export const WALL_H = 4.5;

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface P2 {
  x: number;
  z: number;
}

export const cellOf = (w: number) => Math.floor(w / CELL);
export const center = (c: number) => c * CELL + CELL / 2;

/** Cells that are always solid. Faces (T X K = %) are walls with something on them. */
const FACE = new Set(['T', 'X', 'K', '=', '%']);
/** Cells holding a barrier across the passage while closed. */
const BARRIER = new Set(['D', 'L', 'B', 'S', 'G', 'g', 'H', 'h']);

export type CellKind = 'wall' | 'face' | 'open';

export function cellKind(ch: string): CellKind {
  return ch === '#' ? 'wall' : FACE.has(ch) ? 'face' : 'open';
}

export const isBarrier = (ch: string) => BARRIER.has(ch);

/** Direction a passage runs through a barrier cell: 'x' when its west and east neighbours are open. */
export function barrierAxis(d: Dungeon, x: number, y: number): 'x' | 'z' {
  return cellKind(d.ch(x - 1, y)) === 'open' && cellKind(d.ch(x + 1, y)) === 'open' ? 'x' : 'z';
}

/** Half thickness of a closed barrier slab, metres. */
export const SLAB = 0.35;
/** Half size of the block a spirit (N) occupies. */
export const SPIRIT = 0.6;

/** The solid parts of a cell in world coordinates (empty when it is free to walk). */
export function solidRects(d: Dungeon, x: number, y: number): Rect[] {
  const ch = d.ch(x, y);
  const x0 = x * CELL, z0 = y * CELL, cx = x0 + CELL / 2, cz = z0 + CELL / 2;
  if (cellKind(ch) !== 'open') return [{ x0, z0, x1: x0 + CELL, z1: z0 + CELL }];
  if (ch === 'N') return [{ x0: cx - SPIRIT, z0: cz - SPIRIT, x1: cx + SPIRIT, z1: cz + SPIRIT }];
  if (isBarrier(ch) && !d.passable(x, y)) {
    return barrierAxis(d, x, y) === 'x'
      ? [{ x0: cx - SLAB, z0, x1: cx + SLAB, z1: z0 + CELL }]
      : [{ x0, z0: cz - SLAB, x1: x0 + CELL, z1: cz + SLAB }];
  }
  return [];
}

export type SolidFn = (x: number, y: number) => Rect[];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Push a circle of radius `r` at `p` out of nearby solid rects (mutates `p`). */
export function collide(p: P2, r: number, solid: SolidFn): void {
  for (let pass = 0; pass < 2; pass++) {
    const cx = cellOf(p.x), cy = cellOf(p.z);
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (const b of solid(x, y)) {
          const qx = clamp(p.x, b.x0, b.x1), qz = clamp(p.z, b.z0, b.z1);
          const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-12) {
            const d = Math.sqrt(d2);
            p.x = qx + (dx / d) * r;
            p.z = qz + (dz / d) * r;
          } else {
            // centre inside the rect: leave by the nearest side
            const l = p.x - b.x0, rt = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z, m = Math.min(l, rt, t, bt);
            if (m === l) p.x = b.x0 - r;
            else if (m === rt) p.x = b.x1 + r;
            else if (m === t) p.z = b.z0 - r;
            else p.z = b.z1 + r;
          }
        }
      }
    }
  }
}

/** Whether a point is inside any solid rect. */
export function inSolid(p: P2, solid: SolidFn): boolean {
  const cx = cellOf(p.x), cy = cellOf(p.z);
  return solid(cx, cy).some((b) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1);
}

/**
 * Share (0..1) of the segment a -> b that is clear before it first enters a solid rect.
 * Sampled every `step` metres, then narrowed down between the last clear sample and the
 * first solid one, so the share changes smoothly as the segment moves.
 */
export function clearance(a: P2, b: P2, solid: SolidFn, step = 0.2): number {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / step));
  const p = { x: 0, z: 0 };
  const hit = (k: number) => {
    p.x = a.x + (b.x - a.x) * k;
    p.z = a.z + (b.z - a.z) * k;
    return inSolid(p, solid);
  };
  for (let i = 1; i <= n; i++) {
    if (!hit(i / n)) continue;
    let lo = (i - 1) / n, hi = i / n;
    for (let j = 0; j < 6; j++) {
      const mid = (lo + hi) / 2;
      if (hit(mid)) hi = mid;
      else lo = mid;
    }
    return lo;
  }
  return 1;
}

/** Whether a body of radius `r` can go straight from a to b without running into a solid rect. */
export function clearWay(a: P2, b: P2, r: number, solid: SolidFn): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  const ox = (-dz / l) * r, oz = (dx / l) * r;
  // its middle and both flanks
  return [0, 1, -1].every((s) => clearance({ x: a.x + ox * s, z: a.z + oz * s }, { x: b.x + ox * s, z: b.z + oz * s }, solid, 0.25) === 1);
}

export interface WallFace {
  x: number;
  y: number;
  /** 0 N, 1 E, 2 S, 3 W: the side of open cell (x, y) the wall stands on. */
  dir: number;
  /** The wall cell's character ('#' or a face such as 'T'). */
  ch: string;
}

const NX = [0, 1, 0, -1], NY = [-1, 0, 1, 0];

/** What the 3D builder needs from a grid: open cells and the walls around them. */
export function layout(d: Dungeon): { open: [number, number][]; walls: WallFace[] } {
  const open: [number, number][] = [];
  const walls: WallFace[] = [];
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      if (cellKind(d.ch(x, y)) !== 'open') continue;
      open.push([x, y]);
      for (let dir = 0; dir < 4; dir++) {
        const ch = d.ch(x + NX[dir], y + NY[dir]);
        if (cellKind(ch) !== 'open') walls.push({ x, y, dir, ch });
      }
    }
  }
  return { open, walls };
}

export const DIR_X = NX;
export const DIR_Y = NY;
