import { ZH_BITS, ZH_CHARS } from '../data/fontZh';

// 5x7 bitmap glyphs drawn in an 8x8 cell. A bold variant (each row OR-ed with
// itself shifted right) gives the chunky look of FC-era title and HUD text.
const G: Record<string, string> = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '###.. #..#. #...# #...# #...# #..#. ###..',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. #..#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# ##..# #.#.# #..## #...# #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.###. #...# #.... .###. ....# #...# .###.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #..## #.#.# #.#.# #.#.# ##..# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ..##. .#... #.... #####',
  '3': '.###. #...# ....# ..##. ....# #...# .###.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ...#. .##..',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  ',': '..... ..... ..... ..... .##.. ..#.. .#...',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ....# ..##. ..#.. ..... ..#..',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  '-': '..... ..... ..... .###. ..... ..... .....',
  "'": '..#.. ..#.. .#... ..... ..... ..... .....',
  '"': '.#.#. .#.#. ..... ..... ..... ..... .....',
  '/': '....# ...#. ...#. ..#.. .#... .#... #....',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '=': '..... ..... ##### ..... ##### ..... .....',
  '%': '##..# ##.#. ...#. ..#.. .#... .#.## #..##',
  '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
  '#': '.#.#. ##### .#.#. .#.#. .#.#. ##### .#.#.',
  '*': '..... #.#.# .###. ##### .###. #.#.# .....',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
  '▶': '#.... ##... ###.. ####. ###.. ##... #....',
  '♥': '..... .#.#. ##### ##### .###. ..#.. .....',
  '←': '..... ..#.. .#... ##### .#... ..#.. .....',
  '→': '..... ..#.. ...#. ##### ...#. ..#.. .....',
  '↑': '..#.. .###. #.#.# ..#.. ..#.. ..#.. .....',
  '↓': '..... ..#.. ..#.. ..#.. #.#.# .###. ..#..',
  '◆': '..#.. .###. ##### ##### .###. ..#.. .....',
  '◇': '..#.. .#.#. #...# #...# .#.#. ..#.. .....',
  '×': '..... #...# .#.#. ..#.. .#.#. #...# .....',
  '·': '..... ..... ..... ..#.. ..... ..... .....',
  ' ': '..... ..... ..... ..... ..... ..... .....',
};

/** Glyph rows as bitmasks; bit 7 is the leftmost pixel of the 8px cell. */
const THIN = new Map<string, number[]>();
const BOLD = new Map<string, number[]>();

for (const [ch, def] of Object.entries(G)) {
  const rows = def.split(' ').map((r) => {
    let m = 0;
    for (let i = 0; i < 5; i++) if (r[i] === '#') m |= 1 << (6 - i);
    return m;
  });
  rows.push(0);
  THIN.set(ch, rows);
  BOLD.set(ch, rows.map((m) => m | (m >> 1)));
}

export function glyph(ch: string, bold: boolean): number[] {
  const map = bold ? BOLD : THIN;
  return map.get(ch) ?? map.get(ch.toUpperCase()) ?? map.get('?')!;
}

export const CHAR_W = 8;
export const LINE_H = 8;

// ---- Traditional Chinese: 12x13 glyphs baked from an OFL pixel font (src/data/fontZh.ts)

/** Advance of a Chinese glyph; it is drawn from 3px above the Latin cap line. */
export const ZH_W = 12;
export const ZH_H = 13;
export const ZH_TOP = -3;

let zhMap: Map<string, Uint16Array> | null = null;

/** Glyph rows (bit 11 = leftmost pixel) or undefined for characters the 8x8 font draws. */
export function zhGlyph(ch: string): Uint16Array | undefined {
  if (ch.charCodeAt(0) < 0x80 || G[ch]) return undefined;
  if (!zhMap) {
    zhMap = new Map();
    const chars = [...ZH_CHARS];
    chars.forEach((c, i) => {
      const rows = new Uint16Array(ZH_H);
      for (let r = 0; r < ZH_H; r++) rows[r] = parseInt(ZH_BITS.substr((i * ZH_H + r) * 3, 3), 16);
      zhMap!.set(c, rows);
    });
  }
  return zhMap.get(ch);
}

export function charWidth(ch: string): number {
  return zhGlyph(ch) ? ZH_W : CHAR_W;
}

/** Pixel width of a string as drawn by PixelRenderer.text. */
export function measure(str: string): number {
  let w = 0;
  for (const ch of str) w += charWidth(ch);
  return w;
}

const NO_START = '，。、！？：；」』）…─';
const NO_END = '「『（';

/** Wrap mixed Latin / Chinese text to a pixel width: Latin breaks at spaces, Chinese anywhere. */
export function wrapPx(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.toUpperCase().split('\n')) {
    // tokens: Latin words, single spaces, single Chinese characters with their punctuation attached
    const tokens: string[] = [];
    for (const ch of para) {
      const last = tokens[tokens.length - 1];
      if (ch === ' ') tokens.push(' ');
      else if (zhGlyph(ch)) {
        if (last && last !== ' ' && (NO_START.includes(ch) || NO_END.includes(last[last.length - 1]))) tokens[tokens.length - 1] += ch;
        else tokens.push(ch);
      } else if (last && last !== ' ' && !zhGlyph(last[last.length - 1])) tokens[tokens.length - 1] += ch;
      else if (last && NO_END.includes(last[last.length - 1])) tokens[tokens.length - 1] += ch;
      else tokens.push(ch);
    }
    let line = '';
    for (const tok of tokens) {
      if (tok === ' ' && !line) continue;
      if (line && measure(line + tok) > width) {
        out.push(line.trimEnd());
        line = tok === ' ' ? '' : tok;
      } else line += tok;
    }
    out.push(line.trimEnd());
  }
  return out;
}
