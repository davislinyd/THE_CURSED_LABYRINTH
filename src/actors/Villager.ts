import * as THREE from 'three';
import type { Villager } from '../data/levels/iso';
import { cyl, part } from './Build';

type Look = Villager['look'];

const ROBE: Record<Look, number> = { elder: 0x4a4440, girl: 0x8a2a3a, smith: 0x2e323c, merchant: 0x23345a, keeper: 0x5a4a2c };
const SKIN = 0xd2a888;

/** A villager in kimono: a still figure that breathes, looks about and turns to face the hero. */
export class VillagerModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly phase = Math.random() * 10;

  constructor(look: Look) {
    const robe = new THREE.MeshStandardMaterial({ color: ROBE[look], roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 });
    const hair = new THREE.MeshStandardMaterial({ color: look === 'elder' ? 0xc8c4bc : 0x15110e, roughness: 0.8 });
    const b = this.body, h = this.head;
    this.root.add(b);
    const stoop = look === 'elder' ? 0.18 : 0;
    part(b, cyl(0.17, 0.3, 1.1, 10), robe, 0, 0.55);
    part(b, cyl(0.2, 0.21, 0.14, 10), look === 'girl' ? new THREE.MeshStandardMaterial({ color: 0xd8b860, roughness: 0.6 }) : dark, 0, 0.98);
    const chest = new THREE.Group();
    chest.position.y = 1.05;
    chest.rotation.x = stoop;
    b.add(chest);
    part(chest, cyl(0.19, 0.2, 0.36, 10), robe, 0, 0.18);
    for (const s of [1, -1]) {
      part(chest, new THREE.BoxGeometry(0.13, 0.5, 0.2), robe, s * 0.25, 0.1, 0.02, 0.15, 0, s * 0.12);
      part(chest, new THREE.SphereGeometry(0.05, 6, 4), skin, s * 0.28, -0.17, 0.08);
    }
    if (look === 'smith' || look === 'merchant') part(b, new THREE.BoxGeometry(0.36, 0.7, 0.04), new THREE.MeshStandardMaterial({ color: look === 'smith' ? 0x4a3020 : 0x1a1a22, roughness: 0.9 }), 0, 0.62, 0.24);
    h.position.y = 0.42;
    chest.add(h);
    part(h, cyl(0.05, 0.06, 0.1, 6), skin, 0, -0.04);
    part(h, new THREE.SphereGeometry(0.12, 10, 8), skin, 0, 0.1);
    part(h, new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.12, -0.012);
    if (look === 'girl') part(h, new THREE.SphereGeometry(0.07, 8, 6), hair, 0, 0.2, -0.1);
    if (look === 'smith') part(h, cyl(0.128, 0.128, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0xe0dcd0 }), 0, 0.15);
    if (look === 'keeper') part(h, cyl(0.06, 0.07, 0.08, 8), hair, 0, 0.23, -0.04);
    if (look === 'elder') {
      part(b, cyl(0.018, 0.022, 1.45, 6), dark, 0.32, 0.72, 0.14, 0, 0, -0.06);
      part(h, new THREE.ConeGeometry(0.05, 0.16, 6), hair, 0, -0.06, 0.1, Math.PI, 0, 0);
    }
  }

  /** `face`: yaw toward the hero when near, or null to keep looking about. */
  update(time: number, face: number | null): void {
    const t = time + this.phase;
    this.body.scale.y = 1 + Math.sin(t * 1.6) * 0.01;
    if (face !== null) {
      const d = Math.atan2(Math.sin(face - this.root.rotation.y), Math.cos(face - this.root.rotation.y));
      this.root.rotation.y += d * 0.08;
      this.head.rotation.y *= 0.9;
    } else this.head.rotation.y = Math.sin(t * 0.4) * 0.5;
  }
}
