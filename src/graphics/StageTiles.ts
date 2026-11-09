import type { ThemeId } from '../world/DungeonMap';
import { C } from './Palette';
import { PixelRenderer } from './PixelRenderer';
import { Sprite } from './Sprite';

/**
 * Side-view tile art for action stages, generated procedurally like the labyrinth textures.
 * Every tile uses black plus three colours, as one FC background palette would.
 */
export interface StageTheme {
  sky: number;
  ground: number[]; // dark, mid, light
  top: number[];
  plat: number[];
  mire: number[];
  far: number; // distant silhouette band
  near: number; // nearer silhouette band
  moon: number;
}

export const STAGE_THEMES: Record<ThemeId, StageTheme> = {
  grotto: {
    sky: C.BLACK, ground: [0x07, 0x08, 0x18], top: [0x0a, 0x1a, 0x2a], plat: [0x07, 0x17, 0x27],
    mire: [0x0a, 0x1b, 0x2b], far: 0x0c, near: 0x0b, moon: 0x38,
  },
  mine: {
    sky: C.BLACK, ground: [0x07, 0x00, 0x17], top: [0x07, 0x17, 0x27], plat: [0x07, 0x17, 0x28],
    mire: [0x06, 0x16, 0x26], far: 0x06, near: 0x07, moon: 0x26,
  },
  crypt: {
    sky: C.BLACK, ground: [0x0c, 0x00, 0x10], top: [0x00, 0x10, 0x20], plat: [0x00, 0x10, 0x30],
    mire: [0x01, 0x11, 0x21], far: 0x01, near: 0x0c, moon: 0x20,
  },
  temple: {
    sky: C.BLACK, ground: [0x01, 0x03, 0x13], top: [0x03, 0x18, 0x28], plat: [0x03, 0x18, 0x28],
    mire: [0x06, 0x16, 0x27], far: 0x06, near: 0x03, moon: 0x16,
  },
};

export type TileKind = 'fill' | 'top' | 'plat' | 'spike' | 'mire0' | 'mire1' | 'crumble' | 'crack';

const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) & 255;
};

function make(paint: (x: number, y: number) => number): Sprite {
  const px = new Uint8Array(256);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px[y * 16 + x] = paint(x, y);
  return { w: 16, h: 16, px };
}

const SEED: Record<ThemeId, number> = { grotto: 1, mine: 2, crypt: 3, temple: 4 };

// Slot values: 1 black, 2 dark, 3 mid, 4 light (palette = [BLACK, ...theme colours]).
function fill(t: ThemeId, x: number, y: number): number {
  const n = hash(x, y, SEED[t]);
  if (t === 'crypt' || t === 'temple') {
    // dressed stone blocks with offset joints
    if (y === 7 || y === 15) return 1;
    if (x === (y < 8 ? 3 : 11)) return 1;
    if (y === 0 || y === 8) return 4;
    return n < 30 ? 2 : 3;
  }
  if (n < 22) return 2;
  if (n < 30) return 4;
  if (n < 34) return 1;
  return 3;
}

function top(t: ThemeId, x: number, y: number): number {
  const n = hash(x, y, SEED[t] + 9);
  if (t === 'grotto') {
    // grass tufts over packed earth
    const tuft = hash(x, 0, 7) < 90 ? 0 : 1;
    if (y < tuft) return 0;
    if (y <= 1) return 4;
    if (y <= 3) return n < 60 ? 2 : 3;
    if (y === 4) return hash(x, 4, 3) < 128 ? 2 : 0x12;
    return 0x10 | fill(t, x, y);
  }
  if (t === 'mine') {
    if (y === 0) return n < 40 ? 0 : 4;
    if (y <= 2) return n < 50 ? 2 : 3;
    return 0x10 | fill(t, x, y);
  }
  if (t === 'temple') {
    if (y === 0) return 4;
    if (y === 1) return x % 4 === 0 ? 2 : 3;
    if (y === 2) return 1;
    return 0x10 | fill(t, x, y);
  }
  // crypt: worn slab edge with moss specks
  if (y === 0) return 4;
  if (y === 1) return n < 40 ? 2 : 3;
  return 0x10 | fill(t, x, y);
}

function plat(t: ThemeId, x: number, y: number): number {
  if (y > 5) return 0;
  if (t === 'grotto' || t === 'mine') {
    if (y === 0) return 4;
    if (y === 5) return 1;
    if (x === 0 || x === 15) return 1;
    return (x + y * 5) % 7 === 0 ? 2 : 3;
  }
  if (y === 0) return 4;
  if (y === 5) return 1;
  return x % 8 === 0 ? 2 : 3;
}

function spike(t: ThemeId, x: number, y: number): number {
  if (y >= 10) return 0x10 | fill(t, x, y);
  const cx = (x % 4) + 0.5;
  const half = (y + 1) / 5;
  if (Math.abs(cx - 2) <= half) return x % 4 === 1 ? 4 : y > 7 ? 2 : 3;
  return 0;
}

function mire(x: number, y: number, phase: number): number {
  const wave = Math.round(Math.sin((x + phase * 4) * 0.8) * 1.2);
  if (y < 2 + wave) return 0;
  if (y === 2 + wave) return 4;
  if (y < 8) return (x + y + phase) % 5 === 0 ? 4 : 3;
  return (x + y) & 1 ? 2 : 3;
}

