import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { RESOLUTIONS } from '../engine/Renderer';
import { t } from '../i18n';
import { COL, UI, inRect } from './UI';

const ROWS = ['LANGUAGE', 'BGM VOLUME', 'SFX VOLUME', 'SOUND', 'RENDER SCALE', 'EFFECTS', 'CRT FILTER', 'MINIMAP', 'BACK'];
const RES = RESOLUTIONS;
const rowY = (i: number) => 122 + i * 30;
/** Volume gauges: x range of the bar, so a click there sets the level. */
const GAUGE = { x: 330, w: 150 };
/** The ◀ ▶ buttons beside a value. */
const ARROW_L = 316, ARROW_R = 516;

export class OptionsMenu implements Scene {
  private cursor = 0;

  constructor(private readonly game: Game) {}

  update(): void {
    const g = this.game, inp = g.input;
    const close = () => {
      g.sfx('cancel');
      g.scenes.pop(this);
    };
    if (inp.pressed('cancel') || inp.pressed('start') || inp.mouseRight || (this.cursor === ROWS.length - 1 && inp.pressed('confirm'))) return close();
    const over = ROWS.findIndex((_, i) => inRect(inp.mouse, 130, rowY(i) - 20, 400, 30));
    if (over >= 0 && inp.mouseMoved && over !== this.cursor) {
      this.cursor = over;
      g.sfx('cursor');
    }
    if (over >= 0 && inp.wheel && over < ROWS.length - 1) {
      this.cursor = over;
      this.change(-inp.wheel);
      return;
    }
    if (over >= 0 && inp.mouseLeft) {
      this.cursor = over;
      if (over === ROWS.length - 1) return close();
      const x = inp.mouse!.x;
      if ((over === 1 || over === 2) && x >= GAUGE.x - 4 && x <= GAUGE.x + GAUGE.w + 4) this.setVolume(over, Math.round(((x - GAUGE.x) / GAUGE.w) * 10));
      else if (x < ARROW_L + 10 && x > ARROW_L - 14) this.change(-1);
      else if (x > 320) this.change(1);
      return;
    }
    if (inp.repeat('up')) {
      this.cursor = (this.cursor + ROWS.length - 1) % ROWS.length;
      g.sfx('cursor');
    } else if (inp.repeat('down')) {
      this.cursor = (this.cursor + 1) % ROWS.length;
      g.sfx('cursor');
    } else if (inp.repeat('left', 14, 4)) this.change(-1);
    else if (inp.repeat('right', 14, 4) || inp.pressed('confirm')) this.change(1);
  }

  private setVolume(row: number, v: number): void {
    const st = this.game.settings;
    v = Math.max(0, Math.min(10, v));
    if (row === 1) st.bgmVolume = v;
    else st.sfxVolume = v;
    this.game.applySettings();
    this.game.sfx(row === 2 ? 'coin' : 'cursor');
  }

  private change(d: number): void {
    const g = this.game, st = g.settings;
    switch (this.cursor) {
      case 0:
        st.lang = st.lang === 'zh' ? 'en' : 'zh';
        break;
      case 1:
        st.bgmVolume = Math.max(0, Math.min(10, st.bgmVolume + d));
        break;
      case 2:
        st.sfxVolume = Math.max(0, Math.min(10, st.sfxVolume + d));
        break;
      case 3:
        st.muted = !st.muted;
        break;
      case 4:
        st.resolution = RES[(RES.indexOf(st.resolution) + d + RES.length) % RES.length];
        break;
      case 5:
        st.effects = st.effects === 'high' ? 'low' : 'high';
        break;
      case 6:
        st.crt = !st.crt;
        break;
      case 7:
        st.minimap = !st.minimap;
        break;
    }
    g.applySettings();
    g.sfx(this.cursor === 2 ? 'coin' : 'cursor');
  }

  private value(i: number): string {
    const st = this.game.settings;
    switch (i) {
      case 0:
        return st.lang === 'zh' ? '繁體中文' : 'ENGLISH';
      case 3:
        return t(st.muted ? 'OFF' : 'ON');
      case 4:
        return st.resolution === 'auto' ? t('AUTO') : `${st.resolution}%`;
      case 5:
        return t(st.effects === 'high' ? 'HIGH' : 'LOW');
      case 6:
        return t(st.crt ? 'ON' : 'OFF');
      case 7:
        return t(st.minimap ? 'ON' : 'OFF');
    }
    return '';
  }

  drawUI(ui: UI): void {
    const st = this.game.settings;
    ui.panel(110, 40, 420, 370);
    ui.text(t('OPTIONS'), 320, 76, { size: 22, weight: 700, align: 'center', color: COL.goldLight, spacing: 3 });
    ui.line(170, 88, 470, 88, COL.goldDim);
    ROWS.forEach((label, i) => {
      const y = rowY(i);
      const sel = i === this.cursor;
      if (sel) ui.diamond(140, y - 6, 4.5, COL.goldLight);
      ui.text(t(label), 156, y, { size: 16, color: sel ? COL.goldLight : COL.text });
      if (i === 1 || i === 2) {
        const v = i === 1 ? st.bgmVolume : st.sfxVolume;
        ui.gauge(GAUGE.x, y - 11, GAUGE.w, 9, v / 10, '#8e6a2a', '#f1dc9f');
        ui.text(String(v), 496, y, { size: 14, color: COL.gray });
      } else ui.text(this.value(i), 330, y, { size: 16, color: sel ? COL.text : COL.gray });
      if (sel && i < ROWS.length - 1) {
        this.arrow(ui, ARROW_L, y - 6, -1);
        this.arrow(ui, ARROW_R, y - 6, 1);
      }
    });
    ui.text(t('←→ CHANGE   {CANCEL}: BACK'), 320, 396, { size: 13, align: 'center', color: COL.gray });
  }

  /** A small ◀ / ▶ button (drawn, so it needs no font glyph). */
  private arrow(ui: UI, x: number, y: number, dir: -1 | 1): void {
    const g = ui.ctx;
    g.fillStyle = COL.gold;
    g.beginPath();
    g.moveTo(x + dir * 5, y);
    g.lineTo(x - dir * 4, y - 5);
    g.lineTo(x - dir * 4, y + 5);
    g.closePath();
    g.fill();
  }
}
