import { FOG_BLOCK } from '../world/IsoFog';
import { IsoGrid, SUB } from '../world/IsoMap';
import { MiniPose, miniFrame } from './Hud';
import type { UI } from './UI';

/** Minimap tints by map letter, a faded print; anything else (roads, props on them) reads as road. */
const TILE: Record<string, string> = {
  '.': '#3b4430', r: '#6b2a22', '#': '#55514b', T: '#1d3021', '~': '#2a3d5c',
  '=': '#7a5a38', '+': '#68645c', f: '#5c4630', H: '#33251f',
};
const ROAD = '#a08c64';
/** A spirit barrier still standing. */
const MIST = '#5c3a70';
/** Pixels per tile of the prepared image. */
const PX = 2;
/** Minimap pixels per metre. */
const SCALE = 1.8;

export interface MapIcon {
  x: number;
  z: number;
  color: string;
  /** Radius in minimap pixels. */
  r: number;
}

/**
 * Minimap of an isometric area: the tiles are painted once into an image, masked by
 * the fog of war (with soft edges) whenever more is seen, and drawn turned like the view.
 */
export class IsoMinimap {
  private readonly tiles = document.createElement('canvas');
  private readonly fog = document.createElement('canvas');
  private readonly seen = document.createElement('canvas');
  private dirty = true;

  /** `known` tells which fog blocks were seen on earlier visits. */
  constructor(private readonly grid: IsoGrid, known: (bx: number, by: number) => boolean) {
    this.tiles.width = this.seen.width = grid.w * PX;
    this.tiles.height = this.seen.height = grid.h * PX;
    this.fog.width = Math.ceil(grid.w / FOG_BLOCK);
    this.fog.height = Math.ceil(grid.h / FOG_BLOCK);
    const blocks: [number, number][] = [];
    for (let y = 0; y < this.fog.height; y++) for (let x = 0; x < this.fog.width; x++) if (known(x, y)) blocks.push([x, y]);
    this.reveal(blocks);
    this.paint();
  }

  /** Paint the tiles (again after a barrier lifts). */
  paint(): void {
    const g = this.tiles.getContext('2d')!, grid = this.grid;
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const ch = grid.ch(x, y);
        g.fillStyle = 'abc'.includes(ch) ? (grid.blocked(x, y) ? MIST : ROAD) : TILE[ch] ?? ROAD;
        g.fillRect(x * PX, y * PX, PX, PX);
      }
    }
    this.dirty = true;
  }

  /** Fog blocks just seen (see liftFog). */
  reveal(blocks: [number, number][]): void {
    if (!blocks.length) return;
    const g = this.fog.getContext('2d')!;
    g.fillStyle = '#fff';
    for (const [x, y] of blocks) g.fillRect(x, y, 1, 1);
    this.dirty = true;
  }

  /** `full` lifts the fog (test cheat); icons stand only where the fog has lifted. */
  draw(ui: UI, pose: MiniPose, icons: MapIcon[], full: boolean, isSeen: (x: number, z: number) => boolean): void {
    if (this.dirty && !full) {
      this.dirty = false;
      const g = this.seen.getContext('2d')!;
      g.globalCompositeOperation = 'copy';
      g.drawImage(this.tiles, 0, 0);
      // the fog mask, one pixel per block, smoothly scaled up for soft edges
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(this.fog, 0, 0, this.fog.width * FOG_BLOCK * PX, this.fog.height * FOG_BLOCK * PX);
      g.globalCompositeOperation = 'source-over';
    }
    miniFrame(ui, pose, SCALE, () => {
      const g = ui.ctx;
      g.drawImage(full ? this.tiles : this.seen, 0, 0, this.grid.w * SUB, this.grid.h * SUB);
      g.lineWidth = 1 / SCALE;
      g.strokeStyle = '#140d08';
      for (const ic of icons) {
        if (!full && !isSeen(ic.x, ic.z)) continue;
        g.fillStyle = ic.color;
        g.beginPath();
        g.arc(ic.x, ic.z, ic.r / SCALE, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    });
  }
}
