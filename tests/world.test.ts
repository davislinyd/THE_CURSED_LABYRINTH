import { describe, expect, it } from 'vitest';
import type { KeyItemId } from '../src/core/GameState';
import { BARRIERS, ENTRANCE_DUNGEON, SHRINES, SPIRITS, TOWNS, WORLD_ENTRANCES, WORLD_H, WORLD_MAP, WORLD_W } from '../src/data/levels/world';

const WALK = new Set('.,tr=VvS1234abc');
const START = { x: 6, y: 25 };

/** Places reachable on foot from the starting road with the given seals. Entering a place is a stop. */
function reach(seals: KeyItemId[]): Set<string> {
  const seen = new Set([`${START.x},${START.y}`]);
  const todo = [START];
  while (todo.length) {
    const { x, y } = todo.pop()!;
    if ('Vv1234S'.includes(WORLD_MAP[y][x])) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H || seen.has(`${nx},${ny}`)) continue;
      const c = WORLD_MAP[ny][nx];
      if (!WALK.has(c)) continue;
      if (BARRIERS[c] && !BARRIERS[c].need.every((k) => seals.includes(k))) continue;
      seen.add(`${nx},${ny}`);
      todo.push({ x: nx, y: ny });
    }
  }
  const places = new Set<string>();
  for (const k of seen) {
    const [x, y] = k.split(',').map(Number);
    if ('1234VvS'.includes(WORLD_MAP[y][x])) places.add(WORLD_MAP[y][x]);
  }
  return places;
}

const sorted = (s: Set<string>) => [...s].sort();

describe('world map', () => {
  it('is a 32x28 rectangle', () => {
    expect(WORLD_MAP.length).toBe(28);
    for (const row of WORLD_MAP) expect(row.length).toBe(32);
  });

  it('each seal opens exactly the next chapter', () => {
    expect(sorted(reach([]))).toEqual(['1', 'V']);
    expect(sorted(reach(['mirror']))).toEqual(['1', '2', 'S', 'V']);
    expect(sorted(reach(['mirror', 'jewel']))).toEqual(['1', '2', '3', 'S', 'V', 'v']);
    expect(sorted(reach(['mirror', 'jewel', 'flute']))).toEqual(['1', '2', '3', '4', 'S', 'V', 'v']);
  });

  it('chapter return points are walkable road beside their entrance', () => {
    for (const [ch, id] of Object.entries(ENTRANCE_DUNGEON)) {
      const { x, y } = WORLD_ENTRANCES[id];
      expect(WALK.has(WORLD_MAP[y][x])).toBe(true);
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => WORLD_MAP[y + dy]?.[x + dx] === ch);
      expect(near, `${id} return point next to '${ch}'`).toBe(true);
    }
  });

  it('every town, shrine and spirit sits on the map where it is declared', () => {
    for (const ch of Object.keys(TOWNS)) expect(WORLD_MAP.join('')).toContain(ch);
    for (const k of Object.keys(SHRINES)) {
      const [x, y] = k.split(',').map(Number);
      expect(WORLD_MAP[y][x]).toBe('S');
    }
    for (const sp of SPIRITS) expect('.,tr').toContain(WORLD_MAP[sp.y][sp.x]);
  });
});
