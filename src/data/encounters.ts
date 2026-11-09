import type { EnemyKind } from '../entities/Enemy';
import type { ThemeId } from '../world/DungeonMap';

/**
 * Labyrinth and world-map encounters: a single-screen arena fought in waves.
 * Ids d1a.. match DungeonDef.encounters; w1..w3 are the roaming spirits of the world map.
 */
export const ENCOUNTERS: Record<string, EnemyKind[][]> = {
  d1a: [['ghoul', 'ghoul'], ['wisp', 'ghoul']],
  d1b: [['hopper', 'hopper', 'ghoul']],
  d1c: [['wisp', 'wisp'], ['ghoul', 'ghoul', 'crow']],
  d1d: [['ghoul', 'hopper'], ['ghoul', 'ghoul', 'wisp']],
  d2a: [['skeleton'], ['bat', 'bat']],
  d2b: [['skeleton', 'hopper'], ['bat', 'bat', 'bat']],
  d2c: [['skeleton', 'skeleton']],
  d2d: [['bat', 'bat'], ['skeleton', 'wisp']],
  d2e: [['hopper', 'hopper', 'bat'], ['skeleton']],
  d2f: [['skeleton', 'bat'], ['skeleton', 'bat']],
  d3a: [['spearman'], ['wraith']],
  d3b: [['oneeye', 'oneeye'], ['skeleton']],
  d3c: [['wraith', 'wisp', 'wisp']],
  d3d: [['spearman', 'oneeye']],
  d3e: [['skeleton', 'skeleton'], ['wraith']],
  d3f: [['oni']],
  d3g: [['spearman', 'spearman']],
  d3h: [['wraith', 'bat', 'bat'], ['oneeye']],
  d3i: [['spearman', 'skeleton'], ['wraith', 'wraith']],
  d4a: [['oni'], ['wraith', 'wraith']],
  d4b: [['spearman', 'spearman', 'oneeye']],
  d4c: [['oni', 'spearman']],
  w1: [['ghoul', 'wisp', 'ghoul']],
  w2: [['skeleton', 'bat', 'bat']],
  w3: [['spearman', 'wraith']],
};

export function encounterTheme(group: string): ThemeId {
  const k = group.slice(0, 2);
  return k === 'd2' || k === 'w2' ? 'mine' : k === 'd3' || k === 'w3' ? 'crypt' : k === 'd4' ? 'temple' : 'grotto';
}

/** Single-screen arena: flat floor with two ledges. */
export const ARENA_MAP = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..===......===..',
  '................',
  '................',
  '................',
  '################',
  '################',
  '################',
];

/** Boss arena: an open floor. */
export const BOSS_MAP = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '################',
  '################',
  '################',
];
