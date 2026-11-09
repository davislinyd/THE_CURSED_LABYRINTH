import { C } from './Palette';
import type { ThemeId } from '../world/DungeonMap';

/**
 * Wall faces are pre-drawn per theme at four fixed resolutions ("distance
 * sizes"), the way FC dungeon crawlers stored a separate tile set per depth.
 * Each texel is an index 0..7 into the theme palette:
 *   0 mortar/outline  1 base  2 light  3 shadow  4 wood  5 metal  6 accent  7 glow
 */
export interface Theme {
  pal: [number, number, number, number, number, number, number, number];
  floor: [number, number, number];
  ceil: [number, number, number];
}

export const THEMES: Record<ThemeId, Theme> = {
  grotto: {
    pal: [C.BLACK, 0x18, 0x28, 0x08, 0x07, 0x00, 0x1b, 0x38],
    floor: [0x08, 0x0b, C.BLACK],
    ceil: [C.BLACK, 0x0b, 0x08],
  },
  mine: {
    pal: [C.BLACK, 0x06, 0x16, 0x07, 0x17, 0x00, 0x27, 0x37],
    floor: [0x07, 0x08, C.BLACK],
    ceil: [C.BLACK, 0x07, 0x08],
  },
  crypt: {
    pal: [C.BLACK, 0x00, 0x10, 0x0c, 0x03, 0x1c, 0x13, 0x37],
    floor: [0x0c, 0x01, C.BLACK],
    ceil: [C.BLACK, 0x03, 0x0c],
  },
  temple: {
    pal: [C.BLACK, 0x03, 0x13, 0x01, 0x04, 0x28, 0x15, 0x38],
    floor: [0x01, 0x03, C.BLACK],
    ceil: [C.BLACK, 0x04, 0x03],
  },
};

export const LODS: [number, number][] = [
  [64, 48],
  [32, 24],
  [16, 12],
  [8, 6],
];

export interface Texture {
  w: number;
  h: number;
  px: Uint8Array;
}

const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

type Painter = (t: Texture, x: number, y: number) => number;

function blocks(rows: number, cols: number, seed: number, mossy = false): Painter {
  return (t, x, y) => {
    const bh = t.h / rows;
    const bw = t.w / cols;
    const r = Math.floor(y / bh);
    const off = r % 2 ? bw / 2 : 0;
    // Irregular joints: shift each block edge by a hashed texel for a hand-cut look.
    const jitter = t.w >= 32 ? (hash(r, Math.floor((x + off) / bw), seed) % 3) - 1 : 0;
    const lx = Math.floor(x + off + jitter) % bw;
    const ly = y - Math.floor(r * bh);
    if (lx === 0 || ly === 0) return 0;
    if (bh >= 4 && ly === Math.floor(bh) - 1) return 3;
    if (bh >= 4 && (ly === 1 || lx === 1)) return 2;
    const h = hash(x, y, seed);
    if (mossy && ly <= 2 + (h % 3) && h % 5 < 2) return 6;
    if (t.w >= 32 && h % 23 === 0) return 3;
    if (t.w >= 32 && h % 29 === 0) return 2;
    return 1;
  };
}

const minePainter: Painter = (t, x, y) => {
  const u = x / t.w, v = y / t.h;
  // Timber frame: two posts and a lintel.
  const post = u < 0.12 || u >= 0.88;
  if (v < 0.11 || post) {
    if ((post && (Math.floor(u * t.w) === Math.floor(0.12 * t.w) - 1 || Math.floor(u * t.w) === Math.floor(0.88 * t.w)))) return 0;
    if (v < 0.11 && y === Math.floor(0.11 * t.h) - 1 && !post) return 0;
    if (t.w >= 32 && (post ? y % 7 === 3 : x % 9 === 4)) return 3;
    return 4;
  }
  // Rock: clumpy noise with dark seams.
  const cx = Math.floor(x / Math.max(2, t.w / 16)), cy = Math.floor(y / Math.max(2, t.h / 12));
  const h = hash(cx, cy, 7);
  if (t.w >= 32 && hash(x, y, 9) % 11 === 0) return 0;
  return h % 4 === 0 ? 3 : h % 5 === 0 ? 2 : 1;
};

const cryptPainter: Painter = (t, x, y) => {
  // Bone niches: 3 columns x 4 rows of alcoves holding skulls.
  const cw = t.w / 3, rh = t.h / 4;
  const lx = x - Math.floor(x / cw) * cw, ly = y - Math.floor(y / rh) * rh;
  const fx = lx / cw, fy = ly / rh;
  if (fx < 0.12 || fx > 0.88 || fy < 0.14 || fy > 0.86) {
    if (Math.floor(lx) === 0 || Math.floor(ly) === 0) return 0;
    return fy > 0.86 ? 3 : 1;
  }
  if (t.w < 32) return 3;
  // Skull silhouette in the niche.
  const sx = (fx - 0.5) / 0.28, sy = (fy - 0.48) / 0.3;
  if (sx * sx + sy * sy < 1) {
    if (sy > -0.1 && sy < 0.35 && Math.abs(Math.abs(sx) - 0.42) < 0.2) return 0; // eye sockets
    if (sy > 0.6 && Math.abs(sx) < 0.12) return 0;
    return 7;
  }
  return fy < 0.3 ? 0 : 3;
};

