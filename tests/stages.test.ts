import { describe, expect, it } from 'vitest';
import { STAGES, StageId } from '../src/data/levels/stages';

const ROWS = 13;
const MAX_GAP = 3; // tiles the hero clears horizontally (jump -5, gravity 0.25, ~1.5 px/frame)
const MAX_RISE = 2; // tiles the hero climbs with one jump

/** Standable tops per column: a solid / platform / crumble tile with no wall above. */
function surfaces(rows: string[]): number[][] {
  return Array.from({ length: rows[0].length }, (_, x) => {
    const tops: number[] = [];
    for (let y = 1; y < ROWS; y++) if ('#=C'.includes(rows[y][x]) && rows[y - 1][x] !== '#') tops.push(y);
    return tops;
  });
}

/** Coarse jump-reach BFS over standing spots; true if the goal column can be reached. */
function reachesGoal(rows: string[]): boolean {
  const tops = surfaces(rows);
  let sx = -1, sy = -1, goal = -1;
  rows.forEach((r, y) => {
    if (r.includes('P')) [sx, sy] = [r.indexOf('P'), y];
    if (r.includes('G')) goal = r.indexOf('G');
  });
  const st = tops[sx].find((t) => t >= sy);
  if (st === undefined) return false;
  const seen = new Set([`${sx},${st}`]);
  const todo: [number, number][] = [[sx, st]];
  while (todo.length) {
    const [x, t] = todo.pop()!;
    if (x >= goal - 1) return true;
    for (let dx = -MAX_GAP - 1; dx <= MAX_GAP + 1; dx++) {
      const nx = x + dx;
      if (dx === 0 || nx < 0 || nx >= rows[0].length) continue;
      for (const nt of tops[nx]) {
        if (rows[nt][nx] === '^') continue;
        const rise = t - nt;
        if (rise > MAX_RISE || Math.abs(dx) > MAX_GAP + 1 + (Math.max(0, -rise) >> 1)) continue;
        const k = `${nx},${nt}`;
        if (!seen.has(k)) {
          seen.add(k);
          todo.push([nx, nt]);
        }
      }
    }
  }
  return false;
}

describe('side-scrolling stages', () => {
  for (const id of Object.keys(STAGES) as StageId[]) {
    const { map } = STAGES[id];
    it(`${id} is a 13-row rectangle with one start and one goal`, () => {
      expect(map.length).toBe(ROWS);
      for (const row of map) expect(row.length).toBe(map[0].length);
      const all = map.join('');
      expect(all.split('P').length - 1).toBe(1);
      expect(all.split('G').length - 1).toBe(1);
      expect(all).toMatch(/^[.#=C^~PGJFgwckbhrson]+$/);
    });
    it(`${id} goal is reachable by walking and jumping`, () => {
      expect(reachesGoal(map)).toBe(true);
    });
  }

  it('the validator rejects a gap wider than a jump', () => {
    const rows = Array.from({ length: ROWS }, (_, y) => (y < 10 ? '.'.repeat(20) : '#'.repeat(5) + '.'.repeat(6) + '#'.repeat(9)));
    rows[9] = '..P' + '.'.repeat(15) + 'G.';
    expect(reachesGoal(rows)).toBe(false);
  });
});
