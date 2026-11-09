/**
 * Pixel sprites are authored as text rows. '.' (or ' ') is transparent and
 * '1'..'9' index into the palette supplied at draw time, which allows the
 * classic FC trick of palette-swapped enemy variants and white hit-flashes.
 */
export interface Sprite {
  w: number;
  h: number;
  px: Uint8Array; // 0 = transparent, n = palette slot n-1
}

export function spr(rows: string[]): Sprite {
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row.charCodeAt(x);
      if (ch >= 49 && ch <= 57) px[y * w + x] = ch - 48;
    }
  }
  return { w, h, px };
}

export function flipH(s: Sprite): Sprite {
  const px = new Uint8Array(s.w * s.h);
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) px[y * s.w + x] = s.px[y * s.w + (s.w - 1 - x)];
  return { w: s.w, h: s.h, px };
}

/** Concatenate sprites side by side (used to assemble metasprites). */
export function hcat(...parts: Sprite[]): Sprite {
  const w = parts.reduce((a, p) => a + p.w, 0);
  const h = parts.reduce((a, p) => Math.max(a, p.h), 0);
  const px = new Uint8Array(w * h);
  let ox = 0;
  for (const p of parts) {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) px[y * w + ox + x] = p.px[y * p.w + x];
    ox += p.w;
  }
  return { w, h, px };
}

/** Symmetric sprite: author the left half, the right half is mirrored. */
export function sym(rows: string[]): Sprite {
  return spr(rows.map((r) => r + r.split('').reverse().join('')));
}

/** Exact 90-degree clockwise rotation (pixel art survives it unchanged). */
export function rotateCW(s: Sprite): Sprite {
  const w = s.h, h = s.w;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) px[x * w + (s.h - 1 - y)] = s.px[y * s.w + x];
  return { w, h, px };
}
