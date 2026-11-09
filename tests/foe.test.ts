import { describe, expect, it } from 'vitest';
import { ENEMY_ATTACK, ENEMY_REACT } from '../src/actors/Enemies';
import { FOES, Foe } from '../src/combat/Foe';

/** Run until the predicate holds or `max` ticks pass; returns ticks taken and hits taken. */
const until = (f: Foe, px: number, pz: number, done: () => boolean, max = 600) => {
  let hits = 0, n = 0;
  while (!done() && n < max) {
    if (f.update(px, pz, true) === 'hit') hits++;
    n++;
  }
  return { n, hits };
};

describe('enemy behaviour', () => {
  it('a ghoul closes in, winds up, and lands one blow in its active window', () => {
    const f = new Foe('ghoul', 0, 0);
    const r1 = until(f, 0, 6, () => f.state === 'attack');
    expect(r1.n).toBeLessThan(400);
    expect(f.z).toBeGreaterThan(6 - FOES.ghoul.range - 0.1);
    const ticks: number[] = [];
    let hits = 0;
    for (let i = 0; i < ENEMY_ATTACK.ghoul.len; i++) {
      if (f.update(0, 6, true) === 'hit') {
        hits++;
        ticks.push(f.t);
      }
    }
    expect(hits).toBe(1);
    const [a, b] = ENEMY_ATTACK.ghoul.active;
    expect(ticks[0]).toBeGreaterThanOrEqual(a);
    expect(ticks[0]).toBeLessThan(b);
    expect(f.state).toBe('chase');
  });

  it('misses a hero who steps back out of reach', () => {
    const f = new Foe('ghoul', 0, 0);
    until(f, 0, 2, () => f.state === 'attack');
    const r = until(f, 0, 9, () => f.state !== 'attack');
    expect(r.hits).toBe(0);
  });

  it('flinches, staggers from heavy blows, and dies at zero', () => {
    const f = new Foe('ghoul', 0, 0);
    expect(f.hurt(1, 1)).toBe(false);
    expect(f.state).toBe('hurt');
    expect(f.hurt(1, 2.5)).toBe(false);
    expect(f.state).toBe('stagger');
    const r = until(f, 0, 1.5, () => f.state === 'attack', ENEMY_REACT.stagger - 2);
    expect(r.hits).toBe(0);
    expect(f.state).toBe('stagger');
    expect(f.hurt(5, 1)).toBe(true);
    expect(f.alive).toBe(false);
    until(f, 0, 1.5, () => f.state === 'dead');
    expect(f.state).toBe('dead');
    expect(f.hurt(5, 1)).toBe(false);
  });

  it('is knocked away from the blow, farther by power and on the killing blow, then slides to a stop', () => {
    const slide = (damage: number, power: number) => {
      const f = new Foe('ghoul', 0, 2);
      f.hurt(damage, power, { x: 0, z: 0 });
      for (let i = 0; i < 18; i++) f.update(0, 40, true);
      const at = f.z;
      f.update(0, 40, true);
      return { d: at - 2, moving: f.z !== at, x: f.x };
    };
    const light = slide(1, 1), heavy = slide(1, 2.5), kill = slide(9, 1);
    expect(light.d).toBeGreaterThan(0.2);
    expect(light.d).toBeLessThan(0.35);
    expect(light.moving).toBe(false);
    expect(light.x).toBe(0);
    expect(heavy.d).toBeGreaterThan(light.d * 2);
    expect(kill.d).toBeGreaterThan(light.d * 1.3);
    // no source given: no knock-back
    const f = new Foe('ghoul', 0, 2);
    f.hurt(1, 1);
    f.update(0, 40, true);
    expect(f.z).toBe(2);
  });

  it('warns once, well before its blow lands', () => {
    const f = new Foe('ghoul', 0, 0);
    until(f, 0, 1.5, () => f.state === 'attack');
    const warned: number[] = [];
    for (let i = 0; i < ENEMY_ATTACK.ghoul.len; i++) {
      f.update(0, 1.5, true);
      if (f.warn) warned.push(f.t);
    }
    expect(warned).toHaveLength(1);
    expect(ENEMY_ATTACK.ghoul.active[0] - warned[0]).toBeGreaterThanOrEqual(10);
  });

  it('a hopper only gains ground while in the air', () => {
    const f = new Foe('hopper', 0, 0);
    f.update(0, 10, true); // notices
    const zs: number[] = [];
    for (let i = 0; i < 36; i++) {
      f.update(0, 10, true);
      zs.push(f.z);
    }
    const moved = zs.map((z, i) => (i ? z - zs[i - 1] : 0));
    expect(moved.filter((m) => m > 0).length).toBeGreaterThan(15);
    expect(moved.filter((m) => m === 0).length).toBeGreaterThan(8);
  });

  it('a wisp keeps its distance, then rushes along a locked line', () => {
    const f = new Foe('wisp', 0, 0);
    for (let i = 0; i < 28; i++) f.update(0, 2, true);
    expect(f.z).toBeLessThan(-0.3); // backs off from a hero too close
    const r = until(f, 0, 3, () => f.state === 'attack');
    expect(r.n).toBeLessThan(600);
    const hits = until(f, 0, 3, () => f.state !== 'attack').hits;
    expect(hits).toBe(1);
  });

  it('a roaming spirit wanders near home until the hero comes in sight', () => {
    const f = new Foe('ghoul', 0, 0);
    f.roam = true;
    let far = 0;
    for (let i = 0; i < 3000; i++) {
      f.update(100, 100, true);
      far = Math.max(far, Math.hypot(f.x, f.z));
    }
    expect(f.state).toBe('idle');
    expect(far).toBeGreaterThan(1);
    expect(far).toBeLessThan(7);
    for (let i = 0; i < 2 && f.state === 'idle'; i++) f.update(f.x + 5, f.z, true);
    expect(f.state).toBe('chase');
  });
});
