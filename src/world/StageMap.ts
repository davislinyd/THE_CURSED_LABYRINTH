export const TILE = 16;
export const STAGE_ROWS = 13;

export interface Spawn {
  ch: string;
  x: number; // pixel centre
  y: number; // pixel bottom
  col: number;
}

/** Tile grid of a side-view stage or arena with collision queries. */
export class StageMap {
  readonly cols: number;
  readonly widthPx: number;
  readonly spawns: Spawn[] = [];
  private readonly grid: string[][];
  /** Crumbling blocks: frames stood on (>= CRUMBLE_TIME means gone). */
  private readonly crumble = new Map<number, number>();
  static readonly CRUMBLE_TIME = 28;

  constructor(rows: string[]) {
    this.cols = rows[0].length;
    this.widthPx = this.cols * TILE;
    this.grid = rows.map((r) => r.split(''));
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if ('.#=^~C'.includes(ch)) continue;
        this.spawns.push({ ch, x: x * TILE + 8, y: (y + 1) * TILE, col: x });
        this.grid[y][x] = '.';
      }
    });
  }

  at(tx: number, ty: number): string {
    if (tx < 0 || tx >= this.cols) return '#';
    if (ty < 0) return '.';
    if (ty >= STAGE_ROWS) return '.';
    const ch = this.grid[ty][tx];
    if (ch === 'C' && (this.crumble.get(ty * this.cols + tx) ?? 0) >= StageMap.CRUMBLE_TIME) return '.';
    return ch;
  }

  /** Solid from every side. */
  solid(tx: number, ty: number): boolean {
    const c = this.at(tx, ty);
    return c === '#' || c === '^' || c === 'C';
  }

  /** Can be stood on (solid or one-way platform). */
  floor(tx: number, ty: number): boolean {
    return this.solid(tx, ty) || this.at(tx, ty) === '=';
  }

  solidPx(x: number, y: number): boolean {
    return this.solid(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** Feet resting on a crumbling block weaken it. */
  stepOn(tx: number, ty: number): void {
    if (this.at(tx, ty) !== 'C') return;
    const k = ty * this.cols + tx;
    this.crumble.set(k, (this.crumble.get(k) ?? 0) + 1);
  }

  crumbleStage(tx: number, ty: number): number {
    return this.crumble.get(ty * this.cols + tx) ?? 0;
  }

  /** Raw tile (crumbled blocks report '.'). */
  tile(tx: number, ty: number): string {
    return tx < 0 || tx >= this.cols ? '.' : this.at(tx, ty);
  }
}

export interface Body {
  x: number; // centre
  y: number; // feet
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
}

export const GRAVITY = 0.25;
export const MAX_FALL = 5;

/**
 * Move a body through the tile grid one axis at a time (FC-style pixel collision).
 * Returns true when it bumped a wall horizontally.
 */
export function moveBody(m: StageMap, b: Body, gravity = true): boolean {
  let bumped = false;
  // horizontal
  if (b.vx !== 0) {
    const nx = b.x + b.vx;
    const edge = b.vx > 0 ? nx + b.w / 2 : nx - b.w / 2;
    const tx = Math.floor(edge / TILE);
    let hit = false;
    for (let py = b.y - b.h + 1; py <= b.y - 1; py += 8) {
      if (m.solid(tx, Math.floor(py / TILE))) hit = true;
    }
    if (m.solid(tx, Math.floor((b.y - 1) / TILE))) hit = true;
    if (hit) {
      b.x = b.vx > 0 ? tx * TILE - b.w / 2 - 0.01 : (tx + 1) * TILE + b.w / 2 + 0.01;
      b.vx = 0;
      bumped = true;
    } else b.x = nx;
  }
  // vertical
  if (gravity) b.vy = Math.min(MAX_FALL, b.vy + GRAVITY);
  const ny = b.y + b.vy;
  const x0 = Math.floor((b.x - b.w / 2 + 1) / TILE), x1 = Math.floor((b.x + b.w / 2 - 1) / TILE);
  b.onGround = false;
  if (b.vy >= 0) {
    const tyOld = Math.floor((b.y - 0.01) / TILE);
    const ty = Math.floor(ny / TILE);
    let landed = false;
    for (let t = tyOld + 1; t <= ty && !landed; t++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (m.floor(tx, t)) {
          b.y = t * TILE;
          b.vy = 0;
          b.onGround = true;
          landed = true;
          break;
        }
      }
    }
    if (!landed) b.y = ny;
  } else {
    const headOld = Math.floor((b.y - b.h) / TILE);
    const head = Math.floor((ny - b.h) / TILE);
    let hit = false;
    for (let t = headOld - 1; t >= head && !hit; t--) {
      for (let tx = x0; tx <= x1; tx++) {
        if (m.solid(tx, t)) {
          b.y = (t + 1) * TILE + b.h;
          b.vy = 0;
          hit = true;
          break;
        }
      }
    }
    if (!hit) b.y = ny;
  }
  // standing check when not moving vertically
  if (!b.onGround && b.vy === 0) {
    const t = Math.floor(b.y / TILE);
    if (b.y % TILE === 0) for (let tx = x0; tx <= x1; tx++) if (m.floor(tx, t)) b.onGround = true;
  }
  return bumped;
}

/** Tiles under a body's feet. */
export function feetTiles(b: Body): [number, number, number] {
  const ty = Math.floor(b.y / TILE);
  return [Math.floor((b.x - b.w / 2 + 1) / TILE), Math.floor((b.x + b.w / 2 - 1) / TILE), ty];
}

/** Is there floor ahead of a walker (used to stop at ledges)? */
export function groundAhead(m: StageMap, b: Body, dir: number): boolean {
  const fx = b.x + dir * (b.w / 2 + 2);
  return m.floor(Math.floor(fx / TILE), Math.floor((b.y + 1) / TILE));
}
