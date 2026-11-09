import { describe, expect, it } from 'vitest';
import { DUNGEONS } from '../src/data/levels/dungeons';
import { Dungeon } from '../src/world/DungeonMap';
import { CELL, cellKind, center, clearance, collide, inSolid, layout, solidRects } from '../src/world/Grid3D';

const flags = (on: Record<string, boolean> = {}) => ({ get: (n: string) => !!on[n] });

describe('3D labyrinth grid', () => {
  for (const def of Object.values(DUNGEONS)) {
    it(`${def.id}: every open cell has a floor and is closed in by walls`, () => {
      const d = new Dungeon(def, flags());
      const { open, walls } = layout(d);
      const openSet = new Set(open.map(([x, y]) => `${x},${y}`));
      for (let y = 0; y < d.h; y++)
        for (let x = 0; x < d.w; x++) expect(openSet.has(`${x},${y}`), `${x},${y}`).toBe(cellKind(d.ch(x, y)) === 'open');
      // each open cell's side is either another open cell or exactly one wall face
      const faces = new Set(walls.map((w) => `${w.x},${w.y},${w.dir}`));
      expect(faces.size).toBe(walls.length);
      const NX = [0, 1, 0, -1], NY = [-1, 0, 1, 0];
      for (const [x, y] of open)
        for (let dir = 0; dir < 4; dir++) expect(openSet.has(`${x + NX[dir]},${y + NY[dir]}`) !== faces.has(`${x},${y},${dir}`)).toBe(true);
      // the start cell is free to stand in
      expect(inSolid({ x: center(d.start.x), z: center(d.start.y) }, (x, y) => solidRects(d, x, y))).toBe(false);
    });
  }

  const d1 = (on?: Record<string, boolean>) => new Dungeon(DUNGEONS.d1, flags(on));

  it('keeps a walker out of walls', () => {
    const d = d1();
    const solid = (x: number, y: number) => solidRects(d, x, y);
    // start (6,11): the cell to the west (5,11) is rock
    const p = { x: center(6), z: center(11) };
    for (let i = 0; i < 100; i++) {
      p.x -= 0.1;
      collide(p, 0.4, solid);
    }
    expect(p.x).toBeCloseTo(6 * CELL + 0.4, 5);
    expect(inSolid(p, solid)).toBe(false);
  });

  it('a closed door is a thin slab across the passage; opened, it lets you through', () => {
    // door D at (6,7) in a north-south corridor
    const closed = d1();
    const solid = (x: number, y: number) => solidRects(closed, x, y);
    const p = { x: center(6), z: center(8) };
    for (let i = 0; i < 100; i++) {
      p.z -= 0.1;
      collide(p, 0.4, solid);
    }
    expect(p.z).toBeGreaterThan(center(7));
    expect(p.z).toBeLessThan(center(7) + 1);
    const open = d1({ 'd1:open:6,7': true });
    const q = { x: center(6), z: center(8) };
    for (let i = 0; i < 60; i++) {
      q.z -= 0.1;
      collide(q, 0.4, (x, y) => solidRects(open, x, y));
    }
    expect(q.z).toBeLessThan(center(7) - 1);
  });

  it('faces are solid; false walls are not', () => {
    const d = d1();
    expect(solidRects(d, 6, 0)).toHaveLength(1); // tablet
    expect(solidRects(d, 7, 1)).toHaveLength(0); // F
  });

  it('measures the clear part of a sight line', () => {
    const d = d1();
    const solid = (x: number, y: number) => solidRects(d, x, y);
    expect(clearance({ x: center(6), z: center(11) }, { x: center(10), z: center(11) }, solid)).toBe(1);
    const k = clearance({ x: center(6), z: center(11) }, { x: center(6) - 8, z: center(11) }, solid);
    expect(k).toBeGreaterThan(0.2);
    expect(k).toBeLessThan(0.3);
  });
});
