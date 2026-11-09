import { Dir, DungeonId, ItemId, KeyItemId } from '../core/GameState';
import type { SongName } from '../audio/MusicData';

/**
 * Dungeon legend (one character per grid cell):
 *   #  wall          .  floor        @  start         X  exit stairs (face)
 *   K  boss door     D  door         B  breakable     L  locked (key)
 *   S  seal door     F  false wall   T  tablet (face) N  spirit (blocks)
 *   =  lever (toggles gates G/g)     %  lever (toggles gates H/h)
 *   G / H  gates open while their lever is UP, g / h  open while DOWN
 *   C  chest   E  encounter   ^  spikes   O  warp circle   ?  hidden item
 */
export type Loot =
  | { kind: 'key' }
  | { kind: 'gold'; n: number }
  | { kind: 'item'; id: ItemId; n: number }
  | { kind: 'keyItem'; id: KeyItemId }
  | { kind: 'vessel' };

export type ThemeId = 'grotto' | 'mine' | 'crypt' | 'temple';
export type BossId = 'rotroot' | 'centipede' | 'gashadokuro' | 'meiou';

export interface DungeonDef {
  id: DungeonId;
  name: string;
  theme: ThemeId;
  music: SongName;
  map: string[];
  start: { dir: Dir };
  boss: BossId;
  dark?: [number, number, number, number][];
  chests: Record<string, Loot>;
  hidden?: Record<string, Loot>;
  /** Encounter cell -> enemy group id (see ENCOUNTERS). */
  encounters: Record<string, string>;
  tablets?: Record<string, string>;
  npcs?: Record<string, string>;
  warps?: Record<string, { x: number; y: number; dir: Dir }>;
  /** Seal door -> key item that opens it. */
  seals?: Record<string, KeyItemId>;
  /** Spike damage. */
  spike?: number;
}

export type Face =
  | 'wall' | 'door' | 'locked' | 'breakable' | 'seal' | 'gate' | 'lever' | 'tablet'
  | 'fake' | 'boss' | 'exit' | 'npc';

export type FloorObj = 'chest' | 'enemy' | 'spikes' | 'warp' | null;

export const key = (x: number, y: number) => `${x},${y}`;

const FLOORISH = new Set(['.', '@', 'C', 'E', '^', 'O', '?']);

export interface DungeonFlags {
  get(name: string): boolean;
}

/** Runtime view of a dungeon definition combined with persistent flags. */
export class Dungeon {
  readonly w: number;
  readonly h: number;
  readonly start: { x: number; y: number; dir: Dir };
  private readonly darkMask: Uint8Array;

  constructor(readonly def: DungeonDef, private readonly flags: DungeonFlags) {
    this.h = def.map.length;
    this.w = def.map[0].length;
    let sx = 1, sy = 1;
    def.map.forEach((row, y) => {
      if (row.length !== this.w) throw new Error(`${def.id}: row ${y} has width ${row.length}, expected ${this.w}`);
      const i = row.indexOf('@');
      if (i >= 0) {
        sx = i;
        sy = y;
      }
    });
    this.start = { x: sx, y: sy, dir: def.start.dir };
    this.darkMask = new Uint8Array(this.w * this.h);
    for (const [x0, y0, w, h] of def.dark ?? [])
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.darkMask[y * this.w + x] = 1;
  }

  ch(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '#';
    return this.def.map[y][x];
  }

  flag(kind: string, x: number, y: number): string {
    return `${this.def.id}:${kind}:${key(x, y)}`;
  }

  lever(group: 0 | 1): boolean {
    return this.flags.get(`${this.def.id}:lever${group}`);
  }

  isDark(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.darkMask[y * this.w + x] === 1;
  }

  gateOpen(c: string): boolean {
    if (c === 'G') return !this.lever(0);
    if (c === 'g') return this.lever(0);
    if (c === 'H') return !this.lever(1);
    if (c === 'h') return this.lever(1);
    return false;
  }

  opened(x: number, y: number): boolean {
    return this.flags.get(this.flag('open', x, y));
  }

  /** Face shown when this cell is solid, or null when it can be walked into. */
  face(x: number, y: number): Face | null {
    const c = this.ch(x, y);
    if (FLOORISH.has(c)) return null;
    switch (c) {
      case 'F':
        return null;
      case 'D':
        return this.opened(x, y) ? null : 'door';
      case 'B':
        return this.opened(x, y) ? null : 'breakable';
      case 'L':
        return this.opened(x, y) ? null : 'locked';
      case 'S':
        return this.opened(x, y) ? null : 'seal';
      case 'G':
      case 'g':
      case 'H':
      case 'h':
        return this.gateOpen(c) ? null : 'gate';
      case '=':
      case '%':
        return 'lever';
      case 'T':
        return 'tablet';
      case 'K':
        return 'boss';
      case 'X':
        return 'exit';
      case 'N':
        return 'npc';
      default:
        return 'wall';
    }
  }

  /** What the renderer draws: false walls still look like walls. */
  visualFace(x: number, y: number): Face | null {
    if (this.ch(x, y) === 'F') return 'fake';
    const f = this.face(x, y);
    return f === 'npc' ? null : f;
  }

  passable(x: number, y: number): boolean {
    return this.face(x, y) === null;
  }

  floorObj(x: number, y: number): FloorObj {
    const c = this.ch(x, y);
    if (c === 'C') return this.flags.get(this.flag('chest', x, y)) ? null : 'chest';
    if (c === 'E') return this.flags.get(this.flag('enc', x, y)) ? null : 'enemy';
    if (c === '^') return 'spikes';
    if (c === 'O') return 'warp';
    return null;
  }

  isNpc(x: number, y: number): boolean {
    return this.ch(x, y) === 'N';
  }

  /** Raised portcullis drawn in an open gate cell. */
  openGate(x: number, y: number): boolean {
    const c = this.ch(x, y);
    return 'GgHh'.includes(c) && this.gateOpen(c);
  }
}
