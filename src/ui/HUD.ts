import { GameState, ITEM_NAMES, MAX_WEAPON_LEVEL, SEALS, WEAPON_EXP, weaponLevel } from '../core/GameState';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { isZh, t } from '../i18n';

export interface HudOptions {
  area?: string;
  boss?: { name: string; hp: number; max: number };
  keys?: number;
}

function bar(r: PixelRenderer, x: number, y: number, value: number, max: number, full: number, empty: number, pip = 3): void {
  for (let i = 0; i < max; i++) {
    const px = x + i * (pip + 1);
    r.rect(px, y, pip, 6, i < value ? full : empty);
    if (i < value) r.rect(px, y, pip, 1, C.WHITE === full ? C.WHITE : 0x36);
  }
}

function expBar(r: PixelRenderer, s: GameState, x: number, y: number, w: number): number {
  const lv = weaponLevel(s.weaponExp);
  const lo = WEAPON_EXP[lv - 1], hi = lv < MAX_WEAPON_LEVEL ? WEAPON_EXP[lv] : lo + 1;
  const pct = lv >= MAX_WEAPON_LEVEL ? 1 : (s.weaponExp - lo) / (hi - lo);
  r.rect(x, y, w, 4, 0x0c);
  r.rect(x, y, Math.round(w * pct), 4, 0x2c);
  return lv;
}

function seals(r: PixelRenderer, s: GameState, x: number, y: number): void {
  SEALS.forEach((k, i) => r.text(s.keyItems.includes(k) ? '◆' : '◇', x + i * 8, y, s.keyItems.includes(k) ? C.ORANGE : C.GRAY));
}

/**
 * Chinese glyphs are 13px tall, so the same 32px panel holds two rows:
 *   體力 ▮▮▮▮▮▮   area / item in boss fights        G0000
 *   劍8 ▬▬  藥草×02  鑰0  封印◆◇◇   (boss: name + life bar)
 */
function drawHudZh(r: PixelRenderer, s: GameState, o: HudOptions): void {
  r.text(t('LIFE'), 8, 6, C.WHITE);
  bar(r, 36, 7, s.life, s.maxLife, C.RED, 0x07);
  r.text('G' + String(Math.min(9999, s.gold)).padStart(4, '0'), 208, 6, C.GOLD);
  r.text(t('SWORD'), 8, 21, C.LGRAY);
  r.text(String(expBar(r, s, 32, 23, 24)), 20, 21, C.WHITE);
  const item = t(ITEM_NAMES[s.currentItem]) + '×' + String(s.items[s.currentItem]).padStart(2, '0');
  if (o.boss) {
    r.text(item, 140, 6, C.LGRAY);
    r.text(t(o.boss.name), 64, 21, C.PINK);
    bar(r, 116, 22, Math.ceil((o.boss.hp / o.boss.max) * 30), 30, 0x26, 0x07, 3);
    return;
  }
  if (o.area) r.text(o.area, 140, 6, C.BONE);
  r.text(item, 64, 21, C.LGRAY);
  if (o.keys !== undefined) r.text(t('KEY') + o.keys, 120, 21, C.ORANGE);
  r.text(t('SEAL'), 156, 21, C.LGRAY);
  seals(r, s, 180, 21);
}

/** Three-row status panel across the top of the screen (y 0..31). */
export function drawHUD(r: PixelRenderer, s: GameState, o: HudOptions = {}): void {
  r.rect(0, 0, 256, 33, C.BLACK);
  if (isZh()) return drawHudZh(r, s, o);
  r.text('LIFE', 8, 6, C.WHITE);
  bar(r, 42, 7, s.life, s.maxLife, C.RED, 0x07);
  const gold = String(Math.min(9999, s.gold)).padStart(4, '0');
  r.text('G' + gold, 208, 6, C.GOLD);

  r.text('SWORD', 8, 16, C.LGRAY);
  // Experience toward the next level.
  r.text(String(expBar(r, s, 60, 18, 32)), 50, 16, C.WHITE);
  const n = s.items[s.currentItem];
  r.text(ITEM_NAMES[s.currentItem], 104, 16, C.LGRAY);
  r.text('×' + String(n).padStart(2, '0'), 176, 16, C.WHITE);
  if (o.keys !== undefined) r.text('KEY' + o.keys, 208, 16, C.ORANGE);

  r.text('SEAL', 8, 26, C.LGRAY);
  seals(r, s, 42, 26);
  if (o.boss) {
    r.text(o.boss.name.slice(0, 7), 74, 26, C.PINK);
    bar(r, 132, 27, Math.ceil((o.boss.hp / o.boss.max) * 30), 30, 0x26, 0x07, 3);
  } else if (o.area) {
    r.textRight(o.area, 248, 26, C.BONE);
  }
}
