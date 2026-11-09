import type { DungeonId, ItemId, KeyItemId } from '../../core/GameState';

/**
 * World map, 32x28 tiles of 16px. Legend:
 *   M mountains   T forest   t lone tree   ~ river   = bridge   g graves   r spider lilies
 *   . grass   , road   V / v villages   S shrine
 *   1-4 chapter entrances   a b c spirit barriers (opened by the seals)
 * Reachability per seal set is checked in tests/world.test.ts.
 */
export const WORLD_MAP = [
  'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
  'MMMMMMMMMMMMMMM4MMMMMMMMMMMMMMMM',
  'MMMMMMMMMMMMMMM,MMMMMMMMMMMMMMMM',
  'MMMMMMMMMMMMMMMcMMMMMMMMMMMMMMMM',
  'MMgggg.TTTTTTT.,.TTTTTTTTTTMMMMM',
  'MMg3,g.TTTtTTT.,.TTTtTTTTTTMMMMM',
  'MMg.,g..TT..,,,,,,,..TTTTTTMMMMM',
  'MMgg,,,,,,,,,..,.,.....S.TTMMMMM',
  'MM...rrrrr.....,.,..t..,.TTMMMMM',
  'MMTTrrrrrr...v.,.,,,,,,,.TTMMMMM',
  'MMTT.rrrrr.....,.,....TTTTTMMMMM',
  'MMTTT...t......,.,....TTTTTMMMMM',
  '~~~~~~~~~~~~~~~~~b~~~~~~~~~MMMMM',
  '~~~~~~~~~~~~~~~~~=~~~~~~~~~MMMMM',
  'MMTTT....t.......,.......MMMMMMM',
  'MMTT.TT..........,.......MMM2MMM',
  'MM1,,,,,,,,......,.......MM.,.MM',
  'MMTT...TT.,......,.......MM.,.MM',
  'MMTT...TT.,......,,,,,,,,a,.,.MM',
  'MMTT...TT.,......,t......MM...MM',
  'MMTT...TT.,..rrr.,.......MM..SMM',
  'MMTT......,.rrrrr,.......MM...MM',
  'MMTT.t....,..rrr.,.......MMMMMMM',
  'MM........,,,,,,V,.......MMMMMMM',
  'MMTTTT.......,...........MMMMMMM',
  'MMTTTT.......,......tTTTTMMMMMMM',
  'MMTTTT.......,......TTTTTMMMMMMM',
  'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
];

export const WORLD_W = WORLD_MAP[0].length;
export const WORLD_H = WORLD_MAP.length;

export const ENTRANCE_DUNGEON: Record<string, DungeonId> = { '1': 'd1', '2': 'd2', '3': 'd3', '4': 'd4' };

/** Where the hero reappears on the map after leaving each chapter. */
export const WORLD_ENTRANCES: Record<DungeonId, { x: number; y: number }> = {
  d1: { x: 3, y: 16 },
  d2: { x: 28, y: 16 },
  d3: { x: 4, y: 5 },
  d4: { x: 15, y: 2 },
};

export interface Barrier {
  need: KeyItemId[];
  closed: string;
  opened: string;
}

export const BARRIERS: Record<string, Barrier> = {
  a: {
    need: ['mirror'],
    closed: 'A WALL OF GHOSTLY MIST BARS THE PASS. SHAPES MOVE WITHIN IT... AN ILLUSION, PERHAPS?',
    opened: 'THE BRONZE MIRROR FLARES. THE MIST WAS NEVER THERE.',
  },
  b: {
    need: ['mirror', 'jewel'],
    closed: 'A SEAL OF BLOOD BINDS THE BRIDGE. IT HUNGERS FOR SOMETHING THAT BEATS LIKE A HEART.',
    opened: 'THE BLOOD JEWEL PULSES. THE SEAL DRINKS IT IN AND FADES.',
  },
  c: {
    need: ['mirror', 'jewel', 'flute'],
    closed: 'THE TEMPLE GATE IS SEALED THREE TIMES OVER. MIRROR, JEWEL AND FLUTE...',
    opened: 'THE THREE SEALS SING TOGETHER. THE GATE OF THE DEAD SWINGS OPEN.',
  },
};

export interface ShopItem {
  item: ItemId;
  n: number;
  price: number;
}

export interface Town {
  name: string;
  inn: number;
  shop: ShopItem[];
  talk: string[];
}

export const TOWNS: Record<string, Town> = {
  V: {
    name: 'HAIYA VILLAGE',
    inn: 10,
    shop: [
      { item: 'herb', n: 1, price: 12 },
      { item: 'talisman', n: 3, price: 10 },
      { item: 'elixir', n: 1, price: 90 },
    ],
    talk: [
      'ELDER: THE LAMPS OF THE OLD ROADS WENT OUT ONE NIGHT, AND THE DEAD CAME WALKING. THREE SEALS WERE STOLEN BY THREE DEMONS.',
      'ELDER: WEST, PAST THE CEDARS, LIES THE ROTWOOD ROAD. ITS GROTTO HIDES THE FIRST SEAL, THE BRONZE MIRROR.',
      'GIRL: IN THE LABYRINTHS, WALLS SOMETIMES LIE. STRIKE THE CRACKED ONES. AND KEEP A CANDLE FOR THE DARK.',
      'OLD SMITH: PRESS ↑ AND {B} TOGETHER TO USE YOUR ITEM. TALISMANS FLY TRUE THROUGH ANY SPIRIT.',
    ],
  },
  v: {
    name: 'KAGARI VILLAGE',
    inn: 20,
    shop: [
      { item: 'herb', n: 1, price: 12 },
      { item: 'talisman', n: 3, price: 10 },
      { item: 'elixir', n: 1, price: 60 },
    ],
    talk: [
      'MONK: THE HUNDRED DEMON CRYPT LIES AMONG THE GRAVES TO THE WEST. ITS GATES MOVE WITH THE LEVERS.',
      'MONK: TWO LEVERS, FOUR GATES. WHEN A PATH CLOSES, ANOTHER OPENS. LISTEN FOR THE GRINDING STONE.',
      'WIDOW: BEYOND THE NORTH GATE STANDS THE TEMPLE OF MEIOU. ONLY ALL THREE SEALS WILL OPEN IT.',
      'FARMER: THE GIANT SKELETON IS ALL HUNGER. WHEN ITS JAW COMES DOWN TO BITE, STRIKE THE SKULL.',
    ],
  },
};

export const SHRINES: Record<string, string> = {
  '23,7': 'A MOUNTAIN SHRINE. THE LAMP STILL BURNS HERE. YOUR WOUNDS CLOSE AND YOUR PATH IS RECORDED.',
  '29,20': 'A WAYSIDE SHRINE IN THE PASS. THE STONE FOX WATCHES. YOUR WOUNDS CLOSE AND YOUR PATH IS RECORDED.',
};

/** Roaming spirits: touching one starts a battle. */
export const SPIRITS: { x: number; y: number; group: string }[] = [
  { x: 12, y: 19, group: 'w1' },
  { x: 20, y: 15, group: 'w1' },
  { x: 6, y: 21, group: 'w1' },
  { x: 28, y: 19, group: 'w2' },
  { x: 10, y: 8, group: 'w3' },
  { x: 20, y: 10, group: 'w3' },
  { x: 7, y: 6, group: 'w3' },
];
