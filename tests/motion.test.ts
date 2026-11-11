import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Animator } from '../src/actors/Animator';
import { BodyMotion, Carriage } from '../src/actors/BodyMotion';
import { FootPlant, stride } from '../src/actors/FootPlant';
import { BONES, buildRig } from '../src/actors/Rig';
import { SAMURAI_CLIPS } from '../src/actors/Samurai';
import { Dangle, DangleSpec, Secondary } from '../src/actors/Secondary';

const DT = 1 / 60;
const SPEC: DangleSpec = { length: 0.2, stiffness: 175, damping: 11, drag: 1.6, gravity: 6, limit: 1.05 };
const DOWN = new THREE.Vector3(0, -1, 0);

/** A body (root) with a plate hanging 1 m up; returns the plate's swing from straight down, in radians, after each tick. */
function swing(spec: DangleSpec, move: (root: THREE.Object3D, tick: number) => void, ticks: number): number[] {
  const root = new THREE.Group(), plate = new THREE.Object3D();
  plate.position.set(0, 1, 0);
  root.add(plate);
  const d = new Dangle(plate, spec), out: number[] = [];
  for (let t = 0; t < ticks; t++) {
    move(root, t);
    root.updateMatrixWorld(true);
    d.update(DT);
    out.push(DOWN.clone().applyQuaternion(plate.quaternion).angleTo(DOWN));
  }
  return out;
}

describe('hanging parts', () => {
  it('hang still on a body at rest', () => {
    expect(Math.max(...swing(SPEC, () => undefined, 120))).toBeLessThan(1e-6);
  });

  it('trail when the body sets off, swing on when it stops, and settle', () => {
    // 5 m/s along +z for a second, then a dead stop
    const a = swing(SPEC, (r, t) => (r.position.z = Math.min(t, 60) * 5 * DT), 240);
    expect(Math.max(...a.slice(0, 20))).toBeGreaterThan(0.08); // swung back at the start
    expect(a[59]).toBeLessThan(0.2); // riding along, only the air's drag holds it back (about nine degrees at a walk)
    expect(a[59]).toBeGreaterThan(0.005);
    expect(Math.max(...a.slice(60, 80))).toBeGreaterThan(0.08); // swung forward at the stop
    expect(a[239]).toBeLessThan(0.01);
  });

  it('never swings past its stop, however the body is thrown about', () => {
    const a = swing({ ...SPEC, limit: 0.4 }, (r, t) => r.position.set(Math.sin(t * 0.9) * 3, 0, Math.cos(t * 1.3) * 3), 300);
    expect(Math.max(...a)).toBeLessThanOrEqual(0.4 + 1e-6);
  });

  it('moves smoothly: no jump from one tick to the next under steady motion', () => {
    const a = swing(SPEC, (r, t) => (r.position.z = t * 5 * DT), 180);
    // even the tick it sets off in: a few degrees at most
    for (let i = 1; i < a.length; i++) expect(Math.abs(a[i] - a[i - 1])).toBeLessThan(0.12);
  });

  it('hangs at rest again after a warp instead of whipping across the map', () => {
    const a = swing(SPEC, (r, t) => (r.position.x = t < 30 ? 0 : 500), 60);
    expect(a[30]).toBeLessThan(1e-6);
  });

  it('follows the pose it is told to rest in', () => {
    const lifted = swing({ ...SPEC, gravity: 0, rest: (v) => v.set(1, -1, 0) }, () => undefined, 200);
    expect(lifted[199]).toBeCloseTo(Math.PI / 4, 2);
  });

  it('is the same every run', () => {
    const run = () => swing(SPEC, (r, t) => r.position.set(Math.sin(t * 0.2), 0, t * 0.05), 200);
    expect(run()).toEqual(run());
  });

  it('moves every part of a body in one call', () => {
    const root = new THREE.Group(), a = new THREE.Object3D(), b = new THREE.Object3D();
    root.add(a, b);
    const s = new Secondary();
    s.add(a, SPEC);
    s.add(b, SPEC);
    expect(s.count).toBe(2);
    root.position.x = 0.3;
    s.update(root, DT);
    s.update(root, DT);
    expect(a.quaternion.equals(b.quaternion)).toBe(true);
  });
});

