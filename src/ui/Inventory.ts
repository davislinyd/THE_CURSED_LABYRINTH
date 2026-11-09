import type { Game } from '../core/Game';
import { DIR_NAMES, ITEM_NAMES, ItemId, KEY_ITEM_INFO, KeyItemId, hasItem } from '../core/GameState';
import { Scene } from '../core/SceneManager';
import { DUNGEONS } from '../data/levels/dungeons';
import { wrapPx } from '../graphics/Font';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { isZh, t } from '../i18n';

const CONSUMABLES: ItemId[] = ['herb', 'elixir', 'talisman'];
const ITEM_DESC: Record<ItemId, string> = {
  herb: 'BITTER MOUNTAIN HERB. RESTORES 6 LIFE.',
  elixir: 'SHRINE ELIXIR. RESTORES ALL LIFE.',
  talisman: 'WARDING PAPER. THROWN WITH ↑+{B} IN BATTLE. PIERCES SPIRITS.',
};

/** SELECT (Shift) menu: choose the item for the B (Z) button, read key items, view the labyrinth map. */
export class Inventory implements Scene {
  private tab = 0;
  private cursor = 0;
  private frame = 0;

  constructor(private readonly game: Game) {
    this.cursor = Math.max(0, CONSUMABLES.indexOf(game.state.currentItem));
  }

  private get keys(): KeyItemId[] {
    return this.game.state.keyItems;
  }

  private get mapAvailable(): boolean {
    return this.game.state.location.mode === 'dungeon';
  }

  update(): void {
    this.frame++;
    const g = this.game, inp = g.input;
    if (inp.pressed('select') || inp.pressed('b') || inp.pressed('start')) {
      g.sfx('cancel');
      g.scenes.pop(this);
      return;
    }
    if (this.mapAvailable && (inp.pressed('left') || inp.pressed('right'))) {
      this.tab ^= 1;
      g.sfx('cursor');
      return;
    }
    if (this.tab !== 0) return;
    const n = CONSUMABLES.length + this.keys.length;
    if (inp.repeat('up')) {
      this.cursor = (this.cursor + n - 1) % n;
      g.sfx('cursor');
    } else if (inp.repeat('down')) {
      this.cursor = (this.cursor + 1) % n;
      g.sfx('cursor');
    } else if (inp.pressed('a') && this.cursor < CONSUMABLES.length) {
      g.state.currentItem = CONSUMABLES[this.cursor];
      g.sfx('confirm');
    }
  }

  draw(r: PixelRenderer): void {
    r.window(8, 36, 240, 196);
    r.text(t('ITEMS'), 32, 46, this.tab === 0 ? C.GOLD : C.GRAY);
    if (this.mapAvailable) r.text(t('MAP'), 112, 46, this.tab === 1 ? C.GOLD : C.GRAY);
    if (this.mapAvailable) r.text('←→', 200, 46, C.GRAY);
    r.hline(16, 239, 56, C.GRAY);
    if (this.tab === 0) this.drawItems(r);
    else this.drawMap(r);
  }

  private drawItems(r: PixelRenderer): void {
    const s = this.game.state;
    const blink = ((this.frame >> 3) & 3) !== 3;
    const zh = isZh();
    CONSUMABLES.forEach((id, i) => {
      const y = 64 + i * (zh ? 13 : 11);
      r.text(t(ITEM_NAMES[id]), 32, y, C.WHITE);
      r.text('×' + String(s.items[id]).padStart(2, '0'), 112, y, C.WHITE);
      if (s.currentItem === id) r.text(t('{B}'), 144, y, C.ORANGE);
      if (this.cursor === i && blink) r.text('▶', 20, y, C.RED);
    });
    const ty = zh ? 104 : 100, ky = zh ? 118 : 112;
    r.text(t('TREASURES'), 32, ty, C.LGRAY);
    if (this.keys.length === 0) r.text(t('NONE YET'), 32, ky, C.GRAY);
    this.keys.forEach((k, i) => {
      const col = i % 2, row = i >> 1;
      const x = 32 + col * 108, y = ky + row * (zh ? 12 : 10);
      r.text(t(KEY_ITEM_INFO[k].name), x, y, k === 'mirror' || k === 'jewel' || k === 'flute' ? C.ORANGE : C.WHITE);
      if (this.cursor === CONSUMABLES.length + i && blink) r.text('▶', x - 12, y, C.RED);
    });
    const desc = this.cursor < CONSUMABLES.length ? ITEM_DESC[CONSUMABLES[this.cursor]] : KEY_ITEM_INFO[this.keys[this.cursor - CONSUMABLES.length]].desc;
    r.hline(16, 239, 176, C.GRAY);
    wrapPx(t(desc), 216).slice(0, zh ? 3 : 4).forEach((line, i) => r.text(line, 20, 184 + i * (zh ? 13 : 10), C.LGRAY));
    if (this.cursor < CONSUMABLES.length) r.textRight(t('{A}: EQUIP'), 236, 217, C.GRAY);
  }

  private drawMap(r: PixelRenderer): void {
    const s = this.game.state;
    const loc = s.location;
    if (loc.mode !== 'dungeon') return;
    const def = DUNGEONS[loc.id];
    const known = hasItem(s, `map_${loc.id}` as KeyItemId);
    const h = def.map.length, w = def.map[0].length;
    const cell = Math.min(7, Math.floor(150 / Math.max(w, h)));
    const ox = 128 - Math.floor((w * cell) / 2), oy = 64;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const seen = s.visited[`${loc.id}:${x},${y}`];
        const ch = def.map[y][x];
        const px = ox + x * cell, py = oy + y * cell;
        if (ch === '#') {
          if (known || this.nearSeen(loc.id, x, y)) r.rect(px, py, cell, cell, 0x00);
          continue;
        }
        if (!seen && !known) continue;
        r.rect(px, py, cell, cell, seen ? 0x0c : 0x01);
        if (seen || known) {
          if (ch === 'X') r.rect(px + 1, py + 1, cell - 2, cell - 2, 0x2a);
          if (ch === 'K') r.rect(px + 1, py + 1, cell - 2, cell - 2, 0x16);
          if ('DLSBGgHh'.includes(ch)) r.rect(px + 2, py + 2, cell - 4, cell - 4, 0x27);
          if (ch === 'C' && !s.flags[`${loc.id}:chest:${x},${y}`]) r.rect(px + 2, py + 2, cell - 4, cell - 4, 0x28);
        }
      }
    }
    // the hero: a blinking arrow
    if ((this.frame >> 3) & 1) {
      const px = ox + loc.x * cell + (cell >> 1), py = oy + loc.y * cell + (cell >> 1);
      r.rect(px - 1, py - 1, 3, 3, C.WHITE);
      const dx = [0, 1, 0, -1][loc.dir], dy = [-1, 0, 1, 0][loc.dir];
      r.pset(px + dx * 2, py + dy * 2, C.RED);
    }
    r.textCenter(t(def.name), 64 + h * cell + 8, C.WHITE);
    const info = known ? t('FACING {0}', hasItem(s, 'compass') ? t(DIR_NAMES[loc.dir]) : '?') : t('NO MAP: ONLY WHAT YOU HAVE SEEN');
    r.textCenter(info, 217, C.GRAY);
  }

  private nearSeen(id: string, x: number, y: number): boolean {
    const v = this.game.state.visited;
    return !!(v[`${id}:${x + 1},${y}`] || v[`${id}:${x - 1},${y}`] || v[`${id}:${x},${y + 1}`] || v[`${id}:${x},${y - 1}`]);
  }
}
