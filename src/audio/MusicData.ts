import type { SongDef } from './MusicPlayer';

// All melodies are original compositions for this game. Harmony leans on D minor
// with a flat-2nd (Phrygian) colour; melodies use the miyako-bushi scale
// (D Eb G A Bb) for the yokai feel. The flute plays with scoops and vibrato in
// the manner of a shakuhachi; the koto part is played on a Vietnamese dan tranh.
// Every bar starts with '|', and tests check that bar lines fall on whole bars.

// ---------------------------------------------------------------- helpers

const NAMES = ['c', 'c+', 'd', 'e-', 'e', 'f', 'f+', 'g', 'a-', 'a', 'b-', 'b'];
/** Absolute pitch: 62 -> 'o4d'. */
const abs = (m: number) => `o${Math.floor(m / 12) - 1}${NAMES[m % 12]}`;
const LEN: Record<number, string> = { 4: '1', 3: '2.', 2: '2', 1.5: '4.', 1: '4', 0.75: '8.', 0.5: '8', 0.25: '16' };
const len = (beats: number) => {
  const l = LEN[beats];
  if (!l) throw new Error(`no MML length for ${beats} beats`);
  return l;
};
const note = (m: number, beats: number) => `${abs(m)}${len(beats)} `;
const chord = (ms: number[], beats: number) => `{${ms.map(abs).join(' ')}}${len(beats)} `;

const ROOT: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, Ab: 8, A: 9, Bb: 10, B: 11 };
const QUALITY: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '5': [0, 7], sus4: [0, 5, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10] };

