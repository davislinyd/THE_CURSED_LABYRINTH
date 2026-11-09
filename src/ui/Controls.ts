import type { Game } from '../core/Game';
import { KEY_LABELS } from '../core/InputManager';
import { Scene } from '../core/SceneManager';
import { t } from '../i18n';
import { COL, UI } from './UI';

/** [action, keyboard, gamepad]; keys are KEY_LABELS ids or literal text. '#' rows are section headers. */
const ROWS: [string, string, string][] = [
  ['#', 'KEYBOARD', 'GAMEPAD'],
  ['MOVE', 'WASD / ↑↓←→', 'MOVE'],
  ['RUN / WALK', 'RUN', 'RUN'],
  ['ATTACK', 'ATTACK', 'ATTACK'],
  ['STRONG ATTACK', 'STRONG', 'STRONG'],
  ['GUARD', 'GUARD', 'RB / RT'],
  ['DODGE', 'DODGE', 'DODGE'],
  ['EXAMINE / TALK', 'ACT', 'ACT'],
  ['USE ITEM', 'ITEM', 'ITEM'],
  ['LOCK ON', 'LOCK', 'LOCK'],
  ['MINIMAP (LABYRINTH)', 'MAP', 'MAP'],
  ['ITEMS', 'SELECT', 'SELECT'],
  ['PAUSE', 'ENTER / ESC', 'START'],
  ['CONFIRM / CANCEL', 'ENTER / ESC', 'A / B'],
  ['FULLSCREEN', 'F', '—'],
];

const label = (dev: 'kb' | 'pad', k: string) => KEY_LABELS[dev][k] ?? k;

/** Controls table for keyboard and gamepad, opened from the title or pause menu. */
export class ControlsScreen implements Scene {
  constructor(private readonly game: Game) {}

  update(): void {
    const inp = this.game.input;
    if (inp.pressed('cancel') || inp.pressed('confirm') || inp.pressed('start') || inp.mouseLeft || inp.mouseRight) {
      this.game.sfx('cancel');
      this.game.scenes.pop(this);
    }
  }

  drawUI(ui: UI): void {
    ui.panel(40, 10, 560, 424);
    ui.text(t('CONTROLS'), 320, 50, { size: 22, weight: 700, align: 'center', color: COL.goldLight, spacing: 3 });
    const pitch = 16;
    ROWS.forEach(([act, kb, pad], i) => {
      const y = 86 + i * pitch + (i > 0 ? 5 : 0);
      if (act === '#') {
        ui.text(t(kb), 330, y, { size: 13, weight: 700, color: COL.gold });
        ui.text(t(pad), 470, y, { size: 13, weight: 700, color: COL.gold });
        ui.line(70, y + 7, 570, y + 7, COL.goldDim);
        return;
      }
      ui.text(t(act), 74, y, { size: 15 });
      ui.text(label('kb', kb), 330, y, { size: 15, color: COL.goldLight });
      ui.text(label('pad', pad), 470, y, { size: 15, color: COL.goldLight });
    });
    const my = 86 + ROWS.length * pitch + 14;
    const line = (key: string, y: number) => ui.text(t(key), 300, y, { size: 13, color: COL.goldLight });
    ui.text(t('MOUSE · FIELD'), 74, my, { size: 15 });
    line('LEFT: MOVE · ATTACK · TALK', my);
    line('RIGHT: STRONG · WHEEL: ITEM', my + 16);
    ui.text(t('MOUSE · LABYRINTH'), 74, my + 38, { size: 15 });
    line('MOVE MOUSE: LOOK · LEFT: ATTACK', my + 38);
    line('RIGHT: STRONG · MIDDLE: LOCK', my + 54);
    line('WHEEL: ITEM / TARGET', my + 70);
    ui.text(t('{CANCEL}: BACK'), 320, 423, { size: 13, align: 'center', color: COL.gray });
  }
}