describe('carriage', () => {
  const still: Carriage = { speed: 0, yawRate: 0, look: null, tired: 0, ease: 1 };
  /** Runs the layer over a rig posed at rest each tick (as the clips would) and returns the joints' turn from rest. */
  const run = (steps: (t: number) => Carriage, ticks: number) => {
    const rig = buildRig(), m = new BodyMotion(rig), id = new THREE.Quaternion();
    const log: Record<string, number>[] = [];
    for (let t = 0; t < ticks; t++) {
      // as the mixer does: it leaves a joint alone while its clips hold it still (here: always)
      m.begin();
      m.update(DT, steps(t));
      log.push(Object.fromEntries(BONES.map((b) => [b, rig.bones[b].quaternion.angleTo(id)])));
    }
    return { rig, log };
  };

  it('leaves the legs, arms and hands to the clips', () => {
    const { log } = run((t) => ({ speed: 5, yawRate: Math.sin(t / 9) * 8, look: 0.8, tired: 0.7, ease: 1 }), 240);
    for (const row of log) for (const b of BONES) if (/^(arm|forearm|hand|thigh|shin|foot)/.test(b)) expect(row[b], b).toBe(0);
  });

  it('only breathes when standing still, and breathes harder when tired', () => {
    const fresh = run(() => still, 600).log, tired = run(() => ({ ...still, tired: 1 }), 600).log;
    const peak = (log: Record<string, number>[], b: string) => Math.max(...log.map((r) => r[b]));
    expect(peak(fresh, 'hips')).toBeLessThan(1e-6);
    expect(peak(fresh, 'chest')).toBeGreaterThan(0.01);
    expect(peak(fresh, 'chest')).toBeLessThan(0.03);
    expect(peak(tired, 'chest')).toBeGreaterThan(peak(fresh, 'chest') * 2);
  });

  it('leans into a turn at speed, to the side it turns to, and never far', () => {
    const left = run(() => ({ ...still, speed: 5, yawRate: 6 }), 90);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(left.rig.bones.hips.quaternion);
    expect(up.x).toBeGreaterThan(0.02); // the left is +x
    for (const r of left.log) expect(r.hips).toBeLessThan(0.09);
    expect(run(() => ({ ...still, speed: 0, yawRate: 20 }), 30).log[29].hips).toBeLessThan(1e-6);
  });

  it('pitches forward setting off and back stopping, then straightens', () => {
    const { log } = run((t) => ({ ...still, speed: t < 120 ? 5 : 0 }), 300);
    expect(Math.max(...log.slice(0, 30).map((r) => r.spine))).toBeGreaterThan(0.06);
    expect(log[119].spine).toBeLessThan(0.02);
    expect(Math.max(...log.slice(120, 150).map((r) => r.spine))).toBeGreaterThan(0.06);
    expect(log[299].spine).toBeLessThan(0.01);
  });

  it('turns the head to what it watches without snapping', () => {
    const { log } = run((t) => ({ ...still, look: t < 60 ? null : 1.2 }), 180);
    expect(log[59].neck).toBeLessThan(1e-6);
    expect(log[179].neck + log[179].head).toBeGreaterThan(0.5);
    for (let i = 1; i < log.length; i++) expect(Math.abs(log[i].head - log[i - 1].head)).toBeLessThan(0.05);
  });

  it('lays over whatever pose the clips give, and comes off again before they pose the next', () => {
    const rig = buildRig(), m = new BodyMotion(rig), pose = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);
    for (let t = 0; t < 300; t++) {
      m.begin();
      // the clips move the head only now and then
      if (t % 50 === 0) rig.bones.head.quaternion.copy(pose);
      m.update(DT, { ...still, look: 1 });
    }
    expect(rig.bones.head.quaternion.angleTo(pose)).toBeLessThan(0.5);
    m.begin();
    expect(rig.bones.head.quaternion.angleTo(pose)).toBeLessThan(1e-9);
  });

  it('fades out while a blow leads and is gone when the body has fallen', () => {
    const blow = run((t) => ({ speed: 5, yawRate: 6, look: 1, tired: 1, ease: t < 60 ? 1 : 0 }), 180).log;
    expect(blow[59].hips).toBeGreaterThan(0.03);
    expect(blow[179].hips).toBeLessThan(1e-4);
    expect(blow[179].head).toBeLessThan(1e-4);
  });
});

