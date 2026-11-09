import { describe, expect, it } from 'vitest';
import { DUNGEONS, DUNGEON_PREREQ } from '../src/data/levels/dungeons';
import { validateDungeon } from '../src/world/MapValidator';
import { DungeonId } from '../src/core/GameState';

const SIZES: Record<DungeonId, number> = { d1: 13, d2: 17, d3: 21, d4: 11 };

describe('labyrinth layouts', () => {
  for (const id of Object.keys(DUNGEONS) as DungeonId[]) {
    const def = DUNGEONS[id];
    it(`${id} ${def.name} is at least ${SIZES[id]}x${SIZES[id]}`, () => {
      expect(def.map.length).toBeGreaterThanOrEqual(SIZES[id]);
      for (const row of def.map) expect(row.length).toBe(def.map[0].length);
    });
    it(`${id} is solvable from every reachable key/lever state`, () => {
      const rep = validateDungeon(def, DUNGEON_PREREQ[id]);
      expect(rep.errors).toEqual([]);
      expect(rep.chestsReachable).toBe(rep.chestsTotal);
    });
  }

  it('the seal doors of the temple really need the seals', () => {
    const rep = validateDungeon(DUNGEONS.d4, ['mirror', 'jewel']);
    expect(rep.errors).toContain('boss door unreachable from start');
  });

  it('d3 cannot be solved without touching a lever', () => {
    const def = DUNGEONS.d3;
    const noLevers = { ...def, map: def.map.map((r) => r.replace(/[=%]/g, '#')) };
    expect(validateDungeon(noLevers, DUNGEON_PREREQ.d3).ok).toBe(false);
  });

  it('d2 needs both keys: removing one key chest makes it unsolvable', () => {
    const def = DUNGEONS.d2;
    const chests = { ...def.chests, '13,1': { kind: 'gold' as const, n: 1 } };
    expect(validateDungeon({ ...def, chests }, DUNGEON_PREREQ.d2).ok).toBe(false);
  });
});
