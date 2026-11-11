import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BodyMotion, Carriage } from '../src/actors/BodyMotion';
import { BONES, buildRig } from '../src/actors/Rig';
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
