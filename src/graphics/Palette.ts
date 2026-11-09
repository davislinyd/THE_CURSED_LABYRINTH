// 64-entry 2C02-style master palette. Every pixel in the game is one of these indices.
const HEX = [
  '747474', '24188c', '0000a8', '44009c', '8c0074', 'a80010', 'a40000', '7c0800',
  '402c00', '004400', '005000', '003c14', '183c5c', '000000', '000000', '000000',
  'bcbcbc', '0070ec', '2038ec', '8000f0', 'bc00bc', 'e40058', 'd82800', 'c84c0c',
  '887000', '009400', '00a800', '009038', '008088', '000000', '000000', '000000',
  'fcfcfc', '3cbcfc', '5c94fc', 'cc88fc', 'f478fc', 'fc74b4', 'fc7460', 'fc9838',
  'f0bc3c', '80d010', '4cdc48', '58f898', '00e8d8', '787878', '000000', '000000',
  'fcfcfc', 'a8e4fc', 'c4d4fc', 'd4c8fc', 'fcc4fc', 'fcc4d8', 'fcbcb0', 'fcd8a8',
  'fce4a0', 'e0fca0', 'a8f0bc', 'b0fccc', '9cfcf0', 'c4c4c4', '000000', '000000',
];

/** RGBA packed for a little-endian Uint32Array view of ImageData. */
export const PAL_RGBA = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
  const v = parseInt(HEX[i], 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  PAL_RGBA[i] = (255 << 24) | (b << 16) | (g << 8) | r;
}

export const PAL_HEX = HEX.map((h) => '#' + h);

/** Frequently used master palette indices. */
export const C = {
  BLACK: 0x0f,
  GRAY: 0x00,
  LGRAY: 0x10,
  WHITE: 0x30,
  BONE: 0x37,
  CREAM: 0x38,
  DRED: 0x06,
  RED: 0x16,
  BRED: 0x05,
  PINK: 0x26,
  CRIMSON: 0x15,
  OCHRE: 0x17,
  ORANGE: 0x27,
  BROWN: 0x07,
  DOLIVE: 0x08,
  OLIVE: 0x18,
  GOLD: 0x28,
  DGREEN: 0x09,
  GREEN: 0x19,
  DTEAL: 0x0b,
  TEAL: 0x1b,
  LTEAL: 0x1c,
  SLATE: 0x0c,
  NAVY: 0x01,
  BLUE: 0x02,
  SKY: 0x21,
  DPURPLE: 0x03,
  PURPLE: 0x13,
  MAGENTA: 0x04,
  LPURPLE: 0x23,
} as const;

/** NES-style darkening: move one brightness row down per step (index - 0x10). */
export function shade(c: number, steps: number): number {
  if (steps <= 0) return c;
  let v = c;
  for (let i = 0; i < steps; i++) {
    if (v === C.BLACK || (v & 0x0f) >= 0x0d) return C.BLACK;
    v = v < 0x10 ? C.BLACK : v - 0x10;
  }
  return v;
}

/** Brighten one row up per step. */
export function brighten(c: number, steps: number): number {
  let v = c;
  for (let i = 0; i < steps; i++) {
    if (v === C.BLACK) v = 0x00;
    else if (v < 0x30) v += 0x10;
  }
  return v;
}

export function makeFadeMap(steps: number): Uint8Array {
  const m = new Uint8Array(64);
  for (let i = 0; i < 64; i++) m[i] = shade(i, steps);
  return m;
}

export const IDENTITY_MAP = makeFadeMap(0);
export const FADE_MAPS = [0, 1, 2, 3, 4].map(makeFadeMap);

/** Full-screen flash: every color jumps to its brightest row. */
export const FLASH_MAP = (() => {
  const m = new Uint8Array(64);
  for (let i = 0; i < 64; i++) m[i] = i === C.BLACK || (i & 0x0f) >= 0x0d ? 0x00 : 0x30 | (i & 0x0f);
  return m;
})();

/** Inverted flash used for encounters. */
export const INVERT_MAP = (() => {
  const m = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const row = i >> 4, col = i & 0x0f;
    m[i] = col >= 0x0d ? 0x30 : ((3 - row) << 4) | ((col + 6) % 12 + 1);
  }
  return m;
})();
