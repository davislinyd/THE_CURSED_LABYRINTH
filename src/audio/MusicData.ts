import { SongSource } from './MusicSequencer';

// All melodies are original compositions for this game. The action themes lean
// on D minor with a flat-2nd / Phrygian-dominant colour; the labyrinths use the
// miyako-bushi scale (E F A B C) for a yokai feel. Every bar starts with '|',
// and tests check that each bar line lands on a whole 4/4 bar.

const NAMES = ['c', 'c+', 'd', 'e-', 'e', 'f', 'f+', 'g', 'a-', 'a', 'b-', 'b'];
const PC: Record<string, number> = {
  c: 0, 'c+': 1, 'd-': 1, d: 2, 'd+': 3, 'e-': 3, e: 4, f: 5, 'f+': 6, g: 7, 'g+': 8, 'a-': 8, a: 9, 'a+': 10, 'b-': 10, b: 11,
};

/** One note with an absolute octave: n(38, 8) -> 'o2 d8 '. */
const n = (m: number, len: string | number) => `o${Math.floor(m / 12) - 1} ${NAMES[m % 12]}${len} `;
/** Bass roots sit in the triangle's sweet spot, G1..F#2. */
const low = (name: string) => (PC[name] >= 7 ? 24 : 36) + PC[name];
const times = (k: number, s: string) => s.repeat(k);

/** Bars of chord roots ('d b-/c a'); a slash splits a bar in two halves. */
function bassline(chords: string, pattern: (root: number, beats: number) => string): string {
  return chords
    .trim()
    .split(/\s+/)
    .map((bar) => {
      const parts = bar.split('/');
      return '| ' + parts.map((c) => pattern(low(c), 4 / parts.length)).join('');
    })
    .join('');
}

// bass patterns
const octaves = (r: number, beats: number) => times(beats, n(r, 8) + n(r + 12, 8));
const gallop = (r: number, beats: number) => times(beats, n(r, 8) + n(r, 16) + n(r + 12, 16));
const riff = (r: number) => times(2, n(r, 8) + n(r, 16) + n(r, 16)) + n(r + 1, 8) + n(r, 16) + n(r, 16) + n(r - 1, 8) + n(r + 12, 8);
const creep = (r: number) => [0, 0, 7, 0, 8, 0, 7, 0].map((k) => n(r + k, 8)).join('');
const march = (r: number) => n(r, '4.') + n(r, 8) + n(r, 4) + n(r + 7, 4);
const stately = (r: number) => n(r, 2) + n(r + 7, 4) + n(r + 12, 4);

/** Accompaniment figures over 4-note voicings (MIDI numbers, low to high). */
const arp16 = (...bars: number[][]) => bars.map((v) => '| ' + times(4, v.map((m) => n(m, 16)).join(''))).join('');
const harp8 = (...bars: number[][]) => bars.map((v) => '| ' + [0, 1, 2, 3, 2, 1, 0, 1].map((i) => n(v[i], 8)).join('')).join('');

// ---------------------------------------------------------------- BATTLE
// Side-scrolling stages and ambushes: the hot-blooded main theme.

const BATTLE_A7 =
  '| o5 d4 o4 a8 o5 d8 f8 g8 a4 | b-8 a8 g8 f8 g4 e4 | f4. e8 d4 c8 d8 | e2 c+4 o4 a4 ' +
  '| o5 d4 o4 a8 o5 d8 f8 g8 a4 | b-8 a8 g8 a8 o6 c4 o5 b-8 a8 | g8 f8 e8 f8 g4 c+4 ';
const BATTLE_B =
  '| o5 f4. g8 f8 d8 o4 b-4 | o5 c8 d8 e8 g8 e4 c4 | d4. f8 a4 g8 f8 | a2 r8 a8 b-8 o6 c8 ' +
  '| o5 b-4. g8 e-4 g8 b-8 | o6 c4. o5 b-8 g4 e-4 | o4 a8 b-8 o5 c+8 d8 e8 f8 g8 b-8 | a2 e4 c+4 ';
