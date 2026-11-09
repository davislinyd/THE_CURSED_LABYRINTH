import { EAST, NORTH, DungeonId } from '../../core/GameState';
import { DungeonDef } from '../../world/DungeonMap';

// Hand-built labyrinths. Every layout is checked by tests/maps.test.ts with an
// exhaustive key/lever state search (no soft-locks, boss reachable, all chests reachable).

const D1: DungeonDef = {
  id: 'd1',
  name: 'ROTWOOD GROTTO',
  theme: 'grotto',
  music: 'DUNGEON',
  boss: 'rotroot',
  start: { dir: NORTH },
  map: [
    '######T######',
    '#C..##.FC#K##',
    '#.#?##.##...#',
    '#E####.##E#.#',
    '#.####.##.#.#',
    '#..B....E...#',
    '##.###.##.###',
    '##..C#D##.###',
    '######.##...#',
    '###C...####C#',
    '######.######',
    '######@..E.C#',
    '######X######',
  ],
  dark: [[9, 2, 3, 8]],
  chests: {
    '3,9': { kind: 'keyItem', id: 'compass' },
    '1,1': { kind: 'keyItem', id: 'candle' },
    '4,7': { kind: 'item', id: 'herb', n: 2 },
    '11,11': { kind: 'keyItem', id: 'map_d1' },
    '11,9': { kind: 'gold', n: 40 },
    '8,1': { kind: 'vessel' },
  },
  hidden: { '3,2': { kind: 'item', id: 'talisman', n: 3 } },
  encounters: { '9,11': 'd1a', '1,3': 'd1b', '9,3': 'd1c', '8,5': 'd1d' },
  tablets: {
    '6,0': 'THE STONE READS: "WHERE THE NORTH PATH ENDS, THE EASTERN STONE IS ONLY A WHISPER. WALK THROUGH."',
  },
  spike: 2,
};

const D2: DungeonDef = {
  id: 'd2',
  name: 'BLOOD MIST MINE',
  theme: 'mine',
  music: 'DUNGEON',
  boss: 'centipede',
  start: { dir: NORTH },
  map: [
    '#########K#######',
    '#C###..?#.#CFC..#',
    '#.###.###.#####.#',
    '#E..#.###E#C###E#',
    '###.#.###L#.###.#',
    '###.#.###.#...S.#',
    '###.#.###.#####.#',
    '#.....#...#####.#',
    '#^#.###^#######.#',
    '#.#.#C..###.....#',
    '#.#.###.###.#.#.#',
    '#.....#E#..E#.#.#',
    '#.###.#L#.#.#.#.#',
    '#.###CT.#.#C#C#.#',
    '#.###N#.#.###.#.#',
    '#..E...@....^...#',
    '#######X#########',
  ],
  chests: {
    '1,1': { kind: 'key' },
    '13,1': { kind: 'key' },
    '11,1': { kind: 'vessel' },
    '11,3': { kind: 'item', id: 'elixir', n: 1 },
    '5,9': { kind: 'item', id: 'talisman', n: 5 },
    '5,13': { kind: 'gold', n: 60 },
    '11,13': { kind: 'keyItem', id: 'map_d2' },
    '13,13': { kind: 'item', id: 'herb', n: 2 },
  },
  hidden: { '7,1': { kind: 'gold', n: 50 } },
  encounters: {
    '1,3': 'd2a', '9,3': 'd2f', '15,3': 'd2b', '7,11': 'd2c', '11,11': 'd2d', '3,15': 'd2e',
  },
  tablets: {
    '6,13': 'CARVED BY A MINER: "TWO IRON LOCKS GUARD THE ALTAR. WE HID THE KEYS AT THE FAR ENDS OF THE WEST AND EAST TUNNELS."',
  },
  npcs: {
    '5,14': 'A PALE MINER\'S GHOST: "I DUG TOO DEEP... THE CENTIPEDE SLEEPS PAST TWO LOCKS. STRIKE HER HEAD - HER SHELL TURNS STEEL."',
  },
  seals: { '14,5': 'mirror' },
  spike: 3,
};

