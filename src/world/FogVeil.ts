import * as THREE from 'three';
import { FOG_BLOCK } from './IsoFog';
import { SUB } from './IsoMap';

/** Ticks a block takes to clear once it is seen. */
const CLEAR = 40;

/**
 * The fog of war of an isometric area as the mask of the ink mist (InkPass): one texel
 * per fog block, white where seen. A block seen just now clears over CLEAR ticks.
 */
export class FogVeil {
  readonly texture: THREE.DataTexture;
  /** Metres the mask spans along x and z. */
  readonly size: THREE.Vector2;
  private readonly data: Uint8Array;
  private readonly clearing = new Set<number>();

  /** `known` tells which blocks were seen on earlier visits; they start clear. */
  constructor(private readonly w: number, h: number, known: (bx: number, by: number) => boolean) {
    this.data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (known(x, y)) this.data[(y * w + x) * 4] = 255;
    this.texture = new THREE.DataTexture(this.data, w, h);
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.size = new THREE.Vector2(w * FOG_BLOCK * SUB, h * FOG_BLOCK * SUB);
  }

  /** Blocks just seen (see liftFog). */
  reveal(blocks: [number, number][]): void {
    for (const [x, y] of blocks) this.clearing.add(y * this.w + x);
  }

  tick(): void {
    if (!this.clearing.size) return;
    for (const i of this.clearing) {
      this.data[i * 4] = Math.min(255, this.data[i * 4] + Math.ceil(255 / CLEAR));
      if (this.data[i * 4] === 255) this.clearing.delete(i);
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
