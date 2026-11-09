import * as THREE from 'three';

/** Ghosts in the pool, ticks each lasts, and the body parts each copies. */
const POOL = 3;
const LIFE = 12;
const PARTS = 12;
/** A ghost shows once the body has moved off it (it would tint the body otherwise). */
const SHOW_AT = 2;

interface Ghost {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  age: number;
}

/**
 * The trace a dodge leaves: translucent indigo copies of the body's largest
 * parts, frozen where they were and fading out.
 */
export class Afterimages {
  readonly group = new THREE.Group();
  private readonly parts: THREE.Mesh[];
  private readonly ghosts: Ghost[] = [];

  constructor(private readonly body: THREE.Object3D) {
    body.updateMatrixWorld(true);
    const all: THREE.Mesh[] = [];
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) all.push(m);
    });
    const size = (m: THREE.Mesh) => {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const s = m.getWorldScale(new THREE.Vector3());
      return m.geometry.boundingSphere!.radius * Math.max(s.x, s.y, s.z);
    };
    this.parts = all.sort((a, b) => size(b) - size(a)).slice(0, PARTS);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a4cb0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const group = new THREE.Group();
      for (const p of this.parts) {
        const m = new THREE.Mesh(p.geometry, mat);
        m.matrixAutoUpdate = false;
        group.add(m);
      }
      group.visible = false;
      this.group.add(group);
      this.ghosts.push({ group, mat, age: LIFE });
    }
  }

  /** One tick: fade the ghosts; with `spawn`, leave a new one where the body is now. */
  tick(spawn: boolean): void {
    for (const g of this.ghosts) {
      g.age++;
      g.group.visible = g.age >= SHOW_AT && g.age < LIFE;
      g.mat.opacity = 0.35 * Math.max(0, 1 - g.age / LIFE);
    }
    if (!spawn) return;
    const g = this.ghosts.reduce((a, b) => (b.age > a.age ? b : a));
    this.body.updateMatrixWorld(true);
    g.group.children.forEach((m, i) => m.matrix.copy(this.parts[i].matrixWorld));
    g.age = 0;
    g.group.visible = false;
  }

  dispose(): void {
    for (const g of this.ghosts) g.mat.dispose();
  }
}
