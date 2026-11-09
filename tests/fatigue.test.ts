import { describe, expect, it } from 'vitest';
import { Fatigue, Pace, RECOVERED, REST, RUN_PACE, SPENT_PACE, TIRE_RUN, TIRE_WALK } from '../src/combat/Fatigue';
import { RULES, harm, toughness } from '../src/core/Difficulty';

const spend = (f: Fatigue, how: Pace, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) f.tick(how);
};

describe('fatigue', () => {
  it('wears the hero out after TIRE_RUN s of running, or TIRE_WALK s of walking', () => {
    const f = new Fatigue();
    expect(f.toggle()).toBe(true);
    expect(f.pace).toBe(RUN_PACE);
    spend(f, 'run', TIRE_RUN - 0.5);
    expect(f.spent).toBe(false);
    spend(f, 'run', 1);
    expect(f.spent).toBe(true);
    expect(f.running).toBe(false); // dropped out of the run
    expect(f.pace).toBe(SPENT_PACE);
    const w = new Fatigue();
    spend(w, 'walk', TIRE_WALK - 1);
    expect(w.spent).toBe(false);
    spend(w, 'walk', 2);
    expect(w.spent).toBe(true);
  });

  it('cannot run while worn out, and only standing still rests it off', () => {
    const f = new Fatigue();
    f.toggle();
    spend(f, 'run', TIRE_RUN + 1);
    expect(f.toggle()).toBe(false);
    expect(f.running).toBe(false);
    spend(f, 'walk', 30);
    expect(f.spent).toBe(true);
    spend(f, 'rest', (1 - RECOVERED) * REST - 0.1);
    expect(f.spent).toBe(true);
    spend(f, 'rest', 0.2);
    expect(f.spent).toBe(false);
    expect(f.toggle()).toBe(true);
    expect(f.pace).toBe(RUN_PACE);
    spend(f, 'rest', REST);
    expect(f.level).toBe(0);
  });

  it('tires slower on easy and faster on hard', () => {
    const after = (rate: number) => {
      const f = new Fatigue();
      f.rate = rate;
      spend(f, 'run', 4);
      return f.level;
    };
    expect(after(RULES.easy.tire)).toBeLessThan(after(RULES.normal.tire));
    expect(after(RULES.hard.tire)).toBeGreaterThan(after(RULES.normal.tire));
  });
});

describe('difficulty', () => {
  it('scales the blows the hero takes, never below 1', () => {
    expect(harm('normal', 2)).toBe(2);
    expect(harm('easy', 2)).toBe(1);
    expect(harm('easy', 1)).toBe(1);
    expect(harm('hard', 2)).toBe(3);
  });

  it('scales the hit points of foes and guardians, never below 1', () => {
    expect(toughness('normal', 4)).toBe(4);
    expect(toughness('easy', 4)).toBe(3);
    expect(toughness('hard', 4)).toBe(5);
    expect(toughness('easy', 1)).toBe(1);
  });
});
