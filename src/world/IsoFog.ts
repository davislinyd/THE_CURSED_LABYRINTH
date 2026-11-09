import { SUB } from './IsoMap';

/** The fog of war of the isometric areas lifts in blocks of 3x3 tiles (one world-map tile on the plains). */
export const FOG_BLOCK = 3;
/** How far around the hero the fog lifts, in metres (the view reaches 10-14 m from the hero). */
export const FOG_SIGHT = 12;
const SIZE = FOG_BLOCK * SUB;

/** Key of a block in GameState.visited: "w:x,y" on the plains (world-map tiles), "<area>:x,y" elsewhere. */
export const fogKey = (area: string, bx: number, by: number) => `${area === 'world' ? 'w' : area}:${bx},${by}`;

/** The block holding a point in metres. */
export const fogBlock = (m: number) => Math.floor(m / SIZE);

/**
 * Lift the fog within FOG_SIGHT of (x, z) metres on a map of `w` x `h` tiles;
 * returns the blocks seen for the first time.
 */
export function liftFog(visited: Record<string, boolean>, area: string, w: number, h: number, x: number, z: number): [number, number][] {
  const out: [number, number][] = [];
  const r = Math.ceil(FOG_SIGHT / SIZE), cx = fogBlock(x), cy = fogBlock(z);
  const bw = Math.ceil(w / FOG_BLOCK), bh = Math.ceil(h / FOG_BLOCK);
  for (let by = Math.max(0, cy - r); by <= Math.min(bh - 1, cy + r); by++) {
    for (let bx = Math.max(0, cx - r); bx <= Math.min(bw - 1, cx + r); bx++) {
      const k = fogKey(area, bx, by);
      if (visited[k] || Math.hypot((bx + 0.5) * SIZE - x, (by + 0.5) * SIZE - z) > FOG_SIGHT) continue;
      visited[k] = true;
      out.push([bx, by]);
    }
  }
  return out;
}