const D3: DungeonDef = {
  id: 'd3',
  name: 'HUNDRED DEMON CRYPT',
  theme: 'crypt',
  music: 'DUNGEON',
  boss: 'gashadokuro',
  start: { dir: NORTH },
  map: [
    '#########K###########',
    '#O#######.#O#####..C#',
    '#.###%###.#.#####.###',
    '#.#E..###ET....C#.###',
    '#.#.#.###h###.###.###',
    '#...#.###.###.#..E###',
    '#.###.###.###.#.###=#',
    '#.###...H.###...###.#',
    '#L#T#####.###^#####.#',
    '#....E###.....#C....#',
    '#.#F#.###.#######.###',
    '#.#C#.#...#######E###',
    '#.###.#.#.#######.###',
    '#E#?B.#C#...#####...#',
    '#.#######g#.#####.#.#',
    '#.....###.#C###...#E#',
    '#.###.###.#####.###^#',
    '#.###..C#...G..E###.#',
    '#.#######.#########.#',
    '#....E...@....^.....#',
    '#########X###########',
  ],
  dark: [
    [1, 9, 7, 9],
    [13, 1, 7, 7],
  ],
  chests: {
    '7,17': { kind: 'key' },
    '3,11': { kind: 'keyItem', id: 'blade' },
    '15,9': { kind: 'keyItem', id: 'map_d3' },
    '19,1': { kind: 'item', id: 'elixir', n: 1 },
    '7,13': { kind: 'gold', n: 120 },
    '11,15': { kind: 'item', id: 'herb', n: 3 },
    '15,3': { kind: 'item', id: 'talisman', n: 5 },
  },
  hidden: { '3,13': { kind: 'gold', n: 80 } },
  encounters: {
    '5,19': 'd3a', '15,17': 'd3b', '19,15': 'd3c', '17,11': 'd3d', '1,13': 'd3e',
    '5,9': 'd3f', '17,5': 'd3g', '9,3': 'd3h', '3,3': 'd3i',
  },
  tablets: {
    '3,8': 'ETCHED IN BONE: "THE DEMON BLADE SLEEPS BEHIND THE WALL AT YOUR BACK. A TRUE MIRROR SEES THE STONE BREATHE."',
    '10,3': 'A WARNING: "BEYOND LIES THE CIRCLE OF RETURN. THOSE WHO STEP IN IT ARE CAST BACK TO THE BEGINNING."',
  },
  warps: {
    '1,1': { x: 9, y: 9, dir: NORTH },
    '11,1': { x: 9, y: 17, dir: NORTH },
  },
  spike: 3,
};

const D4: DungeonDef = {
  id: 'd4',
  name: 'UNDERWORLD TEMPLE',
  theme: 'temple',
  music: 'TEMPLE',
  boss: 'meiou',
  start: { dir: NORTH },
  map: [
    '###########',
    '#E....S...#',
    '#.#######.#',
    '#.#C#####E#',
    '#.#.#K###.#',
    '#.#.#..E#.#',
    '#S#.###.#.#',
    '#.#..O#.#.#',
    '#.#.###S#.#',
    '#....@T..C#',
    '#####X#####',
  ],
  dark: [[1, 1, 9, 9]],
  chests: {
    '3,3': { kind: 'item', id: 'elixir', n: 1 },
    '9,9': { kind: 'item', id: 'talisman', n: 5 },
  },
  encounters: { '1,1': 'd4a', '9,3': 'd4b', '7,5': 'd4c' },
  tablets: {
    '6,9': 'GOLDEN LETTERS: "THREE SEALS, THREE GATES - MIRROR, JEWEL AND FLUTE. THE KING WAITS AT THE HEART."',
  },
  warps: { '5,7': { x: 5, y: 9, dir: EAST } },
  seals: { '1,6': 'mirror', '6,1': 'jewel', '7,8': 'flute' },
  spike: 3,
};

export const DUNGEONS: Record<DungeonId, DungeonDef> = { d1: D1, d2: D2, d3: D3, d4: D4 };

/** Seals the player is guaranteed to own when entering each labyrinth. */
export const DUNGEON_PREREQ: Record<DungeonId, ('mirror' | 'jewel' | 'flute')[]> = {
  d1: [],
  d2: ['mirror'],
  d3: ['mirror', 'jewel'],
  d4: ['mirror', 'jewel', 'flute'],
};
