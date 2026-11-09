import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { BACK_STAND, HERO_PAL } from '../data/sprites/hero';
import { KING_IDLE } from '../data/sprites/bosses';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { t } from '../i18n';
import { drawControls } from '../ui/Controls';
import { MessageBox } from '../ui/Window';

const PAGES = [
  'THE LAND OF HAIYA WAS KEPT BY LAMPS. EVERY NIGHT THE SHRINE LAMPS BURNED, AND THE DEAD SLEPT.',
  'THEN MEIOU, KING OF THE DEAD, SPLIT THE EARTH. HE STOLE THE THREE SEALS AND GAVE THEM TO HIS DEMONS.',
  'THE LAMPS WENT OUT. THE OLD ROADS TWISTED INTO LABYRINTHS. THE DEAD BEGAN TO WALK.',
  'KAGEMARU, LAST OF THE LAMP WARDENS, DREW HIS BLADE AND WALKED INTO THE DARK.',
  'TAKE BACK THE MIRROR, THE JEWEL AND THE FLUTE. OPEN THE TEMPLE OF THE DEAD. RELIGHT THE LAMPS.',
];

export class IntroScene implements Scene {
  private page = 0;
  private frame = 0;
  private msg = new MessageBox(28, 3);

  constructor(private readonly game: Game) {
    this.msg.set(t(PAGES[0]));
  }

  enter(): void {
    this.game.music('DUNGEON');
  }

  update(): void {
    this.frame++;
    const g = this.game, inp = g.input;
    if (inp.pressed('start')) return this.done();
    if (this.page >= PAGES.length) {
      if (inp.pressed('a') || inp.pressed('b')) this.done();
      return;
    }
    if (this.msg.update(inp.held('a') || inp.held('b'))) g.sfx('text');
    if ((inp.pressed('a') || inp.pressed('b')) && !this.msg.advance()) {
      this.page++;
      if (this.page < PAGES.length) this.msg.set(t(PAGES[this.page]));
    }
  }

  private done(): void {
    this.game.sfx('confirm');
    this.game.toWorld();
  }

  draw(r: PixelRenderer): void {
    r.clear(C.BLACK);
    if (this.page >= PAGES.length) {
      drawControls(r, 12);
      if ((this.frame >> 4) & 1) r.textCenter(t('PRESS {A}'), 228, C.LGRAY);
      return;
    }
    const cx = 128, cy = 100;
    switch (this.page) {
      case 0:
      case 4: {
        // a row of shrine lamps (lit, or with three seals above)
        for (let i = 0; i < 5; i++) {
          const x = 40 + i * 44, lit = this.page === 4 || ((this.frame >> 3) + i) % 9 !== 0;
          r.rect(x - 1, 100, 3, 40, 0x00);
          r.rect(x - 7, 86, 14, 14, C.BLACK);
          r.frame(x - 7, 86, 14, 14, 0x00);
          r.rect(x - 5, 88, 10, 10, lit ? ((this.frame >> 2) + i) & 1 ? 0x27 : 0x28 : 0x07);
          r.rect(x - 9, 82, 18, 4, 0x00);
        }
        if (this.page === 4) ['◆', '◆', '◆'].forEach((d, i) => r.text(d, 100 + i * 24, 56, C.ORANGE));
        break;
      }
      case 1:
        r.silhouette(KING_IDLE, cx - (KING_IDLE.w >> 1), 150 - KING_IDLE.h, (this.frame >> 3) & 1 ? 0x06 : 0x16);
        for (let x = 0; x < 256; x++) if ((x * 13) % 7 < 2) r.vline(x, 150, 150 + ((x * 5) % 9), 0x16);
        break;
      case 2:
        // receding corridor lines
        for (let k = 0; k < 5; k++) {
          const w = 100 * Math.pow(0.6, k), h = 60 * Math.pow(0.6, k);
          r.frame(Math.round(cx - w), Math.round(cy - h), Math.round(w * 2), Math.round(h * 2), k < 2 ? 0x00 : 0x0c);
        }
        break;
      case 3:
        r.sprite(BACK_STAND, cx - 31, 158 - BACK_STAND.h + 10, HERO_PAL);
        break;
    }
    r.rect(0, 160, 256, 80, C.BLACK);
    this.msg.draw(r, 0, 176, 256, this.frame);
    r.textRight(t('{START}: SKIP'), 248, 226, C.GRAY);
  }
}
