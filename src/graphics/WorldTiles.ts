import { C } from './Palette';
import { PixelRenderer } from './PixelRenderer';

/**
 * Overworld tiles (16x16) painted procedurally into direct NES colour indices.
 * 0xff marks a pixel left to the tile underneath (used for features drawn over grass).
 */
const T = 0xff;
const GRASS = [0x0a, 0x1a, 0x0b];
const hash = (x: number, y: number, s: number) => {
  let h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) & 255;
};

type Painter = (x: number, y: number, f: number) => number;

const grass: Painter = (x, y) => {
  const n = hash(x, y, 1);
  return n < 26 ? GRASS[1] : n < 34 ? GRASS[2] : GRASS[0];
};

const road: Painter = (x, y) => {
  const n = hash(x, y, 2);
  return n < 30 ? 0x07 : n < 40 ? 0x18 : 0x08;
};

const forest: Painter = (x, y) => {
  // overlapping round canopies on a 8px lattice
  const cx = (x & 7) - 3.5, cy = (y & 7) - 3.5 + ((x >> 3) & 1 ? 2 : 0);
  const d = cx * cx + cy * cy;
  if (d < 9) return d < 3 && cx < 0 && cy < 0 ? 0x1b : 0x0b;
  if (d < 14) return C.BLACK;
  return 0x0b;
};

const tree: Painter = (x, y) => {
  const dx = x - 7.5, dy = y - 6;
  const d = dx * dx + dy * dy;
  if (y >= 11 && y <= 14 && x >= 7 && x <= 8) return 0x07;
  if (d < 30) return d < 10 && dx < 0 && dy < 0 ? 0x1b : 0x0b;
  if (d < 38) return C.BLACK;
  return T;
};

const mountain: Painter = (x, y) => {
  // two crags per tile with a lit left face
  const peak = (px: number, py: number, w: number) => {
    const dx = x - px;
    if (y < py || Math.abs(dx) > (y - py) * w) return -1;
    return dx < 0 ? 1 : 0;
  };
  const a = peak(5, 2, 0.6), b = peak(11, 5, 0.6);
  const face = b >= 0 && y > 6 ? b : a >= 0 ? a : b;
  if (face < 0) return 0x0c;
  if (y < 5 && a >= 0) return 0x30;
  return face ? 0x10 : 0x00;
};

const water: Painter = (x, y, f) => {
  const w = ((x + f * 2 + (y >> 2) * 5) & 15) < 3 && (y & 3) === 1;
  return w ? 0x21 : (x + y) & 1 && hash(x, y, 4) < 50 ? 0x11 : 0x01;
};

const bridge: Painter = (x, y) => {
  if (x < 2 || x > 13) return y & 1 ? 0x01 : 0x11;
  if (x === 2 || x === 13) return C.BLACK;
  if (y % 4 === 3) return 0x07;
  return x === 5 || x === 10 ? 0x07 : 0x17;
};

const graves: Painter = (x, y) => {
  const lx = x & 7;
  if (y >= 3 && y <= 13 && lx >= 2 && lx <= 5) {
    if (y === 3 && (lx === 2 || lx === 5)) return T;
    if (lx === 2 || y === 13) return C.BLACK;
    return lx === 3 ? 0x10 : 0x00;
  }
  return T;
};

const lilies: Painter = (x, y) => {
  const n = hash(x, y, 7);
  if (n < 22) return 0x16;
  if (n < 30) return 0x26;
  return T;
};

const house: Painter = (x, y) => {
  // thatched roof over plaster walls with a lit doorway
  if (y <= 7) {
    const half = y + 1;
    if (Math.abs(x - 7.5) > half) return T;
    if (Math.abs(x - 7.5) > half - 1 || y === 7) return C.BLACK;
    return (x + y) % 3 === 0 ? 0x08 : 0x18;
  }
  if (x < 2 || x > 13 || y > 15) return T;
  if (x === 2 || x === 13 || y === 15) return C.BLACK;
  if (x >= 6 && x <= 9 && y >= 10) return y === 10 ? C.BLACK : 0x27;
  return 0x37;
};

