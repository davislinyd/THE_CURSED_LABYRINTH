import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BUFFER, COUNTER_WINDOW, DODGE_TO_ATTACK, HeroInput, HeroMachine, PARRY_WINDOW, TIMING, USE_TICK } from '../src/combat/HeroMachine';
import { SAMURAI_CLIPS } from '../src/actors/Samurai';

const NONE: HeroInput = { move: 0, attack: false, strong: false, dodge: false, use: false, guard: false };
const run = (m: HeroMachine, ticks: number, inp: Partial<HeroInput> = {}) => {
  for (let i = 0; i < ticks; i++) m.update({ ...NONE, ...inp });
};

describe('hero state machine', () => {
  it('chains the three-step combo on buffered presses and returns to idle', () => {
    const m = new HeroMachine();
    run(m, 1, { attack: true });
    expect(m.state).toBe('atk1');
    run(m, 2);
    run(m, 1, { attack: true }); // pressed early: buffered until the cancel tick
    run(m, TIMING.atk1.cancel! - 4);
    expect(m.state).toBe('atk1');
    run(m, 1);
    expect(m.state).toBe('atk2');
    run(m, 1, { attack: true });
    run(m, TIMING.atk2.cancel!);
    expect(m.state).toBe('atk3');
    run(m, TIMING.atk3.len);
    expect(m.state).toBe('idle');
  });

  it('forgets a press older than the buffer', () => {
    const m = new HeroMachine();
    run(m, 1, { strong: true });
    expect(m.state).toBe('strong');
    run(m, 2);
    run(m, 1, { attack: true });
    expect(TIMING.strong.cancel! - 3).toBeGreaterThan(BUFFER);
    run(m, TIMING.strong.len);
    expect(m.state).toBe('idle');
  });

  it('only hurts during the active window, with a new swing id per swing', () => {
    const m = new HeroMachine();
    run(m, 1, { attack: true });
    const [a, b] = TIMING.atk1.active!;
    const seen: number[] = [];
    for (let t = 1; t < TIMING.atk1.len; t++) {
      run(m, 1);
      if (m.attack) seen.push(m.t);
      if (m.t === a) expect(m.events).toContain('swing');
    }
    expect(seen).toEqual(Array.from({ length: b - a }, (_, i) => a + i));
    const first = m.swing;
    run(m, 1, { attack: true });
    expect(m.swing).toBe(first + 1);
  });

  it('dodges through blows only inside its invulnerable frames', () => {
    const m = new HeroMachine();
    run(m, 1, { dodge: true });
    expect(m.state).toBe('dodge');
    expect(m.lunge).toBeGreaterThan(0);
    run(m, TIMING.dodge.iframes![0]);
    expect(m.hit()).toBe('ignored');
    run(m, TIMING.dodge.iframes![1] - m.t);
    expect(m.hit()).toBe('hit');
    expect(m.state).toBe('hurt');
  });

  it('parries a blow right after raising the guard, then counters', () => {
    const m = new HeroMachine();
    run(m, PARRY_WINDOW, { guard: true });
    expect(m.state).toBe('guard');
    expect(m.hit()).toBe('parried');
    expect(m.events).toContain('parry');
    expect(m.state).toBe('guard');
    run(m, 1, { guard: true, attack: true });
    expect(m.state).toBe('counter');
    expect(m.invulnerable).toBe(true);
    expect(m.hit()).toBe('ignored');
  });

  it('a late guard only blocks, and the counter chance expires', () => {
    const m = new HeroMachine();
    run(m, PARRY_WINDOW + 2, { guard: true });
    expect(m.hit()).toBe('guarded');
    expect(m.state).toBe('guardHit');
    run(m, TIMING.guardHit.len, { guard: true });
    expect(m.state).toBe('guard');
    expect(m.hit()).toBe('guarded'); // no fresh parry window after a blocked blow
    const p = new HeroMachine();
    run(p, 1, { guard: true });
    p.hit();
    run(p, COUNTER_WINDOW, { guard: true });
    expect(p.canCounter).toBe(false);
    run(p, 1, { guard: true, attack: true });
    expect(p.state).toBe('atk1');
  });

  it('cannot guard a blow from behind; a hit interrupts an attack; death is final', () => {
    const m = new HeroMachine();
    run(m, 1, { guard: true });
    expect(m.hit(false)).toBe('hit');
    run(m, TIMING.hurt.len);
    run(m, 1, { attack: true });
    expect(m.hit()).toBe('hit');
    expect(m.state).toBe('hurt');
    m.kill();
    run(m, 60, { attack: true, move: 1 });
    expect(m.state).toBe('die');
    expect(m.hit()).toBe('ignored');
  });

  it('throws the talisman on its tick and moves only when free', () => {
    const m = new HeroMachine();
    run(m, 1, { move: 1 });
    expect(m.state).toBe('run');
    expect(m.moveFactor).toBe(1);
    run(m, 1, { use: true });
    expect(m.moveFactor).toBe(0);
    let thrown = 0;
    for (let i = 0; i < TIMING.use.len; i++) {
      run(m, 1);
      if (m.events.includes('use')) thrown = m.t;
    }
    expect(thrown).toBe(USE_TICK);
  });

  it('dodges out of a blow once its blade has passed, and strikes out of a dodge early', () => {
    const m = new HeroMachine();
    run(m, 1, { attack: true });
    run(m, 1, { dodge: true });
    run(m, TIMING.atk1.active![1] - 2);
    expect(m.state).toBe('atk1');
    run(m, 1);
    expect(m.state).toBe('dodge');
    run(m, 2, { attack: true });
    run(m, DODGE_TO_ATTACK - 3);
    expect(m.state).toBe('dodge');
    run(m, 1);
    expect(m.state).toBe('atk1');
    // a dodge into another dodge still waits for its cancel tick
    const d = new HeroMachine();
    run(d, 1, { dodge: true });
    run(d, 9);
    run(d, 1, { dodge: true });
    run(d, DODGE_TO_ATTACK - 10);
    expect(d.state).toBe('dodge');
    expect(d.t).toBe(DODGE_TO_ATTACK);
    run(d, TIMING.dodge.cancel! - DODGE_TO_ATTACK);
    expect(d.state).toBe('dodge');
    expect(d.t).toBe(0);
  });

  it('lunges fast then slow over the same distance', () => {
    for (const s of ['atk1', 'atk3', 'strong', 'dodge'] as const) {
      const m = new HeroMachine();
      run(m, 1, s === 'dodge' ? { dodge: true } : s === 'strong' ? { strong: true } : { attack: true });
      if (s === 'atk3') {
        run(m, TIMING.atk1.cancel!, { attack: true });
        run(m, TIMING.atk2.cancel!, { attack: true });
      }
      expect(m.state).toBe(s);
      const [a, b, v] = TIMING[s].lunge!;
      const speeds: number[] = [];
      for (let t = m.t; t < TIMING[s].len; t++) {
        if (m.t >= a && m.t < b) speeds.push(m.lunge);
        run(m, 1);
      }
      expect(speeds).toHaveLength(b - a);
      expect(speeds.reduce((x, y) => x + y, 0)).toBeCloseTo(v * (b - a), 6);
      expect(speeds[0]).toBeGreaterThan(speeds[speeds.length - 1]);
    }
  });

  it('remembers a command given in a hit-stop, and repeats a held one only when it can start', () => {
    const m = new HeroMachine();
    run(m, 1, { attack: true });
    m.buffer({ ...NONE, attack: true }); // pressed while the world stood still
    run(m, TIMING.atk1.cancel!);
    expect(m.state).toBe('atk2');
    // a held button: one swing chained per cancel tick, none left over after letting go
    const h = new HeroMachine();
    run(h, 1, { attack: true });
    for (let i = 0; i < 20; i++) run(h, 1, { attack: h.ready });
    expect(h.state).toBe('atk2');
    const swings = h.swing;
    run(h, 60);
    expect(h.state).toBe('idle');
    expect(h.swing).toBe(swings);
  });

  it('aims a blow during its wind-up and an item until it leaves the hand', () => {
    const m = new HeroMachine();
    run(m, 1, { attack: true });
    expect(m.canTurn).toBe(true);
    run(m, TIMING.atk1.active![0] - 1);
    expect(m.canTurn).toBe(true);
    run(m, 1);
    expect(m.canTurn).toBe(false);
    run(m, TIMING.atk1.len);
    run(m, 1, { use: true });
    expect(m.state).toBe('use');
    run(m, USE_TICK - 1);
    expect(m.canTurn).toBe(true);
    run(m, 1);
    expect(m.canTurn).toBe(false);
  });

  it('kicks up dust setting off at a run, and as a dodge starts and lands', () => {
    const m = new HeroMachine();
    run(m, 1, { move: 1 });
    expect(m.state).toBe('run');
    expect(m.events).toContain('dust');
    run(m, 1, { move: 1 });
    expect(m.events).not.toContain('dust');
    run(m, 1, { dodge: true });
    expect(m.state).toBe('dodge');
    expect(m.events).toContain('dust');
    const landed: number[] = [];
    for (let i = 0; i < TIMING.dodge.len; i++) {
      run(m, 1);
      if (m.events.includes('dust')) landed.push(m.t);
    }
    expect(landed).toHaveLength(1);
    expect(landed[0]).toBeGreaterThan(TIMING.dodge.lunge![0]);
    expect(landed[0]).toBeLessThanOrEqual(TIMING.dodge.lunge![1]);
  });

  it('matches the clip lengths of the samurai animations', () => {
    for (const [name, tm] of Object.entries(TIMING)) {
      const clip = SAMURAI_CLIPS[name as keyof typeof SAMURAI_CLIPS];
      expect(Math.round(clip.duration * 60), name).toBe(tm.len);
    }
  });

  it('runs on a smooth loop: no joint snaps back or stops dead at a pose, and the free hand keeps still', () => {
    const clip = SAMURAI_CLIPS.run, n = Math.round(clip.duration * 120);
    for (const track of clip.tracks) {
      if (!track.name.endsWith('.quaternion')) continue;
      const f = track.InterpolantFactoryMethodLinear();
      // two laps, a sample per tick, across the seam of the loop
      const q = Array.from({ length: n }, (_, k) => new THREE.Quaternion().fromArray(Array.from(f.evaluate((k / 60) % clip.duration))));
      // each tick's turn as a rotation vector in degrees; a snap is a sudden change of it
      const turn = q.slice(1).map((b, k) => {
        const r = q[k].clone().invert().multiply(b);
        return new THREE.Vector3(r.x, r.y, r.z).multiplyScalar(((r.w < 0 ? -2 : 2) * 180) / Math.PI);
      });
      for (let k = 1; k < turn.length; k++) expect(turn[k].distanceTo(turn[k - 1]), `${track.name} tick ${k}`).toBeLessThan(4);
      if (track.name === 'handL.quaternion') for (const r of q) expect(r.angleTo(q[0]) * (180 / Math.PI)).toBeLessThan(5);
    }
  });
});