function crumble(t: ThemeId, x: number, y: number, cracked: boolean): number {
  if (x === 0 || y === 0) return 4;
  if (x === 15 || y === 15) return 1;
  const crack = Math.abs(x - 8 - ((y * 3) % 5 - 2)) < 1 || (cracked && (Math.abs(y - x) < 1 || Math.abs(y - 15 + x) < 1));
  if (crack && y > 1 && y < 14) return 1;
  return hash(x, y, SEED[t] + 5) < 40 ? 2 : 3;
}

const cache = new Map<string, Sprite>();

/** Tile art. Values >= 0x10 index the ground palette, the rest the tile's own palette. */
export function tileSprite(t: ThemeId, kind: TileKind): Sprite {
  const k = t + kind;
  let s = cache.get(k);
  if (s) return s;
  const paint: Record<TileKind, (x: number, y: number) => number> = {
    fill: (x, y) => fill(t, x, y),
    top: (x, y) => top(t, x, y),
    plat: (x, y) => plat(t, x, y),
    spike: (x, y) => spike(t, x, y),
    mire0: (x, y) => mire(x, y, 0),
    mire1: (x, y) => mire(x, y, 1),
    crumble: (x, y) => crumble(t, x, y, false),
    crack: (x, y) => crumble(t, x, y, true),
  };
  s = make(paint[kind]);
  cache.set(k, s);
  return s;
}

/** Draw a tile whose pixels may mix its own palette (1..4) and the ground palette (0x11..0x14). */
export function drawTile(r: PixelRenderer, s: Sprite, x: number, y: number, own: number[], ground: number[]): void {
  for (let yy = 0; yy < 16; yy++) {
    for (let xx = 0; xx < 16; xx++) {
      const v = s.px[yy * 16 + xx];
      if (!v) continue;
      const pal = v & 0x10 ? ground : own;
      const i = v & 0x0f;
      r.pset(x + xx, y + yy, i === 1 ? C.BLACK : pal[i - 2]);
    }
  }
}

/**
 * Banded parallax backdrop, the way FC games split the screen with raster tricks:
 * a fixed sky with the moon, a far band at 1/4 speed and a near band at 1/2 speed.
 */
export function drawBackdrop(r: PixelRenderer, t: ThemeId, camX: number, top: number): void {
  const th = STAGE_THEMES[t];
  r.rect(0, top, 256, 240 - top, th.sky);
  // stars
  for (let i = 0; i < 24; i++) {
    const sx = (hash(i, 1, 77) + i * 37) % 256, sy = top + 4 + (hash(i, 2, 77) % 60);
    r.pset(sx, sy, i % 3 ? 0x00 : 0x10);
  }
  // moon
  const mx = 196, my = top + 26;
  for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) {
    const d = x * x + y * y;
    if (d <= 81) r.pset(mx + x, my + y, (x + 3) * (x + 3) + (y - 2) * (y - 2) < 30 && t !== 'temple' ? th.moon : d > 64 ? th.far : th.moon);
  }
  // far band: ridge line
  const farX = Math.floor(camX / 4);
  for (let sx = 0; sx < 256; sx++) {
    const wx = sx + farX;
    const h = 30 + Math.round(Math.sin(wx * 0.021) * 12 + Math.sin(wx * 0.057) * 6 + (hash(wx >> 3, 0, 5) & 3));
    r.vline(sx, top + 110 - h, top + 150, th.far);
  }
  // near band: theme silhouettes
  const nearX = Math.floor(camX / 2);
  for (let sx = 0; sx < 256; sx++) {
    const wx = sx + nearX;
    const cell = wx >> 5, lx = wx & 31;
    const n = hash(cell, 3, SEED[t]);
    let y0 = top + 150;
    if (t === 'grotto') {
      // cedars: tiered conical crowns
      const d = Math.floor(Math.abs(lx - 15.5));
      if (n < 170 && d < 12) y0 = top + 56 + (n & 15) + Math.round(d * 2.6) - ((d & 3) === 3 ? 3 : 0);
    } else if (t === 'mine') {
      // timber supports and hanging chains
      if (lx < 4 || lx > 27) y0 = top + 96;
      else if (n < 128 && lx === 16) y0 = top + 40 + (n & 31);
    } else if (t === 'crypt') {
      // grave markers of varying heights
      if (lx >= 8 && lx <= 20) y0 = top + 120 - (n & 31) + (lx === 8 || lx === 20 ? 3 : 0);
      if (n > 200 && lx >= 13 && lx <= 15) y0 = top + 96 - (n & 15);
    } else {
      // temple pillars
      if ((cell & 1) === 0 && lx >= 10 && lx <= 21) y0 = top + 30 + (lx === 10 || lx === 21 ? 6 : 0);
    }
    r.vline(sx, y0, top + 150, th.near);
  }
  // fog band where the near layer meets the play field
  r.ditherRect(0, top + 150, 256, 4, th.near, th.sky);
  r.rect(0, top + 154, 256, 240 - top - 154, th.near);
}
