import type { Game } from '../core/Game';
import { t } from '../i18n';
import { COL, MenuOpts, UI, rowAt } from './UI';

const OPT: MenuOpts = { width: 120, align: 'center' };
const X = [250, 390];
const Y = 376;
const LINE = 22;

/** A yes / no question box for keyboard, pad or mouse. `cursor` 0 is YES, 1 is NO. */
export class YesNo {
  constructor(readonly text: string, public cursor = 0, private readonly accent = COL.gold) {}

  /** One tick of input: 'yes', 'no' (also for cancel), or null while undecided. */
  update(g: Game): 'yes' | 'no' | null {
    const inp = g.input;
    const over = X.findIndex((x) => rowAt(inp.mouse, 1, x, Y, OPT) === 0);
    if (over >= 0 && inp.mouseMoved && over !== this.cursor) {
      this.cursor = over;
      g.sfx('cursor');
    }
    if (inp.pressed('left') || inp.pressed('right') || inp.pressed('up') || inp.pressed('down')) {
      this.cursor ^= 1;
      g.sfx('cursor');
      return null;
    }
    if (inp.pressed('cancel') || inp.mouseRight) {
      g.sfx('cancel');
      return 'no';
    }
    const clicked = inp.mouseLeft && over >= 0;
    if (!inp.pressed('confirm') && !clicked) return null;
    if (clicked) this.cursor = over;
    g.sfx(this.cursor === 0 ? 'confirm' : 'cancel');
    return this.cursor === 0 ? 'yes' : 'no';
  }

  draw(ui: UI): void {
    const lines = ui.wrap(this.text, 368, 16), extra = (lines.length - 1) * LINE;
    ui.panel(120, 300 - extra, 400, 100 + extra, this.accent);
    lines.forEach((l, i) => ui.text(l, 320, 336 - extra + i * LINE, { size: 16, align: 'center' }));
    ui.menu([t('YES')], X[0], Y, this.cursor === 0 ? 0 : -1, OPT);
    ui.menu([t('NO')], X[1], Y, this.cursor === 1 ? 0 : -1, OPT);
  }
}
