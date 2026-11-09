import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { LOGO } from '../data/sprites/logo';
import { BACK_STAND, HERO_PAL } from '../data/sprites/hero';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { SaveManager } from '../persistence/SaveManager';
import { t } from '../i18n';
import { ControlsScreen } from '../ui/Controls';
import { OptionsMenu } from '../ui/Options';
import { drawMenu } from '../ui/Window';

const MENU = ['NEW GAME', 'CONTINUE', 'OPTIONS', 'CONTROLS'];

export class TitleScene implements Scene {
  private frame = 0;
  private menu = false;
  private cursor = 0;
  private confirmNew = false;
  private readonly hasSave = SaveManager.hasSave();
  private wisps = Array.from({ length: 6 }, (_, i) => ({ x: 20 + i * 41, y: 240 - ((i * 53) % 90), s: 0.3 + (i % 3) * 0.15 }));

  constructor(private readonly game: Game) {
    if (this.hasSave) this.cursor = 1;
  }

  enter(): void {
    this.game.music('TITLE');
  }

  update(): void {
    this.frame++;
    for (const w of this.wisps) {
      w.y -= w.s;
      if (w.y < 90) w.y = 236;
    }
    const g = this.game, inp = g.input;
    if (!this.menu) {
      if (inp.pressed('start') || inp.pressed('a')) {
        this.menu = true;
        g.sfx('confirm');
      }
      return;
    }
    if (this.confirmNew) {
      if (inp.pressed('a')) {
        g.sfx('confirm');
        g.newGame();
      } else if (inp.pressed('b')) {
        this.confirmNew = false;
        g.sfx('cancel');
      }
      return;
    }
    if (inp.repeat('up')) {
      this.cursor = (this.cursor + MENU.length - 1) % MENU.length;
      g.sfx('cursor');
    } else if (inp.repeat('down')) {
      this.cursor = (this.cursor + 1) % MENU.length;
      g.sfx('cursor');
    } else if (inp.pressed('a') || inp.pressed('start')) {
      if (this.cursor === 0) {
        if (this.hasSave) {
          this.confirmNew = true;
          g.sfx('cursor');
        } else {
          g.sfx('confirm');
          g.newGame();
        }
      } else if (this.cursor === 1) {
        if (this.hasSave && g.continueGame()) g.sfx('confirm');
        else g.sfx('locked');
      } else {
        g.sfx('confirm');
        g.scenes.push(this.cursor === 2 ? new OptionsMenu(g) : new ControlsScreen(g));
      }
    }
  }

  draw(r: PixelRenderer): void {
    r.clear(C.BLACK);
    // stars
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + 13) % 256, y = (i * 61 + 7) % 150;
      if ((i + (this.frame >> 5)) % 7) r.pset(x, y, i % 4 ? 0x00 : 0x10);
    }
    // moon with drifting cloud bands
    const mx = 196, my = 92;
    for (let y = -24; y <= 24; y++)
      for (let x = -24; x <= 24; x++) if (x * x + y * y <= 576) r.pset(mx + x, my + y, x * x + y * y > 500 ? 0x27 : (x + 6) * (x + 6) + (y - 4) * (y - 4) < 120 ? 0x37 : 0x38);
    for (let i = 0; i < 3; i++) {
      const cx = ((this.frame >> 1) + i * 120) % 360 - 60, cy = 80 + i * 9;
      r.rect(cx, cy, 70 - i * 10, 3, 0x0c);
      r.rect(cx + 8, cy + 3, 46, 2, 0x0c);
    }
    // distant temple roof on the ridge
    const ridge = (x: number) => 186 + Math.round(Math.sin(x * 0.03) * 6 + Math.sin(x * 0.11) * 3);
    for (let x = 0; x < 256; x++) r.vline(x, ridge(x), 239, 0x01);
    // pagoda of the dead, black against the moonlit ridge
    r.rect(150, 176, 36, 14, 0x01);
    r.rect(144, 172, 48, 4, 0x01);
    r.rect(154, 164, 28, 8, 0x01);
    r.rect(148, 161, 40, 3, 0x01);
    r.rect(160, 154, 16, 7, 0x01);
    r.rect(166, 146, 4, 8, 0x01);
    r.pset(162, 168, (this.frame >> 3) & 1 ? 0x27 : 0x16);
    for (let x = 0; x < 256; x++) r.vline(x, 214 + ((x * 7) % 5 === 0 ? -1 : 0), 239, C.BLACK);
    // ghost lights rising
    for (const w of this.wisps) r.pset(Math.round(w.x + Math.sin(w.y * 0.1) * 3), Math.round(w.y), (this.frame >> 2) & 1 ? 0x21 : 0x31);
    // the samurai on the cliff, seen from behind
    r.sprite(BACK_STAND, 8, 240 - BACK_STAND.h + 22, HERO_PAL);
    // logo
    const lx = 128 - (LOGO.length * 38 - 4) / 2;
    LOGO.forEach((g, i) => {
      const x = lx + i * 38, y = 20 + (i & 1);
      r.silhouette(g, x + 2, y + 2, 0x06);
      r.sprite(g, x, y, [C.BLACK, 0x16, 0x27]);
    });
    r.textCenter('THE CURSED LABYRINTH', 62, C.BONE);
    if (!this.menu) {
      if ((this.frame >> 4) & 1) r.textCenter(t('PRESS {START}'), 132, C.WHITE);
    } else {
      r.window(92, 106, 112, 72);
      drawMenu(r, MENU.map((m) => t(m)), 104, 117, this.cursor, this.frame, 13, [false, !this.hasSave, false, false]);
    }
    if (this.confirmNew) {
      r.window(32, 120, 192, 44, C.RED);
      r.textCenter(t('ERASE THE SAVED JOURNEY?'), 130, C.WHITE);
      r.textCenter(t('{A}: YES    {B}: NO'), 146, C.ORANGE);
    }
    r.textRight(t('ORIGINAL WORK 2026'), 248, 228, C.GRAY);
  }
}