const BATTLE_DRUM_A = '| x8 h8 s8 h8 k8 k8 s8 h8 ' + times(6, '| k8 h8 s8 h8 k8 k8 s8 h8 ') + '| k8 h8 s8 h8 s16 s16 s16 s16 s8 s8 ';
const BATTLE_DRUM_B =
  '| x8 s8 k8 s8 k8 s8 k16 k16 s8 ' + times(6, '| k8 s8 k8 s8 k8 s8 k16 k16 s8 ') + '| s16 s16 s16 s16 s16 s16 s16 s16 s8 s8 s8 s8 ';

const BATTLE: SongSource = {
  tempo: 160,
  loop: true,
  reverb: 0.18,
  echo: { delay: 12, vol: 0.3 },
  sq1:
    '@2 v12 E3 S8 q7 y12 D8 | o5 d16 d16 r8 d16 d16 r8 d8 r8 c8 d8 | e-4 d4 c+4 o4 a4 L ' +
    BATTLE_A7 + '| o5 d2. r4 ' + BATTLE_A7 + '| o5 d4 f8 a8 o6 d4 r4 ' + BATTLE_B,
  sq2:
    '@1 v7 E3 S5 q7 y8 | o4 d16 d16 r8 d16 d16 r8 d8 r8 c8 d8 | e-4 d4 c+4 o3 a4 L ' +
    'v6 E4 S5 q8 | o4 f1 | f2 e2 | d1 | c+1 | a1 | b-2 o5 c2 | o4 b-2 a2 | a1 ' +
    'v8 E3 S6 q7 | o4 a4 f8 a8 o5 d8 e8 f4 | g8 f8 e8 d8 e4 c4 | d4. c8 o4 b-4 a8 b-8 | o5 c+2 o4 a4 e4 ' +
    '| o4 a4 f8 a8 o5 d8 e8 f4 | g8 f8 e8 f8 a4 g8 f8 | d8 d8 c+8 d8 e4 o4 a4 | o4 a4 o5 d8 f8 a4 r4 ' +
    'v6 E4 S5 q8 | o4 d2 f2 | e2 g2 | f1 | f2 a2 | g1 | g2 b-2 | c+1 | e2 c+2 ',
  tri:
    'q7 | o2 d8 r8 d8 r8 d8 r8 c8 d8 | e-4 d4 c+4 o1 a4 L ' +
    bassline('d b-/c b- a d b-/c g/a d', octaves) +
    bassline('d b-/c b- a d b-/c g/a d', octaves) +
    bassline('b- c d d e- e- a a', gallop),
  noise:
    'v13 | k8 r8 k8 r8 k8 r8 s8 s8 | s16 s16 s16 s16 s8 s8 s16 s16 s16 s16 s8 s8 L ' + BATTLE_DRUM_A + BATTLE_DRUM_A + BATTLE_DRUM_B,
};

// ---------------------------------------------------------------- WORLD
// The overland march: wide leaps, A minor with a yo-scale colour.

const WORLD_A =
  '| o4 a4. o5 e8 a4 g8 e8 | d4. e8 g4 d4 | c4. d8 f4 a4 | g+4. f8 e2 ' +
  '| o4 a4. o5 e8 a4 g8 e8 | d4. e8 g4 b4 | a4 g8 f8 g4 d4 | e8 g8 a2. ';
const WORLD_DRUM_A = '| x8 h8 s8 h8 k8 h8 s8 h8 ' + times(6, '| k8 h8 s8 h8 k8 k8 s8 h8 ') + '| k8 h8 s8 h8 s16 s16 s8 s16 s16 s8 ';

