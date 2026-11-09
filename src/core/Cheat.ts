/** ↑↑↓↓←→←→ then B A: the test cheat that reveals the map and restores life. */
export const CHEAT_CODE = ['U', 'U', 'D', 'D', 'L', 'R', 'L', 'R', 'B', 'A'];
/** Ticks allowed between two presses (one second). */
export const CHEAT_GAP = 60;

/** Watches a stream of taps for the cheat code. */
export class CheatCode {
  private matched = 0;
  private last = -Infinity;

  /** Feed one tap made at logic tick `tick`; true when it completes the code. */
  feed(tap: string, tick: number): boolean {
    if (tick - this.last > CHEAT_GAP) this.matched = 0;
    this.last = tick;
    // the longest tail of what was typed that still starts the code (so ↑↑↑↓↓… counts)
    let seq = [...CHEAT_CODE.slice(0, this.matched), tap];
    while (seq.length && seq.some((c, i) => c !== CHEAT_CODE[i])) seq = seq.slice(1);
    this.matched = seq.length;
    if (this.matched < CHEAT_CODE.length) return false;
    this.matched = 0;
    return true;
  }
}
