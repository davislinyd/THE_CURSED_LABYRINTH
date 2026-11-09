import type { Game } from '../core/Game';
import { ITEM_NAMES } from '../core/GameState';
import { Scene } from '../core/SceneManager';
import { TOWNS, Town } from '../data/levels/world';
import { ELDER, ELDER_PAL } from '../data/sprites/npc';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { drawHUD } from '../ui/HUD';
import { drawMenu, MessageBox } from '../ui/Window';
import { isZh, t } from '../i18n';

type Mode = 'menu' | 'shop' | 'message';

/** Village interior: talk, buy, rest at the inn (restores life and records progress). */
export class TownScene implements Scene {
  readonly playTime = true;
  private readonly town: Town;
  private mode: Mode = 'message';
  private cursor = 0;
  private shopCursor = 0;
  private talkIdx = 0;
  private msg = new MessageBox(28, 3);
  private frame = 0;

  constructor(private readonly game: Game, key: string, private readonly x: number, private readonly y: number) {
    this.town = TOWNS[key];
    this.msg.set(t('WELCOME TO {0}, TRAVELLER. THE LAMPS STILL BURN HERE.', t(this.town.name)));
  }

  private get items(): string[] {
    return [t('TALK'), t('SHOP'), t('INN  {0}G', this.town.inn), t('LEAVE')];
  }

  private say(text: string): void {
    this.msg.set(text);
    this.mode = 'message';
  }

  update(): void {
    this.frame++;
    const g = this.game, inp = g.input, s = g.state;
    if (this.mode === 'message') {
      if (this.msg.update(inp.held('a') || inp.held('b'))) g.sfx('text');
      if ((inp.pressed('a') || inp.pressed('b') || inp.pressed('start')) && !this.msg.advance()) this.mode = 'menu';
      return;
    }
    if (this.mode === 'menu') {
      if (inp.repeat('up')) {
        this.cursor = (this.cursor + 3) % 4;
        g.sfx('cursor');
      } else if (inp.repeat('down')) {
        this.cursor = (this.cursor + 1) % 4;
        g.sfx('cursor');
      } else if (inp.pressed('b')) {
        this.cursor = 3;
        g.sfx('cancel');
      } else if (inp.pressed('a') || inp.pressed('start')) {
        g.sfx('confirm');
        switch (this.cursor) {
          case 0:
            this.say(t(this.town.talk[this.talkIdx++ % this.town.talk.length]));
            break;
          case 1:
            this.mode = 'shop';
            this.shopCursor = 0;
            break;
          case 2:
            if (s.gold < this.town.inn) {
              g.sfx('locked');
              this.say(t('INNKEEPER: YOU HAVE NOT THE COIN, FRIEND.'));
            } else {
              s.gold -= this.town.inn;
              s.life = s.maxLife;
              s.location = { mode: 'world', x: this.x, y: this.y };
              s.checkpoint = { ...s.location };
              g.saveGame();
              g.sfx('heal');
              this.say(t('YOU SLEEP BENEATH A WARM LAMP. LIFE RESTORED. YOUR JOURNEY IS RECORDED.'));
            }
            break;
          case 3:
            g.sfx('door');
            g.toWorld(this.x, this.y);
            break;
        }
      }
      return;
    }
    // shop
    const list = this.town.shop;
    const n = list.length + 1;
    if (inp.repeat('up')) {
      this.shopCursor = (this.shopCursor + n - 1) % n;
      g.sfx('cursor');
    } else if (inp.repeat('down')) {
      this.shopCursor = (this.shopCursor + 1) % n;
      g.sfx('cursor');
    } else if (inp.pressed('b') || ((inp.pressed('a') || inp.pressed('start')) && this.shopCursor === list.length)) {
      g.sfx('cancel');
      this.mode = 'menu';
    } else if (inp.pressed('a') || inp.pressed('start')) {
      const it = list[this.shopCursor];
      if (s.gold < it.price) g.sfx('locked');
      else if (s.items[it.item] >= 99) g.sfx('locked');
      else {
        s.gold -= it.price;
        s.items[it.item] = Math.min(99, s.items[it.item] + it.n);
        g.sfx('coin');
      }
    }
  }

  draw(r: PixelRenderer): void {
    const s = this.game.state;
    r.clear(C.BLACK);
    drawHUD(r, s, { area: isZh() ? t(this.town.name) : this.town.name.split(' ')[0] });
    // interior: plank wall, paper window, lantern and counter
    r.rect(8, 40, 240, 100, 0x07);
    for (let y = 44; y < 140; y += 8) r.hline(8, 247, y, 0x08);
    for (let x = 24; x < 248; x += 40) r.vline(x, 40, 139, 0x08);
    r.rect(160, 52, 64, 40, 0x37);
    r.frame(160, 52, 64, 40, C.BLACK);
    r.vline(192, 52, 91, C.BLACK);
    r.hline(160, 223, 72, C.BLACK);
    const glow = (this.frame >> 4) & 1 ? 0x27 : 0x28;
    r.rect(40, 56, 12, 18, glow);
    r.frame(40, 56, 12, 18, C.BLACK);
    r.hline(40, 51, 64, 0x16);
    r.vline(46, 46, 55, C.BLACK);
    r.sprite(ELDER, 112, 130 - ELDER.h, ELDER_PAL);
    r.rect(8, 124, 240, 16, 0x17);
    r.hline(8, 247, 124, 0x27);
    r.hline(8, 247, 139, C.BLACK);
    r.textCenter(t(this.town.name), 148, C.GOLD);

    if (this.mode === 'shop') {
      r.window(16, 160, 224, 76);
      const pitch = isZh() ? 13 : 12;
      this.town.shop.forEach((it, i) => {
        const name = `${t(ITEM_NAMES[it.item])}${it.n > 1 ? ' ×' + it.n : ''}`;
        r.text(name, 40, 170 + i * pitch, s.gold >= it.price ? C.WHITE : C.GRAY);
        r.text(`${it.price}G`.padStart(4, ' '), 184, 170 + i * pitch, C.GOLD);
      });
      r.text(t('DONE'), 40, 170 + this.town.shop.length * pitch, C.WHITE);
      if ((this.frame >> 3) & 3) r.text('▶', 28, 170 + this.shopCursor * pitch, C.RED);
      const it = this.town.shop[this.shopCursor];
      if (it) r.textRight(t('OWN ×{0}', String(s.items[it.item]).padStart(2, '0')), 232, 218, C.LGRAY);
    } else if (this.mode === 'menu') {
      r.window(64, 160, 128, 64);
      drawMenu(r, this.items, 80, 170, this.cursor, this.frame);
    } else this.msg.draw(r, 0, 172, 256, this.frame);
  }
}