const WORLD: SongSource = {
  tempo: 132,
  loop: true,
  reverb: 0.2,
  echo: { delay: 12, vol: 0.3 },
  sq1:
    '@2 v11 E3 S8 q7 y10 D8 ' + WORLD_A + WORLD_A +
    '| o5 c4 f4 a4. g8 | b4 g4 d4. e8 | e4 g4 b4. a8 | a2 e2 | f4. e8 d4 f4 | g4. a8 b4 o6 d4 | e4. d8 c4 o5 b4 | g+4 a4 b2 ',
  sq2:
    '@2 v7 E2 S0 q4 ' +
    '| r8 o4 e8 r8 c8 r8 e8 r8 c8 | r8 o4 d8 r8 o3 b8 r8 o4 d8 r8 o3 b8 | r8 o4 c8 r8 o3 a8 r8 o4 c8 r8 o3 a8 | r8 o4 e8 r8 o3 g+8 r8 o4 e8 r8 o3 g+8 ' +
    '| r8 o4 e8 r8 c8 r8 e8 r8 c8 | r8 o4 d8 r8 o3 b8 r8 o4 d8 r8 o3 b8 | r8 o4 c8 r8 o3 a8 r8 o4 d8 r8 o3 b8 | r8 o4 e8 r8 c8 r8 e8 r8 c8 ' +
    '@1 v8 E3 S6 q7 | o4 e4. o5 c8 e4 e8 c8 | o4 b4. o5 c8 d4 o4 b4 | o4 a4. b8 o5 c4 f4 | o5 e4. d8 o4 g+2 ' +
    '| o4 e4. o5 c8 e4 e8 c8 | o4 b4. o5 c8 d4 g4 | o5 f4 e8 d8 d4 o4 b4 | o5 c8 e8 e2. ' +
    'v6 E4 S5 q8 y8 | o4 a1 | b1 | g1 | e1 | a1 | g2 b2 | g+1 | g+2 b2 ',
  tri: 'q7 ' + bassline('a g f e a g f/g a', octaves) + bassline('a g f e a g f/g a', octaves) + bassline('f g e a d g e e', octaves),
  noise:
    'v12 ' + WORLD_DRUM_A + WORLD_DRUM_A +
    '| x8 h8 s8 h8 k8 h8 s8 h8 ' + times(5, '| k8 h8 s8 h8 k8 h8 s8 h8 ') + '| k8 h8 s8 h8 k8 k8 s8 s8 ' +
    '| s16 s16 s16 s16 s8 s8 s16 s16 s16 s16 s8 s8 ',
};

// ---------------------------------------------------------------- DUNGEON
// The labyrinths: a breathy miyako-bushi flute over a creeping bass.

const DUNGEON: SongSource = {
  tempo: 116,
  loop: true,
  reverb: 0.38,
  echo: { delay: 18, vol: 0.4 },
  sq1:
    '@2 v10 E6 S7 q8 y16 D6 ' +
    '| o5 e4. f8 e4 c4 | o4 b2. r4 | a4. b8 o5 c4 e4 | f2 e2 | e4. f8 a4 f4 | e2 c4 o4 b8 o5 c8 | o4 b4 a4 f4 a4 | e1 ' +
    '| o5 a4 b4 o6 c4 o5 b8 a8 | b2 a4 e4 | f4 a4 o6 c4 o5 a8 f8 | e2. r4 | d4 f4 a4 f8 d8 | e2 f4 g+4 | a4 g+8 f8 e4 c4 | o4 b1 ',
  sq2:
    '@1 v5 E8 S4 q8 y10 ' +
    '| o4 b1 | b1 | e1 | b1 | e1 | e1 | d1 | o3 b1 ' +
    '| o4 e1 | e1 | c1 | c1 | d1 | o3 g+1 | o4 c1 | o3 b1 ',
  tri: 'q6 ' + bassline('e e a e a a d e a a f f d e f e', creep),
  noise: 'v11 ' + times(8, '| t8 r8 r8 t8 r4 w8 w16 w16 ') + '| x8 h8 h8 t8 r8 h8 w8 h8 ' + times(7, '| t8 h8 h8 t8 r8 h8 w8 h8 '),
};

// ---------------------------------------------------------------- BOSS
// C minor, galloping chromatic bass, diminished climbs.

const CM = [60, 63, 67, 72], DB = [61, 65, 68, 73], AB = [56, 60, 63, 68], BB = [58, 62, 65, 70], G7 = [55, 59, 62, 65], FM = [60, 65, 68, 72];
const BOSS_DRUMS =
  '| x8 s8 k8 s8 k8 s8 k16 k16 s8 ' + times(6, '| k8 s8 k8 s8 k8 s8 k16 k16 s8 ') + '| s16 s16 s16 s16 s8 s8 s16 s16 s16 s16 s8 s8 ';

