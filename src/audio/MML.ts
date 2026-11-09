/**
 * Tiny MML dialect for authoring 4-channel FC music.
 *
 *   c d e f g a b   notes (+ / # sharp, - flat), optional length and dots
 *   r               rest          ^len   tie onto previous note
 *   o4 > <          octave        l8     default length
 *   v0-15           volume        @0-3   pulse duty (12.5/25/50/75%)
 *   E n             decay: -1 volume every n frames (0 = hold)
 *   S n             sustain floor the decay stops at (0-15)
 *   q1-8            gate (sounding fraction in eighths)
 *   y n             vibrato depth in cents (long notes only)
 *   D n             chorus: a twin voice detuned by n cents (0 = off)
 *   [ ... ]n        repeat        L      loop point     |  bar line (checked by tests)
 *   k s h p x w t u drums (kick, snare, hat, open hat, crash, woodblock, taiko, shime-daiko)
 *
 * Lengths are in a 96-ticks-per-whole-note grid.
 */
export interface NoteEvent {
  tick: number;
  len: number;
  gate: number;
  midi: number; // -1 for drums
  drum: string;
  vol: number;
  duty: number;
  decay: number;
  sustain: number;
  vib: number;
  chorus: number;
}

export interface Channel {
  events: NoteEvent[];
  length: number;
  loopTick: number;
  /** Tick position of every '|' bar line, so tests can check bar lengths. */
  bars: number[];
}

const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const DRUMS = 'kshpxwtu';

export const TICKS_WHOLE = 96;

export function expandRepeats(src: string): string {
  let s = src;
  const re = /\[([^[\]]*)\](\d*)/;
  for (let guard = 0; guard < 1000 && re.test(s); guard++) {
    s = s.replace(re, (_m, body: string, n: string) => body.repeat(n ? parseInt(n, 10) : 2));
  }
  return s;
}

export function parseMML(source: string): Channel {
  const s = expandRepeats(source);
  let i = 0;
  let tick = 0;
  let octave = 4;
  let defLen = 24;
  let vol = 10;
  let duty = 2;
  let decay = 0;
  let sustain = 0;
  let gateQ = 8;
  let vib = 0;
  let chorus = 0;
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
  const gateOf = (len: number) => Math.max(1, Math.round((len * gateQ) / 8));

  while (i < s.length) {
    const ch = s[i++];
    if (ch === '|') bars.push(tick);
    if (' \n\t\r|'.includes(ch)) continue;
    if (ch in SEMI) {
      let semi = SEMI[ch];
      while (s[i] === '+' || s[i] === '#' || s[i] === '-') semi += s[i++] === '-' ? -1 : 1;
      const len = length();
      events.push({ tick, len, gate: gateOf(len), midi: 12 * (octave + 1) + semi, drum: '', vol, duty, decay, sustain, vib, chorus });
      tick += len;
    } else if (DRUMS.includes(ch)) {
      const len = length();
      events.push({ tick, len, gate: gateOf(len), midi: -1, drum: ch, vol, duty, decay, sustain, vib, chorus });
      tick += len;
    } else if (ch === 'r') {
      tick += length();
    } else if (ch === '^') {
      const len = length();
      const last = events[events.length - 1];
      if (last && last.tick + last.len === tick) {
        last.len += len;
        last.gate = gateOf(last.len);
      }
      tick += len;
    } else if (ch === 'o') octave = num() ?? 4;
    else if (ch === '>') octave++;
    else if (ch === '<') octave--;
    else if (ch === 'l') defLen = Math.round(TICKS_WHOLE / (num() ?? 4));
    else if (ch === 'v') vol = num() ?? 10;
    else if (ch === '@') duty = num() ?? 2;
    else if (ch === 'E') decay = num() ?? 0;
    else if (ch === 'S') sustain = num() ?? 0;
    else if (ch === 'D') chorus = num() ?? 0;
    else if (ch === 'q') gateQ = num() ?? 8;
    else if (ch === 'y') vib = num() ?? 0;
    else if (ch === 'L') loopTick = tick;
    else throw new Error(`MML: unexpected '${ch}' at ${i - 1}`);
  }
  return { events, length: tick, loopTick, bars };
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
