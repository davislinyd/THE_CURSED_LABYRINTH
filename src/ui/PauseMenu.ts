import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { t } from '../i18n';
import { ControlsScreen } from './Controls';
import { OptionsMenu } from './Options';
import { YesNo } from './YesNo';
import { COL, MenuOpts, UI, menuMouse } from './UI';

const ITEMS = ['RESUME', 'OPTIONS', 'CONTROLS', 'QUIT TO TITLE'];
const MENU: MenuOpts = { align: 'center', width: 180, pitch: 30, size: 17 };

/** START menu. Music is paused while it is open. */
export class PauseMenu implements Scene {
  private cursor = 0;
  private confirm: YesNo | null = null;

  constructor(private readonly game: Game) {}

  update(): void {
    const g = this.game, inp = g.input;
    if (this.confirm) {
      const r = this.confirm.update(g);
      if (r === 'yes') g.toTitle();
      else if (r === 'no') this.confirm = null;
      return;
    }
    if (inp.pressed('cancel') || inp.pressed('start') || inp.mouseRight) return this.close();
    const m = menuMouse(inp, ITEMS.length, 320, 204, MENU);
    if (m.hover >= 0 && m.hover !== this.cursor) {
      this.cursor = m.hover;
      g.sfx('cursor');
    }
    if (inp.repeat('up')) {
      this.cursor = (this.cursor + ITEMS.length - 1) % ITEMS.length;
      g.sfx('cursor');
    } else if (inp.repeat('down')) {
      this.cursor = (this.cursor + 1) % ITEMS.length;
      g.sfx('cursor');
    } else if (inp.pressed('confirm') || m.click >= 0) {
      if (m.click >= 0) this.cursor = m.click;
      g.sfx('confirm');
      if (this.cursor === 0) this.close();
      else if (this.cursor === 1) g.scenes.push(new OptionsMenu(g, true));
      else if (this.cursor === 2) g.scenes.push(new ControlsScreen(g));
      else this.confirm = new YesNo(t('QUIT TO TITLE? UNSAVED PROGRESS IS LOST.'), 1, COL.red);
    }
  }

  private close(): void {
    this.game.sfx('cancel');
    this.game.audio.resumeMusic();
    this.game.scenes.pop(this);
  }

  drawUI(ui: UI): void {
    ui.veil(0.45);
    ui.panel(220, 120, 200, 200);
    ui.text(t('PAUSE'), 320, 156, { size: 22, weight: 700, align: 'center', color: COL.goldLight, spacing: 4 });
    ui.line(250, 168, 390, 168, COL.goldDim);
    ui.menu(ITEMS.map((m) => t(m)), 320, 204, this.cursor, MENU);
    this.confirm?.draw(ui);
  }
}
