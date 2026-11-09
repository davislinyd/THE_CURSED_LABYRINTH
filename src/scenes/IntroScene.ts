import type { Game } from '../core/Game';
import { Scene } from '../core/SceneManager';
import { t } from '../i18n';
import { wrapText } from '../ui/Text';
import { COL, UI } from '../ui/UI';

const PAGES = [
  'THE LAND OF HAIYA WAS KEPT BY LAMPS. EVERY NIGHT THE SHRINE LAMPS BURNED, AND THE DEAD SLEPT.',
  'THEN MEIOU, KING OF THE DEAD, SPLIT THE EARTH. HE STOLE THE THREE SEALS AND GAVE THEM TO HIS DEMONS.',
  'THE LAMPS WENT OUT. THE OLD ROADS TWISTED INTO LABYRINTHS. THE DEAD BEGAN TO WALK.',
  'KAGEMARU, LAST OF THE LAMP WARDENS, DREW HIS BLADE AND WALKED INTO THE DARK.',
  'TAKE BACK THE MIRROR, THE JEWEL AND THE FLUTE. OPEN THE TEMPLE OF THE DEAD. RELIGHT THE LAMPS.',
];
/** Ticks a page stays up once it has faded in. */
const HOLD = 300;
const FADE = 40;

/** The prologue: pages of the tale fading in and out over drifting embers. */
export class IntroScene implements Scene {
  private page = 0;
  /** Ticks into the current page; counts down from FADE while fading out. */
  private t = 0;
  private leaving = false;
  /** x is a share of the screen's width, which depends on the window. */
  private readonly embers = Array.from({ length: 56 }, () => ({ x: Math.random(), y: Math.random() * 448, v: 0.2 + Math.random() * 0.5, p: Math.random() * 6 }));

  constructor(private readonly game: Game) {}

  enter(): void {
    this.game.music('DUNGEON');
  }

  update(): void {
    const inp = this.game.input;
    for (const e of this.embers) {
      e.y -= e.v;
      e.x += Math.sin(e.p + e.y * 0.02) * 0.0005;
      if (e.y < -4) (e.y = 452), (e.x = Math.random());
    }
    // Enter is both START and CONFIRM on the keyboard: there it turns the page, and ESC skips.
    if (inp.pressed('cancel') || (inp.pressed('start') && !inp.pressed('confirm'))) return this.done();
    if (this.leaving) {
      if (--this.t <= 0) {
        this.leaving = false;
        if (++this.page >= PAGES.length) return this.done();
      }
      return;
    }
    this.t++;
    if (this.t > HOLD || (this.t > FADE && (inp.pressed('confirm') || inp.mouseLeft))) {
      this.leaving = true;
      this.t = FADE;
    }
  }

  private done(): void {
    if (this.page > PAGES.length) return;
    this.page = PAGES.length + 1;
    this.game.sfx('confirm');
    this.game.toWorld();
  }

  drawUI(ui: UI): void {
    const g = ui.ctx;
    const w = ui.right - ui.left;
    g.fillStyle = '#030204';
    g.fillRect(ui.left, 0, w, 448);
    for (const e of this.embers) {
      g.globalAlpha = 0.35 + 0.35 * Math.sin(e.p + e.y * 0.05);
      g.fillStyle = '#ff8a3a';
      g.fillRect(ui.left + e.x * w, e.y, 2, 2);
    }
    g.globalAlpha = 1;
    if (this.page < PAGES.length) {
      const a = this.leaving ? this.t / FADE : Math.min(1, this.t / FADE);
      const lines = wrapText(t(PAGES[this.page]), 440, (s) => ui.measure(s, 19));
      lines.forEach((l, i) => ui.text(l, 320, 214 - (lines.length - 1) * 16 + i * 32, { size: 19, align: 'center', color: COL.text, alpha: a }));
    }
    ui.text(t('{CANCEL}: SKIP'), ui.right - 20, 432, { size: 12, align: 'right', color: COL.gray });
  }
}
