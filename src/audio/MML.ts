/**
 * MML dialect for the sampled orchestra.
 *
 *   c d e f g a b   notes (+ / # sharp, - flat), optional length and dots
 *   {d f a}2        chord: notes that sound together (octave marks inside stay inside)
 *   r               rest          ^len   tie onto the previous note
 *   o4 > <          octave        l8     default length
 *   v0-15           velocity: picks the sample layer and the loudness
 *   q1-8            gate (sounding fraction in eighths)
 *   @name           instrument, e.g. @vln_spic (see Sampler INSTRUMENTS)
 *   y n             vibrato depth in cents     P n   scoop up from n cents flat
 *   [ ... ]n        repeat        L      loop point     |  bar line (checked by tests)
 *   other letters   drums from the song's kit, e.g. t -> taiko_ff
 *
 * Lengths are in a 96-ticks-per-whole-note grid.
 */
export interface NoteEvent {
  tick: number;
  len: number;
  gate: number;
  /** MIDI notes (several for a chord); empty for drums. */
  notes: number[];
  drum: string;
  vel: number;
  inst: string;
  vib: number;
  scoop: number;
}

export interface Channel {
  events: NoteEvent[];
  length: number;
  loopTick: number;
  /** Tick position of every '|' bar line, so tests can check bar lengths. */
  bars: number[];
}

const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const RESERVED = 'abcdefgrolvqyPL';

export const TICKS_WHOLE = 96;

export function expandRepeats(src: string): string {
  let s = src;
  const re = /\[([^[\]]*)\](\d*)/;
  for (let guard = 0; guard < 1000 && re.test(s); guard++) {
    s = s.replace(re, (_m, body: string, n: string) => body.repeat(n ? parseInt(n, 10) : 2));
  }
  return s;
}

export function parseMML(source: string, kit: Record<string, string> = {}, inst = ''): Channel {
  for (const k of Object.keys(kit)) if (k.length !== 1 || RESERVED.includes(k)) throw new Error(`MML: '${k}' cannot be a drum letter`);
  const s = expandRepeats(source);
  let i = 0;
  let tick = 0;
  let octave = 4;
  let defLen = 24;
  let vel = 10;
  let gateQ = 8;
  let vib = 0;
  let scoop = 0;
  let loopTick = 0;
  const events: NoteEvent[] = [];
  const bars: number[] = [];

  const num = (): number | null => {
    let j = i;
    while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
    if (j === i) return null;
    const v = parseInt(s.slice(i, j), 10);
    i = j;
    return v;
  };
  const length = (): number => {
    const n = num();
    let len = n === null ? defLen : Math.round(TICKS_WHOLE / n);
    let add = len;
    while (s[i] === '.') {
      add = add / 2;
      len += add;
      i++;
    }
    return Math.round(len);
  };
  const accidental = (semi: number) => {
    while (s[i] === '+' || s[i] === '#' || s[i] === '-') semi += s[i++] === '-' ? -1 : 1;
    return semi;
  };
  const push = (notes: number[], drum: string) => {
    const len = length();
    events.push({ tick, len, gate: Math.max(1, Math.round((len * gateQ) / 8)), notes, drum, vel, inst, vib, scoop });
    tick += len;
  };

  while (i < s.length) {
    const ch = s[i++];
    if (ch === '|') bars.push(tick);
    if (' \n\t\r|'.includes(ch)) continue;
    if (ch in SEMI) {
      push([12 * (octave + 1) + accidental(SEMI[ch])], '');
    } else if (ch === '{') {
      const notes: number[] = [];
      let o = octave;
      while (i < s.length && s[i] !== '}') {
        const c = s[i++];
        if (c in SEMI) notes.push(12 * (o + 1) + accidental(SEMI[c]));
        else if (c === 'o') o = num() ?? o;
        else if (c === '>') o++;
        else if (c === '<') o--;
        else if (c !== ' ') throw new Error(`MML: unexpected '${c}' in chord at ${i - 1}`);
      }
      i++;
      push(notes, '');
    } else if (ch in kit) {
      push([], kit[ch]);
    } else if (ch === 'r') {
      tick += length();
    } else if (ch === '^') {
      const len = length();
      const last = events[events.length - 1];
      if (last && last.tick + last.len === tick) {
        last.len += len;
        last.gate = Math.max(1, Math.round((last.len * gateQ) / 8));
      }
      tick += len;
    } else if (ch === '@') {
      const m = /^[a-z0-9_]+/.exec(s.slice(i));
      if (!m) throw new Error(`MML: instrument name expected at ${i}`);
      inst = m[0];
      i += m[0].length;
    } else if (ch === 'o') octave = num() ?? 4;
    else if (ch === '>') octave++;
    else if (ch === '<') octave--;
    else if (ch === 'l') defLen = Math.round(TICKS_WHOLE / (num() ?? 4));
    else if (ch === 'v') vel = num() ?? 10;
    else if (ch === 'q') gateQ = num() ?? 8;
    else if (ch === 'y') vib = num() ?? 0;
    else if (ch === 'P') scoop = num() ?? 0;
    else if (ch === 'L') loopTick = tick;
    else throw new Error(`MML: unexpected '${ch}' at ${i - 1}`);
  }
  return { events, length: tick, loopTick, bars };
}