describe('feet on the ground', () => {
  const STRIDE = stride(SAMURAI_CLIPS.run);
  const LEG = ['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;
  /** Ankle height standing straight (see buildRig). */
  const GROUND = 0.04;
  const contactAt = (k: number, time: number) => STRIDE.contact[k][Math.floor(time * 60 + 1e-6) % STRIDE.contact[k].length];

  interface Tick {
    /** Ankles (world) and how much each foot of the clip bears weight. */
    feet: { at: THREE.Vector3; up: number; c: number }[];
    legs: THREE.Quaternion[];
    hips: number;
  }
  /**
   * The hero's stride as HeroActor plays it: idle or run per tick (`go`, m/s ahead), the clip
   * kept to the ground speed, the body turning at `yawRate` (rad/s) and sliding to its left at
   * `side` (m/s, as along a wall); with or without the feet laid on.
   */
  const walk = (go: (t: number) => number, ticks: number, plant: boolean, yawRate: (t: number) => number = () => 0, side = 0) => {
    const rig = buildRig(), anim = new Animator(rig.root, { idle: SAMURAI_CLIPS.idle, run: SAMURAI_CLIPS.run }), feet = new FootPlant(rig, STRIDE);
    anim.play('idle');
    let x = 0, z = 0, yaw = 0;
    const out: Tick[] = [];
    for (let t = 0; t < ticks; t++) {
      const v = go(t);
      anim.play(v > 0 ? 'run' : 'idle', 0.2);
      anim.speed('run', Math.min(2, Math.max(0.6, v / STRIDE.speed)));
      yaw += yawRate(t) * DT;
      x += (Math.sin(yaw) * v + Math.cos(yaw) * side) * DT;
      z += (Math.cos(yaw) * v - Math.sin(yaw) * side) * DT;
      feet.begin();
      anim.update(DT);
      rig.root.position.set(x, 0, z);
      rig.root.rotation.y = yaw;
      if (plant) feet.update(DT, anim.weight('run'), anim.time('run'));
      rig.root.updateMatrixWorld(true);
      out.push({
        feet: (['footL', 'footR'] as const).map((f, k) => ({
          at: rig.bones[f].getWorldPosition(new THREE.Vector3()),
          up: new THREE.Vector3(0, 1, 0).applyQuaternion(rig.bones[f].getWorldQuaternion(new THREE.Quaternion())).y,
          c: anim.weight('run') * contactAt(k, anim.time('run')),
        })),
        legs: LEG.map((b) => rig.bones[b].quaternion.clone()),
        hips: rig.bones.hips.position.y,
      });
    }
    return out;
  };
  /**
   * The largest turn of a thigh or shin from one tick to the next; the largest by which one
   * tick's turn stands out from the ticks either side (a twitch); the largest rise or fall of the hips.
   */
  const steps = (log: Tick[], from = 2) => {
    let leg = 0, twitch = 0, hips = 0;
    const turn = (i: number, j: number) => log[i].legs[j].angleTo(log[i - 1].legs[j]);
    for (let i = Math.max(2, from); i < log.length - 1; i++) {
      for (const j of [0, 1, 3, 4]) {
        leg = Math.max(leg, turn(i, j));
        twitch = Math.max(twitch, turn(i, j) - (turn(i - 1, j) + turn(i + 1, j)) / 2);
      }
      hips = Math.max(hips, Math.abs(log[i].hips - log[i - 1].hips));
    }
    return { leg, twitch, hips };
  };
  /** The same rotation, to rounding (angleTo is too coarse near zero for the mixer's single-precision values). */
  const same = (a: THREE.Quaternion, b: THREE.Quaternion) => Math.max(...a.toArray().map((v, i) => Math.abs(v - b.toArray()[i]))) < 1e-9;
  /** Over the ticks a foot fully bears weight: how far it slides a tick, and how high and how level it stands. */
  const stance = (log: Tick[], from = 60) => {
    let slide = 0, low = Infinity, high = -Infinity, level = 1, n = 0;
    for (let i = from; i < log.length; i++)
      for (let k = 0; k < 2; k++) {
        const f = log[i].feet[k], g = log[i - 1].feet[k];
        if (f.c < 0.99 || g.c < 0.99) continue;
        n++;
        slide = Math.max(slide, Math.hypot(f.at.x - g.at.x, f.at.z - g.at.z));
        low = Math.min(low, f.at.y);
        high = Math.max(high, f.at.y);
        level = Math.min(level, f.up);
      }
    return { slide, low, high, level, n };
  };

  it('learns from the stride clip the ground speed it fits and when each foot bears weight', () => {
    expect(STRIDE.speed).toBeGreaterThan(3.5);
    expect(STRIDE.speed).toBeLessThan(4.5);
    for (const c of STRIDE.contact) {
      expect(Math.max(...c)).toBeGreaterThan(0.99);
      const down = c.filter((v) => v > 0.5).length / c.length;
      expect(down).toBeGreaterThan(0.25);
      expect(down).toBeLessThan(0.5);
    }
    // a run: never both feet down at once
    for (let i = 0; i < STRIDE.contact[0].length; i++) expect(Math.min(STRIDE.contact[0][i], STRIDE.contact[1][i])).toBeLessThan(0.5);
  });

  it('holds a foot where it came down, flat on the ground, where the clip alone lets it slide and hover', () => {
    for (const v of [3, 5, 7.5]) {
      const clip = stance(walk(() => v, 240, false)), held = stance(walk(() => v, 240, true));
      expect(held.n).toBeGreaterThan(20);
      expect(clip.slide, `${v} m/s`).toBeGreaterThan(0.01);
      expect(held.slide, `${v} m/s`).toBeLessThan(0.002);
      expect(clip.low).toBeGreaterThan(GROUND + 0.03);
      expect(held.low).toBeGreaterThan(GROUND - 0.005);
      expect(held.high).toBeLessThan(GROUND + 0.012);
      expect(held.level).toBeGreaterThan(0.995);
    }
  });

  it('keeps the knee bent and moves no joint much faster than the clip does, nor in a twitch', () => {
    for (const v of [3, 5, 7.5]) {
      const log = walk(() => v, 240, true), clip = steps(walk(() => v, 240, false), 60), held = steps(log, 60);
      expect(held.leg, `${v} m/s`).toBeLessThan(clip.leg * 1.2);
      expect(held.twitch, `${v} m/s`).toBeLessThan(0.1);
      expect(held.hips, `${v} m/s`).toBeLessThan(0.02);
      for (let i = 60; i < log.length; i++)
        for (let k = 0; k < 2; k++) if (log[i].feet[k].c > 0.99) expect(log[i].legs[k * 3 + 1].angleTo(new THREE.Quaternion())).toBeGreaterThan(0.35);
    }
  });

  it('sets off, stops and turns without a jump, and is gone once the body stands', () => {
    const go = (t: number) => (t >= 30 && t < 150 ? 5 : 0), turn = (t: number) => (t >= 90 && t < 99 ? 20 : 0);
    const held = walk(go, 240, true, turn), clip = walk(go, 240, false, turn);
    expect(steps(held).leg).toBeLessThan(steps(clip).leg * 1.2);
    expect(steps(held).twitch).toBeLessThan(0.1);
    expect(steps(held).hips).toBeLessThan(0.02);
    // a second after stopping the run has faded out and the clips alone pose the legs
    for (let j = 0; j < LEG.length; j++) expect(same(held[239].legs[j], clip[239].legs[j])).toBe(true);
    expect(held[239].hips).toBeCloseTo(clip[239].hips, 6);
  });

  it('holds the feet only against the travel the stride covers: sliding sideways, they go with the body', () => {
    const log = walk(() => 4, 240, true, () => 0, 1.5);
    let n = 0;
    for (let i = 60; i < log.length; i++)
      for (let k = 0; k < 2; k++) {
        const f = log[i].feet[k], g = log[i - 1].feet[k];
        if (f.c < 0.99 || g.c < 0.99) continue;
        n++;
        expect(Math.abs(f.at.z - g.at.z)).toBeLessThan(0.002); // held against the stride
        expect(Math.abs(f.at.x - g.at.x - 1.5 * DT)).toBeLessThan(0.002); // carried along sideways, the leg not splayed
      }
    expect(n).toBeGreaterThan(20);
  });

  it('comes off again before the clips pose the next tick', () => {
    const rig = buildRig(), mixer = new THREE.AnimationMixer(rig.root), act = mixer.clipAction(SAMURAI_CLIPS.run).play(), feet = new FootPlant(rig, STRIDE);
    let posed: THREE.Quaternion[] = [], hips = 0;
    for (let t = 0; t < 30; t++) {
      feet.begin();
      mixer.update(DT);
      rig.root.position.z += 5 * DT;
      posed = LEG.map((b) => rig.bones[b].quaternion.clone());
      hips = rig.bones.hips.position.y;
      feet.update(DT, 1, act.time);
    }
    expect(rig.bones.hips.position.y).not.toBeCloseTo(hips, 4);
    feet.begin();
    LEG.forEach((b, j) => expect(same(rig.bones[b].quaternion, posed[j])).toBe(true));
    expect(rig.bones.hips.position.y).toBe(hips);
  });

  it('lets go of the ground when the body is put somewhere else', () => {
    const rig = buildRig(), mixer = new THREE.AnimationMixer(rig.root), act = mixer.clipAction(SAMURAI_CLIPS.run).play(), feet = new FootPlant(rig, STRIDE);
    const ankle = () => rig.root.worldToLocal(rig.bones.footL.getWorldPosition(new THREE.Vector3()));
    let clipAnkle = new THREE.Vector3();
    for (let t = 0; t < 60; t++) {
      feet.begin();
      mixer.update(DT);
      rig.root.position.z = t < 40 ? t * 0.08 : 500 + t * 0.08;
      rig.root.updateMatrixWorld(true);
      if (t === 40) clipAnkle = ankle();
      feet.update(DT, 1, act.time);
      // the tick it lands, the foot is where the clip has it, only pressed down and the hips let down
      if (t === 40) expect(Math.hypot(ankle().x - clipAnkle.x, ankle().z - clipAnkle.z)).toBeLessThan(0.02);
    }
  });
});
