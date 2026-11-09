import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { t } from '../i18n';

const ROWS = ['LANGUAGE', 'BGM VOLUME', 'SFX VOLUME', 'SOUND', 'SCANLINES', 'FLICKER', 'PIXEL ASPECT', 'TOUCH PAD', 'BACK'];

/** Options overlay, opened from the title screen or the pause menu. */
export class OptionsMenu implements Scene {
  private cursor = 0;
  private frame = 0;

  constructor(private readonly game: Game) {}

  update(): void {
    this.frame++;
    const g = this.game, inp = g.input, st = g.settings;
    if (inp.repeat('up')) {
      this.cursor = (this.cursor + ROWS.length - 1) % ROWS.length;
      g.sfx('cursor');
    } else if (inp.repeat('down')) {
      this.cursor = (this.cursor + 1) % ROWS.length;
      g.sfx('cursor');
    }
    const d = inp.repeat('right', 16, 6) ? 1 : inp.repeat('left', 16, 6) ? -1 : 0;
    const confirm = inp.pressed('a') || inp.pressed('start');
    if (inp.pressed('b') || (confirm && this.cursor === ROWS.length - 1)) {
      g.sfx('cancel');
      g.scenes.pop(this);
      return;
    }
    const step = d || (confirm ? 1 : 0);
    if (!step) return;
    switch (this.cursor) {
      case 0:
        st.lang = st.lang === 'zh' ? 'en' : 'zh';
        break;
      case 1:
        st.bgmVolume = Math.max(0, Math.min(10, st.bgmVolume + (d || 0)));
        break;
      case 2:
        st.sfxVolume = Math.max(0, Math.min(10, st.sfxVolume + (d || 0)));
        break;
      case 3:
        st.muted = !st.muted;
        break;
      case 4:
        st.scanlines = (((st.scanlines + step + 3) % 3) as 0 | 1 | 2);
        break;
      case 5:
        st.flicker = !st.flicker;
        break;
      case 6:
        st.aspect = st.aspect ? 0 : 1;
        break;
      case 7:
        st.touchPad = !st.touchPad;
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
      case 1:
        return '◆'.repeat(st.bgmVolume).padEnd(10, '·');
      case 2:
        return '◆'.repeat(st.sfxVolume).padEnd(10, '·');
      case 3:
        return t(st.muted ? 'OFF' : 'ON');
      case 4:
        return t(['OFF', 'LIGHT', 'MEDIUM'][st.scanlines]);
      case 5:
        return t(st.flicker ? 'ON' : 'OFF');
      case 6:
        return st.aspect ? '8:7' : '1:1';
      case 7:
        return t(st.touchPad ? 'ON' : 'OFF');
    }
    return '';
  }

  draw(r: PixelRenderer): void {
    r.window(16, 28, 224, 184);
    r.textCenter(t('OPTIONS'), 40, C.GOLD);
    ROWS.forEach((label, i) => {
      const y = 60 + i * 14;
      r.text(t(label), 40, y, i === this.cursor ? C.WHITE : C.LGRAY);
      r.text(this.value(i), 152, y, i === this.cursor ? C.ORANGE : C.GRAY);
      if (i === this.cursor && ((this.frame >> 3) & 3) !== 3) r.text('▶', 28, y, C.RED);
    });
    r.textCenter(t('←→ CHANGE   {B}: BACK'), 194, C.GRAY);
  }
}
