import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { measure } from '../graphics/Font';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { t } from '../i18n';

/** Chapter / labyrinth title card shown in silence before an area begins. */
export class CardScene implements Scene {
  private t = 0;
  private done = false;

  constructor(private readonly game: Game, private readonly title: string, private readonly subtitle: string, private readonly onDone: () => void) {}

  enter(): void {
    this.game.audio.stopMusic();
    this.game.sfx('warp');
  }

  update(): void {
    this.t++;
    const inp = this.game.input;
    if (this.done) return;
    if (this.t > 150 || (this.t > 30 && (inp.pressed('a') || inp.pressed('start')))) {
      this.done = true;
      this.onDone();
    }
  }

  draw(r: PixelRenderer): void {
    r.clear(C.BLACK);
    // a single lamp flame
    const f = (this.t >> 2) & 1;
    r.rect(126, 78, 4, 8, f ? 0x27 : 0x28);
    r.rect(127, 74 + f, 2, 4, 0x38);
    r.rect(122, 86, 12, 3, 0x00);
    const sub = t(this.subtitle);
    r.textCenter(t(this.title), 108, C.LGRAY);
    r.textCenter(sub, 124, C.WHITE);
    const w = measure(sub) + 16;
    r.hline(128 - w / 2, 128 + w / 2, 136, 0x06);
  }
}