const templePainter: Painter = (t, x, y) => {
  const v = y / t.h;
  if (v > 0.42 && v < 0.54) {
    if (y === Math.floor(0.42 * t.h) + 1 || y === Math.floor(0.54 * t.h)) return 0;
    if (t.w >= 32 && ((x + (y % 2) * 3) % 6 < 2)) return 6;
    return 5;
  }
  const base = blocks(2, 2, 3)(t, x, y);
  return base;
};

const WALLS: Record<ThemeId, Painter> = {
  grotto: blocks(3, 2, 1, true),
  mine: minePainter,
  crypt: cryptPainter,
  temple: templePainter,
};

/** Doorway rectangle in face space shared by all door-like features. */
const DOOR = { u0: 0.22, u1: 0.78, v0: 0.26 };

function inDoor(u: number, v: number): boolean {
  return u >= DOOR.u0 && u < DOOR.u1 && v >= DOOR.v0;
}

type Feature = (t: Texture, x: number, y: number, base: number, variant: number) => number;

const doorFrame = (t: Texture, x: number, y: number): number | null => {
  const u = x / t.w, v = y / t.h;
  const fw = Math.max(1, Math.round(t.w * 0.05));
  const x0 = Math.floor(DOOR.u0 * t.w), x1 = Math.floor(DOOR.u1 * t.w), y0 = Math.floor(DOOR.v0 * t.h);
  if (!(u >= DOOR.u0 - 0.06 && u < DOOR.u1 + 0.06 && v >= DOOR.v0 - 0.07)) return null;
  if (x < x0 - fw || x >= x1 + fw || y < y0 - fw) return null;
  if (x < x0 || x >= x1 || y < y0) {
    if (x === x0 - fw || x === x1 + fw - 1 || y === y0 - fw) return 0;
    return 2;
  }
  return -1; // inside opening
};

