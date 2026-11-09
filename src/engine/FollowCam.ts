import * as THREE from 'three';
import { P2, SolidFn, clearance } from '../world/Grid3D';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The camera orbits this point above the hero's feet. */
const PIVOT_Y = 1.5;
/** Orbit radius and elevation at rest: 5.4 m behind and 2.7 m up. */
const ORBIT = Math.hypot(5.4, 2.7 - PIVOT_Y);
const ELEVATION = Math.atan2(2.7 - PIVOT_Y, 5.4);
/** Tilt range around the resting elevation (radians): a little below, up to a steep look down. */
const PITCH_MIN = -0.32;
const PITCH_MAX = 0.73;
/** Ticks the camera leaves the view alone after the player turned it. */
const MANUAL_HOLD = 120;
/** Field of view (degrees), and the share of a zoom punch kept each tick. */
const FOV = 55;
const PUNCH_KEEP = 0.8;

/**
 * Third-person camera behind the hero. The mouse or right stick turns and tilts
 * it; otherwise it swings behind the hero while they run forward or back. It
 * frames a locked target, and pulls in when a wall is between.
 */
export class FollowCam {
  readonly camera = new THREE.PerspectiveCamera(FOV, 640 / 448, 0.1, 90);
  yaw = 0;
  /** Tilt added to the resting elevation (positive looks down from higher). */
  pitch = 0;
  /** Highest the camera may go (below a cave roof). */
  maxY = 4.1;
  private manual = 0;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private ready = false;
  private shakeT = 0;
  private kick = 0;

  /** Mouse / right stick: turn (dx) and tilt (dy) the view, in radians; auto-follow waits a while after. */
  addLook(dx: number, dy: number): void {
    if (!dx && !dy) return;
    this.yaw -= dx;
    this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch + dy));
    this.manual = MANUAL_HOLD;
  }

  /** Jolt the view (hits, slams). */
  shake(seconds: number): void {
    this.shakeT = Math.max(this.shakeT, seconds);
  }

  /** Zoom in for an instant (degrees of field of view) as a blow lands. */
  punch(deg: number): void {
    this.kick = Math.max(this.kick, deg);
  }

  update(hero: P2, heroYaw: number, steerX: number, moving: boolean, target: P2 | null, solid: SolidFn, snap: boolean): void {
    if (target) this.yaw += wrap(Math.atan2(target.x - hero.x, target.z - hero.z) - this.yaw) * 0.12;
    else if (snap) this.yaw = heroYaw;
    else if (this.manual > 0) this.manual--;
    else if (moving && Math.abs(steerX) < 0.45) this.yaw += wrap(heroYaw - this.yaw) * 0.02;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // orbit at the tilted elevation, closer in where the roof would be in the way
    const e = ELEVATION + this.pitch;
    const r = Math.sin(e) > 0 ? Math.min(ORBIT, (this.maxY - PIVOT_Y) / Math.sin(e)) : ORBIT;
    const hd = r * Math.cos(e), up = PIVOT_Y + r * Math.sin(e);
    const want = { x: hero.x - fx * hd, z: hero.z - fz * hd };
    const k = clearance(hero, want, solid, 0.15);
    const d = k < 1 ? Math.max(1.1, hd * k - 0.35) : hd;
    // boxed in by rock behind: climb over the shoulder instead of crowding the back
    const y = Math.max(0.5, Math.min(this.maxY, up + (1 - d / hd) * 1.1));
    const nx = hero.x - fx * d, nz = hero.z - fz * d;
    if (!this.ready || snap) this.pos.set(nx, y, nz);
    else this.pos.lerp(new THREE.Vector3(nx, y, nz), k < 1 ? 0.5 : 0.2);
    // aim a little ahead so the hero sits low in the frame
    this.look.set(hero.x + fx * 1.2, 1.25, hero.z + fz * 1.2);
    if (target) this.look.lerp(new THREE.Vector3(target.x, 1.2, target.z), 0.25);
    this.ready = true;
    this.camera.position.copy(this.pos);
    if (this.shakeT > 0) {
      this.shakeT -= 1 / 60;
      const a = Math.min(1, this.shakeT * 4) * 0.08;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(this.look);
    if (this.kick > 0 || this.camera.fov !== FOV) {
      this.kick = this.kick > 0.05 ? this.kick * PUNCH_KEEP : 0;
      this.camera.fov = FOV - this.kick;
      this.camera.updateProjectionMatrix();
    }
  }
}
