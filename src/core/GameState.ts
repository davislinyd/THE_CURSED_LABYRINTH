export type Dir = 0 | 1 | 2 | 3; // NORTH, EAST, SOUTH, WEST
export const NORTH: Dir = 0;
export const EAST: Dir = 1;
export const SOUTH: Dir = 2;
export const WEST: Dir = 3;
export const DIR_NAMES = ['N', 'E', 'S', 'W'] as const;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir;
export const reverse = (d: Dir): Dir => ((d + 2) % 4) as Dir;

export type DungeonId = 'd1' | 'd2' | 'd3' | 'd4';
export type ItemId = 'herb' | 'elixir' | 'talisman';
export type KeyItemId =
  | 'compass' | 'candle' | 'map_d1' | 'map_d2' | 'map_d3' | 'map_d4'
  | 'mirror' | 'jewel' | 'flute' | 'blade';

export const SEALS: KeyItemId[] = ['mirror', 'jewel', 'flute'];

export type Location =
  | { mode: 'world'; x: number; y: number }
  | { mode: 'dungeon'; id: DungeonId; x: number; y: number; dir: Dir };

export interface Stats {
  frames: number;
  kills: number;
  deaths: number;
  continuesUsed: number;
  chests: number;
  secrets: number;
  steps: number;
}

export interface GameState {
  version: 1;
  life: number;
  maxLife: number;
  gold: number;
  weaponExp: number;
  items: Record<ItemId, number>;
  keyItems: KeyItemId[];
  keys: Record<DungeonId, number>;
  currentItem: ItemId;
  /** Persistent world flags: opened doors, chests, cleared stages, defeated bosses... */
  flags: Record<string, boolean>;
  /** Dungeon cells visited, as "d1:x,y" (for the map scroll). */
  visited: Record<string, boolean>;
  location: Location;
  /** Where a CONTINUE puts the player back. */
  checkpoint: Location;
  stats: Stats;
  cleared: boolean;
}

export const WEAPON_EXP = [0, 8, 20, 36, 56, 80, 110, 150];
export const MAX_WEAPON_LEVEL = WEAPON_EXP.length;

export function weaponLevel(exp: number): number {
  let lv = 1;
  for (let i = 1; i < WEAPON_EXP.length; i++) if (exp >= WEAPON_EXP[i]) lv = i + 1;
  return lv;
}

/** Sword damage: grows every two levels, +1 with the Spirit Blade. */
export function swordDamage(s: GameState): number {
  return 1 + Math.floor((weaponLevel(s.weaponExp) - 1) / 2) + (s.keyItems.includes('blade') ? 1 : 0);
}

/** Slash reach in pixels for the side-view sword arc. */
export function swordReach(s: GameState): number {
  const lv = weaponLevel(s.weaponExp);
  return lv >= 7 ? 26 : lv >= 4 ? 22 : 18;
}

export const START_LOCATION: Location = { mode: 'world', x: 6, y: 25 };

export function newGameState(): GameState {
  return {
    version: 1,
    life: 16,
    maxLife: 16,
    gold: 30,
    weaponExp: 0,
    items: { herb: 2, elixir: 0, talisman: 5 },
    keyItems: [],
    keys: { d1: 0, d2: 0, d3: 0, d4: 0 },
    currentItem: 'herb',
    flags: {},
    visited: {},
    location: { ...START_LOCATION },
    checkpoint: { ...START_LOCATION },
    stats: { frames: 0, kills: 0, deaths: 0, continuesUsed: 0, chests: 0, secrets: 0, steps: 0 },
    cleared: false,
  };
}

export function hasItem(s: GameState, k: KeyItemId): boolean {
  return s.keyItems.includes(k);
}

export function sealCount(s: GameState): number {
  return SEALS.filter((k) => s.keyItems.includes(k)).length;
}

export const ITEM_NAMES: Record<ItemId, string> = {
  herb: 'HERB',
  elixir: 'ELIXIR',
  talisman: 'TALISMAN',
};

export const KEY_ITEM_INFO: Record<KeyItemId, { name: string; desc: string }> = {
  compass: { name: 'LODESTONE', desc: 'SHOWS YOUR HEADING IN THE LABYRINTH.' },
  candle: { name: 'GHOST CANDLE', desc: 'ITS PALE FLAME PIERCES CURSED DARKNESS.' },
  map_d1: { name: 'MAP OF GROTTO', desc: 'A CHART OF THE ROTWOOD GROTTO.' },
  map_d2: { name: 'MAP OF MINE', desc: 'A CHART OF THE BLOOD MIST MINE.' },
  map_d3: { name: 'MAP OF CRYPT', desc: 'A CHART OF THE HUNDRED DEMON CRYPT.' },
  map_d4: { name: 'MAP OF TEMPLE', desc: 'A CHART OF THE UNDERWORLD TEMPLE.' },
  mirror: { name: 'BRONZE MIRROR', desc: 'SEAL I. REVEALS FALSE WALLS AS A SHIMMER.' },
  jewel: { name: 'BLOOD JEWEL', desc: 'SEAL II. ITS PULSE HARDENS YOUR BODY.' },
  flute: { name: 'BONE FLUTE', desc: 'SEAL III. ITS CRY OPENS THE LAST GATE.' },
  blade: { name: 'SPIRIT BLADE', desc: 'A BLESSED EDGE. SWORD DAMAGE +1.' },
};