const shrine: Painter = (x, y) => {
  // small vermilion torii
  if (y === 2 && x >= 1 && x <= 14) return 0x16;
  if (y === 3 && x >= 1 && x <= 14) return C.BLACK;
  if (y === 5 && x >= 3 && x <= 12) return 0x16;
  if ((x === 4 || x === 11) && y >= 3 && y <= 14) return 0x16;
  if ((x === 5 || x === 12) && y >= 4 && y <= 14) return 0x06;
  return T;
};

function gate(kind: number): Painter {
  // chapter entrances: cave mouth, mine frame, crypt arch, temple gate
  const frame = [0x0b, 0x07, 0x00, 0x03][kind];
  const trim = [0x1b, 0x17, 0x10, 0x28][kind];
  return (x, y) => {
    const dx = x - 7.5;
    const arch = y >= 4 && Math.abs(dx) < 4.5 && (y > 7 || dx * dx + (y - 8) * (y - 8) < 20);
    if (arch) return y > 13 ? 0x0f : C.BLACK;
    if (Math.abs(dx) < 7.5 && y >= 1) {
      if (y === 1 || Math.abs(dx) > 6.5) return C.BLACK;
      if (y === 2) return trim;
      return (x + y * 3) % 5 === 0 ? trim : frame;
    }
    return T;
  };
}

const mist: Painter = (x, y, f) => {
  const n = hash(x, y + f * 3, 9);
  return n < 90 ? 0x10 : n < 150 ? 0x00 : n < 170 ? 0x30 : T;
};

const bloodSeal: Painter = (x, y, f) => {
  const dx = x - 7.5, dy = y - 7.5, d = Math.sqrt(dx * dx + dy * dy);
  if (Math.abs(d - 6) < 0.8) return f & 1 ? 0x16 : 0x06;
  if (Math.abs(dx) < 0.8 || Math.abs(dy) < 0.8) return d < 6 ? 0x16 : T;
  return T;
};

const templeSeal: Painter = (x, y, f) => {
  if (x === 0 || x === 15) return C.BLACK;
  const glyph = (x === 7 || x === 8) || y === 5 || y === 10;
  if (glyph && x > 2 && x < 13 && y > 2 && y < 13) return f & 1 ? 0x28 : 0x38;
  return (x + y) & 1 ? 0x03 : 0x13;
};

interface TileDef {
  base?: Painter;
  over?: Painter;
  frames?: number;
}

const DEFS: Record<string, TileDef> = {
  '.': { base: grass },
  ',': { base: road },
  T: { base: forest },
  t: { base: grass, over: tree },
  M: { base: mountain },
  '~': { base: water, frames: 4 },
  '=': { base: bridge },
  g: { base: grass, over: graves },
  r: { base: grass, over: lilies },
  V: { base: grass, over: house },
  v: { base: grass, over: house },
  S: { base: grass, over: shrine },
  '1': { base: grass, over: gate(0) },
  '2': { base: road, over: gate(1) },
  '3': { base: grass, over: gate(2) },
  '4': { base: road, over: gate(3) },
  a: { base: road, over: mist, frames: 4 },
  b: { base: water, over: bloodSeal, frames: 2 },
  c: { base: templeSeal, frames: 2 },
};

const cache = new Map<string, Uint8Array>();

function tile(ch: string, f: number): Uint8Array {
  const d = DEFS[ch] ?? DEFS['.'];
  const ff = d.frames ? f % d.frames : 0;
  const k = ch + ff;
  let px = cache.get(k);
  if (px) return px;
  px = new Uint8Array(256);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let c = d.base ? d.base(x, y, ff) : GRASS[0];
      if (d.over) {
        const o = d.over(x, y, ff);
        if (o !== T) c = o;
      }
      px[y * 16 + x] = c;
    }
  cache.set(k, px);
  return px;
}

/** Draw one overworld tile; `f` is the animation frame counter (frames advance every 16 ticks). */
export function drawWorldTile(r: PixelRenderer, ch: string, x: number, y: number, f: number): void {
  const px = tile(ch, f);
  for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) r.pset(x + xx, y + yy, px[yy * 16 + xx]);
}
