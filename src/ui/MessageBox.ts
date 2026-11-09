import { isZh } from '../i18n';
import { COL, UI } from './UI';

const BOX = { x: 40, y: 330, w: 560, h: 96 };
const SIZE = 17;

/** Typewriter dialogue box: pages of wrapped lines, revealed a few letters per tick. */
export class MessageBox {
  private pages: string[][] = [];
  private shown = 0;
  private page = 0;
  private t = 0;
  private raw: string | null = null;
  speaker = '';

  get active(): boolean {
    return this.pages.length > 0 || this.raw !== null;
  }

  get typing(): boolean {
    return this.active && this.shown < this.pageText().length;
  }

  get lastPage(): boolean {
    return this.page >= this.pages.length - 1;
  }

  private get lineH(): number {
    return isZh() ? 26 : 24;
  }

  /** Text is wrapped lazily on the first draw (it needs the UI fonts). */
  set(text: string, speaker = ''): void {
    this.raw = text;
    this.speaker = speaker;
    this.pages = [];
    this.page = 0;
    this.shown = 0;
    this.t = 0;
  }

  clear(): void {
    this.pages = [];
    this.raw = null;
  }

  private layout(ui: UI): void {
    if (this.raw === null) return;
    const lines = ui.wrap(this.raw, BOX.w - 48, SIZE);
    const per = 3;
    this.pages = [];
    for (let i = 0; i < lines.length; i += per) this.pages.push(lines.slice(i, i + per));
    this.raw = null;
  }

  private pageText(): string {
    return (this.pages[this.page] ?? ['…']).join('');
  }

  /** Returns true when letters were revealed this tick (for the text blip). */
  update(fast = false): boolean {
    if (!this.typing || this.pages.length === 0) return false;
    this.t++;
    this.shown = Math.min(this.pageText().length, this.shown + (fast ? 4 : 1));
    return this.t % 3 === 0;
  }

  /** Advance: finish typing, flip page, or close. Returns false once closed. */
  advance(): boolean {
    if (this.raw !== null) return true;
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

  draw(ui: UI): void {
    if (!this.active) return;
    this.layout(ui);
    const { x, y, w, h } = BOX;
    ui.panel(x, y, w, h);
    if (this.speaker) {
      const sw = ui.measure(this.speaker, 15, 700) + 28;
      ui.panel(x + 16, y - 16, sw, 26, COL.red);
      ui.text(this.speaker, x + 30, y + 3, { size: 15, weight: 700, color: COL.goldLight });
    }
    let left = this.shown;
    (this.pages[this.page] ?? []).forEach((line, i) => {
      const part = [...line].slice(0, Math.max(0, left)).join('');
      left -= [...line].length;
      ui.text(part, x + 24, y + 34 + i * this.lineH, { size: SIZE });
    });
    if (!this.typing && (ui.frame >> 4) & 1) ui.diamond(x + w - 22, y + h - 16, 5, this.lastPage ? COL.gray : COL.goldLight);
  }
}
