import * as THREE from 'three';
import type { Rig } from './Rig';

/** What the body is doing this tick, as far as its carriage is concerned. */
export interface Carriage {
  /** Ground speed (m/s) and turn rate (rad/s, positive to the left). */
  speed: number;
  yawRate: number;
  /** Bearing of what the eyes are on, relative to the body's facing (rad, positive to the left); null: ahead. */
  look: number | null;
  /** 0 fresh .. 1 worn out. */
  tired: number;
  /** 1: standing, walking, guarding (the layer shows fully); less while a clip of a blow or a roll leads; 0: fallen. */
  ease: number;
}

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Move `from` toward `to` at `rate` per second (frame-rate independent smoothing). */
const follow = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

/**
 * The carriage of a body, laid over the joints after its clips have posed them: it leans
 * into a turn, pitches forward as it sets off and back as it stops, breathes (harder when
 * tired) and turns its head to what it watches. The clips, their timings and everything
 * the action logic reads are untouched.
 *
 * The mixer writes a joint only when its clips' value for it changed, so a turn added here
 * would pile up on a joint the clips hold still. Hence the two calls: `begin` puts back the
 * pose the clips left, the mixer runs, `update` notes that pose and lays the carriage over it.
 */
export class BodyMotion {
  private bank = 0;
  private pitch = 0;
  private look = 0;
  private weight = 1;
  private pace = 0;
  private clock = 0;
  /** The joints the layer turns, and the pose the clips last left each in. */
  private readonly joints: THREE.Object3D[];
  private readonly posed: THREE.Quaternion[];
  private laid = false;

  constructor(private readonly rig: Rig) {
    const b = rig.bones;
    this.joints = [b.hips, b.spine, b.chest, b.shoulderL, b.shoulderR, b.neck, b.head];
    this.posed = this.joints.map((j) => j.quaternion.clone());
  }

  /** Before the mixer runs: take the carriage off again, leaving the pose of the clips. */
  begin(): void {
    if (!this.laid) return;
    this.joints.forEach((j, i) => j.quaternion.copy(this.posed[i]));
    this.laid = false;
  }

  /** After the clips have posed the joints for this tick. */
  update(dt: number, c: Carriage): void {
    const b = this.rig.bones;
    this.joints.forEach((j, i) => this.posed[i].copy(j.quaternion));
    this.laid = true;
    this.clock += dt;
    this.weight = follow(this.weight, c.ease, 12, dt);
    const w = this.weight;
    // into a turn, more the faster it goes
    this.bank = follow(this.bank, clamp(-c.yawRate * c.speed * 0.011, -0.15, 0.15), 9, dt);
    // setting off and stopping: the speed the body has got used to trails the real one
    this.pace = follow(this.pace, c.speed, 4.5, dt);
    this.pitch = follow(this.pitch, clamp((c.speed - this.pace) * 0.034, -0.13, 0.15), 14, dt);
    this.look = follow(this.look, c.look === null ? 0 : clamp(c.look, -1, 1) * 0.72, 7, dt);
    const breath = Math.sin(this.clock * Math.PI * 2 * (0.24 + 0.5 * c.tired)), deep = 0.014 + 0.04 * c.tired;

    const turn = (bone: THREE.Object3D, axis: THREE.Vector3, angle: number) => bone.quaternion.multiply(_q.setFromAxisAngle(axis, angle * w));
    turn(b.hips, Z, this.bank * 0.5);
    turn(b.spine, Z, this.bank * 0.3);
    turn(b.spine, X, this.pitch);
    turn(b.chest, Z, this.bank * 0.2);
    turn(b.chest, X, -breath * deep);
    // the shoulders rise with the breath
    turn(b.shoulderL, Z, breath * deep * 1.3);
    turn(b.shoulderR, Z, -breath * deep * 1.3);
    // the head stays level through a lean, and leads the eyes
    turn(b.neck, Y, this.look * 0.45);
    turn(b.head, Y, this.look * 0.55);
    turn(b.head, Z, -this.bank * 0.7);
    turn(b.head, X, -this.pitch * 0.6 + breath * deep * 0.4);
  }
}
