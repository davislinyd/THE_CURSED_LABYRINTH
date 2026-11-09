import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Animator } from '../src/actors/Animator';

const turn = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
/** A looping clip that holds one joint at an angle. */
const hold = (name: string, deg: number) =>
  new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack('j.quaternion', [0, 1], [...turn(deg).toArray(), ...turn(deg).toArray()])]);

describe('animator', () => {
  it('turns back a crossfade cut short from the pose it has reached, without a jump', () => {
    const root = new THREE.Object3D(), j = new THREE.Object3D();
    j.name = 'j';
    root.add(j);
    const anim = new Animator(root, { a: hold('a', 0), b: hold('b', 90) });
    const angle = () => (j.quaternion.angleTo(turn(0)) * 180) / Math.PI;
    anim.play('a');
    anim.update(1 / 60);
    anim.play('b', 0.2);
    for (let i = 0; i < 6; i++) anim.update(1 / 60);
    const half = angle();
    expect(half).toBeCloseTo(45, 0);
    anim.play('a', 0.2);
    anim.update(1 / 60);
    // one tick of the fade (90° over 12 ticks), not a leap back toward b
    expect(Math.abs(angle() - half)).toBeLessThan(8);
    for (let i = 0; i < 12; i++) anim.update(1 / 60);
    expect(angle()).toBeLessThan(0.5);
  });
});
