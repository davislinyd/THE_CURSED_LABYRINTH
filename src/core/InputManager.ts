export type Button = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';

export const BUTTONS: Button[] = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];

const KEYMAP: Record<string, Button> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyX: 'a',
  KeyZ: 'b',
  Enter: 'start',
  NumpadEnter: 'start',
  ShiftLeft: 'select',
  ShiftRight: 'select',
};

/**
 * Latches raw key events and exposes them per fixed logic tick, so a tap that
 * starts and ends between two ticks is still seen exactly once.
 */
export class InputManager {
  private down = new Set<Button>();
  private latchPress = new Set<Button>();
  private pressedNow = new Set<Button>();
  private holdFrames = new Map<Button, number>();
  /** Fired on the first real user gesture (needed to unlock AudioContext). */
  onFirstGesture: (() => void) | null = null;
  onFullscreenKey: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat) {
        this.onFullscreenKey?.();
        return;
      }
      const b = KEYMAP[e.code];
      if (!b) return;
      e.preventDefault();
      this.gesture();
      if (e.repeat) return;
      this.press(b);
    });
    window.addEventListener('keyup', (e) => {
      const b = KEYMAP[e.code];
      if (!b) return;
      e.preventDefault();
      this.release(b);
    });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  press(b: Button): void {
    this.gesture();
    if (!this.down.has(b)) this.latchPress.add(b);
    this.down.add(b);
  }

  release(b: Button): void {
    this.down.delete(b);
  }

  clear(): void {
    this.down.clear();
    this.latchPress.clear();
    this.pressedNow.clear();
    this.holdFrames.clear();
  }

  /** Called once at the start of every 60 Hz logic tick. */
  tick(): void {
    this.pressedNow = this.latchPress;
    this.latchPress = new Set();
    for (const b of BUTTONS) {
      if (this.down.has(b) || this.pressedNow.has(b)) this.holdFrames.set(b, (this.holdFrames.get(b) ?? 0) + 1);
      else this.holdFrames.delete(b);
    }
  }

  held(b: Button): boolean {
    return this.down.has(b) || this.pressedNow.has(b);
  }

  pressed(b: Button): boolean {
    return this.pressedNow.has(b);
  }

  /** Swallow a press so the next scene does not also react to it. */
  consume(b: Button): void {
    this.pressedNow.delete(b);
  }

  consumeAll(): void {
    this.pressedNow.clear();
  }

  /** True on press, then every `rate` ticks after an initial `delay` while held. */
  repeat(b: Button, delay = 18, rate = 8): boolean {
    if (this.pressedNow.has(b)) return true;
    const f = this.holdFrames.get(b) ?? 0;
    return f > delay && (f - delay) % rate === 0;
  }

  frames(b: Button): number {
    return this.holdFrames.get(b) ?? 0;
  }

  bindTouchPad(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-btn]').forEach((el) => {
      const b = el.dataset.btn as Button;
      const on = (e: Event) => {
        e.preventDefault();
        this.press(b);
      };
      const off = (e: Event) => {
        e.preventDefault();
        this.release(b);
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    });
  }
}
