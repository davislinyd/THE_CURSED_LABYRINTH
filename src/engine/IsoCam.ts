import * as THREE from 'three';
import type { P2 } from '../world/Grid3D';
import { SCREEN_H, VIEW } from './Renderer';

/** Ground direction the camera looks along: north-east, so map rows run down-right. */
export const ISO_YAW = (3 * Math.PI) / 4;
const PITCH = 0.64;
/** Metres of ground-plane height shown on screen. */
const VIEW_H = 12;
const DIST = 60;

/** Orthographic follow camera of the isometric areas, with screen <-> ground mapping. */
export class IsoCam {
  readonly camera: THREE.OrthographicCamera;
  /** Unit vector from the scene toward the camera. */
  readonly back = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private shakeT = 0;
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly v = new THREE.Vector3();

  constructor() {
    this.camera = new THREE.OrthographicCamera(-VIEW_H / 2, VIEW_H / 2, VIEW_H / 2, -VIEW_H / 2, 1, 160);
    this.fit();
    this.back.set(-Math.sin(ISO_YAW) * Math.cos(PITCH), Math.sin(PITCH), -Math.cos(ISO_YAW) * Math.cos(PITCH));
  }

  /** Match the frustum's width to the screen's. */
  private fit(): void {
    const w = (VIEW_H * VIEW.w) / SCREEN_H;
    if (this.camera.right * 2 === w) return;
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.updateProjectionMatrix();
  }

  shake(sec: number): void {
    this.shakeT = Math.max(this.shakeT, sec);
  }

  update(p: P2, snap: boolean): void {
    this.fit();
    const k = snap ? 1 : 0.12;
    this.at.x += (p.x - this.at.x) * k;
    this.at.z += (p.z - this.at.z) * k;
    this.at.y = 1;
    this.camera.position.copy(this.at).addScaledVector(this.back, DIST);
    if (this.shakeT > 0) {
      this.shakeT -= 1 / 60;
      const a = this.shakeT * 0.6;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(this.camera.position.x - this.back.x, this.camera.position.y - this.back.y, this.camera.position.z - this.back.z);
    this.camera.updateMatrixWorld();
  }

  /** Ground point under logical screen pixel (sx, sy). */
  groundAt(sx: number, sy: number): P2 | null {
    this.ray.setFromCamera(new THREE.Vector2(((sx + VIEW.ox) / VIEW.w) * 2 - 1, 1 - (sy / SCREEN_H) * 2), this.camera);
    const hit = this.ray.ray.intersectPlane(this.ground, this.v);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  /** Logical screen pixel of a world point. */
  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    this.v.set(x, y, z).project(this.camera);
    return { x: ((this.v.x + 1) / 2) * VIEW.w - VIEW.ox, y: ((1 - this.v.y) / 2) * SCREEN_H };
  }
}
