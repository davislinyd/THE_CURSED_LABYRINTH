import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { HERO, HERO_PAL } from '../data/sprites/hero';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { drawMenu } from '../ui/Window';
import { t } from '../i18n';

export class GameOverScene implements Scene {
  private frame = 0;
  private cursor = 0;
  private busy = false;

  constructor(private readonly game: Game) {}

  enter(): void {
    this.game.music('GAMEOVER');
  }

  private get canContinue(): boolean {
    return this.game.continuesLeft > 0;
  }

  update(): void {
    this.frame++;
    if (this.frame < 60 || this.busy) return;
    const g = this.game, inp = g.input;
    if (this.canContinue && (inp.repeat('up') || inp.repeat('down'))) {
      this.cursor ^= 1;
      g.sfx('cursor');
    }
    if (inp.pressed('a') || inp.pressed('start')) {
      this.busy = true;
      g.sfx('confirm');
      if (this.canContinue && this.cursor === 0) g.continueAfterDeath();
      else g.toTitle();
    }
  }

  draw(r: PixelRenderer): void {
    r.clear(C.BLACK);
    const fade = Math.min(1, this.frame / 60);
    r.sprite(HERO.dead, 128 - (HERO.dead.w >> 1), 128 - HERO.dead.h, HERO_PAL);
    r.hline(72, 184, 128, 0x06);
    if (fade >= 1) r.textCenter(t('GAME OVER'), 64, C.RED);
    if (this.frame < 60) return;
    if (this.canContinue) {
      r.window(64, 140, 128, 44);
      drawMenu(r, [t('CONTINUE {0}', this.game.continuesLeft), t('TITLE')], 80, 150, this.cursor, this.frame, 14);
      r.textCenter(t('CONTINUE: FULL LIFE, HALF GOLD'), 200, C.GRAY);
    } else {
      r.textCenter(t('NO CONTINUES REMAIN.'), 150, C.LGRAY);
      r.textCenter(t('LOAD YOUR RECORD FROM TITLE.'), 166, C.GRAY);
      if ((this.frame >> 4) & 1) r.textCenter(t('PRESS {START}'), 196, C.WHITE);
    }
  }
}
