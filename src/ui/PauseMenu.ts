import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { t } from '../i18n';
import { ControlsScreen } from './Controls';
import { Inventory } from './Inventory';
import { OptionsMenu } from './Options';
import { drawMenu } from './Window';

const ITEMS = ['RESUME', 'ITEMS', 'OPTIONS', 'CONTROLS', 'QUIT TO TITLE'];

/** START menu. Music is paused while it is open. */
export class PauseMenu implements Scene {
  private cursor = 0;
  private frame = 0;
  private confirm = false;
  private closing = false;

  constructor(private readonly game: Game) {}

  exit(): void {
    if (!this.closing) this.game.audio.resumeMusic();
  }

  update(): void {
    this.frame++;
    const g = this.game, inp = g.input;
    if (this.confirm) {
      if (inp.pressed('a')) {
        this.closing = true;
        g.sfx('confirm');
        g.toTitle();
      } else if (inp.pressed('b') || inp.pressed('start')) {
        this.confirm = false;
        g.sfx('cancel');
      }
      return;
    }
    if (inp.pressed('start') || inp.pressed('b')) {
      g.sfx('pause');
      g.scenes.pop(this);
      return;
    }
    if (inp.repeat('up')) {
      this.cursor = (this.cursor + ITEMS.length - 1) % ITEMS.length;
      g.sfx('cursor');
    } else if (inp.repeat('down')) {
      this.cursor = (this.cursor + 1) % ITEMS.length;
      g.sfx('cursor');
    } else if (inp.pressed('a')) {
      g.sfx('confirm');
      if (this.cursor === 0) g.scenes.pop(this);
      else if (this.cursor === 1) g.scenes.push(new Inventory(g));
      else if (this.cursor === 2) g.scenes.push(new OptionsMenu(g));
      else if (this.cursor === 3) g.scenes.push(new ControlsScreen(g));
      else this.confirm = true;
    }
  }

  draw(r: PixelRenderer): void {
    if (this.closing) return;
    r.window(56, 64, 144, 104);
    r.textCenter(t('PAUSE'), 76, C.GOLD);
    drawMenu(r, ITEMS.map((m) => t(m)), 76, 94, this.cursor, this.frame, 13);
    if (this.confirm) {
      r.window(24, 120, 208, 44, C.RED);
      r.textCenter(t('UNSAVED PROGRESS IS LOST.'), 130, C.WHITE);
      r.textCenter(t('{A}: QUIT    {B}: STAY'), 146, C.ORANGE);
    }
  }
}
