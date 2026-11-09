import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../src/data/levels/world';
import { FOG_BLOCK, FOG_SIGHT, fogBlock, fogKey, liftFog } from '../src/world/IsoFog';
import { SUB, WT, worldMid } from '../src/world/IsoMap';

describe('fog of war (isometric areas)', () => {
  it('keys world-map tiles on the plains and 3x3 blocks elsewhere', () => {
    expect(FOG_BLOCK).toBe(WT); // a block is one world-map tile
    expect(fogKey('world', 3, 4)).toBe('w:3,4');
    expect(fogKey('village', 3, 4)).toBe('village:3,4');
    expect(fogBlock(worldMid(7))).toBe(7);
  });

  it('lifts the blocks within sight, each once', () => {
    const v: Record<string, boolean> = {};
    const got = liftFog(v, 'world', WORLD_W * WT, WORLD_H * WT, worldMid(10), worldMid(12));
    expect(got).toContainEqual([10, 12]);
    for (const [bx, by] of got) expect(Math.hypot(bx - 10, by - 12) * FOG_BLOCK * SUB).toBeLessThanOrEqual(FOG_SIGHT);
    expect(v['w:12,12']).toBe(true); // 12 m east
    expect(v['w:13,12']).toBeUndefined(); // 18 m east
    expect(v['w:11,13']).toBe(true); // 8.5 m south-east
    expect(v['w:12,13']).toBeUndefined(); // 13.4 m
    expect(Object.keys(v)).toHaveLength(got.length);
    expect(liftFog(v, 'world', WORLD_W * WT, WORLD_H * WT, worldMid(10), worldMid(12))).toEqual([]);
  });

  it('stays inside the map', () => {
    const v: Record<string, boolean> = {};
    const got = liftFog(v, 'road', 26, 72, 1, 1);
    expect(got.length).toBeGreaterThan(0);
    expect(got.every(([x, y]) => x >= 0 && y >= 0 && x < 9 && y < 24)).toBe(true);
    expect(Object.keys(v).every((k) => k.startsWith('road:'))).toBe(true);
  });
});