const BOSS: SongSource = {
  tempo: 168,
  loop: true,
  reverb: 0.14,
  echo: { delay: 6, vol: 0.25 },
  sq1:
    '@1 v14 E2 S11 q7 y10 D10 ' +
    '| o5 c8 c8 o4 g8 o5 c8 e-8 d8 c8 o4 g8 | o5 e-4 f4 g4. e-8 | f8 e-8 d-8 c8 d-4 f4 | e-4. d-8 c2 ' +
    '| a-8 g8 a-8 o6 c8 e-4 c4 | d4 o5 b-8 a-8 b-4 f4 | g4 a-8 g8 f8 e-8 d8 o4 b8 | o5 d4 f4 a-4 b4 ' +
    '| o5 f4. a-8 o6 c4 o5 a-4 | g8 a-8 g8 f8 e-4 c4 | g4. o6 c8 e-4 d4 | c2 o5 g4 e-4 ' +
    '| f4. a-8 o6 d-4 c4 | o5 a-8 b-8 a-8 g8 f4 a-4 | g8 a-8 b8 o6 c8 d8 e-8 f8 g8 | g2 d4 o5 b4 ',
  sq2: '@0 v5 E2 S2 q6 ' + arp16(CM, CM, DB, CM, AB, BB, G7, G7, FM, FM, CM, CM, DB, DB, G7, G7),
  tri: 'q7 ' + bassline('c c d- c a- b- g g f f c c d- d- g g', riff),
  noise: 'v13 ' + BOSS_DRUMS + BOSS_DRUMS,
};

// ---------------------------------------------------------------- TEMPLE
// The final temple: a B minor processional with taiko and a Neapolitan C.

const TEMPLE_FILL = '| t8 t8 t8 t8 u16 u16 u16 u16 u8 u8 ';

const TEMPLE: SongSource = {
  tempo: 104,
  loop: true,
  reverb: 0.42,
  echo: { delay: 24, vol: 0.35 },
  sq1:
    '@2 v10 E6 S7 q8 y16 D8 ' +
    '| o4 b2 o5 d4 c+8 d8 | e2. d4 | g4 f+8 e8 d4 e4 | c+2. o4 a+4 | o5 f+2 e4 d8 e8 | d4 o4 b4 o5 d4 g4 | g4. e8 c4 e4 | c+2 o4 a+2 ' +
    '| o5 e4 g4 b4. a8 | g2 f+4 e4 | f+4 b4 o6 d4. c+8 | o5 b2. r4 | b4 a8 g8 d4 g4 | a4 g8 f+8 e4 c+4 | f+4. e8 d4 c+4 | c+1 ',
  sq2:
    '@1 v6 E8 S5 q8 y8 ' +
    '| o4 f+1 | g1 | b1 | a+1 | b1 | g1 | e1 | f+2 a+2 ' +
    '| o4 g1 | b1 | f+1 | f+1 | d1 | e1 | c+1 | o3 a+1 ',
  tri: 'q8 ' + bassline('b g e f+ b g c f+ e e b b g a f+ f+', march),
  noise:
    'v12 ' + times(7, '| t4 r8 t8 t4 w4 ') + TEMPLE_FILL + '| x4 r8 t8 t4 w4 ' + times(6, '| t4 r8 t8 t4 w4 ') + TEMPLE_FILL,
};

// ---------------------------------------------------------------- TITLE
// Taiko roll, then a stately D minor theme that rises to the relative major.

const TITLE: SongSource = {
  tempo: 88,
  loop: true,
  reverb: 0.34,
  echo: { delay: 18, vol: 0.35 },
  sq1:
    '@2 v10 E6 S8 q8 y14 D8 | r1 | r1 L ' +
    '| o4 a4 o5 d4 e4 f4 | f2 e8 d8 c4 | d2. o4 b-4 | a1 | a4 o5 d4 e4 f4 | g4 f4 e4 d4 | g2 f4 e-4 | c+2 e2 ' +
    '| o5 a4. g8 f4 c4 | g4. f8 e4 c4 | f4. e8 d4 a4 | a2 g4 e4 | f4. g8 f4 d4 | c2 o4 a4 o5 c4 | d4 e8 f8 g4 b-4 | a1 ',
  sq2:
    '@1 v6 E8 S5 q8 y8 | o3 d1 | c+1 L ' +
    '| o4 f1 | f1 | d1 | c+1 | f1 | d1 | e-1 | c+1 ' +
    '| o4 c1 | e1 | d1 | c+1 | d1 | c1 | o3 b-1 | o4 c+1 ',
  tri: 'q8 | o2 d1 | o1 a1 L ' + bassline('d b- g a d b- e- a f c d a b- f g a', stately),
  noise:
    'v12 | t4 r4 t8 t8 t4 | t8 t8 t8 t8 t16 t16 t16 t16 x4 L ' +
    times(7, '| t4 h8 h8 s4 h8 h8 ') + '| t4 h8 h8 s8 s16 s16 s8 s8 ' +
    '| x4 h8 h8 s4 h8 h8 ' + times(6, '| t4 h8 h8 s4 h8 h8 ') + '| t8 t8 s8 s8 u16 u16 u16 u16 s8 s8 ',
};

