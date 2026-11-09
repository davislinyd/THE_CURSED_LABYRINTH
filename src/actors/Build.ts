import * as THREE from 'three';

/** Helpers for rigid-part models. */
export const cyl = (rt: number, rb: number, h: number, seg = 12, open = false, t0 = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl);

/** Add a shadow-casting mesh to `parent` at a position and rotation (radians). */
export function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/**
 * A weapon mount in a right hand: the weapon's +Z leaves the fist 60 degrees from
 * the forearm line toward the thumb, angled inward, so a blade points
 * 60 - (arm + forearm + hand pitch) degrees from straight down.
 */
export function swordGrip(hand: THREE.Object3D): THREE.Object3D {
  const grip = new THREE.Object3D();
  grip.position.set(0, -0.06, 0.01);
  grip.rotation.set(30 * (Math.PI / 180), 25 * (Math.PI / 180), 0, 'YXZ');
  hand.add(grip);
  return grip;
}
