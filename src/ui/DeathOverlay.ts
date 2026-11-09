import type { Game } from '../core/Game';
import { t } from '../i18n';
import { COL, UI, menuMouse } from './UI';

/** "You have fallen": continue (full life, half gold) or quit, after a slow fade. */
export class DeathOverlay {
  private t = 0;
  private cursor = 0;

  constructor(private readonly game: Game) {}

  update(): void {
    const g = this.game, inp = g.input;
    this.t++;
    if (this.t < 90) return;
    const canContinue = g.continuesLeft > 0;
    const m = canContinue ? menuMouse(inp, 2, 320, 250, { align: 'center' }) : { hover: -1, click: inp.mouseLeft ? 0 : -1 };
    if (m.hover >= 0 && m.hover !== this.cursor) {
      this.cursor = m.hover;
      g.sfx('cursor');
    }
    if (canContinue && (inp.pressed('up') || inp.pressed('down'))) {
      this.cursor ^= 1;
      g.sfx('cursor');
    }
    if (inp.pressed('confirm') || m.click >= 0) {
      if (m.click >= 0 && canContinue) this.cursor = m.click;
      g.sfx('confirm');
      if (canContinue && this.cursor === 0) g.continueAfterDeath();
      else g.toTitle();
    }
  }

  draw(ui: UI): void {
    ui.veil(Math.min(1, this.t / 60) * 0.7);
    if (this.t < 30) return;
    const g = this.game;
    ui.text(t('YOU HAVE FALLEN'), 320, 180, { size: 30, weight: 700, color: COL.red, align: 'center', spacing: 4, alpha: Math.min(1, (this.t - 30) / 40) });
    if (this.t < 90) return;
    if (g.continuesLeft > 0) {
      ui.menu([t('CONTINUE {0}', g.continuesLeft), t('QUIT TO TITLE')], 320, 250, this.cursor, { align: 'center' });
      ui.text(t('CONTINUE: FULL LIFE, HALF GOLD'), 320, 330, { size: 12, color: COL.gray, align: 'center' });
    } else {
      ui.text(t('NO CONTINUES REMAIN.'), 320, 250, { size: 15, color: COL.gray, align: 'center' });
      ui.text(t('GAME OVER'), 320, 290, { size: 22, weight: 700, color: COL.goldLight, align: 'center' });
    }
  }
}
