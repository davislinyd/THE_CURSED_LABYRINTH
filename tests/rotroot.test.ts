import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ROTROOT_ATTACK, Rotroot } from '../src/actors/Rotroot';

const step = (b: Rotroot, ticks: number) => {
  for (let i = 0; i < ticks; i++) b.update(1 / 60);
  b.root.updateMatrixWorld(true);
};
const tip = (b: Rotroot, arm: number) => b.armPoint(arm, 9);

describe('rotroot', () => {
  it('rears an arm high before the slam, lands it on the ground in the blow, then withdraws', () => {
    const b = new Rotroot(new THREE.MeshBasicMaterial());
    const idle = new Rotroot(new THREE.MeshBasicMaterial());
    b.play('slam', 0);
    const [from, to] = ROTROOT_ATTACK.slam.active;
    step(b, from - 4);
    expect(tip(b, 0).y).toBeGreaterThan(3);
    step(b, to - from + 4);
    const down = tip(b, 0);
    expect(down.y).toBeLessThan(0.6);
    expect(Math.hypot(down.x, down.z)).toBeGreaterThan(2.5);
    expect(tip(b, 1).distanceTo(new THREE.Vector3())).toBeGreaterThan(1); // the other arms keep swaying
    step(b, ROTROOT_ATTACK.slam.len - to);
    step(idle, ROTROOT_ATTACK.slam.len);
    expect(tip(b, 0).distanceTo(tip(idle, 0))).toBeLessThan(0.05);
  });

  it('sweeps an arm low across the front during the blow', () => {
    const b = new Rotroot(new THREE.MeshBasicMaterial());
    b.play('sweep', 3);
    const [from, to] = ROTROOT_ATTACK.sweep.active;
    step(b, from);
    const start = tip(b, 3).clone();
    step(b, to - from);
    const end = tip(b, 3);
    expect(Math.max(start.y, end.y)).toBeLessThan(1.2);
    expect(Math.sign(start.x)).not.toBe(Math.sign(end.x));
  });
});
