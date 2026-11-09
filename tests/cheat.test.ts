import { describe, expect, it } from 'vitest';
import { CHEAT_CODE, CHEAT_GAP, CheatCode } from '../src/core/Cheat';

/** Feed taps 10 ticks apart; returns the ticks on which the code completed. */
function run(taps: string[], gap = 10, c = new CheatCode()): number[] {
  const hits: number[] = [];
  taps.forEach((tap, i) => {
    if (c.feed(tap, i * gap)) hits.push(i);
  });
  return hits;
}

describe('test cheat code', () => {
  it('fires on ↑↑↓↓←→←→BA', () => {
    expect(run(CHEAT_CODE)).toEqual([CHEAT_CODE.length - 1]);
  });

  it('does not fire on a wrong press in the middle', () => {
    const taps = [...CHEAT_CODE];
    taps[5] = 'U';
    expect(run(taps)).toEqual([]);
  });

  it('still fires after extra presses that restart it (↑↑↑↓↓…)', () => {
    expect(run(['U', ...CHEAT_CODE])).toEqual([CHEAT_CODE.length]);
    expect(run(['D', 'B', 'U', 'U', 'D', 'U', ...CHEAT_CODE])).toEqual([5 + CHEAT_CODE.length]);
  });

  it('needs each press within a second of the last', () => {
    expect(run(CHEAT_CODE, CHEAT_GAP)).toEqual([CHEAT_CODE.length - 1]);
    expect(run(CHEAT_CODE, CHEAT_GAP + 1)).toEqual([]);
  });

  it('can be entered again to switch it back', () => {
    const c = new CheatCode();
    expect(run([...CHEAT_CODE, ...CHEAT_CODE], 10, c)).toEqual([CHEAT_CODE.length - 1, 2 * CHEAT_CODE.length - 1]);
  });
});