// ---------------------------------------------------------------- ENDING
// Dawn: a gentle D major song over a harp-like arpeggio.

const D_ = [57, 62, 66, 69], A_ = [57, 61, 64, 69], BM = [59, 62, 66, 71], FSM = [57, 61, 66, 69], G_ = [59, 62, 67, 71];

const ENDING: SongSource = {
  tempo: 80,
  loop: true,
  reverb: 0.34,
  echo: { delay: 18, vol: 0.35 },
  sq1:
    '@1 v12 E6 S10 q8 y14 D8 ' +
    '| o5 f+2 e4 d4 | c+2 e4 a4 | b2 a4 f+4 | a2 f+4 c+4 | d4 e4 f+4 g4 | a2 f+4 d4 | b4 o6 d4 o5 b4 g4 | a2 c+4 e4 ' +
    '| o5 a4. f+8 a4 o6 d4 | c+2 o5 a4 e4 | f+4. g8 f+4 d4 | c+2. o4 a4 | b4 o5 d4 g4 b4 | a4 g4 f+4 e4 | f+2. e4 | d1 ',
  sq2: '@2 v6 E3 S2 q6 ' + harp8(D_, A_, BM, FSM, G_, D_, G_, A_, D_, A_, BM, FSM, G_, A_, D_, D_),
  tri: 'q8 ' + bassline('d a b f+ g d g a d a b f+ g a d d', stately),
  noise: 'v7 ' + times(15, '| k8 h8 h8 h8 s8 h8 h8 h8 ') + '| k8 h8 h8 h8 s8 h8 s8 s8 ',
};

// ---------------------------------------------------------------- jingles

const VICTORY: SongSource = {
  tempo: 144,
  loop: false,
  reverb: 0.22,
  echo: { delay: 6, vol: 0.25 },
  sq1: '@2 v12 E3 S8 q7 D8 | o5 d8. d16 d8 d8 d4 o4 a8 o5 d8 | e8. e16 e8 e8 e4 c+8 e8 | f+4 a4 b4 o6 c+4 | d2. r4 ',
  sq2: '@1 v8 E3 S6 q7 | o4 a8. a16 a8 a8 a4 f+8 a8 | o5 c+8. c+16 c+8 c+8 c+4 o4 a8 o5 c+8 | d4 f+4 g4 a4 | a2. r4 ',
  tri: 'q7 | o2 d4 o1 a4 o2 d4 o1 a4 | a4 o2 e4 o1 a4 o2 e4 | o2 d4 f+4 g4 a4 | d2. r4 ',
  noise: 'v12 | s8. s16 s8 s8 k4 s8 s8 | s8. s16 s8 s8 k4 s8 s8 | k4 k4 k4 s8 s8 | x2. r4 ',
};

const GAMEOVER: SongSource = {
  tempo: 72,
  loop: false,
  reverb: 0.38,
  echo: { delay: 18, vol: 0.3 },
  sq1: '@2 v10 E8 S7 q8 y16 D8 | o5 a2 g4 f4 | e2 d4 c+4 | d4 f4 e4 c+4 | d1 ',
  sq2: '@1 v6 E8 S5 q8 | o4 f2 e4 d4 | c+2 o3 a4 a4 | b-4 o4 d4 c+4 o3 a4 | a1 ',
  tri: 'q8 | o2 d1 | o1 a1 | b-2 a2 | o2 d1 ',
  noise: 'v8 | t2 r2 | r1 | t2 r2 | r1 ',
};

export const SONGS = { TITLE, DUNGEON, WORLD, BATTLE, BOSS, VICTORY, GAMEOVER, ENDING, TEMPLE };
export type SongName = keyof typeof SONGS;
