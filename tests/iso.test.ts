import { describe, expect, it } from 'vitest';
import { HAIYA, ROAD_S1 } from '../src/data/levels/iso';
import { ENTRANCE_DUNGEON, SHRINES, SPIRITS, WORLD_ENTRANCES, WORLD_H, WORLD_MAP, WORLD_W } from '../src/data/levels/world';
import { IsoGrid, WT, tileMid, worldRows } from '../src/world/IsoMap';
import { collide } from '../src/world/Grid3D';

/** Tiles reachable on foot (4-way) from (x, y). */
function flood(g: IsoGrid, x: number, y: number): Set<string> {
  const seen = new Set([`${x},${y}`]);
  const todo = [[x, y]];
  while (todo.length) {
    const [cx, cy] = todo.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
      if (seen.has(k) || g.blocked(nx, ny)) continue;
      seen.add(k);
      todo.push([nx, ny]);
    }
  }
  return seen;
}

/** Is a solid tile at (x, y) touched from a reachable neighbour? */
const besideReach = (r: Set<string>, x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => r.has(`${x + dx},${y + dy}`));

describe('road s1', () => {
  const g = new IsoGrid(ROAD_S1, true);

  it('is a rectangle with one start, goal and way back', () => {
    for (const row of ROAD_S1) expect(row.length).toBe(ROAD_S1[0].length);
    for (const ch of 'PGX') expect(g.markers.filter((m) => m.ch === ch).length, ch).toBe(1);
  });

  it('every foe, the goal, the way back and every jar can be reached from the start', () => {
    const p = g.marker('P')!;
    const r = flood(g, p.x, p.y);
    for (const m of g.markers) expect(r.has(`${m.x},${m.y}`), `${m.ch} at ${m.x},${m.y}`).toBe(true);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.ch(x, y) === 'J') expect(besideReach(r, x, y), `jar ${x},${y}`).toBe(true);
  });

  it('the way back and the goal sit on the map edge rows', () => {
    expect(g.marker('X')!.y).toBe(g.h - 1);
    expect(g.marker('G')!.y).toBeLessThan(5);
  });
});

describe('Haiya village', () => {
  const g = new IsoGrid(HAIYA.map, true);

  it('is a rectangle whose buildings sit on H tiles', () => {
    for (const row of HAIYA.map) expect(row.length).toBe(HAIYA.map[0].length);
    for (const b of HAIYA.buildings) {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) expect(g.ch(x, y), `${b.kind} ${x},${y}`).toBe('H');
    }
    const hs = HAIYA.map.join('').split('').filter((c) => c === 'H').length;
    expect(hs).toBe(HAIYA.buildings.reduce((n, b) => n + b.w * b.h, 0));
  });

  it('every villager stands on an N tile and can be reached from the start', () => {
    const p = g.marker('P')!;
    const r = flood(g, p.x, p.y);
    expect(r.has(`${g.marker('X')!.x},${g.marker('X')!.y}`)).toBe(true);
    const ns = HAIYA.map.join('').split('').filter((c) => c === 'N').length;
    expect(ns).toBe(HAIYA.villagers.length);
    for (const v of HAIYA.villagers) {
      expect(g.ch(v.x, v.y)).toBe('N');
      expect(besideReach(r, v.x, v.y), `${v.look}`).toBe(true);
    }
  });
});

describe('world map at iso scale', () => {
  const rows = worldRows();
  const sealed = new IsoGrid(rows, false);
  const start = { x: 6 * WT + 1, y: 25 * WT + 1 };

  it('is the world map scaled 3x', () => {
    expect(rows.length).toBe(WORLD_H * WT);
    for (const r of rows) expect(r.length).toBe(WORLD_W * WT);
  });

  it('keeps chapter 1 places reachable without seals, and chapter 2 behind the mist', () => {
    const r = flood(sealed, start.x, start.y);
    const placeOpen = (ch: string) => {
      for (let ty = 0; ty < WORLD_H; ty++) {
        const tx = WORLD_MAP[ty].indexOf(ch);
        if (tx >= 0) return besideReach(r, tx * WT + 1, ty * WT + 1);
      }
      throw new Error(ch);
    };
    expect(placeOpen('1')).toBe(true);
    expect(placeOpen('V')).toBe(true);
    expect(placeOpen('2')).toBe(false);
    expect(placeOpen('v')).toBe(false);
    const opened = new IsoGrid(rows, false, (c) => c === 'a');
    const r2 = flood(opened, start.x, start.y);
    const [x2, y2] = [28 * WT + 1, 15 * WT + 1];
    expect(besideReach(r2, x2, y2)).toBe(true);
  });

  it('return points, shrines and spirits stand on open ground', () => {
    for (const id of Object.values(ENTRANCE_DUNGEON)) {
      const p = WORLD_ENTRANCES[id];
      expect(sealed.blocked(p.x * WT + 1, p.y * WT + 1), id).toBe(false);
    }
    for (const k of Object.keys(SHRINES)) {
      const [x, y] = k.split(',').map(Number);
      expect(sealed.ch(x * WT + 1, y * WT + 1)).toBe('S');
    }
    for (const s of SPIRITS) expect(sealed.blocked(s.x * WT + 1, s.y * WT + 1)).toBe(false);
  });
});

describe('iso grid', () => {
  const g = new IsoGrid(['.....', '.###.', '...#.', '.#...'], false);

  it('finds a path around solid tiles without cutting corners', () => {
    const p = g.path({ x: tileMid(0), z: tileMid(2) }, { x: tileMid(4), z: tileMid(2) })!;
    expect(p).not.toBeNull();
    expect(p[p.length - 1]).toEqual({ x: tileMid(4), z: tileMid(2) });
    let prev = { x: 0, y: 2 };
    for (const q of p) {
      const x = Math.floor(q.x / 2), y = Math.floor(q.z / 2);
      expect(g.blocked(x, y)).toBe(false);
      if (x !== prev.x && y !== prev.y) expect(g.blocked(x, prev.y) || g.blocked(prev.x, y)).toBe(false);
      prev = { x, y };
    }
  });

  it('returns null for a solid goal', () => {
    expect(g.path({ x: tileMid(0), z: tileMid(0) }, { x: tileMid(2), z: tileMid(1) })).toBeNull();
  });

  it('pushes a body out of solid tiles', () => {
    const p = { x: tileMid(2), z: tileMid(1) - 1.2 };
    collide(p, 0.4, g.solid);
    expect(p.z).toBeLessThanOrEqual(2 - 0.4 + 1e-9);
  });
});
