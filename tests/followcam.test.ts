import { describe, expect, it } from 'vitest';
import { FollowCam } from '../src/engine/FollowCam';

const open = () => [];

describe('follow camera', () => {
  it('holds its heading while the hero runs toward it, and swings in behind one running away', () => {
    const cam = new FollowCam(), hero = { x: 0, z: 0 };
    cam.update(hero, 0, 0, false, null, open, true);
    for (let i = 0; i < 300; i++) {
      // the back key: controls are relative to the camera, so the hero heads straight at it
      const yaw = cam.yaw + Math.PI;
      hero.x += Math.sin(yaw) * 0.08;
      hero.z += Math.cos(yaw) * 0.08;
      cam.update(hero, yaw, 0, true, null, open, false);
    }
    expect(cam.yaw).toBe(0);
    for (let i = 0; i < 300; i++) cam.update(hero, 1, 0, true, null, open, false);
    expect(cam.yaw).toBeCloseTo(1, 1);
  });
});
