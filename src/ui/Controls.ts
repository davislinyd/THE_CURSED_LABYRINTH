import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { isZh, t } from '../i18n';

/** Key / action table; '#' rows are section headers. Keys use the real keyboard names. */
const ROWS: [string, string][] = [
  ['#', 'SIDE VIEW'],
  ['←→', 'MOVE'],
  ['{A}', 'JUMP'],
  ['{B}', 'SLASH'],
  ['↑+{B}', 'USE ITEM'],
  ['#', 'LABYRINTH'],
  ['↑↓', 'FORWARD / BACK'],
  ['←→', 'TURN'],
  ['{A}', 'EXAMINE · STRIKE'],
  ['{B}', 'USE ITEM'],
  ['#', 'ANYWHERE'],
  ['{A} / {B}', 'CONFIRM / CANCEL'],
  ['{START}', 'PAUSE MENU'],
  ['{SELECT}', 'ITEMS · MAP'],
  ['F', 'FULLSCREEN'],
];

/** The controls table, shared by the intro and the CONTROLS screen. */
export function drawControls(r: PixelRenderer, top: number): void {
  r.textCenter(t('CONTROLS'), top, C.GOLD);
  const pitch = isZh() ? 13 : 12;
  ROWS.forEach(([k, v], i) => {
    const y = top + 18 + i * pitch;
    if (k === '#') r.text(t(v), 20, y, C.GOLD);
    else {
      r.text(t(k), 32, y, C.ORANGE);
      r.text(t(v), 92, y, C.WHITE);
    }
  });
}

/** CONTROLS overlay, opened from the title menu or the pause menu. */
export class ControlsScreen implements Scene {
  constructor(private readonly game: Game) {}

  update(): void {
    const inp = this.game.input;
    if (inp.pressed('a') || inp.pressed('b') || inp.pressed('start') || inp.pressed('select')) {
      this.game.sfx('cancel');
      this.game.scenes.pop(this);
    }
  }

  draw(r: PixelRenderer): void {
    r.window(8, 4, 240, 232);
    drawControls(r, 14);
  }
}