function parseChord(name: string): { root: number; pcs: number[] } {
  const m = /^([A-G][#b]?)(.*)$/.exec(name);
  const root = m ? ROOT[m[1]] : undefined;
  const q = m ? QUALITY[m[2]] : undefined;
  if (root === undefined || !q) throw new Error(`unknown chord ${name}`);
  return { root, pcs: q.map((i) => (root + i) % 12) };
}

/** `count` chord tones from `low` upward. */
function tones(name: string, low: number, count: number): number[] {
  const { pcs } = parseChord(name);
  const out: number[] = [];
  for (let m = low; out.length < count; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
}

/** The chord's root in [low, low + 11]. */
const root = (name: string, low: number) => low + ((((parseChord(name).root - low) % 12) + 12) % 12);

type Voicing = (chord: string, beats: number) => string;

/** One bar per chord; 'A/B' splits a bar in halves, '-' is a silent bar. */
function bars(chords: string, voicing: Voicing): string {
  return chords
    .trim()
    .split(/\s+/)
    .map((bar) => {
      const parts = bar.split('/');
      const beats = 4 / parts.length;
      return '| ' + parts.map((c) => (c === '-' ? `r${len(beats)} ` : voicing(c, beats))).join('');
    })
    .join('');
}

const rests = (n: number) => '| r1 '.repeat(n);

// voicings
const pad = (low: number, count: number): Voicing => (c, b) => chord(tones(c, low, count), b);
const fifth = (low: number): Voicing => (c, b) => chord([root(c, low), root(c, low) + 7], b);
const bass = (low: number): Voicing => (c, b) => note(root(c, low), b);
const arp = (low: number, count: number, order: number[], step = 0.5): Voicing => (c, b) => {
  const t = tones(c, low, count);
  let s = '';
  for (let i = 0; i < b / step; i++) s += note(t[order[i % order.length]], step);
  return s;
};
const walk = (low: number): Voicing => (c, b) => {
  const r = root(c, low);
  return [r, r + 7, r + 12, r + 7].slice(0, b).map((m) => note(m, 1)).join('');
};
/** Eighth-note ostinato from offsets above the chord root. */
const ostinato = (low: number, offsets: number[]): Voicing => (c, b) => {
  const r = root(c, low);
  let s = '';
  for (let i = 0; i < b * 2; i++) s += note(r + offsets[i % offsets.length], 0.5);
  return s;
};

/** Drum letters for every song (no MML command letters). */
const KIT: Record<string, string> = {
  T: 'taiko_ff', t: 'taiko_f', k: 'taiko_mf', z: 'taiko_pp', U: 'taiko_stick', u: 'taiko_stick_soft', R: 'taiko_rim',
  B: 'bdrum_ff', J: 'frame_lo', H: 'frame_hi', Y: 'timp_roll_lo', W: 'timp_roll_hi',
  G: 'gong_ff', h: 'gong_mp', X: 'gong_roll', Q: 'gong_scrape', S: 'cym_swell', s: 'cym_soft', C: 'crash',
  w: 'woodblock', x: 'clapper', i: 'rin', Z: 'bowl', N: 'log_lo', n: 'log_hi',
};

// stage positions: violins left, celli right, horns centre-left, koto left, harp right
const P = { vln: -0.38, vla: 0.12, vc: 0.32, cb: 0.42, hn: -0.16, tbn: 0.2, fl: 0.08, koto: -0.28, harp: 0.3, bell: 0.25 };

// ---------------------------------------------------------------- TITLE
// Lantern-lit main theme: shakuhachi over koto and strings, then the full
// orchestra with taiko.

const TITLE_A = 'Dm Dm Bb Dm Gm Eb Gm A';
const TITLE_B = 'Bb Dm Eb Dm Gm Eb Bb/A Dm';
const TITLE_MELODY_B = '| o5 d2 e-4 g4 | a1 | b-4 a4 g4 e-4 | d1 | g2 a4 b-4 | a2 g4 e-4 | d4 e-4 g4 a4 | d1 ';

const TITLE: SongDef = {
  tempo: 66,
  loop: true,
  reverb: 0.5,
  kit: KIT,
  tracks: [
    {
      inst: 'fl_sus', vol: 1.2, pan: P.fl, rev: 0.6,
      mml: 'y14 P35 v11 | r1 | r1 L' +
        '| o4 a2 b-8 a8 g4 | a1 | o5 d4. e-8 d4 o4 b-4 | a1 | g4. a8 b-4 a4 | g4 e-4 d2 | e-4 g4 a4 b-4 | a1 ' +
        '| r1 | r1 | r1 | r1 | v9 o5 g2 a4 b-4 | a2 g4 e-4 | d4 e-4 g4 a4 | d1 ',
    },
    {
      inst: 'hn_sus', vol: 0.65, pan: P.hn, rev: 0.6,
      mml: '| r1 | r1 L' + rests(4) + '| v7 o4 d1 | e-1 | d1 | c+1 ' + 'v12 ' + TITLE_MELODY_B.replace(/o5/g, 'o4'),
    },
    { inst: 'vln_sus', vol: 0.8, pan: P.vln, mml: '| r1 | r1 L v6 ' + bars(TITLE_A, pad(69, 2)) + 'v12 ' + TITLE_MELODY_B },
    { inst: 'vla_sus', vol: 0.35, pan: P.vla, mml: '| r1 | r1 L v7 ' + bars(TITLE_A, pad(57, 2)) + 'v9 ' + bars(TITLE_B, pad(57, 3)) },
    { inst: 'vc_sus', vol: 0.9, pan: P.vc, mml: 'v7 | o2 d1 | ^1 L v8 ' + bars(TITLE_A, fifth(38)) + 'v10 ' + bars(TITLE_B, fifth(38)) },
    { inst: 'cb_sus', vol: 0.5, pan: P.cb, mml: 'v8 | o1 d1 | ^1 L v9 ' + bars(`${TITLE_A} ${TITLE_B}`, bass(31)) },
    {
      inst: 'koto', vol: 0.5, pan: P.koto, rev: 0.45,
      mml: '| r1 | v10 o5 d8 o4 a8 b-8 a8 g8 e-8 d4 L v9 ' + bars(TITLE_A, arp(50, 5, [0, 2, 3, 4, 3, 2, 1, 2])) + 'v11 ' + bars(TITLE_B, arp(50, 5, [0, 2, 3, 4, 3, 2, 1, 2])),
    },
    { inst: 'chimes', vol: 0.9, pan: P.bell, rev: 0.8, mml: '| r1 | r1 L v8 | o5 d1 | r1 | r1 | r1 | d1 | r1 | r1 | r1 ' + rests(8) },
    {
      inst: '', vol: 0.75, rev: 0.35,
      mml: '| r1 | r1 L v9 [| z2 r2 ]7 | z4 z4 r2 v13 [| T4 r8 t8 T4 t8 t8 ]7 | T8 t8 t8 t8 T8 t8 T4 ',
    },
    { inst: '', vol: 0.55, rev: 0.5, mml: 'v11 | X1 | r2 S2 L | G1 | r1 | r1 | r1 | h1 | r1 | r1 | r2 S2 | G1 | r1 | r1 | r1 | s1 | r1 | r1 | r2 S2 ' },
  ],
};

// ---------------------------------------------------------------- WORLD
// The lonely road between villages: koto ostinato, pizzicato walk, flute song.

const WORLD_A = 'Am Am F G Am Am Dm E';
const WORLD_B = 'F G Am Am Dm Bb E E';
const WORLD_MELODY_B = '| o5 c2 f4 a4 | g2. d4 | e4 a4 g4 e4 | a2 g4 e4 | f2 a4 o6 d4 | d2 o5 b-4 a4 | g+2 b4 o6 d4 | o5 e1 ';
const HAND_DRUMS = '| J8 w8 H8 w8 J8 J8 H8 w8 ';

const WORLD: SongDef = {
  tempo: 92,
  loop: true,
  reverb: 0.35,
  kit: KIT,
  tracks: [
    {
      inst: 'fl_sus', vol: 1.1, pan: P.fl, rev: 0.55,
      mml: 'y12 P30 v11 | r1 L' +
        '| o5 e2 d8 c8 d4 | o4 a2. r4 | o5 c4 d4 e4 f4 | g2 f8 e8 d4 | e4. c8 o4 a2 | g4 a4 o5 c4 d4 | f2 e4 d4 | e1 ' +
        'v8 | o5 a1 | b1 | o6 c1 | o5 a1 | a1 | b-1 | b1 | g+1 ',
    },
    { inst: 'vln_sus', vol: 0.55, pan: P.vln, mml: '| r1 L v6 ' + bars(WORLD_A, pad(64, 2)) + 'v12 ' + WORLD_MELODY_B },
    {
      inst: 'hn_sus', vol: 0.55, pan: P.hn, rev: 0.55,
      mml: '| r1 L' + rests(4) + '| v8 o4 c1 | e1 | f1 | g+1 v10 ' + WORLD_MELODY_B.replace(/o5/g, 'o4').replace(/o6/g, 'o5'),
    },
    { inst: 'vla_sus', vol: 0.35, pan: P.vla, mml: '| r1 L v7 ' + bars(WORLD_A, pad(57, 2)) + 'v9 ' + bars(WORLD_B, pad(57, 2)) },
    { inst: 'vc_pizz', vol: 0.7, pan: P.vc, rev: 0.3, mml: '| r1 L v10 ' + bars(`${WORLD_A} ${WORLD_B}`, walk(40)) },
    { inst: 'cb_sus', vol: 0.4, pan: P.cb, mml: '| r1 L v7 ' + bars(`${WORLD_A} ${WORLD_B}`, bass(33)) },
    {
      inst: 'koto', vol: 0.5, pan: P.koto, rev: 0.4,
      mml: 'v10 | o3 a8 o4 e8 a8 b8 o5 c8 o4 b8 a8 e8 L v9 ' + bars(WORLD_A, arp(57, 5, [0, 1, 2, 3, 4, 3, 2, 1])) + 'v10 ' + bars(WORLD_B, arp(57, 5, [0, 1, 2, 3, 4, 3, 2, 1])),
    },
    { inst: '', vol: 0.55, rev: 0.3, mml: '| r1 L v9 ' + HAND_DRUMS.repeat(15) + '| J8 H8 J8 H8 J16 J16 H16 H16 J8 H8 ' },
    { inst: '', vol: 1.0, rev: 0.35, mml: '| r1 L' + rests(8) + 'v10 [| z4 r4 z4 r8 z8 ]8' },
  ],
};

// ---------------------------------------------------------------- DUNGEON
// The labyrinths: drones, tremolo, glass and bowed psaltery, a koto that
// answers from the dark.

const DUNGEON_CHORDS = 'E5 E5 F5 F5 E5 E5 Am Am F F E5 E5 Dm Dm F/E5 E5';

const DUNGEON: SongDef = {
  tempo: 60,
  loop: true,
  reverb: 0.7,
  kit: KIT,
  tracks: [
    { inst: 'cb_sus', vol: 0.55, pan: P.cb, mml: 'v7 ' + bars(DUNGEON_CHORDS, bass(28)) },
    { inst: 'vc_trem', vol: 0.45, pan: P.vc, mml: 'v6 ' + bars(DUNGEON_CHORDS, fifth(40)) },
    { inst: 'glass', vol: 0.4, pan: -0.3, rev: 0.8, mml: 'v7 | r1 | r1 | o5 b1 | ^1 | r1 | r1 | o6 c1 | ^2 r2 | r1 | r1 | o5 a1 | ^1 | r1 | r1 | f1 | e1 ' },
    { inst: 'psaltery', vol: 0.4, pan: 0.35, rev: 0.75, mml: 'v6 ' + rests(4) + '| o5 b1 | o6 c1 | o5 a1 | b1 ' + rests(4) + '| o5 a1 | f1 | a2 g+2 | g+1 ' },
    {
      inst: 'koto', vol: 0.8, pan: P.koto, rev: 0.6,
      mml: 'v8 | r1 | r2 o4 e8 f8 a4 | r1 | r2 b8 a8 f4 | r1 | r2 o5 c8 o4 b8 a4 | r1 | r2 f8 e8 e4 ' +
        '| r1 | v10 r4 o5 c8 o4 b8 a8 f8 e4 | r1 | v8 r2 o4 b8 o5 c8 o4 b4 | r1 | r2 a8 f8 e4 | r1 | r2 e8 f8 e4 ',
    },
    {
      inst: '', vol: 0.8, rev: 0.6,
      mml: 'v9 | N2 r4 n4 | r1 | N2 r4 n4 | r2 n4 n4 | N2 r4 n4 | r1 | N2 r4 n4 | v7 Y1 v9 | N2 r4 n4 | r1 | N2 r4 n4 | r2 n4 n4 | N2 r4 n4 | r1 | N2 n4 n4 | v7 Y1 ',
    },
    { inst: '', vol: 0.7, rev: 0.7, mml: 'v8 | h1 | r1 | r1 | r2 S2 | r1 | r1 | r1 | r1 | h1 | r1 | r1 | r2 S2 | r1 | r1 | r1 | Q1 ' },
    { inst: 'chimes', vol: 1.0, pan: P.bell, rev: 0.9, mml: 'v8 | o4 e1 ' + rests(7) + '| e1 ' + rests(7) },
    { inst: 'vln_trem', vol: 0.5, pan: P.vln, rev: 0.7, mml: rests(12) + 'v6 | o5 b1 | ^1 | a1 | g+1 ' },
  ],
};

// ---------------------------------------------------------------- BATTLE
// Swords drawn: spiccato strings, taiko, horns.

const BATTLE_A = 'Dm Dm Eb Dm Dm Dm Bb A';
const BATTLE_B = 'Gm Gm Dm Dm Eb Eb A A';
const BATTLE_ALL = `${BATTLE_A} ${BATTLE_B}`;
const BATTLE_MELODY_A = '| o4 d4 a4 o5 d4. e-8 | d4 c4 o4 a2 | b-4 o5 c4 d4 e-4 | d2. r4 | f4. e-8 d4 c4 | d4 o4 a4 f4 a4 | b-4. a8 g4 f4 | a2 o5 c+4 e4 ';
const TAIKO_FILL = '| T16 t16 t16 t16 T16 t16 t16 t16 ';

const BATTLE: SongDef = {
  tempo: 150,
  loop: true,
  reverb: 0.3,
  kit: KIT,
  tracks: [
    { inst: 'hn_sus', vol: 0.7, pan: P.hn, rev: 0.45, mml: '| r1 L v12 ' + BATTLE_MELODY_A + 'v9 ' + bars(BATTLE_B, pad(55, 2)) },
    {
      inst: 'vln_sus', vol: 1.0, pan: P.vln,
      mml: '| r1 L' + rests(8) + 'v12 | o5 g2 b-4 a4 | g4 f4 d2 | f2 a4 o6 d4 | c4 o5 a4 f2 | g2 b-4 o6 e-4 | d4 c4 o5 b-2 | a2 g4 f4 | e2 c+2 ',
    },
    { inst: 'vln_spic', vol: 0.5, pan: -0.2, rev: 0.25, mml: '| r1 L v10 ' + bars(BATTLE_ALL, arp(62, 3, [0, 1, 2, 1, 0, 1, 2, 1])) },
    { inst: 'vc_spic', vol: 0.6, pan: P.vc, rev: 0.25, mml: 'v12 | o2 d2 d2 L v11 ' + bars(BATTLE_ALL, ostinato(38, [0, 0, 12, 0, 7, 0, 12, 7])) },
    { inst: 'cb_sus', vol: 0.5, pan: P.cb, mml: 'v10 | o1 d1 L v9 ' + bars(BATTLE_ALL, bass(31)) },
    { inst: 'tbn_sus', vol: 0.55, pan: P.tbn, rev: 0.4, mml: '| r1 L' + rests(7) + 'v10 | {o2 a o3 e}1 ' + bars(BATTLE_B, fifth(43)) },
    {
      inst: 'fl_sus', vol: 0.8, pan: P.fl, rev: 0.4,
      mml: 'y10 v10 | r1 L' + rests(4) + '| o6 f4. e-8 d4 c4 | d4 o5 a4 f4 a4 | b-4. a8 g4 f4 | a2 o6 c+4 e4 ' + rests(8),
    },
    { inst: 'koto', vol: 0.55, pan: P.koto, rev: 0.3, mml: '| r1 L' + rests(8) + 'v10 ' + bars(BATTLE_B, arp(62, 4, [0, 1, 2, 3, 2, 1, 2, 3], 0.25)) },
    {
      inst: '', vol: 0.6, rev: 0.3,
      mml: 'v13 | T8 T8 t8 t8 T4 T4 L [| T8 t8 r8 t8 T8 t8 t8 t8 ]7' + TAIKO_FILL + 'T8 T8 T8 T8 [| T8 r8 U8 t8 T8 R8 U8 t8 ]7' + TAIKO_FILL + 'T8 T8 R8 R8 ',
    },
    { inst: '', vol: 0.5, rev: 0.4, mml: 'v11 | r2 S2 L | C1 ' + rests(6) + '| r2 S2 | G1 | r1 | r1 | r1 | C1 | r1 | r1 | r2 S2 ' },
  ],
};

// ---------------------------------------------------------------- BOSS
// A demon wakes: low brass in E Phrygian dominant, taiko and bells.

const BOSS_A = 'E5 E5 F F E5 E5 Dm E';
const BOSS_B = 'Am Am F F Dm Dm E E';
const BOSS_MELODY = '| o3 e2 f4 g+4 | a4 g+4 f4 e4 | f2 a4 o4 c4 | o3 b2 a2 | e2 g+4 b4 | o4 c4 o3 b4 a4 g+4 | a2 f4 d4 | e1 ';

const BOSS: SongDef = {
  tempo: 128,
  loop: true,
  reverb: 0.4,
  kit: KIT,
  tracks: [
    { inst: 'tbn_sus', vol: 0.65, pan: P.tbn, rev: 0.4, mml: 'v10 | o2 e1 | ^1 L v13 ' + BOSS_MELODY + 'v10 ' + bars(BOSS_B, fifth(40)) },
    { inst: 'hn_sus', vol: 0.6, pan: P.hn, rev: 0.45, mml: '| r1 | r1 L v12 ' + BOSS_MELODY.replace(/o4/g, 'o5').replace(/o3/g, 'o4') + 'v10 ' + bars(BOSS_B, pad(57, 2)) },
    {
      inst: 'vln_trem', vol: 0.7, pan: P.vln,
      mml: '| r1 | r1 L v6 ' + bars(BOSS_A, () => '{o5 e f}1 ') + 'v12 | o5 e2 a4 b4 | o6 c4 o5 b4 a2 | f2 a4 o6 c4 | o5 b2 a2 | d4 f4 a4 o6 d4 | c4 o5 a4 f4 d4 | e2 f2 | g+2 e2 ',
    },
    { inst: 'vc_spic', vol: 0.6, pan: P.vc, rev: 0.25, mml: '| r1 | r1 L v12 ' + bars(`${BOSS_A} ${BOSS_B}`, ostinato(40, [0, 0, 1, 0, 0, 0, 3, 1])) },
    { inst: 'cb_sus', vol: 0.55, pan: P.cb, mml: 'v9 | o1 e1 | ^1 L ' + bars(`${BOSS_A} ${BOSS_B}`, bass(28)) },
    {
      inst: '', vol: 0.6, rev: 0.3,
      mml: 'v12 | Y1 | v13 T4 T4 T8 T8 T8 T8 L [| T4 r8 T8 U8 U8 T4 ]7 | T8 U8 T8 U8 T16 T16 T16 T16 T8 T8 ' +
        '[| T8 U8 R8 U8 T8 U8 R8 U8 ]7 | T16 T16 T16 T16 T16 T16 T16 T16 T4 T4 ',
    },
    { inst: '', vol: 0.6, rev: 0.2, mml: '| r1 | r1 L v12 [| B4 r2. ]16' },
    { inst: '', vol: 0.5, rev: 0.45, mml: 'v11 | X1 | r2 S2 L | G1 | r1 | r1 | r1 | s1 | r1 | r1 | r2 S2 | G1 | r1 | r1 | r1 | C1 | r1 | r1 | r2 S2 ' },
    { inst: 'chimes', vol: 1.0, pan: P.bell, rev: 0.7, mml: '| r1 | r1 L v9 [| o5 e1 | r1 | r1 | r1 ]4' },
  ],
};

// ---------------------------------------------------------------- VICTORY
// The demon falls: a short fanfare in the yo scale.

const VICTORY_CHORDS = 'D G Em/A D D';

const VICTORY: SongDef = {
  tempo: 100,
  loop: false,
  reverb: 0.45,
  kit: KIT,
  tracks: [
    { inst: 'hn_sus', vol: 0.7, pan: P.hn, rev: 0.5, mml: 'v12 | o4 d8 e8 g8 a8 b4 a4 | o5 d2 o4 b4 a4 | g4 a4 b4 o5 e4 | d1 | ^1 ' },
    { inst: 'vln_sus', vol: 0.9, pan: P.vln, mml: 'v11 | o5 d8 e8 g8 a8 b4 a4 | o6 d2 o5 b4 a4 | g4 a4 b4 o6 e4 | d1 | ^1 ' },
    { inst: 'vla_sus', vol: 0.5, pan: P.vla, mml: 'v9 ' + bars(VICTORY_CHORDS, pad(57, 3)) },
    { inst: 'vc_sus', vol: 0.9, pan: P.vc, mml: 'v10 ' + bars(VICTORY_CHORDS, fifth(38)) },
    { inst: 'cb_sus', vol: 0.5, pan: P.cb, mml: 'v9 ' + bars(VICTORY_CHORDS, bass(31)) },
    { inst: 'harp', vol: 0.8, pan: P.harp, rev: 0.6, mml: 'v11 | r1 | r1 | r1 | o4 d16 f+16 a16 o5 d16 f+16 a16 o6 d16 f+16 r2 | r1 ' },
    { inst: '', vol: 0.8, rev: 0.35, mml: 'v13 | T4 r4 T4 r4 | T4 r4 T8 t8 t8 t8 | T8 t8 t8 t8 T8 t8 T4 | T1 | r1 ' },
    { inst: '', vol: 0.5, rev: 0.5, mml: 'v11 | r1 | r1 | r2 S2 | C1 | r1 ' },
    { inst: '', vol: 0.45, rev: 0.6, mml: 'v10 | r1 | r1 | r1 | G1 | r1 ' },
  ],
};

// ---------------------------------------------------------------- GAME OVER
// The lantern goes out: a lament for flute and koto.

const GAMEOVER_CHORDS = 'Dm Bb Gm/A Dm Dm Dm';

const GAMEOVER: SongDef = {
  tempo: 56,
  loop: false,
  reverb: 0.6,
  kit: KIT,
  tracks: [
    { inst: 'fl_sus', vol: 1.6, pan: P.fl, rev: 0.65, mml: 'y16 P45 v12 | o4 a2 b-8 a8 g4 | f2 e2 | d4. e8 f4 e4 | d1 | ^1 | r1 ' },
    { inst: 'koto', vol: 0.45, pan: P.koto, rev: 0.5, mml: 'v7 ' + bars('Dm Bb Gm/A Dm', arp(50, 5, [0, 2, 3, 4, 3, 2, 1, 2])) + rests(2) },
    { inst: 'vla_sus', vol: 0.4, pan: P.vla, mml: 'v5 ' + bars(GAMEOVER_CHORDS, pad(57, 2)) },
    { inst: 'vc_sus', vol: 0.8, pan: P.vc, mml: 'v6 ' + bars(GAMEOVER_CHORDS, fifth(38)) },
    { inst: 'cb_sus', vol: 0.4, pan: P.cb, mml: 'v6 ' + bars(GAMEOVER_CHORDS, bass(31)) },
    { inst: '', vol: 0.9, rev: 0.7, mml: 'v9 | h1 | r1 | r1 | r1 | Z1 | r1 ' },
  ],
};

export const SONGS = {
  TITLE,
  WORLD,
  DUNGEON,
  BATTLE,
  BOSS,
  VICTORY,
  GAMEOVER,
  // chapters 2-4 get their own themes later; until then they reuse these
  TEMPLE: DUNGEON,
  ENDING: TITLE,
};
export type SongName = keyof typeof SONGS;