const FEATURES: Record<string, Feature> = {
  door: (t, x, y, base) => {
    const f = doorFrame(t, x, y);
    if (f === null) return base;
    if (f >= 0) return f;
    const u = x / t.w, v = y / t.h;
    const plank = Math.max(2, Math.round(t.w / 12));
    if ((x - Math.floor(DOOR.u0 * t.w)) % plank === 0) return 0;
    if (Math.abs(v - 0.45) < 0.03 || Math.abs(v - 0.82) < 0.03) return 5;
    if (t.w >= 32 && Math.abs(u - 0.68) < 0.03 && Math.abs(v - 0.62) < 0.05) return 7;
    return 4;
  },
  locked: (t, x, y, base) => {
    const u = x / t.w, v = y / t.h;
    const d = FEATURES.door(t, x, y, base, 0);
    if (!inDoor(u, v)) return d;
    // Crossed chains and a heavy lock plate.
    const cu = (u - 0.5) / 0.28, cv = (v - 0.63) / 0.37;
    if (Math.abs(cu) < 0.3 && Math.abs(cv) < 0.25) {
      if (Math.abs(cu) < 0.08 && cv > -0.1 && cv < 0.15) return 0;
      return 6;
    }
    if (Math.abs(Math.abs(cu) - Math.abs(cv)) < 0.09) return (x + y) % 2 ? 5 : 0;
    return d;
  },
  breakable: (t, x, y, base, hp) => {
    const f = doorFrame(t, x, y);
    if (f === null) return base;
    if (f >= 0) return f;
    const u = (x / t.w - DOOR.u0) / (DOOR.u1 - DOOR.u0), v = (y / t.h - DOOR.v0) / (1 - DOOR.v0);
    // Diagonal rotten boards nailed across a black opening.
    const boards = [0.15, 0.45, 0.75];
    for (let i = 0; i < boards.length; i++) {
      if (hp < 3 && i === 1) continue;
      if (hp < 2 && i === 0) continue;
      const d = v - boards[i] - (u - 0.5) * (i % 2 ? -0.35 : 0.35);
      if (Math.abs(d) < 0.09) {
        if (Math.abs(d) > 0.07) return 0;
        if (hash(x, y, i) % (hp + 2) === 0) return 3;
        return 4;
      }
    }
    return 0;
  },
  seal: (t, x, y, base) => {
    const f = doorFrame(t, x, y);
    if (f === null) return base;
    if (f >= 0) return f === 2 ? 6 : f;
    const u = (x / t.w - 0.5) / 0.28, v = (y / t.h - 0.62) / 0.37;
    const r = Math.sqrt(u * u + v * v);
    if (Math.abs(r - 0.62) < 0.08) return 6;
    if (r < 0.3 && (Math.abs(u) < 0.07 || Math.abs(v) < 0.07)) return 7;
    if (Math.abs(r - 0.62) < 0.14) return 0;
    return 3;
  },
  gate: (t, x, y, base) => {
    const f = doorFrame(t, x, y);
    if (f === null) return base;
    if (f >= 0) return f;
    const u = (x / t.w - DOOR.u0) / (DOOR.u1 - DOOR.u0), v = (y / t.h - DOOR.v0) / (1 - DOOR.v0);
    const bars = 5;
    const bu = (u * bars) % 1;
    if (bu > 0.35 && bu < 0.65) return bu < 0.45 ? 7 : 5;
    if (Math.abs(v - 0.3) < 0.04 || Math.abs(v - 0.7) < 0.04) return 5;
    return 0;
  },
  lever: (t, x, y, base, down) => {
    const u = x / t.w, v = y / t.h;
    if (u > 0.4 && u < 0.6 && v > 0.42 && v < 0.62) {
      if (u < 0.42 || u > 0.58 || v < 0.44 || v > 0.6) return 0;
      return 5;
    }
    // Handle
    const hu = Math.abs(u - 0.5);
    const top = down ? 0.52 : 0.2, bot = down ? 0.84 : 0.52;
    if (hu < 0.025 && v > top && v < bot) return 4;
    if (hu < 0.06 && Math.abs(v - (down ? bot : top)) < 0.045) return 6;
    return base;
  },
  tablet: (t, x, y, base) => {
    const u = x / t.w, v = y / t.h;
    if (u > 0.26 && u < 0.74 && v > 0.18 && v < 0.78) {
      if (u < 0.29 || u > 0.71 || v < 0.21 || v > 0.75) return 0;
      if (t.w >= 32 && Math.floor((v - 0.24) * t.h) % 3 === 0 && hash(Math.floor(u * 9), Math.floor(v * 20), 5) % 3) return 3;
      return 2;
    }
    return base;
  },
  fake: (_t, x, y, base, phase) => {
    if (((x + y + phase) & 7) === 0 && base !== 0) return 7;
    return base;
  },
  boss: (t, x, y, base) => {
    const u = x / t.w, v = y / t.h;
    if (!(u > 0.14 && u < 0.86 && v > 0.16)) return base;
    if (u < 0.19 || u > 0.81 || v < 0.21) return u < 0.15 || u > 0.85 || v < 0.17 ? 0 : 6;
    if (Math.abs(u - 0.5) < 0.012 || (t.w < 32 && Math.abs(u - 0.5) < 0.04)) return 0;
    // Oni emblem
    const eu = (u - 0.5) / 0.2, ev = (v - 0.5) / 0.18;
    if (eu * eu + ev * ev < 1) {
      if (ev > -0.35 && ev < 0.05 && Math.abs(Math.abs(eu) - 0.42) < 0.17) return 7;
      if (ev > 0.45 && ev < 0.72 && Math.abs(eu) < 0.55) return (Math.floor(eu * 8) & 1) ? 7 : 0;
      return 6;
    }
    if (ev < -0.7 && ev > -1.6 && Math.abs(Math.abs(eu) - (1.1 + ev * 0.25)) < 0.18) return 5; // horns
    return 4;
  },
  exit: (t, x, y, base) => {
    const f = doorFrame(t, x, y);
    if (f === null) return base;
    if (f >= 0) return f;
    const v = (y / t.h - DOOR.v0) / (1 - DOOR.v0);
    if (v < 0.45) return 7;
    const step = Math.floor((v - 0.45) / 0.11);
    return step % 2 ? 2 : 7;
  },
};

const cache = new Map<string, Texture>();

export function faceTexture(theme: ThemeId, face: string, variant: number, lod: number): Texture {
  const k = `${theme}:${face}:${variant}:${lod}`;
  let t = cache.get(k);
  if (t) return t;
  const [w, h] = LODS[lod];
  t = { w, h, px: new Uint8Array(w * h) };
  const wall = WALLS[theme];
  const feat = FEATURES[face];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const base = wall(t, x, y);
      t.px[y * w + x] = feat ? feat(t, x, y, base, variant) : base;
    }
  cache.set(k, t);
  return t;
}

export function lodFor(pixelWidth: number): number {
  if (pixelWidth >= 48) return 0;
  if (pixelWidth >= 24) return 1;
  if (pixelWidth >= 12) return 2;
  return 3;
}
