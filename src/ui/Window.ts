import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { wrapPx } from '../graphics/Font';
import { isZh } from '../i18n';

/** Typewriter text box, FC style: black window, white rule, one letter per tick. */
export class MessageBox {
  private pages: string[][] = [];
  private shown = 0;
  private page = 0;
  private t = 0;

  constructor(private readonly cols = 28, private readonly rows = 3) {}

  get active(): boolean {
    return this.pages.length > 0;
  }

  get typing(): boolean {
    return this.active && this.shown < this.pageText().length;
  }

  get lastPage(): boolean {
    return this.page >= this.pages.length - 1;
  }

  /** Chinese lines are 13px tall, so the same box holds fewer of them. */
  private get lineH(): number {
    return isZh() ? 13 : 9;
  }

  set(text: string): void {
    const lines = wrapPx(text, this.cols * 8);
    const per = Math.max(1, Math.floor((this.rows * 9 + 2) / this.lineH));
    this.pages = [];
    for (let i = 0; i < lines.length; i += per) this.pages.push(lines.slice(i, i + per));
    this.page = 0;
    this.shown = 0;
    this.t = 0;
  }

  clear(): void {
    this.pages = [];
  }

  private pageText(): string {
    return (this.pages[this.page] ?? []).join('');
  }

  /** Returns true when a letter was revealed this tick (for the text blip). */
  update(fast = false): boolean {
    if (!this.typing) return false;
    this.t++;
    const step = fast ? 4 : 1;
    if (fast || this.t % 2 === 0) {
      this.shown = Math.min(this.pageText().length, this.shown + step);
      return this.t % 4 === 0;
    }
    return false;
  }

  /** Advance: finish typing, flip page, or close. Returns false once closed. */
  advance(): boolean {
    if (this.typing) {
      this.shown = this.pageText().length;
      return true;
    }
    if (!this.lastPage) {
      this.page++;
      this.shown = 0;
      return true;
    }
    this.pages = [];
    return false;
  }

  draw(r: PixelRenderer, x: number, y: number, w: number, frame: number): void {
    if (!this.active) return;
    const h = this.rows * 9 + 11;
    r.window(x, y, w, h);
    let left = this.shown;
    const lines = this.pages[this.page];
    lines.forEach((line, i) => {
      const part = line.slice(0, Math.max(0, left));
      left -= line.length;
      r.text(part, x + 8, y + (isZh() ? 8 : 6) + i * this.lineH, C.WHITE);
    });
    if (!this.typing && (frame >> 4) & 1) r.text(this.lastPage ? '·' : '↓', x + w - 14, y + h - 11, C.WHITE);
  }
}

/** Vertical menu with a flame cursor. */
export function drawMenu(r: PixelRenderer, items: string[], x: number, y: number, cursor: number, frame: number, gap = 12, disabled: boolean[] = []): void {
  if (isZh()) gap = Math.max(gap, 13);
  items.forEach((it, i) => {
    r.text(it, x + 12, y + i * gap, disabled[i] ? C.GRAY : C.WHITE);
    if (i === cursor && ((frame >> 3) & 3) !== 3) r.text('▶', x, y + i * gap, C.RED);
  });
}
