import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Interp } from '../src/engine/Interp';

/** Heading of an object's +Z, as the game measures yaw. */
const yawOf = (o: THREE.Object3D) => {
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
  return Math.atan2(f.x, f.z);
};

describe('interp', () => {
  it('leaves the logic its own angles, so setting one of them keeps the heading', () => {
    const o = new THREE.Object3D(), interp = new Interp();
    // facing away from +Z, where the quaternion reads back as (π, π − yaw, π)
    for (let tick = 0; tick < 4; tick++) {
      interp.begin([o]);
      o.rotation.y = 2.5;
      expect(yawOf(o)).toBeCloseTo(2.5, 6);
      interp.end([o]);
      interp.apply([o], 0.5);
      interp.restore([o]);
    }
  });
});
